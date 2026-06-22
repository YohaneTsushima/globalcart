import { useEffect } from 'react';
import { Outlet, useLocation, useParams, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

/**
 * 路由登录守卫
 * 
 * 用法（在 App.jsx 中）：
 * 
 * <Route element={<ProtectedRoute />}>
 *   <Route path="/:locale/SubmitOrder" element={<LayoutWrapper currentPageName="SubmitOrder"><SubmitOrder /></LayoutWrapper>} />
 *   <Route path="/:locale/MyOrders"    element={<LayoutWrapper currentPageName="MyOrders"><MyOrders /></LayoutWrapper>} />
 * </Route>
 * 
 * 未登录用户访问以上路由时，自动跳转登录页，登录成功后回到原页面。
 */
export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth } = useAuth();
  const location = useLocation();
  const { locale = 'zhcn' } = useParams();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  // if (authError) {
  //   if (authError.type === 'user_not_registered') {
  //     return <UserNotRegisteredError />;
  //   }
  //   // 未登录：跳转到站内登录页，登录后返回当前页
  //   const next = encodeURIComponent(location.pathname + location.search);
  //   return <Navigate to={`/${locale}/Login?next=${next}`} replace />;
  // }

  if (!isAuthenticated) {
    if (unauthenticatedElement) return unauthenticatedElement;
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/${locale}/Login?next=${next}`} replace />;
  }

  return <Outlet />;
}