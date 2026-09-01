import { useState, useEffect, useCallback } from "react";
import { timePage } from "@/lib/timing";
import { base44 } from "@/api/base44Client";
import { tenantEntity } from "@/lib/tenantApi";
import { setTenantConfigCache } from "@/lib/configCache";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { MOCK_ADMIN_SETTINGS_DATA } from "@/mock/adminSettingsMock";
import { Settings, Save, Plus, Trash2, Star, Lock, Eye, EyeOff, Palette, Zap, Users, ExternalLink, Bell, Mail, AlertCircle, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ThemeSelector from "@/components/common/ThemeSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { t, getLocale } from "@/lib/i18n";

import ShippingMethodManager from "@/components/admin/ShippingMethodManager";
import LocalShippingMethodManager, { LocalShippingDetail, LocalShippingTree } from "@/components/admin/LocalShippingMethodManager";
import { useLocalShipping } from "@/hooks/useLocalShipping";
import PickupLocationManager from "@/components/admin/PickupLocationManager";
import OnlineStoreTagManager from "@/components/admin/OnlineStoreTagManager";
import TransitShippingMethodManager from "@/components/admin/TransitShippingMethodManager";
import ItemSizeTemplateManager from "@/components/admin/ItemSizeTemplateManager";
import BoxTemplateManager from "@/components/admin/BoxTemplateManager";
import AddonManager from "@/components/admin/AddonManager";
import MemberTierManager from "@/components/admin/MemberTierManager";
import CreditApplicationManager from "@/components/admin/CreditApplicationManager";
import PaymentMethodManager from "@/components/admin/PaymentMethodManager";
import TenantRoleManagerForUsers from "@/components/admin/TenantRoleManagerForUsers";
import PermissionViewer from "@/components/admin/PermissionViewer";
import CountrySettingsManager from "@/components/admin/CountrySettingsManager";
import GmailSettingsManager from "@/components/admin/GmailSettingsManager";
import SMTPSettingsManager from "@/components/admin/SMTPSettingsManager";
import GoogleSheetsSettingsManager from "@/components/admin/GoogleSheetsSettingsManager";
import StorageSettingsManager from "@/components/admin/StorageSettingsManager";
import PaymentModeSettings from "@/components/admin/PaymentModeSettings";
import OrderSplitSettings from "@/components/admin/OrderSplitSettings";
import ShipWithoutPaymentSettings from "@/components/admin/ShipWithoutPaymentSettings";
import OfficialPoolSettings from "@/components/admin/OfficialPoolSettings";
import PaymentTimeoutSettings from "@/components/admin/PaymentTimeoutSettings";
import AutoArchiveSettings from "@/components/admin/AutoArchiveSettings";
import NotificationTextSettings from "@/components/admin/NotificationTextSettings";
import QuickActionsManager from "@/components/admin/QuickActionsManager";
import LogisticsStatusBoardManager from "@/components/admin/LogisticsStatusBoardManager";
import HeroSectionManager from "@/components/admin/HeroSectionManager";
import BannerManager from "@/components/admin/BannerManager";
import StepsSectionManager from "@/components/admin/StepsSectionManager";
import FaqManager from "@/components/admin/FaqManager";
import TenantExchangeRateSettings from "@/components/admin/TenantExchangeRateSettings";
import ExchangeRateDisplayManager from "@/components/admin/ExchangeRateDisplayManager";
import TicketOrderSettings from "@/components/admin/TicketOrderSettings";

// ─── 本地运输方式：两列 Card 布局 ────────────────────────────
function LocalShippingTwoCol() {
  const state = useLocalShipping();
  if (state.loading) return <p className="text-gray-400 text-sm">加载中...</p>;
  return (
    <div className="flex flex-col xl:flex-row gap-5 items-start">
      <div className="flex-1 min-w-0">
        <Card className="border-gray-200 h-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">运输方式编辑</CardTitle>
            <p className="text-xs text-gray-400 mt-1">点击右侧条目后在此编辑详情，或新增运输方式</p>
          </CardHeader>
          <CardContent>
            <LocalShippingDetail state={state} />
          </CardContent>
        </Card>
      </div>
      <div className="flex-1 min-w-0">
        <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">运输公司 &amp; 方式排序</CardTitle>
            <p className="text-xs text-gray-400 mt-1">管理运输公司分组及方式排列顺序</p>
          </CardHeader>
          <CardContent>
            <LocalShippingTree state={state} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Standalone editor with its own local save button (textarea content is large, better kept isolated)
function CustomsHazmatTextEditor({ settings, onReload }) {
  const s = settings.find(s => s.key === 'customs_hazmat_text');
  const [localVal, setLocalVal] = useState(s?.value || "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setLocalVal(s?.value || ""); }, [s?.value]);
  return (
    <Card className="border-orange-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-700">危险物品确认文本（报关单）</CardTitle>
        <p className="text-xs text-gray-400 mt-1">用户通知发货时，报关单中会显示此内容并要求用户勾选同意。支持 Markdown 格式。留空则不显示。</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea rows={5} placeholder={"例：\n## 危险物品确认\n本次邮件中**不含**以下物品：\n- 锂电池、液体、粉末"}
          value={localVal} onChange={e => setLocalVal(e.target.value)} className="text-sm font-mono" />
        <Button size="sm" className="h-7 text-xs bg-orange-600 hover:bg-orange-700" disabled={saving}
          onClick={async () => {
            setSaving(true);
            if (s) {
              await tenantEntity.update('SiteSettings', s.id, { value: localVal });
            } else {
              await tenantEntity.create('SiteSettings', { key: 'customs_hazmat_text', value: localVal, description: '报关单危险物确认文本（Markdown）', category: 'general' });
            }
            await onReload();
            setSaving(false);
          }}>
          <Save className="w-3 h-3 mr-1" />{saving ? "保存中..." : "保存"}
        </Button>
      </CardContent>
    </Card>
  );
}

const DEFAULT_SETTINGS = [
  { key: "service_fee_rate", value: "10", description: "服务费率 (%)", category: "fee" },
  { key: "prepay_rate", value: "80", description: "预付款比率 (%)", category: "fee" },
  { key: "prepay_enabled", value: "true", description: "是否开启预付款", category: "fee" },
  { key: "jpy_usd_increment", value: "0", description: "日元/美元汇率增量（叠加在平台增量之上）", category: "fee" },
  { key: "jpy_cny_increment", value: "0", description: "日元/人民币汇率增量（叠加在平台增量之上）", category: "fee" },
  { key: "default_packing_fee_single", value: "0", description: "默认单独发货捆包作业手续费 (JPY)", category: "fee" },
  { key: "default_packing_fee_consolidation", value: "0", description: "默认拼邮发货捆包手续费 (JPY)", category: "fee" },
  { key: "transit_location_fee_split_enabled", value: "false", description: "中转地手续费是否平分", category: "fee" },
  { key: "allow_ship_without_payment", value: "false", description: "允许未付款时进入已发货状态（总开关）", category: "shipping" },
  { key: "allow_ship_without_payment_single", value: "false", description: "单独发货 - 允许未付款直接发货", category: "shipping" },
  { key: "allow_ship_without_payment_user_pool", value: "false", description: "用户拼邮发货 - 允许未付款直接发货", category: "shipping" },
  { key: "allow_ship_without_payment_official_pool", value: "false", description: "官方拼邮发货 - 允许未付款直接发货", category: "shipping" },
  { key: "fullpay_once_enabled", value: "false", description: "开启一次付款功能", category: "shipping" },
  { key: "fullpay_once_tolerance_jpy", value: "500", description: "一次付款运费误差容忍值（JPY）", category: "shipping" },
  { key: "site_name", value: "同一物流", description: "网站名称", category: "general" },
  { key: "contact_email", value: "", description: "联系邮箱", category: "general" },
  { key: "whatsapp", value: "", description: "WhatsApp", category: "general" },
  { key: "line_id", value: "", description: "Line ID", category: "general" },
  { key: "wechat_id", value: "", description: "微信号", category: "general" },
  { key: "paid_order_reminder", value: "感谢付款！我们会尽快开始处理您的订单。", description: "已付款订单的提示消息", category: "general" },
  { key: "admin_contact_info", value: "", description: "管理员联系方式（用于订单取消通知等）", category: "general" },
  { key: "alipay_account", value: "", description: "支付宝账号", category: "payment" },
  { key: "alipay_account_name", value: "", description: "支付宝收款人姓名", category: "payment" },
  { key: "alipay_qr_url", value: "", description: "支付宝收款码图片URL", category: "payment" },
  { key: "alipay_payment_note", value: "请在付款备注中填写您的订单号", description: "支付宝付款备注提示", category: "payment" },
];

const CAT_LABELS = { fee: "费率设置", payment: "支付设置", shipping: "运输设置", general: "基本信息" };
const CAT_COLORS = { fee: "bg-yellow-100 text-yellow-700", payment: "bg-green-100 text-green-700", shipping: "bg-blue-100 text-blue-700", general: "bg-gray-100 text-gray-600" };

// 导航配置（在组件内使用 t() 函数动态翻译）
const ADMIN_NAV_I18N_KEYS = {
  basic: {
    group: "基本设置",
    items: {
      home_customize: "主页自定义",
      countries: "国家·地区设置",
      exchange_rates: "汇率设置",
      notifications: "通知设置",
      reminder_texts: "提醒文案",
      theme: "界面主题",
    }
  },
  order: {
    group: "订单管理",
    items: {
      order_management: "商城标签规则",
      order_management_split: "订单管理",
      ticket_orders: "票务功能",
    }
  },
  standalone: {
    payment_methods: "支付方式",
    addons: "增值服务",
    fee_rules: "服务费规则",
    member_tiers: "会员阶级",
  },
  shipping: {
    group: "发货设置",
    items: {
      shipping_methods: "国际运输方式",
      local_shipping_methods: "本地运输方式",
      shipping_settings: '发货设定',
      transit_methods: "中转运输",
      item_sizes: "物品尺寸",
      box_templates: "外箱模板",
      storage: "库存存放",
      official_pool: "官方拼邮",
    }
  },
  permissions: "权限一览",
  adminPages: {
    group: "管理页面入口",
    items: {
      ext_announcements: "公告管理",
      ext_navbar: "导航栏设置",
      ext_users: "用户管理",
    }
  }
};

// Reusable toggle component (purely local state, no API call)
function Toggle({ enabled, onToggle, color = "bg-blue-600", size = "md" }) {
  const sizes = size === "sm"
    ? { outer: "h-5 w-9", inner: "h-3 w-3", on: "translate-x-5", off: "translate-x-1" }
    : { outer: "h-6 w-11", inner: "h-4 w-4", on: "translate-x-6", off: "translate-x-1" };
  return (
    <button type="button" onClick={onToggle}
      className={`relative inline-flex ${sizes.outer} items-center rounded-full transition-colors focus:outline-none ${enabled ? color : 'bg-gray-200'}`}>
      <span className={`inline-block ${sizes.inner} transform rounded-full bg-white transition-transform ${enabled ? sizes.on : sizes.off}`} />
    </button>
  );
}

export default function AdminSettings() {
  const { user } = useCurrentUser();
  const locale = getLocale();
  const [activeTab, setActiveTab] = useState("home_customize");
  const [settings, setSettings] = useState([]);
  const [addons, setAddons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  
  // 翻译文本
  const tx = {
    pageTitle: t("网站后台设置", locale),
    save: t("保存", locale),
    saving: t("保存中...", locale),
    saved: t("已保存 ✓", locale),
    loading: t("加载中...", locale),
    noAccess: t("仅管理员可访问此页面", locale),
  };

  const [newAddon, setNewAddon] = useState({ service_name: "", user_description: "", fee: "", fee_currency: "JPY", addon_type: "order", is_user_customizable: false, fee_min: 0, fee_max: 0 });
  const [editingAddon, setEditingAddon] = useState(null);
  const [editAddonFields, setEditAddonFields] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCat, setNewCat] = useState("general");

  // Tenant management state
  const [shippingMethods, setShippingMethods] = useState(null);
  const [transitMethods, setTransitMethods] = useState(null);
  const [itemSizeTemplates, setItemSizeTemplates] = useState(null);
  const [storeTagRules, setStoreTagRules] = useState(null);
  const [boxTemplates, setBoxTemplates] = useState(null);
  const [memberTiers, setMemberTiers] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [countriesConfig, setCountriesConfig] = useState(null);
  const [faqCategories, setFaqCategories] = useState([]);
  const [countriesConfigId, setCountriesConfigId] = useState(null);

  const syncAddonsToBackend = async (addonsData) => {
      await tenantEntity.sync('AddonOption', addonsData);
  };

  const load = useCallback(async () => {
    const t = timePage('AdminSettings');
    setLoadError(null);
    try {
      let r;
      try {
        r = await t.timeCall('getAdminSettingsPageData', () => base44.functions.invoke('admin/settings/getAdminSettingsPageData', {}));
      } catch (err) {
        console.warn('[AdminSettings] API 请求失败，使用 Mock 数据:', err.message);
        r = { data: MOCK_ADMIN_SETTINGS_DATA };
        
      }

      const data = r.data?.data || {};
      if (data.error) throw new Error(data.error);
      let settingsData = data.settings || [];

      // Only seed defaults if the backend explicitly returned an empty array AND we got a valid response
      // (not a silent error). Seed one by one to avoid duplicate key conflicts.
      if (settingsData.length === 0 && data.settings !== undefined) {
        const existingKeys = new Set(settingsData.map(s => s.key));
        const toCreate = DEFAULT_SETTINGS.filter(s => !existingKeys.has(s.key));
        if (toCreate.length > 0) {
          await Promise.all(toCreate.map(s => tenantEntity.create('SiteSettings', s)));
          const refreshed = await base44.functions.invoke('getAdminSettingsPageData', {});
          settingsData = refreshed.data?.settings || [];
        }
      }

      setSettings(settingsData);
      setAddons(data.addons || []);
      setShippingMethods(data.shippingMethods || []);
      setTransitMethods(data.transitMethods || []);
      setItemSizeTemplates(data.itemSizeTemplates || []);
      setStoreTagRules(data.storeTagRules || []);
      setBoxTemplates(data.boxTemplates || []);
      setMemberTiers(data.memberTiers || []);
      setPaymentMethods(data.paymentMethods || []);
      setFaqCategories(data.faqCategories || []);

      setCountriesConfig(data.countriesConfig || null);
      const ccRecord = (data.settings || []).find(s => s.key === 'tenant_countries_config');
      setCountriesConfigId(ccRecord?.id || null);

      if (data.announcements !== undefined) {
        setTenantConfigCache({
          announcements: data.announcements || [],
          shippingMethods: data.shippingMethods || [],
          transitMethods: data.transitMethods || [],
          transitLocations: data.transitLocations || [],
          itemSizeTemplates: data.itemSizeTemplates || [],
          storeTagRules: data.storeTagRules || [],
          addons: data.addons || [],
          countriesConfig: data.countriesConfig || null,
          navbarSettings: data.navbarSettings || null,
          settings: data.settings || [],
          faqCategories: data.faqCategories || [],
        });
      }
      t.done('data ready');
    } catch (err) {
      console.error('AdminSettings load error:', err);
      setLoadError(err.message || '加载失败');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === "addons" && addons.length > 0) {
      syncAddonsToBackend(addons);
    }
  }, [activeTab]);  // 仅在 tab 切换时触发，不依赖 addons（避免编辑时重复触发）

  // const isTenantAdmin = user?.role === "admin" || user?.role === "tenant_admin" || user?.role === "ROLE_ADMIN";
  const isTenantAdmin = user?.role === 'ROLE_TENANT_ADMIN' || user?.role === 'ROLE_ADMIN';
  // const isPlatformAdmin = user?.role === "platform_admin";
  const isPlatformAdmin = user?.role === 'ROLE_ADMIN'
  useEffect(() => { load(); }, [load]);

    const ADMIN_NAV = [
    { group: t(ADMIN_NAV_I18N_KEYS.basic.group, locale), children: Object.entries(ADMIN_NAV_I18N_KEYS.basic.items).map(([key, labelKey]) => ({ key, label: t(labelKey, locale) })) },
    { group: t(ADMIN_NAV_I18N_KEYS.order.group, locale), children: Object.entries(ADMIN_NAV_I18N_KEYS.order.items).map(([key, labelKey]) => ({ key, label: t(labelKey, locale) })) },
    ...Object.entries(ADMIN_NAV_I18N_KEYS.standalone).map(([key, labelKey]) => ({ key, label: t(labelKey, locale) })),
    { group: t(ADMIN_NAV_I18N_KEYS.shipping.group, locale), children: Object.entries(ADMIN_NAV_I18N_KEYS.shipping.items).map(([key, labelKey]) => ({ key, label: t(labelKey, locale) })) },
    { key: 'permissions', label: t(ADMIN_NAV_I18N_KEYS.permissions, locale) },
    { key: "__divider__" },
    { group: t(ADMIN_NAV_I18N_KEYS.adminPages.group, locale), children: Object.entries(ADMIN_NAV_I18N_KEYS.adminPages.items).map(([key, labelKey]) => ({ key, label: t(labelKey, locale), href: key.replace('ext_', '') })) },
  ];

  if (user && !isTenantAdmin && !isPlatformAdmin) {
    return <div className="text-center py-8 text-red-600">{tx.noAccess}</div>;
  }

  // Update a setting value in local state only (no API call)
  const updateSetting = (id, value) => {
    setSettings(prev => prev.map(s => s.id === id ? { ...s, value } : s));
  };

  // Metadata lookup for creating missing settings when toggled
  const settingMeta = (key) => DEFAULT_SETTINGS.find(d => d.key === key);

  // Update (or locally create) a setting by key — for text settings that may not exist yet
  const updateSettingByKey = (key, value, description = '', category = 'general') => {
    setSettings(prev => {
      if (!prev.some(s => s.key === key)) {
        return [...prev, { key, value, description, category }];
      }
      return prev.map(s => s.key === key ? { ...s, value } : s);
    });
  };

  // Toggle a boolean setting in local state; if the record doesn't exist yet,
  // add it locally so it gets created on save (fixes silent no-op for missing keys)
  const toggleSetting = (key) => {
    setSettings(prev => {
      if (!prev.some(s => s.key === key)) {
        const meta = settingMeta(key);
        return [...prev, { key, value: 'true', description: meta?.description || '', category: meta?.category || 'general' }];
      }
      return prev.map(s => s.key !== key ? s : { ...s, value: s.value === 'true' ? 'false' : 'true' });
    });
  };

  // For boolean settings that default to 'true' when missing (value !== 'false')
  const toggleSettingDefaultTrue = (key) => {
    setSettings(prev => {
      if (!prev.some(s => s.key === key)) {
        // Missing means currently "true" — toggling creates it as "false"
        const meta = settingMeta(key);
        return [...prev, { key, value: 'false', description: meta?.description || '', category: meta?.category || 'general' }];
      }
      return prev.map(s => s.key !== key ? s : { ...s, value: s.value === 'false' ? 'true' : 'false' });
    });
  };

  // Save all settings to backend
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await Promise.all(
        settings.map(s =>
          s.id
            ? tenantEntity.update('SiteSettings', s.id, { value: s.value, description: s.description })
            : tenantEntity.create('SiteSettings', { key: s.key, value: s.value, description: s.description || '', category: s.category || 'general' })
        )
      );
      // Reload so newly created settings get ids (prevents duplicate creation on next save)
      if (settings.some(s => !s.id)) await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!newKey || !newVal) return;
    await tenantEntity.create('SiteSettings', { key: newKey, value: newVal, description: newDesc, category: newCat });
    setNewKey(""); setNewVal(""); setNewDesc(""); setNewCat("general");
    await load();
  };

  const handleDelete = async (id) => {
    await tenantEntity.delete('SiteSettings', id);
    await load();
  };

  const handleAddAddon = async () => {
    if (!newAddon.service_name || newAddon.fee === "") return;
    await tenantEntity.create('AddonOption', {
      ...newAddon,
      fee: parseFloat(newAddon.fee) || 0,
      fee_min: parseFloat(newAddon.fee_min) || 0,
      fee_max: parseFloat(newAddon.fee_max) || 0,
      is_user_customizable: newAddon.is_user_customizable || false,
      is_active: true
    });
    setNewAddon({ service_name: "", user_description: "", fee: "", fee_currency: "JPY", addon_type: "order", is_user_customizable: false, fee_min: 0, fee_max: 0 });
    await load();
  };

  const handleDeleteAddon = async (id) => {
    await tenantEntity.delete('AddonOption', id);
    await load();
  };

  const handleEditAddon = (a) => {
    setEditingAddon(a.id);
    setEditAddonFields({
      service_name: a.service_name, user_description: a.user_description || "", fee: String(a.fee),
      fee_currency: a.fee_currency || "JPY", addon_type: a.addon_type || "order",
      is_user_customizable: a.is_user_customizable || false,
      min_fee: a.min_fee || 0, max_fee: a.max_fee || 0,
      is_active: a.is_active
    });
  };

  const handleSaveAddon = async (id) => {
    await tenantEntity.update('AddonOption', id, {
      ...editAddonFields,
      fee: parseFloat(editAddonFields.fee) || 0,
      fee_min: parseFloat(editAddonFields.fee_min) || 0,
      fee_max: parseFloat(editAddonFields.fee_max) || 0,
      is_active: editAddonFields.is_active
    });
    setEditingAddon(null);
    await load();
  };

  const toggleAddon = async (a) => {
    let param = {
      ...editAddonFields,
      fee: parseFloat(editAddonFields.fee) || 0,
      fee_min: parseFloat(editAddonFields.fee_min) || 0,
      fee_max: parseFloat(editAddonFields.fee_max) || 0,
      is_active: editAddonFields.is_active, is_active: !a.is_active
    };
    await tenantEntity.update('AddonOption', a.id, param);
    await load();
  };

  // Instant-save for credit_application_enabled (lives outside the main save flow)
  const handleCreditApplicationToggle = async (setting) => {
    const newVal = setting?.value === 'true' ? 'false' : 'true';
    if (setting) {
      await tenantEntity.update('SiteSettings', setting.id, { value: newVal });
    } else {
      await tenantEntity.create('SiteSettings', { key: 'credit_application_enabled', value: newVal, description: '允许用户申请记账功能', category: 'general' });
    }
    await load();
  };

  const flat = settings; // flat alias for clarity
  const getSetting = (key) => flat.find(s => s.key === key);
  const getVal = (key) => getSetting(key)?.value;
  const getBool = (key) => getVal(key) === 'true';
  const getBoolDefaultTrue = (key) => getVal(key) !== 'false';

  const grouped = settings.reduce((acc, s) => {
    const cat = s.category || "general";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{tx.pageTitle}</h1>

      </div>

      <div className="flex flex-col md:flex-row gap-5 items-start">
        {/* Left vertical nav */}
        <aside className="w-full md:w-48 flex-shrink-0 space-y-3 md:sticky md:top-20">
          {/* 基本设置导航 */}
          <div className="bg-white border border-gray-200 rounded-lg p-2 space-y-0.5">
            {ADMIN_NAV.filter(item => item.key !== '__divider__' && item.group !== '管理页面入口').map((item) => {
              if (item.children) return (
                <div key={item.group} className="pt-1.5">
                  <p className="px-3 py-1 text-xs font-semibold text-gray-400">{item.group}</p>
                  {item.children.map(c => c.href ? (
                    <Link key={c.key} to={createPageUrl(c.href)}
                      className="w-full flex items-center justify-between pl-6 pr-2 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                      {c.label}
                      <ExternalLink className="w-3 h-3 text-gray-300 flex-shrink-0" />
                    </Link>
                  ) : (
                    <button key={c.key} onClick={() => setActiveTab(c.key)}
                      className={`w-full text-left pl-6 pr-3 py-1.5 rounded-md text-sm transition-colors ${activeTab === c.key ? "bg-red-50 text-red-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              );
              return (
                <button key={item.key} onClick={() => setActiveTab(item.key)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${activeTab === item.key ? "bg-red-50 text-red-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* 管理页面入口 — 独立卡片 */}
          {(() => {
            const adminEntries = ADMIN_NAV.find(item => item.group === '管理页面入口');
            if (!adminEntries) return null;
            return (
              <div className="bg-white border border-gray-200 rounded-lg p-2 space-y-0.5">
                <p className="px-3 py-1 text-xs font-semibold text-gray-400">{adminEntries.group}</p>
                {adminEntries.children.map(c => (
                  <Link key={c.key} to={createPageUrl(c.href)}
                    className="w-full flex items-center justify-between pl-6 pr-2 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                    {c.label}
                    <ExternalLink className="w-3 h-3 text-gray-300 flex-shrink-0" />
                  </Link>
                ))}
              </div>
            );
          })()}
        </aside>

        {/* Main content — wider for home_customize tab */}
        <div className={`flex-1 min-w-0 space-y-5 ${["home_customize","local_shipping_methods","payment_methods","shipping_methods","transit_methods","member_tiers"].includes(activeTab) ? "" : "max-w-2xl"}`}>

      {activeTab === "home_customize" && !loading && (
        <div className="flex flex-col xl:flex-row gap-5 items-start">
          {/* 左列 */}
          <div className="flex-1 min-w-0 space-y-5">
            <BannerManager settings={settings} onReload={load} />
            <HeroSectionManager settings={settings} onReload={load} />
            <QuickActionsManager settings={settings} onReload={load} />
            <ExchangeRateDisplayManager settings={settings} onReload={load} />
          </div>
          {/* 右列 */}
          <div className="flex-1 min-w-0 space-y-5">
            <StepsSectionManager settings={settings} onReload={load} faqCategories={faqCategories} />
            <LogisticsStatusBoardManager settings={settings} onReload={load} faqCategories={faqCategories} />
            <FaqManager settings={settings} onReload={load} faqCategories={faqCategories} />
            <Card className="border-teal-200">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">帮助中心 · 问答内容管理</p>
                    <p className="text-xs text-gray-400 mt-0.5">创建分类、编写问答内容（支持 Markdown），供主页 FAQ 区块和帮助中心页使用</p>
                  </div>
                  <Link to={createPageUrl("AdminFaq")}>
                    <Button size="sm" className="h-7 text-xs bg-teal-600 hover:bg-teal-700">
                      <ExternalLink className="w-3.5 h-3.5 mr-1" />进入管理
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      {activeTab === "home_customize" && loading && <p className="text-gray-400 text-sm">加载中...</p>}

      {activeTab === "order_management" && (
        <Card className="border-gray-200">
          <CardContent className="pt-5">
            <OnlineStoreTagManager initialData={storeTagRules} />
          </CardContent>
        </Card>
      )}

      {activeTab === "order_management_split" && !loading && (
        <div className="space-y-4">
          <OrderSplitSettings settings={settings} onReload={load} />
          <PaymentTimeoutSettings settings={settings} onReload={load} />
          <AutoArchiveSettings settings={settings} onReload={load} />
        </div>
      )}
      {activeTab === "order_management_split" && loading && <p className="text-gray-400 text-sm">加载中...</p>}

      {activeTab === "ticket_orders" && !loading && (
        <TicketOrderSettings settings={settings} onReload={load} />
      )}
      {activeTab === "ticket_orders" && loading && <p className="text-gray-400 text-sm">加载中...</p>}

      {activeTab === "addons" && (
        <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500" />增值服务设置
            </CardTitle>
            <p className="text-xs text-gray-400 mt-1">下单增值服务在提交订单时展示，发货增值服务在通知发货/预出货时展示。</p>
          </CardHeader>
          <CardContent>
            <AddonManager
              addons={addons} editingAddon={editingAddon} editAddonFields={editAddonFields}
              newAddon={newAddon} setEditAddonFields={setEditAddonFields} setNewAddon={setNewAddon}
              onEdit={handleEditAddon} onCancelEdit={() => setEditingAddon(null)}
              onSave={handleSaveAddon} onToggle={toggleAddon} onDelete={handleDeleteAddon} onAdd={handleAddAddon}
            />
          </CardContent>
        </Card>
      )}

      {activeTab === "fee_rules" && (
        <div className="space-y-4">
          {/* 兜底服务费设置（轻量用户简单配置） */}
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-700">默认服务费设置</CardTitle>
                <Button size="sm" className="h-7 text-xs bg-gray-800 hover:bg-gray-700" onClick={handleSaveAll} disabled={saving}>
                  <Save className="w-3 h-3 mr-1" />{saved ? "已保存 ✓" : saving ? "保存中..." : "保存"}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1">作为兜底规则：当订单未命中任何服务费规则时使用此处设置。也适合不需要复杂规则的轻量场景。</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const rateSetting = getSetting('service_fee_rate');
                const fixedSetting = getSetting('default_order_fixed_fee_jpy');
                return (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-gray-500 block mb-1">下单服务费率（%）</Label>
                      <div className="flex items-center gap-1">
                        <Input type="number" step="0.1" min="0" className="h-8 text-sm flex-1"
                          value={rateSetting?.value || '10'}
                          onChange={e => updateSetting(rateSetting?.id, e.target.value)} />
                        <span className="text-xs text-gray-400 px-2">%</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">基于商品货款金额的百分比</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 block mb-1">下单固定手续费（JPY）</Label>
                      <div className="flex items-center gap-1">
                        <Input type="number" step="1" min="0" className="h-8 text-sm flex-1"
                          value={fixedSetting?.value || '0'}
                          onChange={e => updateSettingByKey('default_order_fixed_fee_jpy', e.target.value, '下单固定手续费（JPY）', 'fee')} />
                        <span className="text-xs text-gray-400 px-2">JPY</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">每笔订单额外收取的固定费用</p>
                    </div>
                  </div>
                );
              })()}
              <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs text-gray-500">
                最终服务费 = 货款 × 费率% + 固定手续费，再应用最低/封顶限制（如在规则中心配置）
              </div>
            </CardContent>
          </Card>

          {/* 高级规则引擎 */}
          <Card className="border-yellow-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500" />服务费规则引擎（高级）
              </CardTitle>
              <p className="text-xs text-gray-400 mt-1">支持按客户等级、下单网站、金额阶梯及自定义公式设置差异化服务费，优先级高于上方默认设置。</p>
            </CardHeader>
            <CardContent>
              <Link to={createPageUrl("AdminFeeRules")}>
                <Button className="bg-yellow-600 hover:bg-yellow-700 w-full sm:w-auto">
                  <ExternalLink className="w-4 h-4 mr-2" />进入服务费规则中心
                </Button>
              </Link>
              <p className="text-xs text-gray-400 mt-3">在规则中心可以创建多条规则、设置生效时间和优先级、使用高级公式，并在保存前进行实时测试预览。</p>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "payment_methods" && (
        <div className="flex flex-col xl:flex-row gap-5 items-start">
          {/* 左列：支付方式管理 */}
          <div className="flex-1 min-w-0">
            <Card className="border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-gray-700">支付方式管理</CardTitle>
                <p className="text-xs text-gray-400 mt-1">支付宝自动支付的密钥可在添加后点击「密钥」按钮配置。</p>
              </CardHeader>
              <CardContent>
                <PaymentMethodManager onReload={load} />
              </CardContent>
            </Card>
          </div>
          {/* 右列：预付款设置 + 待付款提示 */}
          {!loading && (
            <div className="w-full xl:w-80 flex-shrink-0 space-y-4">
              <PaymentModeSettings settings={settings} onReload={load} />
              {(() => {
                const reminderSetting = getSetting('payment_pending_reminder');
                return (
                  <Card className="border-yellow-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-sm font-semibold text-gray-700">待付款页面提示</CardTitle>
                          <p className="text-xs text-gray-400 mt-1">用户进入付款页时，显示在订单金额下方的提示文字。留空不显示。</p>
                        </div>
                        <Button size="sm" className="h-7 text-xs bg-yellow-600 hover:bg-yellow-700" disabled={saving}
                          onClick={handleSaveAll}>
                          <Save className="w-3 h-3 mr-1" />{saved ? "已保存 ✓" : saving ? "保存中..." : "保存"}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Input
                        className="h-8 text-sm"
                        placeholder="请在付款截止日期前完成支付，以免订单被取消。"
                        value={reminderSetting?.value ?? ""}
                        onChange={e => updateSettingByKey('payment_pending_reminder', e.target.value, '待付款页面提示', 'general')}
                      />
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {activeTab === "member_tiers" && (
        <div className="space-y-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700">会员阶级管理</CardTitle>
              <p className="text-xs text-gray-400 mt-1">设置会员阶级，为不同等级用户配置记账功能和结帐规则。</p>
            </CardHeader>
            <CardContent>
              <MemberTierManager initialData={memberTiers} onReload={load} />
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700">记账申请设置</CardTitle>
              <p className="text-xs text-gray-400 mt-1">开启后，没有记账权限的普通用户可在个人设置中申请开启记账功能。</p>
            </CardHeader>
            <CardContent>
              {(() => {
                const setting = getSetting('credit_application_enabled');
                return (
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">允许用户申请记账功能</Label>
                      <p className="text-xs text-gray-400 mt-0.5">开启后用户可在个人设置中提交记账申请</p>
                    </div>
                    <Toggle enabled={setting?.value === 'true'} onToggle={() => handleCreditApplicationToggle(setting)} color="bg-blue-600" />
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <CreditApplicationManager />
        </div>
      )}

      {activeTab === "shipping_methods" && (
        <Card className="border-gray-200">
          <CardContent className="pt-5">
            <ShippingMethodManager initialData={shippingMethods} itemSizeTemplates={itemSizeTemplates || []} onReload={load} settings={settings} />
          </CardContent>
        </Card>
      )}

      {activeTab === "local_shipping_methods" && (
        <div className="space-y-5">
          <LocalShippingTwoCol />
          <Card className="border-purple-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700">自提地点设置</CardTitle>
              <p className="text-xs text-gray-400 mt-1">独立管理自提取货地点，包括名称、手续费、说明及图片</p>
            </CardHeader>
            <CardContent>
              <PickupLocationManager />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "shipping_settings" && !loading && (
        <ShipWithoutPaymentSettings settings={settings} onReload={load} />
      )}

      {activeTab === "official_pool" && (
        <OfficialPoolSettings settings={settings} />
      )}

      {activeTab === "transit_methods" && (
        <div className="space-y-4">
          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-700">中转地手续费平分</CardTitle>
                <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700" onClick={handleSaveAll} disabled={saving}>
                  <Save className="w-3 h-3 mr-1" />{saved ? "已保存 ✓" : saving ? "保存中..." : "保存"}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1">控制中转地手续费的计算方式</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">中转地手续费平分</Label>
                  <p className="text-xs text-gray-400 mt-0.5">开启后，中转地的手续费将按重量比例平摊给参与拼邮的所有客户；关闭则每个客户单独计算一次中转地手续费</p>
                </div>
                <Toggle enabled={getBool('transit_location_fee_split_enabled')} onToggle={() => toggleSetting('transit_location_fee_split_enabled')} color="bg-blue-600" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-gray-200">
            <CardContent className="pt-5">
              <TransitShippingMethodManager initialData={transitMethods} />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "item_sizes" && (
        <Card className="border-gray-200">
          <CardContent className="pt-5">
            <ItemSizeTemplateManager initialData={itemSizeTemplates} onReload={load} />
          </CardContent>
        </Card>
      )}

      {activeTab === "box_templates" && (
        <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">外箱模板管理</CardTitle>
            <p className="text-xs text-gray-400 mt-1">管理员填写发货信息时可选取外箱，外箱自重和费用将计入发货记录。</p>
          </CardHeader>
          <CardContent>
            <BoxTemplateManager initialData={boxTemplates || []} onReload={load} />
          </CardContent>
        </Card>
      )}

      {activeTab === "store_tags" && (
        <Card className="border-gray-200">
          <CardContent className="pt-5">
            <OnlineStoreTagManager initialData={storeTagRules} />
          </CardContent>
        </Card>
      )}

      {activeTab === "countries" && (
        <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">国家·地区设置</CardTitle>
            <p className="text-xs text-gray-400 mt-1">控制哪些国家·地区出现在收货地址选框中，并设置显示顺序。置顶的国家在所有下拉框中优先显示。</p>
          </CardHeader>
          <CardContent>
            <CountrySettingsManager initialConfig={countriesConfig} settingId={countriesConfigId} onReload={load} />
          </CardContent>
        </Card>
      )}

      {activeTab === "exchange_rates" && !loading && (
        <TenantExchangeRateSettings settings={settings} onReload={load} />
      )}
      {activeTab === "exchange_rates" && loading && <p className="text-gray-400 text-sm">加载中...</p>}

      {activeTab === "storage" && (
        <div className="space-y-4">
          <StorageSettingsManager onReload={load} />
          
          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700">
                功能说明
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-600">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5" />
                <div>
                  <strong>模块化功能：</strong>
                  <p className="text-gray-500 text-xs mt-0.5">
                    管理员可选择开启或关闭库存管理功能。关闭后，相关设置和功能不再显示，不影响其他功能正常使用。
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5" />
                <div>
                  <strong>存放期限：</strong>
                  <p className="text-gray-500 text-xs mt-0.5">
                    从订单入库日开始计算，管理员可设置默认存放天数（默认 90 天）。
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5" />
                <div>
                  <strong>到期行为：</strong>
                  <p className="text-gray-500 text-xs mt-0.5">
                    管理员可设置到期后自动执行的操作：发送提醒、追加仓储费用、更新订单状态为「已超时」。
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5" />
                <div>
                  <strong>仓储管理费：</strong>
                  <p className="text-gray-500 text-xs mt-0.5">
                    可设置每日仓储费用，支持按外箱模板单独设置（优先级高于默认设置）。费用累计至运费结算时一并收取。
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5" />
                <div>
                  <strong>通知模板：</strong>
                  <p className="text-gray-500 text-xs mt-0.5">
                    系统自动创建 3 个通知模板：即将到期通知、已到期通知、需要支付逾期费用通知。可在通知模板管理中自定义内容。
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5" />
                <div>
                  <strong>自动化检查：</strong>
                  <p className="text-gray-500 text-xs mt-0.5">
                    系统每日自动检查超期订单，执行管理员设置的操作（提醒、收费、变更状态）。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}



      {activeTab === "permissions" && (
        <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">权限一览</CardTitle>
            <p className="text-xs text-gray-400 mt-1">系统支持的所有权限项，可用于角色配置与用户权限覆写。</p>
          </CardHeader>
          <CardContent><PermissionViewer /></CardContent>
        </Card>
      )}

      {activeTab === "notifications" && (
        <div className="space-y-4">
          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Bell className="w-4 h-4 text-blue-500" />通知模板管理
              </CardTitle>
              <p className="text-xs text-gray-400 mt-1">管理当前租户的通知模板，包括标题、内容模板和默认发送方式</p>
            </CardHeader>
            <CardContent>
              <Link to={createPageUrl("AdminNotificationTemplates")}>
                <Button className="bg-blue-600 hover:bg-blue-700 w-full">
                  <ExternalLink className="w-4 h-4 mr-2" />进入通知模板管理
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-green-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Settings className="w-4 h-4 text-green-500" />通知默认设置
              </CardTitle>
              <p className="text-xs text-gray-400 mt-1">设置新用户的默认通知偏好，包括站内通知和邮件通知的开关</p>
            </CardHeader>
            <CardContent>
              <Link to={createPageUrl("AdminNotificationDefaults")}>
                <Button className="bg-green-600 hover:bg-green-700 w-full">
                  <ExternalLink className="w-4 h-4 mr-2" />进入默认设置管理
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-purple-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Mail className="w-4 h-4 text-purple-500" />Gmail 邮箱设置
              </CardTitle>
              <p className="text-xs text-gray-400 mt-1">配置租户 Gmail 邮箱，用于发送通知邮件</p>
            </CardHeader>
            <CardContent>
              <GmailSettingsManager />
            </CardContent>
          </Card>

          <GoogleSheetsSettingsManager onReload={load} />

          <Card className="border-cyan-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Mail className="w-4 h-4 text-cyan-500" />SMTP 邮箱设置
              </CardTitle>
              <p className="text-xs text-gray-400 mt-1">配置自定义 SMTP 服务器发送通知邮件，支持所有主流邮箱服务商</p>
            </CardHeader>
            <CardContent>
              <SMTPSettingsManager />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "reminder_texts" && !loading && (
        <div className="space-y-5">
          <NotificationTextSettings settings={settings} onReload={load} />
          <CustomsHazmatTextEditor settings={flat} onReload={load} />
          
          {/* 管理员联系方式设置 */}
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-gray-700">管理员联系方式</CardTitle>
                  <p className="text-xs text-gray-400 mt-1">用于订单取消通知等场景，用户可联系的管理员信息</p>
                </div>
                <Button size="sm" className="h-7 text-xs bg-gray-800 hover:bg-gray-700" onClick={handleSaveAll} disabled={saving}>
                  <Save className="w-3 h-3 mr-1" />{saved ? "已保存 ✓" : saving ? "保存中..." : "保存"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const contactSetting = getSetting('admin_contact_info');
                return (
                  <div className="space-y-2">
                    <Input
                      className="h-9 text-sm"
                      placeholder="例如：微信：admin123 / Line: tokunyi / 邮箱：support@tongyi.com"
                      value={contactSetting?.value || ''}
                      onChange={e => updateSettingByKey('admin_contact_info', e.target.value, '管理员联系方式（用于取消通知等）', 'general')}
                    />
                    <p className="text-xs text-gray-500">
                      此联系方式将显示在订单取消通知中，用户可通过此方式联系管理员处理退款等事宜
                    </p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}
      {activeTab === "reminder_texts" && loading && <p className="text-gray-400 text-sm">加载中...</p>}

      {activeTab === "theme" && (
        <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Palette className="w-4 h-4 text-purple-500" />界面主题
            </CardTitle>
            <p className="text-xs text-gray-400 mt-1">选择网站整体视觉风格，设置仅对当前浏览器生效</p>
          </CardHeader>
          <CardContent><ThemeSelector /></CardContent>
        </Card>
      )}


        </div>{/* end main content */}
      </div>{/* end flex row */}
    </div>
  );
}