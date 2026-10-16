#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio - 坐标系转换模块

PDE/Maya 使用 Y-up 右手系: X右, Y上, Z朝向观察者
Blender 使用 Z-up 右手系: X右, Y朝向观察者, Z上

两种模式:
- "yup": 直接使用 PDE 坐标，不做转换（模型在 Blender 中侧躺）
- "zup": 将 PDE 坐标转换为 Blender 坐标（模型正常显示）

Z-up 转换 = 绕 X 轴旋转 +90°:
  位置: (x, y, z) → (x, -z, y)   [Maya Y(上) → Blender Z(上)]
  四元数: q_blender = R @ q_pde @ R⁻¹
  矩阵: M_blender = R @ M_pde @ R⁻¹

其中 R = Quaternion((cos45°, sin45°, 0, 0)) = +90° around X
"""

import mathutils

# +90° around X: Y→Z, Z→-Y (Maya Y-up → Blender Z-up)
YUP_TO_ZUP_QUAT = mathutils.Quaternion((0.70710678, 0.70710678, 0.0, 0.0))
ZUP_TO_YUP_QUAT = YUP_TO_ZUP_QUAT.inverted()

YUP_TO_ZUP_MAT = mathutils.Matrix((
    (1.0, 0.0, 0.0, 0.0),
    (0.0, 0.0, -1.0, 0.0),
    (0.0, 1.0, 0.0, 0.0),
    (0.0, 0.0, 0.0, 1.0),
))
ZUP_TO_YUP_MAT = YUP_TO_ZUP_MAT.inverted()


def convert_position(pos, mode: str = "zup") -> tuple:
    """转换位置坐标

    Args:
        pos: (x, y, z) 在 PDE/Maya Y-up 空间
        mode: "yup" = 直接使用; "zup" = 转换到 Blender Z-up

    Returns:
        (x, y, z) 在 Blender 空间
    """
    if mode == "yup":
        return (pos[0], pos[1], pos[2])
    # zup: (x, y, z) → (x, -z, y)
    return (pos[0], -pos[2], pos[1])


def convert_quaternion(qx: float, qy: float, qz: float, qw: float,
                       mode: str = "zup") -> mathutils.Quaternion:
    """转换四元数 (qx, qy, qz, qw) → Blender Quaternion

    PDE/Maya 存储标准 Hamilton 四元数 (x, y, z, w)。
    - yup: 直接使用 (无需共轭，Maya/Blender 同为标准 Hamilton)
    - zup: 做坐标系旋转 q_blender = R @ q_pde @ R⁻¹

    Returns:
        Blender Quaternion (w, x, y, z)
    """
    q_pde = mathutils.Quaternion((qw, qx, qy, qz))
    if mode == "yup":
        return q_pde
    return YUP_TO_ZUP_QUAT @ q_pde @ ZUP_TO_YUP_QUAT


def convert_matrix(mat: mathutils.Matrix, mode: str = "zup") -> mathutils.Matrix:
    """转换 4x4 变换矩阵

    Args:
        mat: PDE/Maya Y-up 空间的矩阵
        mode: "yup" = 直接使用; "zup" = 转换到 Blender Z-up

    Returns:
        Blender 空间的矩阵
    """
    if mode == "yup":
        return mat.copy()
    return YUP_TO_ZUP_MAT @ mat @ ZUP_TO_YUP_MAT


def convert_direction(vec, mode: str = "zup") -> tuple:
    """转换方向向量（法线、切线、副法线等）

    方向向量不受平移影响，绕 X 轴旋转的变换与位置相同：
      zup: (x, y, z) → (x, -z, y)

    Args:
        vec: PDE/Maya Y-up 空间的方向向量 (x, y, z) 或 Vector
        mode: "yup" = 直接使用; "zup" = 转换到 Blender Z-up

    Returns:
        Blender 空间的方向向量 (x, y, z)
    """
    if mode == "yup":
        return (vec[0], vec[1], vec[2])
    # zup: (x, y, z) → (x, -z, y)
    return (vec[0], -vec[2], vec[1])
