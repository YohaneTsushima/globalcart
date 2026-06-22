import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { t, getLocale } from '@/lib/i18n';

const LocaleContext = createContext(null);

export const SUPPORTED_LOCALES = [
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'zhcn', label: '简体中文', flag: '🇨🇳' },
  { code: 'zhtw', label: '繁體中文', flag: '🇹🇼' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'ms', label: 'Bahasa Melayu', flag: '🇲🇾' },
];

export const DEFAULT_LOCALE = 'ja';

export function isValidLocale(code) {
  return SUPPORTED_LOCALES.some(loc => loc.code === code);
}

export function getPreferredLocale() {
  const saved = localStorage.getItem('preferred_locale');
  return saved && isValidLocale(saved) ? saved : DEFAULT_LOCALE;
}

export function LocaleProvider({ children }) {
  const [currentLocale, setCurrentLocale] = useState(DEFAULT_LOCALE);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const pathParts = location.pathname.split('/').filter(Boolean);
    const localeFromPath = pathParts[0];
    
    if (SUPPORTED_LOCALES.some(loc => loc.code === localeFromPath)) {
      setCurrentLocale(localeFromPath);
      localStorage.setItem('preferred_locale', localeFromPath);
    } else {
      const saved = localStorage.getItem('preferred_locale') || DEFAULT_LOCALE;
      setCurrentLocale(saved);
    }
  }, [location.pathname]);

  // 同步 <html lang> 属性（利于 SEO 与无障碍）
  useEffect(() => {
    const langMap = { zhcn: 'zh-CN', zhtw: 'zh-TW' };
    document.documentElement.lang = langMap[currentLocale] || currentLocale;
  }, [currentLocale]);

  const changeLocale = useCallback((localeCode) => {
    if (!SUPPORTED_LOCALES.some(loc => loc.code === localeCode)) {
      localeCode = DEFAULT_LOCALE;
    }
    
    const pathParts = location.pathname.split('/').filter(Boolean);
    const localeFromPath = pathParts[0];
    
    let newPath;
    if (SUPPORTED_LOCALES.some(loc => loc.code === localeFromPath)) {
      newPath = location.pathname.replace(`/${localeFromPath}`, `/${localeCode}`);
    } else {
      newPath = `/${localeCode}${location.pathname}`;
    }
    
    localStorage.setItem('preferred_locale', localeCode);
    navigate(`${newPath}${location.search}${location.hash}`);
  }, [location.pathname, location.search, location.hash, navigate]);

  const value = {
    locale: currentLocale,
    changeLocale,
    locales: SUPPORTED_LOCALES,
  };

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}

export function useTranslation() {
  const { locale } = useContext(LocaleContext);
  return { t: (key) => t(key, locale), locale };
}