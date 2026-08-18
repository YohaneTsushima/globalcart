import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { tenantManage } from "@/lib/tenantApi";

export const FEATURE_OPTIONS = [
  { key: "credit_module", label: "记账/余额模块" },
  { key: "consolidation", label: "拼邮模块" },
  { key: "transit_shipping", label: "中转发货模块" },
  { key: "group_buy", label: "拼单模块" },
  { key: "storage_management", label: "仓储管理模块" },
  { key: "reports", label: "数据报表模块" },
];

const EMPTY_FORM = {
  id: null, name: "", description: "", fee_rule_template_id: "none",
  allowed_features: [],
  storage_policy: { storage_enabled: false, default_storage_days: 90, default_reminder_days: 60, default_storage_fee_per_day: 0, on_deadline_action: "change_status", deadline_status: "expired" },
};

export default function TenantTemplateManager() {
  const [templates, setTemplates] = useState([]);
  const [feeTemplates, setFeeTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    const [tplRes, feeRes] = await Promise.all([
      tenantManage.list('TenantTemplate'),
      tenantManage.list('FeeRuleTemplate')
      // base44.functions.invoke('manageTenantTemplates', { action: 'list' }),
      // base44.functions.invoke('serviceFeeRuleEngine', { action: 'list_global_templates' }),
    ]);
    setTemplates(tplRes?.data || []);
    setFeeTemplates(feeRes?.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (t) => {
    setMsg(null);
    setForm(t ? {
      id: t.id, name: t.name || "", description: t.description || "",
      fee_rule_template_id: t.fee_rule_template_id || "none",
      allowed_features: t.allowed_features || [],
      storage_policy: { ...EMPTY_FORM.storage_policy, ...(t.storage_policy || {}) },
    } : { ...EMPTY_FORM, storage_policy: { ...EMPTY_FORM.storage_policy } });
  };

  const toggleFeature = (key) => {
    setForm(f => ({
      ...f,
      allowed_features: f.allowed_features.includes(key)
        ? f.allowed_features.filter(k => k !== key)
        : [...f.allowed_features, key],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setMsg(null);
    const payload = {
      ...form,
      fee_rule_template_id: form.fee_rule_template_id === "none" ? "" : form.fee_rule_template_id,
    };

    if(payload.id) {
      await tenantManage.update('TenantTemplate', payload.id, payload)
        .then(res => {
          setForm(null);
          setMsg({ type: 'success', text: '模板已保存' });
          load();
          setTimeout(() => setMsg(""), 2000);
        }).catch(e => {
            const message = e.response?.data?.message || e.message || '保存失败';
            setMsg({ type: 'error', text: message });
            setSaving(false);
            setTimeout(() => setMsg(""), 2000);
      });
    } else {
      await tenantManage.create('TenantTemplate', payload)
        .then(res => {
          setForm(null);
          setMsg({ type: 'success', text: '模板已保存' });
          load();
          setTimeout(() => setMsg(""), 2000);
        }).catch(e => {
            const message = e.response?.data?.message || e.message || '保存失败';
            setMsg({ type: 'error', text: message });
            setSaving(false);
            setTimeout(() => setMsg(""), 2000);
      });
    }
    
    // const r = await base44.functions.invoke('manageTenantTemplates', { action: 'save', template: payload });
    // if (r.data?.error) {
    //   setMsg({ type: 'error', text: r.data.error });
    // } else {
    //   setMsg({ type: 'success', text: '模板已保存' });
    //   setForm(null);
    //   await load();
    // }
    setSaving(false);
  };

  const handleDelete = async (t) => {
    if (!confirm(`确认删除模板「${t.name}」？`)) return;
    // await base44.functions.invoke('manageTenantTemplates', { action: 'delete', template_id: t.id });
    await tenantManage.delete('TenantTemplate', t.id)
      .then(res => {
        setForm(null);
        setMsg({ type: 'success', text: '模板已删除' });
        load();
        setTimeout(() => setMsg(""), 2000);
      }).catch(e => {
          const message = e.response?.data?.message || e.message || '删除失败';
          setMsg({ type: 'error', text: message });
          setSaving(false);
          setTimeout(() => setMsg(""), 2000);
    });
    await load();
  };

  return (
    <Card className="border-teal-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-500" />租户模板管理
            </CardTitle>
            <p className="text-xs text-gray-400 mt-1">打包服务费规则模板、功能模块和仓储策略，新建租户时一键套用。</p>
          </div>
          {!form && (
            <Button size="sm" className="h-7 text-xs bg-teal-600 hover:bg-teal-700" onClick={() => openEdit(null)}>
              <Plus className="w-3.5 h-3.5 mr-1" />新建模板
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {msg && (
          <p className={`text-xs px-3 py-2 rounded border ${msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {msg.type === 'success' ? '✓ ' : '⚠ '}{msg.text}
          </p>
        )}

        {form && (
          <div className="rounded-lg border border-teal-200 bg-teal-50/30 p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500">模板名称 *</Label>
                <Input className="mt-0.5 h-8 text-sm" placeholder="例：标准物流模式" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-500">服务费规则模板</Label>
                <Select value={form.fee_rule_template_id} onValueChange={v => setForm(f => ({ ...f, fee_rule_template_id: v }))}>
                  <SelectTrigger className="mt-0.5 h-8 text-sm"><SelectValue placeholder="不关联" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不关联</SelectItem>
                    {feeTemplates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-gray-500">模板说明</Label>
                <Textarea className="mt-0.5 text-sm h-16" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>

            <div>
              <Label className="text-xs text-gray-500 block mb-1.5">开通功能模块（功能模块化付费）</Label>
              <div className="flex flex-wrap gap-2">
                {FEATURE_OPTIONS.map(opt => (
                  <button key={opt.key} type="button" onClick={() => toggleFeature(opt.key)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      form.allowed_features.includes(opt.key)
                        ? "bg-teal-600 text-white border-teal-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-teal-300"
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-500">仓储策略预设</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">启用仓储期限管理</span>
                  <Switch checked={form.storage_policy.storage_enabled}
                    onCheckedChange={v => setForm(f => ({ ...f, storage_policy: { ...f.storage_policy, storage_enabled: v } }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-gray-400">存放期限（天）</Label>
                  <Input type="number" className="mt-0.5 h-8 text-sm" value={form.storage_policy.default_storage_days}
                    onChange={e => setForm(f => ({ ...f, storage_policy: { ...f.storage_policy, default_storage_days: parseInt(e.target.value) || 0 } }))} />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">提醒天数</Label>
                  <Input type="number" className="mt-0.5 h-8 text-sm" value={form.storage_policy.default_reminder_days}
                    onChange={e => setForm(f => ({ ...f, storage_policy: { ...f.storage_policy, default_reminder_days: parseInt(e.target.value) || 0 } }))} />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">每日仓储费（JPY）</Label>
                  <Input type="number" className="mt-0.5 h-8 text-sm" value={form.storage_policy.default_storage_fee_per_day}
                    onChange={e => setForm(f => ({ ...f, storage_policy: { ...f.storage_policy, default_storage_fee_per_day: parseFloat(e.target.value) || 0 } }))} />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">到期后行为</Label>
                  <Select value={form.storage_policy.on_deadline_action}
                    onValueChange={v => setForm(f => ({ ...f, storage_policy: { ...f.storage_policy, on_deadline_action: v } }))}>
                    <SelectTrigger className="mt-0.5 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="remind_only">仅提醒</SelectItem>
                      <SelectItem value="change_status">变更状态</SelectItem>
                      <SelectItem value="add_fee_and_remind">追加费用并提醒</SelectItem>
                      <SelectItem value="add_fee_and_change_status">追加费用并变更状态</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-400">到期后状态</Label>
                  <Select value={form.storage_policy.deadline_status}
                    onValueChange={v => setForm(f => ({ ...f, storage_policy: { ...f.storage_policy, deadline_status: v } }))}>
                    <SelectTrigger className="mt-0.5 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expired">已超时</SelectItem>
                      <SelectItem value="cancelled">已取消</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={handleSave} disabled={saving || !form.name.trim()}>
                <Save className="w-3.5 h-3.5 mr-1" />{saving ? "保存中..." : "保存模板"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setForm(null)}>
                <X className="w-3.5 h-3.5 mr-1" />取消
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-xs text-gray-400">加载中...</p>
        ) : templates.length === 0 && !form ? (
          <p className="text-xs text-gray-400">暂无租户模板，点击「新建模板」创建第一个初始化配置包。</p>
        ) : (
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="flex items-start gap-3 rounded-lg border border-gray-200 p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">{t.name}</span>
                    {t.fee_rule_template_name && (
                      <Badge className="text-xs bg-blue-100 text-blue-700">规则：{t.fee_rule_template_name}</Badge>
                    )}
                    {t.storage_policy?.storage_enabled && (
                      <Badge className="text-xs bg-amber-100 text-amber-700">仓储 {t.storage_policy.default_storage_days}天</Badge>
                    )}
                  </div>
                  {t.description && <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>}
                  {(t.allowed_features || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {t.allowed_features.map(k => (
                        <Badge key={k} variant="outline" className="text-xs">
                          {FEATURE_OPTIONS.find(o => o.key === k)?.label || k}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(t)}>
                    <Pencil className="w-3.5 h-3.5 text-gray-500" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleDelete(t)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}