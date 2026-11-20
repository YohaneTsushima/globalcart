/**
 * OrderCancelConfigManager
 * 「提醒文案 → 取消设置」卡片：维护取消理由的分类与理由。
 * - 一级：分类（category）
 * - 二级：理由（reason），每个理由带默认套用文案、通知对象、通知方式
 * 这些数据会显示在订单取消面板（OrderCancellationModule）中。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { tenantEntity } from "@/lib/tenantApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Pencil, Plus, RotateCw, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

const NOTIFY_TARGETS = [
  { value: "user", label: "通知用户" },
  { value: "admin", label: "通知管理员" },
  { value: "both", label: "两者都通知" },
];

const NOTIFY_CHANNELS = [
  { value: "in_app", label: "站内通知" },
  { value: "email", label: "邮件通知" },
  { value: "both", label: "站内 + 邮件" },
];

const EMPTY_FORM = {
  category: "",
  reason: "",
  default_content: "",
  notify_target: "user",
  notify_channel: "in_app",
};

function notifyTargetLabel(value) {
  return NOTIFY_TARGETS.find(o => o.value === value)?.label || value || "-";
}

function notifyChannelLabel(value) {
  return NOTIFY_CHANNELS.find(o => o.value === value)?.label || value || "-";
}

function Toggle({ enabled, onToggle, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={enabled ? "已启用" : "已停用"}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${enabled ? "bg-rose-600" : "bg-gray-200"}`}
    >
      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : "translate-x-1"}`} />
    </button>
  );
}

export default function OrderCancelConfigManager({ onReload }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [expanded, setExpanded] = useState({});

  const [renamingCategory, setRenamingCategory] = useState(null);
  const [categoryNameDraft, setCategoryNameDraft] = useState("");

  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await tenantEntity.list("OrderCancelConfig");
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[OrderCancelConfigManager] load failed:", err);
      setError(err?.message || "加载失败");
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // 按分类分组（后端已按 category_sort / sort_order 排好序）
  const groups = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const key = item.category || "未分类";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return Array.from(map.entries()).map(([category, reasons]) => ({ category, reasons }));
  }, [items]);

  const categoryOptions = useMemo(
    () => Array.from(new Set(items.map(i => i.category).filter(Boolean))),
    [items]
  );

  const nextCategorySort = (category) => {
    const same = items.filter(i => i.category === category);
    if (same.length) {
      return Math.max(...same.map(i => Number(i.category_sort) || 0));
    }
    const all = items.map(i => Number(i.category_sort) || 0);
    return all.length ? Math.max(...all) + 10 : 10;
  };

  const nextSortOrder = (category) => {
    const same = items.filter(i => i.category === category);
    return same.length ? Math.max(...same.map(i => Number(i.sort_order) || 0)) + 10 : 10;
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setExpanded(prev => ({ ...prev, [item.id]: true }));
    setDraft({
      reason: item.reason || "",
      default_content: item.default_content || "",
      notify_target: item.notify_target || "user",
      notify_channel: item.notify_channel || "in_app",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = async (item) => {
    if (!draft?.reason?.trim()) {
      toast.error("理由不能为空");
      return;
    }
    setBusy(true);
    try {
      await tenantEntity.update("OrderCancelConfig", item.id, {
        reason: draft.reason.trim(),
        default_content: draft.default_content || "",
        notify_target: draft.notify_target,
        notify_channel: draft.notify_channel,
      });
      toast.success("已保存");
      cancelEdit();
      await load();
      onReload?.();
    } catch (err) {
      toast.error("保存失败：" + (err?.message || "未知错误"));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (item) => {
    setBusy(true);
    try {
      await tenantEntity.update("OrderCancelConfig", item.id, { is_active: !item.is_active });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !item.is_active } : i));
      onReload?.();
    } catch (err) {
      toast.error("操作失败：" + (err?.message || "未知错误"));
    } finally {
      setBusy(false);
    }
  };

  const removeReason = async (item) => {
    if (!window.confirm(`确认删除理由「${item.reason}」？`)) return;
    setBusy(true);
    try {
      await tenantEntity.delete("OrderCancelConfig", item.id);
      toast.success("已删除");
      await load();
      onReload?.();
    } catch (err) {
      toast.error("删除失败：" + (err?.message || "未知错误"));
    } finally {
      setBusy(false);
    }
  };

  const removeCategory = async (category) => {
    const rows = items.filter(i => i.category === category);
    if (!rows.length) return;
    if (!window.confirm(`确认删除分类「${category}」及其 ${rows.length} 个理由？`)) return;
    setBusy(true);
    try {
      for (const row of rows) {
        await tenantEntity.delete("OrderCancelConfig", row.id);
      }
      toast.success(`已删除分类「${category}」`);
      await load();
      onReload?.();
    } catch (err) {
      toast.error("删除失败：" + (err?.message || "未知错误"));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const startRenameCategory = (category) => {
    setRenamingCategory(category);
    setCategoryNameDraft(category);
  };

  const saveRenameCategory = async (category) => {
    const name = categoryNameDraft.trim();
    if (!name) {
      toast.error("分类名不能为空");
      return;
    }
    if (name === category) {
      setRenamingCategory(null);
      return;
    }
    if (categoryOptions.includes(name)) {
      toast.error(`分类「${name}」已存在`);
      return;
    }
    setBusy(true);
    try {
      const rows = items.filter(i => i.category === category);
      for (const row of rows) {
        await tenantEntity.update("OrderCancelConfig", row.id, { category: name });
      }
      toast.success("分类已重命名");
      setRenamingCategory(null);
      await load();
      onReload?.();
    } catch (err) {
      toast.error("重命名失败：" + (err?.message || "未知错误"));
    } finally {
      setBusy(false);
    }
  };

  const addReason = async () => {
    const category = form.category.trim();
    const reason = form.reason.trim();
    if (!category) {
      toast.error("请填写分类");
      return;
    }
    if (!reason) {
      toast.error("请填写理由");
      return;
    }
    setBusy(true);
    try {
      await tenantEntity.create("OrderCancelConfig", {
        category,
        category_sort: nextCategorySort(category),
        reason,
        default_content: form.default_content || "",
        notify_target: form.notify_target,
        notify_channel: form.notify_channel,
        is_active: true,
        sort_order: nextSortOrder(category),
      });
      toast.success("已添加");
      setForm({ ...EMPTY_FORM, category, notify_target: "user", notify_channel: "in_app" });
      await load();
      onReload?.();
    } catch (err) {
      toast.error("添加失败：" + (err?.message || "未知错误"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-rose-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />取消设置
            </CardTitle>
            <p className="text-xs text-gray-400 mt-1">
              一级为分类、二级为取消理由。配置会显示在订单取消面板中，点击理由可自动套用默认文案（支持
              <code className="mx-1 bg-gray-100 px-1 rounded">{"{{order_number}}"}</code>
              <code className="mr-1 bg-gray-100 px-1 rounded">{"{{product_name}}"}</code>
              <code className="mr-1 bg-gray-100 px-1 rounded">{"{{user_name}}"}</code>
              占位符，由后端渲染）。
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load} disabled={loading || busy}>
              <RotateCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />刷新
            </Button>
            <Button size="sm" className="h-7 text-xs bg-rose-600 hover:bg-rose-700" onClick={() => setShowForm(v => !v)} disabled={busy}>
              <Plus className="w-3 h-3 mr-1" />新增理由
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* 新增表单 */}
        {showForm && (
          <div className="border border-dashed border-rose-300 rounded-lg p-3 space-y-3 bg-rose-50/40">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500">分类</Label>
                <Input
                  className="mt-0.5 h-8 text-sm"
                  list="order-cancel-category-options"
                  placeholder="例如：商品问题（可输入新分类）"
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                />
                <datalist id="order-cancel-category-options">
                  {categoryOptions.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <Label className="text-xs text-gray-500">理由</Label>
                <Input
                  className="mt-0.5 h-8 text-sm"
                  placeholder="例如：无货了"
                  value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-gray-500">默认套用文案</Label>
              <Textarea
                rows={2}
                className="mt-0.5 text-sm"
                placeholder="选择该理由时自动填入取消理由输入框的文案，可留空"
                value={form.default_content}
                onChange={e => setForm(f => ({ ...f, default_content: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500">通知对象</Label>
                <Select value={form.notify_target} onValueChange={v => setForm(f => ({ ...f, notify_target: v }))}>
                  <SelectTrigger className="mt-0.5 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NOTIFY_TARGETS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-500">通知方式</Label>
                <Select value={form.notify_channel} onValueChange={v => setForm(f => ({ ...f, notify_channel: v }))}>
                  <SelectTrigger className="mt-0.5 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NOTIFY_CHANNELS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" className="h-7 text-xs bg-rose-600 hover:bg-rose-700" onClick={addReason} disabled={busy}>
                {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}添加
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }} disabled={busy}>
                取消
              </Button>
              <span className="text-xs text-gray-400">通知对象 / 通知方式本期仅记录，不会真正发送</span>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />加载中...
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center justify-between gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <span>加载失败：{error}</span>
            <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={load}>重试</Button>
          </div>
        )}

        {!loading && !error && groups.length === 0 && (
          <p className="text-xs text-gray-400 py-3">暂无取消设置，点击右上角「新增理由」添加。</p>
        )}

        {!loading && !error && groups.map(group => {
          const isRenaming = renamingCategory === group.category;
          return (
            <div key={group.category} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* 分类头 */}
              <div className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-2 border-b border-gray-100">
                <div className="flex items-center gap-2 min-w-0">
                  {isRenaming ? (
                    <>
                      <Input
                        className="h-7 text-xs w-40"
                        value={categoryNameDraft}
                        autoFocus
                        onChange={e => setCategoryNameDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveRenameCategory(group.category); }}
                      />
                      <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => saveRenameCategory(group.category)} disabled={busy}>
                        <Save className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setRenamingCategory(null)} disabled={busy}>
                        <X className="w-3 h-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs font-semibold text-gray-700 truncate">{group.category}</span>
                      <Badge variant="outline" className="text-[10px]">{group.reasons.length} 个理由</Badge>
                      <button className="text-gray-400 hover:text-gray-600" title="重命名分类" onClick={() => startRenameCategory(group.category)}>
                        <Pencil className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
                <button
                  className="text-red-400 hover:text-red-600 flex-shrink-0"
                  title="删除该分类"
                  onClick={() => removeCategory(group.category)}
                  disabled={busy}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 理由行 */}
              <div className="divide-y divide-gray-100">
                {group.reasons.map(item => {
                  const isEditing = editingId === item.id;
                  const isOpen = !!expanded[item.id];
                  return (
                    <div key={item.id} className={`px-3 py-2 ${item.is_active ? "" : "bg-gray-50/60"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <button
                            type="button"
                            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                            onClick={() => setExpanded(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                          >
                            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          {isEditing ? (
                            <Input
                              className="h-7 text-xs flex-1"
                              value={draft.reason}
                              onChange={e => setDraft(d => ({ ...d, reason: e.target.value }))}
                            />
                          ) : (
                            <>
                              <span className={`text-xs truncate ${item.is_active ? "text-gray-800" : "text-gray-400 line-through"}`}>
                                {item.reason}
                              </span>
                              <Badge variant="outline" className="text-[10px] flex-shrink-0">{notifyTargetLabel(item.notify_target)}</Badge>
                              <Badge variant="outline" className="text-[10px] flex-shrink-0">{notifyChannelLabel(item.notify_channel)}</Badge>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Toggle enabled={!!item.is_active} onToggle={() => toggleActive(item)} disabled={busy || isEditing} />
                          {isEditing ? (
                            <>
                              <Button size="sm" className="h-6 px-2 text-[11px] bg-rose-600 hover:bg-rose-700" onClick={() => saveEdit(item)} disabled={busy}>
                                <Save className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={cancelEdit} disabled={busy}>
                                <X className="w-3 h-3" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <button className="text-gray-400 hover:text-gray-600" title="编辑" onClick={() => startEdit(item)} disabled={busy}>
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button className="text-red-400 hover:text-red-600" title="删除" onClick={() => removeReason(item)} disabled={busy}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {(isEditing || isOpen) && (
                        <div className="mt-2 ml-5 space-y-2">
                          <div>
                            <Label className="text-[11px] text-gray-500">默认套用文案</Label>
                            <Textarea
                              rows={2}
                              className="mt-0.5 text-xs"
                              placeholder="选择该理由时自动填入取消理由输入框的文案"
                              value={isEditing ? draft.default_content : (item.default_content || "")}
                              readOnly={!isEditing}
                              onChange={e => setDraft(d => ({ ...d, default_content: e.target.value }))}
                            />
                          </div>
                          {isEditing && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <Label className="text-[11px] text-gray-500">通知对象</Label>
                                <Select value={draft.notify_target} onValueChange={v => setDraft(d => ({ ...d, notify_target: v }))}>
                                  <SelectTrigger className="mt-0.5 h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {NOTIFY_TARGETS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-[11px] text-gray-500">通知方式</Label>
                                <Select value={draft.notify_channel} onValueChange={v => setDraft(d => ({ ...d, notify_channel: v }))}>
                                  <SelectTrigger className="mt-0.5 h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {NOTIFY_CHANNELS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
