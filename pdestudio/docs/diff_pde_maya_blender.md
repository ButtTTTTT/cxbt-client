# PDE/Maya/Blender 数据差异

> 本文档记录在 PDE Studio 开发过程中验证过的三者之间的数据格式差异。
> 每一条都经过引擎源码逆向验证或实际测试确认。
> 最后更新：2026-09-02

---

## 一、坐标系

| 引擎/软件 | Up 轴 | 手性 | 位置约定 |
|-----------|-------|------|---------|
| PDE 引擎 | Y-up | 右手系 | X右, Y上, Z朝向观察者 |
| Maya | Y-up | 右手系 | X右, Y上, Z朝向观察者 |
| Blender | Z-up | 右手系 | X右, Y朝向观察者, Z上 |

### 坐标系转换

PDE/Maya Y-up → Blender Z-up = 绕 X 轴旋转 +90°：
```
位置: (x, y, z)_pde → (x, -z, y)_blender
四元数: q_blender = R @ q_pde @ R⁻¹
矩阵: M_blender = R @ M_pde @ R⁻¹
```
其中 `R = Quaternion((cos45°, sin45°, 0, 0))`

### 导入模式

- **`zup` 模式（推荐）**: PDE 坐标转换为 Blender Z-up，模型正常显示
- **`yup` 模式**: 直接使用 PDE 坐标，模型在 Blender 中侧躺

### 踩坑: 位置与四元数必须同步转换

只转换位置不转换四元数，导致骨骼旋转方向不对。位置和四元数必须同时做坐标系转换（`coordinate.py` 统一处理）。

---

## 二、四元数

### PDE 引擎

- D3DX 四元数，约定与标准 Hamilton 一致
- `D3DXQuaternionMultiply(out, a, b)` = `b ⊗ a`（标准 Hamilton 积）
  - C++ 语法 `a * b` 等价于标准 Hamilton 的 `b ⊗ a`
- `TransformCoord(v, q)` = `q⁻¹ ⊗ v ⊗ q`（标准逆向旋转）
- FK 链: `model_rot = parent_rot ⊗ local_rot`（与 Blender 一致）

### Maya

- 标准 Hamilton 约定 (`q ⊗ v ⊗ q⁻¹`，正向旋转)
- `maya_cast(MQuaternion)` = 直接拷贝 `(x, y, z, w)`，无转换

### Blender

- 标准 Hamilton 约定 (`q @ v = q ⊗ v ⊗ q⁻¹`，正向旋转)
- 与 Maya 一致

### 踩坑: 四元数不需要共轭

最初认为 PDE 和 Blender 四元数约定不同，做了共轭 `(qw, -qx, -qy, -qz)`，导致旋转方向反了。实际直接使用即可。

### 四元数连续性

`q` 和 `-q` 表示同一旋转，但 Blender 插值时如果连续帧在相反半球，会走"远路"。修复：相邻帧点积为负则取反。

### F-Curve 插值

Blender 默认 BEZIER 插值在四元数曲线上会过冲。四元数 F-Curve 应设为 LINEAR。

---

## 三、骨骼 Rest Matrix

### 蒙皮公式对比

| 引擎 | 蒙皮公式 |
|------|---------|
| PDE | `skinning_rot = anim_world_rot ⊗ rest_world_rot⁻¹` |
| Blender | `skinning = pose_world @ bone.matrix_local⁻¹` |

### 解耦公式（关键突破）

令 `pose_world = anim_world @ rest_world_pde⁻¹ @ bone.matrix_local`，则：
```
Blender 蒙皮 = pose_world @ bone.matrix_local⁻¹
             = anim_world @ rest_world_pde⁻¹ @ bone.matrix_local @ bone.matrix_local⁻¹
             = anim_world @ rest_world_pde⁻¹
             = PDE 蒙皮  ✓
```

**`bone.matrix_local` 在公式中完全抵消！** 意味着：
- `bone.matrix_local` 可以是任意值（tail 指向子骨骼）
- PDE rest world matrices 存储在 armature ID property 中
- 动画导入时用解耦公式计算 `matrix_basis`，补偿差异

### bone.tail 方向

当前方案：`bone.tail` 指向子骨骼 `head`（Blender 标准方式），通过解耦公式保证蒙皮正确。不再需要 `skeleton_display.py` 辅助 mesh。

---

## 四、matrix_parent_inverse

蒙皮网格设置为 Armature 子对象时，必须设置 `matrix_parent_inverse = armature.matrix_world.inverted()`，否则网格顶点在 Armature 局部空间中位置偏移，导致蒙皮变形。

多 Prim 蒙皮网格的父 Empty 也需要设置。

---

## 五、Mesh 格式差异

### 面绕序

| 引擎/软件 | 面绕序 |
|-----------|--------|
| PDE 引擎 | CCW（逆时针） |
| Maya | CCW（逆时针） |
| Blender | CCW（逆时针） |

三者一致，无需反转。导入器曾错误假设 PDE 使用 CW 并反转绕序，已修正。

### UV V 坐标

| 格式 | V 约定 | 处理 |
|------|--------|------|
| PDE 二进制 | DirectX (V=0 在顶部) | 导入时 V flip: `v = 1.0 - v` |
| PDE Lua | OpenGL (V=0 在底部) | 导出时不翻转，引擎加载时做 `1-y` |

### BlendIndices 基数

| 格式 | 基数 | 处理 |
|------|------|------|
| PDE 二进制 | 0-based | 直接使用 |
| PDE Lua | 1-based | 导出时 `+1`，引擎加载时 `-1` |

### 顶点格式

| 类型 | Stride | 字段 |
|------|--------|------|
| StreamStatic | 52B | pos(12) + normal(8) + tangent(8) + binormal(8) + uv0(4) + uv1(4) + uv2(4) + color(4) |
| StreamSkin | 64B | pos(12) + normal(8) + tangent(8) + binormal(8) + blendindices(4) + blendweight(16) + uv0(4) + uv1(4) |

- 法线/切线/副法线使用 half4 (8字节，4个16位浮点)
- 索引使用 U32 (4字节)
- blendweight 使用 Vector4 (16字节，4个32位浮点)

### 位置单位

| 格式 | 单位 | 处理 |
|------|------|------|
| PDE 二进制 | 米 | 直接使用 |
| PDE Lua | 厘米 | 引擎加载时 `÷100` |

### 贴图缓存

PDE `.cache` 文件解码后前 8 字节是引擎文件类型标识，不是 DDS 文件头。导入贴图时需去掉前 8 字节。

---

## 六、骨骼层级差异

### Lua vs 二进制

| 属性 | Lua 格式 | 二进制格式 |
|------|---------|-----------|
| Dummy root | 有 (index 0，引擎自动添加) | 无 |
| parent_id | 0-based(-1=根) → 引擎 `+1` | 直接使用 (0-based) |
| 位置单位 | 厘米 → 引擎 `÷100` | 米 (直接) |
| 旋转值 | 直接使用 | 直接使用 |

### 骨骼名

二进制格式的根骨骼（index 0）名称可能为空字符串，导入时自动命名为 `bone_0`。

---

## 七、动画导入

### PDE 动画数据格式

- 每帧 7 个 float: `tx, ty, tz, qx, qy, qz, qw`
- 存储的是**绝对局部变换**
- 帧率: 固定 96 fps
- 单位: 米（二进制格式）

### 解耦动画导入算法

当 `bone.matrix_local ≠ PDE rest matrix`（tail 指向子骨骼）时：
```
target_world = anim_world @ rest_world_pde⁻¹ @ bone.matrix_local
matrix_basis = rest_local⁻¹ @ parent_target_world⁻¹ @ target_world
```

分解 `matrix_basis` 得到 `location` 和 `rotation_quaternion`，插入关键帧。

退化情况：若 PDE rest matrices 未存储，公式退化为 `matrix_basis = rest_local⁻¹ @ anim_local`。

### 坐标系一致性

骨骼和动画必须使用相同的 `coord_mode`。存储在 Armature 的 `pde_coord_mode` ID property 中。
