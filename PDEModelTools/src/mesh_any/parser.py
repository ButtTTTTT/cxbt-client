"""
网格文件解析器模块

提供多种网格文件格式的解析功能，支持 Prop、Map、Character/Weapon 等类型。
使用 Python 标准库进行高性能二进制解析。

架构：
- MeshParser: 主解析器入口，自动检测类型并分发给子解析器
- StaticMeshParser: 静态网格（Prop/Map）解析器
- DynamicMeshParser: 动态网格（Character/Weapon）解析器

遵循原则：
- 单个文件不超过 500 行
- 使用 array.array 批量解析二进制数据
- 通过 config.py 管理配置
"""

import mmap
import struct
import os
from typing import List, Tuple, Optional, Dict, Any

from ..log import get_module_logger
from .config import (
    MeshType,
    MeshVersion,
    MeshConfig,
    get_config,
    get_unset_config,
    get_cw_default_config,
    FILE_TYPE_8_BYTE,
    MINPOS_MAXPOS_SIZE,
    MESH_TYPE_STATIC,
    MESH_TYPE_DYNAMIC,
    VERTEX_BLOCK_SIZE_STATIC,
    VERTEX_BLOCK_SIZE_CW,
)
from .exceptions import (
    MeshParseError,
    InvalidMeshHeaderError,
    UnsupportedMeshTypeError,
    IncompleteDataError,
)

log = get_module_logger("PARSE")


# =============================================================================
# 主解析器类
# =============================================================================

class MeshParser:
    """
    网格文件解析器
    
    自动检测文件类型并分发给对应的解析器。
    
    Usage:
        parser = MeshParser()
        mesh_objects = parser.parse_file("path/to/file.mesh")
    """
    
    def __init__(self):
        self._reset_state()
    
    def _reset_state(self) -> None:
        """重置解析器状态"""
        self._config = get_unset_config()
        self._object_count = 0
        self._objects_processed = 0
        
        # 边界框数据
        self.min_position: Optional[Tuple[float, float, float]] = None
        self.max_position: Optional[Tuple[float, float, float]] = None
        self.bbox_list: List[Dict[str, Any]] = []
        
        # 物体名称（CW 类型）
        self.obj_names: List[str] = []
    
    @property
    def config(self) -> MeshConfig:
        """当前配置"""
        return self._config
    
    @property
    def mesh_type(self) -> MeshType:
        """当前网格类型"""
        return self._config.mesh_type
    
    @property
    def mesh_version(self) -> MeshVersion:
        """当前网格版本"""
        return self._config.version
    
    def parse_file(self, filepath: str) -> List[Dict[str, Any]]:
        """
        解析网格文件
        
        Args:
            filepath: 文件路径
        
        Returns:
            网格对象数据列表
        
        Raises:
            MeshParseError: 解析失败
        """
        self._reset_state()
        results = []
        
        try:
            with open(filepath, "rb") as f:
                with mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as mmap_obj:
                    # 检测类型和版本
                    self._detect_type_and_version(mmap_obj)
                    
                    if not self._config.is_valid():
                        raise UnsupportedMeshTypeError(
                            "Unknown", 
                            filepath=filepath
                        )
                    
                    # 分发给对应的解析器
                    if self._config.is_cw_type():
                        # 动态类型（Character/Weapon）
                        results = self._parse_dynamic_mesh(mmap_obj)
                    else:
                        # 静态类型（Prop/Map）
                        results = self._parse_static_mesh(mmap_obj)
            
            log.info(
                f"成功解析 {len(results)} 个网格对象，"
                f"类型: {self._config.mesh_type.value}, "
                f"版本: {self._config.version.value}"
            )
            return results
            
        except MeshParseError:
            raise
        except Exception as e:
            raise MeshParseError(f"解析失败: {e}", filepath) from e
    
    # =========================================================================
    # 类型检测
    # =========================================================================
    
    def _detect_type_and_version(self, mmap_obj: mmap.mmap) -> None:
        """
        检测网格类型和版本
        
        通过分析文件头部数据判断：
        - 前 4 字节：类型标识（应为 0x00010000）
        - 5-8 字节：版本标识
          - 0x01000000: 静态 Mesh（Prop/Map）
          - 0x02000000: 动态 Mesh（CW）
        
        Args:
            mmap_obj: 内存映射文件对象
        """
        # 读取前 8 字节
        header = mmap_obj[0:8]
        
        if len(header) < 8:
            raise IncompleteDataError("", 8, len(header), "file header")
        
        # 检查类型标识
        if header[0:4] != b"\x00\x01\x00\x00":
            log.warning("文件类型不是 Mesh")
            return
        
        # 动态 Mesh（CW）
        if header[4:8] == b"\x02\x00\x00\x00":
            self._config = get_cw_default_config()
            log.debug("检测到动态 Mesh (CW)")
            return
        
        # 静态 Mesh（Prop/Map）
        if header[4:8] == b"\x01\x00\x00\x00":
            self._detect_static_version(mmap_obj)
            return
        
        log.warning(f"未知的 Mesh 类型: {header.hex()}")
    
    def _detect_static_version(self, mmap_obj: mmap.mmap) -> None:
        """
        检测静态网格版本
        
        通过分析顶点数据块大小判断版本：
        - V1 版本：顶点块大小信息在偏移 0x19
        - V2 版本：顶点块大小信息在偏移 0x1D
        
        Args:
            mmap_obj: 内存映射文件对象
        """
        # 读取头部数据
        offset = FILE_TYPE_8_BYTE + MINPOS_MAXPOS_SIZE
        header = mmap_obj[offset:offset + 0x21]
        
        if len(header) < 0x21:
            return
        
        # 解析头部字段
        obj_count = struct.unpack_from("<I", header, 0x0)[0]
        face_count = struct.unpack_from("<I", header, 0x4)[0]
        vertex_count = struct.unpack_from("<I", header, 0x8)[0]
        
        # V1 版本的顶点数据大小（偏移 0x19）
        vbyte_v1 = struct.unpack_from("<I", header, 0x19)[0]
        # V2 版本的顶点数据大小（偏移 0x1D）
        vbyte_v2 = struct.unpack_from("<I", header, 0x1D)[0]
        
        # 验证数据
        if obj_count <= 0 or face_count <= 0 or vertex_count <= 0:
            return
        
        # 判断版本（通过顶点块大小）
        # 静态网格的顶点块大小固定为 0x34 字节
        
        if vbyte_v1 // vertex_count == VERTEX_BLOCK_SIZE_STATIC:
            # V1 版本
            mesh_type = MeshType.MAP if obj_count > 1 else MeshType.PROP
            self._config = get_config(mesh_type, MeshVersion.V1)
            log.debug(f"检测到 {mesh_type.value} V1")
            
        elif vbyte_v2 // vertex_count == VERTEX_BLOCK_SIZE_STATIC:
            # V2 版本
            mesh_type = MeshType.MAP if obj_count > 1 else MeshType.PROP
            self._config = get_config(mesh_type, MeshVersion.V2)
            log.debug(f"检测到 {mesh_type.value} V2")
    
    # =========================================================================
    # 解析分发
    # =========================================================================
    
    def _parse_static_mesh(self, mmap_obj: mmap.mmap) -> List[Dict[str, Any]]:
        """
        解析静态网格（Prop/Map）
        
        委托给 StaticMeshParser 处理
        
        Args:
            mmap_obj: 内存映射文件对象
        
        Returns:
            网格对象数据列表
        """
        from .static_parser import StaticMeshParser
        
        parser = StaticMeshParser(self)
        return parser.parse(mmap_obj)
    
    def _parse_dynamic_mesh(self, mmap_obj: mmap.mmap) -> List[Dict[str, Any]]:
        """
        解析动态网格（Character/Weapon）
        
        委托给 DynamicMeshParser 处理
        
        Args:
            mmap_obj: 内存映射文件对象
        
        Returns:
            网格对象数据列表
        """
        from .dynamic_parser import DynamicMeshParser
        
        parser = DynamicMeshParser(self)
        results, bbox_list = parser.parse(mmap_obj)
        
        # 更新物体名称
        self.obj_names = parser.obj_names
        self.bbox_list = bbox_list
        
        return results
