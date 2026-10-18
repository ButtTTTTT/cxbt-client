import * as THREE from 'three';
import type { CollisionEnvironment } from './types';

interface IndexedTri {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  cx: number; cy: number; cz: number;
  nx: number; ny: number; nz: number;
  hnx: number; hnz: number;
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
  isAirWall: boolean;
  isFloor: boolean;
  isWall: boolean;
  visualOnly: boolean;
}

const CELL_SIZE = 3.0;
const INV_CELL_SIZE = 1.0 / CELL_SIZE;
const PLAYER_RADIUS = 0.34;
const DEAD_AABB_SKIN = 0.18;

function makeCellKey(gx: number, gz: number): number {
  return ((gx + 32768) << 16) | ((gz + 32768) & 0xffff);
}

/**
 * 地图物理碰撞与地面查询引擎模块 (内置 2D XZ 空间三角网格哈希索引 + 圆柱/胶囊体解析推离)
 * 彻底消除全图 Raycaster 遍历导致的碰墙掉帧，并根治靠近建筑被吸住或卡进建模无法脱离的问题
 */
export class MapCollider {
  public mapVisible: any[] = [];
  public collisionMeshes: any[] = [];
  public floorMeshes: any[] = [];
  public bounds: number[] | null = null;
  public deadAABBs: number[][] = [];

  private raycaster = new THREE.Raycaster();
  private airWallMaterial: any = null;
  private waterMaterial: any = null;
  private replacedMaterials = new Set<any>();

  // 空间网格三角面索引池
  private allTris: IndexedTri[] = [];
  private floorGrid = new Map<number, number[]>();
  private wallGrid = new Map<number, number[]>();
  private hasDedicatedCollision = false;
  private visitedStamp = new Int32Array(65536);
  private currentStamp = 1;
  private localTriBuffer: IndexedTri[] = [];

  // 复用临时变量，零 GC 分配
  private tmpVa = new THREE.Vector3();
  private tmpVb = new THREE.Vector3();
  private tmpVc = new THREE.Vector3();
  private tmpAb = new THREE.Vector3();
  private tmpAc = new THREE.Vector3();
  private tmpNormal = new THREE.Vector3();
  private tmpDir = new THREE.Vector3();
  private tmpClosest = { x: 0, y: 0, z: 0 };

  constructor() {
    (this.collisionMeshes as any)._collider = this;
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

  private cacheMeshWorldBox(mesh: any) {
    if (!mesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }
    if (mesh.geometry.boundingBox) {
      mesh.userData = mesh.userData || {};
      mesh.userData._worldBox = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    }
  }

  private ensureStampCapacity(minSize: number) {
    if (this.visitedStamp.length < minSize) {
      let nextLen = this.visitedStamp.length || 65536;
      while (nextLen < minSize) nextLen *= 2;
      this.visitedStamp = new Int32Array(nextLen);
      this.currentStamp = 1;
    }
  }

  private nextStamp(): number {
    this.currentStamp = (this.currentStamp + 1) | 0;
    if (this.currentStamp <= 0) {
      this.visitedStamp.fill(0);
      this.currentStamp = 1;
    }
    return this.currentStamp;
  }

  /**
   * 将网格的所有世界空间三角形提取并注册进 3m x 3m 2D 空间哈希网格
   */
  private indexMeshTriangles(mesh: any, mode: 'collision' | 'airwall' | 'visual') {
    const geom = mesh?.geometry;
    const posAttr = geom?.attributes?.position;
    if (!posAttr || posAttr.count < 3) return;

    mesh.updateWorldMatrix(true, false);
    const mat = mesh.matrixWorld;
    const indexAttr = geom.index;
    const triCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);
    const isSurfaceAirWall =
      mode === 'airwall' ||
      mesh.userData?.collision?.surfaceId === 2 ||
      Boolean(mesh.userData?.airWall);

    const va = this.tmpVa;
    const vb = this.tmpVb;
    const vc = this.tmpVc;
    const ab = this.tmpAb;
    const ac = this.tmpAc;
    const norm = this.tmpNormal;

    for (let t = 0; t < triCount; t++) {
      const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
      const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;

      va.fromBufferAttribute(posAttr, i0).applyMatrix4(mat);
      vb.fromBufferAttribute(posAttr, i1).applyMatrix4(mat);
      vc.fromBufferAttribute(posAttr, i2).applyMatrix4(mat);

      ab.subVectors(vb, va);
      ac.subVectors(vc, va);
      norm.crossVectors(ab, ac);
      const areaSq = norm.lengthSq();
      if (areaSq < 1e-8) continue;
      norm.multiplyScalar(1 / Math.sqrt(areaSq));

      const absNy = Math.abs(norm.y);
      const isFloor = !isSurfaceAirWall && absNy > 0.46;
      const isWall = isSurfaceAirWall || absNy < 0.72;
      if (!isFloor && !isWall) continue;

      const hLen = Math.hypot(norm.x, norm.z);
      const hnx = hLen > 0.001 ? norm.x / hLen : 1;
      const hnz = hLen > 0.001 ? norm.z / hLen : 0;

      const minX = Math.min(va.x, vb.x, vc.x);
      const maxX = Math.max(va.x, vb.x, vc.x);
      const minY = Math.min(va.y, vb.y, vc.y);
      const maxY = Math.max(va.y, vb.y, vc.y);
      const minZ = Math.min(va.z, vb.z, vc.z);
      const maxZ = Math.max(va.z, vb.z, vc.z);

      const tri: IndexedTri = {
        ax: va.x, ay: va.y, az: va.z,
        bx: vb.x, by: vb.y, bz: vb.z,
        cx: vc.x, cy: vc.y, cz: vc.z,
        nx: norm.x, ny: norm.y, nz: norm.z,
        hnx, hnz,
        minX, maxX, minY, maxY, minZ, maxZ,
        isAirWall: isSurfaceAirWall,
        isFloor,
        isWall,
        visualOnly: mode === 'visual',
      };

      const triIdx = this.allTris.length;
      this.allTris.push(tri);

      const gx0 = Math.floor(minX * INV_CELL_SIZE);
      const gx1 = Math.floor(maxX * INV_CELL_SIZE);
      const gz0 = Math.floor(minZ * INV_CELL_SIZE);
      const gz1 = Math.floor(maxZ * INV_CELL_SIZE);

      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
          const key = makeCellKey(gx, gz);
          if (isFloor) {
            let fb = this.floorGrid.get(key);
            if (!fb) {
              fb = [];
              this.floorGrid.set(key, fb);
            }
            fb.push(triIdx);
          }
          if (isWall) {
            let wb = this.wallGrid.get(key);
            if (!wb) {
              wb = [];
              this.wallGrid.set(key, wb);
            }
            wb.push(triIdx);
          }
        }
      }
    }

    this.ensureStampCapacity(this.allTris.length + 64);
  }

  /**
   * 计算 3D 点 (px, py, pz) 到三角形 t 的最近点，写入 out
   */
  private closestPointOnTri(
    px: number,
    py: number,
    pz: number,
    t: IndexedTri,
    out: { x: number; y: number; z: number }
  ) {
    const abx = t.bx - t.ax, aby = t.by - t.ay, abz = t.bz - t.az;
    const acx = t.cx - t.ax, acy = t.cy - t.ay, acz = t.cz - t.az;
    const apx = px - t.ax, apy = py - t.ay, apz = pz - t.az;

    const d1 = abx * apx + aby * apy + abz * apz;
    const d2 = acx * apx + acy * apy + acz * apz;
    if (d1 <= 0 && d2 <= 0) {
      out.x = t.ax; out.y = t.ay; out.z = t.az;
      return;
    }

    const bpx = px - t.bx, bpy = py - t.by, bpz = pz - t.bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) {
      out.x = t.bx; out.y = t.by; out.z = t.bz;
      return;
    }

    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3);
      out.x = t.ax + v * abx;
      out.y = t.ay + v * aby;
      out.z = t.az + v * abz;
      return;
    }

    const cpx = px - t.cx, cpy = py - t.cy, cpz = pz - t.cz;
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) {
      out.x = t.cx; out.y = t.cy; out.z = t.cz;
      return;
    }

    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6);
      out.x = t.ax + w * acx;
      out.y = t.ay + w * acy;
      out.z = t.az + w * acz;
      return;
    }

    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
      const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
      out.x = t.bx + w * (t.cx - t.bx);
      out.y = t.by + w * (t.cy - t.by);
      out.z = t.bz + w * (t.cz - t.bz);
      return;
    }

    const denom = 1.0 / (va + vb + vc);
    const v = vb * denom;
    const w = vc * denom;
    out.x = t.ax + abx * v + acx * w;
    out.y = t.ay + aby * v + acy * w;
    out.z = t.az + abz * v + acz * w;
  }

  /**
   * 收集指定 AABB 范围内的墙体三角形列表
   */
  private gatherWallTris(
    minX: number, maxX: number,
    minY: number, maxY: number,
    minZ: number, maxZ: number
  ): IndexedTri[] {
    const out = this.localTriBuffer;
    out.length = 0;
    const stamp = this.nextStamp();
    const gx0 = Math.floor(minX * INV_CELL_SIZE);
    const gx1 = Math.floor(maxX * INV_CELL_SIZE);
    const gz0 = Math.floor(minZ * INV_CELL_SIZE);
    const gz1 = Math.floor(maxZ * INV_CELL_SIZE);

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const bucket = this.wallGrid.get(makeCellKey(gx, gz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const idx = bucket[i];
          if (this.visitedStamp[idx] === stamp) continue;
          this.visitedStamp[idx] = stamp;
          const t = this.allTris[idx];
          if (this.hasDedicatedCollision && t.visualOnly) continue;
          if (
            t.maxY < minY || t.minY > maxY ||
            t.maxX < minX || t.minX > maxX ||
            t.maxZ < minZ || t.minZ > maxZ
          ) {
            continue;
          }
          out.push(t);
        }
      }
    }
    return out;
  }

  /**
   * 注册渲染视觉网格并处理空气墙与水面着色器网格
   */
  public registerVisualScene(visual: any, airWallNames: string[] = [], waterMeshNames: string[] = []) {
    const airWallSet = new Set(airWallNames);
    const waterSet = new Set(waterMeshNames);
    visual.updateMatrixWorld(true);
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
        this.cacheMeshWorldBox(object);
        if (collMode === 2 && !this.collisionMeshes.includes(object)) {
          this.collisionMeshes.push(object);
          this.indexMeshTriangles(object, 'airwall');
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
        this.cacheMeshWorldBox(object);
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
      this.cacheMeshWorldBox(object);
      this.mapVisible.push(object);
      this.indexMeshTriangles(object, 'visual');
    });
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
      this.cacheMeshWorldBox(object);
      this.mapVisible.push(object);
      if (opts?.collide && !opts?.collisionScene) {
        if (!this.collisionMeshes.includes(object)) this.collisionMeshes.push(object);
        if (!this.floorMeshes.includes(object)) this.floorMeshes.push(object);
        this.indexMeshTriangles(object, 'collision');
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
   */
  public registerCollisionScene(collision: any) {
    if (!collision) return;
    this.hasDedicatedCollision = true;
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
      this.cacheMeshWorldBox(object);
      if (!this.collisionMeshes.includes(object)) {
        this.collisionMeshes.push(object);
      }
      const isAirWall = object.userData?.collision?.surfaceId === 2;
      if (!isAirWall && !this.floorMeshes.includes(object)) {
        this.floorMeshes.push(object);
      }
      this.indexMeshTriangles(object, isAirWall ? 'airwall' : 'collision');
    });
  }

  public setBounds(bounds: number[] | null) {
    this.bounds = bounds;
  }

  public setDeadAABBs(boxes?: number[][] | null) {
    this.deadAABBs = Array.isArray(boxes) ? boxes : [];
  }

  public isOutOfBounds(x: number, z: number): boolean {
    if (!this.bounds || this.bounds.length < 4) return false;
    const [cx, cz, width, depth] = this.bounds;
    const halfW = width / 2;
    const halfD = depth / 2;
    return x < cx - halfW || x > cx + halfW || z < cz - halfD || z > cz + halfD;
  }

  private isPointInsideAnyDeadAABB(x: number, y: number, z: number, margin = 0.02): boolean {
    for (let i = 0; i < this.deadAABBs.length; i++) {
      const b = this.deadAABBs[i];
      if (b[3] - b[0] > 220 && b[5] - b[2] > 220) continue;
      if (y + 1.52 < b[1] || y + 0.48 > b[4]) continue;
      if (x > b[0] - margin && x < b[3] + margin && z > b[2] - margin && z < b[5] + margin) {
        return true;
      }
    }
    return false;
  }

  /**
   * 精确的 2D 圆与 DeadAABB 连续推离：
   * - 当圆心在 AABB 外部时，严格沿最近点径向推出，绝不错误跳转到相邻轴导致把玩家“吸进”建筑拐角
   * - 当圆心已落入 AABB 内部时，优先选择不处于任何相邻 DeadAABB 内部的最近安全出口推出
   */
  private resolveDeadAABBs(x: number, y: number, z: number): { x: number; z: number } {
    let curX = x;
    let curZ = z;
    if (!this.deadAABBs.length) return { x: curX, z: curZ };

    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let i = 0; i < this.deadAABBs.length; i++) {
        const b = this.deadAABBs[i];
        const minX = b[0], minY = b[1], minZ = b[2], maxX = b[3], maxY = b[4], maxZ = b[5];
        if (maxX - minX > 220 && maxZ - minZ > 220) continue;
        if (y + 1.52 < minY || y + 0.48 > maxY) continue;
        if (
          curX < minX - DEAD_AABB_SKIN ||
          curX > maxX + DEAD_AABB_SKIN ||
          curZ < minZ - DEAD_AABB_SKIN ||
          curZ > maxZ + DEAD_AABB_SKIN
        ) {
          continue;
        }

        const clampedX = Math.max(minX, Math.min(maxX, curX));
        const clampedZ = Math.max(minZ, Math.min(maxZ, curZ));
        const dx = curX - clampedX;
        const dz = curZ - clampedZ;
        const distSq = dx * dx + dz * dz;

        if (distSq > 1e-6) {
          // 圆心在 AABB 外部，仅轻推圆弧皮肤重叠量
          if (distSq < DEAD_AABB_SKIN * DEAD_AABB_SKIN) {
            const dist = Math.sqrt(distSq);
            const push = DEAD_AABB_SKIN - dist;
            const nx = curX + (dx / dist) * push;
            const nz = curZ + (dz / dist) * push;
            if (!this.isOutOfBounds(nx, nz)) {
              curX = nx;
              curZ = nz;
              moved = true;
            }
          }
        } else {
          // 圆心严格落入 AABB 内部，寻找不落入其他 DeadAABB 的最近安全表面
          const exitMargin = DEAD_AABB_SKIN + 0.04;
          const candidates = [
            { x: minX - exitMargin, z: curZ, d: curX - minX },
            { x: maxX + exitMargin, z: curZ, d: maxX - curX },
            { x: curX, z: minZ - exitMargin, d: curZ - minZ },
            { x: curX, z: maxZ + exitMargin, d: maxZ - curZ },
            { x: minX - exitMargin, z: minZ - exitMargin, d: Math.hypot(curX - minX, curZ - minZ) },
            { x: maxX + exitMargin, z: minZ - exitMargin, d: Math.hypot(maxX - curX, curZ - minZ) },
            { x: minX - exitMargin, z: maxZ + exitMargin, d: Math.hypot(curX - minX, maxZ - curZ) },
            { x: maxX + exitMargin, z: maxZ + exitMargin, d: Math.hypot(maxX - curX, maxZ - curZ) },
          ];
          candidates.sort((a, bCand) => a.d - bCand.d);
          let chosen = candidates[0];
          for (let c = 0; c < candidates.length; c++) {
            const cand = candidates[c];
            if (!this.isOutOfBounds(cand.x, cand.z) && !this.isPointInsideAnyDeadAABB(cand.x, y, cand.z, 0.01)) {
              chosen = cand;
              break;
            }
          }
          if (!this.isOutOfBounds(chosen.x, chosen.z)) {
            curX = chosen.x;
            curZ = chosen.z;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }

    return { x: curX, z: curZ };
  }

  /**
   * 计算角色躯干柱体在 (x, z) 处到单个墙面三角形的最近水平点及距离
   */
  private closestWallContact(
    x: number,
    z: number,
    minBodyY: number,
    maxBodyY: number,
    t: IndexedTri,
    outPt: { x: number; z: number }
  ): number {
    const oMinY = Math.max(minBodyY, t.minY);
    const oMaxY = Math.min(maxBodyY, t.maxY);
    if (oMinY > oMaxY) return Infinity;

    const midY = 0.5 * (oMinY + oMaxY);
    let bestDistSq = Infinity;

    const span = oMaxY - oMinY;
    const count = span > 0.36 ? 3 : 1;
    for (let s = 0; s < count; s++) {
      const ty = s === 0 ? midY : s === 1 ? oMinY + 0.05 : oMaxY - 0.05;
      this.closestPointOnTri(x, ty, z, t, this.tmpClosest);
      if (Math.abs(this.tmpClosest.y - ty) > 0.22) continue;
      const dx = x - this.tmpClosest.x;
      const dz = z - this.tmpClosest.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        outPt.x = this.tmpClosest.x;
        outPt.z = this.tmpClosest.z;
      }
    }

    return bestDistSq < Infinity ? Math.sqrt(bestDistSq) : Infinity;
  }

  /**
   * 径向防卡墙脱困：基于空间网格最近点推离，零 Raycaster 开销
   */
  public depenetratePosition = (x: number, y: number, z: number): { x: number; z: number } => {
    const aabbRes = this.resolveDeadAABBs(x, y, z);
    let curX = aabbRes.x;
    let curZ = aabbRes.z;

    const minBodyY = y + 0.58;
    const maxBodyY = y + 1.52;
    const tris = this.gatherWallTris(
      curX - PLAYER_RADIUS - 0.15,
      curX + PLAYER_RADIUS + 0.15,
      minBodyY,
      maxBodyY,
      curZ - PLAYER_RADIUS - 0.15,
      curZ + PLAYER_RADIUS + 0.15
    );
    if (!tris.length) return { x: curX, z: curZ };

    const contactPt = { x: 0, z: 0 };
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < tris.length; i++) {
        const t = tris[i];
        const dist = this.closestWallContact(curX, curZ, minBodyY, maxBodyY, t, contactPt);
        if (dist < PLAYER_RADIUS && dist > 1e-4) {
          const push = Math.min(0.08, PLAYER_RADIUS - dist);
          const nx = (curX - contactPt.x) / dist;
          const nz = (curZ - contactPt.z) / dist;
          if (!this.isOutOfBounds(curX + nx * push, curZ + nz * push)) {
            curX += nx * push;
            curZ += nz * push;
          }
        }
      }
    }

    return { x: curX, z: curZ };
  };

  /**
   * 获取指定 (x, z) 坐标下的地面高度 Y (使用 3m x 3m 空间网格重心坐标插值，耗时 < 0.002ms)
   */
  public floorAt = (x: number, z: number, fromY = 26, maxStepUp?: number): number | undefined => {
    if (!this.allTris.length) return undefined;

    const effectiveFromY = fromY > 30 ? 26 : fromY;
    const minSearchY = effectiveFromY - Math.max(60, effectiveFromY + 45);

    const samplePoint = (sx: number, sz: number): number[] => {
      const gx = Math.floor(sx * INV_CELL_SIZE);
      const gz = Math.floor(sz * INV_CELL_SIZE);
      const bucket = this.floorGrid.get(makeCellKey(gx, gz));
      if (!bucket || !bucket.length) return [];

      const hits: number[] = [];
      for (let i = 0; i < bucket.length; i++) {
        const t = this.allTris[bucket[i]];
        if (this.hasDedicatedCollision && t.visualOnly) continue;
        if (
          sx < t.minX - 0.002 || sx > t.maxX + 0.002 ||
          sz < t.minZ - 0.002 || sz > t.maxZ + 0.002 ||
          t.minY > effectiveFromY || t.maxY < minSearchY
        ) {
          continue;
        }

        // 2D XZ 重心坐标求垂直向下射线与三角形交点 Y
        const v0x = t.cx - t.ax;
        const v0z = t.cz - t.az;
        const v1x = t.bx - t.ax;
        const v1z = t.bz - t.az;
        const v2x = sx - t.ax;
        const v2z = sz - t.az;

        const denom = v0x * v1z - v1x * v0z;
        if (Math.abs(denom) < 1e-8) continue;
        const invDenom = 1.0 / denom;
        const u = (v2x * v1z - v1x * v2z) * invDenom;
        if (u < -0.002 || u > 1.002) continue;
        const v = (v0x * v2z - v2x * v0z) * invDenom;
        if (v < -0.002 || u + v > 1.004) continue;

        const hitY = t.ay + u * (t.cy - t.ay) + v * (t.by - t.ay);
        if (hitY > 28 || hitY > effectiveFromY || hitY < minSearchY) continue;
        hits.push(hitY);
      }

      if (hits.length > 1) {
        hits.sort((a, b) => b - a);
      }
      return hits;
    };

    let validFloorY = samplePoint(x, z);
    if (!validFloorY.length) {
      const offsets: [number, number][] = [[0.16, 0], [-0.16, 0], [0, 0.16], [0, -0.16]];
      for (let i = 0; i < offsets.length; i++) {
        validFloorY = samplePoint(x + offsets[i][0], z + offsets[i][1]);
        if (validFloorY.length) break;
      }
    }

    if (!validFloorY.length) return undefined;

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
   * 检测角色头顶上方是否存在低矮天花板或屋檐
   */
  public ceilingAt = (x: number, z: number, fromY: number, maxDist = 2.1): number | undefined => {
    if (!this.allTris.length) return undefined;
    const originY = fromY + 0.55;
    const maxY = originY + maxDist;
    const gx = Math.floor(x * INV_CELL_SIZE);
    const gz = Math.floor(z * INV_CELL_SIZE);
    const bucket = this.floorGrid.get(makeCellKey(gx, gz));
    if (!bucket || !bucket.length) return undefined;

    let lowestCeiling = Infinity;
    for (let i = 0; i < bucket.length; i++) {
      const t = this.allTris[bucket[i]];
      if (this.hasDedicatedCollision && t.visualOnly) continue;
      if (t.isAirWall) continue;
      if (
        x < t.minX || x > t.maxX ||
        z < t.minZ || z > t.maxZ ||
        t.maxY < originY + 0.05 || t.minY > maxY
      ) {
        continue;
      }

      const v0x = t.cx - t.ax, v0z = t.cz - t.az;
      const v1x = t.bx - t.ax, v1z = t.bz - t.az;
      const v2x = x - t.ax, v2z = z - t.az;
      const denom = v0x * v1z - v1x * v0z;
      if (Math.abs(denom) < 1e-8) continue;
      const invDenom = 1.0 / denom;
      const u = (v2x * v1z - v1x * v2z) * invDenom;
      if (u < -0.002 || u > 1.002) continue;
      const v = (v0x * v2z - v2x * v0z) * invDenom;
      if (v < -0.002 || u + v > 1.004) continue;

      const hitY = t.ay + u * (t.cy - t.ay) + v * (t.by - t.ay);
      if (hitY >= originY + 0.05 && hitY <= maxY && hitY < lowestCeiling) {
        lowestCeiling = hitY;
      }
    }

    return lowestCeiling < Infinity ? lowestCeiling : undefined;
  };

  /**
   * 检测从 from 到 to 是否被阻挡 (使用空间哈希网格，零 Raycaster 开销)
   */
  public isBlocked = (from: any, to: any): boolean => {
    if (this.isOutOfBounds(to.x, to.z)) return true;
    if (this.isPointInsideAnyDeadAABB(to.x, from.y, to.z, DEAD_AABB_SKIN)) {
      if (!this.isPointInsideAnyDeadAABB(from.x, from.y, from.z, DEAD_AABB_SKIN)) {
        return true;
      }
    }

    const minBodyY = from.y + 0.58;
    const maxBodyY = from.y + 1.52;
    const tris = this.gatherWallTris(
      Math.min(from.x, to.x) - PLAYER_RADIUS,
      Math.max(from.x, to.x) + PLAYER_RADIUS,
      minBodyY,
      maxBodyY,
      Math.min(from.z, to.z) - PLAYER_RADIUS,
      Math.max(from.z, to.z) + PLAYER_RADIUS
    );
    if (!tris.length) return false;

    const contactPt = { x: 0, z: 0 };
    for (let i = 0; i < tris.length; i++) {
      const distTo = this.closestWallContact(to.x, to.z, minBodyY, maxBodyY, tris[i], contactPt);
      if (distTo < PLAYER_RADIUS - 0.02) {
        const distFrom = this.closestWallContact(from.x, from.z, minBodyY, maxBodyY, tris[i], contactPt);
        if (distTo < distFrom - 0.001) return true;
      }
    }
    return false;
  };

  /**
   * 基于 2D XZ 空间三角网格的圆柱/胶囊连续推离与平滑贴墙滑动解算器：
   * 1. 零 THREE.Raycaster 调用，碰到任何复杂建筑也不掉帧 (< 0.01ms)
   * 2. 单一自适应半径解析推离，靠近建筑绝不把玩家吸进墙内，卡进狭窄夹缝也可直接走出
   */
  public resolveMovement = (
    from: any,
    to: any,
    isGrounded = true
  ): { x: number; z: number; floorY?: number; blocked: boolean } => {
    const startY = from.y;
    const aabbStart = this.resolveDeadAABBs(from.x, startY, from.z);
    let curX = aabbStart.x;
    let curZ = aabbStart.z;

    const totalDx = to.x - curX;
    const totalDz = to.z - curZ;
    const totalDist = Math.hypot(totalDx, totalDz);

    if (totalDist < 0.0004) {
      return { x: curX, z: curZ, floorY: isGrounded ? startY : undefined, blocked: false };
    }

    const minBodyY = startY + (isGrounded ? 0.62 : 0.45);
    const maxBodyY = startY + 1.52;
    const maxStepUp = isGrounded ? 0.82 : 0.55;
    const probeTopOffset = isGrounded ? 1.05 : 0.55;

    // 收集本次位移包围盒周边的局部墙体三角形 (通常仅 5~20 个三角面)
    const pad = PLAYER_RADIUS + 0.25;
    const tris = this.gatherWallTris(
      Math.min(curX, to.x) - pad,
      Math.max(curX, to.x) + pad,
      minBodyY,
      maxBodyY,
      Math.min(curZ, to.z) - pad,
      Math.max(curZ, to.z) + pad
    );

    // 测量起点处的最小墙体净空：若玩家已在狭窄建模缝隙内 (< PLAYER_RADIUS)，自动降低有效半径允许随时走出，绝不锁死
    const contactPt = { x: 0, z: 0 };
    let startClearance = PLAYER_RADIUS;
    let closestStartDist = Infinity;
    let closestPushX = 0;
    let closestPushZ = 0;

    for (let i = 0; i < tris.length; i++) {
      const d = this.closestWallContact(curX, curZ, minBodyY, maxBodyY, tris[i], contactPt);
      if (d < startClearance) {
        startClearance = d;
      }
      if (d < closestStartDist && d > 1e-4) {
        closestStartDist = d;
        closestPushX = (curX - contactPt.x) / d;
        closestPushZ = (curZ - contactPt.z) / d;
      }
    }

    // 若玩家意外贴墙过近 (< PLAYER_RADIUS)，先沿最近表面法线轻推最多 0.025m，并将本步阻挡半径自适应设为当前净空
    if (startClearance < PLAYER_RADIUS - 0.01 && closestStartDist < PLAYER_RADIUS) {
      const gentleNudge = Math.min(0.025, PLAYER_RADIUS - closestStartDist);
      const nx = curX + closestPushX * gentleNudge;
      const nz = curZ + closestPushZ * gentleNudge;
      if (!this.isOutOfBounds(nx, nz)) {
        curX = nx;
        curZ = nz;
      }
    }
    const effectiveRadius = Math.max(0.10, Math.min(PLAYER_RADIUS, startClearance + 0.01));

    const steps = Math.max(1, Math.min(3, Math.ceil(totalDist / 0.16)));
    const stepDx = (to.x - curX) / steps;
    const stepDz = (to.z - curZ) / steps;
    let lastFloorY: number | undefined = undefined;
    let anyBlocked = false;

    for (let s = 0; s < steps; s++) {
      const prevX = curX;
      const prevZ = curZ;
      let nextX = curX + stepDx;
      let nextZ = curZ + stepDz;

      if (this.isOutOfBounds(nextX, nextZ)) {
        if (!this.isOutOfBounds(nextX, prevZ)) {
          nextZ = prevZ;
        } else if (!this.isOutOfBounds(prevX, nextZ)) {
          nextX = prevX;
        } else {
          anyBlocked = true;
          break;
        }
      }

      // 1. DeadAABB 圆盒平滑推离
      const aabbStep = this.resolveDeadAABBs(nextX, startY, nextZ);
      nextX = aabbStep.x;
      nextZ = aabbStep.z;

      // 2. 3次迭代的圆柱-三角形最近点法向推离 (天然实现任意角度墙壁与内拐角平滑滑动)
      if (tris.length > 0) {
        for (let iter = 0; iter < 3; iter++) {
          for (let i = 0; i < tris.length; i++) {
            const t = tris[i];
            if (
              nextX + effectiveRadius < t.minX ||
              nextX - effectiveRadius > t.maxX ||
              nextZ + effectiveRadius < t.minZ ||
              nextZ - effectiveRadius > t.maxZ
            ) {
              continue;
            }

            const dist = this.closestWallContact(nextX, nextZ, minBodyY, maxBodyY, t, contactPt);
            if (dist >= effectiveRadius) continue;

            anyBlocked = true;
            const prevDx = prevX - contactPt.x;
            const prevDz = prevZ - contactPt.z;
            const curDx = nextX - contactPt.x;
            const curDz = nextZ - contactPt.z;

            if (dist > 1e-4) {
              // 防止单步穿越零厚度薄墙/空气墙：若与上一位置反向，强制推回上一位置所在侧
              if (curDx * prevDx + curDz * prevDz < -1e-4) {
                const prevLen = Math.hypot(prevDx, prevDz);
                if (prevLen > 1e-4) {
                  nextX = contactPt.x + (prevDx / prevLen) * effectiveRadius;
                  nextZ = contactPt.z + (prevDz / prevLen) * effectiveRadius;
                  continue;
                }
              }
              const push = effectiveRadius - dist;
              nextX += (curDx / dist) * push;
              nextZ += (curDz / dist) * push;
            } else {
              const prevLen = Math.hypot(prevDx, prevDz);
              if (prevLen > 1e-4) {
                nextX = contactPt.x + (prevDx / prevLen) * effectiveRadius;
                nextZ = contactPt.z + (prevDz / prevLen) * effectiveRadius;
              } else {
                nextX += t.hnx * effectiveRadius;
                nextZ += t.hnz * effectiveRadius;
              }
            }
          }
        }
      }

      // 3. 地面台阶高度校验
      const f = this.floorAt(nextX, nextZ, startY + probeTopOffset, maxStepUp);
      if (f !== undefined && f - startY > maxStepUp) {
        anyBlocked = true;
        // 尝试仅沿 X 或仅沿 Z 滑动以绕过过高台阶
        const fx = this.floorAt(nextX, prevZ, startY + probeTopOffset, maxStepUp);
        if (fx === undefined || fx - startY <= maxStepUp) {
          curX = nextX;
          curZ = prevZ;
          if (fx !== undefined && (!isGrounded || startY - fx <= 1.35)) lastFloorY = fx;
          continue;
        }
        const fz = this.floorAt(prevX, nextZ, startY + probeTopOffset, maxStepUp);
        if (fz === undefined || fz - startY <= maxStepUp) {
          curX = prevX;
          curZ = nextZ;
          if (fz !== undefined && (!isGrounded || startY - fz <= 1.35)) lastFloorY = fz;
          continue;
        }
        break;
      }

      curX = nextX;
      curZ = nextZ;
      if (f !== undefined) {
        if (!isGrounded || startY - f <= 1.35) {
          lastFloorY = f;
        }
      }
    }

    return { x: curX, z: curZ, floorY: lastFloorY, blocked: anyBlocked };
  };

  /**
   * 摄像机防穿墙短距射线检测 (仅遍历射线经过的 3m x 3m 空间网格，耗时 < 0.002ms)
   */
  public raycastCamera(origin: any, direction: any, maxDistance: number): number | null {
    if (!this.allTris.length) return null;

    const ox = origin.x, oy = origin.y, oz = origin.z;
    const dx = direction.x, dy = direction.y, dz = direction.z;
    const ex = ox + dx * maxDistance;
    const ey = oy + dy * maxDistance;
    const ez = oz + dz * maxDistance;

    const minX = Math.min(ox, ex) - 0.05, maxX = Math.max(ox, ex) + 0.05;
    const minY = Math.min(oy, ey) - 0.05, maxY = Math.max(oy, ey) + 0.05;
    const minZ = Math.min(oz, ez) - 0.05, maxZ = Math.max(oz, ez) + 0.05;

    const gx0 = Math.floor(minX * INV_CELL_SIZE);
    const gx1 = Math.floor(maxX * INV_CELL_SIZE);
    const gz0 = Math.floor(minZ * INV_CELL_SIZE);
    const gz1 = Math.floor(maxZ * INV_CELL_SIZE);
    const stamp = this.nextStamp();

    let closestT = maxDistance;
    let found = false;

    const testBucket = (bucket: number[] | undefined) => {
      if (!bucket) return;
      for (let i = 0; i < bucket.length; i++) {
        const idx = bucket[i];
        if (this.visitedStamp[idx] === stamp) continue;
        this.visitedStamp[idx] = stamp;
        const t = this.allTris[idx];
        if (t.isAirWall || (this.hasDedicatedCollision && t.visualOnly)) continue;
        if (
          t.maxX < minX || t.minX > maxX ||
          t.maxY < minY || t.minY > maxY ||
          t.maxZ < minZ || t.minZ > maxZ
        ) {
          continue;
        }

        // Möller–Trumbore 射线与三角形求交
        const e1x = t.bx - t.ax, e1y = t.by - t.ay, e1z = t.bz - t.az;
        const e2x = t.cx - t.ax, e2y = t.cy - t.ay, e2z = t.cz - t.az;
        const px = dy * e2z - dz * e2y;
        const py = dz * e2x - dx * e2z;
        const pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-7) continue;
        const invDet = 1.0 / det;
        const tx = ox - t.ax, ty = oy - t.ay, tz = oz - t.az;
        const u = (tx * px + ty * py + tz * pz) * invDet;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y;
        const qy = tz * e1x - tx * e1z;
        const qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * invDet;
        if (v < 0 || u + v > 1) continue;
        const hitDist = (e2x * qx + e2y * qy + e2z * qz) * invDet;
        if (hitDist > 0.12 && hitDist < closestT) {
          closestT = hitDist;
          found = true;
        }
      }
    };

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const key = makeCellKey(gx, gz);
        testBucket(this.wallGrid.get(key));
        testBucket(this.floorGrid.get(key));
      }
    }

    return found ? closestT : null;
  }

  /**
   * 射线投射射击弹道检测（使用 3m×3m 空间网格加速静态地图碰撞 + 独立检测角色受击胶囊体，彻底消除开枪/命中卡顿）
   */
  public raycastBullet(origin: any, direction: any, maxDistance = 100, extraTargets?: any[]): any | null {
    this.tmpDir.copy(direction).normalize();
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const dx = this.tmpDir.x;
    const dy = this.tmpDir.y;
    const dz = this.tmpDir.z;

    let bestTargetHit: any | null = null;
    if (extraTargets && extraTargets.length > 0) {
      this.raycaster.set(origin, this.tmpDir);
      this.raycaster.far = maxDistance;
      const targetHits = this.raycaster.intersectObjects(extraTargets, false);
      for (let i = 0; i < targetHits.length; i++) {
        const h = targetHits[i];
        if (h.distance > 0.08 && !h.object?.userData?.airWall) {
          bestTargetHit = h;
          break;
        }
      }
    }

    const searchMaxDist = bestTargetHit ? bestTargetHit.distance : maxDistance;

    // 如果空间网格已构建，沿射线步进仅检测射线经过的 3m×3m 网格桶中的三角形 (<0.015ms)
    if (this.allTris.length > 0 && (this.wallGrid.size > 0 || this.floorGrid.size > 0)) {
      let closestWallT = searchMaxDist;
      let foundWall = false;
      const stamp = this.nextStamp();

      const testBucket = (bucket: number[] | undefined) => {
        if (!bucket) return;
        for (let i = 0; i < bucket.length; i++) {
          const idx = bucket[i];
          if (this.visitedStamp[idx] === stamp) continue;
          this.visitedStamp[idx] = stamp;
          const tri = this.allTris[idx];
          if (tri.isAirWall || (this.hasDedicatedCollision && tri.visualOnly)) continue;
          const e1x = tri.bx - tri.ax;
          const e1y = tri.by - tri.ay;
          const e1z = tri.bz - tri.az;
          const e2x = tri.cx - tri.ax;
          const e2y = tri.cy - tri.ay;
          const e2z = tri.cz - tri.az;

          const px = dy * e2z - dz * e2y;
          const py = dz * e2x - dx * e2z;
          const pz = dx * e2y - dy * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          if (det > -1e-6 && det < 1e-6) continue;
          const invDet = 1.0 / det;

          const tx = ox - tri.ax;
          const ty = oy - tri.ay;
          const tz = oz - tri.az;
          const u = (tx * px + ty * py + tz * pz) * invDet;
          if (u < 0 || u > 1) continue;

          const qx = ty * e1z - tz * e1y;
          const qy = tz * e1x - tx * e1z;
          const qz = tx * e1y - ty * e1x;
          const v = (dx * qx + dy * qy + dz * qz) * invDet;
          if (v < 0 || u + v > 1) continue;

          const hitDist = (e2x * qx + e2y * qy + e2z * qz) * invDet;
          if (hitDist > 0.08 && hitDist < closestWallT) {
            closestWallT = hitDist;
            foundWall = true;
          }
        }
      };

      const stepSize = 1.5;
      let lastKey = -999999999;
      for (let d = 0; d <= searchMaxDist; d += stepSize) {
        if (foundWall && d > closestWallT + 3.0) break;
        const gx = Math.floor((ox + dx * d) * INV_CELL_SIZE);
        const gz = Math.floor((oz + dz * d) * INV_CELL_SIZE);
        const key = makeCellKey(gx, gz);
        if (key === lastKey) continue;
        lastKey = key;
        testBucket(this.wallGrid.get(key));
        testBucket(this.floorGrid.get(key));
      }

      if (foundWall) {
        return {
          distance: closestWallT,
          point: new THREE.Vector3(
            ox + dx * closestWallT,
            oy + dy * closestWallT,
            oz + dz * closestWallT
          ),
          object: { userData: { isWall: true } },
        };
      }
      return bestTargetHit;
    }

    // Fallback when spatial grid is empty
    const baseTargets = this.collisionMeshes.length ? this.collisionMeshes : this.mapVisible;
    if (!baseTargets.length) return bestTargetHit;
    this.raycaster.set(origin, this.tmpDir);
    this.raycaster.far = searchMaxDist;
    const hits = this.raycaster.intersectObjects(baseTargets, false);
    const wallHit = hits.find((h: any) => h.distance > 0.08 && !h.object?.userData?.airWall);
    return wallHit || bestTargetHit;
  }

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

  public reset() {
    this.replacedMaterials.forEach(m => m?.dispose?.());
    this.replacedMaterials.clear();
    this.mapVisible = [];
    this.collisionMeshes = [];
    (this.collisionMeshes as any)._collider = this;
    this.floorMeshes = [];
    this.bounds = null;
    this.deadAABBs = [];
    this.allTris = [];
    this.floorGrid.clear();
    this.wallGrid.clear();
    this.hasDedicatedCollision = false;
  }

  public dispose() {
    this.reset();
    if (this.airWallMaterial) {
      this.airWallMaterial.dispose();
    }
    if (this.waterMaterial) {
      this.waterMaterial.dispose();
    }
  }
}
