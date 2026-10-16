# export_operators.py
"""PDE Studio 通用导出操作符 (Mesh / Skel / Anim)

这三个操作符是最基础的导出入口，
场景/角色/道具专用操作符分别在
mesh_operators / skel_operators / anim_operators 中。
"""

import os
import bpy
from bpy.props import StringProperty
from bpy.types import Operator

from ..log import get_module_logger
from ..exporter.export_utils import get_pexport_dir

log = get_module_logger("UI")


def _default_path(context, subdir: str, name: str, ext: str) -> str:
    """通用默认路径: pexport/<subdir>/<name>.<ext>"""
    pexport_dir = get_pexport_dir(context)
    if pexport_dir:
        d = os.path.join(pexport_dir, subdir) if subdir else pexport_dir
    else:
        d = subdir or "."
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, f"{name}.{ext}")


# =============================================================================
# 导出 Mesh 操作符 (通用，保留兼容)
# =============================================================================

class PDE_OT_ExportMesh(Operator):
    """导出选中模型为 PDE .mesh 格式 \nExport selected mesh to PDE .mesh format"""

    bl_idname = "pde_studio.export_mesh"
    bl_label = "导出 .mesh"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype="FILE_PATH", default="")  # type: ignore
    filename_ext = ".mesh"
    filter_glob: StringProperty(default="*.mesh", options={'HIDDEN'})  # type: ignore

    def invoke(self, context, event):
        self.filepath = _default_path(context, "mesh", "export", "mesh")
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        from ..exporter.mesh import export_mesh

        props = context.scene.pde_studio_props
        try:
            result = export_mesh(
                context,
                filepath=self.filepath,
                selected_only=props.export_selected_only,
                apply_modifiers=props.export_apply_modifiers,
                export_vertex_colors=props.export_vertex_colors,
                mesh_type=props.export_mesh_type,
                material_type=props.export_material_type,
                export_tangents=props.export_tangents,
                uv_count=int(props.export_uv_count),
                export_scale=props.export_mesh_scale,
            )

            if result:
                self.report({"INFO"}, f"Mesh 导出成功: {self.filepath}")
                return {"FINISHED"}
            self.report({"ERROR"}, "Mesh 导出失败，请查看日志")
            return {"CANCELLED"}
        except Exception as e:
            log.error(f"Mesh 导出异常: {e}")
            self.report({"ERROR"}, f"Mesh 导出异常: {str(e)}")
            return {"CANCELLED"}


# =============================================================================
# 导出 Skeleton 操作符
# =============================================================================

class PDE_OT_ExportSkel(Operator):
    """导出选中骨骼为 PDE .skel 格式 \nExport selected skeleton to PDE .skel format"""

    bl_idname = "pde_studio.export_skel"
    bl_label = "导出 .skel"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype="FILE_PATH", default="")  # type: ignore
    filename_ext = ".skel"
    filter_glob: StringProperty(default="*.skel", options={'HIDDEN'})  # type: ignore

    def invoke(self, context, event):
        self.filepath = _default_path(context, "skeleton", "export", "skel")
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        from ..exporter.skel import export_skel

        props = context.scene.pde_studio_props
        try:
            result = export_skel(
                context,
                filepath=self.filepath,
                scale=props.export_skeleton_scale,
            )

            if result:
                self.report({"INFO"}, f"Skeleton 导出成功: {self.filepath}")
                return {"FINISHED"}
            self.report({"ERROR"}, "Skeleton 导出失败，请查看日志")
            return {"CANCELLED"}
        except Exception as e:
            log.error(f"Skeleton 导出异常: {e}")
            self.report({"ERROR"}, f"Skeleton 导出异常: {str(e)}")
            return {"CANCELLED"}


# =============================================================================
# 导出 Animation 操作符
# =============================================================================

class PDE_OT_ExportAnim(Operator):
    """导出选中骨骼动画为 PDE .anim 格式 \nExport animation to PDE .anim format"""

    bl_idname = "pde_studio.export_anim"
    bl_label = "导出 .anim"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype="FILE_PATH", default="")  # type: ignore
    filename_ext = ".anim"
    filter_glob: StringProperty(default="*.anim", options={'HIDDEN'})  # type: ignore

    def invoke(self, context, event):
        self.filepath = _default_path(context, "animation", "export", "anim")
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        from ..exporter.anim import export_anim

        props = context.scene.pde_studio_props
        try:
            result = export_anim(
                context,
                filepath=self.filepath,
                fps=props.export_anim_fps,
                scale=props.export_anim_scale,
                sample_mode=props.export_anim_sample_mode,
                start_frame=props.export_anim_start_frame,
                end_frame=props.export_anim_end_frame,
            )

            if result:
                self.report({"INFO"}, f"Animation 导出成功: {self.filepath}")
                return {"FINISHED"}
            self.report({"ERROR"}, "Animation 导出失败，请查看日志")
            return {"CANCELLED"}
        except Exception as e:
            log.error(f"Animation 导出异常: {e}")
            self.report({"ERROR"}, f"Animation 导出异常: {str(e)}")
            return {"CANCELLED"}
