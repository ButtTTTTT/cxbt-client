"""
地图数据类型定义

定义地图脚本解析后的数据结构。
"""

from dataclasses import dataclass, field
from typing import List, Optional, Tuple
from enum import Enum


class MeshObjectType(Enum):
    """Mesh 对象类型"""
    MAIN_SCENE = "main_scene"       # 主场景
    GATE = "gate"                   # 门/出生点
    ACTIVE_OBJECT = "active_object" # 动态物体
    UNKNOWN = "unknown"             # 未知类型


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
        # 移除 Vector3( 和 )
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
class MeshReference:
    """Mesh 引用信息"""
    mesh_path: str                           # mesh 文件路径
    object_type: MeshObjectType              # 对象类型
    position: Vector3 = field(default_factory=Vector3)  # 位置
    rotation: float = 0.0                    # 旋转角度（度）
    scale: Vector3 = field(default_factory=lambda: Vector3(1, 1, 1))  # 缩放
    team_id: int = 0                         # 队伍ID（门用）
    gate_type: int = 0                       # 门类型
    rotation_axis: Vector3 = field(default_factory=lambda: Vector3(0, 1, 0))  # 旋转轴
    extra_data: dict = field(default_factory=dict)  # 额外数据


@dataclass
class LevelInfo:
    """地图信息"""
    script_path: str                         # 脚本文件路径
    map_name: str = ""                       # 地图名称
    main_mesh: Optional[str] = None          # 主场景 mesh 路径
    physx_mesh: Optional[str] = None         # 物理碰撞 mesh 路径
    light_map: Optional[str] = None          # 光照贴图路径
    
    # 所有 mesh 引用
    mesh_references: List[MeshReference] = field(default_factory=list)
    
    # 相机设置
    camera_position: Optional[Vector3] = None
    camera_rotation: Optional[Tuple[float, float, float, float]] = None
    
    # 阳光设置
    sun_direction: Optional[Vector3] = None
    shadow_direction: Optional[Vector3] = None
    
    # 其他设置
    fog_settings: dict = field(default_factory=dict)
    
    def get_all_mesh_paths(self) -> List[str]:
        """获取所有 mesh 文件路径"""
        paths = []
        if self.main_mesh:
            paths.append(self.main_mesh)
        for ref in self.mesh_references:
            if ref.mesh_path and ref.mesh_path not in paths:
                paths.append(ref.mesh_path)
        return paths
    
    def get_mesh_count(self) -> dict:
        """获取各类型 mesh 数量统计"""
        counts = {
            MeshObjectType.MAIN_SCENE: 0,
            MeshObjectType.GATE: 0,
            MeshObjectType.ACTIVE_OBJECT: 0,
            MeshObjectType.UNKNOWN: 0,
        }
        if self.main_mesh:
            counts[MeshObjectType.MAIN_SCENE] = 1
        for ref in self.mesh_references:
            counts[ref.object_type] = counts.get(ref.object_type, 0) + 1
        return counts
