import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { Package, Truck, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale, useTranslation } from '@/lib/LocaleContext';
import { useNavigate } from 'react-router-dom';
import { toast } from "sonner";

export default function Login() {
	const { t } = useTranslation();
	const { locale } = useLocale();
  const navigate = useNavigate()
  const { tenant } = useTenantBranding();
  const [phoneEmail, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [phoneError, setPhoneError] = useState(false);
  const [codeError, setCodeError] = useState(false);

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
    // 如果已登录，直接跳转首页
    const token = localStorage.getItem('token');

    if(token) {
        navigate(`/${locale}/home`)
    }
  }, [navigate]);

  const handleLogin = () => {
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

    base44.functions.invoke('user/preference/loginOrRegister', {'username': phoneEmail, 'verifyCode': code});

  };

  const handleSendCode = () => {
    
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

    if(isEmail) {
      base44.functions.invoke('email/sendVerify', {'username': phoneEmail});
      toast.success(t(message, locale));
    }
    
    setCountdown(30);
  };

  const features = [
    { icon: Package, title: t("日本代购"), desc: t("一站式采购，安心托付") },
    { icon: Truck, title: t("国际物流"), desc: t("拼邮发货，节省运费") },
    { icon: Shield, title: t("安全可靠"), desc: t("实时状态，全程透明") },
  ];

  return (
     <div className="min-h-[80vh] flex flex-col items-center justify-center py-12 px-4">
        
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
        {/* Login Button */}
        <Button
          className="w-full bg-red-600 hover:bg-red-700 text-white h-10"
          onClick={handleLogin}
        >
          {t("登录 / 注册")}
        </Button>
        {/* <p className="text-center text-xs text-red-500 h-5">{error?error: ''}</p> */}
        {tenant?.contact_info && (
          <p className="text-center text-xs text-gray-400">{tenant.contact_info}</p>
        )}
        
      </div>
    </div>
  );
}