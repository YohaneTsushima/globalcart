import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Ticket, Lock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import TicketRequestFields from "@/components/tickets/TicketRequestFields";
import TicketPrepaySummary from "@/components/tickets/TicketPrepaySummary";
import PaymentMethodSelector from "@/components/common/PaymentMethodSelector";
import RichTextInput from "@/components/common/RichTextInput";
import { calcTicketPrepaidTotal, TICKETING_METHODS } from "@/lib/ticketConfig";

export default function SubmitTicketOrder() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { can } = usePermissions();
  const canSubmit = can("order:submit_purchase_request");

  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // order_name can be manually overridden after performance_name auto-fill
  const [orderNameManual, setOrderNameManual] = useState(false);
  const [orderName, setOrderName] = useState("");
  const [userNote, setUserNote] = useState("");
  const [noteImageUrls, setNoteImageUrls] = useState([]);
  const [ticketData, setTicketData] = useState({ account_count: 1, seats: [] });

  useEffect(() => {
    Promise.all([
      base44.functions.invoke("getSubmitOrderPageData", {}),
      base44.functions.invoke("managePaymentMethod", { action: "list" }),
    ]).then(([r, pm]) => {
      setConfig(r.data?.ticketConfig || null);
      setPaymentMethods(pm.data?.methods || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const setTd = (patch) => {
    setTicketData(prev => {
      const next = { ...prev, ...patch };
      // auto-fill order name from performance_name unless manually overridden
      if (patch.performance_name !== undefined && !orderNameManual) {
        setOrderName(patch.performance_name || "");
      }
      return next;
    });
  };

  // ── Time validation (cross-field only; past-check is enforced by `min` on the input) ─────
  const timeErrors = useMemo(() => {
    const errors = {};
    const isLottery = ticketData.sales_method === "lottery";
    const startLabel = isLottery ? "抽選開始" : "販売開始";
    const endLabel = isLottery ? "抽選終了" : "販売終了";

    // 販売開始 < 販売終了
    if (ticketData.sales_start_time && ticketData.sales_end_time) {
      if (new Date(ticketData.sales_end_time) <= new Date(ticketData.sales_start_time)) {
        errors.sales_end_time = `${endLabel}必须晚于${startLabel}`;
      }
    }

    // 販売終了 < 開演日時
    if (ticketData.sales_end_time && ticketData.performance_datetime) {
      if (new Date(ticketData.performance_datetime) < new Date(ticketData.sales_end_time)) {
        errors.performance_datetime = `開演日時必须晚于${endLabel}`;
      }
    }

    // 結果発表 > 販売終了（抽选）
    if (isLottery && ticketData.lottery_result_time && ticketData.sales_end_time) {
      if (new Date(ticketData.lottery_result_time) <= new Date(ticketData.sales_end_time)) {
        errors.lottery_result_time = "結果発表必须晚于抽選終了";
      }
    }

    return errors;
  }, [ticketData]);

  const hasTimeErrors = Object.keys(timeErrors).length > 0;

  // ── Missing required fields ───────────────────────────────────────────────
  const missingFields = useMemo(() => {
    const missing = [];
    const vis = config?.field_visibility || {};
    const req = (k) => vis[k] === "required";

    if (!ticketData.sales_method) missing.push("販売方法");
    if (!ticketData.ticketing_method) missing.push("発券方式");
    if (!ticketData.seats?.length || ticketData.seats.every(s => !s.seat_type)) missing.push("席种（至少一条）");

    if (req("prefecture") && !ticketData.prefecture) missing.push("都道府県");
    if (req("performance_datetime") && !ticketData.performance_datetime) missing.push("開演日時");
    if (req("performance_name") && !ticketData.performance_name) missing.push("演出名");
    if (req("purchase_link") && !ticketData.purchase_link) missing.push("购买链接");
    if (req("sales_start_time") && !ticketData.sales_start_time) missing.push(ticketData.sales_method === "lottery" ? "抽選開始" : "販売開始");
    if (req("sales_end_time") && !ticketData.sales_end_time) missing.push(ticketData.sales_method === "lottery" ? "抽選終了" : "販売終了");
    if (req("lottery_result_time") && ticketData.sales_method === "lottery" && !ticketData.lottery_result_time) missing.push("結果発表");

    // Fee checks
    const method = ticketData.ticketing_method;
    const minFee = config?.min_additional_fee?.[method] ?? 0;
    if (method && minFee > 0 && (parseFloat(ticketData.additional_fee_jpy) || 0) < minFee) {
      missing.push(`追加料金（最低 ¥${minFee}）`);
    }
    if (ticketData.sales_method === "lottery") {
      const minBonus = config?.min_lottery_win_bonus ?? 0;
      if (minBonus > 0 && (parseFloat(ticketData.lottery_win_bonus_jpy) || 0) < minBonus) {
        missing.push(`抽中追加报酬（最低 ¥${minBonus}）`);
      }
    }

    return missing;
  }, [ticketData, config]);

  const canFormSubmit = canSubmit && missingFields.length === 0 && !hasTimeErrors && calcTicketPrepaidTotal(ticketData) > 0;

  // ── Build fee breakdown for payment page ─────────────────────────────────
  // NOTE: actual prepaid total is authoritative from the server (order.prepayment_amount).
  // This breakdown is display-only; totals are overridden by the server value after order creation.
  const buildFeeBreakdown = (serverPrepaidTotal) => {
    const seats = ticketData.seats || [];
    const accountCount = parseFloat(ticketData.account_count) || 1;
    const additional = parseFloat(ticketData.additional_fee_jpy) || 0;
    const seatLines = seats.map(s => ({
      label: `${s.seat_type || "席种"} × ${s.quantity || 0} × ${accountCount}账户`,
      amount: Math.round((parseFloat(s.quantity) || 0) * (parseFloat(s.price_jpy) || 0) * accountCount),
    }));
    const lines = [...seatLines];
    if (additional > 0) lines.push({ label: "追加料金", amount: additional });
    // Estimate service fee for display (actual is computed server-side)
    const grossTotal = lines.reduce((s, l) => s + l.amount, 0);
    const fallbackRate = (parseFloat(config?.fallback_service_fee_rate) || 0) / 100;
    const fallbackFixed = parseFloat(config?.fallback_service_fee_fixed) || 0;
    const estimatedSvcFee = Math.round(grossTotal * fallbackRate + fallbackFixed);
    if (estimatedSvcFee > 0) lines.push({ label: "服务费（参考）", amount: estimatedSvcFee });
    const prepayEnabled = config?.prepay_enabled !== false;
    let prepayRate = parseFloat(config?.prepay_rate);
    if (isNaN(prepayRate) || prepayRate <= 0 || prepayRate > 100) prepayRate = 100;
    // Use server-computed prepaid total as authoritative; fall back to client estimate
    const finalPrepay = serverPrepaidTotal ?? Math.round((grossTotal + estimatedSvcFee) * (prepayEnabled ? prepayRate : 100) / 100);
    return { lines, total: finalPrepay, prepayRate: prepayEnabled ? prepayRate : 100 };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canFormSubmit) return;
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("createTenantOrder", {
        order_type: 'ticket',
        product_name: orderName || ticketData.performance_name || "票务需求",
        quantity: 1,
        user_email: user.email,
        user_name: user.full_name || user.email,
        user_note: userNote || "",
        note_image_url: noteImageUrls?.[0] || null,
        payment_method: paymentMethod?.value || null,
        prepayment_currency: paymentMethod?.payment_currency || "JPY",
        product_image_url: ticketData.product_image_url || null,
        ticket_data: {
          ...ticketData,
          performance_name: ticketData.performance_name || "",
          purchase_link: ticketData.purchase_link || "",
          account_count: parseFloat(ticketData.account_count) || 1,
          additional_fee_jpy: parseFloat(ticketData.additional_fee_jpy) || 0,
          lottery_win_bonus_jpy: parseFloat(ticketData.lottery_win_bonus_jpy) || 0,
          seats: (ticketData.seats || []).map(s => ({
            seat_type: s.seat_type,
            quantity: parseFloat(s.quantity) || 0,
            price_jpy: parseFloat(s.price_jpy) || 0,
          })),
        },
      });
      const order = res.data?.order;
      if (!order) throw new Error(res.data?.error || "提交失败");
      const selectedCurrency = paymentMethod?.payment_currency || "JPY";
      // Rebuild breakdown using server-authoritative prepaid total so the Payment page shows the correct amount
      const feeBreakdown = buildFeeBreakdown(order.prepayment_amount);
      const breakdownEncoded = encodeURIComponent(JSON.stringify(feeBreakdown));
      navigate(`${createPageUrl("Payment")}?order_id=${order.id}&pm_id=${paymentMethod?.value || "other"}&pay_currency=${selectedCurrency}&ticket_breakdown=${breakdownEncoded}`);
    } catch (err) {
      toast.error(err.message);
      setSubmitting(false);
    }
  };

  if (loading) return <p className="text-gray-400 text-sm py-8 text-center">加载中...</p>;

  if (!config?.enabled) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <Alert className="border-gray-200">
          <AlertTriangle className="w-4 h-4 text-gray-500" />
          <AlertDescription className="text-gray-600 text-sm">票务购买需求功能未开启。</AlertDescription>
        </Alert>
      </div>
    );
  }

  const prepaid = calcTicketPrepaidTotal(ticketData);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Ticket className="w-5 h-5 text-violet-600" />票务购买需求
        </h1>
        <p className="text-sm text-gray-500 mt-1">填写演出票务代购需求，我们将为您抢票/抽票</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card className="border-gray-200">
          <CardHeader className="pb-3 border-b border-gray-100">
            <CardTitle className="text-sm font-semibold text-gray-700">需求信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <TicketRequestFields
              data={ticketData}
              onChange={setTd}
              config={config}
              timeErrors={timeErrors}
            />
            {/* 订单名：performance_name 自动填充，可手动修改 */}
            <div className="border-t border-gray-100 pt-3">
              <Label className="text-sm font-medium">订单名（方便辨认，可修改）</Label>
              <Input
                className="mt-1 text-sm"
                placeholder="如 演唱会-S席x2"
                value={orderName}
                onChange={e => {
                  setOrderNameManual(true);
                  setOrderName(e.target.value);
                }}
              />
            </div>
            {/* 备注 */}
            <div className="border-t border-gray-100 pt-3">
              <Label className="text-sm font-medium mb-2 block">备注（可选）</Label>
              <RichTextInput
                value={userNote}
                onChange={setUserNote}
                imageUrls={noteImageUrls}
                onImageUrls={setNoteImageUrls}
                placeholder="其他特殊说明..."
                maxImages={3}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        <TicketPrepaySummary ticketData={ticketData} config={config} />

        <Card className="border-gray-200">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-gray-700">付款方式</CardTitle></CardHeader>
          <CardContent>
            <PaymentMethodSelector prefetched={paymentMethods} value={paymentMethod?.value} onChange={setPaymentMethod} activeColor="border-violet-500 bg-violet-50 text-violet-700 ring-2 ring-violet-200" />
          </CardContent>
        </Card>

        {canSubmit ? (
          <>
            <Button
              type="submit"
              disabled={!canFormSubmit || submitting}
              className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50"
            >
              <Ticket className="w-4 h-4 mr-2" />
              {submitting ? "提交中..." : "提交并前往付款"}
            </Button>
            {/* Missing fields hint */}
            {(missingFields.length > 0 || hasTimeErrors) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
                {missingFields.length > 0 && (
                  <p>以下必填项目尚未完成：<span className="font-medium">{missingFields.join("、")}</span></p>
                )}
                {hasTimeErrors && (
                  <p>请修正上方时间错误后再提交。</p>
                )}
              </div>
            )}
          </>
        ) : (
          <Button type="button" disabled className="w-full bg-gray-400">
            <Lock className="w-4 h-4 mr-2" />您没有权限提交购买需求
          </Button>
        )}
      </form>
    </div>
  );
}