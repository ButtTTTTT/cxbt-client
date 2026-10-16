# 引擎源码验证记录

> 所有结论均基于 `tc/client/` 源码直接验证。
> 最后更新：2026-09-02

---

## 一、已验证结论汇总

| 验证项 | 引擎源码位置 | 引擎行为 | pdestudio 做法 | 结论 |
|--------|-------------|---------|---------------|------|
| 四元数 | `Animation.cpp:183-201, 1299-1309` | 直接读取，无共轭 | 不共轭 | ✅ 正确 |
| BlendIndices | `MeshResource.cpp:1149` | `blendindex[j] - 1` | `idx + 1` (1-based) | ✅ 正确 |
| UV V坐标 | `MeshResource.cpp:1087` | `1.f - map[i].y` | 不翻转 | ✅ 正确 |
| 骨骼 parent_id | `Animation.cpp:165` | `L->ToInteger(-1) + 1` | 0-based | ✅ 正确 |
| 切线索引 | `MeshResource.cpp:1095` | `tangents[v.id]`（按面顶点序号） | 不去重，按顺序 | ✅ 正确 |
| 位置单位 | `MeshResource.cpp:1036` | `points[i] *= 0.01f` (cm→m) | ×100 (m→cm) | ✅ 正确 |
| 顶点空间 | `MeshResource.cpp:1036` | 仅缩放，无空间变换 | 局部空间 | ✅ 正确 |
| 面绕序 | 二进制 mesh 数据验证 | CCW（与 Maya/Blender 一致） | CCW，不反转 | ✅ 正确 |
| 骨骼 dummy root | `Animation.cpp:143-148` | 自动添加 index 0 | 不添加 | ✅ 正确 |

---

## 二、面绕序验证详情 (2026-09-02)

### 验证方法

解析原版 `r_scene.mesh`（二进制格式，21 个 primitive），对每个 primitive 的第一个三角形：
1. 按 CCW 方向计算法线（叉积 e1 × e2）
2. 读取顶点存储的 half-float 法线
3. 比较两者方向（归一化后点积）

### 结果

| Primitive | CCW 法线 vs 存储法线 点积 | 结论 |
|-----------|--------------------------|------|
| 0 | 0.9999 | MATCH |
| 1 | 1.0000 | MATCH |
| 2 | 0.9999 | MATCH |
| 3 | 1.0000 | MATCH |
| 4 | 0.9986 | MATCH |
| 5 | 0.9324 | MATCH |
| 6 | 0.9917 | MATCH |
| 7 | 0.9848 | MATCH |
| 8 | 1.0000 | MATCH |
| 9 | 1.0000 | MATCH |
| 10 | 1.0000 | MATCH |
| 11 | 1.0000 | MATCH |
| 12 | 1.0000 | MATCH |
| 13 | 1.0000 | MATCH |
| 14 | 1.0001 | MATCH |
| 15 | 0.9586 | MATCH |
| 16 | 1.0000 | MATCH |
| 17 | 1.0000 | MATCH |
| 18 | 1.0000 | MATCH |
| 19 | 0.0000 | (退化面，存储法线为零) |
| 20 | 1.0000 | MATCH |

**结论**：20/21 个 primitive 的 CCW 法线与存储法线方向一致。PDE 二进制 mesh 使用 CCW 面绕序。

### 历史错误

导入器之前错误假设 PDE 使用 CW 并反转了绕序 `(i+2, i+1, i)`。导致：
1. 导入时面法线翻转
2. 导出时输出翻转后的 CW 绕序
3. 引擎使用 `D3DCULL_CW`（剔除 CW 面）→ 正面被剔除，只显示背面

已修复：`import_mesh.py` 不再反转绕序。

---

## 三、四元数约定验证详情 (2026-08-26)

### PDE 引擎四元数约定

PDE 使用 D3DX 四元数，**但约定与标准 Hamilton 一致**：

- `D3DXQuaternionMultiply(out, a, b)` = `b ⊗ a`（标准 Hamilton 积）
  - **注意**: C++ 语法 `a * b` 在 PDE 中等价于标准 Hamilton 的 `b ⊗ a`
- `TransformCoord(v, q)` = `q⁻¹ ⊗ v ⊗ q`（标准逆向旋转）
- FK 链: `model_rot = parent_rot ⊗ local_rot`（与 Blender 一致）

### 关键澄清

引擎 `TransformCoord(v, q) = q⁻¹⊗v⊗q` 仅用于**位置**变换，不用于**旋转**合成。
旋转合成使用标准 Hamilton 积，与 Blender/Maya 约定相同。
因此四元数直接使用，无需共轭。

### Maya 导出器验证

`maya_cast(MQuaternion)` = 直接拷贝 `(x, y, z, w)`，无转换。
Maya 导出器 `exportMesh.cpp` 中旋转 = `rotateAxis * rotate * orient`，使用 PDE operator*（即标准 Hamilton 积）。

---

## 四、坐标缩放逻辑

### Mesh 顶点

- **导出器** (`mesh.py`): `export_scale=1.0`，导出坐标为**厘米**单位（如 -32075.30）
- **引擎 `lua_LoadPhysxMesh`** (Level.cpp:3357): 顶点读入后**无条件 `/100** → 变为米
- **引擎 `MeshResource::LoadRawData`** (MeshResource.cpp:399): 传入 `scale=0.01f`

### PhysX actor 坐标

- PhysX cooking 使用 `/100` 后的顶点坐标（米单位）
- PhysX actor worldBounds 和游戏逻辑坐标系一致（米单位）
- 角色 spawn 坐标范围: -50 到 50（米）
- PhysX actor worldBounds: -280 到 280（米）— 整个地图碰撞范围
