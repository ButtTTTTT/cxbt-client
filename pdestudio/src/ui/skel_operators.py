# skel_operators.py
"""PDE Studio 骨骼导出操作符（角色 / 道具）

对应原版 MEL (td/mayaScript/pdeExportSkeleton.mel) 中的2种骨骼导出流程:
  - inv_charSkeletonExport()  → PDE_OT_ExportCharacterSkel
  - inv_propSkeletonExport()  → PDE_OT_ExportPropSkel
"""

import bpy
from bpy.props import StringProperty

from ..log import get_module_logger
from ..exporter.export_utils import build_skel_export_path

log = get_module_logger("UI_SKEL")


# =============================================================================
# 导出角色骨骼操作符
# =============================================================================

class PDE_OT_ExportCharacterSkel(bpy.types.Operator):
    """导出角色骨骼为 PDE .skel 格式

    对应原版 MEL: inv_charSkeletonExport()
    选中名为 root 的骨骼节点，导出到 skeleton/character/<charName>.skel
    """

    bl_idname = "pde_studio.export_char_skel"
    bl_label = "导出角色骨骼"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype="FILE_PATH", default="")  # type: ignore
    filename_ext = ".skel"
    filter_glob: StringProperty(default="*.skel", options={'HIDDEN'})  # type: ignore

    def invoke(self, context, event):
        props = context.scene.pde_studio_props
        char_name = props.export_skel_char_name.strip() or "character"
        self.filepath = build_skel_export_path(context, "character", char_name)
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
                self.report({"INFO"}, f"角色骨骼导出成功: {self.filepath}")
                return {"FINISHED"}
            self.report({"ERROR"}, "角色骨骼导出失败，请查看日志")
            return {"CANCELLED"}
        except Exception as e:
            log.error(f"角色骨骼导出异常: {e}")
            self.report({"ERROR"}, f"角色骨骼导出异常: {str(e)}")
            return {"CANCELLED"}


# =============================================================================
# 导出道具骨骼操作符
# =============================================================================

class PDE_OT_ExportPropSkel(bpy.types.Operator):
    """导出道具骨骼为 PDE .skel 格式

    对应原版 MEL: inv_propSkeletonExport()
    选中名为 prop 的节点，取其第一个子节点导出到 skeleton/prop/<propName>.skel
    """

    bl_idname = "pde_studio.export_prop_skel"
    bl_label = "导出道具骨骼"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype="FILE_PATH", default="")  # type: ignore
    filename_ext = ".skel"
    filter_glob: StringProperty(default="*.skel", options={'HIDDEN'})  # type: ignore

    def invoke(self, context, event):
        props = context.scene.pde_studio_props
        prop_name = props.export_skel_prop_name.strip() or "prop"
        self.filepath = build_skel_export_path(context, "prop", prop_name)
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
                self.report({"INFO"}, f"道具骨骼导出成功: {self.filepath}")
                return {"FINISHED"}
            self.report({"ERROR"}, "道具骨骼导出失败，请查看日志")
            return {"CANCELLED"}
        except Exception as e:
            log.error(f"道具骨骼导出异常: {e}")
            self.report({"ERROR"}, f"道具骨骼导出异常: {str(e)}")
            return {"CANCELLED"}
