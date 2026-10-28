/**
 * PoolInfoPanel - 发货申请详情信息面板（用于 TransitPoolWork 左侧顶部）
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ImageWithViewer } from "@/components/common/ImageViewer";
import {
  Package, Truck, Scale, Calendar, MapPin, Hash, Clock, Edit2, Save, X,
  Tag, Weight, DollarSign, Image as ImageIcon, Layers, Users, User, CreditCard
} from "lucide-react";
import { base44 } from "@/api/base44Client";

const STATUS_CONFIG = {
  pending:                       { label: "待处理",    color: "bg-amber-100 text-amber-700" },
  open:                          { label: "招募中",    color: "bg-blue-100 text-blue-700" },
  awaiting_payment:              { label: "待付款",    color: "bg-orange-100 text-orange-700" },
  awaiting_payment_confirmation: { label: "待确认付款", color: "bg-blue-100 text-blue-700" },
  ready_to_ship:                 { label: "待发货",    color: "bg-lime-100 text-lime-700" },
  transited:                     { label: "已向中转地发出", color: "bg-indigo-100 text-indigo-700" },
  shipped:                       { label: "已发货",    color: "bg-green-100 text-green-700" },
  delivered:                     { label: "已签收",    color: "bg-emerald-100 text-emerald-700" },
  cancelled:                     { label: "已取消",    color: "bg-red-100 text-red-600" },
  completed:                     { label: "已完成",    color: "bg-green-100 text-green-700" },
};

function InfoRow({ icon: Icon, label, value, mono }) { // eslint-disable-line
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
      <div>
        <span className="text-gray-500 text-xs">{label}：</span>
        <span className={`text-gray-800 ${mono ? 'font-mono' : ''}`}>{value}</span>
      </div>
    </div>
  );
}

export default function PoolInfoPanel({ pool, location, userGroups, isAdmin, isManager, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  console.log(pool)
  const statusCfg = STATUS_CONFIG[pool.status] || { label: pool.status || '进行中', color: 'bg-gray-100 text-gray-700' };
  const isRequest = !!pool.title && !pool.pool_code; // GroupBuyRequest has title, ShippingPool has pool_code
  const totalWeight = (pool.total_weight_g || 0);
  const participantEmails = [...new Set((userGroups || []).map(g => g.user_email))];

  const handleEdit = () => {
    setEditData({
      admin_note: pool.admin_note || '',
      admin_packing_note: pool.admin_packing_note || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isRequest) {
        await base44.functions.invoke('manageGroupBuy', {
          action: 'update_request',
          request_id: pool.id,
          admin_note: editData.admin_note,
        });
      } else {
        await base44.functions.invoke('updateTransitLocationPool', {
          pool_id: pool.id,
          admin_note: editData.admin_note,
          admin_packing_note: editData.admin_packing_note,
        });
      }
      setEditing(false);
      onUpdate?.();
    } catch (err) {
      alert('保存失败：' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`text-xs ${statusCfg.color}`}>{statusCfg.label}</Badge>
              {pool.consolidation_type === 'transit' && (
                <Badge variant="outline" className="text-xs">中转拼邮</Badge>
              )}
              {pool.is_private && <span className="text-xs text-gray-400">🔒 不公开</span>}
            </div>
            <h2 className="text-base font-bold text-gray-900 mt-1 truncate">
              {pool.title || pool.pool_code || `发货申请 #${pool.id?.slice(-6).toUpperCase()}`}
            </h2>
            {pool.pool_code && pool.title && (
              <p className="text-xs font-mono text-gray-400 mt-0.5">{pool.pool_code}</p>
            )}
          </div>
          {(isAdmin || isManager) && (
            <Button size="sm" variant="ghost" className="h-7 px-2 flex-shrink-0" onClick={editing ? () => setEditing(false) : handleEdit}>
              {editing ? <X className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {/* Core info grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-50 rounded-lg px-2.5 py-2">
            <p className="text-gray-400">参与用户</p>
            <p className="font-semibold text-gray-800 mt-0.5">{participantEmails.length} 人 · {(pool.order_ids || []).length} 件</p>
          </div>
          {totalWeight > 0 && (
            <div className="bg-gray-50 rounded-lg px-2.5 py-2">
              <p className="text-gray-400">预计总重量</p>
              <p className="font-semibold text-gray-800 mt-0.5">{(totalWeight / 1000).toFixed(2)} kg</p>
            </div>
          )}
          {pool.final_weight_g > 0 && (
            <div className="bg-green-50 rounded-lg px-2.5 py-2">
              <p className="text-gray-400">最终总重量</p>
              <p className="font-semibold text-green-700 mt-0.5">{pool.final_weight_g}g</p>
            </div>
          )}
          {pool.shipping_fee_jpy > 0 && (
            <div className="bg-orange-50 rounded-lg px-2.5 py-2">
              <p className="text-gray-400">国际运费</p>
              <p className="font-semibold text-orange-700 mt-0.5">¥{Math.round(pool.shipping_fee_jpy).toLocaleString()}</p>
            </div>
          )}
          {pool.transit_fee_jpy > 0 && (
            <div className="bg-blue-50 rounded-lg px-2.5 py-2">
              <p className="text-gray-400">中转运费</p>
              <p className="font-semibold text-blue-700 mt-0.5">¥{Math.round(pool.transit_fee_jpy).toLocaleString()}</p>
            </div>
          )}
          {pool.packing_fee_jpy > 0 && (
            <div className="bg-gray-50 rounded-lg px-2.5 py-2">
              <p className="text-gray-400">捆包手续费</p>
              <p className="font-semibold text-gray-800 mt-0.5">¥{Math.round(pool.packing_fee_jpy).toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* Detail rows */}
        <div className="space-y-1.5">
          <InfoRow icon={Hash} label="代号" value={pool.pool_code} mono />
          <InfoRow icon={Truck} label="运输方式" value={pool.shipping_method} />
          <InfoRow icon={MapPin} label="中转地" value={pool.transit_location_name || location?.name} />
          <InfoRow icon={Tag} label="外箱" value={pool.box_template_name} />
          <InfoRow icon={Layers} label="外箱费用" value={pool.box_price_jpy > 0 ? `¥${Math.round(pool.box_price_jpy).toLocaleString()} JPY` : null} />
          <InfoRow icon={Calendar} label="计划发货" value={pool.scheduled_ship_date} />
          <InfoRow icon={Calendar} label="实际发货" value={pool.shipped_date} />
          <InfoRow icon={Hash} label="运单号" value={pool.tracking_number} mono />
          <InfoRow icon={Clock} label="创建时间" value={pool.created_date ? new Date(pool.created_date).toLocaleString('zh-CN') : null} />
          <InfoRow icon={User} label="创建者" value={pool.creator_name || pool.creator_email} />
        </div>

        {/* Fee breakdown per user (手续费分配) */}
        {(pool.fee_breakdown_per_user || []).length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5" />手续费分配情况
            </p>
            <div className="space-y-1">
              {pool.fee_breakdown_per_user.map((b, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1.5">
                  <span className="text-gray-600">{b.user_email}</span>
                  <span className="font-medium text-gray-800">¥{Math.round(b.total_jpy || b.personal_total_jpy || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-user payment status */}
        {(pool.per_user_payments || []).length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />参与用户付款情况
            </p>
            <div className="space-y-1">
              {pool.per_user_payments.map((p, i) => {
                const isPaid = p.payment_status === 'paid';
                const isAwait = p.payment_status === 'awaiting_confirmation';
                return (
                  <div key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1.5">
                    <span className="text-gray-600 truncate flex-1">{p.user_email}</span>
                    <Badge className={`text-xs ml-2 ${isPaid ? 'bg-green-100 text-green-700' : isAwait ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                      {isPaid ? '已付款' : isAwait ? '待确认' : '未付款'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Packing images */}
        {(pool.packing_image_urls || []).length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
              <ImageIcon className="w-3.5 h-3.5" />捆包状态图片
            </p>
            <div className="flex flex-wrap gap-1.5">
              {pool.packing_image_urls.map((url, i) => (
                <ImageWithViewer key={i} src={url} alt="捆包图片">
                  <img src={url} alt="" className="w-14 h-14 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity" />
                </ImageWithViewer>
              ))}
            </div>
          </div>
        )}

        {/* Label images */}
        {(pool.label_image_urls || []).length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" />发货面单图片
            </p>
            <div className="flex flex-wrap gap-1.5">
              {pool.label_image_urls.map((url, i) => (
                <ImageWithViewer key={i} src={url} alt="发货面单">
                  <img src={url} alt="" className="w-14 h-14 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity" />
                </ImageWithViewer>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {pool.admin_packing_note && (
          <div className="bg-blue-50 border border-blue-100 rounded px-2.5 py-2 text-xs">
            <p className="text-blue-500 font-medium mb-0.5">捆包备注</p>
            <p className="text-blue-800 whitespace-pre-wrap">{pool.admin_packing_note}</p>
          </div>
        )}
        {pool.admin_note && (
          <div className="bg-yellow-50 border border-yellow-100 rounded px-2.5 py-2 text-xs">
            <p className="text-yellow-600 font-medium mb-0.5">管理员内部备注</p>
            <p className="text-yellow-800 whitespace-pre-wrap">{pool.admin_note}</p>
          </div>
        )}
        {pool.user_note && (
          <div className="bg-gray-50 border border-gray-100 rounded px-2.5 py-2 text-xs">
            <p className="text-gray-400 font-medium mb-0.5">用户备注</p>
            <p className="text-gray-700 whitespace-pre-wrap">{pool.user_note}</p>
          </div>
        )}

        {/* Editing form */}
        {editing && (
          <div className="border border-blue-200 rounded-xl overflow-hidden">
            <div className="bg-blue-50 px-3 py-2 border-b border-blue-100 flex items-center justify-between">
              <span className="text-xs font-medium text-blue-700">编辑备注</span>
            </div>
            <div className="p-3 space-y-2">
              <div>
                <Label className="text-xs text-gray-500">管理员内部备注</Label>
                <Textarea rows={2} className="mt-1 text-sm" value={editData.admin_note}
                  onChange={e => setEditData(d => ({ ...d, admin_note: e.target.value }))} />
              </div>
              {!isRequest && (
                <div>
                  <Label className="text-xs text-gray-500">捆包备注</Label>
                  <Textarea rows={2} className="mt-1 text-sm" value={editData.admin_packing_note}
                    onChange={e => setEditData(d => ({ ...d, admin_packing_note: e.target.value }))} />
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(false)}>取消</Button>
                <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving}>
                  <Save className="w-3 h-3 mr-1" />{saving ? '保存中...' : '保存'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}