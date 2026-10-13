// 服务端 API 与 WebSocket 基础地址配置 (动态环境感知与生产部署自适应)
const isBrowser = typeof window !== 'undefined';
const protocol = isBrowser ? window.location.protocol : 'http:';
const hostname = isBrowser ? window.location.hostname : 'localhost';
const isHttps = protocol === 'https:';

export const API_BASE = 
  import.meta.env.VITE_API_BASE || 
  `${protocol}//${hostname}:8080/api`;

export const WS_BASE = 
  import.meta.env.VITE_WS_BASE || 
  `${isHttps ? 'wss:' : 'ws:'}//${hostname}:8080/ws`;
