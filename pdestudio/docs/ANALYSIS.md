# FC / PDE 资源管线现状分析

> 分析日期：2026-09-12　范围：`tc/editor`（Maya 插件）、`tc/client`（游戏客户端）、`pdestudio`（Blender 扩展）
> 目的：摸清「Maya 导出 → Lua 明文 → KBuild 编译 → .cache」整条链路，评估 Blender 重写版 pdestudio 的完成度与剩余问题。

---

## 0. 一句话总览

```
【原版工作流】
Maya2008 + editor.mll ──导出──▶ Lua 明文 .mesh/.skel/.anim
                                        │
                       td/builder/data/cache_xxx.lua（资源清单）
                       td/builder/data/gen_xxx.lua  （编译驱动）
                                        │
                       client.exe (KBuild 配置) -exec gen_xxx.lua
                                        │
                                        ▼
                       data/**/*.mesh.cache  (Resource头 + LZ压缩 + CRC32)

【现在的目标】把最左边一环换成 Blender + pdestudio，后面全部不动。
```

三套资源、三种格式各自的"真身"：

| 文件 | 顶层 Lua 结构 | 引擎消费类 | 版本号 |
|---|---|---|---|
| `.mesh` | `Materials` + `Joints`(名字列表) + `Mesh{...}` | `MeshResource` (`render/MeshResource.cpp`) | **8** |
| `.skel` | `Joints{ {name,parentId,px,py,pz,qx,qy,qz,qw} }` | `Skeleton` (`game/Animation.cpp:110`) | 3 |
| `.anim` | `Tracks{ {Node,Property,FrameCount,FrameData} }` | `Animation/AnimationTrack` (`Animation.cpp:1214`) | 3 |
| (派生物理) | 复用 `.mesh`，按 `CollisionMode` 分 1..6 组烘焙 | `PhysxResource` (`game/Level.cpp:3322`) | 5 |

---

## 1. `tc/editor` — Maya 2008 导出插件

### 1.1 组成

| 目录 | 内容 |
|---|---|
| `plugin/pluginEntry.cpp` | `initializePlugin`：挂日志流 → 遍历静态链表注册命令 → idle 时 `source pdeStudioForMaya.mel; pdeStudioInit` → `cgfx_initializePlugin` |
| `export/` | 3 个导出命令 + 公共工具 |
| `cgfx/` | `pdeCgfxShader` 硬件着色器节点（材质参数的来源） |
| `scripts/*.mel` | 菜单/UI/场景导出/烘焙设置 |
| `editor.vcproj` | 输出 `editor.mll`，依赖 Maya2008 + Turtle 渲染器（`tc/editor/README.md`） |

命令通过 `utilities/marco.h:121-137` 的 `DEFINE_MAYA_*_COMMAND` 宏 + 静态链表自动注册（`mayaUtilities.cpp:97-112`）。

### 1.2 三个导出命令

| 命令 | 定义位置 | 产物 |
|---|---|---|
| `pdeExportMesh` | **`export/exportMap.cpp:5`**（文件名与职责错位，易误读） | `Materials` + `Joints` + `Mesh`（一个文件写完，不再拆 `.material`/`.mesh`，拆分代码已注释） |
| `pdeExportSkeleton` | `export/exportSkeleton.cpp:10` → `MeshExportor::SaveJoints` | 紧凑 `Joints{...}` 九元组 |
| `pdeExportAnimation` | `export/exportAnimation.cpp:224` | `Tracks{...}` |

命令行参数只有 5 个（`exportor.cpp:8-29`、`exportAnimation.cpp:215-217`）：
`-f/--file`（完整路径）、`-n/--node`、`-an/--allnode`、`-sf/--startFrame`、`-ef/--endFrame`。
**不指定 `-f` 就弹 Windows 另存为对话框**；`Global::GetExportPath()` 等 workspace 路径函数全是死代码，从未被调用。

### 1.3 导出的 Lua 字段全集

**`.mesh`（`exportMesh.cpp:723-792` SaveText）**

```lua
Materials = { { <cgfx 参数名 = 值>, ... }, },     -- 每个元素 = 引擎的一个 Primitive
Joints = { "root", "spine", ... },               -- 骨骼名列表（仅蒙皮时）
Mesh = {
  Points={}, Normals={}, Colors={},
  BlendCounts={}, BlendIndices={}, BlendWeights={},
  FaceVertexCount={}, FaceVertices={}, FaceVertexNormals={}, FaceVertexColors={},
  FaceTriangleCount={}, FaceTriangles={}, FaceMaterials={},
  UVSets = { { Name=, UVs=, Tangents=, Binormals=,
               FaceVertexUVIndices=, FaceVertexTangentIndices= }, },
}
```

语义要点：
- `BlendIndices` = `jointMap[i] + 1`，**1-based**（`exportMesh.cpp:574`），0 号留给引擎内部虚拟根。
- `FaceTriangles` 是**面内局部索引**（`vertex_global2local`，`:666-667,713`），不是全局顶点 id。
- `FaceVertexColors` 无颜色时写 **-1**（`:682`）。
- 保留原始多边形面（可含四边面），三角化另行描述 → 边数比全三角化少约 50%，直接影响 PhysX 烹饪稳定性（见 `docs/export_analysis.md` §10）。
- `Points/Normals/Tangents/Binormals` 全用 **`MSpace::kWorld`**（`:614/620/443/444`）→ 导出前必须把模型摆到原点/冻结变换。

**`.skel`（`exportMesh.cpp:877-913` SaveJoints）**

```lua
Joints{                                  -- ⚠ 源码写的是 "Joints{"，少一个 " = "
  { "root",  -1, 0, 0, 0,  0, 0, 0, 1 }, -- name, parentId, tx,ty,tz, qx,qy,qz,qw
  { "spine",  0, 0, 53, 0, 0, 0, 0, 1 },
}
```
旋转 = `rotateAxis * rotate * orient`（`:886`），写出前 `Normalize()` + `fix_small(1e-5)` 归零（`:901-903, 868-874`）。

**`.anim`（`exportAnimation.cpp:159-192`）**

```lua
Tracks = {
  { Node="spine", Property="rotateQuaternion", FrameCount=30, FrameData={ qx,qy,qz,qw, ... } },
  { Node="spine", Property="translate",        FrameCount=30, FrameData={ tx,ty,tz, ... } },
}
```
每根骨骼 2 条 Track（rotate 先、translate 后），逐整数帧采样。**文件里不含帧率**——引擎硬编码 96fps。

### 1.4 单位与坐标

**导出器不做任何换算。** 全部在客户端完成：

| 转换 | 位置 |
|---|---|
| mesh 顶点 cm→m（×0.01） | `MeshResource.cpp:399, 1036` |
| skel 位置 cm→m（÷100） | `Animation.cpp:170-181` |
| anim translate cm→m（÷100） | `Animation.cpp:1292` |
| physx 点 cm→m（÷100） | `Level.cpp:3357` |
| UV V 翻转（1-y） | `MeshResource.cpp:1087/1121/1133`（**文本格式是 OpenGL V，引擎自己翻**） |
| 四元数 | 全程**不共轭** |

### 1.5 已知的插件自身 Bug（读代码发现，非本次改动）

1. `.skel` 输出 `Joints{` 少了 `=`（`exportMesh.cpp:879`）→ 严格来说不是合法的表赋值。
2. `pdeExportAnimation` 用未赋值的空 `MDagPath partPath`（`exportAnimation.cpp:387-394`）→ 理论上 `FindJoints` 拿不到骨骼。
3. `Process()` 里 `jointMap` 查重后无条件再次 `AddJoint`（`exportMesh.cpp:507-524`）→ 骨骼重复添加、父子层级丢失。
4. `pdeExport.mel` / `pdeEditor.mel` 引用了根本没注册的 `pdeExport` / `pdeEditor` 命令（死 UI）。
5. `pdeExportScene.mel:186/191` 硬编码 `D:/shanda/trunk/source/deploy/sbin/nvcompress.exe`。

> 推论：原版 Maya 链路上，`Materials` 的 `IsInVisible/CollisionMode/CullingMode/...` 以及 VS/PS 名字**都不是 C++ 导出的**，应由下游 MEL/工具链补齐。这一点对 Blender 版很关键（见 §3.3）。

### 1.6 MEL 与目录约定

- 真正生效的场景导出： `scripts/pdeExportScene.mel` → `<pdeExportRootPath>/Scene/<场景名>/<mesh名>.txt`。
- 角色/武器/动画的目录约定在 **`td/mayaScript/`**（调用同一批 C++ 命令），批量主控是 `pdeExportMain.mel:inv_exportDecide`。
- `cache_*.lua` / `gen_*.lua` **不在 `tc/editor`**，在 `td/builder/data/`，说明见 `td/builder/readme.md:371-424`。

---

## 2. `tc/client` — 客户端与 KBuild 编译管线

### 2.1 KBuild 模式

`tc/build_modes.md` 是完整的模式说明书（6 种模式）。KBuild 的关键：

```cpp
// main.cpp:472-475
#elif defined(KBUILD)
    MountPath("/", "data", Path::kVirtualReadWrite, 0);   // data 目录读写挂载
```
```cpp
// main.cpp:611-630   -dependence / -exec 解析（#ifndef MASTER 内）
// main.cpp:697-698   LuaState::DoFile(exec_cmd) → rungame = false
```
预处理宏 `NDEBUG;KBuild`，输出 `kbuild.exe`（`client.vcproj:443-490`）。
**退出靠 Lua 脚本主动 `game:Exit()`**（→ `Thread::Quit()` → `main.cpp:709` 主循环退出），脚本不调 Exit 进程会空转。

⚠ **坑**：`main.cpp:674-678` 的 `#ifdef MASTER` / `#else` 两个分支**都**执行 `SetUseDependence(false)`，命令行 `-dependence` 被覆盖 → 依赖检查实质关闭 → **改了源 `.mesh` 后旧 cache 不会自动失效**，必须手删 `.cache` 或 bump `GetVersion()`。

### 2.2 Resource / .cache 格式

`Resource.cpp:5-19` 的编译期开关：`AUTO_SAVE/SAVE_CACHE/USE_CACHE` 在 `#ifndef MASTER` 下为 1 → KBuild 能写 cache。

`.cache` 文件布局（`Resource.cpp:436-459` 写 / `:1054-1092` 读）：

```
uint32  type        资源类型
uint16  pack_ver    = 2
uint16  res_ver     = GetVersion()      ← 版本不符直接丢弃
uint32  dep_count   依赖表（当前恒为 0，见上）
  repeat: { string path, int32 lowTime, int32 highTime }
uint32  data_size
uint32  crc32       MakeCrc32(payload, MakeStringCrc32(res->path, "crc_key"))
uint32  compressed
bytes   payload     LZ 压缩后的子类 SaveData 输出
```
cache 路径 = 资源 VFS key + `.cache`（`GetCachePath`，`:309-314`），落在 `data/` 目录内源文件旁。

暴露给 Lua 的方法（`Resource.cpp:164-182`，PDE 反射注册，非 `lua_register`）：
`Resource.Get / Load / LoadByType / Build / BuildByType / CopyFile / CompileScript / GC / Reload / Unload ...`
（`Resource.Save` 在 `:167` 被注释掉，落盘只能靠 `AUTO_SAVE`。）

`Build()`（`:543-560`）语义：**先探 cache，已有有效 cache 就跳过**；否则 `BuildData()` → `AUTO_SAVE` 落盘。

### 2.3 MeshResource：Lua → 二进制

`LoadRawData()`（`MeshResource.cpp:757-1338`）读取的字段与关键处理：

| 处理 | 位置 |
|---|---|
| 顶点 ×0.01 | `:399, 1036` |
| UV V 翻转 | `:1087/1121/1133` |
| `BlendIndices` −1 → 0-based | `:1149` |
| 顶点焊接（vertex+normal+uv0+uv1+color 组合去重）+ `quick_sort` | `:935-1025` |
| 静态/蒙皮判定：`blendindex.Size()>0` → kSkin | `:1141-1144` |
| Bone AABB（权重 > 0.25 的骨骼扩张） | `:1154-1167` |
| Primitive 分段：`primitives[FaceMaterials+1]`，`primitives[0]` 是兜底组 | `:1178-1216, 1230` |
| `local_aabb` 只在 `visible && CollisionMode==1` 累加 | `:1244-1261` |
| `IsInVisible` 语义反转（为 1 → 不可见） | `:1238` |

材质表字段（`:1217-1318`）：`IsInVisible`、`CollisionMode`、`BlendLayer`、`AlphaBlendMode`、`CullingMode`、`PhysicsMaterial`，**其余任意键**交给 `Material::Load`（`Material.cpp:461-598`）按 shader 的 sampler/uniform 名动态匹配：
- `vertex_shader_lod_N` / `pixel_shader_lod_N`（`:467-496`）
- 贴图（ColorMap/LightMap/DrMap/SrMap/NormalMap/UVMap…，名字来自 `.fx`）：**路径 = mesh 目录 + 值**（`:538-546`），失败回退 `common/white_texture.tga`
- 数值 uniform

最终二进制（`SaveData` `:192-293`）：`mesh_type` →（skin: bone 名表 + bone AABB / static: local_aabb）→ primitive 数组（三角形数、顶点数、layer、cull、blend、visible、vb、ib、material、collision_mode）→ physical_material 列表。

**顶点流（`render/VertexDeclaration.h:16-38`）**

```
StreamStatic 52B: Vec3 pos(12) + half4 normal(8) + half4 tangent(8) + half4 binormal(8)
                  + half2 uv0(4) + half2 uv1(4) + half2 uv2(4) + ARGB color(4)
StreamSkin   64B: Vec3 pos(12) + half4 n(8) + half4 t(8) + half4 b(8)
                  + BYTE[4] blendindices(4) + Vec4 blendweight(16) + half2 uv0(4) + half2 uv1(4)
索引：恒 U32（D3DFMT_INDEX32）
```

### 2.4 Skeleton / Animation

- `Skeleton::BuildData`（`Animation.cpp:110-225`）：读 `Joints[i]` 九元组，`parent_id = [2] + 1`，`position = [3..5] / 100`，`rotation = [6..9]` 原样。**不共轭、不归一化。**
- `AnimationTrack::Load`（`:1214-1329`）：按 `Node` 名查表合并 translate / rotateQuaternion，合成每帧 7 float `[tx,ty,tz, qx,qy,qz,qw]`；translate `/100`。
- 帧率：`GetFrameRate() { return 96.f; }`（`:1346-1349`），`时长 = (FrameCount-1)/96`。
- 输出二进制：skel = joint 名表 + Transform(28B) 数组；anim = 每骨骼 `{name, frame_count, data_size, float[frame_count*7]}`。

### 2.5 PhysX

`PhysxResource::BuildData`（`Level.cpp:3322-3526`）**复用 `.mesh` 明文**：
- 顶点 `/100`；碰撞分组取自 `Materials[FaceMaterials[i]].CollisionMode`（1..6，缺失默认 **1**）；
- 三角形属性 UV 取 **UVSets[1]**（第二套 = lightmap），并写 `1-v`；
- `NxCookTriangleMesh` 烘焙后整个字节流进 cache。

> 注意 `CollisionMode` 在两处默认值不同：`MeshResource.cpp:1242` 缺失→0，`Level.cpp:3209` nil→1。

### 2.6 编译驱动脚本形态

```lua
-- cache_xxx.lua（资源清单）
resource = { "/mesh/prop/goldcoin/goldcoin.mesh", "/mesh/prop/goldcoin/goldcoin_d.dds" }
physx    = { }
copy     = { }

-- gen_xxx.lua（驱动）：class.import 拿类型 → loadin 读清单 →
-- coroutine.wrap + Task.Schedule 每帧 Resource.Build/BuildByType/CopyFile → 完成 game:Exit()
```

---

## 3. `pdestudio` — Blender 扩展现状

### 3.1 结构

```
src/
├── core/        属性组(PDEStudio_SceneProperties)、偏好、注册、回调
├── exporter/    mesh.py(主流程) mesh_data.py mesh_merge.py mesh_materials.py
│                material_fallbacks.py mesh_lua_builder.py skel.py anim.py
│                export_utils.py gen_script_template.py __init__.py(LuaSerializer)
├── importer/    binary/ characters/ scenes/ weapons/ manual/ core/（导入 + 批量索引）
├── ui/          panels / export_ / mesh_ / skel_ / anim_ / primitive_ 操作符
└── blender_manifest.toml   (id=pde_studio, v0.1.0, Blender >= 5.1.2)
docs/           12 篇：format_reference / engine_verification / diff_pde_maya_blender
                / physx_collision / bugs_and_fixes / export_analysis / TODO / binary/*
```

导出路径统一到 `<vfs_root 的兄弟>/pexport/`：`mesh/scene|character/firstPerson|thirdPerson|prop/…`、`skeleton/…`、`animation/…`，与 `td/mayaScript` 规范一致。

### 3.2 已对齐（文档 `docs/TODO.md` / `export_analysis.md` 标记 ✅）

坐标系 Z-up→Y-up（`(x,y,z)→(x,z,-y)`，四元数 `R⁻¹qR`）、skel/anim ×100 还原厘米、BlendIndices 1-based、UV 不翻转、面绕序 CCW、**保留原始多边形面不预三角化**、切线按面顶点不去重、贴图相对路径含扩展名、`wrap=10` 排版、导出顺序按 `pde_prim_index`、四元数相邻帧连续性、`cache_/gen_` 脚本生成。

### 3.3 相对 Maya **多出**的字段（属于改进，不是偏差）

`vertex_shader_lod_N` / `pixel_shader_lod_N`、`IsInVisible` / `CollisionMode` / `PhysicsMaterial` / `BlendLayer` / `AlphaBlendMode` / `CullingMode` —— 这些引擎都要读，但 Maya 的 `pdeCgfxShader` 分支不写。Blender 版通过 `mat["pde_material"]` + `obj["pde_primitive"]` 自定义属性实现了**导入→导出完整往返**，这是相对原版的增强。

### 3.4 现存问题（按严重度）

| # | 问题 | 位置 | 后果 |
|---|---|---|---|
| **1** | **`BlendCounts` 按 face-vertex(loop) 展开，引擎按 vertex 索引** | `mesh_data.py:325-331` vs `Mesh.cpp:802-809` + `MeshResource.cpp:1139` | 蒙皮权重错位（不崩溃但结果错），**最高优先级** |
| **2** | 所有 UVSets 共用 `uv_layers[0]` 算出的 Tangents/Binormals | `mesh_lua_builder.py:93-101` vs `exportMesh.cpp:443-444` | 第 2/3 套 UV 的切线错（lightmap/normalmap 相关） |
| **3** | UVSets 按索引合并、名字硬编码 `map1/2/3` | `mesh_merge.py:204-222`, `mesh_lua_builder.py:76` vs `exportMesh.cpp:392-411` | 丢失 `map1=lightmap / map2=color` 这类语义（道具约定） |
| **4** | `.anim` 采样步长依赖 `scene.render.fps`，但 `frame_set(int(round(t)))` | `anim.py:122-133` | 场景非 96fps 时每帧被重复采样，`FrameCount` 放大（24fps → ×4，动画时长变 4 倍） |
| **5** | 多对象合并骨骼偏移只判「列表完全相同」 | `mesh_merge.py:126-137` | 骨骼列表部分重叠时索引算错 |
| **6** | 材质跨对象不去重（按对象材质槽累加） | 对比 `exportMesh.cpp:348-362` | 同一材质在 Materials 表里重复出现，Primitive 数膨胀 |
| **7** | 贴图引用两条路径不一致：`pde_material` 保留扩展名 + 相对路径，fallback 分支 `splitext` 去扩展名 | `mesh_materials.py:215-233` vs `material_fallbacks.py:134` | 走 fallback 时贴图可能加载失败回退白色 |
| **8** | 浮点二次精度损失（先 `round(x,6)` 再 `%.6g`） | `mesh_data.py:81/167/...` + `__init__.py:48-56` | `|v|<5e-7` 被写成 0 |
| **9** | 不继承 `ExportHelper`，`filename_ext` 无效 | `ui/export_operators.py:35,43` | 手动输入无后缀文件名时，磁盘文件与 `cache_.lua` 里的名字不一致 |
| **10** | 死开关/死参数：`export_gen_build_script`、`uv_count` | `properties.py:140`, `mesh_data.py:42` | UI 改了没效果 |
| **11** | `.anim` 导出时 `cache_*.lua` 首项恒为 `{mesh_name}.mesh` | `exporter/__init__.py:212-218` | 只导动画会生成指向不存在 mesh 的清单 |

### 3.5 TODO 中的未验证项（`docs/TODO.md:56-86`）

- 导出后引擎加载的法线/顶点色是否与原始一致（需在引擎中验证）
- 多对象合并后 BlendIndices 是否指向正确骨骼（需角色模型验证）
- 切线/副法线在法线贴图模型上方向是否正确
- `FaceMaterials` ↔ `Materials` 的 shading group 对应关系（跳过 None 材质时的 `mat_index_map`）
- 骨骼 rest matrix 退化路径（无 `pde_rest_matrices` 时用 `bone.matrix_local`）
- 场景纹理 DDS 转换、批量导出（暂不实现）

---

## 4. 结论与建议优先级

### 4.1 整体判断

- **链路是通的**：格式、单位、索引基准、切线规则、面拓扑这些"致命项"都已对齐并有引擎源码验证记录（`docs/engine_verification.md`、`export_analysis.md` §12）。
- **Blender 版在材质保真上已经超过原版**（补了 VS/PS 名和 Primitive 属性，实现了往返）。
- **剩余核心风险集中在两处**：#1 蒙皮 `BlendCounts` 的 vertex/loop 语义错位（只要有角色带蒙皮导出就会踩），#4 动画采样步长（只要场景 fps 不是 96 就会踩）。这两项建议在真正批量产出角色资源前必须修掉。

### 4.2 建议顺序

1. 修 `BlendCounts` 按顶点展开（`mesh_data.py`），用带蒙皮的角色模型做一次导入→导出→kbuild→引擎加载的闭环验证。
2. 修 `.anim` 采样：直接在 96fps 时间轴上按帧采样，或导出前强制 `scene.render.fps = 96`。
3. Tangent/Binormal 按 UVSet 分别计算；UVSets 名字改为保留原名。
4. 多对象合并：骨骼按名字建全局映射表（而非"列表相同才共享"），材质按名字去重。
5. 清理死开关、接上 `ExportHelper`、统一贴图引用格式。
6. 最后补批量导出与 DDS 转换（P3）。

### 4.3 验证手段备忘

```bat
kbuild.exe -exec gen_xxx.lua -dependence 0
```
- 编译后检查 `data/.../*.cache` 是否生成、大小是否合理；
- 用 KRelease 模式（`krelease.exe`，读写本地 data + `DEBUG_SHADER`）实际加载查看；
- 改源 `.mesh` 后**必须手删 `.cache`**（`-dependence` 被 `main.cpp:674-678` 强制关掉了）；
- 若改了任何二进制布局，必须同步 bump `MeshResource.cpp:188` 的版本号（当前 8），否则旧 cache 会被静默丢弃。
