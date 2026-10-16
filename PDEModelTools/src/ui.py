# ui.py
import bpy
from bpy.props import StringProperty, BoolProperty, IntProperty
from bpy.types import Operator, Panel

from .log import get_module_logger

log = get_module_logger("UI")


# =============================================================================
# 辅助函数
# =============================================================================

def get_addon_preferences(context):
    """
    获取插件偏好设置
    
    在子模块中 __package__ 会返回子模块的包名，而不是插件根包名。
    这个函数通过遍历已注册的插件来找到正确的偏好设置。
    """
    # 遍历所有已加载的插件
    for addon_name in context.preferences.addons.keys():
        # 查找以 PMT 或 pmt 开头的插件（或包含 pmt 的插件）
        if 'pmt' in addon_name.lower() or 'pde_model_tools' in addon_name.lower():
            return context.preferences.addons[addon_name].preferences
    
    # 如果找不到，尝试使用已知的包名模式
    for addon_name in context.preferences.addons.keys():
        if 'src' in addon_name and addon_name.endswith('src'):
            prefs = context.preferences.addons[addon_name].preferences
            if hasattr(prefs, 'dir_path'):
                return prefs
    
    return None


# =============================================================================
# 资源目录操作符
# =============================================================================

class PMT_OT_ResourceDir(Operator):
    """选择资源根目录 \nSelect Resource root directory"""

    bl_idname = "pmt.resource_dir"
    bl_label = "Resource Root Dir"

    # 资源根目录
    directory: StringProperty(subtype="DIR_PATH")  # type: ignore

    # 执行操作
    def execute(self, context):
        try:
            prefs = get_addon_preferences(context)
            if not prefs:
                self.report({"ERROR"}, "无法找到插件设置！")
                return {"CANCELLED"}
            
            prefs.dir_path = self.directory
            bpy.ops.wm.save_userpref()

            self.report({"INFO"}, f"路径保存完成: {self.directory}")
            return {"FINISHED"}
        except Exception as e:
            self.report({"ERROR"}, f"路径保存失败: {str(e)}")
            return {"CANCELLED"}

    def invoke(self, context, event):
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}


class PMT_OT_ClearResourceDir(bpy.types.Operator):
    """清空选择的资目录 \n Clear selected resource directory"""

    bl_idname = "pmt.clear_resource_dir"
    bl_label = ""

    def execute(self, context):
        prefs = get_addon_preferences(context)
        if not prefs:
            self.report({"ERROR"}, "无法找到插件设置！")
            return {"CANCELLED"}
        
        prefs.dir_path = ""
        bpy.ops.wm.save_userpref()

        self.report({"INFO"}, "游戏资源目录已清除")
        return {"FINISHED"}


class PMT_OT_CleanupUnusedData(bpy.types.Operator):
    """删除所有未使用的数据，包括网格、材质、贴图、骨架等 \nDelete all unused data, including meshes, materials, maps, skeletons, etc."""

    bl_idname = "pmt.cleanup_unused_data"
    bl_label = "清理未使用数据"

    def execute(self, context):
        try:
            # 清理前统计
            initial_objects = len(bpy.data.objects)
            initial_meshes = len(bpy.data.meshes)
            initial_materials = len(bpy.data.materials)
            initial_textures = len(bpy.data.textures)
            initial_images = len(bpy.data.images)
            initial_armatures = len(bpy.data.armatures)
            initial_actions = len(bpy.data.actions)

            # 执行清理操作
            bpy.ops.outliner.orphans_purge(
                do_local_ids=True, do_linked_ids=True)

            # 再次清理确保彻底
            for _ in range(3):
                bpy.ops.outliner.orphans_purge()

            # 清空 pmt_props 场景属性
            if hasattr(context.scene, 'pmt_props'):
                context.scene.pmt_props.skel_target_object = None

            # 清理后统计
            final_objects = len(bpy.data.objects)
            final_meshes = len(bpy.data.meshes)
            final_materials = len(bpy.data.materials)
            final_textures = len(bpy.data.textures)
            final_images = len(bpy.data.images)
            final_armatures = len(bpy.data.armatures)
            final_actions = len(bpy.data.actions)

            # 计算清理的数量
            deleted_objects = initial_objects - final_objects
            deleted_meshes = initial_meshes - final_meshes
            deleted_materials = initial_materials - final_materials
            deleted_textures = initial_textures - final_textures
            deleted_images = initial_images - final_images
            deleted_armatures = initial_armatures - final_armatures
            deleted_actions = initial_actions - final_actions

            # 构建报告信息
            report_msg = "Cleanup Unused Data:\n"
            report_msg += f"  Object: {deleted_objects}\n"
            report_msg += f"  Mesh: {deleted_meshes}\n"
            report_msg += f"  Material: {deleted_materials}\n"
            report_msg += f"  Texture: {deleted_textures}\n"
            report_msg += f"  Image: {deleted_images}\n"
            report_msg += f"  Armature: {deleted_armatures}\n"
            report_msg += f"  Action: {deleted_actions}"

            self.report({"INFO"}, report_msg)

            return {"FINISHED"}

        except Exception as e:
            error_msg = f"清理失败: {str(e)}"
            log.error(error_msg)
            self.report({"ERROR"}, error_msg)
            return {"CANCELLED"}


# =============================================================================
# 主面板
# =============================================================================

class PMT_PT_UiPanel(bpy.types.Panel):
    """PMT 主面板"""

    bl_idname = "PMT_PT_ui_panel"
    bl_label = "PMT v0.2.0"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PMT"

    def draw(self, context):
        """绘制面板"""
        layout = self.layout
        
        # 获取场景属性
        scene = context.scene

        # 📂 资源根目录
        layout.label(text="资源根目录 / Resource root directory", icon="FILE_FOLDER")
        box = layout.box()
        row = box.row()
        row.alignment = "CENTER"

        # 获取插件的偏好设置
        prefs = get_addon_preferences(context)
        if prefs and prefs.dir_path:
            row.label(text=prefs.dir_path)
            row = box.row()
            row.operator("pmt.clear_resource_dir", text="Clear", icon="TRASH")
        else:
            row.label(text="设置资源根目录后,可以自动加载贴图!")
            row = box.row()
            row.operator("pmt.resource_dir", text="Select", icon="FILE_FOLDER")


# =============================================================================
# 稳定功能面板（旧功能）
# =============================================================================

class PMT_PT_StablePanel(bpy.types.Panel):
    """稳定功能面板 - 手动导入"""

    bl_idname = "PMT_PT_stable_panel"
    bl_label = "手动导入 / Manual Import"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PMT"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        """绘制面板"""
        layout = self.layout
        scene = context.scene

        # 🔧 按钮配置
        button_configs = [
            ("模型 / Mesh", "", "FILE_3D"),
            ("", "pmt.any_mesh", "Select"),
            ("骨架 / Skeleton", "", "GROUP_BONE"),
        ]
        for label, operator, text in button_configs:
            if label:
                layout.label(text=label, icon=text)
            else:
                layout.operator(operator, text=text)
        
        # 骨架导入选项
        box = layout.box()
        row = box.row()
        row.prop(scene.pmt_props, "skel_target_object", text="")
        row = box.row()
        row.operator("pmt.skel", text="Select", icon='GROUP_BONE')
        
        # 动画
        button_configs2 = [
            ("动画 / Animation", "", "POSE_HLT"),
            ("", "pmt.anim", "Select"),
        ]
        for label, operator, text in button_configs2:
            if label:
                layout.label(text=label, icon=text)
            else:
                layout.operator(operator, text=text)


# =============================================================================
# 实验功能面板（新功能）
# =============================================================================

class PMT_PT_ExperimentalPanel(bpy.types.Panel):
    """实验功能面板 - 地图场景导入"""

    bl_idname = "PMT_PT_experimental_panel"
    bl_label = "地图场景导入 / Map Scene Import (Experimental)"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PMT"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        """绘制面板"""
        layout = self.layout
        scene = context.scene

        # 📁 地图脚本目录
        layout.label(text="地图脚本目录 / Level Script Directory", icon="FILE_SCRIPT")
        box = layout.box()
        row = box.row()
        row.alignment = "CENTER"
        
        prefs = get_addon_preferences(context)
        if prefs and prefs.dir_path:
            level_dir = prefs.dir_path + "level"
            row.label(text=level_dir)
        else:
            row.label(text="请先设置资源根目录!")

        # layout.label()

        # 🗺️ 扫描地图
        layout.label(text="地图列表 / Level List", icon="WORLD")
        box = layout.box()
        row = box.row()
        row.operator("pmt.scan_levels", text="扫描地图 / Scan Levels", icon="VIEWZOOM")
        
        # 🎮 地图下拉列表
        from .level.operator import get_level_cache
        cache = get_level_cache()
        
        if cache and "levels" in cache:
            levels = cache["levels"]
            row = box.row()
            row.label(text=f"找到 {len(levels)} 个地图")
            
            # 使用 EnumProperty 下拉列表
            row = box.row()
            row.prop(scene.pmt_props, "selected_level", text="")
        else:
            row = box.row()
            row.label(text="(点击扫描后显示地图列表)")
        
        # layout.label()
        
        # 📥 导入选项
        layout.label(text="导入选项 / Import Options", icon="SETTINGS")
        box = layout.box()
        row = box.row()
        row.prop(scene.pmt_props, "import_main_mesh", text="主场景 mesh")
        row = box.row()
        row.prop(scene.pmt_props, "import_gates", text="门/出生点 mesh")
        row = box.row()
        row.prop(scene.pmt_props, "import_active_objects", text="动态物体 mesh")
        row = box.row()
        row.prop(scene.pmt_props, "apply_transforms", text="自动应用变换")

        # layout.label()
        
        # 导入按钮
        layout.operator("pmt.import_level", text="导入选中地图 / Import Selected", icon="IMPORT")


# =============================================================================
# 选择地图操作符
# =============================================================================

class PMT_OT_SelectLevel(Operator):
    """选择地图"""

    bl_idname = "pmt.select_level"
    bl_label = "选择地图"
    bl_options = {'REGISTER'}

    level_index: IntProperty(default=0)  # type: ignore

    def execute(self, context):
        context.scene['pmt_selected_level'] = self.level_index
        
        # 获取地图名称用于报告
        from .level.operator import get_level_cache
        cache = get_level_cache()
        if cache and "levels" in cache and self.level_index < len(cache["levels"]):
            level = cache["levels"][self.level_index]
            self.report({"INFO"}, f"已选择: {level.map_name}")
        
        return {"FINISHED"}


# =============================================================================
# 角色装备导入面板
# =============================================================================

class PMT_PT_CharacterPanel(bpy.types.Panel):
    """角色装备导入面板"""

    bl_idname = "PMT_PT_character_panel"
    bl_label = "角色装备导入 / Character Equipment Import (Experimental)"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PMT"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        """绘制面板"""
        layout = self.layout
        scene = context.scene

        # 📁 角色脚本目录
        layout.label(text="角色脚本目录 / Character Script Directory", icon="FILE_SCRIPT")
        box = layout.box()
        row = box.row()
        row.alignment = "CENTER"
        
        prefs = get_addon_preferences(context)
        if prefs and prefs.dir_path:
            character_dir = prefs.dir_path + "character"
            row.label(text=character_dir)
        else:
            row.label(text="请先设置资源根目录!")

        # 👤 扫描角色
        layout.label(text="角色列表 / Character List", icon="USER")
        box = layout.box()
        row = box.row()
        row.operator("pmt.scan_characters", text="扫描角色 / Scan Characters", icon="VIEWZOOM")
        
        # 🎭 角色下拉列表
        from .character.operator import get_character_cache
        cache = get_character_cache()
        
        if cache and "characters" in cache:
            characters = cache["characters"]
            row = box.row()
            row.label(text=f"找到 {len(characters)} 个角色")
            
            # 使用 EnumProperty 下拉列表
            row = box.row()
            row.prop(scene.pmt_props, "selected_character", text="")
            
            # 获取选中的角色
            try:
                selected_index = int(scene.pmt_props.selected_character)
                if 0 <= selected_index < len(characters):
                    char_info = characters[selected_index]
                    
                    # 队伍选择
                    row = box.row()
                    row.prop(scene.pmt_props, "selected_team", text="队伍")
                    
                    # 视角选择
                    row = box.row()
                    row.prop(scene.pmt_props, "selected_person", text="视角")
                    
                    # LOD级别选择
                    row = box.row()
                    row.prop(scene.pmt_props, "character_lod_level", text="LOD级别")
            except (ValueError, IndexError):
                # selected_character为空或无效时，不显示装备选择
                pass
        else:
            row = box.row()
            row.label(text="(点击扫描后显示角色列表)")

        # 📥 导入选项
        layout.label(text="导入选项 / Import Options", icon="SETTINGS")
        box = layout.box()
        row = box.row()
        row.prop(scene.pmt_props, "import_character_skeleton", text="骨骼")
        row = box.row()
        row.prop(scene.pmt_props, "import_character_base_mesh", text="基础mesh")
        
        # 动画选择器
        layout.label(text="动画选择 / Animation Selection", icon="ANIM")
        box = layout.box()
        
        # 扫描武器动画按钮
        row = box.row()
        row.operator("pmt.scan_weapon_animations", text="扫描武器动画 / Scan Weapon Animations", icon="VIEWZOOM")
        
        # 武器选择
        from .character.operator import get_animation_cache
        anim_cache = get_animation_cache()
        
        if anim_cache and anim_cache.get("weapons"):
            row = box.row()
            row.prop(scene.pmt_props, "selected_weapon", text="武器")
            
            # 如果选择了武器，显示扫描动画按钮
            if scene.pmt_props.selected_weapon != "none":
                row = box.row()
                row.operator("pmt.scan_animations", text="扫描动画 / Scan Animations", icon="VIEWZOOM")
                
                # 如果扫描了动画，显示动画选择
                if anim_cache.get("animations"):
                    row = box.row()
                    row.prop(scene.pmt_props, "selected_animation", text="动画")
        
        # 装备选择
        layout.label(text="装备选择 / Equipment Selection", icon="ARMATURE_DATA")
        box = layout.box()
        row = box.row()
        row.prop(scene.pmt_props, "import_equipment_chest", text="胸甲")
        row = box.row()
        row.prop(scene.pmt_props, "import_equipment_hat", text="帽子")
        row = box.row()
        row.prop(scene.pmt_props, "import_equipment_medal", text="勋章")
        row = box.row()
        row.prop(scene.pmt_props, "import_equipment_body", text="身体")
        row = box.row()
        row.prop(scene.pmt_props, "import_equipment_cloth", text="衣服")
        row = box.row()
        row.prop(scene.pmt_props, "import_equipment_other", text="其他")

        # 武器选择
        layout.label(text="武器选择 / Weapon Selection", icon="TOOL_SETTINGS")
        box = layout.box()
        
        # 扫描武器按钮
        row = box.row()
        row.operator("pmt.scan_weapons", text="扫描武器 / Scan Weapons", icon="VIEWZOOM")
        
        # 武器列表
        from .weapon.operator import get_weapon_cache
        weapon_cache = get_weapon_cache()
        
        if weapon_cache and weapon_cache.get("weapons"):
            row = box.row()
            row.prop(scene.pmt_props, "selected_weapon_list", text="武器")
            
            # 导入武器按钮
            if scene.pmt_props.selected_weapon_list != "none":
                row = box.row()
                row.operator("pmt.import_weapon", text="导入武器 / Import Weapon", icon="IMPORT")

        # 导入按钮
        layout.operator("pmt.import_character", text="导入角色 / Import Character", icon="IMPORT")


# =============================================================================
# 数据清理面板
# =============================================================================

class PMT_PT_ExportPanel(bpy.types.Panel):
    """导出面板"""

    bl_idname = "PMT_PT_export_panel"
    bl_label = "导出 / Export"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PMT"
    # 不设置 bl_options，默认展开

    def draw(self, context):
        """绘制面板"""
        layout = self.layout

        layout.operator("pmt.export_mesh", text="导出 .mesh / Export Mesh", icon="EXPORT")


class PMT_PT_CleanupPanel(bpy.types.Panel):
    """数据清理面板"""

    bl_idname = "PMT_PT_cleanup_panel"
    bl_label = "数据清理 / Data Cleaning"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PMT"
    # 不设置 bl_options，默认展开

    def draw(self, context):
        """绘制面板"""
        layout = self.layout

        layout.operator("pmt.cleanup_unused_data",
                        text="清理 / Cleanup", icon="ORPHAN_DATA")


# =============================================================================
# 帮助面板
# =============================================================================

class PMT_PT_HelpPanel(bpy.types.Panel):
    """帮助面板"""

    bl_idname = "PMT_PT_help_panel"
    bl_label = "帮助 / Help"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PMT"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        """绘制面板"""
        layout = self.layout
        
        notebox = layout.box()
        noterow = notebox.column()
        noterow.label(text="目前支持Blender 4.5+ - 5.1.1!")
        noterow.label(text="请使用UnPdeC混合模式导出资源!")
        noterow.label(text="场景所需的level目录下的.lua文件需先解密!")
        noterow.label(text="本项目仅为学习研究，请勿用于商业用途!")
