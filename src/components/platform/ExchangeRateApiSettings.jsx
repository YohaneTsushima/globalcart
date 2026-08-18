/**
 * 全局汇率查询设置（仅平台管理员）：API 地址 + 查询频率
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Globe } from "lucide-react";
import { tenantManage } from "@/lib/tenantApi";

export default function ExchangeRateApiSettings() {
  const [apiUrl, setApiUrl] = useState("");
  const [refreshMinutes, setRefreshMinutes] = useState(60);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [rateId, setRateId] = useState(null);

  useEffect(() => {

    tenantManage.getRate('TenantsManage')
      .then(res => {
        setRateId(res?.data?.id);
        setApiUrl(res?.data?.api_url || "");
        setRefreshMinutes(res?.data?.refresh_minutes || 60);
        setLastFetchedAt(res?.data?.last_fetched_at);
      }).catch(e => {
          const message = e.response?.data?.message || e.message || '初始化失败';
          setRoleMsg({ type: 'error', text: message });
      });

    setLoading(false)

    // base44.functions.invoke('managePlatformSettings', { action: 'get_exchange_settings' })
    //   .then(res => {
    //     if (res.data && !res.data.error) {
    //       setApiUrl(res.data.api_url || "");
    //       setRefreshMinutes(res.data.refresh_minutes || 60);
    //       setLastFetchedAt(res.data.last_fetched_at);
    //     }
    //     setLoading(false);
    //   })
    //   .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);

    tenantManage.updateRate('TenantsManage', rateId, { api_url: apiUrl, refresh_minutes: refreshMinutes })
      .then(res => {
        setRefreshMinutes(res?.data?.refresh_minutes);
        setMsg({ type: 'success', text: '已保存，对所有租户生效' });
        setTimeout(() => setMsg(null), 3000);
      }).catch(e => {
          const message = e.response?.data?.message || e.message || '保存失败';
          setRoleMsg({ type: 'error', text: message });
      });
      

    // const res = await base44.functions.invoke('managePlatformSettings', {
    //   action: 'set_exchange_settings',
    //   api_url: apiUrl,
    //   refresh_minutes: refreshMinutes,
    // });
    // if (res.data?.error) {
    //   setMsg({ type: 'error', text: res.data.error });
    // } else {
    //   setRefreshMinutes(res.data.refresh_minutes);
    //   setMsg({ type: 'success', text: '已保存，对所有租户生效' });
    //   setTimeout(() => setMsg(null), 3000);
    // }
    setSaving(false);
  };

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Globe className="w-4 h-4 text-blue-500" />全局汇率查询设置
        </CardTitle>
        <p className="text-xs text-gray-400 mt-1">配置全平台的汇率查询 API 与查询频率，所有租户共用</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-xs text-gray-400">加载中...</p>
        ) : (
          <>
            <div>
              <Label className="text-xs text-gray-500">汇率查询 API 地址（留空 = 使用平台默认 API）</Label>
              <Input className="mt-0.5 h-8 text-sm font-mono" placeholder="https://v6.exchangerate-api.com/v6/<key>/latest/JPY"
                value={apiUrl} onChange={e => setApiUrl(e.target.value)} />
              <p className="text-xs text-gray-400 mt-0.5">需返回 exchangerate-api v6 兼容格式（以 JPY 为基准货币）</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">查询频率（分钟，最小 5）</Label>
              <Input className="mt-0.5 h-8 text-sm w-40" type="number" min="5"
                value={refreshMinutes} onChange={e => setRefreshMinutes(parseInt(e.target.value) || 60)} />
              <p className="text-xs text-gray-400 mt-0.5">间隔内的汇率请求使用平台缓存，不再请求外部 API</p>
            </div>
            {lastFetchedAt && (
              <p className="text-xs text-gray-400">上次外部查询时间：{new Date(lastFetchedAt).toLocaleString()}</p>
            )}
            {msg && (
              <p className={`text-xs px-3 py-2 rounded border ${msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {msg.type === 'success' ? '✓ ' : '⚠ '}{msg.text}
              </p>
            )}
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1" />{saving ? "保存中..." : "保存设置"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}