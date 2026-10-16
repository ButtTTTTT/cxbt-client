"""
静态网格导出器模块

将 Blender 场景中的网格对象导出为 PDE 引擎的 .mesh 文件。
支持 Prop（单物体）和 Map（多物体）两种类型，V1 和 V2 两种版本。

二进制格式布局（静态网格）：
  [文件头 8字节]
    0x00-0x03: 类型标识 b"\x00\x01\x00\x00" (小端 uint32 = 0x00000100)
    0x04-0x07: 版本标识 b"\x01\x00\x00\x00" (小端 uint32 = 0x00000001, 静态=1)

  [全局边界框 24字节]
    0x08: MinPos (float32 × 3)
    0x14: MaxPos (float32 × 3)

  [每个物体]
    头部 (V1: 0x1D字节 / V2: 0x21字节)
    顶点数据 (vertex_count × 0x34 字节)
    面数据 (4 + face_count × 0x0C 字节)
    贴图数据 (ColorMap / SrMap / DrMap)

顶点块布局 (0x34 = 52 字节/顶点)：
  0x00-0x0B: position  (float32 × 3, 12字节)
  0x0C-0x11: normal    (float16 × 3, 6字节)
  0x12-0x13: padding   (2字节, 全零)
  0x14-0x19: tangent   (float16 × 3, 6字节)
  0x1A-0x1B: padding   (2字节, 全零)
  0x1C-0x21: binormal  (float16 × 3, 6字节)
  0x22-0x23: padding   (2字节, 全零)
  0x24-0x27: uv        (float16 × 2, 4字节)
  0x28-0x33: reserved  (12字节, 全零)

  注: 与 CW 动态网格的布局结构一致，区别仅在于静态网格无 bone_indices/bone_weights
"""

import struct
import os
import math
from typing import List, Tuple, Optional, Dict, Any
from io import BytesIO

import bpy

from ..log import get_module_logger
from ..ui import get_addon_preferences
from ..mesh_any.config import (
    MeshType,
    MeshVersion,
    get_config,
    MESH_TYPE_STATIC,
    VERTEX_BLOCK_SIZE_STATIC,
    FACE_BLOCK_SIZE,
)

log = get_module_logger("EXPORT")


# =============================================================================
# 坐标转换 (Blender Space Y-up -> Game Space Z-up)
# =============================================================================

def transform_coord_to_game(x: float, y: float, z: float) -> Tuple[float, float, float]:
    """
    Blender Space -> Game Space

    Blender (Y-up): (x, y, z) -> Game (Z-up): (x, z, -y)
    即 transform_coord 的逆变换: transform_coord(x, y, z) = (x, -z, y)
    逆: (x, y, z) = (gx, -gz, gy) => gx = x, gy = z, gz = -y
    """
    return (x, z, -y)


# =============================================================================
# float16 (半精度) 辅助函数
# =============================================================================

def pack_half3(x: float, y: float, z: float) -> bytes:
    """打包 3 个 float16 值"""
    return struct.pack("<eee", x, y, z)


def pack_half2(u: float, v: float) -> bytes:
    """打包 2 个 float16 值"""
    return struct.pack("<ee", u, v)


def pack_float3(x: float, y: float, z: float) -> bytes:
    """打包 3 个 float32 值"""
    return struct.pack("<fff", x, y, z)


# =============================================================================
# 数据提取：从 Blender Mesh 提取顶点/面/UV/法线/切线
# =============================================================================

def extract_mesh_data(
    obj: bpy.types.Object,
    apply_modifiers: bool = True,
    apply_transforms: bool = True,
) -> Optional[Dict[str, Any]]:
    """
    从 Blender 网格对象提取完整几何数据

    Args:
        obj: Blender 网格对象
        apply_modifiers: 是否应用修改器
        apply_transforms: 是否应用世界变换（位置/旋转/缩放）

    Returns:
        包含顶点、面、UV、法线、切线等数据的字典
    """
    import bmesh

    if not obj or obj.type != 'MESH':
        log.warning(f"对象不是网格类型: {obj.name if obj else 'None'}")
        return None

    # 获取评估后的网格（应用修改器）
    if apply_modifiers:
        depsgraph = bpy.context.evaluated_depsgraph_get()
        obj_eval = obj.evaluated_get(depsgraph)
        mesh = obj_eval.to_mesh()
    else:
        obj_eval = obj
        mesh = obj.to_mesh()

    if not mesh or len(mesh.vertices) == 0:
        log.warning(f"网格数据为空: {obj.name}")
        if mesh:
            obj_eval.to_mesh_clear()
        return None

    # -------------------------------------------------------------------------
    # 使用 bmesh 处理：应用世界变换 + 三角化
    # -------------------------------------------------------------------------
    bm = bmesh.new()
    bm.from_mesh(mesh)

    # 应用世界变换（将局部坐标转换为世界坐标）
    if apply_transforms:
        bm.transform(obj.matrix_world)
        # 变换后需要重新计算法线
        bm.normal_update()

    # 三角化（游戏引擎使用三角形）
    bmesh.ops.triangulate(bm, faces=bm.faces[:])

    # 写回 mesh 并更新
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    vertex_count = len(mesh.vertices)
    face_count = len(mesh.polygons)

    if face_count == 0:
        log.warning(f"网格没有面: {obj.name}")
        obj_eval.to_mesh_clear()
        return None

    # 确保有 UV 图层
    uv_layer = None
    if mesh.uv_layers:
        uv_layer = mesh.uv_layers.active

    # -------------------------------------------------------------------------
    # 提取顶点位置（转换为 Game Space）
    # -------------------------------------------------------------------------
    positions: List[Tuple[float, float, float]] = []
    for v in mesh.vertices:
        gx, gy, gz = transform_coord_to_game(v.co.x, v.co.y, v.co.z)
        positions.append((gx, gy, gz))

    # -------------------------------------------------------------------------
    # 提取法线（转换为 Game Space，顶点级别）
    # 游戏格式是 vertex-indexed，法线使用顶点法线（非 split normal）
    # -------------------------------------------------------------------------
    normals: List[Tuple[float, float, float]] = []
    for v in mesh.vertices:
        nx, ny, nz = transform_coord_to_game(v.normal.x, v.normal.y, v.normal.z)
        # 归一化（变换后可能不归一）
        length = math.sqrt(nx * nx + ny * ny + nz * nz)
        if length > 0.0001:
            nx, ny, nz = nx / length, ny / length, nz / length
        normals.append((nx, ny, nz))

    # -------------------------------------------------------------------------
    # UV（顶点级别）
    # 由于游戏格式是 vertex-indexed，取每个顶点第一个 loop 的 UV
    # -------------------------------------------------------------------------
    uvs: List[Tuple[float, float]] = []
    if uv_layer:
        # 构建 顶点索引 -> UV 的映射（取首次出现）
        vertex_uv: Dict[int, Tuple[float, float]] = {}
        for loop in mesh.loops:
            vi = loop.vertex_index
            if vi not in vertex_uv:
                uv_data = uv_layer.data[loop.index].uv
                # 翻转 V 坐标（导入时做了 1-v，导出时做 v→1-v）
                vertex_uv[vi] = (uv_data[0], 1.0 - uv_data[1])

        for i in range(vertex_count):
            uvs.append(vertex_uv.get(i, (0.0, 0.0)))
    else:
        uvs = [(0.0, 0.0)] * vertex_count

    # -------------------------------------------------------------------------
    # 提取面索引
    # -------------------------------------------------------------------------
    faces: List[Tuple[int, int, int]] = []
    for poly in mesh.polygons:
        if len(poly.vertices) == 3:
            faces.append((poly.vertices[0], poly.vertices[1], poly.vertices[2]))
        else:
            # 不应该出现（已三角化），安全处理
            log.warning(f"发现非三角形面，跳过: {poly.index}")

    # -------------------------------------------------------------------------
    # 提取切线 / 副法线
    # -------------------------------------------------------------------------
    tangents: List[Tuple[float, float, float]] = []
    binormals: List[Tuple[float, float, float]] = []

    try:
        if uv_layer:
            # calc_tangents 需要 split normals 先计算好
            mesh.calc_normals_split()
            mesh.calc_tangents(uvmap=uv_layer.name)

            # 按顶点索引收集切线/副法线（取首次出现）
            vertex_tangent: Dict[int, Tuple[float, float, float]] = {}
            vertex_binormal: Dict[int, Tuple[float, float, float]] = {}

            for loop in mesh.loops:
                vi = loop.vertex_index
                if vi not in vertex_tangent:
                    t = loop.tangent
                    tx, ty, tz = transform_coord_to_game(t.x, t.y, t.z)
                    length = math.sqrt(tx * tx + ty * ty + tz * tz)
                    if length > 0.0001:
                        tx, ty, tz = tx / length, ty / length, tz / length
                    vertex_tangent[vi] = (tx, ty, tz)

                    b = loop.bitangent
                    bx, by, bz = transform_coord_to_game(b.x, b.y, b.z)
                    length = math.sqrt(bx * bx + by * by + bz * bz)
                    if length > 0.0001:
                        bx, by, bz = bx / length, by / length, bz / length
                    vertex_binormal[vi] = (bx, by, bz)

            for i in range(vertex_count):
                tangents.append(vertex_tangent.get(i, (1.0, 0.0, 0.0)))
                binormals.append(vertex_binormal.get(i, (0.0, 1.0, 0.0)))
        else:
            tangents = [(1.0, 0.0, 0.0)] * vertex_count
            binormals = [(0.0, 1.0, 0.0)] * vertex_count
    except Exception as e:
        log.debug(f"计算切线失败: {e}, 使用默认值")
        tangents = [(1.0, 0.0, 0.0)] * vertex_count
        binormals = [(0.0, 1.0, 0.0)] * vertex_count

    # -------------------------------------------------------------------------
    # 提取贴图路径（从材质贴图节点）
    # -------------------------------------------------------------------------
    texture_paths = _extract_texture_paths(obj)

    # -------------------------------------------------------------------------
    # 计算边界框（Game Space）
    # -------------------------------------------------------------------------
    min_pos = (
        min(p[0] for p in positions),
        min(p[1] for p in positions),
        min(p[2] for p in positions),
    )
    max_pos = (
        max(p[0] for p in positions),
        max(p[1] for p in positions),
        max(p[2] for p in positions),
    )

    # 清理临时网格
    obj_eval.to_mesh_clear()

    result = {
        "name": obj.name,
        "positions": positions,
        "normals": normals,
        "tangents": tangents,
        "binormals": binormals,
        "uvs": uvs,
        "faces": faces,
        "min_pos": min_pos,
        "max_pos": max_pos,
        "vertex_count": vertex_count,
        "face_count": len(faces),
        "texture_paths": texture_paths,
    }

    log.debug(
        f"提取网格数据: {obj.name}, {vertex_count} 顶点, {len(faces)} 面"
    )

    return result


# =============================================================================
# 贴图路径提取
# =============================================================================

def _extract_texture_paths(obj: bpy.types.Object) -> Dict[str, str]:
    """
    从 Blender 对象的材质贴图节点中提取贴图路径

    将绝对路径转换为相对于游戏资源根目录的路径（使用 / 分隔符）。
    例如: D:\Games\...\mesh\scene\level1\ets_snow01_d.dds → /mesh/scene/level1/ets_snow01_d.dds

    Returns:
        {"color": "/mesh/.../xxx.dds", "sr": "/mesh/.../xxx.dds", "dr": "/mesh/.../xxx.dds"}
    """
    result = {"color": "", "sr": "", "dr": ""}

    if not obj or not obj.data or not obj.data.materials:
        return result

    material = obj.data.materials[0]
    if not material or not material.use_nodes:
        return result

    nodes = material.node_tree.nodes

    # 搜索贴图节点
    for node in nodes:
        if node.type != 'TEX_IMAGE' or not node.image:
            continue

        filepath = bpy.path.abspath(node.image.filepath)
        if not filepath:
            # image 可能是内置的，没有文件路径
            continue

        # 转换为游戏相对路径
        relative_path = _to_game_relative_path(filepath)

        # 根据节点名称判断贴图类型
        node_name = node.name.lower()
        if node_name in ("colormap", "color") or "color" in node_name:
            result["color"] = relative_path
        elif node_name in ("specularmap", "specular") or "spec" in node_name or "sr" in node_name:
            result["sr"] = relative_path
        elif node_name in ("roughnessmap", "roughness") or "rough" in node_name or "dr" in node_name:
            result["dr"] = relative_path
        else:
            # 第一个未知贴图节点默认为 color
            if not result["color"]:
                result["color"] = relative_path

    return result


def _to_game_relative_path(abs_filepath: str) -> str:
    """
    将绝对文件路径转换为游戏相对路径

    使用插件偏好设置中的 resource_dir 作为基准。
    例如: D:\Games\...\mesh\scene\level1\ets_snow01_d.dds → /mesh/scene/level1/ets_snow01_d.dds
    """
    if not abs_filepath:
        return ""

    # 标准化路径
    abs_filepath = os.path.normpath(abs_filepath)

    # 获取资源根目录
    prefs = get_addon_preferences(bpy.context)
    resource_dir = ""
    if prefs and hasattr(prefs, 'dir_path'):
        resource_dir = os.path.normpath(prefs.dir_path) if prefs.dir_path else ""

    # 计算相对路径
    if resource_dir and abs_filepath.startswith(resource_dir):
        rel = os.path.relpath(abs_filepath, resource_dir)
    else:
        # 无法计算相对路径，只保留文件名
        rel = os.path.basename(abs_filepath)
        log.debug(f"无法计算相对路径，仅使用文件名: {rel}")

    # 转为游戏路径格式（使用 / 分隔符，前缀 /）
    game_path = "/" + rel.replace(os.sep, "/")
    return game_path


# =============================================================================
# 二进制写入器
# =============================================================================

class MeshBinaryWriter:
    """
    PDE .mesh 文件二进制写入器

    按照静态网格的二进制格式写入数据。
    """

    def __init__(self, mesh_type: MeshType, version: MeshVersion):
        """
        Args:
            mesh_type: 网格类型 (Prop / Map)
            version: 版本 (V1 / V2)
        """
        self.mesh_type = mesh_type
        self.version = version
        self.config = get_config(mesh_type, version)

        if not self.config.is_valid() or self.config.is_cw_type():
            raise ValueError(f"不支持的导出类型: {mesh_type.value} {version.value}")

        self.buffer = BytesIO()

    def write_file(self, mesh_data_list: List[Dict[str, Any]]) -> bytes:
        """
        写入完整的 .mesh 文件

        Args:
            mesh_data_list: 网格数据列表（每个元素来自 extract_mesh_data）

        Returns:
            完整的 .mesh 文件字节数据
        """
        self.buffer = BytesIO()

        if not mesh_data_list:
            raise ValueError("没有可导出的网格数据")

        # 1. 计算全局边界框
        global_min, global_max = self._compute_global_bbox(mesh_data_list)

        # 2. 写入文件头
        self._write_file_header()

        # 3. 写入全局边界框
        self._write_bbox(global_min, global_max)

        # 4. 写入每个物体
        object_count = len(mesh_data_list)
        for i, mesh_data in enumerate(mesh_data_list):
            self._write_object(mesh_data, i + 1, object_count, is_last=(i == object_count - 1))

        result = self.buffer.getvalue()
        log.info(
            f"导出完成: {self.mesh_type.value} {self.version.value}, "
            f"{object_count} 个物体, {len(result)} 字节"
        )
        return result

    # =========================================================================
    # 文件头
    # =========================================================================

    def _write_file_header(self) -> None:
        """写入文件头（8 字节）

        原版字节: 00 01 00 00 01 00 00 00
        小端解读: uint32(0x00000100) + uint32(0x00000001)
        直接使用 MESH_TYPE_STATIC 常量写入原始字节，避免字节序混淆
        """
        self.buffer.write(MESH_TYPE_STATIC)

    def _write_bbox(
        self,
        min_pos: Tuple[float, float, float],
        max_pos: Tuple[float, float, float],
    ) -> None:
        """写入全局边界框（24 字节）"""
        self.buffer.write(struct.pack("<fff", *min_pos))
        self.buffer.write(struct.pack("<fff", *max_pos))

    # =========================================================================
    # 物体数据
    # =========================================================================

    def _write_object(
        self,
        mesh_data: Dict[str, Any],
        object_index: int,
        total_objects: int,
        is_last: bool = False,
    ) -> None:
        """
        写入单个物体

        Args:
            mesh_data: 网格数据
            object_index: 当前物体的序号 (1-based)
            total_objects: 物体总数
            is_last: 是否为最后一个物体
        """
        vertex_count = mesh_data["vertex_count"]
        face_count = mesh_data["face_count"]
        vertex_byte_size = vertex_count * VERTEX_BLOCK_SIZE_STATIC

        # 1. 写入物体头部
        # 注意: 第一个物体的 object_count 字段存放的是物体总数，
        # 后续物体的 object_count 字段是子网格组号 (通常为 1)
        # 原版文件中该字段的值分布为: 0, 1, 2, 4 等，均 < 8
        # 解析器 _find_next_head 验证条件要求 object_count < 8
        if object_index == 1:
            obj_count_field = total_objects
        else:
            obj_count_field = 1
        self._write_object_header(obj_count_field, face_count, vertex_count, vertex_byte_size)

        # 2. 写入顶点数据
        self._write_vertex_data(mesh_data)

        # 3. 写入面数据
        self._write_face_data(mesh_data["faces"])

        # 4. 写入贴图数据
        self._write_texture_data(mesh_data)

    def _write_object_header(
        self,
        object_count: int,
        face_count: int,
        vertex_count: int,
        vertex_byte_size: int,
    ) -> None:
        """
        写入物体头部

        根据原版文件逆向的 V2 头部布局 (0x21 = 33 字节)：
          0x00: object_count      (uint32)
          0x04: face_count        (uint32)
          0x08: vertex_count      (uint32)
          0x0C: 0x00000000        (uint32, 原版为 0)
          0x10: 0x00000000        (uint32, 原版为 0)
          0x14: 0x00000000        (uint32, 原版为 0)
          0x18: 0x01000000        (uint32, 原版为 1)
          0x1C: 0x00              (byte, 原版为 0)
          0x1D: vertex_byte_size  (uint32) ← vertex_bytes_offset for V2

        V1 头部布局 (0x1D = 29 字节)：
          0x00-0x17: 同 V2
          0x18: 0x01              (byte, 原版为 1)
          0x19: vertex_byte_size  (uint32) ← vertex_bytes_offset for V1
        """
        config = self.config
        header_size = config.header_size
        vbo = config.vertex_bytes_offset

        # 创建头部缓冲区（先用零填充）
        header = bytearray(header_size)

        # 写入已知字段
        struct.pack_into("<I", header, 0x00, object_count)
        struct.pack_into("<I", header, 0x04, face_count)
        struct.pack_into("<I", header, 0x08, vertex_count)

        # +0x18: 原版为 1（根据实际文件确认）
        # 对于 V1 (header_size=0x1D), 0x18 是 1 字节
        # 对于 V2 (header_size=0x21), 0x18 是 uint32 的低字节
        header[0x18] = 0x01

        # 在 vertex_bytes_offset 位置写入顶点数据总字节数
        struct.pack_into("<I", header, vbo, vertex_byte_size)

        self.buffer.write(bytes(header))

        log.debug(
            f"写入物体头部: objects={object_count}, faces={face_count}, "
            f"vertices={vertex_count}, vertex_bytes={vertex_byte_size}"
        )

    def _write_vertex_data(self, mesh_data: Dict[str, Any]) -> None:
        """
        写入顶点数据

        每顶点 0x34 = 52 字节：
          0x00-0x0B: position  (float32 × 3, 12字节)
          0x0C-0x11: normal    (float16 × 3, 6字节)
          0x12-0x13: padding   (2字节, 全零)
          0x14-0x19: tangent   (float16 × 3, 6字节)
          0x1A-0x1B: padding   (2字节, 全零)
          0x1C-0x21: binormal  (float16 × 3, 6字节)
          0x22-0x23: padding   (2字节, 全零)
          0x24-0x27: uv        (float16 × 2, 4字节)
          0x28-0x33: reserved  (12字节, 全零)
        """
        positions = mesh_data["positions"]
        normals = mesh_data["normals"]
        tangents = mesh_data["tangents"]
        binormals = mesh_data["binormals"]
        uvs = mesh_data["uvs"]
        vertex_count = mesh_data["vertex_count"]

        padding_2 = b'\x00' * 2
        reserved_12 = b'\x00' * 12

        for i in range(vertex_count):
            # Position: float32 × 3 (0x00-0x0B)
            self.buffer.write(pack_float3(*positions[i]))

            # Normal: float16 × 3 (0x0C-0x11)
            self.buffer.write(pack_half3(*normals[i]))

            # Padding: 2字节 (0x12-0x13)
            self.buffer.write(padding_2)

            # Tangent: float16 × 3 (0x14-0x19)
            self.buffer.write(pack_half3(*tangents[i]))

            # Padding: 2字节 (0x1A-0x1B)
            self.buffer.write(padding_2)

            # Binormal: float16 × 3 (0x1C-0x21)
            self.buffer.write(pack_half3(*binormals[i]))

            # Padding: 2字节 (0x22-0x23)
            self.buffer.write(padding_2)

            # UV: float16 × 2 (0x24-0x27)
            self.buffer.write(pack_half2(*uvs[i]))

            # Reserved: 12字节 (0x28-0x33)
            self.buffer.write(reserved_12)

        total_bytes = vertex_count * VERTEX_BLOCK_SIZE_STATIC
        log.debug(f"写入顶点数据: {vertex_count} 个顶点, {total_bytes} 字节")

    def _write_face_data(self, faces: List[Tuple[int, int, int]]) -> None:
        """
        写入面数据

        格式：
          face_byte_size (uint32) = face_count × 0x0C
          face_indices   (uint32 × 3 × face_count)
        """
        face_count = len(faces)
        face_byte_size = face_count * FACE_BLOCK_SIZE

        # 面数据字节大小
        self.buffer.write(struct.pack("<I", face_byte_size))

        # 面索引
        for face in faces:
            self.buffer.write(struct.pack("<III", *face))

        log.debug(f"写入面数据: {face_count} 个面, {face_byte_size} 字节")

    def _write_texture_data(self, mesh_data: Dict[str, Any]) -> None:
        """
        写入贴图数据

        原版格式：每个贴图条目由以下组成：
          标识符长度 (uint32)
          标识字符串 (如 "ColorMap", "LightMap", "DecalMap", "MaskMap")
          路径长度 (uint32)
          路径字符串 (UTF-8 编码)

        贴图路径来源优先级:
          1. 从 Blender 材质贴图节点中提取的实际路径
          2. 从 mesh_data["colormap"] 中获取的导入时路径
          3. 使用对象名构造的默认路径
        """
        obj_name = mesh_data.get("name", "unknown")
        texture_paths = mesh_data.get("texture_paths", {})

        # ColorMap
        color_path = texture_paths.get("color", "")
        if not color_path:
            color_path = self._find_texture_path(mesh_data, "colormap")
        if not color_path:
            color_path = f"/materials/{obj_name}.dds"
        self._write_texture_entry("ColorMap", color_path)

        # SrMap
        sr_path = texture_paths.get("sr", "")
        if not sr_path:
            sr_path = self._find_texture_path(mesh_data, "srmap")
        if sr_path:
            self._write_texture_entry("SrMap", sr_path)

        # DrMap
        dr_path = texture_paths.get("dr", "")
        if not dr_path:
            dr_path = self._find_texture_path(mesh_data, "drmap")
        if dr_path:
            self._write_texture_entry("DrMap", dr_path)

    def _find_texture_path(self, mesh_data: Dict[str, Any], map_type: str) -> str:
        """
        从网格数据的 colormap 信息中查找贴图路径（导入时保留的路径）

        Args:
            mesh_data: 网格数据
            map_type: 贴图类型 ("colormap", "srmap", "drmap")

        Returns:
            贴图路径字符串，找不到返回空字符串
        """
        colormap = mesh_data.get("colormap", {})
        if isinstance(colormap, dict):
            map_info = colormap.get(map_type, {})
            if isinstance(map_info, dict):
                return map_info.get("path", "")
        return ""

    def _write_texture_entry(self, identifier: str, path: str) -> None:
        """
        写入单个贴图条目

        原版格式：
          标识符长度 (uint32, 4字节)
          标识字符串 (如 "ColorMap", 8字节)
          路径长度 (uint32, 4字节)
          路径字符串 (UTF-8 编码, path_length 字节)

        示例（原版 ColorMap）：
          08 00 00 00  43 6F 6C 6F 72 4D 61 70  23 00 00 00  2F 6D 65 73 68 ...
          ident_len=8  C  o  l  o  r  M  a  p   path_len=35  /  m  e  s  h ...
        """
        # 标识符长度 (uint32)
        ident_bytes = identifier.encode('utf-8')
        self.buffer.write(struct.pack("<I", len(ident_bytes)))

        # 标识字符串
        self.buffer.write(ident_bytes)

        # 路径长度 (uint32)
        path_bytes = path.encode('utf-8')
        self.buffer.write(struct.pack("<I", len(path_bytes)))

        # 路径字符串
        self.buffer.write(path_bytes)

    # =========================================================================
    # 辅助函数
    # =========================================================================

    def _compute_global_bbox(
        self,
        mesh_data_list: List[Dict[str, Any]],
    ) -> Tuple[Tuple[float, float, float], Tuple[float, float, float]]:
        """计算所有物体的全局边界框"""
        all_min_x = []
        all_min_y = []
        all_min_z = []
        all_max_x = []
        all_max_y = []
        all_max_z = []

        for md in mesh_data_list:
            mn = md["min_pos"]
            mx = md["max_pos"]
            all_min_x.append(mn[0])
            all_min_y.append(mn[1])
            all_min_z.append(mn[2])
            all_max_x.append(mx[0])
            all_max_y.append(mx[1])
            all_max_z.append(mx[2])

        return (
            (min(all_min_x), min(all_min_y), min(all_min_z)),
            (max(all_max_x), max(all_max_y), max(all_max_z)),
        )


# =============================================================================
# 导出主函数
# =============================================================================

def export_static_mesh(
    filepath: str,
    objects: List[bpy.types.Object],
    mesh_type: MeshType = MeshType.PROP,
    version: MeshVersion = MeshVersion.V1,
    apply_modifiers: bool = True,
    apply_transforms: bool = True,
    selected_only: bool = False,
) -> Tuple[int, int]:
    """
    导出静态网格文件

    Args:
        filepath: 输出文件路径
        objects: 要导出的 Blender 对象列表
        mesh_type: 网格类型 (Prop / Map)
        version: 版本 (V1 / V2)
        apply_modifiers: 是否应用修改器
        apply_transforms: 是否应用世界变换
        selected_only: 是否仅导出选中的物体

    Returns:
        (成功数, 失败数) 元组
    """
    # 过滤出网格对象
    mesh_objects = [obj for obj in objects if obj.type == 'MESH']

    if not mesh_objects:
        log.warning("没有可导出的网格对象")
        return 0, 0

    # 自动判断类型：多个物体 → Map，单个物体 → Prop
    if len(mesh_objects) > 1 and mesh_type == MeshType.PROP:
        log.info(f"检测到 {len(mesh_objects)} 个物体，自动切换为 Map 类型")
        mesh_type = MeshType.MAP

    # 提取网格数据
    mesh_data_list = []
    success_count = 0
    error_count = 0

    for obj in mesh_objects:
        try:
            data = extract_mesh_data(
                obj,
                apply_modifiers=apply_modifiers,
                apply_transforms=apply_transforms,
            )
            if data:
                mesh_data_list.append(data)
                success_count += 1
            else:
                error_count += 1
        except Exception as e:
            log.error(f"提取网格数据失败 {obj.name}: {e}")
            error_count += 1

    if not mesh_data_list:
        log.error("没有成功提取的网格数据")
        return 0, error_count

    # 创建写入器并导出
    try:
        writer = MeshBinaryWriter(mesh_type, version)
        file_data = writer.write_file(mesh_data_list)

        # 写入文件
        os.makedirs(os.path.dirname(filepath) or '.', exist_ok=True)
        with open(filepath, 'wb') as f:
            f.write(file_data)

        log.info(f"已导出文件: {filepath} ({len(file_data)} 字节)")
        return success_count, error_count

    except Exception as e:
        log.error(f"导出文件失败: {e}")
        return 0, error_count + 1
