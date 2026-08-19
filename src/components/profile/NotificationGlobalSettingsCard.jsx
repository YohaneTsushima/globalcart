/**
 * NotificationGlobalSettingsCard — 通知全局设置（站内/邮件总开关）
 * 详细分类设置请前往通知设置页
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Bell, Mail, Settings, ExternalLink, Save } from "lucide-react";
import { toast } from "sonner";

export default function NotificationGlobalSettingsCard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [globalInApp, setGlobalInApp] = useState(true);
  const [globalEmail, setGlobalEmail] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      const res = await base44.functions.invoke('notification/preference/getNotificationPreferences', {});
      return res.data;
    },
    refetchOnMount: false,
  });

  useEffect(() => {
    if (data?.settings?.preferences) {
      setGlobalInApp(data?.settings?.preferences.in_app_enabled ?? true);
      setGlobalEmail(data?.settings?.preferences.email_enabled ?? true);
    }
  }, [data]);

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
    updateMutation.mutate({
      in_app_enabled: globalInApp,
      email_enabled: globalEmail,
      notification_settings: data?.preferences?.notification_settings || {},
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings className="w-4 h-4 text-blue-500" />通知全局设置
          </CardTitle>
          <CardDescription className="text-xs">控制所有通知的接收方式</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Bell className="w-5 h-5 text-gray-500" />
              <div>
                <p className="text-sm font-medium text-gray-900">站内通知</p>
                <p className="text-xs text-gray-500">在网页右上角显示通知铃铛</p>
              </div>
            </div>
            <Switch checked={globalInApp} onCheckedChange={setGlobalInApp} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Mail className="w-5 h-5 text-gray-500" />
              <div>
                <p className="text-sm font-medium text-gray-900">邮件通知</p>
                <p className="text-xs text-gray-500">通过电子邮件接收重要通知</p>
              </div>
            </div>
            <Switch checked={globalEmail} onCheckedChange={setGlobalEmail} />
          </div>
          <div className="flex justify-end pt-2 border-t border-gray-100">
            <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {updateMutation.isPending ? '保存中...' : '保存设置'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-900">详细通知偏好</p>
            <p className="text-xs text-gray-500 mt-0.5">按通知分类（付款、发货、订单状态、留言等）自定义接收方式</p>
          </div>
          <Button variant="outline" size="sm" className="flex-shrink-0 bg-white" onClick={() => navigate(createPageUrl("UserNotificationSettings"))}>
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />打开通知设置页
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}