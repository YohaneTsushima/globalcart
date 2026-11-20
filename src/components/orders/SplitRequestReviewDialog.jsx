/**
 * SplitRequestReviewDialog
 * 管理员审核「入库后拆单」申请：逐个上传入库图片（不传则用商品图），通过或驳回。
 */
import { useState } from "react";
import { X, Loader2, Scissors, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import ImageUploader from "@/components/common/ImageUploader";
import { base44 } from "@/api/base44Client";
import { persistentToastError } from "@/lib/toastUtils.jsx";

export default function SplitRequestReviewDialog({ request, order, onClose, onSuccess }) {
  const items = request?.items || [];
  const [images, setImages] = useState(items.map(it => it.image_url || ""));
  const [uploadingIndex, setUploadingIndex] = useState(-1);
  const [adminNote, setAdminNote] = useState("");
  const [submitting, setSubmitting] = useState(null); // "approve" | "reject"

  const total = items.reduce((s, it) => s + (Number(it.price_jpy) || 0), 0);
  const parentAmount = Number(order?.estimated_jpy) || 0;

  const handleUpload = async (index, file) => {
    if (!file) return;
    setUploadingIndex(index);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file, path: "orderArrival" });
      setImages(prev => prev.map((v, i) => (i === index ? file_url : v)));
    } catch (e) {
      persistentToastError("图片上传失败");
    } finally {
      setUploadingIndex(-1);
    }
  };

  const submit = async (approve) => {
    if (submitting) return;
    setSubmitting(approve ? "approve" : "reject");
    try {
      const res = await base44.functions.invoke("order/split/review", {
        request_id: request.id,
        approve,
        admin_note: adminNote.trim(),
        items: items.map((it, i) => ({ ...it, image_url: images[i] || "" })),
      });
      const code = res?.data?.code;
      if (code !== 0 && code !== 200) {
        throw new Error(res?.data?.msg || "操作失败");
      }
      onSuccess?.();
    } catch (err) {
      persistentToastError(err?.response?.data?.message || err?.message || "操作失败");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">拆单申请审核</h3>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-500" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-xs text-gray-600 space-y-0.5">
            <p>原订单：<b>{order?.order_number || request?.order_id}</b> · {order?.product_name || "-"}</p>
            <p>原订单金额：<b>{parentAmount.toLocaleString()} JPY</b>　拆出合计：<b>{total.toLocaleString()} JPY</b></p>
            <p className="text-gray-400">通过后：生成 {items.length} 个子订单（已入库），原订单金额扣减为 {Math.max(parentAmount - total, 0).toLocaleString()} JPY</p>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{item.name}</span>
                  <span className="text-sm font-semibold text-gray-700">{Number(item.price_jpy || 0).toLocaleString()} JPY</span>
                </div>
                {item.note && <p className="text-xs text-gray-500 whitespace-pre-wrap">{item.note}</p>}
                <div>
                  <Label className="text-xs text-gray-500">入库图片（不传则使用商品图片）</Label>
                  <div className="mt-1">
                    <ImageUploader
                      value={images[index] || ""}
                      onChange={file => handleUpload(index, file)}
                      onDelete={() => setImages(prev => prev.map((v, i) => (i === index ? "" : v)))}
                      uploading={uploadingIndex === index}
                      label="上传入库图片"
                      id={`split-request-image-${index}`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div>
            <Label className="text-xs text-gray-500">审核备注（可选）</Label>
            <Textarea
              className="mt-1 text-sm"
              rows={2}
              value={adminNote}
              onChange={e => setAdminNote(e.target.value)}
              placeholder="驳回原因 / 备注..."
            />
          </div>
        </div>

        <div className="px-5 py-3 border-t flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50"
            disabled={!!submitting}
            onClick={() => submit(false)}
          >
            {submitting === "reject"
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />驳回中...</>
              : <><XCircle className="w-3.5 h-3.5 mr-1.5" />驳回</>}
          </Button>
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700"
            disabled={!!submitting}
            onClick={() => submit(true)}
          >
            {submitting === "approve"
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />处理中...</>
              : <><CheckCircle className="w-3.5 h-3.5 mr-1.5" />通过并生成订单</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
