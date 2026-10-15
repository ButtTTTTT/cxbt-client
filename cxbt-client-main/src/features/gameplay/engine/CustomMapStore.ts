import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MapCollider } from './MapCollider';
import { BotManager, type BotBehaviorMode } from './BotManager';
import { WEAPON_SUITES } from './configs/weaponSuites';
import { createStylizedWeaponMesh } from './ProceduralWeaponBuilder';
import { assetUrl, type CreationJob } from '../../characterCreation/assets';
import type { LobbyAssets } from '../../lobby/assets';

export type CustomNodeKind = 'block' | 'model' | 'character' | 'monster';

export type BlockShape =
  | 'box'
  | 'ramp'
  | 'cylinder'
  | 'crate'
  | 'barrier'
  | 'arch'
  | 'jumpPad'
  | 'spawnPoint';

export type MonsterTier = 'grunt' | 'elite' | 'boss';

export interface CustomMapNode {
  id: string;
  name: string;
  kind: CustomNodeKind;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  // 1. 地形与建筑块属性
  shape?: BlockShape;
  color?: string;
  collidable?: boolean;
  // 2. 3D 模型与武器陈列属性
  weaponId?: string;
  modelUrl?: string;
  // 3. 人物(NPC) 与 怪物(AI/BOSS) 属性
  jobId?: CreationJob;
  gender?: number;
  avatarCardId?: string;
  actionKey?: string;
  aiMode?: BotBehaviorMode;
  monsterTier?: MonsterTier;
  maxHp?: number;
  bodyScale?: number;
  speedMultiplier?: number;
  damageMultiplier?: number;
  auraColor?: string;
}

export interface CustomMapBlueprint {
  id: string;
  name: string;
  description: string;
  baseMapId: string;
  skyColor: string;
  spawnPoint: [number, number, number];
  nodes: CustomMapNode[];
  updatedAt: number;
}

const STORAGE_KEY = 'cxbt_custom_maps_v1';
const ACTIVE_CUSTOM_MAP_KEY = 'cxbt_active_custom_map_id';

export const DEFAULT_CUSTOM_MAP: CustomMapBlueprint = {
  id: 'custom_boss_citadel',
  name: '🛠️ 创意工坊：立体攻防与巨型BOSS要塞',
  description: '包含双层狙击高台、战术斜坡、掩体工事、3D武器陈列架、自定义NPC与巨型泰坦BOSS的沙盒自制地图',
  baseMapId: 'flat',
  skyColor: '#0f172a',
  spawnPoint: [0, 0, 12],
  updatedAt: Date.now(),
  nodes: [
    {
      id: 'node_ground_plaza',
      name: '中央合金作战主平台',
      kind: 'block',
      shape: 'box',
      color: '#1e293b',
      collidable: true,
      position: [0, -0.25, 0],
      rotation: [0, 0, 0],
      scale: [36, 0.5, 36]
    },
    {
      id: 'node_high_platform_north',
      name: '北侧二层狙击高台',
      kind: 'block',
      shape: 'box',
      color: '#334155',
      collidable: true,
      position: [0, 1.5, -10],
      rotation: [0, 0, 0],
      scale: [14, 3.0, 6]
    },
    {
      id: 'node_ramp_left',
      name: '左侧突击登高斜坡',
      kind: 'block',
      shape: 'ramp',
      color: '#0284c7',
      collidable: true,
      position: [-9, 1.5, -8],
      rotation: [0, Math.PI / 2, 0],
      scale: [4, 3.0, 6]
    },
    {
      id: 'node_ramp_right',
      name: '右侧突击登高斜坡',
      kind: 'block',
      shape: 'ramp',
      color: '#0284c7',
      collidable: true,
      position: [9, 1.5, -8],
      rotation: [0, -Math.PI / 2, 0],
      scale: [4, 3.0, 6]
    },
    {
      id: 'node_crate_1',
      name: '前线掩体集装箱 A',
      kind: 'block',
      shape: 'crate',
      color: '#d97706',
      collidable: true,
      position: [-4.5, 0.9, 4],
      rotation: [0, 0.25, 0],
      scale: [2.2, 1.8, 2.2]
    },
    {
      id: 'node_crate_2',
      name: '前线掩体集装箱 B',
      kind: 'block',
      shape: 'crate',
      color: '#2563eb',
      collidable: true,
      position: [4.5, 0.9, 4],
      rotation: [0, -0.25, 0],
      scale: [2.2, 1.8, 2.2]
    },
    {
      id: 'node_barrier_center',
      name: '中央能量防爆掩体墙',
      kind: 'block',
      shape: 'barrier',
      color: '#38bdf8',
      collidable: true,
      position: [0, 0.8, 6.5],
      rotation: [0, 0, 0],
      scale: [4.2, 1.6, 0.6]
    },
    {
      id: 'node_arch_gate',
      name: '要塞凯旋拱门',
      kind: 'block',
      shape: 'arch',
      color: '#475569',
      collidable: true,
      position: [0, 0, 10],
      rotation: [0, 0, 0],
      scale: [1.2, 1.2, 1.2]
    },
    {
      id: 'node_weapon_showcase_1',
      name: '3D 武器全息展示台 (火箭筒)',
      kind: 'model',
      weaponId: 'rpg_01',
      position: [-3.2, 1.1, 8.5],
      rotation: [0, 0.6, 0],
      scale: [1.8, 1.8, 1.8]
    },
    {
      id: 'node_weapon_showcase_2',
      name: '3D 武器全息展示台 (重机枪)',
      kind: 'model',
      weaponId: 'machinegun_01',
      position: [3.2, 1.1, 8.5],
      rotation: [0, -0.6, 0],
      scale: [1.8, 1.8, 1.8]
    },
    {
      id: 'node_npc_commander',
      name: 'NPC 战地指挥官·蕾欧娜',
      kind: 'character',
      jobId: 'guardian',
      gender: 1,
      avatarCardId: 'default',
      weaponId: 'sniperrifle_01',
      actionKey: 'idle',
      aiMode: 'dummy',
      maxHp: 5000,
      bodyScale: 1.05,
      auraColor: '#38bdf8',
      position: [-2.2, 0, 10.5],
      rotation: [0, Math.PI, 0],
      scale: [1, 1, 1]
    },
    {
      id: 'node_monster_guard_left',
      name: '精英巡逻卫兵 · 暗影刀客',
      kind: 'monster',
      monsterTier: 'elite',
      jobId: 'assassin',
      gender: 0,
      avatarCardId: 'default',
      weaponId: 'knives_01',
      actionKey: 'run',
      aiMode: 'patrol',
      maxHp: 4500,
      bodyScale: 1.2,
      speedMultiplier: 1.15,
      damageMultiplier: 1.3,
      auraColor: '#f59e0b',
      position: [-6, 0, -2],
      rotation: [0, 0, 0],
      scale: [1.2, 1.2, 1.2]
    },
    {
      id: 'node_monster_guard_right',
      name: '精英巡逻卫兵 · 剧毒专家',
      kind: 'monster',
      monsterTier: 'elite',
      jobId: 'biochemist',
      gender: 1,
      avatarCardId: 'default',
      weaponId: 'sprayer_01',
      actionKey: 'run',
      aiMode: 'patrol',
      maxHp: 4500,
      bodyScale: 1.2,
      speedMultiplier: 1.1,
      damageMultiplier: 1.3,
      auraColor: '#10b981',
      position: [6, 0, -2],
      rotation: [0, 0, 0],
      scale: [1.2, 1.2, 1.2]
    },
    {
      id: 'node_monster_boss_titan',
      name: '👹 终焉重装巨兽 · 泰坦首领 (BOSS)',
      kind: 'monster',
      monsterTier: 'boss',
      jobId: 'gunner',
      gender: 0,
      avatarCardId: 'default',
      weaponId: 'machinegun_01',
      actionKey: 'idle',
      aiMode: 'chase',
      maxHp: 12000,
      bodyScale: 2.0,
      speedMultiplier: 0.95,
      damageMultiplier: 2.2,
      auraColor: '#ef4444',
      position: [0, 3.0, -9.5],
      rotation: [0, 0, 0],
      scale: [2.0, 2.0, 2.0]
    }
  ]
};

export function getSavedCustomMaps(): CustomMapBlueprint[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([DEFAULT_CUSTOM_MAP]));
      return [DEFAULT_CUSTOM_MAP];
    }
    const parsed = JSON.parse(raw) as CustomMapBlueprint[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [DEFAULT_CUSTOM_MAP];
    }
    if (!parsed.some(m => m.id === DEFAULT_CUSTOM_MAP.id)) {
      parsed.unshift(DEFAULT_CUSTOM_MAP);
    }
    return parsed;
  } catch {
    return [DEFAULT_CUSTOM_MAP];
  }
}

export function getCustomMapById(mapId: string): CustomMapBlueprint | undefined {
  return getSavedCustomMaps().find(m => m.id === mapId);
}

export function saveCustomMap(blueprint: CustomMapBlueprint): CustomMapBlueprint[] {
  const list = getSavedCustomMaps();
  const updated: CustomMapBlueprint = {
    ...blueprint,
    updatedAt: Date.now()
  };
  const idx = list.findIndex(m => m.id === updated.id);
  if (idx >= 0) {
    list[idx] = updated;
  } else {
    list.push(updated);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('[CustomMapStore] localStorage save failed:', err);
  }
  return list;
}

export function deleteCustomMap(mapId: string): CustomMapBlueprint[] {
  const list = getSavedCustomMaps().filter(m => m.id !== mapId);
  const final = list.length > 0 ? list : [DEFAULT_CUSTOM_MAP];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(final));
  } catch {
    // ignore
  }
  return final;
}

export function setActiveCustomMapId(mapId: string | null) {
  try {
    if (mapId) localStorage.setItem(ACTIVE_CUSTOM_MAP_KEY, mapId);
    else localStorage.removeItem(ACTIVE_CUSTOM_MAP_KEY);
  } catch {
    // ignore
  }
}

export function getActiveCustomMapId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CUSTOM_MAP_KEY);
  } catch {
    return null;
  }
}

/**
 * 构建单个地形块/道具模型的 3D Mesh Group
 */
export async function buildCustomNodeObject3D(
  node: CustomMapNode,
  lobbyAssets?: LobbyAssets | null
): Promise<any> {
  const group = new THREE.Group();
  group.name = `custom_node_${node.id}`;
  group.position.set(node.position[0], node.position[1], node.position[2]);
  group.rotation.set(node.rotation[0], node.rotation[1], node.rotation[2]);
  group.scale.set(node.scale[0], node.scale[1], node.scale[2]);
  group.userData = {
    customNodeId: node.id,
    customNodeKind: node.kind,
    customNode: node
  };

  if (node.kind === 'block') {
    const color = new THREE.Color(node.color || '#38bdf8');
    const shape = node.shape || 'box';

    if (shape === 'box') {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 })
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    } else if (shape === 'crate') {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 })
      );
      const frame = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01)),
        new THREE.LineBasicMaterial({ color: 0xfef08a })
      );
      mesh.add(frame);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    } else if (shape === 'ramp') {
      // 楔形斜坡几何体
      const shape2d = new THREE.Shape();
      shape2d.moveTo(-0.5, -0.5);
      shape2d.lineTo(0.5, -0.5);
      shape2d.lineTo(0.5, 0.5);
      shape2d.closePath();
      const geom = new THREE.ExtrudeGeometry(shape2d, { depth: 1, bevelEnabled: false });
      geom.center();
      const mesh = new THREE.Mesh(
        geom,
        new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.2 })
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    } else if (shape === 'cylinder') {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
        new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.35 })
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    } else if (shape === 'barrier') {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.4, 1.2),
        new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.5, metalness: 0.5 })
      );
      base.position.y = -0.3;
      const shield = new THREE.Mesh(
        new THREE.BoxGeometry(0.96, 0.85, 0.35),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.35,
          transparent: true,
          opacity: 0.82
        })
      );
      shield.position.y = 0.15;
      base.castShadow = true;
      base.receiveShadow = true;
      shield.castShadow = true;
      group.add(base, shield);
    } else if (shape === 'arch') {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 });
      const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.6, 0.8), mat);
      leftPillar.position.set(-2.0, 1.8, 0);
      const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.6, 0.8), mat);
      rightPillar.position.set(2.0, 1.8, 0);
      const topBeam = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.8, 1.0), mat);
      topBeam.position.set(0, 3.8, 0);
      leftPillar.castShadow = true;
      rightPillar.castShadow = true;
      topBeam.castShadow = true;
      leftPillar.receiveShadow = true;
      rightPillar.receiveShadow = true;
      topBeam.receiveShadow = true;
      group.add(leftPillar, rightPillar, topBeam);
    } else if (shape === 'jumpPad') {
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.1, 0.25, 24),
        new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.6, roughness: 0.3 })
      );
      const glow = new THREE.Mesh(
        new THREE.TorusGeometry(0.7, 0.08, 8, 24),
        new THREE.MeshBasicMaterial({ color: '#37f4d3' })
      );
      glow.rotation.x = Math.PI / 2;
      glow.position.y = 0.15;
      group.add(pad, glow);
    } else if (shape === 'spawnPoint') {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.07, 8, 28),
        new THREE.MeshBasicMaterial({ color: '#38bdf8' })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.05;
      const beacon = new THREE.Mesh(
        new THREE.ConeGeometry(0.35, 1.2, 8),
        new THREE.MeshBasicMaterial({ color: '#38bdf8', wireframe: true })
      );
      beacon.position.y = 0.7;
      group.add(ring, beacon);
    }
    return group;
  }

  if (node.kind === 'model') {
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.7, 0.2, 18),
      new THREE.MeshStandardMaterial({ color: '#0ea5e9', metalness: 0.6, roughness: 0.25 })
    );
    pedestal.position.y = -0.35;
    group.add(pedestal);

    const wId = node.weaponId || 'smg_01';
    const loader = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();

    const lobbyWep = lobbyAssets?.weapons?.[wId];
    const suite = WEAPON_SUITES.find(s => s.id === wId);
    const parts = lobbyWep
      ? lobbyWep.parts.map(p => ({
          model: assetUrl(p.model),
          texture: p.texture ? assetUrl(p.texture) : null
        }))
      : (suite?.parts ?? []);

    let loadedAny = false;
    for (const part of parts) {
      try {
        const gltf = await loader.loadAsync(part.model);
        const obj = gltf.scene;
        if (part.texture) {
          const tex = await texLoader.loadAsync(part.texture).catch(() => null);
          if (tex) {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = false;
            const mat = new THREE.MeshPhongMaterial({ map: tex, color: '#ffffff', shininess: 18 });
            obj.traverse((c: any) => { if (c.isMesh) c.material = mat; });
          }
        }
        group.add(obj);
        loadedAny = true;
      } catch {
        // fallback below
      }
    }

    if (!loadedAny) {
      group.add(createStylizedWeaponMesh(wId));
    }
    return group;
  }

  return group;
}

/**
 * 将自定义地图中的所有建筑块、3D模型、NPC人物、AI怪物/BOSS 一键挂载到指定场景与碰撞器中
 * 同时服务于：沙盒地图编辑器、沙盒跑跳实机测试、正式游戏房间实战 (Gameplay.tsx)
 */
export async function mountCustomMapNodesIntoScene(
  blueprint: CustomMapBlueprint,
  scene: any,
  collider: MapCollider,
  botManager: BotManager | null,
  lobbyAssets?: LobbyAssets | null
): Promise<{ rootGroup: any; dispose: () => void }> {
  const rootGroup = new THREE.Group();
  rootGroup.name = `custom_map_root_${blueprint.id}`;
  scene.add(rootGroup);

  const staticGroup = new THREE.Group();
  rootGroup.add(staticGroup);

  for (const node of blueprint.nodes) {
    if (node.kind === 'block' || node.kind === 'model') {
      const obj = await buildCustomNodeObject3D(node, lobbyAssets);
      staticGroup.add(obj);
    }
  }

  staticGroup.updateMatrixWorld(true);
  collider.registerVisualScene(staticGroup, []);

  // 部署自定义人物(NPC)与自定义怪物/BOSS
  if (botManager) {
    const env = collider.toCollisionEnvironment();
    for (const node of blueprint.nodes) {
      if (node.kind === 'character' || node.kind === 'monster') {
        const cardItem = node.avatarCardId && node.avatarCardId !== 'default'
          ? lobbyAssets?.items.find(i => i.category === 'avatars' && i.id === node.avatarCardId)?.avatarCard
          : undefined;
        const wId = node.weaponId || 'knives_01';
        const lobbyWep = lobbyAssets?.weapons?.[wId];
        const weaponParts = lobbyWep
          ? lobbyWep.parts.map(p => ({
              model: assetUrl(p.model),
              texture: p.texture ? assetUrl(p.texture) : null,
              bone: p.bone
            }))
          : undefined;

        const floorY = env.floorAt?.(node.position[0], node.position[2], 90) ?? node.position[1];
        const spawnY = Math.max(node.position[1], floorY);

        await botManager.spawnBot({
          customName: node.name,
          mode: node.kind === 'character' ? (node.aiMode || 'dummy') : (node.aiMode || 'chase'),
          jobId: node.jobId || 'gunner',
          gender: node.gender ?? 0,
          preset: cardItem?.preset,
          weaponId: wId,
          weaponParts,
          maxHp: node.maxHp ?? (node.monsterTier === 'boss' ? 12000 : node.monsterTier === 'elite' ? 4800 : 3200),
          bodyScale: node.bodyScale ?? (node.monsterTier === 'boss' ? 2.0 : node.monsterTier === 'elite' ? 1.25 : 1.0),
          speedMultiplier: node.speedMultiplier ?? 1.0,
          damageMultiplier: node.damageMultiplier ?? (node.monsterTier === 'boss' ? 2.2 : 1.0),
          auraColor: node.auraColor ?? (node.monsterTier === 'boss' ? '#ef4444' : node.kind === 'character' ? '#38bdf8' : '#f59e0b'),
          forcedAction: node.kind === 'character' && (node.aiMode === 'dummy' || !node.aiMode) && node.actionKey !== 'auto'
            ? (node.actionKey || null)
            : null,
          exactPosition: {
            x: node.position[0],
            y: spawnY,
            z: node.position[2],
            yaw: node.rotation[1]
          },
          originPosition: new THREE.Vector3(node.position[0], spawnY, node.position[2]),
          collisionEnv: env
        });
      }
    }
  }

  return {
    rootGroup,
    dispose: () => {
      if (rootGroup.parent) rootGroup.parent.remove(rootGroup);
      rootGroup.traverse((c: any) => {
        if (c.isMesh) {
          c.geometry?.dispose();
          if (Array.isArray(c.material)) c.material.forEach((m: any) => m?.dispose());
          else c.material?.dispose();
        }
      });
    }
  };
}
