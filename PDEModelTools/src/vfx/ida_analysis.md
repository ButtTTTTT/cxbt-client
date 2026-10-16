# IDA Pro 分析记录

## 数据库信息

**基本信息**：
- 文件名：`fc8166_dump2_SCY.exe`
- 基址：`0x400000`
- 大小：`0xf0f000` (15,790,080 字节)
- MD5：`76f6e3569604fdee6ad933f6cf0b7c66`
- SHA256：`a83b752707f31744ef0d540baa7ca58e9836930d5b7395d0cc35ca051bf4cb95`

## 关键字符串

### vfx 相关字符串

| 地址 | 字符串 | 用途 |
|------|--------|------|
| 0xd05f58 | `/vfx/vfx_grenade_explosion.vfx` | 手榴弹爆炸 |
| 0xd05f78 | `/vfx/vfx_grenade_trail.vfx` | 手榴弹尾迹 |
| 0xd05f94 | `/vfx/vfx_bullet_water.vfx` | 子弹击水 |
| 0xd05fb0 | `/vfx/vfx_bullet_metal.vfx` | 子弹击金属 |
| 0xd05fcc | `/vfx/vfx_bullet_wood.vfx` | 子弹击木头 |
| 0xd05fe8 | `/vfx/vfx_bullet_concrete.vfx` | 子弹击混凝土 |
| 0xd06170 | `/vfx/vfx_%s.vfx` | 格式化字符串 |

### 粒子相关字符串

| 地址 | 字符串 | 用途 |
|------|--------|------|
| 0xcc6738 | `AddParticle` | 添加粒子 |
| 0xcfdb88 | `LoadParticle` | 加载粒子 |
| 0xcc66b4 | `SetParticle` | 设置粒子 |
| 0xcc4278 | `PlayCharacterParticle` | 播放角色粒子 |
| 0xcc6b7c | `SetDeadParticle` | 设置死亡粒子 |

### 场景相关字符串

| 地址 | 字符串 | 用途 |
|------|--------|------|
| 0xcf5554 | `AddSceneSound` | 添加场景音效 |
| 0xcf5544 | `AddScene3DSound` | 添加3D音效 |
| 0xcf534c | `SetSceneReverb` | 设置场景混响 |

## 关键函数

### AddParticle 相关

**字符串地址**：0xcc6738

**引用位置**：
1. **0x5cbdb9** → 函数 `sub_5CBD20`
   - 函数地址：0x5cbd20
   - 函数大小：0x6e4 (1764 字节)
   - 功能：处理 Lua 脚本的 AddParticle 调用

2. **0x85313d** → 待分析函数

3. **0x9ff441** → 待分析函数

**反编译代码片段**：
```c
void __stdcall sub_5CBD20(int *a1, int a2)
{
  // ... 省略变量声明 ...
  
  AudioEvent_Load(aSetmesh);
  v59 = 0;
  v2 = (int *)sub_5C0420(&v55, &v53, sub_5A89C0);
  v3 = v2[1];
  v4 = a1;
  v51 = *v2;
  v52 = v3;
  v5 = *(void (__thiscall **)(int *, int, int))(*a1 + 56);
  // ... 更多代码 ...
}
```

### LoadParticle 相关

**字符串地址**：0xcfdb88

**引用位置**：
1. **0x8c6aa9** → 函数 `sub_8C6500`
   - 函数地址：0x8c6500
   - 功能：加载 vfx 文件并解析

**反编译代码片段**：
```c
void __stdcall sub_8C6500(int *a1, int a2)
{
  // ... 省略变量声明 ...
  
  AudioEvent_Load(aSetsundirectio);
  v98 = 0;
  v2 = (int *)sub_8C03E0(&v94, &v92, ...);
  // ... 更多代码 ...
}
```

## PDE 文件系统函数

### 文件操作函数

| 地址 | 函数名 | 大小 | 功能 |
|------|--------|------|------|
| 0xbafd80 | `PDE_LoadDirectory` | 0x1ba | 加载目录 |
| 0xbaffa0 | `PDE_FindPathInArchive` | 0xf3 | 在归档中查找路径 |
| 0xbaf190 | `PDE_ReadBlock` | 0x51 | 读取数据块 |
| 0xbaf210 | `PDE_ReadNextBlock` | 0x77 | 读取下一块 |
| 0xbaf290 | `PDE_CreateFileEntry` | 0x62 | 创建文件条目 |
| 0xbaf300 | `PDE_InsertEntry` | 0x77 | 插入条目 |
| 0xbaf3a0 | `PDE_AddToDirectory` | 0xeb | 添加到目录 |
| 0xbaf510 | `PDE_AllocateBlock` | 0x1f0 | 分配块 |
| 0xbaff40 | `PDE_FreeEntry` | 0x60 | 释放条目 |
| 0xbb00a0 | `PDE_CreateEntry` | 0x1cc | 创建条目 |
| 0xbb0570 | `PDE_CreateDirInArchive` | 0xed | 在归档中创建目录 |
| 0xbb0660 | `PDE_FindEntry` | 0x113 | 查找条目 |
| 0xbb0be0 | `PDE_CloseHandle` | 0x177 | 关闭句柄 |

### 文件验证函数

| 地址 | 函数名 | 大小 | 功能 |
|------|--------|------|------|
| 0x4b89b0 | `File_Exists` | 0x66 | 检查文件是否存在 |
| 0xbaedd0 | `PDE_ValidateName` | 0x33 | 验证名称 |

## 调用流程分析

### AddParticle 调用流程

```
1. Lua 脚本调用: level:AddParticle(name, pos, dir)
   ↓
2. Lua 绑定函数处理 (sub_5CBD20)
   ↓
3. 构造 vfx 文件路径: /vfx/vfx_<name>.vfx
   ↓
4. 调用 PDE_FindPathInArchive 查找文件
   ↓
5. 调用 LoadParticle (sub_8C6500) 加载文件
   ↓
6. PDE_ReadBlock 读取文件数据
   ↓
7. 解析 vfx 二进制格式
   ↓
8. 创建粒子系统对象
   ↓
9. 设置位置和方向
   ↓
10. 激活粒子发射器
```

### vfx 文件加载流程

```
1. 接收文件路径
   ↓
2. PDE_FindPathInArchive 查找文件
   ↓
3. PDE_CreateFileEntry 创建文件条目
   ↓
4. PDE_ReadBlock 读取数据块
   ↓
5. 解析文件头（版本、类型、名称）
   ↓
6. 解析粒子参数
   ↓
7. 创建粒子发射器
   ↓
8. 配置粒子属性
   ↓
9. 返回粒子对象
```

## 数据结构推测

### vfx 文件头结构

```c
struct VFXHeader {
    uint32_t version;      // 版本标识
    uint32_t subtype;      // 子类型
    char name[8];          // 特效名称
    // ... 更多字段 ...
};
```

### 粒子系统结构

```c
struct ParticleSystem {
    char* name;            // 特效名称
    Vector3 position;      // 位置
    Vector3 direction;     // 方向
    uint32_t particle_count;  // 粒子数量
    float lifetime;        // 生命周期
    float emit_rate;       // 发射速率
    // ... 更多参数 ...
};
```

## 下一步分析建议

### 优先级高

1. **动态调试 LoadParticle 函数**
   - 设置断点
   - 观察参数传递
   - 记录文件读取过程

2. **分析 vfx 参数结构**
   - 提取完整参数列表
   - 确定参数类型和大小
   - 建立结构定义

3. **Hook AddParticle 调用**
   - 拦截特效创建
   - 记录所有参数
   - 导出特效列表

### 优先级中

4. **分析粒子渲染**
   - 查找渲染函数
   - 理解渲染流程
   - 提取着色器信息

5. **分析粒子更新**
   - 查找更新函数
   - 理解物理模拟
   - 提取运动参数

### 优先级低

6. **完整逆向 vfx 格式**
   - 编写完整解析器
   - 创建 010 Editor 模板
   - 编写导入工具

## 工具和脚本

### IDA Python 脚本

```python
# 查找所有 vfx 字符串引用
import idautils
import idc

vfx_string_addr = 0xd06170  # "/vfx/vfx_%s.vfx"
xrefs = list(idautils.XrefsTo(vfx_string_addr))

for xref in xrefs:
    print(f"引用地址: {hex(xref.frm)}")
    func = idaapi.get_func(xref.frm)
    if func:
        print(f"  函数: {idc.get_func_name(func.start_ea)}")
```

### x64dbg 调试脚本

```
// 在 LoadParticle 函数设置断点
bp 0x8c6500

// 条件断点：当加载特定 vfx 时中断
bp 0x8c6500 "strstr(parm1, \"water\") != 0"
```

## 总结

通过 IDA Pro 分析，我们找到了：
- vfx 文件的加载和解析函数
- AddParticle 的调用流程
- PDE 文件系统的关键函数
- vfx 文件的基本结构

下一步需要动态调试和更深入的逆向工作来完整理解 vfx 格式。
