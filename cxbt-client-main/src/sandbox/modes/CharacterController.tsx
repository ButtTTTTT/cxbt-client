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
  ACTION_LABELS,
  getWeaponCombatProfile,
  getWeaponActionSuite,
  CombatEffectsManager,
  BotManager,
  type BotSnapshot,
  type BotBehaviorMode,
  getSavedCustomMaps,
  getCustomMapById,
  mountCustomMapNodesIntoScene
} from '../../features/gameplay/engine';
import { createBattleAudio } from '../../features/gameplay/audio';
import { createProjectileSystem } from '../../features/gameplay/projectiles';
import { createSkillEffects } from '../../features/gameplay/skillEffects';
import { loadSkills, type LoadedSkill } from '../../features/gameplay/skills';
import { loadSkillAssets, type SkillAssets } from '../../features/lobby/skills';
import { loadLobbyAssets, type LobbyAssets } from '../../features/lobby/assets';
import { CREATION_JOBS, assetUrl, type CreationJob, type CreationWeapon } from '../../features/characterCreation/assets';

const LOBBY_ASSET_BASE = `${import.meta.env.BASE_URL}assets/lobby/`;

export default function CharacterController({ initialMapId }: { initialMapId?: string } = {}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('正在加载引擎类与地图...');

  // 地图状态
  const [selectedMapId, setSelectedMapId] = useState<string>(initialMapId || 'level1');
  const mapColliderRef = useRef<MapCollider>(new MapCollider());
  const currentMapSessionRef = useRef<LoadedMapSession | null>(null);
  const customMapGroupRef = useRef<any | null>(null);
  const gridHelperRef = useRef<any | null>(null);
  const mapNameRef = useRef<HTMLElement>(null);

  // 角色职业与性别状态
  const [selectedJobId, setSelectedJobId] = useState<CreationJob>('assassin');
  const selectedJobIdRef = useRef<CreationJob>('assassin');
  selectedJobIdRef.current = selectedJobId;

  const [selectedGender, setSelectedGender] = useState<number>(0);
  const selectedGenderRef = useRef<number>(0);
  selectedGenderRef.current = selectedGender;

  // 大厅全量资源库 (484把武器 + 157张角色造型卡)
  const [lobbyAssets, setLobbyAssets] = useState<LobbyAssets | null>(null);
  const lobbyAssetsRef = useRef<LobbyAssets | null>(null);
  lobbyAssetsRef.current = lobbyAssets;

  const [selectedAvatarCardId, setSelectedAvatarCardId] = useState<string>('default');
  const selectedAvatarCardIdRef = useRef<string>('default');
  selectedAvatarCardIdRef.current = selectedAvatarCardId;

  const [selectedWeaponSkinId, setSelectedWeaponSkinId] = useState<string>('');
  const selectedWeaponSkinIdRef = useRef<string>('');
  selectedWeaponSkinIdRef.current = selectedWeaponSkinId;

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

  // 沙盒全局规则开关 (同步支持正式战场)
  const [infiniteAmmo, setInfiniteAmmo] = useState<boolean>(false);
  const infiniteAmmoRef = useRef<boolean>(false);
  infiniteAmmoRef.current = infiniteAmmo;

  const [noCooldown, setNoCooldown] = useState<boolean>(false);
  const noCooldownRef = useRef<boolean>(false);
  noCooldownRef.current = noCooldown;

  const [godMode, setGodMode] = useState<boolean>(false);
  const [autoRespawnBots, setAutoRespawnBots] = useState<boolean>(false);

  // 职业技能系统状态 (与 Gameplay.tsx 完全同源)
  const [skillAssets, setSkillAssets] = useState<SkillAssets | null>(null);
  const activeSkillsRef = useRef<LoadedSkill[]>([]);
  const [activeSkillsUI, setActiveSkillsUI] = useState<LoadedSkill[]>([]);
  const [skillCooldowns, setSkillCooldowns] = useState<number[]>([]);
  const [shieldValue, setShieldValue] = useState<number>(0);
  const [isStealthed, setIsStealthed] = useState<boolean>(false);
  const [maxHealth, setMaxHealth] = useState<number>(3200);
  const maxHealthRef = useRef<number>(3200);
  maxHealthRef.current = maxHealth;

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

  // Bot 状态与容器 (由共用 BotManager 驱动)
  const [botList, setBotList] = useState<BotSnapshot[]>([]);
  const [globalBotMode, setGlobalBotMode] = useState<BotBehaviorMode>('chase');
  const botManagerRef = useRef<BotManager | null>(null);
  const combatEffectsRef = useRef<CombatEffectsManager | null>(null);
  const skillEffectsRef = useRef<ReturnType<typeof createSkillEffects> | null>(null);
  const sceneRef = useRef<any>(null);

  // 战斗系统核心组件 Refs
  const battleAudioRef = useRef<ReturnType<typeof createBattleAudio> | null>(null);
  const projectileSystemRef = useRef<ReturnType<typeof createProjectileSystem> | null>(null);

  const skeletonHelperRef = useRef<any | null>(null);
  const orbitControlsRef = useRef<any | null>(null);
  const cameraRef = useRef<any | null>(null);
  const modelRef = useRef<any | null>(null);
  const playerRef = useRef<PlayerEntity | null>(null);
  const cameraControllerRef = useRef<CameraController | null>(null);
  const actionBadgeRef = useRef<HTMLSpanElement | null>(null);

  // 加载技能配置表与大厅全量资源库 (484把武器 + 157张造型卡)
  useEffect(() => {
    const controller = new AbortController();
    loadSkillAssets(controller.signal)
      .then(assets => {
        if (!controller.signal.aborted) setSkillAssets(assets);
      })
      .catch(() => null);
    loadLobbyAssets(controller.signal)
      .then(assets => {
        if (!controller.signal.aborted) setLobbyAssets(assets);
      })
      .catch(() => null);
    return () => controller.abort();
  }, []);

  // 当职业或技能资源变化时，同步当前职业主动技能列表
  useEffect(() => {
    if (!skillAssets) return;
    const jobSkills = skillAssets.jobs[selectedJobId]?.skills ?? [];
    const levels = jobSkills.map(() => 5); // 沙盒默认满级 Lv5 以便完整测试技能数值
    const loaded = loadSkills(jobSkills, levels);
    const actives = loaded.filter(s => s.active);
    activeSkillsRef.current = actives;
    setActiveSkillsUI(actives);
    setSkillCooldowns(actives.map(() => 0));
  }, [skillAssets, selectedJobId]);

  // 触发击中标记
  const triggerHitmarker = useCallback((isHeadshot: boolean) => {
    setHitmarkerHeadshot(isHeadshot);
    setHitmarkerVisible(true);
    if (hitmarkerTimerRef.current) clearTimeout(hitmarkerTimerRef.current);
    hitmarkerTimerRef.current = window.setTimeout(() => {
      setHitmarkerVisible(false);
    }, 160);
  }, []);

  // 触发玩家受击反馈 (含能量盾吸收判定)
  const triggerPlayerHurt = useCallback((dmg: number) => {
    const player = playerRef.current;
    if (!player || !player.isAlive) return;
    if (player.godMode) {
      setStatus('🛡️ 无敌模式生效，免疫本次伤害');
      return;
    }

    const remainingDmg = skillEffectsRef.current ? skillEffectsRef.current.absorb(dmg) : dmg;
    if (remainingDmg <= 0) {
      setStatus(`🛡️ 能量护盾吸收了 ${Math.round(dmg)} 点伤害！`);
      return;
    }

    player.takeDamage(Math.round(remainingDmg));
    setHurtFlash(true);
    setTimeout(() => setHurtFlash(false), 240);
    battleAudioRef.current?.play('hit_body', 0.85);
    combatEffectsRef.current?.spawnFloatingDamage(
      player.modelGroup.position.clone().add(new THREE.Vector3(0, 1.85, 0)),
      remainingDmg,
      false,
      true
    );
  }, []);

  // 换弹逻辑 (备弹耗尽时自动战术补给，防止单发RPG/弓箭/榴弹等弹尽卡死)
  const reloadWeapon = useCallback(() => {
    const player = playerRef.current;
    if (!player || !player.isAlive || isReloadingRef.current) return;

    const currentSuite = WEAPON_SUITES.find(s => s.id === activeSuiteIdRef.current) || WEAPON_SUITES[0];
    const profile = getWeaponCombatProfile(currentSuite.id);

    if (profile.kind === 'melee') return;
    if (currentMagAmmoRef.current >= profile.magCapacity) return;

    if (reserveAmmoRef.current <= 0) {
      const refilled = profile.magCapacity * 4;
      reserveAmmoRef.current = refilled;
      setReserveAmmo(refilled);
    }

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

  // 释放职业主动技能 (与正式游戏 Gameplay.tsx 完全一致的技能管线)
  const castSandboxSkill = useCallback((slotIndex: number) => {
    const skillEffect = skillEffectsRef.current;
    const player = playerRef.current;
    const load = activeSkillsRef.current[slotIndex];
    if (!skillEffect || !player || !player.isAlive || !load) return;

    if (noCooldownRef.current) {
      skillEffect.resetCooldowns();
    }

    const cd = skillEffect.cast(slotIndex, load);
    if (cd !== null) {
      if (load.skill.id !== 'latent') {
        skillEffect.breakStealth();
      }
      if (noCooldownRef.current) {
        skillEffect.resetCooldowns();
      }
      setStatus(`✨ 释放职业技能: [${load.skill.name} Lv.${load.level}]！`);
    } else {
      setStatus(`⏳ 技能 [${load.skill.name}] 正在冷却中...`);
    }
  }, []);

  // 核心开火与受击判定
  const fireWeapon = useCallback(() => {
    const player = playerRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const tpsCamera = cameraControllerRef.current;
    const botManager = botManagerRef.current;
    const combatEffects = combatEffectsRef.current;
    if (!player || !scene || !camera || !player.isAlive) return;

    const currentSuite = WEAPON_SUITES.find(s => s.id === activeSuiteIdRef.current) || WEAPON_SUITES[0];
    const profile = getWeaponCombatProfile(currentSuite.id);

    if (isReloadingRef.current) return;

    // 检查射速 CD (无CD模式下允许极速射击)
    const now = performance.now();
    const effectiveDelay = noCooldownRef.current ? Math.min(0.07, profile.fireDelay) : profile.fireDelay;
    if (now - lastFireTimeRef.current < effectiveDelay * 1000) return;

    // 检查弹药 (无限弹药模式下不消耗弹夹)
    if (profile.kind !== 'melee') {
      if (currentMagAmmoRef.current <= 0) {
        reloadWeapon();
        return;
      }
      if (!infiniteAmmoRef.current) {
        currentMagAmmoRef.current -= 1;
        setCurrentMagAmmo(currentMagAmmoRef.current);
      }
    }

    lastFireTimeRef.current = now;
    skillEffectsRef.current?.breakStealth();

    // TPS 模式开火瞬间，人物模型朝向对齐摄像机准星视线
    if (cameraModeRef.current === 'tps' && tpsCamera) {
      player.syncFacingToCamera(tpsCamera.yaw);
    }

    // 播放攻击动作与枪声 (近战自动触发三段连击动作)
    player.attack();
    battleAudioRef.current?.play(profile.fireAudio, 0.7);

    // 枪口亮光与火花
    const muzzlePos = player.getMuzzlePosition();
    if (profile.kind !== 'melee') {
      combatEffects?.triggerMuzzleFlash(muzzlePos, 0.06);
    }

    // 准星后坐力扩散
    setRecoilSpread(prev => Math.min(22, prev + 5));

    // 1. 近战攻击 (Melee Fan Arc + 3D 刀光剑气)
    if (profile.kind === 'melee') {
      const playerPos = player.modelGroup.position;
      const yaw = player.modelGroup.rotation.y;
      const forward = cameraModeRef.current === 'tps' && tpsCamera
        ? tpsCamera.getForwardDirection().clone()
        : new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      combatEffects?.spawnMeleeSlash(playerPos, forward, Math.floor(now / 150) % 3 + 1);
      let hitAny = false;

      botManager?.bots.forEach(bot => {
        if (bot.hp <= 0) return;
        const botPos = bot.entity.modelGroup.position;
        const toBot = botPos.clone().sub(playerPos);
        const dist = toBot.length();
        if (dist < 3.2) {
          toBot.normalize();
          const dot = forward.dot(toBot);
          if (dot > 0.2) {
            hitAny = true;
            const dmg = Math.floor(profile.damage * (0.9 + Math.random() * 0.25));
            bot.entity.takeDamage(dmg);
            combatEffects?.spawnFloatingDamage(botPos.clone().add(new THREE.Vector3(0, 1.8, 0)), dmg, false);
            combatEffects?.spawnImpactSpark(botPos.clone().add(new THREE.Vector3(0, 1.0, 0)), 0xef4444);
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

    const targets: any[] = [
      ...(botManager?.getAliveHitboxes() ?? []),
      ...(mapColliderRef.current?.collisionMeshes ?? [])
    ];
    const raycaster = new THREE.Raycaster();

    // 3. 投射物武器 (RPG / Bow / Grenade) —— 从枪口朝准星落点汇聚发射
    if (profile.kind === 'rocket' || profile.kind === 'arrow' || profile.kind === 'grenade') {
      let launchDir = aimDir.clone();
      if (cameraModeRef.current === 'tps') {
        raycaster.set(camera.position, aimDir);
        raycaster.far = 120;
        const hits = raycaster.intersectObjects(targets, true);
        const targetPoint = hits.length > 0
          ? hits[0].point
          : camera.position.clone().addScaledVector(aimDir, 85);
        launchDir = targetPoint.clone().sub(muzzlePos).normalize();
      }
      projectileSystemRef.current?.spawn(profile.kind, muzzlePos, launchDir);
      if (currentMagAmmoRef.current <= 0) reloadWeapon();
      return;
    }

    // 4. 实时射线检定枪弹 (SMG, Pistol, Shotgun, Sniper, Machinegun, Sprayer) + 3D 曳光弹轨
    const pelletsCount = profile.pellets;
    const family = currentSuite.id.split('_')[0];
    const tracerColor = family === 'sprayer'
      ? 0x34d399
      : family === 'sniperrifle'
        ? 0x38bdf8
        : family === 'machinegun'
          ? 0xfb923c
          : 0xfde047;

    for (let p = 0; p < pelletsCount; p++) {
      const pelletDir = aimDir.clone();
      if (profile.spread > 0) {
        pelletDir.x += (Math.random() - 0.5) * profile.spread;
        pelletDir.y += (Math.random() - 0.5) * profile.spread;
        pelletDir.z += (Math.random() - 0.5) * profile.spread;
        pelletDir.normalize();
      }

      if (cameraModeRef.current === 'tps') {
        raycaster.set(camera.position, pelletDir);
      } else {
        raycaster.set(muzzlePos, pelletDir);
      }
      raycaster.far = 120;

      const hits = raycaster.intersectObjects(targets, true);
      const targetPoint = hits.length > 0
        ? hits[0].point
        : (cameraModeRef.current === 'tps' ? camera.position : muzzlePos).clone().addScaledVector(pelletDir, 85);
      const bulletDir = targetPoint.clone().sub(muzzlePos).normalize();

      if (p === 0 || p % 2 === 0) {
        projectileSystemRef.current?.spawn('bullet', muzzlePos, bulletDir);
      }
      combatEffects?.spawnBulletTracer(muzzlePos, targetPoint, tracerColor);

      if (hits.length > 0) {
        const hit = hits[0];
        if (hit.object.userData?.isPlayer && hit.object.userData.entity) {
          const targetBot = botManager?.findByEntity(hit.object.userData.entity);
          if (targetBot && targetBot.hp > 0) {
            const hitY = hit.point.y;
            const botY = targetBot.entity.modelGroup.position.y;
            const isHeadshot = (hitY - botY) >= 1.35;
            const dmg = Math.floor(profile.damage * (isHeadshot ? profile.headshotMultiplier : 1.0) * (0.92 + Math.random() * 0.16));
            targetBot.entity.takeDamage(dmg);
            battleAudioRef.current?.play(isHeadshot ? 'critical_hit' : 'hit_body', 0.85);
            triggerHitmarker(isHeadshot);
            combatEffects?.spawnFloatingDamage(hit.point, dmg, isHeadshot);
            setStatus(`🎯 命中 [${targetBot.name}]！${isHeadshot ? '💥 爆头暴击!' : ''} 造成 ${dmg} 点伤害`);
          }
        } else {
          battleAudioRef.current?.play('hit_wall', 0.6);
          combatEffects?.spawnImpactSpark(hit.point);
        }
      }
    }

    // 弹夹打空自动触发换弹
    if (currentMagAmmoRef.current <= 0) {
      reloadWeapon();
    }
  }, [reloadWeapon, triggerHitmarker]);

  // 地图加载与随时切换核心逻辑 (同时支持原版地图与沙盒自制自定义地图)
  const switchMap = async (newMapId: string) => {
    const scene = sceneRef.current;
    const player = playerRef.current;
    if (!scene || !player) return;

    setSelectedMapId(newMapId);
    const customMap = getCustomMapById(newMapId);
    const targetPreset = MAP_PRESETS.find(m => m.id === (customMap ? customMap.baseMapId : newMapId));
    const displayMapName = customMap ? customMap.name : (targetPreset?.name || newMapId);
    setStatus(`正在切换地图为 [${displayMapName}]...`);

    if (customMapGroupRef.current) {
      scene.remove(customMapGroupRef.current);
      customMapGroupRef.current = null;
    }

    if (currentMapSessionRef.current) {
      unloadMapFromScene(currentMapSessionRef.current, scene, mapColliderRef.current);
      currentMapSessionRef.current = null;
    }

    try {
      const baseId = customMap ? customMap.baseMapId : newMapId;
      const session = await loadMapIntoScene(baseId, scene, mapColliderRef.current, msg => setStatus(msg));
      currentMapSessionRef.current = session;

      if (gridHelperRef.current) {
        gridHelperRef.current.visible = baseId === 'flat';
      }

      if (customMap) {
        session.spawnPoint.set(customMap.spawnPoint[0], customMap.spawnPoint[1], customMap.spawnPoint[2]);
        session.preset = {
          ...session.preset,
          id: customMap.id,
          name: customMap.name,
          category: '创意工坊与沙盒自制'
        };
        botManagerRef.current?.clearAllBots();
        customMapGroupRef.current = await mountCustomMapNodesIntoScene(
          customMap,
          scene,
          mapColliderRef.current,
          botManagerRef.current,
          lobbyAssetsRef.current
        );
      }

      const env = mapColliderRef.current.toCollisionEnvironment();
      player.setCollisionEnvironment(env);
      player.modelGroup.position.copy(session.spawnPoint);
      player.isGrounded = true;

      if (orbitControlsRef.current && cameraRef.current) {
        orbitControlsRef.current.target.set(session.spawnPoint.x, session.spawnPoint.y + 0.95, session.spawnPoint.z);
        cameraRef.current.position.set(session.spawnPoint.x, session.spawnPoint.y + 1.8, session.spawnPoint.z + 3.2);
        orbitControlsRef.current.update();
      }

      if (!customMap) {
        botManagerRef.current?.relocateAllBots(session.spawnPoint, env);
      }

      if (mapNameRef.current) {
        mapNameRef.current.textContent = displayMapName;
      }

      setStatus(`地图 [${displayMapName}] 加载就绪！出生点: (${session.spawnPoint.x.toFixed(1)}, ${session.spawnPoint.y.toFixed(1)}, ${session.spawnPoint.z.toFixed(1)})`);
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
    player.revive(maxHealthRef.current);
    setHealth(maxHealthRef.current);
    if (orbitControlsRef.current && cameraRef.current) {
      orbitControlsRef.current.target.set(sp.x, sp.y + 0.95, sp.z);
      cameraRef.current.position.set(sp.x, sp.y + 1.8, sp.z + 3.2);
      orbitControlsRef.current.update();
    }
    setStatus(`已复位至地图出生点: (${sp.x.toFixed(1)}, ${sp.y.toFixed(1)}, ${sp.z.toFixed(1)})`);
  };

  // 部署假人
  const spawnBot = async (customMode?: BotBehaviorMode) => {
    const player = playerRef.current;
    const botManager = botManagerRef.current;
    if (!player || !botManager) return;
    await botManager.spawnBot({
      mode: customMode,
      originPosition: player.modelGroup.position,
      collisionEnv: mapColliderRef.current.toCollisionEnvironment()
    });
  };

  const clearAllBots = () => botManagerRef.current?.clearAllBots();
  const reviveAllBots = () => botManagerRef.current?.reviveAllBots();
  const setBotMode = (id: string, mode: BotBehaviorMode) => botManagerRef.current?.setBotMode(id, mode);

  // 切换角色职业、性别或 157 款原版造型卡皮肤
  const handleAvatarChange = async (newJobId: CreationJob, newGender: number, cardIdOverride?: string) => {
    setSelectedJobId(newJobId);
    selectedJobIdRef.current = newJobId;
    setSelectedGender(newGender);
    selectedGenderRef.current = newGender;

    const targetCardId = cardIdOverride !== undefined ? cardIdOverride : selectedAvatarCardIdRef.current;
    setSelectedAvatarCardId(targetCardId);
    selectedAvatarCardIdRef.current = targetCardId;

    const player = playerRef.current;
    const scene = sceneRef.current;
    if (!player || !scene) return;

    const cardItem = targetCardId !== 'default'
      ? lobbyAssetsRef.current?.items.find(i => i.category === 'avatars' && i.id === targetCardId)?.avatarCard
      : undefined;

    const displayName = cardItem
      ? `造型卡 [${cardItem.name}]`
      : `[${CREATION_JOBS[newJobId].name} · ${newGender === 0 ? '男' : '女'}]`;

    setStatus(`正在切换角色为 ${displayName}...`);
    try {
      player.clearWeapons();
      if (modelRef.current && modelRef.current.parent) {
        modelRef.current.parent.remove(modelRef.current);
      }
      if (skeletonHelperRef.current) {
        scene.remove(skeletonHelperRef.current);
        skeletonHelperRef.current = null;
      }

      const built = await player.loadFullAvatar({
        jobId: newJobId,
        gender: newGender,
        preset: cardItem?.preset
      });
      const rootBone = built.skeleton?.bones?.[0] || built.root;
      const skeleton = new THREE.SkeletonHelper(rootBone);
      skeletonHelperRef.current = skeleton;
      skeleton.visible = showSkeleton;
      scene.add(skeleton);
      modelRef.current = built.root;
      built.root.visible = showMesh;

      const skinWeapon = selectedWeaponSkinIdRef.current
        ? lobbyAssetsRef.current?.weapons[selectedWeaponSkinIdRef.current]
        : undefined;
      const suite = WEAPON_SUITES.find(s => s.id === activeSuiteIdRef.current) || WEAPON_SUITES[0];
      const partsToEquip = skinWeapon
        ? skinWeapon.parts.map(p => ({
            model: assetUrl(p.model),
            texture: p.texture ? assetUrl(p.texture) : null,
            bone: p.bone
          }))
        : suite.parts;

      await Promise.all([
        player.loadAnimations(suite.actions),
        partsToEquip ? player.equipWeaponParts(partsToEquip, 0, skinWeapon?.id || suite.id) : Promise.resolve([])
      ]);
      setStatus(`✅ 已切换角色为 ${displayName}`);
    } catch (err) {
      console.error('Avatar switch error:', err);
      setStatus(`角色切换失败: ${err}`);
    }
  };

  useEffect(() => {
    if (!mountRef.current) return;

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

    const tpsCamera = new CameraController(camera, {
      distance: 3.2,
      heightOffset: 1.25,
      shoulderOffset: 0.35
    });
    cameraControllerRef.current = tpsCamera;

    const battleAudio = createBattleAudio();
    battleAudioRef.current = battleAudio;

    // 实例化共用 3D 战斗特效管理器
    const combatEffects = new CombatEffectsManager(scene);
    combatEffectsRef.current = combatEffects;

    // 实例化共用 Bot 管理器
    const botManager = new BotManager(scene, {
      onStateChange: (snapshots) => setBotList(snapshots),
      onStatus: (msg) => setStatus(msg),
      playAudio: (name, vol) => battleAudio.play(name, vol),
      onPlayerAttacked: (dmg) => triggerPlayerHurt(dmg)
    });
    botManagerRef.current = botManager;

    // 初始化投射物与范围爆炸系统 (RPG, Bow, Grenade)
    const projectileSystem = createProjectileSystem(
      scene,
      () => [
        ...botManager.getAliveHitboxes(),
        ...(mapColliderRef.current?.collisionMeshes ?? [])
      ],
      (point, radius) => {
        battleAudio.play('explosion_rpg', 0.85);
        combatEffects.spawnExplosionEffect(point);

        botManager.bots.forEach(bot => {
          if (bot.hp <= 0) return;
          const dist = bot.entity.modelGroup.position.distanceTo(point);
          if (dist <= radius) {
            const falloff = 1 - (dist / radius);
            const dmg = Math.floor(1500 * Math.max(0.25, falloff));
            bot.entity.takeDamage(dmg);
            combatEffects.spawnFloatingDamage(
              bot.entity.modelGroup.position.clone().add(new THREE.Vector3(0, 1.8, 0)),
              dmg,
              false
            );
            triggerHitmarker(false);
          }
        });

        if (playerRef.current && playerRef.current.isAlive) {
          const pDist = playerRef.current.modelGroup.position.distanceTo(point);
          if (pDist <= radius) {
            const falloff = 1 - (pDist / radius);
            const pDmg = Math.floor(900 * Math.max(0.2, falloff));
            triggerPlayerHurt(pDmg);
          }
        }
      },
      (hit, kind) => {
        if (hit?.object?.userData?.isPlayer && hit.object.userData.entity) {
          const bot = botManager.findByEntity(hit.object.userData.entity);
          if (bot && bot.hp > 0) {
            const hitY = hit.point.y;
            const botY = bot.entity.modelGroup.position.y;
            const isHeadshot = (hitY - botY) >= 1.35;
            const dmg = Math.floor((kind === 'arrow' ? 780 : 350) * (isHeadshot ? 2.4 : 1.0));
            bot.entity.takeDamage(dmg);
            battleAudio.play(isHeadshot ? 'critical_hit' : 'hit_body', 0.85);
            triggerHitmarker(isHeadshot);
            combatEffects.spawnFloatingDamage(hit.point, dmg, isHeadshot);
          }
        } else if (hit?.point) {
          battleAudio.play('hit_wall', 0.6);
          combatEffects.spawnImpactSpark(hit.point);
        }
      }
    );
    projectileSystemRef.current = projectileSystem;

    // 灯光系统
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

    // 实例化主玩家实体
    const player = new PlayerEntity(scene);
    playerRef.current = player;
    tpsCamera.setTarget(player.modelGroup);

    // 实例化共用职业技能运行时引擎 (与 Gameplay.tsx 完全同源)
    const skillEffects = createSkillEffects({
      scene,
      position: () => player.modelGroup.position,
      aim: () => cameraModeRef.current === 'tps'
        ? tpsCamera.getForwardDirection()
        : new THREE.Vector3(Math.sin(player.modelGroup.rotation.y), 0, Math.cos(player.modelGroup.rotation.y)),
      spawnProjectile: (kind, origin, aim) => projectileSystem.spawn(kind, origin, aim),
      playSound: (name, volume) => battleAudio.play(name, volume),
      getMaxHealth: () => maxHealthRef.current,
      heal: (amount) => {
        const nextHp = player.heal(amount);
        setHealth(nextHp);
        combatEffects.spawnFloatingHeal(
          player.modelGroup.position.clone().add(new THREE.Vector3(0, 1.9, 0)),
          amount
        );
      },
      hurt: (amount) => triggerPlayerHurt(amount),
      enemies: () => botManager.getAliveTargets(),
      hitEnemy: (userId, damage) => {
        const bot = botManager.damageBotById(userId, damage);
        if (bot) {
          triggerHitmarker(false);
          combatEffects.spawnFloatingDamage(
            bot.entity.modelGroup.position.clone().add(new THREE.Vector3(0, 1.8, 0)),
            damage,
            false
          );
        }
      },
      setGhost: (on) => player.setGhost(on),
      onSpurt: () => player.spurt(),
      onExplosion: (point) => {
        battleAudio.play('explosion_rpg', 0.8);
        combatEffects.spawnExplosionEffect(point);
      },
      log: (msg) => setStatus(`✨ 技能触发: ${msg}`)
    });
    skillEffectsRef.current = skillEffects;

    player.events = {
      onFootstep: (idx) => battleAudio.play(`step${idx}`, 0.3),
      onJump: () => {
        battleAudio.play('jump', 0.45);
        setStatus('实体触发起跳事件 (onJump)');
      },
      onLand: () => {
        battleAudio.play('land', 0.35);
        setStatus('实体平稳着地 (onLand)');
      },
      onRoll: () => {
        battleAudio.play('roll', 0.5);
        setStatus('实体执行战术翻滚 (onRoll)');
      },
      onAttack: () => {},
      onReload: () => {},
      onDamage: (amount, currentHp) => {
        setHealth(currentHp);
        if (amount > 0) setStatus(`受到 ${amount} 点伤害，剩余血量: ${currentHp}`);
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
          initialSuite.parts ? player.equipWeaponParts(initialSuite.parts, 0, initialSuite.id) : Promise.resolve([])
        ]);
        setAvailableActions(Object.keys(initialSuite.actions));

        const startMapId = initialMapId || 'level1';
        await switchMap(startMapId);
        if (!getCustomMapById(startMapId)) {
          await botManager.spawnBot({
            mode: 'dummy',
            originPosition: player.modelGroup.position,
            collisionEnv: mapColliderRef.current.toCollisionEnvironment()
          });
        }
      })
      .catch(err => setStatus(`引擎加载失败: ${err}`));

    // 键盘与鼠标事件
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
        player.jump();
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
      // 数字键 1~4 快捷释放职业技能
      if (!e.repeat && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
        const idx = Number(e.code.replace('Digit', '')) - 1;
        castSandboxSkill(idx);
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
        } else if (e.button === 2) {
          tpsCamera.setAiming(true);
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 0) {
        isMouseDownRef.current = false;
      }
      if (e.button === 2) {
        tpsCamera.setAiming(false);
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

    // 引擎主帧循环
    const clock = new THREE.Clock();
    let animationId: number;
    let frameCount = 0;
    let lastFpsTime = performance.now();
    let lastSkillSync = 0;

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1);

      // 更新技能运行时与移动加速
      skillEffects.update(delta);
      player.setSpeed(skillEffects.speed(player.getBaseSpeed()));

      if (performance.now() - lastSkillSync > 100) {
        lastSkillSync = performance.now();
        const snap = skillEffects.snapshot();
        const bySlot = skillEffects.bySlot();
        setShieldValue(Math.ceil(snap.shield));
        setIsStealthed(skillEffects.isStealthed());
        const scaledMax = Math.round(3200 * (snap.maxHealthScale || 1));
        if (scaledMax !== maxHealthRef.current) {
          maxHealthRef.current = scaledMax;
          player.maxHealth = scaledMax;
          setMaxHealth(scaledMax);
        }
        setSkillCooldowns(activeSkillsRef.current.map((_, idx) => bySlot.get(idx) ?? 0));
      }

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

      if (player.modelGroup.position.y < -35) {
        const sp = currentMapSessionRef.current?.spawnPoint || new THREE.Vector3(0, 0, 0);
        player.modelGroup.position.copy(sp);
        player.revive(maxHealthRef.current);
        setStatus('⚠️ 掉出地图边界，已自动重生回出生点！');
      }

      if (actionBadgeRef.current) {
        const cur = player.getCurrentAction();
        actionBadgeRef.current.textContent = cur ? (ACTION_LABELS[cur] || cur) : 'idle';
      }

      // 换弹计时器更新
      if (isReloadingRef.current) {
        reloadTimerRef.current -= delta;
        const prog = Math.max(0, Math.min(1, 1 - (reloadTimerRef.current / maxReloadTimeRef.current)));
        setReloadProgress(prog);

        if (reloadTimerRef.current <= 0) {
          const suite = WEAPON_SUITES.find(s => s.id === activeSuiteIdRef.current) || WEAPON_SUITES[0];
          const prof = getWeaponCombatProfile(suite.id);
          const needed = prof.magCapacity - currentMagAmmoRef.current;
          const toAdd = infiniteAmmoRef.current ? needed : Math.min(needed, reserveAmmoRef.current);
          currentMagAmmoRef.current += toAdd;
          if (!infiniteAmmoRef.current) {
            reserveAmmoRef.current -= toAdd;
            setReserveAmmo(reserveAmmoRef.current);
          }
          setCurrentMagAmmo(currentMagAmmoRef.current);
          isReloadingRef.current = false;
          setIsReloading(false);
          setReloadProgress(0);
          setStatus(`✅ 换弹完毕！当前弹药: ${currentMagAmmoRef.current} / ${reserveAmmoRef.current}`);
        }
      }

      // 持续按住鼠标连发 (Auto-fire)
      if (isMouseDownRef.current && cameraModeRef.current === 'tps') {
        const suite = WEAPON_SUITES.find(s => s.id === activeSuiteIdRef.current) || WEAPON_SUITES[0];
        const prof = getWeaponCombatProfile(suite.id);
        if (prof.isAutomatic && !isReloadingRef.current) {
          fireWeapon();
        }
      }

      // 准星后坐力平滑回缩
      setRecoilSpread(prev => Math.max(0, prev - delta * 30));

      // 更新投射物、3D 战斗特效、AI 假人
      projectileSystem.update(delta);
      combatEffects.update(delta);
      botManager.update(delta, player, skillEffects.isStealthed());

      // 相机驱动
      if (cameraModeRef.current === 'tps') {
        tpsCamera.update(delta, mapColliderRef.current.collisionMeshes);
      } else {
        controls.update();
      }

      // 更新 HUD 坐标卡片
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

      skillEffects.dispose();
      projectileSystem.dispose();
      combatEffects.dispose();
      botManager.dispose();
      battleAudio.dispose();

      player.dispose();
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, [fireWeapon, reloadWeapon, triggerPlayerHurt, castSandboxSkill, triggerHitmarker]);

  // 武器套件切换
  const handleSuiteChange = async (suiteId: string) => {
    setActiveSuiteId(suiteId);
    activeSuiteIdRef.current = suiteId;
    setSelectedWeaponSkinId('');
    selectedWeaponSkinIdRef.current = '';
    setActionOption('auto');
    const player = playerRef.current;
    if (!player) return;

    const suite = WEAPON_SUITES.find(s => s.id === suiteId);
    if (!suite) return;

    const prof = getWeaponCombatProfile(suite.id);
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
      suite.parts ? player.equipWeaponParts(suite.parts, 0, suite.id) : Promise.resolve([])
    ]);

    setAvailableActions(Object.keys(suite.actions));
    setStatus(`已成功装备: ${suite.name} (弹药: ${prof.magCapacity})`);
  };

  // 484 把原版武器全量模型库任意切换
  const handleWeaponSkinChange = async (weaponId: string) => {
    if (!weaponId) {
      await handleSuiteChange(activeSuiteIdRef.current);
      return;
    }
    const weapon: CreationWeapon | undefined = lobbyAssetsRef.current?.weapons[weaponId];
    const player = playerRef.current;
    if (!weapon || !player) return;

    setSelectedWeaponSkinId(weaponId);
    selectedWeaponSkinIdRef.current = weaponId;
    const matchedSuite = getWeaponActionSuite(weapon.id);
    setActiveSuiteId(matchedSuite.id);
    activeSuiteIdRef.current = matchedSuite.id;
    setActionOption('auto');

    const prof = getWeaponCombatProfile(weapon.id);
    setCurrentMagAmmo(prof.magCapacity);
    currentMagAmmoRef.current = prof.magCapacity;
    setReserveAmmo(prof.magCapacity * 4);
    reserveAmmoRef.current = prof.magCapacity * 4;
    setIsReloading(false);
    isReloadingRef.current = false;

    setStatus(`正在挂载原版武器模型: ${weapon.label} (${weapon.id})...`);
    player.clearWeapons();

    const mappedParts = (weapon.parts || []).map(p => ({
      model: assetUrl(p.model),
      texture: p.texture ? assetUrl(p.texture) : null,
      bone: p.bone
    }));

    await Promise.all([
      player.loadAnimations(matchedSuite.actions),
      player.equipWeaponParts(mappedParts, 0, weapon.id)
    ]);

    setAvailableActions(Object.keys(matchedSuite.actions));
    setStatus(`✅ 已装备原版武器: ${weapon.label} [${weapon.id}]`);
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
  const triggerDamage = () => triggerPlayerHurt(600);
  const triggerRevive = () => {
    playerRef.current?.revive(maxHealthRef.current);
    setHealth(maxHealthRef.current);
  };

  useEffect(() => {
    if (skeletonHelperRef.current) skeletonHelperRef.current.visible = showSkeleton;
  }, [showSkeleton]);

  useEffect(() => {
    if (modelRef.current) modelRef.current.visible = showMesh;
  }, [showMesh]);

  useEffect(() => {
    playerRef.current?.setHitboxVisible(showHitbox);
    botManagerRef.current?.setHitboxVisible(showHitbox);
  }, [showHitbox]);

  useEffect(() => {
    if (playerRef.current) playerRef.current.godMode = godMode;
  }, [godMode]);

  useEffect(() => {
    if (botManagerRef.current) botManagerRef.current.autoRespawn = autoRespawnBots;
  }, [autoRespawnBots]);

  const activeProfile = getWeaponCombatProfile(activeSuiteId);

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

      {/* 底部中央：职业主动技能快捷栏 (1~4 键) */}
      {activeSkillsUI.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '10px',
          background: 'rgba(15, 23, 42, 0.92)',
          padding: '10px 14px',
          borderRadius: '12px',
          border: '1px solid #334155',
          backdropFilter: 'blur(8px)',
          zIndex: 10
        }}>
          {activeSkillsUI.map((load, idx) => {
            const cd = skillCooldowns[idx] ?? 0;
            return (
              <button
                key={load.skill.id}
                onClick={() => castSandboxSkill(idx)}
                title={`按数字键 ${idx + 1} 释放: ${load.skill.name} (Lv.${load.level})`}
                style={{
                  position: 'relative',
                  width: '54px',
                  height: '54px',
                  borderRadius: '8px',
                  border: cd > 0 ? '1px solid #475569' : '1px solid #38bdf8',
                  background: '#1e293b',
                  cursor: 'pointer',
                  padding: 0,
                  overflow: 'hidden'
                }}>
                <img
                  src={`${LOBBY_ASSET_BASE}${load.skill.icon}`}
                  alt={load.skill.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: cd > 0 ? 0.4 : 1 }}
                />
                <span style={{
                  position: 'absolute', top: 2, left: 4, fontSize: '10px',
                  fontWeight: 'bold', color: '#f8fafc', textShadow: '0 1px 2px #000'
                }}>
                  {idx + 1}
                </span>
                <span style={{
                  position: 'absolute', bottom: 2, left: 0, right: 0, fontSize: '9px',
                  color: '#e2e8f0', background: 'rgba(15,23,42,0.75)', textAlign: 'center'
                }}>
                  {load.skill.name}
                </span>
                {cd > 0 && (
                  <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.72)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fbbf24', fontWeight: 'bold', fontSize: '14px'
                  }}>
                    {Math.ceil(cd)}s
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

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
              / {infiniteAmmo ? '∞' : reserveAmmo}
            </span>
          )}
        </div>

        {isReloading && (
          <div style={{ width: '100%', height: '4px', background: '#334155', borderRadius: '2px', overflow: 'hidden', marginBottom: '6px' }}>
            <div style={{ width: `${reloadProgress * 100}%`, height: '100%', background: '#f59e0b', transition: 'width 0.05s linear' }} />
          </div>
        )}

        <div style={{ fontSize: '10px', color: '#64748b', display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <span><b>左键 / J</b> 开火</span>
          <span><b>R</b> 换弹</span>
          <span><b>1~4</b> 技能</span>
        </div>
      </div>

      {/* 左侧主要控制调试面板 */}
      <div style={{
        position: 'absolute', top: 20, left: 20, 
        background: 'rgba(15, 23, 42, 0.94)', color: '#f8fafc',
        padding: '18px', borderRadius: '12px', 
        fontFamily: 'sans-serif', width: '340px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
        border: '1px solid #334155',
        backdropFilter: 'blur(8px)',
        maxHeight: '90vh',
        overflowY: 'auto',
        zIndex: 10
      }}>
        <h3 style={{ margin: '0 0 12px 0', borderBottom: '1px solid #334155', paddingBottom: '8px', color: '#37f4d3', fontSize: '15px' }}>
          🎮 全功能战斗沙盒 (与正式战场同源)
        </h3>

        {/* 1. 相机视图模式切换 */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#cbd5e1' }}>
            🎥 摄像机控制模式：
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => {
                setCameraMode('orbit');
                cameraModeRef.current = 'orbit';
                playerRef.current?.setAimAtCrosshair(false);
                document.exitPointerLock?.();
              }}
              style={{
                flex: 1, padding: '6px 0',
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
                playerRef.current?.setAimAtCrosshair(true);
              }}
              style={{
                flex: 1, padding: '6px 0',
                background: cameraMode === 'tps' ? '#0284c7' : '#1e293b',
                color: cameraMode === 'tps' ? '#ffffff' : '#94a3b8',
                border: `1px solid ${cameraMode === 'tps' ? '#38bdf8' : '#475569'}`,
                borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
              }}>
              🎯 越肩视角 (TPS 跟随)
            </button>
          </div>
        </div>

        {/* 2. 角色职业与性别切换 */}
        <div style={{ marginBottom: '10px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#cbd5e1' }}>
              🎭 角色职业 (含专属技能)：
            </label>
            <select
              value={selectedJobId}
              onChange={e => handleAvatarChange(e.target.value as CreationJob, selectedGender)}
              style={{ width: '100%', padding: '6px 8px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '6px', fontSize: '12px' }}>
              {(Object.keys(CREATION_JOBS) as CreationJob[]).map(jobKey => (
                <option key={jobKey} value={jobKey}>
                  {CREATION_JOBS[jobKey].name} ({jobKey})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#cbd5e1' }}>
              🚻 性别：
            </label>
            <select
              value={selectedGender}
              onChange={e => handleAvatarChange(selectedJobId, Number(e.target.value))}
              style={{ width: '100%', padding: '6px 8px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '6px', fontSize: '12px' }}>
              <option value={0}>男 (Male)</option>
              <option value={1}>女 (Female)</option>
            </select>
          </div>
        </div>

        {/* 2b. 157 款原版造型卡全量皮肤选择 */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#f472b6' }}>
            🃏 157 款原版角色造型卡皮肤库：
          </label>
          <select
            id="avatar-card-select"
            value={selectedAvatarCardId}
            onChange={e => handleAvatarChange(selectedJobId, selectedGender, e.target.value)}
            style={{ width: '100%', padding: '6px 8px', background: '#0f172a', color: 'white', border: '1px solid #ec4899', borderRadius: '6px', fontSize: '12px' }}>
            <option value="default">👤 默认职业基础造型 ({CREATION_JOBS[selectedJobId].name})</option>
            {lobbyAssets?.items
              .filter(item => item.category === 'avatars' && item.avatarCard)
              .map(item => (
                <option key={item.id} value={item.id}>
                  🃏 {item.name} ({item.id})
                </option>
              ))}
          </select>
        </div>

        {/* 3. 战场地图选择与切换 */}
        <div style={{ 
          marginBottom: '12px', 
          background: 'rgba(30, 41, 59, 0.7)', 
          padding: '10px', 
          borderRadius: '10px', 
          border: '1px solid #0284c7' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#38bdf8' }}>
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
            style={{ width: '100%', padding: '7px 10px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '6px', fontSize: '12px', outline: 'none' }}
            value={selectedMapId} 
            onChange={e => switchMap(e.target.value)}>
            <optgroup label="── 🛠️ 创意工坊与沙盒自制地图 ──">
              {getSavedCustomMaps().map(cm => (
                <option key={cm.id} value={cm.id}>
                  🛠️ {cm.name} ({cm.nodes.length}节点)
                </option>
              ))}
            </optgroup>
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

        {/* 4. 武器套件切换 */}
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#cbd5e1' }}>
            🔫 14 类武器家族与动作套件：
          </label>
          <select 
            id="weapon-suite-select"
            style={{ width: '100%', padding: '7px 10px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '6px', fontSize: '12px' }}
            value={activeSuiteId} 
            onChange={e => handleSuiteChange(e.target.value)}>
            {WEAPON_SUITES.map(suite => (
              <option key={suite.id} value={suite.id}>
                {suite.name} {suite.parts ? `(${suite.parts.length}部件)` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* 4b. 484 把原版武器全量模型库任意切换 */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#fbbf24' }}>
            ✨ 484 把原版武器全量模型库 ({lobbyAssets ? Object.keys(lobbyAssets.weapons).length : 484}把)：
          </label>
          <select
            id="weapon-skin-select"
            style={{ width: '100%', padding: '7px 10px', background: '#0f172a', color: 'white', border: '1px solid #f59e0b', borderRadius: '6px', fontSize: '12px' }}
            value={selectedWeaponSkinId}
            onChange={e => handleWeaponSkinChange(e.target.value)}>
            <option value="">🔧 使用当前套件默认武器模型 ({activeSuiteId})</option>
            {lobbyAssets && Object.values(lobbyAssets.weapons).map(w => (
              <option key={w.id} value={w.id}>
                {w.label} [{w.id}]
              </option>
            ))}
          </select>
        </div>

        {/* 5. 动作选项模式 */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#cbd5e1' }}>
            🎬 动作选项 / 运行模式：
          </label>
          <select 
            style={{ width: '100%', padding: '7px 10px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '6px', fontSize: '12px' }}
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

        {/* 6. 动作与战斗测试按钮组 */}
        <div style={{ marginBottom: '12px' }}>
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

        {/* 7. 沙盒规则开关 (无限弹药 / 技能无CD / 无敌 / 自动复活) */}
        <div style={{
          background: '#0f172a', padding: '10px', borderRadius: '8px',
          border: '1px solid #334155', marginBottom: '12px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px'
        }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: infiniteAmmo ? '#38bdf8' : '#cbd5e1' }}>
            <input type="checkbox" checked={infiniteAmmo} onChange={e => setInfiniteAmmo(e.target.checked)} style={{ marginRight: '5px' }} />
            ♾️ 无限弹药
          </label>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: noCooldown ? '#38bdf8' : '#cbd5e1' }}>
            <input type="checkbox" checked={noCooldown} onChange={e => setNoCooldown(e.target.checked)} style={{ marginRight: '5px' }} />
            ⚡ 技能/射速无CD
          </label>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: godMode ? '#4ade80' : '#cbd5e1' }}>
            <input type="checkbox" checked={godMode} onChange={e => setGodMode(e.target.checked)} style={{ marginRight: '5px' }} />
            🛡️ 玩家无敌
          </label>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: autoRespawnBots ? '#fbbf24' : '#cbd5e1' }}>
            <input type="checkbox" checked={autoRespawnBots} onChange={e => setAutoRespawnBots(e.target.checked)} style={{ marginRight: '5px' }} />
            🔄 假人自动复活
          </label>
        </div>

        {/* 8. 实时动作与按键指引 */}
        <div style={{ 
          background: '#0f172a', padding: '10px', borderRadius: '8px', 
          border: '1px solid #334155', marginBottom: '10px' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '12px' }}>
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
          <div style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.5' }}>
            <b>W A S D</b> : 移动 &nbsp;|&nbsp; <b>Space</b> : 跳跃 &nbsp;|&nbsp; <b>Shift</b> : 翻滚<br/>
            <b>左键 / J</b> : 开火/三连击 &nbsp;|&nbsp; <b>右键</b> : 越肩瞄准 &nbsp;|&nbsp; <b>R</b> : 换弹<br/>
            <b>1 ~ 4</b> : 释放职业技能 &nbsp;|&nbsp; <b>P</b> : 复位出生点
          </div>
        </div>
        
        {/* 9. 视图辅助选项 */}
        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', borderTop: '1px solid #334155', paddingTop: '8px' }}>
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

        <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
            <span>玩家生命值 {isStealthed ? '👻(隐身中)' : ''}：</span>
            <span style={{ fontWeight: 'bold', color: health > 1000 ? '#4ade80' : '#ef4444' }}>
              {health} / {maxHealth} {shieldValue > 0 ? `(🛡️+${shieldValue})` : ''}
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
              onChange={e => {
                const m = e.target.value as BotBehaviorMode;
                setGlobalBotMode(m);
                botManagerRef.current?.setAllBotsMode(m);
              }}
              style={{ background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '3px 6px', fontSize: '11px' }}>
              <option value="dummy">静止木桩</option>
              <option value="patrol">随机巡逻</option>
              <option value="chase">主动追击玩家</option>
            </select>
          </div>

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
                        const target = botManagerRef.current?.damageBotById(b.id, 600);
                        if (target) {
                          combatEffectsRef.current?.spawnFloatingDamage(
                            target.entity.modelGroup.position.clone().add(new THREE.Vector3(0, 1.8, 0)),
                            600,
                            false
                          );
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
