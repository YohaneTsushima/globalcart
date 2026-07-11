/**
 * MultiImageUploader — 多图上传组件
 * 支持：缩略图网格预览、点击/拖拽上传、Ctrl+V 粘贴（图片或URL）、URL 输入框、服务端删除
 */
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { X, Plus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageWithViewer } from "@/components/common/ImageViewer";

export default function MultiImageUploader({
  value = [],
  onChange,
  uploadPath = "",
  label,
  id = "multi-image-uploader",
  className = "",
}) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file, path: uploadPath });
      onChange?.([...(value || []), file_url]);
    } catch (err) {
      console.error("图片上传失败:", err);
      toast.error("图片上传失败：" + (err?.message || "未知错误"));
    } finally {
      setUploading(false);
    }
  };

  const deleteImage = async (imageUrl) => {
    if (!imageUrl) return;
    onChange?.((value || []).filter((u) => u !== imageUrl));
    try {
      await base44.integrations.Core.DeleteFile({ imageUrl, path: uploadPath });
    } catch (_) {}
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (const it of items) {
        if (it.type.startsWith("image/")) {
          e.preventDefault();
          uploadFile(it.getAsFile());
          return;
        }
      }
    }
    const text = e.clipboardData?.getData("text") || "";
    if (text && /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(text.trim())) {
      e.preventDefault();
      onChange?.([...(value || []), text.trim()]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    for (const file of files) {
      uploadFile(file);
    }
  };

  return (
    <div className={className}>
      {label && <Label className="text-xs text-gray-500 mb-1.5 block">{label}</Label>}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {value.map((url, i) => (
            <div key={i} className="relative group">
              <ImageWithViewer src={url} alt={label || ""}>
                <img
                  src={url}
                  alt=""
                  className="w-12 h-12 rounded object-cover border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                />
              </ImageWithViewer>
              <button
                type="button"
                onClick={() => deleteImage(url)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <label
        className={`cursor-pointer flex flex-col items-center justify-center gap-1 px-2.5 py-3 border-2 border-dashed rounded-md text-xs transition-colors ${
          dragging
            ? "border-blue-400 bg-blue-50 text-blue-500"
            : "border-gray-300 text-gray-400 hover:border-gray-400"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Plus className="w-4 h-4" />
        )}
        <span>{uploading ? "上传中..." : "点击或拖拽上传"}</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          multiple
          onChange={(e) => {
            Array.from(e.target.files).forEach((f) => uploadFile(f));
          }}
        />
      </label>
      <input
        type="text"
        placeholder="粘贴图片URL或剪切板图片（Ctrl+V）"
        className="mt-1.5 w-full h-7 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onPaste={handlePaste}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const url = e.target.value.trim();
            if (url) {
              onChange?.([...(value || []), url]);
              e.target.value = "";
            }
          }
        }}
      />
    </div>
  );
}
