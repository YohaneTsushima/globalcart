import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PERMISSIONS_PRESET } from "@/lib/permissionsPreset";
import PermissionGrid from "@/components/admin/PermissionGrid.jsx";
import { tenantManage } from "@/lib/tenantApi";
import { toast } from "sonner";

// Flatten for counting overrides
function flattenPreset(preset) {
  const result = [];
  preset.forEach(cat => {
    cat.permissions.forEach(p => {
      result.push({ id: p.name, name: p.display_name, category: cat.category });
      (p.children || []).forEach(child => {
        result.push({ id: child.name, name: child.display_name, category: cat.category });
      });
    });
  });
  return result;
}

const ALL_PERMISSIONS = flattenPreset(PERMISSIONS_PRESET);

/**
 * Compute base permissions from a set of role IDs.
 */
function computeBasePerms(roleIds, allRoles) {
  const set = new Set();
  roleIds.forEach(id => {
    const role = allRoles.find(r => r.id === id);
    (role?.direct_permissions || []).forEach(p => set.add(p));
  });
  return set;
}

/**
 * Derive permission_overrides map from (basePerms, effectivePerms):
 *   - perm in effective but NOT in base → "add"
 *   - perm in base but NOT in effective → "remove"
 *   - otherwise omit (no override)
 */
function deriveOverrides(basePerms, effectivePerms) {
  const overrides = {};
  effectivePerms.forEach(p => { if (!basePerms.has(p)) overrides[p] = "add"; });
  basePerms.forEach(p => { if (!effectivePerms.has(p)) overrides[p] = "remove"; });
  return overrides;
}

/**
 * Apply stored permission_overrides to base perms to get effective set.
 */
function applyOverrides(basePerms, overrides) {
  const set = new Set(basePerms);
  Object.entries(overrides || {}).forEach(([p, action]) => {
    if (action === "add") set.add(p);
    else if (action === "remove") set.delete(p);
  });
  return set;
}

export default function UserPermissionManager({ user, allRoles: allRolesProp, onClose }) {
  const [selectedRoleIds, setSelectedRoleIds] = useState(user.assigned_role_ids || []);
  const [effectivePerms, setEffectivePerms] = useState(() => new Set());
  const [loadedRoles, setLoadedRoles] = useState(allRolesProp || []);
  const [initializing, setInitializing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // 禁止背景滚动
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Always fetch fresh user + roles data when the panel opens, to avoid stale allRoles/permission state
  useEffect(() => {
    setInitializing(true);
    Promise.all([
      // base44.functions.invoke('getAdminUsersPageData', {}),
      tenantManage.list('AdminUser'),
    ]).then(([res]) => {
      const freshRoles = res.data?.roles || allRolesProp || [];
      const freshUser = res.data?.users?.find(u => u.id === user.id) || user;
      console.log(freshUser)
      setLoadedRoles(freshRoles);
      setSelectedRoleIds(freshUser.assigned_role_ids || []);
      const base = computeBasePerms(freshUser.assigned_role_ids || [], freshRoles);
      setEffectivePerms(applyOverrides(base, freshUser.permission_overrides || {}));
      setInitializing(false);
    }).catch(() => {
      // Fallback to props if fetch fails
      const base = computeBasePerms(user.assigned_role_ids || [], allRolesProp || []);
      setEffectivePerms(applyOverrides(base, user.permission_overrides || {}));
      setLoadedRoles(allRolesProp || []);
      setInitializing(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // When role selection changes, recompute base perms and RE-APPLY existing effective perms
  // (keep manual toggles, only add new perms from new roles)
  const handleRoleToggle = (roleId) => {
    const newRoleIds = selectedRoleIds.includes(roleId)
      ? selectedRoleIds.filter(id => id !== roleId)
      : [...selectedRoleIds, roleId];
    setSelectedRoleIds(newRoleIds);
    // Don't reset effectivePerms — keep manual choices
  };

  // Toggle one or more permissions (batch); forceOn optional
  const togglePerm = (names, forceOn) => {
    setEffectivePerms(prev => {
      const next = new Set(prev);
      names.forEach(permId => {
        const shouldAdd = forceOn !== undefined ? forceOn : !next.has(permId);
        if (shouldAdd) next.add(permId);
        else next.delete(permId);
      });
      return next;
    });
  };

  const basePerms = useMemo(
    () => computeBasePerms(selectedRoleIds, loadedRoles),
    [selectedRoleIds, loadedRoles]
  );

  const handleApplyRole = (role, adding) => {
    const rolePerms = new Set(role?.direct_permissions || []);
    setEffectivePerms(prev => {
      const next = new Set(prev);
      if (adding) {
        rolePerms.forEach(p => next.add(p));
      } else {
        // Compute perms still covered by remaining roles, then remove anything only this role provided
        const remainingRoleIds = selectedRoleIds.filter(id => id !== role.id);
        const remainingBase = computeBasePerms(remainingRoleIds, loadedRoles);
        rolePerms.forEach(p => {
          if (!remainingBase.has(p)) next.delete(p);
        });
      }
      return next;
    });
  };

  // Which perms are "overridden" vs base role
  const overrides = useMemo(
    () => deriveOverrides(basePerms, effectivePerms),
    [basePerms, effectivePerms]
  );

  const hasAnyOverride = Object.keys(overrides).length > 0;

  const handleSave = async () => {
    if (selectedRoleIds.length === 0) {
      toast.error("请至少选择一个角色");
      return;
    }

    setSaving(true);

    let payload = {
      action: 'update_user_permissions',
      target_user_id: user.id,
      assigned_role_ids: selectedRoleIds,
      permission_overrides: overrides,
    };

    tenantManage.update('AdminUser', user.id, payload)
      .then(res => {
        const savedUser = res?.data;
        setMsg({ type: "success", text: "权限已更新" });
        setTimeout(() => { onClose(savedUser); }, 1200);
      }).catch(e => {
        const message = e.response?.data?.message || e.message || '更新失败';
        toast.error(message);
      })
      .finally(() => {
        setSaving(false);
      });
  };



  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-5"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-gray-900">用户权限管理</h3>
            <p className="text-xs text-gray-500 mt-0.5">{user.full_name || user.user_email}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        {initializing ? (
          <div className="py-10 text-center text-sm text-gray-400">加载中...</div>
        ) : (
        <div className="space-y-5">
          {/* Role selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-gray-500 font-semibold">分配角色（可多选）</Label>
              {selectedRoleIds.length > 0 && (
                <button
                  onClick={() => { setSelectedRoleIds([]); setEffectivePerms(new Set()); }}
                  className="text-xs text-red-500 hover:text-red-700 underline"
                >清空</button>
              )}
            </div>
            {loadedRoles.length === 0 ? (
              <p className="text-xs text-gray-400">暂无可用角色</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {loadedRoles.map(role => {
                  const isOn = selectedRoleIds.includes(role.id);
                  return (
                    <button
                      key={role.id}
                      onClick={() => { const adding = !selectedRoleIds.includes(role.id); handleRoleToggle(role.id); handleApplyRole(role, adding); }}
                      className={`px-3 py-2 rounded-lg border-2 text-left text-sm font-medium transition-colors ${
                        isOn ? 'bg-blue-50 border-blue-400 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {role.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Permission grid */}
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Label className="text-xs text-gray-500 font-semibold shrink-0">权限设置（直接开关，不受角色限制）</Label>
              {effectivePerms.size > 0 && (
                <button
                  onClick={() => setEffectivePerms(new Set())}
                  className="text-xs text-red-500 hover:text-red-700 underline shrink-0"
                >清空</button>
              )}
              {hasAnyOverride && (
                <Badge className="text-xs bg-amber-100 text-amber-700 border border-amber-200 shrink-0">
                  已覆盖 {Object.keys(overrides).length} 项
                </Badge>
              )}
              <span className="text-xs text-gray-400 shrink-0">{effectivePerms.size} 项已开启</span>
            </div>
            <div className="max-h-[50vh] overflow-y-auto rounded-lg">
              <PermissionGrid
                selected={[...effectivePerms]}
                onToggle={togglePerm}
                accentColor="green"
              />
            </div>
            {/* Legend */}
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="text-blue-500 font-bold">＋改</span> 超出角色新增</span>
              <span className="flex items-center gap-1"><span className="text-red-400 font-bold">−改</span> 角色有但已移除</span>
            </div>
          </div>

          {msg && (
            <div className={`text-xs px-3 py-2 rounded ${msg.type === 'success' ? 'text-green-700 bg-green-50 border border-green-200' : 'text-red-700 bg-red-50 border border-red-200'}`}>
              {msg.text}
            </div>
          )}
        </div>
        )}

        {!initializing && (
        <div className="flex gap-2 justify-end mt-5 border-t pt-4">
          <Button size="sm" variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button
            size="sm"
            className="bg-gray-900 hover:bg-gray-800"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>
        )}
      </div>
    </div>
  );
}