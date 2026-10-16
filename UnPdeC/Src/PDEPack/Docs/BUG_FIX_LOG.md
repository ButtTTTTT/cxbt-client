# PDEPack Bug 修复日志

## Bug #1: VFS 表块被数据覆盖

### 发现时间
2026-02-20

### 问题描述
打包生成的 `.pde` 文件，当文件跨越 segment 边界（rawOffset >= 1024）时，VFS 表块 #1 及后续 VFS 表块被错误数据覆盖，导致解包时后半段文件读取失败。

### 问题现象
```
原始 PDE VFS 表块 #1:
  01 04 00 80 02 04 00 80 03 04 00 80 ... (正确的 VFS 值)

生成的 PDE VFS 表块 #1:
  FF 01 31 7D FF 2B 6B B1 FF 49 8C CD ... (错误的数据)
```

### 根本原因

`WriteEntryData` 函数原本采用**连续写入**方式：

```csharp
// 错误的做法 ❌
ulong realOffset = RawToRealOffset(entry.Offset);  // 只计算第一个块的偏移
Array.Copy(alignedData, 0, fileData, (long)realOffset, alignedSize);  // 连续写入所有块
```

问题在于 `rawOffset` 到 `realOffset` 的映射在 segment 边界处**不连续**：

```
rawOffset=1023 → realOffset=0x400000  (数据段 #0 最后一个块)
                  ↓
           0x401000-0x402000 = VFS 表块 #1 (空洞!)
                  ↓
rawOffset=1024 → realOffset=0x402000  (数据段 #1 第一个块)
```

当一个文件跨越边界（如 `skinc_smallmap_level14.tga.cache` 占用 rawOffset 1016-1058），连续写入会覆盖中间的 VFS 表块！

### 修复方案

改为**逐块写入**，每个块单独计算其 `realOffset`：

```csharp
// 正确的做法 ✓
for (uint i = 0; i < blocks; i++)
{
    uint currentRawOffset = entry.Offset + i;
    ulong realOffset = RawToRealOffset(currentRawOffset);  // 每块单独计算
    
    byte[] blockData = PrepareBlock(data, i);
    PDEKey.XorData(blockData, realOffset);  // 使用正确的偏移加密
    Array.Copy(blockData, 0, fileData, (long)realOffset, BLOCK_SIZE);
}
```

### 验证方法

```python
# 检查生成的文件中 VFS 表块 #1 是否正确
import struct

with open('output.pde', 'rb') as f:
    data = f.read()

vfs1_offset = 0x401000
for i in range(16):
    val = struct.unpack('<I', data[vfs1_offset + i*4 : vfs1_offset + i*4 + 4])[0]
    print(f'VFS[{1024+i}] = 0x{val:08X}')
```

期望输出：
```
VFS[1024] = 0x80000401
VFS[1025] = 0x80000402
VFS[1026] = 0x80000403
...
```

---

## 相关发现：合并 VFS 表的模式

### 观察

用户发现，将所有 VFS 表块合并后（去除数据段），VFS 值呈现规律性变化：

```
偏移 0x00000-0x40000: VFS 低字节 = 0x00 (00000080, 00000180...)
偏移 0x40000-0x80000: VFS 低字节 = 0x01 (00000180, 00000280...)
偏移 0x80000-0xC0000: VFS 低字节 = 0x02 (00000280, 00000380...)
```

### 解释

这不是 segment 索引，而是 `rawOffset` 的 **bit 16 进位**：

```python
# rawOffset = 65535 时
vfs_value = 0x80000000 | 65535  # = 0x8000FFFF
# 小端序: FF FF 00 80

# rawOffset = 65536 时  
vfs_value = 0x80000000 | 65536  # = 0x80010000
# 小端序: 00 00 01 80  ← 第三字节从 00 变成 01
```

每 65536 (0x10000) 个块，`rawOffset` 的 bit 16 进位，在小端序显示时表现为"低字节"变化。

---

## 教训总结

1. **不要假设偏移连续**：VFS 文件格式的偏移映射可能有空洞
2. **逐块处理更安全**：对于复杂映射，逐块计算比批量操作更可靠
3. **加密偏移要正确**：每个数据块的加密偏移必须是其真实的文件偏移
