#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 导入共用函数

被 manual/ 和 characters/ 两个子包共用的通用函数。
"""

import os

from ..log import get_module_logger

log = get_module_logger("COMMON")


def load_and_decode(filepath: str, vfs_path: str = "", verify_crc: bool = True):
    """读取文件并解码，返回 (header_or_None, decompressed_data) 或抛出异常"""
    from .binary.cache_decoder import (
        decode_cache_header, decode_cache_data, detect_file_format,
    )

    if not os.path.isfile(filepath):
        raise FileNotFoundError(f"文件不存在: {filepath}")

    if os.path.getsize(filepath) < 4:
        raise ValueError(f"文件过小（{os.path.getsize(filepath)}字节），不是有效的 PDE 资源文件")

    with open(filepath, 'rb') as f:
        raw = f.read()

    fmt = detect_file_format(filepath)
    display_path = vfs_path if vfs_path else filepath
    log.info(f"文件格式: {fmt} ({len(raw)} bytes) | {display_path}")

    if fmt == "lua":
        raise RuntimeError("Lua 明文格式暂不支持导入，请使用 .cache 二进制格式")

    if fmt == "unknown":
        log.warning(f"文件格式未识别，尝试按 .cache 格式解码")

    data = decode_cache_data(raw, vfs_path=vfs_path, verify_crc=verify_crc)

    header = None
    try:
        h, _ = decode_cache_header(raw)
        if h.pack_ver == 2:
            header = h
    except Exception:
        pass

    return header, data


def resolve_vfs_file(base_path: str, suffixes: list = None) -> str:
    """在 VFS 根目录中查找实际存在的文件

    Args:
        base_path: 基础本地路径（不含后缀），如 D:\\...\\cloth01_lod0.mesh
        suffixes: 后缀优先级列表，默认 ['.cache', '']

    Returns:
        存在的文件完整路径，或 None
    """
    if suffixes is None:
        suffixes = ['.cache', '']
    for suffix in suffixes:
        candidate = base_path + suffix
        if os.path.isfile(candidate):
            return candidate
    return None
