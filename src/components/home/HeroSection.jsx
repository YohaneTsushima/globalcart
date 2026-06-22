import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ShoppingBag, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useNavigate } from 'react-router-dom';
import { useLocale, useTranslation } from '@/lib/LocaleContext';
import { useState, useEffect } from "react";

// 默认配置
export const DEFAULT_HERO = {
  title: "",
  subtitle: "",
  badgeText: "日本 → 全球",
  bgMode: "white",       // "white" | "color" | "image"
  bgColor: "#ffffff",
  bgOpacity: 100,        // 0-100
  bgImageUrl: "",
  blurAmount: 0,         // 0-20 px
  brightness: 100,       // 50-150 %
  overlayOpacity: 0,     // 0-80 %
  overlayColor: "#000000",
  buttons: [
    { id: "submit", label: "提交购买需求", page: "SubmitOrder", variant: "primary", color: "#dc2626", icon: "ShoppingBag", loggedInOnly: true },
    { id: "orders", label: "查看我的订单", page: "MyOrders", variant: "outline", color: "", icon: "", loggedInOnly: true },
    { id: "login", label: "登录开始代购", page: "", variant: "primary", color: "#dc2626", icon: "", loggedInOnly: false, guestOnly: true },
  ],
};

// 根据用户身份从多受众配置中选出对应的 hero 配置
function resolveAudienceConfig(config, user) {
  if (!config) return null;
  // 新版多受众结构：只要有 guest/user/admin 任意一个 key 就视为新版
  if ("guest" in config || "user" in config || "admin" in config) {
    // 统一模式：所有人看同一套
    if (config.unified) return config.guest || {};
    const isAdmin = user?.role === "admin" || user?.role === "tenant_admin" || user?.role === "platform_admin" || user?.role === "staff";
    if (isAdmin && config.admin) return config.admin;
    if (user && config.user) return config.user;
    return config.guest || {};
  }
  // 旧版单一配置
  return config;
}

export default function HeroSection({ config, user, tenant, rateOverlay = null, ratePosition = "hero_right" }) {
  const { t } = useTranslation();
  const { locale } = useLocale();

  DEFAULT_HERO.badgeText = t(DEFAULT_HERO.badgeText);

  DEFAULT_HERO.badgeText = t(DEFAULT_HERO.badgeText);
  const c = { ...DEFAULT_HERO, ...resolveAudienceConfig(config, user) };
  

  const buttons = (c.buttons || []).filter(b => {
    if (b.loggedInOnly && !user) return false;
    if (b.guestOnly && user) return false;
    return true;
  });

  // Background style
  let bgStyle = {};
  if (c.bgMode === "color") {
    // Safe hex→rgba: supports 3-digit and 6-digit hex
    let hex = (c.bgColor || "#ffffff").replace("#", "");
    if (hex.length === 3) hex = hex.split("").map(h => h + h).join("");
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    bgStyle.backgroundColor = `rgba(${r},${g},${b},${(c.bgOpacity ?? 100) / 100})`;
  }

  const hasImageBg = c.bgMode === "image" && c.bgImageUrl;
  // Always apply brightness filter (even at 100% so scale(1.05) blur-edge correction works consistently)
  const blurPx = hasImageBg ? (c.blurAmount ?? 0) : 0;
  const brt = hasImageBg ? (c.brightness ?? 100) : 100;
  const combinedFilter = hasImageBg ? `blur(${blurPx}px) brightness(${brt}%)` : undefined;

  const overlayStyle = hasImageBg && (c.overlayOpacity ?? 0) > 0 ? {
    position: "absolute", inset: 0,
    backgroundColor: c.overlayColor || "#000000",
    opacity: (c.overlayOpacity || 0) / 100,
    pointerEvents: "none",
    zIndex: 1,
  } : null;

  // Text color: auto-contrast — use white text on dark/image backgrounds
  const textOnImage = hasImageBg;
  const textOnDarkColor = c.bgMode === "color" && c.bgColor && c.bgColor !== "#ffffff";
  const useWhiteText = textOnImage || textOnDarkColor;

  const navigate = useNavigate();

  return (
    <div
      className="relative border border-gray-200 rounded-xl p-8 text-center overflow-hidden"
      style={bgStyle}
    >
      {/* BG image filters layer */}
      {hasImageBg && (
        <div
          className="absolute inset-0 rounded-xl"
          style={{
            backgroundImage: `url(${c.bgImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: combinedFilter,
            // Scale slightly to avoid white blur edges
            transform: blurPx > 0 ? "scale(1.06)" : undefined,
            zIndex: 0,
          }}
        />
      )}
      {/* Overlay */}
      {overlayStyle && <div style={overlayStyle} />}

      {/* Rate widget overlay — top-left or top-right */}
      {rateOverlay && (
        <div className={`absolute top-3 z-20 max-w-[180px] ${ratePosition === "hero_left" ? "left-3" : "right-3"}`}>
          {rateOverlay}
        </div>
      )}

      {/* Content */}
      <div className="relative z-10">
        {c.badgeText && (
          <div className="flex items-center justify-center gap-2 mb-3">
            <Globe className={`w-5 h-5 ${useWhiteText ? "text-red-300" : "text-red-600"}`} />
            <span className={`text-sm ${useWhiteText ? "text-white/80 drop-shadow" : "text-gray-500"}`}>{c.badgeText}</span>
          </div>
        )}
        <h1 className={`text-2xl font-bold mb-2 ${useWhiteText ? "text-white drop-shadow" : "text-gray-900"}`}>
          {c.title || tenant?.login_title || t("同一物流 · Tongyi Express")}
        </h1>
        <p className={`mb-6 max-w-md mx-auto text-sm ${useWhiteText ? "text-white/75 drop-shadow" : "text-gray-500"}`}>
          {c.subtitle || tenant?.login_subtitle || t("专业代购日本商品，安心付款，全程追踪，极速发货至全球各地")}
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          {buttons.map((btn, i) => {
            const isOutline = btn.variant === "outline";
            const btnStyle = !isOutline && btn.color
              ? { backgroundColor: btn.color, borderColor: btn.color, color: "#fff" }
              : {};

            if (btn.page) {
              const isExternal = btn.page.startsWith("http");
              const btnEl = (
                <Button
                  variant={isOutline ? "outline" : "default"}
                  style={btnStyle}
                  className={!isOutline && !btn.color ? "bg-red-600 hover:bg-red-700" : ""}
                >
                  {btn.icon === "ShoppingBag" && <ShoppingBag className="w-4 h-4 mr-2" />}
                  {btn.label}
                </Button>
              );
              if (isExternal) {
                return <a key={btn.id || i} href={btn.page} target="_blank" rel="noopener noreferrer">{btnEl}</a>;
              }
              return <Link key={btn.id || i} to={createPageUrl(btn.page)}>{btnEl}</Link>;
            }
            return (
              <Button
                key={btn.id || i}
                variant={isOutline ? "outline" : "default"}
                style={btnStyle}
                className={!isOutline && !btn.color ? "bg-red-600 hover:bg-red-700" : ""}
                onClick={!btn.page && !user ? () => base44.auth.redirectToLogin(locale) : undefined}
              >
                {btn.icon === "ShoppingBag" && <ShoppingBag className="w-4 h-4 mr-2" />}
                {t(btn.label)}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}