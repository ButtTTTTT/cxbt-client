import { useState } from 'react';
import ModelViewer from './modes/ModelViewer';
import CharacterController from './modes/CharacterController';
import MapEditor from './modes/MapEditor';

export default function SandboxApp() {
  const [activeMode, setActiveMode] = useState<'viewer' | 'controller' | 'editor'>('controller');
  const [playtestMapId, setPlaytestMapId] = useState<string | undefined>(undefined);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a' }}>
      {/* 顶部导航栏 */}
      <div style={{ 
        height: '60px', 
        backgroundColor: '#1e293b', 
        display: 'flex', 
        alignItems: 'center', 
        padding: '0 20px',
        borderBottom: '1px solid #334155',
        gap: '15px'
      }}>
        <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '18px', marginRight: '10px' }}>
          🧩 开发者沙盒
        </div>
        
        <button 
          id="tab-sandbox-viewer"
          onClick={() => setActiveMode('viewer')}
          style={{
            padding: '8px 16px',
            backgroundColor: activeMode === 'viewer' ? '#37f4d3' : 'transparent',
            color: activeMode === 'viewer' ? '#0f172a' : '#94a3b8',
            border: activeMode === 'viewer' ? 'none' : '1px solid #475569',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: activeMode === 'viewer' ? 'bold' : 'normal',
            transition: 'all 0.2s'
          }}>
          🛠️ 模型与动作查看器
        </button>

        <button 
          id="tab-sandbox-controller"
          onClick={() => setActiveMode('controller')}
          style={{
            padding: '8px 16px',
            backgroundColor: activeMode === 'controller' ? '#37f4d3' : 'transparent',
            color: activeMode === 'controller' ? '#0f172a' : '#94a3b8',
            border: activeMode === 'controller' ? 'none' : '1px solid #475569',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: activeMode === 'controller' ? 'bold' : 'normal',
            transition: 'all 0.2s'
          }}>
          🎮 跑跳行为与全武器技能沙盒
        </button>

        <button 
          id="tab-sandbox-map-editor"
          onClick={() => setActiveMode('editor')}
          style={{
            padding: '8px 16px',
            backgroundColor: activeMode === 'editor' ? '#37f4d3' : 'transparent',
            color: activeMode === 'editor' ? '#0f172a' : '#94a3b8',
            border: activeMode === 'editor' ? 'none' : '1px solid #475569',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: activeMode === 'editor' ? 'bold' : 'normal',
            transition: 'all 0.2s'
          }}>
          🗺️ 3D 地图与人物/怪物编辑器
        </button>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => { location.href = `${import.meta.env.BASE_URL}lobby`; }}
          style={{
            padding: '8px 16px',
            backgroundColor: '#0284c7',
            color: '#ffffff',
            border: '1px solid #38bdf8',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '13px',
            transition: 'all 0.2s'
          }}>
          🚀 进入正式游戏大厅
        </button>
      </div>

      {/* 模式渲染区 */}
      <div style={{ flex: 1, position: 'relative' }}>
        {activeMode === 'viewer' && <ModelViewer />}
        {activeMode === 'controller' && <CharacterController initialMapId={playtestMapId} />}
        {activeMode === 'editor' && (
          <MapEditor
            onPlaytestMap={(mapId) => {
              setPlaytestMapId(mapId);
              setActiveMode('controller');
            }}
          />
        )}
      </div>
    </div>
  );
}


