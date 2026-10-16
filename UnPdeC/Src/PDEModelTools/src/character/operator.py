#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
角色导入操作符

提供扫描角色脚本和导入角色装备的操作符。
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
from .parser import CharacterScriptParser
from .character_types import CharacterInfo, CharacterTeam, EquipmentInfo, TeamSide, EquipmentSlot

log = get_module_logger("CHARACTER_OPERATOR")


# =============================================================================
# 全局缓存
# =============================================================================

# 角色缓存：存储扫描结果
_character_cache: Dict[str, Any] = {
    "characters": [],  # CharacterInfo 列表
    "directory": "",   # 扫描的目录
}


def get_character_cache() -> Dict[str, Any]:
    """获取角色缓存"""
    return _character_cache


def clear_character_cache():
    """清空角色缓存"""
    _character_cache["characters"] = []
    _character_cache["directory"] = ""


# =============================================================================
# 动画扫描缓存
# =============================================================================

_animation_cache: Dict[str, Any] = {
    "weapons": [],      # 武器列表
    "animations": [],   # 动画文件列表
    "character": "",    # 当前角色
    "weapon": "",       # 当前武器
}


def get_animation_cache() -> Dict[str, Any]:
    """获取动画缓存"""
    return _animation_cache


def clear_animation_cache():
    """清空动画缓存"""
    _animation_cache["weapons"] = []
    _animation_cache["animations"] = []
    _animation_cache["character"] = ""
    _animation_cache["weapon"] = ""


# =============================================================================
# 扫描角色操作符
# =============================================================================

class PMT_OT_ScanCharacters(Operator):
    """扫描角色脚本目录 \nScan character script directory"""

    bl_idname = "pmt.scan_characters"
    bl_label = "扫描角色"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        """执行扫描"""
        # 获取资源根目录
        prefs = context.preferences.addons[MAIN_PACKAGE].preferences
        res_dir = prefs.dir_path

        if not res_dir:
            self.report({"ERROR"}, "请先设置资源根目录！")
            return {"CANCELLED"}

        # 角色脚本目录
        character_dir = os.path.join(res_dir, "character")

        if not os.path.isdir(character_dir):
            self.report({"ERROR"}, f"角色目录不存在: {character_dir}")
            return {"CANCELLED"}

        # 清空缓存
        clear_character_cache()

        # 扫描角色
        parser = CharacterScriptParser()
        characters = parser.scan_character_directory(character_dir)

        if not characters:
            self.report({"WARNING"}, "未找到任何角色")
            return {"CANCELLED"}

        # 更新缓存
        _character_cache["characters"] = characters
        _character_cache["directory"] = character_dir

        # 更新枚举项
        from .. import update_character_enum_items
        enum_items = [
            (str(i), char.get_display_name(), "")
            for i, char in enumerate(characters)
        ]
        update_character_enum_items(enum_items)

        # 重置选择，避免旧值不匹配枚举项产生 WARNING
        context.scene.pmt_props.selected_character = "0"

        # 报告
        msg = f"扫描完成，找到 {len(characters)} 个角色"
        log.info(msg)
        self.report({"INFO"}, msg)

        return {"FINISHED"}


# =============================================================================
# 导入角色操作符
# =============================================================================

class PMT_OT_ImportCharacter(Operator):
    """导入选中的角色装备 \nImport selected character equipment"""

    bl_idname = "pmt.import_character"
    bl_label = "导入角色"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        """执行导入"""
        # 获取选中的角色索引
        selected_index = int(context.scene.pmt_props.selected_character)

        # 检查缓存
        characters = _character_cache.get("characters", [])
        if not characters or selected_index < 0 or selected_index >= len(characters):
            self.report({"ERROR"}, "请先扫描并选择角色")
            return {"CANCELLED"}

        # 获取选中的角色
        char_info = characters[selected_index]

        # 获取导入选项
        pmt_props = context.scene.pmt_props
        selected_team = TeamSide.TEAM_0 if pmt_props.selected_team == "0" else TeamSide.TEAM_1
        is_first_person = pmt_props.selected_person == "first"
        lod_level = pmt_props.character_lod_level
        import_skeleton = pmt_props.import_character_skeleton
        import_animation = pmt_props.import_character_animation
        import_base_mesh = pmt_props.import_character_base_mesh
        
        # 获取装备导入选项
        import_equipment_slots = {
            EquipmentSlot.CHEST: pmt_props.import_equipment_chest,
            EquipmentSlot.HAT: pmt_props.import_equipment_hat,
            EquipmentSlot.MEDAL: pmt_props.import_equipment_medal,
            EquipmentSlot.BODY: pmt_props.import_equipment_body,
            EquipmentSlot.CLOTH: pmt_props.import_equipment_cloth,
            EquipmentSlot.OTHER: pmt_props.import_equipment_other,
        }
        
        # 获取选中的装备
        selected_equipments = self._get_selected_equipments(char_info, selected_team, import_equipment_slots)

        # 获取资源目录
        prefs = context.preferences.addons[MAIN_PACKAGE].preferences
        res_dir = prefs.dir_path

        # 获取队伍配置
        team_config = char_info.get_team(selected_team)
        if not team_config:
            self.report({"ERROR"}, f"角色没有{selected_team}的配置")
            return {"CANCELLED"}

        # 统计
        imported_count = 0
        error_count = 0

        # 导入骨骼
        if import_skeleton:
            count, errors = self._import_skeleton(context, team_config, res_dir, is_first_person)
            imported_count += count
            error_count += errors

        # 导入基础mesh (从角色配置文件)
        if import_base_mesh:
            count, errors = self._import_base_mesh(context, team_config, res_dir, is_first_person, lod_level)
            imported_count += count
            error_count += errors

        # 导入选中的装备
        for equip in selected_equipments:
            count, errors = self._import_equipment(context, equip, res_dir, is_first_person)
            imported_count += count
            error_count += errors

        # 导入动画（如果扫描了动画）
        animations = _animation_cache.get("animations", [])
        if animations:
            count, errors = self._import_animation(context, team_config, res_dir, is_first_person)
            imported_count += count
            error_count += errors

        # 报告
        msg = f"导入完成: {char_info.get_display_name()}, {imported_count} 个物体"
        if error_count > 0:
            msg += f", {error_count} 个错误"
        
        log.info(msg)
        self.report({"INFO"}, msg)

        return {"FINISHED"}
    
    def _get_selected_equipments(
        self,
        char_info: CharacterInfo,
        team: TeamSide,
        import_slots: Dict[EquipmentSlot, bool]
    ) -> List[EquipmentInfo]:
        """获取选中的装备列表"""
        selected = []
        team_config = char_info.get_team(team)
        
        if not team_config:
            return selected
        
        # 根据用户选择的槽位，收集所有该类型的装备
        for slot, should_import in import_slots.items():
            if not should_import:
                continue
            
            # 获取该槽位的所有装备
            equips = team_config.available_equipments.get(slot, [])
            selected.extend(equips)
        
        log.debug(f"选中了 {len(selected)} 个装备")
        return selected
    
    def _import_skeleton(
        self,
        context: bpy.types.Context,
        team_config: CharacterTeam,
        res_dir: str,
        is_first_person: bool = False
    ) -> tuple:
        """导入骨骼"""
        imported = 0
        errors = 0
        
        # 获取骨骼路径
        skel_path = team_config.get_skeleton_path(is_first_person=is_first_person)
        
        if not skel_path:
            log.debug("没有骨骼路径")
            return imported, errors
        
        # 解析路径
        full_path = self._resolve_path(res_dir, skel_path)
        
        if not full_path or not os.path.exists(full_path):
            log.warning(f"骨骼文件不存在: {skel_path}")
            return imported, errors + 1
        
        try:
            # 创建一个空物体作为骨骼的目标物体
            char_name = team_config.character_name
            person_suffix = "_fp" if is_first_person else "_tp"
            armature_name = f"{char_name}{person_suffix}_Armature"
            
            # 检查是否已存在
            if armature_name in bpy.data.objects:
                target_obj = bpy.data.objects[armature_name]
                # 确保物体在当前场景中
                if target_obj.name not in context.collection.objects:
                    context.collection.objects.link(target_obj)
            else:
                # 创建新的空物体
                target_obj = bpy.data.objects.new(armature_name, None)
                target_obj.empty_display_type = 'ARROWS'
                context.collection.objects.link(target_obj)
                log.info(f"创建目标物体: {armature_name}")
            
            # 取消所有选择
            bpy.ops.object.select_all(action='DESELECT')
            
            # 设置为活动物体
            target_obj.select_set(True)
            context.view_layer.objects.active = target_obj
            
            # 重要：设置skel_target_object属性，这样skel操作符才能找到目标物体
            context.scene.pmt_props.skel_target_object = target_obj
            
            # 调用现有的骨骼导入功能
            bpy.ops.pmt.skel(filepath=full_path)
            imported += 1
            log.info(f"导入骨骼: {skel_path}")
            
        except Exception as e:
            log.error(f"导入骨骼失败: {e}", exc_info=True)
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
        """将 mesh 绑定到 armature：设置 parent 到 Empty + Armature 修改器
        
        手动导入流程中，mesh 的 parent 是 Empty（armature 的父物体），
        而非 armature 本身。绑定完全通过 Armature Modifier 实现。
        """
        if not mesh_obj or not armature_obj:
            return
        # 设置父物体为 Empty（armature 的父物体），与手动导入一致
        parent_obj = armature_obj.parent if armature_obj.parent else armature_obj
        mesh_obj.parent = parent_obj
        # 添加 Armature 修改器
        bind_mesh_to_armature(mesh_obj, armature_obj)
        log.debug(f"已绑定 {mesh_obj.name} -> {armature_obj.name}")
    
    def _import_base_mesh(
        self,
        context: bpy.types.Context,
        team_config: CharacterTeam,
        res_dir: str,
        is_first_person: bool = False,
        lod_level: str = "lod0"
    ) -> tuple:
        """导入基础mesh (body, cloth等)"""
        imported = 0
        errors = 0
        
        # 查找场景中的 Armature（用于绑定）
        armature_obj = self._find_armature(context)
        
        # 查找角色基础mesh配置文件
        # 例如: firebat_0/firebat_01.lua
        char_name = team_config.character_name
        
        # 尝试查找基础配置文件
        base_config_files = [
            f"{char_name}_01.lua",
            f"{char_name}.lua",
        ]
        
        for config_file in base_config_files:
            config_path = os.path.join(team_config.config_dir, config_file)
            
            if not os.path.exists(config_path):
                continue
            
            # 解析配置文件，提取mesh路径（根据LOD级别过滤）
            mesh_paths = self._extract_mesh_paths_from_config(config_path, lod_level=lod_level)
            
            for mesh_path in mesh_paths:
                # 使用专门的mesh路径解析方法
                full_path = self._resolve_mesh_path(res_dir, mesh_path, is_first_person=is_first_person)
                
                if not full_path or not os.path.exists(full_path):
                    log.warning(f"Mesh文件不存在: {mesh_path}")
                    errors += 1
                    continue
                
                try:
                    # 使用 MeshParser 直接解析mesh文件
                    parser = MeshParser()
                    mesh_objects = parser.parse_file(full_path)
                    
                    if mesh_objects:
                        # 准备参数
                        base_name = os.path.splitext(os.path.basename(full_path))[0]
                        processed_materials = set()
                        
                        # 获取mesh类型（从parser对象）
                        mesh_type = parser.mesh_type.value if hasattr(parser, 'mesh_type') else "Unset"
                        
                        # 获取骨骼名称列表（从 .mesh 文件头部，与手动导入一致）
                        bone_names = parser.obj_names if mesh_type == "CW" and hasattr(parser, 'obj_names') else None
                        
                        # 创建Blender物体
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
                        
                        log.info(f"导入基础mesh: {mesh_path}")
                    else:
                        log.warning(f"Mesh解析失败: {mesh_path}")
                        errors += 1
                    
                except Exception as e:
                    log.error(f"导入mesh失败: {e}", exc_info=True)
                    errors += 1
            
            # 找到一个配置文件就够了
            break
        
        return imported, errors
    
    def _import_equipment(
        self,
        context: bpy.types.Context,
        equip: EquipmentInfo,
        res_dir: str,
        is_first_person: bool = False
    ) -> tuple:
        """导入装备"""
        imported = 0
        errors = 0
        
        if not equip.mesh_path:
            log.debug(f"装备没有mesh: {equip.name}")
            return imported, errors
        
        # 查找场景中的 Armature（用于绑定）
        armature_obj = self._find_armature(context)
        
        # 解析mesh路径
        full_path = self._resolve_mesh_path(res_dir, equip.mesh_path, is_first_person=is_first_person)
        
        if not full_path or not os.path.exists(full_path):
            log.warning(f"装备mesh不存在: {equip.mesh_path}")
            return imported, errors + 1
        
        try:
            # 使用 MeshParser 直接解析mesh文件
            parser = MeshParser()
            mesh_objects = parser.parse_file(full_path)
            
            if mesh_objects:
                # 准备参数
                base_name = os.path.splitext(os.path.basename(full_path))[0]
                processed_materials = set()
                
                # 获取mesh类型（从parser对象）
                mesh_type = parser.mesh_type.value if hasattr(parser, 'mesh_type') else "Unset"
                
                # 获取骨骼名称列表（从 .mesh 文件头部，与手动导入一致）
                bone_names = parser.obj_names if mesh_type == "CW" and hasattr(parser, 'obj_names') else None
                
                # 创建Blender物体
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
                
                log.info(f"导入装备: {equip.name} ({equip.slot.value})")
            else:
                log.warning(f"装备mesh解析失败: {equip.name}")
                errors += 1
            
            # 如果装备有独立骨骼
            if equip.skeleton_path:
                skel_path = self._resolve_path(res_dir, equip.skeleton_path)
                if skel_path and os.path.exists(skel_path):
                    try:
                        # 设置 skel_target_object，使 skel 操作符能找到目标物体
                        if armature_obj and armature_obj.parent:
                            context.scene.pmt_props.skel_target_object = armature_obj.parent
                        bpy.ops.pmt.skel(filepath=skel_path)
                        imported += 1
                        log.info(f"导入装备骨骼: {equip.skeleton_path}")
                        # 装备骨骼导入后重新查找 armature（可能新增了骨骼）
                        armature_obj = self._find_armature(context)
                    except Exception as e:
                        log.error(f"导入装备骨骼失败: {e}")
                        errors += 1
            
        except Exception as e:
            log.error(f"导入装备失败 {equip.name}: {e}", exc_info=True)
            errors += 1
        
        return imported, errors
    
    def _import_animation(
        self,
        context: bpy.types.Context,
        team_config: CharacterTeam,
        res_dir: str,
        is_first_person: bool = False
    ) -> tuple:
        """导入动画"""
        imported = 0
        errors = 0
        
        # 检查动画缓存
        animations = _animation_cache.get("animations", [])
        selected_animation = context.scene.pmt_props.selected_animation
        
        if not animations:
            log.debug("没有扫描动画，跳过动画导入")
            return imported, errors
        
        # 获取要导入的动画列表
        anims_to_import = []
        if selected_animation == "all":
            # 导入所有动画
            anims_to_import = animations
        else:
            # 导入选中的动画
            for anim in animations:
                if anim["name"] == selected_animation:
                    anims_to_import = [anim]
                    break
        
        if not anims_to_import:
            log.warning(f"未找到动画: {selected_animation}")
            return imported, errors
        
        # 导入动画文件
        # 查找骨架
        armature_obj = None
        for obj in context.scene.objects:
            if obj.type == 'ARMATURE':
                armature_obj = obj
                break
        
        if not armature_obj:
            log.warning("场景中未找到骨架，无法导入动画")
            return imported, errors
        
        # 导入动画工具函数
        from ..anim.utils import parse_anim_tracks, write_transforms_via_keyframe_insert, convert_tracks_to_pose_basis
        from ..skel.utils import get_root_fix_matrix
        import re
        
        root_fix = get_root_fix_matrix()
        root_fix_inv = root_fix.inverted()
        
        first_anim = True
        for anim_info in anims_to_import:
            anim_path = anim_info["path"]
            
            if not os.path.exists(anim_path):
                log.warning(f"动画文件不存在: {anim_path}")
                errors += 1
                continue
            
            try:
                # 读取文件
                with open(anim_path, "rb") as file:
                    data = file.read()
                
                file_name = anim_info["name"]
                
                # 解析动画轨道
                tracks_list = parse_anim_tracks(data, file_name, root_fix, root_fix_inv, logger=log)
                if not tracks_list:
                    log.warning(f"{file_name} 中未找到任何动画轨道")
                    errors += 1
                    continue
                
                # 映射逻辑
                vertex_groups = {}
                bones = armature_obj.data.bones
                sorted_bones = sorted(bones, key=lambda b: b.get("pmt_file_index", 999999))
                
                # 尝试 Index Mapping
                if len(sorted_bones) == len(tracks_list):
                    matches = 0
                    for i in range(len(sorted_bones)):
                        bone_name = sorted_bones[i].name
                        track_name = tracks_list[i][0]
                        bone_base = re.sub(r'\.\d+$', '', bone_name)
                        track_base = re.sub(r'\.\d+$', '', track_name)
                        if bone_base == track_base:
                            matches += 1
                    
                    match_rate = matches / len(sorted_bones)
                    log.debug("Index Mapping 对齐检查: %d/%d (%.2f%%)", matches, len(sorted_bones), match_rate * 100)
                    
                    if match_rate > 0.8:
                        log.info("检测到严格的索引对齐，使用 Index Mapping (解决重名骨骼顺序问题)")
                        mapped_by_index = True
                        for i in range(len(sorted_bones)):
                            bone_name = sorted_bones[i].name
                            track_data = tracks_list[i][1]
                            vertex_groups[bone_name] = track_data
                
                if not mapped_by_index:
                    log.debug("使用标准 Name Mapping")
                    for name, data in tracks_list:
                        vertex_groups[name] = data
                
                total_frames = max(len(group_data) for group_data in vertex_groups.values())
                
                # 构建新的 Action 名称：目录名_动画名
                dir_name = os.path.basename(os.path.dirname(anim_path))
                action_name = f"{dir_name}_{file_name}"
                
                # 确保骨架有 animation_data
                if not armature_obj.animation_data:
                    armature_obj.animation_data_create()
                
                # Blender 5.0+ 使用 Slotted Actions
                # 关键顺序：先创建 Action -> 分配 Action -> 创建 Slot -> 分配 Slot
                use_slotted = False
                action = None
                slot = None
                
                try:
                    # 创建新的 Action
                    action = bpy.data.actions.new(name=action_name)
                    
                    # 检查是否支持 Slotted Actions (Blender 5.0+)
                    if hasattr(action, 'slots'):
                        # Step 1: 先分配 Action
                        armature_obj.animation_data.action = action
                        
                        # Step 2: 创建 Slot (必须在分配 Action 之后)
                        # 重要: id_type 必须使用 'OBJECT'，因为骨架物体是 Object 类型
                        # 使用 'ARMATURE' 会创建错误类型的 Slot (AR 而不是 OB)
                        slot = action.slots.new(id_type='OBJECT', name=armature_obj.name)
                        
                        # Step 3: 分配 Slot
                        armature_obj.animation_data.action_slot = slot
                        
                        use_slotted = True
                        log.info("使用 Slotted Actions: action=%s, slot=%s", action_name, repr(slot))
                    else:
                        # 传统模式 (Blender 4.x 及更早版本)
                        armature_obj.animation_data.action = action
                        log.info("使用传统 Action: %s", action_name)
                except Exception as e:
                    log.warning("Slotted Actions 创建失败: %s, 尝试传统模式", e)
                    # 如果 slotted actions 失败，回退到传统方式
                    if action is None:
                        action = bpy.data.actions.new(name=action_name)
                    # 清空 action_slot 避免混淆
                    if hasattr(armature_obj.animation_data, 'action_slot'):
                        armature_obj.animation_data.action_slot = None
                    armature_obj.animation_data.action = action
                    use_slotted = False
                
                log.info("创建 Action: %s (%d 帧)", action_name, total_frames)
                
                # 设置 Action 的帧范围（重要：让时间轴显示帧数据）
                if hasattr(action, 'frame_range'):
                    try:
                        action.frame_range = (1, total_frames)
                        log.debug("设置 Action 帧范围: 1 - %d", total_frames)
                    except Exception as e:
                        log.debug("设置 frame_range 失败: %s", e)
                
                # 在 Slotted Actions 模式下，也可能需要设置 Slot 的帧范围
                if use_slotted and slot:
                    if hasattr(slot, 'frame_range'):
                        try:
                            slot.frame_range = (1, total_frames)
                            log.debug("设置 Slot 帧范围: 1 - %d", total_frames)
                        except Exception as e:
                            log.debug("设置 Slot frame_range 失败: %s", e)
                
                # 设置为 POSE 模式（与手动导入 anim 一致）
                armature_obj.data.pose_position = "POSE"
                
                # 第一个动画时静音骨骼约束（避免 IK 约束覆盖关键帧）
                if first_anim:
                    muted = 0
                    for pb in armature_obj.pose.bones:
                        for c in pb.constraints:
                            if not c.mute:
                                c.mute = True
                                muted += 1
                    if muted:
                        log.debug("已静音 %d 个骨骼约束", muted)
                
                # 将绝对空间动画转换为 pose basis（与手动导入 anim 一致）
                vertex_groups = convert_tracks_to_pose_basis(
                    vertex_groups,
                    armature_obj,
                    ignore_translation=True,
                    logger=log
                )
                
                # 写入动画数据
                # 使用 write_transforms_via_keyframe_insert 为每个骨骼写入动画
                for bone_name, group_data in vertex_groups.items():
                    pose_bone = armature_obj.pose.bones.get(bone_name)
                    if not pose_bone:
                        log.debug("未找到姿态骨骼: %s", bone_name)
                        continue
                    
                    if not group_data:
                        log.warning("骨骼 %s 的动画数据为空", bone_name)
                        continue
                    
                    pose_bone.rotation_mode = "QUATERNION"
                    
                    try:
                        write_transforms_via_keyframe_insert(
                            armature_obj, bone_name, group_data, action, slot if use_slotted else None
                        )
                    except Exception as e:
                        log.error("写入骨骼 %s 动画失败: %s", bone_name, e)
                
                imported += 1
                log.info("成功导入动画: %s", file_name)
                
                # 设置场景帧率和帧范围
                context.scene.render.fps = 60
                context.scene.frame_start = 1
                context.scene.frame_end = total_frames
                log.debug("设置场景帧范围: 1 - %d, FPS: 60", total_frames)
                
                # 如果是第一个动画，设置为活动动画
                if first_anim:
                    first_anim = False
                    log.info("设置活动动画: %s", action_name)
                
            except Exception as e:
                log.error("导入动画失败 %s: %s", anim_path, e)
                import traceback
                log.debug(traceback.format_exc())
                errors += 1
        
        # 动画导入完成后，设置时间轴显示（Blender 5.0 Slotted Actions 需要选中骨骼才显示帧）
        if imported > 0 and armature_obj:
            # 取消所有选择
            for obj in context.selected_objects:
                obj.select_set(False)
            
            # 选中并激活骨架
            armature_obj.select_set(True)
            context.view_layer.objects.active = armature_obj
            
            # 切换到姿态模式
            if context.object and context.object.mode != 'POSE':
                bpy.ops.object.mode_set(mode='POSE')
            
            # 全选所有骨骼（让时间轴显示所有 FCurves）
            bpy.ops.pose.select_all(action='SELECT')
            
            # 刷新视图
            context.view_layer.update()
            context.scene.frame_set(1)
            
            # 强制刷新时间轴显示
            for window in context.window_manager.windows:
                for area in window.screen.areas:
                    if area.type == 'TIMELINE':
                        area.tag_redraw()
            
            # 回到物体模式
            if context.object and context.object.mode == 'POSE':
                bpy.ops.object.mode_set(mode='OBJECT')
        
        return imported, errors
    
    def _resolve_path(self, res_dir: str, relative_path: str) -> Optional[str]:
        """解析相对路径为绝对路径"""
        if not relative_path:
            return None
        
        # 移除开头的 /
        if relative_path.startswith('/'):
            relative_path = relative_path[1:]
        
        # 尝试多种路径组合
        candidates = [
            os.path.join(res_dir, relative_path),
            os.path.join(res_dir, "mesh", relative_path),
            os.path.join(res_dir, "mesh", "character", relative_path),  # 角色mesh在character目录下
            os.path.join(res_dir, "skeleton", relative_path),
            os.path.join(res_dir, "anim", relative_path),
        ]
        
        for path in candidates:
            if os.path.exists(path):
                return path
        
        return None
    
    def _resolve_mesh_path(self, res_dir: str, mesh_path: str, is_first_person: bool = False) -> Optional[str]:
        """
        解析角色mesh路径
        
        Args:
            res_dir: 资源根目录
            mesh_path: mesh相对路径 (如 "firebat_01_0/cloth01_lod0.mesh" 或 "prop/firebat/chest_001.mesh")
            is_first_person: 是否为第一人称
        
        Returns:
            绝对路径，找不到返回None
        """
        if not mesh_path:
            return None
        
        # 角色mesh通常在 mesh/character/firstperson 或 mesh/character/thirdperson 目录下
        # 装备mesh通常在 mesh/prop/ 目录下
        
        person_dir = "firstperson" if is_first_person else "thirdperson"
        
        # 尝试多种路径组合
        candidates = [
            # 标准路径 - 角色mesh (带人称前缀)
            os.path.join(res_dir, "mesh", "character", person_dir, mesh_path),
            # 标准路径 - 装备mesh (prop/xxx/...)
            os.path.join(res_dir, "mesh", mesh_path),
            # 标准路径 - 角色mesh (不带人称前缀，旧版本兼容)
            os.path.join(res_dir, "mesh", "character", mesh_path),
            # 其他可能的位置
            os.path.join(res_dir, mesh_path),
        ]
        
        for path in candidates:
            if os.path.exists(path):
                return path
        
        # 如果都找不到，记录调试信息
        log.debug(f"未找到mesh: {mesh_path} (尝试了 {len(candidates)} 个路径)")
        
        return None
    
    def _extract_mesh_paths_from_config(self, config_path: str, lod_level: str = "lod0") -> List[str]:
        """
        从配置文件提取mesh路径
        
        Args:
            config_path: 配置文件路径
            lod_level: LOD级别 ("all", "lod0", "lod1", "lod2")
        """
        import re
        
        mesh_paths = []
        
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 提取 SetMesh 调用中的路径
            # 格式: character:SetMesh("slot", "path/to/mesh.mesh", bool, lod_index)
            # 我们需要提取第二个参数（mesh路径）和第四个参数（LOD索引）
            
            # 方法1: 匹配完整的SetMesh调用，包括LOD索引
            # 格式: character:SetMesh("slot", "path", bool, lod_index)
            pattern_with_lod = r'character:SetMesh\([^,]+,\s*["\']([^"\']+)["\'][^,]*,[^,]*,\s*(\d+)\s*\)'
            matches_with_lod = re.findall(pattern_with_lod, content)
            
            if matches_with_lod:
                # 有LOD信息，根据选择的LOD级别过滤
                for mesh_path, lod_idx in matches_with_lod:
                    path = mesh_path.strip()
                    lod_idx = int(lod_idx)
                    
                    if path and path.endswith('.mesh'):
                        # 根据LOD级别过滤
                        if lod_level == "all":
                            # 导入所有LOD
                            mesh_paths.append(path)
                        elif lod_level == f"lod{lod_idx}":
                            # 只导入匹配的LOD级别
                            mesh_paths.append(path)
            else:
                # 没有LOD信息，使用旧方法提取所有mesh
                pattern = r'character:SetMesh\([^,]+,\s*["\']([^"\']+)["\']'
                matches = re.findall(pattern, content)
                
                for match in matches:
                    path = match.strip()
                    if path and path.endswith('.mesh'):
                        mesh_paths.append(path)
            
            log.debug(f"从 {os.path.basename(config_path)} 提取到 {len(mesh_paths)} 个mesh路径 (LOD: {lod_level})")
            
        except Exception as e:
            log.warning(f"解析配置文件失败: {e}")
        
        return mesh_paths


# =============================================================================
# 扫描武器动画操作符
# =============================================================================

class PMT_OT_ScanWeaponAnimations(Operator):
    """扫描角色武器动画 \nScan character weapon animations"""

    bl_idname = "pmt.scan_weapon_animations"
    bl_label = "扫描武器动画"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        """执行扫描"""
        # 获取选中的角色
        try:
            selected_index = int(context.scene.pmt_props.selected_character)
            characters = _character_cache.get("characters", [])
            
            if not characters or selected_index < 0 or selected_index >= len(characters):
                self.report({"ERROR"}, "请先扫描并选择角色")
                return {"CANCELLED"}
            
            char_info = characters[selected_index]
        except (ValueError, IndexError):
            self.report({"ERROR"}, "请先扫描并选择角色")
            return {"CANCELLED"}
        
        # 获取资源目录
        prefs = context.preferences.addons[MAIN_PACKAGE].preferences
        res_dir = prefs.dir_path
        
        # 获取视角
        is_first_person = context.scene.pmt_props.selected_person == "first"
        person_dir = "firstperson" if is_first_person else "thirdperson"
        
        # 构建动画目录路径
        # D:\Games\FC1.0.6.8166\finalcombat_nocache_mixed\animation\character\thirdperson\firebat
        anim_dir = os.path.join(res_dir, "animation", "character", person_dir, char_info.base.name)
        
        if not os.path.exists(anim_dir):
            self.report({"WARNING"}, f"动画目录不存在: {anim_dir}")
            return {"CANCELLED"}
        
        # 扫描武器目录
        weapons = []
        for item in sorted(os.listdir(anim_dir)):
            item_path = os.path.join(anim_dir, item)
            if os.path.isdir(item_path):
                # 统计该武器下的动画数量
                anim_count = len([f for f in os.listdir(item_path) if f.endswith('.anim')])
                weapons.append({
                    "name": item,
                    "path": item_path,
                    "count": anim_count
                })
        
        if not weapons:
            self.report({"WARNING"}, "未找到任何武器动画")
            return {"CANCELLED"}
        
        # 更新缓存
        _animation_cache["weapons"] = weapons
        _animation_cache["character"] = char_info.base.name
        _animation_cache["animations"] = []  # 清空动画列表
        
        # 更新武器枚举项
        from .. import update_weapon_enum_items
        enum_items = [
            ("none", "无 / None", "不导入动画"),
        ] + [
            (w["name"], f"{w['name']} ({w['count']}个动画)", f"导入{w['name']}武器的动画")
            for w in weapons
        ]
        update_weapon_enum_items(enum_items)
        
        log.info(f"扫描到 {len(weapons)} 个武器动画目录")
        self.report({"INFO"}, f"找到 {len(weapons)} 个武器")
        
        return {"FINISHED"}


class PMT_OT_ScanAnimations(Operator):
    """扫描武器下的动画文件 \nScan animation files for selected weapon"""

    bl_idname = "pmt.scan_animations"
    bl_label = "扫描动画"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        """执行扫描"""
        # 获取选中的武器
        selected_weapon = context.scene.pmt_props.selected_weapon
        
        if selected_weapon == "none":
            self.report({"WARNING"}, "请先选择武器")
            return {"CANCELLED"}
        
        # 从缓存获取武器信息
        weapons = _animation_cache.get("weapons", [])
        weapon_info = None
        for w in weapons:
            if w["name"] == selected_weapon:
                weapon_info = w
                break
        
        if not weapon_info:
            self.report({"ERROR"}, "武器信息未找到，请重新扫描")
            return {"CANCELLED"}
        
        # 扫描动画文件
        animations = []
        for item in sorted(os.listdir(weapon_info["path"])):
            if item.endswith('.anim'):
                animations.append({
                    "name": item[:-5],  # 去掉.anim后缀
                    "path": os.path.join(weapon_info["path"], item)
                })
        
        if not animations:
            self.report({"WARNING"}, "未找到任何动画文件")
            return {"CANCELLED"}
        
        # 更新缓存
        _animation_cache["animations"] = animations
        _animation_cache["weapon"] = selected_weapon
        
        # 更新动画枚举项
        from .. import update_animation_enum_items
        enum_items = [
            ("all", "全部 / All", f"导入所有动画 ({len(animations)}个)"),
        ] + [
            (a["name"], a["name"], f"导入{a['name']}动画")
            for a in animations
        ]
        update_animation_enum_items(enum_items)
        
        log.info(f"扫描到 {len(animations)} 个动画文件")
        self.report({"INFO"}, f"找到 {len(animations)} 个动画")
        
        return {"FINISHED"}



# =============================================================================
# 注意：类的注册/注销由主 __init__.py 统一管理
# =============================================================================
