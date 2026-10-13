import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { WS_BASE } from '../../api';
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
type BattleControl = { switchWeapon: (index: number) => void; fire: () => void; reload: () => void;
  castSkill: (slot: number) => boolean };
type HotbarState = { cooldowns: number[]; shield: number; stealthed: boolean; speed: number; maxHealthScale: number };

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

function BattleScene({ map, character, creation, assets, avatarPreset, weapons, slots, loads, health, motion,
  active, onReady, onPosition, onShot, onHit, onReload, onWeaponChange, onDamage, onHeal, onHotbar,
  onPause, paused, otherPlayers, roomPlayers, logDebug }: {
  map: MapDefinition;
  character: SavedCharacter;
  creation: CreationAssets;
  assets: LobbyAssets;
  avatarPreset?: CreationPreset;
  weapons: CreationWeapon[];
  /** Mirrors the lobby quickbar so hotkeys and the HUD stay in sync. */
  slots: BattleSlot[];
  loads: LoadedSkill[];
  health: RefObject<number>;
  motion: RefObject<boolean>;
  active: RefObject<BattleControl | null>;
  paused: RefObject<boolean>;
  onReady: () => void;
  onPosition: (x: number, z: number, yaw: number) => void;
  onShot: () => boolean;
  onHit: (targetId: string, damage: number) => void;
  onReload: () => void;
  onWeaponChange: (index: number) => void;
  onDamage: (amount: number) => void;
  onHeal: (amount: number) => void;
  onHotbar: (state: HotbarState) => void;
  /** Opens the same settings UI the lobby uses when the mouse leaves the round. */
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

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    let frame = 0;
    let avatar: BattleAvatar | null = null;
    let visual: any = null;
    let collision: any = null;
    let mapVisible: any[] = [];
    let collisionMeshes: any[] = [];
    let floorMeshes: any[] = [];
    const replacedMaterials = new Set<any>();
    const airWallMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
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
    const position = new THREE.Vector3(map.camera?.[0] ?? 0, 0, map.camera?.[2] ?? 0);
    let yaw = 0;
    let pitch = 0.1;
    let dragging = false;
    let pointerX = 0;
    let pointerY = 0;
    let selected = 0;
    let lastShot = 0;
    let comboStep = 0;
    let comboTime = 0;
    let holding = false;
    let lockTimer = 0;
    let lockAttempts = 0;
    let lastHotbar = 0;
    let regenTimer = 0;
    let shotFlash = 0;
    let ready = false;
    let grounded = false;
    let verticalSpeed = 0;
    let rollTime = 0;
    let audioPaused = false;
    let footstepTime = 0;
    let footstepIndex = 0;
    const rollDirection = new THREE.Vector3();
    const keys = new Set<string>();
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const direction = new THREE.Vector3();
    const candidate = new THREE.Vector3();
    const target = new THREE.Vector3();
    const clock = new THREE.Clock();
    const flash = new THREE.PointLight(0xffcf79, 0, 7);
    scene.add(flash);
    const passives = passiveModifiers(loads);
    const enemyList = () => {
      const list: { userId: string; position: any }[] = [];
      for (const [userId, entry] of otherPlayerAvatars) if (entry?.root) list.push({ userId, position: entry.root.position });
      return list;
    };
    const projectiles = createProjectileSystem(scene, () => collisionMeshes.length ? collisionMeshes : mapVisible,
      (point, radius) => {
        const distance = point.distanceTo(position.clone().add(new THREE.Vector3(0, 1, 0)));
        if (distance < radius) takeDamage(Math.ceil(650 * (1 - distance / radius)));
        for (const enemy of enemyList()) {
          const gap = enemy.position.distanceTo(point);
          if (gap > radius) continue;
          const blast = passives.gasDamage > 0 ? passives.gasDamage * 3 : Math.ceil(320 * (1 - gap / radius));
          hitRef.current(enemy.userId, blast);
        }
      });
    const transfer = { stored: 0 };
    const takeDamage = (amount: number) => {
      const reduced = amount * (1 - passives.damageReduction / 100);
      if (passives.storeEnergy > 0) {
        transfer.stored += reduced * passives.storeEnergy / 100;
        if (transfer.stored >= 100 && enemyList().some((enemy) => enemy.position.distanceTo(position) <= 3)) {
          transfer.stored = 0;
          for (const enemy of enemyList()) {
            if (enemy.position.distanceTo(position) <= passives.releaseRadius) hitRef.current(enemy.userId, passives.releaseDamage);
          }
        }
      }
      const left = skillEffects.absorb(reduced);
      if (left > 0) damageRef.current(left);
    };
    const skillEffects = createSkillEffects({
      scene,
      position: () => position,
      aim: () => camera.getWorldDirection(new THREE.Vector3()),
      spawnProjectile: (kind, origin, aim) => projectiles.spawn(kind, origin, aim),
      playSound: (name, volume) => audio.play(name, volume),
      getMaxHealth: () => MAX_HEALTH * skillEffects.snapshot().maxHealthScale,
      heal: (amount) => healRef.current(amount),
      hurt: (amount) => damageRef.current(amount),
      enemies: enemyList,
      hitEnemy: (userId, damage) => hitRef.current(userId, damage),
      setGhost: (on) => avatar?.setGhost(on),
      log: (message) => logRef.current(message),
    });

    const floorAt = (x: number, z: number, fromY: number) => {
      raycaster.set(new THREE.Vector3(x, fromY, z), down);
      raycaster.far = 100;
      const hits = raycaster.intersectObjects(floorMeshes.length ? floorMeshes : mapVisible, true);
      return hits.find((hit: any) => hit.face &&
        hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y > 0.35)?.point.y;
    };
    const blocked = (from: any, to: any) => {
      if (!collisionMeshes.length) return false;
      const motion = to.clone().sub(from);
      if (motion.lengthSq() < 0.0001) return false;
      const distance = motion.length();
      raycaster.set(from.clone().add(new THREE.Vector3(0, 0.7, 0)), motion.normalize());
      raycaster.far = Math.max(0.55, distance + 0.32);
      return raycaster.intersectObjects(collisionMeshes, true).some((hit: any) => hit.distance > 0.08);
    };
    const fire = () => {
      const family = weapons[selected]?.id.split('_')[0] ?? '';
      const kind = weaponKind(weapons[selected]?.id ?? '');
      const base = kind === 'melee' ? 430 : kind === 'grenade' ? 800 : 140;
      const delay = base * (family === 'machinegun' ? Math.max(0.35, 1 - passives.fireRate / 100) : 1);
      const now = performance.now();
      if (!ready || !avatar || paused.current || now - lastShot < delay) return;
      if (kind !== 'melee' && !shotRef.current()) return;
      skillEffects.breakStealth();
      if (comboTime > 0 && now - comboTime > 1200) comboStep = 0;
      lastShot = now;
      comboTime = now;
      avatar.attack(kind === 'melee' ? comboStep : 0);
      comboStep = kind === 'melee' ? comboStep + 1 : 0;
      audio.play(`fire-${['pistol', 'sniperrifle', 'shotgun', 'smg', 'machinegun', 'knives',
        'bow', 'crossbow', 'grenadelauncher', 'grenade', 'shield', 'rpg'].includes(family)
        ? family : kind === 'melee' ? 'knives' : 'pistol'}`, 0.55);
      if (kind === 'melee') {
        const aim = camera.getWorldDirection(new THREE.Vector3());
        const point = position.clone().add(new THREE.Vector3(0, 1, 0));
        for (const enemy of enemyList()) {
          const offset = enemy.position.clone().sub(point);
          const distance = offset.length();
          if (distance > 2.6 || (distance > 0.01 && offset.normalize().dot(aim) < 0.3)) continue;
          let damage = 130;
          if (passives.poisonChance > 0 && Math.random() * 100 < passives.poisonChance) damage += passives.dotDamage * 6;
          hitRef.current(enemy.userId, Math.round(damage));
        }
        return;
      }
      const aim = camera.getWorldDirection(new THREE.Vector3());
      const muzzle = position.clone().add(new THREE.Vector3(Math.sin(yaw) * 0.75, 1.3, Math.cos(yaw) * 0.75));
      projectiles.spawn(kind, muzzle, aim);
      if (kind !== 'grenade') {
        shotFlash = 0.08;
        flash.position.copy(muzzle);
        flash.intensity = 6;
        
        raycaster.set(camera.position, aim);
        raycaster.far = 100;
        const hits = raycaster.intersectObjects(collisionMeshes, true);
        const firstHit = hits.find((h: any) => h.distance > 0.08);
        if (firstHit && firstHit.object.userData?.isPlayer) {
          let damage = family === 'sniperrifle' ? 85 : family === 'shotgun' ? 35 : 18;
          if (family === 'sniperrifle' && Math.random() * 100 < passives.critChance) damage *= 1 + passives.critDamage / 100;
          if (passives.weakChance > 0 && Math.random() * 100 < passives.weakChance) damage *= 1.2;
          if (family === 'sprayer' && Math.random() * 100 < passives.plagueChance) damage += passives.plagueDamage * 6;
          if (family === 'crossbow' && passives.lifesteal > 0) healRef.current(damage * passives.lifesteal / 100);
          hitRef.current(firstHit.object.userData.userId, Math.round(damage));
        }
      }
    };
    active.current = {
      switchWeapon(index) {
        if (selected === index) return;
        selected = index;
        comboStep = 0;
        avatar?.setWeapon(index);
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
        if (skillEffects.cast(slot, entry.load) === null) return false;
        if (entry.load.skill.id !== 'latent') skillEffects.breakStealth();
        return true;
      },
      reload() {
        if (weaponKind(weapons[selected]?.id ?? '') === 'melee') return;
        avatar?.reload();
        reloadRef.current();
      },
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      if (paused.current) return;
      keys.add(event.code);
      audio.start();
      if (!document.pointerLockElement) lockPointer();
      if (event.code === 'Space' && !event.repeat && ready && grounded && !paused.current) {
        grounded = false;
        verticalSpeed = 7.5;
        avatar?.jump();
        audio.play('jump');
      }
      if ((event.code === 'ShiftLeft' || event.code === 'ControlLeft') && !event.repeat && ready && grounded && !paused.current && rollTime <= 0) {
        rollTime = 0.45;
        rollDirection.set(0, 0, 1);
        if (keys.has('KeyA')) rollDirection.x = 1;
        if (keys.has('KeyD')) rollDirection.x = -1;
        if (keys.has('KeyS')) rollDirection.z = -1;
        rollDirection.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
        avatar?.roll();
        audio.play('roll');
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
      yaw -= dx * 0.005;
      pitch = THREE.MathUtils.clamp(pitch + dy * 0.003, -0.35, 0.65);
    };
    const onDown = (event: PointerEvent) => {
      if (paused.current) return;
      // Pointer lock retargets mouse events, so clicks on the HUD keep their own meaning.
      if (event.target instanceof Element && event.target.closest('button, input, .settings-menu, .battle-inventory')) return;
      audio.start();
      if (event.button === 2) {
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
      if (event.button === 2) dragging = false;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (paused.current || !weapons.length) return;
      active.current?.switchWeapon((selected + (event.deltaY > 0 ? 1 : weapons.length - 1)) % weapons.length);
    };
    const onContext = (event: MouseEvent) => event.preventDefault();
    const onLockChange = () => {
      dragging = false;
      if (document.pointerLockElement) { lockAttempts = 0; return; }
      keys.clear();
      holding = false;
      // Escape releases the mouse, so offer the settings menu instead of firing blindly.
      if (ready && !paused.current) pauseRef.current();
    };
    /** Chrome briefly refuses pointer lock right after Esc, so retry a few times. */
    const onLockError = () => {
      if (cancelled || paused.current || lockAttempts >= 3) return;
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

    /** Re-acquires the mouse for the round; the request needs a recent user gesture. */
    const lockPointer = () => {
      if (cancelled || paused.current || document.pointerLockElement) return;
      const request = document.body.requestPointerLock() as unknown as Promise<void> | undefined;
      if (request && typeof request.catch === 'function') void request.catch(() => undefined);
    };
    const load = async () => {
      const loader = new GLTFLoader();
      const [mapGltf, collisionGltf, player] = await Promise.all([
        loader.loadAsync(`${BASE}${map.scene}`),
        map.collision ? loader.loadAsync(`${BASE}${map.collision}`).catch(() => null) : Promise.resolve(null),
        createBattleAvatar(creation, avatarPreset ?? creation.jobs[character.jobId].presets[character.appearance.gender],
          avatarPreset ? initialAppearance(avatarPreset, character.appearance.gender) : character.appearance, weapons),
      ]);
      if (cancelled) { player.dispose(); return; }
      visual = mapGltf.scene;
      collision = collisionGltf?.scene ?? null;
      const airWalls = new Set(map.airWalls);
      visual.traverse((object: any) => {
        if (!(object instanceof THREE.Mesh)) return;
        if (airWalls.has(object.name)) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material: any) => replacedMaterials.add(material));
          object.material = airWallMaterial;
          object.userData.airWall = true;
          return;
        }
        object.frustumCulled = true;
        mapVisible.push(object);
      });
      collision?.traverse((object: any) => {
        if (!(object instanceof THREE.Mesh)) return;
        collisionMeshes.push(object);
        if (object.userData.collision?.surfaceId !== 2) floorMeshes.push(object);
      });
      scene.add(visual);
      collision?.updateMatrixWorld(true);
      avatar = player;
      scene.add(player.root);
      const ground = floorAt(position.x, position.z, 80);
      position.y = ground ?? 0;
      grounded = ground !== undefined;
      player.root.position.copy(position);
      ready = true;
      readyRef.current();
      // Grab the mouse as soon as the round loads; keys and clicks re-lock as a fallback.
      lockPointer();
    };
    void load().catch((error: unknown) => {
      if (!cancelled) mount.dataset.error = error instanceof Error ? error.message : '战场加载失败';
    });
    const otherPlayerAvatars = new Map<string, any>();

    const animate = () => {
      frame = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);

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

          let avatarObj = otherPlayerAvatars.get(userIdStr);
          if (!avatarObj) {
            // Create a dummy group to hold the avatar and hitbox immediately
            const group = new THREE.Group();
            scene.add(group);
            
            // Add collision capsule to root immediately
            const capsuleGeom = new THREE.CapsuleGeometry(0.35, 0.9, 4, 8);
            const capMat = new THREE.MeshBasicMaterial({ visible: false }); // Invisible hitbox
            const hitbox = new THREE.Mesh(capsuleGeom, capMat);
            hitbox.position.y = 0.8;
            hitbox.userData = { isPlayer: true, userId: userIdStr };
            group.add(hitbox);
            collisionMeshes.push(hitbox);
            
            avatarObj = { root: group, update: null, loaded: false };
            otherPlayerAvatars.set(userIdStr, avatarObj);
            
            const pInfo = roomPlayers && roomPlayers[userIdStr];
            if (pInfo && pInfo.jobId && pInfo.appearance) {
              const job = (creation.jobs as any)[pInfo.jobId];
              if (job) {
                const preset = job.presets[pInfo.appearance.gender];
                let pWeapons = pInfo.weaponIds ? pInfo.weaponIds.map((wId: string) => assets.weapons[wId]).filter(Boolean) : job.weapons;
                if (!pWeapons || pWeapons.length === 0) pWeapons = job.weapons;
                createBattleAvatar(creation, preset, pInfo.appearance, pWeapons).then(loadedAvatar => {
                  group.add(loadedAvatar.root);
                  avatarObj.update = loadedAvatar.update;
                  avatarObj.loaded = true;
                }).catch(err => {
                  console.error('Avatar load error:', err);
                  logDebug(`[Avatar Error] ${err.message || String(err)}`);
                });
              }
            } else {
              // Fallback if data is missing, render red capsule
              const mat = new THREE.MeshStandardMaterial({ color: 0xef4e54 });
              const fallbackMesh = new THREE.Mesh(capsuleGeom, mat);
              fallbackMesh.position.y = 0.8;
              group.add(fallbackMesh);
              avatarObj.loaded = true;
            }
          }
          
          if (avatarObj = otherPlayerAvatars.get(userIdStr)) {
            const floor = floorAt(interpX, interpZ, 80) ?? 0;
            const oldPos = avatarObj.root.position.clone();
            avatarObj.root.position.set(interpX, floor, interpZ);
            avatarObj.root.rotation.y = interpYaw;
            if (avatarObj.update && avatarObj.loaded) {
              const speed = oldPos.distanceTo(avatarObj.root.position) / delta;
              const isMoving = speed > 0.1;
              const charInfo = {
                moveX: 0,
                moveY: isMoving ? 1 : 0,
                weapon: 0,
                aim: new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, interpYaw, 0)),
                grounded: true,
                yaw: interpYaw,
                pitch: 0,
              };
              avatarObj.update(delta, charInfo, false);
            }
          }
        }
      }

      if (paused.current !== audioPaused) {
        audioPaused = paused.current;
        if (audioPaused) audio.pause();
        else audio.start();
      }
      if (holding && ready && !paused.current) fire();
      skillEffects.update(delta);
      if (passives.regenPerTick > 0) {
        regenTimer -= delta;
        if (regenTimer <= 0) {
          regenTimer = 2;
          if (health.current < MAX_HEALTH * 0.5) healRef.current(passives.regenPerTick);
        }
      }
      if (avatar) {
        direction.set(0, 0, 0);
        if (keys.has('KeyW') || keys.has('ArrowUp')) direction.z += 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) direction.z -= 1;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) direction.x += 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) direction.x -= 1;
        const moving = direction.lengthSq() > 0 || rollTime > 0;
        avatar.setMoving(moving && !paused.current);
        if (moving && !paused.current) {
          if (rollTime > 0) direction.copy(rollDirection);
          else direction.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
          candidate.copy(position).addScaledVector(direction, delta * skillEffects.speed(rollTime > 0 ? 8.5 : 4.5));
          const bounds = map.bounds;
          if (bounds?.length && (candidate.x < bounds[0] - bounds[2] / 2 || candidate.x > bounds[0] + bounds[2] / 2 ||
            candidate.z < bounds[1] - bounds[3] / 2 || candidate.z > bounds[1] + bounds[3] / 2)) {
            candidate.copy(position);
          }
          const floor = floorAt(candidate.x, candidate.z, position.y + (grounded ? 2.4 : 0.3));
          if ((floor === undefined || !grounded || Math.abs(floor - position.y) < 0.65) && !blocked(position, candidate)) {
            position.x = candidate.x;
            position.z = candidate.z;
            if (grounded && floor !== undefined) position.y = floor;
          }
          if (grounded && rollTime <= 0) {
            footstepTime -= delta;
            if (footstepTime <= 0) {
              footstepIndex = (footstepIndex % 3) + 1;
              audio.play(`step${footstepIndex}`, 0.35);
              footstepTime = 0.34;
            }
          }
        }
        if (!moving) footstepTime = 0;
        if (rollTime > 0 && !paused.current) rollTime = Math.max(0, rollTime - delta);
        if (!grounded && !paused.current) {
          verticalSpeed -= 18 * delta;
          position.y += verticalSpeed * delta;
          const floor = floorAt(position.x, position.z, position.y + 0.25);
          if (verticalSpeed <= 0 && floor !== undefined && position.y <= floor) {
            position.y = floor;
            verticalSpeed = 0;
            grounded = true;
            audio.play('land', 0.4);
          }
        }
        avatar.root.position.copy(position);
        avatar.root.rotation.y = yaw;
        avatar.update(delta);
        target.copy(position).add(new THREE.Vector3(0, 1.15 + pitch, 0));
        camera.position.copy(position).add(new THREE.Vector3(-Math.sin(yaw) * 2.9, 1.75 + pitch * 2.2, -Math.cos(yaw) * 2.9));
        camera.lookAt(target.clone().add(new THREE.Vector3(Math.sin(yaw) * 3, 0, Math.cos(yaw) * 3)));
        
        // Throttle position reporting to 15 ticks per second to prevent network flood
        if (performance.now() - (positionRef.current as any).lastTime > 66 || !(positionRef.current as any).lastTime) {
          (positionRef.current as any).lastTime = performance.now();
          positionRef.current(position.x, position.z, yaw);
        }
      }
      avatar?.setMotion(motion.current);
      const hotbarNow = performance.now();
      if (hotbarNow - lastHotbar > 150) {
        lastHotbar = hotbarNow;
        const snapshot = skillEffects.snapshot();
        const bySlot = skillEffects.bySlot();
        hotbarRef.current({ cooldowns: BATTLE_QUICK_KEYS.map((_, index) => bySlot.get(index) ?? 0),
          shield: snapshot.shield, stealthed: snapshot.stealth > 0, speed: snapshot.speed,
          maxHealthScale: snapshot.maxHealthScale });
      }
      if (shotFlash > 0) { shotFlash -= delta; if (shotFlash <= 0) flash.intensity = 0; }
      projectiles.update(delta);
      mount.dataset.projectileCount = String(projectiles.count());
      mount.dataset.attackStep = String(comboStep);
      mount.dataset.hotbar = String(slots.filter((slot) => slot.kind !== 'empty').length);
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
      projectiles.dispose();
      avatar?.dispose();
      visual?.traverse((object: any) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material: any) => material.dispose());
        }
      });
      collision?.traverse((object: any) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      replacedMaterials.forEach((material: any) => material.dispose());
      airWallMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      mapVisible = [];
      collisionMeshes = [];
      floorMeshes = [];
    };
  }, [map, character, creation, avatarPreset, weapons, active, paused]);
  return <div className="battle-canvas" ref={mountRef} data-gameplay-canvas />;
}

export default function Gameplay({ room, character, creation, assets, avatarPreset, quickbar, skills, levels,
  volume, effectsVolume, onVolume, onEffectsVolume, onExit, onQuit = onExit }: {
  room: RoomConfig & { id: string; players?: Record<string, any> };
  character: SavedCharacter;
  creation: CreationAssets;
  assets: LobbyAssets;
  avatarPreset?: CreationPreset;
  /** Slot-for-slot copy of the lobby quickbar: the battle hotbar only carries these. */
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
  motionRef.current = motion;
  healthRef.current = health;
  const control = useRef<BattleControl | null>(null);
  const selectedRef = useRef(0);
  const pausedRef = useRef(false);
  const ammoRef = useRef<number[]>([]);
  const reservesRef = useRef<number[]>([]);
  pausedRef.current = paused;
  ammoRef.current = ammo;
  reservesRef.current = reserves;
  const loads = useMemo(() => loadSkills(skills, levels), [skills, levels]);
  const { slots, weapons } = useMemo(() => resolveLoadout(quickbar, assets.weapons, loads), [quickbar, assets, loads]);
  const current = weapons[selected] ?? weapons[0];
  const currentKind = weaponKind(current?.id ?? '');
  const currentMagazine = current ? magazine(current) : 0;
  /** 过激反应 raises the health ceiling for its duration. */
  const maxHealth = Math.round(MAX_HEALTH * (hotbar.maxHealthScale || 1));
  const chosenMap = mapDefinitions?.[room.mapId] ?? mapDefinitions?.level1;
  const mapArt = chosenMap?.minimap;

  useEffect(() => {
    if (paused && document.pointerLockElement) document.exitPointerLock();
  }, [paused]);

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
        if (msg.type === 'sync') {
          // Log explicitly for debugging visibility
          // console.log(`Received SYNC: from userId=${msg.userId}, myUserId=${myUserId}, x=${msg.x}`);
        }
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

  // Removed network sync useEffect that was hooked to React state, which was causing severe lag.
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
      if (event.key === 'Escape') { event.preventDefault(); setPaused(true); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
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
    const index = selectedRef.current;
    if ((ammoRef.current[index] ?? 0) < 1) return false;
    ammoRef.current = ammoRef.current.map((value, slot) => slot === index ? value - 1 : value);
    setAmmo(ammoRef.current);
    return true;
  };
  const onReload = () => {
    const index = selectedRef.current;
    const capacity = magazine(weapons[index]);
    const needed = capacity - (ammoRef.current[index] ?? capacity);
    const amount = Math.min(needed, reservesRef.current[index] ?? 0);
    if (amount <= 0) return;
    ammoRef.current = ammoRef.current.map((value, slot) => slot === index ? value + amount : value);
    reservesRef.current = reservesRef.current.map((value, slot) => slot === index ? value - amount : value);
    setAmmo(ammoRef.current);
    setReserves(reservesRef.current);
  };
  const reportPosition = (x: number, z: number, yaw: number) => {
    // DIRECT NETWORK SEND: completely bypass React state to avoid lag spikes
    if (wsRef.current) {
      sequenceRef.current++;
      wsRef.current.sendMove(myUserId, x, z, yaw, sequenceRef.current);
    }
    
    // Throttle React state updates severely to just support the minimap
    setPosition((previous) => Math.abs(previous.x - x) + Math.abs(previous.z - z) + Math.abs(previous.yaw - yaw) > 2.0
      ? { x, z, yaw } : previous);
  };
  const bounds = chosenMap?.bounds;
  const markerX = bounds?.length ? 50 + (position.x - bounds[0]) / bounds[2] * 100 : 50;
  const markerY = bounds?.length ? 50 - (position.z - bounds[1]) / bounds[3] * 100 : 50;

  return <main className={`battle-root${paused ? ' paused' : ''}`} data-gameplay-ready={ready}>
    {chosenMap && <BattleScene map={chosenMap} character={character} creation={creation} assets={assets} avatarPreset={avatarPreset}
      weapons={weapons} slots={slots} loads={loads} health={healthRef} motion={motionRef}
      active={control} paused={pausedRef} onReady={() => setReady(true)} onPosition={reportPosition}
      otherPlayers={otherPlayersRef}
      onPause={() => setPaused(true)}
      roomPlayers={room.players}
      logDebug={logDebug}
      onShot={onShot}
      onHotbar={setHotbar}
      onHit={(targetId, damage) => {
        if (wsRef.current) {
          wsRef.current.sendJSON({ type: 'hit', targetId: targetId, damage });
        }
      }}
      onReload={onReload} onWeaponChange={(index) => { selectedRef.current = index; setSelected(index); setSelectedSlot(slotForWeapon(index)); }}
      onHeal={(amount) => setHealth((value) => Math.min(maxHealth, value + amount))}
      onDamage={(amount) => setHealth((value) => Math.max(0, value - amount))} />}
    {!ready && <div className="battle-loading" role="status">{error || `${room.mapName} · 战场加载中…`}</div>}
    <div className="battle-reticle" aria-hidden="true"><i /><i /><i /><i /></div>
    <div className="battle-abilities" aria-label="技能状态">
      {slots.map((slot, index) => slot.kind === 'skill' && <span key={slot.key}
        className={(hotbar.cooldowns[index] ?? 0) > 0 ? 'cooling' : undefined} title={`${slot.key} · ${slot.load.skill.name}`}>
        <img src={`${LOBBY}${slot.load.skill.icon}`} alt={slot.load.skill.name} />
      </span>)}
      <small>{formatTime(remaining)}</small>
    </div>
    <BattleHud scoreRed={scoreRed} scoreBlue={scoreBlue} time={formatTime(remaining)} health={health} maxHealth={maxHealth}
      shield={hotbar.shield} ammo={ammo[selected] ?? currentMagazine} magazine={currentMagazine} melee={currentKind === 'melee'}
      slots={slots} cooldowns={hotbar.cooldowns} selectedSlot={selectedSlot} onSelect={selectSlot} />
    <aside className="battle-minimap" aria-label="小地图">
      <div className="battle-map-image" style={mapArt ? { backgroundImage: `url(${BASE}${mapArt})` } : undefined}>
        <span className="battle-map-marker" style={{ left: `${THREE.MathUtils.clamp(markerX, 5, 95)}%`, top: `${THREE.MathUtils.clamp(markerY, 5, 95)}%`, transform: `translate(-50%, -50%) rotate(${-position.yaw}rad)` }}>▲</span>
      </div>
      <span className="battle-map-name">{room.mapName}</span>
    </aside>
    <div className="battle-touch-controls"><button onClick={fire}>开火</button><button onClick={() => control.current?.reload()}>换弹</button></div>
    <button className="battle-menu-button" aria-label="打开菜单" title="菜单" onClick={() => setPaused(true)}>☰</button>
    {paused && <>
      <SettingsMenu assets={assets} volume={volume} effectsVolume={effectsVolume} motion={motion}
        onVolume={onVolume} onEffectsVolume={onEffectsVolume} onMotion={setMotion}
        onClose={() => { setPaused(false); void document.body.requestPointerLock(); }} onExit={onExit} onQuit={onQuit} />
      {import.meta.env.DEV && <div className="battle-debug">{debugLog.map((log, index) => <p key={index}>{log}</p>)}</div>}
    </>}
  </main>;
}
