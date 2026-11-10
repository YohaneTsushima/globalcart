/**
 * TransitNotifyShipmentModal - 暂存订单发起中转地发货申请（精简版）
 * 只包含：最终收货地址 + 中转段运输方式 + 支付运费
 * 复用 AddressBlock / PaymentMethodSelector / ImageUploader，不改动 UserNotifyShipmentModal
 */
import { useState, useEffect, useRef } from "react";
import { X, Truck, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { openAlipayPopup } from "@/lib/alipayUtils";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import AddressBlock from "@/components/orders/AddressBlock";
import PaymentMethodSelector from "@/components/common/PaymentMethodSelector";
import ImageUploader from "@/components/common/ImageUploader";
import { ImageWithViewer } from "@/components/common/ImageViewer";
import {
  serializeAddressToText,
  isAddressFormValid,
  EMPTY_ADDRESS_FORM,
} from "@/components/common/AddressForm";
import { transitLocationApi } from "@/lib/tenantApi";

const CURRENCY_SYMBOLS = { CNY: "¥", USD: "$", TWD: "NT$", HKD: "HK$", EUR: "€", SGD: "S$" };

export default function TransitNotifyShipmentModal({ pool, order, orders, initialData, onClose, onProofUploaded, onSuccess }) {
  const targetOrders = orders || (order ? [order] : []);
  const isMulti = targetOrders.length > 1;

  // pool 数据来自 findTransitForShipment 返回的 data.pools（数组），
  // 优先从 initialData 解析；找不到再回退到外部传入的 pool prop
  const resolvedPool = (() => {
    const pools = initialData?.pools || initialData?.pool || [];
    const fromInitial = Array.isArray(pools)
      ? (pools.find(p => order?.consolidation_pool_id && String(p.id) === String(order.consolidation_pool_id)) || pools[0])
      : pools;
    return fromInitial || pool || null;
  })();

  // ── 地址 ──────────────────────────────────────────────────────────────────
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [userPrefId, setUserPrefId] = useState(null);
  const [finalAddressId, setFinalAddressId] = useState("");
  const [addressInputMode, setAddressInputMode] = useState({ final: false });
  const [newAddress, setNewAddress] = useState(EMPTY_ADDRESS_FORM);
  const [saveNewAddress, setSaveNewAddress] = useState(true);

  // ── 中转方式 ──────────────────────────────────────────────────────────────
  const [transitLocations, setTransitLocations] = useState([]);
  const [transitMethods, setTransitMethods] = useState([]);
  const [selectedTransitMethodId, setSelectedTransitMethodId] = useState("");
  // 暂存订单重新发货：隐藏"暂存"/"自取"，只显示真实发货方式
  const isStorageReship = true;

  // ── 支付 ──────────────────────────────────────────────────────────────────
  const [paymentMethod, setPaymentMethod] = useState("");
  const [selectedMethodMeta, setSelectedMethodMeta] = useState(null);
  const [proofUrl, setProofUrl] = useState("");
  const [proofError, setProofError] = useState("");
  const [uploadingProof, setUploadingProof] = useState(false);
  const [alipayUrl, setAlipayUrl] = useState(null);
  const [alipayFormData, setAlipayFormData] = useState(null);
  const [showAlipayConfirm, setShowAlipayConfirm] = useState(false);
  const [generatingAlipay, setGeneratingAlipay] = useState(false);
  const [alipayPaying, setAlipayPaying] = useState(false);
  const alipayPopupRef = useRef(null);
  const alipayPollTimerRef = useRef(null);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  // 监听支付宝回调的 postMessage（PaymentClose 发送）——付款完成后关闭并刷新
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data?.type === "alipay_payment_done") {
        if (alipayPollTimerRef.current) {
          clearInterval(alipayPollTimerRef.current);
          alipayPollTimerRef.current = null;
        }
        setAlipayPaying(false);
        toast.success('支付成功');
        onSuccessRef.current?.();
      }
      if (e.data?.type === "alipay_payment_navigate" && e.data.url) {
        window.location.href = e.data.url;
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (alipayPollTimerRef.current) clearInterval(alipayPollTimerRef.current);
    };
  }, []);

  const [exchangeRates, setExchangeRates] = useState(null);
  const [userCredit, setUserCredit] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  // ── 初始化：从 initialData 加载 ───────────────────────────────────────────
  useEffect(() => {
    if (!initialData) return;
    const data = {
      ...initialData,
      userPreference: initialData.userPreference || initialData.user_preference || null,
      transitLocations: initialData.transitLocations || initialData.transit_locations || [],
      transitMethods: initialData.transitMethods || initialData.transit_methods || [],
    };
    const pref = data.userPreference;
    if (pref?.saved_addresses) setSavedAddresses(pref.saved_addresses);
    if (pref?.id) setUserPrefId(pref.id);
    if (pref?.default_address_id) setFinalAddressId(pref.default_address_id);
    setTransitLocations(data.transitLocations || []);
    setTransitMethods(data.transitMethods || []);
    setExchangeRates(initialData.exchangeRates || null);
    setUserCredit(initialData.userCredit || null);
    base44.auth.me().then(res => setCurrentUser(res?.data || res || null));
  }, [initialData]);

  // ── 地址校验 ──────────────────────────────────────────────────────────────
  const isNewAddressMode = !!addressInputMode.final || savedAddresses.length === 0;
  const isAddressOk = () => {
    if (isNewAddressMode) return isAddressFormValid(newAddress);
    return !!finalAddressId;
  };

  const resolvedAddress = (() => {
    if (isNewAddressMode) {
      if (!isAddressFormValid(newAddress)) return null;
      return {
        id: `new_${Date.now()}`,
        label: newAddress.label || "新地址",
        full_text: serializeAddressToText(newAddress),
        ...newAddress,
      };
    }
    return savedAddresses.find(a => a.id === finalAddressId) || null;
  })();

  // ── 中转方式（暂存重新发货：只显示真实方式）─────────────────────────────
  const selectedLoc = transitLocations.find(l => String(l.id) === String(targetOrders[0]?.transit_location_id));
  const disabledMethodIds = selectedLoc?.disabled_transit_method_ids || [];
  const visibleMethods = transitMethods.filter(m => !disabledMethodIds.some(id => String(id) === String(m.id)));

  const getRateSummary = (m) => {
    if (m.rate_mode === "fixed" || !m.simple_rates?.length) {
      return `+${m.fee_currency || "CNY"} ${Number(m.fee || 0).toLocaleString()}`;
    }
    const r = m.simple_rates[0];
    return `首${r.first_weight_g}g/${r.first_weight_fee}${r.currency}`;
  };

  // ── 支付：凭证上传 ────────────────────────────────────────────────────────
  const handleProofChange = async (file) => {
    if (!file) return;
    if (!resolvedPool?.id) {
      setProofError("缺少中转池信息，无法上传凭证");
      return;
    }
    setUploadingProof(true);
    setProofError("");
    let file_url = "";
    try {
      ({ file_url } = await base44.integrations.Core.UploadFile({ file, path: "transit_proof" }));
      setProofUrl(file_url);

      let data = {
        pool_code: resolvedPool.pool_code,
        payment_proof_url: file_url,
        transit_shipping_method_id: selectedTransitMethodId,
        payment_method: selectedMethodMeta?.method_name || selectedMethodMeta?.label || "",
        payment_method_id: selectedMethodMeta?.id || null,
        address_id: resolvedAddress.id,
        // 多订单传全部订单号数组，单订单传长度 1 的数组
        order_number: targetOrders.map(o => o.order_number).filter(Boolean),
      }
      await transitLocationApi.handleUploadProof(resolvedPool.id, data);

      setProofError("");
      toast.success(`[${targetOrders.map(o => o.order_number).filter(Boolean).join("、")}] 的中转凭证上传成功！`);

      await onProofUploaded?.();

    } catch (err) {
      const message = err?.response?.data?.message;
      console.error('[TransitNotifyShipmentModal] handleProofChange failed:', message);
      // 显示常驻错误信息（不只靠 toast）
      setProofError(`上传失败：${message}` || '凭证保存失败，请重新上传');
      // 上传到存储成功但保存失败：把刚上传的文件删掉（传显式 url，proofUrl state 还没更新）
      handleDeleteProof({ url: file_url, silent: true });
    } finally {
      setUploadingProof(false);
    }
  };

  // ── 支付：凭证删除 ────────────────────────────────────────────────────────
  const handleDeleteProof = async ({ isError = false, url: explicitUrl, silent = false } = {}) => {
    const url = explicitUrl || proofUrl || resolvedPool?.payment_proof_url;
    if (!url) return;

    if (isError) {
      setProofError("凭证显示错误，请重新上传");
    } else if (!silent) {
      // 用户主动删除：清空错误信息
      // silent（失败回滚删除）：保留 catch 里已设置的错误信息，不能清空
      setProofError("");
    }

    setProofUrl("");
    try {
      await base44.integrations.Core.DeleteFile({ imageUrl: url, path: "transit_proof" });
    } catch (_) {}

    // silent：失败回滚删除，不弹"删除成功"（错误信息已在 proofError 显示）
    if (!isError && !silent) {
      toast.success("付款凭证已删除");
    }
  };

  // ── 支付：支付宝 ──────────────────────────────────────────────────────────
  const handleGenerateAlipay = async () => {
    if (!currentUser) return;
    if (!selectedTransitMethodId) {
      toast.error("请先选择中转段运输方式");
      return;
    }
    // 支付宝默认 CNY（payment_currency 为空时回退 CNY）
    const payCurrency = selectedMethodMeta?.payment_currency || "CNY";
    const amountJpy = 0; // 运费金额由后端计算，前端仅传方式
    let amountToCharge = amountJpy;
    let currencyToSend = "CNY";
    if (payCurrency !== "JPY" && exchangeRates?.[payCurrency]) {
      amountToCharge = Math.round(amountJpy * exchangeRates[payCurrency] * 100) / 100;
      currencyToSend = payCurrency;
    }
    const newMethod = {
      method_name: selectedMethodMeta?.value,
      payment_currency: selectedMethodMeta?.payment_currency,
      payment_currency_type: selectedMethodMeta?.payment_currency,
      prepayment_rate_jpy_cny: exchangeRates?.[`jpy_${payCurrency.toLowerCase()}`],
      provider_key: selectedMethodMeta?.value,
      payment_config_id: selectedMethodMeta?.id,
    };
    setGeneratingAlipay(true);
    try {

      const res = await base44.functions.invoke("alipay/transit/pay", {
        pool_id: targetOrders[0]?.consolidation_pool_id,
        user_id: currentUser.id,
        subject: `中转运费-${targetOrders[0]?.order_number || ""}`,
        payment_type: "transit_ship",
        paid_currency: currencyToSend,
        payment_method: newMethod,
        popup_mode: true,
        transit_method_id: selectedTransitMethodId,
        address_id: resolvedAddress.id
      });
      if (!res?.data?.success) {
        toast.error(`下单失败: ${res?.data?.result}`);
        return;
      }
      const formData = res?.data?.form;
      if (formData && typeof formData === 'string') {
        setAlipayFormData(formData);
        setShowAlipayConfirm(true);
      } else {
        toast.error("下单成功但未返回支付表单");
      }
    } catch (err) {
      toast.error("生成支付宝链接失败: " + (err?.message || err));
    } finally {
      setGeneratingAlipay(false);
    }
  };

  const submitToAlipay = () => {
    const popup = openAlipayPopup(alipayFormData);
    setShowAlipayConfirm(false);
    setAlipayFormData(null);
    if (popup) {
      setAlipayPaying(true);
      alipayPopupRef.current = popup;
      alipayPollTimerRef.current = setInterval(() => {
        if (popup.closed) {
          clearInterval(alipayPollTimerRef.current);
          alipayPollTimerRef.current = null;
          setAlipayPaying(false);
        }
      }, 500);
    }
  };

  // ── 支付：记账 ────────────────────────────────────────────────────────────
  const handleCreditPayment = async () => {
    try {
      const res = await base44.functions.invoke('manageCreditApplication', {
        action: 'use_credit_for_pool',
        pool_id: targetOrders[0]?.consolidation_pool_id,
      });
      if (res.data?.success) {
        toast.success("记账付款成功");
        onSuccess?.();
      }
    } catch (err) {
      toast.error("记账付款失败: " + (err?.message || err));
    }
  };

  // 进行中（上传凭证 / 生成支付宝 / 支付中）时，阻止用户点 modal 外部关闭
  const busy = uploadingProof || generatingAlipay || alipayPaying;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto relative">
        {/* 进行中遮盖层：阻止点击 modal 内外任意区域 */}
        {busy && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-xl z-20 flex flex-col items-center justify-center gap-3"
               onClick={e => e.stopPropagation()}>
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm text-gray-600 font-medium">
              {alipayPaying
                ? "支付中，请在弹出的支付宝窗口完成付款..."
                : uploadingProof
                  ? "凭证上传保存中，请稍候..."
                  : "处理中，请稍候..."}
            </p>
            <p className="text-xs text-gray-400">请不要刷新、关闭本页面或点击其他区域...</p>
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-900">
            申请中转地发货{isMulti ? `（${targetOrders.length} 件）` : ""}
          </h2>
          <button onClick={() => { if (!busy) onClose(); }} disabled={busy}
            className={`text-gray-400 hover:text-gray-600 ${busy ? "opacity-40 cursor-not-allowed" : ""}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 最终收货地址 */}
          <AddressBlock
            label="最终收货地址"
            savedAddresses={savedAddresses}
            selectedId={finalAddressId}
            isNewMode={isNewAddressMode}
            newAddress={newAddress}
            onSelect={(id) => {
              setFinalAddressId(id);
              setAddressInputMode(prev => ({ ...prev, final: false }));
            }}
            onNewAddressChange={(fnOrObj) => {
              setNewAddress(prev => typeof fnOrObj === 'function' ? fnOrObj(prev) : fnOrObj);
            }}
            onSaveToggle={setSaveNewAddress}
            error={!isAddressOk()}
          />

          {/* 中转段运输方式 */}
          <div>
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wide flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" />中转段运输方式 <span className="text-red-500">*</span>
            </label>
            <div className="mt-1.5 space-y-1.5">
              {visibleMethods.map(m => (
                <label
                  key={m.id}
                  className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    String(selectedTransitMethodId) === String(m.id)
                      ? "border-orange-400 bg-orange-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={String(selectedTransitMethodId) === String(m.id)}
                      onChange={() => setSelectedTransitMethodId(m.id)}
                      className="accent-orange-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-800">{m.name}</span>
                      {m.description && <span className="text-xs text-gray-400 ml-2">{m.description}</span>}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-orange-700 flex-shrink-0">{getRateSummary(m)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 支付运费 */}
          <div>
            <label className="text-xs text-gray-500 font-medium mb-2 block">选择支付方式</label>
            <PaymentMethodSelector
              value={paymentMethod}
              onChange={m => {
                setPaymentMethod(m.id);
                setSelectedMethodMeta(m);
                setAlipayUrl(null);
              }}
              activeColor="border-orange-500 bg-orange-50 text-orange-700"
            />

            {/* 记账后付款 */}
            {userCredit?.credit_enabled && (() => {
              const remaining = (userCredit.credit_limit_jpy || 0) - (userCredit.credit_balance_jpy || 0);
              return (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod("credit");
                      setSelectedMethodMeta({ id: "credit", value: "credit", label: "记账后付款", payment_currency: "JPY" });
                      setAlipayUrl(null);
                    }}
                    className={`w-full p-3 rounded-lg border-2 text-sm font-medium transition-all flex items-center gap-2 ${
                      paymentMethod === "credit"
                        ? "border-purple-500 bg-purple-50 text-purple-700"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    <span className="text-base">📋</span>
                    <span>记账后付款</span>
                    <span className="text-xs ml-auto text-purple-500">剩余额度 ¥{Math.round(remaining).toLocaleString()}</span>
                  </button>
                </div>
              );
            })()}

            {/* 收款码 */}
            {(selectedMethodMeta?.payment_qr_code || selectedMethodMeta?.image_url) && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2 mt-2">
                <div className="text-center">
                  <ImageWithViewer
                    src={selectedMethodMeta.payment_qr_code || selectedMethodMeta.image_url}
                    alt="收款码"
                    thumbClassName="h-40 mx-auto rounded object-contain border border-gray-200"
                  />
                </div>
                {(selectedMethodMeta.method_description || selectedMethodMeta.payment_note) && (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap text-center">
                    {selectedMethodMeta.method_description || selectedMethodMeta.payment_note}
                  </p>
                )}
              </div>
            )}

            {/* 汇率换算 */}
            {selectedMethodMeta?.payment_currency && selectedMethodMeta.payment_currency !== "JPY" && exchangeRates?.[selectedMethodMeta.payment_currency] && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 space-y-1 mt-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>汇率换算参考</span>
                  <span>1 JPY ≈ {exchangeRates[selectedMethodMeta.payment_currency].toFixed(5)} {selectedMethodMeta.payment_currency}</span>
                </div>
              </div>
            )}

            {/* 记账付款按钮 */}
            {paymentMethod === "credit" && (
              <Button className="w-full bg-purple-600 hover:bg-purple-700 mt-2" onClick={handleCreditPayment}>
                确认使用记账付款
              </Button>
            )}

            {/* 支付宝 */}
            {selectedMethodMeta?.value === "alipay" && (
              <div className="space-y-2 mt-2">
                <div className="flex gap-2">
                  <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleGenerateAlipay} disabled={generatingAlipay}>
                    {generatingAlipay ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</>
                    ) : (
                      <><ExternalLink className="w-4 h-4 mr-2" />生成支付宝付款链接</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* 凭证上传 */}
            {paymentMethod && selectedMethodMeta?.value !== "alipay" && selectedMethodMeta?.value !== "credit" && (
              <div className="mt-2">
                <ImageUploader
                  value={proofUrl}
                  onChange={handleProofChange}
                  onDelete={handleDeleteProof}
                  uploading={uploadingProof}
                  label="上传付款凭证"
                  id="transit-shipment-proof"
                />
                {proofError && (
                  <p className="mt-1.5 text-xs text-red-600">{proofError}</p>
                )}
              </div>
            )}
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
    </div>
  );
}
