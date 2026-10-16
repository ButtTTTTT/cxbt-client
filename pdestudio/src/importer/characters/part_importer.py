#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 可拆卸部件 + 动画导入

- import_parts: 导入帽子/胸饰/勋章等可拆卸部件 (每个有自己的骨骼)
- import_animation_set: 导入角色动画集
"""

import os

from ...log import get_module_logger

log = get_module_logger("CHAR_PARTS")


def import_parts(props, vfs_root, parts, armature_obj, report_fn) -> int:
    """导入可拆卸部件 (帽子/胸饰等, 每个有自己的骨骼)

    每个部件先独立导入自己的骨骼和 mesh，最后再挂载到目标角色骨骼的
    指定关节上 (joint 字段来自 Lua DetachablePartInfo)。

    Returns:
        成功导入的资源数量
    """
    from ..common import load_and_decode
    from ..binary.skeleton import parse_skeleton_binary
    from ..core.skeleton_builder import import_skeleton_to_blender
    from ..binary.mesh import parse_mesh_binary
    from ..core.mesh_builder import import_mesh_to_blender

    count = 0
    coord_mode = props.import_coord_mode
    scale = props.import_scale

    for dp in parts:
        part_arm = None

        # 1. 部件骨骼
        if dp.get("skeleton"):
            part_arm = _import_part_skeleton(
                props, vfs_root, dp, coord_mode, scale, report_fn)
            if part_arm:
                count += 1

        # 2. 部件模型 (先导入, 此时 part_arm 仍在原点)
        if dp.get("mesh"):
            mesh_obj = _import_part_mesh(
                props, vfs_root, dp, part_arm,
                coord_mode, scale, report_fn)
            if mesh_obj:
                count += 1

        # 3. 挂载到目标骨骼 (骨骼和模型都导入后再挂载)
        if part_arm and armature_obj:
            _parent_to_joint(
                part_arm, armature_obj,
                dp.get("joint"), report_fn)

    return count


def _parent_to_joint(part_arm, armature_obj, joint_name, report_fn):
    """将部件骨骼挂载到目标角色骨骼的指定关节上

    使用 Blender 的骨骼级挂载 (parent_type='BONE')，使部件跟随
    指定骨骼的动画。

    matrix_parent_inverse 的计算使用 PDE rest matrices（存储在 armature
    的 ID property 中），而非 Blender 的 bone.matrix_local。这是因为
    Blender 的 bone.matrix_local 受 vec_roll_to_mat3 限制，可能不等于
    PDE 的 rest matrix，导致挂载位置偏差。

    公式:
        part_arm.world = char_arm.world @ char_rest @ part_rest.inverted()
    其中 char_rest 和 part_rest 分别是角色和部件骨骼中同名 joint 的
    PDE rest world matrix。

    当没有存储的 rest matrices 时，退化为 bone.matrix_local。

    Args:
        part_arm: 部件自己的 Armature 对象
        armature_obj: 目标角色 Armature 对象
        joint_name: 挂载关节名 (来自 Lua .joint 字段, 如 "hat")
        report_fn: Blender report 函数
    """
    import mathutils

    if not armature_obj or armature_obj.type != 'ARMATURE':
        return

    from ..core.skeleton_builder import get_stored_rest_matrices

    bone = None
    if joint_name:
        bone = armature_obj.data.bones.get(joint_name)

    if bone:
        part_arm.parent = armature_obj
        part_arm.parent_type = 'BONE'
        part_arm.parent_bone = bone.name

        # 获取角色骨骼和部件骨骼的 PDE rest matrices
        char_rest = get_stored_rest_matrices(armature_obj)
        part_rest = get_stored_rest_matrices(part_arm)

        char_rest_mat = char_rest.get(joint_name)
        part_rest_mat = part_rest.get(joint_name)

        if char_rest_mat and part_rest_mat:
            # 使用 PDE rest matrices 计算 matrix_parent_inverse
            # part_arm.world = char_arm.world @ char_rest @ part_rest.inverted()
            # bone parenting: part_arm.world = char_arm.world @ bone.matrix_local @ matrix_parent_inverse
            # 所以: matrix_parent_inverse = bone.matrix_local.inverted() @ char_rest @ part_rest.inverted()
            part_arm.matrix_parent_inverse = (
                bone.matrix_local.inverted() @ char_rest_mat @ part_rest_mat.inverted())
            log.info(f"部件挂载到骨骼: {bone.name} @ {armature_obj.name} (PDE rest matrix 对齐)")
        elif part_rest_mat:
            # 只有部件骨骼有 rest matrix
            part_bone = part_arm.data.bones.get(joint_name)
            if part_bone:
                part_arm.matrix_parent_inverse = part_bone.matrix_local.inverted()
                log.info(f"部件挂载到骨骼: {bone.name} @ {armature_obj.name} (部件 bone 对齐)")
            else:
                part_arm.matrix_parent_inverse = mathutils.Matrix.Identity(4)
                log.info(f"部件挂载到骨骼: {bone.name} @ {armature_obj.name} (Identity)")
        else:
            # 回退到 Identity
            part_arm.matrix_parent_inverse = mathutils.Matrix.Identity(4)
            if report_fn:
                report_fn({"WARNING"}, f"部件骨骼中找不到 '{joint_name}' 骨骼，使用原点对齐")
            log.warning(f"部件挂载到骨骼: {bone.name} (回退 Identity)")
    else:
        part_arm.parent = armature_obj
        part_arm.parent_type = 'OBJECT'
        part_arm.matrix_parent_inverse = (
            armature_obj.matrix_world.inverted())
        msg = f"找不到骨骼 '{joint_name}'" if joint_name else "未指定挂载关节"
        if report_fn:
            report_fn({"WARNING"}, f"{msg}，使用对象挂载")
        log.warning(f"{msg}，回退到对象挂载")


def import_animation_set(props, vfs_root, animset,
                          armature_obj, report_fn) -> int:
    """导入动画集 (扫描 animation/character/thirdperson/<animset>/)

    只导入第一个武器目录的动画 (通常是默认武器)。

    Returns:
        成功导入的动画数量
    """
    anim_dir = os.path.join(vfs_root, "animation", "character",
                            "thirdperson", animset)
    if not os.path.isdir(anim_dir):
        anim_dir = os.path.join(vfs_root, "animation", "character",
                                "firstperson", animset)

    if not os.path.isdir(anim_dir):
        if report_fn:
            report_fn({"WARNING"}, f"动画集目录不存在: {animset}")
        return 0

    # 收集所有子目录 (武器变体)
    weapon_dirs = [name for name in sorted(os.listdir(anim_dir))
                   if os.path.isdir(os.path.join(anim_dir, name))]

    if not weapon_dirs:
        return 0

    # 只导入第一个武器目录的动画
    first_weapon = weapon_dirs[0]
    weapon_path = os.path.join(anim_dir, first_weapon)

    from ..common import load_and_decode
    from ..binary.animation import parse_animation_binary
    from ..core.animation_builder import import_animation_to_blender

    count = 0
    coord_mode = props.import_coord_mode
    scale = props.import_scale

    for fname in sorted(os.listdir(weapon_path)):
        if not (fname.endswith(".anim.cache") or fname.endswith(".anim")):
            continue

        anim_path = os.path.join(weapon_path, fname)
        try:
            vfs_path = (
                f"/animation/character/thirdperson/"
                f"{animset}/{first_weapon}/{fname}"
            )
            header, data = load_and_decode(
                anim_path, vfs_path=vfs_path,
                verify_crc=props.import_verify_crc)
            anim = parse_animation_binary(data)

            anim_name = fname
            for ext in [".anim.cache", ".anim"]:
                if anim_name.endswith(ext):
                    anim_name = anim_name[:-len(ext)]

            action = import_animation_to_blender(
                anim, armature_obj=armature_obj,
                action_name=anim_name, scale=scale,
                coord_mode=coord_mode)
            if action:
                count += 1
        except Exception as e:
            if report_fn:
                report_fn({"WARNING"}, f"动画导入失败 {fname}: {e}")

    return count


# =============================================================================
# 内部: 部件骨骼导入
# =============================================================================

def _import_part_skeleton(props, vfs_root, dp,
                           coord_mode, scale, report_fn):
    """导入部件自己的骨骼"""
    from ..common import load_and_decode, resolve_vfs_file
    from ..binary.skeleton import parse_skeleton_binary
    from ..core.skeleton_builder import import_skeleton_to_blender

    skel_vfs = dp["skeleton"]
    rel = skel_vfs.lstrip("/").replace("/", os.sep)
    skel_path = resolve_vfs_file(
        os.path.join(vfs_root, rel), [".cache", ""])

    if not skel_path:
        if report_fn:
            report_fn({"WARNING"}, f"找不到部件骨骼: {skel_vfs}")
        return None

    try:
        header, sd = load_and_decode(
            skel_path, vfs_path=skel_vfs,
            verify_crc=props.import_verify_crc)
        skel = parse_skeleton_binary(sd)
        skel_name = os.path.splitext(os.path.basename(skel_path))[0]
        if skel_name.endswith(".skel"):
            skel_name = skel_name[:-5]
        skel_name = f"{skel_name}_{dp.get('joint', 'part')}"

        result = import_skeleton_to_blender(
            skel, name=skel_name, scale=scale, coord_mode=coord_mode)
        if isinstance(result, tuple):
            return result[0]
        return result
    except Exception as e:
        if report_fn:
            report_fn({"WARNING"}, f"部件骨骼失败 {skel_vfs}: {e}")
        return None


# =============================================================================
# 内部: 部件模型导入
# =============================================================================

def _import_part_mesh(props, vfs_root, dp, part_arm,
                       coord_mode, scale, report_fn):
    """导入部件的 mesh

    Lua 中的相对路径如 prop/fatman/cap_001.mesh，
    实际 VFS 路径为 /mesh/character/thirdperson/prop/fatman/cap_001.mesh
    """
    from ..common import load_and_decode, resolve_vfs_file
    from ..binary.mesh import parse_mesh_binary
    from ..core.mesh_builder import import_mesh_to_blender

    mesh_vfs = dp["mesh"]

    # prop/ 开头的路径 → /mesh/character/thirdperson/prop/
    if mesh_vfs.startswith("/mesh/prop/"):
        tp_vfs = mesh_vfs.replace("/mesh/prop/", "/mesh/character/thirdperson/prop/", 1)
    elif mesh_vfs.startswith("prop/") and not mesh_vfs.startswith("/"):
        tp_vfs = f"/mesh/character/thirdperson/{mesh_vfs}"
    else:
        tp_vfs = mesh_vfs

    rel = tp_vfs.lstrip("/").replace("/", os.sep)
    mesh_path = resolve_vfs_file(
        os.path.join(vfs_root, rel), [".cache", ""])

    # fallback: 尝试原始 /mesh/prop/ 路径
    if not mesh_path:
        rel_orig = mesh_vfs.lstrip("/").replace("/", os.sep)
        mesh_path = resolve_vfs_file(
            os.path.join(vfs_root, rel_orig), [".cache", ""])

    if not mesh_path:
        if report_fn:
            report_fn({"WARNING"}, f"找不到部件 mesh: {tp_vfs}")
        log.warning(f"Part mesh not found: {tp_vfs} (tried {mesh_vfs} too)")
        return None

    try:
        header, md = load_and_decode(
            mesh_path, vfs_path=tp_vfs,
            verify_crc=props.import_verify_crc)
        mesh_data = parse_mesh_binary(md)
        name = os.path.splitext(os.path.basename(mesh_path))[0]
        if name.endswith(".mesh"):
            name = name[:-5]
        name = f"{name}_{dp.get('joint', 'part')}"

        return import_mesh_to_blender(
            mesh_data, name=name, scale=scale,
            armature_obj=part_arm, vfs_root=vfs_root,
            coord_mode=coord_mode)
    except Exception as e:
        if report_fn:
            report_fn({"WARNING"}, f"部件 mesh 失败 {tp_vfs}: {e}")
        log.error(f"Part mesh import failed {tp_vfs}: {e}")
        return None
