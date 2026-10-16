#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio 导出工具模块

提供导出器共用的坐标转换、导出路径推导、骨骼 rest matrix 获取等功能。

坐标转换策略:
  导入时 (importer/coordinate.py): PDE Y-up → Blender Z-up
  导出时 (本模块): Blender Z-up → PDE Y-up

  Z-up → Y-up 转换 = 绕 X 轴 -90°:
    位置:   (x, y, z) → (x, z, -y)
    四元数: q_pde = R⁻¹ @ q_blender @ R
    矩阵:   M_pde = R⁻¹ @ M_blender @ R
    方向:   (x, y, z) → (x, z, -y)  (仅旋转，无平移)

参考: importer/coordinate.py (导入时的正向转换)
      tc/editor/export/exportMesh.cpp (Maya 导出器，Y-up 无需转换)
"""

import os
import mathutils
from typing import Optional, Dict

import bpy

from ..log import get_module_logger

log = get_module_logger("EXPORT_UTILS")

# =============================================================================
# 坐标转换常量 (与 importer/coordinate.py 对称)
# =============================================================================

# 导入: Y-up → Z-up = +90° around X
YUP_TO_ZUP_QUAT = mathutils.Quaternion((0.70710678, 0.70710678, 0.0, 0.0))
# 导出: Z-up → Y-up = -90° around X
ZUP_TO_YUP_QUAT = YUP_TO_ZUP_QUAT.inverted()

YUP_TO_ZUP_MAT = mathutils.Matrix((
    (1.0, 0.0, 0.0, 0.0),
    (0.0, 0.0, -1.0, 0.0),
    (0.0, 1.0, 0.0, 0.0),
    (0.0, 0.0, 0.0, 1.0),
))
ZUP_TO_YUP_MAT = YUP_TO_ZUP_MAT.inverted()


# =============================================================================
# 坐标转换函数 (Blender → PDE)
# =============================================================================

def convert_position_to_pde(pos, coord_mode: str = "zup") -> tuple:
    """Blender 位置 → PDE 位置

    Args:
        pos: Blender 空间位置 (x, y, z) 或 Vector
        coord_mode: "zup"=转换; "yup"=直接使用

    Returns:
        PDE 空间位置 (x, y, z)
    """
    if coord_mode == "yup":
        return (pos[0], pos[1], pos[2])
    # zup → yup: (x, y, z) → (x, z, -y)
    return (pos[0], pos[2], -pos[1])


def convert_quaternion_to_pde(qx: float, qy: float, qz: float, qw: float,
                              coord_mode: str = "zup") -> tuple:
    """Blender 四元数 → PDE 四元数

    Args:
        qx, qy, qz, qw: Blender 四元数分量
        coord_mode: "zup"=转换; "yup"=直接使用

    Returns:
        PDE 四元数 (qx, qy, qz, qw)
    """
    if coord_mode == "yup":
        return (qx, qy, qz, qw)
    q_blender = mathutils.Quaternion((qw, qx, qy, qz))
    q_pde = ZUP_TO_YUP_QUAT @ q_blender @ YUP_TO_ZUP_QUAT
    return (q_pde.x, q_pde.y, q_pde.z, q_pde.w)


def convert_direction_to_pde(vec, coord_mode: str = "zup") -> tuple:
    """Blender 方向向量 → PDE 方向向量（仅旋转，无平移）

    用于法线、切线、副法线等方向向量。

    Args:
        vec: Blender 空间方向向量 (x, y, z) 或 Vector
        coord_mode: "zup"=转换; "yup"=直接使用

    Returns:
        PDE 空间方向向量 (x, y, z)
    """
    if coord_mode == "yup":
        return (vec[0], vec[1], vec[2])
    # zup → yup: (x, y, z) → (x, z, -y)
    return (vec[0], vec[2], -vec[1])


# =============================================================================
# 骨骼数据获取
# =============================================================================

def get_armature_coord_mode(armature_obj: bpy.types.Object) -> str:
    """获取骨骼导入时使用的坐标模式

    Args:
        armature_obj: Armature 对象

    Returns:
        "zup" 或 "yup"，未存储时默认 "zup"
    """
    return armature_obj.get("pde_coord_mode", "zup")


def get_pde_rest_world_matrices(armature_obj: bpy.types.Object) -> Dict[str, mathutils.Matrix]:
    """从 armature 对象读取存储的 PDE rest world matrices

    这些矩阵在骨骼导入时存储 (import_skel.py)，是 Blender 空间的世界矩阵。
    导出时使用这些矩阵而非 bone.matrix_local，因为 bone.tail 指向子骨骼
    导致 matrix_local ≠ PDE rest matrix。

    Returns:
        骨骼名 → Blender 空间世界矩阵的字典，无存储时返回空字典
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


# =============================================================================
# 导出路径工具
# =============================================================================

def get_pexport_dir(context) -> Optional[str]:
    """根据 vfs_root 推导 pexport 目录

    pexport = vfs_root 的上级目录 + "/pexport"

    例如:
        vfs_root = "D:\\Games\\FC1.0.6.8166\\finalcombat_cache="
        pexport  = "D:\\Games\\FC1.0.6.8166\\pexport"

    Returns:
        pexport 目录路径，无法确定时返回 None
    """
    vfs_root = _get_vfs_root(context)
    if not vfs_root:
        return None

    parent_dir = os.path.dirname(vfs_root.rstrip(os.sep))
    if not parent_dir:
        return None

    return os.path.join(parent_dir, "pexport")


def build_mesh_export_path(
    context, sub_dir: str, name: str, ext: str = "mesh"
) -> str:
    """构建 mesh 导出路径

    对应原版 MEL: $path + "mesh/" + sub_dir + name

    Args:
        context: Blender 上下文
        sub_dir: mesh 下的子目录路径 (如 "scene/", "character/firstPerson/male/")
        name: 文件名 (不含扩展名)
        ext: 扩展名 (默认 "mesh")

    Returns:
        完整导出路径
    """
    pexport_dir = get_pexport_dir(context)
    full_dir = os.path.join(pexport_dir, "mesh", sub_dir) if pexport_dir \
        else os.path.join("mesh", sub_dir)
    os.makedirs(full_dir, exist_ok=True)
    return os.path.join(full_dir, f"{name}.{ext}")


def derive_vfs_prefix(filepath: str, pexport_dir: str,
                      default: str = "/mesh/") -> str:
    """从导出文件路径推导 VFS 前缀

    策略: 优先在文件路径中查找 /mesh/ 起点（与 derive_mesh_vfs_dir 一致），
    这样无论导出到 data/ 还是 pexport/ 都能正确推导 VFS 路径。

    例如:
        filepath = "D:\\Games\\FC1.0.6.8166\\data\\mesh\\scene\\level1\\scene.mesh"
        → "/mesh/scene/level1/"

    Args:
        filepath: 导出文件路径
        pexport_dir: pexport 根目录（仅作退化用）
        default: 无法推导时的默认前缀

    Returns:
        VFS 路径前缀 (如 "/mesh/scene/level1/")
    """
    # 优先: 查找 /mesh/ 起点
    vfs_dir = derive_mesh_vfs_dir(filepath)
    if vfs_dir:
        return vfs_dir

    # 退化: 用 pexport_dir 推导
    if pexport_dir:
        try:
            rel = os.path.relpath(os.path.dirname(filepath), pexport_dir)
            rel = rel.replace("\\", "/").strip("/")
            if rel and rel != ".":
                return "/" + rel + "/"
        except ValueError:
            pass
    return default


def derive_mesh_vfs_dir(filepath: str) -> str:
    """从导出文件路径推导 mesh 的 VFS 目录路径

    Material::Load(Lua) 用 mesh 目录 + 贴图名拼接贴图路径,
    贴图引用需要是相对于 mesh 目录的路径。

    策略: 在文件路径中查找 /mesh/ 起点, 从那里截取 VFS 路径。

    例如:
        filepath = "D:\\Games\\FC1.0.6.8166\\data\\mesh\\scene\\level1\\scene.mesh"
        → VFS 目录 = "/mesh/scene/level1/"

    Args:
        filepath: 导出文件路径

    Returns:
        VFS 目录路径 (如 /mesh/scene/level1/)，无法推导时返回空字符串
    """
    path = filepath.replace("\\", "/")
    idx = path.lower().find("/mesh/")
    if idx >= 0:
        vfs_path = path[idx:]
        vfs_dir = os.path.dirname(vfs_path) + "/"
        return vfs_dir
    return ""


def _get_vfs_root(context) -> Optional[str]:
    """从场景属性或偏好设置获取 vfs_root"""
    # 场景属性
    if hasattr(context.scene, 'pde_studio_props'):
        vfs_root = context.scene.pde_studio_props.import_vfs_root
        if vfs_root:
            return vfs_root

    # 偏好设置
    for addon_name in context.preferences.addons.keys():
        if 'pde_studio' in addon_name.lower() or 'pdestudio' in addon_name.lower():
            prefs = context.preferences.addons[addon_name].preferences
            if prefs and hasattr(prefs, 'vfs_root'):
                return prefs.vfs_root or None

    return None


# =============================================================================
# 骨骼/动画路径构建 (对齐原版 MEL 路径规范)
# =============================================================================

def build_skel_export_path(
    context, skel_type: str, name: str
) -> str:
    """构建骨骼导出路径

    对应原版 MEL 路径规范:
        角色骨骼: skeleton/character/<name>.skel
        道具骨骼: skeleton/prop/<name>.skel

    Args:
        context: Blender 上下文
        skel_type: "character" 或 "prop"
        name: 角色名或道具名

    Returns:
        完整导出路径
    """
    pexport_dir = get_pexport_dir(context)
    sub_dir = os.path.join("skeleton", skel_type)
    if pexport_dir:
        full_dir = os.path.join(pexport_dir, sub_dir)
    else:
        full_dir = sub_dir
    os.makedirs(full_dir, exist_ok=True)
    return os.path.join(full_dir, f"{name}.skel")


def build_anim_export_path(
    context,
    anim_type: str,
    char_or_weapon: str,
    anim_name: str,
    weapon: str = "",
) -> str:
    """构建动画导出路径

    对应原版 MEL 路径规范:
        FP 角色动画: animation/character/firstPerson/<char>/<weapon>/<anim>.anim
        TP 角色动画: animation/character/thirdPerson/<char>/<weapon>/<anim>.anim
        FP 道具动画: animation/prop/firstperson/<weapon>/<anim>.anim
        TP 道具动画: animation/prop/thirdperson/<weapon>/<anim>.anim

    Args:
        context: Blender 上下文
        anim_type: "char_fp", "char_tp", "prop_fp", "prop_tp"
        char_or_weapon: 角色名 (char_*) 或武器名 (prop_*)
        anim_name: 动画名
        weapon: 武器名 (仅 char_* 需要，道具用 char_or_weapon 作为武器名)

    Returns:
        完整导出路径
    """
    pexport_dir = get_pexport_dir(context)

    if anim_type == "char_fp":
        sub_dir = os.path.join(
            "animation", "character", "firstPerson", char_or_weapon, weapon
        )
    elif anim_type == "char_tp":
        sub_dir = os.path.join(
            "animation", "character", "thirdPerson", char_or_weapon, weapon
        )
    elif anim_type == "prop_fp":
        sub_dir = os.path.join(
            "animation", "prop", "firstperson", char_or_weapon
        )
    elif anim_type == "prop_tp":
        sub_dir = os.path.join(
            "animation", "prop", "thirdperson", char_or_weapon
        )
    else:
        sub_dir = os.path.join("animation", anim_type)

    if pexport_dir:
        full_dir = os.path.join(pexport_dir, sub_dir)
    else:
        full_dir = sub_dir
    os.makedirs(full_dir, exist_ok=True)
    return os.path.join(full_dir, f"{anim_name}.anim")
