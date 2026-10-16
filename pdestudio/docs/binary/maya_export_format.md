# PDE 引擎 Maya 扩展导出格式分析文档

> **源码目录**: `tc/editor/export/` — Maya 导出插件 C++ 源码
> **MEL 脚本**: `tc/editor/scripts/` — Maya UI 和属性模板脚本
> **客户端加载**: `tc/client/render/MeshResource.cpp` — `LoadRawData()` 读取导出的 Lua 文本

## 0. 关键发现：导出的是 Lua 文本，不是二进制

Maya 扩展导出的 `.mesh` / `.skel` / `.anim` 文件是 **Lua 文本格式**，
不是 `.cache` 二进制格式。

工作流程:
```
Maya 导出 → Lua 文本 (.mesh/.skel/.anim)
         → client.exe BuildData() 编译为 .cache 二进制
         → 引擎运行时加载 .cache
```

客户端 `MeshResource::LoadRawData()` (MeshResource.cpp:757) 使用 Lua 解释器
加载文本文件，解析 Lua 表结构，然后调用 `BuildStream()` 构建顶点缓冲并
最终通过 `SaveData()` 序列化为二进制 `.cache`。

## 0.1 坐标系差异（极度重要！）

PDE 引擎、Maya、Blender 三者的坐标系各不相同，这是导出/导入时最容易
出错的地方，**必须**在阅读后续章节时牢记以下差异：

| 软件 | 向上轴 | 前向轴 | 手性 | 单位 | 说明 |
|------|--------|--------|------|------|------|
| **PDE 引擎** | Y-up | +Z 前向 | 右手系 | 厘米 (cm) | 游戏运行时坐标系，模型侧躺显示 |
| **Maya** | Y-up | +Z 前向 | 右手系 | 厘米 (cm) | 与 PDE 引擎一致！无需转换 |
| **Blender** | Z-up | -Y 前向 | 右手系 | 米 (m) | 与 PDE/Maya 不同，需要转换 |

### Maya → PDE 引擎：无需坐标转换

Maya 和 PDE 引擎都是 **Y-up 右手系**，前向轴也一致 (+Z)，
单位也一致 (厘米)。因此 Maya 导出的坐标、法线、骨骼位置、
动画位移等可以直接被引擎使用，**不需要任何坐标系转换**。

这也是 Maya 导出器代码中没有任何坐标轴翻转逻辑的原因。

### Blender → PDE 引擎：需要坐标转换

Blender 是 **Z-up 右手系**，与 PDE 引擎的 Y-up 不同。

Blender → PDE 的轴映射:
```
PDE.X  =  Blender.X
PDE.Y  =  Blender.Z     (Blender Z → PDE Y)
PDE.Z  = -Blender.Y     (Blender -Y → PDE Z, 注意取反)
```

PDE → Blender 的轴映射 (导入时):
```
Blender.X  =  PDE.X
Blender.Z  =  PDE.Y     (PDE Y → Blender Z)
Blender.Y  = -PDE.Z     (PDE Z → Blender -Y, 注意取反)
```

### 单位转换

| 方向 | 转换公式 | 说明 |
|------|---------|------|
| Blender → PDE | ×100 | Blender 米 → PDE 厘米 |
| PDE → Blender | ×0.01 | PDE 厘米 → Blender 米 |

### 旋转转换 (四元数)

由于坐标轴不同，四元数也需要相应转换：

```
Blender 四元数 (x, y, z, w) → PDE 四元数:
  PDE.x =  Blender.x
  PDE.y =  Blender.z
  PDE.z = -Blender.y
  PDE.w =  Blender.w
```

### UV 翻转

PDE 引擎加载 UV 时会翻转 Y 分量：`1.0 - y`。
这并非坐标系差异导致，而是纹理原点不同（Maya/Blender UV 原点在左下角，
DirectX 纹理原点在左上角）。

## 1. 网格导出格式 (.mesh Lua 文本)

### 源码: `exportMesh.cpp` — `MeshExportor::SaveText()` (line 723)

导出的 Lua 表结构:

```lua
{
    Materials = {
        -- 材质 0 (pdeCgfxShader 类型)
        {
            -- cgfx shader 参数 (键值对)
            texture_name = "texture_file.tif",
            color_param = { r, g, b, a },
            float_param = 1.0,
            ...
        },
        -- 材质 1 (未知 shader 类型)
        {
            Name = "shaderNodeName",
        },
    },

    Joints = {
        "jointName1",
        "jointName2",
        ...
    },

    Mesh = {
        Points = { x, y, z, x, y, z, ... },           -- 顶点坐标 (3×N)
        Normals = { x, y, z, x, y, z, ... },           -- 法线 (3×N)
        Colors = { r, g, b, a, r, g, b, a, ... },      -- 顶点色 (4×N)

        BlendCounts = { count1, count2, ... },          -- 每顶点权重数
        BlendIndices = { idx1, idx2, ... },             -- 骨骼索引 (展开)
        BlendWeights = { w1, w2, ... },                 -- 骨骼权重 (展开)

        FaceVertexCount = { vpf1, vpf2, ... },          -- 每面顶点数
        FaceVertices = { v1, v2, v3, ... },              -- 面顶点索引
        FaceVertexNormals = { n1, n2, n3, ... },         -- 面顶点法线索引
        FaceVertexColors = { c1, c2, c3, ... },          -- 面顶点颜色索引
        FaceTriangleCount = { tc1, tc2, ... },          -- 每面三角形数
        FaceTriangles = { i1, i2, i3, ... },             -- 三角形顶点索引 (每3个一组)
        FaceMaterials = { m1, m2, ... },                 -- 每面材质索引

        UVSets = {
            {
                Name = "map1",
                UVs = { u, v, u, v, ... },              -- UV 坐标 (2×N)
                Tangents = { x, y, z, ... },             -- 切线 (3×N)
                Binormals = { x, y, z, ... },            -- 副法线 (3×N)
                FaceVertexUVIndices = { uv1, uv2, ... }, -- 面顶点 UV 索引
                FaceVertexTangentIndices = { t1, t2, ... }, -- 面顶点切线索引
            },
            ...
        },
    },
}
```

### 1.1 材质导出格式

源码: `exportMesh.cpp:21-178` — `ExportPdeCgfxShader()` / `ExportSingleMaterial()`

**pdeCgfxShader 类型**: 导出 cgfx shader 节点上的所有参数为 Lua 键值对。
参数类型支持: bool, int, float, string, Vector2, Vector3, Vector4, Color, Matrix, Texture。

**材质属性** (在 cgfx shader 节点上设置，通过 Lua 表传入客户端):

| 属性名 | 类型 | 说明 | 客户端读取位置 |
|--------|------|------|---------------|
| `IsInVisible` | int | 0=可见, 1=不可见 | LoadRawData:1237 |
| `CollisionMode` | int | 碰撞模式 | LoadRawData:1241 |
| `BlendLayer` | int | 混合层 | LoadRawData:1265 |
| `AlphaBlendMode` | int | 混合模式 (0-4) | LoadRawData:1269 |
| `CullingMode` | int | 剔除模式 | LoadRawData:1299 |
| `PhysicsMaterial` | int | 物理材质 | LoadRawData:1305 |
| `vertex_shader_lod_N` | string | 第 N 级 LOD 顶点着色器 | Material::Load(Lua):464 |
| `pixel_shader_lod_N` | string | 第 N 级 LOD 像素着色器 | Material::Load(Lua):481 |

### 1.2 AlphaBlendMode 映射 (Maya→引擎)

源码: `MeshResource.cpp:1269-1297` — LoadRawData 中的映射

| Maya UI 值 | UI 标签 | 引擎枚举 | 枚举值 |
|------------|---------|---------|--------|
| 0 | none | `kBlendNone` | 0x01 |
| 1 | blend | `kSourceAlphaAdd` | 0x04 |
| 2 | clip | `kAlphaTest` | 0x02 |
| 3 | add | `kAdditive` | 0x20 |
| 4 | (clip 变体) | `kAlphaTest` | 0x02 |
| 其他 | - | `kBlendNone` | 0x01 |

### 1.3 CullingMode 映射

| Maya UI 值 | UI 标签 | 引擎枚举 | 枚举值 |
|------------|---------|---------|--------|
| 0 | cw | `kCullModeCW` | 0 |
| 1 | ccw | `kCullModeCCW` | 1 |
| 2 | none | `kCullModeNone` | 2 |

### 1.4 PhysicsMaterial 枚举

| Maya UI 值 | 标签 |
|------------|------|
| 0 | concrete (混凝土) |
| 1 | clay (泥土) |
| 2 | wood (木头) |
| 3 | stone (石头) |
| 4 | metal (金属) |

### 1.5 CollisionMode 值

| 值 | 说明 |
|----|------|
| 0 | 正常渲染网格 |
| 1 | 碰撞网格 (仅物理, 不渲染) |
| 4 | 特殊碰撞 (不渲染) |

### 1.6 权重导出逻辑

源码: `exportMesh.cpp:546-604`

- 每顶点最多 4 个权重 (`blendIndex[4]`, `blendWeight[4]`)
- 权重 < 0.001 的被忽略
- 超过 4 个权重的顶点会触发警告
- 权重会被归一化 (`weightSum` 的倒数 × 每个权重)
- **关键**: `blendIndex = jointMap[i] + 1` (索引 +1，引擎加载时 `-1` 还原)
- 引擎 `MeshResource::LoadRawData:1149`: `data.blendindices.PushBack(blendindex[j] - 1)`

## 2. 骨骼导出格式 (.skel Lua 文本)

### 源码: `exportSkeleton.cpp` + `exportMesh.cpp:877-913` — `SaveJoints()`

### 2.1 MeshExportor::SaveJoints 格式

```lua
Joints{
    { "jointName", parentId, tx, ty, tz, qx, qy, qz, qw },
    { "jointName", parentId, tx, ty, tz, qx, qy, qz, qw },
    ...
}
```

每个关节一行，紧凑格式:
- `name`: 关节名 (去命名空间)
- `parentId`: 父关节索引 (uint32)
- `translate`: 平移 (Vector3, 3×float)
- `rotate`: 旋转 = `rotateAxis * rotate * orient` (Quaternion, 4×float)

### 2.2 关节旋转计算

源码: `exportMesh.cpp:886` / `exportMesh.cpp:228`

```
rotate = rotateAxis * rotate * orient
```

其中:
- `rotate`: Maya transform 的 `rotate` 属性 (动画驱动)
- `rotateAxis`: Maya joint 的 `rotateAxis` 属性
- `orient`: Maya joint 的 `jointOrient` 属性
- 最终旋转为三者的乘积，代表关节的完整旋转

### 2.3 WorldMatrix 计算

源码: `exportMesh.cpp:228`

```
worldMatrix.SetTransformation(translate, rotateAxis * rotate * orient, scale)
if (parentId != -1):
    worldMatrix = worldMatrix * parent.worldMatrix
```

骨骼世界矩阵通过父子层级递归相乘。

## 3. 动画导出格式 (.anim Lua 文本)

### 源码: `exportAnimation.cpp` — `MayaAnimationExport::ExportAnimation()`

### 3.1 导出的 Lua 表结构

```lua
Tracks = {
    {
        Node = "jointName",
        Property = "rotateQuaternion",
        FrameCount = N,
        FrameData = { qx, qy, qz, qw, qx, qy, qz, qw, ... },
    },
    {
        Node = "jointName",
        Property = "translate",
        FrameCount = N,
        FrameData = { tx, ty, tz, tx, ty, tz, ... },
    },
    ...
}
```

### 3.2 关键发现：动画格式与 .cache 二进制不同！

| 特征 | Maya 导出 (.anim Lua) | .cache 二进制 |
|------|----------------------|---------------|
| 轨道结构 | 每个**属性**一条轨道 (rotateQuaternion/translate 分开) | 每个**关节**一条轨道 (7 float/帧) |
| 帧数据 | 属性值 (4 float/帧 旋转, 3 float/帧 平移) | 7 float/帧 (tx,ty,tz,qx,qy,qz,qw) |
| 关节名 | `Node` 字段 | `name` 字段 |
| 帧数 | `FrameCount` 字段 | `frame_count` 字段 |

客户端 `AnimationTrack::Load(Identifier path)` (Animation.cpp:1214)
负责将 Lua 格式转换为内存中的 JointData 结构，最终通过 `Save()`
序列化为 .cache 二进制格式。

### 3.3 旋转计算

源码: `exportAnimation.cpp:52-76`

```
Quaternion rotateQuaternion = rotateAxis * rotate * orient
```

与骨骼导出一致，动画的旋转值为三者乘积。

### 3.4 导出的轨道

每个关节导出两条轨道:
1. `rotateQuaternion` — 旋转 (4 float/帧: qx, qy, qz, qw)
2. `translate` — 平移 (3 float/帧: tx, ty, tz)

注释中可见原本打算导出 `scale`，但被注释掉了 (`exportAnimation.cpp:38`)。

## 4. 导出器入口

### 源码: `exportMap.cpp` — `pdeExportMesh::doIt()`

| Maya 命令 | 源码 | 说明 |
|-----------|------|------|
| `pdeExportMesh` | exportMap.cpp | 导出网格 (.mesh) |
| `pdeExportSkeleton` | exportSkeleton.cpp | 导出骨骼 (.skel) |
| `pdeExportAnimation` | exportAnimation.cpp | 导出动画 (.anim) |

导出参数:
- `-f <path>`: 指定导出文件路径
- `-n <selection>`: 指定要导出的节点
- `-an`: 导出所有节点
- `-sf <frame>`: 起始帧 (仅动画)
- `-ef <frame>`: 结束帧 (仅动画)

## 5. PDE Studio 导出/导入对照分析

### 5.1 PDE Studio 导出 → Maya 导出 对照

| 特征 | PDE Studio 导出器 | Maya 导出器 | 差异 |
|------|------------------|------------|------|
| 导出格式 | Lua 文本 | Lua 文本 | ✅ 一致 |
| 顶点坐标 | Points (3×float) | Points (3×float, World空间) | ⚠ Maya 用 World 空间 |
| 法线 | Normals | Normals (World空间) | ⚠ Maya 用 World 空间 |
| UV | UVSets | UVSets (含 Tangents/Binormals) | ⚠ 需检查切线/副法线导出 |
| 权重 | BlendCounts/Indices/Weights | 同结构 | ⚠ 需检查 +1 偏移 |
| 面三角化 | FaceTriangles | FaceTriangles | ✅ 一致 |
| 材质 | 参数键值对 | cgfx shader 参数 | ⚠ 需检查材质属性完整性 |
| 碰撞/物理 | FaceMaterials + 属性 | FaceMaterials + 属性 | ⚠ 需检查属性映射 |

### 5.2 需要关注的差异点

#### 5.2.1 坐标空间与坐标系转换

**坐标空间**：Maya 导出使用 **World 空间** (`MSpace::kWorld`) 获取点和法线。
PDE Studio 导出时需确认是否使用了正确的坐标空间（世界空间 vs 局部空间）。

**坐标系差异**（见文档 0.1 节）：
- Maya 与 PDE 引擎同为 **Y-up 右手系**，无需坐标轴转换
- Blender 为 **Z-up 右手系**，导出时必须做轴映射：
  - `PDE.X = Blender.X`
  - `PDE.Y = Blender.Z`
  - `PDE.Z = -Blender.Y`
- 导出时还需做单位转换：Blender 米 × 100 = PDE 厘米
- 四元数同样需要按轴映射转换（见 0.1 节）
- **不要遗漏这些转换，否则模型在引擎中会方向/比例错误！**

#### 5.2.2 权重索引偏移
Maya 导出: `blendIndex = jointMap[i] + 1` (索引 +1)
引擎加载: `blendindex[j] - 1` (索引 -1 还原)
PDE Studio 导出时需确保使用相同的 +1 偏移规则。

#### 5.2.3 UV Y 轴翻转
引擎加载时: `Vector2(map[0][v.texcoord[0]].x, 1.f - map[0][v.texcoord[0]].y)`
UV 的 Y 分量被翻转 (`1.0 - y`)。
PDE Studio 导出时需要同样翻转 UV 的 Y 分量。

#### 5.2.4 骨骼旋转顺序与坐标系

**旋转顺序**：骨骼和动画的旋转计算为 `rotateAxis * rotate * orient`。
这是 Maya 特有的骨骼旋转分解方式，Blender 的骨骼不使用相同的
`jointOrient` / `rotateAxis` 分解，需要特别处理。

**坐标系差异**：Maya/PDE 为 Y-up，Blender 为 Z-up。
骨骼的平移和旋转在导出时都必须做坐标系转换（见 0.1 节），
否则骨骼姿态会完全错误。

四元数转换：Blender (x,y,z,w) → PDE (x, z, -y, w)。
平移转换：Blender (x,y,z) → PDE (x, z, -y)，再 ×100 转换单位。

#### 5.2.5 动画轨道结构
Maya 导出的动画是**按属性分轨道** (rotateQuaternion 和 translate 分开)，
最终编译到 .cache 时合并为每关节一条轨道 (7 float/帧)。
PDE Studio 导出时需确认导出的轨道结构是否与 Maya 一致。

#### 5.2.6 材质属性完整性
Maya 通过 cgfx shader 节点导出材质参数。
需要确认 PDE Studio 是否导出了所有必要属性:
- `IsInVisible`, `CollisionMode`, `BlendLayer`
- `AlphaBlendMode`, `CullingMode`, `PhysicsMaterial`
- `vertex_shader_lod_N`, `pixel_shader_lod_N`
- 纹理路径 (仅文件名，不含路径和扩展名)

#### 5.2.7 顶点色默认值
Maya 导出时，顶点色默认值为 `(1, 1, 1, 1)` (白色, 不透明)。
引擎加载时，空顶点色或不存在的颜色索引设为 `ARGB(255, 255, 255, 255)`。
PDE Studio 导出时需确保顶点色默认值一致。

#### 5.2.8 UV 默认值
Maya 导出时，无 UV 的顶点默认值为 `(0.5, 0.5)`。
PDE Studio 导出时需确保 UV 默认值一致。

#### 5.2.9 顶点合并逻辑
Maya 导出时，按 (vertex, normal, texcoord0, texcoord1, color) 组合键
进行顶点去重 (`exportMesh.cpp:1010-1025`)。
PDE Studio 导出时需使用相同的合并策略。

## 6. 总结

Maya 导出器导出的是 **Lua 文本格式**，客户端通过 `LoadRawData()` 加载
Lua 表，然后 `BuildStream()` 构建顶点缓冲并编译为 `.cache` 二进制。

PDE Studio 的导出器也应该导出相同格式的 Lua 文本，
这样可以直接使用 `client.exe` 编译为 `.cache`。

需要重点关注的差异:
1. **坐标系转换** — Blender Z-up → PDE Y-up，轴映射 + 单位 + 四元数
2. **UV Y 轴翻转** (`1.0 - y`，纹理原点差异)
3. **权重索引 +1 偏移**
4. **骨骼旋转顺序** (`rotateAxis * rotate * orient`，Maya 特有分解)
5. **材质属性完整性** (所有 cgfx shader 参数)
6. **顶点合并策略** (按 vertex+normal+uv+color 组合键)
7. **坐标空间** (确认导出时使用世界空间还是局部空间)

**特别提醒**：Maya 与 PDE 引擎同为 Y-up 右手系，所以 Maya 导出器代码中
没有任何坐标轴翻转逻辑。PDE Studio (Blender) 导出时**不能**直接照搬
Maya 导出器的坐标处理方式，必须额外加入 Z-up → Y-up 的坐标系转换。
