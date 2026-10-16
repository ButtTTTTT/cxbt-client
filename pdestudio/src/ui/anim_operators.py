# anim_operators.py
"""PDE Studio 动画导出操作符（角色 FP/TP + 道具 FP/TP）

对应原版 MEL (td/mayaScript/pdeExportAnimation.mel) 中的4种动画导出流程:
  - inv_characterAnimationFirstPersonExport()  → PDE_OT_ExportCharFPAnim
  - inv_characterAnimationThirdPersonExport()  → PDE_OT_ExportCharTPAnim
  - inv_propAnimationFirstPersonExport()        → PDE_OT_ExportPropFPAnim
  - inv_propAnimationThirdPersonExport()        → PDE_OT_ExportPropTPAnim
"""

import bpy
from bpy.props import StringProperty

from ..log import get_module_logger
from ..exporter.export_utils import build_anim_export_path

log = get_module_logger("UI_ANIM")


def _call_export_anim(context, filepath, props) -> bool:
    """调用 exporter.anim.export_anim 并返回结果"""
    from ..exporter.anim import export_anim
    return export_anim(
        context,
        filepath=filepath,
        fps=props.export_anim_fps,
        scale=props.export_anim_scale,
        sample_mode=props.export_anim_sample_mode,
        start_frame=props.export_anim_start_frame,
        end_frame=props.export_anim_end_frame,
    )


# =============================================================================
# 导出第一人称角色动画操作符
# =============================================================================

class PDE_OT_ExportCharFPAnim(bpy.types.Operator):
    """导出第一人称角色动画为 PDE .anim 格式

    对应原版 MEL: inv_characterAnimationFirstPersonExport()
    导出到 animation/character/firstPerson/<char>/<weapon>/<anim>.anim
    """

    bl_idname = "pde_studio.export_char_fp_anim"
    bl_label = "导出 FP 角色动画"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype="FILE_PATH", default="")  # type: ignore
    filename_ext = ".anim"
    filter_glob: StringProperty(default="*.anim", options={'HIDDEN'})  # type: ignore

    def invoke(self, context, event):
        props = context.scene.pde_studio_props
        char = props.export_anim_char_name.strip() or "character"
        weapon = props.export_anim_weapon_name.strip() or "weapon"
        anim = props.export_anim_name.strip() or "anim"
        self.filepath = build_anim_export_path(
            context, "char_fp", char, anim, weapon
        )
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        props = context.scene.pde_studio_props
        try:
            result = _call_export_anim(context, self.filepath, props)
            if result:
                self.report({"INFO"}, f"FP 角色动画导出成功: {self.filepath}")
                return {"FINISHED"}
            self.report({"ERROR"}, "FP 角色动画导出失败，请查看日志")
            return {"CANCELLED"}
        except Exception as e:
            log.error(f"FP 角色动画导出异常: {e}")
            self.report({"ERROR"}, f"FP 角色动画导出异常: {str(e)}")
            return {"CANCELLED"}


# =============================================================================
# 导出第三人称角色动画操作符
# =============================================================================

class PDE_OT_ExportCharTPAnim(bpy.types.Operator):
    """导出第三人称角色动画为 PDE .anim 格式

    对应原版 MEL: inv_characterAnimationThirdPersonExport()
    导出到 animation/character/thirdPerson/<char>/<weapon>/<anim>.anim
    """

    bl_idname = "pde_studio.export_char_tp_anim"
    bl_label = "导出 TP 角色动画"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype="FILE_PATH", default="")  # type: ignore
    filename_ext = ".anim"
    filter_glob: StringProperty(default="*.anim", options={'HIDDEN'})  # type: ignore

    def invoke(self, context, event):
        props = context.scene.pde_studio_props
        char = props.export_anim_char_name.strip() or "character"
        weapon = props.export_anim_weapon_name.strip() or "weapon"
        anim = props.export_anim_name.strip() or "anim"
        self.filepath = build_anim_export_path(
            context, "char_tp", char, anim, weapon
        )
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        props = context.scene.pde_studio_props
        try:
            result = _call_export_anim(context, self.filepath, props)
            if result:
                self.report({"INFO"}, f"TP 角色动画导出成功: {self.filepath}")
                return {"FINISHED"}
            self.report({"ERROR"}, "TP 角色动画导出失败，请查看日志")
            return {"CANCELLED"}
        except Exception as e:
            log.error(f"TP 角色动画导出异常: {e}")
            self.report({"ERROR"}, f"TP 角色动画导出异常: {str(e)}")
            return {"CANCELLED"}


# =============================================================================
# 导出第一人称道具动画操作符
# =============================================================================

class PDE_OT_ExportPropFPAnim(bpy.types.Operator):
    """导出第一人称道具动画为 PDE .anim 格式

    对应原版 MEL: inv_propAnimationFirstPersonExport()
    导出到 animation/prop/firstperson/<weapon>/<anim>.anim
    """

    bl_idname = "pde_studio.export_prop_fp_anim"
    bl_label = "导出 FP 道具动画"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype="FILE_PATH", default="")  # type: ignore
    filename_ext = ".anim"
    filter_glob: StringProperty(default="*.anim", options={'HIDDEN'})  # type: ignore

    def invoke(self, context, event):
        props = context.scene.pde_studio_props
        weapon = props.export_anim_prop_name.strip() or "weapon"
        anim = props.export_anim_name.strip() or "anim"
        self.filepath = build_anim_export_path(
            context, "prop_fp", weapon, anim
        )
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        props = context.scene.pde_studio_props
        try:
            result = _call_export_anim(context, self.filepath, props)
            if result:
                self.report({"INFO"}, f"FP 道具动画导出成功: {self.filepath}")
                return {"FINISHED"}
            self.report({"ERROR"}, "FP 道具动画导出失败，请查看日志")
            return {"CANCELLED"}
        except Exception as e:
            log.error(f"FP 道具动画导出异常: {e}")
            self.report({"ERROR"}, f"FP 道具动画导出异常: {str(e)}")
            return {"CANCELLED"}


# =============================================================================
# 导出第三人称道具动画操作符
# =============================================================================

class PDE_OT_ExportPropTPAnim(bpy.types.Operator):
    """导出第三人称道具动画为 PDE .anim 格式

    对应原版 MEL: inv_propAnimationThirdPersonExport()
    导出到 animation/prop/thirdperson/<weapon>/<anim>.anim
    """

    bl_idname = "pde_studio.export_prop_tp_anim"
    bl_label = "导出 TP 道具动画"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype="FILE_PATH", default="")  # type: ignore
    filename_ext = ".anim"
    filter_glob: StringProperty(default="*.anim", options={'HIDDEN'})  # type: ignore

    def invoke(self, context, event):
        props = context.scene.pde_studio_props
        weapon = props.export_anim_prop_name.strip() or "weapon"
        anim = props.export_anim_name.strip() or "anim"
        self.filepath = build_anim_export_path(
            context, "prop_tp", weapon, anim
        )
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        props = context.scene.pde_studio_props
        try:
            result = _call_export_anim(context, self.filepath, props)
            if result:
                self.report({"INFO"}, f"TP 道具动画导出成功: {self.filepath}")
                return {"FINISHED"}
            self.report({"ERROR"}, "TP 道具动画导出失败，请查看日志")
            return {"CANCELLED"}
        except Exception as e:
            log.error(f"TP 道具动画导出异常: {e}")
            self.report({"ERROR"}, f"TP 道具动画导出异常: {str(e)}")
            return {"CANCELLED"}


# =============================================================================
# 场景动画帧率修正
# =============================================================================

class PDE_OT_FixSceneFPS(bpy.types.Operator):
    """修正场景帧率以匹配 PDE 动画（96fps）

    PDE 动画固定 96fps。导入动画时插件会把 scene.render.fps 设为 96，
    但该全局值可能被"加载其它 .blend"或手动修改覆盖。帧率不对会导致：
      - 时间轴播放速度错误（96 -> 60 时慢 1.6 倍）
      - 导出 glTF 后动画时长整体偏差（glTF 按 scene.fps 把帧号换算成秒）
      - 导出 PDE .anim 时采样步长同样基于 scene.fps

    只改帧率、不动帧范围 —— Action 的帧号本身是正确的。
    """
    bl_idname = "pde_studio.fix_scene_fps"
    bl_label = "修正场景帧率"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        from ..core.anim_fps import fix_scene_fps
        try:
            changed, msg = fix_scene_fps(context.scene)
            self.report({"INFO"} if changed else {"WARNING"}, msg)
            return {"FINISHED"}
        except Exception as e:
            log.error(f"修正场景帧率失败: {e}")
            self.report({"ERROR"}, f"修正场景帧率失败: {str(e)}")
            return {"CANCELLED"}
