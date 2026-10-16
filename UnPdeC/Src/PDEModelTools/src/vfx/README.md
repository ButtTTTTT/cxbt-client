# VFX 特效系统分析

## 概述

本文档记录了通过 IDA Pro 逆向分析游戏 vfx 特效系统的结果。

## 文件格式

### vfx 文件结构

vfx 文件是二进制格式，包含粒子特效的配置信息。

**基本结构**：
```
偏移 0-3:   版本标识 (uint32) - 通常为 1
偏移 4-7:   子类型 (uint32) - 如 5 表示水特效
偏移 8-15:  特效名称 (char[8]) - 如 "water"
偏移 16+:   粒子参数 (各种数据)
```

**示例分析** (`vfx_scene_waterflow.vfx`):
- 文件大小：794 字节
- 版本：1
- 类型：5
- 名称："water"

## 脚本引用

### AddParticle 函数

在地图脚本中使用：
```lua
level:AddParticle("scene_waterflow", Vector3(x, y, z), Vector3(dx, dy, dz))
```

**参数说明**：
- 参数1：特效名称（对应 vfx 文件名）
- 参数2：位置 Vector3(x, y, z)
- 参数3：方向 Vector3(dx, dy, dz) - 可能是发射方向或朝向

### 特效类型

**场景特效**：
- `scene_waterflow` - 水流
- `scene_waterflower` - 水花
- `scene_leaves_green` - 绿色落叶
- `scene_leaves_yellow` - 黄色落叶
- `scene_elec_b02` - 电效果
- `scene_smoke_w01` - 烟雾
- `occpoint_pos` - 占领点位置标记

**武器特效**：
- `vfx_grenade_explosion` - 手榴弹爆炸
- `vfx_grenade_trail` - 手榴弹尾迹
- `vfx_bullet_water` - 子弹击水
- `vfx_bullet_metal` - 子弹击金属
- `vfx_bullet_wood` - 子弹击木头

## IDA Pro 分析结果

### 关键函数

**1. AddParticle (0xcc6738)**
- 字符串地址：0xcc6738
- 引用位置：
  - 0x5cbdb9 → 函数 `sub_5CBD20`
  - 0x85313d → 待分析
  - 0x9ff441 → 待分析

**2. LoadParticle (0xcfdb88)**
- 字符串地址：0xcfdb88
- 引用位置：
  - 0x8c6aa9 → 函数 `sub_8C6500`

**3. SetParticle (0xcc66b4)**
- 字符串地址：0xcc66b4
- 功能：设置粒子属性

### PDE 文件系统

游戏使用 PDE 引擎的文件系统：

**关键函数**：
- `PDE_LoadDirectory` (0xbafd80) - 加载目录
- `PDE_FindPathInArchive` (0xbaffa0) - 在归档中查找路径
- `PDE_ReadBlock` (0xbaf190) - 读取数据块
- `PDE_CreateFileEntry` (0xbaf290) - 创建文件条目
- `PDE_AddToDirectory` (0xbaf3a0) - 添加到目录

### vfx 文件路径

游戏中的 vfx 文件路径格式：
```
/vfx/vfx_<effect_name>.vfx
```

示例：
- `/vfx/vfx_scene_waterflow.vfx`
- `/vfx/vfx_grenade_explosion.vfx`
- `/vfx/vfx_%s.vfx` (格式化字符串)

## 实现建议

### 方案A：标记点系统（推荐）

**优点**：
- 实现简单
- 可视化特效位置
- 保留完整信息
- 便于后续处理

**实现步骤**：
1. 解析脚本中的 `AddParticle` 调用
2. 在 Blender 中创建空物体
3. 设置物体位置和名称
4. 存储特效参数作为自定义属性

**示例代码**：
```python
# 创建特效标记点
empty = bpy.data.objects.new(f"VFX_{particle_name}", None)
empty.empty_display_type = 'PLAIN_AXES'
empty.location = position
empty['vfx_name'] = particle_name
empty['vfx_direction'] = direction
```

### 方案B：完整解析（复杂）

**优点**：
- 完整还原特效
- 可在 Blender 中预览

**缺点**：
- 需要完整逆向 vfx 格式
- 工作量大
- Blender 粒子系统与游戏可能不兼容

**实现步骤**：
1. 解析 vfx 二进制文件
2. 提取粒子参数
3. 创建 Blender 粒子系统
4. 设置粒子属性

## vfx 文件位置

游戏资源中的 vfx 文件位于：
```
D:\Games\FC1.0.6.8166\finalcombat_nocache_mixed\vfx\
```

**目录结构**：
```
vfx/
├── readparticle.lua          # 粒子读取脚本
├── textures/                 # 特效贴图
├── vfx_scene_waterflow.vfx   # 水流特效
├── vfx_scene_waterflower.vfx # 水花特效
├── vfx_scene_leaves_green.vfx # 绿叶特效
└── ...                       # 其他特效
```

## 后续工作

1. **解析 vfx 二进制格式**
   - 完整逆向文件结构
   - 提取所有粒子参数
   - 建立格式文档

2. **实现特效导入**
   - 选择实现方案（A 或 B）
   - 编写解析代码
   - 集成到场景加载器

3. **测试和优化**
   - 测试各种特效类型
   - 优化性能
   - 完善文档

## 参考资料

- IDA Pro 数据库：`fc8166_dump2_SCY.exe`
- 游戏版本：FC 1.0.6.8166
- 分析日期：2026-04-24
