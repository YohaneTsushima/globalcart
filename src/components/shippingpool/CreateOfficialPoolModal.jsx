/**
 * CreateOfficialPoolModal
 * Simplified wizard for admins to create official consolidation pools.
 * No order selection step - just basic info (address, shipping method, date, notes).
 * Users can later add their own orders to the pool.
 */
import { useState, useEffect } from "react";
import { X, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { shippingPoolApi, tenantEntity } from "@/lib/tenantApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CountrySelect from "@/components/common/CountrySelect";
import { SHIPPING_METHODS } from "@/components/shippingpool/shippingFormConstants";
import { toast } from "sonner";

export default function CreateOfficialPoolModal({ onClose, onSuccess }) {
  const [user, setUser] = useState(null);
  const [transitLocations, setTransitLocations] = useState([]);
  const [shippingMethods, setShippingMethods] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    recipient_name: "",
    recipient_phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    postal_code: "",
    destination_country: "",
    shipping_method: "",
    scheduled_ship_date: "",
    consolidation_deadline: "",
    consolidation_min_weight_g: 0,
    transit_location_id: "",
    user_note: "",
    title: "",
  });

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const u = await base44.auth.me();
      setUser(u);

      const locs = await tenantEntity.list('TransitLocation', { is_active: true });
      // 只允许「用于官方拼邮」的中转地；未配置时（老数据）不限制
      const settingRows = await tenantEntity.list('SiteSettings', { key: 'official_pool_transit_location_ids' }).catch(() => []);
      let allowedIds = [];
      try {
        allowedIds = JSON.parse(settingRows?.[0]?.value || "[]");
      } catch {
        allowedIds = [];
      }
      const allowedSet = new Set((allowedIds || []).map(String));
      const filteredLocs = allowedSet.size > 0
        ? (locs || []).filter(l => allowedSet.has(String(l.id)))
        : (locs || []);
      setTransitLocations(filteredLocs);

      // 运输方式取租户配置（只保留允许用于官方拼邮的），code 与订单预出货里的 shipping_method 保持一致
      const methods = (await tenantEntity.list('ShippingMethod') || [])
        .filter(m => m.is_active !== false && m.enabled_for_official_pool !== false);
      setShippingMethods(methods);
      if (methods.length === 1) {
        setForm(p => ({ ...p, shipping_method: methods[0].code }));
      }

      // Auto-select the default official pool transit location
      const defaultLoc = filteredLocs.find(l => l.is_default_official_pool) || filteredLocs[0];
      if (defaultLoc) {
        setForm(p => ({
          ...p,
          transit_location_id: defaultLoc.id,
          recipient_name: defaultLoc.manager_contact || "",
          address_line1: defaultLoc.address || "",
          city: defaultLoc.province || "",
          destination_country: defaultLoc.country || "",
        }));
      }

      setLoading(false);
    };
    init().catch(console.error);
  }, []);

  const handleSubmit = async () => {
    if (!form.destination_country) {
      toast.error('请选择目的国家');
      return;
    }
    if (!form.shipping_method) {
      toast.error('请选择运输方式');
      return;
    }
    setSubmitting(true);

    const transitLoc = transitLocations.find(l => l.id === form.transit_location_id);
    const methodRecord = shippingMethods.find(m => m.code === form.shipping_method) || null;

    try {
      // 池号、计费、订单归属全部由后端生成
      await shippingPoolApi.officialCreate({
        title: form.title || "",
        shipping_method: methodRecord?.code || form.shipping_method,
        shipping_method_id: methodRecord?.id || null,
        destination_country: form.destination_country,
        transit_location_id: form.transit_location_id || null,
        transit_location_name: transitLoc?.name || "",
        scheduled_ship_date: form.scheduled_ship_date || "",
        consolidation_deadline: form.consolidation_deadline || "",
        consolidation_min_weight_g: form.consolidation_min_weight_g || 0,
        recipient_name: form.recipient_name || "",
        recipient_phone: form.recipient_phone || "",
        address_line1: form.address_line1 || "",
        address_line2: form.address_line2 || "",
        city: form.city || "",
        state: form.state || "",
        postal_code: form.postal_code || "",
        country: form.destination_country || "",
        user_note: form.user_note || "",
      });
      toast.success('拼邮需求已创建');
      onSuccess?.();
    } catch (err) {
      const message = err?.response?.data?.msg || err?.response?.data?.message || '创建失败，请稍后重试';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 text-sm">加载中...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-semibold text-gray-900">创建官方拼邮需求</h2>
            <p className="text-xs text-gray-400 mt-0.5">填写基本信息，用户后续可自行添加订单</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-500" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <Label className="text-xs text-gray-500">拼邮需求标题（可选）</Label>
            <Input className="mt-1 h-8 text-sm" placeholder="如：3 月下旬东京拼邮"
              value={form.title} onChange={e => f("title", e.target.value)} />
          </div>

          {/* Address selector - transit locations only */}
          <div>
            <Label className="text-xs text-gray-500 font-medium flex items-center gap-1.5 mb-1.5">
              <MapPin className="w-3.5 h-3.5" />收货/中转地址
            </Label>
            <Select 
              value={form.transit_location_id} 
              onValueChange={(v) => {
                const loc = transitLocations.find(l => l.id === v);
                if (loc) {
                  f("transit_location_id", v);
                  f("recipient_name", loc.manager_contact || "");
                  f("address_line1", loc.address || "");
                  f("city", loc.province || "");
                  f("destination_country", loc.country || "");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择中转地..." />
              </SelectTrigger>
              <SelectContent>
                {transitLocations.map(l => (
                  <SelectItem key={l.id} value={l.id}>
                    📍 {l.name} {l.code_prefix ? `(${l.code_prefix})` : ""} - {l.address || "地址待补充"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Country + shipping method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500">目的国家 *</Label>
              <CountrySelect
                value={form.destination_country}
                onChange={v => f("destination_country", v)}
                placeholder="选择国家"
                className="mt-1"
              />
              <p className="text-xs text-gray-400 mt-1">将从收货地址自动填充，可手动修改</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">运输方式</Label>
              <Select value={form.shipping_method} onValueChange={v => f("shipping_method", v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="选择..." /></SelectTrigger>
                <SelectContent>
                  {(shippingMethods.length > 0
                    ? shippingMethods.map(m => ({ value: m.code, label: m.name }))
                    : SHIPPING_METHODS).map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Scheduled date */}
          <div>
            <Label className="text-xs text-gray-500">计划发货日期</Label>
            <Input type="date" className="mt-1 h-8 text-sm" value={form.scheduled_ship_date} onChange={e => f("scheduled_ship_date", e.target.value)} />
          </div>

          {/* Consolidation strategy */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500">凑满目标重量 (g)</Label>
              <Input type="number" min="0" step="100" className="mt-1 h-8 text-sm" placeholder="如：5000"
                value={form.consolidation_min_weight_g || ""}
                onChange={e => f("consolidation_min_weight_g", parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">凑单截止日期</Label>
              <Input type="date" className="mt-1 h-8 text-sm"
                value={form.consolidation_deadline}
                onChange={e => f("consolidation_deadline", e.target.value)} />
            </div>
          </div>

          {/* Note */}
          <div>
            <Label className="text-xs text-gray-500">备注</Label>
            <Textarea rows={2} className="mt-1 text-sm" placeholder="特殊要求、说明..." value={form.user_note} onChange={e => f("user_note", e.target.value)} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-700"
            disabled={submitting || !form.transit_location_id || !form.shipping_method}
            onClick={handleSubmit}>
            {submitting ? "创建中..." : "创建拼邮需求"}
          </Button>
        </div>
      </div>
    </div>
  );
}