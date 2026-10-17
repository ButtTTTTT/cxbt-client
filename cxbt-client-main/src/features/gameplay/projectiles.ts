import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LUA_WEAPON_PROJECTILE_MODELS } from './luaMasterData';

export type WeaponKind = 'melee' | 'grenade' | 'rocket' | 'arrow' | 'bullet';
export type ProjectileSubType = 'default' | 'syringe' | 'gasbomb' | 'dynamite';

const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const projectileGlbCache = new Map<string, any>();
const projectileGlbLoading = new Set<string>();
const projectileVfxTex: Record<string, any> = {};

function ensureProjectileVfxTextures() {
  if (Object.keys(projectileVfxTex).length > 0) return;
  const baseUrl = `${import.meta.env.BASE_URL || '/'}assets/gameplay/vfx/`;
  for (const name of [
    'vfx_smoke3',
    'vfx_smoke12',
    'vfx_smoke_white',
    'vfx_spark_group',
    'vfx_star2',
    'vfx_glow_9',
    'vfx_glow_7',
    'vfx_glow_green',
    'vfx_radial_flare_05',
  ]) {
    texLoader.load(
      `${baseUrl}${name}.png`,
      (tex: any) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        projectileVfxTex[name] = tex;
      },
      undefined,
      () => undefined
    );
  }
}

function resolveProjectileGlbUrl(weaponId?: string, kind?: WeaponKind, subType?: ProjectileSubType): string | null {
  const wId = (weaponId || '').toLowerCase();
  if (wId && LUA_WEAPON_PROJECTILE_MODELS[wId]) {
    return LUA_WEAPON_PROJECTILE_MODELS[wId];
  }
  if (kind === 'rocket') return LUA_WEAPON_PROJECTILE_MODELS['rpg_01'] || '/assets/gameplay/projectiles/rpg_01_rpgbullet_01.glb';
  if (kind === 'arrow') {
    return subType === 'syringe'
      ? LUA_WEAPON_PROJECTILE_MODELS['crossbow_01'] || '/assets/gameplay/projectiles/crossbow_01_crossbowbullet_01.glb'
      : LUA_WEAPON_PROJECTILE_MODELS['bow_01'] || '/assets/gameplay/projectiles/bow_01_arrow_01.glb';
  }
  if (kind === 'grenade') {
    return subType === 'gasbomb'
      ? LUA_WEAPON_PROJECTILE_MODELS['sprayer_01'] || '/assets/gameplay/projectiles/sprayer_01_sprayerbullet_01.glb'
      : LUA_WEAPON_PROJECTILE_MODELS['grenadelauncher_01'] || '/assets/gameplay/projectiles/grenadelauncherbullet_01_rv1_lod0.glb';
  }
  return null;
}

function attachRealGlbProjectile(container: any, url: string, kind: Exclude<WeaponKind, 'melee'>) {
  const mountClone = (template: any) => {
    const clone = template.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const targetSize = kind === 'arrow' ? 0.85 : kind === 'rocket' ? 0.65 : 0.36;
    const scale = targetSize / maxDim;
    clone.scale.setScalar(scale);
    clone.rotation.x = Math.PI / 2;
    container.add(clone);
  };

  const cached = projectileGlbCache.get(url);
  if (cached) {
    mountClone(cached);
    return;
  }
  if (!projectileGlbLoading.has(url)) {
    projectileGlbLoading.add(url);
    gltfLoader.load(
      url,
      (gltf) => {
        projectileGlbLoading.delete(url);
        if (gltf?.scene) {
          projectileGlbCache.set(url, gltf.scene);
          mountClone(gltf.scene);
        }
      },
      undefined,
      () => {
        projectileGlbLoading.delete(url);
      }
    );
  }
}

export function weaponKind(id: string): WeaponKind {
  const lower = (id || '').toLowerCase();
  if (lower.startsWith('ba0')) {
    if (lower.includes('machinegun') || lower.includes('armrt')) return 'bullet';
    if (lower.includes('grenade')) return 'grenade';
    return 'rocket';
  }
  const family = lower.split('_')[0];
  if (['knives', 'shield', 'stick'].includes(family)) return 'melee';
  if (['grenade', 'grenadelauncher'].includes(family)) return 'grenade';
  if (family === 'rpg') return 'rocket';
  if (['bow', 'crossbow'].includes(family)) return 'arrow';
  return 'bullet';
}

type Projectile = {
  mesh: any;
  velocity: any;
  lifetime: number;
  kind: WeaponKind;
  subType: ProjectileSubType;
  trailTimer: number;
};

/**
 * 构建《创想兵团》(Avatar Star) 1:1 真实解密 .mesh (.glb) 投射物实体 + 尾焰核心:
 * - rocket: 挂载 rpgbullet_XX.glb + 尾部喷射火焰核心
 * - grenade / gasbomb / dynamite: 挂载 grenadelauncherbullet_XX.glb / sprayerbullet_XX.glb / grenade_XX.glb
 * - arrow / syringe: 挂载 arrow_XX.glb / crossbowbullet_XX.glb
 * - bullet: 亮金曳光弹丸
 */
function buildProjectileMesh(
  kind: Exclude<WeaponKind, 'melee'>,
  subType: ProjectileSubType = 'default',
  weaponId?: string
): any {
  const group = new THREE.Group();
  const glbUrl = resolveProjectileGlbUrl(weaponId, kind, subType);
  if (glbUrl) {
    attachRealGlbProjectile(group, glbUrl, kind);
  }

  if (kind === 'rocket') {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.38, 10),
      new THREE.MeshPhongMaterial({ color: 0x475569, emissive: 0x0f172a, shininess: 40 })
    );
    group.add(body);

    const warhead = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.2, 10),
      new THREE.MeshPhongMaterial({ color: 0xef4444, emissive: 0x450a0a, shininess: 50 })
    );
    warhead.position.y = 0.29;
    group.add(warhead);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.085, 0.34, 8),
      new THREE.MeshBasicMaterial({ color: 0xff9800, transparent: true, opacity: 0.94 })
    );
    flame.rotation.x = Math.PI;
    flame.position.y = -0.34;
    group.add(flame);
  } else if (kind === 'grenade') {
    const isGas = subType === 'gasbomb';
    const isDynamite = subType === 'dynamite';
    const sphere = new THREE.Mesh(
      isDynamite ? new THREE.CylinderGeometry(0.1, 0.1, 0.28, 10) : new THREE.SphereGeometry(0.125, 12, 10),
      new THREE.MeshPhongMaterial({
        color: isGas ? 0x10b981 : isDynamite ? 0xdc2626 : 0x3f6212,
        emissive: isGas ? 0x065f46 : isDynamite ? 0x7f1d1d : 0x14532d,
        shininess: 45
      })
    );
    group.add(sphere);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.022, 8, 16),
      new THREE.MeshBasicMaterial({ color: isGas ? 0xa855f7 : 0xfacc15 })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  } else if (kind === 'arrow') {
    if (subType === 'syringe') {
      const glassTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, 0.48, 10),
        new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.85 })
      );
      group.add(glassTube);

      const needle = new THREE.Mesh(
        new THREE.ConeGeometry(0.032, 0.22, 8),
        new THREE.MeshBasicMaterial({ color: 0xf43f5e })
      );
      needle.position.y = 0.34;
      group.add(needle);
    } else {
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.72, 8),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      group.add(shaft);

      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.048, 0.15, 6),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 })
      );
      tip.position.y = 0.42;
      group.add(tip);
    }
  } else {
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.016, 0.68, 8),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    group.add(core);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffedd5 })
    );
    head.position.y = 0.34;
    group.add(head);
  }

  return group;
}

export function createProjectileSystem(
  scene: any,
  targets: () => any[],
  onExplosion: (point: any, radius: number, subType?: ProjectileSubType) => void,
  onHit?: (hit: any, kind: WeaponKind, subType: ProjectileSubType) => void
) {
  const projectiles: Projectile[] = [];
  const impacts: { mesh: any; lifetime: number }[] = [];
  const raycaster = new THREE.Raycaster();
  const up = new THREE.Vector3(0, 1, 0);

  const stepVec = new THREE.Vector3();
  const rayDir = new THREE.Vector3();
  const nearbyTargets: any[] = [];

  const release = (obj: any) => {
    scene.remove(obj);
    if (obj?.material) {
      obj.material.dispose?.();
    }
    if (obj?.geometry) {
      obj.geometry.dispose?.();
    }
  };

  const impact = (point: any, explosive: boolean, subType: ProjectileSubType = 'default') => {
    if (explosive) onExplosion(point, subType === 'gasbomb' ? 5.5 : 4.2, subType);
    const isGas = subType === 'gasbomb';
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(explosive ? 1.25 : 0.16, 10, 8),
      new THREE.MeshBasicMaterial({
        color: isGas ? 0x10b981 : explosive ? 0xff7b1c : 0xfde047,
        transparent: true,
        opacity: explosive ? 0.68 : 0.92,
        depthWrite: false
      })
    );
    mesh.position.copy(point);
    scene.add(mesh);
    impacts.push({ mesh, lifetime: explosive ? 0.32 : 0.14 });
  };

  ensureProjectileVfxTextures();

  const spawn = (
    kind: Exclude<WeaponKind, 'melee'>,
    origin: any,
    aim: any,
    subType: ProjectileSubType = 'default',
    weaponId?: string
  ) => {
    const mesh = buildProjectileMesh(kind, subType, weaponId);
    const direction = aim.clone().normalize();
    const speed = kind === 'grenade' ? 17 : kind === 'rocket' ? 32 : kind === 'arrow' ? 48 : 78;
    const velocity = direction.clone().multiplyScalar(speed);
    if (kind === 'grenade') velocity.y += 5.4;
    mesh.name = `projectile-${kind}`;
    mesh.position.copy(origin);
    if (kind !== 'grenade') {
      mesh.quaternion.setFromUnitVectors(up, direction);
    }
    scene.add(mesh);
    const lifetime = kind === 'grenade' ? 2.4 : kind === 'bullet' ? 0.35 : 1.8;
    projectiles.push({ mesh, velocity, lifetime, kind, subType, trailTimer: 0 });
  };

  const update = (delta: number) => {
    const hasCollidingProjectiles = projectiles.some((p) => p.kind !== 'bullet');
    const allTargets = hasCollidingProjectiles ? targets() : [];

    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = projectiles[index];
      projectile.lifetime -= delta;
      if (projectile.kind === 'grenade') {
        projectile.velocity.y -= 18 * delta;
        projectile.mesh.rotation.x += 9 * delta;
        projectile.mesh.rotation.z += 6 * delta;
      }

      if (projectile.kind === 'rocket' || projectile.kind === 'grenade' || projectile.kind === 'arrow') {
        projectile.trailTimer -= delta;
        if (projectile.trailTimer <= 0) {
          projectile.trailTimer = projectile.kind === 'arrow' ? 0.032 : 0.036;
          const isGas = projectile.subType === 'gasbomb';
          const isSyringe = projectile.subType === 'syringe';
          const puffColor = projectile.kind === 'rocket'
            ? 0xfb923c
            : isGas
              ? 0x34d399
              : projectile.kind === 'grenade'
                ? 0xcbd5e1
                : isSyringe
                  ? 0x34d399
                  : 0x38bdf8;

          const trailTex = projectile.kind === 'rocket'
            ? (projectileVfxTex.vfx_smoke3 || projectileVfxTex.vfx_smoke12)
            : projectile.kind === 'arrow'
              ? (isSyringe ? projectileVfxTex.vfx_glow_green : projectileVfxTex.vfx_glow_9 || projectileVfxTex.vfx_radial_flare_05)
              : (isGas ? projectileVfxTex.vfx_glow_green : projectileVfxTex.vfx_smoke_white);

          if (trailTex) {
            const sp = new THREE.Sprite(
              new THREE.SpriteMaterial({
                map: trailTex,
                color: puffColor,
                transparent: true,
                opacity: projectile.kind === 'rocket' ? 0.85 : 0.78,
                blending: projectile.kind === 'arrow' || projectile.kind === 'rocket' ? THREE.AdditiveBlending : THREE.NormalBlending,
                depthWrite: false,
                rotation: Math.random() * Math.PI * 2
              })
            );
            sp.position.copy(projectile.mesh.position);
            const s = projectile.kind === 'rocket' ? 0.42 : projectile.kind === 'arrow' ? 0.34 : 0.26;
            sp.scale.set(s, s, s);
            scene.add(sp);
            impacts.push({ mesh: sp, lifetime: projectile.kind === 'arrow' ? 0.18 : 0.28 });
          }

          if (projectile.kind === 'arrow' || projectile.kind === 'rocket') {
            const ring = new THREE.Mesh(
              new THREE.TorusGeometry(projectile.kind === 'rocket' ? 0.11 : 0.08, 0.016, 6, 12),
              new THREE.MeshBasicMaterial({
                color: projectile.kind === 'rocket' ? 0xfef08a : puffColor,
                transparent: true,
                opacity: 0.75,
                blending: THREE.AdditiveBlending,
                depthWrite: false
              })
            );
            ring.position.copy(projectile.mesh.position);
            ring.quaternion.copy(projectile.mesh.quaternion);
            scene.add(ring);
            impacts.push({ mesh: ring, lifetime: 0.15 });
          }
        }
      }

      stepVec.copy(projectile.velocity).multiplyScalar(delta);
      const stepLen = stepVec.length();
      let hit: any = undefined;

      if (projectile.kind !== 'bullet' && stepLen > 0.0001 && allTargets.length > 0) {
        const pos = projectile.mesh.position;
        const minX = Math.min(pos.x, pos.x + stepVec.x) - 0.3;
        const maxX = Math.max(pos.x, pos.x + stepVec.x) + 0.3;
        const minY = Math.min(pos.y, pos.y + stepVec.y) - 0.3;
        const maxY = Math.max(pos.y, pos.y + stepVec.y) + 0.3;
        const minZ = Math.min(pos.z, pos.z + stepVec.z) - 0.3;
        const maxZ = Math.max(pos.z, pos.z + stepVec.z) + 0.3;

        nearbyTargets.length = 0;
        for (let t = 0; t < allTargets.length; t++) {
          const m = allTargets[t];
          const wb = m?.userData?._worldBox;
          if (wb) {
            if (
              wb.max.x < minX || wb.min.x > maxX ||
              wb.max.y < minY || wb.min.y > maxY ||
              wb.max.z < minZ || wb.min.z > maxZ
            ) {
              continue;
            }
          }
          nearbyTargets.push(m);
        }

        if (nearbyTargets.length > 0) {
          rayDir.copy(stepVec).multiplyScalar(1 / stepLen);
          raycaster.set(pos, rayDir);
          raycaster.far = stepLen;
          hit = raycaster.intersectObjects(nearbyTargets, false)[0];
        }
      }

      if (hit || projectile.lifetime <= 0) {
        if (hit && onHit) {
          onHit(hit, projectile.kind, projectile.subType);
        }
        impact(
          hit?.point ?? projectile.mesh.position,
          projectile.kind === 'grenade' || projectile.kind === 'rocket',
          projectile.subType
        );
        scene.remove(projectile.mesh);
        projectiles.splice(index, 1);
        continue;
      }
      projectile.mesh.position.add(stepVec);
      if (projectile.kind !== 'grenade') {
        rayDir.copy(projectile.velocity).normalize();
        projectile.mesh.quaternion.setFromUnitVectors(up, rayDir);
      }
    }
    for (let index = impacts.length - 1; index >= 0; index -= 1) {
      const entry = impacts[index];
      entry.lifetime -= delta;
      entry.mesh.scale.multiplyScalar(1 + 1.8 * delta);
      if (entry.lifetime <= 0) {
        release(entry.mesh);
        impacts.splice(index, 1);
      }
    }
  };

  const dispose = () => {
    projectiles.forEach(({ mesh }) => scene.remove(mesh));
    impacts.forEach(({ mesh }) => release(mesh));
    projectiles.length = 0;
    impacts.length = 0;
  };
  return { spawn, update, dispose, count: () => projectiles.length };
}
