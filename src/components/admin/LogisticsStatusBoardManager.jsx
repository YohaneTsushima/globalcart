import { useState, useEffect } from "react";
import { tenantEntity } from "@/lib/tenantApi";
import { base44 } from "@/api/base44Client";
import { invalidateTenantConfigCache } from "@/lib/configCache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Save, LayoutDashboard, HelpCircle } from "lucide-react";
import FaqItemPicker from "@/components/admin/FaqItemPicker.jsx";

const GROUP_DEFS = [
  { key: "action_required", defaultLabel: "需要操作", colorClass: "text-red-600" },
  { key: "in_progress",     defaultLabel: "处理中",   colorClass: "text-blue-600" },
  { key: "shipping",        defaultLabel: "运输中",   colorClass: "text-indigo-600" },
  { key: "done",            defaultLabel: "已完成",   colorClass: "text-green-600" },
];

const DEFAULT_CONFIG = {
  title: "物流状态看板",
  groups: {
    action_required: { hidden: false, label: "需要操作", max_items: 3 },
    in_progress:     { hidden: false, label: "处理中",   max_items: 3 },
    shipping:        { hidden: false, label: "运输中",   max_items: 3 },
    done:            { hidden: false, label: "已完成",   max_items: 3 },
  },
  faq_enabled: false,
  faq_item_ids: [],
};

export default function LogisticsStatusBoardManager({ settings, onReload, faqCategories = [] }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const categories = faqCategories.filter(c => c.is_active !== false);

  useEffect(() => {
    const setting = (settings || []).find(s => s.key === "home_status_board");
    if (setting?.value) {
      try {
        const parsed = JSON.parse(setting.value);
        // merge with defaults to ensure all keys exist
        setConfig({
          ...DEFAULT_CONFIG,
          ...parsed,
          groups: {
            ...DEFAULT_CONFIG.groups,
            ...(parsed.groups || {}),
          },
        });
      } catch {
        setConfig(DEFAULT_CONFIG);
      }
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const existing = (settings || []).find(s => s.key === "home_status_board");
      const value = JSON.stringify(config);
      if (existing?.id) {
        await tenantEntity.update("SiteSettings", existing.id, { value });
      } else {
        await tenantEntity.create("SiteSettings", {
          key: "home_status_board", value,
          description: "主页物流状态看板配置（JSON）", category: "general",
        });
      }
      invalidateTenantConfigCache();
      await onReload();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const updateGroup = (key, field, val) => {
    setConfig(prev => ({
      ...prev,
      groups: {
        ...prev.groups,
        [key]: { ...prev.groups[key], [field]: val },
      },
    }));
  };

  return (
    <Card className="border-indigo-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4 text-indigo-500" />
            <CardTitle className="text-sm font-semibold text-gray-700">物流状态看板配置</CardTitle>
          </div>
          <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700" onClick={handleSave} disabled={saving}>
            <Save className="w-3 h-3 mr-1" />{saved ? "已保存 ✓" : saving ? "保存中..." : "保存"}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-1">配置主页物流看板的标题、各区块名称、显示条数及显示/隐藏。</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 整体标题 */}
        <div>
          <Label className="text-xs text-gray-500">看板标题</Label>
          <Input className="h-7 text-xs mt-0.5" value={config.title}
            onChange={e => setConfig(prev => ({ ...prev, title: e.target.value }))}
            placeholder="物流状态看板" />
        </div>

        {/* 各分组设置 */}
        <div className="space-y-2">
          <Label className="text-xs text-gray-500 block">分组设置</Label>
          {GROUP_DEFS.map(({ key, defaultLabel, colorClass }) => {
            const grp = config.groups[key] || {};
            return (
              <div key={key} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="flex items-center gap-3">
                  {/* 显示/隐藏 */}
                  <Switch
                    checked={!grp.hidden}
                    onCheckedChange={v => updateGroup(key, "hidden", !v)}
                  />
                  <span className={`text-xs font-semibold ${colorClass} w-14 flex-shrink-0`}>{defaultLabel}</span>

                  {/* 自定义名称 */}
                  <div className="flex-1">
                    <Input
                      className="h-7 text-xs"
                      value={grp.label || defaultLabel}
                      onChange={e => updateGroup(key, "label", e.target.value)}
                      placeholder={defaultLabel}
                      disabled={grp.hidden}
                    />
                  </div>

                  {/* 最大条数 */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs text-gray-400 whitespace-nowrap">最多显示</span>
                    <Input
                      type="number"
                      min={1} max={10}
                      className="h-7 text-xs w-14 text-center"
                      value={grp.max_items ?? 3}
                      onChange={e => updateGroup(key, "max_items", Math.max(1, Math.min(10, Number(e.target.value))))}
                      disabled={grp.hidden}
                    />
                    <span className="text-xs text-gray-400">条</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* FAQ 常见问题分组 — 与其它分组同等层级 */}
          <div className="border border-teal-200 rounded-lg p-3 bg-teal-50/30">
            <div className="flex items-center gap-3">
              <Switch
                checked={!!config.faq_enabled}
                onCheckedChange={v => setConfig(prev => ({ ...prev, faq_enabled: v }))}
              />
              <HelpCircle className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
              <span className="text-xs font-semibold text-teal-700 w-14 flex-shrink-0">常见问题</span>
              <span className="text-xs text-gray-400 flex-1">在看板中显示常见问题分组</span>
              {(config.faq_item_ids || []).length > 0 && (
                <span className="text-xs text-teal-600 font-medium flex-shrink-0">已选 {config.faq_item_ids.length} 条</span>
              )}
            </div>
            {config.faq_enabled && (
              <div className="mt-3 pt-3 border-t border-teal-200">
                <Label className="text-xs text-gray-500 block mb-2">选择展示的常见问题</Label>
                <FaqItemPicker
                  categories={categories}
                  selectedIds={config.faq_item_ids || []}
                  onChange={ids => setConfig(prev => ({ ...prev, faq_item_ids: ids }))}
                />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}