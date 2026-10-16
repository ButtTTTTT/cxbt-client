# PDE Studio Mesh 导入/导出问题分析

> 基于对 `pdestudio/src/importer/`、`pdestudio/src/exporter/`、`pdestudio/src/ui/`
> 以及引擎源码 `tc/client/render/MeshResource.cpp` 的全面对比分析。

---

## 一、导入器问题 (importer/binary/mesh.py + importer/core/mesh_builder.py)

### 问题 1: 顶点色 (Color) 解析后未导入到 Blender ⚠️ 重要

**现状**:
- `mesh.py` 正确解析了 `PDEVertexStatic.color` (ARGB, 4字节整数值)
- `mesh_builder.py` 的 `_create_prim_object()` 中**完全没有使用** `v.color`
- 顶点色数据被解析后直接丢弃

**引擎行为** (`MeshResource.cpp:517-526`):
```cpp
if (data.color.Size() > i)
{
    ARGB color = data.color[i];
    if (color != NULL && color != -1)
        vb_stream[i].color = color;
    else
        vb_stream[i].color = Core::ARGB(255, 255, 255, 255);
}
else
    vb_stream[i].color = Core::ARGB(255, 255, 255, 255);  // 默认白色不透明
```

**影响**: 导入后顶点色丢失，导出时 `Colors` 和 `FaceVertexColors` 为空，
引擎加载后顶点色全部变白色 (255,255,255,255)，地图中某些区域的染色效果消失。

**修复建议**: 在 `_create_prim_object()` 中创建 `color_attributes` 层，
按 ARGB → RGBA 转换写入顶点色。

---

### 问题 2: 法线 (Normal) 解析后未导入到 Blender ⚠️ 重要

**现状**:
- `mesh.py` 正确解析了 `PDEVertexStatic.normal` (half4) 和 `PDEVertexSkin.normal`
- `mesh_builder.py` 的 `_create_prim_object()` 中**完全没有使用** `v.normal`
- 法线数据被解析后直接丢弃

**引擎行为** (`BuildStreamStatic:478-481`):
法线以 half4 (D3DXVECTOR4_16F) 存储在顶点缓冲中，第4分量固定为0。
引擎 `LoadRawData` 中通过 `mesh->SetNormals()` 设置，`BuildStream` 时写入顶点缓冲。

**影响**: 
- 导入后 Blender 使用自动计算的法线，可能与原始法线不一致
- 导出时法线重新计算，可能导致光照变化
- 对于硬边/软边处理可能不同

**修复建议**: 在 `_create_prim_object()` 中使用 `mesh.loops[i].normal` 或
创建 custom normal layer，将解析的法线写入。

---

### 问题 3: 切线/副法线 (Tangent/Binormal) 解析后未导入 ⚠️ 重要

**现状**:
- `mesh.py` 正确解析了 `tangent` 和 `binormal` (half4)
- `mesh_builder.py` 中**完全没有使用**这些数据
- 导出时使用 `mesh.calc_tangents()` 重新计算

**引擎行为** (`MeshResource.cpp:488-491, 1093-1095`):
切线/副法线与 UV0 绑定，通过 `v.id` (面顶点序号) 索引。
`CreateUVSet()` 时传入 tangents/binormals 数组。

**影响**: 
- 导入后切线丢失，导出时重新计算
- Blender 计算的切线可能与引擎原始切线不一致，导致法线贴图方向错误

**修复建议**: 如果导出使用 `calc_tangents` 重新计算，这个可以接受。
但需要注意 `calc_tangents` 的 UVMap 选择必须与 UV0 对应。

---

### 问题 4: UV2 导入逻辑可能遗漏数据 (Skin 网格)

**现状** (`mesh_builder.py:166`):
```python
uvs2.append(None)  # Skin格式无uv2
```

**引擎行为**: 
- `StreamSkin` 顶点格式确实只有 `uv0` 和 `uv1`，没有 `uv2`
- 但引擎 `LoadRawData` 中 `map[2]` 检查时如果 `GetUVs(2)` 返回 NULL，
  `vi.texcoord[2]` 设为 -1，后续跳过 uv2 数据

**结论**: 这是正确的行为，Skin 格式确实没有 uv2。✅ 无需修复

---

### 问题 5: Skin 网格的 blend_indices 偏移

**现状** (`mesh_builder.py:268-270`):
```python
bone_idx = v.blend_indices[j]
weight = v.blend_weight[j]
if bone_idx < len(bone_names) and weight > 0.0001:
```

**引擎行为** (`MeshResource.cpp:1149`):
```cpp
data.blendindices.PushBack(blendindex[j] - 1);  // 文本格式 +1, 二进制 -1 还原
```

**问题**: 二进制格式中 blend_indices 已经是 0-based（引擎 LoadData 直接读二进制，
SaveData 写入的也是已还原的 0-based 值）。所以导入器直接使用是正确的。✅ 无需修复

但注意：导出器 `mesh_data.py:151` 中 `blend_indices.append([idx + 1 ...])` 是对的，
因为文本格式需要 1-based。✅ 正确

---

## 二、导出器问题 (exporter/)

### 问题 6: 导出时缺少 FaceMaterials 与 ShadingGroup 的对应关系 ⚠️ 重要

**现状** (`mesh.py:229`):
```python
mesh_lua["FaceMaterials"] = face_material_indices
```

**引擎行为** (`MeshResource.cpp:1178-1216`):
引擎用 `shading_group_data` (即 FaceMaterials) 按面分组生成 primitives。
**每个 shading group 对应一个 primitive**。
```cpp
for (int i = 0; i < mesh->NumFaces(); ++ i)
    shading_group_count = Max(shading_group_count, shading_group_data[i]);
shading_group_count += 1;
// primitives.Resize(shading_group_count + 1);  // +1 因为有一个空 primitive[0]
```

**问题**: 
- 引擎 FaceMaterials 中的值是 shading group index (从 0 开始)
- 引擎会创建 `shading_group_count + 1` 个 primitive，其中 `primitive[0]` 是空的
- PDE Studio 导出时 `face_material_indices` 用的就是 `poly.material_index`
- 如果 Blender 的材质槽索引从 0 开始连续编号，这与 shading group index 一致
- **但材质列表 `materials_lua` 中跳过了 None 材质** (`mesh_materials.py:63-64`)，
  导致 `mat_index_map` 映射后 FaceMaterials 的值可能与引擎期望不一致

**修复建议**: 确保 FaceMaterials 的值是连续的 0-based shading group index，
与 `Materials` 列表一一对应。

---

### 问题 7: 导出器缺少 scale 因子 ⚠️ 重要

**现状** (`mesh_data.py:79-81`):
```python
points_list.append([round(px * export_scale, 6),
                    round(py * export_scale, 6),
                    round(pz * export_scale, 6)])
```

**引擎行为** (`MeshResource.cpp:757, 1036`):
```cpp
bool MeshResource::LoadRawData(const Core::Identifier& path, F32 scale)
// ...
points[i] *= scale;  // scale = 0.01f
```

引擎 LoadRawData 传入 `scale = 0.01f`，对 Points 做 ×0.01 处理。

**问题**: 
- PDE 引擎文本格式中的坐标单位是**厘米**（cm），引擎加载时 ×0.01 转为米
- Blender 中坐标单位是**米**（m）
- 导出器 `export_scale` 默认为 1.0
- 如果导入时 scale=1.0（坐标直接用 PDE 厘米值），那导出时 export_scale=1.0 是对的
- 但如果用户在 Blender 中缩放过模型，或使用不同单位，就需要调整

**结论**: 当前逻辑是自洽的（导入时不缩放，导出时也不缩放，值直接传递）。✅ 但需注意
文档中已提到坐标系转换（Z-up → Y-up）是正确的。

---

### 问题 8: 导出 UV 时不翻转 V

**现状** (`mesh_data.py:198-200`):
```python
u = round(uv[0], 6)
v = round(uv[1], 6)  # 不翻转 V
```

**引擎行为** (`MeshResource.cpp:1087`):
```cpp
data.uv0.PushBack(Vector2(map[0][v.texcoord[0]].x, 1.f - map[0][v.texcoord[0]].y));
```

引擎加载时做 `1.0 - y` 翻转。

**导入时** (`mesh_builder.py:193`):
```python
uv_layer.data[loop.index].uv = (u, 1.0 - v)  # 导入时翻转了
```

**结论**: 
- 导入: PDE → Blender，UV V 翻转了 (`1-v`)
- 导出: Blender → PDE，UV V 不翻转（直接用原始值）
- 引擎加载时再翻转 (`1-y`)

链路: PDE原始V → 导入(1-V) → Blender存储(1-V) → 导出(1-V) → 引擎加载(1-(1-V)) = V ✅ 正确

---

### 问题 9: 导出器缺少 BlendIndices 的多对象 joint_offset 传递

**现状** (`mesh_merge.py:124-125`):
```python
for bi in mesh_data["BlendIndices"]:
    all_blend_indices.append(bi + joint_offset)
```

**问题**: 
- 每个对象的 BlendIndices 已经是 1-based (`mesh_data.py:151`: `idx + 1`)
- 合并时加 `joint_offset`
- 如果两个对象共享同一骨骼列表（如场景中多个角色部分），joint_offset 会导致
  BlendIndices 指向错误的骨骼

**实际场景**: 场景导入时，多个 Primitive 共享同一个骨骼列表（从 mesh 的 bone_names），
它们应该用相同的骨骼索引。合并时如果每个对象的 joints 列表相同，joint_offset 不应该累加。

**修复建议**: 检查 joints 列表是否重复，如果共享相同骨骼则不加 offset。

---

## 三、Primitive 面板问题 (ui/)

### 问题 10: 面板中 BlendMode 显示的初始值问题

**现状** (`primitive_panel.py:116`):
```python
blend = blend_to_text_val(prim.get("blend_mode", 1))
```

默认值 1 对应 `kBlendNone` (二进制值)，`blend_to_text_val(1)` = 0 (文本值"不透明")。✅ 正确

---

### 问题 11: 面板缺少顶点色编辑入口

**现状**: 面板有碰撞、渲染、贴图、着色器、Uniform 区块，但**没有顶点色编辑**。

**影响**: 用户无法在面板中查看或编辑顶点色信息。
虽然顶点色在 Blender 中可以通过顶点绘制模式编辑，但面板应至少显示是否有顶点色数据。

---

### 问题 12: 面板缺少法线/切线显示和重计算入口

**现状**: 面板没有显示法线或切线状态，也没有重新计算法线/切线的入口。

**影响**: 用户无法知道导入的法线是否正确，也无法手动触发法线重计算。

---

## 四、关键对照总结

### 导入数据流完整性

| 数据 | 二进制解析 | 导入到 Blender | 导出回文本 | 引擎加载 |
|------|-----------|---------------|-----------|---------|
| Position (顶点坐标) | ✅ | ✅ 坐标转换 | ✅ 坐标转换 | ✅ |
| Normal (法线) | ✅ | ❌ **未导入** | ✅ calc_tangents | ✅ |
| Tangent (切线) | ✅ | ❌ **未导入** | ✅ calc_tangents | ✅ |
| Binormal (副法线) | ✅ | ❌ **未导入** | ✅ calc_tangents | ✅ |
| UV0 | ✅ | ✅ V翻转 | ✅ 不翻转 | ✅ 1-y |
| UV1 | ✅ | ✅ V翻转 | ✅ 不翻转 | ✅ 1-y |
| UV2 | ✅ | ✅ V翻转 | ✅ 不翻转 | ✅ 1-y |
| Color (顶点色) | ✅ | ❌ **未导入** | ✅ 有条件 | ✅ |
| BlendIndices | ✅ | ✅ 0-based | ✅ +1 转换 | ✅ -1 还原 |
| BlendWeight | ✅ | ✅ | ✅ | ✅ |
| Layer | ✅ | ✅ pde_primitive | ✅ | ✅ |
| CullMode | ✅ | ✅ pde_primitive | ✅ | ✅ |
| BlendMode | ✅ | ✅ pde_primitive | ✅ 文本值转换 | ✅ |
| Visible | ✅ | ✅ pde_primitive | ✅ IsInVisible反转 | ✅ |
| CollisionMode | ✅ | ✅ pde_primitive | ✅ | ✅ |
| PhysicsMaterial | ✅ | ✅ pde_primitive | ✅ | ✅ |
| Material (VS/PS/Textures/Uniforms) | ✅ | ✅ pde_material | ✅ | ✅ |
| AABB (local_aabb) | ✅ | ❌ **未存储** | ❌ **未导出** | 引擎自动计算 |

### 优先修复排序

1. **[高] 法线未导入** — 导致光照不正确
2. **[高] 顶点色未导入** — 导致地图染色丢失
3. **[中] 切线/副法线未导入** — 导出时重新计算可接受，但可能不一致
4. **[中] local_aabb 未存储** — 引擎加载文本格式时自动计算，影响不大
5. **[低] 面板缺少顶点色/法线显示** — 用户体验问题
6. **[低] BlendIndices 合并 offset** — 仅在多骨骼列表合并时出问题
