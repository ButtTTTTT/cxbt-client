#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Model Tools - Blender 插件入口

用于将 PDE 引擎的模型文件导入 Blender 进行预览和编辑。

支持文件格式:
- .mesh: 模型文件（Prop/Map/CW）
- .skel: 骨骼文件
- .anim: 动画文件

支持 Blender 版本: 4.5 LTS - 5.1.1
"""

import bpy
import sys
import os
from bpy.props import StringProperty, PointerProperty, BoolProperty, EnumProperty
from bpy.types import AddonPreferences, PropertyGroup

# 强制设置标准输出编码为 UTF-8（Windows 系统必需）
if sys.platform == 'win32':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
    # 设置环境变量
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')

from .log import get_module_logger

log = get_module_logger("CORE")

# 主包名
MAIN_PACKAGE = __package__

# 导出主包名常量
__all__ = ("MAIN_PACKAGE",)

# 全局存储地图枚举项（用于下拉列表）
# 这样可以避免 EnumProperty 回调函数中的编码问题
_level_enum_items = [("-1", "(请先扫描地图) / Scan levels first", "")]

# 全局存储角色枚举项（用于下拉列表）
_character_enum_items = [("-1", "(请先扫描角色) / Scan characters first", "")]


def update_level_enum_items(new_items):
    """
    更新全局的地图枚举项
    
    Args:
        new_items: 新的枚举项列表 [(identifier, name, description), ...]
    """
    global _level_enum_items
    _level_enum_items = new_items if new_items else [("-1", "(请先扫描地图) / Scan levels first", "")]


def get_level_enum_items(scene, context):
    """
    获取地图枚举项（用于下拉列表）
    
    直接返回全局存储的枚举项，避免动态生成时的编码问题。
    """
    return _level_enum_items


def update_character_enum_items(new_items):
    """
    更新全局的角色枚举项
    
    Args:
        new_items: 新的枚举项列表 [(identifier, name, description), ...]
    """
    global _character_enum_items
    _character_enum_items = new_items if new_items else [("-1", "(请先扫描角色) / Scan characters first", "")]


def get_character_enum_items(scene, context):
    """
    获取角色枚举项（用于下拉列表）
    
    直接返回全局存储的枚举项，避免动态生成时的编码问题。
    """
    # 确保枚举项不为空（Blender 要求至少3个元组元素）
    if not _character_enum_items:
        return [("-1", "(请先扫描角色) / Scan characters first", "")]
    return _character_enum_items


# 全局存储武器列表枚举项
_weapon_list_enum_items = [("none", "(请先扫描武器) / Scan weapons first", "")]


def update_weapon_list_enum_items(new_items):
    """更新全局的武器列表枚举项"""
    global _weapon_list_enum_items
    _weapon_list_enum_items = new_items if new_items else [("none", "(请先扫描武器) / Scan weapons first", "")]


def get_weapon_list_enum_items(scene, context):
    """获取武器列表枚举项"""
    if not _weapon_list_enum_items:
        return [("none", "(请先扫描武器) / Scan weapons first", "")]
    return _weapon_list_enum_items


class PMT_SceneProperties(PropertyGroup):
    """
    场景级别的属性
    
    用于存储用户在 UI 面板中的选择。
    """
    
    # 骨架导入目标物体
    skel_target_object: PointerProperty(
        name="Target object",
        type=bpy.types.Object,
        description=(
            "选择要将骨架添加到的目标物体，留空则创建新物体\n"
            "Select the target object to add the skeleton to, "
            "or leave blank to create a new object."
        ),
    )  # type: ignore
    
    # 地图选择下拉列表
    selected_level: EnumProperty(
        name="选择地图",
        description="选择要导入的地图",
        items=get_level_enum_items,
    )  # type: ignore
    
    # 地图导入选项
    import_main_mesh: BoolProperty(
        name="主场景 mesh",
        default=True,
        description="导入地图的主场景 mesh 文件",
    )  # type: ignore
    
    import_gates: BoolProperty(
        name="门/出生点 mesh",
        default=True,
        description="导入地图的门和出生点 mesh 文件",
    )  # type: ignore
    
    import_active_objects: BoolProperty(
        name="动态物体 mesh",
        default=True,
        description="导入地图的动态物体 mesh 文件（如风车、雷达等）",
    )  # type: ignore
    
    apply_transforms: BoolProperty(
        name="自动应用变换",
        default=True,
        description="自动应用从脚本解析的位置、旋转、缩放",
    )  # type: ignore
    
    # 角色选择下拉列表
    selected_character: EnumProperty(
        name="选择角色",
        description="选择要导入的角色",
        items=get_character_enum_items,
    )  # type: ignore
    
    # 队伍选择
    selected_team: EnumProperty(
        name="队伍",
        description="选择队伍",
        items=[
            ("0", "红队 / Red Team (Team 0)", ""),
            ("1", "蓝队 / Blue Team (Team 1)", ""),
        ],
        default="0",
    )  # type: ignore
    
    # 视角选择 (第一人称/第三人称)
    selected_person: EnumProperty(
        name="视角",
        description="选择视角 (第一人称/第三人称)",
        items=[
            ("third", "第三人称 / Third Person", "第三人称视角，用于角色模型"),
            ("first", "第一人称 / First Person", "第一人称视角，用于武器模型"),
        ],
        default="third",
    )  # type: ignore
    
    # 角色导入选项
    import_character_skeleton: BoolProperty(
        name="导入骨骼",
        default=True,
        description="导入角色骨骼",
    )  # type: ignore
    
    import_character_animation: BoolProperty(
        name="导入动画",
        default=False,
        description="导入角色动画",
    )  # type: ignore
    
    import_character_base_mesh: BoolProperty(
        name="导入基础mesh",
        default=True,
        description="导入角色基础mesh (body, cloth)",
    )  # type: ignore
    
    # 装备导入选项 - 按类型
    import_equipment_chest: BoolProperty(
        name="胸甲",
        default=False,
        description="导入胸甲装备",
    )  # type: ignore
    
    import_equipment_hat: BoolProperty(
        name="帽子",
        default=False,
        description="导入帽子装备",
    )  # type: ignore
    
    import_equipment_medal: BoolProperty(
        name="勋章",
        default=False,
        description="导入勋章装备",
    )  # type: ignore
    
    import_equipment_body: BoolProperty(
        name="身体",
        default=False,
        description="导入身体装备",
    )  # type: ignore
    
    import_equipment_cloth: BoolProperty(
        name="衣服",
        default=False,
        description="导入衣服装备",
    )  # type: ignore
    
    import_equipment_other: BoolProperty(
        name="其他",
        default=False,
        description="导入其他装备",
    )  # type: ignore
    
    # LOD级别选择
    character_lod_level: EnumProperty(
        name="LOD级别",
        description="选择要导入的LOD级别 (LOD0=高质量, LOD2=低质量)",
        items=[
            ("all", "全部 / All", "导入所有LOD级别"),
            ("lod0", "LOD 0", "最高质量 (近距离)"),
            ("lod1", "LOD 1", "中等质量 (中距离)"),
            ("lod2", "LOD 2", "最低质量 (远距离)"),
        ],
        default="lod0",
    )  # type: ignore
    
    # 动画武器选择
    selected_weapon: EnumProperty(
        name="武器",
        description="选择武器类型",
        items=[
            ("none", "无 / None", "不导入动画"),
        ],
        update=lambda self, context: None,  # 稍后实现动态更新
    )  # type: ignore
    
    # 武器列表选择（从 weapon/ 目录扫描）
    selected_weapon_list: EnumProperty(
        name="武器列表",
        description="选择要导入的武器",
        items=get_weapon_list_enum_items,
    )  # type: ignore
    
    # 动画文件选择
    selected_animation: EnumProperty(
        name="动画",
        description="选择动画文件",
        items=[
            ("all", "全部 / All", "导入所有动画"),
        ],
    )  # type: ignore


# 导入子模块
from .ui import (
    PMT_OT_ResourceDir,
    PMT_OT_ClearResourceDir,
    PMT_OT_CleanupUnusedData,
    PMT_OT_SelectLevel,
    PMT_PT_UiPanel,
    PMT_PT_StablePanel,
    PMT_PT_ExperimentalPanel,
    PMT_PT_CharacterPanel,
    PMT_PT_ExportPanel,
    PMT_PT_CleanupPanel,
    PMT_PT_HelpPanel,
)
from .mesh_any.operator import PMT_OT_AnyMesh
from .mesh_export.operator import PMT_OT_ExportMesh
from .skel.operator import PMT_OT_Skel
from .anim.operator import PMT_OT_Anim
from .level.operator import PMT_OT_ScanLevels, PMT_OT_ImportLevel
from .character.operator import (
    PMT_OT_ScanCharacters, 
    PMT_OT_ImportCharacter,
    PMT_OT_ScanWeaponAnimations,
    PMT_OT_ScanAnimations,
)
from .weapon.operator import (
    PMT_OT_ScanWeapons,
    PMT_OT_ImportWeapon,
)


# =============================================================================
# 动态枚举项更新函数
# =============================================================================

def update_weapon_enum_items(items):
    """更新武器枚举项"""
    # 动态更新 PMT_SceneProperties 的 selected_weapon 属性
    PMT_SceneProperties.selected_weapon = EnumProperty(
        name="武器",
        description="选择武器类型",
        items=items,
    )


def update_animation_enum_items(items):
    """更新动画枚举项"""
    # 动态更新 PMT_SceneProperties 的 selected_animation 属性
    PMT_SceneProperties.selected_animation = EnumProperty(
        name="动画",
        description="选择动画文件",
        items=items,
    )


class PMTAddonPreferences(AddonPreferences):
    """
    插件偏好设置
    
    存储资源根目录等用户配置。
    """
    
    bl_idname = __package__
    
    dir_path: StringProperty(
        name="资源根目录",
        subtype="DIR_PATH",
        default="",
        description="可以根据根目录来自动加载贴图",
    )  # type: ignore


# 注册类列表
_classes = (
    # 偏好设置
    PMTAddonPreferences,
    # 场景属性
    PMT_SceneProperties,
    # 操作符
    PMT_OT_ResourceDir,
    PMT_OT_ClearResourceDir,
    PMT_OT_CleanupUnusedData,
    PMT_OT_SelectLevel,
    # 面板（按显示顺序）
    PMT_PT_UiPanel,           # 主面板 - 资源目录设置
    PMT_PT_StablePanel,       # 稳定功能 - 手动导入
    PMT_PT_ExperimentalPanel, # 实验功能 - 地图导入
    PMT_PT_CharacterPanel,    # 实验功能 - 角色装备导入
    PMT_PT_ExportPanel,       # 导出
    PMT_PT_CleanupPanel,      # 数据清理
    PMT_PT_HelpPanel,         # 帮助面板
    # 导入操作符
    PMT_OT_AnyMesh,
    PMT_OT_ExportMesh,
    PMT_OT_Anim,
    PMT_OT_Skel,
    # 地图导入操作符
    PMT_OT_ScanLevels,
    PMT_OT_ImportLevel,
    # 角色导入操作符
    PMT_OT_ScanCharacters,
    PMT_OT_ImportCharacter,
    # 动画扫描操作符
    PMT_OT_ScanWeaponAnimations,
    PMT_OT_ScanAnimations,
    # 武器导入操作符
    PMT_OT_ScanWeapons,
    PMT_OT_ImportWeapon,
)


def register():
    """注册插件"""
    # Windows 系统上强制设置 UTF-8 编码
    if sys.platform == 'win32':
        # 尝试设置默认编码（Python 3.7+）
        try:
            import locale
            # 设置为 UTF-8
            if hasattr(locale, 'setlocale'):
                locale.setlocale(locale.LC_ALL, '')
        except Exception:
            pass
    
    # 注册类
    for cls in _classes:
        bpy.utils.register_class(cls)
    
    # 注册场景属性
    bpy.types.Scene.pmt_props = PointerProperty(type=PMT_SceneProperties)
    
    log.info("=" * 50)
    log.info("PDE Model Tools v0.2.0 已启用")
    log.info("支持 Blender 4.5 LTS - 5.1.1")
    log.info("=" * 50)


def unregister():
    """注销插件"""
    # 注销场景属性
    del bpy.types.Scene.pmt_props
    
    # 注销类（逆序）
    for cls in reversed(_classes):
        bpy.utils.unregister_class(cls)
    
    log.info("PDE Model Tools 已注销")
