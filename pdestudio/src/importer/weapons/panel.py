#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 武器导入 N 面板

独立的 Blender N 面板 (bl_category="PDE Weapon")，
用于扫描武器目录、搜索武器并导入。

使用 Blender UIList 实现高性能列表，支持 662+ 武器的流畅浏览。
"""

import os
import bpy
from bpy.types import Operator

from .operators import (
    _get_vfs_root,
    _get_weapon_src_dir,
    _get_weapon_json,
    _find_weapon,
)


def _populate_weapon_list(props):
    """从 weapon.json 填充 weapon_items CollectionProperty

    在扫描完成或刷新时调用。列表项只保存轻量的显示数据
    (name, mesh_count, fx_count)，完整武器数据仍从 JSON 读取。
    """
    props.weapon_items.clear()

    data = _get_weapon_json(props)
    if not data:
        return

    for wpn in data.get("weapons", []):
        name = wpn.get("name", "")
        if not name:
            continue
        item = props.weapon_items.add()
        item.name = name
        item.mesh_count = len(wpn.get("meshes", []))
        item.fx_count = len(wpn.get("fx_meshes", []))


class PDE_OT_RefreshWeaponList(Operator):
    """刷新武器列表（从 weapon.json 重新加载）"""

    bl_idname = "pde_studio.refresh_weapon_list"
    bl_label = "Refresh List"
    bl_description = "Reload weapon list from weapon.json"

    def execute(self, context):
        props = context.scene.pde_studio_props
        _populate_weapon_list(props)
        count = len(props.weapon_items)
        if count:
            props.weapon_index = 0  # 触发 update 回调自动同步 weapon_sel_name
        self.report({"INFO"}, f"Loaded {count} weapons")
        return {"FINISHED"}


def _get_fx_level_enum(props, context):
    """构建强化等级枚举列表"""
    if props.weapon_sel_name == "NONE":
        return [("NONE", "--", "")]

    data = _get_weapon_json(props)
    if not data:
        return [("NONE", "--", "")]

    wpn = _find_weapon(data, props.weapon_sel_name)
    if not wpn:
        return [("NONE", "--", "")]

    levels = sorted(set(fx["level"] for fx in wpn.get("fx_meshes", [])))
    items = [(str(lvl), f"+{lvl}", "") for lvl in levels]
    return [("NONE", "--", "")] + items if items else [("NONE", "--", "")]


class PDE_PT_WeaponMainPanel(bpy.types.Panel):
    """武器导入主面板"""

    bl_idname = "PDE_PT_weapon_main_panel"
    bl_label = "PDE Weapon Import"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Weapon"

    def draw(self, context):
        layout = self.layout
        props = context.scene.pde_studio_props

        # 清理按钮
        layout.operator("pde_studio.cleanup_unused_data",
                         text="Cleanup", icon="ORPHAN_DATA")
        layout.separator()

        row = layout.row(align=True)
        row.operator("pde_studio.scan_weapons",
                     text="Scan Weapons", icon="VIEWZOOM")
        row.operator("pde_studio.refresh_weapon_list",
                     text="", icon="FILE_REFRESH")

        # VFS Root 未设置时提示
        vfs_root = _get_vfs_root(props)
        if not vfs_root:
            box = layout.box()
            box.label(text="Set VFS Root in PDE Import", icon="ERROR")

        self._draw_json_status(layout, props)

    def _draw_json_status(self, layout, props):
        src_dir = _get_weapon_src_dir(props)
        if not src_dir:
            return

        json_path = os.path.join(src_dir, "weapon.json")
        if not os.path.isfile(json_path):
            box = layout.box()
            box.label(text="weapon.json not found", icon="ERROR")
            box.label(text="Click Scan first", icon="INFO")
            return

        data = _get_weapon_json(props)
        if not data:
            box = layout.box()
            box.label(text="weapon.json load failed", icon="ERROR")
            return

        box = layout.box()
        total = data.get("total_weapons", 0)
        scan_time = data.get("scan_time", "?")
        box.label(text=f"Weapons: {total}", icon="CHECKMARK")
        box.label(text=f"Scan: {scan_time}", icon="TIME")


class PDE_PT_WeaponOptionsPanel(bpy.types.Panel):
    """武器选择和导入选项面板"""

    bl_idname = "PDE_PT_weapon_options_panel"
    bl_label = "Weapon Options"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Weapon"

    def draw(self, context):
        layout = self.layout
        props = context.scene.pde_studio_props

        # 如果列表为空但 JSON 存在，提示刷新
        if len(props.weapon_items) == 0:
            data = _get_weapon_json(props)
            if data and data.get("weapons"):
                box = layout.box()
                box.label(text="Click refresh to load list", icon="INFO")
                box.operator("pde_studio.refresh_weapon_list",
                             text="Load Weapon List", icon="FILE_REFRESH")
            else:
                box = layout.box()
                box.label(text="No weapons loaded", icon="INFO")
                box.label(text="Scan weapons first", icon="INFO")
        else:
            # 武器列表 — 使用 UIList 虚拟化渲染
            # 无论有 10 个还是 662 个武器，只绘制可见的行
            # 选中索引变化时，weapon_index 的 update 回调自动同步 weapon_sel_name
            layout.template_list(
                "PDE_UL_WeaponList", "weapon_list",
                props, "weapon_items",
                props, "weapon_index",
                rows=12,
            )

        # 当前选中的武器
        layout.separator()
        if props.weapon_sel_name != "NONE":
            layout.label(text=f"Selected: {props.weapon_sel_name}",
                         icon="CHECKMARK")
        else:
            layout.label(text="No weapon selected", icon="INFO")

        # LOD 选择
        row = layout.row()
        row.prop(props, "weapon_sel_lod", text="LOD")

        # 强化特效
        row = layout.row()
        row.prop(props, "weapon_import_fx", text="Import FX")
        if props.weapon_import_fx:
            layout.prop(props, "weapon_sel_fx_level", text="FX Level")

        # 导入按钮
        layout.separator()
        layout.operator("pde_studio.import_weapon",
                        text="Import Weapon", icon="IMPORT")


class PDE_OT_WeaponSelect(bpy.types.Operator):
    """选择武器（从列表中点击）"""

    bl_idname = "pde_studio.weapon_select"
    bl_label = "Select Weapon"

    weapon_name: bpy.props.StringProperty()

    def execute(self, context):
        props = context.scene.pde_studio_props
        props.weapon_sel_name = self.weapon_name
        # 同步索引
        for i, item in enumerate(props.weapon_items):
            if item.name == self.weapon_name:
                props.weapon_index = i
                break
        return {"FINISHED"}
