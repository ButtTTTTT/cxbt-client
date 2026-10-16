"""
网格导入操作器模块

提供 Blender 操作器用于导入网格文件。
遵循 Blender 4.5 插件开发最佳实践。

遵循原则：
- 单个文件不超过 500 行
- 使用新拆分的模块
"""

import bpy
import os
from bpy_extras.io_utils import ImportHelper
from bpy.props import StringProperty, CollectionProperty, BoolProperty, FloatProperty
from typing import Set, List, Tuple, Optional

from .. import MAIN_PACKAGE
from ..log import get_module_logger
from .parser import MeshParser
from .material import create_mesh_object

log = get_module_logger("OPERATOR")


class PMT_OT_AnyMesh(bpy.types.Operator, ImportHelper):
    """
    通用网格导入操作器
    
    支持导入多种类型的 .mesh 文件：
    - Prop: 道具/静态物品
    - Map: 地图
    - CW: Character/Weapon（人物/武器）
    """
    
    bl_idname = "pmt.any_mesh"
    bl_label = "Any Mesh"
    bl_options = {"REGISTER", "UNDO"}
    
    # 文件选择属性
    files: CollectionProperty(
        type=bpy.types.OperatorFileListElement, 
        options={"HIDDEN"}
    )  # type: ignore
    
    directory: StringProperty(subtype="DIR_PATH")  # type: ignore
    
    filter_glob: StringProperty(
        default="*.mesh", 
        options={"HIDDEN"}
    )  # type: ignore
    
    # 后处理选项
    convert_to_quads: BoolProperty(
        name="三角面转四边面 (ALT+J)",
        description="将导入的网格中的三角面转换为四边面",
        default=False
    )  # type: ignore
    
    merge_by_distance: BoolProperty(
        name="按距离合并顶点 (M)",
        description="按指定距离合并相邻的顶点（建议手动合并）",
        default=False
    )  # type: ignore
    
    merge_distance: FloatProperty(
        name="合并距离阈值",
        description="顶点合并的距离阈值（单位：米）",
        default=0.0001,
        min=0.00001,
        max=1.0,
        step=0.00001,
        precision=5
    )  # type: ignore
    
    def draw(self, context):
        """绘制文件选择界面的自定义选项"""
        layout = self.layout
        layout.separator()
        
        box = layout.box()
        box.label(text="后处理选项:", icon='MODIFIER')
        
        col = box.column()
        col.prop(self, "convert_to_quads")
        col.prop(self, "merge_by_distance")
        
        if self.merge_by_distance:
            col.prop(self, "merge_distance")
    
    def execute(self, context):
        """执行导入操作"""
        if not self.files:
            self.report({"ERROR"}, "未选择任何文件")
            return {"CANCELLED"}
        
        # 统计
        imported_total = 0
        import_errors = 0
        
        # 目录 -> 父物体映射
        dir_to_parent: dict = {}
        
        # 获取资源目录
        res_dir = context.preferences.addons[MAIN_PACKAGE].preferences.dir_path
        
        # 遍历所有文件
        for file_elem in self.files:
            filepath = os.path.join(self.directory, file_elem.name)
            
            if not os.path.exists(filepath):
                import_errors += 1
                log.warning(f"文件不存在: {file_elem.name}")
                continue
            
            try:
                # 导入文件
                result, objects = self._import_single_file(
                    context, 
                    filepath, 
                    res_dir
                )
                
                if result == {"FINISHED"}:
                    imported_total += 1
                    self._organize_objects(context, objects, dir_to_parent)
                    
            except Exception as e:
                log.error(f"导入失败 {file_elem.name}: {e}", exc_info=True)
                import_errors += 1
        
        # 设置活动物体
        if dir_to_parent:
            first_parent = list(dir_to_parent.values())[0]
            self._set_active_object(context, first_parent)
            
            # 设置骨架目标
            if len(dir_to_parent) == 1:
                self._set_skeleton_target(context, first_parent)
        
        if import_errors:
            self.report({"WARNING"}, f"导入失败数量: {import_errors}")
            return {"CANCELLED"}
        
        return {"FINISHED"}
    
    def _import_single_file(
        self, 
        context: bpy.types.Context, 
        filepath: str, 
        res_dir: str
    ) -> Tuple[Set[str], List[bpy.types.Object]]:
        """导入单个文件"""
        # 解析文件
        parser = MeshParser()
        mesh_objects = parser.parse_file(filepath)
        
        if not mesh_objects:
            log.debug("未能读取到有效的网格数据")
            return {"CANCELLED"}, []
        
        # 获取基础名称
        base_name = os.path.splitext(os.path.basename(filepath))[0]
        
        # 获取网格类型
        mesh_type = parser.mesh_type.value
        mesh_version = parser.mesh_version.value
        
        log.info(f"处理 {mesh_type} 类型网格: {base_name}")
        
        # 处理材质复用
        processed_materials = set()
        imported_objects = []
        
        # 创建每个网格对象
        for idx, mesh_data in enumerate(mesh_objects, 1):
            obj = create_mesh_object(
                context,
                mesh_data,
                base_name,
                idx,
                processed_materials,
                res_dir,
                mesh_type,
                parser.obj_names if mesh_type == "CW" else None,
            )
            
            if obj:
                imported_objects.append(obj)
        
        # 后处理
        if self.convert_to_quads or self.merge_by_distance:
            self._post_process(imported_objects)
        
        # 报告
        process_info = self._get_process_info()
        report_msg = (
            f"导入完成: {len(mesh_objects)} 个物体, "
            f"类型: {mesh_type}, 版本: {mesh_version}"
        )
        
        if parser.bbox_list:
            report_msg += f", {len(parser.bbox_list)} 个边界框"
        
        report_msg += f"\n后处理: {process_info}"
        
        log.info(report_msg)
        self.report({"INFO"}, report_msg)
        
        return {"FINISHED"}, imported_objects
    
    def _organize_objects(
        self, 
        context: bpy.types.Context, 
        objects: List[bpy.types.Object],
        dir_to_parent: dict
    ) -> None:
        """组织导入的对象"""
        mesh_dir = os.path.basename(self.directory.rstrip(os.sep))
        
        if mesh_dir not in dir_to_parent:
            # 检查或创建父物体
            parent_obj = context.scene.objects.get(mesh_dir)
            
            if not parent_obj:
                parent_obj = bpy.data.objects.new(mesh_dir, None)
                parent_obj.empty_display_type = 'SPHERE'
                parent_obj.empty_display_size = 0.1
                context.collection.objects.link(parent_obj)
                log.info(f"创建父物体: {mesh_dir}")
            
            dir_to_parent[mesh_dir] = parent_obj
        
        # 设置父物体
        parent_obj = dir_to_parent[mesh_dir]
        for obj in objects:
            if obj and obj.parent is None:
                obj.parent = parent_obj
    
    def _set_active_object(
        self, 
        context: bpy.types.Context, 
        obj: bpy.types.Object
    ) -> None:
        """设置活动物体"""
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        context.view_layer.objects.active = obj
    
    def _set_skeleton_target(
        self, 
        context: bpy.types.Context, 
        obj: bpy.types.Object
    ) -> None:
        """设置骨架目标物体"""
        if hasattr(context.scene, 'pmt_props'):
            context.scene.pmt_props.skel_target_object = obj
            log.info(f"已设置骨架目标物体: {obj.name}")
    
    def _post_process(self, objects: List[bpy.types.Object]) -> None:
        """后处理网格对象"""
        mesh_objects = [obj for obj in objects if obj and obj.type == 'MESH']
        
        if not mesh_objects:
            return
        
        log.info(f"开始后处理 {len(mesh_objects)} 个网格对象...")
        
        for obj in mesh_objects:
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            
            # 三角面转四边面
            if self.convert_to_quads:
                bpy.ops.mesh.tris_convert_to_quads()
            
            # 按距离合并
            if self.merge_by_distance:
                bpy.ops.mesh.remove_doubles(threshold=self.merge_distance)
            
            bpy.ops.object.mode_set(mode='OBJECT')
            obj.select_set(False)
        
        # 重新选择
        for obj in objects:
            if obj:
                obj.select_set(True)
        
        log.info("后处理完成")
    
    def _get_process_info(self) -> str:
        """获取后处理信息"""
        if not self.convert_to_quads and not self.merge_by_distance:
            return (
                "未执行后处理\n"
                "优化建议: 编辑模式下 ALT+J 转四边面, M 合并顶点"
            )
        
        parts = []
        if self.convert_to_quads:
            parts.append("三角面转四边面")
        if self.merge_by_distance:
            parts.append(f"按距离合并({self.merge_distance})")
        
        return ", ".join(parts)


# =============================================================================
# 注意：类的注册/注销由主 __init__.py 统一管理
# 此处不提供 register/unregister 函数，避免与主模块冲突
# =============================================================================
