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

async function refreshAndReconnect() {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) {
    console.warn('[WebSocket] no refresh token available');
    return;
  }

  try {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';
    const res = await fetch(`${backendUrl}/globalcart/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    const data = await res.json();
    const { token: newToken, refreshToken: newRefreshToken } = data?.data || data || {};

    if (newToken) {
      localStorage.setItem('token', newToken);
      if (newRefreshToken) localStorage.setItem('refresh_token', newRefreshToken);
      console.log('[WebSocket] token refreshed, reconnecting...');
      connect();
    } else {
      console.warn('[WebSocket] refresh token failed');
    }
  } catch (e) {
    console.error('[WebSocket] refresh token error:', e);
  }
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

  ws.onclose = (event) => {
    console.log('[WebSocket] disconnected, code:', event.code);
    clearInterval(heartbeatTimer);
    if (stopped) return;

    // 1006: 异常关闭（token过期） / 1008: 策略违规（认证失败） → 刷新 token 后重连
    // 1000: 正常关闭 / 1001: 服务端关闭 → 直接重连不刷新
    if (event.code === 1006 || event.code === 1008) {
      refreshAndReconnect();
    } else {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
      reconnectAttempts++;
      reconnectTimer = setTimeout(connect, delay);
    }
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

export { connect, disconnect, on, off, send, refreshAndReconnect };
