import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { Package, Truck, Shield, Eye, EyeOff } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocale, useTranslation } from '@/lib/LocaleContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { createPageUrl } from "@/utils";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import googleIcon from "@/assets/icons/google.svg";
import alipayIcon from "@/assets/icons/alipay.svg";
import { tenantEntity } from "@/lib/tenantApi";

export default function Login() {
	const { t } = useTranslation();
	const { locale } = useLocale();
  const navigate = useNavigate()
  const [searchParams] = useSearchParams();
  const { loginWithOAuth, isAuthenticated, isLoadingAuth } = useAuth();
  const { tenant } = useTenantBranding();

  // 登录 Tab
  const [contactInfo, setContactInfo] = useState("");
  const [contactInfoError, setContactInfoError] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginPasswordError, setLoginPasswordError] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 注册 Tab
  const [regEmail, setRegEmail] = useState("");
  const [regDisplayName, setRegDisplayName] = useState("");
  const [regContactInfo, setRegContactInfo] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);
  const [regErrors, setRegErrors] = useState({});
  const [regSubmitting, setRegSubmitting] = useState(false);

  // Tab / 协议
  const [activeTab, setActiveTab] = useState("login");
  const [agreed, setAgreed] = useState(false);
  const [showAgreedDialog, setShowAgreedDialog] = useState(false);
  const [pendingLoginType, setPendingLoginType] = useState(null);

  useEffect(() => {
    const result = searchParams.get('success');
    const classic = searchParams.get('classic');

    if (result && result === 'true') {
      setSubmitting(true);
      loginWithOAuth().then(result => {
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

    if (classic && classic === 'true') {
      setSubmitting(true);
      // 传统登录回调，后端已设置 cookie，直接跳转
      // const next = searchParams.get('next');
      // navigate(next ? decodeURIComponent(next) : `/${locale}/home`, { replace: true });
      loginWithOAuth().then(result => {
        setSubmitting(false);
        if (result.ok) {
          console.log(searchParams)
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

    const oauthError = searchParams.get('error');
    const oauthMessage = searchParams.get('message');
    if (oauthError) {
      toast.error(t(oauthMessage || '支付宝登录失败，请重试', locale));
      const next = searchParams.get('next');
      const cleanParams = new URLSearchParams();
      if (next) cleanParams.set('next', next);
      const cleanUrl = `/${locale}/Login${cleanParams.toString() ? '?' + cleanParams.toString() : ''}`;
      window.history.replaceState({}, '', cleanUrl);
      return;
    }

    if(!isLoadingAuth && isAuthenticated) {
        const next = searchParams.get('next');
        navigate(next ? decodeURIComponent(next) : `/${locale}/home`, { replace: true });
    }
  }, [navigate, searchParams, locale, isAuthenticated, isLoadingAuth]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Enter') return;
      if (showAgreedDialog) return;
      if (submitting || regSubmitting) return;

      e.preventDefault();
      if (activeTab === 'login') {
        handlePasswordLogin();
      } else {
        handleRegister();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, agreed, submitting, regSubmitting, showAgreedDialog]);

  const getRedirect = () => {
    const next = searchParams.get('next');
    const params = new URLSearchParams();
    params.set('tenant', tenant?.id || 'tongyi');
    if (next) params.set('next', next);
    return `?${params.toString()}`;
  };

  const performPasswordLogin = async () => {
    setContactInfoError(false);
    setLoginPasswordError(false);
    const isPhone = /^\d{11}$/.test(contactInfo.trim());
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactInfo.trim());
    if (!isPhone && !isEmail) {
      setContactInfoError(true);
      toast.error(t('请输入正确的手机号或邮箱格式', locale));
      return;
    }
    
    if (!loginPassword.trim()) {
      setLoginPasswordError(true);
      toast.error(t('请输入密码', locale));
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    
    try {
      
      let requestUrl = '/globalcart/user/stats/login';
      let next = searchParams.get('next');
      if(next) {
        requestUrl += '?next=' + next;
      }

      const res = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          data: { contact_info: contactInfo.trim(), password: loginPassword }
        }),
      });
      const data = await res.json();
      if (data.ok) {
        // 登录成功，后端已设置 cookie，跳转到 classic 页面
        window.location.href = data.redirect;
      } else {
        toast.error(t(data.message || '登录失败，请重试', locale));
        setSubmitting(false);
      }
    } catch (err) {
      toast.error(t('登录失败，请重试', locale));
      setSubmitting(false);
    }
  };

  const handlePasswordLogin = async () => {
    if (!agreed) {
      setPendingLoginType('password_login');
      setShowAgreedDialog(true);
      return;
    }
    await performPasswordLogin();
  };

  const performRegister = async () => {
    const errors = {};
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim());
    if (!regEmail.trim() || !isEmail) {
      errors.email = true;
    }
    if (!regDisplayName.trim()) {
      errors.displayName = true;
    }
    if (!regContactInfo.trim()) {
      errors.contactInfo = true;
    }
    if (!regPassword.trim() || regPassword.length < 6) {
      errors.password = true;
    }
    if (regPassword !== regConfirmPassword) {
      errors.passwordMismatch = true;
      toast.error(t('两次输入的密码不一致', locale));
    }
    if (Object.keys(errors).length > 0) {
      setRegErrors(errors);
      return;
    }
    if (regSubmitting) return;
    setRegSubmitting(true);
    try {
      await tenantEntity.register('UserProfile', {
        user_email: regEmail.trim(),
        display_name: regDisplayName.trim(),
        contact_info: regContactInfo.trim(),
        password: regPassword,
      });
      toast.success(t('注册成功，请登录', locale));
      setActiveTab("login");
      setContactInfo(regEmail.trim());
      setRegEmail("");
      setRegDisplayName("");
      setRegContactInfo("");
      setRegPassword("");
      setRegConfirmPassword("");
      setRegErrors({});
    } catch (err) {
      console.error('register failed:', err);
      toast.error(t(err?.response?.data?.message || err?.message || '注册失败，请稍后重试', locale));
    } finally {
      setRegSubmitting(false);
    }
  };

  const handleRegister = async () => {
    if (!agreed) {
      setPendingLoginType('register');
      setShowAgreedDialog(true);
      return;
    }
    await performRegister();
  };

  const handleConfirmAgreement = async () => {
    setAgreed(true);
    setShowAgreedDialog(false);

    const redirect = getRedirect();
    switch (pendingLoginType) {
      case 'password_login':
        await performPasswordLogin();
        break;
      case 'register':
        await performRegister();
        break;
      case 'google':
        window.location.href = `/oauth2/authorization/google${redirect}`;
        break;
      case 'alipay':
        base44.auth.alipayLogin(redirect);
        break;
    }
    setPendingLoginType(null);
  };

  const features = [
    { icon: Package, title: t("日本代购"), desc: t("一站式采购，安心托付") },
    { icon: Truck, title: t("国际物流"), desc: t("拼邮发货，节省运费") },
    { icon: Shield, title: t("安全可靠"), desc: t("实时状态，全程透明") },
  ];

  return (
     <div className="min-h-[80vh] flex flex-col items-center justify-center py-12 px-4 relative">

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

      {/* Tabs: 登录 / 新用户注册 */}
      <div className="w-full max-w-xs space-y-3 relative">
        {/* 表单遮盖层 — 登录或注册中 */}
        {(submitting || regSubmitting) && (
          <div className="absolute inset-0 z-50 bg-white/70 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-4 border-red-200 border-t-red-600 rounded-full animate-spin"></div>
            <span className="text-sm text-gray-600 font-medium">
              {submitting ? t("登录中，请稍候...", locale) : t("注册中，请稍候...", locale)}
            </span>
          </div>
        )}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="login">{t("登录", locale)}</TabsTrigger>
            <TabsTrigger value="register">{t("新用户注册", locale)}</TabsTrigger>
          </TabsList>

          {/* Tab 1: 登录 */}
          <TabsContent value="login" className="space-y-3">
            <Input
              placeholder={contactInfoError ? t("请输入手机号或邮箱", locale) : t("手机号或邮箱", locale)}
              value={contactInfo}
              onChange={e => { setContactInfo(e.target.value); setContactInfoError(false); }}
              className={contactInfoError ? "border-red-500 placeholder:text-red-400 focus-visible:ring-red-300" : ""}
            />
            <div className="relative">
              <Input
                type={showLoginPassword ? "text" : "password"}
                placeholder={loginPasswordError ? t("请输入密码", locale) : t("密码", locale)}
                value={loginPassword}
                onChange={e => { setLoginPassword(e.target.value); setLoginPasswordError(false); }}
                className={loginPasswordError ? "border-red-500 placeholder:text-red-400 focus-visible:ring-red-300 pr-10" : "pr-10"}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowLoginPassword(!showLoginPassword)}
              >
                {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex justify-end">
              <a href={createPageUrl("ForgotPassword")} className="text-xs text-red-600 hover:underline">
                {t("忘记密码", locale)}
              </a>
            </div>
            <Button
              className="w-full bg-red-600 hover:bg-red-700 text-white h-10"
              onClick={handlePasswordLogin}
              disabled={submitting}
            >
              {submitting ? t("登录中...", locale) : t("登录")}
            </Button>
          </TabsContent>

          {/* Tab 2: 新用户注册 */}
          <TabsContent value="register" className="space-y-3">
            <Input
              placeholder={regErrors.email ? t("请输入有效邮箱", locale) : t("邮箱", locale)}
              value={regEmail}
              onChange={e => { setRegEmail(e.target.value); setRegErrors(prev => ({ ...prev, email: false })); }}
              className={regErrors.email ? "border-red-500 placeholder:text-red-400 focus-visible:ring-red-300" : ""}
            />
            <Input
              placeholder={regErrors.displayName ? t("请输入昵称", locale) : t("昵称", locale)}
              value={regDisplayName}
              onChange={e => { setRegDisplayName(e.target.value); setRegErrors(prev => ({ ...prev, displayName: false })); }}
              className={regErrors.displayName ? "border-red-500 placeholder:text-red-400 focus-visible:ring-red-300" : ""}
            />
            <Input
              placeholder={regErrors.contactInfo ? t("请输入手机号", locale) : t("手机号", locale)}
              value={regContactInfo}
              onChange={e => { setRegContactInfo(e.target.value); setRegErrors(prev => ({ ...prev, contactInfo: false })); }}
              className={regErrors.contactInfo ? "border-red-500 placeholder:text-red-400 focus-visible:ring-red-300" : ""}
            />
            <div className="relative">
              <Input
                type={showRegPassword ? "text" : "password"}
                placeholder={regErrors.password ? t("密码至少6位", locale) : t("密码", locale)}
                value={regPassword}
                onChange={e => { setRegPassword(e.target.value); setRegErrors(prev => ({ ...prev, password: false, passwordMismatch: false })); }}
                className={regErrors.password ? "border-red-500 placeholder:text-red-400 focus-visible:ring-red-300 pr-10" : "pr-10"}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowRegPassword(!showRegPassword)}
              >
                {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="relative">
              <Input
                type={showRegConfirm ? "text" : "password"}
                placeholder={regErrors.passwordMismatch ? t("两次密码不一致", locale) : t("确认密码", locale)}
                value={regConfirmPassword}
                onChange={e => { setRegConfirmPassword(e.target.value); setRegErrors(prev => ({ ...prev, passwordMismatch: false })); }}
                className={regErrors.passwordMismatch ? "border-red-500 placeholder:text-red-400 focus-visible:ring-red-300 pr-10" : "pr-10"}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowRegConfirm(!showRegConfirm)}
              >
                {showRegConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button
              className="w-full bg-red-600 hover:bg-red-700 text-white h-10"
              onClick={handleRegister}
              disabled={regSubmitting}
            >
              {regSubmitting ? t("注册中...", locale) : t("注册")}
            </Button>
          </TabsContent>
        </Tabs>

        {/* 登录协议 - 共享 */}
        <div className="flex items-start gap-2 py-1">
          <Checkbox
            id="agree-terms"
            checked={agreed}
            onCheckedChange={setAgreed}
            className="mt-0.5"
          />
          <label htmlFor="agree-terms" className="text-xs text-gray-500 leading-relaxed cursor-pointer">
            {t("我已阅读并同意", locale)}
            <a href={createPageUrl("TermsOfService")} target="_blank" className="text-red-600 hover:underline">{t("《用户协议》", locale)}</a>
            {t("和", locale)}
            <a href={createPageUrl("PrivacyPolicy")} target="_blank" className="text-red-600 hover:underline">{t("《隐私政策》", locale)}</a>
          </label>
        </div>

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
              if (submitting) return;
              if (!agreed) {
                setPendingLoginType('google');
                setShowAgreedDialog(true);
                return;
              }
              const redirect = getRedirect();
              window.location.href = `/oauth2/authorization/google${redirect}`;
            }}
            disabled={submitting}
            className="w-12 h-12 rounded-xl flex items-center justify-center transition-all bg-white border border-gray-200 hover:bg-gray-50 hover:shadow-md"
            title="Google"
          >
            <img src={googleIcon} alt="Google" className="w-6 h-6" />
          </button>

          {/* 支付宝 */}
          <button
            type="button"
            onClick={() => {
              if (submitting) return;
              if (!agreed) {
                setPendingLoginType('alipay');
                setShowAgreedDialog(true);
                return;
              }
              const redirect = getRedirect();
              base44.auth.alipayLogin(redirect);
            }}
            disabled={submitting}
            className="w-12 h-12 rounded-xl flex items-center justify-center transition-all bg-white border border-gray-200 hover:bg-gray-50 hover:shadow-md"
            title="支付宝"
          >
            <img src={alipayIcon} alt="支付宝" className="w-6 h-6" />
          </button>
        </div>

        {tenant?.contact_info && (
          <p className="text-center text-xs text-gray-400">{tenant.contact_info}</p>
        )}
      </div>

      <ConfirmDialog
        open={showAgreedDialog}
        onOpenChange={setShowAgreedDialog}
        title="登录协议确认"
        description={
          <span>
            登录即表示同意
            <a href={createPageUrl("TermsOfService")} target="_blank" className="text-red-600 hover:underline">《用户协议》</a>
            和
            <a href={createPageUrl("PrivacyPolicy")} target="_blank" className="text-red-600 hover:underline">《隐私政策》</a>
          </span>
        }
        confirmText="同意并登录"
        cancelText="取消"
        onConfirm={handleConfirmAgreement}
      />
    </div>
  );
}
