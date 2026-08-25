import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { userPrefApi } from "@/lib/tenantApi";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useUserPref } from "@/hooks/useUserPref";
import { User, Save, Palette, Archive, Lock, ExternalLink } from "lucide-react";
import AvatarEditor from "@/components/common/AvatarEditor";
import NavbarExchangeRateManager from "@/components/admin/NavbarExchangeRateManager";
import ThemeSelector from "@/components/common/ThemeSelector";
import CreditPanel from "@/components/user/CreditPanel";
import UserRolePermissionsCard from "@/components/user/UserRolePermissionsCard";
import ContactInfoCard from "@/components/profile/ContactInfoCard";
import PreferenceSettingsCard from "@/components/profile/PreferenceSettingsCard";
import AddressManagerCard from "@/components/profile/AddressManagerCard";
import NotificationGlobalSettingsCard from "@/components/profile/NotificationGlobalSettingsCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function UserPreferences() {
  const { user } = useCurrentUser();
  const { setUser } = useAuth();
  const { can } = usePermissions();
  const { pref, loading: prefLoading } = useUserPref();
  const canChangeAvatar = can("profile:change_avatar");
  const canChangeAutoArchive = can("profile:change_auto_archive_settings");
  const canChangeDisplayName = can("profile:change_display_name");
  const canChangeDisplayNameAnytime = can("profile:change_display_name_anytime");
  const canEditPreference = can("block_profile:*");
  
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [form, setForm] = useState({
    notification_email: true,
    auto_archive_order_days: 7,
    auto_archive_pool_days: 7,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [creditRefreshKey, setCreditRefreshKey] = useState(0);

  const ROLE_LABELS = {
    platform_admin: { label: "平台管理员", color: "bg-purple-100 text-purple-700" },
    tenant_admin:   { label: "租户管理员", color: "bg-red-100 text-red-700" },
    admin:          { label: "管理员",     color: "bg-red-100 text-red-700" },
    staff:          { label: "员工",       color: "bg-blue-100 text-blue-700" },
    user:           { label: "用户",       color: "bg-gray-100 text-gray-600" },
    ROLE_ADMIN:     { label: "大管理员",   color: "bg-red-100 text-red-700"},
    ROLE_USER:      { label: "用户",       color: "bg-gray-100 text-gray-600" },
  };

  // Detect return from Alipay credit payment and trigger CreditPanel refresh
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('credit_paid') === '1') {
      // Remove the param from URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete('credit_paid');
      window.history.replaceState({}, '', url.toString());
      // Wait a moment for the async callback to process, then refresh
      setTimeout(() => setCreditRefreshKey(k => k + 1), 2000);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.display_name || user.full_name || "");
    setAvatarUrl(user?.avatar || user?.avatar_url || "");
  }, [user]);

  useEffect(() => {
    if (!pref) return;
    setForm({
      notification_email: pref.notification_email !== false,
      auto_archive_order_days: pref.auto_archive_order_days !== undefined ? pref.auto_archive_order_days : 7,
      auto_archive_pool_days: pref.auto_archive_pool_days !== undefined ? pref.auto_archive_pool_days : 7,
    });
  }, [pref?.id]);

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);

    let payload = {
      me: {
        id: user.id,
        display_name: displayName,
        avatar: avatarUrl,
      },
      pref: {
        id: pref.id,
        ...form
      }
      
    }

    await base44.auth.updateMe(payload);
    // const data = { ...form, user_email: user.email };
    
    // if (pref) {
    //   pref.user_id = user.id;
    //   await userPrefApi.update(pref.id, data);
    // } else {
    //   const created = await userPrefApi.create(data);
    // }
    // Refresh the user object in AuthContext so avatar/display_name update immediately
    // const updatedUser = await base44.auth.me();
    // setUser(updatedUser);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const displayNameChanged = displayName !== (user?.display_name || user?.full_name || "");

  if (canEditPreference) {
    return (
      <div className="max-w-lg mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Lock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">您没有权限修改个人档案</h2>
          <p className="text-sm text-gray-500">请联系管理员获取权限</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">个人偏好设定</h1>
        <p className="text-sm text-gray-500 mt-0.5">设置您的偏好，提升代购体验</p>
      </div>

      {/* 个人档案入口提示 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700 flex items-center justify-between gap-2">
        <span>联系方式、收货地址与偏好设置也可在个人档案页中管理</span>
        <Link to={createPageUrl("AdminUserDetail/me")} className="flex items-center gap-1 font-medium hover:underline flex-shrink-0">
          <ExternalLink className="w-3 h-3" />前往个人档案
        </Link>
      </div>

      {/* Basic Info */}
      {user && (
        <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <User className="w-4 h-4" />账户信息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <AvatarEditor value={avatarUrl} onChange={setAvatarUrl} disabled={!canChangeAvatar} />
              <div className="flex-1">
                <Label className="text-sm">显示昵称</Label>
                <Input className="mt-1" value={displayName} onChange={e => setDisplayName(e.target.value)}
                  disabled={!canChangeDisplayName || (!canChangeDisplayNameAnytime && !displayNameChanged)} />
                {!canChangeDisplayName && <p className="text-xs text-gray-400 mt-1">您没有权限修改显示昵称</p>}
                {canChangeDisplayName && !canChangeDisplayNameAnytime && <p className="text-xs text-gray-400 mt-1">昵称修改有频率限制</p>}
              </div>
            </div>
            <div className="space-y-2 text-sm pt-1 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">邮箱</span>
                <span className="font-medium text-gray-700">{user.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">角色</span>
                {/* <Badge className="text-xs">{user.role === "admin" ? "管理员" : "用户"}</Badge> */}
                <Badge className="text-xs"> {ROLE_LABELS[user.role]?.label || user.role}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 等级与权限 */}
      <UserRolePermissionsCard />

      {/* 联系方式 */}
      <ContactInfoCard />

      {/* 偏好设置 */}
      <PreferenceSettingsCard />

      {/* 通知管理（全局开关 + 详细设置入口） */}
      <NotificationGlobalSettingsCard />

      {/* 导航栏汇率显示 */}
      <NavbarExchangeRateManager />

      {/* 界面主题 */}
      <Card className="border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Palette className="w-4 h-4" />界面主题
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
        </CardContent>
      </Card>

      {/* 收货地址管理 */}
      <AddressManagerCard />

      {/* 自动存档设置 */}
      <Card className="border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Archive className="w-4 h-4" />自动存档设置
            {!canChangeAutoArchive && <Lock className="w-4 h-4 text-gray-400" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canChangeAutoArchive && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">
              您没有权限修改自动存档设置
            </div>
          )}
          <p className="text-xs text-gray-400">已收货/已签收后，经过设定天数会自动存档，不再显示在主列表中。设为 0 则不自动存档。</p>
          <div>
            <Label className="text-sm">订单收货后自动存档</Label>
            <div className="flex items-center gap-2 mt-1">
              <Select
                value={String(form.auto_archive_order_days)}
                onValueChange={v => f("auto_archive_order_days", Number(v))}
                disabled={!canChangeAutoArchive}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">不自动存档</SelectItem>
                  <SelectItem value="1">1 天后</SelectItem>
                  <SelectItem value="3">3 天后</SelectItem>
                  <SelectItem value="7">1 周后（默认）</SelectItem>
                  <SelectItem value="14">2 周后</SelectItem>
                  <SelectItem value="30">1 个月后</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-sm">发货申请签收后自动存档</Label>
            <div className="flex items-center gap-2 mt-1">
              <Select
                value={String(form.auto_archive_pool_days)}
                onValueChange={v => f("auto_archive_pool_days", Number(v))}
                disabled={!canChangeAutoArchive}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">不自动存档</SelectItem>
                  <SelectItem value="1">1 天后</SelectItem>
                  <SelectItem value="3">3 天后</SelectItem>
                  <SelectItem value="7">1 周后（默认）</SelectItem>
                  <SelectItem value="14">2 周后</SelectItem>
                  <SelectItem value="30">1 个月后</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 记账结算 */}
      <CreditPanel refreshKey={creditRefreshKey} />

      <Button className="w-full bg-red-600 hover:bg-red-700" onClick={handleSave} disabled={saving}>
        <Save className="w-4 h-4 mr-2" />
        {saved ? "已保存 ✓" : saving ? "保存中..." : "保存设置"}
      </Button>
    </div>
    </>
  );
}
