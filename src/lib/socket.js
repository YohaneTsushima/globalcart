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

function getWsUrl() {
  const wsOrigin = import.meta.env.DEV
    ? window.location.origin
    : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080');
  const wsHost = wsOrigin.replace('http://', '').replace('https://', '');
  const protocol = wsOrigin.startsWith('https') ? 'wss:' : 'ws:';
  return `${protocol}//${wsHost}/globalcart/ws`;
}

// 单飞：并发调用共享同一个 Promise，避免多个入口同时用旧 refresh token 轮换
let refreshPromise = null;

function refreshTokens() {
  refreshPromise ??= (async () => {
    try {
      const refreshBase = import.meta.env.DEV ? '' : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080');
      const res = await fetch(`${refreshBase}/globalcart/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        console.warn('[WebSocket] refresh token failed, status:', res.status);
        return null;
      }
      const data = await res.json().catch(() => null);
      // const { token: newToken } = data?.data || data || {};
      // if (!newToken) return null;
      // return newToken;
      const token = data?.data?.token;
      return token || true;   // 有 token 返回 token，否则只要请求成功就算刷新成功
    } catch (e) {
      console.error('[WebSocket] refresh token error:', e);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function refreshAndReconnect() {
  const newToken = await refreshTokens();
  if (newToken) {
    console.log('[WebSocket] token refreshed, reconnecting...');
    connect();
  } else {
    // 刷新失败也要安排退避重连，避免 ws 静默死亡再也不恢复
    scheduleReconnect();
  }
}

// 指数退避重连（从原 onclose else 分支提取）
function scheduleReconnect() {
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts++;
  reconnectTimer = setTimeout(connect, delay);
}

// 供 base44Client 拦截器在刷新 token 后调用：只重连，不刷新 token
function reconnectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return; // 连接还活着，不动它
  }
  clearTimeout(reconnectTimer);
  connect();
}

function connect() {
  stopped = false;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  let url = getWsUrl();

  // 本地开发环境保留 ?token= 参数（后端 auth.cookie.enabled=false）
  if (import.meta.env.DEV) {
    const token = localStorage.getItem('token');
    if (token) url += `?token=${encodeURIComponent(token)}`;
  }

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
    ws = null; // 防止 CLOSING 状态下 connect() 误判跳过
    if (stopped) return;

    // 1008: 明确的认证失败 → 刷新 token 后重连
    if (event.code === 1008) {
      refreshAndReconnect();
      return;
    }

    // 其余情况（1000 正常关闭 / 1001 服务端关闭 / 1006 网络问题等）→ 退避重连
    scheduleReconnect();
  };

  ws.onerror = () => {
    console.warn('[WebSocket] backend not available, running without real-time');
    clearInterval(heartbeatTimer);
    clearTimeout(reconnectTimer);
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

export { connect, disconnect, on, off, send, reconnectWebSocket };
