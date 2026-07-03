/**
 * OrderDetailDrawer
 * Full order detail view for users.
 * Shows status, messages, and action buttons based on current order state.
 */
import { useState, useEffect } from "react";
import { X, ExternalLink, MessageCircle, Truck, CheckCircle, CreditCard, Upload, Edit2, Package, Scissors } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { ImageWithViewer } from "@/components/common/ImageViewer";
import { base44 } from "@/api/base44Client";
import { updateOrder, fetchShippingPools, tenantEntity } from "@/lib/tenantApi";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getStatusLabel, getStatusColor, USER_CAN_RESUBMIT_PROOF_STATUSES } from "@/lib/orderStatus";
import MessageThread from "@/components/common/MessageThread";
import PaymentModal from "./PaymentModal";
import UserNotifyShipmentModal from "./UserNotifyShipmentModal";
import ShippingEditModal from "@/components/shippingpool/ShippingEditModal";
import ShippingPoolDetailModal from "@/components/shippingpool/ShippingPoolDetailModal";
import SplitAfterWarehouseModal from "./SplitAfterWarehouseModal";

export default function OrderDetailDrawer({ order, currentUser, initialUserPreference, initialPaidOrderReminder, initialShippedReminder, initialUserProfileMap = {}, otherPaymentName = '其它支付方式', allowSplitAfterWarehouse = false, onClose, onAction }) {
  const { can } = usePermissions();
  const canNotifyShipment = can("shipping:notify_shipment");
  const canEditShipmentRequest = can("shipping:edit_shipment_request");
  const [showMessages, setShowMessages] = useState(true);
  const [confirmingDelivered, setConfirmingDelivered] = useState(false);
  const [contactInfo, setContactInfo] = useState(initialUserPreference?.contact_info || "");
  const [showPayment, setShowPayment] = useState(false);
  const [showShipment, setShowShipment] = useState(false);
  const [paidReminder, setPaidReminder] = useState(initialPaidOrderReminder || "");
  const [shippedReminder, setShippedReminder] = useState(initialShippedReminder || "");
  const [editPool, setEditPool] = useState(null);
  const [loadingPool, setLoadingPool] = useState(false);
  const [userProfileMap, setUserProfileMap] = useState(initialUserProfileMap);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [payPool, setPayPool] = useState(null); // 发货池详情/补付运费

  useEffect(() => {
    // Clear user unread on open
    if ((order.unread_roles || []).includes("user")) {
      const newRoles = (order.unread_roles || []).filter(r => r !== "user");
      updateOrder(order.id, { unread_roles: newRoles }).catch(() => {});
    }
  }, [order.id]);

  useEffect(() => {
    // Only self-fetch if initial data was not provided by the parent page
    if (!initialUserPreference) {
      tenantEntity.list('UserPreference', { user_email: currentUser.email })
        .then(prefs => {
          if (prefs.length > 0 && prefs[0].contact_info) setContactInfo(prefs[0].contact_info);
        })
        .catch(() => {});
    }

    if (order.order_status === "paid" && initialPaidOrderReminder === undefined) {
      tenantEntity.list('SiteSettings', { key: "paid_order_reminder" })
        .then(settings => {
          if (settings.length > 0) setPaidReminder(settings[0].value);
        })
        .catch(() => {});
    }

    if (order.order_status === "shipped" && initialShippedReminder === undefined) {
      tenantEntity.list('SiteSettings', { key: "shipped_reminder" })
        .then(settings => {
          if (settings.length > 0) setShippedReminder(settings[0].value);
        })
        .catch(() => {});
    }

    // Fetch user profile map for message displays only if not pre-supplied by parent
    if (Object.keys(initialUserProfileMap).length === 0) {
      base44.functions.invoke('getTenantUsers', {})
        .then(r => {
          const profileMap = {};
          (r.data?.users || []).forEach(u => {
            if (u.email) profileMap[u.email] = { display_name: u.display_name || u.full_name || null, avatar_url: u.avatar_url || null };
          });
          setUserProfileMap(profileMap);
        })
        .catch(() => {});
    }
  }, [currentUser.email, order.order_status]);

  const status = order.order_status;
  const statusLabel = getStatusLabel(status, "user");
  const statusColor = getStatusColor(status, "user");
  const hasMessages = (order.messages || []).length > 0;
  const unread = (order.unread_roles || []).includes("user");

  const handleConfirmDelivered = async () => {
    setConfirmingDelivered(true);
    await updateOrder(order.id, { order_status: "delivered" });
    onAction?.("delivered");
  };

  const handleMessageSent = () => {
    setShowMessages(true);
    // 自动下拉至最新消息
    setTimeout(() => {
      const msgSection = document.getElementById("message-section");
      if (msgSection) {
        msgSection.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);
    onAction?.("message_sent");
  };

  // Pre-process: ensure --- has blank lines around it (for <hr>), and wrap bare URLs as markdown links
  const productUrlText = (() => {
    const raw = (order.product_url || "").trim();
    return raw
      .split("\n")
      .map(line => {
        const t = line.trim();
        // separator line
        if (t === "---") return "\n---\n";
        // bare URL → markdown link
        if (/^https?:\/\/\S+/.test(t)) return `[${t}](${t})`;
        return line;
      })
      .join("\n");
  })();

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`text-xs ${statusColor}`}>{statusLabel}</Badge>
              {unread && <Badge className="bg-orange-100 text-orange-700 text-xs animate-pulse">有新回复</Badge>}
            </div>
            <h2 className="font-semibold text-gray-900 mt-1 truncate">{order.product_name}</h2>
            <p className="text-xs text-gray-400">{order.order_number} · ×{order.quantity}</p>
          </div>
          <button onClick={onClose} className="ml-3 mt-0.5"><X className="w-4 h-4 text-gray-500" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Key info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {order.payment_method && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-400">付款方式</div>
                <div className="font-medium text-gray-800">{{ alipay: "支付宝", wechatpay: "微信支付", paypay: "PayPay", paypal: "PayPal", credit_card: "信用卡", bank_transfer: "银行转账", other: otherPaymentName }[order.payment_method] || order.payment_method}</div>
              </div>
            )}
            {order.estimated_jpy > 0 && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-400">商品日元价格</div>
                <div className="font-medium text-gray-800">{Math.round(order.estimated_jpy).toLocaleString()} yen</div>
              </div>
            )}
            {order.prepayment_amount > 0 && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-400">预付款</div>
                <div className="font-medium text-gray-800">
                  {order.prepayment_currency === "JPY"
                    ? `${Math.round(order.prepayment_amount).toLocaleString()} yen`
                    : `${order.prepayment_currency} ${Math.round(order.prepayment_amount)}`}
                </div>
              </div>
            )}
            {order.paid_amount > 0 && (
              <div className="bg-green-50 rounded-lg p-3">
                <div className="text-xs text-gray-400">已付金额</div>
                <div className="font-medium text-green-700">
                  {order.prepayment_currency === "JPY"
                    ? `${Math.round(order.paid_amount).toLocaleString()} yen`
                    : `${order.prepayment_currency} ${Math.round(order.paid_amount)}`}
                </div>
              </div>
            )}
            {order.balance_credit > 0 && (
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-xs text-gray-400">余额（可抵运费）</div>
                <div className="font-medium text-blue-700">
                  {order.prepayment_currency === "JPY"
                    ? `${Math.round(order.balance_credit).toLocaleString()} yen`
                    : `${order.prepayment_currency} ${Math.round(order.balance_credit)}`}
                </div>
              </div>
            )}
            {order.shipping_fee_amount > 0 && (
              <div className="bg-yellow-50 rounded-lg p-3">
                <div className="text-xs text-gray-400">运费</div>
                <div className="font-medium text-yellow-700">
                  {order.shipping_fee_currency === "JPY"
                    ? `${Math.round(order.shipping_fee_amount).toLocaleString()} yen`
                    : `${order.shipping_fee_currency} ${Math.round(order.shipping_fee_amount)}`}
                </div>
              </div>
            )}
            {order.item_size_extra_fee > 0 && (
              <div className="bg-purple-50 rounded-lg p-3">
                <div className="text-xs text-gray-400 flex items-center gap-1">
                  <Package className="w-3.5 h-3.5" />物品尺寸费
                </div>
                <div className="font-medium text-purple-700">{order.item_size_fee_currency} {order.item_size_extra_fee}</div>
                {order.item_size_title && <div className="text-xs text-gray-500 mt-1">{order.item_size_title}</div>}
              </div>
            )}
            {order.tracking_number && (
              <div className="bg-teal-50 rounded-lg p-3 col-span-2">
                <div className="text-xs text-gray-400">运单号</div>
                <div className="font-mono font-medium text-teal-700">{order.tracking_number}</div>
              </div>
            )}
            {status === "notified_shipment" && editPool && (
              <div className="bg-purple-50 rounded-lg p-3 col-span-2">
                <div className="text-xs text-gray-400">发货申请单号</div>
                <div className="font-mono font-medium text-purple-700">{editPool.pool_code || editPool.id.slice(-6).toUpperCase()}</div>
              </div>
            )}
          </div>

          {/* Selected addons */}
          {((order.selected_addons || []).length > 0 || (order.selected_addon_ids || []).length > 0) && (
            <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2.5">
              <div className="text-xs text-purple-600 font-medium mb-1.5">增值服务</div>
              <div className="space-y-1">
                {(order.selected_addons || []).length > 0
                  ? (order.selected_addons).map((a, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700">{a.name || a.id}</span>
                        {(parseFloat(a.fee) > 0) && (
                          <span className="font-medium text-purple-700">+{a.fee_currency || "JPY"} {Math.round(parseFloat(a.fee))}</span>
                        )}
                      </div>
                    ))
                  : (order.selected_addon_ids || []).map((id, i) => (
                      <div key={i} className="flex items-center text-xs">
                        <span className="text-gray-500 font-mono">{id}</span>
                      </div>
                    ))
                }
              </div>
            </div>
          )}

          {/* Notes - hide alipay auto-confirm system notes */}
          {order.admin_note && !order.admin_note.includes("支付宝自动确认") && (
            <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2.5">
              <div className="text-xs text-yellow-600 font-medium mb-0.5">客服备注</div>
              <p className="text-sm text-yellow-800 whitespace-pre-wrap">{order.admin_note}</p>
            </div>
          )}
          {order.user_note && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
              <div className="text-xs text-gray-500 font-medium mb-0.5">我的备注</div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.user_note}</p>
              {order.note_image_url && (
                <div className="mt-2">
                  <ImageWithViewer src={order.note_image_url} alt="备注图片">
                    <img src={order.note_image_url} alt="备注图片" className="h-20 w-20 rounded-lg border object-cover cursor-pointer hover:opacity-80 transition-opacity" />
                  </ImageWithViewer>
                  <span className="text-[10px] text-gray-400 ml-1">备注图片</span>
                </div>
              )}
            </div>
          )}

          {/* Cancel info */}
          {status === "cancelled" && order.cancel_reason && (
            <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
              <div className="text-xs text-red-500 font-medium mb-0.5">取消理由</div>
              <p className="text-sm text-red-700">{order.cancel_reason}</p>
            </div>
          )}

          {/* purchased status: remind user to wait for warehouse arrival */}
          {status === "purchased" && (
            <div className="bg-teal-50 border border-teal-100 rounded-lg px-3 py-2.5 flex items-start gap-2">
              <span className="text-teal-500 mt-0.5">📦</span>
              <div>
                <div className="text-xs text-teal-600 font-medium mb-0.5">商品已下单</div>
                <p className="text-sm text-teal-800">我们已帮您下单，请耐心等候商品入库。入库后您将可以通知发货。</p>
              </div>
            </div>
          )}

          {/* Paid order reminder */}
          {status === "paid" && paidReminder && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
              <div className="text-xs text-blue-600 font-medium mb-0.5">提示</div>
              <p className="text-sm text-blue-800">{paidReminder}</p>
            </div>
          )}

          {/* Shipped reminder */}
          {status === "shipped" && shippedReminder && (
            <div className="bg-teal-50 border border-teal-100 rounded-lg px-3 py-2.5">
              <div className="text-xs text-teal-600 font-medium mb-0.5">提示</div>
              <p className="text-sm text-teal-800">{shippedReminder}</p>
            </div>
          )}

          {/* Product links */}
          {productUrlText && (
            <div>
              <div className="text-xs text-gray-400 mb-1.5">商品链接</div>
              <ReactMarkdown

                className="text-xs text-gray-700 prose prose-xs max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_hr]:border-indigo-300 [&_hr]:my-1.5 [&_p]:my-0.5 [&_a]:text-blue-600 [&_a]:break-all"
                components={{
                  hr: () => (
                    <div className="flex items-center gap-2 my-2">
                      <div className="flex-1 border-t border-indigo-300" />
                      <span className="text-[10px] text-indigo-400 font-medium">— 拆单分隔线 —</span>
                      <div className="flex-1 border-t border-indigo-300" />
                    </div>
                  ),
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 break-all inline-flex items-center gap-1">
                      <ExternalLink className="w-3 h-3 flex-shrink-0 inline" />{children}
                    </a>
                  ),
                  p: ({ children }) => <p className="my-0.5 break-all">{children}</p>,
                }}
              >
                {productUrlText}
              </ReactMarkdown>
            </div>
          )}

          {/* Images */}
          {(order.product_image_url || order.arrival_photo_url || order.purchase_screenshot_url || order.payment_proof_url) && (
            <div className="flex gap-3 flex-wrap">
              {order.product_image_url && (
                <div className="flex flex-col items-center gap-1">
                  <ImageWithViewer src={order.product_image_url} alt="商品图">
                    <img src={order.product_image_url} alt="商品图" className="h-20 w-20 rounded-lg border object-cover cursor-pointer hover:opacity-80 transition-opacity" />
                  </ImageWithViewer>
                  <span className="text-[10px] text-gray-400">商品图</span>
                </div>
              )}
              {order.payment_proof_url && (
                <div className="flex flex-col items-center gap-1">
                  <ImageWithViewer src={order.payment_proof_url} alt="付款凭证">
                    <img src={order.payment_proof_url} alt="付款凭证" className="h-20 w-20 rounded-lg border object-cover cursor-pointer hover:opacity-80 transition-opacity" />
                  </ImageWithViewer>
                  <span className="text-[10px] text-gray-400">付款凭证</span>
                </div>
              )}
              {order.purchase_screenshot_url && (
                <div className="flex flex-col items-center gap-1">
                  <ImageWithViewer src={order.purchase_screenshot_url} alt="购买截图">
                    <img src={order.purchase_screenshot_url} alt="购买截图" className="h-20 w-20 rounded-lg border object-cover cursor-pointer hover:opacity-80 transition-opacity" />
                  </ImageWithViewer>
                  <span className="text-[10px] text-gray-400">购买截图</span>
                </div>
              )}
              {order.arrival_photo_url && (
                <div className="flex flex-col items-center gap-1">
                  <ImageWithViewer src={order.arrival_photo_url} alt="到货图片">
                    <img src={order.arrival_photo_url} alt="到货图片" className="h-20 w-20 rounded-lg border object-cover cursor-pointer hover:opacity-80 transition-opacity" />
                  </ImageWithViewer>
                  <span className="text-[10px] text-gray-400">到货图片</span>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-2 pt-1">
            {status === "payment_pending" && order.payment_status !== "awaiting_confirmation" && (
              <>
                {(order?.payment_due_date || order?.payment_deadline) && (
                  <div className="text-xs text-orange-600 text-center">
                    付款截止日期：{(order?.payment_due_date || order?.payment_deadline)}
                  </div>
                )}
                <Button className="w-full bg-red-600 hover:bg-red-700 text-sm"
                  onClick={() => setShowPayment(true)}>
                  <CreditCard className="w-4 h-4 mr-2" />立即付款
                </Button>
              </>
            )}
            {USER_CAN_RESUBMIT_PROOF_STATUSES.includes(status) && (
              <Button className="w-full bg-orange-600 hover:bg-orange-700 text-sm"
                onClick={() => setShowPayment(true)}>
                <Upload className="w-4 h-4 mr-2" />重新提交付款凭证
              </Button>
            )}
            {status === "in_warehouse" && canNotifyShipment && (
              <Button className="w-full bg-teal-600 hover:bg-teal-700 text-sm"
                onClick={() => setShowShipment(true)}>
                <Truck className="w-4 h-4 mr-2" />通知发货
              </Button>
            )}
            {status === "notified_shipment" && canEditShipmentRequest && (
              <Button variant="outline" className="w-full text-sm"
                disabled={loadingPool}
                onClick={async () => {
                  setLoadingPool(true);
                  const pools = await fetchShippingPools();
                  const found = pools.find(p => (p.order_ids || []).includes(order.id));
                  setEditPool(found || null);
                  setLoadingPool(false);
                }}>
                <Edit2 className="w-4 h-4 mr-2" />
                {loadingPool ? "加载中..." : "编辑出货参数"}
              </Button>
            )}
            {status === "shipping_fee_pending" && order.shipping_fee_amount > 0 && (
              <Button className="w-full bg-red-600 hover:bg-red-700 text-sm"
                onClick={() => setShowPayment("shipping")}>
                <CreditCard className="w-4 h-4 mr-2" />
                付运费 {order.shipping_fee_currency === "JPY"
                  ? `${Math.round(order.shipping_fee_amount).toLocaleString()} yen`
                  : `${order.shipping_fee_currency} ${Math.round(order.shipping_fee_amount)}`}
              </Button>
            )}
            {status === "shipped" && (
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-sm"
                onClick={handleConfirmDelivered}
                disabled={confirmingDelivered}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {confirmingDelivered ? "确认中..." : "确认已收货"}
              </Button>
            )}
            {(status === "shipped" || status === "transit_shipped" || status === "delivered") && (
              <Button variant="outline" className="w-full text-sm" disabled={loadingPool}
                onClick={async () => {
                  setLoadingPool(true);
                  const pools = await fetchShippingPools();
                  const found = pools.find(p => (p.order_ids || []).includes(order.id));
                  setPayPool(found || null);
                  setLoadingPool(false);
                }}>
                <Package className="w-4 h-4 mr-2" />{loadingPool ? "加载中..." : "发货详情 / 补付运费"}
              </Button>
            )}
          </div>

          {/* Message thread - always visible at bottom */}
          <div id="message-section" className="border-t pt-4">
            {hasMessages && (
              <button
                className="flex items-center gap-2 text-sm font-medium text-gray-700 w-full py-1 mb-3"
                onClick={() => setShowMessages(!showMessages)}
              >
                <MessageCircle className="w-4 h-4" />
                {`留言记录（${(order.messages || []).length}条）`}
                {unread && <span className="ml-1 w-2 h-2 rounded-full bg-orange-400 inline-block animate-pulse" />}
                <span className="text-xs text-gray-400 ml-auto">{showMessages ? "收起" : "展开"}</span>
              </button>
            )}
            <MessageThread
              contextObject={order}
              contextType="order"
              currentUser={currentUser}
              isAdmin={false}
              onMessageSent={handleMessageSent}
              hideHistory={hasMessages && !showMessages}
              userProfileMap={userProfileMap}
              permissionKey="order"
            />
            {/* 已入库且开启了入库后拆单设置，展示申请拆单按钮 */}
            {status === "in_warehouse" && allowSplitAfterWarehouse && (() => {
              // Check if user already has a pending split request
              const hasPendingSplit = (order.messages || []).some(
                m => m.split_request && m.split_request.status === "pending"
              );
              return hasPendingSplit ? (
                <div className="mt-3 flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                  <Scissors className="w-3.5 h-3.5 flex-shrink-0" />
                  已提交拆单申请，等待管理员审批
                </div>
              ) : (
                <button
                  className="mt-3 w-full flex items-center justify-center gap-2 text-xs text-indigo-600 border border-indigo-200 rounded-lg px-3 py-2 hover:bg-indigo-50 transition-colors"
                  onClick={() => setShowSplitModal(true)}
                >
                  <Scissors className="w-3.5 h-3.5" />申请拆单
                </button>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          order={order}
          mode={showPayment === "shipping" ? "shipping" : "prepay"}
          onClose={() => setShowPayment(false)}
          onSuccess={() => {
            setShowPayment(false);
            onAction?.("payment_done");
          }}
        />
      )}

      {showShipment && (
        <UserNotifyShipmentModal
          order={order}
          onClose={() => setShowShipment(false)}
          onSuccess={() => {
            setShowShipment(false);
            onClose(); // close the order detail drawer too
            onAction?.("notify_ship");
          }}
        />
      )}

      {editPool && (
        <ShippingEditModal
          order={order}
          currentPool={editPool}
          currentUser={currentUser}
          onClose={() => setEditPool(null)}
          onSuccess={() => {
            setEditPool(null);
            onClose();
            onAction?.("edit_ship");
          }}
        />
      )}

      {payPool && (
        <ShippingPoolDetailModal
          pool={payPool}
          isAdmin={false}
          currentUser={currentUser}
          onClose={() => setPayPool(null)}
          onUpdated={() => { setPayPool(null); onAction?.("pool_updated"); }}
        />
      )}

      {showSplitModal && (
        <SplitAfterWarehouseModal
          order={order}
          currentUser={currentUser}
          onClose={() => setShowSplitModal(false)}
          onSuccess={() => {
            setShowSplitModal(false);
            onAction?.("split_request_submitted");
          }}
        />
      )}
    </div>
  );
}