#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio - 材质创建器

从 PDE 材质数据创建 Blender 材质，并将完整数据存储到自定义属性。

存储策略:
    - mat["pde_material"]     — 完整 PDE 材质数据（导出时优先读取）
    - mat["pde_vertex_shaders"] — 兼容旧版导出器
    - mat["pde_pixel_shaders"]  — 兼容旧版导出器
    - obj["pde_primitive"]    — Primitive 级属性（layer/cull/blend/visible/collision）

贴图节点仅用于 Blender 视觉预览，导出以自定义属性为准。
"""

import os
import bpy
from typing import Optional

from ..binary.mesh import PDEPrimitive
from ...log import get_module_logger

log = get_module_logger("MAT_CREATOR")


def _derive_material_name(pde_mat) -> str:
    """从 PDE 材质数据推导材质名称

    优先级: ColorMap 贴图名 > PixelShader 名 > 'pde_default'
    """
    if pde_mat.texture_uniform:
        for lod_textures in pde_mat.texture_uniform:
            for tex in lod_textures:
                if tex['type_name'] in ('ColorMap', 'DiffuseMap'):
                    basename = tex['path'].split('/')[-1]
                    mname = basename.replace('.dds', '').replace('.tga', '')
                    for suffix in ('_d', '_c'):
                        if mname.endswith(suffix) and len(mname) > len(suffix) + 1:
                            mname = mname[:-len(suffix)]
                            break
                    return mname

    if pde_mat.pixel_shaders:
        ps = pde_mat.pixel_shaders[0]
        ps_name = ps.replace('s_', '').replace('_lod_0', '').replace('_lod_1', '').replace('_lod_2', '')
        if ps_name:
            return ps_name

    return 'pde_default'


def create_blender_material(pde_mat, vfs_root: str):
    """从 PDE 材质创建 Blender 材质

    材质名从贴图名或 shader 名推导，与物体名无关。
    如果同名材质已存在则直接复用，避免重复创建。

    Args:
        pde_mat: PDEMaterial 对象
        vfs_root: VFS 根目录（用于查找贴图文件）

    Returns:
        Blender Material 对象
    """
    mat_name = _derive_material_name(pde_mat)

    # 同名材质已存在则直接复用
    mat = bpy.data.materials.get(mat_name)
    if mat is not None:
        log.info(f"  复用材质: {mat_name}")
        return mat

    mat = bpy.data.materials.new(name=mat_name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    nodes.clear()

    output_node = nodes.new(type='ShaderNodeOutputMaterial')
    output_node.location = (600, 0)

    bsdf_node = nodes.new(type='ShaderNodeBsdfPrincipled')
    bsdf_node.location = (0, 0)
    links.new(bsdf_node.outputs['BSDF'], output_node.inputs['Surface'])

    _load_texture_nodes(pde_mat, nodes, links, bsdf_node, vfs_root)
    store_pde_material(mat, pde_mat)

    # 兼容旧版导出器
    if pde_mat.vertex_shaders:
        mat["pde_vertex_shaders"] = list(pde_mat.vertex_shaders)
    if pde_mat.pixel_shaders:
        mat["pde_pixel_shaders"] = list(pde_mat.pixel_shaders)

    _log_material_info(pde_mat)

    return mat


def _load_texture_nodes(pde_mat, nodes, links, bsdf_node, vfs_root: str):
    """加载贴图并创建节点树

    优先使用最低 LOD（通常是 LOD0），某些模型 LOD0 无数据则向后查找。
    """
    if not pde_mat.texture_uniform:
        return

    active_lod = None
    for lod_textures in pde_mat.texture_uniform:
        if lod_textures:
            active_lod = lod_textures
            break
    if active_lod is None:
        active_lod = []

    # ColorMap 排第一，确保 SOLID 模式正确显示
    def _texture_sort_key(tex_info):
        tn = tex_info['type_name']
        if tn in ('ColorMap', 'DiffuseMap'):
            return (0, tn)
        elif tn == 'LightMap':
            return (2, tn)
        else:
            return (1, tn)

    for tex_info in sorted(active_lod, key=_texture_sort_key):
        _create_single_texture_node(tex_info, nodes, links, bsdf_node, vfs_root)


def _create_single_texture_node(tex_info, nodes, links, bsdf_node, vfs_root: str):
    """创建单个贴图节点并连接到 BSDF"""
    type_name = tex_info['type_name']
    vfs_path = tex_info['path']

    is_color = type_name in ('ColorMap', 'DiffuseMap')
    is_dr = type_name == 'DrMap'
    is_sr = type_name == 'SrMap'
    is_light = type_name == 'LightMap'
    is_normal = type_name in ('NormalMap', 'BumpMap')

    tex_filepath = _resolve_texture_path(vfs_path, vfs_root)

    if not (tex_filepath and os.path.isfile(tex_filepath)):
        log.debug(f"  贴图未找到: {type_name} = {vfs_path}")
        return

    img = bpy.data.images.load(tex_filepath)
    img.colorspace_settings.name = 'sRGB' if is_color else 'Non-Color'
    img.alpha_mode = 'CHANNEL_PACKED'

    tex_node = nodes.new(type='ShaderNodeTexImage')
    tex_node.image = img
    tex_node.label = type_name

    uv_map = nodes.new(type='ShaderNodeUVMap')
    uv_map.uv_map = "UVMap"
    links.new(uv_map.outputs['UV'], tex_node.inputs['Vector'])

    if is_color:
        links.new(tex_node.outputs['Color'], bsdf_node.inputs['Base Color'])
    elif is_sr:
        links.new(tex_node.outputs['Color'], bsdf_node.inputs['Metallic'])
    elif is_dr:
        links.new(tex_node.outputs['Color'], bsdf_node.inputs['Roughness'])
    elif is_normal:
        normal_node = nodes.new(type='ShaderNodeNormalMap')
        links.new(tex_node.outputs['Color'], normal_node.inputs['Color'])
        links.new(normal_node.outputs['Normal'], bsdf_node.inputs['Normal'])
    # LightMap 及其他类型不连接 BSDF，仅创建节点保留信息

    log.info(f"  加载贴图: {type_name} = {tex_filepath}")


def store_pde_material(mat: bpy.types.Material, pde_mat):
    """将完整 PDE 材质数据存储到材质自定义属性

    Blender IDProperty 支持嵌套 dict/list，可存储任意结构化数据。
    导出时优先从此属性读取，确保不丢失任何材质参数。

    Args:
        mat: Blender Material 对象
        pde_mat: PDEMaterial dataclass 实例
    """
    data = {
        "vertex_shaders": list(pde_mat.vertex_shaders) if pde_mat.vertex_shaders else [],
        "pixel_shaders": list(pde_mat.pixel_shaders) if pde_mat.pixel_shaders else [],
        "vertex_uniform": [],
        "pixel_uniform": [],
        "texture_uniform": [],
    }

    for lod in pde_mat.vertex_uniform:
        data["vertex_uniform"].append([
            {"type_name": u["type_name"], "values": list(u["values"])}
            for u in lod
        ])

    for lod in pde_mat.pixel_uniform:
        data["pixel_uniform"].append([
            {"type_name": u["type_name"], "values": list(u["values"])}
            for u in lod
        ])

    for lod in pde_mat.texture_uniform:
        data["texture_uniform"].append([
            {"type_name": t["type_name"], "path": t["path"]}
            for t in lod
        ])

    mat["pde_material"] = data


def store_primitive_props(obj: bpy.types.Object, prim: PDEPrimitive,
                            physics_material: int = 0):
    """将 Primitive 级属性存储到对象自定义属性

    PDE 文本格式中这些属性写在材质表内，但语义上属于 Primitive。
    存储到 Object 上，导出时读回写入材质表。

    Args:
        obj: Blender Mesh 对象
        prim: PDEPrimitive dataclass 实例
        physics_material: 物理材质索引（来自 mesh 级 physical_materials 列表）
    """
    obj["pde_primitive"] = {
        "layer": int(prim.layer),
        "cull_mode": int(prim.cull_mode),
        "blend_mode": int(prim.blend_mode),
        "visible": int(prim.visible),
        "collision_mode": int(prim.collision_mode),
        "physics_material": int(physics_material),
    }


def _log_material_info(pde_mat):
    """记录材质信息到日志"""
    if pde_mat.vertex_shaders:
        log.info(f"  VS: {', '.join(pde_mat.vertex_shaders)}")
    if pde_mat.pixel_shaders:
        log.info(f"  PS: {', '.join(pde_mat.pixel_shaders)}")
    for lod_idx, lod_tex in enumerate(pde_mat.texture_uniform):
        for tex in lod_tex:
            log.info(f"  贴图 LOD{lod_idx}: {tex['type_name']} = {tex['path']}")


# =============================================================================
# 贴图路径解析
# =============================================================================

def _resolve_texture_path(vfs_path: str, vfs_root: str) -> Optional[str]:
    """将 VFS 贴图路径解析为本地文件路径

    优先返回 Blender 可直接加载的格式（.dds, .tga, .png）。
    如果只有 .cache 格式，自动解码并缓存到贴图所在目录。
    """
    if not vfs_path or not vfs_root:
        return None

    rel_path = vfs_path.lstrip('/')
    local_path = os.path.join(vfs_root, rel_path.replace('/', os.sep))

    # 1. 优先查找可直接加载的格式
    direct_candidates = [
        local_path,
        local_path.replace('.dds', '.tga'),
        local_path.replace('.dds', '.png'),
        local_path.replace('.dds', '.jpg'),
    ]
    for candidate in direct_candidates:
        if os.path.isfile(candidate):
            return candidate

    # 2. 检查 .cache 文件并解码
    cache_candidates = [
        local_path + '.cache',
        local_path.replace('.dds', '.tga') + '.cache',
    ]
    for cache_path in cache_candidates:
        if os.path.isfile(cache_path):
            decoded_path = _decode_texture_cache(cache_path, vfs_path)
            if decoded_path:
                return decoded_path

    return None


def _decode_texture_cache(cache_path: str, vfs_path: str) -> Optional[str]:
    """解码 .cache 贴图文件并保存到同目录作为持久缓存

    PDE 引擎的 .cache 解压后前 8 字节是引擎文件类型标识，
    需要去掉才能被 Blender 正确加载。
    """
    try:
        from ..binary.cache_decoder import decode_cache_data

        if cache_path.endswith('.cache'):
            decoded_path = cache_path[:-6]
        else:
            decoded_path = cache_path + '.decoded'

        if os.path.isfile(decoded_path):
            log.info(f"  使用已缓存的贴图: {decoded_path}")
            return decoded_path

        with open(cache_path, 'rb') as f:
            raw = f.read()

        decoded = decode_cache_data(raw, vfs_path=vfs_path, verify_crc=False)

        if not decoded:
            log.warning(f"  贴图解码失败: {cache_path}")
            return None

        if len(decoded) > 8:
            decoded = decoded[8:]
        else:
            log.warning(f"  解码后数据过短 ({len(decoded)} bytes): {cache_path}")
            return None

        with open(decoded_path, 'wb') as f:
            f.write(decoded)

        log.info(f"  解码贴图 .cache -> {decoded_path}")
        return decoded_path

    except Exception as e:
        log.warning(f"  贴图解码异常: {cache_path} - {e}")
        return None
