# 已解决 Bug 记录

> 最后更新：2026-09-02
> 所有已知 bug 均已修复并通过引擎源码验证。

---

## 1. 面绕序反转导致正面被剔除 (2026-09-02) ✅

**现象**：导出的场景 mesh 渲染时，所有面向玩家的面不显示，只看到背面的面。地面显示灰色。

**根因**：导入器 `import_mesh.py` 错误假设 PDE 二进制 mesh 使用 CW 面绕序，在导入时反转了绕序 `(i+2, i+1, i)`。实际 PDE 使用 CCW（通过原版 mesh 数据验证确认）。反转后导出的面变成 CW，被引擎 `D3DCULL_CW` 剔除正面。

**修复**：`import_mesh.py` 不再反转绕序，直接使用原始索引顺序 `(i, i+1, i+2)`。

**验证方法**：原版二进制 mesh 20/21 个 primitive 的 CCW 计算法线与存储的 half-float 法线方向一致。

---

## 2. CollisionMode 导致 PhysX 角色掉落 (2026-09-02) ✅

**现象**：导出的场景 mesh 编译为 `.physx.cache` 后，角色穿过地图掉落。

**根因**：导出器从二进制 mesh 导入的 `collision_mode=0`（来自 `LoadRawData` 对缺失字段的默认值），导出时显式写入 `CollisionMode=0`。引擎 `lua_LoadPhysxMesh` 读取到 0 → 不生成碰撞体。

而原版文本 mesh 不写 `CollisionMode` 字段，`lua_LoadPhysxMesh` 对缺失字段默认为 1（静态碰撞）。

**修复**：始终写入 `CollisionMode` 字段，确保不同 primitive 的碰撞模式被正确传递。

**详见**：[physx_collision.md](./physx_collision.md)

---

## 3. FaceMaterials 数量不匹配导致编译崩溃 ✅

**现象**：`.mesh` 编译为 `.mesh.cache` 时报 `can not allocate memory size = -1994912608`

**根因**：三角化后 `FaceVertexCount` 有 12 项（每三角形 1 项），但 `FaceMaterials` 只有 6 项（按原始 polygon 生成）。引擎 `CreateShadingGroup` 遍历 `NumFaces()` 读取 `face_slot[i]`，越界读到垃圾值导致内存分配计算为负数。

**修复**：`FaceMaterials` 按原始 polygon 映射，不预三角化。

---

## 4. Tangent/Binormal 去重与 loop 映射共用同一字典 ✅

**现象**：Tangent/Binormal 索引错误

**根因**：用同一字典同时做去重（`(tx,ty,tz)→index`）和 loop 映射（`loop_idx→index`），两种 key 类型冲突导致映射错乱。

**修复**：分开两个字典：`tangent_map_bin`（tuple→index，去重用）和 `loop_to_tangent`（loop_idx→index，映射用）。

---

## 5. 法线使用了顶点平滑法线而非面角法线 ✅

**现象**：编译后模型面向视角时白色亮光，侧面背面渐变黑色（光照异常）

**根因**：`mesh.has_custom_normals` 为 `False` 时用了 `v.normal`（顶点平滑法线）。PDE 引擎需要 per-face-corner 法线。

**修复**：始终使用 `loop.normal`（Blender per-face-corner 法线）。

---

## 6. 切线数组去重导致越界崩溃 ✅

**现象**：kbuild 编译时崩溃

**根因**：PDE 加载器用面顶点序号 `v.id` 直接索引 tangents 数组，去重导致数组大小 << 面顶点总数，`v.id` 越界。

**修复**：切线按面顶点顺序写入，不去重，索引连续 `0, 1, 2, ...`。

---

## 7. UV V 坐标双重翻转 ✅

**现象**：贴图上下颠倒

**根因**：PDE **文本格式**使用 OpenGL V（V=0 底部），PDE 加载器内部已做 `1 - y` 转换。导出再翻转 → 双重翻转。

**修复**：导出时不翻转 V。

---

## 8. 位置缩放单位错误 ✅

**现象**：模型在引擎中过大或过小

**根因**：PDE 有两种格式，单位不同。文本格式期望**厘米坐标**（`LoadRawData(path, 0.01f)`），二进制格式用**米**。导出时用了错误的单位。

**修复**：导出 `scale=1.0`（Blender 米 → 文本厘米，由引擎 `/100` 转回米）。

---

## 9. 文件过大导致 kbuild 无法加载 ✅

**现象**：21 个对象合并后文件达 85.8MB / 413 万行，kbuild 无法加载。

**根因**：序列化器每个数字占一行。Maya 格式只有约 8MB。

**修复**：简单数组每行写 10 个值（`wrap=10`），对齐 Maya 导出器。

---

## 10. 贴图路径错误导致白色纹理 ✅

**现象**：编译后贴图全白

**根因**：引擎用 mesh 目录 + 贴图名拼接路径查找贴图。写了纯文件名（无路径无扩展名）→ 找不到 → 回退白色。

**修复**：用 `os.path.relpath` 转为相对路径（如 `../materials/xxx.dds`，含扩展名）。

---

## 11. Blender IDProperty bool 转换 ✅

**现象**：`visible` 等属性在保存/加载 `.blend` 文件后丢失

**根因**：Blender IDProperty 嵌套 dict 不支持 Python bool 类型。

**修复**：将 `pde_primitive` dict 中的所有值强制转为 `int` 类型。

---

## 12. 面拓扑全三角化导致 PhysX 碰撞失效 ✅

**现象**：导出的场景 mesh 编译后 PhysX 碰撞失效

**根因**：旧版导出器全部预三角化，每个三角形是独立 Face，导致边数暴增 50%。`Mesh::Create` 的 `quick_sort` 不稳定，PhysX 碰撞烹饪失效。

**修复**：导出时遍历 `mesh.polygons`（保留原始多边形），不预三角化。

---

## 13. 四元数共轭错误 ✅

**现象**：旋转方向相反

**根因**：最初认为 PDE 和 Blender 四元数约定不同，导入时做了共轭 `(qw, -qx, -qy, -qz)`。

**修复**：Maya 和 Blender 都使用标准 Hamilton 约定，四元数直接使用，无需共轭。
