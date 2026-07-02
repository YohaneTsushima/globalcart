/**
 * 实物订单详情面板
 * 专门用于显示实物订单的所有属性信息
 * 参考票务订单详情面板布局设计
 */
import { useState } from "react";
import { X, ShoppingBag, Package, CreditCard, FileText, Image as ImageIcon, MessageSquare, Upload, Pencil, Check, Truck, Scissors, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImageWithViewer } from "@/components/common/ImageViewer";
import ReactMarkdown from "react-markdown";
import OrderMessageThread from "@/components/orders/OrderMessageThread";
import OrderCancellationModule from "@/components/orders/OrderCancellationModule";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { updateOrder } from "@/lib/tenantApi";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getStatusLabel, getStatusColor } from "@/lib/orderStatus";

const ORDER_STATUS_LABELS = {
  draft: "草稿",
  submitted: "已提交",
  price_confirmed: "已报价",
  payment_pending: "待付款",
  payment_confirmed: "已付款",
  purchasing: "采购中",
  purchased: "已购买",
  awaiting_shipment: "等待发货",
  in_warehouse: "已入库",
  shipping_fee_pending: "待付运费",
  notified_shipment: "已通知发货",
  shipped: "已发货",
  delivered: "已收货",
  cancelled: "已取消",
};

const ORDER_STATUS_COLORS = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  price_confirmed: "bg-blue-100 text-blue-700",
  payment_pending: "bg-orange-100 text-orange-700",
  payment_confirmed: "bg-green-100 text-green-700",
  purchasing: "bg-purple-100 text-purple-700",
  purchased: "bg-purple-100 text-purple-700",
  awaiting_shipment: "bg-teal-100 text-teal-700",
  in_warehouse: "bg-green-100 text-green-700",
  shipping_fee_pending: "bg-orange-100 text-orange-700",
  notified_shipment: "bg-teal-100 text-teal-700",
  shipped: "bg-teal-100 text-teal-700",
  delivered: "bg-green-200 text-green-800",
  cancelled: "bg-red-100 text-red-700",
};

const PAYMENT_METHOD_LABELS = {
  alipay: "支付宝",
  wechatpay: "微信支付",
  paypay: "PayPay",
  paypal: "PayPal",
  credit_card: "信用卡",
  bank_transfer: "银行转账",
  other: "其他",
};

export default function OrderDetailPanel({ order, onClose, onRefresh, userProfileMap = {}, currentUser, allowSplitAfterWarehouse = false }) {
  const [activeTab, setActiveTab] = useState("overview");
  const { user: authUser } = useAuth();
  const { can } = usePermissions();
  const actualCurrentUser = currentUser || authUser;
  const isAdmin = actualCurrentUser?.role === "admin" || actualCurrentUser?.role === "staff" || actualCurrentUser?.role === "platform_admin";
  const canUpdateStatus = can("order:update") || isAdmin;
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(order.admin_note || "");

  const formatCurrency = (amount, currency = "JPY") => {
    if (!amount || amount <= 0) return "-";
    if (currency === "JPY") {
      return `${Math.round(amount).toLocaleString()} JPY`;
    }
    // CNY 等货币显示两位小数，去掉末尾多余的 0
    return `${currency} ${parseFloat(amount.toFixed(2))}`;
  };

  console.log(order)

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("zh-CN", { 
      year: "numeric", 
      month: "2-digit", 
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const handleNoteSave = async () => {
    setStatusUpdating(true);
    try {
      await updateOrder(order.id, { admin_note: noteText });
      toast.success("备注已保存");
      setEditingNote(false);
      onRefresh?.();
    } catch (error) {
      toast.error("保存失败：" + error.message);
    } finally {
      setStatusUpdating(false);
    }
  };

  const tabs = [
    { key: "overview", label: "概览" },
    { key: "details", label: "商品详情" },
    { key: "messages", label: "留言 & 取消", badge: (order.unread_roles || []).includes("admin") && isAdmin ? "red" : null },
    { key: "fees", label: "费用明细" },
    { key: "timeline", label: "时间线" },
  ];

  const statusLabel = getStatusLabel(order.order_status, isAdmin ? "admin" : "user");
  const statusColor = getStatusColor(order.order_status, isAdmin ? "admin" : "user");

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto" 
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl my-8" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-xl z-10">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <ShoppingBag className="w-5 h-5 text-blue-600" />
              <Badge className={`text-xs ${statusColor}`}>
                {statusLabel}
              </Badge>
              {order.group_buy_request_id && (
                <Badge variant="outline" className="text-xs">
                  拼单订单
                </Badge>
              )}
              {order.supplement_requested && (order.supplement_amount || 0) > 0 && (
                <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">待补款</Badge>
              )}
              <span className="text-xs text-gray-400 font-mono">{order.order_number}</span>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <h2 className="text-lg font-bold text-gray-900 truncate">{order.product_name}</h2>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {order.user_name} · {order.user_email} · ×{order.quantity}
            </p>
          </div>
          <button onClick={onClose} className="ml-3 p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6 sticky top-[73px] bg-white z-10 items-center">
          {tabs.map(t => (
            <button 
              key={t.key} 
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                activeTab === t.key 
                  ? "border-blue-600 text-blue-600" 
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
              {t.badge && (
                <span className="ml-1.5 w-2 h-2 rounded-full bg-red-500 inline-block" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 max-h-[calc(90vh-200px)] overflow-y-auto">
          
          {/* ===== OVERVIEW TAB ===== */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Key metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <div className="text-xs text-blue-600 mb-1">日元估价</div>
                  <div className="text-lg font-bold text-blue-700">
                    {order.estimated_jpy ? `${Math.round(order.estimated_jpy).toLocaleString()} JPY` : "-"}
                  </div>
                </div>
                <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                  <div className="text-xs text-green-600 mb-1">已付金额</div>
                  <div className="text-lg font-bold text-green-700">
                    {order.paid_amount ? formatCurrency(order.paid_amount, order.payment_currency || order.prepayment_currency) : "-"}
                  </div>
                </div>
                <div className="bg-purple-50 border border-purple-100 rounded-lg p-3">
                  <div className="text-xs text-purple-600 mb-1">预付款</div>
                  <div className="text-lg font-bold text-purple-700">
                    {order.prepayment_amount ? formatCurrency(order.prepayment_amount, order.prepayment_currency) : "-"}
                  </div>
                </div>
                <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
                  <div className="text-xs text-orange-600 mb-1">支付方式</div>
                  <div className="text-sm font-bold text-orange-700">
                    {PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method || "-"}
                  </div>
                </div>
              </div>

              {/* Product image */}
              {order.product_image_url && (
                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />商品图片
                  </div>
                  <div className="flex flex-col items-center">
                    <ImageWithViewer src={order.product_image_url} alt="商品图片">
                      <img src={order.product_image_url} alt="商品图片" 
                        className="w-full max-w-md h-64 rounded-lg border object-cover cursor-pointer hover:opacity-80 transition-opacity" />
                    </ImageWithViewer>
                  </div>
                </div>
              )}

              {/* Product links */}
              {order.product_url && (
                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />商品链接
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <ReactMarkdown
                      className="text-sm text-gray-700 prose prose-sm max-w-none [&_a]:text-blue-600 [&_a]:break-all"
                      components={{
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" />
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {order.product_url}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Notes */}
              {order.user_note && (
                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-2">用户备注</div>
                  <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3 text-sm text-yellow-800 whitespace-pre-wrap">
                    {order.user_note}
                  </div>
                </div>
              )}

              {/* Admin note */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-gray-700">管理员备注</div>
                  {isAdmin && !editingNote && (
                    <button onClick={() => { setNoteText(order.admin_note || ""); setEditingNote(true); }}
                      className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {editingNote ? (
                  <div className="space-y-2">
                    <Textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      className="min-h-[100px] text-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={handleNoteSave} disabled={statusUpdating}>
                        {statusUpdating ? <><Pencil className="w-3.5 h-3.5 mr-1" />保存中...</> : <><Check className="w-3.5 h-3.5 mr-1" />保存</>}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingNote(false)} disabled={statusUpdating}>取消</Button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
                    {order.admin_note || "暂无备注"}
                  </div>
                )}
              </div>

              {/* Other images */}
              {(order.payment_proof_url || order.purchase_screenshot_url || order.arrival_photo_url) && (
                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />其他图片
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {order.payment_proof_url && (
                      <div className="flex flex-col items-center gap-1">
                        <ImageWithViewer src={order.payment_proof_url} alt="付款凭证">
                          <img src={order.payment_proof_url} alt="付款凭证" 
                            className="w-full h-24 rounded-lg border object-cover cursor-pointer hover:opacity-80 transition-opacity" />
                        </ImageWithViewer>
                        <span className="text-[10px] text-gray-400">付款凭证</span>
                      </div>
                    )}
                    {order.purchase_screenshot_url && (
                      <div className="flex flex-col items-center gap-1">
                        <ImageWithViewer src={order.purchase_screenshot_url} alt="购买截图">
                          <img src={order.purchase_screenshot_url} alt="购买截图" 
                            className="w-full h-24 rounded-lg border object-cover cursor-pointer hover:opacity-80 transition-opacity" />
                        </ImageWithViewer>
                        <span className="text-[10px] text-gray-400">购买截图</span>
                      </div>
                    )}
                    {order.arrival_photo_url && (
                      <div className="flex flex-col items-center gap-1">
                        <ImageWithViewer src={order.arrival_photo_url} alt="到货图片">
                          <img src={order.arrival_photo_url} alt="到货图片" 
                            className="w-full h-24 rounded-lg border object-cover cursor-pointer hover:opacity-80 transition-opacity" />
                        </ImageWithViewer>
                        <span className="text-[10px] text-gray-400">到货图片</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== DETAILS TAB ===== */}
          {activeTab === "details" && (
            <div className="space-y-5">
              {/* Order info */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="text-sm font-semibold text-gray-700 mb-2">订单信息</div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">订单号</span>
                    <span className="font-medium text-gray-900 font-mono">{order.order_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">商品名称</span>
                    <span className="font-medium text-gray-900">{order.product_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">数量</span>
                    <span className="font-medium text-gray-900">×{order.quantity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">订单状态</span>
                    <Badge className={`text-xs ${statusColor}`}>{statusLabel}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">提交日期</span>
                    <span className="font-medium text-gray-900">{formatDate(order.created_date)}</span>
                  </div>
                  {order.payment_due_date && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">付款截止</span>
                      <span className="font-medium text-orange-700">{formatDate(order.payment_due_date)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment info */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="text-sm font-semibold text-gray-700 mb-2">支付信息</div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">支付方式</span>
                    <span className="font-medium text-gray-900">
                      {PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">支付模式</span>
                    <span className="font-medium text-gray-900">
                      {{ 
                        prepay: "预付款", 
                        deferred: "后付款", 
                        fullpay_once: "一次付清", 
                        credit: "记账" 
                      }[order.payment_mode] || order.payment_mode || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">支付状态</span>
                    <span className="font-medium text-gray-900">
                      {{ 
                        pending: "待处理", 
                        awaiting_payment: "待付款", 
                        awaiting_confirmation: "待确认", 
                        paid: "已付款", 
                        underpaid: "不足额", 
                        overpaid: "超额", 
                        confirmed: "已确认" 
                      }[order.payment_status] || order.payment_status || "-"}
                    </span>
                  </div>
                  {order.tracking_number && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">运单号</span>
                      <span className="font-medium text-teal-700 font-mono">{order.tracking_number}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Addons */}
              {((order.selected_addons || []).length > 0 || (order.selected_addon_ids || []).length > 0) && (
                <div className="bg-purple-50 border border-purple-100 rounded-lg p-4 space-y-2">
                  <div className="text-sm font-semibold text-purple-700 mb-2">增值服务</div>
                  <div className="space-y-1">
                    {(order.selected_addons || []).length > 0
                      ? (order.selected_addons).map((a, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700">{a.service_name || a.id}</span>
                            {(parseFloat(a.fee) > 0) && (
                              <span className="font-medium text-purple-700">
                                +{a.fee_currency || "JPY"} {Math.round(parseFloat(a.fee))}
                              </span>
                            )}
                          </div>
                        ))
                      : (order.selected_addon_ids || []).map((id, i) => (
                          <div key={i} className="flex items-center text-sm">
                            <span className="text-gray-500 font-mono">{id}</span>
                          </div>
                        ))
                    }
                  </div>
                </div>
              )}

              {/* Group buy info */}
              {order.group_buy_request_id && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-indigo-800">
                    <Package className="w-4 h-4" />
                    拼单信息
                  </div>
                  <div className="space-y-1 text-sm">
                    {order.group_buy_request_title && (
                      <div className="flex justify-between">
                        <span className="text-indigo-600">拼单标题</span>
                        <span className="font-medium text-indigo-700">{order.group_buy_request_title}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-indigo-600">分摊运费</span>
                      <span className="font-semibold text-indigo-700">
                        {order.group_buy_allocated_shipping_fee_jpy != null
                          ? `¥ ${Number(order.group_buy_allocated_shipping_fee_jpy).toLocaleString()}`
                          : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Supplement info */}
              {order.supplement_requested && (order.supplement_amount || 0) > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
                  <div className="text-sm font-semibold text-red-800">补款信息</div>
                  <div className="flex justify-between text-sm">
                    <span className="text-red-600">补款金额</span>
                    <span className="font-bold text-red-700">{formatCurrency(order.supplement_amount, order.prepayment_currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-red-600">补款状态</span>
                    <Badge className={order.supplement_paid ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}>
                      {order.supplement_paid ? "已支付" : "待支付"}
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== MESSAGES & CANCEL TAB ===== */}
          {activeTab === "messages" && (
            <div className="space-y-4">
              {/* Message thread */}
              <OrderMessageThread
                order={order}
                currentUser={actualCurrentUser}
                isAdmin={isAdmin}
                userProfileMap={userProfileMap}
                hideHistory={false}
              />

              {/* Cancellation module */}
              {isAdmin && order.order_status !== "cancelled" && (
                <div className="border-t pt-4">
                  <OrderCancellationModule
                    order={order}
                    onRefresh={onRefresh}
                  />
                </div>
              )}
            </div>
          )}

          {/* ===== FEES TAB ===== */}
          {activeTab === "fees" && (
            <div className="space-y-4">
              {/* Detailed fee breakdown */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-900">
                  <CreditCard className="w-4 h-4" />费用详细构成
                </div>
                <div className="space-y-2 text-sm">
                  {/* Base item cost */}
                  <div className="flex justify-between items-center py-1">
                    <span className="text-green-700">商品日元估价</span>
                    <span className="font-medium text-green-900">
                      {order.estimated_jpy ? `${Math.round(order.estimated_jpy).toLocaleString()} JPY` : "-"}
                    </span>
                  </div>

                  {/* Addon fees */}
                  {(order.selected_addons || []).length > 0 && (
                    <>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-green-700">增值服务费</span>
                        <span className="font-medium text-green-900">
                          {formatCurrency((order.selected_addons || []).reduce((sum, a) => sum + (parseFloat(a.fee) || 0), 0))}
                        </span>
                      </div>
                      <div className="text-xs text-green-600 pl-3">
                        {(order.selected_addons || []).map((a, i) => (
                          <div key={i} className="flex justify-between">
                            <span>{a.service_name || a.id}</span>
                            <span>{formatCurrency(parseFloat(a.fee) || 0, a.fee_currency)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Payment surcharge */}
                  {(order.payment_surcharge_jpy || order.service_fee_amount || 0) > 0 && (
                    <div className="flex justify-between items-center py-1">
                      <span className="text-green-700">支付方式服务费</span>
                      <span className="font-medium text-green-900">{formatCurrency(order.payment_surcharge_jpy || order.service_fee_amount)}</span>
                    </div>
                  )}

                  {/* Shipping fee */}
                  {(order.shipping_fee_amount || 0) > 0 && (
                    <div className="flex justify-between items-center py-1">
                      <span className="text-green-700">运费</span>
                      <span className="font-medium text-green-900">
                        {formatCurrency(order.shipping_fee_amount, order.shipping_fee_currency)}
                      </span>
                    </div>
                  )}

                  {/* Item size fee */}
                  {(order.item_size_extra_fee || 0) > 0 && (
                    <div className="flex justify-between items-center py-1">
                      <span className="text-green-700">物品尺寸费</span>
                      <span className="font-medium text-green-900">
                        {formatCurrency(order.item_size_extra_fee, order.item_size_fee_currency)}
                      </span>
                    </div>
                  )}

                  {/* Subtotal */}
                  <div className="border-t border-green-300 pt-2 flex justify-between items-center text-base">
                    <span className="font-semibold text-green-900">预付款总额</span>
                    <span className="font-bold text-green-900">
                      {formatCurrency(order.prepayment_amount_jpy || 0, order.prepayment_currency)}
                    </span>
                  </div>

                  {/* Paid amount */}
                  {(order.paid_amount || 0) > 0 && (() => {
                    debugger
                    const paidCurrency = order.payment_currency || order.prepayment_currency;
                    const paidAmountJpy = (order?.paid_amount_jpy || order?.prepayment_amount || order?.full_payment_amount)
                      || (paidCurrency === 'CNY' && order.prepayment_rate_jpy_cny
                        ? Math.round(order.paid_amount / order.prepayment_rate_jpy_cny)
                        : order.paid_amount);
                    return (
                      <div className="flex justify-between items-center py-1 text-blue-700">
                        <span>已付金额</span>
                        <span className="font-medium">-{formatCurrency(order.paid_amount, paidCurrency)}{paidCurrency !== 'JPY' ? ` (≈${paidAmountJpy} JPY)` : ''}</span>
                      </div>
                    );
                  })()}

                  {/* Balance credit */}
                  {(order.balance_credit || 0) > 0 && (
                    <div className="flex justify-between items-center py-1 text-purple-700">
                      <span>余额抵扣</span>
                      <span className="font-medium">-{formatCurrency(order.balance_credit, order.prepayment_currency)}</span>
                    </div>
                  )}

                  {/* Final total */}
                  <div className="border-t-2 border-green-400 pt-3 flex justify-between items-center text-lg bg-green-100/50 rounded px-3 py-2">
                    <span className="font-bold text-green-900">待付金额</span>
                    <span className="font-bold text-green-900">
                       {formatCurrency(
                        (order.estimated_jpy || 0) - (order.prepayment_amount || 0) - (order.balance_credit || 0),
                        "JPY"
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== TIMELINE TAB ===== */}
          {activeTab === "timeline" && (
            <div className="space-y-4">
              {/* Order timeline */}
              <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="text-sm font-semibold text-gray-700 mb-3">订单时间线</div>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-gray-400 mt-1.5" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">订单创建</div>
                      <div className="text-xs text-gray-500">{formatDate(order.created_date)}</div>
                    </div>
                  </div>
                  {order.submit_date && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">提交日期</div>
                        <div className="text-xs text-gray-500">{formatDate(order.submit_date)}</div>
                      </div>
                    </div>
                  )}
                  {order.purchased_date && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">已购买</div>
                        <div className="text-xs text-gray-500">{formatDate(order.purchased_date)}</div>
                      </div>
                    </div>
                  )}
                  {order.in_warehouse_date && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">已入库</div>
                        <div className="text-xs text-gray-500">{formatDate(order.in_warehouse_date)}</div>
                      </div>
                    </div>
                  )}
                  {order.shipped_date && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-teal-500 mt-1.5" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">已发货</div>
                        <div className="text-xs text-gray-500">{formatDate(order.shipped_date)}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Messages timeline */}
              {(order.messages || []).length > 0 && (
                <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="text-sm font-semibold text-gray-700 mb-3">留言记录</div>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {order.messages.slice(-10).map((msg, i) => (
                      <div key={i} className={`flex items-start gap-3 ${msg.role === "admin" ? "flex-row-reverse" : ""}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-medium ${
                          msg.role === "admin" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"
                        }`}>
                          {msg.role === "admin" ? "管" : "用"}
                        </div>
                        <div className={`flex-1 ${msg.role === "admin" ? "text-right" : ""}`}>
                          <div className={`inline-block px-3 py-2 rounded-lg text-sm ${
                            msg.role === "admin" ? "bg-blue-50 text-blue-800" : "bg-gray-50 text-gray-800"
                          }`}>
                            {msg.content}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">{formatDate(msg.timestamp)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}