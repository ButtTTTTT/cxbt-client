import * as THREE from 'three';

export interface CameraControllerOptions {
  distance?: number;
  minDistance?: number;
  maxDistance?: number;
  pitch?: number;
  yaw?: number;
  minPitch?: number;
  maxPitch?: number;
  heightOffset?: number;
  shoulderOffset?: number;
  smoothSpeed?: number;
  sensitivity?: { x: number; y: number };
}

/**
 * 第三人称越肩射击追随摄像机控制器 (Third-Person Shoulder Camera Controller)
 * 具备平滑插值追踪、越肩视点、开镜缩放及防穿墙阻挡检测
 */
export class CameraController {
  public camera: any;
  public target: any = null; // THREE.Object3D 或 THREE.Vector3

  public yaw: number = 0;
  public pitch: number = 0.1;
  public distance: number = 2.9;
  public isAiming: boolean = false;

  private minDistance: number = 1.2;
  private maxDistance: number = 6.0;
  private minPitch: number = -0.38;
  private maxPitch: number = 0.72;
  private heightOffset: number = 1.25;
  private shoulderOffset: number = 0.35; // 略微右偏，越肩视野
  private smoothSpeed: number = 18.0;

  private sensitivityX: number = 0.0035;
  private sensitivityY: number = 0.0025;

  private currentPosition = new THREE.Vector3();
  private desiredPosition = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();

  constructor(camera: any, options?: CameraControllerOptions) {
    this.camera = camera;
    if (options) {
      if (options.distance !== undefined) this.distance = options.distance;
      if (options.minDistance !== undefined) this.minDistance = options.minDistance;
      if (options.maxDistance !== undefined) this.maxDistance = options.maxDistance;
      if (options.pitch !== undefined) this.pitch = options.pitch;
      if (options.yaw !== undefined) this.yaw = options.yaw;
      if (options.minPitch !== undefined) this.minPitch = options.minPitch;
      if (options.maxPitch !== undefined) this.maxPitch = options.maxPitch;
      if (options.heightOffset !== undefined) this.heightOffset = options.heightOffset;
      if (options.shoulderOffset !== undefined) this.shoulderOffset = options.shoulderOffset;
      if (options.smoothSpeed !== undefined) this.smoothSpeed = options.smoothSpeed;
      if (options.sensitivity) {
        this.sensitivityX = options.sensitivity.x;
        this.sensitivityY = options.sensitivity.y;
      }
    }
    this.currentPosition.copy(camera.position);
  }

  /**
   * 绑定追踪目标（例如 PlayerEntity.modelGroup 或 Vector3 坐标）
   */
  public setTarget(target: any) {
    this.target = target;
  }

  /**
   * 鼠标移动事件回调
   */
  public handlePointerMove(movementX: number, movementY: number) {
    this.yaw -= movementX * this.sensitivityX;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + movementY * this.sensitivityY,
      this.minPitch,
      this.maxPitch
    );
  }

  public onMouseMove(movementX: number, movementY: number) {
    this.handlePointerMove(movementX, movementY);
  }

  /**
   * 滚轮视距调节
   */
  public handleWheel(deltaY: number) {
    const delta = deltaY > 0 ? 0.3 : -0.3;
    this.distance = THREE.MathUtils.clamp(this.distance + delta, this.minDistance, this.maxDistance);
  }

  /**
   * 设置是否进入精细瞄准 (ADS / Zoom) 视角
   */
  public setAiming(aiming: boolean) {
    this.isAiming = aiming;
  }

  /**
   * 获取摄像机正前方视线方向
   */
  public getForwardDirection(): any {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return dir;
  }

  private focusPoint = new THREE.Vector3();
  private dirFromFocus = new THREE.Vector3();

  /**
   * 帧更新：计算摄像机越肩跟随、平滑过渡及场景阻挡防穿墙
   */
  public update(delta: number, collisionMeshes?: any[]) {
    if (!this.target) return;

    const targetPos = this.target.isVector3 ? this.target : this.target.position;
    const currentDist = this.isAiming ? Math.max(1.5, this.distance * 0.6) : this.distance;
    const currentShoulder = this.isAiming ? this.shoulderOffset * 0.8 : this.shoulderOffset;

    // 1. 计算角色头部焦点 (Focus Point)
    this.focusPoint.set(
      targetPos.x,
      targetPos.y + this.heightOffset + this.pitch * 0.4,
      targetPos.z
    );

    // 2. 计算理想越肩相机世界位置 (Desired Camera Position)
    const cosPitch = Math.cos(this.pitch);
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);

    this.desiredPosition.set(
      this.focusPoint.x - sinYaw * currentDist * cosPitch + cosYaw * currentShoulder,
      this.focusPoint.y + Math.sin(this.pitch) * currentDist + 0.4,
      this.focusPoint.z - cosYaw * currentDist * cosPitch - sinYaw * currentShoulder
    );

    // 3. 防穿墙遮挡检测 (优先走 MapCollider 空间网格求交，耗时 < 0.002ms，消除全图三角面遍历)
    if (collisionMeshes && collisionMeshes.length > 0) {
      this.dirFromFocus.copy(this.desiredPosition).sub(this.focusPoint);
      const targetLength = this.dirFromFocus.length();
      if (targetLength > 0.1) {
        this.dirFromFocus.multiplyScalar(1 / targetLength);
        const spatialCollider = (collisionMeshes as any)._collider;
        if (spatialCollider && typeof spatialCollider.raycastCamera === 'function') {
          const hitDist = spatialCollider.raycastCamera(this.focusPoint, this.dirFromFocus, targetLength);
          if (hitDist !== null && hitDist > 0.15) {
            this.desiredPosition.copy(this.focusPoint).addScaledVector(this.dirFromFocus, Math.max(0.4, hitDist - 0.15));
          }
        } else {
          this.raycaster.set(this.focusPoint, this.dirFromFocus);
          this.raycaster.far = targetLength;
          const hits = this.raycaster.intersectObjects(collisionMeshes, false);
          for (let i = 0; i < hits.length; i++) {
            const h: any = hits[i];
            if (h.distance > 0.15 && !h.object?.userData?.isPlayer && !h.object?.userData?.isBoss) {
              this.desiredPosition.copy(this.focusPoint).addScaledVector(this.dirFromFocus, Math.max(0.4, h.distance - 0.15));
              break;
            }
          }
        }
      }
    }

    // 4. 平滑插值 (Exponential Decay / Lerp)
    const factor = 1.0 - Math.exp(-this.smoothSpeed * delta);
    this.currentPosition.lerp(this.desiredPosition, factor);
    this.camera.position.copy(this.currentPosition);

    // 5. 视角朝向准心与前瞻焦点
    this.lookTarget.set(
      this.focusPoint.x + sinYaw * 4.0,
      this.focusPoint.y - Math.sin(this.pitch) * 2.5,
      this.focusPoint.z + cosYaw * 4.0
    );
    this.camera.lookAt(this.lookTarget);
  }
}
