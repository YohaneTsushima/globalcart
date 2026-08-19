/**
 * PreferenceSettingsCard — 偏好设置（新旧个人档案页共用）
 * 偏好货币 / 界面语言 / 运输方式 / 中转运输方式 / 拼邮 / 订单信息公开
 */
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUserPref } from "@/hooks/useUserPref";
import { tenantEntity } from "@/lib/tenantApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Save } from "lucide-react";
import { toast } from "sonner";

export default function PreferenceSettingsCard() {
  const { pref, savePref } = useUserPref();
  const [form, setForm] = useState({
    preferred_currency: "JPY",
    preferred_language: "zh",
    preferred_shipping: "EMS",
    preferred_transit_shipping_id: null,
    prefer_consolidation: false,
  });
  const [saving, setSaving] = useState(false);

  const { data: transitMethods = [] } = useQuery({
    queryKey: ['transit-shipping-methods'],
    queryFn: async () => {
      const rows = await tenantEntity.list('TransitShippingMethod', { is_active: true });
      return rows || [];
    },
    staleTime: 10 * 60 * 1000,
    placeholderData: [],
    refetchOnMount: false,
  });

  useEffect(() => {
    if (!pref) return;
    setForm({
      preferred_currency: pref.preferred_currency || "JPY",
      preferred_language: pref.preferred_language || "zh",
      preferred_shipping: pref.preferred_shipping || "EMS",
      preferred_transit_shipping_id: pref.preferred_transit_shipping_id || "",
      prefer_consolidation: pref.prefer_consolidation || false,
    });
  }, [pref?.id]); // eslint-disable-line

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    await savePref({ ...form });
    toast.success("偏好设置已保存");
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Settings className="w-4 h-4 text-blue-500" />偏好设置
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm">偏好货币</Label>
            <Select value={form.preferred_currency} onValueChange={v => f("preferred_currency", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["JPY","CNY","USD","EUR","TWD","HKD","SGD","AUD","GBP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">界面语言</Label>
            <Select value={form.preferred_language} onValueChange={v => f("preferred_language", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="zhcn">中文（简体）</SelectItem>
                <SelectItem value="en">English（即将上线）</SelectItem>
                <SelectItem value="ja">日本語（即将上線）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">偏好运输方式</Label>
            <Select value={form.preferred_shipping} onValueChange={v => f("preferred_shipping", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EMS">EMS空运</SelectItem>
                <SelectItem value="surface">海运</SelectItem>
                <SelectItem value="small_packet_air">小型包装物空运</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {transitMethods.length > 0 && (
            <div>
              <Label className="text-sm">默认中转运输方式</Label>
              <Select value={form.preferred_transit_shipping_id || "auto"} onValueChange={v => f("preferred_transit_shipping_id", v === "auto" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">由管理员安排</SelectItem>
                  {transitMethods.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} · {m.fee_currency || "JPY"} {Number(m.fee || 0).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400 mt-1">拼邮发货时的中转段默认运输方式</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between py-1 border-t border-gray-100 pt-3">
          <div>
            <Label className="text-sm">偏好拼邮</Label>
            <p className="text-xs text-gray-400 mt-0.5">与其他用户拼邮，可降低运费</p>
          </div>
          <Switch checked={form.prefer_consolidation} onCheckedChange={v => f("prefer_consolidation", v)} />
        </div>
        <div className="flex justify-end pt-1 border-t border-gray-100">
          <Button size="sm" className="mt-3" onClick={handleSave} disabled={saving}>
            <Save className="w-3.5 h-3.5 mr-1.5" />{saving ? "保存中..." : "保存偏好"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}