# primitive_operators.py
"""PDE Studio - Primitive 属性编辑操作符

提供碰撞模式、物理材质、渲染属性、贴图路径的编辑能力。
所有操作符直接读写对象的 pde_primitive 自定义属性或材质的 pde_material 属性。

对应引擎枚举（Attribute.h + Physx.h + MeshResource.cpp）:
    CollisionMode (Physx.h:11-36): 0=无 1=静态 2=人物 3=动态 4=射线 5=门A 6=门B
    PhysicsMaterial (Physx.h:38-56): 0-14 (混凝土/黏土/木头/石头/金属/水/玻璃/塑料/布/树/纸/厚木/草/铁丝网/砖)
    AlphaBlendMode 二进制值 (Attribute.h:3-14): 1=kBlendNone 2=kAlphaTest 4=kSourceAlphaAdd 8=kDestAlphaAdd 16=kAlphaBlend 32=kAdditive 64=kInverseColor
    AlphaBlendMode 文本值 (MeshResource.cpp:1269-1297): 0=不透明 1=半透明 2=AlphaTest 3=Additive 4=AlphaTest(clip)
    CullingMode (Attribute.h:16-21): 0=CW 1=CCW 2=None

面板存储策略:
    obj["pde_primitive"]["blend_mode"] — 存二进制原始值 (1/2/4/32)
    面板 EnumProperty 用文本值 (0-3)，显示和写入时双向转换
    导出器 (mesh_materials.py) 将二进制值转为文本值写入 Lua
"""

import bpy
from bpy.types import Operator
from bpy.props import EnumProperty

from ..log import get_module_logger

log = get_module_logger("UI_PRIM")

# =============================================================================
# 枚举定义
# =============================================================================

COLLISION_MODE_ITEMS = [
    ("0", "0 - 无碰撞", "不生成碰撞体（植物、天空等）"),
    ("1", "1 - 静态碰撞", "角色/物体/子弹不可穿透（地面、墙壁）"),
    ("2", "2 - 人物碰撞", "仅人物碰撞（子弹可穿透）"),
    ("3", "3 - 动态碰撞", "动态物体碰撞"),
    ("4", "4 - 射线碰撞", "仅射线检测碰撞"),
    ("5", "5 - 阵营门A", "阵营门 Team1"),
    ("6", "6 - 阵营门B", "阵营门 Team2"),
]

PHYSICS_MATERIAL_ITEMS = [
    ("0", "0 - 混凝土", "kConcrete"),
    ("1", "1 - 黏土", "kClay"),
    ("2", "2 - 木头", "kWood"),
    ("3", "3 - 石头", "kStone"),
    ("4", "4 - 金属", "kMetal"),
    ("5", "5 - 水", "kWater"),
    ("6", "6 - 玻璃", "kGlass"),
    ("7", "7 - 塑料", "kPlastic"),
    ("8", "8 - 布", "kCloth"),
    ("9", "9 - 树", "kTree"),
    ("10", "10 - 纸", "kPaper"),
    ("11", "11 - 厚木", "kThickwood"),
    ("12", "12 - 草", "kGrass"),
    ("13", "13 - 铁丝网", "kWiregauze"),
    ("14", "14 - 砖", "kBrick"),
]

BLEND_MODE_ITEMS = [
    ("0", "0 - 不透明", "kBlendNone (二进制 1)"),
    ("1", "1 - 半透明", "kSourceAlphaAdd (二进制 4)"),
    ("2", "2 - AlphaTest", "kAlphaTest (二进制 2)"),
    ("3", "3 - Additive", "kAdditive (二进制 32)"),
]

CULLING_MODE_ITEMS = [
    ("0", "0 - CW", "kCullModeCW (顺时针剔除)"),
    ("1", "1 - CCW", "kCullModeCCW (逆时针剔除, 默认)"),
    ("2", "2 - 不剔除", "kCullModeNone (双面渲染)"),
]

VISIBLE_ITEMS = [
    ("0", "可见", "渲染时可见"),
    ("1", "不可见", "渲染时不可见"),
]

BLEND_LAYER_ITEMS = [
    ("0", "0", "默认层"),
    ("1", "1", "叠加层"),
]

# 常用贴图类型（供添加贴图行选择）
TEXTURE_TYPE_ITEMS = [
    ("ColorMap", "ColorMap", "漫反射贴图"),
    ("NormalMap", "NormalMap", "法线贴图"),
    ("BumpMap", "BumpMap", "凹凸贴图"),
    ("LightMap", "LightMap", "光照贴图"),
    ("DiffuseMap", "DiffuseMap", "漫反射贴图 (别名)"),
    ("DrMap", "DrMap", "粗糙度贴图"),
    ("SrMap", "SrMap", "金属度贴图"),
    ("SpecularMap", "SpecularMap", "高光贴图"),
    ("EmissiveMap", "EmissiveMap", "自发光贴图"),
]


# =============================================================================
# 辅助函数
# =============================================================================

def ensure_primitive_props(obj):
    """确保对象有 pde_primitive 属性，没有则创建默认值"""
    if obj.get("pde_primitive") is None:
        obj["pde_primitive"] = {
            "collision_mode": 1,
            "physics_material": 0,
            "visible": True,
            "layer": 0,
            "blend_mode": 1,   # kBlendNone
            "cull_mode": 1,     # kCullModeCCW (引擎默认)
        }


def ensure_pde_material(mat):
    """确保材质有 pde_material 属性，没有则创建空结构"""
    if mat.get("pde_material") is None:
        mat["pde_material"] = {
            "vertex_shaders": [],
            "pixel_shaders": [],
            "vertex_uniform": [],
            "pixel_uniform": [],
            "texture_uniform": [[]],  # LOD0 空列表
        }


def get_lod0_textures(mat) -> list:
    """获取材质的 LOD0 贴图列表，返回 [(type_name, path), ...]"""
    pde_mat = mat.get("pde_material")
    if not pde_mat:
        return []
    tex_uniform = pde_mat.get("texture_uniform", [])
    if not tex_uniform or not tex_uniform[0]:
        return []
    return [(t.get("type_name", ""), t.get("path", ""))
            for t in tex_uniform[0]]


def set_lod0_textures(mat, textures: list):
    """写入 LOD0 贴图列表到材质的 pde_material 属性

    Args:
        mat: Blender Material 对象
        textures: [(type_name, path), ...]
    """
    ensure_pde_material(mat)
    pde_mat = mat["pde_material"]
    lod0 = [{"type_name": tn, "path": p} for tn, p in textures]
    # 保持现有 LOD 结构，更新 LOD0
    tex_uniform = pde_mat.get("texture_uniform", [])
    if tex_uniform:
        tex_uniform[0] = lod0
    else:
        tex_uniform = [lod0]
    pde_mat["texture_uniform"] = tex_uniform
    mat["pde_material"] = pde_mat


def col_mode_label(mode: int) -> str:
    labels = {0: "无碰撞", 1: "静态", 2: "人物", 3: "动态",
              4: "射线", 5: "门A", 6: "门B"}
    return labels.get(mode, f"未知({mode})")


def phys_mat_label(mat: int) -> str:
    labels = {0: "混凝土", 1: "黏土", 2: "木头", 3: "石头",
              4: "金属", 5: "水", 6: "玻璃", 7: "塑料",
              8: "布", 9: "树", 10: "纸", 11: "厚木",
              12: "草", 13: "铁丝网", 14: "砖"}
    return labels.get(mat, f"未知({mat})")


# 二进制原始值 ↔ 文本格式值 (MeshResource.cpp:1269-1297)
_BLEND_BINARY_TO_TEXT = {
    1: 0,   # kBlendNone      → 文本 0
    4: 1,   # kSourceAlphaAdd → 文本 1
    2: 2,   # kAlphaTest      → 文本 2
    32: 3,  # kAdditive       → 文本 3
}

_BLEND_TEXT_TO_BINARY = {
    0: 1,   # 文本 0 → kBlendNone
    1: 4,   # 文本 1 → kSourceAlphaAdd
    2: 2,   # 文本 2 → kAlphaTest
    3: 32,  # 文本 3 → kAdditive
}


def blend_to_text_val(blend: int) -> int:
    """将二进制 blend_mode 值转为面板文本值 (0-3)。

    导入器存的是二进制原始值 (1/2/4/32)，
    面板的 BLEND_MODE_ITEMS 用文本值 (0-3)。
    """
    return _BLEND_BINARY_TO_TEXT.get(blend, 0)


def blend_text_to_binary(text_val: int) -> int:
    """将面板文本值 (0-3) 转为二进制 blend_mode 值。

    用于操作符写入 pde_primitive 时转换。
    """
    return _BLEND_TEXT_TO_BINARY.get(text_val, 1)


def blend_label(blend: int) -> str:
    """根据二进制 blend_mode 值返回标签文本"""
    val = blend_to_text_val(blend)
    labels = {0: "不透明", 1: "半透明", 2: "AlphaTest", 3: "Additive"}
    return labels.get(val, f"未知({blend})")


def cull_label(cull: int) -> str:
    labels = {0: "CW", 1: "CCW", 2: "不剔除"}
    return labels.get(cull, f"未知({cull})")


# =============================================================================
# Operator: 初始化 Primitive 属性
# =============================================================================

class PDE_OT_InitPrimitiveProps(Operator):
    """为当前对象初始化默认 Primitive 属性"""

    bl_idname = "pde_studio.init_primitive_props"
    bl_label = "初始化 Primitive 属性"
    bl_options = {'REGISTER', 'UNDO'}

    @classmethod
    def poll(cls, context):
        obj = context.active_object
        return obj is not None and obj.type == 'MESH'

    def execute(self, context):
        obj = context.active_object
        ensure_primitive_props(obj)
        self.report({"INFO"}, f"已初始化 Primitive 属性: {obj.name}")
        return {"FINISHED"}


# =============================================================================
# Operator: 设置碰撞模式
# =============================================================================

class PDE_OT_SetCollision(Operator):
    """设置当前对象的碰撞模式"""

    bl_idname = "pde_studio.set_collision"
    bl_label = "设置碰撞模式"
    bl_options = {'REGISTER', 'UNDO'}

    mode: EnumProperty(items=COLLISION_MODE_ITEMS, default="1")  # type: ignore

    @classmethod
    def poll(cls, context):
        obj = context.active_object
        return obj is not None and obj.type == 'MESH'

    def execute(self, context):
        obj = context.active_object
        ensure_primitive_props(obj)
        prim = obj.get("pde_primitive", {})
        prim["collision_mode"] = int(self.mode)
        obj["pde_primitive"] = prim
        self.report({"INFO"},
                     f"{obj.name}: 碰撞模式={self.mode} ({col_mode_label(int(self.mode))})")
        return {"FINISHED"}


# =============================================================================
# Operator: 设置物理材质
# =============================================================================

class PDE_OT_SetPhysicsMaterial(Operator):
    """设置当前对象的物理材质"""

    bl_idname = "pde_studio.set_physics_material"
    bl_label = "设置物理材质"
    bl_options = {'REGISTER', 'UNDO'}

    material: EnumProperty(
        items=PHYSICS_MATERIAL_ITEMS, default="0",
        description="物理材质类型")  # type: ignore

    @classmethod
    def poll(cls, context):
        obj = context.active_object
        return obj is not None and obj.type == 'MESH'

    def execute(self, context):
        obj = context.active_object
        ensure_primitive_props(obj)
        prim = obj.get("pde_primitive", {})
        prim["physics_material"] = int(self.material)
        obj["pde_primitive"] = prim
        self.report({"INFO"},
                     f"{obj.name}: 物理材质={self.material} ({phys_mat_label(int(self.material))})")
        return {"FINISHED"}


# =============================================================================
# Operator: 设置渲染属性
# =============================================================================

class PDE_OT_SetVisible(Operator):
    """设置对象可见性"""

    bl_idname = "pde_studio.set_visible"
    bl_label = "设置可见性"
    bl_options = {'REGISTER', 'UNDO'}

    visible: EnumProperty(items=VISIBLE_ITEMS, default="0")  # type: ignore

    @classmethod
    def poll(cls, context):
        obj = context.active_object
        return obj is not None and obj.type == 'MESH'

    def execute(self, context):
        obj = context.active_object
        ensure_primitive_props(obj)
        prim = obj.get("pde_primitive", {})
        prim["visible"] = (self.visible == "0")
        obj["pde_primitive"] = prim
        self.report({"INFO"}, f"{obj.name}: 可见={'是' if self.visible == '0' else '否'}")
        return {"FINISHED"}


class PDE_OT_SetBlendLayer(Operator):
    """设置 BlendLayer"""

    bl_idname = "pde_studio.set_blend_layer"
    bl_label = "设置 BlendLayer"
    bl_options = {'REGISTER', 'UNDO'}

    blend_layer: EnumProperty(items=BLEND_LAYER_ITEMS, default="0")  # type: ignore

    @classmethod
    def poll(cls, context):
        obj = context.active_object
        return obj is not None and obj.type == 'MESH'

    def execute(self, context):
        obj = context.active_object
        ensure_primitive_props(obj)
        prim = obj.get("pde_primitive", {})
        prim["layer"] = int(self.blend_layer)
        obj["pde_primitive"] = prim
        self.report({"INFO"}, f"{obj.name}: BlendLayer={self.blend_layer}")
        return {"FINISHED"}


class PDE_OT_SetBlendMode(Operator):
    """设置 AlphaBlendMode"""

    bl_idname = "pde_studio.set_blend_mode"
    bl_label = "设置 BlendMode"
    bl_options = {'REGISTER', 'UNDO'}

    blend_mode: EnumProperty(items=BLEND_MODE_ITEMS, default="0")  # type: ignore

    @classmethod
    def poll(cls, context):
        obj = context.active_object
        return obj is not None and obj.type == 'MESH'

    def execute(self, context):
        obj = context.active_object
        ensure_primitive_props(obj)
        prim = obj.get("pde_primitive", {})
        text_val = int(self.blend_mode)
        binary_val = blend_text_to_binary(text_val)
        prim["blend_mode"] = binary_val
        obj["pde_primitive"] = prim
        self.report({"INFO"}, f"{obj.name}: BlendMode={text_val} ({blend_label(binary_val)})")
        return {"FINISHED"}


class PDE_OT_SetCullMode(Operator):
    """设置 CullingMode"""

    bl_idname = "pde_studio.set_cull_mode"
    bl_label = "设置 CullMode"
    bl_options = {'REGISTER', 'UNDO'}

    cull_mode: EnumProperty(items=CULLING_MODE_ITEMS, default="1")  # type: ignore

    @classmethod
    def poll(cls, context):
        obj = context.active_object
        return obj is not None and obj.type == 'MESH'

    def execute(self, context):
        obj = context.active_object
        ensure_primitive_props(obj)
        prim = obj.get("pde_primitive", {})
        prim["cull_mode"] = int(self.cull_mode)
        obj["pde_primitive"] = prim
        self.report({"INFO"}, f"{obj.name}: CullMode={self.cull_mode} ({cull_label(int(self.cull_mode))})")
        return {"FINISHED"}


# =============================================================================
# Operator: 批量设置碰撞模式
# =============================================================================

class PDE_OT_BatchSetCollision(Operator):
    """批量设置所有选中 Mesh 对象的碰撞模式"""

    bl_idname = "pde_studio.batch_set_collision"
    bl_label = "批量设置碰撞模式"
    bl_options = {'REGISTER', 'UNDO'}

    collision_mode: EnumProperty(
        items=COLLISION_MODE_ITEMS, default="1",
        description="应用到所有选中对象的碰撞模式")  # type: ignore

    @classmethod
    def poll(cls, context):
        return any(o.type == 'MESH' for o in context.selected_objects)

    def execute(self, context):
        count = 0
        for obj in context.selected_objects:
            if obj.type != 'MESH':
                continue
            ensure_primitive_props(obj)
            prim = obj.get("pde_primitive", {})
            prim["collision_mode"] = int(self.collision_mode)
            obj["pde_primitive"] = prim
            count += 1

        self.report({"INFO"}, f"已设置 {count} 个对象的碰撞模式={self.collision_mode}")
        return {"FINISHED"}

