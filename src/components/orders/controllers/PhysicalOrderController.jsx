/**
 * 实物订单控制器
 * 
 * 负责实物订单的：
 * - 表格列定义
 * - 单元格渲染逻辑
 * - 详情弹窗组件
 * - 数据过滤规则
 */

import { Package } from "lucide-react";
import { getStatusLabel, getStatusColor } from "@/lib/orderStatus";
import { ImageWithViewer } from "@/components/common/ImageViewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import PreShipmentBadge from "@/components/admin/PreShipmentBadge";
import { matchStoreTagResult } from "@/lib/onlineStoreTag";
import { t, getLocale } from "@/lib/i18n";

export const PhysicalOrderController = {
  getLabel: () => "实物订单",
  getIcon: () => Package,
  
  /**
   * 获取控制器辅助方法（可选）
   */
  getHelpers: () => ({
    // 可以在这里定义控制器需要的辅助方法
  }),

  /**
   * 获取表格列配置
   */
  getColumnConfig: () => {
    const locale = getLocale();
    return [
      { key: "order_number", label: t("订单号", locale), defaultVisible: true, sortable: true },
      { key: "user_name", label: t("用户名", locale), defaultVisible: true, sortable: true },
      { key: "product_name", label: t("商品名", locale), defaultVisible: true, sortable: true },
      { key: "estimated_jpy", label: t("货款", locale), defaultVisible: true, sortable: true },
      { key: "payable_amount", label: t("下单实付", locale), defaultVisible: true, sortable: true },
      { key: "paid_amount", label: t("已付总额", locale), defaultVisible: true, sortable: true },
      { key: "weight_g", label: t("订单重量", locale), defaultVisible: true, sortable: true },
      { key: "order_status", label: t("订单状态", locale), defaultVisible: true, sortable: true },
      { key: "online_store_tag", label: t("商城标签", locale), defaultVisible: false, sortable: true },
      { key: "reply_status", label: t("回复状态", locale), defaultVisible: false, sortable: true },
      { key: "purchased_date", label: t("下单日", locale), defaultVisible: false, sortable: true },
      { key: "storage_time", label: t("入库日", locale), defaultVisible: false, sortable: true },
      { key: "outbound_time", label: t("发货日", locale), defaultVisible: false, sortable: true },
      { key: "created_at", label: t("订单提交日", locale), defaultVisible: false, sortable: true },
      { key: "product_image_url", label: t("商品图片", locale), defaultVisible: false, sortable: false, isImage: true },
      { key: "storage_image", label: t("入库图片", locale), defaultVisible: false, sortable: false, isImage: true },
      { key: "product_description", label: t("商品描述", locale), defaultVisible: false, sortable: true },
      { key: "admin_note", label: t("管理员备注", locale), defaultVisible: false, sortable: true },
      { key: "user_note", label: t("用户订单备注", locale), defaultVisible: false, sortable: true },
      { key: "payment_deadline", label: t("付款截止日期", locale), defaultVisible: false, sortable: true },
      { key: "fullpay_once", label: t("一次付款", locale), defaultVisible: false, sortable: false, isFullPayOnce: true },
    ];
  },

  /**
   * 渲染单元格内容
   */
  renderCell: (order, col, helpers) => {
    const { userAvatars, storeTagRules, onOpenFullpaySettlement } = helpers || {};

    const formatAmount = (amount, currency) => {
      if (!amount || amount <= 0) return "-";
      if (currency === "JPY") return `${Math.round(amount).toLocaleString()} yen`;
      if (currency === "CNY") return `${Math.round(amount)} yuan`;
      return `${currency} ${amount.toFixed(2)}`;
    };

    switch (col.key) {
      case "order_number": {
        const isSplitPending = order.has_split_marker && !order.parent_order_id && order.split_index !== -1;
        return <span className="font-mono text-xs text-gray-500">{order.order_number ? `${order.order_number}${isSplitPending ? " - 00" : ""}` : "-"}</span>;
      }
      case "user_name": {
        const profile = userAvatars?.[order.user_email] || {};
        const avatarUrl = profile.avatar_url || null;
        const displayName = profile.display_name || order.user_name || order.user_email || "?";
        return (
          <div className="flex items-center gap-2 min-w-0">
            {avatarUrl
              ? <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-gray-100" />
              : <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-xs text-gray-500 font-medium">
                  {displayName[0].toUpperCase()}
                </div>
            }
            <span className="text-sm text-gray-800 truncate">{displayName}</span>
          </div>
        );
      }
      case "product_name":
        return (
          <TooltipProvider delayDuration={1000}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm font-medium text-gray-900 line-clamp-2 break-all cursor-default">{order.product_name}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p>{order.product_name}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      
      case "estimated_jpy":
        return <span className="text-sm text-gray-700">{order.estimated_jpy ? `${Math.round(order.estimated_jpy).toLocaleString()} JPY` : "-"}</span>;
      
      case "payable_amount": {
        const amt = order.payable_amount;
        const cur = order.payment_currency_type || "JPY";
        if (!amt || amt <= 0) {
          // 旧订单兼容：显示 prepayment_amount_jpy
          const legacy = order.prepayment_amount_jpy || order.paid_amount;
          return <span className="text-sm text-gray-700">{legacy ? formatAmount(legacy, order.prepayment_amount_jpy ? "JPY" : cur) : "-"}</span>;
        }
        return <span className="text-sm text-gray-700 font-medium">{formatAmount(amt, cur)}</span>;
      }
      
      case "paid_amount": {
        const amt = order.paid_amount;
        if (!amt || amt <= 0) return <span className="text-sm text-gray-400">-</span>;
        return <span className="text-sm text-gray-700">{formatAmount(amt, order.payment_currency_type || "JPY")}</span>;
      }
      
      case "weight_g":
        return <span className="text-sm text-gray-700">{order.weight_g ? `${order.weight_g}g` : "-"}</span>;
      
      case "order_status":
        return (
          <div className="flex flex-col gap-0.5">
            <Badge className={`text-xs ${getStatusColor(order.order_status, "admin")}`}>
              {getStatusLabel(order.order_status, "admin")}
            </Badge>
            {order.order_status === "shipping_fee_pending" && (
              <Badge className="text-xs bg-orange-100 text-orange-700 w-fit">待付运费</Badge>
            )}
          </div>
        );
      
      case "product_image_url": {
        const imgW = col.imageWidth || 40;
        return order.product_image_url
          ? <ImageWithViewer src={order.product_image_url} alt={order.product_name}>
              <img src={order.product_image_url} alt="" style={{ maxWidth: imgW, maxHeight: imgW, width: "100%", height: "auto" }} className="rounded object-cover border border-gray-100 cursor-pointer" />
            </ImageWithViewer>
          : <span className="text-xs text-gray-300">-</span>;
      }
      
      case "storage_image": {
        const imgW = col.imageWidth || 40;
        return order.storage_image
          ? <ImageWithViewer src={order.storage_image} alt="入库图片">
              <img src={order.storage_image} alt="" style={{ maxWidth: imgW, maxHeight: imgW, width: "100%", height: "auto" }} className="rounded object-cover border border-gray-100 cursor-pointer" />
            </ImageWithViewer>
          : <span className="text-xs text-gray-300">-</span>;
      }
      
      case "product_description":
        return <span className="text-xs text-gray-600 line-clamp-2 max-w-[200px]">{order.product_description || "-"}</span>;
      
      case "admin_note":
        return <span className="text-xs text-gray-600 line-clamp-2 max-w-[200px]">{order.admin_note || "-"}</span>;
      
      case "user_note":
        return <span className="text-xs text-gray-600 line-clamp-2 max-w-[200px]">{order.user_note || "-"}</span>;
      
      case "payment_deadline":
        return <span className="text-xs text-gray-700">{order.payment_deadline || "-"}</span>;
      
      case "reply_status": {
        const hasUnread = (order.unread_roles || []).includes("admin");
        const hasMsgs = (order.messages || []).length > 0;
        if (hasUnread) return <Badge className="text-xs bg-red-100 text-red-700">有新消息</Badge>;
        if (hasMsgs) return <Badge className="text-xs bg-gray-100 text-gray-500">有留言</Badge>;
        return <Badge className="text-xs bg-gray-100 text-gray-400">无留言</Badge>;
      }
      
      case "created_at":
        return <span className="text-xs text-gray-700">{order.created_at ? new Date(order.created_at).toLocaleDateString("zh-CN") : "-"}</span>;
      
      case "purchased_date":
        return <span className="text-xs text-gray-700">{order.purchased_date ? new Date(order.purchased_date).toLocaleDateString("zh-CN") : "-"}</span>;
      
      case "storage_time":
        return <span className="text-xs text-gray-700">{order.storage_time ? new Date(order.storage_time).toLocaleDateString("zh-CN") : "-"}</span>;
      
      case "outbound_time":
        return <span className="text-xs text-gray-700">{order.outbound_time ? new Date(order.outbound_time).toLocaleDateString("zh-CN") : "-"}</span>;
      
      case "fullpay_once": {
        const isFullpayOnce = order.payment_mode === "fullpay_once";
        const config = order.fullpay_once_config;
        
        if (!isFullpayOnce || !config) {
          return <span className="text-xs text-gray-400">-</span>;
        }
        
        const estimatedWeight = config.user_estimated_weight_g || 0;
        const actualWeight = order.weight_g || 0;
        const estimatedFee = config.estimated_shipping_fee_jpy || 0;
        const weightDiff = actualWeight - estimatedWeight;
        const settlementStatus = config.settlement_status || "pending";
        
        const statusColors = {
          pending: "bg-gray-100 text-gray-600",
          needs_supplement: "bg-orange-100 text-orange-700",
          needs_refund: "bg-blue-100 text-blue-700",
          settled: "bg-green-100 text-green-700"
        };
        
        const statusLabels = {
          pending: "待结算",
          needs_supplement: "待补款",
          needs_refund: "待退款",
          settled: "已结算"
        };
        
        return (
          <div className="flex flex-col gap-1 min-w-[140px]">
            <div className="flex items-center gap-1">
              <Badge className={`text-xs w-fit ${statusColors[settlementStatus]}`}>
                {statusLabels[settlementStatus] || settlementStatus}
              </Badge>
              {settlementStatus === 'pending' && actualWeight === 0 && (
                <button
                  onClick={() => onOpenFullpaySettlement?.(order, {
                    estimatedWeight,
                    estimatedFee,
                    weightDiff: 0,
                    feeDiff: 0
                  })}
                  className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline"
                >
                  结算
                </button>
              )}
            </div>
            <div className="text-[10px] text-gray-600 space-y-0.5">
              <div className="flex justify-between gap-2">
                <span>预估:</span>
                <span>{estimatedWeight}g / ¥{estimatedFee.toLocaleString()}</span>
              </div>
              {actualWeight > 0 && (
                <div className="flex justify-between gap-2">
                  <span>实际:</span>
                  <span>{actualWeight}g</span>
                </div>
              )}
              {weightDiff !== 0 && actualWeight > 0 && (
                <div className={`flex justify-between gap-2 ${weightDiff > 0 ? 'text-orange-600 font-medium' : 'text-blue-600 font-medium'}`}>
                  <span>差异:</span>
                  <span>{weightDiff > 0 ? '+' : ''}{weightDiff}g</span>
                </div>
              )}
            </div>
          </div>
        );
      }
      
      case "online_store_tag": {
        const tagRules = col._rules || [];
        const firstUrl = (order.product_url || "").split("\n").map(s => s.trim()).filter(Boolean)[0] || "";
        const tagResult = matchStoreTagResult(firstUrl, tagRules);
        return <Badge className={`text-xs ${tagResult.tag_color}`}>{tagResult.tag_label}</Badge>;
      }
      
      default:
        return "-";
    }
  },

  /**
   * 数据过滤逻辑
   */
  filterData: (orders, filters) => {
    const { statusFilter, search, userProfileMap, showArchived, storeTagFilter, storeTagRules, weightFilter, itemSizeFilter, replyFilter, dateRangeFilter } = filters || {};
    
    return orders.filter(o => {
      // 存档过滤
      if (showArchived ? !o.is_archived : !!o.is_archived) return false;
      // 隐藏已拆分的父订单
      if (o.split_index === -1) return false;
      
      // 状态过滤
      if (statusFilter !== "all" && o.order_status !== statusFilter) return false;
      
      // 搜索过滤
      const q = search?.toLowerCase() || "";
      if (q) {
        const displayName = (userProfileMap?.[o.user_email]?.display_name || o.user_name || "").toLowerCase();
        const matchSearch =
          (o.product_name || "").toLowerCase().includes(q) ||
          (o.order_number || "").toLowerCase().includes(q) ||
          (o.user_email || "").toLowerCase().includes(q) ||
          (o.user_name || "").toLowerCase().includes(q) ||
          displayName.includes(q);
        if (!matchSearch) return false;
      }

      // 商城标签过滤
      if (storeTagFilter && storeTagFilter !== "all") {
        const firstUrl = (o.product_url || "").split("\n").map(s => s.trim()).filter(Boolean)[0] || "";
        const tagResult = matchStoreTagResult(firstUrl, storeTagRules || []);
        if (tagResult.tag_label !== storeTagFilter) return false;
      }

      // 订单重量过滤
      if (weightFilter && weightFilter !== "all") {
        const w = o.weight_g || 0;
        if (weightFilter === "0-100" && !(w >= 0 && w < 100)) return false;
        if (weightFilter === "100-500" && !(w >= 100 && w < 500)) return false;
        if (weightFilter === "500-1000" && !(w >= 500 && w < 1000)) return false;
        if (weightFilter === "1000+" && !(w >= 1000)) return false;
      }

      // 物品尺寸过滤
      if (itemSizeFilter && itemSizeFilter !== "all") {
        if (itemSizeFilter === "未设置") {
          if (o.item_size_title) return false;
        } else {
          if ((o.item_size_title || "") !== itemSizeFilter) return false;
        }
      }

      // 回复状态过滤
      if (replyFilter && replyFilter !== "all") {
        const hasUnread = (o.unread_roles || []).includes("admin");
        const hasMsgs = (o.messages || []).length > 0;
        if (replyFilter === "unread" && !hasUnread) return false;
        if (replyFilter === "has_message" && !hasMsgs) return false;
        if (replyFilter === "no_message" && hasMsgs) return false;
      }

      // 日期段过滤
      if (dateRangeFilter && (dateRangeFilter.from || dateRangeFilter.to)) {
        const { field, from, to } = dateRangeFilter;
        // For created_at use created_at; for date fields use the field directly
        const raw = o[field];
        if (!raw) return false;
        
        // Convert to Date object for proper timezone handling
        const dateValue = new Date(raw);
        
        // Convert user's date strings to Date objects
        const fromDate = from ? new Date(from) : null;
        const toDate = to ? new Date(to) : null;
        
        if (fromDate && dateValue < fromDate) return false;
        if (toDate) {
          // For "to" date, include the entire day by setting to end of day
          if (to && !to.includes('T')) {
            const endDate = new Date(toDate);
            endDate.setHours(23, 59, 59, 999);
            if (dateValue > endDate) return false;
          } else {
            if (dateValue > toDate) return false;
          }
        }
      }
      
      return true;
    });
  },

  /**
   * 列配置管理
   */
  loadColumns: () => {
    const STORAGE_KEY = "admin_orders_columns";
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const controllerCols = PhysicalOrderController.getColumnConfig();
      if (!saved) return controllerCols.map(c => ({ ...c, visible: c.defaultVisible }));
      const parsed = JSON.parse(saved);
      const keyOrder = parsed.map(c => c.key);
      const merged = [
        ...parsed.map(p => {
          const def = controllerCols.find(c => c.key === p.key);
          if (!def) return null;
          return { ...def, visible: p.visible, ...(p.imageWidth ? { imageWidth: p.imageWidth } : {}), ...(p.showActual !== undefined ? { showActual: p.showActual } : {}), ...(p.showActualOnly !== undefined ? { showActualOnly: p.showActualOnly } : {}) };
        }).filter(Boolean),
        ...controllerCols.filter(c => !keyOrder.includes(c.key)).map(c => ({ ...c, visible: c.defaultVisible })),
      ];
      return merged;
    } catch {
      return PhysicalOrderController.getColumnConfig().map(c => ({ ...c, visible: c.defaultVisible }));
    }
  },

  saveColumns: (columns) => {
    const STORAGE_KEY = "admin_orders_columns";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columns.map(c => ({
      key: c.key,
      visible: c.visible,
      ...(c.imageWidth ? { imageWidth: c.imageWidth } : {}),
      ...(c.showActual !== undefined ? { showActual: c.showActual } : {}),
      ...(c.showActualOnly !== undefined ? { showActualOnly: c.showActualOnly } : {}),
    }))));
  },

  /**
   * 分组逻辑
   */
  getGroupKey: (order, groupBy, userProfileMap, storeTagRules, ALL_STATUSES, helpers) => {
    const { matchStoreTagResult, getStatusLabel } = helpers || {};
    
    if (groupBy === "user_name") {
      return userProfileMap?.[order.user_email]?.display_name || order.user_name || order.user_email || "未知用户";
    }
    if (groupBy === "order_status") {
      // Merge all notified_shipment* into one group
      const NOTIFIED_GROUP = "已通知出货";
      if (["notified_shipment", "notified_shipment_fee_pending", "notified_shipment_fee_paid"].includes(order.order_status)) {
        return NOTIFIED_GROUP;
      }
      return ALL_STATUSES.find(s => s.v === order.order_status)?.l || getStatusLabel?.(order.order_status, "admin") || order.order_status || "未知状态";
    }
    if (groupBy === "online_store_tag") {
      const firstUrl = (order.product_url || "").split("\n").map(s => s.trim()).filter(Boolean)[0] || "";
      return matchStoreTagResult?.(firstUrl, storeTagRules).tag_label || "其它";
    }
    return "其它";
  },

  sortGroups: (groupEntries, groupBy, ALL_STATUSES) => {
    if (groupBy === "order_status") {
      const statusOrder = ALL_STATUSES.map(s => s.l);
      groupEntries.sort(([a], [b]) => {
        const ai = statusOrder.indexOf(a);
        const bi = statusOrder.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    }
    return groupEntries;
  },

  /**
   * 获取分组头像 URL
   */
  getGroupAvatarUrl: (groupKey, groupOrders, groupBy, userProfileMap) => {
    if (groupBy === "user_name") {
      const groupUserEmail = groupOrders[0]?.user_email;
      const groupUserProfile = groupUserEmail ? (userProfileMap[groupUserEmail] || {}) : null;
      return groupUserProfile?.avatar_url || null;
    }
    return null;
  },

  /**
   * 批量操作
   */
  getBulkActions: (selectedOrders, sharedStatus) => {
    const actions = [];
    
    if (!sharedStatus) return actions;
    
    if (sharedStatus === "paid" || sharedStatus === "pending_purchase") {
      actions.push({
        key: "quick_ordered",
        label: "一键标记已下单",
        color: "bg-indigo-600 hover:bg-indigo-700",
        updateData: { order_status: "purchased", purchased_date: new Date().toISOString().split("T")[0] }
      });
    }
    
    if (sharedStatus === "in_warehouse") {
      actions.push({
        key: "ready_to_ship",
        label: "一键待发货",
        color: "bg-orange-600 hover:bg-orange-700",
        updateData: { order_status: "ready_to_ship" }
      });
    }
    
    if (sharedStatus === "ready_to_ship") {
      actions.push({
        key: "shipped",
        label: "一键发货",
        color: "bg-green-600 hover:bg-green-700",
        updateData: { order_status: "shipped", shipped_date: new Date().toISOString().split("T")[0] }
      });
    }
    
    if (sharedStatus === "shipped") {
      actions.push({
        key: "delivered",
        label: "一键签收",
        color: "bg-green-700 hover:bg-green-800",
        updateData: { order_status: "delivered" }
      });
    }
    
    return actions;
  },

  /**
   * 获取详情弹窗组件（暂时返回 null，由 AdminOrders 统一处理）
   */
  getDetailModal: () => null,
};