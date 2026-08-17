import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Pencil, ChevronDown, ChevronUp, Shield, X, Check, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PERMISSIONS_PRESET } from "@/lib/permissionsPreset";
import { tenantManage } from "@/lib/tenantApi";
import { toast } from "sonner";

// Flatten all permissions for lookup
const ALL_PERMISSIONS = [];
PERMISSIONS_PRESET.forEach(cat => {
  cat.permissions.forEach(p => {
    ALL_PERMISSIONS.push({ ...p, category: cat.category, categoryColor: cat.color });
    if (p.children) p.children.forEach(c => ALL_PERMISSIONS.push({ ...c, category: cat.category, categoryColor: cat.color }));
  });
});

const PERM_MAP = Object.fromEntries(ALL_PERMISSIONS.map(p => [p.name, p]));

function PermissionSelector({ selected = [], onChange }) {
  const toggle = (name) => {
    if (selected.includes(name)) onChange(selected.filter(p => p !== name));
    else onChange([...selected, name]);
  };

  return (
    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
      {PERMISSIONS_PRESET.map(cat => (
        <div key={cat.category}>
          <p className="text-xs font-semibold text-gray-500 mb-1.5 sticky top-0 bg-white">{cat.category}</p>
          <div className="flex flex-wrap gap-1.5">
            {cat.permissions.map(p => (
              <button
                key={p.name}
                type="button"
                onClick={() => toggle(p.name)}
                title={p.description}
                className={`px-2 py-0.5 rounded text-xs border transition-colors ${selected.includes(p.name) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}
              >
                {p.display_name}
              </button>
            ))}
            {cat.permissions.flatMap(p => p.children || []).map(c => (
              <button
                key={c.name}
                type="button"
                onClick={() => toggle(c.name)}
                title={c.description}
                className={`px-2 py-0.5 rounded text-xs border transition-colors ${selected.includes(c.name) ? 'bg-blue-500 text-white border-blue-500' : 'bg-gray-50 text-gray-500 border-gray-100 hover:border-blue-200'}`}
              >
                ↳ {c.display_name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RoleEditForm({ role, tenantId, globalTemplates = [], onDone, onCancel }) {
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [color, setColor] = useState(role?.color || '#9ca3af');
  const [isPredefined, setIsPredefined] = useState(role?.is_predefined || false);
  const [predefinedKey, setPredefinedKey] = useState(role?.predefined_key || '');
  const [permissions, setPermissions] = useState(role?.direct_permissions || []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const isEdit = !!role?.id;

  const applyTemplate = (tpl) => {
    if (!tpl) return;
    setName(tpl.name || '');
    setDescription(tpl.description || '');
    if (tpl.color) setColor(tpl.color);
    setPermissions(tpl.direct_permissions || []);
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setErr('角色名称不能为空'); return; }
    setSaving(true);
    setErr(null);

    try {
      if(isEdit) {
        await tenantManage.update('TenantRole', role.id, { name, description, color, is_predefined: isPredefined, predefined_key: predefinedKey || null, direct_permissions: permissions });
      } else {
        await tenantManage.create('TenantRole', { target_tenant_id: tenantId, name, description, color, is_predefined: isPredefined, 
          predefined_key: predefinedKey || null, direct_permissions: permissions, is_global: false });
      }

      setSaving(false);
      onDone();
    } catch(e) {
      const message = e.response?.data?.message || e.message || '分配失败';
      toast.error(`分配失败：${message}`);
    } finally {
      setSaving(false);
    }

    // if (isEdit) {
    //   const r = await base44.functions.invoke('manageRoles', {
    //     action: 'update',
    //     data: {
    //       role_id: role.id,
    //       updates: { name, description, color, is_predefined: isPredefined, predefined_key: predefinedKey || null, direct_permissions: permissions }
    //     }
    //   });
    //   if (r.data?.error) { setErr(r.data.error); setSaving(false); return; }
    // } else {
    //   const r = await base44.functions.invoke('manageRoles', {
    //     action: 'create',
    //     data: { target_tenant_id: tenantId, name, description, color, is_predefined: isPredefined, predefined_key: predefinedKey || null, direct_permissions: permissions, is_global: false }
    //   });
    //   if (r.data?.error) { setErr(r.data.error); setSaving(false); return; }
    // }
    // setSaving(false);
    // onDone();
  };

  return (
    <div className="space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">{isEdit ? '编辑角色' : '新增角色'}</p>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
      </div>

      {/* Global template selector (only when creating) */}
      {!isEdit && globalTemplates.length > 0 && (
        <div>
          <Label className="text-xs text-gray-500 mb-1 block">套用内置角色模板</Label>
          <div className="flex flex-wrap gap-1.5">
            {globalTemplates.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => applyTemplate(tpl)}
                className="flex items-center gap-1 px-2 py-0.5 rounded border text-xs border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
              >
                <Shield className="w-3 h-3" />
                {tpl.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">点击模板将自动填充权限（名称/描述为空时同步填充）</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-gray-500">角色名称 *</Label>
          <Input className="mt-0.5 h-7 text-xs" value={name} onChange={e => setName(e.target.value)} placeholder="如：客服" />
        </div>
        <div>
          <Label className="text-xs text-gray-500">颜色</Label>
          <div className="flex items-center gap-1.5 mt-0.5">
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-7 w-8 rounded border border-gray-200 cursor-pointer" />
            <Input className="h-7 text-xs font-mono flex-1" value={color} onChange={e => setColor(e.target.value)} />
          </div>
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-gray-500">描述</Label>
          <Input className="mt-0.5 h-7 text-xs" value={description} onChange={e => setDescription(e.target.value)} placeholder="简述此角色的用途" />
        </div>
      </div>

      {/* Predefined toggle */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => setIsPredefined(v => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border transition-colors ${isPredefined ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-white text-gray-500 border-gray-200'}`}
        >
          <Shield className="w-3 h-3" />
          内置预定义角色
          {isPredefined && <Check className="w-3 h-3" />}
        </button>
        {isPredefined && (
          <Input
            className="h-7 text-xs font-mono flex-1"
            placeholder="标识键（如 builtin_user）"
            value={predefinedKey}
            onChange={e => setPredefinedKey(e.target.value)}
          />
        )}
      </div>

      {/* Permissions */}
      <div>
        <Label className="text-xs text-gray-500 mb-1 block">权限（已选 {permissions.length} 项）</Label>
        <PermissionSelector selected={permissions} onChange={setPermissions} />
      </div>

      {err && <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">{err}</p>}

      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 flex-1" onClick={handleSubmit} disabled={saving}>
          {saving ? '保存中...' : (isEdit ? '保存更改' : '创建角色')}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel}>取消</Button>
      </div>
    </div>
  );
}

function RoleCard({ role, tenantId, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState(null);

  const handleDelete = async () => {
    if (!window.confirm(`确定删除角色「${role.name}」？`)) return;
    setDeleting(true);
    setErr(null);
    const r = await base44.functions.invoke('manageRoles', { action: 'delete', data: { role_id: role.id } });
    if (r.data?.error) { setErr(r.data.error); setDeleting(false); return; }
    onRefresh();
  };

  const permCount = (role.direct_permissions || []).length;

  if (editing) {
    return <RoleEditForm role={role} tenantId={tenantId} onDone={() => { setEditing(false); onRefresh(); }} onCancel={() => setEditing(false)} />;
  }

  return (
    <div className="border border-gray-100 rounded-lg bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: role.color || '#9ca3af' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-gray-800">{role.name}</span>
            {role.is_predefined && (
              <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200 gap-0.5">
                <Shield className="w-2.5 h-2.5" />内置
              </Badge>
            )}
            <Badge className="text-xs bg-gray-100 text-gray-500">{permCount} 权限</Badge>
          </div>
          {role.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{role.description}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setExpanded(v => !v)} className="p-1 text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setEditing(true)} className="p-1 text-gray-400 hover:text-blue-600">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleDelete} disabled={deleting} className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-40">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-1">{err}</p>}

      {expanded && permCount > 0 && (
        <div className="border-t border-gray-100 px-3 py-2 bg-gray-50">
          <p className="text-xs text-gray-500 mb-1.5">拥有的权限</p>
          <div className="flex flex-wrap gap-1">
            {(role.direct_permissions || []).map(pId => {
              const p = PERM_MAP[pId];
              return (
                <span key={pId} className={`text-xs px-1.5 py-0.5 rounded border ${p?.categoryColor || 'bg-gray-100 text-gray-600'}`}>
                  {p?.display_name || pId}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TenantRoleManager({ tenants = [], onTenantUpdated }) {
  const [expandedTenant, setExpandedTenant] = useState(null);
  const [roles, setRoles] = useState({});
  const [loading, setLoading] = useState({});
  const [adding, setAdding] = useState({});
  const [globalTemplates, setGlobalTemplates] = useState([]);
  const [savingDefault, setSavingDefault] = useState({});

  useEffect(() => {
    // base44.functions.invoke('manageRoles', { action: 'listGlobalTemplates', data: {} })
    //   .then(r => setGlobalTemplates(r.data?.templates || []))
    //   .catch(() => {});

    tenantManage.list('TenantRole', { is_global: true })
    .then(r => {
      setGlobalTemplates(r?.data || r?.data?.data || [])
    })
    .catch(() => {});
    
    // tenantManage.list('TenantGlobalTemplate')
    //   .then(r => setGlobalTemplates(r?.data || []))
    //   .catch(() => {});
  }, []);

  const loadRoles = async (tenantId) => {
    setLoading(l => ({ ...l, [tenantId]: true }));
    // const r = await base44.functions.invoke('manageRoles', {
    //   action: 'listRoles',
    //   data: { tenant_id_filter: tenantId }
    // });

    const r = await tenantManage.list('TenantRole', { tenant_id: tenantId });
    setRoles(prev => ({
      ...prev,
      [tenantId]: (r?.data || r.data?.roles || []).filter(r => !r.is_global && (r.target_tenant_id || r.tenant_id) === tenantId)
    }));

    setLoading(l => ({ ...l, [tenantId]: false }));
  };

  const toggleExpand = (tenantId) => {
    if (expandedTenant === tenantId) {
      setExpandedTenant(null);
    } else {
      setExpandedTenant(tenantId);
      loadRoles(tenantId);
    }
  };

  const handleSetTenantDefault = async (tenantId, role) => {
    setSavingDefault(s => ({ ...s, [tenantId]: true }));
    const tenant = tenants.find(t => t.id === tenantId);
    // Toggle off if same role
    const newRoleId = tenant?.default_role_id === role?.id ? null : role?.id || null;
    const newRoleName = newRoleId ? role?.name : null;
    await base44.functions.invoke('manageRoles', {
      action: 'setTenantDefaultRole',
      data: { tenant_id: tenantId, role_id: newRoleId, role_name: newRoleName }
    });
    if (onTenantUpdated) onTenantUpdated();
    setSavingDefault(s => ({ ...s, [tenantId]: false }));
  };

  return (
    <div className="space-y-2">
      {tenants.map(tenant => {
        const tenantRoles = roles[tenant.id] || [];
        const isExpanded = expandedTenant === tenant.id;
        const isLoading = loading[tenant.id];
        const isAdding = adding[tenant.id];

        return (
          <div key={tenant.id} className="rounded-lg border border-gray-200 overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => toggleExpand(tenant.id)}
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: tenant.theme_color || '#dc2626' }}>
                  <span className="text-white text-xs font-bold">{(tenant.branding_name || tenant.name || '?').slice(0, 1)}</span>
                </div>
                <span>{tenant.branding_name || tenant.name}</span>
                <Badge className="text-xs bg-gray-100 text-gray-500">{tenant.code}</Badge>
                {isExpanded && !isLoading && (
                  <Badge className="text-xs bg-indigo-100 text-indigo-600">{tenantRoles.length} 个角色</Badge>
                )}
              </div>
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100 p-3 space-y-2 bg-white">
                {isLoading ? (
                  <p className="text-xs text-gray-400 py-2">加载中...</p>
                ) : (
                  <>
                    {/* Default role selector */}
                    {tenantRoles.length > 0 && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 mb-1">
                        <p className="text-xs font-semibold text-yellow-800 mb-1.5 flex items-center gap-1">
                          <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                          新用户默认角色
                          {tenant.default_role_name && (
                            <Badge className="ml-1 text-xs bg-yellow-100 text-yellow-700 border-yellow-300">{tenant.default_role_name}</Badge>
                          )}
                          {!tenant.default_role_id && (
                            <span className="text-xs text-yellow-600 font-normal ml-1">（未设置，将使用全局默认）</span>
                          )}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {tenantRoles.map(role => (
                            <button
                              key={role.id}
                              type="button"
                              disabled={savingDefault[tenant.id]}
                              onClick={() => handleSetTenantDefault(tenant.id, role)}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-colors ${tenant.default_role_id === role.id ? 'bg-yellow-200 text-yellow-800 border-yellow-400' : 'bg-white text-gray-500 border-gray-200 hover:border-yellow-300 hover:text-yellow-700'}`}
                            >
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: role.color || '#9ca3af' }} />
                              {role.name}
                              {tenant.default_role_id === role.id && <Check className="w-3 h-3" />}
                            </button>
                          ))}
                          {tenant.default_role_id && (
                            <button
                              type="button"
                              onClick={() => handleSetTenantDefault(tenant.id, null)}
                              disabled={savingDefault[tenant.id]}
                              className="px-2 py-0.5 rounded text-xs border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 bg-white"
                            >
                              清除
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {tenantRoles.length === 0 && !isAdding && (
                      <p className="text-xs text-gray-400 py-1">暂无自定义角色</p>
                    )}
                    {tenantRoles.map(role => (
                      <RoleCard key={role.id} role={role} tenantId={tenant.id} onRefresh={() => loadRoles(tenant.id)} />
                    ))}

                    {isAdding ? (
                      <RoleEditForm
                        tenantId={tenant.id}
                        globalTemplates={globalTemplates}
                        onDone={() => { setAdding(a => ({ ...a, [tenant.id]: false })); loadRoles(tenant.id); }}
                        onCancel={() => setAdding(a => ({ ...a, [tenant.id]: false }))}
                      />
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs w-full border-dashed"
                        onClick={() => setAdding(a => ({ ...a, [tenant.id]: true }))}
                      >
                        <Plus className="w-3 h-3 mr-1" />新增角色
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}