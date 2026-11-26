/**
 * OfficialPoolKanban
 * Admin-created official consolidation pools displayed as kanban columns.
 * Supports drag-and-drop of order tasks between columns (including the staging column).
 * Multi-entry user groups are draggable as a whole.
 * Individual entries within groups are also draggable.
 * Shift+click enables multi-select; selected items can be dragged together.
 */
import { useState, useEffect, useCallback } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { shippingPoolApi, tenantEntity, fetchTenantConfig } from "@/lib/tenantApi";
import { EMPTY_ADDRESS_FORM } from "@/components/common/AddressForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, Package, Scale, Plus, ChevronDown, ChevronRight,
  Edit2, MapPin, Layers, Calendar, ArrowUpDown,
  Inbox, GripVertical, Clock, Warehouse, ArrowRight, X, Loader2, CheckSquare, MessageSquare, User
} from "lucide-react";
import JoinOfficialPoolModal from "@/components/shippingpool/JoinOfficialPoolModal";
import OrderDetailDrawer from "@/components/orders/OrderDetailDrawer";
import { toast } from "sonner";
import OfficialPoolOrderDetailModal from "@/components/shippingpool/OfficialPoolOrderDetailModal";
import CreateOfficialPoolModal from "@/components/shippingpool/CreateOfficialPoolModal";
import PrivacyAwareOrderInfo from "@/components/shippingpool/PrivacyAwareOrderInfo";

// 与后端 ShippingPoolStatus 枚举保持一致
const STATUS_COLORS = {
  open: "bg-blue-100 text-blue-700",
  pending: "bg-gray-100 text-gray-600",
  processing: "bg-amber-100 text-amber-700",
  awaiting_payment: "bg-orange-100 text-orange-700",
  awaiting_confirmation: "bg-blue-100 text-blue-700",
  awaiting_payment_confirmation: "bg-blue-100 text-blue-700",
  paid: "bg-cyan-100 text-cyan-700",
  ready_to_ship: "bg-teal-100 text-teal-700",
  transited: "bg-indigo-100 text-indigo-700",
  transit_forwarded: "bg-violet-100 text-violet-700",
  transit_arrived: "bg-sky-100 text-sky-700",
  shipped: "bg-green-100 text-green-700",
  delivered: "bg-emerald-100 text-emerald-700",
  archived: "bg-gray-100 text-gray-500",
  completed: "bg-emerald-100 text-emerald-700",
};

const STATUS_LABELS = {
  open: "招募中",
  pending: "待处理",
  processing: "处理中",
  awaiting_payment: "待付款",
  awaiting_confirmation: "待确认",
  awaiting_payment_confirmation: "待确认付款",
  paid: "已付款",
  ready_to_ship: "待发货",
  transited: "已向中转地发货",
  transit_forwarded: "中转地已发货",
  transit_arrived: "中转地已收货",
  shipped: "已发货",
  delivered: "已收货",
  archived: "已存档",
  completed: "已完成",
};

const ORDER_STATUS_LABELS = {
  pending_confirmation: "待确认", payment_pending: "待付款", paid: "已付款",
  pending_purchase: "待购买", purchased: "已购买", in_warehouse: "已入库",
  notified_shipment: "待发货",
};

// draggableId formats:
// pool entry (single):  "pool-{poolId}-order-{orderId}"
// pool group (multi):   "pool-{poolId}-group-{userEmail}"
// staging:              "staging-{orderId}"

// ─── Draggable Task Card ──────────────────────────────────────────────────────
function DraggableTaskCard({ draggableId, index, entry, order, group, pool, currentUser, isAdmin, shippingAddons, savedAddresses, onRefresh, selected, onSelect, userPrefsMap }) {
  const [editOpen, setEditOpen] = useState(false);
  const isSelf = group?.user_email === currentUser?.email;
  const canEdit = isSelf || isAdmin;
  // Only allow drag if admin or self (regardless of privacy setting)
  const canDrag = canEdit;
  
  // Check if order info should be visible to current user
  const orderOwnerEmail = group?.user_email || order?.user_email;
  const ownerPref = userPrefsMap?.[orderOwnerEmail];
  const isOrderInfoPublic = ownerPref?.order_info_public === true;
  const canSeeOrderInfo = isAdmin || isSelf || isOrderInfoPublic;

  const handleClick = (e) => {
    if (e.shiftKey) { e.preventDefault(); onSelect?.(draggableId); return; }
    canEdit && !editOpen && setEditOpen(true);
  };

  return (
    <>
      <Draggable draggableId={draggableId} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`border rounded-xl px-3 py-2.5 bg-white transition-all relative
              ${snapshot.isDragging ? "shadow-lg border-blue-300 rotate-1" : ""}
              ${selected ? "border-blue-400 bg-blue-50 ring-2 ring-blue-300" : canEdit ? "border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-sm" : "border-gray-200"}
              ${canDrag ? "cursor-pointer" : "cursor-default"}`}
            onClick={handleClick}
          >
            {selected && <CheckSquare className="absolute top-2 right-2 w-3.5 h-3.5 text-blue-500" />}
            <div className="flex items-start gap-2">
              {canDrag && (
                <div
                  {...provided.dragHandleProps}
                  className="flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
                  onClick={e => e.stopPropagation()}
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
              )}
              <Package className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                {/* User name inside card */}
                <div className="text-xs text-gray-500 font-medium mb-0.5 flex items-center gap-1">
                  <User className="w-2.5 h-2.5 text-gray-400" />
                  {group?.user_name || order?.user_name || group?.user_email?.split('@')[0] || order?.user_email?.split('@')[0] || '未知用户'}
                </div>
                <PrivacyAwareOrderInfo order={order} entry={entry} canSeeOrderInfo={canSeeOrderInfo} />
              </div>
              {canEdit && !selected && <Edit2 className="w-3 h-3 text-gray-300 hover:text-gray-500 flex-shrink-0 mt-0.5" />}
            </div>
          </div>
        )}
      </Draggable>
      {editOpen && group && pool && (
        <OfficialPoolOrderDetailModal
          pool={pool}
          group={group}
          orderEntry={entry}
          order={order}
          shippingAddons={shippingAddons}
          savedAddresses={savedAddresses}
          onClose={() => setEditOpen(false)}
          onSuccess={() => { setEditOpen(false); onRefresh?.(); }}
        />
      )}
    </>
  );
}

// ─── Draggable Staging Task Card ──────────────────────────────────────────────
function DraggableStagingCard({ draggableId, index, order, officialPools, isAdmin, currentUser, onRemove, selected, onSelect }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const pre = order?.pre_shipment;
  const targetPoolId = pre?.target_pool_id;
  // Only show target pool if it's a real pool (not a pending pool used as staging)
  const realTargetPool = officialPools.find(p => p.id === targetPoolId && !p.is_pending_pool);
  const targetLabel = realTargetPool ? (realTargetPool.title || realTargetPool.pool_code) : null;
  const isInWarehouse = order?.order_status === "in_warehouse";

  const handleClick = (e) => {
    if (e.shiftKey) { e.preventDefault(); onSelect?.(draggableId); return; }
    !detailOpen && setDetailOpen(true);
  };

  return (
    <>
      <Draggable draggableId={draggableId} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`border rounded-xl px-3 py-2.5 bg-white transition-all relative
              ${snapshot.isDragging ? "shadow-lg border-blue-300 rotate-1" : ""}
              ${selected ? "border-blue-400 bg-blue-50 ring-2 ring-blue-300" : isInWarehouse ? "border-green-200 hover:border-green-300 hover:bg-green-50/40" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}
              cursor-pointer`}
            onClick={handleClick}
          >
            {selected && <CheckSquare className="absolute top-2 right-8 w-3.5 h-3.5 text-blue-500" />}
            <div className="flex items-start gap-2">
              <div
                {...provided.dragHandleProps}
                className="flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
                onClick={e => e.stopPropagation()}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </div>
              <Package className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isInWarehouse ? "text-green-400" : "text-gray-300"}`} />
              <div className="flex-1 min-w-0">
              {/* User name inside card */}
              <div className="text-xs text-gray-500 font-medium mb-0.5 flex items-center gap-1">
                <User className="w-2.5 h-2.5 text-gray-400" />
                {order?.user_name || order?.user_email?.split('@')[0] || '未知用户'}
              </div>
              <p className="text-xs font-medium text-gray-800 truncate">{order?.product_name || draggableId.slice(-8)}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {order?.order_number && <span className="text-xs text-gray-400">{order.order_number}</span>}
                  <Badge className={`text-xs px-1 py-0 ${isInWarehouse ? "bg-green-100 text-green-700" : "bg-amber-50 text-amber-600"}`}>
                    {ORDER_STATUS_LABELS[order?.order_status] || order?.order_status}
                  </Badge>
                </div>
                {targetLabel && (
                  <div className="flex items-center gap-1 mt-1">
                    <ArrowRight className="w-3 h-3 text-blue-300 flex-shrink-0" />
                    <span className="text-xs text-blue-500 truncate font-medium">→ {targetLabel}</span>
                  </div>
                )}
              </div>
              {isAdmin && (
                <button
                  onClick={e => { e.stopPropagation(); onRemove?.(order); }}
                  className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                  title="从暂存区移除"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}
      </Draggable>
      {detailOpen && order && currentUser && (
        <OrderDetailDrawer
          order={order}
          currentUser={currentUser}
          onClose={() => setDetailOpen(false)}
          onAction={() => {}}
          onUpdated={() => setDetailOpen(false)}
        />
      )}
    </>
  );
}

// ─── Draggable Group Card ─────────────────────────────────────────────────────
function DraggableGroupCard({ draggableId, index, group, allOrders, pool, currentUser, isAdmin, shippingAddons, savedAddresses, onRefresh, selected, onSelect, selectedIds, onSelectEntry, autoExpandOnDrop, userPrefsMap }) {
  const [expanded, setExpanded] = useState(false);
  const [editOrderEntry, setEditOrderEntry] = useState(null);

  const orderEntries = group.order_entries || [];
  const isSelf = group.user_email === currentUser?.email;
  const canEdit = isSelf || isAdmin;
  const canDrag = canEdit;
  
  // Check privacy setting for group owner
  const ownerPref = userPrefsMap?.[group.user_email];
  const isOrderInfoPublic = ownerPref?.order_info_public === true;
  const canSeeOrderInfo = isAdmin || isSelf || isOrderInfoPublic;
  
  const resolvedOrders = orderEntries.map(entry => ({
    entry,
    order: allOrders.find(o => String(o.id) === String(entry.order_id)) || null,
  }));
  const totalWeight = resolvedOrders.reduce((s, { order }) => s + (order?.weight_g || 0), 0);
  
  // 官方池的最终收货地址直接取订单预出货快照（不再维护任务组地址）
  const groupFinalAddress = (() => {
    for (const { order } of resolvedOrders) {
      const addr = order?.pre_shipment?.address;
      if (addr && (addr.recipient_name || addr.addr1 || addr.phone)) return addr;
    }
    return group.group_final_address || null;
  })();
  
  // Count group-level note (not individual entries)
  const hasGroupNote = !!group.note;
  
  // Auto-expand when a task is dropped to this group
  useEffect(() => {
    if (autoExpandOnDrop) {
      setExpanded(true);
    }
  }, [autoExpandOnDrop]);

  const handleHeaderClick = (e) => {
    if (e.shiftKey) { e.preventDefault(); onSelect?.(draggableId); return; }
    // Only toggle expand/collapse when clicking the chevron (handled separately)
  };

  const handleToggleExpand = (e) => {
    e.stopPropagation();
    setExpanded(v => !v);
  };

  const handleCardClick = (e) => {
    if (e.shiftKey) { e.preventDefault(); onSelect?.(draggableId); return; }
    setExpanded(v => !v);
  };

  return (
    <>
      <Draggable draggableId={draggableId} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`border rounded-xl overflow-hidden bg-white transition-colors
              ${snapshot.isDragging ? "shadow-lg opacity-90" : ""}
              ${selected ? "border-blue-400 ring-2 ring-blue-300" : "border-gray-200 hover:border-blue-200"}`}
          >
            <div
              className={`flex items-center justify-between px-3 py-2.5 border-b cursor-pointer transition-colors
                ${selected ? "bg-blue-100/70 border-blue-200" : "bg-blue-50/60 border-blue-100 hover:bg-blue-100/60"}`}
              onClick={handleCardClick}
            >
              <div className="flex items-center gap-2 min-w-0">
                {canDrag && (
                  <div
                    {...provided.dragHandleProps}
                    className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
                    onClick={e => e.stopPropagation()}
                  >
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>
                )}
                <button
                  onClick={handleToggleExpand}
                  className="p-0.5 rounded hover:bg-blue-100 text-blue-400 hover:text-blue-600 transition-colors"
                >
                  {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                <Users className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-800 truncate">{group.group_label || group.user_name || group.user_email}</span>
                <Badge variant="outline" className="text-xs flex-shrink-0">{orderEntries.length}件</Badge>
                {selected && <CheckSquare className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {hasGroupNote && (
                  <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200 px-1 py-0">
                    <MessageSquare className="w-2.5 h-2.5 mr-0.5" />
                    备注
                  </Badge>
                )}
                <span className="text-xs text-gray-400">{totalWeight}g</span>
              </div>
            </div>
            {groupFinalAddress?.recipient_name && (
              <div className="px-3 py-1.5 flex items-center gap-1.5 text-xs text-gray-400 border-b border-gray-100">
                <MapPin className="w-3 h-3" />
                <span className="truncate">{groupFinalAddress.recipient_name}{groupFinalAddress.state ? ` · ${groupFinalAddress.state}` : ""}</span>
              </div>
            )}
            {expanded && (
              <div className="divide-y divide-gray-50">
                {resolvedOrders.map(({ entry, order }, entryIdx) => {
                  const entryDraggableId = `pool-${pool.id}-order-${entry.order_id}`;
                  const isEntrySelected = selectedIds?.has(entryDraggableId);
                  return (
                    <Draggable key={entry.order_id} draggableId={entryDraggableId} index={entryIdx}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors
                            ${snapshot.isDragging ? "bg-blue-50 ring-2 ring-blue-300 rounded-lg" : isEntrySelected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                          onClick={(e) => {
                            if (e.shiftKey) { e.preventDefault(); onSelectEntry?.(entryDraggableId); return; }
                            canEdit && setEditOrderEntry({ entry, order });
                          }}
                        >
                          {canDrag && (
                            <div
                              {...provided.dragHandleProps}
                              className="flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
                              onClick={e => e.stopPropagation()}
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2">
                              <Package className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                              <PrivacyAwareOrderInfo order={order} entry={entry} canSeeOrderInfo={canSeeOrderInfo} />
                            </div>
                          </div>
                          {isEntrySelected ? <CheckSquare className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" /> : canEdit && <Edit2 className="w-3 h-3 text-gray-300 hover:text-gray-500 flex-shrink-0 mt-0.5" />}
                        </div>
                      )}
                    </Draggable>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Draggable>
      {editOrderEntry && (
        <OfficialPoolOrderDetailModal pool={pool} group={group} orderEntry={editOrderEntry.entry} order={editOrderEntry.order}
          shippingAddons={shippingAddons} savedAddresses={savedAddresses}
          onClose={() => setEditOrderEntry(null)} onSuccess={() => { setEditOrderEntry(null); onRefresh?.(); }} />
      )}
    </>
  );
}

// ─── Add-to-Staging Modal ─────────────────────────────────────────────────────
function AddToStagingModal({ allOrders, availableOrders = null, officialPools, currentUser, stagedOrderIds, onClose, onSuccess }) {
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [selectedPoolId, setSelectedPoolId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Only show real (non-pending) pools as join targets
  const realOfficialPools = officialPools.filter(p => !p.is_pending_pool);

  // 候选订单优先用后端返回的 available_orders（已入库、未挂池、不在暂存区）；
  // 后端没给时退回前端过滤，保证弹窗不为空。
  const candidateOrders = availableOrders != null ? availableOrders : allOrders;
  const eligibleOrders = candidateOrders.filter(o => {
    if (["shipped", "delivered", "cancelled"].includes(o.order_status)) return false;
    const alreadyInPool = officialPools.some(p => !p.is_pending_pool && (p.order_ids || []).some(id => String(id) === String(o.id)));
    if (alreadyInPool) return false;
    if (stagedOrderIds.has(o.id)) return false;
    return true;
  });

  const handleSubmit = async () => {
    if (selectedOrderIds.length === 0) return;
    setSubmitting(true);
    try {
      await shippingPoolApi.officialStage({ order_ids: selectedOrderIds.map(Number) });
    } catch (err) {
      toast.error(err?.response?.data?.message || '加入暂存区失败，请重试');
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    onSuccess?.();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">添加任务到待发货暂存区</h2>
            <p className="text-xs text-gray-400 mt-0.5">选择要纳入官方拼邮计划的订单</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">预计加入的拼邮需求（可选，仅作参考）</p>
            <div className="space-y-1.5">
              <label className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${!selectedPoolId ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}>
                <input type="radio" checked={!selectedPoolId} onChange={() => setSelectedPoolId("")} className="accent-blue-600" />
                <span className="text-sm text-gray-600">未指定（入库后进入暂存区，由管理员拖入拼邮池）</span>
              </label>
              {realOfficialPools.map(pool => (
                <label key={pool.id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${selectedPoolId === pool.id ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}>
                  <input type="radio" checked={selectedPoolId === pool.id} onChange={() => setSelectedPoolId(pool.id)} className="accent-blue-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{pool.title || pool.pool_code}</p>
                    <p className="text-xs text-gray-400">{pool.pool_code} · {pool.order_ids?.length || 0}单 已参团</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">选择订单（{eligibleOrders.length} 个可选）</p>
            {eligibleOrders.length === 0 ? (
              <div className="text-center py-8 text-gray-300 text-xs">
                <Package className="w-6 h-6 mx-auto mb-1 opacity-40" />暂无可添加的订单
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {eligibleOrders.map(o => (
                  <label key={o.id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${selectedOrderIds.includes(o.id) ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}>
                    <input type="checkbox" checked={selectedOrderIds.includes(o.id)}
                      onChange={() => setSelectedOrderIds(prev => prev.includes(o.id) ? prev.filter(x => x !== o.id) : [...prev, o.id])}
                      className="accent-blue-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{o.product_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {o.order_number && <span className="text-xs text-gray-400">{o.order_number}</span>}
                        <Badge className={`text-xs px-1 py-0 ${o.order_status === "in_warehouse" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {ORDER_STATUS_LABELS[o.order_status] || o.order_status}
                        </Badge>
                        {o.weight_g > 0 && <span className="text-xs text-gray-400">{o.weight_g}g</span>}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700"
            disabled={submitting || selectedOrderIds.length === 0} onClick={handleSubmit}>
            {submitting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />处理中...</> : `添加 ${selectedOrderIds.length} 个任务`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Pool Column (Droppable) ──────────────────────────────────────────────────
function buildGroupsFromOrders(pool, allOrders) {
  const ids = (pool.order_ids || []).map(String);
  const orders = ids
    .map(id => (allOrders || []).find(o => String(o.id) === id))
    .filter(Boolean);
  const groups = new Map();
  orders.forEach(o => {
    const email = o.user_email || "";
    if (!groups.has(email)) {
      groups.set(email, { user_email: email, user_name: o.user_name, order_entries: [] });
    }
    groups.get(email).order_entries.push({ order_id: o.id, user_email: email });
  });
  return [...groups.values()];
}

function PoolColumn({ pool, allOrders, currentUser, isAdmin, shippingAddons, savedAddresses, onPoolClick, onRefresh, columnDragHandleProps, selectedIds, onSelectItem, lastDropTarget, userPrefsMap }) {
  const [joinOpen, setJoinOpen] = useState(false);

  const perUserGroups = (pool.per_user_groups && pool.per_user_groups.length > 0)
    ? pool.per_user_groups
    : buildGroupsFromOrders(pool, allOrders);
  const totalWeight = pool.total_weight_g || 0;
  const minWeight = pool.consolidation_min_weight_g || 0;
  const progressPct = minWeight > 0 ? Math.min(100, (totalWeight / minWeight) * 100) : 0;
  const isReady = minWeight > 0 && totalWeight >= minWeight;

  const myGroup = perUserGroups.find(g => g.user_email === currentUser?.email);
  const myOrderIds = new Set((myGroup?.order_entries || []).map(e => e.order_id));
  // Show button if current user has any in_warehouse orders (modal will filter out ones already in pool)
  const hasInWarehouse = allOrders.some(o => o.order_status === "in_warehouse");

  // Enhance per_user_groups with user_name from orders/users if missing
  const enhancedGroups = (perUserGroups || []).map(group => {
    if (group.user_name) return group;
    // Try to get user_name from first order in the group
    const firstOrderId = (group.order_entries || [])[0]?.order_id;
    const firstOrder = firstOrderId ? allOrders.find(o => o.id === firstOrderId) : null;
    return {
      ...group,
      user_name: group.user_name || firstOrder?.user_name || group.user_email?.split('@')[0] || '未知用户',
    };
  });

  // Build draggable items list (groups with 1+ entries are all draggable; groups with 2+ also expose individual entries when expanded)
  const draggableItems = [];
  enhancedGroups.forEach(group => {
    const entries = group.order_entries || [];
    if (entries.length >= 1) {
      draggableItems.push({ type: "group", group });
    } else if (entries.length === 1) {
      draggableItems.push({ type: "entry", group, entry: entries[0] });
    }
  });

  return (
    <div className="flex-shrink-0 w-72 flex flex-col">
      <div
        className="flex items-center justify-between px-3 py-3 bg-white border border-gray-200 rounded-xl cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors mb-2"
        onClick={() => onPoolClick?.(pool)}
        {...(columnDragHandleProps || {})}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800 truncate">{pool.title || pool.pool_code}</span>
            {pool.pool_code && pool.title && <span className="text-xs font-mono text-gray-400">{pool.pool_code}</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-1.5 text-xs text-gray-400">
            <Badge className={`text-xs ${STATUS_COLORS[pool.status] || "bg-gray-100 text-gray-600"}`}>
              {STATUS_LABELS[pool.status] || pool.status}
            </Badge>
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{perUserGroups.length}人</span>
            <span className="flex items-center gap-1"><Scale className="w-3 h-3" />{totalWeight}g</span>
            {pool.consolidation_deadline && (
              <span className="flex items-center gap-1 text-orange-500"><Calendar className="w-3 h-3" />截止 {pool.consolidation_deadline}</span>
            )}
          </div>
        </div>
      </div>

      {minWeight > 0 && (
        <div className="px-1 mb-2">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-400">凑单进度</span>
            <span className={isReady ? "text-green-600 font-medium" : "text-gray-500"}>{totalWeight}g / {minWeight}g</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${isReady ? "bg-green-500" : "bg-blue-400"}`} style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      <Droppable droppableId={`pool-${pool.id}`}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 space-y-2 min-h-[60px] rounded-xl transition-colors p-1 ${snapshot.isDraggingOver ? "bg-blue-50 ring-2 ring-blue-200" : ""}`}
          >
            {draggableItems.map(({ type, group, entry }, idx) => {
              if (type === "group") {
                const groupDraggableId = `pool-${pool.id}-group-${group.user_email}`;
                const shouldExpand = lastDropTarget?.userEmail === group.user_email;
                return (
                  <DraggableGroupCard
                    key={group.user_email}
                    draggableId={groupDraggableId}
                    index={idx}
                    group={group}
                    allOrders={allOrders}
                    pool={pool}
                    currentUser={currentUser}
                    isAdmin={isAdmin}
                    shippingAddons={shippingAddons}
                    savedAddresses={savedAddresses}
                    onRefresh={onRefresh}
                    selected={selectedIds?.has(groupDraggableId)}
                    onSelect={onSelectItem}
                    selectedIds={selectedIds}
                    onSelectEntry={onSelectItem}
                    autoExpandOnDrop={shouldExpand}
                    userPrefsMap={userPrefsMap}
                  />
                );
              } else {
                const entryDraggableId = `pool-${pool.id}-order-${entry.order_id}`;
                const order = allOrders.find(o => o.id === entry.order_id) || null;
                return (
                  <DraggableTaskCard
                    key={entry.order_id}
                    draggableId={entryDraggableId}
                    index={idx}
                    entry={entry}
                    order={order}
                    group={group}
                    pool={pool}
                    currentUser={currentUser}
                    isAdmin={isAdmin}
                    shippingAddons={shippingAddons}
                    savedAddresses={savedAddresses}
                    onRefresh={onRefresh}
                    selected={selectedIds?.has(entryDraggableId)}
                    onSelect={onSelectItem}
                    userPrefsMap={userPrefsMap}
                  />
                );
              }
            })}

            {draggableItems.length === 0 && !snapshot.isDraggingOver && (
              <div className="text-center py-6 text-gray-300 text-xs">
                <Layers className="w-6 h-6 mx-auto mb-1 opacity-30" />暂无参与者
              </div>
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {/* Show join button for non-admin users, or admin users who have in_warehouse orders */}
      {(!isAdmin || hasInWarehouse) && (
        <button
          onClick={() => setJoinOpen(true)}
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-gray-200 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />加入此拼邮
        </button>
      )}

      {joinOpen && (
        <JoinOfficialPoolModal
          pool={pool}
          currentUser={currentUser}
          onClose={() => setJoinOpen(false)}
          onSuccess={() => { setJoinOpen(false); onRefresh?.(); }}
        />
      )}
    </div>
  );
}

// ─── Staging Column (Droppable) ───────────────────────────────────────────────
// The staging column acts as the "待拼邮" (pending pool) area — it collects all
// pre-shipment orders awaiting admin assignment to an official pool.
// Orders are grouped by intended shipping method for easy batch assignment.
function StagingColumn({ allOrders, stagingOrders = null, availableOrders = null, officialPools, pendingPools, currentUser, isAdmin, onRefresh, selectedIds, onSelectItem, shippingMethods }) {
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Collect order IDs already in real (non-pending) official pools
  const realPoolOrderIds = new Set(officialPools.filter(p => !p.is_pending_pool).flatMap(p => p.order_ids || []));
  // Orders in pending pools are also shown in staging (they're awaiting admin assignment)
  const pendingPoolOrderIds = new Set(pendingPools.flatMap(p => p.order_ids || []));

  // 暂存区订单由后端给（入库 + 已填官方拼邮 + 未入池），不再前端猜状态
  const stagedOrders = stagingOrders != null ? stagingOrders : allOrders.filter(o => {
    // Skip if already in a real official pool
    if (realPoolOrderIds.has(o.id)) return false;
    const pre = o.pre_shipment;
    // Include if in a pending pool (auto-routed by shipping method)
    if (pendingPoolOrderIds.has(o.id)) return true;
    // Include if has pre_shipment with official_pool type and not yet assigned
    if (pre && pre.consType === "official_pool") {
      if (pre.pool_created === true && pre.target_pool_id && !pendingPoolOrderIds.has(o.id)) return false;
      return true;
    }
    return false;
  });

  const stagedOrderIds = new Set(stagedOrders.map(o => o.id));

  // Group staged orders by shipping method (core pending-pool feature)
  const groupByShippingMethod = (orders) => {
    const groups = new Map(); // methodCode -> { label, orders }
    orders.forEach(o => {
      const method = o.pre_shipment?.shipping_method || "";
      if (!groups.has(method)) {
        const methodObj = shippingMethods?.find(m => m.code === method || m.name === method);
        groups.set(method, {
          methodCode: method,
          label: methodObj?.name || method || "未指定运输方式",
          orders: [],
        });
      }
      groups.get(method).orders.push(o);
    });
    // Sort: non-empty methods first, then default
    return [...groups.values()].sort((a, b) => {
      if (!a.methodCode && b.methodCode) return 1;
      if (a.methodCode && !b.methodCode) return -1;
      return a.label.localeCompare(b.label);
    });
  };

  // Within each method group, split by warehouse status
  const methodGroups = groupByShippingMethod(stagedOrders);

  const handleRemove = async (order) => {
    try {
      await shippingPoolApi.officialUnstage({ order_ids: [Number(order.id)] });
    } catch (err) {
      toast.error(err?.response?.data?.message || '移出暂存区失败，请重试');
      return;
    }
    onRefresh?.();
  };

  // Flat index counter for Draggable indices (must be sequential across groups)
  let flatIdx = 0;

  return (
    <div className="flex-shrink-0 w-72 flex flex-col">
      <div className="flex items-center justify-between px-3 py-3 bg-white border border-dashed border-amber-300 rounded-xl mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-700">待拼邮暂存区</span>
            <Badge className="text-xs bg-amber-100 text-amber-700">{stagedOrders.length}</Badge>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 ml-6">预出货订单按运输方式分组，拖入右侧拼邮列完成分配</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setAddModalOpen(true)} className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors" title="手动添加任务">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <Droppable droppableId="staging">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 min-h-[60px] rounded-xl transition-colors p-1 ${snapshot.isDraggingOver ? "bg-amber-50 ring-2 ring-amber-200" : ""}`}
          >
            <div className="space-y-3">
              {methodGroups.map(({ methodCode, label, orders: groupOrders }) => {
                const inWarehouse = groupOrders.filter(o => o.order_status === "in_warehouse");
                const notInWarehouse = groupOrders.filter(o => o.order_status !== "in_warehouse");
                return (
                  <div key={methodCode || "__none__"}>
                    {/* Method group header */}
                    <div className="flex items-center gap-1.5 px-2 py-1 mb-1">
                      <Package className="w-3 h-3 text-amber-500 flex-shrink-0" />
                      <span className="text-xs font-semibold text-amber-700 truncate flex-1">{label}</span>
                      <Badge className="text-xs bg-amber-50 text-amber-600 flex-shrink-0">{groupOrders.length}</Badge>
                    </div>

                    {/* In-warehouse sub-group */}
                    {inWarehouse.length > 0 && (
                      <div className="ml-2 mb-1">
                        <div className="flex items-center gap-1 px-1 mb-1">
                          <Warehouse className="w-2.5 h-2.5 text-green-500" />
                          <span className="text-xs text-green-600">已入库 {inWarehouse.length}</span>
                        </div>
                        <div className="space-y-1.5">
                          {inWarehouse.map(order => {
                            const idx = flatIdx++;
                            return (
                              <DraggableStagingCard
                                key={order.id}
                                draggableId={`staging-${order.id}`}
                                index={idx}
                                order={order}
                                officialPools={officialPools}
                                isAdmin={isAdmin}
                                currentUser={currentUser}
                                onRemove={handleRemove}
                                selected={selectedIds?.has(`staging-${order.id}`)}
                                onSelect={onSelectItem}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Not-in-warehouse sub-group */}
                    {notInWarehouse.length > 0 && (
                      <div className="ml-2">
                        <div className="flex items-center gap-1 px-1 mb-1">
                          <Clock className="w-2.5 h-2.5 text-gray-400" />
                          <span className="text-xs text-gray-400">未入库 {notInWarehouse.length}</span>
                        </div>
                        <div className="space-y-1.5">
                          {notInWarehouse.map(order => {
                            const idx = flatIdx++;
                            return (
                              <DraggableStagingCard
                                key={order.id}
                                draggableId={`staging-${order.id}`}
                                index={idx}
                                order={order}
                                officialPools={officialPools}
                                isAdmin={isAdmin}
                                currentUser={currentUser}
                                onRemove={handleRemove}
                                selected={selectedIds?.has(`staging-${order.id}`)}
                                onSelect={onSelectItem}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {stagedOrders.length === 0 && !snapshot.isDraggingOver && (
                <div className="text-center py-6 text-gray-300 text-xs">
                  <Inbox className="w-6 h-6 mx-auto mb-1 opacity-30" />暂无待拼邮任务
                </div>
              )}
              {provided.placeholder}
            </div>
          </div>
        )}
      </Droppable>

      {isAdmin && (
        <button
          onClick={() => setAddModalOpen(true)}
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-amber-200 text-xs text-amber-500 hover:border-amber-400 hover:bg-amber-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />手动添加待拼邮任务
        </button>
      )}

      {addModalOpen && (
        <AddToStagingModal
          allOrders={allOrders}
          availableOrders={availableOrders}
          officialPools={officialPools}
          currentUser={currentUser}
          stagedOrderIds={stagedOrderIds}
          onClose={() => setAddModalOpen(false)}
          onSuccess={() => { setAddModalOpen(false); onRefresh?.(); }}
        />
      )}
    </div>
  );
}

// ─── Main Kanban ──────────────────────────────────────────────────────────────
export default function OfficialPoolKanban({ pools, allOrders, stagingOrders = null, availableOrders = null, currentUser, isAdmin, showPoolSorter, setShowPoolSorter, onPoolClick, onRefresh, onLocalUpdate, shippingMethods }) {
  const [shippingAddons, setShippingAddons] = useState([]);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [userPrefsMap, setUserPrefsMap] = useState({});
  const [createPoolOpen, setCreatePoolOpen] = useState(false);
  // Separate pending pools (staging) from regular official pool columns
  const pendingPools = pools.filter(p => p.is_pending_pool);
  // Regular (non-pending) pools only for kanban columns
  const regularPools = pools.filter(p => !p.is_pending_pool);
  const [columnOrder, setColumnOrder] = useState(() => regularPools.map(p => p.id));
  // Multi-select: Set of draggableIds
  const [selectedIds, setSelectedIds] = useState(new Set());
  // Track last drop target for auto-expand
  const [lastDropTarget, setLastDropTarget] = useState(null);

  // Keep columnOrder in sync when regular pools change from outside
  useEffect(() => {
    setColumnOrder(prev => {
      const poolIds = regularPools.map(p => p.id);
      const next = prev.filter(id => poolIds.includes(id));
      poolIds.forEach(id => { if (!next.includes(id)) next.push(id); });
      return next;
    });
  }, [regularPools.map(p => p.id).join(",")]);

  useEffect(() => {
    if (!currentUser) return;
    Promise.all([
      fetchTenantConfig(),
      tenantEntity.list('UserPreference', {}).catch(() => []),
    ]).then(([cfg, prefs]) => {
      setShippingAddons((cfg.addons || [])
        .filter(a => a.addon_type === "shipping" && a.is_active !== false)
        .map(a => ({ ...a, name: a.service_name || a.name || "", fee: a.fee ?? a.fee_min ?? 0 })));
      // Build a map of user_email -> preference for quick lookup
      const prefsMap = {};
      prefs.forEach(p => {
        prefsMap[p.user_email] = p;
      });
      setUserPrefsMap(prefsMap);
      const addrs = (prefs.find(p => p.user_email === currentUser.email)?.saved_addresses || []).map(a => ({ ...EMPTY_ADDRESS_FORM, ...a }));
      setSavedAddresses(addrs);
    }).catch(() => {});
  }, [currentUser?.email]);

  // Clear selection on click outside (non-shift)
  useEffect(() => {
    const handler = (e) => { if (!e.shiftKey) setSelectedIds(new Set()); };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  // Clear lastDropTarget after 2 seconds
  useEffect(() => {
    if (lastDropTarget) {
      const timer = setTimeout(() => setLastDropTarget(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [lastDropTarget]);

  const handleSelectItem = useCallback((draggableId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(draggableId)) next.delete(draggableId);
      else next.add(draggableId);
      return next;
    });
  }, []);

  const orderedPools = columnOrder.map(id => regularPools.find(p => p.id === id)).filter(Boolean);

  // Parse a draggableId into { type, orderId, srcPoolId, userEmail }
  const parseDraggableId = (draggableId) => {
    if (draggableId.startsWith("staging-")) {
      return { type: "staging", orderId: draggableId.slice("staging-".length) };
    }
    const orderMatch = draggableId.match(/^pool-(.+)-order-(.+)$/);
    if (orderMatch) return { type: "pool-order", srcPoolId: orderMatch[1], orderId: orderMatch[2] };
    const groupMatch = draggableId.match(/^pool-(.+)-group-(.+)$/);
    if (groupMatch) return { type: "pool-group", srcPoolId: groupMatch[1], userEmail: groupMatch[2] };
    return null;
  };

  // 拖拽时订单可能来自池内、暂存区或可选列表，统一按 id 查找
  const findOrderById = (id) =>
    (allOrders || []).find(o => String(o.id) === String(id)) ||
    (stagingOrders || []).find(o => String(o.id) === String(id)) ||
    (availableOrders || []).find(o => String(o.id) === String(id)) ||
    null;
  // ─── Drag end handler ───────────────────────────────────────────────────────
  const handleDragEnd = async (result) => {
    const { source, destination, draggableId, type } = result;
    if (!destination) return;

    // ── Column reorder (admin only) ──
    if (type === "COLUMN") {
      if (source.index === destination.index) return;
      setColumnOrder(prev => {
        const next = [...prev];
        const [moved] = next.splice(source.index, 1);
        next.splice(destination.index, 0, moved);
        return next;
      });
      return;
    }

    if (source.droppableId === destination.droppableId) return;

    const dstId = destination.droppableId;
    // Only route to real (non-pending) pools; 拖回暂存区 = 从来源池移出，订单状态回退后会自动出现在暂存区
    const destPool = dstId.startsWith("pool-") ? regularPools.find(p => String(p.id) === dstId.slice("pool-".length)) : null;

    // Collect all draggableIds to move
    const idsToMove = selectedIds.has(draggableId) ? [...selectedIds] : [draggableId];

    // Expand group draggableIds into individual order records
    // Returns array of { orderId, srcPool, originalEntry }
    const collectOrders = () => {
      const items = [];
      for (const did of idsToMove) {
        const parsed = parseDraggableId(did);
        if (!parsed) continue;
        if (parsed.type === "staging") {
          // srcPool is null for staging items (pending pool cleanup handled separately in order update)
          items.push({ orderId: parsed.orderId, srcPool: null, originalEntry: null });
        } else if (parsed.type === "pool-order") {
          const srcPool = pools.find(p => String(p.id) === String(parsed.srcPoolId));
          if (!srcPool) continue;
          // Skip if same pool
          if (destPool && String(parsed.srcPoolId) === String(destPool.id)) continue;
          const entry = srcPool.per_user_groups?.flatMap(g => g.order_entries || [])
            .find(e => String(e.order_id) === String(parsed.orderId)) || null;
          items.push({ orderId: parsed.orderId, srcPool, originalEntry: entry });
        } else if (parsed.type === "pool-group") {
          const srcPool = pools.find(p => String(p.id) === String(parsed.srcPoolId));
          if (!srcPool) continue;
          // Skip if same pool
          if (destPool && String(parsed.srcPoolId) === String(destPool.id)) continue;
          const group = srcPool.per_user_groups?.find(g => g.user_email === parsed.userEmail);
          if (!group) continue;
          for (const entry of (group.order_entries || [])) {
            items.push({ orderId: entry.order_id, srcPool, originalEntry: entry });
          }
        }
      }
      // Deduplicate by orderId
      const seen = new Set();
      return items.filter(item => { if (seen.has(item.orderId)) return false; seen.add(item.orderId); return true; });
    };

    const orderItems = collectOrders();
    if (orderItems.length === 0) return;

    // Group items by srcPool (null = from staging)
    const bySrcPool = new Map(); // srcPoolId|"staging" → [items]
    for (const item of orderItems) {
      const key = item.srcPool?.id || "staging";
      if (!bySrcPool.has(key)) bySrcPool.set(key, []);
      bySrcPool.get(key).push(item);
    }

    // Build mutable working copies of pool state to apply all changes at once
    // poolPatches: Map<poolId, { order_ids, total_weight_g, per_user_groups }>
    const poolPatches = new Map();
    const getPoolPatch = (pool) => {
      if (!pool) return null;
      if (!poolPatches.has(pool.id)) {
        poolPatches.set(pool.id, {
          order_ids: [...(pool.order_ids || [])],
          total_weight_g: pool.total_weight_g || 0,
          per_user_groups: JSON.parse(JSON.stringify(pool.per_user_groups || [])),
        });
      }
      return poolPatches.get(pool.id);
    };

    // Helper: add entry to destPool patch (merges into existing user group if present)
    const addEntryToDestPatch = (destPatch, order, entry) => {
      if (!destPatch) return;
      const newEntry = entry ? { ...entry } : {
        order_id: order.id, note: order.pre_shipment?.user_note || "", image_urls: [],
        selected_addon_ids: order.pre_shipment?.selected_addon_ids || [],
        selected_addons: order.pre_shipment?.selected_addons || [],
        use_group_address: true, override_final_address: null,
      };
      const existingGroupIdx = destPatch.per_user_groups.findIndex(g => g.user_email === order.user_email);
      if (existingGroupIdx >= 0) {
        const g = destPatch.per_user_groups[existingGroupIdx];
        if (!(g.order_entries || []).some(e => String(e.order_id) === String(order.id))) {
          g.order_entries = [...(g.order_entries || []), newEntry];
        }
      } else {
        destPatch.per_user_groups.push({
          user_email: order.user_email, user_name: order.user_name || order.user_email,
          group_label: order.user_name || order.user_email,
          note: "", image_urls: [], selected_addon_ids: [], selected_addons: [],
          group_final_address: null, order_entries: [newEntry],
        });
      }
      if (!destPatch.order_ids.some(id => String(id) === String(order.id))) {
        destPatch.order_ids.push(String(order.id));
        destPatch.total_weight_g += (order.weight_g || 0);
      }
    };

    // Apply all moves to patches
    const destPatch = destPool ? getPoolPatch(destPool) : null;

    for (const { orderId, srcPool, originalEntry } of orderItems) {
      const order = findOrderById(orderId);
      if (!order) continue;

      // Remove from srcPool patch
      if (srcPool) {
        const srcPatch = getPoolPatch(srcPool);
        srcPatch.order_ids = srcPatch.order_ids.filter(id => String(id) !== String(orderId));
        srcPatch.total_weight_g = Math.max(0, srcPatch.total_weight_g - (order.weight_g || 0));
        srcPatch.per_user_groups = srcPatch.per_user_groups
          .map(g => ({ ...g, order_entries: (g.order_entries || []).filter(e => String(e.order_id) !== String(orderId)) }))
          .filter(g => (g.order_entries || []).length > 0);
      }

      // Add to destPool patch
      if (destPool) {
        addEntryToDestPatch(destPatch, order, originalEntry);
      }
    }

    // OPTIMISTIC UI: Immediately update local state before backend calls
    if (onLocalUpdate) {
      for (const [poolId, patch] of poolPatches.entries()) {
        const originalPool = pools.find(p => p.id === poolId);
        if (originalPool) {
          onLocalUpdate({ ...originalPool, ...patch });
        }
      }
    }
    
    // Track drop target for auto-expand (if dropped to a user group)
    if (destPool && orderItems.length > 0) {
      const firstOrder = findOrderById(orderItems[0].orderId);
      if (firstOrder) {
        setLastDropTarget({ poolId: destPool.id, userEmail: firstOrder.user_email, timestamp: Date.now() });
      }
    }
    
    setSelectedIds(new Set());

    // 真正落库：放入目标池、从来源池移出
    const orderIdsToMove = orderItems.map(item => item.orderId);
    const sourcePoolIds = [...new Set(orderItems.filter(item => item.srcPool).map(item => item.srcPool.id))];
    try {
      // 先从来源池移出（订单回到入库态），再放入目标池——否则跨池拖拽会被「还未入库」拦住
      for (const srcPoolId of sourcePoolIds) {
        if (destPool && String(srcPoolId) === String(destPool.id)) continue;
        const idsFromPool = orderItems
          .filter(item => item.srcPool && String(item.srcPool.id) === String(srcPoolId))
          .map(item => item.orderId);
        if (idsFromPool.length === 0) continue;
        await shippingPoolApi.officialRemove({ pool_id: srcPoolId, order_ids: idsFromPool });
      }
      if (destPool) {
        await shippingPoolApi.officialMove({ pool_id: destPool.id, order_ids: orderIdsToMove });
      }
    } catch (err) {
      console.error('Move orders failed:', err);
      toast.error(err?.response?.data?.message || '移动订单失败，请刷新后重试');
    }
    onRefresh?.();

    // 订单状态 / consolidation_pool_id / 预出货快照由后端 officialMove、officialRemove 统一维护
  };

  // No empty-state early return — StagingColumn always renders as the left-most column

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="space-y-3">
          {isAdmin && showPoolSorter && (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600">
              <ArrowUpDown className="w-4 h-4 text-gray-400" />
              <span>拖拽任务卡片可在列之间移动；Shift+点击多选后可批量拖动；管理员可拖拽列头调整顺序</span>
              <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => setShowPoolSorter?.(false)}>关闭</Button>
            </div>
          )}
          
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700">
              <CheckSquare className="w-4 h-4" />
              <span>已选中 {selectedIds.size} 项，拖拽任意选中项可批量移动</span>
              <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs text-blue-500 hover:text-blue-700" onClick={() => setSelectedIds(new Set())}>取消选择</Button>
            </div>
          )}

          <div className="flex gap-4 overflow-x-auto pb-4">
            {/* Staging column — always fixed at the left, acts as 待拼邮 area */}
            <StagingColumn
              allOrders={allOrders}
              stagingOrders={stagingOrders}
              availableOrders={availableOrders}
              officialPools={pools}
              pendingPools={pendingPools}
              currentUser={currentUser}
              isAdmin={isAdmin}
              onRefresh={onRefresh}
              selectedIds={selectedIds}
              onSelectItem={handleSelectItem}
              shippingMethods={shippingMethods || []}
            />

            {/* Add section button */}
            {isAdmin && (
              <div className="flex-shrink-0 flex items-stretch group/addbtn">
                <button
                  onClick={() => setCreatePoolOpen(true)}
                  title="创建新官方拼邮需求"
                  className="flex flex-col items-center justify-center w-6 relative"
                >
                  <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-transparent group-hover/addbtn:bg-blue-400 transition-colors duration-200" />
                  <span
                    className="relative z-10 bg-white border border-transparent group-hover/addbtn:border-blue-400 group-hover/addbtn:text-blue-500 text-transparent transition-colors duration-200 rounded-full px-1.5 py-0.5 whitespace-nowrap select-none"
                    style={{ writingMode: "vertical-lr", fontSize: "10px", letterSpacing: "0.05em" }}
                  >
                    + 新增列
                  </span>
                </button>
              </div>
            )}

            {/* Pool columns — draggable by admins */}
            <Droppable droppableId="column-order" direction="horizontal" type="COLUMN">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="flex gap-4"
                >
                  {orderedPools.map((pool, idx) => (
                    isAdmin ? (
                      <Draggable key={pool.id} draggableId={`col-${pool.id}`} index={idx}>
                        {(colProvided, colSnapshot) => (
                          <div
                            ref={colProvided.innerRef}
                            {...colProvided.draggableProps}
                            className={colSnapshot.isDragging ? "opacity-80" : ""}
                          >
                            <PoolColumn
                              pool={pool}
                              allOrders={allOrders}
                              currentUser={currentUser}
                              isAdmin={isAdmin}
                              shippingAddons={shippingAddons}
                              savedAddresses={savedAddresses}
                              onPoolClick={onPoolClick}
                              onRefresh={onRefresh}
                              columnDragHandleProps={colProvided.dragHandleProps}
                              selectedIds={selectedIds}
                              onSelectItem={handleSelectItem}
                              lastDropTarget={lastDropTarget}
                              userPrefsMap={userPrefsMap}
                            />
                          </div>
                        )}
                      </Draggable>
                    ) : (
                      <PoolColumn
                        key={pool.id}
                        pool={pool}
                        allOrders={allOrders}
                        currentUser={currentUser}
                        isAdmin={isAdmin}
                        shippingAddons={shippingAddons}
                        savedAddresses={savedAddresses}
                        onPoolClick={onPoolClick}
                        onRefresh={onRefresh}
                        selectedIds={selectedIds}
                        onSelectItem={handleSelectItem}
                        lastDropTarget={lastDropTarget}
                        userPrefsMap={userPrefsMap}
                      />
                    )
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        </div>
      </DragDropContext>

      {createPoolOpen && (
        <CreateOfficialPoolModal
          onClose={() => setCreatePoolOpen(false)}
          onSuccess={() => { setCreatePoolOpen(false); onRefresh?.(); }}
        />
      )}


    </>
  );
}