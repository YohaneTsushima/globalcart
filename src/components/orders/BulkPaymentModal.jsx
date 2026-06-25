/**
 * BulkPaymentModal
 * Allows user to pay for multiple payment_pending orders at once.
 * Shows a summary of all selected orders, then lets user upload proof and confirm.
 */
import { useState } from "react";
import { X, CreditCard, Upload, CheckCircle, Package, Loader2, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { updateOrder } from "@/lib/tenantApi";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import PaymentMethodSelector from "@/components/common/PaymentMethodSelector";

export default function BulkPaymentModal({ orders, onClose, onSuccess }) {
  const [method, setMethod] = useState("");
  const [selectedMethodMeta, setSelectedMethodMeta] = useState(null);
  const [proofUrl, setProofUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alipayUrl, setAlipayUrl] = useState(null);
  const [generating, setGenerating] = useState(false);

  // Total by currency
  const totals = orders.reduce((acc, o) => {
    const cur = o.prepayment_currency || "CNY";
    acc[cur] = (acc[cur] || 0) + (o.prepayment_amount || 0);
    return acc;
  }, {});

  const formatTotal = (cur, val) => {
    if (cur === "JPY") return `${Math.round(val).toLocaleString()} yen`;
    if (cur === "CNY") return `${Math.round(val)} yuan`;
    return `${cur} ${val.toFixed(2)}`;
  };

  const handleUploadProof = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setProofUrl(file_url);
    setUploading(false);
  };

  const handleManualSubmit = async () => {
    setSubmitting(true);
    await Promise.all(orders.map(o =>
      updateOrder(o.id, {
        payment_method: method,
        payment_proof_url: proofUrl,
        payment_status: "paid",
        order_status: "pending_purchase",
        paid_amount: (o.paid_amount || 0) + (o.prepayment_amount || 0),
      })
    ));
    onSuccess?.();
  };

  // Alipay: generate a single combined link for all orders
  const handleGenerateAlipay = async () => {
    setGenerating(true);
    const res = await base44.functions.invoke("generateAlipayPaymentLink", {
      orderIds: orders.map(o => o.id),
      subject: `同一物流代购 - ${orders.length} 笔订单合并付款`,
      paymentType: "order",
    });
    const url = res.data?.paymentUrl;
    setAlipayUrl(url || null);
    setGenerating(false);
    if (url) window.open(url, "_blank");
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-semibold text-gray-900">批量付款</h2>
            <p className="text-xs text-gray-400 mt-0.5">已选 {orders.length} 笔待付款订单</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-500" /></button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Order list */}
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            {orders.map((o, i) => (
              <div key={o.id} className={`flex items-center justify-between px-3 py-2.5 text-sm ${i > 0 ? "border-t border-gray-100" : ""}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-800 truncate">{o.product_name}</span>
                  {o.order_number && <span className="text-xs text-gray-400 flex-shrink-0">{o.order_number}</span>}
                </div>
                <span className="text-gray-700 font-medium flex-shrink-0 ml-2">
                  {o.prepayment_currency === "JPY"
                    ? `${Math.round(o.prepayment_amount || 0).toLocaleString()} yen`
                    : `${o.prepayment_currency || "CNY"} ${Math.round(o.prepayment_amount || 0)}`}
                </span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            <p className="text-xs text-red-500 font-medium mb-1">合计金额</p>
            {Object.entries(totals).map(([cur, val]) => (
              <p key={cur} className="text-lg font-bold text-red-700">{formatTotal(cur, val)}</p>
            ))}
            {Object.keys(totals).length > 1 && (
              <p className="text-xs text-red-400 mt-1">含多种货币，请按实际金额分别付款</p>
            )}
          </div>

          {/* Method selection */}
          <div>
            <Label className="text-sm mb-2 block">选择支付方式</Label>
            <PaymentMethodSelector
              value={method}
              onChange={m => { setMethod(m.value); setSelectedMethodMeta(m); setAlipayUrl(null); setProofUrl(""); }}
            />
          </div>

          {/* Alipay: single combined link */}
          {method === "alipay" && (
            <div className="space-y-3">
              {!alipayUrl ? (
                <Button className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={handleGenerateAlipay} disabled={generating}>
                  {generating
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成合并付款链接中...</>
                    : <><ExternalLink className="w-4 h-4 mr-2" />生成合并支付宝付款链接</>}
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-700 font-medium flex items-center gap-1.5 mb-2">
                      <CheckCircle className="w-4 h-4" />合并付款链接已生成
                    </p>
                    <a href={alipayUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-md transition-colors">
                      <ExternalLink className="w-4 h-4" />重新打开支付宝付款页
                    </a>
                  </div>
                  <p className="text-xs text-gray-400 text-center">支付宝付款成功后系统将自动更新所有订单状态</p>
                  <Button variant="outline" size="sm" className="w-full text-xs"
                    onClick={() => setAlipayUrl(null)}>
                    重新生成链接
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Other methods: single proof upload */}
          {method && method !== "alipay" && (
            <div className="space-y-3">
              {(selectedMethodMeta?.paymentDescription || selectedMethodMeta?.payment_note || selectedMethodMeta?.paymentQrCode || selectedMethodMeta?.image_url) ? (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                  {(selectedMethodMeta.paymentQrCode || selectedMethodMeta.image_url) && (
                    <div className="text-center">
                      <img src={selectedMethodMeta.paymentQrCode || selectedMethodMeta.image_url} alt="收款码" className="h-40 mx-auto rounded object-contain border border-gray-200" />
                    </div>
                  )}
                  {(selectedMethodMeta.paymentDescription || selectedMethodMeta.payment_note) && (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap text-center">{selectedMethodMeta.paymentDescription || selectedMethodMeta.payment_note}</p>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 text-center">
                  请联系客服获取收款账号，付款后上传凭证（可上传同一张截图）
                </div>
              )}
              <div>
                <Label className="text-sm">上传付款凭证</Label>
                <label className="cursor-pointer block mt-1">
                  <div className={`flex items-center gap-2 px-3 py-2.5 border-2 border-dashed rounded-lg text-sm justify-center transition-colors ${
                    proofUrl ? "border-green-300 bg-green-50 text-green-700" : "border-gray-200 text-gray-400 hover:border-gray-300"
                  }`}>
                    {proofUrl
                      ? <><CheckCircle className="w-4 h-4" />凭证已上传</>
                      : <><Upload className="w-4 h-4" />{uploading ? "上传中..." : "点击上传截图"}</>}
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handleUploadProof} disabled={uploading} />
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          {method && method !== "alipay" && (
            <Button size="sm" disabled={!proofUrl || submitting} className="bg-red-600 hover:bg-red-700"
              onClick={handleManualSubmit}>
              {submitting ? "提交中..." : `确认付款 (${orders.length} 笔)`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}