# PDE 文件格式详解

## 概述

PDE 是一种虚拟文件系统（VFS）格式，用于打包游戏资源文件。它采用分段存储结构，包含 VFS 表（用于定位数据块）和实际数据段。

---

## 文件结构

### 整体布局

```
+------------------+
| VFS 表块 #0      |  4KB (0x1000 字节)
+------------------+
| 数据段 #0        |  4MB (0x400000 字节)
+------------------+
| VFS 表块 #1      |  4KB
+------------------+
| 数据段 #1        |  4MB
+------------------+
| VFS 表块 #2      |  4KB
+------------------+
| 数据段 #2        |  4MB
+------------------+
| ...              |
+------------------+
```

每个 **Segment** = 4KB VFS 表块 + 4MB 数据段 = 4,100,096 字节 (0x401000)

### 各部分说明

| 组件 | 大小 | 说明 |
|------|------|------|
| VFS 表块 | 4KB (0x1000) | 每块包含 1024 个 VFS 条目，每条目 4 字节 |
| 数据段 | 4MB (0x400000) | 每段包含 1024 个数据块，每块 4KB |

---

## VFS 表详解

### VFS 条目结构

每个 VFS 条目占 4 字节，格式如下：

```
┌─────────────────────────────────────────────────────────┐
│ bit 31  │ bit 30-0                                    │
├─────────┼─────────────────────────────────────────────┤
│ 标志位  │ rawOffset (块索引)                          │
└─────────┴─────────────────────────────────────────────┘
```

- **bit 31 (标志位)**: 
  - `1` = 有效条目
  - `0` = 未使用/空条目

- **bit 30-0 (rawOffset)**: 
  - 指向数据块的索引
  - 最大支持 2,147,483,647 个块 ≈ 8TB 数据

### VFS 值类型

| VFS 值 | 含义 |
|--------|------|
| `0x80000000` | 单块条目或最后一块（终止符） |
| `0x80000001` | 指向 rawOffset=1 的块 |
| `0x80000401` | 指向 rawOffset=1025 的块 |
| `0x8000FFFF` | 指向 rawOffset=65535 的块 |
| `0x80010000` | 指向 rawOffset=65536 的块 |

### VFS 链规则

对于多块文件，VFS 表形成链表：

```
文件占用 rawOffset 100-103 (4个块):

VFS[100] = 0x80000065  → 指向 rawOffset 101 (下一块)
VFS[101] = 0x80000066  → 指向 rawOffset 102 (下一块)
VFS[102] = 0x80000067  → 指向 rawOffset 103 (下一块)
VFS[103] = 0x80000000  → 终止符（最后一块）
```

**重要**：对于单块文件，VFS 值直接是 `0x80000000`。

---

## 偏移计算

### rawOffset 到 realOffset 的转换

由于 VFS 表块穿插在数据段之间，rawOffset（逻辑块索引）到 realOffset（文件偏移）的转换需要特殊计算：

```
realOffset = ((rawOffset + (rawOffset >> 10) + 1) << 12)
```

**公式解释**：

1. `rawOffset >> 10` = segment 索引（每 1024 块一个 segment）
2. `rawOffset + segment索引 + 1` = 跳过前面的 VFS 表块
3. `<< 12` = 转换为字节偏移（每块 4KB）

### 转换示例

| rawOffset | realOffset | 说明 |
|-----------|------------|------|
| 0 | 0x1000 | 数据段 #0 第一个块 |
| 1 | 0x2000 | 数据段 #0 第二个块 |
| 1023 | 0x400000 | 数据段 #0 最后一个块 |
| 1024 | 0x402000 | 数据段 #1 第一个块（跳过 VFS 表块 #1） |
| 1025 | 0x403000 | 数据段 #1 第二个块 |
| 2047 | 0x801000 | 数据段 #1 最后一个块 |
| 2048 | 0x803000 | 数据段 #2 第一个块（跳过 VFS 表块 #2） |

### 重要发现：VFS 表块空洞

**关键点**：rawOffset 1023 和 1024 之间存在 4KB 的空洞！

```
rawOffset=1023 → realOffset=0x400000 (数据结束于 0x401000)
                      ↓
              0x401000-0x402000 = VFS 表块 #1 (空洞)
                      ↓
rawOffset=1024 → realOffset=0x402000 (数据开始)
```

这意味着数据写入必须 **逐块进行**，不能连续写入，否则会覆盖 VFS 表块！

---

## 目录条目结构

每个目录或文件的元数据占 128 字节 (0x80)：

```
偏移    大小    说明
────────────────────────────────────
0x00    1字节   类型 (1=文件, 2=目录)
0x01    110字节 名称 (UTF-8, null terminated)
0x70    8字节   时间戳 (NTFS FILETIME)
0x78    4字节   Offset (rawOffset 块索引)
0x7C    4字节   Size (文件/目录数据大小)
```

### 目录数据存储

目录的子条目列表作为数据存储在 rawOffset 指向的位置：
- 每个子条目占 128 字节
- 目录数据大小 = 子条目数量 × 128
- 需要对齐到 4KB 边界

---

## XOR 加密

### 加密算法

PDE 文件使用 XOR 加密，密钥基于线性同余生成器（LCG）：

```csharp
// 密钥生成
uint eax = 0x42574954;
for (int i = 0; i < 0x1000; i++)
{
    eax *= 0x7FCF;
    key[i] = (byte)((eax >> 24) ^ ((eax >> 16) & 0xFF) ^ 
                    ((eax >> 8) & 0xFF) ^ (eax & 0xFF));
}
```

### 加密规则

1. **VFS 表块**：使用其在文件中的偏移作为加密起始位置
2. **数据块**：使用该块的 realOffset 作为加密起始位置

```csharp
// 加密/解密
for (int i = 0; i < data.Length; i++)
{
    data[i] ^= key[(startOffset + i) % 0x1000];
}
```

---

## 打包流程

### 步骤 1：收集条目

深度优先遍历源目录，构建条目树：

```csharp
class PackEntry
{
    string Name;
    bool IsDirectory;
    string? FilePath;    // 仅文件
    uint Size;           // 文件大小或目录数据大小
    uint Offset;         // 分配的 rawOffset
    uint BlockCount;     // 占用的块数
    List<PackEntry> Children;  // 仅目录
}
```

### 步骤 2：分配 rawOffset

按深度优先顺序遍历所有条目，依次分配 rawOffset：

```csharp
uint currentRawOffset = 0;
foreach (var entry in allEntries)
{
    entry.Offset = currentRawOffset;
    entry.BlockCount = CalculateBlocks(entry.Size);
    currentRawOffset += entry.BlockCount;
}
```

### 步骤 3：写入 VFS 表

为每个条目的每个块写入 VFS 值：

```csharp
for (uint i = 0; i < entry.BlockCount; i++)
{
    uint rawOffset = entry.Offset + i;
    uint vfsValue = (i == entry.BlockCount - 1) 
        ? 0x80000000                    // 最后一块
        : 0x80000000 | (rawOffset + 1); // 指向下一块
    
    // 写入到对应的 VFS 表块
    WriteVfsEntry(rawOffset, vfsValue);
}
```

### 步骤 4：写入数据

**关键**：必须逐块写入，处理 segment 边界的 VFS 表空洞！

```csharp
for (uint i = 0; i < entry.BlockCount; i++)
{
    uint rawOffset = entry.Offset + i;
    ulong realOffset = RawToRealOffset(rawOffset);
    
    byte[] blockData = PrepareBlock(entry.Data, i);
    Encrypt(blockData, realOffset);  // 使用 realOffset 加密
    WriteToFile(realOffset, blockData);
}
```

### 步骤 5：加密 VFS 表块

最后，对所有 VFS 表块进行加密：

```csharp
for (uint seg = 0; seg < totalSegments; seg++)
{
    ulong vfsOffset = seg * (BLOCK_SIZE + DATA_SEGMENT_SIZE);
    EncryptVfsBlock(vfsOffset);
}
```

---

## 常见问题

### Q1: 为什么不能连续写入数据？

因为 rawOffset 到 realOffset 的映射在 segment 边界处不连续：
- `rawOffset=1023 → realOffset=0x400000`
- `rawOffset=1024 → realOffset=0x402000`

中间的 `0x401000-0x402000` 是 VFS 表块 #1，必须跳过。

### Q2: VFS 表支持的最大文件大小？

理论上 rawOffset 最大为 0x7FFFFFFF，可支持约 8TB 数据。但实际受限于文件格式设计。

### Q3: 如何验证打包正确性？

1. 用 PDEView 打开生成的 .pde 文件
2. 检查目录结构是否完整
3. 导出几个文件验证大小和内容

---

## 附录：关键常量

```csharp
const uint BLOCK_SIZE = 0x1000;        // 4KB 块大小
const uint DATA_SEGMENT_SIZE = 0x400000;  // 4MB 数据段大小
const int ENTRY_SIZE = 0x80;           // 128 字节条目大小
const int ENTRIES_PER_SEGMENT = 1024;  // 每 segment 1024 个块
```

---

## 版本历史

- **v1.0** - 初始文档，基于 PDEPack 项目分析
