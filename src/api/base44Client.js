import axios from 'axios';
import { t, getLocale } from "@/lib/i18n";

// 后端地址写环境变量
const api = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json'
  }
})

// ── Token 刷新并发锁 ────────────────────────────────────────────────────────
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    error ? reject(error) : resolve(token);
  });
  failedQueue = [];
};

// ── 请求拦截：自动带 access_token ─────────────────────────────────────────────
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// ── 响应拦截：401 自动 refresh → 重试 ─────────────────────────────────────────
api.interceptors.response.use(
  res => res,
  async err => {
    const status = err?.response?.status;
    const originalRequest = err?.config;

    // 502/503/504 直接跳登录
    if ([502, 503, 504].includes(status)) {
      const path = window.location.pathname;
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('auth_cache');
      if (!path.includes('/Login')) {
        const next = encodeURIComponent(path + window.location.search);
        window.location.href = `/${path.split('/')[1] || 'zhcn'}/Login?next=${next}`;
      }
      return Promise.reject(err);
    }

    // 非 401 直接拒绝
    if (status !== 401) return Promise.reject(err);

    // 如果是 refresh 接口本身 401，直接清 token 跳登录
    if (originalRequest?.url?.includes('/auth/refresh')) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('token');
      localStorage.removeItem('auth_cache');
      const path = window.location.pathname;
      if (!path.includes('/Login')) {
        const next = encodeURIComponent(path + window.location.search);
        window.location.href = `/${path.split('/')[1] || 'zhcn'}/Login?next=${next}`;
      }
      return Promise.reject(err);
    }

    // 如果已经在刷新中，加入等待队列
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(token => {
        const retryConfig = { ...originalRequest, headers: { ...originalRequest.headers, Authorization: `Bearer ${token}` } };
        return api(retryConfig);
      }).catch(Promise.reject);
    }

    isRefreshing = true;

    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      isRefreshing = false;
      const path = window.location.pathname;
      localStorage.removeItem('token');
      localStorage.removeItem('auth_cache');
      if (!path.includes('/Login')) {
        const next = encodeURIComponent(path + window.location.search);
        window.location.href = `/${path.split('/')[1] || 'zhcn'}/Login?next=${next}`;
      }
      return Promise.reject(err);
    }

    try {
      const res = await axios.post('/globalcart/auth/refresh', { refreshToken: refreshToken });
      const { token: newToken, refreshToken: newRefreshToken } = res.data?.data || res.data || {};
      if (!newToken) throw new Error('no token');

      localStorage.setItem('token', newToken);
      if (newRefreshToken) localStorage.setItem('refresh_token', newRefreshToken);

      // 创建新请求（不复用 originalRequest，避免 headers 冻结问题）
      const retryConfig = { ...originalRequest, headers: { ...originalRequest.headers, Authorization: `Bearer ${newToken}` } };
      processQueue(null, newToken);
      return api(retryConfig);
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('auth_cache');
      const path = window.location.pathname;
      if (!path.includes('/Login')) {
        const next = encodeURIComponent(path + window.location.search);
        window.location.href = `/${path.split('/')[1] || 'zhcn'}/Login?next=${next}`;
      }
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);

// 同名导出base44，所有页面导入不用改
export const base44 = {
  entities: {
    orders: {
      list: (params) => api.get('/orders', {params}).then(r=>r.data),
      get: (id) => api.get(`/orders/${id}`).then(r=>r.data),
      create: (data) => api.post('/orders', data).then(r=>r.data),
      update: (id, data) => api.put(`/orders/${id}`, data).then(r=>r.data)
    },
  },
  functions: {
    invoke: (funcName, payload) => {
      return api.post(`/globalcart/${funcName}`, payload).then(r => r.data);
    }
  },
  auth: {
    me: (userId) => api.get('/globalcart/user/stats/me', { params: userId ? { userId } : {} }).then(r => r.data),
    redirectToLogin: (locale) => {
      const currentLang = locale || 'zhcn';
      window.location.href = `/${currentLang}/Login`;
    },
    logout: async (redirectUrl) => {
      const refreshToken = localStorage.getItem('refresh_token');
      try {
        await api.post('/globalcart/auth/logout', { refreshToken: refreshToken });
      } catch (_) {}
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('auth_cache');
      const path = window.location.pathname;
      const lang = path.split('/')[1] || 'zhcn';
      window.location.href = redirectUrl || `/${lang}/home`;
    },
    alipayLogin: async (redirectUrl) => {

      const res = await api.get('/globalcart/auth/alipay/authorize');
      const { url } = res.data.data;

      const width = 762;
      const height = 686;
      const left = (window.innerWidth - width) / 2 + window.screenX;
      const top = (window.innerHeight - height) / 2 + window.screenY;

      window.location.href = url;

      // window.open(url, '_blank', `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`);
    }
  },
  integrations: {
    Core: {
      UploadFile: async ({ file }) => {
        const formData = new FormData();
        formData.append('file', file);
        const token = localStorage.getItem('token');
        const res = await axios.post('/globalcart/order/info/uploadImage', formData, {
          headers: { 'Content-Type': 'multipart/form-data', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        const fileName = res.data?.data || res.data;
        const cleanPath = typeof fileName === 'string' ? fileName.replace(/\\/g, '/') : fileName;
        let userId = '';
        try {
          const cache = JSON.parse(localStorage.getItem('auth_cache') || '{}');
          userId = cache.user?.id || '';
        } catch (_) {}
        const fileUrl = typeof cleanPath === 'string'
          ? `${window.location.origin}/globalcart/order/info/image/${userId}/${cleanPath}`
          : cleanPath;
        return { file_url: fileUrl };
      },
      DeleteFile: async (imageUrl) => {
        const match = imageUrl.match(/\/globalcart\/order\/info\/image\/(\d+)\/(.+)$/);
        if (!match) return;
        const [, userId, path] = match;
        return api.post(`/globalcart/order/info/deleteImage?userId=${userId}&path=${encodeURIComponent(path)}`).then(r => r.data);
      }
    }
  }
}
