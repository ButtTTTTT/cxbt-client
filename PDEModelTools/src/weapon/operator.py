#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
武器导入操作符

提供扫描武器脚本和导入武器的操作符。
"""

import bpy
import os
from bpy.props import StringProperty, BoolProperty, EnumProperty
from bpy.types import Operator
from typing import Dict, Any, Optional, List

from .. import MAIN_PACKAGE
from ..log import get_module_logger
from ..mesh_any.parser import MeshParser
from ..mesh_any.material import create_mesh_object
from ..mesh_any.geometry import bind_mesh_to_armature
from .parser import WeaponScriptParser, WeaponInfo

log = get_module_logger("WEAPON_OPERATOR")


# =============================================================================
# 全局缓存
# =============================================================================

_weapon_cache: Dict[str, Any] = {
    "weapons": [],      # WeaponInfo 列表
    "directory": "",    # 扫描的目录
}


def get_weapon_cache() -> Dict[str, Any]:
    """获取武器缓存"""
    return _weapon_cache


def clear_weapon_cache():
    """清空武器缓存"""
    _weapon_cache["weapons"] = []
    _weapon_cache["directory"] = ""


# =============================================================================
# 扫描武器操作符
# =============================================================================

class PMT_OT_ScanWeapons(Operator):
    """扫描武器脚本目录 \nScan weapon script directory"""

    bl_idname = "pmt.scan_weapons"
    bl_label = "扫描武器"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        """执行扫描"""
        # 获取资源根目录
        prefs = context.preferences.addons[MAIN_PACKAGE].preferences
        res_dir = prefs.dir_path

        if not res_dir:
            self.report({"ERROR"}, "请先设置资源根目录！")
            return {"CANCELLED"}

        # 获取选中的角色和视角，用于筛选可用武器
        from ..character.operator import get_character_cache
        char_cache = get_character_cache()
        selected_char = context.scene.pmt_props.selected_character
        is_first_person = context.scene.pmt_props.selected_person == "first"
        person_dir = "firstperson" if is_first_person else "thirdperson"
        
        # 获取角色可用的武器列表（从动画目录）
        available_weapons = set()
        if char_cache and char_cache.get("characters"):
            try:
                char_index = int(selected_char)
                characters = char_cache["characters"]
                if 0 <= char_index < len(characters):
                    char_info = characters[char_index]
                    char_name = char_info.base.name
                    # 扫描动画目录下的武器子目录
                    anim_dir = os.path.join(res_dir, "animation", "character", person_dir, char_name)
                    if os.path.exists(anim_dir):
                        for item in os.listdir(anim_dir):
                            item_path = os.path.join(anim_dir, item)
                            if os.path.isdir(item_path):
                                available_weapons.add(item)
            except (ValueError, IndexError):
                pass

        # 武器脚本目录
        weapon_dir = os.path.join(res_dir, "weapon")

        if not os.path.isdir(weapon_dir):
            self.report({"ERROR"}, f"武器目录不存在: {weapon_dir}")
            return {"CANCELLED"}

        # 清空缓存
        clear_weapon_cache()

        # 扫描武器
        parser = WeaponScriptParser()
        all_weapons = parser.scan_weapon_directory(weapon_dir)

        # 筛选：只保留角色可用的武器
        if available_weapons:
            weapons = [w for w in all_weapons if w.name in available_weapons]
            log.info(f"筛选出 {len(weapons)}/{len(all_weapons)} 个可用武器")
        else:
            weapons = all_weapons

        if not weapons:
            self.report({"WARNING"}, "未找到任何武器")
            return {"CANCELLED"}

        # 更新缓存
        _weapon_cache["weapons"] = weapons
        _weapon_cache["directory"] = weapon_dir

        # 更新枚举项
        from .. import update_weapon_list_enum_items
        enum_items = [
            ("none", "无 / None", "不导入武器"),
        ] + [
            (w.name, w.name, f"导入 {w.name} 武器")
            for w in weapons
        ]
        update_weapon_list_enum_items(enum_items)

        # 报告
        msg = f"扫描完成，找到 {len(weapons)} 个武器"
        log.info(msg)
        self.report({"INFO"}, msg)

        return {"FINISHED"}


# =============================================================================
# 导入武器操作符
# =============================================================================

class PMT_OT_ImportWeapon(Operator):
    """导入选中的武器 \nImport selected weapon"""

    bl_idname = "pmt.import_weapon"
    bl_label = "导入武器"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        """执行导入"""
        # 获取选中的武器
        selected_weapon = context.scene.pmt_props.selected_weapon_list
        
        if selected_weapon == "none":
            self.report({"WARNING"}, "请先选择武器")
            return {"CANCELLED"}
        
        # 从缓存获取武器信息
        weapons = _weapon_cache.get("weapons", [])
        weapon_info = None
        for w in weapons:
            if w.name == selected_weapon:
                weapon_info = w
                break
        
        if not weapon_info:
            self.report({"ERROR"}, "武器信息未找到，请重新扫描")
            return {"CANCELLED"}
        
        # 获取资源目录
        prefs = context.preferences.addons[MAIN_PACKAGE].preferences
        res_dir = prefs.dir_path
        
        # 获取视角
        is_first_person = context.scene.pmt_props.selected_person == "first"
        
        # 导入武器
        imported_count, error_count = self._import_weapon(context, weapon_info, res_dir, is_first_person)
        
        # 报告
        msg = f"导入武器: {weapon_info.name}, {imported_count} 个物体"
        if error_count > 0:
            msg += f", {error_count} 个错误"
        
        log.info(msg)
        self.report({"INFO"}, msg)
        
        return {"FINISHED"}
    
    def _import_weapon(
        self,
        context: bpy.types.Context,
        weapon_info: WeaponInfo,
        res_dir: str,
        is_first_person: bool = False
    ) -> tuple:
        """导入武器"""
        imported = 0
        errors = 0
        
        # 查找场景中的 Armature（用于绑定）
        armature_obj = self._find_armature(context)
        
        # 导入武器骨骼
        if weapon_info.skeleton_path:
            skel_path = self._resolve_path(res_dir, weapon_info.skeleton_path)
            if skel_path and os.path.exists(skel_path):
                try:
                    # 设置 skel_target_object
                    if armature_obj and armature_obj.parent:
                        context.scene.pmt_props.skel_target_object = armature_obj.parent
                    bpy.ops.pmt.skel(filepath=skel_path)
                    imported += 1
                    log.info(f"导入武器骨骼: {weapon_info.skeleton_path}")
                    # 重新查找 armature
                    armature_obj = self._find_armature(context)
                except Exception as e:
                    log.error(f"导入武器骨骼失败: {e}")
                    errors += 1
        
        # 导入武器 mesh
        for mesh_path in weapon_info.mesh_paths:
            if not mesh_path:
                continue
            
            # 解析 mesh 路径
            full_path = self._resolve_mesh_path(res_dir, mesh_path, is_first_person)
            
            if not full_path or not os.path.exists(full_path):
                # 尝试直接路径
                full_path = self._resolve_path(res_dir, mesh_path)
            
            if not full_path or not os.path.exists(full_path):
                log.debug(f"武器 mesh 不存在: {mesh_path}")
                continue
            
            try:
                parser = MeshParser()
                mesh_objects = parser.parse_file(full_path)
                
                if mesh_objects:
                    base_name = os.path.splitext(os.path.basename(full_path))[0]
                    processed_materials = set()
                    mesh_type = parser.mesh_type.value if hasattr(parser, 'mesh_type') else "Unset"
                    bone_names = parser.obj_names if mesh_type == "CW" and hasattr(parser, 'obj_names') else None
                    
                    for idx, mesh_data in enumerate(mesh_objects):
                        obj = create_mesh_object(
                            context,
                            mesh_data,
                            base_name,
                            idx,
                            processed_materials,
                            res_dir,
                            mesh_type=mesh_type,
                            bone_names=bone_names
                        )
                        if obj:
                            imported += 1
                            # 绑定到 armature
                            if armature_obj:
                                self._bind_mesh_to_armature(obj, armature_obj)
                    
                    log.debug(f"导入武器 mesh: {mesh_path}")
                
            except Exception as e:
                log.error(f"导入武器 mesh 失败 {mesh_path}: {e}")
                errors += 1
        
        return imported, errors
    
    def _find_armature(self, context: bpy.types.Context) -> Optional[bpy.types.Object]:
        """查找场景中的 Armature 对象"""
        for obj in context.scene.objects:
            if obj.type == 'ARMATURE':
                return obj
        return None
    
    def _bind_mesh_to_armature(
        self,
        mesh_obj: bpy.types.Object,
        armature_obj: bpy.types.Object
    ) -> None:
        """将 mesh 绑定到 armature"""
        if not mesh_obj or not armature_obj:
            return
        parent_obj = armature_obj.parent if armature_obj.parent else armature_obj
        mesh_obj.parent = parent_obj
        bind_mesh_to_armature(mesh_obj, armature_obj)
    
    def _resolve_path(self, res_dir: str, relative_path: str) -> Optional[str]:
        """解析相对路径为绝对路径"""
        if not relative_path:
            return None
        
        if relative_path.startswith('/'):
            relative_path = relative_path[1:]
        
        candidates = [
            os.path.join(res_dir, relative_path),
            os.path.join(res_dir, "skeleton", relative_path),
            os.path.join(res_dir, "mesh", relative_path),
        ]
        
        for path in candidates:
            if os.path.exists(path):
                return path
        
        return None
    
    def _resolve_mesh_path(self, res_dir: str, mesh_path: str, is_first_person: bool = False) -> Optional[str]:
        """解析武器 mesh 路径"""
        if not mesh_path:
            return None
        
        person_dir = "firstperson" if is_first_person else "thirdperson"
        
        # 武器 mesh 通常在 mesh/prop/weapon/ 目录下
        candidates = [
            os.path.join(res_dir, "mesh", "prop", "weapon", mesh_path),
            os.path.join(res_dir, "mesh", "prop", "weapon", person_dir, mesh_path),
            os.path.join(res_dir, "mesh", mesh_path),
            os.path.join(res_dir, mesh_path),
        ]
        
        # 尝试添加 .mesh 后缀
        if not mesh_path.endswith('.mesh'):
            candidates.extend([c + ".mesh" for c in candidates[:4]])
        
        # 尝试添加 _lod0.mesh 后缀
        base = mesh_path.replace('.mesh', '')
        candidates.append(os.path.join(res_dir, "mesh", "prop", "weapon", f"{base}_lod0.mesh"))
        candidates.append(os.path.join(res_dir, "mesh", "prop", "weapon", base, f"{os.path.basename(base)}_lod0.mesh"))
        
        for path in candidates:
            if os.path.exists(path):
                return path
        
        return None
