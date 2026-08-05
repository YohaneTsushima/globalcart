import { useState, useEffect } from "react";
import { parseNaturalPrice } from "@/lib/naturalNumber";
import { detectPrimaryStoreTagResult } from "@/lib/onlineStoreTag";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { timePage } from "@/lib/timing";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ShoppingBag, Info, Upload, Plus, X, HelpCircle, AlertTriangle, Lock, Truck } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import FeeCalculator from "@/components/orders/FeeCalculator";
import PaymentSection from "@/components/orders/PaymentSection";
import ImageUploader from "@/components/common/ImageUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { t, getLocale } from "@/lib/i18n";

// Default prepay rate fallback
const DEFAULT_PREPAY_RATE = 0.80;

// ─── DEV MOCK ───────────────────────────────────────────────────────────────
const IS_DEV_MOCK = import.meta.env.VITE_DEV_MOCK === 'true';

const MOCK_PAGE_DATA = {
  addons: [
    // { id: 'addon-1', name: '商品拍照', fee: 300, feeCurrency: 'JPY', description: '入库时拍摄商品实物照片', isUserCustomizable: false },
    // { id: 'addon-2', name: '代缴消费税', fee: 0, feeCurrency: 'JPY', description: '代垫消费税金额（自定义）', isUserCustomizable: true, min_fee: 100, max_fee: 50000 },
    // { id: 'addon-3', name: '逗你玩的', fee: 111110, feeCurrency: 'JPY', description: '我也不知道（自定义）', isUserCustomizable: true, min_fee: 100, max_fee: 50000 }
  ],
  rates: { 
    //jpy_cny: 0.049, jpy_usd: 0.0067, jpy_twd: 0.21 
  },
  activeRule: {
    // id: 'rule-dev', name: '标准服务费 8%', mode: 'simple', simple_rate: 8, simple_fixed_fee: 0,
    // min_fee: 0, max_fee: 0, round_mode: 'round', round_unit: 1, version: 1,
  },
  settings: {
    // prepay_enabled: 'false',
    // prepay_rate: '80',
    // service_fee_rate: '8',
    // pre_shipment_enabled: 'true',
    // product_url_tips: '输入日本商城的商品链接，支持多个链接',
  }
};

const MOCK_PAYMENT_METHODS = {
  methods: [
    // { id: 'pm-1', name: '支付宝', provider_key: 'alipay', payment_currency: 'CNY', icon: '💰', color: 'bg-blue-100 text-blue-700', is_active: true, sort_order: 0, surcharge_rate: 0, surcharge_fixed_jpy: 0 },
    // { id: 'pm-2', name: '银行转账', provider_key: '', payment_currency: 'JPY', icon: '🏦', color: 'bg-gray-100 text-gray-700', is_active: true, sort_order: 1, surcharge_rate: 0, surcharge_fixed_jpy: 0 },
  ],
};

const MOCK_SHIPPING_METHODS = {
  methods: [
    // { id: 'sm-1', name: 'EMS', code: 'EMS', transit_days: '5-10个工作日', is_active: true },
    // { id: 'sm-2', name: 'SAL', code: 'SAL', transit_days: '2-3个月', is_active: true },
  ],
};
// ────────────────────────────────────────────────────────────────────────────

export default function SubmitOrder() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { can } = usePermissions();
  const locale = getLocale();
  const canSubmitOrder = can("order:submit_purchase_request");
  const canSplitOrder = can("order:submit_split_request");
  const canSelectOrderAddons = can("addon:select_order_value_added_services");
  const canPrePay = can("payment:pre_pay");
  const canFullPay = can("payment:pay_full_amount");
  const canDeferredPay = can("payment:deferred_pay");
  const canApplyCredit = can("payment:apply_credit");
  const [rates, setRates] = useState(null);
  const [settings, setSettings] = useState({});
  const [activeRule, setActiveRule] = useState(null);
  const [productUrls, setProductUrls] = useState([""]);
  const [urlMode, setUrlMode] = useState("multi");
  const [addonOptions, setAddonOptions] = useState([]);
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [addonCustomFees, setAddonCustomFees] = useState({});
  const [addonFeeErrors, setAddonFeeErrors] = useState({});
  const [form, setForm] = useState({
    order_name: "", product_description: "",
    estimated_jpy: "", prepayment_currency: "JPY",
    user_note: "", product_image_url: "", note_image_url: "", online_store_tag: "其它"
  });
  const [calculated, setCalculated] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingForm, setPendingForm] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMode, setPaymentMode] = useState("");
  const [userCredit, setUserCredit] = useState(null);
  const [creditDowngradeMsg, setCreditDowngradeMsg] = useState(null);
  const [shippingMethods, setShippingMethods] = useState([]);

  useEffect(() => {
    
    if (IS_DEV_MOCK) {
      const data = MOCK_PAGE_DATA;
      setAddonOptions(data.addons);
      setRates(data.rates);
      setActiveRule(data.active_rule);
      setSettings(data.settings);
      setPaymentMode(data.settings.prepay_enabled !== 'false' ? "prepay" : "fullpay");
      setUserCredit(null);
      setPaymentMethods(MOCK_PAYMENT_METHODS.methods);
      setShippingMethods(MOCK_SHIPPING_METHODS.methods);
      return;
    }

    const timer = timePage('SubmitOrder');
    Promise.all([
      timer.timeCall('getSubmitOrderPageData', () => base44.functions.invoke('config/page/getSubmitOrderPageData', {}))
    ]).then(([r]) => {
      const data = r.data || {};
      setAddonOptions(data.addons || []);
      setRates(data.rates || null);
      setActiveRule(data.active_rule || null);
      const parsed = {};
      Object.entries(data.settings || {}).forEach(([k, v]) => { parsed[k] = v; });
      setSettings(parsed);
      const prepayOn = parsed.prepay_enabled !== 'false';
      setPaymentMode(prepayOn ? "prepay" : "fullpay");
      setUserCredit(null);
      timer.done('data ready');
    }).catch((err) => { console.error('SubmitOrder data load failed:', err); });
    
    base44.functions.invoke('config/page/getPaymentMethod', {})
      .then((r) => { setPaymentMethods(r?.data?.payment_methods || []); })
      .catch(() => {});
    
    base44.functions.invoke('shipping/getTenantShippingPools', { action: 'list_shipping_methods' })
      .then((r) => { setShippingMethods(r.data?.methods || []); })
      .catch(() => {});
  }, []);

  const getAddonTotal = () => selectedAddons.reduce((sum, id) => {
    const opt = addonOptions.find((a) => a.id === id);
    if (!opt) return sum;
    const customFee = addonCustomFees[id];
    const isCustomizable = opt.is_user_customizable;
    const effectiveFee = isCustomizable && customFee !== undefined ? customFee : parseFloat(opt.fee) || 0;
    const feeCur = opt.fee_currency || "JPY";
    if (feeCur === "JPY") return sum + effectiveFee;
    const rateKey = `jpy_${feeCur.toLowerCase()}`;
    const rate = rates?.[rateKey] || 1;
    return sum + effectiveFee / rate;
  }, 0);

  const calculate = async () => {
    const jpy = parseFloat(form.estimated_jpy);
    if (!jpy || jpy <= 0) { setCalculated(null); return; }
    
    const prepayEnabled = settings.prepay_enabled !== 'false';
    let prepayRatePct = parseFloat(settings.prepay_rate);
    if (isNaN(prepayRatePct) || prepayRatePct <= 0 || prepayRatePct > 100) prepayRatePct = DEFAULT_PREPAY_RATE * 100;
    const prepayRate = prepayEnabled ? prepayRatePct / 100 : 1.0;
    const addonTotalJpy = getAddonTotal();

    let serviceFeeJpy = 0;
    let feeRateDisplay = null;
    let feeSteps = null;

    try {

      if (activeRule) {
        const urlsForTag = urlMode === "textarea"
          ? (productUrls[0] || "").split("\n").map(s => s.trim()).filter(Boolean).join("\n")
          : productUrls.filter(u => u.trim()).join("\n");
        const previewTagResult = await detectPrimaryStoreTagResult(urlsForTag);
        const variables = {
          goodsAmount: jpy,
          orderAmount: jpy,
          itemCount: 1,
          sourceSite: previewTagResult.tag_label || '其它',
          customerLevel: '',
          valueAddedServiceAmount: addonTotalJpy,
          paymentSurcharge: 0,
        };
        // const res = IS_DEV_MOCK
        //   ? { data: { fee: Math.round(variables.goodsAmount * (activeRule.simple_rate / 100)), steps: null } }
        //   : await base44.functions.invoke('serviceFeeRuleEngine', { action: 'evaluate', variables, rule: activeRule });
        const res = { data: { fee: Math.round(variables.goodsAmount * (activeRule.simple_rate / 100)), steps: null } };
        
        serviceFeeJpy = res.data?.fee ?? 0;
        feeRateDisplay = activeRule.name;
        feeSteps = res.data?.steps || null;
      } else {
        const fallbackRate = (parseFloat(settings.service_fee_rate) || 10) / 100;
        serviceFeeJpy = jpy * fallbackRate;
        feeRateDisplay = `${(parseFloat(settings.service_fee_rate) || 10).toFixed(0)}%`;
      }
    } catch (err) {
      console.error('calculate serviceFee failed:', err);
      const fallbackRate = (parseFloat(settings.service_fee_rate) || 10) / 100;
      serviceFeeJpy = jpy * fallbackRate;
      feeRateDisplay = `${(parseFloat(settings.service_fee_rate) || 10).toFixed(0)}%`;
    }

    const totalJpy = jpy + serviceFeeJpy + addonTotalJpy;
    const prepayJpy = totalJpy * prepayRate;
    setCalculated({
      jpy,
      serviceFeeJpy,
      addonTotal: addonTotalJpy,
      totalJpy,
      prepayJpy,
      feeRateDisplay,
      feeSteps,
      prepayRate: (prepayRate * 100).toFixed(0)
    });
  };

  useEffect(() => { if (form.estimated_jpy) calculate(); }, [form.estimated_jpy, selectedAddons, addonCustomFees, settings, activeRule]);

  const deleteImageByUrl = async (imageUrl, path = "submitOrder") => {
    if (!imageUrl) return;
    try {
      await base44.integrations.Core.DeleteFile({ imageUrl, path });
    } catch (_) {}
  };

  const deleteProductImage = async () => {
    const url = form.product_image_url;
    if (!url) return;
    setForm((f) => ({ ...f, product_image_url: "" }));
    await deleteImageByUrl(url);
  };

  const handleProductImageUpload = async (file, path) => {
    if (!file) return;
    if (form.product_image_url) {
      await deleteImageByUrl(form.product_image_url);
    }
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file, path });
      setForm((f) => ({ ...f, product_image_url: file_url || "" }));
    } catch (err) {
      console.error('图片上传失败:', err);
    }
    setUploading(false);
  };

  const handleNoteImageUpload = async (file, path) => {
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file, path });
    setForm((f) => ({ ...f, note_image_url: file_url }));
    setUploading(false);
  };

  const handleUrlChange = (idx, val) => {
    setProductUrls((prev) => prev.map((u, i) => i === idx ? val : u));
  };

  const handleUrlKeyDown = (e, idx) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      setProductUrls((prev) => [...prev.slice(0, idx + 1), "", ...prev.slice(idx + 1)]);
    }
  };

  const addUrl = () => setProductUrls((prev) => [...prev, ""]);
  const removeUrl = (idx) => setProductUrls((prev) => prev.filter((_, i) => i !== idx));
  const toggleAddon = (id) => {
    setSelectedAddons((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    // Clear error when toggling off
    if (selectedAddons.includes(id)) {
      setAddonFeeErrors(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
    }
  };

  const validateAddonFee = (addonId, fee) => {
    const addon = addonOptions.find(a => a.id === addonId);
    if (!addon || !addon.is_user_customizable) return null;
    
    const minFee = parseFloat(addon.fee_min) || 0;
    const maxFee = parseFloat(addon.fee_max) || Infinity;
    
    if (fee < minFee) return `${t("金额不能低于", locale)} ${minFee} ${addon.fee_currency || 'JPY'}`;
    if (maxFee > 0 && fee > maxFee) return `${t("金额不能高于", locale)} ${maxFee} ${addon.fee_currency || 'JPY'}`;
    return null;
  };

  const handleAddonFeeChange = (addonId, value) => {
    const val = parseFloat(value);
    const fee = isNaN(val) ? 0 : val;
    
    setAddonCustomFees(prev => ({ ...prev, [addonId]: fee }));
    
    // Validate and update errors
    const error = validateAddonFee(addonId, fee);
    setAddonFeeErrors(prev => ({
      ...prev,
      [addonId]: error
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate all customizable addon fees
    const validationErrors = {};
    let hasErrors = false;
    selectedAddons.forEach(addonId => {
      const addon = addonOptions.find(a => a.id === addonId);
      if (addon && addon.is_user_customizable) {
        const fee = addonCustomFees[addonId] || 0;
        const error = validateAddonFee(addonId, fee);
        if (error) {
          validationErrors[addonId] = error;
          hasErrors = true;
        }
      }
    });
    
    setAddonFeeErrors(validationErrors);

    if (hasErrors) {
      toast.error(t('请修正所有自定义金额的错误', locale));
      return;
    }

    const selectedAddonObjects = selectedAddons.map((id) => {
      const addon = addonOptions.find((a) => a.id === id);
      if (!addon) return null;
      const customFee = addonCustomFees[id];
      const isCustomizable = addon.is_user_customizable;
      return {
        id: addon.id,
        service_name: addon.service_name,
        fee: isCustomizable && customFee !== undefined ? customFee : parseFloat(addon.fee) || 0,
        feeCurrency: addon.fee_currency || "JPY"
      };
    }).filter(Boolean);
    
    const urlsText = urlMode === "textarea" ?
      (productUrls[0] || "").split("\n").map((s) => s.trim()).filter(Boolean).join("\n") :
      productUrls.filter((u) => u.trim()).join("\n");
    
    const isCredit = paymentMode === "credit_weekly" || paymentMode === "credit_monthly";
    const isDeferred = paymentMode === "deferred";
    const tagResult = await detectPrimaryStoreTagResult(urlsText);

    // 根据付款模式决定预付金额
    let prepaymentAmount = 0;
    let prePayEnabled = (paymentMode === 'prepay');
    if (paymentMode === "prepay") {
      prepaymentAmount = calculated ? parseFloat(calculated.prepayJpy) : 0;
    } else if (paymentMode === "fullpay" || paymentMode === "deferred") {
      prepaymentAmount = calculated ? parseFloat(calculated.totalJpy) : 0;
    }
    // credit → 0

    // paymentMode → payment_mode 映射
    const paymentModeMap = { prepay: "prepay", fullpay: "fullpay_once", deferred: "deferred", credit_weekly: "credit", credit_monthly: "credit" };
    
    // 获取用户选择的付款方式和对应货币
    const selectedMethodObj = paymentMethods.find((m) => (m.provider_key || m.id) === paymentMethod);
    const selectedCurrency = selectedMethodObj?.payment_currency || "JPY";
    
    try {
      const submitForm = {
            ...form,
            product_link: urlsText,
            user_email: user.email,
            user_name: user.full_name || user.email,
            // userId: user.id,
            quantity: 1,
            provider_key: selectedMethodObj?.provider_key,
            estimated_jpy: parseFloat(form.estimated_jpy) || 0,
            service_fee_rate: (parseFloat(settings.service_fee_rate) || 10),
            service_fee_amount: calculated ? calculated.serviceFeeJpy : null,
            service_fee_rule_id: activeRule?.id || null,
            service_fee_rule_name: activeRule?.name || null,
            service_fee_rule_version: activeRule?.version || null,
            full_payment_amount: (!prePayEnabled) ? prepaymentAmount : 0,
            prepayment_amount: prePayEnabled ? prepaymentAmount : 0,
            prepayment_currency: selectedCurrency,
            payable_amount: prepaymentAmount,
            payment_currency: selectedCurrency,
            online_store_tag: tagResult.tag_label,
            online_store_tag_color: tagResult.tag_color,
            payment_method: paymentMethod,
            payment_mode: paymentModeMap[paymentMode] || "prepay",
            credit_cycle: isCredit ? (paymentMode === "credit_weekly" ? "weekly" : "monthly") : null,
            order_status: isCredit ? "paid" : "payment_pending",
            payment_status: isCredit ? "paid" : "awaiting_payment",
            user_note: form.user_note || "",
            payment_rate_jpy_cny: selectedCurrency === 'CNY' ? (rates?.jpy_cny || null) : null,
            selected_addon_ids: selectedAddons,
            selected_addons: selectedAddonObjects.map((a) => ({ id: a.id, service_name: a.service_name, fee: parseFloat(a.fee) || 0, fee_currency: a.fee_currency || "JPY" }))
      };

      // 弹窗确认，确认后才调后端
      setPendingForm(submitForm);
      console.log(submitForm)
      setConfirmOpen(true);
    } catch (error) {
      toast.error(t('提交失败：', locale) + error.message);
      setSubmitting(false);
    }
  };

  // 确认提交订单（弹窗点"是"后执行）
  const confirmSubmitOrder = async () => {
    if (!pendingForm) return;
    setConfirmOpen(false);
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke('order/info/createTenantOrder', pendingForm);

      const order = res?.data;
      
      if (res.data?.credit_downgraded) {
        setCreditDowngradeMsg(res.data.credit_downgraded_reason);
        setSubmitting(false);
        setTimeout(() => navigate(createPageUrl("MyOrders")), 4000);
        return;
      }

      // 记账订单：账目已直接记入记账系统，无需前往付款页
      if (pendingForm.payment_mode === "credit") {
        setSubmitting(false);
        toast.success(t("提交成功，本单已记账，无需付款", locale));
        navigate(createPageUrl("MyOrders"));
        return;
      }

      // 后付款订单：下单阶段无需付款，货款将在支付运费时一并收取
      if (pendingForm.payment_mode === "deferred") {
        setSubmitting(false);
        toast.success(t("提交成功，货款将在支付运费时一并支付", locale));
        navigate(createPageUrl("MyOrders"));
        return;
      }

      if (!order) {
        toast.error(t('订单创建失败：服务器未返回订单信息', locale));
        setSubmitting(false);
        return;
      }

      let paymentUrl = `/Payment?order_id=${order.id}&method=${pendingForm.payment_method || "other"}&pay_currency=${pendingForm.prepayment_currency}`;

      navigate(paymentUrl);
    } catch (error) {
      toast.error(t('提交失败：', locale) + error.message);
      setSubmitting(false);
    } finally {
      setPendingForm(null);
    }
  };

  const handlePreShipmentSubmit = async () => {
    // Validate addon fees before submitting
    const validationErrors = {};
    let hasErrors = false;
    
    selectedAddons.forEach(addonId => {
      const addon = addonOptions.find(a => a.id === addonId);
      if (addon && addon.is_user_customizable) {
        const fee = addonCustomFees[addonId] || 0;
        const error = validateAddonFee(addonId, fee);
        if (error) {
          validationErrors[addonId] = error;
          hasErrors = true;
        }
      }
    });
    
    setAddonFeeErrors(validationErrors);

    if (hasErrors) {
      toast.error(t('请修正所有自定义金额的错误', locale));
      return;
    }
    
    setSubmitting(true);
    const urlsText = urlMode === "textarea" ?
      (productUrls[0] || "").split("\n").map((s) => s.trim()).filter(Boolean).join("\n") :
      productUrls.filter((u) => u.trim()).join("\n");
    const tagResult = await detectPrimaryStoreTagResult(urlsText);
    const prepaymentAmount = calculated ? parseFloat(calculated.prepayJpy) : 0;
    
    // 获取用户选择的付款方式和对应货币
    const selectedMethodObjForPre = paymentMethods.find((m) => (m.providerKey || m.methodName) === paymentMethod);
    const selectedCurrencyForPre = selectedMethodObjForPre?.paymentCurrency || "JPY";

    try {
      const res = IS_DEV_MOCK
        ? { data: { order: { id: 'dev-order-pre-' + Date.now() } } }
        : await base44.functions.invoke('createTenantOrder', {
            ...form,
            product_link: urlsText,
            user_email: user.email,
            user_name: user.full_name || user.email,
            quantity: 1,
            estimated_jpy: parseFloat(form.estimated_jpy) || 0,
            service_fee_rate: parseFloat(settings.service_fee_rate) || 10,
            service_fee_amount: calculated ? calculated.serviceFeeJpy : null,
            service_fee_rule_id: activeRule?.id || null,
            service_fee_rule_name: activeRule?.name || null,
            service_fee_rule_version: activeRule?.version || null,
            prepayment_amount: prepaymentAmount,
            prepayment_currency: "JPY",
            payment_method: paymentMethod,
            online_store_tag: tagResult.tag_label,
            online_store_tag_color: tagResult.tag_color,
            payment_mode: paymentMode || "prepay",
            order_status: "payment_pending",
            payment_status: "awaiting_payment",
            user_note: form.user_note || "",
            note_image_url: form.note_image_url || "",
            selected_addon_ids: selectedAddons,
            selected_addons: selectedAddons.map(id => {
              const addon = addonOptions.find(a => a.id === id);
              if (!addon) return null;
              const customFee = addonCustomFees[id];
              const isCustomizable = addon.is_user_customizable;
              const fee = isCustomizable && customFee !== undefined ? customFee : parseFloat(addon.fee) || 0;
              return { id: addon.id, name: addon.name, fee, fee_currency: addon.fee_currency || "JPY" };
            }).filter(Boolean)
          });
      setSubmitting(false);
      
      if (res.data?.error) {
        toast.error(t('提交失败：', locale) + res.data.error);
        return;
      }
      
      if (res.data?.order) {
        navigate(createPageUrl(`PreShipmentForm`, { order_id: res.data.order.id }));
      } else {
        toast.error(t('订单创建失败：服务器未返回订单信息', locale));
      }
    } catch (error) {
      toast.error(t('提交失败：', locale) + error.message);
      console.error(error)
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-8xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t("提交购买需求", locale)}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("填写您想购买的日本商品信息，我们将为您代购", locale)}</p>
      </div>

      {creditDowngradeMsg && (
        <Alert className="border-orange-300 bg-orange-50">
          <AlertTriangle className="w-4 h-4 text-orange-600" />
          <AlertDescription className="text-orange-800 text-sm font-medium">
            {creditDowngradeMsg}
            <p className="text-xs mt-1 font-normal text-orange-700">{t("正在跳转到订单列表…", locale)}</p>
          </AlertDescription>
        </Alert>
      )}

      {settings.prepay_enabled !== 'false' && (
        <Alert className="border-blue-200 bg-blue-50">
          <Info className="w-4 h-4 text-blue-600" />
          <AlertDescription className="text-blue-800 text-sm">
            {t("预付款 = (日元货款总价 + 服务费 + 增值费用) ×", locale)} {(() => { const p = parseFloat(settings.prepay_rate); return (isNaN(p) || p <= 0 || p > 100) ? Math.round(DEFAULT_PREPAY_RATE * 100) : p; })()}%{t("。订单确认后可补款或抵扣余额。", locale)}
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-5">
        {/* 商品信息卡片 - 左侧 */}
        <div>
        <Card className="border-gray-200 h-full">
          <CardHeader className="pb-3 border-b border-gray-100">
            <CardTitle className="text-sm font-semibold text-gray-700">{t("商品信息", locale)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {/* 商品链接 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Label className="text-sm font-medium">
                    <span className="text-red-500">*</span> {t("商品链接", locale)}
                  </Label>
                  <div className="group relative">
                    <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" />
                    <div className="invisible group-hover:visible absolute left-0 top-full mt-1 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 w-56 z-10 pointer-events-none whitespace-normal">
                      {settings.product_url_tips || t("输入日本商城的商品链接，支持多个链接", locale)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (urlMode === "multi") {
                      setUrlMode("textarea");
                      setProductUrls([productUrls.filter((u) => u.trim()).join("\n")]);
                    } else {
                      setUrlMode("multi");
                      const lines = (productUrls[0] || "").split("\n").map((s) => s.trim()).filter(Boolean);
                      setProductUrls(lines.length > 0 ? lines : [""]);
                    }
                  }}
                  className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                >
                  {urlMode === "multi" ? t("切换文本框", locale) : t("切换分行", locale)}
                </button>
              </div>

              {urlMode === "textarea" ? (
                <Textarea
                  placeholder={t("https://www.amazon.co.jp/...（必填）", locale)}
                  value={productUrls[0] || ""}
                  onChange={(e) => setProductUrls([e.target.value])}
                  className={`mt-1 text-sm font-mono ${!(productUrls[0] || "").trim() ? "border-red-400 placeholder:text-red-400 focus-visible:ring-red-300" : ""}`}
                  rows={3}
                />
              ) : (
                <div className="mt-1 space-y-2">
                  {productUrls.map((url, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        placeholder={t("https://www.amazon.co.jp/...（必填）", locale)}
                        value={url}
                        onChange={(e) => handleUrlChange(idx, e.target.value)}
                        onKeyDown={(e) => handleUrlKeyDown(e, idx)}
                        className={`flex-1 text-sm ${idx === 0 && !url.trim() ? "border-red-400 placeholder:text-red-400 focus-visible:ring-red-300" : ""}`}
                      />
                      {productUrls.length > 1 && (
                        <button type="button" onClick={() => removeUrl(idx)} className="text-gray-400 hover:text-red-500">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      {idx === productUrls.length - 1 && (
                        <button type="button" onClick={addUrl} className="text-gray-400 hover:text-blue-600">
                          <Plus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1.5">{t("Shift+Enter 添加下一条", locale)}</p>
            </div>

            {/* 订单名称和价格 - 并排显示 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">
                  <span className="text-red-500">*</span> {t("订单名称", locale)}
                </Label>
                <Input
                  placeholder={t("方便辨认的名字（必填）", locale)}
                  required
                  value={form.order_name}
                  onChange={(e) => setForm((f) => ({ ...f, order_name: e.target.value }))}
                  className={`mt-1 text-sm ${!form.order_name ? "border-red-400 placeholder:text-red-400 focus-visible:ring-red-300" : ""}`}
                />
              </div>
              <div>
                <Label className="text-sm font-medium">
                  <span className="text-red-500">*</span> {t("日元货款 (¥)", locale)}
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder={t("15000（必填）", locale)}
                  required
                  value={form.estimated_jpy}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setForm((f) => ({ ...f, estimated_jpy: val }));
                  }}
                  className={`mt-1 text-sm ${!form.estimated_jpy ? "border-red-400 placeholder:text-red-400 focus-visible:ring-red-300" : ""}`}
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">{t("商品描述 / 规格", locale)}</Label>
              <Textarea 
                placeholder={t("数量、颜色、尺码等（可选）", locale)} 
                value={form.product_description}
                onChange={(e) => setForm((f) => ({ ...f, product_description: e.target.value }))}
                className="mt-1 text-sm" 
                rows={2} 
              />
            </div>

            {/* 增值服务 - 可折叠 */}
            {addonOptions.length > 0 && canSelectOrderAddons && (
              <div className="border-t border-gray-100 pt-3">
                <Label className="text-sm font-medium mb-2 block">{t("增值服务（可选）", locale)}</Label>
                <div className="space-y-2">
                  {addonOptions.map((opt) => {
                    const isSelected = selectedAddons.includes(opt.id);
                    const isCustomizable = opt.is_user_customizable;
                    const customFee = addonCustomFees[opt.id];
                    const effectiveFee = isCustomizable && customFee !== undefined ? customFee : parseFloat(opt.fee) || 0;
                    const feeCur = opt.fee_currency || "JPY";
                    return (
                      <div key={opt.id} className={`rounded-lg border p-2.5 transition-colors ${isSelected ? "border-yellow-400 bg-yellow-50" : "border-gray-200"}`}>
                        <label className="flex items-start gap-3 cursor-pointer">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleAddon(opt.id)}
                            className="mt-0.5"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                              <span className="text-sm font-medium text-gray-800">{opt.service_name}</span>
                              <span className="text-sm text-red-600 font-semibold">
                                +{feeCur} {feeCur === "JPY" ? Math.round(effectiveFee) : effectiveFee}
                              </span>
                            </div>
                            {opt.user_description && <p className="text-xs text-gray-500 mt-0.5">{t(opt.user_description, locale)}</p>}
                            {isCustomizable && isSelected && (
                              <div className="mt-2 space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs text-gray-600">{t("自定义金额", locale)} ({opt.fee_min || 0} - {opt.fee_max || '∞'} {feeCur})</Label>
                                  <Input
                                    type="number"
                                    min={opt.fee_min || 0}
                                    max={opt.fee_max || undefined}
                                    step="1"
                                    placeholder={opt.fee_min || "0"}
                                    value={customFee !== undefined ? customFee : ""}
                                    onChange={(e) => handleAddonFeeChange(opt.id, e.target.value)}
                                    className={`h-7 text-xs w-32 ${
                                      addonFeeErrors[opt.id] ? "border-red-500 focus-visible:ring-red-500" : ""
                                    }`}
                                  />
                                </div>
                                {addonFeeErrors[opt.id] && (
                                  <p className="text-xs text-red-600 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    {addonFeeErrors[opt.id]}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 图片上传 */}
            <div className="border-t border-gray-100 pt-3">
              <ImageUploader
                value={form.product_image_url}
                onChange={(fileOrUrl) => {
                  if (typeof fileOrUrl === "string") {
                    setForm((f) => ({ ...f, product_image_url: fileOrUrl }));
                  } else {
                    handleProductImageUpload(fileOrUrl, 'submitOrder');
                  }
                }}
                onDelete={deleteProductImage}
                uploading={uploading}
                label={t("商品图片（可选）", locale)}
                id="product-image-input"
              />
            </div>

            {/* 备注 */}
            <div className="border-t border-gray-100 pt-3">
              <Label className="text-sm font-medium mb-2 block">{t("备注（可选）", locale)}</Label>
              <Textarea 
                placeholder={t("其他特殊说明...", locale)} 
                value={form.user_note}
                onChange={(e) => setForm((f) => ({ ...f, user_note: e.target.value }))}
                rows={2}
                className="text-sm"
              />
            </div>
          </CardContent>
        </Card>
        </div>

        {/* 右侧 - 费用、付款、提交 */}
        <Card className="border-gray-200 h-full">
        <CardHeader className="pb-3 border-b border-gray-100">
          <CardTitle className="text-sm font-semibold text-gray-700">{t("费用与付款", locale)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-4">
        {/* 费用估算 - 智能显示 */}
        <FeeCalculator calculated={calculated} settings={settings} />

        {/* 付款方式 */}
        <PaymentSection
          paymentMode={paymentMode}
          setPaymentMode={setPaymentMode}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          paymentMethods={paymentMethods}
          settings={settings}
          canPrePay={canPrePay}
          canFullPay={canFullPay}
          canDeferredPay={canDeferredPay}
          canApplyCredit={canApplyCredit}
          userCredit={userCredit}
          calculated={calculated}
        />

        {/* 提交按钮 */}
        {canSubmitOrder && (
          <div className="space-y-2">
            {settings.pre_shipment_enabled !== 'false' && (
            <Button
              type="button"
              variant="outline"
              className="w-full border-purple-300 text-purple-700 hover:bg-purple-50"
              disabled={submitting || !form.order_name || !form.estimated_jpy || !(productUrls.some(u => u.trim()))}
              onClick={handlePreShipmentSubmit}
            >
              <Truck className="w-4 h-4 mr-2" />
              {t("填写预出货信息", locale)}
            </Button>
            )}
            <Button
              type="submit"
              disabled={submitting || !form.order_name || !form.estimated_jpy || !(productUrls.some(u => u.trim()))}
              className="w-full bg-red-600 hover:bg-red-700"
            >
              <ShoppingBag className="w-4 h-4 mr-2" />
              {submitting ? t("提交中...", locale) : (
                paymentMode === "credit_weekly" || paymentMode === "credit_monthly" ? t("提交需求（记账）", locale) :
                paymentMode === "deferred" ? t("提交需求（后付款）", locale) : t("提交并前往付款", locale)
              )}
            </Button>
          </div>
        )}
        {!canSubmitOrder && (
          <Button type="button" disabled className="w-full bg-gray-400">
            <Lock className="w-4 h-4 mr-2" />
            {t("您没有权限提交购买需求", locale)}
          </Button>
        )}
        </CardContent>
        </Card>

        {/* 确认提交订单弹窗 */}
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t("是否提交订单？", locale)}
          description={t("请确认商品信息无误，提交后将进入付款流程。", locale)}
          confirmText={submitting ? t("提交中...", locale) : t("是", locale)}
          cancelText={t("否", locale)}
          onConfirm={(e) => { e.preventDefault(); confirmSubmitOrder(); }}
          confirmDisabled={submitting}
          cancelDisabled={submitting}
          confirmClassName="bg-red-600 hover:bg-red-700 text-white"
        />
      </form>
    </div>
  );
}