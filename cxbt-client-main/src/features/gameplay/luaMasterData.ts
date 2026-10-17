// Auto-generated 1:1 from AvatarStar_cache & AvatarStar_zh_cn_cache (1,052 Lua files)
export interface LuaBattleItemSpec {
  id: string;
  name: string;
  desc: string;
  iconUrl: string;
  rawIcon?: string;
  heal: number;
  speedBoost: number;
  damageBoost: number;
  defenseBoost: number;
  isReviveTicket: boolean;
  reviveAll: boolean;
  buffId: number;
  hotkey: string;
  cooldown: number;
}

export interface LuaPetSpec {
  id: string;
  name: string;
  modelUrl: string;
  offset: [number, number, number];
  responseTime: number;
  distanceMax: number;
  followTurnTime: number;
  speedRatio: number;
  levelSizes: Record<string, [number, number, number]>;
  levelTextures: Record<string, string>;
}

export interface LuaHitShapeSpec {
  bone: string;
  zone: 'head' | 'chest' | 'hip' | 'arm' | 'leg';
  damageMultiplier: number;
  radius: number;
}

// Ported 1:1 from AvatarStar_cache/scripts/shapes.lua
export const LUA_HIT_SHAPES: LuaHitShapeSpec[] = [
  { bone: 'head', zone: 'head', damageMultiplier: 2.0, radius: 0.31 },
  { bone: 'chest', zone: 'chest', damageMultiplier: 1.0, radius: 0.26 },
  { bone: 'back_b', zone: 'chest', damageMultiplier: 1.0, radius: 0.24 },
  { bone: 'hip', zone: 'hip', damageMultiplier: 0.9, radius: 0.22 },
  { bone: 'arm_l', zone: 'arm', damageMultiplier: 0.85, radius: 0.19 },
  { bone: 'arm_r', zone: 'arm', damageMultiplier: 0.85, radius: 0.19 },
  { bone: 'leg_l', zone: 'leg', damageMultiplier: 0.78, radius: 0.18 },
  { bone: 'leg_r', zone: 'leg', damageMultiplier: 0.78, radius: 0.18 }
];

// Ported 1:1 from AvatarStar_cache/character/die_effect/*.lua (20 directional ragdoll/knockback presets)
export const LUA_DIE_EFFECTS: Record<string, { bone: string; force: [number, number, number] }[]> = {
  "chest_back_die": [
    {
      "bone": "chest",
      "force": [
        -1,
        1,
        6
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        10,
        0,
        -20
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        -10,
        -10,
        -20
      ]
    },
    {
      "bone": "ankle_l",
      "force": [
        25,
        -20,
        -50
      ]
    },
    {
      "bone": "ankle_r",
      "force": [
        -30,
        -20,
        -50
      ]
    }
  ],
  "chest_front_die": [
    {
      "bone": "chest",
      "force": [
        -1,
        2,
        -5
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        50,
        -10,
        100
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        -50,
        -10,
        100
      ]
    },
    {
      "bone": "ankle_l",
      "force": [
        30,
        -20,
        100
      ]
    },
    {
      "bone": "ankle_r",
      "force": [
        -30,
        -20,
        100
      ]
    }
  ],
  "chest_left_die": [
    {
      "bone": "chest",
      "force": [
        -300,
        50,
        200
      ]
    },
    {
      "bone": "hip",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        -50,
        -20,
        -20
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        0,
        -20,
        -20
      ]
    },
    {
      "bone": "ankle_l",
      "force": [
        50,
        -70,
        -50
      ]
    },
    {
      "bone": "ankle_r",
      "force": [
        -50,
        -70,
        -50
      ]
    }
  ],
  "chest_right_die": [
    {
      "bone": "chest",
      "force": [
        100,
        400,
        -200
      ]
    },
    {
      "bone": "hip",
      "force": [
        50,
        50,
        -50
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        50,
        0,
        100
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        -50,
        -50,
        100
      ]
    },
    {
      "bone": "ankle_l",
      "force": [
        50,
        -30,
        0
      ]
    },
    {
      "bone": "ankle_r",
      "force": [
        -50,
        -30,
        0
      ]
    }
  ],
  "head_back_die": [
    {
      "bone": "head",
      "force": [
        0,
        300,
        500
      ]
    },
    {
      "bone": "chest",
      "force": [
        0,
        0,
        100
      ]
    },
    {
      "bone": "hip",
      "force": [
        0,
        0,
        -100
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        0,
        -50,
        20
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        -50,
        -50,
        20
      ]
    },
    {
      "bone": "ankle_l",
      "force": [
        10,
        0,
        0
      ]
    },
    {
      "bone": "ankle_r",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "knee_l",
      "force": [
        40,
        -80,
        0
      ]
    },
    {
      "bone": "knee_r",
      "force": [
        -10,
        -80,
        0
      ]
    }
  ],
  "head_front_die": [
    {
      "bone": "head",
      "force": [
        -100,
        150,
        -300
      ]
    },
    {
      "bone": "chest",
      "force": [
        0,
        300,
        -150
      ]
    },
    {
      "bone": "hip",
      "force": [
        0,
        0,
        100
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        -20,
        0,
        20
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        -40,
        0,
        20
      ]
    },
    {
      "bone": "knee_l",
      "force": [
        15,
        -50,
        0
      ]
    },
    {
      "bone": "knee_r",
      "force": [
        -10,
        -50,
        0
      ]
    }
  ],
  "head_left_die": [
    {
      "bone": "head",
      "force": [
        -200,
        200,
        150
      ]
    },
    {
      "bone": "chest",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "hip",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        -10,
        0,
        20
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        -10,
        -10,
        20
      ]
    },
    {
      "bone": "ankle_l",
      "force": [
        50,
        -50,
        0
      ]
    },
    {
      "bone": "ankle_r",
      "force": [
        -20,
        -50,
        0
      ]
    }
  ],
  "head_right_die": [
    {
      "bone": "head",
      "force": [
        100,
        100,
        -200
      ]
    },
    {
      "bone": "hip",
      "force": [
        -150,
        0,
        100
      ]
    },
    {
      "bone": "ankle_l",
      "force": [
        20,
        -50,
        0
      ]
    },
    {
      "bone": "ankle_r",
      "force": [
        -20,
        -50,
        0
      ]
    }
  ],
  "hip_back_die": [
    {
      "bone": "chest",
      "force": [
        0,
        100,
        300
      ]
    },
    {
      "bone": "hip",
      "force": [
        0,
        0,
        300
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        50,
        0,
        -20
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        -50,
        0,
        -20
      ]
    },
    {
      "bone": "knee_l",
      "force": [
        50,
        -100,
        -50
      ]
    },
    {
      "bone": "knee_r",
      "force": [
        -50,
        -100,
        -50
      ]
    }
  ],
  "hip_front_die": [
    {
      "bone": "chest",
      "force": [
        0,
        0,
        -100
      ]
    },
    {
      "bone": "hip",
      "force": [
        0,
        150,
        -500
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        50,
        -30,
        50
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        -50,
        -30,
        50
      ]
    },
    {
      "bone": "knee_l",
      "force": [
        50,
        0,
        200
      ]
    },
    {
      "bone": "knee_r",
      "force": [
        -50,
        0,
        200
      ]
    }
  ],
  "hip_left_die": [
    {
      "bone": "chest",
      "force": [
        -50,
        60,
        0
      ]
    },
    {
      "bone": "hip",
      "force": [
        -100,
        0,
        50
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        50,
        0,
        20
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        -50,
        0,
        20
      ]
    },
    {
      "bone": "ankle_l",
      "force": [
        20,
        -20,
        0
      ]
    },
    {
      "bone": "ankle_r",
      "force": [
        -30,
        -20,
        0
      ]
    }
  ],
  "hip_right_die": [
    {
      "bone": "chest",
      "force": [
        50,
        100,
        -100
      ]
    },
    {
      "bone": "hip",
      "force": [
        150,
        0,
        -200
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        -50,
        0,
        50
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        -25,
        0,
        50
      ]
    },
    {
      "bone": "ankle_l",
      "force": [
        50,
        0,
        50
      ]
    },
    {
      "bone": "ankle_r",
      "force": [
        -50,
        0,
        50
      ]
    }
  ],
  "leg_l_back_die": [
    {
      "bone": "head",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "shoulder_l",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "chest",
      "force": [
        0,
        -20,
        -20
      ]
    },
    {
      "bone": "hip",
      "force": [
        0,
        180,
        20
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        30,
        -30,
        0
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        -20,
        -30,
        20
      ]
    },
    {
      "bone": "leg_l",
      "force": [
        0,
        0,
        10
      ]
    },
    {
      "bone": "leg_r",
      "force": [
        0,
        0,
        -10
      ]
    },
    {
      "bone": "knee_l",
      "force": [
        0,
        0,
        10
      ]
    },
    {
      "bone": "knee_r",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "ankle_l",
      "force": [
        20,
        30,
        100
      ]
    },
    {
      "bone": "ankle_r",
      "force": [
        -20,
        60,
        60
      ]
    }
  ],
  "leg_l_front_die": [
    {
      "bone": "shoulder_l",
      "force": [
        30,
        0,
        30
      ]
    },
    {
      "bone": "chest",
      "force": [
        30,
        20,
        30
      ]
    },
    {
      "bone": "hip",
      "force": [
        30,
        40,
        -30
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        10,
        -10,
        0
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        -10,
        -10,
        20
      ]
    },
    {
      "bone": "leg_l",
      "force": [
        0,
        0,
        30
      ]
    },
    {
      "bone": "leg_r",
      "force": [
        0,
        0,
        -10
      ]
    },
    {
      "bone": "knee_l",
      "force": [
        0,
        0,
        30
      ]
    },
    {
      "bone": "knee_r",
      "force": [
        -50,
        0,
        0
      ]
    },
    {
      "bone": "ankle_l",
      "force": [
        80,
        50,
        -200
      ]
    },
    {
      "bone": "ankle_r",
      "force": [
        -10,
        -5,
        -50
      ]
    }
  ],
  "leg_l_left_die": [
    {
      "bone": "head",
      "force": [
        30,
        0,
        0
      ]
    },
    {
      "bone": "shoulder_l",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "chest",
      "force": [
        100,
        -20,
        -20
      ]
    },
    {
      "bone": "hip",
      "force": [
        -30,
        140,
        -50
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        10,
        -10,
        0
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        -10,
        -15,
        10
      ]
    },
    {
      "bone": "leg_l",
      "force": [
        0,
        0,
        10
      ]
    },
    {
      "bone": "leg_r",
      "force": [
        0,
        0,
        -10
      ]
    },
    {
      "bone": "knee_l",
      "force": [
        0,
        0,
        10
      ]
    },
    {
      "bone": "knee_r",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "ankle_l",
      "force": [
        -130,
        30,
        50
      ]
    },
    {
      "bone": "ankle_r",
      "force": [
        -50,
        30,
        0
      ]
    }
  ],
  "leg_l_right_die": [
    {
      "bone": "head",
      "force": [
        30,
        0,
        0
      ]
    },
    {
      "bone": "shoulder_l",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "chest",
      "force": [
        -100,
        -20,
        -20
      ]
    },
    {
      "bone": "hip",
      "force": [
        30,
        140,
        -50
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        10,
        -10,
        0
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        10,
        -15,
        10
      ]
    },
    {
      "bone": "leg_l",
      "force": [
        0,
        0,
        10
      ]
    },
    {
      "bone": "leg_r",
      "force": [
        0,
        0,
        -10
      ]
    },
    {
      "bone": "knee_l",
      "force": [
        0,
        0,
        10
      ]
    },
    {
      "bone": "knee_r",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "ankle_l",
      "force": [
        130,
        30,
        0
      ]
    },
    {
      "bone": "ankle_r",
      "force": [
        50,
        30,
        -10
      ]
    }
  ],
  "leg_r_back_die": [
    {
      "bone": "head",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "shoulder_l",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "chest",
      "force": [
        0,
        -20,
        -20
      ]
    },
    {
      "bone": "hip",
      "force": [
        0,
        180,
        20
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        30,
        -30,
        0
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        -20,
        -30,
        20
      ]
    },
    {
      "bone": "leg_l",
      "force": [
        0,
        0,
        10
      ]
    },
    {
      "bone": "leg_r",
      "force": [
        0,
        0,
        -10
      ]
    },
    {
      "bone": "knee_l",
      "force": [
        0,
        0,
        10
      ]
    },
    {
      "bone": "knee_r",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "ankle_r",
      "force": [
        -20,
        30,
        100
      ]
    },
    {
      "bone": "ankle_l",
      "force": [
        20,
        60,
        60
      ]
    }
  ],
  "leg_r_front_die": [
    {
      "bone": "shoulder_l",
      "force": [
        30,
        0,
        30
      ]
    },
    {
      "bone": "chest",
      "force": [
        30,
        20,
        30
      ]
    },
    {
      "bone": "hip",
      "force": [
        30,
        40,
        -30
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        10,
        -10,
        0
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        -10,
        -10,
        20
      ]
    },
    {
      "bone": "leg_l",
      "force": [
        0,
        0,
        30
      ]
    },
    {
      "bone": "leg_r",
      "force": [
        0,
        0,
        -10
      ]
    },
    {
      "bone": "knee_l",
      "force": [
        0,
        0,
        30
      ]
    },
    {
      "bone": "knee_r",
      "force": [
        -50,
        0,
        0
      ]
    },
    {
      "bone": "ankle_r",
      "force": [
        -80,
        50,
        -200
      ]
    },
    {
      "bone": "ankle_l",
      "force": [
        10,
        -5,
        -50
      ]
    }
  ],
  "leg_r_left_die": [
    {
      "bone": "head",
      "force": [
        30,
        0,
        0
      ]
    },
    {
      "bone": "shoulder_l",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "chest",
      "force": [
        100,
        -20,
        -20
      ]
    },
    {
      "bone": "hip",
      "force": [
        -30,
        140,
        -50
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        10,
        -10,
        0
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        -10,
        -15,
        10
      ]
    },
    {
      "bone": "leg_l",
      "force": [
        0,
        0,
        10
      ]
    },
    {
      "bone": "leg_r",
      "force": [
        0,
        0,
        -10
      ]
    },
    {
      "bone": "knee_l",
      "force": [
        0,
        0,
        10
      ]
    },
    {
      "bone": "knee_r",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "ankle_r",
      "force": [
        -130,
        30,
        50
      ]
    },
    {
      "bone": "ankle_l",
      "force": [
        -50,
        30,
        0
      ]
    }
  ],
  "leg_r_right_die": [
    {
      "bone": "head",
      "force": [
        30,
        0,
        0
      ]
    },
    {
      "bone": "shoulder_l",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "chest",
      "force": [
        -100,
        -20,
        -20
      ]
    },
    {
      "bone": "hip",
      "force": [
        30,
        140,
        -50
      ]
    },
    {
      "bone": "wrist_l",
      "force": [
        10,
        -10,
        0
      ]
    },
    {
      "bone": "wrist_r",
      "force": [
        10,
        -15,
        10
      ]
    },
    {
      "bone": "leg_l",
      "force": [
        0,
        0,
        10
      ]
    },
    {
      "bone": "leg_r",
      "force": [
        0,
        0,
        -10
      ]
    },
    {
      "bone": "knee_l",
      "force": [
        0,
        0,
        10
      ]
    },
    {
      "bone": "knee_r",
      "force": [
        0,
        0,
        0
      ]
    },
    {
      "bone": "ankle_r",
      "force": [
        130,
        30,
        -10
      ]
    },
    {
      "bone": "ankle_l",
      "force": [
        50,
        30,
        10
      ]
    }
  ]
};

// Ported 1:1 from AvatarStar_cache/item/*.lua (14 battle consumables & revival tickets)
export const LUA_BATTLE_ITEMS: LuaBattleItemSpec[] = [
  {
    "id": "bandage_02",
    "name": "高级战地绷带",
    "desc": "立即恢复 350 点生命值，并解除流血状态",
    "rawIcon": "/ui/skinF/lobby/bandage_02.tga",
    "iconUrl": "/assets/lobby/icons/bandage_02.png",
    "heal": 350,
    "speedBoost": 1,
    "damageBoost": 1,
    "defenseBoost": 0,
    "isReviveTicket": false,
    "reviveAll": false,
    "buffId": 20,
    "hotkey": "5",
    "cooldown": 8
  },
  {
    "id": "bengdai",
    "name": "标准止血绷带",
    "desc": "立即恢复 220 点生命值",
    "rawIcon": "/ui/skinF/lobby/bengdai.tga",
    "iconUrl": "/assets/lobby/icons/bengdai.png",
    "heal": 220,
    "speedBoost": 1,
    "damageBoost": 1,
    "defenseBoost": 0,
    "isReviveTicket": false,
    "reviveAll": false,
    "buffId": 20,
    "hotkey": "5",
    "cooldown": 6
  },
  {
    "id": "food_cookies",
    "name": "行军能量饼干",
    "desc": "持续恢复 300 点生命值并提升 10% 移速",
    "rawIcon": "/ui/skinF/lobby/food_cookies.tga",
    "iconUrl": "/assets/lobby/icons/food_cookies.png",
    "heal": 300,
    "speedBoost": 1.1,
    "damageBoost": 1,
    "defenseBoost": 0,
    "isReviveTicket": false,
    "reviveAll": false,
    "buffId": 21,
    "hotkey": "6",
    "cooldown": 10
  },
  {
    "id": "food_ham",
    "name": "战地烟熏火腿",
    "desc": "立即恢复 450 点生命值并提升 15% 防御",
    "rawIcon": "/ui/skinF/lobby/food_ham.tga",
    "iconUrl": "/assets/lobby/icons/food_ham.png",
    "heal": 450,
    "speedBoost": 1,
    "damageBoost": 1,
    "defenseBoost": 0.15,
    "isReviveTicket": false,
    "reviveAll": false,
    "buffId": 21,
    "hotkey": "6",
    "cooldown": 12
  },
  {
    "id": "food_lobster",
    "name": "皇家龙虾大餐",
    "desc": "立即恢复 650 点生命值并全属性小幅提升",
    "rawIcon": "/ui/skinF/lobby/food_lobster.tga",
    "iconUrl": "/assets/lobby/icons/food_lobster.png",
    "heal": 650,
    "speedBoost": 1,
    "damageBoost": 1.15,
    "defenseBoost": 0,
    "isReviveTicket": false,
    "reviveAll": false,
    "buffId": 21,
    "hotkey": "6",
    "cooldown": 15
  },
  {
    "id": "gift_mooncake",
    "name": "星际中秋月饼",
    "desc": "恢复 400 点生命值并重置技能冷却 20%",
    "rawIcon": "/ui/skinF/lobby/gift_mooncake.tga",
    "iconUrl": "/assets/lobby/icons/gift_mooncake.png",
    "heal": 400,
    "speedBoost": 1,
    "damageBoost": 1,
    "defenseBoost": 0,
    "isReviveTicket": false,
    "reviveAll": false,
    "buffId": 21,
    "hotkey": "6",
    "cooldown": 12
  },
  {
    "id": "gift_sweet",
    "name": "缤纷庆典糖果",
    "desc": "恢复 280 点生命值，移动速度提升 18%",
    "rawIcon": "/ui/skinF/lobby/gift_sweet.tga",
    "iconUrl": "/assets/lobby/icons/gift_sweet.png",
    "heal": 280,
    "speedBoost": 1.18,
    "damageBoost": 1,
    "defenseBoost": 0,
    "isReviveTicket": false,
    "reviveAll": false,
    "buffId": 21,
    "hotkey": "6",
    "cooldown": 10
  },
  {
    "id": "gift_zongzi",
    "name": "端午龙舟香粽",
    "desc": "恢复 420 点生命值，暴击伤害提升 15%",
    "rawIcon": "/ui/skinF/lobby/gift_zongzi.tga",
    "iconUrl": "/assets/lobby/icons/gift_zongzi.png",
    "heal": 420,
    "speedBoost": 1,
    "damageBoost": 1.15,
    "defenseBoost": 0,
    "isReviveTicket": false,
    "reviveAll": false,
    "buffId": 21,
    "hotkey": "6",
    "cooldown": 12
  },
  {
    "id": "instrument_life",
    "name": "生命守护仪",
    "desc": "展开生命护盾光环，减免 35% 伤害并每秒回血",
    "rawIcon": "/ui/skinF/lobby/instrument_life.tga",
    "iconUrl": "/assets/lobby/icons/instrument_life.png",
    "heal": 300,
    "speedBoost": 1,
    "damageBoost": 1,
    "defenseBoost": 0.35,
    "isReviveTicket": false,
    "reviveAll": false,
    "buffId": 29,
    "hotkey": "6",
    "cooldown": 20
  },
  {
    "id": "leechdom_blood_serum",
    "name": "超级强化血清",
    "desc": "恢复 500 点生命值，攻击力提升 25% 持续 8 秒",
    "rawIcon": "/ui/skinF/lobby/leechdom_blood_serum.tga",
    "iconUrl": "/assets/lobby/icons/leechdom_blood_serum.png",
    "heal": 500,
    "speedBoost": 1,
    "damageBoost": 1.25,
    "defenseBoost": 0,
    "isReviveTicket": false,
    "reviveAll": false,
    "buffId": 23,
    "hotkey": "5",
    "cooldown": 15
  },
  {
    "id": "leechdom_cardiac",
    "name": "战地强心针剂",
    "desc": "恢复 400 点生命值，射速与移速提升 25% 持续 8 秒",
    "rawIcon": "/ui/skinF/lobby/leechdom_cardiac.tga",
    "iconUrl": "/assets/lobby/icons/leechdom_cardiac.png",
    "heal": 400,
    "speedBoost": 1.25,
    "damageBoost": 1,
    "defenseBoost": 0,
    "isReviveTicket": false,
    "reviveAll": false,
    "buffId": 22,
    "hotkey": "5",
    "cooldown": 14
  },
  {
    "id": "leechdom_first_aid_kit",
    "name": "全能医疗急救箱",
    "desc": "立即恢复 800 点生命值，并张开全队治疗光环",
    "rawIcon": "/ui/skinF/lobby/leechdom_first_aid_kit.tga",
    "iconUrl": "/assets/lobby/icons/leechdom_first_aid_kit.png",
    "heal": 800,
    "speedBoost": 1,
    "damageBoost": 1,
    "defenseBoost": 0,
    "isReviveTicket": false,
    "reviveAll": false,
    "buffId": 25,
    "hotkey": "5",
    "cooldown": 18
  },
  {
    "id": "ticket_anabiosis",
    "name": "个人复活币",
    "desc": "阵亡等待复活时按 [R] 立即满血满弹药原地复活并获得无敌护盾",
    "rawIcon": "/ui/skinF/lobby/ticket_anabiosis.tga",
    "iconUrl": "/assets/lobby/icons/ticket_anabiosis.png",
    "heal": 9999,
    "speedBoost": 1,
    "damageBoost": 1,
    "defenseBoost": 0,
    "isReviveTicket": true,
    "reviveAll": false,
    "buffId": 28,
    "hotkey": "R",
    "cooldown": 3
  },
  {
    "id": "ticket_anabiosis_all",
    "name": "全队复活圣币",
    "desc": "阵亡时按 [R] 立即满血复活并激励全队恢复 50% 生命值",
    "rawIcon": "/ui/skinF/lobby/ticket_anabiosis_all.tga",
    "iconUrl": "/assets/lobby/icons/ticket_anabiosis_all.png",
    "heal": 9999,
    "speedBoost": 1,
    "damageBoost": 1,
    "defenseBoost": 0,
    "isReviveTicket": true,
    "reviveAll": true,
    "buffId": 28,
    "hotkey": "R",
    "cooldown": 5
  }
];

// Ported 1:1 from AvatarStar_cache/pet/*.lua (16 companion pets)
export const LUA_PETS: Record<string, LuaPetSpec> = {
  "bird": {
    "id": "bird",
    "name": "机械战鹰 · Ⅰ型",
    "modelUrl": "/assets/lobby/models/bird.glb",
    "offset": [
      -1,
      1,
      0
    ],
    "responseTime": 0.4,
    "distanceMax": 8,
    "followTurnTime": 0.4,
    "speedRatio": 1,
    "levelSizes": {
      "3": [
        1.2,
        1.2,
        1.2
      ],
      "4": [
        1.4,
        1.4,
        1.4
      ]
    },
    "levelTextures": {
      "3": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/bird/Tex_bird01a_trinket_c.png",
      "4": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/bird/Tex_bird01b_trinket_c.png"
    }
  },
  "bird02": {
    "id": "bird02",
    "name": "苍穹雷鹰 · Ⅱ型",
    "modelUrl": "/assets/lobby/models/bird02.glb",
    "offset": [
      -1,
      1,
      0
    ],
    "responseTime": 0.4,
    "distanceMax": 8,
    "followTurnTime": 0.4,
    "speedRatio": 1,
    "levelSizes": {
      "3": [
        1.35,
        1.35,
        1.35
      ],
      "4": [
        1.44,
        1.44,
        1.44
      ]
    },
    "levelTextures": {
      "3": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/bird02/Tex_bird02a_trinket_d.png",
      "4": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/bird02/Tex_bird02b_trinket_d.png"
    }
  },
  "dog01": {
    "id": "dog01",
    "name": "战地机械犬",
    "modelUrl": "/assets/lobby/models/dog01.glb",
    "offset": [
      -1,
      0,
      0
    ],
    "responseTime": 0.4,
    "distanceMax": 8,
    "followTurnTime": 0.4,
    "speedRatio": 1,
    "levelSizes": {
      "3": [
        1.35,
        1.35,
        1.35
      ],
      "4": [
        1.44,
        1.44,
        1.44
      ]
    },
    "levelTextures": {
      "3": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dog01/Tex_dog01a_trinket_c.png",
      "4": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dog01/Tex_dog01b_trinket_c.png"
    }
  },
  "dragon": {
    "id": "dragon",
    "name": "赤焰幼龙 · 原型",
    "modelUrl": "/assets/lobby/models/dragon.glb",
    "offset": [
      -1,
      1,
      0
    ],
    "responseTime": 0.3,
    "distanceMax": 8,
    "followTurnTime": 0.3,
    "speedRatio": 1,
    "levelSizes": {
      "3": [
        1.3,
        1.3,
        1.3
      ],
      "4": [
        1.5,
        1.5,
        1.5
      ]
    },
    "levelTextures": {
      "3": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon/Tex_dragon01a_trinket_c.png",
      "4": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon/Tex_dragon01b_trinket_c.png"
    }
  },
  "dragon02": {
    "id": "dragon02",
    "name": "翡翠幼龙 · Ⅱ型",
    "modelUrl": "/assets/lobby/models/dragon02.glb",
    "offset": [
      -1,
      1,
      0
    ],
    "responseTime": 0.3,
    "distanceMax": 8,
    "followTurnTime": 0.3,
    "speedRatio": 1,
    "levelSizes": {
      "3": [
        1.3,
        1.3,
        1.3
      ],
      "4": [
        1.5,
        1.5,
        1.5
      ]
    },
    "levelTextures": {
      "3": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon02/Tex_dragon02a_trinket_c.png",
      "4": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon02/Tex_dragon02b_trinket_c.png"
    }
  },
  "dragon03": {
    "id": "dragon03",
    "name": "冰霜幼龙 · Ⅲ型",
    "modelUrl": "/assets/lobby/models/dragon03.glb",
    "offset": [
      -1,
      1,
      0
    ],
    "responseTime": 0.3,
    "distanceMax": 8,
    "followTurnTime": 0.3,
    "speedRatio": 1,
    "levelSizes": {
      "3": [
        1.3,
        1.3,
        1.3
      ],
      "4": [
        1.5,
        1.5,
        1.5
      ]
    },
    "levelTextures": {
      "3": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon03/Tex_dragon03a_trinket_c.png",
      "4": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon03/Tex_dragon03b_trinket_c.png"
    }
  },
  "dragon04": {
    "id": "dragon04",
    "name": "紫晶幼龙 · Ⅳ型",
    "modelUrl": "/assets/lobby/models/dragon04.glb",
    "offset": [
      -1,
      1,
      0
    ],
    "responseTime": 0.3,
    "distanceMax": 8,
    "followTurnTime": 0.3,
    "speedRatio": 1,
    "levelSizes": {
      "3": [
        1.3,
        1.3,
        1.3
      ],
      "4": [
        1.5,
        1.5,
        1.5
      ]
    },
    "levelTextures": {
      "3": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon04/Tex_dragon04a_trinket_c.png",
      "4": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon04/Tex_dragon04b_trinket_c.png"
    }
  },
  "dragon05": {
    "id": "dragon05",
    "name": "黄金圣龙 · Ⅴ型",
    "modelUrl": "/assets/lobby/models/dragon05.glb",
    "offset": [
      -1,
      1,
      0
    ],
    "responseTime": 0.4,
    "distanceMax": 8,
    "followTurnTime": 0.4,
    "speedRatio": 1,
    "levelSizes": {
      "3": [
        1.5,
        1.5,
        1.5
      ],
      "4": [
        1.6,
        1.6,
        1.6
      ]
    },
    "levelTextures": {
      "3": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon05/Tex_dragon05a_trinket_c.png",
      "4": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon05/Tex_dragon05b_trinket_c.png"
    }
  },
  "dragon06": {
    "id": "dragon06",
    "name": "暗影魔龙 · Ⅵ型",
    "modelUrl": "/assets/lobby/models/dragon06.glb",
    "offset": [
      -1,
      1,
      0
    ],
    "responseTime": 0.4,
    "distanceMax": 8,
    "followTurnTime": 0.4,
    "speedRatio": 1,
    "levelSizes": {
      "3": [
        1.5,
        1.5,
        1.5
      ],
      "4": [
        1.7,
        1.7,
        1.7
      ]
    },
    "levelTextures": {
      "3": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon06/Tex_dragon06a_trinket_c.png",
      "4": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon06/Tex_dragon06b_trinket_c.png"
    }
  },
  "dragon07": {
    "id": "dragon07",
    "name": "星界翼龙 · Ⅶ型",
    "modelUrl": "/assets/lobby/models/dragon07.glb",
    "offset": [
      -1,
      1,
      0
    ],
    "responseTime": 0.4,
    "distanceMax": 8,
    "followTurnTime": 0.4,
    "speedRatio": 1,
    "levelSizes": {
      "3": [
        1.5,
        1.5,
        1.5
      ],
      "4": [
        1.6,
        1.6,
        1.6
      ]
    },
    "levelTextures": {
      "3": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon07/Tex_dragon07a_trinket_c.png",
      "4": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon07/Tex_dragon07b_trinket_c.png"
    }
  },
  "dragon08": {
    "id": "dragon08",
    "name": "烈阳神龙 · Ⅷ型",
    "modelUrl": "/assets/lobby/models/dragon08.glb",
    "offset": [
      -1,
      1,
      0
    ],
    "responseTime": 0.4,
    "distanceMax": 8,
    "followTurnTime": 0.4,
    "speedRatio": 1,
    "levelSizes": {
      "3": [
        1.35,
        1.35,
        1.35
      ],
      "4": [
        1.44,
        1.44,
        1.44
      ]
    },
    "levelTextures": {
      "3": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon08/Tex_dragon08a_trinket_d.png",
      "4": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon08/Tex_dragon08b_trinket_d.png"
    }
  },
  "dragon09": {
    "id": "dragon09",
    "name": "深渊冥龙 · Ⅸ型",
    "modelUrl": "/assets/lobby/models/dragon09.glb",
    "offset": [
      -1,
      1,
      0
    ],
    "responseTime": 0.4,
    "distanceMax": 8,
    "followTurnTime": 0.4,
    "speedRatio": 1,
    "levelSizes": {
      "3": [
        1.35,
        1.35,
        1.35
      ],
      "4": [
        1.44,
        1.44,
        1.44
      ]
    },
    "levelTextures": {
      "3": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon09/Tex_dragon09a_trinket_d.png",
      "4": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon09/Tex_dragon09b_trinket_d.png"
    }
  },
  "dragon10": {
    "id": "dragon10",
    "name": "创想终焉龙 · Ⅹ型",
    "modelUrl": "/assets/lobby/models/dragon10.glb",
    "offset": [
      -1,
      1,
      0
    ],
    "responseTime": 0.4,
    "distanceMax": 8,
    "followTurnTime": 0.4,
    "speedRatio": 1,
    "levelSizes": {
      "3": [
        1.35,
        1.35,
        1.35
      ],
      "4": [
        1.44,
        1.44,
        1.44
      ]
    },
    "levelTextures": {
      "3": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon10/Tex_dragon10a_trinket_d.png",
      "4": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/dragon10/Tex_dragon10b_trinket_d.png"
    }
  },
  "fish": {
    "id": "fish",
    "name": "深海泡泡鱼",
    "modelUrl": "/assets/lobby/models/fish.glb",
    "offset": [
      -1,
      1,
      0
    ],
    "responseTime": 0.4,
    "distanceMax": 8,
    "followTurnTime": 0.4,
    "speedRatio": 1,
    "levelSizes": {
      "0": [
        1,
        1,
        1
      ],
      "1": [
        0.6,
        0.6,
        0.6
      ],
      "2": [
        0.75,
        0.75,
        0.75
      ],
      "3": [
        0.9,
        0.9,
        0.9
      ],
      "4": [
        1.1,
        1.1,
        1.1
      ]
    },
    "levelTextures": {
      "0": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/fish/Tex_fish01a_trinket_c.png",
      "1": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/fish/Tex_fish01b_trinket_c.png",
      "2": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/fish/Tex_fish01c_trinket_c.png",
      "3": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/fish/Tex_fish01d_trinket_c.png",
      "4": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/fish/Tex_fish01e_trinket_c.png"
    }
  },
  "human01": {
    "id": "human01",
    "name": "迷你发条人偶",
    "modelUrl": "/assets/lobby/models/human01.glb",
    "offset": [
      -1,
      0,
      0
    ],
    "responseTime": 0.4,
    "distanceMax": 8,
    "followTurnTime": 0.4,
    "speedRatio": 1,
    "levelSizes": {
      "3": [
        1.35,
        1.35,
        1.35
      ],
      "4": [
        1.44,
        1.44,
        1.44
      ]
    },
    "levelTextures": {
      "3": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/human01/Tex_human01a_trinket_c.png",
      "4": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/human01/Tex_human01b_trinket_c.png"
    }
  },
  "monster": {
    "id": "monster",
    "name": "幽冥小恶魔",
    "modelUrl": "/assets/lobby/models/monster.glb",
    "offset": [
      -1,
      1,
      0
    ],
    "responseTime": 0.3,
    "distanceMax": 8,
    "followTurnTime": 0.3,
    "speedRatio": 1,
    "levelSizes": {
      "0": [
        1,
        1,
        1
      ],
      "1": [
        0.6,
        0.6,
        0.6
      ],
      "2": [
        0.75,
        0.75,
        0.75
      ],
      "3": [
        0.9,
        0.9,
        0.9
      ],
      "4": [
        1.1,
        1.1,
        1.1
      ]
    },
    "levelTextures": {
      "0": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/monster/Tex_monster01a_trinket_c.png",
      "1": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/monster/Tex_monster01b_trinket_c.png",
      "2": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/monster/Tex_monster01c_trinket_c.png",
      "3": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/monster/Tex_monster01d_trinket_c.png",
      "4": "/assets/lobby/textures/mesh/character/thirdperson/avatar/indie/pet/monster/Tex_monster01e_trinket_c.png"
    }
  }
};

// Ported 1:1 from AvatarStar_cache/buff/*.lua
export const LUA_BUFF_SPECS: Record<string, {
  id: string;
  iconUrl: string;
  buffSound: string | null;
  stopSound: string | null;
  stopEffect: string | null;
  continuedEffect: string | null;
  effects: { effect: string; bone: string }[];
}> = {
  "0": {
    "id": "0",
    "iconUrl": "/assets/lobby/icons/cure.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "skill_1_cast_effect",
        "bone": "root"
      }
    ]
  },
  "1": {
    "id": "1",
    "iconUrl": "/assets/lobby/icons/energy.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "s_huoli_blue_cross",
        "bone": "root"
      }
    ]
  },
  "2": {
    "id": "2",
    "iconUrl": "/assets/lobby/icons/cure.png",
    "buffSound": "toughness",
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "p_tenacity",
        "bone": "root"
      }
    ]
  },
  "3": {
    "id": "3",
    "iconUrl": "/assets/lobby/icons/rain.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "4": {
    "id": "4",
    "iconUrl": "/assets/lobby/icons/shock.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "s_shock_receive",
        "bone": "root"
      }
    ]
  },
  "5": {
    "id": "5",
    "iconUrl": "/assets/lobby/icons/weak.png",
    "buffSound": "vitals",
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "s_vitals",
        "bone": "root"
      }
    ]
  },
  "6": {
    "id": "6",
    "iconUrl": "/assets/lobby/icons/spurt.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "7": {
    "id": "7",
    "iconUrl": "/assets/lobby/icons/poisoned.png",
    "buffSound": "poison",
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "t_poison",
        "bone": "root"
      }
    ]
  },
  "8": {
    "id": "8",
    "iconUrl": "/assets/lobby/icons/shield.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "skill_7_cast_effect",
        "bone": "root"
      }
    ]
  },
  "9": {
    "id": "9",
    "iconUrl": "/assets/lobby/icons/gallop.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "skill_25_cast_effect",
        "bone": "root"
      }
    ]
  },
  "10": {
    "id": "10",
    "iconUrl": "/assets/lobby/icons/transfer.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "p_transfer_receive",
        "bone": "root"
      }
    ]
  },
  "11": {
    "id": "11",
    "iconUrl": "/assets/lobby/icons/heavy.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "12": {
    "id": "12",
    "iconUrl": "/assets/lobby/icons/tenacity.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "13": {
    "id": "13",
    "iconUrl": "/assets/lobby/icons/vitals.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "14": {
    "id": "14",
    "iconUrl": "/assets/lobby/icons/transfer.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "15": {
    "id": "15",
    "iconUrl": "/assets/lobby/icons/latent.png",
    "buffSound": "cloakon",
    "stopSound": "cloakoff",
    "stopEffect": "t_hiding_end",
    "continuedEffect": null,
    "effects": []
  },
  "16": {
    "id": "16",
    "iconUrl": "/assets/lobby/icons/piercing.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "17": {
    "id": "17",
    "iconUrl": "/assets/lobby/icons/poison.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "19": {
    "id": "19",
    "iconUrl": "/assets/lobby/icons/snare.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "20": {
    "id": "20",
    "iconUrl": "/assets/lobby/icons/bandage_heal.png",
    "buffSound": "cure_bandage",
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "cross",
        "bone": "root"
      }
    ]
  },
  "21": {
    "id": "21",
    "iconUrl": "/assets/lobby/icons/assimilation.png",
    "buffSound": "cure_food",
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "cross_food",
        "bone": "root"
      }
    ]
  },
  "22": {
    "id": "22",
    "iconUrl": "/assets/lobby/icons/leechdom_cardiac.png",
    "buffSound": "stimulant",
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "cross_bloodserum",
        "bone": "root"
      }
    ]
  },
  "23": {
    "id": "23",
    "iconUrl": "/assets/lobby/icons/leechdom_blood_serum.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "cross_bloodserum",
        "bone": "root"
      }
    ]
  },
  "24": {
    "id": "24",
    "iconUrl": "/assets/lobby/icons/leechdom_first aid kit.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "cross_bloodserum",
        "bone": "root"
      }
    ]
  },
  "25": {
    "id": "25",
    "iconUrl": "/assets/lobby/icons/leechdom_first aid kit.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "cross_first",
        "bone": "root"
      }
    ]
  },
  "26": {
    "id": "26",
    "iconUrl": "/assets/lobby/icons/instrument_life.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "27": {
    "id": "27",
    "iconUrl": "/assets/lobby/icons/transfer.png",
    "buffSound": "transfer",
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "p_transfer_absorb",
        "bone": "root"
      }
    ]
  },
  "28": {
    "id": "28",
    "iconUrl": "/assets/lobby/icons/halo_life.png",
    "buffSound": "kill_single",
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "halo_life",
        "bone": "root"
      }
    ]
  },
  "29": {
    "id": "29",
    "iconUrl": "/assets/lobby/icons/halo_defend.png",
    "buffSound": "revive",
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "halo_defend",
        "bone": "root"
      }
    ]
  },
  "30": {
    "id": "30",
    "iconUrl": "/assets/lobby/icons/pet_skill01.png",
    "buffSound": "cure_pet",
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "pet_arouse",
        "bone": "root"
      }
    ]
  },
  "31": {
    "id": "31",
    "iconUrl": "/assets/lobby/icons/bossbuff_zmss.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "32": {
    "id": "32",
    "iconUrl": "/assets/lobby/icons/bossbuff_khlz.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "33": {
    "id": "33",
    "iconUrl": "/assets/lobby/icons/bossbuff_zmhp.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "34": {
    "id": "34",
    "iconUrl": "/assets/lobby/icons/bossbuff_gnhp.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "35": {
    "id": "35",
    "iconUrl": "/assets/lobby/icons/bossbuff_nlhd.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "36": {
    "id": "36",
    "iconUrl": "/assets/lobby/icons/bossbuff_zs.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "37": {
    "id": "37",
    "iconUrl": "/assets/lobby/icons/bossbuff_cnbl.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "38": {
    "id": "38",
    "iconUrl": "/assets/lobby/icons/bossbuff_swzw.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "39": {
    "id": "39",
    "iconUrl": "/assets/lobby/icons/bossbuff_zmgj.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "40": {
    "id": "40",
    "iconUrl": "/assets/lobby/icons/bossbuff_qzmd.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "41": {
    "id": "41",
    "iconUrl": "/assets/lobby/icons/bossbuff_jdxr.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "42": {
    "id": "42",
    "iconUrl": "/assets/lobby/icons/bossbuff_byjr.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "43": {
    "id": "43",
    "iconUrl": "/assets/lobby/icons/bossbuff_jyjg.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "44": {
    "id": "44",
    "iconUrl": "/assets/lobby/icons/bossbuff_lylx.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "45": {
    "id": "45",
    "iconUrl": "/assets/lobby/icons/bossbuff_hjhd.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "46": {
    "id": "46",
    "iconUrl": "/assets/lobby/icons/bossbuff_zwxf.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "47": {
    "id": "47",
    "iconUrl": "/assets/lobby/icons/bossbuff_yhcs.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "48": {
    "id": "48",
    "iconUrl": "/assets/lobby/icons/slowdown.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "b2_decelerate",
        "bone": "root"
      }
    ]
  },
  "49": {
    "id": "49",
    "iconUrl": "/assets/lobby/icons/bossbuff_ss.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "b2_fire1",
        "bone": "root"
      }
    ]
  },
  "50": {
    "id": "50",
    "iconUrl": "/assets/lobby/icons/bossbuff_zrhp.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "51": {
    "id": "51",
    "iconUrl": "/assets/lobby/icons/bossbuff_ryly.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "52": {
    "id": "52",
    "iconUrl": "/assets/lobby/icons/bossbuff_weak.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "53": {
    "id": "53",
    "iconUrl": "/assets/lobby/icons/defenseup.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "aureole_defense",
        "bone": "root"
      }
    ]
  },
  "54": {
    "id": "54",
    "iconUrl": "/assets/lobby/icons/firehurt.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "55": {
    "id": "55",
    "iconUrl": "/assets/lobby/icons/wqshts.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "aureole_fire",
        "bone": "root"
      }
    ]
  },
  "56": {
    "id": "56",
    "iconUrl": "/assets/lobby/icons/bossbuff_hdbd.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "57": {
    "id": "57",
    "iconUrl": "/assets/lobby/icons/defenseup.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "58": {
    "id": "58",
    "iconUrl": "/assets/lobby/icons/fire.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "59": {
    "id": "59",
    "iconUrl": "/assets/lobby/icons/bossbuff_jsyd.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "60": {
    "id": "60",
    "iconUrl": "/assets/lobby/icons/curequantityincrement.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "biochemistry_effect_transmission1",
        "bone": "root"
      }
    ]
  },
  "62": {
    "id": "62",
    "iconUrl": "/assets/lobby/icons/cure.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "biochemistry_effect_transmission2",
        "bone": "root"
      }
    ]
  },
  "63": {
    "id": "63",
    "iconUrl": "/assets/lobby/icons/cure.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "cross_first",
        "bone": "root"
      }
    ]
  },
  "64": {
    "id": "64",
    "iconUrl": "/assets/lobby/icons/disease.png",
    "buffSound": "plague",
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "crossbow_pestilence2",
        "bone": "root"
      }
    ]
  },
  "65": {
    "id": "65",
    "iconUrl": "/assets/lobby/icons/poisoned.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "t_poison",
        "bone": "root"
      }
    ]
  },
  "66": {
    "id": "66",
    "iconUrl": "/assets/lobby/icons/puppet.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "biochemistry_effect_puppet",
        "bone": "root"
      }
    ]
  },
  "67": {
    "id": "67",
    "iconUrl": "/assets/lobby/icons/overdraft.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "68": {
    "id": "68",
    "iconUrl": "/assets/lobby/icons/overreaction.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "biochemistry_effect_excite1",
        "bone": "root"
      }
    ]
  },
  "70": {
    "id": "70",
    "iconUrl": "/assets/lobby/icons/gasbomb.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "71": {
    "id": "71",
    "iconUrl": "/assets/lobby/icons/plague.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "72": {
    "id": "72",
    "iconUrl": "/assets/lobby/icons/suckblood.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "73": {
    "id": "73",
    "iconUrl": "/assets/lobby/icons/overdraft.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "biochemistry_effect_excite2",
        "bone": "root"
      }
    ]
  },
  "74": {
    "id": "74",
    "iconUrl": "/assets/lobby/icons/wild.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "ringleader_frenzy",
        "bone": "root"
      }
    ]
  },
  "75": {
    "id": "75",
    "iconUrl": "/assets/lobby/icons/scream.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "76": {
    "id": "76",
    "iconUrl": "/assets/lobby/icons/result.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "ringleader_defense",
        "bone": "root"
      }
    ]
  },
  "77": {
    "id": "77",
    "iconUrl": "/assets/lobby/icons/decelerate.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "78": {
    "id": "78",
    "iconUrl": "/assets/lobby/icons/scream.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "79": {
    "id": "79",
    "iconUrl": "/assets/lobby/icons/bombgoon.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "skill_spark",
        "bone": "back_b"
      }
    ]
  },
  "80": {
    "id": "80",
    "iconUrl": "/assets/lobby/icons/eatbloodfish.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "fisherman_continue2",
        "bone": "back_b"
      },
      {
        "effect": "fisherman_continue",
        "bone": "hand_r"
      }
    ]
  },
  "81": {
    "id": "81",
    "iconUrl": "/assets/lobby/icons/bombgoon.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "82": {
    "id": "82",
    "iconUrl": "/assets/lobby/icons/decelerate.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "83": {
    "id": "83",
    "iconUrl": "/assets/lobby/icons/wild.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "ringleader_frenzy",
        "bone": "root"
      }
    ]
  },
  "84": {
    "id": "84",
    "iconUrl": "/assets/lobby/icons/wild.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "fisherman_eatfish",
        "bone": "hand_r"
      },
      {
        "effect": "fisherman_eatfish2",
        "bone": "root"
      },
      {
        "effect": "fisherman_eatfish3",
        "bone": "back_b"
      }
    ]
  },
  "85": {
    "id": "85",
    "iconUrl": "/assets/lobby/icons/decelerate.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "86": {
    "id": "86",
    "iconUrl": "/assets/lobby/icons/bombgoon_me.png",
    "buffSound": "miner-burst",
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "87": {
    "id": "87",
    "iconUrl": "/assets/lobby/icons/revengeanger.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "88": {
    "id": "88",
    "iconUrl": "/assets/lobby/icons/bloodpoison.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "89": {
    "id": "89",
    "iconUrl": "/assets/lobby/icons/cure.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "skill_bloodPoison",
        "bone": "back_b"
      }
    ]
  },
  "91": {
    "id": "91",
    "iconUrl": "/assets/lobby/icons/zombiesmell.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "92": {
    "id": "92",
    "iconUrl": "/assets/lobby/icons/cure.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "skill_revengeAnger",
        "bone": "hand_r"
      }
    ]
  },
  "93": {
    "id": "93",
    "iconUrl": "/assets/lobby/icons/bolt.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "94": {
    "id": "94",
    "iconUrl": "/assets/lobby/icons/bolt.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "boss_jingtong_ele_by",
        "bone": "root"
      }
    ]
  },
  "95": {
    "id": "95",
    "iconUrl": "/assets/lobby/icons/bolt.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "96": {
    "id": "96",
    "iconUrl": "/assets/lobby/icons/cure.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "boss_jingtong_ele",
        "bone": "root"
      }
    ]
  },
  "97": {
    "id": "97",
    "iconUrl": "/assets/lobby/icons/bossbuff_rocketup01.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "98": {
    "id": "98",
    "iconUrl": "/assets/lobby/icons/bossbuff_shootup01.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "99": {
    "id": "99",
    "iconUrl": "/assets/lobby/icons/bossbuff_awpup01.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "101": {
    "id": "101",
    "iconUrl": "/assets/lobby/icons/bossbuff_rocketup01.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": "boss_blazefield_bom",
    "effects": []
  },
  "102": {
    "id": "102",
    "iconUrl": "/assets/lobby/icons/bossbuff_bloodfire01.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "103": {
    "id": "103",
    "iconUrl": "/assets/lobby/icons/bossbuff_bloodfire01.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "104": {
    "id": "104",
    "iconUrl": "/assets/lobby/icons/bossbuff_rocketup01.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "105": {
    "id": "105",
    "iconUrl": "/assets/lobby/icons/smallbossbomb01.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "106": {
    "id": "106",
    "iconUrl": "/assets/lobby/icons/smallbossbomb02.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "107": {
    "id": "107",
    "iconUrl": "/assets/lobby/icons/smallbossmoderate01.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "108": {
    "id": "108",
    "iconUrl": "/assets/lobby/icons/smallbossmoderate02.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "109": {
    "id": "109",
    "iconUrl": "/assets/lobby/icons/bossbombgoon01.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "110": {
    "id": "110",
    "iconUrl": "/assets/lobby/icons/bossbombgoon02.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "111": {
    "id": "111",
    "iconUrl": "/assets/lobby/icons/bossbuff_shock01.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "112": {
    "id": "112",
    "iconUrl": "/assets/lobby/icons/bossbuff_shock01.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "113": {
    "id": "113",
    "iconUrl": "/assets/lobby/icons/bossbuff_immediately01.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "114": {
    "id": "114",
    "iconUrl": "/assets/lobby/icons/bossbuff_shock01.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "115": {
    "id": "115",
    "iconUrl": "/assets/lobby/icons/bossbuff_immediately01.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "116": {
    "id": "116",
    "iconUrl": "/assets/lobby/icons/nuclear01.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "118": {
    "id": "118",
    "iconUrl": "/assets/lobby/icons/wolfsmell.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "119": {
    "id": "119",
    "iconUrl": "/assets/lobby/icons/wolfgene.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "120": {
    "id": "120",
    "iconUrl": "/assets/lobby/icons/wolfgene.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "121": {
    "id": "121",
    "iconUrl": "/assets/lobby/icons/wolffriend.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "122": {
    "id": "122",
    "iconUrl": "/assets/lobby/icons/wolfcrtical.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "123": {
    "id": "123",
    "iconUrl": "/assets/lobby/icons/wolfcrtical.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "lr_buff_yxjy2",
        "bone": "root"
      }
    ]
  },
  "124": {
    "id": "124",
    "iconUrl": "/assets/lobby/icons/wolfresilience.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "125": {
    "id": "125",
    "iconUrl": "/assets/lobby/icons/wolfspeed.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "126": {
    "id": "126",
    "iconUrl": "/assets/lobby/icons/wolfdecelerate.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "127": {
    "id": "127",
    "iconUrl": "/assets/lobby/icons/feud.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "128": {
    "id": "128",
    "iconUrl": "/assets/lobby/icons/feud.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "skill_revengeAnger",
        "bone": "hand_r"
      }
    ]
  },
  "129": {
    "id": "129",
    "iconUrl": "/assets/lobby/icons/wolfeye.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "lr_red_eye",
        "bone": "head"
      }
    ]
  },
  "130": {
    "id": "130",
    "iconUrl": "/assets/lobby/icons/wolfeye.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "lr_blue_eye",
        "bone": "head"
      }
    ]
  },
  "131": {
    "id": "131",
    "iconUrl": "/assets/lobby/icons/howl.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "132": {
    "id": "132",
    "iconUrl": "/assets/lobby/icons/bossbuff_rocketup.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "133": {
    "id": "133",
    "iconUrl": "/assets/lobby/icons/bossbuff_crazyshoot.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "134": {
    "id": "134",
    "iconUrl": "/assets/lobby/icons/cure.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": "boss4_shockwave_receive",
    "continuedEffect": null,
    "effects": []
  },
  "137": {
    "id": "137",
    "iconUrl": "/assets/lobby/icons/bossbuff_crazyflyer.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "138": {
    "id": "138",
    "iconUrl": "/assets/lobby/icons/bossbuff_qzmd.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "139": {
    "id": "139",
    "iconUrl": "/assets/lobby/icons/dryer.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": "boss4_dryer_receive",
    "continuedEffect": null,
    "effects": []
  },
  "140": {
    "id": "140",
    "iconUrl": "/assets/lobby/icons/bossbuff_finalfire.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "143": {
    "id": "143",
    "iconUrl": "/assets/lobby/icons/bossbuff_finalfire.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "147": {
    "id": "147",
    "iconUrl": "/assets/lobby/icons/bossbuff_finalfire.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "148": {
    "id": "148",
    "iconUrl": "/assets/lobby/icons/bossbuff_finalfire.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "149": {
    "id": "149",
    "iconUrl": "/assets/lobby/icons/energybarrier.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "150": {
    "id": "150",
    "iconUrl": "/assets/lobby/icons/energybarrier.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "boss4_shield_rongyan",
        "bone": "back_b"
      }
    ]
  },
  "151": {
    "id": "151",
    "iconUrl": "/assets/lobby/icons/energybarrier.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "153": {
    "id": "153",
    "iconUrl": "/assets/lobby/icons/zombiebuff.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "154": {
    "id": "154",
    "iconUrl": "/assets/lobby/icons/heropower.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "hero_jifei",
        "bone": "back_b"
      },
      {
        "effect": "hero_jifei_2",
        "bone": "handweapon_r"
      }
    ]
  },
  "155": {
    "id": "155",
    "iconUrl": "/assets/lobby/icons/herocrazy.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "hero_fengkuang",
        "bone": "root"
      }
    ]
  },
  "156": {
    "id": "156",
    "iconUrl": "/assets/lobby/icons/unzombiebuff.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "hero_birth",
        "bone": "root"
      }
    ]
  },
  "157": {
    "id": "157",
    "iconUrl": "/assets/lobby/icons/heropower.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": []
  },
  "158": {
    "id": "158",
    "iconUrl": "/assets/lobby/icons/cure.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "hero_jifei_by",
        "bone": "back_b"
      }
    ]
  },
  "159": {
    "id": "159",
    "iconUrl": "/assets/lobby/icons/cure.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "hero_jifei_by",
        "bone": "back_b"
      }
    ]
  },
  "161": {
    "id": "161",
    "iconUrl": "/assets/lobby/icons/leechdom_cardiac.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "cross_bloodserum",
        "bone": "root"
      }
    ]
  },
  "hero": {
    "id": "hero",
    "iconUrl": "/assets/lobby/icons/cure.png",
    "buffSound": null,
    "stopSound": null,
    "stopEffect": null,
    "continuedEffect": null,
    "effects": [
      {
        "effect": "lobby_state",
        "bone": "root"
      }
    ]
  }
};

// Ported 1:1 from AvatarStar_cache/weapon/*.lua projectile 3D model mapping (shot_mesh)
export const LUA_WEAPON_PROJECTILE_MODELS: Record<string, string> = {
  "ba01armhlt_002": "/assets/gameplay/projectiles/ba01armhlt_002_ba01armlt_rpgbullet_001.glb",
  "ba01armhlt_003": "/assets/gameplay/projectiles/ba01armhlt_002_ba01armlt_rpgbullet_001.glb",
  "ba01armhmt_003": "/assets/gameplay/projectiles/ba01armhlt_002_ba01armlt_rpgbullet_001.glb",
  "ba01armhrt_002": "/assets/gameplay/projectiles/ba01armhlt_002_ba01armlt_rpgbullet_001.glb",
  "ba01armhrt_003": "/assets/gameplay/projectiles/ba01armhlt_002_ba01armlt_rpgbullet_001.glb",
  "ba01armlt_001": "/assets/gameplay/projectiles/ba01armhlt_002_ba01armlt_rpgbullet_001.glb",
  "ba01armlt_002": "/assets/gameplay/projectiles/ba01armhlt_002_ba01armlt_rpgbullet_001.glb",
  "ba01armlt_003": "/assets/gameplay/projectiles/ba01armlt_003_ba01armlt_arrow_003.glb",
  "ba01monster_rpg": "/assets/gameplay/projectiles/ba01monster_rpg_001_ba03armlt_rpgbullet_001.glb",
  "ba02armrt_001": "/assets/gameplay/projectiles/ba02armrt_001_ba02armrt_bullet_001.glb",
  "ba02armrt_002": "/assets/gameplay/projectiles/ba02armrt_002_ba02armrt_bullet_002.glb",
  "ba03armlt_001": "/assets/gameplay/projectiles/ba01monster_rpg_001_ba03armlt_rpgbullet_001.glb",
  "ba03armlt_002": "/assets/gameplay/projectiles/ba01monster_rpg_001_ba03armlt_rpgbullet_001.glb",
  "ba03armrt_001": "/assets/gameplay/projectiles/ba03armrt_001_ba03armrt_rpgbullet_001.glb",
  "ba03armrt_002": "/assets/gameplay/projectiles/ba03armrt_001_ba03armrt_rpgbullet_001.glb",
  "ba04armlt_001": "/assets/gameplay/projectiles/ba04armlt_001_ba04armlt_rpgbullet_001.glb",
  "bow_01": "/assets/gameplay/projectiles/bow_01_arrow_01.glb",
  "bow_02": "/assets/gameplay/projectiles/bow_02_arrow_02.glb",
  "bow_03": "/assets/gameplay/projectiles/bow_03_arrow_03.glb",
  "bow_04": "/assets/gameplay/projectiles/bow_04_arrow_04.glb",
  "bow_05": "/assets/gameplay/projectiles/bow_05_arrow_05.glb",
  "bow_06": "/assets/gameplay/projectiles/bow_06_arrow_06.glb",
  "bow_07": "/assets/gameplay/projectiles/bow_07_arrow_07.glb",
  "bow_08": "/assets/gameplay/projectiles/bow_08_arrow_08.glb",
  "bow_09": "/assets/gameplay/projectiles/bow_09_arrow_09.glb",
  "bow_10": "/assets/gameplay/projectiles/bow_10_arrow_10.glb",
  "bow_11": "/assets/gameplay/projectiles/bow_11_arrow_11.glb",
  "bow_12": "/assets/gameplay/projectiles/bow_12_arrow_12.glb",
  "bow_13": "/assets/gameplay/projectiles/bow_13_arrow_13.glb",
  "bow_14": "/assets/gameplay/projectiles/bow_14_arrow_14.glb",
  "bow_15": "/assets/gameplay/projectiles/bow_15_arrow_15.glb",
  "bow_16": "/assets/gameplay/projectiles/bow_16_arrow_16.glb",
  "bow_17": "/assets/gameplay/projectiles/bow_17_arrow_17.glb",
  "bow_20": "/assets/gameplay/projectiles/bow_10_arrow_10.glb",
  "bow_21": "/assets/gameplay/projectiles/bow_21_arrow_21.glb",
  "bow_22": "/assets/gameplay/projectiles/bow_22_arrow_22.glb",
  "bow_25": "/assets/gameplay/projectiles/bow_25_arrow_25.glb",
  "bow_26": "/assets/gameplay/projectiles/bow_26_arrow_26.glb",
  "bow_27": "/assets/gameplay/projectiles/bow_27_arrow_27.glb",
  "bow_28": "/assets/gameplay/projectiles/bow_28_arrow_28.glb",
  "bow_29": "/assets/gameplay/projectiles/bow_29_arrow_29.glb",
  "bow_30": "/assets/gameplay/projectiles/bow_30_arrow_30.glb",
  "bow_31": "/assets/gameplay/projectiles/bow_31_arrow_31.glb",
  "bow_32": "/assets/gameplay/projectiles/bow_32_arrow_32.glb",
  "bow_33": "/assets/gameplay/projectiles/bow_33_arrow_33.glb",
  "bow_34": "/assets/gameplay/projectiles/bow_34_arrow_34.glb",
  "bow_35": "/assets/gameplay/projectiles/bow_35_arrow_35.glb",
  "bow_36": "/assets/gameplay/projectiles/bow_36_arrow_36.glb",
  "bow_38": "/assets/gameplay/projectiles/bow_38_arrow_38.glb",
  "bow_39": "/assets/gameplay/projectiles/bow_39_arrow_39.glb",
  "bow_40": "/assets/gameplay/projectiles/bow_40_arrow_40.glb",
  "bow_41": "/assets/gameplay/projectiles/bow_41_arrow_41.glb",
  "bow_42": "/assets/gameplay/projectiles/bow_42_arrow_42.glb",
  "bow_43": "/assets/gameplay/projectiles/bow_43_arrow_43.glb",
  "bow_44": "/assets/gameplay/projectiles/bow_44_arrow_44.glb",
  "bow_45": "/assets/gameplay/projectiles/bow_45_arrow_45.glb",
  "bow_47": "/assets/gameplay/projectiles/bow_47_arrow_47.glb",
  "crossbow_01": "/assets/gameplay/projectiles/crossbow_01_crossbowbullet_01.glb",
  "crossbow_02": "/assets/gameplay/projectiles/crossbow_02_crossbowbullet_02.glb",
  "crossbow_03": "/assets/gameplay/projectiles/crossbow_03_crossbowbullet_03.glb",
  "crossbow_04": "/assets/gameplay/projectiles/crossbow_04_crossbowbullet_04.glb",
  "crossbow_05": "/assets/gameplay/projectiles/crossbow_05_crossbowbullet_05.glb",
  "crossbow_06": "/assets/gameplay/projectiles/crossbow_06_crossbowbullet_06.glb",
  "crossbow_07": "/assets/gameplay/projectiles/crossbow_07_crossbowbullet_07.glb",
  "crossbow_08": "/assets/gameplay/projectiles/crossbow_08_crossbowbullet_08.glb",
  "crossbow_12": "/assets/gameplay/projectiles/crossbow_12_crossbowbullet_12.glb",
  "crossbow_13": "/assets/gameplay/projectiles/crossbow_13_crossbowbullet_13.glb",
  "crossbow_14": "/assets/gameplay/projectiles/crossbow_14_crossbowbullet_14.glb",
  "crossbow_15": "/assets/gameplay/projectiles/crossbow_15_crossbowbullet_15.glb",
  "crossbow_16": "/assets/gameplay/projectiles/crossbow_16_crossbowbullet_16.glb",
  "crossbow_21": "/assets/gameplay/projectiles/crossbow_21_crossbowbullet_21.glb",
  "crossbow_22": "/assets/gameplay/projectiles/crossbow_22_crossbowbullet_22.glb",
  "crossbow_26": "/assets/gameplay/projectiles/crossbow_26_crossbowbullet_26.glb",
  "crossbow_27": "/assets/gameplay/projectiles/crossbow_27_crossbowbullet_27.glb",
  "crossbow_28": "/assets/gameplay/projectiles/crossbow_28_crossbowbullet_28.glb",
  "crossbow_29": "/assets/gameplay/projectiles/crossbow_29_crossbowbullet_29.glb",
  "crossbow_31": "/assets/gameplay/projectiles/crossbow_31_crossbowbullet_31.glb",
  "crossbow_32": "/assets/gameplay/projectiles/crossbow_32_crossbowbullet_32.glb",
  "crossbow_33": "/assets/gameplay/projectiles/crossbow_33_crossbowbullet_33.glb",
  "crossbow_34": "/assets/gameplay/projectiles/crossbow_34_crossbowbullet_34.glb",
  "crossbow_35": "/assets/gameplay/projectiles/crossbow_35_crossbowbullet_35.glb",
  "crossbow_36": "/assets/gameplay/projectiles/crossbow_36_crossbowbullet_36.glb",
  "crossbow_38": "/assets/gameplay/projectiles/crossbow_38_crossbowbullet_38.glb",
  "crossbow_39": "/assets/gameplay/projectiles/crossbow_39_crossbowbullet_39.glb",
  "crossbow_40": "/assets/gameplay/projectiles/crossbow_40_crossbowbullet_40.glb",
  "crossbow_41": "/assets/gameplay/projectiles/crossbow_41_crossbowbullet_41.glb",
  "crossbow_42": "/assets/gameplay/projectiles/crossbow_42_crossbowbullet_42.glb",
  "crossbow_43": "/assets/gameplay/projectiles/crossbow_43_crossbowbullet_43.glb",
  "crossbow_44": "/assets/gameplay/projectiles/crossbow_44_crossbowbullet_44.glb",
  "crossbow_45": "/assets/gameplay/projectiles/crossbow_45_crossbowbullet_45.glb",
  "crossbow_47": "/assets/gameplay/projectiles/crossbow_47_crossbowbullet_47.glb",
  "grenadelauncher_01": "/assets/gameplay/projectiles/grenadelauncherbullet_01_rv1_lod0.glb",
  "grenadelauncher_02": "/assets/gameplay/projectiles/grenadelauncherbullet_02_rv1_lod0.glb",
  "grenadelauncher_03": "/assets/gameplay/projectiles/grenadelauncherbullet_03_rv1_lod0.glb",
  "grenadelauncher_04": "/assets/gameplay/projectiles/grenadelauncherbullet_04_rv1_lod0.glb",
  "grenadelauncher_05": "/assets/gameplay/projectiles/grenadelauncherbullet_05_rv1_lod0.glb",
  "grenadelauncher_06": "/assets/gameplay/projectiles/grenadelauncherbullet_06_rv1_lod0.glb",
  "grenadelauncher_07": "/assets/gameplay/projectiles/grenadelauncherbullet_07_rv1_lod0.glb",
  "grenadelauncher_08": "/assets/gameplay/projectiles/grenadelauncherbullet_08_rv1_lod0.glb",
  "grenadelauncher_12": "/assets/gameplay/projectiles/grenadelauncherbullet_12_rv1_lod0.glb",
  "grenadelauncher_13": "/assets/gameplay/projectiles/grenadelauncherbullet_13_rv1_lod0.glb",
  "grenadelauncher_14": "/assets/gameplay/projectiles/grenadelauncherbullet_14_rv1_lod0.glb",
  "grenadelauncher_15": "/assets/gameplay/projectiles/grenadelauncherbullet_15_rv1_lod0.glb",
  "grenadelauncher_16": "/assets/gameplay/projectiles/grenadelauncherbullet_16_rv1_lod0.glb",
  "grenadelauncher_21": "/assets/gameplay/projectiles/grenadelauncherbullet_21_rv1_lod0.glb",
  "grenadelauncher_22": "/assets/gameplay/projectiles/grenadelauncherbullet_22_rv1_lod0.glb",
  "grenadelauncher_24": "/assets/gameplay/projectiles/grenadelauncherbullet_24_rv1_lod0.glb",
  "grenadelauncher_26": "/assets/gameplay/projectiles/grenadelauncherbullet_26_rv1_lod0.glb",
  "grenadelauncher_27": "/assets/gameplay/projectiles/grenadelauncherbullet_27_rv1_lod0.glb",
  "grenadelauncher_28": "/assets/gameplay/projectiles/grenadelauncherbullet_28_rv1_lod0.glb",
  "grenadelauncher_29": "/assets/gameplay/projectiles/grenadelauncherbullet_29_rv1_lod0.glb",
  "grenadelauncher_31": "/assets/gameplay/projectiles/grenadelauncherbullet_31_rv1_lod0.glb",
  "grenadelauncher_32": "/assets/gameplay/projectiles/grenadelauncherbullet_32_rv1_lod0.glb",
  "grenadelauncher_33": "/assets/gameplay/projectiles/grenadelauncherbullet_33_rv1_lod0.glb",
  "grenadelauncher_34": "/assets/gameplay/projectiles/grenadelauncherbullet_34_rv1_lod0.glb",
  "grenadelauncher_36": "/assets/gameplay/projectiles/grenadelauncherbullet_36_rv1_lod0.glb",
  "grenadelauncher_38": "/assets/gameplay/projectiles/grenadelauncherbullet_38_rv1_lod0.glb",
  "grenadelauncher_39": "/assets/gameplay/projectiles/grenadelauncherbullet_39_rv1_lod0.glb",
  "grenadelauncher_40": "/assets/gameplay/projectiles/grenadelauncherbullet_40_rv1_lod0.glb",
  "grenadelauncher_41": "/assets/gameplay/projectiles/grenadelauncherbullet_41_rv1_lod0.glb",
  "grenadelauncher_42": "/assets/gameplay/projectiles/grenadelauncherbullet_42_rv1_lod0.glb",
  "grenadelauncher_44": "/assets/gameplay/projectiles/grenadelauncherbullet_44_rv1_lod0.glb",
  "grenadelauncher_45": "/assets/gameplay/projectiles/grenadelauncherbullet_45_rv1_lod0.glb",
  "grenadelauncher_51": "/assets/gameplay/projectiles/grenadelauncherbullet_51_rv111_lod0.glb",
  "grenade_01": "/assets/lobby/models/grenade_01-rv.glb",
  "grenade_02": "/assets/lobby/models/grenade_02-rv.glb",
  "grenade_05": "/assets/lobby/models/grenade_05-rv.glb",
  "grenade_08": "/assets/lobby/models/grenade_08-rv.glb",
  "grenade_09": "/assets/lobby/models/grenade_09-rv.glb",
  "grenade_10": "/assets/lobby/models/grenade_10-rv.glb",
  "grenade_101": "/assets/lobby/models/grenade_101-rv.glb",
  "grenade_102": "/assets/lobby/models/grenade_102-rv.glb",
  "grenade_103": "/assets/lobby/models/grenade_103-rv.glb",
  "grenade_11": "/assets/lobby/models/grenade_11-rv.glb",
  "grenade_13": "/assets/lobby/models/grenade_13-rv.glb",
  "grenade_15": "/assets/lobby/models/grenade_15-rv.glb",
  "grenade_21": "/assets/lobby/models/grenade_21-rv.glb",
  "grenade_22": "/assets/lobby/models/grenade_22-rv.glb",
  "grenade_26": "/assets/lobby/models/grenade_26-rv.glb",
  "grenade_27": "/assets/lobby/models/grenade_27-rv.glb",
  "grenade_28": "/assets/lobby/models/grenade_28-rv.glb",
  "grenade_29": "/assets/lobby/models/grenade_29-rv.glb",
  "grenade_30": "/assets/lobby/models/grenade_30-rv.glb",
  "grenade_31": "/assets/lobby/models/grenade_31-rv.glb",
  "grenade_33": "/assets/lobby/models/grenade_33-rv.glb",
  "grenade_34": "/assets/lobby/models/grenade_34-rv.glb",
  "grenade_36": "/assets/lobby/models/grenade_36-rv.glb",
  "grenade_38": "/assets/lobby/models/grenade_38-rv.glb",
  "grenade_39": "/assets/lobby/models/grenade_39-rv.glb",
  "grenade_40": "/assets/lobby/models/grenade_40-rv.glb",
  "grenade_41": "/assets/lobby/models/grenade_41-rv.glb",
  "grenade_42": "/assets/lobby/models/grenade_42-rv.glb",
  "grenade_43": "/assets/lobby/models/grenade_43-rv.glb",
  "grenade_44": "/assets/lobby/models/grenade_44-rv.glb",
  "grenade_45": "/assets/lobby/models/grenade_45-rv.glb",
  "grenade_49": "/assets/lobby/models/grenade_49-rv.glb",
  "grenade_50": "/assets/lobby/models/grenade_50-rv.glb",
  "rpg_01": "/assets/gameplay/projectiles/rpg_01_rpgbullet_01.glb",
  "rpg_02": "/assets/gameplay/projectiles/rpg_02_rpgbullet_02.glb",
  "rpg_03": "/assets/gameplay/projectiles/rpg_03_rpgbullet_03.glb",
  "rpg_04": "/assets/gameplay/projectiles/rpg_04_rpgbullet_04.glb",
  "rpg_05": "/assets/gameplay/projectiles/rpg_05_rpgbullet_05.glb",
  "rpg_06": "/assets/gameplay/projectiles/rpg_06_rpgbullet_06.glb",
  "rpg_07": "/assets/gameplay/projectiles/rpg_07_rpgbullet_07.glb",
  "rpg_08": "/assets/gameplay/projectiles/rpg_08_rpgbullet_08.glb",
  "rpg_09": "/assets/gameplay/projectiles/rpg_09_rpgbullet_09.glb",
  "rpg_10": "/assets/gameplay/projectiles/rpg_10_rpgbullet_10.glb",
  "rpg_11": "/assets/gameplay/projectiles/rpg_11_rpgbullet_11.glb",
  "rpg_12": "/assets/gameplay/projectiles/rpg_12_rpgbullet_12.glb",
  "rpg_13": "/assets/gameplay/projectiles/rpg_13_rpgbullet_13.glb",
  "rpg_14": "/assets/gameplay/projectiles/rpg_14_rpgbullet_14.glb",
  "rpg_15": "/assets/gameplay/projectiles/rpg_15_rpgbullet_15.glb",
  "rpg_16": "/assets/gameplay/projectiles/rpg_16_rpgbullet_16.glb",
  "rpg_17": "/assets/gameplay/projectiles/rpg_17_rpgbullet_17.glb",
  "rpg_20": "/assets/gameplay/projectiles/rpg_20_rpgbullet_20.glb",
  "rpg_21": "/assets/gameplay/projectiles/rpg_21_rpgbullet_21.glb",
  "rpg_22": "/assets/gameplay/projectiles/rpg_22_rpgbullet_22.glb",
  "rpg_25": "/assets/gameplay/projectiles/rpg_25_rpgbullet_25.glb",
  "rpg_26": "/assets/gameplay/projectiles/rpg_26_rpgbullet_26.glb",
  "rpg_27": "/assets/gameplay/projectiles/rpg_27_rpgbullet_27.glb",
  "rpg_28": "/assets/gameplay/projectiles/rpg_28_rpgbullet_28.glb",
  "rpg_29": "/assets/gameplay/projectiles/rpg_29_rpgbullet_29.glb",
  "rpg_30": "/assets/gameplay/projectiles/rpg_30_rpgbullet_30.glb",
  "rpg_31": "/assets/gameplay/projectiles/rpg_31_rpgbullet_31.glb",
  "rpg_33": "/assets/gameplay/projectiles/rpg_33_rpgbullet_33.glb",
  "rpg_34": "/assets/gameplay/projectiles/rpg_34_rpgbullet_34.glb",
  "rpg_35": "/assets/gameplay/projectiles/rpg_35_rpgbullet_35.glb",
  "rpg_36": "/assets/gameplay/projectiles/rpg_36_rpgbullet_36.glb",
  "rpg_38": "/assets/gameplay/projectiles/rpg_38_rpgbullet_38.glb",
  "rpg_39": "/assets/gameplay/projectiles/rpg_39_rpgbullet_39.glb",
  "rpg_40": "/assets/gameplay/projectiles/rpg_40_rpgbullet_40.glb",
  "rpg_41": "/assets/gameplay/projectiles/rpg_41_rpgbullet_41.glb",
  "rpg_42": "/assets/gameplay/projectiles/rpg_42_rpgbullet_42.glb",
  "rpg_43": "/assets/gameplay/projectiles/rpg_43_rpgbullet_43.glb",
  "rpg_44": "/assets/gameplay/projectiles/rpg_44_rpgbullet_44.glb",
  "rpg_45": "/assets/gameplay/projectiles/rpg_45_rpgbullet_45.glb",
  "sprayer_01": "/assets/gameplay/projectiles/sprayer_01_sprayerbullet_01.glb",
  "sprayer_02": "/assets/gameplay/projectiles/sprayer_02_sprayerbullet_02.glb",
  "sprayer_03": "/assets/gameplay/projectiles/sprayer_03_sprayerbullet_03.glb",
  "sprayer_04": "/assets/gameplay/projectiles/sprayer_04_sprayerbullet_04.glb",
  "sprayer_05": "/assets/gameplay/projectiles/sprayer_05_sprayerbullet_05.glb",
  "sprayer_06": "/assets/gameplay/projectiles/sprayer_06_sprayerbullet_06.glb",
  "sprayer_07": "/assets/gameplay/projectiles/sprayer_07_sprayerbullet_07.glb",
  "sprayer_08": "/assets/gameplay/projectiles/sprayer_08_sprayerbullet_08.glb",
  "sprayer_12": "/assets/gameplay/projectiles/sprayer_12_sprayerbullet_12.glb",
  "sprayer_13": "/assets/gameplay/projectiles/sprayer_13_sprayerbullet_13.glb",
  "sprayer_14": "/assets/gameplay/projectiles/sprayer_14_sprayerbullet_14.glb",
  "sprayer_15": "/assets/gameplay/projectiles/sprayer_15_sprayerbullet_15.glb",
  "sprayer_16": "/assets/gameplay/projectiles/sprayer_16_sprayerbullet_16.glb",
  "sprayer_21": "/assets/gameplay/projectiles/sprayer_21_sprayerbullet_21.glb",
  "sprayer_26": "/assets/gameplay/projectiles/sprayer_26_sprayerbullet_26.glb",
  "sprayer_27": "/assets/gameplay/projectiles/sprayer_27_sprayerbullet_27.glb",
  "sprayer_28": "/assets/gameplay/projectiles/sprayer_28_sprayerbullet_28.glb",
  "sprayer_31": "/assets/gameplay/projectiles/sprayer_31_sprayerbullet_31.glb",
  "sprayer_33": "/assets/gameplay/projectiles/sprayer_33_sprayerbullet_33.glb",
  "sprayer_34": "/assets/gameplay/projectiles/sprayer_34_sprayerbullet_34.glb",
  "sprayer_36": "/assets/gameplay/projectiles/sprayer_36_sprayerbullet_36.glb",
  "sprayer_38": "/assets/gameplay/projectiles/sprayer_38_sprayerbullet_38.glb",
  "sprayer_39": "/assets/gameplay/projectiles/sprayer_39_sprayerbullet_39.glb",
  "sprayer_40": "/assets/gameplay/projectiles/sprayer_40_sprayerbullet_40.glb",
  "sprayer_41": "/assets/gameplay/projectiles/sprayer_41_sprayerbullet_41.glb",
  "sprayer_42": "/assets/gameplay/projectiles/sprayer_42_sprayerbullet_42.glb",
  "sprayer_44": "/assets/gameplay/projectiles/sprayer_44_sprayerbullet_44.glb",
  "sprayer_45": "/assets/gameplay/projectiles/sprayer_45_sprayerbullet_45.glb"
};

// Ported 1:1 from AvatarStar_cache/mesh/scene/level*/script.lua (47 maps fog, sun, DeadAABBs)
export const LUA_MAP_SCENE_SPECS: Record<string, {
  id: string;
  fog: { enabled: boolean; near: number; far: number; r: number; g: number; b: number } | null;
  sunDirection: [number, number, number];
  ambienceAudio: string | null;
  deadAABBs: { min: [number, number, number]; max: [number, number, number] }[];
}> = {
  "avatarroom": {
    "id": "avatarroom",
    "fog": {
      "enabled": false,
      "near": 0,
      "far": 1000,
      "r": 0,
      "g": 0,
      "b": 0
    },
    "sunDirection": [
      0.4,
      0.6,
      0.7
    ],
    "ambienceAudio": null,
    "deadAABBs": []
  },
  "level1": {
    "id": "level1",
    "fog": {
      "enabled": true,
      "near": 45,
      "far": 223.4,
      "r": 0.93,
      "g": 0.949,
      "b": 0.906
    },
    "sunDirection": [
      0.4,
      0.6,
      0.7
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          15.331,
          -0.6,
          -2.738
        ],
        "max": [
          24.324,
          4.768,
          9.301
        ]
      },
      {
        "min": [
          16.469,
          -1.278,
          13.879
        ],
        "max": [
          19.866,
          2.94,
          22.253
        ]
      },
      {
        "min": [
          3.57,
          -0.665,
          15.057
        ],
        "max": [
          7.699,
          2.743,
          24.307
        ]
      },
      {
        "min": [
          -8.186,
          -2.541,
          28.996
        ],
        "max": [
          -3.87,
          0.867,
          37.887
        ]
      },
      {
        "min": [
          -8.568,
          -0.571,
          15.223
        ],
        "max": [
          -1.995,
          3.443,
          20.47
        ]
      },
      {
        "min": [
          -25.207,
          -0.571,
          15.675
        ],
        "max": [
          -21.464,
          4.19,
          27.587
        ]
      },
      {
        "min": [
          -25.033,
          3.88,
          15.757
        ],
        "max": [
          -17.313,
          7.895,
          27.518
        ]
      },
      {
        "min": [
          -31.911,
          -0.571,
          15.872
        ],
        "max": [
          -25.346,
          4.402,
          19.821
        ]
      },
      {
        "min": [
          32.718,
          -0.829,
          -2.092
        ],
        "max": [
          35.917,
          2.082,
          3.436
        ]
      },
      {
        "min": [
          21.963,
          -1.346,
          -21.301
        ],
        "max": [
          27.035,
          1.762,
          -12.044
        ]
      },
      {
        "min": [
          17.812,
          -1.648,
          -31.6
        ],
        "max": [
          21.803,
          1.46,
          -27.607
        ]
      },
      {
        "min": [
          3.863,
          -0.294,
          -21.209
        ],
        "max": [
          15.628,
          4.138,
          -17.46
        ]
      },
      {
        "min": [
          -8.819,
          -1.442,
          -20.845
        ],
        "max": [
          -0.031,
          2.876,
          -16.495
        ]
      },
      {
        "min": [
          -33.173,
          -2.358,
          -40.786
        ],
        "max": [
          -29.18,
          1.385,
          -36.794
        ]
      },
      {
        "min": [
          -27.991,
          -0.294,
          -28.82
        ],
        "max": [
          -17.283,
          6.562,
          -22.949
        ]
      },
      {
        "min": [
          -26.713,
          -0.294,
          -30.812
        ],
        "max": [
          -17.841,
          3.744,
          -28.053
        ]
      },
      {
        "min": [
          15.326,
          -2.67,
          -5.693
        ],
        "max": [
          24.134,
          0.137,
          0.99
        ]
      },
      {
        "min": [
          -25.417,
          -2.762,
          -33.373
        ],
        "max": [
          -17.807,
          0.13,
          -30.836
        ]
      },
      {
        "min": [
          -24.584,
          -1.709,
          -15.979
        ],
        "max": [
          -17.359,
          2.691,
          -3.675
        ]
      },
      {
        "min": [
          -21.717,
          -0.294,
          -0.483
        ],
        "max": [
          -14.476,
          7.56,
          4.253
        ]
      },
      {
        "min": [
          -21.693,
          -0.294,
          4.373
        ],
        "max": [
          -15.905,
          6.585,
          9.683
        ]
      },
      {
        "min": [
          -23.797,
          -0.294,
          -0.643
        ],
        "max": [
          -21.949,
          4.209,
          8.34
        ]
      },
      {
        "min": [
          -26.295,
          -2.163,
          -0.671
        ],
        "max": [
          -23.889,
          0.482,
          6.96
        ]
      },
      {
        "min": [
          -36.534,
          -2.283,
          -2.437
        ],
        "max": [
          -32.589,
          1.46,
          1.599
        ]
      },
      {
        "min": [
          13.572,
          -2.67,
          -5.392
        ],
        "max": [
          14.406,
          0.137,
          -4.181
        ]
      }
    ]
  },
  "level10": {
    "id": "level10",
    "fog": {
      "enabled": true,
      "near": 20,
      "far": 180.8,
      "r": 0,
      "g": 0.076,
      "b": 0.257
    },
    "sunDirection": [
      0,
      1,
      -0.2
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          3.818,
          -4.645,
          -29.028
        ],
        "max": [
          11.021,
          4.645,
          -20.793
        ]
      },
      {
        "min": [
          4.95,
          -4.645,
          -21.127
        ],
        "max": [
          10.81,
          2.599,
          -18.972
        ]
      },
      {
        "min": [
          -10.075,
          -2.927,
          -23.697
        ],
        "max": [
          -4.431,
          2.183,
          -17.471
        ]
      },
      {
        "min": [
          -10.739,
          -2.927,
          -14.073
        ],
        "max": [
          -4.906,
          6.275,
          -5.668
        ]
      },
      {
        "min": [
          -15.193,
          -2.927,
          -14.073
        ],
        "max": [
          -9.389,
          1.651,
          -11.728
        ]
      },
      {
        "min": [
          8.007,
          -2.927,
          -13.857
        ],
        "max": [
          18.205,
          6.275,
          -8.313
        ]
      },
      {
        "min": [
          17.801,
          -2.927,
          -13.749
        ],
        "max": [
          19.206,
          2.602,
          -11.605
        ]
      },
      {
        "min": [
          5.943,
          -2.927,
          -11.974
        ],
        "max": [
          8.358,
          1.208,
          -8.313
        ]
      },
      {
        "min": [
          4.878,
          -2.927,
          5.641
        ],
        "max": [
          10.711,
          6.275,
          14.046
        ]
      },
      {
        "min": [
          9.41,
          -2.927,
          11.724
        ],
        "max": [
          15.215,
          1.651,
          14.069
        ]
      },
      {
        "min": [
          -18.208,
          -2.927,
          8.333
        ],
        "max": [
          -8.01,
          6.275,
          13.837
        ]
      },
      {
        "min": [
          -8.367,
          -2.927,
          8.28
        ],
        "max": [
          -5.952,
          1.208,
          11.94
        ]
      },
      {
        "min": [
          -19.182,
          -2.927,
          11.648
        ],
        "max": [
          -17.777,
          2.602,
          13.792
        ]
      },
      {
        "min": [
          -11.032,
          -4.645,
          20.805
        ],
        "max": [
          -3.83,
          4.645,
          29.04
        ]
      },
      {
        "min": [
          -10.784,
          -4.645,
          18.99
        ],
        "max": [
          -4.924,
          2.599,
          21.144
        ]
      },
      {
        "min": [
          4.412,
          -2.927,
          17.506
        ],
        "max": [
          10.057,
          2.183,
          23.732
        ]
      },
      {
        "min": [
          -1.59,
          -0.446,
          -1.753
        ],
        "max": [
          1.547,
          0.852,
          1.727
        ]
      },
      {
        "min": [
          -2.881,
          -2.927,
          -56.002
        ],
        "max": [
          20.058,
          131.473,
          -37.255
        ]
      },
      {
        "min": [
          17.824,
          -2.927,
          -52.465
        ],
        "max": [
          40.763,
          131.473,
          -20.088
        ]
      },
      {
        "min": [
          23.581,
          -2.927,
          -34.712
        ],
        "max": [
          46.52,
          131.473,
          -2.336
        ]
      },
      {
        "min": [
          26.068,
          -2.927,
          -26.393
        ],
        "max": [
          49.007,
          131.473,
          5.983
        ]
      },
      {
        "min": [
          31.323,
          -2.927,
          -12.012
        ],
        "max": [
          54.262,
          131.473,
          20.365
        ]
      },
      {
        "min": [
          22.468,
          -2.927,
          13.452
        ],
        "max": [
          45.407,
          131.473,
          45.829
        ]
      },
      {
        "min": [
          18.952,
          -2.927,
          20.087
        ],
        "max": [
          41.891,
          131.473,
          52.463
        ]
      },
      {
        "min": [
          1.841,
          -2.927,
          40.013
        ],
        "max": [
          24.78,
          131.473,
          72.39
        ]
      }
    ]
  },
  "level10001": {
    "id": "level10001",
    "fog": {
      "enabled": true,
      "near": 30,
      "far": 800,
      "r": 0.18,
      "g": 0.1,
      "b": 0.18
    },
    "sunDirection": [
      0.28,
      0.12,
      -0.15
    ],
    "ambienceAudio": "go/ambience_2d/alien_boss",
    "deadAABBs": []
  },
  "level10002": {
    "id": "level10002",
    "fog": {
      "enabled": true,
      "near": 100,
      "far": 800,
      "r": 0.333,
      "g": 0.5,
      "b": 0.725
    },
    "sunDirection": [
      -1,
      1,
      -0.5
    ],
    "ambienceAudio": "go/ambience_2d/alien_boss",
    "deadAABBs": [
      {
        "min": [
          29.738,
          -74.564,
          -114.267
        ],
        "max": [
          178.865,
          74.564,
          432.139
        ]
      },
      {
        "min": [
          -183.237,
          -74.564,
          -247.097
        ],
        "max": [
          90.169,
          74.564,
          -33.252
        ]
      },
      {
        "min": [
          -181.579,
          -74.564,
          -101.673
        ],
        "max": [
          -32.452,
          74.564,
          436.706
        ]
      },
      {
        "min": [
          -55.454,
          -88.39,
          -114.267
        ],
        "max": [
          93.673,
          -7.909,
          74.564
        ]
      },
      {
        "min": [
          -63.579,
          -74.564,
          30.6
        ],
        "max": [
          -10.246,
          74.564,
          67.499
        ]
      },
      {
        "min": [
          -75.197,
          52.535,
          -104.898
        ],
        "max": [
          73.931,
          107.22,
          83.933
        ]
      },
      {
        "min": [
          -75.197,
          -88.39,
          37.099
        ],
        "max": [
          73.931,
          74.564,
          402.756
        ]
      }
    ]
  },
  "level10003": {
    "id": "level10003",
    "fog": {
      "enabled": true,
      "near": 100,
      "far": 800,
      "r": 0.333,
      "g": 0.5,
      "b": 0.725
    },
    "sunDirection": [
      -1,
      1,
      -0.5
    ],
    "ambienceAudio": "go/ambience_2d/alien_boss",
    "deadAABBs": [
      {
        "min": [
          -23.824,
          -33.694,
          25.901
        ],
        "max": [
          23.824,
          44.904,
          73.549
        ]
      },
      {
        "min": [
          -73.693,
          -33.694,
          -23.083
        ],
        "max": [
          -26.045,
          44.904,
          24.565
        ]
      },
      {
        "min": [
          -23.824,
          -33.694,
          -73.753
        ],
        "max": [
          23.824,
          44.904,
          -26.106
        ]
      },
      {
        "min": [
          26.13,
          -33.694,
          -23.083
        ],
        "max": [
          73.777,
          44.904,
          24.565
        ]
      },
      {
        "min": [
          -66.896,
          -33.694,
          -66.98
        ],
        "max": [
          -19.249,
          44.904,
          -19.333
        ]
      },
      {
        "min": [
          18.385,
          -33.694,
          -66.98
        ],
        "max": [
          66.033,
          44.904,
          -19.333
        ]
      },
      {
        "min": [
          18.385,
          -33.694,
          19.585
        ],
        "max": [
          66.033,
          44.904,
          67.232
        ]
      },
      {
        "min": [
          -65.365,
          -33.694,
          19.585
        ],
        "max": [
          -17.718,
          44.904,
          67.232
        ]
      },
      {
        "min": [
          -27.559,
          -36.715,
          -27.559
        ],
        "max": [
          27.559,
          -4.031,
          27.559
        ]
      },
      {
        "min": [
          -27.559,
          33.682,
          -27.559
        ],
        "max": [
          27.559,
          46.775,
          27.559
        ]
      }
    ]
  },
  "level10004": {
    "id": "level10004",
    "fog": {
      "enabled": true,
      "near": 30,
      "far": 800,
      "r": 0.18,
      "g": 0.1,
      "b": 0.18
    },
    "sunDirection": [
      -0.37,
      0.35,
      -0.77
    ],
    "ambienceAudio": "go/ambience_2d/alien_boss",
    "deadAABBs": [
      {
        "min": [
          -2.074,
          -9.57,
          -114.532
        ],
        "max": [
          43.523,
          85.072,
          -59.918
        ]
      },
      {
        "min": [
          15.31,
          -9.57,
          -119.334
        ],
        "max": [
          56.929,
          85.072,
          -64.72
        ]
      },
      {
        "min": [
          47.865,
          -9.57,
          -138.485
        ],
        "max": [
          89.484,
          85.072,
          -83.87
        ]
      },
      {
        "min": [
          75.062,
          -9.57,
          -133.457
        ],
        "max": [
          116.681,
          85.072,
          -78.842
        ]
      },
      {
        "min": [
          80.829,
          -9.57,
          -105.067
        ],
        "max": [
          122.448,
          85.072,
          -50.453
        ]
      },
      {
        "min": [
          100.125,
          -9.57,
          -71.576
        ],
        "max": [
          141.744,
          85.072,
          -16.962
        ]
      },
      {
        "min": [
          93.143,
          -9.57,
          -25.108
        ],
        "max": [
          134.762,
          85.072,
          29.506
        ]
      },
      {
        "min": [
          80.382,
          -9.57,
          -10.421
        ],
        "max": [
          122.001,
          85.072,
          44.193
        ]
      },
      {
        "min": [
          67.781,
          -9.57,
          1.539
        ],
        "max": [
          109.4,
          85.072,
          56.153
        ]
      },
      {
        "min": [
          49.792,
          -9.57,
          36.851
        ],
        "max": [
          91.411,
          85.072,
          91.465
        ]
      },
      {
        "min": [
          -0.838,
          -9.57,
          76.942
        ],
        "max": [
          58.346,
          85.072,
          131.556
        ]
      },
      {
        "min": [
          -28.736,
          -9.57,
          65.369
        ],
        "max": [
          12.883,
          85.072,
          119.983
        ]
      },
      {
        "min": [
          -59.713,
          -9.57,
          55.597
        ],
        "max": [
          -0.762,
          85.072,
          110.211
        ]
      },
      {
        "min": [
          -80.734,
          -9.57,
          -50.898
        ],
        "max": [
          -39.115,
          85.072,
          59.688
        ]
      },
      {
        "min": [
          -73.54,
          -9.57,
          -24.369
        ],
        "max": [
          44.842,
          85.072,
          4.187
        ]
      },
      {
        "min": [
          2.42,
          -9.57,
          -26.229
        ],
        "max": [
          44.039,
          85.072,
          14.027
        ]
      },
      {
        "min": [
          -87.286,
          -9.57,
          -93.292
        ],
        "max": [
          -45.667,
          85.072,
          -38.678
        ]
      },
      {
        "min": [
          -94.486,
          -9.57,
          -132.894
        ],
        "max": [
          -52.867,
          85.072,
          -78.28
        ]
      },
      {
        "min": [
          -94.486,
          -9.57,
          -165.295
        ],
        "max": [
          25.389,
          85.072,
          -110.681
        ]
      },
      {
        "min": [
          -26.328,
          -9.57,
          -140.112
        ],
        "max": [
          15.291,
          85.072,
          -85.498
        ]
      },
      {
        "min": [
          -70.959,
          77.919,
          -138.301
        ],
        "max": [
          107.519,
          98.533,
          92.645
        ]
      },
      {
        "min": [
          -70.959,
          -25.356,
          -138.301
        ],
        "max": [
          107.519,
          -4.742,
          92.645
        ]
      }
    ]
  },
  "level10005": {
    "id": "level10005",
    "fog": {
      "enabled": true,
      "near": 30,
      "far": 800,
      "r": 0.18,
      "g": 0.1,
      "b": 0.18
    },
    "sunDirection": [
      -0.37,
      0.35,
      -0.77
    ],
    "ambienceAudio": "go/ambience_2d/alien_boss",
    "deadAABBs": [
      {
        "min": [
          -47.24,
          -35.351,
          -47.596
        ],
        "max": [
          40.388,
          -0.628,
          30.987
        ]
      },
      {
        "min": [
          -47.24,
          -22.906,
          15.63
        ],
        "max": [
          40.388,
          58.874,
          58.86
        ]
      },
      {
        "min": [
          -47.24,
          -22.906,
          -95.24
        ],
        "max": [
          40.388,
          58.874,
          -47.619
        ]
      },
      {
        "min": [
          -86.619,
          -22.906,
          -77.856
        ],
        "max": [
          -37.856,
          58.874,
          54.401
        ]
      },
      {
        "min": [
          27.005,
          -22.906,
          -77.856
        ],
        "max": [
          75.768,
          58.874,
          54.401
        ]
      },
      {
        "min": [
          -19.535,
          -22.906,
          -87.004
        ],
        "max": [
          68.094,
          58.874,
          -39.382
        ]
      },
      {
        "min": [
          -65.966,
          41.368,
          -64.408
        ],
        "max": [
          59.114,
          76.09,
          47.799
        ]
      },
      {
        "min": [
          -30.621,
          -4.27,
          -48.445
        ],
        "max": [
          -27.75,
          2.963,
          -42.696
        ]
      }
    ]
  },
  "level10006": {
    "id": "level10006",
    "fog": {
      "enabled": true,
      "near": 30,
      "far": 800,
      "r": 0.18,
      "g": 0.1,
      "b": 0.18
    },
    "sunDirection": [
      -0.37,
      0.35,
      -0.77
    ],
    "ambienceAudio": "go/ambience_2d/alien_boss",
    "deadAABBs": [
      {
        "min": [
          -51.912,
          -8.201,
          -79.614
        ],
        "max": [
          16.487,
          -1.617,
          26.711
        ]
      },
      {
        "min": [
          -51.912,
          68.237,
          -71.275
        ],
        "max": [
          13.426,
          74.821,
          15.975
        ]
      },
      {
        "min": [
          -27.838,
          -6.404,
          12.775
        ],
        "max": [
          -16.711,
          69.175,
          20.345
        ]
      },
      {
        "min": [
          -14.465,
          -6.404,
          15.151
        ],
        "max": [
          -5.401,
          69.175,
          20.345
        ]
      },
      {
        "min": [
          -7.151,
          -6.404,
          14.537
        ],
        "max": [
          9.606,
          69.175,
          20.345
        ]
      },
      {
        "min": [
          8.085,
          -6.404,
          4.584
        ],
        "max": [
          13.14,
          69.175,
          19.038
        ]
      },
      {
        "min": [
          8.34,
          -6.404,
          -6.011
        ],
        "max": [
          13.14,
          69.175,
          4.73
        ]
      },
      {
        "min": [
          6.868,
          -6.404,
          -8.842
        ],
        "max": [
          13.14,
          69.175,
          -5.629
        ]
      },
      {
        "min": [
          9.24,
          -6.404,
          -10.573
        ],
        "max": [
          13.14,
          69.175,
          -8.756
        ]
      },
      {
        "min": [
          10.735,
          -6.404,
          -13.789
        ],
        "max": [
          13.14,
          69.175,
          -10.549
        ]
      },
      {
        "min": [
          10.173,
          -6.404,
          -21.314
        ],
        "max": [
          13.14,
          69.175,
          -13.72
        ]
      },
      {
        "min": [
          6.776,
          -6.404,
          -35.04
        ],
        "max": [
          13.14,
          69.175,
          -21.211
        ]
      },
      {
        "min": [
          5.193,
          -6.404,
          -36.896
        ],
        "max": [
          13.14,
          69.175,
          -34.662
        ]
      },
      {
        "min": [
          5.591,
          -6.404,
          -41.839
        ],
        "max": [
          13.14,
          69.175,
          -36.854
        ]
      },
      {
        "min": [
          7.985,
          -6.404,
          -47.795
        ],
        "max": [
          13.852,
          69.175,
          -41.21
        ]
      },
      {
        "min": [
          8.19,
          -6.404,
          -60.35
        ],
        "max": [
          13.852,
          69.175,
          -47.674
        ]
      },
      {
        "min": [
          8.586,
          -6.404,
          -61.956
        ],
        "max": [
          13.852,
          69.175,
          -60.328
        ]
      },
      {
        "min": [
          10.494,
          -6.404,
          -65.627
        ],
        "max": [
          13.852,
          69.175,
          -61.744
        ]
      },
      {
        "min": [
          9.215,
          -6.404,
          -70.168
        ],
        "max": [
          13.852,
          69.175,
          -65.398
        ]
      },
      {
        "min": [
          6.214,
          -6.404,
          -70.168
        ],
        "max": [
          9.358,
          69.175,
          -65.57
        ]
      },
      {
        "min": [
          5.416,
          -6.404,
          -70.168
        ],
        "max": [
          6.459,
          69.175,
          -65.124
        ]
      },
      {
        "min": [
          2.652,
          -6.404,
          -70.168
        ],
        "max": [
          5.424,
          69.175,
          -66.117
        ]
      },
      {
        "min": [
          0.909,
          -6.404,
          -70.168
        ],
        "max": [
          2.786,
          69.175,
          -65.687
        ]
      },
      {
        "min": [
          -5.113,
          -6.404,
          -70.168
        ],
        "max": [
          0.971,
          69.175,
          -67.673
        ]
      },
      {
        "min": [
          -8.258,
          -6.404,
          -70.168
        ],
        "max": [
          -4.665,
          69.175,
          -68.005
        ]
      }
    ]
  },
  "level10007": {
    "id": "level10007",
    "fog": {
      "enabled": true,
      "near": 80.9,
      "far": 145.4,
      "r": 0.35,
      "g": 0.56,
      "b": 0.81
    },
    "sunDirection": [
      -0.37,
      0.35,
      -0.77
    ],
    "ambienceAudio": "go/ambience_2d/alien_boss",
    "deadAABBs": [
      {
        "min": [
          8.399,
          -22.155,
          5.226
        ],
        "max": [
          14.428,
          22.155,
          12.202
        ]
      },
      {
        "min": [
          2.755,
          -22.155,
          11.156
        ],
        "max": [
          8.784,
          22.155,
          16.89
        ]
      },
      {
        "min": [
          -82.763,
          -6.282,
          -45.851
        ],
        "max": [
          22.027,
          -2.029,
          74.65
        ]
      },
      {
        "min": [
          -50.492,
          21.594,
          -34.054
        ],
        "max": [
          17.779,
          25.847,
          66.587
        ]
      },
      {
        "min": [
          -2.145,
          -22.155,
          16.254
        ],
        "max": [
          3.884,
          22.155,
          21.988
        ]
      },
      {
        "min": [
          -6.407,
          -22.155,
          21.544
        ],
        "max": [
          -0.378,
          22.155,
          27.279
        ]
      },
      {
        "min": [
          -10.105,
          -22.155,
          25.717
        ],
        "max": [
          -4.076,
          22.155,
          31.451
        ]
      },
      {
        "min": [
          -15.917,
          -22.155,
          29.315
        ],
        "max": [
          -9.888,
          22.155,
          35.05
        ]
      },
      {
        "min": [
          -21.514,
          -22.155,
          32.596
        ],
        "max": [
          -15.485,
          22.155,
          38.331
        ]
      },
      {
        "min": [
          -27.112,
          -22.155,
          37.99
        ],
        "max": [
          -14.179,
          22.155,
          43.725
        ]
      },
      {
        "min": [
          -49.282,
          -22.155,
          42.974
        ],
        "max": [
          -26.969,
          22.155,
          48.708
        ]
      },
      {
        "min": [
          -52.322,
          -22.155,
          40.144
        ],
        "max": [
          -46.293,
          22.155,
          45.879
        ]
      },
      {
        "min": [
          -54.987,
          -22.155,
          21.525
        ],
        "max": [
          -48.958,
          22.155,
          43.319
        ]
      },
      {
        "min": [
          -52.167,
          -22.155,
          12.975
        ],
        "max": [
          -46.138,
          22.155,
          22.333
        ]
      },
      {
        "min": [
          -51.957,
          -22.155,
          9.74
        ],
        "max": [
          -40.492,
          22.155,
          17.099
        ]
      },
      {
        "min": [
          -41.46,
          -22.155,
          -16.392
        ],
        "max": [
          -35.431,
          22.155,
          12.521
        ]
      },
      {
        "min": [
          -42.483,
          -22.155,
          -22.034
        ],
        "max": [
          -30.32,
          22.155,
          -16.3
        ]
      },
      {
        "min": [
          -33.977,
          -22.155,
          -33.198
        ],
        "max": [
          -27.948,
          22.155,
          -21.636
        ]
      },
      {
        "min": [
          1.589,
          -22.155,
          -31.067
        ],
        "max": [
          7.471,
          22.155,
          -22.013
        ]
      },
      {
        "min": [
          -29.114,
          -22.155,
          -35.285
        ],
        "max": [
          -8.925,
          22.155,
          -29.551
        ]
      },
      {
        "min": [
          -9.594,
          -22.155,
          -34.6
        ],
        "max": [
          7.852,
          22.155,
          -28.866
        ]
      },
      {
        "min": [
          7.238,
          -22.155,
          -6.814
        ],
        "max": [
          13.12,
          22.155,
          5.728
        ]
      },
      {
        "min": [
          6.842,
          -22.155,
          -12.053
        ],
        "max": [
          12.724,
          22.155,
          -6.318
        ]
      },
      {
        "min": [
          5.716,
          -22.155,
          -17.184
        ],
        "max": [
          11.597,
          22.155,
          -11.45
        ]
      },
      {
        "min": [
          3.977,
          -22.155,
          -22.266
        ],
        "max": [
          9.858,
          22.155,
          -16.532
        ]
      }
    ]
  },
  "level10008": {
    "id": "level10008",
    "fog": {
      "enabled": true,
      "near": 46.8,
      "far": 329.8,
      "r": 0.314,
      "g": 0.553,
      "b": 0.769
    },
    "sunDirection": [
      -0.157303,
      0.247191,
      0.460674
    ],
    "ambienceAudio": "go/ambience_2d/alien_boss",
    "deadAABBs": [
      {
        "min": [
          -146.945,
          -57.691,
          -88.93
        ],
        "max": [
          63.495,
          -0.664,
          53.291
        ]
      },
      {
        "min": [
          -154.625,
          72.897,
          -93.908
        ],
        "max": [
          66.882,
          99.713,
          60.587
        ]
      },
      {
        "min": [
          -26.642,
          -39.904,
          -45.922
        ],
        "max": [
          65.977,
          82.548,
          23.429
        ]
      },
      {
        "min": [
          -80.265,
          -39.904,
          15.345
        ],
        "max": [
          -3.05,
          82.548,
          57.941
        ]
      },
      {
        "min": [
          -88.71,
          -39.904,
          9.831
        ],
        "max": [
          -49.994,
          82.548,
          46.17
        ]
      },
      {
        "min": [
          -147.337,
          -39.904,
          -13.994
        ],
        "max": [
          -78.019,
          82.548,
          46.271
        ]
      },
      {
        "min": [
          -147.769,
          -39.904,
          -56.493
        ],
        "max": [
          -121.942,
          82.548,
          -4.977
        ]
      },
      {
        "min": [
          -144.826,
          -39.904,
          -92.828
        ],
        "max": [
          -50.128,
          82.548,
          -49.709
        ]
      },
      {
        "min": [
          -144.679,
          -39.904,
          -62.505
        ],
        "max": [
          -111.788,
          82.548,
          -35.425
        ]
      },
      {
        "min": [
          -136.204,
          -39.904,
          -70.406
        ],
        "max": [
          -103.979,
          82.548,
          -43.859
        ]
      },
      {
        "min": [
          -130.251,
          -39.904,
          -74.128
        ],
        "max": [
          -101.089,
          82.548,
          -47.049
        ]
      },
      {
        "min": [
          -59.984,
          -39.904,
          -71.276
        ],
        "max": [
          -23.419,
          82.548,
          -41.521
        ]
      },
      {
        "min": [
          -56.753,
          -39.904,
          -62.199
        ],
        "max": [
          -12.551,
          82.548,
          -35.426
        ]
      },
      {
        "min": [
          -51.375,
          -39.904,
          -61.812
        ],
        "max": [
          -13.753,
          82.548,
          -31.36
        ]
      },
      {
        "min": [
          -46.508,
          -39.904,
          -41.051
        ],
        "max": [
          -33.573,
          82.548,
          -26.333
        ]
      },
      {
        "min": [
          -36.416,
          -39.904,
          -83.969
        ],
        "max": [
          1.205,
          82.548,
          -9.203
        ]
      },
      {
        "min": [
          -53.768,
          -39.904,
          12.689
        ],
        "max": [
          -39.999,
          82.548,
          19.916
        ]
      },
      {
        "min": [
          -82.272,
          -39.904,
          8.32
        ],
        "max": [
          -64.43,
          82.548,
          15.953
        ]
      },
      {
        "min": [
          -88.209,
          -39.904,
          -3.145
        ],
        "max": [
          -74.709,
          82.548,
          13.513
        ]
      },
      {
        "min": [
          -98.812,
          -39.904,
          -34.225
        ],
        "max": [
          -77.921,
          82.548,
          -4.747
        ]
      },
      {
        "min": [
          -101.791,
          -39.904,
          -25.174
        ],
        "max": [
          -77.438,
          82.548,
          1.906
        ]
      },
      {
        "min": [
          -43.858,
          -39.904,
          -43.78
        ],
        "max": [
          -39.409,
          82.548,
          -16.275
        ]
      },
      {
        "min": [
          -33.053,
          -39.904,
          -26.081
        ],
        "max": [
          -22.008,
          82.548,
          -5.049
        ]
      }
    ]
  },
  "level10009": {
    "id": "level10009",
    "fog": {
      "enabled": true,
      "near": 0,
      "far": 223,
      "r": 0.18,
      "g": 0.079,
      "b": 0.05
    },
    "sunDirection": [
      -0.37,
      0.35,
      -0.77
    ],
    "ambienceAudio": "go/ambience_2d/alien_boss",
    "deadAABBs": [
      {
        "min": [
          -44.163,
          35.111,
          -33.78
        ],
        "max": [
          43.44,
          40.049,
          91.655
        ]
      },
      {
        "min": [
          -38.721,
          -12.793,
          -33.78
        ],
        "max": [
          43.44,
          -7.855,
          91.655
        ]
      },
      {
        "min": [
          -47.342,
          -11.911,
          14.701
        ],
        "max": [
          -37.714,
          35.577,
          40.771
        ]
      },
      {
        "min": [
          17.49,
          -11.911,
          54.971
        ],
        "max": [
          27.118,
          35.577,
          92.138
        ]
      },
      {
        "min": [
          -14.23,
          -11.911,
          50.782
        ],
        "max": [
          -4.603,
          35.577,
          92.138
        ]
      },
      {
        "min": [
          -51.031,
          -11.911,
          38.459
        ],
        "max": [
          -13.842,
          35.577,
          52.245
        ]
      },
      {
        "min": [
          -40.494,
          -11.911,
          30.281
        ],
        "max": [
          -27.591,
          35.577,
          39.663
        ]
      },
      {
        "min": [
          -49.563,
          -11.911,
          -4.936
        ],
        "max": [
          -39.936,
          35.577,
          16.105
        ]
      },
      {
        "min": [
          -49.563,
          -11.911,
          -36.357
        ],
        "max": [
          -30.014,
          35.577,
          -19.169
        ]
      },
      {
        "min": [
          -54.13,
          -11.911,
          -21.457
        ],
        "max": [
          -40.399,
          35.577,
          -4.269
        ]
      },
      {
        "min": [
          -35.207,
          -11.911,
          -40.863
        ],
        "max": [
          -21.476,
          35.577,
          -25.542
        ]
      },
      {
        "min": [
          -25.823,
          -11.911,
          -45.603
        ],
        "max": [
          -4.49,
          35.577,
          -30.283
        ]
      },
      {
        "min": [
          -5.192,
          -11.911,
          -45.603
        ],
        "max": [
          16.142,
          35.577,
          -30.283
        ]
      },
      {
        "min": [
          7.835,
          -11.911,
          -38.713
        ],
        "max": [
          29.168,
          35.577,
          -23.393
        ]
      },
      {
        "min": [
          37.448,
          -11.911,
          -13.585
        ],
        "max": [
          58.782,
          35.577,
          32.439
        ]
      },
      {
        "min": [
          27.217,
          -11.911,
          -28.064
        ],
        "max": [
          48.551,
          35.577,
          -12.743
        ]
      },
      {
        "min": [
          30.953,
          -11.911,
          31.974
        ],
        "max": [
          52.287,
          35.577,
          47.295
        ]
      },
      {
        "min": [
          25.93,
          -11.911,
          45.017
        ],
        "max": [
          35.794,
          35.577,
          60.338
        ]
      },
      {
        "min": [
          -14.23,
          -11.911,
          86.891
        ],
        "max": [
          22.357,
          35.577,
          100.147
        ]
      }
    ]
  },
  "level10010": {
    "id": "level10010",
    "fog": {
      "enabled": true,
      "near": 100,
      "far": 800,
      "r": 0.333,
      "g": 0.5,
      "b": 0.725
    },
    "sunDirection": [
      -1,
      1,
      -0.5
    ],
    "ambienceAudio": "go/ambience_2d/alien_boss",
    "deadAABBs": [
      {
        "min": [
          29.738,
          -74.564,
          -114.267
        ],
        "max": [
          178.865,
          74.564,
          432.139
        ]
      },
      {
        "min": [
          -183.237,
          -74.564,
          -247.097
        ],
        "max": [
          90.169,
          74.564,
          -33.252
        ]
      },
      {
        "min": [
          -181.579,
          -74.564,
          -101.673
        ],
        "max": [
          -32.452,
          74.564,
          436.706
        ]
      },
      {
        "min": [
          -55.454,
          -88.39,
          -114.267
        ],
        "max": [
          93.673,
          -7.909,
          74.564
        ]
      },
      {
        "min": [
          -63.579,
          -74.564,
          30.6
        ],
        "max": [
          -10.246,
          74.564,
          67.499
        ]
      },
      {
        "min": [
          -75.197,
          52.535,
          -104.898
        ],
        "max": [
          73.931,
          107.22,
          83.933
        ]
      },
      {
        "min": [
          -75.197,
          -88.39,
          37.099
        ],
        "max": [
          73.931,
          74.564,
          402.756
        ]
      }
    ]
  },
  "level11": {
    "id": "level11",
    "fog": {
      "enabled": true,
      "near": 45,
      "far": 223.4,
      "r": 0.93,
      "g": 0.949,
      "b": 0.906
    },
    "sunDirection": [
      0.4,
      0.6,
      0.7
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          15.331,
          -0.6,
          -2.738
        ],
        "max": [
          24.324,
          4.768,
          9.301
        ]
      },
      {
        "min": [
          16.469,
          -1.278,
          13.879
        ],
        "max": [
          19.866,
          2.94,
          22.253
        ]
      },
      {
        "min": [
          3.57,
          -0.665,
          15.057
        ],
        "max": [
          7.699,
          2.743,
          24.307
        ]
      },
      {
        "min": [
          -8.186,
          -2.541,
          28.996
        ],
        "max": [
          -3.87,
          0.867,
          37.887
        ]
      },
      {
        "min": [
          -8.568,
          -0.571,
          15.223
        ],
        "max": [
          -1.995,
          3.443,
          20.47
        ]
      },
      {
        "min": [
          -25.207,
          -0.571,
          15.675
        ],
        "max": [
          -21.464,
          4.19,
          27.587
        ]
      },
      {
        "min": [
          -25.033,
          3.88,
          15.757
        ],
        "max": [
          -17.313,
          7.895,
          27.518
        ]
      },
      {
        "min": [
          -31.911,
          -0.571,
          15.872
        ],
        "max": [
          -25.346,
          4.402,
          19.821
        ]
      },
      {
        "min": [
          32.718,
          -0.829,
          -2.092
        ],
        "max": [
          35.917,
          2.082,
          3.436
        ]
      },
      {
        "min": [
          21.963,
          -1.346,
          -21.301
        ],
        "max": [
          27.035,
          1.762,
          -12.044
        ]
      },
      {
        "min": [
          17.812,
          -1.648,
          -31.6
        ],
        "max": [
          21.803,
          1.46,
          -27.607
        ]
      },
      {
        "min": [
          3.863,
          -0.294,
          -21.209
        ],
        "max": [
          15.628,
          4.138,
          -17.46
        ]
      },
      {
        "min": [
          -8.819,
          -1.442,
          -20.845
        ],
        "max": [
          -0.031,
          2.876,
          -16.495
        ]
      },
      {
        "min": [
          -33.173,
          -2.358,
          -40.786
        ],
        "max": [
          -29.18,
          1.385,
          -36.794
        ]
      },
      {
        "min": [
          -27.991,
          -0.294,
          -28.82
        ],
        "max": [
          -17.283,
          6.562,
          -22.949
        ]
      },
      {
        "min": [
          -26.713,
          -0.294,
          -30.812
        ],
        "max": [
          -17.841,
          3.744,
          -28.053
        ]
      },
      {
        "min": [
          15.326,
          -2.67,
          -5.693
        ],
        "max": [
          24.134,
          0.137,
          0.99
        ]
      },
      {
        "min": [
          -25.417,
          -2.762,
          -33.373
        ],
        "max": [
          -17.807,
          0.13,
          -30.836
        ]
      },
      {
        "min": [
          -24.584,
          -1.709,
          -15.979
        ],
        "max": [
          -17.359,
          2.691,
          -3.675
        ]
      },
      {
        "min": [
          -21.717,
          -0.294,
          -0.483
        ],
        "max": [
          -14.476,
          7.56,
          4.253
        ]
      },
      {
        "min": [
          -21.693,
          -0.294,
          4.373
        ],
        "max": [
          -15.905,
          6.585,
          9.683
        ]
      },
      {
        "min": [
          -23.797,
          -0.294,
          -0.643
        ],
        "max": [
          -21.949,
          4.209,
          8.34
        ]
      },
      {
        "min": [
          -26.295,
          -2.163,
          -0.671
        ],
        "max": [
          -23.889,
          0.482,
          6.96
        ]
      },
      {
        "min": [
          -36.534,
          -2.283,
          -2.437
        ],
        "max": [
          -32.589,
          1.46,
          1.599
        ]
      },
      {
        "min": [
          13.572,
          -2.67,
          -5.392
        ],
        "max": [
          14.406,
          0.137,
          -4.181
        ]
      }
    ]
  },
  "level12": {
    "id": "level12",
    "fog": {
      "enabled": true,
      "near": 20,
      "far": 180.8,
      "r": 0,
      "g": 0.076,
      "b": 0.257
    },
    "sunDirection": [
      0,
      1,
      -0.2
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          3.818,
          -4.645,
          -29.028
        ],
        "max": [
          11.021,
          4.645,
          -20.793
        ]
      },
      {
        "min": [
          4.95,
          -4.645,
          -21.127
        ],
        "max": [
          10.81,
          2.599,
          -18.972
        ]
      },
      {
        "min": [
          -10.075,
          -2.927,
          -23.697
        ],
        "max": [
          -4.431,
          2.183,
          -17.471
        ]
      },
      {
        "min": [
          -10.739,
          -2.927,
          -14.073
        ],
        "max": [
          -4.906,
          6.275,
          -5.668
        ]
      },
      {
        "min": [
          -15.193,
          -2.927,
          -14.073
        ],
        "max": [
          -9.389,
          1.651,
          -11.728
        ]
      },
      {
        "min": [
          8.007,
          -2.927,
          -13.857
        ],
        "max": [
          18.205,
          6.275,
          -8.313
        ]
      },
      {
        "min": [
          17.801,
          -2.927,
          -13.749
        ],
        "max": [
          19.206,
          2.602,
          -11.605
        ]
      },
      {
        "min": [
          5.943,
          -2.927,
          -11.974
        ],
        "max": [
          8.358,
          1.208,
          -8.313
        ]
      },
      {
        "min": [
          4.878,
          -2.927,
          5.641
        ],
        "max": [
          10.711,
          6.275,
          14.046
        ]
      },
      {
        "min": [
          9.41,
          -2.927,
          11.724
        ],
        "max": [
          15.215,
          1.651,
          14.069
        ]
      },
      {
        "min": [
          -18.208,
          -2.927,
          8.333
        ],
        "max": [
          -8.01,
          6.275,
          13.837
        ]
      },
      {
        "min": [
          -8.367,
          -2.927,
          8.28
        ],
        "max": [
          -5.952,
          1.208,
          11.94
        ]
      },
      {
        "min": [
          -19.182,
          -2.927,
          11.648
        ],
        "max": [
          -17.777,
          2.602,
          13.792
        ]
      },
      {
        "min": [
          -11.032,
          -4.645,
          20.805
        ],
        "max": [
          -3.83,
          4.645,
          29.04
        ]
      },
      {
        "min": [
          -10.784,
          -4.645,
          18.99
        ],
        "max": [
          -4.924,
          2.599,
          21.144
        ]
      },
      {
        "min": [
          4.412,
          -2.927,
          17.506
        ],
        "max": [
          10.057,
          2.183,
          23.732
        ]
      },
      {
        "min": [
          -1.59,
          -0.446,
          -1.753
        ],
        "max": [
          1.547,
          0.852,
          1.727
        ]
      },
      {
        "min": [
          -2.881,
          -2.927,
          -56.002
        ],
        "max": [
          20.058,
          131.473,
          -37.255
        ]
      },
      {
        "min": [
          17.824,
          -2.927,
          -52.465
        ],
        "max": [
          40.763,
          131.473,
          -20.088
        ]
      },
      {
        "min": [
          23.581,
          -2.927,
          -34.712
        ],
        "max": [
          46.52,
          131.473,
          -2.336
        ]
      },
      {
        "min": [
          26.068,
          -2.927,
          -26.393
        ],
        "max": [
          49.007,
          131.473,
          5.983
        ]
      },
      {
        "min": [
          31.323,
          -2.927,
          -12.012
        ],
        "max": [
          54.262,
          131.473,
          20.365
        ]
      },
      {
        "min": [
          22.468,
          -2.927,
          13.452
        ],
        "max": [
          45.407,
          131.473,
          45.829
        ]
      },
      {
        "min": [
          18.952,
          -2.927,
          20.087
        ],
        "max": [
          41.891,
          131.473,
          52.463
        ]
      },
      {
        "min": [
          1.841,
          -2.927,
          40.013
        ],
        "max": [
          24.78,
          131.473,
          72.39
        ]
      }
    ]
  },
  "level13": {
    "id": "level13",
    "fog": {
      "enabled": true,
      "near": 21.3,
      "far": 397.2,
      "r": 0.714,
      "g": 0.863,
      "b": 0.953
    },
    "sunDirection": [
      -0.45,
      0.6,
      0.74
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -8.961,
          -2.054,
          -11.546
        ],
        "max": [
          -0.107,
          2.054,
          -8.686
        ]
      },
      {
        "min": [
          -2.172,
          -2.054,
          -22.56
        ],
        "max": [
          9.256,
          2.054,
          -18.151
        ]
      },
      {
        "min": [
          20.479,
          -2.047,
          -25.382
        ],
        "max": [
          27.891,
          8.368,
          -13.023
        ]
      },
      {
        "min": [
          14.328,
          -4.352,
          -25.178
        ],
        "max": [
          24.928,
          3.291,
          -5.409
        ]
      },
      {
        "min": [
          6.569,
          -8.126,
          -25.529
        ],
        "max": [
          17.169,
          -0.483,
          -18.554
        ]
      },
      {
        "min": [
          22.148,
          -8.167,
          -18.95
        ],
        "max": [
          25.136,
          -0.523,
          0.82
        ]
      },
      {
        "min": [
          17.817,
          -3.018,
          -5.358
        ],
        "max": [
          22.13,
          4.625,
          -0.146
        ]
      },
      {
        "min": [
          15.749,
          -4.881,
          -5.321
        ],
        "max": [
          17.783,
          2.762,
          -1.109
        ]
      },
      {
        "min": [
          9.61,
          -2.054,
          -21.246
        ],
        "max": [
          14.382,
          2.054,
          -16.837
        ]
      },
      {
        "min": [
          11.613,
          -2.605,
          -18.902
        ],
        "max": [
          16.768,
          1.256,
          -14.522
        ]
      },
      {
        "min": [
          -15.215,
          -2.054,
          -25.141
        ],
        "max": [
          -9.715,
          2.381,
          -18.144
        ]
      },
      {
        "min": [
          -27.598,
          -2.054,
          -22.396
        ],
        "max": [
          -19.864,
          4.893,
          -11.096
        ]
      },
      {
        "min": [
          -30.926,
          -4.465,
          -16.42
        ],
        "max": [
          -27.539,
          2.482,
          -11.331
        ]
      },
      {
        "min": [
          -31.036,
          -4.548,
          -20.679
        ],
        "max": [
          -27.552,
          0.225,
          -11.179
        ]
      },
      {
        "min": [
          -31.4,
          -2.466,
          -6.224
        ],
        "max": [
          -24.05,
          4.48,
          0.375
        ]
      },
      {
        "min": [
          -20.547,
          -2.466,
          2.727
        ],
        "max": [
          -16.024,
          4.48,
          7.074
        ]
      },
      {
        "min": [
          -7.107,
          -2.466,
          17.046
        ],
        "max": [
          -2.584,
          4.48,
          20.13
        ]
      },
      {
        "min": [
          -0.139,
          -2.466,
          23.653
        ],
        "max": [
          6.225,
          4.48,
          34.74
        ]
      },
      {
        "min": [
          11.197,
          -2.466,
          20.127
        ],
        "max": [
          22.389,
          4.48,
          27.585
        ]
      },
      {
        "min": [
          11.038,
          -2.793,
          27.511
        ],
        "max": [
          16.427,
          2.29,
          30.523
        ]
      },
      {
        "min": [
          16.291,
          -5.008,
          27.526
        ],
        "max": [
          20.7,
          -0.07,
          30.785
        ]
      },
      {
        "min": [
          19.541,
          -2.466,
          10.7
        ],
        "max": [
          25.194,
          4.11,
          15.247
        ]
      },
      {
        "min": [
          22.825,
          -2.466,
          8.678
        ],
        "max": [
          25.281,
          0.616,
          10.932
        ]
      },
      {
        "min": [
          14.656,
          -2.466,
          3.926
        ],
        "max": [
          17.469,
          3.118,
          8.478
        ]
      },
      {
        "min": [
          3.355,
          -3.415,
          8.605
        ],
        "max": [
          8.832,
          3.694,
          13.062
        ]
      }
    ]
  },
  "level14": {
    "id": "level14",
    "fog": {
      "enabled": true,
      "near": 20,
      "far": 500,
      "r": 1,
      "g": 0.761,
      "b": 0.427
    },
    "sunDirection": [
      0.65,
      0.5,
      -0.55
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          10.296,
          -3.586,
          8.952
        ],
        "max": [
          23.339,
          5.942,
          22.13
        ]
      },
      {
        "min": [
          7.36,
          -5.325,
          8.616
        ],
        "max": [
          14.477,
          4.202,
          22.107
        ]
      },
      {
        "min": [
          12.114,
          -3.586,
          19.28
        ],
        "max": [
          25.156,
          5.942,
          28.208
        ]
      },
      {
        "min": [
          12.058,
          -6.625,
          23.946
        ],
        "max": [
          25.051,
          2.903,
          32.874
        ]
      },
      {
        "min": [
          16.049,
          -8.62,
          26.602
        ],
        "max": [
          26.953,
          0.908,
          35.53
        ]
      },
      {
        "min": [
          -8.81,
          0.333,
          10.21
        ],
        "max": [
          -5.638,
          8.294,
          14.681
        ]
      },
      {
        "min": [
          -6.751,
          -2.515,
          18.507
        ],
        "max": [
          -4.445,
          5.446,
          22.519
        ]
      },
      {
        "min": [
          -17.429,
          -1.09,
          13.626
        ],
        "max": [
          -13.91,
          6.871,
          17.638
        ]
      },
      {
        "min": [
          -16.801,
          -3.348,
          17.255
        ],
        "max": [
          -13.244,
          4.613,
          21.266
        ]
      },
      {
        "min": [
          -16.607,
          -5.68,
          21.086
        ],
        "max": [
          -12.283,
          2.281,
          25.097
        ]
      },
      {
        "min": [
          -3.451,
          0.333,
          36.431
        ],
        "max": [
          0.108,
          4.2,
          46.172
        ]
      },
      {
        "min": [
          -0.286,
          0.333,
          42.097
        ],
        "max": [
          3.272,
          2.03,
          48.87
        ]
      },
      {
        "min": [
          2.689,
          -1.047,
          43.951
        ],
        "max": [
          5.896,
          0.65,
          47.587
        ]
      },
      {
        "min": [
          -5.204,
          0.333,
          38.234
        ],
        "max": [
          1.605,
          4.2,
          41.714
        ]
      },
      {
        "min": [
          -14.712,
          -1.561,
          -12.462
        ],
        "max": [
          -6.131,
          8.294,
          -9.028
        ]
      },
      {
        "min": [
          -23.71,
          -3.128,
          -24.664
        ],
        "max": [
          -13.591,
          8.071,
          -10.89
        ]
      },
      {
        "min": [
          -17.526,
          -3.817,
          -16.804
        ],
        "max": [
          -7.407,
          4.144,
          -11.454
        ]
      },
      {
        "min": [
          -13.621,
          -2.981,
          -22.227
        ],
        "max": [
          -6.282,
          8.94,
          -17.007
        ]
      },
      {
        "min": [
          -25.648,
          0.959,
          -28.54
        ],
        "max": [
          -11.998,
          5.693,
          -19.595
        ]
      },
      {
        "min": [
          -26.649,
          -3.797,
          -35.575
        ],
        "max": [
          -16.139,
          0.937,
          -26.63
        ]
      },
      {
        "min": [
          -25.648,
          -2.064,
          -33.007
        ],
        "max": [
          -11.998,
          2.67,
          -24.062
        ]
      },
      {
        "min": [
          -2.957,
          -3.021,
          -49.01
        ],
        "max": [
          5.656,
          1.714,
          -43.265
        ]
      },
      {
        "min": [
          -1.575,
          -0.498,
          -44.237
        ],
        "max": [
          7.038,
          4.237,
          -37.935
        ]
      },
      {
        "min": [
          13.903,
          1.141,
          -19.359
        ],
        "max": [
          22.516,
          5.875,
          -13.058
        ]
      },
      {
        "min": [
          12.778,
          -1.436,
          -23.352
        ],
        "max": [
          21.391,
          3.298,
          -19.164
        ]
      }
    ]
  },
  "level15": {
    "id": "level15",
    "fog": {
      "enabled": true,
      "near": 26.9,
      "far": 336.9,
      "r": 1,
      "g": 0.678,
      "b": 0.384
    },
    "sunDirection": [
      -0.26,
      0.29,
      0.187
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": []
  },
  "level16": {
    "id": "level16",
    "fog": {
      "enabled": true,
      "near": 43,
      "far": 336,
      "r": 0.812,
      "g": 0.765,
      "b": 0.957
    },
    "sunDirection": [
      0.6,
      0.4,
      0
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -0.181,
          -8.746,
          44.302
        ],
        "max": [
          17.13,
          1.254,
          55.928
        ]
      },
      {
        "min": [
          2.181,
          -4.869,
          41.235
        ],
        "max": [
          8.176,
          5.773,
          45.688
        ]
      },
      {
        "min": [
          -3.313,
          -5.564,
          40.118
        ],
        "max": [
          2.039,
          3.425,
          49.571
        ]
      },
      {
        "min": [
          -3.465,
          -8.872,
          49.648
        ],
        "max": [
          1.468,
          -0.186,
          53.327
        ]
      },
      {
        "min": [
          -7.036,
          -4.66,
          29.207
        ],
        "max": [
          -4.018,
          2.692,
          33.46
        ]
      },
      {
        "min": [
          -10.579,
          -4.66,
          15.059
        ],
        "max": [
          -7.588,
          2.692,
          23.791
        ]
      },
      {
        "min": [
          -1.448,
          -4.445,
          20.827
        ],
        "max": [
          7.33,
          2.906,
          23.768
        ]
      },
      {
        "min": [
          17.732,
          -4.916,
          21.884
        ],
        "max": [
          20.749,
          2.435,
          26.137
        ]
      },
      {
        "min": [
          9.905,
          -4.66,
          -8.352
        ],
        "max": [
          20.303,
          3.838,
          3.205
        ]
      },
      {
        "min": [
          10.021,
          -5.356,
          -11.098
        ],
        "max": [
          13.7,
          2.265,
          -8.45
        ]
      },
      {
        "min": [
          13.471,
          -7.459,
          -11.098
        ],
        "max": [
          18.164,
          0.162,
          -8.45
        ]
      },
      {
        "min": [
          -1.579,
          -4.66,
          -0.773
        ],
        "max": [
          4.681,
          3.544,
          2.407
        ]
      },
      {
        "min": [
          -4.736,
          -6.788,
          -2.315
        ],
        "max": [
          1.487,
          1.416,
          0.611
        ]
      },
      {
        "min": [
          -0.535,
          -7.975,
          -2.515
        ],
        "max": [
          4.759,
          0.228,
          -0.801
        ]
      },
      {
        "min": [
          -19.753,
          -5.671,
          -3.205
        ],
        "max": [
          -9.976,
          2.533,
          8.363
        ]
      },
      {
        "min": [
          -13.791,
          -6.49,
          8.435
        ],
        "max": [
          -9.889,
          1.713,
          11.028
        ]
      },
      {
        "min": [
          -16.822,
          -8.267,
          8.437
        ],
        "max": [
          -12.829,
          -0.064,
          11.144
        ]
      },
      {
        "min": [
          -0.62,
          -4.916,
          8.544
        ],
        "max": [
          3.575,
          2.435,
          11.628
        ]
      },
      {
        "min": [
          -4.975,
          -4.916,
          -12.033
        ],
        "max": [
          -0.302,
          2.435,
          -8.8
        ]
      },
      {
        "min": [
          -7.916,
          -4.916,
          -23.93
        ],
        "max": [
          3.271,
          2.435,
          -20.194
        ]
      },
      {
        "min": [
          8.714,
          -4.916,
          -24.227
        ],
        "max": [
          11.897,
          2.435,
          -15.032
        ]
      },
      {
        "min": [
          4.09,
          -4.916,
          -33.468
        ],
        "max": [
          7.177,
          2.435,
          -28.778
        ]
      },
      {
        "min": [
          -20.959,
          -4.916,
          -27.254
        ],
        "max": [
          -17.916,
          2.435,
          -22.247
        ]
      },
      {
        "min": [
          -11.888,
          -6.494,
          -62.922
        ],
        "max": [
          0.549,
          0.857,
          -44.131
        ]
      },
      {
        "min": [
          -8.098,
          -3.147,
          -49.709
        ],
        "max": [
          0.609,
          4.204,
          -41.312
        ]
      }
    ]
  },
  "level17": {
    "id": "level17",
    "fog": {
      "enabled": true,
      "near": 100,
      "far": 500,
      "r": 0.33,
      "g": 0.516,
      "b": 1
    },
    "sunDirection": [
      1,
      0.6,
      0.2
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -12.518,
          0.976,
          -39.527
        ],
        "max": [
          4.763,
          5.907,
          -32.838
        ]
      },
      {
        "min": [
          -2.04,
          -0.921,
          -43.157
        ],
        "max": [
          4.763,
          4.357,
          -39.39
        ]
      },
      {
        "min": [
          -10.993,
          0.976,
          -40.473
        ],
        "max": [
          -7.331,
          6.254,
          -32.195
        ]
      },
      {
        "min": [
          -14.729,
          0.976,
          -37.854
        ],
        "max": [
          -12.579,
          2.537,
          -34.49
        ]
      },
      {
        "min": [
          -6.671,
          -0.196,
          -43.157
        ],
        "max": [
          1.925,
          1.731,
          -39.39
        ]
      },
      {
        "min": [
          8.293,
          1.182,
          -33.333
        ],
        "max": [
          10.972,
          3.691,
          -30.344
        ]
      },
      {
        "min": [
          9.703,
          1.182,
          -42.652
        ],
        "max": [
          10.886,
          2.906,
          -41.425
        ]
      },
      {
        "min": [
          11.664,
          1.182,
          -42.23
        ],
        "max": [
          18.919,
          4.767,
          -39.751
        ]
      },
      {
        "min": [
          12.634,
          1.182,
          -43.736
        ],
        "max": [
          15.028,
          4.767,
          -39.269
        ]
      },
      {
        "min": [
          14.915,
          1.182,
          -42.43
        ],
        "max": [
          18.045,
          4.767,
          -38.419
        ]
      },
      {
        "min": [
          -26.361,
          1.182,
          -32.294
        ],
        "max": [
          -22.175,
          4.767,
          -27.845
        ]
      },
      {
        "min": [
          -30.058,
          1.182,
          -28.181
        ],
        "max": [
          -25.873,
          4.767,
          -23.732
        ]
      },
      {
        "min": [
          -20.869,
          1.182,
          -32.387
        ],
        "max": [
          -19.03,
          4.767,
          -28.504
        ]
      },
      {
        "min": [
          -21.702,
          1.182,
          -31.385
        ],
        "max": [
          -18.127,
          4.767,
          -29.479
        ]
      },
      {
        "min": [
          -28.063,
          1.182,
          -30.426
        ],
        "max": [
          -23.878,
          4.767,
          -25.977
        ]
      },
      {
        "min": [
          -37.665,
          1.182,
          -18.417
        ],
        "max": [
          -34.2,
          3.691,
          -12.646
        ]
      },
      {
        "min": [
          -38.734,
          1.182,
          -17.359
        ],
        "max": [
          -33.115,
          3.691,
          -13.892
        ]
      },
      {
        "min": [
          34.108,
          1.182,
          12.709
        ],
        "max": [
          37.573,
          3.691,
          18.479
        ]
      },
      {
        "min": [
          33.039,
          1.182,
          13.766
        ],
        "max": [
          38.658,
          3.691,
          17.233
        ]
      },
      {
        "min": [
          -11.029,
          1.182,
          31.133
        ],
        "max": [
          -8.35,
          3.691,
          34.121
        ]
      },
      {
        "min": [
          22.103,
          1.182,
          27.887
        ],
        "max": [
          26.289,
          4.767,
          32.337
        ]
      },
      {
        "min": [
          24.206,
          1.182,
          25.704
        ],
        "max": [
          28.211,
          4.767,
          29.925
        ]
      },
      {
        "min": [
          25.857,
          1.182,
          23.697
        ],
        "max": [
          29.932,
          4.767,
          28.01
        ]
      },
      {
        "min": [
          18.488,
          1.182,
          28.952
        ],
        "max": [
          21.197,
          7.675,
          31.738
        ]
      },
      {
        "min": [
          -4.9,
          0.976,
          39.486
        ],
        "max": [
          2.06,
          4.288,
          43.253
        ]
      }
    ]
  },
  "level18": {
    "id": "level18",
    "fog": {
      "enabled": true,
      "near": 100,
      "far": 407,
      "r": 0.882,
      "g": 0.659,
      "b": 0.6
    },
    "sunDirection": [
      -0.405,
      0.542,
      0.081
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          5.119,
          -1.255,
          54.402
        ],
        "max": [
          20.469,
          4.286,
          62.507
        ]
      },
      {
        "min": [
          19.912,
          -1.255,
          54.975
        ],
        "max": [
          22.835,
          4.286,
          61.133
        ]
      },
      {
        "min": [
          22.555,
          -1.255,
          56.431
        ],
        "max": [
          24.795,
          1.397,
          59.588
        ]
      },
      {
        "min": [
          5.119,
          -1.255,
          62.037
        ],
        "max": [
          8.415,
          4.286,
          65.058
        ]
      },
      {
        "min": [
          7.408,
          -1.255,
          62.037
        ],
        "max": [
          13.556,
          2.101,
          65.058
        ]
      },
      {
        "min": [
          13.222,
          -2.052,
          62.037
        ],
        "max": [
          16.912,
          0.235,
          65.058
        ]
      },
      {
        "min": [
          -4.674,
          -1.255,
          37.281
        ],
        "max": [
          2.461,
          2.927,
          44.735
        ]
      },
      {
        "min": [
          -3.116,
          -1.255,
          45.137
        ],
        "max": [
          0.719,
          1.905,
          46.963
        ]
      },
      {
        "min": [
          -3.268,
          -1.255,
          54.67
        ],
        "max": [
          -0.806,
          2.927,
          57.059
        ]
      },
      {
        "min": [
          25.326,
          -1.255,
          46.503
        ],
        "max": [
          28.567,
          2.801,
          49.572
        ]
      },
      {
        "min": [
          21.335,
          -1.255,
          35.574
        ],
        "max": [
          24.576,
          4.463,
          42.462
        ]
      },
      {
        "min": [
          16.408,
          -1.255,
          28.458
        ],
        "max": [
          19.566,
          2.386,
          31.444
        ]
      },
      {
        "min": [
          3.336,
          -1.255,
          27.48
        ],
        "max": [
          6.581,
          2.386,
          30.706
        ]
      },
      {
        "min": [
          6.31,
          -1.255,
          27.607
        ],
        "max": [
          8.87,
          1.824,
          29.346
        ]
      },
      {
        "min": [
          1.095,
          -1.255,
          28.657
        ],
        "max": [
          3.656,
          1.824,
          30.397
        ]
      },
      {
        "min": [
          -9.423,
          -1.255,
          26.752
        ],
        "max": [
          -5.163,
          4.469,
          30.896
        ]
      },
      {
        "min": [
          -14.287,
          -1.255,
          12.397
        ],
        "max": [
          -9.321,
          3.295,
          19.672
        ]
      },
      {
        "min": [
          -11.627,
          -1.255,
          20.196
        ],
        "max": [
          -9.827,
          1.819,
          21.952
        ]
      },
      {
        "min": [
          10.161,
          -1.255,
          9.375
        ],
        "max": [
          15.921,
          3.295,
          20.682
        ]
      },
      {
        "min": [
          10.181,
          -1.255,
          -1.634
        ],
        "max": [
          13.376,
          3.295,
          5.581
        ]
      },
      {
        "min": [
          -16.595,
          -1.255,
          5.322
        ],
        "max": [
          -13.285,
          1.819,
          8.539
        ]
      },
      {
        "min": [
          -13.645,
          -1.255,
          -5.665
        ],
        "max": [
          -10.45,
          3.295,
          1.551
        ]
      },
      {
        "min": [
          13.237,
          -1.255,
          -8.647
        ],
        "max": [
          16.547,
          1.819,
          -5.43
        ]
      },
      {
        "min": [
          -15.966,
          -1.255,
          -20.434
        ],
        "max": [
          -10.206,
          3.295,
          -9.127
        ]
      },
      {
        "min": [
          9.25,
          -1.255,
          -19.589
        ],
        "max": [
          14.216,
          3.295,
          -12.314
        ]
      }
    ]
  },
  "level19": {
    "id": "level19",
    "fog": {
      "enabled": true,
      "near": 70,
      "far": 309.1,
      "r": 0.208,
      "g": 0.153,
      "b": 0.29
    },
    "sunDirection": [
      0,
      0.6,
      -1
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          59.744,
          -2.99,
          3.697
        ],
        "max": [
          64.518,
          2.99,
          10.954
        ]
      },
      {
        "min": [
          58.33,
          -2.99,
          5.073
        ],
        "max": [
          65.933,
          2.99,
          9.731
        ]
      },
      {
        "min": [
          54.364,
          -2.99,
          14.186
        ],
        "max": [
          59.949,
          2.99,
          19.482
        ]
      },
      {
        "min": [
          56.255,
          -2.99,
          10.633
        ],
        "max": [
          62.33,
          2.99,
          20.332
        ]
      },
      {
        "min": [
          58.638,
          -2.99,
          19.31
        ],
        "max": [
          61.721,
          2.99,
          22.211
        ]
      },
      {
        "min": [
          61.743,
          -3.944,
          12.201
        ],
        "max": [
          67.087,
          -0.641,
          20.217
        ]
      },
      {
        "min": [
          53.146,
          -2.99,
          16.129
        ],
        "max": [
          56.117,
          2.99,
          18.562
        ]
      },
      {
        "min": [
          42.717,
          -2.99,
          19.715
        ],
        "max": [
          45.264,
          2.571,
          22.241
        ]
      },
      {
        "min": [
          43.688,
          -4.174,
          -1.3
        ],
        "max": [
          44.896,
          1.806,
          -0.002
        ]
      },
      {
        "min": [
          38.46,
          -2.99,
          -7.671
        ],
        "max": [
          42.014,
          2.99,
          -0.679
        ]
      },
      {
        "min": [
          36.644,
          -2.99,
          -6.026
        ],
        "max": [
          43.151,
          2.99,
          -2.456
        ]
      },
      {
        "min": [
          33.933,
          -2.99,
          9.398
        ],
        "max": [
          39.11,
          2.99,
          14.385
        ]
      },
      {
        "min": [
          28.752,
          -2.99,
          8.089
        ],
        "max": [
          33.929,
          2.99,
          13.076
        ]
      },
      {
        "min": [
          38.736,
          -2.99,
          8.235
        ],
        "max": [
          41.977,
          2.99,
          11.383
        ]
      },
      {
        "min": [
          40.141,
          -2.99,
          12.412
        ],
        "max": [
          41.358,
          2.99,
          13.693
        ]
      },
      {
        "min": [
          39.714,
          -2.99,
          13.908
        ],
        "max": [
          40.931,
          1.747,
          15.451
        ]
      },
      {
        "min": [
          49.422,
          -1.011,
          -4.698
        ],
        "max": [
          52.287,
          4.55,
          -1.977
        ]
      },
      {
        "min": [
          52.602,
          -1.011,
          -3.862
        ],
        "max": [
          55.467,
          4.55,
          -1.14
        ]
      },
      {
        "min": [
          16.13,
          -2.99,
          4.312
        ],
        "max": [
          21.705,
          2.99,
          7.584
        ]
      },
      {
        "min": [
          17.325,
          -2.99,
          3.194
        ],
        "max": [
          20.51,
          2.99,
          8.702
        ]
      },
      {
        "min": [
          10.255,
          -2.99,
          15.176
        ],
        "max": [
          13.256,
          2.99,
          17.987
        ]
      },
      {
        "min": [
          13.569,
          -2.99,
          16.065
        ],
        "max": [
          16.571,
          2.99,
          18.876
        ]
      },
      {
        "min": [
          -21.831,
          -1.274,
          -7.501
        ],
        "max": [
          -16.256,
          4.705,
          -4.228
        ]
      },
      {
        "min": [
          -20.635,
          -1.274,
          -8.618
        ],
        "max": [
          -17.451,
          4.705,
          -3.11
        ]
      },
      {
        "min": [
          0.475,
          -3.225,
          12.675
        ],
        "max": [
          3.476,
          2.755,
          15.486
        ]
      }
    ]
  },
  "level2": {
    "id": "level2",
    "fog": {
      "enabled": true,
      "near": 18.4,
      "far": 294.3,
      "r": 0.855,
      "g": 0.796,
      "b": 0.643
    },
    "sunDirection": [
      0.4,
      0.5,
      -0.3
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -0.588,
          -18.974,
          -30.724
        ],
        "max": [
          19.497,
          0.648,
          39.835
        ]
      },
      {
        "min": [
          -18.931,
          -17.729,
          -40.387
        ],
        "max": [
          0.869,
          0.648,
          31.822
        ]
      },
      {
        "min": [
          15.087,
          -15.234,
          -21.848
        ],
        "max": [
          32.672,
          0.648,
          17.973
        ]
      },
      {
        "min": [
          -68.247,
          -5.355,
          -4.642
        ],
        "max": [
          -58.764,
          4.979,
          7.681
        ]
      },
      {
        "min": [
          -62.479,
          -5.355,
          7.224
        ],
        "max": [
          -58.764,
          3.82,
          10.409
        ]
      },
      {
        "min": [
          -68.046,
          -5.355,
          7.224
        ],
        "max": [
          -62.186,
          0.27,
          10.409
        ]
      },
      {
        "min": [
          -53.828,
          -5.355,
          -14.404
        ],
        "max": [
          -50.541,
          3.334,
          -8.647
        ]
      },
      {
        "min": [
          -62.526,
          -5.355,
          -7.994
        ],
        "max": [
          -58.933,
          1.571,
          -5.196
        ]
      },
      {
        "min": [
          -49.256,
          -5.355,
          10.091
        ],
        "max": [
          -47.76,
          1.349,
          14.761
        ]
      },
      {
        "min": [
          -39.92,
          -5.355,
          13.126
        ],
        "max": [
          -38.231,
          1.349,
          16.995
        ]
      },
      {
        "min": [
          -38.889,
          -5.506,
          17.237
        ],
        "max": [
          -37.161,
          1.197,
          22.807
        ]
      },
      {
        "min": [
          -40.522,
          -6.945,
          -19.606
        ],
        "max": [
          -38.996,
          1.743,
          -18.364
        ]
      },
      {
        "min": [
          -42.796,
          -4.56,
          -22.775
        ],
        "max": [
          -41.628,
          -0.697,
          -21.159
        ]
      },
      {
        "min": [
          -40.579,
          -4.56,
          -24.995
        ],
        "max": [
          -39.41,
          -0.697,
          -23.379
        ]
      },
      {
        "min": [
          -3.048,
          -5.506,
          40.955
        ],
        "max": [
          -1.32,
          1.128,
          44.804
        ]
      },
      {
        "min": [
          -4.077,
          -5.506,
          43.853
        ],
        "max": [
          -3.105,
          1.128,
          47.73
        ]
      },
      {
        "min": [
          1.269,
          -7.581,
          -44.811
        ],
        "max": [
          3.061,
          1.108,
          -41.014
        ]
      },
      {
        "min": [
          3.077,
          -7.016,
          -47.79
        ],
        "max": [
          4.054,
          1.673,
          -44.462
        ]
      },
      {
        "min": [
          38.44,
          -2.574,
          -22.94
        ],
        "max": [
          40.209,
          0.982,
          -13.963
        ]
      },
      {
        "min": [
          38.466,
          -6.945,
          18.974
        ],
        "max": [
          39.992,
          1.743,
          20.216
        ]
      },
      {
        "min": [
          47.991,
          -2.368,
          -14.617
        ],
        "max": [
          49.28,
          1.188,
          -10.567
        ]
      },
      {
        "min": [
          59.647,
          -5.355,
          -9.786
        ],
        "max": [
          65.756,
          4.979,
          0.351
        ]
      },
      {
        "min": [
          65.533,
          -5.355,
          -8.675
        ],
        "max": [
          67.727,
          3.426,
          0.384
        ]
      },
      {
        "min": [
          58.275,
          -6.868,
          -4.078
        ],
        "max": [
          70.213,
          1.912,
          0.36
        ]
      },
      {
        "min": [
          67.649,
          -8.588,
          -7.34
        ],
        "max": [
          70.213,
          0.192,
          -2.606
        ]
      }
    ]
  },
  "level20": {
    "id": "level20",
    "fog": {
      "enabled": true,
      "near": 100,
      "far": 500,
      "r": 0.98,
      "g": 0.946,
      "b": 0.869
    },
    "sunDirection": [
      -0.66,
      1,
      -1
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -52.638,
          -3.634,
          14.24
        ],
        "max": [
          -42.506,
          5.703,
          19.753
        ]
      },
      {
        "min": [
          -43.03,
          -3.634,
          14.24
        ],
        "max": [
          -37.833,
          1.719,
          16.644
        ]
      },
      {
        "min": [
          -37.881,
          -2.781,
          1.852
        ],
        "max": [
          -33.248,
          2.573,
          6.361
        ]
      },
      {
        "min": [
          -28.988,
          -3.043,
          -4.685
        ],
        "max": [
          -22.48,
          2.31,
          1.605
        ]
      },
      {
        "min": [
          -22.339,
          -3.634,
          -3.479
        ],
        "max": [
          -20.791,
          1.719,
          -1.659
        ]
      },
      {
        "min": [
          -32.989,
          -3.634,
          4.421
        ],
        "max": [
          -31.441,
          1.719,
          6.147
        ]
      },
      {
        "min": [
          -24.019,
          -2.261,
          10.949
        ],
        "max": [
          -18.127,
          3.093,
          14.356
        ]
      },
      {
        "min": [
          -17.54,
          -5.571,
          -8.664
        ],
        "max": [
          -8.223,
          2.38,
          -0.974
        ]
      },
      {
        "min": [
          -32.466,
          -2.261,
          18.499
        ],
        "max": [
          -27.565,
          2.56,
          21.977
        ]
      },
      {
        "min": [
          -34.37,
          -3.714,
          20.383
        ],
        "max": [
          -32.657,
          1.639,
          22.204
        ]
      },
      {
        "min": [
          -27.413,
          -3.714,
          19.818
        ],
        "max": [
          -25.778,
          1.639,
          21.38
        ]
      },
      {
        "min": [
          -7.935,
          -3.634,
          -6.856
        ],
        "max": [
          -6.387,
          1.643,
          -5.12
        ]
      },
      {
        "min": [
          -19.286,
          -3.634,
          -5.707
        ],
        "max": [
          -17.738,
          1.719,
          -3.887
        ]
      },
      {
        "min": [
          18.606,
          -4.866,
          -14.276
        ],
        "max": [
          23.239,
          0.487,
          -11.352
        ]
      },
      {
        "min": [
          27.471,
          -3.652,
          -21.521
        ],
        "max": [
          32.699,
          1.701,
          -17.69
        ]
      },
      {
        "min": [
          5.661,
          -3.634,
          5.155
        ],
        "max": [
          7.209,
          1.643,
          6.891
        ]
      },
      {
        "min": [
          20.808,
          -3.634,
          0.228
        ],
        "max": [
          22.225,
          1.643,
          1.963
        ]
      },
      {
        "min": [
          17.928,
          -3.634,
          2.647
        ],
        "max": [
          19.345,
          1.643,
          4.382
        ]
      },
      {
        "min": [
          31.36,
          -3.634,
          -5.618
        ],
        "max": [
          32.909,
          1.643,
          -3.995
        ]
      },
      {
        "min": [
          25.839,
          -3.634,
          -22.106
        ],
        "max": [
          27.335,
          1.643,
          -20.483
        ]
      },
      {
        "min": [
          33.032,
          -3.634,
          -22.106
        ],
        "max": [
          34.528,
          1.643,
          -20.483
        ]
      },
      {
        "min": [
          33.093,
          -3.743,
          -5.5
        ],
        "max": [
          36.678,
          1.535,
          -1.059
        ]
      },
      {
        "min": [
          22.28,
          -5.534,
          -1.733
        ],
        "max": [
          29.022,
          2.563,
          4.18
        ]
      },
      {
        "min": [
          -33.497,
          -11.557,
          -56.326
        ],
        "max": [
          2.088,
          72.305,
          -18.418
        ]
      },
      {
        "min": [
          -59.182,
          -11.557,
          -48.928
        ],
        "max": [
          -23.598,
          72.305,
          -11.02
        ]
      }
    ]
  },
  "level21": {
    "id": "level21",
    "fog": {
      "enabled": true,
      "near": 21.3,
      "far": 397.2,
      "r": 0.714,
      "g": 0.863,
      "b": 0.953
    },
    "sunDirection": [
      -0.45,
      0.6,
      0.74
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -8.961,
          -2.054,
          -11.546
        ],
        "max": [
          -0.107,
          2.054,
          -8.686
        ]
      },
      {
        "min": [
          -2.172,
          -2.054,
          -22.56
        ],
        "max": [
          9.256,
          2.054,
          -18.151
        ]
      },
      {
        "min": [
          20.479,
          -2.047,
          -25.382
        ],
        "max": [
          27.891,
          8.368,
          -13.023
        ]
      },
      {
        "min": [
          14.328,
          -4.352,
          -25.178
        ],
        "max": [
          24.928,
          3.291,
          -5.409
        ]
      },
      {
        "min": [
          6.569,
          -8.126,
          -25.529
        ],
        "max": [
          17.169,
          -0.483,
          -18.554
        ]
      },
      {
        "min": [
          22.148,
          -8.167,
          -18.95
        ],
        "max": [
          25.136,
          -0.523,
          0.82
        ]
      },
      {
        "min": [
          17.817,
          -3.018,
          -5.358
        ],
        "max": [
          22.13,
          4.625,
          -0.146
        ]
      },
      {
        "min": [
          15.749,
          -4.881,
          -5.321
        ],
        "max": [
          17.783,
          2.762,
          -1.109
        ]
      },
      {
        "min": [
          9.61,
          -2.054,
          -21.246
        ],
        "max": [
          14.382,
          2.054,
          -16.837
        ]
      },
      {
        "min": [
          11.613,
          -2.605,
          -18.902
        ],
        "max": [
          16.768,
          1.256,
          -14.522
        ]
      },
      {
        "min": [
          -15.215,
          -2.054,
          -25.141
        ],
        "max": [
          -9.715,
          2.381,
          -18.144
        ]
      },
      {
        "min": [
          -27.598,
          -2.054,
          -22.396
        ],
        "max": [
          -19.864,
          4.893,
          -11.096
        ]
      },
      {
        "min": [
          -30.926,
          -4.465,
          -16.42
        ],
        "max": [
          -27.539,
          2.482,
          -11.331
        ]
      },
      {
        "min": [
          -31.036,
          -4.548,
          -20.679
        ],
        "max": [
          -27.552,
          0.225,
          -11.179
        ]
      },
      {
        "min": [
          -31.4,
          -2.466,
          -6.224
        ],
        "max": [
          -24.05,
          4.48,
          0.375
        ]
      },
      {
        "min": [
          -20.547,
          -2.466,
          2.727
        ],
        "max": [
          -16.024,
          4.48,
          7.074
        ]
      },
      {
        "min": [
          -7.107,
          -2.466,
          17.046
        ],
        "max": [
          -2.584,
          4.48,
          20.13
        ]
      },
      {
        "min": [
          -0.139,
          -2.466,
          23.653
        ],
        "max": [
          6.225,
          4.48,
          34.74
        ]
      },
      {
        "min": [
          11.197,
          -2.466,
          20.127
        ],
        "max": [
          22.389,
          4.48,
          27.585
        ]
      },
      {
        "min": [
          11.038,
          -2.793,
          27.511
        ],
        "max": [
          16.427,
          2.29,
          30.523
        ]
      },
      {
        "min": [
          16.291,
          -5.008,
          27.526
        ],
        "max": [
          20.7,
          -0.07,
          30.785
        ]
      },
      {
        "min": [
          19.541,
          -2.466,
          10.7
        ],
        "max": [
          25.194,
          4.11,
          15.247
        ]
      },
      {
        "min": [
          22.825,
          -2.466,
          8.678
        ],
        "max": [
          25.281,
          0.616,
          10.932
        ]
      },
      {
        "min": [
          14.656,
          -2.466,
          3.926
        ],
        "max": [
          17.469,
          3.118,
          8.478
        ]
      },
      {
        "min": [
          3.355,
          -3.415,
          8.605
        ],
        "max": [
          8.832,
          3.694,
          13.062
        ]
      }
    ]
  },
  "level22": {
    "id": "level22",
    "fog": {
      "enabled": true,
      "near": 100,
      "far": 500,
      "r": 0.33,
      "g": 0.516,
      "b": 1
    },
    "sunDirection": [
      1,
      0.6,
      0.2
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -12.518,
          0.976,
          -39.527
        ],
        "max": [
          4.763,
          5.907,
          -32.838
        ]
      },
      {
        "min": [
          -2.04,
          -0.921,
          -43.157
        ],
        "max": [
          4.763,
          4.357,
          -39.39
        ]
      },
      {
        "min": [
          -10.993,
          0.976,
          -40.473
        ],
        "max": [
          -7.331,
          6.254,
          -32.195
        ]
      },
      {
        "min": [
          -14.729,
          0.976,
          -37.854
        ],
        "max": [
          -12.579,
          2.537,
          -34.49
        ]
      },
      {
        "min": [
          -6.671,
          -0.196,
          -43.157
        ],
        "max": [
          1.925,
          1.731,
          -39.39
        ]
      },
      {
        "min": [
          8.293,
          1.182,
          -33.333
        ],
        "max": [
          10.972,
          3.691,
          -30.344
        ]
      },
      {
        "min": [
          9.703,
          1.182,
          -42.652
        ],
        "max": [
          10.886,
          2.906,
          -41.425
        ]
      },
      {
        "min": [
          11.664,
          1.182,
          -42.23
        ],
        "max": [
          18.919,
          4.767,
          -39.751
        ]
      },
      {
        "min": [
          12.634,
          1.182,
          -43.736
        ],
        "max": [
          15.028,
          4.767,
          -39.269
        ]
      },
      {
        "min": [
          14.915,
          1.182,
          -42.43
        ],
        "max": [
          18.045,
          4.767,
          -38.419
        ]
      },
      {
        "min": [
          -26.361,
          1.182,
          -32.294
        ],
        "max": [
          -22.175,
          4.767,
          -27.845
        ]
      },
      {
        "min": [
          -30.058,
          1.182,
          -28.181
        ],
        "max": [
          -25.873,
          4.767,
          -23.732
        ]
      },
      {
        "min": [
          -20.869,
          1.182,
          -32.387
        ],
        "max": [
          -19.03,
          4.767,
          -28.504
        ]
      },
      {
        "min": [
          -21.702,
          1.182,
          -31.385
        ],
        "max": [
          -18.127,
          4.767,
          -29.479
        ]
      },
      {
        "min": [
          -28.063,
          1.182,
          -30.426
        ],
        "max": [
          -23.878,
          4.767,
          -25.977
        ]
      },
      {
        "min": [
          -37.665,
          1.182,
          -18.417
        ],
        "max": [
          -34.2,
          3.691,
          -12.646
        ]
      },
      {
        "min": [
          -38.734,
          1.182,
          -17.359
        ],
        "max": [
          -33.115,
          3.691,
          -13.892
        ]
      },
      {
        "min": [
          34.108,
          1.182,
          12.709
        ],
        "max": [
          37.573,
          3.691,
          18.479
        ]
      },
      {
        "min": [
          33.039,
          1.182,
          13.766
        ],
        "max": [
          38.658,
          3.691,
          17.233
        ]
      },
      {
        "min": [
          -11.029,
          1.182,
          31.133
        ],
        "max": [
          -8.35,
          3.691,
          34.121
        ]
      },
      {
        "min": [
          22.103,
          1.182,
          27.887
        ],
        "max": [
          26.289,
          4.767,
          32.337
        ]
      },
      {
        "min": [
          24.206,
          1.182,
          25.704
        ],
        "max": [
          28.211,
          4.767,
          29.925
        ]
      },
      {
        "min": [
          25.857,
          1.182,
          23.697
        ],
        "max": [
          29.932,
          4.767,
          28.01
        ]
      },
      {
        "min": [
          18.488,
          1.182,
          28.952
        ],
        "max": [
          21.197,
          7.675,
          31.738
        ]
      },
      {
        "min": [
          -4.9,
          0.976,
          39.486
        ],
        "max": [
          2.06,
          4.288,
          43.253
        ]
      }
    ]
  },
  "level23": {
    "id": "level23",
    "fog": {
      "enabled": true,
      "near": 40,
      "far": 400,
      "r": 0.914,
      "g": 0.832,
      "b": 0.875
    },
    "sunDirection": [
      0.65,
      0.5,
      -0.55
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          65.444,
          -2.041,
          -4.64
        ],
        "max": [
          71.413,
          5.424,
          6.552
        ]
      },
      {
        "min": [
          63.597,
          -2.041,
          -4.037
        ],
        "max": [
          66.165,
          3.431,
          5.244
        ]
      },
      {
        "min": [
          61.021,
          -2.041,
          -3.959
        ],
        "max": [
          63.772,
          1.364,
          1.228
        ]
      },
      {
        "min": [
          60.941,
          -2.218,
          1.192
        ],
        "max": [
          63.692,
          0.045,
          3.35
        ]
      },
      {
        "min": [
          57.331,
          -2.041,
          -2.049
        ],
        "max": [
          60.879,
          1.132,
          2.105
        ]
      },
      {
        "min": [
          55.253,
          -3.199,
          -2.111
        ],
        "max": [
          58.801,
          -0.026,
          2.167
        ]
      },
      {
        "min": [
          57.704,
          -3.184,
          -3.763
        ],
        "max": [
          60.879,
          -0.012,
          3.819
        ]
      },
      {
        "min": [
          62.798,
          -2.041,
          -5.943
        ],
        "max": [
          65.522,
          1.729,
          -4.174
        ]
      },
      {
        "min": [
          68.361,
          4.078,
          -4.461
        ],
        "max": [
          71.085,
          7.848,
          -3.312
        ]
      },
      {
        "min": [
          39.261,
          -2.041,
          -10.829
        ],
        "max": [
          51.407,
          5.424,
          -6.984
        ]
      },
      {
        "min": [
          25.605,
          -2.041,
          8.715
        ],
        "max": [
          37.752,
          5.424,
          12.56
        ]
      },
      {
        "min": [
          6.264,
          -2.041,
          8.07
        ],
        "max": [
          18.544,
          5.114,
          17.468
        ]
      },
      {
        "min": [
          16.553,
          -3.993,
          8.07
        ],
        "max": [
          21.319,
          3.162,
          12.846
        ]
      },
      {
        "min": [
          16.553,
          -3.993,
          12.58
        ],
        "max": [
          21.319,
          0.29,
          17.356
        ]
      },
      {
        "min": [
          13.577,
          3.382,
          16.538
        ],
        "max": [
          16.135,
          6.79,
          18.091
        ]
      },
      {
        "min": [
          13.577,
          3.382,
          11.192
        ],
        "max": [
          15.383,
          6.79,
          12.745
        ]
      },
      {
        "min": [
          6.662,
          3.382,
          8.085
        ],
        "max": [
          8.225,
          6.79,
          10.733
        ]
      },
      {
        "min": [
          -9.415,
          -2.092,
          11.602
        ],
        "max": [
          0.107,
          3.186,
          15.825
        ]
      },
      {
        "min": [
          4.635,
          -2.092,
          13.324
        ],
        "max": [
          6.361,
          1.454,
          16.989
        ]
      },
      {
        "min": [
          52.174,
          -2.067,
          6.243
        ],
        "max": [
          55.153,
          2.41,
          9.099
        ]
      },
      {
        "min": [
          13.242,
          -2.067,
          -10.87
        ],
        "max": [
          17.031,
          2.874,
          -7.302
        ]
      },
      {
        "min": [
          13.634,
          -2.067,
          -7.11
        ],
        "max": [
          15.743,
          1.663,
          -4.469
        ]
      },
      {
        "min": [
          0.065,
          -3.732,
          -15.852
        ],
        "max": [
          9.031,
          4.075,
          -11.351
        ]
      },
      {
        "min": [
          -7.873,
          -3.732,
          -17.527
        ],
        "max": [
          -6.492,
          1.592,
          -13.878
        ]
      },
      {
        "min": [
          -16.849,
          -3.732,
          -16.851
        ],
        "max": [
          -7.757,
          3.753,
          -14.613
        ]
      }
    ]
  },
  "level24": {
    "id": "level24",
    "fog": {
      "enabled": true,
      "near": 65,
      "far": 350,
      "r": 0.961,
      "g": 0.941,
      "b": 0.899
    },
    "sunDirection": [
      0.63,
      0.42,
      0.37
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          20.101,
          -0.714,
          20.234
        ],
        "max": [
          34.027,
          1.117,
          21.587
        ]
      },
      {
        "min": [
          -1.45,
          -0.714,
          20.13
        ],
        "max": [
          4.997,
          1.117,
          21.563
        ]
      },
      {
        "min": [
          -1.432,
          -0.714,
          21.687
        ],
        "max": [
          0.001,
          1.117,
          28.578
        ]
      },
      {
        "min": [
          3.48,
          -2.045,
          15.048
        ],
        "max": [
          4.241,
          -0.587,
          20.339
        ]
      },
      {
        "min": [
          -6.798,
          -0.714,
          29.455
        ],
        "max": [
          -4.966,
          4.618,
          33.353
        ]
      },
      {
        "min": [
          -15.039,
          -0.714,
          32.499
        ],
        "max": [
          -13.411,
          1.693,
          34.183
        ]
      },
      {
        "min": [
          -24.037,
          -0.93,
          30.818
        ],
        "max": [
          -22.409,
          1.477,
          32.503
        ]
      },
      {
        "min": [
          -34.871,
          -0.93,
          15.539
        ],
        "max": [
          -33.243,
          1.477,
          17.223
        ]
      },
      {
        "min": [
          -32.221,
          -0.93,
          2.143
        ],
        "max": [
          -28.398,
          2.426,
          3.755
        ]
      },
      {
        "min": [
          -9.22,
          -2.17,
          21.191
        ],
        "max": [
          -6.394,
          1.213,
          23.188
        ]
      },
      {
        "min": [
          -19.51,
          -2.446,
          17.476
        ],
        "max": [
          -17.681,
          0.937,
          19.245
        ]
      },
      {
        "min": [
          -13.898,
          -2.055,
          2.894
        ],
        "max": [
          -10,
          1.329,
          4.726
        ]
      },
      {
        "min": [
          -11.693,
          -3.726,
          -11.79
        ],
        "max": [
          -10.089,
          -0.343,
          -8.292
        ]
      },
      {
        "min": [
          -9.929,
          -4.399,
          -12.396
        ],
        "max": [
          -8.005,
          -1.015,
          -8.899
        ]
      },
      {
        "min": [
          -19.839,
          -2.842,
          -9.872
        ],
        "max": [
          -16.133,
          0.541,
          -8.512
        ]
      },
      {
        "min": [
          -34.211,
          -1.957,
          -21.458
        ],
        "max": [
          -20.125,
          1.085,
          -20.215
        ]
      },
      {
        "min": [
          9.371,
          -0.714,
          25.078
        ],
        "max": [
          20.924,
          0.62,
          27.443
        ]
      },
      {
        "min": [
          21.246,
          -0.714,
          0.644
        ],
        "max": [
          23.152,
          1.117,
          9.611
        ]
      },
      {
        "min": [
          -20.553,
          -0.777,
          -27.44
        ],
        "max": [
          -16.847,
          5.64,
          -25.926
        ]
      },
      {
        "min": [
          -16.473,
          -0.777,
          -27.343
        ],
        "max": [
          -9.663,
          1.157,
          -25.828
        ]
      },
      {
        "min": [
          17.846,
          -2.446,
          -19.874
        ],
        "max": [
          19.788,
          0.937,
          -18.105
        ]
      },
      {
        "min": [
          6.37,
          -2.17,
          -23.1
        ],
        "max": [
          9.196,
          1.213,
          -21.102
        ]
      },
      {
        "min": [
          -40.841,
          -2.17,
          -26.211
        ],
        "max": [
          -38.016,
          1.213,
          -23.942
        ]
      },
      {
        "min": [
          -23.366,
          -1.627,
          -9.34
        ],
        "max": [
          -21.137,
          0.678,
          -6.725
        ]
      },
      {
        "min": [
          -23.183,
          -1.627,
          -6.873
        ],
        "max": [
          -21.639,
          0.678,
          -3.991
        ]
      }
    ]
  },
  "level25": {
    "id": "level25",
    "fog": null,
    "sunDirection": [
      0.17,
      0.5,
      0.45
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -93.12,
          -11.77,
          -37.872
        ],
        "max": [
          -40.011,
          74.925,
          -23.371
        ]
      },
      {
        "min": [
          -93.935,
          -53.122,
          -99.075
        ],
        "max": [
          113.458,
          -1.277,
          79.9
        ]
      },
      {
        "min": [
          -93.935,
          74.909,
          -99.075
        ],
        "max": [
          113.458,
          112.87,
          79.9
        ]
      },
      {
        "min": [
          -90.956,
          -11.77,
          -101.474
        ],
        "max": [
          -33.209,
          74.925,
          -37.957
        ]
      },
      {
        "min": [
          -45.66,
          -11.77,
          -101.635
        ],
        "max": [
          34.109,
          74.925,
          -58.695
        ]
      },
      {
        "min": [
          26.172,
          -11.77,
          -99.345
        ],
        "max": [
          39.047,
          74.925,
          -45.861
        ]
      },
      {
        "min": [
          38.428,
          -11.77,
          -99.63
        ],
        "max": [
          111.783,
          74.925,
          -31.231
        ]
      },
      {
        "min": [
          41.207,
          -11.77,
          -104.835
        ],
        "max": [
          54.082,
          74.925,
          -20.939
        ]
      },
      {
        "min": [
          54.38,
          -11.77,
          -56.999
        ],
        "max": [
          115.621,
          74.925,
          78.49
        ]
      },
      {
        "min": [
          38.666,
          -11.77,
          11.275
        ],
        "max": [
          57.193,
          74.925,
          80.197
        ]
      },
      {
        "min": [
          -94.573,
          -11.77,
          28.596
        ],
        "max": [
          50.669,
          74.925,
          79.9
        ]
      },
      {
        "min": [
          -59.323,
          -11.77,
          17.283
        ],
        "max": [
          -31,
          74.925,
          29.329
        ]
      },
      {
        "min": [
          -95.247,
          -11.77,
          -31.643
        ],
        "max": [
          -54.116,
          74.925,
          31.763
        ]
      },
      {
        "min": [
          -65.593,
          -11.77,
          -25.862
        ],
        "max": [
          -50.534,
          74.925,
          -13.816
        ]
      }
    ]
  },
  "level26": {
    "id": "level26",
    "fog": null,
    "sunDirection": [
      -0.5,
      0.38,
      -0.31
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -2.725,
          -1.527,
          -23.943
        ],
        "max": [
          3.383,
          3.923,
          -14.427
        ]
      },
      {
        "min": [
          -7.015,
          -0.544,
          -21.983
        ],
        "max": [
          3.096,
          5.833,
          -15.939
        ]
      },
      {
        "min": [
          -6.978,
          -1.527,
          -16.234
        ],
        "max": [
          -6.046,
          4.851,
          -14.427
        ]
      },
      {
        "min": [
          -5.628,
          -1.527,
          -23.967
        ],
        "max": [
          0.48,
          3.923,
          -21.54
        ]
      },
      {
        "min": [
          -0.673,
          -1.527,
          -26.359
        ],
        "max": [
          3.388,
          2.411,
          -24.02
        ]
      },
      {
        "min": [
          -3.065,
          -1.527,
          -26.359
        ],
        "max": [
          0.996,
          0.938,
          -24.02
        ]
      },
      {
        "min": [
          3.109,
          -1.527,
          -18.788
        ],
        "max": [
          9.153,
          2.411,
          -15.455
        ]
      },
      {
        "min": [
          22.794,
          -1.527,
          -27.277
        ],
        "max": [
          26.716,
          2.411,
          -23.32
        ]
      },
      {
        "min": [
          33.53,
          -0.544,
          -34.85
        ],
        "max": [
          40.383,
          4.574,
          -29.441
        ]
      },
      {
        "min": [
          12.58,
          -0.544,
          3.076
        ],
        "max": [
          16.834,
          4.574,
          12.334
        ]
      },
      {
        "min": [
          13.611,
          -0.544,
          12.446
        ],
        "max": [
          17.388,
          4.574,
          24.696
        ]
      },
      {
        "min": [
          14.217,
          -0.544,
          24.892
        ],
        "max": [
          17.483,
          3.431,
          30.566
        ]
      },
      {
        "min": [
          20.935,
          -0.544,
          33.635
        ],
        "max": [
          26.303,
          4.574,
          40.475
        ]
      },
      {
        "min": [
          -6.372,
          -0.544,
          14.691
        ],
        "max": [
          5.884,
          4.949,
          24.125
        ]
      },
      {
        "min": [
          5.002,
          -0.544,
          14.691
        ],
        "max": [
          8.595,
          2.874,
          19.845
        ]
      },
      {
        "min": [
          5.002,
          -0.544,
          17.765
        ],
        "max": [
          8.595,
          0.928,
          22.92
        ]
      },
      {
        "min": [
          25.058,
          -0.544,
          -7.61
        ],
        "max": [
          37.794,
          4.949,
          -0.006
        ]
      },
      {
        "min": [
          -16.778,
          -0.544,
          -14.012
        ],
        "max": [
          -11.538,
          3.507,
          -4.539
        ]
      },
      {
        "min": [
          -16.824,
          -0.544,
          -26.413
        ],
        "max": [
          -13.044,
          6.365,
          -14.163
        ]
      },
      {
        "min": [
          -16.211,
          -0.544,
          -32.284
        ],
        "max": [
          -12.913,
          3.322,
          -26.564
        ]
      },
      {
        "min": [
          -26.081,
          -0.544,
          -40.488
        ],
        "max": [
          -20.666,
          3.322,
          -33.624
        ]
      },
      {
        "min": [
          -37.707,
          -0.544,
          0.103
        ],
        "max": [
          -25.075,
          5.037,
          7.554
        ]
      },
      {
        "min": [
          -12.207,
          -0.544,
          18.352
        ],
        "max": [
          -6.967,
          3.098,
          21.596
        ]
      },
      {
        "min": [
          -26.709,
          -0.544,
          23.345
        ],
        "max": [
          -22.709,
          3.098,
          27.242
        ]
      },
      {
        "min": [
          -40.509,
          -0.544,
          30.024
        ],
        "max": [
          -33.626,
          3.555,
          35.393
        ]
      }
    ]
  },
  "level27": {
    "id": "level27",
    "fog": {
      "enabled": true,
      "near": 190,
      "far": 350,
      "r": 0.961,
      "g": 0.894,
      "b": 0.824
    },
    "sunDirection": [
      -0.13,
      0.33,
      -0.55
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          10.665,
          -1.904,
          -7.222
        ],
        "max": [
          15.019,
          7.202,
          -1.819
        ]
      },
      {
        "min": [
          10.445,
          -1.904,
          2.66
        ],
        "max": [
          16.992,
          7.202,
          9.466
        ]
      },
      {
        "min": [
          27.544,
          -1.904,
          5.016
        ],
        "max": [
          29.265,
          1.721,
          10.33
        ]
      },
      {
        "min": [
          33.037,
          -1.904,
          -0.958
        ],
        "max": [
          40.372,
          1.721,
          0.762
        ]
      },
      {
        "min": [
          10.515,
          -6.16,
          -25.208
        ],
        "max": [
          20.201,
          12.947,
          -14.271
        ]
      },
      {
        "min": [
          -3.247,
          -3.681,
          10.942
        ],
        "max": [
          3.023,
          7.202,
          19.547
        ]
      },
      {
        "min": [
          -25.883,
          -6.16,
          -47.66
        ],
        "max": [
          6.086,
          155.068,
          -14.144
        ]
      },
      {
        "min": [
          -6.252,
          -6.16,
          14.068
        ],
        "max": [
          26.061,
          154.712,
          47.584
        ]
      },
      {
        "min": [
          6.469,
          -12.561,
          -23.41
        ],
        "max": [
          12.739,
          -1.678,
          -17.614
        ]
      },
      {
        "min": [
          6.469,
          -9.693,
          -18.512
        ],
        "max": [
          12.739,
          1.19,
          -14.25
        ]
      },
      {
        "min": [
          -12.739,
          -12.561,
          17.614
        ],
        "max": [
          -6.469,
          -1.678,
          23.41
        ]
      },
      {
        "min": [
          -12.739,
          -9.693,
          14.25
        ],
        "max": [
          -6.469,
          1.19,
          18.512
        ]
      },
      {
        "min": [
          -70.676,
          -6.16,
          -16.125
        ],
        "max": [
          -38.363,
          154.068,
          17.391
        ]
      },
      {
        "min": [
          -54.57,
          -6.16,
          -49.358
        ],
        "max": [
          -22.257,
          154.955,
          -15.842
        ]
      },
      {
        "min": [
          -54.57,
          -6.16,
          16.51
        ],
        "max": [
          -27.504,
          153.741,
          50.026
        ]
      },
      {
        "min": [
          -29.85,
          -6.16,
          32.857
        ],
        "max": [
          -2.358,
          157.194,
          66.373
        ]
      },
      {
        "min": [
          4.209,
          -6.16,
          -66.375
        ],
        "max": [
          31.701,
          157.963,
          -32.859
        ]
      },
      {
        "min": [
          27.616,
          -6.16,
          -49.594
        ],
        "max": [
          54.115,
          154.824,
          -16.078
        ]
      },
      {
        "min": [
          38.369,
          -6.16,
          -16.834
        ],
        "max": [
          65.861,
          154.532,
          16.682
        ]
      },
      {
        "min": [
          24.156,
          -6.16,
          15.887
        ],
        "max": [
          51.648,
          155.601,
          49.403
        ]
      },
      {
        "min": [
          -15.019,
          -1.904,
          1.819
        ],
        "max": [
          -10.665,
          7.202,
          7.222
        ]
      },
      {
        "min": [
          -16.992,
          -1.904,
          -9.466
        ],
        "max": [
          -10.445,
          7.202,
          -2.742
        ]
      },
      {
        "min": [
          -29.051,
          -1.904,
          -10.33
        ],
        "max": [
          -28.472,
          1.451,
          -5.016
        ]
      },
      {
        "min": [
          -40.372,
          -1.904,
          -0.762
        ],
        "max": [
          -33.037,
          1.721,
          0.958
        ]
      },
      {
        "min": [
          -20.201,
          -6.16,
          14.271
        ],
        "max": [
          -10.515,
          15.595,
          25.208
        ]
      }
    ]
  },
  "level28": {
    "id": "level28",
    "fog": {
      "enabled": true,
      "near": 44,
      "far": 223,
      "r": 0.902,
      "g": 0.769,
      "b": 0.733
    },
    "sunDirection": [
      -0.076,
      0.8,
      -1
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          15.331,
          -0.6,
          -2.738
        ],
        "max": [
          24.324,
          4.768,
          9.301
        ]
      },
      {
        "min": [
          16.469,
          -1.278,
          13.879
        ],
        "max": [
          19.866,
          2.94,
          22.253
        ]
      },
      {
        "min": [
          3.57,
          -0.665,
          15.057
        ],
        "max": [
          7.699,
          2.743,
          24.307
        ]
      },
      {
        "min": [
          -8.186,
          -2.541,
          28.996
        ],
        "max": [
          -3.87,
          0.867,
          37.887
        ]
      },
      {
        "min": [
          -8.568,
          -0.571,
          15.223
        ],
        "max": [
          -1.995,
          3.443,
          20.47
        ]
      },
      {
        "min": [
          -25.207,
          -0.571,
          15.675
        ],
        "max": [
          -21.464,
          4.19,
          27.587
        ]
      },
      {
        "min": [
          -25.033,
          3.88,
          15.757
        ],
        "max": [
          -17.313,
          7.895,
          27.518
        ]
      },
      {
        "min": [
          -31.911,
          -0.571,
          15.872
        ],
        "max": [
          -25.346,
          4.402,
          19.821
        ]
      },
      {
        "min": [
          32.718,
          -0.829,
          -2.092
        ],
        "max": [
          35.917,
          2.082,
          3.436
        ]
      },
      {
        "min": [
          21.963,
          -1.346,
          -21.301
        ],
        "max": [
          27.035,
          1.762,
          -12.044
        ]
      },
      {
        "min": [
          17.812,
          -1.648,
          -31.6
        ],
        "max": [
          21.803,
          1.46,
          -27.607
        ]
      },
      {
        "min": [
          3.863,
          -0.294,
          -21.209
        ],
        "max": [
          15.628,
          4.138,
          -17.46
        ]
      },
      {
        "min": [
          -8.819,
          -1.442,
          -20.845
        ],
        "max": [
          -0.031,
          2.876,
          -16.495
        ]
      },
      {
        "min": [
          -33.173,
          -2.358,
          -40.786
        ],
        "max": [
          -29.18,
          1.385,
          -36.794
        ]
      },
      {
        "min": [
          -27.991,
          -0.294,
          -28.82
        ],
        "max": [
          -17.283,
          6.562,
          -22.949
        ]
      },
      {
        "min": [
          -26.713,
          -0.294,
          -30.812
        ],
        "max": [
          -17.841,
          3.744,
          -28.053
        ]
      },
      {
        "min": [
          15.326,
          -2.67,
          -5.693
        ],
        "max": [
          24.134,
          0.137,
          0.99
        ]
      },
      {
        "min": [
          -25.417,
          -2.762,
          -33.373
        ],
        "max": [
          -17.807,
          0.13,
          -30.836
        ]
      },
      {
        "min": [
          -24.584,
          -1.709,
          -15.979
        ],
        "max": [
          -17.359,
          2.691,
          -3.675
        ]
      },
      {
        "min": [
          -21.717,
          -0.294,
          -0.483
        ],
        "max": [
          -14.476,
          7.56,
          4.253
        ]
      },
      {
        "min": [
          -21.693,
          -0.294,
          4.373
        ],
        "max": [
          -15.905,
          6.585,
          9.683
        ]
      },
      {
        "min": [
          -23.797,
          -0.294,
          -0.643
        ],
        "max": [
          -21.949,
          4.209,
          8.34
        ]
      },
      {
        "min": [
          -26.295,
          -2.163,
          -0.671
        ],
        "max": [
          -23.889,
          0.482,
          6.96
        ]
      },
      {
        "min": [
          -36.534,
          -2.283,
          -2.437
        ],
        "max": [
          -32.589,
          1.46,
          1.599
        ]
      },
      {
        "min": [
          13.572,
          -2.67,
          -5.392
        ],
        "max": [
          14.406,
          0.137,
          -4.181
        ]
      }
    ]
  },
  "level29": {
    "id": "level29",
    "fog": {
      "enabled": true,
      "near": 44,
      "far": 223,
      "r": 0.902,
      "g": 0.769,
      "b": 0.733
    },
    "sunDirection": [
      -0.076,
      0.8,
      -1
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          15.331,
          -0.6,
          -2.738
        ],
        "max": [
          24.324,
          4.768,
          9.301
        ]
      },
      {
        "min": [
          16.469,
          -1.278,
          13.879
        ],
        "max": [
          19.866,
          2.94,
          22.253
        ]
      },
      {
        "min": [
          3.57,
          -0.665,
          15.057
        ],
        "max": [
          7.699,
          2.743,
          24.307
        ]
      },
      {
        "min": [
          -8.186,
          -2.541,
          28.996
        ],
        "max": [
          -3.87,
          0.867,
          37.887
        ]
      },
      {
        "min": [
          -8.568,
          -0.571,
          15.223
        ],
        "max": [
          -1.995,
          3.443,
          20.47
        ]
      },
      {
        "min": [
          -25.207,
          -0.571,
          15.675
        ],
        "max": [
          -21.464,
          4.19,
          27.587
        ]
      },
      {
        "min": [
          -25.033,
          3.88,
          15.757
        ],
        "max": [
          -17.313,
          7.895,
          27.518
        ]
      },
      {
        "min": [
          -31.911,
          -0.571,
          15.872
        ],
        "max": [
          -25.346,
          4.402,
          19.821
        ]
      },
      {
        "min": [
          32.718,
          -0.829,
          -2.092
        ],
        "max": [
          35.917,
          2.082,
          3.436
        ]
      },
      {
        "min": [
          21.963,
          -1.346,
          -21.301
        ],
        "max": [
          27.035,
          1.762,
          -12.044
        ]
      },
      {
        "min": [
          17.812,
          -1.648,
          -31.6
        ],
        "max": [
          21.803,
          1.46,
          -27.607
        ]
      },
      {
        "min": [
          3.863,
          -0.294,
          -21.209
        ],
        "max": [
          15.628,
          4.138,
          -17.46
        ]
      },
      {
        "min": [
          -8.819,
          -1.442,
          -20.845
        ],
        "max": [
          -0.031,
          2.876,
          -16.495
        ]
      },
      {
        "min": [
          -33.173,
          -2.358,
          -40.786
        ],
        "max": [
          -29.18,
          1.385,
          -36.794
        ]
      },
      {
        "min": [
          -27.991,
          -0.294,
          -28.82
        ],
        "max": [
          -17.283,
          6.562,
          -22.949
        ]
      },
      {
        "min": [
          -26.713,
          -0.294,
          -30.812
        ],
        "max": [
          -17.841,
          3.744,
          -28.053
        ]
      },
      {
        "min": [
          15.326,
          -2.67,
          -5.693
        ],
        "max": [
          24.134,
          0.137,
          0.99
        ]
      },
      {
        "min": [
          -25.417,
          -2.762,
          -33.373
        ],
        "max": [
          -17.807,
          0.13,
          -30.836
        ]
      },
      {
        "min": [
          -24.584,
          -1.709,
          -15.979
        ],
        "max": [
          -17.359,
          2.691,
          -3.675
        ]
      },
      {
        "min": [
          -21.717,
          -0.294,
          -0.483
        ],
        "max": [
          -14.476,
          7.56,
          4.253
        ]
      },
      {
        "min": [
          -21.693,
          -0.294,
          4.373
        ],
        "max": [
          -15.905,
          6.585,
          9.683
        ]
      },
      {
        "min": [
          -23.797,
          -0.294,
          -0.643
        ],
        "max": [
          -21.949,
          4.209,
          8.34
        ]
      },
      {
        "min": [
          -26.295,
          -2.163,
          -0.671
        ],
        "max": [
          -23.889,
          0.482,
          6.96
        ]
      },
      {
        "min": [
          -36.534,
          -2.283,
          -2.437
        ],
        "max": [
          -32.589,
          1.46,
          1.599
        ]
      },
      {
        "min": [
          13.572,
          -2.67,
          -5.392
        ],
        "max": [
          14.406,
          0.137,
          -4.181
        ]
      }
    ]
  },
  "level3": {
    "id": "level3",
    "fog": {
      "enabled": true,
      "near": 0,
      "far": 500,
      "r": 0.764,
      "g": 0.702,
      "b": 0.562
    },
    "sunDirection": [
      -0.55,
      0.71,
      0.62
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -9.312,
          -4.752,
          -12.004
        ],
        "max": [
          -0.014,
          3.022,
          -4.295
        ]
      },
      {
        "min": [
          -20.106,
          -4.752,
          -14.571
        ],
        "max": [
          -14.624,
          7.17,
          -4.443
        ]
      },
      {
        "min": [
          -20.106,
          -10.122,
          -19.339
        ],
        "max": [
          -17.746,
          1.8,
          -14.029
        ]
      },
      {
        "min": [
          -24.979,
          -4.752,
          2.217
        ],
        "max": [
          -18.478,
          2.416,
          8.416
        ]
      },
      {
        "min": [
          -26.938,
          -4.752,
          11.638
        ],
        "max": [
          -23.575,
          2.416,
          16.541
        ]
      },
      {
        "min": [
          -11.298,
          -4.752,
          2.405
        ],
        "max": [
          -6.876,
          2.416,
          6.981
        ]
      },
      {
        "min": [
          -14.862,
          -4.752,
          11.073
        ],
        "max": [
          -8.978,
          2.416,
          14.402
        ]
      },
      {
        "min": [
          1.291,
          -4.752,
          4.501
        ],
        "max": [
          9.474,
          5.012,
          11.671
        ]
      },
      {
        "min": [
          -0.505,
          -4.752,
          5.6
        ],
        "max": [
          1.803,
          2.771,
          11.391
        ]
      },
      {
        "min": [
          14.758,
          -4.752,
          5.091
        ],
        "max": [
          20.534,
          7.17,
          13.565
        ]
      },
      {
        "min": [
          17.912,
          -10.171,
          12.57
        ],
        "max": [
          20.273,
          1.751,
          17.88
        ]
      },
      {
        "min": [
          7.119,
          -4.752,
          -6.25
        ],
        "max": [
          11.438,
          2.416,
          -2.689
        ]
      },
      {
        "min": [
          9.132,
          -4.752,
          -15.978
        ],
        "max": [
          14.902,
          2.323,
          -9.663
        ]
      },
      {
        "min": [
          22.707,
          -4.752,
          -16.33
        ],
        "max": [
          27.169,
          2.323,
          -11.204
        ]
      },
      {
        "min": [
          18.745,
          -4.375,
          -7.639
        ],
        "max": [
          24.607,
          2.793,
          -4.27
        ]
      },
      {
        "min": [
          24.924,
          -4.752,
          -11.097
        ],
        "max": [
          26.629,
          1.71,
          -9.388
        ]
      },
      {
        "min": [
          0.152,
          -4.752,
          -10.184
        ],
        "max": [
          1.785,
          1.71,
          -8.476
        ]
      },
      {
        "min": [
          6.899,
          -4.752,
          -2.584
        ],
        "max": [
          8.532,
          1.71,
          -0.909
        ]
      },
      {
        "min": [
          -8.526,
          -4.752,
          0.565
        ],
        "max": [
          -6.893,
          1.71,
          2.24
        ]
      },
      {
        "min": [
          -14.239,
          -4.752,
          -9.953
        ],
        "max": [
          -12.607,
          1.71,
          -8.278
        ]
      },
      {
        "min": [
          -26.65,
          -4.752,
          9.779
        ],
        "max": [
          -25.081,
          1.71,
          11.453
        ]
      },
      {
        "min": [
          12.844,
          -4.752,
          8.286
        ],
        "max": [
          14.476,
          1.71,
          9.961
        ]
      },
      {
        "min": [
          2.007,
          -8.002,
          -37.059
        ],
        "max": [
          9.822,
          37.467,
          -21.95
        ]
      },
      {
        "min": [
          -17.509,
          -8.002,
          -42.87
        ],
        "max": [
          2.418,
          37.467,
          -27.76
        ]
      },
      {
        "min": [
          -33.161,
          -8.002,
          -39.193
        ],
        "max": [
          -15.917,
          37.467,
          -24.084
        ]
      }
    ]
  },
  "level30": {
    "id": "level30",
    "fog": {
      "enabled": true,
      "near": 24,
      "far": 404,
      "r": 0.729,
      "g": 0.835,
      "b": 0.784
    },
    "sunDirection": [
      0.55,
      0.5,
      -0.4
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          3.818,
          -4.645,
          -29.028
        ],
        "max": [
          11.021,
          4.645,
          -20.793
        ]
      },
      {
        "min": [
          4.95,
          -4.645,
          -21.127
        ],
        "max": [
          10.81,
          2.599,
          -18.972
        ]
      },
      {
        "min": [
          -10.075,
          -2.927,
          -23.697
        ],
        "max": [
          -4.431,
          2.183,
          -17.471
        ]
      },
      {
        "min": [
          -10.739,
          -2.927,
          -14.073
        ],
        "max": [
          -4.906,
          6.275,
          -5.668
        ]
      },
      {
        "min": [
          -15.193,
          -2.927,
          -14.073
        ],
        "max": [
          -9.389,
          1.651,
          -11.728
        ]
      },
      {
        "min": [
          8.007,
          -2.927,
          -13.857
        ],
        "max": [
          18.205,
          6.275,
          -8.313
        ]
      },
      {
        "min": [
          17.801,
          -2.927,
          -13.749
        ],
        "max": [
          19.206,
          2.602,
          -11.605
        ]
      },
      {
        "min": [
          5.943,
          -2.927,
          -11.974
        ],
        "max": [
          8.358,
          1.208,
          -8.313
        ]
      },
      {
        "min": [
          4.878,
          -2.927,
          5.641
        ],
        "max": [
          10.711,
          6.275,
          14.046
        ]
      },
      {
        "min": [
          9.41,
          -2.927,
          11.724
        ],
        "max": [
          15.215,
          1.651,
          14.069
        ]
      },
      {
        "min": [
          -18.208,
          -2.927,
          8.333
        ],
        "max": [
          -8.01,
          6.275,
          13.837
        ]
      },
      {
        "min": [
          -8.367,
          -2.927,
          8.28
        ],
        "max": [
          -5.952,
          1.208,
          11.94
        ]
      },
      {
        "min": [
          -19.182,
          -2.927,
          11.648
        ],
        "max": [
          -17.777,
          2.602,
          13.792
        ]
      },
      {
        "min": [
          -11.032,
          -4.645,
          20.805
        ],
        "max": [
          -3.83,
          4.645,
          29.04
        ]
      },
      {
        "min": [
          -10.784,
          -4.645,
          18.99
        ],
        "max": [
          -4.924,
          2.599,
          21.144
        ]
      },
      {
        "min": [
          4.412,
          -2.927,
          17.506
        ],
        "max": [
          10.057,
          2.183,
          23.732
        ]
      },
      {
        "min": [
          -0.666,
          -3.04,
          -0.728
        ],
        "max": [
          0.623,
          2.07,
          0.702
        ]
      },
      {
        "min": [
          -1.59,
          -0.446,
          -1.753
        ],
        "max": [
          1.547,
          0.852,
          1.727
        ]
      },
      {
        "min": [
          -40.756,
          -66.999,
          -54.608
        ],
        "max": [
          -22.251,
          189.121,
          -13.181
        ]
      },
      {
        "min": [
          -46.696,
          -66.999,
          -6.335
        ],
        "max": [
          -28.191,
          189.121,
          3.911
        ]
      },
      {
        "min": [
          -42.258,
          -66.999,
          3.507
        ],
        "max": [
          -23.754,
          189.121,
          24.187
        ]
      },
      {
        "min": [
          -41.146,
          -66.999,
          20.45
        ],
        "max": [
          -17.829,
          189.121,
          39.309
        ]
      },
      {
        "min": [
          -42.278,
          -66.999,
          36.679
        ],
        "max": [
          3.023,
          189.121,
          52.707
        ]
      },
      {
        "min": [
          19.027,
          -66.999,
          20.22
        ],
        "max": [
          49.216,
          189.121,
          41.022
        ]
      },
      {
        "min": [
          0.781,
          -66.999,
          40.172
        ],
        "max": [
          46.081,
          189.121,
          56.2
        ]
      }
    ]
  },
  "level31": {
    "id": "level31",
    "fog": {
      "enabled": true,
      "near": 100,
      "far": 500,
      "r": 0.543,
      "g": 0.373,
      "b": 0.574
    },
    "sunDirection": [
      1,
      1,
      0.25
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -25.754,
          -8.999,
          37.261
        ],
        "max": [
          30.684,
          78.207,
          91.23
        ]
      },
      {
        "min": [
          23.172,
          -8.999,
          -3.821
        ],
        "max": [
          79.611,
          78.207,
          50.148
        ]
      },
      {
        "min": [
          49.695,
          -8.999,
          -56.412
        ],
        "max": [
          106.134,
          78.207,
          4.904
        ]
      },
      {
        "min": [
          -13.073,
          -8.999,
          -90.339
        ],
        "max": [
          51.834,
          78.207,
          -36.371
        ]
      },
      {
        "min": [
          -87.913,
          -8.999,
          27.664
        ],
        "max": [
          -23.006,
          78.207,
          81.632
        ]
      },
      {
        "min": [
          -111.042,
          -8.999,
          -23.006
        ],
        "max": [
          -46.135,
          78.207,
          30.962
        ]
      },
      {
        "min": [
          -94.385,
          -8.999,
          -61.259
        ],
        "max": [
          -29.478,
          78.207,
          -7.291
        ]
      },
      {
        "min": [
          -75.119,
          -8.999,
          -85.225
        ],
        "max": [
          -10.211,
          78.207,
          -31.257
        ]
      },
      {
        "min": [
          8.089,
          -8.999,
          -38.63
        ],
        "max": [
          24.75,
          78.207,
          -30.236
        ]
      },
      {
        "min": [
          21.057,
          6.287,
          -30.745
        ],
        "max": [
          24.852,
          78.207,
          -20.219
        ]
      },
      {
        "min": [
          20.378,
          6.287,
          -5.928
        ],
        "max": [
          24.204,
          78.207,
          -1.64
        ]
      },
      {
        "min": [
          -2.751,
          -8.999,
          35.159
        ],
        "max": [
          2.676,
          78.207,
          89.127
        ]
      },
      {
        "min": [
          -11.912,
          6.835,
          -5.304
        ],
        "max": [
          0.306,
          78.207,
          1.691
        ]
      },
      {
        "min": [
          -18.739,
          6.835,
          -21.833
        ],
        "max": [
          -10.281,
          78.207,
          -14.283
        ]
      },
      {
        "min": [
          -17.818,
          6.835,
          -14.74
        ],
        "max": [
          -10.281,
          78.207,
          -3.541
        ]
      },
      {
        "min": [
          -0.5,
          6.835,
          -6.824
        ],
        "max": [
          12.078,
          78.207,
          0.753
        ]
      },
      {
        "min": [
          8.066,
          6.835,
          -22.846
        ],
        "max": [
          12.078,
          78.207,
          -6.609
        ]
      },
      {
        "min": [
          11.669,
          6.835,
          -22.846
        ],
        "max": [
          15.682,
          78.207,
          -14.914
        ]
      },
      {
        "min": [
          9.892,
          6.835,
          -4.217
        ],
        "max": [
          13.904,
          78.207,
          1.142
        ]
      },
      {
        "min": [
          -22.384,
          6.835,
          13.507
        ],
        "max": [
          -10.167,
          78.207,
          19.827
        ]
      },
      {
        "min": [
          -36.926,
          6.835,
          13.122
        ],
        "max": [
          -21.943,
          78.207,
          19.435
        ]
      },
      {
        "min": [
          -33.61,
          6.835,
          8.435
        ],
        "max": [
          -26.054,
          78.207,
          14.409
        ]
      },
      {
        "min": [
          -32.867,
          -8.999,
          -10.657
        ],
        "max": [
          -26.547,
          78.207,
          -4.995
        ]
      },
      {
        "min": [
          -47.639,
          -8.999,
          -7.55
        ],
        "max": [
          -42.256,
          78.207,
          6.912
        ]
      },
      {
        "min": [
          -25.088,
          6.571,
          -27.123
        ],
        "max": [
          -21.828,
          9.855,
          -23.815
        ]
      }
    ]
  },
  "level32": {
    "id": "level32",
    "fog": {
      "enabled": true,
      "near": 21,
      "far": 360,
      "r": 0.89,
      "g": 0.918,
      "b": 0.91
    },
    "sunDirection": [
      -1,
      0.46,
      -0.5
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -6.324,
          -6.585,
          -0.762
        ],
        "max": [
          3.968,
          59.806,
          8.495
        ]
      },
      {
        "min": [
          -12.856,
          -6.585,
          -16.079
        ],
        "max": [
          -6.011,
          58.735,
          -10.207
        ]
      },
      {
        "min": [
          -22.418,
          -7.826,
          2.371
        ],
        "max": [
          -16.705,
          1.68,
          5.038
        ]
      },
      {
        "min": [
          -48.039,
          -8.439,
          -6.448
        ],
        "max": [
          -27.062,
          59.891,
          8.791
        ]
      },
      {
        "min": [
          -39.637,
          -7.016,
          -14.372
        ],
        "max": [
          -5.864,
          59.471,
          6.27
        ]
      },
      {
        "min": [
          -53.061,
          -8.865,
          -18.974
        ],
        "max": [
          -48.608,
          5.255,
          -14.389
        ]
      },
      {
        "min": [
          -40.64,
          -4.628,
          17.943
        ],
        "max": [
          -25.775,
          58.643,
          29.709
        ]
      },
      {
        "min": [
          -42.716,
          -4.628,
          17.823
        ],
        "max": [
          -23.487,
          58.643,
          24.173
        ]
      },
      {
        "min": [
          12.546,
          -6.585,
          1.804
        ],
        "max": [
          20.979,
          59.889,
          8.526
        ]
      },
      {
        "min": [
          12.551,
          -6.013,
          -12.639
        ],
        "max": [
          23.268,
          59.886,
          6.128
        ]
      },
      {
        "min": [
          5.864,
          -3.095,
          -22.102
        ],
        "max": [
          18.025,
          59.204,
          -11.527
        ]
      },
      {
        "min": [
          2.966,
          -3.095,
          -20.226
        ],
        "max": [
          14.84,
          59.348,
          -12.066
        ]
      },
      {
        "min": [
          12.558,
          -3.095,
          -25.2
        ],
        "max": [
          17.332,
          59.902,
          -22.077
        ]
      },
      {
        "min": [
          12.016,
          -3.095,
          -40.23
        ],
        "max": [
          19.719,
          60.423,
          -30.921
        ]
      },
      {
        "min": [
          -11.011,
          -3.095,
          -58.288
        ],
        "max": [
          -1.064,
          59.59,
          -22.959
        ]
      },
      {
        "min": [
          11.896,
          -6.013,
          17.504
        ],
        "max": [
          21.457,
          59.886,
          30.861
        ]
      },
      {
        "min": [
          13.626,
          -6.013,
          26.552
        ],
        "max": [
          23.186,
          59.886,
          30.861
        ]
      },
      {
        "min": [
          29.649,
          -6.013,
          17.822
        ],
        "max": [
          54.62,
          59.886,
          23.563
        ]
      },
      {
        "min": [
          -13.356,
          -6.013,
          24.052
        ],
        "max": [
          4.397,
          59.886,
          43.752
        ]
      },
      {
        "min": [
          -16.191,
          -6.013,
          26.779
        ],
        "max": [
          1.338,
          59.886,
          46.479
        ]
      },
      {
        "min": [
          -29.803,
          -8.296,
          -42.337
        ],
        "max": [
          -19.193,
          59.471,
          -36.292
        ]
      },
      {
        "min": [
          -30.741,
          -8.154,
          -39.112
        ],
        "max": [
          -20.13,
          59.471,
          -36.505
        ]
      },
      {
        "min": [
          -48.852,
          -7.87,
          -46.017
        ],
        "max": [
          -37.864,
          59.471,
          -29.954
        ]
      },
      {
        "min": [
          -45.415,
          -8.581,
          -36.981
        ],
        "max": [
          -34.765,
          59.471,
          -29.954
        ]
      },
      {
        "min": [
          -32.396,
          -8.52,
          -74.397
        ],
        "max": [
          1.377,
          66.666,
          -53.755
        ]
      }
    ]
  },
  "level33": {
    "id": "level33",
    "fog": {
      "enabled": true,
      "near": 51,
      "far": 305,
      "r": 0.749,
      "g": 0.875,
      "b": 0.957
    },
    "sunDirection": [
      0.8,
      0.77,
      -0.71
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -2.047,
          -3.526,
          -2.018
        ],
        "max": [
          2.047,
          4.58,
          2.018
        ]
      },
      {
        "min": [
          -13.158,
          -3.89,
          -21.009
        ],
        "max": [
          3.899,
          18.821,
          -11.491
        ]
      },
      {
        "min": [
          -26.624,
          -3.89,
          -18.656
        ],
        "max": [
          -12.032,
          18.821,
          -7.72
        ]
      },
      {
        "min": [
          -27.84,
          -3.89,
          -8.933
        ],
        "max": [
          -15.93,
          18.821,
          8.976
        ]
      },
      {
        "min": [
          -23.415,
          -3.89,
          6.326
        ],
        "max": [
          -15.93,
          18.821,
          13.355
        ]
      },
      {
        "min": [
          -30.633,
          -3.89,
          -8.933
        ],
        "max": [
          -22.931,
          18.821,
          -2.876
        ]
      },
      {
        "min": [
          -26.691,
          -3.89,
          -21.181
        ],
        "max": [
          -19.675,
          18.821,
          -15.124
        ]
      },
      {
        "min": [
          -12.621,
          -3.89,
          -16.112
        ],
        "max": [
          -0.2,
          18.821,
          -10.054
        ]
      },
      {
        "min": [
          14.288,
          -3.89,
          -11.15
        ],
        "max": [
          26.313,
          18.821,
          21.26
        ]
      },
      {
        "min": [
          0.896,
          -3.89,
          9.523
        ],
        "max": [
          14.449,
          18.821,
          21.055
        ]
      },
      {
        "min": [
          -3.353,
          -3.89,
          12.576
        ],
        "max": [
          9.184,
          18.821,
          21.055
        ]
      },
      {
        "min": [
          15.687,
          -3.89,
          -13.914
        ],
        "max": [
          26.019,
          18.821,
          -5.29
        ]
      },
      {
        "min": [
          19.458,
          -3.89,
          -6.042
        ],
        "max": [
          29.675,
          18.821,
          -0.06
        ]
      },
      {
        "min": [
          -50.339,
          -5.964,
          -66.22
        ],
        "max": [
          47.692,
          64.402,
          -39.91
        ]
      },
      {
        "min": [
          -50.339,
          -5.964,
          39.822
        ],
        "max": [
          47.692,
          64.402,
          61.911
        ]
      },
      {
        "min": [
          -63.718,
          -5.964,
          -75.152
        ],
        "max": [
          -45.031,
          64.402,
          69.392
        ]
      },
      {
        "min": [
          45.418,
          -5.964,
          -75.152
        ],
        "max": [
          66.647,
          64.402,
          69.392
        ]
      },
      {
        "min": [
          -50.339,
          -17.758,
          -66.22
        ],
        "max": [
          47.692,
          -0.717,
          53.233
        ]
      },
      {
        "min": [
          -50.339,
          64.065,
          -66.22
        ],
        "max": [
          47.692,
          81.106,
          53.233
        ]
      },
      {
        "min": [
          35.142,
          -21.229,
          -47.898
        ],
        "max": [
          45.758,
          1.482,
          -22.45
        ]
      },
      {
        "min": [
          35.077,
          -1.366,
          -45.905
        ],
        "max": [
          52.134,
          1.383,
          -19.637
        ]
      },
      {
        "min": [
          35.077,
          -1.461,
          19.696
        ],
        "max": [
          52.134,
          1.288,
          45.964
        ]
      },
      {
        "min": [
          -52.096,
          -1.433,
          19.138
        ],
        "max": [
          -35.038,
          1.09,
          45.406
        ]
      },
      {
        "min": [
          -52.148,
          -1.487,
          -44.812
        ],
        "max": [
          -35.091,
          1.262,
          -18.544
        ]
      }
    ]
  },
  "level34": {
    "id": "level34",
    "fog": null,
    "sunDirection": [
      -0.45,
      0.75,
      -1
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -124.296,
          -50.5,
          -86.56
        ],
        "max": [
          110.429,
          -1.721,
          76.394
        ]
      },
      {
        "min": [
          -124.296,
          -50.5,
          -466.254
        ],
        "max": [
          110.429,
          120.306,
          -69.835
        ]
      },
      {
        "min": [
          100.449,
          -50.5,
          -464.352
        ],
        "max": [
          502.009,
          120.306,
          431.576
        ]
      },
      {
        "min": [
          -124.296,
          -50.5,
          66.076
        ],
        "max": [
          110.429,
          120.306,
          478.842
        ]
      },
      {
        "min": [
          -464.194,
          -50.5,
          -448.473
        ],
        "max": [
          -100.471,
          120.306,
          446.555
        ]
      },
      {
        "min": [
          -143.689,
          -50.5,
          -110.87
        ],
        "max": [
          -60.577,
          120.306,
          -26.349
        ]
      },
      {
        "min": [
          -65.65,
          -50.5,
          -140.134
        ],
        "max": [
          17.462,
          120.306,
          -55.614
        ]
      },
      {
        "min": [
          59.275,
          -50.5,
          -131.678
        ],
        "max": [
          142.386,
          120.306,
          -47.158
        ]
      },
      {
        "min": [
          73.497,
          -50.5,
          -114.381
        ],
        "max": [
          156.608,
          120.306,
          -29.86
        ]
      },
      {
        "min": [
          68.388,
          -50.5,
          16.423
        ],
        "max": [
          151.5,
          120.306,
          100.943
        ]
      },
      {
        "min": [
          53.862,
          -50.5,
          29.755
        ],
        "max": [
          136.974,
          120.306,
          114.275
        ]
      },
      {
        "min": [
          -15.187,
          -50.5,
          52.504
        ],
        "max": [
          67.925,
          120.306,
          137.025
        ]
      },
      {
        "min": [
          -152.637,
          -50.5,
          28.662
        ],
        "max": [
          -69.525,
          120.306,
          113.182
        ]
      },
      {
        "min": [
          -143.867,
          -50.5,
          52.898
        ],
        "max": [
          -60.755,
          120.306,
          137.419
        ]
      },
      {
        "min": [
          -165.384,
          -50.5,
          -100.424
        ],
        "max": [
          -82.272,
          120.306,
          -15.904
        ]
      }
    ]
  },
  "level35": {
    "id": "level35",
    "fog": {
      "enabled": true,
      "near": 20,
      "far": 500,
      "r": 1,
      "g": 0.761,
      "b": 0.427
    },
    "sunDirection": [
      0.65,
      0.5,
      -0.55
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -117.76,
          -19.049,
          -83.311
        ],
        "max": [
          4.252,
          95.05,
          -27.061
        ]
      },
      {
        "min": [
          2.671,
          -19.049,
          -84.239
        ],
        "max": [
          151.142,
          95.05,
          -29.322
        ]
      },
      {
        "min": [
          -58.866,
          -19.049,
          26.84
        ],
        "max": [
          149.859,
          95.05,
          86.281
        ]
      },
      {
        "min": [
          -114.984,
          -19.049,
          31.3
        ],
        "max": [
          7.028,
          95.05,
          85.778
        ]
      },
      {
        "min": [
          71.207,
          -19.049,
          16.806
        ],
        "max": [
          129.669,
          95.05,
          73.055
        ]
      },
      {
        "min": [
          60.632,
          -19.049,
          22.287
        ],
        "max": [
          119.093,
          95.05,
          78.536
        ]
      },
      {
        "min": [
          94.706,
          -19.049,
          -34.834
        ],
        "max": [
          150.031,
          95.05,
          52.716
        ]
      },
      {
        "min": [
          85.489,
          -19.049,
          -70.236
        ],
        "max": [
          143.95,
          95.05,
          -13.986
        ]
      },
      {
        "min": [
          -158.332,
          -19.049,
          -30.412
        ],
        "max": [
          -99.871,
          95.05,
          87.181
        ]
      },
      {
        "min": [
          -157.653,
          -19.049,
          -81.78
        ],
        "max": [
          -90.304,
          95.05,
          -14.425
        ]
      },
      {
        "min": [
          -158.14,
          -19.049,
          -83.586
        ],
        "max": [
          -33.55,
          95.05,
          -23.339
        ]
      },
      {
        "min": [
          -157.871,
          -19.531,
          -84.673
        ],
        "max": [
          151.142,
          -0.706,
          87.401
        ]
      },
      {
        "min": [
          -157.871,
          88.104,
          -84.673
        ],
        "max": [
          151.142,
          106.929,
          87.401
        ]
      }
    ]
  },
  "level36": {
    "id": "level36",
    "fog": {
      "enabled": true,
      "near": 51,
      "far": 305,
      "r": 0.749,
      "g": 0.875,
      "b": 0.957
    },
    "sunDirection": [
      0.8,
      0.77,
      -0.71
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -2.047,
          -3.526,
          -2.018
        ],
        "max": [
          2.047,
          4.58,
          2.018
        ]
      },
      {
        "min": [
          -13.158,
          -3.89,
          -21.009
        ],
        "max": [
          3.899,
          18.821,
          -11.491
        ]
      },
      {
        "min": [
          -26.624,
          -3.89,
          -18.656
        ],
        "max": [
          -12.032,
          18.821,
          -7.72
        ]
      },
      {
        "min": [
          -27.84,
          -3.89,
          -8.933
        ],
        "max": [
          -15.93,
          18.821,
          8.976
        ]
      },
      {
        "min": [
          -23.415,
          -3.89,
          6.326
        ],
        "max": [
          -15.93,
          18.821,
          13.355
        ]
      },
      {
        "min": [
          -30.633,
          -3.89,
          -8.933
        ],
        "max": [
          -22.931,
          18.821,
          -2.876
        ]
      },
      {
        "min": [
          -26.691,
          -3.89,
          -21.181
        ],
        "max": [
          -19.675,
          18.821,
          -15.124
        ]
      },
      {
        "min": [
          -12.621,
          -3.89,
          -16.112
        ],
        "max": [
          -0.2,
          18.821,
          -10.054
        ]
      },
      {
        "min": [
          14.288,
          -3.89,
          -11.15
        ],
        "max": [
          26.313,
          18.821,
          21.26
        ]
      },
      {
        "min": [
          0.896,
          -3.89,
          9.523
        ],
        "max": [
          14.449,
          18.821,
          21.055
        ]
      },
      {
        "min": [
          -3.353,
          -3.89,
          12.576
        ],
        "max": [
          9.184,
          18.821,
          21.055
        ]
      },
      {
        "min": [
          15.687,
          -3.89,
          -13.914
        ],
        "max": [
          26.019,
          18.821,
          -5.29
        ]
      },
      {
        "min": [
          19.458,
          -3.89,
          -6.042
        ],
        "max": [
          29.675,
          18.821,
          -0.06
        ]
      },
      {
        "min": [
          -50.339,
          -5.964,
          -66.22
        ],
        "max": [
          47.692,
          64.402,
          -39.91
        ]
      },
      {
        "min": [
          -50.339,
          -5.964,
          39.822
        ],
        "max": [
          47.692,
          64.402,
          61.911
        ]
      },
      {
        "min": [
          -63.718,
          -5.964,
          -75.152
        ],
        "max": [
          -45.031,
          64.402,
          69.392
        ]
      },
      {
        "min": [
          45.418,
          -5.964,
          -75.152
        ],
        "max": [
          66.647,
          64.402,
          69.392
        ]
      },
      {
        "min": [
          -50.339,
          -17.758,
          -66.22
        ],
        "max": [
          47.692,
          -0.717,
          53.233
        ]
      },
      {
        "min": [
          -50.339,
          64.065,
          -66.22
        ],
        "max": [
          47.692,
          81.106,
          53.233
        ]
      },
      {
        "min": [
          35.142,
          -21.229,
          -47.898
        ],
        "max": [
          45.758,
          1.482,
          -22.45
        ]
      },
      {
        "min": [
          35.077,
          -1.366,
          -45.905
        ],
        "max": [
          52.134,
          1.383,
          -19.637
        ]
      },
      {
        "min": [
          35.077,
          -1.461,
          19.696
        ],
        "max": [
          52.134,
          1.288,
          45.964
        ]
      },
      {
        "min": [
          -52.096,
          -1.433,
          19.138
        ],
        "max": [
          -35.038,
          1.09,
          45.406
        ]
      },
      {
        "min": [
          -52.148,
          -1.487,
          -44.812
        ],
        "max": [
          -35.091,
          1.262,
          -18.544
        ]
      }
    ]
  },
  "level37": {
    "id": "level37",
    "fog": {
      "enabled": true,
      "near": 51,
      "far": 305,
      "r": 0.749,
      "g": 0.875,
      "b": 0.957
    },
    "sunDirection": [
      0.8,
      0.77,
      -0.71
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -2.047,
          -3.526,
          -2.018
        ],
        "max": [
          2.047,
          4.58,
          2.018
        ]
      },
      {
        "min": [
          -13.158,
          -3.89,
          -21.009
        ],
        "max": [
          3.899,
          18.821,
          -11.491
        ]
      },
      {
        "min": [
          -26.624,
          -3.89,
          -18.656
        ],
        "max": [
          -12.032,
          18.821,
          -7.72
        ]
      },
      {
        "min": [
          -27.84,
          -3.89,
          -8.933
        ],
        "max": [
          -15.93,
          18.821,
          8.976
        ]
      },
      {
        "min": [
          -23.415,
          -3.89,
          6.326
        ],
        "max": [
          -15.93,
          18.821,
          13.355
        ]
      },
      {
        "min": [
          -30.633,
          -3.89,
          -8.933
        ],
        "max": [
          -22.931,
          18.821,
          -2.876
        ]
      },
      {
        "min": [
          -26.691,
          -3.89,
          -21.181
        ],
        "max": [
          -19.675,
          18.821,
          -15.124
        ]
      },
      {
        "min": [
          -12.621,
          -3.89,
          -16.112
        ],
        "max": [
          -0.2,
          18.821,
          -10.054
        ]
      },
      {
        "min": [
          14.288,
          -3.89,
          -11.15
        ],
        "max": [
          26.313,
          18.821,
          21.26
        ]
      },
      {
        "min": [
          0.896,
          -3.89,
          9.523
        ],
        "max": [
          14.449,
          18.821,
          21.055
        ]
      },
      {
        "min": [
          -3.353,
          -3.89,
          12.576
        ],
        "max": [
          9.184,
          18.821,
          21.055
        ]
      },
      {
        "min": [
          15.687,
          -3.89,
          -13.914
        ],
        "max": [
          26.019,
          18.821,
          -5.29
        ]
      },
      {
        "min": [
          19.458,
          -3.89,
          -6.042
        ],
        "max": [
          29.675,
          18.821,
          -0.06
        ]
      },
      {
        "min": [
          -50.339,
          -5.964,
          -66.22
        ],
        "max": [
          47.692,
          64.402,
          -39.91
        ]
      },
      {
        "min": [
          -50.339,
          -5.964,
          39.822
        ],
        "max": [
          47.692,
          64.402,
          61.911
        ]
      },
      {
        "min": [
          -63.718,
          -5.964,
          -75.152
        ],
        "max": [
          -45.031,
          64.402,
          69.392
        ]
      },
      {
        "min": [
          45.418,
          -5.964,
          -75.152
        ],
        "max": [
          66.647,
          64.402,
          69.392
        ]
      },
      {
        "min": [
          -50.339,
          -17.758,
          -66.22
        ],
        "max": [
          47.692,
          -0.717,
          53.233
        ]
      },
      {
        "min": [
          -50.339,
          64.065,
          -66.22
        ],
        "max": [
          47.692,
          81.106,
          53.233
        ]
      },
      {
        "min": [
          35.142,
          -21.229,
          -47.898
        ],
        "max": [
          45.758,
          1.482,
          -22.45
        ]
      },
      {
        "min": [
          35.077,
          -1.366,
          -45.905
        ],
        "max": [
          52.134,
          1.383,
          -19.637
        ]
      },
      {
        "min": [
          35.077,
          -1.461,
          19.696
        ],
        "max": [
          52.134,
          1.288,
          45.964
        ]
      },
      {
        "min": [
          -52.096,
          -1.433,
          19.138
        ],
        "max": [
          -35.038,
          1.09,
          45.406
        ]
      },
      {
        "min": [
          -52.148,
          -1.487,
          -44.812
        ],
        "max": [
          -35.091,
          1.262,
          -18.544
        ]
      }
    ]
  },
  "level38": {
    "id": "level38",
    "fog": {
      "enabled": true,
      "near": 5,
      "far": 258.9,
      "r": 0,
      "g": 0.051,
      "b": 0.082
    },
    "sunDirection": [
      -1,
      1,
      -0.5
    ],
    "ambienceAudio": "go/ambience_2d/alien_boss",
    "deadAABBs": [
      {
        "min": [
          72.374,
          3.109,
          -24.615
        ],
        "max": [
          76.748,
          9.925,
          -18.601
        ]
      },
      {
        "min": [
          72.212,
          3.21,
          -18.063
        ],
        "max": [
          74.77,
          8.959,
          -15.583
        ]
      },
      {
        "min": [
          69.222,
          3.344,
          -43.637
        ],
        "max": [
          72.694,
          9.925,
          -39.506
        ]
      },
      {
        "min": [
          70.719,
          3.343,
          -38.821
        ],
        "max": [
          74.149,
          9.925,
          -35.427
        ]
      },
      {
        "min": [
          70.303,
          3.338,
          -40.817
        ],
        "max": [
          73.545,
          9.925,
          -36.685
        ]
      },
      {
        "min": [
          75.769,
          3.229,
          -35.699
        ],
        "max": [
          81.428,
          9.446,
          -32.95
        ]
      },
      {
        "min": [
          81.138,
          3.103,
          -30.216
        ],
        "max": [
          83.874,
          9.102,
          -27.492
        ]
      },
      {
        "min": [
          91.151,
          -88.483,
          -26.173
        ],
        "max": [
          161.102,
          103.347,
          70.015
        ]
      },
      {
        "min": [
          72.006,
          -88.483,
          -4.874
        ],
        "max": [
          141.958,
          103.347,
          91.315
        ]
      },
      {
        "min": [
          96.479,
          -88.483,
          -51.668
        ],
        "max": [
          166.43,
          103.347,
          44.521
        ]
      },
      {
        "min": [
          68.396,
          3.323,
          -46.798
        ],
        "max": [
          70.671,
          9.925,
          -44.414
        ]
      },
      {
        "min": [
          67.19,
          3.344,
          -48.905
        ],
        "max": [
          69.797,
          10.288,
          -46.173
        ]
      },
      {
        "min": [
          66.18,
          3.362,
          -50.413
        ],
        "max": [
          68.455,
          9.925,
          -48.029
        ]
      },
      {
        "min": [
          59.633,
          3.341,
          -54.064
        ],
        "max": [
          64.875,
          9.925,
          -50.578
        ]
      },
      {
        "min": [
          56.54,
          3.203,
          -55.465
        ],
        "max": [
          61.782,
          9.925,
          -51.978
        ]
      },
      {
        "min": [
          31.26,
          11.622,
          -75.98
        ],
        "max": [
          44.814,
          16.609,
          -65.492
        ]
      },
      {
        "min": [
          37.268,
          7.584,
          -76.116
        ],
        "max": [
          47.582,
          12.571,
          -67.484
        ]
      },
      {
        "min": [
          85.666,
          -88.483,
          -139.511
        ],
        "max": [
          155.617,
          103.347,
          -43.322
        ]
      },
      {
        "min": [
          74.998,
          -88.483,
          -154.803
        ],
        "max": [
          144.949,
          103.347,
          -58.614
        ]
      },
      {
        "min": [
          31.196,
          -88.483,
          -171.967
        ],
        "max": [
          101.148,
          103.347,
          -75.778
        ]
      },
      {
        "min": [
          67.598,
          -88.483,
          -160.457
        ],
        "max": [
          137.55,
          103.347,
          -64.268
        ]
      },
      {
        "min": [
          15.175,
          -88.483,
          -72.334
        ],
        "max": [
          35.921,
          103.347,
          -59.593
        ]
      },
      {
        "min": [
          -64.623,
          -88.483,
          -161.429
        ],
        "max": [
          32.408,
          103.347,
          -71.871
        ]
      },
      {
        "min": [
          37.675,
          6.155,
          -67.721
        ],
        "max": [
          42.918,
          11.142,
          -59.766
        ]
      },
      {
        "min": [
          -64.343,
          -88.483,
          -96.346
        ],
        "max": [
          -36.549,
          103.347,
          -6.789
        ]
      }
    ]
  },
  "level39": {
    "id": "level39",
    "fog": {
      "enabled": true,
      "near": 18.4,
      "far": 177.3,
      "r": 0.081,
      "g": 0.104,
      "b": 0.113
    },
    "sunDirection": [
      -1,
      1,
      -0.5
    ],
    "ambienceAudio": "go/ambience_2d/alien_boss",
    "deadAABBs": [
      {
        "min": [
          10.453,
          -9.379,
          -56.155
        ],
        "max": [
          15.657,
          2.676,
          -46.709
        ]
      },
      {
        "min": [
          5.399,
          -9.379,
          -60.347
        ],
        "max": [
          9.397,
          1.745,
          -56.36
        ]
      },
      {
        "min": [
          -12.173,
          -9.379,
          -66.619
        ],
        "max": [
          -8.942,
          2.676,
          -60.929
        ]
      },
      {
        "min": [
          -17.188,
          -9.379,
          -41.044
        ],
        "max": [
          -5.959,
          5.766,
          -35.293
        ]
      },
      {
        "min": [
          -16.475,
          -9.379,
          -35.541
        ],
        "max": [
          -7.265,
          3.07,
          -33.179
        ]
      },
      {
        "min": [
          -16.475,
          -9.379,
          -33.53
        ],
        "max": [
          -10.355,
          0.405,
          -30.599
        ]
      },
      {
        "min": [
          -16.486,
          -6.937,
          -33.53
        ],
        "max": [
          -13.204,
          2.144,
          -30.599
        ]
      },
      {
        "min": [
          -18.549,
          -9.379,
          -41.044
        ],
        "max": [
          -16.626,
          5.49,
          -39.804
        ]
      },
      {
        "min": [
          -18.549,
          -9.379,
          -36.439
        ],
        "max": [
          -16.626,
          5.49,
          -35.255
        ]
      },
      {
        "min": [
          -16.202,
          3.954,
          -40.16
        ],
        "max": [
          -12.056,
          16.518,
          -36.081
        ]
      },
      {
        "min": [
          -19.764,
          -7.985,
          -30.212
        ],
        "max": [
          -16.532,
          4.07,
          -24.522
        ]
      },
      {
        "min": [
          -17.661,
          -7.985,
          -19.867
        ],
        "max": [
          -11.132,
          5.161,
          -7.156
        ]
      },
      {
        "min": [
          -18.385,
          3.472,
          -19.867
        ],
        "max": [
          -11.94,
          5.125,
          -7.156
        ]
      },
      {
        "min": [
          -14.718,
          -7.985,
          -19.44
        ],
        "max": [
          -8.208,
          5.053,
          -7.156
        ]
      },
      {
        "min": [
          -16.165,
          -7.985,
          -7.845
        ],
        "max": [
          -8.208,
          1.018,
          -4.355
        ]
      },
      {
        "min": [
          -8.969,
          -7.985,
          -6.358
        ],
        "max": [
          -7.734,
          2.171,
          -4.355
        ]
      },
      {
        "min": [
          -8.969,
          -7.985,
          -10.788
        ],
        "max": [
          -7.734,
          2.171,
          -8.583
        ]
      },
      {
        "min": [
          -8.969,
          -7.985,
          -15.227
        ],
        "max": [
          -7.734,
          2.171,
          -13.022
        ]
      },
      {
        "min": [
          -8.969,
          -7.985,
          -19.435
        ],
        "max": [
          -7.734,
          2.171,
          -17.46
        ]
      },
      {
        "min": [
          -2.671,
          -7.985,
          -14.658
        ],
        "max": [
          1.579,
          2.707,
          -5.181
        ]
      },
      {
        "min": [
          14.629,
          -7.985,
          -10.333
        ],
        "max": [
          17.334,
          2.707,
          -4.881
        ]
      },
      {
        "min": [
          -7.642,
          -7.985,
          -3.538
        ],
        "max": [
          -3.609,
          2.05,
          0.466
        ]
      },
      {
        "min": [
          -56.736,
          -9.379,
          -40.118
        ],
        "max": [
          -31.625,
          81.214,
          -27.32
        ]
      },
      {
        "min": [
          -58.856,
          -9.379,
          -54.128
        ],
        "max": [
          -33.745,
          81.214,
          -36.786
        ]
      },
      {
        "min": [
          -49.625,
          -9.379,
          -71.983
        ],
        "max": [
          -24.515,
          81.214,
          -49.129
        ]
      }
    ]
  },
  "level4": {
    "id": "level4",
    "fog": {
      "enabled": true,
      "near": 0,
      "far": 2000,
      "r": 0.35,
      "g": 0.45,
      "b": 0.55
    },
    "sunDirection": [
      -0.5,
      0.18,
      0.232
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": []
  },
  "level40": {
    "id": "level40",
    "fog": {
      "enabled": true,
      "near": 0,
      "far": 294.3,
      "r": 0.589,
      "g": 0.375,
      "b": 0.186
    },
    "sunDirection": [
      0.404494,
      0.438202,
      0.022472
    ],
    "ambienceAudio": "go/ambience_2d/alien_boss",
    "deadAABBs": [
      {
        "min": [
          -31.523,
          -50.524,
          37.001
        ],
        "max": [
          -30.71,
          73.496,
          38.925
        ]
      },
      {
        "min": [
          0.332,
          -53.319,
          -16.995
        ],
        "max": [
          5.453,
          72.89,
          -15.268
        ]
      },
      {
        "min": [
          0.602,
          -53.377,
          -16.218
        ],
        "max": [
          1.286,
          72.021,
          -11.919
        ]
      },
      {
        "min": [
          13.948,
          -0.386,
          -20.708
        ],
        "max": [
          16.432,
          1.516,
          -19.233
        ]
      },
      {
        "min": [
          11.207,
          -1.132,
          2.209
        ],
        "max": [
          12.504,
          1.151,
          3.869
        ]
      },
      {
        "min": [
          11.736,
          -0.459,
          -12.042
        ],
        "max": [
          14.428,
          1.506,
          -11.324
        ]
      },
      {
        "min": [
          14.798,
          -0.677,
          -13.881
        ],
        "max": [
          15.489,
          1.479,
          -11.382
        ]
      },
      {
        "min": [
          14.816,
          -0.677,
          -10.904
        ],
        "max": [
          15.498,
          1.479,
          -8.406
        ]
      },
      {
        "min": [
          -12.259,
          -0.051,
          30.103
        ],
        "max": [
          -10.442,
          1.631,
          30.552
        ]
      },
      {
        "min": [
          -66.44,
          61.071,
          -44.176
        ],
        "max": [
          50.675,
          73.94,
          60.6
        ]
      },
      {
        "min": [
          -66.609,
          -57.347,
          -45.266
        ],
        "max": [
          50.675,
          -46.772,
          60.118
        ]
      },
      {
        "min": [
          -65.93,
          -53.015,
          21.364
        ],
        "max": [
          -38.471,
          72.883,
          41.531
        ]
      },
      {
        "min": [
          -21.572,
          -53.515,
          -41.454
        ],
        "max": [
          -9.206,
          72.383,
          -30.471
        ]
      },
      {
        "min": [
          19.79,
          -53.015,
          -41.34
        ],
        "max": [
          33.423,
          72.883,
          -24.102
        ]
      },
      {
        "min": [
          -55.949,
          -53.015,
          38.377
        ],
        "max": [
          -17.11,
          72.883,
          53.203
        ]
      },
      {
        "min": [
          -26.382,
          -53.015,
          33.805
        ],
        "max": [
          -22.431,
          72.883,
          49.57
        ]
      },
      {
        "min": [
          -22.221,
          -53.015,
          44.002
        ],
        "max": [
          7.7,
          72.883,
          59.238
        ]
      },
      {
        "min": [
          0.83,
          -53.015,
          40.09
        ],
        "max": [
          12.528,
          72.883,
          55.327
        ]
      },
      {
        "min": [
          8.539,
          -53.015,
          36.576
        ],
        "max": [
          19.515,
          72.883,
          52.411
        ]
      },
      {
        "min": [
          16.272,
          -53.015,
          34.874
        ],
        "max": [
          24.648,
          72.883,
          50.775
        ]
      },
      {
        "min": [
          20.945,
          -53.015,
          31.401
        ],
        "max": [
          23.609,
          72.883,
          54.378
        ]
      },
      {
        "min": [
          21.977,
          -53.015,
          33.262
        ],
        "max": [
          36.627,
          72.883,
          48.499
        ]
      },
      {
        "min": [
          35.795,
          -53.015,
          3.013
        ],
        "max": [
          49.073,
          72.883,
          41.358
        ]
      },
      {
        "min": [
          28.993,
          -53.015,
          -1.503
        ],
        "max": [
          42.174,
          72.883,
          5.049
        ]
      },
      {
        "min": [
          35.082,
          -53.015,
          -27.761
        ],
        "max": [
          48.575,
          72.883,
          0.79
        ]
      }
    ]
  },
  "level41": {
    "id": "level41",
    "fog": {
      "enabled": true,
      "near": 45,
      "far": 223.4,
      "r": 0.93,
      "g": 0.949,
      "b": 0.906
    },
    "sunDirection": [
      0.4,
      0.6,
      0.7
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          15.331,
          -0.6,
          -2.738
        ],
        "max": [
          24.324,
          4.768,
          9.301
        ]
      },
      {
        "min": [
          16.469,
          -1.278,
          13.879
        ],
        "max": [
          19.866,
          2.94,
          22.253
        ]
      },
      {
        "min": [
          3.57,
          -0.665,
          15.057
        ],
        "max": [
          7.699,
          2.743,
          24.307
        ]
      },
      {
        "min": [
          -8.186,
          -2.541,
          28.996
        ],
        "max": [
          -3.87,
          0.867,
          37.887
        ]
      },
      {
        "min": [
          -8.568,
          -0.571,
          15.223
        ],
        "max": [
          -1.995,
          3.443,
          20.47
        ]
      },
      {
        "min": [
          -25.207,
          -0.571,
          15.675
        ],
        "max": [
          -21.464,
          4.19,
          27.587
        ]
      },
      {
        "min": [
          -25.033,
          3.88,
          15.757
        ],
        "max": [
          -17.313,
          7.895,
          27.518
        ]
      },
      {
        "min": [
          -31.911,
          -0.571,
          15.872
        ],
        "max": [
          -25.346,
          4.402,
          19.821
        ]
      },
      {
        "min": [
          32.718,
          -0.829,
          -2.092
        ],
        "max": [
          35.917,
          2.082,
          3.436
        ]
      },
      {
        "min": [
          21.963,
          -1.346,
          -21.301
        ],
        "max": [
          27.035,
          1.762,
          -12.044
        ]
      },
      {
        "min": [
          17.812,
          -1.648,
          -31.6
        ],
        "max": [
          21.803,
          1.46,
          -27.607
        ]
      },
      {
        "min": [
          3.863,
          -0.294,
          -21.209
        ],
        "max": [
          15.628,
          4.138,
          -17.46
        ]
      },
      {
        "min": [
          -8.819,
          -1.442,
          -20.845
        ],
        "max": [
          -0.031,
          2.876,
          -16.495
        ]
      },
      {
        "min": [
          -33.173,
          -2.358,
          -40.786
        ],
        "max": [
          -29.18,
          1.385,
          -36.794
        ]
      },
      {
        "min": [
          -27.991,
          -0.294,
          -28.82
        ],
        "max": [
          -17.283,
          6.562,
          -22.949
        ]
      },
      {
        "min": [
          -26.713,
          -0.294,
          -30.812
        ],
        "max": [
          -17.841,
          3.744,
          -28.053
        ]
      },
      {
        "min": [
          15.326,
          -2.67,
          -5.693
        ],
        "max": [
          24.134,
          0.137,
          0.99
        ]
      },
      {
        "min": [
          -25.417,
          -2.762,
          -33.373
        ],
        "max": [
          -17.807,
          0.13,
          -30.836
        ]
      },
      {
        "min": [
          -24.584,
          -1.709,
          -15.979
        ],
        "max": [
          -17.359,
          2.691,
          -3.675
        ]
      },
      {
        "min": [
          -21.717,
          -0.294,
          -0.483
        ],
        "max": [
          -14.476,
          7.56,
          4.253
        ]
      },
      {
        "min": [
          -21.693,
          -0.294,
          4.373
        ],
        "max": [
          -15.905,
          6.585,
          9.683
        ]
      },
      {
        "min": [
          -23.797,
          -0.294,
          -0.643
        ],
        "max": [
          -21.949,
          4.209,
          8.34
        ]
      },
      {
        "min": [
          -26.295,
          -2.163,
          -0.671
        ],
        "max": [
          -23.889,
          0.482,
          6.96
        ]
      },
      {
        "min": [
          -36.534,
          -2.283,
          -2.437
        ],
        "max": [
          -32.589,
          1.46,
          1.599
        ]
      },
      {
        "min": [
          13.572,
          -2.67,
          -5.392
        ],
        "max": [
          14.406,
          0.137,
          -4.181
        ]
      }
    ]
  },
  "level42": {
    "id": "level42",
    "fog": {
      "enabled": true,
      "near": 51,
      "far": 305,
      "r": 0.749,
      "g": 0.875,
      "b": 0.957
    },
    "sunDirection": [
      0.8,
      0.77,
      -0.71
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -2.047,
          -3.526,
          -2.018
        ],
        "max": [
          2.047,
          4.58,
          2.018
        ]
      },
      {
        "min": [
          -13.158,
          -3.89,
          -21.009
        ],
        "max": [
          3.899,
          18.821,
          -11.491
        ]
      },
      {
        "min": [
          -26.624,
          -3.89,
          -18.656
        ],
        "max": [
          -12.032,
          18.821,
          -7.72
        ]
      },
      {
        "min": [
          -27.84,
          -3.89,
          -8.933
        ],
        "max": [
          -15.93,
          18.821,
          8.976
        ]
      },
      {
        "min": [
          -23.415,
          -3.89,
          6.326
        ],
        "max": [
          -15.93,
          18.821,
          13.355
        ]
      },
      {
        "min": [
          -30.633,
          -3.89,
          -8.933
        ],
        "max": [
          -22.931,
          18.821,
          -2.876
        ]
      },
      {
        "min": [
          -26.691,
          -3.89,
          -21.181
        ],
        "max": [
          -19.675,
          18.821,
          -15.124
        ]
      },
      {
        "min": [
          -12.621,
          -3.89,
          -16.112
        ],
        "max": [
          -0.2,
          18.821,
          -10.054
        ]
      },
      {
        "min": [
          14.288,
          -3.89,
          -11.15
        ],
        "max": [
          26.313,
          18.821,
          21.26
        ]
      },
      {
        "min": [
          0.896,
          -3.89,
          9.523
        ],
        "max": [
          14.449,
          18.821,
          21.055
        ]
      },
      {
        "min": [
          -3.353,
          -3.89,
          12.576
        ],
        "max": [
          9.184,
          18.821,
          21.055
        ]
      },
      {
        "min": [
          15.687,
          -3.89,
          -13.914
        ],
        "max": [
          26.019,
          18.821,
          -5.29
        ]
      },
      {
        "min": [
          19.458,
          -3.89,
          -6.042
        ],
        "max": [
          29.675,
          18.821,
          -0.06
        ]
      },
      {
        "min": [
          -50.339,
          -5.964,
          -66.22
        ],
        "max": [
          47.692,
          64.402,
          -39.91
        ]
      },
      {
        "min": [
          -50.339,
          -5.964,
          39.822
        ],
        "max": [
          47.692,
          64.402,
          61.911
        ]
      },
      {
        "min": [
          -63.718,
          -5.964,
          -75.152
        ],
        "max": [
          -45.031,
          64.402,
          69.392
        ]
      },
      {
        "min": [
          45.418,
          -5.964,
          -75.152
        ],
        "max": [
          66.647,
          64.402,
          69.392
        ]
      },
      {
        "min": [
          -50.339,
          -17.758,
          -66.22
        ],
        "max": [
          47.692,
          -0.717,
          53.233
        ]
      },
      {
        "min": [
          -50.339,
          64.065,
          -66.22
        ],
        "max": [
          47.692,
          81.106,
          53.233
        ]
      },
      {
        "min": [
          35.142,
          -21.229,
          -47.898
        ],
        "max": [
          45.758,
          1.482,
          -22.45
        ]
      },
      {
        "min": [
          35.077,
          -1.366,
          -45.905
        ],
        "max": [
          52.134,
          1.383,
          -19.637
        ]
      },
      {
        "min": [
          35.077,
          -1.461,
          19.696
        ],
        "max": [
          52.134,
          1.288,
          45.964
        ]
      },
      {
        "min": [
          -52.096,
          -1.433,
          19.138
        ],
        "max": [
          -35.038,
          1.09,
          45.406
        ]
      },
      {
        "min": [
          -52.148,
          -1.487,
          -44.812
        ],
        "max": [
          -35.091,
          1.262,
          -18.544
        ]
      }
    ]
  },
  "level43": {
    "id": "level43",
    "fog": {
      "enabled": true,
      "near": 0,
      "far": 500,
      "r": 0,
      "g": 0.271,
      "b": 0.271
    },
    "sunDirection": [
      0.8,
      0.77,
      -0.71
    ],
    "ambienceAudio": "go/ambience_2d/castle",
    "deadAABBs": [
      {
        "min": [
          -187.091,
          -69.573,
          -126.847
        ],
        "max": [
          24.25,
          -1.343,
          116.086
        ]
      },
      {
        "min": [
          -12.076,
          -16.589,
          12.032
        ],
        "max": [
          23.884,
          89.091,
          66.615
        ]
      },
      {
        "min": [
          -146.264,
          -16.589,
          27.175
        ],
        "max": [
          -54.834,
          89.091,
          81.758
        ]
      },
      {
        "min": [
          -63.57,
          -16.589,
          57.213
        ],
        "max": [
          -12.019,
          89.091,
          111.796
        ]
      },
      {
        "min": [
          -11.942,
          -16.589,
          -65.151
        ],
        "max": [
          24.019,
          89.091,
          -10.568
        ]
      },
      {
        "min": [
          -75.005,
          -16.589,
          -103.408
        ],
        "max": [
          -28.059,
          89.091,
          -48.825
        ]
      },
      {
        "min": [
          -52.341,
          -16.589,
          -98.25
        ],
        "max": [
          -10.622,
          89.091,
          -43.667
        ]
      },
      {
        "min": [
          -91.505,
          -16.589,
          -121.54
        ],
        "max": [
          -55.545,
          89.091,
          -66.957
        ]
      },
      {
        "min": [
          -119.103,
          -16.589,
          -101.346
        ],
        "max": [
          -83.143,
          89.091,
          -46.763
        ]
      },
      {
        "min": [
          -123.449,
          -16.589,
          -87.188
        ],
        "max": [
          -87.488,
          89.091,
          -32.605
        ]
      },
      {
        "min": [
          -124.229,
          9.676,
          -55.534
        ],
        "max": [
          -88.268,
          89.091,
          -0.951
        ]
      },
      {
        "min": [
          -156.649,
          -16.589,
          -57.952
        ],
        "max": [
          -120.689,
          89.091,
          33.841
        ]
      },
      {
        "min": [
          16.654,
          -16.589,
          -19.948
        ],
        "max": [
          27.625,
          89.091,
          17.476
        ]
      },
      {
        "min": [
          -137.401,
          -50.571,
          -12.325
        ],
        "max": [
          -101.44,
          19.206,
          19.863
        ]
      },
      {
        "min": [
          -77.183,
          -16.559,
          18.574
        ],
        "max": [
          -56.283,
          18.151,
          32.226
        ]
      },
      {
        "min": [
          -81.674,
          18.068,
          -1.835
        ],
        "max": [
          -77.311,
          89.091,
          8.677
        ]
      },
      {
        "min": [
          -80.045,
          9.399,
          -20.483
        ],
        "max": [
          -77.226,
          89.091,
          -1.735
        ]
      },
      {
        "min": [
          -187.091,
          81.994,
          -126.847
        ],
        "max": [
          24.25,
          111.492,
          116.086
        ]
      },
      {
        "min": [
          -80.613,
          -18.751,
          16.937
        ],
        "max": [
          -76.929,
          89.091,
          20.084
        ]
      },
      {
        "min": [
          -40.762,
          -18.751,
          16.862
        ],
        "max": [
          -36.514,
          89.091,
          21.079
        ]
      },
      {
        "min": [
          -40.762,
          -18.751,
          -21.054
        ],
        "max": [
          -36.514,
          89.091,
          -16.837
        ]
      }
    ]
  },
  "level44": {
    "id": "level44",
    "fog": {
      "enabled": true,
      "near": 0,
      "far": 500,
      "r": 0.153,
      "g": 0.518,
      "b": 0.655
    },
    "sunDirection": [
      0.8,
      0.77,
      -0.71
    ],
    "ambienceAudio": "go/ambience_2d/castle",
    "deadAABBs": [
      {
        "min": [
          55.335,
          -15.667,
          -20.568
        ],
        "max": [
          101.169,
          116.325,
          62.903
        ]
      },
      {
        "min": [
          -116.68,
          -15.667,
          -14.005
        ],
        "max": [
          -75.052,
          116.325,
          43.939
        ]
      },
      {
        "min": [
          -136.023,
          -15.667,
          -97.509
        ],
        "max": [
          -94.395,
          116.325,
          -0.654
        ]
      },
      {
        "min": [
          -110.119,
          -15.667,
          -1.949
        ],
        "max": [
          -68.491,
          116.325,
          55.995
        ]
      },
      {
        "min": [
          -97.902,
          -15.667,
          7.816
        ],
        "max": [
          -56.274,
          116.325,
          65.76
        ]
      },
      {
        "min": [
          -122.224,
          -15.667,
          -123.181
        ],
        "max": [
          -80.596,
          116.325,
          -65.237
        ]
      },
      {
        "min": [
          -91.523,
          -15.667,
          29.65
        ],
        "max": [
          -49.895,
          116.325,
          87.594
        ]
      },
      {
        "min": [
          -13.494,
          28.193,
          -24.27
        ],
        "max": [
          21.419,
          119.338,
          9.865
        ]
      },
      {
        "min": [
          41.473,
          -15.667,
          -128.325
        ],
        "max": [
          83.101,
          116.325,
          -70.381
        ]
      },
      {
        "min": [
          45.633,
          -15.667,
          -31.549
        ],
        "max": [
          133.07,
          116.325,
          -4.308
        ]
      },
      {
        "min": [
          -121.112,
          -15.667,
          -30.049
        ],
        "max": [
          -79.484,
          116.325,
          27.895
        ]
      },
      {
        "min": [
          -127.243,
          -15.667,
          -40.578
        ],
        "max": [
          -85.615,
          116.325,
          17.366
        ]
      },
      {
        "min": [
          -101.791,
          -15.667,
          -138.406
        ],
        "max": [
          -8.92,
          116.325,
          -80.462
        ]
      },
      {
        "min": [
          -36.998,
          -15.667,
          -142.73
        ],
        "max": [
          4.63,
          116.325,
          -84.786
        ]
      },
      {
        "min": [
          34.298,
          -15.667,
          -139.182
        ],
        "max": [
          75.926,
          116.325,
          -81.238
        ]
      },
      {
        "min": [
          -16.422,
          -15.667,
          -151.687
        ],
        "max": [
          44.239,
          116.325,
          -93.743
        ]
      },
      {
        "min": [
          -25.651,
          -15.667,
          -146.212
        ],
        "max": [
          15.977,
          116.325,
          -88.268
        ]
      },
      {
        "min": [
          0.273,
          7.09,
          -8.132
        ],
        "max": [
          4.624,
          28.539,
          -3.879
        ]
      },
      {
        "min": [
          -8.062,
          25.512,
          -16.283
        ],
        "max": [
          12.842,
          33.572,
          4.155
        ]
      },
      {
        "min": [
          -80.265,
          -15.667,
          43.047
        ],
        "max": [
          -38.637,
          116.325,
          100.991
        ]
      },
      {
        "min": [
          -71.057,
          -15.667,
          55.111
        ],
        "max": [
          -29.429,
          116.325,
          113.055
        ]
      },
      {
        "min": [
          49.544,
          -15.667,
          13.854
        ],
        "max": [
          95.378,
          116.325,
          89.669
        ]
      },
      {
        "min": [
          -64.09,
          -15.667,
          64.008
        ],
        "max": [
          -22.462,
          116.325,
          121.952
        ]
      },
      {
        "min": [
          -58.674,
          -15.667,
          71.276
        ],
        "max": [
          -17.046,
          116.325,
          129.22
        ]
      },
      {
        "min": [
          -26.914,
          -15.667,
          78.622
        ],
        "max": [
          58.357,
          116.325,
          136.566
        ]
      }
    ]
  },
  "level45": {
    "id": "level45",
    "fog": {
      "enabled": true,
      "near": 0,
      "far": 1375,
      "r": 0.771,
      "g": 0.876,
      "b": 0.938
    },
    "sunDirection": [
      0.8,
      0.77,
      -0.71
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          18.568,
          -31.057,
          -47.81
        ],
        "max": [
          37.889,
          92.88,
          -28.889
        ]
      },
      {
        "min": [
          -10.646,
          -31.057,
          -41.998
        ],
        "max": [
          8.675,
          92.88,
          -23.077
        ]
      },
      {
        "min": [
          4.667,
          -31.057,
          -50.163
        ],
        "max": [
          23.987,
          92.88,
          -31.242
        ]
      },
      {
        "min": [
          36.795,
          -31.057,
          -48.542
        ],
        "max": [
          56.115,
          92.88,
          -29.621
        ]
      },
      {
        "min": [
          -7.501,
          -31.057,
          -49.226
        ],
        "max": [
          11.819,
          92.88,
          -30.305
        ]
      },
      {
        "min": [
          24.938,
          -31.057,
          -46.667
        ],
        "max": [
          44.258,
          92.88,
          -27.746
        ]
      },
      {
        "min": [
          32.137,
          -31.057,
          -38.972
        ],
        "max": [
          42.404,
          92.88,
          -20.051
        ]
      },
      {
        "min": [
          27.927,
          -31.057,
          -41.956
        ],
        "max": [
          39.063,
          92.88,
          -23.035
        ]
      },
      {
        "min": [
          20.106,
          -31.057,
          -46.994
        ],
        "max": [
          39.426,
          92.88,
          -28.073
        ]
      },
      {
        "min": [
          52.397,
          -31.057,
          -39.577
        ],
        "max": [
          71.717,
          92.88,
          -20.656
        ]
      },
      {
        "min": [
          -1.587,
          -31.057,
          -40.559
        ],
        "max": [
          4.598,
          92.88,
          -21.638
        ]
      },
      {
        "min": [
          -28.665,
          -31.057,
          -32.024
        ],
        "max": [
          -9.345,
          92.88,
          -13.103
        ]
      },
      {
        "min": [
          26.561,
          -31.057,
          -43.034
        ],
        "max": [
          33.968,
          92.88,
          -24.113
        ]
      },
      {
        "min": [
          22.37,
          -31.057,
          -45.921
        ],
        "max": [
          29.777,
          92.88,
          -27
        ]
      },
      {
        "min": [
          23.919,
          -31.057,
          -45.222
        ],
        "max": [
          31.326,
          92.88,
          -26.301
        ]
      },
      {
        "min": [
          25.63,
          -31.057,
          -44
        ],
        "max": [
          33.037,
          92.88,
          -25.079
        ]
      },
      {
        "min": [
          -24.472,
          -31.057,
          -40.178
        ],
        "max": [
          -5.152,
          92.88,
          -21.257
        ]
      },
      {
        "min": [
          -26.501,
          -31.057,
          -35.664
        ],
        "max": [
          -7.18,
          92.88,
          -16.743
        ]
      },
      {
        "min": [
          -31.451,
          -31.057,
          -26.842
        ],
        "max": [
          -12.131,
          92.88,
          -7.921
        ]
      },
      {
        "min": [
          -27.484,
          -31.057,
          -33.586
        ],
        "max": [
          -8.163,
          92.88,
          -14.665
        ]
      },
      {
        "min": [
          -25.494,
          -31.057,
          -37.857
        ],
        "max": [
          -6.174,
          92.88,
          -18.936
        ]
      },
      {
        "min": [
          56.064,
          -31.057,
          -23.49
        ],
        "max": [
          75.384,
          92.88,
          -1.219
        ]
      },
      {
        "min": [
          59.496,
          -31.057,
          -16.752
        ],
        "max": [
          78.817,
          92.88,
          5.519
        ]
      },
      {
        "min": [
          60.155,
          -31.057,
          5.04
        ],
        "max": [
          81.133,
          92.88,
          19.342
        ]
      },
      {
        "min": [
          -45.469,
          -31.057,
          -11.251
        ],
        "max": [
          -26.149,
          92.88,
          7.67
        ]
      }
    ]
  },
  "level46": {
    "id": "level46",
    "fog": {
      "enabled": true,
      "near": 0,
      "far": 1375,
      "r": 0.771,
      "g": 0.876,
      "b": 0.938
    },
    "sunDirection": [
      0.8,
      0.77,
      -0.71
    ],
    "ambienceAudio": "go/ambience_2d/castle",
    "deadAABBs": []
  },
  "level47": {
    "id": "level47",
    "fog": {
      "enabled": true,
      "near": 0,
      "far": 1375,
      "r": 0.771,
      "g": 0.876,
      "b": 0.938
    },
    "sunDirection": [
      0.8,
      0.77,
      -0.71
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": []
  },
  "level48": {
    "id": "level48",
    "fog": {
      "enabled": true,
      "near": 0,
      "far": 1375,
      "r": 0.771,
      "g": 0.876,
      "b": 0.938
    },
    "sunDirection": [
      0.8,
      0.77,
      -0.71
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": []
  },
  "level49": {
    "id": "level49",
    "fog": null,
    "sunDirection": [
      0.17,
      0.5,
      0.45
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -6.324,
          -6.585,
          -0.762
        ],
        "max": [
          3.968,
          59.806,
          8.495
        ]
      },
      {
        "min": [
          -12.856,
          -6.585,
          -16.079
        ],
        "max": [
          -6.011,
          58.735,
          -10.207
        ]
      },
      {
        "min": [
          -22.418,
          -7.826,
          2.371
        ],
        "max": [
          -16.705,
          1.68,
          5.038
        ]
      },
      {
        "min": [
          -48.039,
          -8.439,
          -6.448
        ],
        "max": [
          -27.062,
          59.891,
          8.791
        ]
      },
      {
        "min": [
          -39.637,
          -7.016,
          -14.372
        ],
        "max": [
          -5.864,
          59.471,
          6.27
        ]
      },
      {
        "min": [
          -53.061,
          -8.865,
          -18.974
        ],
        "max": [
          -48.608,
          5.255,
          -14.389
        ]
      },
      {
        "min": [
          -40.64,
          -4.628,
          17.943
        ],
        "max": [
          -25.775,
          58.643,
          29.709
        ]
      },
      {
        "min": [
          -42.716,
          -4.628,
          17.823
        ],
        "max": [
          -23.487,
          58.643,
          24.173
        ]
      },
      {
        "min": [
          12.546,
          -6.585,
          1.804
        ],
        "max": [
          20.979,
          59.889,
          8.526
        ]
      },
      {
        "min": [
          12.551,
          -6.013,
          -12.639
        ],
        "max": [
          23.268,
          59.886,
          6.128
        ]
      },
      {
        "min": [
          5.864,
          -3.095,
          -22.102
        ],
        "max": [
          18.025,
          59.204,
          -11.527
        ]
      },
      {
        "min": [
          2.966,
          -3.095,
          -20.226
        ],
        "max": [
          14.84,
          59.348,
          -12.066
        ]
      },
      {
        "min": [
          12.558,
          -3.095,
          -25.2
        ],
        "max": [
          17.332,
          59.902,
          -22.077
        ]
      },
      {
        "min": [
          12.016,
          -3.095,
          -40.23
        ],
        "max": [
          19.719,
          60.423,
          -30.921
        ]
      },
      {
        "min": [
          -11.011,
          -3.095,
          -58.288
        ],
        "max": [
          -1.064,
          59.59,
          -22.959
        ]
      },
      {
        "min": [
          11.896,
          -6.013,
          17.504
        ],
        "max": [
          21.457,
          59.886,
          30.861
        ]
      },
      {
        "min": [
          13.626,
          -6.013,
          26.552
        ],
        "max": [
          23.186,
          59.886,
          30.861
        ]
      },
      {
        "min": [
          -13.356,
          -6.013,
          24.494
        ],
        "max": [
          4.397,
          59.886,
          38.937
        ]
      },
      {
        "min": [
          -29.803,
          -8.296,
          -42.337
        ],
        "max": [
          -19.193,
          59.471,
          -36.292
        ]
      },
      {
        "min": [
          -30.741,
          -8.154,
          -39.112
        ],
        "max": [
          -20.13,
          59.471,
          -36.505
        ]
      },
      {
        "min": [
          -48.852,
          -7.87,
          -46.017
        ],
        "max": [
          -37.864,
          59.471,
          -29.954
        ]
      },
      {
        "min": [
          -45.415,
          -8.581,
          -36.981
        ],
        "max": [
          -34.765,
          59.471,
          -29.954
        ]
      },
      {
        "min": [
          -32.396,
          -8.52,
          -74.397
        ],
        "max": [
          1.377,
          66.666,
          -53.755
        ]
      },
      {
        "min": [
          -87.777,
          -8.52,
          -77.666
        ],
        "max": [
          -28.999,
          66.666,
          -57.024
        ]
      },
      {
        "min": [
          -10.855,
          -8.52,
          -54.908
        ],
        "max": [
          22.918,
          66.666,
          -34.266
        ]
      }
    ]
  },
  "level5": {
    "id": "level5",
    "fog": {
      "enabled": true,
      "near": 0,
      "far": 500,
      "r": 0.764,
      "g": 0.702,
      "b": 0.562
    },
    "sunDirection": [
      -0.55,
      0.71,
      0.62
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -9.312,
          -4.752,
          -12.004
        ],
        "max": [
          -0.014,
          3.022,
          -4.295
        ]
      },
      {
        "min": [
          -20.106,
          -4.752,
          -14.571
        ],
        "max": [
          -14.624,
          7.17,
          -4.443
        ]
      },
      {
        "min": [
          -20.106,
          -10.122,
          -19.339
        ],
        "max": [
          -17.746,
          1.8,
          -14.029
        ]
      },
      {
        "min": [
          -24.979,
          -4.752,
          2.217
        ],
        "max": [
          -18.478,
          2.416,
          8.416
        ]
      },
      {
        "min": [
          -26.938,
          -4.752,
          11.638
        ],
        "max": [
          -23.575,
          2.416,
          16.541
        ]
      },
      {
        "min": [
          -11.298,
          -4.752,
          2.405
        ],
        "max": [
          -6.876,
          2.416,
          6.981
        ]
      },
      {
        "min": [
          -14.862,
          -4.752,
          11.073
        ],
        "max": [
          -8.978,
          2.416,
          14.402
        ]
      },
      {
        "min": [
          1.291,
          -4.752,
          4.501
        ],
        "max": [
          9.474,
          5.012,
          11.671
        ]
      },
      {
        "min": [
          -0.505,
          -4.752,
          5.6
        ],
        "max": [
          1.803,
          2.771,
          11.391
        ]
      },
      {
        "min": [
          14.758,
          -4.752,
          5.091
        ],
        "max": [
          20.534,
          7.17,
          13.565
        ]
      },
      {
        "min": [
          17.912,
          -10.171,
          12.57
        ],
        "max": [
          20.273,
          1.751,
          17.88
        ]
      },
      {
        "min": [
          7.119,
          -4.752,
          -6.25
        ],
        "max": [
          11.438,
          2.416,
          -2.689
        ]
      },
      {
        "min": [
          9.132,
          -4.752,
          -15.978
        ],
        "max": [
          14.902,
          2.323,
          -9.663
        ]
      },
      {
        "min": [
          22.707,
          -4.752,
          -16.33
        ],
        "max": [
          27.169,
          2.323,
          -11.204
        ]
      },
      {
        "min": [
          18.745,
          -4.375,
          -7.639
        ],
        "max": [
          24.607,
          2.793,
          -4.27
        ]
      },
      {
        "min": [
          24.924,
          -4.752,
          -11.097
        ],
        "max": [
          26.629,
          1.71,
          -9.388
        ]
      },
      {
        "min": [
          0.152,
          -4.752,
          -10.184
        ],
        "max": [
          1.785,
          1.71,
          -8.476
        ]
      },
      {
        "min": [
          6.899,
          -4.752,
          -2.584
        ],
        "max": [
          8.532,
          1.71,
          -0.909
        ]
      },
      {
        "min": [
          -8.526,
          -4.752,
          0.565
        ],
        "max": [
          -6.893,
          1.71,
          2.24
        ]
      },
      {
        "min": [
          -14.239,
          -4.752,
          -9.953
        ],
        "max": [
          -12.607,
          1.71,
          -8.278
        ]
      },
      {
        "min": [
          -26.65,
          -4.752,
          9.779
        ],
        "max": [
          -25.081,
          1.71,
          11.453
        ]
      },
      {
        "min": [
          12.844,
          -4.752,
          8.286
        ],
        "max": [
          14.476,
          1.71,
          9.961
        ]
      },
      {
        "min": [
          2.007,
          -8.002,
          -37.059
        ],
        "max": [
          9.822,
          37.467,
          -21.95
        ]
      },
      {
        "min": [
          -17.509,
          -8.002,
          -42.87
        ],
        "max": [
          2.418,
          37.467,
          -27.76
        ]
      },
      {
        "min": [
          -33.161,
          -8.002,
          -39.193
        ],
        "max": [
          -15.917,
          37.467,
          -24.084
        ]
      }
    ]
  },
  "level50": {
    "id": "level50",
    "fog": {
      "enabled": true,
      "near": 100,
      "far": 500,
      "r": 0.543,
      "g": 0.373,
      "b": 0.574
    },
    "sunDirection": [
      1,
      1,
      0.25
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          -2906.73,
          -899.911,
          -1036.406
        ],
        "max": [
          -2654.73,
          7820.742,
          -663.358
        ]
      },
      {
        "min": [
          -2575.438,
          -899.911,
          3726.134
        ],
        "max": [
          3068.388,
          7820.742,
          9122.99
        ]
      },
      {
        "min": [
          2317.232,
          -899.911,
          -382.061
        ],
        "max": [
          7961.058,
          7820.742,
          5014.795
        ]
      },
      {
        "min": [
          5927.552,
          -899.911,
          -5641.186
        ],
        "max": [
          10613.363,
          7820.742,
          490.351
        ]
      },
      {
        "min": [
          -1307.288,
          -899.911,
          -9033.912
        ],
        "max": [
          6426.804,
          7820.742,
          -3637.055
        ]
      },
      {
        "min": [
          -8791.328,
          -899.911,
          2789.994
        ],
        "max": [
          -2300.616,
          7820.742,
          8163.215
        ]
      },
      {
        "min": [
          -11104.231,
          -899.911,
          -3258.495
        ],
        "max": [
          -5832.017,
          7820.742,
          3096.21
        ]
      },
      {
        "min": [
          -9438.488,
          -899.911,
          -6125.947
        ],
        "max": [
          -4524.805,
          7820.742,
          -2666.387
        ]
      },
      {
        "min": [
          -7511.856,
          -899.911,
          -8522.55
        ],
        "max": [
          -1021.144,
          7820.742,
          -3215.965
        ]
      },
      {
        "min": [
          808.916,
          -899.911,
          -3862.989
        ],
        "max": [
          2474.971,
          7820.742,
          -3023.606
        ]
      },
      {
        "min": [
          2105.673,
          628.718,
          -3074.533
        ],
        "max": [
          2485.216,
          7820.742,
          -2021.909
        ]
      },
      {
        "min": [
          2037.797,
          628.718,
          -592.763
        ],
        "max": [
          2420.445,
          7820.742,
          -164.004
        ]
      },
      {
        "min": [
          -275.087,
          -899.911,
          3515.892
        ],
        "max": [
          267.617,
          7820.742,
          8912.748
        ]
      },
      {
        "min": [
          -1191.219,
          683.477,
          -530.393
        ],
        "max": [
          30.557,
          7820.742,
          169.078
        ]
      },
      {
        "min": [
          -1873.927,
          683.477,
          -2183.272
        ],
        "max": [
          -1028.093,
          7820.742,
          -1428.299
        ]
      },
      {
        "min": [
          -1781.793,
          683.477,
          -1474.014
        ],
        "max": [
          -1028.093,
          7820.742,
          -354.089
        ]
      },
      {
        "min": [
          -49.999,
          683.477,
          -682.441
        ],
        "max": [
          1207.831,
          7820.742,
          75.294
        ]
      },
      {
        "min": [
          806.555,
          683.477,
          -2265.639
        ],
        "max": [
          1207.831,
          7820.742,
          -660.911
        ]
      },
      {
        "min": [
          1166.937,
          683.477,
          -2269.692
        ],
        "max": [
          1568.213,
          7820.742,
          -1491.386
        ]
      },
      {
        "min": [
          989.163,
          683.477,
          -421.735
        ],
        "max": [
          1390.439,
          7820.742,
          114.167
        ]
      },
      {
        "min": [
          -2238.448,
          683.477,
          1350.656
        ],
        "max": [
          -1016.673,
          7820.742,
          1982.717
        ]
      },
      {
        "min": [
          -3665.987,
          683.477,
          1331.589
        ],
        "max": [
          -2194.278,
          7820.742,
          1943.5
        ]
      },
      {
        "min": [
          -3360.962,
          683.477,
          843.528
        ],
        "max": [
          -2605.404,
          7820.742,
          1440.851
        ]
      },
      {
        "min": [
          -2508.776,
          657.08,
          -2712.325
        ],
        "max": [
          -2182.793,
          985.527,
          -2381.535
        ]
      },
      {
        "min": [
          -1365.663,
          -899.911,
          -8235.409
        ],
        "max": [
          -1031.912,
          7820.742,
          -2853.01
        ]
      }
    ]
  },
  "level7": {
    "id": "level7",
    "fog": {
      "enabled": true,
      "near": 80,
      "far": 266,
      "r": 0.773,
      "g": 0.526,
      "b": 0.482
    },
    "sunDirection": [
      -0.1,
      0.15,
      -0.3
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          57.88,
          2.001,
          -3.024
        ],
        "max": [
          64.386,
          7.898,
          5.844
        ]
      },
      {
        "min": [
          64.003,
          -0.027,
          -0.536
        ],
        "max": [
          67.763,
          3.609,
          4.994
        ]
      },
      {
        "min": [
          63.306,
          -0.923,
          -2.998
        ],
        "max": [
          67.066,
          2.713,
          2.533
        ]
      },
      {
        "min": [
          51.617,
          0.371,
          -13.151
        ],
        "max": [
          57.117,
          10.251,
          -10.901
        ]
      },
      {
        "min": [
          57.211,
          0.419,
          -14.715
        ],
        "max": [
          62.278,
          10.251,
          -12.288
        ]
      },
      {
        "min": [
          -59.572,
          2.232,
          -8.878
        ],
        "max": [
          -56.894,
          7.201,
          -6.056
        ]
      },
      {
        "min": [
          42.291,
          2.001,
          13.995
        ],
        "max": [
          53.18,
          12.077,
          19.207
        ]
      },
      {
        "min": [
          42.383,
          2.001,
          15.707
        ],
        "max": [
          47.387,
          12.077,
          20.436
        ]
      },
      {
        "min": [
          48.016,
          2.001,
          13.008
        ],
        "max": [
          53.021,
          12.077,
          17.736
        ]
      },
      {
        "min": [
          14.278,
          2.001,
          16.661
        ],
        "max": [
          23.099,
          10.72,
          21.2
        ]
      },
      {
        "min": [
          32.444,
          2.001,
          -5.802
        ],
        "max": [
          38.116,
          9.429,
          -1.666
        ]
      },
      {
        "min": [
          8.119,
          2.001,
          -3.588
        ],
        "max": [
          16.569,
          10.72,
          0.293
        ]
      },
      {
        "min": [
          -4.55,
          2.001,
          13.637
        ],
        "max": [
          4.31,
          10.72,
          21.41
        ]
      },
      {
        "min": [
          -4.702,
          1.404,
          20.895
        ],
        "max": [
          -0.239,
          9.059,
          24.008
        ]
      },
      {
        "min": [
          -1.482,
          0.28,
          20.895
        ],
        "max": [
          2.98,
          7.935,
          24.008
        ]
      },
      {
        "min": [
          4.233,
          2.001,
          13.597
        ],
        "max": [
          5.748,
          10.72,
          19.441
        ]
      },
      {
        "min": [
          -16.865,
          2.722,
          -3.44
        ],
        "max": [
          -8.129,
          10.505,
          0.803
        ]
      },
      {
        "min": [
          -29.375,
          2.722,
          16.066
        ],
        "max": [
          -23.344,
          10.505,
          20.809
        ]
      },
      {
        "min": [
          -42.515,
          0.551,
          -5.924
        ],
        "max": [
          -37.48,
          8.334,
          -3.91
        ]
      },
      {
        "min": [
          -39.351,
          0.551,
          -5.877
        ],
        "max": [
          -37.546,
          8.334,
          -2.972
        ]
      },
      {
        "min": [
          -42.54,
          0.551,
          -6.698
        ],
        "max": [
          -40.756,
          8.334,
          -3.754
        ]
      },
      {
        "min": [
          -52.801,
          1.573,
          15.383
        ],
        "max": [
          -46.103,
          9.356,
          17.642
        ]
      },
      {
        "min": [
          -57.084,
          1.573,
          14.389
        ],
        "max": [
          -50.387,
          9.356,
          16.657
        ]
      },
      {
        "min": [
          -65.049,
          -0.828,
          -9.35
        ],
        "max": [
          -58.598,
          7.891,
          -1.881
        ]
      },
      {
        "min": [
          -66.387,
          -1.094,
          -4.261
        ],
        "max": [
          -60.517,
          4.559,
          3.433
        ]
      }
    ]
  },
  "level8": {
    "id": "level8",
    "fog": {
      "enabled": true,
      "near": 0,
      "far": 482.3,
      "r": 0.941,
      "g": 1,
      "b": 0.858
    },
    "sunDirection": [
      -0.35,
      0.3,
      -0.3
    ],
    "ambienceAudio": "go/ambience_2d/ambience_day",
    "deadAABBs": [
      {
        "min": [
          3.818,
          -4.645,
          -29.028
        ],
        "max": [
          11.021,
          4.645,
          -20.793
        ]
      },
      {
        "min": [
          4.95,
          -4.645,
          -21.127
        ],
        "max": [
          10.81,
          2.599,
          -18.972
        ]
      },
      {
        "min": [
          -10.075,
          -2.927,
          -23.697
        ],
        "max": [
          -4.431,
          2.183,
          -17.471
        ]
      },
      {
        "min": [
          -10.739,
          -2.927,
          -14.073
        ],
        "max": [
          -4.906,
          6.275,
          -5.668
        ]
      },
      {
        "min": [
          -15.193,
          -2.927,
          -14.073
        ],
        "max": [
          -9.389,
          1.651,
          -11.728
        ]
      },
      {
        "min": [
          8.007,
          -2.927,
          -13.857
        ],
        "max": [
          18.205,
          6.275,
          -8.313
        ]
      },
      {
        "min": [
          17.801,
          -2.927,
          -13.749
        ],
        "max": [
          19.206,
          2.602,
          -11.605
        ]
      },
      {
        "min": [
          5.943,
          -2.927,
          -11.974
        ],
        "max": [
          8.358,
          1.208,
          -8.313
        ]
      },
      {
        "min": [
          4.878,
          -2.927,
          5.641
        ],
        "max": [
          10.711,
          6.275,
          14.046
        ]
      },
      {
        "min": [
          9.41,
          -2.927,
          11.724
        ],
        "max": [
          15.215,
          1.651,
          14.069
        ]
      },
      {
        "min": [
          -18.208,
          -2.927,
          8.333
        ],
        "max": [
          -8.01,
          6.275,
          13.837
        ]
      },
      {
        "min": [
          -8.367,
          -2.927,
          8.28
        ],
        "max": [
          -5.952,
          1.208,
          11.94
        ]
      },
      {
        "min": [
          -19.182,
          -2.927,
          11.648
        ],
        "max": [
          -17.777,
          2.602,
          13.792
        ]
      },
      {
        "min": [
          -11.032,
          -4.645,
          20.805
        ],
        "max": [
          -3.83,
          4.645,
          29.04
        ]
      },
      {
        "min": [
          -10.784,
          -4.645,
          18.99
        ],
        "max": [
          -4.924,
          2.599,
          21.144
        ]
      },
      {
        "min": [
          4.412,
          -2.927,
          17.506
        ],
        "max": [
          10.057,
          2.183,
          23.732
        ]
      },
      {
        "min": [
          -0.666,
          -3.04,
          -0.728
        ],
        "max": [
          0.623,
          2.07,
          0.702
        ]
      },
      {
        "min": [
          -1.59,
          -0.446,
          -1.753
        ],
        "max": [
          1.547,
          0.852,
          1.727
        ]
      },
      {
        "min": [
          -40.756,
          -66.999,
          -54.608
        ],
        "max": [
          -22.251,
          189.121,
          -13.181
        ]
      },
      {
        "min": [
          -46.696,
          -66.999,
          -6.335
        ],
        "max": [
          -28.191,
          189.121,
          3.911
        ]
      },
      {
        "min": [
          -42.258,
          -66.999,
          3.507
        ],
        "max": [
          -23.754,
          189.121,
          24.187
        ]
      },
      {
        "min": [
          -41.146,
          -66.999,
          20.45
        ],
        "max": [
          -17.829,
          189.121,
          39.309
        ]
      },
      {
        "min": [
          -42.278,
          -66.999,
          36.679
        ],
        "max": [
          3.023,
          189.121,
          52.707
        ]
      },
      {
        "min": [
          19.027,
          -66.999,
          20.22
        ],
        "max": [
          49.216,
          189.121,
          41.022
        ]
      },
      {
        "min": [
          0.781,
          -66.999,
          40.172
        ],
        "max": [
          46.081,
          189.121,
          56.2
        ]
      }
    ]
  }
};
