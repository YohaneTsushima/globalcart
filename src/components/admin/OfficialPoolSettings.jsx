/**
 * OfficialPoolSettings
 * 官方拼邮全局设置：预估运费全局建议费率（在各运输方式未单独配置时作为兜底）
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EstimateRateGlobalSetting } from "@/components/admin/ShippingMethodManager";
import { Layers } from "lucide-react";

export default function OfficialPoolSettings({ settings = [] }) {
  return (
    <div className="space-y-4">
      <Card className="border-purple-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-500" />官方拼邮运费预估设置
          </CardTitle>
          <p className="text-xs text-gray-400 mt-1">
            官方拼邮一次付款时，系统需要预估运费供用户参考。优先使用各运输方式中单独配置的「官方拼邮预估运费简易估算率」；
            若运输方式未配置，则使用此处的全局兜底费率。
          </p>
        </CardHeader>
        <CardContent>
          <EstimateRateGlobalSetting settings={settings} />
        </CardContent>
      </Card>

      <Card className="border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700">各运输方式的官方拼邮估算率</CardTitle>
          <p className="text-xs text-gray-400 mt-1">
            可在「运输方式」tab 中，展开各运输方式并进入编辑，在「官方拼邮预估运费简易估算率」区域按国家/地带配置。
            每个运输方式支持按不同国家/地带设置不同费率，优先级高于上方全局设置。
          </p>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs text-gray-500 space-y-1.5">
            <p className="font-medium text-gray-700">有效性说明</p>
            <p>· 全局费率（此处）：作为兜底，适用于所有未单独配置的运输方式</p>
            <p>· 运输方式级费率：在各运输方式中按国家/地带配置，优先级最高</p>
            <p>· 计算逻辑：预估费用 = ceil(总重量 / 计算单位g) × 每单位JPY</p>
            <p>· 此预估仅供用户参考，管理员实际填写运费时以实际重量计算为准</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}