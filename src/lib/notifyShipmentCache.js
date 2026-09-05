/**
 * Module-level cache for findOrderForNotifyShipment results.
 * TTL: 60 seconds, keyed by sorted order_ids.
 */

let _cache = null;
let _cacheTs = 0;
let _cacheKey = null;
const TTL_MS = 60_000;

export function getNotifyShipmentCache(orderIds) {
  const key = [...orderIds].sort().join(",");
  if (_cache && _cacheKey === key && Date.now() - _cacheTs < TTL_MS) return _cache;
  return null;
}

export function setNotifyShipmentCache(orderIds, data) {
  _cacheKey = [...orderIds].sort().join(",");
  _cache = data;
  _cacheTs = Date.now();
}

export function invalidateNotifyShipmentCache() {
  _cache = null;
  _cacheTs = 0;
  _cacheKey = null;
}
