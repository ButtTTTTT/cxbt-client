# PDE 引擎资源格式速查

> 本文档汇总 PDE 引擎 mesh/skeleton/animation 的二进制和文本格式定义。
> 所有数据均通过引擎源码逆向确认。

---

## 一、.cache 文件头结构

所有 `.cache` 文件共用此头部格式。

```
uint32 type          - 资源类型标识 (0x0100=Mesh, 0x0500=Anim, 0x0600=Skeleton, 0x0700=Physx)
uint16 pack_ver      - 打包版本 (=2 标准 cache, =1 裸流)
uint16 res_ver       - 资源版本
uint32 dep_count     - 依赖文件数量
{ path(string) + time(FILETIME) } x dep_count
uint32 data_size     - 数据大小
uint32 crc           - CRC32 校验值 (大端序)
uint32 compressed    - 是否压缩标志
bytes data           - 压缩后/未压缩的二进制数据
```

### CRC32 算法

PDE 使用**自定义 CRC32**，非标准 zlib：

1. `CalculateCrcValue("crc_key")` = `0xC4999A60`（初始值）
2. `ProcessByte`: `byte ^= (hash & 0xFF)`, `hash = (hash >> 8) ^ table[byte]`
3. 用 VFS 路径计算 path_hash
4. 对文件 `0x18` 之后所有字节做 CRC
5. 最终值转**大端序**与文件头比对

查找表来自 `LookupTable.cpp`（1024 字节 = 256 个 uint32）。

### 压缩算法

自定义 LZ-hash 压缩（`utilities.cpp:293-666`）：
- 控制字: 每次消耗 1 bit
- bit 0 == 1: 匹配模式（5 种编码模式，读取 offset + matchlen）
- bit 0 == 0: 字面量模式（用 bitlut 决定连续拷贝字节数）

---

## 二、Mesh 二进制格式 (.mesh.cache)

`MeshResource::LoadData` / `SaveData` 使用的二进制流格式。

### 顶层结构

| 字段 | 大小 | 说明 |
|------|------|------|
| resType | 4B | 0x0100 |
| meshType | 4B | 1=kStatic, 2=kSkin |
| boneNames | 变长 | 仅 kSkin: u32 count + [u32 len + string]×count |
| boneAABBs | 变长 | 仅 kSkin: u32 count + 24B×count |
| localAABB | 24B | 仅 kStatic: 6 floats (minXYZ + maxXYZ) |
| primitives | 变长 | u32 count + primitive[]×count |
| physical_material_count | 4B | int32 |
| physical_materials | 变长 | uint32×count |

### Primitive 结构

| 字段 | 大小 | 说明 |
|------|------|------|
| triCount | 4B | 三角形数 |
| vertexCount | 4B | 顶点数 |
| layer | 4B | |
| cullMode | 4B | 0=CW, 1=CCW, 2=None |
| blendMode | 4B | |
| visible | 1B | |
| vertexDataSize | 4B | |
| vertexData | N×52/64B | Static=52B/vert, Skin=64B/vert |
| indexDataSize | 4B | |
| indexData | N×4B | U32 索引 |
| hasMaterial | 1B | |
| material | 变长 | 若 hasMaterial |
| collisionMode | 4B | |

### 顶点格式

**StreamStatic (52B)**：
```
Vector3 position(12) + half4 normal(8) + half4 tangent(8) + half4 binormal(8)
+ half2 uv0(4) + half2 uv1(4) + half2 uv2(4) + ARGB color(4)
```

**StreamSkin (64B)**：
```
Vector3 position(12) + half4 normal(8) + half4 tangent(8) + half4 binormal(8)
+ BYTE[4] blendindices(4) + Vector4 blendweight(16) + half2 uv0(4) + half2 uv1(4)
```

### Material 二进制格式

```
uint vertex_shader_count
for each: [uint name_len] + [name bytes]
uint pixel_shader_count
for each: [uint name_len] + [name bytes]
uint vertex_uniform_lod_count
for each LOD:
  uint uniform_count
  for each: [uint name_len] + [name] + [uint count] + [float×count]
uint pixel_uniform_lod_count
for each LOD:
  uint uniform_count
  for each: [uint name_len] + [name] + [uint count] + [float×count]
uint texture_uniform_lod_count
for each LOD:
  uint tex_count
  for each: [uint name_len] + [type_name] + [uint path_len] + [path]
```

---

## 三、Mesh 文本格式 (.mesh, Lua)

`MeshResource::LoadRawData` 读取的 Lua 表格式。

### 顶层结构

```lua
{
    Points = {x, y, z, ...},           -- 顶点坐标（厘米单位）
    Normals = {nx, ny, nz, ...},       -- 法线
    FaceVertexCount = {3, 4, ...},      -- 每个面的顶点数
    FaceVertices = {v0, v1, v2, ...},   -- 面顶点索引
    FaceTriangleCount = {1, 2, ...},    -- 每个面的三角形数
    FaceTriangles = {0,1,2, 0,2,3,...}, -- 三角形局部索引
    FaceVertexNormals = {idx, ...},     -- 面顶点法线索引
    UVSets = {                          -- UV 集
        {Name="default", UVs={u,v,...}, FaceVertexUVIndices={idx,...}},
        ...
    },
    Tangents = {tx,ty,tz, ...},         -- 切线（按面顶点顺序，不去重）
    Binormals = {bx,by,bz, ...},
    FaceVertexTangentIndices = {0,1,2,...}, -- 切线索引（连续递增）
    -- 蒙皮数据（仅 kSkin）
    Joints = {"bone1", "bone2", ...},
    BlendCounts = {n, ...},
    BlendIndices = {idx, ...},           -- 1-based
    BlendWeights = {w, ...},
    Materials = {
        {
            vertex_shader_lod_0 = "lc_main",
            pixel_shader_lod_0 = "s_colormap_lod_0",
            ColorMap = "../materials/texture_d.dds",
            IsInVisible = 0,
            CollisionMode = 1,
            PhysicsMaterial = 0,
            BlendLayer = 0,
            AlphaBlendMode = 0,
            CullingMode = 0,
        },
    }
}
```

---

## 四、Skeleton 二进制格式 (.skel.cache)

| 字段 | 大小 | 说明 |
|------|------|------|
| resType | 4B | 0x0600 |
| jointCount | 4B | |
| joints | 变长 | [s32 parentId, u32 len, string name]×count |
| transformCount | 4B | |
| transforms | 28B×count | [Vector3(12B) + Quaternion(16B)] |

---

## 五、Animation 二进制格式 (.anim.cache)

| 字段 | 大小 | 说明 |
|------|------|------|
| resType | 4B | 0x0500 |
| jointCount | 4B | |
| tracks | 变长 | [u32 len, string name, u32 frameCount, u32 dataLen, float[dataLen]]×count |

每帧 7 个 float: `tx, ty, tz, qx, qy, qz, qw`

---

## 六、PhysX 二进制格式 (.physx.cache)

| 字段 | 大小 | 说明 |
|------|------|------|
| type | 4B | 0x0700 = kResTypePhysx |
| actorCount | 4B | |
| for each actor: | | |
| bufSize | 4B | NxTriangleMesh cooked data size |
| bufData | bytes | NXS... cooked mesh data |
| colMode | 4B | 1=kStatic, 2=kStaticCollisionWithPerson, etc |
| attrCount | 4B | TriangleAttribute count |
| attrData | bytes | attrCount × 12 bytes (D3DXVECTOR2_16F uv1[3]) |

---

## 七、文本格式 vs 二进制格式差异

> **核心要点：导入和导出面对的格式不同，不能简单对称。**

| 属性 | 文本格式 (.mesh) | 二进制格式 (.mesh.cache) |
|------|-----------------|------------------------|
| 位置单位 | 厘米（加载器 ×0.01 转米） | 米（运行时直接使用） |
| UV V 坐标 | OpenGL (V=0 底部，加载器内部 1-y) | DirectX (V=0 顶部，已翻转) |
| 面绕序 | CCW（同 Maya/Blender） | CCW |
| BlendIndices | 1-based（加载器 -1 转 0-based） | 0-based（直接存储） |
| 骨骼 dummy root | 有 (index 0，引擎自动添加) | 无 |
| 动画 translate | 厘米（加载器 ÷100） | 米（直接） |
| 面拓扑 | 保留原始多边形（可含四边面） | 全三角形 |
| 加载器 | `MeshResource::LoadRawData` | `MeshResource::LoadData` |
