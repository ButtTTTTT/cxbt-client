# FastXOR

PDE 文件 XOR 解密工具，用于将加密的 `.pde` 文件转换为可解析的 `.xor` 文件。

## 功能特性

- 基于固定 PDEKEY 的 XOR 解密
- 支持单文件或整个目录处理
- 自动跳过已生成的 `.xor` 文件
- 显示总处理大小与进度条
- 8MB 缓冲区分块处理，高效快速

## 使用方法

```bash
# 处理单个文件
FastXOR.exe <file_path>

# 处理整个目录
FastXOR.exe <directory_path>
```

也可以将文件或目录直接拖拽到 `FastXOR.exe` 上执行。

## 输入与输出

| 输入 | 输出 |
|------|------|
| `xxx.pde` | `xxx.pde.xor` |
| 目录 | 递归处理目录内所有文件 |

`.xor` 文件会被自动跳过，避免重复处理。

## 处理流程

1. 生成 PDEKEY（0x1000 字节）
2. 计算所有待处理文件的总大小
3. 按 8MB 缓冲区分块 XOR 并写入输出文件
4. 实时显示整体进度

## 示例

```bash
# 处理单个 PDE 文件
FastXOR.exe D:\GameData\finalcombat.pde

# 处理整个目录
FastXOR.exe D:\GameData\
```

## 相关工具

- [UnPdeC](../UnPdeC/) - 解包 `.xor` 文件
- [PDEView](../PDEView/) - GUI 版本
