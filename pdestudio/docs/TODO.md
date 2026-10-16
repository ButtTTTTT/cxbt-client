# PDE Studio TODO

> 最后更新：2026-09-09 (导入验证)

## 已完成

### 导出

- [x] .mesh 导出 — 静态/蒙皮网格，多材质、多UV集、切线/副法线、顶点色
- [x] .skel 导出 — 骨骼层级，自动位置缩放
- [x] .anim 导出 — 骨骼动画(96fps逐帧采样)
- [x] 编译脚本生成 — `cache_xxx.lua` + `gen_xxx.lua`
- [x] 多对象合并导出 — 场景多 primitive 合并
- [x] 路径分派 UI — 角色/道具/场景分类导出按钮
- [x] 材质数据保真 — `pde_material` 自定义属性完整往返

### 导入

- [x] .mesh.cache / .mesh 导入 — 二进制/文本格式
- [x] .skel.cache 导入
- [x] .anim.cache 导入
- [x] .cache 解码 — LZ 解压 + CRC 校验
- [x] 角色批量导入 — character.json 索引 + 配饰 + 动画
- [x] 场景批量导入 — scene.json 索引 + 集合分类 + 多 Prim 提升
- [x] 材质复用 — 同名材质自动复用，材质名与物体名解耦

### 数据正确性

- [x] 四元数不共轭 — 引擎源码验证
- [x] BlendIndices 1-based (Lua 格式)
- [x] UV V 不翻转 (Lua 格式)
- [x] 面绕序 CCW — 不反转
- [x] 切线不去重 — 按面顶点顺序
- [x] 保留原始多边形面 — 不预三角化
- [x] CollisionMode 始终写入
- [x] CullingMode 从原始数据读取

### Mesh 导入/导出修复 (2026-09-09)

- [x] 法线导入 — 从二进制顶点缓冲解析法线(half4)，坐标系转换后写入 Blender custom normal (`normals_split_custom_set`)
- [x] 顶点色导入 — 从 ARGB 整数转为 RGBA float，写入 `color_attributes` (CORNER 域)，全白色跳过优化
- [x] 切线/副法线 — 导出时 `calc_tangents` 改用 `uv_layers[0]`（第一个UV层）而非 `active`，与引擎 UV0 绑定一致
- [x] 多对象合并 BlendIndices — 检测骨骼列表重复时不加 offset，修复场景导入多 Primitive 共享骨骼的索引偏移
- [x] 顶点色默认导出 — `export_vertex_colors` 默认值改为 True
- [x] 坐标系转换函数 — 新增 `convert_direction()` 用于法线/切线/副法线方向向量

### 文档

- [x] .mesh 二进制格式文档 — `docs/binary/mesh_binary_format.md`
- [x] .skel 二进制格式文档 — `docs/binary/skel_binary_format.md`
- [x] .anim 二进制格式文档 — `docs/binary/anim_binary_format.md`
- [x] Maya 导出格式分析 — `docs/binary/maya_export_format.md`
- [x] 坐标系差异说明 — 四份文档均新增坐标系对比表和转换公式
- [x] Mesh 导入/导出问题分析 — `docs/mesh_import_export_issues.md`

## 待办

### 导入验证与修复 (2026-09-09)

- [x] 实际导入地图 mesh 验证法线/顶点色是否正确显示 — 导入 level5_test 地图(21个对象)，发现 Blender 5.2 中 `normals_split_custom_set` API 变更导致法线写入失败，已修复
- [x] 检查导入的顶点色在 Blender 视口中是否需要切换渲染模式才能看到 — Solid 模式下需将 `color_type` 设为 `VERTEX` 才能显示顶点色；材质节点中需添加 Vertex Color 节点才能在 Material Preview/Rendered 模式显示
- [ ] 验证导出后引擎加载的法线/顶点色与原始一致 — 需在引擎中验证
- [ ] 验证多对象合并导出后 BlendIndices 指向正确的骨骼 — 本场景为静态网格无蒙皮，需导入角色模型验证
- [ ] 验证切线/副法线在法线贴图模型上方向正确 — Blender 不存储 tangent/binormal，导出时用 `calc_tangents` 重新计算，需与引擎原始数据对比

### Blender 5.2 法线 API 修复 (2026-09-09)

- [x] `_apply_normals` 修复 — `normals_split_custom_set` 在 Blender 5.2 中需要 tuple/Vector 列表而非 flat float 列表；`use_custom_edge_normals` 属性已移除，改用 `hasattr` 检测；写入 custom normal 后需设置 `poly.use_smooth = True`

### 导出器增强

- [ ] 导出时从 `color_attributes` 的 CORNER 域正确读取顶点色（当前 `_collect_colors` 已支持，需验证导入写入的 "Color" 属性名是否能被正确读取）
- [ ] 导出器默认导出顶点色后，验证 `Colors` / `FaceVertexColors` Lua 字段格式与 Maya 导出器一致
- [ ] 检查导出器 `FaceMaterials` 与 `Materials` 列表的 shading group index 对应关系是否完全正确（特别是跳过 None 材质时 `mat_index_map` 的映射）

### 面板增强

- [ ] Primitive 面板添加顶点色状态显示（有无顶点色数据）
- [ ] Primitive 面板添加法线状态显示（custom normal / auto normal）
- [ ] 考虑在面板中添加"重新计算法线"按钮

### 其他

- [ ] 骨骼 rest matrix 退化路径 — 从零创建的 Armature 没有 `pde_rest_matrices`，退化为 `bone.matrix_local`。仅影响非导入骨骼的手动创建场景。
- [ ] 场景纹理 DDS 转换（用户暂不打算动贴图）
- [ ] 批量导出（P3，后续再做）
