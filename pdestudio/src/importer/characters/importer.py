#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 角色导入主流程

从 character.json 读取配置，导入骨骼 + FP/TP 模型。
可拆卸部件和动画导入见 part_importer.py。
"""

import os

from ...log import get_module_logger
from .part_importer import import_parts

log = get_module_logger("CHAR_IMP")


def import_character(props, vfs_root, char, team, outfit,
                      selected_parts, report_fn) -> int:
    """执行角色导入的主入口

    Returns:
        成功导入的资源数量
    """
    imported_count = 0
    coord_mode = props.import_coord_mode
    scale = props.import_scale

    # 1. 导入骨骼 (优先 TP, 可被 outfit override 覆盖)
    skel_vfs = team.get("tp_skeleton") or team.get("fp_skeleton")
    if outfit and outfit.get("skeleton_override"):
        skel_override = outfit["skeleton_override"]
        skel_vfs = skel_override.get("tp") or skel_override.get("fp") or skel_vfs

    armature_obj = _import_skeleton(props, vfs_root, skel_vfs, report_fn)
    if armature_obj:
        imported_count += 1

    # 2. 导入模型
    view = props.char_sel_view

    if view in ("fp", "both") and outfit:
        imported_count += _import_fp_meshes(
            props, vfs_root, outfit, armature_obj, report_fn)

    if view in ("tp", "both") and outfit:
        imported_count += _import_tp_meshes(
            props, vfs_root, outfit, armature_obj, report_fn)

    # 3. 导入可拆卸部件
    if selected_parts:
        imported_count += import_parts(
            props, vfs_root, selected_parts, armature_obj, report_fn)

    return imported_count


# =============================================================================
# 内部: VFS 路径解析
# =============================================================================

def _resolve(vfs_root: str, vfs_path: str) -> str | None:
    """解析 VFS 路径到本地文件"""
    from ..common import resolve_vfs_file
    rel = vfs_path.lstrip("/").replace("/", os.sep)
    base = os.path.join(vfs_root, rel)
    return resolve_vfs_file(base, [".cache", ""])


# =============================================================================
# 内部: 骨骼导入
# =============================================================================

def _import_skeleton(props, vfs_root, skel_vfs, report_fn):
    """导入骨骼，返回 armature_obj 或 None"""
    if not skel_vfs:
        return None

    from ..common import load_and_decode
    from ..binary.skeleton import parse_skeleton_binary
    from ..core.skeleton_builder import import_skeleton_to_blender

    skel_path = _resolve(vfs_root, skel_vfs)
    if not skel_path:
        if report_fn:
            report_fn({"WARNING"}, f"找不到骨骼: {skel_vfs}")
        return None

    try:
        header, skel_data = load_and_decode(
            skel_path, vfs_path=skel_vfs,
            verify_crc=props.import_verify_crc)
        skel = parse_skeleton_binary(skel_data)
        skel_name = os.path.splitext(os.path.basename(skel_path))[0]
        if skel_name.endswith(".skel"):
            skel_name = skel_name[:-5]
        result = import_skeleton_to_blender(
            skel, name=skel_name, scale=props.import_scale,
            coord_mode=props.import_coord_mode)
        if isinstance(result, tuple):
            arm_obj = result[0]
        else:
            arm_obj = result
        if report_fn:
            report_fn({"INFO"}, f"骨骼: {skel_name} ({len(skel.joints)} joints)")
        return arm_obj
    except Exception as e:
        if report_fn:
            report_fn({"WARNING"}, f"骨骼导入失败: {e}")
        return None


# =============================================================================
# 内部: 第一人称模型导入
# =============================================================================

def _import_fp_meshes(props, vfs_root, outfit, armature_obj, report_fn) -> int:
    """导入第一人称模型"""
    from ..common import load_and_decode
    from ..binary.mesh import parse_mesh_binary
    from ..core.mesh_builder import import_mesh_to_blender

    count = 0
    lod_filter = props.char_sel_lod
    coord_mode = props.import_coord_mode
    scale = props.import_scale

    for mesh_info in outfit.get("meshes", []):
        lod = mesh_info.get("lod")
        if lod is not None and lod_filter != "all" and str(lod) != lod_filter:
            continue

        mesh_path = mesh_info["path"]
        if not mesh_path.startswith("/"):
            mesh_path = f"/mesh/character/firstperson/{mesh_path}"

        actual = _resolve(vfs_root, mesh_path)
        if not actual:
            if report_fn:
                report_fn({"WARNING"}, f"找不到 FP mesh: {mesh_path}")
            continue

        try:
            header, data = load_and_decode(
                actual, vfs_path=mesh_path,
                verify_crc=props.import_verify_crc)
            mesh_data = parse_mesh_binary(data)
            name = os.path.splitext(os.path.basename(actual))[0]
            if name.endswith(".mesh"):
                name = name[:-5]
            obj = import_mesh_to_blender(
                mesh_data, name=name, scale=scale,
                armature_obj=armature_obj, vfs_root=vfs_root,
                coord_mode=coord_mode)
            if obj:
                count += 1
        except Exception as e:
            if report_fn:
                report_fn({"WARNING"}, f"FP mesh 导入失败 {mesh_path}: {e}")

    return count


# =============================================================================
# 内部: 第三人称模型导入
# =============================================================================

def _import_tp_meshes(props, vfs_root, outfit, armature_obj, report_fn) -> int:
    """导入第三人称模型 (body + cloth + hat, 共享同一骨骼)"""
    import re

    from ..common import load_and_decode
    from ..binary.mesh import parse_mesh_binary
    from ..core.mesh_builder import import_mesh_to_blender

    count = 0
    tp_dir = outfit.get("tp_dir")
    tp_meshes = outfit.get("tp_meshes", [])
    lod_filter = props.char_sel_lod
    coord_mode = props.import_coord_mode
    scale = props.import_scale

    for mesh_base in tp_meshes:
        if lod_filter != "all":
            lod_m = re.search(r"lod(\d+)", mesh_base)
            if lod_m and lod_m.group(1) != lod_filter:
                continue

        vfs_path = f"/mesh/character/thirdperson/{tp_dir}/{mesh_base}.mesh"
        actual = _resolve(vfs_root, vfs_path)
        if not actual:
            continue

        try:
            header, data = load_and_decode(
                actual, vfs_path=vfs_path,
                verify_crc=props.import_verify_crc)
            mesh_data = parse_mesh_binary(data)
            obj = import_mesh_to_blender(
                mesh_data, name=mesh_base, scale=scale,
                armature_obj=armature_obj, vfs_root=vfs_root,
                coord_mode=coord_mode)
            if obj:
                count += 1
        except Exception as e:
            if report_fn:
                report_fn({"WARNING"}, f"TP mesh 导入失败 {mesh_base}: {e}")

    return count
