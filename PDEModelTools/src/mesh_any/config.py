"""
网格类型配置模块

定义不同类型网格文件的配置信息。
使用 dataclass 和 enum 提供类型安全的配置访问。

支持的网格类型：
- Prop: 道具/静态物品
- Map: 地图
- CW: Character/Weapon（人物/武器）
"""

from dataclasses import dataclass
from enum import Enum
from typing import Dict, Tuple, Optional


class MeshType(Enum):
    """网格类型枚举"""
    UNSET = "Unset"
    PROP = "Prop"
    MAP = "Map"
    CW = "CW"  # Character/Weapon


class MeshVersion(Enum):
    """网格版本枚举"""
    UNSET = ""
    V1 = "V1"
    V2 = "V2"


@dataclass
class MeshConfig:
    """
    网格类型配置
    
    Attributes:
        mesh_type: 网格类型
        version: 版本标识
        header_size: 物体头部大小（字节）
        vertex_bytes_offset: 顶点数据字节偏移
        bone_indices_offset: 骨骼索引偏移（仅 CW 类型）
        uv_offset: UV 数据偏移
    """
    mesh_type: MeshType
    version: MeshVersion
    header_size: int = 0x0
    vertex_bytes_offset: int = 0x0
    bone_indices_offset: int = 0x0
    uv_offset: int = 0x0
    
    def is_valid(self) -> bool:
        """检查配置是否有效"""
        return self.mesh_type != MeshType.UNSET
    
    def is_cw_type(self) -> bool:
        """是否为角色/武器类型"""
        return self.mesh_type == MeshType.CW
    
    def is_static_type(self) -> bool:
        """是否为静态类型（Prop/Map）"""
        return self.mesh_type in (MeshType.PROP, MeshType.MAP)


# =============================================================================
# 配置注册表
# =============================================================================

def _create_config_registry() -> Dict[Tuple[MeshType, MeshVersion], MeshConfig]:
    """创建配置注册表"""
    return {
        # Prop V1 - 道具
        (MeshType.PROP, MeshVersion.V1): MeshConfig(
            mesh_type=MeshType.PROP,
            version=MeshVersion.V1,
            header_size=0x1D,
            vertex_bytes_offset=0x19,
            uv_offset=0x10,
        ),
        
        # Prop V2 - 道具（新版本）
        (MeshType.PROP, MeshVersion.V2): MeshConfig(
            mesh_type=MeshType.PROP,
            version=MeshVersion.V2,
            header_size=0x21,
            vertex_bytes_offset=0x1D,
            uv_offset=0x10,
        ),
        
        # Map V1 - 地图
        (MeshType.MAP, MeshVersion.V1): MeshConfig(
            mesh_type=MeshType.MAP,
            version=MeshVersion.V1,
            header_size=0x1D,
            vertex_bytes_offset=0x19,
            uv_offset=0x10,
        ),
        
        # Map V2 - 地图（新版本）
        (MeshType.MAP, MeshVersion.V2): MeshConfig(
            mesh_type=MeshType.MAP,
            version=MeshVersion.V2,
            header_size=0x21,
            vertex_bytes_offset=0x1D,
            uv_offset=0x10,
        ),
        
        # CW V1 - 角色/武器
        (MeshType.CW, MeshVersion.V1): MeshConfig(
            mesh_type=MeshType.CW,
            version=MeshVersion.V1,
            header_size=0x1D,
            vertex_bytes_offset=0x19,
            bone_indices_offset=0x24,
            uv_offset=0x8,
        ),
        
        # CW V2 - 角色/武器（新版本）
        (MeshType.CW, MeshVersion.V2): MeshConfig(
            mesh_type=MeshType.CW,
            version=MeshVersion.V2,
            header_size=0x21,
            vertex_bytes_offset=0x1D,
            uv_offset=0x8,
        ),
    }


# 全局配置注册表
CONFIG_REGISTRY = _create_config_registry()


# =============================================================================
# 配置访问函数
# =============================================================================

def get_config(mesh_type: MeshType, version: MeshVersion) -> MeshConfig:
    """
    获取指定类型和版本的配置
    
    Args:
        mesh_type: 网格类型
        version: 版本
    
    Returns:
        配置对象，如果不存在则返回默认配置
    """
    config = CONFIG_REGISTRY.get((mesh_type, version))
    
    if config:
        return config
    
    # 返回未设置配置
    return MeshConfig(
        mesh_type=MeshType.UNSET,
        version=MeshVersion.UNSET,
    )


def get_unset_config() -> MeshConfig:
    """获取未设置状态的默认配置"""
    return MeshConfig(
        mesh_type=MeshType.UNSET,
        version=MeshVersion.UNSET,
    )


def get_cw_default_config() -> MeshConfig:
    """获取 CW 类型的默认配置（V1）"""
    return get_config(MeshType.CW, MeshVersion.V1)


def get_prop_v1_config() -> MeshConfig:
    """获取 Prop V1 配置"""
    return get_config(MeshType.PROP, MeshVersion.V1)


def get_map_v1_config() -> MeshConfig:
    """获取 Map V1 配置"""
    return get_config(MeshType.MAP, MeshVersion.V1)


# =============================================================================
# 文件类型常量
# =============================================================================

# 文件类型标识
FILE_TYPE_8_BYTE = 0x8

# MinPos/MaxPos 数据块大小
MINPOS_MAXPOS_SIZE = 0x18

# 静态 Mesh 文件头标识
MESH_TYPE_STATIC = b"\x00\x01\x00\x00\x01\x00\x00\x00"

# 动态 Mesh 文件头标识（人物/武器）
MESH_TYPE_DYNAMIC = b"\x00\x01\x00\x00\x02\x00\x00\x00"

# 每组顶点数据的标准大小（静态网格）
VERTEX_BLOCK_SIZE_STATIC = 0x34

# 每组顶点数据的标准大小（动态网格）
VERTEX_BLOCK_SIZE_CW = 0x40

# 每组面数据的大小（3 个索引 * 4 字节）
FACE_BLOCK_SIZE = 0x0C

# 骨骼索引无效值
BONE_INDEX_INVALID = 0xFF

# 骨骼变换数据大小
BONE_TRANSFORM_SIZE = 0x1C
