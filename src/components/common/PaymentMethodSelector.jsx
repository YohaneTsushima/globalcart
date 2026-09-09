/**
 * PaymentMethodSelector
 * Fetches active payment methods from backend and renders a selection grid.
 * Falls back to a default set if none are configured.
 * Used in: PaymentModal, BulkPaymentModal, ShippingPoolDetailModal, Payment page.
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

// No hardcoded fallbacks — only show what the tenant has configured

/**
 * @param {string}   value           - currently selected method value (provider_key or method_name)
 * @param {function} onChange        - called with (method) where method = { value, label, payment_description, payment_qr_code }
 * @param {string}   className       - extra class for the grid wrapper
 * @param {Array}    prefetched      - optional pre-fetched methods list (skip fetching)
 * @param {string}   activeColor     - tailwind classes for active border, e.g. "border-blue-500 bg-blue-50 text-blue-700"
 * @param {function} onMethodsLoaded - callback when methods list is loaded, receives the full list
 */
export default function PaymentMethodSelector({ value, onChange, className = "", prefetched = null, activeColor = "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200", onMethodsLoaded }) {
  const [methods, setMethods] = useState(prefetched ?? null);
  const [loading, setLoading] = useState(prefetched === null);

  useEffect(() => {
    if (prefetched !== null) {
      setMethods(prefetched);
      setLoading(false);
      onMethodsLoaded?.(prefetched);
      return;
    }
    setLoading(true);
    base44.functions.invoke('config/page/getPaymentMethod', { action: 'list' })
      .then(r => {
        const list = r.data?.payment_methods || [];
        setMethods(list);
        onMethodsLoaded?.(list);
      })
      .catch(() => setMethods([]))
      .finally(() => setLoading(false));
  }, [prefetched]);

  if (loading) {
    return (
      <div className={`grid grid-cols-2 gap-2 ${className}`}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-11 rounded-lg border-2 border-gray-100 bg-gray-50 animate-pulse" />
        ))}
      </div>
    );
  }

  const displayMethods = methods ?? [];

  if (displayMethods.length === 0) {
    return <p className="text-xs text-gray-400 py-2">暂无可用支付方式，请联系管理员配置。</p>;
  }

  const autoMethods = displayMethods.filter(m => !!m.provider_key);
  const manualMethods = displayMethods.filter(m => !m.provider_key);
  const hasBothTypes = autoMethods.length > 0 && manualMethods.length > 0;

  const renderButton = (m) => {
    
    const methodValue = m.provider_key || m.method_name;
    const isActive = value === m?.id;
    const isDisabled = m.is_active === false;

    return (
      <button
        key={m.id || methodValue}
        type="button"
        onClick={() => !isDisabled && onChange({ id: m.id, value: methodValue, label: m.method_name, payment_description: m.payment_description || "", payment_qr_code: m.payment_qr_code || "", image_url: m.image_url || "", payment_note: m.payment_note || "", icon: m.icon || "", color: m.color || "", payment_currency: m.payment_currency || null, payment_method_fee_rate: m.payment_method_fee_rate || 0 })}
        disabled={isDisabled}
        className={`p-3 rounded-lg border-2 text-sm font-medium transition-all flex items-center gap-2 ${
          isDisabled
            ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed opacity-60"
            : isActive
            ? activeColor
            : "border-gray-200 text-gray-500 hover:border-gray-300"
        }`}
      >
        {m.image_url ? (
          <img src={m.image_url} alt={m.method_name} className="w-5 h-5 object-contain" />
        ) : m.icon ? (
          <span className="text-base leading-none">{m.icon}</span>
        ) : null}
        <span>{m.method_name}</span>
      </button>
    );
  };

  if (!hasBothTypes) {
    return (
      <div className={`grid grid-cols-2 gap-2 ${className}`}>
        {displayMethods.map(renderButton)}
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <p className="text-xs font-medium text-green-700 mb-1.5 flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500"></span>
          自动确认
        </p>
        <div className="grid grid-cols-2 gap-2">
          {autoMethods.map(renderButton)}
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400"></span>
          手动确认
        </p>
        <div className="grid grid-cols-2 gap-2">
          {manualMethods.map(renderButton)}
        </div>
      </div>
    </div>
  );
}