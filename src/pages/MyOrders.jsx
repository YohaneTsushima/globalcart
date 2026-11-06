import { useState, useEffect, useRef } from "react";
import { usePageSize } from "@/hooks/usePageSize";
import PaginationBar from "@/components/common/PaginationBar";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/hooks/useCurrentUser";

import { Package, RefreshCw, Search, CreditCard, Truck, CheckCircle, ChevronUp, ChevronDown, ChevronsUpDown, AlertCircle, Archive, ArchiveRestore, RotateCcw, Zap, X, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { Textarea } from "@/components/ui/textarea";
import { ImageWithViewer } from "@/components/common/ImageViewer";
import BulkPaymentModal from "@/components/orders/BulkPaymentModal";
import { matchStoreTagResult } from "@/lib/onlineStoreTag";
import { getPreferredLocale } from "@/lib/LocaleContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getStatusLabel, getStatusColor } from "@/lib/orderStatus";
import OrderDetailPanel from "@/components/orders/OrderDetailPanel";
import ColumnCustomizer from "@/components/orders/ColumnCustomizer";
import PaymentModal from "@/components/orders/PaymentModal";
import UserNotifyShipmentModal from "@/components/orders/UserNotifyShipmentModal";
import TransitNotifyShipmentModal from "@/components/orders/TransitNotifyShipmentModal";
import { getNotifyShipmentCache, setNotifyShipmentCache } from "@/lib/notifyShipmentCache";
import ShippingEditModal from "@/components/shippingpool/ShippingEditModal";
import ShippingPoolDetailModal from "@/components/shippingpool/ShippingPoolDetailModal";
import { updateTenantOrder } from "@/lib/tenantApi";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { Ticket } from "lucide-react";
import MyTicketOrders from "@/components/tickets/MyTicketOrders";
import { toast } from "sonner";
import { persistentToastError } from "@/lib/toastUtils.jsx";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from "@/components/ui/alert-dialog";

const STORAGE_KEY = "my_orders_columns";

const IS_DEV_MOCK = import.meta.env.VITE_DEV_MOCK === 'true';

const ALL_COLUMNS = [
  { key: "product_image_url", label: "商品图片", defaultVisible: true, sortable: false, isImage: true },
  { key: "order_number", label: "订单号", defaultVisible: true, sortable: true },
  { key: "product_name", label: "商品名", defaultVisible: true, sortable: true },
  { key: "payable_amount", label: "下单实付", defaultVisible: true, sortable: true },
  { key: "paid_amount", label: "已付总额", defaultVisible: false, sortable: true },
  { key: "weight_g", label: "订单重量", defaultVisible: true, sortable: true },
  { key: "order_status", label: "订单状态", defaultVisible: true, sortable: true },
  { key: "online_store_tag", label: "商城标签", defaultVisible: false, sortable: true },
  { key: "product_description", label: "商品描述", defaultVisible: false, sortable: true },
  { key: "arrival_photo_url", label: "入库图片", defaultVisible: false, sortable: false, isImage: true },
  { key: "purchase_screenshot_url", label: "购买截图", defaultVisible: false, sortable: false, isImage: true },
  { key: "admin_note", label: "管理员备注", defaultVisible: false, sortable: true },
  { key: "user_note", label: "用户备注", defaultVisible: false, sortable: true },
  { key: "payment_due_date", label: "付款截止日", defaultVisible: false, sortable: true },
  { key: "submit_date", label: "订单提交日", defaultVisible: false, sortable: true },
  { key: "purchased_date", label: "下单日", defaultVisible: false, sortable: true },
  { key: "in_warehouse_date", label: "入库日", defaultVisible: false, sortable: true },
  { key: "shipped_date", label: "发货日", defaultVisible: false, sortable: true },
];

const DEFAULT_COLUMNS = ALL_COLUMNS.map(c => ({ ...c, visible: c.defaultVisible }));

function loadColumns() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_COLUMNS;
    const parsed = JSON.parse(saved);
    const keyOrder = parsed.map(c => c.key);
    return [
      ...parsed.map(p => {
        const def = ALL_COLUMNS.find(c => c.key === p.key);
        if (!def) return null;
        return { ...def, visible: p.visible, ...(p.imageWidth ? { imageWidth: p.imageWidth } : {}), ...(p.showActual !== undefined ? { showActual: p.showActual } : {}), ...(p.showActualOnly !== undefined ? { showActualOnly: p.showActualOnly } : {}) };
      }).filter(Boolean),
      ...ALL_COLUMNS.filter(c => !keyOrder.includes(c.key)).map(c => ({ ...c, visible: c.defaultVisible })),
    ];
  } catch {
    return DEFAULT_COLUMNS;
  }
}

const STATUS_FILTERS = [
  { v: "all", l: "全部" },
  { v: "payment_pending", l: "待付款" },
  { v: "awaiting_payment_confirmation", l: "待付款确认" },
  { v: "paid", l: "已付款" },
  { v: "purchased", l: "已下单" },
  { v: "in_warehouse", l: "已入库" },
  { v: "in_storage", l: "暂存中" },
  { v: "transit_shipped", l: "中转地已发货" },
  { v: "notified_shipment", l: "已通知出货" },
  { v: "shipping_fee_pending", l: "待付运费" },
  { v: "transited", l: "已向中转地发出" },
  { v: "transit_forwarded", l: "中转地已发货" },
  { v: "transit_arrived", l: "中转地已收货" },
  { v: "shipped", l: "已发出" },
  { v: "delivered", l: "已收货" },
  { v: "cancelled", l: "已取消" },
];

function CellValue({ col, order }) {
  switch (col.key) {
    case "product_image_url": {
      const imgW = col.imageWidth || 40;
      return order.product_image_url
        ? <ImageWithViewer src={order.product_image_url} alt={order.product_name}>
            <img src={order.product_image_url} alt="" style={{ maxWidth: imgW, maxHeight: imgW, width: "100%", height: "auto" }} className="rounded-lg object-cover border border-gray-100 cursor-pointer" />
          </ImageWithViewer>
        : <div style={{ width: imgW, height: imgW }} className="rounded-lg bg-gray-100 flex items-center justify-center">
            <Package className="w-5 h-5 text-gray-300" />
          </div>;
    }
    case "order_number": {
      const isSplitPending = order.has_split_marker && !order.parent_order_id && order.split_index !== -1;
      return <span className="font-mono text-xs text-gray-500">{order.order_number ? `${order.order_number}${isSplitPending ? " - 00" : ""}` : "-"}</span>;
    }
    case "product_name":
      return (
        <TooltipProvider delayDuration={1000}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm font-medium text-gray-900 truncate block">{order.product_name}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p>{order.product_name}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    case "payable_amount": {
      if (order.order_status === "payment_pending" || order.order_status === "awaiting_payment_confirmation") {
        return <span className="text-sm text-gray-400">-</span>;
      }
      const amt = order.payable_amount;
      const cur = order.payment_currency || order.prepayment_currency || "JPY";
      if (!amt || amt <= 0) {
        const legacy = order.prepayment_amount_jpy || order.paid_amount || order.full_payment_amount;
        if (!legacy) return <span className="text-sm text-gray-700">-</span>;
        if (cur === "CNY") {
          const num = parseFloat(legacy);
          const display = num % 1 === 0 ? String(num) : String(parseFloat(num.toFixed(2)));
          return <span className="text-sm text-gray-700">{`${display} yuan`}</span>;
        }
        return <span className="text-sm text-gray-700">{`${Math.round(legacy).toLocaleString()} yen`}</span>;
      }
      if (cur === "CNY") {
        const num = parseFloat(amt);
        const display = num % 1 === 0 ? String(num) : String(parseFloat(num.toFixed(2)));
        return <span className="text-sm text-gray-700 font-medium">{`${display} yuan`}</span>;
      }
      return <span className="text-sm text-gray-700 font-medium">{`${Math.round(amt).toLocaleString()} yen`}</span>;
    }
    case "weight_g":
      return <span className="text-sm text-gray-700">{order.weight_g ? `${order.weight_g}g` : "-"}</span>;
    case "order_status":
      return (
        <Badge className={`text-xs ${getStatusColor(order.order_status, "user")}`}>
          {getStatusLabel(order.order_status, "user")}
        </Badge>
      );
    case "product_description":
      return <span className="text-xs text-gray-600 line-clamp-2 max-w-[200px]">{order.product_description || "-"}</span>;
    case "arrival_photo_url": {
      const imgW2 = col.imageWidth || 40;
      return order.arrival_photo_url
        ? <ImageWithViewer src={order.arrival_photo_url} alt="入库图片">
            <img src={order.arrival_photo_url} alt="" style={{ maxWidth: imgW2, maxHeight: imgW2, width: "100%", height: "auto" }} className="rounded object-cover border border-gray-100 cursor-pointer" />
          </ImageWithViewer>
        : <span className="text-xs text-gray-300">-</span>;
    }
    case "purchase_screenshot_url": {
      const imgW3 = col.imageWidth || 40;
      return order.purchase_screenshot_url
        ? <ImageWithViewer src={order.purchase_screenshot_url} alt="购买截图">
            <img src={order.purchase_screenshot_url} alt="" style={{ maxWidth: imgW3, maxHeight: imgW3, width: "100%", height: "auto" }} className="rounded object-cover border border-gray-100 cursor-pointer" />
          </ImageWithViewer>
        : <span className="text-xs text-gray-300">-</span>;
    }
    case "admin_note":
      return <span className="text-xs text-gray-600 line-clamp-2 max-w-[200px]">{order.admin_note || "-"}</span>;
    case "user_note":
      return <span className="text-xs text-gray-600 line-clamp-2 max-w-[200px]">{order.user_note || "-"}</span>;
    case "payment_due_date":
      return <span className="text-xs text-gray-700">{order.payment_due_date ? new Date(order.payment_due_date).toLocaleDateString("zh-CN") : "-"}</span>;
    case "submit_date":
      return <span className="text-xs text-gray-700">{order.created_date ? new Date(order.created_date).toLocaleDateString("zh-CN") : "-"}</span>;
    case "online_store_tag": {
      const tagRules = col._rules || [];
      const firstUrl = (order.product_url || "").split("\n").map(s => s.trim()).filter(Boolean)[0] || "";
      const tagResult = matchStoreTagResult(firstUrl, tagRules);
      return <Badge className={`text-xs ${tagResult.tag_color}`}>{tagResult.tag_label}</Badge>;
    }
    case "purchased_date":

      return <span className="text-xs text-gray-700">{order.purchased_date ? new Date(order.purchased_date).toLocaleDateString("zh-CN") : "-"}</span>;
    case "in_warehouse_date":
      return <span className="text-xs text-gray-700">{order.in_warehouse_date ? new Date(order.in_warehouse_date).toLocaleDateString("zh-CN") : "-"}</span>;
    case "shipped_date":
      return <span className="text-xs text-gray-700">{order.shipped_date ? new Date(order.shipped_date).toLocaleDateString("zh-CN") : "-"}</span>;
    case "paid_amount": {
      const amt = order.paid_amount;
      if (!amt || amt <= 0) return <span className="text-sm text-gray-400">-</span>;
      const cur = order.payment_currency || order.prepayment_currency || "JPY";
      if (cur === "CNY") {
        const num = parseFloat(amt);
        const display = num % 1 === 0 ? String(num) : String(parseFloat(num.toFixed(2)));
        return <span className="text-sm text-gray-700">{`${display} yuan`}</span>;
      }
      return <span className="text-sm text-gray-700">{`${Math.round(amt).toLocaleString()} yen`}</span>;
    }
    default:
      return "-";
  }
}

export default function MyOrders() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useCurrentUser();
  const { can } = usePermissions();
  const canArchiveOrder = can("order:archive_order");
  const canRequestRewarehouse = can("shipping:request_rewarehouse");
  const canEditShipmentRequest = can("shipping:edit_shipment_request");
  const canNotifyShipment = can("shipping:notify_shipment");
  
  // 读取 URL 参数自动切换 tab
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab') === 'ticket' ? 'ticket' : 'physical';
  const [activeTab, setActiveTab] = useState(initialTab);
  
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [ticketOrders, setTicketOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alipayReturnMsg, setAlipayReturnMsg] = useState(null);
  const [bulkErrors, setBulkErrors] = useState([]);
  const [showBulkErrors, setShowBulkErrors] = useState(false);

  // Handle Alipay sync return: clean up URL params and show a notice
  const [isAlipayReturn, setIsAlipayReturn] = useState(() => {
    // Check synchronously at init time before any history manipulation
    return !!new URLSearchParams(window.location.search).get("out_trade_no");
  });
  const [alipayTradeNo] = useState(() => {
    return new URLSearchParams(window.location.search).get("out_trade_no") || null;
  });

  useEffect(() => {
    if (alipayTradeNo) {
      setAlipayReturnMsg(`支付宝付款已提交${alipayTradeNo ? `（单号: ${alipayTradeNo}）` : ''}，系统将在数分钟内自动确认订单状态。`);
      window.history.replaceState({}, "", window.location.pathname);
      // If this tab was opened as a popup by the payment flow, close it and let the opener refresh
      if (window.opener && !window.opener.closed) {
        try {
          // Notify the opener to refresh orders
          window.opener.postMessage({ type: "alipay_payment_done", tradeNo: alipayTradeNo }, "*");
        } catch (_) {}
        window.close();
      }
    }
  }, []);


  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [shipmentOrder, setShipmentOrder] = useState(null);
  const [shipmentOrders, setShipmentOrders] = useState(null); // multi-order bulk
  const [shipmentInitialData, setShipmentInitialData] = useState(null); // data from findOrderForNotifyShipment
  // in_storage 订单申请中转地发货（精简弹窗）
  const [transitShipmentOrder, setTransitShipmentOrder] = useState(null);
  const [transitShipmentOrders, setTransitShipmentOrders] = useState(null);
  const [transitShipmentInitialData, setTransitShipmentInitialData] = useState(null);
  const [shipmentLoading, setShipmentLoading] = useState(false); // loading state for notify shipment API call
  const [bulkPaymentOrders, setBulkPaymentOrders] = useState(null); // multi-order bulk payment
  const [editShipOrder, setEditShipOrder] = useState(null); // order being edit-shipped
  const [editShipPool, setEditShipPool] = useState(null); // current pool of that order
  const [viewPool, setViewPool] = useState(null); // pool detail modal for shipping_fee_pending
  const [shippingPools, setShippingPools] = useState([]); // cached pools for lookup
  const [allowUserRewarehouse, setAllowUserRewarehouse] = useState(false);
  const [allowSplitAfterWarehouse, setAllowSplitAfterWarehouse] = useState(false);
  const [rewarehouseOrder, setRewarehouseOrder] = useState(null); // order for rewarehouse confirm dialog
  const [rewarehouseNote, setRewarehouseNote] = useState("");
  const [submittingRewarehouse, setSubmittingRewarehouse] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [columns, setColumns] = useState(loadColumns);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [storeTagRules, setStoreTagRules] = useState([]);

  const [showArchived, setShowArchived] = useState(false);
  const { pageSize, setPageSize, currentPage, setCurrentPage, resetPage, PAGE_SIZES } = usePageSize("my_orders_page_size", 20);
  const [pageData, setPageData] = useState({});
  const [pendingEditRequests, setPendingEditRequests] = useState([]);
  const [archiveTargetOrder, setArchiveTargetOrder] = useState(null);
  const [deliverTargetOrder, setDeliverTargetOrder] = useState(null);
  const [bulkDeliverOrders, setBulkDeliverOrders] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchingRef = useRef(false);
  const fetchOrders = async (u, overridePage) => {
    if (!u || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);

    if (IS_DEV_MOCK) {
      const data = MOCK_PAGE_DATA;
      setOrders(data.orders || []);
      setTicketOrders(data.ticketOrders || []);
      setShippingPools(data.pools || []);
      setAllowUserRewarehouse(data.allowUserRewarehouse || false);
      setAllowSplitAfterWarehouse(data.allowSplitAfterWarehouse || false);
      setStoreTagRules(data.storeTagRules || []);
      setPageData(data);
      setPendingEditRequests(data.pendingEditRequests || []);
      fetchingRef.current = false;
      setLoading(false);
      return;
    }

    const r = await base44.functions.invoke('order/info/getMyOrdersPageData', {
      page: overridePage ?? currentPage,
      pageSize,
      status: statusFilter,
      search,
      sortKey: sortKey || undefined,
      sortDir: sortDir || undefined,
      showArchived,
    });
    
    const data = r.data || {};
    // 后端 camelCase → 前端 snake_case 字段统一
    const normalizeOrder = (o) => o ? ({
      ...o,
      quantity: o.quantity ?? 1,
      prepayment_amount: o.prepayment_amount ?? o.prepayment_amount_jpy ?? 0,
      prepayment_currency: o.prepayment_currency || "JPY",
      paid_amount: o.paid_amount ?? 0,
      paid_amount_jpy: o.paid_amount_jpy ?? null,
      order_stage_payment_jpy: o.order_stage_payment_jpy ?? o.prepayment_amount_jpy ?? null,
    }) : o;
    // grouping_orders: [{ order: {...}|null, pool_orders: [...] }]，按池分组
    const rawGroups = data.grouping_orders || [];
    const freshGroups = rawGroups.map(g => ({
      order: normalizeOrder(g.order),
      pool_orders: (g.pool_orders || []).map(normalizeOrder),
    }));
    setOrders(freshGroups);
    setTotal(data.total || 0);
    setTicketOrders(data.ticketOrders || []);
    setShippingPools(data.pools || []);
    setAllowUserRewarehouse(data.allowUserRewarehouse || false);
    setAllowSplitAfterWarehouse(data.allowSplitAfterWarehouse || false);
    setStoreTagRules(data.storeTagRules || []);
    setPageData(data);
    setPendingEditRequests(data.pendingEditRequests || []);
    fetchingRef.current = false;
    isInitialized.current = true;
    setLoading(false);
  };

  // ── 数据加载 ────────────────────────────────────────────────────────────────
  const searchTimerRef = useRef(null);
  const isInitialized = useRef(false);

  // 首次加载
  useEffect(() => {
    if (!user) { if (!authLoading) setLoading(false); return; }
    fetchOrders(user);
  }, [user, authLoading]);

  // 筛选/排序变化 → 重置页码并拉取
  useEffect(() => {
    if (!isInitialized.current) return;
    resetPage();
    fetchOrders(user, 1);
  }, [statusFilter, showArchived, sortKey, sortDir]);

  // 搜索防抖 → 400ms 后拉取
  useEffect(() => {
    if (!isInitialized.current) return;
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      resetPage();
      fetchOrders(user, 1);
    }, 400);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  // 分页变化 → 拉取
  useEffect(() => {
    if (!isInitialized.current) return;
    fetchOrders(user);
  }, [currentPage, pageSize]);

  // On Alipay return: the page was fully reloaded, so auth may not be ready on first render.
  // We wait for user to be ready, then fetch. Also retry once after 3s for the callback to settle.
  useEffect(() => {
    if (!isAlipayReturn || !user) return;
    // Immediate fetch (user is now ready)
    fetchOrders(user);
    // Retry after 3s in case alipay callback hasn't updated the order yet
    const timer = setTimeout(() => fetchOrders(user), 3000);
    return () => clearTimeout(timer);
  }, [isAlipayReturn, user?.email]);

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

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  /**
   * 申请发货
   * @param {*} order 
   */
  const handleConfirmDelivered = async (orders) => {
    setActionLoading(true);
    try {
      // orders: 订单数组（pool_orders / 单订单数组），原样传给后端，payload 由后端设置
      const list = Array.isArray(orders) ? orders : [orders];

      let payload = list.map(o => ({
        id: o.id,
        data: {
          id: o.id,
          order_number: o.order_number,
          consolidation_pool_id: o.consolidation_pool_id
        }
        
      }));

      const res = await updateTenantOrder('order/info/handleDelivered', payload);
      const innerCode = res?.data?.code;

      if (innerCode === 200) {
        toast.success(list.length > 1 ? `整组共 ${list.length} 件收货成功` : `订单 [${list[0]?.order_number}] 收货成功`);
      } else {
        const errors = res?.data?.errorInfo?.errors || [];
        if (errors.length > 0) {
          setBulkErrors(errors.map(e => e.errorMessage));
          setShowBulkErrors(true);
        } else {
          persistentToastError(res?.data?.message || "操作失败");
        }
      }
      fetchOrders(user);
    } finally {
      setActionLoading(false);
    }
  };

  // 批量操作包装函数
  const withBulkLabel = async (label, fn) => {
    setActionLoading(true);
    try {
      await fn();
    } finally {
      setActionLoading(false);
    }
  };

  // 批量操作公共函数
  const handleBulkAction = (label, url, toastMsg, sourceList) =>
    withBulkLabel(label, async () => {
      if (sourceList.length === 0) return;
      const payload = sourceList.map(o => ({
        id: o.id,
        data: {
          order_number: o.order_number,
          consolidation_pool_id: o.pool?.pool_id
        }
      }));
      const res = await updateTenantOrder(url, payload);
      const innerCode = res?.data?.code;
      if (innerCode === 200) {
        toast.success(toastMsg);
      } else {
        const errors = res?.data?.errorInfo?.errors || [];
        if (errors.length > 0) {
          setBulkErrors(errors.map(e => e.errorMessage));
          setShowBulkErrors(true);
        } else {
          persistentToastError(res?.data?.message || "操作失败");
        }
      }
      setBulkDeliverOrders(null);
      setSelectedIds([]);
      fetchOrders(user);
    });

  const handleBatchConfirmDelivered = (orders) =>
    handleBulkAction("正在确认收货...", "order/info/handleDelivered", "批量收货成功", orders);

  const handleArchiveOrder = async (target) => {
    setActionLoading(true);
    try {
      // 支持单个 order 或多商品组 { pool_orders: [...] }，一次存档整组
      const ids = Array.isArray(target?.pool_orders)
        ? target.pool_orders.map(o => o.id)
        : [target.id];
      const payload = ids.map(id => ({ id }));

      await base44.functions.invoke('order/info/handleArchive', payload);
      fetchOrders(user);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkArchive = () => {
    const deliveredSelected = orders.filter(o => selectedIds.includes(o.id) && o.order_status === "delivered" && !o.is_archived);
    return handleBulkAction("正在存档...", "order/info/handleArchive", "批量存档成功", deliveredSelected);
  };

  // 后端已分页，orders（分组项）就是当前页数据
  const filtered = orders;
  const visibleCols = columns.filter(c => c.visible);

  // Pagination — 后端已分页，直接用 orders
  const pagedFiltered = orders;

  // 拍平所有订单（单商品 order + 多商品 pool_orders），供批量筛选/全选用
  const flatOrders = orders.flatMap(g => (g.order ? [g.order] : (g.pool_orders || [])));

  // Orders eligible for bulk notify (in_warehouse only) — operate on full filtered, not paged
  const inWarehouseOrders = flatOrders.filter(o => o.order_status === "in_warehouse");
  const selectedInWarehouse = flatOrders.filter(o => selectedIds.includes(o.id) && o.order_status === "in_warehouse");
  // in_storage orders eligible for bulk transit re-shipment
  const inStorageOrders = flatOrders.filter(o => o.order_status === "in_storage");
  const selectedInStorage = flatOrders.filter(o => selectedIds.includes(o.id) && o.order_status === "in_storage");

  // Orders eligible for bulk payment
  const paymentPendingOrders = flatOrders.filter(o => o.order_status === "payment_pending" && o.payment_status !== "awaiting_confirmation");
  const selectedPaymentPending = flatOrders.filter(o => selectedIds.includes(o.id) && o.order_status === "payment_pending" && o.payment_status !== "awaiting_confirmation");

  // Orders eligible for bulk archive (only if user has archive permission)
  const deliveredOrders = canArchiveOrder ? flatOrders.filter(o => o.order_status === "delivered" && !o.is_archived) : [];
  const selectedDelivered = canArchiveOrder ? flatOrders.filter(o => selectedIds.includes(o.id) && o.order_status === "delivered" && !o.is_archived) : [];

  // Orders eligible for bulk confirm delivery
  const bulkDeliverStatuses = ["shipped", "transit_shipped", "transit_forwarded"];
  const shippedOrders = flatOrders.filter(o => bulkDeliverStatuses.includes(o.order_status));
  const selectedShipped = flatOrders.filter(o => selectedIds.includes(o.id) && bulkDeliverStatuses.includes(o.order_status));

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // 整组选中/取消（多商品组 checkbox）：把 pool_orders 所有 id 并入/移出 selectedIds
  const toggleGroup = (group) => {
    const ids = (group.pool_orders || []).map(o => o.id);
    const allSelected = ids.every(id => selectedIds.includes(id));
    if (allSelected) setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
    else setSelectedIds(prev => [...new Set([...prev, ...ids])]);
  };

  const toggleAllInWarehouse = () => {
    const ids = inWarehouseOrders.map(o => o.id);
    const allSelected = ids.every(id => selectedIds.includes(id));
    if (allSelected) setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
    else setSelectedIds(prev => [...new Set([...prev, ...ids])]);
  };

  const toggleAllPaymentPending = () => {
    const ids = paymentPendingOrders.map(o => o.id);
    const allSelected = ids.every(id => selectedIds.includes(id));
    if (allSelected) setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
    else setSelectedIds(prev => [...new Set([...prev, ...ids])]);
  };

  // 单商品订单的操作列（分支①）：完整 per-order 操作
  const renderOrderActions = (order) => (
    <div className="flex flex-col gap-1">
      {(order.unread_roles || []).includes("user") && (
        <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full font-medium animate-pulse w-fit">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />新消息
        </span>
      )}
      {(order.pool?.pool_code || order.pool_code) && (
        <button
          className="text-xs font-mono text-purple-700 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded hover:bg-purple-100 hover:border-purple-300 transition-colors cursor-pointer"
          onClick={() => setViewPool(order.pool)}>
          {order.pool?.pool_code || order.pool_code}
        </button>
      )}
      {order.order_status === "payment_pending" && order.payment_status !== "awaiting_confirmation" && (() => {
        const isFullPayOnce = order.payment_mode === "fullpay_once";
        return (
          <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700" onClick={() => setPaymentOrder(order)}>
            <CreditCard className="w-3 h-3 mr-1" />{isFullPayOnce ? "全额付款" : "付款"}
          </Button>
        );
      })()}
      {order.order_status === "in_warehouse" && canNotifyShipment && (() => {
        const editRequest = order.edit_request;
        const orderId = String(order.id);
        const hasPendingAdd = Array.isArray(editRequest) && editRequest.some(r => String(r.order_id) === orderId && r.status === 'pending' && r.edit_type === 'add_to_pool');
        if (hasPendingAdd) {
          return (
            <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 border border-orange-300 px-1.5 py-0.5 rounded-full font-medium">
              <AlertCircle className="w-3 h-3" />等待管理员批准添加包裹出货
            </span>
          );
        }
        return (
          <Button size="sm" className="h-7 text-xs bg-teal-600 hover:bg-teal-700"
            disabled={shipmentLoading}
            onClick={async () => {
              const orderIds = [order.id];
              const cached = getNotifyShipmentCache(orderIds);
              if (cached) { setShipmentInitialData(cached); setShipmentOrder(order); return; }
              setShipmentLoading(true);
              try {
                const r = await base44.functions.invoke('order/info/findOrderForNotifyShipment', { id: null, data: { order_ids: orderIds } });
                setNotifyShipmentCache(orderIds, r.data);
                setShipmentInitialData(r.data);
                setShipmentOrder(order);
              } catch (err) {
                persistentToastError('获取发货信息失败');
              } finally {
                setShipmentLoading(false);
              }
            }}>
            {shipmentLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Truck className="w-3 h-3 mr-1" />}
            {shipmentLoading ? '加载中...' : '通知发货'}
          </Button>
        );
      })()}
      {order.order_status === "in_storage" && (
        <div className="flex flex-col gap-1 items-start">
          <span className="inline-flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full font-medium">
            📦 暂存中{order.transit_location_name ? `于 ${order.transit_location_name}` : ''}
          </span>
          {order.transit_storage_until && (
            <span className="text-xs text-gray-400">期限至 {order.transit_storage_until}</span>
          )}
          {canNotifyShipment && (
            <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700"
              disabled={shipmentLoading}
              onClick={async () => {
                const orderIds = [order.id];
                const cached = getNotifyShipmentCache(orderIds);
                if (cached) { setTransitShipmentInitialData(cached); setTransitShipmentOrder(order); return; }
                setShipmentLoading(true);
                debugger
                try {
                  const r = await base44.functions.invoke('order/info/findTransitForShipment', {
                    id: null,
                    data: {
                      transit_location_id: order.pool?.transit_location_id || order.transit_location_id || null,
                      user_email: order.user_email,
                      pool_id: order.consolidation_pool_id || order.pool?.pool_id || null,
                    }
                  });
                  setNotifyShipmentCache(orderIds, r.data);
                  setTransitShipmentInitialData(r.data);
                  setTransitShipmentOrder(order);
                } catch (err) {
                  persistentToastError('获取发货信息失败');
                } finally {
                  setShipmentLoading(false);
                }
              }}>
              {shipmentLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Truck className="w-3 h-3 mr-1" />}
              {shipmentLoading ? '加载中...' : '申请中转地发货'}
            </Button>
          )}
        </div>
      )}
      {(order.order_status === "transit_shipped" || order.order_status === "transit_forwarded") && (() => {
        const orderId = String(order.id);
        const pool = order.pool;
        const poolOrderIds = pool?.order_ids || [];
        const otherPoolOrders = poolOrderIds.filter(id => String(id) !== orderId);
        return (
          <div className="flex flex-col gap-1 items-start">
            {order.id && !!order.transit_shipping && (
              <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={(e) => {
                  e.stopPropagation();
                  const url = `${window.location.origin}/${getPreferredLocale()}/TrackingQuery?order_id=${encodeURIComponent(order.id)}`;
                  window.open(url, '_blank');
                }}>
                <Truck className="w-3 h-3 mr-1" />查看物流
              </Button>
            )}
            {order.transit_tracking_number && (
              <span className="text-xs font-mono text-gray-600 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded select-all">
                {order.transit_tracking_number}
              </span>
            )}
            {order.transit_shipped_date && (
              <span className="text-xs text-gray-400">发货日 {new Date(order.transit_shipped_date).toLocaleDateString("zh-CN")}</span>
            )}
            <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
              onClick={async (e) => {
                e.stopPropagation();
                if (otherPoolOrders.length > 0) {
                  const confirmAll = window.confirm(
                    `此发货申请中还有其他 ${otherPoolOrders.length} 件包裹。\n\n点击"确定"一并确认所有包裹收货。\n点击"取消"仅确认此订单收货。`
                  );
                  if (confirmAll) {
                    await Promise.all(poolOrderIds.map(id =>
                      base44.functions.invoke('updateTenantOrder', { order_id: id, order_status: 'delivered' })
                    ));
                  } else {
                    await base44.functions.invoke('updateTenantOrder', { order_id: order.id, order_status: 'delivered' });
                  }
                } else {
                  await base44.functions.invoke('updateTenantOrder', { order_id: order.id, order_status: 'delivered' });
                }
                fetchOrders(user);
              }}>
              <CheckCircle className="w-3 h-3 mr-1" />收货
            </Button>
            {(() => {
              if (!pool) return null;
              const feeNotified = (pool.fee_breakdown_per_user || []).length > 0 || (pool.shipping_fee_jpy || 0) > 0;
              const myPay = (pool.per_user_payments || []).find(p => p.user_email === user?.email);
              const unpaid = pool.payment_status !== "paid" && !(myPay && myPay.payment_status === "paid") && feeNotified;
              return unpaid ? (
                <Button size="sm" className="h-7 text-xs bg-orange-600 hover:bg-orange-700"
                  onClick={(e) => { e.stopPropagation(); setViewPool(pool); }}>
                  <CreditCard className="w-3 h-3 mr-1" />补付运费
                </Button>
              ) : null;
            })()}
          </div>
        );
      })()}
      {order.order_status === "transited" && (
        <span className="inline-flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full font-medium w-fit">
          <Truck className="w-2.5 h-2.5" />已向中转地发货
        </span>
      )}
      {false && order.order_status === "in_warehouse" && order.pre_shipment && !order.pre_shipment.pool_created && (
        <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium w-fit">
          <Zap className="w-2.5 h-2.5" />已预出货
        </span>
      )}
      {order.order_status === "notified_shipment" && (() => {
        const orderId = String(order.id);
        const pool = order?.pool;
        const editRequest = order.edit_request;
        const hasPendingEdit = editRequest.some(r => String(r.order_id) === orderId && r.status === 'pending');
        const poolAwaitingPayment = pool?.id && (pool?.status === "awaiting_payment" || pool?.status === "awaiting_payment_confirmation");
        return (
          <div className="flex flex-col gap-1 items-start">
            {hasPendingEdit && (<span className="text-xs text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded flex items-center gap-1">⏳ 申请更改中</span>)}
            {poolAwaitingPayment && (<Button size="sm" className="h-7 text-xs bg-orange-600 hover:bg-orange-700" onClick={() => setViewPool(pool)}><CreditCard className="w-3 h-3 mr-1" />去付运费</Button>)}
            {canEditShipmentRequest && pool?.pool_status !== "shipped" && pool?.pool_status !== "delivered" && !hasPendingEdit && !poolAwaitingPayment && (
              <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => { setEditShipOrder(order); setEditShipPool(pool); }}>编辑出货</Button>
            )}
          </div>
        );
      })()}
      {(order.order_status === "shipping_fee_pending" || order.order_status === "notified_shipment_fee_pending") && (() => {
        const orderId = String(order.id);
        const pool = order.pool;
        if (!pool?.pool_id) return null;
        const hasPendingRewarehouse = pendingEditRequests.some(r => String(r.order_id) === orderId && r.is_rewarehouse_request);
        return (
          <div className="flex flex-col gap-1 items-start">
            <Button size="sm" className="h-7 text-xs bg-orange-600 hover:bg-orange-700" onClick={() => setViewPool(pool)}>
              <CreditCard className="w-3 h-3 mr-1" />去付运费
            </Button>
            {allowUserRewarehouse && canRequestRewarehouse && !hasPendingRewarehouse && (
              <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-gray-500 border-gray-300" onClick={() => { setRewarehouseOrder({ order, pool }); setRewarehouseNote(""); }}>
                <RotateCcw className="w-3 h-3 mr-1" />申请再入库
              </Button>
            )}
            {hasPendingRewarehouse && (<span className="text-xs text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">⏳ 再入库审批中</span>)}
          </div>
        );
      })()}
      {order.order_status === "shipped" && (() => {
        const pool = order.pool;
        return (
          <div className="flex flex-col gap-1 items-start">
            {pool?.id && (
              <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setViewPool(pool)}>
                <Package className="w-3 h-3 mr-1" />发货详情
              </Button>
            )}
            {(() => {
              if (!pool?.pool_id) return null;
              const feeNotified = (pool?.fee_breakdown_per_user || []).length > 0 || (pool?.shipping_fee_jpy || 0) > 0;
              const myPay = (pool?.per_user_payments || []).find(p => p.user_email === user?.email);
              const unpaid = pool?.payment_status !== "paid" && !(myPay && myPay.payment_status === "paid") && feeNotified;
              return unpaid ? (
                <Button size="sm" className="h-7 text-xs bg-orange-600 hover:bg-orange-700" onClick={() => setViewPool(pool)}>
                  <CreditCard className="w-3 h-3 mr-1" />补付运费
                </Button>
              ) : null;
            })()}
            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => setDeliverTargetOrder([order])}>
              <CheckCircle className="w-3 h-3 mr-1" />收货
            </Button>
          </div>
        );
      })()}
      {order.order_status === "delivered" && !order.is_archived && canArchiveOrder && (
        <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-gray-500" onClick={() => setArchiveTargetOrder(order)}>
          <Archive className="w-3 h-3 mr-1" />存档
        </Button>
      )}
    </div>
  );

  // 多商品池组的操作列（分支②）：仅池级共享操作，收货一次作用整组
  const renderPoolActions = (group) => {
    const orders = group.pool_orders || [];
    const repr = orders[0] || {};
    const pool = repr.pool || {};
    const status = repr.order_status;
    return (
      <div className="flex flex-col gap-1">
        {status === "in_storage" && (
          <div className="flex flex-col gap-1 items-start">
            <span className="inline-flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full font-medium">
              📦 暂存中{repr.transit_location_name ? `于 ${repr.transit_location_name}` : ''}
            </span>
            {repr.transit_storage_until && (
              <span className="text-xs text-gray-400">期限至 {repr.transit_storage_until}</span>
            )}
            {canNotifyShipment && (
              <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700"
                disabled={shipmentLoading}
                onClick={async () => {
                  const orderIds = orders.map(o => o.id);
                  const cached = getNotifyShipmentCache(orderIds);
                  if (cached) { setTransitShipmentInitialData(cached); setTransitShipmentOrders(orders); return; }
                  setShipmentLoading(true);
                  try {
                    const r = await base44.functions.invoke('order/info/findTransitForShipment', {
                      id: null,
                      data: {
                        transit_location_id: repr.pool?.transit_location_id || repr.transit_location_id || null,
                        user_email: repr.user_email,
                        pool_id: repr.consolidation_pool_id || repr.pool?.pool_id || null,
                      }
                    });
                    setNotifyShipmentCache(orderIds, r.data);
                    setTransitShipmentInitialData(r.data);
                    setTransitShipmentOrders(orders);
                  } catch (err) {
                    persistentToastError('获取发货信息失败');
                  } finally {
                    setShipmentLoading(false);
                  }
                }}>
                {shipmentLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Truck className="w-3 h-3 mr-1" />}
                {shipmentLoading ? '加载中...' : '申请中转地发货'}
              </Button>
            )}
          </div>
        )}
        {(pool.pool_code || repr.pool_code) && (
          <button
            className="text-xs font-mono text-purple-700 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded hover:bg-purple-100 hover:border-purple-300 transition-colors cursor-pointer"
            onClick={() => setViewPool(pool)}>
            {pool.pool_code || repr.pool_code}
          </button>
        )}
        {(status === "transit_shipped" || status === "transit_forwarded" || status === "shipped") && repr.id && !!repr.transit_shipping && (
          <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-blue-600 border-blue-200 hover:bg-blue-50"
            onClick={(e) => {
              e.stopPropagation();
              const url = `${window.location.origin}/${getPreferredLocale()}/TrackingQuery?order_id=${encodeURIComponent(repr.id)}`;
              window.open(url, '_blank');
            }}>
            <Truck className="w-3 h-3 mr-1" />查看物流
          </Button>
        )}
        {repr.transit_tracking_number && (
          <span className="text-xs font-mono text-gray-600 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded select-all">
            {repr.transit_tracking_number}
          </span>
        )}
        {(status === "transit_shipped" || status === "transit_forwarded") && (
          <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
            onClick={(e) => { e.stopPropagation(); setDeliverTargetOrder(orders); }}>
            <CheckCircle className="w-3 h-3 mr-1" />整组确认收货
          </Button>
        )}
        {status === "shipped" && (
          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700"
            onClick={() => setDeliverTargetOrder(orders)}>
            <CheckCircle className="w-3 h-3 mr-1" />收货
          </Button>
        )}
        {status === "delivered" && !repr.is_archived && canArchiveOrder && (
          <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-gray-500"
            onClick={() => setArchiveTargetOrder(group)}>
            <Archive className="w-3 h-3 mr-1" />存档
          </Button>
        )}
        {(() => {
          if (!pool.pool_id) return null;
          const feeNotified = (pool.fee_breakdown_per_user || []).length > 0 || (pool.shipping_fee_jpy || 0) > 0;
          const myPay = (pool.per_user_payments || []).find(p => p.user_email === user?.email);
          const unpaid = pool.payment_status !== "paid" && !(myPay && myPay.payment_status === "paid") && feeNotified;
          return unpaid ? (
            <Button size="sm" className="h-7 text-xs bg-orange-600 hover:bg-orange-700" onClick={(e) => { e.stopPropagation(); setViewPool(pool); }}>
              <CreditCard className="w-3 h-3 mr-1" />补付运费
            </Button>
          ) : null;
        })()}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {alipayReturnMsg && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
          <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600" />
          <span>{alipayReturnMsg}</span>
          <button className="ml-auto text-green-500 hover:text-green-700" onClick={() => setAlipayReturnMsg(null)}>✕</button>
        </div>
      )}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="physical" className="gap-1.5"><Package className="w-3.5 h-3.5" />实物订单</TabsTrigger>
        <TabsTrigger value="ticket" className="gap-1.5"><Ticket className="w-3.5 h-3.5" />票务需求</TabsTrigger>
      </TabsList>

      <TabsContent value="ticket">
        <MyTicketOrders 
          orders={ticketOrders} 
          loading={loading}
          onRefresh={() => fetchOrders(user)}
          currentUser={user}
          userProfileMap={pageData.userProfileMap || {}}
        />
      </TabsContent>

      <TabsContent value="physical" className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold text-gray-900">我的订单</h1>
          <div className="flex items-center gap-2">
            <ColumnCustomizer columns={columns} onChange={handleColumnsChange} />
            <Button variant="outline" size="sm" onClick={() => { setShowArchived(v => !v); setSelectedIds([]); }}>
              {showArchived ? <><ArchiveRestore className="w-3.5 h-3.5 mr-1.5" />返回订单列表</> : <><Archive className="w-3.5 h-3.5 mr-1.5" />查看已存档</>}
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchOrders(user)}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />刷新
            </Button>
          </div>
        </div>

        <PaginationBar
          total={total}
          pageSize={pageSize}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onPageSizeChange={(s) => { setPageSize(s); resetPage(); }}
          className="mt-1"
        />

        {/* Filters */}
        <div className={`flex flex-wrap gap-2 items-center transition-opacity ${actionLoading ? "pointer-events-none opacity-50" : ""}`}>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input placeholder="搜索商品名、订单号..." className="pl-8 h-8 text-sm"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setSelectedIds([]); }}>
            <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
            </SelectContent>
          </Select>
          {(search || statusFilter !== "all") && (
            <button
              onClick={() => { setSearch(""); setStatusFilter("all"); resetPage(); }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 h-8 px-1 shrink-0"
            >
              <X className="w-3 h-3" />清除
            </button>
          )}
        </div>

      {/* Bulk action bars */}
      {selectedInWarehouse.length > 0 && canNotifyShipment && (
        <div className="flex items-center gap-3 bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5">
          <span className="text-sm text-teal-700 font-medium">已选 {selectedInWarehouse.length} 件已入库包裹</span>
          <Button size="sm" className="h-7 text-xs bg-teal-600 hover:bg-teal-700 ml-auto"
            disabled={actionLoading || shipmentLoading}
            onClick={async () => {
              const orderIds = selectedInWarehouse.map(o => o.id);
              const cached = getNotifyShipmentCache(orderIds);
              if (cached) {
                setShipmentInitialData(cached);
                setShipmentOrders(selectedInWarehouse);
                return;
              }
              setShipmentLoading(true);
              try {
                const r = await base44.functions.invoke('order/info/findOrderForNotifyShipment', {
                  id: null, data: { order_ids: orderIds }
                });
                setNotifyShipmentCache(orderIds, r.data);
                setShipmentInitialData(r.data);
                setShipmentOrders(selectedInWarehouse);
              } catch (err) {
                persistentToastError('获取发货信息失败');
              } finally {
                setShipmentLoading(false);
              }
            }}>
            {shipmentLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Truck className="w-3 h-3 mr-1" />}
            {shipmentLoading ? '加载中...' : '批量通知发货'}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs"
            onClick={() => setSelectedIds([])} disabled={actionLoading}>取消</Button>
        </div>
      )}
      {selectedInStorage.length > 0 && canNotifyShipment && (
        <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5">
          <span className="text-sm text-indigo-700 font-medium">已选 {selectedInStorage.length} 件暂存包裹</span>
          <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 ml-auto"
            disabled={actionLoading || shipmentLoading}
            onClick={async () => {
              const orderIds = selectedInStorage.map(o => o.id);
              const cached = getNotifyShipmentCache(orderIds);
              if (cached) {
                setTransitShipmentInitialData(cached);
                setTransitShipmentOrders(selectedInStorage);
                return;
              }
              setShipmentLoading(true);
              try {
                const r = await base44.functions.invoke('order/info/findOrderForNotifyShipment', {
                  id: null, data: { order_ids: orderIds }
                });
                setNotifyShipmentCache(orderIds, r.data);
                setTransitShipmentInitialData(r.data);
                setTransitShipmentOrders(selectedInStorage);
              } catch (err) {
                persistentToastError('获取发货信息失败');
              } finally {
                setShipmentLoading(false);
              }
            }}>
            {shipmentLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Truck className="w-3 h-3 mr-1" />}
            {shipmentLoading ? '加载中...' : '批量申请中转地发货'}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs"
            onClick={() => setSelectedIds([])} disabled={actionLoading}>取消</Button>
        </div>
      )}
      {selectedPaymentPending.length > 1 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
          <span className="text-sm text-red-700 font-medium">已选 {selectedPaymentPending.length} 笔待付款订单</span>
          <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700 ml-auto"
            onClick={() => setBulkPaymentOrders(selectedPaymentPending)} disabled={actionLoading}>
            <CreditCard className="w-3 h-3 mr-1" />批量付款
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs"
            onClick={() => setSelectedIds([])} disabled={actionLoading}>取消</Button>
        </div>
      )}
      {selectedDelivered.length > 0 && (
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
          <span className="text-sm text-gray-700 font-medium">已选 {selectedDelivered.length} 件已收货订单</span>
          <Button size="sm" className="h-7 text-xs bg-gray-600 hover:bg-gray-700 ml-auto"
            onClick={handleBulkArchive} disabled={actionLoading}>
            <Archive className="w-3 h-3 mr-1" />批量存档
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs"
            onClick={() => setSelectedIds([])} disabled={actionLoading}>取消</Button>
        </div>
      )}
      {selectedShipped.length > 0 && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
          <span className="text-sm text-green-700 font-medium">已选 {selectedShipped.length} 件已发出订单</span>
          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 ml-auto"
            onClick={() => setBulkDeliverOrders(selectedShipped)} disabled={actionLoading}>
            <CheckCircle className="w-3 h-3 mr-1" />批量收货
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs"
            onClick={() => setSelectedIds([])} disabled={actionLoading}>取消</Button>
        </div>
      )}

      {/* Orders table */}
      <div className="relative border border-gray-200 rounded-xl overflow-x-auto">
        {actionLoading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-xl">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin mb-2" />
            <span className="text-sm text-gray-600 font-medium">处理中...</span>
          </div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-8 px-3 py-2">
                {(inWarehouseOrders.length > 0 || paymentPendingOrders.length > 0 || deliveredOrders.length > 0 || shippedOrders.length > 0) && !showArchived && (
                  <Checkbox
                    checked={
                      [...inWarehouseOrders, ...paymentPendingOrders, ...deliveredOrders, ...shippedOrders].length > 0 &&
                      [...inWarehouseOrders, ...paymentPendingOrders, ...deliveredOrders, ...shippedOrders].every(o => selectedIds.includes(o.id))
                    }
                    onCheckedChange={() => {
                      const all = [...inWarehouseOrders, ...paymentPendingOrders, ...deliveredOrders, ...shippedOrders];
                      const allSelected = all.every(o => selectedIds.includes(o.id));
                      if (allSelected) setSelectedIds(prev => prev.filter(id => !all.map(o => o.id).includes(id)));
                      else setSelectedIds(prev => [...new Set([...prev, ...all.map(o => o.id)])]);
                    }}
                  />
                )}
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
              <tr>
                <td colSpan={visibleCols.length + 2} className="py-16">
                  <div className="flex flex-col items-center text-gray-400">
                    <Package className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">暂无订单</p>
                  </div>
                </td>
              </tr>
            ) : pagedFiltered.map(group => {
              const isPoolGroup = !group.order && (group.pool_orders || []).length > 0;
              if (!isPoolGroup) {
                // 分支①：单商品订单，照原单行
                const order = group.order;
                return (
                  <tr key={order.id} className={`hover:bg-gray-50 cursor-pointer ${selectedIds.includes(order.id) ? "bg-teal-50/50" : ""}`}
                    onClick={() => setSelectedOrder(order)}>
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      {!showArchived && (order.order_status === "in_warehouse" || order.order_status === "in_storage" || bulkDeliverStatuses.includes(order.order_status) || (order.order_status === "payment_pending" && order.payment_status !== "awaiting_confirmation") || (order.order_status === "delivered" && !order.is_archived)) && (
                        <Checkbox checked={selectedIds.includes(order.id)} onCheckedChange={() => toggleSelect(order.id)} />
                      )}
                    </td>
                    {visibleCols.map(col => (
                      <td key={col.key} className="px-3 py-3 max-w-[220px] overflow-hidden">
                        <CellValue col={{ ...col, _rules: storeTagRules }} order={order} />
                      </td>
                    ))}
                    <td className="px-3 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {renderOrderActions(order)}
                    </td>
                  </tr>
                );
              }
              // 分支②：同池多商品，每个 pool_order 一行；checkbox/状态/操作 用 rowspan 纵跨整组并居中
              const poolOrders = group.pool_orders;
              const repr = poolOrders[0];
              const span = poolOrders.length;
              const allGroupSelected = poolOrders.every(o => selectedIds.includes(o.id));
              const groupEligible = !showArchived && poolOrders.some(o =>
                o.order_status === "in_warehouse" || o.order_status === "in_storage" || bulkDeliverStatuses.includes(o.order_status) ||
                (o.order_status === "payment_pending" && o.payment_status !== "awaiting_confirmation") ||
                (o.order_status === "delivered" && !o.is_archived));
              return poolOrders.map((p, idx) => (
                <tr key={p.id} className={`hover:bg-gray-50 cursor-pointer ${allGroupSelected ? "bg-teal-50/50" : ""}`}
                  onClick={() => setSelectedOrder(p)}>
                  {/* checkbox：仅首行渲染，rowspan 纵跨整组，垂直居中 */}
                  {idx === 0 && (
                    <td className="px-3 py-3 align-middle" rowSpan={span} onClick={e => e.stopPropagation()}>
                      {groupEligible && (
                        <Checkbox checked={allGroupSelected} onCheckedChange={() => toggleGroup(group)} />
                      )}
                    </td>
                  )}
                  {/* 按表头列序渲染：商品类列每行独立；order_status 列仅首行 rowspan 居中 */}
                  {visibleCols.map(col => (
                    col.key === "order_status" ? (
                      idx === 0 ? (
                        <td key={col.key} className="px-3 py-3 align-middle" rowSpan={span}>
                          <Badge className={`text-xs ${getStatusColor(repr.order_status, "user")}`}>
                            {getStatusLabel(repr.order_status, "user")}
                          </Badge>
                        </td>
                      ) : null
                    ) : (
                      <td key={col.key} className="px-3 py-3 max-w-[220px]">
                        <CellValue col={{ ...col, _rules: storeTagRules }} order={p} />
                      </td>
                    )
                  ))}
                  {/* 操作：仅首行渲染，rowspan 纵跨整组，垂直居中 */}
                  {idx === 0 && (
                    <td className="px-3 py-3 whitespace-nowrap align-middle" rowSpan={span} onClick={e => e.stopPropagation()}>
                      {renderPoolActions(group)}
                    </td>
                  )}
                </tr>
              ));
            })}

          </tbody>
        </table>
      </div>

      <PaginationBar
        total={total}
        pageSize={pageSize}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onPageSizeChange={(s) => { setPageSize(s); resetPage(); }}
        className="mt-1"
      />

      {selectedOrder && user && (
        <OrderDetailPanel
          orderId={selectedOrder.id}
          currentUser={user}
          allowSplitAfterWarehouse={allowSplitAfterWarehouse}
          onClose={() => setSelectedOrder(null)}
          onRefresh={() => {
            fetchOrders(user);
            setSelectedOrder(null);
          }}
        />
      )}

      {paymentOrder && (
        <PaymentModal
          orderId={paymentOrder?.id}
          mode={paymentOrder?.payment_mode}
          onClose={() => setPaymentOrder(null)}
          onSuccess={() => {
            setPaymentOrder(null);
            fetchOrders(user);
          }}
        />
      )}

      {transitShipmentOrder && (
        <TransitNotifyShipmentModal
          order={transitShipmentOrder}
          initialData={transitShipmentInitialData}
          onClose={() => { setTransitShipmentOrder(null); setTransitShipmentInitialData(null); }}
          onSuccess={() => {
            setTransitShipmentOrder(null);
            setTransitShipmentInitialData(null);
            fetchOrders(user);
          }}
        />
      )}
      {transitShipmentOrders && (
        <TransitNotifyShipmentModal
          orders={transitShipmentOrders}
          initialData={transitShipmentInitialData}
          onClose={() => { setTransitShipmentOrders(null); setTransitShipmentInitialData(null); }}
          onSuccess={() => {
            setTransitShipmentOrders(null);
            setTransitShipmentInitialData(null);
            fetchOrders(user);
          }}
        />
      )}
      {shipmentOrder && (
        <UserNotifyShipmentModal
          order={shipmentOrder}
          initialData={shipmentInitialData}
          hazmatText={pageData.hazmatText || null}
          onClose={() => { setShipmentOrder(null); setShipmentInitialData(null); }}
          onSuccess={() => {
            setShipmentOrder(null);
            setShipmentInitialData(null);
            fetchOrders(user);
          }}
        />
      )}

      {shipmentOrders && (
        <UserNotifyShipmentModal
          orders={shipmentOrders}
          initialData={shipmentInitialData}
          hazmatText={pageData.hazmatText || null}
          onClose={() => { setShipmentOrders(null); setShipmentInitialData(null); }}
          onSuccess={() => {
            setShipmentOrders(null);
            setShipmentInitialData(null);
            setSelectedIds([]);
            fetchOrders(user);
          }}
        />
      )}

      {bulkPaymentOrders && (
        <BulkPaymentModal
          orders={bulkPaymentOrders}
          onClose={() => setBulkPaymentOrders(null)}
          onSuccess={() => {
            setBulkPaymentOrders(null);
            setSelectedIds([]);
            fetchOrders(user);
          }}
        />
      )}

      {viewPool && user && (
        <ShippingPoolDetailModal
          pool={viewPool}
          isAdmin={false}
          currentUser={user}
          allowUserRewarehouse={allowUserRewarehouse}
          onClose={() => { setViewPool(null); fetchOrders(user); }}
          onUpdated={() => { setViewPool(null); fetchOrders(user); }}
        />
      )}

      {editShipOrder && editShipPool && user && (
        <ShippingEditModal
          order={editShipOrder}
          currentPool={editShipPool}
          currentUser={user}
          onClose={() => { setEditShipOrder(null); setEditShipPool(null); }}
          onSuccess={() => {
            setEditShipOrder(null);
            setEditShipPool(null);
            fetchOrders(user);
          }}
        />
      )}

      {/* Rewarehouse confirm dialog */}
      {rewarehouseOrder && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onMouseDown={() => setRewarehouseOrder(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4" onMouseDown={e => e.stopPropagation()}>
            <div>
              <h3 className="font-semibold text-gray-900">申请再入库</h3>
              <p className="text-sm text-gray-500 mt-1">
                申请将订单 <span className="font-mono text-gray-700">{rewarehouseOrder.order.order_number}</span> 从发货申请中取消并重新入库。
              </p>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-xs text-orange-700 space-y-1">
              <p>⚠️ 管理员审批后，订单将恢复为「已入库」状态。</p>
              <p>管理员可能会收取再处理费用，此费用将在您下次提交发货申请时自动加算。</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">申请原因（可选）</label>
              <Textarea rows={2} placeholder="说明申请原因..." className="text-sm"
                value={rewarehouseNote} onChange={e => setRewarehouseNote(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setRewarehouseOrder(null)}>取消</Button>
              <Button size="sm" className="bg-orange-600 hover:bg-orange-700"
                disabled={submittingRewarehouse}
                onClick={async () => {
                  setSubmittingRewarehouse(true);
                  await base44.functions.invoke('userMutateShippingPool', {
                    action: 'rewarehouse_from_fee_pending',
                    pool_id: rewarehouseOrder.pool.id,
                    order_id: rewarehouseOrder.order.id,
                    user_note: rewarehouseNote,
                  });
                  setSubmittingRewarehouse(false);
                  setRewarehouseOrder(null);
                  fetchOrders(user);
                }}>
                {submittingRewarehouse ? "提交中..." : "确认申请"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deliverTargetOrder}
        onOpenChange={open => { if (!open) setDeliverTargetOrder(null); }}
        title="确认收货"
        description={deliverTargetOrder?.length > 1
          ? `是否确认该组共 ${deliverTargetOrder.length} 件订单收货？确认后订单状态将变为 已收货。`
          : "是否确认收货？确认后订单状态将变为 已收货。"}
        confirmText="是"
        onConfirm={() => { handleConfirmDelivered(deliverTargetOrder); setDeliverTargetOrder(null); }}
      />

      <ConfirmDialog
        open={!!bulkDeliverOrders}
        onOpenChange={open => { if (!open) setBulkDeliverOrders(null); }}
        title="确认收货"
        description={`是否确认 ${bulkDeliverOrders?.length || 0} 件订单收货？`}
        confirmText="确认"
        onConfirm={() => { handleBatchConfirmDelivered(bulkDeliverOrders); setBulkDeliverOrders(null); }}
      />

      <ConfirmDialog
        open={!!archiveTargetOrder}
        onOpenChange={open => { if (!open) setArchiveTargetOrder(null); }}
        title="确认存档"
        description={Array.isArray(archiveTargetOrder?.pool_orders)
          ? `是否将该组共 ${archiveTargetOrder.pool_orders.length} 件订单存档？存档后将从列表中隐藏。`
          : `是否将订单 ${archiveTargetOrder?.order_number} 存档？存档后将从列表中隐藏。`}
        confirmText="是"
        onConfirm={() => { handleArchiveOrder(archiveTargetOrder); setArchiveTargetOrder(null); }}
      />
      </TabsContent>
      </Tabs>

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
    </div>
  );
}