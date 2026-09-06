/**
 * OrderDetailCard - Complete order card component for shipping pool
 * Replaces the entire renderOrder function logic
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, Truck, Tag, FileText, MapPin, Package, Edit2, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getCountry } from "@/lib/countries";
import { ImageWithViewer } from "@/components/common/ImageViewer";

export default function OrderDetailCard({
  order,
  pool,
  editingOrderData,
  setEditingOrderData,
  handleAdminOrderSave,
  savingOrder,
  canSeeDetail,
  isMyOrder,
  isRWSel,
  hasPendingRW,
  isAdmin,
  canEditPackage,
  poolStatus,
  tenantUserMap,
  setShowOrderActions,
  showOrderActions,
  loadOtherPools,
  openUserAction,
  userActionOrder,
  userActionMode,
  isRewarehousePool,
  CheckboxComponent,
  ImageWithViewerComponent,
  ButtonComponent,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isEditingThis = editingOrderData?.id === order.id;
  
  // Find the user group this order belongs to
  const userGroup = (pool.per_user_groups || []).find(g => g.user_email === order.user_email);
  
  // Extract order-level details from per_user_groups (group-level settings)
  const transitMethod = userGroup?.transit_shipping_method_name || order.pre_shipment?.transit_shipping_method_name;
  const orderAddons = userGroup?.selected_addons || order.selected_addons || [];
  const orderNote = userGroup?.note || order.pre_shipment?.user_note;
  
  // Get address from group_final_address or pre_shipment
  const addr = userGroup?.group_final_address || order.pre_shipment?.address || {};
  const destinationCountry = addr.country || order.destination_country;
  
  if (isEditingThis) {
    return (
      <div className="px-3 py-2.5 space-y-2">
        <div>
          <label className="text-xs text-gray-500">管理员备注</label>
          <input
            className="h-7 text-xs mt-0.5 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={editingOrderData.admin_note || ""}
            onChange={(e) => setEditingOrderData((d) => ({ ...d, admin_note: e.target.value }))}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <ButtonComponent size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => setEditingOrderData(null)}>取消</ButtonComponent>
          <ButtonComponent size="sm" className="h-6 text-xs px-2 bg-blue-600 hover:bg-blue-700" onClick={handleAdminOrderSave} disabled={savingOrder}>
            <Edit2 className="w-3 h-3 mr-1" />{savingOrder ? "保存中..." : "保存"}
          </ButtonComponent>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      {/* Order header */}
      <div className="flex items-start gap-3 px-3 py-2">
        <div className="flex gap-2 flex-shrink-0">
          {canSeeDetail && order.product_image_url && (
            <ImageWithViewerComponent src={order.product_image_url} alt="产品图片">
              <img src={order.product_image_url} alt="" className="w-12 h-12 rounded object-cover border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity" />
            </ImageWithViewerComponent>
          )}
          {canSeeDetail && order.arrival_photo_url && (
            <ImageWithViewerComponent src={order.arrival_photo_url} alt="入库图片">
              <img src={order.arrival_photo_url} alt="" className="w-12 h-12 rounded object-cover border border-blue-200 cursor-pointer hover:opacity-80 transition-opacity" title="入库图片" />
            </ImageWithViewerComponent>
          )}
          {!canSeeDetail && (
            <div className="w-12 h-12 rounded bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-gray-300" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 truncate">
            {canSeeDetail ? order.product_name : "他人包裹"}
          </p>
          <p className="text-xs text-gray-400">
            {canSeeDetail ? order.order_number : "—"} · {order.weight_g || 0}g
            {isAdmin && order.user_email ? ` · ${tenantUserMap[order.user_email]?.display_name || tenantUserMap[order.user_email]?.full_name || order.user_name || ""}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {canEditPackage && (poolStatus === "pending" || poolStatus === "processing") && (
            <div className="flex items-center gap-1">
              <button onClick={() => setEditingOrderData({ ...order })} className="flex-shrink-0 p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors" title="编辑包裹信息">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setShowOrderActions(showOrderActions === order.id ? null : order.id); if (showOrderActions !== order.id) loadOtherPools(order); }} className="flex-shrink-0 p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors" title="更多操作">
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {isRewarehousePool && isMyOrder && !hasPendingRW && (
            <CheckboxComponent checked={isRWSel} className="flex-shrink-0" />
          )}
          {isRewarehousePool && isMyOrder && hasPendingRW && (
            <span className="text-xs text-orange-500 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">审批中</span>
          )}
          {!isAdmin && order.user_email === pool.creator_email && poolStatus !== "shipped" && poolStatus !== "delivered" && poolStatus !== "awaiting_payment" && poolStatus !== "awaiting_payment_confirmation" && poolStatus !== "ready_to_ship" && (
            <button onClick={() => openUserAction(order, 'menu')} className="flex-shrink-0 p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors" title="移动/取消出货">
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      
      {/* Expandable detail section */}
      <div className="border-t px-3 pb-2">
        <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <MapPin className="w-3.5 h-3.5" />
              <span>发货目的地 & 增值服务</span>
            </div>
            <ButtonComponent variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? (
                <><ChevronUp className="w-3 h-3 mr-1" />收起</>
              ) : (
                <><ChevronDown className="w-3 h-3 mr-1" />查看详情</>
              )}
            </ButtonComponent>
          </div>
          
          {isExpanded && (
            <div className="p-3 space-y-3 text-xs">
              {(addr.recipient_name || addr.addr1 || destinationCountry) && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-blue-700 mb-1">
                    <MapPin className="w-3.5 h-3.5" />
                    发货目的地
                  </div>
                  {addr.recipient_name && (
                    <div>
                      <span className="text-gray-500">收件人：</span>
                      <span className="font-medium">{addr.recipient_name}</span>
                      {addr.phone && <span className="ml-2 text-gray-600">{addr.phone}</span>}
                    </div>
                  )}
                  {destinationCountry && (
                    <div>
                      <span className="text-gray-500">国家：</span>
                      <span className="font-medium">{getCountry(destinationCountry)?.name || destinationCountry}</span>
                    </div>
                  )}
                  {addr.addr1 && (
                    <div className="whitespace-pre-wrap text-gray-700">
                      {addr.addr1}{addr.addr2 && ` ${addr.addr2}`}{addr.addr3 && ` ${addr.addr3}`}{addr.state && `, ${addr.state}`}
                    </div>
                  )}
                </div>
              )}
              
              {transitMethod && (
                <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1.5 font-medium text-purple-700 mb-1">
                    <Truck className="w-3.5 h-3.5" />
                    中转运输方式
                  </div>
                  <div className="text-gray-700">{transitMethod}</div>
                </div>
              )}
              
              {orderAddons.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2 space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-yellow-700">
                    <Tag className="w-3.5 h-3.5" />
                    增值服务
                  </div>
                  {orderAddons.map((addon, idx) => (
                    <div key={idx} className="flex items-center justify-between text-gray-700">
                      <span>{addon.name || addon.id}</span>
                      {parseFloat(addon.fee) > 0 && (
                        <span className="font-medium text-yellow-700">+{addon.fee_currency || "JPY"} {Math.round(parseFloat(addon.fee))}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {orderNote && (
                <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1.5 font-medium text-gray-600 mb-1">
                    <FileText className="w-3.5 h-3.5" />
                    备注
                  </div>
                  <p className="text-gray-700 whitespace-pre-wrap">{orderNote}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}