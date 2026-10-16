"""
动态网格解析器模块

处理 Character/Weapon 类型的动态网格文件。
这类网格包含骨骼绑定和权重数据，用于动画。

特点：
- 包含骨骼索引和权重数据
- 包含切线和副法线
- 物体名称列表在文件头部
- 顶点数据块大小固定为 0x40 字节
"""

import mmap
import struct
import os
from typing import List, Tuple, Optional, Dict, Any

from ..log import get_module_logger
from .config import (
    MeshType,
    MeshVersion,
    get_config,
    VERTEX_BLOCK_SIZE_CW,
    FACE_BLOCK_SIZE,
    FILE_TYPE_8_BYTE,
)

log = get_module_logger("DYNAMIC_PARSE")


class DynamicMeshParser:
    """
    动态网格解析器
    
    处理 Character/Weapon 类型的网格文件，包含：
    - 物体名称列表
    - 骨骼索引和权重
    - 切线和副法线
    """
    
    def __init__(self, parent_parser):
        self.parent = parent_parser
        self.obj_names: List[str] = []
        self.results: List[Dict[str, Any]] = []
        self.bbox_list: List[Dict[str, Any]] = []
    
    def parse(self, mmap_obj: mmap.mmap) -> List[Dict[str, Any]]:
        """解析动态网格文件"""
        # 读取头部（物体名称）
        self._read_dynamic_header(mmap_obj)
        
        # 检测版本
        self._detect_version(mmap_obj)
        
        # 解析每个物体
        while self.parent._objects_processed < self.parent._object_count:
            obj_data = self._parse_object(mmap_obj)
            
            if obj_data is None:
                break
            
            self.results.append(obj_data)
            self.parent._objects_processed += 1
        
        # 更新父解析器的物体名称
        self.parent.obj_names = self.obj_names
        
        return self.results, self.bbox_list
    
    def _read_dynamic_header(self, mmap_obj: mmap.mmap) -> None:
        """读取动态头部（物体名称列表）"""
        mmap_obj.seek(FILE_TYPE_8_BYTE)
        
        # 读取物体数量
        obj_count = struct.unpack("<I", mmap_obj.read(4))[0]
        
        if obj_count == 0:
            return
        
        # 读取物体名称
        for _ in range(obj_count):
            name_length = struct.unpack("<I", mmap_obj.read(4))[0]
            name = struct.unpack(
                f"<{name_length}s", 
                mmap_obj.read(name_length)
            )[0].decode("utf-8").strip('\x00')
            self.obj_names.append(name)
        
        # 验证结束标记
        end_count = struct.unpack("<I", mmap_obj.read(4))[0]
        
        if obj_count != end_count:
            log.warning("头部物体数量不一致")
        
        # 读取 MinPos/MaxPos 数据
        self._read_bbox_list(mmap_obj, obj_count)
        
        # 更新父解析器
        self.parent._object_count = obj_count
    
    def _read_bbox_list(self, mmap_obj: mmap.mmap, count: int) -> None:
        """读取所有物体的边界框"""
        bbox_data_size = count * 0x18
        bbox_data = mmap_obj.read(bbox_data_size)
        
        for i in range(count):
            offset = i * 0x18
            if offset + 0x18 <= bbox_data_size:
                min_pos = struct.unpack("<fff", bbox_data[offset:offset + 12])
                max_pos = struct.unpack("<fff", bbox_data[offset + 12:offset + 24])
                
                self.bbox_list.append({
                    'name': self.obj_names[i] if i < len(self.obj_names) else f"Object_{i}",
                    'min_position': min_pos,
                    'max_position': max_pos,
                })
        
        # 设置第一个边界框
        if self.bbox_list:
            self.parent.min_position = self.bbox_list[0]['min_position']
            self.parent.max_position = self.bbox_list[0]['max_position']
    
    def _detect_version(self, mmap_obj: mmap.mmap) -> None:
        """检测动态网格版本"""
        pos = mmap_obj.tell()
        header = mmap_obj[pos:pos + 0x21]
        
        if len(header) < 0x21:
            return
        
        obj_count = struct.unpack_from("<I", header, 0x0)[0]
        face_count = struct.unpack_from("<I", header, 0x4)[0]
        vertex_count = struct.unpack_from("<I", header, 0x8)[0]
        
        # V1 顶点数据大小
        vbyte_v1 = struct.unpack_from("<I", header, 0x19)[0]
        # V2 顶点数据大小
        vbyte_v2 = struct.unpack_from("<I", header, 0x1D)[0]
        
        # 计算预期的面数据大小
        expected_face_size = face_count * FACE_BLOCK_SIZE
        
        # 判断版本
        if vbyte_v1 // vertex_count == VERTEX_BLOCK_SIZE_CW:
            # 验证 V1
            face_size_pos = pos + 0x1D + vbyte_v1
            if face_size_pos + 4 <= mmap_obj.size():
                actual_face_size = struct.unpack_from(
                    "<I", mmap_obj, face_size_pos
                )[0]
                if actual_face_size == expected_face_size:
                    self.parent._config = get_config(MeshType.CW, MeshVersion.V1)
                    log.debug("检测到动态网格 V1 (CW)")
                    return
        
        if vbyte_v2 // vertex_count == VERTEX_BLOCK_SIZE_CW:
            # 验证 V2
            face_size_pos = pos + 0x21 + vbyte_v2
            if face_size_pos + 4 <= mmap_obj.size():
                actual_face_size = struct.unpack_from(
                    "<I", mmap_obj, face_size_pos
                )[0]
                if actual_face_size == expected_face_size:
                    self.parent._config = get_config(MeshType.CW, MeshVersion.V2)
                    log.debug("检测到动态网格 V2 (CW)")
                    return
    
    def _parse_object(self, mmap_obj: mmap.mmap) -> Optional[Dict[str, Any]]:
        """解析单个动态物体"""
        # 读取头部
        header = self._read_header(mmap_obj)
        if not header:
            log.debug("读取物体头部失败")
            return None
        
        # 读取顶点数据
        vertex_data = self._read_dynamic_vertices(
            mmap_obj, 
            header["vertex_count"], 
            header["vertex_byte_size"]
        )
        if not vertex_data:
            log.debug("读取顶点数据失败")
            return None
        
        # 读取面数据
        faces = self._read_faces(mmap_obj)
        if not faces:
            log.debug("读取面数据失败")
            return None
        
        # 贴图数据起始位置
        color_start_offset = mmap_obj.tell()
        # 贴图数据结束位置
        color_end_offset = 0
        next_obj_found = False
        
        # 根据物体数量判断是否需要查找下一个物体头部
        if self.parent._object_count > 1:
            if self.parent._objects_processed < self.parent._object_count - 1:
                log.debug("读取下一个动态物体头部位置")
                # 查找下一个物体头部位置
                next_obj_found = self._find_next_head(mmap_obj, vertex_data["block_size"])
                # 贴图数据结束位置（找到头部后文件指针已回退）
                color_end_offset = mmap_obj.tell()
            else:
                log.debug("不需要读取下一个动态物体头部位置")
                color_end_offset = mmap_obj.size()
        elif self.parent._object_count == 1:
            log.debug("不需要读取下一个动态物体头部位置")
            color_end_offset = mmap_obj.size()
        
        if not next_obj_found and self.parent._object_count > 1:
            log.debug("未找到下一个物体头部地址, 处理最后一个网格")
            color_end_offset = mmap_obj.size()
        
        # 读取贴图数据
        colormap = self._read_colormap(mmap_obj, color_start_offset, color_end_offset)
        
        return {
            "mesh_obj_number": header["object_count"],
            "obj_vertex_count": header["vertex_count"],
            "vertex_data": vertex_data["vertices"],
            "faces_data": faces,
            "uvs": vertex_data["uvs"],
            "normals": vertex_data["normals"],
            "tangents": vertex_data.get("tangents", []),
            "binormals": vertex_data.get("binormals", []),
            "bone_indices": vertex_data.get("bone_indices", []),
            "bone_weights": vertex_data.get("bone_weights", []),
            "colormap": colormap,
        }
    
    def _read_header(self, mmap_obj: mmap.mmap) -> Optional[Dict[str, int]]:
        """读取物体头部"""
        config = self.parent._config
        
        if mmap_obj.tell() + config.header_size > mmap_obj.size():
            return None
        
        current_pos = mmap_obj.tell()
        header_data = mmap_obj.read(config.header_size)
        
        header = {
            "object_count": struct.unpack_from("<I", header_data, 0x0)[0],
            "face_count": struct.unpack_from("<I", header_data, 0x4)[0],
            "vertex_count": struct.unpack_from("<I", header_data, 0x8)[0],
            "vertex_byte_size": struct.unpack_from(
                "<I", header_data, config.vertex_bytes_offset
            )[0],
        }
        
        # 读取头部数据后的位置
        readed_current_pos = mmap_obj.tell()
        
        # 获取此物体实际面数据占用字节
        try:
            obj_face_size = struct.unpack_from(
                "<I", mmap_obj, readed_current_pos + header["vertex_byte_size"]
            )[0]
        except Exception:
            return None
        
        # 验证头部数据（与原版逻辑一致）
        if (
            header["face_count"] <= 0
            or header["vertex_count"] <= 0
            or header["vertex_byte_size"] <= 0
            or header["object_count"] > header["vertex_byte_size"]
            or header["face_count"] > header["vertex_count"]
            or header["face_count"] > header["vertex_byte_size"]
            or header["vertex_count"] > header["vertex_byte_size"]
            or obj_face_size / FACE_BLOCK_SIZE != header["face_count"]
        ):
            return None
        
        return header
    
    def _read_dynamic_vertices(
        self, 
        mmap_obj: mmap.mmap, 
        count: int, 
        byte_size: int
    ) -> Optional[Dict[str, Any]]:
        """读取动态顶点数据（包含骨骼索引和权重）"""
        try:
            # 每个顶点数据块的大小
            block_size = byte_size // count
            
            # 读取顶点数据
            vertex_data = mmap_obj.read(byte_size)
            
            # 顶点数据返回值
            res_data = {
                "vertices": [],
                "normals": [],
                "tangents": [],
                "binormals": [],
                "bone_indices": [],
                "bone_weights": [],
                "uvs": [],
                "block_size": block_size,
            }
            
            config = self.parent._config
            
            for i in range(count):
                # 计算当前块的起始位置
                v_offset = block_size * i
                
                # 确保有足够的字节进行解包
                if v_offset + block_size <= byte_size:
                    # 顶点 - 单精度浮点
                    vx, vy, vz = struct.unpack_from("fff", vertex_data, v_offset)
                    res_data["vertices"].append((vx, vy, vz))
                    
                    # 法线 - 半精度浮点
                    nx, ny, nz = struct.unpack_from(
                        "<eee", vertex_data, v_offset + 0x0C
                    )
                    res_data["normals"].append((nx, ny, nz))
                    
                    # 切线 - 半精度浮点
                    tx, ty, tz = struct.unpack_from(
                        "<eee", vertex_data, v_offset + 0x14
                    )
                    res_data["tangents"].append((tx, ty, tz))
                    
                    # 副法线 - 半精度浮点
                    bx, by, bz = struct.unpack_from(
                        "<eee", vertex_data, v_offset + 0x1C
                    )
                    res_data["binormals"].append((bx, by, bz))
                    
                    # 骨骼索引 - 字节x4 (0x24-0x27)
                    b0, b1, b2, b3 = struct.unpack_from(
                        "<BBBB", vertex_data, v_offset + 0x24
                    )
                    res_data["bone_indices"].append((b0, b1, b2, b3))
                    
                    # 骨骼权重 - 单精度浮点x4 (0x28-0x37)
                    w0, w1, w2, w3 = struct.unpack_from(
                        "<ffff", vertex_data, v_offset + 0x28
                    )
                    res_data["bone_weights"].append((w0, w1, w2, w3))
                    
                    # UV - 半精度浮点
                    uv_offset = v_offset + block_size - config.uv_offset
                    u, v = struct.unpack_from("<ee", vertex_data, uv_offset)
                    res_data["uvs"].append((u, 1 - v))
                else:
                    log.debug("顶点数据解析失败: 不足的字节数在偏移量 0x%x", v_offset)
                    break
            
            return res_data
        except Exception as e:
            log.debug("顶点CW数据解析失败: %s", e)
            return None
    
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
            # 逐字节寻找下个物体头部
            while mmap_obj.tell() + config.header_size < file_size:
                # 当前位置
                current_pos = mmap_obj.tell()
                
                # 读取头部数据
                header = self._read_header_for_scan(mmap_obj, block_size)
                
                # 验证头部是否有效
                if header is None:
                    # 无效数据，继续寻找
                    mmap_obj.seek(current_pos + 1)
                    continue
                else:
                    # 回退位置到头部起始
                    mmap_obj.seek(current_pos)
                    log.debug("找到下一个头部: 位置: 0x%x", mmap_obj.tell())
                    return True
            
            log.debug("未能找到下一个物体头部地址")
            return False
        except Exception as e:
            log.error("寻找下一个物体头部失败: %s", e)
            return False
    
    def _read_header_for_scan(
        self, 
        mmap_obj: mmap.mmap, 
        block_size: int
    ) -> Optional[Dict[str, int]]:
        """
        在扫描时读取头部信息（用于查找下一个物体）
        
        注意：此方法会移动文件指针
        验证逻辑与原版 find_next_head 一致
        """
        config = self.parent._config
        file_size = mmap_obj.size()
        
        if mmap_obj.tell() + config.header_size > file_size:
            return None
        
        current_pos = mmap_obj.tell()
        header_data = mmap_obj.read(config.header_size)
        
        header = {
            "object_count": struct.unpack_from("<I", header_data, 0x0)[0],
            "face_count": struct.unpack_from("<I", header_data, 0x4)[0],
            "vertex_count": struct.unpack_from("<I", header_data, 0x8)[0],
            "vertex_byte_size": struct.unpack_from(
                "<I", header_data, config.vertex_bytes_offset
            )[0],
        }
        
        # 基本验证（与原版 read_obj_header 一致）
        if (
            header["face_count"] <= 0
            or header["vertex_count"] <= 0
            or header["vertex_byte_size"] <= 0
            or header["object_count"] > header["vertex_byte_size"]
            or header["face_count"] > header["vertex_count"]
            or header["face_count"] > header["vertex_byte_size"]
            or header["vertex_count"] > header["vertex_byte_size"]
        ):
            return None
        
        # 增强头部校验（与原版 find_next_head 一致）
        # 注意：用 < 不是 <=，用乘法验证块大小
        if not (
            header["vertex_count"] < header["vertex_byte_size"]
            and header["vertex_count"] * block_size == header["vertex_byte_size"]
            and header["vertex_byte_size"] + current_pos < file_size
            and header["object_count"] <= self.parent._object_count
            and header["object_count"] < 128  # 放宽限制，防止读取到无效数据
        ):
            return None
        
        return header
    
    def _read_colormap(
        self, 
        mmap_obj: mmap.mmap, 
        start: int, 
        end: int
    ) -> Dict[str, Any]:
        """读取贴图信息"""
        texture_data = mmap_obj[start:end]
        
        return {
            "colormap": self._find_map(texture_data, "ColorMap"),
            "srmap": self._find_map(texture_data, "SrMap"),
            "drmap": self._find_map(texture_data, "DrMap"),
        }
    
    def _find_map(self, data: bytes, map_type: str) -> Dict[str, str]:
        """查找贴图"""
        variants = [map_type]
        if map_type.endswith("1"):
            variants.append(map_type[:-1])
        elif not map_type.endswith("1"):
            variants.append(map_type + "1")
        
        for variant in variants:
            identifier = variant.encode('utf-8')
            pos = data.find(identifier)
            
            if pos != -1:
                path_length = struct.unpack_from("<B", data, pos + len(identifier))[0]
                path_start = pos + len(identifier) + 4
                path = data[path_start:path_start + path_length]
                
                path_str = path.decode("utf-8", errors="replace")
                name = os.path.splitext(os.path.basename(path_str))[0]
                
                return {"path": path_str, "name": name, "type": variant}
        
        return {"path": "", "name": "", "type": ""}
