/**
 * 导航注册表：定义所有可用的导航入口（key → 默认文字/图标/页面）。
 * 租户可通过 NavbarSettings 配置树（显示/隐藏、改名、排序、最多三层嵌套）。
 */
import {
  Home, ShoppingBag, UserPlus, Package, Send, User,
  BarChart3, Layers, Users, Settings, Bell, Zap, FileText, Navigation, Crown, HelpCircle, MessageCircleQuestion, CheckSquare, TrendingUp, Ticket,
} from "lucide-react";
import { t } from "@/lib/i18n";

export const NAV_REGISTRY = {
  user: {
    Home: { label: "首页", icon: Home, page: "Home" },
    SubmitOrder: { label: "提交需求", icon: ShoppingBag, page: "SubmitOrder" },
    SubmitOrderPlain: { label: "普通下单", icon: ShoppingBag, page: "SubmitOrder" },
    SubmitTicketOrder: { label: "票务需求", icon: Ticket, page: "SubmitTicketOrder" },
    GroupBuy: { label: "拼下单", icon: UserPlus, page: "GroupBuy" },
    MyOrders: { label: "我的订单", icon: Package, page: "MyOrders" },
    MyOrdersTicket: { label: "我的票务需求", icon: Ticket, page: "MyOrders?tab=ticket" },
    ShippingPool: { label: "发货 & 拼邮", icon: Send, page: "ShippingPool" },
    Profile: { label: "个人档案", icon: User, page: "AdminUserDetail/me" },
    MemberTiers: { label: "会员阶级", icon: Crown, page: "MemberTiers" },
    HelpCenter: { label: "帮助中心", icon: HelpCircle, page: "helpcenter", activePage: "HelpCenter" },
    HelpCenterFaq: { label: "常见问题", icon: MessageCircleQuestion, page: "helpcenter/faq", activePage: "HelpCenterFaq" },
    UserTodo: { label: "我的待办", icon: CheckSquare, page: "UserTodo" },
    ExchangeRate: { label: "实时汇率", icon: TrendingUp, page: "", isRateWidget: true },
  },
  admin: {
    // 管理员功能入口
    AdminDashboard: { label: "管理总览", icon: BarChart3, page: "AdminDashboard" },
    AdminOrders: { label: "订单管理", icon: Package, page: "AdminOrders" },
    AdminOrdersTicket: { label: "票务订单", icon: Ticket, page: "AdminOrders?tab=ticket" },
    ShippingPool: { label: "发货池", icon: Send, page: "ShippingPool" },
    AdminTransitWork: { label: "中转地工作面板", icon: Layers, page: "AdminTransitWork" },
    AdminUsers: { label: "用户管理", icon: Users, page: "AdminUsers" },
    AdminSettings: { label: "网站设置", icon: Settings, page: "AdminSettings" },
    AdminAnnouncements: { label: "公告管理", icon: Bell, page: "AdminAnnouncements" },
    AdminFeeRules: { label: "服务费规则", icon: Zap, page: "AdminFeeRules" },
    AdminReports: { label: "财务报表", icon: BarChart3, page: "AdminReports" },
    AdminNotificationTemplates: { label: "通知模板", icon: FileText, page: "AdminNotificationTemplates" },
    AdminNotificationDefaults: { label: "通知默认设置", icon: Settings, page: "AdminNotificationDefaults" },
    AdminNavbarSettings: { label: "导航栏设置", icon: Navigation, page: "AdminNavbarSettings" },
    AdminSettingsHome: { label: "网站设置", icon: Settings, page: "AdminSettings" },
    ExchangeRate: { label: "实时汇率", icon: TrendingUp, page: "", isRateWidget: true },
    // 用户入口（可由管理员配置显示在管理员导航中）
    UserHome: { label: "首页（用户）", icon: Home, page: "Home" },
    UserSubmitOrder: { label: "提交需求", icon: ShoppingBag, page: "SubmitOrder" },
    UserSubmitOrderPlain: { label: "普通下单", icon: ShoppingBag, page: "SubmitOrder" },
    UserSubmitTicketOrder: { label: "票务需求", icon: Ticket, page: "SubmitTicketOrder" },
    UserGroupBuy: { label: "拼下单", icon: UserPlus, page: "GroupBuy" },
    UserMyOrders: { label: "我的订单（用户）", icon: Package, page: "MyOrders" },
    UserMyOrdersTicket: { label: "我的票务需求（用户）", icon: Ticket, page: "MyOrders?tab=ticket" },
    UserShippingPool: { label: "发货 & 拼邮（用户）", icon: Send, page: "ShippingPool" },
    UserProfile: { label: "个人档案（用户）", icon: User, page: "AdminUserDetail/me" },
    UserHelpCenter: { label: "帮助中心", icon: HelpCircle, page: "helpcenter", activePage: "HelpCenter" },
    UserTodoAdmin: { label: "我的待办（用户）", icon: CheckSquare, page: "UserTodo" },
  },
};

export const DEFAULT_NAV_TREES = {
  user: [
    { key: "Home" },
    { key: "ExchangeRate", hidden: true },
    { key: "UserTodo" },
    { key: "SubmitOrder", children: [{ key: "SubmitOrderPlain" }, { key: "SubmitTicketOrder" }, { key: "GroupBuy" }] },
    { key: "MyOrders", children: [{ key: "MyOrdersTicket" }] },
    { key: "ShippingPool", children: [{key: ''}] },
    { key: "Profile", children: [{ key: "MemberTiers" }] },
    { key: "HelpCenter", hidden: true, children: [{ key: "HelpCenterFaq" }] },
  ],
  admin: [
    { key: "ExchangeRate", hidden: true },
    { key: "AdminDashboard" },
    { key: "AdminOrders", children: [{ key: "AdminOrdersTicket" }] },
    { key: "ShippingPool", children: [{ key: "AdminTransitWork" }] },
    { key: "AdminUsers" },
    { key: "AdminSettings", children: [
      { key: "AdminAnnouncements" },
      { key: "AdminFeeRules" },
      { key: "AdminReports" },
      { key: "AdminNotificationTemplates" },
      { key: "AdminNotificationDefaults" },
      { key: "AdminNavbarSettings" },
      { key: "AdminSettingsHome" },
    ]},
    // 用户入口（默认隐藏，管理员可按需开启）
    { key: "UserHome", hidden: true },
    { key: "UserSubmitOrder", hidden: true, children: [{ key: "UserSubmitOrderPlain" }, { key: "UserSubmitTicketOrder" }, { key: "UserGroupBuy" }] },
    { key: "UserMyOrders", hidden: true, children: [{ key: "UserMyOrdersTicket" }] },
    { key: "UserShippingPool", hidden: true },
    { key: "UserProfile", hidden: true },
    { key: "UserHelpCenter", hidden: true },
    { key: "UserTodoAdmin", hidden: true },
  ],
};

function collectKeys(nodes, set = new Set()) {
  if (!Array.isArray(nodes)) return set;
  for (const n of nodes || []) {
    if (!n || typeof n.key !== 'string') continue;
    set.add(n.key);
    collectKeys(n.children, set);
  }
  return set;
}

/**
 * 合并已保存的配置树与默认树：配置中缺少的注册项（如后续新增的功能入口）追加到根级末尾。
 */
export function mergeNavTree(configTree, group) {
  if (!Array.isArray(configTree) || !configTree.length) {
    return JSON.parse(JSON.stringify(DEFAULT_NAV_TREES[group]));
  }
  const merged = JSON.parse(JSON.stringify(configTree));
  const present = collectKeys(merged);

  const findNode = (nodes, key) => {
    for (const n of nodes || []) {
      if (n.key === key) return n;
      const f = findNode(n.children, key);
      if (f) return f;
    }
    return null;
  };

  // 缺失的注册项按默认树的位置插入：父级已存在则挂到父级子节点末尾，否则追加到根级
  const addMissing = (defNodes, defParentKey) => {
    for (const n of defNodes) {
      if (!present.has(n.key)) {
        const newNode = {
          key: n.key,
          children: (n.children || []).filter(c => !present.has(c.key)).map(c => ({ key: c.key })),
        };
        newNode.children.forEach(c => present.add(c.key));
        present.add(n.key);
        const parent = defParentKey ? findNode(merged, defParentKey) : null;
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(newNode);
        } else {
          merged.push(newNode);
        }
      } else if (n.children) {
        addMissing(n.children, n.key);
      }
    }
  };
  addMissing(DEFAULT_NAV_TREES[group], null);
  return merged;
}

/**
 * 把配置树构建成可渲染的导航项（过滤隐藏项与无权限项，应用文字覆盖）。
 */
export function buildNav(tree, group, { access = {}, labelOverrides = {}, locale = 'zh' } = {}) {
  const registry = NAV_REGISTRY[group];
  const walk = (nodes, depth = 1) => (Array.isArray(nodes) && depth <= 3 ? nodes : [])
    .filter(n => n && registry[n.key] && !n.hidden && access[n.key] !== false)
    .map(n => {
      const reg = registry[n.key];
      // 使用 t() 翻译标签，如果 label 是中文则翻译，否则直接使用
      const rawLabel = n.label || labelOverrides[n.key] || reg.label;
      const label = t(rawLabel, locale);
      return {
        key: n.key,
        label,
        icon: reg.icon,
        page: reg.page,
        activePage: reg.activePage || reg.page,
        isRateWidget: reg.isRateWidget || false,
        children: walk(n.children, depth + 1),
      };
    });
  return walk(tree);
}

export function navTreeHasPage(nodes, pageName) {
  return (nodes || []).some(n => (n.activePage || n.page) === pageName || navTreeHasPage(n.children, pageName));
}