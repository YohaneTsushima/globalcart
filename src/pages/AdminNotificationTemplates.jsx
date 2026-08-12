/**
 * AdminNotificationTemplates - 管理员通知模板管理页面
 */
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Edit2, Trash2, Save, X, Mail, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { tenantEntity } from "@/lib/tenantApi";
import ConfirmDialog from "@/components/common/ConfirmDialog";

const notificationTypes = [
  { value: "payment", label: "付款通知" },
  { value: "shipping_request", label: "发货通知" },
  { value: "order_status", label: "订单状态" },
  { value: "message", label: "留言回复" },
  { value: "cancellation", label: "订单取消" },
  { value: "other", label: "其他通知" },
];

const commonSubtypes = {
  payment: [
    { value: "order_payment_required", label: "订单需付款" },
    { value: "order_supplement_required", label: "订单需补款" },
    { value: "shipping_fee_required", label: "需付运费" },
    { value: "shipping_fee_supplement_required", label: "需补运费" },
  ],
  shipping_request: [
    { value: "shipping_request_sent", label: "发货申请已发出" },
    { value: "shipping_request_arrived", label: "发货申请已送达中转地" },
    { value: "transit_shipped", label: "中转地已发货" },
  ],
  order_status: [
    { value: "order_created", label: "订单创建" },
    { value: "order_payment_confirmed", label: "订单付款已被确认" },
    { value: "order_purchased", label: "订单已下单" },
    { value: "order_in_warehouse", label: "订单已入库" },
    { value: "order_added_to_pool", label: "订单已添加至发货申请" },
  ],
  message: [
    { value: "new_reply", label: "订单/发货申请有新回复" },
  ],
  cancellation: [
    { value: "order_cancelled_with_refund", label: "订单取消（有退款）" },
    { value: "order_cancelled_no_refund", label: "订单取消（无退款）" },
  ],
  other: [
    { value: "store_template_pending_review", label: "店铺模板提交待审核（管理员）" },
    { value: "store_template_reviewed", label: "店铺模板审核结果通知（用户）" },
    { value: "storage_upcoming_deadline", label: "仓储期限即将到期" },
    { value: "storage_expired", label: "仓储期限已超期" },
    { value: "storage_fee_required", label: "需要支付逾期仓储费" },
  ],
};

// 扁平化子类型映射：value -> label
const subtypeLabelMap = Object.values(commonSubtypes)
  .flat()
  .reduce((acc, item) => {
    acc[item.value] = item.label;
    return acc;
  }, {});

export default function AdminNotificationTemplates() {
  const queryClient = useQueryClient();
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedType, setSelectedType] = useState("all");
  const [formData, setFormData] = useState({});
  const [validationErrors, setValidationErrors] = useState({
    title_template: false,
    content_template: false,
  });
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  const { data: templates } = useQuery({
    queryKey: ['notification-templates'],
    queryFn: async () => {
      // const res = await base44.functions.invoke('getNotificationTemplates', {});
      const res = await tenantEntity.list('NotificationTemplate');
      return res || res?.data || res.data.templates || [];
    },
  });

  const manageTemplateMutation = useMutation({
    mutationFn: async (data) => {
      const res = await base44.functions.invoke('manageNotificationTemplate', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('操作成功');
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      setEditingTemplate(null);
      setIsCreating(false);
    },
    onError: (error) => {
      toast.error('操作失败：' + error.message);
    },
  });

  const validateTemplates = () => {
    const errors = {
      title_template: !formData.title_template?.includes('{{order_number}}'),
      content_template: !formData.content_template?.includes('{{order_number}}'),
    };
    setValidationErrors(errors);

    if (errors.title_template || errors.content_template) {
      toast.error('模板中必须包含 {{order_number}} 变量');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!formData.notification_type || !formData.notification_subtype) {
      toast.error('请选择通知类型和子类型');
      return;
    }
    if (!formData.title_template || !formData.content_template) {
      toast.error('请填写标题和内容模板');
      return;
    }
    if (!validateTemplates()) return;

    // 确保布尔值正确
    const payload = {
      ...formData,
      default_in_app: formData.default_in_app !== false,
      default_email: formData.default_email === true,
    };

    try {
      if (editingTemplate) {
        await tenantEntity.update('NotificationTemplate', editingTemplate.id, payload);
        toast.success('模板已更新');
      } else {
        await tenantEntity.create('NotificationTemplate', payload);
        toast.success('模板已创建');
      }

      queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      setEditingTemplate(null);
      setFormData({});
      setIsCreating(false);
    } catch (error) {
      const serverMsg = error.response?.data?.message || error.message;
      const subtypeMatch = serverMsg.match(/:\s*\{?\s*(\w+)\s*\}?/);
      if (subtypeMatch && subtypeLabelMap[subtypeMatch[1]]) {
        toast.error(`该通知子类型已存在：${subtypeLabelMap[subtypeMatch[1]]}`);
      } else {
        toast.error('保存失败：' + serverMsg);
      }
    }
  };

  const handleDelete = (templateId) => {
    setDeleteTargetId(templateId);
  };

  const confirmDelete = async () => {
    try {
      await tenantEntity.delete('NotificationTemplate', deleteTargetId);
      toast.success('模板已删除');
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      if (editingTemplate?.id === deleteTargetId) {
        setEditingTemplate(null);
        setFormData({});
      }
    } catch (error) {
      toast.error('删除失败：' + (error.response?.data?.message || error.message));
    } finally {
      setDeleteTargetId(null);
    }
  };

  const filteredTemplates = templates?.filter(t => selectedType === "all" || t.notification_type === selectedType) || [];
  const availableSubtypes = commonSubtypes[selectedType] || [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">通知模板管理</h1>
          <p className="text-sm text-gray-500 mt-1">自定义各类通知的标题和内容模板</p>
        </div>
        <Button onClick={() => { setEditingTemplate(null); setFormData({}); setIsCreating(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          新建模板
        </Button>
      </div>

      {/* Create/Edit Form */}
      {(isCreating || editingTemplate) && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingTemplate ? '编辑模板' : '新建模板'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">通知类型</label>
                <Select
                  value={formData.notification_type || ''}
                  onValueChange={(value) => {
                    setSelectedType(value);
                    setFormData({ 
                      ...formData, 
                      notification_type: value,
                      notification_subtype: '' 
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {notificationTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">通知子类型</label>
                <Select
                  value={formData.notification_subtype || ''}
                  onValueChange={(value) => setFormData({ ...formData, notification_subtype: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择子类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSubtypes.map((subtype) => (
                      <SelectItem key={subtype.value} value={subtype.value}>
                        {subtype.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                标题模板 <span className="text-gray-400 text-xs">(支持变量：{'{{order_number}}'}, {'{{amount}}'}, {'{{user_name}}'})</span>
              </label>
              <Input
                placeholder="例如：订单 {'{{order_number}}'} 需要付款"
                value={formData.title_template || ''}
                onChange={(e) => {
                  setFormData({ ...formData, title_template: e.target.value });
                  if (validationErrors.title_template) {
                    setValidationErrors(prev => ({ ...prev, title_template: false }));
                  }
                }}
                className={validationErrors.title_template ? 'border-red-500 focus-visible:ring-red-500' : ''}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                内容模板 <span className="text-gray-400 text-xs">(支持 HTML/Markdown 和变量)</span>
              </label>
              <Textarea
                placeholder="例如：尊敬的 {'{{user_name}}'}，您的订单 {'{{order_number}}'} 金额为 {'{{amount}}'} JPY，请及时付款。"
                value={formData.content_template || ''}
                onChange={(e) => {
                  setFormData({ ...formData, content_template: e.target.value });
                  if (validationErrors.content_template) {
                    setValidationErrors(prev => ({ ...prev, content_template: false }));
                  }
                }}
                className={`min-h-[120px] ${validationErrors.content_template ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.default_in_app !== false}
                  onChange={(e) => setFormData({ ...formData, default_in_app: e.target.checked })}
                  className="h-4 w-4"
                />
                <span className="text-sm text-gray-700 flex items-center gap-1">
                  <Bell className="w-4 h-4" />
                  默认开启站内通知
                </span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.default_email || false}
                  onChange={(e) => setFormData({ ...formData, default_email: e.target.checked })}
                  className="h-4 w-4"
                />
                <span className="text-sm text-gray-700 flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  默认开启邮件通知
                </span>
              </label>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setEditingTemplate(null); setFormData({}); setIsCreating(false); }}>
                <X className="w-4 h-4 mr-2" />
                取消
              </Button>
              <Button 
                onClick={handleSave}
                disabled={!formData.notification_type || !formData.notification_subtype || !formData.title_template || !formData.content_template}
              >
                <Save className="w-4 h-4 mr-2" />
                保存
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Template List with Filter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-gray-600">筛选类型：</span>
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="全部类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            {notificationTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="ml-2">
          共 {filteredTemplates.length} 个模板
        </Badge>
      </div>

      <div className="grid gap-4">
        {filteredTemplates.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>暂无通知模板</p>
              <p className="text-sm mt-1">点击右上角"新建模板"创建第一个模板</p>
            </CardContent>
          </Card>
        ) : (
          filteredTemplates.map((template) => (
            <Card key={template.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {notificationTypes.find(t => t.value === template.notification_type)?.label || template.notification_type}
                      </Badge>
                      <span className="text-sm font-medium text-gray-600">{subtypeLabelMap[template.notification_subtype] || template.notification_subtype}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Bell className={`w-3 h-3 ${template.default_in_app ? 'text-blue-600' : 'text-gray-300'}`} />
                        站内：{template.default_in_app ? '开启' : '关闭'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Mail className={`w-3 h-3 ${template.default_email ? 'text-green-600' : 'text-gray-300'}`} />
                        邮件：{template.default_email ? '开启' : '关闭'}
                      </span>
                      <span>更新：{new Date(template.updated_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => {
                      setEditingTemplate(template);
                      setFormData({
                        ...template,
                        default_in_app: template.default_in_app === true || template.default_in_app === 't' || template.default_in_app === 'true',
                        default_email: template.default_email === true || template.default_email === 't' || template.default_email === 'true',
                      });
                      setSelectedType(template.notification_type || 'all');
                    }}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(template.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="font-medium text-gray-700 block mb-1">标题模板：</span>
                    <div className="bg-gray-50 px-3 py-2 rounded text-gray-700 font-mono text-xs">{template.title_template}</div>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700 block mb-1">内容模板：</span>
                    <div className="bg-gray-50 px-3 py-2 rounded text-gray-700 text-xs whitespace-pre-wrap max-h-32 overflow-auto">
                      {template.content_template}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Usage Guide */}
      <Card>
        <CardHeader>
          <CardTitle>使用说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600">
          <p>• 模板支持变量替换，可用变量包括：{'{{order_number}}'}, {'{{amount}}'}, {'{{user_name}}'}, {'{{order_date}}'} 等</p>
          <p>• 取消通知模板专用变量：{'{{order_name}}'}, {'{{cancel_reason}}'}, {'{{refund_amount}}'}, {'{{admin_contact}}'}</p>
          <p>• 内容模板支持 HTML 和 Markdown 格式</p>
          <p>• 可以为每种通知类型设置默认的站内通知和邮件通知开关</p>
          <p>• 用户可以在个人设置中自定义是否接收某类通知的邮件</p>
        </CardContent>
      </Card>

      {/* Default Templates Reference */}
      <Card>
        <CardHeader>
          <CardTitle>取消通知模板示例</CardTitle>
          <CardDescription>以下是推荐的默认模板，管理员可根据需要修改</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <h4 className="font-medium text-gray-700 mb-2">有退款模板（order_cancelled_with_refund）</h4>
            <div className="bg-gray-50 p-3 rounded text-xs font-mono text-gray-700 whitespace-pre-wrap">
              尊敬的用户，您的订单 {'{{order_name}}'}（{'{{order_number}}'}）由于 {'{{cancel_reason}}'} 而被管理员取消了，退款金额是 {'{{refund_amount}}'}。{'\n'}
              请在这里发送您的收款方式，稍后由管理员手动汇款。
            </div>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 mb-2">无退款模板（order_cancelled_no_refund）</h4>
            <div className="bg-gray-50 p-3 rounded text-xs font-mono text-gray-700 whitespace-pre-wrap">
              尊敬的用户，您的订单 {'{{order_name}}'}（{'{{order_number}}'}）由于 {'{{cancel_reason}}'} 而被管理员取消了。{'\n'}
              如有后续疑问，您可在此留言或联系管理员 {'{{admin_contact}}'}，祝您有美好的一天。
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={open => { if (!open) setDeleteTargetId(null); }}
        title="删除模板"
        description="确定要删除此通知模板吗？删除后无法恢复。"
        confirmText="删除"
        confirmClassName="bg-red-600 hover:bg-red-700"
        onConfirm={confirmDelete}
      />
    </div>
  );
}