#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 武器 Lua 解析器

解析武器配置 Lua 文件，提取:
- weapon.name: 武器名称
- weapon.skeleton: 骨骼路径
- weapon.animation_set: 动画集名
- SetMeshColor(): 基础模型 (mz/rv, LOD 0/1/2)
- SetMeshColorWithLevel(): 强化特效模型 (level 5-19, LOD 0/1/2)
"""

import re
from typing import Dict, List, Tuple


def parse_weapon_lua(stem: str, content: str) -> dict:
    """解析单个武器 Lua 文件

    Args:
        stem: 文件名 (不含扩展名), 如 "rv1"
        content: Lua 文件内容

    Returns:
        武器配置字典, 包含 name, skeleton, animation_set, meshes, fx_meshes
    """
    weapon = {
        "config_name": stem,
        "name": None,
        "skeleton": None,
        "animation_set": None,
        "meshes": [],       # 基础模型: [{part, path, lod}]
        "fx_meshes": [],    # 强化特效: [{part, path, lod, level}]
    }

    # weapon.name
    name_m = re.search(r'weapon\.name\s*=\s*"([^"]+)"', content)
    if name_m:
        weapon["name"] = name_m.group(1)

    # weapon.skeleton
    skel_m = re.search(r'weapon\.skeleton\s*=\s*"([^"]+)"', content)
    if skel_m:
        weapon["skeleton"] = skel_m.group(1)

    # weapon.animation_set
    anim_m = re.search(r'weapon\.animation_set\s*=\s*"([^"]+)"', content)
    if anim_m:
        weapon["animation_set"] = anim_m.group(1)

    # SetMeshColor("mz", "ak47/mz1", 0)  → part=mz, path=ak47/mz1, lod=0
    for m in re.finditer(
        r'SetMeshColor\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*\)',
        content
    ):
        weapon["meshes"].append({
            "part": m.group(1),
            "path": m.group(2),
            "lod": int(m.group(3)),
        })

    # SetMeshColorWithLevel("rv", "weapon_fx/ak47_5.mesh", 0, 5)
    # → part=rv, path=weapon_fx/ak47_5.mesh, lod=0, level=5
    for m in re.finditer(
        r'SetMeshColorWithLevel\s*\(\s*"([^"]+)"\s*,\s*"([^"]*)"\s*,\s*(\d+)\s*,\s*(\d+)\s*\)',
        content
    ):
        path = m.group(2)
        if not path:
            continue
        weapon["fx_meshes"].append({
            "part": m.group(1),
            "path": path,
            "lod": int(m.group(3)),
            "level": int(m.group(4)),
        })

    return weapon


def merge_weapon_configs(configs: List[dict]) -> dict:
    """合并同一武器的多个配置文件 (如 mz1.lua + rv1.lua)

    mz1.lua 通常为空 (mesh 在 rv1.lua 中定义)。
    合并策略: name/skeleton/animation_set 取第一个非空值,
    meshes/fx_meshes 取并集。
    """
    merged = {
        "name": None,
        "skeleton": None,
        "animation_set": None,
        "meshes": [],
        "fx_meshes": [],
    }

    seen_meshes = set()
    seen_fx = set()

    for cfg in configs:
        if not merged["name"] and cfg.get("name"):
            merged["name"] = cfg["name"]
        if not merged["skeleton"] and cfg.get("skeleton"):
            merged["skeleton"] = cfg["skeleton"]
        if not merged["animation_set"] and cfg.get("animation_set"):
            merged["animation_set"] = cfg["animation_set"]

        for mesh in cfg.get("meshes", []):
            key = (mesh["part"], mesh["path"], mesh["lod"])
            if key not in seen_meshes:
                seen_meshes.add(key)
                merged["meshes"].append(mesh)

        for fx in cfg.get("fx_meshes", []):
            key = (fx["part"], fx["path"], fx["lod"], fx["level"])
            if key not in seen_fx:
                seen_fx.add(key)
                merged["fx_meshes"].append(fx)

    return merged
