// 武器与动作预设套件通用配置

export interface WeaponPartConfig {
  model: string;
  texture?: string | null;
  bone: string;
}

export interface WeaponActionSet {
  id: string;
  name: string;
  parts?: WeaponPartConfig[];
  actions: Record<string, string>;
}

export const WEAPON_SUITES: WeaponActionSet[] = [
  {
    id: 'smg_01',
    name: '冲锋枪套件 (SMG)',
    parts: [
      { model: '/assets/creation/models/smg_01-rv.glb', texture: '/assets/creation/textures/smg_01-rv.png', bone: 'handweapon_r' },
      { model: '/assets/creation/models/smg_01-mz.glb', texture: '/assets/creation/textures/smg_01-mz.png', bone: 'handweapon_r' }
    ],
    actions: {
      idle: '/assets/creation/animations/smg_01.json',
      run: '/assets/gameplay/animations/smg_01-run.json',
      jump: '/assets/gameplay/animations/smg_01-jump.json',
      roll: '/assets/gameplay/animations/smg_01-roll.json',
      attack: '/assets/gameplay/animations/smg_01-attack.json',
      reload: '/assets/gameplay/animations/smg_01-reload.json',
      hit: '/assets/gameplay/animations/common-hit.json',
      death: '/assets/gameplay/animations/common-death.json'
    }
  },
  {
    id: 'pistol_01',
    name: '手枪套件 (Pistol)',
    parts: [
      { model: '/assets/creation/models/pistol_01-rv.glb', texture: '/assets/creation/textures/pistol_01-rv.png', bone: 'handweapon_r' }
    ],
    actions: {
      idle: '/assets/creation/animations/pistol_01.json',
      run: '/assets/gameplay/animations/pistol_01-run.json',
      jump: '/assets/gameplay/animations/pistol_01-jump.json',
      roll: '/assets/gameplay/animations/pistol_01-roll.json',
      attack: '/assets/gameplay/animations/pistol_01-attack.json',
      reload: '/assets/gameplay/animations/pistol_01-reload.json',
      hit: '/assets/gameplay/animations/common-hit.json',
      death: '/assets/gameplay/animations/common-death.json'
    }
  },
  {
    id: 'shotgun_01',
    name: '霰弹枪套件 (Shotgun)',
    parts: [
      { model: '/assets/creation/models/shotgun_01-rv.glb', texture: '/assets/creation/textures/shotgun_01-rv.png', bone: 'handweapon_r' },
      { model: '/assets/creation/models/shotgun_01-bh.glb', texture: '/assets/creation/textures/shotgun_01-bh.png', bone: 'handweapon_r' }
    ],
    actions: {
      idle: '/assets/creation/animations/shotgun_01.json',
      run: '/assets/gameplay/animations/shotgun_01-run.json',
      jump: '/assets/gameplay/animations/shotgun_01-jump.json',
      roll: '/assets/gameplay/animations/shotgun_01-roll.json',
      attack: '/assets/gameplay/animations/shotgun_01-attack.json',
      reload: '/assets/gameplay/animations/shotgun_01-reload.json',
      hit: '/assets/gameplay/animations/common-hit.json',
      death: '/assets/gameplay/animations/common-death.json'
    }
  },
  {
    id: 'sniperrifle_01',
    name: '狙击步枪套件 (Sniper)',
    parts: [
      { model: '/assets/creation/models/sniperrifle_01-rv.glb', texture: '/assets/creation/textures/sniperrifle_01-rv.png', bone: 'handweapon_r' },
      { model: '/assets/creation/models/sniperrifle_01-mz.glb', texture: '/assets/creation/textures/sniperrifle_01-mz.png', bone: 'handweapon_r' }
    ],
    actions: {
      idle: '/assets/creation/animations/sniperrifle_01.json',
      run: '/assets/gameplay/animations/sniperrifle_01-run.json',
      jump: '/assets/gameplay/animations/sniperrifle_01-jump.json',
      roll: '/assets/gameplay/animations/sniperrifle_01-roll.json',
      attack: '/assets/gameplay/animations/sniperrifle_01-attack.json',
      reload: '/assets/gameplay/animations/sniperrifle_01-reload.json',
      hit: '/assets/gameplay/animations/common-hit.json',
      death: '/assets/gameplay/animations/common-death.json'
    }
  },
  {
    id: 'machinegun_01',
    name: '重机枪套件 (Machinegun)',
    parts: [
      { model: '/assets/creation/models/machinegun_01-rv.glb', texture: '/assets/creation/textures/machinegun_01-rv.png', bone: 'handweapon_r' },
      { model: '/assets/creation/models/machinegun_01-mz.glb', texture: '/assets/creation/textures/machinegun_01-mz.png', bone: 'handweapon_r' }
    ],
    actions: {
      idle: '/assets/creation/animations/machinegun_01.json',
      run: '/assets/gameplay/animations/machinegun_01-run.json',
      jump: '/assets/gameplay/animations/machinegun_01-jump.json',
      roll: '/assets/gameplay/animations/machinegun_01-roll.json',
      attack: '/assets/gameplay/animations/machinegun_01-attack.json',
      reload: '/assets/gameplay/animations/machinegun_01-reload.json',
      hit: '/assets/gameplay/animations/common-hit.json',
      death: '/assets/gameplay/animations/common-death.json'
    }
  },
  {
    id: 'knives_01',
    name: '近战军刀套件 (Knives - 含攻击)',
    parts: [
      { model: '/assets/creation/models/knives_01-rv.glb', texture: '/assets/creation/textures/knives_01-rv.png', bone: 'handweapon_r' }
    ],
    actions: {
      idle: '/assets/creation/animations/knives_01.json',
      run: '/assets/gameplay/animations/knives_01-run.json',
      jump: '/assets/gameplay/animations/knives_01-jump.json',
      roll: '/assets/gameplay/animations/knives_01-roll.json',
      attack: '/assets/gameplay/animations/knives_01-attack.json',
      attack2: '/assets/gameplay/animations/knives_01-attack2.json',
      attack3: '/assets/gameplay/animations/knives_01-attack3.json',
      spurt: '/assets/gameplay/animations/knives_01-spurt.json',
      hit: '/assets/gameplay/animations/common-hit.json',
      death: '/assets/gameplay/animations/common-death.json'
    }
  },
  {
    id: 'shield_01',
    name: '战术盾牌套件 (Shield - 含攻击)',
    parts: [
      { model: '/assets/creation/models/shield_01-rvl.glb', texture: '/assets/creation/textures/shield_01-rvl.png', bone: 'handweapon_l' },
      { model: '/assets/creation/models/shield_01-rvr.glb', texture: '/assets/creation/textures/shield_01-rvr.png', bone: 'handweapon_r' }
    ],
    actions: {
      idle: '/assets/creation/animations/shield_01.json',
      run: '/assets/gameplay/animations/shield_01-run.json',
      jump: '/assets/gameplay/animations/shield_01-jump.json',
      roll: '/assets/gameplay/animations/shield_01-roll.json',
      attack: '/assets/gameplay/animations/shield_01-attack.json',
      attack2: '/assets/gameplay/animations/shield_01-attack2.json',
      attack3: '/assets/gameplay/animations/shield_01-attack3.json',
      hit: '/assets/gameplay/animations/common-hit.json',
      death: '/assets/gameplay/animations/common-death.json'
    }
  },
  {
    id: 'bow_01',
    name: '复合弓套件 (Bow)',
    parts: [
      { model: '/assets/creation/models/bow_01-rv.glb', texture: '/assets/creation/textures/bow_01-rv.png', bone: 'handweapon_r' },
      { model: '/assets/creation/models/bow_01-mz.glb', texture: '/assets/creation/textures/bow_01-mz.png', bone: 'handweapon_r' }
    ],
    actions: {
      idle: '/assets/creation/animations/bow_01.json',
      run: '/assets/gameplay/animations/bow_01-run.json',
      jump: '/assets/gameplay/animations/bow_01-jump.json',
      roll: '/assets/gameplay/animations/bow_01-roll.json',
      attack: '/assets/gameplay/animations/bow_01-attack.json',
      reload: '/assets/gameplay/animations/bow_01-reload.json',
      hit: '/assets/gameplay/animations/common-hit.json',
      death: '/assets/gameplay/animations/common-death.json'
    }
  },
  {
    id: 'rpg_01',
    name: '火箭筒套件 (RPG)',
    parts: [
      { model: '/assets/creation/models/rpg_01-rv.glb', texture: '/assets/creation/textures/rpg_01-rv.png', bone: 'handweapon_r' },
      { model: '/assets/creation/models/rpg_01-mz.glb', texture: '/assets/creation/textures/rpg_01-mz.png', bone: 'handweapon_r' }
    ],
    actions: {
      idle: '/assets/creation/animations/rpg_01.json',
      run: '/assets/gameplay/animations/rpg_01-run.json',
      jump: '/assets/gameplay/animations/rpg_01-jump.json',
      roll: '/assets/gameplay/animations/rpg_01-roll.json',
      attack: '/assets/gameplay/animations/rpg_01-attack.json',
      reload: '/assets/gameplay/animations/rpg_01-reload.json',
      hit: '/assets/gameplay/animations/common-hit.json',
      death: '/assets/gameplay/animations/common-death.json'
    }
  },
  {
    id: 'sprayer_01',
    name: '生化喷射器套件 (Sprayer)',
    parts: [
      { model: '/assets/creation/models/sprayer_01-rv.glb', texture: '/assets/creation/textures/sprayer_01-rv.png', bone: 'handweapon_r' }
    ],
    actions: {
      idle: '/assets/creation/animations/sprayer_01.json',
      run: '/assets/gameplay/animations/sprayer_01-run.json',
      jump: '/assets/gameplay/animations/sprayer_01-jump.json',
      roll: '/assets/gameplay/animations/sprayer_01-roll.json',
      attack: '/assets/gameplay/animations/sprayer_01-attack.json',
      reload: '/assets/gameplay/animations/sprayer_01-reload.json',
      hit: '/assets/gameplay/animations/common-hit.json',
      death: '/assets/gameplay/animations/common-death.json'
    }
  },
  {
    id: 'stick_sh01',
    name: '近战战棍套件 (Stick - 含攻击)',
    parts: [
      { model: '/assets/creation/models/stick_sh01-rv.glb', texture: '/assets/lobby/textures/mesh/weapon/stick_sh01/stick_sh01_d.png', bone: 'handweapon_r' }
    ],
    actions: {
      idle: '/assets/lobby/animations/thirdperson-male-stick_sh01-stdidlemenu.json',
      run: '/assets/gameplay/animations/stick_sh01-run.json',
      jump: '/assets/gameplay/animations/stick_sh01-jump.json',
      roll: '/assets/gameplay/animations/stick_sh01-roll.json',
      attack: '/assets/gameplay/animations/stick_sh01-attack.json',
      attack2: '/assets/gameplay/animations/stick_sh01-attack2.json',
      attack3: '/assets/gameplay/animations/stick_sh01-attack3.json',
      hit: '/assets/gameplay/animations/common-hit.json',
      death: '/assets/gameplay/animations/common-death.json'
    }
  },
  {
    id: 'crossbow_03',
    name: '战术十字弩套件 (Crossbow)',
    parts: [
      { model: '/assets/creation/models/crossbow_03-rv.glb', texture: '/assets/creation/textures/crossbow_03-rv.png', bone: 'handweapon_r' },
      { model: '/assets/creation/models/crossbow_03-mz.glb', texture: '/assets/creation/textures/crossbow_03-rv.png', bone: 'handweapon_r' }
    ],
    actions: {
      idle: '/assets/lobby/animations/thirdperson-male-crossbow_03-stdidlemenu.json',
      run: '/assets/gameplay/animations/crossbow_03-run.json',
      jump: '/assets/gameplay/animations/crossbow_03-jump.json',
      roll: '/assets/gameplay/animations/crossbow_03-roll.json',
      attack: '/assets/gameplay/animations/crossbow_03-attack.json',
      reload: '/assets/gameplay/animations/crossbow_03-reload.json',
      hit: '/assets/gameplay/animations/common-hit.json',
      death: '/assets/gameplay/animations/common-death.json'
    }
  },
  {
    id: 'grenadelauncher_01',
    name: '榴弹发射器套件 (GrenadeLauncher)',
    parts: [
      { model: '/assets/creation/models/grenadelauncher_01-rv.glb', texture: '/assets/creation/textures/grenadelauncher_01-rv.png', bone: 'handweapon_r' },
      { model: '/assets/creation/models/grenadelauncher_01-mz.glb', texture: '/assets/creation/textures/grenadelauncher_01-rv.png', bone: 'handweapon_r' }
    ],
    actions: {
      idle: '/assets/lobby/animations/thirdperson-male-grenadelauncher_01-stdidlemenu.json',
      run: '/assets/gameplay/animations/grenadelauncher_01-run.json',
      jump: '/assets/gameplay/animations/grenadelauncher_01-jump.json',
      roll: '/assets/gameplay/animations/grenadelauncher_01-roll.json',
      attack: '/assets/gameplay/animations/grenadelauncher_01-attack.json',
      reload: '/assets/gameplay/animations/grenadelauncher_01-reload.json',
      hit: '/assets/gameplay/animations/common-hit.json',
      death: '/assets/gameplay/animations/common-death.json'
    }
  },
  {
    id: 'grenade_01',
    name: '战术手雷套件 (Grenade - 投掷)',
    parts: [
      { model: '/assets/creation/models/grenade_01-rv.glb', texture: '/assets/creation/textures/grenade_01-rv.png', bone: 'handweapon_r' }
    ],
    actions: {
      idle: '/assets/lobby/animations/thirdperson-male-grenade_01-stdidlemenu.json',
      run: '/assets/gameplay/animations/grenade_01-run.json',
      jump: '/assets/gameplay/animations/grenade_01-jump.json',
      roll: '/assets/gameplay/animations/grenade_01-roll.json',
      attack: '/assets/gameplay/animations/grenade_01-attack.json',
      hit: '/assets/gameplay/animations/common-hit.json',
      death: '/assets/gameplay/animations/common-death.json'
    }
  }
];

export const ACTION_LABELS: Record<string, string> = {
  idle: '待机 (Idle)',
  run: '奔跑 (Run)',
  jump: '跳跃 (Jump)',
  roll: '战术翻滚 (Roll)',
  attack: '攻击/射击 (Attack)',
  attack2: '连击二段 (Attack 2)',
  attack3: '连击三段 (Attack 3)',
  spurt: '战术冲刺 (Spurt)',
  reload: '快速换弹 (Reload)',
  hit: '受击硬直 (Hit)',
  death: '阵亡倒地 (Death)'
};

/**
 * 14 大类武器战斗性能与手感配置 (沙盒与正式游戏全局同源共用)
 */
export interface WeaponCombatProfile {
  name: string;
  kind: 'melee' | 'grenade' | 'rocket' | 'arrow' | 'bullet';
  damage: number;
  pellets: number;
  spread: number;
  fireDelay: number;
  magCapacity: number;
  reloadTime: number;
  fireAudio: string;
  reloadAudio?: string;
  isAutomatic: boolean;
  headshotMultiplier: number;
}

export const WEAPON_COMBAT_PROFILES: Record<string, WeaponCombatProfile> = {
  smg_01: {
    name: '冲锋枪 (SMG)',
    kind: 'bullet',
    damage: 115,
    pellets: 1,
    spread: 0.035,
    fireDelay: 0.11,
    magCapacity: 30,
    reloadTime: 1.8,
    fireAudio: 'fire-smg',
    reloadAudio: 'reload_smg',
    isAutomatic: true,
    headshotMultiplier: 2.0
  },
  pistol_01: {
    name: '手枪 (Pistol)',
    kind: 'bullet',
    damage: 240,
    pellets: 1,
    spread: 0.012,
    fireDelay: 0.35,
    magCapacity: 12,
    reloadTime: 1.6,
    fireAudio: 'fire-pistol',
    reloadAudio: 'reload_pistol',
    isAutomatic: false,
    headshotMultiplier: 2.2
  },
  shotgun_01: {
    name: '霰弹枪 (Shotgun)',
    kind: 'bullet',
    damage: 135,
    pellets: 7,
    spread: 0.075,
    fireDelay: 0.85,
    magCapacity: 8,
    reloadTime: 2.2,
    fireAudio: 'fire-shotgun',
    reloadAudio: 'reload_shotgun',
    isAutomatic: false,
    headshotMultiplier: 1.8
  },
  sniperrifle_01: {
    name: '狙击步枪 (Sniper)',
    kind: 'bullet',
    damage: 1250,
    pellets: 1,
    spread: 0.002,
    fireDelay: 1.25,
    magCapacity: 5,
    reloadTime: 2.5,
    fireAudio: 'fire-sniperrifle',
    reloadAudio: 'reload_sniper',
    isAutomatic: false,
    headshotMultiplier: 2.5
  },
  machinegun_01: {
    name: '重机枪 (Machinegun)',
    kind: 'bullet',
    damage: 130,
    pellets: 1,
    spread: 0.045,
    fireDelay: 0.12,
    magCapacity: 80,
    reloadTime: 3.0,
    fireAudio: 'fire-machinegun',
    reloadAudio: 'reload_machinegun',
    isAutomatic: true,
    headshotMultiplier: 2.0
  },
  knives_01: {
    name: '近战军刀 (Knives)',
    kind: 'melee',
    damage: 720,
    pellets: 1,
    spread: 0,
    fireDelay: 0.45,
    magCapacity: 0,
    reloadTime: 0,
    fireAudio: 'fire-knives',
    isAutomatic: true,
    headshotMultiplier: 1.5
  },
  stick_sh01: {
    name: '战术战棍 (Stick)',
    kind: 'melee',
    damage: 680,
    pellets: 1,
    spread: 0,
    fireDelay: 0.48,
    magCapacity: 0,
    reloadTime: 0,
    fireAudio: 'fire-knives',
    isAutomatic: true,
    headshotMultiplier: 1.6
  },
  shield_01: {
    name: '战术盾牌 (Shield)',
    kind: 'melee',
    damage: 520,
    pellets: 1,
    spread: 0,
    fireDelay: 0.50,
    magCapacity: 0,
    reloadTime: 0,
    fireAudio: 'fire-shield',
    isAutomatic: true,
    headshotMultiplier: 1.3
  },
  bow_01: {
    name: '复合弓 (Bow)',
    kind: 'arrow',
    damage: 780,
    pellets: 1,
    spread: 0.008,
    fireDelay: 0.75,
    magCapacity: 1,
    reloadTime: 1.0,
    fireAudio: 'fire-bow',
    isAutomatic: false,
    headshotMultiplier: 2.4
  },
  crossbow_03: {
    name: '战术十字弩 (Crossbow)',
    kind: 'arrow',
    damage: 850,
    pellets: 1,
    spread: 0.005,
    fireDelay: 0.7,
    magCapacity: 1,
    reloadTime: 1.1,
    fireAudio: 'fire-crossbow',
    isAutomatic: false,
    headshotMultiplier: 2.5
  },
  rpg_01: {
    name: '火箭筒 (RPG)',
    kind: 'rocket',
    damage: 1500,
    pellets: 1,
    spread: 0.01,
    fireDelay: 1.4,
    magCapacity: 1,
    reloadTime: 2.2,
    fireAudio: 'fire-rpg',
    reloadAudio: 'reload_rpg',
    isAutomatic: false,
    headshotMultiplier: 1.0
  },
  grenadelauncher_01: {
    name: '榴弹发射器 (GrenadeLauncher)',
    kind: 'grenade',
    damage: 1100,
    pellets: 1,
    spread: 0.02,
    fireDelay: 0.8,
    magCapacity: 6,
    reloadTime: 2.4,
    fireAudio: 'fire-grenadelauncher',
    reloadAudio: 'reload_grenadelauncher',
    isAutomatic: false,
    headshotMultiplier: 1.0
  },
  sprayer_01: {
    name: '生化喷射器 (Sprayer)',
    kind: 'bullet',
    damage: 75,
    pellets: 1,
    spread: 0.055,
    fireDelay: 0.08,
    magCapacity: 60,
    reloadTime: 2.0,
    fireAudio: 'sprayer',
    reloadAudio: 'reload_sprayer',
    isAutomatic: true,
    headshotMultiplier: 1.5
  },
  grenade_01: {
    name: '战术手雷 (Grenade)',
    kind: 'grenade',
    damage: 1350,
    pellets: 1,
    spread: 0.02,
    fireDelay: 1.2,
    magCapacity: 1,
    reloadTime: 1.5,
    fireAudio: 'fire-grenade',
    isAutomatic: false,
    headshotMultiplier: 1.0
  }
};

const FAMILY_PROFILE_MAP: Record<string, string> = {
  smg: 'smg_01',
  pistol: 'pistol_01',
  shotgun: 'shotgun_01',
  sniperrifle: 'sniperrifle_01',
  machinegun: 'machinegun_01',
  knives: 'knives_01',
  stick: 'stick_sh01',
  shield: 'shield_01',
  bow: 'bow_01',
  crossbow: 'crossbow_03',
  rpg: 'rpg_01',
  grenadelauncher: 'grenadelauncher_01',
  sprayer: 'sprayer_01',
  grenade: 'grenade_01'
};

/**
 * 根据任意武器 ID (如 smg_01, knives_47, crossbow_03) 解析对应的战斗性能配置
 */
export function getWeaponCombatProfile(weaponId: string): WeaponCombatProfile {
  if (!weaponId) return WEAPON_COMBAT_PROFILES.smg_01;
  if (WEAPON_COMBAT_PROFILES[weaponId]) return WEAPON_COMBAT_PROFILES[weaponId];
  const family = weaponId.split('_')[0].toLowerCase();
  const mappedKey = FAMILY_PROFILE_MAP[family];
  return (mappedKey && WEAPON_COMBAT_PROFILES[mappedKey]) || WEAPON_COMBAT_PROFILES.smg_01;
}

/**
 * 根据武器 ID 自动匹配对应的武器跑跳动作套件
 */
export function getWeaponActionSuite(weaponId: string): WeaponActionSet {
  if (!weaponId) return WEAPON_SUITES[0];
  const exact = WEAPON_SUITES.find((s) => s.id.toLowerCase() === weaponId.toLowerCase());
  if (exact) return exact;
  const family = weaponId.split('_')[0].toLowerCase();
  return WEAPON_SUITES.find((s) => s.id.toLowerCase().startsWith(family)) || WEAPON_SUITES[0];
}

