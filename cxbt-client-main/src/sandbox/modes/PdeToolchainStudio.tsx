import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  PDE_CRC_KEY,
  PDE_NATIVE_ANIM_FPS,
  buildThreeGeometryFromPdeMesh,
  calculateActualPdeOffset,
  calculatePdeCrc,
  decodePdeCacheBuffer,
  fastXorBlock,
  parsePdeAnimationBinary,
  parsePdeMeshBinary,
  parsePdeSceneLuaScript,
  parsePdeSkeletonBinary,
  type PdeParsedSceneScript,
} from '../../features/gameplay/engine';

const SAMPLE_SCENE_SCRIPTS: Record<string, string> = {
  level1: `-- AvatarStar Original Level 1 (夺宝大厅) script.lua
AddMapName("level1")
SetSkyBox("sky/level02_sky.dds")
SetCameraPosition(0.958793, 21.841459, -31.897566)
SetCameraTarget(0.876878, 21.147694, -31.147694)
SetSunDirection(-0.514496, -0.685994, 0.514496)
SetAmbientLight(0.45, 0.48, 0.55, 1.0)
SetDirectionalLight(0.95, 0.92, 0.85, 1.0)
SetHoldPointMesh("level/level1/holdpoint.mesh", "0.0, 0.5, 0.0", "0.0, 0.0, 0.0")
AddGate("gate_red_01", "level/level1/gate01.mesh", "", "-18.5, 1.2, -24.0, 0, 0, 0, 1, 1, 1")
AddGate("gate_blue_01", "level/level1/gate02.mesh", "", "18.5, 1.2, 24.0, 0, 180, 0, 1, 1, 1")
AddActiveObject("leibao", "level/common/bombsite_a.mesh")
AddActiveObject("baoxiang", "level/common/treasure_box.mesh")
AddSoundElement("sound/ambient_wind.wav", 0.0, 5.0, 0.0)`,
  level2: `-- AvatarStar Original Level 2 (铃兰岛) script.lua
AddMapName("level2")
SetSkyBox("sky/level02_sky.dds")
SetCameraPosition(-1.588047, 36.634563, -72.909637)
SetCameraTarget(-1.531214, 36.120411, -72.052811)
SetSunDirection(0.42, -0.78, 0.46)
SetHoldPointMesh("level/level2/holdpoint.mesh", "0.0, 1.8, -6.0", "0.0, 0.0, 0.0")
AddGate("gate_island_a", "level/level2/gate_a.mesh", "", "-22.0, 2.0, -35.0, 0, 0, 0, 1, 1, 1")
AddGate("gate_island_b", "level/level2/gate_b.mesh", "", "22.0, 2.0, 25.0, 0, 180, 0, 1, 1, 1")
AddActiveObject("flag_red", "level/common/flag_red.mesh")
AddActiveObject("flag_blue", "level/common/flag_blue.mesh")`,
  level10001: `-- AvatarStar Expedition Boss Stage (远征：暴走机甲核心) script.lua
AddMapName("level10001")
SetSkyBox("sky/boss_arena_sky.dds")
SetCameraPosition(0.0, 18.5, -42.0)
SetCameraTarget(0.0, 8.0, 0.0)
SetSunDirection(-0.3, -0.85, 0.4)
SetHoldPointMesh("level/level10001/boss_core.mesh", "0.0, 0.0, 12.0", "0.0, 0.0, 0.0")
AddActiveObject("boss_spawner", "character/boss/boss_01_01.mesh")
AddSoundElement("sound/boss_alarm.wav", 0.0, 10.0, 12.0)`,
};

export const PdeToolchainStudio: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const previewGroupRef = useRef<any>(null);

  // UnPdeC: CRC32 & OffsetCalc state
  const [crcInput, setCrcInput] = useState('character/guardian/body.mesh');
  const [rawBlockHex, setRawBlockHex] = useState('0x00001A40');
  const [xorKeyHex, setXorKeyHex] = useState('5A 3C 9F E1');

  // pdestudio / PDEModelTools: Lua parser state
  const [selectedPreset, setSelectedPreset] = useState<string>('level1');
  const [luaText, setLuaText] = useState<string>(SAMPLE_SCENE_SCRIPTS.level1);
  const [parsedScene, setParsedScene] = useState<PdeParsedSceneScript>(() =>
    parsePdeSceneLuaScript(SAMPLE_SCENE_SCRIPTS.level1)
  );

  // Binary file inspector state (.cache / .mesh / .skel / .anim)
  const [binaryLog, setBinaryLog] = useState<string[]>([
    `[PDE Toolchain Ready] CRC_KEY ("crc_key") = 0x${PDE_CRC_KEY.toString(16).toUpperCase()}`,
    `[pdestudio] Native .anim frame rate = ${PDE_NATIVE_ANIM_FPS} FPS (Animation.cpp:1346)`,
    `[PDEModelTools] Supported binary magic: .mesh (0x0100), .skel (0x0600), .anim (0x0500), .cache (pack_ver=2)`,
    `[UnPdeC] Offset formula: ((raw >> 10) + raw + 1) << 12`,
  ]);

  const [serverSummary, setServerSummary] = useState<any>(null);

  useEffect(() => {
    fetch('/api/pde/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setServerSummary(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setParsedScene(parsePdeSceneLuaScript(luaText));
  }, [luaText]);

  // Initialize Three.js 3D Inspector Viewport
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1322);
    scene.fog = new THREE.FogExp2(0x0d1322, 0.012);

    const camera = new THREE.PerspectiveCamera(
      55,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      500
    );
    camera.position.set(18, 16, 24);
    camera.lookAt(0, 2, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xfff4d6, 1.35);
    dir.position.set(20, 35, 25);
    scene.add(dir);

    const grid = new THREE.GridHelper(60, 30, 0x3b82f6, 0x1e293b);
    scene.add(grid);

    const previewGroup = new THREE.Group();
    scene.add(previewGroup);
    previewGroupRef.current = previewGroup;

    let frameId = 0;
    let angle = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      angle += 0.004;
      camera.position.x = Math.cos(angle) * 26;
      camera.position.z = Math.sin(angle) * 26;
      camera.lookAt(0, 2, 0);
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      camera.aspect = Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  // Sync parsed Lua scene markers to 3D viewport
  useEffect(() => {
    const group = previewGroupRef.current;
    if (!group) return;
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    // HoldPoint Ring
    if (parsedScene.holdPointMesh) {
      const [hx, hy, hz] = parsedScene.holdPointMesh.position;
      const ringGeo = new THREE.TorusGeometry(4.2, 0.22, 16, 48);
      ringGeo.rotateX(Math.PI / 2);
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 0.7,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(hx, hy + 0.2, hz);
      group.add(ring);
    }

    // Gates
    parsedScene.gates.forEach((g, idx) => {
      const gateGeo = new THREE.BoxGeometry(3.6, 3.2, 0.6);
      const isRed = g.name.toLowerCase().includes('red') || idx % 2 === 0;
      const gateMat = new THREE.MeshStandardMaterial({
        color: isRed ? 0xef4444 : 0x3b82f6,
        metalness: 0.4,
        roughness: 0.3,
      });
      const mesh = new THREE.Mesh(gateGeo, gateMat);
      mesh.position.set(g.position[0] * 0.4, g.position[1] + 1.6, g.position[2] * 0.4);
      group.add(mesh);
    });
  }, [parsedScene]);

  const handleBinaryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const logs: string[] = [`=== 载入二进制文件: ${file.name} (${buf.byteLength} bytes) ===`];

    const cacheInfo = decodePdeCacheBuffer(buf);
    if (cacheInfo.validHeader) {
      logs.push(
        `[.cache 解包成功] pack_ver=${cacheInfo.packVer}, 解压后大小=${cacheInfo.decompressedSize}B, HeaderCRC=0x${cacheInfo.headerCrc.toString(16).toUpperCase()}, 计算CRC=0x${cacheInfo.computedCrc.toString(16).toUpperCase()} (${cacheInfo.crcMatched ? '校验通过' : 'CRC不匹配'})`
      );
    } else {
      logs.push(`[.cache 检测] 非压缩 .cache 封装头，按原始 PDE 二进制流解析`);
    }

    const payload = cacheInfo.validHeader ? cacheInfo.payload : new Uint8Array(buf);
    if (payload.byteLength >= 4) {
      const magic = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(0, true);
      logs.push(`[PDE Magic] 0x${magic.toString(16).toUpperCase()}`);

      try {
        if (magic === 0x0100) {
          const meshData = parsePdeMeshBinary(payload);
          logs.push(
            `[.mesh 解析成功] 类型=${meshData.meshType}, 顶点数=${meshData.vertexCount}, 三角面=${meshData.faceCount}, 材质数=${meshData.materials.length}`
          );
          meshData.materials.forEach((m, i) => {
            logs.push(`  材质[${i}]: ${m.name} | Shader=${m.shaderPath} | 贴图数=${m.textures.length}`);
          });

          if (previewGroupRef.current) {
            const geom = buildThreeGeometryFromPdeMesh(meshData);
            const mat = new THREE.MeshStandardMaterial({
              color: 0x38bdf8,
              metalness: 0.25,
              roughness: 0.45,
              wireframe: false,
            });
            const threeMesh = new THREE.Mesh(geom, mat);
            previewGroupRef.current.clear();
            previewGroupRef.current.add(threeMesh);
          }
        } else if (magic === 0x0600) {
          const skelData = parsePdeSkeletonBinary(payload);
          logs.push(`[.skel 骨骼解析成功] 骨骼总数=${skelData.jointCount}`);
          skelData.joints.slice(0, 12).forEach((j) => {
            logs.push(
              `  Bone[${j.index}] "${j.name}" (parent=${j.parentId}) pos=(${j.translation.map((n) => n.toFixed(2)).join(', ')})`
            );
          });
        } else if (magic === 0x0500) {
          const animData = parsePdeAnimationBinary(payload);
          logs.push(
            `[.anim 动画解析成功] 骨骼通道=${animData.jointCount}, 帧数=${animData.frameCount}, 原生帧率=${animData.fps} FPS, 时长=${animData.duration.toFixed(3)}s`
          );
        } else {
          // Try as UTF-8 Lua/text
          const textPreview = new TextDecoder('utf-8', { fatal: false }).decode(payload.subarray(0, 400));
          logs.push(`[文本预览前 400 字节]:\n${textPreview}`);
        }
      } catch (err: any) {
        logs.push(`[解析异常]: ${err?.message || String(err)}`);
      }
    }

    setBinaryLog((prev) => [...logs, ...prev]);
  };

  // Compute live CRC & Offset values
  const liveRawCrc = calculatePdeCrc(crcInput);
  const liveCacheHeaderCrc = (liveRawCrc ^ PDE_CRC_KEY) >>> 0;
  const parsedRawBlock = parseInt(rawBlockHex.replace(/^0x/i, ''), 16) || 0;
  const liveActualOffset = calculateActualPdeOffset(parsedRawBlock);

  const xorPreview = (() => {
    const keyBytes = new Uint8Array(
      xorKeyHex
        .trim()
        .split(/\s+/)
        .map((h) => parseInt(h, 16) || 0)
    );
    const sample = new TextEncoder().encode(crcInput.slice(0, 16));
    const encrypted = fastXorBlock(sample, keyBytes);
    return Array.from(encrypted)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
  })();

  return (
    <div
      id="pde-toolchain-studio"
      style={{
        display: 'grid',
        gridTemplateColumns: '430px 1fr 380px',
        height: '100%',
        background: '#090d16',
        color: '#e2e8f0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Left Column: UnPdeC + DevTools Binary Decoder */}
      <div
        style={{
          padding: '16px',
          borderRight: '1px solid #1e293b',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            padding: '14px',
            borderRadius: '10px',
            border: '1px solid #334155',
          }}
        >
          <h3 style={{ margin: '0 0 6px 0', color: '#38bdf8', fontSize: '16px' }}>
            🛠️ PDE 引擎四大逆向工具链工作台
          </h3>
          <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
            已完整集成 <code>pdestudio</code>、<code>PDEModelTools</code>、<code>UnPdeC</code> 与{' '}
            <code>DevTools/UnCacheGui</code> 全部算法与解析管线。
          </div>
          {serverSummary && (
            <div
              style={{
                marginTop: '8px',
                padding: '8px',
                background: '#090d16',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#a7f3d0',
              }}
            >
              服务端工具链状态: 在线 | 已同步地图 {serverSummary.mapCount} 张 | 原生帧率 {serverSummary.nativeAnimFps} FPS
            </div>
          )}
        </div>

        {/* UnPdeC: VerifyCRC & OffsetCalc & FastXOR */}
        <div
          style={{
            background: '#111827',
            padding: '14px',
            borderRadius: '10px',
            border: '1px solid #1f2937',
          }}
        >
          <div style={{ fontWeight: 'bold', color: '#f59e0b', marginBottom: '10px', fontSize: '14px' }}>
            🔐 UnPdeC: VerifyCRC / OffsetCalc / FastXOR
          </div>

          <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
            资源路径 / 字符串 (计算 PDE 专用 CRC32):
          </label>
          <input
            value={crcInput}
            onChange={(e) => setCrcInput(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 10px',
              background: '#090d16',
              border: '1px solid #334155',
              color: '#f8fafc',
              borderRadius: '6px',
              marginBottom: '8px',
              fontFamily: 'monospace',
            }}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              fontSize: '12px',
              background: '#090d16',
              padding: '8px',
              borderRadius: '6px',
              marginBottom: '10px',
              fontFamily: 'monospace',
            }}
          >
            <div>
              <span style={{ color: '#64748b' }}>Raw CRC32:</span>
              <div style={{ color: '#38bdf8', fontWeight: 'bold' }}>
                0x{liveRawCrc.toString(16).toUpperCase().padStart(8, '0')}
              </div>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>.cache Header CRC:</span>
              <div style={{ color: '#34d399', fontWeight: 'bold' }}>
                0x{liveCacheHeaderCrc.toString(16).toUpperCase().padStart(8, '0')}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8' }}>Raw Block Offset (Hex):</label>
              <input
                value={rawBlockHex}
                onChange={(e) => setRawBlockHex(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  background: '#090d16',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8' }}>Actual .pde Offset:</label>
              <div
                style={{
                  padding: '6px 8px',
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  color: '#fbbf24',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                }}
              >
                0x{liveActualOffset.toString(16).toUpperCase()}
              </div>
            </div>
          </div>

          <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
            FastXOR Key (Hex) & 前16字节异或输出:
          </label>
          <input
            value={xorKeyHex}
            onChange={(e) => setXorKeyHex(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              background: '#090d16',
              border: '1px solid #334155',
              color: '#f8fafc',
              borderRadius: '6px',
              fontFamily: 'monospace',
              marginBottom: '6px',
            }}
          />
          <div
            style={{
              fontSize: '11px',
              fontFamily: 'monospace',
              color: '#a78bfa',
              background: '#090d16',
              padding: '6px 8px',
              borderRadius: '6px',
              wordBreak: 'break-all',
            }}
          >
            {xorPreview}
          </div>
        </div>

        {/* DevTools / UnCacheGui + pdestudio Binary Loader */}
        <div
          style={{
            background: '#111827',
            padding: '14px',
            borderRadius: '10px',
            border: '1px solid #1f2937',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ fontWeight: 'bold', color: '#34d399', marginBottom: '8px', fontSize: '14px' }}>
            📦 UnCacheGui & Binary 解包器 (.cache / .mesh / .skel / .anim)
          </div>
          <input
            type="file"
            accept=".cache,.mesh,.skel,.anim,.lua"
            onChange={handleBinaryUpload}
            style={{
              marginBottom: '10px',
              fontSize: '12px',
              color: '#cbd5e1',
            }}
          />
          <div
            style={{
              flex: 1,
              background: '#050811',
              border: '1px solid #1e293b',
              borderRadius: '6px',
              padding: '10px',
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#93c5fd',
              overflowY: 'auto',
              maxHeight: '240px',
              whiteSpace: 'pre-wrap',
            }}
          >
            {binaryLog.join('\n')}
          </div>
        </div>
      </div>

      {/* Center Column: 3D Scene & Mesh Preview */}
      <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div
          style={{
            padding: '10px 16px',
            background: '#0f172a',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: '14px' }}>
            🌐 PDE 场景实体与 .mesh 网格实时 3D 视口
          </span>
          <span style={{ fontSize: '12px', color: '#38bdf8' }}>
            黄环 = HoldPoint (占点核心) | 红/蓝立方 = AddGate 门体实体
          </span>
        </div>
        <div ref={mountRef} style={{ flex: 1, width: '100%', minHeight: '420px' }} />
      </div>

      {/* Right Column: pdestudio & PDEModelTools Lua Scene Parser */}
      <div
        style={{
          padding: '16px',
          borderLeft: '1px solid #1e293b',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ fontWeight: 'bold', color: '#a78bfa', fontSize: '14px' }}>
          📜 pdestudio / PDEModelTools: 关卡 script.lua 解析器
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {Object.keys(SAMPLE_SCENE_SCRIPTS).map((key) => (
            <button
              key={key}
              onClick={() => {
                setSelectedPreset(key);
                setLuaText(SAMPLE_SCENE_SCRIPTS[key]);
              }}
              style={{
                flex: 1,
                padding: '6px 8px',
                background: selectedPreset === key ? '#2563eb' : '#1e293b',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            >
              {key}
            </button>
          ))}
        </div>

        <textarea
          value={luaText}
          onChange={(e) => setLuaText(e.target.value)}
          style={{
            width: '100%',
            height: '200px',
            background: '#050811',
            color: '#a7f3d0',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '10px',
            fontFamily: 'monospace',
            fontSize: '11px',
            resize: 'vertical',
          }}
        />

        <div
          style={{
            background: '#111827',
            border: '1px solid #1f2937',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ fontWeight: 'bold', color: '#38bdf8', marginBottom: '4px' }}>
            解析结果 (PdeParsedSceneScript)
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>地图标识 (AddMapName): </span>
            <strong style={{ color: '#f8fafc' }}>{parsedScene.mapName || '未指定'}</strong>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>天空盒 (SetSkyBox): </span>
            <code style={{ color: '#fbbf24' }}>{parsedScene.skyBox || '默认'}</code>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>俯瞰相机 (SetCameraPosition): </span>
            <code style={{ color: '#cbd5e1' }}>
              {parsedScene.cameraPosition ? parsedScene.cameraPosition.map((n) => n.toFixed(2)).join(', ') : '无'}
            </code>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>太阳方向 (SetSunDirection): </span>
            <code style={{ color: '#cbd5e1' }}>
              {parsedScene.sunDirection ? parsedScene.sunDirection.map((n) => n.toFixed(2)).join(', ') : '默认'}
            </code>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>占点核心 (SetHoldPointMesh): </span>
            <code style={{ color: '#34d399' }}>
              {parsedScene.holdPointMesh
                ? `${parsedScene.holdPointMesh.mesh} @ (${parsedScene.holdPointMesh.position.join(', ')})`
                : '无'}
            </code>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>门体实体 (AddGate): </span>
            <strong style={{ color: '#f87171' }}>{parsedScene.gates.length} 个</strong>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>交互物件 (AddActiveObject): </span>
            <strong style={{ color: '#60a5fa' }}>
              {parsedScene.activeObjects.map((a) => a.type).join(', ') || '无'}
            </strong>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>环境音源 (AddSoundElement): </span>
            <strong>{parsedScene.soundElements.length} 处</strong>
          </div>
        </div>
      </div>
    </div>
  );
};
