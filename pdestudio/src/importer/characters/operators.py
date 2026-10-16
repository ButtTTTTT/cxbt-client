#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 角色导入操作符

包含:
- PDE_OT_ScanCharacters: 扫描 character 目录生成 character.json
- PDE_OT_ImportCharacterTP: 从 character.json 选择性导入角色
"""

import bpy
from bpy.types import Operator

from ...log import get_module_logger
from .scanner import scan_character_directory, save_character_json
from .enum_callbacks import _get_vfs_root, _get_json, _find_character
from .importer import import_character

log = get_module_logger("CHAR_OPS")


class PDE_OT_ScanCharacters(Operator):
    """扫描 character 目录，生成 character.json 索引文件"""

    bl_idname = "pde_studio.scan_characters"
    bl_label = "Scan Characters"
    bl_description = "Scan character directory and generate character.json"

    def execute(self, context):
        props = context.scene.pde_studio_props
        vfs_root = _get_vfs_root(props)

        if not vfs_root:
            self.report({"ERROR"}, "Set VFS root first!")
            return {"CANCELLED"}

        try:
            data = scan_character_directory(vfs_root)
            json_path = save_character_json(data, vfs_root)

            total = data["total_characters"]
            self.report({"INFO"}, f"Scan done: {total} characters")
            log.info(f"Scan done: {total} characters")

            props.char_sel_name = "NONE"
            props.char_sel_outfit = "NONE"
            props.char_sel_hat = "NONE"
            props.char_sel_chest = "NONE"
            props.char_sel_medal = "NONE"

        except FileNotFoundError as e:
            self.report({"ERROR"}, f"Dir not found: {e}")
            return {"CANCELLED"}
        except Exception as e:
            self.report({"ERROR"}, f"Scan failed: {e}")
            return {"CANCELLED"}

        return {"FINISHED"}


class PDE_OT_ImportCharacterTP(Operator):
    """根据 character.json 选择性导入角色资源"""

    bl_idname = "pde_studio.import_character_tp"
    bl_label = "Import Character"
    bl_description = "Import skeleton, meshes, accessories, animation from character.json"

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
            self.report({"WARNING"}, "Select a character!")
            return {"CANCELLED"}

        # 验证 char_sel_name 是否在当前类别中
        from .constants import CHARACTER_MAP
        sel_cat = props.char_sel_category
        valid_names = [name for name, (cat, _) in CHARACTER_MAP.items()
                       if cat == sel_cat]
        log.info(f"  Category={sel_cat}, char_sel_name={props.char_sel_name}")
        log.info(f"  Valid names: {valid_names}")
        if props.char_sel_name not in valid_names:
            log.error(f"BUG: char_sel_name '{props.char_sel_name}' "
                      f"not in category '{sel_cat}'!")
            self.report({"ERROR"},
                        f"Character selection bug! Selected: "
                        f"{props.char_sel_name}, Category: {sel_cat}. "
                        f"Try reselecting the character.")
            return {"CANCELLED"}

        char = _find_character(data, props.char_sel_name)
        if not char:
            self.report({"ERROR"}, f"Character not found: {props.char_sel_name}")
            return {"CANCELLED"}

        team = char["teams"].get(props.char_sel_team)
        if not team:
            self.report({"ERROR"}, f"No team {props.char_sel_team} for this character")
            return {"CANCELLED"}

        # 获取选中的装扮
        outfit = None
        if props.char_sel_outfit != "NONE":
            for o in team.get("outfits", []):
                if o["name"] == props.char_sel_outfit:
                    outfit = o
                    break

        # 打印导入配置
        log.info(f"=== Import Character ===")
        log.info(f"  Character: {props.char_sel_name} (team={props.char_sel_team})")
        log.info(f"  Outfit: {props.char_sel_outfit}")
        log.info(f"  View: {props.char_sel_view}, LOD: {props.char_sel_lod}")
        if outfit:
            for m in outfit.get("meshes", []):
                log.info(f"  Mesh: {m['path']} (lod={m.get('lod')})")
        if team.get("tp_skeleton"):
            log.info(f"  TP Skeleton: {team['tp_skeleton']}")
        if team.get("fp_skeleton"):
            log.info(f"  FP Skeleton: {team['fp_skeleton']}")

        # 执行导入 (配饰已拆分到独立面板)
        imported = import_character(
            props, vfs_root, char, team, outfit,
            [], self.report)

        if imported > 0:
            self.report({"INFO"}, f"Imported {imported} resources")
            return {"FINISHED"}
        else:
            self.report({"WARNING"}, "No resources imported")
            return {"CANCELLED"}
