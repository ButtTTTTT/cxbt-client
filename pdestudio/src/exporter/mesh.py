#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio - Mesh 导出器

将 Blender Mesh 对象导出为 PDE 引擎的明文 .mesh 格式（Lua 表）。

格式参考: tc/client/render/MeshResource.cpp:757-1327

顶层结构:
    Materials = { ... }     -- 材质列表
    Joints = { ... }        -- 骨骼名列表（仅蒙皮模型）
    Mesh = { ... }          -- 网格数据

支持多对象合并导出:
    场景导入时每个 Primitive 创建独立 Mesh 对象（挂在父 Empty 下）。
    导出时自动收集所有选中 Mesh 对象 + 父 Empty 的 Mesh 子物体，
    合并为单个 PDE mesh 文件。

数据提取和材质导出拆分到:
    mesh_data.py      - 网格数据提取 (坐标转换/UV V flip/BlendIndices 1-based)
    mesh_materials.py - 材质提取 (自定义属性优先)
    mesh_merge.py     - 多对象数据合并
"""

import os
import bpy

from ..log import get_module_logger
from . import lua_table_to_file, generate_build_scripts
from .export_utils import get_pexport_dir, derive_vfs_prefix, derive_mesh_vfs_dir
from .mesh_data import get_evaluated_mesh, extract_mesh_data
from .mesh_materials import extract_materials
from .mesh_merge import merge_multi_object_data

log = get_module_logger("MESH")


def export_mesh(
    context,
    filepath: str,
    selected_only: bool = True,
    apply_modifiers: bool = True,
    export_vertex_colors: bool = False,
    mesh_type: str = "auto",
    material_type: str = "cgfx",
    export_tangents: bool = True,
    uv_count: int = 1,
    export_scale: float = 1.0,
) -> bool:
    """导出 Mesh 为 PDE .mesh 格式

    支持单对象和多对象（场景）导出。多对象时自动合并所有 Mesh 数据。

    Args:
        context: Blender 上下文
        filepath: 输出文件路径
        selected_only: 仅导出选中对象（含父 Empty 的子物体）
        apply_modifiers: 应用修改器
        export_vertex_colors: 导出顶点色
        mesh_type: "auto" / "static" / "skin"
        material_type: "simple" / "cgfx"
        export_tangents: 导出切线/副法线
        uv_count: UV 集数量（1-3）
        export_scale: 位置缩放因子（默认1.0, PDE单位=米）

    Returns:
        是否成功
    """
    mesh_objects = _collect_mesh_objects(context, selected_only)
    if not mesh_objects:
        log.warning("未找到 Mesh 对象")
        return False

    mesh_vfs_dir = derive_mesh_vfs_dir(filepath)
    log.info(f"导出 {len(mesh_objects)} 个 Mesh 对象, VFS目录: {mesh_vfs_dir}")

    per_object_results = []
    temp_meshes = []

    try:
        for obj in mesh_objects:
            mesh = get_evaluated_mesh(obj, context, apply_modifiers)
            if apply_modifiers and mesh != obj.data:
                temp_meshes.append((obj, mesh))

            result = _extract_single_object(
                obj, mesh, context, material_type, mesh_type,
                export_vertex_colors, export_tangents, uv_count,
                export_scale, mesh_vfs_dir,
            )
            if result:
                per_object_results.append(result)

        if not per_object_results:
            log.error("没有任何对象成功提取数据")
            return False

        # 合并所有对象数据
        if len(per_object_results) == 1:
            merged = _wrap_single_result(per_object_results[0])
        else:
            merged = merge_multi_object_data(per_object_results)

        # 覆盖 mesh 类型
        is_skinned = merged["is_skinned"]
        joints = merged["joints"]
        mesh_lua = merged["mesh_data"]

        if mesh_type == "static":
            is_skinned = False
            joints = []
            mesh_lua["BlendCounts"] = {}
            mesh_lua["BlendIndices"] = {}
            mesh_lua["BlendWeights"] = {}
        elif mesh_type == "skin":
            if not joints:
                log.warning("强制蒙皮模式但未找到骨骼，将导出为静态网格")

        # 组装顶层 Lua 表
        lua_table = {"Materials": merged["materials"]}
        if is_skinned and joints:
            lua_table["Joints"] = joints
        lua_table["Mesh"] = mesh_lua

        # 写入文件
        mesh_name = os.path.splitext(os.path.basename(filepath))[0]
        success = lua_table_to_file(
            lua_table, filepath,
            header_comment=f"PDE Studio - Mesh Export: {mesh_name}",
        )

        if success:
            pexport_dir = get_pexport_dir(context)
            vfs_prefix = derive_vfs_prefix(filepath, pexport_dir or "")
            generate_build_scripts(
                mesh_name=mesh_name,
                export_dir=os.path.dirname(filepath),
                vfs_prefix=vfs_prefix,
                has_skel=is_skinned,
                has_anim=False,
            )

        return success

    finally:
        # 清理临时 mesh
        for obj, mesh in temp_meshes:
            try:
                obj.to_mesh_clear()
            except Exception:
                pass


def _collect_mesh_objects(context, selected_only: bool) -> list:
    """收集所有要导出的 Mesh 对象

    策略:
    1. 获取选中对象
    2. 如果选中对象中有 Empty，收集其所有 Mesh 子物体
    3. 如果选中对象中有 Mesh，直接加入
    4. 去重
    """
    if selected_only:
        candidates = list(context.selected_objects)
    else:
        candidates = list(context.scene.objects)

    mesh_objects = []
    seen = set()

    for obj in candidates:
        if obj.type == 'MESH':
            if obj.name not in seen:
                mesh_objects.append(obj)
                seen.add(obj.name)
        elif obj.type == 'EMPTY':
            # 收集 Empty 的所有 Mesh 子物体
            for child in _find_mesh_children(obj):
                if child.name not in seen:
                    mesh_objects.append(child)
                    seen.add(child.name)

    # 按导入顺序排序（pde_prim_index），无此属性时保持收集顺序
    has_prim_index = any(o.get("pde_prim_index") is not None for o in mesh_objects)
    if has_prim_index:
        mesh_objects.sort(key=lambda o: (
            o.get("pde_prim_index", 0xFFFFFF),
            o.name,
        ))
    return mesh_objects


def _find_mesh_children(parent_obj) -> list:
    """递归查找对象的所有 Mesh 子物体"""
    result = []
    for child in parent_obj.children:
        if child.type == 'MESH':
            result.append(child)
        elif child.type == 'EMPTY':
            result.extend(_find_mesh_children(child))
    return result


def _extract_single_object(
    obj, mesh, context, material_type, mesh_type,
    export_vertex_colors, export_tangents, uv_count,
    export_scale=1.0, mesh_vfs_dir="",
) -> dict:
    """提取单个对象的材质和网格数据"""
    try:
        materials_lua, face_material_indices = extract_materials(
            obj, mesh, material_type, mesh_vfs_dir)

        result = extract_mesh_data(
            obj, mesh, context,
            export_vertex_colors=export_vertex_colors,
            export_tangents=export_tangents,
            uv_count=uv_count,
            export_scale=export_scale,
        )

        mesh_lua = result["mesh_data"]
        joints = result["joints"]
        is_skinned = result["is_skinned"]

        # 按多边形面映射材质（与 FaceVertexCount 一一对应）
        # face_material_indices 已由 extract_materials 按 polygons 生成
        mesh_lua["FaceMaterials"] = face_material_indices

        n_verts = len(mesh_lua["Points"]) // 3
        n_faces = len(mesh_lua["FaceVertexCount"])
        log.info(f"  {obj.name}: {n_verts} 顶点, {n_faces} 面, {len(materials_lua)} 材质")

        return {
            "mesh_data": mesh_lua,
            "materials": materials_lua,
            "face_material_indices": face_material_indices,
            "joints": joints,
            "is_skinned": is_skinned,
            "obj_name": obj.name,
        }

    except Exception as e:
        log.error(f"提取 {obj.name} 数据失败: {e}")
        return None


def _wrap_single_result(result: dict) -> dict:
    """将单对象结果包装为合并格式"""
    return {
        "mesh_data": result["mesh_data"],
        "materials": result["materials"],
        "joints": result["joints"],
        "is_skinned": result["is_skinned"],
    }
