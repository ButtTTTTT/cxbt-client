import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Vite 构建与开发服务器配置
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // 预构建核心三维与界面依赖，避免首次进入页面时动态瀑布流编译卡顿
    include: ['react', 'react-dom', 'three', 'three/examples/jsm/loaders/GLTFLoader.js'],
  },
  server: {
    host: '0.0.0.0', // 强制监听所有网卡，解决 localhost 拒绝连接的问题
    port: 3333,
    open: true,
    // 配置本地开发服务器反向代理，确保相对路径的接口与 WebSocket 请求能够正确转发至 Go 后端服务
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8081',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8081',
        ws: true,
      },
      '/webrtc': {
        target: 'ws://127.0.0.1:8081',
        ws: true,
      },
    },
    // 忽略海量静态资源与构建产物的 Chokidar 文件监听，消除 Node 进程高内存与磁盘 I/O 占满
    watch: {
      ignored: [
        '**/public/assets/**',
        '**/dist/**',
        '**/cxbt-resource/**',
        '**/AvatarStar/**',
        '**/UnPdeC/**',
      ],
    },
  },
  build: {
    // 分包优化大型 Three.js 引擎与 Lua 主数据配置表，降低首屏脚本解析开销
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'vendor-three';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('luaMasterData')) {
            return 'data-lua-master';
          }
        },
      },
    },
  },
})
