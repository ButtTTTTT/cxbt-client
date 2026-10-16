#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 角色目录扫描器

扫描 character 目录下的 Lua 配置文件，生成 character.json 索引。

数据结构: 角色 -> 队伍(0/1) -> {outfits, hats, chests, medals, ...}
Lua 解析逻辑见 lua_parser.py。
"""

import os
import json
import time

from ...log import get_module_logger
from .constants import classify_character
from .lua_parser import (
    read_lua_files,
    extract_skeleton_info,
    parse_outfit_config,
    parse_detachable_parts,
)

log = get_module_logger("CHAR_SCAN")


def scan_character_directory(vfs_root: str) -> dict:
    """扫描 character 目录，生成角色索引 JSON

    Args:
        vfs_root: VFS 根目录路径

    Returns:
        character.json 的 dict 结构
    """
    char_root = os.path.join(vfs_root, "character")
    if not os.path.isdir(char_root):
        raise FileNotFoundError(f"character dir not found: {char_root}")

    result = {
        "version": 2,
        "scan_time": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "vfs_root": vfs_root,
        "total_characters": 0,
        "characters": [],
    }

    # 收集所有带 _0/_1 后缀的目录
    char_dirs = {}
    for name in sorted(os.listdir(char_root)):
        dir_path = os.path.join(char_root, name)
        if not os.path.isdir(dir_path):
            continue
        if name in ("die_effect", "New Folder"):
            continue

        base, team = _split_team_suffix(name)
        if base is None:
            continue

        if base not in char_dirs:
            char_dirs[base] = {}
        char_dirs[base][team] = name

    # 为每个角色生成索引
    for base_name, teams in sorted(char_dirs.items()):
        category, display_name = classify_character(base_name)
        char_entry = {
            "name": base_name,
            "category": category,
            "display_name": display_name,
            "teams": {},
        }

        for team_id, dir_name in sorted(teams.items()):
            team_data = _scan_team_dir(
                os.path.join(char_root, dir_name), dir_name, vfs_root)
            if team_data:
                char_entry["teams"][team_id] = team_data

        if char_entry["teams"]:
            result["characters"].append(char_entry)

    result["total_characters"] = len(result["characters"])
    log.info(f"Scan done: {result['total_characters']} characters")
    return result


def save_character_json(data: dict, vfs_root: str) -> str:
    """保存 character.json 到 character 目录"""
    json_path = os.path.join(vfs_root, "character", "character.json")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    log.info(f"Saved: {json_path}")
    return json_path


def load_character_json(vfs_root: str) -> dict | None:
    """加载 character.json，文件不存在则返回 None"""
    json_path = os.path.join(vfs_root, "character", "character.json")
    if not os.path.isfile(json_path):
        return None
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        log.warning(f"Failed to read character.json: {e}")
        return None


# =============================================================================
# 内部辅助
# =============================================================================

def _split_team_suffix(dir_name: str) -> tuple:
    """拆分目录名为 (base, team_id)

    firebat_0 -> ("firebat", "0")
    tank01_1_0 -> ("tank01_1", "0")
    butcher -> (None, None)  # 无队伍后缀，跳过
    """
    for suffix in ("_0", "_1"):
        if dir_name.endswith(suffix):
            base = dir_name[:-2]
            team = suffix[1:]
            if base:
                return (base, team)
    return (None, None)


def _scan_team_dir(dir_path: str, dir_name: str,
                    vfs_root: str) -> dict | None:
    """扫描单个队伍目录，按类型分类所有 lua 文件

    返回结构:
        {
            "dir_name": "butcher_0",
            "fp_skeleton": "...",
            "tp_skeleton": "...",
            "animationset": "butcher",
            "outfits": [...],   # 含 character:SetMesh 的文件
            "hats": [...],      # DetachablePartInfo, joint="hat"
            "chests": [...],    # DetachablePartInfo, joint="chest"
            "medals": [...],    # DetachablePartInfo, joint="arm_r"
        }
    """
    all_lua = read_lua_files(dir_path)
    if not all_lua:
        return None

    team_data = {
        "dir_name": dir_name,
        "fp_skeleton": None,
        "tp_skeleton": None,
        "animationset": None,
        "outfits": [],
        "hats": [],
        "chests": [],
        "medals": [],
    }

    # skeleton 和 animationset 只从 all.lua 提取（基础配置）
    # 其他 outfit/皮肤文件有自己的 skeleton override，不应覆盖 team 级别
    all_content = all_lua.get("all")
    if all_content:
        extract_skeleton_info(all_content, team_data)

    # 按类型分类所有 lua 文件
    for stem, content in all_lua.items():
        if not content or stem == "all":
            continue

        if "character:SetMesh" in content:
            outfit = parse_outfit_config(stem, content, vfs_root)
            if outfit:
                team_data["outfits"].append(outfit)
        elif "DetachablePartInfo" in content:
            parts = parse_detachable_parts(stem, content)
            for dp in parts:
                joint = dp.get("joint", "")
                if joint == "hat":
                    team_data["hats"].append(dp)
                elif joint == "chest":
                    team_data["chests"].append(dp)
                elif joint == "arm_r":
                    team_data["medals"].append(dp)

    # 至少要有骨骼或装扮
    has_content = (
        team_data["outfits"]
        or team_data["hats"]
        or team_data["chests"]
        or team_data["medals"]
        or team_data["fp_skeleton"]
    )
    if not has_content:
        return None

    return team_data
