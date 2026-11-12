/**
 * UserGroupCard - 显示用户分组（含批次/地址组）及其订单详情
 * 用于中转地工作面板，展示每个用户的订单集合
 * 支持 per_user_groups 批次（同一用户不同地址/运输方式/增值服务）
 */
import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Package, MapPin, Edit2, Save, X, Image as ImageIcon, Truck, Star, Layers, ClipboardCheck, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getCountry } from "@/lib/countries";

export default function UserGroupCard({ userEntry, orders, transitMethods = [], pool, isManager, onAddressUpdate, onPackingImageUpload, onEditTransitShipping }) {
  const [expanded, setExpanded] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressData, setAddressData] = useState(userEntry.final_address || {});
  const [saving, setSaving] = useState(false);

  const handleSaveAddress = async () => {
    setSaving(true);
    try {
      await onAddressUpdate(userEntry.id, addressData);
      setEditingAddress(false);
    } catch (error) {
      alert('保存失败：' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await onPackingImageUpload(userEntry.id, file);
    } catch (error) {
      alert('上传失败：' + error.message);
    }
  };

  // Read existing transit_shipping_info_per_user for this batch
  const savedTransitShipping = useMemo(() => {
    if (!pool?.transit_shipping_info_per_user || userEntry.group_index === undefined) return null;
    const userInfo = pool.transit_shipping_info_per_user.find(
      info => info.user_email === userEntry.user_email
    );
    if (!userInfo?.address_groups) return null;
    // Match by order IDs
    const myOrderIds = orders.map(o => o.order_id || o.id).filter(Boolean).sort();
    return userInfo.address_groups.find(ag => {
      const agOrderIds = (ag.order_ids || []).sort();
      return JSON.stringify(agOrderIds) === JSON.stringify(myOrderIds);
    }) || null;
  }, [pool?.transit_shipping_info_per_user, userEntry.user_email, userEntry.group_index, orders]);

  // Normalize transit method id: legacy "pickup"/"storage" → "__pickup__"/"__storage__"
  const normalizeTransitMethodId = (id) => {
    if (id === 'pickup') return '__pickup__';
    if (id === 'storage') return '__storage__';
    return id || '';
  };

  // Batch/group info
  const hasBatchInfo = userEntry.group_index !== undefined;
  const batchIndex = userEntry.group_index ?? 0;
  const hasAddress = userEntry.final_address && userEntry.final_address.recipient_name;
  const rawTransitMethodId = normalizeTransitMethodId(userEntry.transit_shipping_method_id);
  const transitMethodName = rawTransitMethodId === '__pickup__' ? '自取'
    : rawTransitMethodId === '__storage__' ? '暂存'
    : userEntry.transit_shipping_method
    || (rawTransitMethodId && transitMethods.find(m => m.id === rawTransitMethodId)?.name)
    || '';
  const isPickupOrStorage = rawTransitMethodId === '__pickup__' || rawTransitMethodId === '__storage__';
  const addons = userEntry.selected_addons || [];

  // Badge label for this batch
  const batchLabel = userEntry.group_label
    ? userEntry.group_label
    : hasBatchInfo
      ? `批次 ${batchIndex + 1}`
      : null;

  return (
    <Card className="border-gray-200 hover:border-indigo-300 transition-colors">
      <CardContent className="p-0">
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-indigo-700">
                  {(userEntry.user_name || userEntry.user_email || '?')[0].toUpperCase()}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-medium text-gray-900">
                    {userEntry.user_name || userEntry.user_email}
                  </p>
                  {batchLabel && (
                    <Badge className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200 font-normal">
                      <Layers className="w-2.5 h-2.5 mr-1" />{batchLabel}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <p className="text-xs text-gray-500">
                    {orders.length} 件 · ¥{Math.round(userEntry.estimated_jpy).toLocaleString()}
                  </p>
                  {transitMethodName && (
                    <span className="text-xs text-blue-600 flex items-center gap-0.5">
                      <Truck className="w-3 h-3" />{transitMethodName}
                    </span>
                  )}
                  {addons.length > 0 && (
                    <span className="text-xs text-yellow-700 flex items-center gap-0.5">
                      <Star className="w-3 h-3" />{addons.map(a => a.name).join('、')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isPickupOrStorage ? (
              <Badge className={`text-xs ${rawTransitMethodId === '__pickup__' ? 'bg-teal-100 text-teal-700' : 'bg-indigo-100 text-indigo-700'}`}>
                <Truck className="w-3 h-3 mr-1" />
                {rawTransitMethodId === '__pickup__' ? '自取' : '暂存'}
              </Badge>
            ) : hasAddress ? (
              <Badge variant="outline" className="text-xs">
                <MapPin className="w-3 h-3 mr-1 text-green-600" />
                已填写地址
              </Badge>
            ) : (
              <Badge className="text-xs bg-yellow-100 text-yellow-700">
                <MapPin className="w-3 h-3 mr-1" />
                待填写地址
              </Badge>
            )}
            {userEntry.packing_image_urls?.length > 0 && (
              <Badge variant="outline" className="text-xs">
                <ImageIcon className="w-3 h-3 mr-1" />
                {userEntry.packing_image_urls.length} 图
              </Badge>
            )}
          </div>
        </div>

        {/* Expanded Content */}
        {expanded && (
          <div className="border-t border-gray-100 p-4 space-y-4">

            {/* Batch metadata: user-specified preferences */}
            {hasBatchInfo && (transitMethodName || addons.length > 0 || userEntry.note) && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2.5 space-y-1.5">
                <p className="text-xs font-medium text-indigo-700 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" />{batchLabel || '批次信息'}
                </p>
                {transitMethodName && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-700">
                    <Truck className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-gray-500">用户指定中转方式：</span>{transitMethodName}
                  </div>
                )}
                {addons.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-700 flex-wrap">
                    <Star className="w-3.5 h-3.5 text-yellow-500" />
                    <span className="text-gray-500">增值服务：</span>
                    {addons.map((a, i) => {
                      const hasCustom = a.custom_fee !== null && a.custom_fee !== undefined;
                      const originalFee = parseFloat(a.fee) || 0;
                      const effectiveFee = hasCustom ? (parseFloat(a.custom_fee) || 0) : originalFee;
                      const currency = a.fee_currency || 'JPY';
                      return (
                        <span key={i} className="bg-yellow-50 border border-yellow-200 text-yellow-700 rounded px-1.5 py-0.5">
                          {a.name || a.service_name}
                          {hasCustom && originalFee > 0 && (
                            <span className="line-through text-yellow-500/60 ml-1">+{currency} {originalFee}</span>
                          )}
                          {effectiveFee > 0 && <span className="ml-1">+{currency} {effectiveFee}</span>}
                        </span>
                      );
                    })}
                  </div>
                )}
                {userEntry.note && (
                  <p className="text-xs text-gray-600 italic">备注：{userEntry.note}</p>
                )}
              </div>
            )}

            {/* Saved transit shipping info (from transit_shipping_info_per_user) */}
            {hasBatchInfo && (
              <div className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${savedTransitShipping?.transit_tracking_number ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-700 flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5 text-green-600" />
                    中转地发货信息
                    {savedTransitShipping?.transit_tracking_number ? (
                      <Badge className="ml-1 text-xs bg-green-100 text-green-700 font-normal">已填写</Badge>
                    ) : (
                      <Badge className="ml-1 text-xs bg-gray-100 text-gray-500 font-normal">待填写</Badge>
                    )}
                  </p>
                  {isManager && onEditTransitShipping && (
                    <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => onEditTransitShipping(userEntry)}>
                      <Edit2 className="w-3 h-3 mr-1" />{savedTransitShipping?.transit_tracking_number ? '编辑' : '填写'}
                    </Button>
                  )}
                </div>
                {savedTransitShipping?.transit_tracking_number ? (
                  <div className="space-y-1">
                    {savedTransitShipping.transit_shipping_method && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-700">
                        <Truck className="w-3 h-3 text-green-500" />
                        <span className="text-gray-500">运输方式：</span>{savedTransitShipping.transit_shipping_method}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-gray-700">
                      <ClipboardCheck className="w-3 h-3 text-blue-500" />
                      <span className="text-gray-500">单号：</span>
                      <span className="font-mono">{savedTransitShipping.transit_tracking_number}</span>
                    </div>
                    {savedTransitShipping.transit_fee_jpy > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-700">
                        <DollarSign className="w-3 h-3 text-green-500" />
                        <span className="text-gray-500">运费：</span>¥{savedTransitShipping.transit_fee_jpy.toLocaleString()}
                      </div>
                    )}
                    {savedTransitShipping.transit_note && (
                      <p className="text-xs text-gray-500 italic">备注：{savedTransitShipping.transit_note}</p>
                    )}
                    {savedTransitShipping.transit_image_urls?.length > 0 && (
                      <div className="flex gap-1.5 mt-1">
                        {savedTransitShipping.transit_image_urls.map((url, i) => (
                          <img key={i} src={url} alt={`凭证${i+1}`} className="w-12 h-12 object-cover rounded border" />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">
                    {isManager && onEditTransitShipping ? '点击"填写"录入中转地发货信息' : '等待中转地填写发货信息'}
                  </p>
                )}
              </div>
            )}

            {/* Address Section — hidden for pickup/storage */}
            {isPickupOrStorage ? (
              <div className={`rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-2 ${rawTransitMethodId === '__pickup__' ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'}`}>
                <Truck className="w-3.5 h-3.5" />
                {rawTransitMethodId === '__pickup__' ? '自取 — 用户将直接到中转地取货，无需填写最终收货地址' : '暂存 — 货物将在中转地暂存，无需填写最终收货地址'}
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    最终收货地址
                  </h4>
                  {!editingAddress && (
                    <Button size="sm" variant="ghost" onClick={() => setEditingAddress(true)} className="h-7 text-xs">
                      <Edit2 className="w-3 h-3 mr-1" />编辑
                    </Button>
                  )}
                </div>
                {editingAddress ? (
                  <div className="space-y-2 bg-gray-50 p-3 rounded-lg">
                    {[
                      { label: '收件人', key: 'recipient_name' },
                      { label: '电话', key: 'phone' },
                      { label: '国家', key: 'country' },
                      { label: '地址行 1', key: 'addr1' },
                      { label: '地址行 2', key: 'addr2' },
                      { label: '地址行 3', key: 'addr3' },
                      { label: '州/省', key: 'state' },
                    ].map(({ label, key }) => (
                      <div key={key}>
                        <Label className="text-xs">{label}</Label>
                        <Input
                          value={addressData[key] || ''}
                          onChange={(e) => setAddressData({ ...addressData, [key]: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                    ))}
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" onClick={handleSaveAddress} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-xs h-8">
                        {saving ? <span className="animate-spin">⏳</span> : <Save className="w-3 h-3 mr-1" />}保存
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingAddress(false)} className="text-xs h-8">取消</Button>
                    </div>
                  </div>
                ) : hasAddress ? (
                  <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                    <p className="font-medium">{addressData.recipient_name}</p>
                    {addressData.phone && <p className="text-gray-600 mt-1">{addressData.phone}</p>}
                    <p className="text-gray-600 mt-1">{getCountry(addressData.country)?.name || addressData.country}</p>
                    {addressData.addr1 && <p className="text-gray-600">{addressData.addr1}</p>}
                    {addressData.addr2 && <p className="text-gray-600">{addressData.addr2}</p>}
                    {addressData.addr3 && <p className="text-gray-600">{addressData.addr3}</p>}
                    {addressData.state && <p className="text-gray-600">{addressData.state}</p>}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400 italic bg-gray-50 p-3 rounded-lg">暂无地址信息</div>
                )}
              </div>
            )}

            {/* Packing Images Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />打包图片
                </h4>
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                    <span>上传图片</span>
                  </Button>
                </label>
              </div>
              {userEntry.packing_image_urls?.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto">
                  {userEntry.packing_image_urls.map((url, idx) => (
                    <img key={idx} src={url} alt={`打包图${idx + 1}`} className="w-20 h-20 object-cover rounded border flex-shrink-0" />
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-400 italic">暂无打包图片</div>
              )}
            </div>

            {/* Orders List */}
            {orders.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">订单列表（{orders.length}）</h4>
                <div className="space-y-2">
                  {orders.map(order => (
                    <div key={order.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-700">{order.product_name}</span>
                      </div>
                      <span className="text-gray-600">¥{Math.round(order.estimated_jpy || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}