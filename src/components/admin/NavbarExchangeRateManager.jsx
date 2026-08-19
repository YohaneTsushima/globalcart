/**
 * NavbarExchangeRateManager
 * 导航栏汇率显示设置（管理员 & 用户均可编辑）
 * 配置存储在 SiteSettings key = "navbar_exchange_rate_config" (JSON)
 * 与主页汇率设置完全分离，无显示位置选项。
 */
import { useState, useEffect } from "react";
import { tenantEntity } from "@/lib/tenantApi";
import { invalidateTenantConfigCache } from "@/lib/configCache";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Save, TrendingUp, Plus, X, ArrowUp, ArrowDown, ChevronDown, ArrowLeftRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const PRESET_CURRENCIES = [
  { code: "CNY", label: "人民币" },
  { code: "USD", label: "美元" },
  { code: "EUR", label: "欧元" },
  { code: "TWD", label: "新台币" },
  { code: "HKD", label: "港币" },
  { code: "SGD", label: "新加坡元" },
  { code: "KRW", label: "韩元" },
  { code: "GBP", label: "英镑" },
  { code: "AUD", label: "澳元" },
  { code: "CAD", label: "加元" },
  { code: "THB", label: "泰铢" },
  { code: "MYR", label: "林吉特" },
];

const DEFAULT_CONFIG = {
  enabled: false,
  currencies: [],
};

function normalizeCurrencies(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (typeof raw[0] === "string") return raw.map(c => ({ code: c, unit: 100, reversed: false }));
  return raw;
}

/**
 * props:
 *   settings?: array  — 从父组件传入（AdminSettings），若不传则自行从后端加载
 *   onReload?: fn     — 保存后通知父组件刷新（可选）
 */
export default function NavbarExchangeRateManager({ settings, onReload }) {
  const [form, setForm] = useState(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // 若父组件未提供 settings，则自行加载
  useEffect(() => {
    if (settings !== undefined) return; // 由父组件控制
    tenantEntity.list("SiteSettings", { key: "navbar_exchange_rate_config" })
      .then(list => {
        const s = list?.[0];
        if (s?.value) {
          try {
            const parsed = JSON.parse(s.value);
            setForm({ ...DEFAULT_CONFIG, ...parsed, currencies: normalizeCurrencies(parsed.currencies) });
          } catch { /* noop */ }
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line

  useEffect(() => {
    if (settings === undefined) return;
    const s = (settings || []).find(s => s.key === "navbar_exchange_rate_config");
    if (s?.value) {
      try {
        const parsed = JSON.parse(s.value);
        setForm({
          ...DEFAULT_CONFIG,
          ...parsed,
          currencies: normalizeCurrencies(parsed.currencies),
        });
      } catch { /* noop */ }
    }
  }, [settings]);

  const selectedCodes = (form.currencies || []).map(c => c.code);

  const addPreset = (code) => {
    if (selectedCodes.includes(code)) return;
    setForm(p => ({ ...p, currencies: [...p.currencies, { code, unit: 100, reversed: false }] }));
  };

  const addCustom = () => {
    const code = customInput.trim().toUpperCase();
    if (!code || code.length < 2 || code.length > 6) return;
    if (selectedCodes.includes(code)) { setCustomInput(""); return; }
    setForm(p => ({ ...p, currencies: [...p.currencies, { code, unit: 100, reversed: false }] }));
    setCustomInput("");
  };

  const removeCurrency = (code) => {
    setForm(p => ({ ...p, currencies: p.currencies.filter(c => c.code !== code) }));
  };

  const updateUnit = (code, val) => {
    const n = parseInt(val, 10);
    setForm(p => ({
      ...p,
      currencies: p.currencies.map(c => c.code === code ? { ...c, unit: isNaN(n) || n < 1 ? 1 : n } : c),
    }));
  };

  const move = (idx, dir) => {
    setForm(p => {
      const arr = [...p.currencies];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return p;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return { ...p, currencies: arr };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const value = JSON.stringify(form);
      const existingList = await tenantEntity.list("SiteSettings", { key: "navbar_exchange_rate_config" });
      const existing = existingList?.[0];
      
      if (existing?.id) {
        await tenantEntity.update("SiteSettings", existing.id, { value });
      } else {
        await tenantEntity.create("SiteSettings", {
          key: "navbar_exchange_rate_config",
          value,
          description: "导航栏汇率显示配置（JSON）",
          category: "general",
        });
      }
      // 失效 configCache，使 Layout 下次 mount 或路由切换时重新加载最新配置
      invalidateTenantConfigCache();
      if (onReload) await onReload();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-teal-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-600" />
            <CardTitle className="text-sm font-semibold text-gray-700">导航栏汇率显示设置</CardTitle>
          </div>
          <Button size="sm" className="h-7 text-xs bg-teal-600 hover:bg-teal-700" onClick={handleSave} disabled={saving}>
            <Save className="w-3 h-3 mr-1" />{saved ? "已保存 ✓" : saving ? "保存中..." : "保存"}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-1">在顶部导航栏显示实时汇率小标签，对所有访问者可见。</p>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* 总开关 */}
        <div className="flex items-center gap-2">
          <Switch id="navbar-rate-enable-switch" checked={!!form.enabled} onCheckedChange={v => setForm(p => ({ ...p, enabled: !!v }))} />
          <Label className="text-sm cursor-pointer select-none" htmlFor="navbar-rate-enable-switch">启用导航栏汇率显示</Label>
        </div>

        {form.enabled && (
          <>
            {/* ── 已选币种列表 ── */}
            <div>
              <Label className="text-xs text-gray-500 block mb-2">
                显示币种 · 顺序即展示顺序（已选 {form.currencies.length} 个）
              </Label>

              {form.currencies.length === 0 && (
                <p className="text-xs text-gray-400 italic py-2">尚未添加任何币种，请从下方选择或输入。</p>
              )}

              <div className="space-y-1.5">
                {form.currencies.map(({ code, unit, reversed }, idx) => {
                  const preset = PRESET_CURRENCIES.find(p => p.code === code);
                  return (
                    <div key={code} className="flex items-center gap-2 bg-white border border-teal-200 rounded-lg px-2.5 py-2">
                      {/* 排序按钮 */}
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => move(idx, -1)} disabled={idx === 0}
                          className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-20 transition-colors">
                          <ArrowUp className="w-3 h-3 text-gray-400" />
                        </button>
                        <button onClick={() => move(idx, 1)} disabled={idx === form.currencies.length - 1}
                          className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-20 transition-colors">
                          <ArrowDown className="w-3 h-3 text-gray-400" />
                        </button>
                      </div>

                      {/* 币种标识 */}
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-teal-800">{code}</span>
                        {preset && <span className="text-xs text-gray-400 ml-1.5">{preset.label}</span>}
                      </div>

                      {/* 比例单位 */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-xs text-gray-400 whitespace-nowrap">单位</span>
                        <Input
                          type="number"
                          min={1}
                          className="h-7 text-xs w-20 text-center"
                          value={unit}
                          onChange={e => updateUnit(code, e.target.value)}
                        />
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {form.currencies.find(c => c.code === code)?.reversed ? code : "日元"}
                        </span>
                      </div>

                      {/* 反转按钮 */}
                      <button
                        title={reversed ? "当前：外币→日元（点击切换回日元→外币）" : "当前：日元→外币（点击切换为外币→日元）"}
                        onClick={() => setForm(p => ({
                          ...p,
                          currencies: p.currencies.map(c => c.code === code ? { ...c, reversed: !c.reversed } : c)
                        }))}
                        className={`p-1 rounded transition-colors flex-shrink-0 ${
                          reversed
                            ? "bg-blue-100 text-blue-600 hover:bg-blue-200"
                            : "hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                        }`}
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                      </button>

                      {/* 删除 */}
                      <button onClick={() => removeCurrency(code)}
                        className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── 添加币种 ── */}
            <div>
              <Label className="text-xs text-gray-500 block mb-1.5">添加币种</Label>
              <div className="flex gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(v => !v)}
                    className="h-8 px-3 text-xs border border-gray-200 rounded-md bg-white flex items-center gap-1.5 hover:border-teal-300 hover:bg-teal-50 transition-colors min-w-[140px]"
                  >
                    <span className="flex-1 text-left text-gray-500">选择预设币种…</span>
                    <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </button>
                  {dropdownOpen && (
                    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px] max-h-56 overflow-y-auto">
                      {PRESET_CURRENCIES.map(c => {
                        const selected = selectedCodes.includes(c.code);
                        return (
                          <button
                            key={c.code}
                            type="button"
                            disabled={selected}
                            onClick={() => { addPreset(c.code); setDropdownOpen(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
                              selected
                                ? "text-gray-300 cursor-not-allowed"
                                : "text-gray-700 hover:bg-teal-50 hover:text-teal-700 cursor-pointer"
                            }`}
                          >
                            <span className="font-semibold w-10 flex-shrink-0">{c.code}</span>
                            <span className="text-gray-400">{c.label}</span>
                            {selected && <span className="ml-auto text-teal-500 text-xs">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Input
                  className="h-8 text-xs uppercase w-24"
                  placeholder="自定义…"
                  value={customInput}
                  maxLength={6}
                  onChange={e => setCustomInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && addCustom()}
                />
                <Button size="sm" variant="outline" className="h-8 px-3 text-xs flex-shrink-0" onClick={addCustom}
                  disabled={!customInput.trim()}>
                  <Plus className="w-3.5 h-3.5 mr-1" />添加
                </Button>
              </div>
              {dropdownOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
              )}
            </div>

            {/* ── 预览 ── */}
            {form.currencies.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                <p className="text-xs text-gray-400 mb-1.5">显示预览（实际数字会用实时汇率替换）</p>
                <div className="flex flex-wrap gap-2">
                  {form.currencies.map(({ code, unit, reversed }) => (
                    <span key={code} className="inline-flex items-center gap-1 text-xs bg-white border border-emerald-200 text-emerald-800 rounded-full px-2.5 py-1 font-medium">
                      <TrendingUp className="w-3 h-3" />
                      {reversed
                        ? <><span className="opacity-70">{unit}{code}=</span><span className="font-bold">---</span>¥</>
                        : <><span className="opacity-70">{unit}¥=</span><span className="font-bold">---</span> {code}</>
                      }
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}