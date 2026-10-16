# primitive_shader_operators.py
"""PDE Studio - 着色器编辑操作符

顶点/像素着色器列表的增删改操作，读写材质的 pde_material.vertex_shaders /
pixel_shaders 属性。
"""

import bpy
from bpy.types import Operator
from bpy.props import StringProperty, IntProperty

from .primitive_operators import ensure_pde_material


# =============================================================================
# Operator: 编辑着色器名
# =============================================================================

class PDE_OT_EditShader(Operator):
    """编辑材质的着色器名（VS 或 PS 的指定 LOD）"""

    bl_idname = "pde_studio.edit_shader"
    bl_label = "编辑着色器"
    bl_options = {'REGISTER', 'UNDO'}

    material_index: IntProperty(default=0)  # type: ignore
    shader_type: StringProperty(  # type: ignore  # "vertex" or "pixel"
        description="'vertex' 或 'pixel'")
    lod: IntProperty(default=0, description="LOD 级别")  # type: ignore
    new_name: StringProperty(default="", description="新的着色器名")  # type: ignore

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
        pde_mat = mat["pde_material"]
        key = f"{self.shader_type}_shaders"
        shaders = pde_mat.get(key, [])
        while len(shaders) <= self.lod:
            shaders.append("")
        shaders[self.lod] = self.new_name
        pde_mat[key] = shaders
        mat["pde_material"] = pde_mat
        self.report({"INFO"}, f"着色器已更新: {key}[{self.lod}] = {self.new_name}")
        return {"FINISHED"}


# =============================================================================
# Operator: 添加着色器 LOD
# =============================================================================

class PDE_OT_AddShader(Operator):
    """向材质添加一个着色器 LOD 行"""

    bl_idname = "pde_studio.add_shader"
    bl_label = "添加着色器 LOD"
    bl_options = {'REGISTER', 'UNDO'}

    material_index: IntProperty(default=0)  # type: ignore
    shader_type: StringProperty(default="vertex")  # type: ignore
    shader_name: StringProperty(default="", description="着色器名")  # type: ignore

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
        pde_mat = mat["pde_material"]
        key = f"{self.shader_type}_shaders"
        shaders = pde_mat.get(key, [])
        shaders.append(self.shader_name)
        pde_mat[key] = shaders
        mat["pde_material"] = pde_mat
        self.report({"INFO"}, f"已添加 {key}[{len(shaders)-1}] = {self.shader_name}")
        return {"FINISHED"}


# =============================================================================
# Operator: 删除着色器 LOD
# =============================================================================

class PDE_OT_RemoveShader(Operator):
    """从材质中删除最后一个着色器 LOD"""

    bl_idname = "pde_studio.remove_shader"
    bl_label = "删除着色器 LOD"
    bl_options = {'REGISTER', 'UNDO'}

    material_index: IntProperty(default=0)  # type: ignore
    shader_type: StringProperty(default="vertex")  # type: ignore

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
        pde_mat = mat["pde_material"]
        key = f"{self.shader_type}_shaders"
        shaders = pde_mat.get(key, [])
        if not shaders:
            self.report({"ERROR"}, "无着色器可删除")
            return {"CANCELLED"}
        removed = shaders.pop()
        pde_mat[key] = shaders
        mat["pde_material"] = pde_mat
        self.report({"INFO"}, f"已删除 {key} 最后一项: {removed}")
        return {"FINISHED"}


# =============================================================================
# Operator: 添加数值 uniform
# =============================================================================

class PDE_OT_AddUniform(Operator):
    """向材质添加一条数值 uniform"""

    bl_idname = "pde_studio.add_uniform"
    bl_label = "添加 Uniform"
    bl_options = {'REGISTER', 'UNDO'}

    material_index: IntProperty(default=0)  # type: ignore
    uniform_type: StringProperty(  # type: ignore  # "vertex" or "pixel"
        default="pixel",
        description="'vertex' 或 'pixel'")
    type_name: StringProperty(default="", description="Uniform 类型名")  # type: ignore
    value_str: StringProperty(  # type: ignore
        default="0",
        description="数值，多个用逗号分隔")

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
        pde_mat = mat["pde_material"]
        key = f"{self.uniform_type}_uniform"
        uniform_lod = pde_mat.get(key, [])
        if not uniform_lod:
            uniform_lod = [[]]
        values = _parse_values(self.value_str)
        uniform_lod[0].append({
            "type_name": self.type_name,
            "values": values,
        })
        pde_mat[key] = uniform_lod
        mat["pde_material"] = pde_mat
        self.report({"INFO"}, f"已添加 uniform: {self.type_name} = {values}")
        return {"FINISHED"}


# =============================================================================
# Operator: 编辑数值 uniform
# =============================================================================

class PDE_OT_EditUniform(Operator):
    """编辑材质的数值 uniform"""

    bl_idname = "pde_studio.edit_uniform"
    bl_label = "编辑 Uniform"
    bl_options = {'REGISTER', 'UNDO'}

    material_index: IntProperty(default=0)  # type: ignore
    uniform_type: StringProperty(default="pixel")  # type: ignore
    uniform_index: IntProperty(default=0)  # type: ignore
    type_name: StringProperty(default="")  # type: ignore
    value_str: StringProperty(default="0")  # type: ignore

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
        pde_mat = mat["pde_material"]
        key = f"{self.uniform_type}_uniform"
        uniform_lod = pde_mat.get(key, [])
        if not uniform_lod or not uniform_lod[0]:
            self.report({"ERROR"}, "无 uniform 数据")
            return {"CANCELLED"}
        if self.uniform_index >= len(uniform_lod[0]):
            self.report({"ERROR"}, "uniform 索引超出范围")
            return {"CANCELLED"}
        values = _parse_values(self.value_str)
        uniform_lod[0][self.uniform_index] = {
            "type_name": self.type_name,
            "values": values,
        }
        pde_mat[key] = uniform_lod
        mat["pde_material"] = pde_mat
        self.report({"INFO"}, f"uniform 已更新: {self.type_name} = {values}")
        return {"FINISHED"}


# =============================================================================
# Operator: 删除数值 uniform
# =============================================================================

class PDE_OT_RemoveUniform(Operator):
    """从材质中删除一条数值 uniform"""

    bl_idname = "pde_studio.remove_uniform"
    bl_label = "删除 Uniform"
    bl_options = {'REGISTER', 'UNDO'}

    material_index: IntProperty(default=0)  # type: ignore
    uniform_type: StringProperty(default="pixel")  # type: ignore
    uniform_index: IntProperty(default=0)  # type: ignore

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
        pde_mat = mat["pde_material"]
        key = f"{self.uniform_type}_uniform"
        uniform_lod = pde_mat.get(key, [])
        if not uniform_lod or not uniform_lod[0]:
            self.report({"ERROR"}, "无 uniform 数据")
            return {"CANCELLED"}
        if self.uniform_index >= len(uniform_lod[0]):
            self.report({"ERROR"}, "uniform 索引超出范围")
            return {"CANCELLED"}
        removed = uniform_lod[0].pop(self.uniform_index)
        pde_mat[key] = uniform_lod
        mat["pde_material"] = pde_mat
        self.report({"INFO"}, f"已删除 uniform: {removed.get('type_name', '')}")
        return {"FINISHED"}


# =============================================================================
# 辅助函数
# =============================================================================

def _parse_values(value_str: str) -> list:
    """将 "1.0, 2.0, 3.0" 解析为 [1.0, 2.0, 3.0]"""
    parts = [p.strip() for p in value_str.split(",") if p.strip()]
    result = []
    for p in parts:
        try:
            result.append(float(p))
        except ValueError:
            result.append(0.0)
    return result if result else [0.0]


def get_lod0_uniforms(mat, uniform_type: str) -> list:
    """获取材质的 LOD0 uniform 列表

    Returns: [{"type_name": str, "values": [float, ...]}, ...]
    """
    pde_mat = mat.get("pde_material")
    if not pde_mat:
        return []
    key = f"{uniform_type}_uniform"
    uniform_lod = pde_mat.get(key, [])
    if not uniform_lod or not uniform_lod[0]:
        return []
    return uniform_lod[0]


def get_shaders(mat, shader_type: str) -> list:
    """获取材质的着色器列表

    Returns: ["shader_name_lod0", "shader_name_lod1", ...]
    """
    pde_mat = mat.get("pde_material")
    if not pde_mat:
        return []
    key = f"{shader_type}_shaders"
    return pde_mat.get(key, [])
