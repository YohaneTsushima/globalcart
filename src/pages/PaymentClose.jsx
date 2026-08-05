import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { createPageUrl } from "@/utils";

export default function PaymentClose() {
  const navigate = useNavigate();
  const { locale } = useParams();
  const [message, setMessage] = useState('支付完成，窗口即将关闭...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from');

    if (from === 'payment') {
      // 从 Payment 页面来，跳转到 MyOrders
      setMessage('支付完成，即将跳转到订单页面...');
      const timer = setTimeout(() => {
        navigate(createPageUrl('MyOrders'));
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      // 从 PaymentModal 来，通知 opener 刷新
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage({ type: "alipay_payment_done" }, "*");
        } catch (_) {}
      }
      const timer = setTimeout(() => {
        window.close();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}
