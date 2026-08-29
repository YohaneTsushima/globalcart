import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Package, Ticket } from "lucide-react";
import AdminTicketOrders from "@/pages/AdminTicketOrders";
import { orderRegistry } from "@/lib/orderRegistry";
import { Search, RefreshCw, Filter, ChevronUp, ChevronDown, ChevronsUpDown, Trash2, AlertCircle, Layers, Send, LayoutList, Archive, ArchiveRestore, Scissors, X, Loader2 } from "lucide-react";
import DateRangeFilter from "@/components/orders/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import AdminOrderEditModal from "@/components/admin/AdminOrderEditModal";
import PreShipmentBadge from "@/components/admin/PreShipmentBadge";
import ColumnCustomizer from "@/components/orders/ColumnCustomizer";
import ShippingPoolDetailModal from "@/components/shippingpool/ShippingPoolDetailModal";
import { getStatusLabel } from "@/lib/orderStatus";
import { matchStoreTagResult } from "@/lib/onlineStoreTag";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePermissions } from "@/hooks/usePermissions";
import { usePageSize } from "@/hooks/usePageSize";
import PaginationBar from "@/components/common/PaginationBar";
import { MOCK_ADMIN_ORDERS_DATA } from "@/mock/adminOrdersMock";
import { updateOrder } from "@/lib/tenantApi";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { toast } from "sonner";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from "@/components/ui/alert-dialog";

const STORAGE_KEY = "admin_orders_columns";

const ALL_STATUSES = [
  { v: "pending_confirmation", l: "后付款待确认" },
  { v: "payment_pending", l: "待付款" },
  { v: "awaiting_payment_confirmation", l: "待付款确认" },
  { v: "paid", l: "已付款" },
  { v: "pending_purchase", l: "待下单" },
  { v: "purchased", l: "已下单" },
  { v: "in_warehouse", l: "已入库" },
  { v: "notified_shipment", l: "已通知出货" },
  { v: "notified_shipment_fee_pending", l: "待出货待付运费" },
  { v: "notified_shipment_fee_paid", l: "待出货已付运费" },
  { v: "shipping_fee_pending", l: "待付运费" },
  { v: "ready_to_ship", l: "准备发货" },
  { v: "shipped", l: "已发出" },
  { v: "delivered", l: "已收货" },
  { v: "cancelled", l: "已取消" },
];

export default function AdminOrders() {
  const { user } = useCurrentUser();
  const { can, isAdmin } = usePermissions();
  const canEditOrder = isAdmin || can("order:edit_order");
  const canPlaceOrder = isAdmin || can("order:place_order");
  const canWarehouseIn = isAdmin || can("order:warehouse_in");
  const canArchiveOrder = isAdmin || can("order:archive_order");
  
  // 获取实物订单控制器（必须在所有 useState 之前）
  const physicalController = orderRegistry.get('physical');
  
  // 读取 URL 参数自动切换 tab
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab') === 'ticket' ? 'ticket' : 'physical';
  const [activeTab, setActiveTab] = useState(initialTab);
  
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [columns, setColumns] = useState(() => physicalController.loadColumns());

  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [groupBy, setGroupBy] = useState("none");
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [storeTagRules, setStoreTagRules] = useState([]);

  const [itemSizeTemplates, setItemSizeTemplates] = useState([]);
  const [pendingEditRequests, setPendingEditRequests] = useState([]);
  const [userProfileMap, setUserProfileMap] = useState({});
  const [shippingPools, setShippingPools] = useState([]);
  const [shippingMethods, setShippingMethods] = useState([]);
  const [boxTemplates, setBoxTemplates] = useState([]);
  const [transitLocations, setTransitLocations] = useState([]);
  const [transitShippingMethods, setTransitShippingMethods] = useState([]);
  const [defaultPackingFeeSingle, setDefaultPackingFeeSingle] = useState(0);
  const [defaultPackingFeeConsolidation, setDefaultPackingFeeConsolidation] = useState(0);
  const [selectedPool, setSelectedPool] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const { pageSize, setPageSize, currentPage, setCurrentPage, resetPage, PAGE_SIZES } = usePageSize("admin_orders_page_size", 20);
  const fetchingRef = useRef(false);
  const searchTimerRef = useRef(null);
  const isInitialized = useRef(false);
  // 额外筛选条件
  const [storeTagFilter, setStoreTagFilter] = useState("all");
  const [weightFilter, setWeightFilter] = useState("all"); // "all" | "0-100" | "100-500" | "500-1000" | "1000+"
  const [itemSizeFilter, setItemSizeFilter] = useState("all");
  const [replyFilter, setReplyFilter] = useState("all"); // "all" | "unread" | "has_message" | "no_message"
  const [dateRangeFilter, setDateRangeFilter] = useState(null); // { field, from, to }

  const [showFullpaySettlement, setShowFullpaySettlement] = useState(false);
  const [selectedFullpayOrder, setSelectedFullpayOrder] = useState(null);
  const [settlementData, setSettlementData] = useState(null);
  const [actualWeight, setActualWeight] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderedConfirmOrder, setOrderedConfirmOrder] = useState(null);
  const [bulkErrors, setBulkErrors] = useState([]);
  const [showBulkErrors, setShowBulkErrors] = useState(false);

  const fetchOrders = async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const skipPagination = groupBy !== "none";
      const r = await base44.functions.invoke('admin/orders/getAdminOrdersPage', {
        ...(skipPagination ? {} : { page: currentPage, pageSize }),
        search,
        statusFilter,
        storeTagFilter,
        weightFilter,
        itemSizeFilter,
        replyFilter,
        dateField: dateRangeFilter?.field || undefined,
        dateFrom: dateRangeFilter?.from || undefined,
        dateTo: dateRangeFilter?.to || undefined,
        showArchived,
        sortKey: sortKey || undefined,
        sortDir: sortDir || undefined,
        groupBy,
      });
      const d = r.data || {};
      const data = d.orders || [];
      setOrders(data);
      if (!skipPagination) setTotal(d.total || 0);
      setStoreTagRules(d.store_tag_rules || []);
      setItemSizeTemplates(d.item_size_templates || []);
      setPendingEditRequests(d.pending_edit_requests || []);
      setUserProfileMap(d.user_profile_map || {});
      setShippingPools(d.shipping_pools || []);
      setShippingMethods(d.shipping_methods || []);
      setBoxTemplates(d.box_templates || []);
      setTransitLocations(d.transit_locations || []);
      setTransitShippingMethods(d.transit_shipping_methods || []);
      setDefaultPackingFeeSingle(d.default_packing_fee_single || 0);
      setDefaultPackingFeeConsolidation(d.default_packing_fee_consolidation || 0);
    } catch (err) {
      console.warn('[AdminOrders] API 请求失败，使用 Mock 数据:', err.message);
      localStorage.removeItem(STORAGE_KEY);
      setColumns(physicalController.getColumnConfig().map(c => ({ ...c, visible: c.defaultVisible })));
      const mock = MOCK_ADMIN_ORDERS_DATA;
      // setOrders(mock.orders);
      // setStoreTagRules(mock.storeTagRules);
      // setItemSizeTemplates(mock.itemSizeTemplates);
      // setPendingEditRequests(mock.pendingEditRequests);
      // setUserProfileMap(mock.userProfileMap);
      // setShippingPools(mock.shippingPools);
      // setShippingMethods(mock.shippingMethods);
      // setBoxTemplates(mock.boxTemplates);
      // setTransitLocations(mock.transitLocations);
      // setTransitShippingMethods(mock.transitShippingMethods);
      // setDefaultPackingFeeSingle(mock.defaultPackingFeeSingle);
      // setDefaultPackingFeeConsolidation(mock.defaultPackingFeeConsolidation);
    } finally {
      fetchingRef.current = false;
      isInitialized.current = true;
      setLoading(false);
    }
  };

  // 首次加载
  useEffect(() => {
    if (!user) return;
    fetchOrders();
  }, [user]);

  // 筛选/排序/groupBy 变化 → 直接拉取
  useEffect(() => {
    if (!isInitialized.current) return;
    fetchOrders();
  }, [statusFilter, storeTagFilter, weightFilter, itemSizeFilter, replyFilter, dateRangeFilter, showArchived, sortKey, sortDir, groupBy]);

  // 搜索防抖 → 400ms 后拉取
  useEffect(() => {
    if (!isInitialized.current) return;
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => fetchOrders(), 400);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  // 分页变化 → 拉取
  useEffect(() => {
    if (!isInitialized.current) return;
    fetchOrders();
  }, [currentPage, pageSize]);

  if (user && !isAdmin && !can("order:update")) {
    return <div className="text-center py-8 text-red-600">无访问权限</div>;
  }

  const handleColumnsChange = (newCols) => {
    setColumns(newCols);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newCols.map(c => ({
      key: c.key,
      visible: c.visible,
      ...(c.imageWidth ? { imageWidth: c.imageWidth } : {}),
      ...(c.showActual !== undefined ? { showActual: c.showActual } : {}),
      ...(c.showActualOnly !== undefined ? { showActualOnly: c.showActualOnly } : {}),
    }))));
  };

  const getStatusLabel = (status) => {
    const found = ALL_STATUSES.find(item => item.v === status);
    return found ? found.l : "未知状态";
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleArchiveOrder = async (order) => {
    await base44.functions.invoke('updateTenantOrder', { order_id: order.id, is_archived: true, archived_at: new Date().toISOString() });
    fetchOrders();
  };

  const handleUnarchiveOrder = async (order) => {
    await base44.functions.invoke('updateTenantOrder', { order_id: order.id, is_archived: false, archived_at: "" });
    fetchOrders();
  };

  const handleDeleteOrder = async (order) => {
    if (!window.confirm(`确认永久删除订单"${order.product_name}"？此操作不可撤销。`)) return;
    await base44.functions.invoke('mutateTenantEntity', { entity: 'Order', action: 'delete', id: order.id });
    fetchOrders();
  };

  // 后端已分页/排序，orders 即当前页数据
  const filtered = orders;
  const visibleCols = columns.filter(c => c.visible);

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (selectedIds.length === orders.length) setSelectedIds([]);
    else setSelectedIds(orders.map(o => o.id));
  };

  const handleBulkUpdate = async () => {
    if (!bulkStatus || selectedIds.length === 0) return;
    setBulkUpdating(true);
    // await Promise.all(selectedIds.map(id =>
    //   base44.functions.invoke('updateTenantOrder', { order_id: id, order_status: bulkStatus })
    // ));
    let payload = selectedIds.map(i => { return { id: i, data: { status: bulkStatus }}; });
   
    const res = await base44.functions.invoke('order/info/forceUpdate', payload);

    const innerCode = res?.data?.code;
    if (innerCode === 200) {
      toast.success(`批量更新为成功，状态为  ${getStatusLabel(bulkStatus)} `);
    } else {
      const errors = res?.data?.errorInfo?.errors || [];
      if (errors.length > 0) {
        setBulkErrors(errors.map(e => e.errorMessage));
        setShowBulkErrors(true);
      } else {
        toast.error(res?.data?.message || "操作失败");
      }
    }

    fetchOrders();
    setBulkUpdating(false);
    setSelectedIds([]);
    setBulkStatus("");
    fetchOrders();
  };

  // Bulk quick actions: compute shared status of selected orders
  const selectedOrders = orders.filter(o => selectedIds.includes(o.id));
  const uniqueSelectedStatuses = [...new Set(selectedOrders.map(o => o.order_status))];
  const sharedStatus = uniqueSelectedStatuses.length === 1 ? uniqueSelectedStatuses[0] : null;

  const handleBulkQuickOrdered = async () => {
    setBulkUpdating(true);
    await Promise.all(selectedIds.map(id =>
      base44.functions.invoke('updateTenantOrder', { order_id: id, order_status: "purchased", purchased_date: new Date().toISOString().split("T")[0] })
    ));
    setBulkUpdating(false);
    setSelectedIds([]);
    fetchOrders();
  };

  const handleBulkInWarehouse = async () => {
    setBulkUpdating(true);
    await Promise.all(selectedIds.map(id =>
      base44.functions.invoke('updateTenantOrder', { order_id: id, order_status: "in_warehouse", storage_time: new Date().toISOString().split("T")[0] })
    ));
    setBulkUpdating(false);
    setSelectedIds([]);
    fetchOrders();
  };

  const handleStatusClick = (order) => {
    // Quick link jump for simple pending_purchase orders
    if (order.order_status === "pending_purchase") {
      const urls = (order.product_url || "").split("\n").map(s => s.trim()).filter(Boolean);
      const isSimpleOrder = urls.length === 1 && !order.product_description && !order.user_note && (order.messages || []).length === 0;
      if (isSimpleOrder) {
        window.open(urls[0], "_blank");
        return;
      }
    }
    // Open order details for other cases
    setSelectedOrder(order);
  };

  const handleQuickOrdered = async (order) => {

    updateOrder(order.id, {
      order_id: order.id,
      order_status: "purchased",
      purchased_date: new Date().toISOString().split("T")[0],
      notice_key: 'order_purchased'
    });
    // await base44.functions.invoke('updateTenantOrder', {
    //   order_id: order.id,
    //   order_status: "purchased",
    //   purchased_date: new Date().toISOString().split("T")[0],
    //   notice_key: 'order_purchased'
    // });
    fetchOrders();
  };

  const handleQuickInWarehouse = async (order) => {
    setSelectedOrder(order);
  };

  const handleDeleteCancelled = async (order) => {
    if (!window.confirm(`确认永久删除订单"${order.product_name}"？此操作不可撤销。`)) return;
    await base44.functions.invoke('mutateTenantEntity', { entity: 'Order', action: 'delete', id: order.id });
    fetchOrders();
  };

  const handleConfirmPaid = async (order) => {

    let payload = [{
      id: order.id
    }];

    await base44.functions.invoke('order/info/confirmProof', payload);
    fetchOrders();
  };

  const builkMarkPurchased = async () => {
   
    const payload = selectedIds.map(i => { return { id: i }; });
   debugger
   
    const res = await base44.functions.invoke('order/info/handleMarkPurchased', payload);
debugger
    const innerCode = res?.data?.code;
    if (innerCode === 200) {
      toast.success("批量已下单成功");
    } else {
      const errors = res?.data?.errorInfo?.errors || [];
      if (errors.length > 0) {
        setBulkErrors(errors.map(e => e.errorMessage));
        setShowBulkErrors(true);
      } else {
        toast.error(res?.data?.message || "操作失败");
      }
    }

    fetchOrders();

  }

  const builkConfirmPaid = async () => {

    const payload = selectedIds.map(i => { return { id: i }; });
   
    const res = await base44.functions.invoke('order/info/confirmProof', payload);

    const innerCode = res?.data?.code;
    if (innerCode === 200) {
      toast.success("确认收款成功");
    } else {
      const errors = res?.data?.errorInfo?.errors || [];
      if (errors.length > 0) {
        setBulkErrors(errors.map(e => e.errorMessage));
        setShowBulkErrors(true);
      } else {
        toast.error(res?.data?.message || "操作失败");
      }
    }
    fetchOrders();
  }

  // Find the shipping pool for a notified_shipment order
  const getOrderPool = (order) => {
    const orderId = String(order.id);
    return shippingPools.find(p => (p.order_ids || []).some(id => String(id) === orderId)) || null;
  };

  const handleOpenPool = async (pool) => {
    const isOfficialPool = pool.is_admin_created === true;
    if (isOfficialPool) {
      window.location.href = '/AdminShippingPool?view=official';
      return;
    }
    setSelectedPool(pool);
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="physical" className="gap-1.5"><Package className="w-3.5 h-3.5" />实物订单</TabsTrigger>
        <TabsTrigger value="ticket" className="gap-1.5"><Ticket className="w-3.5 h-3.5" />票务订单</TabsTrigger>
      </TabsList>

      <TabsContent value="ticket">
        <AdminTicketOrders />
      </TabsContent>

      <TabsContent value="physical" className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-900">订单管理</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchOrders}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />刷新
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowArchived(v => !v); setSelectedIds([]); }}>
            {showArchived ? <><ArchiveRestore className="w-3.5 h-3.5 mr-1.5" />返回订单列表</> : <><Archive className="w-3.5 h-3.5 mr-1.5" />查看已存档</>}
          </Button>
          <ColumnCustomizer columns={columns} onChange={handleColumnsChange} />
        </div>
      </div>

      {/* Filters — full width, search flexes, others fixed */}
      <div className="flex flex-wrap gap-2 items-center w-full">
        {/* 搜索框 - 灵活适配 */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input placeholder="搜索订单/商品/用户..." className="pl-8 h-8 text-sm w-full"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* 订单状态 - 固定宽度 */}
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setSelectedIds([]); }}>
          <SelectTrigger className="w-36 h-8 text-xs shrink-0">
            <Filter className="w-3.5 h-3.5 mr-1 text-gray-400 shrink-0" />
            <SelectValue placeholder="所有状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有状态</SelectItem>
            {ALL_STATUSES.map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* 商城标签 - 固定宽度 */}
        <Select value={storeTagFilter} onValueChange={setStoreTagFilter}>
          <SelectTrigger className="h-8 text-xs w-28 shrink-0">
            <SelectValue placeholder="商城标签" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">商城标签</SelectItem>
            {[...new Set(storeTagRules.map(r => r.tag_label).filter(Boolean))].map(tag => (
              <SelectItem key={tag} value={tag}>{tag}</SelectItem>
            ))}
            <SelectItem value="其它">其它</SelectItem>
          </SelectContent>
        </Select>

        {/* 订单重量 - 固定宽度 */}
        <Select value={weightFilter} onValueChange={setWeightFilter}>
          <SelectTrigger className="h-8 text-xs w-28 shrink-0">
            <SelectValue placeholder="订单重量" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">订单重量</SelectItem>
            <SelectItem value="0-100">0–100g</SelectItem>
            <SelectItem value="100-500">100–500g</SelectItem>
            <SelectItem value="500-1000">500–1000g</SelectItem>
            <SelectItem value="1000+">1000g+</SelectItem>
          </SelectContent>
        </Select>

        {/* 物品尺寸 - 固定宽度 */}
        <Select value={itemSizeFilter} onValueChange={setItemSizeFilter}>
          <SelectTrigger className="h-8 text-xs w-28 shrink-0">
            <SelectValue placeholder="物品尺寸" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">物品尺寸</SelectItem>
            {[...new Set(itemSizeTemplates.map(t => t.title || t.name).filter(Boolean))].map(name => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
            <SelectItem value="未设置">未设置</SelectItem>
          </SelectContent>
        </Select>

        {/* 回复状态 - 固定宽度 */}
        <Select value={replyFilter} onValueChange={setReplyFilter}>
          <SelectTrigger className="h-8 text-xs w-28 shrink-0">
            <SelectValue placeholder="回复状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">回复状态</SelectItem>
            <SelectItem value="unread">有新消息</SelectItem>
            <SelectItem value="has_message">有留言</SelectItem>
            <SelectItem value="no_message">无留言</SelectItem>
          </SelectContent>
        </Select>

        {/* 日期段筛选 - 固定宽度 */}
        <div className="shrink-0">
          <DateRangeFilter value={dateRangeFilter} onChange={setDateRangeFilter} />
        </div>

        {/* 分组 - 固定宽度 */}
        <Select value={groupBy} onValueChange={v => { setGroupBy(v); setCollapsedGroups({}); }}>
          <SelectTrigger className="w-28 h-8 text-xs shrink-0">
            <LayoutList className="w-3.5 h-3.5 mr-1 text-gray-400 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">不分组</SelectItem>
            <SelectItem value="user_name">按用户名</SelectItem>
            <SelectItem value="order_status">按订单状态</SelectItem>
            <SelectItem value="online_store_tag">按商城标签</SelectItem>
          </SelectContent>
        </Select>

        {/* 清除筛选 - 固定宽度 */}
        {(statusFilter !== "all" || storeTagFilter !== "all" || weightFilter !== "all" || itemSizeFilter !== "all" || replyFilter !== "all" || dateRangeFilter) && (
          <button
            onClick={() => { setStatusFilter("all"); setStoreTagFilter("all"); setWeightFilter("all"); setItemSizeFilter("all"); setReplyFilter("all"); setDateRangeFilter(null); setSelectedIds([]); }}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 h-8 px-1 shrink-0"
          >
            <X className="w-3 h-3" />清除
          </button>
        )}
      </div>

      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 sticky top-14 z-30 shadow-md">
          <span className="text-sm text-blue-700 font-medium shrink-0">已选 {selectedIds.length} 条</span>

          {/* Context-aware quick actions when all selected share the same status */}
          {(() => {
            const bulkActions = physicalController.getBulkActions(selectedOrders, sharedStatus, {
              awaiting_payment_confirmation: builkConfirmPaid,
              quick_ordered: builkMarkPurchased,
            });
            return bulkActions.length > 0 ? (
              <div className="flex items-center gap-1.5 border-r border-blue-200 pr-2 mr-1">
                <span className="text-xs text-blue-500 shrink-0">快捷操作：</span>
                {bulkActions.map(action => (
                  <Button key={action.key} size="sm" className={`h-7 text-xs ${action.color}`}
                    onClick={async () => {
                      setBulkUpdating(true);
                      if (action.handler) {
                        await action.handler(selectedIds);
                      } else {
                        await Promise.all(selectedIds.map(id =>
                          base44.functions.invoke('updateTenantOrder', { order_id: id, ...action.updateData })
                        ));
                      }
                      setBulkUpdating(false);
                      setSelectedIds([]);
                      fetchOrders();
                    }} disabled={bulkUpdating}>
                    {bulkUpdating ? "处理中..." : `${action.label}（${selectedIds.length} 条）`}
                  </Button>
                ))}
              </div>
            ) : null;
          })()}

          <Select value={bulkStatus} onValueChange={setBulkStatus}>
            <SelectTrigger className="h-7 text-xs w-40">
              <SelectValue placeholder="批量设置状态" />
            </SelectTrigger>
            <SelectContent>
              {ALL_STATUSES.map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
            onClick={handleBulkUpdate} disabled={!bulkStatus || bulkUpdating}>
            {bulkUpdating ? "更新中..." : "确认更新"}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={bulkUpdating} onClick={() => setSelectedIds([])}>取消</Button>
        </div>
      )}

      {/* Orders table */}
      <div className="relative border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-8 px-3 py-2 text-left">
                {groupBy === "none" ? (
                  <Checkbox checked={orders.length > 0 && orders.every(o => selectedIds.includes(o.id))}
                    onCheckedChange={toggleAll} />
                ) : null}
              </th>
              {visibleCols.map(col => (
                <th key={col.key}
                  className={`px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap ${col.sortable ? "cursor-pointer select-none hover:text-gray-800" : ""}`}
                  onClick={() => col.sortable && handleSort(col.key)}>
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
            {loading ? (
              <tr><td colSpan={visibleCols.length + 2} className="text-center py-12 text-gray-400 text-sm">加载中...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={visibleCols.length + 2} className="text-center py-12 text-gray-400 text-sm">暂无订单</td></tr>
            ) : (() => {
              const renderData = groupBy === "none" ? orders : filtered;
              const renderOrderRow = (order) => {
                const pendingEdit = pendingEditRequests.find(r => r.order_id === parseInt(order.id));
                return (
                  <tr key={order.id} className={`hover:bg-gray-50 cursor-pointer ${pendingEdit ? "bg-orange-50/60" : ""}`} onClick={() => handleStatusClick(order)}>
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.includes(order.id)} onCheckedChange={() => toggleSelect(order.id)} />
                    </td>
                    {visibleCols.map(col => (
                      <td key={col.key} className="px-3 py-3 max-w-[220px]">
                        {physicalController.renderCell(order, { ...col, _rules: storeTagRules }, {
                          userAvatars: userProfileMap,
                          storeTagRules,
                          matchStoreTagResult,
                          getStatusLabel,
                          onOpenFullpaySettlement: (order, data) => {
                            setSelectedFullpayOrder(order);
                            setSettlementData(data);
                            setShowFullpaySettlement(true);
                          }
                        })}
                      </td>
                    ))}
                    <td className="px-3 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <div className="flex flex-wrap gap-1 items-center">
                        {(order.unread_roles || []).includes("admin") && (
                          <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full font-medium animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />新消息
                          </span>
                        )}
                        {order.order_status === "in_warehouse" && (order.messages || []).some(m => m.split_request && m.split_request.status === "pending") && (
                          <span className="inline-flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full font-medium animate-pulse">
                            <Scissors className="w-3 h-3" />申请拆单
                          </span>
                        )}
                        {order.has_split_marker && !order.parent_order_id && order.split_index !== -1 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full font-medium">
                            <span className="text-[10px]">✂</span>待拆分
                          </span>
                        )}
                        {order.parent_order_id && (
                          <span className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full font-medium">
                            子 -{String(order.split_index || 0).padStart(2, '0')}
                          </span>
                        )}
                        {pendingEdit && (
                          <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 border border-orange-300 px-1.5 py-0.5 rounded-full font-medium">
                            <AlertCircle className="w-3 h-3" />
                            {pendingEdit.edit_type === 'cancel_shipment' ? '申请重新入库' : '申请移至其他发货申请'}
                          </span>
                        )}
                        {order.order_status === "awaiting_payment_confirmation" && canPlaceOrder && (
                          <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-green-600 border-green-200 hover:bg-green-50"
                            onClick={() => handleConfirmPaid(order)}>
                            确认已付款
                          </Button>
                        )}
                        {(order.order_status === "paid" || order.order_status === "pending_purchase") && canPlaceOrder && (
                          order.has_split_marker
                            ? <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-indigo-600 border-indigo-200"
                                onClick={() => setSelectedOrder(order)}>
                                查看详情
                              </Button>
                            : <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-indigo-600 border-indigo-200"
                                onClick={() => setOrderedConfirmOrder(order)}>
                                已下单
                              </Button>
                        )}
                        {order.order_status === "purchased" && order.pre_shipment && (
                          <PreShipmentBadge preShipment={order.pre_shipment} />
                        )}
                        {order.order_status === "purchased" && canWarehouseIn && (
                          <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-teal-600 border-teal-200"
                            onClick={() => handleQuickInWarehouse(order)}>
                            入库
                          </Button>
                        )}
                        {order.order_status === "shipping_fee_pending" && (() => {
                          const pool = getOrderPool(order);
                          if (!pool) return null;
                          const isConsolidation = pool.consolidation_type && pool.consolidation_type !== "";
                          return (
                            <Button size="sm" variant="outline"
                              className={`h-6 text-xs px-2 ${isConsolidation ? "text-purple-600 border-purple-200 hover:bg-purple-50" : "text-orange-600 border-orange-200 hover:bg-orange-50"}`}
                              onClick={() => handleOpenPool(pool)}>
                              {isConsolidation ? <><Layers className="w-3 h-3 mr-1" />查看拼邮</> : <><Send className="w-3 h-3 mr-1" />查看发货申请</>}
                            </Button>
                          );
                        })()}
                        {(() => {
                          const pool = getOrderPool(order);
                          if (!pool) return null;
                          if (order.order_status === "shipping_fee_pending") return null; // already shown above
                          if (!["notified_shipment", "ready_to_ship", "notified_shipment_fee_paid"].includes(order.order_status)) return null;
                          const isConsolidation = pool.consolidation_type && pool.consolidation_type !== "";
                          const isOfficialPool = pool.is_admin_created === true;
                          return (
                            <Button size="sm" variant="outline"
                              className={`h-6 text-xs px-2 ${isOfficialPool ? "text-blue-600 border-blue-200 hover:bg-blue-50" : isConsolidation ? "text-purple-600 border-purple-200 hover:bg-purple-50" : "text-teal-600 border-teal-200 hover:bg-teal-50"}`}
                              onClick={() => handleOpenPool(pool)}>
                              {isOfficialPool
                                ? <><Layers className="w-3 h-3 mr-1" />查看官方拼邮</>
                                : isConsolidation
                                ? <><Layers className="w-3 h-3 mr-1" />查看拼邮</>
                                : <><Send className="w-3 h-3 mr-1" />查看发货申请</>}
                            </Button>
                          );
                        })()}
                        {order.order_status === "cancelled" && (
                          <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => handleDeleteCancelled(order)}>
                            <Trash2 className="w-3 h-3 mr-1" />删除
                          </Button>
                        )}
                        {!showArchived && (order.order_status === "delivered" || order.order_status === "cancelled") && !order.is_archived && canArchiveOrder && (
                          <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-gray-500 border-gray-200 hover:bg-gray-50"
                            onClick={() => handleArchiveOrder(order)}>
                            <Archive className="w-3 h-3 mr-1" />存档
                          </Button>
                        )}
                        {showArchived && (
                          <>
                            <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-blue-500 border-blue-200 hover:bg-blue-50"
                              onClick={() => handleUnarchiveOrder(order)}>
                              <ArchiveRestore className="w-3 h-3 mr-1" />取消存档
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-red-500 border-red-200 hover:bg-red-50"
                              onClick={() => handleDeleteOrder(order)}>
                              <Trash2 className="w-3 h-3 mr-1" />删除
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              };

              if (groupBy === "none") return renderData.map(renderOrderRow);

              // Build groups using controller
              const groups = {};
              filtered.forEach(order => {
                const key = physicalController.getGroupKey(order, groupBy, userProfileMap, storeTagRules, ALL_STATUSES, { matchStoreTagResult, getStatusLabel });
                if (!groups[key]) groups[key] = [];
                groups[key].push(order);
              });

              // Sort groups using controller
              const groupEntries = physicalController.sortGroups(Object.entries(groups), groupBy, ALL_STATUSES);

              return groupEntries.flatMap(([groupKey, groupOrders]) => {
                const isCollapsed = collapsedGroups[groupKey] !== false;
                // Find avatar for user_name grouping using controller
                const groupAvatarUrl = physicalController.getGroupAvatarUrl(groupKey, groupOrders, groupBy, userProfileMap);
                return [
                  <tr key={`group-${groupKey}`} className="bg-gray-100 border-y border-gray-200">
                    <td className="px-3 py-2 w-8" onClick={e => e.stopPropagation()}>
                      {!isCollapsed && (
                        <Checkbox
                          checked={groupOrders.length > 0 && groupOrders.every(o => selectedIds.includes(o.id))}
                          onCheckedChange={() => {
                            const ids = groupOrders.map(o => o.id);
                            const allSelected = ids.every(id => selectedIds.includes(id));
                            if (allSelected) setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
                            else setSelectedIds(prev => [...new Set([...prev, ...ids])]);
                          }}
                        />
                      )}
                    </td>
                    <td colSpan={visibleCols.length + 1} className="px-3 py-2">
                      <button
                        className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:text-gray-900 w-full text-left"
                        onClick={() => setCollapsedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }))}
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                        {groupBy === "user_name" && (
                          groupAvatarUrl
                            ? <img src={groupAvatarUrl} alt="" className="w-5 h-5 rounded-full object-cover border border-gray-200 flex-shrink-0" />
                            : <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-[10px] font-medium flex-shrink-0">{groupKey[0]?.toUpperCase()}</div>
                        )}
                        <span>{groupKey}</span>
                        <span className="font-normal text-gray-400">({groupOrders.length} 条)</span>
                      </button>
                    </td>
                  </tr>,
                  ...(isCollapsed ? [] : groupOrders.map(renderOrderRow)),
                ];
              });
            })()}
          </tbody>
        </table>
        {bulkUpdating && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-20">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin mr-2" />
            <span className="text-sm text-gray-500">更新中...</span>
          </div>
        )}
      </div>

      <PaginationBar
        total={total}
        pageSize={pageSize}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onPageSizeChange={(s) => { setPageSize(s); resetPage(); }}
        className="mt-1"
      />

      {selectedOrder && canEditOrder && (
        <AdminOrderEditModal
          order={selectedOrder}
          initialItemSizeTemplates={itemSizeTemplates}
          shippingPools={shippingPools}
          currentUser={user}
          userProfileMap={userProfileMap}
          onClose={() => setSelectedOrder(null)}
          onSaved={() => { setSelectedOrder(null); fetchOrders(); }}
          onOpenPool={async (poolId, isOfficialPool = false) => {
            setSelectedOrder(null);
            if (!poolId) return;
            
            if (isOfficialPool) {
              window.location.href = '/AdminShippingPool?view=official';
              return;
            }
                        
            setSelectedPool({ id: poolId });
          }}
        />
      )}

      {selectedPool && user && (
        <ShippingPoolDetailModal
          pool={selectedPool}
          isAdmin={true}
          currentUser={user}
          pendingEditRequests={pendingEditRequests.filter(r => r.pool_id === selectedPool.id)}
          boxTemplates={boxTemplates}
          shippingMethods={shippingMethods}
          transitLocations={transitLocations}
          transitShippingMethods={transitShippingMethods}
          defaultPackingFeeSingle={defaultPackingFeeSingle}
          defaultPackingFeeConsolidation={defaultPackingFeeConsolidation}
          onClose={() => setSelectedPool(null)}
          onUpdated={() => { setSelectedPool(null); fetchOrders(); }}
        />
      )}

      {/* One-time payment settlement modal */}
      {showFullpaySettlement && selectedFullpayOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">一次付款结算</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">订单号：</span>
                <span className="font-mono">{selectedFullpayOrder.order_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">用户：</span>
                <span>{selectedFullpayOrder.user_name}</span>
              </div>
              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">预估重量：</span>
                  <span>{settlementData?.estimatedWeight}g</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">预估运费：</span>
                  <span>¥{settlementData?.estimatedFee?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">实际重量：</span>
                  <Input
                    type="number"
                    value={actualWeight}
                    onChange={(e) => setActualWeight(e.target.value)}
                    className="w-24 h-7 text-right"
                    placeholder="输入实际重量"
                  />
                </div>
              </div>
              {settlementData && actualWeight && (
                <div className="bg-gray-50 p-3 rounded border">
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-500">重量差异：</span>
                    <span className={settlementData.weightDiff > 0 ? 'text-orange-600 font-medium' : 'text-blue-600 font-medium'}>
                      {settlementData.weightDiff > 0 ? '+' : ''}{settlementData.weightDiff}g
                      ({actualWeight}g - {settlementData.estimatedWeight}g)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">运费差异：</span>
                    <span className={settlementData.feeDiff > 0 ? 'text-orange-600 font-medium' : 'text-blue-600 font-medium'}>
                      {settlementData.feeDiff > 0 ? '+' : '¥'}{Math.abs(settlementData.feeDiff).toLocaleString()} JPY
                    </span>
                  </div>
                  <div className="flex justify-between mt-2 pt-2 border-t">
                    <span className="font-semibold">结算状态：</span>
                    <span className={settlementData.feeDiff > 0 ? 'text-orange-600 font-bold' : settlementData.feeDiff < 0 ? 'text-blue-600 font-bold' : 'text-green-600 font-bold'}>
                      {settlementData.feeDiff > 0 ? '需补款' : settlementData.feeDiff < 0 ? '需退款' : '已结清'}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowFullpaySettlement(false);
                  setSelectedFullpayOrder(null);
                  setActualWeight("");
                }}
                className="flex-1"
              >
                取消
              </Button>
              <Button
                onClick={async () => {
                  if (!actualWeight) {
                    alert('请输入实际重量');
                    return;
                  }
                  setIsProcessing(true);
                  try {
                    const weight = parseFloat(actualWeight);
                    const res = await base44.functions.invoke('handleFullpayOnceSettlement', {
                      action: 'update_weight_and_calculate',
                      order_id: selectedFullpayOrder.id,
                      actual_weight_g: weight,
                      shipping_method_code: selectedFullpayOrder.fullpay_once_config?.shipping_method_code,
                      destination_country: selectedFullpayOrder.fullpay_once_config?.destination_country || selectedFullpayOrder.destination_country
                    });
                    
                    const calc = res.data?.calculation;
                    if (calc) {
                      const msg = calc.settlement_status === 'needs_supplement' 
                        ? `结算完成！需补款：¥${Math.abs(calc.fee_difference_jpy).toLocaleString()} JPY`
                        : calc.settlement_status === 'needs_refund'
                          ? `结算完成！需退款：¥${Math.abs(calc.fee_difference_jpy).toLocaleString()} JPY`
                          : '结算完成！运费已结清';
                      alert(msg);
                    }
                    
                    setShowFullpaySettlement(false);
                    setSelectedFullpayOrder(null);
                    setActualWeight("");
                    fetchOrders();
                  } catch (error) {
                    alert('结算失败：' + error.message);
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                disabled={isProcessing || !actualWeight}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {isProcessing ? '处理中...' : '确认结算'}
              </Button>
            </div>
          </div>
        </div>
      )}
      </TabsContent>
      <ConfirmDialog
        open={!!orderedConfirmOrder}
        onOpenChange={(open) => { if (!open) setOrderedConfirmOrder(null); }}
        title="确认已下单"
        description={`确定将订单"${orderedConfirmOrder?.product_name}"标记为已下单吗？${orderedConfirmOrder?.has_uploaded_screenshot === false ? '\n\n⚠️ 尚未上传完成购买后上传截图' : ''}`}
        confirmText="确认已下单"
        cancelText="取消"
        onConfirm={() => {
          if (orderedConfirmOrder) {
            handleQuickOrdered(orderedConfirmOrder);
            setOrderedConfirmOrder(null);
          }
        }}
      />
      <AlertDialog open={showBulkErrors} onOpenChange={setShowBulkErrors}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>部分操作失败</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {bulkErrors.map((msg, i) => (
                  <div key={i} className="text-sm text-red-600">· {msg}</div>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => { setShowBulkErrors(false); setBulkErrors([]); }}>
              知道了
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}