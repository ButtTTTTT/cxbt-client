#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 手动导入操作符

包含 Mesh / Skeleton / Animation 三种资源的导入操作符 + 诊断操作符。
"""

import struct
import bpy
from bpy.props import StringProperty
from bpy.types import Operator

from ...log import get_module_logger
from ..common import load_and_decode
from .vfs_helpers import (
    get_resource_name,
    smart_vfs_path,
    extract_vfs_root,
)
from .skeleton_auto import try_import_skeleton

log = get_module_logger("UI_IMP")


# =============================================================================
# 导入 Mesh 操作符
# =============================================================================

class PDE_OT_ImportMesh(Operator):
    """从原版 PDE .mesh/.mesh.cache 文件导入网格"""

    bl_idname = "pde_studio.import_mesh"
    bl_label = "导入 .mesh"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype="FILE_PATH", default="")  # type: ignore
    filter_glob: StringProperty(default="*.mesh;*.mesh.cache", options={'HIDDEN'})  # type: ignore

    def invoke(self, context, event):
        self.filepath = ""
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        if not self.filepath:
            return {"CANCELLED"}

        props = context.scene.pde_studio_props
        try:
            res_name = get_resource_name(self.filepath)
            vfs_path = smart_vfs_path(props.import_vfs_root, self.filepath)
            vfs_root = props.import_vfs_root or extract_vfs_root(self.filepath)

            header, data = load_and_decode(
                self.filepath, vfs_path=vfs_path, verify_crc=props.import_verify_crc)

            from ..binary.mesh import parse_mesh_binary
            from ..core.mesh_builder import import_mesh_to_blender

            mesh_data = parse_mesh_binary(data)

            # 保存导入信息到场景属性
            props.import_last_type = f"Mesh ({'Static' if mesh_data.mesh_type == 1 else 'Skin'})"
            props.import_last_vfs_path = vfs_path
            total_v = sum(p.vertex_count for p in mesh_data.primitives)
            total_t = sum(p.primitive_count for p in mesh_data.primitives)
            props.import_last_vert_count = total_v
            props.import_last_tri_count = total_t
            props.import_last_bone_count = len(mesh_data.bone_names) if mesh_data.mesh_type == 2 else 0

            # 构建材质信息字符串
            mat_lines = []
            for prim_idx, prim in enumerate(mesh_data.primitives):
                if prim.material:
                    mat = prim.material
                    lines_for_prim = [f"Prim[{prim_idx}]:"]
                    if mat.vertex_shaders:
                        lines_for_prim.append(f"  VS: {', '.join(mat.vertex_shaders)}")
                    if mat.pixel_shaders:
                        lines_for_prim.append(f"  PS: {', '.join(mat.pixel_shaders)}")
                    for lod_idx, lod_tex in enumerate(mat.texture_uniform):
                        for tex in lod_tex:
                            lines_for_prim.append(f"  LOD{lod_idx} {tex['type_name']}: {tex['path']}")
                    mat_lines.extend(lines_for_prim)
            props.import_last_material_info = "\n".join(mat_lines)

            # 蒙皮 mesh：自动查找并导入对应 skeleton
            armature_obj = None
            bone_world_matrices = None
            if mesh_data.mesh_type == 2 and mesh_data.bone_names and vfs_root:
                log.info("蒙皮网格，尝试自动导入 skeleton...")
                armature_obj, skel_vfs, bone_world_matrices = try_import_skeleton(
                    vfs_path, vfs_root, scale=props.import_scale,
                    align_to_origin=props.import_align_to_origin,
                    coord_mode=props.import_coord_mode)
                if armature_obj:
                    props.import_last_material_info += f"\nSkeleton: {skel_vfs}"

            # 如果没有自动导入骨骼，搜索场景中已有的 Armature
            if armature_obj is None:
                armature_obj = _find_armature_in_scene(context)

            obj = import_mesh_to_blender(
                mesh_data,
                name=res_name,
                scale=props.import_scale,
                armature_obj=armature_obj,
                vfs_root=vfs_root,
                coord_mode=props.import_coord_mode,
            )

            if obj:
                self.report({"INFO"}, f"Mesh 导入成功: {res_name} ({len(mesh_data.primitives)} primitives)")
                return {"FINISHED"}
            else:
                self.report({"ERROR"}, "Mesh 导入失败")
                return {"CANCELLED"}

        except FileNotFoundError as e:
            self.report({"ERROR"}, f"文件未找到: {str(e)}")
            return {"CANCELLED"}
        except (struct.error, ValueError) as e:
            self.report({"ERROR"}, f"文件格式错误: {str(e)}")
            return {"CANCELLED"}
        except Exception as e:
            self.report({"ERROR"}, f"Mesh 导入异常: {str(e)}")
            return {"CANCELLED"}


# =============================================================================
# 导入 Skeleton 操作符
# =============================================================================

class PDE_OT_ImportSkel(Operator):
    """从原版 PDE .skel/.skel.cache 文件导入骨骼"""

    bl_idname = "pde_studio.import_skel"
    bl_label = "导入 .skel"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype="FILE_PATH", default="")  # type: ignore
    filter_glob: StringProperty(default="*.skel;*.skel.cache", options={'HIDDEN'})  # type: ignore

    def invoke(self, context, event):
        self.filepath = ""
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        if not self.filepath:
            return {"CANCELLED"}

        props = context.scene.pde_studio_props
        try:
            res_name = get_resource_name(self.filepath)
            vfs_path = smart_vfs_path(props.import_vfs_root, self.filepath)

            header, data = load_and_decode(
                self.filepath, vfs_path=vfs_path, verify_crc=props.import_verify_crc)

            from ..binary.skeleton import parse_skeleton_binary
            from ..core.skeleton_builder import import_skeleton_to_blender

            skel = parse_skeleton_binary(data)

            props.import_last_type = "Skeleton"
            props.import_last_vfs_path = vfs_path
            props.import_last_vert_count = 0
            props.import_last_tri_count = 0
            props.import_last_bone_count = len(skel.joints)
            props.import_last_material_info = ""

            arm_obj, _ = import_skeleton_to_blender(
                skel, name=res_name, scale=props.import_scale,
                align_to_origin=props.import_align_to_origin,
                coord_mode=props.import_coord_mode)

            if arm_obj:
                self.report({"INFO"}, f"Skeleton 导入成功: {res_name} ({len(skel.joints)} joints)")
                return {"FINISHED"}
            else:
                self.report({"ERROR"}, "Skeleton 导入失败")
                return {"CANCELLED"}

        except Exception as e:
            self.report({"ERROR"}, f"Skeleton 导入异常: {str(e)}")
            return {"CANCELLED"}


# =============================================================================
# 导入 Animation 操作符
# =============================================================================

class PDE_OT_ImportAnim(Operator):
    """从原版 PDE .anim/.anim.cache 文件导入动画"""

    bl_idname = "pde_studio.import_anim"
    bl_label = "导入 .anim"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype="FILE_PATH", default="")  # type: ignore
    filter_glob: StringProperty(default="*.anim;*.anim.cache", options={'HIDDEN'})  # type: ignore

    def invoke(self, context, event):
        self.filepath = ""
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        if not self.filepath:
            return {"CANCELLED"}

        props = context.scene.pde_studio_props
        try:
            res_name = get_resource_name(self.filepath)
            vfs_path = smart_vfs_path(props.import_vfs_root, self.filepath)

            armature_obj = _find_armature_in_scene(context)
            if not armature_obj:
                self.report({"ERROR"}, "请先选择或创建一个骨骼对象!")
                return {"CANCELLED"}

            header, data = load_and_decode(
                self.filepath, vfs_path=vfs_path, verify_crc=props.import_verify_crc)

            from ..binary.animation import parse_animation_binary
            from ..core.animation_builder import import_animation_to_blender

            anim = parse_animation_binary(data)

            props.import_last_type = f"Animation ({anim.frame_count} frames)"
            props.import_last_vfs_path = vfs_path
            props.import_last_vert_count = 0
            props.import_last_tri_count = 0
            props.import_last_bone_count = len(anim.tracks)
            props.import_last_material_info = ""

            action = import_animation_to_blender(
                anim, armature_obj=armature_obj,
                action_name=res_name, scale=props.import_scale,
                coord_mode=props.import_coord_mode)

            if action:
                self.report({"INFO"}, f"Animation 导入成功: {res_name} ({anim.frame_count} frames)")
                return {"FINISHED"}
            else:
                self.report({"ERROR"}, "Animation 导入失败")
                return {"CANCELLED"}

        except Exception as e:
            self.report({"ERROR"}, f"Animation 导入异常: {str(e)}")
            return {"CANCELLED"}


# =============================================================================
# 诊断操作符
# =============================================================================

class PDE_OT_Diagnostics(Operator):
    """运行骨骼/网格/动画诊断"""

    bl_idname = "pde_studio.diagnostics"
    bl_label = "运行诊断"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        from ..diagnostics import run_full_diagnostics

        armature_obj = _find_armature_in_scene(context)
        if not armature_obj:
            self.report({"ERROR"}, "请先选择一个骨骼对象!")
            return {"CANCELLED"}

        props = context.scene.pde_studio_props
        report = run_full_diagnostics(
            armature_obj, coord_mode=props.import_coord_mode)

        print(report)
        for line in report.split('\n'):
            log.info(line)

        self.report({"INFO"}, f"诊断完成 (共 {len(report.split(chr(10)))} 行)")
        return {"FINISHED"}


# =============================================================================
# 内部辅助
# =============================================================================

def _find_armature_in_scene(context):
    """查找场景中选中或存在的 Armature 对象"""
    for obj in context.selected_objects:
        if obj.type == 'ARMATURE':
            return obj
    for obj in context.scene.objects:
        if obj.type == 'ARMATURE':
            return obj
    return None
