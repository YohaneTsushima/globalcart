/**
 * UserNotifyShipmentModal
 * Supports single or multiple orders.
 * Includes:
 * - Natural-language combined shipping (拼邮) configuration
 * - Privacy system (不公开 + shared with specific users)
 * - Join existing shipping pool option
 */
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Truck, Package, MapPin, Lock, Users, Search, Star, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import CustomsDeclarationForm from "@/components/orders/CustomsDeclarationForm";
import { serializeAddressToText, isAddressFormValid, EMPTY_ADDRESS_FORM } from "@/components/common/AddressForm";
import AddressBlock from "@/components/orders/AddressBlock";
import { getCountry } from "@/lib/countries";
import { base44 } from "@/api/base44Client";
import { tenantEntity, userPrefApi, fetchShippingPools, shippingPoolApi } from "@/lib/tenantApi";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
// Shared with CreateShippingPoolModal — edit shippingFormConstants.js to sync both
import { SHIPPING_METHODS, CONSOLIDATION_TIMEOUT_ACTIONS as TIMEOUT_ACTIONS } from "@/components/shippingpool/shippingFormConstants";
import ConfirmDialog from "@/components/common/ConfirmDialog";

function clampYear(dateStr) {
  if (!dateStr) return dateStr;
  const parts = dateStr.split("-");
  if (parts[0] && parts[0].length > 4) { parts[0] = parts[0].slice(0, 4); return parts.join("-"); }
  return dateStr;
}

function Token({ value, onChange, type = "text", options, placeholder, suffix }) {
  if (options) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="inline-flex h-7 border-0 border-b-2 border-dashed border-blue-400 rounded-none bg-blue-50 text-blue-700 font-medium text-sm px-2 w-auto min-w-[80px] focus:ring-0 focus:border-blue-600">
          <SelectValue placeholder={placeholder || "选择"} />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (type === "date") {
    return (
      <span className="inline-flex items-center gap-0.5">
        <input type="date" value={value || ""} onChange={e => onChange(clampYear(e.target.value))}
          className="inline-block border-0 border-b-2 border-dashed border-blue-400 bg-blue-50 text-blue-700 font-medium text-sm px-1 rounded-none focus:outline-none focus:border-blue-600"
          style={{ width: "130px" }} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="inline-block border-0 border-b-2 border-dashed border-blue-400 bg-blue-50 text-blue-700 font-medium text-sm px-1 rounded-none focus:outline-none focus:border-blue-600 w-auto min-w-[60px]"
        style={{ width: `${Math.max((value?.length || placeholder?.length || 4) + 2, 6)}ch` }} />
      {suffix && <span className="text-gray-500 text-sm">{suffix}</span>}
    </span>
  );
}

function DeadlineToken({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  if (!editing && !value) {
    return (
      <button type="button" onClick={() => setEditing(true)}
        className="inline-flex items-center gap-0.5 border-0 border-b-2 border-dashed border-blue-400 bg-blue-50 text-blue-700 font-medium text-sm px-2 h-7 rounded-none hover:bg-blue-100">
        任何时候
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input type="date" value={value || ""} onChange={e => onChange(clampYear(e.target.value))} autoFocus={editing}
        className="inline-block border-0 border-b-2 border-dashed border-blue-400 bg-blue-50 text-blue-700 font-medium text-sm px-1 rounded-none focus:outline-none focus:border-blue-600"
        style={{ width: "140px" }} />
      {value && <button type="button" onClick={() => { onChange(""); setEditing(false); }} className="text-blue-400 hover:text-blue-600 text-xs">×</button>}
    </span>
  );
}

function TransitMethodSection({ consType, selectedTransitId, transitLocations, transitMethods, selectedTransitMethodId, setSelectedTransitMethodId }) {
  if (consType !== "transit") return null;
  const selectedLoc = transitLocations.find(l => l.id === selectedTransitId);
  const disabledMethodIds = selectedLoc?.disabled_transit_method_ids || [];
  const visibleMethods = transitMethods.filter(m => !disabledMethodIds.includes(m.id));
  const allowPickup = selectedLoc?.allow_pickup;
  const allowStorage = selectedLoc?.allow_storage;
  if (visibleMethods.length === 0 && !allowPickup && !allowStorage) return null;

  const getRateSummary = (m) => {
    if (m.rate_mode === "fixed" || !m.simple_rates?.length) {
      return `+${m.fee_currency || "CNY"} ${Number(m.fee || 0).toLocaleString()}`;
    }
    const r = m.simple_rates[0];
    return `首${r.first_weight_g}g/${r.first_weight_fee}${r.currency}`;
  };

  return (
    <div>
      <label className="text-xs text-gray-500 font-medium uppercase tracking-wide flex items-center gap-1.5">
        <Truck className="w-3.5 h-3.5" />中转段运输方式 <span className="text-red-500">*</span>
      </label>
      <div className="mt-1.5 space-y-1.5">
        {allowPickup && (
          <label className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${selectedTransitMethodId === "__pickup__" ? "border-teal-400 bg-teal-50" : "border-gray-200 hover:bg-gray-50"}`}>
            <input type="radio" checked={selectedTransitMethodId === "__pickup__"} onChange={() => setSelectedTransitMethodId("__pickup__")} className="accent-teal-600" />
            <span className="text-sm text-gray-600">自取</span>
          </label>
        )}
        {allowStorage && (
          <label className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${selectedTransitMethodId === "__storage__" ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"}`}>
            <input type="radio" checked={selectedTransitMethodId === "__storage__"} onChange={() => setSelectedTransitMethodId("__storage__")} className="accent-indigo-600" />
            <span className="text-sm text-gray-600">暂存</span>
          </label>
        )}
        {visibleMethods.map(m => (
          <label key={m.id} className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${selectedTransitMethodId === m.id ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:bg-gray-50"}`}>
            <div className="flex items-center gap-2">
              <input type="radio" checked={selectedTransitMethodId === m.id} onChange={() => setSelectedTransitMethodId(m.id)} className="accent-orange-500" />
              <div>
                <span className="text-sm font-medium text-gray-800">{m.name}</span>
                {m.description && <span className="text-xs text-gray-400 ml-2">{m.description}</span>}
              </div>
            </div>
            <span className="text-xs font-medium text-orange-700 flex-shrink-0">{getRateSummary(m)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function TransitAddonSection({ consType, selectedTransitId, transitLocations, shippingAddons, selectedAddonIds, setSelectedAddonIds, addonCustomFees, setAddonCustomFees, addonFeeErrors, setAddonFeeErrors }) {
  // When consType is "transit", filter out addons disabled by the selected transit location
  const disabledAddonIds = consType === "transit"
    ? (transitLocations.find(l => l.id === selectedTransitId)?.disabled_addon_ids || [])
    : [];
  const visibleAddons = shippingAddons.filter(a => !disabledAddonIds.includes(a.id));
  // Show addons for all shipping types (not just transit)
  if (visibleAddons.length === 0) return null;

  return (
    <div>
      <label className="text-xs text-gray-500 font-medium uppercase tracking-wide flex items-center gap-1.5">
        <Star className="w-3.5 h-3.5" />增值服务（可选）
      </label>
      <div className="mt-1.5 space-y-1.5">
        {visibleAddons.map(a => {
          const isSelected = selectedAddonIds.includes(a.id);
          const isCustomizable = a.is_user_customizable;
          return (
            <div key={a.id} className={`rounded-lg border p-2.5 transition-colors ${isSelected ? "border-yellow-400 bg-yellow-50" : "border-gray-200 hover:bg-gray-50"}`}>
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div className="flex items-center gap-2 flex-1">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={v => setSelectedAddonIds(prev => v ? [...prev, a.id] : prev.filter(id => id !== a.id))}
                  />
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{a.name}</span>
                      {isCustomizable && (
                        <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200">用户可自定义</Badge>
                      )}
                      {a.description && <span className="text-xs text-gray-400">{a.description}</span>}
                    </div>
                    {isCustomizable && (
                      <span className="text-[10px] text-gray-500">区间：{a.fee_currency || "JPY"} {a.min_fee} - {a.max_fee} · 默认：{Number(a.fee || 0).toLocaleString()}</span>
                    )}
                  </div>
                </div>
                {!isCustomizable && (
                  <span className="text-xs font-medium text-yellow-700 flex-shrink-0">+{a.fee_currency || "JPY"} {Number(a.fee || 0).toLocaleString()}</span>
                )}
              </label>
              {isCustomizable && isSelected && (
                <div className="mt-2 ml-6 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-green-600 font-medium">用户可自定义</span>
                    <Input
                      type="number"
                      className="h-7 w-28 text-xs"
                      placeholder={`${a.min_fee}-${a.max_fee}`}
                      value={addonCustomFees[a.id] ?? a.fee}
                      onChange={(e) => {
                        const val = e.target.value;
                        const value = val === '' ? '' : parseFloat(val) || 0;
                        setAddonCustomFees(prev => ({ ...prev, [a.id]: value }));
                        if (value === '' || value < a.min_fee || value > a.max_fee) {
                          setAddonFeeErrors(prev => ({ ...prev, [a.id]: value === '' ? '请输入金额' : `请输入${a.min_fee}-${a.max_fee}之间的金额` }));
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
                    <span className="text-xs text-yellow-700">{a.fee_currency || "JPY"}</span>
                  </div>
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
  );
}

export default function UserNotifyShipmentModal({ order, orders, initialData, onClose, onSuccess, hazmatText }) {
  const targetOrders = orders || (order ? [order] : []);
  const isMulti = targetOrders.length > 1;

  const [method, setMethod] = useState(targetOrders[0]?.shipping_method || "");
  const [consType, setConsType] = useState("");
  const [deadline, setDeadline] = useState("");
  const [minWeight, setMinWeight] = useState("2000");
  const [consMethod, setConsMethod] = useState("");
  const [consMethodFallback, setConsMethodFallback] = useState("");
  const [timeoutAction, setTimeoutAction] = useState("ship_individually");
  const [timeoutMethod, setTimeoutMethod] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [consolidationPoolId, setConsolidationPoolId] = useState(null);

  // Address & transit
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [userPrefId, setUserPrefId] = useState(null);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [transitLocations, setTransitLocations] = useState([]);
  const [selectedTransitId, setSelectedTransitId] = useState("");
  const [finalAddressId, setFinalAddressId] = useState("");

  // New address input state
  const [newAddress, setNewAddress] = useState({ label: "", ...EMPTY_ADDRESS_FORM });
  const [saveNewAddress, setSaveNewAddress] = useState(false);
  // Which address slot is in "new input" mode: "direct" | "final" | "other"
  const [addressInputMode, setAddressInputMode] = useState({});

  // Privacy system
  const [isPrivate, setIsPrivate] = useState(false);
  const [allUsers, setAllUsers] = useState([]); // non-admin users
  const [sharedWithEmails, setSharedWithEmails] = useState([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");

  // Join existing pool (consolidation)
  const [joinExistingPool, setJoinExistingPool] = useState(false);
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [existingPools, setExistingPools] = useState([]);
  const [poolSearchQuery, setPoolSearchQuery] = useState("");
  const [selectedPoolId, setSelectedPoolId] = useState("");
  // Join existing direct (single) pool
  const [joinDirectPool, setJoinDirectPool] = useState(false);
  const [directPoolSearchQuery, setDirectPoolSearchQuery] = useState("");
  const [selectedDirectPoolId, setSelectedDirectPoolId] = useState("");
  const [directPools, setDirectPools] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingPool, setLoadingPool] = useState(false);

  // Customs declaration (single shipment only)
  const [poolTitle, setPoolTitle] = useState("");
  const [customsData, setCustomsData] = useState(null);

  // Addons & transit shipping method
  const [shippingAddons, setShippingAddons] = useState(initialData?.addons || []);
  const [selectedAddonIds, setSelectedAddonIds] = useState([]);
  const [addonCustomFees, setAddonCustomFees] = useState({});
  const [addonFeeErrors, setAddonFeeErrors] = useState({});
  const [transitMethods, setTransitMethods] = useState(initialData?.transitMethods || []);
  const [selectedTransitMethodId, setSelectedTransitMethodId] = useState(
    initialData?.userPreference?.preferred_transit_shipping_id || ""
  );
  const [shippingMethods, setShippingMethods] = useState(initialData?.shippingMethods || []);
  const [methodError, setMethodError] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    // If initialData was provided by the parent page, use it directly — skip all self-fetches
    if (initialData) {
      const pref = initialData.userPreference;
      if (pref?.saved_addresses) setSavedAddresses(pref.saved_addresses);
      if (pref?.preferred_transit_shipping_id) setSelectedTransitMethodId(pref.preferred_transit_shipping_id);
      if (pref?.id) setUserPrefId(pref.id);
      // Auto-select default address
      if (pref?.default_address_id) setFinalAddressId(pref.default_address_id);
      setTransitLocations(initialData.transitLocations || []);
      setAllUsers(initialData.nonAdminUsers || []);

      const allPools = initialData.pools || [];
      base44.auth.me().then(u => {
        setCurrentUser(u);
        const consolidationPools = allPools.filter(p =>
          p.consolidation_type && p.consolidation_type !== "" &&
          (p.status === "pending" || p.status === "processing") &&
          (!p.is_private || p.creator_email === u.email || (p.shared_with_emails || []).includes(u.email))
        );
        setExistingPools(consolidationPools);
        const directShipPools = allPools.filter(p =>
          (!p.consolidation_type || p.consolidation_type === "") &&
          (p.status === "pending" || p.status === "processing") &&
          p.creator_email === u.email
        );
        setDirectPools(directShipPools);
      }).catch(() => {});

      // 根据 consolidation_pool_id 查询 pool 并预填表单
      let poolId = order.consolidation_pool_id;
      setConsolidationPoolId(poolId);
      if(poolId) {
        setLoadingPool(true);
        shippingPoolApi.one(poolId).then(pool => {
          setLoadingPool(false);
          if (!pool) return;
          setMethod(pool.shipping_method || "");
          setConsType(pool.consolidation_type || "");
          setPoolTitle(pool.title || "");
          setNote(pool.user_note || "");
          // 地址映射
          if (pool.recipient_name || pool.address_line1) {
            setNewAddress({
              label: "来自发货申请",
              recipient_name: pool.recipient_name || "",
              country: pool.destination_country || pool.country || "",
              addr1: pool.address_line1 || "",
              addr2: pool.address_line2 || "",
              addr3: pool.address_line3 || "",
              state: pool.state || "",
              phone: pool.recipient_phone || "",
            });
            // 自动进入新建地址模式
            setAddressInputMode({ direct: true });
          }

          setCustomsData(pool.customs_declaration);
        }).catch(() => {
          setLoadingPool(false);
        });
      }

      return;
    }

    // Fallback: self-fetch when used outside MyOrders (e.g. from OrderDetailDrawer)
    base44.auth.me().then(async u => {
      setCurrentUser(u);
      const [prefs, allLocs, usersRes, allPools, addons, tMethods, shippingMethods] = await Promise.all([
        userPrefApi.list({ user_email: u.email }),
        tenantEntity.list('TransitLocation', { is_active: true }),
        base44.functions.invoke("listNonAdminUsers", {}).catch(() => ({ data: { users: [] } })),
        fetchShippingPools(),
        tenantEntity.list('AddonOption', { addon_type: "shipping", is_active: true }),
        tenantEntity.list('TransitShippingMethod', { is_active: true }),
        tenantEntity.list('ShippingMethod', { is_active: true }),
      ]);
      if (prefs.length > 0) {
        if (prefs[0].saved_addresses) setSavedAddresses(prefs[0].saved_addresses);
        if (prefs[0].preferred_transit_shipping_id) setSelectedTransitMethodId(prefs[0].preferred_transit_shipping_id);
        if (prefs[0].default_address_id) setFinalAddressId(prefs[0].default_address_id);
        setUserPrefId(prefs[0].id);
      }
      setTransitLocations((allLocs || []).filter(l => l.is_active !== false));
      setAllUsers(usersRes?.data?.users || []);
      setShippingMethods(shippingMethods || []);
      const consolidationPools = allPools.filter(p =>
        p.consolidation_type && p.consolidation_type !== "" &&
        (p.status === "pending" || p.status === "processing") &&
        (!p.is_private || p.creator_email === u.email || (p.shared_with_emails || []).includes(u.email))
      );
      setExistingPools(consolidationPools);
      const directShipPools = allPools.filter(p =>
        (!p.consolidation_type || p.consolidation_type === "") &&
        (p.status === "pending" || p.status === "processing") &&
        p.creator_email === u.email
      );
      setDirectPools(directShipPools);
      setShippingAddons(addons || []);
      setTransitMethods(tMethods || []);
    }).catch(() => {});
  }, []);

  const handleAddressSelect = (val, slot = "direct") => {
    if (val === "__new__") {
      setAddressInputMode(m => ({ ...m, [slot]: true }));
      if (slot === "final") setFinalAddressId("");
      else setSelectedAddress("");
    } else {
      setAddressInputMode(m => ({ ...m, [slot]: false }));
      if (slot === "final") {
        setFinalAddressId(val);
      } else {
        setSelectedAddress(val);
      }
    }
  };

  const consolidation = consType !== "";
  const hasConsolidationConditions = consolidation && (deadline || minWeight);
  const normalizeId = id => id === 'pickup' ? '__pickup__' : id === 'storage' ? '__storage__' : (id || '');
  const normalizedTransitMethodId = normalizeId(selectedTransitMethodId);
  const isPickupStorageSelected = normalizedTransitMethodId === '__pickup__' || normalizedTransitMethodId === '__storage__';

  // An address slot is "satisfied" when:
  //  - user picked a saved address (selectedId is set and not new mode), OR
  //  - new address form is open (isNewMode or no saved addresses) AND form is valid
  const isAddressSlotOk = (slot) => {
    const inNewMode = !!addressInputMode[slot] || savedAddresses.length === 0;
    if (inNewMode) return isAddressFormValid(newAddress);
    const id = slot === "final" ? finalAddressId : selectedAddress;
    return !!id;
  };

  // Calculate total weight for all orders
  const totalWeight = targetOrders.reduce((s, o) => s + (o.weight_g || 0), 0);

  // Check if shipping method is within constraints
  const getMethodError = () => {
    if (!method) return null;
    const selectedMethod = shippingMethods.find(m => m.code === method);
    if (!selectedMethod) return null;
    
    // Check weight constraints
    if (selectedMethod.min_weight_g > 0 && totalWeight < selectedMethod.min_weight_g) {
      return `所选运输方式最小重量为 ${selectedMethod.min_weight_g}g，当前订单总重为 ${totalWeight}g，不符合条件`;
    }
    if (selectedMethod.max_weight_g > 0 && totalWeight > selectedMethod.max_weight_g) {
      return `所选运输方式最大重量为 ${selectedMethod.max_weight_g}g，当前订单总重为 ${totalWeight}g，超出限制`;
    }
    
    // Check disabled item size templates
    const disabledSizes = selectedMethod.disabled_item_size_template_ids || [];
    const hasDisabledSize = targetOrders.some(o => o.item_size_template_id && disabledSizes.includes(o.item_size_template_id));
    if (hasDisabledSize) {
      return `所选运输方式不支持当前订单所使用的物品尺寸模板`;
    }
    
    return null;
  };
  
  const selectedPool = existingPools.find(p => p.id === selectedPoolId);

  // When joining existing pool, method/minWeight/consMethod are locked
  const isJoiningPool = joinExistingPool && selectedPoolId;

  const filteredPools = existingPools.filter(p => {
    if (!poolSearchQuery) return true;
    const q = poolSearchQuery.toLowerCase();
    return (p.pool_code || "").toLowerCase().includes(q) ||
      (p.transit_location_name || "").toLowerCase().includes(q) ||
      (p.title || "").toLowerCase().includes(q);
  });

  const filteredUsers = allUsers.filter(u => {
    if (!userSearchQuery) return true;
    const q = userSearchQuery.toLowerCase();
    return (u.full_name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
  });

  const toggleSharedUser = (email) => {
    setSharedWithEmails(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  };

  const handleSubmit = async () => {
    if (!method && !isJoiningPool) return;
    if (!isJoiningPool && consType === "transit" && !selectedTransitId) return;
    if (!isJoiningPool && consType === "transit" && !selectedTransitMethodId) return;
    if (!isJoiningPool && consType === "transit" && !isPickupStorageSelected && !isAddressSlotOk("final")) return;
    if (isJoiningPool && !isPickupStorageSelected && !isAddressSlotOk("final")) return;
    if (isJoiningPool && selectedPool?.consolidation_type === "transit" && !selectedTransitMethodId) return;
    if (!isJoiningPool && consType === "" && !joinDirectPool && !isAddressSlotOk("direct")) return;
    if (!isJoiningPool && consType === "other" && !isAddressSlotOk("other")) return;
    if (joinExistingPool && !selectedPoolId) return;

    // Validate addon custom fees are within range
    const hasFeeErrors = Object.entries(addonCustomFees).some(([addonId, fee]) => {
      const addon = shippingAddons.find(a => a.id === addonId);
      return addon && addon.is_user_customizable && selectedAddonIds.includes(addonId) &&
             (fee < addon.min_fee || fee > addon.max_fee);
    });
    if (hasFeeErrors) {
      alert('请确保所有自定义增值服务的金额都在指定区间内');
      return;
    }

    setSubmitting(true);

    const u = currentUser || await base44.auth.me();
    const orderIds = targetOrders.map(o => o.id);

    // Resolve effective address for each slot
    const getEffectiveAddr = (slot) => {
      const inNewMode = !!addressInputMode[slot] || savedAddresses.length === 0;
      if (inNewMode) {
        if (!isAddressFormValid(newAddress)) return null;
        return { id: `new_${Date.now()}`, label: newAddress.label || "新地址", full_text: serializeAddressToText(newAddress), ...newAddress };
      }
      const addrId = slot === "final" ? finalAddressId : selectedAddress;
      return savedAddresses.find(a => a.id === addrId) || null;
    };

    // Save new address to UserPreference if requested
    const isInNewAddressMode = Object.values(addressInputMode).some(v => v) || savedAddresses.length === 0;
    if (saveNewAddress && isAddressFormValid(newAddress) && isInNewAddressMode) {
      const newEntry = {
        id: `addr_${Date.now()}`,
        label: newAddress.label || "新地址",
        full_text: serializeAddressToText(newAddress),
        ...newAddress,
      };
      const updatedAddresses = [...savedAddresses, newEntry];
      if (userPrefId) {
        await userPrefApi.update(userPrefId, { saved_addresses: updatedAddresses });
      } else {
        const created = await userPrefApi.create({ user_email: u.email, saved_addresses: updatedAddresses });
        if (created?.id) setUserPrefId(created.id);
      }
      setSavedAddresses(updatedAddresses);
    }

    // Build resolved address object
    const skipAddress = isPickupStorageSelected;
    const addrSlot = consType === "transit" ? "final" : (consType === "other" ? "other" : "direct");
    const addrObj = !skipAddress ? getEffectiveAddr(addrSlot) : null;
    const resolvedAddress = addrObj ? {
      recipient_name: addrObj.recipient_name || '',
      country: addrObj.country || '',
      addr1: addrObj.addr1 || '',
      addr2: addrObj.addr2 || '',
      addr3: addrObj.addr3 || '',
      state: addrObj.state || '',
      phone: addrObj.phone || '',
    } : null;

    // Build resolved addons
    const selectedAddons = shippingAddons.filter(a => selectedAddonIds.includes(a.id));
    const resolvedAddons = selectedAddons.map(a => {
      const customFee = addonCustomFees[a.id];
      return {
        id: a.id,
        name: a.name,
        fee: (a.is_user_customizable && customFee !== undefined) ? customFee : a.fee,
        fee_currency: a.fee_currency,
      };
    });

    const hasCustoms = customsData && customsData.items && customsData.items.some(it => it.name);

    // Determine pool target and join mode
    const effectiveTargetPoolId = isJoiningPool ? selectedPoolId : (joinDirectPool ? selectedDirectPoolId : '');
    const effectiveJoinExisting = isJoiningPool || (joinDirectPool && !!selectedDirectPoolId);

    // Resolve transit location name + country for new pool creation
    const transitLoc = transitLocations.find(l => l.id === selectedTransitId);

    // Build the standard shipment payload
    const shipmentPayload = {
      id: consolidationPoolId,
      consType: isJoiningPool ? (selectedPool?.consolidation_type || consType) : consType,
      shipping_method: isJoiningPool ? (selectedPool?.shipping_method || method) : method,
      scheduled_ship_date: deadline || '',
      user_note: note || '',
      pool_title: poolTitle || '',
      address: resolvedAddress,
      transit_location_id: isJoiningPool ? (selectedPool?.transit_location_id || selectedTransitId) : selectedTransitId,
      transit_location_name: isJoiningPool ? (selectedPool?.transit_location_name || transitLoc?.name || '') : (transitLoc?.name || ''),
      transit_location_country: transitLoc?.country || '',
      transit_shipping_method_id: normalizedTransitMethodId,
      transit_shipping_method_name: transitMethods.find(m => m.id === selectedTransitMethodId)?.name || '',
      selected_addon_ids: selectedAddonIds,
      selected_addons: resolvedAddons,
      target_pool_id: effectiveTargetPoolId,
      join_existing_pool: effectiveJoinExisting,
      is_private: isPrivate,
      shared_with_emails: sharedWithEmails,
      customs_declaration: hasCustoms ? customsData : null,
    };
    
    // Call unified engine
    try {
      await base44.functions.invoke('shipping/createShippingPool', {
        order_ids: orderIds,
        notice_key: 'shipping_request_sent',
        payload: shipmentPayload,
      });
      onSuccess?.();
    } catch (err) {
      let message = err?.response?.data?.message;
      console.error('[UserNotifyShipmentModal] createShippingPool failed:', message);
      toast.error(message || "提交失败，请稍后重试");
      setSubmitting(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto relative" onMouseDown={e => e.stopPropagation()}>
        {loadingPool && (
          <div className="absolute inset-0 bg-white/80 z-20 flex items-center justify-center rounded-xl">
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">加载发货申请数据...</span>
            </div>
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-semibold text-gray-900">通知发货</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {isMulti ? `已选择 ${targetOrders.length} 个订单` : targetOrders[0]?.product_name}
            </p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-500" /></button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Multi-order list */}
           {isMulti && (
             <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 max-h-28 overflow-y-auto">
               {targetOrders.map(o => (
                 <div key={o.id} className="flex items-center gap-2 text-xs text-gray-600">
                   <Package className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                   <span className="truncate">{o.product_name}</span>
                   <span className="text-gray-400 flex-shrink-0">{o.weight_g || 100}g</span>
                 </div>
               ))}
               <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
                 <span className="text-xs font-medium text-gray-700">总重量</span>
                 <span className="text-xs font-semibold text-gray-900">{totalWeight}g</span>
               </div>
             </div>
           )}

          {/* Shipping method */}
           <div>
             <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">发货方式 <span className="text-red-500">*</span></label>
             <Select value={method} onValueChange={(val) => { setMethod(val); setMethodError(null); }} disabled={!!isJoiningPool}>
               <SelectTrigger className={`mt-1.5 ${isJoiningPool ? "opacity-50 cursor-not-allowed" : ""} ${methodError ? "border-red-300" : ""} ${!method && !isJoiningPool ? "border-red-400" : ""}`}>
                 <SelectValue placeholder={isJoiningPool ? "使用拼邮池配置" : "请选择发货方式"} />
               </SelectTrigger>
               <SelectContent>
                 {SHIPPING_METHODS.map(m => (
                   <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                 ))}
               </SelectContent>
             </Select>
             {isJoiningPool && <p className="text-xs text-gray-400 mt-1">发货方式将使用所选拼邮需求的配置</p>}
             {method && !isJoiningPool && getMethodError() && (
               <div className="mt-2 p-2.5 rounded-lg bg-red-50 border border-red-200">
                 <p className="text-xs text-red-700 font-medium">⚠️ 所选运输方式不可用</p>
                 <p className="text-xs text-red-600 mt-1">{getMethodError()}</p>
                 <p className="text-xs text-red-600 mt-1">请重新选择运输方式</p>
               </div>
             )}
           </div>

          {/* Consolidation type */}
          <div className="space-y-2">
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">拼邮方式</label>
            {[
              { key: "", label: "单独发货", desc: "不申请拼邮" },
              { key: "transit", label: "申请拼邮到中转地", desc: "与其他包裹合并，发往指定中转地" },
            ].map(opt => (
              <label key={opt.key} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${consType === opt.key ? "border-red-300 bg-red-50" : "border-gray-100 hover:bg-gray-50"}`}>
                <input type="radio" checked={consType === opt.key} onChange={() => { setConsType(opt.key); setJoinExistingPool(false); setSelectedPoolId(""); setJoinDirectPool(false); setSelectedDirectPoolId(""); }} className="mt-0.5 accent-red-600" />
                <div>
                  <div className="text-sm font-medium text-gray-800">{opt.label}</div>
                  <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Join existing direct shipment pool (only for single shipment) */}
          {consType === "" && directPools.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <label className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${joinDirectPool ? "bg-teal-50 border-b border-teal-100" : "hover:bg-gray-50"}`}>
                <Checkbox checked={joinDirectPool} onCheckedChange={v => { setJoinDirectPool(!!v); if (!v) setSelectedDirectPoolId(""); }} />
                <div>
                  <p className="text-sm font-medium text-gray-800">加入已有的单独发货申请</p>
                  <p className="text-xs text-gray-400 mt-0.5">将此订单合并到已有的发货申请中一起发货</p>
                </div>
              </label>
              {joinDirectPool && (
                <div className="px-4 py-3 space-y-2 bg-teal-50/40">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <Input placeholder="搜索发货申请编号..." className="pl-8 h-8 text-sm"
                      value={directPoolSearchQuery} onChange={e => setDirectPoolSearchQuery(e.target.value)} />
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {directPools.filter(p => {
                      if (!directPoolSearchQuery) return true;
                      const q = directPoolSearchQuery.toLowerCase();
                      return (p.pool_code || "").toLowerCase().includes(q) || (p.title || "").toLowerCase().includes(q);
                    }).map(p => (
                      <label key={p.id} className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${selectedDirectPoolId === p.id ? "border-teal-400 bg-teal-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
                        <input type="radio" checked={selectedDirectPoolId === p.id} onChange={() => setSelectedDirectPoolId(p.id)} className="mt-0.5 accent-teal-600" />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-mono font-medium text-teal-700">{p.pool_code}</span>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            单独发货 · {p.shipping_method || "方式未定"} · {(p.order_ids || []).length} 件
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Address selection for non-consolidation */}
           {consType === "" && !joinDirectPool && (
            <AddressBlock
              slot="direct"
              label="收货地址"
              savedAddresses={savedAddresses}
              selectedId={selectedAddress}
              isNewMode={!!addressInputMode["direct"]}
              newAddress={newAddress}
              saveNewAddress={saveNewAddress}
              onSelect={(v) => handleAddressSelect(v, "direct")}
              onNewAddressChange={setNewAddress}
              onSaveToggle={setSaveNewAddress}
              error={!isAddressSlotOk("direct")}
            />
          )}

          {/* Address selection for consType="other" (consolidation to other address) */}
          {consType === "other" && !isJoiningPool && (
            <AddressBlock
              slot="other"
              label="拼邮目标地址"
              savedAddresses={savedAddresses}
              selectedId={selectedAddress}
              isNewMode={!!addressInputMode["other"]}
              newAddress={newAddress}
              saveNewAddress={saveNewAddress}
              onSelect={(v) => handleAddressSelect(v, "other")}
              onNewAddressChange={setNewAddress}
              onSaveToggle={setSaveNewAddress}
              error={!isAddressSlotOk("other")}
            />
          )}

          {/* Customs declaration — single shipment only, shown only when allowed by settings */}
          {consType === "" && !joinDirectPool && (initialData?.allowUserCustomsDeclaration !== false) && (
            <CustomsDeclarationForm
              value={customsData}
              onChange={setCustomsData}
              hazmatText={hazmatText || initialData?.hazmatText || null}
            />
          )}

          {/* Transit location selection */}
          {consType === "transit" && (
            <div className="space-y-3">
              <div className="border border-blue-100 rounded-xl p-4 bg-blue-50/40 space-y-2">
                <label className="text-xs text-blue-700 font-medium">选择中转地 <span className="text-red-500">*</span></label>
                {transitLocations.length === 0 ? (
                  <p className="text-xs text-gray-400">暂无可用中转地，请联系管理员</p>
                ) : transitLocations.map(l => (
                  <label key={l.id} className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${selectedTransitId === l.id ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"} ${joinExistingPool ? "opacity-50 pointer-events-none" : ""}`}>
                    <input type="radio" checked={selectedTransitId === l.id} onChange={() => { setSelectedTransitId(l.id); setSelectedTransitMethodId(""); setSelectedAddonIds([]); }} className="mt-0.5 accent-blue-600" disabled={joinExistingPool} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{l.name}</p>
                      <p className="text-xs text-gray-400">
                        {[getCountry(l.country)?.name || l.country, l.province].filter(Boolean).join(" · ")}
                        {l.handling_fee > 0 && ` · 手续费 ${l.handling_fee_currency || "JPY"} ${l.handling_fee}`}
                        {l.allow_storage && " · 支持暂存"}
                        {l.allow_pickup && " · 支持自取"}
                      </p>
                      {l.manager_contact && <p className="text-xs text-gray-400 mt-0.5">联系：{l.manager_contact}</p>}
                    </div>
                  </label>
                ))}
              </div>
              {!isJoiningPool && (
                <div className={isPickupStorageSelected ? "opacity-50 pointer-events-none grayscale" : ""}>
                  <AddressBlock
                    slot="final"
                    label="最终收货地址"
                    savedAddresses={savedAddresses}
                    selectedId={finalAddressId}
                    isNewMode={!!addressInputMode["final"]}
                    newAddress={newAddress}
                    saveNewAddress={saveNewAddress}
                    onSelect={(v) => handleAddressSelect(v, "final")}
                    onNewAddressChange={setNewAddress}
                    onSaveToggle={setSaveNewAddress}
                    error={!isPickupStorageSelected && !isAddressSlotOk("final")}
                  />
                </div>
              )}
            </div>
          )}

          {/* Join existing pool option (only for consolidation types) */}
          {consolidation && existingPools.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <label className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${joinExistingPool ? "bg-purple-50 border-b border-purple-100" : "hover:bg-gray-50"}`}>
                <Checkbox checked={joinExistingPool} onCheckedChange={v => { setJoinExistingPool(!!v); if (!v) setSelectedPoolId(""); }} />
                <div>
                  <p className="text-sm font-medium text-gray-800">加入已有的拼邮需求</p>
                  <p className="text-xs text-gray-400 mt-0.5">将此次发货订单加入到现有的拼邮池中</p>
                </div>
              </label>

              {joinExistingPool && (
                <div className="px-4 py-3 space-y-2 bg-purple-50/40">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <Input placeholder="搜索拼邮需求编号或名称..." className="pl-8 h-8 text-sm"
                      value={poolSearchQuery} onChange={e => setPoolSearchQuery(e.target.value)} />
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {filteredPools.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">无匹配的拼邮需求</p>
                    ) : filteredPools.map(p => (
                      <label key={p.id} className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${selectedPoolId === p.id ? "border-purple-400 bg-purple-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
                        <input type="radio" checked={selectedPoolId === p.id} onChange={() => setSelectedPoolId(p.id)} className="mt-0.5 accent-purple-600" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-mono font-medium text-purple-700">{p.pool_code}</span>
                            {p.is_private && <span className="text-xs text-gray-400">🔒</span>}
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5 truncate">
                            {p.consolidation_type === "transit" ? `中转拼邮 → ${p.transit_location_name || "中转地"}` : "自选地址拼邮"}
                            {p.shipping_method && ` · ${p.shipping_method}`}
                            {` · 当前 ${(p.order_ids || []).length} 件`}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                  {isJoiningPool && (
                    <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                      ℹ️ 加入已有拼邮需求后，运输方式与凑满重量设置将使用该需求的配置。发货期限设置仅适用于本次新加入的订单。
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Natural-language consolidation config */}
          {consolidation && !isJoiningPool && (
            <div className="border border-blue-100 rounded-xl overflow-hidden">
              <button type="button"
                onClick={() => setStrategyOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100/60 transition-colors">
                <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">拼邮策略</p>
                <span className="text-xs text-blue-400">{strategyOpen ? "收起 ▲" : "展开 ▼"}</span>
              </button>
              {strategyOpen && (
              <div className="bg-blue-50 px-4 pb-4 space-y-3">

              <div className="text-sm text-gray-700 leading-8 flex flex-wrap items-center gap-x-1.5">
                <span>在</span>
                <DeadlineToken value={deadline} onChange={setDeadline} />
                <span>前拼邮发出，</span>
              </div>

              <div className="text-sm text-gray-700 leading-8 flex flex-wrap items-center gap-x-1.5">
                <span>使用</span>
                <Select value={consMethod} onValueChange={v => { setConsMethod(v); setConsMethodFallback(""); }}>
                  <SelectTrigger className="inline-flex h-7 border-0 border-b-2 border-dashed border-blue-400 rounded-none bg-blue-50 text-blue-700 font-medium text-sm px-2 w-auto min-w-[120px] focus:ring-0 focus:border-blue-600">
                    <SelectValue placeholder="任何运输方式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">任何运输方式</SelectItem>
                    {SHIPPING_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {consMethod && consMethod !== "any" && (
                  <>
                    <span className="text-gray-400">或</span>
                    <Select value={consMethodFallback} onValueChange={setConsMethodFallback}>
                      <SelectTrigger className="inline-flex h-7 border-0 border-b-2 border-dashed border-gray-300 rounded-none bg-gray-50 text-gray-500 font-medium text-sm px-2 w-auto min-w-[100px] focus:ring-0">
                        <SelectValue placeholder="可留空" />
                      </SelectTrigger>
                      <SelectContent>
                        {SHIPPING_METHODS.filter(m => m.value !== consMethod).map(m => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
                <span>，</span>
              </div>

              <div className="text-sm text-gray-700 leading-8 flex flex-wrap items-center gap-x-1.5">
                <span>凑满</span>
                <Token type="number" value={minWeight} onChange={setMinWeight} placeholder="2000" suffix="g" />
                <span>时发货。</span>
              </div>

              {hasConsolidationConditions && (
                <div className="space-y-2 pt-1 border-t border-blue-100">
                  <div className="text-sm text-gray-700 leading-8 flex flex-wrap items-center gap-x-1.5">
                    <span className="text-gray-500">若条件未达成，则</span>
                    <Token value={timeoutAction} onChange={setTimeoutAction} options={TIMEOUT_ACTIONS} />
                    <span>。</span>
                  </div>
                  {timeoutAction === "ship_individually" && (
                    <div className="text-sm text-gray-700 leading-8 flex flex-wrap items-center gap-x-1.5 pl-2">
                      <span className="text-gray-500">单独发货方式：</span>
                      <Select value={timeoutMethod} onValueChange={setTimeoutMethod}>
                        <SelectTrigger className="inline-flex h-7 border-0 border-b-2 border-dashed border-blue-400 rounded-none bg-blue-50 text-blue-700 font-medium text-sm px-2 w-auto min-w-[120px] focus:ring-0">
                          <SelectValue placeholder="请选择" />
                        </SelectTrigger>
                        <SelectContent>
                          {SHIPPING_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

            </div>
            )}
          </div>
          )}

          {/* Privacy setting - shown for all consolidation types, including when joining a pool */}
          {consolidation && !isJoiningPool && (
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <label className={`flex items-center gap-3 cursor-pointer rounded-lg p-2 -m-2 transition-colors ${isPrivate ? "bg-gray-100" : "hover:bg-gray-50"}`}>
                <Checkbox checked={isPrivate} onCheckedChange={v => { setIsPrivate(!!v); if (!v) setSharedWithEmails([]); }} />
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">不公开</span>
                  <span className="text-xs text-gray-400">（仅管理员和指定用户可见）</span>
                </div>
              </label>
              {isPrivate && (
                <div className="ml-2 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Users className="w-3.5 h-3.5" />
                    <span>选择可查看此拼邮需求的用户（管理员始终可见，无需选择）</span>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <Input placeholder="搜索用户..." className="pl-8 h-7 text-xs"
                      value={userSearchQuery} onChange={e => setUserSearchQuery(e.target.value)} />
                  </div>
                  {allUsers.length === 0 ? (
                    <p className="text-xs text-gray-400">暂无其他用户</p>
                  ) : (
                    <div className="space-y-1 max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-white">
                      {filteredUsers.map(u => (
                        <label key={u.email} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                          <Checkbox checked={sharedWithEmails.includes(u.email)} onCheckedChange={() => toggleSharedUser(u.email)} />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium text-gray-700">{u.full_name || u.email}</span>
                            {u.full_name && <span className="text-xs text-gray-400 ml-1.5">{u.email}</span>}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                  {sharedWithEmails.length > 0 && (
                    <p className="text-xs text-gray-500">已选择与 {sharedWithEmails.length} 位用户分享</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Joining existing pool: show final address + deadline */}
          {isJoiningPool && (
            <div className="space-y-3">
              <div className={isPickupStorageSelected ? "opacity-50 pointer-events-none grayscale" : ""}>
                <AddressBlock
                  slot="final"
                  label="最终收货地址"
                  savedAddresses={savedAddresses}
                  selectedId={finalAddressId}
                  isNewMode={!!addressInputMode["final"]}
                  newAddress={newAddress}
                  saveNewAddress={saveNewAddress}
                  onSelect={(v) => handleAddressSelect(v, "final")}
                  onNewAddressChange={setNewAddress}
                  onSaveToggle={setSaveNewAddress}
                  error={!isPickupStorageSelected && !isAddressSlotOk("final")}
                />
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
                <p className="text-xs text-blue-500 font-medium uppercase tracking-wide">发货期限（仅适用于本次订单）</p>
                <div className="text-sm text-gray-700 leading-8 flex flex-wrap items-center gap-x-1.5">
                  <span>在</span>
                  <DeadlineToken value={deadline} onChange={setDeadline} />
                  <span>前发出。</span>
                </div>
              </div>
            </div>
          )}

          {/* Address picker for consType="other" (only when NOT joining existing pool) */}
          {consType === "other" && !isJoiningPool && (
            <AddressBlock
              slot="other"
              label="拼邮目标地址"
              savedAddresses={savedAddresses}
              selectedId={selectedAddress}
              isNewMode={!!addressInputMode["other"]}
              newAddress={newAddress}
              saveNewAddress={saveNewAddress}
              onSelect={(v) => handleAddressSelect(v, "other")}
              onNewAddressChange={setNewAddress}
              onSaveToggle={setSaveNewAddress}
              error={!isAddressSlotOk("other")}
            />
          )}

          {consType === "transit" && !isJoiningPool && (
            <TransitMethodSection
              consType="transit"
              selectedTransitId={selectedTransitId}
              transitLocations={transitLocations}
              transitMethods={transitMethods}
              selectedTransitMethodId={selectedTransitMethodId}
              setSelectedTransitMethodId={setSelectedTransitMethodId}
            />
          )}
          {isJoiningPool && selectedPool?.consolidation_type === "transit" && (
            <TransitMethodSection
              consType="transit"
              selectedTransitId={selectedPool.transit_location_id}
              transitLocations={transitLocations}
              transitMethods={transitMethods}
              selectedTransitMethodId={selectedTransitMethodId}
              setSelectedTransitMethodId={setSelectedTransitMethodId}
            />
          )}

          {/* Show shipping addons for all shipment types */}
          {!joinDirectPool && (
            <TransitAddonSection
              consType={consType}
              selectedTransitId={isJoiningPool ? (selectedPool?.transit_location_id || selectedTransitId) : selectedTransitId}
              transitLocations={transitLocations}
              shippingAddons={shippingAddons}
              selectedAddonIds={selectedAddonIds}
              setSelectedAddonIds={setSelectedAddonIds}
              addonCustomFees={addonCustomFees}
              setAddonCustomFees={setAddonCustomFees}
              addonFeeErrors={addonFeeErrors}
              setAddonFeeErrors={setAddonFeeErrors}
            />
          )}

          {/* Pool title — only when creating a new pool (not joining existing) */}
          {!joinDirectPool && !isJoiningPool && (
            <div>
              <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">发货申请名称（可选）</label>
              <Input
                placeholder="不填则使用系统自动生成的编号"
                value={poolTitle}
                onChange={e => setPoolTitle(e.target.value)}
                className="mt-1.5"
              />
            </div>
          )}

          {/* Note */}
          <div>
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">备注（可选）</label>
            <Textarea rows={3} placeholder="特殊要求或补充说明..." value={note} onChange={e => setNote(e.target.value)} className="mt-1.5" />
          </div>
        </div>

        {/* Footer: missing required fields reminder */}
        {(() => {
          const missing = [];
          const isPickupStorageSelected = selectedTransitMethodId === '__pickup__' || selectedTransitMethodId === '__storage__';
          if (!method && !joinDirectPool && !isJoiningPool) missing.push("发货方式");
          if (!isJoiningPool && consType === "transit" && !selectedTransitId) missing.push("中转地");
          if (!isJoiningPool && consType === "transit" && !selectedTransitMethodId) missing.push("中转段运输方式");
          if (!isJoiningPool && consType === "transit" && !isPickupStorageSelected && !isAddressSlotOk("final")) {
            const inNew = !!addressInputMode["final"] || savedAddresses.length === 0;
            if (inNew) {
              if (!newAddress.recipient_name?.trim()) missing.push("收货地址：受取人お名前");
              if (!newAddress.country?.trim()) missing.push("收货地址：受取人国名");
              if (!newAddress.addr2?.trim()) missing.push("収货地址：住所2");
              if (!newAddress.addr1?.trim()) missing.push("收货地址：住所1");
              if (!newAddress.state?.trim()) missing.push("收货地址：州名など");
              if (!newAddress.phone?.trim()) missing.push("收货地址：連絡先電話番号");
            } else {
              missing.push("最终收货地址");
            }
          }
          if (isJoiningPool && !isPickupStorageSelected && !isAddressSlotOk("final")) {
            const inNew = !!addressInputMode["final"] || savedAddresses.length === 0;
            if (inNew) {
              if (!newAddress.recipient_name?.trim()) missing.push("收货地址：受取人お名前");
              if (!newAddress.country?.trim()) missing.push("收货地址：受取人国名");
              if (!newAddress.addr2?.trim()) missing.push("収货地址：住所2");
              if (!newAddress.addr1?.trim()) missing.push("收货地址：住所1");
              if (!newAddress.state?.trim()) missing.push("收货地址：州名など");
              if (!newAddress.phone?.trim()) missing.push("收货地址：連絡先電話番号");
            } else {
              missing.push("最终收货地址");
            }
          }
          if (!isJoiningPool && consType === "" && !joinDirectPool && !isAddressSlotOk("direct")) {
            const inNew = !!addressInputMode["direct"] || savedAddresses.length === 0;
            if (inNew) {
              if (!newAddress.recipient_name?.trim()) missing.push("收货地址：受取人お名前");
              if (!newAddress.country?.trim()) missing.push("收货地址：受取人国名");
              if (!newAddress.addr2?.trim()) missing.push("收货地址：住所2");
              if (!newAddress.addr1?.trim()) missing.push("收货地址：住所1");
              if (!newAddress.state?.trim()) missing.push("收货地址：州名など");
              if (!newAddress.phone?.trim()) missing.push("收货地址：連絡先電話番号");
            } else {
              missing.push("收货地址");
            }
          }
          if (!isJoiningPool && consType === "other" && !isAddressSlotOk("other")) {
            const inNew = !!addressInputMode["other"] || savedAddresses.length === 0;
            if (inNew) {
              if (!newAddress.recipient_name?.trim()) missing.push("拼邮地址：受取人お名前");
              if (!newAddress.country?.trim()) missing.push("拼邮地址：受取人国名");
              if (!newAddress.addr2?.trim()) missing.push("拼邮地址：住所2");
              if (!newAddress.addr1?.trim()) missing.push("拼邮地址：住所1");
              if (!newAddress.state?.trim()) missing.push("拼邮地址：州名など");
              if (!newAddress.phone?.trim()) missing.push("拼邮地址：連絡先電話番号");
            } else {
              missing.push("拼邮目标地址");
            }
          }
          if (joinExistingPool && !selectedPoolId) missing.push("拼邮需求");
          if (joinDirectPool && !selectedDirectPoolId) missing.push("发货申请");
          if (missing.length === 0) return null;
          return (
            <div className="px-5 pb-3">
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                <p className="text-xs font-medium text-orange-700 mb-1">⚠️ 请填写以下必填项后再提交：</p>
                <ul className="space-y-0.5">
                  {missing.map((m, i) => (
                    <li key={i} className="text-xs text-orange-600">· {m}</li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })()}
        <div className="px-5 py-3 border-t flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button
             size="sm"
             className="bg-red-600 hover:bg-red-700"
             onClick={() => setShowConfirm(true)}
             disabled={
               (!method && !joinDirectPool && !isJoiningPool) || submitting ||
               (method && !isJoiningPool && getMethodError()) ||
               (!isJoiningPool && consType === "transit" && !selectedTransitId) ||
               (!isJoiningPool && consType === "transit" && !selectedTransitMethodId) ||
               (!isJoiningPool && consType === "transit" && !(selectedTransitMethodId === '__pickup__' || selectedTransitMethodId === '__storage__') && !isAddressSlotOk("final")) ||
               (isJoiningPool && !(selectedTransitMethodId === '__pickup__' || selectedTransitMethodId === '__storage__') && !isAddressSlotOk("final")) ||
               (isJoiningPool && selectedPool?.consolidation_type === "transit" && !selectedTransitMethodId) ||
               (!isJoiningPool && consType === "" && !joinDirectPool && !isAddressSlotOk("direct")) ||
               (!isJoiningPool && consType === "other" && !isAddressSlotOk("other")) ||
               (joinExistingPool && !selectedPoolId) ||
               (joinDirectPool && !selectedDirectPoolId)
             }
           >
            <Truck className="w-3.5 h-3.5 mr-1.5" />
            {submitting ? "提交中..." : joinDirectPool && selectedDirectPoolId ? `加入发货申请 (${targetOrders.length})` : isJoiningPool ? `加入拼邮需求 (${targetOrders.length})` : isMulti ? `确认通知发货 (${targetOrders.length})` : "确认通知发货"}
          </Button>
        </div>
      </div>
    </div>
    <ConfirmDialog
      open={showConfirm}
      onOpenChange={setShowConfirm}
      title="确认通知发货"
      description="确定要通知发货吗？提交后将通知仓库处理您的订单。"
      confirmText="确认通知"
      cancelText="取消"
      onConfirm={() => { setShowConfirm(false); handleSubmit(); }}
    />
    </>
  );
}