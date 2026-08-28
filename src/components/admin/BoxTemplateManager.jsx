/**
 * BoxTemplateManager
 * Admin can manage reusable box templates (外箱模板).
 * Each template: name, description, image, weight (g), price (JPY).
 */
import { useState } from "react";
import { tenantEntity } from "@/lib/tenantApi";
import { Plus, Edit2, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import ImageUploader from "@/components/common/ImageUploader";

const EMPTY = { name: "", description: "", image_url: "", weight_g: "", price_jpy: "", cost_jpy: "", storage_fee_per_day: "" };

export default function BoxTemplateManager({ initialData = [], onReload }) {
  const [items, setItems] = useState(initialData);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const resetForm = () => {
    setForm(EMPTY);
    setEditingId(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    resetForm();
  };

  const handleEdit = (item) => {
    setForm({
      name: item.name || "",
      description: item.description || "",
      image_url: item.image_url || "",
      weight_g: item.weight_g ?? "",
      price_jpy: item.price_jpy ?? "",
      cost_jpy: item.cost_jpy ?? "",
      storage_fee_per_day: item.storage_fee_per_day ?? "",
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    const payload = {
      name: form.name,
      description: form.description,
      image_url: form.image_url,
      weight_g: parseFloat(form.weight_g) || 0,
      price_jpy: parseFloat(form.price_jpy) || 0,
      cost_jpy: parseFloat(form.cost_jpy) || null,
      storage_fee_per_day: parseFloat(form.storage_fee_per_day) || 0,
    };
    if (editingId) {
      await tenantEntity.update('BoxTemplate', editingId, payload);
      setItems(prev => prev.map(i => i.id === editingId ? { ...i, ...payload } : i));
    } else {
      const created = await tenantEntity.create('BoxTemplate', { ...payload, is_active: true });
      setItems(prev => [...prev, created]);
    }
    setShowForm(false);
    resetForm();
    setSaving(false);
    toast.success(editingId ? "外箱模板已更新" : "外箱模板已添加");
    onReload?.();
  };

  const handleDelete = async (id) => {
    await tenantEntity.delete('BoxTemplate', id);
    setItems(prev => prev.filter(i => i.id !== id));
    setDeleting(null);
    toast.success("外箱模板已删除");
    onReload?.();
  };

  const handleToggle = async (item) => {
    await tenantEntity.update('BoxTemplate', item.id, { is_active: !item.is_active });
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i));
  };

  const handleUploadImage = async (file) => {
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file, path: "boxTemplate" });
    setForm(p => ({ ...p, image_url: file_url }));
    setUploading(false);
  };

  const handleDeleteImage = async () => {
    const url = form.image_url;
    if (!url) return;
    setForm(p => ({ ...p, image_url: "" }));
    try {
      await base44.integrations.Core.DeleteFile({ imageUrl: url, path: "boxTemplate" });
    } catch (_) {}
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">外箱模板</h3>
        <Button size="sm" className="h-8 text-xs" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          新增模板
        </Button>
      </div>

      {showForm && (
        <div className="border border-blue-100 rounded-lg bg-blue-50 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600">外箱名称 *</Label>
              <Input className="mt-1 h-8 text-sm" placeholder="例：60サイズ" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-gray-600">描述</Label>
              <Input className="mt-1 h-8 text-sm" placeholder="例：60×40×30cm" value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-gray-600">自重 (g)</Label>
              <Input type="number" className="mt-1 h-8 text-sm" placeholder="0" value={form.weight_g}
                onChange={e => setForm(p => ({ ...p, weight_g: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-gray-600">向用户收取金额 (JPY)</Label>
              <Input type="number" className="mt-1 h-8 text-sm" placeholder="0" value={form.price_jpy}
                onChange={e => setForm(p => ({ ...p, price_jpy: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-gray-600">实际成本 (JPY)</Label>
              <Input type="number" className="mt-1 h-8 text-sm" placeholder="0（选填）" value={form.cost_jpy}
                onChange={e => setForm(p => ({ ...p, cost_jpy: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-gray-600">每日仓储管理费 (JPY)</Label>
              <Input type="number" className="mt-1 h-8 text-sm" placeholder="0（选填）" value={form.storage_fee_per_day}
                onChange={e => setForm(p => ({ ...p, storage_fee_per_day: e.target.value }))} />
              <p className="text-xs text-gray-400 mt-0.5">设置此外箱的每日仓储费，优先级高于默认设置</p>
            </div>
          </div>

          <div>
            <ImageUploader
              value={form.image_url}
              onChange={(fileOrUrl) => {
                if (typeof fileOrUrl === "string") {
                  setForm(p => ({ ...p, image_url: fileOrUrl }));
                } else {
                  handleUploadImage(fileOrUrl);
                }
              }}
              onDelete={handleDeleteImage}
              uploading={uploading}
              label="示意图（可选）"
              id="box-template-image-input"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleCancel}>
              取消
            </Button>
            <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : editingId ? "保存" : "添加"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {items.length === 0 && !showForm && (
          <p className="text-sm text-gray-400 text-center py-4">暂无外箱模板，点击"新增模板"创建</p>
        )}
        {items.map(item => (
          <div key={item.id}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-opacity ${item.is_active ? "border-gray-200" : "border-gray-100 opacity-50"}`}>
            {item.image_url ? (
              <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover border border-gray-100 flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Package className="w-5 h-5 text-gray-300" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-800">{item.name}</span>
                {item.weight_g > 0 && (
                  <span className="text-xs text-gray-500">{item.weight_g}g</span>
                )}
                {item.price_jpy > 0 && (
                  <span className="text-xs text-orange-600">收 ¥{item.price_jpy} JPY</span>
                )}
                {item.cost_jpy > 0 && (
                  <span className="text-xs text-gray-400">成本 ¥{item.cost_jpy}</span>
                )}
                {item.storage_fee_per_day > 0 && (
                  <span className="text-xs text-amber-600">仓储费 ¥{item.storage_fee_per_day}/天</span>
                )}
                {!item.is_active && (
                  <Badge className="text-xs bg-gray-100 text-gray-400">已停用</Badge>
                )}
              </div>
              {item.description && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">{item.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleToggle(item)}>
                {item.is_active ? "停用" : "启用"}
              </Button>
              <button onClick={() => handleEdit(item)}
                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors" title="编辑">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setDeleting(item.id)}
                className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors" title="删除">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {deleting && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">删除外箱模板？</h3>
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
