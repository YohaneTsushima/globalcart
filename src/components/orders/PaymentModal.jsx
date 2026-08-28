/**
 * PaymentModal (v2)
 * Handles: prepayment, supplement payment, shipping fee payment.
 * Alipay: auto-generates signed link, user clicks pay, callback updates status automatically.
 * Other: upload proof manually.
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import QRCode from 'qrcode';
import { X, CreditCard, ExternalLink, CheckCircle, Loader2, Lock } from "lucide-react";
import FileDropzone from "@/components/common/FileDropzone";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { base44 } from "@/api/base44Client";
import { openAlipayPopup } from "@/lib/alipayUtils";
import { usePermissions } from "@/hooks/usePermissions";
import { updateOrder } from "@/lib/tenantApi";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PaymentMethodSelector from "@/components/common/PaymentMethodSelector";
import { ImageWithViewer } from "@/components/common/ImageViewer";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";

/**
 * @param {object}   order
 * @param {"prepay"|"supplement"|"shipping"} mode
 * @param {function} onClose
 * @param {function} onSuccess
 */
export default function PaymentModal({ order, mode = "prepay", onClose, onSuccess }) {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { user } = useCurrentUser();
  
  // Check payment permissions based on mode
  const canPayment = mode === "shipping" ? true : can("payment:self_pay") || can("payment:manual_pay");
  
  const isSupp = mode === "supplement";
  const isShipping = mode === "shipping";

  const rawAmount = isSupp
    ? order.supplement_amount
    : isShipping
    ? order.shipping_fee_amount
    : mode === 'prepay'
    ? order?.prepayment_amount_jpy
    : order?.full_payment_amount;

  let cur = isShipping ? (order.shipping_fee_currency || "CNY") : (order.prepayment_currency || order.payment_currency || "JPY");

  // For shipping: combine shipping fee + item size fee
  const itemSizeFee = isShipping && order.item_size_extra_fee > 0 ? order.item_size_extra_fee : 0;

  // JPY and CNY amounts round to nearest integer
  const roundAmount = (val, currency) => {
    if (!val) return 0;
    const num = parseFloat(val);
    return (currency === "CNY" || currency === "JPY") ? Math.round(num) : num;
  };

  const defaultAmount = roundAmount(rawAmount, cur);

  const isFullPay = order?.payment_mode === 'fullpay_once';

  const title = isSupp ? "补款" : isShipping ? "运费付款" : isFullPay ? "付款" : "预付款";
  const amountLabel = cur === "JPY"
    ? `${title}金额：${Math.round(defaultAmount).toLocaleString()} yen`
    : cur === "CNY"
    ? `${title}金额：${Math.round(defaultAmount)} yuan`
    : `${title}金额：${cur} ${Math.round(defaultAmount)}`;

  const [method, setMethod] = useState("");
  const [selectedMethodMeta, setSelectedMethodMeta] = useState(null); // { value, label, payment_note, image_url, payment_currency }
  const [paidAmount, setPaidAmount] = useState(String(defaultAmount));
  const [rates, setRates] = useState(null);
  const [platformRates, setPlatformRates] = useState(null);
  const [tenantRates, setTenantRates] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  // Store as state so async handlers (handleProofUploaded) capture the latest value
  const [snapshotRate, setSnapshotRate] = useState(null); // { payCurrency, rate } when non-JPY method selected
  // Surcharge from backend (computed per selected payment method)
  const [surchargeJpy, setSurchargeJpy] = useState(0);
  const [finalAmountJpy, setFinalAmountJpy] = useState(defaultAmount);

  // Fetch exchange rates once on mount
  // useEffect(() => {
  //   const DEFAULT_RATES = { JPY: 1, CNY: 0.049, USD: 0.0067, TWD: 0.21, HKD: 0.052, EUR: 0.0061, GBP: 0.0053, AUD: 0.01, SGD: 0.009 };
  //   base44.functions.invoke("config/page/fetchExchangeRates", {})
  //     .then(r => {
  //       if (r && r.data) {
  //         let data = r.data;
  //         let rs = {
  //           JPY: 1,
  //           CNY: data.jpy.cny || DEFAULT_RATES.CNY,
  //           USD: data.jpy.usd || DEFAULT_RATES.USD,
  //           TWD: data.jpy.twd || DEFAULT_RATES.TWD,
  //           TWD: data.jpy.hkd || DEFAULT_RATES.HKD
  //         };

  //         setRates(rs);
  //       }
  //     })
  //     .catch(() => {});
  // }, []);

  // When method changes (for prepay mode), reload surcharge from backend
  useEffect(() => {
    if (!isShipping && !isSupp && order?.id && method) {
      base44.functions.invoke('payment/getPaymentPageData', { order_id: order.id, payment_method_key: method })
        .then(r => {
          const d = r.data || {};
          const sc = d.surchargeJpy ?? 0;
          const total = d.paymentAmountWithSurcharge ?? defaultAmount;
          setSurchargeJpy(sc);
          setFinalAmountJpy(total);
          setPaidAmount(String(Math.round(total)));
          setRates(d.raw_rates || null);
          setPlatformRates(d.platform_rates || null);
          setTenantRates(d.tenant_rates || null);
        })
        .catch(() => {});
    } else if (!method) {
      setSurchargeJpy(0);
      setFinalAmountJpy(defaultAmount);
      setPaidAmount(String(defaultAmount));
    }
  }, [method]);

  // 监听支付宝回调的 postMessage（PaymentClose 发送）
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data?.type === "alipay_payment_done") {
        toast.success('支付成功');
        onSuccessRef.current?.();
      }
      if (e.data?.type === "alipay_payment_navigate" && e.data.url) {
        window.location.href = e.data.url;
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Currency conversion helpers
  const CURRENCY_SYMBOLS = { JPY: "¥", CNY: "¥", USD: "$", TWD: "NT$", HKD: "HK$", EUR: "€", SGD: "S$" };
  const payCurrency = selectedMethodMeta?.paymentCurrency || selectedMethodMeta?.payment_currency || cur;

  // Compute converted amount from JPY base → payCurrency
  // 与 Payment.jsx 一致：最终汇率 = raw + platform + tenant
  let convertedAmount = null;
  let convertedDisplay = null;
  let rateValue = null;
  
  if (payCurrency !== "JPY") {
    // cur 是订单货币（如 JPY），payCurrency 是支付货币（如 CNY）
    const rawRate = rates?.[payCurrency] || 0;
    const platformRate = platformRates?.[payCurrency] || 0;
    const tenantRate = tenantRates?.[payCurrency] || 0;
    rateValue = rawRate + platformRate + tenantRate;
    if (rateValue) {
      const converted = defaultAmount * rateValue;
      const decimals = ["TWD", "HKD", "CNY"].includes(payCurrency) ? 2 : 2;
      convertedAmount = converted.toFixed(decimals);
      convertedDisplay = `${payCurrency} ${parseFloat(convertedAmount).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    }
  }

  // Keep snapshotRate in sync with current rateValue so async handlers can read it reliably
  useEffect(() => {
    if (rateValue && payCurrency && payCurrency !== "JPY") {
      setSnapshotRate({ payCurrency, rate: rateValue });
    } else if (!selectedMethodMeta || selectedMethodMeta.payment_currency === "JPY") {
      setSnapshotRate(null);
    }
  }, [rateValue, payCurrency, selectedMethodMeta]);

  // Alipay
  const [generating, setGenerating] = useState(false);
  const [paying, setPaying] = useState('');
  const [showAlipayConfirm, setShowAlipayConfirm] = useState(false);
  const [alipayFormData, setAlipayFormData] = useState(null);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  // Manual
  const [proofUrl, setProofUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleGenerateAlipay = async () => {
    setGenerating(true);
    const subject = isShipping
      ? `${user.displayName || user?.display_name}-运费 - ${order.product_name}`
      : `${user.displayName || user?.display_name}-代购 - ${order.product_name}`;

    // For prepay, use finalAmountJpy (includes surcharge); for shipping/supplement use paidAmount as-is
    const amountJpy = (!isShipping && !isSupp && surchargeJpy > 0) ? finalAmountJpy : parseFloat(paidAmount);

    // 如果选了非 JPY 的支付方式，转成对应货币金额（使用完整汇率）
    let amountToCharge = amountJpy;
    let currencyToSend = "JPY";
    if (payCurrency !== "JPY" && rateValue) {
      amountToCharge = Math.round(amountJpy * rateValue * 100) / 100;
      currencyToSend = payCurrency;
    }

    const selectedObj = paymentMethods.find(m => (m.provider_key || m.id) === method);

    //用于更新Payment Method
    const newMethod = {
      // payable_amount: amountToCharge,
      method_name: method,
      payment_currency: selectedObj?.payment_currency,
      payment_currency_type: selectedObj?.payment_currency,
      prepayment_rate_jpy_cny: rateValue,
      provider_key: method
    }

    const payParam = {
      orderId: order.id,
      // amount: 0.1,
      currency: currencyToSend,
      subject,
      paymentType: isShipping ? "shipping" : "order",
      payment_method: newMethod,
      popup_mode: true
    };

    const res = await base44.functions.invoke("alipay/pay", payParam);
    
    if(!res?.data?.success) {
      toast.error(`下单失败: ${res?.data?.result}`);
      setGenerating(false);
      return;
    }

    const formData = res?.data?.form;

    setGenerating(false);
    setAlipayFormData(formData);
    setShowAlipayConfirm(true);
  };

  const submitToAlipay = () => {
    openAlipayPopup(alipayFormData);
    setShowAlipayConfirm(false);
    setAlipayFormData(null);
  };

  // Build actual-currency fields when paying in a non-JPY currency.
  // Per architecture: prepayment_amount stays in JPY (internal base currency).
  // Uses snapshotRate (state) to avoid stale-closure bugs in async handlers.
  const buildActualCurrencyUpdates = (currentPaidAmount) => {
    const snap = snapshotRate;
    if (!snap || snap.payCurrency === "JPY") return {};
    const jpyAmount = parseFloat(currentPaidAmount ?? paidAmount) || 0;
    const foreignAmount = parseFloat((jpyAmount * snap.rate).toFixed(2));
    if (!foreignAmount) return {};
    const updates = {
      prepayment_currency: snap.payCurrency,
      prepayment_amount_jpy: jpyAmount,
      prepayment_rate_jpy_cny: snap.rate,
    };
    if (snap.payCurrency === "CNY") {
      updates.prepayment_amount_cny = foreignAmount;
    }
    return updates;
  };

  // For non-alipay: manual confirm
  const handleManualSubmit = async () => {
    setSubmitting(true);
    const currentPaidAmount = paidAmount;
    const updates = {
      payment_method: method,
      payment_proof_url: proofUrl,
      payment_status: "paid",
    };
    if (isShipping) {
      updates.order_status = "ready_to_ship";
    } else if (isSupp) {
      updates.order_status = "paid";
      updates.supplement_requested = false;
      updates.paid_amount = (order.paid_amount || 0) + parseFloat(currentPaidAmount);
      Object.assign(updates, buildActualCurrencyUpdates(currentPaidAmount));
    } else {
      updates.order_status = "paid";
      updates.paid_amount = (order.paid_amount || 0) + parseFloat(currentPaidAmount);
      Object.assign(updates, buildActualCurrencyUpdates(currentPaidAmount));
    }
    await updateOrder(order.id, updates);
    onSuccess?.();
  };

  // Upload proof then auto-submit and navigate to MyOrders
  const handleProofUploaded = async (file) => {
    // Capture current values before any async gaps
    const currentPaidAmount = paidAmount;
    const currencyUpdates = buildActualCurrencyUpdates(currentPaidAmount);

    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setProofUrl(file_url);
    setUploading(false);
    // Auto-submit
    setSubmitting(true);
    const updates = {
      payment_method: method,
      payment_proof_url: file_url,
      payment_status: "paid",
      order_status: "pending_purchase",
    };
    if (isShipping) {
      updates.order_status = "ready_to_ship";
    } else if (isSupp) {
      updates.supplement_requested = false;
      updates.paid_amount = (order.paid_amount || 0) + parseFloat(currentPaidAmount);
      Object.assign(updates, currencyUpdates);
    } else {
      updates.paid_amount = (order.paid_amount || 0) + parseFloat(currentPaidAmount);
      Object.assign(updates, currencyUpdates);
    }
    await updateOrder(order.id, updates);
    setSubmitting(false);
    if (onSuccess) {
      onSuccess();
    } else {
      navigate(createPageUrl("MyOrders"));
    }
  };

  return (
    <>
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onMouseDown={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{order.product_name} · {order.order_number}</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-500" /></button>
        </div>

        <div className="px-5 py-5 space-y-4">
           {!canPayment && (
             <Alert className="border-red-200 bg-red-50 py-2.5">
               <Lock className="w-4 h-4 text-red-600" />
               <AlertDescription className="text-red-800 text-sm font-medium">您没有权限进行此支付操作</AlertDescription>
             </Alert>
           )}
           <Alert className="border-yellow-200 bg-yellow-50 py-2.5">
             <CreditCard className="w-4 h-4 text-yellow-600" />
             <AlertDescription className="text-yellow-800 text-sm font-medium">{amountLabel}</AlertDescription>
           </Alert>

           {/* Surcharge breakdown — only for prepay mode when a surcharge applies */}
           {!isShipping && !isSupp && surchargeJpy > 0 && method && (
             <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs space-y-1">
               <div className="flex justify-between text-yellow-700">
                 <span>订单金额</span>
                 <span>¥{defaultAmount.toLocaleString()} JPY</span>
               </div>
               <div className="flex justify-between text-yellow-700">
                  <span>支付手续费（{(selectedMethodMeta?.paymentMethodFeeRate || selectedMethodMeta?.surcharge_rate) > 0 ? `${selectedMethodMeta.paymentMethodFeeRate || selectedMethodMeta.surcharge_rate}%` : ''}{(selectedMethodMeta?.paymentMethodFeeRate || selectedMethodMeta?.surcharge_rate) > 0 && (selectedMethodMeta?.paymentMethodFeeFlat || selectedMethodMeta?.surcharge_fixed_jpy) > 0 ? ' + ' : ''}{(selectedMethodMeta?.paymentMethodFeeFlat || selectedMethodMeta?.surcharge_fixed_jpy) > 0 ? `¥${selectedMethodMeta.paymentMethodFeeFlat || selectedMethodMeta.surcharge_fixed_jpy}` : ''}）</span>
                 <span>+¥{Math.round(surchargeJpy).toLocaleString()} JPY</span>
               </div>
               <div className="flex justify-between font-semibold text-yellow-800 border-t border-yellow-200 pt-1">
                 <span>实付合计</span>
                 <span>¥{Math.round(finalAmountJpy).toLocaleString()} JPY</span>
               </div>
             </div>
           )}

           {/* Non-JPY currency conversion notice — only show when a method is selected */}
           {convertedAmount && method && (
             <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
               <div className="flex items-center justify-between">
                 <div>
                   <div className="text-xs text-orange-600 font-medium">实际应付（{payCurrency}）</div>
                   <div className="text-xs text-gray-400 mt-0.5">汇率：1 JPY ≈ {rateValue?.toFixed(5)} {payCurrency}</div>
                 </div>
                 <div className="text-right">
                   <div className="text-2xl font-bold text-orange-600">{CURRENCY_SYMBOLS[payCurrency] || payCurrency}{convertedAmount}</div>
                   <div className="text-xs text-orange-500">{payCurrency}</div>
                 </div>
               </div>
               {rates?.[payCurrency] && (
                 <p className="text-xs text-gray-400 mt-1">
                   最终汇率 = 市场汇率[{(rates[payCurrency] || 0).toFixed(5)}] + 平台增量[{(platformRates?.[payCurrency] || 0).toFixed(5)}] + 租户增量[{(tenantRates?.[payCurrency] || 0).toFixed(5)}]
                 </p>
               )}
               <p className="text-xs text-orange-400 mt-2">请按以上 {payCurrency} 金额付款，汇率实时参考，以实际到账为准</p>
             </div>
           )}

           {/* Item size fee breakdown for shipping */}
           {isShipping && itemSizeFee > 0 && (
             <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2.5 space-y-1.5">
               <p className="text-xs text-purple-600 font-medium">费用明细</p>
               <div className="flex items-center justify-between text-xs">
                 <span className="text-gray-600">运费：</span>
                 <span className="font-medium text-gray-800">{cur} {order.shipping_fee_amount}</span>
               </div>
               <div className="flex items-center justify-between text-xs border-t border-purple-100 pt-1">
                 <span className="text-gray-600">物品尺寸费：</span>
                 <span className="font-medium text-purple-700">{order.item_size_fee_currency} {itemSizeFee}</span>
               </div>
               {order.item_size_title && (
                 <div className="text-xs text-gray-500 pt-1 border-t border-purple-100">
                   {order.item_size_title}
                 </div>
               )}
             </div>
           )}

          {/* Only show editable amount for supplement/shipping; for prepay show read-only */}
          {/* <div>
            <Label className="text-sm">付款金额 ({cur})</Label>
            {mode === "prepay" ? (
              <div className="mt-1 h-9 flex items-center px-3 rounded-md border border-input bg-muted text-sm font-medium text-gray-700">
                {paidAmount}
              </div>
            ) : (
              <Input type="number" className="mt-1" value={paidAmount}
                onChange={e => setPaidAmount((cur === "CNY" || cur === "JPY") ? String(Math.round(parseFloat(e.target.value) || 0)) : e.target.value)}
                step={(cur === "CNY" || cur === "JPY") ? "1" : "0.01"} />
            )}
          </div> */}

          {/* Method selection */}
          <div>
            <Label className="text-sm mb-2 block">选择支付方式</Label>
            <PaymentMethodSelector
              value={method}
              onChange={m => {
                const fullMethod = paymentMethods.find(pm => (pm.provider_key || pm.method_name) === m.value);
                setMethod(m.value);
                setSelectedMethodMeta(fullMethod || m);
                setProofUrl("");
              }}
              onMethodsLoaded={setPaymentMethods}
              disabled={!canPayment}
            />
          </div>

          {/* Alipay flow */}
          {method === "alipay" && canPayment && (
            <div className="space-y-3">
              <Button className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={handleGenerateAlipay} disabled={generating || !paidAmount || !canPayment}>
                {generating
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成链接中...</>
                  : <><ExternalLink className="w-4 h-4 mr-2" />打开支付宝付款</>}
              </Button>
              <p className="text-xs text-gray-400 text-center">
                点击后将在新标签打开支付宝，付款成功后自动返回
              </p>
            </div>
          )}

          {/* Other methods: upload proof */}
          {method && method !== "alipay" && canPayment && (
            <div className="space-y-3">
              {/* Show payment note + QR from admin config if available */}
              {(selectedMethodMeta?.method_description || selectedMethodMeta?.payment_note || selectedMethodMeta?.payment_qr_code || selectedMethodMeta?.image_url) ? (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                  {(selectedMethodMeta.payment_qr_code || selectedMethodMeta.image_url) && (
                    <div className="text-center">
                      <ImageWithViewer
                        src={selectedMethodMeta.payment_qr_code || selectedMethodMeta.image_url}
                        alt="收款码"
                        thumbClassName="h-40 mx-auto rounded object-contain border border-gray-200"
                      />
                    </div>
                  )}
                  {(selectedMethodMeta.method_description || selectedMethodMeta.payment_note) && (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap text-center">{selectedMethodMeta.method_description || selectedMethodMeta.payment_note}</p>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 text-center">
                  请联系客服获取收款账号，完成付款后上传凭证
                </div>
              )}
              <div>
                <Label className="text-sm">上传付款凭证（上传后自动提交）</Label>
                <FileDropzone
                  className="mt-1"
                  onFile={handleProofUploaded}
                  uploading={uploading || submitting}
                  uploaded={!!proofUrl}
                  label="凭证已上传，正在提交..."
                  placeholder="点击选择图片或拖拽到此处"
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>取消</Button>
        </div>
      </div>
    </div>

      <ConfirmDialog
        open={showAlipayConfirm}
        onOpenChange={setShowAlipayConfirm}
        title="确认付款"
        description="点击下方按钮将跳转到支付宝完成付款"
        confirmText="前往支付宝付款"
        onConfirm={submitToAlipay}
        onCancel={() => setAlipayFormData(null)}
      />
    </>
  );
}