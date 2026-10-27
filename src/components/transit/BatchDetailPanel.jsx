/**
 * BatchDetailPanel - 右侧 Master-Detail 面板
 * 根据批次类型（普通运输 / 暂存 / 自取）显示不同内容
 */
import { useState, useEffect } from "react";
import { X, MapPin, Truck, Star, Package, Upload, Save, Image as ImageIcon, CheckCircle, Calendar, Info, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { base44 } from "@/api/base44Client";
import { getCountry } from "@/lib/countries";
import AdminOrderEditModal from "@/components/admin/AdminOrderEditModal";

function AddressBlock({ address }) {
  if (!address || !address.recipient_name) return (
    <div className="text-xs text-gray-400 italic bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">暂无收货地址</div>
  );
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-xs space-y-0.5">
      <p className="font-semibold text-blue-800">{address.recipient_name}</p>
      {address.phone && <p className="text-blue-600">{address.phone}</p>}
      <p className="text-blue-700">{getCountry(address.country)?.name || address.country}</p>
      {address.addr1 && <p className="text-blue-700">{address.addr1}</p>}
      {address.addr2 && <p className="text-blue-700">{address.addr2}</p>}
      {address.addr3 && <p className="text-blue-700">{address.addr3}</p>}
      {address.state && <p className="text-blue-600">{address.state}</p>}
    </div>
  );
}

function AddonsBlock({ addons }) {
  if (!addons || addons.length === 0) return (
    <div className="text-xs text-gray-400 italic">无增值服务</div>
  );
  return (
    <div className="flex flex-wrap gap-1.5">
      {addons.map((a, i) => (
        <span key={i} className="inline-flex items-center gap-1 text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 rounded px-2 py-0.5">
          <Star className="w-2.5 h-2.5" />{a.service_name}{a.fee > 0 ? ` +${a.fee_currency || 'JPY'} ${a.fee}` : ''}
        </span>
      ))}
    </div>
  );
}

// ─── 普通运输面板 ───────────────────────────────────────────────────────────────
function TransitShippingPanel({ batch, pool, transitMethods, isManager, onSaved }) {
  // Get default method from batch's pre-shipment config (user's selected transit method)
  const defaultMethod = batch.transit_shipping_method_name || 
                        transitMethods.find(m => m.id === batch.transit_shipping_method_id)?.name || 
                        '';
  const [formData, setFormData] = useState({
    transit_shipping_method: defaultMethod,
    transit_tracking_number: '',
    transit_fee_jpy: '',
    transit_note: '',
    transit_image_urls: [],
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load existing saved shipping info
  useEffect(() => {
    if (!pool?.transit_shipping_info_per_user) return;
    const userInfo = pool.transit_shipping_info_per_user.find(i => i.user_email === batch.user_email);
    if (!userInfo?.address_groups) return;
    const myOrderIds = batch.entries.map(e => e.order_id || e.id).filter(Boolean).sort();
    const existing = userInfo.address_groups.find(ag => {
      return JSON.stringify((ag.order_ids || []).sort()) === JSON.stringify(myOrderIds);
    });
    if (existing) {
      setFormData({
        transit_shipping_method: existing.transit_shipping_method || defaultMethod,
        transit_tracking_number: existing.transit_tracking_number || '',
        transit_fee_jpy: existing.transit_fee_jpy || '',
        transit_note: existing.transit_note || '',
        transit_image_urls: existing.transit_image_urls || [],
      });
    }
  }, [pool?.id, batch.user_email]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (file_url) setFormData(p => ({ ...p, transit_image_urls: [...p.transit_image_urls, file_url] }));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const orderIds = batch.entries.map(e => e.order_id || e.id).filter(Boolean);
      await base44.functions.invoke('updateUserTransitShipping', {
        pool_id: pool.id,
        user_email: batch.user_email,
        order_ids: orderIds,
        shipping_data: {
          ...formData,
          transit_fee_jpy: formData.transit_fee_jpy ? Number(formData.transit_fee_jpy) : 0,
        },
      });
      onSaved?.();
    } catch (err) {
      alert('保存失败：' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Address */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />最终收货地址</p>
        <AddressBlock address={batch.final_address} />
      </div>

      {/* Addons */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1"><Star className="w-3.5 h-3.5" />增值服务</p>
        <AddonsBlock addons={batch.selected_addons} />
      </div>

      {/* Shipping Form */}
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Truck className="w-4 h-4 text-indigo-500" />中转地发货信息</p>

        <div>
          <Label className="text-xs text-gray-500">发货方式</Label>
          {transitMethods.length > 0 ? (
            <select
              className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm bg-white"
              value={formData.transit_shipping_method}
              onChange={e => setFormData(p => ({ ...p, transit_shipping_method: e.target.value }))}
            >
              <option value="">请选择</option>
              {transitMethods.map(m => (
                <option key={m.id} value={m.name}>{m.name}</option>
              ))}
            </select>
          ) : (
            <Input className="mt-1 text-sm" value={formData.transit_shipping_method}
              onChange={e => setFormData(p => ({ ...p, transit_shipping_method: e.target.value }))}
              placeholder="填写中转发货方式" />
          )}
        </div>

        <div>
          <Label className="text-xs text-gray-500">运输单号</Label>
          <Input className="mt-1 text-sm font-mono" value={formData.transit_tracking_number}
            onChange={e => setFormData(p => ({ ...p, transit_tracking_number: e.target.value }))}
            placeholder="填写运单号" />
        </div>

        <div>
          <Label className="text-xs text-gray-500">中转运费 (JPY)</Label>
          <Input className="mt-1 text-sm" type="number" value={formData.transit_fee_jpy}
            onChange={e => setFormData(p => ({ ...p, transit_fee_jpy: e.target.value }))}
            placeholder="0" />
        </div>

        <div>
          <Label className="text-xs text-gray-500">中转人备注</Label>
          <Textarea className="mt-1 text-sm" rows={2} value={formData.transit_note}
            onChange={e => setFormData(p => ({ ...p, transit_note: e.target.value }))}
            placeholder="填写备注" />
        </div>

        <div>
          <Label className="text-xs text-gray-500 mb-1.5 block">中转地发货图片</Label>
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
            <div className="flex items-center gap-2 text-xs text-indigo-600 hover:text-indigo-800 border border-dashed border-indigo-200 rounded-lg px-3 py-2 hover:border-indigo-400 transition-colors">
              <Upload className="w-3.5 h-3.5" />{uploading ? '上传中...' : '上传图片'}
            </div>
          </label>
          {formData.transit_image_urls.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5 mt-2">
              {formData.transit_image_urls.map((url, i) => (
                <div key={i} className="relative group">
                  <img src={url} alt={`发货图${i+1}`} className="w-full h-16 object-cover rounded border" />
                  <button
                    onClick={() => setFormData(p => ({ ...p, transit_image_urls: p.transit_image_urls.filter((_, j) => j !== i) }))}
                    className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {isManager && (
          <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />{saving ? '保存中...' : '保存发货信息'}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── 暂存面板 ────────────────────────────────────────────────────────────────
function StorageBatchPanel({ batch, pool, isManager, onSaved }) {
  const [storageUntil, setStorageUntil] = useState('');
  const [saving, setSaving] = useState(false);

  // Check if this specific batch's orders are already in storage mode
  const storageConfirmed = batch.entries.every(e => {
    const order = e.order_details;
    return order?.order_status === 'in_storage' || order?.order_status === 'notified_shipment';
  });

  const handleConfirmStorage = async () => {
    setSaving(true);
    try {
      const orderIds = batch.entries.map(e => e.order_id || e.id).filter(Boolean);
      await base44.functions.invoke('updateTransitPoolShipment', {
        request_id: pool.id,
        action: 'confirm_storage_batch',
        order_ids: orderIds,
        storage_until: storageUntil || null,
        user_email: batch.user_email,
      });
      onSaved?.();
    } catch (err) {
      alert('操作失败：' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Addons */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1"><Star className="w-3.5 h-3.5" />增值服务</p>
        <AddonsBlock addons={batch.selected_addons} />
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2.5 text-xs text-indigo-700 space-y-1">
        <p className="font-medium flex items-center gap-1"><Info className="w-3.5 h-3.5" />暂存批次说明</p>
        <p>确认暂存后，该批次订单将进入「暂存中」状态，在用户「我的订单」页面中显示"目前暂存于 {pool.transit_location_name || '中转地'}"。</p>
        <p>用户可随时从我的订单页选择暂存中的订单，指定收货地址后发起中转地发货申请。</p>
      </div>

      {isManager && (
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-semibold text-gray-700">确认暂存</p>
          <div>
            <Label className="text-xs text-gray-500">暂存期限（不填则无期限）</Label>
            <Input type="date" className="mt-1 text-sm" value={storageUntil}
              onChange={e => setStorageUntil(e.target.value)} />
          </div>
          <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={handleConfirmStorage} disabled={saving}>
            <CheckCircle className="w-4 h-4 mr-2" />{saving ? '处理中...' : '确认暂存此批次订单'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── 自取面板 ────────────────────────────────────────────────────────────────
function PickupBatchPanel({ batch, pool, isManager, onSaved }) {
  const [timeSlot, setTimeSlot] = useState('');
  const [saving, setSaving] = useState(false);

  const handleConfirmPickup = async () => {
    setSaving(true);
    try {
      const orderIds = batch.entries.map(e => e.order_id || e.id).filter(Boolean);
      await base44.functions.invoke('updateTransitPoolShipment', {
        request_id: pool.id,
        action: 'confirm_pickup_batch',
        order_ids: orderIds,
        pickup_time_slot: timeSlot || null,
        user_email: batch.user_email,
      });
      onSaved?.();
    } catch (err) {
      alert('操作失败：' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Addons */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1"><Star className="w-3.5 h-3.5" />增值服务</p>
        <AddonsBlock addons={batch.selected_addons} />
      </div>

      <div className="bg-teal-50 border border-teal-100 rounded-lg px-3 py-2.5 text-xs text-teal-700 space-y-1">
        <p className="font-medium flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />自取说明</p>
        <p>用户将直接到中转地自行取货，无需填写最终收货地址。</p>
      </div>

      {/* Self-pickup management */}
      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-semibold text-gray-700">自取管理</p>
        {pool.transit_pickup_time_slot ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <p className="text-xs text-gray-500">约定自取时间段</p>
            <p className="font-medium text-gray-800 mt-0.5">{pool.transit_pickup_time_slot}</p>
            <div className="flex gap-2 mt-2">
              <Badge className={pool.transit_pickup_user_confirmed ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}>
                用户{pool.transit_pickup_user_confirmed ? '已确认' : '未确认'}
              </Badge>
              <Badge className={pool.transit_pickup_admin_confirmed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                管理员{pool.transit_pickup_admin_confirmed ? '已确认' : '未确认'}
              </Badge>
            </div>
          </div>
        ) : isManager ? (
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">约定自取时间段</Label>
            <div className="flex gap-2">
              <Input className="flex-1 text-sm" placeholder="例：2026-06-15 14:00-16:00"
                value={timeSlot} onChange={e => setTimeSlot(e.target.value)} />
              <Button onClick={handleConfirmPickup} disabled={saving || !timeSlot} className="shrink-0">
                {saving ? '...' : '约定'}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">等待中转地负责人约定自取时间</p>
        )}

        {pool.transit_pickup_completed && (
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            <CheckCircle className="w-4 h-4" />自取已完成
          </div>
        )}

        {isManager && pool.transit_pickup_time_slot && !pool.transit_pickup_completed && pool.transit_pickup_user_confirmed && pool.transit_pickup_admin_confirmed && (
          <Button className="w-full bg-green-600 hover:bg-green-700" onClick={async () => {
            setSaving(true);
            try {
              await base44.functions.invoke('updateTransitPoolPickup', { pool_id: pool.id, action: 'complete' });
              onSaved?.();
            } finally { setSaving(false); }
          }} disabled={saving}>
            <CheckCircle className="w-4 h-4 mr-2" />标记已自取
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── 订单详情弹窗（使用 AdminOrderEditModal） ──────────────────────────────────
function OrderDetailModal({ order, onClose, onSaved }) {
  if (!order) return null;
  return (
    <AdminOrderEditModal
      order={order}
      initialItemSizeTemplates={[]}
      onClose={onClose}
      onSaved={onSaved}
      onOpenPool={() => {}}
      shippingPools={[]}
      currentUser={{ email: "admin", role: "admin" }}
      userProfileMap={{}}
    />
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function BatchDetailPanel({ batch, pool, transitMethods, isManager, onClose, onSaved }) {
  const [orderDetail, setOrderDetail] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleOrderSaved = () => {
    setRefreshTrigger(prev => prev + 1);
    onSaved?.();
  };

  if (!batch) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 min-h-[300px]">
        <div className="text-center space-y-2">
          <Package className="w-10 h-10 mx-auto opacity-30" />
          <p className="text-sm">从左侧选择一个批次</p>
        </div>
      </div>
    );
  }

  const normalizeId = id => id === 'pickup' ? '__pickup__' : id === 'storage' ? '__storage__' : (id || '');
  const methodId = normalizeId(batch.transit_shipping_method_id);
  const isStorage = methodId === '__storage__';
  const isPickup = methodId === '__pickup__';

  const batchLabel = batch.group_label || `${batch.user_name || batch.user_email} 批次`;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-800 text-sm">{batchLabel}</p>
            {isStorage && <Badge className="bg-indigo-100 text-indigo-700 text-xs">暂存</Badge>}
            {isPickup && <Badge className="bg-teal-100 text-teal-700 text-xs">自取</Badge>}
            {!isStorage && !isPickup && <Badge className="bg-blue-100 text-blue-700 text-xs">中转发货</Badge>}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{batch.user_name || batch.user_email}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-200 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Orders list */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
            <Package className="w-3.5 h-3.5" />批次订单（{batch.entries.length} 件）
          </p>
          <div className="space-y-1.5">
            {batch.entries.map((entry, i) => {
              const order = entry;
              const canSeeDetail = !!order.product_name;
              return (
                <div key={entry.order_id || entry.id || i} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-2">
                  {(order.product_image_url || order.arrival_photo_url) && (
                    <img
                      src={order.product_image_url || order.arrival_photo_url}
                      className="w-9 h-9 object-cover rounded border flex-shrink-0"
                      alt=""
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{order.product_name || entry.product_name || '包裹'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {(order.estimated_jpy || entry.estimated_jpy) && (
                        <span className="text-xs text-gray-500">¥{Math.round(order.estimated_jpy || entry.estimated_jpy).toLocaleString()}</span>
                      )}
                      {(order.weight_g || entry.weight_g) && (
                        <span className="text-xs text-gray-400">{order.weight_g || entry.weight_g}g</span>
                      )}
                      {(order.selected_addons || []).length > 0 && (
                        <span className="text-xs text-yellow-600 flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5" />{(order.selected_addons || []).map(a => a.name).join('、')}
                        </span>
                      )}
                    </div>
                  </div>
                  {canSeeDetail && order.product_name && (
                    <button
                      onClick={() => setOrderDetail(order)}
                      className="flex-shrink-0 p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
                      title="查看详情"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Type-specific panels */}
        {isStorage ? (
          <StorageBatchPanel batch={batch} pool={pool} isManager={isManager} onSaved={onSaved} />
        ) : isPickup ? (
          <PickupBatchPanel batch={batch} pool={pool} isManager={isManager} onSaved={onSaved} />
        ) : (
          <TransitShippingPanel batch={batch} pool={pool} transitMethods={transitMethods} isManager={isManager} onSaved={onSaved} />
        )}
      </div>

      {orderDetail && (
        <OrderDetailModal 
          key={refreshTrigger}
          order={orderDetail} 
          onClose={() => setOrderDetail(null)} 
          onSaved={handleOrderSaved}
        />
      )}
    </div>
  );
}