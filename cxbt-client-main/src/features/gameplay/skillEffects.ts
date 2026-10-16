import * as THREE from 'three';
import type { ProjectileSubType } from './projectiles';
import type { LoadedSkill } from './skills';

export type SkillTarget = { userId: string; position: any };

export type SkillEffectHost = {
  scene: any;
  /** Live player position; the vector is read, never stored. */
  position: () => any;
  /** Normalised aim direction. */
  aim: () => any;
  spawnProjectile: (kind: 'arrow' | 'grenade' | 'bullet' | 'rocket', origin: any, aim: any, subType?: ProjectileSubType) => void;
  playSound: (name: string, volume?: number) => void;
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

const RING_GEOMETRY = new THREE.RingGeometry(0.6, 1, 40);

/**
 * 《创想兵团》(Avatar Star) 全 20 项职业技能 + 6 项远征首领技能 3D 视觉与战斗机制运行时
 */
export function createSkillEffects(host: SkillEffectHost) {
  const slotCooldowns = new Map<number, number>();
  const slotTotals = new Map<number, number>();
  const skillCooldownsById = new Map<string, number>();
  const arrows: { at: number; aim: any; subType?: ProjectileSubType }[] = [];
  const rings: { mesh: any; life: number; max: number; grow: number; rise?: number }[] = [];
  const mines: { mesh: any; point: any; trigger: number; radius: number; damage: number }[] = [];
  const beacons: { mesh: any; point: any; radius: number; perTick: number; left: number; timer: number }[] = [];
  const gasClouds: { mesh: any; point: any; radius: number; damage: number; poisonChance: number; life: number; tickTimer: number }[] = [];

  // Enemy status ailments (毒刃 Poison / 瘟疫传播 Plague / 生命抽取傀儡 Puppet / 要害射击虚弱 Weakness)
  const poisonedEnemies = new Map<string, { damage: number; left: number; tick: number; mesh: any }>();
  const plaguedEnemies = new Map<string, { damage: number; radius: number; left: number; tick: number; mesh: any }>();
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

  // Persistent 3D player aura meshes (能量盾护罩 / 过激反应生化狂暴光环 / 战术盾牌格挡屏障)
  const playerAuraGroup = new THREE.Group();
  host.scene.add(playerAuraGroup);

  const energyDomeMesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.18, 1),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    })
  );
  energyDomeMesh.position.y = 1.0;
  energyDomeMesh.visible = false;
  playerAuraGroup.add(energyDomeMesh);

  const berserkAuraMesh = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.75, 0.06, 36, 8),
    new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.62,
      depthWrite: false
    })
  );
  berserkAuraMesh.position.y = 1.05;
  berserkAuraMesh.visible = false;
  playerAuraGroup.add(berserkAuraMesh);

  const tacticalShieldMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 0.95, 1.55, 6, 1, true, -Math.PI * 0.42, Math.PI * 0.84),
    new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  tacticalShieldMesh.position.y = 1.05;
  tacticalShieldMesh.visible = false;
  playerAuraGroup.add(tacticalShieldMesh);

  const pulse = (point: any, radius: number, color: number, rise = 0) => {
    const mesh = new THREE.Mesh(RING_GEOMETRY, new THREE.MeshBasicMaterial({ color, transparent: true,
      opacity: 0.68, side: THREE.DoubleSide, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(point).add(new THREE.Vector3(0, 0.14, 0));
    mesh.scale.setScalar(Math.max(1, radius / 2));
    host.scene.add(mesh);
    rings.push({ mesh, life: 0.65, max: 0.65, grow: radius, rise });
  };

  const spawnRisingCrosses = (center: any, color: number = 0x4ade80, count = 6) => {
    for (let i = 0; i < count; i++) {
      const cross = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
      const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), mat);
      const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.08), mat);
      cross.add(vBar, hBar);
      const angle = (i / count) * Math.PI * 2;
      cross.position.copy(center).add(new THREE.Vector3(Math.cos(angle) * 0.85, 0.5 + (i % 3) * 0.35, Math.sin(angle) * 0.85));
      host.scene.add(cross);
      rings.push({ mesh: cross, life: 0.75, max: 0.75, grow: 1.2, rise: 1.6 });
    }
  };

  const target = (range: number) => host.position().clone().addScaledVector(host.aim(), range);

  const detach = (mesh: any, geometry: boolean) => {
    if (!mesh) return;
    host.scene.remove(mesh);
    mesh.traverse?.((c: any) => {
      if (c.isMesh) {
        if (geometry) c.geometry?.dispose();
        if (Array.isArray(c.material)) c.material.forEach((m: any) => m?.dispose());
        else c.material?.dispose();
      }
    });
  };

  const findEnemyPos = (userId: string): any | null => {
    const found = host.enemies().find((e) => e.userId === userId);
    return found ? found.position : null;
  };

  const inflictPoison = (userId: string, damagePerTick = 110, duration = 12) => {
    const pos = findEnemyPos(userId);
    let existing = poisonedEnemies.get(userId);
    if (!existing) {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.045, 8, 18),
        new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.85, depthWrite: false })
      );
      mesh.rotation.x = Math.PI / 2;
      if (pos) mesh.position.copy(pos).add(new THREE.Vector3(0, 0.9, 0));
      host.scene.add(mesh);
      existing = { damage: damagePerTick, left: duration, tick: 1.8, mesh };
      poisonedEnemies.set(userId, existing);
      if (pos) host.onStatusEffect?.(pos, '☠️ 毒刃剧毒!', '#4ade80');
    } else {
      existing.left = Math.max(existing.left, duration);
      existing.damage = Math.max(existing.damage, damagePerTick);
    }
  };

  const inflictPlague = (userId: string, damagePerTick = 110, radius = 5) => {
    const pos = findEnemyPos(userId);
    let existing = plaguedEnemies.get(userId);
    if (!existing) {
      const group = new THREE.Group();
      const ring1 = new THREE.Mesh(
        new THREE.TorusGeometry(0.75, 0.05, 8, 20),
        new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.78, depthWrite: false })
      );
      ring1.rotation.x = Math.PI / 2;
      const ring2 = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.04, 8, 16),
        new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.78, depthWrite: false })
      );
      ring2.rotation.x = Math.PI / 3;
      group.add(ring1, ring2);
      if (pos) group.position.copy(pos).add(new THREE.Vector3(0, 1.15, 0));
      host.scene.add(group);
      existing = { damage: damagePerTick, radius, left: 12, tick: 2.0, mesh: group };
      plaguedEnemies.set(userId, existing);
      if (pos) host.onStatusEffect?.(pos, '🦠 瘟疫感染!', '#34d399');
    } else {
      existing.left = 12;
      existing.damage = Math.max(existing.damage, damagePerTick);
    }
  };

  const inflictPuppet = (userId: string, recoverPct = 15) => {
    const pos = findEnemyPos(userId);
    let existing = puppetEnemies.get(userId);
    if (!existing) {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28, 0),
        new THREE.MeshBasicMaterial({ color: 0xf43f5e, wireframe: true, transparent: true, opacity: 0.9 })
      );
      if (pos) mesh.position.copy(pos).add(new THREE.Vector3(0, 2.25, 0));
      host.scene.add(mesh);
      existing = { recoverPct, left: 10, mesh };
      puppetEnemies.set(userId, existing);
      if (pos) host.onStatusEffect?.(pos, '🩸 生命傀儡!', '#fb7185');
    } else {
      existing.left = 10;
      existing.recoverPct = Math.max(existing.recoverPct, recoverPct);
    }
  };

  const inflictWeakness = (userId: string, duration = 3) => {
    const pos = findEnemyPos(userId);
    let existing = weakenedEnemies.get(userId);
    if (!existing) {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.45, 0.05, 6, 12),
        new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.9, depthWrite: false })
      );
      mesh.rotation.x = Math.PI / 2;
      if (pos) mesh.position.copy(pos).add(new THREE.Vector3(0, 2.05, 0));
      host.scene.add(mesh);
      existing = { left: duration, mesh };
      weakenedEnemies.set(userId, existing);
      if (pos) host.onStatusEffect?.(pos, '💔 要害虚弱 (+35%伤)!', '#e879f9');
    } else {
      existing.left = Math.max(existing.left, duration);
    }
  };

  const spawnToxicGasCloud = (point: any, radius = 5.5, damage = 140, poisonChance = 30) => {
    const group = new THREE.Group();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.55, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.34,
        depthWrite: false
      })
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.65, 0.12, 8, 28),
      new THREE.MeshBasicMaterial({
        color: 0x4ade80,
        transparent: true,
        opacity: 0.65,
        depthWrite: false
      })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(dome, ring);
    group.position.copy(point).add(new THREE.Vector3(0, 0.35, 0));
    host.scene.add(group);
    gasClouds.push({ mesh: group, point: point.clone(), radius, damage, poisonChance, life: 8.0, tickTimer: 0.2 });
    host.onStatusEffect?.(point, '☣️ 剧毒雾区!', '#34d399');
  };

  /** Stealth drops as soon as the player attacks or casts again. */
  const breakStealth = (): boolean => {
    if (stealth > 0) {
      stealth = 0;
      host.setGhost(false);
      return true;
    }
    return false;
  };

  const release = () => {
    for (const ring of rings) detach(ring.mesh, true);
    rings.length = 0;
    for (const mine of mines) detach(mine.mesh, true);
    mines.length = 0;
    for (const beacon of beacons) detach(beacon.mesh, true);
    beacons.length = 0;
    for (const cloud of gasClouds) detach(cloud.mesh, true);
    gasClouds.length = 0;
    for (const entry of poisonedEnemies.values()) detach(entry.mesh, true);
    poisonedEnemies.clear();
    for (const entry of plaguedEnemies.values()) detach(entry.mesh, true);
    plaguedEnemies.clear();
    for (const entry of puppetEnemies.values()) detach(entry.mesh, true);
    puppetEnemies.clear();
    for (const entry of weakenedEnemies.values()) detach(entry.mesh, true);
    weakenedEnemies.clear();
    host.scene.remove(playerAuraGroup);
  };

  const applyEffectiveHeal = (rawAmount: number) => {
    const mult = 1 + healBuffPct / 100;
    host.heal(Math.round(rawAmount * mult));
  };

  const executeSkillEffect = (load: LoadedSkill) => {
    const p = load.params;
    const id = load.skill.id;
    const optional = (value: number | undefined, fallback: number) => (value === undefined ? fallback : value);

    switch (id) {
      case 'cure': {
        const heal = optional(p.heal, 600);
        applyEffectiveHeal(heal);
        pulse(host.position(), optional(p.radius, 8), 0x4ade80);
        spawnRisingCrosses(host.position(), 0x4ade80, 6);
        host.onStatusEffect?.(host.position(), `💚 战场急救 +${heal}`, '#4ade80');
        break;
      }
      case 'shock': {
        const radius = optional(p.radius, 6);
        const damage = Math.round(optional(p.energy, 12) * 28);
        pulse(host.position(), radius, 0x38bdf8);
        pulse(host.position(), radius * 0.7, 0xfacc15, 1.2);
        host.onStatusEffect?.(host.position(), '🌊 冲击波震退!', '#38bdf8');
        for (const enemy of host.enemies()) {
          const dist = enemy.position.distanceTo(host.position());
          if (dist <= radius) {
            host.hitEnemy(enemy.userId, damage);
            const pushDir = enemy.position.clone().sub(host.position()).setY(0).normalize();
            host.knockbackEnemy?.(enemy.userId, pushDir, Math.max(2.5, (radius - dist) * 0.85));
          }
        }
        break;
      }
      case 'rain': {
        const count = Math.max(2, Math.round(optional(p.arrows, 3)));
        pulse(host.position(), 2.2, 0x38bdf8, 0.8);
        host.onStatusEffect?.(host.position(), `🏹 箭雨连射 x${count}!`, '#38bdf8');
        for (let index = 0; index < count; index += 1) {
          arrows.push({ at: clock + index * 0.085, aim: host.aim().clone() });
        }
        break;
      }
      case 'energy': {
        const point = target(6.5);
        point.y = host.position().y;
        const group = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.36, 0.42, 0.95, 12),
          new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.82 })
        );
        body.position.y = 0.48;
        const halo = new THREE.Mesh(
          new THREE.TorusGeometry(0.65, 0.045, 8, 24),
          new THREE.MeshBasicMaterial({ color: 0x4ade80 })
        );
        halo.rotation.x = Math.PI / 2;
        halo.position.y = 0.2;
        group.add(body, halo);
        group.position.copy(point);
        host.scene.add(group);
        beacons.push({
          mesh: group,
          point,
          radius: optional(p.radius, 5),
          perTick: optional(p.healPerTick, 150),
          left: optional(p.healTotal, 3000),
          timer: 0.2
        });
        host.onStatusEffect?.(point, '💊 活力振荡器部署!', '#4ade80');
        break;
      }
      case 'shield': {
        shieldMax = optional(p.shield, 600);
        shield = shieldMax;
        shieldTime = optional(p.duration, 10);
        energyDomeMesh.visible = true;
        pulse(host.position(), 3.2, 0x38bdf8);
        host.onStatusEffect?.(host.position(), `🛡️ 能量盾 +${shieldMax}!`, '#38bdf8');
        break;
      }
      case 'gallop': {
        speed = optional(p.speed, 6.2);
        speedTime = optional(p.duration, 5);
        pulse(host.position(), optional(p.radius, 8), 0xfacc15);
        host.onStatusEffect?.(host.position(), '⚡ 加速鼓舞!', '#facc15');
        break;
      }
      case 'conduction': {
        const cost = host.getMaxHealth() * optional(p.selfCost, 10) / 100;
        host.hurt(cost);
        healBuffPct = optional(p.healBuff, 45);
        healBuffTime = 8;
        const baseHeal = cost * optional(p.heal, 80) / 100;
        applyEffectiveHeal(baseHeal + 420);
        pulse(host.position(), 6.5, 0x34d399);
        spawnRisingCrosses(host.position(), 0x34d399, 5);
        host.onStatusEffect?.(host.position(), `🧬 生命传导 (治疗加成+${healBuffPct}%)!`, '#34d399');
        for (const enemy of host.enemies()) {
          if (enemy.position.distanceTo(host.position()) <= 7) {
            host.hitEnemy(enemy.userId, 260);
          }
        }
        break;
      }
      case 'overreaction': {
        const dur = optional(p.duration, 8);
        speed = optional(p.runSpeed, 6.4);
        speedTime = dur;
        maxHealthScale = 1 + optional(p.maxHealthPct, 32) / 100;
        maxHealthTime = dur;
        overreactionTime = dur;
        berserkAuraMesh.visible = true;
        host.setBerserkScale?.(1.2);
        pulse(host.position(), 4.2, 0xa855f7);
        host.onStatusEffect?.(host.position(), '🧪 过激反应 · 生化狂暴!', '#c084fc');
        break;
      }
      case 'latent': {
        stealth = optional(p.duration, 20);
        host.setGhost(true);
        pulse(host.position(), 2.4, 0xb7a5ff);
        host.onStatusEffect?.(host.position(), '👤 光学隐形启动!', '#a78bfa');
        break;
      }
      case 'spurt': {
        dash = 0.45;
        speed = 9.2;
        speedTime = Math.max(speedTime, 0.45 + optional(p.sprintDuration, 2));
        host.onSpurt?.();
        host.lungeForward?.(5.8);
        pulse(host.position(), 3.2, 0xf43f5e);
        host.onStatusEffect?.(host.position(), '⚔️ 刀锋疾风冲刺!', '#fb7185');
        for (const enemy of host.enemies()) {
          if (enemy.position.distanceTo(host.position()) <= 3.8) {
            host.hitEnemy(enemy.userId, 360);
            inflictPoison(enemy.userId, 140, 12);
          }
        }
        break;
      }
      case 'snare': {
        const point = target(4.5);
        point.y = host.position().y + 0.15;
        const mineGroup = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.38, 0.18, 12),
          new THREE.MeshBasicMaterial({ color: 0x475569 })
        );
        const sensor = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xef4444 })
        );
        sensor.position.y = 0.12;
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.45, 0.025, 6, 16),
          new THREE.MeshBasicMaterial({ color: 0xfacc15 })
        );
        ring.rotation.x = Math.PI / 2;
        mineGroup.add(body, sensor, ring);
        mineGroup.position.copy(point);
        host.scene.add(mineGroup);
        mines.push({
          mesh: mineGroup,
          point,
          trigger: optional(p.triggerRadius, 3),
          radius: optional(p.damageRadius, 8),
          damage: optional(p.damage, 450)
        });
        host.onStatusEffect?.(point, '💣 感应地雷已布设!', '#fbbf24');
        break;
      }
      // === 6 项副本首领技能 (Boss Skills) ===
      case 'tread': {
        const radius = optional(p.radius, 8);
        const damage = optional(p.damage, 580);
        pulse(host.position(), radius, 0xf97316);
        pulse(host.position(), radius * 0.65, 0xef4444, 1.0);
        host.onExplosion?.(host.position(), radius * 0.5);
        host.onStatusEffect?.(host.position(), '🌋 首领技 · 震地践踏!', '#fb923c');
        for (const enemy of host.enemies()) {
          const dist = enemy.position.distanceTo(host.position());
          if (dist <= radius) {
            host.hitEnemy(enemy.userId, damage);
            const pushDir = enemy.position.clone().sub(host.position()).setY(0).normalize();
            host.knockbackEnemy?.(enemy.userId, pushDir, 4.5);
          }
        }
        break;
      }
      case 'shriek': {
        const radius = optional(p.radius, 9);
        const damage = optional(p.damage, 520);
        pulse(host.position(), radius, 0xc084fc);
        pulse(host.position(), radius * 0.75, 0x38bdf8, 1.5);
        host.onStatusEffect?.(host.position(), '🔊 首领技 · 刺耳尖叫!', '#e879f9');
        for (const enemy of host.enemies()) {
          if (enemy.position.distanceTo(host.position()) <= radius) {
            host.hitEnemy(enemy.userId, damage);
            inflictWeakness(enemy.userId, 5);
          }
        }
        break;
      }
      case 'result': {
        shieldMax = optional(p.shield, 1400);
        shield = shieldMax;
        shieldTime = optional(p.duration, 12);
        energyDomeMesh.visible = true;
        applyEffectiveHeal(optional(p.heal, 400));
        pulse(host.position(), 4.5, 0xfbbf24);
        host.onStatusEffect?.(host.position(), '✨ 首领技 · 母体结界 (+1400盾)!', '#fde047');
        break;
      }
      case 'eatfish': {
        applyEffectiveHeal(optional(p.heal, 850));
        speed = optional(p.speed, 6.5);
        speedTime = optional(p.duration, 8);
        pulse(host.position(), 4.0, 0x2dd4bf);
        spawnRisingCrosses(host.position(), 0x2dd4bf, 6);
        host.onStatusEffect?.(host.position(), '🐟 首领技 · 深海狂怒 (+850HP)!', '#2dd4bf');
        break;
      }
      case 'bombgoon': {
        const muzzle = host.position().clone().add(new THREE.Vector3(0, 1.35, 0));
        const forward = host.aim().clone().normalize();
        const up = new THREE.Vector3(0, 1, 0);
        for (const angle of [-0.18, 0, 0.18]) {
          const dir = forward.clone().applyAxisAngle(up, angle);
          host.spawnProjectile('grenade', muzzle, dir, 'dynamite');
        }
        host.onStatusEffect?.(host.position(), '🧨 首领技 · 矿工三连爆破!', '#f87171');
        break;
      }
      case 'wolfdecelerate': {
        const radius = optional(p.radius, 7);
        const damage = optional(p.damage, 640);
        dash = 0.4;
        speed = 8.8;
        speedTime = Math.max(speedTime, 3.0);
        host.lungeForward?.(5.0);
        applyEffectiveHeal(optional(p.heal, 320));
        pulse(host.position(), radius, 0xef4444);
        host.onStatusEffect?.(host.position(), '🐺 首领技 · 狼王嗜血咆哮!', '#f87171');
        for (const enemy of host.enemies()) {
          if (enemy.position.distanceTo(host.position()) <= radius) {
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
        energyDomeMesh.visible = false;
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
        berserkAuraMesh.visible = false;
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

    // Sync 3D player aura positions
    playerAuraGroup.position.copy(host.position());
    if (energyDomeMesh.visible) {
      energyDomeMesh.rotation.y += delta * 1.6;
      energyDomeMesh.rotation.x += delta * 0.5;
    }
    if (berserkAuraMesh.visible) {
      berserkAuraMesh.rotation.y -= delta * 3.2;
      berserkAuraMesh.rotation.z += delta * 2.0;
    }
    if (tacticalShieldMesh.visible) {
      const aim = host.aim();
      tacticalShieldMesh.rotation.y = Math.atan2(aim.x, aim.z);
    }

    for (let index = arrows.length - 1; index >= 0; index -= 1) {
      const arrow = arrows[index];
      if (arrow.at > clock) continue;
      const muzzle = host.position().clone().add(new THREE.Vector3(0, 1.3, 0));
      const spread = arrow.aim.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.06)).normalize();
      host.spawnProjectile('arrow', muzzle, spread, arrow.subType);
      arrows.splice(index, 1);
    }

    for (let index = rings.length - 1; index >= 0; index -= 1) {
      const ring = rings[index];
      ring.life -= delta;
      const t = 1 - Math.max(0, ring.life) / ring.max;
      if (ring.rise) {
        ring.mesh.position.y += ring.rise * delta;
      } else {
        ring.mesh.scale.setScalar(Math.max(1, ring.grow) * (0.4 + t * 0.6));
      }
      ring.mesh.traverse?.((c: any) => {
        if (c.isMesh && c.material) c.material.opacity = 0.68 * (1 - t);
      });
      if (ring.life <= 0) { detach(ring.mesh, Boolean(ring.rise)); rings.splice(index, 1); }
    }

    for (let index = beacons.length - 1; index >= 0; index -= 1) {
      const beacon = beacons[index];
      beacon.timer -= delta;
      beacon.mesh.rotation.y += delta * 2.2;
      if (beacon.timer <= 0 && beacon.left > 0) {
        beacon.timer = 2;
        const heal = Math.min(beacon.perTick, beacon.left);
        beacon.left -= heal;
        pulse(beacon.point, beacon.radius, 0x4ade80);
        if (host.position().distanceTo(beacon.point) <= beacon.radius) applyEffectiveHeal(heal);
      }
      if (beacon.left <= 0) { detach(beacon.mesh, true); beacons.splice(index, 1); }
    }

    for (let index = mines.length - 1; index >= 0; index -= 1) {
      const mine = mines[index];
      mine.mesh.rotation.y += delta * 2.5;
      const armed = host.enemies().some((enemy) => enemy.position.distanceTo(mine.point) <= mine.trigger);
      if (!armed) continue;
      host.playSound('explosion_trap', 0.75);
      pulse(mine.point, mine.radius, 0xffa04d);
      host.onExplosion?.(mine.point, mine.radius);
      for (const enemy of host.enemies()) {
        if (enemy.position.distanceTo(mine.point) <= mine.radius) host.hitEnemy(enemy.userId, mine.damage);
      }
      detach(mine.mesh, true);
      mines.splice(index, 1);
    }

    // Update lingering GasBomb toxic clouds (毒气弹毒雾)
    for (let i = gasClouds.length - 1; i >= 0; i -= 1) {
      const cloud = gasClouds[i];
      cloud.life -= delta;
      cloud.tickTimer -= delta;
      cloud.mesh.rotation.y += delta * 1.2;
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
        detach(cloud.mesh, true);
        gasClouds.splice(i, 1);
      }
    }

    // Update Poison DoT on enemies (毒刃 / 毒气弹中毒)
    for (const [userId, state] of poisonedEnemies) {
      state.left -= delta;
      state.tick -= delta;
      const pos = findEnemyPos(userId);
      if (pos) {
        state.mesh.position.copy(pos).add(new THREE.Vector3(0, 0.9 + Math.sin(clock * 5) * 0.15, 0));
      }
      if (state.tick <= 0) {
        state.tick = 2.0;
        if (pos) host.hitEnemy(userId, state.damage);
      }
      if (state.left <= 0 || !pos) {
        detach(state.mesh, true);
        poisonedEnemies.delete(userId);
      }
    }

    // Update Plague DoT & Contagion Spread on enemies (瘟疫传播)
    for (const [userId, state] of plaguedEnemies) {
      state.left -= delta;
      state.tick -= delta;
      const pos = findEnemyPos(userId);
      if (pos) {
        state.mesh.position.copy(pos).add(new THREE.Vector3(0, 1.15, 0));
        state.mesh.rotation.y += delta * 3.0;
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
        detach(state.mesh, true);
        plaguedEnemies.delete(userId);
      }
    }

    // Update Life Puppet tethers (生命抽取傀儡)
    for (const [userId, state] of puppetEnemies) {
      state.left -= delta;
      const pos = findEnemyPos(userId);
      if (pos) {
        state.mesh.position.copy(pos).add(new THREE.Vector3(0, 2.25, 0));
        state.mesh.rotation.y += delta * 4.0;
      }
      if (state.left <= 0 || !pos) {
        detach(state.mesh, true);
        puppetEnemies.delete(userId);
      }
    }

    // Update Weakness debuff (要害射击虚弱)
    for (const [userId, state] of weakenedEnemies) {
      state.left -= delta;
      const pos = findEnemyPos(userId);
      if (pos) {
        state.mesh.position.copy(pos).add(new THREE.Vector3(0, 2.05, 0));
        state.mesh.rotation.z += delta * 3.0;
      }
      if (state.left <= 0 || !pos) {
        detach(state.mesh, true);
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
        energyDomeMesh.visible = false;
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


