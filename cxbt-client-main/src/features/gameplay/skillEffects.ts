import * as THREE from 'three';
import type { LoadedSkill } from './skills';

export type SkillTarget = { userId: string; position: any };

export type SkillEffectHost = {
  scene: any;
  /** Live player position; the vector is read, never stored. */
  position: () => any;
  /** Normalised aim direction. */
  aim: () => any;
  spawnProjectile: (kind: 'arrow' | 'grenade' | 'bullet' | 'rocket', origin: any, aim: any) => void;
  playSound: (name: string, volume?: number) => void;
  getMaxHealth: () => number;
  heal: (amount: number) => void;
  hurt: (amount: number) => void;
  enemies: () => SkillTarget[];
  hitEnemy: (userId: string, damage: number) => void;
  /** Toggles the stealth look on the player avatar. */
  setGhost: (on: boolean) => void;
  log: (message: string) => void;
};

export type SkillSnapshot = {
  shield: number;
  shieldMax: number;
  stealth: number;
  speed: number;
  maxHealthScale: number;
};

const RING_GEOMETRY = new THREE.RingGeometry(0.6, 1, 40);

/**
 * Runtime for the lobby-allocated skills: active skills fire from the battle hotbar
 * and passives are folded into PassiveModifiers. Effects only resolve locally, the
 * server remains authoritative for other players.
 */
export function createSkillEffects(host: SkillEffectHost) {
  const slotCooldowns = new Map<number, number>();
  const slotTotals = new Map<number, number>();
  const arrows: { at: number; aim: any }[] = [];
  const rings: { mesh: any; life: number; max: number; grow: number }[] = [];
  const mines: { mesh: any; point: any; trigger: number; radius: number; damage: number }[] = [];
  const beacons: { mesh: any; point: any; radius: number; perTick: number; left: number; timer: number }[] = [];
  let shield = 0;
  let shieldMax = 0;
  let shieldTime = 0;
  let stealth = 0;
  let speed = 0;
  let speedTime = 0;
  let maxHealthScale = 1;
  let maxHealthTime = 0;
  let dash = 0;
  let clock = 0;

  const pulse = (point: any, radius: number, color: number) => {
    const mesh = new THREE.Mesh(RING_GEOMETRY, new THREE.MeshBasicMaterial({ color, transparent: true,
      opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(point).add(new THREE.Vector3(0, 0.12, 0));
    mesh.scale.setScalar(Math.max(1, radius / 2));
    host.scene.add(mesh);
    rings.push({ mesh, life: 0.6, max: 0.6, grow: radius });
  };
  const target = (range: number) => host.position().clone().addScaledVector(host.aim(), range);
  const detach = (mesh: any, geometry: boolean) => {
    host.scene.remove(mesh);
    if (geometry) mesh.geometry.dispose();
    (mesh.material as any).dispose();
  };
  /** Stealth drops as soon as the player attacks or casts again. */
  const breakStealth = () => { if (stealth > 0) { stealth = 0; host.setGhost(false); } };
  const release = () => {
    for (const ring of rings) detach(ring.mesh, false);
    rings.length = 0;
    for (const mine of mines) detach(mine.mesh, true);
    mines.length = 0;
    for (const beacon of beacons) detach(beacon.mesh, true);
    beacons.length = 0;
  };
  // Restore the avatar's look if the effect runtime is torn down mid-stealth.

  const cast = (slot: number, load: LoadedSkill): number | null => {
    if ((slotCooldowns.get(slot) ?? 0) > 0) return null;
    const p = load.params;
    const id = load.skill.id;
    const optional = (value: number | undefined, fallback: number) => (value === undefined ? fallback : value);
    slotCooldowns.set(slot, load.cooldown);
    slotTotals.set(slot, load.cooldown);
    switch (id) {
      case 'cure': {
        const heal = optional(p.heal, 600);
        host.heal(heal);
        pulse(host.position(), optional(p.radius, 8), 0x7cf5a5);
        break;
      }
      case 'shock': {
        const radius = optional(p.radius, 6);
        const damage = Math.round(optional(p.energy, 12) * 25);
        pulse(host.position(), radius, 0x69b7ff);
        for (const enemy of host.enemies()) {
          if (enemy.position.distanceTo(host.position()) <= radius) host.hitEnemy(enemy.userId, damage);
        }
        break;
      }
      case 'rain': {
        const count = Math.max(1, Math.round(optional(p.arrows, 2)));
        for (let index = 0; index < count; index += 1) arrows.push({ at: clock + index * 0.09, aim: host.aim().clone() });
        break;
      }
      case 'energy': {
        const point = target(8);
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 10),
          new THREE.MeshBasicMaterial({ color: 0x7cf5a5, transparent: true, opacity: 0.75 }));
        mesh.position.copy(point);
        host.scene.add(mesh);
        beacons.push({ mesh, point, radius: optional(p.radius, 5), perTick: optional(p.healPerTick, 150),
          left: optional(p.healTotal, 3000), timer: 0 });
        break;
      }
      case 'shield': {
        shieldMax = optional(p.shield, 600);
        shield = shieldMax;
        shieldTime = optional(p.duration, 10);
        pulse(host.position(), 2.4, 0x9fd8ff);
        break;
      }
      case 'gallop': {
        speed = optional(p.speed, 5);
        speedTime = optional(p.duration, 3);
        pulse(host.position(), optional(p.radius, 8), 0xffe07a);
        break;
      }
      case 'conduction': {
        const cost = host.getMaxHealth() * optional(p.selfCost, 10) / 100;
        host.hurt(cost);
        host.heal(cost * optional(p.heal, 80) / 100);
        pulse(host.position(), 6, 0x7cf5a5);
        break;
      }
      case 'overreaction': {
        speed = optional(p.runSpeed, 6);
        speedTime = optional(p.duration, 8);
        maxHealthScale = 1 + optional(p.maxHealthPct, 32) / 100;
        maxHealthTime = optional(p.duration, 8);
        pulse(host.position(), 3, 0xff8f5b);
        break;
      }
      case 'latent': {
        stealth = optional(p.duration, 20);
        host.setGhost(true);
        pulse(host.position(), 2, 0xb7a5ff);
        break;
      }
      case 'spurt': {
        dash = 0.4;
        speed = 8.5;
        speedTime = Math.max(speedTime, 0.4 + optional(p.sprintDuration, 1));
        pulse(host.position(), 2.5, 0xffd0d0);
        for (const enemy of host.enemies()) {
          if (enemy.position.distanceTo(host.position()) <= 2.6) host.hitEnemy(enemy.userId, 220);
        }
        break;
      }
      case 'snare': {
        const point = target(10);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0xd8c14a }));
        mesh.position.copy(point);
        host.scene.add(mesh);
        mines.push({ mesh, point, trigger: optional(p.triggerRadius, 3), radius: optional(p.damageRadius, 8),
          damage: optional(p.damage, 450) });
        break;
      }
      default:
        break;
    }
    host.playSound(`skill-${id}`);
    host.log(`${load.skill.name} Lv${load.level}`);
    return load.cooldown;
  };

  const update = (delta: number) => {
    clock += delta;
    if (dash > 0) dash = Math.max(0, dash - delta);
    for (const [slot, remaining] of slotCooldowns) {
      const next = remaining - delta;
      if (next <= 0) { slotCooldowns.delete(slot); slotTotals.delete(slot); }
      else slotCooldowns.set(slot, next);
    }
    if (shieldTime > 0) { shieldTime = Math.max(0, shieldTime - delta); if (shieldTime === 0) { shield = 0; shieldMax = 0; } }
    if (speedTime > 0) speedTime = Math.max(0, speedTime - delta);
    if (maxHealthTime > 0) { maxHealthTime = Math.max(0, maxHealthTime - delta); if (maxHealthTime === 0) maxHealthScale = 1; }
    if (stealth > 0) { stealth = Math.max(0, stealth - delta); if (stealth === 0) host.setGhost(false); }

    for (let index = arrows.length - 1; index >= 0; index -= 1) {
      const arrow = arrows[index];
      if (arrow.at > clock) continue;
      const muzzle = host.position().clone().add(new THREE.Vector3(0, 1.3, 0));
      const spread = arrow.aim.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.06)).normalize();
      host.spawnProjectile('arrow', muzzle, spread);
      arrows.splice(index, 1);
    }
    for (let index = rings.length - 1; index >= 0; index -= 1) {
      const ring = rings[index];
      ring.life -= delta;
      const t = 1 - Math.max(0, ring.life) / ring.max;
      ring.mesh.scale.setScalar(Math.max(1, ring.grow) * (0.4 + t * 0.6));
      (ring.mesh.material as any).opacity = 0.6 * (1 - t);
      if (ring.life <= 0) { detach(ring.mesh, false); rings.splice(index, 1); }
    }
    for (let index = beacons.length - 1; index >= 0; index -= 1) {
      const beacon = beacons[index];
      beacon.timer -= delta;
      beacon.mesh.rotation.y += delta * 2;
      if (beacon.timer <= 0 && beacon.left > 0) {
        beacon.timer = 2;
        const heal = Math.min(beacon.perTick, beacon.left);
        beacon.left -= heal;
        if (host.position().distanceTo(beacon.point) <= beacon.radius) host.heal(heal);
      }
      if (beacon.left <= 0) { detach(beacon.mesh, true); beacons.splice(index, 1); }
    }
    for (let index = mines.length - 1; index >= 0; index -= 1) {
      const mine = mines[index];
      mine.mesh.rotation.y += delta;
      const armed = host.enemies().some((enemy) => enemy.position.distanceTo(mine.point) <= mine.trigger);
      if (!armed) continue;
      pulse(mine.point, mine.radius, 0xffa04d);
      for (const enemy of host.enemies()) {
        if (enemy.position.distanceTo(mine.point) <= mine.radius) host.hitEnemy(enemy.userId, mine.damage);
      }
      detach(mine.mesh, true);
      mines.splice(index, 1);
    }
  };

  return {
    cast,
    update,
    breakStealth,
    /** Sends damage through the active shield and returns what is left for the health bar. */
    absorb(amount: number) {
      if (shield <= 0) return amount;
      const soaked = Math.min(shield, amount);
      shield -= soaked;
      if (shield <= 0) { shield = 0; shieldMax = 0; shieldTime = 0; }
      return amount - soaked;
    },
    speed(base: number) {
      const boost = speedTime > 0 ? Math.max(speed, dash > 0 ? 9 : 0) : (dash > 0 ? 9 : 0);
      return Math.max(base, boost);
    },
    isStealthed: () => stealth > 0,
    bySlot: () => slotCooldowns,
    snapshot: (): SkillSnapshot => ({ shield, shieldMax, stealth, speed: speedTime > 0 ? speed : 0, maxHealthScale }),
    dispose() { breakStealth(); release(); }
  };
}
