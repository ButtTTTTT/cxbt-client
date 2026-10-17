import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ProjectileSubType } from './projectiles';
import type { LoadedSkill } from './skills';

const SKILL_GLTF_LOADER = new GLTFLoader();
const VFX_TEX_LOADER = new THREE.TextureLoader();
const VFX_TEX_CACHE = new Map<string, any>();

function getVfxTex(fileName: string): any {
  let tex = VFX_TEX_CACHE.get(fileName);
  if (!tex) {
    tex = VFX_TEX_LOADER.load(`${import.meta.env.BASE_URL}assets/gameplay/vfx/${fileName}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    VFX_TEX_CACHE.set(fileName, tex);
  }
  return tex;
}

export type SkillTarget = { userId: string; position: any };

export type SkillEffectHost = {
  scene: any;
  /** Live player position; the vector is read, never stored. */
  position: () => any;
  /** Live world position of a specific character skeleton bone (root, chest, back_b, hand_r, hand_l, handweapon_r, head, foot_l, foot_r). */
  getBonePosition?: (boneName: string) => any;
  /** Normalised aim direction. */
  aim: () => any;
  spawnProjectile: (kind: 'arrow' | 'grenade' | 'bullet' | 'rocket', origin: any, aim: any, subType?: ProjectileSubType) => void;
  playSound: (name: string, volume?: number) => void;
  /** Plays authentic AvatarStar_cache character skill animation (stdblast, stdoutcry, stdtread, stdeat, stdcatch, stdtleibao_01_bombon). */
  playSkillAnim?: (animName: string) => void;
  /** Plays weapon attack animation (for rapid volley skills like rain). */
  playAttackAnim?: () => void;
  getMaxHealth: () => number;
  heal: (amount: number) => void;
  hurt: (amount: number) => void;
  enemies: () => SkillTarget[];
  hitEnemy: (userId: string, damage: number) => void;
  knockbackEnemy?: (userId: string, dir: any, distance: number) => void;
  lungeForward?: (distance: number) => void;
  setBerserkScale?: (scale: number) => void;
  onStatusEffect?: (pos: any, label: string, colorHex: string) => void;
  /** Toggles the stealth look on the player avatar. */
  setGhost: (on: boolean) => void;
  log: (message: string) => void;
  onSpurt?: () => void;
  onExplosion?: (point: any, radius: number) => void;
};

export type SkillSnapshot = {
  shield: number;
  shieldMax: number;
  stealth: number;
  speed: number;
  maxHealthScale: number;
  healBuffPct: number;
  overreaction: boolean;
  shieldGuard: boolean;
  activeDebuffCount: number;
};

const SHARED_PLANE_GEOMETRY = new THREE.PlaneGeometry(1, 1);

type VfxParticle = {
  sprite: any;
  vel: any;
  age: number;
  maxAge: number;
  startScale: number;
  endScale: number;
  baseOpacity: number;
  spinSpeed: number;
  followBone?: string;
  boneOffset?: any;
};

type VfxDecalRing = {
  mesh: any;
  life: number;
  max: number;
  startScale: number;
  endScale: number;
  baseOpacity: number;
  spinSpeed: number;
  rise: number;
  followBone?: string;
  yOffset: number;
};

/**
 * 《创想兵团》(Avatar Star) 1:1 复刻全 20 项职业技能 + 6 项远征首领技能 + 骨骼挂点 .vfx 粒子与动作系统
 * 严格对齐 AvatarStar_cache/skill/*.lua、AvatarStar_cache/buff/*.lua 与 AvatarStar_cache/vfx/*.vfx
 */
export function createSkillEffects(host: SkillEffectHost) {
  const slotCooldowns = new Map<number, number>();
  const slotTotals = new Map<number, number>();
  const skillCooldownsById = new Map<string, number>();
  const arrows: { at: number; aim: any; subType?: ProjectileSubType }[] = [];
  const rings: VfxDecalRing[] = [];
  const vfxParticles: VfxParticle[] = [];
  const mines: { mesh: any; point: any; trigger: number; radius: number; damage: number; pulseTimer: number }[] = [];
  const beacons: { mesh: any; point: any; radius: number; perTick: number; left: number; timer: number; vfxTimer: number }[] = [];
  const gasClouds: { mesh: any; point: any; radius: number; damage: number; poisonChance: number; life: number; tickTimer: number; puffTimer: number }[] = [];

  // Enemy status ailments (毒刃 vfx_t_poison / 瘟疫传播 vfx_crossbow_pestilence2 / 生命傀儡 vfx_biochemistry_effect_puppet / 要害虚弱 vfx_s_vitals)
  const poisonedEnemies = new Map<string, { damage: number; left: number; tick: number; vfxTimer: number; mesh: any }>();
  const plaguedEnemies = new Map<string, { damage: number; radius: number; left: number; tick: number; vfxTimer: number; mesh: any }>();
  const puppetEnemies = new Map<string, { recoverPct: number; left: number; mesh: any }>();
  const weakenedEnemies = new Map<string, { left: number; mesh: any }>();

  let shield = 0;
  let shieldMax = 0;
  let shieldTime = 0;
  let stealth = 0;
  let speed = 0;
  let speedTime = 0;
  let maxHealthScale = 1;
  let maxHealthTime = 0;
  let healBuffPct = 0;
  let healBuffTime = 0;
  let overreactionTime = 0;
  let dash = 0;
  let shieldGuard = false;
  let clock = 0;
  let buffParticleTimer = 0;

  const bonePos = (boneName: string): any => {
    if (host.getBonePosition) {
      return host.getBonePosition(boneName);
    }
    const base = host.position().clone();
    if (boneName === 'root') return base;
    if (boneName === 'head') return base.add(new THREE.Vector3(0, 1.55, 0));
    if (boneName === 'chest' || boneName === 'back_b') return base.add(new THREE.Vector3(0, 1.05, 0));
    if (boneName === 'foot_l') return base.add(new THREE.Vector3(0.22, 0.12, 0));
    if (boneName === 'foot_r') return base.add(new THREE.Vector3(-0.22, 0.12, 0));
    if (boneName.includes('l')) return base.add(new THREE.Vector3(0.42, 1.05, 0.25));
    return base.add(new THREE.Vector3(-0.42, 1.05, 0.25));
  };

  // ============================================================================
  // 1:1 骨骼绑定持续性 Buff 视觉组 (取代原简陋的线框二十面体与紫环结)
  // ============================================================================
  const playerAuraGroup = new THREE.Group();
  host.scene.add(playerAuraGroup);

  // [能量盾 / 母体结界] vfx_skill_7_cast_effect.vfx + vfx_halo_defend.vfx + vfx_aureole_defense.vfx
  const energyDomeGroup = new THREE.Group();
  energyDomeGroup.visible = false;
  const domeOuterMat = new THREE.MeshBasicMaterial({
    map: getVfxTex('vfx_protect_cover.png'),
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const domeOuterMesh = new THREE.Mesh(new THREE.SphereGeometry(1.12, 24, 18), domeOuterMat);
  domeOuterMesh.position.y = 1.02;

  const domeInnerMat = new THREE.MeshBasicMaterial({
    map: getVfxTex('vfx_protect_cover5.png'),
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const domeInnerMesh = new THREE.Mesh(new THREE.SphereGeometry(0.98, 20, 16), domeInnerMat);
  domeInnerMesh.position.y = 1.02;

  // Ground defense halo decal (halo_defend.png)
  const domeHaloMat = new THREE.MeshBasicMaterial({
    map: getVfxTex('halo_defend.png'),
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const domeHaloMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), domeHaloMat);
  domeHaloMesh.rotation.x = -Math.PI / 2;
  domeHaloMesh.position.y = 0.08;

  // Orbiting shield runes (vfx_dun01_defense.png from vfx_aureole_defense.vfx)
  const shieldRuneRing = new THREE.Group();
  shieldRuneRing.position.y = 1.05;
  for (let i = 0; i < 4; i++) {
    const runeMat = new THREE.SpriteMaterial({
      map: getVfxTex('vfx_dun01_defense.png'),
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const rune = new THREE.Sprite(runeMat);
    const angle = (i / 4) * Math.PI * 2;
    rune.position.set(Math.cos(angle) * 1.18, 0, Math.sin(angle) * 1.18);
    rune.scale.set(0.52, 0.52, 1);
    shieldRuneRing.add(rune);
  }
  energyDomeGroup.add(domeOuterMesh, domeInnerMesh, domeHaloMesh, shieldRuneRing);
  playerAuraGroup.add(energyDomeGroup);

  // [过激反应 · 生化狂暴] vfx_biochemistry_effect_excite1/2/3.vfx + vfx_biochemistry_effect_excite_scratch.vfx
  const berserkAuraGroup = new THREE.Group();
  berserkAuraGroup.visible = false;
  const berserkGroundMat = new THREE.MeshBasicMaterial({
    map: getVfxTex('vfx_firecircle.2.png'),
    color: 0xc084fc,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const berserkGroundMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.9), berserkGroundMat);
  berserkGroundMesh.rotation.x = -Math.PI / 2;
  berserkGroundMesh.position.y = 0.08;

  const berserkVortexMat = new THREE.MeshBasicMaterial({
    map: getVfxTex('vfx_whirlpool_002.png'),
    color: 0x10b981,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const berserkVortexMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), berserkVortexMat);
  berserkVortexMesh.rotation.x = -Math.PI / 2;
  berserkVortexMesh.position.y = 0.12;

  const berserkCoreSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getVfxTex('vfx_lightning8.png'),
      color: 0xe879f9,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  berserkCoreSprite.position.y = 1.05;
  berserkCoreSprite.scale.set(1.85, 2.1, 1);

  const berserkLeftHandClaw = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getVfxTex('claw_marks102.png'),
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  berserkLeftHandClaw.scale.set(0.75, 0.75, 1);

  const berserkRightHandClaw = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getVfxTex('claw_marks102.png'),
      color: 0xa855f7,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  berserkRightHandClaw.scale.set(0.75, 0.75, 1);

  berserkAuraGroup.add(berserkGroundMesh, berserkVortexMesh, berserkCoreSprite);
  host.scene.add(berserkLeftHandClaw);
  host.scene.add(berserkRightHandClaw);
  berserkLeftHandClaw.visible = false;
  berserkRightHandClaw.visible = false;
  playerAuraGroup.add(berserkAuraGroup);

  // [战术盾牌右键格挡屏障]
  const tacticalShieldMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.98, 0.98, 1.6, 12, 1, true, -Math.PI * 0.42, Math.PI * 0.84),
    new THREE.MeshBasicMaterial({
      map: getVfxTex('vfx_protect_cover3.png'),
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  tacticalShieldMesh.position.y = 1.05;
  tacticalShieldMesh.visible = false;
  playerAuraGroup.add(tacticalShieldMesh);

  // ============================================================================
  // 粒子与贴花生成工具函数 (1:1 复刻 .vfx 发射器)
  // ============================================================================
  const spawnVfxSprite = (opts: {
    tex: string;
    pos: any;
    vel?: any;
    color?: number;
    startScale?: number;
    endScale?: number;
    maxAge?: number;
    opacity?: number;
    spinSpeed?: number;
    additive?: boolean;
    followBone?: string;
    boneOffset?: any;
  }) => {
    const mat = new THREE.SpriteMaterial({
      map: getVfxTex(opts.tex),
      color: opts.color ?? 0xffffff,
      transparent: true,
      opacity: opts.opacity ?? 0.9,
      blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(opts.pos);
    const s0 = opts.startScale ?? 0.6;
    sprite.scale.set(s0, s0, 1);
    host.scene.add(sprite);
    vfxParticles.push({
      sprite,
      vel: opts.vel ? opts.vel.clone() : new THREE.Vector3(0, 0.8, 0),
      age: 0,
      maxAge: opts.maxAge ?? 0.75,
      startScale: s0,
      endScale: opts.endScale ?? s0 * 1.4,
      baseOpacity: opts.opacity ?? 0.9,
      spinSpeed: opts.spinSpeed ?? 0,
      followBone: opts.followBone,
      boneOffset: opts.boneOffset ? opts.boneOffset.clone() : undefined,
    });
  };

  const spawnGroundDecal = (opts: {
    tex: string;
    point: any;
    color?: number;
    startScale?: number;
    endScale?: number;
    duration?: number;
    opacity?: number;
    spinSpeed?: number;
    rise?: number;
    followBone?: string;
    yOffset?: number;
  }) => {
    const mat = new THREE.MeshBasicMaterial({
      map: getVfxTex(opts.tex),
      color: opts.color ?? 0xffffff,
      transparent: true,
      opacity: opts.opacity ?? 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(SHARED_PLANE_GEOMETRY, mat);
    mesh.userData = { sharedGeo: true };
    mesh.rotation.x = -Math.PI / 2;
    const yOff = opts.yOffset ?? 0.1;
    mesh.position.copy(opts.point).add(new THREE.Vector3(0, yOff, 0));
    const s0 = opts.startScale ?? 1.2;
    mesh.scale.setScalar(s0);
    host.scene.add(mesh);
    rings.push({
      mesh,
      life: opts.duration ?? 0.7,
      max: opts.duration ?? 0.7,
      startScale: s0,
      endScale: opts.endScale ?? s0 * 2.2,
      baseOpacity: opts.opacity ?? 0.85,
      spinSpeed: opts.spinSpeed ?? 1.8,
      rise: opts.rise ?? 0,
      followBone: opts.followBone,
      yOffset: yOff,
    });
  };

  const pulse = (point: any, radius: number, color: number, rise = 0, tex = 'vfx_shockwave_08.png') => {
    spawnGroundDecal({
      tex,
      point,
      color,
      startScale: Math.max(0.8, radius * 0.45),
      endScale: Math.max(2.0, radius * 1.95),
      duration: 0.65,
      opacity: 0.82,
      spinSpeed: 1.5,
      rise,
    });
  };

  /**
   * 1:1 复刻 vfx_cross.vfx / vfx_cross_first.vfx / vfx_s_huoli_blue_cross.vfx
   * 使用原版医疗十字贴图 vfx_cross_blue4.png + vfx_glow_3.png + vfx_star3.png 环绕骨骼上升
   */
  const spawnRisingCrosses = (center: any, color: number = 0x4ade80, count = 10, followBone?: string) => {
    // 垂直治疗光柱 (vfx_glow_up3.png)
    spawnVfxSprite({
      tex: 'vfx_glow_up3.png',
      pos: center.clone().add(new THREE.Vector3(0, 1.0, 0)),
      vel: new THREE.Vector3(0, 0.4, 0),
      color,
      startScale: 1.6,
      endScale: 2.3,
      maxAge: 0.65,
      opacity: 0.75,
      followBone,
      boneOffset: new THREE.Vector3(0, 1.0, 0),
    });
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const rad = 0.35 + Math.random() * 0.65;
      const offset = new THREE.Vector3(Math.cos(angle) * rad, 0.35 + (i % 4) * 0.28, Math.sin(angle) * rad);
      spawnVfxSprite({
        tex: i % 3 === 0 ? 'vfx_star3.png' : 'vfx_cross_blue4.png',
        pos: center.clone().add(offset),
        vel: new THREE.Vector3(Math.cos(angle) * 0.25, 1.55 + Math.random() * 0.7, Math.sin(angle) * 0.25),
        color,
        startScale: 0.34 + Math.random() * 0.16,
        endScale: 0.12,
        maxAge: 0.85 + Math.random() * 0.35,
        opacity: 0.95,
      });
    }
  };

  const target = (range: number) => host.position().clone().addScaledVector(host.aim(), range);

  const detach = (mesh: any, disposeGeo: boolean) => {
    if (!mesh) return;
    host.scene.remove(mesh);
    mesh.traverse?.((c: any) => {
      if (c.isMesh || c.isSprite) {
        if (disposeGeo && c.geometry && !c.userData?.sharedGeo) {
          c.geometry.dispose?.();
        }
        if (Array.isArray(c.material)) {
          c.material.forEach((m: any) => m?.dispose?.());
        } else {
          c.material?.dispose?.();
        }
      }
    });
  };

  const findEnemyPos = (userId: string): any | null => {
    const found = host.enemies().find((e) => e.userId === userId);
    return found ? found.position : null;
  };

  // ============================================================================
  // 敌方负面状态 (Debuff) 1:1 .vfx 挂点特效
  // ============================================================================

  /** 1:1 复刻 buff/7.lua (vfx_t_poison.vfx: vfx_smoke7 + vfx_bio1) */
  const inflictPoison = (userId: string, damagePerTick = 110, duration = 12) => {
    const pos = findEnemyPos(userId);
    let existing = poisonedEnemies.get(userId);
    if (!existing) {
      const group = new THREE.Group();
      const bioSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getVfxTex('vfx_bio1.png'),
          color: 0x4ade80,
          transparent: true,
          opacity: 0.92,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      bioSprite.scale.set(0.85, 0.85, 1);
      bioSprite.position.y = 1.1;

      const smokeRing = new THREE.Mesh(
        SHARED_PLANE_GEOMETRY,
        new THREE.MeshBasicMaterial({
          map: getVfxTex('vfx_poison.png'),
          color: 0x22c55e,
          transparent: true,
          opacity: 0.78,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      smokeRing.userData = { sharedGeo: true };
      smokeRing.rotation.x = -Math.PI / 2;
      smokeRing.scale.setScalar(1.35);
      smokeRing.position.y = 0.15;

      group.add(bioSprite, smokeRing);
      if (pos) group.position.copy(pos);
      host.scene.add(group);
      existing = { damage: damagePerTick, left: duration, tick: 1.8, vfxTimer: 0.1, mesh: group };
      poisonedEnemies.set(userId, existing);
      if (pos) host.onStatusEffect?.(pos, '☠️ 毒刃剧毒!', '#4ade80');
    } else {
      existing.left = Math.max(existing.left, duration);
      existing.damage = Math.max(existing.damage, damagePerTick);
    }
  };

  /** 1:1 复刻 buff/66.lua (vfx_crossbow_pestilence2.vfx: vfx_whirlpool_002 + vfx_noise_fractal) */
  const inflictPlague = (userId: string, damagePerTick = 110, radius = 5) => {
    const pos = findEnemyPos(userId);
    let existing = plaguedEnemies.get(userId);
    if (!existing) {
      const group = new THREE.Group();
      const whirlpool = new THREE.Mesh(
        SHARED_PLANE_GEOMETRY,
        new THREE.MeshBasicMaterial({
          map: getVfxTex('vfx_whirlpool_002.png'),
          color: 0x10b981,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      whirlpool.userData = { sharedGeo: true };
      whirlpool.rotation.x = -Math.PI / 2;
      whirlpool.scale.setScalar(1.9);
      whirlpool.position.y = 0.18;

      const sporeAura = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getVfxTex('vfx_noise_fractal.png'),
          color: 0xa855f7,
          transparent: true,
          opacity: 0.78,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      sporeAura.scale.set(1.35, 1.35, 1);
      sporeAura.position.y = 1.05;

      group.add(whirlpool, sporeAura);
      if (pos) group.position.copy(pos);
      host.scene.add(group);
      existing = { damage: damagePerTick, radius, left: 12, tick: 2.0, vfxTimer: 0.15, mesh: group };
      plaguedEnemies.set(userId, existing);
      if (pos) host.onStatusEffect?.(pos, '🦠 瘟疫感染!', '#34d399');
    } else {
      existing.left = 12;
      existing.damage = Math.max(existing.damage, damagePerTick);
    }
  };

  /** 1:1 复刻 buff/64.lua (vfx_biochemistry_effect_puppet.vfx: puppet_202.png + vfx_glow.png) */
  const inflictPuppet = (userId: string, recoverPct = 15) => {
    const pos = findEnemyPos(userId);
    let existing = puppetEnemies.get(userId);
    if (!existing) {
      const group = new THREE.Group();
      const puppetSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getVfxTex('puppet_202.png'),
          color: 0xfb7185,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      puppetSprite.scale.set(0.95, 0.95, 1);

      const glowSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getVfxTex('vfx_glow_9.png'),
          color: 0xf43f5e,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      glowSprite.scale.set(1.4, 1.4, 1);
      group.add(glowSprite, puppetSprite);
      if (pos) group.position.copy(pos).add(new THREE.Vector3(0, 2.25, 0));
      host.scene.add(group);
      existing = { recoverPct, left: 10, mesh: group };
      puppetEnemies.set(userId, existing);
      if (pos) host.onStatusEffect?.(pos, '🩸 生命傀儡!', '#fb7185');
    } else {
      existing.left = 10;
      existing.recoverPct = Math.max(existing.recoverPct, recoverPct);
    }
  };

  /** 1:1 复刻 buff/27.lua (vfx_s_vitals.vfx: vfx_bonemask2.png + vfx_glow.png) */
  const inflictWeakness = (userId: string, duration = 3) => {
    const pos = findEnemyPos(userId);
    let existing = weakenedEnemies.get(userId);
    if (!existing) {
      const group = new THREE.Group();
      const boneMark = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getVfxTex('vfx_bonemask2.png'),
          color: 0xe879f9,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      boneMark.scale.set(0.88, 0.88, 1);

      const ringDecal = new THREE.Mesh(
        SHARED_PLANE_GEOMETRY,
        new THREE.MeshBasicMaterial({
          map: getVfxTex('vfx_circle_2.png'),
          color: 0xc084fc,
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      ringDecal.userData = { sharedGeo: true };
      ringDecal.rotation.x = -Math.PI / 2;
      ringDecal.scale.setScalar(1.25);
      ringDecal.position.y = -1.9;

      group.add(boneMark, ringDecal);
      if (pos) group.position.copy(pos).add(new THREE.Vector3(0, 2.1, 0));
      host.scene.add(group);
      existing = { left: duration, mesh: group };
      weakenedEnemies.set(userId, existing);
      if (pos) host.onStatusEffect?.(pos, '💔 要害虚弱 (+35%伤)!', '#e879f9');
    } else {
      existing.left = Math.max(existing.left, duration);
    }
  };

  /** 1:1 复刻 vfx_grenade_explosion_poison.vfx (vfx_smoke3 + vfx_protect_cover3 + vfx_lightning6 + vfx_bio1) */
  const spawnToxicGasCloud = (point: any, radius = 5.5, damage = 140, poisonChance = 30) => {
    const group = new THREE.Group();
    const groundPool = new THREE.Mesh(
      SHARED_PLANE_GEOMETRY,
      new THREE.MeshBasicMaterial({
        map: getVfxTex('vfx_protect_cover3.png'),
        color: 0x10b981,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    groundPool.userData = { sharedGeo: true };
    groundPool.rotation.x = -Math.PI / 2;
    groundPool.scale.setScalar(radius * 1.45);
    groundPool.position.y = 0.12;

    const vortexPool = new THREE.Mesh(
      SHARED_PLANE_GEOMETRY,
      new THREE.MeshBasicMaterial({
        map: getVfxTex('vfx_whirlpool_002.png'),
        color: 0x4ade80,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    vortexPool.userData = { sharedGeo: true };
    vortexPool.rotation.x = -Math.PI / 2;
    vortexPool.scale.setScalar(radius * 1.2);
    vortexPool.position.y = 0.16;

    group.add(groundPool, vortexPool);
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      const dist = (i % 2 === 0 ? 0.25 : 0.52) * radius;
      const smokeSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getVfxTex(i % 2 === 0 ? 'vfx_smoke3.png' : 'vfx_smoke7.png'),
          color: i % 3 === 0 ? 0x34d399 : 0x22c55e,
          transparent: true,
          opacity: 0.52,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      smokeSprite.position.set(Math.cos(angle) * dist, 0.75 + (i % 3) * 0.35, Math.sin(angle) * dist);
      smokeSprite.scale.set(radius * 0.65, radius * 0.65, 1);
      group.add(smokeSprite);
    }

    group.position.copy(point);
    host.scene.add(group);
    gasClouds.push({ mesh: group, point: point.clone(), radius, damage, poisonChance, life: 8.0, tickTimer: 0.2, puffTimer: 0.1 });
    host.onStatusEffect?.(point, '☣️ 剧毒雾区!', '#34d399');
  };

  /** Stealth drops as soon as the player attacks or casts again (triggers vfx_t_hiding_end.vfx). */
  const breakStealth = (): boolean => {
    if (stealth > 0) {
      stealth = 0;
      host.setGhost(false);
      const chestPos = bonePos('chest');
      spawnGroundDecal({
        tex: 'vfx_circle_white.png',
        point: host.position(),
        color: 0xa78bfa,
        startScale: 0.8,
        endScale: 3.2,
        duration: 0.45,
        opacity: 0.8,
      });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        spawnVfxSprite({
          tex: i % 2 === 0 ? 'vfx_cloud.png' : 'vfx_glow_purple.png',
          pos: chestPos.clone(),
          vel: new THREE.Vector3(Math.cos(a) * 1.4, 0.6, Math.sin(a) * 1.4),
          color: 0xc084fc,
          startScale: 0.75,
          endScale: 1.5,
          maxAge: 0.5,
          opacity: 0.8,
        });
      }
      return true;
    }
    return false;
  };

  const release = () => {
    for (const ring of rings) detach(ring.mesh, false);
    rings.length = 0;
    for (const p of vfxParticles) detach(p.sprite, false);
    vfxParticles.length = 0;
    for (const mine of mines) detach(mine.mesh, true);
    mines.length = 0;
    for (const beacon of beacons) detach(beacon.mesh, true);
    beacons.length = 0;
    for (const cloud of gasClouds) detach(cloud.mesh, false);
    gasClouds.length = 0;
    for (const entry of poisonedEnemies.values()) detach(entry.mesh, false);
    poisonedEnemies.clear();
    for (const entry of plaguedEnemies.values()) detach(entry.mesh, false);
    plaguedEnemies.clear();
    for (const entry of puppetEnemies.values()) detach(entry.mesh, false);
    puppetEnemies.clear();
    for (const entry of weakenedEnemies.values()) detach(entry.mesh, false);
    weakenedEnemies.clear();
    host.scene.remove(playerAuraGroup);
    host.scene.remove(berserkLeftHandClaw);
    host.scene.remove(berserkRightHandClaw);
  };

  const applyEffectiveHeal = (rawAmount: number) => {
    const mult = 1 + healBuffPct / 100;
    host.heal(Math.round(rawAmount * mult));
  };

  // ============================================================================
  // 主动技能 & 远征首领技能 1:1 骨骼动作绑定 + 原版 .vfx 视觉释放
  // ============================================================================
  const executeSkillEffect = (load: LoadedSkill) => {
    const p = load.params;
    const id = load.skill.id;
    const optional = (value: number | undefined, fallback: number) => (value === undefined ? fallback : value);
    const rootPos = host.position();
    const chestPos = bonePos('chest');
    const handRPos = bonePos('hand_r');
    const headPos = bonePos('head');

    switch (id) {
      case 'cure': {
        // 战场急救: skill/cure.lua + vfx_skill_1_cast_effect.vfx + vfx_cross_first.vfx + vfx_aureole.vfx
        host.playSkillAnim?.('stdblast');
        const heal = optional(p.heal, 600);
        const rad = optional(p.radius, 8);
        applyEffectiveHeal(heal);
        spawnGroundDecal({
          tex: 'halo_life.png',
          point: rootPos,
          color: 0x4ade80,
          startScale: 1.5,
          endScale: rad * 1.6,
          duration: 0.85,
          opacity: 0.92,
          spinSpeed: 2.2,
          followBone: 'root',
        });
        spawnGroundDecal({
          tex: 'vfx_anim_ripples2.png',
          point: rootPos,
          color: 0x38bdf8,
          startScale: 1.0,
          endScale: rad * 1.85,
          duration: 0.7,
          opacity: 0.85,
          spinSpeed: -1.8,
        });
        spawnVfxSprite({
          tex: 'vfx_glow_3.png',
          pos: chestPos,
          vel: new THREE.Vector3(0, 0.2, 0),
          color: 0x4ade80,
          startScale: 1.4,
          endScale: 2.8,
          maxAge: 0.55,
          opacity: 0.9,
          followBone: 'chest',
        });
        spawnRisingCrosses(rootPos, 0x4ade80, 12, 'root');
        host.onStatusEffect?.(rootPos, `💚 战场急救 +${heal}`, '#4ade80');
        break;
      }
      case 'shock': {
        // 冲击波: skill/shock.lua (vfx_skill_19_cast_effect.vfx) + buff/4.lua (vfx_s_shock_receive.vfx)
        host.playSkillAnim?.('stdblast');
        const radius = optional(p.radius, 6);
        const damage = Math.round(optional(p.energy, 12) * 28);
        spawnGroundDecal({
          tex: 'vfx_protect_cover4.png',
          point: rootPos,
          color: 0x38bdf8,
          startScale: 1.2,
          endScale: radius * 2.2,
          duration: 0.6,
          opacity: 0.92,
          spinSpeed: 3.2,
        });
        spawnGroundDecal({
          tex: 'vfx_shockwave_08.png',
          point: rootPos,
          color: 0xfacc15,
          startScale: 0.9,
          endScale: radius * 2.5,
          duration: 0.55,
          opacity: 0.88,
          spinSpeed: -2.5,
          yOffset: 0.25,
        });
        // 胸口与双手高压雷电脉冲 (vfx_lighting.png)
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          spawnVfxSprite({
            tex: i % 2 === 0 ? 'vfx_lighting.png' : 'vfx_lightning6.png',
            pos: chestPos,
            vel: new THREE.Vector3(Math.cos(a) * radius * 1.1, 0.3, Math.sin(a) * radius * 1.1),
            color: i % 2 === 0 ? 0x38bdf8 : 0xfef08a,
            startScale: 0.95,
            endScale: 1.85,
            maxAge: 0.45,
            opacity: 0.95,
            spinSpeed: (i % 2 === 0 ? 1 : -1) * 6,
          });
        }
        host.onStatusEffect?.(rootPos, '🌊 冲击波震退!', '#38bdf8');
        for (const enemy of host.enemies()) {
          const dist = enemy.position.distanceTo(rootPos);
          if (dist <= radius) {
            host.hitEnemy(enemy.userId, damage);
            const pushDir = enemy.position.clone().sub(rootPos).setY(0).normalize();
            host.knockbackEnemy?.(enemy.userId, pushDir, Math.max(2.8, (radius - dist) * 0.9));
            // vfx_s_shock_receive.vfx on hit target
            spawnGroundDecal({
              tex: 'vfx_circle_wave.png',
              point: enemy.position,
              color: 0x38bdf8,
              startScale: 0.6,
              endScale: 2.6,
              duration: 0.45,
              opacity: 0.9,
              yOffset: 0.9,
            });
          }
        }
        break;
      }
      case 'rain': {
        // 箭雨: skill/rain.lua + buff/3.lua + vfx_s_crossbow_glow.vfx + vfx_s_crossbow_trail.vfx
        host.playAttackAnim?.();
        const count = Math.max(2, Math.round(optional(p.arrows, 3)));
        spawnGroundDecal({
          tex: 'vfx_whirlpool_002.png',
          point: rootPos,
          color: 0x38bdf8,
          startScale: 1.2,
          endScale: 3.4,
          duration: 0.65,
          opacity: 0.85,
          spinSpeed: 4.0,
          followBone: 'root',
        });
        // 右手武器骨骼蓄力星芒 (handweapon_r -> vfx_radial_flare_05.png)
        spawnVfxSprite({
          tex: 'vfx_radial_flare_05.png',
          pos: bonePos('handweapon_r'),
          vel: new THREE.Vector3(0, 0, 0),
          color: 0x38bdf8,
          startScale: 1.35,
          endScale: 0.3,
          maxAge: 0.6,
          opacity: 0.95,
          spinSpeed: 5.0,
          followBone: 'handweapon_r',
        });
        host.onStatusEffect?.(rootPos, `🏹 箭雨连射 x${count}!`, '#38bdf8');
        for (let index = 0; index < count; index += 1) {
          arrows.push({ at: clock + index * 0.085, aim: host.aim().clone() });
        }
        break;
      }
      case 'energy': {
        // 活力振荡器: skill/energy.lua + energy.mesh.glb + vfx_b2_energyjar.vfx + vfx_halo_life.vfx
        host.playSkillAnim?.('stdtleibao_01_bombon');
        spawnVfxSprite({
          tex: 'vfx_b2_energyjar.png',
          pos: handRPos,
          vel: host.aim().clone().multiplyScalar(4.0).add(new THREE.Vector3(0, 1.5, 0)),
          color: 0x4ade80,
          startScale: 0.7,
          endScale: 1.2,
          maxAge: 0.35,
          opacity: 0.95,
        });
        const point = target(6.5);
        point.y = rootPos.y;
        const rad = optional(p.radius, 5);
        const group = new THREE.Group();

        // Ground halo_life.png matrix
        const haloDecal = new THREE.Mesh(
          SHARED_PLANE_GEOMETRY,
          new THREE.MeshBasicMaterial({
            map: getVfxTex('halo_life.png'),
            color: 0x4ade80,
            transparent: true,
            opacity: 0.88,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        haloDecal.userData = { sharedGeo: true };
        haloDecal.rotation.x = -Math.PI / 2;
        haloDecal.position.y = 0.08;
        haloDecal.scale.setScalar(rad * 1.55);

        // Inner rotating vfx_firecircle.1.png
        const innerRing = new THREE.Mesh(
          SHARED_PLANE_GEOMETRY,
          new THREE.MeshBasicMaterial({
            map: getVfxTex('vfx_firecircle.1.png'),
            color: 0x10b981,
            transparent: true,
            opacity: 0.78,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        innerRing.userData = { sharedGeo: true };
        innerRing.rotation.x = -Math.PI / 2;
        innerRing.position.y = 0.12;
        innerRing.scale.setScalar(2.2);

        // Energy pillar glow (vfx_glow_up7.png)
        const pillarSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: getVfxTex('vfx_glow_up7.png'),
            color: 0x34d399,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        pillarSprite.position.y = 1.25;
        pillarSprite.scale.set(1.6, 2.4, 1);

        group.add(haloDecal, innerRing, pillarSprite);
        SKILL_GLTF_LOADER.load(
          `${import.meta.env.BASE_URL}assets/gameplay/mesh/prop/energy/energy.mesh.glb`,
          (gltf) => {
            gltf.scene.scale.setScalar(1.15);
            group.add(gltf.scene);
          },
          undefined,
          () => undefined
        );
        group.position.copy(point);
        host.scene.add(group);
        beacons.push({
          mesh: group,
          point,
          radius: rad,
          perTick: optional(p.healPerTick, 150),
          left: optional(p.healTotal, 3000),
          timer: 0.2,
          vfxTimer: 0.05,
        });
        host.onStatusEffect?.(point, '💊 活力振荡器部署!', '#4ade80');
        break;
      }
      case 'shield': {
        // 能量盾: buff/8.lua (vfx_skill_7_cast_effect.vfx + vfx_halo_defend.vfx)
        host.playSkillAnim?.('stdblast');
        shieldMax = optional(p.shield, 600);
        shield = shieldMax;
        shieldTime = optional(p.duration, 10);
        domeOuterMat.map = getVfxTex('vfx_protect_cover.png');
        domeOuterMat.color.setHex(0x38bdf8);
        domeInnerMat.color.setHex(0x7dd3fc);
        domeHaloMat.color.setHex(0x38bdf8);
        domeOuterMat.needsUpdate = true;
        energyDomeGroup.visible = true;
        spawnGroundDecal({
          tex: 'vfx_shockwave_10.png',
          point: rootPos,
          color: 0x38bdf8,
          startScale: 1.0,
          endScale: 4.5,
          duration: 0.6,
          opacity: 0.9,
          followBone: 'root',
        });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          spawnVfxSprite({
            tex: i % 2 === 0 ? 'vfx_bubble.png' : 'vfx_star3.png',
            pos: chestPos.clone().add(new THREE.Vector3(Math.cos(a) * 0.8, -0.3, Math.sin(a) * 0.8)),
            vel: new THREE.Vector3(Math.cos(a) * 0.3, 1.4, Math.sin(a) * 0.3),
            color: 0x7dd3fc,
            startScale: 0.35,
            endScale: 0.1,
            maxAge: 0.85,
            opacity: 0.9,
          });
        }
        host.onStatusEffect?.(rootPos, `🛡️ 能量盾 +${shieldMax}!`, '#38bdf8');
        break;
      }
      case 'gallop': {
        // 加速: buff/9.lua (vfx_skill_25_cast_effect.vfx + vfx_b2_accelerate.vfx)
        host.playSkillAnim?.('stdoutcry');
        speed = optional(p.speed, 6.2);
        speedTime = optional(p.duration, 5);
        const rad = optional(p.radius, 8);
        spawnGroundDecal({
          tex: 'new_0105.png',
          point: rootPos,
          color: 0xfacc15,
          startScale: 1.2,
          endScale: rad * 1.6,
          duration: 0.65,
          opacity: 0.9,
          spinSpeed: 4.5,
          followBone: 'root',
        });
        spawnVfxSprite({
          tex: 'vfx_glow_4.png',
          pos: chestPos,
          vel: new THREE.Vector3(0, 0.4, 0),
          color: 0xfde047,
          startScale: 1.5,
          endScale: 2.6,
          maxAge: 0.5,
          opacity: 0.88,
          followBone: 'chest',
        });
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          spawnVfxSprite({
            tex: i % 2 === 0 ? 'vfx_spark_golden.png' : 'vfx_cloud.png',
            pos: rootPos.clone().add(new THREE.Vector3(Math.cos(a) * 0.6, 0.25, Math.sin(a) * 0.6)),
            vel: new THREE.Vector3(Math.cos(a) * 1.8, 1.2, Math.sin(a) * 1.8),
            color: 0xfacc15,
            startScale: 0.45,
            endScale: 0.15,
            maxAge: 0.65,
            opacity: 0.9,
          });
        }
        host.onStatusEffect?.(rootPos, '⚡ 加速鼓舞!', '#facc15');
        break;
      }
      case 'conduction': {
        // 生命传导: buff/60,62.lua (vfx_biochemistry_effect_transmission1/2.vfx + vfx_biochemistry_lifebiood.vfx)
        host.playSkillAnim?.('stdoutcry');
        const cost = host.getMaxHealth() * optional(p.selfCost, 10) / 100;
        host.hurt(cost);
        healBuffPct = optional(p.healBuff, 45);
        healBuffTime = 8;
        const baseHeal = cost * optional(p.heal, 80) / 100;
        applyEffectiveHeal(baseHeal + 420);

        spawnGroundDecal({
          tex: 'new_0105.png',
          point: rootPos,
          color: 0x34d399,
          startScale: 1.4,
          endScale: 6.8,
          duration: 0.75,
          opacity: 0.9,
          spinSpeed: 3.5,
          followBone: 'root',
        });
        spawnGroundDecal({
          tex: 'vfx_firecircle.1.png',
          point: rootPos,
          color: 0x10b981,
          startScale: 1.0,
          endScale: 4.8,
          duration: 0.85,
          opacity: 0.85,
          spinSpeed: -2.8,
          followBone: 'root',
        });
        // 双手生化传导星火 (hand_l & hand_r)
        for (const hBone of ['hand_l', 'hand_r']) {
          spawnVfxSprite({
            tex: 'vfx_b2_energyjar.png',
            pos: bonePos(hBone),
            vel: new THREE.Vector3(0, 0.5, 0),
            color: 0x34d399,
            startScale: 0.95,
            endScale: 1.75,
            maxAge: 0.65,
            opacity: 0.95,
            followBone: hBone,
          });
        }
        spawnRisingCrosses(rootPos, 0x34d399, 10, 'root');
        host.onStatusEffect?.(rootPos, `🧬 生命传导 (治疗加成+${healBuffPct}%)!`, '#34d399');
        for (const enemy of host.enemies()) {
          if (enemy.position.distanceTo(rootPos) <= 7) {
            host.hitEnemy(enemy.userId, 260);
            spawnVfxSprite({
              tex: 'vfx_spark_golden.png',
              pos: enemy.position.clone().add(new THREE.Vector3(0, 1.1, 0)),
              vel: chestPos.clone().sub(enemy.position).multiplyScalar(1.8),
              color: 0x34d399,
              startScale: 0.65,
              endScale: 0.2,
              maxAge: 0.5,
              opacity: 0.95,
            });
          }
        }
        break;
      }
      case 'overreaction': {
        // 过激反应: buff/68,73.lua (vfx_biochemistry_effect_excite1/2/3.vfx + excite_scratch.vfx)
        host.playSkillAnim?.('stdoutcry');
        const dur = optional(p.duration, 8);
        speed = optional(p.runSpeed, 6.4);
        speedTime = dur;
        maxHealthScale = 1 + optional(p.maxHealthPct, 32) / 100;
        maxHealthTime = dur;
        overreactionTime = dur;
        berserkAuraGroup.visible = true;
        berserkLeftHandClaw.visible = true;
        berserkRightHandClaw.visible = true;
        host.setBerserkScale?.(1.18);
        spawnGroundDecal({
          tex: 'vfx_firecircle.2.png',
          point: rootPos,
          color: 0xc084fc,
          startScale: 1.2,
          endScale: 5.5,
          duration: 0.7,
          opacity: 0.92,
          spinSpeed: 4.0,
          followBone: 'root',
        });
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          spawnVfxSprite({
            tex: i % 2 === 0 ? 'vfx_lightning8.png' : 'claw_marks102.png',
            pos: chestPos.clone().add(new THREE.Vector3(Math.cos(a) * 0.65, 0, Math.sin(a) * 0.65)),
            vel: new THREE.Vector3(Math.cos(a) * 1.4, 1.3, Math.sin(a) * 1.4),
            color: i % 2 === 0 ? 0xc084fc : 0x34d399,
            startScale: 0.75,
            endScale: 1.35,
            maxAge: 0.65,
            opacity: 0.92,
          });
        }
        host.onStatusEffect?.(rootPos, '🧪 过激反应 · 生化狂暴!', '#c084fc');
        break;
      }
      case 'latent': {
        // 潜行: skill/latent.lua (vfx_skill_13_cast_effect.vfx)
        host.playSkillAnim?.('stdcatch');
        stealth = optional(p.duration, 20);
        host.setGhost(true);
        spawnGroundDecal({
          tex: 'vfx_circle_white.png',
          point: rootPos,
          color: 0xa78bfa,
          startScale: 0.8,
          endScale: 3.6,
          duration: 0.55,
          opacity: 0.85,
          followBone: 'root',
        });
        spawnVfxSprite({
          tex: 'vfx_radial_flare.png',
          pos: chestPos,
          vel: new THREE.Vector3(0, 0.2, 0),
          color: 0xc4b5fd,
          startScale: 1.8,
          endScale: 0.2,
          maxAge: 0.45,
          opacity: 0.95,
          followBone: 'chest',
        });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          spawnVfxSprite({
            tex: i % 2 === 0 ? 'vfx_cloud.png' : 'vfx_glow_purple.png',
            pos: chestPos.clone().add(new THREE.Vector3(Math.cos(a) * 0.4, (i % 3) * 0.2 - 0.2, Math.sin(a) * 0.4)),
            vel: new THREE.Vector3(Math.cos(a) * 1.2, 0.8, Math.sin(a) * 1.2),
            color: 0xa78bfa,
            startScale: 0.75,
            endScale: 1.55,
            maxAge: 0.6,
            opacity: 0.78,
          });
        }
        host.onStatusEffect?.(rootPos, '👤 光学隐形启动!', '#a78bfa');
        break;
      }
      case 'spurt': {
        // 刀锋疾行冲刺: skill/spurt.lua + knives_01-spurt.json
        const startPos = rootPos.clone();
        dash = 0.45;
        speed = 9.2;
        speedTime = Math.max(speedTime, 0.45 + optional(p.sprintDuration, 2));
        host.onSpurt?.();
        host.lungeForward?.(6.0);
        const endPos = host.position().clone();

        // 冲刺路径残影与刀锋破风裂痕 (vfx_shockwave_white.png + claw_marks102.png)
        for (let step = 0; step <= 5; step++) {
          const pLerp = startPos.clone().lerp(endPos, step / 5);
          spawnGroundDecal({
            tex: step % 2 === 0 ? 'vfx_shockwave_white.png' : 'vfx_circle_wave2.png',
            point: pLerp,
            color: 0xfb7185,
            startScale: 0.9,
            endScale: 2.6,
            duration: 0.45 + step * 0.05,
            opacity: 0.85,
            yOffset: 0.85,
          });
          spawnVfxSprite({
            tex: 'claw_marks102.png',
            pos: pLerp.clone().add(new THREE.Vector3(0, 1.05, 0)),
            vel: host.aim().clone().multiplyScalar(2.5),
            color: 0xf43f5e,
            startScale: 0.95,
            endScale: 1.5,
            maxAge: 0.4,
            opacity: 0.9,
          });
        }
        host.onStatusEffect?.(endPos, '⚔️ 刀锋疾风冲刺!', '#fb7185');
        for (const enemy of host.enemies()) {
          if (enemy.position.distanceTo(endPos) <= 4.0 || enemy.position.distanceTo(startPos) <= 3.5) {
            host.hitEnemy(enemy.userId, 360);
            inflictPoison(enemy.userId, 140, 12);
          }
        }
        break;
      }
      case 'snare': {
        // 感应地雷: skill/snare.lua + snare.mesh.glb
        host.playSkillAnim?.('stdtleibao_01_bombon');
        const point = target(4.5);
        point.y = rootPos.y + 0.08;
        const trigRad = optional(p.triggerRadius, 3);
        const mineGroup = new THREE.Group();

        const sensorDecal = new THREE.Mesh(
          SHARED_PLANE_GEOMETRY,
          new THREE.MeshBasicMaterial({
            map: getVfxTex('vfx_circle_2.png'),
            color: 0xef4444,
            transparent: true,
            opacity: 0.78,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        sensorDecal.userData = { sharedGeo: true };
        sensorDecal.rotation.x = -Math.PI / 2;
        sensorDecal.position.y = 0.05;
        sensorDecal.scale.setScalar(trigRad * 1.15);

        const coreGlow = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: getVfxTex('vfx_glow_flare.png'),
            color: 0xff4444,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        coreGlow.position.y = 0.28;
        coreGlow.scale.set(0.65, 0.65, 1);

        mineGroup.add(sensorDecal, coreGlow);
        SKILL_GLTF_LOADER.load(
          `${import.meta.env.BASE_URL}assets/gameplay/mesh/prop/snare/snare.mesh.glb`,
          (gltf) => {
            gltf.scene.scale.setScalar(2.0);
            mineGroup.add(gltf.scene);
          },
          undefined,
          () => undefined
        );
        mineGroup.position.copy(point);
        host.scene.add(mineGroup);
        mines.push({
          mesh: mineGroup,
          point,
          trigger: trigRad,
          radius: optional(p.damageRadius, 8),
          damage: optional(p.damage, 450),
          pulseTimer: 0,
        });
        host.onStatusEffect?.(point, '💣 感应地雷已布设!', '#fbbf24');
        break;
      }
      // ========================================================================
      // 6 项副本首领技能 (AvatarStar_cache/skill/tread, shriek, result, eatfish, bombgoon, wolfdecelerate)
      // ========================================================================
      case 'tread': {
        // 震地践踏: skill/tread.lua -> CastAnimation("stdtread") + vfx_ringleader_tread.vfx
        host.playSkillAnim?.('stdtread');
        const radius = optional(p.radius, 8);
        const damage = optional(p.damage, 580);
        // 地面熔岩震裂贴图 (barbarian_earthquake_cracks_add.png + cracks01_diffuse.png)
        spawnGroundDecal({
          tex: 'barbarian_earthquake_cracks_add.png',
          point: rootPos,
          color: 0xf97316,
          startScale: 2.2,
          endScale: radius * 2.1,
          duration: 1.35,
          opacity: 0.95,
          spinSpeed: 0,
        });
        spawnGroundDecal({
          tex: 'new_0105.png',
          point: rootPos,
          color: 0xef4444,
          startScale: 1.2,
          endScale: radius * 2.3,
          duration: 0.7,
          opacity: 0.9,
          spinSpeed: 2.5,
        });
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const r = 1.2 + (i % 3) * 1.4;
          spawnVfxSprite({
            tex: i % 2 === 0 ? 'vfx_b2_energyjar2.png' : 'vfx_anim_somke_white_01.png',
            pos: rootPos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.35, Math.sin(a) * r)),
            vel: new THREE.Vector3(Math.cos(a) * 1.6, 2.2, Math.sin(a) * 1.6),
            color: i % 2 === 0 ? 0xfb923c : 0xfde047,
            startScale: 0.9,
            endScale: 2.1,
            maxAge: 0.7,
            opacity: 0.9,
          });
        }
        host.onExplosion?.(rootPos, radius * 0.5);
        host.onStatusEffect?.(rootPos, '🌋 首领技 · 震地践踏!', '#fb923c');
        for (const enemy of host.enemies()) {
          const dist = enemy.position.distanceTo(rootPos);
          if (dist <= radius) {
            host.hitEnemy(enemy.userId, damage);
            const pushDir = enemy.position.clone().sub(rootPos).setY(0).normalize();
            host.knockbackEnemy?.(enemy.userId, pushDir, 4.5);
          }
        }
        break;
      }
      case 'shriek': {
        // 刺耳尖叫: skill/shriek.lua -> CastAnimation("stdoutcry") + vfx_gardener_shriek.vfx
        host.playSkillAnim?.('stdoutcry');
        const radius = optional(p.radius, 9);
        const damage = optional(p.damage, 520);
        // 从头部/胸口爆发多层音波环 (vfx_ring.png + vfx_whirlpool_002.png + vfx_protect_cover3.png + aura_light4.png)
        spawnGroundDecal({
          tex: 'vfx_whirlpool_002.png',
          point: rootPos,
          color: 0xc084fc,
          startScale: 1.5,
          endScale: radius * 2.2,
          duration: 0.8,
          opacity: 0.9,
          spinSpeed: 5.2,
          followBone: 'root',
        });
        spawnGroundDecal({
          tex: 'aura_light4.png',
          point: rootPos,
          color: 0x38bdf8,
          startScale: 1.2,
          endScale: radius * 1.9,
          duration: 0.75,
          opacity: 0.85,
          spinSpeed: -3.5,
          yOffset: 1.1,
          followBone: 'head',
        });
        for (let i = 0; i < 6; i++) {
          spawnVfxSprite({
            tex: i % 2 === 0 ? 'vfx_ring.png' : 'vfx_protect_cover3.png',
            pos: headPos,
            vel: new THREE.Vector3(0, 0.25 * i, 0),
            color: i % 2 === 0 ? 0xe879f9 : 0x38bdf8,
            startScale: 0.8 + i * 0.35,
            endScale: 4.2 + i * 0.8,
            maxAge: 0.55 + i * 0.06,
            opacity: 0.85,
            followBone: 'head',
          });
        }
        host.onStatusEffect?.(rootPos, '🔊 首领技 · 刺耳尖叫!', '#e879f9');
        for (const enemy of host.enemies()) {
          if (enemy.position.distanceTo(rootPos) <= radius) {
            host.hitEnemy(enemy.userId, damage);
            inflictWeakness(enemy.userId, 5);
          }
        }
        break;
      }
      case 'result': {
        // 母体结界: skill/result.lua -> CastAnimation("stdblast") + vfx_ringleader_defense.vfx
        host.playSkillAnim?.('stdblast');
        shieldMax = optional(p.shield, 1400);
        shield = shieldMax;
        shieldTime = optional(p.duration, 12);
        domeOuterMat.map = getVfxTex('fx_ciecle_jiejie.png');
        domeOuterMat.color.setHex(0xfbbf24);
        domeInnerMat.color.setHex(0xfde047);
        domeHaloMat.color.setHex(0xf59e0b);
        domeOuterMat.needsUpdate = true;
        energyDomeGroup.visible = true;
        applyEffectiveHeal(optional(p.heal, 400));
        spawnGroundDecal({
          tex: 'vfx_blastwave.png',
          point: rootPos,
          color: 0xfbbf24,
          startScale: 1.4,
          endScale: 6.5,
          duration: 0.75,
          opacity: 0.92,
          followBone: 'root',
        });
        spawnGroundDecal({
          tex: 'vfx_shockwave_11.png',
          point: rootPos,
          color: 0xfde047,
          startScale: 1.0,
          endScale: 5.2,
          duration: 0.65,
          opacity: 0.88,
          followBone: 'root',
        });
        host.onStatusEffect?.(rootPos, '✨ 首领技 · 母体结界 (+1400盾)!', '#fde047');
        break;
      }
      case 'eatfish': {
        // 深海狂怒: skill/eatfish.lua -> CastAnimation("stdeat") + vfx_fisherman_eatfish/2/3.vfx (hand_r, root, back_b)
        host.playSkillAnim?.('stdeat');
        applyEffectiveHeal(optional(p.heal, 850));
        speed = optional(p.speed, 6.5);
        speedTime = optional(p.duration, 8);
        spawnGroundDecal({
          tex: 'vfx_holo_010.png',
          point: rootPos,
          color: 0x2dd4bf,
          startScale: 1.4,
          endScale: 5.2,
          duration: 0.8,
          opacity: 0.92,
          spinSpeed: 3.8,
          followBone: 'root',
        });
        // 右手与胸背深海游鱼图腾 + 雷电活力迸发 (fish_swim_top_atlas.png + vfx_lightning_030.png)
        spawnVfxSprite({
          tex: 'fish_swim_top_atlas.png',
          pos: handRPos,
          vel: new THREE.Vector3(0, 0.8, 0),
          color: 0x2dd4bf,
          startScale: 0.95,
          endScale: 1.65,
          maxAge: 0.75,
          opacity: 0.95,
          followBone: 'hand_r',
        });
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          spawnVfxSprite({
            tex: i % 2 === 0 ? 'vfx_lightning_030.png' : 'vfx_spark_tile.png',
            pos: chestPos,
            vel: new THREE.Vector3(Math.cos(a) * 1.5, 1.4, Math.sin(a) * 1.5),
            color: 0x2dd4bf,
            startScale: 0.75,
            endScale: 1.35,
            maxAge: 0.65,
            opacity: 0.9,
          });
        }
        spawnRisingCrosses(rootPos, 0x2dd4bf, 8, 'root');
        host.onStatusEffect?.(rootPos, '🐟 首领技 · 深海狂怒 (+850HP)!', '#2dd4bf');
        break;
      }
      case 'bombgoon': {
        // 矿工三连爆破: skill/bombgoon.lua -> CastAnimation("stdtleibao_01_bombon") + vfx_skill_spark.vfx (back_b)
        host.playSkillAnim?.('stdtleibao_01_bombon');
        for (const bone of ['back_b', 'hand_r']) {
          spawnVfxSprite({
            tex: 'vfx_spark_center.png',
            pos: bonePos(bone),
            vel: new THREE.Vector3(0, 0.8, 0),
            color: 0xfbbf24,
            startScale: 1.1,
            endScale: 1.9,
            maxAge: 0.55,
            opacity: 0.95,
            spinSpeed: 8.0,
            followBone: bone,
          });
        }
        const muzzle = handRPos.clone();
        const forward = host.aim().clone().normalize();
        const up = new THREE.Vector3(0, 1, 0);
        for (const angle of [-0.18, 0, 0.18]) {
          const dir = forward.clone().applyAxisAngle(up, angle);
          host.spawnProjectile('grenade', muzzle, dir, 'dynamite');
        }
        host.onStatusEffect?.(rootPos, '🧨 首领技 · 矿工三连爆破!', '#f87171');
        break;
      }
      case 'wolfdecelerate': {
        // 狼王嗜血咆哮: skill/wolfdecelerate.lua -> CastAnimation("stdcatch") + vfx_ringleader_frenzy.vfx
        host.playSkillAnim?.('stdcatch');
        const radius = optional(p.radius, 7);
        const damage = optional(p.damage, 640);
        dash = 0.4;
        speed = 8.8;
        speedTime = Math.max(speedTime, 3.0);
        host.lungeForward?.(5.0);
        const landPos = host.position();
        applyEffectiveHeal(optional(p.heal, 320));
        spawnGroundDecal({
          tex: 'vfx_flare02.png',
          point: landPos,
          color: 0xef4444,
          startScale: 1.5,
          endScale: radius * 2.1,
          duration: 0.65,
          opacity: 0.92,
          followBone: 'root',
        });
        for (const hBone of ['hand_l', 'hand_r']) {
          spawnVfxSprite({
            tex: 'claw_marks102.png',
            pos: bonePos(hBone),
            vel: host.aim().clone().multiplyScalar(2.5),
            color: 0xef4444,
            startScale: 1.15,
            endScale: 1.95,
            maxAge: 0.55,
            opacity: 0.95,
            followBone: hBone,
          });
        }
        host.onStatusEffect?.(landPos, '🐺 首领技 · 狼王嗜血咆哮!', '#f87171');
        for (const enemy of host.enemies()) {
          if (enemy.position.distanceTo(landPos) <= radius) {
            host.hitEnemy(enemy.userId, damage);
          }
        }
        break;
      }
      default:
        break;
    }
    host.playSound(`skill-${id}`);
    host.log(`${load.skill.name} Lv${load.level}`);
  };

  const cast = (slot: number, load: LoadedSkill): number | null => {
    if ((slotCooldowns.get(slot) ?? 0) > 0 || (skillCooldownsById.get(load.skill.id) ?? 0) > 0) return null;
    slotCooldowns.set(slot, load.cooldown);
    slotTotals.set(slot, load.cooldown);
    skillCooldownsById.set(load.skill.id, load.cooldown);
    executeSkillEffect(load);
    return load.cooldown;
  };

  /** Allows direct casting from the Class/Boss Skill Bar even if not dragged into a hotbar slot */
  const castDirect = (load: LoadedSkill, matchingHotbarSlot = -1): boolean => {
    if ((skillCooldownsById.get(load.skill.id) ?? 0) > 0) return false;
    skillCooldownsById.set(load.skill.id, load.cooldown);
    if (matchingHotbarSlot >= 0) {
      slotCooldowns.set(matchingHotbarSlot, load.cooldown);
      slotTotals.set(matchingHotbarSlot, load.cooldown);
    }
    executeSkillEffect(load);
    return true;
  };

  const update = (delta: number) => {
    clock += delta;
    buffParticleTimer += delta;
    if (dash > 0) dash = Math.max(0, dash - delta);
    for (const [slot, remaining] of slotCooldowns) {
      const next = remaining - delta;
      if (next <= 0) { slotCooldowns.delete(slot); slotTotals.delete(slot); }
      else slotCooldowns.set(slot, next);
    }
    for (const [id, remaining] of skillCooldownsById) {
      const next = remaining - delta;
      if (next <= 0) skillCooldownsById.delete(id);
      else skillCooldownsById.set(id, next);
    }
    if (shieldTime > 0) {
      shieldTime = Math.max(0, shieldTime - delta);
      if (shieldTime === 0) {
        shield = 0;
        shieldMax = 0;
        energyDomeGroup.visible = false;
      }
    }
    if (speedTime > 0) speedTime = Math.max(0, speedTime - delta);
    if (healBuffTime > 0) {
      healBuffTime = Math.max(0, healBuffTime - delta);
      if (healBuffTime === 0) healBuffPct = 0;
    }
    if (overreactionTime > 0) {
      overreactionTime = Math.max(0, overreactionTime - delta);
      // 过激反应期间接触敌人使其感染“生命傀儡”、“瘟疫”和“中毒”效果
      for (const enemy of host.enemies()) {
        if (enemy.position.distanceTo(host.position()) <= 3.2) {
          inflictPoison(enemy.userId, 110, 8);
          inflictPlague(enemy.userId, 110, 5);
          inflictPuppet(enemy.userId, 20);
        }
      }
      if (overreactionTime === 0) {
        berserkAuraGroup.visible = false;
        berserkLeftHandClaw.visible = false;
        berserkRightHandClaw.visible = false;
        host.setBerserkScale?.(1.0);
      }
    }
    if (maxHealthTime > 0) {
      maxHealthTime = Math.max(0, maxHealthTime - delta);
      if (maxHealthTime === 0) maxHealthScale = 1;
    }
    if (stealth > 0) {
      stealth = Math.max(0, stealth - delta);
      if (stealth === 0) host.setGhost(false);
    }

    // 1:1 实时同步骨骼挂点持续性 Buff 视觉 (root / chest / hand_l / hand_r / foot_l / foot_r)
    const rootPos = host.position();
    playerAuraGroup.position.copy(rootPos);
    if (energyDomeGroup.visible) {
      const chestWorld = bonePos('chest');
      const localChestY = Math.max(0.85, Math.min(1.35, chestWorld.y - rootPos.y));
      domeOuterMesh.position.y = localChestY;
      domeInnerMesh.position.y = localChestY;
      shieldRuneRing.position.y = localChestY;
      domeOuterMesh.rotation.y += delta * 1.4;
      domeInnerMesh.rotation.y -= delta * 2.1;
      domeHaloMesh.rotation.z += delta * 1.2;
      shieldRuneRing.rotation.y += delta * 2.6;
      const pulseScale = 1.0 + Math.sin(clock * 4.5) * 0.04;
      domeOuterMesh.scale.setScalar(pulseScale);
    }
    if (berserkAuraGroup.visible) {
      berserkGroundMesh.rotation.z += delta * 2.6;
      berserkVortexMesh.rotation.z -= delta * 3.8;
      berserkCoreSprite.material.rotation += delta * 4.2;
      berserkLeftHandClaw.position.copy(bonePos('hand_l'));
      berserkRightHandClaw.position.copy(bonePos('hand_r'));
      berserkLeftHandClaw.material.rotation = Math.sin(clock * 8) * 0.6;
      berserkRightHandClaw.material.rotation = -Math.sin(clock * 8) * 0.6;
    }
    if (tacticalShieldMesh.visible) {
      const aim = host.aim();
      tacticalShieldMesh.rotation.y = Math.atan2(aim.x, aim.z);
    }

    // 持续性 Buff 骨骼粒子发射 (加速足底星火 / 潜行暗影微粒 / 过激反应生化电弧 / 生命传导光尘)
    if (buffParticleTimer >= 0.09) {
      buffParticleTimer = 0;
      if (speedTime > 0) {
        const footL = bonePos('foot_l');
        const footR = bonePos('foot_r');
        spawnVfxSprite({
          tex: 'vfx_spark_golden.png',
          pos: (Math.random() > 0.5 ? footL : footR).clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.1, (Math.random() - 0.5) * 0.2)),
          vel: new THREE.Vector3(0, 0.9, 0),
          color: 0xfacc15,
          startScale: 0.35,
          endScale: 0.08,
          maxAge: 0.38,
          opacity: 0.88,
        });
      }
      if (overreactionTime > 0) {
        const cPos = bonePos('chest');
        spawnVfxSprite({
          tex: Math.random() > 0.5 ? 'vfx_anim_smoke_02.png' : 'vfx_lightning8.png',
          pos: cPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.65, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.65)),
          vel: new THREE.Vector3(0, 1.3, 0),
          color: Math.random() > 0.4 ? 0xc084fc : 0x34d399,
          startScale: 0.52,
          endScale: 0.95,
          maxAge: 0.42,
          opacity: 0.78,
          spinSpeed: 4.0,
        });
      }
      if (stealth > 0) {
        const cPos = bonePos('chest');
        spawnVfxSprite({
          tex: 'vfx_glow_purple.png',
          pos: cPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5)),
          vel: new THREE.Vector3(0, 0.5, 0),
          color: 0xa78bfa,
          startScale: 0.32,
          endScale: 0.08,
          maxAge: 0.45,
          opacity: 0.55,
        });
      }
      if (healBuffTime > 0) {
        const cPos = bonePos('chest');
        spawnVfxSprite({
          tex: 'vfx_cross_blue4.png',
          pos: cPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, -0.2, (Math.random() - 0.5) * 0.6)),
          vel: new THREE.Vector3(0, 1.2, 0),
          color: 0x34d399,
          startScale: 0.28,
          endScale: 0.1,
          maxAge: 0.55,
          opacity: 0.85,
        });
      }
    }

    // 箭雨连射队列发射 (带武器挂点光效与攻击动作)
    for (let index = arrows.length - 1; index >= 0; index -= 1) {
      const arrow = arrows[index];
      if (arrow.at > clock) continue;
      const muzzle = bonePos('handweapon_r');
      const spread = arrow.aim.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.05)).normalize();
      host.playAttackAnim?.();
      spawnVfxSprite({
        tex: 'vfx_radial_flare_05.png',
        pos: muzzle,
        vel: spread.clone().multiplyScalar(2.0),
        color: 0x38bdf8,
        startScale: 0.68,
        endScale: 0.15,
        maxAge: 0.25,
        opacity: 0.92,
      });
      host.spawnProjectile('arrow', muzzle, spread, arrow.subType);
      arrows.splice(index, 1);
    }

    // 更新贴花光环 (Decal Rings)
    for (let index = rings.length - 1; index >= 0; index -= 1) {
      const ring = rings[index];
      ring.life -= delta;
      const t = 1 - Math.max(0, ring.life) / ring.max;
      if (ring.followBone) {
        const bp = bonePos(ring.followBone);
        ring.mesh.position.x = bp.x;
        ring.mesh.position.z = bp.z;
      }
      if (ring.rise) {
        ring.mesh.position.y += ring.rise * delta;
      }
      const curScale = ring.startScale + (ring.endScale - ring.startScale) * t;
      ring.mesh.scale.setScalar(curScale);
      if (ring.spinSpeed) {
        ring.mesh.rotation.z += ring.spinSpeed * delta;
      }
      if (ring.mesh.material) {
        ring.mesh.material.opacity = ring.baseOpacity * (1 - t);
      }
      if (ring.life <= 0) {
        detach(ring.mesh, false);
        rings.splice(index, 1);
      }
    }

    // 更新 .vfx 广告牌精灵粒子
    for (let index = vfxParticles.length - 1; index >= 0; index -= 1) {
      const p = vfxParticles[index];
      p.age += delta;
      const t = Math.min(1, p.age / p.maxAge);
      if (p.followBone) {
        const bp = bonePos(p.followBone);
        p.sprite.position.copy(bp);
        if (p.boneOffset) p.sprite.position.add(p.boneOffset);
      } else {
        p.sprite.position.addScaledVector(p.vel, delta);
      }
      const s = p.startScale + (p.endScale - p.startScale) * t;
      p.sprite.scale.set(s, s, 1);
      if (p.spinSpeed && p.sprite.material) {
        p.sprite.material.rotation += p.spinSpeed * delta;
      }
      if (p.sprite.material) {
        p.sprite.material.opacity = p.baseOpacity * (1 - t * t);
      }
      if (p.age >= p.maxAge) {
        detach(p.sprite, false);
        vfxParticles.splice(index, 1);
      }
    }

    // 更新活力振荡器 (Energy Beacons)
    for (let index = beacons.length - 1; index >= 0; index -= 1) {
      const beacon = beacons[index];
      beacon.timer -= delta;
      beacon.vfxTimer -= delta;
      beacon.mesh.rotation.y += delta * 1.8;
      if (beacon.vfxTimer <= 0) {
        beacon.vfxTimer = 0.18;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * beacon.radius * 0.75;
        spawnVfxSprite({
          tex: Math.random() > 0.4 ? 'vfx_cross_blue4.png' : 'vfx_b2_energyjar.png',
          pos: beacon.point.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.25, Math.sin(a) * r)),
          vel: new THREE.Vector3(0, 1.35, 0),
          color: 0x4ade80,
          startScale: 0.34,
          endScale: 0.12,
          maxAge: 0.75,
          opacity: 0.9,
        });
      }
      if (beacon.timer <= 0 && beacon.left > 0) {
        beacon.timer = 2;
        const heal = Math.min(beacon.perTick, beacon.left);
        beacon.left -= heal;
        pulse(beacon.point, beacon.radius, 0x4ade80, 0, 'vfx_shockwave_11.png');
        if (host.position().distanceTo(beacon.point) <= beacon.radius) {
          applyEffectiveHeal(heal);
          spawnRisingCrosses(host.position(), 0x4ade80, 5, 'root');
        }
      }
      if (beacon.left <= 0) { detach(beacon.mesh, true); beacons.splice(index, 1); }
    }

    // 更新感应地雷 (Snare Mines)
    for (let index = mines.length - 1; index >= 0; index -= 1) {
      const mine = mines[index];
      mine.mesh.rotation.y += delta * 2.2;
      mine.pulseTimer += delta;
      const armed = host.enemies().some((enemy) => enemy.position.distanceTo(mine.point) <= mine.trigger);
      if (!armed) continue;
      host.playSound('explosion_trap', 0.75);
      // vfx_skill_sh_selfexplosion.vfx
      spawnGroundDecal({
        tex: 'fx_ciecle_jiejie.png',
        point: mine.point,
        color: 0xffa04d,
        startScale: 1.5,
        endScale: mine.radius * 2.1,
        duration: 0.65,
        opacity: 0.95,
      });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        spawnVfxSprite({
          tex: i % 2 === 0 ? 'vfx_bom3.png' : 'vfx_spark_group.png',
          pos: mine.point.clone().add(new THREE.Vector3(0, 0.4, 0)),
          vel: new THREE.Vector3(Math.cos(a) * 3.2, 2.4 + Math.random() * 1.5, Math.sin(a) * 3.2),
          color: 0xfb923c,
          startScale: 0.95,
          endScale: 2.2,
          maxAge: 0.6,
          opacity: 0.95,
        });
      }
      host.onExplosion?.(mine.point, mine.radius);
      for (const enemy of host.enemies()) {
        if (enemy.position.distanceTo(mine.point) <= mine.radius) host.hitEnemy(enemy.userId, mine.damage);
      }
      detach(mine.mesh, true);
      mines.splice(index, 1);
    }

    // Update lingering GasBomb toxic clouds (毒气弹毒雾 vfx_grenade_explosion_poison.vfx)
    for (let i = gasClouds.length - 1; i >= 0; i -= 1) {
      const cloud = gasClouds[i];
      cloud.life -= delta;
      cloud.tickTimer -= delta;
      cloud.puffTimer -= delta;
      cloud.mesh.rotation.y += delta * 1.1;
      if (cloud.puffTimer <= 0) {
        cloud.puffTimer = 0.22;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * cloud.radius * 0.75;
        spawnVfxSprite({
          tex: Math.random() > 0.4 ? 'vfx_bio1.png' : 'vfx_smoke7.png',
          pos: cloud.point.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.35, Math.sin(a) * r)),
          vel: new THREE.Vector3(0, 1.1, 0),
          color: 0x34d399,
          startScale: 0.55,
          endScale: 1.15,
          maxAge: 0.7,
          opacity: 0.75,
        });
      }
      if (cloud.tickTimer <= 0) {
        cloud.tickTimer = 1.5;
        for (const enemy of host.enemies()) {
          if (enemy.position.distanceTo(cloud.point) <= cloud.radius) {
            host.hitEnemy(enemy.userId, cloud.damage);
            if (Math.random() * 100 < cloud.poisonChance) {
              inflictPoison(enemy.userId, Math.round(cloud.damage * 0.65), 12);
            }
          }
        }
      }
      if (cloud.life <= 0) {
        detach(cloud.mesh, false);
        gasClouds.splice(i, 1);
      }
    }

    // Update Poison DoT on enemies (毒刃 vfx_t_poison.vfx)
    for (const [userId, state] of poisonedEnemies) {
      state.left -= delta;
      state.tick -= delta;
      state.vfxTimer -= delta;
      const pos = findEnemyPos(userId);
      if (pos) {
        state.mesh.position.copy(pos);
        state.mesh.rotation.y += delta * 2.5;
        if (state.vfxTimer <= 0) {
          state.vfxTimer = 0.28;
          spawnVfxSprite({
            tex: 'vfx_smoke7.png',
            pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.9, (Math.random() - 0.5) * 0.4)),
            vel: new THREE.Vector3(0, 1.0, 0),
            color: 0x22c55e,
            startScale: 0.42,
            endScale: 0.85,
            maxAge: 0.55,
            opacity: 0.72,
          });
        }
      }
      if (state.tick <= 0) {
        state.tick = 2.0;
        if (pos) host.hitEnemy(userId, state.damage);
      }
      if (state.left <= 0 || !pos) {
        detach(state.mesh, false);
        poisonedEnemies.delete(userId);
      }
    }

    // Update Plague DoT & Contagion Spread on enemies (瘟疫传播 vfx_crossbow_pestilence2.vfx)
    for (const [userId, state] of plaguedEnemies) {
      state.left -= delta;
      state.tick -= delta;
      state.vfxTimer -= delta;
      const pos = findEnemyPos(userId);
      if (pos) {
        state.mesh.position.copy(pos);
        state.mesh.rotation.y += delta * 3.2;
      }
      if (state.tick <= 0) {
        state.tick = 2.0;
        if (pos) {
          host.hitEnemy(userId, state.damage);
          // 间歇性传染给 5 米范围内的其他目标
          for (const other of host.enemies()) {
            if (other.userId !== userId && !plaguedEnemies.has(other.userId) && other.position.distanceTo(pos) <= state.radius) {
              inflictPlague(other.userId, state.damage, state.radius);
            }
          }
        }
      }
      if (state.left <= 0 || !pos) {
        detach(state.mesh, false);
        plaguedEnemies.delete(userId);
      }
    }

    // Update Life Puppet tethers (生命抽取傀儡 vfx_biochemistry_effect_puppet.vfx)
    for (const [userId, state] of puppetEnemies) {
      state.left -= delta;
      const pos = findEnemyPos(userId);
      if (pos) {
        state.mesh.position.copy(pos).add(new THREE.Vector3(0, 2.25 + Math.sin(clock * 4.5) * 0.1, 0));
      }
      if (state.left <= 0 || !pos) {
        detach(state.mesh, false);
        puppetEnemies.delete(userId);
      }
    }

    // Update Weakness debuff (要害射击虚弱 vfx_s_vitals.vfx)
    for (const [userId, state] of weakenedEnemies) {
      state.left -= delta;
      const pos = findEnemyPos(userId);
      if (pos) {
        state.mesh.position.copy(pos).add(new THREE.Vector3(0, 2.1 + Math.sin(clock * 5) * 0.08, 0));
        state.mesh.rotation.y += delta * 3.0;
      }
      if (state.left <= 0 || !pos) {
        detach(state.mesh, false);
        weakenedEnemies.delete(userId);
      }
    }
  };

  return {
    cast,
    castDirect,
    update,
    breakStealth,
    inflictPoison,
    inflictPlague,
    inflictPuppet,
    inflictWeakness,
    spawnToxicGasCloud,
    /** 1:1 复刻 buff/5.lua (vfx_p_tenacity.vfx: vfx_glow_up3.png) */
    triggerTenacityHealVfx() {
      spawnRisingCrosses(host.position(), 0xfacc15, 6, 'root');
    },
    /** 1:1 复刻 buff/2.lua (vfx_p_transfer_absorb.vfx & vfx_p_transfer_release.vfx) */
    triggerTransferAbsorbVfx() {
      const cPos = bonePos('chest');
      spawnVfxSprite({
        tex: 'vfx_lightning6.png',
        pos: cPos,
        vel: new THREE.Vector3(0, 0.3, 0),
        color: 0xfbbf24,
        startScale: 0.9,
        endScale: 1.4,
        maxAge: 0.35,
        opacity: 0.9,
        followBone: 'chest',
      });
    },
    triggerTransferReleaseVfx(radius = 8) {
      const rPos = host.position();
      spawnGroundDecal({
        tex: 'vfx_shockwave_white.png',
        point: rPos,
        color: 0xf59e0b,
        startScale: 1.2,
        endScale: radius * 2.2,
        duration: 0.65,
        opacity: 0.95,
      });
      spawnGroundDecal({
        tex: 'vfx_protect_cover4.png',
        point: rPos,
        color: 0xfef08a,
        startScale: 1.0,
        endScale: radius * 1.8,
        duration: 0.55,
        opacity: 0.9,
      });
    },
    setShieldGuard(active: boolean) {
      shieldGuard = active;
      tacticalShieldMesh.visible = active;
    },
    setTacticalShieldGuard(active: boolean) {
      shieldGuard = active;
      tacticalShieldMesh.visible = active;
    },
    isShieldGuarding: () => shieldGuard,
    getDamageMultiplier(userId: string): number {
      return weakenedEnemies.has(userId) ? 1.35 : 1.0;
    },
    getVulnerabilityMultiplier(userId: string): number {
      return weakenedEnemies.has(userId) ? 1.35 : 1.0;
    },
    onEnemyDamaged(userId: string, damageDealt: number) {
      const puppet = puppetEnemies.get(userId);
      if (puppet && damageDealt > 0) {
        const recovered = Math.max(1, Math.round(damageDealt * puppet.recoverPct / 100));
        applyEffectiveHeal(recovered);
      }
    },
    cooldownOfSkill: (skillId: string) => skillCooldownsById.get(skillId) ?? 0,
    byId: () => skillCooldownsById,
    resetCooldowns() {
      slotCooldowns.clear();
      slotTotals.clear();
      skillCooldownsById.clear();
    },
    /** Sends damage through the active shield and returns what is left for the health bar. */
    absorb(amount: number) {
      if (shield <= 0) return amount;
      const soaked = Math.min(shield, amount);
      shield -= soaked;
      if (shield <= 0) {
        shield = 0;
        shieldMax = 0;
        shieldTime = 0;
        energyDomeGroup.visible = false;
      }
      return amount - soaked;
    },
    speed(base: number) {
      const boost = speedTime > 0 ? Math.max(speed, dash > 0 ? 9.2 : 0) : (dash > 0 ? 9.2 : 0);
      const guardedBase = shieldGuard ? base * 0.72 : base;
      return Math.max(guardedBase, boost);
    },
    isStealthed: () => stealth > 0,
    bySlot: () => slotCooldowns,
    snapshot: (): SkillSnapshot => ({
      shield,
      shieldMax,
      stealth,
      speed: speedTime > 0 ? speed : 0,
      maxHealthScale,
      healBuffPct,
      overreaction: overreactionTime > 0,
      shieldGuard,
      activeDebuffCount: poisonedEnemies.size + plaguedEnemies.size + puppetEnemies.size + weakenedEnemies.size,
    }),
    dispose() { breakStealth(); release(); }
  };
}
