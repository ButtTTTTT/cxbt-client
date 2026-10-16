# PDE 引擎 .mesh 二进制格式解析文档

> **源码依据**: `tc/client/render/MeshResource.cpp` — `MeshResource::SaveData()` / `MeshResource::LoadData()`
> **导入器实现**: `pdestudio/src/importer/binary/mesh.py` — `parse_mesh_binary()`
> **资源类型码**: `0x0100` (Mesh)

## 1. 整体结构概览

`.cache` 文件解压后，得到的就是 `LoadData()` 读取的二进制流。
数据流首先经过 `Resource::LoadData(stream)` 读取一个 `uint32` 资源类型码，
之后进入 `MeshResource::LoadData(stream)` 的具体解析逻辑。

```
┌─────────────────────────────────────────────────────────┐
│  Resource Header (4B)  uint32 type = 0x0100             │
├─────────────────────────────────────────────────────────┤
│  MeshType (4B)         uint32 (1=kStatic, 2=kSkin)      │
├─────────────────────────────────────────────────────────┤
│  Mesh Body (kStatic 或 kSkin 分支)                      │
├─────────────────────────────────────────────────────────┤
│  Primitive Count (4B)   uint32                           │
├─────────────────────────────────────────────────────────┤
│  Primitive[0] ... Primitive[N-1]                        │
├─────────────────────────────────────────────────────────┤
│  Physical Materials (尾部)                               │
└─────────────────────────────────────────────────────────┘
```

## 2. 字段详细说明

### 2.1 Resource Header

| 偏移 | 大小 | 类型 | 说明 |
|------|------|------|------|
| 0x00 | 4B | uint32 | 资源类型码，Mesh = `0x0100` |

`Resource::SaveData(stream)` 写入 `uint32 type = GetType()`，
`Resource::LoadData(stream)` 读取并校验 type。

### 2.2 MeshType

| 大小 | 类型 | 说明 |
|------|------|------|
| 4B | uint32 (enum) | 网格类型: `1=kStatic`, `2=kSkin` |

枚举定义 (`MeshResource.h`):
```
kNoneMesh = 0
kStatic   = 1
kSkin     = 2
kOther    = 3
kPartical = 4
kCount    = 5
```

### 2.3 Mesh Body — kStatic (静态网格)

当 `MeshType == 1` 时，紧跟一个本地 AABB:

| 大小 | 类型 | 说明 |
|------|------|------|
| 24B | float[6] (AxisAlignedBox) | 本地包围盒 `local_aabb.fAxis[6]` = `{minX, minY, minZ, maxX, maxY, maxZ}` |

`AxisAlignedBox` 内部为 `F32 fAxis[6]`，连续 6 个 float，见 `axisAlignedBox.h:69`。

### 2.4 Mesh Body — kSkin (蒙皮网格)

当 `MeshType == 2` 时，依次写入骨骼名数组和骨骼 AABB 数组:

#### 骨骼名数组
| 大小 | 类型 | 说明 |
|------|------|------|
| 4B | uint32 | 骨骼数量 `bone_count` |
| 变长 | BoneEntry[bone_count] | 每个骨骼一个条目 |

**BoneEntry**:
| 大小 | 类型 | 说明 |
|------|------|------|
| 4B | uint32 | 名称长度 `name_len` |
| name_len | char[name_len] | 骨骼名 (UTF-8) |

#### 骨骼 AABB 数组
| 大小 | 类型 | 说明 |
|------|------|------|
| 4B | uint32 | AABB 数量 `aabb_count` (等于 bone_count) |
| 24B × aabb_count | AxisAlignedBox[aabb_count] | 每个骨骼的 AABB，连续写入 |

每个 AABB = 24B (6 个 float)，通过 `stream.Write(bone_aabb[i].fAxis, sizeof(AxisAlignedBox))` 写入。

### 2.5 Primitive 数组

| 大小 | 类型 | 说明 |
|------|------|------|
| 4B | uint32 | Primitive 数量 `prim_count` |

注意: SaveData 中会跳过 `primitive_count==0 && vertex_count==0` 的空 Primitive，实际写入数量可能小于数组大小。

### 2.6 Primitive 条目

每个 Primitive 依次写入以下字段:

| 大小 | 类型 | 字段 | 说明 |
|------|------|------|------|
| 4B | uint32 | `primitive_count` | 三角形数量 |
| 4B | uint32 | `vertex_count` | 顶点数量 |
| 4B | uint32 | `layer` | 混合层 (BlendLayer) |
| 4B | uint32 (enum) | `cull_mode` | 剔除模式 |
| 4B | uint32 (enum) | `blend_mode` | 混合模式 |
| 1B | bool | `visible` | 是否可见 |

#### CullMode 枚举 (`Attribute.h`)
| 值 | 名称 | 说明 |
|----|------|------|
| 0 | `kCullModeCW` | 顺时针剔除 |
| 1 | `kCullModeCCW` | 逆时针剔除 |
| 2 | `kCullModeNone` | 不剔除 |

#### AlphaBlendMode 枚举 (`Attribute.h`)
| 值 (位掩码) | 名称 | 说明 |
|-------------|------|------|
| 0x01 (1<<0) | `kBlendNone` | 不混合 |
| 0x02 (1<<1) | `kAlphaTest` | Alpha 测试 |
| 0x04 (1<<2) | `kSourceAlphaAdd` | 源 Alpha 加 |
| 0x08 (1<<3) | `kDestAlphaAdd` | 目标 Alpha 加 |
| 0x10 (1<<4) | `kAlphaBlend` | Alpha 混合 |
| 0x20 (1<<5) | `kAdditive` | 加法混合 |
| 0x40 (1<<6) | `kInverseColor` | 反色混合 |

注意: Lua 源码中的 blend_mode 值 (0-4) 和枚举位掩码不同，SaveData 时直接写入枚举值。

### 2.7 Vertex Buffer

| 大小 | 类型 | 说明 |
|------|------|------|
| 4B | uint32 | 顶点缓冲字节大小 `vb_size` |
| vb_size | bytes | 原始顶点数据 |

**kStatic 顶点**: `StreamStatic` = 52 字节/顶点

```
偏移  大小  字段                类型
0x00  12B   position            Vector3 (3×float32)
0x0C  8B    normal              D3DXVECTOR4_16F (4×half-float)
0x14  8B    tangent             D3DXVECTOR4_16F (4×half-float)
0x1C  8B    binormal            D3DXVECTOR4_16F (4×half-float)
0x24  4B    uv0                 D3DXVECTOR2_16F (2×half-float)
0x28  4B    uv1                 D3DXVECTOR2_16F (2×half-float)
0x2C  4B    uv2                 D3DXVECTOR2_16F (2×half-float)
0x30  4B    color               ARGB (uint32)
总计  52B
```

**kSkin 顶点**: `StreamSkin` = 64 字节/顶点

```
偏移  大小  字段                类型
0x00  12B   position            Vector3 (3×float32)
0x0C  8B    normal              D3DXVECTOR4_16F (4×half-float)
0x14  8B    tangent             D3DXVECTOR4_16F (4×half-float)
0x1C  8B    binormal            D3DXVECTOR4_16F (4×half-float)
0x24  4B    blendindices        BYTE[4] (4×uint8)
0x28  16B   blendweight         Vector4 (4×float32)
0x38  4B    uv0                 D3DXVECTOR2_16F (2×half-float)
0x3C  4B    uv1                 D3DXVECTOR2_16F (2×half-float)
总计  64B
```

结构定义见 `VertexDeclaration.h:16-38`。

### 2.8 Index Buffer

| 大小 | 类型 | 说明 |
|------|------|------|
| 4B | uint32 | 索引缓冲字节大小 `ib_size` |
| ib_size | bytes | 索引数据 (uint32 数组) |

索引数量 = `ib_size / 4`，每个索引为 `uint32`。
索引值为三角形列表 (TRIANGLELIST)，每 3 个索引构成一个三角形。
`ib_size = primitive_count * 3 * sizeof(U32)`。

### 2.9 Material (可选)

| 大小 | 类型 | 说明 |
|------|------|------|
| 1B | byte | 是否有材质 `has_material` (0=无, 1=有) |

若 `has_material == 1`，紧接 `Material::Save(stream)` 写入的材质数据。

### 2.10 Material 二进制格式

源码: `Material.cpp:380` — `Material::Save()` / `Material.cpp:235` — `Material::Load()`

```
┌─────────────────────────────────────────────┐
│ Vertex Shader 列表                          │
│   uint32 count                              │
│   for each: uint32 len; char[len] name      │
├─────────────────────────────────────────────┤
│ Pixel Shader 列表                           │
│   uint32 count                              │
│   for each: uint32 len; char[len] name      │
├─────────────────────────────────────────────┤
│ Vertex Uniform (按 LOD 分组)               │
│   uint32 lod_count                          │
│   for each LOD:                             │
│     uint32 uniform_count                    │
│     for each uniform:                       │
│       uint32 type_name_len                  │
│       char[type_name_len] type_name         │
│       uint32 value_count                    │
│       float[value_count] values            │
├─────────────────────────────────────────────┤
│ Pixel Uniform (按 LOD 分组)                 │
│   (结构同 Vertex Uniform)                   │
├─────────────────────────────────────────────┤
│ Texture Uniform (按 LOD 分组)               │
│   uint32 lod_count                          │
│   for each LOD:                             │
│     uint32 texture_count                    │
│     for each texture:                       │
│       uint32 type_name_len                  │
│       char[type_name_len] type_name         │
│       uint32 path_len                       │
│       char[path_len] texture_path           │
└─────────────────────────────────────────────┘
```

Shader name 为不含扩展名的文件名 (如 `pdeCgfxShader`)。
texture_path 为 VFS 路径 (如 `character/hero/hero_body_d.tga`)。

### 2.11 Collision Mode

| 大小 | 类型 | 说明 |
|------|------|------|
| 4B | uint32 | `collision_mode` — 碰撞模式 |

在 `Primitive::Draw()` 中:
- `collision_mode == 1`: 碰撞网格 (不渲染，仅用于物理)
- `collision_mode == 4`: 特殊碰撞 (不渲染)
- 其他值: 正常渲染

### 2.12 Physical Materials (尾部)

所有 Primitive 写完后，最后写入物理材质数组:

| 大小 | 类型 | 说明 |
|------|------|------|
| 4B | int32 | 物理材质数量 `pm_count` (有符号!) |
| 4B × pm_count | uint32[] | 物理材质值列表 |

注意: LoadData 中用 `stream.Read(&size, sizeof(int))` 读取 (有符号 int)，
但每个值用 `stream.Read(&v, sizeof(U32))` 读取 (无符号 uint32)。

## 3. Half-Float 编码

`D3DXVECTOR4_16F` / `D3DXVECTOR2_16F` 使用 IEEE 754 半精度浮点格式:

- 16 位 = 1 符号位 + 5 指数位 + 10 尾数位
- 指数偏移 = 15
- 指数 0: 非规格化数 (denormal)
- 指数 31: Inf/NaN

解码算法见 `mesh.py:41-51` — `_half_to_float()` 函数。

## 4. 完整二进制布局示意 (kStatic)

```
偏移   字段                          大小
0x00   type (0x0100)                 4B
0x04   mesh_type (1=kStatic)        4B
0x08   local_aabb.fAxis[6]          24B
0x20   prim_count                   4B
0x24   ─── Primitive[0] ───
       primitive_count              4B
       vertex_count                  4B
       layer                         4B
       cull_mode                     4B
       blend_mode                    4B
       visible                       1B
       vb_size                       4B
       vertex_buffer[vb_size]        vb_size
       ib_size                       4B
       index_buffer[ib_size]         ib_size
       has_material                  1B
       [Material data]              变长
       collision_mode                4B
       ─── Primitive[1] ───
       ...
─── Physical Materials ───
       pm_count                      4B
       pm[0] ... pm[pm_count-1]     4B each
```

## 6. 坐标系与单位（极度重要！）

PDE 引擎、Maya、Blender 三者的坐标系不同，导入/导出时必须正确转换：

| 软件 | 向上轴 | 前向轴 | 手性 | 单位 |
|------|--------|--------|------|------|
| **PDE 引擎** | Y-up | +Z 前向 | 右手系 | 厘米 (cm) |
| **Maya** | Y-up | +Z 前向 | 右手系 | 厘米 (cm) |
| **Blender** | Z-up | -Y 前向 | 右手系 | 米 (m) |

### 顶点坐标 / 法线 / 包围盒

二进制文件中的坐标、法线、AABB 均为 PDE 引擎坐标系 (Y-up, 厘米)。

导入到 Blender 时 (PDE → Blender):
```
Blender.X =  PDE.X
Blender.Z =  PDE.Y     (PDE Y → Blender Z)
Blender.Y = -PDE.Z     (PDE Z → Blender -Y, 注意取反)
所有坐标 ×0.01 (厘米 → 米)
```

从 Blender 导出时 (Blender → PDE):
```
PDE.X =  Blender.X
PDE.Y =  Blender.Z     (Blender Z → PDE Y)
PDE.Z = -Blender.Y     (Blender -Y → PDE Z, 注意取反)
所有坐标 ×100 (米 → 厘米)
```

### Maya 与 PDE 引擎

Maya 与 PDE 引擎同为 Y-up 右手系 + 厘米，**无需任何坐标系转换**。
这也是 Maya 导出器代码中没有坐标轴翻转逻辑的原因。
