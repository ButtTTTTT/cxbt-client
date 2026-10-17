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
  public deadAABBs: number[][] = [];

  private raycaster = new THREE.Raycaster();
  private down = new THREE.Vector3(0, -1, 0);
  private up = new THREE.Vector3(0, 1, 0);
  private airWallMaterial: any = null;
  private waterMaterial: any = null;
  private replacedMaterials = new Set<any>();

  constructor() {
    this.airWallMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
      side: THREE.DoubleSide,
    });
    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0369a1,
      emissiveIntensity: 0.28,
      transparent: true,
      opacity: 0.72,
      roughness: 0.16,
      metalness: 0.35,
      side: THREE.DoubleSide,
    });
  }

  /**
   * 注册渲染视觉网格并处理空气墙与水面着色器网格
   */
  public registerVisualScene(visual: any, airWallNames: string[] = [], waterMeshNames: string[] = []) {
    const airWallSet = new Set(airWallNames);
    const waterSet = new Set(waterMeshNames);
    visual.traverse((object: any) => {
      if (!(object instanceof THREE.Mesh)) return;
      const collMode = object.userData?.collisionMode ?? object.userData?.extras?.collisionMode;
      if (airWallSet.has(object.name) || collMode === 2) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((mat: any) => {
          if (mat) this.replacedMaterials.add(mat);
        });
        object.material = this.airWallMaterial;
        object.userData.airWall = true;
        if (collMode === 2 && !this.collisionMeshes.includes(object)) {
          this.collisionMeshes.push(object);
        }
        return;
      }
      if (waterSet.has(object.name)) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((mat: any) => {
          if (mat) this.replacedMaterials.add(mat);
        });
        object.material = this.waterMaterial;
        object.userData.water = true;
        object.frustumCulled = true;
        this.mapVisible.push(object);
        return;
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((mat: any) => {
        if (mat && mat.side !== THREE.DoubleSide) {
          mat.side = THREE.DoubleSide;
          mat.needsUpdate = true;
        }
      });
      object.frustumCulled = true;
      this.mapVisible.push(object);
    });
    visual.updateMatrixWorld(true);
  }

  /**
   * 注册附加子模型 (如旗杆、香炉、占点核心台、旋转门、吊车、熔岩跳台等)
   */
  public registerExtraMesh(
    visual: any,
    opts?: {
      position?: number[];
      rotation?: number[];
      collide?: boolean;
      collisionScene?: any;
    }
  ) {
    if (!visual) return;
    if (opts?.position && opts.position.length >= 3) {
      visual.position.set(opts.position[0], opts.position[1], opts.position[2]);
    }
    if (opts?.rotation && opts.rotation.length >= 4) {
      const q = new THREE.Quaternion(opts.rotation[0], opts.rotation[1], opts.rotation[2], opts.rotation[3]).normalize();
      visual.quaternion.copy(q);
    }
    visual.updateMatrixWorld(true);

    visual.traverse((object: any) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((mat: any) => {
        if (mat) {
          mat.side = THREE.DoubleSide;
          mat.needsUpdate = true;
        }
      });
      this.mapVisible.push(object);
      if (opts?.collide && !opts?.collisionScene) {
        if (!this.collisionMeshes.includes(object)) this.collisionMeshes.push(object);
        if (!this.floorMeshes.includes(object)) this.floorMeshes.push(object);
      }
    });

    if (opts?.collisionScene) {
      if (opts.position && opts.position.length >= 3) {
        opts.collisionScene.position.set(opts.position[0], opts.position[1], opts.position[2]);
      }
      if (opts.rotation && opts.rotation.length >= 4) {
        const q = new THREE.Quaternion(opts.rotation[0], opts.rotation[1], opts.rotation[2], opts.rotation[3]).normalize();
        opts.collisionScene.quaternion.copy(q);
      }
      this.registerCollisionScene(opts.collisionScene);
    }
  }

  /**
   * 注册物理碰撞体网格 (Collision GLTF)
   * 强制开启 DoubleSide，修复 PhysX 背面法线导致的单向穿墙/陷地问题
   */
  public registerCollisionScene(collision: any) {
    if (!collision) return;
    collision.updateMatrixWorld(true);
    collision.traverse((object: any) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((mat: any) => {
        if (mat) {
          mat.side = THREE.DoubleSide;
          mat.needsUpdate = true;
        }
      });
      if (!this.collisionMeshes.includes(object)) {
        this.collisionMeshes.push(object);
      }
      // surfaceId === 2 为空气墙立面，其余为可行走地形碰撞网格
      if (object.userData?.collision?.surfaceId !== 2 && !this.floorMeshes.includes(object)) {
        this.floorMeshes.push(object);
      }
    });
  }

  /**
   * 设置地图边界矩形 [centerX, centerZ, widthX, depthZ]
   */
  public setBounds(bounds: number[] | null) {
    this.bounds = bounds;
  }

  /**
   * 设置地图 3D 禁入盒 (AddDeadAABB)，防止玩家走入空心建筑或雕像底座内部
   */
  public setDeadAABBs(boxes?: number[][] | null) {
    this.deadAABBs = Array.isArray(boxes) ? boxes : [];
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
   * 检查 3D 坐标 (x, y, z) 是否位于某个建筑内部 DeadAABB 中，若是则返回该 AABB
   */
  private findContainingDeadAABB(x: number, y: number, z: number, radius = 0.36): number[] | null {
    for (let i = 0; i < this.deadAABBs.length; i++) {
      const b = this.deadAABBs[i];
      // 玩家身体高度区间 [y + 0.35, y + 1.55] 与 AABB 高度区间 [minY, maxY] 交集检测
      if (y + 1.55 < b[1] || y + 0.35 > b[4]) continue;
      if (x >= b[0] - radius && x <= b[3] + radius && z >= b[2] - radius && z <= b[5] + radius) {
        return b;
      }
    }
    return null;
  }

  /**
   * 获取指定 (x, z) 坐标下的地面高度 Y
   * 自动过滤高空天棚碰撞盒 (y > 28m) 及双面法线，防止将角色吸上屋顶或天棚
   */
  public floorAt = (x: number, z: number, fromY = 26, maxStepUp?: number): number | undefined => {
    const targets = this.floorMeshes.length ? this.floorMeshes : this.mapVisible;
    if (!targets.length) return undefined;

    // 限制过高起点（如 80/90）以避免命中 PhysX 顶层天棚封盖 (y = 50~98m)
    const effectiveFromY = fromY > 30 ? 26 : fromY;
    this.raycaster.set(new THREE.Vector3(x, effectiveFromY, z), this.down);
    this.raycaster.far = Math.max(60, effectiveFromY + 45);
    const hits = this.raycaster.intersectObjects(targets, true);

    const validFloorY: number[] = [];
    for (let i = 0; i < hits.length; i++) {
      const hit: any = hits[i];
      if (!hit.face) continue;
      if (hit.object?.userData?.isPlayer || hit.object?.userData?.isBoss || hit.object?.userData?.airWall) continue;
      if (hit.point.y > 28) continue;
      if (maxStepUp !== undefined && hit.point.y > effectiveFromY) continue;

      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (Math.abs(normal.y) > 0.46) {
        validFloorY.push(hit.point.y);
      }
    }

    if (!validFloorY.length) return undefined;

    // 若为初始出生/大范围查询 (fromY > 15 且未传 maxStepUp)，优先选择上方 2.1m 内无低矮顶棚遮挡的街道地面
    if (fromY > 15 && maxStepUp === undefined && validFloorY.length > 1) {
      for (let i = validFloorY.length - 1; i >= 0; i--) {
        const yCandidate = validFloorY[i];
        if (yCandidate < -8 || yCandidate > 9.5) continue;
        const hasLowCeiling = validFloorY.some(other => other > yCandidate + 0.35 && other < yCandidate + 2.2);
        if (!hasLowCeiling) return yCandidate;
      }
    }

    return validFloorY[0];
  };

  /**
   * 检测角色头顶上方是否存在低矮天花板或屋檐，防止跳跃穿模进入屋顶内部
   */
  public ceilingAt = (x: number, z: number, fromY: number, maxDist = 2.1): number | undefined => {
    const targets = this.collisionMeshes.length ? this.collisionMeshes : this.mapVisible;
    if (!targets.length) return undefined;

    const originY = fromY + 0.55;
    this.raycaster.set(new THREE.Vector3(x, originY, z), this.up);
    this.raycaster.far = maxDist;
    const hits = this.raycaster.intersectObjects(targets, true);
    for (let i = 0; i < hits.length; i++) {
      const hit: any = hits[i];
      if (!hit.face || hit.distance < 0.05) continue;
      if (hit.object?.userData?.isPlayer || hit.object?.userData?.isBoss) continue;
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (Math.abs(normal.y) > 0.35) {
        return hit.point.y;
      }
    }
    return undefined;
  };

  /**
   * 检测从 from 到 to 的位移是否被静态障碍物、墙壁或 DeadAABB 阻挡
   * 采用多层胶囊高度 (小腿/腰部/胸口) 与左右肩宽扇形射线检测
   */
  public isBlocked = (from: any, to: any): boolean => {
    if (this.isOutOfBounds(to.x, to.z)) return true;

    // 1. DeadAABB 建筑内部禁入盒检测 (若已在盒内，允许向盒外逃逸，严禁向盒内深入)
    const toBox = this.findContainingDeadAABB(to.x, from.y, to.z, 0.36);
    if (toBox) {
      const fromBox = this.findContainingDeadAABB(from.x, from.y, from.z, 0.36);
      if (!fromBox) return true;
      const cx = (toBox[0] + toBox[3]) * 0.5;
      const cz = (toBox[2] + toBox[5]) * 0.5;
      const distFrom = Math.hypot(from.x - cx, from.z - cz);
      const distTo = Math.hypot(to.x - cx, to.z - cz);
      if (distTo <= distFrom) return true;
    }

    if (!this.collisionMeshes.length) return false;

    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const horizDist = Math.hypot(dx, dz);
    if (horizDist < 0.0005) return false;

    const dir = new THREE.Vector3(dx / horizDist, 0, dz / horizDist);
    const leftDir = new THREE.Vector3(dir.x * 0.88 - dir.z * 0.47, 0, dir.z * 0.88 + dir.x * 0.47);
    const rightDir = new THREE.Vector3(dir.x * 0.88 + dir.z * 0.47, 0, dir.z * 0.88 - dir.x * 0.47);
    const checkDist = Math.max(0.46, horizDist + 0.36);

    const heights = [0.52, 0.98, 1.48];
    const dirs = [dir, leftDir, rightDir];

    for (let hIdx = 0; hIdx < heights.length; hIdx++) {
      const rayOrigin = new THREE.Vector3(from.x, from.y + heights[hIdx], from.z);
      for (let dIdx = 0; dIdx < dirs.length; dIdx++) {
        // 左右扇形仅在腰部检测，兼顾性能与防卡墙角
        if (dIdx > 0 && hIdx !== 1) continue;
        this.raycaster.set(rayOrigin, dirs[dIdx]);
        this.raycaster.far = dIdx === 0 ? checkDist : checkDist * 0.85;
        const hits = this.raycaster.intersectObjects(this.collisionMeshes, true);
        for (let i = 0; i < hits.length; i++) {
          const hit: any = hits[i];
          if (hit.distance <= 0.03) continue;
          if (hit.object?.userData?.isPlayer || hit.object?.userData?.isBoss) continue;
          if (hit.face) {
            const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
            // 排除平缓斜坡 (|normal.y| >= 0.68 属于可行走坡面，不作为竖直墙面阻挡)
            if (Math.abs(normal.y) >= 0.68 && hit.object?.userData?.collision?.surfaceId !== 2 && !hit.object?.userData?.airWall) {
              continue;
            }
          }
          return true;
        }
      }
    }

    return false;
  };

  /**
   * 带墙壁平滑滑动 (Wall-Sliding) 与防卡死脱困 (Depenetration) 的位移解算器
   */
  public resolveMovement = (
    from: any,
    to: any,
    isGrounded = true
  ): { x: number; z: number; floorY?: number; blocked: boolean } => {
    let startX = from.x;
    let startZ = from.z;
    const startY = from.y;

    // 0. 若当前位置意外嵌入了某个小范围建筑/雕像 DeadAABB，自动向外微推脱困
    const stuckBox = this.findContainingDeadAABB(startX, startY, startZ, 0.15);
    if (stuckBox && (stuckBox[3] - stuckBox[0] < 35) && (stuckBox[5] - stuckBox[2] < 35)) {
      const dLeft = Math.abs(startX - stuckBox[0]);
      const dRight = Math.abs(stuckBox[3] - startX);
      const dBack = Math.abs(startZ - stuckBox[2]);
      const dFront = Math.abs(stuckBox[5] - startZ);
      const minD = Math.min(dLeft, dRight, dBack, dFront);
      if (minD === dLeft) startX = stuckBox[0] - 0.42;
      else if (minD === dRight) startX = stuckBox[3] + 0.42;
      else if (minD === dBack) startZ = stuckBox[2] - 0.42;
      else startZ = stuckBox[5] + 0.42;
    }

    const maxStepUp = isGrounded ? 0.82 : 0.55;
    const probeTopOffset = isGrounded ? 1.05 : 0.55;

    const tryCandidate = (cx: number, cz: number): { ok: boolean; floorY?: number } => {
      const candVec = new THREE.Vector3(cx, startY, cz);
      const fromVec = new THREE.Vector3(startX, startY, startZ);
      if (this.isBlocked(fromVec, candVec)) return { ok: false };

      const f = this.floorAt(cx, cz, startY + probeTopOffset, maxStepUp);
      if (f !== undefined) {
        // 严禁一步跨上超过 maxStepUp 的高台或屋顶
        if (f - startY > maxStepUp) return { ok: false };
        // 地面行走时若前方是深坑 (> 3.2m 落差)，允许自然下落但更新 floorY
        if (isGrounded && startY - f > 1.35) {
          return { ok: true, floorY: undefined };
        }
      }
      return { ok: true, floorY: f };
    };

    // 1. 尝试完整目标位移 (to.x, to.z)
    const full = tryCandidate(to.x, to.z);
    if (full.ok) {
      return { x: to.x, z: to.z, floorY: full.floorY, blocked: false };
    }

    // 2. 尝试沿 X 轴滑动 (to.x, startZ) 与沿 Z 轴滑动 (startX, to.z)
    const dx = to.x - startX;
    const dz = to.z - startZ;
    const preferXFirst = Math.abs(dx) >= Math.abs(dz);

    const slideA = preferXFirst
      ? { x: to.x, z: startZ, res: tryCandidate(to.x, startZ) }
      : { x: startX, z: to.z, res: tryCandidate(startX, to.z) };
    if (slideA.res.ok && Math.hypot(slideA.x - startX, slideA.z - startZ) > 0.001) {
      return { x: slideA.x, z: slideA.z, floorY: slideA.res.floorY, blocked: false };
    }

    const slideB = preferXFirst
      ? { x: startX, z: to.z, res: tryCandidate(startX, to.z) }
      : { x: to.x, z: startZ, res: tryCandidate(to.x, startZ) };
    if (slideB.res.ok && Math.hypot(slideB.x - startX, slideB.z - startZ) > 0.001) {
      return { x: slideB.x, z: slideB.z, floorY: slideB.res.floorY, blocked: false };
    }

    // 3. 尝试 ±45° 切向小步滑动 (应对斜向走廊与圆柱)
    const stepLen = Math.hypot(dx, dz) * 0.65;
    if (stepLen > 0.002) {
      const baseAngle = Math.atan2(dz, dx);
      for (const offsetAng of [Math.PI / 4, -Math.PI / 4, Math.PI / 2.5, -Math.PI / 2.5]) {
        const tx = startX + Math.cos(baseAngle + offsetAng) * stepLen;
        const tz = startZ + Math.sin(baseAngle + offsetAng) * stepLen;
        const diag = tryCandidate(tx, tz);
        if (diag.ok) {
          return { x: tx, z: tz, floorY: diag.floorY, blocked: false };
        }
      }
    }

    return { x: startX, z: startZ, floorY: undefined, blocked: true };
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
    return hits.find((h: any) => h.distance > 0.08 && !h.object?.userData?.airWall) || null;
  }

  /**
   * 导出为 PlayerEntity 兼容的 CollisionEnvironment 接口对象
   */
  public toEnvironment(): CollisionEnvironment {
    return {
      floorAt: this.floorAt,
      ceilingAt: this.ceilingAt,
      isBlocked: this.isBlocked,
      resolveMovement: this.resolveMovement,
      bounds: this.bounds,
    };
  }

  public toCollisionEnvironment(): CollisionEnvironment {
    return this.toEnvironment();
  }

  /**
   * 重置当前碰撞环境（清空旧地图网格与边界，保留空气墙与水面材质以便复用）
   */
  public reset() {
    this.replacedMaterials.forEach(m => m?.dispose?.());
    this.replacedMaterials.clear();
    this.mapVisible = [];
    this.collisionMeshes = [];
    this.floorMeshes = [];
    this.bounds = null;
    this.deadAABBs = [];
  }

  public dispose() {
    this.replacedMaterials.forEach(m => m?.dispose?.());
    this.replacedMaterials.clear();
    if (this.airWallMaterial) {
      this.airWallMaterial.dispose();
    }
    if (this.waterMaterial) {
      this.waterMaterial.dispose();
    }
    this.mapVisible = [];
    this.collisionMeshes = [];
    this.floorMeshes = [];
    this.deadAABBs = [];
  }
}
