/**
 * CreateShippingPoolModal
 * Multi-step wizard: Step 1 = select orders, Step 2 = address + details
 * Works for both users and admins.
 */
import { useState, useEffect } from "react";
import { X, Package, MapPin, ChevronRight, ChevronLeft, Plus, Check, Loader2 } from "lucide-react";
import CountrySelect from "@/components/common/CountrySelect";
import { getCountry } from "@/lib/countries";
import { base44 } from "@/api/base44Client";
import { tenantEntity, userPrefApi, fetchTenantConfig } from "@/lib/tenantApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { shippingPoolApi } from "@/lib/tenantApi";
import { Truck, Star } from "lucide-react";
import { toast } from "sonner";
import { persistentToastError } from "@/lib/toastUtils.jsx";
import { serializeAddressToText, isAddressFormValid, EMPTY_ADDRESS_FORM } from "@/components/common/AddressForm";

export default function CreateShippingPoolModal({ isAdmin, onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [user, setUser] = useState(null);
  const [availableOrders, setAvailableOrders] = useState([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);
  const [newAddressLabel, setNewAddressLabel] = useState("");
  const [transitLocations, setTransitLocations] = useState([]);
  const [prefs, setPrefs] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const [poolTitle, setPoolTitle] = useState("");

  const [form, setForm] = useState({
    recipient_name: "",
    recipient_phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    postal_code: "",
    destination_country: "",
    shipping_method: "",
    shipping_method_id: null,
    scheduled_ship_date: "",
    transit_location_id: "",
    transit_shipping_method_id: "",
    user_note: "",
  });
  
  const [shippingMethods, setShippingMethods] = useState([]);
  const [transitMethods, setTransitMethods] = useState([]);
  const [shippingAddons, setShippingAddons] = useState([]);
  const [selectedAddonIds, setSelectedAddonIds] = useState([]);
  const [addonCustomFees, setAddonCustomFees] = useState({});
  const [addonFeeErrors, setAddonFeeErrors] = useState({});

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const u = await base44.auth.me();
      setUser(u?.data);

      // const [ordersRes, locs, prefs, cfg, tMethods, addons] = await Promise.all([
      //   base44.functions.invoke('getTenantOrders', {}).then(r => r.data?.orders || []),
      //   tenantEntity.list('TransitLocation', { is_active: true }),
      //   userPrefApi.list({ user_email: u.email }),
      //   fetchTenantConfig(),
      //   tenantEntity.list('TransitShippingMethod', { is_active: true }),
      //   tenantEntity.list('AddonOption', { addon_type: "shipping", is_active: true }),
      // ]);

      const payload = {
        user_email: u?.data?.user_email
      }

      const res = await shippingPoolApi.adminCreate(u.id, payload);


      // const warehouseOrders = ordersRes.filter(o => o.order_status === "in_warehouse");
      setAvailableOrders(res?.orders);
      setTransitLocations(res?.transit_locations);
      
      // Load shipping methods filtered by enabled_for_user_pool (since this is for creating a pool)
      // const methods = (cfg.shippingMethods || []).filter(m => m.is_active !== false && m.enabled_for_user_pool !== false);
      setShippingMethods(res?.shipping_methods);
      setTransitMethods(res?.transit_methods || []);
      setShippingAddons(res?.shipping_addons || []);

      const prefs = res?.user_pref;

      setPrefs(prefs);

      if (prefs && prefs.saved_addresses?.length > 0) {
        setSavedAddresses(prefs.saved_addresses);
        setSelectedAddressId(prefs.saved_addresses[0].id);
        applyAddress(prefs.saved_addresses[0]);
      } else {
        setUseNewAddress(true);
      }
      setLoading(false);
    };
    init().catch(console.error);
  }, [isAdmin]);

  const applyAddress = (addr) => {
    if (!addr) return;
    const lines = (addr.full_text || "").split("\n");
    setForm(p => ({
      ...p,
      recipient_name: lines[0] || "",
      address_line1: lines[1] || "",
      address_line2: lines[2] || "",
      city: lines[3] || "",
    }));
  };

  const handleAddressSelect = (id) => {
    setSelectedAddressId(id);
    if (id === "__new__") {
      setUseNewAddress(true);
      setForm(p => ({ ...p, recipient_name: "", recipient_phone: "", address_line1: "", address_line2: "", city: "", state: "", postal_code: "" }));
    } else {
      setUseNewAddress(false);
      const addr = savedAddresses.find(a => a.id === id);
      if (addr) applyAddress(addr);
    }
  };

  const toggleOrder = (id) => {
    setSelectedOrderIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectedOrders = availableOrders.filter(o => selectedOrderIds.includes(o.id));
  const totalWeight = selectedOrders.reduce((s, o) => s + (parseFloat(o.weight_g) || 0), 0);

  const handleSubmit = async () => {
    if (selectedOrderIds.length === 0 || !form.destination_country) return;

    // Validate addon custom fees are within range
    const hasFeeErrors = Object.entries(addonCustomFees).some(([addonId, fee]) => {
      const addon = shippingAddons.find(a => a.id === addonId);
      return addon && addon.is_user_customizable && selectedAddonIds.includes(addonId) &&
             (fee < addon.fee_min || fee > addon.fee_max);
    });
    if (hasFeeErrors) {
      persistentToastError("请确保所有自定义增值服务的金额都在指定区间内");
      return;
    }

    setSubmitting(true);

    let addrEntry = {};
    // Save new address to address book if requested
    if (useNewAddress && saveAddress && newAddressLabel.trim()) {
      // const existingPrefs = await userPrefApi.list({ user_email: user.email });
      // addrEntry = {
      //   id: Date.now().toString(),
      //   label: newAddressLabel.trim(),
      //   full_text: [form.recipient_name, form.address_line1, form.address_line2, form.city].filter(Boolean).join("\n"),
      // };
      // if (existingPrefs.length > 0) {
      //   await userPrefApi.update(existingPrefs[0].id, { saved_addresses: [...(existingPrefs[0].saved_addresses || []), addrEntry] });
      // } else {
      //   await userPrefApi.create({ user_email: user.email, saved_addresses: [addrEntry] });
      // }
    }

    const transitLoc = transitLocations.find(l => l.id === form.transit_location_id);
    const transitMethod = transitMethods.find(m => m.id === form.transit_shipping_method_id);
    const isPickupOrStorage = form.transit_shipping_method_id === '__pickup__' || form.transit_shipping_method_id === '__storage__';

    // Build standard address object for the engine (skip for pickup/storage)
    const resolvedAddress = isPickupOrStorage ? null : {
      id: Date.now().toString(),
      label: useNewAddress ? newAddressLabel : form.label,
      recipient_name: form.recipient_name || '',
      country: form.destination_country || '',
      addr1: form.address_line1 || '',
      addr2: form.address_line2 || '',
      addr3: '',
      state: form.state || '',
      phone: form.recipient_phone || '',
      postal_code: form.postal_code,
    };

    const full_text = serializeAddressToText(resolvedAddress);

    resolvedAddress.full_text = full_text;

    // Build selected addons
    const selectedAddons = shippingAddons.filter(a => selectedAddonIds.includes(a.id)).map(a => ({
      id: a.id,
      service_name: a.service_name,
      fee: a.fee,
      fee_max: a.fee_max,
      fee_min: a.fee_min,
      fee_currency: a.fee_currency,
      is_user_customizable: a.is_user_customizable,
      custom_fee: (a.is_user_customizable && addonCustomFees[a.id] !== undefined) ? addonCustomFees[a.id] : null
    }));

    const payload = {
      order_ids: selectedOrderIds,
      payload: {
        consType: form.transit_location_id ? 'transit' : '',
        shipping_method: form.shipping_method || '',
        shipping_method_id: form.shipping_method_id,
        scheduled_ship_date: form.scheduled_ship_date || '',
        user_note: form.user_note || '',
        pool_title: poolTitle.trim() || '',
        address: resolvedAddress,
        transit_location_id: form.transit_location_id || '',
        transit_location_name: transitLoc?.name || '',
        transit_location_country: transitLoc?.country || '',
        transit_shipping_method_id: form.transit_shipping_method_id || '',
        transit_shipping_method_name: transitMethod?.name || '',
        selected_addon_ids: selectedAddonIds,
        selected_addons: selectedAddons,
        target_pool_id: '',
        join_existing_pool: false,
        is_private: false,
        shared_with_emails: [],
        customs_declaration: null,
      },
      new_address: useNewAddress,
      pref_id: prefs.id,
      
    }

    try {
      const res = await shippingPoolApi.handleAdminCreate(payload);
      toast.success(`发货池 [${res?.pool_code}] 创建成功`);
      onSuccess?.();
    } catch (err) {
        let message = err?.response?.data?.message;
        console.error('[CreatShippingPoolModal] Handle Submit Create Shipping Pool failed:', message);
        persistentToastError(message || "提交失败，请稍后重试");
        setSubmitting(false);
        return;
    } finally {
      
    }
    // Call unified engine — pool_code generation and per_user_groups are handled server-side
    // await base44.functions.invoke('createShippingPool', {
    //   order_ids: selectedOrderIds,
    //   payload: {
    //     consType: form.transit_location_id ? 'transit' : '',
    //     shipping_method: form.shipping_method || '',
    //     scheduled_ship_date: form.scheduled_ship_date || '',
    //     user_note: form.user_note || '',
    //     pool_title: poolTitle.trim() || '',
    //     address: resolvedAddress,
    //     transit_location_id: form.transit_location_id || '',
    //     transit_location_name: transitLoc?.name || '',
    //     transit_location_country: transitLoc?.country || '',
    //     transit_shipping_method_id: form.transit_shipping_method_id || '',
    //     transit_shipping_method_name: transitMethod?.name || '',
    //     selected_addon_ids: selectedAddonIds,
    //     selected_addons: selectedAddons,
    //     target_pool_id: '',
    //     join_existing_pool: false,
    //     is_private: false,
    //     shared_with_emails: [],
    //     customs_declaration: null,
    //   },
    // });

    onSuccess?.();
  };

  // Group orders by user (for admin view)
  const ordersByUser = availableOrders.reduce((acc, o) => {
    const key = o.user_name || o.user_email || "未知用户";
    if (!acc[key]) acc[key] = [];
    acc[key].push(o);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onMouseDown={onClose}>
        <div className="bg-white rounded-xl shadow-xl p-8 flex flex-col items-center gap-4" onMouseDown={e => e.stopPropagation()}>
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          <p className="text-gray-600 text-sm">正在加载数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-semibold text-gray-900">创建发货申请</h2>
            <p className="text-xs text-gray-400 mt-0.5">步骤 {step} / 2 · {step === 1 ? "选择包裹" : "填写收货信息"}</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-500" /></button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 py-3 bg-gray-50 border-b">
          {[1, 2].map(s => (
            <div key={s} className={`flex items-center gap-1.5 text-xs font-medium ${s === step ? "text-red-600" : s < step ? "text-green-600" : "text-gray-400"}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${s === step ? "bg-red-600 text-white" : s < step ? "bg-green-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                {s < step ? <Check className="w-3 h-3" /> : s}
              </div>
              {s === 1 ? "选择包裹" : "收货信息"}
              {s < 2 && <ChevronRight className="w-3 h-3 text-gray-300" />}
            </div>
          ))}
        </div>

        <div className="px-6 py-5">
          {/* ---- STEP 1: SELECT ORDERS ---- */}
          {step === 1 && (
            <div className="space-y-4">
              {availableOrders.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">暂无"已入库"状态的订单</p>
                </div>
              ) : isAdmin ? (
                // Admin: grouped by user
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">选择要纳入本次发货的包裹（可跨用户）：</p>
                  {Object.entries(ordersByUser).map(([userName, userOrders]) => (
                    <div key={userName}>
                      <p className="text-xs font-medium text-gray-500 mb-1.5">{userName}</p>
                      <div className="space-y-1.5">
                        {userOrders.map(o => (
                          <OrderSelectRow key={o.id} order={o} checked={selectedOrderIds.includes(o.id)} onToggle={() => toggleOrder(o.id)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // User: flat list
                <div className="space-y-1.5">
                  <p className="text-sm text-gray-600">选择要发货的包裹：</p>
                  {availableOrders.map(o => (
                    <OrderSelectRow key={o.id} order={o} checked={selectedOrderIds.includes(o.id)} onToggle={() => toggleOrder(o.id)} />
                  ))}
                </div>
              )}

              {selectedOrderIds.length > 0 && (
                <div className="bg-teal-50 border border-teal-100 rounded-lg px-4 py-2.5 flex items-center justify-between text-sm">
                  <span className="text-teal-700 font-medium">已选 {selectedOrderIds.length} 件</span>
                  <span className="text-teal-600">总重量：{totalWeight}g</span>
                </div>
              )}
            </div>
          )}

          {/* ---- STEP 2: ADDRESS + DETAILS ---- */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Address selector */}
              {savedAddresses.length > 0 && (
                <div>
                  <Label className="text-xs text-gray-500 font-medium flex items-center gap-1.5 mb-1.5">
                    <MapPin className="w-3.5 h-3.5" />收货地址
                  </Label>
                  <Select value={selectedAddressId} onValueChange={handleAddressSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择地址..." />
                    </SelectTrigger>
                    <SelectContent>
                      {savedAddresses.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                      ))}
                      <SelectItem value="__new__">
                        <span className="flex items-center gap-1.5 text-blue-600">
                          <Plus className="w-3.5 h-3.5" />输入新地址
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Address form */}
              {(useNewAddress || savedAddresses.length === 0) && (
                <div className="space-y-3 border border-gray-100 rounded-lg p-3 bg-gray-50">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-500">收件人姓名 *</Label>
                      <Input className="mt-1 h-8 text-sm" value={form.recipient_name} onChange={e => f("recipient_name", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">联系电话</Label>
                      <Input className="mt-1 h-8 text-sm" value={form.recipient_phone} onChange={e => f("recipient_phone", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">地址行1</Label>
                    <Input className="mt-1 h-8 text-sm" placeholder="街道、门牌号" value={form.address_line1} onChange={e => f("address_line1", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">地址行2</Label>
                    <Input className="mt-1 h-8 text-sm" placeholder="单元、楼层（可选）" value={form.address_line2} onChange={e => f("address_line2", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs text-gray-500">城市</Label>
                      <Input className="mt-1 h-8 text-sm" value={form.city} onChange={e => f("city", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">州/省</Label>
                      <Input className="mt-1 h-8 text-sm" value={form.state} onChange={e => f("state", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">邮编</Label>
                      <Input className="mt-1 h-8 text-sm" value={form.postal_code} onChange={e => f("postal_code", e.target.value)} />
                    </div>
                  </div>
                  {/* Save address option */}
                  <label className="flex items-center gap-2 cursor-pointer mt-1">
                    <Checkbox checked={saveAddress} onCheckedChange={setSaveAddress} />
                    <span className="text-xs text-gray-600">保存此地址到地址簿</span>
                  </label>
                  {saveAddress && (
                    <Input className="h-8 text-sm" placeholder="地址标签（如：家、公司）" value={newAddressLabel} onChange={e => setNewAddressLabel(e.target.value)} />
                  )}
                </div>
              )}

              {/* Show address preview if using saved address */}
              {!useNewAddress && savedAddresses.length > 0 && (() => {
                const addr = savedAddresses.find(a => a.id === selectedAddressId);
                return addr ? (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">
                    {addr.full_text}
                  </div>
                ) : null;
              })()}

              {/* Country + shipping method */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-500">目的国家 *</Label>
                  <CountrySelect
                    value={form.destination_country}
                    onChange={v => f("destination_country", v)}
                    placeholder="选择国家"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">运输方式</Label>
                  <Select value={form.shipping_method} onValueChange={v => {
                    f("shipping_method", v);
                    const selected = shippingMethods.find(m => m.code === v);
                    f("shipping_method_id", selected?.id || null);
                  }}>
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder={shippingMethods.length > 0 ? "选择..." : "暂无可用运输方式"} /></SelectTrigger>
                    <SelectContent>
                      {shippingMethods.length > 0 ? (
                        shippingMethods.map(m => <SelectItem key={m.id} value={m.code}>{m.name}</SelectItem>)
                      ) : (
                        <div className="p-3 text-xs text-gray-400 text-center">暂无可用运输方式</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Transit location + transit shipping method */}
              {transitLocations.length > 0 && (
                <div>
                  <Label className="text-xs text-gray-500">中转地</Label>
                  <Select value={form.transit_location_id} onValueChange={v => { f("transit_location_id", v); f("transit_shipping_method_id", ""); }}>
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="选择中转地（可选）" /></SelectTrigger>
                    <SelectContent>
                      {transitLocations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {/* Transit shipping method (only when transit location selected) */}
              {form.transit_location_id && transitMethods.length > 0 && (
                <div>
                  <Label className="text-xs text-gray-500">中转段运输方式</Label>
                  <div className="mt-1.5 space-y-1.5">
                    {[
                      { id: "__pickup__", name: "自取", description: "到中转地自行取货" },
                      { id: "__storage__", name: "暂存", description: "货品暂存于中转地" },
                    ].map(m => (
                      <label key={m.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors text-xs ${form.transit_shipping_method_id === m.id ? "border-teal-400 bg-teal-50" : "border-gray-200 hover:bg-gray-50"}`}>
                        <input type="radio" checked={form.transit_shipping_method_id === m.id} onChange={() => f("transit_shipping_method_id", m.id)} className="accent-teal-600" />
                        <span className="text-gray-700">{m.name}</span>
                        <span className="text-gray-400">{m.description}</span>
                      </label>
                    ))}
                    {transitMethods.map(m => (
                      <label key={m.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors text-xs ${form.transit_shipping_method_id === m.id ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}>
                        <input type="radio" checked={form.transit_shipping_method_id === m.id} onChange={() => f("transit_shipping_method_id", m.id)} className="accent-blue-600" />
                        <span className="text-gray-700">{m.name}</span>
                        {m.description && <span className="text-gray-400">{m.description}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Shipping addons */}
              {shippingAddons.length > 0 && (
                <div>
                  <Label className="text-xs text-gray-500">发货增值服务（可选）</Label>
                  <div className="mt-1.5 space-y-1.5">
                    {shippingAddons.map(a => {
                      const isSelected = selectedAddonIds.includes(a.id);
                      const isCustomizable = a.is_user_customizable;
                      return (
                        <div key={a.id}>
                          <label className={`flex items-center justify-between gap-2 p-2 rounded-lg border cursor-pointer transition-colors text-xs ${isSelected ? "border-yellow-400 bg-yellow-50" : "border-gray-200 hover:bg-gray-50"}`}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Checkbox 
                                checked={isSelected} 
                                onCheckedChange={v => setSelectedAddonIds(prev => v ? [...prev, a.id] : prev.filter(id => id !== a.id))} 
                              />
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-gray-700">{a.service_name}</span>
                                  {isCustomizable && (
                                    <Badge className="text-[9px] bg-green-100 text-green-700 border-green-200">可自定义</Badge>
                                  )}
                                </div>
                                {isCustomizable && (
                                  <span className="text-[10px] text-gray-400">区间：{a.fee_currency || "JPY"} {a.fee_min} - {a.fee_max}</span>
                                )}
                              </div>
                            </div>
                            {!isCustomizable && a.fee > 0 && (
                              <span className="text-yellow-700 font-medium flex-shrink-0">+{a.fee_currency || "JPY"} {Number(a.fee).toLocaleString()}</span>
                            )}
                          </label>
                          {isCustomizable && isSelected && (
                            <div className="ml-7 mr-2 mb-1.5 flex items-center gap-2">
                              <Input
                                type="number"
                                className={`h-7 w-28 text-xs ${addonFeeErrors[a.id] ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                                placeholder={`${a.fee_min}-${a.fee_max}`}
                                value={addonCustomFees[a.id] ?? a.fee}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const value = val === '' ? '' : parseFloat(val) || 0;
                                  setAddonCustomFees(prev => ({ ...prev, [a.id]: value }));
                                  if (value === '' || value < a.fee_min || value > a.fee_max) {
                                    setAddonFeeErrors(prev => ({ ...prev, [a.id]: value === '' ? '请输入金额' : `请输入${a.fee_min}-${a.fee_max}之间的金额` }));
                                  } else {
                                    setAddonFeeErrors(prev => {
                                      const newErrors = { ...prev };
                                      delete newErrors[a.id];
                                      return newErrors;
                                    });
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <span className="text-[10px] text-gray-400">{a.fee_currency || "JPY"}</span>
                              {addonFeeErrors[a.id] && (
                                <span className="text-[10px] text-red-600">{addonFeeErrors[a.id]}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Scheduled date */}
              <div>
                <Label className="text-xs text-gray-500">计划发货日期</Label>
                <Input type="date" className="mt-1 h-8 text-sm" value={form.scheduled_ship_date} onChange={e => f("scheduled_ship_date", e.target.value)} />
              </div>

              {/* Pool title */}
              <div>
                <Label className="text-xs text-gray-500">发货申请名称（可选）</Label>
                <Input className="mt-1 h-8 text-sm" placeholder="不填则使用系统自动生成的编号" value={poolTitle} onChange={e => setPoolTitle(e.target.value)} />
              </div>

              {/* Note */}
              <div>
                <Label className="text-xs text-gray-500">备注</Label>
                <Textarea rows={2} className="mt-1 text-sm" placeholder="特殊要求..." value={form.user_note} onChange={e => f("user_note", e.target.value)} />
              </div>

              {/* Summary */}
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                <p className="font-medium text-gray-700">发货摘要</p>
                <p>{selectedOrders.length} 件包裹 · 总重量 {totalWeight}g</p>
                {form.destination_country && <p>目的地：{getCountry(form.destination_country)?.name || form.destination_country}</p>}
                {form.shipping_method && (() => {
                  const m = shippingMethods.find(sm => sm.code === form.shipping_method);
                  return <p>运输方式：{m?.name || form.shipping_method}</p>;
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={step === 1 ? onClose : () => setStep(1)}>
            {step === 1 ? "取消" : <><ChevronLeft className="w-3.5 h-3.5 mr-1" />上一步</>}
          </Button>
          {step === 1 ? (
            <Button size="sm" className="bg-red-600 hover:bg-red-700"
              disabled={selectedOrderIds.length === 0}
              onClick={() => setStep(2)}>
              下一步 <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          ) : (
            <Button size="sm" className="bg-red-600 hover:bg-red-700"
              disabled={submitting || !form.destination_country}
              onClick={handleSubmit}>
              {submitting ? "提交中..." : "确认创建发货申请"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderSelectRow({ order, checked, onToggle }) {
  return (
    <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${checked ? "border-teal-300 bg-teal-50" : "border-gray-100 hover:bg-gray-50"}`}>
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{order.product_name}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {order.order_number || order.id.slice(0, 8)}
          {order.user_name ? ` · ${order.user_name}` : ""}
          {" · "}{order.weight_g || 0}g
        </p>
      </div>
      {checked && <Badge className="bg-teal-100 text-teal-700 text-xs flex-shrink-0">已选</Badge>}
    </label>
  );
}