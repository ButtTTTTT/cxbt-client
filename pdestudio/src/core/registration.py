#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 插件注册/注销逻辑

集中管理所有 Blender 类的注册顺序、VFS 根目录同步等
插件生命周期逻辑。

包含:
- _classes: 注册类元组（按依赖顺序排列）
- _sync_vfs_root_from_prefs: 从偏好同步 VFS 到场景属性
- register() / unregister(): 插件入口
"""

import bpy
import sys
from bpy.props import PointerProperty

from ..log import get_module_logger
from .package_info import set_main_package, get_main_package
from .properties import (
    PDEStudio_SceneProperties,
    PDEStudioAddonPreferences,
)

# 导入列表项类型 (必须在 SceneProperties 之前注册)
from ..importer.characters.anim_list import PDE_AnimListItem
from ..importer.weapons.weapon_list import PDE_WeaponListItem
from ..importer.scenes.scene_list import PDE_SceneListItem

# 导入 UI 操作符和面板
from ..ui import (
    PDE_OT_ExportMesh,
    PDE_OT_ExportSceneMesh,
    PDE_OT_ExportFPMesh,
    PDE_OT_ExportTPMesh,
    PDE_OT_ExportPropMesh,
    PDE_OT_ExportSkel,
    PDE_OT_ExportAnim,
    PDE_OT_ExportCharacterSkel,
    PDE_OT_ExportPropSkel,
    PDE_OT_ExportCharFPAnim,
    PDE_OT_ExportCharTPAnim,
    PDE_OT_ExportPropFPAnim,
    PDE_OT_ExportPropTPAnim,
    PDE_OT_FixSceneFPS,
    PDE_PT_MainPanel,
    PDE_PT_SceneMeshPanel,
    PDE_PT_FirstPersonMeshPanel,
    PDE_PT_ThirdPersonMeshPanel,
    PDE_PT_PropMeshPanel,
    PDE_PT_SkelPanel,
    PDE_PT_AnimPanel,
    PDE_PT_HelpPanel,
    PDE_PT_PrimitivePropsPanel,
    PDE_OT_SetCollision,
    PDE_OT_SetPhysicsMaterial,
    PDE_OT_SetVisible,
    PDE_OT_SetBlendLayer,
    PDE_OT_SetBlendMode,
    PDE_OT_SetCullMode,
    PDE_OT_InitPrimitiveProps,
    PDE_OT_BatchSetCollision,
    PDE_OT_EditTexturePath,
    PDE_OT_AddTexture,
    PDE_OT_RemoveTexture,
    PDE_OT_CreatePDEMaterial,
    PDE_OT_EditShader,
    PDE_OT_AddShader,
    PDE_OT_RemoveShader,
    PDE_OT_AddUniform,
    PDE_OT_EditUniform,
    PDE_OT_RemoveUniform,
)

# 导入手动导入子模块
from ..importer.manual import (
    PDE_OT_ImportMesh,
    PDE_OT_ImportSkel,
    PDE_OT_ImportAnim,
    PDE_OT_Diagnostics,
    PDE_PT_ImportMainPanel,
    PDE_PT_ImportSkelPanel,
    PDE_PT_ImportMeshPanel,
    PDE_PT_ImportAnimPanel,
    PDE_PT_ImportInfoPanel,
)

# 导入角色子模块
from ..importer.characters import (
    PDE_OT_ScanCharacters,
    PDE_OT_ImportCharacterTP,
    PDE_PT_CharacterMainPanel,
    PDE_PT_CharacterOptionsPanel,
    PDE_OT_ImportAccessory,
    PDE_PT_HatPanel,
    PDE_PT_ChestPanel,
    PDE_PT_MedalPanel,
    PDE_UL_AnimList,
    PDE_OT_RefreshAnimList,
    PDE_OT_AnimSelectAll,
    PDE_OT_AnimDeselectAll,
    PDE_OT_ImportAnimations,
    PDE_PT_CharacterAnimationPanel,
)

# 导入武器子模块
from ..importer.weapons import (
    PDE_OT_ScanWeapons,
    PDE_OT_ImportWeapon,
    PDE_PT_WeaponMainPanel,
    PDE_PT_WeaponOptionsPanel,
    PDE_OT_WeaponSelect,
)
from ..importer.weapons.panel import PDE_OT_RefreshWeaponList
from ..importer.weapons.weapon_list import PDE_UL_WeaponList

# 导入场景子模块
from ..importer.scenes import (
    PDE_OT_ScanScenes,
    PDE_OT_ImportScene,
    PDE_PT_ScenePanel,
    PDE_OT_RefreshSceneList,
)
from ..importer.scenes.scene_list import PDE_UL_SceneList

# 导入清理工具
from ..importer.utils import PDE_OT_CleanupUnusedData

log = get_module_logger("CORE")

# =============================================================================
# 注册类列表（按依赖顺序排列）
# =============================================================================

_classes = (
    # 偏好设置
    PDEStudioAddonPreferences,
    # 列表项 (必须在 SceneProperties 之前注册)
    PDE_AnimListItem,
    PDE_WeaponListItem,
    PDE_SceneListItem,
    # 场景属性
    PDEStudio_SceneProperties,
    # 导出操作符
    PDE_OT_ExportMesh,
    PDE_OT_ExportSceneMesh,
    PDE_OT_ExportFPMesh,
    PDE_OT_ExportTPMesh,
    PDE_OT_ExportPropMesh,
    PDE_OT_ExportSkel,
    PDE_OT_ExportAnim,
    PDE_OT_ExportCharacterSkel,
    PDE_OT_ExportPropSkel,
    PDE_OT_ExportCharFPAnim,
    PDE_OT_ExportCharTPAnim,
    PDE_OT_ExportPropFPAnim,
    PDE_OT_ExportPropTPAnim,
    PDE_OT_FixSceneFPS,
    # 导出面板
    PDE_PT_MainPanel,
    PDE_PT_SceneMeshPanel,
    PDE_PT_FirstPersonMeshPanel,
    PDE_PT_ThirdPersonMeshPanel,
    PDE_PT_PropMeshPanel,
    PDE_PT_SkelPanel,
    PDE_PT_AnimPanel,
    PDE_PT_HelpPanel,
    # Primitive 属性面板
    PDE_PT_PrimitivePropsPanel,
    PDE_OT_SetCollision,
    PDE_OT_SetPhysicsMaterial,
    PDE_OT_SetVisible,
    PDE_OT_SetBlendLayer,
    PDE_OT_SetBlendMode,
    PDE_OT_SetCullMode,
    PDE_OT_InitPrimitiveProps,
    PDE_OT_BatchSetCollision,
    PDE_OT_EditTexturePath,
    PDE_OT_AddTexture,
    PDE_OT_RemoveTexture,
    PDE_OT_CreatePDEMaterial,
    PDE_OT_EditShader,
    PDE_OT_AddShader,
    PDE_OT_RemoveShader,
    PDE_OT_AddUniform,
    PDE_OT_EditUniform,
    PDE_OT_RemoveUniform,
    # 导入操作符
    PDE_OT_ImportMesh,
    PDE_OT_ImportSkel,
    PDE_OT_ImportAnim,
    PDE_OT_Diagnostics,
    # 导入面板
    PDE_PT_ImportMainPanel,
    PDE_PT_ImportSkelPanel,
    PDE_PT_ImportMeshPanel,
    PDE_PT_ImportAnimPanel,
    PDE_PT_ImportInfoPanel,
    # 角色导入操作符
    PDE_OT_ScanCharacters,
    PDE_OT_ImportCharacterTP,
    # 角色导入面板
    PDE_PT_CharacterMainPanel,
    PDE_PT_CharacterOptionsPanel,
    # 配饰导入
    PDE_OT_ImportAccessory,
    PDE_PT_HatPanel,
    PDE_PT_ChestPanel,
    PDE_PT_MedalPanel,
    # 动画导入
    PDE_UL_AnimList,
    PDE_OT_RefreshAnimList,
    PDE_OT_AnimSelectAll,
    PDE_OT_AnimDeselectAll,
    PDE_OT_ImportAnimations,
    PDE_PT_CharacterAnimationPanel,
    # 清理工具
    PDE_OT_CleanupUnusedData,
    # 武器导入
    PDE_OT_ScanWeapons,
    PDE_OT_ImportWeapon,
    PDE_OT_WeaponSelect,
    PDE_OT_RefreshWeaponList,
    PDE_UL_WeaponList,
    PDE_PT_WeaponMainPanel,
    PDE_PT_WeaponOptionsPanel,
    # 场景导入
    PDE_UL_SceneList,
    PDE_OT_ScanScenes,
    PDE_OT_ImportScene,
    PDE_OT_RefreshSceneList,
    PDE_PT_ScenePanel,
)


# =============================================================================
# VFS 根目录同步
# =============================================================================

def _sync_vfs_root_from_prefs():
    """从偏好设置同步 VFS 根目录到场景属性。

    在插件注册和文件加载后调用，确保用户上次保存的
    VFS 根目录自动恢复到场景属性中。
    """
    try:
        pkg = get_main_package()
        if not pkg:
            log.warning("_sync_vfs_root_from_prefs: 主包名未设置")
            return

        prefs = bpy.context.preferences.addons.get(pkg)
        if not prefs or not prefs.preferences:
            log.debug("_sync_vfs_root_from_prefs: 偏好设置不存在 (包名=%s)", pkg)
            return

        saved_root = prefs.preferences.vfs_root
        if not saved_root:
            log.debug("_sync_vfs_root_from_prefs: 偏好设置中无 VFS 根目录")
            return

        # 在插件注册阶段，bpy.context 是 _RestrictContext，
        # 无法访问 scene 等属性，只能跳过（load_post 会再次同步）
        ctx = bpy.context
        if not hasattr(ctx, 'scene'):
            log.debug("_sync_vfs_root_from_prefs: context 受限，跳过（注册阶段）")
            return

        scene = ctx.scene
        if not scene or not hasattr(scene, 'pde_studio_props'):
            return

        # 场景属性为空时才从偏好设置恢复，避免覆盖用户当前选择
        if not scene.pde_studio_props.import_vfs_root:
            scene.pde_studio_props.import_vfs_root = saved_root
            log.info("VFS 根目录已从偏好设置恢复: %s", saved_root)
    except Exception as e:
        log.error("_sync_vfs_root_from_prefs 失败: %s", e)


def _on_file_loaded(dummy):
    """文件加载后：同步 VFS 根目录 + 校正 PDE 动画帧率"""
    _sync_vfs_root_from_prefs()
    _fix_pde_anim_fps_after_load()


def _fix_pde_anim_fps_after_load():
    """文件加载后自动校正 PDE 动画帧率

    ``scene.render.fps`` 是全局值，加载不同 .blend 时会被整体替换，
    导致 PDE 动画的播放速度与 glTF 导出的动画时长出错。
    这里在文件加载后自动检查并修正一次。
    """
    try:
        scene = getattr(bpy.context, "scene", None)
        if scene is None:
            return
        from .anim_fps import check_scene_fps, fix_scene_fps
        info = check_scene_fps(scene)
        if info["actions"] and not info["ok"]:
            changed, msg = fix_scene_fps(scene)
            if changed:
                log.warning("加载文件后发现动画帧率不符，已自动校正: %s", msg)
    except Exception as e:
        log.error("动画帧率自动校正失败: %s", e)


# =============================================================================
# 注册/注销
# =============================================================================

def register(main_package: str):
    """注册插件

    Args:
        main_package: 主包名字符串（如 'pdestudio'）
    """
    # 设置主包名（供 PDEStudioAddonPreferences 和回调使用）
    set_main_package(main_package)

    # 动态设置 PDEStudioAddonPreferences.bl_idname
    # Blender 要求 bl_idname 与 __package__ 一致
    PDEStudioAddonPreferences.bl_idname = main_package

    # Windows 系统上强制设置 UTF-8 编码
    if sys.platform == 'win32':
        try:
            import locale
            if hasattr(locale, 'setlocale'):
                locale.setlocale(locale.LC_ALL, '')
        except Exception:
            pass

    # 注册类
    for cls in _classes:
        bpy.utils.register_class(cls)

    # 注册场景属性
    bpy.types.Scene.pde_studio_props = \
        PointerProperty(type=PDEStudio_SceneProperties)

    # 注册文件加载处理器，自动同步 VFS 根目录
    bpy.app.handlers.load_post.append(_on_file_loaded)

    # 立即同步一次（插件刚启用时）
    _sync_vfs_root_from_prefs()

    log.info("=" * 50)
    log.info("PDE Studio v0.3.1 已启用")
    log.info("支持 Blender 5.1.2+")
    log.info("=" * 50)


def unregister():
    """注销插件"""
    # 移除文件加载处理器
    if _on_file_loaded in bpy.app.handlers.load_post:
        bpy.app.handlers.load_post.remove(_on_file_loaded)

    # 注销场景属性
    del bpy.types.Scene.pde_studio_props

    # 注销类（逆序）
    for cls in reversed(_classes):
        bpy.utils.unregister_class(cls)

    log.info("PDE Studio 已注销")
