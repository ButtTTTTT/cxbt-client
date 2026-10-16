#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio - Blender Mesh 导入器

将 PDEMesh 数据转为 Blender Mesh 对象。

坐标系策略: 保持 Y-up 不做转换
  PDE 引擎是 Y-up（与 Maya 一致），位置直接使用 (x, y, z)。
  与 skeleton_builder.py 和 animation_builder.py 保持一致，确保蒙皮正确。

材质创建和贴图加载拆分到:
    material.py - 材质创建 + 自定义属性存储 + 贴图路径解析
"""

import bpy
from typing import Optional, List

from ..binary.mesh import PDEMesh, PDEPrimitive
from ..coordinate import convert_position, convert_direction
from .material import create_blender_material, store_primitive_props
from ...log import get_module_logger

log = get_module_logger("MESH_IMP")


def _create_placeholder_armature(bone_names: List[str], name: str = "PDE_Armature"):
    """从骨骼名列表创建占位 Armature（无骨骼层级/位置信息）

    当找不到 .skel 文件时，用 mesh 中嵌入的骨骼名创建一个基础 Armature，
    这样顶点组+权重仍然可以正确绑定。用户后续可以手动导入 .skel 替换。
    """
    arm_data = bpy.data.armatures.new(name)
    arm_obj = bpy.data.objects.new(name, arm_data)
    bpy.context.collection.objects.link(arm_obj)

    bpy.context.view_layer.objects.active = arm_obj
    arm_obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')

    for bone_name in bone_names:
        bone = arm_data.edit_bones.new(bone_name)
        bone.head = (0, 0, 0)
        bone.tail = (0, 0, 0.05)

    bpy.ops.object.mode_set(mode='OBJECT')
    arm_obj.select_set(False)

    log.info(f"创建占位骨骼: {name}, {len(bone_names)} 个骨骼")
    return arm_obj


def _pde_pos_to_blender(pos: tuple, coord_mode: str = "zup") -> tuple:
    """将 PDE 位置转换为 Blender 位置"""
    return convert_position(pos, coord_mode)


def import_mesh_to_blender(
    mesh_data: PDEMesh,
    name: str = "PDE_Mesh",
    scale: float = 1.0,
    armature_obj: Optional[bpy.types.Object] = None,
    vfs_root: str = "",
    coord_mode: str = "zup",
) -> Optional[bpy.types.Object]:
    """将 PDEMesh 导入为 Blender Mesh 对象

    - 单 Prim: 直接创建一个 Mesh 对象
    - 多 Prim: 每个 Prim 创建独立 Mesh 对象，放在空对象作为父节点下

    Args:
        mesh_data: PDE 网格数据
        name: Mesh 对象名称
        scale: 位置缩放因子（默认1.0，PDE 游戏单位=米）
        armature_obj: 蒙皮网格关联的 Armature 对象
        vfs_root: VFS 根目录路径（用于查找贴图文件）
        coord_mode: "zup" 或 "yup"

    Returns:
        Blender Mesh 对象（单 Prim）或父 Empty 对象（多 Prim）
    """
    if not mesh_data.primitives:
        log.warning("无 Primitive 数据")
        return None

    # 同名对象去重
    original_name = name
    counter = 1
    while name in bpy.data.objects:
        name = f"{original_name}.{counter:03d}"
        counter += 1
    if name != original_name:
        log.info(f"对象名已存在，使用新名称: {name}")

    multi_prim = len(mesh_data.primitives) > 1

    parent_obj = None
    if multi_prim:
        parent_obj = bpy.data.objects.new(name, None)
        parent_obj.empty_display_size = 1.0
        parent_obj.empty_display_type = 'PLAIN_AXES'
        bpy.context.collection.objects.link(parent_obj)
        log.info(f"多 Prim 场景: {name}, {len(mesh_data.primitives)} 个子物体")

    main_obj = None

    for prim_idx, prim in enumerate(mesh_data.primitives):
        prim_obj = _create_prim_object(
            mesh_data, prim, prim_idx, name, scale, coord_mode, multi_prim)

        # 创建材质
        if prim.material:
            mat = create_blender_material(prim.material, vfs_root)
            if mat:
                prim_obj.data.materials.append(mat)

        # 存储 Primitive 级属性到对象自定义属性（导出时读取）
        phys_mat = 0
        if hasattr(mesh_data, 'physical_materials'):
            pm_list = mesh_data.physical_materials
            if 0 <= prim_idx < len(pm_list):
                phys_mat = pm_list[prim_idx]
        store_primitive_props(prim_obj, prim, phys_mat)
        prim_obj["pde_prim_index"] = prim_idx

        if multi_prim:
            prim_obj.parent = parent_obj

        # 蒙皮处理
        if mesh_data.mesh_type == 2 and mesh_data.bone_names:
            armature_obj = _setup_skinning(
                prim_obj, parent_obj, mesh_data, prim_idx,
                armature_obj, name, coord_mode, multi_prim)

        if main_obj is None:
            main_obj = prim_obj

        _log_prim_info(prim_idx, prim_obj.name, prim)

    result = parent_obj if multi_prim else main_obj
    total_v = sum(p.vertex_count for p in mesh_data.primitives)
    total_t = sum(p.primitive_count for p in mesh_data.primitives)
    log.info(f"导入网格: {name}, {total_v} 顶点, {total_t} 三角形, {len(mesh_data.primitives)} 个子物体")
    return result


def _create_prim_object(mesh_data, prim, prim_idx, name, scale, coord_mode, multi_prim):
    """创建单个 Primitive 的 Blender Mesh 对象

    导入顶点坐标、法线、顶点色、UV 数据。
    法线和顶点色从二进制顶点缓冲中解析后写入 Blender mesh，
    确保导入后视觉与引擎一致，导出时能还原原始数据。
    """
    verts = []
    normals = []
    colors = []
    uvs0 = []
    uvs1 = []
    uvs2 = []
    if mesh_data.mesh_type == 1:  # kStatic
        for v in prim.vertices_static:
            bx, by, bz = _pde_pos_to_blender(v.position, coord_mode)
            verts.append((bx * scale, by * scale, bz * scale))
            nx, ny, nz = convert_direction(v.normal[:3], coord_mode)
            normals.append((nx, ny, nz))
            uvs0.append(v.uv0)
            uvs1.append(v.uv1)
            uvs2.append(v.uv2)
            colors.append(_argb_to_rgba(v.color))
    else:  # kSkin
        for v in prim.vertices_skin:
            bx, by, bz = _pde_pos_to_blender(v.position, coord_mode)
            verts.append((bx * scale, by * scale, bz * scale))
            nx, ny, nz = convert_direction(v.normal[:3], coord_mode)
            normals.append((nx, ny, nz))
            uvs0.append(v.uv0)
            uvs1.append(v.uv1)
            uvs2.append(None)  # Skin格式无uv2
            # Skin格式无顶点色字段
            colors.append(None)

    # 面绕序: PDE 和 Blender 都使用 CCW，直接使用原始索引顺序
    faces = []
    for i in range(0, len(prim.indices), 3):
        if i + 2 < len(prim.indices):
            faces.append((prim.indices[i], prim.indices[i + 1], prim.indices[i + 2]))

    if multi_prim:
        prim_obj_name = f"{prim_idx}_{name}_{_derive_prim_name(prim, prim_idx)}"
    else:
        prim_obj_name = f"{prim_idx}_{name}"

    prim_mesh = bpy.data.meshes.new(prim_obj_name)
    prim_obj = bpy.data.objects.new(prim_obj_name, prim_mesh)
    bpy.context.collection.objects.link(prim_obj)

    prim_mesh.from_pydata(verts, [], faces)
    prim_mesh.update()

    # 法线: 将二进制中解析的法线写入 Blender mesh
    _apply_normals(prim_mesh, normals)

    # 顶点色: 将 ARGB 转为 RGBA 写入 color_attributes
    _apply_vertex_colors(prim_mesh, colors)

    # 法线/切线/副法线: 从二进制顶点缓冲还原并保存（导出时直接取用）
    _store_vertex_vectors(prim_mesh, mesh_data, prim, coord_mode)

    # UV0 (V翻转: PDE DirectX → Blender OpenGL)
    if uvs0:
        uv_layer = prim_mesh.uv_layers.new(name="UVMap")
        for loop in prim_mesh.loops:
            vi = loop.vertex_index
            if vi < len(uvs0):
                u, v = uvs0[vi]
                uv_layer.data[loop.index].uv = (u, 1.0 - v)

    # UV1
    uv1_has_data = any(uv1[0] != 0.0 or uv1[1] != 0.0 for uv1 in uvs1) if uvs1 else False
    if uvs1 and uv1_has_data:
        uv_layer1 = prim_mesh.uv_layers.new(name="UVMap1")
        for loop in prim_mesh.loops:
            vi = loop.vertex_index
            if vi < len(uvs1):
                u, v = uvs1[vi]
                uv_layer1.data[loop.index].uv = (u, 1.0 - v)

    # UV2 (仅静态mesh有uv2)
    uv2_valid = [uv for uv in uvs2 if uv is not None]
    uv2_has_data = any(uv[0] != 0.0 or uv[1] != 0.0 for uv in uv2_valid) if uv2_valid else False
    if uv2_valid and uv2_has_data:
        uv_layer2 = prim_mesh.uv_layers.new(name="UVMap2")
        for loop in prim_mesh.loops:
            vi = loop.vertex_index
            if vi < len(uvs2) and uvs2[vi] is not None:
                u, v = uvs2[vi]
                uv_layer2.data[loop.index].uv = (u, 1.0 - v)

    return prim_obj


def _setup_skinning(prim_obj, parent_obj, mesh_data, prim_idx,
                    armature_obj, name, coord_mode, multi_prim):
    """设置蒙皮：顶点组、权重、Armature 修改器、父对象"""
    if armature_obj is None:
        arm_name = f"{name}_armature"
        armature_obj = _create_placeholder_armature(mesh_data.bone_names, arm_name)

    _apply_skin_weights(prim_obj, mesh_data, mesh_data.bone_names, prim_idx)

    arm_coord_mode = armature_obj.get("pde_coord_mode", None)
    if arm_coord_mode and arm_coord_mode != coord_mode:
        log.warning(
            f"坐标系不匹配! 骨骼={arm_coord_mode}, 网格={coord_mode}. "
            f"模型可能扭曲! 请确保骨骼和模型使用相同坐标系模式")

    mod = prim_obj.modifiers.new(name="Armature", type='ARMATURE')
    mod.object = armature_obj

    # matrix_parent_inverse 确保网格顶点在 armature 局部空间正确定位
    if not multi_prim:
        prim_obj.parent = armature_obj
        prim_obj.matrix_parent_inverse = armature_obj.matrix_world.inverted()
    else:
        parent_obj.parent = armature_obj
        parent_obj.matrix_parent_inverse = armature_obj.matrix_world.inverted()

    return armature_obj


def _apply_skin_weights(
    obj: bpy.types.Object,
    mesh_data: PDEMesh,
    bone_names: List[str],
    prim_idx: int = -1,
):
    """为蒙皮网格创建顶点组并设置权重"""
    for bone_name in bone_names:
        if bone_name not in obj.vertex_groups:
            obj.vertex_groups.new(name=bone_name)

    if prim_idx >= 0:
        prims = [mesh_data.primitives[prim_idx]]
    else:
        prims = mesh_data.primitives

    vert_idx = 0
    for prim in prims:
        for v in prim.vertices_skin:
            for j in range(4):
                bone_idx = v.blend_indices[j]
                weight = v.blend_weight[j]
                if bone_idx < len(bone_names) and weight > 0.0001:
                    vg = obj.vertex_groups.get(bone_names[bone_idx])
                    if vg:
                        vg.add([vert_idx], weight, 'REPLACE')
            vert_idx += 1


def _derive_prim_name(prim: PDEPrimitive, prim_idx: int) -> str:
    """根据 Primitive 的材质信息推导子物体名称

    优先级: ColorMap贴图名 > PS shader名 > 索引编号
    """
    if prim.material and prim.material.texture_uniform:
        for lod_textures in prim.material.texture_uniform:
            for tex in lod_textures:
                if tex['type_name'] in ('ColorMap', 'DiffuseMap'):
                    basename = tex['path'].split('/')[-1]
                    name = basename.replace('.dds', '').replace('.tga', '')
                    for suffix in ('_d', '_c'):
                        if name.endswith(suffix) and len(name) > len(suffix) + 1:
                            name = name[:-len(suffix)]
                            break
                    return name

        if prim.material.pixel_shaders:
            ps = prim.material.pixel_shaders[0]
            ps_name = ps.replace('s_', '').replace('_lod_0', '').replace('_lod_1', '').replace('_lod_2', '')
            if ps_name:
                return ps_name

    return f"prim{prim_idx}"


def _log_prim_info(prim_idx: int, prim_obj_name: str, prim):
    """记录 Primitive 信息到日志"""
    if prim.vertex_count > 0:
        log.info(f"  Prim {prim_idx}: {prim_obj_name}, {prim.vertex_count} 顶点, {prim.primitive_count} 三角形")
    else:
        log.info(f"  Prim {prim_idx}: {prim_obj_name}, 0 顶点")


# =============================================================================
# 顶点数据写入辅助
# =============================================================================

def _argb_to_rgba(argb: int) -> tuple:
    """将 PDE ARGB 整数转为 RGBA float 元组

    引擎格式: ARGB (A=高字节, R, G, B=低字节)
    Blender 格式: RGBA float (0.0-1.0)

    引擎默认值: ARGB(255,255,255,255) = 0xFFFFFFFF (白色不透明)
    引擎空值: -1 或 0 → 同样视为白色不透明
    """
    if argb is None or argb < 0:
        return (1.0, 1.0, 1.0, 1.0)
    a = ((argb >> 24) & 0xFF) / 255.0
    r = ((argb >> 16) & 0xFF) / 255.0
    g = ((argb >> 8) & 0xFF) / 255.0
    b = (argb & 0xFF) / 255.0
    return (r, g, b, a)


def _apply_normals(mesh, normals: list):
    """将解析的法线写入 Blender mesh 的 custom normal

    引擎二进制顶点缓冲中法线按顶点存储 (half4)。
    Blender 中法线按 loop 存储，需要按顶点索引展开到 loop 级别。

    必须在 from_pydata + update 之后调用。
    使用 normals_split_custom_set 写入自定义法线，确保导入后光照与引擎一致。

    兼容性说明:
        - Blender 4.0 及更早: 需要 mesh.use_custom_edge_normals = True
        - Blender 4.1+: use_auto_smooth / use_custom_edge_normlas 已移除
        - Blender 5.2+: normals_split_custom_set 接受 Vector/tuple 列表，
          不再接受 flat float 列表
    """
    if not normals:
        return
    try:
        # 构建按 loop 的法线列表 (每项一个 tuple/Vector)
        loop_normals = []
        for loop in mesh.loops:
            vi = loop.vertex_index
            if vi < len(normals):
                nx, ny, nz = normals[vi]
            else:
                nx, ny, nz = 0.0, 0.0, 1.0
            loop_normals.append((float(nx), float(ny), float(nz)))

        # Blender 4.0 及更早需要显式启用 custom edge normals
        if hasattr(mesh, 'use_custom_edge_normals'):
            mesh.use_custom_edge_normals = True

        # 写入自定义法线 (Blender 5.2 需要 tuple/Vector 列表)
        mesh.normals_split_custom_set(loop_normals)

        # 所有面设置为 smooth shading，否则 custom normal 不会生效
        for poly in mesh.polygons:
            poly.use_smooth = True

        log.debug(f"  法线写入成功: {len(loop_normals)} loops")
    except Exception as e:
        log.warning(f"  法线写入失败，使用 Blender 自动法线: {e}")


def _apply_vertex_colors(mesh, colors: list):
    """将解析的顶点色写入 Blender mesh 的 color_attributes

    引擎二进制格式中顶点色是 ARGB 整数，按顶点存储。
    Blender color_attributes 按 loop (面顶点) 存储，需要按顶点索引展开。

    必须在 from_pydata + update 之后调用。
    """
    valid_colors = [c for c in colors if c is not None]
    if not valid_colors:
        return
    # 检查是否全部为默认白色（无需创建）
    if all(c == (1.0, 1.0, 1.0, 1.0) for c in valid_colors):
        return
    try:
        attr = mesh.color_attributes.new(
            name="Color", type='BYTE_COLOR', domain='CORNER')
        for loop in mesh.loops:
            vi = loop.vertex_index
            if vi < len(colors) and colors[vi] is not None:
                r, g, b, a = colors[vi]
            else:
                r, g, b, a = 1.0, 1.0, 1.0, 1.0
            attr.data[loop.index].color = (r, g, b, a)
    except Exception as e:
        log.warning(f"  顶点色写入失败: {e}")


def _store_vertex_vectors(mesh, mesh_data, prim, coord_mode: str):
    """将二进制顶点缓冲中的法线/切线/副法线按 loop 保存到几何属性

    PDE 二进制顶点缓冲是"展开后"的（每个面顶点一个条目），
    索引缓冲 prim.indices 的第 n 项即对应第 n 个 loop，
    因此 loop n 的向量 = vertices[indices[n]]。

    Blender 没有 tangent 通道，且 custom split normal 回读时存在精度漂移
    （同一顶点的不同 loop 会得到 ~1e-5 的差异），会让导出时的顶点焊接键
    分裂、顶点数膨胀。故此处把三者都存成 CORNER 域 FLOAT_VECTOR 属性，
    导出时直接取用，保证与原始二进制逐位一致。

    注意: 必须在 from_pydata 之后调用（依赖 mesh.loops 数量）。
    """
    is_static = (mesh_data.mesh_type == 1)
    src = prim.vertices_static if is_static else prim.vertices_skin
    if not src or not prim.indices:
        return

    n_loops = len(mesh.loops)
    if len(prim.indices) < n_loops:
        log.warning(
            f"  索引数({len(prim.indices)}) < loop 数({n_loops})，跳过向量还原")
        return

    normals = []
    tangents = []
    binormals = []
    zero = (0.0, 0.0, 0.0)

    for loop_idx in range(n_loops):
        vi = prim.indices[loop_idx]
        if vi >= len(src):
            vi = loop_idx
        if vi >= len(src):
            normals.append(zero)
            tangents.append(zero)
            binormals.append(zero)
            continue
        v = src[vi]
        normals.append(convert_direction(v.normal[:3], coord_mode))
        tangents.append(convert_direction(v.tangent[:3], coord_mode))
        binormals.append(convert_direction(v.binormal[:3], coord_mode))

    _write_corner_vec_attr(mesh, "pde_normal", normals)
    _write_corner_vec_attr(mesh, "pde_tangent", tangents)
    _write_corner_vec_attr(mesh, "pde_binormal", binormals)
    log.debug(f"  法线/切线/副法线保存: {n_loops} loops")


def _write_corner_vec_attr(mesh, name: str, values: list):
    """写入 CORNER 域 FLOAT_VECTOR 几何属性"""
    if not values:
        return
    try:
        existing = mesh.attributes.get(name)
        if existing is not None:
            mesh.attributes.remove(existing)

        attr = mesh.attributes.new(name=name, type='FLOAT_VECTOR',
                                   domain='CORNER')
        flat = [c for vec in values for c in vec]
        if len(flat) != len(attr.data) * 3:
            log.warning(
                f"  {name} 数据量不匹配 ({len(flat)} vs {len(attr.data) * 3})，跳过")
            return
        attr.data.foreach_set("vector", flat)
    except Exception as e:
        log.warning(f"  {name} 写入失败: {e}")
