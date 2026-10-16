import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CollisionEnvironment, EntityEvents } from './types';
import type { WeaponPartConfig } from './configs/weaponSuites';
import { createStylizedWeaponMesh, enhanceLoadedWeaponModel } from './ProceduralWeaponBuilder';

import { buildFullAvatar, type BuildAvatarOptions } from './avatarBuilder';

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

  // 环境碰撞与地图适配接口
  private collisionEnv: CollisionEnvironment | null = null;

  // 临时数学计算对象
  private candidatePos = new THREE.Vector3();
  private worldMuzzlePos = new THREE.Vector3();

  constructor(scene: any) {
    this.modelGroup = new THREE.Group();
    scene.add(this.modelGroup);

    // 构建不可见的受击胶囊体 (Hitbox)
    const capsuleGeom = new THREE.CapsuleGeometry(0.38, 0.95, 4, 8);
    const capMat = new THREE.MeshBasicMaterial({ visible: false, wireframe: true });
    this.hitbox = new THREE.Mesh(capsuleGeom, capMat);
    this.hitbox.position.y = 0.85;
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

    // 2. 常见别名回退
    const isLeft = boneName.toLowerCase().includes('l');
    const candidates = isLeft
      ? ['handweapon_l', 'hand_l', 'Bip01 L Hand', 'Bip01_L_Hand', 'mixamorig:LeftHand', 'LeftHand', 'L_Hand']
      : ['handweapon_r', 'hand_r', 'Bip01 R Hand', 'Bip01_R_Hand', 'mixamorig:RightHand', 'RightHand', 'R_Hand'];

    for (const name of candidates) {
      const idx = this.boneIndices.get(name);
      if (idx !== undefined && this.mainSkeleton.bones[idx]) {
        return this.mainSkeleton.bones[idx];
      }
    }

    // 3. 模糊字符串匹配
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
      const effectiveDuration = data.duration ? data.duration * (rawFps / effectiveFps) : -1;
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
      this.battleAvatar.roll();
    } else {
      this.playAction('roll', 0.12, false);
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
      this.battleAvatar.setMoving(this.isMoving && !this.isJumping && !this.isRolling);
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
   * 触发换弹动作 (支持边移动边换弹)
   */
  public reload(): boolean {
    if (!this.isAlive || this.isReloading || this.isRolling) return false;
    if (this.battleAvatar) {
      this.isReloading = true;
      this.reloadDuration = 1.2;
      this.reloadTimer = 1.2;
      this.battleAvatar.setMoving(this.isMoving && !this.isJumping && !this.isRolling);
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
   * 触发起跳
   */
  public jump(): boolean {
    if (!this.isAlive || this.isJumping || this.isRolling || !this.isGrounded) return false;
    this.isJumping = true;
    this.isGrounded = false;
    this.jumpVelocity = 7.2;
    if (this.battleAvatar) {
      this.battleAvatar.jump();
    } else if (this.actions['jump']) {
      this.playAction('jump', 0.1, false);
    }
    this.events.onJump?.();
    return true;
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
    if (!this.isRolling && !this.isAttacking && !this.isMoving && this.actions['hit']) {
      this.isHitStun = true;
      this.hitTimer = 0.25;
      this.playAction('hit', 0.08, false);
    }
    return false;
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
    this.isAlive = false;
    this.health = 0;
    this.isMoving = false;
    this.isRolling = false;
    this.isAttacking = false;
    this.isJumping = false;
    this.stopUpperActions(0.05);
    if (this.actions['death']) {
      this.playAction('death', 0.2, false);
    }
    this.events.onDeath?.();
  }

  /**
   * 复活并重置状态
   */
  public revive(reviveHealth: number = this.maxHealth) {
    this.isAlive = true;
    this.health = reviveHealth;
    this.isRolling = false;
    this.isAttacking = false;
    this.isJumping = false;
    this.isGrounded = true;
    this.stopUpperActions(0.05);
    this.currentActionName = '';
    if (this.actions['idle']) {
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
    if (this.isMoving && this.isAttacking) return `${this.activeAttackAction}+run`;
    if (this.isMoving) return 'run';
    if (this.isAttacking) return this.activeAttackAction;
    if (this.isReloading) return 'reload';
    if (this.isJumping) return 'jump';
    if (this.isRolling) return 'roll';
    return this.currentActionName;
  }

  public getLoadedActions(): string[] {
    if (this.battleAvatar) {
      return ['idle', 'run', 'jump', 'roll', 'attack', 'reload', 'spurt'];
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

    // 3. 动画状态机决策 (优先委托给 BattleAvatar，或者使用内部 mixer 上下半身混合)
    if (this.battleAvatar) {
      this.battleAvatar.setMoving(this.isMoving && !this.isJumping && !this.isRolling);
      this.battleAvatar.update(delta);
    } else if (this.isAlive) {
      let nextAction = 'idle';
      if (this.isRolling && this.actions['roll']) {
        nextAction = 'roll';
      } else if (this.isJumping && this.actions['jump']) {
        nextAction = 'jump';
      } else if (this.isMoving && this.actions['run']) {
        nextAction = 'run';
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
        const isOneShot = ['roll', 'attack', 'attack2', 'attack3', 'spurt', 'reload', 'hit'].includes(nextAction);
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

      // 位移直接沿 moveAngle 推进，支持边横向平移(A/D)/后退(S)边朝准星开火
      const moveX = Math.sin(moveAngle) * this.speed * delta;
      const moveZ = Math.cos(moveAngle) * this.speed * delta;
      this.candidatePos.x += moveX;
      this.candidatePos.z += moveZ;

      // 脚步声节奏触发
      if (this.isGrounded) {
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

    // 6. 碰撞环境阻挡与地图边界适配
    if (this.collisionEnv) {
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
        currentPos.y + (this.isGrounded ? 2.4 : 0.3)
      ) : undefined;

      const blocked = this.collisionEnv.isBlocked ? this.collisionEnv.isBlocked(currentPos, this.candidatePos) : false;

      if (!blocked && (floor === undefined || !this.isGrounded || Math.abs(floor - currentPos.y) < 0.75)) {
        currentPos.x = this.candidatePos.x;
        currentPos.z = this.candidatePos.z;
        if (this.isGrounded && floor !== undefined) {
          currentPos.y = floor;
        }
      }
    } else {
      // 无碰撞环境（沙盒平地模式）直接应用候选位移
      currentPos.x = this.candidatePos.x;
      currentPos.z = this.candidatePos.z;
    }

    // 7. 垂直跳跃与重力物理
    if (this.isJumping || !this.isGrounded) {
      this.jumpVelocity += this.gravity * delta;
      currentPos.y += this.jumpVelocity * delta;

      // 检查下方地面
      let groundY = 0; // 沙盒默认地平面 Y = 0
      if (this.collisionEnv && this.collisionEnv.floorAt) {
        const queriedFloor = this.collisionEnv.floorAt(currentPos.x, currentPos.z, currentPos.y + 0.3);
        if (queriedFloor !== undefined) {
          groundY = queriedFloor;
        }
      }

      if (this.jumpVelocity <= 0 && currentPos.y <= groundY) {
        currentPos.y = groundY;
        this.jumpVelocity = 0;
        this.isJumping = false;
        this.isGrounded = true;
        this.events.onLand?.();
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
