/**
 * PickupScheduler — 池级自取管理卡片（薄壳）
 * 状态与动作走 usePickupActions（scope='pool'），UI 复用共享片段。
 * 目前无引用方，保留为池级自取入口的参考实现宿主。
 */
import { useState } from "react";
import { Calendar, Clock, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePickupActions } from "@/hooks/usePickupActions";
import PickupStatusBadges from "@/components/transit/pickup/PickupStatusBadges";
import PickupConfirmActions from "@/components/transit/pickup/PickupConfirmActions";

export default function PickupScheduler({ pool, onUpdate, isAdmin }) {
  const [timeSlot, setTimeSlot] = useState("");

  const {
    saving,
    pickupTimeSlot,
    pickupUserConfirmed,
    pickupAdminConfirmed,
    pickupCompleted,
    pickupCompletedAt,
    canSchedule,
    canUserConfirm,
    canManagerConfirm,
    canComplete,
    schedule,
    confirm,
    complete,
  } = usePickupActions({
    scope: "pool",
    pool,
    isAdmin,
    isManager: isAdmin,
    onSaved: onUpdate,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          自取管理
          {pickupCompleted && (
            <Badge className="bg-green-100 text-green-700 ml-2">
              <CheckCircle className="w-3 h-3 mr-1" />
              已完成
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Display */}
        <PickupStatusBadges
          userConfirmed={pickupUserConfirmed}
          adminConfirmed={pickupAdminConfirmed}
          completed={pickupCompleted}
          completedAt={pickupCompletedAt}
          adminLabel={isAdmin ? "管理员" : "中转地负责人"}
        />

        {/* Time Slot Display */}
        {pickupTimeSlot && (
          <div className="flex items-center gap-2 text-sm bg-gray-50 p-2 rounded">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="font-medium">约定时间：</span>
            <span>{pickupTimeSlot}</span>
          </div>
        )}

        {/* Scheduling Input */}
        {canSchedule && (
          <div>
            <Label>约定自取时间段</Label>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="例如：2026-06-10 14:00-16:00"
                value={timeSlot}
                onChange={(e) => setTimeSlot(e.target.value)}
                className="flex-1"
              />
              <Button onClick={() => schedule(timeSlot)} disabled={saving}>
                约定
              </Button>
            </div>
          </div>
        )}

        {/* Confirmation Actions */}
        <PickupConfirmActions
          canUserConfirm={canUserConfirm}
          canManagerConfirm={canManagerConfirm}
          canComplete={canComplete}
          saving={saving}
          onConfirm={confirm}
          onComplete={complete}
        />

        {/* Completed Status */}
        {pickupCompleted && (
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <CheckCircle className="w-4 h-4" />
            <span>
              用户已于{" "}
              {new Date(pickupCompletedAt || pool.updated_date).toLocaleDateString()} 自取
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
