"""
网格处理公共接口模块

提供对外暴露的公共接口，整合 geometry 和 material 模块。
保持向后兼容性，方便其他模块调用。

Usage:
    from .mesh_any.common import (
        create_mesh_object_from_data,
        bind_mesh_to_armature,
    )
"""

from typing import Set, Optional, List, Dict, Any
import bpy

from ..log import get_module_logger
from .geometry import (
    build_mesh_geometry,
    transform_mesh_data,
    create_vertex_groups,
    find_best_armature,
    bind_mesh_to_armature,
    apply_standard_transform,
    create_bounding_box,
)
from .material import create_mesh_object

log = get_module_logger("COMMON")


# =============================================================================
# 公共接口函数（向后兼容）
# =============================================================================

def create_mesh_object_from_data(
    context: bpy.types.Context,
    mesh_data: Dict[str, Any],
    base_object_name: str,
    object_index: int,
    processed_materials_set: Set[str],
    resource_directory_path: str,
    mesh_type: str = "Unset",
    obj_namess: Optional[List[str]] = None,
) -> Optional[bpy.types.Object]:
    """
    从网格数据创建完整的网格对象
    
    这是向后兼容的公共接口，内部调用重构后的模块。
    
    Args:
        context: Blender 上下文
        mesh_data: 包含网格数据的字典
        base_object_name: 基础对象名称
        object_index: 对象索引
        processed_materials_set: 已处理材质的集合
        resource_directory_path: 资源目录路径
        mesh_type: 网格类型
        obj_namess: 骨骼名称列表（用于顶点组命名）
    
    Returns:
        创建的网格对象，失败返回 None
    """
    return create_mesh_object(
        context,
        mesh_data,
        base_object_name,
        object_index,
        processed_materials_set,
        resource_directory_path,
        mesh_type,
        obj_namess,
    )


# =============================================================================
# 重新导出常用函数
# =============================================================================

# 从 geometry 模块导出
__all__ = [
    # 主要接口
    "create_mesh_object_from_data",
    "bind_mesh_to_armature",
    "find_best_armature",
    "create_vertex_groups",
    "build_mesh_geometry",
    "transform_mesh_data",
    "apply_standard_transform",
    "create_bounding_box",
    # 从 material 模块导出
    "create_mesh_object",
]
