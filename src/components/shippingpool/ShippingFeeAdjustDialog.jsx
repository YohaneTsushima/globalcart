/**
 * ShippingFeeAdjustDialog
 * 费用调整弹窗：唯一的价格输入入口。
 *
 * 只保存「费用输入」（全局捆包费基数 + 各用户额外费用），不发布用户可见金额；
 * 发布发生在管理员点击「通知用户付款」（handleSetAwaitingPayment）时。
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shippingPoolApi } from "@/lib/tenantApi";
import { persistentToastError } from "@/lib/toastUtils.jsx";

const filterSignedNumeric = (value) => {
  const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
  const negative = cleaned.startsWith("-");
  const digits = cleaned.replace(/-/g, "").replace(/(\..*)\./g, "$1");
  return `${negative ? "-" : ""}${digits}`;
};

const parseSigned = (value) => {
  if (value === "" || value === "-" || value === "." || value === "-.") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const yen = (value) => `¥${Math.round(Number(value) || 0).toLocaleString()}`;

export default function ShippingFeeAdjustDialog({
  open,
  onClose,
  pool,
  participants = [],
  userProfileMap = {},
  baseFee = 0,
  buildPreview,
  onSaved,
}) {
  const [baseFeeInput, setBaseFeeInput] = useState("");
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  const savedRows = pool?.packing_fees_per_user || [];
  const savedBreakdown = pool?.fee_breakdown_per_user || [];
  const participantKey = participants.join(",");
  const savedBaseFee = Number(baseFee) || 0;
  // 拼邮时运费/外箱/全局捆包费按重量平摊，单件发货则是直加
  const isConsolidation = pool?.consolidation_type === "transit" || pool?.consolidation_type === "other";

  const savedExtras = useMemo(() => {
    const map = {};
    savedRows.forEach((row) => {
      if (row?.user_email) {
        map[row.user_email] = Number(row.extra_fee_jpy ?? row.fee_jpy ?? 0) || 0;
      }
    });
    return map;
  }, [savedRows]);

  const publishedTotals = useMemo(() => {
    const map = {};
    savedBreakdown.forEach((entry) => {
      if (entry?.user_email) {
        map[entry.user_email] = Number(entry.total_jpy) || 0;
      }
    });
    return map;
  }, [savedBreakdown]);

  // 打开时用「已保存的输入」初始化；池版本变化（例如刷新后）也重新初始化
  useEffect(() => {
    if (!open) return;
    setBaseFeeInput(savedBaseFee ? String(savedBaseFee) : "");
    setRows(participants.map((email) => {
      const extra = savedExtras[email] || 0;
      return { email, extraInput: extra === 0 ? "" : String(extra), reason: "" };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pool?.id, pool?.version, participantKey, savedBaseFee]);

  const extrasByUser = useMemo(() => {
    const map = {};
    rows.forEach((row) => {
      map[row.email] = parseSigned(row.extraInput);
    });
    return map;
  }, [rows]);

  const preview = useMemo(() => {
    if (!buildPreview) return [];
    try {
      return buildPreview(parseFloat(baseFeeInput) || 0, extrasByUser) || [];
    } catch (err) {
      console.error("[ShippingFeeAdjustDialog] preview failed:", err);
      return [];
    }
  }, [baseFeeInput, extrasByUser, buildPreview]);

  const previewTotals = useMemo(() => {
    const map = {};
    preview.forEach((entry) => {
      if (entry?.user_email) {
        map[entry.user_email] = Number(entry.total_jpy) || 0;
      }
    });
    return map;
  }, [preview]);

  const publishedTotal = savedBreakdown.reduce((sum, entry) => sum + (Number(entry?.total_jpy) || 0), 0);
  const previewTotal = preview.reduce((sum, entry) => sum + (Number(entry?.total_jpy) || 0), 0);

  const changedRows = rows.filter(
    (row) => parseSigned(row.extraInput) !== (savedExtras[row.email] || 0)
  );
  const baseChanged = (parseFloat(baseFeeInput) || 0) !== savedBaseFee;
  const hasChanges = changedRows.length > 0 || baseChanged;
  const negativeEntry = preview.find((entry) => (Number(entry?.total_jpy) || 0) < 0);
  const missingReason = changedRows.some(
    (row) => parseSigned(row.extraInput) !== 0 && !row.reason.trim()
  );
  const canSave = hasChanges && !negativeEntry && !missingReason && !saving;

  const updateRow = (email, patch) => {
    setRows((prev) => prev.map((row) => (row.email === email ? { ...row, ...patch } : row)));
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        base_packing_fee_jpy: parseFloat(baseFeeInput) || 0,
        adjustments: changedRows.map((row) => ({
          user_email: row.email,
          extra_fee_jpy: parseSigned(row.extraInput),
          reason: row.reason.trim(),
        })),
      };
      if (pool?.version !== undefined && pool?.version !== null) {
        payload.expect_version = pool.version;
      }
      const result = await shippingPoolApi.handleAdjustFees(pool.id, payload);
      toast.success("费用调整已保存，通知用户付款后生效");
      onSaved?.(result);
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || "保存失败";
      persistentToastError(`费用调整失败：${message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            调整费用 {pool?.pool_code ? `· ${pool.pool_code}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
          保存后只更新费用输入，用户端金额不变；点「通知用户付款」后才会按新金额生效并通知用户。
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">全局捆包作业服务费 (JPY)</Label>
          <div className="flex items-center gap-1.5">
            <Input
              className="h-8 text-sm flex-1"
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={baseFeeInput}
              onChange={(e) => setBaseFeeInput(filterSignedNumeric(e.target.value))}
            />
            <button
              type="button"
              onClick={() => setBaseFeeInput(String(parseSigned(baseFeeInput) + 100))}
              className="h-8 px-2 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex-shrink-0"
            >+100</button>
            <button
              type="button"
              onClick={() => setBaseFeeInput(String(Math.max(0, parseSigned(baseFeeInput) - 100)))}
              className="h-8 px-2 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex-shrink-0"
            >-100</button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-500">各用户额外费用（负数表示补正/折扣）</Label>
            <span className="text-xs text-gray-400">已发布合计 {yen(publishedTotal)}</span>
          </div>

          {rows.length === 0 && (
            <p className="text-xs text-gray-400">暂无参与用户。</p>
          )}

          {rows.map((row) => {
            const profile = userProfileMap[row.email] || {};
            const displayName = profile.display_name || profile.full_name || row.email;
            const extra = parseSigned(row.extraInput);
            const published = publishedTotals[row.email] || 0;
            const after = previewTotals[row.email] ?? published;
            const delta = after - published;
            return (
              <div key={row.email} className="border border-gray-100 rounded-lg p-2 bg-gray-50 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-700 font-medium truncate" title={row.email}>
                    {displayName}
                  </span>
                  <span
                    className="text-xs text-gray-500 flex-shrink-0"
                    title={isConsolidation
                      ? "已发布金额 → 按当前输入重新平摊后的金额（个人额外费用为个人直加，不参与平摊）"
                      : "已发布金额 → 按当前输入重算后的金额"}
                  >
                    <span className="text-gray-400">{isConsolidation ? "平摊后：" : "合计："}</span>
                    {yen(published)} → <span className={delta < 0 ? "text-blue-600" : delta > 0 ? "text-orange-600" : ""}>{yen(after)}</span>
                    {delta !== 0 && (
                      <span className={`ml-1 ${delta < 0 ? "text-blue-600" : "text-orange-600"}`}>
                        ({delta > 0 ? "+" : ""}{Math.round(delta).toLocaleString()})
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-gray-300">额外</span>
                  <Input
                    className="h-7 text-xs w-24"
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={row.extraInput}
                    onChange={(e) => updateRow(row.email, { extraInput: filterSignedNumeric(e.target.value) })}
                  />
                  <button
                    type="button"
                    onClick={() => updateRow(row.email, { extraInput: String(extra + 100) })}
                    className="h-7 px-1.5 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600"
                  >+100</button>
                  <button
                    type="button"
                    onClick={() => updateRow(row.email, { extraInput: String(extra - 100) })}
                    className="h-7 px-1.5 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600"
                  >-100</button>
                  <Input
                    className="h-7 text-xs flex-1 min-w-[120px]"
                    type="text"
                    placeholder="调整原因（必填）"
                    value={row.reason}
                    onChange={(e) => updateRow(row.email, { reason: e.target.value })}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t pt-2">
          <div className="text-sm text-gray-600">
            {isConsolidation ? "平摊后合计" : "合计"}{" "}
            <span className="text-gray-400 line-through">{yen(publishedTotal)}</span>
            {" → "}
            <span className="font-semibold text-gray-900">{yen(previewTotal)}</span>
          </div>
          {negativeEntry && (
            <span className="text-xs text-red-600">用户 {negativeEntry.user_email} 调整后金额为负，无法保存</span>
          )}
          {!negativeEntry && missingReason && (
            <span className="text-xs text-orange-600">请填写调整原因</span>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>取消</Button>
          <Button size="sm" className="bg-orange-600 hover:bg-orange-700" onClick={handleSave} disabled={!canSave}>
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />保存中...</> : "保存调整"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
