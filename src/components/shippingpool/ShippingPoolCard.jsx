import { Calendar, Package, Scale, MapPin, Truck, DollarSign, User, Layers, ChevronRight, AlertCircle, MessageCircle, CreditCard, Archive, ArchiveRestore, Trash2, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCountry } from "@/lib/countries";

function truncateName(name, maxLen = 10) {
  if (!name) return "";
  return name.length > maxLen ? name.slice(0, maxLen) + "…" : name;
}

function PackagesSummary({ orderIds, orderNames }) {
  const count = (orderIds || []).length;
  if (!orderNames || orderNames.length === 0) {
    return <span>{count} 件包裹</span>;
  }
  const MAX_SHOW = 2;
  const shown = orderNames.slice(0, MAX_SHOW);
  const remaining = count - shown.length;
  return (
    <span>
      {shown.map((n, i) =>
      <span key={i}>{i > 0 && <span className="text-gray-300 mx-0.5">·</span>}{truncateName(n)}</span>
      )}
      {remaining > 0 && <span className="text-gray-400 ml-1">…等{count}个包裹</span>}
    </span>);

}

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

const METHOD_LABELS = {
  EMS: "EMS", DHL: "DHL", FedEx: "FedEx", SAL: "SAL",
  surface: "海运", small_packet_air: "小包空运", other: "其他"
};

export default function ShippingPoolCard({ pool, onClick, pendingEditCount = 0, isAdmin = false, userProfileMap = {}, onArchive = null, onUnarchive = null, onDelete = null }) {
  const status = STATUS_CONFIG[pool.status] || STATUS_CONFIG.pending;
  const isConsolidation = pool.consolidation_type && pool.consolidation_type !== "";
  
  // Use display_name from userProfileMap if available, otherwise fall back to pool.creator_name
  const creatorProfile = userProfileMap[pool.creator_email] || {};
  const displayCreatorName = creatorProfile.display_name || creatorProfile.full_name || pool.creator_name;

  return (
    <div
      onClick={() => onClick?.(pool)}
      className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md hover:border-gray-300 cursor-pointer transition-all">
      
      {/* Colored top bar based on type */}
      <div className={`h-1 w-full ${isConsolidation ? "bg-gradient-to-r from-blue-400 to-purple-400" : "bg-gradient-to-r from-gray-300 to-gray-400"}`} />

      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge className={`text-xs ${status.color}`}>{status.label}</Badge>
              {isConsolidation &&
              <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200">
                  <Layers className="w-2.5 h-2.5 mr-1 inline" />拼邮
                </Badge>
              }
              {pool.shipping_method &&
              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                  <Truck className="w-2.5 h-2.5" />{METHOD_LABELS[pool.shipping_method.toUpperCase()] || pool.shipping_method}
                </span>
              }
              

              
              {pool.status === "pending" && pool.asap &&
              <Badge className="text-xs bg-orange-100 text-orange-600 border-orange-200">⚡ 尽快</Badge>
              }
              {(pool.status === "awaiting_payment" || pool.status === "awaiting_payment_confirmation") && (() => {
                const breakdownTotal = (pool.fee_breakdown_per_user || []).reduce((s, b) => s + (b.total_jpy || 0), 0);
                const displayAmt = breakdownTotal > 0 ? breakdownTotal : (pool.shipping_fee_jpy || 0);
                if (displayAmt <= 0) return null;
                return (
                  <Badge className={`text-xs border ${pool.status === "awaiting_payment_confirmation" ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-orange-100 text-orange-700 border-orange-200"}`}>
                    <CreditCard className="w-2.5 h-2.5 mr-1 inline" />¥{Math.round(displayAmt).toLocaleString()} {pool.status === "awaiting_payment_confirmation" ? "待确认" : "待付"}
                  </Badge>
                );
              })()}
              {pool.status === "ready_to_ship" &&
              <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">等待发货</Badge>
              }
              {pool.tracking_number &&
              <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                  {pool.tracking_number}
                </span>
              }
            </div>


            {/* Title / transit location */}
            <p className="text-sm font-semibold text-gray-900 mt-1 truncate">
              {isConsolidation ?
              pool.consolidation_type === "transit" ? `中转拼邮 → ${pool.transit_location_name || "中转地"}` : "自选地址拼邮" :
              `单独发货 ${pool.pool_code || ""}`}
            </p>
            {pool.pool_code && isConsolidation &&
            <p className="text-xs text-gray-400 mt-0.5 font-mono">编号：{pool.pool_code}</p>
            }
            {pool.is_private &&
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 mt-0.5">🔒 不公开</span>
            }
          </div>

          {/* Right: date */}
          {pool.scheduled_ship_date &&
          <div className="flex-shrink-0 text-right">
              <p className="text-xs text-gray-400">计划发货</p>
              <p className="text-xs font-medium text-gray-700 flex items-center gap-1 mt-0.5">
                <Calendar className="w-3 h-3" />{pool.scheduled_ship_date}
              </p>
            </div>
          }
        </div>

        {/* Consolidation progress bar */}
        {isConsolidation && pool.consolidation_min_weight_g > 0 && (() => {
          const groupWeight = pool.total_weight_g || 0;
          const minWeight = pool.consolidation_min_weight_g;
          const pct = Math.min(100, (groupWeight / minWeight) * 100);
          const isReady = groupWeight >= minWeight;
          return (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-gray-500"><Target className="w-3 h-3" />凑单进度</span>
                <span className={isReady ? "text-green-600 font-medium" : "text-gray-500"}>{groupWeight}g / {minWeight}g</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${isReady ? "bg-green-500" : "bg-blue-400"}`} style={{ width: `${pct}%` }} />
              </div>
              {!isReady && <p className="text-xs text-gray-400">还差 {minWeight - groupWeight}g</p>}
              {isReady && <p className="text-xs text-green-600 font-medium">✓ 已达到发货重量</p>}
            </div>
          );
        })()}

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-gray-600">
          <div className="flex items-center gap-1.5 col-span-2">
            <Package className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <PackagesSummary orderIds={pool.order_ids} orderNames={pool.order_names} />
          </div>
          {pool.total_weight_g > 0 &&
          <div className="flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span>{pool.total_weight_g}g</span>
            </div>
          }
          




          
          {pool.destination_country &&
          <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span>{getCountry(pool.destination_country)?.name || pool.destination_country}</span>
            </div>
          }
          {(pool.actual_fee || pool.estimated_fee) &&
          <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span>
                {pool.actual_fee ?
              `JPY ${Math.round(pool.actual_fee).toLocaleString()}` :
              `≈ ${pool.fee_currency || "CNY"} ${Math.round(pool.estimated_fee)}`}
              </span>
            </div>
          }
          {isConsolidation && pool.consolidation_deadline && (
            <div className="flex items-center gap-1.5 text-orange-500">
              <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
              <span>截止 {pool.consolidation_deadline}</span>
            </div>
          )}
          {displayCreatorName &&
          <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="truncate">{displayCreatorName}</span>
            </div>
          }
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-gray-50">
          <span className="text-xs text-gray-400">
            {new Date(pool.created_at).toLocaleDateString("zh-CN")}
            
          </span>
          <div className="flex items-center gap-2">
            {pendingEditCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-medium">
                <AlertCircle className="w-3 h-3" />{pendingEditCount} 项更改申请
              </span>
            )}
            {(pool.unread_roles || []).includes(isAdmin ? "admin" : "user") && (
              <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full font-medium animate-pulse">
                <MessageCircle className="w-3 h-3" />有新留言
              </span>
            )}
            {onArchive && (
              <button
                onClick={e => { e.stopPropagation(); onArchive(); }}
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors">
                <Archive className="w-3 h-3" />存档
              </button>
            )}
            {onUnarchive && (
              <button
                onClick={e => { e.stopPropagation(); onUnarchive(); }}
                className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors">
                <ArchiveRestore className="w-3 h-3" />取消存档
              </button>
            )}
            {onDelete && (
              <button
                onClick={e => { e.stopPropagation(); onDelete(); }}
                className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors">
                <Trash2 className="w-3 h-3" />删除
              </button>
            )}
            <span className="text-xs text-gray-400 flex items-center gap-0.5 hover:text-gray-600">
              查看详情 <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>
    </div>);

}