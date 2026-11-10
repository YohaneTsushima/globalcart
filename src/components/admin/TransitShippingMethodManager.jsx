/**
 * TransitShippingMethodManager - Master-detail two-column layout
 * Left: detail editor | Right: sortable list
 */
import { useState, useEffect } from "react";
import { tenantEntity } from "@/lib/tenantApi";
import { Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CountrySelect from "@/components/common/CountrySelect";
import KuaidiCompanySelect from "@/components/common/KuaidiCompanySelect";
import { getCountry } from "@/lib/countries";

const CURRENCIES = ["JPY", "CNY", "USD", "TWD", "HKD", "EUR", "SGD"];
const EMPTY_RATE = { zone: "通用", first_weight_g: 500, first_weight_fee: 0, additional_unit_g: 500, additional_unit_fee: 0, currency: "CNY" };
const BLANK = { name: "", description: "", country: "CN", fee: 0, fee_currency: "CNY", rate_mode: "simple", simple_rates: [{ ...EMPTY_RATE }], is_active: true, provider_key: "" };

function RateRow({ rate, onChange, onDelete }) {
  return (
    <div className="grid grid-cols-6 gap-2 items-end text-xs">
      <div>
        <span className="text-gray-400 block mb-1">区域</span>
        <Input className="h-7 text-xs" value={rate.zone} onChange={e => onChange({ ...rate, zone: e.target.value })} />
      </div>
      <div>
        <span className="text-gray-400 block mb-1">首重(g)</span>
        <Input type="number" className="h-7 text-xs" value={rate.first_weight_g} onChange={e => onChange({ ...rate, first_weight_g: parseFloat(e.target.value) || 0 })} />
      </div>
      <div>
        <span className="text-gray-400 block mb-1">首重运费</span>
        <Input type="number" step="0.01" className="h-7 text-xs" value={rate.first_weight_fee} onChange={e => onChange({ ...rate, first_weight_fee: parseFloat(e.target.value) || 0 })} />
      </div>
      <div>
        <span className="text-gray-400 block mb-1">续重(g)</span>
        <Input type="number" className="h-7 text-xs" value={rate.additional_unit_g} onChange={e => onChange({ ...rate, additional_unit_g: parseFloat(e.target.value) || 0 })} />
      </div>
      <div>
        <span className="text-gray-400 block mb-1">续重运费</span>
        <Input type="number" step="0.01" className="h-7 text-xs" value={rate.additional_unit_fee} onChange={e => onChange({ ...rate, additional_unit_fee: parseFloat(e.target.value) || 0 })} />
      </div>
      <div className="flex items-end gap-1">
        <div className="flex-1">
          <span className="text-gray-400 block mb-1">货币</span>
          <Select value={rate.currency || "CNY"} onValueChange={v => onChange({ ...rate, currency: v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 mb-0.5">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Left detail editor panel ─────────────────────────────────
function TransitDetailPanel({ selected, onSave, onCancel }) {
  const [form, setForm] = useState(selected ? { ...selected } : null);
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    if (selected) { setForm({ ...selected }); setIsNew(false); }
    else { setForm(null); setIsNew(false); }
  }, [selected?.id]);

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const updateRate = (i, u) => { const rates = [...(form.simple_rates || [])]; rates[i] = u; f("simple_rates", rates); };
  const removeRate = (i) => f("simple_rates", (form.simple_rates || []).filter((_, idx) => idx !== i));
  const addRate = () => f("simple_rates", [...(form.simple_rates || []), { ...EMPTY_RATE }]);

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    const saveData = { ...form };
    if (form.rate_mode === "fixed") saveData.fee = parseFloat(form.fee) || 0;
    await onSave(saveData, isNew);
    setSaving(false);
  };

  const handleStartNew = () => { setForm({ ...BLANK, simple_rates: [{ ...EMPTY_RATE }] }); setIsNew(true); };

  if (!form) {
    return (
      <div className="border border-dashed border-gray-200 rounded-xl p-6 text-center space-y-3 flex flex-col items-center justify-center min-h-[200px]">
        <p className="text-xs text-gray-400">点击右侧中转运输方式进行编辑</p>
        <Button size="sm" className="bg-orange-500 hover:bg-orange-600 h-7 text-xs" onClick={handleStartNew}>
          <Plus className="w-3 h-3 mr-1" />新增中转运输方式
        </Button>
      </div>
    );
  }

  return (
    <div className="border border-orange-200 rounded-xl p-4 space-y-3 bg-orange-50">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">{isNew ? "新增中转运输方式" : `编辑：${form.name}`}</p>
        <div className="flex items-center gap-2">
          {!isNew && (
            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={handleStartNew}>
              <Plus className="w-3 h-3 mr-1" />新增
            </Button>
          )}
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-500">名称 *</Label>
          <KuaidiCompanySelect
            className="mt-1"
            value={form.provider_key || ""}
            name={form.name || ""}
            placeholder="如：顺丰速运"
            onSelect={(code, companyName) => setForm(p => ({ ...p, name: companyName, provider_key: code }))}
          />
          {form.provider_key && (
            <p className="mt-1 text-[10px] text-gray-400">快递100编码：<span className="font-mono">{form.provider_key}</span></p>
          )}
        </div>
        <div>
          <Label className="text-xs text-gray-500">中转国家 *</Label>
          <CountrySelect value={form.country || "CN"} onChange={v => f("country", v)} className="mt-1" />
        </div>
      </div>
      <div>
        <Label className="text-xs text-gray-500">描述（可选）</Label>
        <Input className="mt-1 h-8 text-sm" value={form.description || ""} onChange={e => f("description", e.target.value)} placeholder="如：次日达" />
      </div>

      {/* Rate mode */}
      <div>
        <Label className="text-xs text-gray-500">费率模式</Label>
        <div className="flex gap-3 mt-1.5">
          {[{ v: "simple", l: "首续重计费" }, { v: "fixed", l: "固定费用" }].map(opt => (
            <label key={opt.v} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${form.rate_mode === opt.v ? "border-orange-400 bg-white text-orange-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
              <input type="radio" checked={form.rate_mode === opt.v} onChange={() => f("rate_mode", opt.v)} className="accent-orange-500" />
              {opt.l}
            </label>
          ))}
        </div>
      </div>

      {form.rate_mode === "fixed" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-gray-500">固定费用 *</Label>
            <Input type="number" step="0.01" className="mt-1 h-8 text-sm" value={form.fee || ""} onChange={e => f("fee", e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label className="text-xs text-gray-500">货币</Label>
            <Select value={form.fee_currency || "CNY"} onValueChange={v => f("fee_currency", v)}>
              <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      )}

      {form.rate_mode === "simple" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-500">首续重费率</Label>
            <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={addRate}>
              <Plus className="w-3 h-3 mr-1" />添加区域
            </Button>
          </div>
          {(form.simple_rates || []).length === 0 && <p className="text-xs text-gray-400 text-center py-2">点击"添加区域"添加费率行</p>}
          <div className="space-y-2">
            {(form.simple_rates || []).map((r, i) => (
              <RateRow key={i} rate={r} onChange={u => updateRate(i, u)} onDelete={() => removeRate(i)} />
            ))}
          </div>
          {(form.simple_rates || []).length > 0 && <p className="text-xs text-gray-400">货币以各行的货币设置为准</p>}
        </div>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>取消</Button>
        <Button size="sm" className="bg-orange-600 hover:bg-orange-700" onClick={handleSave} disabled={saving || !form.name}>
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}

// ─── Right list/sort panel ────────────────────────────────────
function TransitListPanel({ methods, activeId, onSelect, onToggle, onDelete, onMoveUp, onMoveDown }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-gray-600">中转运输方式 &amp; 排序</p>
        <p className="text-xs text-gray-400">点击条目在左侧编辑</p>
      </div>
      {methods.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-6">暂无中转运输方式</p>
      )}
      {methods.map((m, idx) => {
        const countryName = getCountry(m.country)?.name || m.country || "中国";
        const rateSummary = m.rate_mode === "fixed"
          ? `固定 ${m.fee_currency || "CNY"} ${Number(m.fee || 0).toLocaleString()}`
          : (() => { const r = (m.simple_rates || [])[0]; return r ? `首 ${r.first_weight_g}g/${r.first_weight_fee}${r.currency}` : "无费率"; })();
        return (
          <div key={m.id}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
              activeId === m.id ? "border-orange-300 bg-orange-50" : "border-gray-200 bg-white hover:bg-gray-50"
            } ${!m.is_active ? "opacity-50" : ""}`}
            onClick={() => onSelect(m)}
          >
            <div className="w-6 h-6 rounded bg-orange-100 flex items-center justify-center text-orange-600 text-xs font-bold flex-shrink-0">
              {(m.name || "")[0] || "T"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{m.name}</p>
              <p className="text-xs text-gray-400 truncate">{countryName} · {rateSummary}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
              <button className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-600 disabled:opacity-30" disabled={idx === 0} onClick={() => onMoveUp(idx)}>
                <ChevronUp className="w-3 h-3" />
              </button>
              <button className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-600 disabled:opacity-30" disabled={idx === methods.length - 1} onClick={() => onMoveDown(idx)}>
                <ChevronDown className="w-3 h-3" />
              </button>
              <button className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-600" onClick={() => onToggle(m)}>
                {m.is_active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </button>
              <button className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500" onClick={() => onDelete(m.id)}>
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────
export default function TransitShippingMethodManager({ initialData = null }) {
  const [methods, setMethods] = useState(initialData || []);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const data = await tenantEntity.list('TransitShippingMethod');
    setMethods(data);
    setLoading(false);
  };

  useEffect(() => {
    if (initialData === null) load();
  }, []);

  const handleSave = async (updated, isNew) => {
    if (isNew) {
      const { id, tenant_id, created_date, updated_date, created_by, ...data } = updated;
      const created = await tenantEntity.create('TransitShippingMethod', data);
      setMethods(prev => [...prev, created]);
      setSelected(created);
    } else {
      await tenantEntity.update('TransitShippingMethod', updated.id, updated);
      setMethods(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
      setSelected(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev);
    }
  };

  const handleToggle = async (m) => {
    const updated = { ...m, is_active: !m.is_active };
    await tenantEntity.update('TransitShippingMethod', m.id, { is_active: updated.is_active });
    setMethods(prev => prev.map(x => x.id === m.id ? updated : x));
    if (selected?.id === m.id) setSelected(updated);
  };

  const handleDelete = async (id) => {
    if (!confirm("确认删除此中转运输方式？")) return;
    await tenantEntity.delete('TransitShippingMethod', id);
    setMethods(prev => prev.filter(m => m.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const handleMoveUp = (idx) => {
    if (idx === 0) return;
    const arr = [...methods];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    setMethods(arr);
  };

  const handleMoveDown = (idx) => {
    if (idx >= methods.length - 1) return;
    const arr = [...methods];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    setMethods(arr);
  };

  if (loading) return <div className="py-8 text-center text-gray-400 text-sm">加载中...</div>;

  return (
    <div className="flex flex-col xl:flex-row gap-5 items-start">
      {/* Left: detail editor */}
      <div className="flex-1 min-w-0">
        <TransitDetailPanel
          selected={selected}
          onSave={handleSave}
          onCancel={() => setSelected(null)}
        />
      </div>
      {/* Right: list & sort */}
      <div className="w-full xl:w-72 flex-shrink-0">
        <TransitListPanel
          methods={methods}
          activeId={selected?.id}
          onSelect={m => setSelected(m)}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
        />
      </div>
    </div>
  );
}