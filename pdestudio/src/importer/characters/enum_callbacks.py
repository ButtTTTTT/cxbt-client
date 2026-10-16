#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 角色导入枚举回调

为 Blender EnumProperty 提供动态选项列表。
角色/类别从 CHARACTER_MAP 静态生成，装扮/配饰从 character.json 动态生成。
"""

import os
import bpy

from .scanner import load_character_json
from .constants import CHARACTER_MAP, CATEGORY_LABELS, CATEGORY_ORDER

def _get_vfs_root(props) -> str:
    """获取 VFS 根目录 (从场景属性或偏好设置)"""
    root = props.import_vfs_root
    if not root:
        pkg = __package__.rsplit(".", 2)[0]  # -> src
        prefs = bpy.context.preferences.addons.get(pkg)
        if prefs and prefs.preferences:
            root = prefs.preferences.vfs_root
    return root


def _get_json(props) -> dict | None:
    """加载 character.json"""
    root = _get_vfs_root(props)
    if not root:
        return None
    return load_character_json(root)


def _find_character(data: dict, name: str) -> dict | None:
    """在 JSON 数据中查找角色"""
    for char in data.get("characters", []):
        if char["name"] == name:
            return char
    return None


def _get_team(props) -> dict | None:
    """获取当前选中的角色+队伍的数据"""
    if props.char_sel_name == "NONE":
        return None
    data = _get_json(props)
    if not data:
        return None
    char = _find_character(data, props.char_sel_name)
    if not char:
        return None
    return char["teams"].get(props.char_sel_team)


def _build_enum(items, none_label="--"):
    """构建带 NONE 选项的枚举列表"""
    result = [("NONE", none_label, "")]
    result.extend(items)
    return result


# =============================================================================
# 类别 + 角色 (静态，从 CHARACTER_MAP 生成)
# =============================================================================

def get_category_enum(props, context):
    """角色类别枚举（静态，直接从 CHARACTER_MAP 生成）"""
    found = set()
    for _, (cat, _) in CHARACTER_MAP.items():
        found.add(cat)

    ordered = [c for c in CATEGORY_ORDER if c in found]
    items = [("NONE", "--", "")]
    for cat in ordered:
        label = CATEGORY_LABELS.get(cat, cat)
        items.append((cat, label, ""))
    return items


def get_character_enum(props, context):
    """角色枚举（静态，直接从 CHARACTER_MAP 生成）

    按当前选中的类别过滤。
    """
    sel_category = props.char_sel_category
    if sel_category == "NONE":
        return [("NONE", "--", "")]

    items = []
    for name, (category, display_name) in CHARACTER_MAP.items():
        if category != sel_category:
            continue
        items.append((name, display_name, ""))

    return _build_enum(items, "--")


# =============================================================================
# 装扮 + 配饰 (动态，从 character.json 生成)
# =============================================================================

def get_outfit_enum(props, context):
    """装扮枚举（从 JSON 动态生成）"""
    team = _get_team(props)
    if not team:
        return [("NONE", "--", "")]

    items = []
    for outfit in team.get("outfits", []):
        name = outfit["name"]
        mesh_count = len(outfit.get("meshes", []))
        tp_count = len(outfit.get("tp_meshes", []))
        label = f"{name} [{mesh_count}m/{tp_count}tp]"
        items.append((name, label, ""))
    return _build_enum(items, "--")


def get_hat_enum(props, context):
    """帽子枚举（从 JSON 动态生成）"""
    team = _get_team(props)
    if not team:
        return [("NONE", "--", "")]

    items = []
    for dp in team.get("hats", []):
        name = dp["name"]
        mesh_name = os.path.basename(dp.get("mesh", "")) if dp.get("mesh") else ""
        label = f"{name} {mesh_name}" if mesh_name else name
        items.append((name, label, ""))
    return _build_enum(items, "--")


def get_chest_enum(props, context):
    """翅膀/胸件枚举（从 JSON 动态生成）"""
    team = _get_team(props)
    if not team:
        return [("NONE", "--", "")]

    items = []
    for dp in team.get("chests", []):
        name = dp["name"]
        mesh_name = os.path.basename(dp.get("mesh", "")) if dp.get("mesh") else ""
        label = f"{name} {mesh_name}" if mesh_name else name
        items.append((name, label, ""))
    return _build_enum(items, "--")


def get_medal_enum(props, context):
    """勋章枚举（从 JSON 动态生成）"""
    team = _get_team(props)
    if not team:
        return [("NONE", "--", "")]

    items = []
    for dp in team.get("medals", []):
        name = dp["name"]
        mesh_name = os.path.basename(dp.get("mesh", "")) if dp.get("mesh") else ""
        label = f"{name} {mesh_name}" if mesh_name else name
        items.append((name, label, ""))
    return _build_enum(items, "--")


# =============================================================================
# 动画武器枚举 (动态，从动画目录扫描)
# =============================================================================

def get_anim_weapon_enum(props, context):
    """武器变体枚举（动态，从 animation 目录扫描子目录名）"""
    if props.char_sel_name == "NONE":
        return [("NONE", "--", "")]

    vfs_root = _get_vfs_root(props)
    if not vfs_root:
        return [("NONE", "--", "")]

    data = _get_json(props)
    if not data:
        return [("NONE", "--", "")]

    char = _find_character(data, props.char_sel_name)
    if not char:
        return [("NONE", "--", "")]

    team = char["teams"].get(props.char_sel_team)
    if not team:
        return [("NONE", "--", "")]

    animset = team.get("animationset")
    if not animset:
        return [("NONE", "--", "")]

    from .constants import ANIM_TYPE_PATHS
    anim_type = props.char_sel_anim_type
    cat, view = ANIM_TYPE_PATHS.get(
        anim_type, ("character", "thirdperson"))

    anim_dir = os.path.join(vfs_root, "animation", cat, view, animset)
    if not os.path.isdir(anim_dir):
        return [("NONE", "--", "")]

    items = []
    for name in sorted(os.listdir(anim_dir)):
        if os.path.isdir(os.path.join(anim_dir, name)):
            items.append((name, name, ""))

    return _build_enum(items, "--")
