#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio - Skeleton 导出器

将 Blender Armature 导出为 PDE 引擎的明文 .skel 格式（Lua 表）。

结构:
    Joints = {
        { 名称, 父骨骼索引(0-based), px, py, pz, qx, qy, qz, qw },
        ...
    }

关键修复 (对齐 Maya 导出器 tc/editor/export/exportMesh.cpp:SaveJoints):
    1. 使用 pde_rest_matrices（导入时存储）而非 bone.matrix_local
    2. Blender Z-up → PDE Y-up 坐标系逆向转换
    3. fix_small: 绝对值 < 1e-5 归零 (匹配 Maya)
    4. 四元数归一化 (匹配 Maya: rotate.Normalize())
"""

import os
import bpy
from mathutils import Matrix

from ..log import get_module_logger
from . import lua_table_to_file, generate_build_scripts
from .export_utils import (
    get_armature_coord_mode,
    get_pde_rest_world_matrices,
    convert_position_to_pde,
    convert_quaternion_to_pde,
    get_pexport_dir,
    derive_vfs_prefix,
)

log = get_module_logger("SKEL")


# =============================================================================
# 骨骼数据提取
# =============================================================================

def _get_bone_order(armature: bpy.types.Object) -> list:
    """获取骨骼的有序列表（BFS 顺序，确保父骨骼在子骨骼前面）"""
    bones = []
    visited = set()

    def _walk(bone):
        if bone.name in visited:
            return
        visited.add(bone.name)
        bones.append(bone.name)
        for child in bone.children:
            _walk(child)

    for bone in armature.data.bones:
        if bone.parent is None:
            _walk(bone)

    for bone in armature.data.bones:
        if bone.name not in visited:
            bones.append(bone.name)

    return bones


def _fix_small(value: float, eps: float = 1e-5) -> float:
    """绝对值小于 eps 的值归零（匹配 Maya 导出器的 fix_small）"""
    return 0.0 if -eps < value < eps else value


def _extract_skeleton_data(armature: bpy.types.Object, scale: float = 100.0) -> list:
    """从 Blender Armature 提取骨骼数据

    优先使用导入时存储的 pde_rest_matrices（Blender 空间世界矩阵），
    退化时用 bone.matrix_local 代替。

    Args:
        armature: Blender Armature 对象
        scale: 位置缩放倍数（默认100，将米转换为厘米）

    Returns:
        骨骼数据列表 [[name, parent_idx, px, py, pz, qx, qy, qz, qw], ...]
    """
    coord_mode = get_armature_coord_mode(armature)
    pde_rest_world = get_pde_rest_world_matrices(armature)
    has_rest = len(pde_rest_world) > 0

    if not has_rest:
        log.warning("未找到 PDE rest matrices，使用 bone.matrix_local 代替")

    bone_order = _get_bone_order(armature)
    bone_name_to_idx = {name: i for i, name in enumerate(bone_order)}

    joints = []

    for bone_name in bone_order:
        bone = armature.data.bones[bone_name]

        # 父骨骼索引（0-based，根骨骼为 -1）
        parent_idx = bone_name_to_idx[bone.parent.name] if bone.parent else -1

        # 获取 rest world matrix (Blender 空间)
        if has_rest and bone_name in pde_rest_world:
            rest_world = pde_rest_world[bone_name]
        else:
            rest_world = bone.matrix_local

        # 计算局部矩阵
        if bone.parent:
            if has_rest and bone.parent.name in pde_rest_world:
                parent_world = pde_rest_world[bone.parent.name]
            else:
                parent_world = bone.parent.matrix_local
            local_matrix = parent_world.inverted() @ rest_world
        else:
            local_matrix = rest_world.copy()

        # 分解 (Blender 空间)
        loc_blender = local_matrix.to_translation()
        quat_blender = local_matrix.to_quaternion()
        quat_blender.normalize()

        # 坐标系转换: Blender Z-up → PDE Y-up
        px, py, pz = convert_position_to_pde(loc_blender, coord_mode)
        qx, qy, qz, qw = convert_quaternion_to_pde(
            quat_blender.x, quat_blender.y,
            quat_blender.z, quat_blender.w, coord_mode)

        # 位置 × scale（厘米）
        px = round(px * scale, 6)
        py = round(py * scale, 6)
        pz = round(pz * scale, 6)

        # fix_small (匹配 Maya 导出器)
        px = _fix_small(px)
        py = _fix_small(py)
        pz = _fix_small(pz)
        qx = _fix_small(qx)
        qy = _fix_small(qy)
        qz = _fix_small(qz)
        qw = _fix_small(qw)

        joints.append([bone_name, parent_idx, px, py, pz, qx, qy, qz, qw])

    return joints


# =============================================================================
# 导出主函数
# =============================================================================

def export_skel(
    context,
    filepath: str,
    scale: float = 100.0,
) -> bool:
    """导出 Skeleton 为 PDE .skel 格式

    Args:
        context: Blender 上下文
        filepath: 输出文件路径
        scale: 位置缩放倍数（默认100，将米转换为厘米）

    Returns:
        是否成功
    """
    armature = _find_armature(context)
    if not armature:
        log.warning("未找到 Armature 对象")
        return False

    log.info(f"导出 Skeleton: {armature.name}")

    if context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')

    joints = _extract_skeleton_data(armature, scale)
    if not joints:
        log.warning("骨骼数据为空")
        return False

    lua_table = {"Joints": joints}

    skel_name = os.path.splitext(os.path.basename(filepath))[0]
    success = lua_table_to_file(
        lua_table, filepath,
        header_comment=f"PDE Studio - Skeleton Export: {skel_name}",
    )

    if success:
        pexport_dir = get_pexport_dir(context)
        vfs_prefix = derive_vfs_prefix(filepath, pexport_dir or "")
        generate_build_scripts(
            mesh_name=skel_name,
            export_dir=os.path.dirname(filepath),
            vfs_prefix=vfs_prefix,
            has_skel=True,
            has_anim=False,
        )

    return success


def _find_armature(context):
    """查找选中的 Armature 对象"""
    for obj in context.selected_objects:
        if obj.type == 'ARMATURE':
            return obj
    for obj in context.scene.objects:
        if obj.type == 'ARMATURE':
            return obj
    return None
