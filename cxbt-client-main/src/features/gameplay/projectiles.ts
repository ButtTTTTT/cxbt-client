import * as THREE from 'three';

export type WeaponKind = 'melee' | 'grenade' | 'rocket' | 'arrow' | 'bullet';

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
  trailTimer: number;
};

/**
 * 构建 Q版卡通风格 3D 投射物实体网格 (火箭弹、高爆手雷、复合箭矢、能量曳光弹)
 */
function buildProjectileMesh(kind: Exclude<WeaponKind, 'melee'>): any {
  const group = new THREE.Group();

  if (kind === 'rocket') {
    // 火箭弹：弹体 + 红色弹头 + 4片尾翼 + 尾部喷射火焰核心
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
      new THREE.ConeGeometry(0.075, 0.28, 8),
      new THREE.MeshBasicMaterial({ color: 0xff9800, transparent: true, opacity: 0.92 })
    );
    flame.rotation.x = Math.PI;
    flame.position.y = -0.35;
    group.add(flame);
  } else if (kind === 'grenade') {
    // 手雷/榴弹：菠萝雷主体 + 顶部金色引信 + 闪烁红光环
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 10),
      new THREE.MeshPhongMaterial({ color: 0x3f6212, emissive: 0x14532d, shininess: 35 })
    );
    group.add(sphere);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.145, 0.02, 8, 16),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const fuse = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 0.08, 8),
      new THREE.MeshPhongMaterial({ color: 0xd97706 })
    );
    fuse.position.y = 0.14;
    group.add(fuse);

    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3b30 })
    );
    spark.position.y = 0.19;
    group.add(spark);
  } else if (kind === 'arrow') {
    // 箭矢：箭杆 + 发光棱锥箭头 + 三片尾羽
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.72, 8),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    group.add(shaft);

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.048, 0.14, 6),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    tip.position.y = 0.42;
    group.add(tip);

    const featherMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.008), featherMat);
      f.position.y = -0.28;
      f.rotation.y = (i * Math.PI * 2) / 3;
      group.add(f);
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
  onExplosion: (point: any, radius: number) => void,
  onHit?: (hit: any, kind: WeaponKind) => void) {
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

  const impact = (point: any, explosive: boolean) => {
    if (explosive) onExplosion(point, 3.8);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(explosive ? 1.15 : 0.14, 12, 10),
      new THREE.MeshBasicMaterial({
        color: explosive ? 0xff7b1c : 0xfde047,
        transparent: true,
        opacity: explosive ? 0.65 : 0.92,
        depthWrite: false
      })
    );
    mesh.position.copy(point);
    scene.add(mesh);
    impacts.push({ mesh, lifetime: explosive ? 0.28 : 0.12 });
  };

  const spawn = (kind: Exclude<WeaponKind, 'melee'>, origin: any, aim: any) => {
    const mesh = buildProjectileMesh(kind);
    const direction = aim.clone().normalize();
    const speed = kind === 'grenade' ? 16 : kind === 'rocket' ? 30 : kind === 'arrow' ? 45 : 75;
    const velocity = direction.clone().multiplyScalar(speed);
    if (kind === 'grenade') velocity.y += 5.2;
    mesh.name = `projectile-${kind}`;
    mesh.position.copy(origin);
    if (kind !== 'grenade') {
      mesh.quaternion.setFromUnitVectors(up, direction);
    }
    scene.add(mesh);
    projectiles.push({ mesh, velocity, lifetime: kind === 'grenade' ? 2.4 : 2.0, kind, trailTimer: 0 });
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

      // 火箭弹与手雷尾迹粒子
      if (projectile.kind === 'rocket' || projectile.kind === 'grenade') {
        projectile.trailTimer -= delta;
        if (projectile.trailTimer <= 0) {
          projectile.trailTimer = 0.025;
          const puff = new THREE.Mesh(
            new THREE.SphereGeometry(projectile.kind === 'rocket' ? 0.09 : 0.05, 6, 6),
            new THREE.MeshBasicMaterial({
              color: projectile.kind === 'rocket' ? 0xfb923c : 0x94a3b8,
              transparent: true,
              opacity: 0.65,
              depthWrite: false
            })
          );
          puff.position.copy(projectile.mesh.position);
          scene.add(puff);
          impacts.push({ mesh: puff, lifetime: 0.18 });
        }
      }

      const step = projectile.velocity.clone().multiplyScalar(delta);
      raycaster.set(projectile.mesh.position, step.clone().normalize());
      raycaster.far = step.length();
      const hit = raycaster.intersectObjects(targets(), true)[0];
      if (hit || projectile.lifetime <= 0) {
        if (hit && onHit) {
          onHit(hit, projectile.kind);
        }
        impact(hit?.point ?? projectile.mesh.position, projectile.kind === 'grenade' || projectile.kind === 'rocket');
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
