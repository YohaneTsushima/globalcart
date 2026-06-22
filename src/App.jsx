import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation, useParams } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { LocaleProvider, isValidLocale, getPreferredLocale } from '@/lib/LocaleContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import PlatformAdminSettings from '@/pages/PlatformAdminSettings';
import AdminFeeRules from '@/pages/AdminFeeRules';
import PreShipmentForm from '@/pages/PreShipmentForm';
import GroupBuy from '@/pages/GroupBuy';
import TransitLocationWork from '@/pages/TransitLocationWork';
import TransitPoolWork from '@/pages/TransitPoolWork';
import AdminTransitWork from '@/pages/AdminTransitWork';
import Notifications from '@/pages/Notifications';
import UserNotificationSettings from '@/pages/UserNotificationSettings';
import AdminNotificationManager from '@/pages/AdminNotificationManager';
import AdminNotificationTemplates from '@/pages/AdminNotificationTemplates';
import AdminNotificationDefaults from '@/pages/AdminNotificationDefaults';
import PlatformNotificationManager from '@/pages/PlatformNotificationManager';
import TestNotificationTemplates from '@/pages/TestNotificationTemplates';
import AdminReports from '@/pages/AdminReports';
import MetricCardSizesDemo from '@/pages/MetricCardSizesDemo';
import TestGmailConnection from '@/pages/TestGmailConnection';
import AdminUserDetail from '@/pages/AdminUserDetail';
import PublicProfile from '@/pages/PublicProfile';
import UserPrivacySettings from '@/pages/UserPrivacySettings';
import AdminNavbarSettings from '@/pages/AdminNavbarSettings';
import MemberTiers from '@/pages/MemberTiers';
import HelpCenter from '@/pages/HelpCenter';
import HelpCenterFaq from '@/pages/HelpCenterFaq';
import AdminFaq from '@/pages/AdminFaq';
import UserTodo from '@/pages/UserTodo';
import SubmitTicketOrder from '@/pages/SubmitTicketOrder';
import AdminTicketOrders from '@/pages/AdminTicketOrders';
import Login from '@/pages/Login';
import ProtectedRoute from '@/components/ProtectedRoute';
import SubmitOrder from '@/pages/SubmitOrder';
import MyOrders from '@/pages/MyOrders.jsx';
import ShippingRequests from '@/pages/ShippingRequests';
import UserPreferences from '@/pages/UserPreferences';
import AdminDashboard from '@/pages/AdminDashboard';
import AdminOrders from '@/pages/AdminOrders.jsx';
import AdminShipping from '@/pages/AdminShipping';
import AdminUsers from '@/pages/AdminUsers';
import AdminAnnouncements from '@/pages/AdminAnnouncements';
import AdminSettings from '@/pages/AdminSettings';
import Payment from '@/pages/Payment';
import ConsolidationPool from '@/pages/ConsolidationPool';
import ShippingPool from '@/pages/ShippingPool.jsx';
import AdminShippingPool from '@/pages/AdminShippingPool.jsx';

// 初始化订单控制器注册中心
import '@/components/orders/controllers';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

// /{locale}/mypage/me → 个人中心（AdminUserDetail/me 的别名路由）
const MypageRedirect = () => {
  const { locale } = useParams();
  return <Navigate to={`/${locale}/AdminUserDetail/me`} replace />;
};

// /{locale}/faq → alias for /:locale/helpcenter/faq
const FaqAliasRedirect = () => {
  const { locale } = useParams();
  const location = useLocation();
  return <Navigate to={`/${locale}/helpcenter/faq${location.search}`} replace />;
};

// /{locale}/HelpCenter (old) → /:locale/helpcenter
const HelpCenterOldRedirect = () => {
  const { locale } = useParams();
  return <Navigate to={`/${locale}/helpcenter`} replace />;
};

// /{locale}/HelpCenterFaq (old) → /:locale/helpcenter/faq
const HelpCenterFaqOldRedirect = () => {
  const { locale } = useParams();
  const location = useLocation();
  return <Navigate to={`/${locale}/helpcenter/faq${location.search}`} replace />;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const location = useLocation();

  // 旧链接兼容：首段不是合法语言代码时，自动加上用户偏好语言前缀
  // 例如 /Notifications → /ja/Notifications，/u/handle → /ja/u/handle
  const firstSegment = location.pathname.split('/').filter(Boolean)[0];
  if (firstSegment && !isValidLocale(firstSegment)) {
    return <Navigate to={`/${getPreferredLocale()}${location.pathname}${location.search}${location.hash}`} replace />;
  }

  // 帮助中心页面对未登录用户开放
  const isPublicPage = ['/helpcenter', '/helpcenter/faq', '/faq'].some(p =>
    location.pathname.endsWith(p) || location.pathname.includes('/helpcenter')
  );

  if ((isLoadingPublicSettings || isLoadingAuth) && !isPublicPage) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      if (!isPublicPage) {
        navigateToLogin();
        return null;
      }
      // 公开页面：继续渲染，不重定向
    }
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={`/${getPreferredLocale()}`} replace />} />
      
      <Route path="/:locale" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/:locale/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      
      <Route path="/:locale/PlatformAdminSettings" element={
        <LayoutWrapper currentPageName="PlatformAdminSettings">
          <PlatformAdminSettings />
        </LayoutWrapper>
      } />
      <Route path="/:locale/AdminFeeRules" element={
        <LayoutWrapper currentPageName="AdminFeeRules">
          <AdminFeeRules />
        </LayoutWrapper>
      } />
      {/* ===== 需要登录才能访问的路由 ===== */}
      <Route element={<ProtectedRoute />}>
        <Route path="/:locale/SubmitOrder" element={<LayoutWrapper currentPageName="SubmitOrder"><SubmitOrder /></LayoutWrapper>} />
        <Route path="/:locale/MyOrders" element={<LayoutWrapper currentPageName="MyOrders"><MyOrders /></LayoutWrapper>} />
        <Route path="/:locale/ShippingRequests" element={<LayoutWrapper currentPageName="ShippingRequests"><ShippingRequests /></LayoutWrapper>} />
        <Route path="/:locale/UserPreferences" element={<LayoutWrapper currentPageName="UserPreferences"><UserPreferences /></LayoutWrapper>} />
        <Route path="/:locale/AdminDashboard" element={<LayoutWrapper currentPageName="AdminDashboard"><AdminDashboard /></LayoutWrapper>} />
        <Route path="/:locale/AdminOrders" element={<LayoutWrapper currentPageName="AdminOrders"><AdminOrders /></LayoutWrapper>} />
        <Route path="/:locale/AdminShipping" element={<LayoutWrapper currentPageName="AdminShipping"><AdminShipping /></LayoutWrapper>} />
        <Route path="/:locale/AdminUsers" element={<LayoutWrapper currentPageName="AdminUsers"><AdminUsers /></LayoutWrapper>} />
        <Route path="/:locale/AdminAnnouncements" element={<LayoutWrapper currentPageName="AdminAnnouncements"><AdminAnnouncements /></LayoutWrapper>} />
        <Route path="/:locale/AdminSettings" element={<LayoutWrapper currentPageName="AdminSettings"><AdminSettings /></LayoutWrapper>} />
        <Route path="/:locale/Payment" element={<LayoutWrapper currentPageName="Payment"><Payment /></LayoutWrapper>} />
        <Route path="/:locale/ConsolidationPool" element={<LayoutWrapper currentPageName="ConsolidationPool"><ConsolidationPool /></LayoutWrapper>} />
        <Route path="/:locale/ShippingPool" element={<LayoutWrapper currentPageName="ShippingPool"><ShippingPool /></LayoutWrapper>} />
        <Route path="/:locale/AdminShippingPool" element={<LayoutWrapper currentPageName="AdminShippingPool"><AdminShippingPool /></LayoutWrapper>} />
        <Route path="/:locale/PreShipmentForm" element={<LayoutWrapper currentPageName="PreShipmentForm"><PreShipmentForm /></LayoutWrapper>} />
      </Route>

      <Route path="/:locale/GroupBuy" element={
        <LayoutWrapper currentPageName="GroupBuy">
          <GroupBuy />
        </LayoutWrapper>
      } />
      <Route path="/:locale/TransitLocationWork/:transit_location_id" element={
        <LayoutWrapper currentPageName="TransitLocationWork">
          <TransitLocationWork />
        </LayoutWrapper>
      } />
      <Route path="/:locale/Trworkon/:pool_code" element={
        <LayoutWrapper currentPageName="TransitPoolWork">
          <TransitPoolWork />
        </LayoutWrapper>
      } />
      <Route path="/:locale/AdminTransitWork" element={
        <LayoutWrapper currentPageName="AdminTransitWork">
          <AdminTransitWork />
        </LayoutWrapper>
      } />
      <Route path="/:locale/Notifications" element={
        <LayoutWrapper currentPageName="Notifications">
          <Notifications />
        </LayoutWrapper>
      } />
      <Route path="/:locale/UserNotificationSettings" element={
        <LayoutWrapper currentPageName="UserNotificationSettings">
          <UserNotificationSettings />
        </LayoutWrapper>
      } />
      <Route path="/:locale/AdminNotificationManager" element={
        <LayoutWrapper currentPageName="AdminNotificationManager">
          <AdminNotificationManager />
        </LayoutWrapper>
      } />
      <Route path="/:locale/AdminNotificationTemplates" element={
        <LayoutWrapper currentPageName="AdminNotificationTemplates">
          <AdminNotificationTemplates />
        </LayoutWrapper>
      } />
      <Route path="/:locale/AdminNotificationDefaults" element={
        <LayoutWrapper currentPageName="AdminNotificationDefaults">
          <AdminNotificationDefaults />
        </LayoutWrapper>
      } />
      <Route path="/:locale/PlatformNotificationManager" element={
        <LayoutWrapper currentPageName="PlatformNotificationManager">
          <PlatformNotificationManager />
        </LayoutWrapper>
      } />
      <Route path="/:locale/TestNotificationTemplates" element={
        <LayoutWrapper currentPageName="TestNotificationTemplates">
          <TestNotificationTemplates />
        </LayoutWrapper>
      } />
      <Route path="/:locale/AdminReports" element={
        <LayoutWrapper currentPageName="AdminReports">
          <AdminReports />
        </LayoutWrapper>
      } />
      <Route path="/:locale/MetricCardSizesDemo" element={
        <LayoutWrapper currentPageName="MetricCardSizesDemo">
          <MetricCardSizesDemo />
        </LayoutWrapper>
      } />
      <Route path="/:locale/TestGmailConnection" element={
        <LayoutWrapper currentPageName="TestGmailConnection">
          <TestGmailConnection />
        </LayoutWrapper>
      } />
      <Route path="/:locale/AdminUserDetail/:userId" element={
        <LayoutWrapper currentPageName="AdminUserDetail">
          <AdminUserDetail />
        </LayoutWrapper>
      } />
      <Route path="/:locale/AdminNavbarSettings" element={
        <LayoutWrapper currentPageName="AdminNavbarSettings">
          <AdminNavbarSettings />
        </LayoutWrapper>
      } />
      <Route path="/:locale/MemberTiers" element={
        <LayoutWrapper currentPageName="MemberTiers">
          <MemberTiers />
        </LayoutWrapper>
      } />
      {/* Help Center routes */}
      <Route path="/:locale/helpcenter" element={
        <LayoutWrapper currentPageName="HelpCenter">
          <HelpCenter />
        </LayoutWrapper>
      } />
      <Route path="/:locale/helpcenter/faq" element={
        <LayoutWrapper currentPageName="HelpCenterFaq">
          <HelpCenterFaq />
        </LayoutWrapper>
      } />
      {/* /faq alias → /helpcenter/faq */}
      <Route path="/:locale/faq" element={<FaqAliasRedirect />} />
      {/* Backward-compat redirects for old PascalCase URLs */}
      <Route path="/:locale/HelpCenter" element={<HelpCenterOldRedirect />} />
      <Route path="/:locale/HelpCenterFaq" element={<HelpCenterFaqOldRedirect />} />
      <Route path="/:locale/AdminFaq" element={
        <LayoutWrapper currentPageName="AdminFaq">
          <AdminFaq />
        </LayoutWrapper>
      } />
      <Route path="/:locale/UserTodo" element={
        <LayoutWrapper currentPageName="UserTodo">
          <UserTodo />
        </LayoutWrapper>
      } />
      <Route path="/:locale/SubmitTicketOrder" element={
        <LayoutWrapper currentPageName="SubmitTicketOrder">
          <SubmitTicketOrder />
        </LayoutWrapper>
      } />
      <Route path="/:locale/AdminTicketOrders" element={
        <LayoutWrapper currentPageName="AdminTicketOrders">
          <AdminTicketOrders />
        </LayoutWrapper>
      } />
      <Route path="/:locale/UserPrivacySettings" element={
        <LayoutWrapper currentPageName="UserPrivacySettings">
          <UserPrivacySettings />
        </LayoutWrapper>
      } />
      <Route path="/:locale/mypage/me" element={<MypageRedirect />} />
      <Route path="/:locale/u/:handle" element={
        <LayoutWrapper currentPageName="PublicProfile">
          <PublicProfile />
        </LayoutWrapper>
      } />
      
      <Route path="/:locale/Login" element={
        <LayoutWrapper currentPageName="Login">
          <Login />
        </LayoutWrapper>
      } />

      
      <Route path="*" element={<Navigate to={`/${getPreferredLocale()}`} replace />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <LocaleProvider>
            <AuthenticatedApp />
          </LocaleProvider>
        </Router>
        <Toaster />
        <SonnerToaster position="top-center" richColors />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App