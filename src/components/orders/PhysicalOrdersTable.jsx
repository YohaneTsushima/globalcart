/**
 * 使用注册中心的简化实物订单表格
 * 
 * 演示如何将 AdminOrders 的实物订单部分迁移到使用控制器
 */

import { orderRegistry } from "@/lib/orderRegistry";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { ImageWithViewer } from "@/components/common/ImageViewer";
import { getStatusLabel, getStatusColor } from "@/lib/orderStatus";
import PreShipmentBadge from "@/components/admin/PreShipmentBadge";

export default function PhysicalOrdersTable({
  orders,
  columns,
  sortKey,
  sortDir,
  onSort,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  userProfileMap,
  storeTagRules,
  onOrderClick,
  onQuickOrdered,
  onQuickInWarehouse,
  onArchive,
  onUnarchive,
  onDelete,
  onOpenPool,
  shippingPools,
  pendingEditRequests,
  canPlaceOrder,
  canWarehouseIn,
  canArchiveOrder,
  showArchived,
}) {
  const controller = orderRegistry.get('physical');
  if (!controller) {
    return <div className="text-center py-8 text-red-600">实物订单控制器未加载</div>;
  }

  const visibleCols = columns.filter(c => c.visible);

  const renderCell = (order, col) => {
    // 使用控制器的 renderCell 方法
    return controller.renderCell(order, col, {
      userAvatars: userProfileMap,
      storeTagRules,
      onQuickOrdered,
      onOpenFullpaySettlement: () => {}, // TODO: 实现
    });
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="w-8 px-3 py-2 text-left">
              <Checkbox 
                checked={orders.length > 0 && orders.every(o => selectedIds.includes(o.id))}
                onCheckedChange={onToggleAll} 
              />
            </th>
            {visibleCols.map(col => (
              <th 
                key={col.key}
                className={`px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap ${col.sortable ? "cursor-pointer select-none hover:text-gray-800" : ""}`}
                onClick={() => col.sortable && onSort(col.key)}
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  {col.sortable && (
                    sortKey === col.key
                      ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
                      : <ChevronsUpDown className="w-3 h-3 opacity-30" />
                  )}
                </div>
              </th>
            ))}
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {orders.map(order => {
            const pendingEdit = pendingEditRequests.find(r => r.order_id === order.id);
            return (
              <tr 
                key={order.id} 
                className={`hover:bg-gray-50 cursor-pointer ${pendingEdit ? "bg-orange-50/60" : ""}`} 
                onClick={() => onOrderClick(order)}
              >
                <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                  <Checkbox 
                    checked={selectedIds.includes(order.id)} 
                    onCheckedChange={() => onToggleSelect(order.id)} 
                  />
                </td>
                {visibleCols.map(col => (
                  <td key={col.key} className="px-3 py-3 max-w-[220px] overflow-hidden">
                    {renderCell(order, col)}
                  </td>
                ))}
                <td className="px-3 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                  <div className="flex flex-wrap gap-1 items-center">
                    {/* TODO: 迁移操作按钮逻辑 */}
                    {order.order_status === "cancelled" && (
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => onDelete(order)}>
                        删除
                      </Button>
                    )}
                    {!showArchived && (order.order_status === "delivered" || order.order_status === "cancelled") && !order.is_archived && canArchiveOrder && (
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-gray-500 border-gray-200 hover:bg-gray-50"
                        onClick={() => onArchive(order)}>
                        存档
                      </Button>
                    )}
                    {showArchived && (
                      <>
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-blue-500 border-blue-200 hover:bg-blue-50"
                          onClick={() => onUnarchive(order)}>
                          取消存档
                        </Button>
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-red-500 border-red-200 hover:bg-red-50"
                          onClick={() => onDelete(order)}>
                          删除
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}