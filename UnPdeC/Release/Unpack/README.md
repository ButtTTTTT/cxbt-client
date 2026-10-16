# 解包工具

用于解包 PDE 资源文件的工具集合。

## 工具列表

| 工具 | 类型 | 功能 |
|------|------|------|
| FastXOR.exe | 控制台 | 将 `.pde` 文件 XOR 解密为 `.xor` 文件 |
| UnPdeC.exe | 控制台 | 解包 `.xor` 文件，导出所有资源 |
| PDEView.exe | GUI | 可视化浏览和导出 `.pde` 文件 |
| UnCache.exe | 控制台 | 单独解压 `.cache` 文件 |

## 使用流程

### 方式一：命令行（推荐）

```bash
# 1. XOR 解密
FastXOR.exe finalcombat.pde
# 生成 finalcombat.pde.xor

# 2. 解包
UnPdeC.exe
# 选择解压模式后导出资源
```

### 方式二：GUI

```bash
# 直接打开 PDEView.exe
# 拖入或打开 .pde 文件
# 浏览并导出需要的资源
```

### 单独解压 Cache

```bash
# 将 .cache 文件关联到 UnCache.exe
# 双击即可解压
UnCache.exe xxx.dds.cache
```

## 辅助工具

| 文件 | 功能 |
|------|------|
| FixRightClickLimit.reg | 解除 Windows 多选文件后右键无"打开"选项的限制 |

## 相关目录

- [打包工具](../Pack/) - 重新打包资源
- [分析工具](../Analysis/) - 分析资源格式
