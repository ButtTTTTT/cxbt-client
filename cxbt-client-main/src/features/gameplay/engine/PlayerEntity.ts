import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CollisionEnvironment, EntityEvents } from './types';

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

  // 受击胶囊碰撞体
  public hitbox: any = null;

  // 事件回调接口
  public events: EntityEvents = {};

  // 动画动作表与状态
  private actions: Record<string, any> = {};
  private currentActionName: string = 'idle';
  private forcedAction: string | null = null;

  // 骨架与挂点
  private mainSkeleton: any = null;
  private boneIndices = new Map<string, number>();
  private weaponParts: { slot: number; group: any }[] = [];
  private activeWeaponSlot: number = 0;

  // 物理与移动参数
  private speed: number = 4.8;
  private rollSpeed: number = 8.5;
  private gravity: number = -18.0;
  private jumpVelocity: number = 0;
  private isGrounded: boolean = true;
  private isJumping: boolean = false;

  // 动作状态计时器
  private isRolling: boolean = false;
  private rollTimer: number = 0;
  private rollDuration: number = 0.8;
  private rollDirection = new THREE.Vector3();

  private isAttacking: boolean = false;
  private attackTimer: number = 0;
  private attackDuration: number = 0.6;

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
  private isMoving: boolean = false;

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
  public async loadAvatar(headPath: string, bodyPath: string) {
    const loader = new GLTFLoader();
    try {
      const [headGltf, bodyGltf] = await Promise.all([
        loader.loadAsync(headPath),
        loader.loadAsync(bodyPath)
      ]);

      const headScene = headGltf.scene;
      this.modelGroup.add(headScene);

      // 提取身体模型中的蒙皮网格 (SkinnedMesh) 并重绑到主骨架
      const bodyScene = bodyGltf.scene;
      this.mainSkeleton = null;

      headScene.traverse((child: any) => {
        if (child.isSkinnedMesh && !this.mainSkeleton) {
          this.mainSkeleton = child.skeleton;
        }
      });

      this.boneIndices.clear();
      if (this.mainSkeleton) {
        this.mainSkeleton.bones.forEach((bone: any, index: number) => {
          this.boneIndices.set(bone.name, index);
        });
      }

      const bodyMeshes: any[] = [];
      bodyScene.traverse((child: any) => {
        if (child.isSkinnedMesh) bodyMeshes.push(child);
      });

      bodyMeshes.forEach(mesh => {
        if (this.mainSkeleton) {
          // 重新映射顶点绑定的骨骼索引 (极其关键，否则模型会变形拉伸)
          const indices = mesh.geometry.attributes.skinIndex;
          const oldSkeleton = mesh.skeleton;
          if (oldSkeleton) {
            for (let i = 0; i < indices.array.length; i++) {
              const boneName = oldSkeleton.bones[indices.array[i]].name;
              const targetIdx = this.boneIndices.get(boneName);
              if (targetIdx !== undefined) {
                indices.array[i] = targetIdx;
              }
            }
            indices.needsUpdate = true;
          }
          mesh.bind(this.mainSkeleton, new THREE.Matrix4());
        }
        headScene.add(mesh);
      });

      // 初始化动画混合器
      this.mixer = new THREE.AnimationMixer(this.modelGroup);
      this.isReady = true;

      return headScene;
    } catch (err) {
      console.error('[PlayerEntity] Avatar Loading Error:', err);
      throw err;
    }
  }

  // =========================================
  // 2. 武器模型挂接 (Weapon Mounting)
  // =========================================
  public async attachWeaponModel(slot: number, modelPath: string, boneName: string, texturePath?: string): Promise<any> {
    if (!this.mainSkeleton) {
      console.warn('[PlayerEntity] Cannot attach weapon before avatar skeleton is ready.');
      return null;
    }

    const boneIndex = this.boneIndices.get(boneName);
    if (boneIndex === undefined) {
      console.warn(`[PlayerEntity] Bone not found for weapon attachment: ${boneName}`);
      return null;
    }

    const targetBone = this.mainSkeleton.bones[boneIndex];
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(modelPath);
    const weaponModel = gltf.scene;

    if (texturePath) {
      const texLoader = new THREE.TextureLoader();
      const texture = await texLoader.loadAsync(texturePath);
      texture.colorSpace = THREE.SRGBColorSpace;
      weaponModel.traverse((child: any) => {
        if (child.isMesh) {
          child.material = new THREE.MeshPhongMaterial({ map: texture });
        }
      });
    }

    weaponModel.visible = slot === this.activeWeaponSlot;
    targetBone.add(weaponModel);
    this.weaponParts.push({ slot, group: weaponModel });
    return weaponModel;
  }

  public switchWeaponSlot(slot: number) {
    this.activeWeaponSlot = slot;
    this.weaponParts.forEach(part => {
      part.group.visible = part.slot === slot;
    });
  }

  /**
   * 计算角色枪口或投射物发射的世界坐标
   */
  public getMuzzlePosition(): any {
    const yaw = this.modelGroup.rotation.y;
    this.worldMuzzlePos.copy(this.modelGroup.position).add(
      new THREE.Vector3(Math.sin(yaw) * 0.75, 1.25, Math.cos(yaw) * 0.75)
    );
    return this.worldMuzzlePos.clone();
  }

  // =========================================
  // 3. 动画解析与加载 (Animation System)
  // =========================================
  public async loadAnimations(animMap: Record<string, string>) {
    if (!this.mixer) {
      console.warn('[PlayerEntity] Please loadAvatar before loadAnimations.');
      return;
    }

    const fetchClip = async (path: string, name: string) => {
      const response = await fetch(path);
      const data = await response.json();
      return new THREE.AnimationClip(name, data.duration ?? -1, data.tracks.flatMap((track: any) => {
        const positionTimes = track.positions.map((_: any, idx: number) => idx / data.fps);
        const rotationTimes = track.rotations.map((_: any, idx: number) => idx / data.fps);
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

      for (const [actionName, path] of Object.entries(animMap)) {
        if (!path) continue;
        const clip = await fetchClip(path, actionName);
        this.actions[actionName] = this.mixer.clipAction(clip);
      }

      if (this.forcedAction && this.actions[this.forcedAction]) {
        this.playAction(this.forcedAction, 0.2, true);
      } else if (this.actions['idle']) {
        this.playAction('idle', 0.2, true);
      }
    } catch (err) {
      console.error('[PlayerEntity] Animation Loading Error:', err);
    }
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
      next.clampWhenFinished = false;
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
    if (!this.isAlive || this.isRolling || this.isJumping || !this.actions['roll']) return false;
    this.isRolling = true;
    const clipDuration = this.actions['roll'].getClip()?.duration;
    this.rollDuration = clipDuration ? Math.min(clipDuration, 0.95) : 0.8;
    this.rollTimer = this.rollDuration;

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

    this.playAction('roll', 0.12, false);
    this.events.onRoll?.();
    return true;
  }

  /**
   * 触发近战攻击或射击动作
   */
  public attack(): boolean {
    if (!this.isAlive || this.isAttacking || this.isRolling || !this.actions['attack']) return false;
    this.isAttacking = true;
    const clipDuration = this.actions['attack'].getClip()?.duration;
    this.attackDuration = clipDuration ? Math.min(clipDuration, 1.2) : 0.6;
    this.attackTimer = this.attackDuration;
    this.playAction('attack', 0.1, false);
    this.events.onAttack?.('attack');
    return true;
  }

  /**
   * 触发换弹动作
   */
  public reload(): boolean {
    if (!this.isAlive || this.isReloading || this.isRolling || !this.actions['reload']) return false;
    this.isReloading = true;
    const clipDuration = this.actions['reload'].getClip()?.duration;
    this.reloadDuration = clipDuration ? clipDuration : 1.5;
    this.reloadTimer = this.reloadDuration;
    this.playAction('reload', 0.15, false);
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
    if (this.actions['jump']) {
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
    this.health = Math.max(0, this.health - amount);
    this.events.onDamage?.(amount, this.health);

    if (this.health <= 0) {
      this.die();
      return true;
    }

    // 轻微受击硬直反应
    if (!this.isRolling && !this.isAttacking && this.actions['hit']) {
      this.isHitStun = true;
      this.hitTimer = 0.3;
      this.playAction('hit', 0.08, false);
    }
    return false;
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
    this.currentActionName = '';
    if (this.actions['idle']) {
      this.playAction('idle', 0.2, true);
    }
    this.events.onRevive?.();
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
    return this.currentActionName;
  }

  public getLoadedActions(): string[] {
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
  public setInput(direction: any, cameraYaw: number, jumpCmd: boolean) {
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
      if (this.attackTimer <= 0) this.isAttacking = false;
    }

    if (this.isReloading) {
      this.reloadTimer -= delta;
      if (this.reloadTimer <= 0) this.isReloading = false;
    }

    if (this.isHitStun) {
      this.hitTimer -= delta;
      if (this.hitTimer <= 0) this.isHitStun = false;
    }

    // 3. 动画状态机决策
    if (this.isAlive) {
      let nextAction = 'idle';
      if (this.isRolling && this.actions['roll']) {
        nextAction = 'roll';
      } else if (this.isHitStun && this.actions['hit']) {
        nextAction = 'hit';
      } else if (this.isAttacking && this.actions['attack']) {
        nextAction = 'attack';
      } else if (this.isReloading && this.actions['reload']) {
        nextAction = 'reload';
      } else if (this.isJumping && this.actions['jump']) {
        nextAction = 'jump';
      } else if (this.isMoving && this.actions['run']) {
        nextAction = 'run';
      }

      if (this.currentActionName !== nextAction && this.actions[nextAction]) {
        const isOneShot = ['roll', 'attack', 'reload', 'hit'].includes(nextAction);
        this.playAction(nextAction, 0.15, !isOneShot);
      }
    }

    // 4. 更新骨骼动作时间轴
    if (this.mixer) {
      this.mixer.update(delta);
    }

    if (!this.isAlive) return;

    // 5. 转身与平移物理 (含地形碰撞、边界及阻挡检测)
    const currentPos = this.modelGroup.position;
    this.candidatePos.copy(currentPos);

    if (this.isRolling) {
      // 翻滚位移
      const moveStep = this.rollDirection.clone().multiplyScalar(this.rollSpeed * delta);
      this.candidatePos.add(moveStep);
    } else if (this.isMoving && !this.isAttacking) {
      // 角色平滑转身面朝摄像机方向与移动方向之和
      const angle = Math.atan2(this.targetDirection.x, this.targetDirection.z);
      const targetRotation = this.targetCameraYaw + angle;

      let diff = targetRotation - this.modelGroup.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;

      this.modelGroup.rotation.y += diff * 12 * delta; // 转身角速度

      const moveX = Math.sin(this.modelGroup.rotation.y) * this.speed * delta;
      const moveZ = Math.cos(this.modelGroup.rotation.y) * this.speed * delta;
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
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    this.actions = {};

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
