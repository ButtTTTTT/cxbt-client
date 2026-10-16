# Lua 工具

用于处理 PDE 引擎 Lua 脚本文件的工具集合。

## 工具列表

| 工具 | 类型 | 功能 |
|------|------|------|
| unluac.exe | 控制台 | 将 `.luac` 反编译为明文 Lua |
| unluac.jar | 控制台 | java版 ，将 `.luac` 反编译为明文 Lua |
| luac.exe | 控制台 | 将明文 Lua 编译为 `.luac` |
| luac_dll.dll | 动态库 | Lua 编译器库 |
| PDELuac.exe | GUI | 图形化 Lua 编译器 |

## unluac

将 Lua 字节码反编译为明文脚本。

### 使用方法

```bash
# 命令行
unluac.exe input.luac > output.lua

# 或设置文件关联
# 将 .luac 文件关联到 unluac.exe
# 双击即可生成 .luac.lua 文件
```

### 注意事项

- 如果输出有乱码，使用 GB2312 编码打开

## luac / luac_dll

将明文 Lua 编译为字节码。

### 命令行

```bash
luac.exe -o output.luac input.lua
```

### GUI (PDELuac)

1. 启动程序
2. 选择 Lua 文件

    文件及后缀应该为 luaname.lua ,
    不能是 luaname.luac.lua或其他后缀名，
    因为这个名字和路径会被记录到新luac文件中！

3. 选择是否添加 8 字节头
4. 编译生成 `.luac` 文件

> PDELuac 需要 `luac_dll.dll`

## 辅助工具

| 文件 | 功能 |
|------|------|
| FixRightClickLimit.reg | 解除 Windows 多选文件后右键无"打开"选项的限制 |

## 相关目录

- [解包工具](../Unpack/) - 解包 Lua 文件
- [分析工具](../Analysis/) - 分析文件格式
