# FCM2

PDE 模型文件转换工具（GUI 版），将 `.mesh/.skel/.anim` 文件转换为 Source Engine SMD 格式。

## 功能特性

- 图形化界面，操作简单
- 解析 `.skel` 骨骼文件
- 解析 `.mesh` 网格文件
- 解析 `.anim` 动画文件
- 支持多个 mesh 合并
- 导出为 SMD 格式
- 拖放操作支持

## 使用方法

1. 启动程序
2. 拖入或选择文件：
   - `.skel` 文件（必需）
   - `.mesh` 文件（可选，支持多个）
   - `.anim` 文件（可选）
3. 点击导出生成 SMD 文件

## 输入与输出

| 输入 | 输出 |
|------|------|
| `.skel` + `.mesh` | `.smd` 模型文件 |
| `.skel` + `.anim` | `_anim.smd` 动画文件 |

## 编译要求

- .NET 8.0 SDK
- Visual Studio 2022

## 查看工具

- [Noesis](https://www.richwhitehouse.com/index.php?content=inc_projects.php&showproject=91) - 3D 资源查看器，支持 SMD 格式

## 相关工具

- [FCM](../FCM/) - 控制台版本
- [PDEModelTools](../PDEModelTools/) - Blender 插件

## 致谢

感谢 B站 [Crow_Lz](https://space.bilibili.com/358659452) 大佬提供矩阵逻辑。
