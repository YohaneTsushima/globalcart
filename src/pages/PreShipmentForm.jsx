/**
 * PreShipmentForm - 预出货信息填写页
 * 用户在提交订单后，预先填写出货信息。
 * 订单入库后系统自动按此信息生成发货申请。
 * URL params: order_id
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { fetchTenantConfig, tenantEntity } from "@/lib/tenantApi";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import AddressForm, { EMPTY_ADDRESS_FORM, serializeAddressToText, isAddressFormValid } from "@/components/common/AddressForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Truck, Package, MapPin, Check, ChevronLeft, PlusCircle, Zap, Search, Calculator, AlertTriangle, Image, X } from "lucide-react";
import PaymentMethodSelector from "@/components/common/PaymentMethodSelector";
import { ImageWithViewer } from "@/components/common/ImageViewer";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import PreShipmentFormFullPayOnce from "@/components/PreShipmentFormFullPayOnce";

export default function PreShipmentForm() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get("order_id");

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Config data
  const [shippingMethods, setShippingMethods] = useState([]);
  const [transitLocations, setTransitLocations] = useState([]);
  const [shippingAddons, setShippingAddons] = useState([]);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);

  // Form state
  const [consType, setConsType] = useState(""); // "" = direct, "transit" = transit
  const [joinOfficialPool, setJoinOfficialPool] = useState(false); // Join official shipping pool
  const [selectedPoolId, setSelectedPoolId] = useState(""); // Specific pool selection
  const [joinExistingPool, setJoinExistingPool] = useState(false); // Join existing pool (direct or transit)
  const [selectedExistingPoolId, setSelectedExistingPoolId] = useState(""); // Selected existing pool
  const [shippingMethod, setShippingMethod] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [userNote, setUserNote] = useState("");
  const [noteImages, setNoteImages] = useState([]); // Images for note section
  const [uploadingImages, setUploadingImages] = useState(false);
  const [transitLocationId, setTransitLocationId] = useState("");
  const [transitShippingMethodId, setTransitShippingMethodId] = useState("");
  const [selectedAddonIds, setSelectedAddonIds] = useState([]);
  const [addonCustomFees, setAddonCustomFees] = useState({});
  const [addonFeeErrors, setAddonFeeErrors] = useState({});
  const [address, setAddress] = useState({ label: "", ...EMPTY_ADDRESS_FORM });
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);

  // One-time payment state
  const [fullPayOnceEnabled, setFullPayOnceEnabled] = useState(false);
  const [userEstimatedWeight, setUserEstimatedWeight] = useState("");
  const [estimatedShippingFee, setEstimatedShippingFee] = useState(0);
  const [isRestoringData, setIsRestoringData] = useState(true); // true until initial data load completes
  const [globalEstimateRate, setGlobalEstimateRate] = useState(null); // global fallback scalar rate (legacy)
  const [globalEstimateUnitG, setGlobalEstimateUnitG] = useState(null); // global fallback scalar unit (legacy)
  const [globalEstimateRates, setGlobalEstimateRates] = useState(null); // global fallback rates array (new)

  // Official pools for selection
  const [officialPools, setOfficialPools] = useState([]);

  // Pre-shipment feature settings
  const [preShipmentEnabled, setPreShipmentEnabled] = useState(true);
  const [fullpayOnceFeatureEnabled, setFullpayOnceFeatureEnabled] = useState(false);
  const [allowedMethodCodes, setAllowedMethodCodes] = useState([]);
  const [preShipmentSubmittedReminder, setPreShipmentSubmittedReminder] = useState("");

  // Payment after submit (direct to payment page if needed)
  const [paymentMethod, setPaymentMethod] = useState("");

  useEffect(() => {
    if (!orderId || !user) return;

    let isMounted = true;

    const loadData = async () => {
      try {
        const [ord, cfg, prefs, methods, poolsRes, tenantSettingsRes] = await Promise.all([
        base44.functions.invoke('getTenantOrders', {}).then((r) => (r.data?.orders || []).find((o) => o.id === orderId)),
        fetchTenantConfig(),
        tenantEntity.list('UserPreference', { user_email: user.email }).catch(() => []),
        base44.functions.invoke('managePaymentMethod', { action: 'list' }).then((r) => r.data?.methods || []).catch(() => []),
        base44.functions.invoke('getTenantShippingPools', { status: 'pending' }).catch(() => ({ data: { pools: [] } })),
        base44.functions.invoke('getTenantSettings', {}).catch(() => ({ data: { settings: {}, raw: [] } })),
        ]);
        const tenantSettings = tenantSettingsRes?.data?.settings || {};
        // Feature gate + allowed shipping methods whitelist
        if (tenantSettings['pre_shipment_enabled'] === 'false') setPreShipmentEnabled(false);
        // fullpay_once_enabled defaults to false — only enabled when explicitly set to 'true'
        setFullpayOnceFeatureEnabled(tenantSettings['fullpay_once_enabled'] === 'true');
        if (tenantSettings['pre_shipment_submitted_reminder']) {
          setPreShipmentSubmittedReminder(tenantSettings['pre_shipment_submitted_reminder']);
        }
        const allowedRaw = tenantSettings['pre_shipment_allowed_methods'] || '';
        setAllowedMethodCodes(allowedRaw.split(',').map(x => x.trim()).filter(Boolean));
        // New array-style global rates
        if (tenantSettings['default_estimate_rates']) {
          try {
            const parsed = JSON.parse(tenantSettings['default_estimate_rates']);
            if (Array.isArray(parsed) && parsed.length > 0) setGlobalEstimateRates(parsed);
          } catch { /* ignore */ }
        }
        // Legacy scalar fallback
        const globalRate = tenantSettings['default_estimate_rate_per_100g'] ? parseFloat(tenantSettings['default_estimate_rate_per_100g']) : null;
        const globalUnit = tenantSettings['default_estimate_unit_g'] ? parseFloat(tenantSettings['default_estimate_unit_g']) : null;
        if (globalRate && globalRate > 0) setGlobalEstimateRate(globalRate);
        if (globalUnit && globalUnit > 0) setGlobalEstimateUnitG(globalUnit);

        if (!isMounted) return;

        setOrder(ord || null);

        // Pre-fill form if order already has pre_shipment data (edit mode)
        if (ord?.pre_shipment) {
          const ps = ord.pre_shipment;
          if (ps.shipping_method) setShippingMethod(ps.shipping_method);
          if (ps.scheduled_ship_date) setScheduledDate(ps.scheduled_ship_date);
          if (ps.user_note) setUserNote(ps.user_note);
          if (ps.note_image_urls) setNoteImages(ps.note_image_urls);
          const savedConsType = ps.consType || "";
          setConsType(savedConsType);
          if (ps.transit_location_id) setTransitLocationId(ps.transit_location_id);
          if (ps.transit_shipping_method_id) setTransitShippingMethodId(ps.transit_shipping_method_id);
          if (ps.selected_addon_ids) setSelectedAddonIds(ps.selected_addon_ids);
          // Restore the specific pool selection (use target_pool_id, NOT pool_created which is an automation flag)
          if (savedConsType === "official_pool") {
            setJoinOfficialPool(true);
            setSelectedPoolId(ps.target_pool_id || "");
          }
          // Restore join existing pool selection (for both direct and transit)
          if (ps.join_existing_pool && ps.target_pool_id) {
            setJoinExistingPool(true);
            setSelectedExistingPoolId(ps.target_pool_id);
          }
          // Restore one-time payment config if previously saved
          if (ps.fullpay_once_config) {
            setFullPayOnceEnabled(true);
            setUserEstimatedWeight(String(ps.fullpay_once_config.user_estimated_weight_g || ""));
            setEstimatedShippingFee(ps.fullpay_once_config.estimated_shipping_fee_jpy || 0);
          }
        }
        // Mark restoring as done after a tick so the reset useEffect in child sees isRestoring=true during the batch
        setTimeout(() => setIsRestoringData(false), 50);

        // Deduplicate shipping methods by id - ensure unique
        // Filter based on shipping mode settings (enabled_for_direct_ship, enabled_for_user_pool, enabled_for_official_pool)
        const allMethods = (cfg.shippingMethods || []).filter((m) => {
          if (m.is_active === false) return false;
          // For direct shipping (consType === ""), check enabled_for_direct_ship
          // For transit (consType === "transit"), check enabled_for_user_pool
          // For official pool (consType === "official_pool"), check enabled_for_official_pool
          // Since we're loading all methods upfront, we keep all active methods for now
          // The actual filtering will happen in the UI based on selected consType
          return true;
        });
        const uniqueMap = new Map();
        allMethods.forEach((m) => {
          if (!uniqueMap.has(m.id)) {
            uniqueMap.set(m.id, m);
          }
        });
        const deduped = Array.from(uniqueMap.values());

        // Only update if data actually changed (prevent unnecessary re-renders)
        setShippingMethods((prev) => {
          const prevIds = prev.map((m) => m.id).join(',');
          const newIds = deduped.map((m) => m.id).join(',');
          return prevIds === newIds ? prev : deduped;
        });

        // Merge transit locations with their available transit shipping methods
        // Always use fresh data from config, don't rely on previous state
        const transitMethods = cfg.transitMethods || [];
        const freshTransitLocations = (cfg.transitLocations || [])
          .filter((l) => l.is_active !== false)
          .map((l) => {
            // Get available transit methods for this location
            // Filter out disabled methods and methods not in supported_methods
            const availableMethods = transitMethods.filter((m) => {
              if (m.is_active === false) return false;
              if (l.disabled_transit_method_ids?.includes(m.id)) return false;
              if (l.supported_methods && l.supported_methods.length > 0 && !l.supported_methods.includes(m.name)) return false;
              return true;
            });
            return {
              ...l,
              transit_shipping_methods: availableMethods
            };
          });
        setTransitLocations(freshTransitLocations);

        setShippingAddons((prev) => {
          const filtered = (cfg.addons || []).filter((a) => a.addon_type === 'shipping' && a.is_active !== false);
          const prevIds = prev.map((a) => a.id).join(',');
          const newIds = filtered.map((a) => a.id).join(',');
          return prevIds === newIds ? prev : filtered;
        });

        setPaymentMethods((prev) => {
          const prevIds = prev.map((m) => m.id || m.name).join(',');
          const newIds = (methods || []).map((m) => m.id || m.name).join(',');
          return prevIds === newIds ? prev : methods || [];
        });

        // Set all available pools for user to join
        const allPools = poolsRes.data?.pools || [];
        
        // Filter pools that user can join:
        // - All admin-created official pools (any status)
        // - User's own pools (direct shipping or transit consolidation, pending/processing status)
        // - Other users' non-private transit pools (pending status)
        const availablePools = allPools.filter((p) =>
        p.is_admin_created || (
          (p.status === "pending" || p.status === "processing") && (p.creator_email === user.email || p.consolidation_type === 'transit')
        )
        );
        setOfficialPools(availablePools);

        const pref = prefs[0];
        const addrs = (pref?.saved_addresses || []).map((a) => ({ ...EMPTY_ADDRESS_FORM, ...a }));
        setSavedAddresses(addrs);

        // If editing and order has a saved address, restore it
        const existingAddress = ord?.pre_shipment?.address;
        if (existingAddress && existingAddress.recipient_name) {
          // Prefer matching the saved address back to an address-book entry (by id or content)
          const matched = addrs.find((a) =>
            (existingAddress.id && a.id === existingAddress.id) ||
            (a.recipient_name === existingAddress.recipient_name &&
             a.country === existingAddress.country &&
             a.addr1 === existingAddress.addr1)
          );
          if (matched) {
            setSelectedAddressId(matched.id);
            setAddress({ label: matched.label || "", ...matched });
            setUseNewAddress(false);
          } else {
            setAddress({ label: existingAddress.label || "", ...existingAddress });
            setUseNewAddress(true);
            setSelectedAddressId("");
          }
        } else {
          const defaultId = pref?.default_address_id || "";
          const defaultAddr = addrs.find((a) => a.id === defaultId);
          if (defaultAddr) {
            setSelectedAddressId(defaultAddr.id);
            setAddress({ label: defaultAddr.label || "", ...defaultAddr });
            setUseNewAddress(false);
          } else {
            // Fallback to first address if default not found
            const firstAddr = addrs[0];
            if (firstAddr) {
              setSelectedAddressId(firstAddr.id);
              setAddress({ label: firstAddr.label || "", ...firstAddr });
              setUseNewAddress(false);
            } else {
              setUseNewAddress(true);
            }
          }
        }
        if (isMounted) setLoading(false);
      } catch (error) {
        console.error('[PreShipmentForm] Load error:', error);
        if (isMounted) {
          setLoading(false);
          setIsRestoringData(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [orderId, user?.email]);

  const handleAddressSelect = (id) => {
    if (id === "__new__") {
      setSelectedAddressId("");
      setUseNewAddress(true);
      setAddress({ label: "", ...EMPTY_ADDRESS_FORM });
      setSaveAddress(false);
    } else {
      setSelectedAddressId(id);
      setUseNewAddress(false);
      const addr = savedAddresses.find((a) => a.id === id);
      if (addr) setAddress({ label: addr.label || "", ...addr });
      setSaveAddress(false);
    }
  };

  // Note image upload handlers
  const handleNoteImageUpload = async (files) => {
    if (files.length === 0) return;
    
    setUploadingImages(true);
    try {
      const uploadPromises = Array.from(files).map(file => 
        base44.integrations.Core.UploadFile({ file }).then(r => r.file_url)
      );
      const urls = await Promise.all(uploadPromises);
      setNoteImages(prev => [...prev, ...urls]);
    } catch (error) {
      console.error('Note image upload failed:', error);
      alert('图片上传失败：' + error.message);
    } finally {
      setUploadingImages(false);
    }
  };

  const handleNoteImagePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    const files = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    
    if (files.length > 0) {
      e.preventDefault();
      await handleNoteImageUpload(files);
    }
  };

  const handleNoteImageDrop = async (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      await handleNoteImageUpload(imageFiles);
    }
  };

  const handleRemoveNoteImage = (url) => {
    setNoteImages(prev => prev.filter(u => u !== url));
  };

  // Filter addons based on selected transit location's disabled_addon_ids
  const selectedTransitLocation = transitLocations.find((l) => l.id === transitLocationId);
  const disabledAddonIds = consType === "transit" && selectedTransitLocation?.disabled_addon_ids ?
  selectedTransitLocation.disabled_addon_ids :
  [];
  const availableAddons = shippingAddons.filter((a) => !disabledAddonIds.includes(a.id));

  // Remove any selected addons that are now disabled when transit location changes
  const effectiveSelectedAddonIds = selectedAddonIds.filter((id) => !disabledAddonIds.includes(id));
  const selectedAddons = availableAddons.filter((a) => effectiveSelectedAddonIds.includes(a.id));

  // When user picks a specific official pool (not "default"), shipping method is not required
  const specificPoolSelected = consType === "official_pool" && !!selectedPoolId;

  const canSubmit = () => {
    // If joining existing pool, shipping method is inherited - no need to select
    if (joinExistingPool && selectedExistingPoolId) {
      if (consType === "transit") {
        // When joining existing transit pool, transit location is inherited from the pool - not required
        return true;
      }
      if (consType === "official_pool") return true;
      return isAddressFormValid(address);
    }
    // Otherwise, shipping method is required unless specific pool selected
    if (!specificPoolSelected && !shippingMethod) return false;
    if (consType === "transit") {
      // Transit location AND transit shipping method are both required
      if (!transitLocationId || !transitShippingMethodId) return false;
      // Final address required unless storage/pickup mode
      const isStorageOrPickup = transitShippingMethodId === '__storage__' || transitShippingMethodId === '__pickup__';
      return isStorageOrPickup || isAddressFormValid(address);
    }
    // If one-time payment is enabled, weight is required
    if (fullPayOnceEnabled && (!userEstimatedWeight || parseFloat(userEstimatedWeight) <= 0)) return false;
    if (consType === "official_pool") return true;
    return isAddressFormValid(address);
  };

  const handleSubmit = async (goToPayment = true) => {
    if (!canSubmit() || submitting) return;

    // Validate addon custom fees are within range
    const hasFeeErrors = Object.entries(addonCustomFees).some(([addonId, fee]) => {
      const addon = shippingAddons.find((a) => a.id === addonId);
      return addon && addon.is_user_customizable && effectiveSelectedAddonIds.includes(addonId) && (
      fee < addon.min_fee || fee > addon.max_fee);
    });

    if (hasFeeErrors) {
      alert('请确保所有自定义增值服务的金额都在指定区间内');
      return;
    }

    // One-time payment enabled but shipping fee couldn't be estimated → block instead of silently dropping
    if (fullPayOnceEnabled && parseFloat(userEstimatedWeight) > 0 && !(estimatedShippingFee > 0)) {
      alert('一次付款已开启，但运费估算为 0（该运输方式可能未配置估算费率）。请关闭一次付款或更换运输方式后再提交。');
      return;
    }

    setSubmitting(true);

    // Save new address if requested
    if (useNewAddress && saveAddress && isAddressFormValid(address) && address.label?.trim()) {
      const existingPrefs = await tenantEntity.list('UserPreference', { user_email: user.email });
      const existingAddrs = existingPrefs[0]?.saved_addresses || [];
      const newEntry = {
        id: Date.now().toString(),
        label: address.label.trim(),
        full_text: serializeAddressToText(address),
        ...address
      };
      if (existingPrefs.length > 0) {
        await tenantEntity.update('UserPreference', existingPrefs[0].id, { saved_addresses: [...existingAddrs, newEntry] });
      } else {
        await tenantEntity.create('UserPreference', { user_email: user.email, saved_addresses: [newEntry] });
      }
    }

    const effectiveAddress = useNewAddress ? address : savedAddresses.find((a) => a.id === selectedAddressId) || address;
    const transitLoc = transitLocations.find((l) => l.id === transitLocationId);

    // Handle official pool selection
    const selectedPool = officialPools.find((p) => p.id === selectedPoolId);
    const poolCode = selectedPool?.pool_code || "";

    // Handle existing pool selection (direct or transit)
    const existingPool = officialPools.find((p) => p.id === selectedExistingPoolId);
    const existingPoolCode = existingPool?.pool_code || "";

    // Get destination country from address
    const destinationCountry = effectiveAddress?.country || "";
    
    // When joining existing pool, inherit consType from the pool
    const effectiveConsType = joinExistingPool && selectedExistingPoolId && existingPool
      ? (existingPool.consolidation_type || "")
      : consType;

    // Determine transit location and method - inherit from pool if joining existing pool
    const effectiveTransitLocationId = joinExistingPool && selectedExistingPoolId && existingPool?.consolidation_type === 'transit'
      ? (existingPool.transit_location_id || transitLocationId)
      : transitLocationId;
    
    const effectiveTransitShippingMethodId = joinExistingPool && selectedExistingPoolId && existingPool?.consolidation_type === 'transit'
      ? (existingPool.transit_shipping_method_id || transitShippingMethodId)
      : transitShippingMethodId;
    
    const effectiveTransitLoc = transitLocations.find(l => l.id === effectiveTransitLocationId);

    // One-time payment config
    // service_fee_amount may be undefined if not yet calculated; use 0 as fallback
    const productFee = order.estimated_jpy || 0;
    const serviceFee = order.service_fee_amount || 0;
    const fullPayOnceConfig = fullPayOnceEnabled && userEstimatedWeight && estimatedShippingFee > 0 ? {
      user_estimated_weight_g: parseFloat(userEstimatedWeight) || 0,
      shipping_method_code: shippingMethod,
      destination_country: destinationCountry,
      estimated_shipping_fee_jpy: estimatedShippingFee,
      total_paid_jpy: productFee + serviceFee + estimatedShippingFee,
      settlement_status: "pending"
    } : null;

    const preShipment = {
      shipping_method: shippingMethod,
      scheduled_ship_date: scheduledDate,
      user_note: userNote,
      note_image_urls: noteImages,
      consType: effectiveConsType,
      transit_location_id: effectiveConsType === "transit" ? effectiveTransitLocationId : "",
      transit_location_name: effectiveConsType === "transit" ? effectiveTransitLoc?.name || "" : "",
      transit_location_country: effectiveConsType === "transit" ? effectiveTransitLoc?.country || "" : "",
      transit_shipping_method_id: effectiveConsType === "transit" ? effectiveTransitShippingMethodId : "",
      transit_shipping_method_name: effectiveConsType === "transit" ? (() => {
        // Handle special cases for storage and pickup
        if (effectiveTransitShippingMethodId === "__storage__") return "暂存";
        if (effectiveTransitShippingMethodId === "__pickup__") return "自取";
        const method = effectiveTransitLoc?.transit_shipping_methods?.find(m => m.id === effectiveTransitShippingMethodId);
        return method?.name || "";
      })() : "",
      address: { ...effectiveAddress },
      selected_addon_ids: effectiveSelectedAddonIds,
      selected_addons: selectedAddons.map((a) => {
        const customFee = addonCustomFees[a.id];
        const isCustomizable = a.is_user_customizable;
        return {
          id: a.id,
          name: a.name,
          fee: isCustomizable && customFee !== undefined ? customFee : a.fee,
          fee_currency: a.fee_currency
        };
      }),
      pool_created: false,
      target_pool_id: effectiveConsType === "official_pool" ? selectedPoolId : joinExistingPool ? selectedExistingPoolId : "",
      target_pool_code: effectiveConsType === "official_pool" ? poolCode : joinExistingPool ? existingPoolCode : "",
      target_pool_title: effectiveConsType === "official_pool" && selectedPool ? selectedPool.title || selectedPool.pool_code : joinExistingPool && existingPool ? existingPool.title || existingPool.pool_code : "",
      join_existing_pool: joinExistingPool,
      // One-time payment config
      fullpay_once_config: fullPayOnceConfig
    };

    const updatePayload = {
      order_id: orderId,
      pre_shipment: preShipment
    };
    
    // Also update order-level fields for one-time payment
    if (fullPayOnceConfig) {
      updatePayload.user_estimated_weight_g = fullPayOnceConfig.user_estimated_weight_g;
      updatePayload.shipping_method = fullPayOnceConfig.shipping_method_code;
      updatePayload.destination_country = fullPayOnceConfig.destination_country;
      updatePayload.fullpay_once_config = fullPayOnceConfig;
    }
    
    const res = await base44.functions.invoke('updateTenantOrder', updatePayload);

    // Update local order state so subsequent edits in the same session see fresh data
    if (res?.data?.order) {
      setOrder(res.data.order);
    } else {
      setOrder((prev) => ({ ...prev, pre_shipment: preShipment }));
    }

    setSubmitting(false);

    // Use updated order state for payment redirect decision
    const latestOrder = res?.data?.order || order;
    // Needs payment if: awaiting payment OR fullpay_once just enabled (need to pay product+shipping together)
    const needsPayment = latestOrder.payment_status === "awaiting_payment" ||
                         latestOrder.order_status === "payment_pending";
    if (goToPayment && needsPayment) {
      const m = paymentMethods.find((pm) => (pm.provider_key || pm.name) === paymentMethod || pm.value === paymentMethod);
      const cur = m?.payment_currency || "JPY";
      const method = paymentMethod || "other";
      navigate(`/Payment?order_id=${orderId}&pm_id=${method}&pay_currency=${cur}`);
      return;
    }

    setSubmitted(true);
  };

  if (loading) {
    return <div className="max-w-2xl mx-auto py-12 text-center text-gray-400 text-sm">加载中...</div>;
  }

  if (!preShipmentEnabled) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-gray-400">
        <p className="text-sm">预出货功能当前未开启</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate(createPageUrl("MyOrders"))}>返回我的订单</Button>
      </div>);
  }

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-gray-400">
        <p className="text-sm">订单不存在或无法访问</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate(createPageUrl("MyOrders"))}>返回我的订单</Button>
      </div>);

  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">预出货信息已保存</h2>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            {preShipmentSubmittedReminder || "订单入库后，系统将自动按照您填写的信息生成发货申请，无需再手动操作。"}
          </p>
        </div>

        {/* Order summary */}
        <Card className="border-green-100 bg-green-50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-3">
              <Package className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-800">{order.product_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{order.order_number}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => navigate(createPageUrl("MyOrders"))}>
            查看我的订单
          </Button>
          {(order.payment_status === "awaiting_payment" || order.order_status === "payment_pending") &&
          <Button className="flex-1 bg-red-600 hover:bg-red-700"
          onClick={() => {
            const m = paymentMethods.find((pm) => (pm.provider_key || pm.name) === paymentMethod);
            const cur = m?.payment_currency || "JPY";
            navigate(`/Payment?order_id=${orderId}&pm_id=${paymentMethod || "other"}&pay_currency=${cur}`);
          }}>
              前往付款
            </Button>
          }
        </div>
      </div>);

  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(createPageUrl("MyOrders"))} className="text-gray-400 hover:text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{order?.pre_shipment ? "编辑预出货信息" : "预出货信息"}</h1>
          <p className="text-sm text-gray-400 mt-0.5">预先填写，入库后自动生成发货申请</p>
        </div>
      </div>

      {/* Order card */}
      <Card className="border-gray-200">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start gap-3">
            <Package className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{order.product_name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{order.order_number} · ¥{(order.estimated_jpy || 0).toLocaleString()}</p>
            </div>
            <Badge variant="outline" className="text-xs flex-shrink-0">预出货</Badge>
          </div>
        </CardContent>
      </Card>

      <Alert className="border-blue-200 bg-blue-50">
        <Zap className="w-4 h-4 text-blue-600" />
        <AlertDescription className="text-blue-800 text-sm">
          填写后，管理员确认订单入库时，系统将自动按此信息创建发货申请，跳过手动通知步骤。
        </AlertDescription>
      </Alert>

      {/* Consignment type & transit location */}
      <Card className="border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Truck className="w-4 h-4" />发货方式
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Direct vs transit vs official pool */}
          <div className="space-y-2">
            {[
            { key: "", label: "直接发货", desc: "货品直接从日本发往收货地址" },
            ...(transitLocations.length > 0 ? [{ key: "transit", label: "发往中转地", desc: "货品先发往中转地，再自行安排" }] : []),
            { key: "official_pool", label: "加入官方拼邮", desc: "加入管理员创建的拼邮池，享受优惠运费" }].
            map((opt) =>
            <label key={opt.key} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${consType === opt.key ? "border-red-300 bg-red-50" : "border-gray-200 hover:bg-gray-50"}`}>
                <input type="radio" checked={consType === opt.key} onChange={() => {
                setConsType(opt.key);
                setJoinExistingPool(false);
                setSelectedExistingPoolId("");
                if (opt.key === "official_pool") {
                  setJoinOfficialPool(true);
                  setUseNewAddress(false);
                }
              }} className="mt-0.5 accent-red-600" />
                <div>
                  <span className="text-sm font-medium text-gray-800">{opt.label}</span>
                  <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            )}
          </div>

          {/* Direct shipping - option to join existing direct pool */}
          {consType === "" &&
          <>
              <div className={`space-y-2 border border-blue-100 rounded-xl p-3 bg-blue-50/40 transition-opacity ${joinExistingPool && selectedExistingPoolId ? "opacity-40 pointer-events-none" : ""}`}>
                <Label className="text-xs text-blue-700 font-medium">发货方式（创建新申请）</Label>
                <div className="text-xs text-gray-500 mt-1">如选择加入已有申请，下方信息将自动继承</div>
              </div>

              <div className="space-y-2 border border-blue-100 rounded-xl p-3 bg-blue-50/40">
                <Label className="text-xs text-blue-700 font-medium">加入已有的直接发货申请（可选）</Label>
                <div className="mt-2">
                  <Popover open={joinExistingPool && selectedExistingPoolId === ""} onOpenChange={(open) => {
                  if (!open) setJoinExistingPool(false);
                }}>
                    <PopoverTrigger asChild>
                      <Button
                      variant="outline"
                      className={`w-full justify-between h-10 ${joinExistingPool ? "border-blue-400 bg-blue-50" : ""}`}
                      onClick={() => setJoinExistingPool(!joinExistingPool)}>
                      
                        {joinExistingPool && selectedExistingPoolId ?
                      <span className="text-sm">
                            {(() => {
                          const pool = officialPools.find((p) =>
                          !p.is_admin_created && (
                          !p.consolidation_type || p.consolidation_type === "") &&
                          p.creator_email === user.email &&
                          p.id === selectedExistingPoolId
                          );
                          return pool ? `${pool.pool_code} · ${(pool.order_ids || []).length} 单 · ${pool.shipping_method || '方式未定'}` : "选择发货申请";
                        })()}
                          </span> :

                      <span className="text-sm text-gray-500">选择要加入的发货申请</span>
                      }
                        <Search className="w-4 h-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="搜索发货申请..." />
                      <CommandList>
                        <CommandEmpty>暂无可用的发货申请</CommandEmpty>
                        <CommandGroup heading="我的直接发货申请">
                          {(() => {
                            const directPools = officialPools.filter((p) =>
                            !p.is_admin_created && (
                            !p.consolidation_type || p.consolidation_type === "") &&
                            p.creator_email === user.email
                            );
                            return directPools.map((pool) =>
                            <CommandItem
                              key={pool.id}
                              value={pool.pool_code}
                              onSelect={() => {
                                setSelectedExistingPoolId(pool.id);
                                setJoinExistingPool(true);
                              }}
                              className="flex flex-col items-start gap-1.5 h-auto py-3 px-16">
                              
                                <div className="flex items-center justify-between w-full mb-1">
                                  <span className="text-sm font-semibold text-gray-800">{pool.pool_code}</span>
                                  {selectedExistingPoolId === pool.id && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                                    直接发货
                                  </Badge>
                                  {pool.shipping_method &&
                                <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                      {pool.shipping_method}
                                    </Badge>
                                }
                                  <span className="text-xs text-gray-500">{(pool.order_ids || []).length} 单</span>
                                  {pool.total_weight_g &&
                                <span className="text-xs text-gray-500">· {(pool.total_weight_g / 1000).toFixed(1)}kg</span>
                                }
                                </div>
                                {pool.title &&
                              <span className="text-xs text-gray-600 line-clamp-1 mt-1">{pool.title}</span>
                              }
                              </CommandItem>
                            );
                          })()}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {joinExistingPool && selectedExistingPoolId &&
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 text-xs text-gray-500"
                  onClick={() => {
                    setJoinExistingPool(false);
                    setSelectedExistingPoolId("");
                  }}>
                  
                    清除选择
                  </Button>
                }
                </div>
                </div>
                </>
          }

          {/* Transit location */}
          {consType === "transit" &&
          <>
              <div className={`space-y-2 border border-blue-100 rounded-xl p-3 bg-blue-50/40 transition-opacity ${joinExistingPool && selectedExistingPoolId ? "opacity-40 pointer-events-none" : ""}`}>
                <Label className="text-xs text-blue-700 font-medium">
                  选择中转地 {joinExistingPool && selectedExistingPoolId ? "（已继承）" : "*"}
                </Label>
                {transitLocations.map((l) => {
                  const hasStorage = l.allow_storage === true;
                  const hasPickup = l.allow_pickup === true;
                  // Build complete list of transit options including storage and pickup
                  const allTransitOptions = [
                    ...(l.transit_shipping_methods?.map(m => m.name) || []),
                    ...(hasStorage ? ['暂存'] : []),
                    ...(hasPickup ? ['自取'] : [])
                  ];
                  const transitMethodsText = allTransitOptions.length > 0 
                    ? allTransitOptions.join('、')
                    : '暂无运输方式';
                  return (
                  <label key={l.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${transitLocationId === l.id ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
                      <input type="radio" checked={transitLocationId === l.id} onChange={() => {
                        setTransitLocationId(l.id);
                        setTransitShippingMethodId(""); // Clear transit method selection when changing location
                      }} className="mt-0.5 accent-blue-600" />
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{l.name}</p>
                            {l.country && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                <MapPin className="w-3 h-3 inline mr-1" />
                                {l.country}{l.province ? ` · ${l.province}` : ''}
                              </p>
                            )}
                          </div>
                          {l.handling_fee > 0 && (
                            <Badge variant="outline" className="text-[10px] bg-yellow-50 text-yellow-700 border-yellow-200 flex-shrink-0">
                              中转手续费：{l.handling_fee_currency || 'JPY'} {l.handling_fee.toLocaleString()}
                            </Badge>
                          )}
                        </div>
                        {l.manager_contact && <p className="text-xs text-gray-400 mt-1">联系：{l.manager_contact}</p>}
                        <div className="space-y-1 mt-2">
                          <p className="text-xs text-gray-500">
                            <span className="font-medium">中转运输方式：</span>
                            {transitMethodsText}
                          </p>
                          {l.description && (
                            <p className="text-xs text-gray-400 line-clamp-1">{l.description}</p>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              
              {/* Transit shipping method selection */}
              {(transitLocationId || (joinExistingPool && selectedExistingPoolId)) && (
                <div className="space-y-2 border border-blue-100 rounded-xl p-3 bg-blue-50/40">
                  <Label className="text-xs text-blue-700 font-medium">中转段运输方式 *</Label>
                  {(() => {
                    // Get transit shipping methods from either selected location or selected pool
                    let availableMethods = [];
                    let hasStorage = false;
                    let hasPickup = false;
                    
                    // Get transit location from either direct selection or from selected pool
                    let selectedLocation = null;
                    
                    if (transitLocationId) {
                      selectedLocation = transitLocations.find(l => l.id === transitLocationId);
                    } else if (joinExistingPool && selectedExistingPoolId) {
                      const selectedPool = officialPools.find(p => p.id === selectedExistingPoolId);
                      if (selectedPool?.transit_location_id) {
                        selectedLocation = transitLocations.find(l => l.id === selectedPool.transit_location_id);
                      }
                    }
                    
                    if (selectedLocation) {
                      const disabledIds = selectedLocation.disabled_transit_method_ids || [];
                      availableMethods = (selectedLocation.transit_shipping_methods || []).filter(
                        m => !disabledIds.includes(m.id)
                      );
                      hasStorage = selectedLocation.allow_storage === true;
                      hasPickup = selectedLocation.allow_pickup === true;
                    }
                    
                    if (availableMethods.length === 0 && !hasStorage && !hasPickup) {
                      return (
                        <div className="text-sm text-gray-500 py-2">
                          此中转地暂无可用的中转运输方式
                        </div>
                      );
                    }
                    
                    // Determine the default value when a pool is selected
                    const poolDefaultMethodId = joinExistingPool && selectedExistingPoolId 
                      ? officialPools.find(p => p.id === selectedExistingPoolId)?.transit_shipping_method_id 
                      : "";
                    
                    return (
                      <Select 
                        value={transitShippingMethodId || poolDefaultMethodId || ""} 
                        onValueChange={setTransitShippingMethodId}
                      >
                        <SelectTrigger className="mt-1 h-9 text-sm">
                          <SelectValue placeholder="选择中转运输方式..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableMethods.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                          {hasStorage && (
                            <SelectItem value="__storage__">暂存</SelectItem>
                          )}
                          {hasPickup && (
                            <SelectItem value="__pickup__">自取</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                  <p className="text-xs text-gray-400 mt-1">
                    货品到达中转地后，将通过此运输方式发往最终地址
                  </p>
                </div>
              )}
              
              {/* Final destination address for transit */}
              {(() => {
                const isStorageOrPickup = transitShippingMethodId === '__storage__' || transitShippingMethodId === '__pickup__';
                return (
                <Card className={`border-gray-200 transition-opacity ${isStorageOrPickup ? "opacity-40 pointer-events-none" : ""}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <MapPin className="w-4 h-4" />最终收货地址
                    </CardTitle>
                    <p className="text-xs text-gray-400 mt-1">
                      {isStorageOrPickup ? "暂存/自取模式下无需填写最终地址" : "货品到达中转地后，将发往此地址"}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                  {savedAddresses.length > 0 &&
                    <Select value={useNewAddress ? "__new__" : selectedAddressId || ""} onValueChange={handleAddressSelect}>
                      <SelectTrigger><SelectValue placeholder="选择地址簿中的地址" /></SelectTrigger>
                      <SelectContent>
                        {savedAddresses.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
                        <SelectItem value="__new__">
                          <span className="flex items-center gap-1.5 text-blue-600"><PlusCircle className="w-3.5 h-3.5" />输入新地址</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  }
                  {!useNewAddress && selectedAddressId && (() => {
                    const addr = savedAddresses.find((a) => a.id === selectedAddressId);
                    return addr ?
                      <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs text-gray-600 whitespace-pre-wrap">
                        {addr.full_text || serializeAddressToText(addr)}
                      </div> :
                      null;
                  })()}
                  {(useNewAddress || savedAddresses.length === 0) &&
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs text-gray-500">地址标签</Label>
                        <Input className="mt-1 h-8 text-sm" placeholder="如：家、公司"
                          value={address.label || ""} onChange={(e) => setAddress((p) => ({ ...p, label: e.target.value }))} />
                      </div>
                      <AddressForm value={address} onChange={(v) => setAddress((p) => ({ ...p, ...v }))} />
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={saveAddress} onCheckedChange={(v) => setSaveAddress(!!v)} />
                        <span className="text-xs text-gray-600">保存此地址到地址簿</span>
                      </label>
                    </div>
                  }
                </CardContent>
              </Card>
                );
              })()}

              {/* Option to join existing transit pool */}
              <div className="space-y-2 border border-blue-100 rounded-xl p-3 bg-blue-50/40">
                <Label className="text-xs text-blue-700 font-medium">加入已有的中转拼邮申请（可选）</Label>
                <div className="mt-2">
                  <Popover open={joinExistingPool && !selectedExistingPoolId} onOpenChange={(open) => {
                  if (!open) {
                    setJoinExistingPool(false);
                    setSelectedExistingPoolId("");
                  }
                  }}>
                  <PopoverTrigger asChild>
                    <Button
                    variant="outline"
                    className={`w-full justify-between h-10 ${joinExistingPool ? "border-blue-400 bg-blue-50" : ""}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (selectedExistingPoolId) {
                        // Already selected - clear selection and reopen list to allow re-selection
                        setSelectedExistingPoolId("");
                        setJoinExistingPool(true);
                      } else {
                        // Not selected yet, toggle
                        setJoinExistingPool(!joinExistingPool);
                      }
                    }}>

                      {joinExistingPool && selectedExistingPoolId ?
                    <span className="text-sm">
                          {(() => {
                        const pool = officialPools.find((p) => p.id === selectedExistingPoolId);
                        const titleInfo = pool?.title ? ` - ${pool.title}` : '';
                        const shippingInfo = pool?.transit_shipping_method_name ? ` · ${pool.transit_shipping_method_name}` : '';
                        const weightInfo = pool?.total_weight_g ? ` · ${(pool.total_weight_g / 1000).toFixed(1)}kg` : '';
                        const deadlineInfo = pool?.consolidation_deadline ? ` · 截止：${pool.consolidation_deadline}` : '';
                        return pool ? `${pool.pool_code}${titleInfo}${shippingInfo} · ${(pool.order_ids || []).length} 单${weightInfo}${deadlineInfo}` : "选择拼邮申请";
                      })()}
                        </span> :

                    <span className="text-sm text-gray-500">选择要加入的拼邮申请</span>
                    }
                      <Search className="w-4 h-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput placeholder="搜索拼邮申请..." />
                        <CommandList>
                          {selectedExistingPoolId && (
                            <CommandGroup heading="当前选择">
                              <CommandItem
                                value="__clear_selection__"
                                onSelect={() => {
                                  setSelectedExistingPoolId("");
                                  setJoinExistingPool(false);
                                }}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50">
                                <span className="text-sm font-medium">取消选择</span>
                              </CommandItem>
                            </CommandGroup>
                          )}
                          <CommandGroup heading="我创建的中转拼邮">
                            {(() => {
                            const myPools = officialPools.filter((p) =>
                            p.consolidation_type === 'transit' &&
                            p.creator_email === user.email &&
                            !p.is_admin_created
                            );
                            return myPools.map((pool) =>
                            <CommandItem
                              key={pool.id}
                              value={pool.pool_code}
                              onSelect={() => {
                                if (selectedExistingPoolId === pool.id) {
                                  // Clicking already selected pool - clear selection and close
                                  setSelectedExistingPoolId("");
                                  setJoinExistingPool(false);
                                } else {
                                  // Select new pool - this will auto-close the popover due to open condition
                                  setSelectedExistingPoolId(pool.id);
                                  setJoinExistingPool(true);
                                }
                              }}
                              className="flex flex-col items-start gap-1.5 p-3 h-auto">
                              
                                  <div className="flex items-center justify-between w-full mb-1.5">
                                    <span className="text-sm font-semibold text-gray-800">{pool.pool_code}</span>
                                    {selectedExistingPoolId === pool.id && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                      {pool.transit_location_name || '中转地未设置'}
                                    </Badge>
                                    {pool.transit_shipping_method_name && (
                                      <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200 font-medium">
                                        {pool.transit_shipping_method_name}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-500">
                                    <span>{(pool.order_ids || []).length} 单</span>
                                    {pool.total_weight_g && (
                                      <span>· {(pool.total_weight_g / 1000).toFixed(1)}kg</span>
                                    )}
                                    {pool.consolidation_deadline && (
                                      <span>· 截止：{pool.consolidation_deadline}</span>
                                    )}
                                  </div>
                                  {pool.title &&
                              <span className="text-xs text-gray-600 line-clamp-1 mt-1.5">{pool.title}</span>
                              }
                                </CommandItem>
                            );
                          })()}
                          </CommandGroup>
                          <CommandGroup heading="其他人创建的拼邮">
                            {(() => {
                            const otherPools = officialPools.filter((p) =>
                            p.consolidation_type === 'transit' &&
                            p.creator_email !== user.email &&
                            !p.is_private
                            );
                            
                            // Also include admin-created pools that are not private (any consolidation type)
                            const adminPools = officialPools.filter((p) =>
                            p.is_admin_created &&
                            p.creator_email !== user.email &&
                            !p.is_private
                            );
                            
                            // Combine and deduplicate
                            const combined = [...otherPools];
                            adminPools.forEach((pool) => {
                              if (!combined.find((p) => p.id === pool.id)) {
                                combined.push(pool);
                              }
                            });
                            
                            return combined.map((pool) =>
                            <CommandItem
                              key={pool.id}
                              value={pool.pool_code}
                              onSelect={() => {
                                if (selectedExistingPoolId === pool.id) {
                                  // Clicking already selected pool - clear selection and close
                                  setSelectedExistingPoolId("");
                                  setJoinExistingPool(false);
                                } else {
                                  // Select new pool - this will auto-close the popover due to open condition
                                  setSelectedExistingPoolId(pool.id);
                                  setJoinExistingPool(true);
                                }
                              }}
                              className="flex flex-col items-start gap-1.5 p-3 h-auto">
                              
                                  <div className="flex items-center justify-between w-full mb-1.5">
                                    <span className="text-sm font-semibold text-gray-800">{pool.pool_code}</span>
                                    {selectedExistingPoolId === pool.id && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                      {pool.transit_location_name || '中转地未设置'}
                                    </Badge>
                                    {pool.transit_shipping_method_name && (
                                      <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200 font-medium">
                                        {pool.transit_shipping_method_name}
                                      </Badge>
                                    )}
                                    <Badge variant="outline" className="text-[10px] bg-gray-100 text-gray-600 border-gray-200">
                                      {pool.creator_name || pool.creator_email?.split('@')[0]}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-500">
                                    <span>{(pool.order_ids || []).length} 单</span>
                                    {pool.total_weight_g && (
                                      <span>· {(pool.total_weight_g / 1000).toFixed(1)}kg</span>
                                    )}
                                    {pool.consolidation_deadline && (
                                      <span>· 截止：{pool.consolidation_deadline}</span>
                                    )}
                                  </div>
                                  {pool.title &&
                              <span className="text-xs text-gray-600 line-clamp-1 mt-1.5">{pool.title}</span>
                              }
                                </CommandItem>
                            );
                          })()}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {joinExistingPool && selectedExistingPoolId &&
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 text-xs text-gray-500"
                  onClick={() => {
                    setJoinExistingPool(false);
                    setSelectedExistingPoolId("");
                  }}>
                  
                      清除选择
                    </Button>
                }
                </div>
              </div>
            </>
          }
          
          {/* Official pool selection */}
          {(() => {
            if (consType !== "official_pool") return null;
            
            const adminPools = officialPools.filter(p => p.is_admin_created === true);
            
            return (
          <div className="border border-blue-100 rounded-xl bg-blue-50/40">
            <div className="p-3 border-b border-blue-100">
              <Label className="text-xs text-blue-700 font-medium">选择官方拼邮池</Label>
              <p className="text-[10px] text-gray-500 mt-0.5">管理员创建 · 优惠运费</p>
            </div>
            <div className="p-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between h-9 text-sm"
                  >
                    {selectedPoolId ?
                      <span className="truncate">
                        {(() => {
                          const pool = adminPools.find(p => p.id === selectedPoolId);
                          return pool ? `${pool.pool_code} · ${pool.title || ''}` : '选择拼邮池';
                        })()}
                      </span> :
                      <span className="text-gray-500">🏷️ 默认匹配（自动推荐）</span>
                    }
                    <Search className="w-4 h-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="搜索拼邮池..." className="h-9" />
                    <CommandList className="max-h-[300px]">
                      <CommandEmpty>无匹配的拼邮池</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="default"
                          onSelect={() => setSelectedPoolId("")}
                          className="flex items-center gap-2"
                        >
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${!selectedPoolId ? 'border-blue-600' : 'border-gray-300'}`}>
                            {!selectedPoolId && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">🏷️ 默认匹配</p>
                            <p className="text-xs text-gray-500">自动推荐同运输方式拼邮池</p>
                          </div>
                        </CommandItem>
                        {adminPools.map((pool) => (
                          <CommandItem
                            key={pool.id}
                            value={`${pool.pool_code} ${pool.title || ''} ${pool.shipping_method || ''}`}
                            onSelect={() => setSelectedPoolId(pool.id)}
                            className="flex items-center gap-2"
                          >
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedPoolId === pool.id ? 'border-blue-600' : 'border-gray-300'}`}>
                              {selectedPoolId === pool.id && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold truncate">{pool.pool_code}</span>
                                {pool.consolidation_deadline && (
                                  <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200 flex-shrink-0">
                                    {pool.consolidation_deadline}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                {pool.title && <span className="truncate">{pool.title}</span>}
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <span>{(pool.order_ids?.length || 0)}单</span>
                                  {pool.shipping_method && <span>· {pool.shipping_method}</span>}
                                  {pool.consolidation_min_weight_g && (
                                    <span>· {(pool.consolidation_min_weight_g / 1000).toFixed(1)}kg</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedPoolId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 text-xs text-gray-500 w-full"
                  onClick={() => setSelectedPoolId("")}
                >
                  清除选择，使用默认匹配
                </Button>
              )}
            </div>
          </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Shipping method & date — greyed out when a specific official pool is selected or joining existing pool */}
      <Card className={`border-gray-200 transition-opacity ${specificPoolSelected || joinExistingPool && selectedExistingPoolId ? "opacity-40 pointer-events-none" : ""}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Package className="w-4 h-4" />运输方式
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-gray-500">运输方式 *</Label>
            {(() => {
              // Filter shipping methods based on consType and their enabled settings
              let filteredMethods = shippingMethods;
              if (consType === "") {
                // Direct shipping - only show methods with enabled_for_direct_ship !== false
                filteredMethods = shippingMethods.filter(m => m.enabled_for_direct_ship !== false);
              } else if (consType === "transit") {
                // Transit consolidation - only show methods with enabled_for_user_pool !== false
                filteredMethods = shippingMethods.filter(m => m.enabled_for_user_pool !== false);
              } else if (consType === "official_pool") {
                // Official pool - only show methods with enabled_for_official_pool !== false
                filteredMethods = shippingMethods.filter(m => m.enabled_for_official_pool !== false);
              }
              // Admin whitelist: pre_shipment_allowed_methods (empty = all allowed)
              if (allowedMethodCodes.length > 0) {
                filteredMethods = filteredMethods.filter(m => allowedMethodCodes.includes(m.code) || allowedMethodCodes.includes(m.name));
              }
              
              return (
                <div>
                  {filteredMethods.length > 0 ? (
                    <Select value={shippingMethod} onValueChange={setShippingMethod}>
                      <SelectTrigger className="mt-1 h-9 text-sm">
                        <SelectValue placeholder="选择运输方式..." />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredMethods.map((m) => <SelectItem key={`${m.id}-${m.code}`} value={m.code}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={shippingMethod} onValueChange={setShippingMethod} disabled>
                      <SelectTrigger className="mt-1 h-9 text-sm">
                        <SelectValue placeholder="此发货方式暂无可用运输方式" />
                      </SelectTrigger>
                    </Select>
                  )}
                </div>
              );
            })()}

            <div className="mt-3">
              <Label className="text-xs text-gray-500">期望发货日期（可选）</Label>
              <div className="flex gap-2 mt-1">
                <button type="button"
                  onClick={() => setScheduledDate(scheduledDate === "__asap__" ? "" : "__asap__")}
                  className={`flex items-center gap-1.5 px-3 h-9 rounded-md border text-sm transition-colors ${scheduledDate === "__asap__" ? "border-orange-400 bg-orange-50 text-orange-600 font-medium" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                  ⚡ 尽快
                </button>
                <Input type="date" className="h-9 text-sm flex-1"
                  value={scheduledDate === "__asap__" ? "" : scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address (only for direct shipment) */}
      {consType === "" &&
      <Card className={`border-gray-200 transition-opacity ${joinExistingPool && selectedExistingPoolId ? "opacity-40 pointer-events-none" : ""}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <MapPin className="w-4 h-4" />收货地址
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {savedAddresses.length > 0 &&
          <Select value={useNewAddress ? "__new__" : selectedAddressId || ""} onValueChange={handleAddressSelect}>
                <SelectTrigger><SelectValue placeholder="选择地址簿中的地址" /></SelectTrigger>
                <SelectContent>
                  {savedAddresses.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
                  <SelectItem value="__new__">
                    <span className="flex items-center gap-1.5 text-blue-600"><PlusCircle className="w-3.5 h-3.5" />输入新地址</span>
                  </SelectItem>
                </SelectContent>
              </Select>
          }
            {!useNewAddress && selectedAddressId && (() => {
            const addr = savedAddresses.find((a) => a.id === selectedAddressId);
            return addr ?
            <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs text-gray-600 whitespace-pre-wrap">
                  {addr.full_text || serializeAddressToText(addr)}
                </div> :
            null;
          })()}
            {(useNewAddress || savedAddresses.length === 0) &&
          <div className="space-y-3">
                <div>
                  <Label className="text-xs text-gray-500">地址标签</Label>
                  <Input className="mt-1 h-8 text-sm" placeholder="如：家、公司"
              value={address.label || ""} onChange={(e) => setAddress((p) => ({ ...p, label: e.target.value }))} />
                </div>
                <AddressForm value={address} onChange={(v) => setAddress((p) => ({ ...p, ...v }))} />
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={saveAddress} onCheckedChange={(v) => setSaveAddress(!!v)} />
                  <span className="text-xs text-gray-600">保存此地址到地址簿</span>
                </label>
              </div>
          }
          </CardContent>
        </Card>
      }

      {/* Addons */}
      {availableAddons.length > 0 &&
      <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">发货增值服务（可选）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {availableAddons.map((a) => {
            const isSelected = effectiveSelectedAddonIds.includes(a.id);
            const isCustomizable = a.is_user_customizable;
            return (
              <div key={a.id} className={`rounded-lg border p-2.5 transition-colors ${isSelected ? "border-yellow-400 bg-yellow-50" : "border-gray-200 hover:bg-gray-50"}`}>
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <div className="flex items-center gap-2 flex-1">
                      <Checkbox checked={isSelected}
                    onCheckedChange={(v) => setSelectedAddonIds((prev) => v ? [...prev, a.id] : prev.filter((id) => id !== a.id))} />
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800">{a.name}</span>
                          {isCustomizable &&
                        <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200">用户可自定义</Badge>
                        }
                          {a.description && <span className="text-xs text-gray-400">{a.description}</span>}
                        </div>
                        {isCustomizable &&
                      <span className="text-[10px] text-gray-500">区间：{a.fee_currency || "JPY"} {a.min_fee} - {a.max_fee} · 默认：{Number(a.fee || 0).toLocaleString()}</span>
                      }
                      </div>
                    </div>
                    {!isCustomizable &&
                  <span className="text-xs font-medium text-yellow-700 flex-shrink-0">+{a.fee_currency || "JPY"} {Number(a.fee || 0).toLocaleString()}</span>
                  }
                  </label>
                  {isCustomizable && isSelected &&
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
                        setAddonCustomFees((prev) => ({ ...prev, [a.id]: value }));
                        if (value === '' || value < a.min_fee || value > a.max_fee) {
                          setAddonFeeErrors((prev) => ({ ...prev, [a.id]: value === '' ? '请输入金额' : `请输入${a.min_fee}-${a.max_fee}之间的金额` }));
                        } else {
                          setAddonFeeErrors((prev) => {
                            const newErrors = { ...prev };
                            delete newErrors[a.id];
                            return newErrors;
                          });
                        }
                      }}
                      onClick={(e) => e.stopPropagation()} />
                    
                        <span className="text-xs text-yellow-700">{a.fee_currency || "JPY"}</span>
                      </div>
                      {addonFeeErrors[a.id] &&
                  <span className="text-[10px] text-red-600">{addonFeeErrors[a.id]}</span>
                  }
                    </div>
                }
                </div>);

          })}
          </CardContent>
        </Card>
      }

      {/* One-time payment configuration — only shown when admin has enabled the feature */}
      {fullpayOnceFeatureEnabled && (
        <PreShipmentFormFullPayOnce
          shippingMethods={shippingMethods}
          consType={consType}
          joinExistingPool={joinExistingPool}
          selectedExistingPoolId={selectedExistingPoolId}
          userEstimatedWeight={userEstimatedWeight}
          setUserEstimatedWeight={setUserEstimatedWeight}
          estimatedShippingFee={estimatedShippingFee}
          setEstimatedShippingFee={setEstimatedShippingFee}
          fullPayOnceEnabled={fullPayOnceEnabled}
          setFullPayOnceEnabled={setFullPayOnceEnabled}
          order={order}
          shippingMethod={shippingMethod}
          destinationCountry={address?.country || ""}
          isRestoring={isRestoringData}
          globalEstimateRatePer100g={globalEstimateRate}
          globalEstimateUnitG={globalEstimateUnitG}
          globalEstimateRates={globalEstimateRates}
        />
      )}

      {/* Note */}
      <Card className="border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">备注（可选）</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            onDrop={handleNoteImageDrop}
            onDragOver={(e) => e.preventDefault()}
            onPaste={handleNoteImagePaste}
          >
            <Textarea 
              rows={2} 
              className="text-sm" 
              placeholder="特殊要求、包装说明...（支持粘贴或拖拽上传图片）"
              value={userNote} 
              onChange={(e) => setUserNote(e.target.value)} 
            />
            
            {/* Image upload button */}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="file"
                id="note-image-upload"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleNoteImageUpload(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => document.getElementById('note-image-upload').click()}
                disabled={uploadingImages}
              >
                <Image className="w-3.5 h-3.5 mr-1" />
                {uploadingImages ? '上传中...' : '上传图片'}
              </Button>
            </div>
            
            {/* Uploaded images preview */}
            {noteImages.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {noteImages.map((url) => (
                  <div key={url} className="relative group">
                    <ImageWithViewer src={url} alt="Note attachment" thumbClassName="w-20 h-20 object-cover rounded border" />
                    <button
                      type="button"
                      onClick={() => handleRemoveNoteImage(url)}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment section (if order needs payment) */}
      {(order.payment_status === "awaiting_payment" || order.order_status === "payment_pending") &&
      <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">付款方式</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentMethodSelector
            value={paymentMethod}
            onChange={(m) => setPaymentMethod(m.value)}
            prefetched={paymentMethods.length > 0 ? paymentMethods : null}
            activeColor="border-red-500 bg-red-50 text-red-700" />
          
          </CardContent>
        </Card>
      }

      {/* Actions */}
      <div className="flex gap-3 pb-4">
        <Button
          variant="outline"
          className="flex-1"
          disabled={!canSubmit() || submitting}
          onClick={() => handleSubmit(false)}>
          {submitting ? "保存中..." : "保存预出货信息"}
        </Button>
        <Button
          className="flex-1 bg-red-600 hover:bg-red-700"
          disabled={!canSubmit() || submitting}
          onClick={() => handleSubmit(true)}>
          {submitting ? "保存中..." : "保存信息并付款"}
        </Button>
      </div>
    </div>);

}