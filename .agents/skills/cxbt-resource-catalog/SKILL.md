---
name: cxbt-resource-catalog
description: 创想兵团 (AvatarStar / cxbt-client) 全量游戏资源分类总表与引擎接入审计规范。详列 E:/projects/cxbt-client/cxbt-resource 下已分类整理的 11,163 个游戏资源文件（角色3D建模、157套造型卡、BOSS与怪物建模、846个角色与宠物动作、14大类484把武器、33款翅膀、17款宠物、27款徽章、126款戒指、47张地图与机关、86首音效、1585个UI与图标），以及此前漏装入引擎的资源清单与补全方案。
---

# 创想兵团 (`cxbt-client`) 全量资源分类字典与引擎漏装审计规范

所有 `E:\projects\cxbt-client\` 下的游戏资源文件（以及从 `AvatarStar_cache` 补全转换的缺失模型与动作）已按功能模块与角色/武器/动作归属，完整分类整理至：
**`E:\projects\cxbt-client\cxbt-resource\`**（共 **8 大主目录、11,163 个资源文件**）。

---

## 一、`E:\projects\cxbt-client\cxbt-resource\` 目录全景结构

| 顶级分类目录 | 文件总数 | 包含内容与子目录说明 |
| :--- | :---: | :--- |
| **`01_角色建模与贴图_CharacterModels/`** | **5,855** | 基础骨骼五官基底、四大职业男女初始套装、726个造型部件按身体部位分类、157套造型卡按独立角色分夹、13种副本BOSS与怪物3D建模 |
| **`02_角色动作库_CharacterAnimations/`** | **846** | 通用受击/死亡、创角10套展示待机、19种社交手势舞蹈、27个翅膀动作、42套武器战斗动作（427个）、14个职业技能与飞行动作、13套BOSS动作（220个）、17套宠物动作（68个）、58个换装与结算翻牌动作 |
| **`03_武器建模与贴图_Weapons_14大类/`** | **1,861** | 按 14 大武器家族分类的 746 个 3D 武器部件 `.glb`（右手枪体 `-rv`、枪口 `-mz`、左手副武器 `-rvl`/`-lv`）、660 张贴图、455 个武器图标 |
| **`04_翅膀与背饰挂件_Wings_33种/`** | **271** | 33 款翅膀 3D 模型与贴图、17 种宠物 3D 模型（`.mesh.glb`）、27 种徽章 3D 模型、126 种戒指 3D 模型 |
| **`05_地图场景与碰撞体_Maps_47张/`** | **647** | 47 张地图主场景 `.mesh.glb`、物理碰撞 `.physx.glb`、旗杆、全部 14 类地图独立机关/道具（大门、吊车、火山浮石、宝箱、雷达车、雷暴、陷阱、靶机等）、34 张雷达小地图、110 张选图封面 |
| **`06_音效与背景音乐_Audio_86首/`** | **86** | 7 首 BGM 与环境音（`.ogg`）、15 个角色移动/跳跃/翻滚/受击音效、42 个武器切枪/开火/换弹/开镜音效、22 个职业与 BOSS 技能音效 |
| **`07_UI界面与技能道具图标_UIAndIcons/`** | **1,585** | 四大职业立绘背景（50）、战斗 HUD（29）、创角 UI 与黑体字库（57）、大厅房间商城 UI（230）、背包全量道具与技能图标（1,219） |
| **`08_资源总表与引擎漏装审计_ManifestsAndAudit/`** | **12** | 全部 JSON 索引总表、`avatar-cards-157-summary.json`（157 个角色造型卡明细）、`organization-summary.json` |

---

## 二、角色 3D 建模详细分类（啥角色、啥部位建模）

路径：`E:\projects\cxbt-client\cxbt-resource\01_角色建模与贴图_CharacterModels\`

### 1. 基础骨骼与五官基底（`01_基础骨骼与五官基底_BaseRig/`）
所有人类角色与 157 套造型卡共享同一套 **68 骨骼蒙皮基底**：
- `body01.glb`：68 骨骼全身基础网格（包含 `root`, `pelvis`, `spine`, `chest`, `neck`, `head`, `handweapon_r`, `handweapon_l` 等核心挂点）。
- `head01.glb`：标准头模网格。
- `l_eye.glb` / `r_eye.glb`：左右眼贴花网格（UV 独立翻转控制）。
- `mouth.glb` / `nose.glb` + `nose.png`：嘴部表情贴花网格与鼻部立体网格。

### 2. 四大职业男女初始角色建模（`02_四大职业初始套装_JobPresets/`）
| 职业目录 | 男性角色预设 (`男_Male`) | 女性角色预设 (`女_Female`) | 包含 3D 部件与贴图 |
| :--- | :--- | :--- | :--- |
| **`01_护卫兵_Guardian/`** | `guardman`（护卫男） | `guardwoman`（护卫女） | 各 4 款发型 `.glb`（`guardman/s/01/02`、`guardwoman/s/ss/02`）、左右耳 `.glb`、2 件下身战术挂件 `.glb`、3 款眼睛 + 4 款嘴型 + 合成身体贴图 |
| **`02_重装兵_Gunner/`** | `heavyman`（重装男） | `heavywoman`（重装女） | 各 4 款发型 `.glb`（`heavyman/s/ss/sss`、`heavywoman/s/ss/sss`）、左右耳 `.glb`、男 7 件 / 女 6 件重装弹药包与腰部配件 `.glb`、身体与五官贴图 |
| **`03_突击兵_Assassin/`** | `malecommandos`（突击男） | `femalecommandos`（突击女） | 各 4 款发型/护目镜 `.glb`（`malecommandos/s/ss/02`、`femalecommandos/s/01/02`）、左右耳 `.glb`、2 件战术匕首袋挂件 `.glb`、身体与五官贴图 |
| **`04_生化专家_Biochemist/`** | `shenghuanan00`（生化男） | `shenghuanv03`（生化女） | 男 4 款防毒头盔 `.glb`（`shenghuanan00..03`）、女 4 款发型 `.glb`（`shenghuanv00..03`）、生化白大褂上衣模型（`shenghuanan00-coat.glb` / `shenghuanv00-coat.glb`）、VIP 腰带模型（`shenghuananvip-belt.glb` / `shenghuanvvip-belt.glb`） |

### 3. 造型卡 726 个 3D 部件按身体部位分类（`03_造型卡部件模型按部位分类_AvatarCardPartsBySlot/`）
| 部位子目录 | 数量 | 代表性角色建模文件举例 |
| :--- | :---: | :--- |
| **`01_发型建模_Hair/`** | 40 | `atongmu_hair.glb`（阿童木）、`change_hair_lod0.glb`（嫦娥）、`dalianna_hair_lod0.glb`（达莉安娜）、`laola_hair_lod0.glb`（劳拉）、`snake_hair_lod0.glb`（斯内克） |
| **`02_头盔与帽子建模_Helmet/`** | 36 | `airforce_helmet_lod0.glb`（空军头盔）、`caishenye_helmet_lod0.glb`（财神帽）、`guanyu_helmet_lod0.glb`（关羽冠）、`nutcracker_helmet_lod0.glb`（胡桃夹子帽）、`panda_helmet_lod0.glb`（熊猫头套） |
| **`03_胡须与面饰建模_Beard/`** | 11 | `guanyu_beard_lod0.glb`（关羽长髯）、`nutcracker_beard_lod0.glb`、`steamgrandpa_beard_lod0.glb`（蒸气爷爷胡须）、`snake_beard_lod0.glb` |
| **`04_耳朵建模_Ear/`** | 168 | 各角色专属带位移/缩放矩阵的左右耳模型（精灵耳、兽耳、兔耳 `yuetu_ear`、猪八戒耳 `zhubajie_ear` 等） |
| **`05_颈部以上面具与头饰_AboveNeckTrinket/`** | 14 | 眼镜、面罩、防毒面具、TV 怪客电视机头饰等颈部以上独立挂件 |
| **`06_上身披风与胸甲饰品_UpperTrinket/`** | 102 | 披风、肩甲、翅膀背饰、红龙鳞甲胸甲（`reddragon`）、绿龙猎人肩甲（`greendragon`）、猎魔天使羽翼等 |
| **`07_下身腰带与腿部挂件_LowerTrinket/`** | 91 | 战裙、腰刀、弹夹包、剑鞘、战术腿挂等 |
| **`08_自由挂载饰品配件_MovableTrinket/`** | 264 | 造型卡自由坐标挂载配件（含金门狮爷、电音三太子、雷伊、盖亚等全身组合式装甲部件） |

### 4. 157 套造型卡按角色独立归档（`04_造型卡157套按角色分类_AvatarCardsByCharacter/`）
每个文件夹对应 1 张完整造型卡（含 `preview_3D缩略图.png`、`icon_卡片图标.png`、`body_全身贴图.png`、`head_头部贴图.png`、五官贴图及 `parts_3D部件/*.glb`）：
- **26 套命名典藏角色卡**：
  - `001_card-0_额`、`002_card-100047_蛋糕女孩`、`003_card-100048_电话女孩`、`004_card-100049_红龙鳞甲战士`、`005_card-100050_胡桃夹子`、`006_card-100051_猎魔天使`、`007_card-100052_绿龙猎人`、`008_card-100053_蒸气男爵`、`009_card-100054_蒸气爷爷`、`010_card-100055_TV怪客`、`011_card-100062_金门狮爷`、`012_card-100063_电音三太子`、`013_card-100064_雷伊`、`014_card-100065_盖亚`、`015_card-100066_猪八戒`、`016_card-100067_嫦娥`、`017_card-100068_月兔`、`018_card-100083_熊猫布偶`、`019_card-100084_关羽`、`020_card-100087_财神爷`、`021_card-100167_斯内克`、`022_card-100168_劳拉`、`023_card-100169_奥斯丁`、`024_card-100170_达莉安娜`、`025_card-100182_陆战特种兵`、`026_card-100183_特种兵`。
- **131 套实战抓包玩家造型卡**：`027_log-b11c9ebf309e_日志造型_01_*` ~ `157_log-eedc62b33419_日志造型_131_*`（文件夹名末尾已标注其主服饰系列名）。

### 5. 13 种副本 BOSS 与怪物 3D 建模（`06_副本BOSS与怪物3D建模_BossAndMonsters_13种/`）
已从 `AvatarStar_cache/mesh/character/thirdperson/boss/` 全量转换为 `.glb` + `.png`（同时同步至 `public/assets/gameplay/mesh/boss/`）：
- **海盗船副本（`level10001`）**：`boss01_001_monster_01`（海盗杂兵）、`boss_01_01`（海盗船长阶段1）、`boss_01_02`（海盗船长阶段2）、`boss_01_03`（海盗船长阶段3）。
- **机械工地副本（`level10002`）**：`boss02_001_monster_01`（施工杂兵）、`boss_02_01`（挖掘机甲阶段1）、`boss_02_02`（挖掘机甲阶段2飞行形态）。
- **法老古墓副本（`level10003`）**：`boss03_001_monster_01`（木乃伊杂兵）、`boss_03_01`（法老王阶段1）、`boss_03_02`（法老王阶段2）。
- **火山岛副本（`level10009`）**：`boss_04_01`（熔岩巨兽本体）、`boss_04_02`（熔岩魔像分身）、`boss_04_support`（熔岩图腾柱）。

---

## 三、角色动作库详细分类（啥角色动作、对应啥武器/技能）

路径：`E:\projects\cxbt-client\cxbt-resource\02_角色动作库_CharacterAnimations\`（共 **846 个动作 `.json`**）

1. **`01_通用受击与死亡_Common/`（3 个）**：
   - `common-hit.json`（标准受击硬直）、`common-death.json`（标准阵亡倒地）、`creation-base-idle.json`（创角空手呼吸待机）。
2. **`02_创角展示待机动作_CreationIdle_10套/`（10 个）**：
   - `bow_01.json`、`knives_01.json`、`machinegun_01.json`、`pistol_01.json`、`rpg_01.json`、`shield_01.json`、`shotgun_01.json`、`smg_01.json`、`sniperrifle_01.json`、`sprayer_01.json`。
3. **`03_社交手势与舞蹈_Gestures_19种/`（19 个）**：
   - `ancient_古典舞`、`beck_招手`、`charge_冲锋`、`charge02_冲锋02`、`congratulate_祝贺`、`defiance_挑衅`、`defiance02_挑衅02`、`defiance03_挑衅03`、`disdain_鄙视`、`disdain02_鄙视02`、`help_求助`、`mj_月球漫步`、`nobody_Nobody舞`、`pity_可怜`、`pity02_可怜02`、`ride_骑马舞`、`russia_俄罗斯舞`、`salute_敬礼`、`street1_街舞`。
4. **`04_翅膀骨骼与展示动作_WingAnimations/`（27 个）**：
   - `indie-wing-wing01..38` 的 `idle.json`（翅膀扇动骨骼动画）、`fly.json`（飞行扇翅）、`showidle.json`（人物穿戴翅膀悬浮展示动作）。
5. **`05_武器战斗动作套件_WeaponSuites_42套/`（42 个子文件夹，共 427 个动作）**：
   - 涵盖全部 42 套武器动作组：`bow_01/08/09`、`crossbow_03`、`grenade_01/08/09/49/50`、`grenadelauncher_01`、`knives_01/08/09/47/sh01/sh03/sh04/sh05/sh06`、`machinegun_01/08/09`、`pistol_01/08/09`、`rpg_01/08/09`、`shield_01/09/47`、`shotgun_01/08/09`、`smg_01/08/09`、`sniperrifle_01/08/09`、`sprayer_01`、`stick_sh01`。
   - 每个子文件夹内统一整理了该武器套件的：
     - `combat_idle.json`（战斗持枪待机 `stdidle`）
     - `combat_run.json`（持枪奔跑 `stdrunforward`）
     - `combat_jump.json`（持枪起跳 `stdjump`）
     - `combat_roll.json`（战术翻滚 `stdrollforward`）
     - `combat_attack.json` / `combat_attack2.json` / `combat_attack3.json`（开火射击或近战三连击 `stdshoot1..3`）
     - `combat_spurt.json`（近战突刺 `stdspurt1`）
     - `combat_reload.json`（换弹动作 `stdreload`）
     - `combat_hit.json`（持该武器受击动作 `stdhit`）
     - `combat_change.json`（切枪拔枪动作 `stdchange`）
     - `lobby_stdidlemenu.json`（大厅展示待机）
6. **`06_职业技能与飞行投掷动作_SkillsAndFly_14种/`（14 个）**：
   - 职业技能释放动作（`skill_anim-*`）：`stdblast`（自爆/冲击波）、`stdcatch`（抓投）、`stdeat`（吃鱼/饼干回血）、`stdoutcry`（战吼/咆哮）、`stdtleibao_01_bombon`（召唤雷暴自走雷）、`stdtleibao_01_bomboff`（收起雷暴）、`stdtread`（战争践踏）。
   - 喷气飞行动作（`fly-*`）：`fly`、`fly01`、`fly02`、`fly03`、`jumpfly`、`takeoff`。
   - 投掷道具动作：`throwdropitem-throwdropitem.json`。
7. **`07_副本BOSS与怪物动作_BossAndMonsters_13套/`（13 个子文件夹，共 220 个动作）**：
   - 包含全部 13 种 BOSS 与杂兵的出场（`stdborn`）、吟唱召唤（`stdconjure`）、普通射击/挥砍（`stdshoot`/`stdattack`）、阶段大招（`stdskill001..003`、`stdshockwave`、`stdfinalfire`）、护盾（`stdshield`）、眩晕（`stdfaint`）、部位破坏（`stdfalldown01..06`、`stdheadoff`）与死亡（`stddie`）。
8. **`08_宠物跟随动作_Pets_17套/`（17 个子文件夹，共 68 个动作）**：
   - 包含 `bird`、`bird02`、`dog01`、`dragon`、`dragon02..10`、`egg`、`fish`、`human01`、`monster` 共 17 种宠物的 `idle.json`（待机）、`idle02.json`（休闲）、`run.json`（跟随奔跑）、`help.json`（救援/互动）。
9. **`09_换装间与结算卡牌动作_AvatarRoomAndCards/`（58 个）**：
   - `avatar/`（42 个换装间部位预览动作，如换发型 `hair.json`、换衣服 `coat.json`、换裤子 `pants.json`、舞蹈 `danceb/c.json`）。
   - `card/`（16 个对局结算翻牌亮相动作 `card_01..09.json` 及定格造型 `card_01..09_pose.json`）。

---

## 四、“漏加进游戏引擎”的全面排查结果与本次补全清单

针对你怀疑的“**漏了很多没有加进去游戏引擎中**”，经过逐项比对 `cxbt-client-main/src/` 代码与原版缓存，确实发现了 **6 大类严重漏装项**，并已在本次整理中完成转换与补全：

### 1. 【已转换并接入引擎】158 个缺失的战斗核心动作（`public/assets/gameplay/animations/`）
- **问题原因**：此前 `gameplay/animations/` 下只有 187 个文件：
  1. `bow_08/09`、`machinegun_08/09`、`pistol_08/09`、`rpg_08/09`、`shotgun_08/09`、`smg_08/09`、`sniperrifle_08/09`、`grenade_08/09/49/50` 共 **19 套武器动作组缺少 `-attack.json` 与 `-reload.json`**（只有 `run/jump/roll`）。
  2. 全部 **42 套武器动作组缺少战斗待机 `-idle.json`（`stdidle.anim`）、受击 `-hit.json`（`stdhit.anim`）、切枪 `-change.json`（`stdchange.anim`）**，导致局内待机只能回退到大厅摆拍姿势 `stdidlemenu`！
  3. 创角初始武器（`creation/config.json`）未配置 `actions.reload`，导致在 [`avatar.ts`](file:///e:/projects/cxbt-client/cxbt-client-main/src/features/gameplay/avatar.ts) 中按 `R` 换弹完全没有动作！
  4. 本地玩家使用的 `BattleAvatar`（[`avatar.ts`](file:///e:/projects/cxbt-client/cxbt-client-main/src/features/gameplay/avatar.ts)）**完全没有加载 `common-hit.json` 和 `common-death.json`**，导致玩家受击和阵亡时没有任何动作反馈！
  5. `skill_anim`（7 个技能释放动作：吃鱼、战吼、践踏、雷暴等）和 `fly`（6 个飞行动作）从未转换导入。
- **已完成修复**：
  - 已将上述 **158 个缺失动作**全部从 `.anim` 转换为 `.json` 写入 `public/assets/gameplay/animations/`（现共 **345 个战斗动作文件**）。
  - 已修改 [`src/features/gameplay/avatar.ts`](file:///e:/projects/cxbt-client/cxbt-client-main/src/features/gameplay/avatar.ts) 与 [`src/features/gameplay/engine/PlayerEntity.ts`](file:///e:/projects/cxbt-client/cxbt-client-main/src/features/gameplay/engine/PlayerEntity.ts)，为 `BattleAvatar` 补齐战斗待机 `-idle.json`、换弹自动回退 `-reload.json`、受击 `hit()`、阵亡 `die()` 与技能释放动作 `playSkillAnim()`。

### 2. 【已转换入库】13 种副本 BOSS 与杂兵真身 3D 建模（220 个专属动作）
- **问题原因**：原版 `level10001..10009` PVE 副本拥有 13 种专属 BOSS 与杂兵 3D 模型（海盗船长三阶段、挖掘机甲二阶段、法老王二阶段、熔岩巨兽与图腾柱），但此前从未转换 `.mesh`，局内 PVE 模式只是把普通人类角色放大 1.8 倍充当 BOSS。
- **已转换位置**：
  - 资源库：`cxbt-resource/01_角色建模与贴图_CharacterModels/06_副本BOSS与怪物3D建模_BossAndMonsters_13种/` 及 `02_角色动作库_CharacterAnimations/07_副本BOSS与怪物动作_BossAndMonsters_13套/`
  - 引擎静态目录：`public/assets/gameplay/mesh/boss/<boss_id>/mesh.mesh.glb`

### 3. 【已转换入库】17 种宠物真身 3D 建模（68 个专属动作）+ 27 种徽章 + 126 种戒指
- **问题原因**：此前 `indie/` 目录下只导出了 33 款翅膀（`wing`），遗漏了全部 **17 种跟宠 3D 模型**（`bird`, `bird02`, `dog01`, `dragon`..`dragon10`, `egg`, `fish`, `human01`, `monster`）及 68 个宠物骨骼动作，导致局内宠物伴侣只能用简单的几何球体代替。
- **已转换位置**：
  - 资源库：`cxbt-resource/04_翅膀与背饰挂件_Wings_33种/02_宠物3D建模与贴图_Pets_17种/`、`03_徽章3D建模_Badges_27种/`、`04_戒指3D建模_Rings_126种/`
  - 引擎静态目录：`public/assets/gameplay/mesh/pet/<pet_id>.mesh.glb`

### 4. 【已转换入库】10 类局内战术与模式交互 3D 道具（23 个 `.glb` 模型）
- **问题原因**：此前 `mesh/prop/` 只转换了大门、吊车和火山石板 4 类模型，遗漏了其余 **10 类核心战斗道具 3D 模型**：
  - `treasurechest`（夺宝模式宝箱：`treasurechest_01.mesh.glb`、`statictreasurechest_01.mesh.glb`、金块 `gold_01.mesh.glb`）
  - `radartruck_01`（雷达车 9 个部件 `radartruck_01..09.mesh.glb`）
  - `leibao_01`（突击兵“雷暴”自走炸弹 `leibao_01.mesh.glb`、`run.mesh.glb`）
  - `snare`（捕兽夹/定身陷阱 `snare.mesh.glb`）
  - `energy`（能量胶囊 `capsule.mesh.glb`、`energy.mesh.glb`）
  - `guntarget`（新手训练场升降靶 `obbase.mesh.glb`、`obtarger06.mesh.glb`）
  - `bullet` / `bulletshell`（3D 子弹头与抛壳弹壳网格）
  - `gaddi` / `boss41_gate`（火山岛大门 `boss41_gate.mesh.glb`）
- **已转换位置**：
  - 资源库：`cxbt-resource/05_地图场景与碰撞体_Maps_47张/02_地图独立机关与浮石道具_Props/`
  - 引擎静态目录：`public/assets/gameplay/mesh/prop/<prop_folder>/`

### 5. 【已补全】八方向移动/四方向翻滚与换装间结算卡牌动作
- **八向跑与四向翻滚**：原版 42 套武器套件的全部 7 个额外方向跑（`stdrunback`, `stdrunleft`, `stdrunright`, `stdrunforwardleft`, `stdrunforwardright`, `stdrunbackleft`, `stdrunbackright`）与 3 个额外方向翻滚（`stdrollback`, `stdrollleft`, `stdrollright`）共 420 个动作片段已同步至 `public/assets/gameplay/animations/<suite>-<dir>.json`，并在 `avatar.ts`（`resolveMoveDirection` / `resolveRollDirection` + 上下半身分离混合）、`PlayerEntity.ts`、`Gameplay.tsx`（含本地与远端联机玩家）及 `weaponSuites.ts` 中全面实装。
- **结算翻牌与换装间 3D 角色动作**：`09_换装间与结算卡牌动作_AvatarRoomAndCards/` 下的结算翻牌动作（`card_01..09.json` 与 `card_01..09_pose.json`）及 42 个换装间动作（`avatar/*.json`）已在战后九宫格翻牌结算界面（`Gameplay.tsx`）、大厅与造型屋 3D 部件试穿（`Lobby.tsx`、`LobbyFeatureModal.tsx`）及模型动作检视器（`ModelViewer.tsx`）中完整接入。
