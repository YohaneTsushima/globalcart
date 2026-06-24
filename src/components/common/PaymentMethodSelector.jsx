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
 * @param {string}   value       - currently selected method value (providerKey or methodName)
 * @param {function} onChange    - called with (method) where method = { value, label, paymentDescription, paymentQrCode }
 * @param {string}   className   - extra class for the grid wrapper
 * @param {Array}    prefetched  - optional pre-fetched methods list (skip fetching)
 * @param {string}   activeColor - tailwind classes for active border, e.g. "border-blue-500 bg-blue-50 text-blue-700"
 */
export default function PaymentMethodSelector({ value, onChange, className = "", prefetched = null, activeColor = "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200" }) {
  const [methods, setMethods] = useState(prefetched ?? null);
  const [loading, setLoading] = useState(prefetched === null);

  useEffect(() => {
    if (prefetched !== null) {
      setMethods(prefetched);
      setLoading(false);
      return;
    }
    setLoading(true);
    base44.functions.invoke('managePaymentMethod', { action: 'list' })
      .then(r => {
        setMethods(r.data?.methods || []);
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

  const autoMethods = displayMethods.filter(m => !!m.providerKey);
  const manualMethods = displayMethods.filter(m => !m.providerKey);
  const hasBothTypes = autoMethods.length > 0 && manualMethods.length > 0;

  const renderButton = (m) => {
    const methodValue = m.providerKey || m.methodName;
    const isActive = value === methodValue;
    return (
      <button
        key={m.id || methodValue}
        type="button"
        onClick={() => onChange({ value: methodValue, label: m.methodName, paymentDescription: m.paymentDescription || "", paymentQrCode: m.paymentQrCode || "", icon: m.icon || "", color: m.color || "", paymentCurrency: m.paymentCurrency || null, paymentMethodFeeRate: m.paymentMethodFeeRate || 0, paymentMethodFeeFlat: m.paymentMethodFeeFlat || 0 })}
        className={`p-3 rounded-lg border-2 text-sm font-medium transition-all flex items-center gap-2 ${
          isActive ? activeColor : "border-gray-200 text-gray-500 hover:border-gray-300"
        }`}
      >
        {m.icon && <span className="text-base leading-none">{m.icon}</span>}
        <span>{m.methodName}</span>
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