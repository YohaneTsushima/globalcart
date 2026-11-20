/**
 * SplitAfterWarehouseModal
 * 入库后拆单申请：用户填写要拆出的订单（名称 / 价格 / 备注），可一次提交多个。
 * 提交后写入 order_split_request，等待管理员审核；审核通过才真正生成子订单。
 */
import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Scissors, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { persistentToastError } from "@/lib/toastUtils.jsx";

const CN_NUMBERS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

const chineseNumber = (n) => (n >= 1 && n <= CN_NUMBERS.length ? CN_NUMBERS[n - 1] : String(n));

const numberedName = (baseName, index) => `${baseName} 之${chineseNumber(index)}`;

export default function SplitAfterWarehouseModal({ order, onClose, onSuccess }) {
  const baseName = order?.order_name || order?.product_name || "订单";
  const [parentAmount, setParentAmount] = useState(Number(order?.estimated_jpy) || 0);
  const existingChildCount = Array.isArray(order?.child_order_ids) ? order.child_order_ids.length : 0;

  // 列表数据偶尔没带 estimated_jpy，兜底查一次订单详情
  useEffect(() => {
    if (parentAmount > 0 || !order?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await base44.functions.invoke("order/info/orderDetail", { id: String(order.id) });
        const detail = r?.data?.data ?? r?.data;
        const amount = Number(detail?.estimated_jpy) || 0;
        if (!cancelled && amount > 0) setParentAmount(amount);
      } catch (_) { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [order?.id, parentAmount]);

  const [items, setItems] = useState([
    { name: numberedName(baseName, existingChildCount + 1), price: "", note: "", manual: false },
  ]);
  const [submitting, setSubmitting] = useState(false);

  // 拆 N 单：每单 = 原价 ÷ (N+1)，父单保留一份（除不尽的零头留给父单）
  const autoPriceFor = (count) => {
    if (!parentAmount || parentAmount <= 0 || count <= 0) return "";
    return String(Math.floor(parentAmount / (count + 1)));
  };

  // 只重算「没被手动改过」的行，用户改过的价格保留
  const distributeAutoPrices = (list) => {
    const share = autoPriceFor(list.length);
    if (share === "") return list;
    return list.map(it => (it.manual ? it : { ...it, price: share }));
  };

  const updateItem = (index, patch) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== index) return it;
      const next = { ...it, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "price")) next.manual = true;
      return next;
    }));
  };

  const addItem = () => {
    setItems(prev => distributeAutoPrices([
      ...prev,
      {
        name: numberedName(baseName, existingChildCount + prev.length + 1),
        price: autoPriceFor(prev.length + 1),
        note: "",
        manual: false,
      },
    ]));
  };

  const removeItem = (index) => {
    setItems(prev => (prev.length <= 1 ? prev : distributeAutoPrices(prev.filter((_, i) => i !== index))));
  };

  // 原订单金额到位（或被兜底查回来后）自动填一次平均价
  useEffect(() => {
    if (parentAmount > 0) setItems(prev => distributeAutoPrices(prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentAmount]);

  const total = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.price) || 0), 0),
    [items]
  );

  const remaining = parentAmount - total;
  const overLimit = total >= parentAmount;
  const invalid = items.some(it => !it.name.trim() || !(Number(it.price) > 0));

  const handleSubmit = async () => {
    if (submitting) return;
    if (invalid) {
      persistentToastError("请填写完整的名称和大于 0 的价格");
      return;
    }
    if (overLimit) {
      persistentToastError(`拆出金额合计必须小于原订单金额（${parentAmount} JPY）`);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        order_id: order.id,
        items: items.map(it => ({
          name: it.name.trim(),
          price_jpy: Number(it.price),
          note: it.note.trim(),
        })),
      };

      console.log(payload)

      return;

      const res = await base44.functions.invoke("order/split/create", payload);
      const code = res?.data?.code;
      if (code !== 0 && code !== 200) {
        throw new Error(res?.data?.msg || "提交失败");
      }
      onSuccess?.();
    } catch (err) {
      persistentToastError(err?.response?.data?.message || err?.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">申请拆单</h3>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-500" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2.5 text-xs text-indigo-700">
            <p className="font-medium mb-0.5">把这一单拆成多单，价格从原订单扣减</p>
            <p className="text-indigo-500">
              原订单金额 <b>{parentAmount.toLocaleString()} JPY</b>
              {order?.product_name ? ` · ${order.product_name}` : ""}
            </p>
            <p className="text-indigo-500 mt-1">提交后由管理员审核，通过后生成独立订单（已入库状态）。</p>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50/60">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-600">拆出订单 {index + 1}</span>
                  {items.length > 1 && (
                    <button className="text-gray-400 hover:text-red-500" onClick={() => removeItem(index)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div>
                  <Label className="text-xs text-gray-500">订单名称</Label>
                  <Input
                    className="mt-1 h-8 text-sm"
                    value={item.name}
                    onChange={e => updateItem(index, { name: e.target.value })}
                    placeholder="默认「原订单名 之一」，可修改"
                  />
                </div>

                <div>
                  <Label className="text-xs text-gray-500">价格（JPY）</Label>
                  <Input
                    className="mt-1 h-8 text-sm"
                    type="number"
                    min="1"
                    value={item.price}
                    onChange={e => updateItem(index, { price: e.target.value })}
                    placeholder="从原订单扣减的金额"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    平均 {autoPriceFor(items.length) || "-"} JPY/单（{items.length} 单，父单保留一份；可手改）
                  </p>
                </div>

                <div>
                  <Label className="text-xs text-gray-500">备注（可选）</Label>
                  <Textarea
                    className="mt-1 text-sm"
                    rows={2}
                    value={item.note}
                    onChange={e => updateItem(index, { note: e.target.value })}
                    placeholder="其他说明..."
                  />
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={addItem}>
            <Plus className="w-3.5 h-3.5 mr-1" />再拆一单
          </Button>

          <div className={`flex items-center justify-between text-sm px-1 ${overLimit ? "text-red-600" : "text-gray-700"}`}>
            <span>拆出合计</span>
            <span className="font-semibold">
              {total.toLocaleString()} JPY
              <span className="text-xs font-normal text-gray-400 ml-2">
                原订单剩余 {Math.max(remaining, 0).toLocaleString()} JPY
              </span>
            </span>
          </div>
        </div>

        <div className="px-5 py-3 border-t flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={handleSubmit}
            disabled={submitting || invalid || overLimit}
          >
            {submitting
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />提交中...</>
              : <><Scissors className="w-3.5 h-3.5 mr-1.5" />提交申请</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
