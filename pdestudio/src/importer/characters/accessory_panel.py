#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 配饰独立折叠面板

三个独立折叠面板: Hat / Chest / Medal，
每个面板包含: 选择下拉框 + 目标骨骼 + 导入按钮。
"""

import bpy


def _draw_accessory(layout, props, enum_prop, acc_type, icon):
    """通用配饰面板绘制

    Args:
        layout: Blender layout
        props: scene properties
        enum_prop: EnumProperty 名称 ("char_sel_hat" 等)
        acc_type: 配饰类型 ("hat"/"chest"/"medal")
        icon: Blender icon 字符串
    """
    layout.prop(props, enum_prop, text="Select")

    layout.separator()
    layout.prop(props, "char_sel_part_armature", text="Armature")

    op = layout.operator(
        "pde_studio.import_accessory",
        text="Import", icon="IMPORT",
    )
    op.accessory_type = acc_type


class PDE_PT_HatPanel(bpy.types.Panel):
    """帽子导入折叠面板"""

    bl_idname = "PDE_PT_character_hat_panel"
    bl_label = "Hat"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Character"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, context):
        _draw_accessory(
            self.layout, context.scene.pde_studio_props,
            "char_sel_hat", "hat", "OUTLINER_OB_FORCE_FIELD",
        )


class PDE_PT_ChestPanel(bpy.types.Panel):
    """胸件/翅膀导入折叠面板"""

    bl_idname = "PDE_PT_character_chest_panel"
    bl_label = "Chest"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Character"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, context):
        _draw_accessory(
            self.layout, context.scene.pde_studio_props,
            "char_sel_chest", "chest", "MOD_CLOTH",
        )


class PDE_PT_MedalPanel(bpy.types.Panel):
    """勋章导入折叠面板"""

    bl_idname = "PDE_PT_character_medal_panel"
    bl_label = "Medal"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Character"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, context):
        _draw_accessory(
            self.layout, context.scene.pde_studio_props,
            "char_sel_medal", "medal", "COLOR",
        )
