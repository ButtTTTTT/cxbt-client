"""
角色数据类型定义

定义角色脚本解析后的数据结构。
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple
from enum import Enum


class TeamSide(Enum):
    """队伍阵营"""
    TEAM_0 = 0  # 红队/CT
    TEAM_1 = 1  # 蓝队/T


class EquipmentSlot(Enum):
    """装备槽位"""
    CHEST = "chest"      # 胸甲
    HAT = "hat"          # 帽子
    MEDAL = "medal"      # 勋章
    BODY = "body"        # 身体
    CLOTH = "cloth"      # 衣服
    OTHER = "other"      # 其他


@dataclass
class Vector3:
    """三维向量"""
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    
    def to_tuple(self) -> Tuple[float, float, float]:
        """转换为元组"""
        return (self.x, self.y, self.z)
    
    @classmethod
    def from_str(cls, text: str) -> "Vector3":
        """从字符串解析 Vector3(x, y, z)"""
        text = text.strip()
        if text.startswith("Vector3("):
            text = text[8:-1]
        parts = text.split(",")
        if len(parts) >= 3:
            return cls(
                x=float(parts[0].strip()),
                y=float(parts[1].strip()),
                z=float(parts[2].strip())
            )
        return cls()


@dataclass
class EquipmentInfo:
    """装备信息"""
    name: str                          # 装备名称 (如 "chest001")
    slot: EquipmentSlot                # 槽位
    mesh_path: str = ""                # mesh文件路径
    skeleton_path: Optional[str] = None  # 骨骼文件路径
    animation_set: Optional[str] = None  # 动画集
    joint: str = ""                    # 挂载骨骼节点
    proportion: float = 1.0            # 比例
    config_path: str = ""              # 配置文件路径
    
    def get_display_name(self) -> str:
        """获取显示名称"""
        return f"{self.name} ({self.slot.value})"


@dataclass
class CharacterBase:
    """角色基础配置"""
    name: str                          # 角色名 (如 "firebat")
    script_path: str = ""              # script.lua路径
    physx_path: str = ""               # physx.lua路径
    animation_blend_config: Dict = field(default_factory=dict)
    physx_config: Dict = field(default_factory=dict)
    
    def get_display_name(self) -> str:
        """获取显示名称"""
        return self.name


@dataclass
class CharacterTeam:
    """角色队伍配置"""
    character_name: str                # 角色名
    team: TeamSide                     # 队伍
    config_dir: str                    # 配置目录路径
    all_config: Dict = field(default_factory=dict)  # all.lua配置
    available_equipments: Dict[EquipmentSlot, List[EquipmentInfo]] = field(default_factory=dict)
    
    def get_team_name(self) -> str:
        """获取队伍名称"""
        return "红队/Red Team" if self.team == TeamSide.TEAM_0 else "蓝队/Blue Team"
    
    def get_skeleton_path(self, is_first_person: bool = False) -> Optional[str]:
        """获取骨骼路径"""
        key = "first_person_skeleton" if is_first_person else "third_person_skeleton"
        return self.all_config.get(key)
    
    def get_animation_set(self, is_first_person: bool = False) -> Optional[str]:
        """获取动画集"""
        key = "first_person_animationset" if is_first_person else "third_person_animationset"
        return self.all_config.get(key)
    
    def get_equipment_count(self) -> Dict[EquipmentSlot, int]:
        """获取各类型装备数量"""
        return {slot: len(equips) for slot, equips in self.available_equipments.items()}


@dataclass
class CharacterInfo:
    """完整角色信息"""
    base: CharacterBase                # 基础配置
    team_0: Optional[CharacterTeam] = None  # 队伍0配置
    team_1: Optional[CharacterTeam] = None  # 队伍1配置
    
    def get_display_name(self) -> str:
        """获取显示名称"""
        return self.base.get_display_name()
    
    def get_team(self, team: TeamSide) -> Optional[CharacterTeam]:
        """获取指定队伍配置"""
        if team == TeamSide.TEAM_0:
            return self.team_0
        else:
            return self.team_1
    
    def has_team(self, team: TeamSide) -> bool:
        """检查是否有指定队伍配置"""
        team_config = self.get_team(team)
        return team_config is not None and team_config.available_equipments
    
    def get_available_teams(self) -> List[TeamSide]:
        """获取可用的队伍列表"""
        teams = []
        if self.has_team(TeamSide.TEAM_0):
            teams.append(TeamSide.TEAM_0)
        if self.has_team(TeamSide.TEAM_1):
            teams.append(TeamSide.TEAM_1)
        return teams
