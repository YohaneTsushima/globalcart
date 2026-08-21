/**
 * CustomsDeclarationForm
 * Collapsible customs declaration form for single-shipment notifications.
 * Shown when user selects 单独发货 in UserNotifyShipmentModal.
 */
import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { ChevronDown, ChevronRight, FileText, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const CURRENCIES = ["JPY", "CNY", "USD", "EUR", "TWD", "HKD", "SGD"];
const CONTENT_TYPES = [
  { value: "gift", label: "礼品 (Gift)" },
  { value: "merchandise", label: "商品 (Merchandise)" },
  { value: "documents", label: "文件 (Documents)" },
  { value: "sample", label: "样品 (Sample)" },
  { value: "personal_effects", label: "个人物品 (Personal Effects)" },
  { value: "other", label: "其他 (Other)" },
];

const UNDELIVERABLE_ACTIONS = [
  { value: "return", label: "寄回" },
  { value: "abandon", label: "放弃" },
];

const RETURN_METHODS = [
  { value: "air", label: "空运" },
  { value: "economy", label: "最经济的路线" },
];

function newItem() {
  return { id: Date.now(), name: "", unit_price: "", currency: "JPY", weight_g: "", quantity: 1 };
}

export default function CustomsDeclarationForm({ value, onChange, hazmatText }) {
  const [open, setOpen] = useState(false);

  const newItemNameRef = useRef(null);

  const data = value || {
    items: [newItem()],
    content_type: "gift",
    hazmat_confirmed: false,
    undeliverable_action: "return",
    return_method: "economy",
  };

  // 确保 items 始终是数组
  const items = Array.isArray(data.items) ? data.items : [newItem()];

  const update = (patch) => onChange({ ...data, ...patch });

  const updateItem = (id, patch) =>
    update({ items: items.map(it => it.id === id ? { ...it, ...patch } : it) });

  const addItem = () => {
    update({ items: [...items, newItem()] });
    setTimeout(() => newItemNameRef.current?.focus(), 30);
  };

  const removeItem = (id) => {
    if (items.length <= 1) return;
    update({ items: items.filter(it => it.id !== id) });
  };

  // Auto-calc total value and total weight
  const total = items.reduce((sum, it) => {
    const price = parseFloat(it.unit_price) || 0;
    const qty = parseInt(it.quantity) || 0;
    return sum + price * qty;
  }, 0);
  const totalWeightG = items.reduce((sum, it) => {
    const w = parseFloat(it.weight_g) || 0;
    const qty = parseInt(it.quantity) || 1;
    return sum + w * qty;
  }, 0);

  // All currencies in use (use first item's currency for total display)
  const displayCurrency = items[0]?.currency || "JPY";

  return (
    <div className="border border-orange-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${open ? "bg-orange-50" : "bg-orange-50/60 hover:bg-orange-50"}`}
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-orange-600" />
          <span className="text-sm font-medium text-orange-700">填写报关单（可选）</span>
          {open && total > 0 && (
            <span className="text-xs text-orange-500 bg-orange-100 px-2 py-0.5 rounded-full">
              申报总额 {displayCurrency} {total.toLocaleString()}
            </span>
          )}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-orange-500" /> : <ChevronRight className="w-4 h-4 text-orange-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 bg-orange-50/30 space-y-4">
          {/* Content type */}
          <div>
            <label className="text-xs text-gray-500 font-medium">内容物品种类</label>
            <Select value={data.content_type} onValueChange={v => update({ content_type: v })}>
              <SelectTrigger className="mt-1 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Items table */}
          <div>
            <div className="mb-1.5">
              <label className="text-xs text-gray-500 font-medium">内容物品明细</label>
            </div>
            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-1 text-[10px] text-gray-400 uppercase tracking-wide px-1">
                <span>品名（英文）</span>
                <span>单价</span>
                <span>货币</span>
                <span>重量g</span>
                <span>个数</span>
                <span></span>
              </div>
              {items.map((item, idx) => (
                <div key={item.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-1 items-center">
                  <Input
                    ref={idx === items.length - 1 ? newItemNameRef : null}
                    value={item.name}
                    onChange={e => updateItem(item.id, { name: e.target.value })}
                    placeholder="e.g. Toy Car"
                    className="h-7 text-xs"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    value={item.unit_price}
                    onChange={e => updateItem(item.id, { unit_price: e.target.value })}
                    placeholder="0"
                    className="h-7 text-xs"
                  />
                  <Select value={item.currency} onValueChange={v => updateItem(item.id, { currency: v })}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    inputMode="numeric"
                    value={item.weight_g}
                    onChange={e => updateItem(item.id, { weight_g: e.target.value })}
                    placeholder="100"
                    className="h-7 text-xs"
                  />
                  <Input
                    inputMode="numeric"
                    value={item.quantity}
                    onChange={e => updateItem(item.id, { quantity: e.target.value })}
                    placeholder="1"
                    className="h-7 text-xs"
                  />
                  <button type="button" onClick={() => removeItem(item.id)}
                    className="text-gray-300 hover:text-red-400 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {/* Total */}
            <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-orange-100">
              <button type="button" onClick={addItem}
                className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700">
                <Plus className="w-3 h-3" />添加品类
              </button>
              <div className="flex items-center gap-3">
                {totalWeightG > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-400">总重量：</span>
                    <span className="text-xs font-semibold text-gray-700">{totalWeightG.toLocaleString()} g</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">申报总额：</span>
                  <span className="text-sm font-semibold text-orange-700">
                    {displayCurrency} {total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Hazmat confirmation */}
          {hazmatText && (
            <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-3 space-y-2">
              <div className="prose prose-xs text-yellow-800 max-w-none text-xs leading-relaxed">
                <ReactMarkdown>{hazmatText}</ReactMarkdown>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={!!data.hazmat_confirmed}
                  onCheckedChange={v => update({ hazmat_confirmed: !!v })}
                />
                <span className="text-xs text-yellow-700 font-medium">我已阅读并知情同意上述内容</span>
              </label>
            </div>
          )}

          {/* Undeliverable instruction */}
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-2">无法运送时的指示</label>
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-700 leading-8 flex flex-wrap items-center gap-x-1.5">
              <span>如果出现无法运送到目的地的情况，我希望</span>
              <Select value={data.undeliverable_action} onValueChange={v => update({ undeliverable_action: v, return_method: v === "return" ? (data.return_method || "economy") : undefined })}>
                <SelectTrigger className="inline-flex h-7 border-0 border-b-2 border-dashed border-orange-400 rounded-none bg-orange-50 text-orange-700 font-medium text-sm px-2 w-auto min-w-[70px] focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNDELIVERABLE_ACTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {data.undeliverable_action === "return" && (
                <>
                  <span>，用</span>
                  <Select value={data.return_method || "economy"} onValueChange={v => update({ return_method: v })}>
                    <SelectTrigger className="inline-flex h-7 border-0 border-b-2 border-dashed border-orange-400 rounded-none bg-orange-50 text-orange-700 font-medium text-sm px-2 w-auto min-w-[120px] focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RETURN_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}