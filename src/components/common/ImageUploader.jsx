/**
 * ImageUploader — 通用图片上传组件
 * 支持：点击上传、拖拽、Ctrl+V 粘贴（图片或URL）、URL输入框、预览+删除
 */
import { useTranslation } from "@/lib/LocaleContext";
import { useLocale } from "@/lib/LocaleContext";
import { X, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ImageUploader({
  value = "",
  onChange,
  onDelete,
  uploading = false,
  label,
  id = "image-uploader",
  className = "",
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();

  const handleFile = (file) => {
    if (file && file.type?.startsWith("image/")) {
      onChange?.(file);
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.startsWith("image/")) {
        e.preventDefault();
        handleFile(it.getAsFile());
        return;
      }
    }
    // 粘贴图片 URL
    const text = e.clipboardData?.getData("text") || "";
    if (text && /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(text)) {
      e.preventDefault();
      onChange?.(text);
    }
  };

  return (
    <div className={className}>
      {label && <Label className="text-sm font-medium mb-2 block">{label}</Label>}
      <div
        className={`border-2 rounded-lg transition-colors ${
          value ? "border-green-300 bg-green-50" :
          uploading ? "border-blue-200 bg-blue-50" :
          "border-gray-200 hover:border-blue-300"
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFile(e.dataTransfer.files?.[0]);
        }}
        onPaste={handlePaste}
      >
        {value ? (
          <div className="p-3 flex items-center gap-3 cursor-pointer" onClick={() => document.getElementById(id)?.click()}>
            <img src={value} alt="" className="h-16 w-16 rounded object-cover border border-green-200" />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-400">{t("点击更换或拖拽新图片", locale)}</div>
            </div>
            <button
              type="button"
              className="p-1 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div
              className="p-3 cursor-text"
              tabIndex={0}
              onClick={() => document.getElementById(id)?.click()}
            >
              {uploading ? (
                <div className="flex items-center gap-2 text-blue-500 text-sm">
                  <Upload className="w-4 h-4 animate-pulse" />
                  <span>{t("上传中...", locale)}</span>
                </div>
              ) : (
                <div className="text-sm text-gray-500">{t("点击上传、拖拽图片到此 或 Ctrl+V 粘贴剪切板图片", locale)}</div>
              )}
            </div>
            <div className="border-t border-dashed border-gray-200 px-3 py-2">
              <Input
                type="text"
                placeholder={t("或输入图片 URL", locale)}
                value={value || ""}
                onChange={(e) => onChange?.(e.target.value)}
                className="text-sm border-0 shadow-none bg-transparent px-0 h-7 focus-visible:ring-0"
              />
            </div>
          </>
        )}
      </div>
      <input
        id={id}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files[0]; if (f) handleFile(f); }}
        disabled={uploading}
      />
    </div>
  );
}
