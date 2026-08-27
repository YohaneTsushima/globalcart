import axios from 'axios';
import { t, getLocale } from "@/lib/i18n";
import { reconnectWebSocket } from "@/lib/socket";

// 本地开发时从环境变量或配置读取
const tenantCode = import.meta.env.VITE_TENANT_CODE || 
                   window.location.hostname.split('.')[0];

// 后端地址写环境变量
const api = axios.create({
  baseURL: '',
  withCredentials: true,
  headers: {
    'X-Tenant': tenantCode
  }
});

// ── Token 刷新并发锁 ────────────────────────────────────────────────────────
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    error ? reject(error) : resolve(token);
  });
  failedQueue = [];
};



// ── 响应拦截：401 自动 refresh → 重试 ─────────────────────────────────────────
api.interceptors.response.use(
  res => res,
  async err => {
    const status = err?.response?.status;
    const originalRequest = err?.config;

    // 502/503/504 直接跳登录
    if ([502, 503, 504].includes(status)) {
      const path = window.location.pathname;
      localStorage.removeItem('auth_cache');
      if (!path.includes('/Login')) {
        const next = encodeURIComponent(path + window.location.search);
        window.location.href = `/${path.split('/')[1] || 'zhcn'}/Login?next=${next}`;
      }
      return Promise.reject(err);
    }

    // 非 401 直接拒绝
    if (status !== 401) return Promise.reject(err);

    // 验证 401 是否真的是 token 相关错误，防止数据库等其他异常被误当 token 过期处理
    const errorData = err?.response?.data;
    const msgText = String(errorData?.msg ?? errorData?.message ?? '');
    const isTokenError = !errorData ||
      errorData.code === 401 ||                     // 后端 R 格式：数字 code 401
      errorData.code === 'TOKEN_EXPIRED' ||
      errorData.code === 'UNAUTHORIZED' ||
      errorData.code === 'INVALID_TOKEN' ||
      errorData.code === 'TOKEN_INVALID' ||
      msgText.toLowerCase().includes('token') ||
      msgText.toLowerCase().includes('expired') ||
      msgText.toLowerCase().includes('过期') ||
      msgText.toLowerCase().includes('unauthorized');
      
    if (!isTokenError) return Promise.reject(err);

    // 如果是 refresh 接口本身 401，直接清 token 跳登录
    if (originalRequest?.url?.includes('/auth/refresh')) {
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
      }).then(() => {
        return api(originalRequest);
      }).catch(Promise.reject);
    }

    isRefreshing = true;

    try {
      const refreshBase = import.meta.env.DEV ? '' : (import.meta.env.VITE_BACKEND_URL || '');
      const res = await axios.post(`${refreshBase}/globalcart/auth/refresh`, null, { withCredentials: true });
      const { token: newToken } = res.data?.data || res.data || {};
      if (!newToken) throw new Error('no token');

      reconnectWebSocket();

      const retryConfig = { ...originalRequest };
      processQueue(null, newToken);
      return api(retryConfig);
    } catch (refreshErr) {
      processQueue(refreshErr, null);
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
    },
    fetchRate: () => {
      const DEFAULT_RATES = { JPY: 1, CNY: 0.049, USD: 0.0067, TWD: 0.21, HKD: 0.052, EUR: 0.0061, GBP: 0.0053, AUD: 0.01, SGD: 0.009 };
      fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/jpy.json')
      .then(r => r.json())
      .then(data => {
        if (data && data.jpy) {
          return {
            JPY: 1,
            CNY: data.jpy.cny || DEFAULT_RATES.CNY,
            USD: data.jpy.usd || DEFAULT_RATES.USD,
            EUR: data.jpy.eur || DEFAULT_RATES.EUR,
            GBP: data.jpy.gbp || DEFAULT_RATES.GBP,
            AUD: data.jpy.aud || DEFAULT_RATES.AUD,
            SGD: data.jpy.sgd || DEFAULT_RATES.SGD,
            HKD: data.jpy.hkd || DEFAULT_RATES.HKD,
            TWD: data.jpy.twd || DEFAULT_RATES.TWD,
          };
        } else {
          return DEFAULT_RATES;
        }
      })
      .catch(() => { setRates(DEFAULT_RATES); });
    }
  },
  auth: {
    me: () => api.get('/globalcart/user/stats/me').then(r => r.data),
    redirectToLogin: (locale) => {
      const currentLang = locale || 'zhcn';
      window.location.href = `/${currentLang}/Login`;
    },
    logout: async (redirectUrl) => {
      try {
        await api.post('/globalcart/auth/logout');
      } catch (_) {}
      localStorage.removeItem('auth_cache');
      const path = window.location.pathname;
      const lang = path.split('/')[1] || 'zhcn';
      window.location.href = redirectUrl || `/${lang}/home`;
    },
    alipayLogin: async (redirectUrl) => {
      const params = new URLSearchParams(redirectUrl || '');
      const tenant = params.get('tenant') || 'tongyi';
      const res = await api.get(`/globalcart/auth/alipay/authorize?tenant=${encodeURIComponent(tenant)}`);
      const { url } = res.data.data;

      const width = 762;
      const height = 686;
      const left = (window.innerWidth - width) / 2 + window.screenX;
      const top = (window.innerHeight - height) / 2 + window.screenY;

      window.location.href = url;

      // window.open(url, '_blank', `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`);
    },
    updateMe: async (me) => {
      return api.post(`/globalcart/user/stats/updateMe`, me).then(r => r.data);
    }
  },
  integrations: {
    Core: {
      UploadFile: async ({ file, path = "" }) => {
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('savePath', path);
        const uploadUrl = path
          ? `/globalcart/common/image/upload`
          : '/globalcart/order/info/uploadImage';
        const imageUrlBase = path
          ? `/globalcart/common/image`
          : '/globalcart/order/info/image';

        const res = await api.post(uploadUrl, formData);

        const fileName = res.data?.data || res.data;
        const cleanPath = typeof fileName === 'string' ? fileName.replace(/\\/g, '/') : fileName;
        let userId = '';
        try {
          const cache = JSON.parse(localStorage.getItem('auth_cache') || '{}');
          userId = cache.user?.id || '';
        } catch (_) {}
        const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_BACKEND_URL || window.location.origin);
        const fileUrl = typeof cleanPath === 'string'
          ? `${API_BASE}${imageUrlBase}/${cleanPath}`
          : cleanPath;
        return { file_url: fileUrl };
      },
      DeleteFile: async ({ imageUrl, path = "" }) => {
        if (!imageUrl) return;
        let userId = "";
        let filePath = "";
        // 新格式: /globalcart/common/image/{type}/{userId}/{file}
        const newMatch = imageUrl.match(/\/globalcart\/common\/image\/[^/]+\/(\d+)\/(.+)$/);
        if (newMatch) {
          [, userId, filePath] = newMatch;
        } else {
          // 旧格式: /globalcart/order/info/image/{userId}/{file}
          const oldMatch = imageUrl.match(/\/globalcart\/order\/info\/image\/(\d+)\/(.+)$/);
          if (oldMatch) [, userId, filePath] = oldMatch;
        }
        if (!userId || !filePath) return;
        return api.post(`/globalcart/common/image/delete?userId=${userId}&deleteType=${encodeURIComponent(path)}&path=${encodeURIComponent(filePath)}`).then(r => r.data);
      }
    }
  }
}
