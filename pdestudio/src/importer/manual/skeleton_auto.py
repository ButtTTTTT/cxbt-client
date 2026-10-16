#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 蒙皮网格自动骨骼推导与导入

从 mesh VFS 路径推导可能的 skeleton 路径并自动导入。
仅用于手动导入 mesh 时的自动骨骼关联。
"""

import os

from ...log import get_module_logger
from ..common import load_and_decode, resolve_vfs_file

log = get_module_logger("SKEL_AUTO")


def derive_skeleton_candidates(mesh_vfs_path: str) -> list:
    """从 mesh VFS 路径推导可能的 skeleton VFS 路径列表

    PDE 引擎中 skeleton 文件存放在 /skeleton/ 扁平目录中，命名约定：
    - 角色FP: /mesh/character/firstperson/{char}_xxx/ → /skeleton/{char}_fp_skeleton.skel
    - 角色TP: /mesh/character/thirdperson/{char}_xxx/ → /skeleton/{char}_tp_skeleton.skel
    - 武器:   /mesh/prop/weapon/{name}/             → /skeleton/{name}skeleton.skel
    - 场景道具: /mesh/scene/sceneprop/{name}/        → /skeleton/{name}skeleton.skel
    """
    parts = mesh_vfs_path.strip('/').split('/')
    if len(parts) < 2:
        return []

    candidates = []

    if len(parts) >= 5 and parts[0] == 'mesh' and parts[1] == 'character':
        view = parts[2]
        char_dir = parts[3]

        char_base = char_dir
        if '_' in char_dir:
            last_part = char_dir.rsplit('_', 1)[-1]
            if last_part.isdigit():
                char_base = char_dir.rsplit('_', 1)[0]

        if view == 'firstperson':
            candidates.append(f"/skeleton/{char_base}_fp_skeleton.skel")
        elif view == 'thirdperson':
            candidates.append(f"/skeleton/{char_base}_tp_skeleton.skel")

    elif len(parts) >= 5 and parts[0] == 'mesh' and parts[1] == 'prop' and parts[2] == 'weapon':
        name = parts[3]
        candidates.append(f"/skeleton/{name}skeleton.skel")

    elif len(parts) >= 5 and parts[0] == 'mesh' and parts[1] == 'scene' and parts[2] == 'sceneprop':
        name = parts[3]
        candidates.append(f"/skeleton/{name}skeleton.skel")

    if len(parts) >= 3:
        dir_name = parts[-2]
        candidates.append(f"/skeleton/{dir_name}skeleton.skel")
        candidates.append(f"/skeleton/{dir_name}_skeleton.skel")

    return candidates


def try_import_skeleton(mesh_vfs_path: str, vfs_root: str,
                         scale: float = 1.0,
                         align_to_origin: bool = False,
                         coord_mode: str = "zup"):
    """尝试自动查找并导入 skeleton 文件

    Returns:
        (armature_obj, skel_vfs_path, bone_world_matrices) 元组，
        失败返回 (None, None, None)
    """
    if not vfs_root:
        return None, None, None

    candidates = derive_skeleton_candidates(mesh_vfs_path)
    if not candidates:
        return None, None, None

    for skel_vfs_path in candidates:
        rel_path = skel_vfs_path.lstrip('/')
        local_base = os.path.join(vfs_root, rel_path.replace('/', os.sep))

        for suffix in ['.cache', '']:
            skel_path = local_base + suffix
            if os.path.isfile(skel_path):
                log.info(f"找到 skeleton: {skel_path}")
                try:
                    header, skel_data = load_and_decode(
                        skel_path, vfs_path=skel_vfs_path, verify_crc=False)

                    from ..binary.skeleton import parse_skeleton_binary
                    from ..core.skeleton_builder import import_skeleton_to_blender

                    skel = parse_skeleton_binary(skel_data)

                    skel_name = os.path.splitext(
                        os.path.basename(skel_path))[0]
                    if skel_name.endswith('.skel'):
                        skel_name = skel_name[:-5]

                    arm_obj_result = import_skeleton_to_blender(
                        skel, name=skel_name, scale=scale,
                        align_to_origin=align_to_origin,
                        coord_mode=coord_mode)

                    if isinstance(arm_obj_result, tuple):
                        arm_obj = arm_obj_result[0]
                        bone_world_matrices = arm_obj_result[1]
                    else:
                        arm_obj = arm_obj_result
                        bone_world_matrices = None

                    if arm_obj:
                        log.info(f"自动导入骨骼成功: {skel_name} ({len(skel.joints)} joints)")
                        return arm_obj, skel_vfs_path, bone_world_matrices
                except Exception as e:
                    log.warning(f"导入 skeleton 失败: {skel_path} - {e}")
                    continue

    log.info(f"未找到匹配的 skeleton 文件 (候选: {candidates})")
    return None, None, None
