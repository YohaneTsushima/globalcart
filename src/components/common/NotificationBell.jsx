/**
 * 通知铃铛组件 - 显示未读通知数量和下拉菜单
 * 支持 WebSocket 实时推送
 */
import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, DollarSign, ExternalLink, Package, MessageSquare, Info, AlertCircle, Filter, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { createPageUrl } from "@/utils";
import { on, off, send } from "@/lib/socket";
import { usePermissions } from "@/hooks/usePermissions";
import { requestNotificationPermission, showDesktopNotification } from "@/lib/notification";
import { Send } from "lucide-react";

const iconMap = {
  Bell: Bell,
  DollarSign: DollarSign,
  Package: Package,
  MessageSquare: MessageSquare,
  Info: Info,
  AlertCircle: AlertCircle,
  Filter: Filter,
  Settings: Settings
};



const typeColors = {
  payment: "bg-red-100 text-red-700",
  shipping_request: "bg-blue-100 text-blue-700",
  order_status: "bg-green-100 text-green-700",
  message: "bg-purple-100 text-purple-700",
  cancellation: "bg-orange-100 text-orange-700",
  other: "bg-gray-100 text-gray-700",
  platform: "bg-indigo-100 text-indigo-700",
};

export default function NotificationBellComponent() {
  const [isOpen, setIsOpen] = useState(false);
  const [showNewNotificationTip, setShowNewNotificationTip] = useState(false);
  const [lastNotification, setLastNotification] = useState(null);
  const [, forceUpdate] = useState(0);
  const queryClient = useQueryClient();
  const { isAdmin, user } = usePermissions();

  const { data: unreadData, refetch: refetchUnread } = useQuery({
    queryKey: ['notification-unread-count'],
    queryFn: async () => {
      if(!user) return { unread_count: 0 };
      const res = await base44.functions.invoke('notification/getUnreadNotificationCount', {});
      let un_read = {unread_count: res.data};
      return un_read;
      // return { unread_count: 4 };
    },
    enabled: !!user,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  const { data: notificationsData, refetch: refetchNotifications } = useQuery({
    queryKey: ['notification-recent-unread'],
    queryFn: async () => {
      if(!user) return { notifications: [] };
      const res = await base44.functions.invoke('notification/getUnReadUserNotifications', { limit: 7, skip: 0 });
      let notifications = {'notifications': res?.data };
      return notifications;
      // return {
      //   notifications: [
      //     {
      //       id: 'mock-1',
      //       title: '订单需付款',
      //       content: '您的订单 #12345 已创建，请在24小时内完成付款',
      //       notification_type: 'payment',
      //       is_read: false,
      //       created_date: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      //       icon: 'DollarSign',
      //       related_url: '/zhcn/MyOrders',
      //     },
      //     {
      //       id: 'mock-2',
      //       title: '订单已发货',
      //       content: '您的订单 #12345 已发货，物流单号：SF1234567890',
      //       notification_type: 'shipping_request',
      //       is_read: false,
      //       created_date: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      //       icon: 'Bell',
      //       related_url: '/zhcn/MyOrders',
      //     },
      //     {
      //       id: 'mock-3',
      //       title: '订单已签收',
      //       content: '您的订单 #12345 已被签收，如有问题请联系客服',
      //       notification_type: 'order_status',
      //       is_read: true,
      //       created_date: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      //       icon: 'Bell',
      //       related_url: '/zhcn/MyOrders',
      //     },
      //     {
      //       id: 'mock-4',
      //       title: '新消息',
      //       content: '您收到一条来自卖家的消息',
      //       notification_type: 'message',
      //       is_read: false,
      //       created_date: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      //       icon: 'MessageSquare',
      //       related_url: '/zhcn/MyOrders',
      //     },{
      //       id: 'mock-5',
      //       title: '订单已入库',
      //       content: '您的订单 #12345 已入库，物流单号：SF1234567890',
      //       notification_type: 'order_status',
      //       is_read: false,
      //       created_date: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      //       icon: 'Package',
      //       related_url: '/zhcn/MyOrders',
      //     },
      //   ],
      // };
    },
    enabled: !!user,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async ({ notification_id, mark_all_read = false }) => {
      send('mark_read', { notification_id, mark_all_read });
      return { ok: true };
    },
    onMutate: ({ notification_id, mark_all_read }) => {
      if (mark_all_read) {
        queryClient.setQueryData(['notification-unread-count'], { unread_count: 0 });
        queryClient.setQueryData(['notification-recent-unread'], (old) => {
          if (!old?.notifications) return old;
          return { ...old, notifications: old.notifications.map(n => ({ ...n, is_read: true })) };
        });
      } else if (notification_id) {
        queryClient.setQueryData(['notification-unread-count'], (old) => ({
          unread_count: Math.max(0, (old?.unread_count || 1) - 1)
        }));
        queryClient.setQueryData(['notification-recent-unread'], (old) => {
          if (!old?.notifications) return old;
          return { ...old, notifications: old.notifications.map(n => n.id === notification_id ? { ...n, is_read: true } : n) };
        });
      }
    },
  });

  // WebSocket 实时监听
  const handleNewNotification = useCallback((notification) => {
    if(!user) return;
    if (!notification || typeof notification !== 'object') return;
    
    queryClient.setQueryData(['notification-unread-count'], (old) => ({
      unread_count: (old?.unread_count || 0) + 1
    }));
    queryClient.setQueryData(['notification-recent-unread'], (old) => {
      if (!old?.notifications) return { notifications: [notification] };
      return { ...old, notifications: [notification, ...old.notifications].slice(0, 7) };
    });
    
    // 强制重新获取数据（触发组件重新渲染）
    Promise.all([refetchUnread(), refetchNotifications()]).then(() => {
      // 强制组件重新渲染
      forceUpdate(prev => prev + 1);
    });
    
    // 刷新当前页面的所有数据
    queryClient.invalidateQueries({ refetchType: 'all' });
    // 特别刷新订单查询
    queryClient.invalidateQueries({ queryKey: ['my-orders'] });
    
    // 显示新通知提示
    setLastNotification(notification);
    setShowNewNotificationTip(true);
    
    // 弹出桌面通知
    showDesktopNotification(
      notification.title || '新通知',
      notification.content || '',
      notification.related_url ? () => { window.location.href = notification.related_url; } : undefined
    );
  }, [queryClient, refetchUnread, refetchNotifications]);

  useEffect(() => {
    on('notification', handleNewNotification);
    return () => off('notification', handleNewNotification);
  }, [handleNewNotification]);

  const unreadCount = unreadData?.unread_count || 0;
  const notifications = notificationsData?.notifications || [];

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsReadMutation.mutate({ notification_id: notification.id });
    }
    if (notification.related_url) {
      window.location.href = notification.related_url;
    } else {
      setIsOpen(false);
    }
  };

  const handleMarkAllRead = () => {
    markAsReadMutation.mutate({ mark_all_read: true });
  };

  const handleViewAll = () => {
    setIsOpen(false);
    window.location.href = createPageUrl('Notifications');
  };

  const handleTestSend = () => {
    send('send_notification_test', {
      user_email: user?.email,
      notification_type: 'payment',
      notification_subtype: 'order_payment_required',
      title: '订单需付款',
      content: `${user?.displayName || user?.full_name || '用户'}的订单已创建，等待付款`,
      related_url: '/zhcn/MyOrders',
    });
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="relative h-9 px-2 hover:bg-gray-100"
        onClick={() => {
          setIsOpen(!isOpen);
          setShowNewNotificationTip(false);
          requestNotificationPermission();
        }}
      >
        <Bell className="w-4 h-4 text-gray-600" />
        {unreadCount > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center p-0">
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>
      
      {/* 新通知提示 */}
      {showNewNotificationTip && !isOpen && (
        <div 
          className="absolute right-0 top-full mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50 cursor-pointer hover:shadow-xl transition-shadow"
          onClick={() => {
            setIsOpen(true);
            setShowNewNotificationTip(false);
          }}
        >
          <div className="px-3 py-2 bg-blue-50 border-b border-blue-100 rounded-t-lg">
            <p className="text-xs font-medium text-blue-700">新通知</p>
          </div>
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-gray-900 truncate">{lastNotification?.title || '新通知'}</p>
            <p className="text-xs text-gray-500 truncate mt-0.5">{lastNotification?.content || ''}</p>
          </div>
          <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 rounded-b-lg">
            <p className="text-xs text-blue-600">点击查看详情</p>
          </div>
        </div>
      )}

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">通知中心</h3>
                {unreadCount > 0 && (
                  <Badge className="bg-red-100 text-red-700 text-xs">{unreadCount} 未读</Badge>
                )}
              </div>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleMarkAllRead}>
                  <CheckCheck className="w-3.5 h-3.5 mr-1" />
                  全部已读
                </Button>
              )}
            </div>

            <div className="px-3 py-2 border-b border-gray-100 flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => { setIsOpen(false); window.location.href = createPageUrl('Notifications') + '?type=payment'; }}>
                <DollarSign className="w-3 h-3 mr-1" />
                付款通知
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => { setIsOpen(false); window.location.href = createPageUrl('Notifications'); }}>
                全部通知
              </Button>
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Bell className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm">暂无未读通知</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {notifications.map((notification) => {
                    const IconComponent = iconMap[notification.icon] || Bell;
                    const typeColor = typeColors[notification.notification_type] || typeColors.other;
                    return (
                      <button
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${!notification.is_read ? 'bg-blue-50/50' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${typeColor}`}>
                            <IconComponent className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${!notification.is_read ? 'text-gray-900' : 'text-gray-600'}`}>
                              {notification.title}
                            </p>
                            <p className="text-xs text-gray-500 truncate mt-0.5">{notification.content}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {format(new Date(notification.updated_date.replace('Z', '')), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => { setIsOpen(false); window.location.href = createPageUrl('Notifications'); }}>
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                查看全部通知
              </Button>
              {!isAdmin && (
                <Button variant="outline" size="sm" className="h-8 px-2" onClick={handleTestSend} title="测试：发送通知给管理员">
                  <Send className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
