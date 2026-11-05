/**
 * usePickupActions — 自取（pickup）状态读取与动作统一入口。
 *
 * 复用来源：原 PickupScheduler（池级） + BatchDetailPanel/PickupBatchPanel（批次级）。
 * 三处宿主共用：
 *   - scope='batch'  → 中转地负责人工作台 PickupBatchPanel（updateTransitPoolShipment / confirm_pickup_batch）
 *   - scope='record' → ShippingPoolDetailModal 自取卡片（updateTransitPoolPickup + record_id/user_email）
 *   - scope='pool'   → PickupScheduler 池级薄壳（updateTransitPoolPickup + pool_id）
 *
 * 状态字段统一从 detail ?? record ?? pool 上读取（detail = transitLocationApi.findOne 返回的
 * TransitShipping 记录；record = pool.transit_shipping[] 里匹配 user_email 的那条）。
 */
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { transitLocationApi } from "@/lib/tenantApi";

// 自取状态字段优先级：detail（批次级 findOne） > record（modal 的 transit_shipping 记录） > pool（池级兜底）
function readPickupFields(detail, record, pool) {
  const src = detail || record || pool || {};
  return {
    pickupTimeSlot: src.transit_pickup_time_slot ?? "",
    pickupUserConfirmed: !!src.transit_pickup_user_confirmed,
    pickupAdminConfirmed: !!src.transit_pickup_admin_confirmed,
    pickupCompleted: !!src.transit_pickup_completed,
    pickupCompletedAt: src.transit_pickup_completed_at || null,
  };
}

/**
 * @param {Object} opts
 * @param {'batch'|'record'|'pool'} opts.scope  API 粒度
 * @param {Object} [opts.batch]   scope='batch' 时必传（含 entries / user_email）
 * @param {Object} [opts.record]  scope='record' 时必传（pool.transit_shipping[] 元素）
 * @param {Object} opts.pool      池子（含 id / pool_code）
 * @param {Object} [opts.detail]  scope='batch' 时的 findOne 返回记录
 * @param {boolean} [opts.isManager] 中转地负责人（batch 场景）
 * @param {boolean} [opts.isAdmin]   管理员（modal/pool 场景）
 * @param {Object} [opts.currentUser] 当前用户（用于判断用户确认按钮归属）
 * @param {Function} [opts.onSaved]  动作成功后的刷新回调
 * @param {boolean} [opts.enableNotifications=true] 是否发送站内信通知
 * @param {Object} [opts.notify]  通知上下文：{ baseUrl, entityType, entityId, managerEmail }
 */
export function usePickupActions({
  scope,
  batch,
  record,
  pool,
  detail,
  isManager = false,
  isAdmin = false,
  currentUser,
  onSaved,
  enableNotifications = true,
  notify = {},
}) {
  const [saving, setSaving] = useState(false);

  const fields = useMemo(
    () => readPickupFields(detail, record, pool),
    [detail, record, pool]
  );

  const {
    pickupTimeSlot,
    pickupUserConfirmed,
    pickupAdminConfirmed,
    pickupCompleted,
    pickupCompletedAt,
  } = fields;

  // 记录归属：modal 场景需判断该 pickup 记录是否属于当前用户
  const recordUserEmail = record?.user_email ?? batch?.user_email ?? null;
  const isOwnRecord = !recordUserEmail || recordUserEmail === currentUser?.email;

  const canSchedule = (isManager || isAdmin) && !pickupTimeSlot && !pickupCompleted;
  const canUserConfirm =
    isOwnRecord && !isAdmin && !isManager && !!pickupTimeSlot && !pickupUserConfirmed && !pickupCompleted;
  const canManagerConfirm =
    (isManager || isAdmin) && !!pickupTimeSlot && !pickupAdminConfirmed && !pickupCompleted;
  const canComplete =
    (isManager || isAdmin) && !!pickupTimeSlot && pickupUserConfirmed && pickupAdminConfirmed && !pickupCompleted;

  // ── 通知（失败不阻断主流程） ────────────────────────────────────────────────
  const sendPickupNotification = async (subtype, title, targetEmail) => {
    if (!enableNotifications || !targetEmail) return;
    try {
      await base44.functions.invoke("createNotification", {
        user_email: targetEmail,
        notification_type: "shipping_request",
        notification_subtype: subtype,
        title,
        content: title,
        related_entity_type: notify.entityType || "ShippingPool",
        related_entity_id: notify.entityId || pool?.id || record?.id || "",
        related_url: notify.baseUrl || "",
        metadata: {
          pool_code: pool?.pool_code || "",
          pickup_time_slot: pickupTimeSlot || "",
          user_email: recordUserEmail || "",
        },
        send_email: false,
      });
    } catch (err) {
      console.error("[usePickupActions] createNotification failed:", err);
    }
  };

  // ── 动作 ──────────────────────────────────────────────────────────────────
  const runAction = async (fn, successMessage) => {
    setSaving(true);
    try {
      await fn();
      if (successMessage) toast.success(successMessage);
      onSaved?.();
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || "操作失败";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  /** 约定自取时间。timeSlot 文本格式：'YYYY-MM-DD HH:mm-HH:mm' */
  const schedule = (timeSlotText) => {
    const text = (timeSlotText || "").trim();
    if (!text) {
      toast.error("请输入自取时间段");
      return;
    }

    return runAction(async () => {
      if (scope === "batch") {
        // const orderIds = (batch?.entries || []).flatMap((e) =>
        //   Array.isArray(e.order_details) ? e.order_details.map((o) => o.id) : [e.order_id || e.id]
        // ).filter(Boolean);
        // await base44.functions.invoke("updateTransitPoolShipment", {
        //   request_id: pool.id,
        //   action: "confirm_pickup_batch",
        //   order_ids: orderIds,
        //   pickup_time_slot: text,
        //   user_email: batch.user_email,
        // });

        await transitLocationApi.confirmPickup(detail.id, { transit_pickup_time_slot: text });

      } else {
        await base44.functions.invoke("updateTransitPoolPickup", {
          pool_id: pool.id,
          action: "schedule",
          time_slot: text,
          ...(record?.id ? { record_id: record.id } : {}),
          ...(recordUserEmail ? { user_email: recordUserEmail } : {}),
        });
      }
      await sendPickupNotification(
        "pickup_time_scheduled",
        "自取时间已约定，请确认",
        recordUserEmail
      );
    }, "自取时间已约定");
  };

  /** 确认自取时间。按角色分流 user_confirm / admin_confirm。 */
  const confirm = () => {
    const action = isAdmin || isManager ? "admin_confirm" : "user_confirm";
    return runAction(async () => {
      // await base44.functions.invoke("updateTransitPoolPickup", {
      //   pool_id: pool.id,
      //   action,
      //   ...(record?.id ? { record_id: record.id } : {}),
      //   ...(recordUserEmail ? { user_email: recordUserEmail } : {}),
      // });

      await transitLocationApi.userOrAdminConfirm(record?.id, { user_email: recordUserEmail });

      if (action === "admin_confirm") {
        await sendPickupNotification(
          "pickup_admin_confirmed",
          "中转地负责人已确认自取时间",
          recordUserEmail
        );
      } else {
        await sendPickupNotification(
          "pickup_user_confirmed",
          "用户已确认自取时间",
          notify.managerEmail || pool?.creator_email || ""
        );
      }
    }, "已确认自取时间");
  };

  /** 标记用户已自取。 */
  const complete = () => {
    return runAction(async () => {
      debugger
      await transitLocationApi.completedPickup(detail.id, { user_email: recordUserEmail });
    //   await base44.functions.invoke("updateTransitPoolPickup", {
    //     pool_id: pool.id,
    //     action: "complete",
    //     ...(record?.id ? { record_id: record.id } : {}),
    //     ...(recordUserEmail ? { user_email: recordUserEmail } : {}),
    //   });
    //   await sendPickupNotification("pickup_completed", "自取已完成", recordUserEmail);
    }, "已标记为用户已自取");

  };

  return {
    // 状态
    saving,
    pickupTimeSlot,
    pickupUserConfirmed,
    pickupAdminConfirmed,
    pickupCompleted,
    pickupCompletedAt,
    // 派生
    canSchedule,
    canUserConfirm,
    canManagerConfirm,
    canComplete,
    // 动作
    schedule,
    confirm,
    complete,
  };
}

/** 把 'YYYY-MM-dd' + 'HH:mm-HH:mm' 拼成约定时间段文本。 */
export function buildPickupTimeSlot(date, timeRange) {
  return date && timeRange ? `${date} ${timeRange}` : "";
}

/** 预设自取时间段（PickupTimeSlotPicker 用）。 */
export const PICKUP_TIME_SLOTS = [
  "09:00-11:00",
  "11:00-13:00",
  "13:00-15:00",
  "14:00-16:00",
  "15:00-17:00",
  "17:00-19:00",
];
