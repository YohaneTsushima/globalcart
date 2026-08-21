import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { fetchTenantConfig } from "@/lib/tenantApi";
import { connect, disconnect } from "@/lib/socket";
import { 
  ShoppingBag, Package, Truck, User, Settings, 
  Bell, LogOut, Menu, X, Shield, Globe,
  Home, Users, BarChart3, Store, Send, Zap, UserPlus, ChevronDown, ChevronRight, Layers, FileText
} from "lucide-react";
import NotificationBell from "@/components/common/NotificationBell.jsx";
import NavbarRateWidget from "@/components/common/NavbarRateWidget.jsx";
import AnnouncementPositionRenderer from "@/components/home/AnnouncementPositionRenderer";
import BannerDisplay from "@/components/home/BannerDisplay";
import { MidnightToggle } from "@/components/common/ThemeSelector";
import LocaleSwitcher from "@/components/common/LocaleSwitcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { mergeNavTree, buildNav, navTreeHasPage } from "@/lib/navRegistry";
import { t, getLocale } from "@/lib/i18n";
import { tenantEntity } from "@/lib/tenantApi";

export default function Layout({ children, currentPageName }) {
  const { user, tenantBranding, authError } = useAuth();
  const { can, isAdmin } = usePermissions();
  const isSuspended = authError?.type === 'account_suspended';
  const tenant = tenantBranding?.tenant || null;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [navbarSettings, setNavbarSettings] = useState(null);
  const [navbarRateCurrencies, setNavbarRateCurrencies] = useState([]);
  const [transitLocations, setTransitLocations] = useState([]);
  const [bannerConfig, setBannerConfig] = useState(null);
  const [locale, setLocale] = useState(getLocale());
  const location = useLocation();
  
  useEffect(() => {
    const handler = (e) => setLocale(e.detail?.locale || getLocale());
    window.addEventListener('localeChanged', handler);
    return () => window.removeEventListener('localeChanged', handler);
  }, []);

  // WebSocket 连接管理
  useEffect(() => {
    if (user) {
      connect();
      return () => disconnect();
    }
  }, [user]);

  useEffect(() => {
    if (tenant?.favicon_url) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.href = tenant.favicon_url;
    }
    if (tenant?.branding_name) {
      document.title = tenant.branding_name;
    }
  }, [tenant?.favicon_url, tenant?.branding_name]);

  const applyTenantConfig = (cfg) => {
    setAnnouncements(cfg.announcements || []);
    setNavbarSettings(cfg.navbarSettings || null);
    setTransitLocations(cfg.transitLocations || []);
    const bannerSetting = (cfg.settings || []).find(s => s.key === "home_banner_config");
    if (bannerSetting?.value) {
      try { setBannerConfig(JSON.parse(bannerSetting.value)); } catch { setBannerConfig(null); }
    } else {
      setBannerConfig(null);
    }
    const rateSetting = (cfg.settings || []).find(s => s.key === "navbar_exchange_rate_config");
    
    if (rateSetting?.value) {
      try {
        const rc = JSON.parse(rateSetting.value);
        if (rc.enabled && Array.isArray(rc.currencies)) setNavbarRateCurrencies(rc.currencies);
        else setNavbarRateCurrencies([]);
      } catch { setNavbarRateCurrencies([]); }
    } else {
      setNavbarRateCurrencies([]);
    }
  };

  useEffect(() => {
    if (!user) return;
    // fetchTenantConfig().then(applyTenantConfig).catch(() => {});
    tenantEntity.layoutConfig('SiteSettings').then(applyTenantConfig).catch(() => {});

    // 单独获取公告
    tenantEntity.list('Announcement')
    .then(data => setAnnouncements((data || []).filter(a => a.is_active)))
    .catch(() => {});
  }, [user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when any part of the app invalidates the config cache (e.g. after saving navbar rate settings)
  useEffect(() => {
    if (!user) return;
    const handler = () => {
      // fetchTenantConfig({ force: true }).then(applyTenantConfig).catch(() => {});
    };
    window.addEventListener('tenantConfigInvalidated', handler);
    return () => window.removeEventListener('tenantConfigInvalidated', handler);
  }, [user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive isTransitManager from already-fetched transitLocations (no extra network request)
  const isTransitManager = useMemo(
    () => user?.email ? transitLocations.some(l => l.manager_email === user.email && l.is_active) : false,
    [transitLocations, user?.email]
  );

  const isPlatformAdmin = user?.role === "platform_admin" || user?.role === "ROLE_ADMIN";
  const isTenantAdmin = user?.role === "admin" || user?.role === "tenant_admin";
  const isStaff = user?.role === "staff";
  const isTenantUser = user?.role === "user";
  
  const canAccessAdminSettings = isPlatformAdmin || isTenantAdmin || can("admin_settings:manage_backend_settings");
  const canAccessAdminDashboard = isPlatformAdmin || isTenantAdmin || can("view:admin_dashboard");
  const canAccessAdminOrders = isPlatformAdmin || isTenantAdmin || can("order:update") || can("view:order_management_page");
  const canAccessAdminShippingPool = isPlatformAdmin || isTenantAdmin || can("shipping_pool:update");
  const canAccessAdminUsers = isPlatformAdmin || isTenantAdmin || can("user:read") || can("view:user_management_page");
  const canAccessAdminAnnouncements = isPlatformAdmin || isTenantAdmin || can("view:announcement_management_page");
  const canViewMyOrders = isAdmin || isTenantUser || can("view:my_orders_module");
  const canAccessTransitWork = isAdmin || can("shipping:view_transit_panel");

  const navItems = useMemo(() => {
    const platformAdminNav = [
      { key: "PlatformAdminSettings", label: t("平台设置", locale), icon: Settings, page: "PlatformAdminSettings", children: [
        { key: "PlatformNotificationManager", label: t("跨租户通知", locale), icon: Bell, page: "PlatformNotificationManager", children: [] },
        { key: "PlatformTenantManager", label: t("租户管理", locale), icon: Globe, page: "PlatformAdminSettings", children: [] },
      ]},
    ];

    if (isPlatformAdmin || isTenantAdmin || isStaff) {
      const built = buildNav(mergeNavTree(navbarSettings?.admin_nav, "admin"), "admin", {
        access: {
          AdminDashboard: canAccessAdminDashboard,
          AdminOrders: canAccessAdminOrders,
          AdminShippingPool: canAccessAdminShippingPool,
          AdminTransitWork: canAccessTransitWork,
          AdminUsers: canAccessAdminUsers,
          AdminSettings: canAccessAdminSettings,
          AdminAnnouncements: canAccessAdminAnnouncements,
          AdminFeeRules: canAccessAdminSettings,
          AdminSettingsHome: canAccessAdminSettings,
          AdminNavbarSettings: canAccessAdminSettings,
          ExchangeRate: true,
          UserHome: true, UserSubmitOrder: true, UserSubmitOrderPlain: true, UserSubmitTicketOrder: true, UserGroupBuy: true,
          UserMyOrders: canViewMyOrders, UserShippingPool: true, UserProfile: true,
          UserHelpCenter: true, UserTodoAdmin: true,
        },
        locale,
      });
      return isPlatformAdmin ? [...built, ...platformAdminNav] : built;
    }

    return buildNav(mergeNavTree(navbarSettings?.user_nav, "user"), "user", {
      access: { MyOrders: canViewMyOrders, ShippingPool: !canAccessAdminShippingPool },
      labelOverrides: { ShippingPool: isTransitManager ? t("发货池", locale) : t("发货 & 拼邮", locale) },
      locale,
    });
  }, [
    navbarSettings,
    isPlatformAdmin, isTenantAdmin, isStaff,
    canAccessAdminDashboard, canAccessAdminOrders, canAccessAdminShippingPool,
    canAccessTransitWork, canAccessAdminUsers, canAccessAdminSettings,
    canAccessAdminAnnouncements, canViewMyOrders, isTransitManager,
  ]);



  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {isSuspended && (
        <div className="bg-red-600 text-white px-4 py-3 text-sm text-center font-medium flex items-center justify-center gap-2">
          <Shield className="w-4 h-4 flex-shrink-0" />
          {t("您的账户已被停用。所有操作已被禁止，请联系管理员处理。", locale)}
          <Button size="sm" variant="ghost" className="text-white hover:text-white hover:bg-red-700 h-6 px-2 text-xs ml-2"
            onClick={() => base44.auth.logout()}>{t("退出登录", locale)}</Button>
        </div>
      )}
      {/* modal announcements */}
      <AnnouncementPositionRenderer
        announcements={announcements} position="modal"
        currentPageName={currentPageName} userRole={user?.role}
      />

      {bannerConfig && <BannerDisplay config={bannerConfig} />}

      {/* Sticky top zone: above_nav + header stack together */}
      <div className="sticky top-0 z-50">
        <AnnouncementPositionRenderer
          announcements={announcements} position="above_nav"
          currentPageName={currentPageName} userRole={user?.role}
        />
      <header className="bg-white border-b border-gray-200">
        <div className="w-full px-4 sm:px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <button className="md:hidden p-1" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link to={createPageUrl("Home")} className="flex items-center gap-2">
              {tenant?.logo_url ? (
                <img src={tenant.logo_url} alt={tenant.branding_name} className="h-7 w-auto object-contain" />
              ) : (
                <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: tenant?.theme_color || '#dc2626' }}>
                  <span className="text-white text-xs font-bold">{(tenant?.branding_name || "同一").slice(0, 2)}</span>
                </div>
              )}
              <span className="font-semibold text-gray-900 text-sm">{tenant?.branding_name || "同一物流"}</span>
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const hasChildren = item.children && item.children.length > 0;
              const isActive = currentPageName === (item.activePage || item.page) || (hasChildren && navTreeHasPage(item.children, currentPageName));
              if (hasChildren) {
                return (
                  <div key={item.key} className="relative group">
                    <Link to={createPageUrl(item.page)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
                        isActive ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                      }`}>
                      <item.icon className="w-3.5 h-3.5" />
                      {item.label}
                      <ChevronDown className="w-3 h-3 ml-0.5 opacity-50" />
                    </Link>
                    <div className="absolute left-0 top-full pt-1 hidden group-hover:block z-50">
                      <div className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[150px]">
                        {item.children.map((child) => {
                          const hasGrand = child.children && child.children.length > 0;
                          const childActive = currentPageName === (child.activePage || child.page) || (hasGrand && navTreeHasPage(child.children, currentPageName));
                          return (
                            <div key={child.key} className="relative group/sub">
                              <Link to={createPageUrl(child.page)}
                                className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                                  childActive ? "bg-gray-50 text-gray-900 font-medium" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                }`}>
                                <child.icon className="w-3.5 h-3.5" />
                                <span className="flex-1 whitespace-nowrap">{child.label}</span>
                                {hasGrand && <ChevronRight className="w-3 h-3 opacity-50 flex-shrink-0" />}
                              </Link>
                              {hasGrand && (
                                <div className="absolute left-full top-0 pl-1 hidden group-hover/sub:block z-50">
                                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[150px]">
                                    {child.children.map((grand) => (
                                      <Link key={grand.key} to={createPageUrl(grand.page)}
                                        className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors whitespace-nowrap ${
                                          currentPageName === (grand.activePage || grand.page) ? "bg-gray-50 text-gray-900 font-medium" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                        }`}>
                                        <grand.icon className="w-3.5 h-3.5" />
                                        {grand.label}
                                      </Link>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }
              if (item.isRateWidget) {
                if (currentPageName === "AdminNavbarSettings") return null;
                return <NavbarRateWidget key={item.key} currencies={navbarRateCurrencies} />;
              }
              return (
                <Link key={item.key} to={createPageUrl(item.page)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
                    isActive ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}>
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </Link>
              );
            })}
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-gray-400 cursor-default">
              <Store className="w-3.5 h-3.5" />
              {t("商城", locale)}
              <Badge variant="outline" className="text-xs px-1 py-0 ml-1">{t("即将上线", locale)}</Badge>
            </span>
          </nav>

          <div className="flex items-center gap-2">
            {/* 仅当 nav 中央未渲染汇率小组件时才在右侧显示，且不在汇率设置页面本身显示（避免重复/自引用） */}
            {!navItems.some(item => item.isRateWidget) && currentPageName !== "AdminNavbarSettings" && (
              <NavbarRateWidget currencies={navbarRateCurrencies} />
            )}
            <LocaleSwitcher />
            <NotificationBell />
            <MidnightToggle />
            {isAdmin && (
              <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
                <Shield className="w-3 h-3 mr-1" />{t("管理员", locale)}
              </Badge>
            )}
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 hidden sm:inline">{user.displayName || user.display_name || user.userEmail}</span>
                <Button variant="ghost" size="sm" className="text-gray-500 h-7 px-2"
                  onClick={() => base44.auth.logout()}>
                  <LogOut className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <Badge className="bg-gray-100 text-gray-500 border-gray-200 text-xs">
                {t("游客", locale)}
              </Badge>
            )}
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t bg-white px-4 py-3 space-y-1">
            {navItems.filter(item => !item.isRateWidget).map((item) => (
              <div key={item.key}>
                <Link to={createPageUrl(item.page)} onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${
                    currentPageName === (item.activePage || item.page) ? "bg-gray-100 font-medium" : "text-gray-600"
                  }`}>
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
                {item.children && item.children.length > 0 && (
                  <div className="ml-6 mt-0.5 space-y-0.5">
                    {item.children.map((child) => (
                      <div key={child.key}>
                        <Link to={createPageUrl(child.page)} onClick={() => setMobileOpen(false)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm ${
                            currentPageName === (child.activePage || child.page) ? "bg-gray-100 font-medium" : "text-gray-500"
                          }`}>
                          <child.icon className="w-3.5 h-3.5" />
                          {child.label}
                        </Link>
                        {(child.children || []).map((grand) => (
                          <Link key={grand.key} to={createPageUrl(grand.page)} onClick={() => setMobileOpen(false)}
                            className={`flex items-center gap-2 ml-6 px-3 py-1.5 rounded text-sm ${
                              currentPageName === (grand.activePage || grand.page) ? "bg-gray-100 font-medium" : "text-gray-500"
                            }`}>
                            <grand.icon className="w-3 h-3" />
                            {grand.label}
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </header>
      </div>{/* end sticky top zone */}

      {/* below_nav announcements */}
      <AnnouncementPositionRenderer
        announcements={announcements} position="below_nav"
        currentPageName={currentPageName} userRole={user?.role}
      />

      <main className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 py-6 relative">
        {isSuspended && (
          <div className="absolute inset-0 z-40 bg-white/70 backdrop-blur-sm flex items-center justify-center rounded-lg">
            <div className="text-center p-8">
              <Shield className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <p className="text-lg font-semibold text-gray-800">{t("账户已停用", locale)}</p>
              <p className="text-sm text-gray-500 mt-1">{t("您的账户已被管理员停用，无法进行任何操作。", locale)}</p>
              <p className="text-sm text-gray-500 mt-0.5">{t("请联系管理员解除限制。", locale)}</p>
            </div>
          </div>
        )}
        {children}
      </main>

      {/* page_footer announcements */}
      <AnnouncementPositionRenderer
        announcements={announcements} position="page_footer"
        currentPageName={currentPageName} userRole={user?.role}
      />

      <footer className="border-t bg-white mt-10 py-6 text-center text-xs text-gray-400">
        <div className="flex items-center justify-center gap-4 mb-2">
          <Link to={createPageUrl("helpcenter")} className="hover:text-teal-600 transition-colors">{t("帮助中心", locale)}</Link>
          <span>·</span>
          <Link to={createPageUrl("helpcenter/faq")} className="hover:text-teal-600 transition-colors">{t("常见问题", locale)}</Link>
        </div>
        © 2026 同一物流 Tongyi Express · 日本 → 全球 · 安心・信頼・快捷
      </footer>
    </div>
  );
}