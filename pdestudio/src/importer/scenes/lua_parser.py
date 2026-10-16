#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 场景 Lua 解析器

解析场景配置 Lua 文件 (level/levelN_type_script.lua)，提取:
- AddMesh: 场景 mesh 路径
- AddMapName: 地图名称
- AddActiveObject: 活动物体 (风车、雷达等)
- AddGate: 门
- AddParticle: 粒子效果
- SetLightMap: 光照贴图
- SetSunDirection: 太阳方向
- SetFog: 雾参数
- 其他渲染参数
"""

import re
from typing import List


def parse_scene_lua(stem: str, content: str) -> dict:
    """解析单个场景 Lua 文件

    Args:
        stem: 文件名 (不含扩展名), 如 "level1_cp_script"
        content: Lua 文件内容

    Returns:
        场景配置字典
    """
    scene = {
        "file_name": stem,
        "map_name": None,
        "scene_mesh": None,
        "physx_mesh": None,
        "light_map": None,
        "occluders": None,
        "sun_direction": None,
        "fog": None,
        "hold_point_mesh": None,   # SetHoldPointMesh
        "active_objects": [],   # [{pos, rotation, mesh, up}]
        "gates": [],            # [{team, mesh, pos1, pos2}]
        "particles": [],        # [{name, pos, dir}]
        "scene_sounds": [],     # [name]
    }

    # AddMapName("风车小镇")
    m = re.search(r'AddMapName\s*\(\s*"([^"]+)"', content)
    if m:
        scene["map_name"] = m.group(1)

    # AddMesh("level1/scene.mesh")
    m = re.search(r'AddMesh\s*\(\s*"([^"]+)"', content)
    if m:
        scene["scene_mesh"] = m.group(1)

    # AddPhysx("level1/scene.mesh")
    m = re.search(r'AddPhysx\s*\(\s*"([^"]+)"', content)
    if m:
        scene["physx_mesh"] = m.group(1)

    # SetLightMap("materials/et01_lp_all.dds")
    m = re.search(r'SetLightMap\s*\(\s*"([^"]+)"', content)
    if m:
        scene["light_map"] = m.group(1)

    # AddOccluders("level1/scene.occ")
    m = re.search(r'AddOccluders\s*\(\s*"([^"]+)"', content)
    if m:
        scene["occluders"] = m.group(1)

    # SetSunDirection(x, y, z)
    m = re.search(
        r'SetSunDirection\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)',
        content)
    if m:
        scene["sun_direction"] = (
            float(m.group(1)), float(m.group(2)), float(m.group(3)))

    # SetFog(density, start, end, r, g, b)
    m = re.search(
        r'SetFog\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,'
        r'\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)',
        content)
    if m:
        scene["fog"] = {
            "density": float(m.group(1)),
            "start": float(m.group(2)),
            "end": float(m.group(3)),
            "r": float(m.group(4)),
            "g": float(m.group(5)),
            "b": float(m.group(6)),
        }

    # AddActiveObject(pos, rotation, mesh, up, ...)
    # pos = Vector3(x, y, z), rotation = float, mesh = "path"
    for m in re.finditer(
        r'AddActiveObject\s*\(\s*Vector3\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)'
        r'\s*,\s*([-\d.]+)\s*,\s*"([^"]+)"',
        content
    ):
        scene["active_objects"].append({
            "pos": (
                float(m.group(1)), float(m.group(2)), float(m.group(3))),
            "rotation": float(m.group(4)),
            "mesh": m.group(5),
        })

    # AddGate(team, id, mesh, pos1, pos2, ...)
    for m in re.finditer(
        r'AddGate\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*"([^"]+)"'
        r'\s*,\s*Vector3\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)'
        r'\s*,\s*Vector3\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)',
        content
    ):
        scene["gates"].append({
            "team": int(m.group(1)),
            "mesh": m.group(3),
            "pos1": (
                float(m.group(4)), float(m.group(5)), float(m.group(6))),
            "pos2": (
                float(m.group(7)), float(m.group(8)), float(m.group(9))),
        })

    # AddParticle(name, pos, dir)
    for m in re.finditer(
        r'AddParticle\s*\(\s*"([^"]+)"\s*,\s*Vector3\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)'
        r'\s*,\s*Vector3\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)',
        content
    ):
        scene["particles"].append({
            "name": m.group(1),
            "pos": (
                float(m.group(2)), float(m.group(3)), float(m.group(4))),
            "dir": (
                float(m.group(5)), float(m.group(6)), float(m.group(7))),
        })

    # AddSceneSound("name")
    for m in re.finditer(r'AddSceneSound\s*\(\s*"([^"]+)"', content):
        scene["scene_sounds"].append(m.group(1))

    # SetHoldPointMesh("Centerpoint/Centerpoint.mesh", scale)
    m = re.search(r'SetHoldPointMesh\s*\(\s*"([^"]+)"\s*,\s*([\d.]+)', content)
    if m:
        scene["hold_point_mesh"] = {
            "path": m.group(1),
            "scale": float(m.group(2)),
        }

    return scene


def classify_scene(stem: str) -> str:
    """根据文件名推断场景类型

    Returns:
        类型标签: "cp"(占点), "td"(团队竞技), "wo"(爆破),
        "knife"(刀战), "bo"(Boss), "lm"(极限), "pl"(推车),
        "eb"(???), "zb"(???), "ac"(???), "it"(???), "jp"(跳跃),
        "其他"
    """
    TYPE_MAP = {
        "cp": "占点",
        "td": "团队竞技",
        "wo": "爆破",
        "knife": "刀战",
        "bo": "Boss",
        "lm": "极限",
        "pl": "推车",
        "eb": "特殊",
        "zb": "生化",
        "ac": "活动",
        "it": "道具",
        "jp": "跳跃",
    }

    parts = stem.split("_")
    if len(parts) >= 2:
        type_code = parts[-2]  # 如 "level1_cp_script" → "cp"
        if type_code in TYPE_MAP:
            return TYPE_MAP[type_code]

    return "其他"


def extract_scene_number(stem: str) -> int:
    """从文件名提取场景编号

    "level1_cp_script" → 1
    "level_train_script" → 0
    """
    m = re.match(r'level(\d+)', stem)
    if m:
        return int(m.group(1))
    return 0
