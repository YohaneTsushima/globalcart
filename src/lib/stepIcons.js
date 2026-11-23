/**
 * 主页「代购流程」卡片图标注册表。
 *
 * 管理员在 StepsSectionManager 里给每个卡片选图标，选项存在步骤的 icon 字段里；
 * 首页渲染时用 resolveStepIcon(step.icon, index) 取组件。
 * 没选时按顺序回退默认图标，兼容老配置（只有 title/desc/image_url）。
 */
import {
  Package,
  CheckCircle2,
  ShoppingBag,
  Truck,
  CreditCard,
  ClipboardList,
  Send,
  Globe,
  Plane,
  Boxes,
  Warehouse,
  Search,
  Star,
  Gift,
  Bell,
  Store,
  MessageCircle,
  HelpCircle,
  ShieldCheck,
  Clock,
  Users,
  Wallet,
  MapPin,
  Sparkles,
  Heart,
  Home,
  FileText,
  Tag,
  CircleDollarSign,
} from "lucide-react";

/** 可选图标：key 会写进 home_steps_config，不要随意改名 */
export const STEP_ICON_OPTIONS = [
  { key: "Package", label: "包裹", Icon: Package },
  { key: "ShoppingBag", label: "购物袋", Icon: ShoppingBag },
  { key: "Store", label: "店铺", Icon: Store },
  { key: "Search", label: "搜索", Icon: Search },
  { key: "ClipboardList", label: "清单", Icon: ClipboardList },
  { key: "CreditCard", label: "付款", Icon: CreditCard },
  { key: "Wallet", label: "钱包", Icon: Wallet },
  { key: "CircleDollarSign", label: "金额", Icon: CircleDollarSign },
  { key: "CheckCircle2", label: "完成", Icon: CheckCircle2 },
  { key: "ShieldCheck", label: "保障", Icon: ShieldCheck },
  { key: "Boxes", label: "集货", Icon: Boxes },
  { key: "Warehouse", label: "仓库", Icon: Warehouse },
  { key: "Truck", label: "运输", Icon: Truck },
  { key: "Plane", label: "空运", Icon: Plane },
  { key: "Send", label: "发货", Icon: Send },
  { key: "MapPin", label: "地址", Icon: MapPin },
  { key: "Globe", label: "国际", Icon: Globe },
  { key: "Clock", label: "时效", Icon: Clock },
  { key: "Bell", label: "通知", Icon: Bell },
  { key: "MessageCircle", label: "沟通", Icon: MessageCircle },
  { key: "HelpCircle", label: "帮助", Icon: HelpCircle },
  { key: "Users", label: "用户", Icon: Users },
  { key: "Gift", label: "福利", Icon: Gift },
  { key: "Star", label: "推荐", Icon: Star },
  { key: "Heart", label: "收藏", Icon: Heart },
  { key: "Home", label: "首页", Icon: Home },
  { key: "FileText", label: "单据", Icon: FileText },
  { key: "Tag", label: "价格", Icon: Tag },
  { key: "Sparkles", label: "特色", Icon: Sparkles },
];

/** 老配置没选图标时，按位置循环用的默认图标（保持原来首页的观感） */
const DEFAULT_STEP_ICONS = [Package, CheckCircle2, Package, Truck];

const STEP_ICON_MAP = Object.fromEntries(STEP_ICON_OPTIONS.map(({ key, Icon }) => [key, Icon]));

/**
 * @param {string} iconKey 管理员选择的图标 key（可能为空）
 * @param {number} index   卡片序号，用于默认回退
 */
export function resolveStepIcon(iconKey, index = 0) {
  if (iconKey && STEP_ICON_MAP[iconKey]) {
    return STEP_ICON_MAP[iconKey];
  }
  return DEFAULT_STEP_ICONS[index % DEFAULT_STEP_ICONS.length] || Package;
}
