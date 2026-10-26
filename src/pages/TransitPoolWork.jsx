/**
 * TransitPoolWork - 单箱工作面板（Master-Detail 布局）
 * Route: /Trworkon/:pool_code
 * 左侧：发货申请详情 + 批次列表
 * 右侧：选中批次的详细操作（普通发货 / 暂存 / 自取）
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  Package, Loader2, ArrowLeft, Users, Layers, Truck, MapPin, Star,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PoolInfoPanel from "@/components/transit/PoolInfoPanel";
import BatchDetailPanel from "@/components/transit/BatchDetailPanel";

// ─── Normalize transit method id ─────────────────────────────────────────────
const normalizeMethodId = (id) => {
  if (id === 'pickup') return '__pickup__';
  if (id === 'storage') return '__storage__';
  return id || '';
};

// ─── Build user group list from entries ──────────────────────────────────────
function buildUserGroupList(entries, request) {
  const hasPerUserGroups = !request?.title && (request?.per_user_groups || []).length > 0;

  if (hasPerUserGroups) {
    const groups = {};
    entries.forEach(entry => {
      const methodId = normalizeMethodId(entry.transit_shipping_method_id);
      const key = `${entry.user_email}__${methodId}__${entry.group_index ?? 0}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          user_email: entry.user_email,
          user_name: entry.user_name,
          group_label: entry.group_label,
          group_index: entry.group_index ?? 0,
          transit_shipping_method_id: methodId,
          transit_shipping_method: entry.transit_shipping_method,
          final_address: entry.group_final_address,
          selected_addons: entry.selected_addons || [],
          selected_addon_ids: entry.selected_addon_ids || [],
          note: entry.note,
          entries: [],
          estimated_jpy: 0,
        };
      }
      groups[key].entries.push(entry);
      groups[key].estimated_jpy += entry.estimated_jpy || 0;
    });
    return Object.values(groups).sort((a, b) =>
      a.user_email.localeCompare(b.user_email) || a.group_index - b.group_index
    );
  } else {
    // Simple grouping by user
    const groups = {};
    entries.forEach(entry => {
      const key = entry.user_email;
      if (!groups[key]) {
        groups[key] = {
          key,
          user_email: entry.user_email,
          user_name: entry.user_name,
          group_label: entry.user_name || entry.user_email,
          final_address: entry.final_address,
          transit_shipping_method_id: normalizeMethodId(entry.transit_shipping_method_id),
          transit_shipping_method: entry.transit_shipping_method,
          selected_addons: entry.selected_addons || [],
          entries: [],
          estimated_jpy: 0,
        };
      }
      groups[key].entries.push(entry);
      groups[key].estimated_jpy += entry.estimated_jpy || 0;
    });
    return Object.values(groups);
  }
}

// ─── Batch list item ──────────────────────────────────────────────────────────
function BatchListItem({ batch, selected, onClick }) {
  const methodId = normalizeMethodId(batch.transit_shipping_method_id);
  const isStorage = methodId === '__storage__';
  const isPickup = methodId === '__pickup__';
  const methodName = isStorage ? '暂存' : isPickup ? '自取' : (batch.transit_shipping_method || '中转发货');

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors border ${
        selected
          ? 'border-indigo-300 bg-indigo-50 shadow-sm'
          : 'border-transparent hover:bg-gray-50 hover:border-gray-200'
      }`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold ${
        isStorage ? 'bg-indigo-100 text-indigo-700' :
        isPickup ? 'bg-teal-100 text-teal-700' :
        'bg-gray-100 text-gray-600'
      }`}>
        {(batch.user_name || batch.user_email || '?')[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-gray-800 truncate">
            {batch.group_label || batch.user_name || batch.user_email}
          </p>
          {isStorage && <Badge className="bg-indigo-100 text-indigo-700 text-xs shrink-0">暂存</Badge>}
          {isPickup && <Badge className="bg-teal-100 text-teal-700 text-xs shrink-0">自取</Badge>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-500">{batch.entries.length} 件</span>
          {!isStorage && !isPickup && (
            <span className="text-xs text-blue-600 flex items-center gap-0.5">
              <Truck className="w-2.5 h-2.5" />{methodName}
            </span>
          )}
          {(batch.selected_addons || []).length > 0 && (
            <span className="text-xs text-yellow-600 flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5" />{batch.selected_addons.length}项增值
            </span>
          )}
        </div>
      </div>
      <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-colors ${selected ? 'text-indigo-500' : 'text-gray-300'}`} />
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TransitPoolWork() {
  const { pool_code } = useParams();
  const navigate = useNavigate();
  const { user } = useCurrentUser();

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState(null);
  const [entries, setEntries] = useState([]);
  const [location, setLocation] = useState(null);
  const [transitMethods, setTransitMethods] = useState([]);
  const [selectedBatchKey, setSelectedBatchKey] = useState(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'tenant_admin' || user?.role === 'platform_admin';
  const isManager = isAdmin || (location && location.manager_email === user?.email);

  const fetchData = async () => {
    setLoading(true);
    try {
      debugger
      // const res = await base44.functions.invoke('getTransitPoolWorkData', { request_id: pool_code });
      const res = {};
      // if (!res.data?.request) { navigate('/Home'); return; }
      setRequest(res?.request || {});
      setEntries(res?.entries || []);
      setLocation(res?.location || {});
      setTransitMethods(res?.transitMethods || []);
    } catch (error) {
      alert('加载失败：' + error.message);
      // navigate('/Home');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !pool_code) return;
    fetchData();
  }, [user, pool_code]);

  const activeEntries = useMemo(() => entries.filter(e => e.status !== 'cancelled'), [entries]);
  const userGroups = useMemo(() => buildUserGroupList(activeEntries, request), [activeEntries, request]);
  const selectedBatch = userGroups.find(g => g.key === selectedBatchKey) || null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!request) return null;

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" />返回
        </Button>
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />
            {request.title || request.pool_code || '单箱工作面板'}
          </h1>
          {location && (
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3" />{location.name}
            </p>
          )}
        </div>
      </div>

      {/* Master-Detail layout */}
      <div className="flex gap-4 items-start">
        {/* ── Left Column ─────────────────────────────────────────────────────── */}
        <div className="w-80 flex-shrink-0 space-y-4">
          {/* Pool info */}
          <PoolInfoPanel
            pool={request}
            location={location}
            userGroups={userGroups}
            isAdmin={isAdmin}
            isManager={isManager}
            onUpdate={fetchData}
          />

          {/* Batch list */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-700">参团用户批次</span>
              <span className="ml-auto text-xs text-gray-400">{userGroups.length} 个批次</span>
            </div>
            <div className="p-2 space-y-0.5">
              {userGroups.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">暂无活跃批次</p>
              ) : (
                userGroups.map(batch => (
                  <BatchListItem
                    key={batch.key}
                    batch={batch}
                    selected={selectedBatchKey === batch.key}
                    onClick={() => setSelectedBatchKey(batch.key === selectedBatchKey ? null : batch.key)}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Right Column (Detail Panel) ──────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden min-h-[400px]">
            <BatchDetailPanel
              batch={selectedBatch}
              pool={request}
              transitMethods={transitMethods}
              isManager={isManager}
              onSaved={() => {
                fetchData();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}