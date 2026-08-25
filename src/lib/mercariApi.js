/**
 * Mercari 商品信息自动获取
 * 通过 Playwright 抓取服务获取 Mercari 商品的价格、标题、图片
 */

export function isMercariUrl(url) {
  if (!url) return false;
  return /mercari\.com\/item\/m\d+/.test(url);
}

export function extractMercariItemId(url) {
  if (!url) return null;
  const match = url.match(/\/item\/(m\d+)/);
  return match ? match[1] : null;
}

export async function fetchMercariItemInfo(url) {
  const res = await fetch(`/api/scraper/mercari?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '抓取失败');
  }
  return res.json();
}
