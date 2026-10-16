# shader_panel.py
"""PDE Studio - 着色器与 Uniform 编辑面板区块

提供面板绘制函数，由 primitive_panel.py 的主面板调用。
包含着色器( VS/PS )编辑区块和数值 uniform 编辑区块。
"""

from .primitive_operators import ensure_pde_material
from .primitive_shader_operators import (
    get_shaders,
    get_lod0_uniforms,
)


# =============================================================================
# 着色器区块
# =============================================================================

def draw_shader_section(layout, obj):
    """着色器路径编辑: 遍历对象的材质，显示 VS/PS 列表"""
    if not obj.data or not obj.data.materials:
        return

    box = layout.box()
    box.label(text="着色器 / Shaders", icon="SHADERFX")

    for mat_idx, mat in enumerate(obj.data.materials):
        if mat is None:
            continue

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

        _draw_shader_list(col, mat_idx, mat, "vertex", "VS")
        _draw_shader_list(col, mat_idx, mat, "pixel", "PS")
        box.separator()


def _draw_shader_list(col, mat_idx, mat, shader_type, label):
    """绘制单个着色器列表 (VS 或 PS)"""
    shaders = get_shaders(mat, shader_type)

    row = col.row(align=True)
    row.label(text=f"{label}:", icon="NODE")
    if not shaders:
        row.label(text="(空)")
    else:
        for lod, name in enumerate(shaders):
            sub = col.row(align=True)
            sub.label(text=f"  LOD{lod}:")
            # 显示着色器名（截断）
            display = name if len(name) <= 25 else "..." + name[-22:]
            sub.label(text=display)

            op = sub.operator("pde_studio.edit_shader",
                               text="", icon="EYEDROPPER")
            op.material_index = mat_idx
            op.shader_type = shader_type
            op.lod = lod
            op.new_name = name

        # 删除最后一项
        sub = col.row(align=True)
        sub.label(text="")
        op = sub.operator("pde_studio.remove_shader",
                           text="删除末尾 LOD", icon="REMOVE")
        op.material_index = mat_idx
        op.shader_type = shader_type

    # 添加 LOD
    row = col.row(align=True)
    row.label(text=f"添加 {label} LOD:")
    op = row.operator("pde_studio.add_shader", text="添加", icon="ADD")
    op.material_index = mat_idx
    op.shader_type = shader_type


# =============================================================================
# Uniform 区块
# =============================================================================

def draw_uniform_section(layout, obj):
    """数值 uniform 编辑: 遍历对象的材质，显示 pixel uniform 列表"""
    if not obj.data or not obj.data.materials:
        return

    box = layout.box()
    box.label(text="数值参数 / Uniforms", icon="OPTIONS")

    for mat_idx, mat in enumerate(obj.data.materials):
        if mat is None:
            continue

        col = box.column(align=True)
        col.label(text=f"材质: {mat.name}", icon="MATERIAL")

        pde_mat = mat.get("pde_material")
        if pde_mat is None:
            row = col.row()
            row.label(text="无 PDE 材质数据", icon="ERROR")
            continue

        _draw_uniform_list(col, mat_idx, mat, "pixel", "PS")
        _draw_uniform_list(col, mat_idx, mat, "vertex", "VS")
        box.separator()


def _draw_uniform_list(col, mat_idx, mat, uniform_type, label):
    """绘制单个 uniform 列表"""
    uniforms = get_lod0_uniforms(mat, uniform_type)

    row = col.row(align=True)
    row.label(text=f"{label} Uniform:", icon="NODE")
    if not uniforms:
        row.label(text="(空)")
    else:
        for u_idx, u in enumerate(uniforms):
            tn = u.get("type_name", "")
            values = u.get("values", [])
            val_str = ", ".join(f"{v:g}" for v in values)

            sub = col.row(align=True)
            sub.label(text=f"  {tn}")
            # 截断显示值
            display = val_str if len(val_str) <= 25 else "..." + val_str[-22:]
            sub.label(text=display)

            op = sub.operator("pde_studio.edit_uniform",
                               text="", icon="EYEDROPPER")
            op.material_index = mat_idx
            op.uniform_type = uniform_type
            op.uniform_index = u_idx
            op.type_name = tn
            op.value_str = val_str

            op = sub.operator("pde_studio.remove_uniform",
                               text="", icon="X")
            op.material_index = mat_idx
            op.uniform_type = uniform_type
            op.uniform_index = u_idx

    # 添加 uniform
    row = col.row(align=True)
    row.label(text=f"添加 {label}:")
    op = row.operator("pde_studio.add_uniform", text="添加", icon="ADD")
    op.material_index = mat_idx
    op.uniform_type = uniform_type
