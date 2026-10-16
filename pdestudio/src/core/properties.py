#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 插件属性定义

所有 PropertyGroup 集中于此。

包含:
- PDEStudio_SceneProperties: 场景级导出/导入属性
- PDEStudioAddonPreferences: 插件偏好设置（跨会话持久化）

回调函数见 property_callbacks.py，包名管理见 package_info.py。
"""

import bpy
from bpy.props import (
    StringProperty, BoolProperty, EnumProperty,
    FloatProperty, IntProperty, PointerProperty, CollectionProperty,
)
from bpy.types import AddonPreferences, PropertyGroup

from ..log import get_module_logger
from ..importer.characters.enum_callbacks import (
    get_character_enum, get_category_enum, get_outfit_enum,
    get_hat_enum, get_chest_enum, get_medal_enum, get_anim_weapon_enum,
)
from ..importer.characters.anim_list import PDE_AnimListItem
from ..importer.weapons.weapon_list import PDE_WeaponListItem
from ..importer.weapons.panel import _get_fx_level_enum
from ..importer.scenes.scene_list import PDE_SceneListItem
from .property_callbacks import (
    save_vfs_root_to_prefs, on_category_changed, on_character_changed,
    on_team_changed, on_anim_type_changed, on_anim_weapon_changed,
    on_weapon_index_changed, on_scene_index_changed,
)

log = get_module_logger("CORE")


class PDEStudio_SceneProperties(PropertyGroup):
    """场景级别的导出/导入属性，存储用户在 UI 面板中的配置。"""

    export_filepath: StringProperty(
        name="导出路径", subtype="FILE_PATH", default="",
        description="导出文件的保存路径")  # type: ignore
    export_selected_only: BoolProperty(
        name="仅导出选中", default=True,
        description="仅导出当前选中的对象，否则导出所有可见对象")  # type: ignore
    export_apply_modifiers: BoolProperty(
        name="应用修改器", default=True,
        description="导出前应用所有修改器")  # type: ignore
    export_vertex_colors: BoolProperty(
        name="导出顶点色", default=True,
        description="导出顶点颜色数据（Colors / FaceVertexColors）")  # type: ignore
    export_mesh_type: EnumProperty(
        name="Mesh 类型", description="选择导出的 Mesh 类型",
        items=[
            ("auto", "自动判断", "根据是否蒙皮自动判断"),
            ("static", "静态 Static", "强制导出为静态网格（无蒙皮数据）"),
            ("skin", "蒙皮 Skin", "强制导出为蒙皮网格（含 Joints/BlendWeights）"),
        ], default="auto")  # type: ignore
    export_material_type: EnumProperty(
        name="材质类型", description="选择导出的材质贴图类型",
        items=[
            ("cgfx", "pdeCgfxShader", "导出完整 Shader 材质（角色/武器类）"),
            ("simple", "简单材质", "仅导出 Name 字段（道具类）"),
        ], default="cgfx")  # type: ignore
    export_tangents: BoolProperty(
        name="导出切线/副法线", default=True,
        description="导出 Tangent 和 Binormal 数据")  # type: ignore
    export_uv_count: EnumProperty(
        name="UV 集数量", description="导出几组 UV 坐标（最多3组）",
        items=[
            ("1", "1组 (map1)", "仅颜色贴图 UV"),
            ("2", "2组 (map1+map2)", "颜色 + 光照贴图 UV"),
            ("3", "3组", "全部三组 UV"),
        ], default="1")  # type: ignore
    export_mesh_scale: FloatProperty(
        name="网格缩放", default=100.0,
        description="顶点位置缩放因子（Blender米→PDE文本厘米，加载器内部×0.01转回米）",
        min=0.0001, max=10000.0)  # type: ignore
    export_fp_char_name: StringProperty(
        name="角色名", default="",
        description="第一人称角色名称，用于构建导出路径 character/firstPerson/<charName>/")  # type: ignore
    export_fp_gender: EnumProperty(
        name="性别", description="角色性别，对应原版 blockFileName[1]",
        items=[("male", "Male", "男性"), ("female", "Female", "女性")],
        default="male")  # type: ignore
    export_tp_char_name: StringProperty(
        name="角色名", default="",
        description="第三人称角色名称，用于构建导出路径 character/thirdPerson/<charName>/")  # type: ignore
    export_tp_gender: EnumProperty(
        name="性别", description="角色性别，对应原版 blockFileName[1]",
        items=[("male", "Male", "男性"), ("female", "Female", "女性")],
        default="male")  # type: ignore
    export_prop_name: StringProperty(
        name="道具名", default="",
        description="道具名称，用于构建导出路径 prop/<propName>/")  # type: ignore
    export_skel_char_name: StringProperty(
        name="角色名", default="",
        description="角色骨骼导出名称，路径 skeleton/character/<name>.skel")  # type: ignore
    export_skel_prop_name: StringProperty(
        name="道具名", default="",
        description="道具骨骼导出名称，路径 skeleton/prop/<name>.skel")  # type: ignore
    export_skeleton_scale: FloatProperty(
        name="骨骼缩放", default=100.0,
        description="骨骼位置缩放倍数（Blender 米 → PDE 厘米，默认100）",
        min=1.0, max=10000.0)  # type: ignore
    export_anim_char_name: StringProperty(
        name="角色名", default="",
        description="角色动画导出名称，用于构建 animation/character/ 路径")  # type: ignore
    export_anim_weapon_name: StringProperty(
        name="武器名", default="",
        description="武器名称，角色动画路径中的武器子目录")  # type: ignore
    export_anim_prop_name: StringProperty(
        name="道具名", default="",
        description="道具动画导出名称（武器名），用于构建 animation/prop/ 路径")  # type: ignore
    export_anim_name: StringProperty(
        name="动画名", default="",
        description="动画文件名（不含扩展名），如 idle/shoot/reload")  # type: ignore
    export_anim_fps: FloatProperty(
        name="帧率", default=96.0,
        description="动画采样帧率（PDE 引擎固定 96fps）",
        min=1.0, max=240.0)  # type: ignore
    export_anim_sample_mode: EnumProperty(
        name="采样模式", description="动画采样模式",
        items=[
            ("frame", "逐帧采样", "按每帧采样（精确，数据量大）"),
            ("key", "关键帧采样", "仅在关键帧处采样（数据量小，可能有精度损失）"),
        ], default="frame")  # type: ignore
    export_anim_start_frame: IntProperty(
        name="起始帧", default=0,
        description="动画起始帧（0=使用场景起始帧）")  # type: ignore
    export_anim_end_frame: IntProperty(
        name="结束帧", default=0,
        description="动画结束帧（0=使用场景结束帧）")  # type: ignore
    export_anim_scale: FloatProperty(
        name="位置缩放", default=100.0,
        description="动画位置缩放倍数（Blender 米 → PDE 厘米，默认100）",
        min=1.0, max=10000.0)  # type: ignore
    export_gen_build_script: BoolProperty(
        name="生成编译脚本", default=True,
        description="同时生成 cache_xxx.lua 和 gen_xxx.lua 编译脚本")  # type: ignore
    import_scale: FloatProperty(
        name="导入缩放", default=1.0,
        description="导入位置缩放因子（PDE游戏单位 → Blender米，默认1.0）。PDE游戏单位=米",
        min=0.0001, max=10.0)  # type: ignore
    import_verify_crc: BoolProperty(
        name="验证CRC", default=True,
        description="导入时验证 .cache 文件的 CRC32 校验")  # type: ignore
    import_vfs_root: StringProperty(
        name="根目录", subtype="DIR_PATH", default="",
        description="原版游戏 cache 根目录，用于查找贴图文件和自动推导 VFS 路径。设置后自动保存",
        update=lambda self, context: save_vfs_root_to_prefs(self, context))  # type: ignore
    import_auto_bind_skeleton: BoolProperty(
        name="自动关联骨骼", default=True,
        description="导入蒙皮网格时自动绑定同目录下的 .skel 文件")  # type: ignore
    import_align_to_origin: BoolProperty(
        name="对齐到原点", default=False,
        description="将根骨骼对齐到原点 (0,0,0)。对于第一人称/上半身 mesh 建议开启")  # type: ignore
    import_coord_mode: EnumProperty(
        name="坐标系",
        description="Y-up: 直接使用PDE坐标(模型侧躺); Z-up: 转换为Blender坐标系(模型正常显示)",
        items=[
            ("zup", "Z-up (推荐)", "转换为Blender Z-up坐标系，模型正常显示"),
            ("yup", "Y-up", "保持PDE Y-up坐标系，模型侧躺显示"),
        ], default="zup")  # type: ignore
    import_last_type: StringProperty(
        name="资源类型", default="", description="上次导入的资源类型")  # type: ignore
    import_last_vfs_path: StringProperty(
        name="VFS路径", default="", description="上次导入的 VFS 路径")  # type: ignore
    import_last_vert_count: IntProperty(
        name="顶点数", default=0, description="上次导入的顶点总数")  # type: ignore
    import_last_tri_count: IntProperty(
        name="三角形数", default=0, description="上次导入的三角形总数")  # type: ignore
    import_last_bone_count: IntProperty(
        name="骨骼数", default=0, description="上次导入的骨骼数")  # type: ignore
    import_last_material_info: StringProperty(
        name="材质信息", default="",
        description="上次导入的材质信息（Shader名称 + 贴图路径）")  # type: ignore
    char_sel_category: EnumProperty(
        name="Category", description="Filter characters by category",
        items=get_category_enum, update=on_category_changed)  # type: ignore
    char_sel_name: EnumProperty(
        name="Character", description="Select character to import",
        items=get_character_enum, update=on_character_changed)  # type: ignore
    char_sel_team: EnumProperty(
        name="Team", description="Select team",
        items=[("0", "红队", ""), ("1", "蓝队", "")],
        default="0", update=on_team_changed)  # type: ignore
    char_sel_outfit: EnumProperty(
        name="Outfit", description="Select outfit/skin", items=get_outfit_enum)  # type: ignore
    char_sel_hat: EnumProperty(
        name="Hat", description="Select hat accessory", items=get_hat_enum)  # type: ignore
    char_sel_chest: EnumProperty(
        name="Chest", description="Select chest/wing accessory", items=get_chest_enum)  # type: ignore
    char_sel_medal: EnumProperty(
        name="Medal", description="Select medal accessory", items=get_medal_enum)  # type: ignore
    char_sel_view: EnumProperty(
        name="视角", description="导入视角",
        items=[
            ("tp", "第三人称", "导入第三人称模型"),
            ("fp", "第一人称", "导入第一人称模型"),
            ("both", "全部", "同时导入第一和第三人称"),
        ], default="tp")  # type: ignore
    char_sel_lod: EnumProperty(
        name="LOD", description="LOD 级别筛选",
        items=[
            ("0", "LOD0", "最高精度"),
            ("all", "全部 LOD", "导入所有 LOD 级别"),
        ], default="0")  # type: ignore
    char_sel_anim_type: EnumProperty(
        name="动画类型", description="Select animation category",
        items=[
            ("char_tp", "Char TP", "Character third-person"),
            ("char_fp", "Char FP", "Character first-person"),
            ("prop_tp", "Prop TP", "Prop third-person"),
            ("prop_fp", "Prop FP", "Prop first-person"),
        ], default="char_tp", update=on_anim_type_changed)  # type: ignore
    char_sel_anim_weapon: EnumProperty(
        name="武器", description="Select weapon variant",
        items=get_anim_weapon_enum, update=on_anim_weapon_changed)  # type: ignore
    char_sel_anim_armature: PointerProperty(
        name="目标骨骼", type=bpy.types.Object,
        poll=lambda self, obj: obj.type == 'ARMATURE',
        description="Target armature for animation import")  # type: ignore
    char_sel_anim_set_framedrop: BoolProperty(
        name="播放同步到实时",
        description="导入后把场景播放同步模式设为 Frame Dropping。\n"
                    "Blender 默认的 Play Every Frame 是「渲染完一帧才推进帧号」，"
                    "渲染跟不上设定帧率时会让预览整体变慢；"
                    "改成实时推进后与游戏/Babylon 的播放速度一致。",
        default=True)  # type: ignore
    char_anim_items: CollectionProperty(
        name="动画列表", type=PDE_AnimListItem,
        description="List of available animations")  # type: ignore
    char_anim_index: IntProperty(
        name="动画索引", default=0, description="Active animation list index")  # type: ignore
    char_sel_part_armature: PointerProperty(
        name="目标骨骼", type=bpy.types.Object,
        poll=lambda self, obj: obj.type == 'ARMATURE',
        description="Target armature for accessory import")  # type: ignore
    weapon_search_filter: StringProperty(
        name="搜索", default="", description="过滤武器列表")  # type: ignore
    weapon_sel_name: StringProperty(
        name="Weapon", default="NONE", description="Selected weapon name")  # type: ignore
    weapon_sel_lod: EnumProperty(
        name="LOD",
        items=[("0", "LOD 0", ""), ("1", "LOD 1", ""), ("2", "LOD 2", "")],
        default="0")  # type: ignore
    weapon_import_fx: BoolProperty(
        name="Import FX", default=False,
        description="Import enhancement effect meshes")  # type: ignore
    weapon_sel_fx_level: EnumProperty(
        name="FX Level", items=_get_fx_level_enum,
        description="Enhancement level for FX meshes")  # type: ignore
    weapon_items: CollectionProperty(
        name="武器列表", type=PDE_WeaponListItem,
        description="List of available weapons (populated from weapon.json)")  # type: ignore
    weapon_index: IntProperty(
        name="武器索引", default=0, description="Active weapon list index",
        update=lambda self, context: on_weapon_index_changed(self, context))  # type: ignore
    scene_sel_name: StringProperty(
        name="Scene", default="NONE", description="Selected scene file name")  # type: ignore
    scene_import_objects: BoolProperty(
        name="Objects", default=True,
        description="Import active objects (windmills, radars, etc.)")  # type: ignore
    scene_import_gates: BoolProperty(
        name="Gates", default=True, description="Import gate meshes")  # type: ignore
    scene_items: CollectionProperty(
        name="场景列表", type=PDE_SceneListItem,
        description="List of available scenes")  # type: ignore
    scene_index: IntProperty(
        name="场景索引", default=0, description="Active scene list index",
        update=lambda self, context: on_scene_index_changed(self, context))  # type: ignore


class PDEStudioAddonPreferences(AddonPreferences):
    """插件偏好设置，存储 VFS 根目录等用户配置（跨会话持久化）。

    bl_idname 在 registration.register() 中动态设置为主包名。
    必须实现 draw() 方法，否则 Blender 不会在偏好设置中显示
    本插件的配置项，也不会正确持久化属性值。
    """

    bl_idname = ""  # 由 registration.register() 动态设置

    client_exe_path: StringProperty(
        name="Client.exe 路径", subtype="FILE_PATH", default="",
        description="client.exe 的完整路径（用于编译 .cache 文件）")  # type: ignore

    vfs_root: StringProperty(
        name="VFS根目录", subtype="DIR_PATH", default="",
        description="原版游戏 cache 根目录，跨会话持久保存")  # type: ignore

    def draw(self, context):
        """在 Edit > Preferences > Add-ons 面板中绘制偏好设置 UI。

        Blender 要求 AddonPreferences 子类实现此方法，
        否则属性值不会被正确序列化到用户偏好文件。
        """
        layout = self.layout
        layout.prop(self, "vfs_root")
        layout.prop(self, "client_exe_path")
