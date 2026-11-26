import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Package, AlertCircle, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

function Toggle({ enabled, onToggle, color = "bg-amber-600" }) {
  return (
    <button 
      type="button" 
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? color : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

export default function StorageSettingsManager({ onReload }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    storage_enabled: false,
    default_storage_days: 90,
    default_reminder_days: 60,
    default_storage_fee_per_day: 0,
    storage_fee_currency: 'JPY',
    on_deadline_action: 'change_status',
    deadline_status: 'expired'
  });

  const loadSettings = async () => {
    try {
      const response = await base44.functions.invoke('config/storage/getSettings', {});
      const s = response?.data;
      if (s) {
        setFormData({
          storage_enabled: s.storage_enabled ?? false,
          default_storage_days: s.default_storage_days ?? 90,
          default_reminder_days: s.default_reminder_days ?? 60,
          default_storage_fee_per_day: s.default_storage_fee_per_day ?? 0,
          storage_fee_currency: s.storage_fee_currency || 'JPY',
          on_deadline_action: s.on_deadline_action || 'change_status',
          deadline_status: s.deadline_status || 'expired'
        });
      }
    } catch (error) {
      console.error('加载库存设置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSettings(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await base44.functions.invoke('config/storage/saveSettings', formData);
      if (response?.data) {
        toast.success('库存设置已保存');
        if (onReload) await onReload();
      } else {
        toast.error('保存失败：' + (response?.msg || '未知错误'));
      }
    } catch (error) {
      toast.error('保存失败：' + (error?.response?.data?.message || error.message));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-400">加载中...</div>;
  }

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Package className="w-4 h-4 text-amber-500" />
          库存存放期限管理
        </CardTitle>
        <p className="text-xs text-gray-400 mt-1">设置订单入库后的存放期限、超期处理和仓储管理费</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 总开关 */}
        <div className="flex items-center justify-between pb-3 border-b">
          <div>
            <span className="text-sm font-medium">启用库存存放期限管理</span>
            <p className="text-xs text-gray-400 mt-0.5">开启后系统将自动跟踪订单存放时间并执行超期处理</p>
          </div>
          <Toggle 
            enabled={formData.storage_enabled} 
            onToggle={() => setFormData(prev => ({ ...prev, storage_enabled: !prev.storage_enabled }))} 
            color="bg-amber-600" 
          />
        </div>

        {formData.storage_enabled ? (
          <>
            {/* 存放期限设置 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-gray-500">默认存放期限（天）</Label>
                <Input 
                  type="number" 
                  className="h-8 text-sm mt-1" 
                  value={formData.default_storage_days}
                  onChange={e => setFormData(prev => ({ ...prev, default_storage_days: parseInt(e.target.value) || 0 }))}
                />
                <p className="text-xs text-gray-400 mt-1">订单自入库日起的可存放天数</p>
              </div>
              <div>
                <Label className="text-xs text-gray-500">提醒天数（天）</Label>
                <Input 
                  type="number" 
                  className="h-8 text-sm mt-1" 
                  value={formData.default_reminder_days}
                  onChange={e => setFormData(prev => ({ ...prev, default_reminder_days: parseInt(e.target.value) || 0 }))}
                />
                <p className="text-xs text-gray-400 mt-1">到期前多少天提醒用户</p>
              </div>
            </div>

            {/* 仓储费设置 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-gray-500">每日仓储管理费</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input 
                    type="number" 
                    className="h-8 text-sm flex-1" 
                    value={formData.default_storage_fee_per_day}
                    onChange={e => setFormData(prev => ({ ...prev, default_storage_fee_per_day: parseFloat(e.target.value) || 0 }))}
                  />
                  <Select 
                    value={formData.storage_fee_currency}
                    onValueChange={val => setFormData(prev => ({ ...prev, storage_fee_currency: val }))}
                  >
                    <SelectTrigger className="h-8 text-sm w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="JPY">JPY</SelectItem>
                      <SelectItem value="CNY">CNY</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-gray-400 mt-1">超期后每日追加的费用</p>
              </div>
              <div>
                <Label className="text-xs text-gray-500">到期后行为</Label>
                <Select 
                  value={formData.on_deadline_action}
                  onValueChange={val => setFormData(prev => ({ ...prev, on_deadline_action: val }))}
                >
                  <SelectTrigger className="h-8 text-sm mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="remind_only">仅提醒</SelectItem>
                    <SelectItem value="change_status">变更订单状态</SelectItem>
                    <SelectItem value="add_fee_and_remind">追加费用并提醒</SelectItem>
                    <SelectItem value="add_fee_and_change_status">追加费用并变更状态</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400 mt-1">订单超期后的处理方式</p>
              </div>
            </div>

            {/* 状态变更设置 */}
            {formData.on_deadline_action.includes('change_status') && (
              <div>
                <Label className="text-xs text-gray-500">超期订单状态</Label>
                <Select 
                  value={formData.deadline_status}
                  onValueChange={val => setFormData(prev => ({ ...prev, deadline_status: val }))}
                >
                  <SelectTrigger className="h-8 text-sm mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expired">已超时</SelectItem>
                    <SelectItem value="cancelled">已取消</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400 mt-1">超期后订单变更的状态</p>
              </div>
            )}

            {/* 提示信息 */}
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs text-amber-700 ml-2">
                <strong>💡 说明：</strong><br/>
                - 系统每日自动检查在库订单的存放时间<br/>
                - 存放 {formData.default_reminder_days} 天时发送即将到期提醒<br/>
                - 存放 {formData.default_storage_days} 天时执行超期处理<br/>
                - 外箱模板可单独设置仓储费，优先级高于默认设置
              </AlertDescription>
            </Alert>
          </>
        ) : (
          <Alert className="border-gray-200 bg-gray-50">
            <AlertCircle className="h-4 w-4 text-gray-600" />
            <AlertDescription className="text-xs text-gray-700 ml-2">
              <strong>⚠ 功能已关闭</strong><br/>
              开启后将自动跟踪订单存放时间，并在超期时执行相应处理
            </AlertDescription>
          </Alert>
        )}

        {/* 保存按钮放在开关外面：关闭功能时也要能保存，否则刷新后会回到上次的开启状态 */}
        <Button
          className="bg-amber-600 hover:bg-amber-700 w-full"
          onClick={handleSave}
          disabled={saving}
        >
          <DollarSign className="w-4 h-4 mr-2" />
          {saving ? "保存中..." : "保存设置"}
        </Button>
      </CardContent>
    </Card>
  );
}