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
      idle: '/assets/creation/idle.json',
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
      idle: '/assets/creation/idle.json',
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
      idle: '/assets/creation/idle.json',
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
      idle: '/assets/creation/idle.json',
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
      idle: '/assets/creation/idle.json',
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
      idle: '/assets/creation/idle.json',
      run: '/assets/gameplay/animations/knives_01-run.json',
      jump: '/assets/gameplay/animations/knives_01-jump.json',
      roll: '/assets/gameplay/animations/knives_01-roll.json',
      attack: '/assets/gameplay/animations/knives_01-attack.json',
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
      idle: '/assets/creation/idle.json',
      run: '/assets/gameplay/animations/shield_01-run.json',
      jump: '/assets/gameplay/animations/shield_01-jump.json',
      roll: '/assets/gameplay/animations/shield_01-roll.json',
      attack: '/assets/gameplay/animations/shield_01-attack.json',
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
      idle: '/assets/creation/idle.json',
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
      idle: '/assets/creation/idle.json',
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
      idle: '/assets/creation/idle.json',
      run: '/assets/gameplay/animations/sprayer_01-run.json',
      jump: '/assets/gameplay/animations/smg_01-jump.json',
      roll: '/assets/gameplay/animations/smg_01-roll.json',
      attack: '/assets/gameplay/animations/sprayer_01-attack.json',
      reload: '/assets/gameplay/animations/sprayer_01-reload.json',
      hit: '/assets/gameplay/animations/common-hit.json',
      death: '/assets/gameplay/animations/common-death.json'
    }
  },
  {
    id: 'grenade_01',
    name: '战术手雷套件 (Grenade)',
    actions: {
      idle: '/assets/creation/idle.json',
      run: '/assets/gameplay/animations/grenade_01-run.json',
      jump: '/assets/gameplay/animations/grenade_01-jump.json',
      roll: '/assets/gameplay/animations/grenade_01-roll.json',
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
  attack: '近战攻击 (Attack)',
  reload: '快速换弹 (Reload)',
  hit: '受击硬直 (Hit)',
  death: '阵亡倒地 (Death)'
};

/**
 * 根据武器 ID 自动匹配对应的武器跑跳动作套件
 */
export function getWeaponActionSuite(weaponId: string): WeaponActionSet {
  if (!weaponId) return WEAPON_SUITES[0];
  const family = weaponId.split('_')[0].toLowerCase();
  return WEAPON_SUITES.find((s) => s.id.toLowerCase().startsWith(family)) || WEAPON_SUITES[0];
}
