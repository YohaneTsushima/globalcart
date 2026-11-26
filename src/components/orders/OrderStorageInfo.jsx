import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Package, Clock, DollarSign, AlertTriangle, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function OrderStorageInfo({ order, onReload }) {
  const [storageInfo, setStorageInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!order?.id) return;
    
    const loadStorageInfo = async () => {
      try {
        const response = await base44.functions.invoke('config/storage/orderFee', {
          order_id: order.id
        });
        if (response?.data) {
          setStorageInfo(response.data);
        }
      } catch (error) {
        console.error('加载仓储信息失败:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStorageInfo();
  }, [order?.id]);

  if (loading || !storageInfo?.enabled) {
    return null;
  }

  const isOverdue = storageInfo.overdue_days > 0;
  const daysUntilDeadline = storageInfo.deadline_days - storageInfo.storage_days;
  const isApproachingDeadline = daysUntilDeadline <= 7 && daysUntilDeadline > 0;

  return (
    <Card className={`border ${isOverdue ? 'border-red-200 bg-red-50' : isApproachingDeadline ? 'border-amber-200 bg-amber-50' : 'border-gray-200'}`}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Package className="w-4 h-4" />
            仓储信息
          </h3>
          {isOverdue && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="w-3 h-3 mr-1" />
              已超期 {storageInfo.overdue_days} 天
            </Badge>
          )}
          {isApproachingDeadline && !isOverdue && (
            <Badge className="bg-amber-500 text-white text-xs">
              <Clock className="w-3 h-3 mr-1" />
              即将到期
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">入库日期</p>
              <p className="text-gray-700 font-medium">{order.in_warehouse_date || '-'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">已存放</p>
              <p className="text-gray-700 font-medium">{storageInfo.storage_days} 天</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">存放期限</p>
              <p className="text-gray-700 font-medium">{storageInfo.deadline_days} 天</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">仓储费率</p>
              <p className="text-gray-700 font-medium">
                {storageInfo.storage_fee_per_day > 0 
                  ? `¥${storageInfo.storage_fee_per_day} /天`
                  : '免费'}
              </p>
            </div>
          </div>
        </div>

        {isOverdue && storageInfo.total_fee > 0 && (
          <Alert className="border-red-200 bg-white">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-sm text-red-700 ml-2">
              <strong>逾期费用：¥{storageInfo.total_fee} {storageInfo.currency || 'JPY'}</strong>
              <p className="text-xs mt-1">
                超期 {storageInfo.overdue_days} 天 × ¥{storageInfo.storage_fee_per_day}/天
              </p>
              <p className="text-xs mt-1">
                此费用将在运费结算时一并收取
              </p>
            </AlertDescription>
          </Alert>
        )}

        {isApproachingDeadline && !isOverdue && (
          <Alert className="border-amber-200 bg-white">
            <Clock className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-sm text-amber-700 ml-2">
              <strong>即将到期</strong>
              <p className="text-xs mt-1">
                距离存放期限还有 {daysUntilDeadline} 天，请尽快处理发货
              </p>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}