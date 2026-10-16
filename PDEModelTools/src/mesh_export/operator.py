"""
网格导出操作器模块

提供 Blender 操作器用于将场景中的网格对象导出为 PDE .mesh 文件。
"""

import bpy
from bpy_extras.io_utils import ExportHelper
from bpy.props import StringProperty, BoolProperty, EnumProperty

from ..log import get_module_logger
from ..mesh_any.config import MeshType, MeshVersion
from .exporter import export_static_mesh

log = get_module_logger("EXPORT_OPERATOR")


class PMT_OT_ExportMesh(bpy.types.Operator, ExportHelper):
    """
    导出静态网格文件

    将 Blender 场景中的网格对象导出为 PDE 引擎的 .mesh 文件。
    支持 Prop（单物体）和 Map（多物体）类型。
    """

    bl_idname = "pmt.export_mesh"
    bl_label = "导出 .mesh"
    bl_options = {"REGISTER"}

    # 文件选择属性
    filename_ext = ".mesh"
    filter_glob: StringProperty(
        default="*.mesh",
        options={"HIDDEN"},
    )  # type: ignore

    # 导出选项：版本
    mesh_version: EnumProperty(
        name="版本",
        description="选择导出的 .mesh 版本",
        items=[
            ("V1", "V1", "旧版本格式（头部 0x1D 字节）"),
            ("V2", "V2", "新版本格式（头部 0x21 字节）"),
        ],
        default="V1",
    )  # type: ignore

    # 导出选项：网格类型
    mesh_type: EnumProperty(
        name="类型",
        description="选择导出的网格类型",
        items=[
            ("AUTO", "自动 / Auto", "单个物体→Prop, 多个物体→Map"),
            ("PROP", "Prop 道具", "单个物体的道具"),
            ("MAP", "Map 地图", "多个物体的地图"),
        ],
        default="AUTO",
    )  # type: ignore

    # 导出选项：应用修改器
    apply_modifiers: BoolProperty(
        name="应用修改器",
        description="导出前应用所有修改器",
        default=True,
    )  # type: ignore

    # 导出选项：仅选中物体
    selected_only: BoolProperty(
        name="仅选中物体",
        description="仅导出选中的网格对象",
        default=True,
    )  # type: ignore

    # 导出选项：应用变换
    apply_transforms: BoolProperty(
        name="应用变换",
        description="将物体的位置、旋转、缩放应用到网格数据中",
        default=True,
    )  # type: ignore

    def draw(self, context):
        """绘制导出选项界面"""
        layout = self.layout

        box = layout.box()
        box.label(text="导出选项 / Export Options", icon='EXPORT')

        col = box.column()
        col.prop(self, "mesh_version")
        col.prop(self, "mesh_type")

        layout.separator()

        box2 = layout.box()
        box2.label(text="处理选项 / Processing", icon='MODIFIER')
        col2 = box2.column()
        col2.prop(self, "apply_modifiers")
        col2.prop(self, "selected_only")
        col2.prop(self, "apply_transforms")

    def execute(self, context):
        """执行导出操作"""
        # 获取要导出的对象
        if self.selected_only:
            objects = list(context.selected_objects)
        else:
            objects = list(context.scene.objects)

        if not objects:
            self.report({"WARNING"}, "没有可导出的对象")
            return {"CANCELLED"}

        # 解析版本
        version = MeshVersion.V1 if self.mesh_version == "V1" else MeshVersion.V2

        # 解析类型
        mesh_objects = [obj for obj in objects if obj.type == 'MESH']
        if not mesh_objects:
            self.report({"WARNING"}, "没有可导出的网格对象")
            return {"CANCELLED"}

        if self.mesh_type == "AUTO":
            mesh_type = MeshType.MAP if len(mesh_objects) > 1 else MeshType.PROP
        elif self.mesh_type == "PROP":
            mesh_type = MeshType.PROP
        else:
            mesh_type = MeshType.MAP

        # 导出
        filepath = self.filepath
        if not filepath.endswith('.mesh'):
            filepath += '.mesh'

        success, errors = export_static_mesh(
            filepath=filepath,
            objects=objects,
            mesh_type=mesh_type,
            version=version,
            apply_modifiers=self.apply_modifiers,
            apply_transforms=self.apply_transforms,
            selected_only=self.selected_only,
        )

        # 报告结果
        if success > 0:
            msg = f"导出完成: {success} 个物体"
            if errors > 0:
                msg += f", {errors} 个错误"
            self.report({"INFO"}, msg)
            return {"FINISHED"}
        else:
            self.report({"ERROR"}, "导出失败")
            return {"CANCELLED"}
