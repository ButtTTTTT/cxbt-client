#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
武器脚本解析器

解析武器 Lua 脚本，提取骨骼路径、mesh 路径等信息。
"""

import os
import re
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

from ..log import get_module_logger

log = get_module_logger("WEAPON_PARSER")


@dataclass
class WeaponInfo:
    """武器信息"""
    name: str                          # 武器名称
    script_path: str                   # 脚本路径
    skeleton_path: Optional[str] = None  # 骨骼路径
    animation_set: Optional[str] = None  # 动画集名称
    mesh_paths: List[str] = None       # mesh 路径列表
    
    def __post_init__(self):
        if self.mesh_paths is None:
            self.mesh_paths = []


class WeaponScriptParser:
    """武器脚本解析器"""
    
    def parse_weapon_script(self, script_path: str) -> Optional[WeaponInfo]:
        """
        解析武器脚本
        
        Args:
            script_path: 武器脚本路径
            
        Returns:
            WeaponInfo 或 None
        """
        if not os.path.exists(script_path):
            log.warning(f"武器脚本不存在: {script_path}")
            return None
        
        try:
            with open(script_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 提取武器名称（从目录名）
            weapon_name = os.path.basename(os.path.dirname(script_path))
            
            # 提取骨骼路径
            skeleton_path = self._extract_skeleton_path(content)
            
            # 提取动画集
            animation_set = self._extract_animation_set(content)
            
            # 提取 mesh 路径
            mesh_paths = self._extract_mesh_paths(content)
            
            info = WeaponInfo(
                name=weapon_name,
                script_path=script_path,
                skeleton_path=skeleton_path,
                animation_set=animation_set,
                mesh_paths=mesh_paths,
            )
            
            log.debug(f"解析武器: {weapon_name}, skeleton={skeleton_path}, meshes={len(mesh_paths)}")
            return info
            
        except Exception as e:
            log.error(f"解析武器脚本失败 {script_path}: {e}")
            return None
    
    def _extract_skeleton_path(self, content: str) -> Optional[str]:
        """提取骨骼路径"""
        # weapon.skeleton = "/skeleton/flamethrowerskeleton.skel"
        match = re.search(r'weapon\.skeleton\s*=\s*["\']([^"\']+)["\']', content)
        if match:
            return match.group(1)
        return None
    
    def _extract_animation_set(self, content: str) -> Optional[str]:
        """提取动画集名称"""
        # weapon.animation_set = "flamethrower"
        match = re.search(r'weapon\.animation_set\s*=\s*["\']([^"\']+)["\']', content)
        if match:
            return match.group(1)
        return None
    
    def _extract_mesh_paths(self, content: str) -> List[str]:
        """提取 mesh 路径"""
        paths = []
        
        # weapon:SetMeshColor("rv", "flamethrower/rv1", 0)
        pattern = r'weapon:SetMeshColor\([^,]+,\s*["\']([^"\']+)["\']'
        matches = re.findall(pattern, content)
        for match in matches:
            if match and match not in paths:
                paths.append(match)
        
        # weapon:SetMeshColorWithLevel("rv", "weapon_fx/flamethrower_5.mesh", 0, 5)
        pattern2 = r'weapon:SetMeshColorWithLevel\([^,]+,\s*["\']([^"\']+)["\']'
        matches2 = re.findall(pattern2, content)
        for match in matches2:
            if match and match not in paths:
                paths.append(match)
        
        return paths
    
    def scan_weapon_directory(self, weapon_dir: str) -> List[WeaponInfo]:
        """
        扫描武器目录
        
        Args:
            weapon_dir: 武器根目录 (如 .../weapon/)
            
        Returns:
            WeaponInfo 列表
        """
        weapons = []
        
        if not os.path.exists(weapon_dir):
            log.warning(f"武器目录不存在: {weapon_dir}")
            return weapons
        
        for item in sorted(os.listdir(weapon_dir)):
            item_path = os.path.join(weapon_dir, item)
            if not os.path.isdir(item_path):
                continue
            
            # 查找脚本文件 (优先 rv1.lua, 其次 mz1.lua, 再其他 .lua)
            script_file = None
            for candidate in ["rv1.lua", "mz1.lua"]:
                candidate_path = os.path.join(item_path, candidate)
                if os.path.exists(candidate_path) and os.path.getsize(candidate_path) > 0:
                    script_file = candidate_path
                    break
            
            if not script_file:
                # 查找任意非空 .lua 文件
                for f in os.listdir(item_path):
                    if f.endswith('.lua'):
                        fpath = os.path.join(item_path, f)
                        if os.path.getsize(fpath) > 0:
                            script_file = fpath
                            break
            
            if script_file:
                info = self.parse_weapon_script(script_file)
                if info:
                    weapons.append(info)
        
        log.info(f"扫描到 {len(weapons)} 个武器")
        return weapons
