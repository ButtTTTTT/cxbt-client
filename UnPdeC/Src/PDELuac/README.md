# PDELuac

Lua 编译工具（GUI 版），将明文 Lua 脚本编译为 `.luac` 字节码。

## 功能特性

- 图形化界面，操作简单
- 将明文 `.lua` 编译为 `.luac` 字节码
- 可选添加 PDE 8 字节头部
- 批量编译支持
- 拖放操作支持

## 使用方法

1. 启动程序
2. 设置资源根目录
3. 拖入或选择 `.lua` 文件
4. 选择是否添加 PDE 头部
5. 点击编译

## 输入与输出

| 输入 | 输出 |
|------|------|
| `.lua` 明文脚本 | `.luac` 字节码 |

## PDE 头部选项

- **不添加头部**：标准 Lua 字节码
- **添加 PDE 头部**：8 字节魔数 + 大小信息，兼容 PDE 引擎

## 依赖

程序需要 `luac_dll.dll` 在同目录下，该 DLL 来自 [luacdll](../luacdll/) 项目。

## 编译要求

- .NET 8.0 SDK
- Visual Studio 2022

## 相关工具

- [luacdll](../luacdll/) - Lua 编译器库
- [unluac](../unluac/) - Lua 反编译器
