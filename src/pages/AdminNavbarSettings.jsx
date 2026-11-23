import { useState, useEffect } from "react";
import { mergeNavTree, DEFAULT_NAV_TREES } from "@/lib/navRegistry";
import { tenantEntity } from "@/lib/tenantApi";
import { invalidateTenantConfigCache } from "@/lib/configCache";
import NavbarSettingsManager from "@/components/admin/NavbarSettingsManager";
import NavbarExchangeRateManager from "@/components/admin/NavbarExchangeRateManager";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Loader2, RotateCcw, Navigation, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export default function AdminNavbarSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adminTree, setAdminTree] = useState([]);
  const [userTree, setUserTree] = useState([]);
  const [settings, setSettings] = useState([]);

  useEffect(() => {
    let alive = true;
    // 导航布局与汇率配置都存放在租户级 site_settings 中，一次 layoutConfig 即可全部取回
    tenantEntity.layoutConfig("SiteSettings")
      .then((cfg) => {
        if (!alive) return;
        const nav = cfg?.navbarSettings;
        setAdminTree(mergeNavTree(nav?.admin_nav, "admin"));
        setUserTree(mergeNavTree(nav?.user_nav, "user"));
        setSettings(cfg?.settings || []);
      })
      .catch(() => {
        if (alive) toast.error("加载导航设置失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const handleReload = async () => {
    const cfg = await tenantEntity.layoutConfig("SiteSettings");
    setSettings(cfg?.settings || []);
    invalidateTenantConfigCache();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const nav = { admin_nav: adminTree, user_nav: userTree };
      const value = JSON.stringify(nav);
      // 保存到租户级 SiteSettings: key = navbar_layout_config（与 navbar_exchange_rate_config 同一套读写方式）
      const existingList = await tenantEntity.list("SiteSettings", { key: "navbar_layout_config" });
      const existing = (existingList || []).find(s => s?.key === "navbar_layout_config");

      if (existing?.id) {
        await tenantEntity.update("SiteSettings", existing.id, { value });
      } else {
        await tenantEntity.create("SiteSettings", {
          key: "navbar_layout_config",
          value,
          description: "导航栏布局配置（JSON）",
          category: "layout",
        });
      }

      invalidateTenantConfigCache();
      toast.success("导航栏设置已保存");
    } catch (e) {
      toast.error(e.response?.data?.message || e.response?.data?.error || e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = (group) => {
    const def = JSON.parse(JSON.stringify(DEFAULT_NAV_TREES[group]));
    if (group === "admin") setAdminTree(def);
    else setUserTree(def);
    toast.info("已恢复默认布局（尚未保存）");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Navigation className="w-5 h-5 text-gray-700" />
          <h1 className="text-xl font-bold text-gray-900">导航栏布局设置</h1>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          保存设置
        </Button>
      </div>
      <p className="text-sm text-gray-500">
        可隐藏入口、修改显示文字、调整顺序，并通过「设为上一项的子级」建立次级菜单（最多三层）。权限不足的用户仍然不会看到对应入口。
      </p>

      <Tabs defaultValue="user">
        <TabsList>
          <TabsTrigger value="admin">管理员导航</TabsTrigger>
          <TabsTrigger value="user">普通用户导航</TabsTrigger>
          <TabsTrigger value="rate">
            <TrendingUp className="w-3.5 h-3.5 mr-1" />导航栏汇率显示
          </TabsTrigger>
        </TabsList>

        <TabsContent value="admin">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <div>
                <CardTitle className="text-base">管理员导航入口</CardTitle>
                <p className="text-xs text-gray-400 mt-1">管理员身份登录时将完全使用此导航（与普通用户导航彻底分离）。下方「用户入口」默认隐藏，可按需开启。</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleReset("admin")}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" />恢复默认
              </Button>
            </CardHeader>
            <CardContent>
              <NavbarSettingsManager group="admin" tree={adminTree} onChange={setAdminTree} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="user">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-base">普通用户导航入口</CardTitle>
              <Button variant="outline" size="sm" onClick={() => handleReset("user")}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" />恢复默认
              </Button>
            </CardHeader>
            <CardContent>
              <NavbarSettingsManager group="user" tree={userTree} onChange={setUserTree} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rate">
          <NavbarExchangeRateManager settings={settings} onReload={handleReload} />
        </TabsContent>
      </Tabs>
    </div>
  );
}