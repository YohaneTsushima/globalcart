/**
 * UserNotificationSettings - 用户通知偏好设置
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Mail, Settings, DollarSign, Package, MessageSquare, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import ConfirmDialog from "@/components/common/ConfirmDialog";

const notificationCategories = [
  {
    key: "payment",
    label: "付款通知",
    icon: DollarSign,
    subtypes: [
      { key: "order_payment_required", label: "订单需付款" },
      { key: "order_supplement_required", label: "订单需补款" },
      { key: "shipping_fee_required", label: "需付运费" },
      { key: "shipping_fee_supplement_required", label: "需补运费" },
    ]
  },
  {
    key: "shipping_request",
    label: "发货通知",
    icon: Package,
    subtypes: [
      { key: "shipping_request_sent", label: "发货申请已发出" },
      { key: "shipping_request_arrived", label: "发货申请已送达中转地" },
      { key: "transit_shipped", label: "中转地已发货" },
    ]
  },
  {
    key: "order_status",
    label: "订单状态更新",
    icon: Info,
    subtypes: [
      { key: "order_created", label: "订单创建", default_off: true },
      { key: "order_payment_confirmed", label: "订单付款已被确认" },
      { key: "shipping_payment_confirmed", label: "运费付款已被确认" },
      { key: "order_purchased", label: "订单已下单" },
      { key: "order_in_warehouse", label: "订单已入库" },
      { key: "order_added_to_pool", label: "订单已添加至发货申请", default_off: true },
      { key: "order_request_edit_created", label: "订单更改创建" },
      { key: "order_request_edit_approved", label: "订单更改申请被批准" },
      { key: "order_request_edit_rejected", label: "订单更改申请被拒绝" },
    ]
  },
  {
    key: "message",
    label: "留言回复",
    icon: MessageSquare,
    subtypes: [
      { key: "new_reply", label: "订单/发货申请有新回复" },
    ]
  },
  {
    key: "other",
    label: "其他通知",
    icon: Info,
    subtypes: [
      { key: "store_template_pending_review", label: "店铺模板提交待审核（管理员）" },
      { key: "store_template_reviewed", label: "店铺模板审核结果通知（用户）" },
      { key: "storage_upcoming_deadline", label: "仓储期限即将到期", default_off: true },
      { key: "storage_expired", label: "仓储期限已超期", default_off: true },
      { key: "storage_fee_required", label: "需要支付逾期仓储费", default_off: true },
    ]
  },
];

export default function UserNotificationSettings() {
  const queryClient = useQueryClient();
  const [globalInApp, setGlobalInApp] = useState(true);
  const [globalEmail, setGlobalEmail] = useState(true);
  const [subtypeSettings, setSubtypeSettings] = useState({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Fetch preferences
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      const res = await base44.functions.invoke('notification/preference/getNotificationPreferences', {});
      return res.data?.settings;
    },
  });

  // Initialize settings from fetched data
  useEffect(() => {
    if (data?.preferences) {
      setGlobalInApp(data.preferences.in_app_enabled ?? true);
      setGlobalEmail(data.preferences.email_enabled ?? true);
      if (data.preferences.notification_settings) {
        setSubtypeSettings(data.preferences.notification_settings);
      }
    }
  }, [data]);

  // Update preferences mutation
  const updateMutation = useMutation({
    mutationFn: async (settings) => {
      const res = await base44.functions.invoke('notification/preference/updateNotificationPreferences', settings);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast.success('设置已保存');
    },
  });

  const handleSave = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmSave = () => {
    setShowConfirmDialog(false);
    const fullSettings = {};
    notificationCategories.forEach(cat => {
      cat.subtypes.forEach(sub => {
        fullSettings[sub.key] = {
          in_app: subtypeSettings[sub.key]?.in_app ?? !sub.default_off,
          email: subtypeSettings[sub.key]?.email ?? false,
        };
      });
    });
    updateMutation.mutate({
      in_app_enabled: globalInApp,
      email_enabled: globalEmail,
      notification_settings: fullSettings,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">通知设置</h1>
        <p className="text-sm text-gray-500 mt-1">管理您的通知偏好和提醒方式</p>
      </div>

      {/* Global Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            全局设置
          </CardTitle>
          <CardDescription>控制所有通知的接收方式</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-gray-500" />
              <div>
                <p className="text-sm font-medium text-gray-900">站内通知</p>
                <p className="text-xs text-gray-500">在网页右上角显示通知铃铛</p>
              </div>
            </div>
            <Switch
              checked={globalInApp}
              onCheckedChange={setGlobalInApp}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-gray-500" />
              <div>
                <p className="text-sm font-medium text-gray-900">邮件通知</p>
                <p className="text-xs text-gray-500">通过电子邮件接收重要通知</p>
              </div>
            </div>
            <Switch
              checked={globalEmail}
              onCheckedChange={setGlobalEmail}
            />
          </div>
        </CardContent>
      </Card>

      {/* Category Settings */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">分类设置</h2>
        {notificationCategories.map((category) => {
          const IconComponent = category.icon;
          return (
            <Card key={category.key}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconComponent className="w-5 h-5" />
                  {category.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {category.subtypes.map((subtype) => (
                  <div key={subtype.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {subtype.default_off ? '默认关闭' : '默认开启'}
                      </Badge>
                      <span className="text-sm text-gray-700">{subtype.label}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">站内</span>
                        <Switch
                          checked={subtypeSettings[subtype.key]?.in_app ?? !subtype.default_off}
                          onCheckedChange={(checked) => {
                            setSubtypeSettings(prev => ({
                              ...prev,
                              [subtype.key]: {
                                ...prev[subtype.key],
                                in_app: checked,
                              }
                            }));
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">邮件</span>
                        <Switch
                          checked={subtypeSettings[subtype.key]?.email ?? false}
                          onCheckedChange={(checked) => {
                            setSubtypeSettings(prev => ({
                              ...prev,
                              [subtype.key]: {
                                ...prev[subtype.key],
                                email: checked,
                              }
                            }));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          className="bg-red-600 hover:bg-red-700"
          onClick={handleSave}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? '保存中...' : '保存设置'}
        </Button>
      </div>

      <ConfirmDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        title="保存通知设置"
        description="确定要保存当前的通知偏好设置吗？"
        confirmText="确认保存"
        cancelText="取消"
        onConfirm={handleConfirmSave}
        onCancel={() => setShowConfirmDialog(false)}
      />
    </div>
  );
}