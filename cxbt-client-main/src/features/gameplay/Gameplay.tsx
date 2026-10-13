import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import * as THREE from 'three';
import { WS_BASE } from '../../api';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { SavedCharacter } from '../characterCreation/character';
import { type CreationAssets, type CreationWeapon } from '../characterCreation/assets';
import type { LobbyAssets } from '../lobby/assets';
import type { RoomConfig } from '../gameMode/CreateRoomDialog';
import { createBattleAvatar, type BattleAvatar } from './avatar';
import { createBattleAudio } from './audio';
import { createProjectileSystem, weaponKind } from './projectiles';
import { PlayerEntity, CameraController, MapCollider, getWeaponActionSuite } from './engine';
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
type BattleControl = { switchWeapon: (index: number) => void; fire: () => void; reload: () => void };

const BASE = `${import.meta.env.BASE_URL}assets/gameplay/`;
const img = (name: string) => `${BASE}ui/${name}.png`;
const AMMO: Record<string, number> = { pistol: 12, sniperrifle: 5, shotgun: 8, rpg: 1,
  bow: 1, crossbow: 1, machinegun: 80, smg: 30, sprayer: 60, grenadelauncher: 6, grenade: 1 };
const DEFAULT_AMMO = 30;
const MAX_HEALTH = 3201;
const ROUND_LENGTH = 3 * 60;
const SKILL_ICONS = ['ballistic', 'bandage_heal', 'assimilation', 'bloodpoison'];

function magazine(weapon: CreationWeapon) {
  if (weaponKind(weapon.id) === 'melee') return 0;
  const family = weapon.id.split('_')[0];
  return AMMO[family] ?? DEFAULT_AMMO;
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

function BattleScene({ map, character, creation, assets, weapons, active, onReady, onPosition,
  onShot, onHit, onReload, onWeaponChange, onDamage, paused, otherPlayers, roomPlayers, logDebug }: {
  map: MapDefinition;
  character: SavedCharacter;
  creation: CreationAssets;
  assets: LobbyAssets;
  weapons: CreationWeapon[];
  active: RefObject<BattleControl | null>;
  paused: RefObject<boolean>;
  onReady: () => void;
  onPosition: (x: number, z: number, yaw: number) => void;
  onShot: () => boolean;
  onHit: (targetId: string, damage: number) => void;
  onReload: () => void;
  onWeaponChange: (index: number) => void;
  onDamage: (amount: number) => void;
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
  shotRef.current = onShot;
  hitRef.current = onHit;
  reloadRef.current = onReload;
  positionRef.current = onPosition;
  readyRef.current = onReady;
  weaponChangeRef.current = onWeaponChange;
  damageRef.current = onDamage;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
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

    // 1. 初始化地图物理碰撞与地表查询引擎
    const mapCollider = new MapCollider();
    if (map.bounds) mapCollider.setBounds(map.bounds);

    const projectiles = createProjectileSystem(scene, () => mapCollider.collisionMeshes.length ? mapCollider.collisionMeshes : mapCollider.mapVisible,
      (point, radius) => {
        if (!localPlayer) return;
        const distance = point.distanceTo(localPlayer.modelGroup.position.clone().add(new THREE.Vector3(0, 1, 0)));
        if (distance < radius) damageRef.current(Math.ceil(650 * (1 - distance / radius)));
      });

    const fire = () => {
      const family = weapons[selected]?.id.split('_')[0] ?? '';
      const kind = weaponKind(weapons[selected]?.id ?? '');
      const delay = kind === 'melee' ? 430 : kind === 'grenade' ? 800 : 140;
      if (!ready || !localPlayer || paused.current || performance.now() - lastShot < delay) return;
      if (kind !== 'melee' && !shotRef.current()) return;
      lastShot = performance.now();

      localPlayer.attack();
      audio.play(`fire-${['pistol', 'sniperrifle', 'shotgun', 'smg', 'machinegun', 'knives',
        'bow', 'crossbow', 'grenadelauncher', 'grenade', 'shield', 'rpg'].includes(family)
        ? family : kind === 'melee' ? 'knives' : 'pistol'}`, 0.55);

      if (kind === 'melee') return;

      const aim = cameraController ? cameraController.getForwardDirection() : camera.getWorldDirection(new THREE.Vector3());
      const muzzle = localPlayer.getMuzzlePosition();
      projectiles.spawn(kind, muzzle, aim);

      if (kind !== 'grenade') {
        shotFlash = 0.08;
        flash.position.copy(muzzle);
        flash.intensity = 6;

        const hit = mapCollider.raycastBullet(camera.position, aim, 100);
        if (hit && hit.object.userData?.isPlayer) {
          const damage = family === 'sniperrifle' ? 85 : family === 'shotgun' ? 35 : 18;
          hitRef.current(hit.object.userData.userId, damage);
          if (hit.object.userData.entity) {
            hit.object.userData.entity.applyDamage(damage);
          }
        }
      }
    };

    active.current = {
      switchWeapon(index) {
        if (selected === index) return;
        selected = index;
        playerAvatar?.setWeapon(index);
        localPlayer?.switchWeaponSlot(index);
        const suite = getWeaponActionSuite(weapons[index]?.id ?? 'smg_01');
        void localPlayer?.loadAnimations(suite.actions);

        const family = weapons[index]?.id.split('_')[0] ?? '';
        audio.play(['pistol', 'sniperrifle', 'shotgun', 'smg', 'machinegun', 'knives',
          'grenade', 'rpg', 'bow', 'crossbow', 'shield', 'sprayer', 'grenadelauncher'].includes(family)
          ? family : 'pistol');
        weaponChangeRef.current(index);
      },
      fire,
      reload() {
        if (weaponKind(weapons[selected]?.id ?? '') === 'melee') return;
        localPlayer?.reload();
        reloadRef.current();
      },
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      if (paused.current) return;
      keys.add(event.code);
      audio.start();
      if (event.code === 'Space' && !event.repeat && ready && !paused.current) {
        localPlayer?.jump();
      }
      if ((event.code === 'ShiftLeft' || event.code === 'ControlLeft') && !event.repeat && ready && !paused.current) {
        localPlayer?.roll();
      }
      if (event.code === 'KeyR' && !event.repeat) active.current?.reload();
      if (event.code.startsWith('Digit') && !event.repeat) {
        const index = Number(event.code.slice(5)) - 1;
        if (index >= 0 && index < weapons.length) active.current?.switchWeapon(index);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const onBlur = () => keys.clear();

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
      if (paused.current) return;
      audio.start();
      if (event.button === 2) {
        cameraController?.setAiming(true);
        if (!document.pointerLockElement) void renderer.domElement.requestPointerLock();
        dragging = true;
        pointerX = event.clientX;
        pointerY = event.clientY;
        if (!document.pointerLockElement) mount.setPointerCapture(event.pointerId);
      } else if (event.button === 0) {
        if (!document.pointerLockElement) void renderer.domElement.requestPointerLock();
        else fire();
      }
    };

    const onUp = (event: PointerEvent) => {
      if (event.button === 2) {
        dragging = false;
        cameraController?.setAiming(false);
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (paused.current || !weapons.length) return;
      active.current?.switchWeapon((selected + (event.deltaY > 0 ? 1 : weapons.length - 1)) % weapons.length);
    };

    const onContext = (event: MouseEvent) => event.preventDefault();
    const onLockChange = () => {
      dragging = false;
      if (!document.pointerLockElement) {
        keys.clear();
        cameraController?.setAiming(false);
      }
    };

    addEventListener('keydown', onKeyDown);
    addEventListener('keyup', onKeyUp);
    addEventListener('blur', onBlur);
    document.addEventListener('pointermove', onMove);
    mount.addEventListener('pointerdown', onDown);
    mount.addEventListener('pointerup', onUp);
    mount.addEventListener('wheel', onWheel, { passive: false });
    mount.addEventListener('contextmenu', onContext);
    document.addEventListener('pointerlockchange', onLockChange);

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

    const otherPlayerEntities = new Map<string, PlayerEntity>();

    const load = async () => {
      const loader = new GLTFLoader();
      const [mapGltf, collisionGltf, avatar] = await Promise.all([
        loader.loadAsync(`${BASE}${map.scene}`),
        map.collision ? loader.loadAsync(`${BASE}${map.collision}`).catch(() => null) : Promise.resolve(null),
        createBattleAvatar(creation, creation.jobs[character.jobId].presets[character.appearance.gender], character.appearance, weapons),
      ]);
      if (cancelled) { avatar.dispose(); return; }

      playerAvatar = avatar;
      visual = mapGltf.scene;
      collision = collisionGltf?.scene ?? null;

      // 注册场景网格与物理碰撞
      mapCollider.registerVisualScene(visual, map.airWalls);
      if (collision) mapCollider.registerCollisionScene(collision);
      scene.add(visual);

      // 2. 主玩家实体化 (挂载 PlayerEntity 核心类)
      localPlayer = new PlayerEntity(scene);
      localPlayer.attachAvatarRoot(avatar.root);
      localPlayer.setCollisionEnvironment(mapCollider.toCollisionEnvironment());

      // 挂接音效与事件
      localPlayer.events.onFootstep = (idx) => audio.play(`step${idx}`, 0.35);
      localPlayer.events.onJump = () => audio.play('jump');
      localPlayer.events.onLand = () => audio.play('land', 0.4);
      localPlayer.events.onRoll = () => audio.play('roll');
      localPlayer.events.onDamage = (dmg) => damageRef.current(dmg);

      // 加载首套武器的动作预设
      const initialSuite = getWeaponActionSuite(weapons[0]?.id ?? 'smg_01');
      await localPlayer.loadAnimations(initialSuite.actions);

      // 3. 相机控制器实例化并绑定
      cameraController = new CameraController(camera, {
        distance: 2.9,
        pitch: 0.1,
        yaw: 0,
        heightOffset: 1.25,
        shoulderOffset: 0.35
      });
      cameraController.setTarget(localPlayer.modelGroup);

      const spawnX = map.camera?.[0] ?? 0;
      const spawnZ = map.camera?.[2] ?? 0;
      const ground = mapCollider.floorAt(spawnX, spawnZ, 80) ?? 0;
      localPlayer.modelGroup.position.set(spawnX, ground, spawnZ);

      ready = true;
      readyRef.current();
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
                  remoteEntity!.attachAvatarRoot(loadedAvatar.root);
                  const suite = getWeaponActionSuite(pWeapons[0]?.id ?? 'smg_01');
                  void remoteEntity!.loadAnimations(suite.actions);
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
            if (speed > 0.1) {
              remoteEntity.playAction('run', 0.15, true);
            } else {
              remoteEntity.playAction('idle', 0.15, true);
            }
            if (remoteEntity.mixer) remoteEntity.mixer.update(delta);
          }
        }
      }

      if (paused.current !== audioPaused) {
        audioPaused = paused.current;
        if (audioPaused) audio.pause();
        else audio.start();
      }

      // 主玩家输入驱动与更新
      if (localPlayer && ready) {
        const dir = new THREE.Vector3();
        if (keys.has('KeyW') || keys.has('ArrowUp')) dir.z += 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) dir.z -= 1;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) dir.x += 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) dir.x -= 1;
        if (dir.lengthSq() > 0) dir.normalize();

        const yaw = cameraController?.yaw ?? 0;
        localPlayer.setInput(dir, yaw, false);
        localPlayer.update(delta);

        cameraController?.update(delta, mapCollider.collisionMeshes);

        const currentPos = localPlayer.modelGroup.position;
        const currentYaw = localPlayer.modelGroup.rotation.y;
        if (performance.now() - (positionRef.current as any).lastTime > 66 || !(positionRef.current as any).lastTime) {
          (positionRef.current as any).lastTime = performance.now();
          positionRef.current(currentPos.x, currentPos.z, currentYaw);
        }
      }

      if (shotFlash > 0) { shotFlash -= delta; if (shotFlash <= 0) flash.intensity = 0; }
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
      mount.removeEventListener('pointerdown', onDown);
      mount.removeEventListener('pointerup', onUp);
      mount.removeEventListener('wheel', onWheel);
      mount.removeEventListener('contextmenu', onContext);
      document.removeEventListener('pointerlockchange', onLockChange);
      active.current = null;
      if (document.pointerLockElement) document.exitPointerLock();

      audio.dispose();
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
  }, [map, character, creation, weapons, active, paused]);
  return <div className="battle-canvas" ref={mountRef} data-gameplay-canvas />;
}

export default function Gameplay({ room, character, creation, assets, weaponIds, onExit }: {
  room: RoomConfig & { id?: string; players?: Record<string, any> };
  character: SavedCharacter;
  creation: CreationAssets;
  assets: LobbyAssets;
  weaponIds: string[];
  onExit: () => void;
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
  const control = useRef<BattleControl | null>(null);
  const selectedRef = useRef(0);
  const pausedRef = useRef(false);
  const ammoRef = useRef<number[]>([]);
  const reservesRef = useRef<number[]>([]);
  pausedRef.current = paused;
  ammoRef.current = ammo;
  reservesRef.current = reserves;
  const weapons = useMemo(() => {
    const listed = weaponIds.map((id) => assets.weapons[id]).filter((weapon): weapon is CreationWeapon => Boolean(weapon));
    return listed.length ? listed : creation.jobs[character.jobId].weapons;
  }, [weaponIds, assets, creation, character.jobId]);
  const current = weapons[selected] ?? weapons[0];
  const currentKind = weaponKind(current?.id ?? '');
  const currentMagazine = current ? magazine(current) : 0;
  const ammoRatio = currentKind === 'melee' ? 1 : Math.max(0, Math.min(1, (ammo[selected] ?? currentMagazine) / Math.max(1, currentMagazine)));
  const healthRatio = health / MAX_HEALTH;
  const healthColor = healthRatio > 0.55 ? '#49d6ef' : healthRatio > 0.25 ? '#ffc354' : '#ef4e54';
  const ammoColor = ammoRatio > 0.55 ? '#49d6ef' : ammoRatio > 0.25 ? '#ffc354' : '#ef4e54';
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
      if (event.key === 'Escape') { event.preventDefault(); setPaused((value) => !value); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  const switchWeapon = (index: number) => {
    if (index < 0 || index >= weapons.length) return;
    selectedRef.current = index;
    setSelected(index);
    control.current?.switchWeapon(index);
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
    {chosenMap && <BattleScene map={chosenMap} character={character} creation={creation} assets={assets} weapons={weapons}
      active={control} paused={pausedRef} onReady={() => setReady(true)} onPosition={reportPosition}
      otherPlayers={otherPlayersRef}
      roomPlayers={room.players}
      logDebug={logDebug}
      onShot={onShot} 
      onHit={(targetId, damage) => {
        if (wsRef.current) {
          wsRef.current.sendJSON({ type: 'hit', targetId: targetId, damage });
        }
      }}
      onReload={onReload} onWeaponChange={(index) => { selectedRef.current = index; setSelected(index); }}
      onDamage={(amount) => setHealth((value) => Math.max(0, value - amount))} />}
    {!ready && <div className="battle-loading" role="status">{error || `${room.mapName} · 战场加载中…`}</div>}
    <div className="battle-reticle" aria-hidden="true"><i /><i /><i /><i /></div>
    <div className="battle-abilities" aria-label="技能状态">
      {SKILL_ICONS.map((icon) => <span key={icon}><img src={img(icon)} alt="" /></span>)}
      <small>{formatTime(remaining)}</small>
    </div>
    <div className="battle-top">
      <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', marginTop: '60px', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', zIndex: 10, pointerEvents: 'none', border: '1px solid rgba(255,255,255,0.2)' }}>
        房间号: {(room.id ?? 'room-default').replace('room-', '')} | 地图: {room.mapName}
      </div>
      <div style={{ position: 'absolute', top: 120, left: '50%', transform: 'translateX(-50%)', background: 'rgba(255,0,0,0.7)', color: '#fff', padding: '10px', borderRadius: '8px', fontSize: '14px', zIndex: 20, pointerEvents: 'none', minWidth: '300px' }}>
        <strong>联机诊断日志 (Debug Log):</strong><br/>
        {debugLog.length === 0 ? "等待网络连接..." : debugLog.map((log, i) => <div key={i}>{log}</div>)}
      </div>
      <div className="battle-team red"><strong>{scoreRed}</strong></div>
      <div className="battle-time"><b>05</b><small><em>TIME</em> {formatTime(remaining)}</small><div className="battle-progress"><i /><i /></div></div>
      <div className="battle-team blue"><strong>{scoreBlue}</strong></div>
    </div>
    <aside className="battle-minimap" aria-label="小地图">
      <div className="battle-map-image" style={mapArt ? { backgroundImage: `url(${BASE}${mapArt})` } : undefined}>
        <span className="battle-map-marker" style={{ left: `${THREE.MathUtils.clamp(markerX, 5, 95)}%`, top: `${THREE.MathUtils.clamp(markerY, 5, 95)}%`, transform: `translate(-50%, -50%) rotate(${-position.yaw}rad)` }}>▲</span>
      </div>
      <span className="battle-map-name">{room.mapName}</span>
    </aside>
    <div className="battle-bottom">
      <div className="battle-health" aria-label={`生命值 ${health} / ${MAX_HEALTH}`}><img src={img('skin_ingame_heart01')} alt="" />
        <span className="battle-health-meter" role="progressbar" aria-label="生命值" aria-valuemin={0} aria-valuemax={MAX_HEALTH} aria-valuenow={health}>
          <i style={{ height: `${healthRatio * 100}%`, backgroundColor: healthColor }} /></span><b>{health}</b></div>
      <div className="battle-inventory" aria-label="物品栏">{weapons.map((weapon, index) => <button key={`${weapon.id}-${index}`}
        className={index === selected ? 'active' : ''} aria-label={`切换到${weapon.label}`} aria-pressed={index === selected}
        title={`${index + 1} · ${weapon.label}`} onClick={() => switchWeapon(index)}>
        <small>{index + 1}</small><img src={weapon.icon ? `${import.meta.env.BASE_URL}assets/creation/${weapon.icon}` : ''} alt="" />
      </button>)}{SKILL_ICONS.map((icon, index) => <span className="battle-skill" key={icon}>
        <small>{index === 0 ? '左Shift' : index + weapons.length + 1}</small><img src={img(icon)} alt="" />
      </span>)}</div>
      <div className="battle-ammo" aria-label={currentKind === 'melee' ? '近战武器' : `弹药 ${ammo[selected] ?? currentMagazine} / ${currentMagazine}`}>
        <span className="battle-ammo-meter" role="progressbar" aria-label="弹夹" aria-valuemin={0} aria-valuemax={currentMagazine} aria-valuenow={ammo[selected] ?? currentMagazine}
          style={{ '--meter-color': ammoColor } as CSSProperties}><i style={{ width: `${ammoRatio * 100}%` }} /></span>
        <b style={{ color: ammoColor }}>{currentKind === 'melee' ? '∞' : ammo[selected] ?? currentMagazine}</b>
        <img src={img('skin_ingame_icon_ammobg_row')} alt="" /><strong>{reserves[selected] ?? currentMagazine * 4}</strong></div>
    </div>
    <div className="battle-touch-controls"><button onClick={fire}>开火</button><button onClick={() => control.current?.reload()}>换弹</button></div>
    <button className="battle-menu-button" aria-label="打开菜单" title="菜单" onClick={() => setPaused(true)}>☰</button>
    {paused && <div className="battle-pause-shade"><section className="battle-pause" role="dialog" aria-modal="true" aria-label="游戏菜单">
      <h2>游戏菜单</h2><button onClick={() => {
        setPaused(false);
        void document.querySelector<HTMLCanvasElement>('[data-gameplay-canvas] canvas')?.requestPointerLock();
      }}>继续游戏</button><button onClick={onExit}>退出战场</button>
    </section></div>}
  </main>;
}
