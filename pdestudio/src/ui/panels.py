# panels.py
"""PDE Studio 导出面板"""

import bpy

from ..exporter.export_utils import get_pexport_dir


# 面板共用绘制辅助函数

def _draw_mesh_settings(layout, props):
    """绘制通用 Mesh 设置 + 顶点数据区块（各 Mesh 面板共用）"""
    layout.label(text="Mesh 设置", icon="MESH_DATA")
    box = layout.box()
    box.prop(props, "export_mesh_type", text="类型")
    box.prop(props, "export_material_type", text="材质")
    box.prop(props, "export_apply_modifiers", text="应用修改器")
    box.prop(props, "export_mesh_scale", text="位置缩放")

    layout.label(text="顶点数据", icon="UV")
    box = layout.box()
    box.prop(props, "export_uv_count", text="UV集")
    box.prop(props, "export_tangents", text="切线/副法线")
    box.prop(props, "export_vertex_colors", text="顶点色")


def _draw_armature_info(layout, context):
    """绘制选中骨骼信息（Skel/Anim 面板共用）"""
    armature = None
    for obj in context.selected_objects:
        if obj.type == 'ARMATURE':
            armature = obj
            break
    if armature:
        layout.label(text=f"骨骼: {armature.name}", icon="BONE_DATA")
    else:
        layout.label(text="请选择一个骨骼对象", icon="ERROR")
    return armature


def _draw_anim_fps_status(layout, context):
    """绘制 PDE 动画帧率状态（不一致时直接给出修正按钮）

    scene.render.fps 是全局值，加载别的 .blend 或手动修改都会覆盖它。
    帧率不对时：时间轴播放速度错，导出 glTF 的动画时长也会整体偏差。
    """
    try:
        from ..core.anim_fps import check_scene_fps
        info = check_scene_fps(context.scene)
    except Exception:
        return

    if not info["actions"]:
        return                                  # 场景里没有 PDE 动画，不占地方

    layout.label(text="动画帧率 / Animation FPS", icon="TIME")
    box = layout.box()

    if info["mixed"]:
        box.label(text="存在帧率不一致的 PDE 动画", icon="ERROR")
        box.label(text=f"帧率: {info.get('fps_values')}", icon="INFO")
        return

    if info["ok"]:
        box.label(
            text=f"{info['actual']:g} fps  ({len(info['actions'])} 个动画)",
            icon="CHECKMARK",
        )
        return

    box.label(
        text=f"当前 {info['actual']:g} fps，应为 {info['expected']:g} fps",
        icon="ERROR",
    )
    box.label(text=f"{len(info['actions'])} 个动画的播放速度不对", icon="INFO")
    box.operator(
        "pde_studio.fix_scene_fps",
        text=f"修正为 {info['expected']:g} fps",
        icon="FILE_REFRESH",
    )


# 主面板 — 通用设置

class PDE_PT_MainPanel(bpy.types.Panel):
    """PDE Studio 主面板"""

    bl_idname = "PDE_PT_main_panel"
    bl_label = "PDE Studio Export v0.1.0"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Export"

    def draw(self, context):
        layout = self.layout
        props = context.scene.pde_studio_props

        layout.label(text="导出根目录 / pexport", icon="FILE_FOLDER")
        box = layout.box()
        row = box.row()
        row.alignment = "CENTER"

        pexport_dir = get_pexport_dir(context)
        if pexport_dir:
            row.label(text=pexport_dir)
            row = box.row()
            row.label(text="(基于 VFS 根目录自动推导)", icon="INFO")
        else:
            row.label(text="请先设置 VFS 根目录!", icon="ERROR")

        layout.label(text="通用选项 / General", icon="SETTINGS")
        box = layout.box()
        box.prop(props, "export_selected_only", text="仅导出选中")
        box.prop(props, "export_gen_build_script", text="生成编译脚本")

        _draw_anim_fps_status(layout, context)


# 场景 Mesh 导出面板

class PDE_PT_SceneMeshPanel(bpy.types.Panel):
    """场景 Mesh 导出面板

    对应原版 MEL: inv_exportMeshScene()
    导出场景中的唯一 mesh 到 mesh/scene/<name>/ 目录。
    """

    bl_idname = "PDE_PT_scene_mesh_panel"
    bl_label = "场景 Mesh 导出 / Scene Mesh"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Export"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout
        props = context.scene.pde_studio_props

        layout.operator(
            "pde_studio.export_scene_mesh",
            text="导出场景 .mesh / Export Scene Mesh",
            icon="EXPORT",
        )

        mesh_objects = [o for o in context.scene.objects if o.type == 'MESH']
        if len(mesh_objects) == 1:
            layout.label(text=f"场景 Mesh: {mesh_objects[0].name}", icon="MESH_DATA")
        elif len(mesh_objects) > 1:
            layout.label(
                text=f"警告: 场景有 {len(mesh_objects)} 个 Mesh (将导出第一个)",
                icon="ERROR",
            )
        else:
            layout.label(text="场景无 Mesh 对象", icon="ERROR")

        _draw_mesh_settings(layout, props)


# 第一人称 Mesh 导出面板

class PDE_PT_FirstPersonMeshPanel(bpy.types.Panel):
    """第一人称 Mesh 导出面板

    对应原版 MEL: inv_exportMeshCharacterFirstPerson()
    按部件名过滤 (arm/cloth/hand)，导出到
    mesh/character/firstPerson/<charName>/<gender>/ 目录。
    """

    bl_idname = "PDE_PT_fp_mesh_panel"
    bl_label = "第一人称 Mesh / FP Mesh"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Export"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout
        props = context.scene.pde_studio_props

        layout.operator(
            "pde_studio.export_fp_mesh",
            text="导出第一人称 .mesh / Export FP Mesh",
            icon="EXPORT",
        )

        layout.label(text="角色信息", icon="ARMATURE_DATA")
        box = layout.box()
        box.prop(props, "export_fp_char_name", text="角色名")
        box.prop(props, "export_fp_gender", text="性别")

        layout.label(text="部件过滤 (arm/cloth/hand)", icon="FILTER")
        box = layout.box()
        matched = _find_fp_parts(context)
        if matched:
            for name, part in matched:
                box.label(text=f"{part}: {name}", icon="MESH_DATA")
        else:
            box.label(text="未找到 FP 部件", icon="ERROR")

        _draw_mesh_settings(layout, props)


# 第三人称 Mesh 导出面板

class PDE_PT_ThirdPersonMeshPanel(bpy.types.Panel):
    """第三人称 Mesh 导出面板

    对应原版 MEL: inv_exportMeshCharacterThirdPerson()
    按部件名过滤 (hat/head/goggle/hand/bag/cloth/pant/shoes)，
    导出到 mesh/character/thirdPerson/<charName>/<gender>/<part>/ 目录。
    """

    bl_idname = "PDE_PT_tp_mesh_panel"
    bl_label = "第三人称 Mesh / TP Mesh"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Export"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout
        props = context.scene.pde_studio_props

        layout.operator(
            "pde_studio.export_tp_mesh",
            text="导出第三人称 .mesh / Export TP Mesh",
            icon="EXPORT",
        )

        layout.label(text="角色信息", icon="ARMATURE_DATA")
        box = layout.box()
        box.prop(props, "export_tp_char_name", text="角色名")
        box.prop(props, "export_tp_gender", text="性别")

        layout.label(text="部件过滤 (hat/head/goggle/hand/bag/cloth/pant/shoes)", icon="FILTER")
        box = layout.box()
        matched = _find_tp_parts(context)
        if matched:
            for name, part in matched:
                box.label(text=f"{part}: {name}", icon="MESH_DATA")
        else:
            box.label(text="未找到 TP 部件", icon="ERROR")

        _draw_mesh_settings(layout, props)


# 道具 Mesh 导出面板

class PDE_PT_PropMeshPanel(bpy.types.Panel):
    """道具 Mesh 导出面板

    对应原版 MEL: inv_exportMeshProp()
    遍历场景中所有 mesh，导出到 mesh/prop/<propName>/ 目录。
    """

    bl_idname = "PDE_PT_prop_mesh_panel"
    bl_label = "道具 Mesh / Prop Mesh"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Export"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout
        props = context.scene.pde_studio_props

        layout.operator(
            "pde_studio.export_prop_mesh",
            text="导出道具 .mesh / Export Prop Mesh",
            icon="EXPORT",
        )

        layout.label(text="道具名称", icon="OBJECT_DATAMODE")
        box = layout.box()
        box.prop(props, "export_prop_name", text="名称")

        mesh_objects = [o for o in context.scene.objects if o.type == 'MESH']
        if mesh_objects:
            box.label(text=f"将导出 {len(mesh_objects)} 个 Mesh:", icon="MESH_DATA")
            for obj in mesh_objects:
                box.label(text=f"  {obj.name}", icon="MESH_DATA")
        else:
            box.label(text="场景无 Mesh 对象", icon="ERROR")

        _draw_mesh_settings(layout, props)


# Skeleton 导出面板

class PDE_PT_SkelPanel(bpy.types.Panel):
    """Skeleton 导出面板

    对应原版 MEL: pdeExportSkeleton.mel
    支持角色骨骼 (skeleton/character/) 和道具骨骼 (skeleton/prop/) 两种路径。
    """

    bl_idname = "PDE_PT_skel_panel"
    bl_label = "Skel 导出 / Skeleton Export"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Export"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout
        props = context.scene.pde_studio_props

        layout.label(text="角色骨骼 / Character", icon="ARMATURE_DATA")
        box = layout.box()
        box.prop(props, "export_skel_char_name", text="角色名")
        box.operator(
            "pde_studio.export_char_skel",
            text="导出角色 .skel / Export Char Skel",
            icon="EXPORT",
        )

        layout.label(text="道具骨骼 / Prop", icon="OBJECT_DATAMODE")
        box = layout.box()
        box.prop(props, "export_skel_prop_name", text="道具名")
        box.operator(
            "pde_studio.export_prop_skel",
            text="导出道具 .skel / Export Prop Skel",
            icon="EXPORT",
        )

        layout.label(text="通用骨骼设置", icon="BONE_DATA")
        box = layout.box()
        box.prop(props, "export_skeleton_scale", text="缩放(×100=厘米)")
        _draw_armature_info(box, context)


# Animation 导出面板

class PDE_PT_AnimPanel(bpy.types.Panel):
    """Animation 导出面板

    对应原版 MEL: pdeExportAnimation.mel
    支持角色 FP/TP 动画和道具 FP/TP 动画四种路径。
    """

    bl_idname = "PDE_PT_anim_panel"
    bl_label = "Anim 导出 / Animation Export"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Export"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout
        props = context.scene.pde_studio_props

        layout.label(text="角色动画 / Character Animation", icon="ARMATURE_DATA")
        box = layout.box()
        box.prop(props, "export_anim_char_name", text="角色名")
        box.prop(props, "export_anim_weapon_name", text="武器名")
        box.prop(props, "export_anim_name", text="动画名")
        row = box.row()
        row.operator(
            "pde_studio.export_char_fp_anim",
            text="FP / 第一人称",
            icon="EXPORT",
        )
        row.operator(
            "pde_studio.export_char_tp_anim",
            text="TP / 第三人称",
            icon="EXPORT",
        )

        layout.label(text="道具动画 / Prop Animation", icon="OBJECT_DATAMODE")
        box = layout.box()
        box.prop(props, "export_anim_prop_name", text="道具名(武器)")
        box.prop(props, "export_anim_name", text="动画名")
        row = box.row()
        row.operator(
            "pde_studio.export_prop_fp_anim",
            text="FP / 第一人称",
            icon="EXPORT",
        )
        row.operator(
            "pde_studio.export_prop_tp_anim",
            text="TP / 第三人称",
            icon="EXPORT",
        )

        layout.label(text="通用动画设置", icon="ANIM")
        box = layout.box()
        box.prop(props, "export_anim_fps", text="帧率(96fps)")
        box.prop(props, "export_anim_scale", text="位置缩放(×100=厘米)")
        box.prop(props, "export_anim_sample_mode", text="采样模式")

        layout.label(text="帧范围", icon="RENDER_ANIMATION")
        box = layout.box()
        box.prop(props, "export_anim_start_frame", text="起始帧")
        box.prop(props, "export_anim_end_frame", text="结束帧")

        armature = _draw_armature_info(box, context)
        if armature and armature.animation_data and armature.animation_data.action:
            action = armature.animation_data.action
            box.label(text=f"动作: {action.name}", icon="ACTION")
            if action.frame_range:
                box.label(text=f"帧范围: {int(action.frame_range[0])} - {int(action.frame_range[1])}")
        elif armature:
            box.label(text="骨骼无活动动作", icon="QUESTION")


# 帮助面板

class PDE_PT_HelpPanel(bpy.types.Panel):
    """帮助面板"""

    bl_idname = "PDE_PT_help_panel"
    bl_label = "帮助 / Help"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Export"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout
        col = layout.box().column()
        col.label(text="PDE Studio v0.1.0 - PDE引擎模型导出工具")
        col.label(text="支持 Blender 5.1.2+")
        col.label(text="")
        col.label(text="导出流程:")
        col.label(text="1. 在 Blender 中创建/编辑模型")
        col.label(text="2. 使用本插件导出 .mesh/.skel/.anim")
        col.label(text="3. 用 client.exe 编译为 .cache")
        col.label(text="")
        col.label(text="Mesh 导出类型:")
        col.label(text="- 场景 Mesh: 场景地图碰撞体")
        col.label(text="- 第一人称: 角色 FP 手臂/衣物/手")
        col.label(text="- 第三人称: 角色 TP 全身部件")
        col.label(text="- 道具 Mesh: 武器/道具模型")
        col.label(text="")
        col.label(text="注意:")
        col.label(text="- 网格缩放默认×100（文本格式用厘米，加载器×0.01转米）")
        col.label(text="- 动画固定 96fps 帧率")
        col.label(text="- 贴图引用仅包含文件名(无路径后缀)")
        col.label(text="- 仅用于学习研究，请勿用于商业用途!")


# 辅助函数 — 部件名匹配

# 第一人称部件名列表 (对应原版 MEL: exportFirstPersonParts)
_FP_PARTS = ("arm", "cloth", "hand")

# 第三人称部件名列表 (对应原版 MEL: exportThirdPersonParts)
_TP_PARTS = ("hat", "head", "goggle", "hand", "bag", "cloth", "pant", "shoes")


def _match_part_name(obj_name: str, parts: tuple) -> str | None:
    """从对象名中匹配部件类型

    对应原版 MEL: match("[^_]+$",$objA) + match("...",$temp1) 的前3字符匹配逻辑。
    在 Blender 中简化为: 将对象名按 _ 分割，检查最后一段是否包含部件名。
    """
    tokens = obj_name.lower().split("_")
    if len(tokens) < 2:
        return None
    last_token = tokens[-1]
    for part in parts:
        if part in last_token:
            return part
    return None


def _find_fp_parts(context) -> list:
    """查找场景中匹配第一人称部件的 mesh 对象

    Returns:
        [(obj_name, part_name), ...] 匹配列表
    """
    result = []
    for obj in context.scene.objects:
        if obj.type != 'MESH':
            continue
        part = _match_part_name(obj.name, _FP_PARTS)
        if part:
            result.append((obj.name, part))
    return result


def _find_tp_parts(context) -> list:
    """查找场景中匹配第三人称部件的 mesh 对象

    Returns:
        [(obj_name, part_name), ...] 匹配列表
    """
    result = []
    for obj in context.scene.objects:
        if obj.type != 'MESH':
            continue
        part = _match_part_name(obj.name, _TP_PARTS)
        if part:
            result.append((obj.name, part))
    return result
