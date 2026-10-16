#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 场景清理工具

清理 Blender 中未使用的数据（网格、材质、贴图、骨骼、动画等）。
移植自 PDEModelTools 的 PMT_OT_CleanupUnusedData。
"""

import bpy
from bpy.types import Operator

from ...log import get_module_logger

log = get_module_logger("CLEANUP")

# 场景属性中引用 Object 的 PointerProperty 名称列表
# 这些引用会阻止 orphans_purge 删除对应对象
_ARMATURE_PROPS = (
    "char_sel_anim_armature",
    "char_sel_part_armature",
)


class PDE_OT_CleanupUnusedData(Operator):
    """Delete all unused data (meshes, materials, images, armatures, actions)"""

    bl_idname = "pde_studio.cleanup_unused_data"
    bl_label = "清理未使用数据"
    bl_options = {'REGISTER', 'INTERNAL'}

    def execute(self, context):
        try:
            # 清理前统计
            stats_before = _count_data()

            # 清除指向已不在场景中的对象的 PointerProperty 引用
            _clear_stale_armature_refs(context)

            # 执行清理（递归多次确保彻底）
            bpy.ops.outliner.orphans_purge(
                do_local_ids=True, do_linked_ids=True)
            for _ in range(3):
                bpy.ops.outliner.orphans_purge()

            # 清理后统计
            stats_after = _count_data()

            # 构建报告
            diffs = {k: stats_before[k] - stats_after[k]
                      for k in stats_before}
            parts = []
            for key in ("objects", "meshes", "materials",
                        "textures", "images", "armatures", "actions"):
                if diffs[key] > 0:
                    parts.append(f"{key}: {diffs[key]}")

            msg = "Cleanup: " + ", ".join(parts) if parts else "Nothing to clean"
            self.report({"INFO"}, msg)
            log.info(msg)

            return {"FINISHED"}

        except Exception as e:
            self.report({"ERROR"}, f"Cleanup failed: {e}")
            log.error(f"Cleanup failed: {e}")
            return {"CANCELLED"}


def _clear_stale_armature_refs(context):
    """清除指向已不在任何场景中的对象的 PointerProperty 引用

    当用户删除场景中的对象后，PointerProperty 仍可能持有引用，
    导致该对象无法被 orphans_purge 清理。
    """
    props = context.scene.pde_studio_props
    # 收集所有场景中实际存在的对象
    scene_objects = set(context.scene.objects)

    for prop_name in _ARMATURE_PROPS:
        ref = getattr(props, prop_name, None)
        if ref is not None and ref not in scene_objects:
            log.debug(f"Clearing stale reference: {prop_name} -> {ref.name}")
            setattr(props, prop_name, None)


def _count_data() -> dict:
    """统计当前 Blender 数据块数量"""
    return {
        "objects": len(bpy.data.objects),
        "meshes": len(bpy.data.meshes),
        "materials": len(bpy.data.materials),
        "textures": len(bpy.data.textures),
        "images": len(bpy.data.images),
        "armatures": len(bpy.data.armatures),
        "actions": len(bpy.data.actions),
    }
