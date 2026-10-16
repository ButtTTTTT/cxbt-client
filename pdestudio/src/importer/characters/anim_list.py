#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 动画列表 PropertyGroup + UIList

为动画选择面板提供可勾选的动画列表项和 UIList 绘制。
"""

import bpy
from bpy.types import PropertyGroup, UIList
from bpy.props import StringProperty, BoolProperty


class PDE_AnimListItem(PropertyGroup):
    """动画列表项 — 每项对应一个 .anim.cache 文件"""

    name: StringProperty(
        name="Name",
        description="Animation name (without extension)",
    )  # type: ignore

    filepath: StringProperty(
        name="Filepath",
        description="Full path to .anim.cache file on disk",
    )  # type: ignore

    vfs_path: StringProperty(
        name="VFS Path",
        description="VFS path used for CRC verification",
    )  # type: ignore

    selected: BoolProperty(
        name="Import",
        description="Check to import this animation",
        default=True,
    )  # type: ignore


class PDE_UL_AnimList(UIList):
    """动画列表 — 每行带勾选框 + 动画名"""

    def draw_item(self, context, layout, data, item,
                  icon, active_data, active_property, index):
        if self.layout_type in {'DEFAULT', 'COMPACT'}:
            row = layout.row(align=True)
            row.prop(item, "selected", text="")
            row.label(text=item.name, icon="ACTION")
        elif self.layout_type == 'GRID':
            layout.alignment = 'CENTER'
            layout.prop(item, "selected", text="")
            layout.label(text=item.name, icon="ACTION")
