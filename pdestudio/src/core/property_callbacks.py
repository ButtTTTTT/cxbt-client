#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 属性变更回调函数

PropertyGroup 属性的 update 回调，用于实现 UI 联动逻辑：
- VFS 根目录变更 → 自动保存到偏好设置
- 类别/角色/队伍切换 → 重置配饰选择
- 动画类型/武器切换 → 重置动画列表
- 武器/场景列表索引变化 → 同步选中名称
"""

import bpy

from ..log import get_module_logger
from .package_info import get_main_package

log = get_module_logger("CORE")


def save_vfs_root_to_prefs(self, context):
    """用户改变 VFS 根目录时，自动保存到 AddonPreferences 并持久化。

    修改偏好设置属性后，必须调用 bpy.ops.wm.save_userpref()
    将变更写入用户偏好文件，否则关闭 Blender 后设置会丢失。
    """
    try:
        pkg = get_main_package()
        if not pkg:
            log.warning("save_vfs_root_to_prefs: 主包名未设置，无法保存")
            return

        prefs = context.preferences.addons.get(pkg)
        if not prefs or not prefs.preferences:
            # 诊断：列出所有已注册的 addon key，帮助确认正确的 key
            all_keys = list(context.preferences.addons.keys())
            log.warning(
                "save_vfs_root_to_prefs: 找不到插件偏好设置 (包名=%s), "
                "已注册的 addon keys: %s", pkg, all_keys
            )
            return

        prefs.preferences.vfs_root = self.import_vfs_root
        # 显式保存用户偏好，确保跨会话持久化
        bpy.ops.wm.save_userpref()
        log.info("VFS 根目录已保存到偏好设置: %s", self.import_vfs_root)
    except Exception as e:
        log.error("save_vfs_root_to_prefs 失败: %s", e)


def on_category_changed(self, context):
    """切换类别时重置角色和配饰选择"""
    self.char_sel_name = "NONE"
    self.char_sel_outfit = "NONE"
    self.char_sel_hat = "NONE"
    self.char_sel_chest = "NONE"
    self.char_sel_medal = "NONE"
    self.char_sel_anim_weapon = "NONE"
    self.char_anim_items.clear()


def on_character_changed(self, context):
    """切换角色时重置配饰选择"""
    self.char_sel_outfit = "NONE"
    self.char_sel_hat = "NONE"
    self.char_sel_chest = "NONE"
    self.char_sel_medal = "NONE"
    self.char_sel_anim_weapon = "NONE"
    self.char_anim_items.clear()


def on_team_changed(self, context):
    """切换队伍时重置配饰选择"""
    self.char_sel_outfit = "NONE"
    self.char_sel_hat = "NONE"
    self.char_sel_chest = "NONE"
    self.char_sel_medal = "NONE"
    self.char_sel_anim_weapon = "NONE"
    self.char_anim_items.clear()


def on_anim_type_changed(self, context):
    """切换动画类型时重置武器和动画列表"""
    self.char_sel_anim_weapon = "NONE"
    self.char_anim_items.clear()


def on_anim_weapon_changed(self, context):
    """切换武器时自动刷新动画列表"""
    self.char_anim_items.clear()
    if self.char_sel_anim_weapon != "NONE":
        bpy.ops.pde_studio.refresh_anim_list()


def on_weapon_index_changed(self, context):
    """武器列表选中索引变化时，同步 weapon_sel_name"""
    idx = self.weapon_index
    if 0 <= idx < len(self.weapon_items):
        self.weapon_sel_name = self.weapon_items[idx].name
    else:
        self.weapon_sel_name = "NONE"


def on_scene_index_changed(self, context):
    """场景列表选中索引变化时，同步 scene_sel_name"""
    idx = self.scene_index
    if 0 <= idx < len(self.scene_items):
        self.scene_sel_name = self.scene_items[idx].name
    else:
        self.scene_sel_name = "NONE"
