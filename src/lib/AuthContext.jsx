import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { resolveTenantBranding } from '@/lib/tenantBranding';

const AuthContext = createContext();

const AUTH_CACHE_KEY = 'auth_cache';

const readAuthCache = () => {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeAuthCache = (data) => {
  try {
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(data));
  } catch {}
};

const clearAuthCache = () => {
  localStorage.removeItem('token');
  localStorage.removeItem(AUTH_CACHE_KEY);
};

// 后端驼峰 → 前端期望的字段名（全局统一适配）
const normalizeUser = (raw) => {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  return {
    ...raw,
    email: raw.userEmail ?? raw.email ?? raw.user_email ?? undefined,
    full_name: raw.displayName ?? raw.full_name ?? raw.fullName ?? raw.user_name ?? undefined,
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [tenantBranding, setTenantBranding] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [assignedRoles, setAssignedRoles] = useState([]);

  useEffect(() => {
    // Resolve tenant branding from subdomain in parallel with app state check
    // Skip in dev mock mode (will be set below)
    const isDev = !window.location.hostname.includes('.') || window.location.hostname === 'localhost';
    if (!isDev) {
      resolveTenantBranding().then(b => setTenantBranding(b)).catch(() => setTenantBranding({ tenant: null }));
    } else {
      setTenantBranding({
        tenant: {
          id: 'dev-tenant',
          name: '同一物流（开发）',
          branding_name: '同一物流',
          theme_color: '#dc2626',
          logo_url: '',
          favicon_url: '',
          login_title: '欢迎登录',
          login_subtitle: '日本代购 · 国际物流',
          contact_info: '联系客服：service@example.com',
          timezone: 'Asia/Tokyo',
          is_active: true,
          allowed_features: ['credit_module', 'consolidation', 'transit_shipping', 'ticket_orders', 'group_buy'],
        }
      });
    }

    const token = localStorage.getItem('token');
    
    if (token) {
      const cache = readAuthCache();
      if (cache) {
        setUser(cache.user || null);
        setPermissions(Array.isArray(cache.permissions) ? cache.permissions : []);
        setAssignedRoles(Array.isArray(cache.assigned_roles) ? cache.assigned_roles : []);
        if (cache.is_active === false) {
          setAuthError({ type: 'account_suspended', message: '您的账户已被停用，请联系管理员。' });
        }
        setIsAuthenticated(true);
      }
    }
    setIsLoadingAuth(false);
  }, []);

  const login = async (username, verifyCode) => {
    setAuthError(null);
    try {
      const r = await base44.functions.invoke('user/stats/loginOrRegister', {
        username,
        verifyCode
      });

      const token = r?.token || r?.access_token || r?.data?.token || r?.data?.access_token;
      if (!token) {
        setAuthError({ type: 'login_failed', message: '登录失败，未收到 token' });
        return { ok: false, error: 'no_token' };
      }
      localStorage.setItem('token', token);

      const u = normalizeUser(r?.user || r?.data?.user || null);
      const perms = Array.isArray(r?.permissions) ? r.permissions : (Array.isArray(r?.data?.permissions) ? r.data.permissions : []);
      const roles = Array.isArray(r?.assigned_roles) ? r.assigned_roles : (Array.isArray(r?.data?.assigned_roles) ? r.data.assigned_roles : []);
      const isActive = r?.is_active ?? r?.data?.is_active ?? true;

      setUser(u);
      setPermissions(perms);
      setAssignedRoles(roles);
      setIsAuthenticated(true);

      writeAuthCache({ user: u, permissions: perms, assigned_roles: roles, is_active: isActive });

      if (isActive === false) {
        setAuthError({ type: 'account_suspended', message: '您的账户已被停用，请联系管理员。' });
        return { ok: false, error: 'account_suspended' };
      }
      return { ok: true };
    } catch (error) {
      console.error('login failed:', error);
      setIsAuthenticated(false);
      setUser(null);
      const msg = error?.response?.data?.message || error?.message || '登录失败，请检查验证码';
      setAuthError({ type: 'login_failed', message: msg });
      return { ok: false, error: msg };
    }
  };

  // OAuth2 登录：后端回调带 token + userId，前端存 token 后调 /auth/me 拿用户全量数据
  const loginWithToken = async (token, userId) => {
    setAuthError(null);
    if (!token) {
      setAuthError({ type: 'login_failed', message: '登录失败，未收到 token' });
      return { ok: false, error: 'no_token' };
    }
    localStorage.setItem('token', token);
    try {
      const me = await base44.auth.me(userId);
      const d = me?.data ?? me ?? {};
      const u = normalizeUser(d);
      const perms = Array.isArray(d.permissions) ? d.permissions : [];
      const roles = Array.isArray(d.assigned_roles) ? d.assigned_roles : [];
      const isActive = d.isActive ?? d.is_active ?? true;

      setUser(u);
      setPermissions(perms);
      setAssignedRoles(roles);
      setIsAuthenticated(true);

      writeAuthCache({ user: u, permissions: perms, assigned_roles: roles, is_active: isActive });

      if (isActive === false) {
        setAuthError({ type: 'account_suspended', message: '您的账户已被停用，请联系管理员。' });
        return { ok: false, error: 'account_suspended' };
      }
      return { ok: true };
    } catch (error) {
      console.error('oauth2 login failed:', error);
      clearAuthCache();
      setIsAuthenticated(false);
      setUser(null);
      const msg = error?.response?.data?.message || error?.message || '获取用户信息失败';
      setAuthError({ type: 'login_failed', message: msg });
      return { ok: false, error: msg };
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    setPermissions([]);
    setAssignedRoles([]);
    setAuthError(null);
    clearAuthCache();
    if (shouldRedirect) {
      const lang = (navigator.language || '').toLowerCase().includes('ja') ? 'ja' : 'zhcn';
      window.location.href = `/${lang}/Login`;
    }
  };

  const navigateToLogin = () => {
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{
      user,
      setUser,
      isAuthenticated,
      isLoadingAuth,
      authError,
      tenantBranding,
      permissions,
      setPermissions,
      assignedRoles,
      login,
      loginWithToken,
      logout,
      navigateToLogin,
      authChecked: !isLoadingAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
