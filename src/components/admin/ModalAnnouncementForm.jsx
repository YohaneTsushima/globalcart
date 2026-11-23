import { useState, useRef, useCallback } from "react";
import { Bold, Italic, Link2, Image as ImageIcon, Loader2, Eye, Pencil } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkSoftBreaks from "@/lib/remarkSoftBreaks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { base44 } from "@/api/base44Client";

const TYPE_LABELS = { info: "一般", warning: "警告", success: "成功", urgent: "紧急" };
const AUDIENCE_LABELS = { all: "全部用户", users: "一般用户", admins: "管理员" };

const EMPTY_FORM = {
  title: "", content: "", type: "info", is_active: true,
  target_audience: "all", expires_at: "", dismissible: false,
  display_position: "modal", image_urls: [],
};

// 内容输入框：Markdown 编辑 / 实时预览，支持工具栏、粘贴与拖拽上传图片
function ContentEditor({ value, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState("edit"); // edit | preview
  const textareaRef = useRef();
  const fileInputRef = useRef();

  // 在光标位置插入文本；有选中内容时包裹选中部分
  const insertMarkup = (before, after = "") => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const text = before + selected + after;
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = start + before.length;
      el.selectionEnd = start + before.length + selected.length;
    });
  };

  // 加粗 / 斜体：再点一次取消包裹（toggle），避免重复点击叠出 ****
  const toggleWrap = (marker) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const len = marker.length;
    const before = value.slice(Math.max(0, start - len), start);
    const after = value.slice(end, end + len);
    // 斜体 "*" 不能把加粗的 "**" 误判成斜体标记
    const italicConflict = marker === "*" && value.slice(start - 2, start) === "**";

    if (before === marker && after === marker && !italicConflict) {
      // 已包裹 → 去掉前后标记
      onChange(value.slice(0, start - len) + selected + value.slice(end + len));
      requestAnimationFrame(() => {
        el.focus();
        el.selectionStart = start - len;
        el.selectionEnd = start - len + selected.length;
      });
      return;
    }
    insertMarkup(marker, marker);
  };

  // 链接：有选中文字就作为链接文字，并把 URL 占位符选中方便直接粘贴
  const insertLink = () => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || "链接文字";
    const url = "https://";
    const text = `[${selected}](${url})`;
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const urlStart = start + selected.length + 3;
      el.selectionStart = urlStart;
      el.selectionEnd = urlStart + url.length;
    });
  };

  // Ctrl/Cmd + B 加粗、Ctrl/Cmd + I 斜体
  const handleKeyDown = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === "b") {
      e.preventDefault();
      toggleWrap("**");
    } else if (key === "i") {
      e.preventDefault();
      toggleWrap("*");
    }
  };

  const uploadAndInsert = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      // path=announcement → 落到 uploads/announcement/{userId}/{date}/announcement_pic_*，游客可读
      const { file_url } = await base44.integrations.Core.UploadFile({ file, path: "announcement" });
      insertMarkup(`\n![图片](${file_url})\n`);
    } catch (e) {
      console.error(e);
      toast.error("图片上传失败，请重试");
    } finally {
      setUploading(false);
    }
  };

  const handlePaste = useCallback(async (e) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(i => i.type.startsWith("image/"));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) await uploadAndInsert(file);
    }
  }, [value]);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    for (const f of files) await uploadAndInsert(f);
  }, [value]);

  const handleFileInput = async (e) => {
    const files = Array.from(e.target.files);
    for (const f of files) await uploadAndInsert(f);
    e.target.value = "";
  };

  const toolButton = "flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded transition-colors disabled:opacity-50";

  return (
    <div className={`relative border rounded-lg overflow-hidden transition-colors ${dragging ? "border-blue-400 ring-2 ring-blue-200" : "border-input"}`}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
        <button type="button" title="加粗（Ctrl+B）" onClick={() => toggleWrap("**")} className={toolButton}>
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button type="button" title="斜体（Ctrl+I）" onClick={() => toggleWrap("*")} className={toolButton}>
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button type="button" title="链接" onClick={insertLink} className={toolButton}>
          <Link2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          title="上传图片（插入 Markdown 图片语法）"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={toolButton}
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
          {uploading ? "上传中..." : "插入图片"}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileInput} />

        <div className="flex-1" />

        {/* 编辑 / 预览 切换 */}
        <div className="flex rounded-md border border-gray-200 bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors ${mode === "edit" ? "bg-gray-100 text-gray-800 font-medium" : "text-gray-500 hover:bg-gray-50"}`}
          >
            <Pencil className="w-3 h-3" />编辑
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors ${mode === "preview" ? "bg-gray-100 text-gray-800 font-medium" : "text-gray-500 hover:bg-gray-50"}`}
          >
            <Eye className="w-3 h-3" />预览
          </button>
        </div>
      </div>

      {/* 编辑区 / 预览区 */}
      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
          rows={6}
          value={value}
          onChange={e => onChange(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder={"支持 **加粗**、*斜体*、[链接](url) 等 Markdown 语法\n可直接粘贴截图或拖拽图片到此处自动上传插入"}
          className="w-full px-3 py-2 text-sm font-mono bg-white resize-y outline-none min-h-[140px]"
        />
      ) : (
        <div className="w-full px-3 py-2 min-h-[140px] bg-white prose prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkSoftBreaks]}>{value || "*暂无内容*"}</ReactMarkdown>
        </div>
      )}

      {/* Drag hint */}
      {dragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-50/80 rounded-lg pointer-events-none">
          <p className="text-blue-600 font-medium text-sm">松开以上传图片</p>
        </div>
      )}
    </div>
  );
}

export default function ModalAnnouncementForm({ editing, onSave, onCancel, saving }) {
  const [form, setForm] = useState(editing ? {
    title: editing.title,
    content: editing.content,
    type: editing.type,
    is_active: editing.is_active,
    target_audience: editing.target_audience,
    expires_at: editing.expires_at || "",
    dismissible: editing.dismissible || false,
    display_position: "modal",
    image_urls: editing.image_urls || [],
  } : EMPTY_FORM);

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardContent className="p-5 space-y-4">
        <h3 className="font-semibold text-gray-800">{editing ? "编辑弹窗公告" : "新增弹窗公告"}</h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-sm">标题 *</Label>
            <Input className="mt-1" value={form.title} onChange={e => f("title", e.target.value)} />
          </div>

          <div className="col-span-2">
            <Label className="text-sm">内容 *</Label>
            <div className="mt-1 relative">
              <ContentEditor
                value={form.content}
                onChange={v => f("content", v)}
              />
            </div>
          </div>

          <div>
            <Label className="text-sm">类型</Label>
            <Select value={form.type} onValueChange={v => f("type", v)}>
              <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">受众</Label>
            <Select value={form.target_audience} onValueChange={v => f("target_audience", v)}>
              <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(AUDIENCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm">过期日期</Label>
            <Input type="date" className="mt-1" value={form.expires_at} onChange={e => f("expires_at", e.target.value)} />
          </div>
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={form.is_active} onCheckedChange={v => f("is_active", !!v)} />
            <span className="text-sm">立即显示</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={form.dismissible} onCheckedChange={v => f("dismissible", !!v)} />
            <span className="text-sm">用户可确认（已知晓后不再显示）</span>
          </label>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>取消</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => onSave(form)} disabled={saving || !form.title || !form.content}>
            {saving ? "保存中..." : "发布弹窗公告"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}