/**
 * OrderMessageThread
 * Displays a conversation thread for an order (admin ↔ user).
 * Fix: message list updates immediately after sending (local state append).
 * Feature: shows sender avatar, name, and timestamp.
 */
import { useState, useEffect, useRef } from "react";
import { Send, MessageCircle, Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { usePermissions } from "@/hooks/usePermissions";
import { updateOrder } from "@/lib/tenantApi";
import RichTextInput from "@/components/common/RichTextInput";
import UserProfileLink from "@/components/common/UserProfileLink";
import OrderCancellationModule from "@/components/orders/OrderCancellationModule";

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Avatar({ name, imageUrl, size = "sm" }) {
  const dim = size === "sm" ? "w-7 h-7 text-xs" : "w-8 h-8 text-sm";
  if (imageUrl) {
    return <img src={imageUrl} alt={name} className={`${dim} rounded-full object-cover flex-shrink-0 border border-gray-200`} />;
  }
  return (
    <div className={`${dim} rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 font-medium text-gray-600`}>
      {(name || "?")[0].toUpperCase()}
    </div>
  );
}

export default function OrderMessageThread({ 
  order, 
  currentUser, 
  isAdmin, 
  onMessageSent, 
  contactInfo, 
  composeOnly = false, 
  hideHistory = false, 
  userProfileMap = {},
}) {
  const [showCancelModule, setShowCancelModule] = useState(false);
  const { can } = usePermissions();
  // Allow if user has parent permission OR specific child permission
  const canSendMessage = can("message:send_message") || can("message:send_order_message");
  const canSendImage = can("message:send_image");
  
  // 不允许取消的订单状态
  const nonCancellableStatuses = ['transit_shipped', 'shipped', 'delivered', 'cancelled', 'archived'];
  const canCancelOrder = !nonCancellableStatuses.includes(order.order_status);
  
  const [localMessages, setLocalMessages] = useState(order.messages || []);
  const [content, setContent] = useState("");
  const [imageUrls, setImageUrls] = useState([]);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  const handleSend = async () => {
    if (!content.trim() && imageUrls.length === 0) return;
    setSending(true);

    const userData = userProfileMap[currentUser.email] || {};
    const displayName = userData.display_name || userData.full_name || currentUser.full_name || currentUser.email;
    const newMsg = {
      id: Date.now().toString(),
      from: displayName,
      from_email: currentUser.email,
      avatar_url: userData.avatar_url || currentUser.avatar_url || '',
      role: isAdmin ? "admin" : "user",
      content: content.trim(),
      image_url: imageUrls[0] || "",
      timestamp: new Date().toISOString(),
      prev_status: order.order_status,
    };

    const updatedMessages = [...localMessages, newMsg];

    // Optimistically update local state immediately
    setLocalMessages(updatedMessages);
    setContent("");
    setImageUrls([]);

    // 标记对方角色有未读消息
    const unreadRoles = isAdmin ? ["user"] : ["admin"];

    const updates = {
      messages: updatedMessages,
      unread_roles: unreadRoles,
    };

    await updateOrder(order.id, updates);
    
    // 如果是管理员/系统发送的留言，创建通知
    if (isAdmin && order.user_email) {
      try {
        await base44.functions.invoke('createNotification', {
          user_email: order.user_email,
          notification_type: 'message',
          notification_subtype: 'order_message_received',
          title: '您有新的订单留言',
          content: content.trim() || '（图片消息）',
          related_entity_type: 'order',
          related_entity_id: order.id,
          related_url: `/orders/${order.id}`,
          metadata: {
            order_number: order.order_number,
            message_id: newMsg.id
          }
        });
      } catch (error) {
        console.error('创建通知失败:', error);
      }
    }
    
    setSending(false);
    onMessageSent?.();
  };

  const getSenderName = (msg) => {
    // Always prefer the name stored on the message itself (set at send time with display_name)
    if (msg.from) return msg.from;
    if (msg.role === "admin") return "客服";
    return msg.from_email ? (userProfileMap[msg.from_email]?.display_name || msg.from_email) : (order.user_name || "匿名");
  };

  const getSenderAvatar = (msg) => {
    // Always prefer the avatar stored on the message itself (set at send time)
    // Treat empty string as missing (falsy check covers both null and "")
    return (msg.avatar_url || null) || (msg.from_email ? (userProfileMap[msg.from_email]?.avatar_url || null) : null);
  };

  return (
    <div className="space-y-4">
      {/* Message history */}
      {!hideHistory && localMessages.length === 0 && (
        <div className="text-center py-4 text-gray-400 text-sm">
          <MessageCircle className="w-7 h-7 mx-auto mb-2 opacity-30" />
          暂无留言，可在下方发起留言
        </div>
      )}
      {!hideHistory && localMessages.length > 0 && (
        <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
          {localMessages.map((msg) => {
            const isMine = isAdmin ? msg.role === "admin" : msg.role === "user";
            const senderName = getSenderName(msg);
            const senderAvatar = getSenderAvatar(msg);
            const isAdminMsg = msg.role === "admin";

            return (
              <div key={msg.id} className={`flex gap-2.5 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                {/* Avatar */}
                <div className="flex-shrink-0 mt-0.5">
                  <Avatar
                    name={isAdminMsg ? "客服" : senderName}
                    imageUrl={senderAvatar}
                  />
                </div>

                {/* Bubble */}
                <div className={`flex flex-col max-w-[75%] ${isMine ? "items-end" : "items-start"}`}>
                  {/* Sender info row */}
                  <div className={`flex items-center gap-1.5 mb-1 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                    {!isAdminMsg && msg.from_email ? (
                      <UserProfileLink email={msg.from_email} name={senderName} className="text-xs font-medium text-gray-700" />
                    ) : (
                      <span className="text-xs font-medium text-gray-700">{senderName}</span>
                    )}
                    <span className="text-xs text-gray-400">{formatTime(msg.timestamp)}</span>
                  </div>

                  {/* Content */}
                  <div className={`rounded-2xl px-3.5 py-2.5 text-sm ${
                    isMine
                      ? "bg-gray-900 text-white rounded-tr-sm"
                      : "bg-gray-100 text-gray-800 rounded-tl-sm"
                  }`}>
                    {msg.content && <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>}
                    {msg.image_url && (
                      <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                        <img src={msg.image_url} alt="附图" className="mt-2 rounded-lg max-h-40 cursor-pointer" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Compose */}
      {canSendMessage ? (
        showCancelModule ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">取消订单</span>
              <button 
                onClick={() => setShowCancelModule(false)}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                返回留言
              </button>
            </div>
            <OrderCancellationModule 
              order={order} 
              compact 
              isAdmin={isAdmin}
              onSuccess={() => {
                setShowCancelModule(false);
                onMessageSent?.();
              }} 
            />
          </div>
        ) : (
          <RichTextInput
            value={content}
            onChange={setContent}
            imageUrls={imageUrls}
            onImageUrls={canSendImage ? setImageUrls : undefined}
            onSubmit={handleSend}
            placeholder="输入留言内容... (Ctrl+Enter 发送)"
            rows={3}
            maxImages={1}
            disabled={!canSendMessage}
            submitLoading={sending}
            submitLabel="发送留言"
            className="border-gray-200"
            footerActions={
              canCancelOrder ? (
                <button
                  type="button"
                  onClick={() => setShowCancelModule(true)}
                  className="px-3 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors whitespace-nowrap"
                >
                  取消订单
                </button>
              ) : null
            }
          />
        )
      ) : (
        <div className="border border-gray-200 rounded-xl p-3 bg-gray-50 text-center">
          <div className="flex items-center justify-center gap-2 text-gray-500 text-sm">
            <Lock className="w-4 h-4" />
            您没有权限发送留言
          </div>
        </div>
      )}
    </div>
  );
}