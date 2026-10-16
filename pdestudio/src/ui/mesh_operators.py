# mesh_operators.py
"""PDE Studio 场景/角色/道具 Mesh 导出操作符

对应原版 MEL (td/mayaScript/pdeExportMesh.mel) 中的4种 mesh 导出流程:
  - inv_exportMeshScene()       → PDE_OT_ExportSceneMesh
  - inv_exportMeshCharacterFirstPerson()  → PDE_OT_ExportFPMesh
  - inv_exportMeshCharacterThirdPerson()  → PDE_OT_ExportTPMesh
  - inv_exportMeshProp()        → PDE_OT_ExportPropMesh
"""

import bpy
from bpy.props import StringProperty

from ..log import get_module_logger
from ..exporter.export_utils import build_mesh_export_path
from .panels import _find_fp_parts, _find_tp_parts

log = get_module_logger("UI_MESH")


def _call_export_mesh(context, filepath, props, selected_only=True) -> bool:
    """调用 exporter.mesh.export_mesh 并返回结果"""
    from ..exporter.mesh import export_mesh
    return export_mesh(
        context,
        filepath=filepath,
        selected_only=selected_only,
        apply_modifiers=props.export_apply_modifiers,
        export_vertex_colors=props.export_vertex_colors,
        mesh_type=props.export_mesh_type,
        material_type=props.export_material_type,
        export_tangents=props.export_tangents,
        uv_count=int(props.export_uv_count),
        export_scale=props.export_mesh_scale,
    )


# =============================================================================
# 导出场景 Mesh 操作符
# =============================================================================

class PDE_OT_ExportSceneMesh(bpy.types.Operator):
    """导出场景 Mesh 为 PDE .mesh 格式

    对应原版 MEL: inv_exportMeshScene()
    选择场景中唯一的 mesh，导出到 mesh/scene/<name>/ 目录。
    """

    bl_idname = "pde_studio.export_scene_mesh"
    bl_label = "导出场景 Mesh"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype="FILE_PATH", default="")  # type: ignore
    filename_ext = ".mesh"
    filter_glob: StringProperty(default="*.mesh", options={'HIDDEN'})  # type: ignore

    def invoke(self, context, event):
        mesh_objects = [o for o in context.scene.objects if o.type == 'MESH']
        if not mesh_objects:
            self.report({"ERROR"}, "场景中无 Mesh 对象")
            return {"CANCELLED"}
        mesh_name = mesh_objects[0].name
        self.filepath = build_mesh_export_path(context, f"scene/{mesh_name}/", mesh_name)
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        props = context.scene.pde_studio_props
        try:
            result = _call_export_mesh(context, self.filepath, props, selected_only=False)
            if result:
                self.report({"INFO"}, f"场景 Mesh 导出成功: {self.filepath}")
                return {"FINISHED"}
            self.report({"ERROR"}, "场景 Mesh 导出失败，请查看日志")
            return {"CANCELLED"}
        except Exception as e:
            log.error(f"场景 Mesh 导出异常: {e}")
            self.report({"ERROR"}, f"场景 Mesh 导出异常: {str(e)}")
            return {"CANCELLED"}


# =============================================================================
# 导出第一人称 Mesh 操作符
# =============================================================================

class PDE_OT_ExportFPMesh(bpy.types.Operator):
    """导出第一人称角色 Mesh 为 PDE .mesh 格式

    对应原版 MEL: inv_exportMeshCharacterFirstPerson()
    按部件名过滤 (arm/cloth/hand)，导出到
    mesh/character/firstPerson/<charName>/<gender>/ 目录。
    """

    bl_idname = "pde_studio.export_fp_mesh"
    bl_label = "导出第一人称 Mesh"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype="FILE_PATH", default="")  # type: ignore
    filename_ext = ".mesh"
    filter_glob: StringProperty(default="*.mesh", options={'HIDDEN'})  # type: ignore

    def invoke(self, context, event):
        props = context.scene.pde_studio_props
        char_name = props.export_fp_char_name.strip() or "character"
        gender = props.export_fp_gender
        self.filepath = build_mesh_export_path(
            context,
            f"character/firstPerson/{char_name}/{gender}/",
            gender,
        )
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        props = context.scene.pde_studio_props
        try:
            matched = _find_fp_parts(context)
            if not matched:
                self.report({"ERROR"}, "未找到第一人称部件 (arm/cloth/hand)")
                return {"CANCELLED"}

            bpy.ops.object.select_all(action='DESELECT')
            for obj_name, _part in matched:
                obj = bpy.data.objects.get(obj_name)
                if obj:
                    obj.select_set(True)

            result = _call_export_mesh(context, self.filepath, props, selected_only=True)
            if result:
                self.report({"INFO"}, f"第一人称 Mesh 导出成功: {self.filepath}")
                return {"FINISHED"}
            self.report({"ERROR"}, "第一人称 Mesh 导出失败，请查看日志")
            return {"CANCELLED"}
        except Exception as e:
            log.error(f"第一人称 Mesh 导出异常: {e}")
            self.report({"ERROR"}, f"第一人称 Mesh 导出异常: {str(e)}")
            return {"CANCELLED"}


# =============================================================================
# 导出第三人称 Mesh 操作符
# =============================================================================

class PDE_OT_ExportTPMesh(bpy.types.Operator):
    """导出第三人称角色 Mesh 为 PDE .mesh 格式

    对应原版 MEL: inv_exportMeshCharacterThirdPerson()
    按部件名过滤 (hat/head/goggle/hand/bag/cloth/pant/shoes)，
    每个部件单独导出到 mesh/character/thirdPerson/<charName>/<gender>/<part>/ 目录。
    """

    bl_idname = "pde_studio.export_tp_mesh"
    bl_label = "导出第三人称 Mesh"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype="FILE_PATH", default="")  # type: ignore
    filename_ext = ".mesh"
    filter_glob: StringProperty(default="*.mesh", options={'HIDDEN'})  # type: ignore

    def invoke(self, context, event):
        props = context.scene.pde_studio_props
        char_name = props.export_tp_char_name.strip() or "character"
        gender = props.export_tp_gender
        self.filepath = build_mesh_export_path(
            context,
            f"character/thirdPerson/{char_name}/{gender}/",
            gender,
        )
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        props = context.scene.pde_studio_props
        try:
            matched = _find_tp_parts(context)
            if not matched:
                self.report({"ERROR"}, "未找到第三人称部件 (hat/head/goggle/hand/bag/cloth/pant/shoes)")
                return {"CANCELLED"}

            char_name = props.export_tp_char_name.strip() or "character"
            gender = props.export_tp_gender
            success_count = 0
            errors = []

            for obj_name, part in matched:
                part_path = build_mesh_export_path(
                    context,
                    f"character/thirdPerson/{char_name}/{gender}/{part}/",
                    part,
                )

                bpy.ops.object.select_all(action='DESELECT')
                obj = bpy.data.objects.get(obj_name)
                if obj:
                    obj.select_set(True)

                result = _call_export_mesh(context, part_path, props, selected_only=True)
                if result:
                    success_count += 1
                else:
                    errors.append(part)

            if errors:
                self.report({"WARNING"}, f"第三人称 Mesh 部分导出失败: {', '.join(errors)}")
            else:
                self.report({"INFO"}, f"第三人称 Mesh 导出成功: {success_count} 个部件")
            return {"FINISHED"}
        except Exception as e:
            log.error(f"第三人称 Mesh 导出异常: {e}")
            self.report({"ERROR"}, f"第三人称 Mesh 导出异常: {str(e)}")
            return {"CANCELLED"}


# =============================================================================
# 导出道具 Mesh 操作符
# =============================================================================

class PDE_OT_ExportPropMesh(bpy.types.Operator):
    """导出道具 Mesh 为 PDE .mesh 格式

    对应原版 MEL: inv_exportMeshProp()
    遍历场景中所有 mesh，导出到 mesh/prop/<propName>/ 目录。
    """

    bl_idname = "pde_studio.export_prop_mesh"
    bl_label = "导出道具 Mesh"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype="FILE_PATH", default="")  # type: ignore
    filename_ext = ".mesh"
    filter_glob: StringProperty(default="*.mesh", options={'HIDDEN'})  # type: ignore

    def invoke(self, context, event):
        props = context.scene.pde_studio_props
        prop_name = props.export_prop_name.strip() or "prop"
        self.filepath = build_mesh_export_path(
            context,
            f"prop/{prop_name}/",
            prop_name,
        )
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        props = context.scene.pde_studio_props
        try:
            mesh_objects = [o for o in context.scene.objects if o.type == 'MESH']
            if not mesh_objects:
                self.report({"ERROR"}, "场景中无 Mesh 对象")
                return {"CANCELLED"}

            prop_name = props.export_prop_name.strip() or "prop"
            success_count = 0
            errors = []

            for obj in mesh_objects:
                # 原版 MEL: tokenize $obj "_" $buffer; 用 $buffer[1] 作为文件名
                tokens = obj.name.split("_")
                file_name = tokens[-1] if len(tokens) > 1 else obj.name

                prop_path = build_mesh_export_path(
                    context,
                    f"prop/{prop_name}/",
                    file_name,
                )

                bpy.ops.object.select_all(action='DESELECT')
                obj.select_set(True)

                result = _call_export_mesh(context, prop_path, props, selected_only=True)
                if result:
                    success_count += 1
                else:
                    errors.append(obj.name)

            if errors:
                self.report({"WARNING"}, f"道具 Mesh 部分导出失败: {', '.join(errors)}")
            else:
                self.report({"INFO"}, f"道具 Mesh 导出成功: {success_count} 个")
            return {"FINISHED"}
        except Exception as e:
            log.error(f"道具 Mesh 导出异常: {e}")
            self.report({"ERROR"}, f"道具 Mesh 导出异常: {str(e)}")
            return {"CANCELLED"}
