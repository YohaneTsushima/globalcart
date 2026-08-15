/**
 * ImageEffectsPanel — 图片效果编辑面板
 * 新逻辑：
 *   - 裁切 Tab：用户在原图上预选裁切区域（不上传，不破坏原图）
 *   - 效果 Tab：实时预览裁切后的效果（canvas 渲染，不上传）
 *   - 点击"应用"：同时执行裁切上传 + 效果保存
 *   - 用户随时可回裁切 Tab 重新调整，原图不丢失
 */
import { useState, useRef, useCallback } from "react";
import ReactCrop, { centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, ImageIcon, Crop, Sliders, RotateCcw } from "lucide-react";

// ─── 常量 ──────────────────────────────────────────────────
const ASPECT_PRESETS = [
  { label: "自由", value: undefined },
  { label: "16:9", value: 16 / 9 },
  { label: "4:3",  value: 4 / 3 },
  { label: "3:2",  value: 3 / 2 },
  { label: "1:1",  value: 1 },
  { label: "3:4",  value: 3 / 4 },
  { label: "2:3",  value: 2 / 3 },
  { label: "9:16", value: 9 / 16 },
];

// ─── Banner 高度预览覆层 ────────────────────────────────────
// 对应 BannerDisplay 的 HEIGHT_PX: small=80, medium=160, large=260
const BANNER_HEIGHT_RATIOS = [
  { ratio: 80 / 260,  color: "#f59e0b" }, // 小 amber
  { ratio: 160 / 260, color: "#3b82f6" }, // 中 blue
];

// completedCrop: px 坐标（相对于 img 显示尺寸）
// 必须作为 ReactCrop 的直接子元素渲染，定位基准 = ReactCrop 根 div（与 img 左上角对齐）
function BannerHeightOverlay({ completedCrop }) {
  const { x, y, width, height } = completedCrop;
  return (
    <>
      {BANNER_HEIGHT_RATIOS.map(({ ratio, color }, i) => {
        const h = height * ratio;
        const topY = y + (height - h) / 2;
        return (
          <div
            key={i}
            className="pointer-events-none"
            style={{
              position: "absolute",
              left: x,
              top: topY,
              width,
              height: h,
              border: `2px dashed ${color}`,
              zIndex: 90,
              boxSizing: "border-box",
            }}
          />
        );
      })}
    </>
  );
}

// ─── SliderField ───────────────────────────────────────────
export function SliderField({ label, value, min, max, unit, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs text-gray-500">{label}</Label>
        <span className="text-xs text-gray-400 tabular-nums">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded accent-blue-600"
      />
    </div>
  );
}

// ─── 工具：把 completedCrop 区域渲染到 canvas，返回 dataURL ──
function getCroppedDataUrl(image, completedCrop) {
  if (!image || !completedCrop || completedCrop.width === 0 || completedCrop.height === 0) return null;
  const toNatX = image.naturalWidth  / image.width;
  const toNatY = image.naturalHeight / image.height;
  const srcX = completedCrop.x * toNatX;
  const srcY = completedCrop.y * toNatY;
  const srcW = completedCrop.width  * toNatX;
  const srcH = completedCrop.height * toNatY;
  const canvas = document.createElement("canvas");
  canvas.width  = Math.round(srcW);
  canvas.height = Math.round(srcH);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

// ─── ImageEditModal ────────────────────────────────────────
export function ImageEditModal({
  imageUrl,
  initialMode = "edit",
  blurAmount = 0,
  brightness = 100,
  overlayColor = "#000000",
  overlayOpacity = 0,
  previewTitle,
  onChange,
  onClose,
  aspect,
  showHeightPreview = false,
  uploadPath = "",
}) {
  const fileInputRef = useRef();
  const imgRef = useRef();
  const cbRef = useRef(Date.now());

  const [tab, setTab] = useState(initialMode === "crop" ? "crop" : "effect");
  const [local, setLocal] = useState({ blurAmount, brightness, overlayColor, overlayOpacity });

  // 原图 URL（可被旋转/更换图片更新，但不被裁切更新）
  const [sourceImageUrl, setSourceImageUrl] = useState(imageUrl);

  // 预裁切状态（仅预选，不上传）
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState();
  // 缓存 completedCrop 时图片的显示尺寸，防止 hidden 后 DOM 尺寸归零
  const cropImgSizeRef = useRef({ width: 0, height: 0 });

  // 效果 Tab 用于预览的裁切后 dataURL（纯展示，不上传）
  const [previewDataUrl, setPreviewDataUrl] = useState(null);

  const [uploading, setUploading] = useState(false);

  const initPresetIdx = (() => {
    if (aspect == null) return 0;
    const idx = ASPECT_PRESETS.findIndex(p => p.value != null && Math.abs(p.value - aspect) < 0.01);
    return idx >= 0 ? idx : 0;
  })();
  const [presetIdx, setPresetIdx] = useState(initPresetIdx);
  const currentAspect = aspect != null ? aspect : ASPECT_PRESETS[presetIdx].value;
  const patch = (p) => setLocal(prev => ({ ...prev, ...p }));

  // 切换到效果 Tab 时，实时生成裁切预览（此时 img 还可见，尺寸正确）
  const handleSwitchToEffect = useCallback(() => {
    const img = imgRef.current;
    if (img && completedCrop && completedCrop.width > 0) {
      // 同步缓存当前显示尺寸
      cropImgSizeRef.current = { width: img.width, height: img.height };
      const dataUrl = getCroppedDataUrl(img, completedCrop);
      if (dataUrl) setPreviewDataUrl(dataUrl);
      else setPreviewDataUrl(null);
    } else {
      setPreviewDataUrl(null);
    }
    setTab("effect");
  }, [completedCrop]);

  // 切回裁切 Tab
  const handleSwitchToCrop = useCallback(() => {
    setTab("crop");
  }, []);

  // ── Crop helpers ──
  const resetCrop = useCallback((newAspect) => {
    const image = imgRef.current;
    if (!image) return;
    const { naturalWidth: w, naturalHeight: h } = image;
    const ratio = newAspect ?? w / h;
    const c = centerCrop(makeAspectCrop({ unit: "%", width: 85 }, ratio, w, h), w, h);
    setCrop(c);
    setCompletedCrop(undefined);
    setPreviewDataUrl(null);
  }, []);

  const onImageLoad = (e) => {
    const img = e.currentTarget;
    const { naturalWidth: w, naturalHeight: h } = img;
    const ratio = currentAspect ?? w / h;
    const c = centerCrop(makeAspectCrop({ unit: "%", width: 85 }, ratio, w, h), w, h);
    setCrop(c);
  };

  const handlePresetClick = (idx) => {
    setPresetIdx(idx);
    resetCrop(ASPECT_PRESETS[idx].value);
  };

  // ── Rotate CCW（旋转原图，裁切重置）──
  const handleRotateCCW = () => {
    const image = imgRef.current;
    if (!image) return;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalHeight;
    canvas.height = image.naturalWidth;
    const ctx = canvas.getContext("2d");
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(image, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      cbRef.current = Date.now();
      setSourceImageUrl(URL.createObjectURL(blob));
      setCrop(undefined);
      setCompletedCrop(undefined);
      setPreviewDataUrl(null);
    }, "image/jpeg", 0.92);
  };

  // ── File replace ──
  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    cbRef.current = Date.now();
    setSourceImageUrl(URL.createObjectURL(file));
    setCrop(undefined);
    setCompletedCrop(undefined);
    setPreviewDataUrl(null);
    setTab("crop");
  };

  // ── Final apply：此时才真正上传裁切结果 ──
  const handleApply = async () => {
    const image = imgRef.current;
    // 如果有有效裁切选区，上传裁切后图片；否则直接用原图
    if (image && completedCrop && completedCrop.width > 0 && completedCrop.height > 0) {
      setUploading(true);
      // 使用缓存的显示尺寸（防止 hidden 后 DOM 尺寸变为 0）
      const displayW = cropImgSizeRef.current.width || image.width;
      const displayH = cropImgSizeRef.current.height || image.height;
      const toNatX = image.naturalWidth  / displayW;
      const toNatY = image.naturalHeight / displayH;
      const srcX = completedCrop.x * toNatX;
      const srcY = completedCrop.y * toNatY;
      const srcW = completedCrop.width  * toNatX;
      const srcH = completedCrop.height * toNatY;
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(srcW);
      canvas.height = Math.round(srcH);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async (blob) => {
        if (!blob) { setUploading(false); return; }
        const file = new File([blob], "cropped.jpg", { type: "image/jpeg" });
        const { file_url } = await base44.integrations.Core.UploadFile({ file, path: uploadPath });
        setUploading(false);
        onChange({ ...local, bgImageUrl: file_url });
        onClose();
      }, "image/jpeg", 0.92);
    } else {
      // 无裁切
      if (sourceImageUrl.startsWith("blob:")) {
        // blob URL from a replaced/rotated image that was never cropped — upload it as-is
        setUploading(true);
        const res = await fetch(sourceImageUrl);
        const blob = await res.blob();
        const file = new File([blob], "image.jpg", { type: blob.type || "image/jpeg" });
        const { file_url } = await base44.integrations.Core.UploadFile({ file, path: uploadPath });
        setUploading(false);
        onChange({ ...local, bgImageUrl: file_url });
      } else {
        // Already a persistent URL — just save effects
        onChange({ ...local, bgImageUrl: sourceImageUrl });
      }
      onClose();
    }
  };

  // 效果预览用的图片：优先用裁切预览 dataURL，否则用原图
  const effectPreviewUrl = previewDataUrl || sourceImageUrl;

  const hasCropSelection = completedCrop && completedCrop.width > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full" style={{ maxWidth: 780, maxHeight: "92vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-800 text-sm">编辑图片</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        {/* Body: left preview + right panel */}
        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>

          {/* ── Left: Preview ── */}
          <div className="flex-1 bg-gray-50 flex items-center justify-center p-4 relative overflow-hidden border-r border-gray-100">
            {sourceImageUrl ? (
              <>
                {/* 裁切 Tab：ReactCrop 显示，效果 Tab：隐藏但保持 imgRef 有效以便 handleApply 读取坐标 */}
                <div className={`w-full h-full overflow-hidden flex items-center justify-center select-none ${tab !== "crop" ? "hidden" : ""}`}>
                  <ReactCrop
                    crop={crop}
                    onChange={(px, pct) => setCrop(pct)}
                    onComplete={(px) => {
                      setCompletedCrop(px);
                      if (imgRef.current) {
                        cropImgSizeRef.current = { width: imgRef.current.width, height: imgRef.current.height };
                      }
                    }}
                    aspect={currentAspect}
                    minWidth={20}
                    minHeight={20}
                  >
                    <img
                      ref={imgRef}
                      src={sourceImageUrl.startsWith("blob:") ? sourceImageUrl : `${sourceImageUrl}${sourceImageUrl.includes("?") ? "&" : "?"}cb=${cbRef.current}`}
                      crossOrigin="anonymous"
                      onLoad={onImageLoad}
                      style={{ maxWidth: "480px", maxHeight: "55vh", display: "block" }}
                      alt="crop"
                      draggable={false}
                    />
                    {showHeightPreview && completedCrop && completedCrop.width > 0 && (
                      <BannerHeightOverlay completedCrop={completedCrop} />
                    )}
                  </ReactCrop>
                </div>

                {/* 效果预览：显示裁切后区域（或原图）的完整图片叠加效果 */}
                {tab === "effect" && (
                  <div className="relative rounded-lg overflow-hidden shadow-md" style={{ maxWidth: "480px", maxHeight: "65vh" }}>
                    <img
                      src={effectPreviewUrl}
                      alt="preview"
                      style={{
                        display: "block",
                        maxWidth: "100%",
                        maxHeight: "65vh",
                        filter: `blur(${local.blurAmount}px) brightness(${local.brightness / 100})`,
                      }}
                    />
                    {local.overlayOpacity > 0 && (
                      <div className="absolute inset-0" style={{ backgroundColor: local.overlayColor, opacity: local.overlayOpacity / 100 }} />
                    )}
                    {previewTitle && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-white text-base font-bold drop-shadow">{previewTitle}</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-gray-300 flex flex-col items-center gap-2">
                <ImageIcon className="w-12 h-12" />
                <span className="text-xs">暂无图片</span>
              </div>
            )}
          </div>

          {/* ── Right: Controls ── */}
          <div className="w-56 flex-shrink-0 flex flex-col overflow-y-auto">
            {/* Tab switcher */}
            <div className="flex border-b border-gray-100 flex-shrink-0">
              <button
                onClick={handleSwitchToCrop}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                  tab === "crop" ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Crop className="w-3.5 h-3.5" />裁切
              </button>
              <button
                onClick={handleSwitchToEffect}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                  tab === "effect" ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />效果
              </button>
            </div>

            <div className="flex-1 p-3 space-y-4 overflow-y-auto">
              {tab === "crop" ? (
                <>
                  {/* 比例预设 */}
                  <div>
                    <Label className="text-xs text-gray-500 mb-2 block">宽高比</Label>
                    {aspect != null ? (
                      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                        <span>🔒</span>
                        <span>已锁定为 {ASPECT_PRESETS.find(p => p.value != null && Math.abs(p.value - aspect) < 0.01)?.label || `${aspect.toFixed(2)}:1`}</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-1">
                        {ASPECT_PRESETS.map((p, i) => (
                          <button
                            key={p.label}
                            onClick={() => handlePresetClick(i)}
                            className={`py-1 rounded text-xs font-medium transition-colors ${
                              presetIdx === i ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-2">拖动选框调整裁切区域，完成后切换到效果 Tab 预览</p>
                  </div>

                  {/* 旋转 */}
                  <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={handleRotateCCW}>
                    <RotateCcw className="w-3 h-3 mr-1" />逆时针旋转 90°
                  </Button>

                  {/* 去效果 Tab */}
                  <Button size="sm" className="w-full h-8 text-xs" onClick={handleSwitchToEffect}>
                    预览效果 →
                  </Button>

                  {/* 更换图片 */}
                  <div className="pt-2 border-t border-gray-100">
                    <Button size="sm" variant="outline" className="w-full h-8 text-xs"
                      onClick={() => fileInputRef.current?.click()}>
                      <Upload className="w-3 h-3 mr-1" />更换图片
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* 裁切状态提示 */}
                  {hasCropSelection ? (
                    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                      <Crop className="w-3 h-3 flex-shrink-0" />
                      <span>已预选裁切区域</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs text-gray-500">
                      <Crop className="w-3 h-3 flex-shrink-0" />
                      <span>未裁切（使用原图）</span>
                    </div>
                  )}

                  {/* 恢复默认 */}
                  <Button size="sm" variant="outline" className="w-full h-8 text-xs"
                    onClick={() => setLocal({ blurAmount: 0, brightness: 100, overlayColor: "#000000", overlayOpacity: 0 })}>
                    恢复默认效果
                  </Button>

                  {/* 效果滑块 */}
                  <SliderField label="模糊度" value={local.blurAmount} min={0} max={20} unit="px" onChange={v => patch({ blurAmount: v })} />
                  <SliderField label="明度" value={local.brightness} min={30} max={150} unit="%" onChange={v => patch({ brightness: v })} />
                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">遮罩颜色</Label>
                    <div className="flex items-center gap-1.5">
                      <input type="color" value={local.overlayColor}
                        onChange={e => patch({ overlayColor: e.target.value })}
                        className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0.5 flex-shrink-0" />
                      <Input className="h-7 text-xs font-mono" value={local.overlayColor}
                        onChange={e => patch({ overlayColor: e.target.value })} />
                    </div>
                  </div>
                  <SliderField label="遮罩透明度" value={local.overlayOpacity} min={0} max={80} unit="%" onChange={v => patch({ overlayOpacity: v })} />

                  {/* 回裁切 Tab */}
                  <div className="pt-2 border-t border-gray-100 space-y-2">
                    <Button size="sm" variant="outline" className="w-full h-8 text-xs"
                      onClick={handleSwitchToCrop}>
                      <Crop className="w-3 h-3 mr-1" />重新调整裁切
                    </Button>
                    <Button size="sm" variant="outline" className="w-full h-8 text-xs"
                      onClick={() => fileInputRef.current?.click()}>
                      <Upload className="w-3 h-3 mr-1" />更换图片
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Footer actions */}
            <div className="p-3 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={onClose}>取消</Button>
              <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleApply}
                disabled={!sourceImageUrl || uploading}>
                {uploading ? "处理中…" : "应用"}
              </Button>
            </div>
          </div>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files[0]; e.target.value = ""; if (f) handleFile(f); }} />
      </div>
    </div>
  );
}

// ─── ImageEffectsPanel ─────────────────────────────────────
export default function ImageEffectsPanel({
  imageUrl,
  blurAmount = 0,
  brightness = 100,
  overlayColor = "#000000",
  overlayOpacity = 0,
  previewTitle,
  aspect,
  onChange,
  onRemove,
}) {
  const fileInputRef = useRef();
  const [dragging, setDragging] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pendingNewFile, setPendingNewFile] = useState(null);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setPendingNewFile(URL.createObjectURL(file));
    setEditOpen(true);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  return (
    <>
      {editOpen && (
        <ImageEditModal
          imageUrl={pendingNewFile || imageUrl}
          initialMode={pendingNewFile ? "crop" : "edit"}
          blurAmount={blurAmount}
          brightness={brightness}
          overlayColor={overlayColor}
          overlayOpacity={overlayOpacity}
          previewTitle={previewTitle}
          aspect={aspect}
          onChange={(patch) => { onChange(patch); setPendingNewFile(null); }}
          onClose={() => { setEditOpen(false); setPendingNewFile(null); }}
        />
      )}

      <div className="space-y-3">
        {imageUrl ? (
          <div
            className={`relative rounded-lg overflow-hidden h-28 border-2 shadow-sm transition-colors ${dragging ? "border-blue-400 border-dashed" : "border-gray-300"}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <div className="absolute inset-0 bg-cover bg-center" style={{
              backgroundImage: `url(${imageUrl})`,
              filter: `blur(${blurAmount}px) brightness(${brightness / 100})`,
              transform: blurAmount > 0 ? "scale(1.05)" : undefined,
            }} />
            {overlayOpacity > 0 && (
              <div className="absolute inset-0" style={{ backgroundColor: overlayColor, opacity: overlayOpacity / 100 }} />
            )}
            {previewTitle && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-white text-sm font-bold drop-shadow">{previewTitle}</span>
              </div>
            )}
            {dragging ? (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-500/60">
                <div className="flex flex-col items-center gap-1 text-white">
                  <Upload className="w-5 h-5" />
                  <span className="text-xs font-medium">松开以上传图片</span>
                </div>
              </div>
            ) : (
              <div className="absolute top-2 right-2 flex gap-1">
                <Button size="sm" className="h-6 text-xs px-2 bg-white/80 text-gray-700 hover:bg-white"
                  onClick={() => setEditOpen(true)}>
                  编辑
                </Button>
                <Button size="sm" variant="destructive" className="h-6 text-xs px-2 bg-red-500/80 hover:bg-red-600"
                  onClick={onRemove}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`w-full h-20 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${
              dragging ? "border-blue-400 bg-blue-50 text-blue-500" : "border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500"
            }`}
          >
            <ImageIcon className="w-5 h-5" />
            <span className="text-xs">点击或拖拽图片至此上传</span>
          </button>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files[0]; e.target.value = ""; if (f) handleFile(f); }} />
      </div>
    </>
  );
}