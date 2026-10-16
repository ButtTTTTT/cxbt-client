# PDE Model Tools (PMT)

Blender 插件，用于将 PDE 引擎的模型文件导入 Blender 进行预览和编辑。

## 功能特性

- 导入 `.mesh` 模型文件
- 导入 `.skel` 骨骼文件
- 导入 `.anim` 动画文件
- 自动加载贴图（需设置资源根目录）
- 支持 Blender 4.5+ - 5.1.0

## 支持状态

### MAP 地图 / PROP 道具

| 功能 | 状态 |
|------|------|
| 顶点 | ✅ |
| 面 | ✅ |
| UV | ✅ |
| 法线 | ✅ |
| 自动加载贴图 | ✅ |

### Weapon / Character 武器和人物

| 功能 | 状态 |
|------|------|
| 顶点 | ✅ |
| 面 | ✅ |
| UV | ✅ |
| 法线 | ✅ |
| 骨骼索引 | ✅ |
| 骨骼权重 | ✅ |
| 自动加载贴图 | ✅ |

### SKEL 骨骼 / ANIM 动画

| 功能 | 状态 |
|------|------|
| 数据识别 | ✅ |

## 安装方法

### 方式一：编译安装

1. 修改 `Build.bat` 中的 Blender 路径
2. 运行 `Build.bat` 生成插件
3. 在 Blender 中安装生成的 `.zip` 文件

### 方式二：直接安装

将 `src` 目录打包为 zip，在 Blender 中安装。

## 使用方法

1. 打开 Blender 4.5+
2. 进入 `视图3D -> 侧边栏 -> UI -> PMT`
3. 设置资源根目录（用于自动加载贴图）
4. 选择要导入的文件

## 调试开发

### VSCode 插件

推荐使用 [Blender Development](https://marketplace.visualstudio.com/items?itemName=JacquesLucke.blender-development) 插件：

1. 用 VSCode 打开项目
2. 按 `F1`，输入 `Blender: Build and Start`
3. 选择 Blender.exe 路径
4. 开始调试

### Blender 插件

[Addon Reloader](https://github.com/0xletleon/AddonReloader) - 快速重新加载插件，无需手动禁用/启用。

### Python 类型提示

安装 fake-bpy-module 解决 bpy 报错：

```bash
# 进入 Blender 的 Python 目录
cd D:\Apps\Blender\4.5\4.5\python\bin

# 安装类型提示
python.exe -m pip install fake-bpy-module-latest
```

## 文件格式说明

### .mesh

- 存在两种不同长度的头部数据
- 人物模型中 HEAD 骨骼名称为骨骼索引列表
- 每个变体数据包含骨骼权重

### .skel

- 类似骨骼对象列表
- 数据经过二次处理，分析中

### .anim

- 相对简单，重点在 .mesh 和 .skel

## 参考

- UV 和法线参考了 [MeGaMooNie](https://gamebanana.com/members/2429651) 的 [Noesis 脚本](https://gamebanana.com/tools/18783)

## 客户端资源

- [FC 历史客户端 - 123网盘](https://www.123684.com/s/b5Y0Vv-rN4J3)
- [FC 历史客户端 - 备用链接](https://www.123pan.com/s/b5Y0Vv-rN4J3)

## 相关工具

- [FCM2](../../Release/Model/) - 转换为 SMD 格式
- [Noesis](https://www.richwhitehouse.com/index.php?content=inc_projects.php&showproject=91) - 3D 资源查看器
