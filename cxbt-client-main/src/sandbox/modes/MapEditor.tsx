import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  MAP_PRESETS,
  loadMapIntoScene,
  unloadMapFromScene,
  type LoadedMapSession,
  MapCollider,
  BotManager,
  WEAPON_SUITES,
  ACTION_LABELS,
  getSavedCustomMaps,
  saveCustomMap,
  deleteCustomMap,
  setActiveCustomMapId,
  buildCustomNodeObject3D,
  DEFAULT_CUSTOM_MAP,
  type CustomMapBlueprint,
  type CustomMapNode,
  type BlockShape,
  type MonsterTier,
  type BotBehaviorMode
} from '../../features/gameplay/engine';
import { CREATION_JOBS, assetUrl, type CreationJob } from '../../features/characterCreation/assets';
import { loadLobbyAssets, type LobbyAssets } from '../../features/lobby/assets';

interface MapEditorProps {
  onPlaytestMap?: (mapId: string) => void;
}

const BLOCK_PRESETS: { shape: BlockShape; label: string; color: string; scale: [number, number, number] }[] = [
  { shape: 'box', label: '🧱 合金高台 / 掩体墙 (Box)', color: '#334155', scale: [6, 2, 6] },
  { shape: 'ramp', label: '📐 战术登高斜坡 (Ramp)', color: '#0284c7', scale: [4, 2, 5] },
  { shape: 'crate', label: '📦 战地集装箱掩体 (Crate)', color: '#d97706', scale: [2.2, 2.0, 2.2] },
  { shape: 'barrier', label: '🛡️ 能量防爆护盾墙 (Barrier)', color: '#38bdf8', scale: [4.0, 1.6, 0.6] },
  { shape: 'cylinder', label: '🏛️ 巨型石柱 / 哨塔 (Cylinder)', color: '#64748b', scale: [2.2, 5.0, 2.2] },
  { shape: 'arch', label: '⛩️ 要塞凯旋拱门 (Arch)', color: '#475569', scale: [1.2, 1.2, 1.2] },
  { shape: 'jumpPad', label: '⚡ 高空弹跳装置 (JumpPad)', color: '#10b981', scale: [1.5, 1.0, 1.5] },
  { shape: 'spawnPoint', label: '🎯 玩家出生点信标 (Spawn)', color: '#38bdf8', scale: [1, 1, 1] },
];

export default function MapEditor({ onPlaytestMap }: MapEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('正在初始化 3D 地图、人物、动作与怪物编辑器...');
  const [lobbyAssets, setLobbyAssets] = useState<LobbyAssets | null>(null);
  const lobbyAssetsRef = useRef<LobbyAssets | null>(null);
  lobbyAssetsRef.current = lobbyAssets;

  // 自定义地图列表与当前编辑蓝图
  const [savedMaps, setSavedMaps] = useState<CustomMapBlueprint[]>(() => getSavedCustomMaps());
  const [blueprint, setBlueprint] = useState<CustomMapBlueprint>(() => getSavedCustomMaps()[0] || DEFAULT_CUSTOM_MAP);
  const blueprintRef = useRef<CustomMapBlueprint>(blueprint);
  blueprintRef.current = blueprint;

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    blueprint.nodes[0]?.id ?? null
  );
  const selectedNodeIdRef = useRef<string | null>(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;

  // 新增对象面板分类切换
  const [addTab, setAddTab] = useState<'block' | 'model' | 'character' | 'monster'>('block');

  // 新增建筑块表单状态
  const [newBlockShape, setNewBlockShape] = useState<BlockShape>('box');
  const [newBlockColor, setNewBlockColor] = useState<string>('#38bdf8');

  // 新增 3D 模型表单状态
  const [newModelWeaponId, setNewModelWeaponId] = useState<string>('smg_01');

  // 新增人物/怪物共用表单状态
  const [newEntityName, setNewEntityName] = useState<string>('自定义精英战士');
  const [newJobId, setNewJobId] = useState<CreationJob>('assassin');
  const [newGender, setNewGender] = useState<number>(0);
  const [newAvatarCardId, setNewAvatarCardId] = useState<string>('default');
  const [newWeaponId, setNewWeaponId] = useState<string>('smg_01');
  const [newActionKey, setNewActionKey] = useState<string>('idle');
  const [newAiMode, setNewAiMode] = useState<BotBehaviorMode>('chase');
  const [newMonsterTier, setNewMonsterTier] = useState<MonsterTier>('elite');
  const [newMaxHp, setNewMaxHp] = useState<number>(6000);
  const [newBodyScale, setNewBodyScale] = useState<number>(1.35);
  const [newDamageMult, setNewDamageMult] = useState<number>(1.5);
  const [newSpeedMult] = useState<number>(1.1);
  const [newAuraColor, setNewAuraColor] = useState<string>('#ef4444');

  // Three.js 核心引用
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);
  const colliderRef = useRef<MapCollider>(new MapCollider());
  const baseMapSessionRef = useRef<LoadedMapSession | null>(null);
  const botManagerRef = useRef<BotManager | null>(null);
  const customRootRef = useRef<any>(null);
  const selectionBoxRef = useRef<any>(null);
  const nodeObjectsMapRef = useRef<Map<string, any>>(new Map());

  // 加载大厅 484 武器与 157 造型卡资产
  useEffect(() => {
    const controller = new AbortController();
    loadLobbyAssets(controller.signal)
      .then(assets => {
        if (!controller.signal.aborted) setLobbyAssets(assets);
      })
      .catch(() => null);
    return () => controller.abort();
  }, []);

  // 初始化 3D 编辑器场景
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(blueprint.skyColor || '#0f172a');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 14, 24);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 1, 0);
    controlsRef.current = controls;

    // 灯光系统
    scene.add(new THREE.AmbientLight(0xffffff, 1.35));
    const hemi = new THREE.HemisphereLight(0xffffff, 0x334155, 1.2);
    hemi.position.set(0, 30, 0);
    scene.add(hemi);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
    dirLight.position.set(18, 32, 22);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const grid = new THREE.GridHelper(80, 80, 0x38bdf8, 0x1e293b);
    scene.add(grid);

    const customRoot = new THREE.Group();
    scene.add(customRoot);
    customRootRef.current = customRoot;

    const botManager = new BotManager(scene, {
      onStatus: msg => setStatus(msg)
    });
    botManagerRef.current = botManager;

    // 选中高亮框
    const boxHelper = new THREE.BoxHelper(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)), 0x37f4d3);
    boxHelper.visible = false;
    scene.add(boxHelper);
    selectionBoxRef.current = boxHelper;

    // 点击 3D 视口拾取节点
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const pickables: any[] = [];
      nodeObjectsMapRef.current.forEach(obj => pickables.push(obj));
      const hits = raycaster.intersectObjects(pickables, true);
      if (hits.length > 0) {
        let cur: any = hits[0].object;
        while (cur && !cur.userData?.customNodeId) {
          cur = cur.parent;
        }
        if (cur?.userData?.customNodeId) {
          setSelectedNodeId(cur.userData.customNodeId);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const clock = new THREE.Clock();
    let animId = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1);
      controls.update();

      // 更新编辑器内预览的 NPC 与怪物动画
      botManager.bots.forEach(b => {
        b.entity.update(delta);
      });

      // 模型展示架自转动画
      nodeObjectsMapRef.current.forEach(obj => {
        if (obj.userData?.customNodeKind === 'model') {
          obj.rotation.y += delta * 0.8;
        }
      });

      if (selectionBoxRef.current && selectedNodeIdRef.current) {
        const targetObj = nodeObjectsMapRef.current.get(selectedNodeIdRef.current);
        if (targetObj) {
          selectionBoxRef.current.setFromObject(targetObj);
          selectionBoxRef.current.visible = true;
        } else {
          selectionBoxRef.current.visible = false;
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      botManager.dispose();
      colliderRef.current.dispose();
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // 当底图 (baseMapId) 或天空颜色变化时加载底图
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.background = new THREE.Color(blueprint.skyColor || '#0f172a');

    let cancelled = false;
    if (baseMapSessionRef.current) {
      unloadMapFromScene(baseMapSessionRef.current, scene, colliderRef.current);
      baseMapSessionRef.current = null;
    }

    loadMapIntoScene(blueprint.baseMapId || 'flat', scene, colliderRef.current, msg => {
      if (!cancelled) setStatus(msg);
    }).then(session => {
      if (!cancelled) {
        baseMapSessionRef.current = session;
        scene.background = new THREE.Color(blueprint.skyColor || '#0f172a');
      }
    }).catch(err => {
      console.warn('[MapEditor] base map load error:', err);
    });

    return () => {
      cancelled = true;
    };
  }, [blueprint.baseMapId, blueprint.skyColor]);

  // 当蓝图节点列表变化时，同步重建 3D 场景中的节点与人物/怪物
  useEffect(() => {
    const customRoot = customRootRef.current;
    const botManager = botManagerRef.current;
    if (!customRoot || !botManager) return;

    let cancelled = false;

    const rebuildSceneNodes = async () => {
      // 清理旧节点
      while (customRoot.children.length > 0) {
        customRoot.remove(customRoot.children[0]);
      }
      botManager.clearAllBots();
      nodeObjectsMapRef.current.clear();

      for (const node of blueprint.nodes) {
        if (cancelled) return;

        if (node.kind === 'block' || node.kind === 'model') {
          const obj = await buildCustomNodeObject3D(node, lobbyAssets);
          if (cancelled) return;
          customRoot.add(obj);
          nodeObjectsMapRef.current.set(node.id, obj);
        } else if (node.kind === 'character' || node.kind === 'monster') {
          const cardItem = node.avatarCardId && node.avatarCardId !== 'default'
            ? lobbyAssets?.items.find(i => i.category === 'avatars' && i.id === node.avatarCardId)?.avatarCard
            : undefined;
          const wId = node.weaponId || 'smg_01';
          const lobbyWep = lobbyAssets?.weapons?.[wId];
          const weaponParts = lobbyWep
            ? lobbyWep.parts.map(p => ({
                model: assetUrl(p.model),
                texture: p.texture ? assetUrl(p.texture) : null,
                bone: p.bone
              }))
            : undefined;

          const spawned = await botManager.spawnBot({
            customName: node.name,
            mode: 'dummy', // 编辑器中保持原地播放所选动作，试玩/实战时激活 AI
            jobId: node.jobId || 'assassin',
            gender: node.gender ?? 0,
            preset: cardItem?.preset,
            weaponId: wId,
            weaponParts,
            maxHp: node.maxHp ?? 3200,
            bodyScale: node.bodyScale ?? 1.0,
            auraColor: node.auraColor || (node.kind === 'monster' ? '#ef4444' : '#38bdf8'),
            forcedAction: node.actionKey || 'idle',
            exactPosition: {
              x: node.position[0],
              y: node.position[1],
              z: node.position[2],
              yaw: node.rotation[1]
            },
            originPosition: new THREE.Vector3(node.position[0], node.position[1], node.position[2]),
            collisionEnv: colliderRef.current.toCollisionEnvironment()
          });

          if (spawned && !cancelled) {
            spawned.entity.modelGroup.userData = {
              customNodeId: node.id,
              customNodeKind: node.kind,
              customNode: node
            };
            nodeObjectsMapRef.current.set(node.id, spawned.entity.modelGroup);
          }
        }
      }
      if (!cancelled) {
        setStatus(`✅ 场景同步完成：共 ${blueprint.nodes.length} 个自定义节点（建筑/3D模型/NPC/怪物）`);
      }
    };

    void rebuildSceneNodes();
    return () => {
      cancelled = true;
    };
  }, [blueprint.id, blueprint.nodes.length, lobbyAssets]);

  // 实时更新单个选中节点的坐标/旋转/缩放/颜色，避免每次微调都重新加载 GLB
  const updateSelectedNode = (patch: Partial<CustomMapNode>, requireRebuild = false) => {
    if (!selectedNodeId) return;
    setBlueprint(prev => {
      const nextNodes = prev.nodes.map(n => {
        if (n.id !== selectedNodeId) return n;
        const updated = { ...n, ...patch };
        const obj = nodeObjectsMapRef.current.get(n.id);
        if (obj && !requireRebuild) {
          obj.position.set(updated.position[0], updated.position[1], updated.position[2]);
          obj.rotation.set(updated.rotation[0], updated.rotation[1], updated.rotation[2]);
          if (updated.kind === 'character' || updated.kind === 'monster') {
            const s = updated.bodyScale ?? updated.scale[0] ?? 1;
            obj.scale.setScalar(s);
          } else {
            obj.scale.set(updated.scale[0], updated.scale[1], updated.scale[2]);
          }
          if (patch.color && updated.kind === 'block') {
            obj.traverse((c: any) => {
              if (c.isMesh && c.material?.color) {
                c.material.color.set(patch.color);
              }
            });
          }
        }
        return updated;
      });
      return { ...prev, nodes: nextNodes };
    });

    if (requireRebuild) {
      // 触发完整节点重载
      setBlueprint(prev => ({ ...prev, nodes: [...prev.nodes] }));
    }
  };

  // 添加新节点
  const handleAddNode = async (kind: 'block' | 'model' | 'character' | 'monster') => {
    const id = `node_${kind}_${Date.now().toString(36)}`;
    // 默认摆放在摄像机视线正前方
    const target = controlsRef.current?.target || new THREE.Vector3(0, 0, 0);
    const px = Number(target.x.toFixed(1));
    const py = Math.max(0, Number(target.y.toFixed(1)));
    const pz = Number(target.z.toFixed(1));

    let newNode: CustomMapNode;
    if (kind === 'block') {
      const preset = BLOCK_PRESETS.find(b => b.shape === newBlockShape) || BLOCK_PRESETS[0];
      newNode = {
        id,
        name: `${preset.label.split(' ')[1] || '地形块'} #${blueprint.nodes.length + 1}`,
        kind: 'block',
        shape: newBlockShape,
        color: newBlockColor || preset.color,
        collidable: true,
        position: [px, py + preset.scale[1] / 2, pz],
        rotation: [0, 0, 0],
        scale: [...preset.scale]
      };
      if (newBlockShape === 'spawnPoint') {
        setBlueprint(prev => ({ ...prev, spawnPoint: [px, py, pz] }));
      }
    } else if (kind === 'model') {
      const wepLabel = lobbyAssets?.weapons[newModelWeaponId]?.label
        || WEAPON_SUITES.find(s => s.id === newModelWeaponId)?.name
        || newModelWeaponId;
      newNode = {
        id,
        name: `3D模型: ${wepLabel}`,
        kind: 'model',
        weaponId: newModelWeaponId,
        position: [px, py + 1.0, pz],
        rotation: [0, 0, 0],
        scale: [1.6, 1.6, 1.6]
      };
    } else if (kind === 'character') {
      newNode = {
        id,
        name: newEntityName || `NPC ${CREATION_JOBS[newJobId].name}`,
        kind: 'character',
        jobId: newJobId,
        gender: newGender,
        avatarCardId: newAvatarCardId,
        weaponId: newWeaponId,
        actionKey: newActionKey,
        aiMode: 'dummy',
        maxHp: 4000,
        bodyScale: 1.0,
        auraColor: '#38bdf8',
        position: [px, py, pz],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      };
    } else {
      const tierLabel = newMonsterTier === 'boss' ? '👹 BOSS' : newMonsterTier === 'elite' ? '⚡ 精英' : '👾 怪物';
      newNode = {
        id,
        name: `${tierLabel} · ${newEntityName || CREATION_JOBS[newJobId].name}`,
        kind: 'monster',
        monsterTier: newMonsterTier,
        jobId: newJobId,
        gender: newGender,
        avatarCardId: newAvatarCardId,
        weaponId: newWeaponId,
        actionKey: newActionKey,
        aiMode: newAiMode,
        maxHp: newMaxHp,
        bodyScale: newBodyScale,
        damageMultiplier: newDamageMult,
        speedMultiplier: newSpeedMult,
        auraColor: newAuraColor,
        position: [px, py, pz],
        rotation: [0, 0, 0],
        scale: [newBodyScale, newBodyScale, newBodyScale]
      };
    }

    const updatedBlueprint: CustomMapBlueprint = {
      ...blueprint,
      nodes: [...blueprint.nodes, newNode]
    };
    setBlueprint(updatedBlueprint);
    setSelectedNodeId(id);
    const list = saveCustomMap(updatedBlueprint);
    setSavedMaps(list);
    setStatus(`✨ 已添加 [${newNode.name}] 并自动保存！`);
  };

  // 复制当前选中节点
  const handleDuplicateSelected = () => {
    const current = blueprint.nodes.find(n => n.id === selectedNodeId);
    if (!current) return;
    const copyId = `node_${current.kind}_${Date.now().toString(36)}`;
    const copyNode: CustomMapNode = {
      ...current,
      id: copyId,
      name: `${current.name} (副本)`,
      position: [current.position[0] + 2.5, current.position[1], current.position[2] + 1.5]
    };
    const nextBp = { ...blueprint, nodes: [...blueprint.nodes, copyNode] };
    setBlueprint(nextBp);
    setSelectedNodeId(copyId);
    setSavedMaps(saveCustomMap(nextBp));
    setStatus(`📋 已复制节点: ${copyNode.name}`);
  };

  // 删除当前选中节点
  const handleDeleteSelected = () => {
    if (!selectedNodeId) return;
    const target = blueprint.nodes.find(n => n.id === selectedNodeId);
    const nextNodes = blueprint.nodes.filter(n => n.id !== selectedNodeId);
    const nextBp = { ...blueprint, nodes: nextNodes };
    setBlueprint(nextBp);
    setSelectedNodeId(nextNodes[0]?.id ?? null);
    setSavedMaps(saveCustomMap(nextBp));
    setStatus(`🗑️ 已移除节点: ${target?.name || selectedNodeId}`);
  };

  // 保存当前地图并同步到沙盒与正式游戏
  const handleSaveMap = () => {
    const list = saveCustomMap(blueprint);
    setSavedMaps(list);
    setActiveCustomMapId(blueprint.id);
    setStatus(`💾 地图 [${blueprint.name}] 已保存！已同步至【沙盒跑跳测试】与【正式游戏房间地图列表】！`);
  };

  // 新建空白自定义地图
  const handleCreateNewMap = () => {
    const id = `custom_map_${Date.now().toString(36)}`;
    const fresh: CustomMapBlueprint = {
      id,
      name: `🗺️ 自制战区 #${savedMaps.length + 1}`,
      description: '玩家在沙盒编辑器中自定义创作的 3D 地图',
      baseMapId: 'flat',
      skyColor: '#0f172a',
      spawnPoint: [0, 0, 8],
      updatedAt: Date.now(),
      nodes: [
        {
          id: 'node_base_floor',
          name: '主地面平台',
          kind: 'block',
          shape: 'box',
          color: '#1e293b',
          collidable: true,
          position: [0, -0.25, 0],
          rotation: [0, 0, 0],
          scale: [32, 0.5, 32]
        }
      ]
    };
    const list = saveCustomMap(fresh);
    setSavedMaps(list);
    setBlueprint(fresh);
    setSelectedNodeId(fresh.nodes[0].id);
    setStatus(`✨ 已创建全新自定义地图 [${fresh.name}]`);
  };

  // 导出 JSON
  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(blueprint, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${blueprint.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`📦 已导出地图 JSON 文件: ${blueprint.id}.json`);
  };

  const selectedNode = blueprint.nodes.find(n => n.id === selectedNodeId) || null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', userSelect: 'none' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* 顶部工具栏：地图管理、保存、实机试玩、导出 */}
      <div style={{
        position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(15, 23, 42, 0.95)', border: '1px solid #38bdf8',
        borderRadius: '12px', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '12px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', zIndex: 20,
        color: '#f8fafc', fontFamily: 'sans-serif'
      }}>
        <span style={{ fontWeight: 'bold', color: '#37f4d3', fontSize: '14px' }}>🗺️ 当前地图：</span>
        <select
          id="map-editor-select-blueprint"
          value={blueprint.id}
          onChange={e => {
            const found = savedMaps.find(m => m.id === e.target.value);
            if (found) {
              setBlueprint(found);
              setSelectedNodeId(found.nodes[0]?.id ?? null);
            }
          }}
          style={{ padding: '6px 10px', background: '#0f172a', color: '#fff', border: '1px solid #475569', borderRadius: '6px', fontSize: '12px' }}>
          {savedMaps.map(m => (
            <option key={m.id} value={m.id}>{m.name} ({m.nodes.length}节点)</option>
          ))}
        </select>

        <input
          value={blueprint.name}
          onChange={e => setBlueprint(prev => ({ ...prev, name: e.target.value }))}
          placeholder="输入自定义地图名称"
          style={{ padding: '6px 10px', background: '#0f172a', color: '#38bdf8', border: '1px solid #334155', borderRadius: '6px', fontSize: '12px', width: '190px', fontWeight: 'bold' }}
        />

        <button
          onClick={handleCreateNewMap}
          style={{ padding: '6px 12px', background: '#1e293b', color: '#38bdf8', border: '1px solid #0284c7', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
          ➕ 新建地图
        </button>

        <button
          id="btn-save-custom-map"
          onClick={handleSaveMap}
          style={{ padding: '6px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
          💾 保存并实装到游戏
        </button>

        <button
          id="btn-playtest-custom-map"
          onClick={() => {
            handleSaveMap();
            onPlaytestMap?.(blueprint.id);
          }}
          style={{ padding: '6px 14px', background: '#0284c7', color: '#fff', border: '1px solid #38bdf8', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
          ▶️ 立即实机跑跳/战斗试玩
        </button>

        <button
          onClick={handleExportJson}
          style={{ padding: '6px 10px', background: '#1e293b', color: '#cbd5e1', border: '1px solid #475569', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
          📦 导出 JSON
        </button>

        {savedMaps.length > 1 && blueprint.id !== DEFAULT_CUSTOM_MAP.id && (
          <button
            onClick={() => {
              const next = deleteCustomMap(blueprint.id);
              setSavedMaps(next);
              setBlueprint(next[0]);
            }}
            style={{ padding: '6px 10px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
            🗑️ 删除地图
          </button>
        )}
      </div>

      {/* 左侧面板：底图环境配置 + 4大类资产创建工作台 (地形/3D模型/人物动作/怪物BOSS) */}
      <div style={{
        position: 'absolute', top: 76, left: 20, width: '350px',
        maxHeight: 'calc(100vh - 96px)', overflowY: 'auto',
        background: 'rgba(15, 23, 42, 0.94)', color: '#f8fafc',
        padding: '16px', borderRadius: '12px', border: '1px solid #334155',
        boxShadow: '0 10px 25px rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)',
        fontFamily: 'sans-serif', zIndex: 15
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#37f4d3', fontSize: '15px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
          🏗️ 沙盒全量资产摆放工作台
        </h3>

        {/* 环境底图与天空颜色 */}
        <div style={{ marginBottom: '12px', background: '#0f172a', padding: '10px', borderRadius: '8px', border: '1px solid #1e293b' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>🏞️ 基础底图模版：</label>
              <select
                value={blueprint.baseMapId}
                onChange={e => setBlueprint(prev => ({ ...prev, baseMapId: e.target.value }))}
                style={{ width: '100%', padding: '5px', background: '#1e293b', color: '#fff', border: '1px solid #475569', borderRadius: '4px', fontSize: '12px' }}>
                {MAP_PRESETS.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>🌌 天空色调：</label>
              <input
                type="color"
                value={blueprint.skyColor || '#0f172a'}
                onChange={e => setBlueprint(prev => ({ ...prev, skyColor: e.target.value }))}
                style={{ width: '100%', height: '29px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
              />
            </div>
          </div>
        </div>

        {/* 4大类别切换标签 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginBottom: '12px' }}>
          {[
            { id: 'block', label: '🧱 地形块' },
            { id: 'model', label: '🔫 3D模型' },
            { id: 'character', label: '🧍 人物动作' },
            { id: 'monster', label: '👹 怪物BOSS' },
          ].map(tab => (
            <button
              key={tab.id}
              id={`tab-create-${tab.id}`}
              onClick={() => setAddTab(tab.id as any)}
              style={{
                padding: '7px 4px',
                fontSize: '11px',
                fontWeight: 'bold',
                borderRadius: '6px',
                cursor: 'pointer',
                border: addTab === tab.id ? '1px solid #38bdf8' : '1px solid #334155',
                background: addTab === tab.id ? '#0284c7' : '#1e293b',
                color: addTab === tab.id ? '#fff' : '#94a3b8'
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 1: 地形与建筑块 */}
        {addTab === 'block' && (
          <div style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid #334155', marginBottom: '14px' }}>
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>选择几何建筑/掩体类型：</label>
              <select
                value={newBlockShape}
                onChange={e => {
                  const shape = e.target.value as BlockShape;
                  setNewBlockShape(shape);
                  const found = BLOCK_PRESETS.find(b => b.shape === shape);
                  if (found) setNewBlockColor(found.color);
                }}
                style={{ width: '100%', padding: '7px', background: '#1e293b', color: '#fff', border: '1px solid #475569', borderRadius: '6px', fontSize: '12px' }}>
                {BLOCK_PRESETS.map(b => (
                  <option key={b.shape} value={b.shape}>{b.label}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: '#cbd5e1' }}>🎨 材质涂装颜色：</span>
              <input
                type="color"
                value={newBlockColor}
                onChange={e => setNewBlockColor(e.target.value)}
                style={{ width: '80px', height: '28px', border: 'none', cursor: 'pointer' }}
              />
            </div>
            <button
              id="btn-add-block"
              onClick={() => handleAddNode('block')}
              style={{ width: '100%', padding: '9px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
              ➕ 在场景中心放置该建筑模块
            </button>
          </div>
        )}

        {/* Tab 2: 484把 3D 武器与道具模型摆放 */}
        {addTab === 'model' && (
          <div style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid #334155', marginBottom: '14px' }}>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#fbbf24', marginBottom: '4px' }}>
                🔫 选择要摆放的 3D 武器/道具模型 (共 484 款)：
              </label>
              <select
                value={newModelWeaponId}
                onChange={e => setNewModelWeaponId(e.target.value)}
                style={{ width: '100%', padding: '7px', background: '#1e293b', color: '#fff', border: '1px solid #f59e0b', borderRadius: '6px', fontSize: '12px' }}>
                <optgroup label="── 14 大标准武器套件 ──">
                  {WEAPON_SUITES.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </optgroup>
                {lobbyAssets && (
                  <optgroup label="── 484 把原版武器全量模型库 ──">
                    {Object.values(lobbyAssets.weapons).map(w => (
                      <option key={w.id} value={w.id}>{w.label} [{w.id}]</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <button
              id="btn-add-model"
              onClick={() => handleAddNode('model')}
              style={{ width: '100%', padding: '9px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
              ➕ 在场景中放置 3D 全息模型展台
            </button>
          </div>
        )}

        {/* Tab 3 & Tab 4: 自定义人物动作 / 自定义怪物与BOSS */}
        {(addTab === 'character' || addTab === 'monster') && (
          <div style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid #334155', marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '3px' }}>
                {addTab === 'character' ? '🧍 角色/NPC 名称：' : '👹 怪物 / BOSS 名称：'}
              </label>
              <input
                value={newEntityName}
                onChange={e => setNewEntityName(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', background: '#1e293b', color: '#fff', border: '1px solid #475569', borderRadius: '5px', fontSize: '12px', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '6px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '3px' }}>职业骨架：</label>
                <select
                  value={newJobId}
                  onChange={e => setNewJobId(e.target.value as CreationJob)}
                  style={{ width: '100%', padding: '6px', background: '#1e293b', color: '#fff', border: '1px solid #475569', borderRadius: '5px', fontSize: '12px' }}>
                  {(Object.keys(CREATION_JOBS) as CreationJob[]).map(k => (
                    <option key={k} value={k}>{CREATION_JOBS[k].name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '3px' }}>性别：</label>
                <select
                  value={newGender}
                  onChange={e => setNewGender(Number(e.target.value))}
                  style={{ width: '100%', padding: '6px', background: '#1e293b', color: '#fff', border: '1px solid #475569', borderRadius: '5px', fontSize: '12px' }}>
                  <option value={0}>男</option>
                  <option value={1}>女</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#f472b6', marginBottom: '3px' }}>🃏 157 款角色造型卡外观皮肤：</label>
              <select
                value={newAvatarCardId}
                onChange={e => setNewAvatarCardId(e.target.value)}
                style={{ width: '100%', padding: '6px', background: '#1e293b', color: '#fff', border: '1px solid #ec4899', borderRadius: '5px', fontSize: '12px' }}>
                <option value="default">默认职业套装</option>
                {lobbyAssets?.items.filter(i => i.category === 'avatars' && i.avatarCard).map(i => (
                  <option key={i.id} value={i.id}>{i.name} ({i.id})</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#fbbf24', marginBottom: '3px' }}>🔫 手持 3D 武器装备 (484把)：</label>
              <select
                value={newWeaponId}
                onChange={e => setNewWeaponId(e.target.value)}
                style={{ width: '100%', padding: '6px', background: '#1e293b', color: '#fff', border: '1px solid #f59e0b', borderRadius: '5px', fontSize: '12px' }}>
                <optgroup label="── 14 类标准武器 ──">
                  {WEAPON_SUITES.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </optgroup>
                {lobbyAssets && (
                  <optgroup label="── 484 把原版武器 ──">
                    {Object.values(lobbyAssets.weapons).map(w => (
                      <option key={w.id} value={w.id}>{w.label} [{w.id}]</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#38bdf8', marginBottom: '3px' }}>🎬 默认循环动作姿态：</label>
              <select
                value={newActionKey}
                onChange={e => setNewActionKey(e.target.value)}
                style={{ width: '100%', padding: '6px', background: '#1e293b', color: '#fff', border: '1px solid #38bdf8', borderRadius: '5px', fontSize: '12px' }}>
                {Object.entries(ACTION_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label} ({k})</option>
                ))}
              </select>
            </div>

            {addTab === 'monster' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#fca5a5', marginBottom: '3px' }}>👹 怪物阶级：</label>
                    <select
                      value={newMonsterTier}
                      onChange={e => {
                        const tier = e.target.value as MonsterTier;
                        setNewMonsterTier(tier);
                        if (tier === 'boss') {
                          setNewMaxHp(15000);
                          setNewBodyScale(2.1);
                          setNewDamageMult(2.5);
                          setNewAuraColor('#ef4444');
                        } else if (tier === 'elite') {
                          setNewMaxHp(5000);
                          setNewBodyScale(1.3);
                          setNewDamageMult(1.5);
                          setNewAuraColor('#f59e0b');
                        } else {
                          setNewMaxHp(2400);
                          setNewBodyScale(1.0);
                          setNewDamageMult(1.0);
                          setNewAuraColor('#a855f7');
                        }
                      }}
                      style={{ width: '100%', padding: '6px', background: '#1e293b', color: '#fff', border: '1px solid #ef4444', borderRadius: '5px', fontSize: '12px' }}>
                      <option value="grunt">👾 普通怪物 (Grunt)</option>
                      <option value="elite">⚡ 精英卫兵 (Elite)</option>
                      <option value="boss">👹 巨型首领 (BOSS)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#fca5a5', marginBottom: '3px' }}>🧠 实战 AI 逻辑：</label>
                    <select
                      value={newAiMode}
                      onChange={e => setNewAiMode(e.target.value as BotBehaviorMode)}
                      style={{ width: '100%', padding: '6px', background: '#1e293b', color: '#fff', border: '1px solid #ef4444', borderRadius: '5px', fontSize: '12px' }}>
                      <option value="chase">⚔️ 主动追击猎杀</option>
                      <option value="patrol">🚶 领域巡逻警戒</option>
                      <option value="dummy">🧍 原地驻守</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8' }}>❤️ 血量(HP)：</label>
                    <input
                      type="number"
                      step={500}
                      min={100}
                      max={100000}
                      value={newMaxHp}
                      onChange={e => setNewMaxHp(Number(e.target.value))}
                      style={{ width: '100%', padding: '5px', background: '#1e293b', color: '#4ade80', border: '1px solid #475569', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8' }}>📏 体型倍率：</label>
                    <input
                      type="number"
                      step={0.1}
                      min={0.5}
                      max={3.5}
                      value={newBodyScale}
                      onChange={e => setNewBodyScale(Number(e.target.value))}
                      style={{ width: '100%', padding: '5px', background: '#1e293b', color: '#38bdf8', border: '1px solid #475569', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8' }}>💥 伤害倍率：</label>
                    <input
                      type="number"
                      step={0.2}
                      min={0.2}
                      max={10}
                      value={newDamageMult}
                      onChange={e => setNewDamageMult(Number(e.target.value))}
                      style={{ width: '100%', padding: '5px', background: '#1e293b', color: '#f87171', border: '1px solid #475569', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </>
            )}

            <button
              id={addTab === 'character' ? 'btn-add-character' : 'btn-add-monster'}
              onClick={() => handleAddNode(addTab)}
              style={{
                width: '100%', padding: '9px',
                background: addTab === 'monster' ? '#dc2626' : '#0284c7',
                color: '#fff', border: 'none', borderRadius: '6px',
                fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', marginTop: '4px'
              }}>
              {addTab === 'character' ? '➕ 在场景中心部署该自定义人物/NPC' : '➕ 在场景中心部署该自定义怪物/BOSS'}
            </button>
          </div>
        )}

        {/* 场景大纲列表 (Scene Hierarchy) */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
            <span>📋 场景对象层级大纲 ({blueprint.nodes.length})</span>
            <span style={{ fontSize: '11px', color: '#38bdf8' }}>点击可选中</span>
          </div>
          <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {blueprint.nodes.map(node => {
              const icon = node.kind === 'block' ? '🧱' : node.kind === 'model' ? '🔫' : node.kind === 'character' ? '🧍' : '👹';
              const active = node.id === selectedNodeId;
              return (
                <div
                  key={node.id}
                  onClick={() => {
                    setSelectedNodeId(node.id);
                    if (controlsRef.current) {
                      controlsRef.current.target.set(node.position[0], node.position[1] + 1, node.position[2]);
                    }
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: active ? 'rgba(2, 132, 199, 0.35)' : '#0f172a',
                    border: active ? '1px solid #38bdf8' : '1px solid #1e293b',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '12px'
                  }}>
                  <span style={{ color: active ? '#37f4d3' : '#e2e8f0', fontWeight: active ? 'bold' : 'normal' }}>
                    {icon} {node.name}
                  </span>
                  <span style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>
                    ({node.position[0]}, {node.position[1]}, {node.position[2]})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 右侧面板：选中对象的三维变换 (位置/旋转/缩放) 与人物动作/怪物属性检视器 (Inspector) */}
      <div style={{
        position: 'absolute', top: 76, right: 20, width: '330px',
        maxHeight: 'calc(100vh - 96px)', overflowY: 'auto',
        background: 'rgba(15, 23, 42, 0.94)', color: '#f8fafc',
        padding: '16px', borderRadius: '12px', border: '1px solid #334155',
        boxShadow: '0 10px 25px rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)',
        fontFamily: 'sans-serif', zIndex: 15
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#38bdf8', fontSize: '15px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
          🎛️ 选中对象三维属性检视器
        </h3>

        {selectedNode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '3px' }}>对象名称：</label>
              <input
                value={selectedNode.name}
                onChange={e => updateSelectedNode({ name: e.target.value })}
                style={{ width: '100%', padding: '6px 8px', background: '#0f172a', color: '#fff', border: '1px solid #475569', borderRadius: '5px', fontSize: '12px', boxSizing: 'border-box' }}
              />
            </div>

            {/* 位置坐标 X / Y / Z */}
            <div style={{ background: '#0f172a', padding: '10px', borderRadius: '8px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 'bold', marginBottom: '6px' }}>📍 三维空间坐标 (Position X / Y / Z)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
                  <div key={axis}>
                    <label style={{ fontSize: '10px', color: '#94a3b8' }}>{axis} 轴：</label>
                    <input
                      type="number"
                      step={0.5}
                      value={selectedNode.position[idx]}
                      onChange={e => {
                        const nextPos: [number, number, number] = [...selectedNode.position] as any;
                        nextPos[idx] = Number(e.target.value);
                        updateSelectedNode({ position: nextPos });
                      }}
                      style={{ width: '100%', padding: '5px', background: '#1e293b', color: '#fff', border: '1px solid #475569', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 旋转角度 Yaw */}
            <div style={{ background: '#0f172a', padding: '10px', borderRadius: '8px', border: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ color: '#f472b6', fontWeight: 'bold' }}>🔄 水平朝向角 (Yaw)：</span>
                <span>{Math.round((selectedNode.rotation[1] * 180) / Math.PI)}°</span>
              </div>
              <input
                type="range"
                min={-180}
                max={180}
                value={Math.round((selectedNode.rotation[1] * 180) / Math.PI)}
                onChange={e => {
                  const rad = (Number(e.target.value) * Math.PI) / 180;
                  updateSelectedNode({ rotation: [selectedNode.rotation[0], rad, selectedNode.rotation[2]] });
                }}
                style={{ width: '100%' }}
              />
            </div>

            {/* 尺寸缩放 Scale */}
            <div style={{ background: '#0f172a', padding: '10px', borderRadius: '8px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 'bold', marginBottom: '6px' }}>📐 三维尺寸缩放 (Scale W / H / D)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                {(['宽 X', '高 Y', '深 Z'] as const).map((label, idx) => (
                  <div key={label}>
                    <label style={{ fontSize: '10px', color: '#94a3b8' }}>{label}：</label>
                    <input
                      type="number"
                      step={0.2}
                      min={0.2}
                      max={100}
                      value={selectedNode.scale[idx]}
                      onChange={e => {
                        const val = Math.max(0.2, Number(e.target.value));
                        const nextScale: [number, number, number] = [...selectedNode.scale] as any;
                        nextScale[idx] = val;
                        updateSelectedNode({ scale: nextScale, bodyScale: selectedNode.kind === 'monster' ? val : selectedNode.bodyScale });
                      }}
                      style={{ width: '100%', padding: '5px', background: '#1e293b', color: '#fff', border: '1px solid #475569', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {selectedNode.kind === 'block' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f172a', padding: '8px 10px', borderRadius: '8px' }}>
                <span style={{ fontSize: '12px', color: '#cbd5e1' }}>🎨 建筑块颜色：</span>
                <input
                  type="color"
                  value={selectedNode.color || '#38bdf8'}
                  onChange={e => updateSelectedNode({ color: e.target.value })}
                  style={{ width: '70px', height: '26px', border: 'none', cursor: 'pointer' }}
                />
              </div>
            )}

            {(selectedNode.kind === 'character' || selectedNode.kind === 'monster') && (
              <div style={{ background: '#0f172a', padding: '10px', borderRadius: '8px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '12px', color: '#37f4d3', fontWeight: 'bold' }}>
                  {selectedNode.kind === 'monster' ? '👹 怪物 AI 与动作实时修改' : '🧍 人物动作与武装修改'}
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8' }}>🎬 切换播放动作：</label>
                  <select
                    value={selectedNode.actionKey || 'idle'}
                    onChange={e => updateSelectedNode({ actionKey: e.target.value }, true)}
                    style={{ width: '100%', padding: '5px', background: '#1e293b', color: '#fff', border: '1px solid #475569', borderRadius: '4px', fontSize: '12px', marginTop: '3px' }}>
                    {Object.entries(ACTION_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>{label} ({k})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8' }}>🧠 实战 AI 模式：</label>
                  <select
                    value={selectedNode.aiMode || 'chase'}
                    onChange={e => updateSelectedNode({ aiMode: e.target.value as BotBehaviorMode })}
                    style={{ width: '100%', padding: '5px', background: '#1e293b', color: '#fff', border: '1px solid #475569', borderRadius: '4px', fontSize: '12px', marginTop: '3px' }}>
                    <option value="chase">⚔️ 主动追击猎杀玩家</option>
                    <option value="patrol">🚶 区域巡逻守卫</option>
                    <option value="dummy">🧍 原地待机/表演动作</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div>
                    <label style={{ fontSize: '10px', color: '#94a3b8' }}>❤️ 最大生命值：</label>
                    <input
                      type="number"
                      step={500}
                      value={selectedNode.maxHp ?? 3200}
                      onChange={e => updateSelectedNode({ maxHp: Number(e.target.value) })}
                      style={{ width: '100%', padding: '4px', background: '#1e293b', color: '#4ade80', border: '1px solid #475569', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', color: '#94a3b8' }}>💥 伤害倍率：</label>
                    <input
                      type="number"
                      step={0.2}
                      value={selectedNode.damageMultiplier ?? 1.0}
                      onChange={e => updateSelectedNode({ damageMultiplier: Number(e.target.value) })}
                      style={{ width: '100%', padding: '4px', background: '#1e293b', color: '#f87171', border: '1px solid #475569', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
              <button
                onClick={handleDuplicateSelected}
                style={{ padding: '8px', background: '#1e293b', color: '#38bdf8', border: '1px solid #0284c7', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                📋 复制对象
              </button>
              <button
                onClick={handleDeleteSelected}
                style={{ padding: '8px', background: '#7f1d1d', color: '#fca5a5', border: '1px solid #ef4444', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                🗑️ 删除对象
              </button>
            </div>
          </div>
        ) : (
          <div style={{ color: '#64748b', fontSize: '12px', padding: '16px 0', textAlign: 'center' }}>
            请在左侧列表或 3D 场景中点击任意建筑、模型、人物或怪物以编辑其三维参数。
          </div>
        )}

        {/* 底部实时状态栏 */}
        <div style={{ marginTop: '14px', padding: '10px', background: '#020617', borderRadius: '8px', border: '1px solid #1e293b', fontSize: '12px' }}>
          <div style={{ color: '#38bdf8', fontWeight: 'bold', marginBottom: '3px' }}>📡 编辑器状态：</div>
          <div style={{ color: '#e2e8f0', lineHeight: 1.4 }}>{status}</div>
        </div>
      </div>
    </div>
  );
}
