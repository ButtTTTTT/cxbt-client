# VerifyCRC

缓存文件 CRC 校验工具，用于验证文件的完整性和路径正确性。

## 功能特性

- 计算路径哈希与文件内容哈希
- 与文件头中的 CRC 值进行比对
- 支持单文件或目录批量处理
- 交互模式与命令行模式

## 使用方法

### 命令行模式

```bash
VerifyCRC.exe <文件或目录> [更多路径...]
```

### 交互模式

```bash
VerifyCRC.exe
# 输入路径后回车，输入 q 或 Q 退出
```

> 程序需要放在缓存根目录中运行，以确保路径计算正确。

## 输出说明

| 字段 | 说明 |
|------|------|
| DIR | 由目录路径计算得到的哈希值 |
| PATH | 由完整路径计算得到的哈希值 |
| FILE | 文件头中记录的 CRC 值 |
| CALC | 根据文件内容计算得到的 CRC 值 |

## 校验逻辑

- 如果 `CALC` 与 `FILE` 匹配，说明文件内容正确
- 如果 `DIR` 或 `PATH` 与 `FILE` 匹配，说明文件位置正确
- 可用于判断文件是否属于当前目录

## 示例

```bash
# 校验单个文件
VerifyCRC.exe D:\GameData\mesh\scene\level1\scene.mesh.cache

# 校验目录
VerifyCRC.exe D:\GameData\mesh
```

## 注意事项

- 必须放在资源根目录运行
- 修改文件名或移动文件会导致 CRC 不匹配
- 可用于重新计算正确的 CRC 值

## 相关工具

- [UnCache](../UnCache/) - Cache 解压工具
- [ReCache](../../Release/Pack/) - 重新打包 Cache 文件
