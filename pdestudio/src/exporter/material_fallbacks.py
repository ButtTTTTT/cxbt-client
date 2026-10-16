#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 材质退化/回退逻辑

当材质没有 pde_material 自定义属性时，从 Blender 材质节点树
和旧版自定义属性中提取贴图和 shader 信息。

包含:
- extract_simple_fallback: 简单材质退化（仅 Name + 贴图）
- extract_cgfx_fallback: cgfx 材质退化（贴图 + shader + 默认值）
- collect_textures_from_nodes: 从节点树收集贴图引用
- collect_shaders_from_legacy_props: 从旧版属性读取 shader
- infer_type_from_links: 无 label 时从 BSDF 连接推断贴图类型
- get_texture_filename: 从纹理节点提取文件名
"""

import os
import bpy

from ..log import get_module_logger

log = get_module_logger("MAT_FB")


def extract_simple_fallback(mat: bpy.types.Material) -> dict:
    """简单材质退化路径（无 pde_material 自定义属性时）

    从贴图节点 label 提取贴图引用。
    """
    mat_lua = {"Name": mat.name}
    collect_textures_from_nodes(mat, mat_lua)
    return mat_lua


def extract_cgfx_fallback(mat: bpy.types.Material) -> dict:
    """cgfx 材质退化路径（无 pde_material 自定义属性时）

    从贴图节点 label + 旧版 shader 属性提取。
    """
    mat_lua = {}

    collect_textures_from_nodes(mat, mat_lua)
    collect_shaders_from_legacy_props(mat, mat_lua)

    if "vertex_shader_lod_0" not in mat_lua:
        mat_lua["vertex_shader_lod_0"] = "lc_main"
    if "pixel_shader_lod_0" not in mat_lua:
        mat_lua["pixel_shader_lod_0"] = \
            "transparency_character_normal_lod_0"

    return mat_lua


def collect_textures_from_nodes(mat: bpy.types.Material, mat_lua: dict):
    """从材质节点树中收集所有贴图引用。

    遍历所有 ShaderNodeTexImage 节点，通过 node.label 识别 PDE 贴图类型。
    """
    if not mat.use_nodes or not mat.node_tree:
        return

    for node in mat.node_tree.nodes:
        if node.type != 'TEX_IMAGE' or not node.image:
            continue

        tex_name = get_texture_filename(node)
        if not tex_name:
            continue

        type_name = node.label if node.label else ""

        if type_name:
            mat_lua[type_name] = tex_name
        else:
            inferred = infer_type_from_links(mat, node)
            if inferred:
                mat_lua[inferred] = tex_name


def collect_shaders_from_legacy_props(mat: bpy.types.Material, mat_lua: dict):
    """从旧版自定义属性读取 shader 名。

    旧版导入存储: mat["pde_vertex_shaders"] / mat["pde_pixel_shaders"]
    """
    vs_list = mat.get("pde_vertex_shaders", None)
    if vs_list:
        for i, vs in enumerate(vs_list):
            mat_lua[f"vertex_shader_lod_{i}"] = vs

    ps_list = mat.get("pde_pixel_shaders", None)
    if ps_list:
        for i, ps in enumerate(ps_list):
            mat_lua[f"pixel_shader_lod_{i}"] = ps


def infer_type_from_links(mat, tex_node) -> str:
    """无 label 时从 BSDF 连接关系推断贴图类型"""
    if not mat.node_tree:
        return ""

    for link in mat.node_tree.links:
        if link.from_node != tex_node:
            continue
        target = link.to_node
        if target.type == 'BSDF_PRINCIPLED':
            input_name = link.to_socket.name if link.to_socket else ""
            if input_name == "Base Color":
                return "ColorMap"
            elif input_name == "Specular":
                return "MaskMap"
            elif input_name == "Normal":
                return "NormalMap"
            elif input_name == "Metallic":
                return "SrMap"
            elif input_name == "Roughness":
                return "DrMap"
        elif target.type == 'NORMAL_MAP':
            return "NormalMap"
    return ""


def get_texture_filename(node) -> str:
    """从纹理节点提取贴图文件名（不含路径和后缀）。

    退化路径使用此函数：从 image.filepath 提取。
    可能不完全准确（本地缓存路径），但尽力而为。
    """
    if not node.image:
        return ""

    filepath = node.image.filepath
    if filepath:
        basename = os.path.basename(filepath)
        return os.path.splitext(basename)[0]

    if node.image.name:
        name = node.image.name
        for ext in ['.dds', '.tga', '.png', '.jpg', '.jpeg', '.bmp']:
            if name.lower().endswith(ext):
                return name[:-len(ext)]
        return name

    return ""
