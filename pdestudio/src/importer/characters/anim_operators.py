#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 动画选择操作符

操作符:
- PDE_OT_RefreshAnimList: 扫描动画目录，填充动画列表
- PDE_OT_AnimSelectAll:   全选
- PDE_OT_AnimDeselectAll: 全不选
- PDE_OT_ImportAnimations: 导入选中的动画
"""

import os
import bpy
from bpy.types import Operator

from ...log import get_module_logger
from .enum_callbacks import _get_vfs_root, _get_json, _find_character
from .constants import ANIM_TYPE_PATHS

log = get_module_logger("CHAR_ANIM")


class PDE_OT_RefreshAnimList(Operator):
    """扫描当前角色+类型+武器的动画目录，刷新动画列表"""

    bl_idname = "pde_studio.refresh_anim_list"
    bl_label = "Refresh"
    bl_description = "Scan animation directory and populate the list"

    def execute(self, context):
        props = context.scene.pde_studio_props
        vfs_root = _get_vfs_root(props)
        if not vfs_root:
            self.report({"ERROR"}, "Set VFS root first!")
            return {"CANCELLED"}

        if props.char_sel_name == "NONE":
            self.report({"WARNING"}, "Select a character first!")
            return {"CANCELLED"}

        data = _get_json(props)
        if not data:
            self.report({"ERROR"}, "Scan characters first!")
            return {"CANCELLED"}

        char = _find_character(data, props.char_sel_name)
        if not char:
            self.report({"ERROR"}, f"Character not found: {props.char_sel_name}")
            return {"CANCELLED"}

        team = char["teams"].get(props.char_sel_team)
        if not team:
            self.report({"ERROR"}, "No team data")
            return {"CANCELLED"}

        animset = team.get("animationset")
        if not animset:
            self.report({"WARNING"}, "No animationset in character data")
            return {"CANCELLED"}

        anim_type = props.char_sel_anim_type
        cat, view = ANIM_TYPE_PATHS.get(
            anim_type, ("character", "thirdperson"))

        anim_dir = os.path.join(
            vfs_root, "animation", cat, view, animset)
        if not os.path.isdir(anim_dir):
            self.report(
                {"WARNING"},
                f"Dir not found: animation/{cat}/{view}/{animset}")
            return {"CANCELLED"}

        weapon = props.char_sel_anim_weapon
        if weapon == "NONE":
            self.report({"WARNING"}, "Select a weapon first!")
            return {"CANCELLED"}

        weapon_dir = os.path.join(anim_dir, weapon)
        if not os.path.isdir(weapon_dir):
            self.report({"WARNING"}, f"Weapon dir not found: {weapon}")
            return {"CANCELLED"}

        # 清空并重新填充列表
        props.char_anim_items.clear()
        count = 0
        for fname in sorted(os.listdir(weapon_dir)):
            if not (fname.endswith(".anim.cache")
                    or fname.endswith(".anim")):
                continue

            anim_name = fname
            for ext in [".anim.cache", ".anim"]:
                if anim_name.endswith(ext):
                    anim_name = anim_name[:-len(ext)]

            vfs_path = (
                f"/animation/{cat}/{view}/"
                f"{animset}/{weapon}/{fname}"
            )

            item = props.char_anim_items.add()
            item.name = anim_name
            item.filepath = os.path.join(weapon_dir, fname)
            item.vfs_path = vfs_path
            item.selected = False
            count += 1

        log.info(f"Refreshed anim list: {count} items "
                 f"({cat}/{view}/{animset}/{weapon})")
        self.report({"INFO"}, f"Found {count} animations")
        return {"FINISHED"}


class PDE_OT_AnimSelectAll(Operator):
    """全选动画列表"""

    bl_idname = "pde_studio.anim_select_all"
    bl_label = "Select All"

    def execute(self, context):
        props = context.scene.pde_studio_props
        for item in props.char_anim_items:
            item.selected = True
        return {"FINISHED"}


class PDE_OT_AnimDeselectAll(Operator):
    """取消全选动画列表"""

    bl_idname = "pde_studio.anim_deselect_all"
    bl_label = "Deselect All"

    def execute(self, context):
        props = context.scene.pde_studio_props
        for item in props.char_anim_items:
            item.selected = False
        return {"FINISHED"}


class PDE_OT_ImportAnimations(Operator):
    """导入选中的动画到指定骨骼"""

    bl_idname = "pde_studio.import_animations"
    bl_label = "Import Selected"
    bl_description = "Import checked animations from the list"

    def execute(self, context):
        props = context.scene.pde_studio_props

        armature_obj = props.char_sel_anim_armature
        if not armature_obj or armature_obj.type != 'ARMATURE':
            self.report({"ERROR"}, "Select a target armature!")
            return {"CANCELLED"}

        selected = [item for item in props.char_anim_items
                    if item.selected]
        if not selected:
            self.report({"WARNING"}, "No animations selected!")
            return {"CANCELLED"}

        # 打印导入配置
        log.info(f"=== Import Animations ===")
        log.info(f"  Target Armature: {armature_obj.name}")
        log.info(f"  Selected: {len(selected)} animations")
        for item in selected:
            log.info(f"  Anim: {item.name} -> {item.vfs_path}")

        from ..common import load_and_decode
        from ..binary.animation import parse_animation_binary
        from ..core.animation_builder import import_animation_to_blender

        coord_mode = props.import_coord_mode
        scale = props.import_scale
        count = 0

        for item in selected:
            try:
                header, data = load_and_decode(
                    item.filepath, vfs_path=item.vfs_path,
                    verify_crc=props.import_verify_crc)
                anim = parse_animation_binary(data)
                action = import_animation_to_blender(
                    anim, armature_obj=armature_obj,
                    action_name=item.name, scale=scale,
                    coord_mode=coord_mode)
                if action:
                    count += 1
                    log.info(f"Imported anim: {item.name}")
            except Exception as e:
                log.warning(f"Anim import failed {item.name}: {e}")
                self.report(
                    {"WARNING"}, f"Failed: {item.name}: {e}")

        if count > 0:
            # 播放同步：Blender 默认的 Play Every Frame 会在渲染跟不上时
            # 让预览整体变慢，切成实时推进后与游戏/Babylon 速度一致。
            if props.char_sel_anim_set_framedrop:
                context.scene.sync_mode = 'FRAME_DROP'
            self.report({"INFO"}, f"Imported {count} animations")
            return {"FINISHED"}
        else:
            self.report({"WARNING"}, "No animations imported")
            return {"CANCELLED"}
