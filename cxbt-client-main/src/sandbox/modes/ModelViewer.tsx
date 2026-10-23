import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WEAPON_SUITES, ACTION_LABELS, getWeaponActionSuite, type WeaponActionSet, type WeaponPartConfig } from '../../features/gameplay/engine/configs/weaponSuites';
import { buildFullAvatar, type BuiltAvatar } from '../../features/gameplay/engine/avatarBuilder';
import { 
  MAP_PRESETS, 
  loadMapIntoScene, 
  unloadMapFromScene, 
  type LoadedMapSession 
} from '../../features/gameplay/engine/MapManager';
import { MapCollider } from '../../features/gameplay/engine/MapCollider';
import { assetUrl, type CreationJob } from '../../features/characterCreation/assets';
import { loadLobbyAssets, type LobbyAssets } from '../../features/lobby/assets';

interface JobOption {
  id: CreationJob;
  gender: number;
  label: string;
}

const JOB_OPTIONS: JobOption[] = [
  { id: 'assassin', gender: 0, label: '🗡️ 男突击兵 (Male Assassin)' },
  { id: 'assassin', gender: 1, label: '🗡️ 女突击兵 (Female Assassin)' },
  { id: 'guardian', gender: 0, label: '🛡️ 男护卫兵 (Male Guardian)' },
  { id: 'guardian', gender: 1, label: '🛡️ 女护卫兵 (Female Guardian)' },
  { id: 'gunner', gender: 0, label: '🦾 男重装兵 (Male Gunner)' },
  { id: 'gunner', gender: 1, label: '🦾 女重装兵 (Female Gunner)' },
  { id: 'biochemist', gender: 0, label: '🧪 男生化专家 (Male Biochemist)' },
  { id: 'biochemist', gender: 1, label: '🧪 女生化专家 (Female Biochemist)' },
];

export default function ModelViewer() {
  const mountRef = useRef<HTMLDivElement>(null);

  // 调试状态控制
  const [lobbyAssets, setLobbyAssets] = useState<LobbyAssets | null>(null);
  const [selectedAvatarCardId, setSelectedAvatarCardId] = useState<string>('default');
  const [selectedJobIdx, setSelectedJobIdx] = useState<number>(0);
  const [selectedHairIdx, setSelectedHairIdx] = useState<number>(0);
  const [availableHairCount, setAvailableHairCount] = useState<number>(4);
  const [activeWeaponId, setActiveWeaponId] = useState<string>(WEAPON_SUITES[0].id);
  const [selectedWeaponSkinId, setSelectedWeaponSkinId] = useState<string>('');
  const [activeAnimKey, setActiveAnimKey] = useState<string>('idle');
  const [selectedEnvMapId, setSelectedEnvMapId] = useState<string>('none');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [showAxes, setShowAxes] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [status, setStatus] = useState('正在初始化全角色 3D 查看器...');

  // Three.js 核心引用
  const sceneRef = useRef<any | null>(null);
  const cameraRef = useRef<any | null>(null);
  const controlsRef = useRef<any | null>(null);
  const rootGroupRef = useRef<any | null>(null);
  const currentDisposerRef = useRef<(() => void) | null>(null);
  const envMapSessionRef = useRef<LoadedMapSession | null>(null);
  const envColliderRef = useRef<MapCollider>(new MapCollider());

  const skeletonHelperRef = useRef<any | null>(null);
  const axesHelperRef = useRef<any | null>(null);
  const gridHelperRef = useRef<any | null>(null);
  const mixerRef = useRef<any | null>(null);
  const currentActionRef = useRef<any | null>(null);
  const mainSkeletonRef = useRef<any | null>(null);
  const weaponPartsRef = useRef<any[]>([]);

  // 1. 初始化三维场景与渲染器
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f172a');
    sceneRef.current = scene;

    // 摄影棚三点布光系统
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 2.2);
    mainLight.position.set(4, 8, 5);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.2);
    fillLight.position.set(-4, 4, -2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xfef08a, 1.4);
    rimLight.position.set(0, 5, -5);
    scene.add(rimLight);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.3, 2.9);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.95, 0);
    controls.maxPolarAngle = Math.PI * 0.95;
    controls.minDistance = 0.8;
    controls.maxDistance = 12.0;
    controlsRef.current = controls;

    const grid = new THREE.GridHelper(10, 20, 0x38bdf8, 0x1e293b);
    grid.position.y = 0;
    scene.add(grid);
    gridHelperRef.current = grid;

    const clock = new THREE.Clock();
    let animationId: number;

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }

      if ((window as any).__SANDBOX_AUTO_ROTATE && rootGroupRef.current) {
        rootGroupRef.current.rotation.y += 0.8 * delta;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);

      if (envMapSessionRef.current) {
        unloadMapFromScene(envMapSessionRef.current, scene, envColliderRef.current);
        envMapSessionRef.current = null;
      }
      envColliderRef.current.dispose();

      if (skeletonHelperRef.current) {
        scene.remove(skeletonHelperRef.current);
        skeletonHelperRef.current = null;
      }

      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // 辅助查找骨骼节点
  const findBone = (skeleton: any, boneName: string) => {
    if (!skeleton) return null;
    let found = skeleton.bones.find((b: any) => b.name === boneName);
    if (found) return found;
    const isLeft = boneName.toLowerCase().includes('l');
    const candidates = isLeft
      ? ['handweapon_l', 'hand_l', 'Bip01 L Hand', 'mixamorig:LeftHand', 'LeftHand', 'L_Hand']
      : ['handweapon_r', 'hand_r', 'Bip01 R Hand', 'mixamorig:RightHand', 'RightHand', 'R_Hand'];
    for (const name of candidates) {
      found = skeleton.bones.find((b: any) => b.name.toLowerCase() === name.toLowerCase());
      if (found) return found;
    }
    for (const b of skeleton.bones) {
      const lower = b.name.toLowerCase();
      if (isLeft && (lower.includes('handweapon_l') || (lower.includes('hand') && lower.includes('l')))) return b;
      if (!isLeft && (lower.includes('handweapon_r') || (lower.includes('hand') && lower.includes('r')))) return b;
    }
    return skeleton.bones[skeleton.bones.length - 1] ?? null;
  };

  // 清理挂载的武器部件
  const clearMountedWeapons = () => {
    for (const group of weaponPartsRef.current) {
      if (group.parent) group.parent.remove(group);
      group.traverse((c: any) => {
        if (c.isMesh) {
          c.geometry?.dispose();
          if (Array.isArray(c.material)) c.material.forEach((m: any) => m.dispose());
          else c.material?.dispose();
        }
      });
    }
    weaponPartsRef.current = [];
  };

  useEffect(() => {
    const controller = new AbortController();
    loadLobbyAssets(controller.signal)
      .then(assets => {
        if (!controller.signal.aborted) setLobbyAssets(assets);
      })
      .catch(() => null);
    return () => controller.abort();
  }, []);

  // 挂载武器部件 (支持双持与多部件模型)
  const mountWeaponParts = async (parts: WeaponPartConfig[] | undefined, skeleton: any) => {
    clearMountedWeapons();
    if (!parts || !skeleton) return;

    const loader = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();

    for (const part of parts) {
      try {
        const bone = findBone(skeleton, part.bone);
        if (!bone) {
          console.warn(`[ModelViewer] 未找到武器挂载骨骼: ${part.bone}`);
          continue;
        }

        const gltf = await loader.loadAsync(part.model);
        const weaponScene = gltf.scene;

        if (part.texture) {
          const texture = await texLoader.loadAsync(part.texture);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.flipY = false;
          const mat = new THREE.MeshPhongMaterial({
            map: texture,
            color: '#ffffff',
            shininess: 14,
            specular: '#222222'
          });
          weaponScene.traverse((c: any) => {
            if (c.isMesh) c.material = mat;
          });
        }

        weaponScene.traverse((c: any) => {
          if (c.isMesh) {
            c.frustumCulled = false;
            c.castShadow = true;
            c.receiveShadow = true;
          }
        });

        bone.add(weaponScene);
        weaponPartsRef.current.push(weaponScene);
      } catch (err) {
        console.warn('[ModelViewer] 武器模型挂接失败:', part.model, err);
      }
    }
  };

  const resolveActiveWeaponParts = (): WeaponPartConfig[] | undefined => {
    if (activeWeaponId === 'none') return undefined;
    if (selectedWeaponSkinId && lobbyAssets?.weapons[selectedWeaponSkinId]) {
      return lobbyAssets.weapons[selectedWeaponSkinId].parts.map(p => ({
        model: assetUrl(p.model),
        texture: p.texture ? assetUrl(p.texture) : null,
        bone: p.bone
      }));
    }
    const currentSuite = WEAPON_SUITES.find(s => s.id === activeWeaponId);
    return currentSuite?.parts;
  };

  // 2. 加载与装配完整角色 (身体 + 面部五官 + 发型 + 贴图材质)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    let cancelled = false;
    const currentJob = JOB_OPTIONS[selectedJobIdx] || JOB_OPTIONS[0];
    const cardItem = selectedAvatarCardId !== 'default'
      ? lobbyAssets?.items.find(i => i.category === 'avatars' && i.id === selectedAvatarCardId)?.avatarCard
      : undefined;
    const label = cardItem ? `造型卡: ${cardItem.name}` : currentJob.label;
    setStatus(`正在装配 [${label}] 完整身体、面部与材质...`);

    // 清理旧模型与骨骼线框
    if (rootGroupRef.current) {
      scene.remove(rootGroupRef.current);
      rootGroupRef.current = null;
    }
    if (skeletonHelperRef.current) {
      scene.remove(skeletonHelperRef.current);
      skeletonHelperRef.current = null;
    }
    if (currentDisposerRef.current) {
      currentDisposerRef.current();
      currentDisposerRef.current = null;
    }
    clearMountedWeapons();

    buildFullAvatar({
      jobId: currentJob.id,
      gender: currentJob.gender,
      hairIndex: selectedHairIdx,
      preset: cardItem?.preset
    }).then(async (built: BuiltAvatar) => {
      if (cancelled) {
        built.dispose();
        return;
      }

      currentDisposerRef.current = built.dispose;
      mainSkeletonRef.current = built.skeleton;
      setAvailableHairCount(built.preset.hair.length);

      const group = built.root;
      rootGroupRef.current = group;

      // 如果当前加载了环境背景地图，将角色放置在地图地面上
      if (envMapSessionRef.current) {
        group.position.copy(envMapSessionRef.current.spawnPoint);
      }

      // 坐标轴辅助
      const axes = new THREE.AxesHelper(1.2);
      axesHelperRef.current = axes;
      group.add(axes);
      axes.visible = showAxes;

      // 骨骼线框辅助 (严格绑定角色主骨骼根节点，杜绝配件与外部网格产生第二套重叠骨骼)
      const rootBone = built.skeleton?.bones?.[0] || group;
      const skeletonHelper = new THREE.SkeletonHelper(rootBone);
      skeletonHelperRef.current = skeletonHelper;
      scene.add(skeletonHelper);
      skeletonHelper.visible = showSkeleton;

      scene.add(group);

      // 创建动画混合器
      const mixer = new THREE.AnimationMixer(group);
      mixerRef.current = mixer;
      mixer.timeScale = isPlaying ? playbackSpeed : 0;

      // 挂载武器
      const currentSuite = WEAPON_SUITES.find(s => s.id === activeWeaponId);
      await mountWeaponParts(resolveActiveWeaponParts(), built.skeleton);

      // 应用线框模式设置
      applyWireframe(showWireframe);

      // 加载并播放动作
      loadActionClip(activeAnimKey, currentSuite);

      setStatus(`[${label}] 模型装配完毕！骨骼与五官贴图已全部就绪。`);
    }).catch(err => {
      if (!cancelled) {
        console.error('[ModelViewer] 角色装配失败:', err);
        setStatus(`角色装配失败: ${err.message || err}`);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedJobIdx, selectedHairIdx, selectedAvatarCardId, lobbyAssets]);

  // 3. 武器套件或原版皮肤切换时挂载模型与动作更新
  useEffect(() => {
    if (!mainSkeletonRef.current) return;
    const currentSuite = WEAPON_SUITES.find(s => s.id === activeWeaponId);
    const skinWeapon = selectedWeaponSkinId ? lobbyAssets?.weapons[selectedWeaponSkinId] : undefined;
    const weaponTitle = skinWeapon ? `${skinWeapon.label} (${skinWeapon.id})` : (currentSuite?.name ?? '无武器');
    setStatus(`正在适配 [${weaponTitle}] 武器模型与挂点...`);
    mountWeaponParts(resolveActiveWeaponParts(), mainSkeletonRef.current).then(() => {
      setStatus(`[${weaponTitle}] 模型与骨骼适配成功！`);
      loadActionClip(activeAnimKey, currentSuite);
    });
  }, [activeWeaponId, selectedWeaponSkinId]);

  // 4. 背景环境地图加载与随时切换
  const switchEnvMap = async (mapId: string) => {
    const scene = sceneRef.current;
    if (!scene) return;
    setSelectedEnvMapId(mapId);

    // 清除旧环境地图
    if (envMapSessionRef.current) {
      unloadMapFromScene(envMapSessionRef.current, scene, envColliderRef.current);
      envMapSessionRef.current = null;
    }

    if (mapId === 'none') {
      scene.fog = null;
      scene.background = new THREE.Color('#0f172a');
      if (gridHelperRef.current) gridHelperRef.current.visible = showGrid;
      if (rootGroupRef.current) rootGroupRef.current.position.set(0, 0, 0);
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0.95, 0);
        cameraRef.current?.position.set(0, 1.3, 2.9);
        controlsRef.current.update();
      }
      setStatus('已切换为纯黑摄影棚背景');
      return;
    }

    try {
      setStatus(`正在加载背景环境地图: ${MAP_PRESETS.find(m => m.id === mapId)?.name || mapId}...`);
      const session = await loadMapIntoScene(mapId, scene, envColliderRef.current, (msg) => setStatus(msg));
      envMapSessionRef.current = session;

      if (gridHelperRef.current) gridHelperRef.current.visible = false;

      // 将角色放置在地图地面上
      if (rootGroupRef.current) {
        rootGroupRef.current.position.copy(session.spawnPoint);
      }

      if (controlsRef.current) {
        const targetY = session.spawnPoint.y + 0.95;
        controlsRef.current.target.set(session.spawnPoint.x, targetY, session.spawnPoint.z);
        cameraRef.current?.position.set(session.spawnPoint.x, targetY + 0.35, session.spawnPoint.z + 2.9);
        controlsRef.current.update();
      }

      setStatus(`背景地图 [${session.preset.name}] 加载成功！`);
    } catch (err: any) {
      console.error('[ModelViewer] 环境地图加载失败:', err);
      setStatus(`环境地图加载失败: ${err.message || err}`);
    }
  };

  // 5. 加载并播放指定动画
  const loadActionClip = (actionKey: string, suite?: WeaponActionSet) => {
    const mixer = mixerRef.current;
    if (!mixer) return;

    if (actionKey === 'tpose') {
      mixer.stopAllAction();
      currentActionRef.current = null;
      setStatus('当前姿势: T-Pose (静止基础骨架)');
      return;
    }

    const currentSuite = suite || WEAPON_SUITES.find(s => s.id === activeWeaponId);
    const animPath = actionKey.startsWith('lobby:')
      ? `${import.meta.env.BASE_URL}assets/lobby/animations/${actionKey.slice(6)}.json`
      : (currentSuite?.actions as any)?.[actionKey] || currentSuite?.actions?.idle;

    if (!animPath) {
      setStatus(`动作 [${actionKey}] 未配置资源文件`);
      return;
    }

    setStatus(`正在加载动作资源: ${ACTION_LABELS[actionKey] || actionKey}...`);

    fetch(animPath)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status} 资源不存在`);
        return res.json();
      })
      .then(data => {
        const boneIndices = new Map<string, number>();
        if (mainSkeletonRef.current) {
          mainSkeletonRef.current.bones.forEach((b: any, idx: number) => boneIndices.set(b.name, idx));
        }

        const clip = data.tracks?.[0]?.times
          ? THREE.AnimationClip.parse(data)
          : new THREE.AnimationClip(actionKey, data.duration ?? -1, (data.tracks || []).flatMap((track: any) => {
              if (boneIndices.size > 0 && !boneIndices.has(track.name)) return [];
              const positionTimes = track.positions.map((_: any, index: number) => index / data.fps);
              const rotationTimes = track.rotations.map((_: any, index: number) => index / data.fps);
              return [
                new THREE.VectorKeyframeTrack(`${track.name}.position`, positionTimes, track.positions.flat()),
                new THREE.QuaternionKeyframeTrack(`${track.name}.quaternion`, rotationTimes, track.rotations.flat())
              ];
            }));

        mixer.stopAllAction();
        const nextAction = mixer.clipAction(clip);
        nextAction.reset().play();
        nextAction.timeScale = 1;
        mixer.timeScale = isPlaying ? playbackSpeed : 0;
        currentActionRef.current = nextAction;
        setStatus(`播放中: ${ACTION_LABELS[actionKey] || actionKey} · 全身动作与武器同步正常`);
      })
      .catch(err => {
        console.warn('[ModelViewer] 动作加载失败:', err);
        setStatus(`动作加载失败: ${err.message || err}`);
      });
  };

  const handleAnimChange = (key: string) => {
    setActiveAnimKey(key);
    loadActionClip(key);
  };

  // 应用线框模式
  const applyWireframe = (enabled: boolean) => {
    if (!rootGroupRef.current) return;
    rootGroupRef.current.traverse((c: any) => {
      if (c.isMesh && c.material) {
        if (Array.isArray(c.material)) {
          c.material.forEach((m: any) => { m.wireframe = enabled; });
        } else {
          c.material.wireframe = enabled;
        }
      }
    });
  };

  useEffect(() => {
    applyWireframe(showWireframe);
  }, [showWireframe]);

  useEffect(() => {
    if (mixerRef.current) {
      mixerRef.current.timeScale = isPlaying ? playbackSpeed : 0;
    }
  }, [playbackSpeed, isPlaying]);

  useEffect(() => {
    if (skeletonHelperRef.current) skeletonHelperRef.current.visible = showSkeleton;
    if (axesHelperRef.current) axesHelperRef.current.visible = showAxes;
    if (gridHelperRef.current) gridHelperRef.current.visible = showGrid && selectedEnvMapId === 'none';
  }, [showSkeleton, showAxes, showGrid, selectedEnvMapId]);

  // 重置视角
  const handleResetCamera = () => {
    if (cameraRef.current && controlsRef.current) {
      const sp = envMapSessionRef.current?.spawnPoint || new THREE.Vector3(0, 0, 0);
      cameraRef.current.position.set(sp.x, sp.y + 1.3, sp.z + 2.9);
      controlsRef.current.target.set(sp.x, sp.y + 0.95, sp.z);
      controlsRef.current.update();
    }
  };

  const currentSuite = WEAPON_SUITES.find(s => s.id === activeWeaponId);
  const availableActionKeys = currentSuite ? Object.keys(currentSuite.actions) : ['idle'];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', backgroundColor: '#0f172a' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* 顶部标题与快速重置栏 */}
      <div style={{
        position: 'absolute', top: 16, left: 20,
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(10px)',
        border: '1px solid #334155',
        borderRadius: '10px',
        padding: '10px 18px',
        color: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        boxShadow: '0 8px 20px rgba(0,0,0,0.3)'
      }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: '#38bdf8' }}>
          🎮 CXBT 3D 模型与动作高保真查看器
        </div>
        <button
          onClick={handleResetCamera}
          style={{
            background: '#1e293b',
            color: '#38bdf8',
            border: '1px solid #0284c7',
            borderRadius: '6px',
            padding: '5px 12px',
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}>
          🎯 重置摄像机视角
        </button>
      </div>

      {/* 控制操作主面板 */}
      <div style={{
        position: 'absolute', top: 16, right: 20, 
        background: 'rgba(15, 23, 42, 0.94)', color: '#f8fafc',
        padding: '20px', borderRadius: '14px', 
        fontFamily: 'system-ui, -apple-system, sans-serif', width: '340px',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
        border: '1px solid #334155',
        backdropFilter: 'blur(12px)',
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto'
      }}>
        <h3 style={{ margin: '0 0 16px 0', borderBottom: '1px solid #334155', paddingBottom: '10px', color: '#38bdf8', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>🛠️ 角色与动画装配调试</span>
          <span style={{ fontSize: '11px', background: '#0284c7', color: 'white', padding: '2px 8px', borderRadius: '10px' }}>
            完整建模
          </span>
        </h3>

        {/* 1. 角色职业与性别选择 */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
            👤 角色职业与性别：
          </label>
          <select 
            style={{ width: '100%', padding: '8px 12px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
            value={selectedJobIdx} 
            onChange={e => {
              setSelectedJobIdx(Number(e.target.value));
              setSelectedHairIdx(0);
              setSelectedAvatarCardId('default');
            }}>
            {JOB_OPTIONS.map((job, idx) => (
              <option key={job.label} value={idx}>{job.label}</option>
            ))}
          </select>
        </div>

        {/* 1b. 157 款原版角色造型卡皮肤库 */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#f472b6' }}>
            🃏 157 款原版角色造型卡皮肤库：
          </label>
          <select
            value={selectedAvatarCardId}
            onChange={e => {
              setSelectedAvatarCardId(e.target.value);
              setSelectedHairIdx(0);
            }}
            style={{ width: '100%', padding: '8px 12px', background: '#0f172a', color: 'white', border: '1px solid #ec4899', borderRadius: '8px', fontSize: '13px', outline: 'none' }}>
            <option value="default">👤 默认职业基础造型</option>
            {lobbyAssets?.items
              .filter(item => item.category === 'avatars' && item.avatarCard)
              .map(item => (
                <option key={item.id} value={item.id}>
                  🃏 {item.name} ({item.id})
                </option>
              ))}
          </select>
        </div>

        {/* 2. 发型与头部变体选择 */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
            💇 发型 / 头部变体：
          </label>
          <div style={{ display: 'flex', gap: '6px' }}>
            {Array.from({ length: availableHairCount }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedHairIdx(idx)}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  background: selectedHairIdx === idx ? '#0284c7' : '#1e293b',
                  color: selectedHairIdx === idx ? 'white' : '#94a3b8',
                  border: `1px solid ${selectedHairIdx === idx ? '#38bdf8' : '#334155'}`,
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: selectedHairIdx === idx ? 600 : 400
                }}>
                样式 {idx + 1}
              </button>
            ))}
          </div>
        </div>

        {/* 3. 3D 背景环境地图切换 */}
        <div style={{ marginBottom: '14px', background: 'rgba(30, 41, 59, 0.6)', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#38bdf8' }}>
            🏞️ 3D 背景环境地图：
          </label>
          <select 
            style={{ width: '100%', padding: '8px 10px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
            value={selectedEnvMapId} 
            onChange={e => switchEnvMap(e.target.value)}>
            <option value="none">🌌 纯黑摄影棚背景 (默认)</option>
            {Array.from(new Set(MAP_PRESETS.filter(m => m.id !== 'flat').map(m => m.category))).map(cat => (
              <optgroup key={cat} label={`── ${cat} ──`}>
                {MAP_PRESETS.filter(m => m.id !== 'flat' && m.category === cat).map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* 4. 武器模型与挂点选择 */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
            🔫 14 类武器家族与动作套件：
          </label>
          <select 
            style={{ width: '100%', padding: '8px 12px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
            value={activeWeaponId} 
            onChange={e => {
              setActiveWeaponId(e.target.value);
              setSelectedWeaponSkinId('');
              const targetSuite = WEAPON_SUITES.find(s => s.id === e.target.value);
              if (targetSuite && !Object.keys(targetSuite.actions).includes(activeAnimKey)) {
                setActiveAnimKey('idle');
              }
            }}>
            <option value="none">🚫 无武器 (空手卸除)</option>
            {WEAPON_SUITES.map(w => (
              <option key={w.id} value={w.id}>
                {w.name} {w.parts ? `(${w.parts.length}部件)` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* 4b. 484 把原版武器全量模型库 */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#fbbf24' }}>
            ✨ 484 把原版武器全量模型库：
          </label>
          <select
            style={{ width: '100%', padding: '8px 12px', background: '#0f172a', color: 'white', border: '1px solid #f59e0b', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
            value={selectedWeaponSkinId}
            onChange={e => {
              const wid = e.target.value;
              setSelectedWeaponSkinId(wid);
              if (wid) {
                const matchedSuite = getWeaponActionSuite(wid);
                setActiveWeaponId(matchedSuite.id);
              }
            }}>
            <option value="">🔧 使用当前套件默认武器模型</option>
            {lobbyAssets && Object.values(lobbyAssets.weapons).map(w => (
              <option key={w.id} value={w.id}>
                {w.label} [{w.id}]
              </option>
            ))}
          </select>
          {currentSuite?.parts && (
            <div style={{ fontSize: '11px', color: '#38bdf8', marginTop: '6px', lineHeight: '1.4', background: 'rgba(56, 189, 248, 0.08)', padding: '6px 8px', borderRadius: '6px' }}>
              🎯 已装配骨骼: {(resolveActiveWeaponParts() ?? currentSuite.parts).map(p => `${p.model.split('/').pop()?.replace('.glb', '')} → ${p.bone}`).join(', ')}
            </div>
          )}
        </div>

        {/* 5. 动作切换与播放控制 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#cbd5e1' }}>
              🎬 播放动作姿态：
            </label>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              style={{
                background: isPlaying ? '#1e293b' : '#15803d',
                color: isPlaying ? '#94a3b8' : '#86efac',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '11px',
                cursor: 'pointer'
              }}>
              {isPlaying ? '⏸️ 暂停' : '▶️ 播放'}
            </button>
          </div>
          <select 
            style={{ width: '100%', padding: '8px 12px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
            value={activeAnimKey} 
            onChange={e => handleAnimChange(e.target.value)}>
            <option value="tpose">🧍 静止 (T-Pose 基础姿态)</option>
            <optgroup label="── 武器套件关联动作 ──">
              {availableActionKeys.map(key => (
                <option key={key} value={key}>
                  ▶️ {ACTION_LABELS[key] || key}
                </option>
              ))}
            </optgroup>
            <optgroup label="── 19 项社交表情动作 (Gestures) ──">
              {Array.from({ length: 19 }, (_, i) => i + 1).map(n => (
                <option key={`g-${n}`} value={`lobby:gesture-${n}`}>
                  🎭 社交动作 #{n} (gesture-{n})
                </option>
              ))}
            </optgroup>
            {/* 结算翻牌 3D 角色动作与换装间动作选项 (对应 public/assets/lobby/animations/card 与 avatar) */}
            <optgroup label="Card Poses (card_01..09)">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <option key={`cp-${n}`} value={`lobby:card/card_0${n}`}>
                  Card Flip #{n} (card/card_0{n})
                </option>
              ))}
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <option key={`ci-${n}`} value={`lobby:card/card_0${n}_pose`}>
                  Card Pose #{n} (card/card_0{n}_pose)
                </option>
              ))}
            </optgroup>
            <optgroup label="Avatar Room Poses (avatar/*)">
              {[
                'character_change',
                'coat',
                'pants',
                'shoesc',
                'hair',
                'gloves',
                'helmet',
                'beardb',
                'trinket',
                'trinket_coat',
                'danceb',
                'dancec',
                'wina',
                'losea',
                'standa',
                'standb',
                'ready',
                'chosea',
              ].map(animName => (
                <option key={`ap-${animName}`} value={`lobby:avatar/${animName}`}>
                  Avatar Room ({animName})
                </option>
              ))}
            </optgroup>
          </select>

          {/* 播放速度控制 */}
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>播放速率：</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[0.25, 0.5, 1.0, 1.5, 2.0].map(speed => (
                <button
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  style={{
                    padding: '3px 7px',
                    fontSize: '11px',
                    background: playbackSpeed === speed ? '#0284c7' : '#1e293b',
                    color: playbackSpeed === speed ? 'white' : '#94a3b8',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}>
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 6. 辅助视觉调试选项 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', fontSize: '12px', borderTop: '1px solid #334155', paddingTop: '14px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#cbd5e1' }}>
            <input type="checkbox" checked={showSkeleton} onChange={e => setShowSkeleton(e.target.checked)} style={{ marginRight: '10px' }}/>
            显示骨骼骨架线框 (Skeleton)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#cbd5e1' }}>
            <input type="checkbox" checked={showAxes} onChange={e => setShowAxes(e.target.checked)} style={{ marginRight: '10px' }}/>
            显示中心坐标轴 (Axes Helper)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#cbd5e1' }}>
            <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} style={{ marginRight: '10px' }}/>
            显示地平网格 (Ground Grid)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#cbd5e1' }}>
            <input type="checkbox" checked={showWireframe} onChange={e => setShowWireframe(e.target.checked)} style={{ marginRight: '10px' }}/>
            模型线框模式 (Wireframe)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#38bdf8', fontWeight: 600 }}>
            <input type="checkbox" checked={autoRotate} onChange={e => {
              setAutoRotate(e.target.checked);
              (window as any).__SANDBOX_AUTO_ROTATE = e.target.checked;
            }} style={{ marginRight: '10px' }}/>
            开启 360° 模型全景自转
          </label>
        </div>

        {/* 7. 状态日志 */}
        <div style={{ marginTop: '16px', fontSize: '12px', color: '#94a3b8', background: '#020617', padding: '10px 12px', borderRadius: '8px', border: '1px solid #1e293b' }}>
          <strong style={{ color: '#38bdf8' }}>实时状态：</strong> <br/>
          <span style={{ color: '#e2e8f0' }}>{status}</span>
        </div>
      </div>
    </div>
  );
}
