import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, ChevronDown, ChevronUp, Shield, Lock, Pencil, Star } from "lucide-react";
import { PERMISSIONS_PRESET } from "@/lib/permissionsPreset";
import PermissionGrid from "@/components/admin/PermissionGrid.jsx";
import { tenantManage } from "@/lib/tenantApi";

// Flat map of all permission names -> display_name for lookup
const PERM_LABEL_MAP = {};
PERMISSIONS_PRESET.forEach(cat => {
  cat.permissions.forEach(p => {
    PERM_LABEL_MAP[p.name] = { label: p.display_name, category: cat.category, color: cat.color };
    (p.children || []).forEach(child => {
      PERM_LABEL_MAP[child.name] = { label: child.display_name, category: cat.category, color: cat.color };
    });
  });
});

// Default permissions for seeding built-in roles into the DB
const BUILTIN_ROLE_DEFAULTS = [
  {
    predefined_key: 'builtin_user',
    name: '普通用户',
    description: '基础用户角色，默认所有注册用户',
    color: '#6b7280',
    permissions: [
      "order:submit_purchase_request",
      "shipping:notify_shipment",
      "shipping:direct_shipment",
      "message:send_message",
      "message:send_order_message",
      "message:send_shipping_message",
      "message:send_image",
      "payment:self_pay",
      "payment:manual_pay",
      "payment:pre_pay",
      "payment:pay_full_amount",
      "order:archive_order",
      "profile:change_display_name",
      "profile:change_avatar",
      "profile:change_auto_archive_settings",
      "view:my_orders_module",
      "addon:select_value_added_services",
      "addon:select_order_value_added_services",
      "addon:select_shipping_value_added_services",
    ]
  },
  {
    predefined_key: 'builtin_admin',
    name: '租户管理员',
    description: '租户级管理员，拥有完整租户管理权限，所有权限均开放',
    color: '#dc2626',
    permissions: Object.keys(PERM_LABEL_MAP),
  },
];

function groupByResource(permissions) {
  return permissions.reduce((acc, p) => {
    const cat = p.resource_type || '其他';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});
}


export default function GlobalRoleManager() {
  const [predefinedRoles, setPredefinedRoles] = useState([]);
  const [customRoles, setCustomRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedRole, setExpandedRole] = useState(null);
  const [localPermOverrides, setLocalPermOverrides] = useState({});
  const [globalDefaultRoleId, setGlobalDefaultRoleId] = useState(null);

  const [newRole, setNewRole] = useState({ name: "", description: "", permissions: [], is_predefined: false });
  const [newPerm, setNewPerm] = useState({ name: "", description: "", resource_type: "", action: "" });
  const [saving, setSaving] = useState(false);
  const [permMsg, setPermMsg] = useState("");
  const [roleMsg, setRoleMsg] = useState("");
  const [expandedSections, setExpandedSections] = useState({
    createPermission: false,
    systemRoles: false,
    createGlobalRole: false,
    roleTemplates: false
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {

      await tenantManage.global('TenantsManage').then(res => {
        
        const allRoles = res.data?.roles || [];
        const dbPredefined = allRoles.filter(r => !!r.is_global && !!r.is_predefined);
        setGlobalDefaultRoleId(res?.data?.role_id || null);

        // Merge: for each default builtin, use DB version if exists (matched by predefined_key), else show the static default
        const merged = BUILTIN_ROLE_DEFAULTS.map(def => {
          const dbRole = dbPredefined.find(ro => ro.predefined_key === def.predefined_key);
          if (dbRole) return { ...dbRole, _isInDB: true };
          return { ...def, id: null, _isInDB: false, direct_permissions: def.permissions };
        });

        // Also include any DB predefined roles not in BUILTIN_ROLE_DEFAULTS
        const extraDB = dbPredefined.filter(r => !BUILTIN_ROLE_DEFAULTS.find(d => d.predefined_key === r.predefined_key));
        
        setPredefinedRoles([...merged, ...extraDB.map(r => ({ ...r, _isInDB: true }))]);
        setCustomRoles(allRoles.filter(r => !!r.is_global && !r.is_predefined));
        setPermissions(res.data?.permissions || []);
      }).catch(() => {});

      // const [rolesRes, permsRes, defaultRes] = await Promise.all([
      //   base44.functions.invoke('manageRoles', { action: 'listRoles', data: { tenant_id_filter: null } }),
      //   base44.functions.invoke('managePermissions', { action: 'listPermissions', data: { tenant_id_filter: null } }),
      //   base44.functions.invoke('manageRoles', { action: 'getGlobalDefaultRole', data: {} }),
      // ]);
      
      // setGlobalDefaultRoleId(defaultRes.data?.role_id || null);
      // const allRoles = rolesRes.data?.roles || [];
      // const dbPredefined = allRoles.filter(r => !!r.is_global && !!r.is_predefined);
      
      // // Merge: for each default builtin, use DB version if exists (matched by predefined_key), else show the static default
      // const merged = BUILTIN_ROLE_DEFAULTS.map(def => {
      //   const dbRole = dbPredefined.find(r => r.predefined_key === def.predefined_key);
      //   if (dbRole) return { ...dbRole, _isInDB: true };
      //   return { ...def, id: null, _isInDB: false, direct_permissions: def.permissions };
      // });
      // // Also include any DB predefined roles not in BUILTIN_ROLE_DEFAULTS
      // const extraDB = dbPredefined.filter(r => !BUILTIN_ROLE_DEFAULTS.find(d => d.predefined_key === r.predefined_key));
      // setPredefinedRoles([...merged, ...extraDB.map(r => ({ ...r, _isInDB: true }))]);
      // setCustomRoles(allRoles.filter(r => !!r.is_global && !r.is_predefined));
      // setPermissions(permsRes.data?.permissions || []);
    } catch (e) {
      setPermMsg({ type: 'error', text: e.message });
    }
    setLoading(false);
  };

  const handleSeedRole = async (role) => {
    setSaving(true);
    // Use local edited permissions if available, otherwise fall back to defaults
    const permsToSave = localPermOverrides[role.predefined_key] ?? role.direct_permissions ?? role.permissions ?? [];
    try {
      await tenantManage.create('TenantRole', { name: role.name, description: role.description, 
        color: role.color, is_global: true, is_predefined: true, predefined_key: role.predefined_key, direct_permissions: permsToSave })
        .then(res => {
           // Clear local overrides for this role after seeding
          setLocalPermOverrides(prev => { const n = { ...prev }; delete n[role.predefined_key]; return n; });
          loadData();
          setRoleMsg({ type: 'success', text: `"${role.name}"已初始化到数据库` });
          setTimeout(() => setRoleMsg(""), 2000);
        }).catch(e => {
          const message = e.response?.data?.message || e.message || '初始化失败';
          setRoleMsg({ type: 'error', text: message });
        });

      // const res = await base44.functions.invoke('manageRoles', {
      //   action: 'create',
      //   data: { name: role.name, description: role.description, color: role.color, is_global: true, is_predefined: true, predefined_key: role.predefined_key, direct_permissions: permsToSave },
      // });
      // if (res.data?.error) { setRoleMsg({ type: 'error', text: res.data.error }); }
      // else {
      //   // Clear local overrides for this role after seeding
      //   setLocalPermOverrides(prev => { const n = { ...prev }; delete n[role.predefined_key]; return n; });
      //   await loadData();
      //   setRoleMsg({ type: 'success', text: `"${role.name}"已初始化到数据库` });
      //   setTimeout(() => setRoleMsg(""), 2000);
      // }
    } catch (e) { setRoleMsg({ type: 'error', text: e.message }); }
    setSaving(false);
  };

  const handleCreatePermission = async () => {
    if (!newPerm.name || !newPerm.resource_type || !newPerm.action) {
      setPermMsg({ type: 'error', text: '请填写所有必填字段' });
      return;
    }
    setSaving(true);
    try {
      // await base44.functions.invoke('managePermissions', {
      //   action: 'create',
      //   data: { name: newPerm.name, description: newPerm.description, resource_type: newPerm.resource_type, action: newPerm.action, is_global: true },
      // });

      await tenantManage.create('TenantPermission', { name: newPerm.name, description: newPerm.description, resource_type: newPerm.resource_type, action: newPerm.action, is_global: true });

      setPermMsg({ type: 'success', text: '权限创建成功' });
      setNewPerm({ name: "", description: "", resource_type: "", action: "" });
      await loadData();
      setTimeout(() => setPermMsg(""), 2000);
    } catch (e) {
      setPermMsg({ type: 'error', text: e.message });
    }
    setSaving(false);
  };

  const handleCreateRole = async () => {
    if (!newRole.name) return;
    setSaving(true);

     await tenantManage.create('TenantRole', { name: newRole.name, description: newRole.description, is_global: true, is_predefined: newRole.is_predefined, direct_permissions: newRole.permissions })
        .then(res => {
          setRoleMsg({ type: 'success', text: `全局角色"${newRole.name}"创建成功` });
          setNewRole({ name: "", description: "", permissions: [], is_predefined: false });
          loadData();
          setTimeout(() => setRoleMsg(""), 2000);
        }).catch(e => {
          const message = e.response?.data?.message || e.message || '初始化失败';
          setRoleMsg({ type: 'error', text: message });
        });

    try {
      // await tenantManage.create('TenantRole', { name: newRole.name, description: newRole.description, is_global: true, is_predefined: newRole.is_predefined, direct_permissions: newRole.permissions })
      //   .then(res => {
      //     setRoleMsg({ type: 'success', text: `全局角色"${newRole.name}"创建成功` });
      //     setNewRole({ name: "", description: "", permissions: [], is_predefined: false });
      //     loadData();
      //     setTimeout(() => setRoleMsg(""), 2000);
      //   }).catch(e => {
      //     const message = e.response?.data?.message || e.message || '初始化失败';
      //     setRoleMsg({ type: 'error', text: message });
      //   });

      // const res = await base44.functions.invoke('manageRoles', {
      //   action: 'create',
      //   data: { name: newRole.name, description: newRole.description, is_global: true, is_predefined: newRole.is_predefined, direct_permissions: newRole.permissions },
      // });
      // if (res.data?.error) {
      //   setRoleMsg({ type: 'error', text: res.data.error });
      // } else {
      //   setRoleMsg({ type: 'success', text: `全局角色"${newRole.name}"创建成功` });
      //   setNewRole({ name: "", description: "", permissions: [], is_predefined: false });
      //   await loadData();
      //   setTimeout(() => setRoleMsg(""), 2000);
      // }
    } catch (e) {
      setRoleMsg({ type: 'error', text: e.message });
    }
    setSaving(false);
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm("确定删除此全局角色吗？")) return;
    setSaving(true);

    await tenantManage.delete('TenantRole', roleId)
        .then(res => {
          setRoleMsg({ type: 'success', text: "全局角色删除成功" });
          loadData();
          setTimeout(() => setRoleMsg(""), 2000);
        }).catch(e => {
          const message = e.response?.data?.message || e.message || '初始化失败';
          setRoleMsg({ type: 'error', text: message });
        });

    // try {
    //   const res = await base44.functions.invoke('manageRoles', { action: 'delete', data: { role_id: roleId } });
    //   if (res.data?.error) {
    //     setRoleMsg({ type: 'error', text: res.data.error });
    //   } else {
    //     await loadData();
    //     setRoleMsg({ type: 'success', text: "全局角色删除成功" });
    //     setTimeout(() => setRoleMsg(""), 2000);
    //   }
    // } catch (e) {
    //   setRoleMsg({ type: 'error', text: e.message });
    // }
    setSaving(false);
  };

  const handleSetGlobalDefault = async (roleId) => {
    setSaving(true);
    try {
      const newId = globalDefaultRoleId === roleId ? null : roleId; // toggle off if same
      // await base44.functions.invoke('manageRoles', { action: 'setGlobalDefaultRole', data: { role_id: newId } });
      await tenantManage.setDef('TenantRole', newId);
      await loadData();

      setGlobalDefaultRoleId(newId);
      setRoleMsg({ type: 'success', text: newId ? '已设为系统默认角色' : '已取消系统默认角色' });
      setTimeout(() => setRoleMsg(""), 2000);
    } catch (e) { 
      const message = e.response?.data?.message || e.message || '操作失败';
      setRoleMsg({ type: 'error', text: message });
    }
    setSaving(false);
  };

  const handleAssignPermission = async (role, permissionId, assign) => {
    setSaving(true);
    const updatedPerms = assign
      ? [...(role.direct_permissions || []), permissionId]
      : (role.direct_permissions || []).filter(id => id !== permissionId);
    try {
      await base44.functions.invoke('manageRoles', {
        action: 'update',
        data: { role_id: role.id, updates: { direct_permissions: updatedPerms } },
      });
      await loadData();
    } catch (e) {
      setRoleMsg({ type: 'error', text: e.message });
    }
    setSaving(false);
  };

  if (loading) return <div className="text-xs text-gray-400 py-4">加载中...</div>;

  return (
    <div className="space-y-5">
      {/* Create Permission */}
      <Card className="border-blue-200">
        <button
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-blue-50 transition-colors"
          onClick={() => toggleSection('createPermission')}
        >
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-500" />
            <CardTitle className="text-sm font-semibold text-gray-700">创建权限属性</CardTitle>
          </div>
          {expandedSections.createPermission ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </button>
        {expandedSections.createPermission && (
          <CardContent className="space-y-3 pt-0">
            <p className="text-xs text-gray-400 mt-1">定义全局权限属性，供角色分配使用</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500">权限名称 *</Label>
                <Input className="mt-0.5 h-8 text-sm" placeholder="如：订单查看" value={newPerm.name}
                  onChange={e => setNewPerm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-500">资源类型 *</Label>
                <Input className="mt-0.5 h-8 text-sm" placeholder="如：Order、ShippingPool" value={newPerm.resource_type}
                  onChange={e => setNewPerm(p => ({ ...p, resource_type: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-500">操作 *</Label>
                <Input className="mt-0.5 h-8 text-sm" placeholder="如：read、create、update" value={newPerm.action}
                  onChange={e => setNewPerm(p => ({ ...p, action: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-500">说明</Label>
                <Input className="mt-0.5 h-8 text-sm" placeholder="权限说明" value={newPerm.description}
                  onChange={e => setNewPerm(p => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
            {permMsg && (
              <p className={`text-xs px-2 py-1 rounded ${permMsg.type === 'success' ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>{permMsg.text}</p>
            )}
            <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
              onClick={handleCreatePermission}
              disabled={saving || !newPerm.name || !newPerm.resource_type || !newPerm.action}>
              <Plus className="w-3 h-3 mr-1" />{saving ? '创建中...' : '创建权限'}
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Built-in Global Roles (from DB, is_predefined=true) */}
      <Card className="border-amber-200">
        <button
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-amber-50 transition-colors"
          onClick={() => toggleSection('systemRoles')}
        >
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-100 text-amber-700 text-xs">内置</Badge>
            <CardTitle className="text-sm font-semibold text-gray-700">系统角色 ({predefinedRoles.length})</CardTitle>
          </div>
          {expandedSections.systemRoles ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </button>
        {expandedSections.systemRoles && (
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-400 mt-1">平台管理员可编辑内置角色的权限策略，未初始化的角色仅供预览</p>
          {roleMsg && (
            <p className={`text-xs px-2 py-1 rounded ${roleMsg.type === 'success' ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>{roleMsg.text}</p>
          )}
          {predefinedRoles.map(role => {
            const roleKey = role.id || role.predefined_key;
            const isExpanded = expandedRole === roleKey;
            // For not-in-DB roles, use local overrides if edited, else default permissions
            const effectivePerms = role._isInDB
              ? (role.direct_permissions || [])
              : (localPermOverrides[role.predefined_key] ?? role.direct_permissions ?? []);
            const permCount = effectivePerms.length;
            const hasLocalEdits = !role._isInDB && localPermOverrides[role.predefined_key] !== undefined;
            return (
              <div key={roleKey} className="border border-amber-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-amber-50">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Shield className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-800">{role.name}</p>
                        {!role._isInDB && !hasLocalEdits && (
                          <Badge className="text-xs bg-gray-100 text-gray-500 border border-gray-200">未初始化</Badge>
                        )}
                        {hasLocalEdits && (
                          <Badge className="text-xs bg-blue-100 text-blue-700 border border-blue-200">已编辑</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{role.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <span className="text-xs text-amber-600 bg-white border border-amber-200 px-2 py-0.5 rounded-full">
                      {permCount} 项权限
                    </span>
                    {role._isInDB && (
                      <button
                        title={globalDefaultRoleId === role.id ? "取消系统默认角色" : "设为系统默认角色（新用户自动分配）"}
                        onClick={() => handleSetGlobalDefault(role.id)}
                        disabled={saving}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-colors ${globalDefaultRoleId === role.id ? 'bg-yellow-100 text-yellow-700 border-yellow-300' : 'bg-white text-gray-400 border-gray-200 hover:text-yellow-600 hover:border-yellow-300'}`}
                      >
                        <Star className={`w-3 h-3 ${globalDefaultRoleId === role.id ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                        {globalDefaultRoleId === role.id ? '默认角色' : '设为默认'}
                      </button>
                    )}
                    {!role._isInDB ? (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-500 hover:text-blue-600"
                          onClick={() => setExpandedRole(isExpanded ? null : roleKey)}>
                          <Pencil className="w-3.5 h-3.5" />
                          <span className="text-xs ml-1">{isExpanded ? "收起" : "编辑权限"}</span>
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                          onClick={() => handleSeedRole(role)} disabled={saving}>
                          初始化到数据库
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-500 hover:text-blue-600"
                          onClick={() => setExpandedRole(isExpanded ? null : roleKey)}>
                          <Pencil className="w-3.5 h-3.5" />
                          <span className="text-xs ml-1">{isExpanded ? "收起" : "编辑权限"}</span>
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteRole(role.id)} disabled={saving}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-amber-200 px-4 py-4 bg-white">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-700">权限分配</span>
                      <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        已开启 {permCount} 项
                      </span>
                    </div>
                    <PermissionGrid
                      selected={effectivePerms}
                      onToggle={role._isInDB
                        ? async (names, forceOn) => {
                            setSaving(true);
                            let perms = [...(role.direct_permissions || [])];
                            names.forEach(name => {
                              const shouldAdd = forceOn !== undefined ? forceOn : !perms.includes(name);
                              if (shouldAdd) { if (!perms.includes(name)) perms.push(name); }
                              else { perms = perms.filter(x => x !== name); }
                            });
                            try {
                              // await base44.functions.invoke('manageRoles', {
                              //   action: 'update',
                              //   data: { role_id: role.id, updates: { direct_permissions: perms } },
                              // });
                              await tenantManage.update('TenantRole',  role.id, { direct_permissions: perms });
                              await loadData();
                              setRoleMsg({ type: 'success', text: '内置角色权限已更新' });
                              setTimeout(() => setRoleMsg(""), 2000);
                            } catch (e) { setRoleMsg({ type: 'error', text: e.message }); }
                            setSaving(false);
                          }
                        : (names, forceOn) => {
                            // Edit locally for not-yet-seeded roles
                            setLocalPermOverrides(prev => {
                              let perms = [...(prev[role.predefined_key] ?? role.direct_permissions ?? [])];
                              names.forEach(name => {
                                const shouldAdd = forceOn !== undefined ? forceOn : !perms.includes(name);
                                if (shouldAdd) { if (!perms.includes(name)) perms.push(name); }
                                else { perms = perms.filter(x => x !== name); }
                              });
                              return { ...prev, [role.predefined_key]: perms };
                            });
                          }
                      }
                      accentColor="green"
                      disabled={saving}
                    />
                    {!role._isInDB && (
                      <p className="text-xs text-gray-400 mt-3">权限编辑仅保存在本地，点击「初始化到数据库」提交</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
        )}
      </Card>

      {/* Create New Custom Global Role */}
      <Card className="border-purple-200">
        <button
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-purple-50 transition-colors"
          onClick={() => toggleSection('createGlobalRole')}
        >
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-purple-500" />
            <CardTitle className="text-sm font-semibold text-gray-700">创建全局角色</CardTitle>
          </div>
          {expandedSections.createGlobalRole ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </button>
        {expandedSections.createGlobalRole && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500">角色名称 *</Label>
              <Input className="mt-0.5 h-8 text-sm" placeholder="如：审计员、财务管理"
                value={newRole.name} onChange={e => setNewRole(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">描述</Label>
              <Input className="mt-0.5 h-8 text-sm" placeholder="此角色的权限描述"
                value={newRole.description} onChange={e => setNewRole(p => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <div>
            <button
              type="button"
              onClick={() => setNewRole(p => ({ ...p, is_predefined: !p.is_predefined }))}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border transition-colors ${newRole.is_predefined ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-white text-gray-500 border-gray-200 hover:border-amber-300'}`}
            >
              <Shield className="w-3 h-3" />
              标记为内置预定义角色
              {newRole.is_predefined && <Badge className="ml-1 text-xs bg-amber-200 text-amber-800">✓</Badge>}
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-gray-600 font-semibold">分配权限</Label>
              <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                已选 {newRole.permissions.length} 项
              </span>
            </div>
            <PermissionGrid
              selected={newRole.permissions}
              onToggle={(names, forceOn) => setNewRole(p => {
                let perms = [...p.permissions];
                names.forEach(name => {
                  const shouldAdd = forceOn !== undefined ? forceOn : !perms.includes(name);
                  if (shouldAdd) { if (!perms.includes(name)) perms.push(name); }
                  else { perms = perms.filter(x => x !== name); }
                });
                return { ...p, permissions: perms };
              })}
              accentColor="purple"
            />
          </div>

          {roleMsg && (
            <p className={`text-xs px-2 py-1 rounded ${roleMsg.type === 'success' ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>{roleMsg.text}</p>
          )}
          <Button size="sm" className="h-8 text-xs bg-purple-600 hover:bg-purple-700 w-full"
            onClick={handleCreateRole} disabled={saving || !newRole.name}>
            <Plus className="w-3 h-3 mr-1" />{saving ? '创建中...' : '创建全局角色'}
          </Button>
        </CardContent>
        )}
      </Card>

      {/* Custom Global Roles List */}
      <Card className="border-gray-200">
        <button
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
          onClick={() => toggleSection('roleTemplates')}
        >
          <div className="flex items-center gap-2">
            <Badge className="bg-purple-100 text-purple-700 text-xs">自定义</Badge>
            <CardTitle className="text-sm font-semibold text-gray-700">角色模板 ({customRoles.length})</CardTitle>
          </div>
          {expandedSections.roleTemplates ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </button>
        {expandedSections.roleTemplates && (
        <CardContent className="space-y-3">
          {customRoles.length === 0 ? (
            <p className="text-xs text-gray-400">暂无自定义角色模板</p>
          ) : (
            customRoles.map(role => (
              <div key={role.id} className="border border-purple-200 rounded-lg overflow-hidden">
                {/* Role header row */}
                <div className="flex items-center justify-between px-4 py-3 bg-purple-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{role.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{role.description}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <span className="text-xs text-purple-600 bg-white border border-purple-200 px-2 py-0.5 rounded-full">
                      {(role.direct_permissions || []).length} 权限
                    </span>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-500 hover:text-gray-700"
                      onClick={() => setExpandedRole(expandedRole === role.id ? null : role.id)}>
                      {expandedRole === role.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      <span className="text-xs ml-1">{expandedRole === role.id ? "收起" : "编辑权限"}</span>
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleDeleteRole(role.id)} disabled={saving}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Expanded permission grid */}
                {expandedRole === role.id && (
                  <div className="border-t border-purple-200 px-4 py-4 bg-white">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-700">权限分配</span>
                      <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                        已开启 {(role.direct_permissions || []).length} 项
                      </span>
                    </div>
                    <PermissionGrid
                      selected={role.direct_permissions || []}
                      onToggle={async (names, forceOn) => {
                        setSaving(true);
                        let perms = [...(role.direct_permissions || [])];
                        names.forEach(name => {
                          const shouldAdd = forceOn !== undefined ? forceOn : !perms.includes(name);
                          if (shouldAdd) { if (!perms.includes(name)) perms.push(name); }
                          else { perms = perms.filter(x => x !== name); }
                        });
                        try {
                          // await base44.functions.invoke('manageRoles', {
                          //   action: 'update',
                          //   data: { role_id: role.id, updates: { direct_permissions: perms } },
                          // });
                          await tenantManage.update('TenantRole',  role.id, { direct_permissions: perms });
                          await loadData();
                        } catch (e) {
                          const message = e.response?.data?.message || e.message || '分配失败';
                          setRoleMsg({ type: 'error', text: message });
                        }
                        setSaving(false);
                      }}
                      accentColor="green"
                      disabled={saving}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
        )}
      </Card>
    </div>
  );
}