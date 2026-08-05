/**
 * WebSocket 连接管理器（单例模式）
 * 全局一个连接，所有页面共享，通过事件分发
 */

let ws = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let reconnectAttempts = 0;
let stopped = false;
const MAX_RECONNECT_DELAY = 30000;
const HEARTBEAT_INTERVAL = 30000;
const listeners = new Map();

function getToken() {
  return localStorage.getItem('token');
}

function getWsUrl() {
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';
  const wsHost = backendUrl.replace('http://', '').replace('https://', '');
  const protocol = backendUrl.startsWith('https') ? 'wss:' : 'ws:';
  return `${protocol}//${wsHost}/globalcart/ws`;
}

function connect() {
  stopped = false;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const token = getToken();
  if (!token) return;

  const url = `${getWsUrl()}?token=${encodeURIComponent(token)}`;

  try {
    ws = new WebSocket(url);
  } catch (e) {
    console.warn('[WebSocket] not available yet');
    return;
  }

  ws.onopen = () => {
    console.log('[WebSocket] connected');
    reconnectAttempts = 0;
    stopped = false;
    heartbeatTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, HEARTBEAT_INTERVAL);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'pong') return;
      const fns = listeners.get(msg.type);
      if (fns) fns.forEach(fn => fn(msg.data));
    } catch (e) {
      console.error('[WebSocket] parse error:', e);
    }
  };

  ws.onclose = () => {
    console.log('[WebSocket] disconnected');
    clearInterval(heartbeatTimer);
    if (stopped) return;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
    reconnectAttempts++;
    reconnectTimer = setTimeout(connect, delay);
  };

  ws.onerror = () => {
    console.warn('[WebSocket] backend not available, running without real-time');
    clearInterval(heartbeatTimer);
    clearTimeout(reconnectTimer);
    ws = null;
  };
}

function disconnect() {
  stopped = true;
  clearTimeout(reconnectTimer);
  clearInterval(heartbeatTimer);
  reconnectAttempts = 0;
  if (ws) {
    ws.close();
    ws = null;
  }
}

function on(event, callback) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(callback);
}

function off(event, callback) {
  const fns = listeners.get(event);
  if (fns) fns.delete(callback);
}

function send(type, data = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}

export { connect, disconnect, on, off, send };
