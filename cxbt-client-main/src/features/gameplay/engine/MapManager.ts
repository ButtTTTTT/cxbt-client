import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MapCollider } from './MapCollider';

export interface MapPresetItem {
  id: string;
  name: string;
  category: string;
  description: string;
}

export interface MapDefinition {
  scene: string;
  collision?: string;
  airWalls?: string[];
  minimap?: string;
  bounds?: number[];
  camera?: number[];
  fog?: number[];
  ambience?: string;
}

/**
 * 官方精选与全量地图预设列表 (带中文名称与分类)
 */
export const MAP_PRESETS: MapPresetItem[] = [
  { id: 'flat', name: '🟩 平地沙盒 (Flat Grid)', category: '基础调试', description: '无障碍地面网格，适合基础跑跳动作和连招手感测试' },
  { id: 'level1', name: '🏰 钟楼小镇 (Level 1)', category: '城镇风格', description: '经典钟楼小镇外星前哨基地，具有高低差坡道与街道' },
  { id: 'level2', name: '🏛️ 英雄遗迹 (Level 2)', category: '遗迹古迹', description: '开阔的英雄纪念遗迹神殿，带有石柱群与台阶地形' },
  { id: 'level3', name: '🏔️ 山顶古镇 (Level 3)', category: '城镇风格', description: '高地错落的山顶古镇街区，地形起伏丰富' },
  { id: 'level7', name: '🏝️ 沉船小岛 (Level 7)', category: '海滨风光', description: '废弃沉船与海岛沙滩，带有环岛斜坡' },
  { id: 'level8', name: '💨 破风古镇 (Level 8)', category: '城镇风格', description: '风口小镇中心广场与巷战走廊' },
  { id: 'level10', name: '🌙 夜晚古镇 (Level 10)', category: '城镇风格', description: '静谧的月夜古镇，带有深色夜景雾效' },
  { id: 'level13', name: '🌊 爱琴海角 (Level 13)', category: '海滨风光', description: '蔚蓝海岸与现代工业滨海科研站' },
  { id: 'level14', name: '🏘️ 爱琴小巷 (Level 14)', category: '海滨风光', description: '迂回狭窄的海滨小巷，掩体密集' },
  { id: 'level16', name: '🎪 爱琴集市 (Level 16)', category: '海滨风光', description: '滨海集市广场，开阔且有货物箱掩体' },
  { id: 'level17', name: '❄️ 异星战场 (Level 17)', category: '异星战场', description: '冰封异星荒原地表，具有远景雪山与战壕' },
  { id: 'level18', name: '🛣️ 异星公路 (Level 18)', category: '异星战场', description: '延伸于极地冰川的异星交通干道' },
  { id: 'level19', name: '💎 异星宝藏 (Level 19)', category: '异星战场', description: '异星资源采集点，带有深坑与采矿平台' },
  { id: 'level20', name: '🐉 龙脉宝穴 (Level 20)', category: '遗迹古迹', description: '巨大地下溶洞神迹，天然石柱与石桥' },
  { id: 'level24', name: '⚙️ 地下要塞 (Level 24)', category: '科技设施', description: '精密地下防御工事与机械回廊' },
  { id: 'level26', name: '🚨 小镇危机 (Level 26)', category: '城镇风格', description: '被危机笼罩的黄昏小镇' },
  { id: 'level43', name: '🏰 古堡遗迹 (Level 43)', category: '遗迹古迹', description: '宏伟的欧式中世纪古堡中庭与回廊' },
  { id: 'level44', name: '🛡️ 古堡要塞 (Level 44)', category: '遗迹古迹', description: '深层古堡内殿与塔楼' },
  { id: 'level45', name: '🏔️ 雪原基地 (Level 45)', category: '异星战场', description: '广袤的雪原防御哨所' },
  { id: 'level10001', name: '👹 BOSS 竞技场 1 (Boss 01)', category: 'BOSS 竞技场', description: '巨型机械首领封闭决斗场' },
  { id: 'level10002', name: '👹 BOSS 竞技场 2 (Boss 02)', category: 'BOSS 竞技场', description: '毒雾环绕的生化首领战斗室' },
  { id: 'level10008', name: '👹 BOSS 竞技场 8 (Boss 08)', category: 'BOSS 竞技场', description: '深渊决斗台' },
  { id: 'level10009', name: '👹 BOSS 竞技场 9 (Boss 09)', category: 'BOSS 竞技场', description: '终极熔岩试炼场' },
];

export interface LoadedMapSession {
  mapId: string;
  preset: MapPresetItem;
  def?: MapDefinition;
  visualScene: any | null;
  collisionScene: any | null;
  spawnPoint: any;
  bounds: number[] | null;
  fogColor?: any;
}

let cachedMapsJson: Record<string, MapDefinition> | null = null;

export async function getMapsDefinitions(): Promise<Record<string, MapDefinition>> {
  if (cachedMapsJson) return cachedMapsJson;
  const baseUrl = import.meta.env.BASE_URL;
  const res = await fetch(`${baseUrl}assets/gameplay/maps.json`);
  if (!res.ok) throw new Error('无法加载 maps.json 地图清单');
  cachedMapsJson = await res.json();
  return cachedMapsJson!;
}

/**
 * 动态加载并挂载指定地图至场景与碰撞体
 */
export async function loadMapIntoScene(
  mapId: string,
  scene: any,
  collider: MapCollider,
  onProgress?: (text: string) => void
): Promise<LoadedMapSession> {
  const preset = MAP_PRESETS.find(p => p.id === mapId) || {
    id: mapId,
    name: `地图 ${mapId}`,
    category: '其他地图',
    description: '未知地图'
  };

  // 1. 平地沙盒模式 (无需加载 GLB，纯平地碰撞)
  if (mapId === 'flat') {
    onProgress?.('正在重置为平地沙盒...');
    collider.reset();
    scene.fog = null;
    scene.background = new THREE.Color('#0f172a');

    return {
      mapId: 'flat',
      preset,
      visualScene: null,
      collisionScene: null,
      spawnPoint: new THREE.Vector3(0, 0, 0),
      bounds: [-100, -100, 200, 200]
    };
  }

  // 2. 加载正统 3D 关卡地图
  onProgress?.(`正在读取 [${preset.name}] 地图配置...`);
  const mapsDefs = await getMapsDefinitions();
  const def = mapsDefs[mapId];

  if (!def) {
    throw new Error(`maps.json 中未找到地图 ID: ${mapId}`);
  }

  const baseUrl = import.meta.env.BASE_URL;
  const loader = new GLTFLoader();

  onProgress?.(`正在异步下载 [${preset.name}] 3D 地形与物理碰撞体...`);

  const sceneUrl = `${baseUrl}assets/gameplay/${def.scene}`;
  const collisionUrl = def.collision ? `${baseUrl}assets/gameplay/${def.collision}` : null;

  const [visualGltf, collisionGltf] = await Promise.all([
    loader.loadAsync(sceneUrl),
    collisionUrl ? loader.loadAsync(collisionUrl).catch(() => null) : Promise.resolve(null)
  ]);

  const visualScene = visualGltf.scene;
  const collisionScene = collisionGltf?.scene ?? null;

  // 优化材质与阴影接收
  visualScene.traverse((obj: any) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  // 注册到物理碰撞器与空气墙检测系统
  collider.reset();
  if (def.bounds) {
    collider.setBounds(def.bounds);
  }

  collider.registerVisualScene(visualScene, def.airWalls || []);
  if (collisionScene) {
    collider.registerCollisionScene(collisionScene);
  }

  scene.add(visualScene);

  // 配置地图专属环境雾效与天际线颜色
  let fogColor: any;
  if (def.fog && def.fog.length >= 6) {
    fogColor = new THREE.Color(def.fog[3], def.fog[4], def.fog[5]);
    scene.fog = new THREE.Fog(fogColor, def.fog[1], def.fog[2]);
    scene.background = fogColor;
  } else {
    scene.fog = null;
    scene.background = new THREE.Color('#1e293b');
  }

  // 计算出生点坐标
  const spawnX = def.camera?.[0] ?? 0;
  const spawnZ = def.camera?.[2] ?? 0;
  const floorY = collider.floorAt(spawnX, spawnZ, 90) ?? 0;
  const spawnPoint = new THREE.Vector3(spawnX, floorY, spawnZ);

  onProgress?.(`[${preset.name}] 加载就绪！出生点: (${spawnX.toFixed(1)}, ${floorY.toFixed(1)}, ${spawnZ.toFixed(1)})`);

  return {
    mapId,
    preset,
    def,
    visualScene,
    collisionScene,
    spawnPoint,
    bounds: def.bounds ?? null,
    fogColor
  };
}

/**
 * 卸载地图，彻底释放 GPU 网格显存与材质
 */
export function unloadMapFromScene(session: LoadedMapSession, scene: any, collider: MapCollider) {
  if (session.visualScene) {
    scene.remove(session.visualScene);
    session.visualScene.traverse((obj: any) => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m: any) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
  }

  if (session.collisionScene) {
    session.collisionScene.traverse((obj: any) => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
      }
    });
  }

  collider.reset();
  scene.fog = null;
  scene.background = new THREE.Color('#0f172a');
}
