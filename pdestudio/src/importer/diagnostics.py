#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio - 诊断工具

验证骨骼 rest matrix、网格绑定、动画导入的正确性。
可通过 UI 按钮或 Operator 调用。
"""

import bpy
import mathutils
from typing import Dict, List, Tuple

from ..log import get_module_logger

log = get_module_logger("DIAG")


def verify_bone_rest_matrices(
    armature_obj: bpy.types.Object,
    expected_world_matrices: Dict[str, mathutils.Matrix],
) -> List[str]:
    """验证 bone.matrix_local 是否匹配期望的世界矩阵

    Args:
        armature_obj: Armature 对象
        expected_world_matrices: 骨骼名 → 期望世界矩阵

    Returns:
        诊断信息列表（空列表 = 全部通过）
    """
    issues = []

    for bone in armature_obj.data.bones:
        name = bone.name
        if name not in expected_world_matrices:
            issues.append(f"[SKIP] 骨骼 '{name}' 不在期望矩阵列表中")
            continue

        expected = expected_world_matrices[name]
        actual = bone.matrix_local

        # 比较平移
        exp_pos = expected.translation
        act_pos = actual.translation
        pos_err = (exp_pos - act_pos).length

        # 比较旋转（四元数点积，考虑双覆盖）
        exp_quat = expected.to_quaternion()
        act_quat = actual.to_quaternion()
        dot = abs(exp_quat.dot(act_quat))
        rot_err = 1.0 - dot  # 0=完全匹配, 2=完全相反

        if pos_err > 0.001 or rot_err > 0.001:
            issues.append(
                f"[MISMATCH] '{name}': "
                f"pos_err={pos_err:.6f}, rot_err={rot_err:.6f}\n"
                f"  expected pos={tuple(round(x, 4) for x in exp_pos)}\n"
                f"  actual   pos={tuple(round(x, 4) for x in act_pos)}\n"
                f"  expected quat={tuple(round(x, 6) for x in exp_quat)}\n"
                f"  actual   quat={tuple(round(x, 6) for x in act_quat)}"
            )

    return issues


def verify_mesh_armature_binding(
    mesh_obj: bpy.types.Object,
    armature_obj: bpy.types.Object,
) -> List[str]:
    """验证网格与骨骼的绑定是否正确

    检查:
    1. Armature 修改器是否存在且指向正确的 armature
    2. 顶点组名称是否与骨骼名匹配
    3. 父对象是否设置为 armature
    4. matrix_parent_inverse 是否为单位矩阵（顶点在 armature 空间）

    Returns:
        诊断信息列表
    """
    issues = []

    # 1. 检查 Armature 修改器
    arm_mod = None
    for mod in mesh_obj.modifiers:
        if mod.type == 'ARMATURE':
            arm_mod = mod
            break

    if not arm_mod:
        issues.append(f"[ERROR] 网格 '{mesh_obj.name}' 没有 Armature 修改器!")
    elif arm_mod.object != armature_obj:
        issues.append(
            f"[ERROR] 网格 '{mesh_obj.name}' 的 Armature 修改器指向错误对象: "
            f"{arm_mod.object.name if arm_mod.object else 'None'} (期望: {armature_obj.name})"
        )

    # 2. 检查父对象
    if mesh_obj.parent != armature_obj:
        parent_name = mesh_obj.parent.name if mesh_obj.parent else "None"
        issues.append(
            f"[WARN] 网格 '{mesh_obj.name}' 的父对象是 '{parent_name}'，"
            f"不是 '{armature_obj.name}'"
        )

    # 3. 检查 matrix_parent_inverse
    parent_inv = mesh_obj.matrix_parent_inverse
    is_identity = all(
        abs(parent_inv[i][j] - (1.0 if i == j else 0.0)) < 1e-6
        for i in range(4) for j in range(4)
    )
    if not is_identity:
        issues.append(
            f"[WARN] 网格 '{mesh_obj.name}' 的 matrix_parent_inverse 不是单位矩阵，"
            f"顶点可能不在 armature 空间中!"
        )

    # 4. 检查顶点组与骨骼名匹配
    bone_names = set(bone.name for bone in armature_obj.data.bones)
    vg_names = set(vg.name for vg in mesh_obj.vertex_groups)
    matched = bone_names & vg_names
    unmatched_bones = bone_names - vg_names
    unmatched_vgs = vg_names - bone_names

    if not matched:
        issues.append(
            f"[ERROR] 网格 '{mesh_obj.name}' 没有任何顶点组与骨骼名匹配!\n"
            f"  骨骼名: {sorted(bone_names)[:10]}...\n"
            f"  顶点组: {sorted(vg_names)[:10]}..."
        )
    else:
        issues.append(
            f"[OK] 网格 '{mesh_obj.name}': {len(matched)}/{len(bone_names)} 骨骼有对应顶点组"
        )
        if unmatched_bones:
            issues.append(f"  无顶点组的骨骼: {sorted(unmatched_bones)[:10]}")
        if unmatched_vgs:
            issues.append(f"  无对应骨骼的顶点组: {sorted(unmatched_vgs)[:10]}")

    return issues


def verify_animation_rest_matrices(
    armature_obj: bpy.types.Object,
    coord_mode: str = "zup",
) -> List[str]:
    """验证动画导入使用的 rest matrix 是否正确

    使用 bone.matrix_local (与动画导入和 Armature 修改器一致)。
    Blender 的 vec_roll_to_mat3 对 +Y 朝向骨骼有 180° Y 偏差，
    但此偏差在 pose 计算中自动抵消，不影响动画正确性。

    Returns:
        诊断信息列表
    """
    issues = []

    for bone in armature_obj.data.bones:
        rest_mat = bone.matrix_local
        if bone.parent:
            rest_mat = bone.parent.matrix_local.inverted() @ bone.matrix_local

        q_rest = rest_mat.to_quaternion()
        bind_pos = rest_mat.translation

        # 检查是否有异常值（NaN, Infinity, 非常大的数）
        for val in [q_rest.x, q_rest.y, q_rest.z, q_rest.w,
                    bind_pos.x, bind_pos.y, bind_pos.z]:
            if abs(val) > 1e6 or (val != val):  # NaN check
                issues.append(
                    f"[ERROR] 骨骼 '{bone.name}' rest matrix 有异常值: "
                    f"quat=({q_rest.x:.4f}, {q_rest.y:.4f}, {q_rest.z:.4f}, {q_rest.w:.4f}), "
                    f"pos=({bind_pos.x:.4f}, {bind_pos.y:.4f}, {bind_pos.z:.4f})"
                )
                break

    return issues


def run_full_diagnostics(
    armature_obj: bpy.types.Object,
    expected_world_matrices: Dict[str, mathutils.Matrix] = None,
    coord_mode: str = "zup",
) -> str:
    """运行完整诊断，返回格式化的诊断报告

    Args:
        armature_obj: 选中的 Armature 对象
        expected_world_matrices: 骨骼名→期望世界矩阵（可选，来自导入时记录）
        coord_mode: 坐标系模式

    Returns:
        诊断报告文本
    """
    report_lines = []
    report_lines.append("=" * 60)
    report_lines.append("PDE Studio 诊断报告")
    report_lines.append("=" * 60)

    if not armature_obj or armature_obj.type != 'ARMATURE':
        report_lines.append("[ERROR] 未选中 Armature 对象!")
        return "\n".join(report_lines)

    arm = armature_obj.data
    report_lines.append(f"\n骨骼对象: {armature_obj.name}")
    report_lines.append(f"骨骼数量: {len(arm.bones)}")

    # 1. 验证 rest matrix
    report_lines.append("\n--- 1. 骨骼 Rest Matrix 验证 ---")
    if expected_world_matrices:
        issues = verify_bone_rest_matrices(armature_obj, expected_world_matrices)
        if issues:
            for issue in issues:
                report_lines.append(issue)
        else:
            report_lines.append("[OK] 所有骨骼的 matrix_local 与期望世界矩阵匹配")
    else:
        report_lines.append("[SKIP] 没有提供期望世界矩阵（需要导入时记录的数据）")

    # 2. 验证动画 rest matrix
    report_lines.append("\n--- 2. 动画 Rest Matrix 验证 ---")
    anim_issues = verify_animation_rest_matrices(armature_obj, coord_mode)
    if anim_issues:
        for issue in anim_issues:
            report_lines.append(issue)
    else:
        report_lines.append("[OK] 动画 rest matrix 无异常值")

    # 3. 验证网格绑定
    report_lines.append("\n--- 3. 网格绑定验证 ---")
    mesh_count = 0
    for obj in bpy.data.objects:
        if obj.type == 'MESH' and obj.parent == armature_obj:
            mesh_count += 1
            report_lines.append(f"\n网格: {obj.name}")
            issues = verify_mesh_armature_binding(obj, armature_obj)
            for issue in issues:
                report_lines.append(f"  {issue}")

    if mesh_count == 0:
        report_lines.append("[WARN] 没有找到绑定到此骨骼的网格对象")

    # 4. 输出前5个骨骼的详细信息
    report_lines.append("\n--- 4. 前5个骨骼详细信息 ---")
    for i, bone in enumerate(arm.bones[:5]):
        rest_mat = bone.matrix_local
        if bone.parent:
            local_mat = bone.parent.matrix_local.inverted() @ bone.matrix_local
        else:
            local_mat = rest_mat

        q = local_mat.to_quaternion()
        t = local_mat.translation

        report_lines.append(
            f"  [{i}] {bone.name} (parent={bone.parent.name if bone.parent else 'None'}):\n"
            f"      local pos=({t.x:.4f}, {t.y:.4f}, {t.z:.4f})\n"
            f"      local quat=({q.x:.6f}, {q.y:.6f}, {q.z:.6f}, {q.w:.6f})\n"
            f"      head=({bone.head_local.x:.4f}, {bone.head_local.y:.4f}, {bone.head_local.z:.4f})\n"
            f"      tail=({bone.tail_local.x:.4f}, {bone.tail_local.y:.4f}, {bone.tail_local.z:.4f})"
        )

    report_lines.append("\n" + "=" * 60)
    return "\n".join(report_lines)
