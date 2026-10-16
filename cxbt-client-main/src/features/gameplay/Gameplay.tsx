import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { apiFetch, WS_BASE } from '../../api';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { SavedCharacter } from '../characterCreation/character';
import { initialAppearance, type CreationAssets, type CreationPreset, type CreationWeapon } from '../characterCreation/assets';
import type { LobbyAssets } from '../lobby/assets';
import type { RoomConfig } from '../gameMode/CreateRoomDialog';
import { createBattleAvatar, type BattleAvatar } from './avatar';
import { createBattleAudio } from './audio';
import BattleHud from './BattleHud';
import { BATTLE_QUICK_KEYS } from './hud';
import { createProjectileSystem, weaponKind } from './projectiles';
import { createSkillEffects } from './skillEffects';
import { loadSkills, passiveModifiers, resolveLoadout, type BattleSlot, type LoadedSkill } from './skills';
import SettingsMenu from '../lobby/SettingsMenu';
import type { Skill } from '../lobby/skills';
import {
  PlayerEntity,
  CameraController,
  MapCollider,
  CombatEffectsManager,
  BotManager,
  getWeaponActionSuite,
  getWeaponCombatProfile,
  getCustomMapById,
  mountCustomMapNodesIntoScene,
  type CustomMapBlueprint,
  type BotBehaviorMode,
  type BotSnapshot,
} from './engine';
import './Gameplay.css';
import { WebRTCClient } from '../../network/WebRTCClient';

type MapDefinition = {
  name?: string;
  scene: string;
  collision: string | null;
  minimap: string | null;
  airWalls: string[];
  bounds: number[] | null;
  camera: number[] | null;
  fog: number[] | null;
  ambience?: string | null;
  sun?: number[] | null;
  holdPoint?: number[] | null;
  redSpawns?: number[][] | null;
  blueSpawns?: number[][] | null;
  redFlag?: number[] | null;
  blueFlag?: number[] | null;
  bombSites?: number[][] | null;
  treasureSpawns?: number[][] | null;
};

export type ModeObjectiveState = {
  modeId: string;
  statusText: string;
  progress: number; // 0..100 for occupy / plant
  ownerTeam: 'neutral' | 'red' | 'blue';
  carryingFlag: boolean;
  treasuresCollected: number;
  activeBuff: string;
  bombPlanted: boolean;
  bombTimer: number;
  roundNumber: number;
  bossName?: string;
  bossHp?: number;
  bossMaxHp?: number;
  bossStage?: number;
};

type BattleControl = { 
  switchWeapon: (index: number) => void; 
  fire: () => void; 
  reload: () => void;
  castSkill: (slot: number) => boolean;
  castSkillById: (skillId: string) => boolean;
  spawnChatBubbleForUser: (userId: string | number, sender: string, text: string) => void;
  spawnBot: (mode?: BotBehaviorMode) => void;
  setAllBotsMode: (mode: BotBehaviorMode) => void;
  reviveAllBots: () => void;
  clearAllBots: () => void;
  hitBot: (id: string, dmg: number) => void;
  respawnPlayer: () => void;
  interactObjective: () => void;
};
type HotbarState = {
  cooldowns: number[];
  byId?: Record<string, number>;
  shield: number;
  stealthed: boolean;
  speed: number;
  maxHealthScale: number;
  transferEnergy?: number;
};
type SandboxRules = { infiniteAmmo: boolean; noCooldown: boolean; godMode: boolean; autoRespawnBots: boolean };
export type BattleChatMessage = {
  id: string;
  sender: string;
  channel: 'all' | 'team' | 'world' | 'system';
  content: string;
  time: string;
};

const TACTICAL_VOICE_CALLOUTS = [
  { key: '1', text: '⚠️ 请求火力支援！敌军正在突进！' },
  { key: '2', text: '🎯 全体集火前方高危目标！' },
  { key: '3', text: '👁️ 注意侧翼隐身刺客偷袭！' },
  { key: '4', text: '🚩 掩护我夺取战旗 / 占领核心据点！' },
  { key: '5', text: '🏆 干得漂亮！继续保持压制！' },
];

const BASE = `${import.meta.env.BASE_URL}assets/gameplay/`;
const LOBBY = `${import.meta.env.BASE_URL}assets/lobby/`;
const AMMO: Record<string, number> = { pistol: 12, sniperrifle: 5, shotgun: 8, rpg: 1,
  bow: 1, crossbow: 1, machinegun: 80, smg: 30, sprayer: 60, grenadelauncher: 6, grenade: 1 };
const DEFAULT_AMMO = 30;
const MAX_HEALTH = 3201;
const ROUND_LENGTH = 3 * 60;

function magazine(weapon: CreationWeapon) {
  if (weaponKind(weapon.id) === 'melee') return 0;
  const family = weapon.id.split('_')[0];
  return AMMO[family] ?? DEFAULT_AMMO;
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

function BattleScene({ map, customMap, modeId, damageBonusMult, hasPetCompanion, character, creation, assets, avatarPreset, weapons, slots, loads, allLoads, health, motion,
  active, onReady, onPosition, onShot, onHit, onReload, onWeaponChange, onDamage, onHeal, onHotbar,
  onPause, paused, sandboxOpen, chatOpen, sandboxRules, onBotsChange, onBotKill, onObjectiveScore, onObjectiveState, onHitMarker, onRecoil,
  onScopeChange, onShieldGuardChange, otherPlayers, roomPlayers, logDebug }: {
  map: MapDefinition;
  customMap?: CustomMapBlueprint;
  modeId: string;
  damageBonusMult: number;
  hasPetCompanion: boolean;
  character: SavedCharacter;
  creation: CreationAssets;
  assets: LobbyAssets;
  avatarPreset?: CreationPreset;
  weapons: CreationWeapon[];
  slots: BattleSlot[];
  loads: LoadedSkill[];
  allLoads: LoadedSkill[];
  health: RefObject<number>;
  motion: RefObject<boolean>;
  active: RefObject<BattleControl | null>;
  paused: RefObject<boolean>;
  sandboxOpen: RefObject<boolean>;
  chatOpen: RefObject<boolean>;
  sandboxRules: RefObject<SandboxRules>;
  onBotsChange: (bots: BotSnapshot[]) => void;
  onBotKill: (botName?: string, weaponName?: string) => void;
  onObjectiveScore: (redDelta: number, blueDelta: number, feedText: string) => void;
  onObjectiveState: (state: ModeObjectiveState) => void;
  onHitMarker: (crit: boolean) => void;
  onRecoil: (spread: number) => void;
  onScopeChange: (scoped: boolean, family: string) => void;
  onShieldGuardChange: (guarding: boolean) => void;
  onReady: () => void;
  onPosition: (x: number, z: number, yaw: number) => void;
  onShot: () => boolean;
  onHit: (targetId: string, damage: number) => void;
  onReload: () => void;
  onWeaponChange: (index: number) => void;
  onDamage: (amount: number) => void;
  onHeal: (amount: number) => void;
  onHotbar: (state: HotbarState) => void;
  onPause: () => void;
  otherPlayers: React.RefObject<Record<string, { buffer: {x: number, z: number, yaw: number, time: number}[] }>>;
  roomPlayers: any;
  logDebug: (msg: string) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const shotRef = useRef(onShot);
  const hitRef = useRef(onHit);
  const reloadRef = useRef(onReload);
  const positionRef = useRef(onPosition);
  const readyRef = useRef(onReady);
  const weaponChangeRef = useRef(onWeaponChange);
  const damageRef = useRef(onDamage);
  const healRef = useRef(onHeal);
  const hotbarRef = useRef(onHotbar);
  const logRef = useRef(logDebug);
  const pauseRef = useRef(onPause);
  const botsChangeRef = useRef(onBotsChange);
  const botKillRef = useRef(onBotKill);
  const objectiveScoreRef = useRef(onObjectiveScore);
  const objectiveStateRef = useRef(onObjectiveState);
  const hitMarkerRef = useRef(onHitMarker);
  const recoilRef = useRef(onRecoil);
  const scopeChangeRef = useRef(onScopeChange);
  const shieldGuardChangeRef = useRef(onShieldGuardChange);
  const damageBonusRef = useRef(damageBonusMult);
  const allLoadsRef = useRef(allLoads);
  const slotsRef = useRef(slots);

  shotRef.current = onShot;
  hitRef.current = onHit;
  reloadRef.current = onReload;
  positionRef.current = onPosition;
  readyRef.current = onReady;
  weaponChangeRef.current = onWeaponChange;
  damageRef.current = onDamage;
  healRef.current = onHeal;
  hotbarRef.current = onHotbar;
  logRef.current = logDebug;
  pauseRef.current = onPause;
  botsChangeRef.current = onBotsChange;
  botKillRef.current = onBotKill;
  objectiveScoreRef.current = onObjectiveScore;
  objectiveStateRef.current = onObjectiveState;
  hitMarkerRef.current = onHitMarker;
  recoilRef.current = onRecoil;
  scopeChangeRef.current = onScopeChange;
  shieldGuardChangeRef.current = onShieldGuardChange;
  damageBonusRef.current = damageBonusMult;
  allLoadsRef.current = allLoads;
  slotsRef.current = slots;

  useEffect(() => {
    if (mountRef.current) {
      mountRef.current.dataset.hotbar = String(slots.filter((s) => s.kind !== 'empty').length);
    }
  }, [slots]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    mount.dataset.hotbar = String(slots.filter((s) => s.kind !== 'empty').length);
    mount.dataset.attackStep = '0';

    let cancelled = false;
    let frame = 0;
    let playerAvatar: BattleAvatar | null = null;
    let localPlayer: PlayerEntity | null = null;
    let cameraController: CameraController | null = null;
    let visual: any = null;
    let collision: any = null;
    let dragging = false;
    let pointerX = 0;
    let pointerY = 0;
    let selected = 0;
    let lastShot = 0;
    let reloadUntil = 0;
    let comboStep = 0;
    let comboTime = 0;
    let holding = false;
    let isScoped = false;
    let shieldGuarding = false;
    let lockTimer = 0;
    let lockAttempts = 0;
    let lastHotbar = 0;
    let regenTimer = 0;
    let shotFlash = 0;
    let ready = false;
    let audioPaused = false;
    const keys = new Set<string>();
    const clock = new THREE.Clock();

    const audio = createBattleAudio(map.ambience);
    audio.start();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#d9e9e9');
    if (map.fog && map.fog.length >= 4) scene.fog = new THREE.Fog('#d9e9e9', Math.max(35, map.fog[1]), map.fog[2]);

    const camera = new THREE.PerspectiveCamera(65, 1, 0.08, 450);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.55;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xe8f5ff, 0x777c6c, 2.4));
    const sun = new THREE.DirectionalLight(0xfff0db, 2.3);
    sun.position.set(40, 70, 45);
    scene.add(sun);

    const flash = new THREE.PointLight(0xffcf79, 0, 7);
    scene.add(flash);

    // 1. 初始化地图物理碰撞、3D 战斗特效、AI 假人系统
    const mapCollider = new MapCollider();
    if (map.bounds) mapCollider.setBounds(map.bounds);
    const combatEffects = new CombatEffectsManager(scene);

    const passives = passiveModifiers(loads);
    const otherPlayerEntities = new Map<string, PlayerEntity>();

    const takeDamage = (amount: number) => {
      if (sandboxRules.current.godMode) return;
      let reduced = amount * (1 - passives.damageReduction / 100);
      if (shieldGuarding) {
        reduced *= 0.35; // 战术盾牌右键架盾减免 65% 伤害
        audio.play('hit_shield', 0.65);
        if (localPlayer) {
          combatEffects.spawnStatusText(localPlayer.modelGroup.position, '🛡️ 盾牌格挡 -65%', '#38bdf8');
        }
      }
      if (passives.storeEnergy > 0) {
        const prevStored = transfer.stored;
        transfer.stored = Math.min(150, transfer.stored + reduced * passives.storeEnergy / 100);
        if (prevStored < 100 && transfer.stored >= 100) {
          audio.play('skill-transfer-ready', 0.65);
          if (localPlayer) combatEffects.spawnStatusText(localPlayer.modelGroup.position, '⚡ 能量转化充能完毕！', '#fbbf24');
        }
        const releaseRad = passives.releaseRadius || 8;
        if (transfer.stored >= 100 && enemyList().some((enemy) => enemy.position.distanceTo(localPlayer?.modelGroup.position || new THREE.Vector3()) <= releaseRad)) {
          transfer.stored = 0;
          audio.play('skill-transfer', 0.8);
          if (localPlayer) {
            combatEffects.spawnExplosionEffect(localPlayer.modelGroup.position.clone().add(new THREE.Vector3(0, 1, 0)));
            combatEffects.spawnStatusText(localPlayer.modelGroup.position, `💥 能量转化震爆 (${passives.releaseDamage || 320})`, '#f59e0b');
          }
          for (const enemy of enemyList()) {
            if (localPlayer && enemy.position.distanceTo(localPlayer.modelGroup.position) <= releaseRad) {
              damageTargetById(enemy.userId, passives.releaseDamage || 320, true);
            }
          }
        }
      }
      const left = skillEffects.absorb(reduced);
      if (left > 0) damageRef.current(left);
    };

    let buffDamageMult = 1.0;
    let buffSpeedMult = 1.0;
    let buffExpireAt = 0;
    let activeBuffLabel = '';

    // Mode objective runtime state
    const normalizedMode = (() => {
      const m = (modeId || '').toLowerCase();
      if (m.includes('occupy') || m.includes('zhandian') || m.includes('占')) return 'occupy';
      if (m.includes('flag') || m.includes('snatch') || m.includes('夺旗')) return 'flag';
      if (m.includes('treasure') || m.includes('contention') || m.includes('夺宝') || m.includes('宝箱')) return 'treasure';
      if (m.includes('blast') || m.includes('爆破')) return 'blast';
      if (m.includes('kill') || m.includes('歼灭')) return 'kill';
      if (m.includes('survival') || m.includes('boss') || m.includes('bioche') || m.includes('远征') || m.includes('生化')) return 'boss';
      return 'team';
    })();

    const BOSS_STAGES = [
      { name: '阶段1 · 暴走重装机甲 (Boss_01)', maxHp: 6500, color: 0xef4444, scale: 1.9 },
      { name: '阶段2 · 暗黑熔岩巨龙 (Boss_02)', maxHp: 9000, color: 0xf97316, scale: 2.1 },
      { name: '阶段3 · 生化变异领主 (Boss_03)', maxHp: 12000, color: 0x10b981, scale: 2.2 },
      { name: '阶段4 · 星界行刑者 (Boss_08)', maxHp: 15500, color: 0x8b5cf6, scale: 2.35 },
      { name: '阶段5 · 终焉泰坦首领 (Boss_09)', maxHp: 20000, color: 0xfacc15, scale: 2.55 },
    ];
    let bossStageIdx = 0;
    let bossHp = BOSS_STAGES[0].maxHp;
    let bossMaxHp = BOSS_STAGES[0].maxHp;
    let bossAttackCooldown = 3.5;

    let occupyProgress = 0; // -100 (blue) .. +100 (red)
    let occupyTickTimer = 0;
    let carryingFlag = false;
    let treasuresCollected = 0;
    let bombPlanted = false;
    let bombTimer = 35;
    let roundNumber = 1;
    let roundResetCooldown = 0;
    let lastObjSync = 0;

    const objectiveGroup = new THREE.Group();
    scene.add(objectiveGroup);

    let holdRingMesh: any = null;
    let holdBeaconMesh: any = null;
    let blueFlagMesh: any = null;
    let redFlagMesh: any = null;
    let carriedFlagMesh: any = null;
    let bombSiteMeshes: any[] = [];
    let plantedBombMesh: any = null;
    let bossGroup: any = null;
    let bossHitboxMesh: any = null;
    let petCompanionMesh: any = null;
    const treasureChests: Array<{ mesh: any; pos: any; respawnAt: number }> = [];

    const resolveSafeSpawn = (team: 'red' | 'blue', index = 0) => {
      if (customMap) {
        return new THREE.Vector3(customMap.spawnPoint[0], customMap.spawnPoint[1], customMap.spawnPoint[2]);
      }
      const list = team === 'red' ? map.redSpawns : map.blueSpawns;
      const fallback = map.holdPoint ?? map.camera ?? [0, 2, 0];
      const raw = (list && list[index % list.length]) || fallback;
      const sx = raw[0] ?? 0;
      const sz = raw[2] ?? 0;
      const ground = mapCollider.floorAt(sx, sz, (raw[1] ?? 12) + 65) ?? mapCollider.floorAt(0, 0, 90) ?? 0;
      return new THREE.Vector3(sx, ground, sz);
    };

    const resolveHoldPointVec = () => {
      const hp = map.holdPoint ?? map.redSpawns?.[0] ?? map.camera ?? [0, 1, 0];
      const hx = hp[0] ?? 0;
      const hz = hp[2] ?? 0;
      const hy = mapCollider.floorAt(hx, hz, (hp[1] ?? 12) + 65) ?? (hp[1] ?? 0);
      return new THREE.Vector3(hx, hy, hz);
    };

    const botManager = new BotManager(scene, {
      onStateChange: (list) => botsChangeRef.current(list),
      onPlayerAttacked: (dmg) => takeDamage(dmg),
      onBotKilled: () => {
        const wLabel = weapons[selected]?.label || '战术武器';
        botKillRef.current('蓝方卫兵', wLabel);
      },
      playAudio: (name, vol) => audio.play(name, vol),
      onStatus: (msg) => logRef.current(msg),
    });

    const enemyList = () => {
      const list: { userId: string; position: any }[] = [];
      for (const [userId, entity] of otherPlayerEntities) {
        if (entity?.modelGroup && entity.isAlive) list.push({ userId, position: entity.modelGroup.position });
      }
      for (const botTarget of botManager.getAliveTargets()) {
        list.push({ userId: botTarget.userId, position: botTarget.position });
      }
      if (normalizedMode === 'boss' && bossGroup && bossHp > 0) {
        list.push({ userId: '__boss__', position: bossGroup.position });
      }
      return list;
    };

    const damageTargetById = (userId: string, damage: number, crit = false, hitPoint?: any) => {
      const vulnMult = skillEffects.getDamageMultiplier(userId);
      const scaledDamage = Math.max(1, Math.round(damage * damageBonusRef.current * buffDamageMult * vulnMult));
      skillEffects.onEnemyDamaged(userId, scaledDamage);

      if (userId === '__boss__' && bossGroup && bossHp > 0) {
        bossHp = Math.max(0, bossHp - scaledDamage);
        const pos = hitPoint ? hitPoint.clone() : bossGroup.position.clone().add(new THREE.Vector3(0, 2.8, 0));
        combatEffects.spawnFloatingDamage(pos, scaledDamage, crit);
        hitMarkerRef.current(crit);
        audio.play(crit ? 'critical_hit' : 'hit', crit ? 0.7 : 0.45);
        if (bossHp <= 0) {
          const defeatedName = BOSS_STAGES[bossStageIdx].name;
          combatEffects.spawnExplosionEffect(bossGroup.position.clone().add(new THREE.Vector3(0, 1.5, 0)));
          audio.play('grenade-explode', 0.8);
          objectiveScoreRef.current(10, 0, `👹 击败首领 [${defeatedName}]！红队 +10 分！`);
          healRef.current(1200);
          if (bossStageIdx < BOSS_STAGES.length - 1) {
            bossStageIdx += 1;
            const nextStage = BOSS_STAGES[bossStageIdx];
            bossMaxHp = nextStage.maxHp;
            bossHp = nextStage.maxHp;
            bossGroup.scale.setScalar(nextStage.scale);
            bossGroup.traverse((c: any) => {
              if (c.isMesh && c.material && c.material.color) {
                c.material.color.setHex(nextStage.color);
              }
            });
          } else {
            bossGroup.visible = false;
          }
        }
        return;
      }
      const bot = botManager.findById(userId);
      if (bot) {
        botManager.damageBotById(userId, scaledDamage);
        const pos = hitPoint ? hitPoint.clone() : bot.entity.modelGroup.position.clone().add(new THREE.Vector3(0, 1.65, 0));
        combatEffects.spawnFloatingDamage(pos, scaledDamage, crit);
        hitMarkerRef.current(crit);
        audio.play(crit ? 'critical_hit' : 'hit', crit ? 0.7 : 0.45);
        return;
      }
      hitRef.current(userId, scaledDamage);
      const remoteEntity = otherPlayerEntities.get(userId);
      if (remoteEntity) {
        remoteEntity.takeDamage(scaledDamage);
        const pos = hitPoint ? hitPoint.clone() : remoteEntity.modelGroup.position.clone().add(new THREE.Vector3(0, 1.65, 0));
        combatEffects.spawnFloatingDamage(pos, scaledDamage, crit);
      }
      hitMarkerRef.current(crit);
      audio.play(crit ? 'critical_hit' : 'hit', crit ? 0.7 : 0.45);
    };

    const resolveTargetEntity = (hitObj: any): { entity?: PlayerEntity; isBoss?: boolean; userId: string } | null => {
      let curr: any = hitObj;
      while (curr) {
        if (curr.userData?.isBoss) {
          return { isBoss: true, userId: '__boss__' };
        }
        if (curr.userData?.isPlayer && curr.userData?.entity) {
          return { entity: curr.userData.entity as PlayerEntity, userId: String(curr.userData.userId ?? '') };
        }
        curr = curr.parent;
      }
      return null;
    };

    const transfer = { stored: 0 };
    const projectiles = createProjectileSystem(
      scene,
      () => {
        const meshes = mapCollider.collisionMeshes.length ? [...mapCollider.collisionMeshes] : [...mapCollider.mapVisible];
        for (const hitbox of botManager.getAliveHitboxes()) {
          if (!meshes.includes(hitbox)) meshes.push(hitbox);
        }
        if (bossHitboxMesh && bossHp > 0 && !meshes.includes(bossHitboxMesh)) {
          meshes.push(bossHitboxMesh);
        }
        return meshes;
      },
      (point, radius, subType) => {
        audio.play('grenade-explode', 0.65);
        combatEffects.spawnExplosionEffect(point);
        if (subType === 'gasbomb' || (passives.gasDamage > 0 && (weapons[selected]?.id ?? '').startsWith('grenadelauncher'))) {
          skillEffects.spawnToxicGasCloud(point, radius * 1.15, Math.max(85, passives.gasDamage || 95), 35);
        }
        if (localPlayer && !sandboxRules.current.godMode) {
          const distance = point.distanceTo(localPlayer.modelGroup.position.clone().add(new THREE.Vector3(0, 1, 0)));
          if (distance < radius) takeDamage(Math.ceil(650 * (1 - distance / radius)));
        }
        for (const enemy of enemyList()) {
          const gap = enemy.position.distanceTo(point);
          if (gap > radius) continue;
          const blast = passives.gasDamage > 0 ? passives.gasDamage * 3 : Math.ceil(420 * (1 - gap / radius));
          damageTargetById(enemy.userId, blast, false);
        }
      },
      (hit, kind, subType) => {
        const target = resolveTargetEntity(hit.object);
        if (target && (target.isBoss || target.entity?.isAlive)) {
          const weaponId = weapons[selected]?.id ?? 'smg_01';
          const profile = getWeaponCombatProfile(weaponId);
          const targetBasePos = target.entity
            ? target.entity.modelGroup.position
            : (bossGroup?.position ?? hit.point);
          if (kind === 'arrow') {
            const relY = hit.point.y - targetBasePos.y;
            const isHeadshot = relY >= 1.35;
            let dmg = Math.round(profile.damage * (isHeadshot ? profile.headshotMultiplier : 1));
            if (subType === 'syringe' || weaponId.startsWith('crossbow')) {
              audio.play('hit_crossbow', 0.65);
              const leechRatio = Math.max(25, passives.lifesteal);
              const leechAmount = Math.round((dmg * leechRatio) / 100);
              healRef.current(leechAmount);
              if (localPlayer) {
                combatEffects.spawnFloatingHeal(localPlayer.modelGroup.position, leechAmount);
                combatEffects.spawnLifeLeechOrb(hit.point, localPlayer.modelGroup.position, 0x10b981);
              }
              if (passives.puppetRecover > 0 || passives.lifesteal > 0) {
                skillEffects.inflictPuppet(target.userId, passives.puppetRecover || 25);
              }
            } else {
              audio.play('hit_bow', 0.65);
            }
            damageTargetById(target.userId, dmg, isHeadshot, hit.point);
          } else if (kind === 'rocket' || kind === 'grenade') {
            damageTargetById(target.userId, 65, false, hit.point);
          }
        } else if (hit?.point && kind === 'arrow') {
          combatEffects.spawnImpactSpark(hit.point);
        }
      }
    );

    const skillEffects = createSkillEffects({
      scene,
      position: () => localPlayer?.modelGroup.position || new THREE.Vector3(),
      aim: () => cameraController ? cameraController.getForwardDirection() : camera.getWorldDirection(new THREE.Vector3()),
      spawnProjectile: (kind, origin, aim, subType) => projectiles.spawn(kind, origin, aim, subType),
      playSound: (name, volume) => audio.play(name, volume),
      getMaxHealth: () => MAX_HEALTH * skillEffects.snapshot().maxHealthScale,
      heal: (amount) => {
        healRef.current(amount);
        if (localPlayer) combatEffects.spawnFloatingHeal(localPlayer.modelGroup.position, amount);
      },
      hurt: (amount) => takeDamage(amount),
      enemies: enemyList,
      hitEnemy: (userId, damage) => damageTargetById(userId, damage, false),
      setGhost: (on) => localPlayer?.setGhost(on),
      onSpurt: () => localPlayer?.spurt(),
      onExplosion: (point) => combatEffects.spawnExplosionEffect(point),
      onStatusEffect: (pos: any, text: string, color: string) => combatEffects.spawnStatusText(pos, text, color),
      log: (message) => logRef.current(message),
    });

    const resetWeaponAltState = () => {
      if (isScoped) {
        isScoped = false;
        camera.fov = 65;
        camera.updateProjectionMatrix();
        scopeChangeRef.current(false, '');
      }
      if (shieldGuarding) {
        shieldGuarding = false;
        skillEffects.setShieldGuard(false);
        shieldGuardChangeRef.current(false);
      }
    };

    const fire = () => {
      const weaponId = weapons[selected]?.id ?? 'smg_01';
      const family = weaponId.split('_')[0] ?? '';
      const kind = weaponKind(weaponId);
      const profile = getWeaponCombatProfile(weaponId);
      const fireIntervalMs = profile.fireDelay * 1000;
      const baseDelay = sandboxRules.current.noCooldown ? Math.min(85, fireIntervalMs) : fireIntervalMs;
      const delay = baseDelay * (family === 'machinegun' ? Math.max(0.35, 1 - passives.fireRate / 100) : 1);
      const now = performance.now();
      if (!ready || !localPlayer || paused.current || sandboxOpen.current || chatOpen.current || now - lastShot < delay || now < reloadUntil) return;
      if (kind !== 'melee' && !shotRef.current()) {
        active.current?.reload();
        return;
      }

      const wasStealthed = skillEffects.isStealthed();
      skillEffects.breakStealth();
      if (comboTime > 0 && now - comboTime > 1200) comboStep = 0;
      lastShot = now;
      comboTime = now;

      // 武器开火时人物立即朝向准星方向
      if (cameraController) {
        localPlayer.syncFacingToCamera(cameraController.yaw);
      }

      if (kind === 'melee') {
        comboStep += 1;
        mount.dataset.attackStep = String(comboStep);
        localPlayer.attack(((comboStep - 1) % 3) + 1);
      } else {
        comboStep = 0;
        mount.dataset.attackStep = '0';
        localPlayer.attack();
      }
      audio.play(profile.fireAudio, 0.55);
      recoilRef.current(kind === 'melee' ? 6 : Math.min(26, 7 + profile.spread * 220));

      for (const hitbox of botManager.getAliveHitboxes()) {
        if (!mapCollider.collisionMeshes.includes(hitbox)) {
          mapCollider.collisionMeshes.push(hitbox);
        }
      }
      if (bossHitboxMesh && bossHp > 0 && !mapCollider.collisionMeshes.includes(bossHitboxMesh)) {
        mapCollider.collisionMeshes.push(bossHitboxMesh);
      }

      const aim = cameraController ? cameraController.getForwardDirection() : camera.getWorldDirection(new THREE.Vector3());

      if (kind === 'melee') {
        combatEffects.spawnMeleeSlash(localPlayer.modelGroup.position, aim, comboStep);
        const point = localPlayer.modelGroup.position.clone().add(new THREE.Vector3(0, 1, 0));
        const reach = family === 'shield' ? 3.9 : 3.5;
        for (const enemy of enemyList()) {
          const offset = enemy.position.clone().sub(point);
          const distance = offset.length();
          if (distance > reach || (distance > 0.01 && offset.normalize().dot(aim) < 0.15)) continue;
          let damage = profile.damage * (family === 'shield' ? 0.34 : 0.25);
          if (wasStealthed) damage *= 1.65;
          if (family === 'shield') {
            audio.play('hit_shield', 0.7);
            combatEffects.spawnStatusText(enemy.position, '🛡️ 盾击震退！', '#38bdf8');
            const bot = botManager.findById(enemy.userId);
            if (bot) {
              bot.entity.modelGroup.position.addScaledVector(aim, 2.1);
            }
          } else if (passives.poisonChance > 0 && Math.random() * 100 < Math.max(45, passives.poisonChance)) {
            damage += passives.dotDamage * 3;
            skillEffects.inflictPoison(enemy.userId, Math.max(55, passives.dotDamage), 10);
          }
          damageTargetById(enemy.userId, Math.round(damage), wasStealthed, enemy.position.clone().add(new THREE.Vector3(0, 1.0, 0)));
        }
        return;
      }

      const muzzle = localPlayer.getMuzzlePosition();

      if (kind === 'grenade' || kind === 'rocket' || kind === 'arrow') {
        const crosshairHit = mapCollider.raycastBullet(camera.position, aim, 120);
        const targetPoint = crosshairHit
          ? crosshairHit.point
          : camera.position.clone().addScaledVector(aim, 85);
        const launchDir = targetPoint.clone().sub(muzzle).normalize();
        const subType = family === 'crossbow'
          ? 'syringe'
          : (family === 'grenadelauncher' && passives.gasDamage > 0)
            ? 'gasbomb'
            : 'default';
        projectiles.spawn(kind, muzzle, launchDir, subType);
        if (kind === 'rocket' || kind === 'grenade') {
          shotFlash = 0.08;
          flash.position.copy(muzzle);
          flash.intensity = 6;
          combatEffects.triggerMuzzleFlash(muzzle);
        }
        return;
      }

      shotFlash = 0.08;
      flash.position.copy(muzzle);
      flash.intensity = 6;
      combatEffects.triggerMuzzleFlash(muzzle);

      // 生化喷射器 (sprayer): 1:1 复刻 vfx_shenghua_atomizing_attack1_3rd.vfx 3D 连续雾化毒雾锥 + 瘟疫感染
      if (family === 'sprayer') {
        combatEffects.spawnSprayerMistCone(muzzle, aim);
        const pPos = localPlayer.modelGroup.position;
        for (const enemy of enemyList()) {
          const toEnemy = enemy.position.clone().sub(pPos);
          const dist = toEnemy.length();
          if (dist <= 9.8 && (dist < 1.5 || toEnemy.normalize().dot(aim) >= 0.62)) {
            let sprayDmg = profile.damage * 0.24;
            if (passives.plagueChance > 0 && Math.random() * 100 < Math.max(40, passives.plagueChance)) {
              sprayDmg += passives.plagueDamage * 2;
              skillEffects.inflictPlague(
                enemy.userId,
                Math.max(60, passives.plagueDamage || 75),
                passives.plagueRadius || 5
              );
            }
            damageTargetById(enemy.userId, Math.round(sprayDmg), false, enemy.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
          }
        }
        return;
      }

      const tracerColor = family === 'sniperrifle'
        ? 0x38bdf8
        : family === 'machinegun'
          ? 0xfb923c
          : 0xfde047;

      const effectiveSpread = isScoped ? profile.spread * 0.12 : profile.spread;

      for (let p = 0; p < profile.pellets; p++) {
        const rayDir = aim.clone();
        if (effectiveSpread > 0) {
          rayDir.x += (Math.random() - 0.5) * effectiveSpread;
          rayDir.y += (Math.random() - 0.5) * effectiveSpread;
          rayDir.z += (Math.random() - 0.5) * effectiveSpread;
          rayDir.normalize();
        }
        const hit = mapCollider.raycastBullet(camera.position, rayDir, 120);
        const targetPoint = hit
          ? hit.point
          : camera.position.clone().addScaledVector(rayDir, 85);
        const bulletDir = targetPoint.clone().sub(muzzle).normalize();

        if (p === 0 || p % 2 === 0) {
          projectiles.spawn('bullet', muzzle, bulletDir);
        }
        if (family === 'sniperrifle') {
          combatEffects.spawnSniperSpiralBeam(muzzle, targetPoint, isScoped || wasStealthed);
        } else {
          combatEffects.spawnBulletTracer(muzzle, targetPoint, tracerColor);
        }

        if (hit) {
          const target = resolveTargetEntity(hit.object);
          if (target && (target.isBoss || target.entity?.isAlive)) {
            const targetBasePos = target.entity
              ? target.entity.modelGroup.position
              : (bossGroup?.position ?? hit.point);
            const relY = hit.point.y - targetBasePos.y;
            let isCrit = relY >= 1.35 || wasStealthed;
            let damage = profile.damage * 0.22 * (isCrit ? profile.headshotMultiplier : 1);
            if (isScoped && family === 'sniperrifle') {
              damage *= 1.25;
            }
            if (family === 'sniperrifle' && Math.random() * 100 < Math.max(30, passives.critChance)) {
              isCrit = true;
              damage *= 1 + (passives.critDamage || 50) / 100;
              combatEffects.spawnStatusText(targetBasePos, '🎯 精准暴击！', '#fde047');
            }
            if ((family === 'smg' || family === 'pistol') && passives.weakChance > 0 && Math.random() * 100 < Math.max(35, passives.weakChance)) {
              damage *= 1.2;
              skillEffects.inflictWeakness(target.userId, 5);
            }
            damageTargetById(target.userId, Math.round(damage), isCrit, hit.point);
          } else {
            combatEffects.spawnImpactSpark(hit.point);
          }
        }
      }
    };

    const triggerObjectiveAction = () => {
      if (!localPlayer) return;
      const pPos = localPlayer.modelGroup.position;
      if (normalizedMode === 'blast') {
        if (!bombPlanted) {
          bombPlanted = true;
          bombTimer = 35;
          if (plantedBombMesh) {
            plantedBombMesh.position.copy(pPos).add(new THREE.Vector3(0, 0.35, 0));
            plantedBombMesh.visible = true;
          }
          audio.play('grenade', 0.65);
          objectiveScoreRef.current(2, 0, `💣 [${character.name}] 已在爆破点安放 C4 雷包！35秒引爆倒计时开始！`);
        } else {
          bombPlanted = false;
          if (plantedBombMesh) plantedBombMesh.visible = false;
          objectiveScoreRef.current(3, 0, `🛠️ [${character.name}] 成功拆除了高危雷包！`);
        }
      } else if (normalizedMode === 'flag') {
        if (!carryingFlag && blueFlagMesh) {
          carryingFlag = true;
          blueFlagMesh.visible = false;
          if (carriedFlagMesh) carriedFlagMesh.visible = true;
          objectiveScoreRef.current(1, 0, `🚩 [${character.name}] 突袭夺取了蓝方战旗！请护送回己方基地！`);
        } else if (carryingFlag) {
          carryingFlag = false;
          if (blueFlagMesh) blueFlagMesh.visible = true;
          if (carriedFlagMesh) carriedFlagMesh.visible = false;
          healRef.current(600);
          objectiveScoreRef.current(5, 0, `🏆 [${character.name}] 成功将战旗护送回红方旗座！红队 +5 分！`);
        }
      } else if (normalizedMode === 'treasure') {
        treasuresCollected += 1;
        healRef.current(500);
        buffDamageMult = 1.35;
        buffSpeedMult = 1.22;
        buffExpireAt = performance.now() + 12000;
        activeBuffLabel = '⚡ 宝箱狂暴增益 (伤害+35% / 移速+22%)';
        objectiveScoreRef.current(3, 0, `💎 [${character.name}] 开启了黄金宝箱 (#${treasuresCollected})！红队 +3 分！`);
      } else {
        // Default tactical pulse heal/buff
        healRef.current(450);
        combatEffects.spawnFloatingHeal(pPos, 450);
      }
    };

    const syncHotbarNow = () => {
      const snap = skillEffects.snapshot();
      const bySlot = skillEffects.bySlot();
      const byIdObj: Record<string, number> = {};
      for (const l of allLoadsRef.current) {
        const cdVal = skillEffects.cooldownOfSkill?.(l.skill.id) ?? 0;
        if (cdVal > 0) byIdObj[l.skill.id] = cdVal;
      }
      hotbarRef.current({
        cooldowns: BATTLE_QUICK_KEYS.map((_, index) => bySlot.get(index) ?? 0),
        byId: byIdObj,
        shield: snap.shield,
        stealthed: skillEffects.isStealthed(),
        speed: snap.speed,
        maxHealthScale: snap.maxHealthScale,
        transferEnergy: Math.round(transfer.stored),
      });
    };

    active.current = {
      switchWeapon(index) {
        if (selected === index) return;
        resetWeaponAltState();
        selected = index;
        reloadUntil = 0;
        comboStep = 0;
        mount.dataset.attackStep = '0';
        playerAvatar?.setWeapon(index);
        localPlayer?.switchWeaponSlot(index);
        const wId = weapons[index]?.id ?? 'smg_01';
        const suite = getWeaponActionSuite(wId);
        void localPlayer?.loadAnimations(suite.actions);

        const family = weapons[index]?.id.split('_')[0] ?? '';
        audio.play(['pistol', 'sniperrifle', 'shotgun', 'smg', 'machinegun', 'knives',
          'grenade', 'rpg', 'bow', 'crossbow', 'shield', 'sprayer', 'grenadelauncher'].includes(family)
          ? family : 'pistol');
        weaponChangeRef.current(index);
      },
      fire,
      castSkill(slot) {
        const entry = slotsRef.current[slot];
        if (!entry || entry.kind !== 'skill' || paused.current || entry.load.level <= 0) return false;
        if (sandboxRules.current.noCooldown) skillEffects.resetCooldowns();
        if (skillEffects.cast(slot, entry.load) === null) return false;
        if (sandboxRules.current.noCooldown) skillEffects.resetCooldowns();
        if (entry.load.skill.id !== 'latent') skillEffects.breakStealth();
        syncHotbarNow();
        return true;
      },
      castSkillById(skillId) {
        if (paused.current) return false;
        const matchingSlotIdx = slotsRef.current.findIndex((s) => s.kind === 'skill' && s.load.skill.id === skillId);
        if (matchingSlotIdx >= 0) {
          const entry = slotsRef.current[matchingSlotIdx];
          if (entry && entry.kind === 'skill') {
            if (sandboxRules.current.noCooldown) skillEffects.resetCooldowns();
            const res = skillEffects.cast(matchingSlotIdx, entry.load);
            if (sandboxRules.current.noCooldown) skillEffects.resetCooldowns();
            if (res !== null && skillId !== 'latent') skillEffects.breakStealth();
            if (res !== null) syncHotbarNow();
            return res !== null;
          }
        }
        const load = allLoadsRef.current.find((l) => l.skill.id === skillId);
        if (!load) return false;
        if (sandboxRules.current.noCooldown) skillEffects.resetCooldowns();
        const res = skillEffects.castDirect(load);
        if (sandboxRules.current.noCooldown) skillEffects.resetCooldowns();
        if (res && skillId !== 'latent') skillEffects.breakStealth();
        if (res) syncHotbarNow();
        return Boolean(res);
      },
      spawnChatBubbleForUser(userId, sender, text) {
        const uidStr = String(userId);
        const remote = otherPlayerEntities.get(uidStr);
        if (remote?.modelGroup) {
          combatEffects.spawnChatBubble(remote.modelGroup.position, sender, text);
        } else if (localPlayer?.modelGroup) {
          combatEffects.spawnChatBubble(localPlayer.modelGroup.position, sender, text);
        }
      },
      reload() {
        const weaponId = weapons[selected]?.id ?? '';
        if (weaponKind(weaponId) === 'melee') return;
        const now = performance.now();
        if (now < reloadUntil) return;
        const profile = getWeaponCombatProfile(weaponId);
        reloadUntil = now + (sandboxRules.current.noCooldown ? 250 : profile.reloadTime * 1000);
        localPlayer?.reload();
        if (profile.reloadAudio) audio.play(profile.reloadAudio, 0.55);
        reloadRef.current();
      },
      spawnBot(mode = 'dummy') {
        const center = localPlayer?.modelGroup.position ?? new THREE.Vector3();
        void botManager.spawnBot({
          mode,
          originPosition: center,
          collisionEnv: mapCollider.toCollisionEnvironment(),
        });
      },
      setAllBotsMode(mode) {
        botManager.setAllBotsMode(mode);
      },
      reviveAllBots() {
        botManager.reviveAllBots();
      },
      clearAllBots() {
        botManager.clearAllBots();
      },
      hitBot(id, dmg) {
        damageTargetById(id, dmg, false);
      },
      respawnPlayer() {
        if (!localPlayer) return;
        const sp = resolveSafeSpawn('red', Math.floor(Math.random() * 4));
        localPlayer.modelGroup.position.copy(sp);
        localPlayer.revive();
        combatEffects.spawnFloatingHeal(sp, MAX_HEALTH);
      },
      interactObjective() {
        triggerObjectiveAction();
      },
    };

    const lockPointer = () => {
      if (cancelled || paused.current || sandboxOpen.current || chatOpen.current || document.pointerLockElement) return;
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
      const request = document.body.requestPointerLock() as unknown as Promise<void> | undefined;
      if (request && typeof request.catch === 'function') void request.catch(() => undefined);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (chatOpen.current) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      if (paused.current || sandboxOpen.current) return;
      keys.add(event.code);
      audio.start();
      if (!document.pointerLockElement) lockPointer();

      if (event.code === 'Space' && !event.repeat && ready && !paused.current) {
        localPlayer?.jump();
      }
      if ((event.code === 'ShiftLeft' || event.code === 'ControlLeft') && !event.repeat && ready && !paused.current) {
        localPlayer?.roll();
      }
      if (event.code === 'KeyR' && !event.repeat) active.current?.reload();
      if (event.code === 'KeyE' && !event.repeat) triggerObjectiveAction();

      // 职业主动技能与首领技能战术快捷键 (Q / F / Z / X / C / G)
      if (!event.repeat) {
        const activeSkillHotkeys = ['KeyQ', 'KeyF', 'KeyZ', 'KeyX', 'KeyC', 'KeyG'];
        const hkIdx = activeSkillHotkeys.indexOf(event.code);
        if (hkIdx >= 0) {
          const castable = allLoadsRef.current.filter((l) => l.skill.kind === 'active');
          const targetLoad = castable[hkIdx];
          if (targetLoad) {
            active.current?.castSkillById(targetLoad.skill.id);
            return;
          }
        }

        const index = BATTLE_QUICK_KEYS.indexOf(event.key);
        const entry = index >= 0 ? slotsRef.current[index] : undefined;
        if (entry?.kind === 'weapon') active.current?.switchWeapon(entry.weaponIndex);
        else if (entry?.kind === 'skill') active.current?.castSkill(index);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const onBlur = () => { keys.clear(); holding = false; resetWeaponAltState(); };

    const onMove = (event: PointerEvent) => {
      const locked = document.pointerLockElement === renderer.domElement || document.pointerLockElement === document.body;
      if (!locked && !dragging) return;
      const sensScale = isScoped ? 0.42 : 1.0;
      const dx = (locked ? event.movementX : event.clientX - pointerX) * sensScale;
      const dy = (locked ? event.movementY : event.clientY - pointerY) * sensScale;
      pointerX = event.clientX;
      pointerY = event.clientY;
      cameraController?.onMouseMove(dx, dy);
    };

    const onDown = (event: PointerEvent) => {
      if (paused.current || sandboxOpen.current || chatOpen.current) return;
      if (event.target instanceof Element && event.target.closest('button, input, .settings-menu, .battle-inventory, .battle-sandbox-drawer, .battle-chat-box, .battle-skill-castbar')) return;
      audio.start();
      if (event.button === 2) {
        const curWeaponId = weapons[selected]?.id ?? '';
        const curFamily = curWeaponId.split('_')[0] ?? '';
        if (curFamily === 'sniperrifle' || curFamily === 'crossbow') {
          isScoped = !isScoped;
          camera.fov = isScoped ? (curFamily === 'sniperrifle' ? 22 : 32) : 65;
          camera.updateProjectionMatrix();
          audio.play(isScoped ? 'sniperrifle_scope' : 'sniperrifle_scope_out', 0.65);
          scopeChangeRef.current(isScoped, isScoped ? curFamily : '');
        } else if (curFamily === 'shield') {
          shieldGuarding = true;
          skillEffects.setShieldGuard(true);
          audio.play('shield', 0.65);
          shieldGuardChangeRef.current(true);
        }
        cameraController?.setAiming(true);
        if (!document.pointerLockElement) lockPointer();
        dragging = true;
        pointerX = event.clientX;
        pointerY = event.clientY;
        if (!document.pointerLockElement) mount.setPointerCapture(event.pointerId);
      } else if (event.button === 0) {
        if (!document.pointerLockElement) lockPointer();
        holding = true;
        fire();
      }
    };

    const onUp = (event: PointerEvent) => {
      if (event.button === 0) holding = false;
      if (event.button === 2) {
        dragging = false;
        cameraController?.setAiming(false);
        if (shieldGuarding) {
          shieldGuarding = false;
          skillEffects.setShieldGuard(false);
          shieldGuardChangeRef.current(false);
        }
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (paused.current || sandboxOpen.current || chatOpen.current || !weapons.length) return;
      active.current?.switchWeapon((selected + (event.deltaY > 0 ? 1 : weapons.length - 1)) % weapons.length);
    };

    const onContext = (event: MouseEvent) => event.preventDefault();
    const onLockChange = () => {
      dragging = false;
      if (document.pointerLockElement) { lockAttempts = 0; return; }
      keys.clear();
      holding = false;
      cameraController?.setAiming(false);
      if (ready && !paused.current && !sandboxOpen.current && !chatOpen.current) pauseRef.current();
    };

    const onLockError = () => {
      if (cancelled || paused.current || sandboxOpen.current || chatOpen.current || lockAttempts >= 3) return;
      lockAttempts += 1;
      window.clearTimeout(lockTimer);
      lockTimer = window.setTimeout(lockPointer, 1200);
    };

    addEventListener('keydown', onKeyDown);
    addEventListener('keyup', onKeyUp);
    addEventListener('blur', onBlur);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointerup', onUp);
    mount.addEventListener('wheel', onWheel, { passive: false });
    mount.addEventListener('contextmenu', onContext);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('pointerlockerror', onLockError);

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const load = async () => {
      const loader = new GLTFLoader();
      const [mapGltf, collisionGltf, avatar] = await Promise.all([
        loader.loadAsync(`${BASE}${map.scene}`),
        map.collision ? loader.loadAsync(`${BASE}${map.collision}`).catch(() => null) : Promise.resolve(null),
        createBattleAvatar(creation, avatarPreset ?? creation.jobs[character.jobId].presets[character.appearance.gender],
          avatarPreset ? initialAppearance(avatarPreset, character.appearance.gender) : character.appearance, weapons),
      ]);
      if (cancelled) { avatar.dispose(); return; }

      playerAvatar = avatar;
      visual = mapGltf.scene;
      collision = collisionGltf?.scene ?? null;

      // 注册场景网格与物理碰撞
      mapCollider.registerVisualScene(visual, map.airWalls);
      if (collision) mapCollider.registerCollisionScene(collision);
      scene.add(visual);

      // 如果当前房间选择了沙盒自制自定义地图，挂载全部自定义地形块、模型、NPC人物与怪物BOSS
      if (customMap) {
        await mountCustomMapNodesIntoScene(customMap, scene, mapCollider, botManager, assets);
      }

      // 2. 主玩家实体化 (绑定 PlayerEntity 核心类与 BattleAvatar 完整武器/动作系统)
      localPlayer = new PlayerEntity(scene);
      localPlayer.attachBattleAvatar(avatar);
      localPlayer.setCollisionEnvironment(mapCollider.toCollisionEnvironment());

      // 挂接音效与事件
      localPlayer.events.onFootstep = (idx) => audio.play(`step${idx}`, 0.35);
      localPlayer.events.onJump = () => audio.play('jump');
      localPlayer.events.onLand = () => audio.play('land', 0.4);
      localPlayer.events.onRoll = () => audio.play('roll');
      localPlayer.events.onDamage = (dmg) => damageRef.current(dmg);

      // 挂载跟随宠物伴侣 (若玩家装备了宠物)
      if (hasPetCompanion) {
        const petGeo = new THREE.OctahedronGeometry(0.28, 1);
        const petMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.85,
          metalness: 0.6,
          roughness: 0.2,
        });
        petCompanionMesh = new THREE.Mesh(petGeo, petMat);
        petCompanionMesh.position.set(-0.65, 1.55, -0.45);
        localPlayer.modelGroup.add(petCompanionMesh);
      }

      // 3. 相机控制器实例化并绑定
      cameraController = new CameraController(camera, {
        distance: 2.9,
        pitch: 0.1,
        yaw: 0,
        heightOffset: 1.25,
        shoulderOffset: 0.35
      });
      cameraController.setTarget(localPlayer.modelGroup);

      // 4. 使用已验证的可行走地面出生点 (防止俯瞰相机坐标将玩家刷在场外高空)
      const safeSpawn = resolveSafeSpawn('red', 0);
      const holdVec = resolveHoldPointVec();
      localPlayer.modelGroup.position.copy(safeSpawn);
      const initialYaw = Math.atan2(holdVec.x - safeSpawn.x, holdVec.z - safeSpawn.z);
      localPlayer.modelGroup.rotation.y = initialYaw;
      cameraController.yaw = initialYaw;

      // 5. 构建当前模式的 3D 场景交互目标物 (占点光环 / 红蓝战旗 / 黄金宝箱 / C4爆破点 / 远征Boss)
      if (normalizedMode === 'occupy') {
        const ringGeo = new THREE.TorusGeometry(4.2, 0.2, 16, 48);
        ringGeo.rotateX(Math.PI / 2);
        const ringMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xd97706,
          emissiveIntensity: 0.8,
        });
        holdRingMesh = new THREE.Mesh(ringGeo, ringMat);
        holdRingMesh.position.set(holdVec.x, holdVec.y + 0.18, holdVec.z);
        objectiveGroup.add(holdRingMesh);

        const beaconGeo = new THREE.CylinderGeometry(0.35, 0.35, 7.5, 16, 1, true);
        const beaconMat = new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0.28,
          side: THREE.DoubleSide,
        });
        holdBeaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
        holdBeaconMesh.position.set(holdVec.x, holdVec.y + 3.75, holdVec.z);
        objectiveGroup.add(holdBeaconMesh);
      } else if (normalizedMode === 'flag') {
        const makeFlagMesh = (colorHex: number) => {
          const g = new THREE.Group();
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 3.2, 10),
            new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8 })
          );
          pole.position.y = 1.6;
          const cloth = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 0.7, 0.06),
            new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.55 })
          );
          cloth.position.set(0.55, 2.75, 0);
          const base = new THREE.Mesh(
            new THREE.CylinderGeometry(1.2, 1.4, 0.2, 20),
            new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.35 })
          );
          base.position.y = 0.1;
          g.add(pole, cloth, base);
          return g;
        };

        const redFlagPos = safeSpawn.clone().add(new THREE.Vector3(2.2, 0, 2.2));
        redFlagPos.y = mapCollider.floorAt(redFlagPos.x, redFlagPos.z, redFlagPos.y + 30) ?? safeSpawn.y;
        redFlagMesh = makeFlagMesh(0xef4444);
        redFlagMesh.position.copy(redFlagPos);
        objectiveGroup.add(redFlagMesh);

        blueFlagMesh = makeFlagMesh(0x3b82f6);
        blueFlagMesh.position.copy(holdVec);
        objectiveGroup.add(blueFlagMesh);

        carriedFlagMesh = makeFlagMesh(0x3b82f6);
        carriedFlagMesh.scale.setScalar(0.55);
        carriedFlagMesh.position.set(0, 1.15, -0.35);
        carriedFlagMesh.visible = false;
        localPlayer.modelGroup.add(carriedFlagMesh);
      } else if (normalizedMode === 'treasure') {
        const rawT = map.treasureSpawns?.length
          ? map.treasureSpawns
          : [
              [holdVec.x, holdVec.y, holdVec.z],
              [holdVec.x - 5, holdVec.y, holdVec.z - 5],
              [holdVec.x + 5, holdVec.y, holdVec.z + 5],
              [holdVec.x - 5, holdVec.y, holdVec.z + 5],
              [holdVec.x + 5, holdVec.y, holdVec.z - 5],
            ];
        for (const coords of rawT) {
          const tx = coords[0] ?? holdVec.x;
          const tz = coords[2] ?? holdVec.z;
          const ty = mapCollider.floorAt(tx, tz, (coords[1] ?? 10) + 45) ?? holdVec.y;
          const chestGroup = new THREE.Group();
          const box = new THREE.Mesh(
            new THREE.BoxGeometry(0.95, 0.72, 0.68),
            new THREE.MeshStandardMaterial({
              color: 0xfbbf24,
              emissive: 0xd97706,
              emissiveIntensity: 0.55,
              metalness: 0.7,
              roughness: 0.25,
            })
          );
          box.position.y = 0.45;
          chestGroup.add(box);
          chestGroup.position.set(tx, ty, tz);
          objectiveGroup.add(chestGroup);
          treasureChests.push({ mesh: chestGroup, pos: new THREE.Vector3(tx, ty, tz), respawnAt: 0 });
        }
      } else if (normalizedMode === 'blast') {
        const sites = map.bombSites?.length
          ? map.bombSites
          : [
              [holdVec.x - 4, holdVec.y, holdVec.z],
              [holdVec.x + 4, holdVec.y, holdVec.z],
            ];
        sites.forEach((sc, idx) => {
          const bx = sc[0] ?? holdVec.x;
          const bz = sc[2] ?? holdVec.z;
          const by = mapCollider.floorAt(bx, bz, (sc[1] ?? 10) + 45) ?? holdVec.y;
          const pad = new THREE.Mesh(
            new THREE.CylinderGeometry(2.6, 2.6, 0.16, 28),
            new THREE.MeshStandardMaterial({
              color: idx === 0 ? 0xef4444 : 0xf97316,
              emissive: idx === 0 ? 0xdc2626 : 0xea580c,
              emissiveIntensity: 0.65,
            })
          );
          pad.position.set(bx, by + 0.08, bz);
          objectiveGroup.add(pad);
          bombSiteMeshes.push(pad);
        });

        plantedBombMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.3, 0.4),
          new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xff0000, emissiveIntensity: 1.0 })
        );
        plantedBombMesh.visible = false;
        objectiveGroup.add(plantedBombMesh);
      } else if (normalizedMode === 'boss') {
        bossGroup = new THREE.Group();
        const core = new THREE.Mesh(
          new THREE.DodecahedronGeometry(1.25, 1),
          new THREE.MeshStandardMaterial({
            color: BOSS_STAGES[0].color,
            emissive: 0x7f1d1d,
            emissiveIntensity: 0.6,
            metalness: 0.65,
            roughness: 0.25,
          })
        );
        core.position.y = 1.8;
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1.75, 0.14, 12, 32),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xd97706, emissiveIntensity: 0.8 })
        );
        ring.position.y = 1.8;
        bossHitboxMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(1.5, 1.5, 3.6, 12),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        bossHitboxMesh.position.y = 1.8;
        bossHitboxMesh.userData = { isBoss: true, userId: '__boss__' };
        bossGroup.add(core, ring, bossHitboxMesh);
        bossGroup.position.copy(holdVec);
        bossGroup.scale.setScalar(BOSS_STAGES[0].scale);
        objectiveGroup.add(bossGroup);
        mapCollider.collisionMeshes.push(bossHitboxMesh);
      }

      // 单人或练习房间进场时自动在主战场召唤 AI 对手
      const humanCount = roomPlayers ? Object.keys(roomPlayers).length : 0;
      if (humanCount <= 1 && botManager.bots.length === 0) {
        const botOrigin = holdVec.distanceTo(safeSpawn) < 48 ? holdVec : safeSpawn.clone().lerp(holdVec, 0.35);
        const env = mapCollider.toCollisionEnvironment();
        void botManager.spawnBot({ mode: 'patrol', originPosition: botOrigin, collisionEnv: env });
        void botManager.spawnBot({ mode: 'chase', originPosition: botOrigin, collisionEnv: env });
        if (normalizedMode === 'team' || normalizedMode === 'kill' || normalizedMode === 'boss') {
          void botManager.spawnBot({ mode: 'chase', originPosition: botOrigin, collisionEnv: env });
        }
      }

      ready = true;
      readyRef.current();
      lockPointer();
    };

    void load().catch((error: unknown) => {
      if (!cancelled) mount.dataset.error = error instanceof Error ? error.message : '战场加载失败';
    });

    const animate = () => {
      frame = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      const nowMs = performance.now();

      if (buffExpireAt > 0 && nowMs > buffExpireAt) {
        buffExpireAt = 0;
        buffDamageMult = 1.0;
        buffSpeedMult = 1.0;
        activeBuffLabel = '';
      }

      if (petCompanionMesh) {
        petCompanionMesh.rotation.y += delta * 2.4;
        petCompanionMesh.position.y = 1.55 + Math.sin(nowMs * 0.004) * 0.12;
      }

      // 多人联机对手同步与插值
      if (otherPlayers.current) {
        const renderTime = nowMs - 100;
        for (const [userIdStr, stateObj] of Object.entries(otherPlayers.current)) {
          const buffer = stateObj.buffer;
          if (buffer.length === 0) continue;

          let state0 = buffer[0];
          let state1 = buffer[buffer.length - 1];
          let found = false;

          for (let i = buffer.length - 1; i >= 0; i--) {
            if (buffer[i].time <= renderTime) {
              state0 = buffer[i];
              state1 = buffer[i + 1] || buffer[i];
              found = true;
              break;
            }
          }
          if (!found) {
            state0 = buffer[0];
            state1 = buffer[0];
          }

          let interpX = state0.x;
          let interpZ = state0.z;
          let interpYaw = state0.yaw;

          if (state0 !== state1 && state1.time > state0.time) {
            const t = (renderTime - state0.time) / (state1.time - state0.time);
            const clampedT = Math.max(0, Math.min(1, t));
            interpX = state0.x + (state1.x - state0.x) * clampedT;
            interpZ = state0.z + (state1.z - state0.z) * clampedT;
            let dy = state1.yaw - state0.yaw;
            while (dy > Math.PI) dy -= Math.PI * 2;
            while (dy < -Math.PI) dy += Math.PI * 2;
            interpYaw = state0.yaw + dy * clampedT;
          }

          let remoteEntity = otherPlayerEntities.get(userIdStr);
          if (!remoteEntity) {
            remoteEntity = new PlayerEntity(scene);
            remoteEntity.hitbox.userData = { isPlayer: true, userId: userIdStr, entity: remoteEntity };
            mapCollider.collisionMeshes.push(remoteEntity.hitbox);
            otherPlayerEntities.set(userIdStr, remoteEntity);

            const pInfo = roomPlayers && roomPlayers[userIdStr];
            if (pInfo && pInfo.jobId && pInfo.appearance) {
              const job = (creation.jobs as any)[pInfo.jobId];
              if (job) {
                const preset = job.presets[pInfo.appearance.gender];
                let pWeapons = pInfo.weaponIds ? pInfo.weaponIds.map((wId: string) => assets.weapons[wId]).filter(Boolean) : job.weapons;
                if (!pWeapons || pWeapons.length === 0) pWeapons = job.weapons;
                createBattleAvatar(creation, preset, pInfo.appearance, pWeapons).then(loadedAvatar => {
                  remoteEntity!.attachBattleAvatar(loadedAvatar);
                }).catch(err => {
                  console.error('Remote player load error:', err);
                  logDebug(`[Avatar Error] ${err.message || String(err)}`);
                });
              }
            } else {
              remoteEntity.loadAvatar('/assets/creation/models/malecommandos.glb', '/assets/creation/models/body01.glb').then(() => {
                void remoteEntity!.loadAnimations(getWeaponActionSuite('smg_01').actions);
              }).catch(() => null);
            }
          }

          const floor = mapCollider.floorAt(interpX, interpZ, 80) ?? 0;
          const oldPos = remoteEntity.modelGroup.position.clone();
          remoteEntity.setTransform(interpX, floor, interpZ, interpYaw);

          if (remoteEntity.isReady) {
            const speed = oldPos.distanceTo(remoteEntity.modelGroup.position) / delta;
            if (remoteEntity.battleAvatar) {
              remoteEntity.battleAvatar.setMoving(speed > 0.1);
              remoteEntity.battleAvatar.update(delta);
            } else {
              if (speed > 0.1) {
                remoteEntity.playAction('run', 0.15, true);
              } else {
                remoteEntity.playAction('idle', 0.15, true);
              }
              if (remoteEntity.mixer) remoteEntity.mixer.update(delta);
            }
          }
        }
      }

      if (paused.current !== audioPaused) {
        audioPaused = paused.current;
        if (audioPaused) audio.pause();
        else audio.start();
      }

      if (holding && ready && !paused.current && !sandboxOpen.current && !chatOpen.current) fire();
      if (sandboxRules.current.noCooldown) skillEffects.resetCooldowns();
      skillEffects.update(delta);
      if (passives.regenPerTick > 0) {
        regenTimer -= delta;
        if (regenTimer <= 0) {
          regenTimer = 2;
          if (health.current < MAX_HEALTH * 0.5) {
            audio.play('skill-tenacity', 0.45);
            healRef.current(passives.regenPerTick);
            if (localPlayer) {
              combatEffects.spawnFloatingHeal(localPlayer.modelGroup.position, passives.regenPerTick);
              combatEffects.spawnStatusText(localPlayer.modelGroup.position, `💛 坚韧回血 +${passives.regenPerTick}`, '#facc15');
            }
          }
        }
      }

      // 主玩家输入驱动与更新
      if (localPlayer && ready) {
        localPlayer.godMode = sandboxRules.current.godMode;
        localPlayer.setMotion(motion.current);
        localPlayer.setSpeed(skillEffects.speed(localPlayer.getBaseSpeed()) * buffSpeedMult);

        const dir = new THREE.Vector3();
        if (!sandboxOpen.current && !chatOpen.current) {
          if (keys.has('KeyW') || keys.has('ArrowUp')) dir.z += 1;
          if (keys.has('KeyS') || keys.has('ArrowDown')) dir.z -= 1;
          if (keys.has('KeyA') || keys.has('ArrowLeft')) dir.x += 1;
          if (keys.has('KeyD') || keys.has('ArrowRight')) dir.x -= 1;
          if (dir.lengthSq() > 0) dir.normalize();
        }

        const yaw = cameraController?.yaw ?? 0;
        localPlayer.setInput(dir, yaw, false);
        localPlayer.update(delta);

        botManager.autoRespawn = normalizedMode === 'kill' ? false : sandboxRules.current.autoRespawnBots;
        botManager.update(delta, localPlayer, skillEffects.isStealthed());

        cameraController?.update(delta, mapCollider.collisionMeshes);

        const currentPos = localPlayer.modelGroup.position;
        const currentYaw = localPlayer.modelGroup.rotation.y;
        if (nowMs - (positionRef.current as any).lastTime > 66 || !(positionRef.current as any).lastTime) {
          (positionRef.current as any).lastTime = nowMs;
          positionRef.current(currentPos.x, currentPos.z, currentYaw);
        }

        // 6. 模式专属 3D 目标实时判定与推进
        let statusText = '团队竞技 · 击败敌方目标夺取胜利';
        let ownerTeam: 'neutral' | 'red' | 'blue' = 'neutral';

        if (normalizedMode === 'occupy' && holdRingMesh) {
          holdRingMesh.rotation.z += delta * 0.8;
          const dist = currentPos.distanceTo(holdRingMesh.position);
          const enemyNear = botManager.getAliveTargets().some((b) => b.position.distanceTo(holdRingMesh.position) < 6.5);
          if (dist < 6.5 && !enemyNear) {
            occupyProgress = Math.min(100, occupyProgress + delta * 22);
          } else if (enemyNear && dist >= 6.5) {
            occupyProgress = Math.max(-100, occupyProgress - delta * 14);
          }
          ownerTeam = occupyProgress >= 50 ? 'red' : occupyProgress <= -50 ? 'blue' : 'neutral';
          if (holdRingMesh.material?.color) {
            holdRingMesh.material.color.setHex(ownerTeam === 'red' ? 0xef4444 : ownerTeam === 'blue' ? 0x3b82f6 : 0xf59e0b);
          }
          if (ownerTeam === 'red') {
            occupyTickTimer += delta;
            if (occupyTickTimer >= 3.0) {
              occupyTickTimer = 0;
              objectiveScoreRef.current(2, 0, '');
            }
          }
          statusText =
            ownerTeam === 'red'
              ? `占点模式 · 红队占领核心中 (${Math.round(occupyProgress)}%)`
              : ownerTeam === 'blue'
                ? `占点模式 · 蓝队控制核心 (${Math.round(Math.abs(occupyProgress))}%)`
                : `占点模式 · 前往中央黄环占领据点 (${Math.round(Math.max(0, occupyProgress))}%)`;
        } else if (normalizedMode === 'flag') {
          if (!carryingFlag && blueFlagMesh && currentPos.distanceTo(blueFlagMesh.position) < 3.5) {
            carryingFlag = true;
            blueFlagMesh.visible = false;
            if (carriedFlagMesh) carriedFlagMesh.visible = true;
            objectiveScoreRef.current(1, 0, `🚩 [${character.name}] 夺取了蓝方战旗！护送回红方旗座！`);
          } else if (carryingFlag && redFlagMesh && currentPos.distanceTo(redFlagMesh.position) < 4.0) {
            carryingFlag = false;
            if (blueFlagMesh) blueFlagMesh.visible = true;
            if (carriedFlagMesh) carriedFlagMesh.visible = false;
            healRef.current(600);
            objectiveScoreRef.current(5, 0, `🏆 [${character.name}] 护送战旗抵达基地！红队 +5 分！`);
          }
          statusText = carryingFlag
            ? '夺旗先锋 · 🚩 已夺取敌旗！快返回红方基地旗座得分 (或按 [E] 立即交付)'
            : '夺旗先锋 · 突袭蓝方旗座夺取战旗 (可按 [E] 快速交互)';
        } else if (normalizedMode === 'treasure') {
          for (const item of treasureChests) {
            if (item.respawnAt > 0) {
              if (nowMs >= item.respawnAt) {
                item.respawnAt = 0;
                item.mesh.visible = true;
              }
              continue;
            }
            item.mesh.rotation.y += delta * 1.8;
            if (currentPos.distanceTo(item.pos) < 3.0) {
              item.respawnAt = nowMs + 8000;
              item.mesh.visible = false;
              treasuresCollected += 1;
              healRef.current(450);
              buffDamageMult = 1.35;
              buffSpeedMult = 1.22;
              buffExpireAt = nowMs + 12000;
              activeBuffLabel = '⚡ 黄金宝箱增益 (伤害+35% / 移速+22%)';
              objectiveScoreRef.current(3, 0, `💎 [${character.name}] 拾取了黄金宝箱 (#${treasuresCollected})！红队 +3 分！`);
            }
          }
          statusText = `夺宝奇兵 · 已收集宝箱 ${treasuresCollected} 个 ${activeBuffLabel ? `| ${activeBuffLabel}` : '| 靠近发光宝箱或按 [E] 拾取'}`;
        } else if (normalizedMode === 'blast') {
          if (bombPlanted) {
            bombTimer = Math.max(0, bombTimer - delta);
            if (plantedBombMesh) {
              plantedBombMesh.scale.setScalar(1 + Math.sin(nowMs * 0.02) * 0.18);
            }
            if (bombTimer <= 0) {
              bombPlanted = false;
              bombTimer = 35;
              if (plantedBombMesh) {
                combatEffects.spawnExplosionEffect(plantedBombMesh.position.clone());
                plantedBombMesh.visible = false;
              }
              audio.play('grenade-explode', 0.85);
              roundNumber += 1;
              botManager.reviveAllBots();
              objectiveScoreRef.current(5, 0, `💥 C4 雷包成功引爆！红队赢下第 ${roundNumber - 1} 回合 (+5 分)！`);
            }
            statusText = `爆破模式 · 💣 C4 已安放！引爆倒计时 ${Math.ceil(bombTimer)}s (按 [E] 交互)`;
          } else {
            statusText = `爆破模式 (第 ${roundNumber} 回合) · 前往爆破点按 [E] 安放 C4 雷包`;
          }
        } else if (normalizedMode === 'kill') {
          const aliveEnemies = botManager.getAliveTargets().length;
          if (aliveEnemies === 0 && botManager.bots.length > 0) {
            roundResetCooldown += delta;
            if (roundResetCooldown >= 2.2) {
              roundResetCooldown = 0;
              roundNumber += 1;
              botManager.reviveAllBots();
              healRef.current(800);
              objectiveScoreRef.current(4, 0, `⚔️ 全歼敌军！红队赢下第 ${roundNumber - 1} 回合！`);
            }
            statusText = `团队歼灭 · 第 ${roundNumber} 回合肃清完成！正在部署下一波敌军...`;
          } else {
            statusText = `团队歼灭 (第 ${roundNumber} 回合) · 剩余存活敌军: ${aliveEnemies} 名`;
          }
        } else if (normalizedMode === 'boss') {
          if (bossGroup && bossHp > 0) {
            bossGroup.rotation.y += delta * 1.4;
            bossAttackCooldown -= delta;
            if (bossAttackCooldown <= 0) {
              bossAttackCooldown = 4.2;
              if (currentPos.distanceTo(bossGroup.position) < 16) {
                combatEffects.spawnExplosionEffect(bossGroup.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
                takeDamage(180 + bossStageIdx * 45);
              }
            }
          }
          const curStage = BOSS_STAGES[bossStageIdx];
          statusText = bossHp > 0
            ? `远征首领战 · ${curStage.name} | HP: ${bossHp} / ${bossMaxHp}`
            : `远征首领战 · 🏆 全部 5 阶段首领已彻底击溃！`;
        }

        if (nowMs - lastObjSync > 180) {
          lastObjSync = nowMs;
          objectiveStateRef.current({
            modeId: normalizedMode,
            statusText,
            progress: Math.round(Math.abs(occupyProgress)),
            ownerTeam,
            carryingFlag,
            treasuresCollected,
            activeBuff: activeBuffLabel,
            bombPlanted,
            bombTimer: Math.ceil(bombTimer),
            roundNumber,
            bossName: normalizedMode === 'boss' ? BOSS_STAGES[bossStageIdx].name : undefined,
            bossHp: normalizedMode === 'boss' ? bossHp : undefined,
            bossMaxHp: normalizedMode === 'boss' ? bossMaxHp : undefined,
            bossStage: normalizedMode === 'boss' ? bossStageIdx + 1 : undefined,
          });
        }
      }

      if (nowMs - lastHotbar > 100) {
        lastHotbar = nowMs;
        const snap = skillEffects.snapshot();
        const bySlot = skillEffects.bySlot();
        const byIdObj: Record<string, number> = {};
        for (const l of allLoadsRef.current) {
          const cdVal = skillEffects.cooldownOfSkill?.(l.skill.id) ?? 0;
          if (cdVal > 0) byIdObj[l.skill.id] = cdVal;
        }
        hotbarRef.current({
          cooldowns: BATTLE_QUICK_KEYS.map((_, index) => bySlot.get(index) ?? 0),
          byId: byIdObj,
          shield: snap.shield,
          stealthed: skillEffects.isStealthed(),
          speed: snap.speed,
          maxHealthScale: snap.maxHealthScale,
          transferEnergy: Math.round(transfer.stored),
        });
      }

      if (shotFlash > 0) { shotFlash -= delta; if (shotFlash <= 0) flash.intensity = 0; }
      combatEffects.update(delta);
      projectiles.update(delta);
      mount.dataset.projectileCount = String(projectiles.count());
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      removeEventListener('keydown', onKeyDown);
      removeEventListener('keyup', onKeyUp);
      removeEventListener('blur', onBlur);
      document.removeEventListener('pointermove', onMove);
      window.clearTimeout(lockTimer);
      mount.removeEventListener('wheel', onWheel);
      mount.removeEventListener('contextmenu', onContext);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', onLockError);
      active.current = null;
      if (document.pointerLockElement) document.exitPointerLock();

      audio.dispose();
      skillEffects.dispose();
      combatEffects.dispose();
      botManager.dispose();
      projectiles.dispose();
      playerAvatar?.dispose();
      localPlayer?.dispose();
      for (const entity of otherPlayerEntities.values()) {
        entity.dispose();
      }
      otherPlayerEntities.clear();
      mapCollider.dispose();

      if (visual) {
        visual.traverse((object: any) => {
          if (object instanceof THREE.Mesh) {
            object.geometry?.dispose();
            const mats = Array.isArray(object.material) ? object.material : [object.material];
            mats.forEach((m: any) => m?.dispose());
          }
        });
      }
      if (collision) {
        collision.traverse((object: any) => {
          if (object instanceof THREE.Mesh) object.geometry?.dispose();
        });
      }

      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [map, character.jobId, character.name, creation, assets, avatarPreset, weapons, active, paused]);

  return <div className="battle-canvas" ref={mountRef} data-gameplay-canvas />;
}

export default function Gameplay({ room, character, creation, assets, avatarPreset, quickbar, skills, levels, bossSkills = [],
  volume, effectsVolume, onVolume, onEffectsVolume, onExit, onQuit = onExit }: {
  room: RoomConfig & { id?: string; players?: Record<string, any> };
  character: SavedCharacter;
  creation: CreationAssets;
  assets: LobbyAssets;
  avatarPreset?: CreationPreset;
  quickbar: (string | null)[];
  skills: Skill[];
  levels: number[];
  bossSkills?: Skill[];
  volume: number;
  effectsVolume: number;
  onVolume: (value: number) => void;
  onEffectsVolume: (value: number) => void;
  onExit: () => void;
  onQuit?: () => void;
}) {
  const [mapDefinitions, setMapDefinitions] = useState<Record<string, MapDefinition>>();
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [sandboxRules, setSandboxRules] = useState<SandboxRules>({
    infiniteAmmo: false,
    noCooldown: false,
    godMode: false,
    autoRespawnBots: true,
  });
  const [bots, setBots] = useState<BotSnapshot[]>([]);
  const [botMode, setBotMode] = useState<BotBehaviorMode>('dummy');
  const [hitMarker, setHitMarker] = useState<{ active: boolean; crit: boolean }>({ active: false, crit: false });
  const [recoilSpread, setRecoilSpread] = useState(0);
  const [hurtFlash, setHurtFlash] = useState(false);
  const [scopedFamily, setScopedFamily] = useState<string>('');
  const [shieldGuarding, setShieldGuarding] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatChannel, setChatChannel] = useState<'all' | 'team' | 'world'>('all');
  const [chatInput, setChatInput] = useState('');
  const [voiceWheelOpen, setVoiceWheelOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<BattleChatMessage[]>([
    {
      id: 'sys-init',
      sender: '战术指挥部',
      channel: 'system',
      content: '按 [Enter] 开启局内聊天，按 [V] 呼出战术快捷语音，按 [Q/F/Z/X] 或点击技能栏释放全职业/首领技能！',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const chatOpenRef = useRef(false);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement | null>(null);
  chatOpenRef.current = chatOpen;

  const [remaining, setRemaining] = useState(ROUND_LENGTH);
  const [scoreRed, setScoreRed] = useState(0);
  const [scoreBlue, setScoreBlue] = useState(0);
  const [playerKills, setPlayerKills] = useState(0);
  const [playerDeaths, setPlayerDeaths] = useState(0);
  const [objectivePoints, setObjectivePoints] = useState(0);
  const [killFeed, setKillFeed] = useState<Array<{ id: number; text: string; color?: string }>>([]);
  const [objectiveState, setObjectiveState] = useState<ModeObjectiveState>({
    modeId: room.modeId || 'team',
    statusText: `${room.modeName || '团队竞技'} · 击败敌方目标夺取胜利`,
    progress: 0,
    ownerTeam: 'neutral',
    carryingFlag: false,
    treasuresCollected: 0,
    activeBuff: '',
    bombPlanted: false,
    bombTimer: 35,
    roundNumber: 1,
  });
  const [respawnCountdown, setRespawnCountdown] = useState(0);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showSettlement, setShowSettlement] = useState(false);
  const [flippedCards, setFlippedCards] = useState<Record<number, { name: string; icon: string; amount: string; rarity: string }>>({});
  const damageBonusMult = useMemo(() => Math.max(1, 1 + Math.max(0, (character.power ?? 1500) - 1500) / 2500), [character.power]);
  const [hasPetCompanion] = useState(true);

  const wsRef = useRef<WebRTCClient | null>(null);
  const sequenceRef = useRef(0);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const logDebug = (msg: string) => setDebugLog(prev => [...prev.slice(-4), msg]);

  const pushKillFeed = (text: string, color = '#fde047') => {
    if (!text) return;
    setKillFeed((prev) => [{ id: Date.now() + Math.random(), text, color }, ...prev.slice(0, 4)]);
  };

  const myUserId = useMemo(() => {
    const me = Object.values(room.players || {}).find((p: any) => p.username === character.name);
    const resolvedId = me ? (me as any).userId : 0;
    return resolvedId;
  }, [room.players, character.name]);
  const otherPlayersRef = useRef<Record<string, { buffer: {x: number, z: number, yaw: number, time: number}[] }>>({});
  const [selected, setSelected] = useState(0);
  const [ammo, setAmmo] = useState<number[]>([]);
  const [reserves, setReserves] = useState<number[]>([]);
  const [health, setHealth] = useState(MAX_HEALTH);
  const [position, setPosition] = useState({ x: 0, z: 0, yaw: 0 });
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [hotbar, setHotbar] = useState<HotbarState>({ cooldowns: [], byId: {}, shield: 0, stealthed: false, speed: 0, maxHealthScale: 1 });
  const [motion, setMotion] = useState(true);
  const motionRef = useRef(true);
  const healthRef = useRef(MAX_HEALTH);
  const sandboxOpenRef = useRef(false);
  const sandboxRulesRef = useRef<SandboxRules>(sandboxRules);
  motionRef.current = motion;
  healthRef.current = health;
  sandboxOpenRef.current = sandboxOpen;
  sandboxRulesRef.current = sandboxRules;
  const control = useRef<BattleControl | null>(null);
  const selectedRef = useRef(0);
  const pausedRef = useRef(false);
  const ammoRef = useRef<number[]>([]);
  const reservesRef = useRef<number[]>([]);
  const hitTimerRef = useRef(0);
  const recoilTimerRef = useRef(0);
  const hurtTimerRef = useRef(0);
  pausedRef.current = paused || showSettlement;
  ammoRef.current = ammo;
  reservesRef.current = reserves;
  const loads = useMemo(() => loadSkills(skills, levels), [skills, levels]);
  const bossLoads = useMemo(() => loadSkills(bossSkills, bossSkills.map(() => 1)), [bossSkills]);
  const allLoads = useMemo(() => [...loads, ...bossLoads], [loads, bossLoads]);
  const { slots, weapons } = useMemo(() => resolveLoadout(quickbar, assets.weapons, loads), [quickbar, assets, loads]);
  const current = weapons[selected] ?? weapons[0];
  const currentFamily = (current?.id ?? '').split('_')[0] ?? '';
  const currentKind = weaponKind(current?.id ?? '');
  const currentMagazine = current ? magazine(current) : 0;
  const maxHealth = Math.round(MAX_HEALTH * (hotbar.maxHealthScale || 1));
  const customMap = useMemo(() => getCustomMapById(room.mapId), [room.mapId]);
  const chosenMap = (customMap ? mapDefinitions?.[customMap.baseMapId] : mapDefinitions?.[room.mapId]) ?? mapDefinitions?.level1;
  const mapArt = chosenMap?.minimap;

  const reticleVariantClass = useMemo(() => {
    if (currentFamily === 'shotgun') return ' reticle-shotgun';
    if (currentFamily === 'sprayer') return ' reticle-sprayer';
    if (currentFamily === 'sniperrifle' || currentFamily === 'crossbow') return ' reticle-sniper';
    if (currentFamily === 'shield') return ' reticle-shield';
    return '';
  }, [currentFamily]);

  useEffect(() => {
    if ((paused || sandboxOpen || showSettlement || chatOpen) && document.pointerLockElement) document.exitPointerLock();
  }, [paused, sandboxOpen, showSettlement, chatOpen]);

  // Load recent chat history on battle mount
  useEffect(() => {
    apiFetch('/chat/history')
      .then((res) => {
        const list = Array.isArray(res) ? res : (Array.isArray(res?.messages) ? res.messages : []);
        if (list.length > 0) {
          const recent: BattleChatMessage[] = list.slice(-8).map((m: any, idx: number) => ({
            id: `hist-${idx}-${Date.now()}`,
            sender: m.sender || '玩家',
            channel: (m.channel === 'team' || m.channel === 'world' ? m.channel : 'all'),
            content: m.content || m.message || '',
            time: m.createdAt ? String(m.createdAt).slice(11, 16) : '刚刚',
          }));
          setChatMessages((prev) => [...prev, ...recent].slice(-25));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const sendBattleChat = (overrideText?: string) => {
    const content = (overrideText ?? chatInput).trim();
    if (!content) {
      chatOpenRef.current = false;
      setChatOpen(false);
      void document.body.requestPointerLock();
      return;
    }
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgId = `local-${Date.now()}-${Math.random()}`;
    setChatMessages((prev) => [
      ...prev.slice(-29),
      { id: msgId, sender: character.name, channel: chatChannel, content, time: nowTime },
    ]);
    control.current?.spawnChatBubbleForUser(myUserId, character.name, content);

    if (wsRef.current) {
      wsRef.current.sendJSON({
        type: 'chat',
        userId: myUserId,
        sender: character.name,
        channel: chatChannel,
        message: content,
        content,
      });
    }
    void apiFetch('/chat/send', {
      method: 'POST',
      body: JSON.stringify({
        channel: chatChannel,
        roomId: room.id ?? '',
        sender: character.name,
        message: content,
        content,
      }),
    }).catch(() => undefined);

    if (overrideText === undefined) {
      setChatInput('');
      chatOpenRef.current = false;
      setChatOpen(false);
      void document.body.requestPointerLock();
    }
  };

  // Respawn countdown when player HP reaches 0
  useEffect(() => {
    if (health > 0 || respawnCountdown > 0) return;
    setPlayerDeaths((d) => d + 1);
    setScoreBlue((b) => b + 1);
    pushKillFeed(`💀 [${character.name}] 阵亡，3 秒后于红方基地重整复活`, '#f87171');
    setRespawnCountdown(3);
  }, [health]);

  useEffect(() => {
    if (respawnCountdown <= 0) return;
    const t = window.setTimeout(() => {
      if (respawnCountdown <= 1) {
        setRespawnCountdown(0);
        setHealth(maxHealth);
        setAmmo(weapons.map(magazine));
        control.current?.respawnPlayer();
      } else {
        setRespawnCountdown((c) => c - 1);
      }
    }, 1000);
    return () => window.clearTimeout(t);
  }, [respawnCountdown, maxHealth, weapons]);

  // Trigger post-match settlement (game_balance.lua) when timer expires
  useEffect(() => {
    if (ready && remaining === 0 && !showSettlement) {
      setShowSettlement(true);
    }
  }, [ready, remaining, showSettlement]);

  useEffect(() => {
    const roomId = room.id ?? 'default-room';
    const gameUrl = `${WS_BASE}?roomId=${roomId}&playerId=${myUserId}`;
    const sigUrl = `${WS_BASE.replace('/ws', '/webrtc')}?roomId=${roomId}&playerId=${myUserId}`;
    const ws = new WebRTCClient(gameUrl, sigUrl, () => {
      logDebug(`[Network] WebRTC DataChannel OPENED! 握手成功`);
      sequenceRef.current++;
      ws.sendMove(myUserId, position.x, position.z, position.yaw, sequenceRef.current);
    });
    wsRef.current = ws;

    ws.onMessage = (msg) => {
      try {
        if (msg.type === 'tick') {
          setRemaining(msg.time_left);
          setScoreRed(msg.score_red);
          setScoreBlue(msg.score_blue);
        } else if (msg.type === 'health_update' && msg.userId == myUserId) {
          setHealth(msg.hp);
        } else if (msg.type === 'sync' && msg.userId != myUserId) {
          if (!otherPlayersRef.current[msg.userId]) {
            logDebug(`[Network] 接收到玩家数据 (userId=${msg.userId})，开始渲染`);
            otherPlayersRef.current[msg.userId] = { buffer: [] };
          }
          const buffer = otherPlayersRef.current[msg.userId].buffer;
          buffer.push({ x: msg.x, z: msg.z, yaw: msg.yaw, time: performance.now() });
          if (buffer.length > 20) buffer.shift();
        } else if (msg.type === 'chat') {
          const senderName = msg.sender || '战友';
          const textContent = msg.content || '';
          if (senderName !== character.name && textContent) {
            const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setChatMessages((prev) => [
              ...prev.slice(-29),
              {
                id: `ws-${Date.now()}-${Math.random()}`,
                sender: senderName,
                channel: msg.channel === 'team' || msg.channel === 'world' ? msg.channel : 'all',
                content: textContent,
                time: nowTime,
              },
            ]);
            control.current?.spawnChatBubbleForUser(msg.userId ?? 0, senderName, textContent);
          }
        } else if (msg.type === 'respawn' && msg.userId == myUserId) {
          setHealth(maxHealth);
        } else if (msg.type === 'game_over') {
          setShowSettlement(true);
        }
      } catch (err) {}
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [room.id, myUserId, character.name]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${BASE}maps.json`, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error('地图清单加载失败');
      return response.json() as Promise<Record<string, MapDefinition>>;
    }).then((definitions) => setMapDefinitions(definitions)).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(String(reason));
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setAmmo(weapons.map(magazine));
    setReserves(weapons.map((weapon) => magazine(weapon) * 4));
  }, [weapons]);

  useEffect(() => {
    if (!ready || paused || showSettlement || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [ready, paused, showSettlement, remaining]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        if (pausedRef.current || sandboxOpenRef.current) return;
        if (!chatOpenRef.current) {
          event.preventDefault();
          chatOpenRef.current = true;
          setChatOpen(true);
          if (document.pointerLockElement) document.exitPointerLock();
          window.setTimeout(() => chatInputRef.current?.focus(), 20);
        }
        return;
      }
      if (chatOpenRef.current) {
        if (event.key === 'Escape') {
          event.preventDefault();
          chatOpenRef.current = false;
          setChatOpen(false);
          void document.body.requestPointerLock();
        }
        return;
      }
      if (event.code === 'KeyV' && !event.repeat && !pausedRef.current && !sandboxOpenRef.current) {
        event.preventDefault();
        setVoiceWheelOpen((prev) => !prev);
        return;
      }
      if (voiceWheelOpen && ['1', '2', '3', '4', '5'].includes(event.key)) {
        event.preventDefault();
        const found = TACTICAL_VOICE_CALLOUTS.find((c) => c.key === event.key);
        if (found) {
          sendBattleChat(found.text);
          setVoiceWheelOpen(false);
        }
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        setShowScoreboard((prev) => !prev);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        if (voiceWheelOpen) {
          setVoiceWheelOpen(false);
        } else if (showScoreboard) {
          setShowScoreboard(false);
        } else if (sandboxOpenRef.current) {
          sandboxOpenRef.current = false;
          setSandboxOpen(false);
          void document.body.requestPointerLock();
        } else {
          setPaused(true);
        }
      } else if (event.key === 'F2') {
        event.preventDefault();
        setSandboxOpen((prev) => {
          const next = !prev;
          sandboxOpenRef.current = next;
          if (!next && !pausedRef.current) {
            void document.body.requestPointerLock();
          }
          return next;
        });
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [showScoreboard, voiceWheelOpen, chatChannel]);

  const triggerHitMarker = (crit = false) => {
    setHitMarker({ active: true, crit });
    window.clearTimeout(hitTimerRef.current);
    hitTimerRef.current = window.setTimeout(() => setHitMarker({ active: false, crit: false }), 160);
  };

  const triggerRecoil = (spread: number) => {
    setRecoilSpread(spread);
    window.clearTimeout(recoilTimerRef.current);
    recoilTimerRef.current = window.setTimeout(() => setRecoilSpread(0), 120);
  };

  const triggerHurtFlash = () => {
    setHurtFlash(true);
    window.clearTimeout(hurtTimerRef.current);
    hurtTimerRef.current = window.setTimeout(() => setHurtFlash(false), 260);
  };

  const slotForWeapon = (index: number) => slots.findIndex((slot) => slot.kind === 'weapon' && slot.weaponIndex === index);

  const castSkill = (slot: number) => {
    if (pausedRef.current) return;
    if (control.current?.castSkill(slot)) setSelectedSlot(slot);
  };

  const selectSlot = (slot: number) => {
    const entry = slots[slot];
    if (!entry) return;
    if (entry.kind === 'weapon') {
      selectedRef.current = entry.weaponIndex;
      setSelected(entry.weaponIndex);
      setSelectedSlot(slot);
      control.current?.switchWeapon(entry.weaponIndex);
    } else if (entry.kind === 'skill') {
      castSkill(slot);
    }
  };

  const fire = () => {
    if (pausedRef.current) return;
    control.current?.fire();
  };

  const onShot = () => {
    if (sandboxRulesRef.current.infiniteAmmo) return true;
    const index = selectedRef.current;
    const curAmmo = ammoRef.current[index] ?? 0;
    if (curAmmo < 1) return false;
    const nextAmmo = curAmmo - 1;
    ammoRef.current = ammoRef.current.map((value, slot) => slot === index ? nextAmmo : value);
    setAmmo(ammoRef.current);
    if (nextAmmo <= 0) {
      window.setTimeout(() => {
        if ((ammoRef.current[selectedRef.current] ?? 0) <= 0) {
          control.current?.reload();
        }
      }, 120);
    }
    return true;
  };

  const onReload = () => {
    const index = selectedRef.current;
    const capacity = magazine(weapons[index]);
    if (sandboxRulesRef.current.infiniteAmmo) {
      ammoRef.current = ammoRef.current.map((value, slot) => slot === index ? capacity : value);
      setAmmo(ammoRef.current);
      return;
    }
    const needed = capacity - (ammoRef.current[index] ?? capacity);
    if (needed <= 0) return;
    if ((reservesRef.current[index] ?? 0) <= 0) {
      reservesRef.current = reservesRef.current.map((value, slot) => slot === index ? capacity * 4 : value);
    }
    const amount = Math.min(needed, reservesRef.current[index] ?? 0);
    if (amount <= 0) return;
    ammoRef.current = ammoRef.current.map((value, slot) => slot === index ? value + amount : value);
    reservesRef.current = reservesRef.current.map((value, slot) => slot === index ? value - amount : value);
    setAmmo(ammoRef.current);
    setReserves(reservesRef.current);
  };

  const reportPosition = (x: number, z: number, yaw: number) => {
    if (wsRef.current) {
      sequenceRef.current++;
      wsRef.current.sendMove(myUserId, x, z, yaw, sequenceRef.current);
    }
    setPosition((previous) => Math.abs(previous.x - x) + Math.abs(previous.z - z) + Math.abs(previous.yaw - yaw) > 2.0
      ? { x, z, yaw } : previous);
  };

  const handleFlipRewardCard = async (cardIdx: number) => {
    if (flippedCards[cardIdx] || Object.keys(flippedCards).length >= 3) return;
    try {
      const data = await apiFetch('/battle/flip-card', {
        method: 'POST',
        body: JSON.stringify({ cardIndex: cardIdx, modeId: room.modeId, victory: scoreRed >= scoreBlue }),
      });
      if (data?.reward) {
        setFlippedCards((prev) => ({ ...prev, [cardIdx]: data.reward }));
        return;
      }
    } catch {}
    // Fallback local reward pool (ported from game_balance.lua)
    const fallbackPool = [
      { name: '强化石礼袋', icon: '💎', amount: 'x5', rarity: 'epic' },
      { name: '高纯度稳压剂', icon: '🧪', amount: 'x2', rarity: 'rare' },
      { name: '黄金战星金币', icon: '🪙', amount: '+1,200', rarity: 'common' },
      { name: '远征首领勋章', icon: '🏅', amount: 'x3', rarity: 'epic' },
      { name: '暗黑巨龙宠物蛋碎片', icon: '🐉', amount: 'x2', rarity: 'legendary' },
      { name: '星币补给箱', icon: '✨', amount: '+180', rarity: 'rare' },
      { name: '角色传承结晶', icon: '🔮', amount: 'x1', rarity: 'legendary' },
      { name: '精良武器图纸', icon: '📜', amount: 'x1', rarity: 'rare' },
      { name: '双倍经验勋章', icon: '⚡', amount: '+800 EXP', rarity: 'common' },
    ];
    const picked = fallbackPool[(cardIdx + scoreRed) % fallbackPool.length];
    setFlippedCards((prev) => ({ ...prev, [cardIdx]: picked }));
  };

  const finishAndExit = () => {
    void apiFetch('/battle/settle', {
      method: 'POST',
      body: JSON.stringify({
        roomId: room.id ?? '',
        modeName: room.modeName,
        mapName: room.mapName,
        kills: playerKills,
        deaths: playerDeaths,
        victory: scoreRed >= scoreBlue,
      }),
    }).catch(() => undefined).finally(() => onExit());
  };

  const bounds = chosenMap?.bounds;
  const markerX = bounds?.length ? 50 + (position.x - bounds[0]) / bounds[2] * 100 : 50;
  const markerY = bounds?.length ? 50 - (position.z - bounds[1]) / bounds[3] * 100 : 50;

  const activeSkillHotkeys = ['Q', 'F', 'Z', 'X', 'C', 'G'];
  const activeCastableLoads = useMemo(
    () => allLoads.filter((l) => l.skill.kind === 'active'),
    [allLoads]
  );
  const passiveLoads = useMemo(
    () => loads.filter((l) => l.skill.kind === 'passive'),
    [loads]
  );

  return <main className={`battle-root${paused ? ' paused' : ''}${sandboxOpen ? ' sandbox-open' : ''}${chatOpen ? ' chat-open' : ''}`} data-gameplay-ready={ready}>
    {chosenMap && <BattleScene
      map={chosenMap}
      customMap={customMap}
      modeId={room.modeId || 'team'}
      damageBonusMult={damageBonusMult}
      hasPetCompanion={hasPetCompanion}
      character={character}
      creation={creation}
      assets={assets}
      avatarPreset={avatarPreset}
      weapons={weapons}
      slots={slots}
      loads={loads}
      allLoads={allLoads}
      health={healthRef}
      motion={motionRef}
      active={control}
      paused={pausedRef}
      sandboxOpen={sandboxOpenRef}
      chatOpen={chatOpenRef}
      sandboxRules={sandboxRulesRef}
      onBotsChange={setBots}
      onBotKill={(botName = '蓝方卫兵', weaponName = '武器') => {
        setPlayerKills((k) => k + 1);
        setScoreRed((prev) => prev + 1);
        pushKillFeed(`⚔️ [${character.name}] 使用 ${weaponName} 击杀了 [${botName}]`, '#34d399');
        wsRef.current?.sendJSON({ type: 'bot_kill', team: 'red' });
      }}
      onObjectiveScore={(redDelta, blueDelta, feedText) => {
        if (redDelta > 0) {
          setScoreRed((prev) => prev + redDelta);
          setObjectivePoints((p) => p + redDelta * 25);
        }
        if (blueDelta > 0) setScoreBlue((prev) => prev + blueDelta);
        if (feedText) pushKillFeed(feedText, '#fbbf24');
        wsRef.current?.sendJSON({ type: 'objective_action', redDelta, blueDelta, modeId: room.modeId });
      }}
      onObjectiveState={setObjectiveState}
      onHitMarker={triggerHitMarker}
      onRecoil={triggerRecoil}
      onScopeChange={(scoped, fam) => setScopedFamily(scoped ? fam : '')}
      onShieldGuardChange={setShieldGuarding}
      onReady={() => setReady(true)}
      onPosition={reportPosition}
      otherPlayers={otherPlayersRef}
      roomPlayers={room.players}
      logDebug={logDebug}
      onShot={onShot}
      onHotbar={setHotbar}
      onHit={(targetId, damage) => {
        if (wsRef.current) {
          wsRef.current.sendJSON({ type: 'hit', targetId: targetId, damage });
        }
      }}
      onReload={onReload}
      onWeaponChange={(index) => {
        selectedRef.current = index;
        setSelected(index);
        setSelectedSlot(slotForWeapon(index));
      }}
      onDamage={(amount) => {
        triggerHurtFlash();
        setHealth((value) => Math.max(0, value - amount));
      }}
      onHeal={(amount) => setHealth((value) => Math.min(maxHealth, value + amount))}
      onPause={() => setPaused(true)} />}

    {!ready && <div className="battle-loading" role="status">{error || `${chosenMap?.name || room.mapName} · 战场加载中…`}</div>}

    {hurtFlash && <div className="battle-hurt-vignette" aria-hidden="true" />}

    {/* Sniper / Crossbow Scope Zoom Overlay (创想兵团 狙击步枪/十字弩 右键开镜) */}
    {scopedFamily && (
      <div className="battle-scope-overlay" aria-label="狙击开镜视野">
        <div className="battle-scope-lens">
          <div className="battle-scope-h" />
          <div className="battle-scope-v" />
          <div className="battle-scope-center" />
          <div className="battle-scope-info">
            {scopedFamily === 'sniperrifle'
              ? '🎯 高倍光学狙击镜 (3.0x · 精准射击暴击加成 +25%)'
              : '💉 战术十字弩瞄准镜 (2.0x · 吸血针剂精准锁定)'}
            {' · 右键收镜'}
          </div>
        </div>
      </div>
    )}

    {/* Tactical Shield Guard HUD (战术盾牌右键架盾力场) */}
    {shieldGuarding && (
      <div className="battle-shield-guard-hud">
        🛡️ 战术能量盾架设中 · 正面伤害减免 65% (左键发动盾击震退)
      </div>
    )}

    {/* Top Mode Objective Banner & Boss Health Bar */}
    {ready && (
      <div
        style={{
          position: 'fixed',
          top: 76,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 18,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.84)',
            border: '1px solid rgba(56, 189, 248, 0.45)',
            borderRadius: 999,
            padding: '5px 18px',
            color: '#f8fafc',
            fontSize: 13,
            fontWeight: 'bold',
            boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ color: '#38bdf8' }}>[{room.modeName || '团队竞技'}]</span>
          <span>{objectiveState.statusText}</span>
          {damageBonusMult > 1 && (
            <span style={{ color: '#fbbf24', fontSize: 11 }}>
              ⚡ 强化加成 +{Math.round((damageBonusMult - 1) * 100)}%
            </span>
          )}
          {(hotbar.transferEnergy ?? 0) > 0 && (
            <span style={{ color: '#34d399', fontSize: 11 }}>
              🔋 能量转化 {hotbar.transferEnergy}%
            </span>
          )}
        </div>

        {/* Boss HP Bar for Expedition / Boss Mode */}
        {objectiveState.modeId === 'boss' && objectiveState.bossMaxHp && (
          <div
            style={{
              width: 420,
              background: 'rgba(15, 23, 42, 0.92)',
              border: '1px solid #ef4444',
              borderRadius: 8,
              padding: '6px 10px',
              boxShadow: '0 6px 20px rgba(220, 38, 38, 0.35)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#fca5a5', fontWeight: 'bold', marginBottom: 4 }}>
              <span>👹 {objectiveState.bossName}</span>
              <span>
                {objectiveState.bossHp} / {objectiveState.bossMaxHp} (阶段 {objectiveState.bossStage}/5)
              </span>
            </div>
            <div style={{ width: '100%', height: 10, background: '#1e293b', borderRadius: 5, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, ((objectiveState.bossHp ?? 0) / objectiveState.bossMaxHp) * 100))}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #dc2626, #f97316, #facc15)',
                  transition: 'width 0.15s ease',
                }}
              />
            </div>
          </div>
        )}
      </div>
    )}

    {/* Top-Right Kill Feed */}
    {killFeed.length > 0 && (
      <div
        style={{
          position: 'fixed',
          top: 150,
          right: 18,
          zIndex: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          pointerEvents: 'none',
          maxWidth: 340,
        }}
      >
        {killFeed.map((item) => (
          <div
            key={item.id}
            style={{
              background: 'rgba(9, 13, 22, 0.82)',
              borderLeft: `3px solid ${item.color || '#38bdf8'}`,
              padding: '5px 10px',
              borderRadius: 6,
              color: item.color || '#f8fafc',
              fontSize: 12,
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            {item.text}
          </div>
        ))}
      </div>
    )}

    {/* Respawn Countdown Overlay */}
    {respawnCountdown > 0 && (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(127, 29, 29, 0.42)',
          zIndex: 35,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 900, textShadow: '0 4px 16px #000' }}>
          ⚠️ 阵亡重整中 · {respawnCountdown} 秒后于己方基地复活
        </div>
      </div>
    )}

    <div className={`battle-reticle${reticleVariantClass}`} aria-hidden="true"
      style={recoilSpread > 0 ? { transform: `translate(-50%, -50%) scale(${1 + recoilSpread * 0.018})` } : undefined}>
      <i /><i /><i /><i />
    </div>
    {hitMarker.active && <div className={`battle-hitmarker${hitMarker.crit ? ' crit' : ''}`} aria-hidden="true">✕</div>}

    <div className="battle-abilities" aria-label="技能状态">
      {slots.map((slot, index) => slot.kind === 'skill' && <span key={slot.key}
        className={(hotbar.cooldowns[index] ?? 0) > 0 ? 'cooling' : undefined} title={`${slot.key} · ${slot.load.skill.name}`}>
        <img src={`${LOBBY}${slot.load.skill.icon}`} alt={slot.load.skill.name} />
      </span>)}
      <small>{formatTime(remaining)}</small>
    </div>

    {/* Direct Full Profession & Boss Skill Castbar (全职业主动/被动/首领技能战术栏) */}
    {ready && (activeCastableLoads.length > 0 || passiveLoads.length > 0) && (
      <div className="battle-skill-castbar" aria-label="职业与首领技能战术栏">
        {activeCastableLoads.slice(0, 6).map((load, idx) => {
          const cd = hotbar.byId?.[load.skill.id] ?? 0;
          const isBossSkill = ['tread', 'shriek', 'result', 'eatfish', 'bombgoon', 'wolfdecelerate'].includes(load.skill.id);
          const hk = activeSkillHotkeys[idx] || '';
          return (
            <button
              key={load.skill.id}
              type="button"
              className={`battle-skill-btn${isBossSkill ? ' boss-skill' : ''}`}
              title={`${load.skill.name} [${hk}] · ${load.skill.description}`}
              onClick={() => control.current?.castSkillById(load.skill.id)}
            >
              {hk && <span className="battle-skill-hotkey">{hk}</span>}
              <img src={`${LOBBY}${load.skill.icon}`} alt={load.skill.name} />
              {cd > 0 && <span className="battle-skill-cd">{Math.ceil(cd)}s</span>}
            </button>
          );
        })}
        {passiveLoads.map((load) => (
          <div
            key={load.skill.id}
            className="battle-skill-btn passive-skill"
            title={`${load.skill.name} [被动生效中] · ${load.skill.description}`}
          >
            <span className="battle-skill-hotkey">被动</span>
            <img src={`${LOBBY}${load.skill.icon}`} alt={load.skill.name} />
          </div>
        ))}
      </div>
    )}

    {/* In-Game Real-Time Battle Chat & Tactical Voice Callouts (局内聊天与战术快捷语音) */}
    {ready && (
      <section className="battle-chat-box" aria-label="局内战术聊天">
        {voiceWheelOpen && (
          <div className="battle-voice-wheel">
            <div style={{ fontWeight: 'bold', color: '#fbbf24', marginBottom: 2 }}>
              📻 战术快捷语音 (按数字键 1-5 立即发送)
            </div>
            {TACTICAL_VOICE_CALLOUTS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  sendBattleChat(c.text);
                  setVoiceWheelOpen(false);
                }}
                style={{
                  textAlign: 'left',
                  background: 'rgba(30, 41, 59, 0.85)',
                  border: '1px solid #475569',
                  borderRadius: 6,
                  padding: '4px 8px',
                  color: '#f8fafc',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                <strong style={{ color: '#38bdf8' }}>[{c.key}]</strong> {c.text}
              </button>
            ))}
          </div>
        )}

        <div className="battle-chat-messages">
          {chatMessages.slice(-8).map((m) => {
            const badgeColor =
              m.channel === 'team'
                ? '#38bdf8'
                : m.channel === 'world'
                  ? '#fbbf24'
                  : m.channel === 'system'
                    ? '#f43f5e'
                    : '#34d399';
            const badgeLabel =
              m.channel === 'team'
                ? '队伍'
                : m.channel === 'world'
                  ? '世界'
                  : m.channel === 'system'
                    ? '系统'
                    : '全部';
            return (
              <div key={m.id} className="battle-chat-msg">
                <span style={{ color: badgeColor, fontWeight: 'bold', marginRight: 4 }}>
                  [{badgeLabel}]
                </span>
                <strong style={{ color: '#e2e8f0', marginRight: 5 }}>{m.sender}:</strong>
                <span style={{ color: '#f8fafc' }}>{m.content}</span>
              </div>
            );
          })}
          <div ref={chatMessagesEndRef} />
        </div>

        {chatOpen ? (
          <div className="battle-chat-input-row">
            <button
              type="button"
              onClick={() =>
                setChatChannel((prev) =>
                  prev === 'all' ? 'team' : prev === 'team' ? 'world' : 'all'
                )
              }
              style={{
                padding: '2px 6px',
                borderRadius: 4,
                border: '1px solid #475569',
                background: '#1e293b',
                color: '#38bdf8',
                fontSize: 11,
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
              title="点击切换频道"
            >
              {chatChannel === 'all' ? '全部' : chatChannel === 'team' ? '队伍' : '世界'}
            </button>
            <input
              ref={chatInputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  sendBattleChat();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  chatOpenRef.current = false;
                  setChatOpen(false);
                  void document.body.requestPointerLock();
                }
              }}
              placeholder="输入战术消息，按 Enter 发送..."
            />
            <button
              type="button"
              onClick={() => sendBattleChat()}
              style={{
                padding: '3px 8px',
                borderRadius: 5,
                border: 'none',
                background: '#0284c7',
                color: '#fff',
                fontSize: 11,
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              发送
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                chatOpenRef.current = true;
                setChatOpen(true);
                if (document.pointerLockElement) document.exitPointerLock();
                window.setTimeout(() => chatInputRef.current?.focus(), 20);
              }}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid rgba(56, 189, 248, 0.4)',
                background: 'rgba(9, 13, 22, 0.72)',
                color: '#94a3b8',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              💬 按 [Enter] 聊天
            </button>
            <button
              type="button"
              onClick={() => setVoiceWheelOpen((prev) => !prev)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid rgba(251, 191, 36, 0.4)',
                background: 'rgba(9, 13, 22, 0.72)',
                color: '#fde68a',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              📻 按 [V] 战术语音
            </button>
          </div>
        )}
      </section>
    )}

    <BattleHud
      scoreRed={scoreRed}
      scoreBlue={scoreBlue}
      time={formatTime(remaining)}
      health={health}
      maxHealth={maxHealth}
      shield={hotbar.shield}
      ammo={sandboxRules.infiniteAmmo ? currentMagazine : (ammo[selected] ?? currentMagazine)}
      magazine={currentMagazine}
      melee={currentKind === 'melee'}
      slots={slots}
      cooldowns={hotbar.cooldowns}
      selectedSlot={selectedSlot}
      onSelect={selectSlot}
    />

    <aside className="battle-minimap" aria-label="小地图">
      <div className="battle-map-image" style={mapArt ? { backgroundImage: `url(${BASE}${mapArt})` } : undefined}>
        <span className="battle-map-marker" style={{ left: `${THREE.MathUtils.clamp(markerX, 5, 95)}%`, top: `${THREE.MathUtils.clamp(markerY, 5, 95)}%`, transform: `translate(-50%, -50%) rotate(${-position.yaw}rad)` }}>▲</span>
      </div>
      <span className="battle-map-name">{chosenMap?.name || room.mapName}</span>
    </aside>

    <div className="battle-touch-controls">
      <button onClick={fire}>开火</button>
      <button onClick={() => control.current?.reload()}>换弹</button>
      <button onClick={() => control.current?.interactObjective()}>交互 [E]</button>
    </div>
    <button className="battle-menu-button" aria-label="打开菜单" title="菜单 (Esc)" onClick={() => setPaused(true)}>☰</button>
    <button
      style={{
        position: 'fixed',
        top: 14,
        left: 196,
        zIndex: 25,
        padding: '6px 12px',
        borderRadius: 8,
        border: '1px solid #38bdf8',
        background: showScoreboard ? '#0284c7' : 'rgba(15, 23, 42, 0.85)',
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
        cursor: 'pointer',
      }}
      onClick={() => setShowScoreboard((prev) => !prev)}
    >
      📊 战报 [Tab]
    </button>
    <button
      style={{
        position: 'fixed',
        top: 14,
        left: 298,
        zIndex: 25,
        padding: '6px 12px',
        borderRadius: 8,
        border: '1px solid #fbbf24',
        background: 'rgba(120, 53, 15, 0.88)',
        color: '#fef3c7',
        fontSize: 12,
        fontWeight: 'bold',
        cursor: 'pointer',
      }}
      onClick={() => setShowSettlement(true)}
    >
      🏆 战局结算 / 翻牌抽奖
    </button>
    <button className={`battle-sandbox-button${sandboxOpen ? ' active' : ''}`} aria-label="沙盒战术面板" title="沙盒与AI靶场控制 [F2]"
      onClick={() => {
        const next = !sandboxOpen;
        sandboxOpenRef.current = next;
        setSandboxOpen(next);
        if (!next && !paused) void document.body.requestPointerLock();
      }}>
      🧩 沙盒 [F2]
    </button>

    {/* Tab Tactical Scoreboard Modal */}
    {showScoreboard && !showSettlement && (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(9, 13, 22, 0.72)',
          zIndex: 42,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={() => setShowScoreboard(false)}
      >
        <div
          style={{
            width: 680,
            background: 'linear-gradient(180deg, #0f172a 0%, #090d16 100%)',
            border: '1px solid #334155',
            borderRadius: 14,
            padding: 20,
            color: '#f8fafc',
            boxShadow: '0 20px 50px rgba(0,0,0,0.75)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, color: '#38bdf8' }}>
              📊 实时战术积分榜 · {chosenMap?.name || room.mapName} ({room.modeName || '团队竞技'})
            </h3>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>红队 {scoreRed} : {scoreBlue} 蓝队</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                <th style={{ padding: 8 }}>阵营</th>
                <th style={{ padding: 8 }}>角色名称</th>
                <th style={{ padding: 8 }}>击杀 (K)</th>
                <th style={{ padding: 8 }}>死亡 (D)</th>
                <th style={{ padding: 8 }}>目标贡献</th>
                <th style={{ padding: 8 }}>综合评分</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #1e293b', background: 'rgba(239, 68, 68, 0.14)' }}>
                <td style={{ padding: 8, color: '#f87171', fontWeight: 'bold' }}>红队 (MVP)</td>
                <td style={{ padding: 8, fontWeight: 'bold' }}>{character.name}</td>
                <td style={{ padding: 8, color: '#34d399' }}>{playerKills}</td>
                <td style={{ padding: 8 }}>{playerDeaths}</td>
                <td style={{ padding: 8, color: '#fbbf24' }}>{objectivePoints}</td>
                <td style={{ padding: 8, fontWeight: 'bold' }}>{playerKills * 100 + objectivePoints + 200}</td>
              </tr>
              {bots.map((b, idx) => (
                <tr key={b.id} style={{ borderBottom: '1px solid #1e293b', background: 'rgba(59, 130, 246, 0.1)' }}>
                  <td style={{ padding: 8, color: '#60a5fa' }}>蓝队 AI</td>
                  <td style={{ padding: 8 }}>{b.name}</td>
                  <td style={{ padding: 8 }}>{idx === 0 ? scoreBlue : 0}</td>
                  <td style={{ padding: 8 }}>{Math.max(0, Math.floor(playerKills / Math.max(1, bots.length)))}</td>
                  <td style={{ padding: 8 }}>15</td>
                  <td style={{ padding: 8 }}>{(idx === 0 ? scoreBlue : 0) * 80 + 100}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}

    {/* Authentic game_balance.lua Post-Match Settlement + 9-Card Flip Reward Screen */}
    {showSettlement && (
      <div
        id="battle-settlement-modal"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(5, 8, 17, 0.88)',
          zIndex: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <div
          style={{
            width: 820,
            maxWidth: '96vw',
            background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 55%, #090d16 100%)',
            border: '2px solid #f59e0b',
            borderRadius: 16,
            padding: 24,
            color: '#f8fafc',
            boxShadow: '0 25px 70px rgba(0,0,0,0.85)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 900, color: scoreRed >= scoreBlue ? '#fbbf24' : '#93c5fd' }}>
                {scoreRed >= scoreBlue ? '🏆 战役大捷 VICTORY!' : '🛡️ 虽败犹荣 MATCH COMPLETE'}
              </div>
              <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4 }}>
                地图: {chosenMap?.name || room.mapName} | 模式: {room.modeName || '团队竞技'} | 比分: 红队 {scoreRed} - {scoreBlue} 蓝队
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 13, color: '#a7f3d0' }}>
              <div>获得金币: <strong>+{350 + playerKills * 65 + objectivePoints}</strong> 🪙</div>
              <div>获得经验: <strong>+{220 + playerKills * 45}</strong> EXP</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 20 }}>
            {/* Left: Player Match Summary (game_balance.lua) */}
            <div style={{ background: 'rgba(9, 13, 22, 0.75)', borderRadius: 12, padding: 14, border: '1px solid #334155' }}>
              <div style={{ fontWeight: 'bold', color: '#38bdf8', marginBottom: 10, fontSize: 14 }}>
                📋 战局个人表现统计 (game_balance.lua)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, marginBottom: 12 }}>
                <div style={{ background: '#111827', padding: 10, borderRadius: 8 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11 }}>总击杀 (Kills)</div>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color: '#34d399' }}>{playerKills}</div>
                </div>
                <div style={{ background: '#111827', padding: 10, borderRadius: 8 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11 }}>阵亡次数 (Deaths)</div>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color: '#f87171' }}>{playerDeaths}</div>
                </div>
                <div style={{ background: '#111827', padding: 10, borderRadius: 8 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11 }}>模式目标贡献</div>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fbbf24' }}>{objectivePoints}</div>
                </div>
                <div style={{ background: '#111827', padding: 10, borderRadius: 8 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11 }}>强化火力加成</div>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color: '#a78bfa' }}>
                    +{Math.round((damageBonusMult - 1) * 100)}%
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                提示：点击右侧九宫格幸运卡牌（最多可翻开 3 张），即可领取本局专属强化石、稳压剂、稀有武器图纸或星币奖励！
              </div>
            </div>

            {/* Right: 9-Card Flip Reward Grid (game_balance.lua 翻牌抽奖) */}
            <div style={{ background: 'rgba(9, 13, 22, 0.75)', borderRadius: 12, padding: 14, border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 14 }}>
                <span style={{ fontWeight: 'bold', color: '#fbbf24' }}>🎴 战后幸运九宫格翻牌 (已翻 {Object.keys(flippedCards).length}/3)</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>点击卡牌翻开奖励</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {Array.from({ length: 9 }).map((_, idx) => {
                  const picked = flippedCards[idx];
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => void handleFlipRewardCard(idx)}
                      style={{
                        height: 78,
                        borderRadius: 10,
                        border: picked ? '2px solid #fbbf24' : '1px solid #475569',
                        background: picked
                          ? 'linear-gradient(135deg, #78350f 0%, #1e293b 100%)'
                          : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                        color: '#fff',
                        cursor: picked || Object.keys(flippedCards).length >= 3 ? 'default' : 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 6,
                        transition: 'transform 0.15s',
                      }}
                    >
                      {picked ? (
                        <>
                          <span style={{ fontSize: 22 }}>{picked.icon}</span>
                          <span style={{ fontSize: 11, fontWeight: 'bold', color: '#fde68a', marginTop: 2 }}>
                            {picked.name}
                          </span>
                          <span style={{ fontSize: 10, color: '#34d399' }}>{picked.amount}</span>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 20 }}>🎴</span>
                          <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>幸运翻牌 #{idx + 1}</span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 18 }}>
            <button
              type="button"
              onClick={() => {
                setShowSettlement(false);
                void document.body.requestPointerLock();
              }}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: '1px solid #475569',
                background: '#1e293b',
                color: '#e2e8f0',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              继续留在战场
            </button>
            <button
              type="button"
              onClick={finishAndExit}
              style={{
                padding: '10px 26px',
                borderRadius: 8,
                border: '1px solid #fbbf24',
                background: 'linear-gradient(90deg, #d97706, #ea580c)',
                color: '#fff',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              ✅ 完成结算并返回大厅
            </button>
          </div>
        </div>
      </div>
    )}

    {sandboxOpen && !paused && <aside className="battle-sandbox-drawer" aria-label="局内沙盒战术面板">
      <h3>
        <span>🧩 局内沙盒与 AI 靶场</span>
        <button style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}
          onClick={() => { sandboxOpenRef.current = false; setSandboxOpen(false); void document.body.requestPointerLock(); }}>✕</button>
      </h3>
      <div className="battle-sandbox-rules">
        <label>
          <input type="checkbox" checked={sandboxRules.infiniteAmmo}
            onChange={(e) => setSandboxRules((prev) => ({ ...prev, infiniteAmmo: e.target.checked }))} />
          无限弹药
        </label>
        <label>
          <input type="checkbox" checked={sandboxRules.noCooldown}
            onChange={(e) => setSandboxRules((prev) => ({ ...prev, noCooldown: e.target.checked }))} />
          技能/射速无CD
        </label>
        <label>
          <input type="checkbox" checked={sandboxRules.godMode}
            onChange={(e) => setSandboxRules((prev) => ({ ...prev, godMode: e.target.checked }))} />
          玩家无敌
        </label>
        <label>
          <input type="checkbox" checked={sandboxRules.autoRespawnBots}
            onChange={(e) => setSandboxRules((prev) => ({ ...prev, autoRespawnBots: e.target.checked }))} />
          假人自动复活
        </label>
      </div>

      <div style={{ marginBottom: 6, color: '#93c5fd', fontWeight: 'bold' }}>🤖 AI 假人行为模式 (假人数: {bots.length})</div>
      <div className="battle-sandbox-modes">
        {([
          { id: 'dummy', label: '🎯 静止木桩' },
          { id: 'patrol', label: '🚶 巡逻移动' },
          { id: 'chase', label: '⚔️ 追击反击' },
        ] as { id: BotBehaviorMode; label: string }[]).map((m) => (
          <button key={m.id} className={botMode === m.id ? 'active' : ''}
            onClick={() => { setBotMode(m.id); control.current?.setAllBotsMode(m.id); }}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="battle-sandbox-bots-bar">
        <button style={{ background: '#2563eb', borderColor: '#3b82f6', color: '#fff' }}
          onClick={() => control.current?.spawnBot(botMode)}>➕ 召唤假人</button>
        <button style={{ background: '#059669', borderColor: '#10b981', color: '#fff' }}
          onClick={() => control.current?.reviveAllBots()}>❤️ 全部复活</button>
        <button style={{ background: '#dc2626', borderColor: '#ef4444', color: '#fff' }}
          onClick={() => control.current?.clearAllBots()}>🗑️ 清空</button>
      </div>

      {bots.map((bot) => (
        <div key={bot.id} className="battle-sandbox-bot-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span><strong>{bot.name}</strong> ({bot.mode === 'dummy' ? '木桩' : bot.mode === 'patrol' ? '巡逻' : '追击'})</span>
            <span style={{ color: bot.hp <= 0 ? '#f87171' : '#34d399', fontFamily: 'monospace' }}>
              HP: {bot.hp}/{bot.maxHp}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ flex: 1, padding: '3px 6px', background: '#d97706', border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, cursor: 'pointer' }}
              onClick={() => control.current?.hitBot(bot.id, 600)}>击打 (-600)</button>
            <button style={{ flex: 1, padding: '3px 6px', background: '#dc2626', border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, cursor: 'pointer' }}
              onClick={() => control.current?.hitBot(bot.id, 9999)}>击杀</button>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #34d399', background: '#065f46', color: '#ecfdf5', fontSize: 11, fontWeight: 'bold', cursor: 'pointer' }}
          onClick={() => {
            setHealth(maxHealth);
            setAmmo(weapons.map(magazine));
            setReserves(weapons.map((weapon) => magazine(weapon) * 4));
          }}>
          🔄 满血满弹
        </button>
        <button style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #60a5fa', background: '#1e3a8a', color: '#eff6ff', fontSize: 11, fontWeight: 'bold', cursor: 'pointer' }}
          onClick={() => { window.location.href = `${import.meta.env.BASE_URL}sandbox`; }}>
          🔬 独立沙盒实验室
        </button>
      </div>
    </aside>}

    {paused && <>
      <SettingsMenu
        assets={assets}
        volume={volume}
        effectsVolume={effectsVolume}
        motion={motion}
        onVolume={onVolume}
        onEffectsVolume={onEffectsVolume}
        onMotion={setMotion}
        onClose={() => { setPaused(false); void document.body.requestPointerLock(); }}
        onExit={finishAndExit}
        onQuit={onQuit}
      />
      {import.meta.env.DEV && <div className="battle-debug">{debugLog.map((log, index) => <p key={index}>{log}</p>)}</div>}
    </>}
  </main>;
}

