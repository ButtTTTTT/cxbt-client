#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 主包名管理

存储和提供主包名，供 PDEStudioAddonPreferences 和属性回调使用。
独立模块，无其他依赖，避免循环引用。
"""

_PACKAGE = None


def set_main_package(pkg: str):
    """设置主包名（在 registration.register() 中调用）"""
    global _PACKAGE
    _PACKAGE = pkg


def get_main_package() -> str:
    """获取主包名"""
    return _PACKAGE
