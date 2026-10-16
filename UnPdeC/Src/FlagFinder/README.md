# FlagFinder

二进制文件特征分析工具，用于快速识别文件类型和解压标志。

## 功能特性

- **Cache 模式**：分析 `.cache` 文件的 `0x18` 标志位和前 8 字节头部
- **Decompress 模式**：分析非 `.cache` 文件的前 8 字节头部
- 并行处理，自动按 CPU 核心数分批执行
- 输出统计结果和耗时

## 使用方法

```bash
FlagFinder.exe [目录路径]
```

不传参数时默认扫描当前目录。

## 模式说明

程序启动后提示选择模式：

### [1] Cache 模式

- 目标：扩展名为 `.cache` 的文件
- 分析内容：
  - 文件 `0x18` 偏移处 1 字节 flag
  - 文件前 8 字节头部
- 输出文件：
  - `<程序名>_Flag0x18.txt` - 按 flag 值分类的文件列表
  - `<程序名>_Head8Byte.txt` - 按扩展名分组的头部数据

### [2] Decompress 模式

- 目标：所有非 `.cache` 文件
- 自动排除根目录文件，仅处理子目录文件
- 分析内容：文件前 8 字节头部
- 输出文件：
  - `<程序名>_Head8Byte_Decomp.txt` - 按扩展名分组的头部和文件列表

## 输出说明

| 输出文件 | 内容 |
|----------|------|
| `_Flag0x18.txt` | 按 flag 值（6D/6E/6F）分类的文件路径 |
| `_Head8Byte.txt` | 按扩展名分组的唯一 8 字节头部 |
| `_Head8Byte_Decomp.txt` | 按扩展名分组的头部及对应文件列表 |

## 示例

```bash
# 分析 cache 目录
FlagFinder.exe D:\GameData\cache

# 分析解压后的目录
FlagFinder.exe D:\GameData\unpacked
```

## 应用场景

- 快速查找特定解压标志的文件
- 识别文件类型和魔数
- 分析资源文件格式

## 相关工具

- [UnCache](../UnCache/) - Cache 解压工具
- [UnPdeC](../UnPdeC/) - 批量解包工具
