import * as THREE from 'three';
import type { CollisionEnvironment } from './types';

/**
 * 地图物理碰撞与地面查询引擎模块
 * 负责角色与场景的地形贴合、阻挡检测、空气墙和射线命中查询
 */
export class MapCollider {
  public mapVisible: any[] = [];
  public collisionMeshes: any[] = [];
  public floorMeshes: any[] = [];
  public bounds: number[] | null = null;

  private raycaster = new THREE.Raycaster();
  private down = new THREE.Vector3(0, -1, 0);
  private airWallMaterial: any = null;
  private replacedMaterials = new Set<any>();

  constructor() {
    this.airWallMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false
    });
  }

  /**
   * 注册渲染视觉网格并处理空气墙
   */
  public registerVisualScene(visual: any, airWallNames: string[] = []) {
    const airWallSet = new Set(airWallNames);
    visual.traverse((object: any) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (airWallSet.has(object.name)) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((mat: any) => this.replacedMaterials.add(mat));
        object.material = this.airWallMaterial;
        object.userData.airWall = true;
        return;
      }
      object.frustumCulled = true;
      this.mapVisible.push(object);
    });
  }

  /**
   * 注册物理碰撞体网格 (Collision GLTF)
   */
  public registerCollisionScene(collision: any) {
    if (!collision) return;
    collision.traverse((object: any) => {
      if (!(object instanceof THREE.Mesh)) return;
      this.collisionMeshes.push(object);
      // surfaceId === 2 通常为不可行走立面或特殊障碍
      if (object.userData.collision?.surfaceId !== 2) {
        this.floorMeshes.push(object);
      }
    });
    collision.updateMatrixWorld(true);
  }

  /**
   * 设置地图边界矩形 [centerX, centerZ, widthX, depthZ]
   */
  public setBounds(bounds: number[] | null) {
    this.bounds = bounds;
  }

  /**
   * 检查指定位置是否越出地图边界
   */
  public isOutOfBounds(x: number, z: number): boolean {
    if (!this.bounds || this.bounds.length < 4) return false;
    const [cx, cz, width, depth] = this.bounds;
    const halfW = width / 2;
    const halfD = depth / 2;
    return x < cx - halfW || x > cx + halfW || z < cz - halfD || z > cz + halfD;
  }

  /**
   * 获取指定 (x, z) 坐标下的地面高度 Y
   */
  public floorAt = (x: number, z: number, fromY = 80): number | undefined => {
    const targets = this.floorMeshes.length ? this.floorMeshes : this.mapVisible;
    if (!targets.length) return undefined;

    this.raycaster.set(new THREE.Vector3(x, fromY, z), this.down);
    this.raycaster.far = 120;
    const hits = this.raycaster.intersectObjects(targets, true);

    const floorHit = hits.find((hit: any) => {
      if (!hit.face) return false;
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      return normal.y > 0.35; // 地面法线向上倾角大于一定阈值视为可行走斜坡/平地
    });

    return floorHit ? floorHit.point.y : undefined;
  };

  /**
   * 检测从 from 到 to 的位移是否被静态障碍物或墙壁阻挡
   */
  public isBlocked = (from: any, to: any): boolean => {
    if (!this.collisionMeshes.length) return false;
    const motion = to.clone().sub(from);
    if (motion.lengthSq() < 0.0001) return false;

    const distance = motion.length();
    const rayOrigin = from.clone().add(new THREE.Vector3(0, 0.7, 0)); // 角色腰部高度发出射线
    this.raycaster.set(rayOrigin, motion.normalize());
    this.raycaster.far = Math.max(0.55, distance + 0.32);

    return this.raycaster.intersectObjects(this.collisionMeshes, true).some((hit: any) => hit.distance > 0.08);
  };

  /**
   * 射线投射射击弹道检测
   */
  public raycastBullet(origin: any, direction: any, maxDistance = 100): any | null {
    const targets = this.collisionMeshes.length ? this.collisionMeshes : this.mapVisible;
    if (!targets.length) return null;

    this.raycaster.set(origin, direction.clone().normalize());
    this.raycaster.far = maxDistance;
    const hits = this.raycaster.intersectObjects(targets, true);
    return hits.find((h: any) => h.distance > 0.08) || null;
  }

  /**
   * 导出为 PlayerEntity 兼容的 CollisionEnvironment 接口对象
   */
  public toEnvironment(): CollisionEnvironment {
    return {
      floorAt: this.floorAt,
      isBlocked: this.isBlocked,
      bounds: this.bounds
    };
  }

  public toCollisionEnvironment(): CollisionEnvironment {
    return this.toEnvironment();
  }

  /**
   * 重置当前碰撞环境（清空旧地图网格与边界，保留空气墙材质以便复用）
   */
  public reset() {
    this.replacedMaterials.forEach(m => m.dispose());
    this.replacedMaterials.clear();
    this.mapVisible = [];
    this.collisionMeshes = [];
    this.floorMeshes = [];
    this.bounds = null;
  }

  public dispose() {
    this.replacedMaterials.forEach(m => m.dispose());
    this.replacedMaterials.clear();
    if (this.airWallMaterial) {
      this.airWallMaterial.dispose();
    }
    this.mapVisible = [];
    this.collisionMeshes = [];
    this.floorMeshes = [];
  }
}
