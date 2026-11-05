import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { getCompanyName } from "@/lib/kuaidi100Companies";
import { Loader2, Package, Truck, AlertCircle, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";

// 快递公司 logo（kuaidi100 CDN，按公司编码 key；kuaidi100 生产环境同款）
// 注意：未知/冷门编码会 404（返回文本），需 onError 回退
const carrierLogoUrl = (code, size = 56) => `https://cdn.kuaidi100.com/images/all/${size}/${code}.png`;

function CarrierLogo({ code, name, size = 28 }) {
  const [failed, setFailed] = useState(false);
  if (!code || failed) {
    // 回退：公司名首字圆徽章（比通用"?"更友好）
    return (
      <span
        className="rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-medium"
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        {(name || "?").slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      src={carrierLogoUrl(code)}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      className="rounded"
      onError={() => setFailed(true)}
    />
  );
}


// 从 context 里提取状态标签（已签收/待取件/派送中/运输中/已揽件...）
function extractStatusTag(context = "") {
  if (/已签收|签收人|完成取件/.test(context)) return { label: "已签收", tone: "delivered" };
  if (/待取件|暂存|取件码/.test(context)) return { label: "待取件", tone: "waiting" };
  if (/派送|正在为您派送|派件/.test(context)) return { label: "派送中", tone: "shipping" };
  if (/已到达|已离开|转运|运输|发往/.test(context)) return { label: "运输中", tone: "transit" };
  if (/揽收|已揽件/.test(context)) return { label: "已揽件", tone: "picked" };
  return null;
}

const TONE_STYLES = {
  delivered: "text-orange-600",
  waiting: "text-gray-800",
  shipping: "text-gray-800",
  transit: "text-gray-800",
  picked: "text-gray-800",
};

// 后端 traces[].status → 颜色 tone
const STATUS_TONE = {
  "已签收": "delivered",
  "待取件": "waiting",
  "派送中": "shipping",
  "运输中": "transit",
  "已揽件": "picked",
  "已揽收": "picked",
};

// 相对日期：今天 / 昨天 / MM-DD HH:mm（时间字符串可能是 ISO 格式 2026-11-03T12:30:00+08:00）
function formatTime(timeStr) {
  if (!timeStr) return "";
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return timeStr;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (t >= startOfToday) return `今天 ${hhmm}`;
  if (t >= startOfToday - 86400000) return `昨天 ${hhmm}`;
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hhmm}`;
}

export default function TrackingQuery() {
  const [params] = useSearchParams();
  const orderId = params.get("order_id") || "";
  const [orderNumber, setOrderNumber] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setData(null);
    base44.functions
      .invoke("tracking/query", { order_id: orderId })
      .then((res) => {
        if (!cancelled) setData(res?.data ?? res);
        setOrderNumber(res?.data?.order_number || res?.order_number);
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e?.response?.data?.msg || e?.response?.data?.message || e?.message || "查询失败";
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [orderId]);

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(nu);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) {}
  };

  // 后端响应（base44.functions.invoke 返回 r.data）：
  // { code, data: { tracking_number, provider, type, company_code, status, status_code, last_update_time, traces: [{time, status, context}] }, msg }
  const traces = Array.isArray(data?.traces) ? data.traces : [];
  const VISIBLE_COUNT = 3;
  const canToggle = traces.length > VISIBLE_COUNT;
  const visibleTraces = canToggle && !expanded ? traces.slice(0, VISIBLE_COUNT) : traces;
  const comCode = data?.company_code || data?.provider || data?.com || "";
  const comName = comCode ? getCompanyName(comCode) : "物流轨迹";
  const nu = data?.tracking_number || data?.nu || "";
  const type = data?.type || "";
  const overallStatus = data?.status || "";

  return (
    <div className="w-full px-8 py-8">
      <div className="flex items-center gap-2 mb-4">
        <Truck className="w-5 h-5 text-blue-600" />
        <h1 className="text-xl font-bold text-gray-900">物流查询</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        {/* 头部：快递公司 + 单号 + 复制 + 客服电话 */}
        <div className="flex items-start justify-between flex-wrap gap-2 pb-3">
          <div className="flex items-center gap-2">
            <CarrierLogo code={comCode} name={comName} />
            <span className="text-base font-semibold text-gray-900">{comName}</span>
            <span className="font-mono text-base text-gray-800 select-all">{nu}</span>
            <button
              onClick={copyNumber}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "已复制" : "复制"}
            </button>
          </div>
          {data?.phone && (
            <div className="text-xs text-gray-500">联系电话：{data.phone}</div>
          )}
        </div>

        {/* 查询参数（小字，轻量展示） */}
        <div className="flex flex-wrap gap-4 pb-3 text-xs text-gray-500 border-b border-gray-100">
          <div>
            <span className="text-gray-400">订单号：</span>
            <span className="font-mono text-gray-700 select-all">{orderNumber || "-"}</span>
          </div>
          {type && (
            <div>
              <span className="text-gray-400">类型：</span>
              <span className="font-medium text-gray-700">{type === "domestic" || type === "DOMESTIC" ? "国内物流" : type}</span>
            </div>
          )}
          {nu && (
            <div>
              <span className="text-gray-400">运单号：</span>
              <span className="font-mono text-gray-700 select-all">{nu}</span>
            </div>
          )}
          {comCode && (
            <div>
              <span className="text-gray-400">快递公司：</span>
              <span className="font-medium text-gray-700">{comName}</span>
            </div>
          )}
        </div>

        {/* 主体 */}
        {!orderId ? (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded px-3 py-2 mt-4">
            <AlertCircle className="w-4 h-4" />
            缺少查询参数（order_id）。
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">正在查询物流信息...</span>
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2 mt-4">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            <div>
              <p className="font-medium">查询失败</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        ) : traces.length > 0 ? (
          <div className="mt-4">
            {/* 时间轴轨迹 */}
            <div className="relative">
              {visibleTraces.map((t, i) => {
                // 优先用后端给的 t.status，回退到从 context 提取
                const tag = t.status
                  ? { label: t.status, tone: STATUS_TONE[t.status] || "transit" }
                  : extractStatusTag(t.context);
                const isLatest = i === 0;
                return (
                  <div key={i} className="relative pl-6 pb-5">
                    {/* 竖线：不是最后一条，或收起状态下还有隐藏条目时，画到容器底 */}
                    {(i < visibleTraces.length - 1 || (canToggle && !expanded)) && (
                      <div className="absolute left-[5px] top-4 bottom-0 w-px bg-gray-200" />
                    )}
                    {/* 圆点 */}
                    <div className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 ${
                      isLatest ? "bg-blue-500 border-blue-500" : "bg-white border-gray-300"
                    }`} />
                    {/* 标题行：状态标签（最新）+ 时间 */}
                    <div className="flex items-baseline gap-2">
                      {isLatest && tag ? (
                        <span className={`text-sm font-semibold ${TONE_STYLES[tag.tone] || "text-gray-800"}`}>
                          {tag.label}
                        </span>
                      ) : null}
                      <span className="text-sm text-gray-500">{formatTime(t.ftime || t.time)}</span>
                    </div>
                    {/* 内容 */}
                    <p className="text-sm text-gray-600 mt-1 leading-relaxed">{t.context}</p>
                  </div>
                );
              })}
              {/* 展开/收起切换 */}
              {canToggle && (
                <div className="relative pl-6">
                  <div className="absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 border-gray-300 bg-white" />
                  <button
                    onClick={() => setExpanded(v => !v)}
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    {expanded ? (
                      <>收起全部 <ChevronUp className="w-4 h-4" /></>
                    ) : (
                      <>展开更多物流明细 <ChevronDown className="w-4 h-4" /></>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded px-3 py-2 mt-4">
            <Package className="w-4 h-4" />
            暂无物流信息。
          </div>
        )}
      </div>
    </div>
  );
}
