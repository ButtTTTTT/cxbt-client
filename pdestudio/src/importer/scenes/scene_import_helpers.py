#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 场景导入辅助函数

从 PDE_OT_ImportScene 操作符中提取的导入逻辑:
- import_scene_mesh:     导入场景 mesh
- import_hold_point:      导入据点 mesh
- import_active_object:   导入活动物体 (风车、雷达等)
- import_gate:            导入门
- collect_mesh_objects:   递归收集 Mesh 子对象
- get_vfs_root / get_scene_dir / get_scene_json / find_scene: 路径/数据辅助
- ensure_collection / move_to_collection: Blender 集合管理
"""

import os
import math

import bpy

from ...log import get_module_logger
from ..common import load_and_decode, resolve_vfs_file
from ..binary.mesh import parse_mesh_binary
from ..core.mesh_builder import import_mesh_to_blender

log = get_module_logger("SCN_HELP")


# =============================================================================
# 集合管理
# =============================================================================

def ensure_collection(name: str) -> bpy.types.Collection:
    """获取或创建指定名称的 Blender 集合

    如果场景中已有同名集合则返回，否则创建新集合并链接到场景根集合。
    """
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
        log.info(f"创建集合: {name}")
    return coll


def move_to_collection(obj: bpy.types.Object, coll: bpy.types.Collection):
    """将对象及其所有子级移动到指定集合

    从当前所在的所有集合中移除，然后链接到目标集合。
    """
    if obj is None or coll is None:
        return

    # 从旧集合移除
    for c in list(obj.users_collection):
        c.objects.unlink(obj)

    # 链接到目标集合
    coll.objects.link(obj)

    # 递归处理子级
    for child in obj.children:
        move_to_collection(child, coll)


# =============================================================================
# 路径/数据辅助
# =============================================================================

def get_vfs_root(props) -> str:
    """获取 VFS 根目录（从场景属性或偏好设置）"""
    root = props.import_vfs_root
    if not root:
        pkg = __package__.rsplit(".", 2)[0]
        prefs = bpy.context.preferences.addons.get(pkg)
        if prefs and prefs.preferences:
            root = prefs.preferences.vfs_root
    return root


def get_scene_dir(props) -> str:
    """获取场景目录路径"""
    vfs_root = get_vfs_root(props)
    if not vfs_root:
        return ""
    return os.path.join(vfs_root, "level")


def get_scene_json(props) -> dict | None:
    """加载 scene.json"""
    scene_dir = get_scene_dir(props)
    if not scene_dir or not os.path.isdir(scene_dir):
        return None
    from .scanner import load_scene_json
    return load_scene_json(scene_dir)


def find_scene(data: dict, file_name: str) -> dict | None:
    """在 scene.json 数据中查找指定场景"""
    for scn in data.get("scenes", []):
        if scn.get("file_name") == file_name:
            return scn
    return None


# =============================================================================
# Mesh 导入
# =============================================================================

def _resolve_mesh_path(vfs_root: str, candidates: list):
    """从多个候选 VFS 路径中解析实际文件路径

    Returns: (mesh_path, vfs_path) 或 (None, None)
    """
    for vp in candidates:
        rel = vp.lstrip("/").replace("/", os.sep)
        p = resolve_vfs_file(os.path.join(vfs_root, rel), [".cache", ""])
        if p:
            return p, vp
    return None, None


def _load_and_import(mesh_path, vfs_path, props, scale, coord_mode, name):
    """加载 .cache mesh 并导入 Blender"""
    header, md = load_and_decode(
        mesh_path, vfs_path=vfs_path, verify_crc=props.import_verify_crc)
    mesh_data = parse_mesh_binary(md)
    return import_mesh_to_blender(
        mesh_data, name=name, scale=scale,
        armature_obj=None, vfs_root=get_vfs_root(props),
        coord_mode=coord_mode)


def _flatten_to_collection(obj, coll):
    """将对象（可能是多 Prim 父 Empty）的子物体提升到目标集合。

    如果 obj 是 Empty（多 Prim 父节点），则将所有子级移动到目标集合，
    断开父子关系，并删除 Empty 父节点。
    如果 obj 是普通 Mesh，则直接移动到目标集合。
    """
    if obj is None or coll is None:
        return None

    if obj.type == 'EMPTY' and obj.children:
        # 多 Prim: 提升子物体到目标集合，删除 Empty 父节点
        children = list(obj.children)
        for child in children:
            move_to_collection(child, coll)
            child.parent = None
        # 删除 Empty 父节点
        bpy.data.objects.remove(obj, do_unlink=True)
        log.info(f"提升 {len(children)} 个子物体到集合 '{coll.name}'，删除父 Empty")
        return children[0] if children else None
    else:
        # 单 Prim 或 Mesh: 直接移动
        move_to_collection(obj, coll)
        return obj


def import_scene_mesh(props, vfs_root, mesh_rel, coord_mode, scale,
                      target_collection=None):
    """导入场景 mesh

    Lua 路径如 "level1/scene.mesh"
    VFS 路径: /mesh/scene/level1/scene.mesh

    导入后将各 Prim 物体直接放入 target_collection。
    如果是多 Prim（有 Empty 父节点），提升子物体到集合并删除 Empty。
    """
    vfs_path = f"/mesh/scene/{mesh_rel}"
    rel = vfs_path.lstrip("/").replace("/", os.sep)
    mesh_path = resolve_vfs_file(
        os.path.join(vfs_root, rel), [".cache", ""])

    if not mesh_path:
        log.warning(f"找不到场景 mesh: {vfs_path}")
        return None

    try:
        name = os.path.splitext(os.path.basename(mesh_rel))[0]
        obj = _load_and_import(mesh_path, vfs_path, props, scale, coord_mode, name)
        if obj and target_collection is not None:
            obj = _flatten_to_collection(obj, target_collection)
        return obj
    except Exception as e:
        log.error(f"场景 mesh 导入失败 {vfs_path}: {e}")
        return None


def import_hold_point(props, vfs_root, hold_point_data, coord_mode, scale,
                      target_collection=None):
    """导入据点 mesh (Centerpoint)

    Lua: SetHoldPointMesh("Centerpoint/Centerpoint.mesh", 0.65)
    位置: 默认原点 (0, 0, 0)
    缩放: hold_point_data["scale"]
    """
    mesh_rel = hold_point_data["path"]
    hp_scale = hold_point_data.get("scale", 1.0)

    mesh_path, vfs_path = _resolve_mesh_path(vfs_root, [
        f"/mesh/prop/{mesh_rel}",
        f"/mesh/scene/sceneprop/{mesh_rel}",
        f"/mesh/scene/{mesh_rel}",
    ])

    if not mesh_path:
        log.warning(f"找不到据点 mesh: {mesh_rel}")
        return None

    try:
        name = os.path.splitext(os.path.basename(mesh_rel))[0]
        obj = _load_and_import(
            mesh_path, vfs_path, props, scale * hp_scale, coord_mode, name)
        if obj:
            obj.location = (0, 0, 0)
            if target_collection is not None:
                move_to_collection(obj, target_collection)
        log.info(f"导入据点: {mesh_rel} (scale={hp_scale})")
        return obj
    except Exception as e:
        log.error(f"据点导入失败 {mesh_rel}: {e}")
        return None


def import_active_object(props, vfs_root, obj_data, coord_mode, scale,
                         target_collection=None):
    """导入活动物体 (风车、雷达等)

    Lua: AddActiveObject(pos, rotation, mesh, up, speed)
    mesh 路径如 "windmils/windmils.mesh" 或 "radar/level1_radar_b.mesh"
    VFS 路径: /mesh/scene/sceneprop/{mesh} 或 /mesh/scene/{mesh}
    """
    mesh_rel = obj_data["mesh"]
    pos = obj_data["pos"]
    rot_deg = obj_data["rotation"]

    clean_rel = mesh_rel.lstrip("./")
    if clean_rel.startswith("../"):
        clean_rel = clean_rel[3:]

    mesh_path, vfs_path = _resolve_mesh_path(vfs_root, [
        f"/mesh/prop/{clean_rel}",
        f"/mesh/scene/sceneprop/{mesh_rel}",
        f"/mesh/scene/{mesh_rel}",
    ])

    if not mesh_path:
        log.warning(f"找不到活动物体 mesh: {mesh_rel}")
        return None

    try:
        name = os.path.splitext(os.path.basename(mesh_rel))[0]
        obj = _load_and_import(mesh_path, vfs_path, props, scale, coord_mode, name)

        if obj:
            from ..coordinate import convert_position
            bx, by, bz = convert_position(pos, coord_mode)
            obj.location = (bx * scale, by * scale, bz * scale)

            if rot_deg != 0:
                if coord_mode == "zup":
                    obj.rotation_euler = (0, 0, math.radians(rot_deg))
                else:
                    obj.rotation_euler = (0, math.radians(rot_deg), 0)

            if target_collection is not None:
                move_to_collection(obj, target_collection)

        return obj
    except Exception as e:
        log.error(f"活动物体导入失败 {mesh_rel}: {e}")
        return None


def import_gate(props, vfs_root, gate_data, coord_mode, scale,
                target_collection=None):
    """导入门

    Lua: AddGate(team, id, mesh, pos1, pos2, ...)
    mesh 路径如 "level1_red_left_gate.mesh"
    VFS 路径: /mesh/scene/level1/level1_red_left_gate.mesh
    """
    mesh_rel = gate_data["mesh"]
    pos1 = gate_data["pos1"]

    clean_rel = mesh_rel.lstrip("./")
    if clean_rel.startswith("../"):
        clean_rel = clean_rel[3:]
    mesh_basename = os.path.basename(clean_rel)

    mesh_path, vfs_path = _resolve_mesh_path(vfs_root, [
        f"/mesh/prop/{clean_rel}",
        f"/mesh/prop/gate/{mesh_basename}",
        f"/mesh/prop/signstop/{mesh_basename}",
        f"/mesh/scene/{mesh_rel}",
        f"/mesh/scene/sceneprop/{mesh_rel}",
    ])

    if not mesh_path:
        log.warning(f"找不到门 mesh: {mesh_rel}")
        return None

    try:
        name = os.path.splitext(os.path.basename(mesh_rel))[0]
        obj = _load_and_import(mesh_path, vfs_path, props, scale, coord_mode, name)

        if obj:
            from ..coordinate import convert_position
            bx, by, bz = convert_position(pos1, coord_mode)
            obj.location = (bx * scale, by * scale, bz * scale)

            if target_collection is not None:
                move_to_collection(obj, target_collection)

        return obj
    except Exception as e:
        log.error(f"门导入失败 {mesh_rel}: {e}")
        return None


def collect_mesh_objects(obj) -> list:
    """递归收集对象及其所有子级 Mesh 对象。

    导入可能返回 Empty（多 Prim 父节点）或单个 Mesh 对象。
    """
    result = []
    if obj is None:
        return result
    if obj.type == 'MESH':
        result.append(obj)
    for child in obj.children:
        result.extend(collect_mesh_objects(child))
    return result
