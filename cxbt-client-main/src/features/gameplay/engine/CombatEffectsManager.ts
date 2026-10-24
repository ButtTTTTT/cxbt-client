import * as THREE from 'three';

export interface FloatingTextPoolItem {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: any;
  material: any;
  sprite: any;
}

export interface FloatingDamageText {
  sprite: any;
  position: any;
  velocity: any;
  lifetime: number;
  maxLifetime: number;
  poolItem?: FloatingTextPoolItem;
}

export interface SparkParticle {
  mesh: any;
  velocity?: any;
  gravity?: number;
  rotSpeed?: any;
  spinSpeed?: number;
  scaleSpeed?: number;
  frames?: any[];
  baseOpacity?: number;
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
 * 负责：3D 浮动伤害/治疗跳字、Q版星芒枪口火焰、3D 弹道曳光束、抛壳物理、近战刀光弧、弹道撞墙火花、范围爆炸气浪特效、
 * 以及原版 vfx_shenghua_atomizing_attack1_3rd 燃烧器火焰喷射流与 vfx_wing_trail 翅膀流光尾迹
 */
export class CombatEffectsManager {
  public scene: any;
  public muzzleLight: any;
  public muzzleFlashGroup: any;

  private static sharedSparkTorusGeo = new THREE.TorusGeometry(0.12, 0.025, 6, 12);
  private static sharedSparkBoxGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  // 静态模块级特效贴图与序列帧缓存，避免每次进入战场时重复发起 42 个贴图网络解码请求及显存泄漏
  private static sharedVfxCacheInitialized = false;
  private static sharedFireCoreFrames: any[] = [];
  private static sharedFireSmokeFrames: any[] = [];
  private static sharedSparkTileFrames: any[] = [];
  private static sharedVfxTextures: Record<string, any> = {};
  private static pendingMuzzleJetCallbacks: Array<(tex: any) => void> = [];

  private floatingTexts: FloatingDamageText[] = [];
  private floatingTextPool: FloatingTextPoolItem[] = [];
  private sparks: SparkParticle[] = [];
  private explosions: ExplosionEffect[] = [];
  private muzzleTimer: number = 0;

  private fireCoreFrames: any[] = [];
  private fireSmokeFrames: any[] = [];
  private sparkTileFrames: any[] = [];
  private vfxTextures: Record<string, any> = {};

  constructor(scene: any) {
    this.scene = scene;
    this.initVfxTextures();
    this.initFloatingTextPool(10);

    // 枪口火焰动态光源
    this.muzzleLight = new THREE.PointLight(0xffb03a, 0, 14);
    scene.add(this.muzzleLight);

    // 3D 定向十字火舌 + 正面星芒枪口火焰组 (朝向 +Z 轴，开火时自动对齐准星方向 aimDir)
    this.muzzleFlashGroup = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0xfffbeb,
        transparent: true,
        opacity: 0.96,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    core.position.z = 0.06;
    this.muzzleFlashGroup.add(core);

    const finMat = new THREE.MeshBasicMaterial({
      color: 0xff9800,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.44, 6), finMat);
      fin.rotation.z = (i * Math.PI) / 2;
      fin.position.set(Math.cos((i * Math.PI) / 2) * 0.16, Math.sin((i * Math.PI) / 2) * 0.16, 0.05);
      this.muzzleFlashGroup.add(fin);
    }

    // 沿枪管向前喷射的十字火舌平面 (复刻 vfx_smg_01_mzflash_3rd / vfx_muzzle_flash_shotgun_side_07)
    const jetGeo = new THREE.PlaneGeometry(0.32, 0.62);
    const jetMat = new THREE.MeshBasicMaterial({
      color: 0xffb74d,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const jetPlaneA = new THREE.Mesh(jetGeo, jetMat);
    jetPlaneA.name = 'muzzle_jet_a';
    jetPlaneA.rotation.x = Math.PI / 2;
    jetPlaneA.position.z = 0.28;
    this.muzzleFlashGroup.add(jetPlaneA);

    const jetPlaneB = new THREE.Mesh(jetGeo, jetMat);
    jetPlaneB.name = 'muzzle_jet_b';
    jetPlaneB.rotation.x = Math.PI / 2;
    jetPlaneB.rotation.y = Math.PI / 2;
    jetPlaneB.position.z = 0.28;
    this.muzzleFlashGroup.add(jetPlaneB);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.20, 0.024, 6, 16),
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    ring.name = 'muzzle_ring';
    ring.position.z = 0.08;
    this.muzzleFlashGroup.add(ring);

    this.muzzleFlashGroup.visible = false;
    scene.add(this.muzzleFlashGroup);
  }

  private createFloatingTextPoolItem(): FloatingTextPoolItem | null {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    return { canvas, ctx, texture, material, sprite };
  }

  private initFloatingTextPool(size: number) {
    for (let i = 0; i < size; i++) {
      const item = this.createFloatingTextPoolItem();
      if (item) this.floatingTextPool.push(item);
    }
  }

  private acquireFloatingTextItem(): FloatingTextPoolItem | null {
    if (this.floatingTextPool.length > 0) {
      return this.floatingTextPool.pop()!;
    }
    if (this.floatingTexts.length >= 10) {
      for (let i = 0; i < this.floatingTexts.length; i++) {
        if (this.floatingTexts[i].poolItem) {
          const recycled = this.floatingTexts.splice(i, 1)[0];
          this.scene.remove(recycled.sprite);
          return recycled.poolItem!;
        }
      }
    }
    return this.createFloatingTextPoolItem();
  }

  private applyMuzzleJetTexture(tex: any) {
    if (!tex || !this.muzzleFlashGroup) return;
    const jetA = this.muzzleFlashGroup.getObjectByName('muzzle_jet_a');
    const jetB = this.muzzleFlashGroup.getObjectByName('muzzle_jet_b');
    if (jetA?.material) {
      jetA.material.map = tex;
      jetA.material.needsUpdate = true;
    }
    if (jetB?.material) {
      jetB.material.map = tex;
      jetB.material.needsUpdate = true;
    }
  }

  private initVfxTextures() {
    this.fireCoreFrames = CombatEffectsManager.sharedFireCoreFrames;
    this.fireSmokeFrames = CombatEffectsManager.sharedFireSmokeFrames;
    this.sparkTileFrames = CombatEffectsManager.sharedSparkTileFrames;
    this.vfxTextures = CombatEffectsManager.sharedVfxTextures;

    const existingJetTex = CombatEffectsManager.sharedVfxTextures['vfx_muzzle_flash_shotgun_side_07'];
    if (existingJetTex) {
      queueMicrotask(() => this.applyMuzzleJetTexture(existingJetTex));
    } else {
      CombatEffectsManager.pendingMuzzleJetCallbacks.push((tex) => this.applyMuzzleJetTexture(tex));
    }

    if (CombatEffectsManager.sharedVfxCacheInitialized) return;
    CombatEffectsManager.sharedVfxCacheInitialized = true;

    const loader = new THREE.TextureLoader();
    const baseUrl = `${import.meta.env.BASE_URL || '/'}assets/gameplay/vfx/`;
    const slice4x4 = (file: string, target: any[]) => {
      loader.load(
        `${baseUrl}${file}`,
        (tex: any) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          for (let i = 0; i < 16; i++) {
            const col = i % 4;
            const row = Math.floor(i / 4);
            const f = tex.clone();
            f.repeat.set(0.25, 0.25);
            f.offset.set(col * 0.25, 0.75 - row * 0.25);
            f.needsUpdate = true;
            target.push(f);
          }
        },
        undefined,
        () => undefined
      );
    };
    slice4x4('vfx_fire_small_d.png', CombatEffectsManager.sharedFireCoreFrames);
    slice4x4('vfx_fire_small_d2.png', CombatEffectsManager.sharedFireSmokeFrames);
    slice4x4('vfx_spark_tile.png', CombatEffectsManager.sharedSparkTileFrames);

    const textureKeys = [
      'vfx_glow',
      'vfx_glowray3',
      'vfx_glowray4',
      'vfx_glowray5',
      'vfx_glowray8',
      'vfx_glowray10',
      'vfx_glow_green1',
      'vfx_glow_green',
      'vfx_glow_purple1',
      'vfx_wing23',
      'vfx_shower',
      'fireball02',
      'vfx_muzzle_tile_02',
      'vfx_muzzle_tile_04',
      'vfx_muzzle_flash_shotgun_side_07',
      'vfx_muzzle_flash_shotgun_02',
      'vfx_muzzle_flash_b',
      'vfx_muzfl_side',
      'vfx_explosion_org01',
      'vfx_anim_smoke_02',
      'vfx_smoke_white',
      'vfx_glow_5',
      'vfx_glow_7',
      'vfx_glow_9',
      'vfx_bullet_smg',
      'vfx_bullet_machinegun',
      'vfx_bullet_pistol',
      'vfx_bullet_sniperrifle',
      'vfx_radial_flare_05',
      'vfx_circle_white',
      'vfx_gun_trail2',
      'vfx_smoke12',
      'vfx_smoke3',
      'vfx_bom3',
      'vfx_Glow_Flare',
      'vfx_spark_group',
      'vfx_radial_flare02',
      'vfx_star2',
    ];

    for (const key of textureKeys) {
      loader.load(
        `${baseUrl}${key}.png`,
        (tex: any) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          CombatEffectsManager.sharedVfxTextures[key] = tex;
          if (key === 'vfx_muzzle_flash_shotgun_side_07') {
            const cbs = CombatEffectsManager.pendingMuzzleJetCallbacks.splice(0);
            for (const cb of cbs) cb(tex);
          }
        },
        undefined,
        () => undefined
      );
    }
  }

  /**
   * 1:1 复刻《创想兵团》全武器家族开火枪口特效、弓弩弦光、RPG尾焰、硝烟与定制抛壳
   * 对应原版 vfx_*_mzflash_3rd.vfx / vfx_*_bullets_out_3rd.vfx / vfx_s_bow_glow.vfx / vfx_s_crossbow_glow.vfx
   */
  public triggerMuzzleFlash(
    muzzlePos: any,
    duration: number = 0.08,
    aimDir?: any,
    weaponId?: string
  ) {
    const family = (weaponId || 'smg_01').toLowerCase().split('_')[0];
    const dir = aimDir ? aimDir.clone().normalize() : new THREE.Vector3(0, 0, 1);
    const rightVec = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    if (rightVec.lengthSq() < 0.01) rightVec.set(1, 0, 0);

    // 1. 弓箭 / 十字弓 (bow / crossbow)：触发弦光脉冲与能量扩散环 (vfx_s_bow_glow / vfx_s_crossbow_glow)，无火药枪焰与弹壳
    if (family === 'bow' || family === 'crossbow') {
      const isCrossbow = family === 'crossbow';
      const glowColor = isCrossbow ? 0x34d399 : 0x38bdf8;
      if (this.muzzleLight) {
        this.muzzleLight.position.copy(muzzlePos);
        this.muzzleLight.color.setHex(glowColor);
        this.muzzleLight.intensity = 5.5;
      }
      if (this.muzzleFlashGroup) {
        this.muzzleFlashGroup.visible = false;
      }
      this.muzzleTimer = duration;

      const flareTex = this.vfxTextures.vfx_radial_flare_05 || this.vfxTextures.vfx_circle_white || this.vfxTextures.vfx_glow || null;
      const flareSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: flareTex,
          color: glowColor,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          rotation: Math.random() * Math.PI * 2
        })
      );
      flareSprite.position.copy(muzzlePos);
      flareSprite.scale.set(0.68, 0.68, 0.68);
      this.scene.add(flareSprite);
      this.sparks.push({
        mesh: flareSprite,
        scaleSpeed: 3.5,
        spinSpeed: 4.5,
        baseOpacity: 0.95,
        lifetime: 0.16,
        maxLifetime: 0.16
      });

      const pulseRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.18, 0.022, 6, 18),
        new THREE.MeshBasicMaterial({
          color: isCrossbow ? 0xa7f3d0 : 0xbae6fd,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      pulseRing.position.copy(muzzlePos);
      pulseRing.lookAt(muzzlePos.clone().add(dir));
      this.scene.add(pulseRing);
      this.sparks.push({
        mesh: pulseRing,
        velocity: dir.clone().multiplyScalar(2.4),
        scaleSpeed: 5.2,
        baseOpacity: 0.9,
        lifetime: 0.18,
        maxLifetime: 0.18
      });
      return;
    }

    // 2. 火药枪械 / 霰弹枪 / 狙击枪 / 重机枪 / 火箭筒 / 榴弹枪
    const isShotgun = family === 'shotgun';
    const isSniper = family === 'sniperrifle';
    const isMG = family === 'machinegun';
    const isRPG = family === 'rpg';
    const isGL = family === 'grenadelauncher';

    const flashColor = isRPG || isShotgun ? 0xff7700 : isSniper ? 0xfef08a : 0xffb03a;
    if (this.muzzleLight) {
      this.muzzleLight.position.copy(muzzlePos);
      this.muzzleLight.color.setHex(flashColor);
      this.muzzleLight.intensity = isShotgun || isRPG || isSniper ? 9.5 : 7.0;
    }

    if (this.muzzleFlashGroup) {
      this.muzzleFlashGroup.position.copy(muzzlePos);
      this.muzzleFlashGroup.lookAt(muzzlePos.clone().add(dir));
      this.muzzleFlashGroup.rotateZ(Math.random() * Math.PI * 2);
      const baseScale = isShotgun ? 1.48 : isRPG ? 1.55 : isSniper ? 1.38 : isMG ? 1.25 : 0.95;
      const s = baseScale * (0.88 + Math.random() * 0.32);
      this.muzzleFlashGroup.scale.set(s, s, s * (isSniper ? 1.45 : 1.1));
      this.muzzleFlashGroup.visible = true;
    }
    this.muzzleTimer = isShotgun || isRPG || isSniper ? Math.max(duration, 0.10) : duration;

    // 枪口正面贴图火光精灵 (vfx_explosion_org01 / vfx_muzzle_flash_shotgun_02 / vfx_muzzle_tile_02)
    const frontTex = isShotgun
      ? (this.vfxTextures.vfx_muzzle_flash_shotgun_02 || this.vfxTextures.vfx_explosion_org01)
      : isRPG || isGL
        ? (this.vfxTextures.vfx_muzzle_tile_04 || this.vfxTextures.vfx_explosion_org01)
        : (this.vfxTextures.vfx_explosion_org01 || this.vfxTextures.vfx_muzzle_tile_02 || this.vfxTextures.vfx_glow_5);
    if (frontTex) {
      const flashSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: frontTex,
          color: isSniper ? 0xfffbeb : 0xffedd5,
          transparent: true,
          opacity: 0.96,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          rotation: Math.random() * Math.PI * 2
        })
      );
      flashSprite.position.copy(muzzlePos).addScaledVector(dir, 0.14);
      const spScale = isShotgun || isRPG ? 0.88 : isSniper || isMG ? 0.72 : 0.54;
      flashSprite.scale.set(spScale, spScale, spScale);
      this.scene.add(flashSprite);
      this.sparks.push({
        mesh: flashSprite,
        scaleSpeed: 3.2,
        baseOpacity: 0.96,
        lifetime: 0.085,
        maxLifetime: 0.085
      });
    }

    // 枪口硝烟粒子 (vfx_anim_smoke_02 / vfx_smoke_white)
    const smokeTex = this.vfxTextures.vfx_anim_smoke_02 || this.vfxTextures.vfx_smoke_white || this.fireSmokeFrames[4];
    if (smokeTex) {
      const smokeCount = isShotgun || isRPG || isGL ? 3 : 1;
      for (let i = 0; i < smokeCount; i++) {
        const smokeSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: smokeTex,
            color: isRPG ? 0xd6d3d1 : 0xe2e8f0,
            transparent: true,
            opacity: isShotgun || isRPG ? 0.46 : 0.28,
            depthWrite: false,
            rotation: Math.random() * Math.PI * 2
          })
        );
        smokeSprite.position.copy(muzzlePos).addScaledVector(dir, 0.22 + i * 0.15);
        const smScale = (isShotgun || isRPG ? 0.45 : 0.28) + Math.random() * 0.15;
        smokeSprite.scale.set(smScale, smScale, smScale);
        this.scene.add(smokeSprite);
        this.sparks.push({
          mesh: smokeSprite,
          velocity: dir.clone().multiplyScalar(1.8 + Math.random() * 1.4).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.85, (Math.random() - 0.5) * 0.6)),
          gravity: 1.5,
          spinSpeed: (Math.random() - 0.5) * 2.5,
          scaleSpeed: 2.6,
          baseOpacity: isShotgun || isRPG ? 0.46 : 0.28,
          lifetime: 0.32,
          maxLifetime: 0.32
        });
      }
    }

    // 霰弹枪额外喷射 6 颗高温火星颗粒 (vfx_shotgun_01_mzflash_3rd)
    if (isShotgun) {
      for (let i = 0; i < 6; i++) {
        const pelletSpark = new THREE.Mesh(
          new THREE.SphereGeometry(0.03, 6, 6),
          new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xfef08a : 0xff7b00, transparent: true, opacity: 0.95 })
        );
        pelletSpark.position.copy(muzzlePos);
        this.scene.add(pelletSpark);
        const spread = new THREE.Vector3((Math.random() - 0.5) * 3.5, (Math.random() - 0.3) * 2.5, (Math.random() - 0.5) * 3.5);
        this.sparks.push({
          mesh: pelletSpark,
          velocity: dir.clone().multiplyScalar(14 + Math.random() * 6).add(spread),
          gravity: -6.0,
          lifetime: 0.18,
          maxLifetime: 0.18
        });
      }
    }

    // RPG 火箭筒专属：筒尾后喷尾焰与气浪浓烟 (Gun_backFire / vfx_rpg_01_mzflash_3rd)
    if (isRPG) {
      const backPos = muzzlePos.clone().addScaledVector(dir, -0.82);
      const backCone = new THREE.Mesh(
        new THREE.ConeGeometry(0.24, 0.75, 8, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xff8c00,
          transparent: true,
          opacity: 0.78,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      backCone.position.copy(backPos);
      backCone.lookAt(backPos.clone().sub(dir));
      backCone.rotateX(Math.PI / 2);
      this.scene.add(backCone);
      this.sparks.push({
        mesh: backCone,
        scaleSpeed: 2.8,
        baseOpacity: 0.78,
        lifetime: 0.15,
        maxLifetime: 0.15
      });
      return;
    }

    // 3. 武器专属抛壳物理特效 (vfx_*_bullets_out_3rd.vfx)
    // 定位到枪身右侧抛壳窗 (Gun_TG) 并向右上方旋转抛出
    const ejectOrigin = muzzlePos.clone().addScaledVector(dir, -0.22).addScaledVector(rightVec, 0.08);
    const shellColor = isShotgun ? 0xdc2626 : isGL ? 0xd97706 : 0xfbbf24;
    const shellRadius = isShotgun ? 0.022 : isGL ? 0.032 : isSniper || isMG ? 0.016 : 0.013;
    const shellLen = isShotgun ? 0.072 : isGL ? 0.085 : isSniper ? 0.078 : isMG ? 0.068 : 0.048;

    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(shellRadius, shellRadius, shellLen, 8),
      new THREE.MeshBasicMaterial({ color: shellColor })
    );
    shell.position.copy(ejectOrigin);
    this.scene.add(shell);

    const ejectVel = rightVec
      .clone()
      .multiplyScalar(1.8 + Math.random() * 1.4)
      .add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 2.3 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6));

    this.sparks.push({
      mesh: shell,
      velocity: ejectVel,
      rotSpeed: new THREE.Vector3(16, 22, 14),
      lifetime: 0.48,
      maxLifetime: 0.48
    });
  }

  /**
   * 生成 3D 双层高亮激光/曳光弹道光束 (从枪口 Gun_Fire 直达准星落点)
   */
  public spawnBulletTracer(from: any, to: any, color: number = 0xfef08a) {
    const dist = from.distanceTo(to);
    if (dist < 0.2) return;

    const mid = from.clone().add(to).multiplyScalar(0.5);
    const dir = to.clone().sub(from).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    const group = new THREE.Group();
    group.position.copy(mid);
    group.quaternion.copy(quat);

    // 内层高亮弹芯线
    const coreGeo = new THREE.CylinderGeometry(0.016, 0.016, dist, 6);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    group.add(new THREE.Mesh(coreGeo, coreMat));

    // 外层光晕曳光护套
    const glowGeo = new THREE.CylinderGeometry(0.042, 0.028, dist, 6);
    const glowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    group.add(new THREE.Mesh(glowGeo, glowMat));

    this.scene.add(group);

    this.sparks.push({
      mesh: group,
      baseOpacity: 0.9,
      lifetime: 0.095,
      maxLifetime: 0.095
    });
  }

  /**
   * 生成近战 3D 弧形刀光特效 (1:1 复刻 vfx_knives_trail / vfx_shield_trail，支持三段连击变色与原版刀光贴图)
   */
  public spawnMeleeSlash(origin: any, aimDir: any, comboStep: number = 1, weaponId?: string) {
    const family = (weaponId || 'knives_01').toLowerCase().split('_')[0];
    const colors = family === 'shield'
      ? [0x38bdf8, 0x60a5fa, 0xfbbf24]
      : [0x38bdf8, 0xfacc15, 0xf43f5e];
    const color = colors[(Math.max(1, comboStep) - 1) % colors.length];
    const slashTex = family === 'shield'
      ? (this.vfxTextures.vfx_glowray3 || this.vfxTextures.vfx_glowray10)
      : (this.vfxTextures.vfx_glowray5 || this.vfxTextures.vfx_glowray8);

    const group = new THREE.Group();
    const arcGeo = new THREE.TorusGeometry(1.18, 0.085, 8, 28, Math.PI * 0.92);
    const arcMat = new THREE.MeshBasicMaterial({
      map: slashTex || null,
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const arc = new THREE.Mesh(arcGeo, arcMat);
    arc.rotation.x = Math.PI / 2;
    if (comboStep % 2 === 0) arc.rotation.y = 0.45;
    else if (comboStep % 3 === 0) arc.rotation.y = -0.55;
    group.add(arc);

    // 内层高亮刀锋白光弧
    const innerArc = new THREE.Mesh(
      new THREE.TorusGeometry(1.12, 0.032, 6, 24, Math.PI * 0.85),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    innerArc.rotation.copy(arc.rotation);
    group.add(innerArc);

    const flatDir = new THREE.Vector3(aimDir.x, 0, aimDir.z).normalize();
    group.position.copy(origin).add(new THREE.Vector3(0, 1.05, 0)).addScaledVector(flatDir, 0.65);
    group.rotation.y = Math.atan2(flatDir.x, flatDir.z) - Math.PI * 0.42;

    this.scene.add(group);
    this.sparks.push({
      mesh: group,
      velocity: flatDir.clone().multiplyScalar(4.8),
      scaleSpeed: 2.8,
      baseOpacity: 0.95,
      lifetime: 0.19,
      maxLifetime: 0.19
    });
  }

  /**
   * 生成 3D 浮动伤害跳字 (复用预分配 CanvasTexture/Sprite 对象池，彻底消除开火命中时的 Canvas/WebGL 创建卡顿)
   */
  public spawnFloatingDamage(
    pos: any,
    damage: number,
    isHeadshot: boolean = false,
    isPlayer: boolean = false
  ) {
    const now = performance.now();
    const lastSpawnAt = (this as any)._lastFloatingDmgAt || 0;
    if (now - lastSpawnAt < 55 && this.floatingTexts.length > 3) {
      return;
    }
    (this as any)._lastFloatingDmgAt = now;
    const rounded = Math.max(1, Math.round(damage));
    const item = this.acquireFloatingTextItem();
    if (!item) return;

    const { ctx, texture, material, sprite } = item;
    ctx.clearRect(0, 0, 320, 64);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = isHeadshot ? `💥 爆头 -${rounded}!` : `-${rounded}`;
    ctx.font = isHeadshot ? 'bold 32px sans-serif' : 'bold 28px sans-serif';

    ctx.lineWidth = 5;
    ctx.strokeStyle = isHeadshot ? '#7f1d1d' : (isPlayer ? '#450a0a' : '#0f172a');
    ctx.strokeText(text, 160, 32);

    ctx.fillStyle = isHeadshot ? '#fbbf24' : (isPlayer ? '#ef4444' : '#f8fafc');
    ctx.fillText(text, 160, 32);

    texture.needsUpdate = true;
    material.opacity = 1;
    sprite.position.set(
      pos.x + (Math.random() - 0.5) * 0.3,
      pos.y + 0.35,
      pos.z + (Math.random() - 0.5) * 0.3
    );
    const scale = isHeadshot ? 1.7 : 1.3;
    sprite.scale.set(scale * 1.5, scale * 0.4, 1);
    this.scene.add(sprite);

    const maxLifetime = isHeadshot ? 1.0 : 0.75;
    this.floatingTexts.push({
      sprite,
      position: sprite.position,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.6, 2.1 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6),
      lifetime: maxLifetime,
      maxLifetime,
      poolItem: item
    });
  }

  /**
   * 生成 3D 浮动治疗跳字 (复用预分配对象池，消除复活/加血瞬间的 GPU 纹理创建卡顿)
   */
  public spawnFloatingHeal(pos: any, amount: number) {
    const rounded = Math.max(1, Math.round(amount));
    const item = this.acquireFloatingTextItem();
    if (!item) return;

    const { ctx, texture, material, sprite } = item;
    ctx.clearRect(0, 0, 320, 64);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = `💚 +${rounded}`;
    ctx.font = 'bold 28px sans-serif';

    ctx.lineWidth = 5;
    ctx.strokeStyle = '#064e3b';
    ctx.strokeText(text, 160, 32);

    ctx.fillStyle = '#4ade80';
    ctx.fillText(text, 160, 32);

    texture.needsUpdate = true;
    material.opacity = 1;
    sprite.position.set(
      pos.x + (Math.random() - 0.5) * 0.25,
      pos.y + 0.45,
      pos.z + (Math.random() - 0.5) * 0.25
    );
    sprite.scale.set(1.9, 0.5, 1);
    this.scene.add(sprite);

    this.floatingTexts.push({
      sprite,
      position: sprite.position,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.9, (Math.random() - 0.5) * 0.4),
      lifetime: 0.85,
      maxLifetime: 0.85,
      poolItem: item
    });
  }

  /**
   * 生成撞墙与命中四溅火花 (融合原版 vfx_Glow_Flare / vfx_spark_group 贴图闪光，共享几何体消除 GC)
   */
  public spawnImpactSpark(point: any, color: number = 0xfef08a) {
    const now = performance.now();
    const lastSparkAt = (this as any)._lastImpactSparkAt || 0;
    if (now - lastSparkAt < 28 && this.sparks.length > 24) {
      return;
    }
    (this as any)._lastImpactSparkAt = now;

    const ring = new THREE.Mesh(
      CombatEffectsManager.sharedSparkTorusGeo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    ring.userData.sharedGeo = true;
    ring.position.copy(point);
    ring.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    this.scene.add(ring);
    this.sparks.push({ mesh: ring, scaleSpeed: 6.5, lifetime: 0.14, maxLifetime: 0.14 });

    const flareTex = this.vfxTextures.vfx_Glow_Flare || this.vfxTextures.vfx_spark_group || this.vfxTextures.vfx_glow;
    if (flareTex) {
      const flare = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: flareTex,
          color,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          rotation: Math.random() * Math.PI * 2
        })
      );
      flare.position.copy(point);
      flare.scale.set(0.52, 0.52, 0.52);
      this.scene.add(flare);
      this.sparks.push({
        mesh: flare,
        scaleSpeed: 2.5,
        baseOpacity: 0.95,
        lifetime: 0.15,
        maxLifetime: 0.15
      });
    }

    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? color : 0xf97316, transparent: true, opacity: 0.95 });
      const mesh = new THREE.Mesh(CombatEffectsManager.sharedSparkBoxGeo, mat);
      mesh.userData.sharedGeo = true;
      mesh.position.copy(point);
      this.scene.add(mesh);
      this.sparks.push({
        mesh,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 5.5, 1.8 + Math.random() * 3.8, (Math.random() - 0.5) * 5.5),
        rotSpeed: new THREE.Vector3(10, 12, 8),
        lifetime: 0.20,
        maxLifetime: 0.20
      });
    }
  }

  /**
   * 生成范围爆炸光浪与冲击环 (1:1 复刻 vfx_grenade_explosion.vfx: vfx_bom3 + vfx_smoke12 + vfx_radial_flare02)
   */
  public spawnExplosionEffect(point: any) {
    const geom = new THREE.SphereGeometry(1.4, 14, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(point);
    this.scene.add(mesh);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.95, depthWrite: false })
    );
    mesh.add(core);

    const shockwave = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.12, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.9, depthWrite: false })
    );
    shockwave.rotation.x = Math.PI / 2;
    mesh.add(shockwave);

    this.explosions.push({
      mesh,
      scaleSpeed: 5.8,
      lifetime: 0.38,
      maxLifetime: 0.38
    });

    // 原版 vfx_bom3 / vfx_radial_flare02 核心爆裂火球精灵与 vfx_smoke12 翻滚黑烟
    const bomTex = this.vfxTextures.vfx_bom3 || this.vfxTextures.vfx_radial_flare02 || this.fireCoreFrames[3];
    if (bomTex) {
      const bomSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: bomTex,
          color: 0xffedd5,
          transparent: true,
          opacity: 0.98,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          rotation: Math.random() * Math.PI * 2
        })
      );
      bomSprite.position.copy(point).add(new THREE.Vector3(0, 0.35, 0));
      bomSprite.scale.set(2.8, 2.8, 2.8);
      this.scene.add(bomSprite);
      this.sparks.push({
        mesh: bomSprite,
        scaleSpeed: 3.4,
        baseOpacity: 0.98,
        lifetime: 0.32,
        maxLifetime: 0.32
      });
    }

    const expSmokeTex = this.vfxTextures.vfx_smoke12 || this.vfxTextures.vfx_smoke3 || this.fireSmokeFrames[6];
    if (expSmokeTex) {
      for (let i = 0; i < 4; i++) {
        const sm = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: expSmokeTex,
            color: 0x94a3b8,
            transparent: true,
            opacity: 0.65,
            depthWrite: false,
            rotation: Math.random() * Math.PI * 2
          })
        );
        sm.position.copy(point).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.4 + i * 0.25, (Math.random() - 0.5) * 1.2));
        sm.scale.set(1.6, 1.6, 1.6);
        this.scene.add(sm);
        this.sparks.push({
          mesh: sm,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 3.2, 2.4 + Math.random() * 1.8, (Math.random() - 0.5) * 3.2),
          gravity: 1.2,
          spinSpeed: (Math.random() - 0.5) * 2.2,
          scaleSpeed: 2.2,
          baseOpacity: 0.65,
          lifetime: 0.55,
          maxLifetime: 0.55
        });
      }
    }

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
   * 创想兵团原版【燃烧器 / 生化喷射器 (sprayer_01..45 / vfx_shenghua_atomizing_attack1_3rd.vfx)】
   * 1:1 复刻三层粒子流：
   *  - Layer 1 (atomizing01): textures/vfx_fire_small_d.dds (4x4 16帧火焰序列帧 + Additive 叠加发光)
   *  - Layer 2 (atomizing01): textures/vfx_fire_small_d2.dds (4x4 16帧热浪浓烟火焰序列帧)
   *  - Layer 3 (particle):    textures/vfx_spark_tile.dds (4x4 16帧高速飞溅火星余烬)
   */
  public spawnSprayerMistCone(muzzlePos: any, aimDir: any) {
    const dir = aimDir.clone().normalize();

    if (this.muzzleLight) {
      this.muzzleLight.position.copy(muzzlePos).addScaledVector(dir, 1.2);
      this.muzzleLight.color.setHex(0xff6b00);
      this.muzzleLight.intensity = 9.0;
      this.muzzleTimer = Math.max(this.muzzleTimer, 0.12);
    }

    // 喷口高速火舌气浪锥 (Additive Volumetric Flame Jet)
    const coneGroup = new THREE.Group();
    const outerCone = new THREE.Mesh(
      new THREE.ConeGeometry(1.15, 6.0, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff5500,
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    outerCone.rotation.x = -Math.PI / 2;
    outerCone.position.z = 3.0;
    coneGroup.add(outerCone);

    const innerCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 4.6, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    innerCone.rotation.x = -Math.PI / 2;
    innerCone.position.z = 2.3;
    coneGroup.add(innerCone);

    coneGroup.position.copy(muzzlePos);
    coneGroup.lookAt(muzzlePos.clone().add(dir));
    this.scene.add(coneGroup);
    this.sparks.push({
      mesh: coneGroup,
      scaleSpeed: 1.8,
      baseOpacity: 0.55,
      lifetime: 0.11,
      maxLifetime: 0.11
    });

    // Layer 1: vfx_fire_small_d.dds (4x4 核心烈焰序列帧粒子流)
    for (let i = 0; i < 6; i++) {
      const startDist = 0.25 + i * 0.45 + Math.random() * 0.35;
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 0.42,
        (Math.random() - 0.5) * 0.32,
        (Math.random() - 0.5) * 0.42
      );
      const speed = 13.5 + Math.random() * 6.5;
      const initFrame = Math.min(4, Math.floor(Math.random() * 3));
      const mat = new THREE.SpriteMaterial({
        map: this.fireCoreFrames[initFrame] || this.vfxTextures.fireball02 || null,
        color: i < 2 ? 0xfffbeb : 0xffedd5,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        rotation: Math.random() * Math.PI * 2
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(muzzlePos).addScaledVector(dir, startDist).addScaledVector(spread, 0.35);
      const initScale = 0.65 + (i / 6) * 0.65;
      sprite.scale.set(initScale, initScale, initScale);
      this.scene.add(sprite);

      const maxLife = 0.32 + Math.random() * 0.14;
      this.sparks.push({
        mesh: sprite,
        velocity: dir.clone().multiplyScalar(speed).add(spread.multiplyScalar(3.2)),
        gravity: 2.6, // 火焰热浮力上扬
        spinSpeed: (Math.random() - 0.5) * 6.5,
        scaleSpeed: 3.8,
        frames: this.fireCoreFrames.length === 16 ? this.fireCoreFrames : undefined,
        baseOpacity: 0.95,
        lifetime: maxLife,
        maxLifetime: maxLife
      });
    }

    // Layer 2: vfx_fire_small_d2.dds (4x4 外围翻滚热浪火焰浓烟序列帧)
    for (let i = 0; i < 4; i++) {
      const startDist = 0.6 + i * 0.75 + Math.random() * 0.4;
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 0.65,
        (Math.random() - 0.5) * 0.45,
        (Math.random() - 0.5) * 0.65
      );
      const speed = 10.5 + Math.random() * 5.0;
      const mat = new THREE.SpriteMaterial({
        map: this.fireSmokeFrames[0] || this.fireCoreFrames[0] || null,
        color: 0xffb366,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        rotation: Math.random() * Math.PI * 2
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(muzzlePos).addScaledVector(dir, startDist).addScaledVector(spread, 0.4);
      const initScale = 0.85 + (i / 4) * 0.75;
      sprite.scale.set(initScale, initScale, initScale);
      this.scene.add(sprite);

      const maxLife = 0.38 + Math.random() * 0.15;
      this.sparks.push({
        mesh: sprite,
        velocity: dir.clone().multiplyScalar(speed).add(spread.multiplyScalar(2.6)),
        gravity: 3.2,
        spinSpeed: (Math.random() - 0.5) * 4.5,
        scaleSpeed: 3.2,
        frames: this.fireSmokeFrames.length === 16 ? this.fireSmokeFrames : undefined,
        baseOpacity: 0.82,
        lifetime: maxLife,
        maxLifetime: maxLife
      });
    }

    // Layer 3: vfx_spark_tile.dds (4x4 飞溅火星余烬粒子)
    for (let i = 0; i < 5; i++) {
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 2.8,
        (Math.random() - 0.3) * 2.4,
        (Math.random() - 0.5) * 2.8
      );
      const speed = 15.0 + Math.random() * 8.0;
      const mat = new THREE.SpriteMaterial({
        map: this.sparkTileFrames[Math.floor(Math.random() * Math.max(1, this.sparkTileFrames.length))] || this.vfxTextures.vfx_glow || null,
        color: i % 2 === 0 ? 0xfef08a : 0xff7b00,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sparkSprite = new THREE.Sprite(mat);
      sparkSprite.position.copy(muzzlePos).addScaledVector(dir, 0.3 + Math.random() * 1.2);
      const s = 0.28 + Math.random() * 0.22;
      sparkSprite.scale.set(s, s, s);
      this.scene.add(sparkSprite);

      const maxLife = 0.28 + Math.random() * 0.16;
      this.sparks.push({
        mesh: sparkSprite,
        velocity: dir.clone().multiplyScalar(speed).add(spread),
        gravity: -3.5,
        scaleSpeed: -0.8,
        frames: this.sparkTileFrames.length === 16 ? this.sparkTileFrames : undefined,
        baseOpacity: 1.0,
        lifetime: maxLife,
        maxLifetime: maxLife
      });
    }
  }

  private lastWingTrailAt = 0;

  /**
   * 创想兵团原版【翅膀流光尾迹 (vfx_wing01_trail.vfx .. vfx_wing45_trail.vfx)】
   * 在角色穿戴翅膀移动或飞行时，从左右翼尖骨骼 (wing_vfx_l / wing_vfx_r) 持续散落流光羽翼与星芒粒子
   */
  public spawnWingTrail(leftPos: any, rightPos: any, wingId: string = 'wing01', isFlying: boolean = false) {
    const now = performance.now();
    const minInterval = isFlying ? 42 : 68;
    if (now - this.lastWingTrailAt < minInterval) return;
    this.lastWingTrailAt = now;

    const idLower = (wingId || 'wing01').toLowerCase();
    let tex = this.vfxTextures.vfx_glowray4 || this.vfxTextures.vfx_glow;
    let tint = 0x7dd3fc;
    if (idLower.includes('23') || idLower.includes('10') || idLower.includes('43')) {
      tex = this.vfxTextures.vfx_wing23 || this.fireCoreFrames[2] || tex;
      tint = 0xfbbf24;
    } else if (idLower.includes('03')) {
      tex = this.vfxTextures.vfx_glow_green1 || tex;
      tint = 0x4ade80;
    } else if (idLower.includes('04') || idLower.includes('35') || idLower.includes('45')) {
      tex = this.vfxTextures.vfx_glow_purple1 || tex;
      tint = 0xc084fc;
    } else if (idLower.includes('18') || idLower.includes('31') || idLower.includes('32')) {
      tex = this.vfxTextures.vfx_shower || tex;
      tint = 0x38bdf8;
    }

    const tips = [leftPos, rightPos];
    for (const tip of tips) {
      if (!tip) continue;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: tint,
        transparent: true,
        opacity: isFlying ? 0.88 : 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        rotation: (Math.random() - 0.5) * 0.8
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(
        tip.x + (Math.random() - 0.5) * 0.18,
        tip.y + (Math.random() - 0.5) * 0.18,
        tip.z + (Math.random() - 0.5) * 0.18
      );
      const s = (isFlying ? 0.42 : 0.28) + Math.random() * 0.16;
      sprite.scale.set(s, s * 1.35, s);
      this.scene.add(sprite);

      const maxLife = isFlying ? 0.42 : 0.28;
      this.sparks.push({
        mesh: sprite,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.9,
          isFlying ? -1.4 - Math.random() * 1.2 : 0.35 + Math.random() * 0.4,
          (Math.random() - 0.5) * 0.9
        ),
        gravity: 0,
        spinSpeed: (Math.random() - 0.5) * 2.5,
        scaleSpeed: -1.1,
        baseOpacity: isFlying ? 0.88 : 0.62,
        lifetime: maxLife,
        maxLifetime: maxLife
      });
    }
  }

  /**
   * 创想兵团原版【狙击步枪 (vfx_s_sniper_trail / piercing)】螺旋气浪与致命激光束
   */
  public spawnSniperSpiralBeam(from: any, to: any, isCrit: boolean = false) {
    this.spawnBulletTracer(from, to, isCrit ? 0xf43f5e : 0x38bdf8);
    const dist = Math.min(45, from.distanceTo(to));
    const dir = to.clone().sub(from).normalize();
    const steps = Math.max(3, Math.min(12, Math.floor(dist / 3.2)));
    for (let i = 1; i <= steps; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.16 + i * 0.02, 0.022, 6, 16),
        new THREE.MeshBasicMaterial({
          color: isCrit ? 0xfbbf24 : 0x7dd3fc,
          transparent: true,
          opacity: 0.85,
          depthWrite: false
        })
      );
      ring.position.copy(from).addScaledVector(dir, (dist * i) / (steps + 1));
      ring.lookAt(to);
      this.scene.add(ring);
      this.sparks.push({
        mesh: ring,
        scaleSpeed: 4.2,
        lifetime: 0.22,
        maxLifetime: 0.22
      });
    }
  }

  /**
   * 创想兵团原版【生命抽取 / 生命传导 (suckblood / conduction)】3D 汲血光球回流特效
   */
  public spawnLifeLeechOrb(from: any, to: any, color: number = 0x34d399) {
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 10),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 })
    );
    orb.position.copy(from);
    this.scene.add(orb);
    const vel = to.clone().sub(from).multiplyScalar(3.2);
    vel.y += 2.6;
    this.sparks.push({
      mesh: orb,
      velocity: vel,
      scaleSpeed: -0.6,
      lifetime: 0.34,
      maxLifetime: 0.34
    });
  }

  /**
   * 生成 3D 状态提示跳字（如：☠️ 毒刃中毒、🦠 瘟疫感染、🩸 生命傀儡、💔 要害虚弱、🛡️ 盾牌格挡）
   */
  public spawnStatusText(pos: any, label: string, colorHex: string = '#c084fc') {
    const item = this.acquireFloatingTextItem();
    if (!item) return;

    const { ctx, texture, material, sprite } = item;
    ctx.clearRect(0, 0, 320, 64);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 26px sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#090d16';
    ctx.strokeText(label, 160, 32);
    ctx.fillStyle = colorHex;
    ctx.fillText(label, 160, 32);

    texture.needsUpdate = true;
    material.opacity = 1;
    sprite.position.set(pos.x, pos.y + 0.75, pos.z);
    sprite.scale.set(2.2, 0.48, 1);
    this.scene.add(sprite);
    this.floatingTexts.push({
      sprite,
      position: sprite.position,
      velocity: new THREE.Vector3(0, 1.5, 0),
      lifetime: 1.0,
      maxLifetime: 1.0,
      poolItem: item
    });
  }

  /**
   * 生成角色头顶 3D 聊天气泡
   */
  public spawnChatBubble(pos: any, sender: string, text: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 512, 96);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(12, 10, 488, 68, 16);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#fef08a';
    const display = `${sender}: ${text}`.slice(0, 26);
    ctx.fillText(display, 256, 44);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
    );
    sprite.position.copy(pos).add(new THREE.Vector3(0, 2.35, 0));
    sprite.scale.set(3.2, 0.62, 1);
    this.scene.add(sprite);
    this.floatingTexts.push({
      sprite,
      position: sprite.position,
      velocity: new THREE.Vector3(0, 0.25, 0),
      lifetime: 3.5,
      maxLifetime: 3.5
    });
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
        if (ft.poolItem) {
          this.floatingTextPool.push(ft.poolItem);
        } else {
          ft.sprite.material.map?.dispose();
          ft.sprite.material.dispose();
        }
        this.floatingTexts.splice(i, 1);
      }
    }

    while (this.sparks.length > 80) {
      const oldest = this.sparks.shift();
      if (oldest) {
        this.scene.remove(oldest.mesh);
        oldest.mesh.material?.dispose?.();
        oldest.mesh.traverse?.((c: any) => {
          if (c.isMesh) {
            if (!c.userData?.sharedGeo) c.geometry?.dispose();
            c.material?.dispose();
          }
        });
      }
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.lifetime -= delta;
      if (sp.velocity) {
        sp.mesh.position.addScaledVector(sp.velocity, delta);
        const grav = sp.gravity !== undefined ? sp.gravity : -9.8;
        sp.velocity.y += grav * delta;
      }
      if (sp.rotSpeed) {
        sp.mesh.rotation.x += sp.rotSpeed.x * delta;
        sp.mesh.rotation.y += sp.rotSpeed.y * delta;
        sp.mesh.rotation.z += sp.rotSpeed.z * delta;
      }
      if (sp.spinSpeed && sp.mesh.material) {
        sp.mesh.material.rotation = (sp.mesh.material.rotation || 0) + sp.spinSpeed * delta;
      }
      if (sp.scaleSpeed) {
        const factor = Math.max(0.05, 1 + sp.scaleSpeed * delta);
        sp.mesh.scale.multiplyScalar(factor);
      }
      const progress = Math.max(0, Math.min(1, 1 - sp.lifetime / sp.maxLifetime));
      if (sp.frames && sp.frames.length > 0 && sp.mesh.material) {
        const idx = Math.min(sp.frames.length - 1, Math.floor(progress * sp.frames.length));
        sp.mesh.material.map = sp.frames[idx];
      }
      const ratio = Math.max(0, sp.lifetime / sp.maxLifetime);
      const opacity = ratio * (sp.baseOpacity ?? 1);
      if (sp.mesh.material) {
        sp.mesh.material.opacity = opacity;
      } else {
        sp.mesh.traverse?.((c: any) => {
          if (c.isMesh && c.material) c.material.opacity = opacity;
        });
      }
      if (sp.lifetime <= 0) {
        this.scene.remove(sp.mesh);
        if (sp.mesh.material) {
          sp.mesh.material.dispose?.();
        }
        sp.mesh.traverse?.((c: any) => {
          if (c.isMesh) {
            if (!c.userData?.sharedGeo) c.geometry?.dispose();
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
            if (!c.userData?.sharedGeo) c.geometry?.dispose();
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
    for (const item of this.floatingTextPool) {
      item.texture?.dispose();
      item.material?.dispose();
    }
    this.floatingTextPool = [];
    for (const sp of this.sparks) {
      this.scene.remove(sp.mesh);
      sp.mesh.traverse?.((c: any) => {
        if (c.isMesh) {
          if (!c.userData?.sharedGeo) c.geometry?.dispose();
          c.material?.dispose();
        }
      });
    }
    this.sparks = [];
    for (const exp of this.explosions) {
      this.scene.remove(exp.mesh);
      exp.mesh.traverse?.((c: any) => {
        if (c.isMesh) {
          if (!c.userData?.sharedGeo) c.geometry?.dispose();
          c.material?.dispose();
        }
      });
    }
    this.explosions = [];
  }
}
