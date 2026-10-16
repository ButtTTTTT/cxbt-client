# primitive_texture_operators.py
"""PDE Studio - Primitive 贴图编辑操作符

贴图路径的增删改操作，读写材质的 pde_material.texture_uniform 属性。
辅助函数和枚举定义在 primitive_operators.py 中。
"""

import bpy
from bpy.types import Operator
from bpy.props import IntProperty, EnumProperty, StringProperty

from .primitive_operators import (
    TEXTURE_TYPE_ITEMS,
    ensure_pde_material,
    get_lod0_textures,
    set_lod0_textures,
)


# =============================================================================
# Operator: 编辑贴图路径
# =============================================================================

class PDE_OT_EditTexturePath(Operator):
    """编辑材质的贴图路径

    将材质 pde_material.texture_uniform LOD0 中指定索引的贴图路径更新为新值。
    """

    bl_idname = "pde_studio.edit_texture_path"
    bl_label = "编辑贴图路径"
    bl_options = {'REGISTER', 'UNDO'}

    material_index: IntProperty(default=0, description="材质在对象中的索引")  # type: ignore
    texture_index: IntProperty(default=0, description="贴图在 LOD0 中的索引")  # type: ignore
    new_path: StringProperty(default="", description="新的贴图 VFS 路径")  # type: ignore

    @classmethod
    def poll(cls, context):
        obj = context.active_object
        return obj is not None and obj.type == 'MESH'

    def execute(self, context):
        obj = context.active_object
        if self.material_index >= len(obj.data.materials):
            self.report({"ERROR"}, "材质索引超出范围")
            return {"CANCELLED"}
        mat = obj.data.materials[self.material_index]
        if mat is None:
            self.report({"ERROR"}, "材质为空")
            return {"CANCELLED"}
        ensure_pde_material(mat)
        textures = get_lod0_textures(mat)
        if self.texture_index >= len(textures):
            self.report({"ERROR"}, "贴图索引超出范围")
            return {"CANCELLED"}
        tn, _ = textures[self.texture_index]
        textures[self.texture_index] = (tn, self.new_path)
        set_lod0_textures(mat, textures)
        self.report({"INFO"}, f"贴图路径已更新: {tn} = {self.new_path}")
        return {"FINISHED"}


# =============================================================================
# Operator: 添加贴图行
# =============================================================================

class PDE_OT_AddTexture(Operator):
    """向材质添加一条贴图定义"""

    bl_idname = "pde_studio.add_texture"
    bl_label = "添加贴图"
    bl_options = {'REGISTER', 'UNDO'}

    material_index: IntProperty(default=0)  # type: ignore
    tex_type: EnumProperty(items=TEXTURE_TYPE_ITEMS, default="ColorMap")  # type: ignore
    tex_path: StringProperty(default="", description="贴图 VFS 路径")  # type: ignore

    @classmethod
    def poll(cls, context):
        obj = context.active_object
        return obj is not None and obj.type == 'MESH'

    def execute(self, context):
        obj = context.active_object
        if self.material_index >= len(obj.data.materials):
            self.report({"ERROR"}, "材质索引超出范围")
            return {"CANCELLED"}
        mat = obj.data.materials[self.material_index]
        if mat is None:
            self.report({"ERROR"}, "材质为空")
            return {"CANCELLED"}
        ensure_pde_material(mat)
        textures = get_lod0_textures(mat)
        textures.append((self.tex_type, self.tex_path))
        set_lod0_textures(mat, textures)
        self.report({"INFO"}, f"已添加贴图: {self.tex_type} = {self.tex_path}")
        return {"FINISHED"}


# =============================================================================
# Operator: 删除贴图行
# =============================================================================

class PDE_OT_RemoveTexture(Operator):
    """从材质中删除一条贴图定义"""

    bl_idname = "pde_studio.remove_texture"
    bl_label = "删除贴图"
    bl_options = {'REGISTER', 'UNDO'}

    material_index: IntProperty(default=0)  # type: ignore
    texture_index: IntProperty(default=0)  # type: ignore

    @classmethod
    def poll(cls, context):
        obj = context.active_object
        return obj is not None and obj.type == 'MESH'

    def execute(self, context):
        obj = context.active_object
        if self.material_index >= len(obj.data.materials):
            self.report({"ERROR"}, "材质索引超出范围")
            return {"CANCELLED"}
        mat = obj.data.materials[self.material_index]
        if mat is None:
            self.report({"ERROR"}, "材质为空")
            return {"CANCELLED"}
        ensure_pde_material(mat)
        textures = get_lod0_textures(mat)
        if self.texture_index >= len(textures):
            self.report({"ERROR"}, "贴图索引超出范围")
            return {"CANCELLED"}
        removed = textures.pop(self.texture_index)
        set_lod0_textures(mat, textures)
        self.report({"INFO"}, f"已删除贴图: {removed[0]}")
        return {"FINISHED"}


# =============================================================================
# Operator: 创建 PDE 材质
# =============================================================================

class PDE_OT_CreatePDEMaterial(Operator):
    """为当前材质创建 PDE 材质数据结构"""

    bl_idname = "pde_studio.create_pde_material"
    bl_label = "创建 PDE 材质"
    bl_options = {'REGISTER', 'UNDO'}

    material_index: IntProperty(default=0)  # type: ignore

    @classmethod
    def poll(cls, context):
        obj = context.active_object
        return obj is not None and obj.type == 'MESH'

    def execute(self, context):
        obj = context.active_object
        if self.material_index >= len(obj.data.materials):
            self.report({"ERROR"}, "材质索引超出范围")
            return {"CANCELLED"}
        mat = obj.data.materials[self.material_index]
        if mat is None:
            self.report({"ERROR"}, "材质为空")
            return {"CANCELLED"}
        ensure_pde_material(mat)
        self.report({"INFO"}, f"已创建 PDE 材质数据: {mat.name}")
        return {"FINISHED"}
