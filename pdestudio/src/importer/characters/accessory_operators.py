#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 配饰独立导入操作符

支持独立导入帽子 (Hat)、胸件 (Chest)、勋章 (Medal)，
每个配饰有自己的骨骼和 mesh，可挂载到指定的角色骨骼上。
"""

import bpy
from bpy.types import Operator
from bpy.props import EnumProperty

from ...log import get_module_logger
from .enum_callbacks import _get_vfs_root, _get_json, _find_character
from .part_importer import import_parts

log = get_module_logger("CHAR_ACC")

# prop 属性名 → team 列表名
_ACC_MAP = {
    "hat": ("char_sel_hat", "hats"),
    "chest": ("char_sel_chest", "chests"),
    "medal": ("char_sel_medal", "medals"),
}


class PDE_OT_ImportAccessory(Operator):
    """独立导入选中的配饰 (帽子/胸件/勋章)"""

    bl_idname = "pde_studio.import_accessory"
    bl_label = "Import Accessory"
    bl_description = "Import the selected hat, chest, or medal accessory"

    accessory_type: EnumProperty(
        name="Type",
        items=[
            ("hat", "Hat", ""),
            ("chest", "Chest", ""),
            ("medal", "Medal", ""),
        ],
        default="hat",
    )  # type: ignore

    def execute(self, context):
        props = context.scene.pde_studio_props
        vfs_root = _get_vfs_root(props)

        if not vfs_root:
            self.report({"ERROR"}, "Set VFS root first!")
            return {"CANCELLED"}

        data = _get_json(props)
        if not data:
            self.report({"ERROR"}, "Scan characters first!")
            return {"CANCELLED"}

        if props.char_sel_name == "NONE":
            self.report({"WARNING"}, "Select a character first!")
            return {"CANCELLED"}

        char = _find_character(data, props.char_sel_name)
        if not char:
            self.report({"ERROR"}, f"Character not found: {props.char_sel_name}")
            return {"CANCELLED"}

        team = char["teams"].get(props.char_sel_team)
        if not team:
            self.report({"ERROR"}, "No team data")
            return {"CANCELLED"}

        prop_name, list_name = _ACC_MAP[self.accessory_type]
        sel = getattr(props, prop_name)
        if sel == "NONE":
            self.report({"WARNING"}, f"Select a {self.accessory_type} first!")
            return {"CANCELLED"}

        # 在 team 数据中查找选中的配饰
        part = None
        for dp in team.get(list_name, []):
            if dp["name"] == sel:
                part = dp
                break

        if not part:
            self.report({"ERROR"}, f"{self.accessory_type} not found: {sel}")
            return {"CANCELLED"}

        armature_obj = props.char_sel_part_armature
        if not armature_obj or armature_obj.type != 'ARMATURE':
            self.report({"ERROR"}, "Select a target armature!")
            return {"CANCELLED"}

        # 打印导入配置
        log.info(f"=== Import {self.accessory_type.title()} ===")
        log.info(f"  Character: {props.char_sel_name} (team={props.char_sel_team})")
        log.info(f"  Part: {sel} (joint={part.get('joint')})")
        if part.get("skeleton"):
            log.info(f"  Skeleton: {part['skeleton']}")
        if part.get("mesh"):
            log.info(f"  Mesh: {part['mesh']}")
        log.info(f"  Target Armature: {armature_obj.name}")

        count = import_parts(
            props, vfs_root, [part], armature_obj, self.report)

        if count > 0:
            log.info(f"Imported {self.accessory_type}: {sel} ({count} items)")
            self.report({"INFO"}, f"Imported {sel} ({count} items)")
            return {"FINISHED"}
        else:
            self.report({"WARNING"}, f"Nothing imported for {sel}")
            return {"CANCELLED"}
