#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio - Animation 导出器

将 Blender Action/Armature 动画导出为 PDE 引擎的明文 .anim 格式（Lua 表）。

结构:
    Tracks = {
        { Node="bone", Property="rotateQuaternion", FrameCount=N,
          FrameData={qx,qy,qz,qw, ...} },
        { Node="bone", Property="translate", FrameCount=N,
          FrameData={x,y,z, ...} },
    }

关键修复 (对齐 Maya 导出器 tc/editor/export/exportAnimation.cpp):
    1. 逆向公式: anim_world = pose_world @ bone.matrix_local⁻¹ @ rest_world_pde
       这是导入公式 target_world = anim_world @ rest_world⁻¹ @ bone.matrix_local
       的逆向推导。
    2. Blender Z-up → PDE Y-up 坐标系逆向转换
    3. 四元数连续性: 相邻帧点积 < 0 则取反 (匹配导入器)
    4. Track 顺序: rotateQuaternion 先于 translate (匹配 Maya)
"""

import os
import bpy
from mathutils import Matrix, Quaternion
from typing import Optional, Dict, List

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

log = get_module_logger("ANIM")

PDE_ANIM_FPS = 96.0


def _sample_animation(
    armature: bpy.types.Object,
    action: bpy.types.Action,
    fps: float = 96.0,
    scale: float = 100.0,
    start_frame: int = 0,
    end_frame: int = 0,
    sample_mode: str = "frame",
) -> Optional[dict]:
    """采样动画数据

    使用逆向公式从 Blender pose 矩阵还原 PDE 动画值:
      anim_world = pose_world @ bone.matrix_local⁻¹ @ rest_world_pde
      anim_local = parent_anim_world⁻¹ @ anim_world

    然后分解为位置和四元数，做坐标系逆向转换。

    退化情况: 若无存储 rest matrices，rest_world = bone.matrix_local，
      公式退化为 anim_world = pose_world，即直接使用 pose 矩阵。
    """
    # 确定帧范围
    if start_frame == 0 and end_frame == 0:
        if action.frame_range:
            start_frame = int(action.frame_range[0])
            end_frame = int(action.frame_range[1])
        else:
            start_frame = int(bpy.context.scene.frame_start)
            end_frame = int(bpy.context.scene.frame_end)
    elif start_frame == 0:
        start_frame = int(bpy.context.scene.frame_start)
    elif end_frame == 0:
        end_frame = int(bpy.context.scene.frame_end)

    log.info(f"采样范围: {start_frame}-{end_frame} 帧, FPS: {fps}")

    coord_mode = get_armature_coord_mode(armature)
    pde_rest_world = get_pde_rest_world_matrices(armature)
    has_rest = len(pde_rest_world) > 0
    if not has_rest:
        log.warning("未找到 PDE rest matrices，退化为直接使用 pose 矩阵")

    # 骨骼层级
    bone_names = [b.name for b in armature.data.bones]
    bone_parent: Dict[str, Optional[str]] = {}
    for bone in armature.data.bones:
        bone_parent[bone.name] = bone.parent.name if bone.parent else None
    bone_order = _topological_sort(bone_names, bone_parent)

    # 预计算 rest 相关矩阵
    bml = {}       # bone.matrix_local
    bml_inv = {}   # bone.matrix_local⁻¹
    rest_world = {}  # PDE rest world (Blender 空间)

    for bone in armature.data.bones:
        name = bone.name
        mat = bone.matrix_local.copy()
        bml[name] = mat
        bml_inv[name] = mat.inverted()
        rest_world[name] = pde_rest_world.get(name, mat)

    # 初始化数据存储
    anim_data = {n: {"translate": [], "rotate": []} for n in bone_names}
    prev_quats: Dict[str, Optional[tuple]] = {n: None for n in bone_names}

    # 保存状态
    original_frame = bpy.context.scene.frame_current
    original_action = armature.animation_data.action if armature.animation_data else None
    if not armature.animation_data:
        armature.animation_data_create()
    armature.animation_data.action = action

    try:
        # 确定采样帧列表
        if sample_mode == "key":
            sample_frames = _get_keyframe_times(action, start_frame, end_frame)
        else:
            step = bpy.context.scene.render.fps / fps * bpy.context.scene.render.fps_base
            sample_frames = []
            t = float(start_frame)
            while t <= end_frame:
                sample_frames.append(t)
                t += step
        if len(sample_frames) < 2:
            sample_frames = [float(start_frame), float(end_frame)]

        # 逐帧采样
        for frame_time in sample_frames:
            bpy.context.scene.frame_set(int(round(frame_time)))
            depsgraph = bpy.context.evaluated_depsgraph_get()
            depsgraph.update()

            # 获取 pose world 矩阵
            pose_world = {}
            for pbone in armature.pose.bones:
                pose_world[pbone.name] = pbone.matrix.copy()

            # 逆向公式: anim_world = pose_world @ bml⁻¹ @ rest_world
            anim_world = {}
            for name in bone_order:
                pw = pose_world.get(name)
                if pw is None:
                    continue
                anim_world[name] = pw @ bml_inv[name] @ rest_world[name]

            # 层级组合: anim_local = parent_anim_world⁻¹ @ anim_world
            anim_local = {}
            for name in bone_order:
                pn = bone_parent.get(name)
                if pn and pn in anim_world:
                    anim_local[name] = anim_world[pn].inverted() @ anim_world[name]
                else:
                    anim_local[name] = anim_world[name].copy()

            # 分解 + 坐标转换
            for name in bone_names:
                if name not in anim_local:
                    continue

                loc_b, quat_b, _ = anim_local[name].decompose()

                px, py, pz = convert_position_to_pde(loc_b, coord_mode)
                qx, qy, qz, qw = convert_quaternion_to_pde(
                    quat_b.x, quat_b.y, quat_b.z, quat_b.w, coord_mode)

                px = round(px * scale, 6)
                py = round(py * scale, 6)
                pz = round(pz * scale, 6)

                anim_data[name]["translate"].extend([px, py, pz])

                # 四元数连续性: 相邻帧点积 < 0 则取反
                prev = prev_quats[name]
                if prev is not None:
                    dot = qx*prev[0] + qy*prev[1] + qz*prev[2] + qw*prev[3]
                    if dot < 0:
                        qx, qy, qz, qw = -qx, -qy, -qz, -qw
                prev_quats[name] = (qx, qy, qz, qw)

                anim_data[name]["rotate"].extend([qx, qy, qz, qw])

        return {
            "anim_data": anim_data,
            "frame_count": len(sample_frames),
            "bone_names": bone_names,
        }

    finally:
        bpy.context.scene.frame_set(original_frame)
        if armature.animation_data:
            armature.animation_data.action = original_action


def _topological_sort(bone_names, bone_parent) -> List[str]:
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

    for name in bone_names:
        visit(name)
    return order


def _get_keyframe_times(action, start: int, end: int) -> list:
    """从 Action 的 F-Curves 提取关键帧时间点"""
    times = set()
    for fcurve in action.fcurves:
        for kp in fcurve.keyframe_points:
            t = kp.co.x
            if start <= t <= end:
                times.add(t)
    if not times:
        times = {float(start), float(end)}
    result = sorted(times)
    if result[0] > start:
        result.insert(0, float(start))
    if result[-1] < end:
        result.append(float(end))
    return result


def _build_tracks(anim_data: dict, frame_count: int, bone_names: list) -> list:
    """构建 PDE .anim 格式的 Tracks 列表

    Track 顺序匹配 Maya: rotateQuaternion 先于 translate。
    """
    tracks = []
    for name in bone_names:
        data = anim_data.get(name)
        if not data:
            continue
        rotate_data = data.get("rotate", [])
        translate_data = data.get("translate", [])

        if rotate_data:
            tracks.append({
                "Node": name,
                "Property": "rotateQuaternion",
                "FrameCount": frame_count,
                "FrameData": rotate_data,
            })
        if translate_data:
            tracks.append({
                "Node": name,
                "Property": "translate",
                "FrameCount": frame_count,
                "FrameData": translate_data,
            })
    return tracks


def export_anim(
    context,
    filepath: str,
    fps: float = 96.0,
    scale: float = 100.0,
    sample_mode: str = "frame",
    start_frame: int = 0,
    end_frame: int = 0,
) -> bool:
    """导出 Animation 为 PDE .anim 格式"""
    armature = _find_armature(context)
    if not armature:
        log.warning("未找到 Armature 对象")
        return False

    action = _get_action(armature)
    if not action:
        log.warning("未找到活动动作（Action）")
        return False

    log.info(f"导出 Animation: {armature.name} - Action: {action.name}")

    if context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')

    result = _sample_animation(
        armature, action, fps, scale, start_frame, end_frame, sample_mode)
    if not result:
        log.error("动画采样失败")
        return False

    tracks = _build_tracks(result["anim_data"], result["frame_count"],
                           result["bone_names"])
    if not tracks:
        log.warning("Tracks 数据为空")
        return False

    lua_table = {"Tracks": tracks}

    anim_name = os.path.splitext(os.path.basename(filepath))[0]
    success = lua_table_to_file(
        lua_table, filepath,
        header_comment=f"PDE Studio - Animation Export: {anim_name}",
    )

    if success:
        pexport_dir = get_pexport_dir(context)
        vfs_prefix = derive_vfs_prefix(filepath, pexport_dir or "")
        generate_build_scripts(
            mesh_name=anim_name,
            export_dir=os.path.dirname(filepath),
            vfs_prefix=vfs_prefix,
            has_skel=True,
            has_anim=True,
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


def _get_action(armature):
    """获取活动 Action（从 animation_data 或 NLA 获取）"""
    if armature.animation_data and armature.animation_data.action:
        return armature.animation_data.action
    if armature.animation_data and armature.animation_data.nla_tracks:
        for nla_track in armature.animation_data.nla_tracks:
            for strip in nla_track.strips:
                if strip.action:
                    return strip.action
    return None
