#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 手动导入 VFS 辅助函数

从文件路径推导 VFS 路径、提取资源名等。
仅用于手动导入操作符。
"""

import os


def get_resource_name(filepath: str) -> str:
    """从文件路径提取资源名称"""
    basename = os.path.basename(filepath)
    for ext in ['.mesh.cache', '.skel.cache', '.anim.cache', '.mesh', '.skel', '.anim']:
        if basename.endswith(ext):
            return basename[:-len(ext)]
    return os.path.splitext(basename)[0]


def auto_vfs_path(filepath: str) -> str:
    """从文件路径自动推导 VFS 路径

    例如: D:\\Games\\FC1.0.6.8166\\finalcombat_cache=\\mesh\\prop\\goldcoin\\goldcoin.mesh.cache
    → /mesh/prop/goldcoin/goldcoin.mesh
    """
    norm_path = filepath.replace('\\', '/')

    markers = ['finalcombat_cache=', 'finalcombat_cache']
    for marker in markers:
        idx = norm_path.lower().find(marker.lower())
        if idx >= 0:
            vfs_part = norm_path[idx + len(marker):]
            if vfs_part.lower().endswith('.cache'):
                vfs_part = vfs_part[:-6]
            if not vfs_part.startswith('/'):
                vfs_part = '/' + vfs_part
            return vfs_part

    res_name = get_resource_name(filepath)
    if '.skel' in filepath.lower():
        return f"/skeleton/{res_name}.skel"
    elif '.anim' in filepath.lower():
        return f"/animation/{res_name}.anim"
    else:
        return f"/mesh/{res_name}.mesh"


def extract_vfs_root(filepath: str) -> str:
    """从文件路径提取 VFS 根目录

    例如: D:\\Games\\FC1.0.6.8166\\finalcombat_cache=\\mesh\\prop\\goldcoin\\goldcoin.mesh.cache
    → D:\\Games\\FC1.0.6.8166\\finalcombat_cache=
    """
    norm_path = filepath.replace('\\', '/')
    markers = ['finalcombat_cache=', 'finalcombat_cache']
    for marker in markers:
        idx = norm_path.lower().find(marker.lower())
        if idx >= 0:
            return filepath[:idx + len(marker)]
    return ""


def smart_vfs_path(user_vfs_root: str, filepath: str) -> str:
    """智能确定 VFS 路径（始终从文件路径自动推导）"""
    return auto_vfs_path(filepath)
