# 分析工具

用于分析 PDE 资源文件格式和校验数据完整性的工具集合。

## 工具列表

| 工具 | 类型 | 功能 |
|------|------|------|
| FlagFinder.exe | 控制台 | 分析文件特征（6D/6E/6F 标志等） |
| VerifyCRC.exe | 控制台 | 计算和校验 CRC 值 |
| VfsTableDumper.exe | 控制台 | 导出完整 VFS 表 |

## FlagFinder

分析文件特征，快速识别文件类型和解压标志。

### 功能

- **Cache 模式**：分析 `.cache` 文件的 `0x18` 标志位
- **Decompress 模式**：分析非 `.cache` 文件的前 8 字节头部

### 使用方法

```bash
FlagFinder.exe <目录路径>
```

### 输出文件

| 文件 | 内容 |
|------|------|
| `_Flag0x18.txt` | 按 flag 值分类的文件列表 |
| `_Head8Byte.txt` | 按扩展名分组的头部数据 |

## VerifyCRC

校验文件的 CRC 值，验证完整性和路径正确性。

### 使用方法

```bash
# 命令行模式
VerifyCRC.exe <文件或目录>

# 交互模式
VerifyCRC.exe
# 输入路径，q 退出
```

> 必须放在资源根目录运行

### 输出说明

| 字段 | 说明 |
|------|------|
| DIR | 目录路径哈希 |
| PATH | 完整路径哈希 |
| FILE | 文件头中的 CRC |
| CALC | 计算得到的 CRC |

## VfsTableDumper

从 `.xor` 文件中导出完整的 VFS 表。

### 使用方法

```bash
# 处理指定文件
VfsTableDumper.exe <file.xor>

# 处理当前目录所有 .xor 文件
VfsTableDumper.exe
```

### 输出文件

| 文件 | 说明 |
|------|------|
| `<原名>-vto.txt` | VFS 表起始偏移 |
| `<原名>-vt.hex` | 合并后的 VFS 表数据 |

## 相关目录

- [解包工具](../Unpack/) - 解包资源
- [打包工具](../Pack/) - 重新打包
