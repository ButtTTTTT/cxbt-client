#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio - 二进制 Skeleton 解析器

从 PDE 引擎的 Skeleton::LoadData() 二进制流解析骨骼数据。

格式（从 Animation.cpp:83-107 逆向确认）:
    uint32 joint_count
    for each joint:
        int32 parent_id
        uint32 name_len; char[name_len] name
    uint32 transform_count
    Transform[transform_count]   -- Vector3(12B) + Quaternion(16B) = 28 bytes/joint
"""

import struct
from typing import List, Tuple
from dataclasses import dataclass

from ...log import get_module_logger

log = get_module_logger("SKEL_BIN")


@dataclass
class PDEJoint:
    """PDE 骨骼关节数据"""
    name: str
    parent_id: int        # -1 = 根骨骼
    position: Tuple[float, float, float]   # 米 (已从厘米转换)
    rotation: Tuple[float, float, float, float]  # (qx, qy, qz, qw)


@dataclass
class PDESkeleton:
    """PDE 骨骼数据"""
    joints: List[PDEJoint]


def parse_skeleton_binary(data: bytes, offset: int = 0) -> PDESkeleton:
    """
    解析 Skeleton::LoadData() 二进制流

    注意: LoadData() 首先调用 Resource::LoadData(stream) 读取 uint32 type，
    所以数据流的第一个 uint32 是资源类型标识（0x0600=kSkeleton），
    真正的骨骼数据从偏移 4 开始。

    Args:
        data: 二进制数据（.cache 解压后的 LoadData 输入流）
        offset: 起始偏移

    Returns:
        PDESkeleton 对象
    """
    pos = offset

    # 跳过 Resource::LoadData 读取的 type 字段（4字节）
    res_type, = struct.unpack_from('<I', data, pos); pos += 4
    log.debug(f"Resource type: 0x{res_type:04x}")

    # 读取关节数量
    joint_count, = struct.unpack_from('<I', data, pos); pos += 4
    log.debug(f"骨骼关节数: {joint_count}")

    # 读取每个关节
    joints = []
    for i in range(joint_count):
        parent_id, = struct.unpack_from('<i', data, pos); pos += 4

        name_len, = struct.unpack_from('<I', data, pos); pos += 4
        name = data[pos:pos + name_len].decode('utf-8', errors='replace')
        pos += name_len

        # 先占位，后面用 transform 填充
        joints.append(PDEJoint(
            name=name,
            parent_id=parent_id,
            position=(0.0, 0.0, 0.0),
            rotation=(0.0, 0.0, 0.0, 1.0),
        ))
        log.debug(f"  关节 {i}: name={name}, parent_id={parent_id}")

    # 读取 Transform 数组
    transform_count, = struct.unpack_from('<I', data, pos); pos += 4
    log.debug(f"Transform 数: {transform_count}")

    if transform_count != joint_count:
        log.warning(f"Transform 数({transform_count}) != 关节数({joint_count})")

    for i in range(min(transform_count, len(joints))):
        # Transform = Vector3(12B) + Quaternion(16B) = 28 bytes
        px, py, pz = struct.unpack_from('<3f', data, pos); pos += 12
        qx, qy, qz, qw = struct.unpack_from('<4f', data, pos); pos += 16

        joints[i].position = (px, py, pz)
        joints[i].rotation = (qx, qy, qz, qw)

        log.debug(f"  Transform {i}: pos=({px:.4f},{py:.4f},{pz:.4f}), "
                   f"rot=({qx:.4f},{qy:.4f},{qz:.4f},{qw:.4f})")

    return PDESkeleton(joints=joints)
