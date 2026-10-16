#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 武器导入操作符

操作符:
- PDE_OT_ScanWeapons:   扫描武器目录, 生成 weapon.json
- PDE_OT_ImportWeapon:  导入选中的武器 (骨骼 + 模型 + 强化特效)
"""

import os
import bpy
from bpy.types import Operator

from ...log import get_module_logger
from ..common import load_and_decode, resolve_vfs_file
from ..binary.skeleton import parse_skeleton_binary
from ..core.skeleton_builder import import_skeleton_to_blender
from ..binary.mesh import parse_mesh_binary
from ..core.mesh_builder import import_mesh_to_blender

log = get_module_logger("WPN_OPS")


def _get_vfs_root(props) -> str:
    """获取 VFS 根目录"""
    root = props.import_vfs_root
    if not root:
        pkg = __package__.rsplit(".", 2)[0]
        prefs = bpy.context.preferences.addons.get(pkg)
        if prefs and prefs.preferences:
            root = prefs.preferences.vfs_root
    return root


def _get_weapon_src_dir(props) -> str:
    """获取武器配置目录 (从 VFS Root 拼接)"""
    vfs_root = _get_vfs_root(props)
    if not vfs_root:
        return ""
    return os.path.join(vfs_root, "weapon")


def _get_weapon_json(props) -> dict | None:
    """加载 weapon.json"""
    src_dir = _get_weapon_src_dir(props)
    if not src_dir or not os.path.isdir(src_dir):
        return None
    from .scanner import load_weapon_json
    return load_weapon_json(src_dir)


def _find_weapon(data: dict, name: str) -> dict | None:
    """在 JSON 数据中查找武器"""
    for wpn in data.get("weapons", []):
        if wpn["name"] == name:
            return wpn
    return None


class PDE_OT_ScanWeapons(Operator):
    """扫描武器配置目录, 生成 weapon.json"""

    bl_idname = "pde_studio.scan_weapons"
    bl_label = "Scan Weapons"
    bl_description = "Scan weapon config directory and build weapon.json"

    def execute(self, context):
        props = context.scene.pde_studio_props
        src_dir = _get_weapon_src_dir(props)

        if not src_dir:
            self.report({"ERROR"}, "Set weapon source directory first!")
            return {"CANCELLED"}

        if not os.path.isdir(src_dir):
            self.report({"ERROR"}, f"Directory not found: {src_dir}")
            return {"CANCELLED"}

        from .scanner import scan_weapons, save_weapon_json

        data = scan_weapons(src_dir)
        save_weapon_json(data, src_dir)

        total = data["total_weapons"]
        log.info(f"Scan done: {total} weapons")
        self.report({"INFO"}, f"Scan done: {total} weapons")

        # 扫描完成后自动填充武器列表
        from .panel import _populate_weapon_list
        _populate_weapon_list(props)
        if len(props.weapon_items) > 0:
            props.weapon_index = 0  # 触发 update 回调自动同步 weapon_sel_name

        return {"FINISHED"}


class PDE_OT_ImportWeapon(Operator):
    """导入选中的武器 (骨骼 + 模型)"""

    bl_idname = "pde_studio.import_weapon"
    bl_label = "Import Weapon"
    bl_description = "Import selected weapon skeleton and meshes"

    def execute(self, context):
        props = context.scene.pde_studio_props
        vfs_root = _get_vfs_root(props)

        if not vfs_root:
            self.report({"ERROR"}, "Set VFS root first!")
            return {"CANCELLED"}

        data = _get_weapon_json(props)
        if not data:
            self.report({"ERROR"}, "Scan weapons first!")
            return {"CANCELLED"}

        if props.weapon_sel_name == "NONE":
            self.report({"WARNING"}, "Select a weapon first!")
            return {"CANCELLED"}

        wpn = _find_weapon(data, props.weapon_sel_name)
        if not wpn:
            self.report({"ERROR"}, f"Weapon not found: {props.weapon_sel_name}")
            return {"CANCELLED"}

        lod = int(props.weapon_sel_lod)
        import_fx = props.weapon_import_fx
        fx_level = props.weapon_sel_fx_level

        log.info(f"=== Import Weapon ===")
        log.info(f"  Weapon: {wpn['name']}, LOD: {lod}, FX: {import_fx}/{fx_level}")

        # 打印 mesh 信息
        for mesh in wpn.get("meshes", []):
            log.info(f"  Mesh: {mesh['path']} (lod={mesh['lod']}, part={mesh['part']})")
        if wpn.get("fx_meshes"):
            fx_levels = sorted(set(fx["level"] for fx in wpn["fx_meshes"]))
            log.info(f"  FX levels: {fx_levels}")

        count = 0
        coord_mode = props.import_coord_mode
        scale = props.import_scale

        # 1. 导入骨骼
        armature_obj = None
        skel_path = wpn.get("skeleton")
        if skel_path:
            armature_obj = self._import_skeleton(
                props, vfs_root, skel_path, coord_mode, scale)
            if armature_obj:
                count += 1

        # 2. 导入基础模型
        for mesh in wpn.get("meshes", []):
            if mesh["lod"] != lod:
                continue
            mesh_obj = self._import_mesh(
                props, vfs_root, mesh["path"], mesh["part"],
                armature_obj, coord_mode, scale, lod)
            if mesh_obj:
                count += 1

        # 3. 导入强化特效模型
        if import_fx and fx_level != "NONE":
            for fx in wpn.get("fx_meshes", []):
                if fx["level"] != int(fx_level):
                    continue
                if fx["lod"] != lod:
                    continue
                mesh_obj = self._import_mesh(
                    props, vfs_root, fx["path"], f"fx_{fx['part']}",
                    armature_obj, coord_mode, scale, lod, is_fx=True)
                if mesh_obj:
                    count += 1

        if count > 0:
            self.report({"INFO"}, f"Imported {count} items")
            return {"FINISHED"}
        else:
            self.report({"WARNING"}, "Nothing imported")
            return {"CANCELLED"}

    def _import_skeleton(self, props, vfs_root, skel_vfs,
                         coord_mode, scale):
        """导入武器骨骼"""
        rel = skel_vfs.lstrip("/").replace("/", os.sep)
        skel_path = resolve_vfs_file(
            os.path.join(vfs_root, rel), [".cache", ""])

        if not skel_path:
            log.warning(f"找不到骨骼: {skel_vfs}")
            return None

        try:
            header, sd = load_and_decode(
                skel_path, vfs_path=skel_vfs,
                verify_crc=props.import_verify_crc)
            skel = parse_skeleton_binary(sd)
            skel_name = os.path.splitext(
                os.path.basename(skel_path))[0]
            if skel_name.endswith(".skel"):
                skel_name = skel_name[:-5]

            result = import_skeleton_to_blender(
                skel, name=skel_name, scale=scale, coord_mode=coord_mode)
            if isinstance(result, tuple):
                return result[0]
            return result
        except Exception as e:
            log.error(f"骨骼导入失败 {skel_vfs}: {e}")
            return None

    def _import_mesh(self, props, vfs_root, mesh_rel, part_name,
                      armature_obj, coord_mode, scale, lod, is_fx=False):
        """导入武器 mesh

        基础 mesh: Lua 路径如 "ak47/mz1", 实际文件:
            /mesh/prop/weapon/ak47/mz1_n_lod0.mesh.cache
        强化特效: Lua 路径如 "weapon_fx/ak47_5.mesh", 实际文件:
            /mesh/prop/weapon/weapon_fx/ak47_5.mesh.cache
        """
        if is_fx:
            # FX mesh 路径已含 .mesh 后缀
            vfs_path = f"/mesh/prop/weapon/{mesh_rel}"
        else:
            # 基础 mesh 需加 _n_lod{lod}.mesh 后缀
            vfs_path = f"/mesh/prop/weapon/{mesh_rel}_n_lod{lod}.mesh"

        rel = vfs_path.lstrip("/").replace("/", os.sep)
        mesh_path = resolve_vfs_file(
            os.path.join(vfs_root, rel), [".cache", ""])

        if not mesh_path:
            log.warning(f"找不到 mesh: {vfs_path}")
            return None

        try:
            header, md = load_and_decode(
                mesh_path, vfs_path=vfs_path,
                verify_crc=props.import_verify_crc)
            mesh_data = parse_mesh_binary(md)
            name = os.path.splitext(os.path.basename(mesh_path))[0]
            if name.endswith(".mesh"):
                name = name[:-5]

            return import_mesh_to_blender(
                mesh_data, name=name, scale=scale,
                armature_obj=armature_obj, vfs_root=vfs_root,
                coord_mode=coord_mode)
        except Exception as e:
            log.error(f"Mesh 导入失败 {vfs_path}: {e}")
            return None
