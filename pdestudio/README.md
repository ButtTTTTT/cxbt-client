# PDE Studio

Blender PDE引擎模型导入导出插件 — 在 Blender 中导入/导出 PDE 引擎的模型、骨骼和动画资源。

## 功能

### 导出
- **.mesh 导出** — 静态/蒙皮网格，支持多材质、多UV集、切线/副法线、顶点色
- **.skel 导出** — 骨骼层级，自动位置缩放(米→游戏单位)
- **.anim 导出** — 骨骼动画(96fps逐帧采样)，支持关键帧采样模式
- **编译脚本生成** — 自动生成 `cache_xxx.lua` 和 `gen_xxx.lua` 供 client.exe 编译

### 导入
- **.mesh.cache / .mesh 导入** — 从原版二进制格式导入静态/蒙皮网格
- **.skel.cache 导入** — 从原版二进制格式导入骨骼
- **.anim.cache 导入** — 从原版二进制格式导入动画
- **.cache 解码** — 自动检测 `.cache` 格式，解包 Resource 头 + CRC32 校验 + LZ-hash 解压
- **材质信息** — 完整解析 Shader 名称、Uniform 参数和贴图路径（ColorMap/DrMap/SrMap/UVMap）

## 安装

1. 运行 `src/Build.bat` 生成 `.zip` 扩展包
2. Blender → 编辑 → 设置 → 扩展 → 从磁盘安装 → 选择生成的 `.zip`

## 使用

1. 在 3D 视图侧栏找到 **PDE Studio** 面板（导出）和 **PDE Import** 面板（导入）
2. 导出：设置导出目录，选择导出类型和选项，点击导出
3. 导入：选择 `.cache` 或 `.mesh` 文件，点击导入

## 文档

所有文档位于 `docs/` 目录：

| 文档 | 说明 |
|------|------|
| [format_reference.md](docs/format_reference.md) | PDE 引擎二进制/文本格式速查 |
| [engine_verification.md](docs/engine_verification.md) | 引擎源码验证记录（已验证结论） |
| [diff_pde_maya_blender.md](docs/diff_pde_maya_blender.md) | PDE/Maya/Blender 数据差异与踩坑 |
| [physx_collision.md](docs/physx_collision.md) | PhysX 碰撞问题分析 |
| [bugs_and_fixes.md](docs/bugs_and_fixes.md) | 已解决 Bug 记录 |
| [export_analysis.md](docs/export_analysis.md) | 导出功能综合分析报告 |
| [TODO.md](docs/TODO.md) | 待办事项 |

## PDE 引擎资源格式要点

### 单位系统
- **PDE 游戏单位 = 米**（从重力加速度 -9.8×2 m/s² 确认）
- **Maya 中使用厘米**（导出时 ×0.01 转换为游戏单位）
- **Blender 默认使用米**（与 PDE 游戏单位 1:1 对应）
- **导入缩放因子默认 1.0**（保持原尺寸，无需转换）

### 材质处理
- **ColorMap** → 连接到 BSDF Base Color（主贴图）
- **LightMap** → 创建贴图节点但不连接（导出时保留路径信息）
- **DrMap/SrMap** → 连接到 Roughness/Metallic
- **NormalMap** → 通过 Normal Map 节点连接到 Normal
- **贴图节点排序**：ColorMap 优先排在第一位，确保 SOLID 模式正确显示

### .cache 文件格式
- 所有 `.cache` 文件包含 `Resource` 头（类型标识、版本、依赖项、CRC32、压缩标志）
- CRC32 密钥: `CalculateCrcValue("crc_key")` = `0xC4999A60`（使用自定义查找表 `LookupTable.cpp`，非标准 CRC32）
- 压缩算法: 自定义 LZ-hash（`utilities.cpp`），非标准 zlib
- 解压后数据 = `LoadData()` 的二进制输入流

### .mesh 二进制格式
- PDE Face = 一个三角形（`FaceVertexCount=3`, `FaceTriangleCount=1`, `FaceTriangles=[0,1,2]`）
- **StreamStatic (52B/顶点)**: `Vector3(12) + half4 normal(8) + half4 tangent(8) + half4 binormal(8) + half2 uv0(4) + half2 uv1(4) + half2 uv2(4) + ARGB color(4)`
- **StreamSkin (64B/顶点)**: `Vector3(12) + half4 normal(8) + half4 tangent(8) + half4 binormal(8) + BYTE[4] blendindices(4) + Vector4 blendweight(16) + half2 uv0(4) + half2 uv1(4)`
- 索引使用 **U32**（4字节），非 U16
- 坐标缩放：Blender 米 → PDE 游戏单位（1:1，PDE 游戏单位 = 米）
- 参考：`tc/client/render/MeshResource.cpp`、`tc/client/render/VertexDeclaration.h`

## 支持版本

- Blender 5.1.2+

## 许可证

GPL-3.0-or-later
