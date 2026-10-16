#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 武器列表 PropertyGroup + UIList

为武器导入面板提供高性能的武器列表，支持 662+ 武器的流畅浏览和搜索。

利用 Blender UIList 的虚拟化渲染（只绘制可见行）和 C 层面的
filter_items_by_name 位掩码过滤，实现大规模列表的高性能显示。
"""

import bpy
from bpy.types import PropertyGroup, UIList
from bpy.props import StringProperty, IntProperty


class PDE_WeaponListItem(PropertyGroup):
    """武器列表项 — 每项对应 weapon.json 中的一个武器"""

    name: StringProperty(
        name="Name",
        description="Weapon name",
    )  # type: ignore

    mesh_count: IntProperty(
        name="Meshes",
        description="Number of base meshes",
        default=0,
    )  # type: ignore

    fx_count: IntProperty(
        name="FX Meshes",
        description="Number of FX meshes",
        default=0,
    )  # type: ignore


class PDE_UL_WeaponList(UIList):
    """武器列表 — 虚拟化渲染，支持内置搜索过滤和排序

    Blender 的 UIList 只绘制可见的行（约 8-15 行），无论列表有
    多少项。filter_items() 使用 filter_items_by_name 在 C 层面
    做位掩码过滤，非常高效。
    """

    def draw_item(self, context, layout, data, item,
                  icon, active_data, active_property, index):
        if self.layout_type in {'DEFAULT', 'COMPACT'}:
            row = layout.row(align=True)
            label = item.name
            if item.mesh_count or item.fx_count:
                label = f"{item.name}  [{item.mesh_count}m"
                if item.fx_count:
                    label += f"/{item.fx_count}fx"
                label += "]"
            row.label(text=label, icon="OUTLINER_OB_LIGHT")
        elif self.layout_type == 'GRID':
            layout.alignment = 'CENTER'
            layout.label(text=item.name, icon="OUTLINER_OB_LIGHT")

