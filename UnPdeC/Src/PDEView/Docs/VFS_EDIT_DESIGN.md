# VFS机制深度分析与编辑功能设计

## 一、VFS表核心机制

### 1.1 VFS表布局

PDE文件采用**分块存储**的VFS机制：

```
┌─────────────────────────────────────────┐
│  PDE文件结构                              │
├─────────────────────────────────────────┤
│  [0x00000000 - 0x00001000] VFS表块1      │ ← 4KB VFS表
│  [0x00001000 - 0x00401000] 数据区1       │ ← 4MB 数据
│  [0x00401000 - 0x00402000] VFS表块2      │ ← 4KB VFS表
│  [0x00402000 - 0x00802000] 数据区2       │ ← 4MB 数据
│  [0x00802000 - 0x00803000] VFS表块3      │ ← 4KB VFS表
│  [0x00803000 - 0x00C03000] 数据区3       │ ← 4MB 数据
│  ...                                     │
└─────────────────────────────────────────┘
```

### 1.2 偏移计算公式

#### 原始偏移 → 实际偏移
```csharp
ulong RealOffset = ((RawOffset >> 10) + RawOffset + 1) << 12;
```

**计算逻辑**：
1. `RawOffset >> 10`: 提取块编号
2. `+ RawOffset + 1`: 加上原始偏移和1
3. `<< 12`: 转换为字节偏移

**示例**：
- RawOffset = 0x00000000 → RealOffset = 0x00001000
- RawOffset = 0x00001000 → RealOffset = 0x00402000
- RawOffset = 0x00002000 → RealOffset = 0x00803000

#### 实际偏移 → 原始偏移
```csharp
ulong RawOffset = (RealOffset >> 12) * 1024 / 1025;
```

### 1.3 VFS表项结构

每个VFS表项占 **4字节**，用于链接数据块：

```csharp
struct VFSEntry {
    uint32_t NextBlockOffset;  // 下一个数据块的原始偏移
    // bit 31: 有效性标志 (0=有效, 1=无效)
    // bit 0-30: 偏移值
}
```

**VFS表项定位**：
```csharp
// 给定文件偏移，计算VFS表项的位置
ulong VFSTableOffset = ((FileOffset >> 10) * 0x1000) + ((FileOffset & 0x3FF) * 4);
```

## 二、文件/目录条目结构

### 2.1 条目布局 (128字节)

```
偏移    大小    说明
────────────────────────────────────
0x00    1       类型 (1=文件, 2=目录)
0x01    110     名称 (UTF-8字符串)
0x70    8       NTFS时间戳
0x78    4       原始偏移
0x7C    4       大小
```

### 2.2 目录解析机制

目录本身也是一个数据块，包含多个子条目：

```
目录数据块 (4KB)
├── 条目1 (128字节)
├── 条目2 (128字节)
├── 条目3 (128字节)
└── ... (最多32个条目)
```

## 三、编辑操作的核心挑战

### 3.1 添加文件

**挑战**：
1. 需要找到合适的空闲空间
2. 更新VFS表链接
3. 更新目录条目

**步骤**：
```
1. 分配数据块
   - 查找文件末尾
   - 计算新的VFS表位置
   
2. 写入文件数据
   - 按VFS块大小分割
   - 写入数据区
   
3. 构建VFS链表
   - 每个块的VFS表项指向下一块
   
4. 创建目录条目
   - 在父目录数据块中添加新条目
   - 如果目录已满，需要扩展目录
   
5. 更新父目录的VFS链表（如需要）
```

### 3.2 删除文件

**挑战**：
1. 标记空间为空闲（但不实际删除，保持偏移有效）
2. 更新目录条目（标记为无效）
3. 不破坏VFS链表

**步骤**：
```
1. 标记目录条目为无效
   - 类型字节改为 0
   
2. 可选：标记数据块为空闲
   - 在VFS表中标记无效位
   
3. 保持VFS链表完整
   - 不修改VFS表项，避免破坏其他文件
```

### 3.3 替换文件

**场景A：新文件大小 ≤ 原文件大小**
```
1. 直接覆盖原数据块
2. 更新文件大小
3. 保持VFS链表不变
```

**场景B：新文件大小 > 原文件大小**
```
1. 删除原文件
2. 添加新文件（可能在新位置）
3. 更新目录条目的偏移和大小
```

### 3.4 重命名文件

**最简单的操作**：
```
1. 修改目录条目中的名称字段
2. 确保不超过110字节限制
```

## 四、VFS写入关键函数设计

### 4.1 VFS表管理类

```csharp
public class VFSManager
{
    // 计算需要的数据块数量
    public uint CalculateBlockCount(uint fileSize);
    
    // 分配新的数据块
    public VFSAllocation AllocateBlocks(uint blockCount);
    
    // 写入VFS表项
    public void WriteVFSEntry(ulong vfsTableOffset, uint nextBlockOffset);
    
    // 构建VFS链表
    public void BuildVFSChain(ulong startOffset, uint fileSize);
    
    // 标记块为空闲
    public void MarkBlocksFree(ulong startOffset, uint size);
}

public struct VFSAllocation
{
    public ulong StartOffset;      // 起始偏移
    public ulong VfsTableOffset;   // VFS表偏移
    public uint BlockCount;        // 块数量
    public List<ulong> BlockOffsets; // 所有块的偏移列表
}
```

### 4.2 目录管理类

```csharp
public class DirectoryManager
{
    // 读取目录条目
    public List<PDEEntry> ReadDirectory(ulong offset, uint size);
    
    // 添加目录条目
    public bool AddEntry(ulong dirOffset, uint dirSize, PDEEntry newEntry);
    
    // 删除目录条目
    public bool RemoveEntry(ulong dirOffset, string entryName);
    
    // 更新目录条目
    public bool UpdateEntry(ulong dirOffset, string entryName, PDEEntry updatedEntry);
    
    // 检查目录是否有空间
    public bool HasSpace(ulong dirOffset, uint dirSize);
}
```

### 4.3 PDE写入器

```csharp
public class PDEWriter
{
    // 添加文件
    public bool AddFile(string path, byte[] data);
    
    // 删除文件
    public bool DeleteFile(string path);
    
    // 替换文件
    public bool ReplaceFile(string path, byte[] newData);
    
    // 重命名文件/目录
    public bool Rename(string oldPath, string newPath);
    
    // 保存修改
    public void Save(string outputPath);
}
```

## 五、关键算法

### 5.1 文件数据写入算法

```csharp
public void WriteFileData(ulong startOffset, byte[] data)
{
    uint blockSize = 0x1000;
    uint totalBlocks = (uint)((data.Length + blockSize - 1) / blockSize);
    
    for (int i = 0; i < totalBlocks; i++)
    {
        // 计算当前块的实际偏移
        ulong currentRealOffset = RawToRealOffset(currentRawOffset);
        
        // 写入数据块
        uint writeSize = (i == totalBlocks - 1) 
            ? (uint)(data.Length % blockSize) 
            : blockSize;
        if (writeSize == 0) writeSize = blockSize;
        
        Array.Copy(data, i * blockSize, 
                   _fileData, (long)currentRealOffset, 
                   writeSize);
        
        // 写入VFS表项（指向下一块）
        if (i < totalBlocks - 1)
        {
            ulong nextRawOffset = CalculateNextRawOffset(currentRawOffset);
            WriteVFSEntry(currentRawOffset, nextRawOffset);
        }
        
        currentRawOffset = nextRawOffset;
    }
}
```

### 5.2 VFS链表构建算法

```csharp
public void BuildVFSChain(ulong startRawOffset, uint fileSize)
{
    uint blockSize = 0x1000;
    uint blockCount = (fileSize + blockSize - 1) / blockSize;
    
    ulong currentOffset = startRawOffset;
    
    for (int i = 0; i < blockCount; i++)
    {
        // 计算VFS表项位置
        ulong vfsTableOffset = CalculateVFSTableOffset(currentOffset);
        
        // 计算下一块偏移
        if (i < blockCount - 1)
        {
            ulong nextOffset = currentOffset + blockSize;
            uint vfsValue = (uint)(nextOffset & 0x7FFFFFFF);
            WriteVFSValue(vfsTableOffset, vfsValue);
        }
        else
        {
            // 最后一块，标记结束
            WriteVFSValue(vfsTableOffset, 0x80000000);
        }
        
        currentOffset += blockSize;
    }
}
```

## 六、实现优先级

### 阶段1：基础编辑（简单）
1. ✅ 重命名 - 仅修改目录条目名称
2. ✅ 删除 - 标记目录条目为无效

### 阶段2：高级编辑（复杂）
3. ⏳ 替换文件（同等大小）- 直接覆盖数据
4. ⏳ 添加小文件 - 需要完整VFS支持

### 阶段3：完整编辑（最复杂）
5. ⏳ 替换文件（更大）- 需要重新分配
6. ⏳ 添加大文件 - 需要扩展VFS表
7. ⏳ 创建目录 - 需要分配目录数据块

## 七、注意事项

### 7.1 安全性
- 始终备份原文件
- 验证所有偏移计算
- 检查边界条件

### 7.2 性能优化
- 使用内存映射处理大文件
- 批量操作减少IO
- 缓存VFS表和目录结构

### 7.3 兼容性
- 保持与游戏客户端兼容
- 不破坏原有文件结构
- 支持增量更新
