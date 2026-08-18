/**
 * 全局服务费规则模板管理（仅平台管理员）
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import RuleEditorModal from "@/components/feeRules/RuleEditorModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Edit2, Trash2, FileText, Globe } from "lucide-react";
import { tenantManage } from "@/lib/tenantApi";

const MODE_LABELS = { simple: '简单比例', tiered: '阶梯费率', formula: '高级公式' };
const PHASE_LABELS = { order: '下单服务费', shipping: '发货前服务费' };
const PHASE_COLORS = { order: 'bg-teal-50 text-teal-700', shipping: 'bg-indigo-50 text-indigo-700' };

export default function GlobalFeeRuleTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    setLoading(true);
    // const res = await base44.functions.invoke('serviceFeeRuleEngine', { action: 'list_global_templates' });
    const res = await tenantManage.list('FeeRuleTemplate');
    
    setTemplates(res?.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (t) => {
    if (!confirm(`确定删除全局模板「${t.name}」？`)) return;
    setDeleting(t.id);
    await base44.functions.invoke('serviceFeeRuleEngine', { action: 'delete_global_template', template_id: t.id });
    await load();
    setDeleting(null);
  };

  return (
    <Card className="border-orange-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Globe className="w-4 h-4 text-orange-500" />全局服务费规则模板
            </CardTitle>
            <p className="text-xs text-gray-400 mt-1">租户管理员可在「服务费规则中心」选用模板快速套用，再自定义调整为适合自己租户的规则。</p>
          </div>
          <Button size="sm" className="bg-orange-600 hover:bg-orange-700 flex-shrink-0"
            onClick={() => { setEditing({}); setShowEditor(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1" />新建模板
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-gray-400">加载中...</p>
        ) : templates.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-400">还没有任何全局模板</p>
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">{t.name}</span>
                    <Badge className={`text-xs ${PHASE_COLORS[t.fee_phase || 'order']}`}>{PHASE_LABELS[t.fee_phase || 'order']}</Badge>
                    <Badge className="text-xs bg-gray-100 text-gray-600">{MODE_LABELS[t.mode]}</Badge>
                    {t.version > 1 && <span className="text-xs text-gray-400">v{t.version}</span>}
                  </div>
                  {t.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{t.description}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button title="编辑" onClick={() => { setEditing(t); setShowEditor(true); }}
                    className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button title="删除" onClick={() => handleDelete(t)} disabled={deleting === t.id}
                    className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {showEditor && (
        <RuleEditorModal
          rule={editing}
          saveAction="save_global_template"
          onClose={() => { setShowEditor(false); setEditing(null); }}
          onSaved={() => { setShowEditor(false); setEditing(null); load(); }}
        />
      )}
    </Card>
  );
}