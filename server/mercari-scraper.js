import express from 'express';
import { chromium } from 'playwright';

const app = express();
const PORT = process.env.PORT || 3002;

// ── 浏览器单例 ──────────────────────────────────────────────────────────────
let browser = null;
let requestCount = 0;
let lastRestartTime = Date.now();
const MAX_REQUESTS_BEFORE_RESTART = 50;
const MAX_RESTART_INTERVAL = 30 * 60 * 1000; // 30 分钟
const MAX_BROWSER_MEMORY_MB = 200;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    if (browser) { try { await browser.close(); } catch {} }
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });
    browser.on('disconnected', () => { browser = null; });
    requestCount = 0;
    lastRestartTime = Date.now();
    console.log('[scraper] 浏览器已启动');
  }
  return browser;
}

// 检查是否需要重启浏览器（请求次数或时间超限）
async function checkAndRestartBrowser() {
  const needsRestart =
    requestCount >= MAX_REQUESTS_BEFORE_RESTART ||
    Date.now() - lastRestartTime > MAX_RESTART_INTERVAL;

  if (needsRestart && browser) {
    console.log(`[scraper] 定期重启浏览器 (requests=${requestCount}, uptime=${Math.round((Date.now() - lastRestartTime) / 1000)}s)`);
    try { await browser.close(); } catch {}
    browser = null;
  }
}

// ── 并发控制 ────────────────────────────────────────────────────────────────
const MAX_CONCURRENT = 3;
let activeCount = 0;
const waitQueue = [];

function acquireSlot() {
  return new Promise((resolve) => {
    if (activeCount < MAX_CONCURRENT) {
      activeCount++;
      resolve();
    } else {
      waitQueue.push(resolve);
    }
  });
}

function releaseSlot() {
  activeCount--;
  if (waitQueue.length > 0) {
    activeCount++;
    const next = waitQueue.shift();
    next();
  }
}

// ── 简易 LRU 缓存 ──────────────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX = 100;

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data) {
  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, { data, ts: Date.now() });
}

// ── URL 验证 ────────────────────────────────────────────────────────────────
function parseMercariUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    if (!url.hostname.includes('mercari.com')) return null;
    const match = url.pathname.match(/\/item\/(m\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ── 抓取逻辑 ────────────────────────────────────────────────────────────────
async function scrapeMercariItem(url) {
  const itemId = parseMercariUrl(url);
  if (!itemId) throw { status: 400, message: '无效的 Mercari 链接' };

  const cached = cacheGet(itemId);
  if (cached) return cached;

  // 检查是否需要定期重启浏览器
  await checkAndRestartBrowser();

  // 获取并发槽位（最多 3 个并发）
  await acquireSlot();

  let context = null;
  try {
    const b = await getBrowser();
    context = await b.newContext();
    const page = await context.newPage();
    requestCount++;

    let itemData = null;

    page.on('response', async (response) => {
      if (itemData) return;
      const reqUrl = response.url();
      if (reqUrl.includes('api.mercari.jp/items/get') && reqUrl.includes(itemId)) {
        try {
          const json = await response.json();
          if (json?.data?.id === itemId) {
            itemData = {
              price: json.data.price,
              title: json.data.name,
              imageUrl: json.data.photos?.[0] || json.data.thumbnails?.[0] || '',
              status: json.data.status,
            };
          }
        } catch {}
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // 等待 API 响应被拦截，最多等 15 秒
    const deadline = Date.now() + 15000;
    while (!itemData && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 300));
    }

    // 如果 API 拦截失败，尝试从页面 meta 标签提取
    if (!itemData) {
      itemData = await page.evaluate(() => {
        const priceEl = document.querySelector('meta[itemprop="price"]');
        const titleEl = document.querySelector('meta[property="og:title"]');
        const imgEl = document.querySelector('meta[property="og:image"]');
        const price = priceEl?.getAttribute('content');
        if (!price) return null;
        return {
          price: parseInt(price, 10),
          title: titleEl?.getAttribute('content') || '',
          imageUrl: imgEl?.getAttribute('content') || '',
          status: 'unknown',
        };
      });
    }

    if (!itemData || !itemData.price) {
      throw { status: 502, message: '未获取到商品信息' };
    }

    cacheSet(itemId, itemData);
    return itemData;
  } finally {
    // 只关闭 context（会连带关闭 page），不关闭 browser
    if (context) await context.close().catch(() => {});
    releaseSlot();
  }
}

// ── 路由 ────────────────────────────────────────────────────────────────────
app.get('/api/scraper/mercari', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: '缺少 url 参数' });

  try {
    const data = await scrapeMercariItem(url);
    res.json(data);
  } catch (err) {
    const status = err.status || 500;
    const message = err.message || '抓取失败';
    console.error(`[scraper] ${status} ${message} url=${url}`);
    res.status(status).json({ error: message });
  }
});

// ── 健康检查 ────────────────────────────────────────────────────────────────
app.get('/api/scraper/health', (req, res) => {
  res.json({
    status: 'ok',
    cache_size: cache.size,
    active_requests: activeCount,
    total_requests: requestCount,
    browser_running: !!browser,
    uptime_seconds: Math.round((Date.now() - lastRestartTime) / 1000),
  });
});

// ── 启动 ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[scraper] Mercari 抓取服务已启动: http://localhost:${PORT}`);
});

// 进程退出时关闭浏览器
process.on('SIGINT', async () => { if (browser) await browser.close(); process.exit(); });
process.on('SIGTERM', async () => { if (browser) await browser.close(); process.exit(); });
