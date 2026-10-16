# VfsTableDumper

VFS 表导出工具，用于从 `.xor` 文件中提取并合并完整的虚拟文件系统表。

## 功能特性

- 按 PDE 文件结构读取 VFS 表区块
- 生成偏移记录和合并后的表数据
- 支持批量处理多个文件
- 便于后续分析和调试

## 使用方法

```bash
# 处理指定文件
VfsTableDumper.exe <file1.xor> [file2.xor ...]

# 处理当前目录所有 .xor 文件
VfsTableDumper.exe
```

也可以将 `.xor` 文件拖拽到程序上执行。

## 输出文件

| 输出文件 | 说明 |
|----------|------|
| `<原名>-vto.txt` | 每个 VFS 表的起始偏移（十六进制） |
| `<原名>-vt.hex` | 合并后的完整 VFS 表数据 |

## PDE 文件结构

PDE 文件采用表-内容交替的结构：

```
[
    { 表: [0x1000字节], 内容: [0x400000字节] },
    { 表: [0x1000字节], 内容: [0x400000字节] },
    ...
]
```

本工具将分散的表数据合并为连续的表文件，便于分析。

## 示例

```bash
# 导出单个文件的 VFS 表
VfsTableDumper.exe finalcombat.xor

# 导出当前目录所有文件的 VFS 表
VfsTableDumper.exe
```

## 应用场景

- 分析 PDE 文件内部结构
- 调试解包逻辑
- 研究文件存储布局

## 相关工具

- [UnPdeC](../UnPdeC/) - 解包工具
- [FastXOR](../FastXOR/) - XOR 解密工具
