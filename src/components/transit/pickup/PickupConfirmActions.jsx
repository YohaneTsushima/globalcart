/**
 * PickupConfirmActions — 自取确认/完成按钮组（共享片段）
 * 来源：PickupScheduler.jsx:132-166
 * 按钮显隐由 usePickupActions 派生的 canUserConfirm / canManagerConfirm / canComplete 控制。
 */
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PickupConfirmActions({
  canUserConfirm,
  canManagerConfirm,
  canComplete,
  saving,
  onConfirm,
  onComplete,
  size = "default",
  className = "",
  layout = "row", // 'row' = 并排；'col' = 纵向铺满（modal 卡片内用）
}) {
  const actions = [];

  if (canUserConfirm) {
    actions.push(
      <Button
        key="user"
        size={size}
        onClick={onConfirm}
        disabled={saving}
        className={`bg-blue-600 hover:bg-blue-700 ${layout === "col" ? "w-full" : ""}`}
      >
        <CheckCircle className="w-4 h-4 mr-2" />
        我接受此时间
      </Button>
    );
  }

  if (canManagerConfirm) {
    actions.push(
      <Button
        key="manager"
        size={size}
        onClick={onConfirm}
        disabled={saving}
        className={`bg-red-600 hover:bg-red-700 ${layout === "col" ? "w-full" : ""}`}
      >
        <CheckCircle className="w-4 h-4 mr-2" />
        确认自取时间
      </Button>
    );
  }

  if (canComplete) {
    actions.push(
      <Button
        key="complete"
        size={size}
        onClick={onComplete}
        disabled={saving}
        className={`bg-green-600 hover:bg-green-700 ${layout === "col" ? "w-full" : ""}`}
      >
        <CheckCircle className="w-4 h-4 mr-2" />
        {saving ? "处理中..." : "标记已自取"}
      </Button>
    );
  }

  if (actions.length === 0) return null;

  return (
    <div
      className={`${layout === "col" ? "space-y-2" : "flex gap-2"} ${className}`}
    >
      {actions}
    </div>
  );
}
