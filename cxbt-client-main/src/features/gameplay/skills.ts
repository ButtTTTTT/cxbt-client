import type { CreationAttachment, CreationWeapon } from '../characterCreation/assets';
import type { InventoryItem } from '../lobby/assets';
import type { Skill } from '../lobby/skills';
import { BATTLE_QUICK_KEYS } from './hud';

/** Numeric skill parameters parsed from the lobby skill panel's level text. */
export type SkillParams = Record<string, number>;

export type LoadedSkill = {
  skill: Skill;
  level: number;
  params: SkillParams;
  active: boolean;
  cooldown: number;
};

/** Field aliases: Chinese label in skills.json -> runtime parameter name. */
const LABELS: [string, string][] = [
  ['单次治疗量', 'healPerTick'], ['治疗总量', 'healTotal'], ['治疗效果提升', 'healBuff'],
  ['高速奔跑持续时间', 'sprintDuration'], ['“唤醒”治疗量', 'regenPerTick'], ['"唤醒"治疗量', 'regenPerTick'],
  ['被察觉距离', 'detectRange'], ['瘟疫单次伤害', 'plagueDamage'], ['产生瘟疫概率', 'plagueChance'],
  ['单次储存能量', 'storeEnergy'], ['伤害减免', 'damageReduction'], ['抵抗毒伤', 'poisonResist'],
  ['暴击伤害提高', 'critDamage'], ['暴击率提高', 'critChance'], ['生命上限提升', 'maxHealthPct'],
  ['傀儡产生概率', 'puppetChance'], ['傀儡生命回收率', 'puppetRecover'], ['抽取生命量', 'lifesteal'],
  ['释放伤害', 'releaseDamage'], ['精准度下降', 'spread'], ['射速提高', 'fireRate'],
  ['中毒概率', 'gasPoisonChance'], ['单次伤害', 'gasDamage'], ['中毒率', 'poisonChance'],
  ['虚弱几率', 'weakChance'], ['伤害半径', 'damageRadius'], ['触发半径', 'triggerRadius'],
  ['传播范围', 'plagueRadius'], ['有效半径', 'radius'], ['有效范围', 'radius'],
  ['冷却时间', 'cooldown'], ['持续时间', 'duration'], ['治疗量', 'heal'],
  ['防御量', 'shield'], ['箭矢数', 'arrows'], ['消耗量', 'selfCost'],
  ['速度提高到', 'speed'], ['奔跑速度提高到', 'runSpeed'], ['伤害量', 'dotDamage'],
  ['伤害', 'damage'], ['能量', 'energy'],
];
const ORDERED = [...LABELS].sort((a, b) => b[0].length - a[0].length);

/** Level strings look like `治疗量：600点生命值。` or `伤害量：每2秒80点伤害。` */
export function parseSkillLevel(text: string | null | undefined): SkillParams {
  const params: SkillParams = {};
  if (!text) return params;
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*(.+?)\s*[：:]\s*(.+?)\s*[。.]?\s*$/);
    if (!match) continue;
    const label = match[1].trim();
    const field = ORDERED.find(([name]) => name === label)?.[1];
    if (!field) continue;
    const body = match[2].replace(/^每\s*\d+\s*秒/, '');
    const value = Number((body.match(/-?\d+(?:\.\d+)?/) ?? [''])[0]);
    if (Number.isFinite(value)) params[field] = value;
  }
  return params;
}

/** The cached game_text.lua ships no level text for the biochemist skills, so their
 * original numbers from text_table.json (`tips_abilities_*_b1`) stand in for level 1. */
const CACHED_LEVEL_TEXT: Record<string, SkillParams> = {
  conduction: { healBuff: 45, selfCost: 10, heal: 80, cooldown: 10 },
  suckblood: { lifesteal: 18, puppetChance: 26, puppetRecover: 10 },
  plague: { plagueChance: 15, plagueDamage: 80, plagueRadius: 5 },
  gasbomb: { gasDamage: 100, gasPoisonChance: 20 },
  overreaction: { runSpeed: 6, maxHealthPct: 32, duration: 8, cooldown: 30 },
};

export function loadSkills(skills: Skill[], levels: number[]): LoadedSkill[] {
  return skills.map((skill, index) => {
    const level = Math.max(0, levels[index] ?? 0);
    const params = parseSkillLevel(skill.levels[level - 1]);
    for (const [field, value] of Object.entries(CACHED_LEVEL_TEXT[skill.id] ?? {})) {
      if (params[field] === undefined) params[field] = value;
    }
    return { skill, level, params, active: skill.kind === 'active', cooldown: params.cooldown ?? 20 };
  });
}

export type PassiveModifiers = {
  fireRate: number; spread: number; critChance: number; critDamage: number;
  damageReduction: number; regenPerTick: number; storeEnergy: number; releaseDamage: number;
  releaseRadius: number; poisonChance: number; dotDamage: number; poisonResist: number;
  lifesteal: number; puppetChance: number; puppetRecover: number;
  plagueChance: number; plagueDamage: number; plagueRadius: number;
  gasDamage: number; gasPoisonChance: number; weakChance: number; weakDuration: number;
};

export function passiveModifiers(loads: LoadedSkill[]): PassiveModifiers {
  const base: PassiveModifiers = { fireRate: 0, spread: 0, critChance: 0, critDamage: 0,
    damageReduction: 0, regenPerTick: 0, storeEnergy: 0, releaseDamage: 0, releaseRadius: 8,
    poisonChance: 0, dotDamage: 0, poisonResist: 0, lifesteal: 0, puppetChance: 0, puppetRecover: 0,
    plagueChance: 0, plagueDamage: 0, plagueRadius: 5, gasDamage: 0, gasPoisonChance: 0, weakChance: 0, weakDuration: 3 };
  for (const load of loads) {
    if (load.active || load.level <= 0) continue;
    const p = load.params;
    switch (load.skill.id) {
      case 'heropower': base.fireRate = p.fireRate ?? 0; base.spread = p.spread ?? 0; break;
      case 'tenacity': base.damageReduction = p.damageReduction ?? 0; base.regenPerTick = p.regenPerTick ?? 0; break;
      case 'transfer': base.storeEnergy = p.storeEnergy ?? 0; base.releaseDamage = p.releaseDamage ?? 0;
        base.releaseRadius = p.damageRadius ?? 8; break;
      case 'piercing': base.critChance = p.critChance ?? 0; base.critDamage = p.critDamage ?? 0; break;
      case 'vitals': base.weakChance = p.weakChance ?? 0; base.weakDuration = p.duration ?? 3; break;
      case 'poison': base.poisonChance = p.poisonChance ?? 0; base.dotDamage = p.dotDamage ?? 0;
        base.poisonResist = p.poisonResist ?? 0; break;
      case 'suckblood': base.lifesteal = p.lifesteal ?? 0; base.puppetChance = p.puppetChance ?? 0;
        base.puppetRecover = p.puppetRecover ?? 10; break;
      case 'plague': base.plagueChance = p.plagueChance ?? 0; base.plagueDamage = p.plagueDamage ?? 0;
        base.plagueRadius = p.plagueRadius ?? 5; break;
      case 'gasbomb': base.gasDamage = p.gasDamage ?? 0; base.gasPoisonChance = p.gasPoisonChance ?? 0; break;
      default: break;
    }
  }
  return base;
}


export type BattleSlot =
  | { key: string; kind: 'empty' }
  | { key: string; kind: 'weapon'; id: string; weapon: CreationWeapon; weaponIndex: number; lobbyIcon?: string; label?: string }
  | { key: string; kind: 'skill'; id: string; load: LoadedSkill }
  | { key: string; kind: 'wing'; id: string; attachment: CreationAttachment; icon: string; label: string }
  | { key: string; kind: 'item'; id: string; item: InventoryItem; icon: string; label: string };

/** Mirrors the lobby quickbar slot-for-slot so the battle hotbar carries equipped weapons, skills, wings, and items. */
export function resolveLoadout(
  quickbar: (string | null)[],
  weapons: Record<string, CreationWeapon>,
  loads: LoadedSkill[],
  attachments?: Record<string, CreationAttachment>,
  equippedWing?: CreationAttachment,
  items?: InventoryItem[]
): { slots: BattleSlot[]; weapons: CreationWeapon[]; skills: LoadedSkill[] } {
  const byId = new Map(loads.map((load) => [load.skill.id, load]));
  const itemsById = new Map((items ?? []).map((it) => [it.id, it]));
  const carried: CreationWeapon[] = [];
  const carriedSkills: LoadedSkill[] = [];
  const slots: BattleSlot[] = BATTLE_QUICK_KEYS.map((key, index) => {
    const id = quickbar[index] ?? null;
    if (!id) return { key, kind: 'empty' };
    const load = byId.get(id);
    if (load) {
      if (!carriedSkills.includes(load)) carriedSkills.push(load);
      return { key, kind: 'skill', id, load };
    }
    const bagItem = itemsById.get(id);
    const weapon = weapons[id] ?? (bagItem?.weapon ? weapons[bagItem.weapon] : undefined);
    if (weapon) {
      const weaponIndex = carried.length;
      carried.push(weapon);
      return {
        key,
        kind: 'weapon',
        id: weapon.id,
        weapon,
        weaponIndex,
        lobbyIcon: bagItem?.icon,
        label: bagItem?.name || weapon.label,
      };
    }
    const att = attachments?.[id] ?? bagItem?.attachment;
    if (att && (att.bone === 'chest' || att.id.startsWith('wing') || id.startsWith('wing'))) {
      const slotWing: CreationAttachment = {
        ...att,
        id: bagItem?.id || att.id || id,
        icon: bagItem?.icon || att.icon || 'icons/item_wing01.png',
        label: bagItem?.name || att.label || '飞行器',
      };
      return {
        key,
        kind: 'wing',
        id: slotWing.id || id,
        attachment: slotWing,
        icon: slotWing.icon || 'icons/item_wing01.png',
        label: slotWing.label || '飞行器',
      };
    }
    if (bagItem) {
      return {
        key,
        kind: 'item',
        id: bagItem.id,
        item: bagItem,
        icon: bagItem.icon,
        label: bagItem.name,
      };
    }
    return { key, kind: 'empty' };
  });

  if (equippedWing && !slots.some((s) => s.kind === 'wing')) {
    const emptyIdx = slots.findIndex((s, i) => i >= 3 && s.kind === 'empty');
    const targetIdx = emptyIdx >= 0 ? emptyIdx : slots.findIndex((s) => s.kind === 'empty');
    if (targetIdx >= 0) {
      const key = BATTLE_QUICK_KEYS[targetIdx];
      slots[targetIdx] = {
        key,
        kind: 'wing',
        id: equippedWing.id,
        attachment: equippedWing,
        icon: equippedWing.icon || 'icons/item_wing01.png',
        label: equippedWing.label || '飞行器',
      };
    }
  }

  return { slots, weapons: carried, skills: carriedSkills };
}

