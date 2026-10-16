# PDE 引擎 .anim 二进制格式解析文档

> **源码依据**: `tc/client/game/Animation.cpp:579-611` — `Animation::SaveData()` / `Animation::LoadData()`
> **轨道序列化**: `tc/client/game/Animation.cpp:1156-1212` — `AnimationTrack::Load()` / `AnimationTrack::Save()`
> **导入器实现**: `pdestudio/src/importer/binary/animation.py` — `parse_animation_binary()`
> **资源类型码**: `0x0500` (Animation)

## 1. 整体结构概览

`.cache` 文件解压后，数据流首先经过 `Resource::LoadData(stream)` 读取资源类型码，
之后进入 `Animation::LoadData(stream)`，后者调用 `AnimationTrack::Load(stream)` 解析动画轨道。

```
┌─────────────────────────────────────────────────┐
│  Resource Header (4B)   uint32 type = 0x0500    │
├─────────────────────────────────────────────────┤
│  Joint Count (4B)       uint32                   │
├─────────────────────────────────────────────────┤
│  JointTrack[0] ... JointTrack[N-1]             │
│    每个: name_len(4B) + name + frame_count(4B) │
│         + data_len(4B) + float[data_len]        │
└─────────────────────────────────────────────────┘
```

注意: `Animation::LoadData()` 调用 `Resource::LoadData()` 后直接调用
`track->Load(stream)`，`AnimationTrack::Load()` 负责读取其后的全部轨道数据。

## 2. 字段详细说明

### 2.1 Resource Header

| 偏移 | 大小 | 类型 | 说明 |
|------|------|------|------|
| 0x00 | 4B | uint32 | 资源类型码，Animation = `0x0500` |

### 2.2 Joint Track 数组

| 大小 | 类型 | 说明 |
|------|------|------|
| 4B | uint32 | 轨道数量 `joint_count` |

#### JointTrack 条目

每个关节轨道依次写入:

| 大小 | 类型 | 字段 | 说明 |
|------|------|------|------|
| 4B | uint32 | `name_len` | 关节名长度 |
| name_len | char[name_len] | `name` | 关节名 (UTF-8) |
| 4B | uint32 | `frame_count` | 该关节的帧数 |
| 4B | uint32 | `data_len` | float 数量 (注意: 不是字节数!) |
| data_len × 4 | float[data_len] | `data` | 帧数据 (每帧 7 个 float) |

源码 (`Animation.cpp:1194-1212` SaveData):
```cpp
writer.WriteUInt32(joint_array.Size());        // 轨道数量
for each joint:
    writer.WriteString(joint_data->name);       // uint32 len + char[len]
    writer.WriteUInt32(joint_data->frame_count);
    writer.WriteUInt32(joint_data->data.Size());  // float 数量
    writer.Write(joint_data->data.GetData(), sizeof(float) * joint_data->data.Size());
```

LoadData (`Animation.cpp:1157-1191`):
```cpp
stream.Read(&size, sizeof(uint));               // 轨道数量
for each joint:
    stream.Read(&len, sizeof(uint));            // name_len
    stream.Read(str.buff(), len);               // name
    stream.Read(&joint_data->frame_count, sizeof(uint));  // frame_count
    stream.Read(&len, sizeof(uint));            // data_len (float count)
    joint_data->data.Resize(len);
    stream.Read(joint_data->data.GetData(), sizeof(float) * len);  // float data
```

### 2.3 帧数据编码

每个关节的 `data` 数组是一维 float 数组，按帧连续排列。
**每帧 7 个 float**:

| 索引 | 字段 | 说明 |
|------|------|------|
| 0 | `tx` | 位置 X 分量 |
| 1 | `ty` | 位置 Y 分量 |
| 2 | `tz` | 位置 Z 分量 |
| 3 | `qx` | 旋转四元数 X 分量 |
| 4 | `qy` | 旋转四元数 Y 分量 |
| 5 | `qz` | 旋转四元数 Z 分量 |
| 6 | `qw` | 旋转四元数 W 分量 |

帧数 = `data_len / 7` (float_count / 7)

### 2.4 frame_count 与实际帧数的关系

- `frame_count` 字段: 记录该关节轨道应有的帧数
- 实际帧数 = `data_len / 7` (从 float 数组推算)
- 两者通常相等，但不保证 (导入器中会做校验)

`AnimationTrack` 类的 `frame_count` 成员初始值为 `-1` (`Animation.h:162`)，
第一个轨道的 `frame_count` 会被记录为动画的总帧数。

## 3. 完整二进制布局示意

```
偏移    字段                          大小
0x00    type (0x0500)                 4B
0x04    joint_count                   4B
        ─── JointTrack[0] ───
0x08    name_len                      4B
0x0C    name[name_len]                name_len B
        frame_count                   4B
        data_len                       4B  (float count)
        data[0..6]  (frame 0)         28B  (7×float32)
          tx, ty, tz, qx, qy, qz, qw
        data[7..13] (frame 1)         28B
        ...
        ─── JointTrack[1] ───
        name_len                       4B
        name[name_len]                 name_len B
        frame_count                    4B
        data_len                       4B
        data[...]                      data_len × 4B
        ...
```

## 4. 动画采样逻辑

引擎在运行时通过以下方法从轨道数据中采样:

### 4.1 按帧采样 (GetTransform by frame)

```cpp
// 按整数帧索引采样
int data_offset = frame * 7;
Vector3 pos(data[data_offset+0], data[data_offset+1], data[data_offset+2]);
Quaternion rot(data[data_offset+3], data[data_offset+4], data[data_offset+5], data[data_offset+6]);
```

### 4.2 按时间采样 (GetTransform by time)

```
frame = time * frame_rate           // 时间→帧 (frame_rate = 96.0 fps)
frame0 = floor(frame)
frame1 = frame0 + 1
alpha = frame - frame0             // 插值权重
// 在 frame0 和 frame1 之间线性插值 position
// 在 frame0 和 frame1 之间球面插值 (slerp) rotation
```

引擎固定帧率为 **96 fps**。

### 4.3 循环播放

当 `auto_circle == true` 且帧索引超过总帧数时，自动回绕到第 0 帧。

## 5. 坐标系与单位（极度重要！）

PDE 引擎、Maya、Blender 三者的坐标系不同，导入/导出动画时必须正确转换：

| 软件 | 向上轴 | 前向轴 | 手性 | 单位 |
|------|--------|--------|------|------|
| **PDE 引擎** | Y-up | +Z 前向 | 右手系 | 厘米 (cm) |
| **Maya** | Y-up | +Z 前向 | 右手系 | 厘米 (cm) |
| **Blender** | Z-up | -Y 前向 | 右手系 | 米 (m) |

### 动画位移 (translate, 每帧 float[0:2])

二进制文件中的 translate 为 PDE 引擎坐标系 (Y-up, 厘米)。

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

### 动画旋转 (rotateQuaternion, 每帧 float[3:6])

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
Maya 导出器的动画旋转为 `rotateAxis * rotate * orient` 三者乘积，
这是 Maya 特有的关节旋转分解方式，Blender 不使用相同的分解方式。

## 6. 注意事项

1. **data_len 单位**: `data_len` 是 **float 的数量**，不是字节数。
   实际字节数 = `data_len × 4`。
2. **帧率**: PDE 引擎动画固定 96 fps。
3. **轨道稀疏性**: 并非所有关节都有动画轨道。轨道数量 (`joint_count`)
   可能小于骨骼的关节数量。引擎通过关节名 (`name`) 匹配骨骼关节。
4. **frame_count 一致性**: 各轨道的 `frame_count` 应一致 (均为动画总帧数)，
   但数据格式允许不一致。导入时应取所有轨道的最大 `frame_count`。
5. **大端/小端**: 全部使用小端 (Little-Endian)。
6. **name 编码**: UTF-8 编码的字符串，不以 null 结尾。
