import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { tenantEntity } from "@/lib/tenantApi";
import { invalidateTenantConfigCache } from "@/lib/configCache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Save, HelpCircle, ExternalLink, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import FaqItemPicker from "@/components/admin/FaqItemPicker";

const DEFAULT_FAQ = {
  unified: true,
  guest:  { visible: true, title: "常见问题", select_mode: "category", selected_category_ids: [], selected_item_ids: [], display_limit: 6 },
  user:   { visible: true, title: "常见问题", select_mode: "category", selected_category_ids: [], selected_item_ids: [], display_limit: 6 },
  admin:  { visible: false, title: "常见问题", select_mode: "category", selected_category_ids: [], selected_item_ids: [], display_limit: 6 },
};

const AUDIENCE_TABS = [
  { key: "guest", label: "未登录用户" },
  { key: "user",  label: "登录用户" },
  { key: "admin", label: "管理员" },
];

function migrateConfig(raw) {
  if (!raw) return DEFAULT_FAQ;
  const migrateAud = (def, src) => ({
    ...def,
    ...src,
    select_mode: src?.select_mode || "category",
    selected_item_ids: src?.selected_item_ids || [],
  });
  return {
    unified: raw.unified ?? true,
    guest: migrateAud(DEFAULT_FAQ.guest, raw.guest),
    user:  migrateAud(DEFAULT_FAQ.user,  raw.user),
    admin: migrateAud(DEFAULT_FAQ.admin, raw.admin),
  };
}

let _panelIdCounter = 0;
function AudiencePanel({ form, onChange, categories }) {
  const [panelId] = useState(() => ++_panelIdCounter);
  const f = (k, v) => onChange({ ...form, [k]: v });

  const selectMode = form.select_mode || "category";
  const selectedCatIds = form.selected_category_ids || [];
  const selectedItemIds = form.selected_item_ids || [];

  const toggleCategory = (id) => {
    f("selected_category_ids", selectedCatIds.includes(id)
      ? selectedCatIds.filter(x => x !== id)
      : [...selectedCatIds, id]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Checkbox id={`faq-visible-${panelId}`} checked={!!form.visible} onCheckedChange={v => f("visible", !!v)} />
        <label htmlFor={`faq-visible-${panelId}`} className="text-xs text-gray-600 select-none cursor-pointer">显示此区块</label>
      </div>

      {form.visible && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500">区块标题</Label>
              <Input className="mt-0.5 h-8 text-sm" value={form.title || ""}
                onChange={e => f("title", e.target.value)} placeholder="常见问题" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">最多展示条数</Label>
              <Input type="number" min="1" max="20" className="mt-0.5 h-8 text-sm"
                value={form.display_limit || 6}
                onChange={e => f("display_limit", Number(e.target.value))} />
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
            <button
              onClick={() => f("select_mode", "category")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${selectMode === "category" ? "bg-white text-teal-700 font-medium shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              按分类选择
            </button>
            <button
              onClick={() => f("select_mode", "item")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${selectMode === "item" ? "bg-white text-teal-700 font-medium shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              精选问题
            </button>
          </div>

          {categories.length === 0 ? (
            <div className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg px-3 py-3 text-center">
              尚无问答分类，请先前往「帮助中心管理」创建
            </div>
          ) : selectMode === "category" ? (
            <div>
              <Label className="text-xs text-gray-500 block mb-2">选择展示的问答分类</Label>
              <div className="space-y-1.5">
                {categories.map(cat => (
                  <div key={cat.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      selectedCatIds.includes(cat.id) ? "border-teal-300 bg-teal-50" : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => toggleCategory(cat.id)}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox checked={selectedCatIds.includes(cat.id)} onCheckedChange={() => {}} className="pointer-events-none" />
                      <span className="text-sm">{cat.icon && <span className="mr-1">{cat.icon}</span>}{cat.title}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">{(cat.items || []).length} 条</Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <Label className="text-xs text-gray-500 block mb-2">
                精选问题
                {selectedItemIds.length > 0 && <span className="ml-1.5 text-teal-600 font-medium">已选 {selectedItemIds.length} 条</span>}
              </Label>
              <FaqItemPicker
                categories={categories}
                selectedIds={selectedItemIds}
                onChange={ids => f("selected_item_ids", ids)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function FaqManager({ settings, onReload, faqCategories = [] }) {
  const [form, setForm] = useState(migrateConfig(null));
  const [activeTab, setActiveTab] = useState("guest");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const categories = faqCategories.filter(c => c.is_active !== false);

  useEffect(() => {
    const setting = (settings || []).find(s => s.key === "home_faq_config");
    if (setting?.value) {
      try {
        const parsed = JSON.parse(setting.value);
        setForm(migrateConfig(parsed));
      } catch { setForm(migrateConfig(null)); }
    } else {
      setForm(migrateConfig(null));
    }
  }, [settings]);

  const cloneAudience = (a) => ({ ...a });

  const handleSave = async () => {
    setSaving(true);
    try {
      const saveForm = form.unified
        ? { ...form, user: cloneAudience(form.guest), admin: cloneAudience(form.guest) }
        : form;
      const existing = (settings || []).find(s => s.key === "home_faq_config");
      const value = JSON.stringify(saveForm);
      if (existing?.id) {
        await tenantEntity.update("SiteSettings", existing.id, { value });
      } else {
        await tenantEntity.create("SiteSettings", { key: "home_faq_config", value, description: "主页常见问题区块配置（JSON）", category: "general" });
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
    <Card className="border-teal-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-teal-500" />
            <CardTitle className="text-sm font-semibold text-gray-700">常见问题（FAQ）自定义</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Link to={createPageUrl("AdminFaq")}>
              <Button size="sm" variant="outline" className="h-7 text-xs">
                <Settings className="w-3 h-3 mr-1" />管理问答内容
                <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            </Link>
            <Button size="sm" className="h-7 text-xs bg-teal-600 hover:bg-teal-700" onClick={handleSave} disabled={saving}>
              <Save className="w-3 h-3 mr-1" />{saved ? "已保存 ✓" : saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1">选择要在主页展示的问答分类。在「管理问答内容」中维护分类和问题。</p>

        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
          <Checkbox id="faq-unified-check" checked={!!form.unified} onCheckedChange={toggleUnified} />
          <label htmlFor="faq-unified-check" className="text-xs text-gray-600 select-none cursor-pointer">所有用户显示同一套配置</label>
        </div>

      </CardHeader>

      <CardContent className="space-y-4">
        {!form.unified && (
          <div className="flex gap-1 border-b border-gray-200 pb-0">
            {AUDIENCE_TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 text-xs rounded-t-lg transition-colors -mb-px border ${
                  activeTab === tab.key
                    ? "bg-white border-gray-200 border-b-white text-teal-700 font-semibold"
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
          categories={categories}
          onChange={val => setForm(prev => ({ ...prev, [currentAudience]: val }))}
        />
      </CardContent>
    </Card>
  );
}