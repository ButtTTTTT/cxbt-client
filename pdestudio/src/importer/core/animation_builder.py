#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio - Blender Animation 导入器

将 PDEAnimation 数据转为 Blender Action。

核心公式 (解耦 bone.matrix_local 与 PDE rest matrix):
  Blender 蒙皮: skinning = pose_world @ bone.matrix_local⁻¹
  PDE 蒙皮:    skinning = anim_world @ rest_world_pde⁻¹

  令 pose_world = anim_world @ rest_world_pde⁻¹ @ bone.matrix_local
  则 skinning = anim_world @ rest_world_pde⁻¹ @ bone.matrix_local @ bone.matrix_local⁻¹
             = anim_world @ rest_world_pde⁻¹  ✓

  bone.matrix_local 完全抵消，可以是任意值 (tail 指向子骨骼)。
  动画导入时通过此公式调整 pose 矩阵补偿 bone.matrix_local 与 PDE rest 的差异。

实现步骤:
  1. 从 armature 读取 PDE rest world matrices (skeleton 导入时存储)
  2. 构建 bone 层级拓扑序 (parents before children)
  3. 每帧:
     a. 从动画数据构建 PDE anim local matrices
     b. 层级组合计算 PDE anim world matrices
     c. 计算 target_world = anim_world @ rest_world⁻¹ @ bone.matrix_local
     d. 计算 matrix_basis = rest_local⁻¹ @ parent_target⁻¹ @ target_world
     e. 分解为 location + rotation_quaternion，插入关键帧

退化情况: 若 PDE rest matrices 未存储 (旧版导入)，用 bone.matrix_local 代替，
  公式退化为 matrix_basis = rest_local⁻¹ @ anim_local，与旧版逻辑等价。
"""

import bpy
import mathutils
from typing import Optional, Dict, List

from ..binary.animation import PDEAnimation, PDEAnimTrack
from ..coordinate import convert_position, convert_quaternion
from .skeleton_builder import get_stored_rest_matrices
from ...core.anim_fps import PDE_ANIM_FPS, tag_action_fps
from ...log import get_module_logger

log = get_module_logger("ANIM_IMP")


def import_animation_to_blender(
    anim: PDEAnimation,
    armature_obj: bpy.types.Object,
    action_name: str = "PDE_Action",
    scale: float = 1.0,
    coord_mode: str = "zup",
) -> Optional[bpy.types.Action]:
    """将 PDEAnimation 导入为 Blender Action

    使用 target_world = anim_world @ rest_world⁻¹ @ bone.matrix_local 公式
    解耦 bone.matrix_local 与 PDE rest matrix，使骨骼可以视觉连接。

    Args:
        anim: PDE 动画数据
        armature_obj: 目标 Armature 对象
        action_name: Action 名称
        scale: 位置缩放因子
        coord_mode: "zup" 或 "yup"

    Returns:
        Blender Action 对象
    """
    if not anim.tracks:
        log.warning("无动画轨道数据")
        return None

    action = bpy.data.actions.new(action_name)

    # 把真实帧率记到 Action 上。
    # scene.render.fps 是全局值，加载别的 .blend / 手动修改都会覆盖它，
    # 而一旦它和动画真实帧率不符，播放速度和 glTF 导出的动画时长都会错。
    # 记在 Action 上之后，就能在文件加载后或导出前检测并自动校正。
    tag_action_fps(action, PDE_ANIM_FPS)

    if not armature_obj.animation_data:
        armature_obj.animation_data_create()
    armature_obj.animation_data.action = action

    scene = bpy.context.scene
    scene.render.fps = int(PDE_ANIM_FPS)
    scene.render.fps_base = 1.0

    # ---- 1. 获取 PDE rest world matrices ----
    pde_rest_world = get_stored_rest_matrices(armature_obj)
    has_rest = len(pde_rest_world) > 0
    if not has_rest:
        log.warning("未找到 PDE rest matrices，使用 bone.matrix_local 代替")

    # ---- 2. 构建骨骼层级 ----
    bones = armature_obj.data.bones
    bone_parent: Dict[str, Optional[str]] = {}
    for bone in bones:
        bone_parent[bone.name] = bone.parent.name if bone.parent else None

    bone_order = _topological_sort(bones, bone_parent)

    # ---- 3. 预计算 rest 相关矩阵 ----
    rest_local: Dict[str, mathutils.Matrix] = {}
    rest_local_inv: Dict[str, mathutils.Matrix] = {}
    rest_world_inv: Dict[str, mathutils.Matrix] = {}
    bone_matrix_local: Dict[str, mathutils.Matrix] = {}

    for bone in bones:
        name = bone.name
        bml = bone.matrix_local.copy()
        bone_matrix_local[name] = bml

        if bone.parent:
            rl = bone.parent.matrix_local.inverted() @ bml
        else:
            rl = bml.copy()
        rest_local[name] = rl
        rest_local_inv[name] = rl.inverted()

        rw = pde_rest_world.get(name, bml)
        rest_world_inv[name] = rw.inverted()

    # ---- 4. 动画轨道映射 ----
    track_map: Dict[str, PDEAnimTrack] = {}
    for track in anim.tracks:
        if armature_obj.pose.bones.get(track.name):
            track_map[track.name] = track
        else:
            log.debug(f"跳过轨道: {track.name} (骨骼不存在)")

    # ---- 5. PDE rest local (用于无轨道骨骼的 fallback) ----
    pde_rest_local: Dict[str, mathutils.Matrix] = {}
    for name in bone_order:
        parent_name = bone_parent.get(name)
        if parent_name and parent_name in pde_rest_world:
            pde_rest_local[name] = pde_rest_world[parent_name].inverted() @ pde_rest_world[name]
        elif name in pde_rest_world:
            pde_rest_local[name] = pde_rest_world[name].copy()
        else:
            pde_rest_local[name] = rest_local[name].copy()

    # ---- 6. 逐帧处理 ----
    frame_count = anim.frame_count
    prev_quats: Dict[str, Optional[mathutils.Quaternion]] = {}
    identity4 = mathutils.Matrix.Identity(4)

    for frame_idx in range(frame_count):
        frame_num = frame_idx + 1

        # 6a. 构建 PDE anim local matrices
        anim_local: Dict[str, mathutils.Matrix] = {}
        for name in bone_order:
            track = track_map.get(name)
            if track and frame_idx < len(track.frames):
                tx, ty, tz, qx, qy, qz, qw = track.frames[frame_idx]
                bx, by, bz = convert_position((tx, ty, tz), coord_mode)
                pos = mathutils.Vector((bx * scale, by * scale, bz * scale))
                quat = convert_quaternion(qx, qy, qz, qw, coord_mode)
                anim_local[name] = mathutils.Matrix.Translation(pos) @ quat.to_matrix().to_4x4()
            else:
                anim_local[name] = pde_rest_local.get(name, identity4)

        # 6b. 层级组合计算 PDE anim world matrices
        anim_world: Dict[str, mathutils.Matrix] = {}
        for name in bone_order:
            parent_name = bone_parent.get(name)
            if parent_name and parent_name in anim_world:
                anim_world[name] = anim_world[parent_name] @ anim_local[name]
            else:
                anim_world[name] = anim_local[name].copy()

        # 6c+6d. 计算 target_world 和 matrix_basis
        target_world: Dict[str, mathutils.Matrix] = {}
        for name in bone_order:
            # target_world = anim_world @ rest_world⁻¹ @ bone.matrix_local
            target = anim_world[name] @ rest_world_inv[name] @ bone_matrix_local[name]
            target_world[name] = target

            # matrix_basis = rest_local⁻¹ @ parent_target⁻¹ @ target
            parent_name = bone_parent.get(name)
            if parent_name and parent_name in target_world:
                parent_inv = target_world[parent_name].inverted()
                basis = rest_local_inv[name] @ parent_inv @ target
            else:
                basis = rest_local_inv[name] @ target

            # 6e. 分解并设置 keyframe
            pbone = armature_obj.pose.bones.get(name)
            if not pbone:
                continue

            pbone.rotation_mode = 'QUATERNION'
            loc, quat, _ = basis.decompose()
            pbone.location = loc

            # 四元数连续性: 相邻帧点积 < 0 则取反
            prev_q = prev_quats.get(name)
            if prev_q is not None and quat.dot(prev_q) < 0.0:
                quat = -quat
            pbone.rotation_quaternion = quat
            prev_quats[name] = quat.normalized()

            pbone.keyframe_insert(data_path="location", frame=frame_num)
            pbone.keyframe_insert(data_path="rotation_quaternion", frame=frame_num)

    # ---- 7. 所有 F-Curve 插值设为线性（与引擎的线性插值对齐）----
    # 必须处理**全部**通道（含 location），且不能只遍历 anim.tracks
    # —— 虚拟根 bone_0 不在 tracks 里，只遍历轨道会漏掉它。
    _set_all_fcurves_linear(action)

    if frame_count > 0:
        scene.frame_start = 1
        scene.frame_end = frame_count

    inserted = len(track_map)
    log.info(f"导入动画: {action_name}, {inserted}/{len(anim.tracks)} 轨道, "
             f"{frame_count} 帧 ({anim.duration:.2f}s)")
    return action


def _topological_sort(bones, bone_parent: Dict[str, Optional[str]]) -> List[str]:
    """拓扑排序骨骼 (parents before children)"""
    visited = set()
    order = []

    def visit(name):
        if name in visited:
            return
        visited.add(name)
        parent = bone_parent.get(name)
        if parent:
            visit(parent)
        order.append(name)

    for bone in bones:
        visit(bone.name)

    return order


def _set_all_fcurves_linear(action: bpy.types.Action):
    """将 Action 的**所有** F-Curve 插值模式设为线性

    引擎侧的动画求值是纯线性插值（tc/client/game/Animation.cpp:1362-1368）:
        int frame = time * frame_rate;
        float lerp = time * frame_rate - frame;   // 帧间线性混合

    而 Blender 的关键帧默认是 BEZIER（缓入缓出）。两者不一致会让动作在
    每个关键帧附近减速，整体节奏比游戏里"慢"、"软"；导出 glTF 时平移
    通道还会按 BEZIER 烘焙，把这个偏差固化进资源。

    因此这里统一改成 LINEAR，与引擎行为对齐。注意必须处理**全部**通道
    （含 location），且不能只遍历 anim.tracks —— 虚拟根 bone_0 不在
    轨道列表里，只遍历轨道会漏掉它的 484 个关键帧。

    兼容 Blender 4.4+ Slotted Actions 与旧版 API。
    """
    def _apply_linear(fcurves):
        for fcurve in fcurves:
            for kp in fcurve.keyframe_points:
                kp.interpolation = 'LINEAR'

    try:
        for layer in action.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    _apply_linear(cb.fcurves)
        return
    except AttributeError:
        pass

    try:
        _apply_linear(action.fcurves)
    except AttributeError:
        pass
