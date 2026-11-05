/**
 * PickupStatusBadges — 自取状态徽章组（共享片段）
 * 来源：PickupScheduler.jsx:94-103
 */
import { User, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function PickupStatusBadges({
  userConfirmed,
  adminConfirmed,
  completed,
  completedAt,
  adminLabel = "管理员",
  className = "",
}) {
  return (
    <div className={`flex items-center gap-2 flex-wrap text-sm ${className}`}>
      <Badge
        variant={userConfirmed ? "default" : "outline"}
        className={userConfirmed ? "bg-blue-100 text-blue-700" : ""}
      >
        <User className="w-3 h-3 mr-1" />
        用户{userConfirmed ? "已确认" : "未确认"}
      </Badge>
      <Badge
        variant={adminConfirmed ? "default" : "outline"}
        className={adminConfirmed ? "bg-green-100 text-green-700" : ""}
      >
        <User className="w-3 h-3 mr-1" />
        {adminLabel}{adminConfirmed ? "已确认" : "未确认"}
      </Badge>
      {completed && (
        <Badge className="bg-green-100 text-green-700">
          <CheckCircle className="w-3 h-3 mr-1" />
          已完成
        </Badge>
      )}
      {completed && completedAt && (
        <span className="text-xs text-gray-500">
          用户已于 {new Date(completedAt).toLocaleDateString()} 自取
        </span>
      )}
    </div>
  );
}
