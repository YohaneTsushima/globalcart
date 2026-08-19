/**
 * CreditPanel - User-facing panel showing credit status, next due date, 
 * and options to apply/adjust credit, or make a payment.
 * Shown in UserPreferences page.
 */
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Calendar, AlertCircle, CheckCircle, Clock, Upload, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { tenantEntity } from "@/lib/tenantApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PaymentMethodSelector from "@/components/common/PaymentMethodSelector";

const CYCLE_LABELS = { weekly: "周结（记账日起7天结算）", monthly: "月结（每月1日结算）" };

export default function CreditPanel({ refreshKey }) {
  const queryClient = useQueryClient();
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [applyForm, setApplyForm] = useState({
    application_type: "apply",
    requested_cycle: "monthly",
    requested_limit_jpy: "",
    reason: "",
  });
  const [submitMsg, setSubmitMsg] = useState(null);

  // Payment state
  const [showPayment, setShowPayment] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [payingCredit, setPayingCredit] = useState(false);
  const [proofUrl, setProofUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);
  const [rates, setRates] = useState(null);

  const { data: creditApplicationEnabled = false } = useQuery({
    queryKey: ['credit-application-enabled'],
    queryFn: async () => {
      const creditSettings = await tenantEntity.list('SiteSettings', { key: 'credit_application_enabled' }).catch(() => []);
      return creditSettings?.length > 0 ? creditSettings[0].value === 'true' : false;
    },
    staleTime: 10 * 60 * 1000,
    placeholderData: false,
    refetchOnMount: false,
  });

  useEffect(() => {
    fetch('https://v6.exchangerate-api.com/v6/89e2f91c758d92aa2c06667b/latest/JPY')
      .then(r => r.json())
      .then(d => { if (d?.result === 'success') setRates(d.conversion_rates); })
      .catch(() => {});
  }, []);

  const { data: credit, isLoading: loading, refetch: load } = useQuery({
    queryKey: ['user-credit', refreshKey],
    queryFn: async () => {
      // const r = await base44.functions.invoke('manageCreditApplication', { action: 'get_user_credit' });
      const r = {};
      return r.data || null;
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: null,
    refetchOnMount: false,
  });

  const af = (k, v) => setApplyForm(p => ({ ...p, [k]: v }));

  const handleSubmitApply = async () => {
    if (applyForm.application_type !== 'disable' && (!applyForm.requested_cycle || !applyForm.requested_limit_jpy)) return;
    setSubmitting(true);
    setSubmitMsg(null);
    // const action = applyForm.application_type === 'disable' ? 'disable' : 'apply';
    // const r = await base44.functions.invoke('manageCreditApplication', {
    //   action,
    //   ...applyForm,
    //   requested_limit_jpy: parseFloat(applyForm.requested_limit_jpy) || 0,
    // });
    const r = {};
    if (r.data?.error) {
      setSubmitMsg({ type: 'error', text: r.data.error });
    } else {
      setSubmitMsg({ type: 'success', text: '申请已提交，请等待管理员审核。' });
      setShowApplyForm(false);
      await load();
    }
    setSubmitting(false);
  };

  const handlePayCredit = async () => {
    setPayingCredit(true);
    const r = await base44.functions.invoke('generateAlipayCreditPayment', {});
    const url = r.data?.paymentUrl;
    if (url) window.open(url, '_blank');
    setPayingCredit(false);
  };

  const handleProofUploaded = async (file) => {
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setProofUrl(file_url);
    setUploading(false);
    setSubmitting(true);
    // For manual credit repayment: notify via manageCreditApplication with proof
    await base44.functions.invoke('manageCreditApplication', {
      action: 'submit_repayment_proof',
      payment_method: selectedMethod?.value,
      payment_proof_url: file_url,
    });
    setSubmitting(false);
    setPaySuccess(true);
    await load();
  };

  // Compute converted amount for display
  const CURRENCY_SYMBOLS = { JPY: "¥", CNY: "¥", USD: "$", TWD: "NT$", HKD: "HK$", EUR: "€", SGD: "S$" };
  const payCurrency = selectedMethod?.payment_currency || null;
  let convertedDisplay = null;
  let convertedRate = null;
  const balance = credit?.credit_balance_jpy || 0;
  if (payCurrency && payCurrency !== "JPY" && rates && rates[payCurrency]) {
    const converted = balance * rates[payCurrency];
    const decimals = ["TWD", "HKD", "CNY"].includes(payCurrency) ? 1 : 2;
    convertedDisplay = `${CURRENCY_SYMBOLS[payCurrency] || payCurrency}${converted.toFixed(decimals)} ${payCurrency}`;
    convertedRate = rates[payCurrency];
  }

  if (loading) {
    return (
      <Card className="border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <CreditCard className="w-4 h-4" />记账结算
          </CardTitle>
        </CardHeader>
        <CardContent><p className="text-xs text-gray-400">加载中...</p></CardContent>
      </Card>
    );
  }

  const isEnabled = credit?.credit_enabled;
  const hasPending = !!credit?.pending_application;
  const limit = credit?.credit_limit_jpy || 0;
  const usagePct = limit > 0 ? Math.min(100, (balance / limit) * 100) : 0;

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <CreditCard className="w-4 h-4" />记账结算
          {isEnabled && <Badge className="text-xs bg-green-100 text-green-700">已开启</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Credit status display (enabled users) */}
        {isEnabled && (
          <div className="space-y-3">
            {/* Balance overview */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-600 font-medium">当前欠款余额</p>
                  <p className="text-2xl font-bold text-blue-800 mt-0.5">
                    ¥{balance.toLocaleString()} <span className="text-sm font-normal">JPY</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-blue-500">欠款上限</p>
                  <p className="text-sm font-semibold text-blue-700">¥{limit.toLocaleString()}</p>
                </div>
              </div>

              {/* Usage bar */}
              {limit > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-blue-500 mb-1">
                    <span>已用 {usagePct.toFixed(0)}%</span>
                    <span>剩余额度 ¥{Math.max(0, limit - balance).toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${usagePct >= 90 ? 'bg-red-500' : usagePct >= 70 ? 'bg-orange-400' : 'bg-blue-500'}`}
                      style={{ width: `${usagePct}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-blue-100 text-xs">
                <div>
                  <p className="text-blue-500">结帐周期</p>
                  <p className="font-medium text-blue-800 mt-0.5">
                    {credit.credit_cycle === 'weekly' ? '周结' : '月结'}
                  </p>
                </div>
                {/* 周结且无欠款时不显示日期，有欠款或月结才显示 */}
                {(credit.credit_cycle !== 'weekly' || balance > 0) && credit.credit_next_due_date && (
                  <div>
                    <p className="text-blue-500 flex items-center gap-1"><Calendar className="w-3 h-3" />下次结帐日</p>
                    <p className="font-medium text-blue-800 mt-0.5">{credit.credit_next_due_date}</p>
                  </div>
                )}
                {(credit.credit_cycle !== 'weekly' || balance > 0) && credit.credit_start_date && (
                  <div>
                    <p className="text-blue-500">记账开始日</p>
                    <p className="font-medium text-blue-800 mt-0.5">{credit.credit_start_date}</p>
                  </div>
                )}
                {credit.credit_cycle === 'weekly' && balance === 0 && (
                  <div className="col-span-2">
                    <p className="text-blue-400 italic">产生欠款后将自动计算结帐周期</p>
                  </div>
                )}
              </div>
            </div>

            {/* Payment section */}
            {balance > 0 && (
              <div>
                {!showPayment ? (
                  <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => { setShowPayment(true); setPaySuccess(false); setProofUrl(""); setSelectedMethod(null); }}>
                    <CreditCard className="w-3.5 h-3.5 mr-1.5" />立即还款 ¥{balance.toLocaleString()} JPY
                  </Button>
                ) : paySuccess ? (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 text-xs text-green-700">
                    <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    还款凭证已提交，管理员确认后将更新账单。
                  </div>
                ) : (
                  <div className="border border-blue-200 rounded-lg p-3 space-y-3 bg-blue-50/30">
                    <p className="text-xs font-medium text-gray-700">选择还款方式</p>
                    <PaymentMethodSelector
                      value={selectedMethod?.value || ""}
                      onChange={m => { setSelectedMethod(m); setProofUrl(""); }}
                      activeColor="border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200"
                    />

                    {/* Currency conversion notice — show whenever selected method currency is not JPY */}
                    {selectedMethod && payCurrency && payCurrency !== "JPY" && (
                      <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 space-y-1">
                        {convertedDisplay ? (
                          <>
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <span>汇率换算参考</span>
                              <span>1 JPY ≈ {convertedRate?.toFixed(4)} {payCurrency}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-orange-700">实际应付（{payCurrency}）</span>
                              <span className="text-base font-bold text-orange-600">{convertedDisplay}</span>
                            </div>
                            <p className="text-xs text-orange-400">汇率实时参考，以实际到账为准</p>
                          </>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-orange-500">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>正在获取实时汇率，请稍候...</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Auto payment (provider_key set = automatic gateway) */}
                    {selectedMethod?.value === "alipay" && (
                      <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700"
                        onClick={handlePayCredit} disabled={payingCredit}>
                        {payingCredit ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />生成中...</> : "打开支付宝还款"}
                      </Button>
                    )}

                    {/* Manual payment — show QR/note + proof upload */}
                    {selectedMethod && !selectedMethod.value.match(/^alipay$/) && (
                      <div className="space-y-2">
                        {(selectedMethod.image_url || selectedMethod.payment_note) && (
                          <div className="p-2.5 bg-white border border-gray-200 rounded-lg space-y-2">
                            {selectedMethod.image_url && (
                              <div className="text-center">
                                <img src={selectedMethod.image_url} alt="收款码" className="h-32 mx-auto rounded object-contain border border-gray-100" />
                              </div>
                            )}
                            {selectedMethod.payment_note && (
                              <p className="text-xs text-gray-600 whitespace-pre-wrap text-center">{selectedMethod.payment_note}</p>
                            )}
                          </div>
                        )}
                        <Label className="text-xs">上传还款凭证（上传后自动提交）</Label>
                        <label
                          className="cursor-pointer block"
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith("image/")) handleProofUploaded(f); }}
                        >
                          <div className={`flex flex-col items-center gap-1 px-3 py-4 border-2 border-dashed rounded-lg text-xs transition-colors ${
                            proofUrl ? "border-green-300 bg-green-50 text-green-700" :
                            uploading ? "border-blue-200 bg-blue-50 text-blue-500" :
                            "border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500"
                          }`}>
                            {proofUrl ? <><CheckCircle className="w-4 h-4" /><span>凭证已上传，正在提交...</span></>
                              : uploading ? <><Loader2 className="w-4 h-4 animate-spin" /><span>上传中...</span></>
                              : <><Upload className="w-4 h-4" /><span>点击或拖拽图片到此处</span></>}
                          </div>
                          <input type="file" accept="image/*" className="hidden"
                            onChange={e => { const f = e.target.files[0]; if (f) handleProofUploaded(f); }}
                            disabled={uploading || submitting} />
                        </label>
                        <input
                          type="text"
                          placeholder="或点击此处后粘贴截图（Ctrl+V / ⌘V）"
                          className="w-full h-8 px-3 text-xs border border-gray-300 rounded-md bg-white text-gray-500 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 transition-colors"
                          disabled={uploading || submitting}
                          onPaste={e => { const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith("image/")); if (item) { e.preventDefault(); const f = item.getAsFile(); if (f) handleProofUploaded(f); } }}
                          onChange={() => {}}
                        />
                      </div>
                    )}

                    <button className="text-xs text-gray-400 hover:text-gray-600 w-full text-center pt-1" onClick={() => { setShowPayment(false); setSelectedMethod(null); }}>取消</button>
                  </div>
                )}
              </div>
            )}

            {balance === 0 && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-xs text-green-700">
                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                账单已结清，无欠款
              </div>
            )}

            {/* Adjust button */}
            <Button size="sm" variant="outline" className="w-full text-xs"
              onClick={() => { setApplyForm(p => ({ ...p, application_type: 'adjust' })); setShowApplyForm(true); }}>
              申请调整记账额度/周期
            </Button>

            {/* Disable credit button — only if no pending app and balance is 0 */}
            {!hasPending && balance === 0 && (
              <Button size="sm" variant="outline" className="w-full text-xs text-red-500 border-red-200 hover:bg-red-50"
                onClick={() => { setApplyForm(p => ({ ...p, application_type: 'disable' })); setShowApplyForm(true); }}>
                申请关闭记账功能
              </Button>
            )}
          </div>
        )}

        {/* Not enabled */}
        {!isEnabled && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-xs text-gray-600">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-400" />
              <span>记账功能未开启。开启后可在提交购买需求时选择"记账周结"或"记账月结"付款方式。</span>
            </div>

            {hasPending && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                您的申请正在审核中，请等待管理员处理。
              </div>
            )}

            {!hasPending && creditApplicationEnabled && (
              <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={() => { setApplyForm(p => ({ ...p, application_type: 'apply' })); setShowApplyForm(true); }}>
                <CreditCard className="w-3.5 h-3.5 mr-1.5" />申请开启记账功能
              </Button>
            )}

            {!creditApplicationEnabled && (
              <p className="text-xs text-gray-400 text-center">如需开启记账功能，请联系管理员</p>
            )}
          </div>
        )}

        {/* Application form */}
        {showApplyForm && (
          <div className={`border rounded-xl p-4 space-y-3 ${applyForm.application_type === 'disable' ? 'border-red-200 bg-red-50/30' : 'border-blue-200 bg-blue-50/30'}`}>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-800">
                {applyForm.application_type === 'apply' ? '申请开启记账' :
                 applyForm.application_type === 'adjust' ? '申请调整记账' : '申请关闭记账'}
              </h4>
              <button onClick={() => { setShowApplyForm(false); setSubmitMsg(null); }}>
                <span className="text-gray-400 text-xs">取消</span>
              </button>
            </div>

            {applyForm.application_type === 'disable' && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                关闭后将无法使用记账付款，如需重新开启须重新申请。
              </div>
            )}

            {applyForm.application_type !== 'disable' && (
              <>
                <div>
                  <Label className="text-xs text-gray-500">申请结帐周期 *</Label>
                  <Select value={applyForm.requested_cycle} onValueChange={v => af("requested_cycle", v)}>
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">周结（记账日起7天结算）</SelectItem>
                      <SelectItem value="monthly">月结（每月结束前5天结算）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs text-gray-500">申请欠款上限（JPY）*</Label>
                  <Input type="number" className="mt-1 h-8 text-sm" placeholder="如：50000"
                    value={applyForm.requested_limit_jpy} onChange={e => af("requested_limit_jpy", e.target.value)} />
                </div>
              </>
            )}

            <div>
              <Label className="text-xs text-gray-500">{applyForm.application_type === 'disable' ? '关闭原因（可选）' : '申请理由'}</Label>
              <Textarea rows={2} className="mt-1 text-sm" placeholder="简述原因（可选）..."
                value={applyForm.reason} onChange={e => af("reason", e.target.value)} />
            </div>

            {submitMsg && (
              <p className={`text-xs px-3 py-2 rounded border ${submitMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {submitMsg.text}
              </p>
            )}

            <Button size="sm"
              className={`w-full ${applyForm.application_type === 'disable' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              onClick={handleSubmitApply}
              disabled={submitting || (applyForm.application_type !== 'disable' && (!applyForm.requested_cycle || !applyForm.requested_limit_jpy))}>
              {submitting ? "提交中..." : "提交申请"}
            </Button>
          </div>
        )}

        {/* Recent application status */}
        {!showApplyForm && credit?.recent_applications?.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">申请记录</p>
            {credit.recent_applications.slice(0, 3).map(app => (
              <div key={app.id} className="flex items-center gap-2 text-xs text-gray-500">
                <Badge className={`text-[10px] ${
                  app.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                  app.status === 'approved' ? 'bg-green-100 text-green-700' :
                  'bg-red-100 text-red-600'
                }`}>
                  {app.status === 'pending' ? '审核中' : app.status === 'approved' ? '已通过' : '已拒绝'}
                </Badge>
                <span>{app.application_type === 'apply' ? '开通申请' : '调整申请'}</span>
                <span className="text-gray-300">·</span>
                <span>{app.requested_cycle === 'weekly' ? '周结' : '月结'} ¥{(app.requested_limit_jpy || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}