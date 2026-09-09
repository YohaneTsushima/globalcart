/**
 * ShippingFeeBreakdown
 * Reusable component to display per-user fee breakdown for a ShippingPool.
 * Used in both AdminShippingInfoPanel and the user payment panel.
 */
import { Badge } from "@/components/ui/badge";

export default function ShippingFeeBreakdown({ breakdowns, isConsolidation, currentUserEmail = null, userProfileMap = {} }) {
  if (!breakdowns || breakdowns.length === 0) return null;

  // If currentUserEmail is set, only show that user's breakdown (user view)
  const displayBreakdowns = currentUserEmail
    ? breakdowns.filter(b => b.user_email === currentUserEmail)
    : breakdowns;

  if (displayBreakdowns.length === 0) return null;

  return (
    <div className="space-y-3">
      {displayBreakdowns.map(b => (
        <div key={b.user_email} className="bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
          {/* Show user header only in admin view (multiple users) or consolidation */}
          {(!currentUserEmail || isConsolidation) && breakdowns.length > 1 && (() => {
            const profile = userProfileMap[b.user_email] || {};
            const displayName = profile.display_name || profile.full_name || b.user_email;
            const avatarUrl = profile.avatar_url || '';
            const initial = (displayName[0] || '?').toUpperCase();
            return (
              <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs font-medium flex-shrink-0">{initial}</div>
                  )}
                  <span className="text-xs font-medium text-gray-700 truncate">{displayName}</span>
                  {profile.display_name && <span className="text-xs text-gray-400 truncate hidden sm:inline">{b.user_email}</span>}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{b.user_weight_g}g · {b.user_orders?.length || 0} 件</span>
              </div>
            );
          })()}
          <div className="px-3 py-2 space-y-1.5">
            {b.items.map((item, idx) => (
              <div key={idx} className={`${item.is_shared ? "text-blue-700 bg-blue-50 -mx-3 px-3 py-1 rounded" : "text-gray-700"}`}>
                <div className={`flex justify-between items-start gap-2 text-xs ${item.has_custom ? "" : ""}`}>
                  <span className="flex-1">{item.label}</span>
                  <span className={`font-medium flex-shrink-0 ${item.has_custom ? "line-through text-gray-400" : ""}`}>
                    ¥{Math.round(item.has_custom ? item.original_fee : item.amount_jpy).toLocaleString()}
                  </span>
                </div>
                {item.has_custom && (
                  <div className="flex justify-between items-center text-xs text-yellow-600 mt-0.5">
                    <span>用户自定义</span>
                    <span className="font-medium">¥{Math.round(item.amount_jpy).toLocaleString()}</span>
                  </div>
                )}
              </div>
            ))}
            {b.items.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-1">暂无费用明细</p>
            )}
          </div>
          <div className="px-3 py-2 bg-orange-50 border-t border-orange-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-orange-700">
              {currentUserEmail ? "您需支付" : "应付合计"}
            </span>
            <span className="text-base font-bold text-orange-600">
              ¥{Math.round(b.total_jpy || 0).toLocaleString()} <span className="text-xs font-normal">JPY</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}