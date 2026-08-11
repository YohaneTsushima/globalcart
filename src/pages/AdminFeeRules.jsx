/**
 * 服务费规则中心 — 管理页面
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import RuleEditorModal from "@/components/feeRules/RuleEditorModal";
import GlobalTemplatePicker from "@/components/feeRules/GlobalTemplatePicker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Plus, Edit2, Trash2, Play, Star, Copy,
  CheckCircle2, Clock, PauseCircle, FileText,
  ChevronRight, Info, Zap, Ticket
} from "lucide-react";

const STATUS_LABELS = { active: '启用', inactive: '停用', draft: '草稿' };
const STATUS_COLORS = {
  active: 'bg-green-100 text-green-700 border-green-200',
  inactive: 'bg-gray-100 text-gray-500 border-gray-200',
  draft: 'bg-yellow-100 text-yellow-700 border-yellow-200'
};
const STATUS_ICONS = {
  active: <CheckCircle2 className="w-3.5 h-3.5" />,
  inactive: <PauseCircle className="w-3.5 h-3.5" />,
  draft: <Clock className="w-3.5 h-3.5" />
};
const MODE_LABELS = { simple: '简单比例', tiered: '阶梯费率', formula: '高级公式' };
const MODE_COLORS = {
  simple: 'bg-blue-50 text-blue-600',
  tiered: 'bg-purple-50 text-purple-600',
  formula: 'bg-orange-50 text-orange-600'
};
const PHASE_LABELS = { order: '下单服务费', shipping: '发货前服务费' };
const PHASE_COLORS = { order: 'bg-teal-50 text-teal-700', shipping: 'bg-indigo-50 text-indigo-700' };
const TICKET_RULE_COLOR = 'bg-violet-50 text-violet-700';

function RuleCard({ rule, onEdit, onDuplicate, onDelete, onToggle, deleting, getRuleSummary, isTicket }) {
  return (
    <Card className={`border transition-shadow hover:shadow-md ${rule.status === 'active' ? (isTicket ? 'border-violet-200' : 'border-green-200') : 'border-gray-200'}`}>
      <CardContent className="py-4 px-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {isTicket && <Ticket className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />}
              <span className="font-semibold text-gray-900 text-sm">{rule.name}</span>
              <Badge className={`text-xs flex items-center gap-1 ${STATUS_COLORS[rule.status]}`}>
                {STATUS_ICONS[rule.status]}{STATUS_LABELS[rule.status]}
              </Badge>
              {!isTicket && <Badge className={`text-xs ${PHASE_COLORS[rule.fee_phase || 'order']}`}>{PHASE_LABELS[rule.fee_phase || 'order']}</Badge>}
              {isTicket && <Badge className={`text-xs ${TICKET_RULE_COLOR}`}>票务服务费</Badge>}
              <Badge className={`text-xs ${MODE_COLORS[rule.mode]}`}>{MODE_LABELS[rule.mode]}</Badge>
              {rule.priority > 0 && <Badge className="text-xs bg-gray-100 text-gray-500">优先级 {rule.priority}</Badge>}
              {rule.version > 1 && <span className="text-xs text-gray-400">v{rule.version}</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-3 flex-wrap">
              <code className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded font-mono max-w-xs truncate">{getRuleSummary(rule)}</code>
              {(rule.min_fee > 0 || rule.max_fee > 0) && (
                <span className="text-xs text-gray-500">
                  {rule.min_fee > 0 && `最低 ¥${rule.min_fee}`}
                  {rule.min_fee > 0 && rule.max_fee > 0 && ' · '}
                  {rule.max_fee > 0 && `封顶 ¥${rule.max_fee}`}
                </span>
              )}
              {rule.description && <span className="text-xs text-gray-400">{rule.description}</span>}
            </div>
            {(rule.effective_from || rule.effective_until) && (
              <div className="mt-1 text-xs text-gray-400">
                {rule.effective_from && `生效: ${rule.effective_from}`}
                {rule.effective_from && rule.effective_until && ' → '}
                {rule.effective_until && `失效: ${rule.effective_until}`}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button title={rule.status === 'active' ? '停用' : '启用'} onClick={() => onToggle(rule)}
              className={`p-1.5 rounded-md transition-colors ${rule.status === 'active' ? (isTicket ? 'text-violet-600 hover:bg-violet-50' : 'text-green-600 hover:bg-green-50') : 'text-gray-400 hover:bg-gray-100'}`}>
              {rule.status === 'active' ? <CheckCircle2 className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button title="编辑" onClick={() => onEdit(rule)} className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Edit2 className="w-4 h-4" /></button>
            <button title="复制" onClick={() => onDuplicate(rule)} className="p-1.5 rounded-md text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"><Copy className="w-4 h-4" /></button>
            <button title="删除" onClick={() => onDelete(rule)} disabled={deleting === rule.id} className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminFeeRules() {
  const { user } = useCurrentUser();
  const { can, isAdmin } = usePermissions();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState(null); // null=closed, {}=new, rule=edit
  const [showEditor, setShowEditor] = useState(false);
  const [deleting, setDeleting] = useState(null);
  // For ticket rules, we use the same editor but pre-set is_ticket_rule=true
  const [isTicketRuleEditor, setIsTicketRuleEditor] = useState(false);

  // const isAdmin = user?.role === 'admin' || user?.role === 'platform_admin' || user?.role === 'tenant_admin';

  const load = async () => {
    setLoading(true);
    const res = await base44.functions.invoke('serviceFeeRuleEngine', { action: 'list_rules', include_ticket: true });
    setRules(res.data?.rules || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (!isAdmin) return (
    <div className="text-center py-12 text-red-600">仅管理员可访问此页面</div>
  );

  const handleNew = () => { setIsTicketRuleEditor(false); setEditingRule({}); setShowEditor(true); };
  const handleNewTicket = () => { setIsTicketRuleEditor(true); setEditingRule({ is_ticket_rule: true }); setShowEditor(true); };
  const handleEdit = (rule) => { setIsTicketRuleEditor(!!rule.is_ticket_rule); setEditingRule(rule); setShowEditor(true); };
  const handleDuplicate = (rule) => {
    const copy = { ...rule, id: undefined, name: `${rule.name}（副本）`, status: 'draft', version: undefined };
    setIsTicketRuleEditor(!!rule.is_ticket_rule);
    setEditingRule(copy);
    setShowEditor(true);
  };

  const handleDelete = async (rule) => {
    if (!confirm(`确定删除规则「${rule.name}」？此操作不可恢复。`)) return;
    setDeleting(rule.id);
    await base44.functions.invoke('serviceFeeRuleEngine', { action: 'delete_rule', rule_id: rule.id });
    await load();
    setDeleting(null);
  };

  const handleToggleStatus = async (rule) => {
    const newStatus = rule.status === 'active' ? 'inactive' : 'active';
    await base44.functions.invoke('serviceFeeRuleEngine', {
      action: 'save_rule',
      rule: { ...rule, status: newStatus }
    });
    await load();
  };

  const activeRules = rules.filter(r => r.status === 'active' && !r.is_ticket_rule);
  const activeTicketRules = rules.filter(r => r.status === 'active' && r.is_ticket_rule);
  const sortedRules = [...rules].filter(r => !r.is_ticket_rule).sort((a, b) => (parseFloat(b.priority) || 0) - (parseFloat(a.priority) || 0));
  const sortedTicketRules = [...rules].filter(r => r.is_ticket_rule).sort((a, b) => (parseFloat(b.priority) || 0) - (parseFloat(a.priority) || 0));

  const getRuleSummary = (rule) => {
    const phase = rule.fee_phase || 'order';
    if (rule.mode === 'simple') {
      if (phase === 'shipping') {
        const cnt = rule.shipping_fee_simple_config?.length || 0;
        return cnt > 0 ? `${cnt} 个等级配置` : '简单比例（运费）';
      }
      const parts = [`${rule.simple_rate}% × 货款`];
      if (rule.simple_fixed_fee > 0) parts.push(`+ ¥${rule.simple_fixed_fee}`);
      return parts.join(' ');
    }
    if (rule.mode === 'tiered') {
      if (phase === 'shipping') return `${rule.shipping_fee_tiered_config?.length || 0} 条发货规则`;
      return `${rule.tiered_config?.length || 0} 个阶梯`;
    }
    if (rule.mode === 'formula') return rule.formula ? rule.formula.slice(0, 50) + (rule.formula.length > 50 ? '…' : '') : '（无公式）';
    return '';
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />服务费规则中心
          </h1>
          <p className="text-sm text-gray-500 mt-1">管理代购服务费的计算规则，支持固定比例、阶梯费率和高级公式</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleNew} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-1.5" />新建规则
          </Button>
          <Button onClick={handleNewTicket} className="bg-violet-600 hover:bg-violet-700">
            <Ticket className="w-4 h-4 mr-1.5" />新建票务规则
          </Button>
        </div>
      </div>

      {/* Global template picker */}
      <GlobalTemplatePicker onApplied={load} />

      {/* Active rule banner */}
      {activeRules.length === 0 && !loading && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <Info className="w-4 h-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800 text-sm">
            当前没有启用中的规则。系统将使用网站设置中的默认服务费率。
            建议创建并启用至少一条规则。
          </AlertDescription>
        </Alert>
      )}
      {activeRules.length > 1 && (
        <Alert className="border-blue-200 bg-blue-50">
          <Info className="w-4 h-4 text-blue-600" />
          <AlertDescription className="text-blue-800 text-sm">
            当前有 {activeRules.length} 条规则处于启用状态，系统将选取优先级最高的规则执行。
          </AlertDescription>
        </Alert>
      )}
      {activeRules.length === 1 && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          当前生效规则：<strong>{activeRules[0].name}</strong>
          <Badge className="text-xs bg-blue-50 text-blue-600 border-blue-100 ml-1">{MODE_LABELS[activeRules[0].mode]}</Badge>
          <span className="text-green-600 font-mono text-xs ml-1">{getRuleSummary(activeRules[0])}</span>
        </div>
      )}

      {/* Rule list */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
      ) : (
        <>
          {sortedRules.length === 0 ? (
            <Card className="border-dashed border-gray-300">
              <CardContent className="py-10 text-center">
                <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm mb-4">还没有任何普通服务费规则</p>
                <Button onClick={handleNew} variant="outline" size="sm">
                  <Plus className="w-3.5 h-3.5 mr-1" />创建第一条规则
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sortedRules.map(rule => <RuleCard key={rule.id} rule={rule} onEdit={handleEdit} onDuplicate={handleDuplicate} onDelete={handleDelete} onToggle={handleToggleStatus} deleting={deleting} getRuleSummary={getRuleSummary} />)}
            </div>
          )}

          {/* Ticket rules section */}
          <div className="border-t border-gray-200 pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                  <Ticket className="w-4 h-4 text-violet-500" />票务专用服务费规则
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  仅对票务订单生效，优先于普通规则。未配置时回退至票务设置中的兜底服务费。
                </p>
              </div>
              <Button onClick={handleNewTicket} size="sm" className="bg-violet-600 hover:bg-violet-700">
                <Plus className="w-3.5 h-3.5 mr-1" />新建票务规则
              </Button>
            </div>

            {activeTicketRules.length === 1 && (
              <div className="flex items-center gap-2 text-sm text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-4 py-2.5 mb-3">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                当前票务生效规则：<strong>{activeTicketRules[0].name}</strong>
                <Badge className="text-xs bg-violet-100 text-violet-700 border-violet-200 ml-1">{MODE_LABELS[activeTicketRules[0].mode]}</Badge>
              </div>
            )}
            {activeTicketRules.length > 1 && (
              <Alert className="border-violet-200 bg-violet-50 mb-3">
                <Info className="w-4 h-4 text-violet-600" />
                <AlertDescription className="text-violet-800 text-sm">
                  当前有 {activeTicketRules.length} 条票务规则处于启用状态，系统将选取优先级最高的规则执行。
                </AlertDescription>
              </Alert>
            )}
            {activeTicketRules.length === 0 && sortedTicketRules.length === 0 && (
              <Alert className="border-violet-200 bg-violet-50/60">
                <Info className="w-4 h-4 text-violet-500" />
                <AlertDescription className="text-violet-700 text-sm">
                  尚未配置票务专用规则，将使用票务设置中的兜底服务费率。
                </AlertDescription>
              </Alert>
            )}

            {sortedTicketRules.length > 0 && (
              <div className="space-y-3">
                {sortedTicketRules.map(rule => <RuleCard key={rule.id} rule={rule} onEdit={handleEdit} onDuplicate={handleDuplicate} onDelete={handleDelete} onToggle={handleToggleStatus} deleting={deleting} getRuleSummary={getRuleSummary} isTicket />)}
              </div>
            )}
          </div>
        </>
      )}

      {/* Architecture note */}
      <Card className="border-blue-100 bg-blue-50/40">
        <CardContent className="py-4 px-5">
          <p className="text-xs text-blue-700 font-medium mb-2">规则引擎说明</p>
          <ul className="text-xs text-blue-600 space-y-1">
            <li>• 系统从启用状态的规则中选取<strong>优先级最高</strong>且在生效时间范围内的规则</li>
            <li>• 历史订单的服务费快照不受规则修改影响（版本化保护）</li>
            <li>• 未配置任何启用规则时，回退使用网站设置中的默认服务费率</li>
            <li>• 公式引擎为沙箱环境，不执行任意代码，仅支持白名单变量和函数</li>
          </ul>
        </CardContent>
      </Card>

      {/* Editor modal */}
      {showEditor && (
        <RuleEditorModal
          rule={editingRule}
          isTicketRule={isTicketRuleEditor}
          onClose={() => { setShowEditor(false); setEditingRule(null); }}
          onSaved={() => { setShowEditor(false); setEditingRule(null); load(); }}
        />
      )}
    </div>
  );
}