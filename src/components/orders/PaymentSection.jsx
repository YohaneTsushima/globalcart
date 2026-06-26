import { CreditCard, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PaymentMethodSelector from "@/components/common/PaymentMethodSelector";

export default function PaymentSection({
  paymentMode,
  setPaymentMode,
  paymentMethod,
  setPaymentMethod,
  paymentMethods,
  settings,
  canPrePay,
  canFullPay,
  canDeferredPay,
  canApplyCredit,
  userCredit,
  calculated
}) {
  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-700">付款方式</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 付款选项 */}
        <div className="grid grid-cols-2 gap-2">
          {settings.prepayEnabled !== 'false' && canPrePay && (
            <button
              type="button"
              onClick={() => setPaymentMode("prepay")}
              className={`p-3 rounded-lg border-2 text-sm font-medium transition-all text-left ${
                paymentMode === "prepay" 
                  ? "border-red-500 bg-red-50 text-red-700" 
                  : "border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              <div className="font-semibold">立即预付款</div>
              <div className="text-xs mt-0.5 opacity-70">提交后直接前往付款页</div>
            </button>
          )}
          
          {settings.prepayEnabled === 'false' && canFullPay && (
            <button
              type="button"
              onClick={() => setPaymentMode("fullpay")}
              className={`p-3 rounded-lg border-2 text-sm font-medium transition-all text-left ${
                paymentMode === "fullpay" 
                  ? "border-red-500 bg-red-50 text-red-700" 
                  : "border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              <div className="font-semibold">立即全额付款</div>
              <div className="text-xs mt-0.5 opacity-70">提交后前往付款页全额支付</div>
            </button>
          )}
          
          {canDeferredPay && settings.deferred_payment_enabled !== 'false' && (
            <button
              type="button"
              onClick={() => setPaymentMode("deferred")}
              className={`p-3 rounded-lg border-2 text-sm font-medium transition-all text-left ${
                paymentMode === "deferred" 
                  ? "border-purple-500 bg-purple-50 text-purple-700" 
                  : "border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              <div className="font-semibold">后付款</div>
              <div className="text-xs mt-0.5 opacity-70">
                货款在支付运费时一并支付
                {(parseFloat(settings.deferred_payment_surcharge_rate) || 0) > 0 && `（加算 ${parseFloat(settings.deferred_payment_surcharge_rate)}%）`}
              </div>
            </button>
          )}

          {/* 记账选项 */}
          {canApplyCredit && userCredit?.credit_enabled && userCredit?.credit_cycle === 'weekly' && (
            <button
              type="button"
              onClick={() => setPaymentMode("credit_weekly")}
              className={`p-3 rounded-lg border-2 text-sm font-medium transition-all text-left ${
                paymentMode === "credit_weekly" 
                  ? "border-blue-500 bg-blue-50 text-blue-700" 
                  : "border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              <div className="font-semibold flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5" />记账周结
              </div>
              <div className="text-xs mt-0.5 opacity-70">记账日起 7 天结清</div>
            </button>
          )}
          
          {canApplyCredit && userCredit?.credit_enabled && userCredit?.credit_cycle === 'monthly' && (
            <button
              type="button"
              onClick={() => setPaymentMode("credit_monthly")}
              className={`p-3 rounded-lg border-2 text-sm font-medium transition-all text-left ${
                paymentMode === "credit_monthly" 
                  ? "border-blue-500 bg-blue-50 text-blue-700" 
                  : "border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              <div className="font-semibold flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5" />记账月结
              </div>
              <div className="text-xs mt-0.5 opacity-70">每月 1 日结清欠款</div>
            </button>
          )}
        </div>

        {/* 记账额度信息 */}
        {(paymentMode === "credit_weekly" || paymentMode === "credit_monthly") && userCredit && (
          <div className={`border rounded-lg px-3 py-2.5 text-xs space-y-1 ${
            calculated && calculated.totalJpy > Math.max(0, (userCredit.credit_limit_jpy || 0) - (userCredit.credit_balance_jpy || 0)) 
              ? "bg-orange-50 border-orange-200 text-orange-800" 
              : "bg-blue-50 border-blue-100 text-blue-700"
          }`}>
            <p>当前欠款：<span className="font-bold">¥{(userCredit.credit_balance_jpy || 0).toLocaleString()}</span></p>
            <p>欠款上限：¥{(userCredit.credit_limit_jpy || 0).toLocaleString()}</p>
            <p>剩余可用额度：<span className="font-bold">¥{Math.max(0, (userCredit.credit_limit_jpy || 0) - (userCredit.credit_balance_jpy || 0)).toLocaleString()}</span></p>
            {userCredit.credit_next_due_date && <p>下次结帐日：{userCredit.credit_next_due_date}</p>}
            {calculated && (
              <p className="font-medium">本次将记账：¥{calculated.totalJpy.toLocaleString()} JPY（全额）</p>
            )}
            {calculated && calculated.totalJpy > Math.max(0, (userCredit.credit_limit_jpy || 0) - (userCredit.credit_balance_jpy || 0)) && (
              <p className="font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                额度不足，提交后将自动改为后付款方式
              </p>
            )}
          </div>
        )}

        {/* 支付方式选择 */}
        {(paymentMode === "prepay" || paymentMode === "fullpay") && paymentMethods.length > 0 && (
          <PaymentMethodSelector
            value={paymentMethod}
            onChange={(m) => setPaymentMethod(m.value)}
            prefetched={paymentMethods}
            activeColor="border-red-500 bg-red-50 text-red-700"
          />
        )}
      </CardContent>
    </Card>
  );
}