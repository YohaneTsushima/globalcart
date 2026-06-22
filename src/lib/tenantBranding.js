/**
 * Tenant branding context — resolved from the current hostname.
 * Fetches once at app boot and caches in memory + sessionStorage.
 *
 * Returns:
 * {
 *   tenant: { id, code, subdomain, branding_name, logo_url, favicon_url,
 *             theme_color, login_title, login_subtitle, contact_info } | null
 *   isResolved: boolean
 * }
 */

import { base44 } from '@/api/base44Client';

// Cache key includes hostname so different domains don't share cached branding
const CACHE_KEY = `tenant_branding_v1_${typeof window !== 'undefined' ? window.location.hostname : 'ssr'}`;
let _cache = null;

/**
 * Resolve tenant branding from current hostname.
 * Returns null tenant if running on the root domain or no match found.
 */
export async function resolveTenantBranding() {
  if (_cache) return _cache;

  // Try sessionStorage first (survives navigation within tab)
  try {
    const stored = sessionStorage.getItem(CACHE_KEY);
    if (stored) {
      _cache = JSON.parse(stored);
      return _cache;
    }
  } catch (_) {}

  const hostname = window.location.hostname;

  // const res = await base44.functions.invoke('resolveTenantBySubdomain', { hostname });
  const res = {datga: {tenat: ''}};
  const tenant = res.data?.tenant || null;

  _cache = { tenant, isResolved: true };

  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(_cache));
  } catch (_) {}

  return _cache;
}

export function getTenantBrandingCache() {
  return _cache;
}

export function clearTenantBrandingCache() {
  _cache = null;
  try { sessionStorage.removeItem(CACHE_KEY); } catch (_) {}
}

// Call this once on app start to clear any stale cross-hostname cache entries
export function purgeStaleTenantCache() {
  try {
    const keys = Object.keys(sessionStorage);
    keys.forEach(k => {
      if (k.startsWith('tenant_branding_v1_') && k !== CACHE_KEY) {
        sessionStorage.removeItem(k);
      }
    });
  } catch (_) {}
}

/**
 * Returns the subdomain extracted from the current hostname.
 * e.g. "tongyi.example.com" → "tongyi"
 *      "localhost"           → null
 *      "example.com"         → null
 */
export function getCurrentSubdomain() {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  if (parts.length >= 3 && parts[0] !== 'www') return parts[0];
  return null;
}