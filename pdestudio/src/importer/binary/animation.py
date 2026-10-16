#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio - 二进制 Animation 解析器

从 PDE 引擎的 AnimationTrack::Load() 二进制流解析动画数据。

格式（从 Animation.cpp:1157-1191 逆向确认）:
    uint32 res_type
    uint32 joint_count
    for each joint:
        uint32 name_len; char[name_len] name
        uint32 frame_count
        uint32 data_len (float count, NOT byte count!)
        float[data_len]  (每帧 7 个 float: tx,ty,tz,qx,qy,qz,qw)
"""

import struct
from typing import List, Tuple
from dataclasses import dataclass

from ...log import get_module_logger

log = get_module_logger("ANIM_BIN")


@dataclass
class PDEAnimTrack:
    name: str
    frame_count: int
    frames: List[Tuple[float, float, float, float, float, float, float]]


@dataclass
class PDEAnimation:
    tracks: List[PDEAnimTrack]

    @property
    def frame_count(self) -> int:
        if not self.tracks:
            return 0
        return max(t.frame_count for t in self.tracks)

    @property
    def duration(self) -> float:
        return (self.frame_count - 1) / 96.0 if self.frame_count > 0 else 0.0


def parse_animation_binary(data: bytes, offset: int = 0) -> PDEAnimation:
    pos = offset

    # 跳过 Resource::LoadData 读取的 type 字段（4字节）
    # Animation::LoadData 也先调用 Resource::LoadData(stream)
    res_type, = struct.unpack_from('<I', data, pos); pos += 4
    log.debug(f"Resource type: 0x{res_type:04x}")

    joint_count, = struct.unpack_from('<I', data, pos); pos += 4
    log.debug(f"动画轨道数: {joint_count}")

    tracks = []
    for i in range(joint_count):
        name_len, = struct.unpack_from('<I', data, pos); pos += 4
        name = data[pos:pos + name_len].decode('utf-8', errors='replace')
        pos += name_len

        frame_count, = struct.unpack_from('<I', data, pos); pos += 4
        data_len, = struct.unpack_from('<I', data, pos); pos += 4

        # data_len 是 float 数量（不是字节数）
        float_count = data_len
        floats = struct.unpack_from(f'<{float_count}f', data, pos)
        pos += data_len * 4

        frames = []
        floats_per_frame = 7
        num_frames = float_count // floats_per_frame

        for f_idx in range(num_frames):
            base = f_idx * floats_per_frame
            tx, ty, tz = floats[base], floats[base + 1], floats[base + 2]
            qx, qy, qz, qw = floats[base + 3], floats[base + 4], floats[base + 5], floats[base + 6]
            frames.append((tx, ty, tz, qx, qy, qz, qw))

        tracks.append(PDEAnimTrack(
            name=name,
            frame_count=frame_count,
            frames=frames,
        ))
        log.debug(f"  轨道 {i}: {name}, {frame_count} 帧, {num_frames} 解交织帧")

    return PDEAnimation(tracks=tracks)
