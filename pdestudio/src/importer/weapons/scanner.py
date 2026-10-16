#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 武器扫描器

扫描武器配置目录 (data/weapon/), 生成 weapon.json 缓存文件。

武器配置 Lua 文件不在 VFS 缓存目录中, 而是在源码目录中:
  <src_root>/data/weapon/<weapon_name>/<config>.lua

武器 mesh 和骨骼在 VFS 缓存目录中:
  /mesh/prop/weapon/<weapon_name>/<mesh>.mesh.cache
  /skeleton/<skeleton>.skel.cache
"""

import os
import json
from datetime import datetime
from typing import Dict, List

from ...log import get_module_logger
from .lua_parser import parse_weapon_lua, merge_weapon_configs

log = get_module_logger("WPN_SCAN")


def scan_weapons(weapon_src_dir: str) -> dict:
    """扫描武器源码目录, 生成 weapon.json 数据

    Args:
        weapon_src_dir: 武器配置源码目录 (如 .../data/weapon/)

    Returns:
        {
            "scan_time": "...",
            "total_weapons": N,
            "weapons": [
                {
                    "name": "ak47",
                    "skeleton": "/skeleton/ak47skeleton.skel",
                    "animation_set": "ak47",
                    "meshes": [...],
                    "fx_meshes": [...],
                },
                ...
            ]
        }
    """
    result = {
        "scan_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_weapons": 0,
        "weapons": [],
    }

    if not os.path.isdir(weapon_src_dir):
        log.warning(f"武器目录不存在: {weapon_src_dir}")
        return result

    weapons = []

    for wname in sorted(os.listdir(weapon_src_dir)):
        wdir = os.path.join(weapon_src_dir, wname)
        if not os.path.isdir(wdir):
            continue

        configs = []
        for fname in sorted(os.listdir(wdir)):
            if not fname.endswith(".lua"):
                continue
            fpath = os.path.join(wdir, fname)
            try:
                with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
                stem = os.path.splitext(fname)[0]
                cfg = parse_weapon_lua(stem, content)
                if cfg.get("name") or cfg.get("meshes"):
                    configs.append(cfg)
            except Exception as e:
                log.warning(f"解析失败 {fname}: {e}")

        if not configs:
            continue

        merged = merge_weapon_configs(configs)
        if not merged.get("name"):
            merged["name"] = wname

        weapons.append(merged)

    result["weapons"] = weapons
    result["total_weapons"] = len(weapons)
    log.info(f"扫描完成: {len(weapons)} 个武器")

    return result


def save_weapon_json(data: dict, weapon_src_dir: str) -> str:
    """保存 weapon.json 到武器源码目录

    Returns:
        JSON 文件路径
    """
    json_path = os.path.join(weapon_src_dir, "weapon.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    log.info(f"保存: {json_path}")
    return json_path


def load_weapon_json(weapon_src_dir: str) -> dict | None:
    """加载 weapon.json

    Returns:
        武器数据字典, 如果文件不存在则返回 None
    """
    json_path = os.path.join(weapon_src_dir, "weapon.json")
    if not os.path.isfile(json_path):
        return None

    try:
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log.warning(f"加载 weapon.json 失败: {e}")
        return None
