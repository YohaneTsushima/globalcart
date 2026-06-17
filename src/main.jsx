import React from 'react'
import ReactDOM from 'react-dom/client'
// import App from '@/App.jsx'
// import '@/index.css'
// import { initTheme } from '@/lib/theme'
import './index.css'
import App from './App.jsx'
import {initTheme} from './lib/theme'

// Strip Alipay return params BEFORE app-params.js reads the URL and caches from_url.
// Without this, the Alipay callback params pollute localStorage and can interfere with token resolution.
(function stripAlipayReturnParams() {
  try {
    const params = new URLSearchParams(window.location.search);
    const alipayKeys = ['out_trade_no', 'trade_no', 'total_amount', 'seller_id', 'app_id',
      'trade_status', 'sign', 'sign_type', 'charset', 'timestamp', 'method', 'version',
      'auth_app_id', 'fund_bill_list', 'gmt_create', 'gmt_payment', 'buyer_logon_id',
      'buyer_pay_amount', 'buyer_id', 'invoice_amount', 'point_amount', 'receipt_amount',
      'seller_email', 'subject', 'body'];
    let cleaned = false;
    alipayKeys.forEach(k => { if (params.has(k)) { params.delete(k); cleaned = true; } });
    if (cleaned) {
      const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '') + window.location.hash;
      window.history.replaceState({}, document.title, newUrl);
    }
  } catch (_) {}
})();

initTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)