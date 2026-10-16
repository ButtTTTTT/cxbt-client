# Unpde - 即将被淘汰

UnPdeC 的 C# 版本，用于解包 PDE 资源文件。

## 简介

本项目是 UnPdeC 的 C# 实现，使用 AI 将 C++ 代码转换而来，功能与原版基本一致。

## 编译要求

- Windows 10/11
- Visual Studio 2022（选择 .NET 桌面开发）
- .NET 8.0 SDK

## 编译方法

1. 打开解决方案
2. 右键管理 NuGet 包，下载 `Newtonsoft.Json v13.0.3`
3. Build 项目

编译后生成目录：`Unpde\bin\x86\Debug\net8.0`

## 使用方法

1. 将 `.pde` 文件放置到编译输出目录
2. 运行程序
3. 解密结果将输出到 `Unpde` 子目录

## 功能特性

- 解析 `.pde` 文件
- XOR 解密
- VFS 表解析
- 递归导出文件
- 二次解密（6D/6E/6F 标志）
- 偏移值日志导出

## 支持的版本

- FC 1.0.1.9920
- FC 1.0.6.7960
- 理论上支持任意版本的 PDE 数据

## 相关项目

- [UnPdeC](../UnPdeC/) - C++ 原版
- [UnPdeGo](../UnPdeGo/) - Go 版本

## 下载

- [百度网盘](https://pan.baidu.com/s/1MkWH6L6bsx3PJQWJuslwKw?pwd=fcfc)
- [OneDrive](https://1drv.ms/f/s!AhZa6xQIJXNNjUoVv3AFIUxeb-Ck?e=6N12WI)
- [123 云盘](https://www.123pan.com/s/b5Y0Vv-rN4J3.html)

## 运行时

运行本程序需要 [.NET 8.0 运行时](https://dotnet.microsoft.com/zh-cn/download/dotnet/8.0)。
