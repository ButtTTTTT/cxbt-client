#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 手动导入面板 (bl_category="PDE Import")"""

import bpy


class PDE_PT_ImportMainPanel(bpy.types.Panel):
    bl_idname = "PDE_PT_import_main_panel"
    bl_label = "PDE Studio Import v0.3.1"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Import"

    def draw(self, context):
        layout = self.layout
        props = context.scene.pde_studio_props

        # 清理按钮
        layout.operator("pde_studio.cleanup_unused_data",
                         text="Cleanup", icon="ORPHAN_DATA")
        layout.separator()

        layout.label(text="通用设置", icon="SETTINGS")
        box = layout.box()
        box.prop(props, "import_verify_crc", text="验证CRC")
        box.prop(props, "import_vfs_root", text="根目录")
        box.prop(props, "import_align_to_origin", text="对齐到原点")


class PDE_PT_ImportSkelPanel(bpy.types.Panel):
    bl_idname = "PDE_PT_import_skel_panel"
    bl_label = "1. 骨骼导入"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Import"

    def draw(self, context):
        layout = self.layout
        layout.operator("pde_studio.import_skel", text="导入 .skel", icon="IMPORT")

        layout.label(text="当前骨骼", icon="ARMATURE_DATA")
        armature = _get_selected_armature(context)

        if armature:
            box = layout.box()
            box.label(text=f"名称: {armature.name}", icon="BONE_DATA")
            box.label(text=f"骨骼数: {len(armature.data.bones)}")
        else:
            box = layout.box()
            box.label(text="未选中骨骼对象", icon="QUESTION")


class PDE_PT_ImportMeshPanel(bpy.types.Panel):
    bl_idname = "PDE_PT_import_mesh_panel"
    bl_label = "2. 网格导入"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Import"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout
        layout.operator("pde_studio.import_mesh", text="导入 .mesh", icon="IMPORT")

        armature = _get_selected_armature(context)
        if armature:
            box = layout.box()
            box.label(text=f"绑定骨骼: {armature.name}", icon="BONE_DATA")
        else:
            box = layout.box()
            box.label(text="请先导入骨骼!", icon="ERROR")


class PDE_PT_ImportAnimPanel(bpy.types.Panel):
    bl_idname = "PDE_PT_import_anim_panel"
    bl_label = "3. 动画导入"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Import"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout
        layout.operator("pde_studio.import_anim", text="导入 .anim", icon="IMPORT")

        box = layout.box()
        box.label(text="帧率: 96fps (PDE固定)")
        box.label(text="需先选中骨骼对象!")

        armature = _get_selected_armature(context)
        if armature:
            box.label(text=f"目标骨骼: {armature.name}", icon="BONE_DATA")
            if armature.animation_data and armature.animation_data.action:
                box.label(text=f"当前动作: {armature.animation_data.action.name}", icon="ACTION")
        else:
            box.label(text="请先选中骨骼!", icon="ERROR")


class PDE_PT_ImportInfoPanel(bpy.types.Panel):
    bl_idname = "PDE_PT_import_info_panel"
    bl_label = "4. 导入信息"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Import"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout
        props = context.scene.pde_studio_props

        if not props.import_last_type:
            layout.label(text="暂无导入信息", icon="INFO")
            return

        layout.label(text="上次导入", icon="INFO")
        layout.operator("pde_studio.diagnostics", text="运行诊断", icon="MODIFIER")

        box = layout.box()
        box.label(text=f"类型: {props.import_last_type}", icon="MESH_DATA")
        box.label(text=f"VFS: {props.import_last_vfs_path}", icon="FILE_FOLDER")

        if props.import_last_vert_count > 0:
            box.label(text=f"顶点: {props.import_last_vert_count:,}", icon='DOT')
            box.label(text=f"三角形: {props.import_last_tri_count:,}", icon='DOT')

        if props.import_last_bone_count > 0:
            box.label(text=f"骨骼: {props.import_last_bone_count}", icon="BONE_DATA")


def _get_selected_armature(context):
    """获取当前选中或场景中的 Armature"""
    for obj in context.selected_objects:
        if obj.type == 'ARMATURE':
            return obj
    for obj in context.scene.objects:
        if obj.type == 'ARMATURE':
            return obj
    return None
