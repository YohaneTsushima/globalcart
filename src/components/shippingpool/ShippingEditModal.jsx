/**
 * ShippingEditModal
 * Allows users to edit their shipping parameters for a notified-shipment order.
 * - Move to another pool
 * - Cancel shipment (return to in_warehouse)
 * Changes within 5 minutes of the original shipping request are instant.
 * Otherwise they require admin approval.
 */
import { useState, useEffect } from "react";
import { X, Truck, ArrowLeftRight, RotateCcw, Search, AlertCircle, CheckCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { updateOrder, shippingPoolApi, tenantEntity, fetchShippingPools } from "@/lib/tenantApi";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { format } from "date-fns";
import { toast } from "sonner";

export default function ShippingEditModal({ order, currentPool, currentUser, onClose, onSuccess }) {
  const [editType, setEditType] = useState("cancel_shipment");
  const [availablePools, setAvailablePools] = useState([]);
  const [poolSearch, setPoolSearch] = useState("");
  const [targetPoolId, setTargetPoolId] = useState("");
  const [userNote, setUserNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [isInstant, setIsInstant] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [apiError, setApiError] = useState("");

  useEffect(() => {
    // Countdown: check if within 5 minutes of the pool's last update
    let timer;
    if (currentPool?.updated_date) {
      
      // currentPool.updated_date = '2026-08-08T17:55:58.285';

      const FIVE_MIN = 5 * 60 * 1000;
      const updatedTime = new Date(currentPool.updated_date).getTime();

      const tick = () => {
        const age = Date.now() - updatedTime;
        const remaining = FIVE_MIN - age;
        if (remaining <= 0) {
          setIsInstant(false);
          setRemainingMs(0);
        } else {
          setIsInstant(true);
          setRemainingMs(remaining);
        }
      };

      tick();
      timer = setInterval(tick, 1000);
    }

    fetchShippingPools()
      .then(pools => {
        const eligible = pools.filter(p =>
          p.id !== currentPool?.id &&
          (p.status === "pending" || p.status === "processing")
        );
        
        setAvailablePools(eligible);
      })
      .catch(() => {});

    return () => { if (timer) clearInterval(timer); };
  }, [currentPool?.updated_date]);

  const filteredPools = availablePools.filter(p => {
    if (!poolSearch) return true;
    const q = poolSearch.toLowerCase();
    return (p.pool_code || "").toLowerCase().includes(q) ||
      (p.transit_location_name || "").toLowerCase().includes(q) ||
      (p.title || "").toLowerCase().includes(q);
  });

  const updateShippingPool = async (status, w, orderIds, editRequest) => {

    let param = {
      order_ids: orderIds,
      total_weight_g: Math.max(0, (currentPool.total_weight_g || 0) - w),
      order_status: status,
      handle_request: true,
      edit_request: editRequest
    };

    const res = await base44.functions.invoke('mutateTenantEntity/ShippingEditRequest/update', {
      entity: 'ShippingPool',
      action: 'update',
      id: currentPool.id,
      data: param
    });

    if (res.data?.code === 500 || res.data?.error) {
      return { error: res.data?.msg || res.data?.error || '操作失败' };
    }
    return { result: res.data?.result || res.data };
  }

  const handleEditRequest = async (url, param) => {
    const res = await base44.functions.invoke(url, {
      entity: 'ShippingPool',
      action: 'update',
      id: currentPool.id,
      data: param
    });

    if (res.data?.code === 500 || res.data?.edit_request?.error) {
      return { error: res.data?.edit_request?.error || res.data?.error || '操作失败' };
    }
    return { result: res.data?.result || res.data };
  }

  const handleSubmit = async () => {
    if (editType === "move_pool" && !targetPoolId) return;
    setSubmitting(true);
    const w = order.weight_g || 0;
    let updatedIds = [];
    let editRequest = {};
    let status = 'in_warehouse';
    const res = {};
    let url = '';
    let targetPool = null;

    //判断操作类型设置参数
    if(editType === 'cancel_shipment') {
      url = 'mutateTenantEntity/ShippingEditRequest/cancelShipment';
      updatedIds = (currentPool.order_ids || []).filter(id => id !== order.id);
    } else if(editType === 'move_pool') {
      url = 'mutateTenantEntity/ShippingEditRequest/movePool';
      targetPool = availablePools.find(p => p.id === targetPoolId);
      updatedIds = [...new Set([...(targetPool.order_ids || []), order.id])];
    }

    //
    // const targetOrderId = req.order_id;
    
    // const updatedIds = (pool.order_ids || []).filter((id) => id !== targetOrderId);

    // const rewarehouseFee = req.is_rewarehouse_request
    //   ? (parseFloat(rewarehouseFeeInputs[req.id] ?? req.rewarehouse_fee_jpy ?? 0) || 0)
    //   : 0;

    const orderInfo = {
      id: order.id,
      order_number: order.order_number,
      consolidation_pool_id: currentPool.id
    }
    
    const edit_request = {
      order_id: order.id,
      pool_id: currentPool.id, 
      user_email: currentUser.email,
      target_pool_id: targetPoolId,
      user_note: userNote, 
    }

    const source_shipping_pool = {
      id: currentPool.id,
      order_ids: updatedIds,
      pool_code: currentPool.pool_code
    }

    const target_shipping_pool = {
      id: targetPool ? targetPool?.id : null,
      order_ids: updatedIds,
      pool_code: targetPool ? targetPool?.pool_code : null
    }

    const handleUpdateParams = {
      edit_request: edit_request,
      source_shipping_pool: source_shipping_pool,
      target_shipping_pool: target_shipping_pool,
      order_info: orderInfo,
      display_name: currentUser.display_name
    };
    //

    console.log(handleUpdateParams)

    const handleRes = await handleEditRequest(url, handleUpdateParams);
    const errors = handleRes?.error?.errors;
    if(errors) {
      for(const error of errors) {
        setApiError(error?.errorMessage);
      }
    }

    setDone(true);

    return;

    if (isInstant) {
      //限定时间内
      // Apply immediately
      if (editType === "cancel_shipment") {
        updatedIds = (currentPool.order_ids || []).filter(id => id !== order.id);
        // await Promise.all([
        //   shippingPoolApi.update(currentPool.id, {
        //     order_ids: updatedIds,
        //     total_weight_g: Math.max(0, (currentPool.total_weight_g || 0) - (order.weight_g || 0)),
        //   }),
        //   updateOrder(order.id, { order_status: "in_warehouse", consolidation_pool_id: "" }),
        // ]);
        
      } else if (editType === "move_pool") {
        const targetPool = availablePools.find(p => p.id === targetPoolId);
        updatedIds = [...new Set([...(targetPool.order_ids || []), order.id])];
        status = '';
        // await Promise.all([
        //   shippingPoolApi.update(currentPool.id, {
        //     order_ids: (currentPool.order_ids || []).filter(id => id !== order.id),
        //     total_weight_g: Math.max(0, (currentPool.total_weight_g || 0) - w),
        //   }),
        //   shippingPoolApi.update(targetPoolId, {
        //     order_ids: [...new Set([...(targetPool.order_ids || []), order.id])],
        //     total_weight_g: (targetPool.total_weight_g || 0) + w,
        //   }),
        //   updateOrder(order.id, { consolidation_pool_id: targetPoolId }),
        // ]);
      }

      editRequest = {
        order_id: order.id, 
        pool_id: currentPool.id, 
        user_email: currentUser.email,
        edit_type: editType, 
        target_pool_id: editType === "move_pool" ? targetPoolId : "",
        user_note: userNote, 
        status: "auto_applied", 
        is_instant: true,
      }

      // await tenantEntity.create('ShippingEditRequest', {
      //   order_id: order.id, pool_id: currentPool.id, user_email: currentUser.email,
      //   edit_type: editType, target_pool_id: editType === "move_pool" ? targetPoolId : "",
      //   user_note: userNote, status: "auto_applied", is_instant: true,
      // });

      try {
        await updateShippingPool(status, w, updatedIds, editRequest);
      } catch (err) {
        let message = err?.response?.data?.message;
        console.error('[ShippingEditModal] Handle Edit Request failed:', message);
        toast.error(message || "提交失败，请稍后重试");
        return;
      }
      
      
      
    } else {

      try {
        await tenantEntity.create('ShippingEditRequest', {
          order_id: order.id, pool_id: currentPool.id, user_email: currentUser.email,
          edit_type: editType, target_pool_id: editType === "move_pool" ? targetPoolId : "",
          user_note: userNote, status: "pending", is_instant: false,notice_key: 'order_request_edit_created'
        });
      } catch (e) {
        const errObj = JSON.parse(e.message);

        for(const error of errObj.errors) {
          setApiError(error?.errorMessage);
        }
        
      }
      
    }

    setDone(true);
    // setTimeout(() => {
    //   onSuccess?.();
    // }, 1500);
  };

  if (done) {
    return (
    <div className="fixed inset-0 bg-black/40 z-[50] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-8 text-center space-y-3" onMouseDown={e => e.stopPropagation()}>
          {apiError ? (
            <>
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
              <p className="font-semibold text-gray-800">{apiError}</p>
            </>
          ) : (
            <>
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <p className="font-semibold text-gray-800">
                {isInstant ? "已即刻生效" : "申请已提交，等待管理员审批"}
              </p>
              {!isInstant && <p className="text-xs text-gray-400">管理员审批后变更将生效</p>}
            </>
          )}
          <Button size="sm" className="mt-4" onClick={() => onSuccess?.()}>关闭</Button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="fixed inset-0 bg-black/40 z-[50] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-semibold text-gray-900">编辑发货申请</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[260px]">{order.product_name}</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-500" /></button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Instant badge */}
          {isInstant ? (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              发货申请刚提交不久，编辑将即刻生效（剩余 {Math.ceil(remainingMs / 1000)} 秒）
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              已超过5分钟，编辑需等待管理员批准后生效
            </div>
          )}

          {/* Current pool info */}
          {currentPool && (
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-xs text-gray-600 space-y-0.5">
              <p className="text-gray-400">当前发货申请</p>
              <p className="font-medium text-gray-800 font-mono">{currentPool.pool_code || currentPool.id.slice(-6).toUpperCase()}</p>
              {currentPool.transit_location_name && <p>中转地：{currentPool.transit_location_name}</p>}
              {currentPool.shipping_method && <p>运输方式：{currentPool.shipping_method}</p>}
            </div>
          )}

          {/* Edit type */}
          <div className="space-y-2">
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">操作类型</label>
            {[
              { key: "cancel_shipment", icon: RotateCcw, label: "取消出货，返回已入库", desc: "订单将重置为已入库状态，可重新安排发货" },
              { key: "move_pool", icon: ArrowLeftRight, label: "移动至另一发货申请", desc: "将此订单转移到您的另一个待处理发货申请中" },
            ].map(opt => (
              <label key={opt.key}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${editType === opt.key ? "border-red-300 bg-red-50" : "border-gray-200 hover:bg-gray-50"}`}>
                <input type="radio" checked={editType === opt.key} onChange={() => setEditType(opt.key)} className="mt-0.5 accent-red-600" />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                    <opt.icon className="w-3.5 h-3.5 text-gray-500" />
                    {opt.label}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Target pool selector */}
          {editType === "move_pool" && (
            <div className="space-y-2">
              <label className="text-xs text-gray-500 font-medium">选择目标发货申请</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input placeholder="搜索发货申请编号..." className="pl-8 h-8 text-sm"
                  value={poolSearch} onChange={e => setPoolSearch(e.target.value)} />
              </div>
              {filteredPools.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">暂无其他可用发货申请</p>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {filteredPools.map(p => (
                    <label key={p.id}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${targetPoolId === p.id ? "border-red-400 bg-red-50" : "border-gray-200 hover:bg-gray-50"}`}>
                      <input type="radio" checked={targetPoolId === p.id} onChange={() => setTargetPoolId(p.id)} className="mt-0.5 accent-red-600" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-mono font-medium text-purple-700">{p.pool_code || p.id.slice(-6).toUpperCase()}</span>
                          <Badge className={`text-xs ${p.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                            {p.status === "pending" ? "待处理" : "处理中"}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {p.consolidation_type === "transit" ? `中转拼邮 → ${p.transit_location_name || "中转地"}` : p.consolidation_type === "other" ? "自选地址拼邮" : "直接发货"}
                          {p.shipping_method && ` · ${p.shipping_method}`}
                          {` · ${(p.order_ids || []).length} 件`}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Note */}
          <div>
            <label className="text-xs text-gray-500 font-medium">说明（可选）</label>
            <Textarea rows={2} className="mt-1 text-sm" placeholder="请说明修改原因..."
              value={userNote} onChange={e => setUserNote(e.target.value)} />
          </div>
        </div>

        <div className="px-5 py-3 border-t flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-700"
            onClick={() => setShowConfirmDialog(true)}
            disabled={submitting || (editType === "move_pool" && !targetPoolId)}>
            <Truck className="w-3.5 h-3.5 mr-1.5" />
            {submitting ? "提交中..." : isInstant ? "确认修改（即刻生效）" : "提交修改申请"}
          </Button>
        </div>
      </div>
    </div>


      <ConfirmDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        title="确认提交"
        description={isInstant ? "此操作将即刻生效，确定要继续吗？" : "此操作需等待管理员审批，确定要提交吗？"}
        confirmText={isInstant ? "确认修改" : "提交申请"}
        onConfirm={() => {
          setShowConfirmDialog(false);
          handleSubmit();
        }}
        onCancel={() => setShowConfirmDialog(false)}
      />
    </>
  );
}