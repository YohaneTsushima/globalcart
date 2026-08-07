/**
 * Notifications - 通知中心页面
 */
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, DollarSign, Package, MessageSquare, Info, AlertCircle, Filter, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { createPageUrl } from "@/utils";
import { on, off, send } from "@/lib/socket";
import PaginationBar from "@/components/common/PaginationBar";
import { showDesktopNotification } from "@/lib/notification";

const iconMap = { Bell, DollarSign, Package, MessageSquare, Info, AlertCircle };

const typeColors = {
  payment: "bg-red-100 text-red-700",
  shipping_request: "bg-blue-100 text-blue-700",
  order_status: "bg-green-100 text-green-700",
  message: "bg-purple-100 text-purple-700",
  other: "bg-gray-100 text-gray-700",
  platform: "bg-indigo-100 text-indigo-700",
};

const typeLabels = {
  payment: "付款通知",
  shipping_request: "发货通知",
  order_status: "订单状态",
  message: "留言回复",
  other: "其他通知",
  platform: "平台通知",
};

export default function NotificationsPage() {
  const [searchParams] = useSearchParams();
  const [selectedType, setSelectedType] = useState(searchParams.get('type') || 'all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notifications', selectedType, currentPage, pageSize],
    queryFn: async () => {
      const payload = { page: currentPage, pageSize, unreadOnly: false };
      if (selectedType !== 'all') {
        payload.notification_type = selectedType;
      }
      const res = await base44.functions.invoke('notification/getUserNotifications', payload);
      return res.data;
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async ({ notification_id, mark_all_read = false }) => {
      send('mark_read', { notification_id, mark_all_read });
      return { ok: true };
    },
    onMutate: ({ notification_id, mark_all_read }) => {
      if (mark_all_read) {
        queryClient.setQueryData(['notifications', selectedType, currentPage, pageSize], (old) => {
          if (!old?.notifications) return old;
          return { ...old, notifications: old.notifications.map(n => ({ ...n, is_read: true })) };
        });
      } else if (notification_id) {
        queryClient.setQueryData(['notifications', selectedType, currentPage, pageSize], (old) => {
          if (!old?.notifications) return old;
          return { ...old, notifications: old.notifications.map(n => n.id === notification_id ? { ...n, is_read: true } : n) };
        });
      }
      queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
    },
  });

  const notifications = data?.notifications || [];
  const total = data?.total || 0;

  // WebSocket 实时监听
  const handleNewNotification = useCallback((notification) => {
    if (!notification || typeof notification !== 'object') return;
    queryClient.setQueryData(['notifications', selectedType, currentPage, pageSize], (old) => {
      if (!old?.notifications) return { ...old, notifications: [notification] };
      return { ...old, notifications: [notification, ...old.notifications] };
    });
    queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
    // 弹出桌面通知
    showDesktopNotification(
      notification.title || '新通知',
      notification.content || '',
      notification.related_url ? () => { window.location.href = notification.related_url; } : undefined
    );
  }, [queryClient, selectedType, currentPage, pageSize]);

  useEffect(() => {
    on('notification', handleNewNotification);
    return () => off('notification', handleNewNotification);
  }, [handleNewNotification]);

  const handleMarkAllRead = () => {
    markAsReadMutation.mutate({ mark_all_read: true });
  };

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsReadMutation.mutate({ notification_id: notification.id });
    }
    if (notification.related_url) {
      window.location.href = notification.related_url;
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">通知中心</h1>
          <p className="text-sm text-gray-500 mt-1">查看和管理您的所有通知</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.location.href = createPageUrl('UserNotificationSettings')}>
            <Settings className="w-4 h-4 mr-2" />
            通知设置
          </Button>
          <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={notifications.every(n => n.is_read)}>
            <CheckCheck className="w-4 h-4 mr-2" />
            全部标记为已读
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={selectedType} onValueChange={(v) => { setSelectedType(v); setCurrentPage(1); }}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="payment">付款通知</TabsTrigger>
          <TabsTrigger value="shipping_request">发货通知</TabsTrigger>
          <TabsTrigger value="order_status">订单状态</TabsTrigger>
          <TabsTrigger value="message">留言回复</TabsTrigger>
          <TabsTrigger value="other">其他</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedType} className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Bell className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-sm">暂无通知</p>
            </div>
          ) : (
            <>
            <div className="space-y-3">
              {notifications.map((notification) => {
                const IconComponent = iconMap[notification.icon] || Bell;
                const typeColor = typeColors[notification.notification_type] || typeColors.other;
                const typeLabel = typeLabels[notification.notification_type] || "通知";
                return (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`w-full text-left bg-white border rounded-xl p-4 hover:shadow-md transition-shadow ${
                      !notification.is_read ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${typeColor}`}>
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`text-base font-semibold ${!notification.is_read ? 'text-gray-900' : 'text-gray-700'}`}>
                                {notification.title}
                              </p>
                              {!notification.is_read && (
                                <Badge className="bg-red-100 text-red-700 text-xs">未读</Badge>
                              )}
                              <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
                            </div>
                            <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{notification.content}</p>
                            <p className="text-xs text-gray-400 mt-3">
                              {format(new Date(notification.created_date), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <PaginationBar
              total={total}
              pageSize={pageSize}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
              className="mt-4"
            />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}