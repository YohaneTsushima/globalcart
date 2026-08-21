/**
 * AvatarCropModal — pure Canvas implementation
 * - Fixed circular crop window; user drags the image underneath it
 * - Slider to zoom in/out
 * - No react-image-crop dependency (avoids coordinate-system bugs with zoom)
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { X, Check, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

const CANVAS_SIZE = 320; // display canvas px
const OUTPUT_SIZE = 400; // output image px

export default function AvatarCropModal({ imageSrc, onConfirm, onCancel, uploading, onReplaceImage }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  // Image position (offset from canvas centre) and scale
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Drag state stored in a ref so event handlers don't need re-binding
  const drag = useRef({ active: false, startX: 0, startY: 0, startOffX: 0, startOffY: 0 });

  // Load image once
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";  // 新增这行
    img.onload = () => {
      imgRef.current = img;
      // Start scale: fill the circle
      const initScale = Math.max(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height);
      setScale(initScale);
      setOffset({ x: 0, y: 0 });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Redraw whenever offset / scale change
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Draw image centred at (CANVAS_SIZE/2 + offset)
    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, cx + offset.x - w / 2, cy + offset.y - h / 2, w, h);

    // Dark overlay outside circle
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.arc(cx, cy, CANVAS_SIZE / 2 - 2, 0, Math.PI * 2, true); // counter-clockwise = hole
    ctx.fill("evenodd");
    ctx.restore();

    // Circle border
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, CANVAS_SIZE / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }, [scale, offset]);

  // ── Pointer events ──
  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    if (e.touches) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    const pos = getPos(e);
    drag.current = { active: true, startX: pos.x, startY: pos.y, startOffX: offset.x, startOffY: offset.y };
  }, [offset]);

  const onPointerMove = useCallback((e) => {
    if (!drag.current.active) return;
    e.preventDefault();
    const pos = getPos(e);
    setOffset({
      x: drag.current.startOffX + pos.x - drag.current.startX,
      y: drag.current.startOffY + pos.y - drag.current.startY,
    });
  }, []);

  const onPointerUp = useCallback(() => {
    drag.current.active = false;
  }, []);

  // ── Confirm: render into output canvas ──
  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;

    const out = document.createElement("canvas");
    out.width = OUTPUT_SIZE;
    out.height = OUTPUT_SIZE;
    const ctx = out.getContext("2d");

    // Circular clip
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    // Scale offset from display canvas to output canvas
    const ratio = OUTPUT_SIZE / CANVAS_SIZE;
    const cx = OUTPUT_SIZE / 2;
    const cy = OUTPUT_SIZE / 2;
    const w = img.width * scale * ratio;
    const h = img.height * scale * ratio;
    ctx.drawImage(img, cx + offset.x * ratio - w / 2, cy + offset.y * ratio - h / 2, w, h);

    out.toBlob((blob) => { if (blob) onConfirm(blob); }, "image/jpeg", 0.92);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900">裁剪头像</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Canvas */}
        <div className="flex items-center justify-center bg-gray-800 p-4">
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            style={{ borderRadius: "50%", cursor: "grab", touchAction: "none", display: "block" }}
            onMouseDown={onPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onMouseLeave={onPointerUp}
            onTouchStart={onPointerDown}
            onTouchMove={onPointerMove}
            onTouchEnd={onPointerUp}
          />
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-t">
          <span className="text-xs text-gray-400 w-8 text-right flex-shrink-0">小</span>
          <input
            type="range"
            min={0.3}
            max={5}
            step={0.05}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="flex-1 accent-red-600"
          />
          <span className="text-xs text-gray-400 w-8 flex-shrink-0">大</span>
        </div>

        <p className="text-xs text-gray-400 text-center pb-2">拖动图片调整位置，滑块调整大小</p>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t gap-2">
          <div className="flex items-center gap-2">
            {onReplaceImage && (
              <label className="cursor-pointer">
                <Button variant="outline" size="sm" asChild disabled={uploading}>
                  <span><Upload className="w-3.5 h-3.5 mr-1.5" />更换图片</span>
                </Button>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    e.target.value = "";
                    if (!file || !file.type?.startsWith("image/")) return;
                    const reader = new FileReader();
                    reader.onload = () => onReplaceImage(reader.result);
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={uploading}>取消</Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700"
              onClick={handleConfirm}
              disabled={uploading}
            >
              <Check className="w-3.5 h-3.5 mr-1.5" />
              {uploading ? "上传中..." : "使用此裁剪"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}