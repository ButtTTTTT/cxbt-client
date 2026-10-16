# UnPdeC

PDE 资源文件核心解包工具，用于解析 `.xor` 文件并导出其中的所有资源。

## 功能特性

- 自动扫描当前目录下所有 `.xor` 文件并批量处理
- 解析内部虚拟文件系统（VFS），递归导出目录和文件
- 对 `.cache` 文件执行二次解压和头部裁剪
- 支持多种解压模式，灵活控制是否保留前 8 字节头部
- 可选记录块访问信息并导出为 `BlockTracker.json`

## 使用方法

```bash
UnPdeC.exe
```

程序启动后会自动扫描当前目录的 `.xor` 文件。

### 操作流程

1. **选择缓存模式**
   - `Y`：启用缓存模式，只导出 `.cache` 文件本身（不二次解压）
   - `N`：禁用缓存模式（推荐），对 `.cache` 文件进行二次解压

2. **选择解压模式**（禁用缓存时）
   - `A`：删除全部导出文件的前 8 字节
   - `B`：保留全部导出文件的前 8 字节
   - `C`：混合模式（推荐），仅对 `.mesh/.skel/.anim/.physx` 保留前 8 字节

## 输入与输出

| 项目 | 说明 |
|------|------|
| 输入 | `.xor` 文件（由 FastXOR 生成） |
| 输出目录 | `<文件名>_nocache_<模式>` 或 `<文件名>_cache_<模式>` |

## 模块说明

| 模块 | 功能 |
|------|------|
| `Main.cpp` | 程序入口，扫描文件并调度解包流程 |
| `GV.h/cpp` | 全局运行时上下文定义 |
| `Tools.h/cpp` | 工具函数：文件查找、目录初始化、模式选择 |
| `MemoryMapper.h/cpp` | 内存映射封装，按系统粒度读取文件 |
| `VFSTable.h/cpp` | VFS 表解析 |
| `RecursiveMode.h/cpp` | 递归解包入口 |
| `RecursiveHelpers.h/cpp` | 递归辅助：偏移计算、条目分发 |
| `Extract.h/cpp` | LZ 类变长编码解压算法 |
| `Types.h/cpp` | 公共类型定义 |
| `Tracking.h/cpp` | 块访问追踪，导出 JSON |
| `UI.h/cpp` | 控制台 UI 辅助 |
| `Logger.h/cpp` | 日志模块 |

## 编译环境

- 平台：Windows x64
- 语言标准：C++20
- 依赖：`lib/nlohmann/json.hpp`

## 注意事项

- 程序依赖 Windows 平台的内存映射和控制台 API
- 建议在包含 `.xor` 文件的目录中直接运行
- 解包得到的文件可能需要配合其他工具进一步处理

## 相关工具

- [FastXOR](../FastXOR/) - 生成 `.xor` 文件
- [UnCache](../UnCache/) - 单独解压 `.cache` 文件
- [PDEView](../PDEView/) - GUI 版本
