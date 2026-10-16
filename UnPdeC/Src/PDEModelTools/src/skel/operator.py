# skel\operator.py
import os
import struct

import bpy

from . import utils
from ..mesh_any.common import bind_mesh_to_armature
from ..log import get_module_logger

log = get_module_logger("SKEL")


class PMT_OT_Skel(bpy.types.Operator):
    """导入骨架文件 \nImport from skeleton file"""

    bl_idname = "pmt.skel"
    bl_label = "导入骨架.skel"
    bl_options = {"REGISTER", "UNDO"}

    # 使用bpy.props顶义文件路径属性
    filepath: bpy.props.StringProperty(
        subtype="FILE_PATH",
        default="",
    )  # type: ignore
    # 文件扩展名过滤
    filename_ext = ".skel"
    filter_glob: bpy.props.StringProperty(default="*.skel", options={"HIDDEN"})  # type: ignore

    def invoke(self, context, event):
        # 设置文件过滤器为.skel后缀
        self.filter_glob = "*.skel;"
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        """导入骨架"""
        try:
            # 检查是否选择了目标物体
            target_obj = None
            if hasattr(context.scene, 'pmt_props') and context.scene.pmt_props.skel_target_object:
                target_obj = context.scene.pmt_props.skel_target_object
            
            if not target_obj:
                self.report({"ERROR"}, "请先在 UI 面板选择目标物体！")
                log.warning("未选择目标物体，取消导入")
                return {"CANCELLED"}
            
            log.info("目标物体: %s", target_obj.name)
            
            # 文件路径
            file_path = self.filepath

            # 从文件路径中提取文件名
            file_name = os.path.splitext(os.path.basename(file_path))[0]

            # 骨骼名称和层级关系
            bones = []

            # 读取骨骼信息
            with open(file_path, "rb") as file:
                # 验证文件是否是skel文件
                if not utils.validate_file(file):
                    log.debug("文件不是skel文件!")
                    return {"CANCELLED"}

                # 读取文件头部信息
                bone_count = utils.read_header_info(file)
                if bone_count is None:
                    log.debug("读取文件头部信息失败")
                    return {"CANCELLED"}

                # 读取骨骼名称和层级关系
                log.debug("读取骨骼名称和层级关系")
                for _ in range(bone_count):
                    # 读取骨骼信息
                    bone_info = utils.read_bone_info(file)
                    if bone_info is None: # 如果读取失败，跳出循环
                        log.debug("读取骨骼信息失败")
                        break

                    # 将骨骼信息添加到列表中
                    bones.append(bone_info)

                log.debug("读取骨骼变换数据")
                # 获取变换数据数量
                transforms_count = struct.unpack("<I", file.read(4))[0]
                # 虚拟骨骼变换数据 0x1c字节
                file.read(0x1c)
                # 减去虚拟骨骼
                transforms_count -= 1

                # 读取骨骼变换数据
                for ti in range(transforms_count):
                    log.debug(
                        "%s 读取 %s 骨骼变换数据 Level: %s",
                        ti + 1, bones[ti]["name"], bones[ti]["parent"]
                    )

                    # 读取变换数据
                    transform = utils.read_bone_transform(file)
                    # 如果读取失败，跳出循环
                    if transform is None:
                        break

                    # 将数据存放到bones对应的对象中
                    bones[ti]["transform"] = transform
                log.debug("读取骨骼变换数据结束")
                # 打印bones
                # log.debug("bones: %s", bones)

            # 创建骨架
            log.debug("创建骨架")
            
            # 创建骨架对象
            armature = bpy.data.armatures.new(file_name)
            armature_obj = bpy.data.objects.new(file_name, armature)

            # 显示名称
            armature.show_names = False
            # 显示轴
            armature.show_axes = False
            # 显示为 棍形
            armature.display_type = 'STICK'

            # 链接骨架对象到场景中，并作为目标物体的子物体
            context.collection.objects.link(armature_obj)
            armature_obj.parent = target_obj
            log.info("骨架 %s 已添加到 %s 下", file_name, target_obj.name)
            
            # 激活骨架对象
            context.view_layer.objects.active = armature_obj

            # 进入编辑模式
            bpy.ops.object.mode_set(mode="EDIT")

            # 创建骨骼
            utils.create_bone_chain(armature.edit_bones, bones)

            # 添加骨骼约束
            bpy.ops.object.mode_set(mode="POSE")
            log.debug("添加骨骼约束")
            utils.add_bone_constraints(armature_obj)

            # 调整视图
            bpy.ops.object.mode_set(mode="OBJECT")
            
            # 更新所有骨骼的 bind_pose_mat 为实际的 matrix_local
            # 这确保动画重定向使用正确的 Rest Pose
            for bone in armature.bones:
                flat_mat = [e for v in bone.matrix_local for e in v]
                bone["bind_pose_mat"] = flat_mat
            log.debug("已更新所有骨骼的 bind_pose_mat 为 matrix_local")
            
            # 选择骨架对象
            bpy.ops.object.select_all(action="DESELECT")
            armature_obj.select_set(True)
            context.view_layer.objects.active = armature_obj
            
            mesh_objects = [obj for obj in context.scene.objects if obj.type == "MESH" and len(obj.vertex_groups) > 0]
            bound_count = 0
            for mesh_obj in mesh_objects:
                if bind_mesh_to_armature(mesh_obj, armature_obj):
                    bound_count += 1
            if bound_count > 0:
                log.debug("已自动绑定 %s 个网格到骨架 %s", bound_count, armature_obj.name)

            log.debug("成功导入 %s 个骨骼", len(bones))
            return {"FINISHED"}

        except Exception as e:
            log.debug("导入过程中发生错误: %s", str(e))
            return {"CANCELLED"}
