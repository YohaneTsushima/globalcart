/**
 * AdminShippingInfoPanel
 * Two-step admin panel for filling shipping info on a ShippingPool.
 *
 * Step 1 (pending → awaiting_payment): fill info, notify user to pay.
 * Step 2 (ready_to_ship → shipped): fill tracking number, confirm dispatch.
 *
 * Shows full per-user fee breakdown using calcFeeBreakdownPerUser.
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { shippingPoolApi, tenantEntity } from "@/lib/tenantApi";
import { toast } from "sonner";
import { persistentToastError } from "@/lib/toastUtils.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Truck, CheckCircle, ExternalLink, X, MapPin, Copy } from "lucide-react";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import CustomsDeclarationDisplay from "@/components/shippingpool/CustomsDeclarationDisplay";
import { getCountry, getCountryZone } from "@/lib/countries";
import { calcFeeBreakdownPerUser } from "@/lib/shippingFeeCalc";
import ShippingFeeBreakdown from "@/components/shippingpool/ShippingFeeBreakdown";
import MultiImageUploader from "@/components/common/MultiImageUploader";

const STATUS_CONFIG = {
  pending:                       { label: "待处理",    color: "bg-amber-100 text-amber-700" },
  awaiting_payment:              { label: "待付款",    color: "bg-orange-100 text-orange-700" },
  awaiting_payment_confirmation: { label: "待确认付款", color: "bg-blue-100 text-blue-700" },
  ready_to_ship:                 { label: "待发货",    color: "bg-lime-100 text-lime-700" },
  shipped:                       { label: "已发货",    color: "bg-green-100 text-green-700" },
  delivered:                     { label: "已签收",    color: "bg-emerald-100 text-emerald-700" },
  cancelled:                     { label: "已取消",    color: "bg-red-100 text-red-600" },
  processing:                    { label: "处理中",    color: "bg-blue-100 text-blue-700" },
};

function PaymentProofImage({ url }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  return (
    <>
      <div>
        <p className="text-xs text-blue-600 mb-1">付款凭证：</p>
        <img
          src={url}
          alt="付款凭证"
          className="max-w-full max-h-48 rounded-lg border border-blue-200 object-contain cursor-zoom-in hover:opacity-90 transition-opacity"
          onClick={() => setLightboxOpen(true)}
          title="点击查看大图"
        />
      </div>
      {lightboxOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="relative flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <button className="absolute -top-8 right-0 text-white/70 hover:text-white" onClick={() => setLightboxOpen(false)}>
              <X className="w-5 h-5" />
            </button>
            <img
              src={url}
              alt="付款凭证大图"
              className="max-w-[85vw] max-h-[75vh] rounded-xl object-contain shadow-2xl cursor-pointer"
              onClick={() => window.open(url, "_blank")}
              title="点击在新标签页打开"
            />
            <button
              className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs"
              onClick={() => window.open(url, "_blank")}
            >
              <ExternalLink className="w-3.5 h-3.5" />在新标签页打开
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminShippingInfoPanel({
  pool: initialPool,
  orders = [],
  boxTemplates = [],
  shippingMethods = [],
  defaultPackingFeeSingle = 0,
  defaultPackingFeeConsolidation = 0,
  allowShipWithoutPayment = false,
  allowShipWithoutPaymentSingle = false,
  allowShipWithoutPaymentUserPool = false,
  allowShipWithoutPaymentOfficialPool = false,
  fullpayOnceToleranceJpy = 500,
  transitHandlingFeeSplit = false,
  transitLocations = [],
  transitShippingMethods = [],
  userProfileMap = {},
  exchangeRates: exchangeRatesProp = null,
  onPoolUpdated,
  onRefresh,
  alertDialogOpen,
  setAlertDialogOpen,
  setAlertDialogMessage,
  setAlertDialogDescription,
}) {
  const isConsolidation = (initialPool.consolidation_type === "transit" || initialPool.consolidation_type === "other");
  
  // Determine shipment type
  const isOfficialPool = initialPool.is_admin_created === true;
  const isUserPool = !isOfficialPool && isConsolidation;
  const isSingle = !isOfficialPool && !isConsolidation;
  
  // Check if direct ship is allowed based on shipment type
  const canDirectShipWithoutPayment = allowShipWithoutPayment && (
    (isSingle && allowShipWithoutPaymentSingle) ||
    (isUserPool && allowShipWithoutPaymentUserPool) ||
    (isOfficialPool && allowShipWithoutPaymentOfficialPool)
  );
  
  // Derive unique users from orders
  const uniqueUsers = [...new Map(
    orders.filter(o => o.user_email).map(o => [o.user_email, { email: o.user_email, name: o.user_name || o.user_email }])
  ).values()];

  const defaultBaseFee = isConsolidation ? defaultPackingFeeConsolidation : defaultPackingFeeSingle;

  const initPackingFeesPerUser = () => {
    if ((initialPool.packing_fees_per_user || []).length > 0) {
      return initialPool.packing_fees_per_user.map(u => ({
        ...u,
        extra_fee_jpy: u.extra_fee_jpy ?? Math.max(0, (u.fee_jpy || 0) - (u.base_fee_jpy ?? defaultBaseFee)),
      }));
    }
    return uniqueUsers.map(u => ({ user_email: u.email, fee_jpy: 0, extra_fee_jpy: 0 }));
  };

  const [pool, setPool] = useState(initialPool);

  // Sync full pool + form fields from parent when it becomes available (e.g. after async API fetch)
  // This handles the case where parent initially passes a partial pool (e.g. { id })
  // and later updates it with full data after an API call completes.
  useEffect(() => {
    if (!initialPool?.status || initialPool.status === pool.status) return;
    setPool(prev => ({ ...prev, ...initialPool }));
    setTrackingNumber(initialPool.tracking_number || "");
    setBoxTemplateId(initialPool.box_template_id || "none");
    setFinalWeightG(initialPool?.final_weight_g || 0);
    setTotalWeightG(initialPool?.total_weight_g || 0);
    setShippingFeeJpy(initialPool.shipping_fee_jpy?.toString() || "");
    setAdminNote(initialPool.admin_note || "");
    setAdminPackingNote(initialPool.admin_packing_note || "");
    setActualShippingCostJpy(initialPool.actual_international_shipping_cost_jpy?.toString() || "");
    setLabelImageUrls(initialPool.label_image_urls || []);
    setPackingImageUrls(initialPool.packing_image_urls || []);
    // Restore base packing fee from saved per-user data
    const saved = initialPool.packing_fees_per_user || [];
    if (saved.length > 0 && saved[0].base_fee_jpy !== undefined) {
      setBasePackingFee(saved[0].base_fee_jpy);
    }
    // Re-init per-user packing fees from saved data
    if (saved.length > 0) {
      setPackingFeesPerUser(saved.map(u => ({
        ...u,
        extra_fee_jpy: u.extra_fee_jpy ?? Math.max(0, (u.fee_jpy || 0) - (u.base_fee_jpy ?? defaultBaseFee)),
      })));
    }
    // Re-calc shipping from restored weight
    const w = parseFloat(initialPool.final_weight_g || initialPool.total_weight_g);
    if (!isNaN(w) && w > 0) {
      const calc = calcFeeFromWeight(w);
      if (calc) { setShippingFeeJpy(String(calc.fee)); setFeeAutoCalced(true); setShippingCalcResult(calc); }
      else { setShippingCalcResult(null); }
    }
  }, [initialPool?.status]);

  // Sync pool.order_ids when parent passes updated pool (e.g. after orders are moved in)
  useEffect(() => {
    setPool(prev => {
      const newIds = initialPool.order_ids || [];
      const oldIds = prev.order_ids || [];
      // Only update if order_ids actually changed to avoid unnecessary re-renders
      if (newIds.length !== oldIds.length || newIds.some((id, i) => id !== oldIds[i])) {
        return { ...prev, order_ids: newIds };
      }
      return prev;
    });
  }, [JSON.stringify(initialPool.order_ids)]);
  const [saving, setSaving] = useState(false);
  const [confirmingSaving, setConfirmingSaving] = useState(false);
  const [exchangeRates, setExchangeRates] = useState(exchangeRatesProp);
  const [confirmPaymentDialogOpen, setConfirmPaymentDialogOpen] = useState(false);
  const [confirmPaymentAndShipDialogOpen, setConfirmPaymentAndShipDialogOpen] = useState(false);
  const [confirmSetAwaitingPaymentDialogOpen, setConfirmSetAwaitingPaymentDialogOpen] = useState(false);

  // Sync exchange rates from parent prop
  useEffect(() => {
    if (exchangeRatesProp) setExchangeRates(exchangeRatesProp);
  }, [exchangeRatesProp]);

  // Form fields
  const [trackingNumber, setTrackingNumber] = useState(pool.tracking_number || "");
  const [boxTemplateId, setBoxTemplateId] = useState(pool.box_template_id || "none");
  const [finalWeightG, setFinalWeightG] = useState(pool.final_weight_g || 0);
  const [totalWeightG, setTotalWeightG] = useState(pool.total_weight_g || 0);
  const [shippingFeeJpy, setShippingFeeJpy] = useState(pool.shipping_fee_jpy?.toString() || "");
  const [feeAutoCalced, setFeeAutoCalced] = useState(false);
  const [shippingCalcResult, setShippingCalcResult] = useState(null);
  const [basePackingFee, setBasePackingFee] = useState(() => {
    // Try to restore base fee from saved data: if all users have same fee, that's the base
    const saved = initialPool.packing_fees_per_user || [];
    if (saved.length > 0 && saved[0].base_fee_jpy !== undefined) return saved[0].base_fee_jpy;
    return defaultBaseFee;
  });
  const [packingFeesPerUser, setPackingFeesPerUser] = useState(initPackingFeesPerUser);
  // Re-initialize packingFeesPerUser when orders load (orders is async, initially [])
  const prevOrdersLengthRef = useRef(orders.length);
  useEffect(() => {
    if (orders.length > 0 && prevOrdersLengthRef.current === 0) {
      prevOrdersLengthRef.current = orders.length;
      // Only re-init if we don't already have valid per-user rows
      if (packingFeesPerUser.length === 0) {
        setPackingFeesPerUser(initPackingFeesPerUser());
      }
      // Auto-fill finalWeightG with orders total weight when no saved value exists
      if (!pool.final_weight_g && !pool.total_weight_g) {
        const ordersTotalWeight = orders.reduce((sum, o) => sum + (parseFloat(o.weight_g) || 0), 0);
        if (ordersTotalWeight > 0) {
          setFinalWeightG(String(ordersTotalWeight));
          const calc = calcFeeFromWeight(ordersTotalWeight);
          if (calc) { setShippingFeeJpy(String(calc.fee)); setFeeAutoCalced(true); setShippingCalcResult(calc); }
        }
      }
    }
  }, [orders.length]);
  // Initialize shippingCalcResult on mount so the IIFE doesn't need to call calcFeeFromWeight
  useEffect(() => {
    const w = parseFloat(pool.final_weight_g || pool.total_weight_g);
    if (!isNaN(w) && w > 0) {
      const calc = calcFeeFromWeight(w);
      if (calc) setShippingCalcResult(calc);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [adminNote, setAdminNote] = useState(pool.admin_note || "");
  const [adminPackingNote, setAdminPackingNote] = useState(pool.admin_packing_note || "");
  const [actualShippingCostJpy, setActualShippingCostJpy] = useState(pool.actual_international_shipping_cost_jpy?.toString() || "");

  // Image uploads
  const [labelImageUrls, setLabelImageUrls] = useState(pool.label_image_urls || []);
  const [packingImageUrls, setPackingImageUrls] = useState(pool.packing_image_urls || []);

  const filterNumeric = (v) => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');

  const selectedBox = boxTemplates.find(b => b.id === boxTemplateId);
  const boxWeight = selectedBox?.weight_g || 0;
  const boxPrice = selectedBox?.price_jpy || 0;
  // Per-user extra packing fees (individual add-ons on top of global fee)
  const effectivePackingFeesPerUser = useMemo(() =>
    packingFeesPerUser.map(u => ({
      ...u,
      base_fee_jpy: basePackingFee,
      fee_jpy: parseFloat(u.extra_fee_jpy) || 0, // only the extra per-user portion
    }))
  , [packingFeesPerUser, basePackingFee]);
  const totalPackingFee = basePackingFee + effectivePackingFeesPerUser.reduce((s, u) => s + (u.fee_jpy || 0), 0);

  // Find the shipping method matching pool's shipping_method code
  const matchedShippingMethod = shippingMethods.find(m =>
    m.code === pool.shipping_method || m.name === pool.shipping_method
  ) || null;

  // Auto-calculate shipping fee from weight using the matched shipping method's rates
  const calcFeeFromWeight = (weightG) => {
debugger
    if (!matchedShippingMethod || !pool.destination_country) return null;
    const country = pool.destination_country;
    // Resolve zone code: if rates are stored by zone (e.g. "zone1"), map the country code first
    const zoneCode = getCountryZone(country); // e.g. "CN" → "zone1"
    if (matchedShippingMethod.rate_mode === "detailed") {
      // Try exact country match first, then fall back to zone match
      let rates = (matchedShippingMethod.detailed_rates || []).filter(r => r.country === country);
      if (rates.length === 0 && zoneCode) {
        rates = (matchedShippingMethod.detailed_rates || []).filter(r => r.country === zoneCode);
      }
      if (rates.length === 0) return null;
      const bracket = rates.find(r => weightG >= r.weight_from_g && weightG <= r.weight_to_g);
      if (!bracket) return null;
      const fee = Math.round(parseFloat(bracket.fee) || 0);
      const currency = bracket.currency || "JPY";
      return { fee, currency };
    } else {
      // Try exact country match first, then fall back to zone match
      let rates = (matchedShippingMethod.simple_rates || []).filter(r => r.country === country);
      if (rates.length === 0 && zoneCode) {
        rates = (matchedShippingMethod.simple_rates || []).filter(r => r.country === zoneCode);
      }
      if (rates.length === 0) return null;
      const r = rates[0];
      const firstWeightG = parseFloat(r.first_weight_g) || 0;
      const firstFee = parseFloat(r.first_weight_fee) || 0;
      const addUnitG = parseFloat(r.additional_unit_g) || 0;
      const addUnitFee = parseFloat(r.additional_unit_fee) || 0;
      if (weightG <= firstWeightG) return { fee: Math.round(firstFee), currency: r.currency || "JPY" };
      if (addUnitG <= 0) return { fee: Math.round(firstFee), currency: r.currency || "JPY" };
      const extra = Math.ceil((weightG - firstWeightG) / addUnitG) * addUnitFee;
      return { fee: Math.round(firstFee + extra), currency: r.currency || "JPY" };
    }
  };

  // Resolve transit location and shipping method from pool
  const transitLocation = transitLocations.find(l => l.id === pool.transit_location_id) || null;
  const transitShippingMethod = transitShippingMethods.find(m => m.id === pool.transit_shipping_method_id) || null;

  // Live fee breakdown calculation (includes packing fees, transit fees with currency conversion)
  const feeBreakdowns = useMemo(() => {
    if (orders.length === 0) return [];
    return calcFeeBreakdownPerUser({
      pool,
      orders,
      shippingFeeJpy: parseFloat(shippingFeeJpy) || 0,
      boxPriceJpy: boxPrice,
      globalPackingFeeJpy: basePackingFee,
      packingFeesPerUser: effectivePackingFeesPerUser,
      transitLocation,
      transitShippingMethod,
      exchangeRates,
      transitHandlingFeeSplit,
    });
  }, [orders, shippingFeeJpy, boxPrice, basePackingFee, effectivePackingFeesPerUser, pool.selected_addons, pool.transit_location_id, pool.transit_shipping_method_id, exchangeRates, transitHandlingFeeSplit]);

  // Grand total = sum of all users' total_jpy from the live breakdown
  const grandTotalJpy = feeBreakdowns.reduce((s, b) => s + (b.total_jpy || 0), 0);

  // Previously notified/paid total = sum of saved fee_breakdown_per_user (the actual amount user was told to pay)
  // Fall back to shipping_fee_jpy only if no breakdown exists (legacy data)
  const savedGrandTotalJpy = Math.round(
    (pool.fee_breakdown_per_user || []).length > 0
      ? (pool.fee_breakdown_per_user || []).reduce((s, b) => s + (b.total_jpy || 0), 0)
      : (parseFloat(pool.shipping_fee_jpy) || parseFloat(pool.actual_fee) || 0)
  );

  // Check if any individual user's fee has changed vs what was previously saved.
  // This is more precise than comparing totals: catches cases where amounts shifted
  // between users but the grand total stayed the same.
  const hasPerUserFeeChanged = (() => {
    const savedBreakdowns = pool.fee_breakdown_per_user || [];
    if (savedBreakdowns.length === 0) {
      // No per-user breakdown saved yet — fall back to total comparison
      return Math.round(grandTotalJpy) !== savedGrandTotalJpy;
    }
    if (feeBreakdowns.length !== savedBreakdowns.length) return true;
    return feeBreakdowns.some(live => {
      const saved = savedBreakdowns.find(s => s.user_email === live.user_email);
      if (!saved) return true;
      return Math.round(live.total_jpy || 0) !== Math.round(saved.total_jpy || 0);
    });
  })();

  const buildUpdatePayload = () => {
    const btId = boxTemplateId === "none" ? "" : boxTemplateId;
    const breakdowns = calcFeeBreakdownPerUser({
      pool,
      orders,
      shippingFeeJpy: parseFloat(shippingFeeJpy) || 0,
      boxPriceJpy: btId ? boxPrice : 0,
      globalPackingFeeJpy: basePackingFee,
      packingFeesPerUser: effectivePackingFeesPerUser,
      transitLocation,
      transitShippingMethod,
      exchangeRates,
      transitHandlingFeeSplit,
    });
    return {
      tracking_number: trackingNumber,
      box_template_id: btId,
      box_template_name: btId ? (selectedBox?.name || "") : "",
      box_price_jpy: btId ? boxPrice : 0,
      final_weight_g: parseFloat(finalWeightG) || 0, //加上盒子的重量
      total_weight_g: parseFloat(totalWeightG) || 0, //单纯货物的重量
      shipping_fee_jpy: parseFloat(shippingFeeJpy) || 0,
      fee_currency: "JPY",
      packing_fee_jpy: totalPackingFee,
      packing_fees_per_user: effectivePackingFeesPerUser,
      fee_breakdown_per_user: breakdowns,
      admin_note: adminNote,
      admin_packing_note: adminPackingNote,
      label_image_urls: labelImageUrls,
      packing_image_urls: packingImageUrls,
      actual_international_shipping_cost_jpy: parseFloat(actualShippingCostJpy) || null,
      // Financial reporting snapshots (JPY): full income charged to users incl. balance due,
      // box charge and box actual cost — consumed by aggregateDailyReport / getReportData
      shipping_stage_income_jpy: Math.round(breakdowns.reduce((s, b) => s + (b.total_jpy || 0), 0)) || null,
      box_charge_jpy_snapshot: btId ? boxPrice : 0,
      box_actual_cost_jpy_snapshot: btId ? (selectedBox?.cost_jpy ?? null) : 0,
    };
  };

  const handleSetAwaitingPayment = () => handleSave(shippingPoolApi.handleSetAwaitingPayment, "已通知用户支付运费");
  const handleSaveInfoOnly = () => handleSave(shippingPoolApi.handleSaveInfoOnly, "保存成功");

  const handleSave = async (apiFn, successMsg) => {
    setSaving(true);
    const payload = buildUpdatePayload();

    try {
      await apiFn(pool.id, payload);
      setPool(p => ({ ...p, ...payload }));
      onPoolUpdated?.({ ...pool, ...payload });
      toast.success(`[${pool.title}] ${successMsg}`);
    } catch (e) {
      
      console.error("操作失败:", e);
      const message = e?.response?.data?.message;
      persistentToastError("操作失败：" + (message || "未知错误"));
    } finally {
      setSaving?.(false);
    }
  };

  const updatePool = async (payload, { setLoading, successMsg } = {}) => {
    try {
      
      await shippingPoolApi.update(pool.id, payload);
      setPool(p => ({ ...p, ...payload }));
      onPoolUpdated?.({ ...pool, ...payload });
      if (successMsg) toast.success(successMsg);
    } catch (err) {
      console.error("操作失败:", err);
      persistentToastError("操作失败：" + (err?.message || "未知错误"));
    } finally {
      setLoading?.(false);
    }
  };

  const handleConfirmPayment = async () => {
    setConfirmingSaving(true);
    const existingPerUserPayments = pool.per_user_payments || [];
    const updatedPerUserPayments = existingPerUserPayments.map(p => ({
      ...p,
      payment_status: "paid",
      confirmed_at: p.confirmed_at || new Date().toISOString(),
    }));
    const payload = {
      ...buildUpdatePayload(),
      status: "ready_to_ship",
      payment_status: "paid",
      admin_confirmed_payment: true,
      supplement_amount_per_user: [],
      per_user_payments: updatedPerUserPayments,
      order_status: "notified_shipment_fee_paid",
      order_balance_settled: true,
    };
    await updatePool(payload, { setLoading: setConfirmingSaving, successMsg: "收款确认成功" });
  };

  // Confirm payment and ship directly (for allowShipWithoutPayment setting)
  const handleConfirmPaymentAndShipDirectly = async () => {
    setConfirmingSaving(true);
    const existingPerUserPayments = pool.per_user_payments || [];
    const updatedPerUserPayments = existingPerUserPayments.map(p => ({
      ...p,
      payment_status: "paid",
      confirmed_at: p.confirmed_at || new Date().toISOString(),
    }));
    const payload = {
      ...buildUpdatePayload(),
      status: "shipped",
      shipped_date: new Date().toISOString().split("T")[0],
      payment_status: "paid",
      admin_confirmed_payment: true,
      supplement_amount_per_user: [],
      per_user_payments: updatedPerUserPayments,
      order_status: "shipped",
      order_balance_settled: true,
      notice_key: 'order_shipped'
    };
    await updatePool(payload, { setLoading: setConfirmingSaving });
  };

  // 发货后补付：确认收款但不改变发货/订单状态（用于跳过付款发货的池子）
  const handleConfirmPostShipmentPayment = async () => {
    setConfirmingSaving(true);
    const updatedPerUserPayments = (pool.per_user_payments || []).map(p => ({
      ...p,
      payment_status: "paid",
      confirmed_at: p.confirmed_at || new Date().toISOString(),
    }));
    const payload = {
      payment_status: "paid",
      admin_confirmed_payment: true,
      supplement_amount_per_user: [],
      per_user_payments: updatedPerUserPayments,
      // 后付款标记：用于个人档案与财务报表的后付款次数统计
      post_shipment_paid: true,
      post_shipment_paid_at: new Date().toISOString(),
      order_balance_settled: true,
      notice_key: 'order_shipped'
    };
    await updatePool(payload, { setLoading: setConfirmingSaving });
  };

  // Notify user of fee update (for awaiting_payment pools)
  const handleNotifyFeeUpdate = async () => {
    setSaving(true);
    const payload = buildUpdatePayload();
    const sysMsg = {
      id: Date.now().toString(),
      from: "系统通知",
      from_email: "__system__",
      role: "admin",
      content: `管理员已更新应付运费，新金额为 ¥${Math.round(grandTotalJpy).toLocaleString()} JPY，请重新确认并付款。`,
      timestamp: new Date().toISOString(),
    };
    const updatedMessages = [...(pool.messages || []), sysMsg];
    const updatedUnread = [...new Set([...(pool.unread_roles || []), "user"])];
    await updatePool(
      { ...payload, messages: updatedMessages, unread_roles: updatedUnread },
      { setLoading: setSaving }
    );
  };

  // Notify user of fee update for already-paid pools (ready_to_ship or awaiting_payment_confirmation)
  const handleNotifyFeeUpdatePaid = async () => {
    setSaving(true);
    const payload = buildUpdatePayload();
    const prevPaidJpy = savedGrandTotalJpy;
    const newTotalJpy = Math.round(grandTotalJpy);
    const diff = newTotalJpy - Math.round(prevPaidJpy);

    let newStatus = pool.status;
    let newPaymentStatus = pool.payment_status;
    let newOrderStatus = "";
    let msgContent = "";

    if (diff > 0) {
      // User underpaid — require additional payment (diff only)
      newStatus = "awaiting_payment";
      newPaymentStatus = "unpaid";
      newOrderStatus = "notified_shipment_fee_pending";
      msgContent = `管理员已更新运费，新合计金额为 ¥${newTotalJpy.toLocaleString()} JPY，比原付金额多 ¥${diff.toLocaleString()} JPY，请补交差额。`;
    } else {
      // User overpaid — proceed to ready_to_ship, admin will refund via message
      newStatus = "ready_to_ship";
      newPaymentStatus = "paid";
      newOrderStatus = "notified_shipment_fee_paid";
      msgContent = `管理员已调整运费，新合计金额为 ¥${newTotalJpy.toLocaleString()} JPY，比原付金额少 ¥${Math.abs(diff).toLocaleString()} JPY，多余款项将另行退还，请留意管理员留言。`;
    }

    const sysMsg = {
      id: Date.now().toString(),
      from: "系统通知",
      from_email: "__system__",
      role: "admin",
      content: msgContent,
      timestamp: new Date().toISOString(),
    };
    const updatedMessages = [...(pool.messages || []), sysMsg];
    const updatedUnread = [...new Set([...(pool.unread_roles || []), "user"])];
    // Build per-user supplement amounts so the payment function charges only the diff
    const supplementAmountPerUser = diff > 0
      ? feeBreakdowns.map(b => {
          const prevB = (pool.fee_breakdown_per_user || []).find(pb => pb.user_email === b.user_email);
          const prevTotal = Math.round(prevB ? (prevB.total_jpy || 0) : 0);
          const newTotal = Math.round(b.total_jpy || 0);
          return {
            user_email: b.user_email,
            supplement_jpy: Math.max(0, newTotal - prevTotal),
            previous_total_jpy: prevTotal,
            new_total_jpy: newTotal,
          };
        })
      : [];

    const fullPayload = {
      ...payload,
      status: newStatus,
      payment_status: newPaymentStatus,
      admin_confirmed_payment: diff <= 0,
      supplement_amount_per_user: supplementAmountPerUser,
      messages: updatedMessages,
      unread_roles: updatedUnread,
      order_status: newOrderStatus,
      ...(diff <= 0 ? { order_balance_settled: true } : {}),
    };
    await updatePool(fullPayload, { setLoading: setSaving });
  };

  const confirmedAndReadyToShip = async () => {

    setAlertDialogOpen(true);
    setAlertDialogMessage("确认中...");

    try {
      await shippingPoolApi.confiredmProof(pool.id, {
        pool_code: pool.pool_code,
        actual_fee: actualShippingCostJpy
      });
      // await base44.functions.invoke('order/info/updateShipmentProof', payload);
      toast.success(`发货池 [${pool.pool_code}] 更新为待发货`);
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || '更新失败'
      persistentToastError(message);
    } finally {
      setSaving(false);
      setAlertDialogOpen(false);
      onRefresh?.();
    }
     
  }

  // Notify user of supplement AND immediately move pool to ready_to_ship
  const handleNotifyFeeUpdateAndReadyToShip = async () => {
    setSaving(true);
    const payload = buildUpdatePayload();
    const prevPaidJpy = savedGrandTotalJpy;
    const newTotalJpy = Math.round(grandTotalJpy);
    const diff = newTotalJpy - Math.round(prevPaidJpy);

    const supplementAmountPerUser = diff > 0
      ? feeBreakdowns.map(b => {
          const prevB = (pool.fee_breakdown_per_user || []).find(pb => pb.user_email === b.user_email);
          const prevTotal = Math.round(prevB ? (prevB.total_jpy || 0) : 0);
          const newTotal = Math.round(b.total_jpy || 0);
          return {
            user_email: b.user_email,
            supplement_jpy: Math.max(0, newTotal - prevTotal),
            previous_total_jpy: prevTotal,
            new_total_jpy: newTotal,
          };
        })
      : [];

    const msgContent = `管理员已更新运费并确认发货，新合计金额为 ¥${newTotalJpy.toLocaleString()} JPY，比原付金额多 ¥${diff.toLocaleString()} JPY，请补交差额后等待发货。`;
    const sysMsg = {
      id: Date.now().toString(),
      from: "系统通知",
      from_email: "__system__",
      role: "admin",
      content: msgContent,
      timestamp: new Date().toISOString(),
    };
    const updatedMessages = [...(pool.messages || []), sysMsg];
    const updatedUnread = [...new Set([...(pool.unread_roles || []), "user"])];

    const fullPayload = {
      ...payload,
      status: "ready_to_ship",
      payment_status: "unpaid",
      admin_confirmed_payment: false,
      supplement_amount_per_user: supplementAmountPerUser,
      messages: updatedMessages,
      unread_roles: updatedUnread,
      order_status: "notified_shipment_fee_pending",
    };
    await updatePool(fullPayload, { setLoading: setSaving });
  };

  const handleConfirmPaymentAndShip = async () => {
    if (!trackingNumber) return;
    setConfirmingSaving(true);
    const existingPerUserPayments = pool.per_user_payments || [];
    const updatedPerUserPayments = existingPerUserPayments.map(p => ({
      ...p,
      payment_status: "paid",
      confirmed_at: p.confirmed_at || new Date().toISOString(),
    }));
    const shippedDate = new Date().toISOString().split("T")[0];
    const payload = {
      ...buildUpdatePayload(),
      status: "shipped",
      payment_status: "paid",
      admin_confirmed_payment: true,
      supplement_amount_per_user: [],
      per_user_payments: updatedPerUserPayments,
      shipped_date: shippedDate,
      tracking_number: trackingNumber,
      order_status: "shipped",
      order_balance_settled: true,
      notice_key: 'order_shipped'
    };
    await updatePool(payload, { setLoading: setConfirmingSaving });
  };

  const handleShip = async () => {
    if (!trackingNumber) return;
    setSaving(true);
    setAlertDialogOpen(true);
    setAlertDialogMessage("正在发货...");
    // const payload = {
    //   ...buildUpdatePayload(),
    //   status: "shipped",
    //   shipped_date: new Date().toISOString().split("T")[0],
    //   tracking_number: trackingNumber,
    //   order_status: "shipped",
    //   order_balance_settled: pool.payment_status === "paid",
    //   notice_key: 'order_shipped'
    // };

    const payload = {
      id: pool.id,
      pool_code: pool.pool_code,
      tracking_number: trackingNumber,
      actual_fee: actualShippingCostJpy
    };
    try {
     const res = await shippingPoolApi.shipped(pool.id, payload);
     
      setPool(p => ({ ...p, ...res?.data }));
      onPoolUpdated?.({ ...pool, ...res?.data });
      toast.success(`[${pool.pool_code}] 已发货.`);
    } catch (err) {
      const errorMessage = err?.response?.data?.message;
      console.error("操作失败:", err);
      persistentToastError("操作失败：" + (errorMessage || "未知错误"));
    } finally {
      setSaving(false);
      setAlertDialogOpen(false);
    }
    // await updatePool(payload, { setLoading: setSaving });
    
  };

  const currentStatus = pool.status;
  const isStep1 = currentStatus === "pending" || currentStatus === "processing";
  const isAwaitingPayment = currentStatus === "awaiting_payment";
  const isAwaitingConfirmation = currentStatus === "awaiting_payment_confirmation";
  const isStep2 = currentStatus === "ready_to_ship";
  const isDone = currentStatus === "shipped" || currentStatus === "delivered";

  return (
    <div className="border border-red-100 rounded-xl overflow-hidden">
      <div className="bg-red-50 px-4 py-2.5 border-b border-red-100 flex items-center justify-between">
        <span className="text-sm font-medium text-red-700">管理员操作</span>
        <Badge className={`text-xs ${STATUS_CONFIG[pool.status]?.color || ""}`}>
          {STATUS_CONFIG[pool.status]?.label}
        </Badge>
      </div>

      {isDone && (
        <div className="p-4 space-y-3">
          <div className="text-sm text-gray-500 text-center">
            {pool.status === "shipped" ? "📦 已发货" : "✅ 已签收"}
            {pool.tracking_number && <span className="ml-2 font-mono text-gray-700">{pool.tracking_number}</span>}
          </div>
          {pool.payment_status !== "paid" && ((pool.fee_breakdown_per_user || []).length > 0 || (parseFloat(pool.shipping_fee_jpy) || 0) > 0) && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-2">
              <p className="text-xs text-orange-700 font-medium">
                ⚠️ 此发货池为未付款发货，运费尚未确认收款（应收合计 ¥{savedGrandTotalJpy.toLocaleString()} JPY）。
              </p>
              {pool.payment_status === "awaiting_confirmation" && (
                <p className="text-xs text-blue-700">用户已提交补付，请核实凭证后确认收款。</p>
              )}
              {pool.payment_proof_url && <PaymentProofImage url={pool.payment_proof_url} />}
              {(pool.per_user_payments || []).map(up => {
                const profile = userProfileMap[up.user_email] || {};
                const displayName = profile.display_name || profile.full_name || up.user_email;
                return (
                  <div key={up.user_email} className="bg-white border border-orange-100 rounded px-2 py-1.5 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-700">{displayName}</span>
                      <span className={up.payment_status === "paid" ? "text-green-600" : "text-orange-600"}>
                        {up.payment_status === "paid" ? "已确认" : up.payment_status === "awaiting_confirmation" ? "已提交待确认" : "未付款"}
                      </span>
                    </div>
                    {up.payment_proof_url && <PaymentProofImage url={up.payment_proof_url} />}
                  </div>
                );
              })}
              <Button size="sm" className="bg-green-600 hover:bg-green-700 w-full"
                onClick={handleConfirmPostShipmentPayment} disabled={confirmingSaving}>
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                {confirmingSaving ? "确认中..." : "确认收款（不改变发货状态）"}
              </Button>
            </div>
          )}
        </div>
      )}

      {(isStep1 || isStep2 || isAwaitingPayment || isAwaitingConfirmation) && (
        <div className="p-4 space-y-4">
          {isStep1 && (
            <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <strong>第一步：</strong>填写发货信息，通知用户确认并付款。运单号可在付款确认后填写。
            </p>
          )}
          {isAwaitingPayment && (
            <p className="text-xs text-gray-500 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
              等待用户付款中。可继续修改发货信息。
            </p>
          )}
          {isAwaitingConfirmation && (
            <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              用户已提交付款，请核实后确认收款，进入待发货状态。
            </p>
          )}
          {isStep2 && (
            <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <strong>第二步：</strong>用户已付款，请填写运单号确认发货。
            </p>
          )}

          {/* Customs declaration (read-only, from orders) */}
          <CustomsDeclarationDisplay orders={orders} />

          {/* Box template */}
          <div>
            <Label className="text-xs text-gray-500">外箱选择</Label>
            <Select value={boxTemplateId} onValueChange={(val) => {
              setBoxTemplateId(val);
              const ordersTotalWeight = orders.reduce((sum, o) => sum + (parseFloat(o.weight_g) || 0), 0);
              const box = val === "none" ? null : boxTemplates.find(b => b.id === val);
              const boxW = parseFloat(box?.weight_g) || 0;
              const newWeight = ordersTotalWeight + boxW;
              setFinalWeightG(String(newWeight));
              setTotalWeightG(ordersTotalWeight);              
              if (newWeight > 0) {
                const calc = calcFeeFromWeight(newWeight);
                if (calc) { setShippingFeeJpy(String(calc.fee)); setFeeAutoCalced(true); setShippingCalcResult(calc); }
                else { setShippingCalcResult(null); }
              } else { setFeeAutoCalced(false); setShippingCalcResult(null); }
            }}>
              <SelectTrigger className="mt-1 h-auto min-h-8 text-sm py-1.5">
                {boxTemplateId === "none" ? (
                  <span className="text-gray-400">未使用外箱</span>
                ) : selectedBox ? (
                  <div className="flex items-center gap-2">
                    {selectedBox.image_url && <img src={selectedBox.image_url} alt="" className="w-6 h-6 rounded object-cover border border-gray-100 flex-shrink-0" />}
                    <span className="font-medium">{selectedBox.name}</span>
                    {selectedBox.weight_g > 0 && <span className="text-gray-400 text-xs">{selectedBox.weight_g}g</span>}
                    {selectedBox.price_jpy > 0 && <span className="text-orange-600 text-xs">¥{Math.round(selectedBox.price_jpy)}</span>}
                  </div>
                ) : <SelectValue />}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">未使用外箱</SelectItem>
                {boxTemplates.filter(b => b.is_active !== false).map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    <div className="flex items-center gap-2 py-0.5">
                      {b.image_url
                        ? <img src={b.image_url} alt="" className="w-8 h-8 rounded object-cover border border-gray-100 flex-shrink-0" />
                        : <div className="w-8 h-8 rounded bg-gray-100 flex-shrink-0" />}
                      <div>
                        <div className="font-medium text-sm">{b.name}</div>
                        <div className="text-xs text-gray-400 flex gap-2">
                          {b.weight_g > 0 && <span>自重 {b.weight_g}g</span>}
                          {b.price_jpy > 0 && <span className="text-orange-600">¥{Math.round(b.price_jpy)}</span>}
                          {b.description && <span>{b.description}</span>}
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Weight & shipping fee */}
          {(() => {
            debugger
            const wNum = parseFloat(finalWeightG);
            const calcResult = shippingCalcResult;
            const feeCurrency = calcResult ? calcResult.currency : "JPY";
            const applyWeight = (w) => {
              setFinalWeightG(String(w));
              if (w > 0) {
                const calc = calcFeeFromWeight(w);
                if (calc) { setShippingFeeJpy(String(calc.fee)); setFeeAutoCalced(true); setShippingCalcResult(calc); }
                else { setShippingCalcResult(null); }
              } else { setFeeAutoCalced(false); setShippingCalcResult(null); }
            };
            return (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-500">最终总重量 (g)</Label>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Input className="h-8 text-sm flex-1" type="text" inputMode="decimal" placeholder={pool.total_weight_g || pool.final_weight_g || "0"}
                      value={finalWeightG}
                      onChange={e => {
                        const raw = filterNumeric(e.target.value);
                        setFinalWeightG(raw);
                        const w = parseFloat(raw);
                        if (!isNaN(w) && w > 0) {
                          const calc = calcFeeFromWeight(w);
                          if (calc) { setShippingFeeJpy(String(calc.fee)); setFeeAutoCalced(true); setShippingCalcResult(calc); }
                          else { setShippingCalcResult(null); }
                        } else { setFeeAutoCalced(false); setShippingCalcResult(null); }
                      }} />
                    <button type="button" onClick={() => applyWeight((parseFloat(finalWeightG) || 0) + 100)}
                      className="h-8 px-2 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex-shrink-0">+100</button>
                    <button type="button" onClick={() => applyWeight(Math.max(0, (parseFloat(finalWeightG) || 0) - 100))}
                      className="h-8 px-2 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex-shrink-0">-100</button>
                  </div>
                  {boxWeight > 0 && <p className="text-xs text-gray-400 mt-0.5">含外箱 {boxWeight}g</p>}
                </div>
                <div>
                  <Label className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
                    国际运费 ({feeCurrency}) *
                    {matchedShippingMethod && !calcResult && finalWeightG && (
                      <span className="text-orange-400 font-normal">（该重量无匹配区间）</span>
                    )}
                    {!matchedShippingMethod && <span className="text-gray-400 font-normal">（手动填写）</span>}
                  </Label>
                  <div className="mt-1 relative">
                    <Input className="h-8 text-sm pr-14" type="text" inputMode="decimal" placeholder="0"
                      value={shippingFeeJpy}
                      onChange={e => { setShippingFeeJpy(filterNumeric(e.target.value)); setFeeAutoCalced(false); }} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">{feeCurrency}</span>
                  </div>
                  {matchedShippingMethod && calcResult && (
                    <p className="text-xs mt-0.5 text-blue-500">
                      按{matchedShippingMethod.name || pool.shipping_method}费率{feeAutoCalced ? "（已自动填入）" : `：${feeCurrency} ${calcResult.fee.toLocaleString()}`}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Actual international shipping cost (internal, for financial reporting) */}
          <div>
            <Label className="text-xs text-gray-500 flex items-center gap-1">
              实际支付物流商运费 (JPY)
              <span className="text-gray-400 font-normal">（内部成本，用于财务报表）</span>
            </Label>
            <Input className="mt-1 h-8 text-sm" type="text" inputMode="decimal" placeholder="0（选填）"
              value={actualShippingCostJpy}
              onChange={e => setActualShippingCostJpy(filterNumeric(e.target.value))} />
          </div>

          {/* Packing fees per user */}
          <div className="space-y-2">
            {/* Global base fee — always shown */}
            <div>
              <Label className="text-xs text-gray-500 block mb-1.5">全局捆包作业服务费 (JPY) <span className="text-gray-400 font-normal">（参与平摊）</span></Label>
              <div className="flex items-center gap-1.5">
                <Input className="h-8 text-sm flex-1" type="text" inputMode="decimal" placeholder="0"
                  value={basePackingFee === 0 ? "" : basePackingFee}
                  onChange={e => setBasePackingFee(parseFloat(filterNumeric(e.target.value)) || 0)} />
                <button type="button" onClick={() => setBasePackingFee(v => v + 100)}
                  className="h-8 px-2 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex-shrink-0">+100</button>
                <button type="button" onClick={() => setBasePackingFee(v => Math.max(0, v - 100))}
                  className="h-8 px-2 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex-shrink-0">-100</button>
              </div>
            </div>

            {/* Per-user extra fee (only shown when multiple users) */}
            {uniqueUsers.length > 1 && packingFeesPerUser.length > 1 && (
              <div className="border border-gray-100 rounded-lg p-2.5 bg-gray-50 space-y-1.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-400">各用户追加费用（全局手续费已计入平摊，此处为个人追加）</p>
                  <span className="text-xs text-gray-400">基础 ¥{basePackingFee}</span>
                </div>
                {packingFeesPerUser.map((uf, idx) => {
                  const profile = userProfileMap[uf.user_email] || {};
                  const displayName = profile.display_name || profile.full_name || uf.user_email;
                  const extra = parseFloat(uf.extra_fee_jpy) || 0;
                  return (
                    <div key={uf.user_email} className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-600 flex-1 truncate" title={uf.user_email}>{displayName}</span>
                      <span className="text-xs text-gray-300">+</span>
                      <Input className="h-7 text-xs w-20" type="text" inputMode="decimal" placeholder="0"
                        value={extra === 0 ? "" : extra}
                        onChange={e => setPackingFeesPerUser(prev =>
                          prev.map((u, i) => i === idx ? { ...u, extra_fee_jpy: parseFloat(e.target.value) || 0 } : u)
                        )} />
                      <button type="button" onClick={() => setPackingFeesPerUser(prev =>
                        prev.map((u, i) => i === idx ? { ...u, extra_fee_jpy: (parseFloat(u.extra_fee_jpy) || 0) + 100 } : u)
                      )} className="h-7 px-1.5 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex-shrink-0">+100</button>
                      <button type="button" onClick={() => setPackingFeesPerUser(prev =>
                        prev.map((u, i) => i === idx ? { ...u, extra_fee_jpy: (parseFloat(u.extra_fee_jpy) || 0) - 100 } : u)
                      )} className="h-7 px-1.5 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex-shrink-0">-100</button>
                      <span className={`text-xs font-medium flex-shrink-0 w-16 text-right ${extra < 0 ? "text-blue-600" : "text-orange-600"}`}>
                        {extra >= 0 ? `+¥${extra}` : `-¥${Math.abs(extra)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Fee breakdown preview */}
          {(shippingFeeJpy || boxPrice > 0 || totalPackingFee > 0) && feeBreakdowns.length > 0 && (
            <div>
              <Label className="text-xs text-gray-500 mb-2 block">
                费用明细{isConsolidation ? "（含平摊运费）" : ""}
              </Label>
              <ShippingFeeBreakdown
                breakdowns={feeBreakdowns}
                isConsolidation={isConsolidation}
                userProfileMap={userProfileMap}
              />
            </div>
          )}

          {/* Tracking number */}
          <div>
            <Label className="text-xs text-gray-500">
              运单号{isStep2 ? " *" : " (可选，稍后填写)"}
            </Label>
            <Input className="mt-1 h-8 text-sm font-mono"
              placeholder={isStep2 ? "填写后确认发货" : "稍后填写"}
              value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} />
          </div>

          {/* Notes */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label className="text-xs text-gray-500">捆包备注（展示给用户）</Label>
              <Input className="mt-1 h-8 text-sm"
                placeholder="如：已合并为1箱，尺寸 30×20×15cm"
                value={adminPackingNote} onChange={e => setAdminPackingNote(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">管理员内部备注</Label>
              <Textarea rows={2} className="mt-1 text-sm"
                value={adminNote} onChange={e => setAdminNote(e.target.value)} />
            </div>
          </div>

          {/* Image uploads */}
          <div className="grid grid-cols-2 gap-3 items-stretch">
            <MultiImageUploader
              value={labelImageUrls}
              onChange={setLabelImageUrls}
              uploadPath="shippingLabel"
              label="发货面单图片"
              id="admin-label-image-input"
            />
            <MultiImageUploader
              value={packingImageUrls}
              onChange={setPackingImageUrls}
              uploadPath="shippingPacking"
              label="捆包状态图片"
              id="admin-packing-image-input"
            />
          </div>

          {/* Action buttons */}
          <div className="space-y-2 pt-1">
            {isStep1 && (
              <>
                {trackingNumber && (
                  <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-xs text-orange-700">
                    ⚠️ 填写运单号后，可在第二步直接确认发货（跳过付款流程）
                  </div>
                )}
                <Button size="sm" className="bg-orange-600 hover:bg-orange-700 w-full"
                  onClick={() => setConfirmSetAwaitingPaymentDialogOpen(true)} disabled={saving || !shippingFeeJpy}>
                  <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                  {saving ? "保存中..." : `通知用户付款（合计 ¥${Math.round(grandTotalJpy).toLocaleString()} JPY）`}
                </Button>
                <Button size="sm" variant="outline" className="w-full text-xs"
                  onClick={handleSaveInfoOnly} disabled={saving}>
                  {saving ? "保存中..." : "仅保存信息（不通知）"}
                </Button>
              </>
            )}

            {isAwaitingPayment && (
              <>
                <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-sm text-orange-700">
                  运费 <strong>¥{Math.round(grandTotalJpy).toLocaleString()} JPY</strong>，等待用户付款。
                </div>
                {hasPerUserFeeChanged && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-700">
                    ⚠️ 金额已修改（原 ¥{savedGrandTotalJpy.toLocaleString()} → 新 ¥{Math.round(grandTotalJpy).toLocaleString()} JPY）
                  </div>
                )}
                <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700 w-full"
                  onClick={handleNotifyFeeUpdate} disabled={saving || !shippingFeeJpy || !hasPerUserFeeChanged}>
                  <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                  {saving ? "保存中..." : `通知用户金额更新（¥${Math.round(grandTotalJpy).toLocaleString()} JPY）`}
                </Button>
                <Button size="sm" variant="outline" className="w-full text-xs"
                  onClick={handleSaveInfoOnly} disabled={saving}>
                  {saving ? "保存中..." : "仅保存（不通知用户）"}
                </Button>
              </>
            )}

            {(isAwaitingPayment || isAwaitingConfirmation) && (
              <>
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 space-y-2">
                  {isAwaitingPayment && !pool.payment_proof_url && (
                    <p className="text-xs text-blue-700 font-medium">
                      等待用户付款中。{allowShipWithoutPayment && trackingNumber ? "开启「允许未付款时进入已发货」后，填写运单号即可直接确认发货。" : ""}
                    </p>
                  )}
                  {/* Multi-user: show per-user payment status */}
                  {(() => {
                    const perUserPayments = pool.per_user_payments || [];
                    if (perUserPayments.length === 0 && pool.payment_proof_url) {
                      // Legacy single-user
                      return (
                        <>
                          <p className="text-xs text-blue-700 font-medium">
                            用户已提交付款（¥{Math.round(grandTotalJpy).toLocaleString()} JPY），请核实后确认收款。
                          </p>
                          <PaymentProofImage url={pool.payment_proof_url} />
                        </>
                      );
                    }
                    if (perUserPayments.length > 0) {
                      return (
                        <div className="space-y-2">
                          <p className="text-xs text-blue-700 font-medium">各用户付款状态（拼邮）：</p>
                          {perUserPayments.map(up => {
                            const profile = userProfileMap[up.user_email] || {};
                            const displayName = profile.display_name || profile.full_name || up.user_email;
                            const isPending = up.payment_status === "awaiting_confirmation";
                            const isConfirmed = up.payment_status === "paid";
                            const userBreakdown = (pool.fee_breakdown_per_user || []).find(b => b.user_email === up.user_email);
                            const userAmountJpy = userBreakdown ? Math.ceil((userBreakdown.total_jpy || 0) / 10) * 10 : null;
                            return (
                              <div key={up.user_email} className="bg-white border border-blue-100 rounded-lg px-3 py-2 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium text-gray-700">{displayName}</span>
                                  <div className="flex items-center gap-1.5">
                                    {userAmountJpy !== null && (
                                      <span className="text-xs font-semibold text-orange-600">¥{userAmountJpy.toLocaleString()} JPY</span>
                                    )}
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${isConfirmed ? "bg-green-100 text-green-700" : isPending ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                                      {isConfirmed ? "已确认" : isPending ? "待确认" : up.payment_status}
                                    </span>
                                  </div>
                                </div>
                                {up.payment_method && <p className="text-xs text-gray-400">支付方式：{up.payment_method}</p>}
                                {up.payment_proof_url && <PaymentProofImage url={up.payment_proof_url} />}
                                {isPending && (
                                  <Button size="sm" className="bg-green-600 hover:bg-green-700 w-full h-7 text-xs"
                                    disabled={confirmingSaving}
                                    onClick={async () => {
                                      setConfirmingSaving(true);
                                      const updatedPayments = (pool.per_user_payments || []).map(p =>
                                        p.user_email === up.user_email ? { ...p, payment_status: "paid", confirmed_at: new Date().toISOString() } : p
                                      );
                                      const allPaid = updatedPayments.every(p => p.payment_status === "paid");
                                      const payload = {
                                        per_user_payments: updatedPayments,
                                        ...(allPaid ? { payment_status: "paid", admin_confirmed_payment: true } : {}),
                                      };
                                      await updatePool(payload, { setLoading: setConfirmingSaving });
                                    }}>
                                    <CheckCircle className="w-3 h-3 mr-1" />确认此用户已付款
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                          {/* Show confirm all only when all per-user payments confirmed */}
                          {perUserPayments.length > 0 && perUserPayments.every(p => p.payment_status === "paid") && (
                            <p className="text-xs text-green-600 font-medium text-center">✅ 所有用户已付款确认，可进入待发货</p>
                          )}
                        </div>
                      );
                    }
                    // No proof submitted yet
                    return (
                      <p className="text-xs text-blue-700 font-medium">
                        用户已提交付款（¥{Math.round(grandTotalJpy).toLocaleString()} JPY），请核实后确认收款。
                      </p>
                    );
                  })()}
                  {(() => {
                    const perUserPayments = pool.per_user_payments || [];
                    const isMultiUser = perUserPayments.length > 0;
                    const allPaid = isMultiUser
                      ? perUserPayments.every(p => p.payment_status === "paid") || pool.payment_status === "paid"
                      : pool.payment_status === "awaiting_confirmation" || pool.payment_status === "paid";
                    const paymentOk = canDirectShipWithoutPayment || allPaid;
                    const canShipDirectly = paymentOk && !!trackingNumber;
                    return (
                      <div className="space-y-1.5">
                        {canDirectShipWithoutPayment ? (
                          <>
                            <Button size="sm" className="bg-lime-600 hover:bg-lime-700 w-full"
                              onClick={async () => {
                                setConfirmingSaving(true);
                                const payload = { status: "ready_to_ship", payment_status: "unpaid", admin_confirmed_payment: false, order_status: "ready_to_ship" };
                                await updatePool(payload, { setLoading: setConfirmingSaving });
                              }}
                              disabled={confirmingSaving}>
                              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                              {confirmingSaving ? "处理中..." : "跳过付款确认，直接进入待发货"}
                            </Button>
                            <Button size="sm" className="bg-red-600 hover:bg-red-700 w-full"
                              onClick={async () => {
                                setConfirmingSaving(true);
                                const payload = { status: "shipped", payment_status: "unpaid", admin_confirmed_payment: false, shipped_date: new Date().toISOString().split("T")[0], order_status: "shipped" };
                                if (trackingNumber) payload.tracking_number = trackingNumber;
                                await updatePool(payload, { setLoading: setConfirmingSaving });
                              }}
                              disabled={confirmingSaving || !trackingNumber.trim()}
                              title={!trackingNumber.trim() ? "需填写运单号" : ""}>
                              <Truck className="w-3.5 h-3.5 mr-1.5" />
                              {confirmingSaving ? "处理中..." : trackingNumber.trim() ? "跳过付款确认，直接进入已发货" : "跳过付款确认（需填写运单号）"}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 w-full"
                              onClick={() => setConfirmPaymentDialogOpen(true)}
                              disabled={confirmingSaving || !paymentOk}>
                              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                              {confirmingSaving ? "确认中..." : "全部确认收款，进入待发货"}
                            </Button>
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 w-full"
                              onClick={() => setConfirmPaymentAndShipDialogOpen(true)}
                              disabled={confirmingSaving || !canShipDirectly}
                              title={!trackingNumber ? "需填写运单号" : !paymentOk ? "需全员付款" : ""}>
                              <Truck className="w-3.5 h-3.5 mr-1.5" />
                              {confirmingSaving ? "确认中..." : canShipDirectly ? "全部确认收款并进入已发货" : `全部确认收款并进入已发货${!trackingNumber ? "（需填写运单号）" : "（需全员付款）"}`}
                            </Button>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
                {hasPerUserFeeChanged && (() => {
                  const prevJpy = savedGrandTotalJpy;
                  const newJpy = Math.round(grandTotalJpy);
                  const diff = newJpy - prevJpy;
                  return (
                    <div className="space-y-1.5">
                      <div className={`rounded-lg px-3 py-2 text-xs ${diff > 0 ? "bg-red-50 border border-red-100 text-red-700" : "bg-green-50 border border-green-100 text-green-700"}`}>
                        金额已修改：原 ¥{prevJpy.toLocaleString()} → 新 ¥{newJpy.toLocaleString()} JPY（{diff > 0 ? `+¥${diff.toLocaleString()}，用户需补交` : diff < 0 ? `-¥${Math.abs(diff).toLocaleString()}，退还用户` : "各用户分摊金额有变动"}）
                      </div>
                      <Button size="sm" className="bg-orange-600 hover:bg-orange-700 w-full"
                        onClick={handleNotifyFeeUpdatePaid} disabled={saving}>
                        <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                        {saving ? "处理中..." : diff > 0 ? "通知用户补交差额" : "确认退款差额，进入待发货"}
                      </Button>
                      {diff > 0 && (() => {
                        // 「先发货后补款」按钮：仅在实际运费超出预付金额的差值在容差范围内时可用
                        // fullpayOnceToleranceJpy = 0 表示完全禁用此功能
                        const withinTolerance = fullpayOnceToleranceJpy > 0 && diff <= fullpayOnceToleranceJpy;
                        return (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 w-full"
                            onClick={handleNotifyFeeUpdateAndReadyToShip}
                            disabled={saving || !withinTolerance}
                            title={!withinTolerance
                              ? fullpayOnceToleranceJpy === 0
                                ? "已禁用（容差设为 0）"
                                : `差额 ¥${diff} 超出允许容差 ¥${fullpayOnceToleranceJpy} JPY`
                              : ""}>
                            <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                            {saving ? "处理中..." : withinTolerance
                              ? `通知用户补交差额 + 进入待发货`
                              : `差额超出容差（¥${fullpayOnceToleranceJpy} JPY），不可用`}
                          </Button>
                        );
                      })()}
                    </div>
                  );
                })()}
                <Button size="sm" variant="outline" className="w-full text-xs"
                  onClick={handleSaveInfoOnly} disabled={saving}>
                  {saving ? "保存中..." : "保存信息修改"}
                </Button>
              </>
            )}

            {isStep2 && (
              <>
                {pool.payment_status === "paid" ? (
                  <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-sm text-green-700">
                    ✅ 用户已付款，请填写运单号确认发货。
                  </div>
                ) : (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 space-y-2">
                    <p className="text-xs text-orange-700 font-medium">⚠️ 此发货池尚未确认收款（跳过付款进入待发货）。可先确认发货，运费可后续补付。</p>
                    {pool.payment_proof_url && <PaymentProofImage url={pool.payment_proof_url} />}
                    {(pool.per_user_payments || []).map(up => {
                      const profile = userProfileMap[up.user_email] || {};
                      const displayName = profile.display_name || profile.full_name || up.user_email;
                      return (
                        <div key={up.user_email} className="bg-white border border-orange-100 rounded px-2 py-1.5 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-700">{displayName}</span>
                            <span className={up.payment_status === "paid" ? "text-green-600" : "text-orange-600"}>
                              {up.payment_status === "paid" ? "已确认" : up.payment_status === "awaiting_confirmation" ? "已提交待确认" : "未付款"}
                            </span>
                          </div>
                          {up.payment_proof_url && <PaymentProofImage url={up.payment_proof_url} />}
                        </div>
                      );
                    })}
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 w-full"
                      onClick={handleConfirmPostShipmentPayment} disabled={confirmingSaving}>
                      <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                      {confirmingSaving ? "确认中..." : "确认收款（保持待发货）"}
                    </Button>
                  </div>
                )}
                {hasPerUserFeeChanged && (() => {
                  const prevJpy = savedGrandTotalJpy;
                  const newJpy = Math.round(grandTotalJpy);
                  const diff = newJpy - prevJpy;
                  return (
                    <div className="space-y-1.5">
                      <div className={`rounded-lg px-3 py-2 text-xs ${diff > 0 ? "bg-red-50 border border-red-100 text-red-700" : "bg-yellow-50 border border-yellow-100 text-yellow-700"}`}>
                        金额已修改：原 ¥{prevJpy.toLocaleString()} → 新 ¥{newJpy.toLocaleString()} JPY（{diff > 0 ? `+¥${diff.toLocaleString()}，用户需补交` : diff < 0 ? `-¥${Math.abs(diff).toLocaleString()}，退还用户` : "各用户分摊金额有变动"}）
                      </div>
                      <Button size="sm" className="bg-orange-600 hover:bg-orange-700 w-full"
                        onClick={handleNotifyFeeUpdatePaid} disabled={saving}>
                        <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                        {saving ? "处理中..." : diff > 0 ? "通知用户补交差额" : "确认退款差额，更新金额"}
                      </Button>
                      {diff > 0 && (() => {
                        const withinTolerance = fullpayOnceToleranceJpy > 0 && diff <= fullpayOnceToleranceJpy;
                        return (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 w-full"
                            onClick={handleNotifyFeeUpdateAndReadyToShip}
                            disabled={saving || !withinTolerance}
                            title={!withinTolerance
                              ? fullpayOnceToleranceJpy === 0
                                ? "已禁用（容差设为 0）"
                                : `差额 ¥${diff} 超出允许容差 ¥${fullpayOnceToleranceJpy} JPY`
                              : ""}>
                            <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                            {saving ? "处理中..." : withinTolerance
                              ? `通知用户补交差额 + 进入待发货`
                              : `差额超出容差（¥${fullpayOnceToleranceJpy} JPY），不可用`}
                          </Button>
                        );
                      })()}
                    </div>
                  );
                })()}
                {trackingNumber && (
                  <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-xs text-orange-700">
                    ⚠️ 确认发货后，所有关联订单将同步更新为"已发货"。
                  </div>
                )}
                <Button size="sm" className="bg-red-600 hover:bg-red-700 w-full"
                  onClick={handleShip} disabled={saving || !trackingNumber}>
                  <Truck className="w-3.5 h-3.5 mr-1.5" />
                  {saving ? "保存中..." : "确认发货"}
                </Button>
                <Button size="sm" variant="outline" className="w-full text-xs"
                  onClick={handleSaveInfoOnly} disabled={saving}>
                  {saving ? "保存中..." : "保存信息修改"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmPaymentDialogOpen}
        onOpenChange={setConfirmPaymentDialogOpen}
        title="确认收款"
        description="确认已收到全部款项，将发货池状态变更为「待发货」？"
        confirmText="确认"
        onConfirm={confirmedAndReadyToShip}
      />

      <ConfirmDialog
        open={confirmPaymentAndShipDialogOpen}
        onOpenChange={setConfirmPaymentAndShipDialogOpen}
        title="确认收款并发货"
        description="确认已收到全部款项并直接进入「已发货」状态？"
        confirmText="确认"
        onConfirm={handleShip}
      />

      <ConfirmDialog
        open={confirmSetAwaitingPaymentDialogOpen}
        onOpenChange={setConfirmSetAwaitingPaymentDialogOpen}
        title="通知用户付款"
        description={`确认通知用户付款？合计金额 ¥${Math.round(grandTotalJpy).toLocaleString()} JPY`}
        confirmText="确认通知"
        onConfirm={handleSetAwaitingPayment}
      />
    </div>
  );
}