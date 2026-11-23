import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Zap, X } from "lucide-react";

/**
 * Shows a "预出货" badge on orders with pre_shipment data.
 * On click, shows a small popover with a brief summary.
 *
 * status 为后端 pre_shipment_status：
 * - pending_payment：未付款时提交，等付款成立后才生效（橙色）
 * - submitted：已生效（蓝色）
 * - consumed：已随入库生成发货申请
 */
export default function PreShipmentBadge({ preShipment, status }) {
  const [open, setOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);

  if (!preShipment) return null;

  const ps = preShipment;
  const isPendingPayment = status === "pending_payment";
  const isConsumed = status === "consumed";

  // Determine shipping mode label
  let modeLabel = "";
  let modeColor = "text-gray-700";
  if (ps.consType === "transit" && ps.transit_location_name) {
    modeLabel = `中转拼邮 → ${ps.transit_location_name}`;
    modeColor = "text-purple-700";
  } else if (ps.consType === "official_pool" || ps.pool_id) {
    const poolName = ps.target_pool_title || ps.target_pool_code || "";
    modeLabel = poolName ? `官方拼邮 → ${poolName}` : "官方拼邮看板（自动匹配）";
    modeColor = "text-indigo-700";
  } else {
    modeLabel = "直接发货";
    modeColor = "text-green-700";
  }

  const lines = [];
  lines.push({
    label: "状态",
    value: isPendingPayment ? "待付款生效（未付款时不生效）" : isConsumed ? "已随入库生成发货申请" : "已生效"
  });
  if (ps.shipping_method) lines.push({ label: "运输方式", value: ps.shipping_method });
  if (ps.scheduled_ship_date) {
    // 表单里「尽快」用哨兵值 __asap__ 存，直接展示会变成英文标记
    lines.push({ label: "计划发货", value: ps.scheduled_ship_date === "__asap__" ? "尽快" : ps.scheduled_ship_date });
  }
  if ((ps.selected_addons || []).length > 0) {
    // 后端 OrderAddon 只有 service_name，没有 name 字段；老数据可能两者都为空
    const addonNames = (ps.selected_addons || [])
      .map(a => a.service_name || a.name)
      .filter(Boolean);
    lines.push({
      label: "增值服务",
      value: addonNames.length > 0 ? addonNames.join("、") : `${ps.selected_addons.length} 项`
    });
  }
  else if ((ps.selected_addon_ids || []).length > 0)
    lines.push({ label: "增值服务", value: `${ps.selected_addon_ids.length} 项` });
  if (ps.user_note) lines.push({ label: "备注", value: ps.user_note });

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        onClick={e => { 
          e.stopPropagation(); 
          if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPopoverPos({ 
              top: rect.bottom + 6,
              left: rect.left 
            });
          }
          setOpen(v => !v); 
        }}
        className={`inline-flex items-center gap-1 text-xs border px-1.5 py-0.5 rounded-full font-medium transition-colors ${
          isPendingPayment
            ? "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200"
            : isConsumed
              ? "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
              : "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200"
        }`}
      >
        <Zap className="w-2.5 h-2.5" />
        {isPendingPayment ? "预出货·待付款" : isConsumed ? "预出货已生效" : "预出货"}
      </button>

      {open && createPortal(
        <>
          {/* backdrop to close */}
          <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setOpen(false); }} />
          <div
            className="fixed bg-white border border-blue-200 rounded-lg shadow-xl p-3 min-w-[200px] max-w-[280px] z-50"
            style={{ top: `${popoverPos.top}px`, left: `${popoverPos.left}px` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                <Zap className="w-3 h-3" />预出货信息摘要
              </span>
              <button onClick={e => { e.stopPropagation(); setOpen(false); }}>
                <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>
            {/* Shipping mode highlight */}
            <div className={`text-xs font-semibold mb-2 px-2 py-1 rounded ${
              modeColor === "text-purple-700" ? "bg-purple-50 border border-purple-200 text-purple-700" :
              modeColor === "text-indigo-700" ? "bg-indigo-50 border border-indigo-200 text-indigo-700" :
              "bg-green-50 border border-green-200 text-green-700"
            }`}>
              {modeLabel}
            </div>
            {lines.length === 0 ? (
              <p className="text-xs text-gray-400">无其他详细信息。</p>
            ) : (
              <div className="space-y-1">
                {lines.map((l, i) => (
                  <div key={i} className="flex gap-1.5 text-xs">
                    <span className="text-gray-400 shrink-0">{l.label}：</span>
                    <span className="text-gray-700 break-all">{l.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}