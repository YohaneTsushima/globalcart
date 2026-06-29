import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, X, Upload, Image as ImageIcon } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { tenantEntity } from "@/lib/tenantApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const CURRENCIES = ["JPY", "CNY", "USD", "TWD", "HKD", "EUR", "SGD"];

export default function ItemSizeTemplateManager({ initialData = null }) {
  const [templates, setTemplates] = useState(initialData || []);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    image_url: "",
    extra_fee: 0,
    fee_currency: "JPY",
    is_active: true,
  });
  const [uploading, setUploading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationMsg, setMigrationMsg] = useState(null);

  const loadTemplates = async () => {
    setLoading(true);
    // const data = await tenantEntity.list('ItemSizeTemplate');
    const data = [];
    setTemplates(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (initialData === null) loadTemplates();
  }, []);

  const handleSave = async () => {
    if (!formData.title.trim()) return;
    setSaving(true);
    if (editingId) {
      await tenantEntity.update('ItemSizeTemplate', editingId, formData);
    } else {
      await tenantEntity.create('ItemSizeTemplate', formData);
    }
    await loadTemplates();
    setShowForm(false);
    resetForm();
    setSaving(false);
  };

  const handleDelete = async (id) => {
    await tenantEntity.delete('ItemSizeTemplate', id);
    await loadTemplates();
    setDeleting(null);
  };

  const handleEdit = (template) => {
    setFormData(template);
    setEditingId(template.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      image_url: "",
      extra_fee: 0,
      fee_currency: "JPY",
      is_active: true,
    });
    setEditingId(null);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, image_url: res.data.file_url });
    } catch (err) {
      console.error('上传失败:', err);
    }
    setUploading(false);
  };

  const handleCancel = () => {
    setShowForm(false);
    resetForm();
  };

  const handleMigrate = async () => {
    if (!confirm('确认清空所有旧模板数据？此操作不可撤销。')) return;
    setMigrating(true);
    setMigrationMsg(null);
    try {
      const res = await base44.functions.invoke('migrateItemSizeTemplates', {});
      if (res.data?.success) {
        setMigrationMsg({ type: 'success', text: res.data.message });
        await loadTemplates();
      } else {
        setMigrationMsg({ type: 'error', text: res.data?.message || '清空失败' });
      }
    } catch (err) {
      setMigrationMsg({ type: 'error', text: '清空出错：' + err.message });
    }
    setMigrating(false);
    setTimeout(() => setMigrationMsg(null), 5000);
  };

  if (loading) {
    return <div className="text-sm text-gray-500">加载中...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">物品尺寸模板</h3>
        <div className="flex items-center gap-2">
          {templates.length > 0 && (
            <Button size="sm" variant="outline" className="h-8 text-xs text-red-600 border-red-200" onClick={handleMigrate} disabled={migrating}>
              {migrating ? "清空中..." : "清空旧数据"}
            </Button>
          )}
          <Button size="sm" className="h-8 text-xs" onClick={() => setShowForm(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            新增模板
          </Button>
        </div>
      </div>

      {migrationMsg && (
        <div className={`text-xs px-3 py-2 rounded border ${migrationMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {migrationMsg.text}
        </div>
      )}

      {showForm && (
        <div className="border border-blue-100 rounded-lg bg-blue-50 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600">模板名称 *</Label>
              <Input
                className="mt-1 h-8 text-sm"
                placeholder="如: Small, Medium, Large"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">额外费用</Label>
              <Input
                className="mt-1 h-8 text-sm"
                type="number"
                placeholder="0"
                value={formData.extra_fee}
                onChange={(e) => setFormData({ ...formData, extra_fee: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-gray-600">描述</Label>
            <Textarea
              className="mt-1 text-sm"
              rows={2}
              placeholder="如: 适合小型物品，特殊包装处理"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div>
            <Label className="text-xs text-gray-600">示意图</Label>
            <div className="mt-1 flex gap-2">
              <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 h-8 border border-gray-300 rounded text-xs cursor-pointer hover:bg-white transition-colors">
                <Upload className="w-3.5 h-3.5" />
                {uploading ? "上传中..." : "选择图片"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              {formData.image_url && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, image_url: "" })}
                  className="p-1.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                  title="删除图片">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Input
              className="mt-1 h-8 text-xs"
              placeholder="或粘贴图片URL"
              value={formData.image_url}
              onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
            />
            {formData.image_url && (
              <div className="mt-2 max-w-xs">
                <img src={formData.image_url} alt="预览" className="w-full h-auto rounded border border-gray-300 bg-white" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600">货币</Label>
              <Select value={formData.fee_currency} onValueChange={(v) => setFormData({ ...formData, fee_currency: v })}>
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded"
                />
                <span className="text-xs text-gray-600">启用</span>
              </label>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleCancel}>
              取消
            </Button>
            <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {templates.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">暂无模板，点击"新增模板"创建</p>
        ) : (
          templates.map((template) => (
            <div key={template.id} className="border border-gray-200 rounded-lg p-3 flex gap-3 items-start hover:bg-gray-50 transition-colors">
              {template.image_url && (
                <div className="flex-shrink-0 w-20 h-20 rounded border border-gray-300 bg-gray-100 overflow-hidden flex items-center justify-center">
                  <img src={template.image_url} alt={template.title} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-medium text-gray-900">{template.title}</h4>
                  {!template.is_active && <Badge className="text-xs bg-gray-100 text-gray-600">已禁用</Badge>}
                </div>
                {template.description && <p className="text-xs text-gray-500 mt-1">{template.description}</p>}
                <p className="text-xs text-gray-600 mt-1.5 font-mono">
                  额外费用: {template.fee_currency} {template.extra_fee}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                <button
                  onClick={() => handleEdit(template)}
                  className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                  title="编辑">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDeleting(template.id)}
                  className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                  title="删除">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {deleting && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">删除模板？</h3>
            <p className="text-sm text-gray-600">此操作不可撤销。</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>
                取消
              </Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => handleDelete(deleting)}>
                删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}