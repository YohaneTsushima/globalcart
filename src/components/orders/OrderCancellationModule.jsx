/**
 * OrderCancellationModule
 * 统一的订单取消模块，适用于实物订单和票务订单。
 *
 * 流程：选分类 → 选理由（自动带出该理由的默认文案，用户可自行修改）→ 确认取消。
 * 提交 { order_id, cancel_config_id, cancel_reason }：
 * - cancel_config_id 决定分类、理由、通知设置；
 * - cancel_reason 是用户最终确认的文案（留空时后端用配置模板重新生成）；
 * - 退款金额、取消记录都由后端 cancelOrder 计算和落库。
 * 取消理由来自「网站设置 → 提醒文案 → 取消设置」（OrderCancelConfig）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cancelOrder, tenantEntity } from "@/lib/tenantApi";
import { AlertTriangle, Loader2, MessageCircle, Tags, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// 分类胶囊配色（按分类顺序派生，不落库）
const CATEGORY_PILL_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-orange-100 text-orange-700",
  "bg-yellow-100 text-yellow-700",
  "bg-red-100 text-red-700",
  "bg-purple-100 text-purple-700",
  "bg-gray-100 text-gray-700",
];

export default function OrderCancellationModule({ order, onSuccess, compact = false, isAdmin = true, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [cancelConfigs, setCancelConfigs] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState(null);
  const [cancelCategory, setCancelCategory] = useState("");
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // 记录最近一次自动填入的文案，避免切换理由时覆盖用户手写内容
  const lastAutoFillRef = useRef("");

  // 懒加载：展开时拉取当前租户的取消设置（后端已按本订单渲染好默认文案）
  const loadCancelConfigs = useCallback(async () => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const data = await tenantEntity.list("OrderCancelConfig", { order_id: String(order.id) });
      const list = Array.isArray(data) ? data : [];
      setCancelConfigs(list.filter(c => c && c.is_active !== false));
    } catch (error) {
      console.error("获取取消设置失败:", error);
      setConfigError(error?.message || "加载失败");
    } finally {
      setConfigLoading(false);
    }
  }, [order.id]);

  useEffect(() => {
    if (!expanded) return;
    if (cancelConfigs !== null || configError) return;
    loadCancelConfigs();
  }, [expanded, cancelConfigs, configError, loadCancelConfigs]);

  const groupedConfigs = useMemo(() => {
    const map = new Map();
    for (const config of cancelConfigs || []) {
      const key = config.category || "未分类";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(config);
    }
    return Array.from(map.entries()).map(([category, reasons]) => ({ category, reasons }));
  }, [cancelConfigs]);

  const currentGroup = groupedConfigs.find(g => g.category === cancelCategory) || null;
  const currentReasons = currentGroup?.reasons || [];
  const hasConfigs = groupedConfigs.length > 0;

  const selectCategory = (category) => {
    setCancelCategory(category);
    setSelectedConfig(null);
  };

  // 选中理由：把配置的默认文案填入文本框（用户已手改过则保留）
  const selectReason = (config) => {
    setSelectedConfig(config);
    const content = (config?.default_content || "").trim();
    if (!content) {
      return;
    }
    if (!cancelReason.trim() || cancelReason === lastAutoFillRef.current) {
      lastAutoFillRef.current = content;
      setCancelReason(content);
    }
  };

  // 恢复为该理由的默认文案
  const resetToDefaultContent = () => {
    if (!selectedConfig) return;
    const content = selectedConfig.default_content || "";
    lastAutoFillRef.current = content;
    setCancelReason(content);
  };

  const handleCancelOrder = () => {
    if (!selectedConfig) {
      toast.error("请选择取消分类和取消理由");
      return;
    }
    if (!cancelReason.trim()) {
      toast.error("请填写取消理由文案");
      return;
    }
    setShowConfirmDialog(true);
  };

  // 提交：order_id + cancel_config_id + 用户最终确认的取消理由文案
  const confirmCancelOrder = async () => {
    setShowConfirmDialog(false);
    setIsSubmitting(true);
    try {
      const res = await cancelOrder(order.id, {
        cancel_config_id: selectedConfig.id,
        cancel_reason: cancelReason.trim(),
      });
      if (!res) {
        return;
      }
      toast.success("订单已取消");
      onSuccess?.();
    } catch (error) {
      toast.error("取消失败：" + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 获取取消历史记录（来自订单留言，保持不变）
  const cancellationHistory = (order.messages || []).filter(m =>
    m.meta?.type === "cancellation" || m.from_email === "system@system.local"
  ).reverse();

  // 二次确认弹窗
  if (showConfirmDialog) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onMouseDown={() => setShowConfirmDialog(false)}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onMouseDown={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
                {isAdmin ? "确认取消订单（管理员操作）" : "确认取消订单"}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">{order.order_number || order.product_name}</p>
            </div>
            <button onClick={() => setShowConfirmDialog(false)}><X className="w-4 h-4 text-gray-500" /></button>
          </div>

          <div className="px-5 py-5 space-y-4">
            {/* 取消分类 / 理由 */}
            <div>
              <Label className="text-sm flex items-center gap-1.5">
                <Tags className="w-3.5 h-3.5" />
                取消分类 / 理由
              </Label>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge className="bg-gray-100 text-gray-700">{selectedConfig.category}</Badge>
                <span className="text-xs text-gray-400">›</span>
                <Badge className="bg-rose-100 text-rose-700">{selectedConfig.reason}</Badge>
              </div>
            </div>

            {/* 取消理由文案（默认来自配置，允许用户修改） */}
            <div>
              <Label className="text-sm">取消理由文案</Label>
              <div className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {cancelReason}
              </div>
            </div>

            <p className="text-xs text-gray-400">
              退款金额与取消记录由系统按实际付款自动生成，取消后不可撤销。
            </p>
          </div>

          <div className="px-5 py-3 border-t flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowConfirmDialog(false)} disabled={isSubmitting}>
              返回
            </Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmCancelOrder}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />处理中...</>
              ) : (
                <><AlertTriangle className="w-3.5 h-3.5 mr-1" />确认取消</>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        {/* 默认缩进收起：点「取消订单」展开表单 */}
        {!expanded ? (
          <div className="pl-3">
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-xs text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setExpanded(true)}
            >
              <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
              取消订单
            </Button>
          </div>
        ) : (
          <div className="pl-3 border-l-2 border-red-100 space-y-2">
            {configLoading && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400 py-1">
                <Loader2 className="w-3 h-3 animate-spin" />加载取消设置...
              </div>
            )}

            {!configLoading && configError && (
              <div className="flex items-center justify-between gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                <span>取消设置加载失败：{configError}</span>
                <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={loadCancelConfigs}>
                  重试
                </Button>
              </div>
            )}

            {!configLoading && !configError && !hasConfigs && (
              <p className="text-xs text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-2.5 py-2">
                尚未配置取消理由，请先到「网站设置 → 提醒文案 → 取消设置」添加。
              </p>
            )}

            {/* 第一级：取消分类 */}
            {!configLoading && !configError && hasConfigs && (
              <div className="flex flex-wrap gap-1.5">
                {groupedConfigs.map((group, idx) => {
                  const active = cancelCategory === group.category;
                  return (
                    <button
                      key={group.category}
                      onClick={() => selectCategory(group.category)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        active
                          ? `${CATEGORY_PILL_COLORS[idx % CATEGORY_PILL_COLORS.length]} ring-2 ring-offset-1 ring-gray-400`
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {group.category}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 第二级：取消理由 */}
            {currentReasons.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pl-2 border-l-2 border-rose-100">
                {currentReasons.map(config => {
                  const active = selectedConfig?.id === config.id;
                  return (
                    <button
                      key={config.id}
                      onClick={() => selectReason(config)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        active
                          ? "bg-rose-100 text-rose-700 ring-2 ring-offset-1 ring-rose-300"
                          : "bg-white text-gray-600 border border-gray-200 hover:bg-rose-50 hover:text-rose-600"
                      }`}
                    >
                      {config.reason}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 取消理由文案：默认是配置文案，可自行修改 */}
            {selectedConfig && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-gray-500">取消理由文案（可修改）</Label>
                  {cancelReason.trim() !== (selectedConfig.default_content || "").trim() && (
                    <button
                      type="button"
                      className="text-[11px] text-gray-400 hover:text-gray-600 underline"
                      onClick={resetToDefaultContent}
                    >
                      恢复默认文案
                    </button>
                  )}
                </div>
                <Textarea
                  rows={3}
                  className="text-xs"
                  placeholder="可在此修改取消理由文案"
                  maxLength={2000}
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                />
              </div>
            )}

            {/* 提交 */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-gray-400">退款金额与取消记录由系统自动处理</span>
              <Button
                size="sm"
                className="h-9 text-xs bg-red-600 hover:bg-red-700 flex-shrink-0"
                onClick={handleCancelOrder}
                disabled={isSubmitting || !selectedConfig || !cancelReason.trim()}
                title="确认取消订单"
              >
                {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                确认取消
              </Button>
            </div>
          </div>
        )}

        {/* 取消历史记录 */}
        {cancellationHistory.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="text-xs text-gray-500 font-medium mb-1.5 flex items-center gap-1">
              <MessageCircle className="w-3 h-3" />
              取消历史 ({cancellationHistory.length})
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {cancellationHistory.map((msg) => (
                <div key={msg.id} className="text-xs bg-gray-50 border border-gray-100 rounded px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-400">{new Date(msg.timestamp).toLocaleString("zh-CN")}</span>
                    {msg.meta?.cancel_reason && (
                      <span className="text-gray-600 truncate flex-1">{msg.meta.cancel_reason}</span>
                    )}
                    {msg.meta?.refund_amount_jpy > 0 && (
                      <Badge className="bg-green-100 text-green-700 text-[10px]">
                        ¥{msg.meta.refund_amount_jpy.toLocaleString()}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
