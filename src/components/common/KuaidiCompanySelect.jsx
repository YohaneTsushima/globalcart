/**
 * KuaidiCompanySelect - 快递100 公司选择器（模糊查询 + 分页下拉）
 * 数据源：KUAIDI100_COMPANIES（约 3000 条 { code: name }）
 * 交互照 CountrySelect：触发按钮 + createPortal 弹层 + 搜索框 + 列表，
 * 列表按页渲染（每页 PAGE_SIZE 条），支持按中文名 / 编码模糊查询。
 *
 * Props:
 *   - value: 当前选中的快递100编码（可空）
 *   - name:  当前中文名（用于触发按钮展示，可空）
 *   - onSelect(code, name): 选中回调
 *   - placeholder: 触发按钮占位文案
 *   - className: 外层容器 class
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X } from "lucide-react";
import { KUAIDI100_COMPANIES } from "@/lib/kuaidi100Companies";

const PAGE_SIZE = 20;

// { code: name } → [{ code, name }]，只构建一次
const COMPANY_LIST = Object.entries(KUAIDI100_COMPANIES).map(([code, name]) => ({ code, name }));

export default function KuaidiCompanySelect({
  value,
  name,
  onSelect,
  placeholder = "从快递100选择",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const ref = useRef(null);
  const btnRef = useRef(null);
  const dropdownRef = useRef(null);

  // 点外关闭
  useEffect(() => {
    const handleClick = (e) => {
      if (
        ref.current && !ref.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropHeight = 320;
      const showAbove = spaceBelow < dropHeight && rect.top > dropHeight;
      setDropdownStyle({
        position: "fixed",
        top: showAbove ? rect.top - dropHeight - 4 : rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 280),
        zIndex: 9999,
      });
    }
    setOpen(o => !o);
  };

  // 模糊查询：中文名 或 编码（不区分大小写）
  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return COMPANY_LIST;
    const lower = q.toLowerCase();
    return COMPANY_LIST.filter(c =>
      c.name.includes(q) || c.code.toLowerCase().includes(lower)
    );
  }, [search]);

  // 分页
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // 搜索变化时回到第 1 页
  useEffect(() => {
    setPage(0);
  }, [search]);

  const handleSelect = (code, companyName) => {
    onSelect?.(code, companyName);
    setOpen(false);
    setSearch("");
    setPage(0);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className="flex w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring h-8"
      >
        {name ? (
          <span className="truncate">{name}</span>
        ) : (
          <span className="text-muted-foreground text-xs">{placeholder}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 opacity-50 flex-shrink-0 ml-1" />
      </button>
      {open && createPortal(
        <div ref={dropdownRef} style={dropdownStyle} className="rounded-md border bg-popover text-popover-foreground shadow-md">
          {/* 搜索框 */}
          <div className="flex items-center border-b px-3 py-2 gap-2">
            <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索快递公司名或编码..."
              className="flex-1 text-sm outline-none bg-transparent"
            />
            {search && (
              <button onClick={() => setSearch("")}><X className="w-3.5 h-3.5 text-gray-400" /></button>
            )}
          </div>

          {/* 列表（只渲染当前页） */}
          <div className="max-h-64 overflow-y-auto py-1">
            {pageItems.length === 0 ? (
              <div className="text-center py-4 text-xs text-gray-400">未找到匹配快递公司</div>
            ) : (
              pageItems.map(c => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => handleSelect(c.code, c.name)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground ${value === c.code ? "bg-accent font-medium" : ""}`}
                >
                  <span className="truncate">{c.name}</span>
                </button>
              ))
            )}
          </div>

          {/* 分页控件 */}
          <div className="flex items-center justify-between border-t px-3 py-1.5 text-xs text-gray-500">
            <span>共 {filtered.length.toLocaleString()} 条</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage <= 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className="px-2 py-0.5 rounded border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                上一页
              </button>
              <span className="px-1 tabular-nums">{safePage + 1} / {totalPages}</span>
              <button
                type="button"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                className="px-2 py-0.5 rounded border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                下一页
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
