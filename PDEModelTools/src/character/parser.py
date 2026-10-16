#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
角色脚本解析器

解析游戏角色的 Lua 脚本文件，提取装备和配置信息。
"""

import os
import re
from typing import List, Optional, Dict, Any

from ..log import get_module_logger
from .character_types import (
    CharacterInfo,
    CharacterBase,
    CharacterTeam,
    EquipmentInfo,
    EquipmentSlot,
    TeamSide,
)

log = get_module_logger("CHARACTER_PARSER")


class CharacterScriptParser:
    """
    角色脚本解析器
    
    解析 Lua 格式的角色脚本文件，提取以下信息：
    - 角色基础配置 (动画混合、物理)
    - 队伍配置 (骨骼、动画集)
    - 可用装备列表 (胸甲、帽子、勋章等)
    
    Example:
        parser = CharacterScriptParser()
        characters = parser.scan_character_directory("D:/Games/.../character")
        for char in characters:
            print(char.base.name)
            print(char.team_0.available_equipments)
    """
    
    def __init__(self):
        """初始化解析器"""
        pass
    
    def parse_character_directory(self, character_dir: str) -> Optional[CharacterInfo]:
        """
        解析角色目录
        
        Args:
            character_dir: 角色目录路径 (如 ".../character/firebat")
        
        Returns:
            CharacterInfo 对象，解析失败返回 None
        """
        if not os.path.exists(character_dir):
            log.error(f"角色目录不存在: {character_dir}")
            return None
        
        # 1. 解析基础配置
        base = self._parse_base_config(character_dir)
        if not base:
            log.error(f"解析基础配置失败: {character_dir}")
            return None
        
        # 2. 解析队伍0配置
        team_0_dir = character_dir + "_0"
        team_0 = self._parse_team_config(team_0_dir, base.name, TeamSide.TEAM_0)
        
        # 3. 解析队伍1配置
        team_1_dir = character_dir + "_1"
        team_1 = self._parse_team_config(team_1_dir, base.name, TeamSide.TEAM_1)
        
        # 如果两个队伍都没有配置，返回None
        if not team_0 and not team_1:
            log.warning(f"角色没有队伍配置: {base.name}")
            return None
        
        return CharacterInfo(base=base, team_0=team_0, team_1=team_1)
    
    def _parse_base_config(self, character_dir: str) -> Optional[CharacterBase]:
        """解析基础配置"""
        char_name = os.path.basename(character_dir)
        script_path = os.path.join(character_dir, "script.lua")
        physx_path = os.path.join(character_dir, "physx.lua")
        
        # 检查文件是否存在
        if not os.path.exists(script_path) and not os.path.exists(physx_path):
            log.debug(f"角色没有基础配置文件: {char_name}")
            return CharacterBase(name=char_name)
        
        # 解析动画混合配置
        animation_blend = {}
        if os.path.exists(script_path):
            animation_blend = self._parse_script_lua(script_path)
        
        # 解析物理配置
        physx_config = {}
        if os.path.exists(physx_path):
            physx_config = self._parse_physx_lua(physx_path)
        
        return CharacterBase(
            name=char_name,
            script_path=script_path,
            physx_path=physx_path,
            animation_blend_config=animation_blend,
            physx_config=physx_config
        )
    
    def _parse_script_lua(self, script_path: str) -> Dict:
        """解析 script.lua 文件"""
        config = {}
        try:
            with open(script_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 简单解析，提取关键配置
            # 这里只做基础解析，不深入解析所有内容
            config['raw_content'] = content
            
        except Exception as e:
            log.warning(f"解析 script.lua 失败: {e}")
        
        return config
    
    def _parse_physx_lua(self, physx_path: str) -> Dict:
        """解析 physx.lua 文件"""
        config = {}
        try:
            with open(physx_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 简单解析
            config['raw_content'] = content
            
        except Exception as e:
            log.warning(f"解析 physx.lua 失败: {e}")
        
        return config
    
    def _parse_team_config(self, team_dir: str, char_name: str, team: TeamSide) -> Optional[CharacterTeam]:
        """解析队伍配置"""
        if not os.path.exists(team_dir):
            log.debug(f"队伍目录不存在: {team_dir}")
            return None
        
        # 解析 all.lua
        all_lua = os.path.join(team_dir, "all.lua")
        all_config = {}
        if os.path.exists(all_lua):
            all_config = self._parse_all_lua(all_lua)
        
        # 扫描所有装备文件
        equipments = self._scan_equipments(team_dir)
        
        # 如果没有装备也没有配置，返回None
        if not equipments and not all_config:
            log.debug(f"队伍没有配置和装备: {team_dir}")
            return None
        
        return CharacterTeam(
            character_name=char_name,
            team=team,
            config_dir=team_dir,
            all_config=all_config,
            available_equipments=equipments
        )
    
    def _parse_all_lua(self, all_lua_path: str) -> Dict:
        """解析 all.lua 文件"""
        config = {}
        try:
            with open(all_lua_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 提取关键配置
            patterns = {
                'first_person_skeleton': r'character\.first_person_skeleton\s*=\s*["\']([^"\']+)["\']',
                'third_person_skeleton': r'character\.third_person_skeleton\s*=\s*["\']([^"\']+)["\']',
                'first_person_animationset': r'character\.first_person_animationset\s*=\s*["\']([^"\']+)["\']',
                'third_person_animationset': r'character\.third_person_animationset\s*=\s*["\']([^"\']+)["\']',
            }
            
            for key, pattern in patterns.items():
                match = re.search(pattern, content)
                if match:
                    config[key] = match.group(1)
            
        except Exception as e:
            log.warning(f"解析 all.lua 失败: {e}")
        
        return config
    
    def _scan_equipments(self, team_dir: str) -> Dict[EquipmentSlot, List[EquipmentInfo]]:
        """扫描装备文件"""
        equipments = {
            EquipmentSlot.CHEST: [],
            EquipmentSlot.HAT: [],
            EquipmentSlot.MEDAL: [],
            EquipmentSlot.BODY: [],
            EquipmentSlot.CLOTH: [],
            EquipmentSlot.OTHER: [],
        }
        
        for filename in os.listdir(team_dir):
            if not filename.endswith('.lua'):
                continue
            if filename == 'all.lua':
                continue
            
            filepath = os.path.join(team_dir, filename)
            equip_info = self._parse_equipment_lua(filepath, filename)
            
            if equip_info:
                slot = equip_info.slot
                if slot in equipments:
                    equipments[slot].append(equip_info)
        
        # 移除空槽位
        equipments = {k: v for k, v in equipments.items() if v}
        
        return equipments
    
    def _parse_equipment_lua(self, filepath: str, filename: str) -> Optional[EquipmentInfo]:
        """解析装备 lua 文件"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 提取装备名称 (去掉.lua后缀)
            equip_name = filename[:-4]
            
            # 判断装备类型
            slot = self._determine_equipment_slot(equip_name)
            
            # 提取mesh路径
            # 格式: detachablepart_info:SetMesh("path/to/mesh.mesh")
            mesh_path = ""
            mesh_match = re.search(r'detachablepart_info:SetMesh\(["\']([^"\']+)["\']\)', content)
            if mesh_match:
                mesh_path = mesh_match.group(1)
            
            # 提取骨骼路径
            skeleton_path = None
            skel_match = re.search(r'detachablepart_info\.skeleton\s*=\s*["\']([^"\']+)["\']', content)
            if skel_match:
                skeleton_path = skel_match.group(1)
            
            # 提取动画集
            animation_set = None
            anim_match = re.search(r':SetAnimationSet\(["\']([^"\']+)["\']\)', content)
            if anim_match:
                animation_set = anim_match.group(1)
            
            # 提取挂载骨骼节点
            joint = ""
            joint_match = re.search(r'detachablepart_info\.joint\s*=\s*["\']([^"\']+)["\']', content)
            if joint_match:
                joint = joint_match.group(1)
            
            # 提取比例
            proportion = 1.0
            prop_match = re.search(r'detachablepart_info\.proportion\s*=\s*([\d.]+)', content)
            if prop_match:
                proportion = float(prop_match.group(1))
            
            return EquipmentInfo(
                name=equip_name,
                slot=slot,
                mesh_path=mesh_path,
                skeleton_path=skeleton_path,
                animation_set=animation_set,
                joint=joint,
                proportion=proportion,
                config_path=filepath
            )
            
        except Exception as e:
            log.warning(f"解析装备文件失败 {filename}: {e}")
            return None
    
    def _determine_equipment_slot(self, equip_name: str) -> EquipmentSlot:
        """根据装备名称判断槽位"""
        name_lower = equip_name.lower()
        
        if name_lower.startswith('chest'):
            return EquipmentSlot.CHEST
        elif name_lower.startswith('hat'):
            return EquipmentSlot.HAT
        elif name_lower.startswith('medal'):
            return EquipmentSlot.MEDAL
        elif name_lower.startswith('body'):
            return EquipmentSlot.BODY
        elif name_lower.startswith('cloth'):
            return EquipmentSlot.CLOTH
        else:
            return EquipmentSlot.OTHER
    
    def scan_character_directory(self, character_root: str) -> List[CharacterInfo]:
        """
        扫描角色目录
        
        Args:
            character_root: character根目录
        
        Returns:
            所有角色信息列表
        """
        characters = []
        
        if not os.path.isdir(character_root):
            log.error(f"角色根目录不存在: {character_root}")
            return characters
        
        # 查找所有基础角色目录 (不包含_0, _1后缀)
        for item in sorted(os.listdir(character_root)):
            item_path = os.path.join(character_root, item)
            
            # 跳过非目录
            if not os.path.isdir(item_path):
                continue
            
            # 跳过队伍目录
            if item.endswith('_0') or item.endswith('_1'):
                continue
            
            # 跳过特殊目录
            if item in ['die_effect']:
                continue
            
            # 解析角色
            char_info = self.parse_character_directory(item_path)
            if char_info:
                characters.append(char_info)
                log.debug(f"解析角色: {char_info.base.name}")
        
        log.info(f"扫描完成，找到 {len(characters)} 个角色")
        return characters


# 便捷函数
def parse_character_directory(character_dir: str) -> Optional[CharacterInfo]:
    """解析角色目录的便捷函数"""
    parser = CharacterScriptParser()
    return parser.parse_character_directory(character_dir)


def scan_character_root(character_root: str) -> List[CharacterInfo]:
    """扫描角色根目录的便捷函数"""
    parser = CharacterScriptParser()
    return parser.scan_character_directory(character_root)
