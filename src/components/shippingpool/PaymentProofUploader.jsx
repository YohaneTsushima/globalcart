/**
 * PaymentProofUploader
 * Robust upload zone for payment proof images.
 * Supports: click-to-select, drag-and-drop, paste (Ctrl+V).
 */
import { useState, useRef, useCallback } from "react";
import { Loader2, Upload, CheckCircle } from "lucide-react";
import { ImageWithViewer } from "@/components/common/ImageViewer";

export default function PaymentProofUploader({ selectedMethodMeta, uploadingProof, onUpload }) {
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);
  const pasteZoneRef = useRef(null);

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    // Show local preview immediately
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    onUpload(file);
  }, [onUpload]);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith("image/"));
    if (file) handleFile(file);
  };

  const handlePaste = (e) => {
    const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith("image/"));
    if (item) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) handleFile(file);
    }
  };

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so same file can be re-selected
    e.target.value = "";
  };

  return (
    <div className="space-y-2">
      {/* Payment note / QR code */}
      {(selectedMethodMeta?.payment_note || selectedMethodMeta?.payment_description || selectedMethodMeta?.image_url || selectedMethodMeta?.payment_qr_code) && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
          {(selectedMethodMeta.payment_qr_code || selectedMethodMeta.image_url) && (
            <div className="text-center">
              <ImageWithViewer src={selectedMethodMeta.payment_qr_code || selectedMethodMeta.image_url} alt="收款码">
                <img
                  src={selectedMethodMeta.payment_qr_code || selectedMethodMeta.image_url}
                  alt="收款码"
                  className="h-40 mx-auto rounded object-contain border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                />
              </ImageWithViewer>
            </div>
          )}
          {(selectedMethodMeta.payment_note || selectedMethodMeta.payment_description) && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap text-center">
              {selectedMethodMeta.payment_note || selectedMethodMeta.payment_description}
            </p>
          )}
        </div>
      )}

      {/* Upload zone — click / drag / paste all work here */}
      <div
        className={`relative rounded-lg border-2 border-dashed transition-colors cursor-pointer
          ${dragging ? "border-orange-400 bg-orange-50" : uploadingProof ? "border-blue-300 bg-blue-50" : "border-gray-300 hover:border-orange-400 hover:bg-orange-50/40"}
        `}
        onClick={() => !uploadingProof && fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
        style={{ outline: "none" }}
      >
        <div className="flex flex-col items-center gap-2 py-6 px-3 text-sm select-none">
          {uploadingProof ? (
            <>
              {previewUrl && (
                <img src={previewUrl} alt="预览" className="w-20 h-20 rounded object-cover border border-blue-200 mb-1" />
              )}
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="text-blue-600 font-medium">上传中，请稍候…</span>
            </>
          ) : dragging ? (
            <>
              <Upload className="w-7 h-7 text-orange-500" />
              <span className="text-orange-600 font-medium">松开鼠标上传图片</span>
            </>
          ) : (
            <>
              <Upload className="w-7 h-7 text-gray-400" />
              <span className="text-gray-600 font-medium">点击选择 / 拖拽 / 粘贴截图</span>
              <span className="text-xs text-gray-400">支持 PNG、JPG、WEBP 等图片格式</span>
            </>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploadingProof}
          onChange={handleInputChange}
        />
      </div>

      {/* Dedicated paste input box */}
      <input
        type="text"
        readOnly
        placeholder="📋 点击此处，然后按 Ctrl+V / ⌘V 粘贴截图"
        className="w-full h-9 px-3 text-xs border border-gray-300 rounded-md bg-gray-50 text-gray-500 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 focus:bg-white transition-colors cursor-text"
        onPaste={handlePaste}
      />
    </div>
  );
}