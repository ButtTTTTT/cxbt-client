#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio - Mesh 材质导出

从 Blender 材质提取 PDE 引擎材质数据。

数据来源优先级:
    1. mat["pde_material"] — 导入时存储的完整 PDE 材质数据（推荐）
    2. 贴图节点 label + mat["pde_vertex_shaders"]/["pde_pixel_shaders"] — 旧版兼容
    3. 贴图节点 label + 默认 shader 名 — 退化

导出的文本格式参考 Material::Load(Lua) (Material.cpp:446-575):
    扁平 key=value 表，不区分 VS/PS uniform。
    - vertex_shader_lod_{i} = "shader_name"
    - pixel_shader_lod_{i} = "shader_name"
    - TextureType = "texture_filename"  (无路径无后缀)
    - UniformName = value / {v1, v2, ...}
    - Primitive 属性: IsInVisible, CollisionMode, BlendLayer, AlphaBlendMode, CullingMode
"""

import os
import bpy

from ..log import get_module_logger
from .material_fallbacks import (
    extract_simple_fallback,
    extract_cgfx_fallback,
)

log = get_module_logger("MESH_MAT")


def extract_materials(
    obj: bpy.types.Object,
    mesh: bpy.types.Mesh,
    material_type: str = "cgfx",
    mesh_vfs_dir: str = "",
) -> tuple:
    """提取材质列表和面-材质映射

    Args:
        obj: Blender 对象
        mesh: Blender Mesh 数据
        material_type: "simple" 或 "cgfx"
        mesh_vfs_dir: mesh 文件的 VFS 目录路径 (如 /mesh/scene/level1/)
            用于将贴图 VFS 全路径转为相对路径

    Returns:
        (materials_lua, face_material_indices)
    """
    materials_lua = []
    face_material_indices = []

    obj_materials = obj.data.materials if obj.data else []

    if not obj_materials:
        materials_lua.append({"Name": obj.name})
        return materials_lua, [0] * len(mesh.polygons)

    mat_index_map = {}
    for i, mat in enumerate(obj_materials):
        if mat is None:
            continue
        mat_lua = _extract_single_material(mat, obj, material_type, mesh_vfs_dir)
        mat_index_map[i] = len(materials_lua)
        materials_lua.append(mat_lua)

    if not materials_lua:
        materials_lua.append({"Name": obj.name})
        return materials_lua, [0] * len(mesh.polygons)

    for poly in mesh.polygons:
        idx = poly.material_index
        face_material_indices.append(mat_index_map.get(idx, 0))

    return materials_lua, face_material_indices


def _extract_single_material(
    mat: bpy.types.Material,
    obj: bpy.types.Object,
    material_type: str,
    mesh_vfs_dir: str = "",
) -> dict:
    """提取单个材质的完整数据

    优先从 mat["pde_material"] 读取（完整数据），
    退化时从节点 label + 旧属性读取。
    """
    pde_mat = mat.get("pde_material", None)

    if pde_mat is not None:
        mat_lua = _extract_from_pde_material(pde_mat, material_type, mesh_vfs_dir)
    elif material_type == "cgfx":
        mat_lua = extract_cgfx_fallback(mat)
    else:
        mat_lua = extract_simple_fallback(mat)

    _apply_primitive_props(obj, mat_lua)
    return mat_lua


def _extract_from_pde_material(
    pde_mat: dict, material_type: str, mesh_vfs_dir: str = "",
) -> dict:
    """从 pde_material 自定义属性提取完整材质数据"""
    mat_lua = {}

    # Shader 名
    vs_list = pde_mat.get("vertex_shaders", [])
    for i, vs in enumerate(vs_list):
        mat_lua[f"vertex_shader_lod_{i}"] = vs

    ps_list = pde_mat.get("pixel_shaders", [])
    for i, ps in enumerate(ps_list):
        mat_lua[f"pixel_shader_lod_{i}"] = ps

    # 贴图（取 LOD0，路径转为相对于 mesh 目录）
    texture_uniform = pde_mat.get("texture_uniform", [])
    if texture_uniform:
        for lod in texture_uniform:
            if lod:
                for tex in lod:
                    type_name = tex.get("type_name", "")
                    path = tex.get("path", "")
                    ref = _vfs_path_to_texture_ref(path, mesh_vfs_dir)
                    if type_name and ref:
                        mat_lua[type_name] = ref
                break

    # 数值 uniform（vertex + pixel 合并去重）
    seen_types = set()
    for uniform_lod_list in [
        pde_mat.get("vertex_uniform", []),
        pde_mat.get("pixel_uniform", []),
    ]:
        if not uniform_lod_list:
            continue
        lod0 = uniform_lod_list[0] if uniform_lod_list else []
        for u in lod0:
            type_name = u.get("type_name", "")
            values = u.get("values", [])
            if not type_name or not values or type_name in seen_types:
                continue
            seen_types.add(type_name)
            if len(values) == 1:
                mat_lua[type_name] = values[0]
            else:
                mat_lua[type_name] = list(values)

    # cgfx 模式补充默认 shader
    if material_type == "cgfx":
        if "vertex_shader_lod_0" not in mat_lua:
            mat_lua["vertex_shader_lod_0"] = "lc_main"
        if "pixel_shader_lod_0" not in mat_lua:
            mat_lua["pixel_shader_lod_0"] = \
                "transparency_character_normal_lod_0"

    return mat_lua


# =============================================================================
# Primitive 属性
# =============================================================================

_BLEND_MODE_ENUM_TO_TEXT = {
    1: 0,   # kBlendNone → text 0
    4: 1,   # kSourceAlphaAdd → text 1
    2: 2,   # kAlphaTest → text 2
    32: 3,  # kAdditive → text 3
}


def _blend_mode_enum_to_text(blend_mode: int) -> int:
    """将二进制 AlphaBlendMode 枚举值转为文本格式值"""
    return _BLEND_MODE_ENUM_TO_TEXT.get(blend_mode, 0)


def _apply_primitive_props(obj: bpy.types.Object, mat_lua: dict):
    """从对象自定义属性读取 Primitive 级属性，写入材质表

    PDE 文本格式中这些属性写在材质表内 (MeshResource.cpp:1233-1305):
        IsInVisible, CollisionMode, BlendLayer, AlphaBlendMode, CullingMode

    注意: 二进制格式和文本格式的枚举值不同！
    """
    prim = obj.get("pde_primitive", None)

    if prim is not None:
        mat_lua["IsInVisible"] = 1 if not prim.get("visible", True) else 0
        # 始终写入 CollisionMode 字段，确保不同 primitive 的碰撞模式被正确传递
        # 引擎 lua_LoadPhysxMesh 在字段缺失时默认为 1 (静态碰撞)
        # MeshResource::LoadRawData 在字段缺失时默认为 0
        # 原版 mesh 中不同材质有不同的 CollisionMode (0/1/2/5/6)，
        # 必须显式写入，否则会丢失多 actor 碰撞分组信息
        mat_lua["CollisionMode"] = prim.get("collision_mode", 1)
        mat_lua["PhysicsMaterial"] = prim.get("physics_material", 0)
        mat_lua["BlendLayer"] = prim.get("layer", 0)
        mat_lua["AlphaBlendMode"] = \
            _blend_mode_enum_to_text(prim.get("blend_mode", 1))
        mat_lua["CullingMode"] = prim.get("cull_mode", 1)  # default CCW
    else:
        mat_lua["IsInVisible"] = 0
        mat_lua["PhysicsMaterial"] = 0
        mat_lua["BlendLayer"] = 0
        mat_lua["AlphaBlendMode"] = 0
        mat_lua["CullingMode"] = 1  # CCW (引擎默认)


# =============================================================================
# 工具函数
# =============================================================================

def _vfs_path_to_texture_ref(vfs_path: str, mesh_vfs_dir: str = "") -> str:
    """将 VFS 贴图路径转为 Material::Load(Lua) 期望的引用格式

    贴图引用必须是相对于 mesh 目录的路径（含扩展名）。
    例如:
        mesh 在 /mesh/scene/level1/
        贴图在 /mesh/scene/materials/et01_d.dds
        引用 = ../materials/et01_d.dds
    """
    if not vfs_path:
        return ""

    if mesh_vfs_dir:
        rel = os.path.relpath(vfs_path, mesh_vfs_dir)
        rel = rel.replace("\\", "/")
        return rel

    basename = vfs_path.split('/')[-1]
    return basename
