import { useEffect, useState } from "react";
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

export default function Login() {
	const { t } = useTranslation();
	const { locale } = useLocale();
  const navigate = useNavigate()
  const [searchParams] = useSearchParams();
  const { login, loginWithToken } = useAuth();
  const { tenant } = useTenantBranding();
  const [phoneEmail, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [phoneError, setPhoneError] = useState(false);
  const [codeError, setCodeError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);

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
    // OAuth2 回调：URL 带 token + userId，调 loginWithToken 拿用户数据后跳转
    const oauthToken = searchParams.get('token');
    const oauthUserId = searchParams.get('userId');
    if (oauthToken) {
      setSubmitting(true);
      loginWithToken(oauthToken, oauthUserId).then(result => {
        setSubmitting(false);
        if (result.ok) {
          const next = searchParams.get('next');
          navigate(next ? decodeURIComponent(next) : `/${locale}/home`, { replace: true });
        } else if (result.error === 'account_suspended') {
          toast.error(t('您的账户已被停用，请联系管理员', locale));
        } else {
          toast.error(t(result.error || 'Google 登录失败', locale));
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

        {/* Google 登录 */}
        <button
          type="button"
          onClick={() => {
            if (submitting || !agreed) return;
            const next = searchParams.get('next');
            const redirect = next ? `?next=${encodeURIComponent(next)}` : '';
            window.location.href = `/oauth2/authorization/google${redirect}`;
          }}
          disabled={submitting || !agreed}
          className={`w-full flex items-center justify-center gap-2 h-10 rounded-md border transition-colors text-sm font-medium ${
            agreed ? "border-gray-300 bg-white hover:bg-gray-50 text-gray-700" : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {t("使用 Google 登录", locale)}
        </button>
        {/* <p className="text-center text-xs text-red-500 h-5">{error?error: ''}</p> */}
        {tenant?.contact_info && (
          <p className="text-center text-xs text-gray-400">{tenant.contact_info}</p>
        )}
        
      </div>
    </div>
  );
}