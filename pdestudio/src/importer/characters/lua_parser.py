#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 角色 Lua 配置解析

从角色 Lua 配置文件中提取 mesh 列表、骨骼路径、可拆卸部件等信息。
被 scanner.py 调用。
"""

import os
import re


def read_lua_files(dir_path: str) -> dict:
    """读取目录下所有 .lua 文件，返回 {stem: content}"""
    result = {}
    for fname in sorted(os.listdir(dir_path)):
        if not fname.endswith(".lua"):
            continue
        stem = fname[:-4]
        fpath = os.path.join(dir_path, fname)
        try:
            with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                content = f.read().strip()
            result[stem] = content
        except Exception:
            continue
    return result


def extract_skeleton_info(content: str, team_data: dict):
    """从 Lua 内容中提取 skeleton 和 animationset"""
    fp_m = re.search(r'first_person_skeleton\s*=\s*"([^"]+)"', content)
    if fp_m:
        team_data["fp_skeleton"] = fp_m.group(1)

    tp_m = re.search(r'third_person_skeleton\s*=\s*"([^"]+)"', content)
    if tp_m:
        team_data["tp_skeleton"] = tp_m.group(1)

    anim_m = re.search(
        r'(?:first|third)_person_animationset\s*=\s*"([^"]+)"', content)
    if anim_m:
        team_data["animationset"] = anim_m.group(1)


def parse_outfit_config(stem: str, content: str,
                          vfs_root: str) -> dict | None:
    """解析包含 SetMesh 的 body/outfit 配置"""
    meshes = []

    # 提取 SetMesh 调用
    mesh_pattern = (
        r'character:SetMesh\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*'
        r'(true|false)\s*(?:,\s*(\d+))?\s*\)'
    )
    for m in re.finditer(mesh_pattern, content):
        mesh_type = m.group(1)
        mesh_path = m.group(2)
        use_fp = m.group(3) == "true"
        lod = int(m.group(4)) if m.group(4) else None
        meshes.append({
            "type": mesh_type,
            "path": mesh_path,
            "use_for_fp": use_fp,
            "lod": lod,
        })

    if not meshes:
        return None

    # 从第一个 mesh 路径提取 TP 目录名
    tp_dir = None
    tp_meshes = []
    first_path = meshes[0]["path"]
    parts = first_path.split("/")
    if len(parts) >= 1:
        tp_dir = parts[0]
        tp_meshes = _scan_tp_dir(tp_dir, vfs_root)

    # skeleton/animationset 覆盖
    skel_override = None
    fp_m = re.search(r'first_person_skeleton\s*=\s*"([^"]+)"', content)
    tp_m = re.search(r'third_person_skeleton\s*=\s*"([^"]+)"', content)
    if fp_m or tp_m:
        skel_override = {
            "fp": fp_m.group(1) if fp_m else None,
            "tp": tp_m.group(1) if tp_m else None,
        }

    anim_override = None
    anim_m = re.search(
        r'(?:first|third)_person_animationset\s*=\s*"([^"]+)"', content)
    if anim_m:
        anim_override = anim_m.group(1)

    return {
        "name": stem,
        "meshes": meshes,
        "tp_dir": tp_dir,
        "tp_meshes": tp_meshes,
        "skeleton_override": skel_override,
        "animationset_override": anim_override,
    }


def _scan_tp_dir(tp_dir: str, vfs_root: str) -> list:
    """扫描 thirdperson 目录，返回 TP mesh 文件名列表(不含后缀)"""
    tp_path = os.path.join(vfs_root, "mesh", "character", "thirdperson", tp_dir)
    if not os.path.isdir(tp_path):
        return []

    result = []
    for fname in sorted(os.listdir(tp_path)):
        if fname.endswith(".mesh.cache"):
            result.append(fname[:-len(".mesh.cache")])
        elif fname.endswith(".mesh"):
            result.append(fname[:-len(".mesh")])
    return result


def parse_detachable_parts(stem: str, content: str) -> list:
    """解析 DetachablePartInfo 块，返回部件列表"""
    parts = []

    # 匹配 local xxx = DetachablePartInfo() ... SetDetachablePartInfo("key", xxx)
    pattern = (
        r'local\s+(\w+)\s*=\s*DetachablePartInfo\s*\(\s*\)(.*?)'
        r'character:SetDetachablePartInfo\s*\(\s*"([^"]+)"\s*,\s*\1\s*\)'
    )
    for m in re.finditer(pattern, content, re.DOTALL):
        block = m.group(2)
        key = m.group(3)

        part = {
            "name": stem,
            "key": key,
            "type": _classify_part(key),
            "skeleton": None,
            "joint": None,
            "mesh": None,
            "proportion": None,
            "animation_set": None,
            "particles": [],
        }

        skel_m = re.search(r'\.skeleton\s*=\s*"([^"]+)"', block)
        if skel_m:
            part["skeleton"] = skel_m.group(1)

        joint_m = re.search(r'\.joint\s*=\s*"([^"]+)"', block)
        if joint_m:
            part["joint"] = joint_m.group(1)

        mesh_m = re.search(r':SetMesh\s*\(\s*"([^"]+)"', block)
        if mesh_m:
            mesh_path = mesh_m.group(1)
            if not mesh_path.startswith("/"):
                mesh_path = f"/mesh/{mesh_path}"
            part["mesh"] = mesh_path

        prop_m = re.search(r'\.proportion\s*=\s*([\d.]+)', block)
        if prop_m:
            part["proportion"] = float(prop_m.group(1))

        anim_m = re.search(r':SetAnimationSet\s*\(\s*"([^"]+)"\s*\)', block)
        if anim_m:
            part["animation_set"] = anim_m.group(1)

        for pm in re.finditer(r':AddParticle\s*\(\s*"([^"]+)"\s*\)', block):
            part["particles"].append(pm.group(1))

        if part["skeleton"] or part["mesh"] or part["particles"]:
            parts.append(part)

    return parts


def _classify_part(key: str) -> str:
    """根据 key 判断部件类型"""
    if key == "hat":
        return "hat"
    if key == "chest":
        return "chest"
    if key == "arm_r":
        return "medal"
    return "part"
