/**
 * AvatarEditor — 统一的用户头像模块
 * 头像预览 + 选择图片/拖拽图片 + 裁剪（AvatarCropModal）+ 上传
 * 用于 UserPreferences 和 EditProfileModal
 */
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import AvatarCropModal from "@/components/common/AvatarCropModal";
import { User, Camera, Lock } from "lucide-react";

export default function AvatarEditor({ value, onChange, size = 64, disabled = false }) {
  const [cropSrc, setCropSrc] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const readImageFile = (file) => {
    if (!file || !file.type?.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result);
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    readImageFile(file);
  };

  const handleCropConfirm = async (blob) => {
    setUploading(true);
    const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
    const { file_url } = await base44.integrations.Core.UploadFile({ file, path: "avatar" });
    onChange(file_url);
    setCropSrc(null);
    setUploading(false);
  };

  const dragProps = disabled ? {} : {
    onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); },
    onDragEnter: (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); },
    onDragLeave: (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); },
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      readImageFile(e.dataTransfer.files?.[0]);
    },
  };

  return (
    <>
      {cropSrc && (
        <AvatarCropModal
          imageSrc={cropSrc}
          uploading={uploading}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropSrc(null)}
          onReplaceImage={readImageFile ? (src) => setCropSrc(src) : undefined}
        />
      )}
      <div className="relative inline-block flex-shrink-0" {...dragProps}>
        <div
          className={`rounded-full bg-gray-100 border overflow-hidden flex items-center justify-center transition-all ${
            dragOver ? "border-red-400 ring-2 ring-red-200 scale-105" : "border-gray-200"
          }`}
          style={{ width: size, height: size }}
          title={disabled ? undefined : "点击相机图标或拖拽图片到此处"}
        >
          {value ? (
            <img src={value} alt="头像" className="w-full h-full object-cover pointer-events-none" />
          ) : (
            <User className="text-gray-400 pointer-events-none" style={{ width: size / 2, height: size / 2 }} />
          )}
        </div>
        {disabled ? (
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-gray-400 rounded-full flex items-center justify-center">
            <Lock className="w-3 h-3 text-white" />
          </div>
        ) : value ? (
          // Has avatar: camera opens the editor directly
          <button
            type="button"
            className="absolute -bottom-1 -right-1 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-red-700"
            onClick={() => setCropSrc(value)}
            disabled={uploading}
          >
            <Camera className="w-3 h-3 text-white" />
          </button>
        ) : (
          // No avatar: camera opens file picker
          <label className="absolute -bottom-1 -right-1 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-red-700">
            <Camera className="w-3 h-3 text-white" />
            <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} disabled={uploading} />
          </label>
        )}
        {uploading && (
          <p className="absolute -bottom-5 left-0 right-0 text-center text-xs text-gray-400">上传中...</p>
        )}
      </div>
    </>
  );
}