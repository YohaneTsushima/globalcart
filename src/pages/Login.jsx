import { useEffect, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { Package, Truck, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocale, useTranslation } from '@/lib/LocaleContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { createPageUrl } from "@/utils";
import googleIcon from "@/assets/icons/google.svg";
import alipayIcon from "@/assets/icons/alipay.svg";
import wechatIcon from "@/assets/icons/wechat.svg";
import qqIcon from "@/assets/icons/qq.svg";

export default function Login() {
	const { t } = useTranslation();
	const { locale } = useLocale();
  const navigate = useNavigate()
  const [searchParams] = useSearchParams();
  const { login, loginWithOAuth } = useAuth();
  const { tenant } = useTenantBranding();
  const [phoneEmail, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [phoneError, setPhoneError] = useState(false);
  const [codeError, setCodeError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const popupRef = useRef(null);
  const messageHandlerRef = useRef(null);

   // 从 localStorage 恢复倒计时
  const getInitialCountdown = () => {
    const until = parseInt(localStorage.getItem("login_code_until") || "0", 10);
    const remaining = Math.ceil((until - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  };

    const [countdown, setCountdown] = useState(getInitialCountdown);

    useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown > 0]);

  useEffect(() => {
    // OAuth2 回调：URL 带 token + refreshToken + userId（Google / 支付宝等 redirect 模式通用）
    const oauthToken = searchParams.get('token');
    const oauthRefreshToken = searchParams.get('refreshToken');
    const oauthUserId = searchParams.get('userId');
    if (oauthToken) {
      setSubmitting(true);
      loginWithOAuth({ token: oauthToken, refreshToken: oauthRefreshToken, userId: oauthUserId }).then(result => {
        setSubmitting(false);
        if (result.ok) {
          const next = searchParams.get('next');
          navigate(next ? decodeURIComponent(next) : `/${locale}/home`, { replace: true });
        } else if (result.error === 'account_suspended') {
          toast.error(t('您的账户已被停用，请联系管理员', locale));
        } else {
          toast.error(t(result.error || '登录失败', locale));
        }
      });
      return;
    }

    // 如果已登录，直接跳转（尊重 next 参数）
    const token = localStorage.getItem('token');
    if(token) {
        const next = searchParams.get('next');
        navigate(next ? decodeURIComponent(next) : `/${locale}/home`, { replace: true });
    }
  }, [navigate, searchParams, locale]);

  const handleLogin = async () => {
    setPhoneError(false);
    setCodeError(false);
    const isPhone = /^\d{11}$/.test(phoneEmail.trim());
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(phoneEmail.trim());
    if (!isPhone && !isEmail) {
      setPhoneError(true);
      return;
    }
    if (!code.trim()) {
      setCodeError(true);
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await login(phoneEmail.trim(), code.trim());
      if (result.ok) {
        const next = searchParams.get('next');
        navigate(next ? decodeURIComponent(next) : `/${locale}/home`, { replace: true });
      } else if (result.error === 'account_suspended') {
        toast.error(t('您的账户已被停用，请联系管理员', locale));
      } else if (result.error === 'no_token') {
        toast.error(t('登录失败，未收到 token', locale));
      } else {
        toast.error(t(result.error || '登录失败，请检查验证码', locale));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendCode = async () => {
    
    if (countdown > 0) return;
    const isPhone = /^\d{11}$/.test(phoneEmail.trim());
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(phoneEmail.trim());
    if (!isPhone && !isEmail) {
      setPhoneError(true);
      return;
    }

    localStorage.setItem("login_code_until", String(Date.now() + 30000));
    

    let message = '验证码已发送到邮箱，请注意查收';

    if(isPhone) {
      let message = '验证码已发送到手机短信，请注意查收';
      toast.success(t('手机短信功能还没实现，请使用邮箱接收', locale));
      return;
    }

    setCountdown(30);

    if(isEmail) {
      try {
        
        await base44.functions.invoke('email/sendVerify', {'username': phoneEmail});
        toast.success(t(message, locale));
      } catch (err) {
        setCountdown(0);
        console.error('send verify failed:', err);
        toast.error(t('验证码发送失败，请稍后重试', locale));
        return;
      }
    }
    
    
  };

  const features = [
    { icon: Package, title: t("日本代购"), desc: t("一站式采购，安心托付") },
    { icon: Truck, title: t("国际物流"), desc: t("拼邮发货，节省运费") },
    { icon: Shield, title: t("安全可靠"), desc: t("实时状态，全程透明") },
  ];

  return (
     <div className="min-h-[80vh] flex flex-col items-center justify-center py-12 px-4 relative">

      {/* 登录中遮盖层 — 只盖 Login 组件，不碰全局 state */}
      {submitting && (
        <div className="absolute inset-0 z-50 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-4 border-red-200 border-t-red-600 rounded-full animate-spin"></div>
          <span className="text-sm text-gray-600 font-medium">{t("登录中，请稍候...", locale)}</span>
        </div>
      )}

      {/* Logo & Brand */}
      <div className="text-center mb-8">
        {tenant?.logo_url ? (
          <img src={tenant.logo_url} alt={tenant.branding_name} className="h-12 w-auto object-contain mx-auto mb-4" />
        ) : (
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: tenant?.theme_color || '#dc2626' }}
          >
            <span className="text-white text-lg font-bold">
              {(tenant?.branding_name || t("同一")).slice(0, 2)}
            </span>
          </div>
        )}
        <h1 className="text-2xl font-bold text-gray-900">
          {tenant?.branding_name || t("同一物流")}
        </h1>
        {tenant?.login_subtitle && (
          <p className="text-sm text-gray-500 mt-1">{tenant.login_subtitle}</p>
        )}
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-3 gap-3 mb-8 w-full max-w-sm">
        {features.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="text-center p-3 bg-white border border-gray-100 rounded-lg">
            <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center mx-auto mb-2">
              <Icon className="w-4 h-4 text-red-600" />
            </div>
            <div className="text-xs font-medium text-gray-800">{title}</div>
            <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
          </div>
        ))}
      </div>

      {/* Phone & Code Inputs */}
      <div className="w-full max-w-xs space-y-3">
        {/* 手机号 */}
        <div className="flex gap-2">
          <Input
            placeholder={phoneError ? t("请输入11位手机号或邮箱地址", locale) : t("邮箱/手机号", locale)}
            value={phoneEmail}
            onChange={e => { setPhone(e.target.value); setPhoneError(false); }}
            className={`flex-1 ${phoneError ? "border-red-500 placeholder:text-red-400 focus-visible:ring-red-300" : ""}`}
          />
          <Button
            variant="outline"
            className="shrink-0 text-red-600 border-red-200 hover:bg-red-50 text-xs w-20"
            onClick={handleSendCode}
            disabled={countdown > 0}
          >
            {countdown > 0 ? `${countdown}s` : t("发送验证码", locale)}
          </Button>
        </div>
        {/* 验证码 */}
        <Input
          placeholder={codeError ? t("请输入验证码", locale) : t("验证码", locale)}
          value={code}
          onChange={e => { setCode(e.target.value); setCodeError(false); }}
          className={codeError ? "border-red-500 placeholder:text-red-400 focus-visible:ring-red-300" : ""}
        />
        {/* 登录协议 */}
        <div className="flex items-start gap-2 py-1">
          <Checkbox
            id="agree-terms"
            checked={agreed}
            onCheckedChange={setAgreed}
            className="mt-0.5"
          />
          <label htmlFor="agree-terms" className="text-xs text-gray-500 leading-relaxed cursor-pointer">
            {t("登录即表示同意", locale)}
            <a href={createPageUrl("TermsOfService")} target="_blank" className="text-red-600 hover:underline">{t("《用户协议》", locale)}</a>
            {t("和", locale)}
            <a href={createPageUrl("PrivacyPolicy")} target="_blank" className="text-red-600 hover:underline">{t("《隐私政策》", locale)}</a>
          </label>
        </div>

        {/* Login Button */}
        <Button
          className="w-full bg-red-600 hover:bg-red-700 text-white h-10"
          onClick={handleLogin}
          disabled={submitting || !agreed}
        >
          {submitting ? t("登录中...", locale) : t("登录 / 注册")}
        </Button>

        {/* 分隔线 */}
        <div className="flex items-center gap-3 py-1">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">{t("或", locale)}</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* 第三方登录 - 圆形按钮横向排列 */}
        <div className="flex items-center justify-center gap-4">
          {/* Google */}
          <button
            type="button"
            onClick={() => {
              if (submitting || !agreed) return;
              const next = searchParams.get('next');
              const redirect = next ? `?next=${encodeURIComponent(next)}` : '';
              window.location.href = `/oauth2/authorization/google${redirect}`;
            }}
            disabled={submitting || !agreed}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
              agreed ? "bg-white border border-gray-200 hover:bg-gray-50 hover:shadow-md" : "bg-gray-50 border border-gray-200 cursor-not-allowed opacity-50"
            }`}
            title="Google"
          >
            <img src={googleIcon} alt="Google" className="w-6 h-6" />
          </button>

          {/* 支付宝 */}
          <button
            type="button"
            onClick={() => {
              if (submitting || !agreed) return;
              const next = searchParams.get('next');
              const redirect = next ? `?next=${encodeURIComponent(next)}` : '';
             
              base44.auth.alipayLogin(redirect);
            }}
            disabled={submitting || !agreed}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
              agreed ? "bg-white border border-gray-200 hover:bg-gray-50 hover:shadow-md" : "bg-gray-50 border border-gray-200 cursor-not-allowed opacity-50"
            }`}
            title="支付宝"
          >
            <img src={alipayIcon} alt="支付宝" className="w-6 h-6" />
          </button>

          {/* 微信 */}
          <button
            type="button"
            onClick={() => {
              if (submitting || !agreed) return;
              const next = searchParams.get('next');
              const redirect = next ? `?next=${encodeURIComponent(next)}` : '';
              
              window.location.href = `/oauth2/authorization/wechat${redirect}`;
            }}
            disabled={submitting || !agreed}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
              agreed ? "bg-white border border-gray-200 hover:bg-gray-50 hover:shadow-md" : "bg-gray-50 border border-gray-200 cursor-not-allowed opacity-50"
            }`}
            title="微信"
          >
            <img src={wechatIcon} alt="微信" className="w-6 h-6" />
          </button>

          {/* QQ */}
          <button
            type="button"
            onClick={() => {
              if (submitting || !agreed) return;
              const next = searchParams.get('next');
              const redirect = next ? `?next=${encodeURIComponent(next)}` : '';
              window.location.href = `/oauth2/authorization/qq${redirect}`;
            }}
            disabled={submitting || !agreed}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
              agreed ? "bg-white border border-gray-200 hover:bg-gray-50 hover:shadow-md" : "bg-gray-50 border border-gray-200 cursor-not-allowed opacity-50"
            }`}
            title="QQ"
          >
            <img src={qqIcon} alt="QQ" className="w-6 h-6" />
          </button>
        </div>

        {tenant?.contact_info && (
          <p className="text-center text-xs text-gray-400">{tenant.contact_info}</p>
        )}
        
      </div>
    </div>
  );
}