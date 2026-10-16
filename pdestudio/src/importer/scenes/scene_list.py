#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 场景列表 PropertyGroup + UIList

利用 Blender UIList 虚拟化渲染，支持大量场景的流畅浏览和搜索。
"""

import bpy
from bpy.types import PropertyGroup, UIList
from bpy.props import StringProperty, IntProperty


class PDE_SceneListItem(PropertyGroup):
    """场景列表项"""

    name: StringProperty(
        name="Name",
        description="Scene file name",
    )  # type: ignore

    map_name: StringProperty(
        name="Map Name",
        description="Map display name",
        default="",
    )  # type: ignore

    scene_number: IntProperty(
        name="Scene",
        description="Scene number",
        default=0,
    )  # type: ignore

    type_label: StringProperty(
        name="Type",
        description="Scene type label",
        default="",
    )  # type: ignore

    obj_count: IntProperty(
        name="Objects",
        description="Active object count",
        default=0,
    )  # type: ignore

    gate_count: IntProperty(
        name="Gates",
        description="Gate count",
        default=0,
    )  # type: ignore


class PDE_UL_SceneList(UIList):
    """场景列表 — 虚拟化渲染，支持内置搜索过滤"""

    def draw_item(self, context, layout, data, item,
                  icon, active_data, active_property, index):
        if self.layout_type in {'DEFAULT', 'COMPACT'}:
            row = layout.row(align=True)
            # 显示: 编号 地图名 [类型] (obj/gate)
            if item.scene_number > 0:
                label = f"{item.scene_number}  {item.map_name or item.name}"
            else:
                label = item.map_name or item.name
            if item.type_label:
                label += f"  [{item.type_label}]"
            extras = []
            if item.obj_count:
                extras.append(f"{item.obj_count}obj")
            if item.gate_count:
                extras.append(f"{item.gate_count}gate")
            if extras:
                label += f"  ({'/'.join(extras)})"
            row.label(text=label, icon="WORLD")
        elif self.layout_type == 'GRID':
            layout.alignment = 'CENTER'
            layout.label(text=item.map_name or item.name, icon="WORLD")
