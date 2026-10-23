import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CollisionEnvironment, EntityEvents } from './types';
import type { WeaponPartConfig } from './configs/weaponSuites';
import { createStylizedWeaponMesh, enhanceLoadedWeaponModel } from './ProceduralWeaponBuilder';

import { buildFullAvatar, type BuildAvatarOptions } from './avatarBuilder';
import {
  resolveMoveDirection,
  resolveRollDirection,
  type MoveDirection,
  type RollDirection,
} from '../avatar';

const LOWER_BODY_BONES = new Set([
  'root', 'torso', 'hip',
  'leg_l', 'leg_r', 'knee_l', 'knee_r',
  'ankle_l', 'ankle_r', 'toe_l', 'toe_r',
  'heel_l', 'heel_r', 'ankleIK_l', 'ankleIK_r'
]);

/**
 * 玩家实体引擎核心类 (与 React 完全解耦的纯粹 3D 逻辑实体)
 * 具备完整的动作状态机、骨骼重定向、武器挂载、地形碰撞适配、受击胶囊体与事件通知。
 */
export class PlayerEntity {
  public modelGroup: any;
  public mixer: any = null;
  public isReady: boolean = false;

  // 战斗与生命属性
  public health: number = 3200;
  public maxHealth: number = 3200;
  public isAlive: boolean = true;
  public godMode: boolean = false;

  // 受击胶囊碰撞体
  public hitbox: any = null;

  // 事件回调接口
  public events: EntityEvents = {};

  // 动画动作表与状态
  private actions: Record<string, any> = {};
  private upperActions: Record<string, any> = {};
  private currentActionName: string = 'idle';
  private currentUpperActionName: string = '';
  private forcedAction: string | null = null;
  private ghostState = new Map<any, { transparent: boolean; opacity: number; depthWrite: boolean }>();

  // 骨架与挂点
  private mainSkeleton: any = null;
  private boneIndices = new Map<string, number>();
  private weaponParts: { slot: number; group: any }[] = [];
  private activeWeaponSlot: number = 0;

  // 物理与移动参数
  private baseSpeed: number = 4.8;
  private speed: number = 4.8;
  private rollSpeed: number = 8.5;
  private gravity: number = -18.0;
  private jumpVelocity: number = 0;
  public isGrounded: boolean = true;
  public isJumping: boolean = false;
  public jumpStage: number = 0;

  // 翅膀挂载与飞行系统 (1:1 对应 move_info.lua jump2 / fly_v0 / fly_total_time)
  public hasWings: boolean = false;
  public activeWingId: string = '';
  public isFlying: boolean = false;
  public flyEnergy: number = 100;
  public maxFlyEnergy: number = 100;
  public flyAscendInput: number = 0;
  private standaloneWingGroup: any = null;
  private standaloneWingMixer: any = null;
  private standaloneWingActions: { idle?: any; fly?: any } = {};
  private standaloneWingTipL = new THREE.Vector3();
  private standaloneWingTipR = new THREE.Vector3();
  private airborneTime: number = 0;
  private spaceHoldTime: number = 0;

  // 动作状态计时器
  public isRolling: boolean = false;
  private rollTimer: number = 0;
  private rollDuration: number = 0.8;
  private rollDirection = new THREE.Vector3();

  private isAttacking: boolean = false;
  private activeAttackAction: string = 'attack';
  private attackTimer: number = 0;
  private attackDuration: number = 0.6;
  private comboCounter: number = 0;
  private lastAttackAt: number = 0;

  private isReloading: boolean = false;
  private reloadTimer: number = 0;
  private reloadDuration: number = 1.2;

  private isHitStun: boolean = false;
  private hitTimer: number = 0;

  // 脚步声计时器
  private footstepTimer: number = 0;
  private footstepIndex: number = 0;

  // 控制指令缓存
  private targetDirection = new THREE.Vector3();
  private targetCameraYaw: number = 0;
  public isMoving: boolean = false;
  public aimAtCrosshair: boolean = true;
  // 八方向移动与四方向翻滚当前枚举状态
  public currentMoveDir: MoveDirection = 'run';
  public currentRollDir: RollDirection = 'roll';

  // 环境碰撞与地图适配接口
  private collisionEnv: CollisionEnvironment | null = null;

  // 临时数学计算对象
  private candidatePos = new THREE.Vector3();
  private worldMuzzlePos = new THREE.Vector3();
  private overheadSprite: any = null;
  private overheadCanvas: HTMLCanvasElement | null = null;
  private overheadTexture: any = null;
  private lastOverheadKey = '';

  constructor(scene: any) {
    this.modelGroup = new THREE.Group();
    scene.add(this.modelGroup);

    // 构建不可见的受击胶囊体 (Hitbox) —— 适配 Q 版大头角色体型以保证多人联机射击 100% 精准命中
    const capsuleGeom = new THREE.CapsuleGeometry(0.58, 1.05, 6, 10);
    const capMat = new THREE.MeshBasicMaterial({ visible: false, wireframe: true });
    this.hitbox = new THREE.Mesh(capsuleGeom, capMat);
    this.hitbox.position.y = 0.92;
    this.hitbox.userData = { isPlayer: true, entity: this };
    this.modelGroup.add(this.hitbox);
  }

  // =========================================
  // 1. 资源组装 (Avatar Builder)
  // =========================================
  /**
   * 一键加载高精度全套角色模型 (含面部五官、发型、服装贴图、骨架重映射)
   */
  public async loadFullAvatar(options: BuildAvatarOptions = {}) {
    const built = await buildFullAvatar(options);
    this.attachAvatarRoot(built.root, built.skeleton);
    return built;
  }

  public async loadAvatar(headPath: string, bodyPath: string) {
    const loader = new GLTFLoader();
    try {
      const [headGltf, bodyGltf] = await Promise.all([
        loader.loadAsync(headPath),
        loader.loadAsync(bodyPath)
      ]);

      const headScene = headGltf.scene;
      const bodyScene = bodyGltf.scene;

      // 1. 寻找骨骼数量最多、挂点最完整的骨骼系统作为主骨架 (通常是 bodyScene)
      let primarySkeleton: any = null;

      const checkMesh = (child: any) => {
        if (child.isSkinnedMesh && child.skeleton) {
          if (!primarySkeleton || child.skeleton.bones.length > primarySkeleton.bones.length) {
            primarySkeleton = child.skeleton;
          }
        }
      };

      bodyScene.traverse((child: any) => checkMesh(child));
      headScene.traverse((child: any) => checkMesh(child));

      this.mainSkeleton = primarySkeleton;
      this.boneIndices.clear();

      if (this.mainSkeleton) {
        this.mainSkeleton.bones.forEach((bone: any, index: number) => {
          this.boneIndices.set(bone.name, index);
        });
      }

      // 2. 将两部分的网格归集并重映射蒙皮骨骼
      const rebindMeshes = (scene: any) => {
        const meshes: any[] = [];
        scene.traverse((child: any) => {
          if (child.isMesh) meshes.push(child);
        });
        for (const child of meshes) {
          if (child.isSkinnedMesh) {
            if (this.mainSkeleton && child.skeleton !== this.mainSkeleton) {
              const indices = child.geometry.attributes.skinIndex;
              const oldSkeleton = child.skeleton;
              if (oldSkeleton) {
                for (let i = 0; i < indices.array.length; i++) {
                  const boneName = oldSkeleton.bones[indices.array[i]]?.name;
                  const targetIdx = boneName ? this.boneIndices.get(boneName) : undefined;
                  if (targetIdx !== undefined) {
                    indices.array[i] = targetIdx;
                  }
                }
                indices.needsUpdate = true;
              }
              child.bind(this.mainSkeleton, new THREE.Matrix4());
              if (oldSkeleton) oldSkeleton.dispose();
            }
          }
          child.frustumCulled = false;
          child.castShadow = true;
          child.receiveShadow = true;
        }
        return meshes;
      };

      const headMeshes = rebindMeshes(headScene);
      rebindMeshes(bodyScene);

      // 将身体主体加入 modelGroup，头部网格通过独立组挂接，避免多余 Armature/骨骼节点进入层级
      this.modelGroup.add(bodyScene);
      const headGroup = new THREE.Group();
      headMeshes.forEach(m => headGroup.add(m));
      this.modelGroup.add(headGroup);

      // 初始化动画混合器
      this.mixer = new THREE.AnimationMixer(this.modelGroup);
      this.isReady = true;

      return this.modelGroup;
    } catch (err) {
      console.error('[PlayerEntity] Avatar Loading Error:', err);
      throw err;
    }
  }

  /**
   * 挂接由 createBattleAvatar 构建的完整战斗角色实例 (支持全部 484 把原版武器模型、157 套造型卡与上下半身分离动画)
   */
  public battleAvatar: any = null;

  public attachBattleAvatar(avatar: any) {
    if (this.battleAvatar && this.battleAvatar !== avatar) {
      if (this.battleAvatar.root?.parent) {
        this.battleAvatar.root.parent.remove(this.battleAvatar.root);
      }
      this.battleAvatar.dispose?.();
    }
    this.battleAvatar = avatar;
    this.modelGroup.add(avatar.root);
    this.mainSkeleton = avatar.skeleton || null;
    if (!this.mainSkeleton) {
      avatar.root.traverse((child: any) => {
        if (child.isSkinnedMesh && child.skeleton) {
          if (!this.mainSkeleton || child.skeleton.bones.length > this.mainSkeleton.bones.length) {
            this.mainSkeleton = child.skeleton;
          }
        }
      });
    }
    this.boneIndices.clear();
    if (this.mainSkeleton) {
      this.mainSkeleton.bones.forEach((bone: any, index: number) => {
        this.boneIndices.set(bone.name, index);
      });
    }
    this.mixer = null;
    this.isReady = true;
    return avatar.root;
  }

  /**
   * 挂接已完成组装的自定义三维角色根节点 (如由 buildFullAvatar 或外部构建的模型)
   */
  public attachAvatarRoot(root: any, skeleton?: any) {
    this.battleAvatar = null;
    this.modelGroup.add(root);
    this.mainSkeleton = skeleton || null;
    if (!this.mainSkeleton) {
      root.traverse((child: any) => {
        if (child.isSkinnedMesh && child.skeleton) {
          if (!this.mainSkeleton || child.skeleton.bones.length > this.mainSkeleton.bones.length) {
            this.mainSkeleton = child.skeleton;
          }
        }
      });
    }

    this.boneIndices.clear();
    if (this.mainSkeleton) {
      this.mainSkeleton.bones.forEach((bone: any, index: number) => {
        this.boneIndices.set(bone.name, index);
      });
    }

    this.mixer = new THREE.AnimationMixer(this.modelGroup);
    this.isReady = true;
    return root;
  }

  /**
   * 直接设置实体坐标与朝向 (供远端联机对手插值同步)
   */
  public setTransform(x: number, y: number, z: number, yaw: number) {
    this.modelGroup.position.set(x, y, z);
    this.modelGroup.rotation.y = yaw;
    this.targetCameraYaw = yaw;
    this.modelGroup.updateMatrixWorld(true);
  }

  /**
   * 渲染/更新远端真人玩家头顶 3D 姓名牌、阵营徽标、语音图标与实时生命条
   */
  public updateOverheadHud(info: {
    username: string;
    team?: string;
    level?: number;
    hp: number;
    maxHp: number;
    speaking?: boolean;
    shield?: boolean;
  }) {
    const safeMax = Math.max(1, info.maxHp || 3201);
    const safeHp = Math.max(0, Math.min(safeMax, Math.round(info.hp ?? safeMax)));
    const team = info.team === 'red' ? 'red' : 'blue';
    const key = `${info.username}|${team}|${info.level || 1}|${safeHp}|${safeMax}|${info.speaking ? 1 : 0}|${info.shield ? 1 : 0}`;
    if (key === this.lastOverheadKey && this.overheadSprite) return;
    const now = performance.now();
    const lastDrawAt = (this as any)._lastOverheadDrawAt || 0;
    if (
      this.overheadSprite &&
      safeHp > 0 &&
      safeHp < safeMax &&
      now - lastDrawAt < 110
    ) {
      return;
    }
    (this as any)._lastOverheadDrawAt = now;
    this.lastOverheadKey = key;

    if (!this.overheadCanvas) {
      this.overheadCanvas = document.createElement('canvas');
      this.overheadCanvas.width = 256;
      this.overheadCanvas.height = 76;
    }
    const ctx = this.overheadCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 256, 76);

    // 背板圆角框
    ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
    ctx.strokeStyle = info.shield ? '#fbbf24' : (team === 'red' ? '#f87171' : '#38bdf8');
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(8, 6, 240, 62, 12);
    ctx.fill();
    ctx.stroke();

    // 阵营色标与等级+名字
    ctx.font = 'bold 17px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = team === 'red' ? '#fca5a5' : '#93c5fd';
    const badge = team === 'red' ? '🔴' : '🔵';
    const shieldTag = info.shield ? ' 🛡️' : '';
    const voiceTag = info.speaking ? ' 🔊' : '';
    const title = `${badge} Lv.${info.level || 1} ${info.username || '战友'}${shieldTag}${voiceTag}`;
    ctx.textAlign = 'center';
    ctx.fillText(title, 128, 29, 224);

    // 血条槽背景
    ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
    ctx.beginPath();
    ctx.roundRect(20, 39, 216, 18, 6);
    ctx.fill();

    // 血条前景
    const ratio = Math.max(0, Math.min(1, safeHp / safeMax));
    const fillW = Math.round(216 * ratio);
    if (fillW > 0) {
      const grad = ctx.createLinearGradient(20, 0, 236, 0);
      if (team === 'red') {
        grad.addColorStop(0, '#ef4444');
        grad.addColorStop(1, '#f97316');
      } else {
        grad.addColorStop(0, '#10b981');
        grad.addColorStop(1, '#38bdf8');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(20, 39, fillW, 18, 6);
      ctx.fill();
    }

    // 血量数值
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`${safeHp} / ${safeMax}`, 128, 53);

    if (!this.overheadTexture) {
      this.overheadTexture = new THREE.CanvasTexture(this.overheadCanvas);
      this.overheadTexture.colorSpace = THREE.SRGBColorSpace;
    } else {
      this.overheadTexture.needsUpdate = true;
    }

    if (!this.overheadSprite) {
      const mat = new THREE.SpriteMaterial({
        map: this.overheadTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      this.overheadSprite = new THREE.Sprite(mat);
      this.overheadSprite.position.set(0, 2.22, 0);
      this.overheadSprite.scale.set(1.75, 0.52, 1);
      this.overheadSprite.renderOrder = 999;
      this.modelGroup.add(this.overheadSprite);
    }
  }

  /**
   * 立即将角色朝向对齐到摄像机/准星水平偏航角
   */
  public syncFacingToCamera(yaw?: number) {
    if (yaw !== undefined) {
      this.targetCameraYaw = yaw;
    }
    this.modelGroup.rotation.y = this.targetCameraYaw;
    this.modelGroup.updateMatrixWorld(true);
  }

  public setAimAtCrosshair(enabled: boolean) {
    this.aimAtCrosshair = enabled;
  }

  /**
   * 结算伤害别名方法
   */
  public applyDamage(amount: number): boolean {
    return this.takeDamage(amount);
  }

  // =========================================
  // 2. 武器模型挂接 (Weapon Mounting)
  // =========================================
  /**
   * 智能定位武器挂接的目标骨骼 (支持别名与左右手智能回退)
   */
  public getAttachmentBone(boneName: string): any {
    if (!this.mainSkeleton) return null;

    // 1. 精确匹配
    const exactIdx = this.boneIndices.get(boneName);
    if (exactIdx !== undefined && this.mainSkeleton.bones[exactIdx]) {
      return this.mainSkeleton.bones[exactIdx];
    }

    // 2. AvatarStar_cache 骨骼别名映射 (back_b / chest / head / foot_l / foot_r / root / 左右手)
    const lowerName = boneName.toLowerCase();
    let candidates: string[];
    if (lowerName === 'back_b' || lowerName === 'chest' || lowerName === 'spine') {
      candidates = ['back_b', 'chest', 'spine', 'pelvis', 'root'];
    } else if (lowerName === 'head' || lowerName === 'neck') {
      candidates = ['head', 'neck', 'chest'];
    } else if (lowerName === 'root' || lowerName === 'pelvis') {
      candidates = ['root', 'pelvis'];
    } else if (lowerName === 'foot_l' || lowerName === 'toe_l') {
      candidates = ['foot_l', 'toe_l', 'calf_l'];
    } else if (lowerName === 'foot_r' || lowerName === 'toe_r') {
      candidates = ['foot_r', 'toe_r', 'calf_r'];
    } else {
      const isLeft = lowerName.includes('l');
      candidates = isLeft
        ? ['handweapon_l', 'hand_l', 'Bip01 L Hand', 'Bip01_L_Hand', 'mixamorig:LeftHand', 'LeftHand', 'L_Hand']
        : ['handweapon_r', 'hand_r', 'Bip01 R Hand', 'Bip01_R_Hand', 'mixamorig:RightHand', 'RightHand', 'R_Hand'];
    }

    for (const name of candidates) {
      const idx = this.boneIndices.get(name);
      if (idx !== undefined && this.mainSkeleton.bones[idx]) {
        return this.mainSkeleton.bones[idx];
      }
    }

    // 3. 模糊字符串匹配
    const isLeft = lowerName.includes('l');
    for (const bone of this.mainSkeleton.bones) {
      const lower = bone.name.toLowerCase();
      if (isLeft && (lower.includes('handweapon_l') || (lower.includes('hand') && lower.includes('l')))) {
        return bone;
      }
      if (!isLeft && (lower.includes('handweapon_r') || (lower.includes('hand') && lower.includes('r')))) {
        return bone;
      }
    }

    // 4. 极端回退：如果存在任何骨骼，返回右手或末端骨骼
    console.warn(`[PlayerEntity] 未能精确定位骨骼挂点: ${boneName}，使用降级骨骼挂接`);
    return this.mainSkeleton.bones[this.mainSkeleton.bones.length - 1] ?? null;
  }

  /**
   * 获取指定骨骼挂点在世界坐标系下的实时 3D 位置 (供 AvatarStar_cache 技能与 Buff .vfx 特效精确绑定)
   */
  public getBoneWorldPosition(boneName: string): any {
    const basePos = this.modelGroup.position;
    if (boneName === 'root') {
      return basePos.clone();
    }
    const bone = this.getAttachmentBone(boneName);
    if (bone) {
      this.modelGroup.updateMatrixWorld(true);
      const worldPos = new THREE.Vector3();
      bone.getWorldPosition(worldPos);
      if (Number.isFinite(worldPos.x) && worldPos.distanceTo(basePos) < 6.0) {
        return worldPos;
      }
    }
    const lower = boneName.toLowerCase();
    if (lower === 'head') return basePos.clone().add(new THREE.Vector3(0, 1.55, 0));
    if (lower === 'chest' || lower === 'back_b') return basePos.clone().add(new THREE.Vector3(0, 1.05, 0));
    if (lower.includes('foot_l')) return basePos.clone().add(new THREE.Vector3(0.22, 0.12, 0));
    if (lower.includes('foot_r')) return basePos.clone().add(new THREE.Vector3(-0.22, 0.12, 0));
    if (lower.includes('hand') && lower.includes('l')) return basePos.clone().add(new THREE.Vector3(0.42, 1.05, 0.25));
    if (lower.includes('hand')) return basePos.clone().add(new THREE.Vector3(-0.42, 1.05, 0.25));
    return basePos.clone().add(new THREE.Vector3(0, 1.0, 0));
  }

  public async attachWeaponModel(slot: number, modelPath: string, boneName: string, texturePath?: string, weaponId = 'smg_01'): Promise<any> {
    if (!this.mainSkeleton) {
      console.warn('[PlayerEntity] Cannot attach weapon before avatar skeleton is ready.');
      return null;
    }

    const targetBone = this.getAttachmentBone(boneName);
    if (!targetBone) {
      console.warn(`[PlayerEntity] Bone not found for weapon attachment: ${boneName}`);
      return null;
    }

    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(modelPath);
    const weaponModel = gltf.scene;

    if (texturePath) {
      try {
        const texLoader = new THREE.TextureLoader();
        const texture = await texLoader.loadAsync(texturePath);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        const partMaterial = new THREE.MeshPhongMaterial({
          map: texture,
          color: '#ffffff',
          shininess: 18,
          specular: '#26202a',
          emissive: '#161926',
          emissiveIntensity: 0.2
        });
        weaponModel.traverse((child: any) => {
          if (child.isMesh) {
            child.material = partMaterial;
          }
        });
      } catch {
        // 贴图缺失时保留默认材质并赋予风格化高光
      }
    }

    const meshCount = enhanceLoadedWeaponModel(weaponModel, weaponId);
    if (meshCount === 0) {
      return null;
    }

    weaponModel.visible = slot === this.activeWeaponSlot;
    targetBone.add(weaponModel);
    this.weaponParts.push({ slot, group: weaponModel });
    return weaponModel;
  }

  /**
   * 直接挂载 Q版风格化程序生成 3D 武器模型 (作为保底或独立武器外观)
   */
  public equipStylizedWeapon(weaponId: string, slot: number = 0): any {
    if (!this.mainSkeleton) return null;
    const boneName = weaponId.startsWith('shield') ? 'handweapon_l' : 'handweapon_r';
    const targetBone = this.getAttachmentBone(boneName);
    if (!targetBone) return null;

    const stylized = createStylizedWeaponMesh(weaponId);
    stylized.visible = slot === this.activeWeaponSlot;
    targetBone.add(stylized);
    this.weaponParts.push({ slot, group: stylized });
    return stylized;
  }

  /**
   * 清除指定或全部槽位的武器 3D 模型
   */
  public clearWeapons(slot?: number) {
    const remaining: { slot: number; group: any }[] = [];
    for (const part of this.weaponParts) {
      if (slot === undefined || part.slot === slot) {
        if (part.group.parent) {
          part.group.parent.remove(part.group);
        }
        part.group.traverse((child: any) => {
          if (child.isMesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((m: any) => m.dispose());
            } else {
              child.material?.dispose();
            }
          }
        });
      } else {
        remaining.push(part);
      }
    }
    this.weaponParts = remaining;
    this.isReloading = false;
    this.reloadTimer = 0;
  }

  /**
   * 一键装配武器套件的多部件模型 (如枪体、枪口、盾牌双持等)，若原版模型缺失则自动生成风格化 3D 武器
   */
  public async equipWeaponParts(parts: WeaponPartConfig[], slot: number = 0, weaponId: string = 'smg_01'): Promise<any[]> {
    this.clearWeapons(slot);

    const loadedObjects: any[] = [];
    if (parts && parts.length > 0) {
      for (const part of parts) {
        try {
          const obj = await this.attachWeaponModel(slot, part.model, part.bone, part.texture ?? undefined, weaponId);
          if (obj) loadedObjects.push(obj);
        } catch (err) {
          console.warn(`[PlayerEntity] 武器部件装配失败，将启用风格化 3D 武器建模 (${part.model}):`, err);
        }
      }
    }

    if (loadedObjects.length === 0) {
      const fallback = this.equipStylizedWeapon(weaponId, slot);
      if (fallback) loadedObjects.push(fallback);
    }

    return loadedObjects;
  }

  public switchWeaponSlot(slot: number) {
    this.activeWeaponSlot = slot;
    if (this.battleAvatar) {
      this.battleAvatar.setWeapon(slot);
    }
    this.weaponParts.forEach(part => {
      part.group.visible = part.slot === slot;
    });
  }

  /**
   * 1:1 装配 3D 翅膀配饰 (支持 wing01..wing45，同时兼容 BattleAvatar 模式与沙盒独立骨架模式)
   */
  public async equipWing(wingAttachment?: any): Promise<void> {
    if (this.standaloneWingGroup) {
      if (this.standaloneWingGroup.parent) {
        this.standaloneWingGroup.parent.remove(this.standaloneWingGroup);
      }
      this.standaloneWingMixer?.stopAllAction();
      this.standaloneWingGroup.traverse((child: any) => {
        if (child.isMesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m: any) => m?.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
      this.standaloneWingGroup = null;
      this.standaloneWingMixer = null;
      this.standaloneWingActions = {};
    }

    if (!wingAttachment) {
      this.hasWings = false;
      this.activeWingId = '';
      this.setFlying(false);
      if (this.battleAvatar?.setAttachment) {
        await this.battleAvatar.setAttachment(undefined);
      }
      return;
    }

    const baseId = typeof wingAttachment === 'string'
      ? wingAttachment.replace(/_indie$/i, '').replace(/^wing_/, 'wing')
      : String(wingAttachment.id || 'wing01').replace(/_indie$/i, '').replace(/^wing_/, 'wing');

    const defaultTex = baseId === 'wing15'
      ? '../lobby/textures/mesh/character/thirdperson/avatar/trinket/tex_wing15_trinket_c.png'
      : `../lobby/textures/mesh/character/thirdperson/avatar/indie/wing/tex_${baseId}_indie_c.png`;

    const attObj = typeof wingAttachment === 'object' && wingAttachment.model
      ? wingAttachment
      : {
          id: `${baseId}_indie`,
          label: `飞行器 · ${baseId.toUpperCase()}`,
          bone: 'chest',
          model: `../lobby/models/${baseId}.glb`,
          texture: defaultTex,
          animation: `../lobby/animations/indie-wing-${baseId}-idle.json`,
        };

    this.hasWings = true;
    this.activeWingId = baseId;

    if (this.battleAvatar?.setAttachment) {
      await this.battleAvatar.setAttachment(attObj);
      return;
    }

    // 独立骨架模式 (如沙盒实验室 CharacterController): 直接挂接到 chest 背部挂点
    if (!this.mainSkeleton) return;
    const chestIdx = this.boneIndices.get('chest');
    const chestBone = (chestIdx !== undefined ? this.mainSkeleton.bones[chestIdx] : null)
      || this.mainSkeleton.bones.find((b: any) => b.name === 'chest' || b.name.toLowerCase().includes('spine'))
      || this.mainSkeleton.bones[0];
    if (!chestBone) return;

    const lobbyBase = `${import.meta.env.BASE_URL}assets/lobby/`;
    const resolveLobbyPath = (p: string) => `${lobbyBase}${p.replace(/^\.\.\/lobby\//, '')}`;
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync(resolveLobbyPath(attObj.model));
      const wingScene = gltf.scene;
      if (attObj.texture) {
        try {
          const texLoader = new THREE.TextureLoader();
          const tex = await texLoader.loadAsync(resolveLobbyPath(attObj.texture));
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.flipY = false;
          const wingMat = new THREE.MeshPhongMaterial({
            map: tex,
            color: '#ffffff',
            shininess: 18,
            specular: '#26202a',
            emissive: '#161926',
            emissiveIntensity: 0.25,
            transparent: true,
            alphaTest: 0.08,
            side: THREE.DoubleSide,
          });
          wingScene.traverse((child: any) => {
            if (child.isMesh) {
              child.material = wingMat;
              child.frustumCulled = false;
            }
          });
        } catch {}
      }
      // 抵消 chest 骨骼修正四元数 (-0.5, -0.5, -0.5, 0.5)
      const bindQuat = new THREE.Quaternion(-0.5, -0.5, -0.5, 0.5);
      wingScene.quaternion.copy(bindQuat).invert();
      chestBone.add(wingScene);
      this.standaloneWingGroup = wingScene;
      this.standaloneWingMixer = new THREE.AnimationMixer(wingScene);

      const loadWingClip = async (relPath: string, clipName: string) => {
        const res = await fetch(resolveLobbyPath(relPath));
        if (!res.ok) return null;
        const data = await res.json();
        const rawFps = data.fps || 60;
        const effectiveFps = rawFps === 60 ? 96 : rawFps;
        const dur = data.duration && data.duration > 0 ? data.duration * (rawFps / effectiveFps) : -1;
        return new THREE.AnimationClip(clipName, dur, data.tracks.flatMap((track: any) => {
          const pTimes = track.positions.map((_: any, i: number) => i / effectiveFps);
          const rTimes = track.rotations.map((_: any, i: number) => i / effectiveFps);
          return [
            new THREE.VectorKeyframeTrack(`${track.name}.position`, pTimes, track.positions.flat()),
            new THREE.QuaternionKeyframeTrack(`${track.name}.quaternion`, rTimes, track.rotations.flat()),
          ];
        }));
      };

      const [idleClip, flyClip] = await Promise.all([
        loadWingClip(attObj.animation || `animations/indie-wing-${baseId}-idle.json`, 'wing-idle').catch(() => null),
        loadWingClip(`animations/indie-wing-${baseId}-fly.json`, 'wing-fly').catch(() => null),
      ]);
      if (idleClip && this.standaloneWingMixer) {
        const act = this.standaloneWingMixer.clipAction(idleClip);
        act.play();
        this.standaloneWingActions.idle = act;
      }
      if (flyClip && this.standaloneWingMixer) {
        this.standaloneWingActions.fly = this.standaloneWingMixer.clipAction(flyClip);
      }
    } catch (err) {
      console.warn('[PlayerEntity] Wing load failed:', err);
    }
  }

  /**
   * 获取翅膀左右翼尖的世界坐标 (用于发射 vfx_wing*_trail.vfx 粒子拖尾)
   */
  public getWingTipPositions(): { left: any; right: any; wingId: string } | null {
    if (!this.hasWings) return null;
    if (this.battleAvatar?.getWingTipPositions) {
      return this.battleAvatar.getWingTipPositions();
    }
    if (this.standaloneWingGroup) {
      this.modelGroup.updateMatrixWorld(true);
      const lNode = this.standaloneWingGroup.getObjectByName('wing_vfx_l')
        || this.standaloneWingGroup.getObjectByName('wing1_l2')
        || this.standaloneWingGroup.getObjectByName('wing1_l1');
      const rNode = this.standaloneWingGroup.getObjectByName('wing_vfx_r')
        || this.standaloneWingGroup.getObjectByName('wing1_r2')
        || this.standaloneWingGroup.getObjectByName('wing1_r1');
      if (lNode && rNode) {
        lNode.getWorldPosition(this.standaloneWingTipL);
        rNode.getWorldPosition(this.standaloneWingTipR);
      } else {
        this.standaloneWingGroup.getWorldPosition(this.standaloneWingTipL);
        this.standaloneWingTipR.copy(this.standaloneWingTipL);
        const yaw = this.modelGroup.rotation.y;
        const rx = Math.cos(yaw) * 0.55;
        const rz = -Math.sin(yaw) * 0.55;
        this.standaloneWingTipL.x -= rx;
        this.standaloneWingTipL.z -= rz;
        this.standaloneWingTipL.y += 0.25;
        this.standaloneWingTipR.x += rx;
        this.standaloneWingTipR.z += rz;
        this.standaloneWingTipR.y += 0.25;
      }
      return {
        left: this.standaloneWingTipL,
        right: this.standaloneWingTipR,
        wingId: this.activeWingId || 'wing01',
      };
    }
    return null;
  }

  /**
   * 计算角色枪口或投射物发射的世界坐标 (优先读取手持 3D 武器模型上的 Gun_Fire 节点)
   */
  public getMuzzlePosition(): any {
    this.modelGroup.updateMatrixWorld(true);

    if (this.battleAvatar?.getMuzzlePosition) {
      this.battleAvatar.getMuzzlePosition(this.worldMuzzlePos);
      if (this.worldMuzzlePos.y > this.modelGroup.position.y + 0.35) {
        return this.worldMuzzlePos.clone();
      }
    }

    // 1. 优先从当前激活槽位的武器部件查找 Gun_Fire 挂点
    for (const part of this.weaponParts) {
      if (part.slot === this.activeWeaponSlot && part.group.visible) {
        const gunFire = part.group.getObjectByName('Gun_Fire');
        if (gunFire) {
          gunFire.getWorldPosition(this.worldMuzzlePos);
          if (this.worldMuzzlePos.y > this.modelGroup.position.y + 0.35) {
            return this.worldMuzzlePos.clone();
          }
        }
      }
    }

    // 2. 从角色整体层级中的可见 Gun_Fire 节点查找 (兼容 createBattleAvatar 挂载的武器)
    let foundMuzzle: any = null;
    this.modelGroup.traverse((obj: any) => {
      if (foundMuzzle) return;
      if (obj.name === 'Gun_Fire') {
        let p = obj;
        let vis = true;
        while (p && p !== this.modelGroup) {
          if (p.visible === false) { vis = false; break; }
          p = p.parent;
        }
        if (vis) foundMuzzle = obj;
      }
    });
    if (foundMuzzle) {
      foundMuzzle.getWorldPosition(this.worldMuzzlePos);
      if (this.worldMuzzlePos.y > this.modelGroup.position.y + 0.35) {
        return this.worldMuzzlePos.clone();
      }
    }

    // 3. 骨骼 handweapon_r 位置回退
    const rightWeaponBone = this.getAttachmentBone('handweapon_r');
    if (rightWeaponBone) {
      rightWeaponBone.getWorldPosition(this.worldMuzzlePos);
      if (this.worldMuzzlePos.y > this.modelGroup.position.y + 0.35) {
        const yaw = this.modelGroup.rotation.y;
        this.worldMuzzlePos.x += Math.sin(yaw) * 0.45;
        this.worldMuzzlePos.y += 0.08;
        this.worldMuzzlePos.z += Math.cos(yaw) * 0.45;
        return this.worldMuzzlePos.clone();
      }
    }

    // 4. 数学几何回退
    const yaw = this.modelGroup.rotation.y;
    const rightX = -Math.cos(yaw) * 0.18;
    const rightZ = Math.sin(yaw) * 0.18;
    this.worldMuzzlePos.copy(this.modelGroup.position).add(
      new THREE.Vector3(Math.sin(yaw) * 0.72 + rightX, 1.05, Math.cos(yaw) * 0.72 + rightZ)
    );
    return this.worldMuzzlePos.clone();
  }

  // =========================================
  // 3. 动画解析与加载 (Animation System)
  // =========================================
  public async loadAnimations(animMap: Record<string, string>) {
    if (this.battleAvatar) {
      return;
    }
    if (!this.mixer) {
      console.warn('[PlayerEntity] Please loadAvatar before loadAnimations.');
      return;
    }

    const fetchClipData = async (path: string) => {
      const response = await fetch(path);
      return response.json();
    };

    const buildClip = (data: any, name: string, upperOnly: boolean = false) => {
      const rawFps = data.fps || 60;
      const effectiveFps = rawFps === 60 ? 96 : rawFps;
      const effectiveDuration = data.duration && data.duration > 0 ? data.duration * (rawFps / effectiveFps) : -1;
      return new THREE.AnimationClip(name, effectiveDuration, data.tracks.flatMap((track: any) => {
        if (upperOnly && LOWER_BODY_BONES.has(track.name)) {
          return [];
        }
        const positionTimes = track.positions.map((_: any, idx: number) => idx / effectiveFps);
        const rotationTimes = track.rotations.map((_: any, idx: number) => idx / effectiveFps);
        return [
          new THREE.VectorKeyframeTrack(`${track.name}.position`, positionTimes, track.positions.flat()),
          new THREE.QuaternionKeyframeTrack(`${track.name}.quaternion`, rotationTimes, track.rotations.flat())
        ];
      }));
    };

    try {
      if (this.mixer) {
        this.mixer.stopAllAction();
      }
      this.actions = {};
      this.upperActions = {};
      this.currentUpperActionName = '';

      for (const [actionName, path] of Object.entries(animMap)) {
        if (!path) continue;
        const data = await fetchClipData(path);
        const clip = buildClip(data, actionName, false);
        this.actions[actionName] = this.mixer.clipAction(clip);

        // 为攻击与换弹动作额外构建上半身叠加层动画，支持边跑边射击 / 边跑边换弹
        if (['attack', 'attack2', 'attack3', 'reload', 'spurt'].includes(actionName)) {
          const upperClip = buildClip(data, `${actionName}_upper`, true);
          const upperAction = this.mixer.clipAction(upperClip);
          upperAction.setLoop(THREE.LoopOnce, 1);
          upperAction.clampWhenFinished = true;
          this.upperActions[actionName] = upperAction;
        }
      }

      if (this.forcedAction && this.actions[this.forcedAction]) {
        this.playAction(this.forcedAction, 0.15, true);
      } else if (this.actions['idle']) {
        this.playAction('idle', 0.15, true);
      }
    } catch (err) {
      console.error('[PlayerEntity] Animation Loading Error:', err);
    }
  }

  private stopUpperActions(fadeDuration: number = 0.1) {
    for (const act of Object.values(this.upperActions)) {
      if (act && act.isRunning()) {
        act.fadeOut(fadeDuration);
      }
    }
    this.currentUpperActionName = '';
  }

  private playUpperAction(actionName: string) {
    const upper = this.upperActions[actionName];
    if (!upper) return;
    for (const [k, act] of Object.entries(this.upperActions)) {
      if (k !== actionName && act && act.isRunning()) {
        act.stop();
      }
    }
    upper.reset();
    upper.setEffectiveWeight(1.0);
    upper.play();
    this.currentUpperActionName = actionName;
  }

  // =========================================
  // 4. 动作状态控制 (Action Machine)
  // =========================================
  public playAction(actionName: string, duration: number = 0.2, loop: boolean = true) {
    if (!this.actions[actionName]) return;
    const prevActionName = this.currentActionName;
    const prev = this.actions[prevActionName];
    const next = this.actions[actionName];

    if (this.currentActionName === actionName && next.isRunning()) return;

    next.reset();
    if (!loop) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }
    next.play();

    if (prev && prev !== next) {
      next.crossFadeFrom(prev, duration, true);
    }
    this.currentActionName = actionName;

    if (this.events.onActionChange && prevActionName !== actionName) {
      this.events.onActionChange(prevActionName, actionName);
    }
  }

  /**
   * 触发翻滚动作
   */
  public roll(): boolean {
    if (!this.isAlive || this.isRolling || this.isJumping) return false;
    if (!this.battleAvatar && !this.actions['roll']) return false;
    this.isRolling = true;
    const clipDuration = this.actions['roll']?.getClip()?.duration;
    this.rollDuration = clipDuration ? Math.min(clipDuration, 0.95) : 0.65;
    this.rollTimer = this.rollDuration;
    this.stopUpperActions(0.05);

    // 确定翻滚方向
    if (this.isMoving) {
      this.rollDirection.copy(this.targetDirection).normalize();
      this.rollDirection.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.targetCameraYaw);
    } else {
      this.rollDirection.set(
        Math.sin(this.modelGroup.rotation.y),
        0,
        Math.cos(this.modelGroup.rotation.y)
      );
    }

    if (this.battleAvatar) {
      this.currentRollDir = (this.isMoving && (this.aimAtCrosshair || this.isAttacking))
        ? resolveRollDirection(this.targetDirection.x, this.targetDirection.z)
        : 'roll';
      this.battleAvatar.roll(this.currentRollDir);
    } else {
      this.currentRollDir = (this.isMoving && (this.aimAtCrosshair || this.isAttacking))
        ? resolveRollDirection(this.targetDirection.x, this.targetDirection.z)
        : 'roll';
      const rollActionKey = this.actions[this.currentRollDir] ? this.currentRollDir : 'roll';
      this.playAction(rollActionKey, 0.12, false);
    }
    this.events.onRoll?.();
    return true;
  }

  /**
   * 触发近战攻击（支持多段连招）或远程射击动作 — 支持边移动边射击，并立即面向准星方向
   */
  public attack(step?: number): boolean {
    if (!this.isAlive || this.isRolling) return false;

    // 开火瞬间立即让角色对齐摄像机准星朝向
    this.syncFacingToCamera();

    const now = performance.now();
    if (this.battleAvatar) {
      let chosenIdx = 0;
      if (step !== undefined) {
        chosenIdx = Math.max(0, step - 1);
      } else {
        if (now - this.lastAttackAt > 1200) {
          this.comboCounter = 0;
        }
        chosenIdx = this.comboCounter;
        this.comboCounter += 1;
      }
      this.lastAttackAt = now;
      this.isAttacking = true;
      this.activeAttackAction = 'attack';
      this.attackDuration = 0.35;
      this.attackTimer = this.attackDuration;
      this.currentMoveDir = (this.isMoving && (this.aimAtCrosshair || this.isAttacking))
        ? resolveMoveDirection(this.targetDirection.x, this.targetDirection.z)
        : 'run';
      this.battleAvatar.setMoving(this.isMoving && !this.isJumping && !this.isRolling, this.currentMoveDir);
      this.battleAvatar.attack(chosenIdx);
      this.events.onAttack?.('attack');
      return true;
    }

    const availableAttacks = ['attack', 'attack2', 'attack3'].filter(k => Boolean(this.actions[k]));
    if (availableAttacks.length === 0) return false;

    let chosenIdx = 0;
    if (step !== undefined) {
      chosenIdx = step % availableAttacks.length;
    } else if (availableAttacks.length > 1) {
      if (now - this.lastAttackAt > 1200) {
        this.comboCounter = 0;
      }
      chosenIdx = this.comboCounter % availableAttacks.length;
      this.comboCounter += 1;
    }
    this.lastAttackAt = now;

    const actionKey = availableAttacks[chosenIdx] || 'attack';
    this.isAttacking = true;
    this.activeAttackAction = actionKey;
    const clipDuration = this.actions[actionKey]?.getClip()?.duration;
    this.attackDuration = clipDuration ? Math.min(clipDuration, 0.45) : 0.35;
    this.attackTimer = this.attackDuration;

    if (this.isMoving && !this.isJumping && this.actions['run'] && this.upperActions[actionKey]) {
      // 移动中开火：下半身保持奔跑，上半身叠加射击/挥砍动作
      if (this.currentActionName !== 'run') {
        this.playAction('run', 0.1, true);
      }
      this.playUpperAction(actionKey);
    } else {
      this.stopUpperActions(0.05);
      this.currentActionName = '';
      this.playAction(actionKey, 0.06, false);
    }

    this.events.onAttack?.(actionKey);
    return true;
  }

  /**
   * 触发战术冲刺动作 (Spurt)
   */
  public spurt(): boolean {
    if (!this.isAlive || this.isRolling) return false;
    this.syncFacingToCamera();
    if (this.battleAvatar) {
      this.isAttacking = true;
      this.activeAttackAction = 'spurt';
      this.attackDuration = 0.45;
      this.attackTimer = 0.45;
      this.battleAvatar.spurt();
      return true;
    }
    const key = this.actions['spurt'] ? 'spurt' : (this.actions['roll'] ? 'roll' : 'run');
    if (!this.actions[key]) return false;
    this.isAttacking = true;
    this.activeAttackAction = key;
    const clipDuration = this.actions[key]?.getClip()?.duration;
    this.attackDuration = clipDuration ? Math.min(clipDuration, 0.65) : 0.45;
    this.attackTimer = this.attackDuration;
    this.stopUpperActions(0.05);
    this.currentActionName = '';
    this.playAction(key, 0.1, false);
    return true;
  }

  /**
   * 播放原版 AvatarStar_cache 技能施放骨骼动画 (stdblast / stdoutcry / stdtread / stdeat / stdcatch / stdtleibao_01_bombon)
   */
  public playSkillAnim(skillAnimName: string) {
    if (!this.isAlive) return;
    this.syncFacingToCamera();
    this.isAttacking = true;
    this.activeAttackAction = skillAnimName;
    this.attackDuration = 0.65;
    this.attackTimer = 0.65;
    if (this.battleAvatar?.playSkillAnim) {
      void this.battleAvatar.playSkillAnim(skillAnimName);
      return;
    }
    this.attack(1);
  }

  /**
   * 向前突进冲刺位移 (刀锋疾行 Spurt / 狼王猛扑 WolfDecelerate) with 碰撞阻挡保护
   */
  public lungeForward(distance: number) {
    if (!this.isAlive) return;
    this.syncFacingToCamera();
    const yaw = this.modelGroup.rotation.y;
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const currentPos = this.modelGroup.position;
    const steps = 6;
    const stepVec = forward.multiplyScalar(distance / steps);
    for (let i = 0; i < steps; i++) {
      const nextPos = currentPos.clone().add(stepVec);
      if (this.collisionEnv?.resolveMovement) {
        const res = this.collisionEnv.resolveMovement(currentPos, nextPos, this.isGrounded && !this.isFlying);
        currentPos.x = res.x;
        currentPos.z = res.z;
        if (this.isGrounded && !this.isFlying && res.floorY !== undefined) {
          currentPos.y = res.floorY;
        }
      } else if (!this.collisionEnv?.isBlocked?.(currentPos, nextPos)) {
        currentPos.copy(nextPos);
      } else {
        break;
      }
    }
  }

  /**
   * 过激反应 (Overreaction) 狂暴体型缩放 (1:1 对应 buff/68.lua CharacterScale)
   */
  public setBerserkScale(scale: number) {
    if (this.battleAvatar?.root) {
      this.battleAvatar.root.scale.setScalar(scale);
    }
  }

  /**
   * 触发换弹动作 (支持边移动边换弹)
   */
  public reload(): boolean {
    if (!this.isAlive || this.isReloading || this.isRolling) return false;
    if (this.battleAvatar) {
      this.isReloading = true;
      this.reloadDuration = 1.2;
      this.reloadTimer = 1.2;
      this.currentMoveDir = (this.isMoving && (this.aimAtCrosshair || this.isAttacking))
        ? resolveMoveDirection(this.targetDirection.x, this.targetDirection.z)
        : 'run';
      this.battleAvatar.setMoving(this.isMoving && !this.isJumping && !this.isRolling, this.currentMoveDir);
      this.battleAvatar.reload();
      this.events.onReload?.();
      return true;
    }
    if (!this.actions['reload']) return false;
    this.isReloading = true;
    const clipDuration = this.actions['reload'].getClip()?.duration;
    this.reloadDuration = clipDuration ? clipDuration : 1.5;
    this.reloadTimer = this.reloadDuration;
    if (this.isMoving && !this.isJumping && this.actions['run'] && this.upperActions['reload']) {
      if (this.currentActionName !== 'run') {
        this.playAction('run', 0.1, true);
      }
      this.playUpperAction('reload');
    } else {
      this.playAction('reload', 0.15, false);
    }
    this.events.onReload?.();
    return true;
  }

  /**
   * 切换或设置翅膀飞行状态 (1:1 复刻 move_info.lua 飞行姿态与能量推进)
   */
  public setFlying(flying: boolean) {
    if (flying && (!this.hasWings || !this.isAlive || this.flyEnergy <= 5)) {
      flying = false;
    }
    if (this.isFlying === flying) return;
    this.isFlying = flying;
    if (flying) {
      this.isGrounded = false;
      this.isJumping = true;
      this.jumpVelocity = Math.max(this.jumpVelocity, 3.8);
      this.battleAvatar?.setFlying?.(true);
      if (this.standaloneWingActions.fly) {
        this.standaloneWingActions.idle?.stop();
        this.standaloneWingActions.fly.reset().play();
      }
    } else {
      this.flyAscendInput = 0;
      this.battleAvatar?.setFlying?.(false);
      if (this.standaloneWingActions.idle) {
        this.standaloneWingActions.fly?.stop();
        this.standaloneWingActions.idle.reset().play();
      }
    }
  }

  public toggleFlying(): boolean {
    if (this.isFlying) {
      this.setFlying(false);
      return false;
    }
    if (!this.hasWings || !this.isAlive || this.flyEnergy <= 10) return false;
    if (this.isGrounded) {
      this.modelGroup.position.y += 0.35;
      this.jumpVelocity = 5.2;
      this.isGrounded = false;
      this.isJumping = true;
      this.jumpStage = 2;
    }
    this.setFlying(true);
    this.events.onJump?.();
    return true;
  }

  /**
   * 触发起跳 / 二段跳 (jump2) / 翅膀凌空飞行 (1:1 复刻 move_info.lua)
   */
  public jump(): boolean {
    if (!this.isAlive || this.isRolling) return false;

    // 1. 地面一段起跳
    if (this.isGrounded && !this.isJumping) {
      this.isJumping = true;
      this.isGrounded = false;
      this.jumpStage = 1;
      this.jumpVelocity = 7.2;
      if (this.battleAvatar) {
        this.battleAvatar.jump();
      } else if (this.actions['jump']) {
        this.playAction('jump', 0.1, false);
      }
      this.events.onJump?.();
      return true;
    }

    // 2. 空中再次按空格 -> 触发二段跳 (jump2)，若穿戴了翅膀则直接展开双翼进入凌空飞行状态！
    if (!this.isGrounded && !this.isFlying && this.jumpStage < 2) {
      this.jumpStage = 2;
      this.jumpVelocity = 6.8;
      if (this.battleAvatar?.doubleJump) {
        this.battleAvatar.doubleJump();
      } else if (this.battleAvatar) {
        this.battleAvatar.jump();
      } else if (this.actions['jump2'] || this.actions['jump']) {
        this.playAction(this.actions['jump2'] ? 'jump2' : 'jump', 0.08, false);
      }
      if (this.hasWings && this.flyEnergy > 12) {
        this.setFlying(true);
      }
      this.events.onJump?.();
      return true;
    }

    // 3. 飞行中按空格 -> 振翅拔高
    if (this.isFlying) {
      this.jumpVelocity = 5.5;
      return true;
    }

    return false;
  }

  /**
   * 承受伤害
   */
  public takeDamage(amount: number): boolean {
    if (!this.isAlive) return false;
    if (this.godMode) {
      this.events.onDamage?.(0, this.health);
      return false;
    }
    this.health = Math.max(0, this.health - amount);
    this.events.onDamage?.(amount, this.health);

    if (this.health <= 0) {
      this.die();
      return true;
    }

    // 轻微受击硬直反应
    this.triggerHitReaction();
    return false;
  }

  private lastHitReactionAt: number = 0;

  /**
   * 仅播放受击硬直动作（不修改血量，用于远端同步受击视觉反馈，带 350ms 冷却防高频连射卡顿）
   */
  public triggerHitReaction() {
    if (!this.isAlive || this.isRolling || this.isAttacking || this.isMoving) return;
    const now = performance.now();
    if (now - this.lastHitReactionAt < 350) return;
    this.lastHitReactionAt = now;
    if (this.battleAvatar?.hit) {
      this.isHitStun = true;
      this.hitTimer = 0.25;
      this.battleAvatar.hit();
    } else if (this.actions['hit']) {
      this.isHitStun = true;
      this.hitTimer = 0.25;
      this.playAction('hit', 0.08, false);
    }
  }

  /**
   * 恢复生命值
   */
  public heal(amount: number): number {
    if (!this.isAlive || amount <= 0) return this.health;
    this.health = Math.min(this.maxHealth, Math.round(this.health + amount));
    return this.health;
  }

  /**
   * 阵亡处理
   */
  public die() {
    this.setFlying(false);
    this.isAlive = false;
    this.health = 0;
    this.isMoving = false;
    this.isRolling = false;
    this.isAttacking = false;
    this.isJumping = false;
    this.jumpStage = 0;
    this.stopUpperActions(0.05);
    if (this.battleAvatar?.die) {
      this.battleAvatar.die();
    } else if (this.actions['death']) {
      this.playAction('death', 0.2, false);
    }
    this.events.onDeath?.();
  }

  /**
   * 复活并重置状态
   */
  public revive(reviveHealth: number = this.maxHealth) {
    this.setFlying(false);
    this.isAlive = true;
    this.health = reviveHealth;
    this.flyEnergy = this.maxFlyEnergy;
    this.isMoving = false;
    this.isRolling = false;
    this.isAttacking = false;
    this.isJumping = false;
    this.isHitStun = false;
    this.hitTimer = 0;
    this.jumpStage = 0;
    this.jumpVelocity = 0;
    this.isGrounded = true;
    this.stopUpperActions(0.05);
    this.currentActionName = '';
    if (this.battleAvatar?.revive) {
      this.battleAvatar.revive();
    } else if (this.actions['idle']) {
      this.playAction('idle', 0.2, true);
    }
    this.events.onRevive?.();
  }

  /**
   * 动态设置移动速度（供疾行、过激反应、冲刺等技能实时加速）
   */
  public setSpeed(newSpeed: number) {
    this.speed = Math.max(1.0, newSpeed);
  }

  public getBaseSpeed(): number {
    return this.baseSpeed;
  }

  /**
   * 潜行隐身半透明视觉切换 (与潜行技能同步)
   */
  public setGhost(on: boolean) {
    if (this.battleAvatar) {
      this.battleAvatar.setGhost(on);
      return;
    }
    this.modelGroup.traverse((object: any) => {
      if (!object.isMesh || !object.material || object === this.hitbox) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        let base = this.ghostState.get(material);
        if (!base) {
          base = {
            transparent: material.transparent,
            opacity: material.opacity,
            depthWrite: material.depthWrite
          };
          this.ghostState.set(material, base);
        }
        material.transparent = on || base.transparent;
        material.opacity = on ? 0.32 : base.opacity;
        material.depthWrite = on ? false : base.depthWrite;
        material.needsUpdate = true;
      }
    });
  }

  /**
   * 暂停或恢复角色骨骼动画播放 (影像调整 · 播放角色动作)
   */
  public setMotion(on: boolean) {
    if (this.battleAvatar) {
      this.battleAvatar.setMotion(on);
    }
    if (this.mixer) {
      this.mixer.timeScale = on ? 1 : 0;
    }
  }

  /**
   * 强制播放指定动作（用于动作调试面板）
   */
  public setForcedAction(actionName: string | null) {
    this.forcedAction = actionName;
    if (actionName && this.actions[actionName]) {
      this.playAction(actionName, 0.2, true);
    } else if (!actionName) {
      this.currentActionName = '';
      if (this.actions['idle']) {
        this.playAction('idle', 0.2, true);
      }
    }
  }

  public getCurrentAction(): string {
    if (this.isFlying) return 'fly';
    if (this.isMoving && this.isAttacking) return `${this.activeAttackAction}+${this.currentMoveDir}`;
    if (this.isMoving) return this.currentMoveDir;
    if (this.isAttacking) return this.activeAttackAction;
    if (this.isReloading) return 'reload';
    if (this.isJumping) return this.jumpStage >= 2 ? 'jump2' : 'jump';
    if (this.isRolling) return this.currentRollDir;
    return this.currentActionName;
  }

  public getLoadedActions(): string[] {
    if (this.battleAvatar) {
      return [
        'idle',
        'run', 'runback', 'runleft', 'runright', 'runforwardleft', 'runforwardright', 'runbackleft', 'runbackright',
        'jump', 'jump2', 'fly',
        'roll', 'rollback', 'rollleft', 'rollright',
        'attack', 'reload', 'spurt'
      ];
    }
    return Object.keys(this.actions);
  }

  public setHitboxVisible(visible: boolean) {
    if (this.hitbox) {
      this.hitbox.material.visible = visible;
    }
  }

  // =========================================
  // 5. 控制指令接收 (Controller Input)
  // =========================================
  public setInput(direction: any, cameraYaw: number, jumpCmd: boolean = false) {
    if (!this.isAlive) {
      this.targetDirection.set(0, 0, 0);
      this.isMoving = false;
      return;
    }

    this.targetDirection.copy(direction);
    this.targetCameraYaw = cameraYaw;
    this.isMoving = direction.lengthSq() > 0.01;

    if (jumpCmd && !this.isJumping && !this.isRolling && this.isGrounded) {
      this.jump();
    }
  }

  /**
   * 注入地形与地图碰撞环境检测器
   */
  public setCollisionEnvironment(env: CollisionEnvironment | null) {
    this.collisionEnv = env;
  }

  // =========================================
  // 6. 物理计算与帧刷新 (Engine Loop)
  // =========================================
  public update(delta: number) {
    if (!this.isReady) return;

    if (this.standaloneWingMixer) {
      this.standaloneWingMixer.update(delta);
    }

    if (this.isGrounded) {
      this.airborneTime = 0;
    } else {
      this.airborneTime += delta;
    }
    if (this.flyAscendInput > 0) {
      this.spaceHoldTime += delta;
      // 1:1 复刻 game_text.lua tips_datalist_Item_Desc8 / id_datalist_chaonaimo_thruster_desc:
      // "原地起飞：长按空格键，实现爬升及滑翔。高处坠落过程中，长按空格键可实现滑翔并减免落地伤害。"
      if (this.hasWings && !this.isFlying && this.flyEnergy > 8) {
        if (this.isGrounded) {
          // 地面长按空格 (>= 0.16s)：自动原地起跳并展开飞行器爬升，无需松开再按
          if (this.spaceHoldTime >= 0.16) {
            this.isGrounded = false;
            this.isJumping = true;
            this.jumpStage = 2;
            this.jumpVelocity = Math.max(this.jumpVelocity, 5.2);
            this.setFlying(true);
          }
        } else if (this.spaceHoldTime >= 0.16 || this.airborneTime >= 0.18 || this.jumpVelocity < -0.8) {
          this.jumpStage = Math.max(this.jumpStage, 2);
          this.setFlying(true);
        }
      }
    } else {
      this.spaceHoldTime = 0;
    }

    // 翅膀飞行能量消耗与充能 (1:1 对应 move_info.lua fly_total_time，长按空格爬升时加速消耗，确保翼能实时动态计算)
    if (this.isFlying) {
      const drainRate = this.flyAscendInput > 0 ? 12.5 : this.flyAscendInput < 0 ? 5.0 : 7.5;
      this.flyEnergy = Math.max(0, this.flyEnergy - delta * drainRate);
      if (this.flyEnergy <= 0) {
        if (this.godMode) {
          this.flyEnergy = this.maxFlyEnergy;
        } else {
          this.setFlying(false);
        }
      }
    } else if (this.isGrounded) {
      this.flyEnergy = Math.min(this.maxFlyEnergy, this.flyEnergy + delta * 26.0);
      this.jumpStage = 0;
    } else {
      // 空中非飞行状态（如主动收翼或台阶边缘滞空）保持翼能平滑恢复，杜绝翼能数值停止计算
      this.flyEnergy = Math.min(this.maxFlyEnergy, this.flyEnergy + delta * 10.0);
    }

    // 1. 如果处于强制动作调试模式
    if (this.forcedAction && this.actions[this.forcedAction]) {
      if (this.currentActionName !== this.forcedAction) {
        this.playAction(this.forcedAction, 0.2, true);
      }
      if (this.mixer) this.mixer.update(delta);
      return;
    }

    // 2. 状态机计时更新
    if (this.isRolling) {
      this.rollTimer -= delta;
      if (this.rollTimer <= 0) this.isRolling = false;
    }

    if (this.isAttacking) {
      this.attackTimer -= delta;
      if (this.attackTimer <= 0) {
        this.isAttacking = false;
        if (this.currentUpperActionName.startsWith('attack') || this.currentUpperActionName === 'spurt') {
          this.stopUpperActions(0.08);
        }
      }
    }

    if (this.isReloading) {
      this.reloadTimer -= delta;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        if (this.currentUpperActionName === 'reload') {
          this.stopUpperActions(0.1);
        }
      }
    }

    if (this.isHitStun) {
      this.hitTimer -= delta;
      if (this.hitTimer <= 0) this.isHitStun = false;
    }

    // 3. 动画状态机决策 (优先委托给 BattleAvatar，或者使用内部 mixer 八向移动 + 四向翻滚 + 上下半身混合)
    this.currentMoveDir = (this.isMoving && (this.aimAtCrosshair || this.isAttacking))
      ? resolveMoveDirection(this.targetDirection.x, this.targetDirection.z)
      : 'run';
    if (this.battleAvatar) {
      this.battleAvatar.setMoving(
        this.isMoving && (!this.isJumping || this.isFlying) && !this.isRolling,
        this.currentMoveDir
      );
      this.battleAvatar.update(delta);
    } else if (this.isAlive) {
      let nextAction = 'idle';
      if (this.isRolling && (this.actions[this.currentRollDir] || this.actions['roll'])) {
        nextAction = this.actions[this.currentRollDir] ? this.currentRollDir : 'roll';
      } else if (this.isFlying && (this.actions['fly'] || this.actions['jump'])) {
        nextAction = this.actions['fly'] ? 'fly' : 'jump';
      } else if (this.isJumping && this.actions['jump']) {
        nextAction = 'jump';
      } else if (this.isMoving && (this.actions[this.currentMoveDir] || this.actions['run'])) {
        nextAction = this.actions[this.currentMoveDir] ? this.currentMoveDir : 'run';
        if (this.isAttacking && this.upperActions[this.activeAttackAction] && this.currentUpperActionName !== this.activeAttackAction) {
          this.playUpperAction(this.activeAttackAction);
        } else if (this.isReloading && this.upperActions['reload'] && this.currentUpperActionName !== 'reload') {
          this.playUpperAction('reload');
        }
      } else if (this.isHitStun && this.actions['hit']) {
        nextAction = 'hit';
      } else if (this.isAttacking && this.actions[this.activeAttackAction]) {
        nextAction = this.activeAttackAction;
      } else if (this.isReloading && this.actions['reload']) {
        nextAction = 'reload';
      }

      if (!this.isMoving && this.currentUpperActionName) {
        this.stopUpperActions(0.05);
      }

      if (this.currentActionName !== nextAction && this.actions[nextAction]) {
        const isOneShot = ['roll', 'rollback', 'rollleft', 'rollright', 'attack', 'attack2', 'attack3', 'spurt', 'reload', 'hit'].includes(nextAction);
        this.playAction(nextAction, 0.12, !isOneShot);
      }

      if (this.mixer) {
        this.mixer.update(delta);
      }
    }

    if (!this.isAlive) return;

    // 5. 转身与平移物理 (含边走路边射击、准星朝向锁定、地形碰撞及边界检测)
    const currentPos = this.modelGroup.position;
    this.candidatePos.copy(currentPos);

    if (this.isRolling) {
      // 翻滚位移
      const moveStep = this.rollDirection.clone().multiplyScalar(this.rollSpeed * delta);
      this.candidatePos.add(moveStep);
    } else if (this.isMoving) {
      // 计算相对于摄像机朝向的真实移动方向角 (WASD 全向移动)
      const inputAngle = Math.atan2(this.targetDirection.x, this.targetDirection.z);
      const moveAngle = this.targetCameraYaw + inputAngle;

      // 角色朝向：开火或越肩瞄准模式下始终面朝准星 (targetCameraYaw)，否则面向移动方向
      const desiredFacingYaw = (this.isAttacking || this.aimAtCrosshair) ? this.targetCameraYaw : moveAngle;
      let diff = desiredFacingYaw - this.modelGroup.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.modelGroup.rotation.y += diff * (this.isAttacking ? 28 : 16) * delta;

      // 位移直接沿 moveAngle 推进，翅膀飞行状态下获得 1.32x 凌空推进速度加成
      const effectiveSpeed = this.isFlying ? this.speed * 1.32 : this.speed;
      const moveX = Math.sin(moveAngle) * effectiveSpeed * delta;
      const moveZ = Math.cos(moveAngle) * effectiveSpeed * delta;
      this.candidatePos.x += moveX;
      this.candidatePos.z += moveZ;

      // 脚步声节奏触发
      if (this.isGrounded && !this.isFlying) {
        this.footstepTimer -= delta;
        if (this.footstepTimer <= 0) {
          this.footstepIndex = (this.footstepIndex % 3) + 1;
          this.events.onFootstep?.(this.footstepIndex);
          this.footstepTimer = 0.34;
        }
      }
    } else {
      this.footstepTimer = 0;
      // 站立不动时：若处于开火或准星跟随状态，平滑转向准星方向
      if (this.isAttacking || this.aimAtCrosshair) {
        let diff = this.targetCameraYaw - this.modelGroup.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        if (this.isAttacking) {
          this.modelGroup.rotation.y = this.targetCameraYaw;
        } else {
          this.modelGroup.rotation.y += diff * 18 * delta;
        }
      }
    }

    // 6. 碰撞环境阻挡、墙壁平滑滑动与防卡死脱困
    if (this.collisionEnv) {
      if (this.collisionEnv.resolveMovement) {
        const resolved = this.collisionEnv.resolveMovement(currentPos, this.candidatePos, this.isGrounded && !this.isFlying);
        currentPos.x = resolved.x;
        currentPos.z = resolved.z;
        if (this.isGrounded && !this.isFlying) {
          if (resolved.floorY !== undefined) {
            currentPos.y = resolved.floorY;
          } else if (this.collisionEnv.floorAt) {
            const belowFloor = this.collisionEnv.floorAt(currentPos.x, currentPos.z, currentPos.y + 0.6, 0.82);
            if (belowFloor !== undefined) {
              if (currentPos.y - belowFloor > 0.85) {
                this.isGrounded = false;
              } else {
                currentPos.y = belowFloor;
              }
            } else {
              this.isGrounded = false;
            }
          }
        }
      } else {
        const bounds = this.collisionEnv.bounds;
        if (bounds && bounds.length >= 4) {
          const [cx, cz, w, d] = bounds;
          const halfW = w / 2;
          const halfD = d / 2;
          if (this.candidatePos.x < cx - halfW || this.candidatePos.x > cx + halfW ||
              this.candidatePos.z < cz - halfD || this.candidatePos.z > cz + halfD) {
            this.candidatePos.x = currentPos.x;
            this.candidatePos.z = currentPos.z;
          }
        }

        const floor = this.collisionEnv.floorAt ? this.collisionEnv.floorAt(
          this.candidatePos.x,
          this.candidatePos.z,
          currentPos.y + (this.isGrounded ? 1.1 : 0.55),
          this.isGrounded ? 0.82 : 0.55
        ) : undefined;

        const blocked = this.collisionEnv.isBlocked ? this.collisionEnv.isBlocked(currentPos, this.candidatePos) : false;

        if (!blocked && (this.isFlying || floor === undefined || floor - currentPos.y <= (this.isGrounded ? 0.82 : 0.55))) {
          currentPos.x = this.candidatePos.x;
          currentPos.z = this.candidatePos.z;
          if (this.isGrounded && !this.isFlying && floor !== undefined && Math.abs(floor - currentPos.y) <= 0.85) {
            currentPos.y = floor;
          }
        }
      }
    } else {
      // 无碰撞环境（沙盒平地模式）直接应用候选位移
      currentPos.x = this.candidatePos.x;
      currentPos.z = this.candidatePos.z;
    }

    // 7. 垂直跳跃、翅膀凌空飞行、顶棚防穿模与重力物理
    if (this.isFlying) {
      const prevY = currentPos.y;
      const targetVy = this.flyAscendInput > 0
        ? 5.6
        : this.flyAscendInput < 0
          ? -5.2
          : Math.sin(performance.now() * 0.0065) * 0.52;
      this.jumpVelocity += (targetVy - this.jumpVelocity) * Math.min(1, delta * 10);
      currentPos.y += this.jumpVelocity * delta;

      // 飞行高度上限与顶棚碰撞保护
      if (this.jumpVelocity > 0 && this.collisionEnv?.ceilingAt) {
        const ceilY = this.collisionEnv.ceilingAt(currentPos.x, currentPos.z, currentPos.y, 1.95);
        if (ceilY !== undefined && currentPos.y + 1.72 >= ceilY) {
          currentPos.y = Math.min(currentPos.y, ceilY - 1.75);
          this.jumpVelocity = 0;
        }
      }
      currentPos.y = Math.min(currentPos.y, 38);

      let groundY: number | undefined = this.collisionEnv ? undefined : 0;
      if (this.collisionEnv && this.collisionEnv.floorAt) {
        const probeFromY = Math.max(prevY, currentPos.y) + 0.85;
        groundY = this.collisionEnv.floorAt(currentPos.x, currentPos.z, probeFromY, 0.85);
      }
      if (groundY !== undefined && currentPos.y <= groundY + 0.04 && this.flyAscendInput <= 0 && this.jumpVelocity <= 0.25) {
        this.setFlying(false);
        currentPos.y = groundY;
        this.jumpVelocity = 0;
        this.isJumping = false;
        this.isGrounded = true;
        this.jumpStage = 0;
        this.events.onLand?.();
      } else if (groundY !== undefined && currentPos.y < groundY) {
        currentPos.y = groundY;
      }

      if (this.collisionEnv?.resolveMovement) {
        const postFly = this.collisionEnv.resolveMovement(currentPos, currentPos, this.isGrounded && !this.isFlying);
        currentPos.x = postFly.x;
        currentPos.z = postFly.z;
      }
    } else if (this.isJumping || !this.isGrounded) {
      const prevY = currentPos.y;
      // 限制最大自由落体终端速度 (-20 m/s)，避免高空坠落单帧步长过大
      this.jumpVelocity = Math.max(this.jumpVelocity + this.gravity * delta, -20.0);
      currentPos.y += this.jumpVelocity * delta;

      // 上升阶段头顶天花板碰撞检测，防止跳入空心屋顶
      if (this.jumpVelocity > 0 && this.collisionEnv?.ceilingAt) {
        const ceilY = this.collisionEnv.ceilingAt(currentPos.x, currentPos.z, currentPos.y, 1.95);
        if (ceilY !== undefined && currentPos.y + 1.72 >= ceilY) {
          currentPos.y = Math.min(currentPos.y, ceilY - 1.75);
          this.jumpVelocity = 0;
        }
      }

      // 连续碰撞检测 (CCD)：始终从上一帧高度 prevY 之上 (+0.85m) 向下扫掠探测，彻底杜绝高空高速自由落体单帧穿透薄地板掉入地下
      let groundY: number | undefined = this.collisionEnv ? undefined : 0;
      if (this.collisionEnv && this.collisionEnv.floorAt) {
        const probeFromY = Math.max(prevY, currentPos.y) + 0.85;
        groundY = this.collisionEnv.floorAt(currentPos.x, currentPos.z, probeFromY, 0.85);
        // 若因极端掉帧或斜向滑落导致角色已低于最底层地面 (groundY === undefined)，立即向上方回溯探测真实地面拦截
        if (groundY === undefined && this.jumpVelocity <= 0) {
          const nearOverhead = this.collisionEnv.floorAt(currentPos.x, currentPos.z, prevY + 2.6, 2.6);
          if (nearOverhead !== undefined && prevY >= nearOverhead - 0.6) {
            groundY = nearOverhead;
          } else if (currentPos.y < -2.2) {
            const mapFloor = this.collisionEnv.floorAt(currentPos.x, currentPos.z, 25);
            if (mapFloor !== undefined) {
              groundY = mapFloor;
            }
          }
        }
      }

      if (groundY !== undefined && this.jumpVelocity <= 0 && currentPos.y <= groundY) {
        currentPos.y = groundY;
        this.jumpVelocity = 0;
        this.isJumping = false;
        this.isGrounded = true;
        this.jumpStage = 0;
        this.events.onLand?.();
      } else if (currentPos.y < -15) {
        // 深渊防跌落安全兜底
        const safeY = this.collisionEnv?.floorAt?.(currentPos.x, currentPos.z, 25) ?? 0;
        currentPos.y = safeY;
        this.jumpVelocity = 0;
        this.isJumping = false;
        this.isGrounded = true;
        this.jumpStage = 0;
      }

      // 垂直高度变化后再次执行水平脱困校验，防止从高空垂直落入建筑边缘 DeadAABB 或斜切空气墙内部
      if (this.collisionEnv?.resolveMovement) {
        const postAir = this.collisionEnv.resolveMovement(currentPos, currentPos, this.isGrounded && !this.isFlying);
        currentPos.x = postAir.x;
        currentPos.z = postAir.z;
      }
    }
  }

  // =========================================
  // 7. 资源清理 (Disposal)
  // =========================================
  public dispose() {
    this.clearWeapons();
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    this.actions = {};
    this.upperActions = {};

    this.modelGroup.traverse((child: any) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m: any) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });

    if (this.modelGroup.parent) {
      this.modelGroup.parent.remove(this.modelGroup);
    }
    this.isReady = false;
  }
}
