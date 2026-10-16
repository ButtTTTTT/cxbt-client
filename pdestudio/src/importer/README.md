# PDE Studio Importer

从原版 PDE 引擎 `.cache` 二进制文件导入 mesh / skeleton / animation 到 Blender。

## 目录结构

```
importer/
├── common.py              共用函数 (load_and_decode, resolve_vfs_file)
├── coordinate.py          坐标系转换 (PDE Y-up ↔ Blender Z-up)
│
├── binary/                二进制解析子包
│   ├── crc32.py            PDE 自定义 CRC32 算法
│   ├── cache_decoder.py   .cache 文件解码 (LZ 解压 + CRC 校验)
│   ├── mesh.py             Mesh 二进制解析
│   ├── skeleton.py         Skeleton 二进制解析
│   └── animation.py        Animation 二进制解析
│
├── core/                 核心转换子包 (二进制数据 → Blender 对象)
│   ├── mesh_builder.py     Mesh → Blender Mesh
│   ├── skeleton_builder.py Skeleton → Blender Armature
│   ├── animation_builder.py Animation → Blender Action
│   └── material.py         PDE 材质 → Blender Material
│
├── diagnostics.py         骨骼/网格/动画诊断
│
├── manual/                手动导入 (逐个选择文件)
│   ├── __init__.py         桶文件
│   ├── operators.py        ImportMesh / ImportSkel / ImportAnim / Diagnostics
│   ├── panels.py           "PDE Import" N 面板
│   ├── vfs_helpers.py      VFS 路径推导
│   └── skeleton_auto.py   蒙皮网格自动骨骼推导+导入
│
├── utils/                 工具
│   └── cleanup.py          清理未使用数据 (清除悬空引用 + orphans_purge)
│
├── characters/             角色导入 (JSON 索引 + 批量导入)
│   ├── __init__.py          桶文件
│   ├── constants.py         角色分类 + 显示名 + 动画类型路径映射
│   ├── scanner.py           扫描 character 目录 → character.json
│   ├── lua_parser.py        Lua 配置解析 (SetMesh / DetachablePartInfo)
│   ├── enum_callbacks.py    Blender EnumProperty 动态回调
│   ├── operators.py         ScanCharacters / ImportCharacterTP
│   ├── importer.py          导入主流程 (骨骼 + FP/TP 模型)
│   ├── part_importer.py     可拆卸部件导入 (骨骼 + mesh + 路径修正)
│   ├── accessory_operators.py  配饰独立导入 (Hat/Chest/Medal)
│   ├── accessory_panel.py   配饰折叠面板 (3个独立折叠)
│   ├── anim_list.py         动画列表 PropertyGroup + UIList
│   ├── anim_operators.py    动画列表刷新/全选/导入操作符
│   ├── anim_panel.py        动画导入折叠面板
│   └── panel.py             "PDE Character" N 面板
│
├── weapons/               武器导入 (JSON 索引 + 批量导入)
│   ├── __init__.py          桶文件
│   ├── scanner.py           扫描 weapon 目录 → weapon.json
│   ├── lua_parser.py        Lua 配置解析
│   ├── enum_callbacks.py    Blender EnumProperty 动态回调
│   ├── operators.py         ScanWeapons / ImportWeapon
│   ├── importer.py          武器导入主流程
│   ├── weapon_list.py       武器列表 PropertyGroup + UIList
│   └── panel.py             "PDE Weapon" N 面板
│
└── scenes/                场景导入 (JSON 索引 + 批量导入)
    ├── __init__.py          桶文件
    ├── scanner.py           扫描 level 目录 → scene.json
    ├── lua_parser.py        Lua 配置解析 (AddMesh / AddActiveObject / AddGate)
    ├── scene_list.py        场景列表 PropertyGroup + UIList
    ├── scene_import_helpers.py  导入辅助函数 (mesh/活动物体/门/据点)
    ├── operators.py         ScanScenes / ImportScene
    └── panel.py             "Scene Import" N 面板
```

## 场景导入 (PDE Scene 面板)

基于 `scene.json` 索引选择性导入场景。N 面板布局：

```
PDE Scene Import           ← 单面板 (Scan / Refresh / Cleanup + 状态 + 列表 + 选项 + Import)
```

**导入后对象自动分类到集合：**

| 导入项 | 目标集合 |
|---------|----------|
| 场景 mesh + 据点 | Scene |
| 活动物体 (风车/雷达等) | Objects |
| 门 | Gates |

多 Prim 场景 mesh 导入后，子物体会提升到集合根级（删除中间 Empty 父节点）。

**物体命名规则：**

`{prim_idx}_{mesh_name}_{贴图名}`，用 prim_idx 前缀避免 Blender 自动加后缀。

**材质命名规则：**

材质名从贴图名或 shader 名推导，与物体名无关。同名材质自动复用。

## 两种导入模式

### 1. 手动导入 (PDE Import 面板)

逐个选择 `.mesh` / `.skel` / `.anim` 文件导入。

- 蒙皮网格自动推导并导入对应 skeleton
- 适用于道具、武器、场景等单个资源

### 2. 角色导入 (PDE Character 面板)

基于 `character.json` 索引选择性导入角色。N 面板布局：

```
PDE Character Import          ← 主面板 (Scan / VFS Root / Cleanup)
  Character Options           ← 类别→角色→队伍→装扮→视角→LOD → Import Character
  Hat                         ← 折叠: 帽子选择 + 目标骨骼 + Import
  Chest                       ← 折叠: 胸件选择 + 目标骨骼 + Import
  Medal                       ← 折叠: 勋章选择 + 目标骨骼 + Import
  Animation Import            ← 折叠: 类型/武器/列表勾选 → Import Selected
```

**角色导入流程：**
1. 设置 VFS 根目录
2. 点击「Scan Characters」→ 生成 `character.json`
3. 选择类别 → 角色 → 队伍 → 装扮 → 视角/LOD
4. 点击「Import Character」(仅骨骼+模型，不含配饰和动画)

**配饰导入 (独立面板)：**
- Hat / Chest / Medal 各有独立折叠面板
- 选择配饰 + 目标骨骼 → Import
- 配件 mesh 路径自动修正: `/mesh/prop/` → `/mesh/character/thirdperson/prop/`

**动画导入 (独立面板)：**
- 类型: Char TP / Char FP / Prop TP / Prop FP
- 武器变体自动扫描枚举，切换时自动刷新动画列表
- 列表勾选 + 目标骨骼 → Import Selected

**character.json 结构：**

```json
{
  "version": 2,
  "scan_time": "2026-07-14T...",
  "vfs_root": "D:\\Games\\...",
  "total_characters": 28,
  "characters": [
    {
      "name": "firebat",
      "category": "player",
      "display_name": "firebat",
      "teams": {
        "0": {
          "dir_name": "firebat_0",
          "fp_skeleton": "/skeleton/firebat_fp_skeleton.skel",
          "tp_skeleton": "/skeleton/firebat_tp_skeleton.skel",
          "animationset": "firebat",
          "outfits": [ ... ],
          "hats": [ ... ],
          "chests": [ ... ],
          "medals": [ ... ]
        }
      }
    }
  ]
}
```

**第三人称模型组成：**

TP 模型由 body + cloth + hat 等多个蒙皮 mesh 组成，共享同一个 TP skeleton。导入时只创建一份骨骼，所有 mesh 绑定到它。

**可拆卸部件：**

帽子、胸件、勋章等有自己独立的 skeleton，挂接到主骨骼的指定关节上。通过独立折叠面板导入，mesh 路径自动从 `/mesh/prop/` 修正到 `/mesh/character/thirdperson/prop/`。

## 数据流

```
.cache 文件
  → binary/cache_decoder.py  (LZ 解压 + CRC 校验)
  → binary_*.py       (二进制解析 → Python 数据结构)
  → core/mesh_builder.py   (创建 Blender 对象: Mesh / Armature / Action)
```

## 坐标系

| 模式 | 说明 |
|------|------|
| `zup` (推荐) | PDE Y-up → Blender Z-up，模型正常显示 |
| `yup` | 保持 PDE Y-up，模型侧躺 |

骨骼、网格、动画必须使用相同的坐标系模式，否则会导致蒙皮变形。
