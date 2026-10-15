import * as THREE from 'three';

export interface FloatingDamageText {
  sprite: any;
  position: any;
  velocity: any;
  lifetime: number;
  maxLifetime: number;
}

export interface SparkParticle {
  mesh: any;
  velocity?: any;
  rotSpeed?: any;
  scaleSpeed?: number;
  lifetime: number;
  maxLifetime: number;
}

export interface ExplosionEffect {
  mesh: any;
  ring?: any;
  scaleSpeed: number;
  lifetime: number;
  maxLifetime: number;
}

/**
 * 战场 3D 视觉特效与受击反馈引擎管理器 (沙盒与正式游戏共用)
 * 负责：3D 浮动伤害/治疗跳字、Q版星芒枪口火焰、3D 弹道曳光束、抛壳物理、近战刀光弧、弹道撞墙火花、范围爆炸气浪特效
 */
export class CombatEffectsManager {
  public scene: any;
  public muzzleLight: any;
  public muzzleFlashGroup: any;

  private floatingTexts: FloatingDamageText[] = [];
  private sparks: SparkParticle[] = [];
  private explosions: ExplosionEffect[] = [];
  private muzzleTimer: number = 0;

  constructor(scene: any) {
    this.scene = scene;

    // 枪口火焰动态光源
    this.muzzleLight = new THREE.PointLight(0xffb03a, 0, 11);
    scene.add(this.muzzleLight);

    // Q版卡通十字星芒枪口火焰组
    this.muzzleFlashGroup = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xfffbeb, transparent: true, opacity: 0.95 })
    );
    this.muzzleFlashGroup.add(core);

    const finMat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.42, 6), finMat);
      fin.rotation.z = (i * Math.PI) / 2;
      fin.position.set(Math.cos((i * Math.PI) / 2) * 0.16, Math.sin((i * Math.PI) / 2) * 0.16, 0);
      this.muzzleFlashGroup.add(fin);
    }

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.025, 6, 16),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.85 })
    );
    this.muzzleFlashGroup.add(ring);

    this.muzzleFlashGroup.visible = false;
    scene.add(this.muzzleFlashGroup);
  }

  /**
   * 触发 Q版星芒枪口亮光、火花与抛壳特效
   */
  public triggerMuzzleFlash(muzzlePos: any, duration: number = 0.075) {
    if (this.muzzleLight) {
      this.muzzleLight.position.copy(muzzlePos);
      this.muzzleLight.intensity = 6.5;
    }
    if (this.muzzleFlashGroup) {
      this.muzzleFlashGroup.position.copy(muzzlePos);
      this.muzzleFlashGroup.rotation.z = Math.random() * Math.PI * 2;
      const s = 0.85 + Math.random() * 0.45;
      this.muzzleFlashGroup.scale.set(s, s, s);
      this.muzzleFlashGroup.visible = true;
    }
    this.muzzleTimer = duration;

    // 3D 黄铜弹壳抛出效果
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.055, 6),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    shell.position.copy(muzzlePos);
    this.scene.add(shell);
    this.sparks.push({
      mesh: shell,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 2.5, 2.2 + Math.random() * 1.5, (Math.random() - 0.5) * 2.5),
      rotSpeed: new THREE.Vector3(14, 18, 11),
      lifetime: 0.45,
      maxLifetime: 0.45
    });
  }

  /**
   * 生成 3D 激光/曳光弹道光束 (从枪口直达准星落点)
   */
  public spawnBulletTracer(from: any, to: any, color: number = 0xfef08a) {
    const dist = from.distanceTo(to);
    if (dist < 0.2) return;

    const mid = from.clone().add(to).multiplyScalar(0.5);
    const dir = to.clone().sub(from).normalize();

    const geo = new THREE.CylinderGeometry(0.022, 0.022, dist, 6);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const beam = new THREE.Mesh(geo, mat);
    beam.position.copy(mid);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.scene.add(beam);

    this.sparks.push({
      mesh: beam,
      lifetime: 0.085,
      maxLifetime: 0.085
    });
  }

  /**
   * 生成近战 3D 弧形刀光特效 (支持三段连击变色)
   */
  public spawnMeleeSlash(origin: any, aimDir: any, comboStep: number = 1) {
    const colors = [0x38bdf8, 0xfacc15, 0xf43f5e];
    const color = colors[(Math.max(1, comboStep) - 1) % colors.length];

    const group = new THREE.Group();
    const arcGeo = new THREE.TorusGeometry(1.15, 0.065, 8, 24, Math.PI * 0.85);
    const arcMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const arc = new THREE.Mesh(arcGeo, arcMat);
    arc.rotation.x = Math.PI / 2;
    if (comboStep % 2 === 0) arc.rotation.y = 0.45;
    else if (comboStep % 3 === 0) arc.rotation.y = -0.55;
    group.add(arc);

    const flatDir = new THREE.Vector3(aimDir.x, 0, aimDir.z).normalize();
    group.position.copy(origin).add(new THREE.Vector3(0, 1.05, 0)).addScaledVector(flatDir, 0.65);
    group.rotation.y = Math.atan2(flatDir.x, flatDir.z) - Math.PI * 0.42;

    this.scene.add(group);
    this.sparks.push({
      mesh: group,
      velocity: flatDir.clone().multiplyScalar(4.5),
      scaleSpeed: 2.8,
      lifetime: 0.18,
      maxLifetime: 0.18
    });
  }

  /**
   * 生成 3D 浮动伤害跳字
   */
  public spawnFloatingDamage(
    pos: any,
    damage: number,
    isHeadshot: boolean = false,
    isPlayer: boolean = false
  ) {
    const rounded = Math.max(1, Math.round(damage));
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 256, 64);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = isHeadshot ? `💥 爆头 -${rounded}!` : `-${rounded}`;
    ctx.font = isHeadshot ? 'bold 32px sans-serif' : 'bold 28px sans-serif';

    ctx.lineWidth = 5;
    ctx.strokeStyle = isHeadshot ? '#7f1d1d' : (isPlayer ? '#450a0a' : '#0f172a');
    ctx.strokeText(text, 128, 32);

    ctx.fillStyle = isHeadshot ? '#fbbf24' : (isPlayer ? '#ef4444' : '#f8fafc');
    ctx.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.35, (Math.random() - 0.5) * 0.3));
    const scale = isHeadshot ? 1.7 : 1.3;
    sprite.scale.set(scale * 1.5, scale * 0.4, 1);
    this.scene.add(sprite);

    const maxLifetime = isHeadshot ? 1.15 : 0.85;
    this.floatingTexts.push({
      sprite,
      position: sprite.position,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.6, 2.1 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6),
      lifetime: maxLifetime,
      maxLifetime
    });
  }

  /**
   * 生成 3D 浮动治疗跳字
   */
  public spawnFloatingHeal(pos: any, amount: number) {
    const rounded = Math.max(1, Math.round(amount));
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 256, 64);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = `💚 +${rounded}`;
    ctx.font = 'bold 28px sans-serif';

    ctx.lineWidth = 5;
    ctx.strokeStyle = '#064e3b';
    ctx.strokeText(text, 128, 32);

    ctx.fillStyle = '#4ade80';
    ctx.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.45, (Math.random() - 0.5) * 0.25));
    sprite.scale.set(1.9, 0.5, 1);
    this.scene.add(sprite);

    this.floatingTexts.push({
      sprite,
      position: sprite.position,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.9, (Math.random() - 0.5) * 0.4),
      lifetime: 0.95,
      maxLifetime: 0.95
    });
  }

  /**
   * 生成撞墙与命中四溅火花
   */
  public spawnImpactSpark(point: any, color: number = 0xfef08a) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.025, 6, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
    );
    ring.position.copy(point);
    ring.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    this.scene.add(ring);
    this.sparks.push({ mesh: ring, scaleSpeed: 6.5, lifetime: 0.14, maxLifetime: 0.14 });

    for (let i = 0; i < 4; i++) {
      const geo = new THREE.BoxGeometry(0.055, 0.055, 0.055);
      const mat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? color : 0xf97316, transparent: true, opacity: 0.95 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(point);
      this.scene.add(mesh);
      this.sparks.push({
        mesh,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 5, 1.5 + Math.random() * 3.5, (Math.random() - 0.5) * 5),
        rotSpeed: new THREE.Vector3(10, 12, 8),
        lifetime: 0.22,
        maxLifetime: 0.22
      });
    }
  }

  /**
   * 生成范围爆炸光浪与冲击环
   */
  public spawnExplosionEffect(point: any) {
    const geom = new THREE.SphereGeometry(1.4, 14, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.85
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(point);
    this.scene.add(mesh);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.95 })
    );
    mesh.add(core);

    const shockwave = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.12, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.9 })
    );
    shockwave.rotation.x = Math.PI / 2;
    mesh.add(shockwave);

    this.explosions.push({
      mesh,
      scaleSpeed: 5.8,
      lifetime: 0.38,
      maxLifetime: 0.38
    });

    for (let i = 0; i < 8; i++) {
      const debris = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.11, 0),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xf97316 : 0xfef08a, transparent: true, opacity: 0.95 })
      );
      debris.position.copy(point);
      this.scene.add(debris);
      this.sparks.push({
        mesh: debris,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 10, 3 + Math.random() * 6, (Math.random() - 0.5) * 10),
        rotSpeed: new THREE.Vector3(12, 15, 9),
        lifetime: 0.45,
        maxLifetime: 0.45
      });
    }
  }

  /**
   * 帧更新：驱动枪口火焰消退、浮动伤害/治疗跳字、火花粒子与爆炸气浪
   */
  public update(delta: number) {
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= delta;
      if (this.muzzleTimer <= 0) {
        if (this.muzzleLight) this.muzzleLight.intensity = 0;
        if (this.muzzleFlashGroup) this.muzzleFlashGroup.visible = false;
      }
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.lifetime -= delta;
      ft.position.addScaledVector(ft.velocity, delta);
      ft.velocity.y = Math.max(0.4, ft.velocity.y - delta * 1.8);
      ft.sprite.material.opacity = Math.max(0, ft.lifetime / ft.maxLifetime);

      if (ft.lifetime <= 0) {
        this.scene.remove(ft.sprite);
        ft.sprite.material.map?.dispose();
        ft.sprite.material.dispose();
        this.floatingTexts.splice(i, 1);
      }
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.lifetime -= delta;
      if (sp.velocity) {
        sp.mesh.position.addScaledVector(sp.velocity, delta);
        sp.velocity.y -= 9.8 * delta;
      }
      if (sp.rotSpeed) {
        sp.mesh.rotation.x += sp.rotSpeed.x * delta;
        sp.mesh.rotation.y += sp.rotSpeed.y * delta;
        sp.mesh.rotation.z += sp.rotSpeed.z * delta;
      }
      if (sp.scaleSpeed) {
        sp.mesh.scale.multiplyScalar(1 + sp.scaleSpeed * delta);
      }
      const opacity = Math.max(0, sp.lifetime / sp.maxLifetime);
      if (sp.mesh.material) {
        sp.mesh.material.opacity = opacity;
      } else {
        sp.mesh.traverse?.((c: any) => {
          if (c.isMesh && c.material) c.material.opacity = opacity;
        });
      }
      if (sp.lifetime <= 0) {
        this.scene.remove(sp.mesh);
        sp.mesh.traverse?.((c: any) => {
          if (c.isMesh) {
            c.geometry?.dispose();
            c.material?.dispose();
          }
        });
        this.sparks.splice(i, 1);
      }
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      exp.lifetime -= delta;
      const scaleInc = 1 + exp.scaleSpeed * delta;
      exp.mesh.scale.multiplyScalar(scaleInc);
      const opacity = Math.max(0, exp.lifetime / exp.maxLifetime);
      exp.mesh.traverse?.((c: any) => {
        if (c.isMesh && c.material) c.material.opacity = opacity;
      });
      if (exp.lifetime <= 0) {
        this.scene.remove(exp.mesh);
        exp.mesh.traverse?.((c: any) => {
          if (c.isMesh) {
            c.geometry?.dispose();
            c.material?.dispose();
          }
        });
        this.explosions.splice(i, 1);
      }
    }
  }

  public dispose() {
    if (this.muzzleLight) {
      this.scene.remove(this.muzzleLight);
    }
    if (this.muzzleFlashGroup) {
      this.scene.remove(this.muzzleFlashGroup);
      this.muzzleFlashGroup.traverse?.((c: any) => {
        if (c.isMesh) {
          c.geometry?.dispose();
          c.material?.dispose();
        }
      });
    }
    for (const ft of this.floatingTexts) {
      this.scene.remove(ft.sprite);
      ft.sprite.material.map?.dispose();
      ft.sprite.material.dispose();
    }
    this.floatingTexts = [];
    for (const sp of this.sparks) {
      this.scene.remove(sp.mesh);
      sp.mesh.traverse?.((c: any) => {
        if (c.isMesh) {
          c.geometry?.dispose();
          c.material?.dispose();
        }
      });
    }
    this.sparks = [];
    for (const exp of this.explosions) {
      this.scene.remove(exp.mesh);
      exp.mesh.traverse?.((c: any) => {
        if (c.isMesh) {
          c.geometry?.dispose();
          c.material?.dispose();
        }
      });
    }
    this.explosions = [];
  }
}
