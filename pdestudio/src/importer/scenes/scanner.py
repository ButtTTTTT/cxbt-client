#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 场景扫描器

扫描 level 目录下的 Lua 配置文件，生成 scene.json 缓存文件。
只扫描 levelN_type_script.lua 格式的文件，跳过 bosspveai/game_type 等。
"""

import os
import json
import re
from datetime import datetime
from typing import Dict, List

from ...log import get_module_logger
from .lua_parser import parse_scene_lua, classify_scene, extract_scene_number

log = get_module_logger("SCN_SCAN")

# 匹配 level*_script.lua 格式的文件名 (levelN_type_script 或 level_name_script)
_SCENE_FILE_PATTERN = re.compile(r'^level\w+_script\.lua$')


def scan_scenes(scene_dir: str) -> dict:
    """扫描场景目录，生成 scene.json 数据

    Args:
        scene_dir: level 目录路径 (如 .../finalcombat_cache=/level/)

    Returns:
        {
            "scan_time": "...",
            "total_scenes": N,
            "scenes": [
                {
                    "file_name": "level1_cp_script",
                    "map_name": "风车小镇",
                    "scene_number": 1,
                    "type": "占点",
                    "scene_mesh": "level1/scene.mesh",
                    "active_objects": [...],
                    ...
                },
                ...
            ]
        }
    """
    result = {
        "scan_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_scenes": 0,
        "scenes": [],
    }

    if not os.path.isdir(scene_dir):
        log.warning(f"场景目录不存在: {scene_dir}")
        return result

    scenes = []

    for fname in sorted(os.listdir(scene_dir)):
        if not fname.endswith(".lua"):
            continue

        stem = os.path.splitext(fname)[0]

        # 只扫描 levelN_type_script 格式的文件
        if not _SCENE_FILE_PATTERN.match(fname):
            continue

        fpath = os.path.join(scene_dir, fname)
        try:
            with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()

            scene = parse_scene_lua(stem, content)
            scene["scene_number"] = extract_scene_number(stem)
            scene["type"] = classify_scene(stem)

            scenes.append(scene)
        except Exception as e:
            log.warning(f"解析失败 {fname}: {e}")

    # 按场景编号和类型排序
    scenes.sort(key=lambda x: (x["scene_number"], x["type"]))

    result["scenes"] = scenes
    result["total_scenes"] = len(scenes)
    log.info(f"扫描完成: {len(scenes)} 个场景")

    return result


def save_scene_json(data: dict, scene_dir: str) -> str:
    """保存 scene.json 到场景目录

    Returns:
        JSON 文件路径
    """
    json_path = os.path.join(scene_dir, "scene.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    log.info(f"保存: {json_path}")
    return json_path


def load_scene_json(scene_dir: str) -> dict | None:
    """加载 scene.json

    Returns:
        场景数据字典，如果文件不存在则返回 None
    """
    json_path = os.path.join(scene_dir, "scene.json")
    if not os.path.isfile(json_path):
        return None

    try:
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log.warning(f"加载 scene.json 失败: {e}")
        return None
