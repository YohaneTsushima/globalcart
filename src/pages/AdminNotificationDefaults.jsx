/**
 * AdminNotificationDefaults - 管理员设置新用户默认通知偏好
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Bell, Mail, Save, DollarSign, Package, MessageSquare, Info, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

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
      { key: "pickup_time_scheduled", label: "自取时间已约定，请确认" },
      { key: "pickup_user_confirmed", label: "用户已确认自取时间" },
      { key: "pickup_admin_confirmed", label: "中转地负责人已确认自取时间" },
      { key: "pickup_completed", label: "自取已完成" },
    ]
  },
  {
    key: "order_status",
    label: "订单状态更新",
    icon: Info,
    subtypes: [
      { key: "order_created", label: "订单创建", default_off: true },
      { key: "order_payment_confirmed", label: "订单付款已被确认" },
      { key: "order_purchased", label: "订单已下单" },
      { key: "order_in_warehouse", label: "订单已入库" },
      { key: "order_added_to_pool", label: "订单已添加至发货申请", default_off: true },
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
      { key: "store_template_pending_review", label: "店铺模板审核通知" },
      { key: "storage_upcoming_deadline", label: "仓储期限即将到期", default_off: true },
      { key: "storage_expired", label: "仓储期限已超期", default_off: true },
      { key: "storage_fee_required", label: "需要支付逾期仓储费", default_off: true },
    ]
  },
];

export default function AdminNotificationDefaults() {
  const queryClient = useQueryClient();
  const [globalInApp, setGlobalInApp] = useState(true);
  const [globalEmail, setGlobalEmail] = useState(true);
  const [subtypeSettings, setSubtypeSettings] = useState({});
  const [description, setDescription] = useState("");
  const [targetTenantId, setTargetTenantId] = useState(null); // null = 平台级

  const { data: tenants } = useQuery({
    queryKey: ['all-tenants'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getTenantContext', {});
      return res.data?.tenants || [];
    },
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notification-defaults', targetTenantId],
    queryFn: async () => {
      const res = await base44.functions.invoke('getNotificationDefaults', {});
      return res.data;
    },
  });

  useEffect(() => {
    if (data?.defaults) {
      setGlobalInApp(data.defaults.in_app_enabled ?? true);
      setGlobalEmail(data.defaults.email_enabled ?? true);
      if (data.defaults.notification_settings) {
        setSubtypeSettings(data.defaults.notification_settings);
      }
      setDescription(data.defaults.description || "");
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (settings) => {
      const res = await base44.functions.invoke('manageNotificationDefaults', {
        action: 'save',
        tenant_id: targetTenantId,
        ...settings
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success(targetTenantId ? '租户默认设置已保存' : '平台默认设置已保存');
      refetch();
    },
    onError: (error) => {
      toast.error('保存失败：' + error.message);
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      in_app_enabled: globalInApp,
      email_enabled: globalEmail,
      notification_settings: subtypeSettings,
      description,
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
        <h1 className="text-2xl font-bold text-gray-900">新用户默认通知设置</h1>
        <p className="text-sm text-gray-500 mt-1">设置新注册用户的默认通知偏好</p>
      </div>

      {/* Tenant Selector (Platform Admin Only) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            设置范围
          </CardTitle>
          <CardDescription>平台管理员可选择设置平台级或特定租户的默认值</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={targetTenantId || 'platform'}
            onValueChange={(value) => setTargetTenantId(value === 'platform' ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择设置范围" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="platform">平台级（所有租户）</SelectItem>
              {tenants?.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id}>
                  {tenant.name || tenant.subdomain}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Global Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            全局默认设置
          </CardTitle>
          <CardDescription>新用户注册时的默认通知接收方式</CardDescription>
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
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">设置说明</label>
            <textarea
              className="w-full min-h-[80px] p-2 border rounded-md text-sm"
              placeholder="描述此默认设置的应用场景或说明"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Category Settings */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">分类默认设置</h2>
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
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? '保存中...' : (
            <>
              <Save className="w-4 h-4 mr-2" />
              保存默认设置
            </>
          )}
        </Button>
      </div>

      {/* Usage Guide */}
      <Card>
        <CardHeader>
          <CardTitle>使用说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600">
          <p>• 平台级设置：应用于所有租户的新用户（租户无自定义设置时）</p>
          <p>• 租户级设置：仅应用于指定租户的新用户，优先级高于平台级</p>
          <p>• 用户注册后仍可在个人设置中自定义通知偏好</p>
          <p>• 租户管理员只能设置自己租户的默认值</p>
          <p>• 建议关闭不重要的通知（如订单创建）的邮件提醒，避免打扰用户</p>
        </CardContent>
      </Card>
    </div>
  );
}