#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 角色导入 N 面板

独立的 Blender N 面板 (bl_category="PDE Character")，
用于扫描角色目录、选择角色/装扮/配饰并导入。
"""

import os
import bpy

from .enum_callbacks import (
    get_category_enum,
    get_character_enum,
    get_outfit_enum,
    get_hat_enum,
    get_chest_enum,
    get_medal_enum,
    _get_vfs_root,
)
from .scanner import load_character_json


class PDE_PT_CharacterMainPanel(bpy.types.Panel):
    """角色导入主面板"""

    bl_idname = "PDE_PT_character_main_panel"
    bl_label = "PDE Character Import"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Character"

    def draw(self, context):
        layout = self.layout
        props = context.scene.pde_studio_props

        # 清理按钮
        layout.operator("pde_studio.cleanup_unused_data",
                         text="Cleanup", icon="ORPHAN_DATA")
        layout.separator()

        layout.operator("pde_studio.scan_characters",
                         text="Scan Characters", icon="VIEWZOOM")

        # VFS Root 未设置时提示
        vfs_root = _get_vfs_root(props)
        if not vfs_root:
            box = layout.box()
            box.label(text="Set VFS Root in PDE Import", icon="ERROR")

        self._draw_json_status(layout, props)

    def _draw_json_status(self, layout, props):
        """显示 character.json 的存在状态和扫描时间"""
        vfs_root = _get_vfs_root(props)
        if not vfs_root:
            return

        json_path = os.path.join(vfs_root, "character", "character.json")
        if not os.path.isfile(json_path):
            box = layout.box()
            box.label(text="character.json not found", icon="ERROR")
            box.label(text="Click Scan first", icon="INFO")
            return

        data = load_character_json(vfs_root)
        if not data:
            box = layout.box()
            box.label(text="character.json load failed", icon="ERROR")
            return

        box = layout.box()
        scan_time = data.get("scan_time", "?")
        total = data.get("total_characters", 0)
        box.label(text=f"Characters: {total}", icon="CHECKMARK")
        box.label(text=f"Scan: {scan_time}", icon="TIME")


class PDE_PT_CharacterOptionsPanel(bpy.types.Panel):
    """角色选择和导入选项面板"""

    bl_idname = "PDE_PT_character_options_panel"
    bl_label = "Character Options"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Character"

    def draw(self, context):
        layout = self.layout
        props = context.scene.pde_studio_props

        # --- 类别 + 角色 + 队伍 ---
        layout.prop(props, "char_sel_category", text="Category")
        layout.prop(props, "char_sel_name", text="Character")
        layout.prop(props, "char_sel_team", text="Team")

        layout.separator()

        # --- 装扮 ---
        layout.prop(props, "char_sel_outfit", text="Outfit")

        layout.separator()

        # --- 视角和 LOD ---
        row = layout.row()
        row.prop(props, "char_sel_view", text="View")
        row = layout.row()
        row.prop(props, "char_sel_lod", text="LOD")

        # --- 导入按钮 ---
        layout.separator()
        layout.operator("pde_studio.import_character_tp",
                         text="Import Character", icon="IMPORT")
