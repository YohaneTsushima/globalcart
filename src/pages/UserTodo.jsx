import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { t, getLocale } from "@/lib/i18n";
import { createPageUrl } from "@/utils";
import {
  Bell, CreditCard, Truck, Package,
  ClipboardList, RefreshCw, ArrowRight, MessageSquare,
  HelpCircle, Megaphone, CheckCircle2, Inbox
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PaymentModal from "@/components/orders/PaymentModal";
import UserNotifyShipmentModal from "@/components/orders/UserNotifyShipmentModal";
import OrderDetailDrawer from "@/components/orders/OrderDetailDrawer";
import ShippingPoolDetailModal from "@/components/shippingpool/ShippingPoolDetailModal";

const STATUS_LABEL = {
  pending_confirmation: "待确认", payment_pending: "待付款", paid: "已付款",
  pending_purchase: "待采购", purchased: "已采购", in_warehouse: "已入库",
  in_storage: "在仓", notified_shipment: "已通知出货", transit_shipped: "转运中",
  shipped: "已发货", delivered: "已签收", cancelled: "已取消", expired: "已超时",
};

function fmtJpy(v) {
  if (!v) return null;
  return `¥${Number(v).toLocaleString()}`;
}

// ─── Small stat pill ───────────────────────────────────────────────────────
function StatPill({ label, count, color }) {
  const colors = {
    red: "bg-red-50 text-red-700 border-red-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    teal: "bg-teal-50 text-teal-700 border-teal-200",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
    gray: "bg-gray-50 text-gray-500 border-gray-200",
  };
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${colors[color] || colors.gray}`}>
      <span>{label}</span>
      {count > 0 && <span className="font-bold">{count > 99 ? "99+" : count}</span>}
    </div>
  );
}

// ─── Section card ──────────────────────────────────────────────────────────
function Section({ icon: Icon, title, count, color, children, emptyText }) {
  const palette = {
    orange: { hdr: "bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200", dot: "bg-orange-500", icon: "text-orange-500", ring: "border-orange-200" },
    red:    { hdr: "bg-gradient-to-r from-red-50 to-rose-50 border-red-200",    dot: "bg-red-500",    icon: "text-red-500",    ring: "border-red-200" },
    blue:   { hdr: "bg-gradient-to-r from-blue-50 to-sky-50 border-blue-200",   dot: "bg-blue-500",   icon: "text-blue-500",   ring: "border-blue-200" },
    teal:   { hdr: "bg-gradient-to-r from-teal-50 to-cyan-50 border-teal-200",  dot: "bg-teal-500",   icon: "text-teal-500",   ring: "border-teal-200" },
    yellow: { hdr: "bg-gradient-to-r from-yellow-50 to-lime-50 border-yellow-200", dot: "bg-yellow-500", icon: "text-yellow-600", ring: "border-yellow-200" },
    gray:   { hdr: "bg-gray-50 border-gray-200",  dot: "bg-gray-400",   icon: "text-gray-500",   ring: "border-gray-200" },
  };
  const p = palette[color] || palette.gray;

  return (
    <div className={`rounded-2xl border ${p.ring} overflow-hidden bg-white shadow-sm`}>
      <div className={`flex items-center gap-2.5 px-4 py-3 border-b ${p.hdr}`}>
        <Icon className={`w-4 h-4 ${p.icon} flex-shrink-0`} />
        <span className="font-semibold text-gray-800 text-sm flex-1">{title}</span>
        {count > 0
          ? <span className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-xs font-bold text-white ${p.dot}`}>{count > 99 ? "99+" : count}</span>
          : <span className="text-xs text-gray-400">✓</span>
        }
      </div>
      <div className="divide-y divide-gray-50">
        {count === 0
          ? <div className="flex flex-col items-center gap-1.5 py-6 text-gray-400"><CheckCircle2 className="w-5 h-5 text-gray-300" /><span className="text-xs">{emptyText || "暂无待办"}</span></div>
          : children
        }
      </div>
    </div>
  );
}

// ─── Item row ──────────────────────────────────────────────────────────────
function Item({ icon: Icon, iconCls, label, sub, badge, action, onAction, onRowClick, checkbox, checked, onCheck, dimmed }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 transition-colors group ${onRowClick ? "cursor-pointer hover:bg-gray-50/80" : "hover:bg-gray-50/50"} ${checked ? "bg-blue-50/60" : ""} ${dimmed ? "opacity-60" : ""}`}
      onClick={onRowClick}
    >
      {checkbox && (
        <input type="checkbox" checked={!!checked} onChange={e => onCheck?.(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 accent-blue-600 flex-shrink-0 cursor-pointer"
          onClick={e => e.stopPropagation()} />
      )}
      {Icon && !checkbox && <Icon className={`w-4 h-4 flex-shrink-0 ${iconCls || "text-gray-400"}`} />}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate leading-tight">{label}</div>
        {sub && <div className="text-xs text-gray-400 truncate mt-0.5">{sub}</div>}
      </div>
      {badge && (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${badge.cls || "bg-gray-100 text-gray-600"}`}>
          {badge.text}
        </span>
      )}
      {action && (
        <button onClick={e => { e.stopPropagation(); onAction?.(); }}
          className="flex-shrink-0 flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          {action}<ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ─── Bulk action bar ───────────────────────────────────────────────────────
function BulkBar({ count, label, onClick, color = "blue" }) {
  if (count === 0) return null;
  const cls = color === "red"
    ? "bg-red-600 hover:bg-red-700"
    : "bg-blue-600 hover:bg-blue-700";
  return (
    <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
      <span className="text-xs text-blue-700 flex-1">已选 {count} 项</span>
      <Button size="sm" className={`h-7 text-xs text-white ${cls}`} onClick={onClick}>{label}</Button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
export default function UserTodo() {
  const navigate = useNavigate();  
  const [locale, setLocale_] = useState(getLocale());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // 如果没登录，直接跳转登录
  const token = localStorage.getItem('token');

  if(!token) {
      base44.auth.redirectToLogin(locale);
  }

  useEffect(() => {
    const handler = (e) => setLocale_(e.detail?.locale || getLocale());
    window.addEventListener('localeChanged', handler);
    return () => window.removeEventListener('localeChanged', handler);
  }, []);
  const [initialData, setInitialData] = useState(null); // for notify modal
  const [currentUser, setCurrentUser] = useState(null);

  // Modal state
  const [payModal, setPayModal] = useState(null);        // { order, mode }
  const [notifyModal, setNotifyModal] = useState(null);  // { orders: [] }
  const [orderDetailModal, setOrderDetailModal] = useState(null); // order object
  const [poolDetailModal, setPoolDetailModal] = useState(null);   // pool object

  // Selections
  const [selPayOrders, setSelPayOrders] = useState([]);
  const [selNotifyOrders, setSelNotifyOrders] = useState([]);

  const load = () => {
    setLoading(true);
    Promise.all([
      base44.functions.invoke("getUserTodoData", {}),
      base44.functions.invoke("getMyOrdersPageData", {}).catch(() => ({ data: {} })),
      base44.auth.me().catch(() => null),
    ]).then(([todoRes, pageRes, me]) => {
      debugger
      setData(todoRes.data || {});
      setCurrentUser(me);
      // Extract initialData needed by UserNotifyShipmentModal
      const pd = pageRes.data || {};
      setInitialData({
        pools: pd.pools || [],
        transitLocations: pd.transitLocations || [],
        nonAdminUsers: pd.nonAdminUsers || [],
        addons: pd.addons || [],
        transitMethods: pd.transitMethods || [],
        shippingMethods: pd.shippingMethods || [],
        userPreference: pd.userPreference || null,
        // Fix: these are top-level fields from getMyOrdersPageData, not nested under siteSettings
        allowUserCustomsDeclaration: pd.allowUserCustomsDeclaration !== false,
        hazmatText: pd.hazmatText || null,
      });
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-32 gap-3">
      <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
      <span className="text-sm text-gray-400">{t("加载待办中...", locale)}</span>
    </div>
  );

  const { orders = [], pools = [], notifications = [], announcements = [], faqQuestions = [] } = data || {};

  // ── Classify ─────────────────────────────────────────────────────────────
  const unreadNotifs = notifications;
  const pendingAnnouncements = announcements.filter(a => a.is_active);
  const ordersWithAdminMsg = orders.filter(o => o.messages?.length > 0 && o.messages[o.messages.length - 1]?.role === "admin");
  const poolsWithAdminMsg  = pools.filter(p => p.messages?.length > 0 && p.messages[p.messages.length - 1]?.role === "admin");

  const pendingPayOrders = orders.filter(o =>
    (["payment_pending", "pending_confirmation"].includes(o.order_status) || ["pending", "awaiting_payment"].includes(o.payment_status))
    && !["paid", "confirmed"].includes(o.payment_status)
  );
  const pendingPayPools = pools.filter(p =>
    ["awaiting_payment", "pending"].includes(p.status) && p.payment_status !== "paid" && p.shipping_fee_jpy > 0
  );
  const pendingNotifyOrders = orders.filter(o => ["in_warehouse", "in_storage"].includes(o.order_status));
  const pendingReceiveOrders = orders.filter(o => ["transit_shipped", "shipped"].includes(o.order_status));
  const pendingReceivePools  = pools.filter(p => p.status === "shipped");
  const needsInfoOrders = orders.filter(o => o.order_status === "pending_confirmation" && !o.product_url && !o.product_image_url);

  const confirmCount = unreadNotifs.length + pendingAnnouncements.length + ordersWithAdminMsg.length + poolsWithAdminMsg.length + faqQuestions.length;
  const payCount     = pendingPayOrders.length + pendingPayPools.length;
  const notifyCount  = pendingNotifyOrders.length;
  const receiveCount = pendingReceiveOrders.length + pendingReceivePools.length;
  const infoCount    = needsInfoOrders.length;
  const totalTodo    = confirmCount + payCount + notifyCount + receiveCount + infoCount;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const toggleSel = (setter, id, checked) =>
    setter(prev => checked ? [...prev, id] : prev.filter(x => x !== id));

  const openPayModal = (order) => setPayModal({ order, mode: "prepay" });

  const openNotifyModal = (orderList) => {
    if (!orderList || orderList.length === 0) return;
    setNotifyModal({ orders: orderList });
  };

  // Bulk pay: open modal for the first selected order (payment modal handles one order at a time)
  const handleBulkPay = () => {
    const order = pendingPayOrders.find(o => selPayOrders.includes(o.id));
    if (order) openPayModal(order);
  };

  // Bulk notify: pass all selected orders to the notify modal
  const handleBulkNotify = () => {
    const selected = pendingNotifyOrders.filter(o => selNotifyOrders.includes(o.id));
    if (selected.length > 0) openNotifyModal(selected);
  };

  // Open pay for a single item and remove it from selection
  const handleSinglePay = (order) => {
    setSelPayOrders(prev => prev.filter(id => id !== order.id));
    openPayModal(order);
  };

  // Open notify for a single item and remove it from selection
  const handleSingleNotify = (order) => {
    setSelNotifyOrders(prev => prev.filter(id => id !== order.id));
    openNotifyModal([order]);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Inbox className="w-5 h-5 text-gray-600" />
            {t("我的待办", locale)}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalTodo > 0 ? `${t("共", locale)} ${totalTodo} ${t("项待处理", locale)}` : `🎉 ${t("全部处理完毕，没有待办事项", locale)}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {[
            { label: t("待确认", locale), count: confirmCount, color: "orange" },
            { label: t("待付款", locale), count: payCount,     color: "red" },
            { label: t("通知出货", locale), count: notifyCount,  color: "blue" },
            { label: t("待收货", locale), count: receiveCount,  color: "teal" },
          ].map(s => s.count > 0 && <StatPill key={s.label} {...s} />)}
          <button onClick={load} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors" title={t("刷新", locale)}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Main grid: 2 columns on md+ ───────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* LEFT column */}
        <div className="space-y-4">

          {/* 待付款 */}
          <Section icon={CreditCard} title={t("待付款", locale)} count={payCount} color="red" emptyText={t("暂无待付款项目", locale)}>
            <BulkBar count={selPayOrders.length} label={t("去付款", locale)} color="red"
              onClick={handleBulkPay} />
            {pendingPayOrders.map(o => (
              <Item key={o.id}
                label={o.product_name}
                sub={`${o.order_number || ""} · ${STATUS_LABEL[o.order_status] || ""}`}
                badge={fmtJpy(o.prepayment_amount) ? { text: fmtJpy(o.prepayment_amount), cls: "bg-red-100 text-red-700 font-semibold" } : undefined}
                checkbox={true} checked={selPayOrders.includes(o.id)}
                onCheck={c => toggleSel(setSelPayOrders, o.id, c)}
                onRowClick={() => setOrderDetailModal(o)}
                action={t("去付款", locale)}
                onAction={() => handleSinglePay(o)}
              />
            ))}
            {pendingPayPools.map(p => (
              <Item key={p.id}
                label={p.pool_code || p.title || t("发货申请", locale)}
                sub={t("发货运费待支付", locale)}
                badge={fmtJpy(p.shipping_fee_jpy) ? { text: fmtJpy(p.shipping_fee_jpy), cls: "bg-red-100 text-red-700 font-semibold" } : undefined}
                onRowClick={() => setPoolDetailModal(p)}
                action={t("查看详情", locale)}
                onAction={() => setPoolDetailModal(p)}
              />
            ))}
          </Section>

          {/* 待通知出货 */}
          <Section icon={Truck} title={t("待通知出货", locale)} count={notifyCount} color="blue" emptyText={t("暂无待通知出货订单", locale)}>
            <BulkBar count={selNotifyOrders.length} label={t("批量通知出货", locale)}
              onClick={handleBulkNotify} />
            {pendingNotifyOrders.map(o => (
              <Item key={o.id}
                label={o.product_name}
                sub={`${o.order_number || ""} · ${t("已入库，可通知发货", locale)}`}
                badge={{ text: t("已入库", locale), cls: "bg-green-100 text-green-700" }}
                checkbox={true} checked={selNotifyOrders.includes(o.id)}
                onCheck={c => toggleSel(setSelNotifyOrders, o.id, c)}
                onRowClick={() => setOrderDetailModal(o)}
                action={t("通知出货", locale)}
                onAction={() => handleSingleNotify(o)}
              />
            ))}
          </Section>

          {/* 待补充信息 */}
          {infoCount > 0 && (
            <Section icon={ClipboardList} title={t("待补充信息", locale)} count={infoCount} color="yellow" emptyText={t("暂无待补充项目", locale)}>
              {needsInfoOrders.map(o => (
                <Item key={o.id}
                  label={o.product_name}
                  sub={t("请完善商品链接或图片等信息", locale)}
                  badge={{ text: t("信息不完整", locale), cls: "bg-yellow-100 text-yellow-700" }}
                  onRowClick={() => setOrderDetailModal(o)}
                  action={t("查看详情", locale)}
                  onAction={() => setOrderDetailModal(o)}
                />
              ))}
            </Section>
          )}
        </div>

        {/* RIGHT column */}
        <div className="space-y-4">

          {/* 待收货 */}
          <Section icon={Package} title={t("待收货", locale)} count={receiveCount} color="teal" emptyText={t("暂无在途包裹", locale)}>
            {pendingReceiveOrders.map(o => (
              <Item key={o.id}
                label={o.product_name}
                sub={o.tracking_number ? `${t("运单号", locale)}: ${o.tracking_number}` : (o.order_number || "")}
                badge={{ text: STATUS_LABEL[o.order_status] || t("运输中", locale), cls: "bg-teal-100 text-teal-700" }}
                onRowClick={() => setOrderDetailModal(o)}
                action={t("查看详情", locale)}
                onAction={() => setOrderDetailModal(o)}
              />
            ))}
            {pendingReceivePools.map(p => (
              <Item key={p.id}
                label={p.pool_code || p.title || t("发货申请", locale)}
                sub={p.tracking_number ? `${t("运单号", locale)}: ${p.tracking_number}` : t("发货申请已发出", locale)}
                badge={{ text: t("已发货", locale), cls: "bg-teal-100 text-teal-700" }}
                onRowClick={() => setPoolDetailModal(p)}
                action={t("查看详情", locale)}
                onAction={() => setPoolDetailModal(p)}
              />
            ))}
          </Section>

          {/* 待确认 */}
          <Section icon={Bell} title={t("待确认", locale)} count={confirmCount} color="orange" emptyText={t("暂无待确认项目", locale)}>
            {pendingAnnouncements.map(a => (
              <Item key={a.id}
                icon={Megaphone} iconCls="text-orange-400"
                label={a.title}
                sub={t("新公告", locale)}
                badge={{ text: a.type === "urgent" ? t("紧急", locale) : t("公告", locale), cls: a.type === "urgent" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700" }}
                action={t("查看", locale)}
                onAction={() => navigate(createPageUrl("Home"))}
              />
            ))}
            {unreadNotifs.map(n => (
              <Item key={n.id}
                icon={Bell} iconCls="text-blue-400"
                label={n.title || n.subject || t("新通知", locale)}
                sub={n.message?.slice(0, 60)}
                badge={{ text: t("未读", locale), cls: "bg-blue-100 text-blue-700" }}
                action={t("查看", locale)}
                onAction={() => navigate(createPageUrl("Notifications"))}
              />
            ))}
            {ordersWithAdminMsg.map(o => (
              <Item key={o.id}
                icon={MessageSquare} iconCls="text-purple-400"
                label={o.product_name}
                sub={`${t("管理员回复了留言", locale)} · ${o.order_number || ""}`}
                badge={{ text: t("新留言", locale), cls: "bg-purple-100 text-purple-700" }}
                onRowClick={() => setOrderDetailModal(o)}
                action={t("查看详情", locale)}
                onAction={() => setOrderDetailModal(o)}
              />
            ))}
            {poolsWithAdminMsg.map(p => (
              <Item key={p.id}
                icon={MessageSquare} iconCls="text-purple-400"
                label={p.pool_code || p.title || t("发货申请", locale)}
                sub={t("管理员回复了留言", locale)}
                badge={{ text: t("新留言", locale), cls: "bg-purple-100 text-purple-700" }}
                onRowClick={() => setPoolDetailModal(p)}
                action={t("查看详情", locale)}
                onAction={() => setPoolDetailModal(p)}
              />
            ))}
            {faqQuestions.map(q => (
              <Item key={q.id}
                icon={HelpCircle} iconCls="text-teal-400"
                label={q.question?.slice(0, 45) || t("我的提问", locale)}
                sub={t("管理员已回复您的问题", locale)}
                badge={{ text: t("有回复", locale), cls: "bg-teal-100 text-teal-700" }}
                action={t("查看", locale)}
                onAction={() => navigate(createPageUrl("helpcenter/faq"))}
              />
            ))}
          </Section>

        </div>
      </div>

      {/* ── Quick links ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        {[
          { label: t("我的订单", locale), icon: Package, to: "MyOrders" },
          { label: t("发货申请", locale), icon: Truck,   to: "ShippingPool" },
          { label: t("通知中心", locale), icon: Bell,    to: "Notifications" },
        ].map(({ label, icon: Icon, to }) => (
          <Link key={to} to={createPageUrl(to)}
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors px-4 py-3 text-sm font-medium text-gray-600 shadow-sm">
            <Icon className="w-4 h-4 text-gray-400" />{label}
          </Link>
        ))}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {payModal && (
        <PaymentModal
          order={payModal.order}
          mode={payModal.mode}
          onClose={() => setPayModal(null)}
          onSuccess={() => { setPayModal(null); setSelPayOrders([]); load(); }}
        />
      )}
      {notifyModal && (
        <UserNotifyShipmentModal
          orders={notifyModal.orders}
          initialData={initialData}
          onClose={() => setNotifyModal(null)}
          onSuccess={() => { setNotifyModal(null); setSelNotifyOrders([]); load(); }}
        />
      )}
      {orderDetailModal && currentUser && (
        <OrderDetailDrawer
          order={orderDetailModal}
          currentUser={currentUser}
          initialUserPreference={initialData?.userPreference}
          onClose={() => setOrderDetailModal(null)}
          onAction={() => { setOrderDetailModal(null); load(); }}
        />
      )}
      {poolDetailModal && currentUser && (
        <ShippingPoolDetailModal
          pool={poolDetailModal}
          isAdmin={false}
          currentUser={currentUser}
          onClose={() => setPoolDetailModal(null)}
          onUpdated={() => { setPoolDetailModal(null); load(); }}
        />
      )}
    </div>
  );
}