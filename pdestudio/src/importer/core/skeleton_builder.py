#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio - Blender Skeleton 导入器

将 PDESkeleton 数据转为 Blender Armature 对象。

坐标系策略 (两种模式可切换):
  - "zup" (推荐): PDE Y-up → Blender Z-up, 位置 (x,y,z)→(x,-z,y), 四元数做坐标系旋转
  - "yup": 直接使用 PDE 坐标, 模型在 Blender 中侧躺

四元数约定:
  skel.cache 存储的是 Maya 标准四元数 (maya_cast = 直接拷贝 x,y,z,w)。
  Maya 和 Blender 都使用标准 Hamilton 约定 (q⊗v⊗q⁻¹, 正向旋转)，无需共轭。

骨骼 bind pose 矩阵:
  local_matrix = Translation(pos) @ Rotation(quat)
  world_matrix = parent_world @ local_matrix

  bone.tail 指向子骨骼 head (Blender 标准方式)，bone.matrix_local ≠ PDE rest matrix。
  蒙皮正确性通过动画导入时调整 pose 矩阵来保证:
    pose_world = anim_world @ rest_world_pde⁻¹ @ bone.matrix_local
  这样 Blender 蒙皮 pose_world @ bone.matrix_local⁻¹ = anim_world @ rest_world_pde⁻¹
  bone.matrix_local 在公式中完全抵消，可以取任意值。
  PDE rest world matrices 存储在 armature ID property 中供动画导入使用。
"""

import math
import bpy
import mathutils
from typing import Optional, Dict, List, Tuple

from ..binary.skeleton import PDESkeleton
from ..coordinate import convert_position, convert_quaternion
from ...log import get_module_logger

log = get_module_logger("SKEL_IMP")


def _compute_roll(bone_y: mathutils.Vector,
                  target_x: mathutils.Vector) -> float:
    """根据骨骼 Y 轴方向和目标 X 轴方向计算 roll 角

    精确匹配 Blender 的 vec_roll_to_mat3 算法:
    1. 计算从 +Y 到 bone_y 的旋转矩阵 (r_mat_base)
    2. default_x = r_mat_base 的第一列 (X 轴)
    3. default_z = bone_y × default_x
    4. roll = atan2(target_x · default_z, target_x · default_x)

    特殊情况:
    - +Y 方向: r_mat_base = 单位矩阵, default_x = (1,0,0)
    - -Y 方向: r_mat_base = 绕 Z 轴旋转 180°, default_x = (-1,0,0)

    Args:
        bone_y: 骨骼 Y 轴方向 (归一化)
        target_x: 期望的 X 轴方向 (已投影到垂直于 bone_y 的平面)

    Returns:
        roll 角 (弧度)
    """
    target = mathutils.Vector((0, 1, 0))
    dot = target.dot(bone_y)
    eps = 1e-4

    if dot > 1.0 - eps:
        # +Y 方向: 单位矩阵
        default_x = mathutils.Vector((1, 0, 0))
    elif dot < -1.0 + eps:
        # -Y 方向: 绕 Z 轴旋转 180°
        default_x = mathutils.Vector((-1, 0, 0))
    else:
        # 一般情况: 计算从 +Y 到 bone_y 的旋转
        axis = target.cross(bone_y).normalized()
        angle = math.acos(max(-1.0, min(1.0, dot)))
        rot_mat = mathutils.Matrix.Rotation(angle, 3, axis)
        # default_x = 旋转矩阵的第一列
        default_x = mathutils.Vector((rot_mat[0][0], rot_mat[1][0], rot_mat[2][0]))

    default_z = bone_y.cross(default_x)

    cos_roll = target_x.dot(default_x)
    sin_roll = target_x.dot(default_z)
    return math.atan2(sin_roll, cos_roll)


def import_skeleton_to_blender(
    skel: PDESkeleton,
    name: str = "PDE_Skeleton",
    scale: float = 1.0,
    align_to_origin: bool = False,
    coord_mode: str = "zup",
) -> Tuple[Optional[bpy.types.Object], Dict[str, mathutils.Matrix]]:
    """将 PDESkeleton 导入为 Blender Armature

    Args:
        skel: PDE 骨骼数据
        name: Armature 对象名称
        scale: 位置缩放因子（PDE游戏单位 -> Blender米，默认1.0）
        align_to_origin: 是否将根骨骼对齐到原点
        coord_mode: "zup"=转换为Blender Z-up; "yup"=保持PDE Y-up

    Returns:
        (Armature 对象, 骨骼名到世界矩阵的映射)
    """
    arm_data = bpy.data.armatures.new(name)
    arm_data.display_type = 'STICK'
    arm_obj = bpy.data.objects.new(name, arm_data)
    arm_obj.show_in_front = True
    bpy.context.collection.objects.link(arm_obj)

    # 确保从干净的 OBJECT 模式开始
    # 文件浏览器回调时上下文可能不正确，需要显式重置
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')

    # 取消所有选择，只选中 armature
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = arm_obj
    arm_obj.select_set(True)
    bpy.context.view_layer.update()

    log.debug(f"切换到 EDIT 模式: active={bpy.context.object.name if bpy.context.object else 'None'}")
    bpy.ops.object.mode_set(mode='EDIT')

    edit_bones = arm_data.edit_bones

    # ---- Phase 1: 计算世界矩阵 & 创建骨骼 ----
    bone_map: Dict[int, bpy.types.EditBone] = {}
    world_matrices: Dict[int, mathutils.Matrix] = {}

    # 计算根骨骼偏移量（用于对齐到原点）
    root_offset = mathutils.Vector((0, 0, 0))
    if align_to_origin and skel.joints:
        for i, joint in enumerate(skel.joints):
            if joint.parent_id < 0:
                bx, by, bz = convert_position(joint.position, coord_mode)
                root_offset = mathutils.Vector((bx, by, bz)) * scale
                break

    # 预计算子骨骼映射 (用于确定骨骼长度)
    children_map: Dict[int, List[int]] = {}
    for i, joint in enumerate(skel.joints):
        if joint.parent_id >= 0:
            children_map.setdefault(joint.parent_id, []).append(i)

    for i, joint in enumerate(skel.joints):
        bone_name = joint.name if joint.name else f"bone_{i}"
        bone = edit_bones.new(bone_name)
        bone_map[i] = bone

        # 坐标系转换
        bx, by, bz = convert_position(joint.position, coord_mode)
        local_pos = mathutils.Vector((bx, by, bz)) * scale
        # align_to_origin 只对根骨骼生效
        # (root_offset 是世界空间偏移，不应应用于子骨骼的局部空间)
        if align_to_origin and joint.parent_id < 0:
            local_pos -= root_offset

        qx, qy, qz, qw = joint.rotation
        local_rot = convert_quaternion(qx, qy, qz, qw, coord_mode)

        local_matrix = (
            mathutils.Matrix.Translation(local_pos)
            @ local_rot.to_matrix().to_4x4()
        )

        if joint.parent_id >= 0 and joint.parent_id in world_matrices:
            world_matrix = world_matrices[joint.parent_id] @ local_matrix
        else:
            world_matrix = local_matrix

        world_matrices[i] = world_matrix

        # 提取世界旋转矩阵
        _, world_rot_quat, _ = world_matrix.decompose()
        world_rot = world_rot_quat.to_matrix()

        # 确定骨骼长度和 tail 方向
        # tail 指向第一个子骨骼 head (Blender 标准方式，视觉连接)
        # 叶子骨骼 (无子骨骼) 用父骨骼方向延伸，使骨骼链自然延续
        bone_length = 0.05
        bone_dir = world_rot.col[1].normalized()  # 默认: PDE Y 轴

        if i in children_map and children_map[i]:
            # 有子骨骼: tail 指向第一个子骨骼
            child_idx = children_map[i][0]
            child_joint = skel.joints[child_idx]
            cbx, cby, cbz = convert_position(child_joint.position, coord_mode)
            child_local = mathutils.Vector((cbx, cby, cbz)) * scale
            child_offset = world_rot @ child_local
            dist = child_offset.length
            if dist > 0.001:
                # handweapon 等辅助骨骼缩短为 1/10
                if bone_name.startswith("handweapon"):
                    bone_length = dist * 0.1
                else:
                    bone_length = dist
                bone_dir = child_offset.normalized()
        elif joint.parent_id >= 0 and joint.parent_id in world_matrices:
            # 叶子骨骼: 沿父骨骼方向延伸，长度缩短为 1/10
            # 面部骨骼、IK、UI、HAT 等叶子骨骼不需要太长
            parent_head = world_matrices[joint.parent_id].translation
            parent_dir = world_matrix.translation - parent_head
            dist = parent_dir.length
            if dist > 0.001:
                bone_length = dist * 0.1
                bone_dir = parent_dir.normalized()

        # 设置 head 和 tail (tail 指向子骨骼，视觉连接)
        bone.head = world_matrix.translation
        bone.tail = bone.head + bone_dir * bone_length

        # 计算 roll: 使 bone X 轴尽量对齐 PDE 世界旋转的 X 轴
        # roll 不影响蒙皮正确性 (bone.matrix_local 在公式中抵消)，
        # 但合理的 roll 使局部变换更自然
        target_x = world_rot.col[0].copy()
        target_x = target_x - bone_dir * target_x.dot(bone_dir)
        if target_x.length < 1e-6:
            bone.roll = 0.0
        else:
            target_x.normalize()
            bone.roll = _compute_roll(bone_dir, target_x)

    # ---- Phase 2: 设置父子关系 ----
    for i, joint in enumerate(skel.joints):
        bone = bone_map[i]
        if joint.parent_id >= 0 and joint.parent_id in bone_map:
            bone.parent = bone_map[joint.parent_id]
            bone.use_connect = False

    bpy.ops.object.mode_set(mode='OBJECT')

    # ---- Phase 3: 存储期望世界矩阵到 armature 对象 ----
    # vec_roll_to_mat3 在骨骼朝向 +Y 时产生反射矩阵，
    # bone.matrix_local 可能与期望世界矩阵不一致。
    # 将期望世界矩阵存为 armature 的 ID property，供动画导入使用。
    bone_world_matrices: Dict[str, mathutils.Matrix] = {}
    rest_flat: List[float] = []
    bone_names_list: List[str] = []

    for i, joint in enumerate(skel.joints):
        bone_name = joint.name if joint.name else f"bone_{i}"
        bone_names_list.append(bone_name)
        if i in world_matrices:
            mat = world_matrices[i]
            bone_world_matrices[bone_name] = mat
            for row in range(4):
                for col in range(4):
                    rest_flat.append(mat[row][col])

    arm_obj["pde_rest_matrices"] = rest_flat
    arm_obj["pde_bone_names"] = bone_names_list
    arm_obj["pde_bone_count"] = len(skel.joints)
    arm_obj["pde_coord_mode"] = coord_mode

    # ---- 验证: 检查 head 位置匹配 ----
    # bone.matrix_local 不需要匹配 PDE rest matrix (动画导入会补偿差异)
    # 只需验证 head 位置正确
    mismatch_count = 0
    for i, joint in enumerate(skel.joints):
        bone_name = joint.name if joint.name else f"bone_{i}"
        bone = arm_obj.data.bones.get(bone_name)
        if bone and i in world_matrices:
            expected = world_matrices[i]
            pos_err = (expected.translation - bone.matrix_local.translation).length
            if pos_err > 0.001:
                mismatch_count += 1

    total = len(skel.joints)
    if mismatch_count == 0:
        log.info(f"验证通过: 所有 {total} 个骨骼的 head 位置匹配")
    else:
        log.info(f"验证: {mismatch_count}/{total} 个骨骼的 head 位置不匹配")

    log.info(f"导入骨骼: {name}, {total} 个关节, 坐标系={coord_mode}")

    return arm_obj, bone_world_matrices


def get_stored_rest_matrices(
    armature_obj: bpy.types.Object
) -> Dict[str, mathutils.Matrix]:
    """从 armature 对象读取存储的期望世界矩阵

    动画导入时使用此函数获取正确的 rest matrix，
    而非 bone.matrix_local (后者可能因 vec_roll_to_mat3 限制而不正确)。

    Returns:
        骨骼名 → 期望世界矩阵的字典，如果没有存储则返回空字典
    """
    rest_flat = armature_obj.get("pde_rest_matrices", None)
    bone_names = armature_obj.get("pde_bone_names", None)
    bone_count = armature_obj.get("pde_bone_count", 0)

    if not rest_flat or not bone_names:
        return {}

    result: Dict[str, mathutils.Matrix] = {}
    for i, name in enumerate(bone_names):
        if i < bone_count:
            offset = i * 16
            mat = mathutils.Matrix((
                (rest_flat[offset + 0], rest_flat[offset + 1],
                 rest_flat[offset + 2], rest_flat[offset + 3]),
                (rest_flat[offset + 4], rest_flat[offset + 5],
                 rest_flat[offset + 6], rest_flat[offset + 7]),
                (rest_flat[offset + 8], rest_flat[offset + 9],
                 rest_flat[offset + 10], rest_flat[offset + 11]),
                (rest_flat[offset + 12], rest_flat[offset + 13],
                 rest_flat[offset + 14], rest_flat[offset + 15]),
            ))
            result[name] = mat

    return result
