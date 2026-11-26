/**
 * Tenant-safe API helpers
 * All data access for tenant-owned entities goes through here.
 * Never trust tenant_id from client — backend functions derive it from session.
 */
import { base44 } from '@/api/base44Client';
import { getTenantConfigCache, setTenantConfigCache } from '@/lib/configCache';
import { toast } from "sonner";

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

export async function updateTenantOrder(url, payload) {

  try {
    const res = await base44.functions.invoke(url, payload);

    return res;
  } catch(err) {
    let message = err?.message || err?.response?.data?.message;
    toast(`更新失败: ${message}`);
    throw new Error(err);
  }
}

export async function updateOrder(order_id, data) {

  toast.error('功能暂不可用。');
  return {};

  try {
    const res = await base44.functions.invoke('admin/orders/updateTenantOrder', { order_id, ...data });
    if (res.data?.error) {
      throw new Error(res.data.error?.[0] || JSON.stringify(res.data.error));
    }
    return res.data?.order || res?.data;
  } catch (err) {
    // 提取错误消息
    let message = err.message || "更新订单失败";
    if (err.response?.data?.error) {
      message = err.response.data.error?.[0] || JSON.stringify(err.response.data.error);
    }
    toast.error(message);
    return null; // 失败时返回 null
  }
}

export async function cancelOrder(order_id, data) {
  try {
    const res = await base44.functions.invoke('order/info/cancelOrder', { order_id, ...data });
    if (res.data?.error) {
      throw new Error(res.data.error?.[0] || JSON.stringify(res.data.error));
    }
    return res.data?.order || res?.data;
  } catch (err) {
    // 提取错误消息
    let message = err.message || "更新订单失败";
    if (err.response?.data?.error) {
      message = err.response.data.message || JSON.stringify(err.response.data.error);
    }
    toast.error(message);
    return null; // 失败时返回 null
  }
}

// ─── Shipping Pools ───────────────────────────────────────────────────────────

export async function fetchShippingPools() {
  // const res = await base44.functions.invoke('getTenantShippingPools', {});
  const res = await tenantEntity.list('ShippingPool');
  
  return res || res?.data || res?.data?.pools || [];
}

// ─── Config Data (templates, rules, methods, locations, addons) ───────────────

export async function fetchTenantConfig({ force = false } = {}) {
  if (!force) {
    const cached = getTenantConfigCache();
    if (cached) return cached;
  }
  // 基础配置由若干租户级实体拼装（旧的 getTenantConfigData 聚合接口已不存在）
  const safeList = (entity, filter) =>
    tenantEntity.list(entity, filter).then((rows) => rows || []).catch(() => []);

  const [layout, siteSettings, shippingMethods, transitMethods, transitLocations, addons, storeTagRules] = await Promise.all([
    tenantEntity.layoutConfig('SiteSettings').catch(() => null),
    safeList('SiteSettings'),
    safeList('ShippingMethod'),
    safeList('TransitMethod'),
    safeList('TransitLocation'),
    safeList('AddonOption'),
    safeList('StoreTagRule'),
  ]);

  // layoutConfig 只返回布局相关的几条，其余开关/费率在 SiteSettings 全量里，按 key 合并（layout 优先）
  const settingsMap = new Map();
  (Array.isArray(layout?.settings) ? layout.settings : []).forEach((s) => {
    if (s?.key) settingsMap.set(s.key, s);
  });
  (siteSettings || []).forEach((s) => {
    if (s?.key && !settingsMap.has(s.key)) settingsMap.set(s.key, s);
  });
  // 保持 [{ key, value }] 结构，供调用方自行摊平
  const settings = Array.from(settingsMap.values());

  // 国家列表存在 SiteSettings 的 tenant_countries_config（JSON 字符串）
  let countriesConfig = null;
  const countriesRow = settings.find((s) => s?.key === 'tenant_countries_config');
  if (countriesRow?.value) {
    try {
      const parsed = JSON.parse(countriesRow.value);
      if (Array.isArray(parsed)) countriesConfig = parsed;
    } catch { /* 忽略非法 JSON */ }
  }

  const data = {
    settings,
    shippingMethods,
    transitMethods,
    transitLocations,
    addons,
    storeTagRules: (storeTagRules || []).filter((r) => r.is_active !== false),
    countriesConfig,
  };
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

async function mutates(entity, action, opts = []) {
  const res = await base44.functions.invoke(`mutateTenantEntity/${entity}/${action}`, opts);
  if (res.data?.error) throw new Error(res.data.error?.[0] || JSON.stringify(res.data.error));
  return res.data;
}

async function manage(entity, action, opts = {}) {
  const res = await base44.functions.invoke(`mutateTenantManage/${entity}/${action}`, { entity, action, ...opts });
  if (res.data?.error) throw new Error(res.data.error?.[0] || JSON.stringify(res.data.error));
  return res;
}

export const tenantManage = {
  init:         (entity, filter = {}) => manage(entity, 'init', { filter }).then(r => r || r?.data || r.data?.results || r || []),
  list:         (entity, data = {})   => manage(entity, 'list', { data }).then(r => r || r?.data || r?.data || r.data?.results || r || []),
  diagnose:     (entity, filter = {}) => manage(entity, 'diagnose', { filter }).then(r => r || r?.data || r?.data || r.data?.results || r || []),
  getRate:      (entity, filter = {}) => manage(entity, 'platformRate', { filter }).then(r => r || r?.data || r?.data || r.data?.results || r || []),
  updateRate:   (entity, id, data)    => manage(entity, 'updateRate', { id, data }).then(r => r || r?.data || r?.data || r.data?.results || r || []),
  global:       (entity, filter = {}) => manage(entity, 'global', { filter }).then(r => r || r?.data || r?.data || r.data?.results || r || []),
  create:       (entity, data)        => manage(entity, 'create', { data }).then(r => r || r?.data || r.data?.result || r),
  assign:       (entity, data)        => manage(entity, 'assign', { data }).then(r => r || r?.data || r.data?.result || r),
  remove:       (entity, data)        => manage(entity, 'remove', { data }).then(r => r || r?.data || r.data?.result || r),
  assignAll:    (entity, data)        => manage(entity, 'assignAll', { data }).then(r => r || r?.data || r.data?.result || r),
  update:       (entity, id, data)    => manage(entity, 'update', { id, data }).then(r => r || r?.data || r.data?.result || r),
  setDef:       (entity, data)        => manage(entity, 'setGlobalDefaultRole', { data }).then(r => r || r?.data || r.data?.result || r),
  setDefTenant: (entity, data)        => manage(entity, 'defTenantRole', { data }).then(r => r || r?.data || r.data?.result || r),
  delete:       (entity, id)          => manage(entity, 'delete', { id }),
}

export const tenantEntity = {
  list:         (entity, filter = {}) => mutate(entity, 'list', { filter }).then(r => r?.results || r?.data || r.data?.results || r || []),
  create:       (entity, data)        => mutate(entity, 'create', { data }).then(r => r.result || r.data?.result || r),
  update:       (entity, id, data)    => mutate(entity, 'update', { id, data }).then(r => r.result || r.data?.result || r),
  delete:       (entity, id)          => mutate(entity, 'delete', { id }),
  sync:         (entity, data)        => mutate(entity, 'sync', {data}).then(r => r?.result || r?.data?.result || r),
  one:          (entity, id)          => mutate(entity, 'one', { id }),
  layoutConfig: (entity)              => mutate(entity, 'layoutConfig'),
  homeConfig:   (entity)              => mutate(entity, 'homeConfig'),
  register:     (entity, data)        => mutate(entity, 'register', { data }),
  login:        (entity, data)        => mutate(entity, 'login', { data }),
};

// ─── ShippingPool shortcuts ───────────────────────────────────────────────────

export const shippingPoolApi = {
  list:                     (filter)            => tenantEntity.list('ShippingPool', filter),
  page:                     (id, data)          => mutate('ShippingPool', 'page', { id, data }).then(r => r),
  create:                   (data)              => tenantEntity.create('ShippingPool', data),
  update:                   (id, d)             => tenantEntity.update('ShippingPool', id, d),
  handleSaveInfoOnly:       (id, data)          => mutate('ShippingPool', 'handleSaveInfoOnly', { id, data }).then(r => r || r?.data || r?.data || r.data?.results || r || []),
  handleSetAwaitingPayment: (id, data)          => mutate('ShippingPool', 'handleSetAwaitingPayment', { id, data }).then(r => r || r?.data || r?.data || r.data?.results || r || []),
  handleAdjustFees:         (id, data)          => mutate('ShippingPool', 'handleAdjustFees', { id, data }).then(r => r?.result || r),
  delete:                   (id)                => tenantEntity.delete('ShippingPool', id),
  one:                      (id)                => tenantEntity.one('ShippingPool', id),
  other:                    (id)                => mutate('ShippingPool', 'other', { id }).then(r => r?.data || r || []),
  moveOrder:                (id, data)          => mutate('ShippingPool', 'moveOrder', { id, data }).then(r => r?.data || r || []),
  fees:                     (id)                => mutate('ShippingPool', 'fees', { id }).then(r => r),
  returnOrder:              (id, data)          => mutate('ShippingPool', 'handleReturnOrder', { id, data }).then(r => r?.data || r || []),
  addOrder:                 (id, data)          => mutate('ShippingPool', 'submitAddOrder', { id, data }).then(r => r?.data || r || []),
  proof:                    (id, data)          => mutate('ShippingPool', 'updateShipmentProof', { id, data }).then(r => r?.data || r || []),
  confiredmProof:           (id, data, filter)  => mutate('ShippingPool', 'confirmShipmentProof', { id, data, filter }).then(r => r),
  shipped:                  (id, data)          => mutate('ShippingPool', 'handleShip', { id, data }).then(r => r),
  archived:                 (id, data)          => mutate('ShippingPool', 'archived', { id, data }).then(r => r),
  poolCreate:               (id, data)          => mutate('ShippingPool', 'poolCreate', { id, data }).then(r => r),
  handleCreate:             (data)              => mutate('ShippingPool', 'handleCreate', { data }).then(r => r),
  // 官方拼邮看板：池创建 / 订单拖入 / 订单移出（后端直接挂在 /shipping/officialPool/*）
  officialCreate:           (data)              => base44.functions.invoke('shipping/officialPool/create', data).then(r => r?.data || r),
  officialList:             (orderId)           => base44.functions.invoke('shipping/officialPool/list', { order_id: orderId ?? null }).then(r => r?.data || []),
  officialSuggestFee:       (poolId)            => base44.functions.invoke('shipping/officialPool/suggestFee', { pool_id: poolId ?? null }).then(r => r?.data || null),
  officialMove:             (data)              => base44.functions.invoke('shipping/officialPool/moveOrders', data).then(r => r?.data ?? r),
  officialRemove:           (data)              => base44.functions.invoke('shipping/officialPool/removeOrders', data).then(r => r?.data ?? r),
  officialStage:            (data)              => base44.functions.invoke('shipping/officialPool/stage', data).then(r => r?.data ?? r),
  officialUnstage:          (data)              => base44.functions.invoke('shipping/officialPool/unstage', data).then(r => r?.data ?? r),
};

// ─── ShippingPool Edit Request shortcuts ───────────────────────────────────────────────────

export const editRequestApi = {
  approve: (id, url, data) => mutate('ShippingEditRequest', url, { id, data }).then(r => r || r?.data || r?.data || r.data?.results || r || []),
  reject:  (id, url, data) => mutate('ShippingEditRequest', url, { id, data }).then(r => r || r?.data || r?.data || r.data?.results || r || []),
};

// ─── UserPreference shortcuts ─────────────────────────────────────────────────

export const userPrefApi = {
  list:   (filter) => tenantEntity.list('UserPreference', filter),
  create: (data)   => tenantEntity.create('UserPreference', data),
  update: (id, d)  => tenantEntity.update('UserPreference', id, d),
  delete: (id)     => tenantEntity.delete('UserPreference', id),
};

export const userProfApi = {
  register:   (data)   => tenantEntity.register('UserProfile', data),
  login:      (data)   => tenantEntity.login('UserProfile', data),
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

// ─── TransitLocation shortcuts ─────────────────────────────────────────────────
export const transitLocationApi = {
  workData:                (id, data)          => mutate('TransitLocation', 'workData', {}).then(r => r),
  workDataId:              (id, data)          => mutate('TransitLocation', 'getTransitLocationWorkPageData', { id }).then(r => r),
  poolWork:                (poolCode)          => mutate('TransitLocation', `transitPoolWork/${poolCode}`).then(r => r),
  create:                  (data)              => mutate('TransitLocation', 'create', { data }).then(r => r.result || r.data?.result || r),
  update:                  (id, data)          => mutate('TransitLocation', 'update', { id, data }).then(r => r.result || r.data?.result || r),
  delete:                  (id)                => mutate('TransitLocation', 'delete', { id }),
  findOne:                 (id)                => mutate('TransitShipping', 'findOne', { id }),
  saveInfo:                (id, data)          => mutate('TransitShipping', 'save', { id, data }),
  handleArrived:           (data)              => mutates('TransitShipping', 'handleArrived', data),
  handleShipped:           (id, data)          => mutate('TransitShipping', 'handleShipped', { id, data }),
  confirmPickup:           (id, data)          => mutate('TransitShipping', 'confirmPickup', { id, data }),
  userOrAdminConfirm:      (id, data)          => mutate('TransitShipping', 'userOrAdminConfirm', { id, data }),
  completedPickup:         (id, data)          => mutate('TransitShipping', 'completedPickup', { id, data }),
  confirmStorage:          (id, data)          => mutate('TransitShipping', 'confirmStorage', { id, data }),
  handleUploadProof:       (id, data)          => mutate('TransitShipping', 'handleUploadProof', { id, data }),
  confirmUploadProof:      (id, data)          => mutate('TransitShipping', 'confirmUploadProof', { id, data }),
};