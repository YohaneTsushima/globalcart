/**
 * Shared constants for shipping pool / notify shipment forms.
 *
 * IMPORTANT: Both UserNotifyShipmentModal and CreateShippingPoolModal (Step 2)
 * use these constants. Any changes here are automatically reflected in both.
 * Do NOT duplicate these lists inside those files.
 */

export const SHIPPING_METHODS = [
  { value: "EMS", label: "EMS空运" },
  { value: "surface", label: "海运" },
  { value: "small_packet_air", label: "小型包装物空运" },
];

export const CONSOLIDATION_TIMEOUT_ACTIONS = [
  { value: "ship_individually", label: "单独发货" },
  { value: "next_consolidation", label: "加入下一次最快发出的拼邮" },
  { value: "return_to_storage", label: "退回仓库暂存" },
];

export const METHOD_LABELS = {
  "__pickup__": "自取",
  "__storage__": "暂存",
};

export const STATUS_CONFIG = {
  "pending": { label: "待处理", color: "bg-gray-100 text-gray-700" },
  "awaiting_payment": { label: "待支付", color: "bg-yellow-100 text-yellow-700" },
  "awaiting_payment_confirmation": { label: "待确认", color: "bg-blue-100 text-blue-700" },
  "ready_to_ship": { label: "待发货", color: "bg-blue-100 text-blue-700" },
  "transited": { label: "已向中转地发出", color: "bg-indigo-100 text-indigo-700" },
  "shipped": { label: "已发货", color: "bg-green-100 text-green-700" },
  "delivered": { label: "已送达", color: "bg-green-100 text-green-700" },
  "cancelled": { label: "已取消", color: "bg-red-100 text-red-700" },
};