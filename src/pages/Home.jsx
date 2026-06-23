import { useState, useEffect } from "react";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { timePage } from "@/lib/timing";
import { Truck, Package, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getStatusLabel, getStatusColor } from "@/lib/orderStatus";
import { getTenantConfigCache, setTenantConfigCache } from "@/lib/configCache";
import { useLocale } from "@/lib/LocaleContext";
import { t } from "@/lib/i18n";
// Badge/getStatus* kept for future use; LogisticsStatusBoard handles order display now
import QuickActionsGrid from "@/components/home/QuickActionsGrid";
import LogisticsStatusBoard from "@/components/home/LogisticsStatusBoard";
import HeroSection from "@/components/home/HeroSection";
import FaqSection from "@/components/home/FaqSection";
import ExchangeRateWidget from "@/components/home/ExchangeRateWidget";

export default function Home() {
  const { user } = useCurrentUser();
  const { tenant } = useTenantBranding();
  const { locale } = useLocale();
  const [recentOrders, setRecentOrders] = useState([]);
  const [quickActions, setQuickActions] = useState([]);
  const [boardConfig, setBoardConfig] = useState({});
  const [heroConfig, setHeroConfig] = useState(null);
  const [stepsConfig, setStepsConfig] = useState(null);
  const [faqConfig, setFaqConfig] = useState(null);
  const [faqCategories, setFaqCategories] = useState([]);
  const [rateConfig, setRateConfig] = useState(null);

  useEffect(() => {
    const t = timePage('Home');

    const parseJson = (raw, key) => {
      const item = (raw || []).find(s => s.key === key);
      if (item?.value) { try { return JSON.parse(item.value); } catch { return null; } }
      return null;
    };

    // Logged-in users: use getTenantConfigData (has 30s in-memory cache shared with Layout/AdminSettings)
    // Guests: fall back to getPublicHomeConfig (no auth required)
    const loadSettings = async () => {
      let raw = [];
      let faqCategories = [];

      // Check if already cached (logged-in path)
      const cached = getTenantConfigCache();
      if (cached) {
        raw = cached.settings || [];
        faqCategories = cached.faqCategories || [];
      } else {
        // Try authenticated endpoint first; fall back to public
        try {
          // const r = await base44.functions.invoke('getTenantConfigData', {});
          const r = [];
          const data = r.data || {};
          raw = data.settings || [];
          faqCategories = data.faqCategories || [];
          // Cache it for reuse across components
          setTenantConfigCache({ ...data, faqCategories });
        } catch {
          // Guest / unauthenticated: use public endpoint
          try {
            // const r = await base44.functions.invoke('getPublicHomeConfig', { hostname: window.location.hostname });
            const r = [];
            raw = r.data?.raw || [];
            faqCategories = r.data?.faqCategories || [];
          } catch { /* silent */ }
        }
      }

      var values = {
        quickActions: parseJson(raw, 'home_quick_actions') || [],
        boardConfig:  parseJson(raw, 'home_status_board') || {},
        heroConfig:   parseJson(raw, 'home_hero_config') || null,
        stepsConfig:  parseJson(raw, 'home_steps_config') || null,
        faqConfig:    parseJson(raw, 'home_faq_config') || null,
        rateConfig:   parseJson(raw, 'home_exchange_rate_config') || null,
        faqCategories,
      };

      return values;
    };

    // Only fetch orders for logged-in users
    const loadOrders = () => {
      if (!user) return Promise.resolve([]);
      return base44.functions.invoke('getTenantOrders', {})
        .then(r => (r.data?.orders || []).slice(0, 5))
        .catch(() => []);
    };

    Promise.all([
      t.timeCall('loadOrders', loadOrders),
      t.timeCall('loadSettings', loadSettings),
    ]).then(([orders, { quickActions, boardConfig, heroConfig, stepsConfig, faqConfig, rateConfig, faqCategories }]) => {
      setRecentOrders(orders);
      setQuickActions(quickActions);
      setBoardConfig(boardConfig);
      setHeroConfig(heroConfig);
      setStepsConfig(stepsConfig);
      setFaqConfig(faqConfig);
      setRateConfig(rateConfig);
      setFaqCategories(faqCategories);
      t.done('data ready');
    });
  }, [user?.email]); // re-run when auth state changes (guest → logged-in)

  const DEFAULT_SECTIONS = [{
    heading: t("代购流程", locale),
    steps: [
      { title: t("提交购买需求", locale), desc: t("填写商品链接、数量，系统自动估算预付款", locale) },
      { title: t("确认付款", locale),     desc: t("选择支付方式完成预付款，管理员审核确认", locale) },
      { title: t("采购进行中", locale),   desc: t("我们在日本为您采购商品，实时更新状态", locale) },
      { title: t("提交发货需求", locale), desc: t("填写收货地址，选运输方式，余额自动抵扣运费", locale) },
    ],
  }];
  const STEP_ICONS = [Package, CheckCircle, Package, Truck];

  // resolve steps audience config — supports both old {heading,steps} and new {sections:[]}
  const resolveSteps = () => {
    if (!stepsConfig) return { visible: true, sections: DEFAULT_SECTIONS };
    let cfg;
    if (stepsConfig.unified) {
      cfg = stepsConfig.guest;
    } else {
      const isAdmin = user?.role === "admin" || user?.role === "tenant_admin" || user?.role === "platform_admin" || user?.role === "staff";
      if (isAdmin && stepsConfig.admin) cfg = stepsConfig.admin;
      else if (user && stepsConfig.user) cfg = stepsConfig.user;
      else cfg = stepsConfig.guest;
    }
    const visible = cfg?.visible !== false;
    // Normalise: old format has heading+steps, new has sections[]
    let sections;
    if (Array.isArray(cfg?.sections)) {
      sections = cfg.sections;
    } else if (cfg?.steps) {
      sections = [{ heading: cfg.heading || "代购流程", steps: cfg.steps }];
    } else {
      sections = DEFAULT_SECTIONS;
    }
    return { visible, sections };
  };
  const stepsResolved = resolveSteps();

  const rc = rateConfig;
  const rateEnabled = rc?.enabled && rc?.currencies?.length > 0;
  const rateCurrencies = rc?.currencies || [];   // [{code,unit}] 新格式，组件内自动兼容
  // 兼容旧单选 position 和新多选 positions
  const ratePositions = Array.isArray(rc?.positions) && rc.positions.length > 0
    ? rc.positions
    : rc?.position ? [rc.position] : ["hero_right"];
  const hasPos = (pos) => rateEnabled && ratePositions.includes(pos);

  return (
    <div className="space-y-8">
      {/* Hero — rate widget overlaid on top of hero when position is hero_left/hero_right */}
      <HeroSection
        config={heroConfig}
        user={user}
        tenant={tenant}
        ratePosition={ratePositions[0] || "hero_right"}
        rateOverlay={(hasPos("hero_left") || hasPos("hero_right")) ? (
          <ExchangeRateWidget currencies={rateCurrencies} heroOverlay textColor={rc?.textColor || ""} />
        ) : null}
      />

      {/* Quick Actions — show for all visitors (guest actions visible without login) */}
      {quickActions && (Array.isArray(quickActions) ? quickActions.length > 0 : Object.keys(quickActions).length > 0) && (
        <div>
          {hasPos("quick_actions") && (
            <div className="mb-2"><ExchangeRateWidget currencies={rateCurrencies} compact /></div>
          )}
          <QuickActionsGrid actions={quickActions} userRole={user?.role} />
        </div>
      )}

      {/* Steps — multi-section */}
      {stepsResolved.visible && stepsResolved.sections.map((section, si) => (
        <div key={si}>
          {section.heading && (
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{section.heading}</h2>
              {hasPos("steps_title") && si === 0 && (
                <ExchangeRateWidget currencies={rateCurrencies} compact />
              )}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(section.steps || []).map((step, i) => {
              const Icon = STEP_ICONS[i] || Package;
              return (
                <Card key={i} className="border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 bg-red-50 rounded flex items-center justify-center">
                        <Icon className="w-3.5 h-3.5 text-red-600" />
                      </div>
                      <span className="text-xs text-gray-400">Step {i + 1}</span>
                    </div>
                    <div className="font-medium text-sm text-gray-900 mb-1">{step.title}</div>
                    {step.desc && <div className="text-xs text-gray-500">{step.desc}</div>}
                    {step.image_url && <img src={step.image_url} alt={step.title} className="mt-2 w-full rounded object-contain max-h-32" />}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* Logistics Status Board */}
      {user && (recentOrders.length > 0 || boardConfig.faq_enabled) && (
        <LogisticsStatusBoard
          orders={recentOrders}
          boardConfig={boardConfig}
          faqCategories={faqCategories}
          rateWidget={hasPos("status_board") ? <ExchangeRateWidget currencies={rateCurrencies} compact /> : null}
        />
      )}

      {/* FAQ */}
      <FaqSection config={faqConfig} faqCategories={faqCategories} user={user} />
      {hasPos("faq") && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">实时汇率参考</h2>
          <ExchangeRateWidget currencies={rateCurrencies} faqMode />
        </div>
      )}
    </div>
  );
}