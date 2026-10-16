# primitive_panel.py
"""PDE Studio - Primitive 属性编辑面板

独立侧边栏面板 (bl_category="PDE Primitive")，选中 Mesh 时显示。
可直接编辑碰撞模式、物理材质、渲染属性、贴图路径。
"""

from bpy.types import Panel

from .primitive_operators import (
    get_lod0_textures,
    col_mode_label,
    phys_mat_label,
    blend_label,
    blend_to_text_val,
    cull_label,
)
from .shader_panel import (
    draw_shader_section,
    draw_uniform_section,
)


# =============================================================================
# 主面板
# =============================================================================

class PDE_PT_PrimitivePropsPanel(Panel):
    """Primitive 属性编辑面板 — 显示和编辑当前选中 Mesh 的全部 Primitive 属性"""

    bl_idname = "PDE_PT_primitive_props_panel"
    bl_label = "Primitive 属性"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PDE Primitive"

    @classmethod
    def poll(cls, context):
        obj = context.active_object
        return obj is not None and obj.type == 'MESH'

    def draw(self, context):
        layout = self.layout
        obj = context.active_object

        layout.label(text=f"对象: {obj.name}", icon="MESH_DATA")

        prim = obj.get("pde_primitive", None)
        if prim is None:
            box = layout.box()
            box.label(text="无 Primitive 属性", icon="ERROR")
            box.label(text="（导入时自动生成，或手动创建）")
            box.operator("pde_studio.init_primitive_props",
                         text="初始化默认属性", icon="ADD")
            _draw_texture_section(layout, obj)
            _draw_batch_section(layout)
            return

        _draw_collision_section(layout, prim)
        _draw_render_section(layout, prim)
        _draw_texture_section(layout, obj)
        draw_shader_section(layout, obj)
        draw_uniform_section(layout, obj)
        _draw_batch_section(layout)


# =============================================================================
# 碰撞区块
# =============================================================================

def _draw_collision_section(layout, prim):
    """碰撞模式 + 物理材质"""
    col_mode = prim.get("collision_mode", 1)
    phys_mat = prim.get("physics_material", 0)

    box = layout.box()
    box.label(text="碰撞 / Collision", icon="PHYSICS")

    # 碰撞模式下拉
    row = box.row(align=True)
    row.label(text="模式:", icon="DOT")
    op = row.operator("pde_studio.set_collision", text=col_mode_label(col_mode))
    op.mode = str(col_mode)

    # 快捷按钮
    row = box.row(align=True)
    row.operator("pde_studio.set_collision", text="1 静态", icon="FORWARD").mode = "1"
    row.operator("pde_studio.set_collision", text="0 无", icon="X").mode = "0"
    row.operator("pde_studio.set_collision", text="2 人物", icon="MOD_ARMATURE").mode = "2"

    row = box.row(align=True)
    row.operator("pde_studio.set_collision", text="3 动态").mode = "3"
    row.operator("pde_studio.set_collision", text="4 射线").mode = "4"
    row.operator("pde_studio.set_collision", text="5 门A", icon="MOD_SOLIDIFY").mode = "5"
    row.operator("pde_studio.set_collision", text="6 门B", icon="MOD_SOLIDIFY").mode = "6"

    # 物理材质下拉
    row = box.row(align=True)
    row.label(text="材质:", icon="MATERIAL")
    op = row.operator("pde_studio.set_physics_material",
                       text=phys_mat_label(phys_mat))
    op.material = str(phys_mat)


# =============================================================================
# 渲染区块
# =============================================================================

def _draw_render_section(layout, prim):
    """渲染属性: 可见性 / BlendLayer / BlendMode / CullMode

    每行显示当前值 + 快捷切换按钮（点击执行）。
    """
    visible = prim.get("visible", True)
    layer = prim.get("layer", 0)
    blend = blend_to_text_val(prim.get("blend_mode", 1))
    cull = prim.get("cull_mode", 1)  # 引擎默认 CCW

    box = layout.box()
    box.label(text="渲染 / Render", icon="RESTRICT_VIEW_OFF")

    # 可见性: 切换按钮
    row = box.row(align=True)
    row.label(text="可见:", icon="HIDE_OFF")
    if visible:
        op = row.operator("pde_studio.set_visible", text="是 ✓")
        op.visible = "0"
        op = row.operator("pde_studio.set_visible", text="否")
        op.visible = "1"
    else:
        op = row.operator("pde_studio.set_visible", text="是")
        op.visible = "0"
        op = row.operator("pde_studio.set_visible", text="否 ✓")
        op.visible = "1"

    # BlendLayer: 0/1 切换
    row = box.row(align=True)
    row.label(text="BlendLayer:")
    for val in (0, 1):
        label = f"{val}" + (" ✓" if layer == val else "")
        op = row.operator("pde_studio.set_blend_layer", text=label)
        op.blend_layer = str(val)

    # BlendMode: 4 个选项 (文本值 0-3)
    row = box.row(align=True)
    row.label(text="BlendMode:")
    op = row.operator("pde_studio.set_blend_mode",
                       text=blend_label(blend))
    op.blend_mode = str(blend)

    # 快捷按钮
    row = box.row(align=True)
    for val, name in [(0, "不透明"), (1, "半透明"), (2, "AlphaTest"), (3, "Additive")]:
        label = name + (" ✓" if blend == val else "")
        op = row.operator("pde_studio.set_blend_mode", text=label)
        op.blend_mode = str(val)

    # CullMode: 3 个选项 (CW=0, CCW=1, None=2)
    row = box.row(align=True)
    row.label(text="CullMode:")
    for val in (0, 1, 2):
        label = cull_label(val) + (" ✓" if cull == val else "")
        op = row.operator("pde_studio.set_cull_mode", text=label)
        op.cull_mode = str(val)


# =============================================================================
# 贴图区块
# =============================================================================

def _draw_texture_section(layout, obj):
    """贴图路径编辑: 遍历对象的材质，显示 LOD0 贴图列表"""
    if not obj.data or not obj.data.materials:
        return

    box = layout.box()
    box.label(text="贴图 / Textures", icon="TEXTURE")

    for mat_idx, mat in enumerate(obj.data.materials):
        if mat is None:
            continue

        # 材质名
        col = box.column(align=True)
        col.label(text=f"材质: {mat.name}", icon="MATERIAL")

        pde_mat = mat.get("pde_material")
        if pde_mat is None:
            row = col.row()
            row.label(text="无 PDE 材质数据", icon="ERROR")
            op = row.operator("pde_studio.create_pde_material",
                               text="创建", icon="ADD")
            op.material_index = mat_idx
            continue

        textures = get_lod0_textures(mat)
        if not textures:
            row = col.row()
            row.label(text="无贴图", icon="INFO")
        else:
            for tex_idx, (tn, path) in enumerate(textures):
                row = col.row(align=True)
                row.label(text=tn)
                # 显示路径（截断显示）
                display_path = path if len(path) <= 30 else "..." + path[-27:]
                row.label(text=display_path)

                # 编辑按钮: 弹出输入框
                op = row.operator("pde_studio.edit_texture_path",
                                   text="", icon="EYEDROPPER")
                op.material_index = mat_idx
                op.texture_index = tex_idx
                op.new_path = path

                # 删除按钮
                op = row.operator("pde_studio.remove_texture",
                                   text="", icon="X")
                op.material_index = mat_idx
                op.texture_index = tex_idx

        # 添加贴图行
        row = col.row(align=True)
        row.label(text="添加:")
        op = row.operator("pde_studio.add_texture", text="ColorMap", icon="ADD")
        op.material_index = mat_idx
        op.tex_type = "ColorMap"
        op = row.operator("pde_studio.add_texture", text="NormalMap", icon="ADD")
        op.material_index = mat_idx
        op.tex_type = "NormalMap"

        box.separator()


# =============================================================================
# 批量区块
# =============================================================================

def _draw_batch_section(layout):
    """批量操作"""
    box = layout.box()
    box.label(text="批量 / Batch", icon="GROUP")
    box.operator("pde_studio.batch_set_collision",
                  text="批量设置选中对象碰撞模式",
                  icon="GROUP")
