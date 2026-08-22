/**
 * ShippingMethodManager - Master-detail two-column layout
 * Left: detail editor | Right: sortable list tree
 */
import { useState, useEffect } from "react";
import { tenantEntity } from "@/lib/tenantApi";
import { Plus, Trash2, Edit2, Check, X, Download, Info, GripVertical, Eye, EyeOff, ChevronUp, ChevronDown } from "lucide-react";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CountrySelect from "@/components/common/CountrySelect";
import { getCountry, getCountryZone, EMS_RATES, COUNTRY_ZONES, ALL_COUNTRIES } from "@/lib/countries";

const CURRENCIES = ["JPY", "CNY", "USD", "TWD", "HKD", "EUR"];

const ZONE_LABELS = {
  zone1: "第 1 地帯", zone2: "第 2 地帯", zone3: "第 3 地帯",
  zone4: "第 4 地帯", zone5: "第 5 地帯",
};

const DEFAULT_METHODS = [
  { name: "EMS 空运", code: "EMS", icon: "Plane", color: "#2563EB", transit_days: "5-10 个工作日", description: "日本邮政 EMS 国际特快专递，速度快，适合贵重物品", is_active: true, enabled_for_direct_ship: true, enabled_for_user_pool: true, enabled_for_official_pool: true, rate_mode: "simple", simple_rates: [], detailed_rates: [] },
  { name: "海运", code: "surface", icon: "Ship", color: "#0891B2", transit_days: "30-60 天", description: "日本邮政海运，价格实惠，适合大件/重件", is_active: true, enabled_for_direct_ship: true, enabled_for_user_pool: true, enabled_for_official_pool: true, rate_mode: "simple", simple_rates: [], detailed_rates: [] },
  { name: "小型包装物空运", code: "small_packet_air", icon: "Package", color: "#7C3AED", transit_days: "10-20 个工作日", description: "小型包裹空运，价格适中，适合轻小件", is_active: true, enabled_for_direct_ship: true, enabled_for_user_pool: true, enabled_for_official_pool: true, rate_mode: "simple", simple_rates: [], detailed_rates: [] },
];

function generateEMSDetailedRates() {
  const rates = [];
  Object.entries(EMS_RATES).forEach(([zone, brackets]) => {
    brackets.forEach((b, idx) => {
      const from = idx === 0 ? 0 : brackets[idx - 1].maxWeight;
      rates.push({ country: zone, weight_from_g: from, weight_to_g: b.maxWeight, fee: b.fee, currency: "JPY" });
    });
  });
  return rates;
}

function generateEMSSimpleRatesByZone() {
  return Object.entries(EMS_RATES).map(([zone, brackets]) => {
    const first = brackets[0];
    const second = brackets[1];
    const addUnit = second ? (second.maxWeight - first.maxWeight) : 500;
    const addFee = second ? (second.fee - first.fee) : 0;
    return { country: zone, first_weight_g: first.maxWeight, first_weight_fee: first.fee, additional_unit_g: addUnit, additional_unit_fee: addFee, currency: "JPY" };
  });
}

function countryLabel(code) {
  if (!code) return "";
  if (ZONE_LABELS[code]) return ZONE_LABELS[code];
  const c = getCountry(code);
  return c ? c.name : code;
}

function RateRow({ rate, onChange, onDelete }) {
  return (
    <div className="grid grid-cols-6 gap-1.5 items-end">
      <div>
        <Label className="text-xs text-gray-400">国家/地带</Label>
        <CountrySelect value={rate.country || ""} onChange={v => onChange({ ...rate, country: v })} placeholder="选择" className="mt-0.5" compact allowZone />
      </div>
      <div>
        <Label className="text-xs text-gray-400">首重 (g)</Label>
        <Input type="number" className="h-7 text-xs mt-0.5" value={rate.first_weight_g || ""} onChange={e => onChange({ ...rate, first_weight_g: parseFloat(e.target.value) || 0 })} placeholder="500" />
      </div>
      <div>
        <Label className="text-xs text-gray-400">首重运费</Label>
        <Input type="number" className="h-7 text-xs mt-0.5" value={rate.first_weight_fee || ""} onChange={e => onChange({ ...rate, first_weight_fee: parseFloat(e.target.value) || 0 })} placeholder="1200" />
      </div>
      <div>
        <Label className="text-xs text-gray-400">续重单位 (g)</Label>
        <Input type="number" className="h-7 text-xs mt-0.5" value={rate.additional_unit_g || ""} onChange={e => onChange({ ...rate, additional_unit_g: parseFloat(e.target.value) || 0 })} placeholder="500" />
      </div>
      <div>
        <Label className="text-xs text-gray-400">续重运费</Label>
        <Input type="number" className="h-7 text-xs mt-0.5" value={rate.additional_unit_fee || ""} onChange={e => onChange({ ...rate, additional_unit_fee: parseFloat(e.target.value) || 0 })} placeholder="600" />
      </div>
      <div className="flex items-end gap-1">
        <div className="flex-1">
          <Label className="text-xs text-gray-400">货币</Label>
          <Select value={rate.currency || "JPY"} onValueChange={v => onChange({ ...rate, currency: v })}>
            <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <button onClick={onDelete} className="text-red-400 hover:text-red-600 mb-0.5"><X className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}

function DetailedRateRow({ rate, onChange, onDelete }) {
  return (
    <div className="grid grid-cols-5 gap-1.5 items-end">
      <div>
        <Label className="text-xs text-gray-400">国家/地带</Label>
        <CountrySelect value={rate.country || ""} onChange={v => onChange({ ...rate, country: v })} placeholder="选择" className="mt-0.5" compact allowZone />
      </div>
      <div>
        <Label className="text-xs text-gray-400">起始 (g)</Label>
        <Input type="number" className="h-7 text-xs mt-0.5" value={rate.weight_from_g || ""} onChange={e => onChange({ ...rate, weight_from_g: parseFloat(e.target.value) || 0 })} placeholder="0" />
      </div>
      <div>
        <Label className="text-xs text-gray-400">结束 (g)</Label>
        <Input type="number" className="h-7 text-xs mt-0.5" value={rate.weight_to_g || ""} onChange={e => onChange({ ...rate, weight_to_g: parseFloat(e.target.value) || 0 })} placeholder="1000" />
      </div>
      <div>
        <Label className="text-xs text-gray-400">运费</Label>
        <Input type="number" className="h-7 text-xs mt-0.5" value={rate.fee || ""} onChange={e => onChange({ ...rate, fee: parseFloat(e.target.value) || 0 })} placeholder="1500" />
      </div>
      <div className="flex items-end gap-1">
        <div className="flex-1">
          <Label className="text-xs text-gray-400">货币</Label>
          <Select value={rate.currency || "JPY"} onValueChange={v => onChange({ ...rate, currency: v })}>
            <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <button onClick={onDelete} className="text-red-400 hover:text-red-600 mb-0.5"><X className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}

// ─── Left detail editor panel ─────────────────────────────────
function ShippingDetailPanel({ selected, onSave, onCancel, onAddNew, itemSizeTemplates = [] }) {
  const [form, setForm] = useState(selected ? { ...selected } : null);
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(false);

  const BLANK = { name: "", code: "", color: "#6B7280", transit_days: "", description: "", is_active: true, enabled_for_direct_ship: true, enabled_for_user_pool: true, enabled_for_official_pool: true, rate_mode: "simple", simple_rates: [], detailed_rates: [], min_weight_g: 0, max_weight_g: 0, disabled_item_size_template_ids: [], official_pool_estimate_rates: [] };

  useEffect(() => {
    if (selected) { setForm({ ...selected }); setIsNew(false); }
    else { setForm(null); setIsNew(false); }
  }, [selected?.id]);

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const addSimpleRate = () => setForm(p => ({ ...p, simple_rates: [...(p.simple_rates || []), { country: "", first_weight_g: 500, first_weight_fee: 0, additional_unit_g: 500, additional_unit_fee: 0, currency: "JPY" }] }));
  const updateSimpleRate = (idx, u) => { const arr = [...(form.simple_rates || [])]; arr[idx] = u; setForm(p => ({ ...p, simple_rates: arr })); };
  const deleteSimpleRate = (idx) => setForm(p => ({ ...p, simple_rates: (p.simple_rates || []).filter((_, i) => i !== idx) }));

  const addDetailedRate = () => setForm(p => ({ ...p, detailed_rates: [...(p.detailed_rates || []), { country: "", weight_from_g: 0, weight_to_g: 1000, fee: 0, currency: "JPY" }] }));
  const updateDetailedRate = (idx, u) => { const arr = [...(form.detailed_rates || [])]; arr[idx] = u; setForm(p => ({ ...p, detailed_rates: arr })); };
  const deleteDetailedRate = (idx) => setForm(p => ({ ...p, detailed_rates: (p.detailed_rates || []).filter((_, i) => i !== idx) }));

  const handleImportEMS = () => {
    if (form.rate_mode === "simple") setForm(p => ({ ...p, simple_rates: generateEMSSimpleRatesByZone() }));
    else setForm(p => ({ ...p, detailed_rates: generateEMSDetailedRates() }));
  };

  const handleSave = async () => {
    if (!form.name || !form.code) return;
    setSaving(true);
    await onSave(form, isNew);
    setSaving(false);
  };

  const handleStartNew = () => { setForm({ ...BLANK }); setIsNew(true); };

  if (!form) {
    return (
      <div className="border border-dashed border-gray-200 rounded-xl p-6 text-center space-y-3 h-full flex flex-col items-center justify-center min-h-[200px]">
        <p className="text-xs text-gray-400">点击右侧运输方式条目进行编辑</p>
        <Button size="sm" className="bg-red-600 hover:bg-red-700 h-7 text-xs" onClick={handleStartNew}>
          <Plus className="w-3 h-3 mr-1" />新增国际运输方式
        </Button>
      </div>
    );
  }

  const isEMS = form.code === "EMS";

  return (
    <div className="border border-red-200 rounded-xl p-4 space-y-4 bg-red-50">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">{isNew ? "新增国际运输方式" : `编辑：${form.name}`}</p>
        <div className="flex items-center gap-2">
          {!isNew && (
            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={handleStartNew}>
              <Plus className="w-3 h-3 mr-1" />新增
            </Button>
          )}
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Basic info */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-500">运输方式名 *</Label>
          <Input className="mt-1 h-8 text-sm" value={form.name} onChange={e => f("name", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-gray-500">代码 *</Label>
          <Input className="mt-1 h-8 text-sm" value={form.code} onChange={e => f("code", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-gray-500">颜色</Label>
          <div className="flex items-center gap-2 mt-1">
            <input type="color" value={form.color || "#6B7280"} onChange={e => f("color", e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-gray-200" />
            <Input className="h-8 text-sm flex-1" value={form.color || ""} onChange={e => f("color", e.target.value)} placeholder="#2563EB" />
          </div>
        </div>
        <div>
          <Label className="text-xs text-gray-500">时效</Label>
          <Input className="mt-1 h-8 text-sm" value={form.transit_days || ""} onChange={e => f("transit_days", e.target.value)} placeholder="5-10 个工作日" />
        </div>
      </div>
      <div>
        <Label className="text-xs text-gray-500">描述</Label>
        <Textarea rows={2} className="mt-1 text-sm" value={form.description || ""} onChange={e => f("description", e.target.value)} />
      </div>

      {/* Weight limits */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-500">最小运输重量 (g)</Label>
          <Input className="mt-1 h-8 text-sm" type="number" value={form.min_weight_g || ""} onChange={e => f("min_weight_g", parseFloat(e.target.value) || 0)} placeholder="0" />
        </div>
        <div>
          <Label className="text-xs text-gray-500">最大运输重量 (g)</Label>
          <Input className="mt-1 h-8 text-sm" type="number" value={form.max_weight_g || ""} onChange={e => f("max_weight_g", parseFloat(e.target.value) || 0)} placeholder="0 (不限)" />
        </div>
      </div>

      {/* Disabled item sizes */}
      {itemSizeTemplates.length > 0 && (
        <div>
          <Label className="text-xs text-gray-500 font-medium">禁用的物品尺寸</Label>
          <div className="space-y-1.5 max-h-28 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-white mt-1.5">
            {itemSizeTemplates.map(template => (
              <label key={template.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox"
                  checked={(form.disabled_item_size_template_ids || []).includes(template.id)}
                  onChange={e => {
                    const ids = form.disabled_item_size_template_ids || [];
                    f("disabled_item_size_template_ids", e.target.checked ? [...ids, template.id] : ids.filter(id => id !== template.id));
                  }}
                  className="rounded" />
                <span className="text-gray-600 text-xs">{template.title}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Shipping mode toggles */}
      <div>
        <Label className="text-xs text-gray-500 font-medium mb-2 block">发货方式设置</Label>
        <div className="space-y-1.5">
          {[
            { key: "enabled_for_direct_ship", label: "单独发货", sub: "直接发货模式", badge: "直", color: "bg-green-100 text-green-700" },
            { key: "enabled_for_user_pool", label: "拼邮发货", sub: "用户拼邮模式", badge: "拼", color: "bg-blue-100 text-blue-700" },
            { key: "enabled_for_official_pool", label: "官方拼邮", sub: "官方拼邮模式", badge: "官", color: "bg-purple-100 text-purple-700" },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between p-2 rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${item.color}`}>{item.badge}</div>
                <div>
                  <p className="text-xs font-medium text-gray-700">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.sub}</p>
                </div>
              </div>
              <Switch checked={form[item.key] !== false} onCheckedChange={v => f(item.key, v)} />
            </div>
          ))}
        </div>
      </div>

      {/* Official pool estimate rates */}
      <div className="border border-purple-100 bg-purple-50 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs text-gray-600 font-medium">官方拼邮预估运费估算率</Label>
            <p className="text-xs text-gray-400 mt-0.5">可按国家/地带设置，留空国家=适用所有（兜底）</p>
          </div>
          <Button size="sm" variant="outline" className="h-6 text-xs flex-shrink-0"
            onClick={() => f("official_pool_estimate_rates", [...(form.official_pool_estimate_rates || []), { country: "", rate_per_unit: 150, unit_g: 100 }])}>
            <Plus className="w-3 h-3 mr-1" />添加
          </Button>
        </div>
        {(form.official_pool_estimate_rates || []).length === 0 && (
          <p className="text-xs text-gray-400 italic">暂无配置，留空将使用全局设置或默认 150 JPY/100g</p>
        )}
        {(form.official_pool_estimate_rates || []).map((row, idx) => (
          <div key={idx} className="flex items-center gap-2 flex-wrap bg-white rounded-lg border border-purple-100 px-2 py-1.5">
            <div className="w-32">
              <CountrySelect value={row.country || ""} onChange={v => { const arr = [...(form.official_pool_estimate_rates || [])]; arr[idx] = { ...row, country: v }; f("official_pool_estimate_rates", arr); }} placeholder="所有国家（兜底）" compact allowZone />
            </div>
            <Input type="number" className="h-7 text-xs w-16" value={row.rate_per_unit ?? ""} onChange={e => { const arr = [...(form.official_pool_estimate_rates || [])]; arr[idx] = { ...row, rate_per_unit: e.target.value === "" ? "" : parseFloat(e.target.value) || 0 }; f("official_pool_estimate_rates", arr); }} placeholder="150" />
            <span className="text-xs text-gray-400">JPY /</span>
            <Input type="number" className="h-7 text-xs w-14" value={row.unit_g ?? ""} onChange={e => { const arr = [...(form.official_pool_estimate_rates || [])]; arr[idx] = { ...row, unit_g: e.target.value === "" ? "" : parseFloat(e.target.value) || 100 }; f("official_pool_estimate_rates", arr); }} placeholder="100" />
            <span className="text-xs text-gray-400">g</span>
            <button onClick={() => f("official_pool_estimate_rates", (form.official_pool_estimate_rates || []).filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 ml-auto"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>

      {/* Rate mode */}
      <div>
        <Label className="text-xs text-gray-500 font-medium">费率设置模式</Label>
        <div className="flex gap-3 mt-2">
          {["simple", "detailed"].map(mode => (
            <label key={mode} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${form.rate_mode === mode ? "border-red-300 bg-white text-red-700" : "border-gray-200 bg-white text-gray-600"}`}>
              <input type="radio" className="hidden" checked={form.rate_mode === mode} onChange={() => f("rate_mode", mode)} />
              {form.rate_mode === mode && <Check className="w-3.5 h-3.5" />}
              {mode === "simple" ? "简易设置（首重+续重）" : "详细设置（区间）"}
            </label>
          ))}
        </div>
      </div>

      {/* EMS import */}
      {isEMS && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-lg p-3">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span className="text-xs text-blue-700 flex-1">EMS 可从日本邮政官方费率表导入（按 5 个地带自动生成）</span>
          <Button size="sm" variant="outline" className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-100 flex-shrink-0" onClick={handleImportEMS}>
            <Download className="w-3 h-3 mr-1" />导入
          </Button>
        </div>
      )}

      {/* Simple rates */}
      {form.rate_mode === "simple" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-500 font-medium">按国家/地带费率（简易）</Label>
            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={addSimpleRate}><Plus className="w-3 h-3 mr-1" />添加</Button>
          </div>
          <p className="text-xs text-gray-400">支持国家代码 (CN/US) 或地带代码 (zone1~zone5)</p>
          {(form.simple_rates || []).map((rate, idx) => (
            <RateRow key={idx} rate={rate} onChange={u => updateSimpleRate(idx, u)} onDelete={() => deleteSimpleRate(idx)} />
          ))}
          {(form.simple_rates || []).length === 0 && <p className="text-xs text-gray-400 py-2">暂无费率</p>}
        </div>
      )}

      {/* Detailed rates */}
      {form.rate_mode === "detailed" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-500 font-medium">按重量区间费率（详细）</Label>
            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={addDetailedRate}><Plus className="w-3 h-3 mr-1" />添加</Button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
            {(form.detailed_rates || []).map((rate, idx) => (
              <DetailedRateRow key={idx} rate={rate} onChange={u => updateDetailedRate(idx, u)} onDelete={() => deleteDetailedRate(idx)} />
            ))}
          </div>
          {(form.detailed_rates || []).length === 0 && <p className="text-xs text-gray-400 py-2">暂无区间</p>}
        </div>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>取消</Button>
        <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={handleSave} disabled={saving || !form.name || !form.code}>
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}

// ─── Right list/sort tree panel ───────────────────────────────
function ShippingListPanel({ methods, activeId, onSelect, onToggle, onDelete, onMoveUp, onMoveDown }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-gray-600">国际运输方式 &amp; 排序</p>
        <p className="text-xs text-gray-400">点击条目在左侧编辑</p>
      </div>
      {methods.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-6">暂无运输方式</p>
      )}
      {methods.map((m, idx) => (
        <div key={m.id}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
            activeId === m.id ? "border-red-300 bg-red-50" : "border-gray-200 bg-white hover:bg-gray-50"
          } ${!m.is_active ? "opacity-50" : ""}`}
          onClick={() => onSelect(m)}
        >
          <div className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: m.color || "#6B7280" }}>
            {(m.name || "")[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-800 truncate">{m.name}</p>
            <p className="text-xs text-gray-400 truncate">{m.code}{m.transit_days ? ` · ${m.transit_days}` : ""}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            {/* Move up/down */}
            <button className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-600 disabled:opacity-30" disabled={idx === 0} onClick={() => onMoveUp(idx)}>
              <ChevronUp className="w-3 h-3" />
            </button>
            <button className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-600 disabled:opacity-30" disabled={idx === methods.length - 1} onClick={() => onMoveDown(idx)}>
              <ChevronDown className="w-3 h-3" />
            </button>
            {/* Toggle active */}
            <button className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-600" onClick={() => onToggle(m)}>
              {m.is_active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            </button>
            {/* Delete */}
            <button className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500" onClick={() => onDelete(m.id)}>
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Global estimate rate setting ─────────────────────────────
export function EstimateRateGlobalSetting({ settings = [] }) {
  const [rows, setRows] = useState([{ country: "", rate_per_unit: "", unit_g: "100" }]);
  const [settingId, setSettingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const existing = settings.find(s => s.key === 'default_estimate_rates');
    if (existing) {
      setSettingId(existing.id);
      try {
        const parsed = JSON.parse(existing.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRows(parsed.map(r => ({ ...r, rate_per_unit: String(r.rate_per_unit ?? ""), unit_g: String(r.unit_g ?? "100") })));
        }
      } catch {}
      return;
    }
    tenantEntity.list('SiteSettings').then(list => {
      const found = (list || []).find(s => s.key === 'default_estimate_rates');
      if (found) {
        setSettingId(found.id);
        try {
          const parsed = JSON.parse(found.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRows(parsed.map(r => ({ ...r, rate_per_unit: String(r.rate_per_unit ?? ""), unit_g: String(r.unit_g ?? "100") })));
          }
        } catch {}
      }
    }).catch(() => {});
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    const value = JSON.stringify(rows.map(r => ({ country: r.country || "", rate_per_unit: parseFloat(r.rate_per_unit) || 0, unit_g: parseFloat(r.unit_g) || 100 })));
    
    if (settingId) {
      await tenantEntity.update('SiteSettings', settingId, { value });
    } else {
      const allSettings = await tenantEntity.list('SiteSettings');
      const found = (allSettings || []).find(s => s.key === 'default_estimate_rates');
      if (found) {
        await tenantEntity.update('SiteSettings', found.id, { value });
        setSettingId(found.id);
      } else {
        const created = await tenantEntity.create('SiteSettings', { key: 'default_estimate_rates', value, description: '官方拼邮预估运费全局建议估算率列表（按国家/地带，JSON数组）', category: 'shipping' });
        setSettingId(created.id);
      }
    }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="border border-purple-200 rounded-xl p-4 bg-purple-50 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-700">预估运费全局建议费率</p>
          <p className="text-xs text-gray-400 mt-0.5">官方拼邮一次付款时，若运输方式未配置估算率，将使用此全局值。可按国家/地带设置不同费率。</p>
        </div>
        <Button size="sm" variant="outline" className="h-6 text-xs flex-shrink-0"
          onClick={() => setRows(r => [...r, { country: "", rate_per_unit: "150", unit_g: "100" }])}>
          <Plus className="w-3 h-3 mr-1" />添加
        </Button>
      </div>
      <div className="space-y-1.5">
        {rows.map((row, idx) => (
          <div key={idx} className="flex items-center gap-2 flex-wrap bg-white rounded-lg border border-purple-100 px-2 py-1.5">
            <div className="w-36">
              <CountrySelect value={row.country || ""} onChange={v => setRows(r => r.map((x, i) => i === idx ? { ...x, country: v } : x))} placeholder="所有国家（兜底）" compact allowZone />
            </div>
            <Input type="number" className="h-7 text-xs w-20 bg-white" value={row.rate_per_unit} onChange={e => setRows(r => r.map((x, i) => i === idx ? { ...x, rate_per_unit: e.target.value } : x))} placeholder="150" />
            <span className="text-xs text-gray-500">JPY /</span>
            <Input type="number" className="h-7 text-xs w-16 bg-white" value={row.unit_g} onChange={e => setRows(r => r.map((x, i) => i === idx ? { ...x, unit_g: e.target.value } : x))} placeholder="100" />
            <span className="text-xs text-gray-500">g</span>
            {rows.length > 1 && <button onClick={() => setRows(r => r.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 ml-auto"><X className="w-3.5 h-3.5" /></button>}
          </div>
        ))}
      </div>
      <Button size="sm" className="h-8 text-xs bg-purple-600 hover:bg-purple-700" onClick={handleSave} disabled={saving}>
        {saved ? "已保存 ✓" : saving ? "保存中..." : "保存"}
      </Button>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────
export default function ShippingMethodManager({ initialData = null, itemSizeTemplates = [], onReload, settings = [] }) {
  const [methods, setMethods] = useState(null);
  const [selected, setSelected] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  useEffect(() => {
    if (initialData === null) return;
    if (methods !== null) return;

    if (initialData.length === 0 && !seeding) {
      setSeeding(true);
      Promise.all(DEFAULT_METHODS.map(m => tenantEntity.create('ShippingMethod', m)))
        .then(created => setMethods(created))
        .catch(() => setMethods([]))
        .finally(() => setSeeding(false));
    } else {
      setMethods(initialData);
    }
  }, [initialData]);

  const handleSave = async (updated, isNew) => {
    if (isNew) {
      const { id, tenant_id, created_date, updated_date, created_by, ...data } = updated;
      const created = await tenantEntity.create('ShippingMethod', data);
      setMethods(prev => [...(prev || []), created]);
      setSelected(created);
    } else {
      const { id, tenant_id, created_date, updated_date, created_by, ...data } = updated;
      const result = await tenantEntity.update('ShippingMethod', id, data);
      const saved = result || updated;
      setMethods(prev => prev.map(m => m.id === id ? { ...m, ...saved } : m));
      setSelected(prev => prev?.id === id ? { ...prev, ...saved } : prev);
    }
    onReload?.();
  };

  const handleToggle = async (m) => {
    const updated = { ...m, is_active: !m.is_active };
    await tenantEntity.update('ShippingMethod', m.id, { is_active: updated.is_active });
    setMethods(prev => prev.map(x => x.id === m.id ? updated : x));
    if (selected?.id === m.id) setSelected(updated);
    onReload?.();
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    await tenantEntity.delete('ShippingMethod', deleteTargetId);
    setMethods(prev => prev.filter(m => m.id !== deleteTargetId));
    if (selected?.id === deleteTargetId) setSelected(null);
    setDeleteTargetId(null);
    onReload?.();
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

  if (methods === null || seeding) return <div className="py-8 text-center text-gray-400 text-sm">加载中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col xl:flex-row gap-5 items-start">
        {/* Left: detail editor */}
        <div className="flex-1 min-w-0">
          <ShippingDetailPanel
            selected={selected}
            onSave={handleSave}
            onCancel={() => setSelected(null)}
            itemSizeTemplates={itemSizeTemplates}
          />
        </div>
        {/* Right: list & sort */}
        <div className="w-full xl:w-72 flex-shrink-0">
          <ShippingListPanel
            methods={methods}
            activeId={selected?.id}
            onSelect={m => setSelected(m)}
            onToggle={handleToggle}
            onDelete={id => setDeleteTargetId(id)}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
          />
        </div>
      </div>

      <EstimateRateGlobalSetting settings={settings} />

      <ConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={open => { if (!open) setDeleteTargetId(null); }}
        title="确认删除"
        description="确认删除此运输方式？此操作不可撤销。"
        confirmText="删除"
        onConfirm={handleDelete}
        confirmClassName="bg-red-600 hover:bg-red-700"
      />
    </div>
  );
}