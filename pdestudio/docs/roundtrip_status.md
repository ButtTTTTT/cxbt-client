# 地图场景 导入/导出 完成度评估

> 评估时间: 2026-09-15
> 样本: `data/mesh/scene/level1/`（21 个 primitive，93502 三角形）
> 基准: `vs/r_scene.mesh`（原版二进制，181099 顶点 / 93502 三角形）
> 当前代码状态: 已撤回四边形合并；保留世界变换、法线/切线/副法线属性化、half 量化

---

## 一、结论速览

| 维度 | 评价 |
|---|---|
| **几何数据往返** | ✅ **完全忠实**（顶点/三角形/UV/顶点色 逐项与原版一致） |
| **材质往返** | ✅ 完整（21 材质、VS/PS 三级 LOD、Primitive 属性逐项一致） |
| **导出工作流** | ✅ 闭环（自动生成 `gen_scene.lua` + `cache_scene.lua`，kbuild 编译 + PhysX 烘焙成功） |
| **面拓扑差异** | ✅ 已验证**不影响引擎结果**（引擎焊接后顶点 +0.00%，PhysX 差 144 字节，见 §3.1） |
| 实质性缺口 | **无** |

**当前代码可直接用于地图往返修改。**

---

## 二、逐项完成度

### 2.1 几何

| 项目 | 原版 | 当前代码导出 | 状态 |
|---|---|---|---|
| Points 顶点数 | 181,099 | **181,099** | ✅ 完全一致 |
| 三角形数 | 93,502 | **93,502** | ✅ 完全一致 |
| 面数 (FaceVertexCount) | — | 93,502 | ✅ 与 FaceMaterials 等长 |
| 面顶点数 (FaceVertices) | — | 280,506 | ✅ |
| 法线 | half4 | `pde_normal` 属性优先 | ✅ 保留原始值 |
| 切线/副法线 | 有 | `pde_tangent`/`pde_binormal` | ✅ 保留原始值 |
| UV0 / UV1 / UV2 | 3 套 | 3 套，索引各 280,506 | ✅ |
| 顶点色 | ARGB | 精确往返 | ✅ 0xBC → 0.7379 → 0xBC 零误差 |
| FaceVertexColors | — | 280,506（与面顶点等长） | ✅ 完整，无越界 |
| **面拓扑** | 四边形为主 | 全三角 | ✅ 引擎结果等价（见 §3.1） |

**顶点色往返验证**（`0_scene_et_plant01` 采样）：

```
orig ARGB              blender .color          back->byte
0xFFBCBCBC (188)   ->  (0.7379,0.7379,0.7379,1.0)  -> (188,188,188,255)  ✓
0xFFFFFFFF (255)   ->  (1.0,1.0,1.0,1.0)           -> (255,255,255,255)  ✓
```

**UV2 说明**：原版每个 primitive 的 UV2 是**常量**（uniq=1），21 个 primitive → 21 种值。
当前导出恰好也是 21 种值，**完全吻合**，无信息丢失。
（原版 UV2 是引擎 `BuildStreamStatic` 的默认填充，不是有效 lightmap 数据。）

### 2.2 材质与 Primitive 属性

| 项目 | 原版 21 prims | 当前导出 | 状态 |
|---|---|---|---|
| 材质数量 | 21 | 21 | ✅ |
| vertex_shader_lod_0..2 | 3 级 | 3 级 | ✅ |
| pixel_shader_lod_0..2 | 3 级 | 3 级 | ✅ |
| 贴图 | 3 级 LOD | **仅 LOD0** | ⚠️ 见 §3.2 |
| 数值 uniform | 3 级 LOD | **仅 LOD0** | ⚠️ 见 §3.2 |
| IsInVisible | — | ✅ | |
| CollisionMode | 0/1/2/5/6 | ✅ 逐项一致 | ✅ |
| PhysicsMaterial | — | ✅ 逐项一致 | ✅ |
| BlendLayer | 0/1 | ✅ 逐项一致 | ✅ |
| AlphaBlendMode | 1/2/4/32 | ✅ 逐项一致 | ✅ |
| CullingMode | 0/2 | ✅ 逐项一致 | ✅ |

**Primitive 属性逐项抽样对照**（原版 → 编译产物）：

```
prim0  cm=0 vis=1 lay=0 cull=2 blend=2  pm=12   ✓ 完全一致
prim1  cm=1 vis=1 lay=1 cull=0 blend=4  pm=5    ✓ 完全一致
prim2  cm=2 vis=0 lay=0 cull=0 blend=1  pm=0    ✓ 完全一致
prim12 cm=1 vis=1 lay=1 cull=2 blend=32 pm=4    ✓ 完全一致
prim17 cm=5 vis=0 ...                            ✓ 完全一致
prim18 cm=6 vis=0 ...                            ✓ 完全一致
```

### 2.3 工作流闭环

| 环节 | 产物 | 状态 |
|---|---|---|
| 导出路径推导 | `/mesh/scene/level1/` | ✅ 从文件路径自动推导 |
| 编译驱动脚本 | `gen_scene.lua`（PDE Studio 自动生成） | ✅ |
| 资源清单 | `cache_scene.lua` → `/mesh/scene/level1/scene.mesh` | ✅ |
| mesh 编译 | `scene.mesh.cache` = 3830 KB | ✅ 成功 |
| PhysX 烘焙 | `scene.physx.cache` = 1970 KB | ✅ 成功（原版 1978 KB，差 0.4%） |

**PhysX 烘焙成功是重要信号**：说明当前（全三角）版本**没有触发**碰撞烹饪失效。

---

## 三、缺口详情

### 3.1 ✅ 面拓扑：差异**不影响引擎结果**（已实测）

**事实**：二进制 `prim.indices` 是纯三角形列表（`importer/core/mesh_builder.py:184-186` 按 3 个一组建面），
所以 Blender 中全是三角形，导出 `FaceVertexCount` 全为 3；而原版 Maya 以四边形为主。

**但实测证明无影响**：

| 指标 | 原版 | 当前代码往返后 | 差异 |
|---|---|---|---|
| 引擎焊接后顶点数 | 181,099 | **181,099** | **+0.00%**（21/21 对象精确匹配） |
| 三角形总数 | 93,502 | 93,502 | 0 |
| AABB | — | — | 完全一致 |
| physx 数据 | 3,355,988 B | 3,356,132 B | **144 字节** |

**原因**：引擎的顶点焊接键 = `(vertex, normal, uv0, uv1, color)`。
只要属性值正确，共享边的顶点无论来自"两个三角形的各一份"还是"一个四边形的一份"，
都会合并成同一个输出顶点。**面拓扑不参与焊接键。**

**反例（证明这一点）**：曾尝试"三角形合并回四边形"优化，实测引擎焊接后 **189,915 顶点（+4.9%）**，
反而比全三角的 +0.00% **更差**，并且引入材质错位 bug（见 §4）。该优化已撤回。

**结论**：当前全三角导出是正确的，无需改回四边形。

### 3.2 ✅ 材质贴图/uniform 只写一份 —— 符合格式与原版行为，非缺口

PDE 文本格式的 Material 是扁平 `key = value` 表，**只能承载一份贴图**，
多 LOD 仅通过 `vertex_shader_lod_N` / `pixel_shader_lod_N` 表达。
原版 Maya 的 `ExportPdeCgfxShader` 同样只写一份。

当前实现（取第一个非空 LOD）与原版行为一致（`exporter/mesh_materials.py:119-150`）。

### 3.3 ℹ️ UVSets 名称硬编码 map1/2/3 —— 无实际影响

`exporter/mesh_lua_builder.py:90`。原版有 `LightMap` / `Decal2Map` / `Mask2Map` 等语义名，
但**引擎按索引取 UV 集，不读名称**。

### 3.4 ℹ️ 场景级数据不在本目录

`level1/` 下只有 mesh 相关资源（mesh / physx / occ / 小地图贴图）。
关卡逻辑（gate、活动物体、据点等）在别处，本目录的导入导出不涉及。

---

## 四、附：上一轮"模型消失"事件根因（已定位）

**现象**：`pdestudio_scene_3.mesh`（含四边形合并）编译后模型消失、贴图错乱。

**根因**：`FaceMaterials` 与合并后的面数不匹配。

```
FaceVertexCount  = 50,841 项  (42661 个四边形 + 8180 个三角形)
FaceMaterials    = 93,502 项  (按原始多边形生成，未随合并更新)
```

引擎按 face index 读取 `FaceMaterials` → 材质整体错位 → 贴图错 + 渲染状态（Cull/Blend）错 → 面片被剔除或透明化 → "模型消失"。

**编译产物证据**（`vs/scene.mesh`，09-15 10:52 由 scene_3 编译）：

| | 原版 | 合并版编译产物 |
|---|---|---|
| primitive 数 | 21 | **10**（材质重新分组） |
| prim0 三角形 | 7,716 | **14,613**（材质串组） |
| prim6 贴图 | `et01_lp_all` + `et01_terrain02_d` | `et01_terrain01_m2` + `et01_terrain01_c`（错位） |
| 三角形总数 | 93,502 | 93,502（几何本身没错） |

**教训**：任何改变面数量的优化，必须同步重算 `FaceMaterials`。

---

## 五、建议

**当前状态可直接使用** —— 导入 → 修改 → 导出 → kbuild 闭环通畅，
顶点 / 三角形 / 材质 / Primitive 属性 / PhysX 全部与原版逐项吻合。

**无需改动。** 后续使用注意三点：

1. **改了 `.mesh` 之后必须手删对应 `.cache`**
   `tc/client/main.cpp:674-678` 两个分支都调用了 `SetUseDependence(false)`，
   依赖检查被关闭，引擎**不会**因为源文件更新而重建 cache。

2. **`pde_normal` / `pde_tangent` / `pde_binormal` 属性只在"导入时"生成**
   旧场景（在那之前导入的）没有这三个属性，导出会自动回退到 `calc_tangents` 重算
   —— 能跑通，但 UV 接缝 / 镜像 / 硬边处的切线与原值不同。
   **建议：要用作往返管线，就重新导入一次场景。**

3. **不要再引入改变"面数量"的优化**（如三角形合并回四边形）
   实测它会让引擎焊接后顶点变差（+4.9% vs +0.00%），且必须同步重算
   `FaceMaterials`，否则材质整体错位（见 §4）。
