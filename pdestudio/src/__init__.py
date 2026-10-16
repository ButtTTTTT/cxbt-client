#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - Blender PDE引擎导出/导入插件

导出: Blender → PDE Lua 明文 → client.exe 编译为 .cache
导入: 原版 .cache 二进制 → Blender mesh/skel/anim
支持: .mesh / .skel / .anim (.cache)
Blender 5.1.2+

模块结构:
  core/         — 插件属性定义、注册逻辑
  exporter/     — Blender → PDE 导出器
  importer/     — .cache → Blender 导入器
  ui/          — 导出操作符和面板 (子包)
  log.py        — 日志工具
"""

import sys
import os

# 强制设置标准输出编码为 UTF-8（Windows 系统必需）
if sys.platform == 'win32':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')

from .log import get_module_logger
from .core import registration

log = get_module_logger("CORE")

# 主包名
# 在 Blender 4.2+ 扩展系统下为 "bl_ext.<repo>.src"
# context.preferences.addons 的 key 与此一致
MAIN_PACKAGE = __package__

__all__ = ("MAIN_PACKAGE",)


def register():
    """注册插件"""
    registration.register(MAIN_PACKAGE)


def unregister():
    """注销插件"""
    registration.unregister()
