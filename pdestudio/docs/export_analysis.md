# PDE 导出功能综合分析报告

> 本文档是原版 Maya 导出插件与 Blender pdestudio 导出器的完整对比分析。
>
> 最后更新：2026-09-02

---

## 目录

1. [原版 Maya 导出体系总览](#1-原版-maya-导出体系总览)
2. [导出路径规范](#2-导出路径规范)
3. [客户端加载层验证](#3-客户端加载层验证)
4. [Blender 版导出现状](#4-blender-版导出现状)
5. [已修复的关键差异](#5-已修复的关键差异)
6. [仍存在的差距与完善建议](#6-仍存在的差距与完善建议)
7. [文本格式 vs 二进制格式差异](#7-文本格式-vs-二进制格式差异)
8. [犯错经验教训](#8-犯错经验教训)
9. [材质数据保真方案](#9-材质数据保真方案)
10. [面拓扑与 PhysX 碰撞](#10-面拓扑与-physx-碰撞)
11. [参考源码位置](#11-参考源码位置)

---

## 1. 原版 Maya 导出体系总览

原版 Maya 插件 (`tc/editor/`) 由三层组成：

### 1.1 C++ 导出命令层 (`tc/editor/export/`)

| 命令 | 源码 | 功能 |
|------|------|------|
| `pdeExportMesh` | `exportMap.cpp` → `exportMesh.cpp` | 导出网格（材质+骨骼名+顶点/法线/UV/切线/蒙皮权重/面） |
| `pdeExportSkeleton` | `exportSkeleton.cpp` → `exportMesh.cpp:SaveJoints` | 仅导出骨骼层级（名称、父ID、位置、四元数） |
| `pdeExportAnimation` | `exportAnimation.cpp` | 逐帧采样关节的 `rotateQuaternion` 和 `translate` |

公共基础设施在 `exportor.cpp/h` 中：参数解析（`-allnode`/`-node`/`-file`）、进度窗口、数组写入。

### 1.2 MEL 脚本层

存在 **两套** MEL 脚本：

**新版** (`tc/editor/scripts/`) — 菜单 `pdeMenu.mel` 调用：
- `pdeExportScene.mel` — 场景导出（材质检查 + 纹理 DDS 转换 + mesh 导出）
- `pdeExportMesh/Animation/Skeleton` — 直接调用 C++ 命令

**完整版** (`td/mayaScript/`) — `pdeExportMain.mel` 是**批量导出主控**，UI 提供 3 组单选按钮：

```
[Character | Prop | Scene | CharAndProp(FP) | CharAndProp(TP)]  ← 目标类型
[Mesh | Skeleton | Animation]                                    ← 资源类型
[FirstPerson | ThirdPerson]                                      ← 视角
```

`inv_exportDecide()` 根据组合分派到 11 种导出流程。

### 1.3 命令分派逻辑 (`td/mayaScript/pdeExportMain.mel:inv_exportDecide`)

| 组合 | 调用 |
|------|------|
| Character + Skeleton | `inv_charSkeletonExport()` → 批量打开 `*_rig.mb` |
| Character + Mesh + FirstPerson | `inv_charFPMeshExport()` → 批量打开 `*_skin.mb` |
| Character + Mesh + ThirdPerson | `inv_charTPMeshExport()` → 批量打开 `*_skin.mb` |
| Character + Animation + FirstPerson | `inv_characterAnimationFirstPersonExport()` → 批量打开 `*_FP_*_an.mb` |
| Character + Animation + ThirdPerson | `inv_characterAnimationThirdPersonExport()` → 批量打开 `*_TP_*_an.mb` |
| Prop + Mesh | `inv_propMeshExport()` → 批量打开 `*_skin.mb` |
| Prop + Skeleton | `inv_propSkeletonExport()` → 批量打开 `*_rig.mb` |
| Prop + Animation + FirstPerson | `inv_propAnimationFirstPersonExport()` |
| Prop + Animation + ThirdPerson | `inv_propAnimationThirdPersonExport()` |
| Scene | `inv_sceneMeshExport()` → 批量打开 `*_Final.mb` |
| CharAndProp (FP) | `inv_charAndPropFirstPersonExport()` |
| CharAndProp (TP) | `inv_charAndPropThirdPersonExport()` |

---

## 2. 导出路径规范

| 类型 | 路径模板 | 示例 |
|------|---------|------|
| 场景 mesh | `mesh/scene/<meshName>/<meshName>.mesh` | `mesh/scene/desert/desert.mesh` |
| FP mesh | `mesh/character/firstPerson/<char>/<gender>/<gender>.mesh` | `mesh/character/firstPerson/maleA/male/male.mesh` |
| TP mesh | `mesh/character/thirdPerson/<char>/<gender>/<part>/<part>.mesh` | `mesh/character/thirdPerson/maleA/male/hat/hat.mesh` |
| 道具 mesh | `mesh/prop/<propName>/<partName>.mesh` | `mesh/prop/MK18/stock.mesh` |
| 角色骨骼 | `skeleton/character/<char>.skel` | `skeleton/character/malea.skel` |
| 道具骨骼 | `skeleton/prop/<prop>.skel` | `skeleton/prop/mk18.skel` |
| FP 角色动画 | `animation/character/firstPerson/<char>/<weapon>/<animName>.anim` | `animation/character/firstPerson/maleA/MK18/shoot.anim` |
| TP 角色动画 | `animation/character/thirdPerson/<char>/<weapon>/<animName>.anim` | `animation/character/thirdPerson/maleA/MK18/stdshoot.anim` |
| FP 道具动画 | `animation/prop/firstperson/<weapon>/<animName>.anim` | `animation/prop/firstperson/MK18/reload.anim` |
| TP 道具动画 | `animation/prop/thirdperson/<weapon>/<animName>.anim` | `animation/prop/thirdperson/MK18/idle.anim` |

**命名规范**：Maya 文件名用 `_` 分割，如 `maleA_DesertEagle_FP_change_an.mb` → `[charName, weapon, FP/TP, animName]`。性别通过文件名匹配 `"woman"` → female，否则 male。

**角色骨骼选择**：选中名为 `root` 的骨骼节点导出。

**道具骨骼选择**：选中名为 `prop` 的节点，取其第一个子节点导出。

---

## 3. 客户端加载层验证

### 3.1 Mesh 加载 (`MeshResource::LoadRawData`)

```cpp
// MeshResource.cpp:399 — kbuild 编译时调用
if (data->LoadRawData(GetKey(), 0.01f))  // scale = 0.01!

// MeshResource.cpp:1036 — 加载器内部
points[i] *= scale;  // 所有顶点 × 0.01（厘米→米）

// MeshResource.cpp:1149 — BlendIndices 1-based → 0-based
data.blendindices.PushBack(blendindex[j] - 1);

// MeshResource.cpp:1085 — UV V 翻转（文本格式 OpenGL→DirectX）
data.uv0.PushBack(Vector2(uv.x, 1.f - uv.y));

// MeshResource.cpp:1093 — 切线按面顶点序号直接索引（忽略 FaceVertexTangentIndices）
data.tangents.PushBack(tangents[v.id]);
```

### 3.2 Skeleton 加载 (`Skeleton::BuildData`)

```cpp
// Animation.cpp:165 — parent_id 0-based → 1-based
joint.parent_id = L->ToInteger(-1) + 1;

// Animation.cpp:170-180 — 位置 / 100（厘米→米）
transform.position.x = L->ToNumber(-1) / 100;
```

### 3.3 Animation 加载 (`AnimationTrack::Load`)

```cpp
// Animation.cpp:1277-1278
static Core::Identifier translate("translate");
static Core::Identifier rotateQuaternion("rotateQuaternion");

// translate → 写入 [tx, ty, tz]（每帧3个float）
// rotateQuaternion → 写入 [qx, qy, qz, qw]（每帧4个float）
// 最终每骨骼每帧 7 个 float [tx,ty,tz,qx,qy,qz,qw]
```

### 3.4 客户端消费端验证要点汇总

| 属性 | 要求 | 当前实现 |
|------|------|---------|
| 位置单位 | 文本格式=厘米，引擎 `/100` 转米 | ✅ `export_scale=100` |
| BlendIndices | 文本=1-based，引擎 `-1` 转 0-based | ✅ `idx + 1` |
| 骨骼 parent_id | 文本=0-based(-1=根)，引擎 `+1` 转 1-based | ✅ 0-based |
| UV V 方向 | 文本=OpenGL(V=0底部)，引擎内部 `1-y` | ✅ 不翻转 |
| 面绕序 | 文本=CCW，引擎三角化 | ✅ CCW |
| 四元数顺序 | (x, y, z, w) | ✅ |
| 动画帧率 | 96fps | ✅ |
| Track 顺序 | rotateQuaternion 先于 translate | ✅ |
| 坐标系 | PDE=Y-up 右手系 | ✅ Z-up→Y-up 转换 |

### 3.5 角色资源消费 (`CharacterInfo.h`)

```cpp
struct CharacterInfo {
    MeshSet mesh_set_third_person[MESH_LOD_LEVEL];  // 3级LOD
    MeshSet mesh_set_first_person[MESH_LOD_LEVEL];
    Core::Identifier first_person_skeleton;
    Core::Identifier third_person_skeleton;
    Core::Identifier first_person_animationset;
    Core::Identifier third_person_animationset;
    // ...
};
```

- `FirstPerson::LoadSkeleton()` → `RESOURCE_LOAD(character_info->first_person_skeleton, ...)`
- `ThirdPerson::LoadSkeleton()` → `RESOURCE_LOAD(character_info->third_person_skeleton, ...)`
- `FirstPerson::InitializeMesh()` → 遍历 `mesh_set_first_person[i]`，每个调用 `mesh->AddPrimitive()`
- `ThirdPerson::InitializeMesh()` → 遍历 `mesh_set_third_person[i]`

---

## 4. Blender 版导出现状

### 4.1 已实现功能

| 功能 | 文件 | 状态 |
|------|------|------|
| Mesh 导出 | `exporter/mesh.py` + `mesh_data.py` + `mesh_materials.py` + `mesh_merge.py` | ✅ |
| Skel 导出 | `exporter/skel.py` | ✅ |
| Anim 导出 | `exporter/anim.py` | ✅ |
| 场景 Mesh UI | `ui_mesh_operators.py: PDE_OT_ExportSceneMesh` | ✅ |
| FP Mesh UI | `ui_mesh_operators.py: PDE_OT_ExportFPMesh` | ✅ |
| TP Mesh UI | `ui_mesh_operators.py: PDE_OT_ExportTPMesh` | ✅ |
| 道具 Mesh UI | `ui_mesh_operators.py: PDE_OT_ExportPropMesh` | ✅ |
| Skel/Anim UI | `ui.py: PDE_OT_ExportSkel/ExportAnim` | ✅ |
| 多对象合并导出 | `mesh_merge.py` | ✅ |
| 编译脚本生成 | `export_utils.py: generate_build_scripts` | ✅ |

### 4.2 文件结构

```
pdestudio/src/exporter/
├── __init__.py            # Lua序列化器 + 工具函数 + 编译脚本生成
├── export_utils.py        # 坐标转换 + rest matrices + 路径推导
├── mesh.py                # Mesh 导出主入口 + 多对象收集
├── mesh_data.py           # 网格数据提取（坐标/UV/法线/切线/蒙皮）
├── mesh_materials.py      # 材质提取（自定义属性优先）
├── mesh_merge.py          # 多对象数据合并
├── mesh_lua_builder.py    # Mesh Lua 表构建
├── material_fallbacks.py  # 材质回退映射
├── skel.py                # Skeleton 导出
├── anim.py                # Animation 导出
├── gen_script_template.py # gen_xxx.lua 模板
└── gen_script_template.py # gen_xxx.lua 模板
```

> 文档已统一移至 `pdestudio/docs/` 目录。
```

---

## 5. 已修复的关键差异

### 5.1 坐标系

| 项目 | Maya / PDE | Blender |
|------|-----------|---------|
| 朝上轴 | Y-up | Z-up |
| 手性 | 右手系 | 右手系 |
| 导出时转换 | 无需转换（Maya 与 PDE 同坐标系） | **必须逆向转换** |

**导出时转换公式**（Blender Z-up → PDE Y-up，绕 X 轴 -90°）：
```
位置: (x, y, z) → (x, z, -y)
四元数: q_pde = R⁻¹ @ q_blender @ R
矩阵: M_pde = R⁻¹ @ M_blender @ R
其中 R = Quaternion((cos45°, sin45°, 0, 0))
```

**状态**：✅ 已修复（`export_utils.py: convert_position_to_pde / convert_quaternion_to_pde`）

### 5.2 骨骼 Rest Matrix

**问题**：Blender 的 `bone.matrix_local` **不等于** PDE rest matrix。导入时已将 PDE rest world matrices 存储在 `armature["pde_rest_matrices"]`。

**正确做法**：导出时使用存储的 `pde_rest_matrices`，退化时用 `bone.matrix_local`。

**状态**：✅ 已修复（`skel.py: _extract_skeleton_data` + `export_utils.py: get_pde_rest_world_matrices`）

### 5.3 动画导出公式

**问题**：导入时使用了逆向公式 `pose_world = anim_world @ rest_world⁻¹ @ bone.matrix_local`，导出时需要逆向推导。

**正确做法**：
```
anim_world = pose_world @ bone.matrix_local⁻¹ @ rest_world_pde
anim_local = parent_anim_world⁻¹ @ anim_world
```

**状态**：✅ 已修复（`anim.py: _sample_animation`）

### 5.4 UV 坐标

**问题**：PDE **文本格式**使用 OpenGL V（V=0 底部，同 Maya/Blender），PDE 加载器内部已做 `1 - y` 转换。导出不应再做 V flip。

**状态**：✅ 已修复（`mesh_data.py: _collect_uvs` — 不翻转 V）

### 5.5 蒙皮权重

| 项目 | Maya 导出器 | pdestudio | 引擎加载 |
|------|-----------|-----------|---------|
| BlendIndices | 1-based (`+1`) | 1-based (`+1`) | `-1` 转 0-based |
| 最大权重数 | 4 | 4 | 4 |
| 权重阈值 | 0.001 | 0.001 | — |
| 归一化 | 是 | 是 | — |

**状态**：✅ 已修复（`mesh_data.py: _extract_skin_data`）

### 5.6 四元数连续性

**问题**：`w >= 0` 归一化会导致 180° 翻转时四元数跳变。

**正确做法**（相邻帧点积检查）：
```python
prev_q = prev_quats.get(bone_name)
if prev_q is not None and quat.dot(prev_q) < 0.0:
    quat = -quat
prev_quats[bone_name] = quat.normalized()
```

**状态**：✅ 已修复（`anim.py: _sample_animation`）

### 5.7 其他已修复项

| 问题 | 状态 |
|------|------|
| Track 顺序 (rotate先于translate) | ✅ |
| 导出路径 pexport | ✅ |
| 面绕序 CCW（同 Maya） | ✅ |
| 位置 ×100（米→厘米） | ✅ |
| 切线不去重（按面顶点顺序） | ✅ |
| 文件序列化 wrap=10（对齐 Maya） | ✅ |
| 贴图路径用相对路径含扩展名 | ✅ |
| 导出顺序按 primitive 顺序 | ✅ |
| 保留原始多边形面（不预三角化） | ✅ |

---

## 6. 仍存在的差距与完善建议

> 最后更新: 2026-08-26 — 所有 P0/P1/P2 项均已完成或验证，仅剩 P3 非核心项

### 已完成项 (原 P0/P1/P2)

#### 6.1 角色骨骼导出 UI ✅

`PDE_OT_ExportCharacterSkel` / `PDE_OT_ExportPropSkel` 已实现（`ui_skel_operators.py`），UI 面板已增加角色/道具骨骼按钮。

#### 6.2 动画导出路径分派 UI ✅

4 种动画路径已实现（`ui_anim_operators.py`）：FP/TP 角色动画 + FP/TP 道具动画，UI 面板已增加角色名/武器名/动画名输入框。

#### 6.3 导出路径前缀统一 ✅

`export_utils.py` 中 `build_skel_export_path` / `build_anim_export_path` 已实现，对齐原版路径规范。

#### 6.4 多对象蒙皮骨骼索引偏移 ✅

`mesh_merge.py` 已修正 BlendIndices 偏移。

#### 6.5 材质导出完善 ✅

`mat["pde_material"]` 自定义属性完整存储 vertex/pixel shader、uniform、贴图数据。导入→导出往返不丢失材质参数。`mesh_materials.py` 优先从 `pde_material` 读取，退化时从节点回退。

### 引擎源码验证项 (2026-08-26)

以下结论基于 `tc/client/` 源码直接验证：

| 验证项 | 引擎源码 | 结论 |
|--------|---------|------|
| 四元数共轭 | `Animation.cpp:183-201, 1299-1309` — 直接读取, 无转换 | **不需要**共轭 |
| 顶点坐标空间 | `MeshResource.cpp:1036` — 仅 `×0.01` 缩放 | 局部空间正确 |
| BlendIndices 1-based | `MeshResource.cpp:1149` — `blendindex[j] - 1` | ✅ 正确 |
| UV V坐标 | `MeshResource.cpp:1087` — `1.f - map[i].y` | ✅ 不翻转正确 |
| 骨骼parent_id | `Animation.cpp:165` — `+1` | ✅ 0-based正确 |
| 切线索引 | `MeshResource.cpp:1095` — `tangents[v.id]` | ✅ 不去重正确 |

### P3 级 — 暂不实现

#### 6.6 场景纹理 DDS 转换

原版 Maya 场景导出包含 `pdeExportSceneTexture()` 调用 `nvcompress.exe` 将 TGA→DDS。Blender 版未实现，标记为暂不实现。

#### 6.7 批量导出

原版支持扫描目录下 `*_rig.mb` / `*_skin.mb` / `*_an.mb` 批量打开→导出。Blender 版每次只能导出当前场景，标记为暂不实现。

---

## 7. 文本格式 vs 二进制格式差异

> **核心教训：导入和导出面对的格式不同，不能简单对称。**

| 属性 | 文本格式 (.mesh) | 二进制格式 (.mesh.cache) |
|------|-----------------|------------------------|
| UV V 坐标 | OpenGL (V=0 底部) | DirectX (V=0 顶部) |
| 面绕序 | CCW (同 Maya) | CCW |
| 切线索引 | 按 v.id 顺序（忽略 FaceVertexTangentIndices） | 按 FaceVertexTangentIndices |
| 单位 | 厘米（加载器 ×0.01 转米） | 米（运行时直接使用） |
| 面拓扑 | 保留原始多边形（可含四边面+三角化信息） | 全三角形 |
| 加载器 | `MeshResource::LoadRawData` | `MeshResource::LoadData` |

**关键**：导入面对二进制（米/DirectX V/CCW），导出面对文本（厘米/OpenGL V/CCW）。

---

## 8. 犯错经验教训

> 核心教训：**不要凭猜测写导出逻辑，每一步都要对照 PDE 引擎源码验证。**

### 8.1 只导出了第一个对象（多 Primitive 场景）

**根因**：选中父 Empty 时 `context.selected_objects` 只包含 Empty 本身，不包含子物体。

**修复**：选中 Empty 时递归收集所有 Mesh 子物体。新建 `mesh_merge.py` 处理合并逻辑。

**教训**：导入拆开的东西，导出时必须能合回来。

### 8.2 位置缩放反复修改（文本格式用厘米，不是米）

**根因**：PDE 有两种格式，单位不同。文本格式期望**厘米坐标**（`LoadRawData(path, 0.01f)`），二进制格式用**米**。

**修复**：导出 `scale=100.0`（Blender 米 → 文本厘米）。

**教训**：导入和导出面对的格式不同，单位也可能不同！

### 8.3 UV V 坐标双重翻转

**根因**：PDE **文本格式**使用 OpenGL V（V=0 底部），PDE 加载器内部已做 `1 - y` 转换。导出再翻转 → 双重翻转。

**修复**：导出时不翻转 V，直接写 Blender 的 UV 值。

**教训**：必须看加载器代码确认，不能想当然。

### 8.4 面绕序反复修改

**根因**：最初错误假设 PDE 二进制格式用 CW，在导入时反转了绕序。实际 PDE 二进制和文本格式都用 CCW（通过原版 mesh 数据验证确认）。

**修复**：导入时不反转绕序，直接使用原始索引顺序。

### 8.5 切线数组去重导致越界崩溃（最严重）

**根因**：PDE 加载器用面顶点序号 `v.id` 直接索引 tangents 数组，去重导致数组大小 << 面顶点总数，`v.id` 越界 → 崩溃。

**修复**：切线按面顶点顺序写入，不去重，索引连续 `0, 1, 2, ...`。

**教训**：不能优化引擎不让你优化的东西。必须追踪每个数组在引擎中**如何被使用**。

### 8.6 文件过大导致 kbuild 无法加载

**根因**：序列化器每个数字占一行，21 个对象合并后文件达 85.8MB / 413 万行。Maya 格式只有约 8MB。

**修复**：简单数组每行写 10 个值（`wrap=10`），对齐 Maya 导出器。

### 8.7 贴图路径错误导致全部回退白色纹理

**根因**：引擎用 **mesh 目录 + 贴图名** 拼接路径查找贴图。写了纯文件名（无路径无扩展名）→ 找不到 → 回退白色。原版写的是**相对路径**（`../materials/xxx.dds`，含扩展名）。

**修复**：新增 `derive_mesh_vfs_dir()` 推导 mesh VFS 目录，用 `os.path.relpath` 转为相对路径。

### 8.8 导出顺序不匹配原版

**根因**：导出时按名称字母排序，但引擎可能有隐含依赖。

**修复**：导入时存储 `pde_prim_index`，导出时按此排序。

**教训**：导出顺序必须与导入顺序一致。

### 8.9 kbuild 编译后贴图黑色（已解决）

**状态**：已解决 ✅

---

## 9. 材质数据保真方案

### 9.1 问题背景

pdestudio 工作流：游戏二进制资源 (.mesh.cache) → 解码 → 导入 Blender → 编辑 → 导出 PDE 文本 .mesh → kbuild 编译。

没有原始 Maya 工程文件，导入→导出必须保持数据完整。

### 9.2 PDE 材质数据结构

**二进制格式**：
```
Material:
  vertex_shaders:    List[str]           // 按LOD
  pixel_shaders:     List[str]           // 按LOD
  vertex_uniform:    List[List[Uniform]] // 按LOD
  pixel_uniform:     List[List[Uniform]]
  texture_uniform:   List[List[TexUni]]  // 按LOD
```

**文本格式**（扁平 key=value）：
```lua
{
    vertex_shader_lod_0 = "lc_main",
    pixel_shader_lod_0 = "transparency_character_normal_lod_0",
    ColorMap = "goldcoin_d",            -- 贴图名
    NormalMap = "goldcoin_n",
    SomeFloatParam = 1.5,               -- 数值 uniform
    SomeVecParam = {1.0, 2.0, 3.0},
    IsInVisible = false,                -- Primitive级属性
    CollisionMode = 1,
    BlendLayer = 0,
    AlphaBlendMode = 0,
    CullingMode = 1,
    PhysicsMaterial = 0,
}
```

### 9.3 导入时数据丢失

| 数据 | 存储了？ | 问题 |
|------|---------|------|
| vertex_shaders | ✅ | — |
| pixel_shaders | ✅ | — |
| vertex_uniform | ❌ | **完全丢失** |
| pixel_uniform | ❌ | **完全丢失** |
| texture_uniform | ⚠️ 部分 | 只存 LOD0，VFS 路径丢失 |
| Primitive 属性 | ❌ | layer/cull_mode/blend_mode/visible/collision_mode 全部丢失 |

### 9.4 方案：自定义属性完整存储

**Material 自定义属性 `mat["pde_material"]`**：
```python
{
    "vertex_shaders": ["lc_main", "lc_main_lod1"],
    "pixel_shaders": ["transparency_character_normal_lod_0"],
    "vertex_uniform": [[{"type_name": "SomeParam", "values": [1.5]}], []],
    "pixel_uniform": [[{"type_name": "Color", "values": [1.0, 0.5, 0.0, 1.0]}], []],
    "texture_uniform": [[
        {"type_name": "ColorMap", "path": "/mesh/prop/goldcoin/goldcoin_d.dds"},
        {"type_name": "NormalMap", "path": "/mesh/prop/goldcoin/goldcoin_n.dds"},
    ], []],
}
```

**Object 自定义属性 `obj["pde_primitive"]`**：
```python
{"layer": 0, "cull_mode": 1, "blend_mode": 0, "visible": True, "collision_mode": 1, "physics_material": 0}
```

### 9.5 导出流程

1. 从 `mat["pde_material"]` 读取完整材质数据
2. `vertex_shaders[i]` → `vertex_shader_lod_{i} = "name"`
3. `pixel_shaders[i]` → `pixel_shader_lod_{i} = "name"`
4. 合并 `vertex_uniform` + `pixel_uniform` 所有 LOD，输出 `key = value`
5. `texture_uniform` 从 VFS 路径提取文件名（去掉路径和后缀）→ `ColorMap = "texture_name"`
6. 从 `obj["pde_primitive"]` 读取 Primitive 级属性
7. 贴图节点仅用于 Blender 视觉预览，导出以自定义属性为准

### 9.6 向后兼容

- 旧版导入只有 `pde_vertex_shaders` / `pde_pixel_shaders`，无 `pde_material`
- 导出器检测到无 `pde_material` 时，退化为从节点 label + 旧属性读取

---

## 10. 面拓扑与 PhysX 碰撞

### 10.1 核心发现

**原版 Maya 导出器保留原始多边形面**（可含四边面），三角化信息通过 `FaceTriangleCount` 和 `FaceTriangles` 单独提供。

**PDE Studio 旧版导出器全部预三角化**，每个三角形是独立 Face，导致边数暴增 50%。

### 10.2 影响分析

| 场景规模 | Maya格式(保留四边面) | PDE Studio(全三角化) | 多出 |
|---------|-------------------|--------------------|----|
| 92963面 | ~185,926条边 | 278,889条边 | 50% |

边数过多导致 `Mesh::Create` 的 `quick_sort` 不稳定，PhysX 碰撞烹饪失效，角色掉下地面。

### 10.3 修复方案

导出时遍历 `mesh.polygons`（保留原始多边形），不遍历 `mesh.loop_triangles`（预三角化）：

```python
for poly in mesh.polygons:
    verts = list(poly.vertices)
    cnt = len(verts)
    face_vertex_count.append(cnt)
    # fan triangulation: [0,1,2, 0,2,3, ...]
    tri_count = cnt - 2
    face_triangle_count.append(tri_count)
    for i in range(tri_count):
        face_triangles.extend([0, i + 1, i + 2])
```

### 10.4 导入时三角面→四边面转换（已移除）

该功能已取消。导出时遍历 `mesh.polygons`（保留原始多边形），不预三角化，已足够减少边数。

### 10.5 涉及文件

| 文件 | 说明 |
|------|------|
| `tc/editor/export/exportMesh.cpp` (657-716) | Maya 面数据提取 |
| `tc/client/system/Mesh.cpp` (92-160) | 引擎边构建与排序 |
| `tc/client/render/MeshResource.cpp` (757) | 文本 mesh 加载 |
| `tc/client/game/Level.cpp` (3322) | PhysX 碰撞构建 |
| `pdestudio/src/exporter/mesh_data.py` | 导出面数据提取 |

---

## 11. 参考源码位置

### 11.1 Maya 导出器

| 功能 | 源码位置 |
|------|---------|
| Maya Mesh 导出 | `tc/editor/export/exportMesh.cpp` |
| Maya 骨骼导出 | `tc/editor/export/exportSkeleton.cpp` + `exportMesh.cpp:SaveJoints` |
| Maya 动画导出 | `tc/editor/export/exportAnimation.cpp` |
| Maya 公共工具 | `tc/editor/export/exportor.cpp/h` |
| Maya 材质导出 | `tc/editor/export/exportMesh.cpp:ExportPdeCgfxShader` |
| Maya 场景导出 | `tc/editor/scripts/pdeExportScene.mel` |
| Maya 批量导出主控 | `td/mayaScript/pdeExportMain.mel` |
| Maya Mesh 导出脚本 | `td/mayaScript/pdeExportMesh.mel` |
| Maya 骨骼导出脚本 | `td/mayaScript/pdeExportSkeleton.mel` |
| Maya 动画导出脚本 | `td/mayaScript/pdeExportAnimation.mel` |

### 11.2 客户端引擎

| 功能 | 源码位置 |
|------|---------|
| PDE Mesh 加载 | `tc/client/render/MeshResource.cpp:LoadRawData` (757-1327) |
| PDE 骨骼加载 | `tc/client/game/Animation.cpp:Skeleton::BuildData` (110-200) |
| PDE 动画加载 | `tc/client/game/Animation.cpp:AnimationTrack::Load` (1235-1320) |
| PDE 顶点声明 | `tc/client/render/VertexDeclaration.h` |
| PDE 材质 | `tc/client/render/Material.cpp` |
| PDE Mesh 创建 | `tc/client/system/Mesh.cpp:Mesh::Create` (92-160) |
| PDE SkinCluster | `tc/client/system/Mesh.cpp:Mesh::CreateSkinCluster` (783) |
| PDE PhysX 构建 | `tc/client/game/Level.cpp:PhysxResource::BuildData` (3322) |
| PDE 角色资源 | `tc/client/game/CharacterInfo.h` |
| PDE 第一人称 | `tc/client/game/character/FirstPerson.cpp` |
| PDE 第三人称 | `tc/client/game/character/ThirdPerson.cpp` |

### 11.3 pdestudio 导出器

| 功能 | 源码位置 |
|------|---------|
| 导出器公共工具 | `pdestudio/src/exporter/__init__.py` |
| 坐标转换 + rest matrices | `pdestudio/src/exporter/export_utils.py` |
| Mesh 导出主入口 | `pdestudio/src/exporter/mesh.py` |
| Mesh 数据提取 | `pdestudio/src/exporter/mesh_data.py` |
| 材质提取 | `pdestudio/src/exporter/mesh_materials.py` |
| 多对象合并 | `pdestudio/src/exporter/mesh_merge.py` |
| Skeleton 导出 | `pdestudio/src/exporter/skel.py` |
| Animation 导出 | `pdestudio/src/exporter/anim.py` |
| 编译脚本模板 | `pdestudio/src/exporter/gen_script_template.py` |
| Mesh 导出 UI 操作符 | `pdestudio/src/ui_mesh_operators.py` |
| Skel/Anim 导出 UI | `pdestudio/src/ui.py` |
| 导出 UI 面板 | `pdestudio/src/ui_panels.py` |
| 属性定义 | `pdestudio/src/core/properties.py` |

### 11.4 pdestudio 导入器（导出依赖）

| 功能 | 源码位置 |
|------|---------|
| 坐标系转换 | `pdestudio/src/importer/coordinate.py` |
| 骨骼导入 | `pdestudio/src/importer/import_skel.py` |
| 动画导入 | `pdestudio/src/importer/import_anim.py` |
| Mesh 导入 | `pdestudio/src/importer/import_mesh.py` |
| 二进制 Mesh 解析 | `pdestudio/src/importer/binary_mesh.py` |
| 二进制骨骼解析 | `pdestudio/src/importer/binary_skel.py` |
| 二进制动画解析 | `pdestudio/src/importer/binary_anim.py` |

---

## 12. 修复优先级总览

| 优先级 | 问题 | 影响 | 涉及文件 | 状态 |
|--------|------|------|---------|------|
| P0 | 坐标系逆向转换 | 模型侧躺、位置错误 | export_utils.py, mesh_data.py, skel.py, anim.py | ✅ 已修复 |
| P0 | 骨骼导出使用 pde_rest_matrices | 骨骼 rest pose 错误 | export_utils.py, skel.py | ✅ 已修复 |
| P0 | 动画导出逆向公式 | 动画完全错误 | anim.py | ✅ 已修复 |
| P0 | 切线不去重（按面顶点顺序） | kbuild 崩溃 | mesh_data.py | ✅ 已修复 |
| P0 | 保留原始多边形面 | PhysX 碰撞失效 | mesh_data.py | ✅ 已修复 |
| P1 | UV V flip | 贴图上下颠倒 | mesh_data.py | ✅ 已修复 |
| P1 | BlendIndices 1-based | 蒙皮索引错误 | mesh_data.py | ✅ 已修复 |
| P1 | 权重阈值 0.001 | 微小权重干扰 | mesh_data.py | ✅ 已修复 |
| P1 | 面绕序 CCW | 面法线反向 | mesh_data.py | ✅ 已修复 |
| P1 | 文件序列化 wrap=10 | kbuild 无法加载 | __init__.py | ✅ 已修复 |
| P1 | 贴图相对路径含扩展名 | 全部回退白色纹理 | mesh_materials.py | ✅ 已修复 |
| P1 | 导出顺序按 primitive | 贴图黑色 | mesh.py | ✅ 已修复 |
| P2 | 四元数连续性（相邻帧点积） | 动画插值抖动 | anim.py | ✅ 已修复 |
| P2 | Track 顺序 (rotate先于translate) | 匹配 Maya | anim.py | ✅ 已修复 |
| P2 | 导出路径 pexport | 避免覆盖原始资源 | export_utils.py, ui.py | ✅ 已修复 |
| P3 | 材质导出完善 | 材质显示不完整 | mesh_materials.py | ✅ 已实现 (pde_material 往返) |
| P3 | 角色骨骼导出 UI | 路径不规范 | ui_mesh_operators.py | ✅ 已实现 |
| P3 | 动画导出路径分派 UI | 路径不规范 | ui.py, ui_panels.py | ✅ 已实现 |
| P3 | 场景纹理 DDS 转换 | 纹理未转换 | 新文件 | 暂不实现 |
| P3 | 多对象蒙皮骨骼索引偏移 | 蒙皮索引错误 | mesh_merge.py | ✅ 已修复 |
| P3 | 批量导出 | 功能限制 | 新文件 | 暂不实现 |
| P3 | kbuild 编译后贴图黑色 | 贴图显示异常 | 待排查 | ✅ 已解决 |

### 引擎源码验证 (2026-08-26)

基于 `tc/client/` 源码验证的关键结论：

| 验证项 | 引擎源码 | 结论 |
|--------|---------|------|
| 四元数共轭 | `Animation.cpp:183-201, 1299-1309` — 直接读取, 无转换 | 不需要共轭 |
| 顶点坐标空间 | `MeshResource.cpp:1036` — 仅 `×0.01` 缩放 | 局部空间正确 |
| BlendIndices 1-based | `MeshResource.cpp:1149` — `blendindex[j] - 1` | ✅ |
| UV V坐标 | `MeshResource.cpp:1087` — `1.f - map[i].y` | ✅ |
| 骨骼parent_id | `Animation.cpp:165` — `+1` | ✅ |
| 切线索引 | `MeshResource.cpp:1095` — `tangents[v.id]` | ✅ |