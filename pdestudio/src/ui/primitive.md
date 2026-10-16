# PDE Mesh 可编辑属性 — 完整参考

> 基于源码分析: `tc/client/render/Attribute.h`, `tc/client/render/MeshResource.h/cpp`,
> `tc/client/render/Material.h/cpp`, `tc/client/system/Physx.h`, `tc/client/game/Level.cpp`
>
> 二进制格式: `MeshResource.cpp:192-293` (SaveData) / `296-392` (LoadData)
> 文本格式: `MeshResource.cpp:1225-1318` (LoadRawData)
> 碰撞加载: `Level.cpp:3039-3218` (lua_LoadPhysxMesh)

---

## 一、Primitive 级属性

存储位置: `obj["pde_primitive"]` (Blender 自定义属性)

文本格式中的字段名 (写在材质表内 `Materials[p]` 下):
- `IsInVisible` — 是否不可见
- `CollisionMode` — 碰撞模式
- `PhysicsMaterial` — 物理材质
- `BlendLayer` — 渲染层
- `AlphaBlendMode` — 混合模式
- `CullingMode` — 剔除模式

### 1. IsInVisible (visible)

| 文本值 | 含义 | 引擎行为 |
|--------|------|----------|
| 0 | 可见 | `Primitive::Draw()` 正常渲染 |
| 1 | 不可见 | `Primitive::Draw()` 直接 return |

- **二进制格式**: `bool` (1 byte), 直接存 `visible`
- **pde_primitive 存储**: `"visible": bool` (True=可见)
- **导出时转换**: `mat_lua["IsInVisible"] = 1 if not visible else 0`
- **缺失时默认**: `ToInteger(nil) = 0` → 可见
- **源码**: `MeshResource.cpp:1237-1239`

### 2. CollisionMode

| 值 | 枚举名 | 含义 | PhysX 行为 |
|----|--------|------|-----------|
| 0 | kNone | 无碰撞 | 不创建 PhysX actor |
| 1 | kStatic | 静态碰撞 | 角色/物体/子弹不可穿透 (地面、墙壁) |
| 2 | kStaticCollisionWithPerson | 人物碰撞 | 仅人物碰撞，子弹可穿透 |
| 3 | kStaticCollisionWithDynamic | 动态碰撞 | 动态物体碰撞 |
| 4 | kStaticRaycast | 射线碰撞 | 仅射线检测 |
| 5 | kStaticCollisionWithGateTeam1 | 阵营门A | 阵营门 Team1 |
| 6 | kStaticCollisionWithGateTeam2 | 阵营门B | 阵营门 Team2 |

- **二进制格式**: `U32`，直接存枚举值 (0-6)
- **文本格式**: 直接整数，同二进制值
- **pde_primitive 存储**: `"collision_mode": int` (0-6)
- **导出时**: 直接原值 `mat_lua["CollisionMode"] = prim["collision_mode"]`
- **关键行为** (`Level.cpp:3383-3415`): `switch(collision_mode)` 中只有 case 1-6 会创建三角形，
  case 0 跳过。每个值创建独立的 PhysX actor，分配到不同的 collision group。
- **必须始终写入**！两个字段读取路径的默认值不同:
  - `lua_LoadPhysxMesh` (`Level.cpp:3207-3212`): 字段 nil 时默认为 1 (kStatic)
  - `MeshResource::LoadRawData` (`MeshResource.cpp:1241-1242`): 字段 nil 时 ToInteger(nil)=0 (kNone)
- **源码**: `Physx.h:12-19`, `MeshResource.cpp:1241-1242`, `Level.cpp:3207-3215, 3383-3415`

### 3. PhysicsMaterial

| 值 | 枚举名 | 含义 |
|----|--------|------|
| 0 | kConcrete | 混凝土 |
| 1 | kClay | 黏土 |
| 2 | kWood | 木头 |
| 3 | kStone | 石头 |
| 4 | kMetal | 金属 |
| 5 | kWater | 水 |
| 6 | kGlass | 玻璃 |
| 7 | kPlastic | 塑料 |
| 8 | kCloth | 布 |
| 9 | kTree | 树 |
| 10 | kPaper | 纸 |
| 11 | kThickwood | 厚木 |
| 12 | kGrass | 草 |
| 13 | kWiregauze | 铁丝网 |
| 14 | kBrick | 砖 |

- **二进制格式**: 单独的 `physical_materials` 数组 (mesh 级)，每项 `U32`
- **文本格式**: 整数，直接作为 PhysicsMaterial 字段值
- **pde_primitive 存储**: `"physics_material": int` (0-14)
- **导出时**: 直接原值 `mat_lua["PhysicsMaterial"] = prim["physics_material"]`
- **用途**: PhysX 材质索引，用于撞击音效和物理反馈
- **缺失时默认**: `ToInteger(nil) = 0` → kConcrete (混凝土)
- **源码**: `Physx.h:38-56`, `MeshResource.cpp:1305-1310`, `Level.cpp:3202-3205`

### 4. BlendLayer (layer)

| 值 | 含义 |
|----|------|
| 0 | 默认层 |
| 1 | 叠加层 |

- **二进制格式**: `U32`，直接存值
- **文本格式**: 整数，直接作为 BlendLayer 字段值
- **pde_primitive 存储**: `"layer": int` (0 或 1)
- **导出时**: 直接原值 `mat_lua["BlendLayer"] = prim["layer"]`
- **用途**: 控制渲染顺序，非0值的 primitive 在透明渲染阶段绘制
- **缺失时默认**: `ToInteger(nil) = 0` → 默认层
- **源码**: `MeshResource.cpp:1265-1267`, `MeshResource.h:61`

### 5. AlphaBlendMode (blend_mode)

**⚠️ 二进制格式和文本格式的值不同！**

#### 二进制格式 (引擎内部 AlphaBlendMode 枚举)

| 二进制值 | 枚举名 | 位掩码 | D3D 行为 |
|----------|--------|--------|----------|
| 1 | kBlendNone | 1<<0 | 禁用 AlphaBlend 和 AlphaTest |
| 2 | kAlphaTest | 1<<1 | AlphaTest (Ref=128, Greater) |
| 4 | kSourceAlphaAdd | 1<<2 | SrcAlpha * InvSrcAlpha |
| 8 | kDestAlphaAdd | 1<<3 | (未实现，空操作) |
| 16 | kAlphaBlend | 1<<4 | SrcAlpha + 分离 Alpha 混合 |
| 32 | kAdditive | 1<<5 | SrcAlpha + ONE (加法混合) |
| 64 | kInverseColor | 1<<6 | ONE - DestColor (反色) |

- **源码**: `Attribute.h:3-14`, `DirectX9.cpp:760-836` (SetAlphaBlend)

#### 文本格式 (Lua 中写入的 AlphaBlendMode 字段值)

| 文本值 | 转换为引擎枚举 | 含义 |
|--------|---------------|------|
| 0 | kBlendNone (1) | 不透明 |
| 1 | kSourceAlphaAdd (4) | 半透明 |
| 2 | kAlphaTest (2) | AlphaTest |
| 3 | kAdditive (32) | Additive |
| 4 | kAlphaTest (2) | AlphaTest (同 2) |
| 其他 | kBlendNone (1) | 未知，回退不透明 |

- **缺失时默认**: `ToInteger(nil) = 0` → kBlendNone (不透明)
- **源码**: `MeshResource.cpp:1269-1297`

#### 导入器存储

- **pde_primitive 存储**: `"blend_mode": int` — 存的是**二进制原始值** (1/2/4/32)
- **面板显示时**: `blend_to_text_val()` 将二进制值转为文本值 (0-3)
- **面板写入时**: `blend_text_to_binary()` 将文本值 (0-3) 转为二进制值
- **导出时**: `mesh_materials.py:_BLEND_MODE_ENUM_TO_TEXT` 将二进制值转为文本值写入 Lua
- **转换函数**: `primitive_operators.py:_BLEND_BINARY_TO_TEXT` / `_BLEND_TEXT_TO_BINARY`

### 6. CullingMode (cull_mode)

| 值 | 枚举名 | D3D 行为 |
|----|--------|----------|
| 0 | kCullModeCW | D3DCULL_CW (顺时针剔除) |
| 1 | kCullModeCCW | D3DCULL_CCW (逆时针剔除, 默认) |
| 2 | kCullModeNone | D3DCULL_NONE (不剔除，双面渲染) |

- **二进制格式**: `CullMode` (enum, 实际为 U32)，直接存枚举值 (0-2)
- **文本格式**: 直接整数，同二进制值
- **pde_primitive 存储**: `"cull_mode": int` (0-2)
- **导出时**: 直接原值 `mat_lua["CullingMode"] = prim["cull_mode"]`
- **缺失时默认**: `ToInteger(nil) = 0` → kCullModeCW (顺时针剔除)
- **注意**: 引擎有 `GetInverse()` 逻辑 (`MeshResource.cpp:93-98`)，会交换 CW/CCW；
  但 PDE mesh 的面绕序是 CCW，默认 cull_mode=1 (CCW)
- **源码**: `Attribute.h:16-21`, `MeshResource.cpp:91-99, 1299-1303`, `DirectX9.cpp:838-846`

---

## 二、Material 级属性

存储位置: `mat["pde_material"]` (Blender 材质自定义属性)

### 1. vertex_shaders (顶点着色器列表)

- **结构**: `["shader_name_lod0", "shader_name_lod1", ...]`
- **文本格式**: `vertex_shader_lod_0 = "shader_name"`, `vertex_shader_lod_1 = "shader_name"`, ...
- **二进制格式**: `U32 count` + 每项 `U32 strlen + string`
- **VFS 路径**: `/shader/{name}.vd9`
- **源码**: `Material.cpp:464-478` (Load), `Material.cpp:211-221` (GetVertexShader)

### 2. pixel_shaders (像素着色器列表)

- **结构**: `["shader_name_lod0", "shader_name_lod1", ...]`
- **文本格式**: `pixel_shader_lod_0 = "shader_name"`, ...
- **二进制格式**: `U32 count` + 每项 `U32 strlen + string`
- **VFS 路径**: `/shader/{name}.pd9`
- **源码**: `Material.cpp:481-496` (Load), `Material.cpp:223-233` (GetPixelShader)

### 3. texture_uniform (贴图列表, 按 LOD 分组)

- **结构**: `[[{type_name, path}, ...], [{type_name, path}, ...], ...]` (外层=LOD, 内层=贴图)
- **文本格式**: `TypeName = "texture_filename"` (扁平，取 LOD0)
- **二进制格式**: `U32 lod_count` + 每LOD `U32 tex_count` + 每项 `U32 name_len + type_name + U32 path_len + path`
- **贴图路径**: VFS 全路径，导出时转为相对 mesh 目录的路径
- **常见 type_name**: ColorMap, NormalMap, BumpMap, LightMap, DiffuseMap, DrMap, SrMap, SpecularMap, EmissiveMap
- **源码**: `Material.cpp:342-377` (Stream Load), `Material.cpp:500-556` (Lua Load)

### 4. vertex_uniform (顶点着色器数值参数, 按 LOD 分组)

- **结构**: `[[{type_name, values: [float, ...]}, ...], ...]` (外层=LOD, 内层=uniform)
- **文本格式**: `TypeName = value` 或 `TypeName = {v1, v2, v3}` (扁平，取 LOD0)
- **二进制格式**: `U32 lod_count` + 每LOD `U32 uniform_count` + 每项 `U32 name_len + type_name + U32 value_count + float[value_count]`
- **源码**: `Material.cpp:262-300` (Stream Load), `Material.cpp:576-591` (Lua Load)

### 5. pixel_uniform (像素着色器数值参数, 按 LOD 分组)

- **结构**: `[[{type_name, values: [float, ...]}, ...], ...]` (外层=LOD, 内层=uniform)
- **文本格式**: `TypeName = value` 或 `TypeName = {v1, v2, v3}` (扁平，取 LOD0)
- **二进制格式**: `U32 lod_count` + 每LOD `U32 uniform_count` + 每项 `U32 name_len + type_name + U32 value_count + float[value_count]`
- **源码**: `Material.cpp:302-340` (Stream Load), `Material.cpp:559-574` (Lua Load)

---

## 三、数据流总结

```
导入 (二进制 .cache)
  mesh.py 解析二进制 → PDEPrimitive{layer, cull_mode, blend_mode, visible, collision_mode}
  material.py → store_primitive_props(obj, prim) → obj["pde_primitive"] = {上述字段}
  material.py → store_pde_material(mat, pde_material) → mat["pde_material"] = {VS/PS/tex/uniform}

面板编辑
  面板读取 obj["pde_primitive"] 和 mat["pde_material"]
  操作符修改这些自定义属性
  blend_mode 读写时双向转换:
    显示: blend_to_text_val() 二进制→文本
    写入: blend_text_to_binary() 文本→二进制

导出 (文本 .mesh)
  mesh_materials.py → _apply_primitive_props(obj, mat_lua)
    从 obj["pde_primitive"] 读取 → 转换 → 写入 mat_lua
    blend_mode: 二进制值 → 文本值 (via _BLEND_MODE_ENUM_TO_TEXT)
    其他字段: 直接原值

  mesh_materials.py → _extract_from_pde_material(pde_mat, ...)
    从 mat["pde_material"] 读取 → 转换 → 写入 mat_lua
    VS/PS: 直接写入 vertex_shader_lod_{i} / pixel_shader_lod_{i}
    贴图: 路径转为相对 mesh 目录
    uniform: 取 LOD0，合并去重
```

---

## 四、面板实现说明（已修复）

1. **blend_mode 双向转换**:
   - 导入器存的是二进制原始值 (1/2/4/32)
   - 面板的 EnumProperty 用文本值 (0-3)
   - 读取时: `blend_to_text_val()` 二进制→文本
   - 写入时: `blend_text_to_binary()` 文本→二进制
   - 导出时: `mesh_materials.py:_BLEND_MODE_ENUM_TO_TEXT` 二进制→文本

2. **physics_material 有 15 种** (0-14)
   - 面板 `PHYSICS_MATERIAL_ITEMS` 已列全 0-14
   - `phys_mat_label()` 已覆盖 0-14

3. **cull_mode 只有 3 种** (0=CW, 1=CCW, 2=None)
   - 面板 `CULLING_MODE_ITEMS` 已修正为 0-2
   - `cull_label()` 已修正
   - 引擎默认 CCW=1

4. **碰撞模式只有 0-6**，值 0 不创建碰撞体

5. **面板默认值**:
   - `blend_mode`: 1 (kBlendNone, 二进制)
   - `cull_mode`: 1 (kCullModeCCW, 引擎默认)
   - `collision_mode`: 1 (kStatic, 引擎默认)
