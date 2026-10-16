#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 场景导入 N 面板

独立的 Blender N 面板 (bl_category="Scene Import")，
使用 UIList 实现高性能列表浏览和搜索。
"""

import os
import bpy
from bpy.types import Operator

from .scene_import_helpers import (
    get_vfs_root,
    get_scene_dir,
    get_scene_json,
    find_scene,
)


def _populate_scene_list(props):
    """从 scene.json 填充 scene_items CollectionProperty"""
    props.scene_items.clear()

    data = get_scene_json(props)
    if not data:
        return

    for scn in data.get("scenes", []):
        item = props.scene_items.add()
        item.name = scn.get("file_name") or ""
        item.map_name = scn.get("map_name") or ""
        item.scene_number = scn.get("scene_number") or 0
        item.type_label = scn.get("type") or ""
        item.obj_count = len(scn.get("active_objects") or [])
        item.gate_count = len(scn.get("gates") or [])


class PDE_OT_RefreshSceneList(Operator):
    """刷新场景列表（从 scene.json 重新加载）"""

    bl_idname = "pde_studio.refresh_scene_list"
    bl_label = "刷新列表"
    bl_description = "Reload scene list from scene.json"

    def execute(self, context):
        props = context.scene.pde_studio_props
        _populate_scene_list(props)
        count = len(props.scene_items)
        if count:
            props.scene_index = 0
        self.report({"INFO"}, f"Loaded {count} scenes")
        return {"FINISHED"}


class PDE_PT_ScenePanel(bpy.types.Panel):
    """场景导入面板"""

    bl_idname = "PDE_PT_scene_panel"
    bl_label = "PDE Scene Import"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Scene Import"

    def draw(self, context):
        layout = self.layout
        props = context.scene.pde_studio_props

        # --- 顶部工具栏 ---
        row = layout.row(align=True)
        row.operator("pde_studio.scan_scenes",
                     text="搜索地图", icon="VIEWZOOM")
        row.operator("pde_studio.refresh_scene_list",
                     text="", icon="FILE_REFRESH")
        row.operator("pde_studio.cleanup_unused_data",
                     text="", icon="ORPHAN_DATA")

        # --- JSON 状态 ---
        self._draw_json_status(layout, props)

        # --- 场景列表 ---
        if len(props.scene_items) == 0:
            data = get_scene_json(props)
            if data and data.get("scenes"):
                box = layout.box()
                box.label(text="Click refresh to load list", icon="INFO")
                box.operator("pde_studio.refresh_scene_list",
                             text="Load Scene List", icon="FILE_REFRESH")
            else:
                box = layout.box()
                box.label(text="No scenes loaded", icon="INFO")
                box.label(text="Scan scenes first", icon="INFO")
        else:
            layout.template_list(
                "PDE_UL_SceneList", "scene_list",
                props, "scene_items",
                props, "scene_index",
                rows=12,
            )

        # --- 当前选中 ---
        layout.separator()
        if props.scene_sel_name != "NONE":
            layout.label(text=f"Selected: {props.scene_sel_name}",
                        icon="CHECKMARK")
        else:
            layout.label(text="No scene selected", icon="INFO")

        # --- 导入选项 ---
        row = layout.row()
        row.prop(props, "scene_import_objects", text="Objects")
        row.prop(props, "scene_import_gates", text="Gates")

        # --- 导入按钮 ---
        layout.separator()
        layout.operator("pde_studio.import_scene",
                        text="导入", icon="IMPORT")

    def _draw_json_status(self, layout, props):
        scene_dir = get_scene_dir(props)
        if not scene_dir:
            box = layout.box()
            box.label(text="Set VFS Root in PDE Import", icon="ERROR")
            return

        json_path = os.path.join(scene_dir, "scene.json")
        if not os.path.isfile(json_path):
            box = layout.box()
            box.label(text="scene.json not found", icon="ERROR")
            box.label(text="Click Scan first", icon="INFO")
            return

        data = get_scene_json(props)
        if not data:
            box = layout.box()
            box.label(text="scene.json load failed", icon="ERROR")
            return

        box = layout.box()
        total = data.get("total_scenes", 0)
        scan_time = data.get("scan_time", "?")
        box.label(text=f"Scenes: {total}", icon="CHECKMARK")
        box.label(text=f"Scan: {scan_time}", icon="TIME")
