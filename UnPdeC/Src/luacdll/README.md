# luacdll

Lua 5.2 编译器动态库，用于将明文 Lua 脚本编译为字节码。

## 简介

本项目基于 Lua 5.2-alpha 版本源码编译，提供：

- `luac.exe` - 命令行编译器
- `luac_dll.dll` - 动态链接库

## 源码来源

```
https://github.com/lua/lua/tree/193ce46970dda16e129ebb28cae085ecf469d702
```

## 功能特性

- 将明文 `.lua` 文件编译为 `.luac` 字节码
- 支持作为动态库被其他程序调用
- 兼容 PDE 引擎的 Lua 格式

## 使用方法

### 命令行

```bash
luac.exe -o output.luac input.lua
```

### 动态库调用

`luac_dll.dll` 可被 C# 等程序调用，用于 GUI 工具集成。

## 相关工具

- [PDELuac](../../Release/Lua/) - GUI 版本 Lua 编译器
- [unluac](../unluac/) - Lua 反编译器
