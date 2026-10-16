"""
网格几何处理模块

提供网格创建、顶点设置、UV、法线等几何数据处理功能。
使用 Blender 4.5+ 的 foreach_set 等 API 实现高性能操作。

遵循原则：
- 单个文件不超过 500 行
- 使用 Blender 原生 API，无外部依赖
- 通过 compat.py 处理版本兼容性
"""

import bpy
import bmesh
import math
from typing import List, Tuple, Optional, Dict, Any

from ..log import get_module_logger
from .compat import (
    set_mesh_normals,
    set_uv_batch,
    add_smooth_by_angle_modifier,
)

log = get_module_logger("GEOM")

# =============================================================================
# 常量定义
# =============================================================================

# 坐标转换（Game Space Z-up -> Blender Space Y-up）
# X -> X, Y -> -Z, Z -> Y

# 每个顶点最多包含的权重数量
MAX_VERTEX_WEIGHT_COUNT = 4

# 默认 UV 图层名称
DEFAULT_UV_LAYER_NAME = "UVMap"


# =============================================================================
# 坐标转换
# =============================================================================

def transform_coord(x: float, y: float, z: float) -> Tuple[float, float, float]:
    """
    快速坐标转换 (Game Space Z-up -> Blender Space Y-up)
    
    Args:
        x, y, z: Game Space 坐标
    
    Returns:
        Blender Space 坐标元组 (x, -z, y)
    """
    return (x, -z, y)


def transform_mesh_data(mesh_data: Dict[str, Any]) -> None:
    """
    将网格数据从 Game Space 转换到 Blender Space
    
    直接修改 mesh_data 中的顶点、法线、切线等数据。
    
    Args:
        mesh_data: 网格数据字典
    """
    # 1. 转换顶点位置
    if "vertex_data" in mesh_data:
        mesh_data["vertex_data"] = [
            transform_coord(v[0], v[1], v[2]) 
            for v in mesh_data["vertex_data"]
        ]
    
    # 2. 转换法线
    if mesh_data.get("normals"):
        mesh_data["normals"] = [
            transform_coord(n[0], n[1], n[2]) 
            for n in mesh_data["normals"]
        ]
    
    # 3. 转换切线
    if mesh_data.get("tangents"):
        mesh_data["tangents"] = [
            transform_coord(t[0], t[1], t[2]) 
            for t in mesh_data["tangents"]
        ]
    
    # 4. 转换副法线
    if mesh_data.get("binormals"):
        mesh_data["binormals"] = [
            transform_coord(b[0], b[1], b[2]) 
            for b in mesh_data["binormals"]
        ]
    
    log.debug("已将网格数据转换到 Blender Space")


# =============================================================================
# 网格构建（核心函数）
# =============================================================================

def build_mesh_geometry(mesh: bpy.types.Mesh, mesh_data: Dict[str, Any]) -> None:
    """
    构建完整的网格几何体
    
    使用 Blender 4.5 推荐的 API 构建网格的顶点、面、UV、法线等几何数据。
    
    Args:
        mesh: 目标网格对象
        mesh_data: 包含网格数据的字典
            - vertex_data: 顶点坐标列表
            - faces_data: 面索引列表
            - uvs: UV 坐标列表
            - normals: 法线向量列表（可选）
            - tangents: 切线向量列表（可选）
            - binormals: 副法线向量列表（可选）
    """
    # 1. 使用 pydata 创建基础几何
    mesh.from_pydata(
        mesh_data["vertex_data"],  # 顶点数据
        [],                         # 边数据（空，自动生成）
        mesh_data["faces_data"]     # 面数据
    )
    
    # 2. 创建 UV 映射（使用高性能 foreach_set）
    if mesh_data.get("uvs"):
        create_uv_mapping_fast(mesh, mesh_data["uvs"])
    
    # 3. 创建自定义法线
    if mesh_data.get("normals"):
        set_mesh_normals(mesh, mesh_data["normals"])
    
    # 4. 创建切线空间数据
    if mesh_data.get("tangents") and mesh_data.get("binormals"):
        validate_tangent_space(mesh, mesh_data["tangents"], mesh_data["binormals"])
    
    # 5. 只更新一次
    mesh.update()
    
    log.debug(
        f"已构建网格几何体: {len(mesh_data['vertex_data'])} 顶点, "
        f"{len(mesh_data['faces_data'])} 面"
    )


def create_uv_mapping_fast(mesh: bpy.types.Mesh, uvs: List[Tuple[float, float]]) -> None:
    """
    使用 foreach_set 高性能创建 UV 映射
    
    比传统循环快 5-10 倍。
    
    Args:
        mesh: 目标网格对象
        uvs: UV 坐标列表，每个元素为 (u, v) 元组
    """
    if not uvs:
        return
    
    if len(uvs) != len(mesh.vertices):
        log.warning(f"UV数量({len(uvs)})与顶点数量({len(mesh.vertices)})不匹配")
    
    # 使用 compat 层的批量设置
    success = set_uv_batch(mesh, uvs, DEFAULT_UV_LAYER_NAME)
    
    if success:
        log.debug(f"已创建 UV 映射: {len(uvs)} 个坐标")
    else:
        log.warning("UV 映射创建失败")


def validate_tangent_space(
    mesh: bpy.types.Mesh, 
    tangents: List[Tuple[float, float, float]], 
    binormals: List[Tuple[float, float, float]]
) -> None:
    """
    验证切线空间数据
    
    Note:
        Blender 4.5 中切线空间数据通常由 UV 映射自动生成。
        此函数主要用于数据验证。
    
    Args:
        mesh: 目标网格
        tangents: 切线向量列表
        binormals: 副法线向量列表
    """
    if len(tangents) != len(mesh.vertices) or len(binormals) != len(mesh.vertices):
        log.warning("切线或副法线数量与顶点数量不匹配")
        return
    
    # 验证切线空间数据的有效性
    valid_tangent_count = sum(1 for t in tangents if any(t))
    valid_binormal_count = sum(1 for b in binormals if any(b))
    
    log.debug(
        f"切线空间数据: 有效切线 {valid_tangent_count}/{len(tangents)}, "
        f"有效副法线 {valid_binormal_count}/{len(binormals)}"
    )
    
    # 确保 UV 图层存在
    if not mesh.uv_layers:
        log.debug("缺少 UV 图层，创建默认 UV")
        create_uv_mapping_fast(mesh, [(0.0, 0.0)] * len(mesh.vertices))


# =============================================================================
# 顶点组与骨骼绑定
# =============================================================================

def create_vertex_groups(
    mesh_object: bpy.types.Object,
    bone_indices: List[Tuple[int, int, int, int]],
    bone_weights: List[Tuple[float, float, float, float]],
    bone_names: Optional[List[str]] = None
) -> int:
    """
    为网格对象创建顶点组，用于骨骼权重
    
    Args:
        mesh_object: 目标网格对象
        bone_indices: 骨骼索引列表，每个元素为 4 个索引的元组
        bone_weights: 权重列表，每个元素为 4 个权重的元组
        bone_names: 骨骼名称列表（可选）
    
    Returns:
        创建的顶点组数量
    """
    if not bone_indices or not bone_weights:
        log.debug("缺少索引或权重数据")
        return 0
    
    if len(bone_indices) != len(mesh_object.data.vertices):
        log.warning(
            f"索引数量({len(bone_indices)})与顶点数量"
            f"({len(mesh_object.data.vertices)})不匹配"
        )
        return 0
    
    # 清理现有顶点组
    _clear_vertex_groups(mesh_object)
    
    # 收集实际使用的骨骼索引
    used_indices = _collect_used_indices(bone_indices)
    
    # 创建顶点组
    created_count = _create_vertex_group_for_indices(
        mesh_object, used_indices, bone_names
    )
    
    # 分配权重
    _assign_weights(mesh_object, bone_indices, bone_weights, bone_names)
    
    log.info(
        f"已创建 {created_count} 个顶点组 "
        f"（共使用 {len(used_indices)} 个骨骼索引）"
    )
    
    return created_count


def _clear_vertex_groups(mesh_object: bpy.types.Object) -> None:
    """清理现有顶点组"""
    for vg in list(mesh_object.vertex_groups):
        mesh_object.vertex_groups.remove(vg)


def _collect_used_indices(
    bone_indices: List[Tuple[int, int, int, int]]
) -> set:
    """收集实际使用的骨骼索引"""
    used = set()
    for indices in bone_indices:
        for idx in indices:
            if idx < 255:  # 0xFF 表示未使用
                used.add(idx)
    return used


def _create_vertex_group_for_indices(
    mesh_object: bpy.types.Object,
    used_indices: set,
    bone_names: Optional[List[str]]
) -> int:
    """为使用的索引创建顶点组"""
    created = 0
    
    def get_bone_name(idx: int) -> str:
        if bone_names and idx < len(bone_names) and bone_names[idx]:
            return bone_names[idx]
        return f"Bone_{idx:03d}"
    
    for idx in used_indices:
        name = get_bone_name(idx)
        if name not in mesh_object.vertex_groups:
            mesh_object.vertex_groups.new(name=name)
            created += 1
    
    return created


def _assign_weights(
    mesh_object: bpy.types.Object,
    bone_indices: List[Tuple[int, int, int, int]],
    bone_weights: List[Tuple[float, float, float, float]],
    bone_names: Optional[List[str]]
) -> None:
    """为顶点分配权重"""
    def get_bone_name(idx: int) -> str:
        if bone_names and idx < len(bone_names) and bone_names[idx]:
            return bone_names[idx]
        return f"Bone_{idx:03d}"
    
    for vi, (indices, weights) in enumerate(zip(bone_indices, bone_weights)):
        for j in range(MAX_VERTEX_WEIGHT_COUNT):
            if j >= len(indices) or j >= len(weights):
                break
            
            bone_idx = indices[j]
            weight = weights[j]
            
            # 跳过无效索引和极小权重
            if bone_idx >= 255 or weight <= 0.001:
                continue
            
            group_name = get_bone_name(bone_idx)
            vg = mesh_object.vertex_groups.get(group_name)
            
            if vg:
                vg.add([vi], weight, 'REPLACE')


# =============================================================================
# 骨架绑定
# =============================================================================

def find_best_armature(
    context: bpy.types.Context, 
    mesh_object: bpy.types.Object
) -> Optional[bpy.types.Object]:
    """
    为网格查找最匹配的骨架
    
    Args:
        context: Blender 上下文
        mesh_object: 目标网格对象
    
    Returns:
        最佳匹配的骨架对象，如果没有则返回 None
    """
    armatures = [obj for obj in context.scene.objects if obj.type == "ARMATURE"]
    
    if not armatures:
        return None
    
    if len(armatures) == 1:
        return armatures[0]
    
    # 根据顶点组名称匹配
    vg_names = {g.name for g in mesh_object.vertex_groups}
    
    if not vg_names:
        return armatures[0]
    
    best_armature = None
    best_match = -1
    
    for armature in armatures:
        bone_names = {b.name for b in armature.data.bones}
        match_count = len(vg_names & bone_names)
        
        if match_count > best_match:
            best_match = match_count
            best_armature = armature
    
    return best_armature or armatures[0]


def bind_mesh_to_armature(
    mesh_object: bpy.types.Object, 
    armature_obj: bpy.types.Object
) -> bool:
    """
    将网格绑定到骨架（添加 Armature 修改器）
    
    Note:
        此函数只添加修改器，不改变 mesh 的父物体层级关系。
    
    Args:
        mesh_object: 目标网格对象
        armature_obj: 骨架对象
    
    Returns:
        是否绑定成功
    """
    if not mesh_object or mesh_object.type != "MESH":
        return False
    
    if not armature_obj or armature_obj.type != "ARMATURE":
        return False
    
    # 查找或创建 Armature 修改器
    armature_mod = None
    for mod in mesh_object.modifiers:
        if mod.type == "ARMATURE":
            armature_mod = mod
            break
    
    if armature_mod is None:
        armature_mod = mesh_object.modifiers.new(name="Armature", type="ARMATURE")
    
    armature_mod.object = armature_obj
    armature_mod.use_vertex_groups = True
    armature_mod.use_bone_envelopes = False
    
    log.debug(f"已将 {mesh_object.name} 绑定到骨架 {armature_obj.name}")
    return True


# =============================================================================
# 对象变换
# =============================================================================

def apply_standard_transform(obj: bpy.types.Object) -> None:
    """
    应用标准对象变换设置
    
    由于网格数据已转换到 Blender Space (Y-up)，
    这里不需要额外旋转对象。
    
    Args:
        obj: 目标对象
    """
    obj.rotation_mode = "XYZ"
    obj.rotation_euler = (0.0, 0.0, 0.0)
    log.debug(f"已为对象 {obj.name} 应用标准变换")


# =============================================================================
# 边界框
# =============================================================================

def create_bounding_box(
    context: bpy.types.Context,
    min_pos: Tuple[float, float, float],
    max_pos: Tuple[float, float, float],
    base_name: str
) -> Optional[bpy.types.Object]:
    """
    创建边界框线框对象
    
    Args:
        context: Blender 上下文
        min_pos: 最小边界坐标 (x, y, z)
        max_pos: 最大边界坐标 (x, y, z)
        base_name: 基础名称
    
    Returns:
        创建的边界框对象
    """
    bbox_name = f"BBox_{base_name}"
    
    # 清理旧对象
    if bbox_name in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[bbox_name], do_unlink=True)
    
    # 创建网格
    bbox_mesh = bpy.data.meshes.new(bbox_name)
    bbox_obj = bpy.data.objects.new(bbox_name, bbox_mesh)
    context.collection.objects.link(bbox_obj)
    
    # 使用 bmesh 创建几何
    bm = bmesh.new()
    
    # 立方体 8 顶点
    vertices = [
        (min_pos[0], min_pos[1], min_pos[2]),
        (max_pos[0], min_pos[1], min_pos[2]),
        (max_pos[0], max_pos[1], min_pos[2]),
        (min_pos[0], max_pos[1], min_pos[2]),
        (min_pos[0], min_pos[1], max_pos[2]),
        (max_pos[0], min_pos[1], max_pos[2]),
        (max_pos[0], max_pos[1], max_pos[2]),
        (min_pos[0], max_pos[1], max_pos[2]),
    ]
    
    bm_verts = [bm.verts.new(v) for v in vertices]
    bm.verts.ensure_lookup_table()
    
    # 12 条边
    edges = [
        (0, 1), (1, 2), (2, 3), (3, 0),  # 底面
        (4, 5), (5, 6), (6, 7), (7, 4),  # 顶面
        (0, 4), (1, 5), (2, 6), (3, 7),  # 垂直边
    ]
    
    for e in edges:
        bm.edges.new([bm_verts[e[0]], bm_verts[e[1]]])
    
    bm.to_mesh(bbox_mesh)
    bm.free()
    
    bbox_obj.display_type = 'WIRE'
    apply_standard_transform(bbox_obj)
    
    log.debug(f"已创建边界框: {bbox_name}")
    return bbox_obj
