/**
 * ManagerMultiSelect - 多选负责人下拉
 * 下拉内为 checkbox，可勾选/取消多个负责人；触发器上汇总显示已选负责人。
 */
import { useMemo } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { normalizeManagerEmails } from "@/lib/managerUtils";

export default function ManagerMultiSelect({ users = [], value = [], onChange, placeholder = "选择用户..." }) {
  const selected = useMemo(() => normalizeManagerEmails(value), [value]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const labelOf = (email) => {
    const u = users.find(u => u.email === email);
    return u?.full_name || email;
  };

  const toggle = (email) => {
    const next = selectedSet.has(email)
      ? selected.filter(e => e !== email)
      : [...selected, email];
    onChange?.(next);
  };

  const remove = (e, email) => {
    e.preventDefault();
    e.stopPropagation();
    onChange?.(selected.filter(v => v !== email));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mt-1 h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm hover:bg-accent/40 flex items-center gap-1.5 flex-wrap justify-start text-left"
        >
          {selected.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <>
              {selected.map(email => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 rounded bg-red-50 text-red-700 border border-red-100 px-1.5 py-0.5 text-xs max-w-[160px]"
                >
                  <span className="truncate">{labelOf(email)}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => remove(e, email)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") remove(e, email); }}
                    className="hover:text-red-900 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </span>
                </span>
              ))}
            </>
          )}
          <ChevronDown className="w-3.5 h-3.5 ml-auto text-gray-400 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-1" align="start">
        <div className="max-h-64 overflow-y-auto">
          {users.length === 0 && (
            <p className="text-xs text-gray-400 px-2 py-3 text-center">暂无可选用户</p>
          )}
          {users.map(u => {
            const checked = selectedSet.has(u.email);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u.email)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 text-left"
              >
                <span
                  className={`w-4 h-4 rounded-sm border flex-shrink-0 flex items-center justify-center ${checked ? "bg-red-600 border-red-600 text-white" : "border-gray-300"}`}
                >
                  {checked && <Check className="w-3 h-3" />}
                </span>
                <span className="text-xs text-gray-700 truncate">
                  {u.full_name ? `${u.full_name} (${u.email})` : u.email}
                </span>
              </button>
            );
          })}
        </div>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange?.([])}
            className="w-full text-xs text-gray-400 hover:text-red-600 py-1.5 border-t border-gray-100 mt-1"
          >
            清空选择
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
