// import { createClient } from '@base44/sdk';
import axios from 'axios';
import { t, getLocale } from "@/lib/i18n";
//Create a client with authentication required
// export const base44 = createClient({
//   appId,
//   token,
//   functionsVersion,
//   serverUrl: '',
//   requiresAuth: false,
//   appBaseUrl
// });

// 后端地址写环境变量
const api = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json'
  }
})
// 请求拦截统一携带登录token
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if(token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// 响应拦截：401 清 token + 跳登录（登录页本身不跳，避免循环）
api.interceptors.response.use(
  res => res,
  err => {
    const status = err?.response?.status;
    if (status === 401) {
      const path = window.location.pathname;
      localStorage.removeItem('token');
      localStorage.removeItem('auth_cache');
      if (!path.includes('/Login')) {
        const next = encodeURIComponent(path + window.location.search);
        window.location.href = `/${path.split('/')[1] || 'zhcn'}/Login?next=${next}`;
      }
    }
    return Promise.reject(err);
  }
);

// 同名导出base44，所有页面导入不用改
export const base44 = {
  // 替代原来的表CRUD
  entities: {
    orders: {
      list: (params) => api.get('/orders', {params}).then(r=>r.data),
      get: (id) => api.get(`/orders/${id}`).then(r=>r.data),
      create: (data) => api.post('/orders', data).then(r=>r.data),
      update: (id, data) => api.put(`/orders/${id}`, data).then(r=>r.data)
    },
    // faq、shippingpool、reports、会员 等所有实体在这里补齐
  },
  // 替代原来调用后端定时任务/函数
  functions: {
    invoke: (funcName, payload) => {
      return api.post(`/globalcart/${funcName}`, payload).then(r => r.data);
    }
  },
  // 替代原来获取当前登录用户、角色鉴权
  auth: {
    me: (userId) => api.get('/globalcart/user/preference/me', { params: userId ? { userId } : {} }).then(r => r.data),
    redirectToLogin: (locale) => {
      const currentLang = locale || 'zhcn';
      window.location.href = `/${currentLang}/Login`;
    },
    logout: (redirectUrl) => {
      localStorage.removeItem('token');
      localStorage.removeItem('auth_cache');
      const path = window.location.pathname;
      const lang = path.split('/')[1] || 'zhcn';
      window.location.href = redirectUrl || `/${lang}/home`;
    }
  }
}