import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePermissions } from "@/hooks/usePermissions";
import { createPageUrl } from "@/utils";
import { 
  User, Package, CreditCard, MapPin, Clock, AlertTriangle, 
  TrendingUp, DollarSign, ShoppingCart, Truck, Calendar,
  FileText, Settings, Shield, CheckCircle, X, ChevronRight,
  ArrowLeft, ExternalLink, Plus, Edit2, MessageSquare, Bell, Eye, MessageCircleQuestion, Sliders
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import CustomerOrdersTab from "@/components/customer360/CustomerOrdersTab";
import CustomerFinanceTab from "@/components/customer360/CustomerFinanceTab";
import CustomerLogisticsTab from "@/components/customer360/CustomerLogisticsTab";
import CustomerNotesPanel from "@/components/customer360/CustomerNotesPanel";
import EditProfileModal from "@/components/customer360/EditProfileModal";
import ContactInfoCard from "@/components/profile/ContactInfoCard";
import PreferenceSettingsCard from "@/components/profile/PreferenceSettingsCard";
import NotificationGlobalSettingsCard from "@/components/profile/NotificationGlobalSettingsCard";
import RolePermissionsTab from "@/components/profile/RolePermissionsTab";
import PrivacySettingsTab from "@/components/profile/PrivacySettingsTab";
import CustomerOrderDetailModal from "@/components/customer360/CustomerOrderDetailModal";
import MemberTierBadge from "@/components/profile/MemberTierBadge";
import MyFaqQuestionsCard from "@/components/faq/MyFaqQuestionsCard";
import { MOCK_ADMIN_USER_DETAIL_DATA } from "@/mock/adminUserDetailMock";

const PAYMENT_METHOD_LABELS = {
  alipay: "支付宝", wechatpay: "微信支付", paypay: "PayPay", paypal: "PayPal",
  credit_card: "信用卡", bank_transfer: "银行转账", credit: "记账", other: "其他",
};

const SYSTEM_ROLE_CONFIG = {
  platform_admin: { label: "平台管理员", color: "bg-red-100 text-red-700" },
  tenant_admin: { label: "管理员", color: "bg-red-100 text-red-700" },
  admin: { label: "管理员", color: "bg-red-100 text-red-700" },
  staff: { label: "员工", color: "bg-orange-100 text-orange-700" },
  user: { label: "用户", color: "bg-gray-100 text-gray-600" },
};

// Metric Card Component
function MetricCard({ icon: Icon, label, value, subValue, color = "blue" }) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-green-50 text-green-700 border-green-200",
    red: "bg-red-50 text-red-700 border-red-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    gray: "bg-gray-50 text-gray-700 border-gray-200",
  };
  
  return (
    <Card className={`border-2 ${colorClasses[color] || colorClasses.blue}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium opacity-70">{label}</p>
            <p className="text-lg font-bold mt-1">{value}</p>
            {subValue && <p className="text-xs opacity-60 mt-0.5">{subValue}</p>}
          </div>
          {Icon && <Icon className="w-6 h-6 opacity-50" />}
        </div>
      </CardContent>
    </Card>
  );
}

// Order Status Badge
function OrderStatusBadge({ status }) {
  const statusConfig = {
    pending_confirmation: { label: "待确认", color: "bg-gray-100 text-gray-700" },
    payment_pending: { label: "待付款", color: "bg-yellow-100 text-yellow-700" },
    paid: { label: "已付款", color: "bg-green-100 text-green-700" },
    pending_purchase: { label: "待采购", color: "bg-blue-100 text-blue-700" },
    purchased: { label: "已采购", color: "bg-indigo-100 text-indigo-700" },
    in_warehouse: { label: "已入库", color: "bg-purple-100 text-purple-700" },
    in_storage: { label: "仓储中", color: "bg-orange-100 text-orange-700" },
    ready_to_ship: { label: "待发货", color: "bg-red-100 text-red-700" },
    shipped: { label: "已发货", color: "bg-blue-100 text-blue-700" },
    delivered: { label: "已送达", color: "bg-green-100 text-green-700" },
    cancelled: { label: "已取消", color: "bg-gray-100 text-gray-500" },
    expired: { label: "已超期", color: "bg-red-100 text-red-700" },
  };
  
  const config = statusConfig[status] || { label: status, color: "bg-gray-100 text-gray-700" };
  return <Badge className={config.color}>{config.label}</Badge>;
}

// Payment Status Badge
function PaymentStatusBadge({ status }) {
  const statusConfig = {
    pending: { label: "待处理", color: "bg-gray-100 text-gray-700" },
    awaiting_payment: { label: "待付款", color: "bg-yellow-100 text-yellow-700" },
    awaiting_confirmation: { label: "待确认", color: "bg-blue-100 text-blue-700" },
    paid: { label: "已付款", color: "bg-green-100 text-green-700" },
    underpaid: { label: "未付足", color: "bg-orange-100 text-orange-700" },
    overpaid: { label: "多付款", color: "bg-purple-100 text-purple-700" },
    confirmed: { label: "已确认", color: "bg-green-100 text-green-700" },
  };
  
  const config = statusConfig[status] || { label: status, color: "bg-gray-100 text-gray-700" };
  return <Badge className={config.color}>{config.label}</Badge>;
}

export default function AdminUserDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useCurrentUser();
  const { can, isAdmin } = usePermissions();
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  
  // Note modal state
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState("internal"); // internal or customer_visible
  const [savingNote, setSavingNote] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  
  const canReadOthers = isAdmin || can("user:read");
  
  const loadData = useCallback(async (silent = false) => {
    // Determine which user ID to load
    const targetUserId = userId === 'me' ? currentUser?.id : userId;
    
    if (!targetUserId) return;
    
    if (!silent) setLoading(true);
    setError(null);
    
    // Check if user is viewing their own profile or has admin permissions
    const isOwnProfile = targetUserId === currentUser?.id;
    const hasAdminPermission = canReadOthers;
    
    if (!isOwnProfile && !hasAdminPermission) {
      setError('Forbidden: You do not have permission to view this profile');
      setLoading(false);
      return;
    }
    
    try {
      // const res = await base44.functions.invoke('getCustomer360Data', { userId: targetUserId });
      const res = MOCK_ADMIN_USER_DETAIL_DATA;
      if (res.data?.error) {
        setError(res.data.error);
      } else {
        setData(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setLoading(false);
    // 包含 canReadOthers：权限数据晚于页面加载到达时自动重试，避免管理员被误判 Forbidden
  }, [userId, currentUser?.id, canReadOthers]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveNote = async () => {
    if (!noteContent.trim() || !data?.userProfile?.id) return;
    setSavingNote(true);
    try {
      await base44.functions.invoke('manageCustomerNote', {
        action: 'create',
        userId: data.userProfile.id,
        content: noteContent,
        note_type: noteType
      });
      toast.success('备注已添加');
      setNoteContent("");
      setShowNoteModal(false);
      await loadData(true);
    } catch (e) {
      toast.error(e.response?.data?.error || '添加备注失败');
    }
    setSavingNote(false);
  };
  
  // Check permissions
  const isOwnProfile = userId === 'me' || (data && data.userProfile?.id === currentUser?.id);
  const canViewCustomerProfile = isOwnProfile || isAdmin || can("user:read");
  const canManageNotes = isAdmin || can("user:add_note");
  
  if (!canViewCustomerProfile) {
    return (
      <div className="text-center py-12">
        <Shield className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-lg font-semibold text-gray-800">无访问权限</p>
        <p className="text-sm text-gray-500 mt-1">您没有权限查看客户档案</p>
      </div>
    );
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }
  
  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Button variant="outline" size="sm" onClick={() => navigate(createPageUrl("AdminUsers"))}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回用户列表
        </Button>
        <Alert className="border-red-300 bg-red-50">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <AlertDescription className="text-red-800">
            {error || "客户不存在"}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  const { userProfile, memberTier, metrics, recentOrders, pendingTasks, riskFlags, preferences, timeline, orders, finance, logistics, notes, roles } = data;
  const pinnedNotes = (notes || []).filter(n => n.is_pinned);
  
  // 退款次数：使用后端精确统计（timeline 仅取前 50 条事件，会漏算）
  const refundCount = metrics.refundCount || 0;
  
  const formatCurrency = (amount) => {
    return `¥${Math.round(amount).toLocaleString()}`;
  };
  
  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };
  
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header - Back button */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => isOwnProfile || !userId ? navigate('/') : navigate(createPageUrl("AdminUsers"))}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {isOwnProfile || !userId ? '返回首页' : '返回用户列表'}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setActiveTab('orders')}>
            <ExternalLink className="w-4 h-4 mr-2" />
            查看订单
          </Button>
          {canManageNotes && (
            <Button size="sm" className="bg-gray-900 hover:bg-gray-800" onClick={() => navigate(createPageUrl("SubmitOrder"))}>
              <Plus className="w-4 h-4 mr-2" />
              新建订单
            </Button>
          )}
        </div>
      </div>
      
      {/* Risk Flags */}
      {riskFlags && riskFlags.length > 0 && (
        <div className="space-y-2">
          {riskFlags.map((flag, idx) => (
            <Alert key={idx} className={flag.severity === 'high' ? 'border-red-300 bg-red-50' : 'border-orange-300 bg-orange-50'}>
              <AlertTriangle className={`w-4 h-4 ${flag.severity === 'high' ? 'text-red-600' : 'text-orange-600'}`} />
              <AlertDescription className={flag.severity === 'high' ? 'text-red-800 font-medium' : 'text-orange-800'}>
                {flag.message}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}
      
      {/* Top Identity Section */}
      <Card className="border-2">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                {userProfile.avatar_url ? (
                  <img src={userProfile.avatar_url} alt="头像" className="w-full h-full object-cover" />
                ) : (
                  (userProfile.display_name || userProfile.full_name || userProfile.email)[0].toUpperCase()
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-gray-900" style={memberTier?.name_font_color ? { color: memberTier.name_font_color } : undefined}>
                    {userProfile.display_name || userProfile.full_name || "未设置昵称"}
                  </h1>
                  {/* 系统角色 */}
                  <Badge className={(SYSTEM_ROLE_CONFIG[userProfile.role] || SYSTEM_ROLE_CONFIG.user).color + " text-xs"}>
                    <Shield className="w-3 h-3 mr-1" />
                    {(SYSTEM_ROLE_CONFIG[userProfile.role] || { label: userProfile.role }).label}
                  </Badge>
                  {userProfile.credit_enabled && (
                    <Badge className="bg-indigo-100 text-indigo-700">
                      <CreditCard className="w-3 h-3 mr-1" />记账
                    </Badge>
                  )}
                  {memberTier || userProfile.member_tier_name ? (
                    <MemberTierBadge
                      tier={memberTier || { name: userProfile.member_tier_name }}
                      showUpgradeLink={isOwnProfile}
                    />
                  ) : isOwnProfile ? (
                    <MemberTierBadge tier={{ name: "普通用户", color: "bg-gray-100 text-gray-500", icon: "Star" }} showUpgradeLink />
                  ) : null}
                  {/* 角色标签（来自角色权限系统，仅管理员可在用户管理中变更） */}
                  {(roles || []).map(r => (
                    <Badge key={r.id} variant="outline" className="text-xs" style={{ borderColor: r.color, color: r.color }}>
                      {r.name}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mt-1">{userProfile.email}</p>
                {userProfile.public_profile_bio && (
                  <div className="text-sm text-gray-600 mt-2 [&_p]:my-0.5 [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_a]:text-blue-600 [&_a]:underline [&_h1]:text-sm [&_h1]:font-bold [&_h2]:text-sm [&_h2]:font-semibold [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded">
                    <ReactMarkdown>{userProfile.public_profile_bio}</ReactMarkdown>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge className="bg-gray-100 text-gray-700 text-xs">
                    <User className="w-3 h-3 mr-1" />
                    ID: {userProfile.id.slice(-6)}
                  </Badge>
                  <Badge className="bg-gray-100 text-gray-700 text-xs">
                    <Calendar className="w-3 h-3 mr-1" />
                    注册：{formatDate(userProfile.created_date)}
                  </Badge>
                  <Badge className={userProfile.is_active ? "bg-green-100 text-green-700 text-xs" : "bg-gray-100 text-gray-500 text-xs"}>
                    {userProfile.is_active ? "正常" : "已停用"}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canManageNotes && (
                <Button variant="outline" size="sm" onClick={() => setShowNoteModal(true)}>
                  <MessageSquare className="w-4 h-4 mr-2" />
                  添加备注
                </Button>
              )}
              {isOwnProfile && (
                <>
                  <Button variant="outline" size="sm" onClick={() => navigate(createPageUrl("UserPreferences"))}>
                    <Sliders className="w-4 h-4 mr-2" />
                    个人偏好
                  </Button>
                  <Button size="sm" onClick={() => setShowEditProfile(true)}>
                    <Settings className="w-4 h-4 mr-2" />
                    编辑资料
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <MetricCard 
          icon={DollarSign} 
          label="累计消费" 
          value={formatCurrency(metrics.totalPaidJpy)} 
          subValue="JPY"
          color="green"
        />
        <MetricCard 
          icon={ShoppingCart} 
          label="订单数" 
          value={metrics.totalOrders} 
          subValue="笔"
          color="blue"
        />
        <MetricCard 
          icon={TrendingUp} 
          label="客单价" 
          value={formatCurrency(metrics.avgOrderValue)} 
          subValue="JPY"
          color="purple"
        />
        <MetricCard 
          icon={Package} 
          label="待发货" 
          value={metrics.pendingShipOrderCount} 
          subValue="订单"
          color="orange"
        />
        <MetricCard 
          icon={CreditCard} 
          label="未付款" 
          value={formatCurrency(metrics.unpaidAmountJpy || 0)} 
          subValue={`${metrics.unpaidOrderCount} 笔订单`}
          color="red"
        />
        <MetricCard 
          icon={DollarSign} 
          label="退款次数" 
          value={refundCount} 
          subValue="次退款"
          color="red"
        />
        <MetricCard 
          icon={Truck} 
          label="后付款" 
          value={metrics.postShipmentPaidCount || 0} 
          subValue="次（发货后补付）"
          color="orange"
        />
        <MetricCard 
          icon={DollarSign} 
          label="退款金额" 
          value={formatCurrency(metrics.totalRefundJpy)} 
          subValue="JPY"
          color="red"
        />
        <MetricCard 
          icon={Truck} 
          label="货款总计" 
          value={formatCurrency(metrics.totalGoodsJpy)} 
          subValue="JPY"
          color="blue"
        />
        <MetricCard 
          icon={CreditCard} 
          label="服务费" 
          value={formatCurrency(metrics.totalServiceFeeJpy || 0)} 
          subValue="JPY"
          color="purple"
        />
        {metrics.totalProfitJpy !== undefined && (
          <MetricCard 
            icon={TrendingUp} 
            label="累计利润" 
            value={formatCurrency(metrics.totalProfitJpy)} 
            subValue="实收−货款−退款"
            color="green"
          />
        )}
        <MetricCard 
          icon={Clock} 
          label="最近下单" 
          value={metrics.lastOrderDate ? formatDate(metrics.lastOrderDate) : "无"} 
          color="gray"
        />
      </div>
      
      {/* Tabs Section */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-white border flex-wrap h-auto justify-start">
          <TabsTrigger value="overview" className="data-[state=active]:bg-gray-100">
            <User className="w-4 h-4 mr-2" />
            概览
          </TabsTrigger>
          <TabsTrigger value="orders" className="data-[state=active]:bg-gray-100">
            <Package className="w-4 h-4 mr-2" />
            订单记录
          </TabsTrigger>
          <TabsTrigger value="finance" className="data-[state=active]:bg-gray-100">
            <CreditCard className="w-4 h-4 mr-2" />
            财务账目
          </TabsTrigger>
          <TabsTrigger value="logistics" className="data-[state=active]:bg-gray-100">
            <MapPin className="w-4 h-4 mr-2" />
            物流地址
          </TabsTrigger>
          <TabsTrigger value="preferences" className="data-[state=active]:bg-gray-100">
            <Settings className="w-4 h-4 mr-2" />
            偏好
          </TabsTrigger>
          {isOwnProfile && (
            <TabsTrigger value="faq_questions" className="data-[state=active]:bg-gray-100">
              <MessageCircleQuestion className="w-4 h-4 mr-2" />
              我的提问
            </TabsTrigger>
          )}
          {isOwnProfile && (
            <TabsTrigger value="notifications" className="data-[state=active]:bg-gray-100">
              <Bell className="w-4 h-4 mr-2" />
              通知
            </TabsTrigger>
          )}
          {isOwnProfile && (
            <TabsTrigger value="permissions" className="data-[state=active]:bg-gray-100">
              <Shield className="w-4 h-4 mr-2" />
              角色权限
            </TabsTrigger>
          )}
          {isOwnProfile && (
            <TabsTrigger value="privacy" className="data-[state=active]:bg-gray-100">
              <Eye className="w-4 h-4 mr-2" />
              隐私设置
            </TabsTrigger>
          )}
          <TabsTrigger value="notes" className="data-[state=active]:bg-gray-100">
            <FileText className="w-4 h-4 mr-2" />
            备注
          </TabsTrigger>
          <TabsTrigger value="timeline" className="data-[state=active]:bg-gray-100">
            <Clock className="w-4 h-4 mr-2" />
            时间线
          </TabsTrigger>
        </TabsList>
        
        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent Orders */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">最近订单</CardTitle>
              </CardHeader>
              <CardContent>
                {recentOrders && recentOrders.length > 0 ? (
                  <div className="space-y-2">
                    {recentOrders.slice(0, 5).map(order => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => setSelectedOrder(order)}
                        className="w-full text-left flex items-center gap-3 p-3 border rounded-lg hover:bg-blue-50/50 hover:border-blue-200 transition-colors cursor-pointer"
                      >
                        {order.product_image_url ? (
                          <img src={order.product_image_url} alt="" className="w-10 h-10 rounded object-cover border flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <Package className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{order.product_name}</span>
                            <OrderStatusBadge status={order.order_status} />
                            {order.payment_mode === 'credit' && (
                              <Badge className="bg-indigo-100 text-indigo-700 text-xs">记账</Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatDate(order.created_date)} · {order.order_number || "-"} · {formatCurrency(order.paid_amount)}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">暂无订单</p>
                )}
              </CardContent>
            </Card>
            
            {/* Pending Tasks */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">待处理事项</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingTasks?.unpaidOrders && pendingTasks.unpaidOrders.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-yellow-600" />
                      未付款订单 ({pendingTasks.unpaidOrders.length})
                    </p>
                    <div className="space-y-1">
                      {pendingTasks.unpaidOrders.slice(0, 3).map(order => (
                        <div key={order.id} className="text-sm p-2 bg-yellow-50 border border-yellow-200 rounded">
                          {order.order_number} - {formatCurrency(order.amount)}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                
                {pendingTasks?.pendingShipOrders && pendingTasks.pendingShipOrders.length > 0 ? (
                  <div className="pt-3 border-t">
                    <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                      <Truck className="w-3 h-3 text-blue-600" />
                      待发货订单 ({pendingTasks.pendingShipOrders.length})
                    </p>
                    <div className="space-y-1">
                      {pendingTasks.pendingShipOrders.slice(0, 3).map(order => (
                        <div key={order.id} className="text-sm p-2 bg-blue-50 border border-blue-200 rounded">
                          {order.order_number} - {order.status}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                
                {(pendingTasks?.unpaidOrders?.length === 0 && pendingTasks?.pendingShipOrders?.length === 0) && (
                  <p className="text-sm text-gray-400 text-center py-4">无待处理事项</p>
                )}
              </CardContent>
            </Card>
          </div>
          
          {/* Pinned Notes */}
          {pinnedNotes.length > 0 && (
            <Card className="border-yellow-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-yellow-600" />重要备注
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pinnedNotes.map(note => (
                  <div key={note.id} className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</p>
                    <p className="text-xs text-gray-400 mt-1">{note.created_by_name || note.created_by_email} · {formatDate(note.created_date)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          
          {/* Preferences Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">偏好摘要</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-2">常用网站</p>
                  {preferences?.topStores && preferences.topStores.length > 0 ? (
                    <div className="space-y-1">
                      {preferences.topStores.slice(0, 3).map((store, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs mb-1">
                          {store.name} ({store.count})
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">无数据</p>
                  )}
                </div>
                
                <div>
                  <p className="text-xs text-gray-500 mb-2">常用发货方式</p>
                  {preferences?.topShippingMethods && preferences.topShippingMethods.length > 0 ? (
                    <div className="space-y-1">
                      {preferences.topShippingMethods.slice(0, 3).map((method, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs mb-1">
                          {method.name} ({method.count})
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">无数据</p>
                  )}
                </div>
                
                <div>
                  <p className="text-xs text-gray-500 mb-2">常用支付方式</p>
                  {preferences?.topPaymentMethods && preferences.topPaymentMethods.length > 0 ? (
                    <div className="space-y-1">
                      {preferences.topPaymentMethods.slice(0, 3).map((method, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs mb-1">
                          {PAYMENT_METHOD_LABELS[method.name] || method.name} ({method.count})
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">无数据</p>
                  )}
                </div>
                
                <div>
                  <p className="text-xs text-gray-500 mb-2">目的国家</p>
                  {preferences?.topCountries && preferences.topCountries.length > 0 ? (
                    <div className="space-y-1">
                      {preferences.topCountries.slice(0, 3).map((country, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs mb-1">
                          {country.name} ({country.count})
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">无数据</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Orders Tab */}
        <TabsContent value="orders">
          <CustomerOrdersTab
            orders={orders || recentOrders || []}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            OrderStatusBadge={OrderStatusBadge}
            PaymentStatusBadge={PaymentStatusBadge}
            onOrderClick={setSelectedOrder}
          />
        </TabsContent>
        
        {/* Finance Tab */}
        <TabsContent value="finance">
          <CustomerFinanceTab
            finance={finance}
            userProfile={userProfile}
            metrics={metrics}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            isOwnProfile={isOwnProfile}
          />
        </TabsContent>
        
        {/* Logistics Tab */}
        <TabsContent value="logistics">
          <CustomerLogisticsTab logistics={logistics} preferences={preferences} isOwnProfile={isOwnProfile} />
        </TabsContent>
        
        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-4">
          {/* 本人可编辑：偏好设置 + 联系方式 */}
          {isOwnProfile && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <PreferenceSettingsCard />
              <ContactInfoCard />
            </div>
          )}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">下单偏好统计</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">常用购物网站</h3>
                {preferences?.topStores && preferences.topStores.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {preferences.topStores.map((store, idx) => (
                      <div key={idx} className="p-3 border rounded-lg flex items-center justify-between">
                        <span className="text-sm">{store.name}</span>
                        <Badge variant="outline">{store.count} 单</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">无数据</p>
                )}
              </div>
              
              <div>
                <h3 className="text-sm font-semibold mb-2">常用支付方式</h3>
                {preferences?.topPaymentMethods && preferences.topPaymentMethods.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {preferences.topPaymentMethods.map((method, idx) => (
                      <div key={idx} className="p-3 border rounded-lg flex items-center justify-between">
                        <span className="text-sm">{PAYMENT_METHOD_LABELS[method.name] || method.name}</span>
                        <Badge variant="outline">{method.count} 次</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">无数据</p>
                )}
              </div>
              
              <div>
                <h3 className="text-sm font-semibold mb-2">平均下单金额</h3>
                <div className="p-4 bg-gray-50 border rounded-lg">
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.avgOrderValue)}</p>
                  <p className="text-xs text-gray-500 mt-1">JPY / 单</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* FAQ Questions Tab（仅本人） */}
        {isOwnProfile && (
          <TabsContent value="faq_questions">
            <MyFaqQuestionsCard />
          </TabsContent>
        )}

        {/* Notifications Tab（仅本人） */}
        {isOwnProfile && (
          <TabsContent value="notifications">
            <NotificationGlobalSettingsCard />
          </TabsContent>
        )}
        
        {/* Role Permissions Tab（仅本人） */}
        {isOwnProfile && (
          <TabsContent value="permissions">
            <RolePermissionsTab />
          </TabsContent>
        )}
        
        {/* Privacy Settings Tab（仅本人） */}
        {isOwnProfile && (
          <TabsContent value="privacy">
            <PrivacySettingsTab />
          </TabsContent>
        )}
        
        {/* Notes Tab */}
        <TabsContent value="notes">
          <CustomerNotesPanel
            notes={notes || []}
            customerUserId={userProfile.id}
            canManage={canManageNotes}
            formatDate={formatDate}
            onReload={() => loadData(true)}
          />
        </TabsContent>
        
        {/* Timeline Tab */}
        <TabsContent value="timeline">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">客户时间线</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline && timeline.length > 0 ? (
                <div className="space-y-3">
                  {timeline.slice(0, 50).map((event, idx) => {
                    const eventIcons = {
                      registered: { icon: User, color: 'bg-green-500' },
                      order_created: { icon: ShoppingCart, color: 'bg-blue-500' },
                      payment: { icon: CreditCard, color: 'bg-green-500' },
                      refund: { icon: DollarSign, color: 'bg-red-500' },
                      shipped: { icon: Truck, color: 'bg-blue-500' },
                      order_cancelled: { icon: X, color: 'bg-gray-500' },
                      order_expired: { icon: AlertTriangle, color: 'bg-red-500' },
                      credit_application: { icon: FileText, color: 'bg-indigo-500' },
                    };
                    const Icon = eventIcons[event.type]?.icon || Clock;
                    const color = eventIcons[event.type]?.color || 'bg-blue-500';
                    
                    return (
                      <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg">
                        <div className={`${color} p-1.5 rounded-full mt-0.5 flex-shrink-0`}>
                          <Icon className="w-3 h-3 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">{event.title}</p>
                            <p className="text-xs text-gray-400">{formatDate(event.date)}</p>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{event.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">暂无时间线数据</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Order Detail Modal */}
      {selectedOrder && (
        <CustomerOrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          OrderStatusBadge={OrderStatusBadge}
          PaymentStatusBadge={PaymentStatusBadge}
        />
      )}
      
      {/* Edit Profile Modal */}
      {showEditProfile && (
        <EditProfileModal
          userProfile={userProfile}
          onClose={() => setShowEditProfile(false)}
          onSaved={() => loadData(true)}
        />
      )}
      
      {/* Note Modal - Placeholder */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">添加备注</h3>
              <button onClick={() => setShowNoteModal(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">备注类型</Label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input 
                      type="radio" 
                      name="noteType" 
                      checked={noteType === "internal"} 
                      onChange={() => setNoteType("internal")}
                      className="text-blue-600"
                    />
                    内部备注（仅管理员可见）
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input 
                      type="radio" 
                      name="noteType" 
                      checked={noteType === "customer_visible"} 
                      onChange={() => setNoteType("customer_visible")}
                      className="text-blue-600"
                    />
                    客户可见
                  </label>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">备注内容</Label>
                <Textarea 
                  className="mt-1" 
                  rows={4}
                  placeholder="输入备注内容..."
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                />
              </div>
              <div className="flex gap-2 justify-end pt-3">
                <Button variant="outline" size="sm" onClick={() => setShowNoteModal(false)}>取消</Button>
                <Button size="sm" disabled={savingNote || !noteContent} onClick={handleSaveNote}>
                  {savingNote ? "保存中..." : "保存"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}