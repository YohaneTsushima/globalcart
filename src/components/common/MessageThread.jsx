/**
 * MessageThread
 * 通用留言线程组件，支持订单（Order）和发货池（ShippingPool）
 * 显示对话线程，支持发送文本和图片消息
 */
import { useState, useEffect, useRef } from "react";
import { Send, MessageCircle, Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { usePermissions } from "@/hooks/usePermissions";
import RichTextInput from "@/components/common/RichTextInput";
import UserProfileLink from "@/components/common/UserProfileLink";
import { ImageWithViewer } from "@/components/common/ImageViewer";

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

/**
 * @param {Object} props
 * @param {Object} props.contextObject - 上下文对象（order 或 pool）
 * @param {string} props.contextType - 上下文类型：'order' | 'pool'
 * @param {Object} props.currentUser - 当前用户
 * @param {boolean} props.isAdmin - 是否管理员
 * @param {Function} props.onMessageSent - 消息发送后的回调
 * @param {Object} props.userProfileMap - 用户资料映射 {email: {display_name, avatar_url, ...}}
 * @param {boolean} props.composeOnly - 仅显示输入框，不显示历史消息
 * @param {boolean} props.hideHistory - 隐藏历史消息
 * @param {string} props.permissionKey - 权限键：'order' | 'shipping'（用于检查 message:send_* 权限）
 */
export default function MessageThread({
  contextObject,
  contextType = 'order',
  currentUser,
  isAdmin,
  onMessageSent,
  userProfileMap = {},
  composeOnly = false,
  hideHistory = false,
  permissionKey = 'order',
}) {
  const { can } = usePermissions();

  // 根据类型检查权限
  const canSendMessage = can("message:send_message") || can(`message:send_${permissionKey}_message`);
  const canSendImage = can("message:send_image");
  
  const [localMessages, setLocalMessages] = useState(contextObject.messages || []);
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
      ...(contextType === 'order' && { prev_status: contextObject.order_status }),
    };

    const updatedMessages = [...localMessages, newMsg];

    // 立即更新本地状态（乐观更新）
    setLocalMessages(updatedMessages);
    setContent("");
    setImageUrls([]);

    // 标记对方角色有未读消息
    const unreadRoles = isAdmin ? ["user"] : ["admin"];

    // 根据类型调用不同的更新逻辑
    if (contextType === 'order') {
      const { updateOrder } = await import('@/lib/tenantApi');
      await updateOrder(contextObject.id, {
        messages: updatedMessages,
        unread_roles: unreadRoles,
      });
      
      // 如果是管理员发送的留言，创建通知
      if (isAdmin && contextObject.user_email) {
        try {
          await base44.functions.invoke('createNotification', {
            user_email: contextObject.user_email,
            notification_type: 'message',
            notification_subtype: 'order_message_received',
            title: '您有新的订单留言',
            content: content.trim() || '（图片消息）',
            related_entity_type: 'order',
            related_entity_id: contextObject.id,
            related_url: `/orders/${contextObject.id}`,
            metadata: {
              order_number: contextObject.order_number,
              message_id: newMsg.id
            }
          });
        } catch (error) {
          console.error('创建通知失败:', error);
        }
      }
    } else if (contextType === 'pool') {
      const { shippingPoolApi } = await import('@/lib/tenantApi');
      await shippingPoolApi.update(contextObject.id, {
        messages: updatedMessages,
        unread_roles: unreadRoles,
      });
      
      // 如果是管理员发送的留言，创建通知（发送给池子的所有参与者）
      if (isAdmin) {
        try {
          // 获取池子参与者的邮箱列表
          const participantEmails = [...new Set(
            (contextObject.fee_breakdown_per_user || []).map(b => b.user_email)
          )];
          
          // 如果没有费用明细，使用 creator_email
          if (participantEmails.length === 0 && contextObject.creator_email) {
            participantEmails.push(contextObject.creator_email);
          }
          
          // 为每个参与者创建通知
          for (const email of participantEmails) {
            await base44.functions.invoke('createNotification', {
              user_email: email,
              notification_type: 'message',
              notification_subtype: 'pool_message_received',
              title: '发货池有新留言',
              content: content.trim() || '（图片消息）',
              related_entity_type: 'shipping_pool',
              related_entity_id: contextObject.id,
              related_url: `/shippingpool/${contextObject.id}`,
              metadata: {
                pool_code: contextObject.pool_code,
                message_id: newMsg.id
              }
            });
          }
        } catch (error) {
          console.error('创建通知失败:', error);
        }
      }
    }

    setSending(false);
    onMessageSent?.();
  };

  const getSenderName = (msg) => {
    // 优先使用消息本身存储的名称（发送时设置）
    if (msg.from) return msg.from;
    if (msg.role === "admin") return "客服";
    return msg.from_email ? (userProfileMap[msg.from_email]?.display_name || msg.from_email) : 
           (contextObject.user_name || contextObject.creator_name || "匿名");
  };

  const getSenderAvatar = (msg) => {
    // 优先使用消息本身存储的头像
    return (msg.avatar_url || null) || 
           (msg.from_email ? (userProfileMap[msg.from_email]?.avatar_url || null) : null);
  };

  const messages = localMessages;

  return (
    <div className="space-y-4">
      {/* 消息历史 */}
      {!hideHistory && messages.length === 0 && (
        <div className="text-center py-4 text-gray-400 text-sm">
          <MessageCircle className="w-7 h-7 mx-auto mb-2 opacity-30" />
          暂无留言，可在下方发起留言
        </div>
      )}
      {!hideHistory && messages.length > 0 && (
        <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
          {messages.map((msg) => {
            const isMine = isAdmin ? msg.role === "admin" : msg.role === "user";
            const senderName = getSenderName(msg);
            const senderAvatar = getSenderAvatar(msg);
            const isAdminMsg = msg.role === "admin";

            return (
              <div key={msg.id} className={`flex gap-2.5 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                {/* 头像 */}
                <div className="flex-shrink-0 mt-0.5">
                  <Avatar
                    name={isAdminMsg ? "客服" : senderName}
                    imageUrl={senderAvatar}
                  />
                </div>

                {/* 气泡 */}
                <div className={`flex flex-col max-w-[75%] ${isMine ? "items-end" : "items-start"}`}>
                  {/* 发送者信息行 */}
                  <div className={`flex items-center gap-1.5 mb-1 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                    {!isAdminMsg && msg.from_email ? (
                      <UserProfileLink email={msg.from_email} name={senderName} className="text-xs font-medium text-gray-700" />
                    ) : (
                      <span className="text-xs font-medium text-gray-700">{senderName}</span>
                    )}
                    <span className="text-xs text-gray-400">{formatTime(msg.timestamp)}</span>
                  </div>

                  {/* 内容 */}
                  <div className={`rounded-2xl px-3.5 py-2.5 text-sm ${
                    isMine
                      ? "bg-gray-900 text-white rounded-tr-sm"
                      : "bg-gray-100 text-gray-800 rounded-tl-sm"
                  }`}>
                    {msg.content && <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>}
                    {msg.image_url && (
                      <ImageWithViewer src={msg.image_url} alt="留言图片">
                        <img src={msg.image_url} alt="附图" className="mt-2 rounded-lg max-h-40 cursor-pointer" />
                      </ImageWithViewer>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {/* 输入框 */}
      {canSendMessage ? (
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
        />
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