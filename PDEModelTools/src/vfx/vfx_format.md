# VFX 文件格式详细分析

## 文件头结构

### 基本头部（前 16 字节）

| 偏移 | 大小 | 类型 | 描述 | 示例值 |
|------|------|------|------|--------|
| 0x00 | 4 | uint32 | 版本标识 | 1 |
| 0x04 | 4 | uint32 | 子类型/特效类型 | 5 |
| 0x08 | 8 | char[8] | 特效名称 | "water" |

### 类型定义

**版本标识**：
- `1` - 标准版本

**子类型**：
- `5` - 水相关特效
- 其他值待分析

## 粒子参数结构

### 常见参数（推测）

```
偏移 16-19:  粒子数量 (uint32)
偏移 20-23:  生命周期 (float)
偏移 24-27:  发射速率 (float)
偏移 28-31:  初始速度 (float)
偏移 32-35:  颜色 R (float)
偏移 36-39:  颜色 G (float)
偏移 40-43:  颜色 B (float)
偏移 44-47:  颜色 A (float)
...
```

## 文件示例分析

### vfx_scene_waterflow.vfx

**基本信息**：
- 文件大小：794 字节
- 完整路径：`vfx/vfx_scene_waterflow.vfx`

**头部数据**：
```
01 00 00 00    # 版本 = 1
05 00 00 00    # 类型 = 5
77 61 74 65 72 00 00 00  # 名称 = "water"
```

**参数数据**（部分）：
```
偏移 16: 00 00 00 00
偏移 20: 00 01 00 00 (256)
偏移 24: 00 1c 00 00 (7168)
偏移 28-40: 00 00 00 00 (多个 0)
偏移 44: 00 00 41 20 (float: 10.0)
...
```

### vfx_scene_waterflower.vfx

**基本信息**：
- 文件大小：待分析
- 用途：水花特效

### vfx_scene_leaves_green.vfx

**基本信息**：
- 文件大小：待分析
- 用途：绿色落叶特效

## 二进制解析代码示例

### Python 解析器

```python
import struct

def parse_vfx(filepath):
    """解析 vfx 文件"""
    with open(filepath, 'rb') as f:
        data = f.read()
    
    # 解析头部
    version = struct.unpack_from('<I', data, 0)[0]
    subtype = struct.unpack_from('<I', data, 4)[0]
    name = data[8:16].decode('latin-1').strip('\x00')
    
    print(f"版本: {version}")
    print(f"类型: {subtype}")
    print(f"名称: {name}")
    print(f"文件大小: {len(data)} 字节")
    
    # 解析参数（需要更多逆向工作）
    # ...
    
    return {
        'version': version,
        'subtype': subtype,
        'name': name,
        'size': len(data)
    }

# 使用示例
vfx_info = parse_vfx('vfx_scene_waterflow.vfx')
```

## 待分析内容

### 需要逆向的关键点

1. **粒子发射器参数**
   - 发射形状（点、线、面、体）
   - 发射方向
   - 发射速率

2. **粒子生命周期**
   - 初始生命
   - 生命衰减
   - 死亡条件

3. **粒子运动**
   - 初始速度
   - 加速度
   - 重力影响
   - 阻力

4. **粒子外观**
   - 颜色（初始、变化）
   - 大小（初始、变化）
   - 贴图
   - 混合模式

5. **粒子碰撞**
   - 碰撞检测
   - 碰撞响应
   - 弹跳

## IDA Pro 分析函数

### 关键函数地址

```
LoadParticle:     0x8c6500
AddParticle:      0x5cbd20 (引用)
SetParticle:      待分析
PlayParticle:     待分析
```

### 函数调用流程

```
1. 脚本调用 AddParticle(name, pos, dir)
2. 查找 vfx 文件: /vfx/vfx_<name>.vfx
3. 调用 LoadParticle 加载 vfx 文件
4. 解析 vfx 二进制数据
5. 创建粒子系统
6. 设置位置和方向
7. 启动粒子发射
```

## 工具推荐

### 二进制分析工具

- **IDA Pro** - 逆向工程
- **010 Editor** - 二进制编辑
- **Hex-Rays** - 反编译
- **x64dbg** - 动态调试

### Blender 粒子系统

- Blender 内置粒子系统
- Python API 创建粒子
- 节点系统控制粒子

## 下一步工作

1. 使用 010 Editor 创建 vfx 模板
2. 动态调试 LoadParticle 函数
3. 提取完整参数列表
4. 编写完整解析器
5. 实现 Blender 导入
