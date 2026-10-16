# PDE 引擎 .skel 二进制格式解析文档

> **源码依据**: `tc/client/game/Animation.cpp:56-107` — `Skeleton::SaveData()` / `Skeleton::LoadData()`
> **导入器实现**: `pdestudio/src/importer/binary/skeleton.py` — `parse_skeleton_binary()`
> **资源类型码**: `0x0600` (Skeleton)

## 1. 整体结构概览

`.cache` 文件解压后，数据流首先经过 `Resource::LoadData(stream)` 读取资源类型码，
之后进入 `Skeleton::LoadData(stream)` 的骨骼解析逻辑。

```
┌─────────────────────────────────────────────────┐
│  Resource Header (4B)   uint32 type = 0x0600    │
├─────────────────────────────────────────────────┤
│  Joint Count (4B)       uint32                   │
├─────────────────────────────────────────────────┤
│  Joint[0] ... Joint[N-1]                        │
│    每个: parent_id(4B) + name_len(4B) + name   │
├─────────────────────────────────────────────────┤
│  Transform Count (4B)   uint32                   │
├─────────────────────────────────────────────────┤
│  Transform[0] ... Transform[M-1]                │
│    每个: Vector3(12B) + Quaternion(16B) = 28B  │
└─────────────────────────────────────────────────┘
```

## 2. 字段详细说明

### 2.1 Resource Header

| 偏移 | 大小 | 类型 | 说明 |
|------|------|------|------|
| 0x00 | 4B | uint32 | 资源类型码，Skeleton = `0x0600` |

`Resource::SaveData(stream)` 写入 `uint32 type = GetType()`，
`Resource::LoadData(stream)` 读取并校验 type。

### 2.2 Joint 数组

| 大小 | 类型 | 说明 |
|------|------|------|
| 4B | uint32 | 关节数量 `joint_count` |

#### Joint 条目

每个关节依次写入:

| 大小 | 类型 | 字段 | 说明 |
|------|------|------|------|
| 4B | int32 | `parent_id` | 父关节索引，`-1` = 根关节 |
| 4B | uint32 | `name_len` | 关节名长度 |
| name_len | char[name_len] | `name` | 关节名 (UTF-8) |

源码 (`Animation.cpp:62-70` SaveData):
```cpp
stream.Write(&joints[i].parent_id, sizeof(int));   // int32
uint len = joints[i].name.Length();
stream.Write(&len, sizeof(uint));                   // uint32
stream.Write(joints[i].name.Str(), sizeof(char) * len);  // char[len]
```

LoadData (`Animation.cpp:92-102`):
```cpp
stream.Read(&data->joints[i].parent_id, sizeof(id)); // int32
stream.Read(&len, sizeof(uint));                     // uint32
stream.Read(str.buff(), sizeof(char) * len);         // char[len]
```

注意: `parent_id` 为有符号 int32 (`sizeof(int)`)，根关节的 `parent_id = -1`。

### 2.3 Transform 数组 (T-Pose)

| 大小 | 类型 | 说明 |
|------|------|------|
| 4B | uint32 | Transform 数量 `transform_count` |
| 28B × transform_count | Transform[] | 每个关节的局部变换 (T-Pose) |

Transform 数量应等于 `joint_count`。

#### Transform 结构

`Transform` 定义见 `Animation.h:4-16`:
```cpp
struct Transform {
    Core::Vector3     position;    // 12B (3×float32)
    Core::Quaternion  rotation;    // 16B (4×float32)
};
// sizeof(Transform) = 28
```

SaveData 将整个数组一次性写入:
```cpp
stream.Write(transforms.GetData(), sizeof(Transform) * size);
```

LoadData 一次性读取:
```cpp
stream.Read(data->transforms.GetData(), sizeof(Transform) * size);
```

| 偏移 (Transform 内) | 大小 | 类型 | 字段 |
|---------------------|------|------|------|
| 0x00 | 12B | float[3] | `position` (x, y, z) |
| 0x0C | 16B | float[4] | `rotation` (qx, qy, qz, qw) |
| 总计 | 28B | | |

注意: PDE 引擎使用厘米为单位，Blender 使用米为单位，
导入时需将 position 乘以 0.01 转换为米。

## 3. 完整二进制布局示意

```
偏移    字段                         大小
0x00    type (0x0600)                4B
0x04    joint_count                  4B
        ─── Joint[0] ───
0x08    parent_id                    4B (int32)
0x0C    name_len                     4B
0x10    name[name_len]               name_len B
        ─── Joint[1] ───
        parent_id                    4B
        name_len                      4B
        name[name_len]               name_len B
        ...
─── Transforms ───
        transform_count              4B
        Transform[0]                 28B
          position.x                 4B  (float32)
          position.y                 4B  (float32)
          position.z                 4B  (float32)
          rotation.x                 4B  (float32)
          rotation.y                 4B  (float32)
          rotation.z                 4B  (float32)
          rotation.w                 4B  (float32)
        Transform[1]                 28B
        ...
```

## 4. 关节层次关系

每个关节通过 `parent_id` 建立父子关系:
- `parent_id == -1`: 根关节 (Root)，没有父关节
- `parent_id == N`: 父关节索引为 N (0-based)

骨骼层次为自顶向下结构: 先定义父关节，后定义子关节。
但不保证严格连续，解析时应按 `parent_id` 引用建立层次树。

## 5. 坐标系与单位（极度重要！）

PDE 引擎、Maya、Blender 三者的坐标系不同，导入/导出骨骼时必须正确转换：

| 软件 | 向上轴 | 前向轴 | 手性 | 单位 |
|------|--------|--------|------|------|
| **PDE 引擎** | Y-up | +Z 前向 | 右手系 | 厘米 (cm) |
| **Maya** | Y-up | +Z 前向 | 右手系 | 厘米 (cm) |
| **Blender** | Z-up | -Y 前向 | 右手系 | 米 (m) |

### 骨骼位置 (position)

二进制文件中的 position 为 PDE 引擎坐标系 (Y-up, 厘米)。

导入到 Blender 时 (PDE → Blender):
```
Blender.X =  PDE.X
Blender.Z =  PDE.Y     (PDE Y → Blender Z)
Blender.Y = -PDE.Z     (PDE Z → Blender -Y, 注意取反)
所有坐标 ×0.01 (厘米 → 米)
```

从 Blender 导出时 (Blender → PDE):
```
PDE.X =  Blender.X
PDE.Y =  Blender.Z     (Blender Z → PDE Y)
PDE.Z = -Blender.Y     (Blender -Y → PDE Z, 注意取反)
所有坐标 ×100 (米 → 厘米)
```

### 骨骼旋转 (rotation 四元数)

四元数同样需要坐标系转换：

导入到 Blender 时 (PDE → Blender):
```
Blender.x =  PDE.x
Blender.z =  PDE.y     (PDE Y → Blender Z)
Blender.y = -PDE.z     (PDE Z → Blender -Y, 注意取反)
Blender.w =  PDE.w
```

从 Blender 导出时 (Blender → PDE):
```
PDE.x =  Blender.x
PDE.y =  Blender.z     (Blender Z → PDE Y)
PDE.z = -Blender.y     (Blender -Y → PDE Z, 注意取反)
PDE.w =  Blender.w
```

### Maya 与 PDE 引擎

Maya 与 PDE 引擎同为 Y-up 右手系 + 厘米，**无需任何坐标系转换**。
Maya 导出器中的骨骼旋转分解为 `rotateAxis * rotate * orient`，
这是 Maya 特有的关节旋转分解方式，Blender 不使用相同的分解方式。

## 6. 注意事项

1. **Transform 顺序**: Transform 数组顺序与 Joint 数组顺序一一对应。
2. **name 编码**: UTF-8 编码的字符串，不以 null 结尾。
3. **大端/小端**: 全部使用小端 (Little-Endian)。
