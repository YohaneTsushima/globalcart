/**
 * 下单阶段简单比例编辑器
 * 每行：客户等级（多选） | 费率% | 固定费¥ | 删除
 * customer_level_filter: [{levels:[{type,id,name}], rate, fixed_fee}]
 * 无匹配则回落到 simple_rate / simple_fixed_fee（默认费率）
 */
import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, X, ChevronDown, ArrowUp } from "lucide-react";
import { tenantManage } from "@/lib/tenantApi";

// Render a role badge using hex color
function RoleColorBadge({ name, color }) {
  if (!color) return <span className="px-1 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">{name}</span>;
  return (
    <span className="px-1 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: color + '22', color, border: `1px solid ${color}44` }}>
      {name}
    </span>
  );
}

// Multi-select picker for customer levels / roles
function LevelPickerMulti({ value = [], onChange, tiers, roles }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedIds = new Set(value.map(v => v.id));

  const toggle = (opt) => {
    if (selectedIds.has(opt.id)) {
      onChange(value.filter(v => v.id !== opt.id));
    } else {
      onChange([...value, { type: opt.type, id: opt.id, name: opt.name, color: opt.color }]);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <div role="button" tabIndex={0} onClick={() => setOpen(v => !v)} onKeyDown={e => e.key === 'Enter' && setOpen(v => !v)}
        className="w-full min-h-[32px] flex flex-wrap gap-1 items-center px-2 py-1 border border-gray-200 rounded-md bg-white hover:border-blue-300 text-left cursor-pointer">
        {value.length === 0
          ? <span className="text-xs text-gray-400">选择等级...</span>
          : value.map(v => (
            <span key={v.id} className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs"
              style={v.color ? { backgroundColor: v.color + '22', color: v.color, border: `1px solid ${v.color}44` }
                : { backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
              {v.name}
              <button type="button" onClick={e => { e.stopPropagation(); toggle(v); }} className="ml-0.5 hover:opacity-70">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))
        }
        <ChevronDown className="w-3 h-3 text-gray-300 ml-auto flex-shrink-0" />
      </div>
      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[160px] max-h-48 overflow-y-auto">
          {tiers.length === 0 && roles.length === 0
            ? <div className="text-xs text-gray-400 text-center py-2">暂无等级</div>
            : <>
              {tiers.length > 0 && (
                <>
                  <div className="px-2 py-1 text-xs text-gray-400 bg-gray-50 font-medium sticky top-0">会员等级</div>
                  {tiers.map(opt => (
                    <button key={opt.id} type="button" onClick={() => toggle(opt)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 hover:bg-blue-50 text-left text-xs ${selectedIds.has(opt.id) ? 'bg-blue-50' : ''}`}>
                      <span className={`px-1 py-0.5 rounded ${opt.color || 'bg-gray-100 text-gray-700'}`}>{opt.name}</span>
                      {selectedIds.has(opt.id) && <span className="text-blue-500 ml-auto">✓</span>}
                    </button>
                  ))}
                </>
              )}
              {roles.length > 0 && (
                <>
                  <div className="px-2 py-1 text-xs text-gray-400 bg-gray-50 font-medium sticky top-0">角色标签</div>
                  {roles.map(opt => (
                    <button key={opt.id} type="button" onClick={() => toggle({ type: 'role', id: opt.id, name: opt.name, color: opt.color })}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 hover:bg-blue-50 text-left text-xs ${selectedIds.has(opt.id) ? 'bg-blue-50' : ''}`}>
                      <RoleColorBadge name={opt.name} color={opt.color} />
                      {selectedIds.has(opt.id) && <span className="text-blue-500 ml-auto">✓</span>}
                    </button>
                  ))}
                </>
              )}
            </>
          }
        </div>
      )}
    </div>
  );
}

export default function SimpleRuleEditor({
  simpleRate, simpleFixedFee, onSimpleRateChange, onSimpleFixedFeeChange,
  customerLevelFilter = [], onCustomerLevelFilterChange,
}) {
  const [tiersList, setTiersList] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      tenantManage.list('MemberTier'),
      // base44.functions.invoke('serviceFeeRuleEngine', { action: 'list_member_tiers' }),
      // base44.functions.invoke('serviceFeeRuleEngine', { action: 'list_roles' }),
      tenantManage.list('TenantRole')
    ]).then(([t, r]) => {
      setTiersList(t?.data || []);
      setRoles((r?.data || []).filter(x => !x.is_global && !x.is_archived));
      setLoading(false);
    });
  }, []);

  const addRow = () => {
    onCustomerLevelFilterChange([...customerLevelFilter, { levels: [], rate: 8, fixed_fee: 0 }]);
  };

  const updateRow = (i, key, val) => {
    onCustomerLevelFilterChange(customerLevelFilter.map((r, idx) =>
      idx === i ? { ...r, [key]: val } : r
    ));
  };

  const removeRow = (i) => onCustomerLevelFilterChange(customerLevelFilter.filter((_, idx) => idx !== i));

  const moveRowUp = (i) => {
    if (i === 0) return;
    const arr = [...customerLevelFilter];
    [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
    onCustomerLevelFilterChange(arr);
  };

  // Normalize legacy rows: single {type,id,name} → {levels:[...]}
  const normalizeRow = (row) => {
    if (row.levels) return row;
    // legacy single-item row
    if (row.id) return { ...row, levels: [{ type: row.type, id: row.id, name: row.name }] };
    return { ...row, levels: [] };
  };

  return (
    <div className="space-y-4">
      {/* Default fallback rate */}
      <div>
        <p className="text-xs text-gray-500 font-medium mb-2">默认费率（未匹配到任何等级时适用）</p>
        <div className="flex items-center gap-2">
          <Input className="h-8 text-sm w-20" type="number" step="0.1" value={simpleRate ?? 8}
            onChange={e => onSimpleRateChange(parseFloat(e.target.value) || 0)} />
          <span className="text-xs text-gray-500">% × 货款</span>
          <span className="text-gray-300">+</span>
          <Input className="h-8 text-sm w-20" type="number" value={simpleFixedFee ?? 0}
            onChange={e => onSimpleFixedFeeChange(parseFloat(e.target.value) || 0)} />
          <span className="text-xs text-gray-500">¥ 固定</span>
        </div>
      </div>

      {/* Per-level rate table */}
      <div className="border-t border-gray-200 pt-3 space-y-2">
        <p className="text-xs text-gray-500 font-medium">按客户等级覆盖费率（优先于默认费率）</p>
        <div className="grid gap-2 text-xs text-gray-400 font-medium px-1" style={{gridTemplateColumns:'1fr 70px 70px 32px 32px'}}>
          <span>客户等级（可多选）</span>
          <span>费率 %</span>
          <span>固定费 ¥</span>
          <span></span>
          <span></span>
        </div>

        {loading ? (
          <div className="text-xs text-gray-400 text-center py-2">加载选项...</div>
        ) : (
          customerLevelFilter.map((row, i) => {
            const normalized = normalizeRow(row);
            return (
              <div key={i} className="grid gap-2 items-center" style={{gridTemplateColumns:'1fr 70px 70px 32px 32px'}}>
                <LevelPickerMulti
                  value={normalized.levels}
                  onChange={v => updateRow(i, 'levels', v)}
                  tiers={tiersList}
                  roles={roles}
                />
                <Input className="h-8 text-xs" type="number" step="0.1" value={row.rate ?? ''}
                  onChange={e => updateRow(i, 'rate', parseFloat(e.target.value) || 0)} placeholder="8" />
                <Input className="h-8 text-xs" type="number" value={row.fixed_fee ?? ''}
                  onChange={e => updateRow(i, 'fixed_fee', parseFloat(e.target.value) || 0)} placeholder="0" />
                <button type="button" onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
                {i > 0
                  ? <button type="button" onClick={() => moveRowUp(i)} className="text-gray-400 hover:text-blue-500" title="上移一行">
                      <ArrowUp className="w-4 h-4" />
                    </button>
                  : <span />
                }
              </div>
            );
          })
        )}

        {customerLevelFilter.length === 0 && !loading && (
          <div className="text-xs text-gray-400 text-center py-2 border border-dashed rounded-lg">暂无等级覆盖，点击添加</div>
        )}
        <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-full">
          <Plus className="w-3.5 h-3.5 mr-1" />添加客户等级费率
        </Button>
        <p className="text-xs text-gray-400">每行可选多个等级；任意匹配即生效，优先取列表中第一个匹配行。</p>
      </div>
    </div>
  );
}