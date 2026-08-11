import { useState, useEffect } from "react";
import { tenantEntity } from "@/lib/tenantApi";
import { usePermissions } from "@/hooks/usePermissions";
import { Plus, Edit2, Trash2, Bell, RefreshCw, MonitorPlay } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import ModalAnnouncementForm from "@/components/admin/ModalAnnouncementForm";

const TYPE_LABELS = { info: "一般", warning: "警告", success: "成功", urgent: "紧急" };
const TYPE_COLORS = { info: "bg-blue-100 text-blue-700", warning: "bg-yellow-100 text-yellow-700", success: "bg-green-100 text-green-700", urgent: "bg-red-100 text-red-700" };
const AUDIENCE_LABELS = { all: "全部用户", users: "一般用户", admins: "管理员" };
const POSITION_LABELS = {
  above_nav: "导航栏上部",
  below_nav: "导航栏下部（默认）",
  page_footer: "页面尾部",
  modal: "弹窗公告",
};

// All known pages from pages.config.js + manually registered routes
const ALL_PAGES = [
  { key: "Home", label: "首页" },
  { key: "SubmitOrder", label: "提交订单" },
  { key: "MyOrders", label: "我的订单" },
  { key: "ShippingRequests", label: "发货申请" },
  { key: "ShippingPool", label: "发货池" },
  { key: "ConsolidationPool", label: "拼邮池" },
  { key: "UserPreferences", label: "个人设置" },
  { key: "Payment", label: "支付" },
  { key: "Notifications", label: "通知" },
  { key: "UserNotificationSettings", label: "通知设置" },
  { key: "MemberTiers", label: "会员阶级" },
  { key: "GroupBuy", label: "拼单" },
  { key: "PreShipmentForm", label: "预报发货" },
  { key: "AdminDashboard", label: "管理看板" },
  { key: "AdminOrders", label: "订单管理" },
  { key: "AdminShipping", label: "发货管理" },
  { key: "AdminShippingPool", label: "发货池管理" },
  { key: "AdminUsers", label: "用户管理" },
  { key: "AdminAnnouncements", label: "公告管理" },
  { key: "AdminSettings", label: "后台设置" },
  { key: "AdminFeeRules", label: "服务费规则" },
  { key: "AdminNavbarSettings", label: "导航设置" },
  { key: "AdminReports", label: "报表" },
  { key: "AdminTransitWork", label: "中转工作台" },
];

const EMPTY_FORM = {
  title: "", content: "", type: "info", is_active: true, target_audience: "all",
  expires_at: "", display_position: "below_nav", ticker_interval: 5,
  allowed_pages: [], dismissible: false,
};

function PageSelector({ value = [], onChange }) {
  const toggle = (key) => {
    if (value.includes(key)) {
      onChange(value.filter(k => k !== key));
    } else {
      onChange([...value, key]);
    }
  };
  return (
    <div className="border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1.5">
      <p className="text-xs text-gray-400 mb-2">空=所有页面均显示；勾选后只在选中页面显示</p>
      <div className="grid grid-cols-2 gap-1">
        {ALL_PAGES.map(p => (
          <label key={p.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
            <Checkbox checked={value.includes(p.key)} onCheckedChange={() => toggle(p.key)} />
            <span className="text-xs text-gray-700">{p.label}</span>
            <span className="text-xs text-gray-400 font-mono">({p.key})</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function AdminAnnouncements() {
  const { can, isAdmin } = usePermissions();
  const canCreate = isAdmin && can("announcement:create_announcement");
  const canEdit = isAdmin && can("announcement:edit_announcement");
  const canDelete = isAdmin && can("announcement:delete_announcement");

  const [announcements, setAnnouncements] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showModalForm, setShowModalForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingModal, setEditingModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const data = await tenantEntity.list('Announcement');
    setAnnouncements(data || []);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (a) => {
    if (a.display_position === "modal") {
      setEditingModal(a);
      setShowModalForm(true);
      setShowForm(false);
      return;
    }
    setEditing(a);
    setForm({
      title: a.title, content: a.content, type: a.type, is_active: a.is_active,
      target_audience: a.target_audience, expires_at: a.expires_at || "",
      display_position: a.display_position || "below_nav",
      ticker_interval: a.ticker_interval ?? 5,
      allowed_pages: a.allowed_pages || [],
      dismissible: a.dismissible || false,
    });
    setShowForm(true);
  };

  const handleSaveModal = async (formData) => {
    setSaving(true);
    try {
      const payload = { ...formData, display_position: "modal" };
      if (editingModal) {
        await tenantEntity.update('Announcement', editingModal.id, payload);
        toast.success("弹窗公告已更新");
      } else {
        await tenantEntity.create('Announcement', payload);
        toast.success("弹窗公告已发布");
      }
      await load();
      setShowModalForm(false);
      setEditingModal(null);
    } catch (err) {
      console.error("保存弹窗公告失败:", err);
      toast.error("操作失败：" + (err?.message || "未知错误"));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form, ticker_interval: Number(form.ticker_interval) || 5 };
      if (editing) {
        await tenantEntity.update('Announcement', editing.id, payload);
        toast.success("公告已更新");
      } else {
        await tenantEntity.create('Announcement', payload);
        toast.success("公告已发布");
      }
      await load();
      setShowForm(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    } catch (err) {
      console.error("保存公告失败:", err);
      toast.error("操作失败：" + (err?.message || "未知错误"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await tenantEntity.delete('Announcement', id);
      toast.success("公告已删除");
      await load();
    } catch (err) {
      console.error("删除公告失败:", err);
      toast.error("删除失败：" + (err?.message || "未知错误"));
    }
  };

  const handleToggle = async (a) => {
    // When re-activating a dismissible announcement, bump dismissed_version so users see it again
    const update = { is_active: !a.is_active };
    if (!a.is_active && a.dismissible) {
      update.dismissed_version = String(Date.now());
    }
    await tenantEntity.update('Announcement', a.id, update);
    await load();
  };

  // Manually re-publish: bump dismissed_version to force all users to see it again
  const handleRePublish = async (a) => {
    await tenantEntity.update('Announcement', a.id, {
      dismissed_version: String(Date.now()),
      is_active: true,
    });
    await load();
  };

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">公告管理</h1>
        {canCreate && (
          <div className="flex gap-2">
            <Button variant="outline" className="text-sm border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => { setEditingModal(null); setShowModalForm(!showModalForm); setShowForm(false); }}>
              <MonitorPlay className="w-4 h-4 mr-1" />新增弹窗公告
            </Button>
            <Button className="bg-red-600 hover:bg-red-700 text-sm" onClick={() => { setEditing(null); setForm(EMPTY_FORM); setShowForm(!showForm); setShowModalForm(false); }}>
              <Plus className="w-4 h-4 mr-1" />新增公告
            </Button>
          </div>
        )}
      </div>

      {showModalForm && (
        <ModalAnnouncementForm
          editing={editingModal}
          saving={saving}
          onSave={handleSaveModal}
          onCancel={() => { setShowModalForm(false); setEditingModal(null); }}
        />
      )}

      {showForm && (
        <Card className="border-gray-200">
          <CardContent className="p-5 space-y-4">
            <h3 className="font-semibold text-gray-800">{editing ? "编辑公告" : "新增公告"}</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-sm">标题 *</Label>
                <Input className="mt-1" value={form.title} onChange={e => f("title", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label className="text-sm">内容 *</Label>
                <Textarea rows={3} className="mt-1" value={form.content} onChange={e => f("content", e.target.value)} />
              </div>

              <div>
                <Label className="text-sm">类型</Label>
                <Select value={form.type} onValueChange={v => f("type", v)}>
                  <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">受众</Label>
                <Select value={form.target_audience} onValueChange={v => f("target_audience", v)}>
                  <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(AUDIENCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm">显示位置</Label>
                <Select value={form.display_position} onValueChange={v => f("display_position", v)}>
                  <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(POSITION_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">轮播间隔（秒）</Label>
                <Input type="number" min={2} max={60} className="mt-1" value={form.ticker_interval}
                  onChange={e => f("ticker_interval", e.target.value)}
                  placeholder="5"
                  disabled={form.display_position === "modal"} />
                <p className="text-xs text-gray-400 mt-0.5">同位置多条公告时自动切换间隔</p>
              </div>

              <div>
                <Label className="text-sm">过期日期</Label>
                <Input type="date" className="mt-1" value={form.expires_at} onChange={e => f("expires_at", e.target.value)} />
              </div>
            </div>

            {/* Page filter */}
            <div>
              <Label className="text-sm">显示页面</Label>
              <div className="mt-1">
                <PageSelector value={form.allowed_pages} onChange={v => f("allowed_pages", v)} />
              </div>
            </div>

            {/* Flags */}
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={form.is_active} onCheckedChange={v => f("is_active", !!v)} />
                <span className="text-sm">立即显示</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={form.dismissible} onCheckedChange={v => f("dismissible", !!v)} />
                <span className="text-sm">用户可确认（已知晓后不再显示）</span>
              </label>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditing(null); }}>取消</Button>
              <Button size="sm" className="bg-gray-900 hover:bg-gray-800" onClick={handleSave} disabled={saving || !form.title || !form.content}>
                {saving ? "保存中..." : "发布公告"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {announcements.length === 0 ? (
          <div className="text-center py-12 bg-white border border-gray-200 rounded-xl">
            <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">暂无公告</p>
          </div>
        ) : announcements.map(a => (
          <div key={a.id} className={`bg-white border rounded-xl p-4 ${!a.is_active ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-gray-900 text-sm">{a.title}</span>
                  <Badge className={`text-xs ${TYPE_COLORS[a.type]}`}>{TYPE_LABELS[a.type]}</Badge>
                  <Badge className="bg-gray-100 text-gray-600 text-xs">{AUDIENCE_LABELS[a.target_audience]}</Badge>
                  <Badge className="bg-indigo-100 text-indigo-700 text-xs">{POSITION_LABELS[a.display_position] || a.display_position}</Badge>
                  {a.dismissible && <Badge className="bg-purple-100 text-purple-700 text-xs">可确认</Badge>}
                  {(a.allowed_pages || []).length > 0 && (
                    <Badge className="bg-orange-100 text-orange-700 text-xs">{a.allowed_pages.length}个页面</Badge>
                  )}
                  {!a.is_active && <Badge className="bg-gray-100 text-gray-400 text-xs">已隐藏</Badge>}
                </div>
                <p className="text-sm text-gray-600 truncate">{a.content}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span>{new Date(a.created_date).toLocaleDateString("zh-CN")}</span>
                  {a.expires_at && <span>过期：{a.expires_at}</span>}
                  {a.ticker_interval && a.display_position !== "modal" && <span>轮播间隔：{a.ticker_interval}s</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {canEdit && a.dismissible && a.is_active && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-purple-600" title="重新发布（让已确认用户再次看到）"
                    onClick={() => handleRePublish(a)}>
                    <RefreshCw className="w-3 h-3 mr-1" />重新发布
                  </Button>
                )}
                {canEdit && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleToggle(a)}>
                    {a.is_active ? "隐藏" : "显示"}
                  </Button>
                )}
                {canEdit && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(a)}>
                    <Edit2 className="w-3 h-3" />
                  </Button>
                )}
                {canDelete && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => handleDelete(a.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}