import * as THREE from 'three';

/**
 * 创想兵团 (AvatarStar) 风格化 Q版 3D 武器与特效模型生成器
 * 当原版 GLB 缺失、加载失败或需要强化枪口/能量视觉表现时，
 * 直接通过 Three.js 几何体渲染符合游戏美式卡通风格的 3D 武器建模与枪口挂点。
 */
export function getWeaponFamily(weaponId: string): string {
  const clean = (weaponId || 'smg_01').toLowerCase();
  return clean.split('_')[0] || 'smg';
}

function toonMat(color: number, emissive = 0x000000, shininess = 35) {
  return new THREE.MeshPhongMaterial({
    color,
    emissive,
    Shininess: shininess,
    specular: 0x444455,
  } as any);
}

function glowMat(color: number) {
  return new THREE.MeshBasicMaterial({
    color,
  });
}

/**
 * 根据武器 ID 创建完整的 Q版卡通风格 3D 武器网格组
 * 坐标系对齐骨骼 handweapon_r / handweapon_l：+Z 为枪口朝前，+Y 为枪身上方，原点为握把中心
 */
export function createStylizedWeaponMesh(weaponId: string): any {
  const family = getWeaponFamily(weaponId);
  const group = new THREE.Group();
  group.name = `stylized_weapon_${weaponId}`;

  const darkMetal = toonMat(0x2b313d, 0x090d16, 45);
  const silverMetal = toonMat(0x94a3b8, 0x1e293b, 65);
  const goldTrim = toonMat(0xf59e0b, 0x451a03, 55);
  const bodyPrimary = toonMat(0x3b82f6, 0x0f172a, 40);
  const bodyCrimson = toonMat(0xef4444, 0x2a0808, 40);
  const woodMat = toonMat(0x854d0e, 0x1c1917, 20);
  const bioGreen = glowMat(0x4ade80);
  const cyanGlow = glowMat(0x38bdf8);
  const orangeGlow = glowMat(0xf97316);

  // 枪口火光定位节点 (供 getMuzzlePosition 精确读取世界坐标)
  const muzzleNode = new THREE.Object3D();
  muzzleNode.name = 'Gun_Fire';
  muzzleNode.position.set(0, 0.12, 0.55);

  if (family === 'pistol') {
    // 战术手枪 (Q版夸张大枪管+发光准星)
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.08), darkMetal);
    grip.position.set(0, -0.02, 0.02);
    grip.rotation.x = -0.22;
    group.add(grip);

    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.085, 0.30), silverMetal);
    slide.position.set(0, 0.08, 0.11);
    group.add(slide);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 10), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.085, 0.28);
    group.add(barrel);

    const laser = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.12), goldTrim);
    laser.position.set(0, 0.03, 0.16);
    group.add(laser);

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.03), cyanGlow);
    sight.position.set(0, 0.13, 0.22);
    group.add(sight);

    muzzleNode.position.set(0, 0.085, 0.36);
  } else if (family === 'shotgun') {
    // 重型双管霰弹枪
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.11, 0.24), woodMat);
    stock.position.set(0, 0.02, -0.10);
    stock.rotation.x = -0.15;
    group.add(stock);

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.11, 0.26), bodyCrimson);
    receiver.position.set(0, 0.07, 0.10);
    group.add(receiver);

    const barrelL = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.44, 10), darkMetal);
    barrelL.rotation.x = Math.PI / 2;
    barrelL.position.set(-0.02, 0.095, 0.38);
    group.add(barrelL);

    const barrelR = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.44, 10), darkMetal);
    barrelR.rotation.x = Math.PI / 2;
    barrelR.position.set(0.02, 0.095, 0.38);
    group.add(barrelR);

    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.20, 10), woodMat);
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, 0.045, 0.32);
    group.add(pump);

    const muzzleRing = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.04), goldTrim);
    muzzleRing.position.set(0, 0.095, 0.58);
    group.add(muzzleRing);

    muzzleNode.position.set(0, 0.095, 0.62);
  } else if (family === 'sniperrifle') {
    // 狙击步枪 (超长枪管 + 高倍发光瞄准镜)
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.28), darkMetal);
    stock.position.set(0, 0.03, -0.14);
    group.add(stock);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.10, 0.36), bodyPrimary);
    body.position.set(0, 0.08, 0.12);
    group.add(body);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.62, 10), silverMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.095, 0.54);
    group.add(barrel);

    const brake = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.09), goldTrim);
    brake.position.set(0, 0.095, 0.85);
    group.add(brake);

    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.26, 12), darkMetal);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.175, 0.14);
    group.add(scopeTube);

    const scopeLens = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 12), bioGreen);
    scopeLens.rotation.x = Math.PI / 2;
    scopeLens.position.set(0, 0.175, 0.27);
    group.add(scopeLens);

    muzzleNode.position.set(0, 0.095, 0.90);
  } else if (family === 'machinegun') {
    // 多管加特林重机枪 (6管旋转枪管 + 弹鼓)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.15, 0.34), darkMetal);
    body.position.set(0, 0.06, 0.08);
    group.add(body);

    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 12), goldTrim);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(0, -0.05, 0.10);
    group.add(drum);

    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.014, 8, 16, Math.PI), silverMetal);
    handle.position.set(0, 0.14, 0.12);
    group.add(handle);

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.48, 8), silverMetal);
      b.rotation.x = Math.PI / 2;
      b.position.set(Math.cos(angle) * 0.042, 0.06 + Math.sin(angle) * 0.042, 0.44);
      group.add(b);
    }

    const clamp1 = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.03, 12), goldTrim);
    clamp1.rotation.x = Math.PI / 2;
    clamp1.position.set(0, 0.06, 0.38);
    group.add(clamp1);

    const clamp2 = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.03, 12), bodyCrimson);
    clamp2.rotation.x = Math.PI / 2;
    clamp2.position.set(0, 0.06, 0.60);
    group.add(clamp2);

    muzzleNode.position.set(0, 0.06, 0.70);
  } else if (family === 'rpg') {
    // 肩扛式火箭筒 + 弹头
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.75, 12), toonMat(0x3f6212, 0x0f172a, 30));
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.10, 0.18);
    group.add(tube);

    const bell = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.16, 12), darkMetal);
    bell.rotation.x = Math.PI / 2;
    bell.position.set(0, 0.10, -0.22);
    group.add(bell);

    const warhead = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.24, 12), bodyCrimson);
    warhead.rotation.x = Math.PI / 2;
    warhead.position.set(0, 0.10, 0.62);
    group.add(warhead);

    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.05, 12), goldTrim);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.10, 0.45);
    group.add(ring);

    muzzleNode.position.set(0, 0.10, 0.74);
  } else if (family === 'knives') {
    // 战术能量短刀
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.15, 10), darkMetal);
    hilt.rotation.x = Math.PI / 2;
    hilt.position.set(0, 0, 0);
    group.add(hilt);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.03), goldTrim);
    guard.position.set(0, 0, 0.08);
    group.add(guard);

    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.36, 4), silverMetal);
    blade.rotation.x = Math.PI / 2;
    blade.scale.set(0.35, 1, 1);
    blade.position.set(0, 0.01, 0.26);
    group.add(blade);

    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.025, 0.32), cyanGlow);
    edge.position.set(0, 0.02, 0.24);
    group.add(edge);

    muzzleNode.position.set(0, 0.01, 0.42);
  } else if (family === 'stick') {
    // 皇家魔导权杖/战锤
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.72, 10), goldTrim);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(0, 0.02, 0.20);
    group.add(shaft);

    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 14), cyanGlow);
    orb.position.set(0, 0.02, 0.58);
    group.add(orb);

    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.016, 8, 20), goldTrim);
    halo.position.set(0, 0.02, 0.58);
    group.add(halo);

    muzzleNode.position.set(0, 0.02, 0.65);
  } else if (family === 'bow' || family === 'crossbow') {
    // 复合战弓 / 战术十字弩
    const riser = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.28, 0.06), goldTrim);
    riser.position.set(0, 0.04, 0.08);
    group.add(riser);

    const limbTop = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.04), bodyPrimary);
    limbTop.position.set(0, 0.28, 0.02);
    limbTop.rotation.x = -0.35;
    group.add(limbTop);

    const limbBot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.04), bodyPrimary);
    limbBot.position.set(0, -0.20, 0.02);
    limbBot.rotation.x = 0.35;
    group.add(limbBot);

    const arrowShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.52, 8), cyanGlow);
    arrowShaft.rotation.x = Math.PI / 2;
    arrowShaft.position.set(0, 0.05, 0.22);
    group.add(arrowShaft);

    const arrowTip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 6), orangeGlow);
    arrowTip.rotation.x = Math.PI / 2;
    arrowTip.position.set(0, 0.05, 0.49);
    group.add(arrowTip);

    muzzleNode.position.set(0, 0.05, 0.52);
  } else if (family === 'shield') {
    // 守护防暴重盾
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.06), bodyPrimary);
    plate.position.set(0, 0.08, 0.14);
    group.add(plate);

    const border = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.76, 0.04), goldTrim);
    border.position.set(0, 0.08, 0.12);
    group.add(border);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.07), cyanGlow);
    visor.position.set(0, 0.24, 0.15);
    group.add(visor);

    muzzleNode.position.set(0, 0.08, 0.25);
  } else if (family === 'sprayer') {
    // 生化毒液/火焰喷射器
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.34), darkMetal);
    body.position.set(0, 0.06, 0.12);
    group.add(body);

    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.24, 12), bioGreen);
    tank.rotation.x = Math.PI / 2;
    tank.position.set(0, -0.04, 0.14);
    group.add(tank);

    const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 10), goldTrim);
    nozzle.rotation.x = -Math.PI / 2;
    nozzle.position.set(0, 0.07, 0.36);
    group.add(nozzle);

    muzzleNode.position.set(0, 0.07, 0.46);
  } else if (family === 'grenadelauncher') {
    // 转轮榴弹发射器
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.20), woodMat);
    stock.position.set(0, 0.02, -0.08);
    group.add(stock);

    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.16, 12), goldTrim);
    drum.rotation.x = Math.PI / 2;
    drum.position.set(0, 0.06, 0.12);
    group.add(drum);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.28, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.08, 0.32);
    group.add(barrel);

    muzzleNode.position.set(0, 0.08, 0.48);
  } else if (family === 'grenade') {
    // 高爆手雷
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 10), toonMat(0x365314, 0x052e16, 30));
    sphere.position.set(0, 0.05, 0.08);
    group.add(sphere);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.06, 8), goldTrim);
    cap.position.set(0, 0.15, 0.08);
    group.add(cap);

    const led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), orangeGlow);
    led.position.set(0, 0.19, 0.08);
    group.add(led);

    muzzleNode.position.set(0, 0.10, 0.18);
  } else {
    // 默认突击步枪 / 冲锋枪 (SMG)
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.11, 0.20), darkMetal);
    stock.position.set(0, 0.03, -0.10);
    group.add(stock);

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.12, 0.30), bodyPrimary);
    receiver.position.set(0, 0.075, 0.12);
    group.add(receiver);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.18, 0.065), goldTrim);
    mag.position.set(0, -0.05, 0.16);
    mag.rotation.x = 0.22;
    group.add(mag);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.28, 10), silverMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.085, 0.38);
    group.add(barrel);

    const muzzleTip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10), goldTrim);
    muzzleTip.rotation.x = Math.PI / 2;
    muzzleTip.position.set(0, 0.085, 0.52);
    group.add(muzzleTip);

    const holoSight = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.05, 0.08), darkMetal);
    holoSight.position.set(0, 0.155, 0.12);
    group.add(holoSight);

    const holoDot = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), cyanGlow);
    holoDot.position.set(0, 0.16, 0.16);
    group.add(holoDot);

    muzzleNode.position.set(0, 0.085, 0.56);
  }

  group.add(muzzleNode);
  group.traverse((child: any) => {
    if (child.isMesh) {
      child.frustumCulled = false;
      child.castShadow = true;
    }
  });

  return group;
}

/**
 * 增强已加载的 GLB 武器模型（提亮材质、修正缩放、补充枪口定位点 Gun_Fire）
 */
export function enhanceLoadedWeaponModel(weaponModel: any, _weaponId?: string) {
  let meshCount = 0;
  weaponModel.traverse((child: any) => {
    if (child.isMesh) {
      meshCount++;
      child.frustumCulled = false;
      child.castShadow = true;
      if (child.material) {
        child.material.emissive = new THREE.Color('#1a1f2e');
        child.material.emissiveIntensity = 0.22;
        child.material.needsUpdate = true;
      }
    }
  });

  if (!weaponModel.getObjectByName('Gun_Fire')) {
    const muzzleNode = new THREE.Object3D();
    muzzleNode.name = 'Gun_Fire';
    muzzleNode.position.set(0, 0.14, 0.52);
    weaponModel.add(muzzleNode);
  }

  return meshCount;
}
