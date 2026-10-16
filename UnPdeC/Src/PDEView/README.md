# PDEView

单纯的PDE文件可视化浏览/导出器，基于 WPF 的 GUI 应用程序。

## 功能特性

### 文件浏览

- 打开 `.pde` 和 `.xor` 文件
- 树形结构显示文件目录
- 显示文件详细信息（名称、大小、类型、修改时间、偏移等）
- 支持不同类型文件的图标显示

### 文件导出

- 单文件导出
- 批量导出所有文件
- 自动解压缩（`.cache` 和 `.lua` 文件）
- 保持目录结构

### 界面

- Material Design 风格 UI
- 响应式布局
- 状态栏显示操作状态
- 文件详细信息面板

## 使用方法

1. 启动程序
2. 点击"打开"按钮选择 `.pde` 或 `.xor` 文件
3. 浏览文件树结构
4. 选择文件查看详细信息
5. 使用"导出"或"全部导出"功能保存文件

## 编译要求

- .NET 8.0 SDK
- Windows 操作系统
- Visual Studio 2022 或 JetBrains Rider

## 编译方法

```bash
cd PDEView
dotnet build -c Release
```

## 技术架构

### 核心模块

| 模块 | 功能 |
|------|------|
| `PDEKey.cs` | PDE 文件 XOR 密钥生成器 |
| `PDETypes.cs` | 数据类型定义 |
| `PDELoader.cs` | PDE 文件加载和解析 |
| `Decompressor.cs` | LZ77 解压缩算法 |
| `MainViewModel.cs` | 主窗口视图模型 |

### PDE 文件格式

```
PDE 文件
├── XOR 加密层 (PDEKEY)
├── VFS 表
│   ├── VFS 块 1 (4KB)
│   ├── 数据块 1 (4MB)
│   └── ...
└── 文件/目录条目
    ├── 类型 (1字节)
    ├── 名称 (最多111字节)
    ├── 时间戳 (8字节)
    ├── 偏移 (4字节)
    └── 大小 (4字节)
```

## 相关工具

- [UnPdeC](../UnPdeC/) - 控制台解包工具
- [FastXOR](../FastXOR/) - XOR 解密工具
