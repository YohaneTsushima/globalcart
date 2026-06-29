import { useState, useEffect, useRef } from "react";
import { tenantEntity } from "@/lib/tenantApi";
import { base44 } from "@/api/base44Client";
import { invalidateTenantConfigCache } from "@/lib/configCache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, List, Plus, Trash2, GripVertical, ChevronDown, ChevronUp, ImagePlus, X, Loader2, HelpCircle } from "lucide-react";
import FaqItemPicker from "@/components/admin/FaqItemPicker.jsx";

const AUDIENCE_TABS = [
  { key: "guest", label: "未登录用户可见" },
  { key: "user",  label: "仅登录用户可见" },
  { key: "admin", label: "仅管理员可见" },
];

const DEFAULT_SECTION = {
  _id: "default-section",
  heading: "代购流程",
  steps: [
    { _id: "ds-1", title: "提交购买需求", desc: "填写商品链接、数量，系统自动估算预付款" },
    { _id: "ds-2", title: "确认付款",     desc: "选择支付方式完成预付款，管理员审核确认" },
    { _id: "ds-3", title: "采购进行中",   desc: "我们在日本为您采购商品，实时更新状态" },
    { _id: "ds-4", title: "提交发货需求", desc: "填写收货地址，选运输方式，余额自动抵扣运费" },
  ],
};

const DEFAULT_AUDIENCE = {
  visible: true,
  sections: [{ ...DEFAULT_SECTION, steps: DEFAULT_SECTION.steps.map(s => ({ ...s })) }],
};

// Migrate old format { heading, steps } → new format { sections: [...] }
function migrateAudience(raw) {
  if (!raw) return { ...DEFAULT_AUDIENCE, sections: [{ ...DEFAULT_SECTION, steps: DEFAULT_SECTION.steps.map(s => ({ ...s })) }] };
  // Already new format
  if (Array.isArray(raw.sections)) return { visible: raw.visible !== false, sections: raw.sections };
  // Old format with single heading+steps
  return {
    visible: raw.visible !== false,
    sections: [{ heading: raw.heading || DEFAULT_SECTION.heading, steps: Array.isArray(raw.steps) ? raw.steps : DEFAULT_SECTION.steps.map(s => ({ ...s })) }],
  };
}

function migrateConfig(raw) {
  const def = () => ({
    unified: true,
    guest: migrateAudience(null),
    user:  migrateAudience(null),
    admin: migrateAudience(null),
  });
  if (!raw) return def();
  if ("guest" in raw || "user" in raw || "admin" in raw) {
    return {
      unified: raw.unified ?? false,
      guest: migrateAudience(raw.guest),
      user:  migrateAudience(raw.user),
      admin: migrateAudience(raw.admin),
    };
  }
  return def();
}

// ─── DescEditor: textarea + image integrated ───
function DescEditor({ desc, imageUrl, onDescChange, onUpload, onRemove }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef();
  const dragCounter = useRef(0); // fix: dragLeave fires on child elements

  const uploadFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      onUpload(file_url);
    } finally {
      setUploading(false);
    }
  };

  const handleDragEnter = (e) => { e.preventDefault(); dragCounter.current++; setDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const handlePaste = (e) => {
    const item = Array.from(e.clipboardData.items).find(it => it.type.startsWith("image/"));
    if (item) uploadFile(item.getAsFile());
  };

  return (
    <div
      className={`mt-0.5 rounded-md border bg-background shadow-sm transition-colors ${dragging ? "border-indigo-400 ring-1 ring-indigo-300" : "border-input"}`}
      onDragOver={e => e.preventDefault()}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Textarea */}
      <textarea
        className="w-full text-xs bg-transparent px-2 py-1.5 resize-none focus:outline-none"
        rows={2}
        value={desc || ""}
        onChange={e => onDescChange(e.target.value)}
        onPaste={handlePaste}
        placeholder="输入描述，或粘贴 / 拖拽图片…"
      />

      {/* Divider + toolbar + image preview */}
      <div className="border-t border-input px-2 py-1 flex items-center gap-2">
        {/* Upload button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-gray-400 hover:text-indigo-500 transition-colors"
          title="上传图片"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" /> : <ImagePlus className="w-3.5 h-3.5" />}
        </button>
        <span className="text-xs text-gray-300 flex-1">{dragging ? "松开鼠标上传" : "可拖拽或 Ctrl+V 粘贴图片"}</span>

        {/* Thumbnail */}
        {imageUrl && (
          <div className="relative flex-shrink-0">
            <img src={imageUrl} alt="" className="h-8 w-auto rounded border border-gray-200 object-contain" />
            <button
              type="button"
              onClick={onRemove}
              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
            >
              <X className="w-2 h-2" />
            </button>
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => uploadFile(e.target.files[0])} />
      </div>
    </div>
  );
}

// ─── FaqStepEditor: a step of type "faq" ───
function FaqStepEditor({ step, idx, onUpdate, onRemove, categories }) {
  const selected = step.faq_item_ids || [];
  return (
    <div className="grid grid-cols-1 gap-1.5 p-3 bg-teal-50 rounded-lg border border-teal-200">
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-teal-600" />
          <span className="text-xs font-semibold text-teal-700">FAQ 卡片 {idx + 1}</span>
          {selected.length > 0 && <span className="text-xs text-teal-500">（已选 {selected.length} 条）</span>}
        </div>
        <button onClick={onRemove} className="text-red-400 hover:text-red-600">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <FaqItemPicker
        categories={categories}
        selectedIds={selected}
        onChange={ids => onUpdate("faq_item_ids", ids)}
      />
    </div>
  );
}

// ─── SectionEditor: edit one section (heading + steps) ───
function SectionEditor({ section, sectionIdx, total, onChange, onDelete, onMoveUp, onMoveDown, categories }) {
  const [collapsed, setCollapsed] = useState(false);

  const updateStep = (i, field, val) => {
    const steps = section.steps.map((s, idx) => idx === i ? { ...s, [field]: val } : s);
    onChange({ ...section, steps });
  };
  const addStep = () => onChange({ ...section, steps: [...section.steps, { _id: Date.now().toString(), title: "新步骤", desc: "" }] });
  const addFaqStep = () => onChange({ ...section, steps: [...section.steps, { _id: Date.now().toString(), type: "faq", faq_item_ids: [] }] });
  const removeStep = (i) => onChange({ ...section, steps: section.steps.filter((_, idx) => idx !== i) });

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      {/* Section header bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-t-lg border-b border-gray-200">
        <GripVertical className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
        <span className="text-xs font-semibold text-gray-500 flex-1 truncate">区块 {sectionIdx + 1}：{section.heading || "（无标题）"}</span>
        <div className="flex items-center gap-1">
          <button onClick={onMoveUp} disabled={sectionIdx === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={onMoveDown} disabled={sectionIdx === total - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setCollapsed(c => !c)} className="p-0.5 text-gray-400 hover:text-gray-600">
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
          {total > 1 && (
            <button onClick={onDelete} className="p-0.5 text-red-400 hover:text-red-600 ml-1">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3">
          {/* Heading */}
          <div>
            <Label className="text-xs text-gray-500">区块标题</Label>
            <Input className="mt-0.5 h-8 text-sm" value={section.heading || ""} onChange={e => onChange({ ...section, heading: e.target.value })} placeholder="代购流程" />
          </div>

          {/* Steps */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-500">卡片列表（{section.steps.length} 张）</Label>
            </div>
            {section.steps.map((step, i) => {
              if (step.type === "faq") {
                return (
                  <FaqStepEditor
                    key={step._id || i}
                    step={step}
                    idx={i}
                    onUpdate={(field, val) => updateStep(i, field, val)}
                    onRemove={() => removeStep(i)}
                    categories={categories}
                  />
                );
              }
              return (
                <div key={step._id || i} className="grid grid-cols-1 gap-1.5 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-semibold text-gray-400">Step {i + 1}</span>
                    <button onClick={() => removeStep(i)} className="text-red-400 hover:text-red-600">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400">标题</Label>
                    <Input className="mt-0.5 h-7 text-xs" value={step.title || ""} onChange={e => updateStep(i, "title", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400">描述</Label>
                    <DescEditor
                      desc={step.desc || ""}
                      imageUrl={step.image_url || ""}
                      onDescChange={val => updateStep(i, "desc", val)}
                      onUpload={url => updateStep(i, "image_url", url)}
                      onRemove={() => updateStep(i, "image_url", "")}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={addStep} className="flex-1 h-7 text-xs border-dashed">
                <Plus className="w-3 h-3 mr-1" />新增卡片
              </Button>
              <Button size="sm" variant="outline" onClick={addFaqStep} className="flex-1 h-7 text-xs border-dashed border-teal-300 text-teal-600 hover:bg-teal-50">
                <HelpCircle className="w-3 h-3 mr-1" />新增常见问题
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AudiencePanel ────────────────────────────────────────
function AudiencePanel({ form, onChange, categories }) {
  const f = (k, v) => onChange({ ...form, [k]: v });

  const updateSection = (i, val) => {
    const sections = form.sections.map((s, idx) => idx === i ? val : s);
    f("sections", sections);
  };
  const addSection = () => f("sections", [...(form.sections || []), { _id: Date.now().toString(), heading: "新区块", steps: [{ _id: (Date.now()+1).toString(), title: "新步骤", desc: "" }] }]);
  const removeSection = (i) => f("sections", form.sections.filter((_, idx) => idx !== i));
  const moveSection = (i, dir) => {
    const arr = [...(form.sections || [])];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    f("sections", arr);
  };

  return (
    <div className="space-y-4">
      {/* Visibility */}
      <div className="flex items-center gap-2">
        <Checkbox id="visible-check" checked={!!form.visible} onCheckedChange={v => f("visible", !!v)} />
        <label htmlFor="visible-check" className="text-xs text-gray-600 select-none cursor-pointer">显示此区块</label>
      </div>

      {form.visible && (
        <div className="space-y-3">
          {(form.sections || []).map((section, i) => (
            <SectionEditor
              key={section._id || i}
              section={section}
              sectionIdx={i}
              total={form.sections.length}
              onChange={val => updateSection(i, val)}
              onDelete={() => removeSection(i)}
              onMoveUp={() => moveSection(i, -1)}
              onMoveDown={() => moveSection(i, 1)}
              categories={categories}
            />
          ))}
          <Button size="sm" variant="outline" onClick={addSection} className="w-full h-8 text-xs border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50">
            <Plus className="w-3.5 h-3.5 mr-1" />追加整个区块
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main Manager ────────────────────────────────────────
export default function StepsSectionManager({ settings, onReload, faqCategories = [] }) {
  const [form, setForm] = useState(migrateConfig(null));
  const [activeTab, setActiveTab] = useState("guest");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const categories = faqCategories.filter(c => c.is_active !== false);

  useEffect(() => {
    const setting = (settings || []).find(s => s.key === "home_steps_config");
    if (setting?.value) {
      try { setForm(migrateConfig(JSON.parse(setting.value))); } catch { /* noop */ }
    }
  }, [settings]);

  const cloneAudience = (a) => ({
    ...a,
    sections: (a.sections || []).map(s => ({ ...s, steps: (s.steps || []).map(st => ({ ...st })) })),
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const saveForm = form.unified
        ? { ...form, user: cloneAudience(form.guest), admin: cloneAudience(form.guest) }
        : form;
      const existing = (settings || []).find(s => s.key === "home_steps_config");
      const value = JSON.stringify(saveForm);
      if (existing?.id) {
        await tenantEntity.update("SiteSettings", existing.id, { value });
      } else {
        await tenantEntity.create("SiteSettings", { key: "home_steps_config", value, description: "主页代购流程区块配置（JSON）", category: "general" });
      }
      invalidateTenantConfigCache();
      await onReload();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const toggleUnified = (checked) => {
    if (checked) {
      setForm(prev => ({ ...prev, unified: true, user: cloneAudience(prev.guest), admin: cloneAudience(prev.guest) }));
    } else {
      setForm(prev => ({ ...prev, unified: false }));
    }
  };

  const currentAudience = form.unified ? "guest" : activeTab;

  return (
    <Card className="border-indigo-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <List className="w-4 h-4 text-indigo-500" />
            <CardTitle className="text-sm font-semibold text-gray-700">代购流程区块自定义</CardTitle>
          </div>
          <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700" onClick={handleSave} disabled={saving}>
            <Save className="w-3 h-3 mr-1" />{saved ? "已保存 ✓" : saving ? "保存中..." : "保存"}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-1">为不同受众配置代购流程区块，支持多区块、增删卡片、调整顺序。</p>

        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
          <Checkbox id="unified-check" checked={!!form.unified} onCheckedChange={toggleUnified} />
          <label htmlFor="unified-check" className="text-xs text-gray-600 select-none cursor-pointer">
            所有用户显示同一套配置（不区分登录状态与角色）
          </label>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!form.unified && (
          <div className="flex gap-1 border-b border-gray-200 pb-0">
            {AUDIENCE_TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 text-xs rounded-t-lg transition-colors -mb-px border ${
                  activeTab === tab.key
                    ? "bg-white border-gray-200 border-b-white text-indigo-700 font-semibold"
                    : "text-gray-500 border-transparent hover:text-gray-700"
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <AudiencePanel
          key={currentAudience}
          form={form[currentAudience]}
          onChange={val => setForm(prev => ({ ...prev, [currentAudience]: val }))}
          categories={categories}
        />
      </CardContent>
    </Card>
  );
}