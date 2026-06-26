import { Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FeeCalculator({ calculated, settings }) {
  if (!calculated) return null;

  return (
    <Card className="border-gray-200 bg-gray-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Calculator className="w-4 h-4" /> 
          {settings.prepayEnabled !== 'false' ? '预付款估算' : '费用估算'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* 费用明细 */}
        <div className="bg-white border border-gray-100 rounded-lg overflow-hidden text-sm">
          {/* 货款 */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-50">
            <span className="text-gray-500">货款</span>
            <span className="text-gray-700 font-medium">¥{parseFloat(calculated.jpy).toLocaleString()}</span>
          </div>
          
          {/* 服务费 */}
          <div className="border-b border-gray-50">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-gray-500 flex items-center gap-1">
                服务费
                {calculated.feeRateDisplay && (
                  <span className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5">
                    {calculated.feeRateDisplay}
                  </span>
                )}
              </span>
              <span className="text-gray-700 font-medium">¥{calculated.serviceFeeJpy.toLocaleString()}</span>
            </div>
            {/* 规则引擎计算步骤 */}
            {calculated.feeSteps && calculated.feeSteps.length > 0 && (
              <div className="px-3 pb-2 space-y-0.5">
                {calculated.feeSteps.map((step, i) => (
                  <div key={i} className="text-xs text-gray-400 font-mono pl-2 border-l-2 border-gray-100">
                    {step}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 增值服务 */}
          {calculated.addonTotal > 0 && (
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-50">
              <span className="text-gray-500">增值服务</span>
              <span className="text-gray-700 font-medium">¥{calculated.addonTotal.toLocaleString()}</span>
            </div>
          )}

          {/* 合计 */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50">
            <span className="text-gray-700 font-semibold">合计</span>
            <span className="text-gray-900 font-bold">¥{calculated.totalJpy.toLocaleString()}</span>
          </div>
        </div>

        {/* 应付金额高亮 */}
        {settings.prepayEnabled !== 'false' ? (
          <div className="flex items-center justify-between bg-red-50 border border-red-300 rounded-lg px-4 py-3">
            <div>
              <span className="text-sm text-gray-700 font-medium">本次应付预付款 ({calculated.prepayRate}%)</span>
              <p className="text-xs text-gray-400 mt-0.5">提交后跳转到付款页，请按此金额支付</p>
            </div>
            <span className="text-xl font-bold text-red-600">¥{calculated.prepayJpy.toLocaleString()}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-red-50 border border-red-300 rounded-lg px-4 py-3">
            <div>
              <span className="text-sm text-gray-700 font-medium">本次应付金额</span>
              <p className="text-xs text-gray-400 mt-0.5">提交后跳转到付款页，请按此金额支付</p>
            </div>
            <span className="text-xl font-bold text-red-600">¥{calculated.totalJpy.toLocaleString()}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}