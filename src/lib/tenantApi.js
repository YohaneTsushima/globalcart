/**
 * Tenant-safe API helpers
 * All data access for tenant-owned entities goes through here.
 * Never trust tenant_id from client — backend functions derive it from session.
 */
import { base44 } from '@/api/base44Client';
import { getTenantConfigCache, setTenantConfigCache } from '@/lib/configCache';

// ─── Orders ──────────────────────────────────────────────────────────────────

export async function fetchMyOrders() {
  const res = await base44.functions.invoke('getTenantOrders', {});
  return res.data?.orders || [];
}

export async function fetchAllOrders() {
  // Admin-level: backend still enforces tenant isolation
  const res = await base44.functions.invoke('getTenantOrders', { all: true });
  return res.data?.orders || [];
}

export async function createOrder(data) {
  const res = await base44.functions.invoke('createTenantOrder', data);
  return res.data?.order;
}

export async function updateOrder(order_id, data) {
  
  const res = await base44.functions.invoke('admin/orders/updateTenantOrder', { order_id, ...data });
  return res.data?.order;
}

// ─── Shipping Pools ───────────────────────────────────────────────────────────

export async function fetchShippingPools() {
  // const res = await base44.functions.invoke('getTenantShippingPools', {});
  const res = {};
  return res.data?.pools || [];
}

// ─── Config Data (templates, rules, methods, locations, addons) ───────────────

export async function fetchTenantConfig({ force = false } = {}) {
  if (!force) {
    const cached = getTenantConfigCache();
    if (cached) return cached;
  }
  // const res = await base44.functions.invoke('getTenantConfigData', {});
  const res = {};
  const data = res.data || {};
  setTenantConfigCache(data);
  return data;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function fetchTenantSettings() {
  const res = await base44.functions.invoke('getTenantSettings', {});
  return res.data?.settings || {};
}

// ─── Announcements ────────────────────────────────────────────────────────────

export async function fetchAnnouncements() {
  // const config = await fetchTenantConfig();
  // return (config.announcements || []).filter(a => a.is_active);
  try {
    const data = await tenantEntity.list('Announcement');
    return (data || []).filter(a => a.is_active);
  } catch (err) {
    console.error("获取公告失败:", err);
    return [];
  }
}

// ─── Generic tenant-safe entity mutations ─────────────────────────────────────

async function mutate(entity, action, opts = {}) {
  const res = await base44.functions.invoke(`mutateTenantEntity/${entity}/${action}`, { entity, action, ...opts });
  if (res.data?.error) throw new Error(res.data.error?.[0] || JSON.stringify(res.data.error));
  return res.data;
}

export const tenantEntity = {
  list:   (entity, filter = {}) => mutate(entity, 'list', { filter }).then(r => r?.results || r?.data || r.data?.results || r || []),
  create: (entity, data)        => mutate(entity, 'create', { data }).then(r => r.result || r.data?.result || r),
  update: (entity, id, data)    => mutate(entity, 'update', { id, data }).then(r => r.result || r.data?.result || r),
  delete: (entity, id)          => mutate(entity, 'delete', { id }),
  sync: (entity, data) => mutate(entity, 'sync', {data}).then(r => r?.result || r?.data?.result || r),
  one: (entity, id) => mutate(entity, 'one', { id })
};

// ─── ShippingPool shortcuts ───────────────────────────────────────────────────

export const shippingPoolApi = {
  list:   (filter) => tenantEntity.list('ShippingPool', filter),
  create: (data)   => tenantEntity.create('ShippingPool', data),
  update: (id, d)  => tenantEntity.update('ShippingPool', id, d),
  delete: (id)     => tenantEntity.delete('ShippingPool', id),
  one: (id) => tenantEntity.one('ShippingPool', id)
};

// ─── UserPreference shortcuts ─────────────────────────────────────────────────

export const userPrefApi = {
  list:   (filter) => tenantEntity.list('UserPreference', filter),
  create: (data)   => tenantEntity.create('UserPreference', data),
  update: (id, d)  => tenantEntity.update('UserPreference', id, d),
  delete: (id)     => tenantEntity.delete('UserPreference', id),
};

// ─── Page-level aggregated APIs ───────────────────────────────────────────────

export async function fetchMyOrdersPageData() {
  // const res = await base44.functions.invoke('getMyOrdersPageData', {});
  const res = {data: {orders: [], pools: [], storeTagRules: []}};
  return res.data || { orders: [], pools: [], storeTagRules: [] };
}

export async function fetchAdminShippingPoolPageData() {
  // const res = await base44.functions.invoke('getAdminShippingPoolPageData', {});
  const res = {data: {pools: [], locations: [], users: [], transitMethods: [], addonOptions: []}}
  return res.data || { pools: [], locations: [], users: [], transitMethods: [], addonOptions: [] };
}

export async function fetchSubmitOrderPageData() {
  // const res = await base44.functions.invoke('getSubmitOrderPageData', {});
  const res = {data: { addons: [], settings: {}, rates: null }}
  return res.data || { addons: [], settings: {}, rates: null };
}