/**
 * UserGroupHeader - Displays the header for a user group in a shipping pool
 * Shows: user avatar/name, order count, weight, addons, transit method (with pickup/storage highlighting)
 */
import { Star, Truck, Edit2, RotateCcw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import UserProfileLink from "@/components/common/UserProfileLink";

export default function UserGroupHeader({
  userData,
  displayName,
  groupOrders,
  groupWeight,
  uniqueGroupAddons,
  transitMethodId,
  transitMethodName,
  canEditPrefs,
  editingUserPrefs,
  openUserPrefsEditor,
  setEditingUserPrefs,
  isRewarehousePool,
  isMyGroup,
  pendingEdits,
  rewarehouseSelectedIds,
  setRewarehouseSelectedIds,
  setShowBulkRewarehouse,
}) {
  const elig = isRewarehousePool && isMyGroup ? groupOrders.filter(o => !pendingEdits.some(r => r.order_id === o.id && r.is_rewarehouse_request)) : [];
  const allSel = elig.every(o => rewarehouseSelectedIds.includes(o.id));
  const selCount = rewarehouseSelectedIds.filter(id => elig.find(o => o.id === id)).length;

  return (
    <div className="flex items-start gap-2 px-1 mb-1">
      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
        {userData.avatar ? (
          <img src={userData.avatar } alt={displayName} className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-4 h-4 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs font-medium flex-shrink-0">
            {displayName[0]?.toUpperCase()}
          </div>
        )}
        <UserProfileLink email={userData.email || userData.user_email} name={displayName} className="text-xs font-medium text-gray-600" />
        <span className="text-xs text-gray-400">{groupOrders.length} 件 · {groupWeight}g</span>
      </div>
      <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
        {uniqueGroupAddons.map((a, i) => (
          <span key={i} className="inline-flex items-center gap-0.5 text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 rounded px-1.5 py-0.5">
            <Star className="w-2.5 h-2.5" />{a.name}
          </span>
        ))}
        {transitMethodName && (
          <span className={`inline-flex items-center gap-0.5 text-xs rounded px-1.5 py-0.5 border ${
            transitMethodId === '__pickup__' ? 'bg-purple-100 border-purple-200 text-purple-700 font-medium' :
            transitMethodId === '__storage__' ? 'bg-orange-100 border-orange-200 text-orange-700 font-medium' :
            'bg-blue-50 border-blue-200 text-blue-700'
          }`}>
            <Truck className="w-2.5 h-2.5" />{transitMethodName}
          </span>
        )}
      </div>
      {canEditPrefs && (
        <button
          onClick={() => editingUserPrefs ? setEditingUserPrefs(false) : openUserPrefsEditor()}
          className="flex-shrink-0 p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 transition-colors"
          title="编辑我的发货偏好">
          <Edit2 className="w-3.5 h-3.5" />
        </button>
      )}
      {isRewarehousePool && isMyGroup && elig.length > 0 && (
        <div className="flex items-center gap-2 px-1 mb-1 mt-1">
          <Checkbox checked={allSel} onCheckedChange={v => {
            const ids = elig.map(o => o.id);
            setRewarehouseSelectedIds(prev => v ? [...new Set([...prev, ...ids])] : prev.filter(id => !ids.includes(id)));
          }} />
          <span className="text-xs text-gray-500">全选我的包裹</span>
          {selCount > 0 && (
            <Button size="sm" className="h-6 text-xs px-2 bg-orange-600 hover:bg-orange-700 ml-auto gap-1" onClick={() => setShowBulkRewarehouse(true)}>
              <RotateCcw className="w-3 h-3" />申请再入库 ({selCount})
            </Button>
          )}
        </div>
      )}
    </div>
  );
}