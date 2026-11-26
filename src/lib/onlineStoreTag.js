/**
 * Online Store Tag Recognition
 * Matches product URLs against configured rules to assign store tags.
 * Rules are fetched via tenant-safe backend function.
 */

export async function getOnlineStoreRules() {
  try {
    const { fetchTenantConfig } = await import('@/lib/tenantApi');
    const config = await fetchTenantConfig();
    const rules = config?.storeTagRules || [];
    return rules
      .filter(r => r.is_active !== false)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  } catch {
    return [];
  }
}

export function matchStoreTagResult(url, rules) {
  if (!url || !rules || rules.length === 0) return { tag_label: "其它", tag_color: "bg-gray-100 text-gray-700" };
  const urlLower = url.toLowerCase();
  for (const rule of rules) {
    const keyword = (rule.keyword || "").toLowerCase();
    if (keyword && urlLower.includes(keyword)) {
      return { tag_label: rule.tag_label || "其它", tag_color: rule.tag_color || "bg-gray-100 text-gray-700" };
    }
  }
  return { tag_label: "其它", tag_color: "bg-gray-100 text-gray-700" };
}

export function matchStoreTag(url, rules) {
  return matchStoreTagResult(url, rules).tag_label;
}

export async function detectStoreTagResult(url) {
  const rules = await getOnlineStoreRules();
  return matchStoreTagResult(url, rules);
}

export async function detectStoreTag(url) {
  const rules = await getOnlineStoreRules();
  return matchStoreTag(url, rules);
}

// Detect tag for the first URL (primary tag for order) - returns { tag_label, tag_color }
export async function detectPrimaryStoreTagResult(urlsString) {
  if (!urlsString || typeof urlsString !== 'string') return { tag_label: "其它", tag_color: "bg-gray-100 text-gray-700" };
  const urls = urlsString.split('\n').map(s => s.trim()).filter(Boolean);
  if (urls.length === 0) return { tag_label: "其它", tag_color: "bg-gray-100 text-gray-700" };
  return detectStoreTagResult(urls[0]);
}

export async function detectPrimaryStoreTag(urlsString) {
  const result = await detectPrimaryStoreTagResult(urlsString);
  return result.tag_label;
}

/**
 * 找到命中的规则（用于展示「识别依据」），未命中返回 null。
 */
export function findMatchedRule(url, rules) {
  if (!url || !rules || rules.length === 0) return null;
  const urlLower = String(url).toLowerCase();
  for (const rule of rules) {
    const keyword = (rule.keyword || "").toLowerCase();
    if (keyword && urlLower.includes(keyword)) return rule;
  }
  return null;
}

/**
 * 解析订单标签：优先用下单时存下来的标签，只有历史数据没存过才按当前规则现算。
 * 说明：「其它」也算有值，避免新增规则后把历史订单的标签改名。
 */
export function resolveStoreTag(order, rules) {
  if (!order) {
    return { tag_label: "其它", tag_color: "bg-gray-100 text-gray-700", matched_rule: null, from_saved: false };
  }

  const saved = (order.online_store_tag || "").trim();
  if (saved) {
    const colorFromRule = (rules || []).find((r) => (r.tag_label || "").trim() === saved)?.tag_color;
    return {
      tag_label: saved,
      tag_color: order.online_store_tag_color || colorFromRule || "bg-gray-100 text-gray-700",
      matched_rule: null,
      from_saved: true,
    };
  }

  const firstUrl = String(order.product_url || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)[0] || "";
  const result = matchStoreTagResult(firstUrl, rules);
  return {
    ...result,
    matched_rule: findMatchedRule(firstUrl, rules),
    from_saved: false,
  };
}