import { useState } from "react";
import { tenantEntity } from "@/lib/tenantApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Truck, RotateCcw, FileText } from "lucide-react";

function Toggle({ enabled, onToggle, color = "bg-blue-600", size = "md" }) {
  const sizes = size === "sm"
    ? { outer: "h-5 w-9", inner: "h-3 w-3", on: "translate-x-5", off: "translate-x-1" }
    : { outer: "h-6 w-11", inner: "h-4 w-4", on: "translate-x-6", off: "translate-x-1" };
  return (
    <button type="button" onClick={onToggle}
      className={`relative inline-flex ${sizes.outer} items-center rounded-full transition-colors focus:outline-none ${enabled ? color : 'bg-gray-200'}`}>
      <span className={`inline-block ${sizes.inner} transform rounded-full bg-white transition-transform ${enabled ? sizes.on : sizes.off}`} />
    </button>
  );
}

const SUB_KEYS = [
  { key: 'allow_ship_without_payment_single', label: '单独发货', desc: '允许单独发货未付款直接发货' },
  { key: 'allow_ship_without_payment_user_pool', label: '用户拼邮发货', desc: '允许用户拼邮未付款直接发货' },
  { key: 'allow_ship_without_payment_official_pool', label: '官方拼邮发货', desc: '允许官方拼邮未付款直接发货' },
];

const INSTANT_EDIT_KEY = 'allow_user_pool_edit_instant';
const REWAREHOUSE_KEY = 'allow_user_rewarehouse_from_fee_pending';

const DESCRIPTIONS = {
  allow_ship_without_payment: '允许未付款时进入已发货状态（总开关）',
  allow_ship_without_payment_single: '单独发货 - 允许未付款直接发货',
  allow_ship_without_payment_user_pool: '用户拼邮发货 - 允许未付款直接发货',
  allow_ship_without_payment_official_pool: '官方拼邮发货 - 允许未付款直接发货',
  pre_shipment_enabled: '开启预出货功能',
  fullpay_once_enabled: '开启一次付款功能',
  fullpay_once_tolerance_jpy: '一次付款运费误差容忍值（JPY）',
  allow_user_pool_edit_instant: '自动同意用户移动/添加包裹',
  allow_user_rewarehouse_from_fee_pending: '允许用户从待付运费状态申请再入库',
};

/**
 * 发货设置：允许未付款时进入已发货状态（含分类型子开关）
 */
export default function ShipWithoutPaymentSettings({ settings, onReload }) {
  const get = (key) => settings.find(s => s.key === key);

  const BOOL_KEYS = ['allow_ship_without_payment', ...SUB_KEYS.map(s => s.key), 'pre_shipment_enabled', 'fullpay_once_enabled', INSTANT_EDIT_KEY, REWAREHOUSE_KEY];

  const [values, setValues] = useState(() => {
    const init = {};
    BOOL_KEYS.forEach(k => {
      // pre_shipment_enabled defaults to true when missing
      if (k === 'pre_shipment_enabled') {
        init[k] = get(k)?.value !== 'false';
      } else {
        init[k] = get(k)?.value === 'true';
      }
    });
    return init;
  });

  const [toleranceInput, setToleranceInput] = useState(() => {
    const raw = get('fullpay_once_tolerance_jpy')?.value;
    return raw !== undefined && raw !== null ? raw : '500';
  });

  const [rewarehouseFeeInput, setRewarehouseFeeInput] = useState(() => {
    return get('default_rewarehouse_fee_jpy')?.value || '0';
  });

  const [savingCard, setSavingCard] = useState(null);
  const [savedCard, setSavedCard] = useState(null);

  const toggle = (key) => setValues(prev => ({ ...prev, [key]: !prev[key] }));

  // 库里缺省值：预出货默认开，其余默认关
  const defaultValue = (key) => key === 'pre_shipment_enabled';
  const storedBool = (key) => {
    const raw = get(key)?.value;
    return raw === undefined || raw === null ? defaultValue(key) : raw === 'true';
  };

  const boolOp = (key) => {
    const s = get(key);
    const value = values[key] ? 'true' : 'false';
    return s?.id
      ? tenantEntity.update('SiteSettings', s.id, { value })
      : tenantEntity.create('SiteSettings', { key, value, description: DESCRIPTIONS[key] || '', category: 'shipping' });
  };

  // 数字项：没改动就不发请求
  const numberOp = (key, input, description, fallback) => {
    const s = get(key);
    const value = String(parseInt(input, 10) || 0);
    const stored = s?.value ?? fallback;
    if (String(stored) === value) return null;
    return s?.id
      ? tenantEntity.update('SiteSettings', s.id, { value })
      : tenantEntity.create('SiteSettings', { key, value, description, category: 'shipping' });
  };

  // 点哪张卡就只保存哪张卡的字段，且只发真正改动过的 key
  const handleSaveCard = async (cardId, boolKeys, extraOps = []) => {
    setSavingCard(cardId);
    try {
      const ops = boolKeys.filter(k => values[k] !== storedBool(k)).map(boolOp);
      ops.push(...extraOps.filter(Boolean));
      if (ops.length) await Promise.all(ops);
      await onReload();
      setSavedCard(cardId);
      setTimeout(() => setSavedCard(prev => (prev === cardId ? null : prev)), 2000);
    } finally {
      setSavingCard(null);
    }
  };

  const renderSaveButton = (cardId, boolKeys, extraOps = [], color = 'bg-purple-600 hover:bg-purple-700') => (
    <Button size="sm" className={`h-7 text-xs ${color}`} disabled={savingCard === cardId}
      onClick={() => handleSaveCard(cardId, boolKeys, extraOps)}>
      <Save className="w-3 h-3 mr-1" />
      {savedCard === cardId ? '已保存 ✓' : savingCard === cardId ? '保存中...' : '保存'}
    </Button>
  );

  return (
    <div className="space-y-4">
      {/* Pre-shipment & fullpay settings */}
      <Card className="border-purple-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Truck className="w-4 h-4 text-purple-500" />预出货功能设置
            </CardTitle>
            {renderSaveButton('shipment', ['pre_shipment_enabled', 'fullpay_once_enabled'], [
              numberOp('fullpay_once_tolerance_jpy', toleranceInput, DESCRIPTIONS.fullpay_once_tolerance_jpy, '500'),
            ])}
          </div>
          <p className="text-xs text-gray-400 mt-1">用户提交订单后预先填写发货信息，入库后自动生成发货申请</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* pre_shipment_enabled */}
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div>
              <Label className="text-sm">开启预出货功能</Label>
              <p className="text-xs text-gray-400 mt-0.5">开启后，用户提交订单后可预先填写发货信息，入库后自动生成发货申请</p>
            </div>
            <Toggle enabled={values.pre_shipment_enabled} onToggle={() => toggle('pre_shipment_enabled')} color="bg-purple-500" />
          </div>

          {/* fullpay_once_enabled */}
          {values.pre_shipment_enabled && (
            <div className="pl-4 border-l-2 border-l-purple-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm text-purple-700">开启一次付款功能</Label>
                  <p className="text-xs text-gray-400 mt-0.5">开启后，用户在预出货时可选择一次性预付商品费 + 估算运费，入库后直接进入发货流程</p>
                </div>
                <Toggle enabled={values.fullpay_once_enabled} onToggle={() => toggle('fullpay_once_enabled')} color="bg-purple-500" size="sm" />
              </div>

              {/* tolerance sub-option */}
              {values.fullpay_once_enabled && (
                <div className="pl-4 border-l-2 border-l-purple-100 space-y-2">
                  <div>
                    <Label className="text-xs text-gray-600">允许的运费误差（JPY）</Label>
                    <p className="text-xs text-gray-400 mt-0.5">
                      当实际运费超出用户预付运费的金额在此范围内时，管理员操作面板中的「先发货后补款」按钮将可用，管理员可选择先发货再请求用户补差款。
                      设为 0 表示完全禁用该功能（按钮始终不可用）。
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="100"
                      className="h-8 text-sm w-32"
                      value={toleranceInput}
                      onChange={e => setToleranceInput(e.target.value)}
                    />
                    <span className="text-xs text-gray-500">JPY</span>
                  </div>
                  <p className="text-xs text-gray-400">默认值：500 JPY</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instant edit approval */}
      <Card className="border-teal-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Truck className="w-4 h-4 text-teal-500" />用户包裹操作设置
            </CardTitle>
            {renderSaveButton('instant', [INSTANT_EDIT_KEY], [], 'bg-teal-600 hover:bg-teal-700')}
          </div>
          <p className="text-xs text-gray-400 mt-1">控制用户在发货申请中移动或添加包裹时是否需要管理员审批</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">自动同意用户移动/添加包裹</Label>
              <p className="text-xs text-gray-400 mt-0.5">开启后，用户在发货申请中移动包裹或添加包裹将立即生效，无需管理员审批</p>
            </div>
            <Toggle enabled={values[INSTANT_EDIT_KEY]} onToggle={() => toggle(INSTANT_EDIT_KEY)} color="bg-teal-500" />
          </div>
        </CardContent>
      </Card>

      {/* Rewarehouse from fee-pending */}
      <Card className="border-orange-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-orange-500" />用户再入库申请设置
            </CardTitle>
            {renderSaveButton('rewarehouse', [REWAREHOUSE_KEY], [
              numberOp('default_rewarehouse_fee_jpy', rewarehouseFeeInput, '再入库默认处理费用（JPY）', '0'),
            ], 'bg-orange-600 hover:bg-orange-700')}
          </div>
          <p className="text-xs text-gray-400 mt-1">允许用户在收到运费通知后申请取消发货并重新入库</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div>
              <Label className="text-sm">允许用户从待付运费状态申请再入库</Label>
              <p className="text-xs text-gray-400 mt-0.5">开启后，待付运费订单的用户可申请取消发货并再入库，管理员审批后生效</p>
            </div>
            <Toggle enabled={values[REWAREHOUSE_KEY]} onToggle={() => toggle(REWAREHOUSE_KEY)} color="bg-orange-500" />
          </div>
          {values[REWAREHOUSE_KEY] && (
            <div>
              <Label className="text-xs text-gray-500">默认再处理费用 (JPY)（管理员审批时可覆盖）</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="text" inputMode="decimal" className="h-8 text-sm w-36" placeholder="0"
                  value={rewarehouseFeeInput} onChange={e => setRewarehouseFeeInput(e.target.value)} />
                <span className="text-xs text-gray-400">JPY</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">此费用将在管理员同意申请后写入订单，下次提交发货时自动计入运费明细</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customs declaration */}
      {(() => {
        const s = get('allow_user_customs_declaration');
        const enabled = s?.value === 'true';
        const handleToggle = async () => {
          const newVal = enabled ? 'false' : 'true';
          if (s?.id) {
            await tenantEntity.update('SiteSettings', s.id, { value: newVal });
          } else {
            await tenantEntity.create('SiteSettings', { key: 'allow_user_customs_declaration', value: newVal, description: '允许用户自行填写报关单', category: 'shipping' });
          }
          await onReload();
        };
        return (
          <Card className="border-orange-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <FileText className="w-4 h-4 text-orange-500" />报关单设置
              </CardTitle>
              <p className="text-xs text-gray-400 mt-1">配置用户是否可在通知发货时自行填写报关单信息</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">允许用户自行填写报关单</Label>
                  <p className="text-xs text-gray-400 mt-0.5">开启后，用户在通知发货时可展开并填写报关单信息；关闭后，报关单入口对用户隐藏</p>
                </div>
                <Toggle enabled={enabled} onToggle={handleToggle} color="bg-orange-600" />
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Ship without payment */}
      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-500" />发货付款控制
            </CardTitle>
            {renderSaveButton('ship_without_payment', ['allow_ship_without_payment', ...SUB_KEYS.map(s => s.key)], [], 'bg-blue-600 hover:bg-blue-700')}
          </div>
          <p className="text-xs text-gray-400 mt-1">控制管理员是否可在用户未付运费的情况下直接发货</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div>
              <Label className="text-sm">允许未付款时进入已发货状态</Label>
              <p className="text-xs text-gray-400 mt-0.5">开启后，管理员可在用户未付款情况下直接将发货申请进入已发货状态</p>
            </div>
            <Toggle enabled={values.allow_ship_without_payment} onToggle={() => toggle('allow_ship_without_payment')} color="bg-blue-600" />
          </div>
          {values.allow_ship_without_payment && (
            <div className="pl-4 space-y-2 border-l-2 border-l-blue-200">
              {SUB_KEYS.map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs text-gray-600">{label}</Label>
                    <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                  </div>
                  <Toggle enabled={values[key]} onToggle={() => toggle(key)} color="bg-blue-600" size="sm" />
                </div>
              ))}
            </div>
          )}
          <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700">
            注意：跳过付款发货的订单不会标记货款尾款已结算，且该发货池收入不计入财务报表（未实际收款）。
          </div>
        </CardContent>
      </Card>
    </div>
  );
}