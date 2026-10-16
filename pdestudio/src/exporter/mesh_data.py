#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio - Mesh 数据提取

从 Blender Mesh 提取 PDE 引擎网格数据（Points/Normals/UV/Faces/蒙皮）。

关键对齐 (Maya 导出器 tc/editor/export/exportMesh.cpp):
    1. 坐标系转换: Blender Z-up → PDE Y-up (Points/Normals/Tangents/Binormals)
    2. UV 不翻转: 文本格式用 OpenGL V (V=0 底部)，PDE 加载器内部做 1-y
    3. 面绕序: CCW [0,1,2] (PDE 二进制和文本格式均使用 CCW，与 Maya/Blender 一致)
    4. 切线/副法线: 按面顶点顺序写入(不去重)，索引连续 0,1,2...
       原因: PDE 加载器用 v.id(面顶点序号) 直接索引 tangents 数组
    5. BlendIndices 1-based, 权重阈值 0.001
"""

import struct

import bpy
from mathutils import Vector

from ..log import get_module_logger
from .export_utils import (
    convert_position_to_pde,
    convert_direction_to_pde,
    get_armature_coord_mode,
)
from .mesh_lua_builder import assemble_mesh_lua

log = get_module_logger("MESH_DATA")

# 导入时保存切线/副法线所用的几何属性名（见 importer/core/mesh_builder.py）
NORMAL_ATTR = "pde_normal"
TANGENT_ATTR = "pde_tangent"
BINORMAL_ATTR = "pde_binormal"


def get_evaluated_mesh(obj, context, apply_modifiers=True):
    """获取对象的求值后 Mesh"""
    if apply_modifiers:
        depsgraph = context.evaluated_depsgraph_get()
        return obj.evaluated_get(depsgraph).to_mesh()
    return obj.data


def extract_mesh_data(
    obj, mesh, context,
    export_vertex_colors=False,
    export_tangents=True,
    uv_count=1,
    export_scale=1.0,
):
    """从 Blender Mesh 提取 PDE Mesh 数据

    保留原始多边形面（四边面/NGon），不做预三角化，
    让引擎 Mesh::Create 内部处理三角化。
    这与 Maya 导出器行为一致，且能减少边数，
    避免 PhysX 在大数据量下碰撞失效。
    """
    armature = _find_armature(obj)
    coord_mode = get_armature_coord_mode(armature) if armature else "zup"

    # 静态网格导出世界空间坐标。
    # 场景导入后 gate / 活动物体 / 据点等的位置写在 obj.location 上，
    # 不烘进顶点的话导出后会全部塌回原点。
    # 蒙皮网格顶点处于 rest 空间（由 Armature 修改器变形），不能烘世界变换。
    world_mat = obj.matrix_world.copy() if armature is None else None
    world_m3 = None
    if world_mat is not None and not _is_identity(world_mat):
        world_m3 = world_mat.to_3x3()

    # 优先使用导入时保存的原始切线/副法线，缺失时才重算。
    # calc_tangents 依赖 UV 层，且在 UV 接缝 / 镜像 / 硬边处与原始值不同。
    stored_tangents = None
    stored_binormals = None
    if export_tangents:
        stored_tangents = _read_corner_attr(mesh, TANGENT_ATTR, obj)
        stored_binormals = _read_corner_attr(mesh, BINORMAL_ATTR, obj)
        if not (stored_tangents and stored_binormals
                and len(stored_tangents) >= len(mesh.loops)
                and len(stored_binormals) >= len(mesh.loops)):
            stored_tangents = None
            stored_binormals = None

    if export_tangents and stored_tangents is None:
        # 切线/副法线在引擎中绑定 UV0 (map[0])，
        # 必须使用第一个 UV 层计算，而非 active 层
        if mesh.uv_layers:
            mesh.calc_tangents(uvmap=mesh.uv_layers[0].name)
        else:
            log.warning("无 UV 层且无已保存切线/副法线，跳过切线导出")

    is_skinned, joints, blend_counts, blend_indices, blend_weights = \
        _extract_skin_data(obj, mesh, armature)

    # 始终导出3套UV（引擎StreamStatic固定有uv0/uv1/uv2三个槽位）
    # Blender中缺少的UV层用None占位，导出为空UVSet
    uv_layers = []
    for i in range(3):
        if i < len(mesh.uv_layers):
            uv_layers.append(mesh.uv_layers[i])
        else:
            uv_layers.append(None)

    color_layer = None
    if export_vertex_colors and mesh.color_attributes and mesh.color_attributes.active_color:
        color_layer = mesh.color_attributes.active_color

    # Points (世界变换 + 坐标转换 + 缩放)
    points_list = []
    for v in mesh.vertices:
        co = world_mat @ v.co if world_mat is not None else v.co
        px, py, pz = convert_position_to_pde(co, coord_mode)
        points_list.append([round(px * export_scale, 6),
                            round(py * export_scale, 6),
                            round(pz * export_scale, 6)])

    # Normals (优先用导入时保存的原始法线，按 loop 去重)
    stored_normals = _read_corner_attr(mesh, NORMAL_ATTR, obj)
    if stored_normals and len(stored_normals) < len(mesh.loops):
        stored_normals = None
    normals_list, normal_map = _collect_normals(
        mesh, coord_mode, world_m3, stored_normals)

    # UV (不翻转 V, 按 loop 去重)
    uv_data_per_set, uv_values_per_set = _collect_uvs(uv_layers)

    # Tangents/Binormals (按 loop 收集, 不去重)
    loop_tangents, loop_binormals = _collect_tangents(
        mesh, export_tangents, coord_mode, world_m3,
        stored_tangents, stored_binormals)

    # Colors
    colors_list, color_map = ([], {})
    if export_vertex_colors and color_layer:
        colors_list, color_map = _collect_colors(mesh, color_layer)

    # 构建面数据（遍历多边形面，保留原始拓扑）
    result = _build_face_data(
        mesh, is_skinned, joints, blend_counts, blend_indices, blend_weights,
        normal_map, uv_data_per_set, uv_layers, loop_tangents, loop_binormals,
        color_map, export_tangents, export_vertex_colors,
    )

    # 组装 Lua 表
    mesh_lua = assemble_mesh_lua(
        points_list, normals_list, result, uv_layers, uv_values_per_set,
        export_tangents, export_vertex_colors, colors_list, is_skinned,
    )

    return {
        "mesh_data": mesh_lua,
        "joints": joints if is_skinned else [],
        "is_skinned": is_skinned,
    }


def _find_armature(obj):
    """查找 Mesh 对象关联的 Armature"""
    if obj.parent and obj.parent.type == 'ARMATURE':
        return obj.parent
    for mod in obj.modifiers:
        if mod.type == 'ARMATURE' and mod.object:
            return mod.object
    return None


def _extract_skin_data(obj, mesh, armature):
    """提取蒙皮权重数据 (BlendIndices 1-based, 权重阈值 0.001)"""
    if not armature or not obj.vertex_groups:
        return False, [], [], [], []

    joints = [bone.name for bone in armature.data.bones]
    blend_counts, blend_indices, blend_weights = [], [], []

    for v in mesh.vertices:
        groups = []
        for g in v.groups:
            if g.group < len(obj.vertex_groups):
                vg = obj.vertex_groups[g.group]
                if vg.name in joints and g.weight > 0.001:
                    groups.append((joints.index(vg.name), g.weight))

        groups.sort(key=lambda x: x[1], reverse=True)
        groups = groups[:4]

        total = sum(w for _, w in groups)
        if total > 0:
            groups = [(idx, w / total) for idx, w in groups]

        blend_counts.append(len(groups))
        blend_indices.append([idx + 1 for idx, _ in groups])
        blend_weights.append([round(w, 6) for _, w in groups])

    return True, joints, blend_counts, blend_indices, blend_weights


def _half(v: float) -> float:
    """量化到 half(float16) 精度

    引擎最终以 FLOAT16_4 存储法线（StreamStatic/StreamSkin）。
    导入时 half→float、导出时再 float→half 会引入 ~1e-5 的往返误差，
    使本应相同的法线被判为不同值、拿到不同索引，导致顶点无法焊接。
    量化后相同的 half 值必然得到相同的 float，焊接键恢复一致。
    """
    try:
        return struct.unpack('<e', struct.pack('<e', v))[0]
    except (OverflowError, struct.error):
        return v


def _collect_normals(mesh, coord_mode, world_m3=None, stored_normals=None):
    """收集法线（世界旋转 + 方向转换，按 loop 去重）

    stored_normals 是导入时从二进制顶点缓冲还原的原始法线
    （见 importer/core/mesh_builder.py:_store_vertex_vectors）。
    存在时优先使用——Blender 的 custom split normal 回读存在精度漂移，
    同一顶点的不同 loop 会得到 ~1e-5 的差异，进而拿到不同的法线索引，
    使引擎的顶点焊接键分裂、顶点数膨胀。使用原始值可完全避免。
    """
    normals_list = []
    normal_dedup = {}
    normal_map = {}

    for loop in mesh.loops:
        if stored_normals is not None and loop.index < len(stored_normals):
            n_dir = _xform_dir(world_m3, stored_normals[loop.index])
        else:
            n_dir = _xform_dir(world_m3, loop.normal)
        nx, ny, nz = convert_direction_to_pde(n_dir, coord_mode)
        n = (_half(nx), _half(ny), _half(nz))
        if n not in normal_dedup:
            normal_dedup[n] = len(normals_list)
            normals_list.append(list(n))
        normal_map[loop.index] = normal_dedup[n]

    return normals_list, normal_map


def _collect_uvs(uv_layers):
    """收集 UV（不翻转 V，按 loop 去重）

    PDE 文本格式使用 OpenGL V (V=0 底部，同 Maya/Blender)。
    PDE 加载器内部做 1-y 转换为 DirectX。

    None UV 层（占位）生成空数据，引擎会创建空UVSet，
    BuildStreamStatic 中 uv 默认填 (0.5, 0.5)。
    """
    uv_data_per_set = []
    uv_values_per_set = []

    for uv_layer in uv_layers:
        if uv_layer is None:
            # 空占位UVSet：每个loop的UV索引指向0，UV值为(0,0)
            uv_data_per_set.append({})
            uv_values_per_set.append([])
            continue

        uv_map = {}
        uv_values = []
        loop_to_uv = {}

        for loop_idx in range(len(uv_layer.data)):
            uv = uv_layer.data[loop_idx].uv
            # 与法线同理：UV 最终以 FLOAT16_2 存储，量化到 half 后再去重，
            # 消除 float 往返误差导致的"本应相同却拿到不同索引"。
            uv_key = (_half(uv[0]), _half(uv[1]))
            if uv_key not in uv_map:
                uv_map[uv_key] = len(uv_values)
                uv_values.append(list(uv_key))
            loop_to_uv[loop_idx] = uv_map[uv_key]

        uv_data_per_set.append(loop_to_uv)
        uv_values_per_set.append(uv_values)

    return uv_data_per_set, uv_values_per_set


def _collect_tangents(mesh, export_tangents, coord_mode, world_m3=None,
                      stored_tangents=None, stored_binormals=None):
    """收集切线/副法线（世界旋转 + 方向转换，按 loop 存储，不去重）

    PDE 加载器用面顶点序号直接索引 tangents 数组 (MeshResource.cpp:1093)，
    因此切线必须按面顶点顺序写入，不能去重。

    stored_tangents / stored_binormals 为导入时从二进制顶点缓冲还原的原始值
    （importer/core/mesh_builder.py:_store_tangents）。存在时直接使用，
    避免 calc_tangents 重算在 UV 接缝 / 镜像 / 硬边处引入偏差。
    """
    if not export_tangents:
        return {}, {}

    loop_tangents = {}
    loop_binormals = {}

    if stored_tangents is not None and stored_binormals is not None:
        for loop in mesh.loops:
            tx, ty, tz = convert_direction_to_pde(
                _xform_dir(world_m3, stored_tangents[loop.index]), coord_mode)
            loop_tangents[loop.index] = [round(tx, 6), round(ty, 6), round(tz, 6)]

            bx, by, bz = convert_direction_to_pde(
                _xform_dir(world_m3, stored_binormals[loop.index]), coord_mode)
            loop_binormals[loop.index] = [round(bx, 6), round(by, 6), round(bz, 6)]

        log.debug(f"  使用已保存的切线/副法线: {len(loop_tangents)} loops")
        return loop_tangents, loop_binormals

    for loop in mesh.loops:
        tx, ty, tz = convert_direction_to_pde(
            _xform_dir(world_m3, loop.tangent), coord_mode)
        loop_tangents[loop.index] = [round(tx, 6), round(ty, 6), round(tz, 6)]

        bx, by, bz = convert_direction_to_pde(
            _xform_dir(world_m3, loop.bitangent), coord_mode)
        loop_binormals[loop.index] = [round(bx, 6), round(by, 6), round(bz, 6)]

    return loop_tangents, loop_binormals


def _is_identity(mat, eps: float = 1e-6) -> bool:
    """判断 4x4 矩阵是否为单位矩阵"""
    for r in range(4):
        for c in range(4):
            v = mat[r][c]
            if abs(v - (1.0 if r == c else 0.0)) > eps:
                return False
    return True


def _xform_dir(mat3, vec) -> tuple:
    """用 3x3 矩阵旋转方向向量并归一化（缩放不影响方向）"""
    if mat3 is None:
        return (vec[0], vec[1], vec[2])
    r = mat3 @ Vector((vec[0], vec[1], vec[2]))
    length = r.length
    if length < 1e-8:
        return (vec[0], vec[1], vec[2])
    return (r.x / length, r.y / length, r.z / length)


def _read_corner_attr(mesh, name: str, obj=None):
    """读取 CORNER 域 FLOAT_VECTOR 几何属性

    求值后的 mesh (obj.evaluated_get().to_mesh()) 可能不携带 ID property，
    但会继承几何属性；仍失败时回退到原始 obj.data。

    Returns:
        [(x, y, z), ...] 按 loop 顺序，或 None
    """
    sources = [mesh]
    if obj is not None and getattr(obj, "data", None) is not None:
        sources.append(obj.data)

    for src in sources:
        attr = src.attributes.get(name)
        if attr is None or attr.domain != 'CORNER':
            continue
        count = len(attr.data)
        if count == 0:
            continue
        flat = [0.0] * (count * 3)
        try:
            attr.data.foreach_get("vector", flat)
        except Exception:
            continue
        return [tuple(flat[i * 3:i * 3 + 3]) for i in range(count)]

    return None


def _collect_colors(mesh, color_layer):
    """收集顶点色"""
    colors_list = []
    color_map = {}

    for loop_idx, loop in enumerate(mesh.loops):
        try:
            if color_layer.domain == 'CORNER':
                color = color_layer.data[loop_idx].color
            else:
                color = color_layer.data[loop.vertex_index].color
            c = (round(color[0], 6), round(color[1], 6),
                 round(color[2], 6), round(color[3], 6))
        except Exception:
            c = (1.0, 1.0, 1.0, 1.0)

        if c not in color_map:
            color_map[c] = len(colors_list)
            colors_list.append(list(c))
        color_map[loop_idx] = color_map[c]

    return colors_list, color_map


def _build_face_data(mesh, is_skinned, joints, blend_counts, blend_indices,
                     blend_weights, normal_map, uv_data_per_set, uv_layers,
                     loop_tangents, loop_binormals, color_map,
                     export_tangents, export_vertex_colors):
    """遍历多边形面构建 PDE Face 数据

    保留原始多边形拓扑（四边面/NGon），不预三角化。
    引擎 Mesh::Create 接受任意面顶点数，内部构建边表。
    FaceTriangles 使用面内局部索引（扇形三角化），
    与引擎 Mesh::Triangulate() 无参数版本的逻辑一致。

    切线/副法线按面顶点顺序追加（不去重），索引连续 0,1,2...
    面绕序: CCW (文本格式与 Maya 一致)
    """
    face_vertex_count = []
    face_vertices = []
    face_vertex_normals = []
    face_triangle_count = []
    face_triangles = []
    face_materials = []
    face_vertex_uv_per_set = [[] for _ in range(len(uv_layers))]
    tangent_values_per_fv = [] if export_tangents else None
    binormal_values_per_fv = [] if export_tangents else None
    face_vertex_tangent_indices = [] if export_tangents else None
    face_vertex_colors = [] if export_vertex_colors else None
    flat_bc = [] if is_skinned else None
    flat_bi = [] if is_skinned else None
    flat_bw = [] if is_skinned else None

    tangent_seq = 0

    for poly in mesh.polygons:
        vert_count = len(poly.vertices)
        tri_count = vert_count - 2

        face_vertex_count.append(vert_count)
        face_triangle_count.append(tri_count)
        face_materials.append(poly.material_index)

        # 扇形三角化：局部索引 [0,1,2, 0,2,3, 0,3,4, ...]
        for i in range(tri_count):
            face_triangles.extend([0, i + 1, i + 2])

        # 遍历面顶点（loop）
        for i in range(vert_count):
            loop_idx = poly.loop_start + i
            vert_idx = mesh.loops[loop_idx].vertex_index

            face_vertices.append(vert_idx)
            face_vertex_normals.append(normal_map[loop_idx])

            for s in range(len(uv_layers)):
                if loop_idx in uv_data_per_set[s]:
                    face_vertex_uv_per_set[s].append(uv_data_per_set[s][loop_idx])

            if export_tangents and tangent_values_per_fv is not None:
                tangent_values_per_fv.append(loop_tangents.get(loop_idx, [0, 0, 0]))
                binormal_values_per_fv.append(loop_binormals.get(loop_idx, [0, 0, 0]))
                face_vertex_tangent_indices.append(tangent_seq)
                tangent_seq += 1

            if export_vertex_colors and face_vertex_colors is not None:
                face_vertex_colors.append(color_map.get(loop_idx, -1))

            if is_skinned and flat_bc is not None:
                bc = blend_counts[vert_idx] if vert_idx < len(blend_counts) else 0
                bi = blend_indices[vert_idx] if vert_idx < len(blend_indices) else []
                bw = blend_weights[vert_idx] if vert_idx < len(blend_weights) else []
                flat_bc.append(bc)
                flat_bi.extend(bi)
                flat_bw.extend(bw)

    return {
        "face_vertex_count": face_vertex_count,
        "face_vertices": face_vertices,
        "face_vertex_normals": face_vertex_normals,
        "face_triangle_count": face_triangle_count,
        "face_triangles": face_triangles,
        "face_materials": face_materials,
        "face_vertex_uv_per_set": face_vertex_uv_per_set,
        "tangent_values_per_fv": tangent_values_per_fv,
        "binormal_values_per_fv": binormal_values_per_fv,
        "face_vertex_tangent_indices": face_vertex_tangent_indices,
        "face_vertex_colors": face_vertex_colors,
        "flat_blend_counts": flat_bc,
        "flat_blend_indices": flat_bi,
        "flat_blend_weights": flat_bw,
    }
