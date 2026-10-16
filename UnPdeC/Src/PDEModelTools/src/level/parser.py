#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
地图脚本解析器

解析游戏地图的 Lua 脚本文件，提取 mesh 文件路径和变换数据。
"""

import os
import re
from typing import List, Optional, Dict, Any

from ..log import get_module_logger
from .level_types import (
    LevelInfo,
    MeshReference,
    MeshObjectType,
    Vector3,
)

log = get_module_logger("LEVEL_PARSER")


class LevelScriptParser:
    """
    地图脚本解析器
    
    解析 Lua 格式的地图脚本文件，提取以下信息：
    - 地图名称
    - 主场景 mesh 路径
    - 门/出生点 mesh 路径和位置
    - 动态物体 mesh 路径和位置
    
    Example:
        parser = LevelScriptParser()
        level_info = parser.parse("level1_cp_script.lua")
        print(level_info.map_name)
        print(level_info.get_all_mesh_paths())
    """
    
    # 正则表达式模式
    _PATTERNS = {
        # 地图名称: level:AddMapName("风车小镇")
        "map_name": r'level:AddMapName\s*\(\s*["\']([^"\']+)["\']\s*\)',
        
        # 主场景 mesh: level:AddMesh("level1/scene.mesh")
        "add_mesh": r'level:AddMesh\s*\(\s*["\']([^"\']+)["\']\s*\)',
        
        # 物理 mesh: level:AddPhysx("level1/scene.mesh")
        "physx_mesh": r'level:AddPhysx\s*\(\s*["\']([^"\']+)["\']\s*\)',
        
        # 光照贴图: level:SetLightMap("materials/et01_lp_all.dds")
        "light_map": r'level:SetLightMap\s*\(\s*["\']([^"\']+)["\']\s*\)',
        
        # 占领点 mesh: level:SetHoldPointMesh("Centerpoint/Centerpoint.mesh", 0.65)
        "hold_point_mesh": r'level:SetHoldPointMesh\s*\(\s*["\']([^"\']+)["\']\s*,\s*([\d.]+)\s*\)',
        
        # 门: level:AddGate(1, 0, "level1_red_left_gate.mesh", Vector3(-10.79, 2.398, -33.993), ...)
        "add_gate": r'level:AddGate\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*["\']([^"\']+)["\']\s*,\s*(Vector3\s*\([^)]+\))\s*,\s*(Vector3\s*\([^)]+\))\s*,\s*([-\d.]+)\s*,\s*(Vector3\s*\([^)]+\))\s*,\s*(Vector3\s*\([^)]+\))',
        
        # 动态物体: level:AddActiveObject(Vector3(...), -115.621, "windmils/windmils.mesh", Vector3(1, 0, 0), 100)
        "add_active_object": r'level:AddActiveObject\s*\(\s*(Vector3\s*\([^)]+\))\s*,\s*([-\d.]+)\s*,\s*["\']([^"\']+)["\']\s*,\s*Vector3\s*\([^)]+\)\s*,\s*([-\d.]+)',
        
        # 相机位置: level:SetCameraPosition(0.737277, 3.111781, 9.254735)
        "camera_position": r'level:SetCameraPosition\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)',
        
        # 相机旋转: level:SetCameraRotation(0.044162, 0.015661, 0, 0.998902)
        "camera_rotation": r'level:SetCameraRotation\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)',
        
        # 阳光方向: level:SetSunDirection(0.557186, 0.782152, 0.278894)
        "sun_direction": r'level:SetSunDirection\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)',
    }
    
    def __init__(self):
        """初始化解析器"""
        self._compiled_patterns: Dict[str, re.Pattern] = {}
        self._compile_patterns()
    
    def _compile_patterns(self):
        """预编译正则表达式"""
        for name, pattern in self._PATTERNS.items():
            self._compiled_patterns[name] = re.compile(pattern)
    
    def parse(self, script_path: str) -> Optional[LevelInfo]:
        """
        解析地图脚本文件
        
        Args:
            script_path: 脚本文件路径
        
        Returns:
            LevelInfo 对象，解析失败返回 None
        """
        if not os.path.exists(script_path):
            log.error(f"脚本文件不存在: {script_path}")
            return None
        
        try:
            with open(script_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            log.error(f"读取脚本文件失败: {e}")
            return None
        
        # 创建 LevelInfo 对象
        level_info = LevelInfo(script_path=script_path)
        
        # 解析各种数据
        self._parse_map_name(content, level_info)
        
        # 修改地图名称：添加脚本前缀
        self._add_script_prefix(level_info, script_path)
        self._parse_main_mesh(content, level_info)
        self._parse_physx_mesh(content, level_info)
        self._parse_light_map(content, level_info)
        self._parse_hold_point_mesh(content, level_info)
        self._parse_gates(content, level_info)
        self._parse_active_objects(content, level_info)
        self._parse_camera(content, level_info)
        self._parse_sun(content, level_info)
        
        log.info(
            f"解析完成: {level_info.map_name} - "
            f"主场景: {1 if level_info.main_mesh else 0}, "
            f"门: {sum(1 for r in level_info.mesh_references if r.object_type == MeshObjectType.GATE)}, "
            f"动态物体: {sum(1 for r in level_info.mesh_references if r.object_type == MeshObjectType.ACTIVE_OBJECT)}"
        )
        
        return level_info
    
    def _parse_map_name(self, content: str, level_info: LevelInfo):
        """解析地图名称"""
        match = self._compiled_patterns["map_name"].search(content)
        if match:
            level_info.map_name = match.group(1)
    
    def _add_script_prefix(self, level_info: LevelInfo, script_path: str):
        """
        添加脚本前缀到地图名称
        
        例如：
        - level_train_script.lua + "火车测试" -> "level_train 火车测试"
        - level1_cp_script.lua + "风车小镇" -> "level1_cp 风车小镇"
        
        Args:
            level_info: 地图信息对象
            script_path: 脚本文件路径
        """
        # 获取脚本文件名
        script_name = os.path.basename(script_path)
        
        # 移除 _script.lua 后缀
        if script_name.endswith("_script.lua"):
            prefix = script_name[:-11]  # 移除 "_script.lua" (11个字符)
        else:
            prefix = script_name.replace(".lua", "")
        
        # 组合新名称
        if level_info.map_name:
            level_info.map_name = f"{prefix} {level_info.map_name}"
        else:
            level_info.map_name = prefix
    
    def _get_sort_key(self, script_path: str) -> tuple:
        """
        获取排序键，用于按 level1, level2, ..., level10, level11 顺序排序
        
        Args:
            script_path: 脚本文件路径
        
        Returns:
            排序键元组 (level_number, mode_suffix)
        """
        # 获取脚本文件名
        script_name = os.path.basename(script_path)
        
        # 移除 _script.lua 后缀
        if script_name.endswith("_script.lua"):
            name = script_name[:-11]  # 移除 "_script.lua" (11个字符)
        else:
            name = script_name.replace(".lua", "")
        
        # 提取 level 编号
        # level1_cp -> (1, "cp")
        # level10_td -> (10, "td")
        # level_train -> (999, "train")  # 特殊地图排在最后
        
        import re
        match = re.match(r'level(\d+)_(.+)', name)
        if match:
            level_num = int(match.group(1))
            mode = match.group(2)
            return (level_num, mode)
        
        # level_train 等特殊地图
        match = re.match(r'level_(.+)', name)
        if match:
            return (0, match.group(1))  # 排在最前面
        
        # 其他情况
        return (999, name)
    
    def _parse_main_mesh(self, content: str, level_info: LevelInfo):
        """解析主场景 mesh"""
        match = self._compiled_patterns["add_mesh"].search(content)
        if match:
            level_info.main_mesh = match.group(1)
    
    def _parse_physx_mesh(self, content: str, level_info: LevelInfo):
        """解析物理 mesh"""
        match = self._compiled_patterns["physx_mesh"].search(content)
        if match:
            level_info.physx_mesh = match.group(1)
    
    def _parse_light_map(self, content: str, level_info: LevelInfo):
        """解析光照贴图"""
        match = self._compiled_patterns["light_map"].search(content)
        if match:
            level_info.light_map = match.group(1)
    
    def _parse_hold_point_mesh(self, content: str, level_info: LevelInfo):
        """解析占领点 mesh"""
        match = self._compiled_patterns["hold_point_mesh"].search(content)
        if match:
            mesh_path = match.group(1)
            scale = float(match.group(2))
            
            mesh_ref = MeshReference(
                mesh_path=mesh_path,
                object_type=MeshObjectType.ACTIVE_OBJECT,  # 占领点作为动态物体处理
                scale=Vector3(scale, scale, scale),
            )
            level_info.mesh_references.append(mesh_ref)
            log.debug(f"解析占领点: {mesh_path}, scale={scale}")
    
    def _parse_gates(self, content: str, level_info: LevelInfo):
        """解析门/出生点"""
        for match in self._compiled_patterns["add_gate"].finditer(content):
            try:
                team_id = int(match.group(1))
                gate_type = int(match.group(2))
                mesh_path = match.group(3)
                position = Vector3.from_str(match.group(4))
                # target_position = Vector3.from_str(match.group(5))  # 目标位置暂不使用
                rotation = float(match.group(6))
                scale = Vector3.from_str(match.group(7))
                # collision_size = Vector3.from_str(match.group(8))  # 碰撞盒暂不使用
                
                mesh_ref = MeshReference(
                    mesh_path=mesh_path,
                    object_type=MeshObjectType.GATE,
                    position=position,
                    rotation=rotation,
                    scale=scale,
                    team_id=team_id,
                    gate_type=gate_type,
                )
                level_info.mesh_references.append(mesh_ref)
            except (ValueError, IndexError) as e:
                log.warning(f"解析门数据失败: {e}")
    
    def _parse_active_objects(self, content: str, level_info: LevelInfo):
        """解析动态物体"""
        for match in self._compiled_patterns["add_active_object"].finditer(content):
            try:
                position = Vector3.from_str(match.group(1))
                rotation = float(match.group(2))
                mesh_path = match.group(3)
                # Vector3(1, 0, 0) 是旋转轴
                # 最后一个参数不是缩放，可能是动画速度或其他参数
                
                mesh_ref = MeshReference(
                    mesh_path=mesh_path,
                    object_type=MeshObjectType.ACTIVE_OBJECT,
                    position=position,
                    rotation=rotation,
                    # 不设置缩放，使用默认值 (1, 1, 1)
                )
                level_info.mesh_references.append(mesh_ref)
                log.debug(f"解析动态物体: {mesh_path}, 位置: ({position.x}, {position.y}, {position.z}), 旋转: {rotation}°")
            except (ValueError, IndexError) as e:
                log.warning(f"解析动态物体数据失败: {e}")
    
    def _parse_camera(self, content: str, level_info: LevelInfo):
        """解析相机设置"""
        match = self._compiled_patterns["camera_position"].search(content)
        if match:
            level_info.camera_position = Vector3(
                x=float(match.group(1)),
                y=float(match.group(2)),
                z=float(match.group(3))
            )
        
        match = self._compiled_patterns["camera_rotation"].search(content)
        if match:
            level_info.camera_rotation = (
                float(match.group(1)),
                float(match.group(2)),
                float(match.group(3)),
                float(match.group(4))
            )
    
    def _parse_sun(self, content: str, level_info: LevelInfo):
        """解析阳光设置"""
        match = self._compiled_patterns["sun_direction"].search(content)
        if match:
            level_info.sun_direction = Vector3(
                x=float(match.group(1)),
                y=float(match.group(2)),
                z=float(match.group(3))
            )
    
    def scan_directory(self, directory: str) -> List[LevelInfo]:
        """
        扫描目录中的所有地图脚本
        
        Args:
            directory: 目录路径
        
        Returns:
            LevelInfo 列表
        """
        levels = []
        
        if not os.path.isdir(directory):
            log.error(f"目录不存在: {directory}")
            return levels
        
        # 查找所有 *_script.lua 文件
        for filename in os.listdir(directory):
            if filename.endswith("_script.lua"):
                script_path = os.path.join(directory, filename)
                
                # 预检查：读取文件开头，确认是地图脚本
                try:
                    with open(script_path, 'r', encoding='utf-8') as f:
                        first_line = f.readline().strip()
                        # 地图脚本必须以 level: 开头
                        if not first_line.startswith('level:'):
                            log.debug(f"跳过非地图脚本: {filename}")
                            continue
                except Exception as e:
                    log.warning(f"无法读取文件 {filename}: {e}")
                    continue
                
                # 解析地图脚本
                level_info = self.parse(script_path)
                if level_info:
                    levels.append(level_info)
        
        # 按脚本文件名排序（level1, level2, ..., level10, level11, ...）
        levels.sort(key=lambda x: self._get_sort_key(x.script_path))
        
        log.info(f"扫描完成，找到 {len(levels)} 个地图")
        return levels


# 便捷函数
def parse_level_script(script_path: str) -> Optional[LevelInfo]:
    """解析地图脚本的便捷函数"""
    parser = LevelScriptParser()
    return parser.parse(script_path)


def scan_level_directory(directory: str) -> List[LevelInfo]:
    """扫描地图目录的便捷函数"""
    parser = LevelScriptParser()
    return parser.scan_directory(directory)
