import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ExternalLink, Copy, CheckCircle, AlertCircle, ArrowLeft, Upload, Loader2, Calculator } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLocale } from "@/lib/LocaleContext";
import { t } from "@/lib/i18n";
import PaymentMethodSelector from "@/components/common/PaymentMethodSelector";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { openAlipayPopup } from "@/lib/alipayUtils";

const IS_DEV_MOCK = import.meta.env.VITE_DEV_MOCK === 'true';

const MOCK_PAYMENT_DATA = {
  order: {
    id: 'mock-order-001',
    order_number: 'GC-20260625-001',
    product_name: 'Sony WH-1000XM5 降噪耳机',
    product_image_url: 'https://www.amazon.co.jp/dp/B0BX2L8PBT',
    estimated_jpy: 35000,
    service_fee_amount: 2800,
    prepayment_amount: 15000,
    paid_amount: 0,
    payment_method: 'alipay',
    order_status: 'pending_payment',
    user_note: '请尽快发货',
  },
  settings: {
    alipay_account: 'globalcart@alipay.com',
    alipay_account_name: '张三',
    alipay_qr_url: '',
    payment_pending_reminder: '请在30分钟内完成支付，超时订单将自动取消。',
  },
  payment_methods: [
    { id: 1, name: '支付宝', provider_key: 'alipay', payment_currency: 'CNY', icon: '💰', color: 'bg-blue-100 text-blue-700', is_active: true, sort_order: 0, surcharge_rate: 0, surcharge_fixed_jpy: 0, image_url: '', payment_note: '' },
    { id: 2, name: '微信支付', provider_key: 'wechat', payment_currency: 'CNY', icon: '💚', color: 'bg-green-100 text-green-700', is_active: true, sort_order: 1, surcharge_rate: 0, surcharge_fixed_jpy: 0, image_url: '', payment_note: '' },
    { id: 3, name: '银行转账', provider_key: '', payment_currency: 'JPY', icon: '🏦', color: 'bg-gray-100 text-gray-700', is_active: true, sort_order: 2, surcharge_rate: 0, surcharge_fixed_jpy: 0, image_url: '', payment_note: '请在备注中填写订单号\n到账后1个工作日内确认' },
    { id: 4, name: 'USDT', provider_key: '', payment_currency: 'USD', icon: '💵', color: 'bg-teal-100 text-teal-700', is_active: true, sort_order: 3, surcharge_rate: 1.5, surcharge_fixed_jpy: 0, image_url: '', payment_note: 'TRC20 地址：TXXX...XXX\n请转账后上传凭证' },
    { id: 5, name: 'PayPal', provider_key: 'paypal', payment_currency: 'USD', icon: '🅿️', color: 'bg-blue-100 text-blue-800', is_active: true, sort_order: 4, surcharge_rate: 3.5, surcharge_fixed_jpy: 100, image_url: '', payment_note: '' },
  ],
  rates: { CNY: 0.049, USD: 0.0067, TWD: 0.21 },
  is_full_pay_once: false,
  estimated_shipping_fee: 2500,
  payment_amount_jpy: 15000,
  surcharge_jpy: 0,
  payment_amount_with_surcharge: 15000,
  payment_breakdown: null,
  is_supplement: false,
};

export default function Payment() {

  const { locale } = useLocale();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canSkipProof = can("payment:skip_proof_upload");
  const canSelfPay = can("payment:self_pay");
  const canManualPay = can("payment:manual_pay");
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get("order_id");
  const [selectedMethod, setSelectedMethod] = useState(urlParams.get("method") || "");
  const urlPayCurrency = urlParams.get("pay_currency") || null;
  // Ticket fee breakdown passed from SubmitTicketOrder
  const ticketBreakdown = (() => {
    const raw = urlParams.get("ticket_breakdown");
    if (!raw) return null;
    try { return JSON.parse(decodeURIComponent(raw)); } catch { return null; }
  })();

  const [order, setOrder] = useState(null);
  const [settings, setSettings] = useState({});
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [rates, setRates] = useState(null);
  const [proofFile, setProofFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [showAlipayConfirm, setShowAlipayConfirm] = useState(false);
  const [alipayFormData, setAlipayFormData] = useState(null);

  const method = selectedMethod || order?.payment_method || "alipay";
  // Server-computed payment data (avoids client-side re-derivation bugs)
  const [serverPaymentData, setServerPaymentData] = useState(null);
  const [paymentPendingReminder, setPaymentPendingReminder] = useState("");
  const [otherPaymentConfig, setOtherPaymentConfig] = useState(null);
  const { user } = useCurrentUser();

  const subject = `${user?.displayName} - ${order?.product_name}`;

  const loadPaymentData = (payMethodKey = null) => {
    if (!orderId) {
      navigate(createPageUrl("MyOrders"));
      return;
    }

    if (IS_DEV_MOCK) {
      const data = MOCK_PAYMENT_DATA;
      setOrder(data.order);
      setSettings(data.settings);
      setPaymentMethods(data.payment_methods);
      setRates(data.rates);
      setOtherPaymentConfig(null);
      setServerPaymentData({
        isFullPayOnce: data.is_full_pay_once,
        estimatedShippingFee: data.estimated_shipping_fee,
        paymentAmountJpy: data.payment_amount_jpy,
        surchargeJpy: data.surcharge_jpy,
        paymentAmountWithSurcharge: data.payment_amount_with_surcharge,
        paymentBreakdown: data.payment_breakdown,
        isSupplement: data.is_supplement,
      });
      if (data.settings?.payment_pending_reminder) {
        setPaymentPendingReminder(data.settings.payment_pending_reminder);
      }
      setLoading(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setLoading(false);
      setOrder(null); // Force render error state
    }, 10000); // 10-second timeout

    base44.functions.invoke('payment/getPaymentPageData', { order_id: orderId, ...(payMethodKey ? { payment_method_key: payMethodKey } : {}) })
      .then(r => {
        clearTimeout(timeoutId);
        const data = r.data || {};

        if (!data) {
          setOrder(null); 
        } else {
          setOrder(data.order || data);
          setSettings(data.settings || {});
          if (data.settings?.payment_pending_reminder) {
            setPaymentPendingReminder(data.settings.payment_pending_reminder);
          }
          const methodsList = Array.isArray(data.payment_methods)
            ? data.payment_methods
            : data.payment_methods?.payment_methods || [];
          setPaymentMethods(methodsList);
          setRates(data.rates || null); 
          setOtherPaymentConfig(data.other_payment_config || null);
          setServerPaymentData({
            isFullPayOnce: data.is_full_pay_once || false,
            estimatedShippingFee: data.estimated_shipping_fee || 0,
            paymentAmountJpy: data.payment_amount_jpy ?? null,
            surchargeJpy: data.surcharge_jpy ?? 0,
            paymentAmountWithSurcharge: data.payment_amount_with_surcharge ?? null,
            paymentBreakdown: data.payment_breakdown || null,
            isSupplement: data.is_supplement || false,
          });
        }
        setLoading(false);
      })
      .catch(() => {
        clearTimeout(timeoutId);
        setLoading(false);
        setOrder(null); // Force render error state
      });
  };

  useEffect(() => { loadPaymentData(); }, [orderId]);

  // 监听支付宝付款完成的 postMessage
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data?.type === "alipay_payment_done") {
        // loadPaymentData();
        const url = createPageUrl("MyOrders");

          window.location.href = url;
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [orderId]);

  const handleGenerateAlipayLink = async () => {
    setGeneratingLink(true);
    // 在 await 之前打开新窗口，保留用户手势上下文，否则 Edge 会拦截弹窗

    // CNY 转换 — 优先用下单时的汇率
    const payCurrency = activeMethod?.paymentCurrency  || activeMethod?.payment_currency || urlPayCurrency || "JPY";
    let amountToCharge = amountJpy;
    let currencyToSend = "JPY";
    if (payCurrency !== "JPY") {
      const orderRate = order?.prepaymentRateJpyCny || order?.prepayment_rate_jpy_cny; //下单时的汇率
      const rate = (payCurrency === "CNY" && orderRate) ? orderRate : (rates && rates[payCurrency]); //当无法从当前订单获取汇率，只能够按照当前的汇率
      if (rate) {
        amountToCharge = Math.round(amountJpy * rate * 100) / 100;
        currencyToSend = payCurrency;
      }
    }

    const selectedObj = paymentMethods.find(m => (m.provider_key || m.id) === method);

    //用于更新Payment Method
    const newMethod = {
      payable_amount: amountToCharge,
      method_name: method,
      payment_currency: selectedObj?.payment_currency,
      payment_currency_type: selectedObj?.payment_currency,
      prepayment_rate_jpy_cny: rates[payCurrency],
      provider_key: method
    }

    const payParam = {
      orderId: order.id,
      amount: amountToCharge,
      currency: currencyToSend,
      subject,
      paymentType: "order",
      payment_method: newMethod,
      popup_mode: true
    };

    const res = await base44.functions.invoke('alipay/pay', payParam);
    
    if(!res?.data?.success) {
      toast.error(`下单失败: ${res?.data?.result}`);
      setGeneratingLink(false);
      return;
    }
    
    const formData = res?.data?.form;
    setGeneratingLink(false);

    if (formData && typeof formData === 'string') {
      setAlipayFormData(formData);
      setShowAlipayConfirm(true);
    }
  };

  const submitToAlipay = () => {
    openAlipayPopup(alipayFormData);
    setShowAlipayConfirm(false);
    setAlipayFormData(null);
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUploadAndSubmit = async (file) => {
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setProofFile(file_url);
    setUploading(false);
    await base44.functions.invoke('updateTenantOrder', {
      order_id: order.id,
      payment_proof_url: file_url,
      payment_method: method,
      payment_status: "paid",
      // Supplement payment must not regress order_status; clear the supplement flag instead
      ...(isSupplement ? { supplement_requested: false } : { order_status: "pending_purchase" }),
      paid_amount: newPaidAmount,
      // Record surcharge for financial tracking
      ...(surchargeJpy > 0 ? { payment_surcharge_jpy: Math.round(surchargeJpy) } : {}),
    });
    setSubmitted(true);
    setTimeout(() => navigate(createPageUrl("MyOrders")), 2000);
  };

  if (loading) {
    return <div className="text-center py-20 text-gray-400">加载中...</div>;
  }

  if (!order) {
    return (
      <div className="text-center py-20 text-red-500">
        <AlertCircle className="mx-auto w-12 h-12 mb-4" />
        <h2 className="text-xl font-semibold mb-2">无法加载订单信息</h2>
        <p className="text-sm text-gray-600">订单不存在、已被删除或您没有权限访问。</p>
        <Button variant="outline" className="mt-6" onClick={() => navigate(createPageUrl("MyOrders"))}>
          返回我的订单
        </Button>
      </div>
    );
  }

  // Use server-computed payment data (authoritative, avoids client-side re-derivation)
  const isFullPayOnce = serverPaymentData?.isFullPayOnce || false;
  const paymentBreakdown = serverPaymentData?.paymentBreakdown || null;
  // paymentAmountJpy = base amount before surcharge; paymentAmountWithSurcharge = final amount user pays
  const baseAmountJpy = serverPaymentData?.paymentAmountJpy ?? (order?.prepayment_amount || order?.full_payment_amount || 0);
  const surchargeJpy = serverPaymentData?.surchargeJpy ?? 0;
  const amountJpy = serverPaymentData?.paymentAmountWithSurcharge ?? baseAmountJpy;
  const amountJpyDisplay = Math.round(amountJpy).toLocaleString();
  const isSupplement = serverPaymentData?.isSupplement || false;
  // Shipping-only second payment (fullpay-once) and supplements add to what's already paid
  const isShippingOnlyPayment = isFullPayOnce && paymentBreakdown && paymentBreakdown.product_fee === 0 && paymentBreakdown.shipping_fee > 0;
  const newPaidAmount = (isShippingOnlyPayment || isSupplement) ? (order?.paid_amount || 0) + baseAmountJpy : baseAmountJpy;

  // Find the configured payment method for current selection
  const activeMethod = paymentMethods.find(m => (m.provider_key || m.meghod_name) === method);
  // Automatic callback methods (e.g. alipay) should not show QR / upload proof UI
  const isAutoCallback = !!activeMethod?.provider_key;
  // Alipay gateway info: prefer PaymentMethod entity, fall back to SiteSettings
  const alipayAccount = settings["alipay_account"] || "";
  const alipayName = settings["alipay_account_name"] || "";
  const alipayQr = activeMethod?.image_url || settings["alipay_qr_url"] || "";
  const methodLabel = activeMethod?.name || (method === "other" ? (otherPaymentConfig?.name || "其它支付方式") : method);

  // "其它支付方式" special handling:
  // - skip_proof_override=true: OVERRIDES ALL user permission checks for proof upload skip.
  //   This is set exclusively by tenant admins and is independent of canSkipProof.
  const isOtherMethod = method === "other";
  const otherProofEnabled = isOtherMethod ? (otherPaymentConfig?.proof_enabled !== false) : true;
  // ⚠️ skip_proof_override bypasses canSkipProof entirely — do NOT add any additional permission gate here.
  const effectiveCanSkipProof = isOtherMethod
    ? (otherPaymentConfig?.skip_proof_override === true || canSkipProof)
    : canSkipProof;

  // Currency conversion — prefer activeMethod config, fallback to URL param passed from SubmitOrder
  const payCurrency = activeMethod?.paymentCurrency || activeMethod?.payment_currency || urlPayCurrency || "JPY";
  const isJpy = payCurrency === "JPY";
  let convertedAmount = null;
  let convertedDisplay = null;
  let rateValue = null;
  
  if (!isJpy) {
    // 优先用下单时的汇率，fallback 到实时汇率
    const orderRate = order?.prepaymentRateJpyCny || order?.prepayment_rate_jpy_cny;
    if (payCurrency === "CNY" && orderRate) {
      rateValue = orderRate;
    } else if (rates && rates[payCurrency]) {
      rateValue = rates[payCurrency];
    }
    if (rateValue) {
      const converted = amountJpy * rateValue;
      const decimals = ["TWD", "HKD", "CNY"].includes(payCurrency) ? 1 : 2;
      convertedAmount = converted.toFixed(decimals);
      convertedDisplay = `${payCurrency} ${parseFloat(convertedAmount).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    }
  }

  // Currency symbols map
  const CURRENCY_SYMBOLS = { JPY: "¥", CNY: "¥", USD: "$", TWD: "NT$", HKD: "HK$", EUR: "€", SGD: "S$" };
  const paySymbol = CURRENCY_SYMBOLS[payCurrency] || payCurrency;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(createPageUrl("MyOrders"))}>
          <ArrowLeft className="w-4 h-4 mr-1" />返回
        </Button>
        <h1 className="text-xl font-bold text-gray-900">付款</h1>
      </div>

      {/* Order Summary */}
      <Card className="border-gray-200">
        <CardContent className="pt-4 pb-4">
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-medium text-gray-800">{order.product_name}</div>
                <div className="text-xs text-gray-400 mt-0.5">订单号：{order.order_number}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400">应付金额（JPY）</div>
                <div className={`font-bold text-red-600 ${convertedAmount ? "text-lg" : "text-2xl"}`}>¥{amountJpyDisplay} JPY</div>
              </div>
            </div>

            {surchargeJpy > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs space-y-1">
                <div className="flex justify-between text-yellow-700">
                  <span>订单金额</span>
                  <span>¥{Math.round(baseAmountJpy).toLocaleString()} JPY</span>
                </div>
                <div className="flex justify-between text-yellow-700">
                  <span>支付手续费（{activeMethod?.surcharge_rate > 0 ? `${activeMethod.surcharge_rate}%` : ''}{activeMethod?.surcharge_rate > 0 && activeMethod?.surcharge_fixed_jpy > 0 ? ' + ' : ''}{activeMethod?.surcharge_fixed_jpy > 0 ? `¥${activeMethod.surcharge_fixed_jpy}` : ''}）</span>
                  <span>+¥{Math.round(surchargeJpy).toLocaleString()} JPY</span>
                </div>
                <div className="flex justify-between font-semibold text-yellow-800 border-t border-yellow-200 pt-1">
                  <span>实付合计</span>
                  <span>¥{amountJpyDisplay} JPY</span>
                </div>
              </div>
            )}

                  {paymentPendingReminder && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                {paymentPendingReminder}
              </div>
            )}

            {isSupplement && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">
                本次为补款：管理员已确认需补差额，付款后将累计入订单已付金额
              </div>
            )}

            {/* Ticket fee breakdown */}
            {ticketBreakdown && ticketBreakdown.lines?.length > 0 && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 space-y-2">
                <div className="text-sm font-semibold text-violet-800">票务费用明细</div>
                <div className="space-y-1 text-sm">
                  {ticketBreakdown.lines.map((line, i) => (
                    <div key={i} className="flex justify-between text-violet-700">
                      <span>{line.label}</span>
                      <span>¥{Math.round(line.amount).toLocaleString()}</span>
                    </div>
                  ))}
                  {ticketBreakdown.prepayRate < 100 && (
                    <div className="flex justify-between text-violet-600 text-xs border-t border-violet-200 pt-1">
                      <span>预付比例（{ticketBreakdown.prepayRate}%）</span>
                      <span />
                    </div>
                  )}
                  <div className="border-t border-violet-200 pt-1 flex justify-between font-bold text-violet-800">
                    <span>应付预付款</span>
                    <span>¥{Math.round(ticketBreakdown.total).toLocaleString()}</span>
                  </div>
                </div>
                <p className="text-xs text-violet-600">抢票/抽票结束后，按实际购票数量退还差价</p>
              </div>
            )}

            {/* One-time payment breakdown */}
            {isFullPayOnce && paymentBreakdown && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-800">一次付款明细</span>
                </div>
                <div className="space-y-1 text-sm">
                  {paymentBreakdown.product_fee > 0 && (
                    <div className="flex justify-between text-blue-700">
                      <span>货款</span>
                      <span>¥{paymentBreakdown.product_fee.toLocaleString()}</span>
                    </div>
                  )}
                  {paymentBreakdown.service_fee > 0 && (
                    <div className="flex justify-between text-blue-700">
                      <span>服务费</span>
                      <span>¥{paymentBreakdown.service_fee.toLocaleString()}</span>
                    </div>
                  )}
                  {paymentBreakdown.shipping_fee > 0 && (
                    <div className="flex justify-between text-blue-700">
                      <span>预估运费</span>
                      <span>¥{paymentBreakdown.shipping_fee.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="border-t border-blue-200 pt-2 flex justify-between font-bold text-blue-800">
                    <span>合计</span>
                    <span>¥{paymentBreakdown.total.toLocaleString()}</span>
                  </div>
                </div>
                {isFullPayOnce && order.paid_amount > 0 && (
                  <p className="text-xs text-blue-600">
                    <CheckCircle className="w-3 h-3 inline mr-1" />
                    货款 ¥{order.paid_amount.toLocaleString()} 已支付，本次只需支付运费
                  </p>
                )}
              </div>
            )}
            
            {convertedAmount && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-orange-600 font-medium">实际应付（{payCurrency}）</div>
                    <div className="text-xs text-gray-400 mt-0.5">汇率：1 JPY ≈ {rateValue?.toFixed(4)} {payCurrency}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-orange-600">{paySymbol}{convertedAmount}</div>
                    <div className="text-xs text-orange-500">{payCurrency}</div>
                  </div>
                </div>
                <p className="text-xs text-orange-400 mt-2">请按以上 {payCurrency} 金额付款，汇率实时参考，以实际到账为准</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 支付方式选择 */}
      {paymentMethods.length > 0 && (
        <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">选择支付方式</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentMethodSelector
              value={method}
              onChange={(m) => {
                console.log(order)
                setSelectedMethod(m.value)}
              }
              prefetched={paymentMethods}
              activeColor="border-red-500 bg-red-50 text-red-700"
            />
          </CardContent>
        </Card>
      )}

      {/* Payment Method: Alipay */}
      {method === "alipay" && canSelfPay && (
        <Card className="border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center">
                <span className="text-white text-xs font-bold">支</span>
              </div>
              支付宝付款
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Auto-generate Alipay payment link */}
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700"
              onClick={handleGenerateAlipayLink}
              disabled={generatingLink}
            >
              {generatingLink
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成链接中...</>
                : <><ExternalLink className="w-4 h-4 mr-2" />打开支付宝付款</>}
            </Button>
            <p className="text-xs text-gray-400 text-center">
              点击后将在新标签打开支付宝，付款成功后自动返回
            </p>

            {alipayAccount && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-500">支付宝账号</div>
                    <div className="text-sm font-medium text-gray-800">{alipayAccount}</div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleCopy(alipayAccount)}>
                    {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                {alipayName && (
                  <div>
                    <div className="text-xs text-gray-500">收款人姓名</div>
                    <div className="text-sm font-medium text-gray-800">{alipayName}</div>
                  </div>
                )}
              </div>
            )}

          </CardContent>
        </Card>
      )}

      {/* Other methods — show QR and note from admin config */}
      {method !== "alipay" && (!isAutoCallback || canSelfPay) && canManualPay && (
        <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              {activeMethod?.icon && <span className="text-base">{activeMethod.icon}</span>}
              {methodLabel} 付款
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isAutoCallback && (activeMethod?.image_url || (isOtherMethod && otherPaymentConfig?.image_url)) && (
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-2">扫描二维码付款</p>
                <img
                  src={activeMethod?.image_url || otherPaymentConfig?.image_url}
                  alt="收款码"
                  className="w-48 h-48 mx-auto border border-gray-200 rounded-lg object-contain"
                />
              </div>
            )}
            {(activeMethod?.payment_note || (isOtherMethod && otherPaymentConfig?.note)) ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {activeMethod?.payment_note || otherPaymentConfig?.note}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center">请联系客服获取付款信息</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Upload proof - only for manual (non-auto-callback) methods */}
      {/* effectiveCanSkipProof: for method=other, skip_proof_override from admin OVERRIDES all permission checks */}
      {!isAutoCallback && effectiveCanSkipProof && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-gray-500"
            onClick={async () => {
              await base44.functions.invoke('updateTenantOrder', {
                order_id: order.id,
                payment_method: method,
                payment_status: "paid",
                ...(isSupplement ? { supplement_requested: false } : { order_status: "pending_purchase" }),
                paid_amount: newPaidAmount,
                ...(surchargeJpy > 0 ? { payment_surcharge_jpy: Math.round(surchargeJpy) } : {}),
              });
              navigate(createPageUrl("MyOrders"));
            }}
          >
            跳过凭证直接标记已付款
          </Button>
        </div>
      )}
      {/* For method=other, proof upload can be disabled entirely by admin via other_payment_proof_enabled=false */}
      {!isAutoCallback && (isOtherMethod ? otherProofEnabled : true) && (
        !submitted ? (
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700">上传付款凭证（上传后自动提交）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-gray-400">请在付款完成后上传付款截图或凭证，上传后将自动提交</p>
              <label
                className="cursor-pointer block"
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file && file.type.startsWith("image/")) handleUploadAndSubmit(file);
                }}
              >
                <div className={`flex flex-col items-center gap-2 border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  proofFile ? "border-green-300 bg-green-50 text-green-700" :
                  uploading ? "border-blue-200 bg-blue-50 text-blue-500" :
                  "border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500"
                }`}>
                  {proofFile ? (
                    <><CheckCircle className="w-8 h-8" /><p className="text-sm font-medium">凭证已上传，正在提交...</p></>
                  ) : uploading ? (
                    <><Loader2 className="w-8 h-8 animate-spin" /><p className="text-sm">上传中...</p></>
                  ) : (
                    <><Upload className="w-8 h-8" /><p className="text-sm">点击选择图片或拖拽到此处</p></>
                  )}
                </div>
                <input type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files[0]; if (f) handleUploadAndSubmit(f); }}
                  disabled={uploading} />
                </label>
                <input
                 type="text"
                 placeholder="或点击此处后粘贴截图（Ctrl+V / ⌘V）"
                 className="w-full h-9 px-3 text-xs border border-gray-300 rounded-md bg-white text-gray-500 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 transition-colors"
                 disabled={uploading}
                 onPaste={(e) => {
                   const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith("image/"));
                   if (item) { e.preventDefault(); const f = item.getAsFile(); if (f) handleUploadAndSubmit(f); }
                 }}
                 onChange={() => {}}
                />
                </CardContent>
          </Card>
        ) : (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <AlertDescription className="text-green-800">付款凭证已提交！管理员确认后将更新订单状态。正在跳转...</AlertDescription>
          </Alert>
        )
      )}

      <ConfirmDialog
        open={showAlipayConfirm}
        onOpenChange={setShowAlipayConfirm}
        title="确认支付"
        description="点击下方按钮将跳转到支付宝完成付款"
        confirmText="前往支付宝付款"
        onConfirm={submitToAlipay}
        onCancel={() => setAlipayFormData(null)}
      />
    </div>
  );
}