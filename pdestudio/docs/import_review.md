# PDE Studio 导入功能审查报告

> 审查日期：2026-09-12
> 方法：以 `tc/client` 的 `SaveData()` 写出端为唯一标准，逐字节校验 `pdestudio/src/importer/` 的解析端。
> 结论：**二进制解析层基本正确**，主要问题在于「解析出来但没用上」与「导入/导出语义不对称」。

---

## 一、解析正确性验证（对照引擎源码）

### ✅ 已验证正确的部分

| # | 项目 | Python 实现 | 引擎依据 | 判定 |
|---|---|---|---|---|
| 1 | 资源净荷开头跳 4 字节 type | `binary/mesh.py:195`、`skeleton.py:59`、`animation.py:54` | `Resource::LoadData` 读 `uint type`（`Resource.cpp:1413-1422`），子类 LoadData 首行调用 | ✅ |
| 2 | cache 头布局 | `cache_decoder.py:93-107` | `Resource.cpp:434-459`：type u32 / pack_ver u16 / res_ver u16 / dep u32 / size u32 / crc u32 / compressed u32 | ✅ |
| 3 | LZ 解压头 | `_decompress` 的 `header_len = 2*n+1`，size 读自 `1+n` | `utilities.cpp:273-281` `DecompressSize` = `fast_read(source + 1 + n, n)`，n=4 时偏移 5 = **解压后大小** | ✅ 代码对，**但文件头注释把两个 size 写反了**（`cache_decoder.py:223-225`） |
| 4 | flags 位含义 | `flags&1` 压缩标志、`flags&2` 宽度 | `utilities.cpp:600-620` | ✅ |
| 5 | CRC 校验 | `data[0x18:]` 算、`data[0x10:0x14]` 比 | dep_count=0 时头正好 24B，payload 从 0x18 起 | ✅（依赖 dep_count=0，而 `main.cpp:674-678` 已强制关闭依赖，故恒成立） |
| 6 | Mesh 主结构字节序列 | `mesh.py:199-290` | `MeshResource.cpp:192-293` | ✅ |
| 7 | `visible` 1 字节 | `bool(data[pos]); pos+=1` | `Write(&visible, sizeof(bool))` MSVC=1 | ✅ |
| 8 | `has_material` 1 字节 | `data[pos]; pos+=1` | `sizeof(byte)` | ✅ |
| 9 | `collision_mode` 4 字节 | `<I` | `sizeof(U32)` | ✅ |
| 10 | bone_aabb 24B | `pos += ac*24` | `F32 fAxis[6]` | ✅ |
| 11 | StreamStatic 52B / StreamSkin 64B | `mesh.py:233-264` | `VertexDeclaration.h:16-38`、`VertexDeclaration.cpp:169-170` | ✅ |
| 12 | half4/half2 解码（低16位=x） | `_decode_half4` | `D3DXVECTOR4_16F` 内存序 | ✅ |
| 13 | `blendindices` 0-based、空槽 0xFF | `bone_names[bone_idx]`，`bone_idx < len(bone_names)` 才生效 | `MeshResource.cpp:1137-1174` 唯一一次 `-1`；`Mesh::CreateSkinCluster`（`Mesh.cpp:783-819`）**不插虚拟根**，`bonename` = Lua `Joints` 原样 | ✅ |
| 14 | 索引 U32 | `ib_size//4` | `primitive_count*3*sizeof(U32)` | ✅ |
| 15 | Skeleton Transform 28B、`x,y,z,w` | `skeleton.py:93-97` | `Animation.h:4-16` + `quaternion.h` union `{x,y,z,w}`；`sizeof=28` 无 padding | ✅ |
| 16 | Skeleton parent_id int32、name 无 `\0` | `skeleton.py:69-73` | `Animation.cpp:61-74` | ✅ |
| 17 | 动画 `data_size` = **float 个数** | `animation.py:70-72`，`pos += data_len*4` | `Animation.cpp:1193-1212` `Write(data.GetData(), sizeof(float)*Size())` | ✅ |
| 18 | 动画 name 带长度前缀无 `\0` | `animation.py:62-64` | `BinaryStreamWriter::WriteString`（`binaryStreamOperator.cpp:364-368`） | ✅ |
| 19 | 每帧 7 float `[t3][q4]` | `animation.py:78-82` | `Animation.cpp:1379-1387` | ✅ |
| 20 | Material 全字段 uint32 长度前缀 | `mesh.py:128-182` | `Material.cpp:380-459` | ✅ |
| 21 | 贴图净荷去 8 字节 | `material.py:316-317` `decoded[8:]` | `Resource::SaveData`(type 4B) + `Texture::SaveData`(size 4B)（`Texture.cpp:8-37`），之后才是图片原文 | ✅ |
| 22 | 单位：二进制是米（引擎已 /100） | 导入 scale=1.0，导出 ×100 | `Animation.cpp:170-181`、`1292`、`MeshResource.cpp:1036` | ✅ |
| 23 | 坐标系导入/导出互逆 | 导入 `(x,y,z)→(x,-z,y)`；导出 `(x,y,z)→(x,z,-y)` | — | ✅ 互为逆 |
| 24 | UV：导入 `1-v`、导出不翻 | `mesh_builder.py:213` / `mesh_data.py:176-212` | `MeshResource.cpp:1087/1121/1133` 引擎内部翻 | ✅ |
| 25 | 动画 pose 公式 | `target = anim_world @ rest_world⁻¹ @ bone.matrix_local` | 引擎按名字匹配骨骼（`Primitive.cpp:233`），local = T·R 组合顺序与 `Animation.cpp:855-870` 一致 | ✅ |

**结论：解析层没有发现字节级错位。** 可以信任它读出来的数据。

---

## 二、真正的问题

### 🔴 P0 — 解析了但完全没用上

#### 1. 切线 / 副法线：解析了，却丢进了垃圾桶

`binary/mesh.py:239, 254` 把 `tangent` / `binormal` 解析进了 `PDEVertexStatic` / `PDEVertexSkin`，
但 `core/mesh_builder.py` **全文没有一处引用 `v.tangent` / `v.binormal`**。

后果：导出时只能靠 `mesh.calc_tangents(uvmap="UVMap")` 重算（`exporter/mesh_data.py:52-56`），
而重算值与原值在**镜像 UV、UV 接缝、硬边、第 2/3 套 UV** 处必然不同 → 法线贴图模型的明暗接缝会变。

> 这是当前**最大的一项不可还原损失**。而且二进制里数据是现成的。
>
> 修法思路：Blender 本身不存 tangent，但可以像 `pde_rest_matrices` 那样存进自定义属性
> （如 `mesh["pde_tangents"]` / `["pde_binormals"]`，按 loop 存），导出时直接取用，不走 `calc_tangents`。

#### 2. 物体世界变换完全不进导出

`exporter/mesh_data.py` **全文无 `matrix_world`**（已确认 0 处匹配），`Points` 只取 `mesh.vertices` 局部坐标。

而场景导入会把位置写进 `obj.location`（`scenes/scene_import_helpers.py:258, 310`）。
→ 导入场景里的 gate / 活动物体，导出后**位置全部塌回原点**。

多对象合并（`exporter/mesh_merge.py:84-95`）也只是顶点偏移拼接，同样不带物体变换。

#### 3. `BlendCounts` 按 face-vertex 展开（导出侧，承接上次报告）

`exporter/mesh_data.py:325-331` 在面内循环里追加，
但引擎 `Mesh::CreateSkinCluster`（`Mesh.cpp:802-809`）按 **vertex** 建 offsets，`MeshResource.cpp:1139` 用 `GetWeights(v.vertex)` 取值。
→ 蒙皮权重错位，不崩溃但结果错。

---

### 🟠 P1 — 骨骼虚拟根：会污染导出的 .skel

引擎 `Skeleton::BuildData` 会**插入一根虚拟根**（`Animation.cpp:143-166`）：

```cpp
joints.Resize(array_size + 1);      // Lua 有 N 个 → 内部 N+1
joints[0].parent_id = -1;           // 虚拟根，name 为空串
pose[0].position = Vector3::kZero;
pose[0].rotation = Quaternion::kIdentity;
for (int i = 0; i < array_size; i++) {
    Joint & joint = joints[i + 1];               // 真实骨骼整体 +1
    joint.parent_id = L->ToInteger(-1) + 1;      // 父 id 也 +1
```

所以 `.skel.cache` 里存的是 **N+1** 根。而 `binary/skeleton.py` 原封不动全读进来，
`skeleton_builder.py:147` 又给空名骨骼起名 `bone_0`：

```python
bone_name = joint.name if joint.name else f"bone_{i}"    # → "bone_0"
```

**影响分析**：
- 单次往返：Armature 多一根位于原点、恒等变换的 `bone_0`。层级**仍然自洽**（因为引擎会再插一根虚拟根把偏移抵消），蒙皮按名字匹配也不受影响 → **能用，但不干净**。
- 多次往返会**累积**：第二次导入时新的虚拟根又叫 `bone_0`，与旧的冲突，Blender 自动改名 `bone_0.001`，骨骼数持续 +1。

> 修法：`parse_skeleton_binary` 里丢弃 `index == 0 且 name == ""` 的虚拟根，其余 `parent_id -= 1`。
> 这样导入后正好 N 根、根骨骼 `parent_id == -1`，导出即还原原版 Maya 格式。

---

### 🟠 P1 — 导入阶段丢失、导出无法还原

| 数据 | 原因 | 位置 |
|---|---|---|
| **Skin 网格的 UV2** | `StreamSkin`(64B) 格式本身无 uv2 槽位 | `binary/mesh.py:249-264` |
| **Skin 网格的顶点色** | 同上，格式无 color 槽位 | `mesh_builder.py:179-180` |
| **全零 UV1 / UV2** | "全零则不建层"过滤 | `mesh_builder.py:216-217, 226-228` |
| **全白顶点色** | 全白则不创建 color attribute | `mesh_builder.py:409-410` |
| **原始多边形拓扑** | 导入即按 3 索引切三角 | `mesh_builder.py:184-186` |
| **动画元信息** | 逐帧重采样，原 `frame_count`/非均匀关键帧结构丢弃 | `animation_builder.py:141-198` |
| **原 VFS 路径** | 不存，导出靠文件路径里的 `/mesh/` 反推 | `export_utils.py:208-268` |
| **场景级全部 Lua 数据** | `map_name`/`physx_mesh`/`light_map`/`occluders`/`sun_direction`/`fog`/`particles`/gate 的 `team`+`id`+`pos2`/活动物体的 `up`+`speed` | `scenes/lua_parser.py` 只取了 pos/rotation/mesh |

> **面拓扑**这条值得单独提醒：导入三角化后，导出只能产出全三角形，而原版 Maya 保留四边面/NGon。
> 按 `docs/export_analysis.md` §10 的记录，边数多约 50%，会让 `Mesh::Create` 的 `quick_sort` 不稳定、**PhysX 碰撞烹饪失效**。

---

### 🟡 P2 — 导入存了、但导出阶段又丢掉

| 数据 | 位置 | 说明 |
|---|---|---|
| 材质 LOD1+ 贴图 | `exporter/mesh_materials.py:120-130` | 导入存了全 LOD，导出只写第一个非空 LOD 就 `break` |
| uniform LOD1+ | `mesh_materials.py:134-150` | 只取 LOD0；VS/PS 同名 uniform 去重还会丢值 |
| `CullingMode` 枚举 | `mesh_materials.py:202` | **直接写二进制值，未做二进制→文本枚举转换**，与同文件 186 行注释自相矛盾 |
| `AlphaBlendMode` | `mesh_materials.py:167-172` | 映射表只覆盖 `{1,4,2,32}`，其它值一律落 0 |
| `physical_material` 索引 | `mesh_builder.py:117-123` | `pm_list[prim_idx]` 赋给 `primitives[prim_idx]`，但引擎里 `physical_material[p]` 对应 `primitives[p+1]` → **疑似错位 1** |

---

### 🟡 P2 — 健壮性

1. **自动骨骼关联失败 → 导出必错**
   `manual/skeleton_auto.py` 推导失败时，`mesh_builder.py:27-50` 创建占位 Armature：
   所有骨骼堆在 `(0,0,0)`、`tail=(0,0,0.05)`、**无 `pde_rest_matrices`** → 导出的 .skel 数据全错。
   建议：推导失败时直接报错阻止导入，而不是静默给个错的。

2. **coord_mode 不对称**
   mesh 导入用 `props.import_coord_mode`，导出用 `get_armature_coord_mode(armature)`，
   **无骨骼时硬编码 `"zup"`**（`exporter/mesh_data.py:58-59`）。导入用 `yup` 而导出无骨骼 → 坐标全错。

3. **`resolve_vfs_file` 无大小写容错**（`common.py:53-69`），只试 `.cache` 与裸文件，不列目录匹配。

4. **`detect_file_format` 返回 unknown 时仍按 cache 解码**（`common.py:37-40`），只 warning。

5. **纹理解码硬编码去 8 字节**（`material.py:316-317`）——当前正确，但依据是"type 4B + size 4B"这个约定，建议改成"读 u32 size 后按 size 取尾部"。

---

## 三、回答你的三个问题

### Q1：解析的对吗？
**对。** 我用引擎写出端逐字节核对了 25 项（见第一节），包括容易踩坑的
`Resource::LoadData` 的 4 字节 type、LZ 解压头里**第二个** size 才是解压后大小、
`visible`/`has_material` 是 1 字节、`blendindices` 是 0-based 空槽 0xFF、
动画 `data_size` 是 float 个数而非字节数、贴图净荷前 8 字节是 type+size。全部吻合。

### Q2：有什么问题？
主要是四类：
1. **切线/副法线解析了不用**（P0，法线贴图模型会错）
2. **物体世界变换不导出**（P0，场景物体位置塌回原点）
3. **骨骼虚拟根被当成真骨骼**（P1，.skel 多一根、多次往返累积）
4. **一堆"导入存了但导出又丢"的项**（P2：LOD1+、cull_mode 枚举、物理材质错位）

### Q3：缺少什么？
**格式本身不存在的**：Skin 的 UV2、Skin 的顶点色、原始多边形拓扑。
**存在但没接进 Blender 的**：切线/副法线。
**接进去了但导出丢弃的**：材质 LOD1+、uniform LOD1+。
**压根没解析的**：全部场景级 Lua 数据（gate 的 pos2/team、活动物体的 up/speed、light_map、fog、sun 等）。

---

## 四、建议的修复顺序（为导出做准备）

1. **存切线/副法线** — 在 `mesh_builder.py` 里把 `v.tangent`/`v.binormal` 按 loop 存进 `mesh["pde_tangents"]`/`["pde_binormals"]`，导出时优先取用，跳过 `calc_tangents`。收益最大。
2. **导出时应用 `obj.matrix_world`** — 至少在多对象合并路径里把物体变换烘进顶点。
3. **导入时剥离引擎虚拟根** — `parse_skeleton_binary` 丢掉空名 index-0，其余 `parent_id -= 1`。
4. **修 `BlendCounts` 按顶点展开**。
5. **导出支持 LOD1+ 贴图/uniform**，并修 `CullingMode` 枚举转换。
6. **自动骨骼失败时报错**而非静默占位。
7. （可选）导入时把原 VFS 路径存到 `obj["pde_vfs_path"]`，导出直接复用，不靠 `/mesh/` 反推。
