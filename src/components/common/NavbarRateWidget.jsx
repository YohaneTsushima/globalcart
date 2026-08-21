/**
 * NavbarRateWidget
 * 导航栏内嵌汇率显示（紧凑单行）
 * props:
 *   currencies: string[]  — 从 navbar_exchange_rate_config 读取
 */
import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { TrendingUp } from "lucide-react";

let _cache = null;
let _cacheTs = 0;

async function fetchRates() {
  const now = Date.now();
  if (_cache && now - _cacheTs < 5 * 60 * 1000) return _cache;
  try {
    const r = await base44.functions.invoke("config/page/fetchExchangeRates", {});
    let rates = r?.data?.dates || r?.data?.conversion_rates;
    if (rates) { _cache = rates; _cacheTs = now; return _cache; }
  } catch { /* noop */ }
  return _cache;
}

function fmt(val, code, unit = 100) {
  if (!val) return "---";
  const noDecimal = ["KRW", "IDR", "VND"];
  const amount = val * unit;
  if (noDecimal.includes(code)) return Math.round(amount).toLocaleString();
  if (amount >= 1) return amount.toFixed(2);
  const str = amount.toFixed(20);
  const dotIdx = str.indexOf('.');
  let firstSigIdx = -1;
  for (let i = dotIdx + 1; i < str.length; i++) {
    if (str[i] !== '0') { firstSigIdx = i - dotIdx; break; }
  }
  const decimals = firstSigIdx >= 0 ? firstSigIdx + 1 : 4;
  return amount.toFixed(decimals);
}

// 标准化为 [{code, unit, reversed}] 格式
function normalizeItems(currencies, defaultUnit = 100) {
  if (!Array.isArray(currencies) || currencies.length === 0) return [];
  if (typeof currencies[0] === "string") return currencies.map(c => ({ code: c, unit: defaultUnit, reversed: false }));
  return currencies;
}

function fmtReversed(value, code, unit = 1) {
  if (!value) return "---";
  const jpy = unit / value;
  if (jpy >= 1) return Math.round(jpy).toLocaleString();
  return jpy.toFixed(2);
}

export default function NavbarRateWidget({ currencies = [], unit = 100 }) {
  const items = normalizeItems(currencies, unit);
  const [rates, setRates] = useState(null);

  const codeKey = useMemo(() => items.map(i => i.code).join(","), [items]);

  useEffect(() => {
    if (!items.length) return;
    fetchRates().then(setRates);
  }, [codeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!items.length || !rates) return null;

  return (
    <div className="hidden md:flex items-center gap-2 px-2">
      {items.map(({ code, unit: u, reversed }) => {
        // const val = rates[`jpy_${code.toLowerCase()}`] ?? rates[code.toLowerCase()];
        const val = rates[code];
        return (
          <span key={code} className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 font-medium whitespace-nowrap">
            <TrendingUp className="w-3 h-3" />
            {reversed
              ? `${u}${code}=${fmtReversed(val, code, u)}¥`
              : `${u}¥=${fmt(val, code, u)}${code}`
            }
          </span>
        );
      })}
    </div>
  );
}