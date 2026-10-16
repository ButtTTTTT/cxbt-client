# anim\operator.py
import os
import re

import bpy
from bpy.props import StringProperty, CollectionProperty, BoolProperty
from bpy_extras.io_utils import ImportHelper

from ..log import get_module_logger
from ..skel.utils import get_root_fix_matrix
from .utils import (
    parse_anim_tracks, 
    write_transforms_to_action, 
    write_transforms_via_keyframe_insert, 
    calc_track_delta, 
    convert_tracks_to_pose_basis
)

log = get_module_logger("ANIM")


# 顶义操作类
class PMT_OT_Anim(bpy.types.Operator, ImportHelper):
    """导入动画文件 \nImport animation file"""

    bl_idname = "pmt.anim"
    bl_label = "导入动画.anim"
    bl_options = {"REGISTER", "UNDO"}

    # 文件选择（支持多选）
    files: CollectionProperty(
        type=bpy.types.OperatorFileListElement, options={"HIDDEN"}
    )  # type: ignore
    directory: StringProperty(subtype="DIR_PATH")  # type: ignore
    filter_glob: StringProperty(default="*.anim", options={"HIDDEN"})  # type: ignore
    
    # 导入选项：是否为不存在的骨骼创建新骨骼
    create_missing_bones: BoolProperty(
        name="创建缺失骨骼",
        description="如果骨骼不存在，是否创建新骨骼和动画。取消勾选则只为现有骨骼添加动画",
        default=False
    ) # type: ignore
    
    mute_constraints: BoolProperty(
        name="禁用骨骼约束",
        description="将骨骼约束静音，避免覆盖关键帧导致看起来不动",
        default=True
    ) # type: ignore
    
    absolute_space: BoolProperty(
        name="使用绝对变换",
        description="将动画数据视为骨架空间的绝对变换并转换为 pose basis",
        default=True
    ) # type: ignore
    
    ignore_translation: BoolProperty(
        name="忽略骨骼位移(防断裂)",
        description="强制所有子骨骼保持在父级相对位置(仅保留旋转)，修复小腿/脚分离问题",
        default=True
    ) # type: ignore

    # 绘制选项界面
    def draw(self, context):
        layout = self.layout
        layout.prop(self, "create_missing_bones")
        layout.prop(self, "mute_constraints")
        layout.prop(self, "absolute_space")
        layout.prop(self, "ignore_translation")

    def execute(self, context):
        """批量导入动画文件"""
        
        # 检查是否选择了文件
        if not self.files:
            self.report({"ERROR"}, "未选择任何文件")
            return {"CANCELLED"}

        # 统计
        imported_count = 0
        failed_count = 0
        failed_files = []

        # 查找骨架（所有动画使用同一个骨架）
        armature_obj = self.find_armature_in_scene()
        if not armature_obj:
            self.report({"ERROR"}, "场景中未找到骨架，请先导入 .skel 文件")
            return {"CANCELLED"}

        # 只在第一个动画时静音约束
        first_anim = True
        
        # 记录所有动画的帧数，用于最后设置场景帧范围
        all_frame_counts = []

        # 遍历所有选中的文件
        for file_elem in self.files:
            file_path = os.path.join(self.directory, file_elem.name)
            
            if not os.path.exists(file_path):
                failed_count += 1
                failed_files.append(file_elem.name)
                continue

            try:
                result, frame_count = self.import_single_anim(context, file_path, armature_obj, first_anim)
                if result:
                    imported_count += 1
                    first_anim = False
                    all_frame_counts.append(frame_count)
                else:
                    failed_count += 1
                    failed_files.append(file_elem.name)
            except Exception as e:
                log.error(f"导入动画失败 {file_elem.name}: {e}")
                failed_count += 1
                failed_files.append(file_elem.name)

        # 最后一个动画导入完成后，确保骨架是活动对象
        # Blender 5.0 重要: 必须切换到姿态模式并全选骨骼，时间轴才会显示帧数据！
        # 这是 Slotted Actions 的设计变化，不是 bug
        if armature_obj:
            # 设置场景帧范围（取所有动画的最大帧数）
            if all_frame_counts:
                max_frames = max(all_frame_counts)
                context.scene.frame_start = 1
                context.scene.frame_end = max_frames
                log.info("场景帧范围已设置: 1 - %d (最大动画帧数)", max_frames)
            
            # 先取消所有选择
            for obj in context.selected_objects:
                obj.select_set(False)
            
            # 选中并激活骨架
            armature_obj.select_set(True)
            context.view_layer.objects.active = armature_obj
            
            # 切换到姿态模式（Blender 5.0 需要这样才能显示帧数据）
            if context.object and context.object.mode != 'POSE':
                bpy.ops.object.mode_set(mode='POSE')
            
            # 全选所有骨骼（让时间轴显示所有 FCurves）
            bpy.ops.pose.select_all(action='SELECT')
            
            # 刷新视图
            context.view_layer.update()
            context.scene.frame_set(1)
            
            # 强制刷新时间轴显示
            for window in context.window_manager.windows:
                for area in window.screen.areas:
                    if area.type == 'TIMELINE':
                        area.tag_redraw()
            
            # 最后回到物体模式
            if context.object and context.object.mode == 'POSE':
                bpy.ops.object.mode_set(mode='OBJECT')
            
            # 调试信息：检查动画数据存储位置
            if armature_obj.animation_data and armature_obj.animation_data.action:
                active_action = armature_obj.animation_data.action
                active_slot = armature_obj.animation_data.action_slot
                log.info("活动 Action: %s", active_action.name)
                
                # Blender 5.0 Slotted Actions 结构:
                # Action -> Layer -> Strip -> ChannelBag -> FCurves
                
                if hasattr(active_action, 'layers') and active_action.layers:
                    log.info("  action.layers 数量: %d", len(active_action.layers))
                    layer = active_action.layers[0]
                    
                    if hasattr(layer, 'strips') and layer.strips:
                        log.info("  layer.strips 数量: %d", len(layer.strips))
                        strip = layer.strips[0]
                        
                        if active_slot and hasattr(strip, 'channelbag'):
                            cb = strip.channelbag(active_slot)
                            if cb:
                                log.info("  channelbag.fcurves 数量: %d (成功!)", len(cb.fcurves))
                            else:
                                log.warning("  channelbag 为 None!")
                
                if hasattr(active_action, 'slots') and active_action.slots:
                    log.info("  slots 数量: %d", len(active_action.slots))
            else:
                log.warning("骨架没有活动 Action!")

        # 报告结果
        msg = f"成功导入 {imported_count} 个动画"
        if failed_count > 0:
            msg += f"，失败 {failed_count} 个"
            log.warning(f"失败的文件: {failed_files}")
        self.report({"INFO"}, msg)
        
        return {"FINISHED"}

    def import_single_anim(self, context, file_path: str, armature_obj, is_first_anim: bool) -> tuple:
        """导入单个动画文件，返回 (是否成功, 帧数)"""
        
        # 读取文件
        with open(file_path, "rb") as file:
            data = file.read()

        # 从文件路径中提取文件名（不包括扩展名）
        file_name = os.path.splitext(os.path.basename(file_path))[0]

        root_fix = get_root_fix_matrix()
        root_fix_inv = root_fix.inverted()
        
        # parse_anim_tracks 现在返回 List[Tuple[str, List[Transform]]]
        tracks_list = parse_anim_tracks(data, file_name, root_fix, root_fix_inv, logger=log)
        if not tracks_list:
            log.warning(f"{file_name} 中未找到任何动画轨道")
            return False, 0

        # 映射逻辑：决定使用 Index Mapping 还是 Name Mapping
        vertex_groups = {}
        mapped_by_index = False
        
        # 尝试 Index Mapping
        bones = armature_obj.data.bones
        sorted_bones = sorted(bones, key=lambda b: b.get("pmt_file_index", 999999))
        
        if len(sorted_bones) == len(tracks_list):
            matches = 0
            for i in range(len(sorted_bones)):
                bone_name = sorted_bones[i].name
                track_name = tracks_list[i][0]
                bone_base = re.sub(r'\.\d+$', '', bone_name)
                track_base = re.sub(r'\.\d+$', '', track_name)
                if bone_base == track_base:
                    matches += 1
            
            match_rate = matches / len(sorted_bones)
            log.debug("Index Mapping 对齐检查: %d/%d (%.2f%%)", matches, len(sorted_bones), match_rate * 100)
            
            if match_rate > 0.8:
                log.info("检测到严格的索引对齐，使用 Index Mapping (解决重名骨骼顺序问题)")
                mapped_by_index = True
                for i in range(len(sorted_bones)):
                    bone_name = sorted_bones[i].name
                    track_data = tracks_list[i][1]
                    vertex_groups[bone_name] = track_data
        
        if not mapped_by_index:
            log.debug("使用标准 Name Mapping")
            for name, data in tracks_list:
                vertex_groups[name] = data

        total_frames = max(len(group_data) for group_data in vertex_groups.values())

        # 构建新的 Action 名称：目录名_动画名
        dir_name = os.path.basename(os.path.dirname(file_path))
        action_name = f"{dir_name}_{file_name}"
        
        # 确保骨架有 animation_data
        if not armature_obj.animation_data:
            armature_obj.animation_data_create()
        
        # Blender 5.0+ 使用 Slotted Actions
        # 关键顺序：先创建 Action -> 分配 Action -> 创建 Slot -> 分配 Slot
        use_slotted = False
        action = None
        slot = None
        
        try:
            # 创建新的 Action
            action = bpy.data.actions.new(name=action_name)
            
            # 检查是否支持 Slotted Actions (Blender 5.0+)
            if hasattr(action, 'slots'):
                # Step 1: 先分配 Action
                armature_obj.animation_data.action = action
                
                # Step 2: 创建 Slot (必须在分配 Action 之后)
                # 重要: id_type 必须使用 'OBJECT'，因为骨架物体是 Object 类型
                # 使用 'ARMATURE' 会创建错误类型的 Slot (AR 而不是 OB)
                slot = action.slots.new(id_type='OBJECT', name=armature_obj.name)
                
                # Step 3: 分配 Slot
                armature_obj.animation_data.action_slot = slot
                
                use_slotted = True
                log.info("使用 Slotted Actions: action=%s, slot=%s", action_name, repr(slot))
            else:
                # 传统模式 (Blender 4.x 及更早版本)
                armature_obj.animation_data.action = action
                log.info("使用传统 Action: %s", action_name)
        except Exception as e:
            log.warning("Slotted Actions 创建失败: %s, 尝试传统模式", e)
            # 如果 slotted actions 失败，回退到传统方式
            if action is None:
                action = bpy.data.actions.new(name=action_name)
            # 清空 action_slot 避免混淆
            if hasattr(armature_obj.animation_data, 'action_slot'):
                armature_obj.animation_data.action_slot = None
            armature_obj.animation_data.action = action
            use_slotted = False
        
        log.info("创建 Action: %s (%d 帧)", action_name, total_frames)
        
        # 设置 Action 的帧范围（重要：让时间轴显示帧数据）
        if hasattr(action, 'frame_range'):
            try:
                action.frame_range = (1, total_frames)
                log.debug("设置 Action 帧范围: 1 - %d", total_frames)
            except Exception as e:
                log.debug("设置 frame_range 失败: %s", e)
        
        # 在 Slotted Actions 模式下，也可能需要设置 Slot 的帧范围
        if use_slotted and slot:
            if hasattr(slot, 'frame_range'):
                try:
                    slot.frame_range = (1, total_frames)
                    log.debug("设置 Slot 帧范围: 1 - %d", total_frames)
                except Exception as e:
                    log.debug("Slot 没有 frame_range 属性: %s", e)
        
        armature_obj.data.pose_position = "POSE"
        
        # 只在第一个动画时静音约束
        if is_first_anim and self.mute_constraints:
            muted = 0
            for pb in armature_obj.pose.bones:
                for c in pb.constraints:
                    if not c.mute:
                        c.mute = True
                        muted += 1
            if muted:
                log.debug("已静音 %s 个骨骼约束", muted)

        if self.absolute_space:
            vertex_groups = convert_tracks_to_pose_basis(
                vertex_groups, 
                armature_obj, 
                ignore_translation=self.ignore_translation,
                logger=log
            )
        
        # 写入动画数据
        matched_bones = 0
        created_bones = 0
        skipped_bones = 0
        
        for group_name, group_data in vertex_groups.items():
            target_bones = []
            if mapped_by_index:
                # Index Mapping 已经是精准的一对一
                if group_name in armature_obj.data.bones:
                    target_bones.append(group_name)
            else:
                # Name Mapping 支持一对多 (广播动画)
                target_bones = self.find_all_matching_bones(armature_obj, group_name)
            
            if target_bones:
                for bone_name in target_bones:
                    self.set_bone_animation(armature_obj, bone_name, group_data, action, slot)
                    matched_bones += 1
            else:
                if self.create_missing_bones:
                    bone_name = self.create_new_bone(armature_obj, group_name)
                    if bone_name:
                        self.set_bone_animation(armature_obj, bone_name, group_data, action, slot)
                        created_bones += 1
                else:
                    skipped_bones += 1
        
        # 设置 FPS
        context.scene.render.fps = 60
        
        log.debug(
            "动画写入完成: %s, matched=%s, created=%s, skipped=%s",
            action_name,
            matched_bones,
            created_bones,
            skipped_bones,
        )
        
        return True, total_frames

    # 查找场景中的骨架
    def find_armature_in_scene(self):
        active = bpy.context.view_layer.objects.active
        if active and active.type == "ARMATURE":
            log.debug("使用当前激活骨架: %s", active.name)
            return active

        selected_armatures = [obj for obj in bpy.context.selected_objects if obj.type == "ARMATURE"]
        if selected_armatures:
            if len(selected_armatures) == 1:
                log.debug("使用选中骨架: %s", selected_armatures[0].name)
            else:
                log.debug("选中多个骨架，使用第一个: %s", selected_armatures[0].name)
            return selected_armatures[0]

        armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
        if not armatures:
            log.debug("场景中未找到骨架")
            return None
        if len(armatures) == 1:
            log.debug("找到唯一骨架: %s", armatures[0].name)
        else:
            log.debug("找到多个骨架，选择第一个: %s", armatures[0].name)
        return armatures[0]
    
    # 在骨架中查找现有骨骼
    def find_existing_bone(self, armature_obj, bone_name):
        """查找现有骨骼，如果存在返回骨骼名称，否则返回None"""
        try:
            if bone_name in armature_obj.data.bones:
                return bone_name
            return None
        except Exception as e:
            log.debug("查找骨骼失败: %s", str(e))
            return None

    def find_all_matching_bones(self, armature_obj, bone_name):
        """查找所有匹配的骨骼（包括重名后缀）"""
        matches = []
        if not armature_obj or not armature_obj.data:
            return matches
            
        # 1. 精确匹配
        if bone_name in armature_obj.data.bones:
            matches.append(bone_name)
            
        # 2. 正则匹配重名骨骼 (name.001, name.002)
        pattern = re.compile(rf"^{re.escape(bone_name)}\.\d+$")
        for b in armature_obj.data.bones:
            if pattern.match(b.name):
                matches.append(b.name)
                
        return matches
    
    # 在骨架中创建新骨骼
    def create_new_bone(self, armature_obj, bone_name):
        """创建新骨骼，成功返回骨骼名称，失败返回None"""
        # 切换到编辑模式
        bpy.context.view_layer.objects.active = armature_obj
        current_mode = bpy.context.object.mode
        bpy.ops.object.mode_set(mode='EDIT')
        
        try:
            # 创建新骨骼
            bone = armature_obj.data.edit_bones.new(bone_name)
            bone.head = (0, 0, 0)
            bone.tail = (0, 0, 0.1)
            log.debug("创建新骨骼: %s", bone_name)
            return bone_name
        except Exception as e:
            log.debug("创建骨骼失败: %s", str(e))
            return None
        finally:
            # 恢复原始模式
            bpy.ops.object.mode_set(mode=current_mode)
    
    # 为骨骼设置动画
    def set_bone_animation(self, armature_obj, bone_name, group_data, action, slot=None):
        try:
            # 获取姿态骨骼
            pose_bone = armature_obj.pose.bones.get(bone_name)
            if not pose_bone:
                log.debug("未找到姿态骨骼: %s", bone_name)
                return
            
            if not group_data:
                log.warning("骨骼 %s 的动画数据为空", bone_name)
                return
            
            pose_bone.rotation_mode = "QUATERNION"

            if action is None:
                log.warning("Action 为 None，跳过骨骼 %s", bone_name)
                return

            # 使用 keyframe_insert 方法写入动画
            # 在 Blender 5.0 Slotted Actions 模式下，需要传递 slot 参数
            try:
                write_transforms_via_keyframe_insert(armature_obj, bone_name, group_data, action, slot)
            except Exception as e:
                log.error("keyframe_insert 失败: %s, 骨骼: %s", e, bone_name)
                import traceback
                log.error("错误详情: %s", traceback.format_exc())
            
            # log.debug("为骨骼 %s 设置了 %d 帧动画", bone_name, len(group_data))
            
        except Exception as e:
            log.error("设置骨骼动画失败: %s", str(e))
            import traceback
            log.error("错误详情: %s", traceback.format_exc())
    
    # 创建空物体
    def create_empty_object(self, context, group_name, group_data):
        empty_obj = bpy.data.objects.new(name=group_name, object_data=None)
        context.collection.objects.link(empty_obj)

        empty_obj.rotation_mode = "QUATERNION"
        if not empty_obj.animation_data:
            empty_obj.animation_data_create()
        if not empty_obj.animation_data.action:
            empty_obj.animation_data.action = bpy.data.actions.new(name=f"{group_name}_Action")
        action = empty_obj.animation_data.action

        if hasattr(action, "fcurves"):
            try:
                write_transforms_to_action(action, "location", "rotation_quaternion", group_data)
            except AttributeError:
                for i, (loc, rot) in enumerate(group_data):
                    frame_num = i + 1
                    empty_obj.location = loc
                    empty_obj.rotation_quaternion = rot
                    empty_obj.keyframe_insert(data_path="location", frame=frame_num)
                    empty_obj.keyframe_insert(data_path="rotation_quaternion", frame=frame_num)
        else:
            for i, (loc, rot) in enumerate(group_data):
                frame_num = i + 1
                empty_obj.location = loc
                empty_obj.rotation_quaternion = rot
                empty_obj.keyframe_insert(data_path="location", frame=frame_num)
                empty_obj.keyframe_insert(data_path="rotation_quaternion", frame=frame_num)

        log.debug("为空物体 %s 设置了 %d 帧动画", group_name, len(group_data))
