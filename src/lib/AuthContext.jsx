import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { resolveTenantBranding } from '@/lib/tenantBranding';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  const [tenantBranding, setTenantBranding] = useState(null); // { tenant: {...} | null }
  const [permissions, setPermissions] = useState([]); // effective granular permissions for current user
  const [assignedRoles, setAssignedRoles] = useState([]); // custom role labels assigned to user

  useEffect(() => {
    // Resolve tenant branding from subdomain in parallel with app state check
    resolveTenantBranding().then(b => setTenantBranding(b)).catch(() => setTenantBranding({ tenant: null }));
    // --- LOCAL DEV ONLY: skip checkAppState, uncomment below for production ---
    // checkAppState();   ← 已注释掉
    setIsLoadingAuth(false);
    setIsLoadingPublicSettings(false);
    setIsAuthenticated(true);
    // setUser({ id: 'dev', full_name: 'Dev User', email: 'dev@test.com', role: 'user', __dev_mock__: true });
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      // First, check app public settings (with token if available)
      // This will tell us if auth is required, user not registered, etc.
      try {
        const headers = { 'X-App-Id': appParams.appId };
        if (appParams.token) headers['Authorization'] = `Bearer ${appParams.token}`;
        const resp = await fetch(`/api/apps/public/prod/public-settings/by-id/${appParams.appId}`, { headers });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          const err = new Error(data?.message || 'Failed to load app');
          err.status = resp.status;
          err.data = data;
          throw err;
        }
        const publicSettings = await resp.json();
        setAppPublicSettings(publicSettings);
        
        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);
        
        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      debugger
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);

      // Check account suspension + load granular permissions in background (non-blocking)
      base44.functions.invoke('getMyStatus', {}).then(r => {
        console.log(r);
        if (r?.data?.is_active === false) {
          setAuthError({ type: 'account_suspended', message: '您的账户已被停用，请联系管理员。' });
        }
        if (Array.isArray(r?.data?.permissions)) {
          setPermissions(r.data.permissions);
        }
        if (Array.isArray(r?.data?.assigned_roles)) {
          setAssignedRoles(r.data.assigned_roles);
        }
      }).catch(() => {});
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      
      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user,
      setUser,
      isAuthenticated: true, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      tenantBranding,
      permissions,
      setPermissions,
      assignedRoles,
      logout,
      navigateToLogin,
      checkAppState,
      checkUserAuth,
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