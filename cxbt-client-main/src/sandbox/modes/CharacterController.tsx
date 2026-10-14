import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { 
  PlayerEntity, 
  CameraController, 
  MapCollider,
  MAP_PRESETS,
  loadMapIntoScene,
  unloadMapFromScene,
  type LoadedMapSession,
  WEAPON_SUITES, 
  ACTION_LABELS 
} from '../../features/gameplay/engine';
import { createBattleAudio } from '../../features/gameplay/audio';
import { createProjectileSystem, type WeaponKind } from '../../features/gameplay/projectiles';

// 武器战斗性能与手感配置
export interface WeaponCombatProfile {
  name: string;
  kind: WeaponKind;
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
    fireDelay: 0.48,
    magCapacity: 0,
    reloadTime: 0,
    fireAudio: 'fire-knives',
    isAutomatic: false,
    headshotMultiplier: 1.5
  },
  stick_sh01: {
    name: '战术战棍 (Stick)',
    kind: 'melee',
    damage: 680,
    pellets: 1,
    spread: 0,
    fireDelay: 0.52,
    magCapacity: 0,
    reloadTime: 0,
    fireAudio: 'fire-knives',
    isAutomatic: false,
    headshotMultiplier: 1.6
  },
  shield_01: {
    name: '战术盾牌 (Shield)',
    kind: 'melee',
    damage: 520,
    pellets: 1,
    spread: 0,
    fireDelay: 0.55,
    magCapacity: 0,
    reloadTime: 0,
    fireAudio: 'fire-shield',
    isAutomatic: false,
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
    reloadAudio: 'reload_rpg',
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
    reloadAudio: 'reload_smg',
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

// 假人实体定义
interface BotItem {
  id: string;
  entity: PlayerEntity;
  name: string;
  hp: number;
  maxHp: number;
  mode: 'dummy' | 'patrol' | 'chase';
  patrolTimer: number;
  patrolDir: any;
  attackCooldown: number;
  hpBar: { sprite: any; updateHp: (currentHp: number, maxHp: number) => void };
}

// 3D 浮动跳字
interface FloatingDamageText {
  sprite: any;
  position: any;
  velocity: any;
  lifetime: number;
  maxLifetime: number;
}

// 击中火花/碎屑
interface SparkParticle {
  mesh: any;
  lifetime: number;
  maxLifetime: number;
}

// 爆炸环/气浪
interface ExplosionEffect {
  mesh: any;
  scaleSpeed: number;
  lifetime: number;
  maxLifetime: number;
}

function createHpBar(name: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 42;
  const ctx = canvas.getContext('2d')!;

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.set(0, 2.15, 0);
  sprite.scale.set(1.1, 0.3, 1);

  const updateHp = (currentHp: number, maxHp: number) => {
    ctx.clearRect(0, 0, 160, 42);
    // 背景
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(0, 0, 160, 42);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 158, 40);

    // 假人名字
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(name, 10, 16);

    // HP 数值
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText(`${Math.max(0, currentHp)}/${maxHp}`, 90, 16);

    // 血条槽
    const pct = Math.max(0, Math.min(1, currentHp / maxHp));
    ctx.fillStyle = '#334155';
    ctx.fillRect(10, 24, 140, 10);
    ctx.fillStyle = pct > 0.5 ? '#22c55e' : (pct > 0.25 ? '#eab308' : '#ef4444');
    ctx.fillRect(10, 24, 140 * pct, 10);

    texture.needsUpdate = true;
  };

  updateHp(3200, 3200);
  return { sprite, updateHp };
}

export default function CharacterController() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('正在加载引擎类与地图...');

  // 地图状态
  const [selectedMapId, setSelectedMapId] = useState<string>('level1');
  const mapColliderRef = useRef<MapCollider>(new MapCollider());
  const currentMapSessionRef = useRef<LoadedMapSession | null>(null);
  const gridHelperRef = useRef<any | null>(null);
  const mapNameRef = useRef<HTMLElement>(null);

  // 动作套件与选项
  const [activeSuiteId, setActiveSuiteId] = useState<string>(WEAPON_SUITES[0].id);
  const activeSuiteIdRef = useRef<string>(WEAPON_SUITES[0].id);
  activeSuiteIdRef.current = activeSuiteId;

  const [actionOption, setActionOption] = useState<string>('auto');
  const [availableActions, setAvailableActions] = useState<string[]>(Object.keys(WEAPON_SUITES[0].actions));

  // 战斗弹药系统状态
  const [currentMagAmmo, setCurrentMagAmmo] = useState<number>(30);
  const currentMagAmmoRef = useRef<number>(30);
  currentMagAmmoRef.current = currentMagAmmo;

  const [reserveAmmo, setReserveAmmo] = useState<number>(120);
  const reserveAmmoRef = useRef<number>(120);
  reserveAmmoRef.current = reserveAmmo;

  const [isReloading, setIsReloading] = useState<boolean>(false);
  const isReloadingRef = useRef<boolean>(false);
  isReloadingRef.current = isReloading;

  const [reloadProgress, setReloadProgress] = useState<number>(0);
  const reloadTimerRef = useRef<number>(0);
  const maxReloadTimeRef = useRef<number>(1.8);

  // 射击冷却与按键状态
  const lastFireTimeRef = useRef<number>(0);
  const isMouseDownRef = useRef<boolean>(false);

  // 视图与相机模式
  const [cameraMode, setCameraMode] = useState<'orbit' | 'tps'>('orbit');
  const cameraModeRef = useRef<'orbit' | 'tps'>('orbit');
  cameraModeRef.current = cameraMode;

  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showMesh, setShowMesh] = useState(true);
  const [showHitbox, setShowHitbox] = useState(false);
  const [health, setHealth] = useState(3200);

  // 受击红晕 & 击中标记 & 准星扩散
  const [hurtFlash, setHurtFlash] = useState(false);
  const [hitmarkerVisible, setHitmarkerVisible] = useState(false);
  const [hitmarkerHeadshot, setHitmarkerHeadshot] = useState(false);
  const hitmarkerTimerRef = useRef<number | null>(null);
  const [recoilSpread, setRecoilSpread] = useState(0);

  // 右上角实时坐标与引擎 HUD Refs
  const posXRef = useRef<HTMLDivElement>(null);
  const posYRef = useRef<HTMLDivElement>(null);
  const posZRef = useRef<HTMLDivElement>(null);
  const yawRef = useRef<HTMLElement>(null);
  const motionRef = useRef<HTMLElement>(null);
  const fpsRef = useRef<HTMLElement>(null);

  // Bot 状态与容器
  const [botList, setBotList] = useState<{ id: string; name: string; hp: number; maxHp: number; mode: string }[]>([]);
  const [globalBotMode, setGlobalBotMode] = useState<'dummy' | 'patrol' | 'chase'>('chase');
  const botsRef = useRef<BotItem[]>([]);
  const sceneRef = useRef<any>(null);

  // 战斗系统核心组件 Refs
  const battleAudioRef = useRef<ReturnType<typeof createBattleAudio> | null>(null);
  const projectileSystemRef = useRef<ReturnType<typeof createProjectileSystem> | null>(null);
  const floatingTextsRef = useRef<FloatingDamageText[]>([]);
  const sparksRef = useRef<SparkParticle[]>([]);
  const explosionsRef = useRef<ExplosionEffect[]>([]);
  const muzzleLightRef = useRef<any | null>(null);
  const muzzleFlashMeshRef = useRef<any | null>(null);
  const muzzleTimerRef = useRef<number>(0);

  const skeletonHelperRef = useRef<any | null>(null);
  const orbitControlsRef = useRef<any | null>(null);
  const cameraRef = useRef<any | null>(null);
  const modelRef = useRef<any | null>(null);
  const playerRef = useRef<PlayerEntity | null>(null);
  const cameraControllerRef = useRef<CameraController | null>(null);
  const actionBadgeRef = useRef<HTMLSpanElement | null>(null);

  const syncBotListState = () => {
    setBotList(botsRef.current.map(b => ({
      id: b.id,
      name: b.name,
      hp: b.hp,
      maxHp: b.maxHp,
      mode: b.mode
    })));
  };

  // 触发击中标记
  const triggerHitmarker = useCallback((isHeadshot: boolean) => {
    setHitmarkerHeadshot(isHeadshot);
    setHitmarkerVisible(true);
    if (hitmarkerTimerRef.current) clearTimeout(hitmarkerTimerRef.current);
    hitmarkerTimerRef.current = window.setTimeout(() => {
      setHitmarkerVisible(false);
    }, 160);
  }, []);

  // 触发玩家受击反馈
  const triggerPlayerHurt = useCallback((dmg: number) => {
    setHurtFlash(true);
    setTimeout(() => setHurtFlash(false), 240);
    battleAudioRef.current?.play('hit_body', 0.85);
    const scene = sceneRef.current;
    const player = playerRef.current;
    if (scene && player) {
      spawnFloatingDamage(
        scene,
        player.modelGroup.position.clone().add(new THREE.Vector3(0, 1.85, 0)),
        dmg,
        false,
        true
      );
    }
  }, []);

  // 3D 浮动伤害跳字生成器
  const spawnFloatingDamage = (
    scene: any, 
    pos: any, 
    damage: number, 
    isHeadshot: boolean, 
    isPlayer: boolean = false
  ) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 256, 64);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = isHeadshot ? `💥 爆头 -${damage}!` : `-${damage}`;
    ctx.font = isHeadshot ? 'bold 32px sans-serif' : 'bold 28px sans-serif';

    // 描边
    ctx.lineWidth = 5;
    ctx.strokeStyle = isHeadshot ? '#7f1d1d' : (isPlayer ? '#450a0a' : '#0f172a');
    ctx.strokeText(text, 128, 32);

    // 填充
    ctx.fillStyle = isHeadshot ? '#fbbf24' : (isPlayer ? '#ef4444' : '#f8fafc');
    ctx.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.35, (Math.random() - 0.5) * 0.3));
    const scale = isHeadshot ? 1.7 : 1.3;
    sprite.scale.set(scale * 1.5, scale * 0.4, 1);
    scene.add(sprite);

    floatingTextsRef.current.push({
      sprite,
      position: sprite.position,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.6, 2.1 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6),
      lifetime: isHeadshot ? 1.15 : 0.85,
      maxLifetime: isHeadshot ? 1.15 : 0.85
    });
  };

  // 生成撞墙火花
  const spawnImpactSpark = (scene: any, point: any) => {
    const geo = new THREE.SphereGeometry(0.08, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(point);
    scene.add(mesh);
    sparksRef.current.push({ mesh, lifetime: 0.12, maxLifetime: 0.12 });
  };

  // 生成爆炸光浪
  const spawnExplosionEffect = (scene: any, point: any) => {
    const geom = new THREE.SphereGeometry(1.6, 12, 10);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.85,
      wireframe: true
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(point);
    scene.add(mesh);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.95 })
    );
    mesh.add(core);

    explosionsRef.current.push({
      mesh,
      scaleSpeed: 5.5,
      lifetime: 0.35,
      maxLifetime: 0.35
    });
  };

  // 换弹逻辑
  const reloadWeapon = useCallback(() => {
    const player = playerRef.current;
    if (!player || !player.isAlive || isReloadingRef.current) return;

    const currentSuite = WEAPON_SUITES.find(s => s.id === activeSuiteIdRef.current) || WEAPON_SUITES[0];
    const profile = WEAPON_COMBAT_PROFILES[currentSuite.id] || WEAPON_COMBAT_PROFILES['smg_01'];

    if (profile.kind === 'melee') return;
    if (currentMagAmmoRef.current >= profile.magCapacity || reserveAmmoRef.current <= 0) return;

    isReloadingRef.current = true;
    setIsReloading(true);
    reloadTimerRef.current = profile.reloadTime;
    maxReloadTimeRef.current = profile.reloadTime;

    player.reload();
    if (profile.reloadAudio) {
      battleAudioRef.current?.play(profile.reloadAudio, 0.7);
    }
    setStatus(`🔄 正在快速换弹 [${profile.name}]...`);
  }, []);

  // 核心开火与受击判定
  const fireWeapon = useCallback(() => {
    const player = playerRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const tpsCamera = cameraControllerRef.current;
    if (!player || !scene || !camera || !player.isAlive) return;

    const currentSuite = WEAPON_SUITES.find(s => s.id === activeSuiteIdRef.current) || WEAPON_SUITES[0];
    const profile = WEAPON_COMBAT_PROFILES[currentSuite.id] || WEAPON_COMBAT_PROFILES['smg_01'];

    if (isReloadingRef.current) return;

    // 检查射速 CD
    const now = performance.now();
    if (now - lastFireTimeRef.current < profile.fireDelay * 1000) return;

    // 检查弹药
    if (profile.kind !== 'melee') {
      if (currentMagAmmoRef.current <= 0) {
        reloadWeapon();
        return;
      }
      currentMagAmmoRef.current -= 1;
      setCurrentMagAmmo(currentMagAmmoRef.current);
    }

    lastFireTimeRef.current = now;

    // TPS 模式开火瞬间，人物模型朝向对齐摄像机视线
    if (cameraModeRef.current === 'tps' && tpsCamera) {
      player.modelGroup.rotation.y = tpsCamera.yaw;
    }

    // 播放攻击动作与枪声
    player.attack();
    battleAudioRef.current?.play(profile.fireAudio, 0.7);

    // 枪口亮光与火花
    const muzzlePos = player.getMuzzlePosition();
    if (muzzleLightRef.current) {
      muzzleLightRef.current.position.copy(muzzlePos);
      muzzleLightRef.current.intensity = 5.0;
    }
    if (muzzleFlashMeshRef.current) {
      muzzleFlashMeshRef.current.position.copy(muzzlePos);
      muzzleFlashMeshRef.current.material.opacity = 0.95;
    }
    muzzleTimerRef.current = 0.06;

    // 准星后坐力扩散
    setRecoilSpread(prev => Math.min(22, prev + 5));

    // 1. 近战攻击 (Melee Fan Arc)
    if (profile.kind === 'melee') {
      const playerPos = player.modelGroup.position;
      const yaw = player.modelGroup.rotation.y;
      const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      let hitAny = false;

      botsRef.current.forEach(bot => {
        if (bot.hp <= 0) return;
        const botPos = bot.entity.modelGroup.position;
        const toBot = botPos.clone().sub(playerPos);
        const dist = toBot.length();
        if (dist < 2.8) {
          toBot.normalize();
          const dot = forward.dot(toBot);
          if (dot > 0.35) {
            hitAny = true;
            const dmg = Math.floor(profile.damage * (0.9 + Math.random() * 0.25));
            bot.entity.takeDamage(dmg);
            spawnFloatingDamage(scene, botPos.clone().add(new THREE.Vector3(0, 1.8, 0)), dmg, false);
            triggerHitmarker(false);
            setStatus(`⚔️ 命中 [${bot.name}]！造成 ${dmg} 物理伤害`);
          }
        }
      });

      if (hitAny) {
        battleAudioRef.current?.play('hit_knife', 0.8);
      }
      return;
    }

    // 2. 计算视线与瞄准方向
    let aimDir = new THREE.Vector3();
    if (cameraModeRef.current === 'tps' && tpsCamera) {
      aimDir = tpsCamera.getForwardDirection().clone();
    } else {
      aimDir.set(Math.sin(player.modelGroup.rotation.y), 0, Math.cos(player.modelGroup.rotation.y));
    }

    // 3. 投射物武器 (RPG / Bow / Grenade)
    if (profile.kind === 'rocket') {
      projectileSystemRef.current?.spawn('rocket', muzzlePos, aimDir);
      return;
    }
    if (profile.kind === 'arrow') {
      projectileSystemRef.current?.spawn('arrow', muzzlePos, aimDir);
      return;
    }
    if (profile.kind === 'grenade') {
      projectileSystemRef.current?.spawn('grenade', muzzlePos, aimDir);
      return;
    }

    // 4. 实时射线检定枪弹 (SMG, Pistol, Shotgun, Sniper, Machinegun, Sprayer)
    const targets: any[] = [];
    botsRef.current.forEach(b => {
      if (b.hp > 0 && b.entity?.hitbox) targets.push(b.entity.hitbox);
    });
    if (mapColliderRef.current?.collisionMeshes) {
      targets.push(...mapColliderRef.current.collisionMeshes);
    }

    const pelletsCount = profile.pellets;
    const raycaster = new THREE.Raycaster();

    for (let p = 0; p < pelletsCount; p++) {
      let pelletDir = aimDir.clone();
      if (profile.spread > 0) {
        const spreadX = (Math.random() - 0.5) * profile.spread;
        const spreadY = (Math.random() - 0.5) * profile.spread;
        pelletDir.x += spreadX;
        pelletDir.y += spreadY;
        pelletDir.normalize();
      }

      if (cameraModeRef.current === 'tps') {
        raycaster.set(camera.position, pelletDir);
      } else {
        raycaster.set(muzzlePos, pelletDir);
      }
      raycaster.far = 120;

      const hits = raycaster.intersectObjects(targets, true);
      if (hits.length > 0) {
        const hit = hits[0];
        if (hit.object.userData?.isPlayer && hit.object.userData.entity) {
          const targetBot = botsRef.current.find(b => b.entity === hit.object.userData.entity);
          if (targetBot && targetBot.hp > 0) {
            const hitY = hit.point.y;
            const botY = targetBot.entity.modelGroup.position.y;
            const isHeadshot = (hitY - botY) >= 1.35;
            const dmg = Math.floor(profile.damage * (isHeadshot ? profile.headshotMultiplier : 1.0) * (0.92 + Math.random() * 0.16));
            targetBot.entity.takeDamage(dmg);
            battleAudioRef.current?.play('hit_body', 0.85);
            triggerHitmarker(isHeadshot);
            spawnFloatingDamage(scene, hit.point, dmg, isHeadshot);
            setStatus(`🎯 命中 [${targetBot.name}]！${isHeadshot ? '💥 爆头暴击!' : ''} 造成 ${dmg} 点伤害`);
          }
        } else {
          // 墙体与掩体阻挡
          battleAudioRef.current?.play('hit_wall', 0.6);
          spawnImpactSpark(scene, hit.point);
        }
      }
    }

    // 弹夹打空自动触发换弹
    if (currentMagAmmoRef.current === 0 && reserveAmmoRef.current > 0) {
      reloadWeapon();
    }
  }, [reloadWeapon, triggerHitmarker]);

  // 地图加载与随时切换核心逻辑
  const switchMap = async (newMapId: string) => {
    const scene = sceneRef.current;
    const player = playerRef.current;
    if (!scene || !player) return;

    setSelectedMapId(newMapId);
    const targetPreset = MAP_PRESETS.find(m => m.id === newMapId);
    setStatus(`正在切换地图为 [${targetPreset?.name || newMapId}]...`);

    // 1. 彻底卸载上一张地图的 GPU 网格
    if (currentMapSessionRef.current) {
      unloadMapFromScene(currentMapSessionRef.current, scene, mapColliderRef.current);
      currentMapSessionRef.current = null;
    }

    try {
      // 2. 异步下载并挂载新地图三维模型与物理碰撞体
      const session = await loadMapIntoScene(newMapId, scene, mapColliderRef.current, msg => setStatus(msg));
      currentMapSessionRef.current = session;

      // 3. 仅平地沙盒显示网格
      if (gridHelperRef.current) {
        gridHelperRef.current.visible = newMapId === 'flat';
      }

      // 4. 重置玩家碰撞环境并瞬移至新地图出生点
      player.setCollisionEnvironment(mapColliderRef.current.toCollisionEnvironment());
      player.modelGroup.position.copy(session.spawnPoint);
      player.isGrounded = true;

      // 同步轨道相机聚焦点至出生点
      if (orbitControlsRef.current && cameraRef.current) {
        orbitControlsRef.current.target.set(session.spawnPoint.x, session.spawnPoint.y + 0.95, session.spawnPoint.z);
        cameraRef.current.position.set(session.spawnPoint.x, session.spawnPoint.y + 1.8, session.spawnPoint.z + 3.2);
        orbitControlsRef.current.update();
      }

      // 5. 将已有 Bots 也瞬移至新地图玩家周围有效地面
      for (const bot of botsRef.current) {
        bot.entity.setCollisionEnvironment(mapColliderRef.current.toCollisionEnvironment());
        const angle = Math.random() * Math.PI * 2;
        const dist = 3.5 + Math.random() * 2.5;
        const bx = session.spawnPoint.x + Math.sin(angle) * dist;
        const bz = session.spawnPoint.z + Math.cos(angle) * dist;
        const by = mapColliderRef.current.floorAt(bx, bz, 90) ?? session.spawnPoint.y;
        bot.entity.modelGroup.position.set(bx, by, bz);
      }

      // 6. 更新 HUD 标签
      if (mapNameRef.current) {
        mapNameRef.current.textContent = session.preset.name;
      }

      setStatus(`地图 [${session.preset.name}] 加载就绪！出生点: (${session.spawnPoint.x.toFixed(1)}, ${session.spawnPoint.y.toFixed(1)}, ${session.spawnPoint.z.toFixed(1)})`);
    } catch (err: any) {
      console.error('[CharacterController] 地图切换失败:', err);
      setStatus(`地图切换失败: ${err.message || err}`);
    }
  };

  // 瞬间复位回出生点
  const handleRespawn = () => {
    const player = playerRef.current;
    if (!player) return;
    const sp = currentMapSessionRef.current?.spawnPoint || new THREE.Vector3(0, 0, 0);
    player.modelGroup.position.copy(sp);
    player.revive();
    setHealth(3200);
    if (orbitControlsRef.current && cameraRef.current) {
      orbitControlsRef.current.target.set(sp.x, sp.y + 0.95, sp.z);
      cameraRef.current.position.set(sp.x, sp.y + 1.8, sp.z + 3.2);
      orbitControlsRef.current.update();
    }
    setStatus(`已复位至地图出生点: (${sp.x.toFixed(1)}, ${sp.y.toFixed(1)}, ${sp.z.toFixed(1)})`);
  };

  // 部署假人
  const spawnBot = async (customMode?: 'dummy' | 'patrol' | 'chase') => {
    const scene = sceneRef.current;
    if (!scene || !playerRef.current) return;

    const id = 'bot_' + Math.random().toString(36).substring(2, 7);
    const num = botsRef.current.length + 1;
    const botName = `假人 #${num}`;
    setStatus(`正在部署 ${botName}...`);

    try {
      const bot = new PlayerEntity(scene);
      await bot.loadFullAvatar({ jobId: 'guardian', gender: 0 });

      // 给 Bot 装配近战军刀套件
      const suite = WEAPON_SUITES.find(s => s.id === 'knives_01') || WEAPON_SUITES[0];
      await Promise.all([
        bot.loadAnimations(suite.actions),
        suite.parts ? bot.equipWeaponParts(suite.parts) : Promise.resolve([])
      ]);

      const hpBar = createHpBar(botName);
      bot.modelGroup.add(hpBar.sprite);

      // 在玩家前方 3~5 米生成，并探测当前地图地面高程
      const pPos = playerRef.current.modelGroup.position;
      const angle = (num * 1.2) + Math.random() * 0.8;
      const dist = 3.2 + Math.random() * 1.5;
      const spawnX = pPos.x + Math.sin(angle) * dist;
      const spawnZ = pPos.z + Math.cos(angle) * dist;
      const floorY = mapColliderRef.current.floorAt(spawnX, spawnZ, 90) ?? pPos.y;

      bot.setTransform(spawnX, floorY, spawnZ, Math.random() * Math.PI * 2);
      bot.setCollisionEnvironment(mapColliderRef.current.toCollisionEnvironment());
      bot.setHitboxVisible(showHitbox);

      const botEntry: BotItem = {
        id,
        entity: bot,
        name: botName,
        hp: 3200,
        maxHp: 3200,
        mode: customMode || globalBotMode,
        patrolTimer: 2.0,
        patrolDir: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
        attackCooldown: 1.0,
        hpBar
      };

      bot.events = {
        onDamage: (_amount, currentHp) => {
          botEntry.hp = currentHp;
          hpBar.updateHp(currentHp, botEntry.maxHp);
          syncBotListState();
        },
        onDeath: () => {
          botEntry.hp = 0;
          hpBar.updateHp(0, botEntry.maxHp);
          syncBotListState();
          setStatus(`💀 [${botName}] 已阵亡倒地！`);
        }
      };

      botsRef.current.push(botEntry);
      syncBotListState();
      setStatus(`🤖 已成功生成 ${botName}！当前模式: ${botEntry.mode === 'chase' ? '追击玩家' : botEntry.mode === 'patrol' ? '随机巡逻' : '静止木桩'}`);
    } catch (err) {
      console.error('Bot spawn error:', err);
      setStatus(`生成假人失败: ${err}`);
    }
  };

  const clearAllBots = () => {
    botsRef.current.forEach(b => {
      b.entity.dispose();
      if (b.hpBar.sprite.parent) b.hpBar.sprite.parent.remove(b.hpBar.sprite);
    });
    botsRef.current = [];
    syncBotListState();
    setStatus('已清除所有假人实体');
  };

  const reviveAllBots = () => {
    botsRef.current.forEach(b => {
      b.entity.revive(3200);
      b.hp = 3200;
      b.hpBar.updateHp(3200, 3200);
    });
    syncBotListState();
    setStatus('已复活全部假人！');
  };

  const setBotMode = (id: string, mode: 'dummy' | 'patrol' | 'chase') => {
    const target = botsRef.current.find(b => b.id === id);
    if (target) {
      target.mode = mode;
      syncBotListState();
      setStatus(`已将 [${target.name}] 切换为: ${mode === 'chase' ? '主动追击' : mode === 'patrol' ? '自由巡逻' : '静止靶子'}`);
    }
  };

  useEffect(() => {
    if (!mountRef.current) return;

    // 1. 初始化纯场景
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f172a');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 3, 6);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    orbitControlsRef.current = controls;

    // 初始化第三人称 TPS 摄像机控制器
    const tpsCamera = new CameraController(camera, {
      distance: 3.2,
      heightOffset: 1.25,
      shoulderOffset: 0.35
    });
    cameraControllerRef.current = tpsCamera;

    // 初始化真实战斗音效模块
    const battleAudio = createBattleAudio();
    battleAudioRef.current = battleAudio;

    // 初始化投射物与范围爆炸系统 (RPG, Bow)
    const projectileSystem = createProjectileSystem(
      scene,
      () => {
        const targets: any[] = [];
        botsRef.current.forEach(b => {
          if (b.hp > 0 && b.entity?.hitbox) targets.push(b.entity.hitbox);
        });
        if (mapColliderRef.current?.collisionMeshes) {
          targets.push(...mapColliderRef.current.collisionMeshes);
        }
        return targets;
      },
      (point, radius) => {
        // RPG 爆炸范围震荡与范围伤害
        battleAudio.play('explosion_rpg', 0.85);
        spawnExplosionEffect(scene, point);

        botsRef.current.forEach(bot => {
          if (bot.hp <= 0) return;
          const dist = bot.entity.modelGroup.position.distanceTo(point);
          if (dist <= radius) {
            const falloff = 1 - (dist / radius);
            const dmg = Math.floor(1500 * Math.max(0.25, falloff));
            bot.entity.takeDamage(dmg);
            spawnFloatingDamage(scene, bot.entity.modelGroup.position.clone().add(new THREE.Vector3(0, 1.8, 0)), dmg, false);
          }
        });

        if (playerRef.current && playerRef.current.isAlive) {
          const pDist = playerRef.current.modelGroup.position.distanceTo(point);
          if (pDist <= radius) {
            const falloff = 1 - (pDist / radius);
            const pDmg = Math.floor(900 * Math.max(0.2, falloff));
            playerRef.current.takeDamage(pDmg);
            triggerPlayerHurt(pDmg);
          }
        }
      },
      (hit, kind) => {
        // 箭矢等飞行碰撞直接命中回调
        if (hit?.object?.userData?.isPlayer && hit.object.userData.entity) {
          const bot = botsRef.current.find(b => b.entity === hit.object.userData.entity);
          if (bot && bot.hp > 0) {
            const hitY = hit.point.y;
            const botY = bot.entity.modelGroup.position.y;
            const isHeadshot = (hitY - botY) >= 1.35;
            const dmg = Math.floor((kind === 'arrow' ? 780 : 350) * (isHeadshot ? 2.4 : 1.0));
            bot.entity.takeDamage(dmg);
            battleAudio.play('hit_body', 0.85);
            triggerHitmarker(isHeadshot);
            spawnFloatingDamage(scene, hit.point, dmg, isHeadshot);
          }
        } else {
          battleAudio.play('hit_wall', 0.6);
          spawnImpactSpark(scene, hit.point);
        }
      }
    );
    projectileSystemRef.current = projectileSystem;

    // 枪口火焰与动态光源
    const muzzleLight = new THREE.PointLight(0xffb03a, 0, 9);
    scene.add(muzzleLight);
    muzzleLightRef.current = muzzleLight;

    const flashMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
    );
    scene.add(flashMesh);
    muzzleFlashMeshRef.current = flashMesh;

    // 添加摄影棚灯光系统
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.3);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(8, 16, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const grid = new THREE.GridHelper(50, 50, 0x38bdf8, 0x1e293b);
    grid.visible = false;
    scene.add(grid);
    gridHelperRef.current = grid;

    // 2. 引入游戏底层引擎实体类
    const player = new PlayerEntity(scene);
    playerRef.current = player;
    tpsCamera.setTarget(player.modelGroup);

    // 挂接引擎事件监听
    player.events = {
      onFootstep: () => {},
      onJump: () => setStatus('实体触发起跳事件 (onJump)'),
      onLand: () => setStatus('实体平稳着地 (onLand)'),
      onRoll: () => setStatus('实体执行战术翻滚 (onRoll)'),
      onAttack: () => {},
      onReload: () => {},
      onDamage: (amount, currentHp) => {
        setHealth(currentHp);
        setStatus(`受到 ${amount} 点伤害，剩余血量: ${currentHp}`);
      },
      onDeath: () => {
        setHealth(0);
        setStatus('💀 玩家阵亡倒地！按 P 或复活键可重置');
      },
      onRevive: () => {
        setHealth(player.maxHealth);
        setStatus('❤️ 玩家已满血复活！');
      }
    };

    player.loadFullAvatar({ jobId: 'assassin', gender: 0 })
      .then(async (built) => {
        if (skeletonHelperRef.current) {
          scene.remove(skeletonHelperRef.current);
          skeletonHelperRef.current = null;
        }
        const rootBone = built.skeleton?.bones?.[0] || built.root;
        const skeleton = new THREE.SkeletonHelper(rootBone);
        skeletonHelperRef.current = skeleton;
        skeleton.visible = showSkeleton;
        scene.add(skeleton);
        modelRef.current = built.root;

        const initialSuite = WEAPON_SUITES[0];
        await Promise.all([
          player.loadAnimations(initialSuite.actions),
          initialSuite.parts ? player.equipWeaponParts(initialSuite.parts) : Promise.resolve([])
        ]);
        setAvailableActions(Object.keys(initialSuite.actions));

        // 默认初始化加载关卡地图 (钟楼小镇 Level 1)
        await switchMap('level1');

        // 生成初始测试假人
        spawnBot('dummy');
      })
      .catch(err => setStatus(`引擎加载失败: ${err}`));

    // 3. 键盘与鼠标事件
    const keys = { w: false, a: false, s: false, d: false, space: false };
    const direction = new THREE.Vector3();

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;

      if (e.code === 'KeyW') keys.w = true;
      if (e.code === 'KeyA') keys.a = true;
      if (e.code === 'KeyS') keys.s = true;
      if (e.code === 'KeyD') keys.d = true;
      if (e.code === 'Space') {
        e.preventDefault();
        keys.space = true;
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        player.roll();
      }
      if (e.code === 'KeyJ') {
        fireWeapon();
      }
      if (e.code === 'KeyR') {
        reloadWeapon();
      }
      if (e.code === 'KeyP') {
        handleRespawn();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyW') keys.w = false;
      if (e.code === 'KeyA') keys.a = false;
      if (e.code === 'KeyS') keys.s = false;
      if (e.code === 'KeyD') keys.d = false;
      if (e.code === 'Space') keys.space = false;
    };

    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (cameraModeRef.current === 'tps') {
        if (e.button === 0) {
          isMouseDownRef.current = true;
          isDragging = true;
          lastX = e.clientX;
          lastY = e.clientY;
          if (!document.pointerLockElement) {
            renderer.domElement.requestPointerLock?.();
          }
          fireWeapon();
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 0) {
        isMouseDownRef.current = false;
      }
      isDragging = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (cameraModeRef.current === 'tps') {
        const locked = document.pointerLockElement === renderer.domElement;
        if (locked) {
          tpsCamera.handlePointerMove(e.movementX, e.movementY);
        } else if (isDragging) {
          const dx = e.clientX - lastX;
          const dy = e.clientY - lastY;
          lastX = e.clientX;
          lastY = e.clientY;
          tpsCamera.handlePointerMove(dx, dy);
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (cameraModeRef.current === 'tps') {
        tpsCamera.handleWheel(e.deltaY);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('wheel', onWheel);

    // 4. 引擎主帧循环
    const clock = new THREE.Clock();
    let animationId: number;
    let frameCount = 0;
    let lastFpsTime = performance.now();

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1);

      // 把本帧的物理输入意图打包发送给引擎处理
      direction.set(0, 0, 0);
      if (keys.w) direction.z += 1;
      if (keys.s) direction.z -= 1;
      if (keys.a) direction.x += 1;
      if (keys.d) direction.x -= 1;
      if (direction.lengthSq() > 0) direction.normalize();

      const cameraYaw = cameraModeRef.current === 'tps'
        ? tpsCamera.yaw
        : Math.atan2(
            player.modelGroup.position.x - camera.position.x, 
            player.modelGroup.position.z - camera.position.z
          );

      player.setInput(direction, cameraYaw, keys.space);
      player.update(delta);

      // 掉出地图下界自动救援复位
      if (player.modelGroup.position.y < -35) {
        const sp = currentMapSessionRef.current?.spawnPoint || new THREE.Vector3(0, 0, 0);
        player.modelGroup.position.copy(sp);
        player.revive();
        setStatus('⚠️ 掉出地图边界，已自动重生回出生点！');
      }

      // 实时更新当前动作状态徽标
      if (actionBadgeRef.current) {
        const cur = player.getCurrentAction();
        actionBadgeRef.current.textContent = cur ? (ACTION_LABELS[cur] || cur) : 'idle';
      }

      // 5. 换弹计时器更新
      if (isReloadingRef.current) {
        reloadTimerRef.current -= delta;
        const prog = Math.max(0, Math.min(1, 1 - (reloadTimerRef.current / maxReloadTimeRef.current)));
        setReloadProgress(prog);

        if (reloadTimerRef.current <= 0) {
          const suite = WEAPON_SUITES.find(s => s.id === activeSuiteIdRef.current) || WEAPON_SUITES[0];
          const prof = WEAPON_COMBAT_PROFILES[suite.id] || WEAPON_COMBAT_PROFILES['smg_01'];
          const needed = prof.magCapacity - currentMagAmmoRef.current;
          const toAdd = Math.min(needed, reserveAmmoRef.current);
          currentMagAmmoRef.current += toAdd;
          reserveAmmoRef.current -= toAdd;
          setCurrentMagAmmo(currentMagAmmoRef.current);
          setReserveAmmo(reserveAmmoRef.current);
          isReloadingRef.current = false;
          setIsReloading(false);
          setReloadProgress(0);
          setStatus(`✅ 换弹完毕！当前弹药: ${currentMagAmmoRef.current} / ${reserveAmmoRef.current}`);
        }
      }

      // 6. 持续按住鼠标连发 (Auto-fire)
      if (isMouseDownRef.current && cameraModeRef.current === 'tps') {
        const suite = WEAPON_SUITES.find(s => s.id === activeSuiteIdRef.current) || WEAPON_SUITES[0];
        const prof = WEAPON_COMBAT_PROFILES[suite.id] || WEAPON_COMBAT_PROFILES['smg_01'];
        if (prof.isAutomatic && !isReloadingRef.current) {
          fireWeapon();
        }
      }

      // 7. 准星后坐力平滑回缩
      setRecoilSpread(prev => Math.max(0, prev - delta * 30));

      // 8. 枪口火焰淡化
      if (muzzleTimerRef.current > 0) {
        muzzleTimerRef.current -= delta;
        if (muzzleTimerRef.current <= 0) {
          if (muzzleLightRef.current) muzzleLightRef.current.intensity = 0;
          if (muzzleFlashMeshRef.current) muzzleFlashMeshRef.current.material.opacity = 0;
        }
      }

      // 9. 更新投射物系统 (飞行火箭与箭矢)
      projectileSystem.update(delta);

      // 10. 更新浮动伤害文字跳字
      for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
        const ft = floatingTextsRef.current[i];
        ft.lifetime -= delta;
        ft.position.addScaledVector(ft.velocity, delta);
        ft.velocity.y = Math.max(0.4, ft.velocity.y - delta * 1.8);
        ft.sprite.material.opacity = Math.max(0, ft.lifetime / ft.maxLifetime);

        if (ft.lifetime <= 0) {
          scene.remove(ft.sprite);
          ft.sprite.material.map?.dispose();
          ft.sprite.material.dispose();
          floatingTextsRef.current.splice(i, 1);
        }
      }

      // 11. 更新火花粒子
      for (let i = sparksRef.current.length - 1; i >= 0; i--) {
        const sp = sparksRef.current[i];
        sp.lifetime -= delta;
        sp.mesh.material.opacity = Math.max(0, sp.lifetime / sp.maxLifetime);
        if (sp.lifetime <= 0) {
          scene.remove(sp.mesh);
          sp.mesh.geometry.dispose();
          sp.mesh.material.dispose();
          sparksRef.current.splice(i, 1);
        }
      }

      // 12. 更新爆炸气浪特效
      for (let i = explosionsRef.current.length - 1; i >= 0; i--) {
        const exp = explosionsRef.current[i];
        exp.lifetime -= delta;
        const scaleInc = 1 + exp.scaleSpeed * delta;
        exp.mesh.scale.multiplyScalar(scaleInc);
        exp.mesh.material.opacity = Math.max(0, exp.lifetime / exp.maxLifetime);
        if (exp.lifetime <= 0) {
          scene.remove(exp.mesh);
          exp.mesh.geometry.dispose();
          exp.mesh.material.dispose();
          explosionsRef.current.splice(i, 1);
        }
      }

      // 13. 驱动所有 Bot 假人实体 AI 与反击判定
      const pPos = player.modelGroup.position;
      botsRef.current.forEach(bot => {
        if (!bot.entity.isAlive) {
          bot.entity.update(delta);
          return;
        }

        const bPos = bot.entity.modelGroup.position;
        const toPlayer = pPos.clone().sub(bPos);
        const distToPlayer = toPlayer.length();

        if (bot.mode === 'dummy') {
          bot.entity.setInput(new THREE.Vector3(0, 0, 0), bot.entity.modelGroup.rotation.y, false);
        } else if (bot.mode === 'patrol') {
          bot.patrolTimer -= delta;
          if (bot.patrolTimer <= 0) {
            bot.patrolTimer = 2.0 + Math.random() * 2.5;
            bot.patrolDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
          }
          const yaw = Math.atan2(bot.patrolDir.x, bot.patrolDir.z);
          bot.entity.setInput(new THREE.Vector3(0, 0, 1), yaw, false);
        } else if (bot.mode === 'chase') {
          if (distToPlayer > 1.8) {
            toPlayer.y = 0;
            toPlayer.normalize();
            const yaw = Math.atan2(toPlayer.x, toPlayer.z);
            bot.entity.setInput(new THREE.Vector3(0, 0, 1), yaw, false);
          } else {
            // 贴身反击：面向玩家并挥刀攻击
            toPlayer.y = 0;
            toPlayer.normalize();
            const yaw = Math.atan2(toPlayer.x, toPlayer.z);
            bot.entity.setInput(new THREE.Vector3(0, 0, 0), yaw, false);
            bot.entity.modelGroup.rotation.y = yaw;
            bot.attackCooldown -= delta;

            if (bot.attackCooldown <= 0) {
              bot.attackCooldown = 1.3 + Math.random() * 0.4;
              bot.entity.attack();
              battleAudio.play('fire-knives', 0.65);
              const dmg = Math.floor(180 + Math.random() * 90);
              player.takeDamage(dmg);
              triggerPlayerHurt(dmg);
              setStatus(`⚠️ [${bot.name}] 挥刀反击命中玩家！造成 ${dmg} 伤害`);
            }
          }
        }

        bot.entity.update(delta);
      });

      // 14. 相机驱动
      if (cameraModeRef.current === 'tps') {
        tpsCamera.update(delta, mapColliderRef.current.collisionMeshes);
      } else {
        controls.update();
      }

      // 15. 更新 HUD 坐标卡片
      if (posXRef.current) posXRef.current.textContent = player.modelGroup.position.x.toFixed(2);
      if (posYRef.current) posYRef.current.textContent = player.modelGroup.position.y.toFixed(2);
      if (posZRef.current) posZRef.current.textContent = player.modelGroup.position.z.toFixed(2);
      if (yawRef.current) {
        const deg = ((player.modelGroup.rotation.y * 180) / Math.PI) % 360;
        yawRef.current.textContent = `${deg >= 0 ? deg.toFixed(0) : (360 + deg).toFixed(0)}°`;
      }
      if (motionRef.current) {
        motionRef.current.textContent = player.isJumping ? '跳跃腾空' 
          : player.isRolling ? '战术翻滚' 
          : player.isMoving ? '奔跑移动' : '地面静止';
      }

      frameCount++;
      const now = performance.now();
      if (now - lastFpsTime >= 1000) {
        if (fpsRef.current) {
          fpsRef.current.textContent = `${frameCount} FPS`;
        }
        frameCount = 0;
        lastFpsTime = now;
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('wheel', onWheel);

      if (currentMapSessionRef.current) {
        unloadMapFromScene(currentMapSessionRef.current, scene, mapColliderRef.current);
        currentMapSessionRef.current = null;
      }
      mapColliderRef.current.dispose();

      if (skeletonHelperRef.current) {
        scene.remove(skeletonHelperRef.current);
        skeletonHelperRef.current = null;
      }

      projectileSystem.dispose();
      battleAudio.dispose();

      clearAllBots();
      player.dispose();
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, [fireWeapon, reloadWeapon, triggerPlayerHurt]);

  // 武器套件切换
  const handleSuiteChange = async (suiteId: string) => {
    setActiveSuiteId(suiteId);
    activeSuiteIdRef.current = suiteId;
    setActionOption('auto');
    const player = playerRef.current;
    if (!player) return;

    const suite = WEAPON_SUITES.find(s => s.id === suiteId);
    if (!suite) return;

    const prof = WEAPON_COMBAT_PROFILES[suite.id] || WEAPON_COMBAT_PROFILES['smg_01'];
    setCurrentMagAmmo(prof.magCapacity);
    currentMagAmmoRef.current = prof.magCapacity;
    setReserveAmmo(prof.magCapacity * 4);
    reserveAmmoRef.current = prof.magCapacity * 4;
    setIsReloading(false);
    isReloadingRef.current = false;

    setStatus(`正在挂载武器模型与动画: ${suite.name}...`);
    player.clearWeapons();

    await Promise.all([
      player.loadAnimations(suite.actions),
      suite.parts ? player.equipWeaponParts(suite.parts) : Promise.resolve([])
    ]);

    setAvailableActions(Object.keys(suite.actions));
    setStatus(`已成功装备: ${suite.name} (弹药: ${prof.magCapacity})`);
  };

  const handleActionOptionChange = (option: string) => {
    setActionOption(option);
    const player = playerRef.current;
    if (!player) return;
    if (option === 'auto') {
      player.setForcedAction(null);
      setStatus('已切换为按键状态机自由过渡模式');
    } else {
      player.setForcedAction(option);
      setStatus(`已强制持续循环播放动作: ${ACTION_LABELS[option] || option}`);
    }
  };

  const triggerJump = () => playerRef.current?.jump();
  const triggerRoll = () => playerRef.current?.roll();
  const triggerDamage = () => {
    playerRef.current?.takeDamage(600);
    triggerPlayerHurt(600);
  };
  const triggerRevive = () => {
    playerRef.current?.revive(3200);
    setHealth(3200);
  };

  useEffect(() => {
    if (skeletonHelperRef.current) skeletonHelperRef.current.visible = showSkeleton;
  }, [showSkeleton]);

  useEffect(() => {
    if (modelRef.current) modelRef.current.visible = showMesh;
  }, [showMesh]);

  useEffect(() => {
    playerRef.current?.setHitboxVisible(showHitbox);
    botsRef.current.forEach(b => b.entity?.setHitboxVisible(showHitbox));
  }, [showHitbox]);

  const activeProfile = WEAPON_COMBAT_PROFILES[activeSuiteId] || WEAPON_COMBAT_PROFILES['smg_01'];

  const btnStyle = {
    padding: '6px 10px',
    background: '#1e293b',
    color: '#cbd5e1',
    border: '1px solid #475569',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.15s'
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', userSelect: 'none' }}>
      <style>{`
        @keyframes hitmarker-pop {
          0% { transform: translate(-50%, -50%) scale(1.5); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.0); opacity: 0.95; }
        }
        @keyframes reload-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>

      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* 玩家受击全屏红晕反馈 */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        boxShadow: hurtFlash ? 'inset 0 0 100px rgba(239, 68, 68, 0.7)' : 'none',
        transition: hurtFlash ? 'none' : 'box-shadow 0.35s ease-out',
        zIndex: 15
      }} />

      {/* 准星与击中标记 (Crosshair & Hitmarker) */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 20
      }}>
        {/* 中心准星圆点 */}
        <div style={{
          width: '4px',
          height: '4px',
          backgroundColor: '#38bdf8',
          borderRadius: '50%',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 4px #38bdf8'
        }} />

        {/* 四向准星刻度线 (带后坐力动态开合扩散) */}
        <div style={{
          position: 'absolute',
          top: `-${10 + recoilSpread}px`,
          left: '-1px',
          width: '2px',
          height: '8px',
          backgroundColor: 'rgba(255, 255, 255, 0.88)'
        }} />
        <div style={{
          position: 'absolute',
          bottom: `-${10 + recoilSpread}px`,
          left: '-1px',
          width: '2px',
          height: '8px',
          backgroundColor: 'rgba(255, 255, 255, 0.88)'
        }} />
        <div style={{
          position: 'absolute',
          left: `-${10 + recoilSpread}px`,
          top: '-1px',
          width: '8px',
          height: '2px',
          backgroundColor: 'rgba(255, 255, 255, 0.88)'
        }} />
        <div style={{
          position: 'absolute',
          right: `-${10 + recoilSpread}px`,
          top: '-1px',
          width: '8px',
          height: '2px',
          backgroundColor: 'rgba(255, 255, 255, 0.88)'
        }} />

        {/* 击中标记 (Hitmarker ✕) */}
        {hitmarkerVisible && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '28px',
            height: '28px',
            transform: 'translate(-50%, -50%)',
            animation: 'hitmarker-pop 0.15s ease-out'
          }}>
            <div style={{
              position: 'absolute', top: '2px', left: '2px', width: '8px', height: '2px',
              backgroundColor: hitmarkerHeadshot ? '#ef4444' : '#f8fafc',
              transform: 'rotate(45deg)', transformOrigin: '0 0'
            }} />
            <div style={{
              position: 'absolute', top: '2px', right: '2px', width: '8px', height: '2px',
              backgroundColor: hitmarkerHeadshot ? '#ef4444' : '#f8fafc',
              transform: 'rotate(-45deg)', transformOrigin: '100% 0'
            }} />
            <div style={{
              position: 'absolute', bottom: '2px', left: '2px', width: '8px', height: '2px',
              backgroundColor: hitmarkerHeadshot ? '#ef4444' : '#f8fafc',
              transform: 'rotate(-45deg)', transformOrigin: '0 100%'
            }} />
            <div style={{
              position: 'absolute', bottom: '2px', right: '2px', width: '8px', height: '2px',
              backgroundColor: hitmarkerHeadshot ? '#ef4444' : '#f8fafc',
              transform: 'rotate(45deg)', transformOrigin: '100% 100%'
            }} />
          </div>
        )}
      </div>

      {/* 右下角 武器与弹药战斗 HUD */}
      <div style={{
        position: 'absolute',
        bottom: 24,
        right: 24,
        background: 'rgba(15, 23, 42, 0.94)',
        padding: '14px 20px',
        borderRadius: '14px',
        border: '1px solid #334155',
        color: '#f8fafc',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
        minWidth: '220px',
        zIndex: 10,
        fontFamily: 'sans-serif'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span id="hud-weapon-name" style={{ fontSize: '13px', fontWeight: 'bold', color: '#38bdf8' }}>
            🔫 {activeProfile.name}
          </span>
          {isReloading ? (
            <span id="hud-reloading-status" style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 'bold', animation: 'reload-pulse 0.8s infinite' }}>
              换弹中 ({Math.floor(reloadProgress * 100)}%)
            </span>
          ) : (
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
              {activeProfile.isAutomatic ? '全自动' : '单发'}
            </span>
          )}
        </div>

        {/* 弹药数 */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '4px 0' }}>
          <span 
            id="hud-current-ammo"
            style={{ 
            fontSize: '32px', 
            fontWeight: '900', 
            fontFamily: 'monospace',
            color: activeProfile.kind === 'melee' ? '#38bdf8' : (currentMagAmmo > 0 ? '#f8fafc' : '#ef4444') 
          }}>
            {activeProfile.kind === 'melee' ? '∞' : currentMagAmmo}
          </span>
          {activeProfile.kind !== 'melee' && (
            <span id="hud-reserve-ammo" style={{ fontSize: '15px', color: '#94a3b8', fontFamily: 'monospace' }}>
              / {reserveAmmo}
            </span>
          )}
        </div>

        {/* 换弹进度条 */}
        {isReloading && (
          <div style={{ width: '100%', height: '4px', background: '#334155', borderRadius: '2px', overflow: 'hidden', marginBottom: '6px' }}>
            <div style={{ width: `${reloadProgress * 100}%`, height: '100%', background: '#f59e0b', transition: 'width 0.05s linear' }} />
          </div>
        )}

        {/* 战斗快捷指引 */}
        <div style={{ fontSize: '10px', color: '#64748b', display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <span><b>左键 / J</b> 开火</span>
          <span><b>R</b> 换弹</span>
          <span><b>Shift</b> 翻滚</span>
        </div>
      </div>

      {/* 左侧主要控制调试面板 */}
      <div style={{
        position: 'absolute', top: 20, left: 20, 
        background: 'rgba(15, 23, 42, 0.94)', color: '#f8fafc',
        padding: '20px', borderRadius: '12px', 
        fontFamily: 'sans-serif', width: '330px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
        border: '1px solid #334155',
        backdropFilter: 'blur(8px)',
        maxHeight: '90vh',
        overflowY: 'auto',
        zIndex: 10
      }}>
        <h3 style={{ margin: '0 0 15px 0', borderBottom: '1px solid #334155', paddingBottom: '10px', color: '#37f4d3', fontSize: '16px' }}>
          🎮 跑跳控制器 & 战场射击沙盒
        </h3>

        {/* 1. 相机视图模式切换 */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#cbd5e1' }}>
            🎥 摄像机控制模式：
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => {
                setCameraMode('orbit');
                cameraModeRef.current = 'orbit';
                document.exitPointerLock?.();
              }}
              style={{
                flex: 1, padding: '7px 0',
                background: cameraMode === 'orbit' ? '#0284c7' : '#1e293b',
                color: cameraMode === 'orbit' ? '#ffffff' : '#94a3b8',
                border: `1px solid ${cameraMode === 'orbit' ? '#38bdf8' : '#475569'}`,
                borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
              }}>
              🔄 轨道观察 (Orbit)
            </button>
            <button 
              onClick={() => {
                setCameraMode('tps');
                cameraModeRef.current = 'tps';
              }}
              style={{
                flex: 1, padding: '7px 0',
                background: cameraMode === 'tps' ? '#0284c7' : '#1e293b',
                color: cameraMode === 'tps' ? '#ffffff' : '#94a3b8',
                border: `1px solid ${cameraMode === 'tps' ? '#38bdf8' : '#475569'}`,
                borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
              }}>
              🎯 越肩视角 (TPS 跟随)
            </button>
          </div>
        </div>

        {/* 2. 战场地图选择与切换 */}
        <div style={{ 
          marginBottom: '14px', 
          background: 'rgba(30, 41, 59, 0.7)', 
          padding: '12px', 
          borderRadius: '10px', 
          border: '1px solid #0284c7' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#38bdf8' }}>
              🗺️ 战场地图加载与切换：
            </label>
            <button
              onClick={handleRespawn}
              style={{
                padding: '3px 8px', background: '#0284c7', color: 'white',
                border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer'
              }}
              title="将角色复位回复活点 (按 P 键亦可)">
              🎯 复位出生点 (P)
            </button>
          </div>
          <select 
            style={{ width: '100%', padding: '8px 10px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
            value={selectedMapId} 
            onChange={e => switchMap(e.target.value)}>
            {Array.from(new Set(MAP_PRESETS.map(m => m.category))).map(cat => (
              <optgroup key={cat} label={`── ${cat} ──`}>
                {MAP_PRESETS.filter(m => m.category === cat).map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* 3. 武器套件切换 */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#cbd5e1' }}>
            🔫 挂载武器 3D 模型与动作套件：
          </label>
          <select 
            id="weapon-suite-select"
            style={{ width: '100%', padding: '8px 10px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '6px', fontSize: '13px' }}
            value={activeSuiteId} 
            onChange={e => handleSuiteChange(e.target.value)}>
            {WEAPON_SUITES.map(suite => (
              <option key={suite.id} value={suite.id}>
                {suite.name} {suite.parts ? `(${suite.parts.length}部件)` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* 4. 动作选项模式 */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#cbd5e1' }}>
            🎬 动作选项 / 运行模式：
          </label>
          <select 
            style={{ width: '100%', padding: '8px 10px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '6px', fontSize: '13px' }}
            value={actionOption} 
            onChange={e => handleActionOptionChange(e.target.value)}>
            <option value="auto">🎮 自由移动模式 (根据按键状态机过渡)</option>
            <optgroup label="── 强制循环指定动作 ──">
              {availableActions.map(act => (
                <option key={act} value={act}>🔄 循环播放: {ACTION_LABELS[act] || act}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* 5. 动作与战斗测试按钮组 */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>⚡ 动作与战斗快捷测试：</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '6px' }}>
            <button onClick={triggerJump} style={btnStyle} title="按空格键 Space 亦可触发">
              🦘 跳跃
            </button>
            <button onClick={triggerRoll} style={btnStyle} title="按 Shift 键亦可触发">
              ⚡ 翻滚
            </button>
            <button 
              id="btn-fire"
              onClick={fireWeapon}
              style={{
                ...btnStyle,
                color: '#38bdf8',
                fontWeight: 'bold'
              }}
              title="按 J 键或鼠标左键亦可触发">
              ⚔️ 开火/攻击
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            <button id="btn-reload" onClick={reloadWeapon} style={btnStyle} title="按 R 键亦可触发">
              🔄 换弹
            </button>
            <button id="btn-damage" onClick={triggerDamage} style={{ ...btnStyle, color: '#f87171' }} title="承受 600 点伤害">
              💥 扣血
            </button>
            <button id="btn-revive" onClick={triggerRevive} style={{ ...btnStyle, color: '#4ade80' }} title="复活并回满血">
              ❤️ 复活
            </button>
          </div>
        </div>

        {/* 6. 实时动作与按键指引 */}
        <div style={{ 
          background: '#0f172a', padding: '10px', borderRadius: '8px', 
          border: '1px solid #334155', marginBottom: '12px' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '13px' }}>
            <span style={{ color: '#94a3b8' }}>当前动作：</span>
            <span 
              ref={actionBadgeRef} 
              style={{ 
                color: '#37f4d3', fontWeight: 'bold', background: 'rgba(55, 244, 211, 0.1)',
                padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(55, 244, 211, 0.3)'
              }}>
              idle
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.6' }}>
            <b>W A S D</b> : 移动 &nbsp;|&nbsp; <b>Space</b> : 跳跃<br/>
            <b>Shift</b> : 战术翻滚 &nbsp;|&nbsp; <b>鼠标左键 / J</b> : 开火/攻击<br/>
            <b>R</b> : 快速换弹 &nbsp;|&nbsp; <b>P</b> : 瞬移出生点<br/>
            <b>滚轮</b> : 调节视距
          </div>
        </div>
        
        {/* 7. 视图辅助选项 */}
        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', borderTop: '1px solid #334155', paddingTop: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={showSkeleton} onChange={e => setShowSkeleton(e.target.checked)} style={{ marginRight: '4px' }}/>
            骨骼连线
          </label>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={showMesh} onChange={e => setShowMesh(e.target.checked)} style={{ marginRight: '4px' }}/>
            模型网格
          </label>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={showHitbox} onChange={e => setShowHitbox(e.target.checked)} style={{ marginRight: '4px' }}/>
            受击胶囊体
          </label>
        </div>

        {/* 8. 状态提示 */}
        <p style={{ margin: '10px 0 0 0', fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          ℹ️ {status}
        </p>
      </div>

      {/* 右上角 实时坐标 HUD 与 Bot 假人战术管理面板 */}
      <div style={{
        position: 'absolute', top: 20, right: 20,
        display: 'flex', flexDirection: 'column', gap: '12px',
        width: '320px', zIndex: 10, fontFamily: 'sans-serif',
        pointerEvents: 'auto'
      }}>
        {/* 1. 实时坐标与状态卡片 */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.94)', color: '#f8fafc',
          padding: '14px 18px', borderRadius: '12px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
          border: '1px solid #334155', backdropFilter: 'blur(8px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #334155', paddingBottom: '6px' }}>
            <span style={{ fontWeight: 'bold', color: '#38bdf8', fontSize: '13px' }}>
              🗺️ <span ref={mapNameRef}>钟楼小镇 (Level 1)</span>
            </span>
            <span ref={fpsRef} style={{ fontSize: '11px', color: '#4ade80', background: '#0f172a', padding: '2px 8px', borderRadius: '12px', border: '1px solid #1e293b', fontWeight: 'bold' }}>60 FPS</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '10px', textAlign: 'center' }}>
            <div style={{ background: '#0f172a', padding: '6px 4px', borderRadius: '6px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>X 坐标</div>
              <div ref={posXRef} style={{ fontSize: '13px', fontWeight: 'bold', color: '#f8fafc' }}>0.00</div>
            </div>
            <div style={{ background: '#0f172a', padding: '6px 4px', borderRadius: '6px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>Y (高度)</div>
              <div ref={posYRef} style={{ fontSize: '13px', fontWeight: 'bold', color: '#38bdf8' }}>0.00</div>
            </div>
            <div style={{ background: '#0f172a', padding: '6px 4px', borderRadius: '6px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>Z 坐标</div>
              <div ref={posZRef} style={{ fontSize: '13px', fontWeight: 'bold', color: '#f8fafc' }}>0.00</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
            <span>方位角: <strong ref={yawRef} style={{ color: '#cbd5e1' }}>0.0°</strong></span>
            <span>状态: <strong ref={motionRef} style={{ color: '#37f4d3' }}>地面静止</strong></span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#94a3b8', borderTop: '1px solid #1e293b', paddingTop: '6px' }}>
            <span>玩家生命值：</span>
            <span style={{ fontWeight: 'bold', color: health > 1000 ? '#4ade80' : '#ef4444' }}>
              {health} / 3200
            </span>
          </div>
        </div>

        {/* 2. 训练假人 (Bot) 战术面板 */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.94)', color: '#f8fafc',
          padding: '16px 18px', borderRadius: '12px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
          border: '1px solid #334155', backdropFilter: 'blur(8px)',
          maxHeight: '52vh', overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #334155', paddingBottom: '6px' }}>
            <span style={{ fontWeight: 'bold', color: '#37f4d3', fontSize: '13px' }}>🤖 训练假人系统 (Bot)</span>
            <span style={{ fontSize: '11px', color: '#38bdf8', background: '#0f172a', padding: '2px 8px', borderRadius: '12px', border: '1px solid #1e293b' }}>
              假人数: {botList.length}
            </span>
          </div>

          {/* 操作按钮 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            <button 
              onClick={() => spawnBot()}
              style={{
                padding: '7px 10px', background: '#0284c7', color: '#ffffff',
                border: 'none', borderRadius: '6px', fontSize: '12px',
                cursor: 'pointer', fontWeight: 'bold'
              }}>
              ➕ 召唤假人
            </button>
            <button 
              onClick={reviveAllBots}
              style={{
                padding: '7px 10px', background: '#1e293b', color: '#4ade80',
                border: '1px solid #475569', borderRadius: '6px', fontSize: '12px',
                cursor: 'pointer'
              }}>
              ❤️ 全部复活
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', fontSize: '12px', color: '#94a3b8' }}>
            <span>全局战术模式：</span>
            <select 
              value={globalBotMode}
              onChange={e => setGlobalBotMode(e.target.value as any)}
              style={{ background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '3px 6px', fontSize: '11px' }}>
              <option value="dummy">静止木桩</option>
              <option value="patrol">随机巡逻</option>
              <option value="chase">主动追击玩家</option>
            </select>
          </div>

          {/* 假人列表 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {botList.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '12px 0' }}>
                暂无假人，点击上方按钮部署
              </div>
            ) : (
              botList.map(b => (
                <div key={b.id} style={{
                  background: '#0f172a', padding: '8px 10px', borderRadius: '6px',
                  border: '1px solid #1e293b', fontSize: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 'bold', color: b.hp > 0 ? '#f8fafc' : '#ef4444' }}>
                      {b.name} {b.hp <= 0 ? '(阵亡)' : ''}
                    </span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      HP: {b.hp}/{b.maxHp}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button 
                        onClick={() => setBotMode(b.id, 'dummy')}
                        style={{
                          padding: '2px 5px', fontSize: '10px', borderRadius: '3px',
                          background: b.mode === 'dummy' ? '#0284c7' : '#1e293b',
                          color: b.mode === 'dummy' ? 'white' : '#94a3b8',
                          border: '1px solid #334155', cursor: 'pointer'
                        }}>
                        木桩
                      </button>
                      <button 
                        onClick={() => setBotMode(b.id, 'patrol')}
                        style={{
                          padding: '2px 5px', fontSize: '10px', borderRadius: '3px',
                          background: b.mode === 'patrol' ? '#0284c7' : '#1e293b',
                          color: b.mode === 'patrol' ? 'white' : '#94a3b8',
                          border: '1px solid #334155', cursor: 'pointer'
                        }}>
                        巡逻
                      </button>
                      <button 
                        onClick={() => setBotMode(b.id, 'chase')}
                        style={{
                          padding: '2px 5px', fontSize: '10px', borderRadius: '3px',
                          background: b.mode === 'chase' ? '#0284c7' : '#1e293b',
                          color: b.mode === 'chase' ? 'white' : '#94a3b8',
                          border: '1px solid #334155', cursor: 'pointer'
                        }}>
                        追击
                      </button>
                    </div>

                    <button 
                      onClick={() => {
                        const target = botsRef.current.find(item => item.id === b.id);
                        if (target && target.hp > 0) {
                          target.entity.takeDamage(600);
                          const scene = sceneRef.current;
                          if (scene) {
                            spawnFloatingDamage(scene, target.entity.modelGroup.position.clone().add(new THREE.Vector3(0, 1.8, 0)), 600, false);
                          }
                        }
                      }}
                      style={{
                        padding: '2px 6px', fontSize: '10px', borderRadius: '3px',
                        background: '#7f1d1d', color: '#fca5a5',
                        border: '1px solid #991b1b', cursor: 'pointer'
                      }}>
                      击打
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {botList.length > 0 && (
            <button 
              onClick={clearAllBots}
              style={{
                width: '100%', marginTop: '10px', padding: '5px 0',
                background: '#1e293b', color: '#ef4444', border: '1px solid #334155',
                borderRadius: '6px', fontSize: '11px', cursor: 'pointer'
              }}>
              🗑️ 清除所有假人
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
