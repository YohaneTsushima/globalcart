/**
 * 规则编辑弹窗 — 支持下单/发货两阶段，各自三种模式
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { validateFormula } from "@/lib/feeRuleEngine";
import FormulaEditor from "./FormulaEditor";
import TieredRuleEditor from "./TieredRuleEditor";
import PostOrderSimpleEditor from "./PostOrderSimpleEditor";
import PostOrderTieredEditor from "./PostOrderTieredEditor";
import SimpleRuleEditor from "./SimpleRuleEditor";
import RuleTestPanel from "./RuleTestPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { X, Save, FlaskConical, AlertCircle, ShoppingCart, Truck, Ticket } from "lucide-react";
import { tenantManage } from "@/lib/tenantApi";

const EMPTY_RULE = {
  name: '', description: '', status: 'draft', priority: 0,
  effective_from: '', effective_until: '',
  fee_phase: 'order',
  mode: 'simple', formula: '',
  simple_rate: 8, simple_fixed_fee: 0,
  customer_level_filter: [],
  store_filter: [],
  tiered_config: [],
  shipping_fee_simple_config: [],
  shipping_fee_tiered_config: [],
  min_fee: 0, max_fee: 0, round_mode: 'round', round_unit: 1,
};

const STATUS_LABELS = { active: '启用', inactive: '停用', draft: '草稿' };
const STATUS_COLORS = { active: 'bg-green-100 text-green-700', inactive: 'bg-gray-100 text-gray-500', draft: 'bg-yellow-100 text-yellow-700' };

// Mode options per phase
const ORDER_MODES = { simple: '简单比例', tiered: '阶梯费率', formula: '高级公式' };
const SHIPPING_MODES = { simple: '简单比例', tiered: '阶梯费率', formula: '高级公式' };

export default function RuleEditorModal({ rule: initialRule, onClose, onSaved, saveAction = 'save_rule', isTicketRule = false }) {
  const [rule, setRule] = useState(initialRule ? { ...EMPTY_RULE, ...initialRule, is_ticket_rule: initialRule.is_ticket_rule ?? isTicketRule } : { ...EMPTY_RULE, is_ticket_rule: isTicketRule });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('edit');
  const [formulaValid, setFormulaValid] = useState(null);

  useEffect(() => {
    if (rule.mode === 'formula' && rule.formula?.trim()) {
      setFormulaValid(validateFormula(rule.formula));
    } else {
      setFormulaValid(null);
    }
  }, [rule.formula, rule.mode]);

  const set = (key, val) => setRule(r => ({ ...r, [key]: val }));

  const handleSave = async () => {
    if (!rule.name.trim()) { setError('请填写规则名称'); return; }
    if (rule.mode === 'formula' && rule.formula?.trim()) {
      const v = validateFormula(rule.formula);
      if (!v.valid && rule.status === 'active') {
        setError(`公式有错误，无法保存为启用状态：${v.error}`);
        return;
      }
    }
    setSaving(true);
    setError(null);

    if(rule.id) {
      tenantManage.update('FeeRuleTemplate', rule.id, rule)
      .then(res => {
        setSaving(false);
        onSaved(res?.data);
        onClose();
      }).catch(e => {
          const message = e.response?.data?.message || e.message || '保存失败';
          setError(message);
          onClose();
          setSaving(false);
      });
    } else {
      tenantManage.create('FeeRuleTemplate', rule)
      .then(res => {
        setSaving(false);
        onSaved(res?.data);
        onClose();
      }).catch(e => {
          const message = e.response?.data?.message || e.message || '保存失败';
          setError(message);
          onClose();
          setSaving(false);
      });

    }
    // const res = await base44.functions.invoke('serviceFeeRuleEngine', { action: saveAction, rule });
    
    // if (res.data?.error) { setError(res.data.error); setSaving(false); return; }
    
    
  };

  const currentRule = { ...rule, tiered_config: rule.tiered_config || [] };
  const isShipping = rule.fee_phase === 'shipping';
  const modeOptions = isShipping ? SHIPPING_MODES : ORDER_MODES;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col" onMouseDown={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-900">{initialRule?.id ? '编辑规则' : (rule.is_ticket_rule ? '新建票务规则' : '新建规则')}</h2>
            {rule.is_ticket_rule && <Badge className="text-xs bg-violet-100 text-violet-700 border-violet-200 flex items-center gap-1"><Ticket className="w-3 h-3" />票务专用</Badge>}
            <Badge className={`text-xs ${STATUS_COLORS[rule.status]}`}>{STATUS_LABELS[rule.status]}</Badge>
            {initialRule?.version && <span className="text-xs text-gray-400">v{initialRule.version}</span>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-100 px-5">
          {[['edit', '规则配置'], ['test', '测试预览']].map(([k, label]) => (
            <button key={k} onClick={() => setActiveTab(k)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === k ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {k === 'test' && <FlaskConical className="w-3.5 h-3.5 inline mr-1.5" />}{label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {activeTab === 'edit' ? (
            <>
              {error && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <AlertDescription className="text-red-700 text-sm">{error}</AlertDescription>
                </Alert>
              )}

              {/* Fee Phase selector */}
              <div>
                <Label className="text-xs text-gray-500 block mb-2">收费阶段</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'order', icon: ShoppingCart, label: '下单时服务费', desc: '用户提交代购单时收取，基于商品货款计算' },
                    { key: 'shipping', icon: Truck, label: '发货前服务费', desc: '商品入库后至发货前收取，基于实际运费计算' },
                  ].map(({ key, icon: Icon, label, desc }) => (
                    <button key={key} type="button" onClick={() => set('fee_phase', key)}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${rule.fee_phase === key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className={`flex items-center gap-1.5 text-sm font-medium mb-1 ${rule.fee_phase === key ? 'text-blue-700' : 'text-gray-700'}`}>
                        <Icon className="w-3.5 h-3.5" />{label}
                      </div>
                      <div className="text-xs text-gray-400">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Basic info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-xs text-gray-500">规则名称 *</Label>
                  <Input className="mt-1 h-9" value={rule.name} onChange={e => set('name', e.target.value)} placeholder="例：VIP下单服务费" />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">规则状态</Label>
                  <Select value={rule.status} onValueChange={v => set('status', v)}>
                    <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">优先级（数字越大越优先）</Label>
                  <Input className="mt-1 h-9 text-sm" type="number" value={rule.priority} onChange={e => set('priority', parseInt(e.target.value) || 0)} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">生效日期（留空=立即生效）</Label>
                  <Input className="mt-1 h-9 text-sm" type="date" value={rule.effective_from || ''} onChange={e => set('effective_from', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">失效日期（留空=永久有效）</Label>
                  <Input className="mt-1 h-9 text-sm" type="date" value={rule.effective_until || ''} onChange={e => set('effective_until', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-gray-500">规则说明</Label>
                  <Input className="mt-1 h-9 text-sm" value={rule.description || ''} onChange={e => set('description', e.target.value)} placeholder="简单描述此规则的用途..." />
                </div>
              </div>

              {/* Mode selection */}
              <div>
                <Label className="text-xs text-gray-500 block mb-2">计算模式</Label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(modeOptions).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => set('mode', k)}
                      className={`py-2.5 px-3 rounded-lg border-2 text-sm font-medium transition-all ${rule.mode === k ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode-specific config */}
              <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50">
                {/* ── ORDER PHASE ── */}
                {!isShipping && rule.mode === 'simple' && (
                  <SimpleRuleEditor
                    simpleRate={rule.simple_rate}
                    simpleFixedFee={rule.simple_fixed_fee}
                    onSimpleRateChange={v => set('simple_rate', v)}
                    onSimpleFixedFeeChange={v => set('simple_fixed_fee', v)}
                    customerLevelFilter={rule.customer_level_filter || []}
                    onCustomerLevelFilterChange={v => set('customer_level_filter', v)}
                  />
                )}

                {!isShipping && rule.mode === 'tiered' && (
                  <TieredRuleEditor
                    tiers={rule.tiered_config || []}
                    onChange={t => set('tiered_config', t)}
                  />
                )}

                {!isShipping && rule.mode === 'formula' && (
                  <div>
                    <Label className="text-xs text-gray-500 block mb-2">高级公式</Label>
                    <FormulaEditor value={rule.formula || ''} onChange={v => set('formula', v)} />
                  </div>
                )}

                {/* ── SHIPPING PHASE ── */}
                {isShipping && rule.mode === 'simple' && (
                  <PostOrderSimpleEditor
                    value={rule.shipping_fee_simple_config || []}
                    onChange={v => set('shipping_fee_simple_config', v)}
                  />
                )}

                {isShipping && rule.mode === 'tiered' && (
                  <PostOrderTieredEditor
                    value={rule.shipping_fee_tiered_config || []}
                    onChange={v => set('shipping_fee_tiered_config', v)}
                  />
                )}

                {isShipping && rule.mode === 'formula' && (
                  <div>
                    <Label className="text-xs text-gray-500 block mb-2">高级公式（可使用 shippingFee 等运费相关变量）</Label>
                    <FormulaEditor value={rule.formula || ''} onChange={v => set('formula', v)} />
                  </div>
                )}
              </div>

              {/* Global limits & rounding */}
              <div className="border border-gray-100 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-600 mb-3">全局限制与取整</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">最低服务费 (JPY，0=不限)</Label>
                    <Input className="mt-1 h-9 text-sm" type="number" value={rule.min_fee ?? 0} onChange={e => set('min_fee', parseFloat(e.target.value) || 0)} />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">封顶服务费 (JPY，0=不限)</Label>
                    <Input className="mt-1 h-9 text-sm" type="number" value={rule.max_fee ?? 0} onChange={e => set('max_fee', parseFloat(e.target.value) || 0)} />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">取整方式</Label>
                    <Select value={rule.round_mode || 'round'} onValueChange={v => set('round_mode', v)}>
                      <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="round">四舍五入</SelectItem>
                        <SelectItem value="ceil">向上取整</SelectItem>
                        <SelectItem value="floor">向下取整</SelectItem>
                        <SelectItem value="none">不取整</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">取整单位（如10→取整到10的倍数）</Label>
                    <Input className="mt-1 h-9 text-sm" type="number" min="1" value={rule.round_unit ?? 1} onChange={e => set('round_unit', parseFloat(e.target.value) || 1)} />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div>
              <p className="text-xs text-gray-500 mb-4">输入测试变量，验证规则计算结果是否符合预期。</p>
              <RuleTestPanel rule={currentRule} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50">
          <div className="text-xs text-gray-400">
            {rule.mode === 'formula' && formulaValid !== null && (
              formulaValid.valid
                ? <span className="text-green-600">✓ 公式语法正确</span>
                : <span className="text-red-600">⚠ {formulaValid.error}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1" />{saving ? '保存中...' : '保存规则'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}