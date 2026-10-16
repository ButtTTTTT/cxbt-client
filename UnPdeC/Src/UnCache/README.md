# UnCache

`.cache` 文件单独解压工具，用于处理从 PDE 中导出的缓存文件。

## 功能特性

- 读取 `.cache` 文件并解析解压标志
- 根据标志规则执行解压或直接提取
- 自动检测并剥离依赖信息块（dependence info）
- 自动生成输出文件名
- **保留解压后的前 8 字节**（与 UnPdeC 不同）

## 使用方法

```bash
UnCache.exe <input_file.cache>
```

也可以将 `.cache` 文件的打开方式设置为 `UnCache.exe`，双击即可解压。

> 如遇到选择多个文件后右键没有"打开"选项，可使用 `Release/FixRightClickLimit.reg` 修复。

## 输入与输出

| 输入 | 输出 |
|------|------|
| `xxx.lua.cache` | `xxx.luac` |
| `xxx.dds.cache` | `xxx.dds` |
| 其他 `.cache` 文件 | 去掉 `.cache` 后缀 |

## 解压标志处理

程序读取文件 `0x18` 偏移处的标志：

| 标志 | 处理方式 | 数据起始 |
|------|----------|----------|
| `0x6D` | 解压，大小在 `0x1A` | `0x1B` |
| `0x6E` | 直接提取，跳过 `0x29` 字节 | `0x21` |
| `0x6F` | 解压，大小在 `0x1D` | `0x21` |

仅当标志低位为 1 时执行解压。

## 示例

```bash
UnCache.exe D:\GameData\scene.lua.cache
```

## 依赖信息处理

`.cache` 文件头 `0x08` 偏移处为 `dep_count`（依赖数量）：

- **`dep_count == 0`**（无依赖）：文件头固定 0x18 字节，LZ 数据从 `0x18` 开始。原版 VFS 中的 cache 文件均为此格式。
- **`dep_count > 0`**（有依赖）：`0x0C` 处紧跟依赖信息块，每个依赖项格式为：
  - `uint32` 路径长度
  - `char[]` 路径字符串（无 null 终止符）
  - `uint32` FILETIME 低 32 位
  - `uint32` FILETIME 高 32 位
  - 依赖块之后才是 data_size + crc + compressed + LZ 数据

程序会自动检测 `dep_count > 0` 的情况，打印依赖路径列表，剥离整个依赖块后将文件转换为无依赖格式，再按正常流程解压。

> 有依赖的 cache 文件仅出现在非 Master 构建的客户端生成的缓存中（`-dependence` 默认开启）。

## 注意事项

- 解压后的文件保留前 8 字节头部
- 如需预览 DDS 等文件，需手动删除前 8 字节

## 相关工具

- [UnPdeC](../UnPdeC/) - 批量解包工具
- [VerifyCRC](../VerifyCRC/) - CRC 校验工具
