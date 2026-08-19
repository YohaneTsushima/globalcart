import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { tenantEntity } from "@/lib/tenantApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, RefreshCw, TrendingUp, Clock, Key, AlertCircle } from "lucide-react";
import { tenantManage } from "@/lib/tenantApi";

const RATE_PAIRS = [
  { key: "jpy_cny", label: "日元 → 人民币", currency: "CNY" },
  { key: "jpy_usd", label: "日元 → 美元", currency: "USD" },
  { key: "jpy_hkd", label: "日元 → 港元", currency: "HKD" },
  { key: "jpy_twd", label: "日元 → 新台币", currency: "TWD" },
  { key: "jpy_eur", label: "日元 → 欧元", currency: "EUR" },
  { key: "jpy_gbp", label: "日元 → 英镑", currency: "GBP" },
  { key: "jpy_aud", label: "日元 → 澳元", currency: "AUD" },
  { key: "jpy_sgd", label: "日元 → 新加坡元", currency: "SGD" },
];

export default function TenantExchangeRateSettings({ settings, onReload }) {
  const [liveRates, setLiveRates] = useState(null);
  const [rawRates, setRawRates] = useState(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [platformRefreshMinutes, setPlatformRefreshMinutes] = useState(60);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);

  // 租户增量（从 settings prop 读取）
  const [increments, setIncrements] = useState({});
  // 租户自定义 API（key + 频率）
  const [tenantApiKey, setTenantApiKey] = useState("");
  const [tenantRefreshMinutes, setTenantRefreshMinutes] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingInc, setSavingInc] = useState(false);
  const [savingApi, setSavingApi] = useState(false);

  // 初始化增量和 API 设置
  useEffect(() => {
    const incMap = {};
    RATE_PAIRS.forEach(({ key }) => {
      const s = (settings || []).find(s => s.key === `${key}_increment`);
      incMap[key] = s?.value ?? "0";
    });
    setIncrements(incMap);

    const apiKeySetting = (settings || []).find(s => s.key === "tenant_exchange_rate_api_key");
    const freqSetting = (settings || []).find(s => s.key === "tenant_exchange_rate_refresh_minutes");
    setTenantApiKey(apiKeySetting?.value || "");
    setTenantRefreshMinutes(freqSetting?.value || "");
  }, [settings]);

  // 拉取当前汇率（平台增量已叠加）
  const fetchRates = async () => {
    setRatesLoading(true);

    tenantManage.getRate('TenantsManage')
    .then(res => {
      setRateId(res?.data?.id);
      setApiUrl(res?.data?.api_url || "");
      setPlatformRefreshMinutes(res?.data?.refresh_minutes || 60);
      setLastFetchedAt(res?.data?.last_fetched_at);
    }).catch(e => {
        const message = e.response?.data?.message || e.message || '初始化失败';
        setRoleMsg({ type: 'error', text: message });
    }).finally(() => {
        setRatesLoading(false);
    });

    try {
      const res = await base44.functions.invoke('fetchExchangeRates', {});
      if (res.data && !res.data.error) {
        setLiveRates(res.data.rates || res.data);
        setRawRates(res.data.raw_rates || null);
        // 解析平台刷新频率（从 managePlatformSettings 获取）
        const cfgRes = await base44.functions.invoke('managePlatformSettings', { action: 'get_exchange_settings' });
        if (cfgRes.data) {
          setPlatformRefreshMinutes(cfgRes.data.refresh_minutes || 60);
          setLastFetchedAt(cfgRes.data.last_fetched_at || null);
        }
      }
    } finally {
      setRatesLoading(false);
    }
  };

  useEffect(() => { fetchRates(); }, []);

  // 保存增量
  const handleSaveIncrements = async () => {
    setSavingInc(true);
    try {
      const ops = RATE_PAIRS.map(({ key }) => {
        const incKey = `${key}_increment`;
        const val = parseFloat(increments[key]) || 0;
        const existing = (settings || []).find(s => s.key === incKey);
        if (existing) {
          return tenantEntity.update('SiteSettings', existing.id, { value: String(val) });
        } else {
          return tenantEntity.create('SiteSettings', {
            key: incKey,
            value: String(val),
            description: `日元/${key.split('_')[1].toUpperCase()} 汇率增量（叠加在平台增量之上）`,
            category: 'fee',
          });
        }
      });
      await Promise.all(ops);
      await onReload();
    } finally {
      setSavingInc(false);
    }
  };

  // 保存租户 API 设置
  const handleSaveApiSettings = async () => {
    setSavingApi(true);
    try {
      const upsert = async (key, value, description) => {
        const existing = (settings || []).find(s => s.key === key);
        if (existing) {
          await tenantEntity.update('SiteSettings', existing.id, { value });
        } else if (value) {
          await tenantEntity.create('SiteSettings', { key, value, description, category: 'general' });
        }
      };
      await upsert('tenant_exchange_rate_api_key', tenantApiKey.trim(), '租户自定义汇率 API Key');
      await upsert('tenant_exchange_rate_refresh_minutes',
        tenantRefreshMinutes ? String(Math.max(5, parseInt(tenantRefreshMinutes) || 60)) : '',
        '租户自定义汇率查询频率（分钟）');
      await onReload();
    } finally {
      setSavingApi(false);
    }
  };

  const formatRate = (v) => v != null ? v.toFixed(6) : "—";
  const formatTime = (iso) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Tokyo', hour12: false });
    } catch { return iso; }
  };

  return (
    <div className="space-y-5">

      {/* 当前汇率展示 */}
      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />当前汇率（含平台增量）
              </CardTitle>
              <p className="text-xs text-gray-400 mt-1">
                以下为平台查询的最新汇率（已叠加平台增量，不含本租户增量）
              </p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={fetchRates} disabled={ratesLoading}>
              <RefreshCw className={`w-3 h-3 mr-1 ${ratesLoading ? "animate-spin" : ""}`} />
              {ratesLoading ? "查询中..." : "刷新"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 频率提示 */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span>
              平台汇率查询频率：每 <span className="font-semibold text-gray-700">{platformRefreshMinutes} 分钟</span> 刷新一次
            </span>
            {lastFetchedAt && (
              <span className="text-gray-400">
                · 上次更新：{formatTime(lastFetchedAt)}
              </span>
            )}
          </div>

          {ratesLoading && !liveRates && (
            <p className="text-sm text-gray-400 py-4 text-center">加载中...</p>
          )}

          {liveRates && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {RATE_PAIRS.map(({ key, label, currency }) => {
                const raw = rawRates?.[key];
                const withPlatform = liveRates[key];
                const tenantInc = parseFloat(increments[key]) || 0;
                const final = withPlatform != null ? withPlatform + tenantInc : null;
                return (
                  <div key={key} className="bg-gray-50 rounded-lg p-2.5 space-y-1">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {formatRate(withPlatform)}
                    </p>
                    {tenantInc !== 0 && (
                      <p className="text-xs text-green-600">
                        含租户增量 → {formatRate(final)}
                      </p>
                    )}
                    {raw != null && withPlatform != null && Math.abs(withPlatform - raw) > 0.000001 && (
                      <p className="text-xs text-orange-500">
                        市场原价 {formatRate(raw)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 租户级汇率增量 */}
      <Card className="border-green-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-500" />租户汇率增量设置
          </CardTitle>
          <p className="text-xs text-gray-400 mt-1">
            在平台增量基础上叠加本租户专属增量。最终汇率 = 市场汇率 + 平台增量 + 租户增量。正数上浮，负数下浮。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {RATE_PAIRS.map(({ key, label }) => {
              const inc = parseFloat(increments[key]) || 0;
              const base = liveRates?.[key] ?? null;
              return (
                <div key={key}>
                  <Label className="text-xs text-gray-500 block mb-1">{label}</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number" step="0.00001" className="h-8 text-sm flex-1"
                      placeholder="0"
                      value={increments[key] ?? "0"}
                      onChange={e => setIncrements(p => ({ ...p, [key]: e.target.value }))}
                    />
                    <span className="text-xs text-gray-400 w-4">Δ</span>
                  </div>
                  {inc !== 0 && base != null && (
                    <p className="text-xs text-green-600 mt-0.5">
                      → {formatRate(base + inc)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <Button size="sm" className="bg-green-600 hover:bg-green-700 h-8 text-xs" onClick={handleSaveIncrements} disabled={savingInc}>
            <Save className="w-3.5 h-3.5 mr-1" />{savingInc ? "保存中..." : "保存增量设置"}
          </Button>
        </CardContent>
      </Card>

      {/* 租户自定义 API */}
      <Card className="border-orange-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Key className="w-4 h-4 text-orange-500" />自定义汇率 API（可选）
          </CardTitle>
          <p className="text-xs text-gray-400 mt-1">
            配置后，汇率将优先使用本租户的 exchangerate-api.com API Key 进行查询，独立于平台共享频率限制。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2.5 flex items-start gap-2 text-xs text-orange-700">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              前往 <a href="https://www.exchangerate-api.com/" target="_blank" rel="noopener noreferrer" className="underline font-medium">exchangerate-api.com</a> 注册并获取免费 API Key（每月 1500 次免费查询）。填入后可单独控制本租户的查询频率。
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-500 block mb-1">API Key</Label>
              <div className="flex items-center gap-2">
                <Input
                  type={showApiKey ? "text" : "password"}
                  className="h-8 text-sm flex-1 font-mono"
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={tenantApiKey}
                  onChange={e => setTenantApiKey(e.target.value)}
                />
                <Button size="sm" variant="outline" className="h-8 text-xs px-2 flex-shrink-0"
                  onClick={() => setShowApiKey(v => !v)}>
                  {showApiKey ? "隐藏" : "显示"}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1">留空则使用平台共享 API（受平台频率限制）</p>
            </div>

            <div>
              <Label className="text-xs text-gray-500 block mb-1">查询频率（分钟）</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min="5" step="1" className="h-8 text-sm w-32"
                  placeholder={`${platformRefreshMinutes}（平台默认）`}
                  value={tenantRefreshMinutes}
                  onChange={e => setTenantRefreshMinutes(e.target.value)}
                />
                <span className="text-xs text-gray-400">分钟（最小 5 分钟）</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">留空则沿用平台查询频率</p>
            </div>
          </div>

          <Button size="sm" className="bg-orange-600 hover:bg-orange-700 h-8 text-xs" onClick={handleSaveApiSettings} disabled={savingApi}>
            <Save className="w-3.5 h-3.5 mr-1" />{savingApi ? "保存中..." : "保存 API 设置"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}