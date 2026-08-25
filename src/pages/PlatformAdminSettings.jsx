import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { AlertTriangle, ChevronDown, ChevronUp, Plus, Save, Building2, Users, Zap, X, TrendingUp, Bell, FileText, Settings, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import TenantRoleManager from "@/components/admin/TenantRoleManager";
import GlobalRoleManager from "@/components/admin/GlobalRoleManager";
import PermissionViewer from "@/components/admin/PermissionViewer";
import ExchangeRateApiSettings from "@/components/platform/ExchangeRateApiSettings";
import GlobalFeeRuleTemplates from "@/components/platform/GlobalFeeRuleTemplates";
import TenantTemplateManager from "@/components/platform/TenantTemplateManager";
import { tenantManage } from "@/lib/tenantApi";
import { toast } from "sonner";

export default function PlatformAdminSettings() {
  const { user } = useCurrentUser();
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagData, setDiagData] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState(null);
  const [assigning, setAssigning] = useState({});
  const [assignTarget, setAssignTarget] = useState({});
  
  // 已分配用户管理状态
  const [filterTenant, setFilterTenant] = useState(null);
  const [searchUser, setSearchUser] = useState("");
  const [reassignTarget, setReassignTarget] = useState({});
  const [reassigning, setReassigning] = useState({});
  const [removing, setRemoving] = useState({});
  const [assignedExpanded, setAssignedExpanded] = useState(true);

  const [tenants, setTenants] = useState([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [newTenant, setNewTenant] = useState({ name: "", code: "", branding_name: "", timezone: "Asia/Tokyo", login_title: "", login_subtitle: "", logo_url: "", favicon_url: "", theme_color: "#dc2626", contact_info: "", initial_fee_rule_template_id: "none", tenant_template_id: "none" });
  const [feeTemplates, setFeeTemplates] = useState([]);
  const [tenantTemplates, setTenantTemplates] = useState([]);
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [tenantMsg, setTenantMsg] = useState(null);
  const [assigningAll, setAssigningAll] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [editTenantFields, setEditTenantFields] = useState({});
  const [savingTenant, setSavingTenant] = useState(false);

  const [platformBaseDomain, setPlatformBaseDomain] = useState("");
  const [editingDomain, setEditingDomain] = useState("");
  const [savingDomain, setSavingDomain] = useState(false);
  const [domainMsg, setDomainMsg] = useState(null);

  const [liveRates, setLiveRates] = useState(null);
  const [platformSettings, setPlatformSettings] = useState([]);
  const [savingRates, setSavingRates] = useState(false);
  const [platformIncrements, setPlatformIncrements] = useState({
    jpy_usd_increment: 0, jpy_cny_increment: 0,
  });
  const [activeTab, setActiveTab] = useState("create_tenant");

  const PLATFORM_NAV = [
    { key: "create_tenant", label: "新建租户" },
    { key: "tenants", label: "租户管理" },
    { key: "tenant_roles", label: "租户角色" },
    { group: "全局设定", children: [
      { key: "roles", label: "全局角色" },
      { key: "exchange_rates", label: "汇率设置" },
      { key: "fee_templates", label: "服务费规则模板" },
      { key: "tenant_templates", label: "租户模板" },
      { key: "reports", label: "数据报表" },
      { key: "notification_templates", label: "通知模板" },
    ]},
    { key: "notifications", label: "通知管理" },
    { key: "permissions", label: "权限一览" },
  ];

  // const isPlatformAdmin = user?.role?.includes('platform_admin', 'ROLE_ADMIN', 'TENANT_ADMIN');
  const isPlatformAdmin = ['ROLE_ADMIN', 'TENANT_ADMIN', 'platform_admin'].includes(user?.role);

  const loadInitData = async () => {
    const res = await tenantManage.init('TenantsManage');
    const data = res?.data?.data || res?.data || {};
    const domain = data.platform_base_domain || "";
    setPlatformBaseDomain(domain);
    setEditingDomain(domain);
    if (data.exchange_rates) setLiveRates(data.exchange_rates);
    setFeeTemplates(data.fee_rule_templates || []);
    setTenantTemplates(data.tenant_templates || []);
    if (data.platform_increments) setPlatformIncrements(data.platform_increments);
  };

  const loadTenants = async () => {
    setTenantsLoading(true);
    // TODO: 替换为实际的租户列表 API
    // const res = await base44.functions.invoke('manageTenants/list', {});
    const res = await tenantManage.list('TenantsManage');
    setTenants(res?.data || res?.data?.tenants || []);
    setTenantsLoading(false);
  };

  useEffect(() => {
    if (!isPlatformAdmin) return;
    loadInitData();
  }, [isPlatformAdmin]);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    if ((activeTab === "tenants" || activeTab === "tenant_roles") && tenants.length === 0 && !tenantsLoading) {
      loadTenants();
    }
  }, [activeTab, isPlatformAdmin]);

  // Redirect non-platform admins
  if (user && !isPlatformAdmin) {
    return <div className="text-center py-8 text-red-600">仅平台管理员可访问此页面</div>;
  }

  const runDiagnose = async () => {
    setDiagLoading(true);
    setDiagError(null);
    // const r = await base44.functions.invoke('adminAssignTenant', { action: 'diagnose' });
    const r = await tenantManage.diagnose('TenantsManage');
    
    if (r.data?.error) setDiagError(r.data.error);
    else setDiagData(r.data);
    setDiagLoading(false);
  };

  const handleAssign = async (email, id) => {
    const tid = assignTarget[email];
    if (!tid) return;
    setAssigning(a => ({ ...a, [email]: true }));
    const payload = {
      user_id: id,
      tenant_id: tid
    };

    // await base44.functions.invoke('adminAssignTenant', { action: 'assign', target_email: email, tenant_id: tid });

    try {
      const r = await tenantManage.assign('TenantsManage', payload);

      toast.success('分配成功.');

    } catch(e) {
      const message = e.response?.data?.message || e.message || '分配失败';
      toast.error(`分配失败：${message}`);
    } finally {
      setAssigning(a => ({ ...a, [email]: false }));
    }

    setAssigning(a => ({ ...a, [email]: false }));
    await runDiagnose();
  };

  // 重新分配用户到新租户（通过 relation_id 更新 tenant_id）
  const handleReassign = async (relationId, newTenantId, userId) => {
    setReassigning(prev => ({ ...prev, [relationId]: true }));

    try {
      await tenantManage.assign('TenantsManage', {
        id: relationId,
        tenant_id: Number(newTenantId),
        user_id: userId
      });
      toast.success('重新分配成功');
      await runDiagnose();
    } catch (e) {
      const message = e.response?.data?.message || e.message || '分配失败';
      toast.error(`重新分配失败：${message}`);
    } finally {
      setReassigning(prev => ({ ...prev, [relationId]: false }));
    }
  };

  // 添加用户至新租户（新增一条关联记录）
  const handleAddToTenant = async (userId, tenantId) => {
    setReassigning(prev => ({ ...prev, [`add_${userId}`]: true }));

    try {
      await tenantManage.assign('TenantsManage', {
        user_id: userId,
        tenant_id: Number(tenantId)
      });
      toast.success('已添加至新租户');
      await runDiagnose();
    } catch (e) {
      const message = e.response?.data?.message || e.message || '添加失败';
      toast.error(`添加失败：${message}`);
    } finally {
      setReassigning(prev => ({ ...prev, [`add_${userId}`]: false }));
    }
  };

  // 移除用户-租户关系（通过 relation_id 删除）
  const handleRemove = async (relationId) => {
    setRemoving(prev => ({ ...prev, [relationId]: true }));

    try {
      await tenantManage.delete('TenantsManage', relationId);
      toast.success('已移除该用户-租户关系');
      await runDiagnose();
    } catch (e) {
      const message = e.response?.data?.message || e.message || '移除失败';
      toast.error(`移除失败：${message}`);
    } finally {
      setRemoving(prev => ({ ...prev, [relationId]: false }));
    }
  };

  // 过滤已分配用户
  const filteredAssignedUsers = (diagData?.assigned_users || []).filter(u => {
    if (searchUser && !u.user_email.toLowerCase().includes(searchUser.toLowerCase())) {
      return false;
    }
    if (filterTenant && !u.tenant_relations?.some(r => r.tenant_id === filterTenant)) {
      return false;
    }
    return true;
  });

  const handleSaveDomain = async () => {
    setSavingDomain(true);
    setDomainMsg(null);
    // const r = await base44.functions.invoke('manageTenants', { action: 'set_platform_domain', platform_base_domain: editingDomain });
    const r = {};
    if (r.data?.error) {
      setDomainMsg({ type: 'error', text: r.data.error });
    } else {
      setPlatformBaseDomain(r.data.platform_base_domain);
      setDomainMsg({ type: 'success', text: '平台域名已保存' });
      setTimeout(() => setDomainMsg(null), 3000);
    }
    setSavingDomain(false);
  };

  const handleCreateTenant = async () => {
    if (!newTenant.name || !newTenant.code) return;
    setCreatingTenant(true);
    setTenantMsg(null);
    const { initial_fee_rule_template_id, tenant_template_id, ...rest } = newTenant;
    const payload = { action: 'create', ...rest };
    if (initial_fee_rule_template_id && initial_fee_rule_template_id !== "none") {
      payload.initial_fee_rule_template_id = initial_fee_rule_template_id;
    }
    if (tenant_template_id && tenant_template_id !== "none") {
      payload.tenant_template_id = tenant_template_id;
    }

    const r = await tenantManage.create('TenantsManage', payload);
    if (r.data?.error) {
      setTenantMsg({ type: 'error', text: r.data.error });
    } else {
      const ruleNote = r.data?.fee_rule_template ? `，已套用规则模板「${r.data.fee_rule_template.name}」（草稿）` : '';
      const initNote = r.data?.initialized ? `，已初始化 ${r.data.initialized.notification_templates} 个通知模板和默认仓储设置` : '';
      setTenantMsg({ type: 'success', text: `租户 "${r.data.name}" 创建成功！${ruleNote}${initNote}` });
      setNewTenant({ name: "", code: "", branding_name: "", timezone: "Asia/Tokyo", login_title: "", login_subtitle: "", logo_url: "", favicon_url: "", theme_color: "#dc2626", contact_info: "", initial_fee_rule_template_id: "none", tenant_template_id: "none" });
      await loadTenants();
    }
    setCreatingTenant(false);
  };

  const handleAssignAll = async (tenantId) => {
    setAssigningAll(true);
    setTenantMsg(null);
    const r = await base44.functions.invoke('manageTenants', { action: 'assign_all', tenant_id: tenantId });
    if (r.data?.error) {
      setTenantMsg({ type: 'error', text: r.data.error });
    } else {
      setTenantMsg({ type: 'success', text: `已将 ${r.data.assigned} 名用户分配到此租户。` });
    }
    setAssigningAll(false);
  };

  const handleToggleTenant = async (t) => {
    // await base44.functions.invoke('manageTenants', { action: 'update', id: t.id, is_active: !t.is_active });
    await tenantManage.update('TenantsManage', t.id, { is_active: !t.is_active })
    await loadTenants();
  };

  const handleEditTenant = (t) => {
    setEditingTenant(t.id);
    setEditTenantFields({
      branding_name: t.branding_name || "",
      code: t.code || "",
      logo_url: t.logo_url || "",
      favicon_url: t.favicon_url || "",
      theme_color: t.theme_color || "#dc2626",
      login_title: t.login_title || "",
      login_subtitle: t.login_subtitle || "",
      contact_info: t.contact_info || "",
      subdomain: t.subdomain || (t.code || "").toLowerCase(),
    });
    setTenantMsg(null);
  };

  const handleSaveTenant = async (tenantId) => {
    setSavingTenant(true);
    setTenantMsg(null);
    // const r = await base44.functions.invoke('manageTenants', { action: 'update', id: tenantId, ...editTenantFields });
    const r = await tenantManage.update('TenantsManage', tenantId, {...editTenantFields });
    
    if (r.data?.error) {
      setTenantMsg({ type: 'error', text: r.data.error });
    } else {
      setTenantMsg({ type: 'success', text: '保存成功' });
      await loadTenants();
      setTimeout(() => {
        setEditingTenant(null);
        setTenantMsg(null);
      }, 2000);
    }
    setSavingTenant(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold text-gray-900">平台管理员设置</h1>
      </div>

      {/* Left vertical nav + content */}
      <div className="flex flex-col md:flex-row gap-5 items-start">
        <aside className="w-full md:w-52 flex-shrink-0 bg-white border border-gray-200 rounded-lg p-2 space-y-0.5 md:sticky md:top-20">
          {PLATFORM_NAV.map(item => item.children ? (
            <div key={item.group} className="pt-1.5">
              <p className="px-3 py-1 text-xs font-semibold text-gray-400">{item.group}</p>
              {item.children.map(c => (
                <button key={c.key} onClick={() => setActiveTab(c.key)}
                  className={`w-full text-left pl-6 pr-3 py-1.5 rounded-md text-sm transition-colors ${activeTab === c.key ? "bg-red-50 text-red-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          ) : (
            <button key={item.key} onClick={() => setActiveTab(item.key)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${activeTab === item.key ? "bg-red-50 text-red-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
              {item.label}
            </button>
          ))}
        </aside>

        <div className="flex-1 min-w-0 space-y-5">

      {/* Permissions tab */}
      {activeTab === "permissions" && (
        <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">权限一览</CardTitle>
            <p className="text-xs text-gray-400 mt-1">系统支持的所有权限项，可用于角色配置与用户权限覆写。</p>
          </CardHeader>
          <CardContent>
            <PermissionViewer />
          </CardContent>
        </Card>
      )}

      {activeTab === "tenants" && (
      <>
      {/* Tenant Assignment Diagnostics */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-amber-800"
          onClick={() => { setDiagOpen(o => !o); if (!diagOpen && !diagData) runDiagnose(); }}
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            租户分配诊断
          </span>
          {diagOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {diagOpen && (
          <div className="border-t border-amber-200 px-4 py-4 space-y-3 bg-white">
            {diagLoading ? (
              <p className="text-sm text-gray-400">诊断中...</p>
            ) : diagError ? (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">⚠️ {diagError}</p>
            ) : diagData ? (
              <>
                <p className="text-xs text-gray-500">
                  共 {diagData.total_users} 名用户，
                  <span className={`font-semibold ${diagData.missing_tenant_users?.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {diagData.missing_tenant_users?.length} 名未分配租户
                  </span>
                  {diagData.assigned_users?.length > 0 && (
                    <span className="text-gray-400 ml-2">
                      · {diagData.assigned_users?.length} 名已分配
                    </span>
                  )}
                </p>
                {diagData.missing_tenant_users?.length === 0 ? (
                  <p className="text-xs text-green-600">✓ 所有用户均已分配租户</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-600">未分配用户</p>
                    {diagData.missing_tenant_users.map(u => (
                      <div key={u.user_email} className="flex items-center gap-2 flex-wrap py-1.5 border-b border-gray-100 last:border-0">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-gray-800 font-medium">{u.user_email}</span>
                          <span className="text-xs text-gray-400 ml-2">{u.role_name}</span>
                        </div>
                        <Select value={assignTarget[u.user_email] || ""} onValueChange={v => setAssignTarget(a => ({ ...a, [u.user_email]: v }))}>
                          <SelectTrigger className="w-40 h-7 text-xs"><SelectValue placeholder="选择租户" /></SelectTrigger>
                          <SelectContent>
                            {(diagData.tenants || []).map(t => (
                              <SelectItem key={t.id} value={t.id}>{t.name} ({t.code})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700"
                          disabled={!assignTarget[u.user_email] || assigning[u.user_email]}
                          onClick={() => handleAssign(u.user_email, u.id)}>
                          {assigning[u.user_email] ? "分配中..." : "分配"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 已分配用户区域 */}
                {diagData.assigned_users?.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <button
                      className="w-full flex items-center justify-between py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800"
                      onClick={() => setAssignedExpanded(e => !e)}
                    >
                      <span>已分配用户 ({filteredAssignedUsers.length})</span>
                      {assignedExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    
                    {assignedExpanded && (
                      <>
                        <div className="flex items-center gap-2">
                          <Select value={filterTenant ? String(filterTenant) : "all"} onValueChange={v => setFilterTenant(v === "all" ? null : Number(v))}>
                            <SelectTrigger className="w-36 h-7 text-xs"><SelectValue placeholder="全部租户" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">全部租户</SelectItem>
                              {(diagData.tenants || []).map(t => (
                                <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            className="w-44 h-7 text-xs"
                            placeholder="搜索用户..."
                            value={searchUser}
                            onChange={e => setSearchUser(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {filteredAssignedUsers.length === 0 ? (
                            <p className="text-xs text-gray-400 py-2">没有匹配的用户</p>
                          ) : (
                            filteredAssignedUsers.map(u => {
                              // 获取该用户未关联的租户列表（用于"添加至新租户"）
                              const relatedTenantIds = (u.tenant_relations || []).map(r => r.tenant_id);
                              const availableTenants = (diagData.tenants || []).filter(t => !relatedTenantIds.includes(t.id));
                              
                              return (
                                <div key={u.id || u.user_email} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50/50">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-gray-800">{u.user_email}</span>
                                      {u.user_name && <span className="text-xs text-gray-500">({u.user_name})</span>}
                                      <span className="text-xs text-gray-400">{u.role_name}</span>
                                    </div>
                                    
                                    {/* 添加至新租户 */}
                                    {availableTenants.length > 0 && (
                                      <div className="flex items-center gap-1">
                                        <Select
                                          value={reassignTarget[`add_select_${u.id}`] || ""}
                                          onValueChange={v => setReassignTarget(prev => ({ ...prev, [`add_select_${u.id}`]: v }))}
                                        >
                                          <SelectTrigger className="w-28 h-6 text-xs"><SelectValue placeholder="添加至租户" /></SelectTrigger>
                                          <SelectContent>
                                            {availableTenants.map(t => (
                                              <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <Button
                                          size="sm" variant="outline" className="h-6 text-xs px-2 border-green-200 text-green-600 hover:bg-green-50"
                                          disabled={!reassignTarget[`add_select_${u.id}`] || reassigning[`add_${u.id}`]}
                                          onClick={() => handleAddToTenant(u.id, reassignTarget[`add_select_${u.id}`])}
                                        >
                                          {reassigning[`add_${u.id}`] ? "..." : "+ 添加"}
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                  
                                  <div className="space-y-1.5 ml-3">
                                    {(u.tenant_relations || []).length === 0 ? (
                                      <p className="text-xs text-gray-400 italic">暂无租户关联</p>
                                    ) : (
                                      u.tenant_relations.map(rel => {
                                        const rkey = String(rel.relation_id);
                                        // 排除该用户所有已关联的租户（与"添加至租户"逻辑一致）
                                        const availableForReassign = (diagData.tenants || []).filter(t => !relatedTenantIds.includes(t.id));
                                        
                                        return (
                                          <div key={rel.relation_id} className="flex items-center gap-2 flex-wrap py-1 border-l-2 border-blue-200 pl-2">
                                            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                              {rel.tenant_name} <span className="text-blue-400 ml-0.5">({rel.tenant_code})</span>
                                            </Badge>
                                            
                                            <Select
                                              value={reassignTarget[rkey] || ""}
                                              onValueChange={v => setReassignTarget(prev => ({ ...prev, [rkey]: v }))}
                                            >
                                              <SelectTrigger className="w-28 h-6 text-xs"><SelectValue placeholder="更改租户" /></SelectTrigger>
                                              <SelectContent>
                                                {availableForReassign.length === 0 ? (
                                                  <SelectItem value="none" disabled>无可选租户</SelectItem>
                                                ) : (
                                                  availableForReassign.map(t => (
                                                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                                  ))
                                                )}
                                              </SelectContent>
                                            </Select>
                                            <Button
                                              size="sm" variant="outline" className="h-6 text-xs px-2 border-blue-200 text-blue-600 hover:bg-blue-50"
                                              disabled={!reassignTarget[rkey] || reassigning[rkey] || availableForReassign.length === 0}
                                              onClick={() => handleReassign(rel.relation_id, reassignTarget[rkey], u.id)}
                                            >
                                              {reassigning[rkey] ? "..." : "改分配"}
                                            </Button>
                                            
                                            <Button
                                              size="sm" variant="ghost" className="h-6 text-xs px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                                              disabled={removing[rkey]}
                                              onClick={() => handleRemove(rel.relation_id)}
                                            >
                                              {removing[rkey] ? "..." : "移除"}
                                            </Button>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <Button size="sm" variant="outline" className="text-xs h-7" onClick={runDiagnose}>刷新诊断</Button>
              </>
            ) : null}
          </div>
        )}
      </div>
      </>
      )}

      {activeTab === "create_tenant" && (
      <>
      {/* Platform base domain */}
      <Card className="border-purple-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-500" />平台二级域名
          </CardTitle>
          <p className="text-xs text-gray-400 mt-1">
            设置后，租户的三级域名格式为：<span className="font-mono">{"<slug>."}{platformBaseDomain || "yourdomain.com"}</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-gray-500">二级域名（不含 http://，不含末尾斜杠）</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                className="h-8 text-sm font-mono flex-1"
                placeholder="例：app.yourcompany.com"
                value={editingDomain}
                onChange={e => setEditingDomain(e.target.value)}
              />
              <Button size="sm" className="h-8 bg-purple-600 hover:bg-purple-700" onClick={handleSaveDomain} disabled={savingDomain}>
                <Save className="w-3.5 h-3.5 mr-1" />{savingDomain ? "保存中..." : "保存"}
              </Button>
            </div>
            {platformBaseDomain && (
              <p className="text-xs text-purple-600 mt-1.5">
                ✓ 当前：租户访问地址格式 = <span className="font-mono font-medium">{"<slug>."}{platformBaseDomain}</span>
              </p>
            )}
            {domainMsg && (
              <p className={`text-xs mt-1.5 px-2 py-1 rounded ${domainMsg.type === 'success' ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                {domainMsg.text}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create tenant */}
      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" />新建租户
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500">租户名称 <span className="text-red-500">*</span></Label>
              <Input className="mt-0.5 h-8 text-sm border-red-500" placeholder="例：同一物流" value={newTenant.name} maxLength={100}
                onChange={e => setNewTenant(p => ({ ...p, name: e.target.value.slice(0, 100) }))} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">代码/子域名 (唯一，只能输入小写英文字母) <span className="text-red-500">*</span></Label>
              <Input className="mt-0.5 h-8 text-sm font-mono border-red-500" placeholder="例：tongyi" value={newTenant.code} maxLength={10}
                onChange={e => setNewTenant(p => ({ ...p, code: e.target.value.toLowerCase().replace(/[^a-z]/g, '').slice(0, 10) }))} />
              <p className="text-xs text-gray-400 mt-0.5">访问地址：{newTenant.code || "slug"}.{platformBaseDomain || "yourdomain.com"}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">品牌显示名</Label>
              <Input className="mt-0.5 h-8 text-sm" placeholder="同上则留空" value={newTenant.branding_name} maxLength={100}
                onChange={e => setNewTenant(p => ({ ...p, branding_name: e.target.value.slice(0, 100) }))} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">登录页标题</Label>
              <Input className="mt-0.5 h-8 text-sm" placeholder="留空则使用品牌名" value={newTenant.login_title}
                onChange={e => setNewTenant(p => ({ ...p, login_title: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">主题色</Label>
              <div className="flex items-center gap-2 mt-0.5">
                <input type="color" value={newTenant.theme_color} onChange={e => setNewTenant(p => ({ ...p, theme_color: e.target.value }))}
                  className="h-8 w-10 rounded border border-gray-200 cursor-pointer" />
                <Input className="h-8 text-sm flex-1 font-mono" value={newTenant.theme_color}
                  onChange={e => setNewTenant(p => ({ ...p, theme_color: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500">时区</Label>
              <Input className="mt-0.5 h-8 text-sm" value={newTenant.timezone}
                onChange={e => setNewTenant(p => ({ ...p, timezone: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-gray-500">联系方式</Label>
              <Input className="mt-0.5 h-8 text-sm" placeholder="微信/WhatsApp/邮箱等" value={newTenant.contact_info}
                onChange={e => setNewTenant(p => ({ ...p, contact_info: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-gray-500">租户模板（可选，初始化配置包）</Label>
              <Select value={newTenant.tenant_template_id}
                onValueChange={v => setNewTenant(p => ({ ...p, tenant_template_id: v }))}>
                <SelectTrigger className="mt-0.5 h-8 text-sm"><SelectValue placeholder="不套用" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不套用</SelectItem>
                  {tenantTemplates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}{t.description ? ` — ${t.description}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {newTenant.tenant_template_id !== "none" && (() => {
                const tpl = tenantTemplates.find(t => t.id === newTenant.tenant_template_id);
                if (!tpl) return null;
                return (
                  <p className="text-xs text-teal-600 mt-1">
                    ✓ 将套用：{tpl.fee_rule_template_name ? `规则「${tpl.fee_rule_template_name}」` : '无规则模板'}
                    {(tpl.allowed_features || []).length > 0 && ` · ${tpl.allowed_features.length} 个功能模块`}
                    {tpl.storage_policy?.storage_enabled && ` · 仓储策略（${tpl.storage_policy.default_storage_days}天）`}
                  </p>
                );
              })()}
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-gray-500">服务费规则模板（可选，优先于租户模板中的规则）</Label>
              <Select value={newTenant.initial_fee_rule_template_id}
                onValueChange={v => setNewTenant(p => ({ ...p, initial_fee_rule_template_id: v }))}>
                <SelectTrigger className="mt-0.5 h-8 text-sm"><SelectValue placeholder="不套用" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不套用</SelectItem>
                  {feeTemplates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}{t.description ? ` — ${t.description}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400 mt-0.5">选择后将自动克隆为该租户的草稿规则，租户管理员可再自定义并启用</p>
            </div>
          </div>
          {tenantMsg && !editingTenant && (
            <p className={`text-xs px-3 py-2 rounded border ${tenantMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {tenantMsg.type === 'success' ? '✓ ' : '⚠ '}{tenantMsg.text}
            </p>
          )}
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={handleCreateTenant}
            disabled={creatingTenant || !newTenant.name || !newTenant.code}>
            <Plus className="w-3.5 h-3.5 mr-1" />{creatingTenant ? "创建中..." : "创建租户"}
          </Button>
        </CardContent>
      </Card>
      </>
      )}

      {activeTab === "tenants" && (
      <>
      {/* Tenant list */}
       <Card className="border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400" />现有租户
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tenantsLoading ? (
            <p className="text-xs text-gray-400">加载中...</p>
          ) : tenants.length === 0 ? (
            <p className="text-xs text-gray-400">暂无租户，请在上方创建第一个租户。</p>
          ) : (
            <div className="space-y-3">
              {tenants.map(t => (
                <div key={t.id} className={`rounded-lg border ${t.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                  <div className="flex items-center gap-3 p-3">
                    {t.logo_url ? (
                      <img src={t.logo_url} alt={t.branding_name} className="h-7 w-auto object-contain flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: t.theme_color || '#dc2626' }}>
                        <span className="text-white text-xs font-bold">{(t.branding_name || t.name || '?').slice(0, 2)}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800">{t.branding_name || t.name}</span>
                        <Badge className="text-xs font-mono bg-gray-100 text-gray-600">{t.code}</Badge>
                        {t.subdomain && t.subdomain !== (t.code || '').toLowerCase() && (
                          <Badge className="text-xs font-mono bg-blue-100 text-blue-700">{t.subdomain}.*</Badge>
                        )}
                        {!t.is_active && <Badge className="text-xs bg-red-100 text-red-600">停用</Badge>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        <span className="font-mono">{t.subdomain || (t.code || '').toLowerCase()}.{platformBaseDomain || "yourdomain.com"}</span>
                        {t.contact_info && <span className="ml-2 text-gray-300">·</span>}
                        {t.contact_info && <span className="ml-2">{t.contact_info}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => editingTenant === t.id ? setEditingTenant(null) : handleEditTenant(t)}>
                        {editingTenant === t.id ? "收起" : "编辑品牌"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                        onClick={() => handleAssignAll(t.id)} disabled={assigningAll}>
                        <Users className="w-3 h-3" />{assigningAll ? "分配中..." : "批量分配"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => handleToggleTenant(t)}>
                        {t.is_active ? "停用" : "启用"}
                      </Button>
                    </div>
                  </div>

                  {editingTenant === t.id && (
                    <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-gray-500">品牌显示名</Label>
                          <Input className="mt-0.5 h-8 text-sm" value={editTenantFields.branding_name}
                            onChange={e => setEditTenantFields(p => ({ ...p, branding_name: e.target.value }))} />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">租户代码</Label>
                          <Input className="mt-0.5 h-8 text-sm font-mono uppercase" value={editTenantFields.code}
                            onChange={e => setEditTenantFields(p => ({ ...p, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') }))} />
                          <p className="text-xs text-gray-400 mt-0.5">用于系统识别租户（唯一）</p>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">三级域名 Slug</Label>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Input className="h-8 text-sm font-mono flex-1" value={editTenantFields.subdomain}
                              onChange={e => setEditTenantFields(p => ({ ...p, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
                            {platformBaseDomain && (
                              <span className="text-xs text-gray-400 whitespace-nowrap">.{platformBaseDomain}</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">登录页标题</Label>
                          <Input className="mt-0.5 h-8 text-sm" value={editTenantFields.login_title}
                            onChange={e => setEditTenantFields(p => ({ ...p, login_title: e.target.value }))} />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">登录页副标题</Label>
                          <Input className="mt-0.5 h-8 text-sm" value={editTenantFields.login_subtitle}
                            onChange={e => setEditTenantFields(p => ({ ...p, login_subtitle: e.target.value }))} />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">主题色</Label>
                          <div className="flex items-center gap-2 mt-0.5">
                            <input type="color" value={editTenantFields.theme_color || '#dc2626'}
                              onChange={e => setEditTenantFields(p => ({ ...p, theme_color: e.target.value }))}
                              className="h-8 w-10 rounded border border-gray-200 cursor-pointer" />
                            <Input className="h-8 text-sm flex-1 font-mono" value={editTenantFields.theme_color}
                              onChange={e => setEditTenantFields(p => ({ ...p, theme_color: e.target.value }))} />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">联系方式</Label>
                          <Input className="mt-0.5 h-8 text-sm" placeholder="微信/WhatsApp/邮箱" value={editTenantFields.contact_info}
                            onChange={e => setEditTenantFields(p => ({ ...p, contact_info: e.target.value }))} />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs text-gray-500">Logo URL</Label>
                          <Input className="mt-0.5 h-8 text-sm" placeholder="https://..." value={editTenantFields.logo_url}
                            onChange={e => setEditTenantFields(p => ({ ...p, logo_url: e.target.value }))} />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs text-gray-500">Favicon URL</Label>
                          <Input className="mt-0.5 h-8 text-sm" placeholder="https://..." value={editTenantFields.favicon_url}
                            onChange={e => setEditTenantFields(p => ({ ...p, favicon_url: e.target.value }))} />
                        </div>
                      </div>
                      {tenantMsg && editingTenant === t.id && (
                        <p className={`text-xs px-3 py-2 rounded border ${tenantMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                          {tenantMsg.type === 'success' ? '✓ ' : '⚠ '}{tenantMsg.text}
                        </p>
                      )}
                      <Button size="sm" className="bg-gray-900 hover:bg-gray-800"
                        onClick={() => handleSaveTenant(t.id)} disabled={savingTenant}>
                        <Save className="w-3.5 h-3.5 mr-1" />{savingTenant ? "保存中..." : "保存品牌设置"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      </>
      )}

      {/* Global Roles Management */}
      {activeTab === "roles" && (
        <Card className="border-purple-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-500" />全局角色管理
            </CardTitle>
            <p className="text-xs text-gray-400 mt-1">创建可供所有租户使用的全局角色模板和权限系统。</p>
          </CardHeader>
          <CardContent>
            <GlobalRoleManager />
          </CardContent>
        </Card>
      )}

      {/* Tenant Role Management */}
      {activeTab === "tenant_roles" && (
        <Card className="border-indigo-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-500" />租户角色管理
            </CardTitle>
            <p className="text-xs text-gray-400 mt-1">
              查看并管理每个租户的自有角色，可新增、编辑权限、删除角色，也可标记为内置预定义角色。
            </p>
          </CardHeader>
          <CardContent>
            {tenants.length === 0 ? (
              <p className="text-xs text-gray-400">暂无租户，请先在「租户管理」中创建。</p>
            ) : (
              <TenantRoleManager tenants={tenants} onTenantUpdated={loadTenants} />
            )}
          </CardContent>
        </Card>
      )}



      {/* Exchange Rates (Platform-level) */}
      {activeTab === "exchange_rates" && (
        <div className="space-y-4">
          <ExchangeRateApiSettings />
          {liveRates && (
        <Card className="border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-600" />实时汇率增量设置
            </CardTitle>
            <p className="text-xs text-gray-400 mt-1">平台级汇率调整，对所有租户生效</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-green-200 bg-green-50">
              <TrendingUp className="h-3 w-3 text-green-600" />
              <AlertDescription className="text-xs text-green-700 ml-1">
                基础汇率自动从市场获取，可在此设定平台级增量（正数=上浮，负数=下浮）。租户可在此基础上再叠加各自的增量。最终汇率 = 市场汇率 + 平台增量 + 租户增量
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: 'jpy_usd', label: '日元→美元' },
                { key: 'jpy_cny', label: '日元→人民币' },
                { key: 'jpy_eur', label: '日元→欧元' },
                { key: 'jpy_gbp', label: '日元→英镑' },
                { key: 'jpy_aud', label: '日元→澳元' },
                { key: 'jpy_sgd', label: '日元→新加坡元' },
                { key: 'jpy_hkd', label: '日元→港元' },
                { key: 'jpy_twd', label: '日元→新台币' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <Label className="text-xs text-gray-500 block mb-1">
                    {label}
                    <span className="text-gray-400 ml-1">({((liveRates[key] || 0)).toFixed(6)})</span>
                  </Label>
                  <div className="flex items-center gap-1">
                    <Input type="number" step="0.00001" className="h-8 text-sm flex-1"
                      placeholder="0"
                      value={platformIncrements[`${key}`] ?? 0}
                      onChange={e => setPlatformIncrements(p => ({ ...p, [`${key}`]: e.target.value }))}
                    />
                    <span className="text-xs text-gray-400 px-2">Δ</span>
                  </div>
                  {(parseFloat(platformIncrements[`${key}`]) || 0) !== 0 && (
                    <p className="text-xs text-green-600 mt-0.5">
                      → {((liveRates[key] || 0) + (parseFloat(platformIncrements[`${key}`]) || 0)).toFixed(6)}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={savingRates}
              onClick={async () => {
                setSavingRates(true);
                const payload = {};
                Object.entries(platformIncrements).forEach(([k, v]) => { payload[k] = parseFloat(v) || 0; });
                // await base44.functions.invoke('managePlatformSettings', payload);
                const increments = {platform_increments: payload}
                await tenantManage.updateRate('TenantsManage', 1, increments)
                  .then(res => {

                  }).catch(e => {
                    setSavingRates(false);
                  });
                setSavingRates(false);
              }}>
              <Save className="w-3.5 h-3.5 mr-1" />{savingRates ? "保存中..." : "保存平台增量设置"}
            </Button>
          </CardContent>
        </Card>
          )}
        </div>
      )}

      {/* Global fee rule templates */}
      {activeTab === "fee_templates" && <GlobalFeeRuleTemplates />}

      {/* Tenant templates (initialization packages) */}
      {activeTab === "tenant_templates" && <TenantTemplateManager />}

      {/* Global reports placeholder */}
      {activeTab === "reports" && (
        <Card className="border-dashed border-gray-300">
          <CardContent className="py-12 text-center text-sm text-gray-400">
            全局自定义看板功能开发中，敬请期待。
          </CardContent>
        </Card>
      )}

      {/* Global notification templates placeholder */}
      {activeTab === "notification_templates" && (
        <Card className="border-dashed border-gray-300">
          <CardContent className="py-12 text-center text-sm text-gray-400">
            全局通知模板功能开发中，敬请期待。
          </CardContent>
        </Card>
      )}

      {/* Notifications Management */}
      {activeTab === "notifications" && (
        <div className="space-y-4">
          <Card className="border-indigo-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-500" />平台通知管理
              </CardTitle>
              <p className="text-xs text-gray-400 mt-1">发送跨租户的系统通知，可指定目标租户和管理员范围</p>
            </CardHeader>
            <CardContent>
              <Link to={createPageUrl("PlatformNotificationManager")}>
                <Button className="bg-indigo-600 hover:bg-indigo-700 w-full">
                  <ExternalLink className="w-4 h-4 mr-2" />进入平台通知管理
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-green-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Settings className="w-4 h-4 text-green-500" />平台级默认通知设置
              </CardTitle>
              <p className="text-xs text-gray-400 mt-1">设置全平台新用户的默认通知偏好（租户可覆盖）</p>
            </CardHeader>
            <CardContent>
              <Link to={createPageUrl("AdminNotificationDefaults")}>
                <Button className="bg-green-600 hover:bg-green-700 w-full">
                  <ExternalLink className="w-4 h-4 mr-2" />进入默认设置管理
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

        </div>
      </div>
    </div>
  );
}