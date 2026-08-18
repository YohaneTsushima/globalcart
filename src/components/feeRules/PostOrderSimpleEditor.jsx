/**
 * 发货阶段简单比例编辑器
 * 配置：客户等级（多选）→ 运费费率 + 固定费
 * value: [{levels:[{type,id,name,color}], rate, fixed_fee_jpy}]
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

// Multi-select picker for customer levels
function LevelPicker({ value = [], onChange, tiers, roles }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedIds = new Set(value.map(v => v.id));
  const allOptions = [
    ...tiers.map(t => ({ type: 'tier', id: t.id, name: t.name, color: t.color })),
    ...roles.map(r => ({ type: 'role', id: r.id, name: r.name, color: r.color })),
  ];

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
          ? <span className="text-xs text-gray-400">所有用户</span>
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
          <button type="button" onClick={() => { onChange([]); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 text-left text-xs border-b border-gray-100 ${value.length === 0 ? 'bg-gray-50 font-medium' : ''}`}>
            <span className="px-1 py-0.5 rounded bg-gray-100 text-gray-600">全部用户</span>
            {value.length === 0 && <span className="text-blue-500 ml-auto">✓</span>}
          </button>
          {allOptions.length === 0
            ? <div className="text-xs text-gray-400 text-center py-2">暂无等级</div>
            : <>
              {tiers.length > 0 && (
                <>
                  <div className="px-2 py-1 text-xs text-gray-400 bg-gray-50 font-medium sticky top-8">会员等级</div>
                  {tiers.map(opt => (
                    <button key={opt.id} type="button" onClick={() => toggle(opt)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 hover:bg-blue-50 text-left text-xs ${selectedIds.has(opt.id) ? 'bg-blue-50' : ''}`}>
                      <RoleColorBadge name={opt.name} color={opt.color} />
                      {selectedIds.has(opt.id) && <span className="text-blue-500 ml-auto">✓</span>}
                    </button>
                  ))}
                </>
              )}
              {roles.length > 0 && (
                <>
                  <div className="px-2 py-1 text-xs text-gray-400 bg-gray-50 font-medium sticky top-8">角色标签</div>
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

export default function PostOrderSimpleEditor({ value = [], onChange }) {
  const [tiers, setTiers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      tenantManage.list('MemberTier'),
      // base44.functions.invoke('serviceFeeRuleEngine', { action: 'list_member_tiers' }),
      // base44.functions.invoke('serviceFeeRuleEngine', { action: 'list_roles' }),
      tenantManage.list('TenantRole')
    ]).then(([t, r]) => {
      setTiers(t?.data || []);
      setRoles((r?.data || []).filter(x => !x.is_global && !x.is_archived));
      setLoading(false);
    });
  }, []);

  const addRow = () => {
    onChange([...value, { levels: [], rate: 0, fixed_fee_jpy: 0 }]);
  };

  const removeRow = (idx) => onChange(value.filter((_, i) => i !== idx));

  const moveRowUp = (idx) => {
    if (idx === 0) return;
    const arr = [...value];
    [arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]];
    onChange(arr);
  };

  const update = (idx, key, val) => {
    onChange(value.map((v, i) => i === idx ? { ...v, [key]: val } : v));
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 text-xs text-gray-500 font-medium px-1" style={{gridTemplateColumns:'1fr 70px 70px 32px 32px'}}>
        <span>客户等级</span>
        <span>运费费率 %</span>
        <span>固定费 ¥</span>
        <span></span>
        <span></span>
      </div>

      {loading ? (
        <div className="text-xs text-gray-400 text-center py-3">加载选项...</div>
      ) : (
        value.map((item, idx) => (
          <div key={idx} className="grid gap-2 items-center" style={{gridTemplateColumns:'1fr 70px 70px 32px 32px'}}>
            <LevelPicker
              value={item.levels || []}
              onChange={v => update(idx, 'levels', v)}
              tiers={tiers}
              roles={roles}
            />
            <div className="flex items-center gap-1">
              <Input className="h-8 text-xs" type="number" step="0.1" value={item.rate ?? 0}
                onChange={e => update(idx, 'rate', parseFloat(e.target.value) || 0)} placeholder="0" />
              <span className="text-xs text-gray-400">%</span>
            </div>
            <Input className="h-8 text-xs" type="number" value={item.fixed_fee_jpy ?? 0}
              onChange={e => update(idx, 'fixed_fee_jpy', parseFloat(e.target.value) || 0)} placeholder="0" />
            <button type="button" onClick={() => removeRow(idx)} className="text-red-400 hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </button>
            {idx > 0
              ? <button type="button" onClick={() => moveRowUp(idx)} className="text-gray-400 hover:text-blue-500" title="上移一行">
                  <ArrowUp className="w-4 h-4" />
                </button>
              : <span />
            }
          </div>
        ))
      )}

      {value.length === 0 && !loading && (
        <div className="text-xs text-gray-400 text-center py-3 border border-dashed rounded-lg">暂未配置，将对所有用户使用默认费率</div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-full">
        <Plus className="w-3.5 h-3.5 mr-1" />添加费率配置行
      </Button>

      <p className="text-xs text-gray-400">费率乘算实际国际运费，固定费额外叠加。序号越小优先级越高，匹配到第一个符合等级即生效。客户等级为空=匹配所有用户。</p>
    </div>
  );
}