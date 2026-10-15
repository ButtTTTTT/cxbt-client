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
  scene: string;
  collision: string | null;
  minimap: string | null;
  airWalls: string[];
  bounds: number[] | null;
  camera: number[] | null;
  fog: number[] | null;
  ambience?: string | null;
};
type BattleControl = { 
  switchWeapon: (index: number) => void; 
  fire: () => void; 
  reload: () => void;
  castSkill: (slot: number) => boolean;
  spawnBot: (mode?: BotBehaviorMode) => void;
  setAllBotsMode: (mode: BotBehaviorMode) => void;
  reviveAllBots: () => void;
  clearAllBots: () => void;
  hitBot: (id: string, dmg: number) => void;
};
type HotbarState = { cooldowns: number[]; shield: number; stealthed: boolean; speed: number; maxHealthScale: number };
type SandboxRules = { infiniteAmmo: boolean; noCooldown: boolean; godMode: boolean; autoRespawnBots: boolean };

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

function BattleScene({ map, customMap, character, creation, assets, avatarPreset, weapons, slots, loads, health, motion,
  active, onReady, onPosition, onShot, onHit, onReload, onWeaponChange, onDamage, onHeal, onHotbar,
  onPause, paused, sandboxOpen, sandboxRules, onBotsChange, onBotKill, onHitMarker, onRecoil,
  otherPlayers, roomPlayers, logDebug }: {
  map: MapDefinition;
  customMap?: CustomMapBlueprint;
  character: SavedCharacter;
  creation: CreationAssets;
  assets: LobbyAssets;
  avatarPreset?: CreationPreset;
  weapons: CreationWeapon[];
  slots: BattleSlot[];
  loads: LoadedSkill[];
  health: RefObject<number>;
  motion: RefObject<boolean>;
  active: RefObject<BattleControl | null>;
  paused: RefObject<boolean>;
  sandboxOpen: RefObject<boolean>;
  sandboxRules: RefObject<SandboxRules>;
  onBotsChange: (bots: BotSnapshot[]) => void;
  onBotKill: () => void;
  onHitMarker: (crit: boolean) => void;
  onRecoil: (spread: number) => void;
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
  const hitMarkerRef = useRef(onHitMarker);
  const recoilRef = useRef(onRecoil);

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
  hitMarkerRef.current = onHitMarker;
  recoilRef.current = onRecoil;

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
      const reduced = amount * (1 - passives.damageReduction / 100);
      if (passives.storeEnergy > 0) {
        transfer.stored += reduced * passives.storeEnergy / 100;
        if (transfer.stored >= 100 && enemyList().some((enemy) => enemy.position.distanceTo(localPlayer?.modelGroup.position || new THREE.Vector3()) <= 3)) {
          transfer.stored = 0;
          for (const enemy of enemyList()) {
            if (localPlayer && enemy.position.distanceTo(localPlayer.modelGroup.position) <= passives.releaseRadius) {
              damageTargetById(enemy.userId, passives.releaseDamage, false);
            }
          }
        }
      }
      const left = skillEffects.absorb(reduced);
      if (left > 0) damageRef.current(left);
    };

    const botManager = new BotManager(scene, {
      onStateChange: (list) => botsChangeRef.current(list),
      onPlayerAttacked: (dmg) => takeDamage(dmg),
      onBotKilled: () => botKillRef.current(),
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
      return list;
    };

    const damageTargetById = (userId: string, damage: number, crit = false, hitPoint?: any) => {
      const finalDamage = Math.max(1, Math.round(damage));
      const bot = botManager.findById(userId);
      if (bot) {
        botManager.damageBotById(userId, finalDamage);
        const pos = hitPoint ? hitPoint.clone() : bot.entity.modelGroup.position.clone().add(new THREE.Vector3(0, 1.65, 0));
        combatEffects.spawnFloatingDamage(pos, finalDamage, crit);
        hitMarkerRef.current(crit);
        audio.play(crit ? 'critical_hit' : 'hit', crit ? 0.7 : 0.45);
        return;
      }
      hitRef.current(userId, finalDamage);
      const remoteEntity = otherPlayerEntities.get(userId);
      if (remoteEntity) {
        remoteEntity.takeDamage(finalDamage);
        const pos = hitPoint ? hitPoint.clone() : remoteEntity.modelGroup.position.clone().add(new THREE.Vector3(0, 1.65, 0));
        combatEffects.spawnFloatingDamage(pos, finalDamage, crit);
      }
      hitMarkerRef.current(crit);
      audio.play(crit ? 'critical_hit' : 'hit', crit ? 0.7 : 0.45);
    };

    const resolveTargetEntity = (hitObj: any): { entity: PlayerEntity; userId: string } | null => {
      let curr: any = hitObj;
      while (curr) {
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
        return meshes;
      },
      (point, radius) => {
        audio.play('grenade-explode', 0.65);
        combatEffects.spawnExplosionEffect(point);
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
      (hit, kind) => {
        const target = resolveTargetEntity(hit.object);
        if (target && target.entity.isAlive) {
          const weaponId = weapons[selected]?.id ?? 'smg_01';
          const profile = getWeaponCombatProfile(weaponId);
          if (kind === 'arrow') {
            const relY = hit.point.y - target.entity.modelGroup.position.y;
            const isHeadshot = relY >= 1.35;
            let dmg = Math.round(profile.damage * (isHeadshot ? profile.headshotMultiplier : 1));
            if (weaponId.startsWith('crossbow') && passives.lifesteal > 0) {
              healRef.current(dmg * passives.lifesteal / 100);
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
      spawnProjectile: (kind, origin, aim) => projectiles.spawn(kind, origin, aim),
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
      log: (message) => logRef.current(message),
    });

    const fire = () => {
      const weaponId = weapons[selected]?.id ?? 'smg_01';
      const family = weaponId.split('_')[0] ?? '';
      const kind = weaponKind(weaponId);
      const profile = getWeaponCombatProfile(weaponId);
      const fireIntervalMs = profile.fireDelay * 1000;
      const baseDelay = sandboxRules.current.noCooldown ? Math.min(85, fireIntervalMs) : fireIntervalMs;
      const delay = baseDelay * (family === 'machinegun' ? Math.max(0.35, 1 - passives.fireRate / 100) : 1);
      const now = performance.now();
      if (!ready || !localPlayer || paused.current || sandboxOpen.current || now - lastShot < delay || now < reloadUntil) return;
      if (kind !== 'melee' && !shotRef.current()) {
        active.current?.reload();
        return;
      }

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

      if (kind === 'melee') {
        const aim = cameraController ? cameraController.getForwardDirection() : camera.getWorldDirection(new THREE.Vector3());
        combatEffects.spawnMeleeSlash(localPlayer.modelGroup.position, aim, comboStep);
        const point = localPlayer.modelGroup.position.clone().add(new THREE.Vector3(0, 1, 0));
        for (const enemy of enemyList()) {
          const offset = enemy.position.clone().sub(point);
          const distance = offset.length();
          if (distance > 3.2 || (distance > 0.01 && offset.normalize().dot(aim) < 0.15)) continue;
          let damage = profile.damage * 0.25;
          if (passives.poisonChance > 0 && Math.random() * 100 < passives.poisonChance) damage += passives.dotDamage * 6;
          damageTargetById(enemy.userId, Math.round(damage), false, enemy.position.clone().add(new THREE.Vector3(0, 1.0, 0)));
        }
        return;
      }

      const aim = cameraController ? cameraController.getForwardDirection() : camera.getWorldDirection(new THREE.Vector3());
      const muzzle = localPlayer.getMuzzlePosition();

      if (kind === 'grenade' || kind === 'rocket' || kind === 'arrow') {
        const crosshairHit = mapCollider.raycastBullet(camera.position, aim, 120);
        const targetPoint = crosshairHit
          ? crosshairHit.point
          : camera.position.clone().addScaledVector(aim, 85);
        const launchDir = targetPoint.clone().sub(muzzle).normalize();
        projectiles.spawn(kind, muzzle, launchDir);
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

      const tracerColor = family === 'sprayer'
        ? 0x34d399
        : family === 'sniperrifle'
          ? 0x38bdf8
          : family === 'machinegun'
            ? 0xfb923c
            : 0xfde047;

      for (let p = 0; p < profile.pellets; p++) {
        const rayDir = aim.clone();
        if (profile.spread > 0) {
          rayDir.x += (Math.random() - 0.5) * profile.spread;
          rayDir.y += (Math.random() - 0.5) * profile.spread;
          rayDir.z += (Math.random() - 0.5) * profile.spread;
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
        combatEffects.spawnBulletTracer(muzzle, targetPoint, tracerColor);

        if (hit) {
          const target = resolveTargetEntity(hit.object);
          if (target && target.entity.isAlive) {
            const relY = hit.point.y - target.entity.modelGroup.position.y;
            const isHeadshot = relY >= 1.35;
            let damage = profile.damage * 0.22 * (isHeadshot ? profile.headshotMultiplier : 1);
            if (family === 'sniperrifle' && Math.random() * 100 < passives.critChance) damage *= 1 + passives.critDamage / 100;
            if (passives.weakChance > 0 && Math.random() * 100 < passives.weakChance) damage *= 1.2;
            if (family === 'sprayer' && Math.random() * 100 < passives.plagueChance) damage += passives.plagueDamage * 6;
            if (family === 'crossbow' && passives.lifesteal > 0) healRef.current(damage * passives.lifesteal / 100);
            damageTargetById(target.userId, Math.round(damage), isHeadshot, hit.point);
          } else {
            combatEffects.spawnImpactSpark(hit.point);
          }
        }
      }
    };

    active.current = {
      switchWeapon(index) {
        if (selected === index) return;
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
        const entry = slots[slot];
        if (!entry || entry.kind !== 'skill' || paused.current || entry.load.level <= 0) return false;
        if (sandboxRules.current.noCooldown) skillEffects.resetCooldowns();
        if (skillEffects.cast(slot, entry.load) === null) return false;
        if (sandboxRules.current.noCooldown) skillEffects.resetCooldowns();
        if (entry.load.skill.id !== 'latent') skillEffects.breakStealth();
        return true;
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
    };

    const lockPointer = () => {
      if (cancelled || paused.current || sandboxOpen.current || document.pointerLockElement) return;
      const request = document.body.requestPointerLock() as unknown as Promise<void> | undefined;
      if (request && typeof request.catch === 'function') void request.catch(() => undefined);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
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

      if (!event.repeat) {
        const index = BATTLE_QUICK_KEYS.indexOf(event.key);
        const entry = index >= 0 ? slots[index] : undefined;
        if (entry?.kind === 'weapon') active.current?.switchWeapon(entry.weaponIndex);
        else if (entry?.kind === 'skill') active.current?.castSkill(index);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const onBlur = () => { keys.clear(); holding = false; };

    const onMove = (event: PointerEvent) => {
      const locked = document.pointerLockElement === renderer.domElement || document.pointerLockElement === document.body;
      if (!locked && !dragging) return;
      const dx = locked ? event.movementX : event.clientX - pointerX;
      const dy = locked ? event.movementY : event.clientY - pointerY;
      pointerX = event.clientX;
      pointerY = event.clientY;
      cameraController?.onMouseMove(dx, dy);
    };

    const onDown = (event: PointerEvent) => {
      if (paused.current || sandboxOpen.current) return;
      if (event.target instanceof Element && event.target.closest('button, input, .settings-menu, .battle-inventory, .battle-sandbox-drawer')) return;
      audio.start();
      if (event.button === 2) {
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
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (paused.current || sandboxOpen.current || !weapons.length) return;
      active.current?.switchWeapon((selected + (event.deltaY > 0 ? 1 : weapons.length - 1)) % weapons.length);
    };

    const onContext = (event: MouseEvent) => event.preventDefault();
    const onLockChange = () => {
      dragging = false;
      if (document.pointerLockElement) { lockAttempts = 0; return; }
      keys.clear();
      holding = false;
      cameraController?.setAiming(false);
      if (ready && !paused.current && !sandboxOpen.current) pauseRef.current();
    };

    const onLockError = () => {
      if (cancelled || paused.current || sandboxOpen.current || lockAttempts >= 3) return;
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

      // 3. 相机控制器实例化并绑定
      cameraController = new CameraController(camera, {
        distance: 2.9,
        pitch: 0.1,
        yaw: 0,
        heightOffset: 1.25,
        shoulderOffset: 0.35
      });
      cameraController.setTarget(localPlayer.modelGroup);

      if (customMap) {
        localPlayer.modelGroup.position.set(customMap.spawnPoint[0], customMap.spawnPoint[1], customMap.spawnPoint[2]);
      } else {
        const spawnX = map.camera?.[0] ?? 0;
        const spawnZ = map.camera?.[2] ?? 0;
        const ground = mapCollider.floorAt(spawnX, spawnZ, 80) ?? 0;
        localPlayer.modelGroup.position.set(spawnX, ground, spawnZ);
      }

      // 单人或练习房间进场时自动召唤 2 名 AI 对手 (自定义地图已有预设人物/怪物时不额外重复生成)
      const humanCount = roomPlayers ? Object.keys(roomPlayers).length : 0;
      if (humanCount <= 1 && botManager.bots.length === 0) {
        const origin = localPlayer.modelGroup.position.clone();
        const env = mapCollider.toCollisionEnvironment();
        void botManager.spawnBot({ mode: 'patrol', originPosition: origin, collisionEnv: env });
        void botManager.spawnBot({ mode: 'chase', originPosition: origin, collisionEnv: env });
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

      // 多人联机对手同步与插值
      if (otherPlayers.current) {
        const renderTime = performance.now() - 100;
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

      if (holding && ready && !paused.current && !sandboxOpen.current) fire();
      if (sandboxRules.current.noCooldown) skillEffects.resetCooldowns();
      skillEffects.update(delta);
      if (passives.regenPerTick > 0) {
        regenTimer -= delta;
        if (regenTimer <= 0) {
          regenTimer = 2;
          if (health.current < MAX_HEALTH * 0.5) healRef.current(passives.regenPerTick);
        }
      }

      // 主玩家输入驱动与更新
      if (localPlayer && ready) {
        localPlayer.godMode = sandboxRules.current.godMode;
        localPlayer.setMotion(motion.current);
        localPlayer.setSpeed(skillEffects.speed(localPlayer.getBaseSpeed()));

        const dir = new THREE.Vector3();
        if (!sandboxOpen.current) {
          if (keys.has('KeyW') || keys.has('ArrowUp')) dir.z += 1;
          if (keys.has('KeyS') || keys.has('ArrowDown')) dir.z -= 1;
          if (keys.has('KeyA') || keys.has('ArrowLeft')) dir.x += 1;
          if (keys.has('KeyD') || keys.has('ArrowRight')) dir.x -= 1;
          if (dir.lengthSq() > 0) dir.normalize();
        }

        const yaw = cameraController?.yaw ?? 0;
        localPlayer.setInput(dir, yaw, false);
        localPlayer.update(delta);

        botManager.autoRespawn = sandboxRules.current.autoRespawnBots;
        botManager.update(delta, localPlayer, skillEffects.isStealthed());

        cameraController?.update(delta, mapCollider.collisionMeshes);

        const currentPos = localPlayer.modelGroup.position;
        const currentYaw = localPlayer.modelGroup.rotation.y;
        if (performance.now() - (positionRef.current as any).lastTime > 66 || !(positionRef.current as any).lastTime) {
          (positionRef.current as any).lastTime = performance.now();
          positionRef.current(currentPos.x, currentPos.z, currentYaw);
        }
      }

      if (performance.now() - lastHotbar > 100) {
        lastHotbar = performance.now();
        const snap = skillEffects.snapshot();
        const bySlot = skillEffects.bySlot();
        hotbarRef.current({
          cooldowns: BATTLE_QUICK_KEYS.map((_, index) => bySlot.get(index) ?? 0),
          shield: snap.shield,
          stealthed: skillEffects.isStealthed(),
          speed: snap.speed,
          maxHealthScale: snap.maxHealthScale,
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
  }, [map, character, creation, avatarPreset, weapons, active, paused]);

  return <div className="battle-canvas" ref={mountRef} data-gameplay-canvas />;
}

export default function Gameplay({ room, character, creation, assets, avatarPreset, quickbar, skills, levels,
  volume, effectsVolume, onVolume, onEffectsVolume, onExit, onQuit = onExit }: {
  room: RoomConfig & { id?: string; players?: Record<string, any> };
  character: SavedCharacter;
  creation: CreationAssets;
  assets: LobbyAssets;
  avatarPreset?: CreationPreset;
  quickbar: (string | null)[];
  skills: Skill[];
  levels: number[];
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
  const [remaining, setRemaining] = useState(ROUND_LENGTH);
  const [scoreRed, setScoreRed] = useState(0);
  const [scoreBlue, setScoreBlue] = useState(0);
  const wsRef = useRef<WebRTCClient | null>(null);
  const sequenceRef = useRef(0);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const logDebug = (msg: string) => setDebugLog(prev => [...prev.slice(-4), msg]);

  const myUserId = useMemo(() => {
    const me = Object.values(room.players || {}).find((p: any) => p.username === character.name);
    const resolvedId = me ? (me as any).userId : 0;
    console.log('Resolved myUserId:', resolvedId, 'for character:', character.name, 'with players:', room.players);
    return resolvedId;
  }, [room.players, character.name]);
  const otherPlayersRef = useRef<Record<string, { buffer: {x: number, z: number, yaw: number, time: number}[] }>>({});
  const [selected, setSelected] = useState(0);
  const [ammo, setAmmo] = useState<number[]>([]);
  const [reserves, setReserves] = useState<number[]>([]);
  const [health, setHealth] = useState(MAX_HEALTH);
  const [position, setPosition] = useState({ x: 0, z: 0, yaw: 0 });
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [hotbar, setHotbar] = useState<HotbarState>({ cooldowns: [], shield: 0, stealthed: false, speed: 0, maxHealthScale: 1 });
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
  pausedRef.current = paused;
  ammoRef.current = ammo;
  reservesRef.current = reserves;
  const loads = useMemo(() => loadSkills(skills, levels), [skills, levels]);
  const { slots, weapons } = useMemo(() => resolveLoadout(quickbar, assets.weapons, loads), [quickbar, assets, loads]);
  const current = weapons[selected] ?? weapons[0];
  const currentKind = weaponKind(current?.id ?? '');
  const currentMagazine = current ? magazine(current) : 0;
  const maxHealth = Math.round(MAX_HEALTH * (hotbar.maxHealthScale || 1));
  const customMap = useMemo(() => getCustomMapById(room.mapId), [room.mapId]);
  const chosenMap = (customMap ? mapDefinitions?.[customMap.baseMapId] : mapDefinitions?.[room.mapId]) ?? mapDefinitions?.level1;
  const mapArt = chosenMap?.minimap;

  useEffect(() => {
    if ((paused || sandboxOpen) && document.pointerLockElement) document.exitPointerLock();
  }, [paused, sandboxOpen]);

  useEffect(() => {
    const roomId = room.id ?? 'default-room';
    const gameUrl = `${WS_BASE}?roomId=${roomId}&playerId=${myUserId}`;
    const sigUrl = `${WS_BASE.replace('/ws', '/webrtc')}?roomId=${roomId}&playerId=${myUserId}`;
    const ws = new WebRTCClient(gameUrl, sigUrl, () => {
      console.log('WebRTC Ready! Sending first sync.');
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
            console.log(`[Networking] First sync received for remote player userId=${msg.userId}!`);
            logDebug(`[Network] 接收到玩家数据 (userId=${msg.userId})，开始渲染`);
            otherPlayersRef.current[msg.userId] = { buffer: [] };
          }
          const buffer = otherPlayersRef.current[msg.userId].buffer;
          buffer.push({ x: msg.x, z: msg.z, yaw: msg.yaw, time: performance.now() });
          if (buffer.length > 20) buffer.shift();
        } else if (msg.type === 'respawn' && msg.userId == myUserId) {
          setHealth(MAX_HEALTH);
        } else if (msg.type === 'game_over') {
          onExit();
          alert(`游戏结束！获胜方: ${msg.winner}`);
        }
      } catch (err) {}
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [room.id, myUserId]);

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
    if (!ready || paused || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [ready, paused, remaining]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (sandboxOpenRef.current) {
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
  }, []);

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
    // 弹夹最后一发打空后自动触发换弹
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

  const bounds = chosenMap?.bounds;
  const markerX = bounds?.length ? 50 + (position.x - bounds[0]) / bounds[2] * 100 : 50;
  const markerY = bounds?.length ? 50 - (position.z - bounds[1]) / bounds[3] * 100 : 50;

  return <main className={`battle-root${paused ? ' paused' : ''}${sandboxOpen ? ' sandbox-open' : ''}`} data-gameplay-ready={ready}>
    {chosenMap && <BattleScene map={chosenMap} customMap={customMap} character={character} creation={creation} assets={assets}
      avatarPreset={avatarPreset} weapons={weapons} slots={slots} loads={loads} health={healthRef} motion={motionRef}
      active={control} paused={pausedRef} sandboxOpen={sandboxOpenRef} sandboxRules={sandboxRulesRef}
      onBotsChange={setBots}
      onBotKill={() => {
        setScoreRed((prev) => prev + 1);
        wsRef.current?.sendJSON({ type: 'bot_kill', team: 'red' });
      }}
      onHitMarker={triggerHitMarker}
      onRecoil={triggerRecoil}
      onReady={() => setReady(true)} onPosition={reportPosition}
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

    {!ready && <div className="battle-loading" role="status">{error || `${room.mapName} · 战场加载中…`}</div>}

    {hurtFlash && <div className="battle-hurt-vignette" aria-hidden="true" />}

    <div className="battle-reticle" aria-hidden="true"
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
      <span className="battle-map-name">{room.mapName}</span>
    </aside>

    <div className="battle-touch-controls"><button onClick={fire}>开火</button><button onClick={() => control.current?.reload()}>换弹</button></div>
    <button className="battle-menu-button" aria-label="打开菜单" title="菜单 (Esc)" onClick={() => setPaused(true)}>☰</button>
    <button className={`battle-sandbox-button${sandboxOpen ? ' active' : ''}`} aria-label="沙盒战术面板" title="沙盒与AI靶场控制 [F2]"
      onClick={() => {
        const next = !sandboxOpen;
        sandboxOpenRef.current = next;
        setSandboxOpen(next);
        if (!next && !paused) void document.body.requestPointerLock();
      }}>
      🧩 沙盒 [F2]
    </button>

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
        onExit={() => {
          void apiFetch('/battle/settle', {
            method: 'POST',
            body: JSON.stringify({
              roomId: room.id ?? '',
              modeName: room.modeName,
              mapName: room.mapName,
              kills: scoreRed,
              deaths: scoreBlue,
              victory: scoreRed >= scoreBlue,
            }),
          }).catch(() => undefined).finally(() => onExit());
        }}
        onQuit={onQuit}
      />
      {import.meta.env.DEV && <div className="battle-debug">{debugLog.map((log, index) => <p key={index}>{log}</p>)}</div>}
    </>}
  </main>;
}

