#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
地图导入操作符

提供扫描地图脚本和导入地图的操作符。
"""

import bpy
import os
import math
from bpy.props import StringProperty, BoolProperty
from bpy.types import Operator
from mathutils import Vector, Quaternion, Euler
from typing import Dict, Any, Optional, List

from .. import MAIN_PACKAGE
from ..log import get_module_logger
from .parser import LevelScriptParser
from .level_types import LevelInfo, MeshReference, MeshObjectType

log = get_module_logger("LEVEL_OPERATOR")


# =============================================================================
# 全局缓存
# =============================================================================

# 地图缓存：存储扫描结果
_level_cache: Dict[str, Any] = {
    "levels": [],  # LevelInfo 列表
    "directory": "",  # 扫描的目录
}


def get_level_cache() -> Dict[str, Any]:
    """获取地图缓存"""
    return _level_cache


def clear_level_cache():
    """清空地图缓存"""
    _level_cache["levels"] = []
    _level_cache["directory"] = ""


# =============================================================================
# 扫描地图操作符
# =============================================================================

class PMT_OT_ScanLevels(Operator):
    """扫描地图脚本目录 \nScan level script directory"""

    bl_idname = "pmt.scan_levels"
    bl_label = "扫描地图"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        """执行扫描"""
        # 获取资源根目录
        prefs = context.preferences.addons[MAIN_PACKAGE].preferences
        res_dir = prefs.dir_path

        if not res_dir:
            self.report({"ERROR"}, "请先设置资源根目录！")
            return {"CANCELLED"}

        # 地图脚本目录
        level_dir = os.path.join(res_dir, "level")

        if not os.path.isdir(level_dir):
            self.report({"ERROR"}, f"地图目录不存在: {level_dir}")
            return {"CANCELLED"}

        # 清空缓存
        clear_level_cache()

        # 扫描地图
        parser = LevelScriptParser()
        levels = parser.scan_directory(level_dir)

        if not levels:
            self.report({"WARNING"}, "未找到任何地图脚本")
            return {"CANCELLED"}

        # 更新缓存
        _level_cache["levels"] = levels
        _level_cache["directory"] = level_dir

        # 更新枚举项
        from .. import update_level_enum_items
        enum_items = [
            (str(i), level.map_name or os.path.basename(level.script_path), "")
            for i, level in enumerate(levels)
        ]
        update_level_enum_items(enum_items)

        # 报告
        msg = f"扫描完成，找到 {len(levels)} 个地图"
        log.info(msg)
        self.report({"INFO"}, msg)

        return {"FINISHED"}


# =============================================================================
# 导入地图操作符
# =============================================================================

class PMT_OT_ImportLevel(Operator):
    """导入选中的地图 \nImport selected level"""

    bl_idname = "pmt.import_level"
    bl_label = "导入地图"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        """执行导入"""
        # 获取选中的地图索引
        selected_index = int(context.scene.pmt_props.selected_level)

        # 检查缓存
        levels = _level_cache.get("levels", [])
        if not levels or selected_index < 0 or selected_index >= len(levels):
            self.report({"ERROR"}, "请先扫描并选择地图")
            return {"CANCELLED"}

        # 获取选中的地图
        level_info = levels[selected_index]

        # 获取导入选项
        pmt_props = context.scene.pmt_props
        import_main = pmt_props.import_main_mesh
        import_gates = pmt_props.import_gates
        import_active = pmt_props.import_active_objects
        apply_transform = pmt_props.apply_transforms

        # 获取资源目录
        prefs = context.preferences.addons[MAIN_PACKAGE].preferences
        res_dir = prefs.dir_path

        # 创建地图父物体
        level_parent = self._create_level_parent(context, level_info)

        # 统计
        imported_count = 0
        error_count = 0

        # 导入主场景 mesh
        if import_main and level_info.main_mesh:
            count, errors = self._import_main_mesh(
                context, level_info, level_parent, res_dir
            )
            imported_count += count
            error_count += errors

        # 导入门/出生点
        if import_gates:
            count, errors = self._import_mesh_references(
                context,
                level_info,
                level_parent,
                res_dir,
                MeshObjectType.GATE,
                apply_transform
            )
            imported_count += count
            error_count += errors

        # 导入动态物体
        if import_active:
            count, errors = self._import_mesh_references(
                context,
                level_info,
                level_parent,
                res_dir,
                MeshObjectType.ACTIVE_OBJECT,
                apply_transform
            )
            imported_count += count
            error_count += errors

        # 报告
        msg = f"导入完成: {level_info.map_name}, {imported_count} 个物体"
        if error_count > 0:
            msg += f", {error_count} 个错误"
        
        log.info(msg)
        self.report({"INFO"}, msg)

        return {"FINISHED"}

    def _create_level_parent(
        self,
        context: bpy.types.Context,
        level_info: LevelInfo
    ) -> bpy.types.Object:
        """创建地图父物体"""
        map_name = level_info.map_name or "UnknownLevel"
        
        # 检查是否已存在
        if map_name in context.scene.objects:
            parent = context.scene.objects[map_name]
        else:
            # 创建新的空物体
            parent = bpy.data.objects.new(map_name, None)
            parent.empty_display_type = 'SPHERE'
            parent.empty_display_size = 1.0
            context.collection.objects.link(parent)
            log.info(f"创建地图父物体: {map_name}")
        
        return parent

    def _import_main_mesh(
        self,
        context: bpy.types.Context,
        level_info: LevelInfo,
        parent: bpy.types.Object,
        res_dir: str
    ) -> tuple:
        """导入主场景 mesh"""
        imported = 0
        errors = 0

        mesh_path = level_info.main_mesh
        full_path = self._resolve_mesh_path(res_dir, mesh_path)

        if not full_path or not os.path.exists(full_path):
            log.warning(f"主场景 mesh 不存在: {mesh_path}")
            return imported, errors + 1

        try:
            # 调用 mesh 导入操作符
            objects = self._import_mesh_file(context, full_path, res_dir)
            
            # 设置父物体
            for obj in objects:
                obj.parent = parent
            
            imported += len(objects)
            log.info(f"导入主场景: {mesh_path}, {len(objects)} 个物体")
            
        except Exception as e:
            log.error(f"导入主场景失败: {e}", exc_info=True)
            errors += 1

        return imported, errors

    def _import_mesh_references(
        self,
        context: bpy.types.Context,
        level_info: LevelInfo,
        parent: bpy.types.Object,
        res_dir: str,
        object_type: MeshObjectType,
        apply_transform: bool
    ) -> tuple:
        """导入指定类型的 mesh 引用"""
        imported = 0
        errors = 0

        # 筛选指定类型的 mesh
        mesh_refs = [
            ref for ref in level_info.mesh_references
            if ref.object_type == object_type
        ]

        for ref in mesh_refs:
            full_path = self._resolve_mesh_path(res_dir, ref.mesh_path)

            if not full_path or not os.path.exists(full_path):
                log.warning(f"Mesh 文件不存在: {ref.mesh_path}")
                errors += 1
                continue

            try:
                # 导入 mesh
                objects = self._import_mesh_file(context, full_path, res_dir)

                # 应用变换并设置父物体
                for obj in objects:
                    obj.parent = parent
                    
                    # 应用变换
                    if apply_transform:
                        self._apply_transform(obj, ref)
                    
                    # 对于动态物体，调整原点到底部中心
                    if ref.object_type == MeshObjectType.ACTIVE_OBJECT:
                        self._adjust_origin_to_bottom(obj)

                imported += len(objects)
                
            except Exception as e:
                log.error(f"导入 mesh 失败 {ref.mesh_path}: {e}", exc_info=True)
                errors += 1

        type_name = object_type.value
        log.info(f"导入 {type_name}: {imported} 个物体, {errors} 个错误")

        return imported, errors

    def _import_mesh_file(
        self,
        context: bpy.types.Context,
        filepath: str,
        res_dir: str
    ) -> List[bpy.types.Object]:
        """导入单个 mesh 文件"""
        from ..mesh_any.parser import MeshParser
        from ..mesh_any.material import create_mesh_object

        # 解析文件
        parser = MeshParser()
        mesh_objects = parser.parse_file(filepath)

        if not mesh_objects:
            return []

        # 获取基础名称
        base_name = os.path.splitext(os.path.basename(filepath))[0]
        mesh_type = parser.mesh_type.value

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

        return imported_objects

    def _apply_transform(
        self,
        obj: bpy.types.Object,
        ref: MeshReference
    ) -> None:
        """应用从脚本解析的位置、旋转、缩放"""
        position = ref.position
        rotation = ref.rotation
        scale = ref.scale

        # 变换应用顺序：先旋转，再平移
        # 这样可以确保旋转不会影响位置

        # 1. 应用旋转
        if rotation:
            # rotation 是角度值（度）
            # 坐标系转换（根据实际测试结果）：
            # Game X 轴 -> Blender Z 轴（风车）
            # Game Y 轴 -> Blender Y 轴（雷达）
            # Game Z 轴 -> Blender X 轴
            
            try:
                rot_degrees = float(rotation)
                rot_radians = math.radians(rot_degrees)
                
                # 根据物体类型判断旋转轴
                if ref.object_type == MeshObjectType.ACTIVE_OBJECT:
                    # 动态物体通常绕 X 轴旋转（游戏坐标系）
                    # 在 Blender 中对应 Z 轴旋转
                    obj.rotation_euler = Euler((0, 0, rot_radians), 'XYZ')
                    log.debug(f"应用旋转: {rot_degrees:.2f}° 绕 Z 轴 (Game X -> Blender Z)")
                else:
                    # 门等其他物体绕 Z 轴旋转（游戏坐标系）
                    # 在 Blender 中对应 -Y 轴旋转
                    obj.rotation_euler = Euler((0, -rot_radians, 0), 'XYZ')
                    log.debug(f"应用旋转: {rot_degrees:.2f}° 绕 Z 轴")
                    
            except (TypeError, ValueError):
                pass

        # 2. 应用位置
        if position:
            # 坐标系转换：Game Space (x, y, z) -> Blender Space (x, -z, y)
            # 与 transform_mesh_data 中的顶点转换保持一致
            blender_pos = Vector((position.x, -position.z, position.y))
            obj.location = blender_pos
            log.debug(f"应用位置: Game({position.x:.2f}, {position.y:.2f}, {position.z:.2f}) -> Blender({blender_pos.x:.2f}, {blender_pos.y:.2f}, {blender_pos.z:.2f})")

        # 3. 应用缩放（仅对门等有明确缩放信息的物体）
        # 动态物体不应用缩放，使用默认值 (1, 1, 1)
        if scale and ref.object_type == MeshObjectType.GATE:
            # 门的缩放值可能需要特殊处理
            # Vector3(3, 3, 3) 可能是碰撞盒大小，不是模型缩放
            # 暂时不应用缩放
            pass

    def _resolve_mesh_path(
        self,
        res_dir: str,
        mesh_path: str
    ) -> Optional[str]:
        """
        解析 mesh 文件路径
        
        游戏中的 mesh 路径规则：
        - level1/scene.mesh -> mesh/scene/level1/scene.mesh (地图场景)
        - level1_red_left_gate.mesh -> mesh/prop/gate/level1_red_left_gate.mesh (门)
        - Centerpoint/Centerpoint.mesh -> mesh/prop/centerpoint/Centerpoint.mesh (占领点)
        - windmils/windmils.mesh -> mesh/prop/windmils/windmils.mesh (动态物体)
        - ../signstop/xxx.mesh -> mesh/prop/signstop/xxx.mesh (相对路径)
        
        Args:
            res_dir: 资源根目录
            mesh_path: 脚本中的 mesh 路径
        
        Returns:
            完整的文件路径，找不到返回 None
        """
        if not mesh_path:
            return None
        
        # 处理相对路径（../）
        if mesh_path.startswith("../"):
            mesh_path = mesh_path[3:]
        
        # 提取文件名和目录
        mesh_dir = os.path.dirname(mesh_path)
        mesh_name = os.path.basename(mesh_path)
        
        # 可能的搜索路径（按优先级排序）
        search_paths = []
        
        # 1. 如果路径包含目录（如 windmils/windmils.mesh）
        if mesh_dir:
            # mesh/prop/xxx/xxx.mesh (道具、动态物体)
            search_paths.append(os.path.join(res_dir, "mesh", "prop", mesh_path))
            # mesh/scene/xxx/xxx.mesh (地图场景)
            search_paths.append(os.path.join(res_dir, "mesh", "scene", mesh_path))
        
        # 2. 如果路径只有文件名（如 level1_red_left_gate.mesh）
        else:
            # 根据文件名特征判断类型
            if "_gate" in mesh_name:
                # 门文件在 mesh/prop/gate/ 目录
                search_paths.append(os.path.join(res_dir, "mesh", "prop", "gate", mesh_name))
            elif "Centerpoint" in mesh_name or "centerpoint" in mesh_name:
                # 占领点在 mesh/prop/centerpoint/ 目录
                search_paths.append(os.path.join(res_dir, "mesh", "prop", "centerpoint", mesh_name))
            else:
                # 其他道具，尝试在 prop 的子目录中查找
                search_paths.append(os.path.join(res_dir, "mesh", "prop", mesh_name))
        
        # 3. 通用搜索路径（作为后备）
        search_paths.extend([
            os.path.join(res_dir, "mesh", mesh_path),           # mesh/xxx
            os.path.join(res_dir, "mesh", "prop", mesh_path),   # mesh/prop/xxx
            os.path.join(res_dir, "mesh", "scene", mesh_path),  # mesh/scene/xxx
            os.path.join(res_dir, mesh_path),                   # 直接拼接
        ])
        
        # 去重
        seen = set()
        unique_paths = []
        for path in search_paths:
            if path not in seen:
                seen.add(path)
                unique_paths.append(path)
        
        # 遍历所有可能的路径
        for path in unique_paths:
            if os.path.exists(path):
                log.debug(f"找到 mesh: {mesh_path} -> {path}")
                return path
        
        # 都找不到，记录尝试的路径
        log.debug(f"未找到 mesh: {mesh_path}")
        log.debug(f"尝试路径: {unique_paths[:3]}")  # 只显示前3个
        return None


# =============================================================================
# 注意：类的注册/注销由主 __init__.py 统一管理
# 此处不提供 register/unregister 函数，避免与主模块冲突
# =============================================================================
