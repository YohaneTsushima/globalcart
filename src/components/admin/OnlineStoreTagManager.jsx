import { useEffect, useMemo, useState } from "react";
import { tenantEntity } from "@/lib/tenantApi";
import { matchStoreTagResult, findMatchedRule } from "@/lib/onlineStoreTag";
import { Plus, Trash2, Save, ChevronUp, ChevronDown, Search, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const COLOR_PRESETS = [
  { value: "bg-gray-100 text-gray-700", label: "灰色" },
  { value: "bg-blue-100 text-blue-700", label: "蓝色" },
  { value: "bg-red-100 text-red-700", label: "红色" },
  { value: "bg-green-100 text-green-700", label: "绿色" },
  { value: "bg-yellow-100 text-yellow-700", label: "黄色" },
  { value: "bg-purple-100 text-purple-700", label: "紫色" },
  { value: "bg-orange-100 text-orange-700", label: "橙色" },
  { value: "bg-pink-100 text-pink-700", label: "粉色" },
];

const EMPTY_FORM = {
  keyword: "",
  tag_label: "",
  tag_color: "bg-gray-100 text-gray-700",
  priority: 0,
  is_active: true,
};

export default function OnlineStoreTagManager({ initialData = null }) {
  const [rules, setRules] = useState(
    initialData ? [...initialData].sort((a, b) => (b.priority || 0) - (a.priority || 0)) : []
  );
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testUrl, setTestUrl] = useState("");
  const [testResult, setTestResult] = useState(null);

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0)),
    [rules]
  );

  const loadRules = async () => {
    const data = await tenantEntity.list("StoreTagRule");
    setRules((data || []).sort((a, b) => (b.priority || 0) - (a.priority || 0)));
  };

  useEffect(() => {
    if (initialData === null) loadRules();
  }, []);

  const handleSelect = (rule) => {
    setSelectedId(rule.id);
    setForm({
      keyword: rule.keyword || "",
      tag_label: rule.tag_label || "",
      tag_color: rule.tag_color || "bg-gray-100 text-gray-700",
      priority: rule.priority || 0,
      is_active: rule.is_active !== false,
    });
  };

  const handleNew = () => {
    const maxPriority = sortedRules.reduce((max, r) => Math.max(max, Number(r.priority) || 0), 0);
    setSelectedId(null);
    setForm({ ...EMPTY_FORM, priority: maxPriority + 1 });
  };

  const handleSave = async () => {
    if (!form.keyword.trim() || !form.tag_label.trim()) {
      toast.error("请填写关键词和标签名称");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        keyword: form.keyword.trim(),
        tag_label: form.tag_label.trim(),
        tag_color: form.tag_color || "bg-gray-100 text-gray-700",
        priority: parseInt(form.priority, 10) || 0,
        is_active: form.is_active !== false,
      };
      if (selectedId) {
        await tenantEntity.update("StoreTagRule", selectedId, payload);
        toast.success("规则已保存");
      } else {
        const created = await tenantEntity.create("StoreTagRule", payload);
        if (created?.id) setSelectedId(created.id);
        toast.success("规则已创建");
      }
      await loadRules();
    } catch (error) {
      toast.error(error?.response?.data?.message || "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!window.confirm("删除这条规则？已下单的历史订单标签不会变化。")) return;
    try {
      await tenantEntity.delete("StoreTagRule", selectedId);
      toast.success("规则已删除");
      setSelectedId(null);
      setForm(EMPTY_FORM);
      await loadRules();
    } catch (error) {
      toast.error(error?.response?.data?.message || "删除失败，请重试");
    }
  };

  const handleToggleActive = async (rule, checked) => {
    await tenantEntity.update("StoreTagRule", rule.id, { is_active: checked });
    if (String(rule.id) === String(selectedId)) {
      setForm((prev) => ({ ...prev, is_active: checked }));
    }
    await loadRules();
  };

  // 优先级越大越靠前，所以「上移」是 +1
  const handleMove = async (rule, direction) => {
    const nextPriority = (Number(rule.priority) || 0) + (direction === "up" ? 1 : -1);
    await tenantEntity.update("StoreTagRule", rule.id, { priority: nextPriority });
    if (String(rule.id) === String(selectedId)) {
      setForm((prev) => ({ ...prev, priority: nextPriority }));
    }
    await loadRules();
  };

  const handleTest = () => {
    const url = testUrl.trim();
    if (!url) {
      setTestResult(null);
      return;
    }
    const result = matchStoreTagResult(url, sortedRules);
    const matched = findMatchedRule(url, sortedRules);
    setTestResult({ ...result, matched });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-700">商城标签识别规则</h3>
        <p className="text-xs text-gray-400 mt-1">
          按商品链接里的关键词识别商城。新订单在提交时写入标签；历史订单没存过标签时才按当前规则补算。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px,1fr]">
        {/* 左：规则列表 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">规则列表（{sortedRules.length}）</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleNew}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              新增
            </Button>
          </div>

          <div className="space-y-1.5">
            {sortedRules.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6 border border-dashed rounded-lg">
                暂无规则，点「新增」添加
              </p>
            )}
            {sortedRules.map((rule) => {
              const active = String(rule.id) === String(selectedId);
              return (
                <div
                  key={rule.id}
                  onClick={() => handleSelect(rule)}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    active ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge className={`text-xs ${rule.tag_color || "bg-gray-100 text-gray-700"}`}>
                        {rule.tag_label}
                      </Badge>
                      <code className="text-[11px] text-gray-500 truncate">{rule.keyword}</code>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-gray-400">优先级 {rule.priority || 0}</span>
                      {rule.is_active === false && (
                        <span className="text-[10px] text-gray-400">· 已禁用</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={rule.is_active !== false}
                      onCheckedChange={(checked) => handleToggleActive(rule, checked)}
                      className="scale-75"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-gray-400"
                      onClick={() => handleMove(rule, "up")}
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-gray-400"
                      onClick={() => handleMove(rule, "down")}
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右：编辑区 + 测试 */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {selectedId ? "编辑规则" : "新建规则"}
                </span>
                {selectedId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-red-500 hover:text-red-600"
                    onClick={handleDelete}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    删除
                  </Button>
                )}
              </div>

              <div>
                <Label className="text-xs text-gray-500">关键词 *</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  placeholder="amazon.co.jp / rakuten.co.jp"
                  value={form.keyword}
                  onChange={(e) => setForm((p) => ({ ...p, keyword: e.target.value }))}
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  只要链接里包含这段文字就算命中，不区分大小写。
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-500">标签名称 *</Label>
                  <Input
                    className="mt-1 h-8 text-sm"
                    placeholder="Amazon"
                    value={form.tag_label}
                    onChange={(e) => setForm((p) => ({ ...p, tag_label: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">优先级</Label>
                  <Input
                    type="number"
                    className="mt-1 h-8 text-sm"
                    value={form.priority}
                    onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                  />
                  <p className="text-[11px] text-gray-400 mt-1">数值越大越先匹配。</p>
                </div>
              </div>

              <div>
                <Label className="text-xs text-gray-500 block mb-2">显示颜色</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, tag_color: c.value }))}
                      className={`px-1.5 py-1 rounded border-2 transition-colors ${
                        form.tag_color === c.value ? "border-blue-400" : "border-transparent"
                      }`}
                      title={c.label}
                    >
                      <Badge className={`text-xs ${c.value}`}>{c.label}</Badge>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.is_active !== false}
                    onCheckedChange={(checked) => setForm((p) => ({ ...p, is_active: checked }))}
                  />
                  <span className="text-xs text-gray-600">启用这条规则</span>
                </div>
                <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 text-xs">
                  <Save className="w-3.5 h-3.5 mr-1" />
                  {saving ? "保存中..." : "保存"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">测试匹配</span>
              </div>
              <div className="flex gap-2">
                <Input
                  className="h-8 text-sm font-mono"
                  placeholder="粘贴商品链接，例如 https://www.amazon.co.jp/dp/..."
                  value={testUrl}
                  onChange={(e) => setTestUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleTest(); }}
                />
                <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={handleTest}>
                  测试
                </Button>
              </div>
              {testResult && (
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-gray-500">识别结果：</span>
                  <Badge className={`text-xs ${testResult.tag_color}`}>{testResult.tag_label}</Badge>
                  {testResult.matched ? (
                    <span className="text-gray-400">
                      命中规则：<code className="text-gray-600">{testResult.matched.keyword}</code>
                      （优先级 {testResult.matched.priority || 0}）
                    </span>
                  ) : (
                    <span className="text-gray-400">没有命中任何规则，订单会记为「其它」</span>
                  )}
                </div>
              )}
              <p className="text-[11px] text-gray-400 flex items-center gap-1">
                <Tag className="w-3 h-3" />
                测试只用于预览，不会修改任何订单；实际标签在下单提交时写入。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
