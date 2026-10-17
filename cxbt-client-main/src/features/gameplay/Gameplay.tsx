import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { apiFetch, WS_BASE } from '../../api';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { SavedCharacter } from '../characterCreation/character';
import { initialAppearance, type CreationAssets, type CreationAttachment, type CreationPreset, type CreationWeapon } from '../characterCreation/assets';
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
  mountMapExtraMeshesAndConfig,
  type MapExtraMeshEntry,
  type CustomMapBlueprint,
  type BotBehaviorMode,
  type BotSnapshot,
} from './engine';
import './Gameplay.css';
import { WebRTCClient } from '../../network/WebRTCClient';
import { VoiceChatManager, type VoiceManagerSnapshot } from '../../network/VoiceChatManager';
import { LUA_BATTLE_ITEMS, LUA_DIE_EFFECTS, LUA_PETS } from './luaMasterData';

type MapDefinition = {
  name?: string;
  scene: string;
  collision: string | null;
  minimap: string | null;
  airWalls: string[];
  waterMeshes?: string[] | null;
  extraMeshes?: MapExtraMeshEntry[] | null;
  deadAABBs?: number[][] | null;
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
  handleRemoteFire: (pkt: any) => void;
  handleRemoteSkill: (pkt: any) => void;
  handleRemoteBossHit: (pkt: any) => void;
  handleRemoteObjective: (pkt: any) => void;
  handleRemoteKill: (victimId: string | number) => void;
  handleRemoteRespawn: (userId: string | number) => void;
  removeRemotePlayer: (userId: string | number) => void;
  spawnBot: (mode?: BotBehaviorMode) => void;
  setAllBotsMode: (mode: BotBehaviorMode) => void;
  reviveAllBots: () => void;
  clearAllBots: () => void;
  hitBot: (id: string, dmg: number) => void;
  respawnPlayer: () => void;
  interactObjective: () => void;
  toggleFlight: () => void;
  equipWing: (wing?: CreationAttachment) => void;
  equipPet: (petId: string) => void;
  useBattleItem: (itemId: string) => boolean;
  setWatchCameraMode: (mode: 'player' | 'chase' | 'free') => void;
};
type HotbarState = {
  cooldowns: number[];
  byId?: Record<string, number>;
  shield: number;
  stealthed: boolean;
  speed: number;
  maxHealthScale: number;
  transferEnergy?: number;
  isFlying?: boolean;
  flyEnergy?: number;
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

function BattleScene({ map, customMap, roomId, modeId, damageBonusMult, hasPetCompanion, wingAttachment, character, creation, assets, avatarPreset, weapons, slots, loads, allLoads, health, motion,
  active, onReady, onPosition, onShot, onHit, onFireEvent, onSkillEvent, onReload, onWeaponChange, onDamage, onHeal, onHotbar,
  onPause, paused, sandboxOpen, chatOpen, sandboxRules, onBotsChange, onBotKill, onObjectiveScore, onObjectiveState, onHitMarker, onRecoil,
  onScopeChange, onShieldGuardChange, otherPlayers, roomPlayers, logDebug }: {
  map: MapDefinition;
  customMap?: CustomMapBlueprint;
  roomId?: string;
  modeId: string;
  damageBonusMult: number;
  hasPetCompanion: boolean;
  wingAttachment?: CreationAttachment;
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
  onObjectiveScore: (redDelta: number, blueDelta: number, feedText: string, extra?: Record<string, any>) => void;
  onObjectiveState: (state: ModeObjectiveState) => void;
  onHitMarker: (crit: boolean) => void;
  onRecoil: (spread: number) => void;
  onScopeChange: (scoped: boolean, family: string) => void;
  onShieldGuardChange: (guarding: boolean) => void;
  onReady: () => void;
  onPosition: (x: number, y: number, z: number, yaw: number, extra?: Record<string, any>) => void;
  onShot: () => boolean;
  onHit: (targetId: string, damage: number, crit?: boolean, weaponName?: string, extra?: Record<string, any>) => void;
  onFireEvent?: (pkt: Record<string, any>) => void;
  onSkillEvent?: (pkt: Record<string, any>) => void;
  onReload: () => void;
  onWeaponChange: (index: number) => void;
  onDamage: (amount: number) => void;
  onHeal: (amount: number) => void;
  onHotbar: (state: HotbarState) => void;
  onPause: () => void;
  otherPlayers: React.RefObject<Record<string, { buffer: Array<Record<string, any>> }>>;
  roomPlayers: any;
  logDebug: (msg: string) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const shotRef = useRef(onShot);
  const hitRef = useRef(onHit);
  const fireEventRef = useRef(onFireEvent);
  const skillEventRef = useRef(onSkillEvent);
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
  const wingAttachmentRef = useRef(wingAttachment);
  const roomPlayersRef = useRef(roomPlayers);

  shotRef.current = onShot;
  hitRef.current = onHit;
  fireEventRef.current = onFireEvent;
  skillEventRef.current = onSkillEvent;
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
  wingAttachmentRef.current = wingAttachment;
  roomPlayersRef.current = roomPlayers;

  useEffect(() => {
    if (mountRef.current) {
      mountRef.current.dataset.hotbar = String(slots.filter((s) => s.kind !== 'empty').length);
    }
  }, [slots]);

  useEffect(() => {
    active.current?.equipWing(wingAttachment);
  }, [wingAttachment]);

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
        skillEffects.triggerTransferAbsorbVfx?.();
        if (prevStored < 100 && transfer.stored >= 100) {
          audio.play('skill-transfer-ready', 0.65);
          if (localPlayer) combatEffects.spawnStatusText(localPlayer.modelGroup.position, '⚡ 能量转化充能完毕！', '#fbbf24');
        }
        const releaseRad = passives.releaseRadius || 8;
        if (transfer.stored >= 100 && enemyList().some((enemy) => enemy.position.distanceTo(localPlayer?.modelGroup.position || new THREE.Vector3()) <= releaseRad)) {
          transfer.stored = 0;
          audio.play('skill-transfer', 0.8);
          skillEffects.triggerTransferReleaseVfx?.(releaseRad);
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
      { name: '阶段1 · 暴走重装机甲 (Boss_01)', maxHp: 6500, color: 0xef4444, scale: 1.9, bossId: 'boss_01_01', modelScale: 0.65, attackAnim: 'stdshoot' },
      { name: '阶段2 · 暗黑熔岩巨龙 (Boss_02)', maxHp: 9000, color: 0xf97316, scale: 2.1, bossId: 'boss_02_01', modelScale: 0.52, attackAnim: 'stdshoot' },
      { name: '阶段3 · 生化变异领主 (Boss_03)', maxHp: 12000, color: 0x10b981, scale: 2.2, bossId: 'boss_03_01', modelScale: 0.52, attackAnim: 'stdshoot' },
      { name: '阶段4 · 星界行刑者 (Boss_08)', maxHp: 15500, color: 0x8b5cf6, scale: 2.35, bossId: 'boss_04_02', modelScale: 0.16, attackAnim: 'stdattack' },
      { name: '阶段5 · 终焉泰坦首领 (Boss_09)', maxHp: 20000, color: 0xfacc15, scale: 2.55, bossId: 'boss_04_01', modelScale: 0.17, attackAnim: 'stdshoot' },
    ];
    let bossStageIdx = (() => {
      const s = (map.scene || '').toLowerCase();
      if (s.includes('10002') || s.includes('boss02')) return 1;
      if (s.includes('10003') || s.includes('boss03')) return 2;
      if (s.includes('10008') || s.includes('boss08')) return 3;
      if (s.includes('10009') || s.includes('boss09')) return 4;
      return 0;
    })();
    let bossHp = BOSS_STAGES[bossStageIdx].maxHp;
    let bossMaxHp = BOSS_STAGES[bossStageIdx].maxHp;
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
    let bossCoreMesh: any = null;
    let bossModelContainer: any = null;
    let bossMixer: any = null;
    let bossAttackAction: any = null;
    let bossHitboxMesh: any = null;
    let petCompanionMesh: any = null;
    let petMixer: any = null;
    const treasureChests: Array<{ mesh: any; pos: any; respawnAt: number }> = [];
    const propLoader = new GLTFLoader();

    const loadBossStageModel = (stageIndex: number) => {
      const stage = BOSS_STAGES[stageIndex] ?? BOSS_STAGES[0];
      if (!bossGroup || !bossModelContainer) return;
      while (bossModelContainer.children.length > 0) {
        bossModelContainer.remove(bossModelContainer.children[0]);
      }
      bossMixer = null;
      bossAttackAction = null;
      propLoader.load(
        `${import.meta.env.BASE_URL}assets/gameplay/mesh/boss/${stage.bossId}/mesh.mesh.glb`,
        async (gltf) => {
          if (cancelled || !bossModelContainer) return;
          if (bossCoreMesh) bossCoreMesh.visible = false;
          const bossRoot = gltf.scene;
          bossRoot.scale.setScalar(stage.modelScale);
          if (stage.bossId.startsWith('boss_04')) {
            bossRoot.position.y = 1.6;
          }
          bossRoot.traverse((child: any) => {
            if (child.isMesh) {
              child.frustumCulled = false;
              child.userData = { isBoss: true, userId: '__boss__' };
            }
          });
          bossModelContainer.add(bossRoot);
          const mixer = new THREE.AnimationMixer(bossRoot);
          bossMixer = mixer;
          try {
            const idleRes = await fetch(`${import.meta.env.BASE_URL}assets/gameplay/animations/boss/${stage.bossId}/stdidle.json`);
            if (idleRes.ok) {
              const clipJson = await idleRes.json();
              const clip = THREE.AnimationClip.parse(clipJson);
              mixer.clipAction(clip).play();
            }
            const atkRes = await fetch(`${import.meta.env.BASE_URL}assets/gameplay/animations/boss/${stage.bossId}/${stage.attackAnim}.json`);
            if (atkRes.ok) {
              const atkJson = await atkRes.json();
              const atkClip = THREE.AnimationClip.parse(atkJson);
              const act = mixer.clipAction(atkClip);
              act.setLoop(THREE.LoopOnce, 1);
              bossAttackAction = act;
            }
          } catch {}
        },
        undefined,
        () => undefined
      );
    };

    const resolveSafeSpawn = (team: 'red' | 'blue', index = 0) => {
      if (customMap) {
        return new THREE.Vector3(customMap.spawnPoint[0], customMap.spawnPoint[1], customMap.spawnPoint[2]);
      }
      const list = team === 'red' ? map.redSpawns : map.blueSpawns;
      const fallback = map.holdPoint ?? map.camera ?? [0, 1.5, 0];
      const raw = (list && list[index % list.length]) || fallback;
      const sx = raw[0] ?? 0;
      const hintY = raw[1] ?? 1.5;
      const sz = raw[2] ?? 0;
      const ground =
        mapCollider.floorAt(sx, sz, hintY + 3.2, 3.5) ??
        mapCollider.floorAt(sx, sz, 24) ??
        hintY;
      return new THREE.Vector3(sx, ground, sz);
    };

    const resolveHoldPointVec = () => {
      const hp = map.holdPoint ?? map.redSpawns?.[0] ?? map.camera ?? [0, 1.2, 0];
      const hx = hp[0] ?? 0;
      const hintY = hp[1] ?? 1.2;
      const hz = hp[2] ?? 0;
      const hy =
        mapCollider.floorAt(hx, hz, hintY + 3.2, 3.5) ??
        mapCollider.floorAt(hx, hz, 24) ??
        hintY;
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
      const curWeaponLabel = weapons[selected]?.label || '战术武器';

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
            loadBossStageModel(bossStageIdx);
          } else {
            bossGroup.visible = false;
          }
        }
        hitRef.current('__boss__', scaledDamage, crit, curWeaponLabel, {
          bossHp,
          bossMaxHp,
          bossStageIdx,
        });
        return;
      }
      const bot = botManager.findById(userId);
      if (bot) {
        botManager.damageBotById(userId, scaledDamage);
        // Apply directional impulse from character/die_effect/*.lua
        const curWepId = weapons[selected]?.id ?? 'smg_01';
        const dieKey = curWepId.startsWith('rpg') || curWepId.startsWith('ba01')
          ? 'rocket_die'
          : curWepId.startsWith('grenade')
            ? 'grenade_die'
            : curWepId.startsWith('shotgun')
              ? 'shotgun_die'
              : crit
                ? 'head_front_die'
                : 'chest_front_die';
        const dieForces = LUA_DIE_EFFECTS[dieKey] || LUA_DIE_EFFECTS['normal_die'];
        if (dieForces && localPlayer) {
          const pushDir = bot.entity.modelGroup.position.clone().sub(localPlayer.modelGroup.position).setY(0).normalize();
          const fMag = Math.min(1.6, Math.hypot(dieForces[0]?.force[0] || 1, dieForces[0]?.force[2] || 5) * 0.08);
          bot.entity.modelGroup.position.addScaledVector(pushDir, bot.hp <= 0 ? fMag * 1.4 : fMag * 0.35);
        }
        const pos = hitPoint ? hitPoint.clone() : bot.entity.modelGroup.position.clone().add(new THREE.Vector3(0, 1.65, 0));
        combatEffects.spawnFloatingDamage(pos, scaledDamage, crit);
        hitMarkerRef.current(crit);
        audio.play(crit ? 'critical_hit' : 'hit', crit ? 0.7 : 0.45);
        return;
      }
      hitRef.current(userId, scaledDamage, crit, curWeaponLabel);
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

    const getDynamicHitboxes = () => {
      const list = botManager.getAliveHitboxes();
      if (bossHitboxMesh && bossHp > 0) list.push(bossHitboxMesh);
      for (const entity of otherPlayerEntities.values()) {
        if (entity?.isAlive && entity?.hitbox) list.push(entity.hitbox);
      }
      return list;
    };

    const transfer = { stored: 0 };
    const projectiles = createProjectileSystem(
      scene,
      () => {
        const base = mapCollider.collisionMeshes.length ? mapCollider.collisionMeshes : mapCollider.mapVisible;
        return [...base, ...getDynamicHitboxes()];
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
      getBonePosition: (boneName) => localPlayer ? localPlayer.getBoneWorldPosition(boneName) : new THREE.Vector3(),
      aim: () => cameraController ? cameraController.getForwardDirection() : camera.getWorldDirection(new THREE.Vector3()),
      spawnProjectile: (kind, origin, aim, subType) => projectiles.spawn(kind, origin, aim, subType),
      playSound: (name, volume) => audio.play(name, volume),
      playSkillAnim: (animName) => localPlayer?.playSkillAnim(animName),
      playAttackAnim: () => localPlayer?.attack(),
      getMaxHealth: () => MAX_HEALTH * skillEffects.snapshot().maxHealthScale,
      heal: (amount) => {
        healRef.current(amount);
        if (localPlayer) combatEffects.spawnFloatingHeal(localPlayer.modelGroup.position, amount);
      },
      hurt: (amount) => takeDamage(amount),
      enemies: enemyList,
      hitEnemy: (userId, damage) => damageTargetById(userId, damage, false),
      knockbackEnemy: (userId, dir, dist) => {
        const bot = botManager.findById(userId);
        if (bot) {
          bot.entity.modelGroup.position.addScaledVector(dir, dist);
        }
        const remote = otherPlayerEntities.get(userId);
        if (remote) {
          remote.modelGroup.position.addScaledVector(dir, dist);
        }
      },
      lungeForward: (dist) => localPlayer?.lungeForward(dist),
      setBerserkScale: (scale) => localPlayer?.setBerserkScale(scale),
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
      const nextComboIdx = comboStep % 3;
      const stageDelaySec =
        kind === 'melee' && profile.comboDelays
          ? profile.comboDelays[nextComboIdx] ?? profile.fireDelay
          : profile.fireDelay;
      const fireIntervalMs = stageDelaySec * 1000;
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

      let fireAudioKey = profile.fireAudio;
      if (kind === 'melee') {
        comboStep += 1;
        const stageNum = ((comboStep - 1) % 3) + 1;
        mount.dataset.attackStep = String(comboStep);
        localPlayer.attack(profile.isSaw ? 1 : stageNum);
        if (family === 'shield' && stageNum === 2) fireAudioKey = 'fire-shield2';
        else if (family === 'shield' && stageNum === 3) fireAudioKey = 'fire-shield3';
      } else {
        comboStep = 0;
        mount.dataset.attackStep = '0';
        localPlayer.attack();
      }
      audio.play(fireAudioKey, 0.55);
      recoilRef.current(kind === 'melee' ? 6 : Math.min(26, 7 + profile.spread * 220));

      const dynamicHitboxes = getDynamicHitboxes();

      const aim = cameraController ? cameraController.getForwardDirection() : camera.getWorldDirection(new THREE.Vector3());

      if (kind === 'melee') {
        combatEffects.spawnMeleeSlash(localPlayer.modelGroup.position, aim, comboStep, weaponId);
        const point = localPlayer.modelGroup.position.clone().add(new THREE.Vector3(0, 1, 0));
        fireEventRef.current?.({
          kind: 'melee',
          weaponId,
          comboStep,
          muzzle: [localPlayer.modelGroup.position.x, localPlayer.modelGroup.position.y, localPlayer.modelGroup.position.z],
          aim: [aim.x, aim.y, aim.z],
        });
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
        const crosshairHit = mapCollider.raycastBullet(camera.position, aim, 120, dynamicHitboxes);
        const targetPoint = crosshairHit
          ? crosshairHit.point
          : camera.position.clone().addScaledVector(aim, 85);
        const launchDir = targetPoint.clone().sub(muzzle).normalize();
        const subType = family === 'crossbow'
          ? 'syringe'
          : (family === 'grenadelauncher' && passives.gasDamage > 0)
            ? 'gasbomb'
            : 'default';
        projectiles.spawn(kind, muzzle, launchDir, subType, weaponId);
        fireEventRef.current?.({
          kind,
          subType,
          weaponId,
          muzzle: [muzzle.x, muzzle.y, muzzle.z],
          aim: [launchDir.x, launchDir.y, launchDir.z],
          target: [targetPoint.x, targetPoint.y, targetPoint.z],
        });
        if (family !== 'grenade') {
          shotFlash = 0.08;
          flash.position.copy(muzzle);
          flash.intensity = kind === 'arrow' ? 4 : 6;
          combatEffects.triggerMuzzleFlash(muzzle, 0.085, launchDir, weaponId);
        }
        return;
      }

      // 生化喷射器 (sprayer): 1:1 复刻 vfx_shenghua_atomizing_attack1_3rd.vfx 3D 连续雾化毒雾锥 + 瘟疫感染
      if (family === 'sprayer') {
        shotFlash = 0.08;
        flash.position.copy(muzzle);
        flash.intensity = 7;
        combatEffects.spawnSprayerMistCone(muzzle, aim);
        fireEventRef.current?.({
          kind: 'sprayer',
          weaponId,
          muzzle: [muzzle.x, muzzle.y, muzzle.z],
          aim: [aim.x, aim.y, aim.z],
        });
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

      shotFlash = 0.08;
      flash.position.copy(muzzle);
      flash.intensity = 6;
      combatEffects.triggerMuzzleFlash(muzzle, 0.085, aim, weaponId);

      const tracerColor = family === 'sniperrifle'
        ? 0x38bdf8
        : family === 'machinegun'
          ? 0xfb923c
          : 0xfde047;

      const effectiveSpread = isScoped ? profile.spread * 0.12 : profile.spread;
      let firstTargetPoint: any = null;

      for (let p = 0; p < profile.pellets; p++) {
        const rayDir = aim.clone();
        if (effectiveSpread > 0) {
          rayDir.x += (Math.random() - 0.5) * effectiveSpread;
          rayDir.y += (Math.random() - 0.5) * effectiveSpread;
          rayDir.z += (Math.random() - 0.5) * effectiveSpread;
          rayDir.normalize();
        }
        const hit = mapCollider.raycastBullet(camera.position, rayDir, 120, dynamicHitboxes);
        const targetPoint = hit
          ? hit.point
          : camera.position.clone().addScaledVector(rayDir, 85);
        if (!firstTargetPoint) firstTargetPoint = targetPoint;
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

      if (firstTargetPoint) {
        fireEventRef.current?.({
          kind: 'bullet',
          weaponId,
          isScoped: isScoped || wasStealthed,
          muzzle: [muzzle.x, muzzle.y, muzzle.z],
          aim: [aim.x, aim.y, aim.z],
          target: [firstTargetPoint.x, firstTargetPoint.y, firstTargetPoint.z],
        });
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
          objectiveScoreRef.current(
            2,
            0,
            `💣 [${character.name}] 已在爆破点安放 C4 雷包！35秒引爆倒计时开始！`,
            { bombPlanted: true, bombTimer: 35, bombPos: [pPos.x, pPos.y + 0.35, pPos.z] }
          );
        } else {
          bombPlanted = false;
          if (plantedBombMesh) plantedBombMesh.visible = false;
          objectiveScoreRef.current(
            3,
            0,
            `🛠️ [${character.name}] 成功拆除了高危雷包！`,
            { bombPlanted: false }
          );
        }
      } else if (normalizedMode === 'flag') {
        if (!carryingFlag && blueFlagMesh) {
          carryingFlag = true;
          blueFlagMesh.visible = false;
          if (carriedFlagMesh) carriedFlagMesh.visible = true;
          objectiveScoreRef.current(
            1,
            0,
            `🚩 [${character.name}] 突袭夺取了蓝方战旗！请护送回己方基地！`,
            { carryingFlag: true }
          );
        } else if (carryingFlag) {
          carryingFlag = false;
          if (blueFlagMesh) blueFlagMesh.visible = true;
          if (carriedFlagMesh) carriedFlagMesh.visible = false;
          healRef.current(600);
          objectiveScoreRef.current(
            5,
            0,
            `🏆 [${character.name}] 成功将战旗护送回红方旗座！红队 +5 分！`,
            { carryingFlag: false }
          );
        }
      } else if (normalizedMode === 'treasure') {
        treasuresCollected += 1;
        healRef.current(500);
        buffDamageMult = 1.35;
        buffSpeedMult = 1.22;
        buffExpireAt = performance.now() + 12000;
        activeBuffLabel = '⚡ 宝箱狂暴增益 (伤害+35% / 移速+22%)';
        objectiveScoreRef.current(
          3,
          0,
          `💎 [${character.name}] 开启了黄金宝箱 (#${treasuresCollected})！红队 +3 分！`,
          { treasuresCollected }
        );
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
        isFlying: Boolean(localPlayer?.isFlying),
        flyEnergy: Math.round(localPlayer?.flyEnergy ?? 100),
      });
    };

    const loadPetModel = (rawPetId: string) => {
      if (!localPlayer) return;
      if (!petCompanionMesh) {
        petCompanionMesh = new THREE.Group();
        localPlayer.modelGroup.add(petCompanionMesh);
      }
      while (petCompanionMesh.children.length > 0) {
        petCompanionMesh.remove(petCompanionMesh.children[0]);
      }
      petMixer = null;
      if (!rawPetId || rawPetId === 'none') {
        petCompanionMesh.visible = false;
        return;
      }
      petCompanionMesh.visible = true;
      const petId = rawPetId.replace(/\.mesh\.glb$/i, '');
      const petSpec = LUA_PETS[petId];
      const off = petSpec?.offset || [-0.7, 1.35, -0.45];
      petCompanionMesh.position.set(off[0] * 0.85, Math.max(1.1, off[1] * 0.9), off[2] * 0.85);

      const petGeo = new THREE.OctahedronGeometry(0.22, 1);
      const petMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.85,
        metalness: 0.6,
        roughness: 0.2,
      });
      const fallbackCrystal = new THREE.Mesh(petGeo, petMat);
      petCompanionMesh.add(fallbackCrystal);

      propLoader.load(
        `${import.meta.env.BASE_URL}assets/gameplay/mesh/pet/${petId}.mesh.glb`,
        async (gltf) => {
          if (cancelled || !petCompanionMesh) return;
          fallbackCrystal.visible = false;
          const petRoot = gltf.scene;
          const lvScale = petSpec?.levelSizes?.['1']?.[0] ?? 1.0;
          petRoot.scale.setScalar(1.25 * lvScale);
          petCompanionMesh.add(petRoot);
          const mixer = new THREE.AnimationMixer(petRoot);
          petMixer = mixer;
          try {
            const res = await fetch(`${import.meta.env.BASE_URL}assets/gameplay/animations/pet/${petId}/idle.json`);
            if (res.ok) {
              const clipJson = await res.json();
              const clip = THREE.AnimationClip.parse(clipJson);
              mixer.clipAction(clip).play();
            }
          } catch {}
        },
        undefined,
        () => undefined
      );
    };

    let lastItemUsedAt = 0;

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
        if (localPlayer) {
          const p = localPlayer.modelGroup.position;
          skillEventRef.current?.({
            skillId: entry.load.skill.id,
            label: entry.load.skill.name,
            pos: [p.x, p.y, p.z],
          });
        }
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
            if (res !== null) {
              if (localPlayer) {
                const p = localPlayer.modelGroup.position;
                skillEventRef.current?.({
                  skillId: entry.load.skill.id,
                  label: entry.load.skill.name,
                  pos: [p.x, p.y, p.z],
                });
              }
              syncHotbarNow();
            }
            return res !== null;
          }
        }
        const load = allLoadsRef.current.find((l) => l.skill.id === skillId);
        if (!load) return false;
        if (sandboxRules.current.noCooldown) skillEffects.resetCooldowns();
        const res = skillEffects.castDirect(load);
        if (sandboxRules.current.noCooldown) skillEffects.resetCooldowns();
        if (res && skillId !== 'latent') skillEffects.breakStealth();
        if (res) {
          if (localPlayer) {
            const p = localPlayer.modelGroup.position;
            skillEventRef.current?.({
              skillId: load.skill.id,
              label: load.skill.name,
              pos: [p.x, p.y, p.z],
            });
          }
          syncHotbarNow();
        }
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
      handleRemoteFire(pkt) {
        const uidStr = String(pkt.userId ?? '');
        const remote = otherPlayerEntities.get(uidStr);
        const wId = String(pkt.weaponId || 'smg_01');
        const fam = wId.split('_')[0] ?? 'smg';
        const prof = getWeaponCombatProfile(wId);
        if (remote) {
          remote.attack(pkt.comboStep || 1);
        }
        audio.play(prof.fireAudio, 0.35);
        const muzzleVec = Array.isArray(pkt.muzzle) && pkt.muzzle.length >= 3
          ? new THREE.Vector3(pkt.muzzle[0], pkt.muzzle[1], pkt.muzzle[2])
          : (remote?.getMuzzlePosition() || new THREE.Vector3());
        const aimVec = Array.isArray(pkt.aim) && pkt.aim.length >= 3
          ? new THREE.Vector3(pkt.aim[0], pkt.aim[1], pkt.aim[2]).normalize()
          : new THREE.Vector3(0, 0, 1);
        const targetVec = Array.isArray(pkt.target) && pkt.target.length >= 3
          ? new THREE.Vector3(pkt.target[0], pkt.target[1], pkt.target[2])
          : muzzleVec.clone().addScaledVector(aimVec, 40);

        if (pkt.kind === 'melee') {
          combatEffects.spawnMeleeSlash(muzzleVec, aimVec, pkt.comboStep || 1, wId);
        } else if (pkt.kind === 'grenade' || pkt.kind === 'rocket' || pkt.kind === 'arrow') {
          projectiles.spawn(pkt.kind, muzzleVec, aimVec, pkt.subType || 'default', wId);
          combatEffects.triggerMuzzleFlash(muzzleVec, 0.08, aimVec, wId);
        } else if (pkt.kind === 'sprayer' || fam === 'sprayer') {
          combatEffects.spawnSprayerMistCone(muzzleVec, aimVec);
        } else {
          combatEffects.triggerMuzzleFlash(muzzleVec, 0.08, aimVec, wId);
          if (fam === 'sniperrifle') {
            combatEffects.spawnSniperSpiralBeam(muzzleVec, targetVec, Boolean(pkt.isScoped));
          } else {
            const tColor = fam === 'machinegun' ? 0xfb923c : 0xfde047;
            combatEffects.spawnBulletTracer(muzzleVec, targetVec, tColor);
          }
        }
      },
      handleRemoteSkill(pkt) {
        const uidStr = String(pkt.userId ?? '');
        const remote = otherPlayerEntities.get(uidStr);
        const pos = remote?.modelGroup?.position
          ? remote.modelGroup.position.clone()
          : (Array.isArray(pkt.pos) && pkt.pos.length >= 3
              ? new THREE.Vector3(pkt.pos[0], pkt.pos[1], pkt.pos[2])
              : null);
        if (remote) {
          remote.playSkillAnim(pkt.skillId || 'skill');
        }
        if (pos) {
          combatEffects.spawnStatusText(
            pos,
            `✨ [${pkt.sender || '战友'}] 释放 ${pkt.label || pkt.skillId}`,
            '#38bdf8'
          );
        }
      },
      handleRemoteBossHit(pkt) {
        if (!bossGroup) return;
        const dmg = Number(pkt.damage) || 0;
        if (dmg > 0) {
          combatEffects.spawnFloatingDamage(
            bossGroup.position.clone().add(new THREE.Vector3(0, 2.8, 0)),
            dmg,
            Boolean(pkt.crit)
          );
        }
        if (typeof pkt.bossStageIdx === 'number' && pkt.bossStageIdx !== bossStageIdx) {
          bossStageIdx = pkt.bossStageIdx;
          const st = BOSS_STAGES[bossStageIdx] ?? BOSS_STAGES[0];
          bossMaxHp = st.maxHp;
          loadBossStageModel(bossStageIdx);
        }
        if (typeof pkt.bossHp === 'number') {
          bossHp = pkt.bossHp;
          if (bossHp <= 0 && bossStageIdx >= BOSS_STAGES.length - 1) {
            bossGroup.visible = false;
          }
        }
      },
      handleRemoteObjective(pkt) {
        if (typeof pkt.bombPlanted === 'boolean') {
          bombPlanted = pkt.bombPlanted;
          if (typeof pkt.bombTimer === 'number') bombTimer = pkt.bombTimer;
          if (plantedBombMesh) {
            if (bombPlanted && Array.isArray(pkt.bombPos) && pkt.bombPos.length >= 3) {
              plantedBombMesh.position.set(pkt.bombPos[0], pkt.bombPos[1], pkt.bombPos[2]);
            }
            plantedBombMesh.visible = bombPlanted;
          }
        }
        if (typeof pkt.carryingFlag === 'boolean' && blueFlagMesh) {
          blueFlagMesh.visible = !pkt.carryingFlag;
        }
        if (typeof pkt.treasuresCollected === 'number') {
          treasuresCollected = Math.max(treasuresCollected, pkt.treasuresCollected);
        }
        if (typeof pkt.occupyProgress === 'number') {
          occupyProgress = pkt.occupyProgress;
        }
      },
      handleRemoteKill(victimId) {
        const remote = otherPlayerEntities.get(String(victimId));
        if (remote) {
          remote.die();
        }
      },
      handleRemoteRespawn(userId) {
        const remote = otherPlayerEntities.get(String(userId));
        if (remote) {
          remote.revive();
        }
      },
      removeRemotePlayer(userId) {
        const uidStr = String(userId);
        const remote = otherPlayerEntities.get(uidStr);
        if (remote) {
          remote.dispose();
          otherPlayerEntities.delete(uidStr);
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
      toggleFlight() {
        if (!localPlayer) return;
        const nowFlying = localPlayer.toggleFlying();
        if (nowFlying) {
          audio.play('jump', 0.65);
          combatEffects.spawnStatusText(localPlayer.modelGroup.position, '🪽 双翼展开 · 凌空飞行！', '#38bdf8');
        } else {
          combatEffects.spawnStatusText(localPlayer.modelGroup.position, '🪽 收翼降落', '#94a3b8');
        }
        syncHotbarNow();
      },
      equipWing(att) {
        if (!localPlayer) return;
        void localPlayer.equipWing(att).then(() => {
          if (localPlayer && att) {
            combatEffects.spawnStatusText(localPlayer.modelGroup.position, `🪽 已穿戴 [${att.label}]`, '#fbbf24');
          }
          syncHotbarNow();
        });
      },
      equipPet(petId) {
        loadPetModel(petId);
        if (localPlayer && petId && petId !== 'none') {
          const spec = LUA_PETS[petId.replace(/\.mesh\.glb$/i, '')];
          combatEffects.spawnStatusText(
            localPlayer.modelGroup.position,
            `🐾 召唤跟宠 [${spec?.name || petId}] (pet_skill01 移速+5%)`,
            '#34d399'
          );
        }
      },
      useBattleItem(itemId) {
        if (!localPlayer) return false;
        const now = performance.now();
        if (!sandboxRules.current.noCooldown && now - lastItemUsedAt < 1200) return false;
        lastItemUsedAt = now;
        const item = LUA_BATTLE_ITEMS.find((i) => i.id === itemId) || LUA_BATTLE_ITEMS[0];
        if (!item) return false;
        const pPos = localPlayer.modelGroup.position;
        if (item.isReviveTicket) {
          localPlayer.revive();
          healRef.current(MAX_HEALTH);
          combatEffects.spawnFloatingHeal(pPos, MAX_HEALTH);
          combatEffects.spawnStatusText(pPos, `🎫 使用 [${item.name}] · 原地满血复活！`, '#fbbf24');
          audio.play('skill-heal', 0.7);
          skillEventRef.current?.({
            skillId: item.id,
            label: `${item.name} (原地满血复活)`,
            pos: [pPos.x, pPos.y, pPos.z],
          });
          return true;
        }
        if (item.heal > 0) {
          healRef.current(item.heal);
          combatEffects.spawnFloatingHeal(pPos, item.heal);
        }
        if (item.damageBoost > 0 || item.speedBoost > 0) {
          buffDamageMult = 1 + (item.damageBoost || 20) / 100;
          buffSpeedMult = 1 + (item.speedBoost || 15) / 100;
          buffExpireAt = now + 15000;
          activeBuffLabel = `⚡ ${item.name} (伤害+${item.damageBoost}% / 移速+${item.speedBoost}%)`;
        }
        combatEffects.spawnStatusText(
          pPos,
          `💊 使用 [${item.name}] ${item.heal > 0 ? `HP+${item.heal}` : ''} ${item.damageBoost > 0 ? `火力+${item.damageBoost}%` : ''}`,
          '#34d399'
        );
        skillEventRef.current?.({
          skillId: item.id,
          label: item.name,
          pos: [pPos.x, pPos.y, pPos.z],
        });
        audio.play('skill-heal', 0.65);
        syncHotbarNow();
        return true;
      },
      setWatchCameraMode(mode) {
        if (!cameraController) return;
        const cam = cameraController as any;
        if (mode === 'player') {
          cam.distance = 2.9;
          cam.heightOffset = 1.25;
        } else if (mode === 'chase') {
          cam.distance = 5.4;
          cam.heightOffset = 2.15;
        } else if (mode === 'free') {
          cam.distance = 9.5;
          cam.heightOffset = 4.2;
        }
      },
    };

    const lockPointer = () => {
      if (cancelled || paused.current || sandboxOpen.current || chatOpen.current || document.pointerLockElement) return;
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
      const request = document.body.requestPointerLock() as unknown as Promise<void> | undefined;
      if (request && typeof request.catch === 'function') void request.catch(() => undefined);
      try {
        (navigator as any).keyboard?.lock?.([
          'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyT', 'KeyY', 'KeyF', 'KeyE', 'KeyQ',
          'KeyB', 'KeyC', 'KeyZ', 'KeyX', 'KeyG', 'KeyH', 'KeyV', 'Tab', 'Space',
          'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6',
        ])?.catch?.(() => undefined);
      } catch {}
    };

    let lastHudClickAt = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      // 唯一保留的浏览器快捷键：F11 全屏切换
      if (event.code === 'F11' || event.key === 'F11') {
        return;
      }

      const isInputTarget =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement;

      // 进入对局后屏蔽全部浏览器默认快捷键（仅保留 F11 全屏）
      if (!isInputTarget) {
        event.preventDefault();
      } else if (
        event.altKey ||
        event.metaKey ||
        /^F([1-9]|10|12)$/.test(event.code) ||
        (event.ctrlKey && !['KeyA', 'KeyC', 'KeyV', 'KeyX', 'KeyZ'].includes(event.code))
      ) {
        event.preventDefault();
        return;
      }

      if (isInputTarget) return;
      if (chatOpen.current) return;

      // 语音快捷键 T / Y / V：标记宽限时间，避免首次请求麦克风权限脱离鼠标锁定时触发自动暂停
      if (event.code === 'KeyT' || event.code === 'KeyY' || event.code === 'KeyV') {
        lastHudClickAt = performance.now();
        audio.start();
        return;
      }

      if (paused.current || sandboxOpen.current) return;
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
      keys.add(event.code);
      audio.start();
      if (!document.pointerLockElement) lockPointer();

      if (event.code === 'Space' && !event.repeat && ready && !paused.current) {
        const wasFlying = Boolean(localPlayer?.isFlying);
        localPlayer?.jump();
        if (!wasFlying && localPlayer?.isFlying) {
          combatEffects.spawnStatusText(localPlayer.modelGroup.position, '🪽 二段跳展翼飞行！[空格爬升 / Shift或C或Ctrl俯冲]', '#38bdf8');
          syncHotbarNow();
        }
      }
      if (event.code === 'KeyB' && !event.repeat && ready && !paused.current) {
        active.current?.toggleFlight();
      }
      if (((event.code === 'ShiftLeft' || event.code === 'ControlLeft') && !localPlayer?.isFlying) && !event.repeat && ready && !paused.current) {
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
        else if (entry?.kind === 'wing') {
          if (entry.attachment) active.current?.equipWing(entry.attachment);
          active.current?.toggleFlight();
        } else if (entry?.kind === 'item') {
          if (entry.item.attachment?.bone === 'pet') {
            active.current?.equipPet(entry.item.attachment.id.replace(/^pet_/, ''));
          } else {
            const used = active.current?.useBattleItem(entry.id);
            if (!used) active.current?.useBattleItem('leechdom_first_aid_kit');
          }
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
      }
      keys.delete(event.code);
    };
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

    let lastSprayerBombAt = 0;
    const onDown = (event: PointerEvent) => {
      if (paused.current || sandboxOpen.current || chatOpen.current) return;
      if (event.target instanceof Element && event.target.closest('button, input, select, .settings-menu, .battle-inventory, .battle-sandbox-drawer, .battle-chat-box, .battle-skill-castbar, .battle-wing-flight-bar, .battle-voice-hud, .battle-team-hp-panel, .battle-lua-hud, .battle-watch-camera, .battle-votekick-modal')) {
        lastHudClickAt = performance.now();
        return;
      }
      audio.start();
      if (event.button === 2) {
        const curWeaponId = weapons[selected]?.id ?? '';
        const curFamily = curWeaponId.split('_')[0] ?? '';
        const curProfile = getWeaponCombatProfile(curWeaponId);
        if ((curFamily === 'sniperrifle' || curFamily === 'crossbow') && curProfile.isSight !== false) {
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
        } else if (curFamily === 'sprayer' && localPlayer) {
          // game_text.lua tips_weapon_penwuqi_Quest: 喷雾器左键喷射毒雾，按右键扔出毒雾弹，在指定区域里产生毒雾的效果。
          const now = performance.now();
          if (now - lastSprayerBombAt >= (sandboxRules.current.noCooldown ? 300 : 2200)) {
            lastSprayerBombAt = now;
            if (cameraController) localPlayer.syncFacingToCamera(cameraController.yaw);
            localPlayer.attack();
            audio.play('fire-grenade', 0.6);
            const aim = cameraController ? cameraController.getForwardDirection() : camera.getWorldDirection(new THREE.Vector3());
            const muzzle = localPlayer.getMuzzlePosition();
            const crosshairHit = mapCollider.raycastBullet(camera.position, aim, 90);
            const targetPoint = crosshairHit ? crosshairHit.point : camera.position.clone().addScaledVector(aim, 45);
            const launchDir = targetPoint.clone().sub(muzzle).normalize();
            projectiles.spawn('grenade', muzzle, launchDir, 'gasbomb', curWeaponId);
            combatEffects.spawnStatusText(localPlayer.modelGroup.position, '🔥 投掷烈焰毒雾弹！', '#fb923c');
          }
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
      if (performance.now() - lastHudClickAt < 2500) return;
      if (ready && !paused.current && !sandboxOpen.current && !chatOpen.current) pauseRef.current();
    };

    const onLockError = () => {
      if (cancelled || paused.current || sandboxOpen.current || chatOpen.current || lockAttempts >= 3) return;
      lockAttempts += 1;
      window.clearTimeout(lockTimer);
      lockTimer = window.setTimeout(lockPointer, 1200);
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };

    addEventListener('keydown', onKeyDown, { capture: true });
    addEventListener('keyup', onKeyUp, { capture: true });
    addEventListener('blur', onBlur);
    addEventListener('beforeunload', onBeforeUnload);
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

      // 注册场景网格、水面着色器、3D 建筑禁入盒 (DeadAABBs)、附加子模型与物理碰撞
      await mountMapExtraMeshesAndConfig(map as any, BASE, loader, visual, collision, mapCollider);
      scene.add(visual);

      // 如果当前房间选择了沙盒自制自定义地图，挂载全部自定义地形块、模型、NPC人物与怪物BOSS
      if (customMap) {
        await mountCustomMapNodesIntoScene(customMap, scene, mapCollider, botManager, assets);
      }

      // 2. 主玩家实体化 (绑定 PlayerEntity 核心类与 BattleAvatar 完整武器/动作系统)
      localPlayer = new PlayerEntity(scene);
      localPlayer.attachBattleAvatar(avatar);
      localPlayer.setCollisionEnvironment(mapCollider.toCollisionEnvironment());

      // 1:1 挂载玩家穿戴的 3D 翅膀配饰与骨骼动作 (wing01..wing45)
      if (wingAttachmentRef.current) {
        await localPlayer.equipWing(wingAttachmentRef.current);
      }

      // 挂接音效与事件
      localPlayer.events.onFootstep = (idx) => audio.play(`step${idx}`, 0.35);
      localPlayer.events.onJump = () => audio.play('jump');
      localPlayer.events.onLand = () => audio.play('land', 0.4);
      localPlayer.events.onRoll = () => audio.play('roll');
      localPlayer.events.onDamage = (dmg) => damageRef.current(dmg);

      // 挂载跟随宠物伴侣 (1:1 复刻 pet/*.lua + skill/pet_skill01.lua)
      if (hasPetCompanion) {
        const activePetId = (localStorage.getItem('avatarstar.activePet') || 'dragon').replace(/\.mesh\.glb$/i, '');
        loadPetModel(activePetId);
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
          propLoader.load(
            `${import.meta.env.BASE_URL}assets/gameplay/mesh/scene/level11/flag_red.mesh.glb`,
            (gltf) => {
              cloth.visible = false;
              gltf.scene.position.set(1.45, 2.75, 0);
              gltf.scene.traverse((c: any) => {
                if (c.isMesh && c.material && colorHex === 0x3b82f6) {
                  c.material = c.material.clone();
                  if (c.material.color) c.material.color.setHex(0x60a5fa);
                }
              });
              g.add(gltf.scene);
            },
            undefined,
            () => undefined
          );
          return g;
        };

        const rawRedFlag = map.redFlag;
        const redFlagPos = rawRedFlag?.length
          ? new THREE.Vector3(rawRedFlag[0] ?? safeSpawn.x, rawRedFlag[1] ?? safeSpawn.y, rawRedFlag[2] ?? safeSpawn.z)
          : safeSpawn.clone().add(new THREE.Vector3(2.2, 0, 2.2));
        redFlagPos.y = mapCollider.floorAt(redFlagPos.x, redFlagPos.z, redFlagPos.y + 3.2, 3.5) ?? safeSpawn.y;
        redFlagMesh = makeFlagMesh(0xef4444);
        redFlagMesh.position.copy(redFlagPos);
        objectiveGroup.add(redFlagMesh);

        const rawBlueFlag = map.blueFlag;
        const blueFlagPos = rawBlueFlag?.length
          ? new THREE.Vector3(rawBlueFlag[0] ?? holdVec.x, rawBlueFlag[1] ?? holdVec.y, rawBlueFlag[2] ?? holdVec.z)
          : holdVec.clone();
        blueFlagPos.y = mapCollider.floorAt(blueFlagPos.x, blueFlagPos.z, blueFlagPos.y + 3.2, 3.5) ?? holdVec.y;
        blueFlagMesh = makeFlagMesh(0x3b82f6);
        blueFlagMesh.position.copy(blueFlagPos);
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
          const ty = mapCollider.floorAt(tx, tz, (coords[1] ?? 1.5) + 3.2, 3.5) ?? holdVec.y;
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
          propLoader.load(
            `${import.meta.env.BASE_URL}assets/gameplay/mesh/prop/treasurechest/treasurechest_01.mesh.glb`,
            (gltf) => {
              box.visible = false;
              gltf.scene.position.set(0, 0.42, 0.45);
              gltf.scene.scale.setScalar(1.25);
              chestGroup.add(gltf.scene);
            },
            undefined,
            () => undefined
          );
          propLoader.load(
            `${import.meta.env.BASE_URL}assets/gameplay/mesh/prop/treasurechest/gold_01.mesh.glb`,
            (gltf) => {
              gltf.scene.position.set(0, 0.38, 0.45);
              gltf.scene.scale.setScalar(1.25);
              chestGroup.add(gltf.scene);
            },
            undefined,
            () => undefined
          );
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
          const by = mapCollider.floorAt(bx, bz, (sc[1] ?? 1.5) + 3.2, 3.5) ?? holdVec.y;
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

        plantedBombMesh = new THREE.Group();
        const fallbackBomb = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.3, 0.4),
          new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xff0000, emissiveIntensity: 1.0 })
        );
        plantedBombMesh.add(fallbackBomb);
        propLoader.load(
          `${import.meta.env.BASE_URL}assets/gameplay/mesh/prop/leibao_01/leibao_01.mesh.glb`,
          (gltf) => {
            fallbackBomb.visible = false;
            gltf.scene.scale.setScalar(1.3);
            plantedBombMesh.add(gltf.scene);
          },
          undefined,
          () => undefined
        );
        plantedBombMesh.visible = false;
        objectiveGroup.add(plantedBombMesh);
      } else if (normalizedMode === 'boss') {
        bossGroup = new THREE.Group();
        const core = new THREE.Mesh(
          new THREE.DodecahedronGeometry(1.25, 1),
          new THREE.MeshStandardMaterial({
            color: BOSS_STAGES[bossStageIdx].color,
            emissive: 0x7f1d1d,
            emissiveIntensity: 0.6,
            metalness: 0.65,
            roughness: 0.25,
          })
        );
        core.position.y = 1.8;
        bossCoreMesh = core;
        bossModelContainer = new THREE.Group();
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(2.1, 0.12, 12, 32),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xd97706, emissiveIntensity: 0.8 })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.15;
        bossHitboxMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(2.2, 2.2, 4.4, 12),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        bossHitboxMesh.position.y = 2.2;
        bossHitboxMesh.userData = { isBoss: true, userId: '__boss__' };
        bossGroup.add(core, bossModelContainer, ring, bossHitboxMesh);
        bossGroup.position.copy(holdVec);
        objectiveGroup.add(bossGroup);
        mapCollider.collisionMeshes.push(bossHitboxMesh);
        loadBossStageModel(bossStageIdx);
      }

      // 仅在单人训练场/靶场模式下自动召唤 AI 假人，真实多人联机房间绝不塞入假人数据
      const isPracticeSession = !roomId || roomId === 'practice' || roomId === 'default-room';
      if (isPracticeSession && botManager.bots.length === 0) {
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

      // 多人联机真人玩家全状态同步与 3D 插值 (含高度Y、飞行翼、武器切换、隐身与粒子拖尾)
      if (otherPlayers.current) {
        const renderTime = nowMs - 85;
        for (const [userIdStr, stateObj] of Object.entries(otherPlayers.current)) {
          const buffer = stateObj.buffer;
          if (buffer.length === 0) continue;

          let state0 = buffer[0];
          let state1 = buffer[buffer.length - 1];
          const latest = buffer[buffer.length - 1];
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

          const floorAtPos = mapCollider.floorAt(state0.x, state0.z, 80) ?? 0;
          let interpX = state0.x;
          let interpY = typeof state0.y === 'number' ? state0.y : floorAtPos;
          let interpZ = state0.z;
          let interpYaw = state0.yaw;

          if (state0 !== state1 && state1.time > state0.time) {
            const t = (renderTime - state0.time) / (state1.time - state0.time);
            const clampedT = Math.max(0, Math.min(1, t));
            interpX = state0.x + (state1.x - state0.x) * clampedT;
            const y0 = typeof state0.y === 'number' ? state0.y : floorAtPos;
            const y1 = typeof state1.y === 'number' ? state1.y : floorAtPos;
            interpY = y0 + (y1 - y0) * clampedT;
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
            otherPlayerEntities.set(userIdStr, remoteEntity);

            const pInfo = (roomPlayers && roomPlayers[userIdStr]) || (latest?.jobId ? latest : null);
            const resolvedJobId = pInfo?.jobId || 'commando';
            const resolvedAppearance = pInfo?.appearance;
            const job = (creation.jobs as any)[resolvedJobId] || (creation.jobs as any)['commando'];
            if (job && resolvedAppearance) {
              const preset = job.presets[resolvedAppearance.gender] || Object.values(job.presets)[0];
              const rawWIds = pInfo?.weaponIds || latest?.weaponIds;
              let pWeapons = Array.isArray(rawWIds)
                ? rawWIds.map((wId: string) => assets.weapons[wId]).filter(Boolean)
                : job.weapons;
              if (!pWeapons || pWeapons.length === 0) pWeapons = job.weapons;
              createBattleAvatar(creation, preset, resolvedAppearance, pWeapons)
                .then((loadedAvatar) => {
                  remoteEntity!.attachBattleAvatar(loadedAvatar);
                  if (wingAttachment) {
                    void remoteEntity!.equipWing(wingAttachment);
                  }
                })
                .catch((err) => {
                  console.error('Remote player load error:', err);
                  logDebug(`[Avatar Error] ${err.message || String(err)}`);
                });
            } else {
              remoteEntity
                .loadAvatar('/assets/creation/models/malecommandos.glb', '/assets/creation/models/body01.glb')
                .then(() => {
                  void remoteEntity!.loadAnimations(getWeaponActionSuite('smg_01').actions);
                })
                .catch(() => null);
            }
          }

          const oldPos = remoteEntity.modelGroup.position.clone();
          const effectiveY = Math.max(floorAtPos, interpY);
          remoteEntity.setTransform(interpX, effectiveY, interpZ, interpYaw);
          remoteEntity.isFlying = Boolean(latest?.isFlying);
          remoteEntity.modelGroup.visible = !latest?.stealthed;

          if (remoteEntity.isReady) {
            const speed = oldPos.distanceTo(remoteEntity.modelGroup.position) / Math.max(0.001, delta);
            if (remoteEntity.battleAvatar) {
              if (typeof latest?.weaponIndex === 'number') {
                remoteEntity.battleAvatar.setActiveWeaponIndex(latest.weaponIndex);
              }
              if (latest?.wingId && latest.wingId !== (remoteEntity as any)._lastWingId) {
                (remoteEntity as any)._lastWingId = latest.wingId;
                const wAtt =
                  assets.attachments?.[latest.wingId] ||
                  assets.items?.find((i) => i.id === latest.wingId || i.attachment?.id === latest.wingId)?.attachment;
                if (wAtt) {
                  void remoteEntity.equipWing(wAtt);
                }
              }
              remoteEntity.battleAvatar.setMoving(speed > 0.15 || Boolean(latest?.isFlying));
              remoteEntity.battleAvatar.update(delta);
              if (latest?.isFlying) {
                const wingTips = remoteEntity.getWingTipPositions();
                if (wingTips) {
                  combatEffects.spawnWingTrail(wingTips.left, wingTips.right, wingTips.wingId, true);
                }
              }
            } else {
              if (speed > 0.15) {
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
            skillEffects.triggerTenacityHealVfx?.();
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
          localPlayer.flyAscendInput = keys.has('Space') ? 1 : (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('ShiftLeft') || keys.has('KeyC')) ? -1 : 0;
        } else {
          localPlayer.flyAscendInput = 0;
        }

        const yaw = cameraController?.yaw ?? 0;
        const wasFlying = localPlayer.isFlying;
        localPlayer.setInput(dir, yaw, false);
        localPlayer.update(delta);
        if (wasFlying !== localPlayer.isFlying) {
          if (!wasFlying && localPlayer.isFlying) {
            combatEffects.spawnStatusText(localPlayer.modelGroup.position, '🪽 长按空格展翼爬升！[空格爬升 / Shift或C或Ctrl俯冲]', '#38bdf8');
          }
          syncHotbarNow();
        }
        if (petMixer) petMixer.update(delta);

        // 1:1 发射翅膀双翼尖粒子拖尾 (vfx_wing*_trail.vfx)
        if (localPlayer.hasWings && (localPlayer.isFlying || localPlayer.isMoving || !localPlayer.isGrounded)) {
          const wingTips = localPlayer.getWingTipPositions();
          if (wingTips) {
            combatEffects.spawnWingTrail(wingTips.left, wingTips.right, wingTips.wingId, localPlayer.isFlying);
          }
        }

        botManager.autoRespawn = normalizedMode === 'kill' ? false : sandboxRules.current.autoRespawnBots;
        botManager.update(delta, localPlayer, skillEffects.isStealthed());

        cameraController?.update(delta, mapCollider.collisionMeshes);

        const currentPos = localPlayer.modelGroup.position;
        const currentYaw = localPlayer.modelGroup.rotation.y;
        if (nowMs - (positionRef.current as any).lastTime > 50 || !(positionRef.current as any).lastTime) {
          (positionRef.current as any).lastTime = nowMs;
          positionRef.current(currentPos.x, currentPos.y, currentPos.z, currentYaw, {
            isFlying: localPlayer.isFlying,
            wingId: wingAttachment?.id ?? '',
            weaponIndex: selected,
            weaponId: weapons[selected]?.id ?? '',
            stealthed: skillEffects.isStealthed(),
            shieldGuarding,
          });
        }

        // 6. 模式专属 3D 目标实时判定与推进
        let statusText = '团队竞技 · 击败敌方目标夺取胜利';
        let ownerTeam: 'neutral' | 'red' | 'blue' = 'neutral';

        if (normalizedMode === 'occupy' && holdRingMesh) {
          holdRingMesh.rotation.z += delta * 0.8;
          const dist = currentPos.distanceTo(holdRingMesh.position);
          const botEnemyNear = botManager.getAliveTargets().some((b) => b.position.distanceTo(holdRingMesh.position) < 6.5);
          let remoteEnemyNear = false;
          for (const ent of otherPlayerEntities.values()) {
            if (ent.modelGroup.visible && ent.modelGroup.position.distanceTo(holdRingMesh.position) < 6.5) {
              remoteEnemyNear = true;
              break;
            }
          }
          const enemyNear = botEnemyNear || remoteEnemyNear;
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
              objectiveScoreRef.current(2, 0, '', { occupyProgress });
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
            if (bossMixer) {
              bossMixer.update(delta);
              const targetYaw = Math.atan2(currentPos.x - bossGroup.position.x, currentPos.z - bossGroup.position.z);
              bossGroup.rotation.y = targetYaw;
            } else {
              bossGroup.rotation.y += delta * 1.4;
            }
            bossAttackCooldown -= delta;
            if (bossAttackCooldown <= 0) {
              bossAttackCooldown = 4.2;
              if (bossAttackAction) {
                bossAttackAction.reset().play();
              }
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

      const hotbarInterval = (localPlayer?.isFlying || (localPlayer?.flyEnergy ?? 100) < 100) ? 45 : 100;
      if (nowMs - lastHotbar > hotbarInterval) {
        lastHotbar = nowMs;
        const snap = skillEffects.snapshot();
        const bySlot = skillEffects.bySlot();
        const byIdObj: Record<string, number> = {};
        for (const l of allLoadsRef.current) {
          const cdVal = skillEffects.cooldownOfSkill?.(l.skill.id) ?? 0;
          if (cdVal > 0) byIdObj[l.skill.id] = Math.round(cdVal * 10) / 10;
        }
        hotbarRef.current({
          cooldowns: BATTLE_QUICK_KEYS.map((_, index) => {
            const v = bySlot.get(index) ?? 0;
            return v > 0 ? Math.round(v * 10) / 10 : 0;
          }),
          byId: byIdObj,
          shield: Math.ceil(snap.shield),
          stealthed: skillEffects.isStealthed(),
          speed: snap.speed,
          maxHealthScale: snap.maxHealthScale,
          transferEnergy: Math.round(transfer.stored),
          isFlying: Boolean(localPlayer?.isFlying),
          flyEnergy: Math.round(localPlayer?.flyEnergy ?? 100),
        });
      }

      if (shotFlash > 0) { shotFlash -= delta; if (shotFlash <= 0) flash.intensity = 0; }
      combatEffects.update(delta);
      projectiles.update(delta);
      const projCountStr = String(projectiles.count());
      if (mount.dataset.projectileCount !== projCountStr) {
        mount.dataset.projectileCount = projCountStr;
      }
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      removeEventListener('keydown', onKeyDown, { capture: true });
      removeEventListener('keyup', onKeyUp, { capture: true });
      removeEventListener('blur', onBlur);
      removeEventListener('beforeunload', onBeforeUnload);
      try { (navigator as any).keyboard?.unlock?.(); } catch {}
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
  }, [map, character.jobId, character.name, creation, assets, avatarPreset, weapons.map((w) => w.id).join(','), active, paused]);

  return <div className="battle-canvas" ref={mountRef} data-gameplay-canvas />;
}

export default function Gameplay({ room, character, creation, assets, avatarPreset, wingAttachment, quickbar, skills, levels, bossSkills = [],
  volume, effectsVolume, onVolume, onEffectsVolume, onExit, onQuit = onExit }: {
  room: RoomConfig & { id?: string; players?: Record<string, any> };
  character: SavedCharacter;
  creation: CreationAssets;
  assets: LobbyAssets;
  avatarPreset?: CreationPreset;
  wingAttachment?: CreationAttachment;
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
  const [activeWingId, setActiveWingId] = useState<string>(
    () => wingAttachment?.id || localStorage.getItem('avatarstar.activeWing') || 'wing01_indie'
  );
  const resolvedWingAttachment = useMemo(() => {
    if (!activeWingId || activeWingId === 'none') return undefined;
    return (
      assets.attachments?.[activeWingId] ||
      assets.items?.find((i) => i.id === activeWingId || i.attachment?.id === activeWingId)?.attachment ||
      wingAttachment ||
      assets.attachments?.['wing01_indie']
    );
  }, [activeWingId, assets.attachments, assets.items, wingAttachment]);
  const allWingOptions = useMemo(() => {
    const byId = new Map<string, CreationAttachment>();
    for (const a of Object.values(assets.attachments || {})) {
      if (a.id.startsWith('wing') && a.model && !a.id.startsWith('piece_')) {
        byId.set(a.id, a);
      }
    }
    for (const item of assets.items || []) {
      if (item.attachment && item.id.startsWith('wing') && item.attachment.model && !item.id.startsWith('piece_')) {
        if (!byId.has(item.id)) {
          byId.set(item.id, { ...item.attachment, id: item.id, label: item.name, icon: item.icon });
        }
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
  }, [assets.attachments, assets.items]);
  const [chatMessages, setChatMessages] = useState<BattleChatMessage[]>([
    {
      id: 'sys-init',
      sender: '战术指挥部',
      channel: 'system',
      content: '按 [空格x2] 二段跳、[长按空格] 爬升滑翔、或点击装备栏飞行器/按 [B] 凌空飞行！燃烧器右键可投掷毒雾燃烧弹！',
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
  const [watchCamMode, setWatchCamMode] = useState<'player' | 'chase' | 'free'>('player');
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showSettlement, setShowSettlement] = useState(false);
  const [flippedCards, setFlippedCards] = useState<Record<number, { name: string; icon: string; amount: string; rarity: string }>>({});
  const damageBonusMult = useMemo(() => Math.max(1, 1 + Math.max(0, (character.power ?? 1500) - 1500) / 2500), [character.power]);
  const [hasPetCompanion] = useState(true);
  const [activePetId, setActivePetId] = useState<string>(
    () => (localStorage.getItem('avatarstar.activePet') || 'dragon').replace(/\.mesh\.glb$/i, '')
  );
  const [medkitsLeft, setMedkitsLeft] = useState(5);
  const [buffItemsLeft, setBuffItemsLeft] = useState(3);
  const [reviveTicketsLeft, setReviveTicketsLeft] = useState(3);
  const [showVoteKickModal, setShowVoteKickModal] = useState(false);
  const [voteTarget, setVoteTarget] = useState('');
  const [voteReason, setVoteReason] = useState('挂机 / 消极比赛');
  const [feedbackText, setFeedbackText] = useState('');
  const [voteNotice, setVoteNotice] = useState('');

  const wsRef = useRef<WebRTCClient | null>(null);
  const voiceManagerRef = useRef<VoiceChatManager | null>(null);
  const [voiceSnap, setVoiceSnap] = useState<VoiceManagerSnapshot | null>(null);
  const sequenceRef = useRef(0);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const logDebug = (msg: string) => setDebugLog(prev => [...prev.slice(-4), msg]);

  const pushKillFeed = (text: string, color = '#fde047') => {
    if (!text) return;
    setKillFeed((prev) => [{ id: Date.now() + Math.random(), text, color }, ...prev.slice(0, 4)]);
  };

  const [livePlayers, setLivePlayers] = useState<Record<string, any>>(() => ({ ...(room.players || {}) }));
  const livePlayersRef = useRef<Record<string, any>>(livePlayers);
  livePlayersRef.current = livePlayers;
  const [remoteStats, setRemoteStats] = useState<Record<string, { kills: number; deaths: number; hp?: number }>>({});

  useEffect(() => {
    if (room.players) {
      setLivePlayers((prev) => ({ ...prev, ...room.players }));
    }
  }, [room.players]);

  const myUserId = useMemo(() => {
    const me = Object.values(room.players || {}).find((p: any) => p.username === character.name);
    if (me && (me as any).userId) return Number((me as any).userId);
    const savedId = Number(localStorage.getItem('userId') || 0);
    if (savedId > 0) return savedId;
    let hash = 0;
    for (let i = 0; i < character.name.length; i++) {
      hash = (hash << 5) - hash + character.name.charCodeAt(i);
      hash |= 0;
    }
    return (Math.abs(hash) % 900000) + 100000;
  }, [room.players, character.name]);

  const otherPlayersRef = useRef<Record<string, { buffer: Array<{ x: number; y?: number; z: number; yaw: number; time: number; [k: string]: any }> }>>({});
  const [selected, setSelected] = useState(0);
  const [ammo, setAmmo] = useState<number[]>([]);
  const [reserves, setReserves] = useState<number[]>([]);
  const [health, setHealth] = useState(MAX_HEALTH);
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0, yaw: 0 });
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
  pausedRef.current = paused || showSettlement || showVoteKickModal;
  ammoRef.current = ammo;
  reservesRef.current = reserves;
  const loads = useMemo(() => loadSkills(skills, levels), [skills, levels]);
  const bossLoads = useMemo(() => loadSkills(bossSkills, bossSkills.map(() => 1)), [bossSkills]);
  const allLoads = useMemo(() => [...loads, ...bossLoads], [loads, bossLoads]);
  const { slots, weapons: rawWeapons } = useMemo(
    () => resolveLoadout(quickbar, assets.weapons, allLoads, assets.attachments, resolvedWingAttachment, assets.items),
    [quickbar, assets.weapons, assets.attachments, assets.items, allLoads, resolvedWingAttachment]
  );
  const effectiveWeapons = useMemo(
    () => (rawWeapons.length > 0 ? rawWeapons : creation.jobs[character.jobId]?.weapons ?? []),
    [rawWeapons, creation.jobs, character.jobId]
  );
  const weaponsKey = effectiveWeapons.map((w) => w.id).join(',');
  const weapons = useMemo(() => effectiveWeapons, [weaponsKey]);
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
    if ((paused || sandboxOpen || showSettlement || chatOpen || showVoteKickModal) && document.pointerLockElement) document.exitPointerLock();
  }, [paused, sandboxOpen, showSettlement, chatOpen, showVoteKickModal]);

  const handleUseMedicalKit = () => {
    if (medkitsLeft <= 0 && !sandboxRulesRef.current.infiniteAmmo) return;
    if (control.current?.useBattleItem('leechdom_first_aid_kit')) {
      if (!sandboxRulesRef.current.infiniteAmmo) setMedkitsLeft((n) => Math.max(0, n - 1));
      pushKillFeed(`💊 [${character.name}] 使用了战场急救包 (HP+650)`, '#34d399');
    }
  };

  const handleUseBuffItem = () => {
    if (buffItemsLeft <= 0 && !sandboxRulesRef.current.infiniteAmmo) return;
    if (control.current?.useBattleItem('food_lobster')) {
      if (!sandboxRulesRef.current.infiniteAmmo) setBuffItemsLeft((n) => Math.max(0, n - 1));
      pushKillFeed(`🦞 [${character.name}] 服用了黄金龙虾大餐 (伤害+25% / 移速+18%)`, '#fbbf24');
    }
  };

  const handleUseReviveTicket = () => {
    if (respawnCountdown <= 0) return;
    if (reviveTicketsLeft <= 0 && !sandboxRulesRef.current.infiniteAmmo) return;
    if (!sandboxRulesRef.current.infiniteAmmo) setReviveTicketsLeft((n) => Math.max(0, n - 1));
    setRespawnCountdown(0);
    setWatchCamMode('player');
    control.current?.setWatchCameraMode('player');
    setHealth(maxHealth);
    setAmmo(weapons.map(magazine));
    control.current?.useBattleItem('ticket_anabiosis');
    pushKillFeed(`🎫 [${character.name}] 使用了复活币 (ticket_anabiosis) 原地满血复活！`, '#fbbf24');
  };

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
      Promise.resolve(document.body.requestPointerLock?.()).catch(() => {});
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
      Promise.resolve(document.body.requestPointerLock?.()).catch(() => {});
    }
  };

  // Respawn countdown when player HP reaches 0
  useEffect(() => {
    if (health > 0 || respawnCountdown > 0) return;
    setPlayerDeaths((d) => d + 1);
    setScoreBlue((b) => b + 1);
    pushKillFeed(`💀 [${character.name}] 阵亡，3 秒后于红方基地重整复活 (可按 [H] 使用复活币立即复活)`, '#f87171');
    setRespawnCountdown(3);
  }, [health]);

  useEffect(() => {
    if (respawnCountdown <= 0) return;
    const t = window.setTimeout(() => {
      if (respawnCountdown <= 1) {
        setRespawnCountdown(0);
        setWatchCamMode('player');
        control.current?.setWatchCameraMode('player');
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

  // Ensure leaving or closing browser during battle immediately removes player and closes room if empty
  useEffect(() => {
    const rId = room.id;
    if (!rId || rId === 'practice' || rId === 'default-room') return;
    const onUnload = () => {
      try {
        fetch(`/api/rooms/${rId}/leave?username=${encodeURIComponent(character.name)}`, {
          method: 'POST',
          keepalive: true,
        }).catch(() => undefined);
      } catch {}
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [room.id, character.name]);

  useEffect(() => {
    const roomId = room.id ?? 'practice';
    const gameUrl = `${WS_BASE}?roomId=${roomId}&playerId=${myUserId}`;
    const sigUrl = `${WS_BASE.replace('/ws', '/webrtc')}?roomId=${roomId}&playerId=${myUserId}`;
    const ws = new WebRTCClient(gameUrl, sigUrl, () => {
      logDebug(`[Network] WebRTC DataChannel OPENED! 握手成功`);
      sequenceRef.current++;
      ws.sendMove(myUserId, position.x, position.y, position.z, position.yaw, sequenceRef.current, {
        username: character.name,
        jobId: character.jobId,
        appearance: character.appearance,
        weaponIds: weapons.map((w) => w.id),
      });
    });
    wsRef.current = ws;

    const voiceMgr = new VoiceChatManager({
      roomId,
      userId: myUserId || character.name,
      username: character.name,
      team: 'red',
      externalSendJSON: (pkt) => ws.sendJSON(pkt),
    });
    voiceManagerRef.current = voiceMgr;
    const unsubVoice = voiceMgr.subscribe((snap) => setVoiceSnap(snap));

    ws.onMessage = (msg) => {
      try {
        if (voiceMgr.handleServerMessage(msg)) return;
        if (msg.type === 'room_closed') {
          onExit();
          return;
        }
        if (msg.type === 'join') {
          if (msg.userId && msg.username) {
            setLivePlayers((prev) => ({
              ...prev,
              [String(msg.userId)]: {
                ...(prev[String(msg.userId)] || {}),
                userId: msg.userId,
                username: msg.username,
                jobId: msg.jobId || prev[String(msg.userId)]?.jobId || 'commando',
                appearance: msg.appearance || prev[String(msg.userId)]?.appearance,
                weaponIds: msg.weaponIds || prev[String(msg.userId)]?.weaponIds,
                team: msg.team || prev[String(msg.userId)]?.team || 'blue',
              },
            }));
            if (msg.username !== character.name) {
              pushKillFeed(`🚀 [${msg.username}] 加入了战场！`, '#38bdf8');
            }
          }
          return;
        }
        if (msg.type === 'leave') {
          const uidStr = String(msg.userId ?? '');
          const leaverName = msg.username || livePlayersRef.current[uidStr]?.username || '玩家';
          if (uidStr) {
            delete otherPlayersRef.current[uidStr];
            control.current?.removeRemotePlayer(uidStr);
            setLivePlayers((prev) => {
              const next = { ...prev };
              delete next[uidStr];
              return next;
            });
          }
          if (leaverName && leaverName !== character.name) {
            pushKillFeed(`👋 [${leaverName}] 离开了战场`, '#94a3b8');
          }
          return;
        }
        if (msg.type === 'vote_kick') {
          const text = `⚖️ [${msg.initiator || '队友'}] 发起投票踢出 [${msg.target || '目标'}] (原因: ${msg.reason || '违规'})`;
          pushKillFeed(text, '#fbbf24');
          return;
        }
        if (msg.type === 'tick') {
          setRemaining(msg.time_left);
          setScoreRed(msg.score_red);
          setScoreBlue(msg.score_blue);
        } else if (msg.type === 'health_update') {
          if (msg.userId == myUserId) {
            if (msg.hp < healthRef.current) {
              triggerHurtFlash();
            }
            setHealth(msg.hp);
          } else if (msg.userId != null) {
            setRemoteStats((prev) => ({
              ...prev,
              [String(msg.userId)]: {
                kills: prev[String(msg.userId)]?.kills ?? 0,
                deaths: prev[String(msg.userId)]?.deaths ?? 0,
                hp: msg.hp,
              },
            }));
          }
        } else if (msg.type === 'sync' && msg.userId != myUserId) {
          const uidStr = String(msg.userId);
          if (!otherPlayersRef.current[uidStr]) {
            logDebug(`[Network] 接收到玩家数据 (userId=${uidStr})，开始渲染`);
            otherPlayersRef.current[uidStr] = { buffer: [] };
          }
          if (msg.username && !livePlayersRef.current[uidStr]) {
            setLivePlayers((prev) => ({
              ...prev,
              [uidStr]: {
                userId: msg.userId,
                username: msg.username,
                jobId: msg.jobId || 'commando',
                appearance: msg.appearance,
                weaponIds: msg.weaponIds,
                team: msg.team || 'blue',
              },
            }));
          }
          const buffer = otherPlayersRef.current[uidStr].buffer;
          buffer.push({
            x: msg.x,
            y: typeof msg.y === 'number' ? msg.y : undefined,
            z: msg.z,
            yaw: msg.yaw,
            isFlying: msg.isFlying,
            wingId: msg.wingId,
            weaponIndex: msg.weaponIndex,
            weaponId: msg.weaponId,
            stealthed: msg.stealthed,
            shieldGuarding: msg.shieldGuarding,
            username: msg.username,
            jobId: msg.jobId,
            appearance: msg.appearance,
            weaponIds: msg.weaponIds,
            time: performance.now(),
          });
          if (buffer.length > 20) buffer.shift();
        } else if (msg.type === 'fire' && msg.userId != myUserId) {
          control.current?.handleRemoteFire(msg);
        } else if (msg.type === 'skill_cast' && msg.userId != myUserId) {
          control.current?.handleRemoteSkill(msg);
          if (msg.feedText) {
            pushKillFeed(msg.feedText, '#38bdf8');
          }
        } else if (msg.type === 'hit') {
          if (msg.targetId === '__boss__' && msg.attackerId != myUserId) {
            control.current?.handleRemoteBossHit(msg);
          }
        } else if (msg.type === 'objective_action' && msg.userId != myUserId) {
          control.current?.handleRemoteObjective(msg);
          if (msg.feedText) {
            pushKillFeed(msg.feedText, '#fbbf24');
          }
        } else if (msg.type === 'kill') {
          const killerUid = String(msg.killerId ?? '');
          const victimUid = String(msg.victimId ?? '');
          const killerName =
            msg.killerId == myUserId
              ? character.name
              : livePlayersRef.current[killerUid]?.username || `玩家#${killerUid}`;
          const victimName =
            msg.victimId == myUserId
              ? character.name
              : livePlayersRef.current[victimUid]?.username || `玩家#${victimUid}`;
          if (msg.killerId == myUserId) {
            setPlayerKills((k) => k + 1);
          } else if (killerUid) {
            setRemoteStats((prev) => ({
              ...prev,
              [killerUid]: {
                kills: (prev[killerUid]?.kills ?? 0) + 1,
                deaths: prev[killerUid]?.deaths ?? 0,
                hp: prev[killerUid]?.hp,
              },
            }));
          }
          if (victimUid && msg.victimId != myUserId) {
            setRemoteStats((prev) => ({
              ...prev,
              [victimUid]: {
                kills: prev[victimUid]?.kills ?? 0,
                deaths: (prev[victimUid]?.deaths ?? 0) + 1,
                hp: 0,
              },
            }));
          }
          pushKillFeed(`⚔️ [${killerName}] 击败了 [${victimName}]`, msg.killerId == myUserId ? '#34d399' : '#f87171');
          control.current?.handleRemoteKill(msg.victimId);
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
        } else if (msg.type === 'respawn') {
          if (msg.userId == myUserId) {
            setHealth(maxHealth);
          } else {
            const uidStr = String(msg.userId ?? '');
            if (uidStr) {
              setRemoteStats((prev) => ({
                ...prev,
                [uidStr]: {
                  kills: prev[uidStr]?.kills ?? 0,
                  deaths: prev[uidStr]?.deaths ?? 0,
                  hp: MAX_HEALTH,
                },
              }));
            }
            control.current?.handleRemoteRespawn(msg.userId);
          }
        } else if (msg.type === 'game_over') {
          setShowSettlement(true);
        }
      } catch (err) {}
    };

    return () => {
      unsubVoice();
      voiceMgr.destroy();
      voiceManagerRef.current = null;
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
      const isInputTarget =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement;

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
      if (chatOpenRef.current || isInputTarget) {
        if (event.key === 'Escape' && chatOpenRef.current) {
          event.preventDefault();
          chatOpenRef.current = false;
          setChatOpen(false);
          Promise.resolve(document.body.requestPointerLock?.()).catch(() => {});
        }
        return;
      }
      if (event.code === 'KeyT' && !sandboxOpenRef.current) {
        event.preventDefault();
        if (!event.repeat) {
          void voiceManagerRef.current?.setPushToTalkPressed(true);
          pushKillFeed(`🎙️ [${character.name}] 正在按住 [T] 键进行战术语音通话...`, '#34d399');
        }
        return;
      }
      if (event.code === 'KeyY' && !event.repeat && !sandboxOpenRef.current) {
        event.preventDefault();
        const mgr = voiceManagerRef.current;
        if (mgr) {
          const willEnable = !mgr.micEnabled;
          void mgr.toggleMicrophone();
          pushKillFeed(
            willEnable
              ? `🎙️ [语音] 已开启自由麦实时语音 [Y] (可随时按 Y 关闭或按住 T 说话)`
              : `🔇 [语音] 已关闭麦克风实时语音 [Y]`,
            willEnable ? '#34d399' : '#94a3b8'
          );
        }
        return;
      }
      if (event.code === 'Digit5' && !event.repeat && !pausedRef.current && !sandboxOpenRef.current && (!slots[4] || slots[4].kind === 'empty')) {
        event.preventDefault();
        handleUseMedicalKit();
        return;
      }
      if (event.code === 'Digit6' && !event.repeat && !pausedRef.current && !sandboxOpenRef.current && (!slots[5] || slots[5].kind === 'empty')) {
        event.preventDefault();
        handleUseBuffItem();
        return;
      }
      if (event.code === 'KeyH' && !event.repeat && respawnCountdown > 0) {
        event.preventDefault();
        handleUseReviveTicket();
        return;
      }
      if (respawnCountdown > 0 && (event.key === 'F1' || event.key === 'F3')) {
        event.preventDefault();
        const nextMode = event.key === 'F1' ? 'player' : 'free';
        setWatchCamMode(nextMode);
        control.current?.setWatchCameraMode(nextMode);
        return;
      }
      if (event.code === 'KeyV' && !event.repeat && !sandboxOpenRef.current) {
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
        } else if (showVoteKickModal) {
          setShowVoteKickModal(false);
        } else if (showScoreboard) {
          setShowScoreboard(false);
        } else if (sandboxOpenRef.current) {
          sandboxOpenRef.current = false;
          setSandboxOpen(false);
          Promise.resolve(document.body.requestPointerLock?.()).catch(() => {});
        } else {
          setPaused(true);
        }
      } else if (event.key === 'F2') {
        event.preventDefault();
        if (respawnCountdown > 0) {
          setWatchCamMode('chase');
          control.current?.setWatchCameraMode('chase');
          return;
        }
        setSandboxOpen((prev) => {
          const next = !prev;
          sandboxOpenRef.current = next;
          if (!next && !pausedRef.current) {
            Promise.resolve(document.body.requestPointerLock?.()).catch(() => {});
          }
          return next;
        });
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'KeyT') {
        void voiceManagerRef.current?.setPushToTalkPressed(false);
      }
    };
    const onWindowBlur = () => {
      if (voiceManagerRef.current?.pttPressed) {
        void voiceManagerRef.current.setPushToTalkPressed(false);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [showScoreboard, showVoteKickModal, voiceWheelOpen, chatChannel, respawnCountdown, medkitsLeft, buffItemsLeft, reviveTicketsLeft, slots, character.name]);

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
    } else if (entry.kind === 'wing') {
      if (entry.attachment && entry.id !== activeWingId && entry.attachment.id !== resolvedWingAttachment?.id) {
        setActiveWingId(entry.id);
        control.current?.equipWing(entry.attachment);
      }
      control.current?.toggleFlight();
    } else if (entry.kind === 'item') {
      setSelectedSlot(slot);
      if (entry.item.attachment?.bone === 'pet') {
        const petModel = entry.item.attachment.id.replace(/^pet_/, '');
        setActivePetId(petModel);
        control.current?.equipPet(petModel);
      } else {
        const used = control.current?.useBattleItem(entry.id);
        if (!used) handleUseMedicalKit();
      }
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

  const reportPosition = (x: number, y: number, z: number, yaw: number, extra?: Record<string, any>) => {
    if (wsRef.current) {
      sequenceRef.current++;
      wsRef.current.sendMove(myUserId, x, y, z, yaw, sequenceRef.current, {
        ...extra,
        username: character.name,
        jobId: character.jobId,
        appearance: character.appearance,
        weaponIds: weapons.map((w) => w.id),
      });
    }
    voiceManagerRef.current?.updateLocalTransform(x, y, z, yaw);
    setPosition((previous) =>
      Math.abs(previous.x - x) + Math.abs((previous.y ?? 0) - y) + Math.abs(previous.z - z) + Math.abs(previous.yaw - yaw) > 2.0
        ? { x, y, z, yaw }
        : previous
    );
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
    const rId = room.id ?? '';
    if (rId && rId !== 'practice' && rId !== 'default-room') {
      void apiFetch(`/rooms/${rId}/leave?username=${encodeURIComponent(character.name)}`, {
        method: 'POST',
      }).catch(() => undefined);
    }
    void apiFetch('/battle/settle', {
      method: 'POST',
      body: JSON.stringify({
        roomId: rId,
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
      roomId={room.id ?? 'practice'}
      modeId={room.modeId || 'team'}
      damageBonusMult={damageBonusMult}
      hasPetCompanion={hasPetCompanion}
      wingAttachment={resolvedWingAttachment}
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
      onObjectiveScore={(redDelta, blueDelta, feedText, extra) => {
        if (redDelta > 0) {
          setScoreRed((prev) => prev + redDelta);
          setObjectivePoints((p) => p + redDelta * 25);
        }
        if (blueDelta > 0) setScoreBlue((prev) => prev + blueDelta);
        if (feedText) pushKillFeed(feedText, '#fbbf24');
        wsRef.current?.sendJSON({
          type: 'objective_action',
          userId: myUserId,
          redDelta,
          blueDelta,
          feedText,
          modeId: room.modeId,
          ...(extra || {}),
        });
      }}
      onObjectiveState={(next) => {
        setObjectiveState((prev) => {
          if (
            prev.modeId === next.modeId &&
            prev.statusText === next.statusText &&
            prev.progress === next.progress &&
            prev.ownerTeam === next.ownerTeam &&
            prev.carryingFlag === next.carryingFlag &&
            prev.treasuresCollected === next.treasuresCollected &&
            prev.activeBuff === next.activeBuff &&
            prev.bombPlanted === next.bombPlanted &&
            prev.bombTimer === next.bombTimer &&
            prev.roundNumber === next.roundNumber &&
            prev.bossName === next.bossName &&
            prev.bossHp === next.bossHp &&
            prev.bossMaxHp === next.bossMaxHp &&
            prev.bossStage === next.bossStage
          ) {
            return prev;
          }
          return next;
        });
      }}
      onHitMarker={triggerHitMarker}
      onRecoil={triggerRecoil}
      onScopeChange={(scoped, fam) => setScopedFamily(scoped ? fam : '')}
      onShieldGuardChange={setShieldGuarding}
      onReady={() => setReady(true)}
      onPosition={reportPosition}
      onFireEvent={(evt) => {
        wsRef.current?.sendJSON({
          type: 'fire',
          userId: myUserId,
          ...evt,
        });
      }}
      onSkillEvent={(evt) => {
        wsRef.current?.sendJSON({
          type: 'skill_cast',
          userId: myUserId,
          ...evt,
        });
      }}
      otherPlayers={otherPlayersRef}
      roomPlayers={livePlayers}
      logDebug={logDebug}
      onShot={onShot}
      onHotbar={(next) => {
        setHotbar((prev) => {
          if (
            prev.shield === next.shield &&
            prev.stealthed === next.stealthed &&
            prev.speed === next.speed &&
            prev.maxHealthScale === next.maxHealthScale &&
            prev.transferEnergy === next.transferEnergy &&
            prev.isFlying === next.isFlying &&
            prev.flyEnergy === next.flyEnergy &&
            prev.cooldowns.length === next.cooldowns.length &&
            prev.cooldowns.every((v, i) => v === next.cooldowns[i])
          ) {
            const prevById = prev.byId ?? {};
            const nextById = next.byId ?? {};
            const prevKeys = Object.keys(prevById);
            const nextKeys = Object.keys(nextById);
            if (
              prevKeys.length === nextKeys.length &&
              nextKeys.every((k) => prevById[k] === nextById[k])
            ) {
              return prev;
            }
          }
          return next;
        });
      }}
      onHit={(targetId, damage, crit, weaponName, extra) => {
        if (wsRef.current) {
          wsRef.current.sendJSON({
            type: 'hit',
            attackerId: myUserId,
            targetId,
            damage,
            crit,
            weaponName,
            ...(extra || {}),
          });
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

    {/* Respawn Countdown + WatchCameraControl.lua Spectator Camera & ticket_anabiosis.lua Revival Ticket */}
    {respawnCountdown > 0 && (
      <div
        className="battle-watch-camera"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(127, 29, 29, 0.42)',
          zIndex: 35,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          color: '#fff',
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 900, textShadow: '0 4px 16px #000' }}>
          ⚠️ 阵亡重整中 · {respawnCountdown} 秒后于己方基地复活
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(15, 23, 42, 0.92)',
            border: '1px solid #38bdf8',
            borderRadius: 12,
            padding: '10px 18px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.65)',
          }}
        >
          <span style={{ fontSize: 12, color: '#93c5fd', fontWeight: 'bold' }}>
            🎥 观战视角 (WatchCameraControl.lua):
          </span>
          {(
            [
              { id: 'player', label: '👁️ 玩家视角 [F1]' },
              { id: 'chase', label: '🎥 环绕追踪 [F2]' },
              { id: 'free', label: '🦅 自由俯瞰 [F3]' },
            ] as const
          ).map((cam) => (
            <button
              key={cam.id}
              type="button"
              onClick={() => {
                setWatchCamMode(cam.id);
                control.current?.setWatchCameraMode(cam.id);
              }}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                border: watchCamMode === cam.id ? '1px solid #38bdf8' : '1px solid #475569',
                background: watchCamMode === cam.id ? '#0284c7' : '#1e293b',
                color: '#fff',
                fontSize: 11,
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              {cam.label}
            </button>
          ))}
          <button
            type="button"
            onClick={handleUseReviveTicket}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: '1px solid #fbbf24',
              background: 'linear-gradient(90deg, #d97706, #ea580c)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 'bold',
              cursor: 'pointer',
              marginLeft: 6,
            }}
          >
            🎫 使用复活币立即原地满血复活 [H] (剩余 {sandboxRules.infiniteAmmo ? '∞' : reviveTicketsLeft})
          </button>
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

    {/* 1:1 Wing Flight HUD + Lua Battle Consumables (item/*.lua) + 16-Pet Companion Switcher (pet/*.lua) */}
    {ready && (
      <div
        className="battle-wing-flight-bar battle-lua-hud"
        aria-label="翅膀飞行推进器与战场战术道具栏"
        style={{
          position: 'fixed',
          bottom: 156,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 22,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 8,
          background: 'rgba(15, 23, 42, 0.90)',
          border: `1px solid ${hotbar.isFlying ? '#38bdf8' : 'rgba(148, 163, 184, 0.45)'}`,
          borderRadius: 999,
          padding: '5px 14px',
          boxShadow: hotbar.isFlying ? '0 0 18px rgba(56, 189, 248, 0.45)' : '0 4px 14px rgba(0,0,0,0.45)',
          color: '#f8fafc',
          fontSize: 12,
        }}
      >
        <button
          type="button"
          onClick={() => control.current?.toggleFlight()}
          style={{
            padding: '4px 11px',
            borderRadius: 999,
            border: '1px solid #38bdf8',
            background: hotbar.isFlying ? 'linear-gradient(90deg, #0284c7, #2563eb)' : '#1e293b',
            color: '#fff',
            fontSize: 11,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
          title="连按两次空格二段跳自动展翼飞行，或按 [B] 键一键切换飞行"
        >
          {hotbar.isFlying ? '✈️ 飞行中 [空格爬升/Ctrl俯冲]' : '🪽 展翼飞行 [双击空格 / B]'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: '#93c5fd', fontSize: 11, fontWeight: 'bold' }}>翼能</span>
          <div style={{ width: 76, height: 8, background: '#1e293b', borderRadius: 4, overflow: 'hidden', border: '1px solid #334155' }}>
            <div
              style={{
                width: `${Math.max(0, Math.min(100, hotbar.flyEnergy ?? 100))}%`,
                height: '100%',
                background: hotbar.isFlying
                  ? 'linear-gradient(90deg, #38bdf8, #818cf8)'
                  : 'linear-gradient(90deg, #10b981, #34d399)',
                transition: 'width 0.12s linear',
              }}
            />
          </div>
          <span style={{ fontSize: 11, color: '#cbd5e1', minWidth: 28 }}>{hotbar.flyEnergy ?? 100}%</span>
        </div>

        <select
          value={activeWingId}
          onChange={(e) => {
            const nextId = e.target.value;
            setActiveWingId(nextId);
            if (nextId && nextId !== 'none') {
              localStorage.setItem('avatarstar.activeWing', nextId);
            } else {
              localStorage.removeItem('avatarstar.activeWing');
            }
          }}
          style={{
            background: '#0f172a',
            color: '#fde68a',
            border: '1px solid #475569',
            borderRadius: 6,
            padding: '2px 6px',
            fontSize: 11,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
          title="切换穿戴的 3D 翅膀配饰"
        >
          {allWingOptions.map((w) => (
            <option key={w.id} value={w.id}>
              🪽 {w.label}
            </option>
          ))}
          <option value="none">卸下翅膀</option>
        </select>

        {/* Lua Battle Consumables (item/leechdom_first_aid_kit.lua & item/food_lobster.lua) */}
        <button
          type="button"
          onClick={handleUseMedicalKit}
          style={{
            padding: '3px 9px',
            borderRadius: 999,
            border: '1px solid #10b981',
            background: '#064e3b',
            color: '#a7f3d0',
            fontSize: 11,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
          title="使用战场急救包 (item/leechdom_first_aid_kit.lua · 立即恢复 650 生命值) 快捷键 [5]"
        >
          💊 急救包 [5] ({sandboxRules.infiniteAmmo ? '∞' : medkitsLeft})
        </button>

        <button
          type="button"
          onClick={handleUseBuffItem}
          style={{
            padding: '3px 9px',
            borderRadius: 999,
            border: '1px solid #f59e0b',
            background: '#78350f',
            color: '#fde68a',
            fontSize: 11,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
          title="使用黄金龙虾增益料理 (item/food_lobster.lua + buff/20..29.lua · 伤害+25% 移速+18%) 快捷键 [6]"
        >
          🦞 料理增益 [6] ({sandboxRules.infiniteAmmo ? '∞' : buffItemsLeft})
        </button>

        {/* 16 Decrypted Pet Companions Selector (pet/*.lua + skill/pet_skill01.lua) */}
        <select
          value={activePetId}
          onChange={(e) => {
            const nextPet = e.target.value;
            setActivePetId(nextPet);
            if (nextPet && nextPet !== 'none') {
              localStorage.setItem('avatarstar.activePet', nextPet);
            } else {
              localStorage.removeItem('avatarstar.activePet');
            }
            control.current?.equipPet(nextPet);
          }}
          style={{
            background: '#0f172a',
            color: '#6ee7b7',
            border: '1px solid #10b981',
            borderRadius: 6,
            padding: '2px 6px',
            fontSize: 11,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
          title="切换 3D 跟随宠物伴侣 (pet/*.lua · 16只原版宠物)"
        >
          {Object.values(LUA_PETS).map((pet) => (
            <option key={pet.id} value={pet.id}>
              🐾 {pet.name} ({pet.id})
            </option>
          ))}
          <option value="none">卸下跟宠</option>
        </select>
      </div>
    )}

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

    {/* 1:1 Team HP & Voice Speaking Roster Panel (team_hp_name.lua + 玩家麦克风语音说话指示) */}
    {ready && (
      <aside
        className="battle-team-hp-panel"
        aria-label="小队血量与语音状态栏"
        style={{
          position: 'fixed',
          top: 56,
          left: 14,
          zIndex: 20,
          width: 224,
          background: 'rgba(9, 13, 22, 0.80)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: 10,
          padding: '7px 10px',
          color: '#f8fafc',
          fontSize: 11,
          boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>🛡️ 战术小队 (team_hp_name)</span>
          <span style={{ fontSize: 10, color: voiceSnap?.micEnabled ? '#34d399' : '#94a3b8' }}>
            {voiceSnap?.micEnabled ? (voiceSnap.speaking ? '🎙️ 讲话中' : '🎙️ 麦克风就绪') : '🔇 麦已关'}
          </span>
        </div>

        {/* Self HP & Voice row */}
        <div style={{ marginBottom: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <span style={{ fontWeight: 'bold', color: '#fde68a' }}>
              ★ {character.name} {voiceSnap?.speaking ? '🔊' : ''}
            </span>
            <span style={{ color: '#34d399', fontFamily: 'monospace', fontSize: 10 }}>
              {health}/{maxHealth}
            </span>
          </div>
          <div style={{ width: '100%', height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.max(0, Math.min(100, (health / Math.max(1, maxHealth)) * 100))}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #10b981, #34d399)',
              }}
            />
          </div>
        </div>

        {/* Real room players & voice participants */}
        {Object.values(livePlayers)
          .filter((p: any) => p && p.username && p.username !== character.name && String(p.userId) !== String(myUserId))
          .slice(0, 5)
          .map((p: any, idx: number) => {
            const uidStr = String(p.userId ?? p.username ?? idx);
            const vPeer = (voiceSnap?.participants || []).find(
              (vp) => String(vp.userId) === uidStr || vp.username === p.username
            );
            const isMuted = vPeer ? voiceSnap?.mutedPeers.includes(vPeer.userId) : false;
            const rHp = remoteStats[uidStr]?.hp ?? MAX_HEALTH;
            return (
              <div
                key={uidStr}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  paddingTop: 4,
                  marginTop: 3,
                  borderTop: '1px solid rgba(51, 65, 85, 0.5)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: vPeer?.speaking ? '#34d399' : '#cbd5e1', fontWeight: vPeer?.speaking ? 'bold' : 'normal' }}>
                    {vPeer?.speaking ? '🔊 ' : vPeer?.micEnabled ? '🎙️ ' : '👤 '}
                    {p.username}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: '#93c5fd', fontFamily: 'monospace', fontSize: 10 }}>
                      {rHp}/{MAX_HEALTH}
                    </span>
                    {vPeer && (
                      <button
                        type="button"
                        onClick={() => voiceManagerRef.current?.toggleMutePeer(vPeer.userId)}
                        style={{
                          background: isMuted ? '#7f1d1d' : '#1e293b',
                          border: '1px solid #475569',
                          borderRadius: 4,
                          color: '#fff',
                          fontSize: 9,
                          padding: '0px 4px',
                          cursor: 'pointer',
                        }}
                      >
                        {isMuted ? '已屏蔽' : '静音'}
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ width: '100%', height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, (rHp / MAX_HEALTH) * 100))}%`,
                      height: '100%',
                      background: p.team === 'red' ? '#ef4444' : '#38bdf8',
                    }}
                  />
                </div>
              </div>
            );
          })}
      </aside>
    )}

    {/* Prominent Live Voice Transmission Indicator Banner when T or Y is active */}
    {ready && (voiceSnap?.pttPressed || voiceSnap?.speaking || voiceSnap?.micEnabled) && (
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          top: 96,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 42,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 16px',
          borderRadius: 999,
          background:
            voiceSnap?.pttPressed || voiceSnap?.speaking
              ? 'rgba(5, 150, 105, 0.92)'
              : 'rgba(15, 23, 42, 0.88)',
          border: `1.5px solid ${voiceSnap?.pttPressed || voiceSnap?.speaking ? '#34d399' : '#38bdf8'}`,
          color: '#ffffff',
          fontSize: 12,
          fontWeight: 'bold',
          boxShadow: '0 4px 18px rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none',
        }}
      >
        <span>
          {voiceSnap?.pttPressed
            ? '📡 正在按住 [T] 键实时语音发射中'
            : voiceSnap?.speaking
              ? '🎙️ 自由麦实时语音发射中 [按 Y 关闭]'
              : '🎙️ 自由麦已就绪 [正在监听说话 / 按 Y 关闭 / 按住 T 强行发射]'}
        </span>
        <span
          style={{
            display: 'inline-block',
            width: 56,
            height: 7,
            background: 'rgba(15, 23, 42, 0.75)',
            borderRadius: 4,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.35)',
          }}
        >
          <span
            style={{
              display: 'block',
              width: `${Math.min(100, Math.max(voiceSnap?.pttPressed ? 45 : 8, voiceSnap?.inputVolume ?? 0))}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #fde047, #34d399)',
            }}
          />
        </span>
      </div>
    )}

    {/* In-Game Real-Time Battle Chat & Tactical Voice Callouts + Player Microphone Voice Bar */}
    {ready && (
      <section className="battle-chat-box" aria-label="局内战术聊天与麦克风语音">
        {/* Real-Time Player Microphone Voice Bar (.battle-voice-hud) */}
        <div
          className="battle-voice-hud"
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 5,
            background: 'rgba(15, 23, 42, 0.90)',
            border: `1px solid ${voiceSnap?.speaking ? '#34d399' : 'rgba(56, 189, 248, 0.4)'}`,
            borderRadius: 8,
            padding: '5px 8px',
            marginBottom: 5,
            fontSize: 11,
          }}
        >
          <button
            type="button"
            onClick={() => void voiceManagerRef.current?.toggleMicrophone()}
            style={{
              padding: '3px 8px',
              borderRadius: 5,
              border: '1px solid',
              borderColor: voiceSnap?.micEnabled ? '#10b981' : '#64748b',
              background: voiceSnap?.micEnabled ? '#065f46' : '#1e293b',
              color: '#fff',
              fontSize: 11,
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
            title="开启或关闭玩家麦克风实时语音 (快捷键 [Y])"
          >
            {voiceSnap?.micEnabled ? '🎙️ 麦已开 [Y]' : '🔇 开麦 [Y]'}
          </button>

          <button
            type="button"
            onClick={() =>
              voiceManagerRef.current?.setMode(voiceSnap?.mode === 'free' ? 'ptt' : 'free')
            }
            onPointerDown={() => {
              if (voiceSnap?.mode !== 'free') {
                void voiceManagerRef.current?.setPushToTalkPressed(true);
              }
            }}
            onPointerUp={() => {
              if (voiceSnap?.mode !== 'free') {
                void voiceManagerRef.current?.setPushToTalkPressed(false);
              }
            }}
            style={{
              padding: '3px 8px',
              borderRadius: 5,
              border: '1px solid #38bdf8',
              background:
                voiceSnap?.mode === 'free'
                  ? '#0284c7'
                  : voiceSnap?.pttPressed
                    ? '#059669'
                    : '#0f172a',
              color: '#fff',
              fontSize: 11,
              cursor: 'pointer',
            }}
            title="切换 [自由麦感应] 或 [按住 T 键说话]"
          >
            {voiceSnap?.mode === 'free'
              ? '🔊 自由麦'
              : voiceSnap?.pttPressed
                ? '📡 发射中 [T]'
                : '🎙️ 按住[T]说话'}
          </button>

          <button
            type="button"
            onClick={() =>
              voiceManagerRef.current?.setChannelMode(
                voiceSnap?.channelMode === 'team' ? 'all' : 'team'
              )
            }
            style={{
              padding: '3px 7px',
              borderRadius: 5,
              border: '1px solid #475569',
              background: '#1e293b',
              color: voiceSnap?.channelMode === 'team' ? '#38bdf8' : '#fde68a',
              fontSize: 11,
              cursor: 'pointer',
            }}
            title="切换全房间语音或仅限同队语音"
          >
            {voiceSnap?.channelMode === 'team' ? '🛡️ 仅小队' : '🌐 全房间'}
          </button>

          <button
            type="button"
            onClick={() =>
              voiceManagerRef.current?.setServerLoopback(!voiceSnap?.serverLoopback)
            }
            style={{
              padding: '3px 7px',
              borderRadius: 5,
              border: '1px solid',
              borderColor: voiceSnap?.serverLoopback ? '#f59e0b' : '#475569',
              background: voiceSnap?.serverLoopback ? '#78350f' : '#1e293b',
              color: '#fef3c7',
              fontSize: 11,
              cursor: 'pointer',
            }}
            title="开启服务端语音耳返自测：单人测试时可实时听见自己麦克风发出的声音"
          >
            {voiceSnap?.serverLoopback ? '🎧 耳返开' : '🎧 耳返自测'}
          </button>

          <button
            type="button"
            onClick={() => voiceManagerRef.current?.toggleDeafened()}
            style={{
              padding: '3px 6px',
              borderRadius: 5,
              border: '1px solid #475569',
              background: voiceSnap?.deafened ? '#7f1d1d' : '#1e293b',
              color: '#fff',
              fontSize: 11,
              cursor: 'pointer',
            }}
            title="静音或开启语音扬声器"
          >
            {voiceSnap?.deafened ? '🔕 禁听' : '🔈 听筒'}
          </button>

          {/* Live Microphone Input Volume Bar */}
          <div
            style={{
              width: 54,
              height: 7,
              background: '#090d16',
              borderRadius: 4,
              overflow: 'hidden',
              border: '1px solid #334155',
            }}
            title={`麦克风实时音量: ${voiceSnap?.inputVolume ?? 0}%`}
          >
            <div
              style={{
                width: `${Math.min(100, voiceSnap?.inputVolume ?? 0)}%`,
                height: '100%',
                background: voiceSnap?.speaking
                  ? 'linear-gradient(90deg, #10b981, #38bdf8)'
                  : '#475569',
                transition: 'width 0.08s linear',
              }}
            />
          </div>
          {voiceSnap?.error && (
            <span style={{ color: '#f87171', fontSize: 10 }}>{voiceSnap.error}</span>
          )}
        </div>

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
                  Promise.resolve(document.body.requestPointerLock?.()).catch(() => {});
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
      isFlying={Boolean(hotbar.isFlying)}
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
    <button
      style={{
        position: 'fixed',
        top: 14,
        left: 448,
        zIndex: 25,
        padding: '6px 12px',
        borderRadius: 8,
        border: '1px solid #f43f5e',
        background: showVoteKickModal ? '#be123c' : 'rgba(15, 23, 42, 0.88)',
        color: '#ffe4e6',
        fontSize: 12,
        fontWeight: 'bold',
        cursor: 'pointer',
      }}
      onClick={() => setShowVoteKickModal((prev) => !prev)}
      title="投票踢人 / 外挂举报 / 客服问卷反馈 (voteKick.lua & resposeQuestion.lua)"
    >
      ⚖️ 投票/举报
    </button>
    <button className={`battle-sandbox-button${sandboxOpen ? ' active' : ''}`} aria-label="沙盒战术面板" title="沙盒与AI靶场控制 [F2]"
      onClick={() => {
        const next = !sandboxOpen;
        sandboxOpenRef.current = next;
        setSandboxOpen(next);
        if (!next && !paused) Promise.resolve(document.body.requestPointerLock?.()).catch(() => {});
      }}>
      🧩 沙盒 [F2]
    </button>

    {/* 1:1 VoteKick, Cheat Report & Survey Feedback Modal (voteKick.lua & resposeQuestion.lua) */}
    {showVoteKickModal && (
      <div
        className="battle-votekick-modal"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(9, 13, 22, 0.78)',
          zIndex: 55,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={() => setShowVoteKickModal(false)}
      >
        <div
          style={{
            width: 520,
            maxWidth: '94vw',
            background: 'linear-gradient(180deg, #0f172a 0%, #090d16 100%)',
            border: '1px solid #f43f5e',
            borderRadius: 14,
            padding: 20,
            color: '#f8fafc',
            boxShadow: '0 20px 55px rgba(0,0,0,0.8)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, color: '#fb7185' }}>
              ⚖️ 战场纪律仲裁与问题反馈 (voteKick.lua / resposeQuestion.lua)
            </h3>
            <button
              type="button"
              onClick={() => setShowVoteKickModal(false)}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ color: '#93c5fd', fontWeight: 'bold' }}>选择目标玩家 / AI 角色:</span>
              <select
                value={voteTarget}
                onChange={(e) => setVoteTarget(e.target.value)}
                style={{ padding: 8, borderRadius: 6, background: '#1e293b', color: '#fff', border: '1px solid #475569' }}
              >
                <option value="">-- 请选择投票或举报对象 --</option>
                {Object.values(livePlayers)
                  .filter((p: any) => p && p.username && p.username !== character.name)
                  .map((p: any, i) => (
                    <option key={`p-${p.userId ?? i}`} value={p.username}>
                      👤 {p.username}
                    </option>
                  ))}
                {bots.map((b) => (
                  <option key={b.id} value={b.name}>
                    🤖 {b.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ color: '#93c5fd', fontWeight: 'bold' }}>原因类别 (voteKick.lua):</span>
              <select
                value={voteReason}
                onChange={(e) => setVoteReason(e.target.value)}
                style={{ padding: 8, borderRadius: 6, background: '#1e293b', color: '#fff', border: '1px solid #475569' }}
              >
                <option value="挂机 / 消极比赛">⏳ 长期挂机 / 消极比赛</option>
                <option value="疑似使用加速或透视外挂">🚨 疑似使用加速或透视外挂</option>
                <option value="恶意卡地图 Bug">🐛 恶意利用地图 Bug</option>
                <option value="言语辱骂或恶意刷屏">🔇 言语不当或恶意刷屏</option>
              </select>
            </label>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={async () => {
                  const target = voteTarget || bots[0]?.name || '目标玩家';
                  wsRef.current?.sendJSON({
                    type: 'vote_kick',
                    roomId: room.id ?? 'default-room',
                    initiator: character.name,
                    target,
                    reason: voteReason,
                  });
                  try {
                    const res = await apiFetch('/battle/vote-kick', {
                      method: 'POST',
                      body: JSON.stringify({
                        roomId: room.id ?? 'default-room',
                        initiator: character.name,
                        target,
                        reason: voteReason,
                      }),
                    });
                    setVoteNotice(res?.message || `已发起对 [${target}] 的投票踢除！`);
                  } catch {
                    setVoteNotice(`已向全房广播对 [${target}] 的投票踢除请求！`);
                  }
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #f59e0b',
                  background: '#b45309',
                  color: '#fff',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                🗳️ 发起投票踢人
              </button>

              <button
                type="button"
                onClick={async () => {
                  const target = voteTarget || bots[0]?.name || '可疑目标';
                  try {
                    const res = await apiFetch('/battle/report', {
                      method: 'POST',
                      body: JSON.stringify({
                        roomId: room.id ?? 'default-room',
                        reporter: character.name,
                        target,
                        reason: voteReason,
                      }),
                    });
                    setVoteNotice(res?.message || `举报已提交至反作弊中心！`);
                  } catch (err: any) {
                    setVoteNotice(err?.message || '举报冷却中 (15秒内仅限一次)');
                  }
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #ef4444',
                  background: '#991b1b',
                  color: '#fff',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                🚨 提交外挂举报 (15s CD)
              </button>
            </div>

            <hr style={{ borderColor: '#334155', width: '100%' }} />

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ color: '#fde68a', fontWeight: 'bold' }}>
                📝 创想兵团有奖问卷与问题直通车 (resposeQuestion.lua):
              </span>
              <input
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="填写对武器手感、地图或功能的建议..."
                style={{ padding: 8, borderRadius: 6, background: '#1e293b', color: '#fff', border: '1px solid #475569' }}
              />
            </label>
            <button
              type="button"
              onClick={async () => {
                if (!feedbackText.trim()) return;
                try {
                  const res = await apiFetch('/battle/feedback', {
                    method: 'POST',
                    body: JSON.stringify({
                      username: character.name,
                      category: 'battle_survey',
                      content: feedbackText,
                    }),
                  });
                  setVoteNotice(res?.message || '感谢反馈！奖励已发放！');
                  setFeedbackText('');
                } catch {
                  setVoteNotice('感谢反馈！问卷已记录！');
                  setFeedbackText('');
                }
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #38bdf8',
                background: '#0284c7',
                color: '#fff',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              📩 提交问卷反馈
            </button>

            {voteNotice && (
              <div style={{ color: '#34d399', fontWeight: 'bold', textAlign: 'center', marginTop: 4 }}>
                {voteNotice}
              </div>
            )}
          </div>
        </div>
      </div>
    )}

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
                <td style={{ padding: 8, color: '#f87171', fontWeight: 'bold' }}>红队 (我)</td>
                <td style={{ padding: 8, fontWeight: 'bold' }}>{character.name}</td>
                <td style={{ padding: 8, color: '#34d399' }}>{playerKills}</td>
                <td style={{ padding: 8 }}>{playerDeaths}</td>
                <td style={{ padding: 8, color: '#fbbf24' }}>{objectivePoints}</td>
                <td style={{ padding: 8, fontWeight: 'bold' }}>{playerKills * 100 + objectivePoints + 200}</td>
              </tr>
              {Object.values(livePlayers)
                .filter((p: any) => p && p.username && p.username !== character.name && String(p.userId) !== String(myUserId))
                .map((p: any, idx: number) => {
                  const uidStr = String(p.userId ?? idx);
                  const st = remoteStats[uidStr];
                  const k = st?.kills ?? p.kills ?? 0;
                  const d = st?.deaths ?? p.deaths ?? 0;
                  const isRed = p.team === 'red';
                  return (
                    <tr
                      key={`player-${uidStr}`}
                      style={{
                        borderBottom: '1px solid #1e293b',
                        background: isRed ? 'rgba(239, 68, 68, 0.08)' : 'rgba(59, 130, 246, 0.12)',
                      }}
                    >
                      <td style={{ padding: 8, color: isRed ? '#f87171' : '#60a5fa', fontWeight: 'bold' }}>
                        {isRed ? '红队玩家' : '蓝队玩家'}
                      </td>
                      <td style={{ padding: 8, fontWeight: 'bold' }}>{p.username}</td>
                      <td style={{ padding: 8, color: '#34d399' }}>{k}</td>
                      <td style={{ padding: 8 }}>{d}</td>
                      <td style={{ padding: 8, color: '#fbbf24' }}>{k * 20}</td>
                      <td style={{ padding: 8, fontWeight: 'bold' }}>{k * 100 + 150}</td>
                    </tr>
                  );
                })}
              {bots.map((b, idx) => (
                <tr key={b.id} style={{ borderBottom: '1px solid #1e293b', background: 'rgba(59, 130, 246, 0.08)' }}>
                  <td style={{ padding: 8, color: '#60a5fa' }}>靶场 AI</td>
                  <td style={{ padding: 8 }}>{b.name}</td>
                  <td style={{ padding: 8 }}>{idx === 0 ? scoreBlue : 0}</td>
                  <td style={{ padding: 8 }}>{Math.max(0, Math.floor(playerKills / Math.max(1, bots.length)))}</td>
                  <td style={{ padding: 8 }}>0</td>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <img
                src={`${BASE}ui/${scoreRed >= scoreBlue ? 'skin_jiesuan_shengli.png' : 'skin_jiesuan_shibai.png'}`}
                alt={scoreRed >= scoreBlue ? '胜利' : '完赛'}
                style={{ height: 54, objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))' }}
              />
              <div>
                <div style={{ fontSize: 26, fontWeight: 900, color: scoreRed >= scoreBlue ? '#fbbf24' : '#93c5fd' }}>
                  {scoreRed >= scoreBlue ? '🏆 战役大捷 VICTORY!' : '🛡️ 虽败犹荣 MATCH COMPLETE'}
                </div>
                <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4 }}>
                  地图: {chosenMap?.name || room.mapName} | 模式: {room.modeName || '团队竞技'} | 比分: 红队 {scoreRed} - {scoreBlue} 蓝队
                </div>
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
                Promise.resolve(document.body.requestPointerLock?.()).catch(() => {});
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
          onClick={() => { sandboxOpenRef.current = false; setSandboxOpen(false); Promise.resolve(document.body.requestPointerLock?.()).catch(() => {}); }}>✕</button>
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
        onClose={() => { setPaused(false); Promise.resolve(document.body.requestPointerLock?.()).catch(() => {}); }}
        onExit={finishAndExit}
        onQuit={onQuit}
      />
      {import.meta.env.DEV && <div className="battle-debug">{debugLog.map((log, index) => <p key={index}>{log}</p>)}</div>}
    </>}
  </main>;
}

