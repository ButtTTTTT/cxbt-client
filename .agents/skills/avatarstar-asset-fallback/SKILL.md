---
name: avatarstar-asset-fallback
description: 规定在 cxbt-client 开发中，当缺少武器动作、音效、三维模型、材质贴图、技能或数值配置时，直接到 e:/projects/AvatarStar/AvatarStar_cache 溯源查找并补全，确保游戏各项机制与端游原版精确对齐。
---

# AvatarStar 资产与配置溯源开发规范 (AvatarStar Asset Fallback)

在 `cxbt-client` 客户端与沙盒系统开发过程中，若遇到动作缺失（如攻击射击、换弹、受击、死亡动画）、音效缺失、武器属性参数不详或模型部件遗漏时，**禁止随意编造或使用不符合端游设定的临时占位数据**。

必须以本地原版游戏解包资产仓库 `e:/projects/AvatarStar/AvatarStar_cache` 为第一溯源基准。

---

## 一、资产仓库全景地图 (`e:/projects/AvatarStar/AvatarStar_cache`)

| 目录相对路径 | 资产类型与作用 | 格式与主要文件 | 适用场景 |
| :--- | :--- | :--- | :--- |
| `animation/character/thirdperson/male/<suite>/` | 人物第三人称全套骨骼动作帧 | `.anim` 二进制动作切片 | 提取换弹 (`stdreload`)、射击 (`stdshoot`)、受击 (`stdhit`)、死亡 (`stddeath`)、跑跳翻滚 |
| `weapon/<weapon_id>.lua` | 武器核心参数与视觉定义 | `.lua` 脚本配置 | 武器网格部件 (`SetMesh`)、开火间隔 (`delay_time`)、弹药图标、准星贴图、枪口光效与音效 |
| `audio/` | 全量战斗与环境音效 | `.wav`, `.ogg` | 各枪种开火音效 (`fire-*.wav`)、换弹 (`reload.wav`)、跳跃、落地、受击音效 |
| `skill/` | 职业技能配置与数值逻辑 | `.lua` 脚本配置 | 突击兵/重装兵/医护兵等技能 CD、伤害倍率、作用半径、持续时间 |
| `vfx/` | 特效粒子与弹道配置 | `.pfx`, `.lua` | 枪口火花 (`mzflash`)、弹壳飞溅、弹道轨迹 (`bullet_particle`)、近战刀光 (`trail_particle`)、爆炸效果 |
| `level/` | 关卡地图与高程数据 | `.scene`, `.navmesh`, `.airwall` | 23+ 经典对战地图模型、碰撞体与障碍物空气墙 |
| `mesh/` | 原始几何模型网格 | `.mesh` | 角色配件、身体基础网格、武器分件 |
| `scripts/` | 游戏业务与数值表 | `.lua` | 伤害公式、射速计算、经验与强化规则 |

---

## 二、典型工作流指南

### 1. 武器动作与参数溯源 (`weapon/*.lua`)
当实现某把新武器（如 `rpg_01`, `bow_01`, `shotgun_01`）时：
1. 查阅 `e:/projects/AvatarStar/AvatarStar_cache/weapon/<weapon_id>.lua`。
2. 读取关键字段：
   - `weapon.animation_set`：对应动作套件名称。
   - `weapon.fire_particle`：枪口火花特效名称。
   - `weapon.sound_name`：绑定的开火音效名称。
   - `weapon.delay_time` / `weapon.fire_time`：开火间隔与后坐力延迟时间。
   - `weapon.cross_hair_icon`：对应准星图标。

### 2. 动画转换管线 (`.anim` -> `.json`)
游戏内使用的是 JSON 格式的关键帧动画数据（由 `prepare-gameplay-animations.mjs` 转换）：
- 原版 `.anim` 文件位于 `AvatarStar_cache/animation/character/thirdperson/male/<weapon_set>/`。
- 转换脚本位于 `cxbt-client-main/scripts/prepare-gameplay-animations.mjs`。
- 若缺少特定动作（如射击 `stdshoot.anim` 或受击 `stdhit.anim`），运行转换脚本将其导入为 `cxbt-client-main/public/assets/gameplay/animations/<weapon_set>-<action>.json`。

### 3. 音效文件溯源与挂载
- 声音资源统一检索自 `AvatarStar_cache/audio/`。
- 前端播放统一走 `audio.play('<sound_name>')`，对应静态文件放置在 `cxbt-client-main/public/assets/gameplay/audio/`。

---

## 三、端游全武器大类对照表 (14 种武器类型)

| 武器类别 | 代表 ID | 弹道/伤害类型 | 核心手感特征 | 溯源模型与贴图 | 开火音效 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **冲锋枪 (SMG)** | `smg_01` | Hitscan 射线 | 30 发高射速全自动，短点射稳定 | `mesh/weapon/smg_01` | `fire-smg.wav` |
| **手枪 (Pistol)** | `pistol_01` | Hitscan 射线 | 12 发半自动，精准度极高，副武器首选 | `mesh/weapon/pistol_01` | `fire-pistol.wav` |
| **霰弹枪 (Shotgun)** | `shotgun_01` | Hitscan 7 弹丸散射 | 8 发泵动单发，近距离一击高伤 | `mesh/weapon/shotgun_01` | `fire-shotgun.wav` |
| **狙击步枪 (Sniper)** | `sniperrifle_01` | Hitscan 穿透射线 | 5 发栓动，单发极高伤害，爆头 2.5 倍暴击 | `mesh/weapon/sniperrifle_01` | `fire-sniperrifle.wav` |
| **重机枪 (Machinegun)** | `machinegun_01` | Hitscan 连续射线 | 80 发超大弹匣，火力压制，射速略慢于 SMG | `mesh/weapon/machinegun_01` | `fire-machinegun.wav` |
| **近战军刀 (Knives)** | `knives_01` | 扇形范围近战 | 高速挥砍连击，无弹药限制 | `mesh/weapon/knives_01` | `fire-knives.wav` |
| **近战战棍 (Stick)** | `stick_sh01` | 宽范围钝器近战 | 重击击退，硬直效果更长 | `mesh/weapon/stick_sh01` | `fire-knives.wav` |
| **战术盾牌 (Shield)** | `shield_01` | 近战盾击 / 格挡 | 双手持盾，盾击推击与战术防护 | `mesh/weapon/shield_01` | `fire-shield.wav` |
| **复合弓 (Bow)** | `bow_01` | 弹道物理箭矢 | 单发拉弓蓄能射击，飞行箭矢下坠与穿透 | `mesh/weapon/bow_01` | `fire-bow.wav` |
| **战术十字弩 (Crossbow)** | `crossbow_03` | 平直弹道高穿透弩箭 | 单发高速机械发射，弹道下坠极小，爆头致命 | `mesh/weapon/crossbow_03` | `fire-crossbow.wav` |
| **火箭筒 (RPG)** | `rpg_01` | 物理火箭与范围爆炸 | 尾焰推进，触地/碰撞造成高额大范围爆炸 AOE | `mesh/weapon/rpg_01` | `fire-rpg.wav` |
| **榴弹发射器 (GrenadeLauncher)** | `grenadelauncher_01` | 抛物线跳跃爆炸弹 | 6 发弹巢，发射弹跳榴弹，落地引爆范围杀伤 | `mesh/weapon/grenadelauncher_01` | `fire-grenadelauncher.wav` |
| **战术手雷 (Grenade)** | `grenade_01` | 投掷抛物线高爆物 | 抛掷弧线，反弹后延时引爆，破片杀伤 | `mesh/weapon/grenade_01` | `fire-grenade.wav` |
| **生化喷射器 (Sprayer)** | `sprayer_01` | 锥形生化毒雾持续喷射 | 60 发生化药水，近距大锥角连续腐蚀伤害 | `mesh/weapon/sprayer_01` | `sprayer.wav` |

