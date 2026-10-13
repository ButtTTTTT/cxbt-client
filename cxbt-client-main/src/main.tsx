import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// 生产打包防护与沙盒代码懒加载 (Code Splitting)
const AssetViewer = React.lazy(() => import('./features/cacheAssets/AssetViewer.tsx'));
const Sandbox = React.lazy(() => import('./sandbox/index'));

const path = location.pathname;
createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<div style={{ color: '#94a3b8', background: '#0f172a', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>模块加载中...</div>}>
    {path.endsWith('/assets-viewer') ? <AssetViewer /> : 
     path.endsWith('/sandbox') ? <Sandbox /> : 
     <App />}
  </Suspense>
);
