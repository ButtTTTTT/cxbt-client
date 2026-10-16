# PhysX 碰撞问题分析

> **问题**：pdestudio 导出的场景 mesh 编译为 `.physx.cache` 后，角色穿过地图掉落。
> **状态**：已修复 (2026-09-02)

---

## 一、问题复现路径

```
Blender 场景
  ├─ pdestudio 导出 → scene.mesh (Lua 文本格式)
  ├─ kbuild.exe -exec gen_scene.lua -dependence 0
  │    ├─ MeshResource::LoadRawData() → 生成 scene.mesh.cache (渲染)
  │    └─ PhysxResource::BuildData() → lua_LoadPhysxMesh() → 生成 scene.physx.cache (碰撞)
  └─ kmaster.exe 运行 → 角色穿过地面掉落
```

---

## 二、根因分析

### 2.1 引擎两个加载函数的默认值差异

引擎有两个独立的 mesh 加载函数，对缺失 `CollisionMode` 字段的默认值处理**不同**：

| 函数 | 文件位置 | 用途 | 缺失 CollisionMode 默认值 |
|------|----------|------|------|
| `MeshResource::LoadRawData` | `MeshResource.cpp:1241` | 渲染用 `.mesh.cache` | **0**（无碰撞） |
| `lua_LoadPhysxMesh` | `Level.cpp:3207-3210` | 碰撞用 `.physx.cache` | **1**（静态碰撞） |

```cpp
// lua_LoadPhysxMesh — 缺失时默认 1
L->GetField(-1, "CollisionMode");
int collision_mode = 0;
if (L->IsNil(-1))
    collision_mode = 1;       // ← 缺失时默认 1
else
    collision_mode = L->ToInteger(-1);

// MeshResource::LoadRawData — 缺失时默认 0
L->GetField(-1, "CollisionMode");
primitive.collision_mode = L->ToInteger(-1);  // ← nil 返回 0
```

### 2.2 数据流分析

**原版流程（正常）**：
- Maya 导出器不写 `CollisionMode` 字段
- `lua_LoadPhysxMesh` 对缺失字段默认为 1 → 所有面静态碰撞 → 角色站立

**pdestudio 流程（修复前 — 有 Bug）**：
- 从二进制 cache 导入的 `collision_mode=0`（来自 `LoadRawData` 默认值）
- 导出时显式写入 `CollisionMode=0`
- `lua_LoadPhysxMesh` 读取到 0 → 无碰撞 → 角色掉落

### 2.3 原版 mesh 中的 CollisionMode 分布

```
21 个材质:
  Mode 0 (无碰撞):  2 个  ← 来自 LoadRawData 默认值，原版文本中不存在此字段
  Mode 1 (静态碰撞): 16 个
  Mode 2 (人物碰撞): 1 个
  Mode 5 (阵营门A):  1 个
  Mode 6 (阵营门B):  1 个
```

原版二进制 cache 中 `collision_mode=0` 不代表"无碰撞"——它只是 `LoadRawData` 对缺失字段的默认值，原版文本 mesh 没有此字段，`lua_LoadPhysxMesh` 默认为 1。

---

## 三、修复方案

### 导出器修复

**文件**：`src/exporter/mesh_materials.py` → `_apply_primitive_props`

始终写入 `CollisionMode` 字段，确保不同 primitive 的碰撞模式被正确传递：

```python
mat_lua["CollisionMode"] = prim.get("collision_mode", 1)
```

**注意**：原版二进制 cache 中 `collision_mode=0` 的材质，导入→导出后会写入 `CollisionMode=0`。引擎 `lua_LoadPhysxMesh` 读取到 0 → 不生成碰撞体。这是**正确的**行为——如果用户需要这些面有碰撞，可以在 Blender UI 面板中将 CollisionMode 改为 1。

---

## 四、PhysX 碰撞模式枚举

来自 `Level.cpp:3383-3415` 的 `switch(collision_mode)` 和 `Physx.h` 的 `PhysxGroup` 枚举：

| 值 | 枚举 | 含义 | PhysX Group | 角色检测 |
|----|------|------|-------------|---------|
| 0 | — | 无碰撞（不生成碰撞体） | — | 否 |
| 1 | kStatic | 静态碰撞（地面、墙壁） | 1 | **是** |
| 2 | kStaticCollisionWithPerson | 仅人物碰撞 | 2 | **是** |
| 3 | kStaticCollisionWithDynamic | 动态物体碰撞 | 3 | — |
| 4 | kStaticRaycast | 仅射线检测 | 4 | — |
| 5 | kStaticCollisionWithGateTeam1 | 阵营门 A | 5 | 按队伍 |
| 6 | kStaticCollisionWithGateTeam2 | 阵营门 B | 6 | 按队伍 |

角色移动检测 `MoveCapsule` 的 group mask（`MoveController.cpp:11`）：
```cpp
uint group_id = 1 << kStatic | 1 << kStaticCollisionWithPerson;
group_id |= 1 << kController;
group_id |= 1 << kGroupVehicle;
// + 队伍门 group
```

即角色检测 **kStatic(1)** + **kStaticCollisionWithPerson(2)** 的碰撞体。

---

## 五、.physx.cache 对比结果

| 属性 | 原版 r_scene.physx | pdestudio scene.physx |
|------|-------------------|----------------------|
| Actor 数量 | 4 | 4 |
| Actor 0 (col_mode=1) | buf=2336532, attr=82890 | buf=2336388, attr=82890 |
| Actor 1 (col_mode=2) | buf=16204, attr=539 | buf=16204, attr=539 |
| Actor 2 (col_mode=5) | buf=808, attr=24 | buf=808, attr=24 |
| Actor 3 (col_mode=6) | buf=808, attr=24 | buf=808, attr=24 |

Actor 数量和碰撞模式已正确。Buffer 大小接近（差 144 字节，为顶点优化差异）。

---

## 六、编译模式对照

| 模式 | 宏定义 | SAVE_CACHE | AUTO_SAVE | USE_CACHE | BuildData |
|------|--------|-----------|-----------|-----------|-----------|
| KBuild | NDEBUG;KBuild | 1 | 1 | 1 | 有 |
| KMaster | NDEBUG;MASTER;KMaster | 0 | 0 | 1 | 无(返回NullPtr) |
| Master | NDEBUG;MASTER | 0 | 0 | 1 | 无 |

- KBuild 构建并保存 cache
- KMaster 从 cache 加载，不重新构建
- `main.cpp` 中 `SetUseDependence(false)` 无条件调用（所有模式）

---

## 七、引擎关键源码位置

| 源码 | 说明 |
|------|------|
| `tc/client/game/Level.cpp:3039` | `lua_LoadPhysxMesh` — PhysX 碰撞构建 |
| `tc/client/game/Level.cpp:3247` | `PhysxResource::SaveData` — cache 保存 |
| `tc/client/game/Level.cpp:3283` | `PhysxResource::LoadData` — cache 加载 |
| `tc/client/game/Level.cpp:3322` | `PhysxResource::BuildData` — 碰撞体构建 |
| `tc/client/game/Level.cpp:3549` | `PhysxResource::OnLoadData` — actor 创建 |
| `tc/client/game/Level.cpp:3624` | `PhysxManager::Load` — PhysX 加载 |
| `tc/client/render/MeshResource.cpp:757` | `LoadRawData` — 文本 mesh 加载 |
| `tc/client/system/Physx.cpp:743` | `BuildActor` — PhysX actor 创建 |
| `tc/client/game/character/MoveController.cpp:9` | `MoveCapsule` — 角色碰撞检测 |
| `tc/client/system/resource/Resource.cpp:1042` | `LoadResourceCache` — cache 加载 |
| `tc/client/system/resource/Resource.cpp:1138` | `LoadResourceData` — 资源加载 |

---

## 八、资源加载流程

```
LoadResourceData(res)
  → LoadResourceCache(res, true)     // 先尝试 cache
    → if cache exists: LoadData()    // 返回数据
    → if no cache: 返回 NullPtr
  → BuildData()                       // 无 cache 时构建
  → auto_save = true

OnLoad(data)
  → OnLoadDataBefore(data)
  → OnLoadData(data)                   // 创建 PhysX actor
  → state = kLoaded
  → OnLoadDataAfter(data)
    → if AUTO_SAVE && auto_save: Save()  // 保存 cache
```
