/**
 * AddonManager
 * Manages order and shipping addon options for a tenant.
 * Extracted from AdminSettings for maintainability.
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";

const CURRENCIES = ["JPY", "CNY", "USD", "TWD", "HKD", "EUR", "SGD"];

function AddonRow({ a, editingId, editFields, onEdit, onCancel, onSave, onToggle, onDelete, setEditFields }) {
  const isEditing = editingId === a.id;
  return (
    <div className={`rounded-lg border mb-1.5 ${a.is_active ? "border-gray-200" : "border-gray-100 opacity-50"}`}>
      <div className="flex items-center gap-3 p-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800">{a.service_name}</span>
            {a.is_user_customizable ? (
              <>
                <Badge className="text-xs bg-green-100 text-green-700 border-green-200">用户可自定义</Badge>
                <span className="text-xs text-gray-500">区间：{a.fee_currency || "JPY"} {a.fee_min} - {a.fee_max}</span>
                <span className="text-xs text-gray-400">默认：{a.fee_currency || "JPY"} {Number(a.fee || 0).toLocaleString()}</span>
              </>
            ) : (
              <span className="text-sm text-red-600">+{a.fee_currency || "JPY"} {Number(a.fee || 0).toLocaleString()}</span>
            )}
            {!a.is_active && <Badge className="text-xs bg-gray-100 text-gray-400">已禁用</Badge>}
          </div>
          {a.user_description && <p className="text-xs text-gray-400">{a.user_description}</p>}
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-500 flex-shrink-0"
          onClick={() => isEditing ? onCancel() : onEdit(a)}>
          {isEditing ? "收起" : "编辑"}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs flex-shrink-0"
          onClick={() => onToggle(a)}>
          {a.is_active ? "禁用" : "启用"}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 flex-shrink-0"
          onClick={() => onDelete(a.id)}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
      {isEditing && (
        <div className="border-t border-gray-100 p-3 bg-gray-50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-gray-500">名称</Label>
              <Input className="mt-0.5 h-7 text-sm" value={editFields.service_name}
                onChange={e => setEditFields(p => ({ ...p, service_name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">说明</Label>
              <Input className="mt-0.5 h-7 text-sm" value={editFields.user_description}
                onChange={e => setEditFields(p => ({ ...p, user_description: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <Switch checked={!!editFields.is_user_customizable}
                  onCheckedChange={v => setEditFields(p => ({ ...p, is_user_customizable: v, min_fee: v ? p.min_fee || 0 : 0, max_fee: v ? p.max_fee || 0 : 0 }))} />
                <Label className="text-xs text-gray-600 cursor-pointer">用户可自定义费用</Label>
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500">默认费用</Label>
              <Input type="number" className="mt-0.5 h-7 text-sm" value={editFields.fee}
                onChange={e => setEditFields(p => ({ ...p, fee: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">货币</Label>
              <Select value={editFields.fee_currency} onValueChange={v => setEditFields(p => ({ ...p, fee_currency: v }))}>
                <SelectTrigger className="mt-0.5 h-7 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {editFields.is_user_customizable && (
              <>
                <div>
                  <Label className="text-xs text-gray-500">最小费用</Label>
                  <Input type="number" className="mt-0.5 h-7 text-sm" value={editFields.min_fee || 0}
                    onChange={e => setEditFields(p => ({ ...p, fee_min: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">最大费用</Label>
                  <Input type="number" className="mt-0.5 h-7 text-sm" value={editFields.max_fee || 0}
                    onChange={e => setEditFields(p => ({ ...p, fee_max: e.target.value }))} />
                </div>
              </>
            )}
            <div className="col-span-2">
              <Label className="text-xs text-gray-500">增值类型</Label>
              <div className="flex gap-3 mt-1">
                {[{ v: "order", l: "下单增值选项" }, { v: "shipping", l: "发货增值选项" }].map(opt => (
                  <label key={opt.v} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-xs ${editFields.addon_type === opt.v ? "border-red-300 bg-red-50 text-red-700" : "border-gray-200 text-gray-600"}`}>
                    <input type="radio" className="hidden" checked={editFields.addon_type === opt.v}
                      onChange={() => setEditFields(p => ({ ...p, addon_type: opt.v }))} />
                    {opt.l}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
              onClick={() => onSave(a.id)}>保存</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs"
              onClick={onCancel}>取消</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AddonManager({ addons, editingAddon, editAddonFields, newAddon,
  setEditAddonFields, setNewAddon,
  onEdit, onCancelEdit, onSave, onToggle, onDelete, onAdd }) {

  const orderAddons = addons.filter(a => !a.addon_type || a.addon_type === "order");
  const shippingAddons = addons.filter(a => a.addon_type === "shipping");

  return (
    <div className="space-y-4">
      {/* Order addons */}
      <div>
        <div className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
          <Badge className="text-xs bg-blue-100 text-blue-700">下单增值选项</Badge>
          <span className="text-gray-400 font-normal">提交订单时展示，费用计入订单付款金额</span>
        </div>
        {orderAddons.length === 0 && <p className="text-xs text-gray-400 py-1">暂无，在下方添加</p>}
        {orderAddons.map(a => (
          <AddonRow key={a.id} a={a}
            editingId={editingAddon}
            editFields={editAddonFields}
            setEditFields={setEditAddonFields}
            onEdit={onEdit}
            onCancel={onCancelEdit}
            onSave={onSave}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* Shipping addons */}
      <div className="border-t pt-3">
        <div className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
          <Badge className="text-xs bg-orange-100 text-orange-700">发货增值选项</Badge>
          <span className="text-gray-400 font-normal">提交发货申请时展示，费用计入发货运费</span>
        </div>
        {shippingAddons.length === 0 && <p className="text-xs text-gray-400 py-1">暂无，在下方添加</p>}
        {shippingAddons.map(a => (
          <AddonRow key={a.id} a={a}
            editingId={editingAddon}
            editFields={editAddonFields}
            setEditFields={setEditAddonFields}
            onEdit={onEdit}
            onCancel={onCancelEdit}
            onSave={onSave}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* Add new */}
      <div className="pt-2 border-t border-dashed border-gray-200 space-y-2">
        <p className="text-xs text-gray-500 font-medium">新增增值选项</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-gray-400">名称 *</Label>
            <Input className="mt-0.5 h-8 text-sm" placeholder="例：质检拍照"
              value={newAddon.service_name} onChange={e => setNewAddon(p => ({ ...p, service_name: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs text-gray-400">说明</Label>
            <Input className="mt-0.5 h-8 text-sm" placeholder="可选"
              value={newAddon.user_description} onChange={e => setNewAddon(p => ({ ...p, user_description: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <Switch checked={!!newAddon.is_user_customizable}
                onCheckedChange={v => setNewAddon(p => ({ ...p, is_user_customizable: v, min_fee: v ? p.min_fee || 0 : 0, max_fee: v ? p.max_fee || 0 : 0 }))} />
              <Label className="text-xs text-gray-600 cursor-pointer">用户可自定义费用</Label>
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-400">默认费用 *</Label>
            <Input type="number" step="1" className="mt-0.5 h-8 text-sm" placeholder="500"
              value={newAddon.fee} onChange={e => setNewAddon(p => ({ ...p, fee: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs text-gray-400">费用货币</Label>
            <Select value={newAddon.fee_currency} onValueChange={v => setNewAddon(p => ({ ...p, fee_currency: v }))}>
              <SelectTrigger className="mt-0.5 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {newAddon.is_user_customizable && (
            <>
              <div>
                <Label className="text-xs text-gray-400">最小费用</Label>
                <Input type="number" step="1" className="mt-0.5 h-8 text-sm" placeholder="0"
                  value={newAddon.fee_min || 0} onChange={e => setNewAddon(p => ({ ...p, fee_min: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">最大费用</Label>
                <Input type="number" step="1" className="mt-0.5 h-8 text-sm" placeholder="0"
                  value={newAddon.fee_max || 0} onChange={e => setNewAddon(p => ({ ...p, fee_max: e.target.value }))} />
              </div>
            </>
          )}
          <div className="col-span-2">
            <Label className="text-xs text-gray-400">增值类型</Label>
            <div className="flex gap-3 mt-1">
              {[{ v: "order", l: "下单增值选项" }, { v: "shipping", l: "发货增值选项" }].map(opt => (
                <label key={opt.v} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-xs ${newAddon.addon_type === opt.v ? "border-red-300 bg-red-50 text-red-700" : "border-gray-200 text-gray-600"}`}>
                  <input type="radio" className="hidden" checked={newAddon.addon_type === opt.v}
                    onChange={() => setNewAddon(p => ({ ...p, addon_type: opt.v }))} />
                  {opt.l}
                </label>
              ))}
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onAdd} disabled={!newAddon.service_name || newAddon.fee === ""}>
          <Plus className="w-3.5 h-3.5 mr-1" />添加
        </Button>
      </div>
    </div>
  );
}