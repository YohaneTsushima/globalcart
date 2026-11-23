/**
 * Module-level cache for tenant config data.
 * Avoids re-fetching getTenantConfigData on every page/component mount.
 * TTL: 30 seconds — fresh enough for admin changes to propagate quickly.
 * Cache is keyed per-session (module singleton).
 */

let _cache = null;
let _cacheTs = 0;
const TTL_MS = 30_000;

export function getTenantConfigCache() {
  if (_cache && Date.now() - _cacheTs < TTL_MS) return _cache;
  return null;
}

export function setTenantConfigCache(data) {
  _cache = data;
  _cacheTs = Date.now();
}

export function invalidateTenantConfigCache() {
  _cache = null;
  _cacheTs = 0;
  // Notify Layout (and any other listeners) to reload tenant config
  try { window.dispatchEvent(new CustomEvent('tenantConfigInvalidated')); } catch { /* noop */ }
}

/**
 * 公告数据变更（发布/编辑/删除/上下架）后通知 Layout 重新拉取公告列表。
 * 公告走独立的 list 接口（不在 layoutConfig 里），所以不能复用上面的 config 失效事件。
 */
export function invalidateAnnouncementsCache() {
  try { window.dispatchEvent(new CustomEvent('announcementsInvalidated')); } catch { /* noop */ }
}