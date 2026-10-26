/**
 * AdminTransitWork - Admin overview of all transit location work panels
 * Shows all transit locations with their pending work (pools) and full management features
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { tenantEntity, transitLocationApi } from "@/lib/tenantApi";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePermissions } from "@/hooks/usePermissions";
import {
  MapPin, Package, CheckCircle, Truck, Loader2, ChevronRight, AlertCircle, Edit2, Trash2, X, LogIn, Plus, Check, Clock
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import CountrySelect from "@/components/common/CountrySelect";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import TransitPoolCard from "@/components/transit/TransitPoolCard";
import { getCountry } from "@/lib/countries";

const TABS = [
  { key: "work", label: "工作总览" },
  { key: "manage", label: "中转地管理" },
];

export default function AdminTransitWork() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { can, isAdmin } = usePermissions();
  const canViewTransitPanel = isAdmin || can("shipping:view_transit_panel");
  const canManageTransitLocations = isAdmin || can("shipping:manage_transit_locations");

  const [activeTab, setActiveTab] = useState("work");
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]);
  const [requestsByLocation, setRequestsByLocation] = useState({});
  const [allUsers, setAllUsers] = useState([]);
  const [transitMethods, setTransitMethods] = useState([]);
  const [addonOptions, setAddonOptions] = useState([]);

  // Location form state
  const [showLocForm, setShowLocForm] = useState(false);
  const [editingLoc, setEditingLoc] = useState(null);
  const [locForm, setLocForm] = useState({ name: "", code_prefix: "", country: "", province: "", address: "", handling_fee: 0, handling_fee_currency: "JPY", manager_email: "", manager_contact: "", allow_storage: false, allow_pickup: false, description: "", is_active: true, is_default_official_pool: false, disabled_transit_method_ids: [], disabled_addon_ids: [] });
  const [savingLoc, setSavingLoc] = useState(false);
  
  // Collapsed state for each location (default: all collapsed)
  const [collapsedLocations, setCollapsedLocations] = useState({});

  // Delete confirmation dialog target
  const [deleteLocId, setDeleteLocId] = useState(null);

  // Location management actions are only shown in the manage tab
  const showLocationActions = activeTab === "manage";

  const fetchData = async () => {
    setLoading(true);
    try {
      // const r = await base44.functions.invoke('getAllTransitWorkData', {});
      const r = await transitLocationApi.workData();
      const data = r || {};

      setLocations(data.locations || []);
      setRequestsByLocation(data.requestsByLocation || data.poolsByLocation || {});
      setAllUsers(data.users || []);
      setTransitMethods(data.transitMethods || []);
      setAddonOptions(data.addonOptions || []);
    } catch (err) {
      console.error('AdminTransitWork fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user]);

  // Redirect if user doesn't have permission
  if (!canViewTransitPanel && user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-800">无权访问</h2>
          <p className="text-sm text-gray-500 mt-2">您没有查看中转面板的权限</p>
        </div>
      </div>
    );
  }

  const getPoolsByStatus = (pools) => ({
    // Pending: requests/pools assigned to this transit location but not yet arrived
    pending: pools.filter(p => 
      !p.transit_arrival_confirmed_at && 
      !p.transit_shipped_date && 
      (p.status === "open" || p.status === "completed" || p.status === "pending" || p.status === "awaiting_payment" || p.status === 'ready_to_ship')
    ),
    // In transit: completed requests/pools en route to transit location (Japan shipped but transit hasn't confirmed arrival)
    in_transit: pools.filter(p => 
      (p.status === "shipped" 
        // || p.status === "paid" || p.status === "ready_to_ship"
      ) && 
      !p.transit_arrival_confirmed_at
    ),
    // Arrived: transit location confirmed receipt but hasn't forwarded yet
    arrived: pools.filter(p => p.transit_arrival_confirmed_at && !p.transit_shipped_date),
    // Forwarded: transit location has shipped to final destination
    forwarded: pools.filter(p => p.transit_shipped_date),
  });

  const fetchLocations = async () => {
    // const data = await tenantEntity.list('TransitLocation');
    const r = await transitLocationApi.workData();
    setRequestsByLocation(r?.requestsByLocation || r?.poolsByLocation || {});
    setLocations(r?.locations);
  };

  const lf = (k, v) => setLocForm(p => ({ ...p, [k]: v }));

  const handleLocSave = async () => {
    setSavingLoc(true);
    // If setting as default, clear the flag on all other locations first
    if (locForm.is_default_official_pool) {
      const others = locations.filter(l => l.is_default_official_pool && l.id !== editingLoc?.id);
      await Promise.all(others.map(l => tenantEntity.update('TransitLocation', l.id, { is_default_official_pool: false })));
    }
    if (editingLoc) {
      await transitLocationApi.update(editingLoc.id, locForm);
    } else {
      await transitLocationApi.create(locForm);
    }
    await fetchLocations();
    // Refresh requests data
    // const r = await base44.functions.invoke('getAllTransitWorkData', {});
    // const r = await transitLocationApi.workData();
    // setRequestsByLocation(r?.requestsByLocation || r?.poolsByLocation || {});
    setShowLocForm(false);
    setEditingLoc(null);
    setLocForm({ name: "", code_prefix: "", country: "", province: "", address: "", handling_fee: 0, handling_fee_currency: "JPY", manager_email: "", manager_contact: "", allow_storage: false, allow_pickup: false, description: "", is_active: true, is_default_official_pool: false, disabled_transit_method_ids: [], disabled_addon_ids: [] });
    setSavingLoc(false);
  };

  const handleLocEdit = (loc) => {
    setEditingLoc(loc);
    setLocForm({
      name: loc.name, code_prefix: loc.code_prefix || "", country: loc.country || "", province: loc.province || "",
      address: loc.address || "", handling_fee: loc.handling_fee || 0,
      handling_fee_currency: loc.handling_fee_currency || "JPY",
      manager_email: loc.manager_email || "", manager_contact: loc.manager_contact || "",
      allow_storage: loc.allow_storage || false,
      allow_pickup: loc.allow_pickup || false,
      disabled_transit_method_ids: loc.disabled_transit_method_ids || [],
      disabled_addon_ids: loc.disabled_addon_ids || [],
      description: loc.description || "", is_active: loc.is_active !== false,
      is_default_official_pool: loc.is_default_official_pool || false,
    });
    setShowLocForm(true);
  };

  const handleLocDelete = (id) => {
    setDeleteLocId(id);
  };

  const confirmLocDelete = async () => {
    if (!deleteLocId) return;
    await tenantEntity.delete('TransitLocation', deleteLocId);
    setDeleteLocId(null);
    await fetchLocations();
    // const r = await base44.functions.invoke('getAllTransitWorkData', {});
    // setRequestsByLocation(r.data?.requestsByLocation || r.data?.poolsByLocation || {});
  };

  const handleLocToggle = async (loc) => {
    await tenantEntity.update('TransitLocation', loc.id, { is_active: !loc.is_active });
    await fetchLocations();
  };

  const handleSetDefaultOfficialPool = async (loc) => {
    if (loc.is_default_official_pool) {
      await tenantEntity.update('TransitLocation', loc.id, { is_default_official_pool: false });
    } else {
      const others = locations.filter(l => l.is_default_official_pool);
      await Promise.all(others.map(l => tenantEntity.update('TransitLocation', l.id, { is_default_official_pool: false })));
      await tenantEntity.update('TransitLocation', loc.id, { is_default_official_pool: true });
    }
    await fetchLocations();
  };

  const toggleLocationCollapse = (locId) => {
    setCollapsedLocations(prev => ({
      ...prev,
      [locId]: !prev[locId]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const activeLocations = locations.filter(loc => loc.is_active !== false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">中转地工作面板</h1>
          <p className="text-sm text-gray-400 mt-0.5">管理所有中转地的待处理包裹与配置</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchData}
            className="gap-1"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            刷新数据
          </Button>
          {activeTab === "manage" && canManageTransitLocations && (
            <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => { setEditingLoc(null); setLocForm({ name: "", code_prefix: "", country: "", province: "", address: "", handling_fee: 0, handling_fee_currency: "JPY", manager_email: "", manager_contact: "", allow_storage: false, allow_pickup: false, description: "", is_active: true, disabled_transit_method_ids: [], disabled_addon_ids: [] }); setShowLocForm(true); }}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />添加中转地
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === tab.key ? "border-red-600 text-red-600" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
            {tab.label}
            {tab.key === "work" && <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{activeLocations.length}</span>}
            {tab.key === "manage" && <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{locations.length}</span>}
          </button>
        ))}
      </div>

      {/* ---- WORK OVERVIEW TAB ---- */}
      {activeTab === "work" && (
        <>
          {activeLocations.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-gray-400">
              <MapPin className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">暂无启用的中转地</p>
            </div>
          ) : (
            <div className="space-y-8">
              {activeLocations.map(loc => {
                const pools = requestsByLocation.filter(p => parseInt(p.transit_location_id) === loc.id) || [];
                const byStatus = getPoolsByStatus(pools);
                const pendingCount = byStatus.pending.length + byStatus.arrived.length + byStatus.in_transit.length;
                const isCollapsed = collapsedLocations[loc.id] !== false; // default collapsed

                return (
                  <div key={loc.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div 
                      className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => toggleLocationCollapse(loc.id)}
                    >
                      <div className="flex items-center gap-2 flex-wrap flex-1">
                        <MapPin className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <span className="font-semibold text-gray-800 text-sm">{loc.name}</span>
                        {loc.code_prefix && (
                          <Badge className="text-xs bg-purple-100 text-purple-700 font-mono">{loc.code_prefix}</Badge>
                        )}
                        {loc.manager_email && (
                          <span className="text-xs text-gray-400">负责人：{loc.manager_email}</span>
                        )}
                        {!loc.manager_email && (
                          <Badge className="text-xs bg-orange-100 text-orange-700">
                            <AlertCircle className="w-2.5 h-2.5 mr-1 inline" />未分配负责人
                          </Badge>
                        )}
                        {isCollapsed && (
                          <Badge className="text-xs bg-gray-100 text-gray-600 ml-2">
                            {pendingCount} 个包裹
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform mr-2 ${!isCollapsed ? 'rotate-90' : ''}`} />
                        {pendingCount > 0 && !isCollapsed && (
                          <Badge className="bg-red-100 text-red-700 text-xs mr-2">{pendingCount} 待处理</Badge>
                        )}
                        <button 
                          onClick={(e) => { e.stopPropagation(); window.open(`${window.location.origin}/TransitLocationWork/${loc.id}`, '_blank'); }} 
                          title="工作面板" 
                          className="p-1.5 rounded hover:bg-red-50 text-red-600"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                        </button>
                        {showLocationActions && (
                          <>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleLocEdit(loc); }} 
                              title="编辑" 
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleLocToggle(loc); }} 
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                            >
                              {loc.is_active ? <X className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleLocDelete(loc.id); }} 
                              className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="p-4 space-y-4">
                      {/* Pending Tab */}
                      {byStatus.pending.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <Clock className="w-3.5 h-3.5 text-orange-500" />
                            <span className="text-xs font-medium text-orange-700">待处理 ({byStatus.pending.length})</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            {byStatus.pending.map(pool => (
                              <TransitPoolCard key={pool.id} pool={pool} transitStatus="pending" onClick={() => navigate(`/Trworkon/${pool.pool_code || pool.id}`)} />
                            ))}
                          </div>
                        </div>
                      )}
                      {byStatus.in_transit.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <Truck className="w-3.5 h-3.5 text-blue-500" />
                            <span className="text-xs font-medium text-blue-700">在途 ({byStatus.in_transit.length})</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            {byStatus.in_transit.map(pool => (
                              <TransitPoolCard key={pool.id} pool={pool} transitStatus="in_transit" onClick={() => navigate(`/Trworkon/${pool.pool_code || pool.id}`)} />
                            ))}
                          </div>
                        </div>
                      )}
                      {byStatus.arrived.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                            <span className="text-xs font-medium text-green-700">已收货待转发 ({byStatus.arrived.length})</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            {byStatus.arrived.map(pool => (
                              <TransitPoolCard key={pool.id} pool={pool} transitStatus="arrived" onClick={() => navigate(`/Trworkon/${pool.pool_code || pool.id}`)} />
                            ))}
                          </div>
                        </div>
                      )}
                      {byStatus.forwarded.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <Package className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-xs font-medium text-gray-500">已转发 ({byStatus.forwarded.length})</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            {byStatus.forwarded.map(pool => (
                              <TransitPoolCard key={pool.id} pool={pool} transitStatus="forwarded" onClick={() => navigate(`/Trworkon/${pool.pool_code || pool.id}`)} />
                            ))}
                          </div>
                        </div>
                      )}
                      {pools.length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-4">暂无包裹</p>
                      )}
                    </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ---- MANAGEMENT TAB ---- */}
      {activeTab === "manage" && (
        <div className="space-y-4">
          {/* Location form */}
          {showLocForm && (
            <div className="border border-gray-200 rounded-xl p-5 bg-gray-50 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">{editingLoc ? "编辑中转地" : "添加中转地"}</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs text-gray-500">中转地名称 *</Label>
                  <Input className="mt-1 h-8 text-sm" value={locForm.name} onChange={e => lf("name", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">代号前缀（3 位大写字母）</Label>
                  <Input
                    className="mt-1 h-8 text-sm font-mono uppercase tracking-widest"
                    maxLength={3}
                    placeholder="TYO"
                    value={locForm.code_prefix}
                    onChange={e => lf("code_prefix", e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
                  />
                </div>
              </div>
              <div>
                  <Label className="text-xs text-gray-500">负责人（可选择任何用户）</Label>
                  <Select value={locForm.manager_email} onValueChange={v => lf("manager_email", v)}>
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="选择用户..." /></SelectTrigger>
                    <SelectContent>
                      {allUsers.map(u => (
                        <SelectItem key={u.id} value={u.email}>
                          {u.full_name ? `${u.full_name} (${u.email})` : u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-500">负责人联系方式（微信/Line/WhatsApp 等）</Label>
                <Input className="mt-1 h-8 text-sm" placeholder="如：微信号 abc123" value={locForm.manager_contact} onChange={e => lf("manager_contact", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-500">国家</Label>
                  <CountrySelect value={locForm.country} onChange={v => lf("country", v)} placeholder="选择国家" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">省/州</Label>
                  <Input className="mt-1 h-8 text-sm" placeholder="如：广东省" value={locForm.province} onChange={e => lf("province", e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-500">详细地址</Label>
                <Input className="mt-1 h-8 text-sm" placeholder="街道、门牌号等" value={locForm.address} onChange={e => lf("address", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-500">中转手续费</Label>
                  <Input type="number" step="0.01" className="mt-1 h-8 text-sm" placeholder="0" value={locForm.handling_fee} onChange={e => lf("handling_fee", parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">手续费货币</Label>
                  <Select value={locForm.handling_fee_currency} onValueChange={v => lf("handling_fee_currency", v)}>
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["JPY","CNY","USD","TWD","HKD","EUR","SGD"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-500">描述/备注</Label>
                <Textarea rows={2} className="mt-1 text-sm" value={locForm.description} onChange={e => lf("description", e.target.value)} />
              </div>
              <div className="flex items-center gap-6 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={locForm.allow_storage} onCheckedChange={v => lf("allow_storage", v)} />
                  <span className="text-xs text-gray-600">允许货品暂存</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={locForm.allow_pickup} onCheckedChange={v => lf("allow_pickup", v)} />
                  <span className="text-xs text-gray-600">允许自取</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={locForm.is_active} onCheckedChange={v => lf("is_active", v)} />
                  <span className="text-xs text-gray-600">启用</span>
                </label>
              </div>

              {/* Default official pool toggle */}
              <div className="flex items-center justify-between border border-orange-200 rounded-lg px-3 py-2 bg-orange-50">
                <div>
                  <p className="text-xs font-medium text-orange-700">设为默认官方拼邮中转地</p>
                  <p className="text-xs text-orange-500 mt-0.5">开启后，创建官方拼邮需求时将自动选取此中转地（全租户唯一）</p>
                </div>
                <Switch
                  checked={locForm.is_default_official_pool}
                  onCheckedChange={v => lf("is_default_official_pool", v)}
                />
              </div>

              {/* Disable transit methods for this location */}
              {transitMethods.length > 0 && (
                <div>
                  <Label className="text-xs text-gray-500">禁用的中转运输方式（勾选 = 在此中转地隐藏）</Label>
                  <div className="mt-1.5 space-y-1 border border-gray-200 rounded-lg p-2 bg-white max-h-36 overflow-y-auto">
                    {transitMethods.map(m => {
                      const disabled = (locForm.disabled_transit_method_ids || []).includes(m.id);
                      return (
                        <label key={m.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                          <input type="checkbox" checked={disabled}
                            onChange={() => lf("disabled_transit_method_ids", disabled
                              ? (locForm.disabled_transit_method_ids || []).filter(id => id !== m.id)
                              : [...(locForm.disabled_transit_method_ids || []), m.id]
                            )}
                            className="accent-red-600" />
                          <span className="text-xs text-gray-700">{m.name}</span>
                          {!m.is_active && <span className="text-xs text-gray-400">（已全局禁用）</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Disable addons for this location */}
              {addonOptions.length > 0 && (
                <div>
                  <Label className="text-xs text-gray-500">禁用的发货增值服务（勾选 = 在此中转地隐藏）</Label>
                  <div className="mt-1.5 space-y-1 border border-gray-200 rounded-lg p-2 bg-white max-h-36 overflow-y-auto">
                    {addonOptions.map(a => {
                      const disabled = (locForm.disabled_addon_ids || []).includes(a.id);
                      return (
                        <label key={a.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                          <input type="checkbox" checked={disabled}
                            onChange={() => lf("disabled_addon_ids", disabled
                              ? (locForm.disabled_addon_ids || []).filter(id => id !== a.id)
                              : [...(locForm.disabled_addon_ids || []), a.id]
                            )}
                            className="accent-red-600" />
                          <span className="text-xs text-gray-700">{a.name}</span>
                          {a.fee > 0 && <span className="text-xs text-gray-400">+{a.fee_currency} {a.fee}</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => { setShowLocForm(false); setEditingLoc(null); }}>取消</Button>
                <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={handleLocSave} disabled={savingLoc || !locForm.name}>
                  {savingLoc ? "保存中..." : "保存"}
                </Button>
              </div>
            </div>
          )}

          {/* Location list */}
          {locations.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <MapPin className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">暂无中转地，点击右上角"添加中转地"</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...locations].sort((a, b) => {
                const aHasManager = !!a.manager_email;
                const bHasManager = !!b.manager_email;
                if (aHasManager === bHasManager) return 0;
                return aHasManager ? 1 : -1;
              }).map(loc => (
                <div key={loc.id} className="flex items-start gap-3 border border-gray-200 rounded-xl p-4 bg-white">
                  <MapPin className={`w-4 h-4 mt-0.5 flex-shrink-0 ${loc.is_active ? "text-red-500" : "text-gray-300"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{loc.name}</span>
                      {loc.code_prefix && (
                        <Badge className="text-xs bg-purple-100 text-purple-700 font-mono">{loc.code_prefix}</Badge>
                      )}
                      {(loc.country || loc.province) && (
                        <Badge variant="outline" className="text-xs">
                          {[getCountry(loc.country)?.name || loc.country, loc.province].filter(Boolean).join(" · ")}
                        </Badge>
                      )}
                      {loc.allow_storage && <Badge className="text-xs bg-blue-100 text-blue-600">可暂存</Badge>}
                      {loc.allow_pickup && <Badge className="text-xs bg-teal-100 text-teal-600">可自取</Badge>}
                      {loc.is_default_official_pool && (
                        <Badge className="text-xs bg-orange-100 text-orange-700">⭐ 默认官方拼邮</Badge>
                      )}
                      <Badge className={`text-xs ${loc.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {loc.is_active ? "启用" : "停用"}
                      </Badge>
                      {!loc.manager_email && (
                        <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200">
                          <AlertCircle className="w-2.5 h-2.5 mr-1 inline" />
                          未分配负责人
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 mt-0.5">
                      {loc.address && <p className="text-xs text-gray-500">{loc.address}</p>}
                      {loc.handling_fee > 0 && <p className="text-xs text-orange-500">手续费 {loc.handling_fee_currency || "JPY"} {loc.handling_fee}</p>}
                      {loc.manager_email && <p className="text-xs text-gray-400">负责人：{allUsers.find(u => u.email === loc.manager_email)?.full_name || loc.manager_email}{loc.manager_contact ? ` · ${loc.manager_contact}` : ""}</p>}
                    </div>
                    {loc.description && <p className="text-xs text-gray-400 mt-0.5">{loc.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {canManageTransitLocations && (
                      <>
                        {/* Work Panel Button */}
                        <a
                          href={`${window.location.origin}/TransitLocationWork/${loc.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="打开中转地工作面板"
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 text-xs font-medium transition-colors"
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          工作面板
                        </a>
                        {!loc.is_default_official_pool && (
                          <button
                            title="设为默认官方拼邮中转地"
                            onClick={() => handleSetDefaultOfficialPool(loc)}
                            className="p-1.5 rounded hover:bg-orange-50 text-gray-300 hover:text-orange-500">
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {loc.is_default_official_pool && (
                          <button
                            title="取消默认官方拼邮中转地"
                            onClick={() => handleSetDefaultOfficialPool(loc)}
                            className="p-1.5 rounded hover:bg-orange-50 text-orange-500 hover:text-orange-700">
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => handleLocToggle(loc)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                          {loc.is_active ? <X className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => handleLocEdit(loc)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleLocDelete(loc.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteLocId}
        onOpenChange={(open) => { if (!open) setDeleteLocId(null); }}
        title="删除中转地"
        description="确认删除此中转地？删除后无法恢复。"
        confirmText="删除"
        confirmClassName="bg-red-600 hover:bg-red-700"
        onConfirm={confirmLocDelete}
      />
    </div>
  );
}