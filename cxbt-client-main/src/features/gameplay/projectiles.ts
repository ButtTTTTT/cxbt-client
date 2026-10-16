import * as THREE from 'three';

export type WeaponKind = 'melee' | 'grenade' | 'rocket' | 'arrow' | 'bullet';
export type ProjectileSubType = 'default' | 'syringe' | 'gasbomb' | 'dynamite';

export function weaponKind(id: string): WeaponKind {
  const family = id.split('_')[0];
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
 * 构建《创想兵团》(Avatar Star) 1:1 风格 3D 投射物实体网格:
 * - rocket: 火箭弹 (弹体 + 红色弹头 + 4片尾翼 + 尾部喷射火焰核心)
 * - grenade / gasbomb / dynamite: 菠萝高爆手雷 / 生化毒气弹罐 / 矿工炸药包
 * - arrow / syringe: 复合弓发光箭矢 / 生化十字弩生命抽取针筒
 * - bullet: 亮金曳光弹丸
 */
function buildProjectileMesh(kind: Exclude<WeaponKind, 'melee'>, subType: ProjectileSubType = 'default'): any {
  const group = new THREE.Group();

  if (kind === 'rocket') {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.45, 10),
      new THREE.MeshPhongMaterial({ color: 0x475569, emissive: 0x0f172a, shininess: 40 })
    );
    group.add(body);

    const warhead = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.22, 10),
      new THREE.MeshPhongMaterial({ color: 0xef4444, emissive: 0x450a0a, shininess: 50 })
    );
    warhead.position.y = 0.33;
    group.add(warhead);

    const finMat = new THREE.MeshPhongMaterial({ color: 0xf59e0b });
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.02), finMat);
      fin.position.y = -0.18;
      fin.rotation.y = (i * Math.PI) / 2;
      group.add(fin);
    }

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.085, 0.32, 8),
      new THREE.MeshBasicMaterial({ color: 0xff9800, transparent: true, opacity: 0.94 })
    );
    flame.rotation.x = Math.PI;
    flame.position.y = -0.36;
    group.add(flame);
  } else if (kind === 'grenade') {
    const isGas = subType === 'gasbomb';
    const isDynamite = subType === 'dynamite';
    const sphere = new THREE.Mesh(
      isDynamite ? new THREE.CylinderGeometry(0.11, 0.11, 0.32, 10) : new THREE.SphereGeometry(0.145, 12, 10),
      new THREE.MeshPhongMaterial({
        color: isGas ? 0x10b981 : isDynamite ? 0xdc2626 : 0x3f6212,
        emissive: isGas ? 0x065f46 : isDynamite ? 0x7f1d1d : 0x14532d,
        shininess: 45
      })
    );
    group.add(sphere);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.15, 0.024, 8, 16),
      new THREE.MeshBasicMaterial({ color: isGas ? 0xa855f7 : 0xfacc15 })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const fuse = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 0.08, 8),
      new THREE.MeshPhongMaterial({ color: 0xd97706 })
    );
    fuse.position.y = 0.15;
    group.add(fuse);

    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshBasicMaterial({ color: isGas ? 0x4ade80 : 0xff3b30 })
    );
    spark.position.y = 0.2;
    group.add(spark);
  } else if (kind === 'arrow') {
    if (subType === 'syringe') {
      // 十字弩：生化玻璃针筒 + 翠绿/紫红生命抽取药液 + 钢针尖 + 尾翼
      const glassTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.036, 0.036, 0.52, 10),
        new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.88 })
      );
      group.add(glassTube);

      const plunger = new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.048, 0.08, 8),
        new THREE.MeshBasicMaterial({ color: 0xc084fc })
      );
      plunger.position.y = -0.28;
      group.add(plunger);

      const needle = new THREE.Mesh(
        new THREE.ConeGeometry(0.035, 0.24, 8),
        new THREE.MeshBasicMaterial({ color: 0xf43f5e })
      );
      needle.position.y = 0.36;
      group.add(needle);
    } else {
      // 复合弓箭矢：箭杆 + 发光棱锥箭头 + 三片尾羽
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.76, 8),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      group.add(shaft);

      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.052, 0.16, 6),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 })
      );
      tip.position.y = 0.44;
      group.add(tip);

      const featherMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e, side: THREE.DoubleSide });
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.15, 0.008), featherMat);
        f.position.y = -0.28;
        f.rotation.y = (i * Math.PI * 2) / 3;
        group.add(f);
      }
    }
  } else {
    // 曳光弹丸：亮金色流光弹体 + 高亮外层光晕
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

export function createProjectileSystem(scene: any, targets: () => any[],
  onExplosion: (point: any, radius: number, subType?: ProjectileSubType) => void,
  onHit?: (hit: any, kind: WeaponKind, subType: ProjectileSubType) => void) {
  const projectiles: Projectile[] = [];
  const impacts: { mesh: any; lifetime: number }[] = [];
  const raycaster = new THREE.Raycaster();
  const up = new THREE.Vector3(0, 1, 0);

  const release = (obj: any) => {
    scene.remove(obj);
    obj.traverse?.((child: any) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m: any) => m?.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
  };

  const impact = (point: any, explosive: boolean, subType: ProjectileSubType = 'default') => {
    if (explosive) onExplosion(point, subType === 'gasbomb' ? 5.5 : 4.2, subType);
    const isGas = subType === 'gasbomb';
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(explosive ? 1.25 : 0.16, 12, 10),
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

  const spawn = (kind: Exclude<WeaponKind, 'melee'>, origin: any, aim: any, subType: ProjectileSubType = 'default') => {
    const mesh = buildProjectileMesh(kind, subType);
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
    projectiles.push({ mesh, velocity, lifetime: kind === 'grenade' ? 2.4 : 2.0, kind, subType, trailTimer: 0 });
  };

  const update = (delta: number) => {
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = projectiles[index];
      projectile.lifetime -= delta;
      if (projectile.kind === 'grenade') {
        projectile.velocity.y -= 18 * delta;
        projectile.mesh.rotation.x += 9 * delta;
        projectile.mesh.rotation.z += 6 * delta;
      }

      // 火箭弹、手雷/毒气弹、弓箭/十字弩针筒专属尾迹粒子 (s_rpg_trail / s_bow_trail / s_crossbow_trail)
      if (projectile.kind === 'rocket' || projectile.kind === 'grenade' || projectile.kind === 'arrow') {
        projectile.trailTimer -= delta;
        if (projectile.trailTimer <= 0) {
          projectile.trailTimer = projectile.kind === 'arrow' ? 0.018 : 0.024;
          const isGas = projectile.subType === 'gasbomb';
          const isSyringe = projectile.subType === 'syringe';
          const puffColor = projectile.kind === 'rocket'
            ? 0xfb923c
            : isGas
              ? 0x34d399
              : projectile.kind === 'grenade'
                ? 0x94a3b8
                : isSyringe
                  ? 0xc084fc
                  : 0x38bdf8;
          const puff = new THREE.Mesh(
            projectile.kind === 'arrow'
              ? new THREE.TorusGeometry(0.08, 0.016, 6, 12)
              : new THREE.SphereGeometry(projectile.kind === 'rocket' ? 0.095 : 0.055, 6, 6),
            new THREE.MeshBasicMaterial({
              color: puffColor,
              transparent: true,
              opacity: 0.72,
              depthWrite: false
            })
          );
          puff.position.copy(projectile.mesh.position);
          if (projectile.kind === 'arrow') {
            puff.quaternion.copy(projectile.mesh.quaternion);
          }
          scene.add(puff);
          impacts.push({ mesh: puff, lifetime: projectile.kind === 'arrow' ? 0.16 : 0.22 });
        }
      }

      const step = projectile.velocity.clone().multiplyScalar(delta);
      raycaster.set(projectile.mesh.position, step.clone().normalize());
      raycaster.far = step.length();
      const hit = raycaster.intersectObjects(targets(), true)[0];
      if (hit || projectile.lifetime <= 0) {
        if (hit && onHit) {
          onHit(hit, projectile.kind, projectile.subType);
        }
        impact(
          hit?.point ?? projectile.mesh.position,
          projectile.kind === 'grenade' || projectile.kind === 'rocket',
          projectile.subType
        );
        release(projectile.mesh);
        projectiles.splice(index, 1);
        continue;
      }
      projectile.mesh.position.add(step);
      if (projectile.kind !== 'grenade') {
        projectile.mesh.quaternion.setFromUnitVectors(up, projectile.velocity.clone().normalize());
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
    projectiles.forEach(({ mesh }) => release(mesh));
    impacts.forEach(({ mesh }) => release(mesh));
    projectiles.length = 0;
    impacts.length = 0;
  };
  return { spawn, update, dispose, count: () => projectiles.length };
}

