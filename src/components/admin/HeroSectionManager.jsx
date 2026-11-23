import { useState, useEffect } from "react";
import { tenantEntity } from "@/lib/tenantApi";
import { invalidateTenantConfigCache } from "@/lib/configCache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Layout, Plus, Trash2, Crop } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DEFAULT_HERO } from "@/components/home/HeroSection";
import { ImageEditModal, SliderField } from "@/components/admin/ImageEffectsPanel";
import ImageUploader from "@/components/common/ImageUploader";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const VARIANT_OPTIONS = [
  { value: "primary", label: "实心按钮" },
  { value: "outline", label: "描边按钮" },
];

const ICON_OPTIONS = [
  { value: "none", label: "无图标" },
  { value: "ShoppingBag", label: "🛍 购物袋" },
];

const AUDIENCE_TABS = [
  { key: "guest",  label: "未登录用户可见" },
  { key: "user",   label: "仅登录用户可见" },
  { key: "admin",  label: "仅管理员可见" },
];

function genId() { return `btn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

// 常用内页选项
const PAGE_OPTIONS = [
  { value: "__empty__", label: "（留空 → 登录页）" },
  { value: "Home", label: "主页" },
  { value: "SubmitOrder", label: "提交订单" },
  { value: "MyOrders", label: "我的订单" },
  { value: "ShippingPool", label: "发货 & 拼邮" },
  { value: "GroupBuy", label: "拼单" },
  { value: "MemberTiers", label: "会员阶级" },
  { value: "Notifications", label: "通知中心" },
  { value: "UserPreferences", label: "个人设置" },
  { value: "__custom__", label: "✏️ 自定义网址…" },
];

function isCustomUrl(page) { return page && page.startsWith("http"); }
function getSelectValue(page) {
  if (!page) return "__empty__";
  if (isCustomUrl(page)) return "__custom__";
  return page;
}

// ─── ButtonEditor ─────────────────────────────────────────
function ButtonEditor({ buttons, onChange }) {
  const update = (idx, field, val) => onChange(buttons.map((b, i) => i === idx ? { ...b, [field]: val } : b));
  const remove = (idx) => onChange(buttons.filter((_, i) => i !== idx));
  const add = () => onChange([...buttons, { id: genId(), label: "按钮", page: "", variant: "outline", color: "", icon: "" }]);

  return (
    <div className="space-y-2">
      {buttons.map((btn, idx) => (
        <div key={btn.id || idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-gray-500">按钮文字</Label>
              <Input className="h-7 text-xs mt-0.5" value={btn.label} onChange={e => update(idx, "label", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">跳转目标</Label>
              <Select value={getSelectValue(btn.page)}
                onValueChange={v => {
                  if (v === "__custom__") update(idx, "page", "https://");
                  else if (v === "__empty__") update(idx, "page", "");
                  else update(idx, "page", v);
                }}>
                <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {isCustomUrl(btn.page) && (
                <div className="mt-1">
                  <Input className="h-7 text-xs font-mono" value={btn.page}
                    onChange={e => update(idx, "page", e.target.value)} placeholder="https://example.com" />
                  <p className="text-xs text-blue-500 mt-0.5">外部链接将在新标签页打开</p>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs text-gray-500">样式</Label>
              <Select value={btn.variant} onValueChange={v => update(idx, "variant", v)}>
                <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>{VARIANT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">按钮颜色（实心有效）</Label>
              <div className="flex items-center gap-1 mt-0.5">
                <input type="color" value={btn.color || "#dc2626"} onChange={e => update(idx, "color", e.target.value)}
                  className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0.5" />
                <Input className="h-7 text-xs flex-1 font-mono" value={btn.color || ""} onChange={e => update(idx, "color", e.target.value)} placeholder="#dc2626" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500">图标</Label>
              <Select value={btn.icon || "none"} onValueChange={v => update(idx, "icon", v === "none" ? "" : v)}>
                <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>{ICON_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={() => remove(idx)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add} className="w-full h-7 text-xs border-dashed">
        <Plus className="w-3 h-3 mr-1" />新增按钮
      </Button>
    </div>
  );
}

// ─── AudiencePanel：单一受众的完整 hero 配置 ─────────────
function AudiencePanel({ form, onChange }) {
  const f = (k, v) => onChange({ ...form, [k]: v });

  const [uploadingBg, setUploadingBg] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // 背景图上传：File → 先上传拿 URL；字符串（粘贴/手填 URL）→ 直接用
  const handleBgImage = async (next) => {
    if (typeof next === "string") {
      f("bgImageUrl", next);
      return;
    }
    if (!next) return;
    setUploadingBg(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: next, path: "heroBg" });
      onChange({ ...form, bgMode: "image", bgImageUrl: file_url });
    } catch {
      toast.error("图片上传失败，请重试");
    } finally {
      setUploadingBg(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Text fields */}
      <div className="grid grid-cols-1 gap-3">
        <div>
          <Label className="text-xs text-gray-500">标题（留空使用品牌名）</Label>
          <Input className="mt-0.5 text-sm" value={form.title || ""} onChange={e => f("title", e.target.value)} placeholder="同一物流 · Tongyi Express" />
        </div>
        <div>
          <Label className="text-xs text-gray-500">副标题（留空使用品牌副标题）</Label>
          <Input className="mt-0.5 text-sm" value={form.subtitle || ""} onChange={e => f("subtitle", e.target.value)} placeholder="专业代购..." />
        </div>
        <div>
          <Label className="text-xs text-gray-500">顶部徽标文字</Label>
          <Input className="mt-0.5 text-sm" value={form.badgeText || ""} onChange={e => f("badgeText", e.target.value)} placeholder="日本 → 全球" />
        </div>
      </div>

      {/* Background mode */}
      <div>
        <Label className="text-xs text-gray-500 mb-1.5 block">背景类型</Label>
        <div className="flex gap-2">
          {[{ v: "white", label: "纯白" }, { v: "color", label: "单色" }, { v: "image", label: "图片" }].map(opt => (
            <button key={opt.v} onClick={() => f("bgMode", opt.v)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${form.bgMode === opt.v ? "bg-purple-600 text-white border-purple-600" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Color mode */}
      {form.bgMode === "color" && (
        <div className="space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div>
            <Label className="text-xs text-gray-500">背景颜色</Label>
            <div className="flex items-center gap-2 mt-0.5">
              <input type="color" value={form.bgColor || "#ffffff"} onChange={e => f("bgColor", e.target.value)}
                className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5" />
              <Input className="h-7 text-xs font-mono flex-1" value={form.bgColor || "#ffffff"} onChange={e => f("bgColor", e.target.value)} />
            </div>
          </div>
          <SliderField label="透明度" value={form.bgOpacity ?? 100} min={10} max={100} unit="%" onChange={v => f("bgOpacity", v)} />
        </div>
      )}

      {/* Image mode */}
      {form.bgMode === "image" && (
        <div className="space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">背景图片</Label>
            <ImageUploader
              id="hero-bg-image"
              value={form.bgImageUrl || ""}
              uploading={uploadingBg}
              onChange={handleBgImage}
              onDelete={() => onChange({ ...form, bgImageUrl: "", bgMode: "white" })}
            />
          </div>

          {form.bgImageUrl && (
            <>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-500">图片效果</Label>
                <Button size="sm" variant="outline" className="h-6 text-xs"
                  onClick={() => setEditOpen(true)}>
                  <Crop className="w-3 h-3 mr-1" />裁切 / 预览
                </Button>
              </div>
              <SliderField label="模糊度" value={form.blurAmount ?? 0} min={0} max={20} unit="px" onChange={v => f("blurAmount", v)} />
              <SliderField label="明度" value={form.brightness ?? 100} min={30} max={150} unit="%" onChange={v => f("brightness", v)} />
              <div>
                <Label className="text-xs text-gray-500">遮罩颜色 / 透明度</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" value={form.overlayColor || "#000000"}
                    onChange={e => f("overlayColor", e.target.value)}
                    className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5" />
                  <Input className="h-7 text-xs font-mono w-24" value={form.overlayColor || "#000000"}
                    onChange={e => f("overlayColor", e.target.value)} />
                  <Input type="number" min={0} max={80} className="h-7 text-xs w-20"
                    value={form.overlayOpacity ?? 0}
                    onChange={e => f("overlayOpacity", Number(e.target.value))} />
                  <span className="text-xs text-gray-400">%</span>
                </div>
              </div>
              <p className="text-[11px] text-gray-400">推荐宽高比 3:1；裁切后可回到本页调整模糊度与遮罩。</p>
            </>
          )}

          {editOpen && form.bgImageUrl && (
            <ImageEditModal
              imageUrl={form.bgImageUrl}
              initialMode="edit"
              blurAmount={form.blurAmount ?? 0}
              brightness={form.brightness ?? 100}
              overlayColor={form.overlayColor || "#000000"}
              overlayOpacity={form.overlayOpacity ?? 0}
              previewTitle={form.title || "标题预览"}
              aspect={3}
              uploadPath="heroBg"
              onChange={patch => onChange({ ...form, ...patch, bgMode: "image" })}
              onClose={() => setEditOpen(false)}
            />
          )}
        </div>
      )}

      {/* Buttons */}
      <div>
        <Label className="text-xs text-gray-500 mb-2 block">按钮配置</Label>
        <ButtonEditor buttons={form.buttons || []} onChange={btns => f("buttons", btns)} />
      </div>
    </div>
  );
}

// 新版数据结构：{ unified?: bool, guest: {...}, user: {...}, admin: {...} }
// 兼容旧版（直接是 DEFAULT_HERO 展开的对象）
function migrateConfig(raw) {
  if (!raw) return { unified: true, guest: { ...DEFAULT_HERO }, user: { ...DEFAULT_HERO }, admin: { ...DEFAULT_HERO } };
  // 如果已经是新版结构
  if ("guest" in raw || "user" in raw || "admin" in raw) {
    return {
      unified: raw.unified ?? false,
      guest: { ...DEFAULT_HERO, ...(raw.guest || {}) },
      user:  { ...DEFAULT_HERO, ...(raw.user  || {}) },
      admin: { ...DEFAULT_HERO, ...(raw.admin || {}) },
    };
  }
  // 旧版：单一配置，迁移为 unified 模式
  return { unified: true, guest: { ...DEFAULT_HERO, ...raw }, user: { ...DEFAULT_HERO, ...raw }, admin: { ...DEFAULT_HERO, ...raw } };
}

// ─── Main Manager ─────────────────────────────────────────
export default function HeroSectionManager({ settings, onReload }) {
  const [form, setForm] = useState(migrateConfig(null));
  const [activeTab, setActiveTab] = useState("guest");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const setting = (settings || []).find(s => s.key === "home_hero_config");
    if (setting?.value) {
      try { setForm(migrateConfig(JSON.parse(setting.value))); } catch { /* noop */ }
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // 若统一模式，保存前将 guest 配置同步到 user 和 admin
      const saveForm = form.unified
        ? { ...form, user: { ...form.guest }, admin: { ...form.guest } }
        : form;
      const existing = (settings || []).find(s => s.key === "home_hero_config");
      const value = JSON.stringify(saveForm);
      if (existing?.id) {
        await tenantEntity.update("SiteSettings", existing.id, { value });
      } else {
        await tenantEntity.create("SiteSettings", { key: "home_hero_config", value, description: "主页 Hero 区块配置（JSON）", category: "general" });
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
      // 切换为统一模式：将 guest 配置复制到其他受众
      setForm(prev => ({ ...prev, unified: true, user: { ...prev.guest }, admin: { ...prev.guest } }));
    } else {
      setForm(prev => ({ ...prev, unified: false }));
    }
  };

  return (
    <Card className="border-purple-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layout className="w-4 h-4 text-purple-500" />
            <CardTitle className="text-sm font-semibold text-gray-700">主页 Hero 区块自定义</CardTitle>
          </div>
          <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700" onClick={handleSave} disabled={saving}>
            <Save className="w-3 h-3 mr-1" />{saved ? "已保存 ✓" : saving ? "保存中..." : "保存"}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-1">为不同受众单独配置横幅外观，留空则使用租户品牌默认值。</p>

        {/* 统一模式开关 */}
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
          <Checkbox
            id="unified-mode"
            checked={!!form.unified}
            onCheckedChange={toggleUnified}
          />
          <label htmlFor="unified-mode" className="text-xs text-gray-600 cursor-pointer select-none">
            所有用户显示同一套配置（不区分登录状态与角色）
          </label>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Audience tabs — 仅分离模式显示 */}
        {!form.unified && (
          <div className="flex gap-1 border-b border-gray-200 pb-0">
            {AUDIENCE_TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 text-xs rounded-t-lg transition-colors -mb-px border ${
                  activeTab === tab.key
                    ? "bg-white border-gray-200 border-b-white text-purple-700 font-semibold"
                    : "text-gray-500 border-transparent hover:text-gray-700"
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {form.unified ? (
          <AudiencePanel
            key="unified"
            form={form.guest}
            onChange={val => setForm(prev => ({ ...prev, guest: val }))}
          />
        ) : (
          <AudiencePanel
            key={activeTab}
            form={form[activeTab]}
            onChange={val => setForm(prev => ({ ...prev, [activeTab]: val }))}
          />
        )}
      </CardContent>
    </Card>
  );
}