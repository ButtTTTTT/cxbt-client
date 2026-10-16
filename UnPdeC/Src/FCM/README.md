# FCM

PDE 模型文件转换工具（控制台版），将 `.mesh/.skel/.anim` 文件转换为 Source Engine SMD 格式。

## 功能特性

- 解析 `.skel` 骨骼文件
- 解析 `.mesh` 网格文件
- 解析 `.anim` 动画文件
- 支持多个 mesh 合并为一个 smd
- 导出为 SMD 格式

## 使用方法

### 标准转换模式

```bash
FCM.exe <skel> <mesh1,mesh2...> <anim>
```

### 单文件调试模式

```bash
# 打印骨骼信息
FCM.exe xxx.skel

# 打印网格信息
FCM.exe xxx.mesh

# 打印动画信息
FCM.exe xxx.anim
```

### 无参模式

直接运行使用硬编码的测试路径（需修改源码配置）。

## 输入与输出

| 输入 | 输出 |
|------|------|
| `.skel` + `.mesh` | `.smd` 模型文件 |
| `.skel` + `.anim` | `_anim.smd` 动画文件 |

## 编译要求

- .NET 8.0 SDK
- Visual Studio 2022

## 注意事项

- 需要先配置测试路径或使用命令行参数
- 支持多个 mesh 文件用逗号分隔

## 相关工具

- [FCM2](../FCM2/) - GUI 版本
- [PDEModelTools](../PDEModelTools/) - Blender 插件
- [Noesis](https://www.richwhitehouse.com/index.php?content=inc_projects.php&showproject=91) - SMD 查看器

## 致谢

感谢 B站 [Crow_Lz](https://space.bilibili.com/358659452) 大佬提供矩阵逻辑。
