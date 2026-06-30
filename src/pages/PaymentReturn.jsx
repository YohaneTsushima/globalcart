import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PaymentReturn() {
  const navigate = useNavigate();
  const { locale } = useParams();
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outTradeNo = params.get("out_trade_no");
    const tradeStatus = params.get("trade_status");

    // 通知 opener（PaymentModal/MyOrders）刷新
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage({ type: "alipay_payment_done", tradeNo: outTradeNo }, "*");
      } catch (_) {}
    }

    // 确认支付状态
    if (tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED") {
      setStatus("success");
      setMessage("支付成功");
    } else if (tradeStatus) {
      setStatus("fail");
      setMessage("支付未完成");
    } else {
      if (outTradeNo) {
        base44.functions.invoke("alipay/query", { outTradeNo })
          .then((r) => {
            const message = r.data || {};
            if (message === "TRADE_SUCCESS" || message === "TRADE_FINISHED") {
              setStatus("success");
              setMessage("支付成功");
            } else {
              setStatus("fail");
              setMessage("支付未完成");
            }
          })
          .catch(() => {
            setStatus("fail");
            setMessage("查询失败，请稍后查看订单状态");
          });
      } else {
        setStatus("fail");
        setMessage("缺少订单信息");
      }
    }
  }, []);

  const handleGo = (target) => {
    const url = target === "home"
      ? `/${locale}/home`
      : createPageUrl("MyOrders");

    // 通知 opener 跳转
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage({ type: "alipay_payment_navigate", url }, "*");
      } catch (_) {}
      // 稍等让 opener 处理消息，再关闭自己
      setTimeout(() => window.close(), 500);
    } else {
      // 没有 opener（用户直接访问），自己跳转
      navigate(url);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-sm p-8 text-center max-w-sm w-full space-y-4">
        {status === "loading" && (
          <>
            <Loader2 className="w-12 h-12 text-blue-500 mx-auto animate-spin" />
            <p className="text-gray-600">处理中...</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
            <p className="text-lg font-semibold text-gray-900">{message}</p>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => handleGo("home")}>
                返回首页
              </Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => handleGo("orders")}>
                返回订单页面
              </Button>
            </div>
          </>
        )}
        {status === "fail" && (
          <>
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <p className="text-lg font-semibold text-gray-900">{message}</p>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => handleGo("home")}>
                返回首页
              </Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => handleGo("orders")}>
                返回订单页面
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
