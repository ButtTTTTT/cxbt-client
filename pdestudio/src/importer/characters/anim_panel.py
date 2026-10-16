#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 动画选择面板

独立的动画选择和导入面板，支持:
- 动画类型 (角色TP/FP, 道具TP/FP)
- 武器变体选择
- 动画列表勾选
- 导入到指定骨骼
"""

import bpy


class PDE_PT_CharacterAnimationPanel(bpy.types.Panel):
    """动画选择和导入面板"""

    bl_idname = "PDE_PT_character_animation_panel"
    bl_label = "Animation Import"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Character"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, context):
        layout = self.layout
        props = context.scene.pde_studio_props

        # --- 类型 + 武器 ---
        layout.prop(props, "char_sel_anim_type", text="Type")
        layout.prop(props, "char_sel_anim_weapon", text="Weapon")

        # --- 刷新按钮 ---
        layout.operator("pde_studio.refresh_anim_list",
                         text="Refresh List", icon="FILE_REFRESH")

        # --- 动画列表 ---
        layout.template_list(
            "PDE_UL_AnimList", "anim_list",
            props, "char_anim_items",
            props, "char_anim_index",
            rows=8,
        )

        # --- 全选/全不选 ---
        row = layout.row(align=True)
        row.operator("pde_studio.anim_select_all",
                      text="All", icon="CHECKBOX_HLT")
        row.operator("pde_studio.anim_deselect_all",
                      text="None", icon="CHECKBOX_DEHLT")

        # --- 目标骨骼 ---
        layout.separator()
        layout.prop(props, "char_sel_anim_armature", text="Armature")

        # --- 播放同步（默认勾选）---
        # Blender 默认 Play Every Frame 会让预览随渲染速度变慢，
        # 勾选后改为按真实时间推进，与游戏/Babylon 一致。
        layout.prop(props, "char_sel_anim_set_framedrop")

        # --- 导入按钮 ---
        layout.operator("pde_studio.import_animations",
                         text="Import Selected", icon="IMPORT")
