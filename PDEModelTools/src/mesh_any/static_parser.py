"""
静态网格解析器模块

处理 Prop 和 Map 类型的静态网格文件。
Prop: 单个物体的道具
Map: 多个物体的地图

特点：
- 无骨骼/权重数据
- 包含 MinPos/MaxPos 边界框
- 顶点数据块大小固定为 0x34 字节
"""

import mmap
import struct
import os
import array
from typing import List, Tuple, Optional, Dict, Any

from ..log import get_module_logger
from .config import (
    MeshType,
    FILE_TYPE_8_BYTE,
    MINPOS_MAXPOS_SIZE,
    VERTEX_BLOCK_SIZE_STATIC,
    FACE_BLOCK_SIZE,
)

log = get_module_logger("STATIC_PARSE")


class StaticMeshParser:
    """
    静态网格解析器
    
    处理 Prop（道具）和 Map（地图）类型的网格文件。
    这类网格不包含骨骼和权重数据。
    """
    
    def __init__(self, parent_parser):
        self.parent = parent_parser
        self.results: List[Dict[str, Any]] = []
    
    def parse(self, mmap_obj: mmap.mmap) -> List[Dict[str, Any]]:
        """解析静态网格文件"""
        # 读取 MinPos/MaxPos
        mmap_obj.seek(FILE_TYPE_8_BYTE)
        self._read_minpos_maxpos(mmap_obj)
        
        # 解析每个物体
        while mmap_obj.tell() < mmap_obj.size():
            obj_data = self._parse_object(mmap_obj)
            
            if obj_data is None:
                break
            
            self.results.append(obj_data)
            self.parent._objects_processed += 1
            
            if self.parent._objects_processed >= self.parent._object_count:
                break
        
        return self.results
    
    def _read_minpos_maxpos(self, mmap_obj: mmap.mmap) -> bool:
        """读取 MinPos/MaxPos 边界框数据"""
        if mmap_obj.size() < MINPOS_MAXPOS_SIZE:
            log.warning("MinPos/MaxPos 数据不足")
            return False
        
        data = mmap_obj.read(MINPOS_MAXPOS_SIZE)
        self.parent.min_position = struct.unpack("<fff", data[0:12])
        self.parent.max_position = struct.unpack("<fff", data[12:24])
        log.debug("MinPos: %s, MaxPos: %s", self.parent.min_position, self.parent.max_position)
        return True
    
    def _parse_object(self, mmap_obj: mmap.mmap) -> Optional[Dict[str, Any]]:
        """解析单个静态物体"""
        # 1. 读取物体头部信息
        header = self._read_header(mmap_obj)
        if not header:
            log.debug("读取物体头部失败")
            return None
        
        # 2. 读取顶点数据
        vertex_data = self._read_vertices(mmap_obj, header["vertex_count"], header["vertex_byte_size"])
        if not vertex_data:
            log.debug("读取顶点数据失败")
            return None
        
        # 3. 读取面数据
        faces = self._read_faces(mmap_obj)
        if not faces:
            log.debug("读取面数据失败")
            return None
        
        # 4. 读取下一个物体头部位置 与 贴图数据起始位置
        color_start_offset = mmap_obj.tell()
        color_end_offset = 0
        next_obj_found = False
        
        # 根据类型判断是否需要查找下一个物体头部
        config = self.parent._config
        if config.mesh_type == MeshType.MAP:
            log.debug("读取地图网格数据")
            next_obj_found = self._find_next_head(mmap_obj, vertex_data["block_size"])
            color_end_offset = mmap_obj.tell()
        elif config.mesh_type == MeshType.PROP:
            log.debug("读取道具网格数据")
            color_end_offset = mmap_obj.size()
        
        if not next_obj_found and config.mesh_type == MeshType.MAP:
            log.debug("未找到下一个物体头部地址, 处理最后一个网格")
        
        # 读取贴图数据
        colormap = self._read_colormap(mmap_obj, color_start_offset, color_end_offset)
        
        return {
            "mesh_obj_number": header["object_count"],
            "obj_vertex_count": header["vertex_count"],
            "vertex_data": vertex_data["vertices"],
            "faces_data": faces,
            "uvs": vertex_data["uvs"],
            "normals": vertex_data["normals"],
            "colormap": colormap,
        }
    
    def _read_header(self, mmap_obj: mmap.mmap) -> Optional[Dict[str, int]]:
        """读取物体头部信息"""
        config = self.parent._config
        
        if mmap_obj.tell() + config.header_size > mmap_obj.size():
            return None
        
        header_data = mmap_obj.read(config.header_size)
        
        header = {
            "object_count": struct.unpack_from("<I", header_data, 0x0)[0],
            "face_count": struct.unpack_from("<I", header_data, 0x4)[0],
            "vertex_count": struct.unpack_from("<I", header_data, 0x8)[0],
            "vertex_byte_size": struct.unpack_from("<I", header_data, config.vertex_bytes_offset)[0],
        }
        
        # 首次更新总物体数
        if self.parent._object_count == 0:
            self.parent._object_count = header["object_count"]
        
        # 验证数据有效性
        if header["face_count"] <= 0 or header["vertex_count"] <= 0:
            log.warning("头部数据无效")
            return None
        
        # 验证顶点数据块大小
        block_size = header["vertex_byte_size"] // header["vertex_count"]
        if block_size != VERTEX_BLOCK_SIZE_STATIC:
            log.warning("顶点块大小不匹配: %d != %d", block_size, VERTEX_BLOCK_SIZE_STATIC)
        
        # 验证面数据大小
        current_pos = mmap_obj.tell()
        if current_pos + header["vertex_byte_size"] + 4 <= mmap_obj.size():
            face_size = struct.unpack_from("<I", mmap_obj, current_pos + header["vertex_byte_size"])[0]
            if face_size != header["face_count"] * FACE_BLOCK_SIZE:
                log.warning("面数据大小不匹配")
                return None
        
        return header
    
    def _read_vertices(self, mmap_obj: mmap.mmap, count: int, byte_size: int) -> Optional[Dict[str, Any]]:
        """读取顶点数据（使用 array.array 批量解析）"""
        raw_data = mmap_obj.read(byte_size)
        block_size = byte_size // count
        config = self.parent._config
        
        # 使用 array 批量解析 float32
        float_array = array.array('f')
        float_array.frombytes(raw_data)
        floats_per_block = block_size // 4
        
        vertices = []
        normals = []
        uvs = []
        
        for i in range(count):
            base = i * floats_per_block
            
            # 顶点位置 (float32 x 3)
            vertices.append((float_array[base], float_array[base + 1], float_array[base + 2]))
            
            # 法线 (半精度浮点 x 3)
            normal_offset = i * block_size + 0x0C
            normals.append(struct.unpack_from("<eee", raw_data, normal_offset))
            
            # UV (半精度浮点 x 2)
            uv_offset = i * block_size + block_size - config.uv_offset
            u, v = struct.unpack_from("<ee", raw_data, uv_offset)
            uvs.append((u, 1 - v))  # 翻转 V 坐标
        
        return {"vertices": vertices, "normals": normals, "uvs": uvs, "block_size": block_size}
    
    def _read_faces(self, mmap_obj: mmap.mmap) -> List[Tuple[int, int, int]]:
        """读取面数据"""
        face_byte_size = struct.unpack("<I", mmap_obj.read(4))[0]
        face_data = mmap_obj.read(face_byte_size)
        
        faces = []
        for i in range(0, face_byte_size, FACE_BLOCK_SIZE):
            faces.append(struct.unpack_from("III", face_data, i))
        
        return faces
    
    def _find_next_head(self, mmap_obj: mmap.mmap, block_size: int) -> bool:
        """
        逐字节寻找下个物体头部
        
        关键：找到后会将文件指针回退到头部起始位置，
        这样下一次循环可以直接从头开始读取新物体。
        """
        config = self.parent._config
        file_size = mmap_obj.size()
        
        log.debug(
            "查找下一个头部: 当前位置: 0x%x, 块大小: 0x%x, 总物体数: %d",
            mmap_obj.tell(), block_size, self.parent._object_count
        )
        
        try:
            while mmap_obj.tell() + config.header_size < file_size:
                current_pos = mmap_obj.tell()
                header = self._read_header_for_scan(mmap_obj)
                
                if header is None:
                    mmap_obj.seek(current_pos + 1)
                    continue
                else:
                    # 增强头部校验
                    # 注意: object_count 字段含义因位置而异：
                    # - 第1个物体: 存放物体总数（可能 >= 8）
                    # - 后续物体: 存放子网格组号（通常 0-7）
                    # 但某些工具导出的文件可能所有物体都用同一个值，
                    # 所以不严格限制 < 8，改为合理的范围检查
                    if (
                        header["vertex_count"] < header["vertex_byte_size"]
                        and header["vertex_count"] * block_size == header["vertex_byte_size"]
                        and header["vertex_byte_size"] + current_pos < file_size
                        and header["object_count"] <= self.parent._object_count
                    ):
                        # 回退位置到头部起始
                        mmap_obj.seek(current_pos)
                        log.debug("找到下一个头部: 位置: 0x%x", mmap_obj.tell())
                        return True
                    else:
                        mmap_obj.seek(current_pos + 1)
                        continue
            
            log.debug("未能找到下一个物体头部地址")
            return False
        except Exception as e:
            log.error("寻找下一个物体头部失败: %s", e)
            return False
    
    def _read_header_for_scan(self, mmap_obj: mmap.mmap) -> Optional[Dict[str, int]]:
        """在扫描时读取头部信息（用于查找下一个物体）"""
        config = self.parent._config
        
        if mmap_obj.tell() + config.header_size > mmap_obj.size():
            return None
        
        header_data = mmap_obj.read(config.header_size)
        
        header = {
            "object_count": struct.unpack_from("<I", header_data, 0x0)[0],
            "face_count": struct.unpack_from("<I", header_data, 0x4)[0],
            "vertex_count": struct.unpack_from("<I", header_data, 0x8)[0],
            "vertex_byte_size": struct.unpack_from("<I", header_data, config.vertex_bytes_offset)[0],
        }
        
        # 验证数据有效性
        if header["face_count"] <= 0 or header["vertex_count"] <= 0:
            return None
        
        # 验证顶点数据块大小
        block_size = header["vertex_byte_size"] // header["vertex_count"]
        if block_size != VERTEX_BLOCK_SIZE_STATIC:
            return None
        
        # 验证面数据大小
        current_pos = mmap_obj.tell()
        if current_pos + header["vertex_byte_size"] + 4 <= mmap_obj.size():
            face_size = struct.unpack_from("<I", mmap_obj, current_pos + header["vertex_byte_size"])[0]
            if face_size != header["face_count"] * FACE_BLOCK_SIZE:
                return None
        
        return header
    
    def _read_colormap(self, mmap_obj: mmap.mmap, start: int, end: int) -> Dict[str, Any]:
        """读取贴图信息"""
        texture_data = mmap_obj[start:end]
        
        return {
            "colormap": self._find_texture_map(texture_data, "ColorMap"),
            "srmap": self._find_texture_map(texture_data, "SrMap"),
            "drmap": self._find_texture_map(texture_data, "DrMap"),
        }
    
    def _find_texture_map(self, data: bytes, map_type: str) -> Dict[str, str]:
        """在数据中查找贴图
        
        支持两种贴图数据格式：
        1. 原版格式（带标识符长度前缀）：
           [ident_len(uint32)] [identifier] [path_len(uint32)] [path]
           例: 08 00 00 00 ColorMap 23 00 00 00 /mesh/...
        
        2. 旧导出格式（无前缀）：
           [identifier] [path_len(uint8)+3字节padding] [path]
           例: ColorMap1 1C 00 00 00 /materials/...
        
        通过检查 identifier 前面4字节是否等于 identifier 长度来区分格式。
        """
        variants = [map_type]
        if map_type.endswith("1"):
            variants.append(map_type[:-1])
        elif not map_type.endswith("1"):
            variants.append(map_type + "1")
        
        for variant in variants:
            identifier = variant.encode('utf-8')
            pos = data.find(identifier)
            
            if pos != -1:
                # 边界检查：identifier 后面至少需要 4 字节存放 path_len
                if pos + len(identifier) + 4 > len(data):
                    log.debug("贴图数据不足，无法读取路径长度")
                    continue
                
                # 检查是否为原版格式（identifier 前有4字节长度前缀）
                is_prefixed = (
                    pos >= 4
                    and struct.unpack_from("<I", data, pos - 4)[0] == len(identifier)
                )
                
                if is_prefixed:
                    # 原版格式：identifier 后直接是 path_len (uint32)
                    path_length = struct.unpack_from("<I", data, pos + len(identifier))[0]
                    path_start = pos + len(identifier) + 4
                else:
                    # 旧导出格式：identifier 后是 path_len (uint8) + 3字节padding
                    path_length = struct.unpack_from("<B", data, pos + len(identifier))[0]
                    path_start = pos + len(identifier) + 4
                
                if path_length > 0 and path_start + path_length <= len(data):
                    path = data[path_start:path_start + path_length]
                    path_str = path.decode("utf-8", errors="replace")
                    name = os.path.splitext(os.path.basename(path_str))[0]
                    
                    log.debug("找到 %s: %s", variant, path_str)
                    return {"path": path_str, "name": name, "type": variant}
        
        return {"path": "", "name": "", "type": ""}
