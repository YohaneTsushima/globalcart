/**
 * managerUtils - 负责人字段兼容工具
 * 后端 manager_email 现在返回 array（多负责人），旧数据可能是单个 string。
 * 这里统一做归一化，避免各页面写重复的兼容逻辑。
 */

/** 把 manager_email 归一化为 string[]（兼容旧的单字符串 / null / undefined） */
export function normalizeManagerEmails(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return [String(value)];
}

/** 判断 location 是否有负责人 */
export function hasManager(loc) {
  return normalizeManagerEmails(loc?.manager_email).length > 0;
}

/** 判断某用户是否是 location 的负责人之一 */
export function isManagerOf(loc, email) {
  if (!email) return false;
  return normalizeManagerEmails(loc?.manager_email).includes(String(email));
}

/** 判断 location 列表中是否有任一 location 指定该用户为负责人（且启用） */
export function isManagerOfAny(locations, email) {
  if (!email) return false;
  return (locations || []).some(l => l?.is_active && isManagerOf(l, email));
}
