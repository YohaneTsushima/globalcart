/**
 * PickupTimeSlotPicker — 自取时间选择器（共享片段）
 * 来源：BatchDetailPanel.jsx:487-524（日历 Popover + 预设时间段 + 自定义输入）
 * 受控组件：date / timeRange 由父级持有（便于拼 timeSlot 后提交）。
 */
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { format } from "date-fns";
import { PICKUP_TIME_SLOTS } from "@/hooks/usePickupActions";

export default function PickupTimeSlotPicker({
  date,          // "2026-06-15"
  timeRange,     // "14:00-16:00"
  onDateChange,  // (dateStr) => void
  onTimeRangeChange, // (timeRangeStr) => void
  placeholder = "选择日期和时间段",
  triggerClassName = "flex-1 justify-start text-left font-normal text-sm",
}) {
  const timeSlot = date && timeRange ? `${date} ${timeRange}` : "";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={triggerClassName}>
          <CalendarDays className="w-3.5 h-3.5 mr-1.5" />
          {timeSlot || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {(() => {
          // 今天 00:00 作为禁用下界（保留今天可选，禁用今天之前）；每次渲染取当前时间，跨零点后行为正确
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return (
            <CalendarPicker
              mode="single"
              selected={date ? new Date(date) : undefined}
              onSelect={(d) => onDateChange(d ? format(d, "yyyy-MM-dd") : "")}
              disabled={{ before: today }}
              initialFocus
            />
          );
        })()}
        <div className="border-t p-2 space-y-1.5">
          <p className="text-xs text-gray-500 px-1">时间段</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PICKUP_TIME_SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => onTimeRangeChange(slot)}
                className={`px-2 py-1.5 text-xs rounded-md border transition-colors ${
                  timeRange === slot
                    ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {slot}
              </button>
            ))}
          </div>
          <Input
            className="text-xs"
            placeholder="自定义，如 14:00-16:00"
            value={timeRange}
            onChange={(e) => onTimeRangeChange(e.target.value)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
