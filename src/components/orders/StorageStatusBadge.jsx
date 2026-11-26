import { AlertTriangle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * 库存存放状态徽章：仅当订单已超期 / 即将到期时展示。
 * 数据来自 order_info.storage_status（normal / reminder / expired），由每日巡检写入。
 */
export default function StorageStatusBadge({ status, feeAccrued, className = "" }) {

  if (status === "expired") {
    const feeText = Number(feeAccrued) > 0 ? ` · ¥${Math.round(Number(feeAccrued))}` : "";
    return (
      <Badge className={`text-xs bg-red-100 text-red-700 border border-red-200 ${className}`}>
        <AlertTriangle className="w-3 h-3 mr-1" />
        存放超期{feeText}
      </Badge>
    );
  }

  if (status === "reminder") {
    return (
      <Badge className={`text-xs bg-amber-100 text-amber-700 border border-amber-200 ${className}`}>
        <Clock className="w-3 h-3 mr-1" />
        即将到期
      </Badge>
    );
  }

  return null;
}
