# 模型工具

用于处理 PDE 引擎模型文件的工具集合。

## 工具列表

| 工具 | 类型 | 功能 |
|------|------|------|
| FCM2.exe | GUI | 将 `.mesh/.skel/.anim` 转换为 `.smd` 格式 |
| pde_model_tools | Blender 插件 | 将模型文件导入 Blender |

## FCM2

将 PDE 模型文件转换为 SMD 格式，可用 Noesis 等工具查看。

### 支持格式

| 输入 | 输出 |
|------|------|
| `.mesh` | `.smd` |
| `.skel` | `.smd` |
| `.anim` | `.smd` |

### 使用方法

1. 启动程序
2. 选择要转换的文件
3. 导出 SMD 格式

### 查看工具

- [Noesis](https://www.richwhitehouse.com/index.php?content=inc_projects.php&showproject=91) - 3D 资源查看器

## PDE Model Tools

Blender 插件，直接导入模型文件进行编辑。

### 功能

- 导入 `.mesh` 模型
- 导入 `.skel` 骨骼（实验性）
- 导入 `.anim` 动画（实验性）
- 自动加载贴图

### 要求

- Blender 4.5+

### 获取最新版

最新版本请前往 `\Src\PDEModelTools\` 自行编译。

## 相关目录

- [解包工具](../Unpack/) - 解包模型文件
- [分析工具](../Analysis/) - 分析模型格式
