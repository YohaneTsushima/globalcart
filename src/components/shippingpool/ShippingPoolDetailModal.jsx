/**
 * ShippingPoolDetailModal
 * Shows full detail of a shipping pool entry.
 * Admin can edit tracking number, actual fee.
 */
import { useState, useEffect, useRef } from "react";
import { X, Package, Edit2, Save, MoreVertical, ArrowRight, RotateCcw, Loader2, Search, Trash2, AlertCircle, CheckCircle, XCircle, CreditCard, ExternalLink, Upload, Truck, MapPin, PlusCircle, MoveRight, Star, ChevronDown, ChevronUp, Layers, Tag } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { openAlipayPopup } from "@/lib/alipayUtils";
import { usePermissions } from "@/hooks/usePermissions";
import { updateOrder, tenantEntity, shippingPoolApi, userPrefApi, fetchTenantConfig } from "@/lib/tenantApi";
// exchangeRates now provided by getShippingPoolDetail response
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ShippingEditModal from "@/components/shippingpool/ShippingEditModal";
import AdminShippingInfoPanel from "@/components/shippingpool/AdminShippingInfoPanel";
import ShippingFeeBreakdown from "@/components/shippingpool/ShippingFeeBreakdown";
import { ImageWithViewer } from "@/components/common/ImageViewer";
import PaymentMethodSelector from "@/components/common/PaymentMethodSelector";
import PaymentProofUploader from "@/components/shippingpool/PaymentProofUploader";
import OrderDetailCard from "@/components/shippingpool/OrderDetailCard";
import OrderDetailPanel from "@/components/shippingpool/OrderDetailPanel";
import TransitShippedPanel from "@/components/shippingpool/TransitShippedPanel";
import UserGroupHeader from "@/components/shippingpool/UserGroupHeader";
import MessageThread from "@/components/common/MessageThread";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";
import ConfirmDialog from "@/components/common/ConfirmDialog";

import { STATUS_CONFIG, METHOD_LABELS } from "./shippingFormConstants";
import AddressForm, { EMPTY_ADDRESS_FORM, serializeAddressToText, isAddressFormValid } from "@/components/common/AddressForm";

export default function ShippingPoolDetailModal({ pool: initialPool, isAdmin, currentUser, pendingEditRequests: initialPendingEdits = [], boxTemplates = [], shippingMethods = [], defaultPackingFeeSingle = 0, defaultPackingFeeConsolidation = 0, allowReadyToShipWithoutPayment = false, allowShipWithoutPaymentSingle = false, allowShipWithoutPaymentUserPool = false, allowShipWithoutPaymentOfficialPool = false, fullpayOnceToleranceJpy = 500, transitHandlingFeeSplit = false, transitLocations = [], transitShippingMethods = [], availableAddons = [], allowUserRewarehouse = false, onClose, onUpdated }) {
  const { can } = usePermissions();
  const canDeleteShipment = isAdmin && can("shipping:delete_shipment_request");
  const canEditPackage = isAdmin && can("shipping:edit_package");
  const canRequestRewarehouse = !isAdmin && can("shipping:request_rewarehouse");
  const canSendShippingMessage = isAdmin || can("message:send_shipping_message");

  const [pool, setPool] = useState(initialPool);
  const [orders, setOrders] = useState([]);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null); // order being edited
  const [editingOrderData, setEditingOrderData] = useState(null); // inline admin order edit
  const [savingOrder, setSavingOrder] = useState(false);
  const [adminEditingOrder, setAdminEditingOrder] = useState(null); // order for move/return ops
  const [showOrderActions, setShowOrderActions] = useState(null); // which order's actions are open
  const [otherPools, setOtherPools] = useState([]); // other pools for moving orders
  const [targetPoolId, setTargetPoolId] = useState("");
  const [actionMode, setActionMode] = useState(null); // 'move' or 'return'
  const [poolSearchQuery, setPoolSearchQuery] = useState("");
  const [editingPool, setEditingPool] = useState(false); // editing pool details
  const [editingPoolData, setEditingPoolData] = useState(null);
  const [savingPool, setSavingPool] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingEdits, setPendingEdits] = useState(initialPendingEdits);
  const [processingEditId, setProcessingEditId] = useState(null);
  const [rewarehouseFeeInputs, setRewarehouseFeeInputs] = useState({}); // reqId -> fee string
  const [composeDragOver, setComposeDragOver] = useState(false);

  // User payment state
  const [paymentMethod, setPaymentMethod] = useState("");
  const paymentMethodRef = useRef("");
  const [selectedMethodMeta, setSelectedMethodMeta] = useState(null);
  const [generatingAlipay, setGeneratingAlipay] = useState(false);
  const [alipayUrl, setAlipayUrl] = useState(null);
  const [showAlipayConfirm, setShowAlipayConfirm] = useState(false);
  const [alipayFormData, setAlipayFormData] = useState(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [confirmingDelivery, setConfirmingDelivery] = useState(false);
  const [showConfirmDeliveryDialog, setShowConfirmDeliveryDialog] = useState(false);
  const [exchangeRates, setExchangeRates] = useState(null);
  const [userCredit, setUserCredit] = useState(null); // {credit_enabled, credit_balance_jpy, credit_limit_jpy}

  const [tenantUserMap, setTenantUserMap] = useState({});
  const [allPoolsMap] = useState({}); // id -> pool_code for target pool display (fallback for pending edits)

  // User-side move/add state
  const [userActionOrder, setUserActionOrder] = useState(null); // order being acted on
  const [userActionMode, setUserActionMode] = useState(null); // 'move' | 'cancel' | 'add'
  const [userTargetPoolId, setUserTargetPoolId] = useState("");
  const [userActionNote, setUserActionNote] = useState("");
  const [userActionPools, setUserActionPools] = useState([]); // other pools available to move to
  const [submittingUserAction, setSubmittingUserAction] = useState(false);
  const [expandedOrderDetails, setExpandedOrderDetails] = useState(null); // order id
  const [showAddOrder, setShowAddOrder] = useState(false);
  const [addableOrders, setAddableOrders] = useState([]); // in_warehouse orders
  const [loadingAddable, setLoadingAddable] = useState(false);
  const [addingOrderId, setAddingOrderId] = useState(null);
  const [addOrderSearch, setAddOrderSearch] = useState("");

  // Per-user preferences editing (non-admin user editing their own addons/transit/note/address in this pool)
  const [editingUserPrefs, setEditingUserPrefs] = useState(false);
  const [userPrefsData, setUserPrefsData] = useState(null); // { selected_addon_ids, transit_method_id, note, address_id }
  const [savingUserPrefs, setSavingUserPrefs] = useState(false);
  const [userSavedAddresses, setUserSavedAddresses] = useState([]);
  const [loadedAddons, setLoadedAddons] = useState(availableAddons || []);

  // Bulk rewarehouse (user-side) state
  const [rewarehouseSelectedIds, setRewarehouseSelectedIds] = useState([]); // order ids selected for bulk rewarehouse
  const [rewarehouseNote, setRewarehouseNote] = useState("");
  const [showBulkRewarehouse, setShowBulkRewarehouse] = useState(false);
  const [submittingBulkRewarehouse, setSubmittingBulkRewarehouse] = useState(false);

  // Convert to "other address" consolidation (for direct shipment pools)
  const [showConvertToOther, setShowConvertToOther] = useState(false);
  const [convertAddressMode, setConvertAddressMode] = useState("saved"); // "saved" | "new"
  const [convertSelectedAddressId, setConvertSelectedAddressId] = useState("");
  const [convertNewAddress, setConvertNewAddress] = useState({ label: "", ...EMPTY_ADDRESS_FORM });
  const [convertSavedAddresses, setConvertSavedAddresses] = useState([]);
  const [convertSaveAddress, setConvertSaveAddress] = useState(false);
  const [submittingConvert, setSubmittingConvert] = useState(false);

  const { user } = useCurrentUser();
  const onSuccessRef = useRef(null);

  useEffect(() => {
    onSuccessRef.current = () => {
      onUpdated?.();
      onClose?.();
    };
  }, [onUpdated, onClose]);

  const subject = `${user?.displayName} - ${pool?.title}`;

  const openConvertToOther = async () => {
    setShowConvertToOther(true);
    setConvertAddressMode("saved");
    setConvertSelectedAddressId("");
    setConvertNewAddress({ label: "", ...EMPTY_ADDRESS_FORM });
    setConvertSaveAddress(false);
    const prefs = await userPrefApi.list({ user_email: currentUser?.email }).catch(() => []);
    const addrs = (prefs[0]?.saved_addresses || []).map(a => ({ ...EMPTY_ADDRESS_FORM, ...a }));
    setConvertSavedAddresses(addrs);
    if (addrs.length === 0) setConvertAddressMode("new");
  };

  const handleConvertToOther = async () => {
    const isNew = convertAddressMode === "new";
    if (isNew && !isAddressFormValid(convertNewAddress)) return;
    if (!isNew && !convertSelectedAddressId) return;
    setSubmittingConvert(true);

    const addr = isNew
      ? convertNewAddress
      : convertSavedAddresses.find(a => a.id === convertSelectedAddressId) || {};

    // Optionally save address
    if (isNew && convertSaveAddress && isAddressFormValid(convertNewAddress)) {
      const prefs = await userPrefApi.list({ user_email: currentUser?.email }).catch(() => []);
      const existing = prefs[0]?.saved_addresses || [];
      const newEntry = { id: `addr_${Date.now()}`, label: convertNewAddress.label || "新地址", full_text: serializeAddressToText(convertNewAddress), ...convertNewAddress };
      if (prefs[0]) {
        await userPrefApi.update(prefs[0].id, { saved_addresses: [...existing, newEntry] });
      } else {
        await userPrefApi.create({ user_email: currentUser?.email, saved_addresses: [newEntry] });
      }
    }

    await shippingPoolApi.update(pool.id, {
      consolidation_type: "other",
      recipient_name: addr.recipient_name || "",
      address_line1: addr.addr1 || "",
      address_line2: addr.addr2 || "",
      city: addr.addr3 || "",
      state: addr.state || "",
      destination_country: addr.country || "",
    });

    setPool(p => ({
      ...p,
      consolidation_type: "other",
      recipient_name: addr.recipient_name || "",
      address_line1: addr.addr1 || "",
      address_line2: addr.addr2 || "",
      city: addr.addr3 || "",
      state: addr.state || "",
      destination_country: addr.country || "",
    }));
    setShowConvertToOther(false);
    setSubmittingConvert(false);
    onUpdated?.();
  };

  const openUserPrefsEditor = async () => {
    const myOrders = orders.filter(o => o.user_email === currentUser?.email);
    const firstOrder = myOrders[0];
    setUserPrefsData({
      selected_addon_ids: firstOrder?.selected_addon_ids || [],
      transit_method_id: firstOrder?.consolidation_transit_shipping_id || pool.transit_shipping_method_id || "",
      note: firstOrder?.user_note || "",
      address_id: firstOrder?.consolidation_final_address_id || "",
    });
    // Load saved addresses and addons in parallel
    const [prefs, addonsRes] = await Promise.all([
      userPrefApi.list({ user_email: currentUser?.email }).catch(() => []),
      loadedAddons.length === 0
      ? fetchTenantConfig().then(cfg => (cfg.addons || []).filter(a => a.addon_type === "shipping" && a.is_active !== false)).catch(() => [])
      : Promise.resolve(loadedAddons),
    ]);
    setUserSavedAddresses(prefs[0]?.saved_addresses || []);
    setLoadedAddons(addonsRes);
    setEditingUserPrefs(true);
  };

  const saveUserPrefs = async () => {
    if (!userPrefsData) return;
    setSavingUserPrefs(true);
    const myOrders = orders.filter(o => o.user_email === currentUser?.email);
    const selectedAddons = loadedAddons.filter(a => userPrefsData.selected_addon_ids.includes(a.id));
    const BUILTIN_TRANSIT = {
      "__pickup__": "自取",
      "__storage__": "暂存",
    };
    const transitMethodName = BUILTIN_TRANSIT[userPrefsData.transit_method_id]
      || transitShippingMethods.find(m => m.id === userPrefsData.transit_method_id)?.name
      || "";
    await Promise.all(myOrders.map(o =>
      updateOrder(o.id, {
        selected_addon_ids: userPrefsData.selected_addon_ids,
        selected_addons: selectedAddons.map(a => ({ id: a.id, name: a.name, fee: a.fee, fee_currency: a.fee_currency })),
        user_note: userPrefsData.note,
        consolidation_final_address_id: userPrefsData.address_id,
        consolidation_transit_shipping_id: userPrefsData.transit_method_id,
        consolidation_transit_shipping_name: transitMethodName,
      })
    ));
    // Refresh orders
    const r = await base44.functions.invoke('getTenantOrders', { pool_id: pool.id });
    const all = r.data?.orders || [];
    setOrders(all.filter(o => (pool.order_ids || []).some(id => String(id) === String(o.id))));
    setEditingUserPrefs(false);
    setSavingUserPrefs(false);
  };

  useEffect(() => {
    // Fetch pool detail (pool + orders + users + rates) in one call
    base44.functions.invoke('shipping/getShippingPoolDetail', { id: pool.id })
      .then((r) => {
        const d = r?.data || {};
        if (d.pool) setPool((p) => ({ ...p, ...d.pool }));
        if (d.orders) setOrders(d.orders);

        // Backend returns single "user" object or "users" map
        if (d.users) {
          setTenantUserMap(d.users);
        } else if (d.user) {
          // Convert single user object to map keyed by email
          const email = d.user.userEmail || d.user.email || d.user.user_email;
          if (email) setTenantUserMap({ [email]: d.user });
        }

        // Backend returns nested { date, jpy: { cny, twd, usr } }
        // Frontend expects flat { jpy_cny, jpy_twd, jpy_usd, ... }
        if (d.rates) {
          const r = d.rates;
          if (r.jpy) {
            setExchangeRates({
              jpy_cny: r.jpy.cny,
              jpy_twd: r.jpy.twd,
              jpy_usd: r.jpy.usd || r.jpy.usr,
              jpy_eur: r.jpy.eur,
              jpy_gbp: r.jpy.gbp,
              jpy_aud: r.jpy.aud,
              jpy_sgd: r.jpy.sgd,
              jpy_hkd: r.jpy.hkd,
            });
          } else {
            setExchangeRates(r);
          }
        }
      })
      .catch((e) => {
        console.error('[PoolModal] Fetch error:', e);
      });

    // Load user credit status for payment panel (non-admin only)
    if (!isAdmin) {
      base44.functions.invoke('manageCreditApplication', { action: 'get_user_credit' })
        .then((r) => setUserCredit(r.data || null))
        .catch(() => {});
    }

    // Mark as read on open
    const myRole = isAdmin ? "admin" : "user";
    if ((pool.unread_roles || []).includes(myRole)) {
      const newRoles = (pool.unread_roles || []).filter((r) => r !== myRole);
      shippingPoolApi.update(pool.id, { unread_roles: newRoles }).catch(() => {});
      setPool((p) => ({ ...p, unread_roles: newRoles }));
    }
  }, []);

  // 监听支付宝回调的 postMessage（PaymentClose 发送）
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data?.type === "alipay_payment_done") {
        toast.success('支付成功');
        onSuccessRef.current?.();
      }
      if (e.data?.type === "alipay_payment_navigate" && e.data.url) {
        window.location.href = e.data.url;
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Fetch other pools for moving orders
  const loadOtherPools = async (order) => {
    setAdminEditingOrder(order);
    setActionMode(null);
    setTargetPoolId("");
    setPoolSearchQuery("");
    base44.functions.invoke('getTenantShippingPools', {}).
    then((r) => {
      const pools = (r.data?.pools || []).filter((p) =>
      p.id !== pool.id && (p.status === "pending" || p.status === "processing")
      );
      setOtherPools(pools);
    }).
    catch(() => setOtherPools([]));
  };

  // User: open move/cancel panel
  const openUserAction = (order, mode) => {
    setUserActionOrder(order);
    setUserActionMode(mode);
    setUserTargetPoolId("");
    setUserActionNote("");
    if (mode === 'move') {
      // Lazy-load available pools for user-side move
      base44.functions.invoke('getTenantShippingPools', {})
        .then((r) => {
          const lockedStatuses = ['awaiting_payment', 'awaiting_payment_confirmation', 'ready_to_ship', 'shipped', 'delivered', 'cancelled'];
          const available = (r.data?.pools || []).filter(p =>
            p.id !== pool.id && !lockedStatuses.includes(p.status)
          );
          setUserActionPools(available);
        })
        .catch(() => setUserActionPools([]));
    }
  };

  const submitUserAction = async (action, orderId, targetPoolId) => {
    setSubmittingUserAction(true);
    await base44.functions.invoke('userMutateShippingPool', {
      action,
      pool_id: pool.id,
      order_id: orderId,
      target_pool_id: targetPoolId || undefined,
      user_note: userActionNote,
    });
    setUserActionOrder(null);
    setUserActionMode(null);
    setSubmittingUserAction(false);
    onUpdated?.();
  };

  // User/Admin: load addable (in_warehouse) orders
  const openAddOrder = async () => {
    setShowAddOrder(true);
    setAddOrderSearch("");
    setLoadingAddable(true);
    const r = await base44.functions.invoke('getTenantOrders', { all: isAdmin });
    const all = r.data?.orders || [];
    // Admins see all in_warehouse orders; users only see their own
    setAddableOrders(
      isAdmin
        ? all.filter(o => o.order_status === 'in_warehouse' && !pool.order_ids?.includes(o.id))
        : all.filter(o => o.order_status === 'in_warehouse' && o.user_email === currentUser?.email && !pool.order_ids?.includes(o.id))
    );
    setLoadingAddable(false);
  };

  const submitAddOrder = async (orderId) => {
    setAddingOrderId(orderId);
    if (isAdmin) {
      // Admin directly mutates the pool
      const order = addableOrders.find(o => o.id === orderId);
      const w = order?.weight_g || 0;
      const updatedIds = [...new Set([...(pool.order_ids || []), orderId])];
      const updatedNames = [...(pool.order_names || []), order?.product_name].filter(Boolean);
      await Promise.all([
        shippingPoolApi.update(pool.id, { order_ids: updatedIds, order_names: updatedNames, total_weight_g: (pool.total_weight_g || 0) + w }),
        updateOrder(orderId, { order_status: 'notified_shipment', consolidation_pool_id: pool.id }),
      ]);
      setPool(p => ({ ...p, order_ids: updatedIds, total_weight_g: (p.total_weight_g || 0) + w }));
      // Add the order to the local orders list so it appears in the task list immediately
      setOrders(prev => [...prev, order]);
    } else {
      await base44.functions.invoke('userMutateShippingPool', {
        action: 'add_order',
        pool_id: pool.id,
        order_id: orderId,
        user_note: '',
      });
    }
    setAddingOrderId(null);
    setShowAddOrder(false);
    onUpdated?.();
  };



  // User: confirm delivery
  const handleConfirmDelivery = async () => {
    setConfirmingDelivery(true);
    const updatedPool = { ...pool, status: "delivered" };
    await shippingPoolApi.update(pool.id, { status: "delivered" });
    await Promise.all(
      (pool.order_ids || []).map(id => updateOrder(id, { order_status: "delivered" }))
    );
    setPool(updatedPool);
    setConfirmingDelivery(false);
    onUpdated?.();
  };

  // Admin panel update callback
  const handleAdminPoolUpdated = (updatedPool) => {
    setPool(updatedPool);
    onUpdated?.();
  };

  // User: pay via credit (deferred billing)
  const handleCreditPayment = async () => {
    const res = await base44.functions.invoke('manageCreditApplication', {
      action: 'use_credit_for_pool',
      pool_id: pool.id,
    });
    if (res.data?.success) {
      // Optimistically update UI — reload pool from backend to get accurate per_user_payments
      const poolsRes = await base44.functions.invoke('getTenantShippingPools', {});
      const freshPool = (poolsRes.data?.pools || []).find(p => p.id === pool.id);
      if (freshPool) setPool(p => ({ ...p, ...freshPool }));
      // Update local credit state
      if (res.data?.new_balance_jpy !== undefined) {
        setUserCredit(c => c ? { ...c, credit_balance_jpy: res.data.new_balance_jpy } : c);
      }
    }
  };

  // User: generate Alipay payment link for shipping fee
  const handleGenerateAlipay = async () => {
    const method = paymentMethodRef.current;
    const payCurrency = selectedMethodMeta?.payment_currency || "JPY";

    // Compute user's fee in JPY (reuse the same logic from currency conversion display)
    const amountJpy = (() => {
      const supplements = pool.supplement_amount_per_user || [];
      const mySupplement = supplements.find(s => s.user_email === currentUser?.email);
      if (mySupplement) return Math.round(mySupplement.supplement_jpy || 0);
      const feeBreakdowns = pool.fee_breakdown_per_user || [];
      const myBreakdown = currentUser?.email
        ? feeBreakdowns.find(b => b.user_email === currentUser?.email)
        : null;
      if (myBreakdown) return Math.round(myBreakdown.total_jpy || 0);
      if (feeBreakdowns.length > 0) return Math.round(feeBreakdowns[0].total_jpy || 0);
      const boxFee = Math.round(parseFloat(pool.box_price_jpy) || 0);
      const shippingFee = Math.round(parseFloat(pool.shipping_fee_jpy) || 0);
      const packingFee = Math.round(parseFloat(pool.packing_fee_jpy) || 0);
      return boxFee + shippingFee + packingFee;
    })();

    // Currency conversion
    let amountToCharge = amountJpy;
    let currencyToSend = "JPY";
    if (payCurrency !== "JPY" && exchangeRates) {
      const rate = exchangeRates[`jpy_${payCurrency.toLowerCase()}`];
      if (rate) {
        amountToCharge = Math.round(amountJpy * rate * 100) / 100;
        currencyToSend = payCurrency;
      }
    }

    const newMethod = {
      payable_amount: amountToCharge,
      method_name: method,
      payment_currency: selectedMethodMeta?.payment_currency,
      payment_currency_type: selectedMethodMeta?.payment_currency,
      prepayment_rate_jpy_cny: exchangeRates?.[`jpy_${payCurrency.toLowerCase()}`],
      provider_key: method
    };

    setGeneratingAlipay(true);
    
    const res = await base44.functions.invoke("alipay/shipping-pool/pay", {
      pool_id: pool.id,
      user_id: user.id,
      subject: subject,
      payment_type: "ship",
      paid_currency: currencyToSend,
      payment_method: newMethod,
      popup_mode: true
    });

    if(!res?.data?.success) {
      toast.error(`下单失败: ${res?.data?.result}`);
      setGeneratingAlipay(false);
      return;
    }

    const formData = res?.data?.form;
    setGeneratingAlipay(false);

    if (formData && typeof formData === 'string') {
      setAlipayFormData(formData);
      setShowAlipayConfirm(true);
    }
  };

  const submitToAlipay = () => {
    openAlipayPopup(alipayFormData);
    setShowAlipayConfirm(false);
    setAlipayFormData(null);
  };

  // User: upload payment proof (non-alipay)
  const handleUploadProof = async (file) => {
    setUploadingProof(true);
    const method = paymentMethodRef.current;
    const { file_url } = await base44.integrations.Core.UploadFile({ file });

    const isConsolidationPool = pool.consolidation_type && pool.consolidation_type !== "";
    const participantEmails = [...new Set((pool.fee_breakdown_per_user || []).map(b => b.user_email))];
    const isMultiUser = isConsolidationPool && participantEmails.length > 1;
    // 已发货的池子补付时不改变发货状态
    const keepStatus = ["ready_to_ship", "shipped", "delivered"].includes(pool.status);

    if (isMultiUser) {
      // Per-user payment: only update this user's entry in per_user_payments
      const existingPayments = pool.per_user_payments || [];
      const myEntry = {
        user_email: currentUser.email,
        payment_status: "awaiting_confirmation",
        payment_method: method,
        payment_proof_url: file_url,
        submitted_at: new Date().toISOString(),
      };
      const updatedPayments = [
        ...existingPayments.filter(p => p.user_email !== currentUser.email),
        myEntry,
      ];
      // Pool-level: set to awaiting_payment_confirmation, payment_status to partial (others may not have paid)
      const allSubmitted = participantEmails.every(email =>
        email === currentUser.email || updatedPayments.find(p => p.user_email === email && p.payment_status === "awaiting_confirmation")
      );
      const newPaymentStatus = allSubmitted ? "awaiting_confirmation" : "partial";
      const newStatus = (allSubmitted && !keepStatus) ? "awaiting_payment_confirmation" : pool.status;
      await shippingPoolApi.update(pool.id, {
        per_user_payments: updatedPayments,
        payment_status: newPaymentStatus,
        status: newStatus,
      });
      setPool(p => ({ ...p, per_user_payments: updatedPayments, payment_status: newPaymentStatus, status: newStatus }));
    } else {
      // Single-user pool: use old global fields
      await shippingPoolApi.update(pool.id, {
        payment_status: "awaiting_confirmation",
        payment_method: method,
        payment_proof_url: file_url,
        ...(keepStatus ? {} : { status: "awaiting_payment_confirmation" }),
      });
      setPool(p => ({ ...p, payment_status: "awaiting_confirmation", payment_method: method, payment_proof_url: file_url, ...(keepStatus ? {} : { status: "awaiting_payment_confirmation" }) }));
    }
    setUploadingProof(false);
  };

  const handlePoolEditSave = async () => {
    if (!editingPoolData) return;
    setSavingPool(true);

    const updateData = {
      user_note: editingPoolData.user_note || "",
      title: editingPoolData.title || "",
      scheduled_ship_date: editingPoolData.scheduled_ship_date || ""
    };
    if (isAdmin) updateData.admin_note = editingPoolData.admin_note || "";

    await shippingPoolApi.update(pool.id, updateData);
    setPool((p) => ({ ...p, ...updateData }));
    setEditingPool(false);
    setSavingPool(false);
  };

  const handleDeletePool = async () => {
    setDeleting(true);
    await Promise.all([
      // Return all orders to warehouse
      ...(pool.order_ids || []).map((id) =>
        updateOrder(id, { order_status: "in_warehouse", consolidation_pool_id: "" })
      ),
      // Auto-resolve all pending edit requests for this pool so they don't linger
      ...pendingEdits
        .filter((r) => r.status === "pending")
        .map((r) => tenantEntity.update("ShippingEditRequest", r.id, { status: "auto_applied" })),
    ]);
    await shippingPoolApi.delete(pool.id);
    setDeleting(false);
    onClose?.();
    onUpdated?.();
  };

  const handleAdminOrderSave = async () => {
    if (!editingOrderData) return;
    setSavingOrder(true);
    await updateOrder(editingOrderData.id, {
      product_name: editingOrderData.product_name,
      weight_g: parseFloat(editingOrderData.weight_g) || 0,
      order_number: editingOrderData.order_number,
      admin_note: editingOrderData.admin_note
    });
    setOrders((prev) => prev.map((o) => o.id === editingOrderData.id ? { ...o, ...editingOrderData } : o));
    setEditingOrderData(null);
    setSavingOrder(false);
  };

  // Move order to another pool
  const handleMoveOrder = async (overrideTargetPoolId) => {
    const effectiveTargetPoolId = overrideTargetPoolId || targetPoolId;
    if (!adminEditingOrder || !effectiveTargetPoolId) return;
    setSavingOrder(true);
    const targetPool = otherPools.find((p) => p.id === effectiveTargetPoolId);
    if (!targetPool) {setSavingOrder(false);return;}

    const poolOrderIds = pool.order_ids || [];
    const removedIdx = poolOrderIds.indexOf(adminEditingOrder.id);
    const updatedOrderIds = poolOrderIds.filter((id) => id !== adminEditingOrder.id);
    const updatedNames = (pool.order_names || []).filter((_, i) => i !== removedIdx);
    const updatedWeight = Math.max(0, (pool.total_weight_g || 0) - (adminEditingOrder.weight_g || 0));
    const targetUpdatedNames = [...(targetPool.order_names || []), adminEditingOrder.product_name].filter(Boolean);

    await Promise.all([
    shippingPoolApi.update(pool.id, { order_ids: updatedOrderIds, order_names: updatedNames, total_weight_g: updatedWeight }),
    shippingPoolApi.update(effectiveTargetPoolId, {
      order_ids: [...(targetPool.order_ids || []), adminEditingOrder.id],
      order_names: targetUpdatedNames,
      total_weight_g: (targetPool.total_weight_g || 0) + (adminEditingOrder.weight_g || 0)
    }),
    updateOrder(adminEditingOrder.id, { consolidation_pool_id: effectiveTargetPoolId, order_status: 'notified_shipment' })]
    );

    setPool((p) => ({ ...p, order_ids: updatedOrderIds, total_weight_g: updatedWeight }));
    setOrders((prev) => prev.filter((o) => o.id !== adminEditingOrder.id));
    setAdminEditingOrder(null);
    setActionMode(null);
    setSavingOrder(false);
  };

  // Return order to warehouse
  const handleReturnOrder = async () => {
    if (!adminEditingOrder) return;
    setSavingOrder(true);
    const poolOrderIds = pool.order_ids || [];
    const removedIdx = poolOrderIds.indexOf(adminEditingOrder.id);
    const updatedOrderIds = poolOrderIds.filter((id) => id !== adminEditingOrder.id);
    const updatedNames = (pool.order_names || []).filter((_, i) => i !== removedIdx);
    const updatedWeight = Math.max(0, (pool.total_weight_g || 0) - (adminEditingOrder.weight_g || 0));

    await Promise.all([
    shippingPoolApi.update(pool.id, { order_ids: updatedOrderIds, order_names: updatedNames, total_weight_g: updatedWeight }),
    updateOrder(adminEditingOrder.id, { order_status: "in_warehouse", consolidation_pool_id: "" })]
    );

    setPool((p) => ({ ...p, order_ids: updatedOrderIds, total_weight_g: updatedWeight }));
    setOrders((prev) => prev.filter((o) => o.id !== adminEditingOrder.id));
    setAdminEditingOrder(null);
    setActionMode(null);
    setSavingOrder(false);
  };

  // Approve or reject a pending ShippingEditRequest
  const handleEditRequest = async (req, action) => {
    setProcessingEditId(req.id);
    let edit_request = {};
    let source_shipping_pool = {};
    let target_shipping_pool = {};
    let order_info = {};

    let editStatus = '';
    let notice_key = '';

    if (action === 'approve') {
      const targetOrderId = req.order_id;
      const w = orders.find((o) => o.id === targetOrderId)?.weight_g || 0;
      if (req.edit_type === 'cancel_shipment') {
        const updatedIds = (pool.order_ids || []).filter((id) => id !== targetOrderId);
        // For rewarehouse requests: write the rewarehouse fee to the order
        const rewarehouseFee = req.is_rewarehouse_request
          ? (parseFloat(rewarehouseFeeInputs[req.id] ?? req.rewarehouse_fee_jpy ?? 0) || 0)
          : 0;
        const orderUpdate = { id: targetOrderId, order_status: 'in_warehouse', consolidation_pool_id: '' };
        if (rewarehouseFee > 0) orderUpdate.rewarehouse_fee_jpy = rewarehouseFee;
        
        source_shipping_pool = {
          id: pool.id,
          order_ids: updatedIds,
          total_weight_g: Math.max(0, (pool.total_weight_g || 0) - w)
        };

        order_info = orderUpdate;

        // await Promise.all([
        // shippingPoolApi.update(pool.id, {
        //   order_ids: updatedIds,
        //   total_weight_g: Math.max(0, (pool.total_weight_g || 0) - w)
        // }),
        // updateOrder(targetOrderId, orderUpdate)]
        // );
        setPool((p) => ({ ...p, order_ids: updatedIds, total_weight_g: Math.max(0, (p.total_weight_g || 0) - w) }));
        setOrders((prev) => prev.filter((o) => o.id !== targetOrderId));
      } else if (req.edit_type === 'move_pool' && req.target_pool_id) {
        const allPoolsRes = await base44.functions.invoke('getTenantShippingPools', {});
        const targetPool = (allPoolsRes.data?.pools || []).find((p) => p.id === req.target_pool_id);
        if (targetPool) {
          const updatedIds = (pool.order_ids || []).filter((id) => id !== targetOrderId);

          source_shipping_pool = {
            id: pool.id,
            order_ids: updatedIds,
            total_weight_g: Math.max(0, (pool.total_weight_g || 0) - w)
          }

          target_shipping_pool = {
            id: req.target_pool_id,
            order_ids: [...new Set([...(targetPool.order_ids || []), targetOrderId])],
            total_weight_g: (targetPool.total_weight_g || 0) + w
          }

          order_info = {
            id: targetOrderId,
            consolidation_pool_id: req.target_pool_id
          }

          // await Promise.all([
          // shippingPoolApi.update(pool.id, {
          //   order_ids: updatedIds,
          //   total_weight_g: Math.max(0, (pool.total_weight_g || 0) - w)
          // }),
          // shippingPoolApi.update(req.target_pool_id, {
          //   order_ids: [...new Set([...(targetPool.order_ids || []), targetOrderId])],
          //   total_weight_g: (targetPool.total_weight_g || 0) + w
          // }),
          // updateOrder(targetOrderId, { consolidation_pool_id: req.target_pool_id })]
          // );
          setPool((p) => ({ ...p, order_ids: updatedIds, total_weight_g: Math.max(0, (p.total_weight_g || 0) - w) }));
          setOrders((prev) => prev.filter((o) => o.id !== targetOrderId));
        }
      } else if (req.edit_type === 'add_to_pool') {
        // Add order into this pool
        const updatedIds = [...new Set([...(pool.order_ids || []), targetOrderId])];

        source_shipping_pool = {
          id: pool.id,
          order_ids: updatedIds,
          total_weight_g: (pool.total_weight_g || 0) + w
        }

        order_info = {
          id: targetOrderId,
          order_status: 'notified_shipment',
          consolidation_pool_id: pool.id
        }

        // await Promise.all([
        //   shippingPoolApi.update(pool.id, {
        //     order_ids: updatedIds,
        //     total_weight_g: (pool.total_weight_g || 0) + w
        //   }),
        //   updateOrder(targetOrderId, { order_status: 'notified_shipment', consolidation_pool_id: pool.id }),
        // ]);
        setPool((p) => ({ ...p, order_ids: updatedIds, total_weight_g: (p.total_weight_g || 0) + w }));
      }
      // await tenantEntity.update('ShippingEditRequest', req.id, { status: 'approved' });
      editStatus = 'approved';
      notice_key = 'order_request_edit_approved';
    } else {
      // await tenantEntity.update('ShippingEditRequest', req.id, { status: 'rejected' });
      editStatus = 'rejected';
      notice_key = 'order_request_edit_rejected';

      order_info = {
        id: req.order_id
      }
    }

    edit_request = {
      id: req.id,
      status: editStatus,
      edit_type: req.edit_type
    }

    let handleUpdateParams = {
      edit_request: edit_request,
      source_shipping_pool: source_shipping_pool,
      target_shipping_pool: target_shipping_pool,
      order_info: order_info,
      notice_key: notice_key,
      display_name: currentUser.displayName
    };

    await tenantEntity.update('ShippingEditRequest', req.id, handleUpdateParams);

    setPendingEdits((prev) => prev.filter((r) => r.id !== req.id));
    setProcessingEditId(null);
    onUpdated?.();
  };

  // Get unique users from orders — prefer display_name from UserPreference, fall back to order's user_name
  const participantUsers = [...new Map(orders.map((o) => [o.user_email || o.user_name, {
    email: o.user_email,
    name: o.user_name || o.user_email
  }])).values()].filter((u) => u.name);

  const status = STATUS_CONFIG[pool.status] || STATUS_CONFIG.pending;

  // 发货后补付：池子已进入发货流程但运费未确认收款，用户仍可付款（付款只更新付款状态，不影响发货状态）
  const feeNotified = (pool.fee_breakdown_per_user || []).length > 0 || (parseFloat(pool.shipping_fee_jpy) || 0) > 0;
  const postShipmentUnpaid = !isAdmin && ["ready_to_ship", "shipped", "delivered"].includes(pool.status) &&
    pool.payment_status !== "paid" && feeNotified;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`text-xs ${status.color}`}>{status.label}</Badge>
              {pool.tracking_number &&
              <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{pool.tracking_number}</span>
              }
              {(initialPool.unread_roles || []).includes(isAdmin ? "admin" : "user") &&
              <Badge className="text-xs bg-red-100 text-red-600 animate-pulse">有新留言</Badge>
              }
            </div>
            <h2 className="font-semibold text-gray-900 mt-1">
              {pool.title || (pool.pool_code ? `发货申请 ${pool.pool_code}` : `发货申请 #${pool.id.slice(-6).toUpperCase()}`)}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {pool.pool_code && <span className="font-mono mr-2 text-gray-500">{pool.pool_code}</span>}
              创建于 {new Date(pool.created_date).toLocaleDateString("zh-CN")}
              {pool.is_private && <span className="ml-2">🔒 不公开</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(isAdmin || currentUser?.email === pool.creator_email) && pool.status !== "shipped" && pool.status !== "delivered" &&
              <button
                onClick={() => {setEditingPool(true);setEditingPoolData(pool);}}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="编辑发货申请">
                <Edit2 className="w-4 h-4" />
              </button>
            }
            {canDeleteShipment && pool.status !== "shipped" && pool.status !== "delivered" &&
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                title="删除发货申请">
                <Trash2 className="w-4 h-4" />
              </button>
            }
            <button onClick={onClose}><X className="w-4 h-4 text-gray-500" /></button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Info grid */}
           <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
             {pool.scheduled_ship_date &&
            <InfoBlock label="计划发货日" value={pool.scheduled_ship_date} />
            }
             {pool.destination_country &&
            <InfoBlock label="目的国家" value={pool.destination_country} />
            }
             {pool.shipping_method &&
            <InfoBlock label="运输方式" value={METHOD_LABELS[pool.shipping_method] || pool.shipping_method} />
            }
             {pool.total_weight_g > 0 &&
            <InfoBlock label="总重量" value={`${pool.total_weight_g}g`} />
            }
             {pool.actual_fee &&
            <InfoBlock label="实际运费" value={`${pool.fee_currency || "JPY"} ${Math.round(pool.actual_fee).toLocaleString()}`} highlight />
            }
             {pool.transit_location_name &&
            <InfoBlock label="中转地" value={pool.transit_location_name} />
            }
           </div>

           {/* Destination address */}
           {(pool.recipient_name || pool.address_line1 || pool.city || pool.country) &&
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 hidden">
               <p className="text-xs text-blue-600 font-medium mb-1">发货目的地</p>
               <div className="text-sm text-blue-800 space-y-0.5">
                 {pool.recipient_name && <p className="font-medium">{pool.recipient_name}</p>}
                 {pool.recipient_phone && <p className="text-xs">{pool.recipient_phone}</p>}
                 <p className="whitespace-pre-wrap">
                   {pool.address_line1}{pool.address_line2 ? ` ${pool.address_line2}` : ""}<br />
                   {pool.city && `${pool.city} `}
                   {pool.state && `${pool.state} `}
                   {pool.postal_code && `${pool.postal_code}`}<br />
                   {pool.country}
                 </p>
               </div>
             </div>
          }

          {/* Selected shipping addons */}
          {((pool.selected_addons || []).length > 0 || (pool.selected_addon_ids || []).length > 0) &&
          <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2.5">
              <p className="text-xs text-yellow-700 font-medium mb-1.5">发货增值服务</p>
              <div className="space-y-1">
                {(pool.selected_addons || []).length > 0 ?
              pool.selected_addons.map((a, i) =>
              <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700">{a.service_name || a.id}</span>
                        {parseFloat(a.fee) > 0 &&
                <span className="font-medium text-yellow-700">+{a.fee_currency || "JPY"} {Math.round(parseFloat(a.fee))}</span>
                }
                      </div>
              ) :
              (pool.selected_addon_ids || []).map((id, i) =>
              <div key={i} className="text-xs text-gray-500 font-mono">{id}</div>
              )
              }
              </div>
            </div>
          }

          {/* Items list */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">包裹清单 ({(pool.order_ids || []).length} 件)</h3>
            {orders.length > 0 ? (() => {
              // Group orders by user email; single-user pools render flat (no group header)
              const userEmails = [...new Set(orders.map(o => o.user_email || "__unknown__"))];
              const isMultiUser = userEmails.length > 1;
              const grouped = userEmails.map(email => ({
                email,
                orders: orders.filter(o => (o.user_email || "__unknown__") === email),
              }));

              const isRewarehousePool = canRequestRewarehouse && allowUserRewarehouse && (pool.status === "awaiting_payment" || pool.status === "awaiting_payment_confirmation");

              const renderOrder = (o) => {
                const isEditingThis = editingOrderData?.id === o.id;
                const canSeeDetail = isAdmin || o.user_id === currentUser?.id;
                const isMyOrder = o.user_id === currentUser?.id;
                const isRWSel = rewarehouseSelectedIds.includes(o.id);
                const hasPendingRW = pendingEdits.some(r => r.order_id === o.id && r.is_rewarehouse_request);

                return (
                  <div key={o.id} className={`rounded-lg border transition-colors ${isEditingThis ? "border-blue-200 bg-blue-50" : isRWSel ? "border-orange-300 bg-orange-50" : "border-transparent bg-gray-50"}`}>
                    {isEditingThis ?
                  <div className="px-3 py-2.5 space-y-2">
                        <div>
                          <Label className="text-xs text-gray-500">管理员备注</Label>
                          <Input className="h-7 text-xs mt-0.5" value={editingOrderData.admin_note || ""}
                      onChange={(e) => setEditingOrderData((d) => ({ ...d, admin_note: e.target.value }))} />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => setEditingOrderData(null)}>取消</Button>
                          <Button size="sm" className="h-6 text-xs px-2 bg-blue-600 hover:bg-blue-700" onClick={handleAdminOrderSave} disabled={savingOrder}>
                            <Save className="w-3 h-3 mr-1" />{savingOrder ? "保存中..." : "保存"}
                          </Button>
                        </div>
                      </div> :

                  <div className="space-y-2 px-3 py-2">
                        <div className="flex items-start gap-3">
                          <div className="flex gap-2 flex-shrink-0">
                            {canSeeDetail && o.product_image_url &&
                        <ImageWithViewer src={o.product_image_url} alt="产品图片">
                                <img src={o.product_image_url} alt="" className="w-12 h-12 rounded object-cover border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity" />
                              </ImageWithViewer>
                        }
                            {canSeeDetail && (o.arrival_photo_url || o.storage_image)&&
                        <ImageWithViewer src={o.arrival_photo_url || o.storage_image} alt="入库图片">
                                <img src={o.arrival_photo_url || o.storage_image} alt="" className="w-12 h-12 rounded object-cover border border-blue-200 cursor-pointer hover:opacity-80 transition-opacity" title="入库图片" />
                              </ImageWithViewer>
                        }
                            {!canSeeDetail && (
                              <div className="w-12 h-12 rounded bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                                <Package className="w-5 h-5 text-gray-300" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 truncate">
                              {canSeeDetail ? o.product_name : "他人包裹"}
                            </p>
                            <p className="text-xs text-gray-400">
                              {canSeeDetail ? o.order_number : "—"} · {o.weight_g || 0}g
                              {isAdmin && o.id ? ` · ${tenantUserMap[o.user_email]?.display_name || tenantUserMap[o.user_email]?.full_name || o.user_name || ""}` : ""}
                            </p>
                              

                          
                              

                          
                            </div>
                            <div className="flex items-center gap-1">
                              <OrderDetailPanel order={o} pool={pool} />
                              {/* Admin can edit any order */}
                              {canEditPackage && pool.status !== "shipped" && pool.status !== "delivered" &&
                          <div className="flex items-center gap-1">
                                  <button
                              onClick={() => setEditingOrderData({ ...o })}
                              className="flex-shrink-0 p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                              title="编辑包裹信息">
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                              onClick={() => {setShowOrderActions(showOrderActions === o.id ? null : o.id);if (showOrderActions !== o.id) loadOtherPools(o);}}
                              className="flex-shrink-0 p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                              title="更多操作">
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                          }
                              {isRewarehousePool && isMyOrder && !hasPendingRW && (
                                <Checkbox checked={isRWSel} onCheckedChange={v => setRewarehouseSelectedIds(prev => v ? [...prev, o.id] : prev.filter(id => id !== o.id))} className="flex-shrink-0" />
                              )}
                              {isRewarehousePool && isMyOrder && hasPendingRW && (
                                <span className="text-xs text-orange-500 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">审批中</span>
                              )}
                              {/* User can edit/move their own orders */}
                              {!isAdmin && o.user_email === currentUser?.email && pool.status !== "shipped" && pool.status !== "delivered" && pool.status !== "awaiting_payment" && pool.status !== "awaiting_payment_confirmation" && pool.status !== "ready_to_ship" &&
                          <button
                                    onClick={() => openUserAction(o, userActionOrder?.id === o.id && userActionMode ? null : 'menu')}
                                    className="flex-shrink-0 p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                                    title="移动/取消出货">
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  </button>
                          }
                            </div>
                          </div>
                        </div>
                    }
                      {/* User actions panel */}
                      {!isAdmin && userActionOrder?.id === o.id && userActionMode && (
                        <div className="border-t border-gray-100 bg-gray-50 px-3 py-2.5 space-y-2">
                          {userActionMode === 'menu' ? (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="flex-1 h-6 text-xs gap-1"
                                onClick={() => openUserAction(o, 'move')}>
                                <MoveRight className="w-3 h-3" />移到其它发货申请
                              </Button>
                              <Button size="sm" variant="outline" className="flex-1 h-6 text-xs gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                                onClick={() => openUserAction(o, 'cancel')}>
                                <RotateCcw className="w-3 h-3" />取消出货/重新入库
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 text-xs px-2"
                                onClick={() => setUserActionOrder(null)}>✕</Button>
                            </div>
                          ) : userActionMode === 'move' ? (
                            <div className="space-y-2">
                              <p className="text-xs text-gray-500">选择目标发货申请：</p>
                              {userActionPools.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-2">无其他可用发货申请</p>
                              ) : (
                                <div className="max-h-28 overflow-y-auto space-y-1">
                                  {userActionPools.map(p => (
                                    <button key={p.id}
                                      onClick={() => setUserTargetPoolId(p.id)}
                                      className={`w-full text-left px-2 py-1.5 rounded text-xs border transition-colors ${userTargetPoolId === p.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'}`}>
                                      <span className="font-mono text-gray-700">{p.pool_code || p.id.slice(-6).toUpperCase()}</span>
                                      {p.title && <span className="text-gray-400 ml-1.5">{p.title}</span>}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <Textarea rows={2} placeholder="备注（可选）" className="text-xs h-12"
                                value={userActionNote} onChange={e => setUserActionNote(e.target.value)} />
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="h-6 text-xs flex-1"
                                  onClick={() => setUserActionMode('menu')}>返回</Button>
                                <Button size="sm" className="h-6 text-xs flex-1 bg-blue-600 hover:bg-blue-700"
                                  disabled={!userTargetPoolId || submittingUserAction}
                                  onClick={() => submitUserAction('move_order', o.id, userTargetPoolId)}>
                                  {submittingUserAction ? <Loader2 className="w-3 h-3 animate-spin" /> : '确认移动'}
                                </Button>
                              </div>
                            </div>
                          ) : userActionMode === 'cancel' ? (
                            <div className="space-y-2 bg-orange-50 border border-orange-100 rounded px-2 py-2">
                              <p className="text-xs text-orange-700">确认取消此包裹的出货？包裹将重新变为"已入库"状态。</p>
                              <Textarea rows={2} placeholder="取消原因（可选）" className="text-xs h-12 bg-white"
                                value={userActionNote} onChange={e => setUserActionNote(e.target.value)} />
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="flex-1 h-6 text-xs"
                                  onClick={() => setUserActionMode('menu')}>返回</Button>
                                <Button size="sm" className="flex-1 h-6 text-xs bg-orange-600 hover:bg-orange-700"
                                  disabled={submittingUserAction}
                                  onClick={() => submitUserAction('cancel_order', o.id)}>
                                  {submittingUserAction ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                                  确认取消
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}

                      {/* Admin actions panel */}
                      {isAdmin && showOrderActions === o.id &&
                    <div className="border-t border-gray-100 bg-gray-50 px-3 py-2.5 space-y-2">
                          {actionMode === null ?
                      <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="flex-1 h-6 text-xs gap-1"
                        onClick={() => {loadOtherPools(o);setActionMode('move');}}>
                                <ArrowRight className="w-3 h-3" />移动到其他发货申请
                              </Button>
                              <Button size="sm" variant="outline" className="flex-1 h-6 text-xs gap-1"
                        onClick={() => {setAdminEditingOrder(o);setActionMode('return');}}>
                                <RotateCcw className="w-3 h-3" />重新入库
                              </Button>
                            </div> :
                      actionMode === 'move' ?
                      <div className="space-y-2">
                              <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                <Input placeholder="搜索发货申请..." className="pl-8 h-7 text-xs" value={poolSearchQuery} onChange={e => setPoolSearchQuery(e.target.value)} />
                              </div>
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {otherPools.length === 0 ?
                              <p className="text-xs text-gray-400 text-center py-2">无可用的发货申请</p> :
                              (() => {
                              const q = poolSearchQuery.trim().toLowerCase();
                              const filtered = q ? otherPools.filter(p => (p.pool_code || '').toLowerCase().includes(q) || (p.title || '').toLowerCase().includes(q)) : otherPools;
                              if (filtered.length === 0) return <p className="text-xs text-gray-400 text-center py-2">无匹配结果</p>;
                              return filtered.map(p => (
                              <button
                              key={p.id}
                              onClick={() => {setTargetPoolId(p.id);handleMoveOrder(p.id);}}
                              disabled={savingOrder}
                              className="w-full text-left px-2 py-1.5 rounded text-xs border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors disabled:opacity-50">
                                     <div className="flex items-center justify-between gap-2">
                                       <span className="font-mono text-gray-600">{p.pool_code}</span>
                                       {p.title && <span className="text-gray-400 truncate flex-1">{p.title}</span>}
                                       {savingOrder && targetPoolId === p.id && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
                                     </div>
                                   </button>
                              ));
                              })()
                              }
                              </div>
                              <Button size="sm" variant="outline" className="w-full h-6 text-xs"
                        onClick={() => setActionMode(null)}>取消</Button>
                            </div> :
                      actionMode === 'return' ?
                      <div className="space-y-2 bg-orange-50 border border-orange-100 rounded px-2 py-2">
                              <p className="text-xs text-orange-700">确认重新入库此订单？订单状态将变为"已入库"。</p>
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="flex-1 h-6 text-xs"
                          onClick={() => setActionMode(null)}>取消</Button>
                                <Button size="sm" className="flex-1 h-6 text-xs bg-orange-600 hover:bg-orange-700"
                          onClick={handleReturnOrder} disabled={savingOrder}>
                                  {savingOrder ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                                  确认入库
                                </Button>
                              </div>
                            </div> :
                      null}
                        </div>
                    }
                    </div>
                    );
              }; // end renderOrder

              const isConsolidation = pool.consolidation_type && pool.consolidation_type !== "";

              return (
                <div className="space-y-3">
                  {grouped.map(({ email, orders: groupOrders }) => {
                    const userData = tenantUserMap[email] || {};
                    const displayName = userData.display_name || userData.full_name || email;
                    const groupWeight = groupOrders.reduce((s, o) => s + (o.weight_g || 0), 0);
                    const isMyGroup = email === currentUser?.email;
                    // Aggregate addons from this user's orders — deduplicated per user
                    const uniqueGroupAddons = [...new Map(
                      groupOrders.flatMap(o => o.selected_addons || []).map(a => [a.id || a.name, a])
                    ).values()];
                    // Transit method name
                    const transitMethodId = groupOrders[0]?.consolidation_transit_shipping_id || pool.transit_shipping_method_id || "";
                    const transitMethodName = transitShippingMethods.find(m => m.id === transitMethodId)?.name || "";
                    // Final address label
                    const finalAddrId = groupOrders[0]?.consolidation_final_address_id || "";
                    const canEditPrefs = !isAdmin && isMyGroup && isConsolidation &&
                      pool.status !== "shipped" && pool.status !== "delivered" &&
                      pool.status !== "awaiting_payment" && pool.status !== "awaiting_payment_confirmation" && pool.status !== "ready_to_ship";

                    return (
                      <div key={email}>
                        {isMultiUser && (
                          <UserGroupHeader
                            userData={userData}
                            displayName={displayName}
                            groupOrders={groupOrders}
                            groupWeight={groupWeight}
                            uniqueGroupAddons={uniqueGroupAddons}
                            transitMethodId={transitMethodId}
                            transitMethodName={transitMethodName}
                            canEditPrefs={canEditPrefs}
                            editingUserPrefs={editingUserPrefs}
                            openUserPrefsEditor={openUserPrefsEditor}
                            setEditingUserPrefs={setEditingUserPrefs}
                            isRewarehousePool={isRewarehousePool}
                            isMyGroup={isMyGroup}
                            pendingEdits={pendingEdits}
                            rewarehouseSelectedIds={rewarehouseSelectedIds}
                            setRewarehouseSelectedIds={setRewarehouseSelectedIds}
                            setShowBulkRewarehouse={setShowBulkRewarehouse}
                          />
                        )}
                        <div className="space-y-1.5">
                          {groupOrders.map(o => renderOrder(o))}
                        </div>
                        {/* Inline user prefs editor — only for current user's group */}
                        {canEditPrefs && editingUserPrefs && isMyGroup && userPrefsData && (
                          <div className="mt-2 border border-blue-200 rounded-xl overflow-hidden bg-blue-50/30">
                            <div className="flex items-center justify-between bg-blue-50 px-3 py-2 border-b border-blue-100">
                              <span className="text-xs font-medium text-blue-700 flex items-center gap-1.5">
                                <Edit2 className="w-3.5 h-3.5" />编辑我的发货偏好
                              </span>
                              <button onClick={() => setEditingUserPrefs(false)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                            </div>
                            <div className="p-3 space-y-3">
                              {/* Addons */}
                              {loadedAddons.length > 0 && (
                                <div>
                                  <label className="text-xs text-gray-500 font-medium block mb-1.5 flex items-center gap-1"><Star className="w-3 h-3" />发货增值服务</label>
                                  <div className="space-y-1.5">
                                    {loadedAddons.map(a => (
                                      <label key={a.id} className={`flex items-center justify-between gap-2 p-2 rounded-lg border cursor-pointer transition-colors text-xs ${userPrefsData.selected_addon_ids.includes(a.id) ? "border-yellow-400 bg-yellow-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
                                        <div className="flex items-center gap-2">
                                          <Checkbox
                                            checked={userPrefsData.selected_addon_ids.includes(a.id)}
                                            onCheckedChange={v => setUserPrefsData(d => ({
                                              ...d,
                                              selected_addon_ids: v ? [...d.selected_addon_ids, a.id] : d.selected_addon_ids.filter(id => id !== a.id)
                                            }))}
                                          />
                                          <span className="text-gray-700">{a.name}</span>
                                          {a.description && <span className="text-gray-400">{a.description}</span>}
                                        </div>
                                        {a.fee > 0 && <span className="text-yellow-700 font-medium flex-shrink-0">+{a.fee_currency || "JPY"} {Number(a.fee).toLocaleString()}</span>}
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {/* Transit shipping method */}
                              <div>
                                <label className="text-xs text-gray-500 font-medium block mb-1.5 flex items-center gap-1"><Truck className="w-3 h-3" />中转段运输方式（可选）</label>
                                <div className="space-y-1">
                                  <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors text-xs ${!userPrefsData.transit_method_id ? "border-gray-400 bg-gray-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
                                    <input type="radio" checked={!userPrefsData.transit_method_id}
                                      onChange={() => setUserPrefsData(d => ({ ...d, transit_method_id: "" }))}
                                      className="accent-blue-600" />
                                    <span className="text-gray-400">不指定</span>
                                  </label>
                                  {[
                                    { id: "__pickup__", name: "自取", description: "到中转地自行取货", fee: 0 },
                                    { id: "__storage__", name: "暂存", description: "货品暂存于中转地", fee: 0 },
                                    ...transitShippingMethods,
                                  ].map(m => (
                                    <label key={m.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors text-xs ${userPrefsData.transit_method_id === m.id ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
                                      <input type="radio" checked={userPrefsData.transit_method_id === m.id}
                                        onChange={() => setUserPrefsData(d => ({ ...d, transit_method_id: m.id }))}
                                        className="accent-blue-600" />
                                      <span className="text-gray-700">{m.name}</span>
                                      {m.description && <span className="text-gray-400 ml-1">{m.description}</span>}
                                      {m.fee > 0 && <span className="text-blue-600 ml-auto flex-shrink-0">{m.fee_currency || "CNY"} {m.fee}</span>}
                                    </label>
                                  ))}
                                </div>
                              </div>
                              {/* Final address — select only from saved addresses, no new entry */}
                              {userSavedAddresses.length > 0 && (
                                <div>
                                  <label className="text-xs text-gray-500 font-medium block mb-1.5 flex items-center gap-1"><MapPin className="w-3 h-3" />最终收货地址</label>
                                  <Select value={userPrefsData.address_id || ""} onValueChange={v => setUserPrefsData(d => ({ ...d, address_id: v }))}>
                                    <SelectTrigger className="h-8 text-xs bg-white"><SelectValue placeholder="选择收货地址" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={null}>不指定（使用默认）</SelectItem>
                                      {userSavedAddresses.map(a => (
                                        <SelectItem key={a.id} value={a.id}>{a.label || a.full_text?.split("\n")[0] || a.id}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {userPrefsData.address_id && (() => {
                                    const addr = userSavedAddresses.find(a => a.id === userPrefsData.address_id);
                                    return addr?.full_text ? (
                                      <div className="mt-1 text-xs text-gray-500 bg-white border border-gray-100 rounded px-2 py-1.5 whitespace-pre-wrap">{addr.full_text}</div>
                                    ) : null;
                                  })()}
                                </div>
                              )}
                              {/* Note */}
                              <div>
                                <label className="text-xs text-gray-500 font-medium block mb-1">备注</label>
                                <Textarea rows={2} className="text-xs bg-white" placeholder="特殊要求或补充说明..."
                                  value={userPrefsData.note} onChange={e => setUserPrefsData(d => ({ ...d, note: e.target.value }))} />
                              </div>
                              <div className="flex gap-2 justify-end">
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingUserPrefs(false)}>取消</Button>
                                <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700" onClick={saveUserPrefs} disabled={savingUserPrefs}>
                                  <Save className="w-3 h-3 mr-1" />{savingUserPrefs ? "保存中..." : "保存"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })() :

                    <p className="text-xs text-gray-400">加载中...</p>
            }
          </div>

          {/* Add more orders to this pool — users on their own pending pools; admins on any pending pool they created or that is non-private */}
          {pool.status === "pending" && (isAdmin ? (!pool.is_private || pool.creator_email === currentUser?.email) : true) && (
            <div>
              {/* Address/addon notice for non-admin users */}
              {!isAdmin && !showAddOrder && (() => {
                const isOwnOrDirect = !pool.consolidation_type || pool.consolidation_type === "" || pool.creator_email === currentUser?.email;
                if (isOwnOrDirect) {
                  return (
                    <div className="mb-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
                      📦 加入后，此包裹将适用本发货申请的收货地址及发货增值服务。
                    </div>
                  );
                } else {
                  return (
                    <div className="mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                      ⚠️ 这是他人发起的拼邮申请。加入后，此包裹的最终收货地址将使用您<strong>个人偏好中地址簿设定的默认地址</strong>（在实际发货时读取），而非本申请的收货地址。
                    </div>
                  );
                }
              })()}
              {!showAddOrder ? (
                <button
                  onClick={openAddOrder}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 border border-dashed border-blue-200 hover:border-blue-400 rounded-lg px-3 py-2 w-full justify-center transition-colors bg-blue-50/30 hover:bg-blue-50">
                  <PlusCircle className="w-3.5 h-3.5" />{isAdmin ? '添加已入库订单到此发货申请' : '添加我的包裹到此发货申请'}
                </button>
              ) : (
                <div className="border border-blue-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between bg-blue-50 px-3 py-2 border-b border-blue-100">
                    <span className="text-xs font-medium text-blue-700 flex items-center gap-1.5">
                      <PlusCircle className="w-3.5 h-3.5" />{isAdmin ? '选择已入库订单加入此发货申请' : '从我的已入库订单中选择'}
                    </span>
                    <button onClick={() => setShowAddOrder(false)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                  </div>
                  <div className="p-3">
                    {!loadingAddable && addableOrders.length > 0 && (
                      <div className="relative mb-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <Input placeholder="搜索商品名称或订单号..." className="pl-8 h-7 text-xs" value={addOrderSearch} onChange={e => setAddOrderSearch(e.target.value)} />
                      </div>
                    )}
                    {loadingAddable ? (
                      <p className="text-xs text-gray-400 text-center py-3">加载中...</p>
                    ) : addableOrders.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">暂无可加入的已入库订单</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {(() => {
                          const q = addOrderSearch.trim().toLowerCase();
                          const filtered = q ? addableOrders.filter(o => (o.product_name || '').toLowerCase().includes(q) || (o.order_number || '').toLowerCase().includes(q)) : addableOrders;
                          if (filtered.length === 0) return <p className="text-xs text-gray-400 text-center py-2">无匹配结果</p>;
                          return filtered.map(o => (
                            <div key={o.id} className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg border border-gray-100 hover:bg-gray-50">
                              {(() => { const img = o.product_image_url || o.purchase_screenshot_url || o.arrival_photo_url; return img ? <ImageWithViewer src={img} alt="包裹图片"><img src={img} alt="" className="w-10 h-10 rounded object-cover border border-gray-200 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity" /></ImageWithViewer> : <div className="w-10 h-10 rounded bg-gray-100 flex-shrink-0" />; })()}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-gray-800 truncate">{o.product_name}</p>
                                <p className="text-xs text-gray-400">
                                  {o.order_number} · {o.weight_g || 0}g
                                  {isAdmin && o.user_email && <span className="ml-1.5 text-gray-500">{tenantUserMap[o.user_email]?.display_name || tenantUserMap[o.user_email]?.full_name || o.user_name || o.user_email}</span>}
                                </p>
                              </div>
                              <Button size="sm" className="h-6 text-xs px-2 bg-blue-600 hover:bg-blue-700 flex-shrink-0"
                                disabled={addingOrderId === o.id}
                                onClick={() => submitAddOrder(o.id)}>
                                {addingOrderId === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : '加入'}
                              </Button>
                            </div>
                          ));
                        })()}
                      </div>
                    )}

                  </div>
                </div>
              )}
            </div>
          )}

          {/* Convert direct shipment to "other address" consolidation — user-initiated, only for pending direct pools they created */}
          {!isAdmin && !pool.consolidation_type && pool.creator_email === currentUser?.email && pool.status === "pending" && (
            <div>
              {!showConvertToOther ? (
                <button
                  onClick={openConvertToOther}
                  className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 border border-dashed border-purple-200 hover:border-purple-400 rounded-lg px-3 py-2 w-full justify-center transition-colors bg-purple-50/30 hover:bg-purple-50">
                  <Layers className="w-3.5 h-3.5" />转为拼邮到其它地址
                </button>
              ) : (
                <div className="border border-purple-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between bg-purple-50 px-3 py-2 border-b border-purple-100">
                    <span className="text-xs font-medium text-purple-700 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />转为拼邮到其它地址
                    </span>
                    <button onClick={() => setShowConvertToOther(false)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                  </div>
                  <div className="p-3 space-y-3">
                    <p className="text-xs text-gray-500">此操作将把当前单独发货申请转为"拼邮到其它地址"模式，其他用户可以申请加入。请先填写目标拼邮地址。</p>
                    {/* Address selection */}
                    {convertSavedAddresses.length > 0 && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConvertAddressMode("saved")}
                          className={`flex-1 h-7 rounded-md border text-xs font-medium transition-colors ${convertAddressMode === "saved" ? "border-purple-400 bg-purple-50 text-purple-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                          从地址簿选择
                        </button>
                        <button
                          onClick={() => setConvertAddressMode("new")}
                          className={`flex-1 h-7 rounded-md border text-xs font-medium transition-colors ${convertAddressMode === "new" ? "border-purple-400 bg-purple-50 text-purple-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                          输入新地址
                        </button>
                      </div>
                    )}
                    {convertAddressMode === "saved" && convertSavedAddresses.length > 0 ? (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {convertSavedAddresses.map(a => (
                          <label key={a.id} className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors text-xs ${convertSelectedAddressId === a.id ? "border-purple-400 bg-purple-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
                            <input type="radio" checked={convertSelectedAddressId === a.id} onChange={() => setConvertSelectedAddressId(a.id)} className="mt-0.5 accent-purple-600 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-gray-700">{a.label}</p>
                              <p className="text-gray-400 whitespace-pre-wrap mt-0.5">{a.full_text || serializeAddressToText(a)}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-gray-500 font-medium block mb-1">地址标签</label>
                          <Input className="h-7 text-xs" placeholder="如：家、公司"
                            value={convertNewAddress.label}
                            onChange={e => setConvertNewAddress(p => ({ ...p, label: e.target.value }))} />
                        </div>
                        <AddressForm value={convertNewAddress} onChange={v => setConvertNewAddress(p => ({ ...p, ...v }))} />
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox checked={convertSaveAddress} onCheckedChange={v => setConvertSaveAddress(!!v)} />
                          <span className="text-xs text-gray-600">保存此地址到地址簿</span>
                        </label>
                      </div>
                    )}
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowConvertToOther(false)}>取消</Button>
                      <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700"
                        disabled={submittingConvert || (convertAddressMode === "saved" ? !convertSelectedAddressId : !isAddressFormValid(convertNewAddress))}
                        onClick={handleConvertToOther}>
                        {submittingConvert ? "提交中..." : "确认转换"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pending Edit Requests - Admin view */}
          {isAdmin && pendingEdits.length > 0 &&
          <div className="border border-orange-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 bg-orange-50 px-4 py-2.5 border-b border-orange-200">
                <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0" />
                <span className="text-sm font-medium text-orange-700">待审批的更改申请 ({pendingEdits.length})</span>
              </div>
              <div className="divide-y divide-orange-50">
                {pendingEdits.map((req) =>
              <div key={req.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-medium text-gray-700">{req.user_email}</span>
                          <Badge className={`text-xs ${req.edit_type === 'cancel_shipment' ? 'bg-red-100 text-red-700' : req.edit_type === 'add_to_pool' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {req.is_rewarehouse_request ? '申请再入库（待付运费）' : req.edit_type === 'cancel_shipment' ? '申请重新入库' : req.edit_type === 'add_to_pool' ? '申请加入此发货申请' : '申请移至其他发货申请'}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          订单：{orders.find((o) => o.id === req.order_id)?.product_name || req.order_id}
                        </p>
                        {req.edit_type === 'move_pool' && req.target_pool_id &&
                    <p className="text-xs text-gray-400 mt-0.5">
                            目标：<span className="font-mono text-gray-600">{allPoolsMap[req.target_pool_id]?.pool_code || req.target_pool_id.slice(-6).toUpperCase()}</span>
                          </p>
                    }
                        {req.user_note &&
                    <p className="text-xs text-gray-500 mt-0.5 italic">"{req.user_note}"</p>
                    }
                        {req.is_rewarehouse_request && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-orange-600 font-medium">再处理费 (JPY)：</span>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              className="h-7 w-24 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              value={rewarehouseFeeInputs[req.id] ?? (req.rewarehouse_fee_jpy || "")}
                              onChange={e => setRewarehouseFeeInputs(prev => ({ ...prev, [req.id]: e.target.value }))}
                            />
                            <span className="text-xs text-gray-400">审批时写入订单</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button
                      size="sm"
                      className="h-7 text-xs bg-green-600 hover:bg-green-700 px-2"
                      disabled={processingEditId === req.id}
                      onClick={() => handleEditRequest(req, 'approve')}>
                          {processingEditId === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                          批准
                        </Button>
                        <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs px-2 border-red-200 text-red-600 hover:bg-red-50"
                      disabled={processingEditId === req.id}
                      onClick={() => handleEditRequest(req, 'reject')}>
                          <XCircle className="w-3 h-3 mr-1" />拒绝
                        </Button>
                      </div>
                    </div>
                  </div>
              )}
              </div>
            </div>
          }

          {/* Pending Edit Requests - User view (read-only) */}
          {!isAdmin && pendingEdits.length > 0 &&
          <div className="border border-orange-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 bg-orange-50 px-4 py-2.5 border-b border-orange-200">
                <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0" />
                <span className="text-sm font-medium text-orange-700">更改申请处理中</span>
              </div>
              <div className="divide-y divide-orange-50">
                {pendingEdits.map((req) =>
              <div key={req.id} className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge className="text-xs bg-orange-100 text-orange-700">待管理员审批</Badge>
                      <Badge className={`text-xs ${req.is_rewarehouse_request ? 'bg-orange-100 text-orange-700' : req.edit_type === 'cancel_shipment' ? 'bg-red-100 text-red-700' : req.edit_type === 'add_to_pool' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {req.is_rewarehouse_request ? '再入库（待付运费）' : req.edit_type === 'cancel_shipment' ? '重新入库' : req.edit_type === 'add_to_pool' ? '加入此发货申请' : '移至其他发货申请'}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      包裹：{orders.find((o) => o.id === req.order_id)?.product_name || req.order_id}
                    </p>
                    {req.user_note && <p className="text-xs text-gray-400 mt-0.5">备注：{req.user_note}</p>}
                  </div>
              )}
              </div>
            </div>
          }

          {/* Participants */}
          {participantUsers.length > 0 &&
          <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">参与用户</h3>
              <div className="flex flex-wrap gap-2">
                {participantUsers.map((u) => {
                const userData = tenantUserMap[u.email] || {};
                // Show contact if admin, or if user set contact_public=true (default true)
                const contactVisible = isAdmin || userData.contact_public !== false;
                const displayName = userData.display_name || userData.full_name || u.name;
                return (
                  <ParticipantChip
                    key={u.email || u.name}
                    user={{ ...u, name: displayName }}
                    avatarUrl={userData.avatar_url || ''}
                    contactInfo={contactVisible ? userData.contact_info || '' : ''} />);


              })}
              </div>
            </div>
          }

          {/* Notes */}
          {pool.user_note &&
          <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2.5">
              <p className="text-xs text-yellow-600 font-medium mb-0.5">用户备注</p>
              <p className="text-sm text-yellow-800 whitespace-pre-wrap">{pool.user_note}</p>
            </div>
          }
          {pool.admin_note &&
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
              <p className="text-xs text-blue-600 font-medium mb-0.5">管理员备注</p>
              <p className="text-sm text-blue-800 whitespace-pre-wrap">{pool.admin_note}</p>
            </div>
          }

          {/* Admin panel — step-based (extracted component) */}
          {isAdmin &&
          <AdminShippingInfoPanel
            pool={pool}
            orders={orders}
            boxTemplates={boxTemplates}
            shippingMethods={shippingMethods}
            defaultPackingFeeSingle={defaultPackingFeeSingle}
            defaultPackingFeeConsolidation={defaultPackingFeeConsolidation}
            allowShipWithoutPayment={allowReadyToShipWithoutPayment}
            allowShipWithoutPaymentSingle={allowShipWithoutPaymentSingle}
            allowShipWithoutPaymentUserPool={allowShipWithoutPaymentUserPool}
            allowShipWithoutPaymentOfficialPool={allowShipWithoutPaymentOfficialPool}
            fullpayOnceToleranceJpy={fullpayOnceToleranceJpy}
            transitHandlingFeeSplit={transitHandlingFeeSplit}
            transitLocations={transitLocations}
            transitShippingMethods={transitShippingMethods}
            userProfileMap={tenantUserMap}
            exchangeRates={exchangeRates}
            onPoolUpdated={onUpdated} />

          }

          {!isAdmin && <TransitShippedPanel orders={orders} currentUser={currentUser} onUpdated={onUpdated} />}
          {!isAdmin && pool.status === "shipped" && (
            <div className="border border-green-200 rounded-xl overflow-hidden">
              <div className="bg-green-50 px-4 py-2.5 border-b border-green-200 flex items-center gap-2">
                <Truck className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">包裹已发货</span>
              </div>
              <div className="p-4 space-y-3">
                {pool.shipped_date && (
                  <p className="text-xs text-gray-500">发货日期：{pool.shipped_date}</p>
                )}
                {pool.tracking_number ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 space-y-2">
                    <p className="text-xs text-gray-400">运单号</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-base font-bold text-gray-800 select-all">{pool.tracking_number}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(pool.tracking_number)}
                        className="text-xs text-blue-500 hover:text-blue-700 underline">
                        复制
                      </button>
                    </div>
                    <a
                      href={`https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=${pool.tracking_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors">
                      <MapPin className="w-4 h-4" />查询物流状态（日本邮政）
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">运单号待管理员填写</p>
                )}
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => setShowConfirmDeliveryDialog(true)}
                  disabled={confirmingDelivery}>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {confirmingDelivery ? "确认中..." : "确认收货"}
                </Button>
              </div>
            </div>
          )}

          {/* User payment panel — shown when pool is awaiting_payment */}
          {!isAdmin && (pool.status === "awaiting_payment" || pool.status === "awaiting_payment_confirmation" || postShipmentUnpaid) &&
          <div className="border border-orange-200 rounded-xl overflow-hidden">
              <div className="bg-orange-50 px-4 py-2.5 border-b border-orange-200 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-medium text-orange-700">{postShipmentUnpaid ? "包裹已发货 · 运费待补付" : "运费待付款"}</span>
              </div>
              <div className="p-4 space-y-3">
                {postShipmentUnpaid && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                    ⚠️ 包裹已先行发出，运费尚未支付，请尽快补付。补付不影响发货/收货状态。
                  </div>
                )}
                {/* Shipping info filled by admin */}
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-2.5 text-sm">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">发货信息</p>
                  <div className="grid grid-cols-2 gap-2">
                    {pool.final_weight_g > 0 &&
                  <div>
                        <p className="text-xs text-gray-400">最终总重量</p>
                        <p className="font-medium text-gray-800">{pool.final_weight_g}g</p>
                      </div>
                  }
                    {pool.box_template_name &&
                  <div>
                        <p className="text-xs text-gray-400">外箱</p>
                        <p className="font-medium text-gray-800">{pool.box_template_name}</p>
                      </div>
                  }
                    {pool.shipping_method &&
                  <div>
                        <p className="text-xs text-gray-400">运输方式</p>
                        <p className="font-medium text-gray-800">{METHOD_LABELS[pool.shipping_method] || pool.shipping_method}</p>
                      </div>
                  }
                    {pool.transit_location_name &&
                  <div>
                        <p className="text-xs text-gray-400">中转地</p>
                        <p className="font-medium text-gray-800">{pool.transit_location_name}</p>
                      </div>
                  }
                  </div>
                  {pool.admin_packing_note &&
                <p className="text-xs text-gray-600 bg-white border border-gray-100 rounded px-2 py-1.5 whitespace-pre-wrap">{pool.admin_packing_note}</p>
                }
                  {/* Packing images */}
                  {(pool.packing_image_urls || []).length > 0 &&
                <div>
                      <p className="text-xs text-gray-400 mb-1.5">捆包图片</p>
                      <div className="flex flex-wrap gap-2">
                        {pool.packing_image_urls.map((url, i) =>
                    <ImageWithViewer key={i} src={url} alt="捆包图片">
                            <img src={url} alt="" className="w-16 h-16 rounded object-cover border border-gray-200 hover:opacity-80 transition-opacity cursor-pointer" />
                          </ImageWithViewer>
                    )}
                      </div>
                    </div>
                }
                  {/* Label images */}
                  {(pool.label_image_urls || []).length > 0 &&
                <div>
                      <p className="text-xs text-gray-400 mb-1.5">发货面单</p>
                      <div className="flex flex-wrap gap-2">
                        {pool.label_image_urls.map((url, i) =>
                    <ImageWithViewer key={i} src={url} alt="发货面单">
                            <img src={url} alt="" className="w-16 h-16 rounded object-cover border border-gray-200 hover:opacity-80 transition-opacity cursor-pointer" />
                          </ImageWithViewer>
                    )}
                      </div>
                    </div>
                }
                </div>

                {(() => {
                  // Consolidation multi-user payment logic
                  const participantEmails = [...new Set((pool.fee_breakdown_per_user || []).map(b => b.user_email))];
                  const isMultiUserPool = (pool.consolidation_type && pool.consolidation_type !== "") && participantEmails.length > 1;
                  const myPayment = (pool.per_user_payments || []).find(p => p.user_email === currentUser?.email);
                  const iAlreadySubmitted = myPayment?.payment_status === "awaiting_confirmation" || myPayment?.payment_status === "paid";

                  // For multi-user pool: show my submitted status + others' pending count
                  if (isMultiUserPool && iAlreadySubmitted) {
                    const othersPending = participantEmails.filter(email =>
                      email !== currentUser?.email &&
                      !(pool.per_user_payments || []).find(p => p.user_email === email && (p.payment_status === "awaiting_confirmation" || p.payment_status === "paid"))
                    );
                    return (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 space-y-1.5 text-sm">
                        <p className="text-blue-700 font-medium">✅ 您的付款信息已提交，等待管理员确认。</p>
                        {othersPending.length > 0 ? (
                          <p className="text-xs text-blue-500">还有 {othersPending.length} 位参与者尚未提交付款。</p>
                        ) : (
                          <p className="text-xs text-blue-500">所有参与者均已提交付款，等待管理员确认。</p>
                        )}
                      </div>
                    );
                  }

                  // For single-user pool: show global submitted status
                  if (!isMultiUserPool && (pool.payment_status === "awaiting_confirmation" || pool.status === "awaiting_payment_confirmation")) {
                    return (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-sm text-blue-700">
                        ✅ 付款信息已提交，等待管理员确认中。
                      </div>
                    );
                  }

                  return null;
                })()}

                {/* Payment form — shown only when user hasn't submitted yet */}
                {(() => {
                  const participantEmails = [...new Set((pool.fee_breakdown_per_user || []).map(b => b.user_email))];
                  const isMultiUserPool = (pool.consolidation_type && pool.consolidation_type !== "") && participantEmails.length > 1;
                  const myPayment = (pool.per_user_payments || []).find(p => p.user_email === currentUser?.email);
                  const iAlreadySubmitted = myPayment?.payment_status === "awaiting_confirmation" || myPayment?.payment_status === "paid";
                  const singleUserAlreadySubmitted = !isMultiUserPool && (pool.payment_status === "awaiting_confirmation" || pool.status === "awaiting_payment_confirmation");
                  if (iAlreadySubmitted || singleUserAlreadySubmitted) return null;
                  return (
              <>
                    {/* Fee display for current user */}
                    {(() => {
                      // Check if this is a supplement (top-up) request
                      const supplements = pool.supplement_amount_per_user || [];
                      const mySupplement = supplements.length > 0
                        ? supplements.find(s => s.user_email === currentUser?.email)
                        : null;

                      if (mySupplement) {
                        const prevTotal = mySupplement.previous_total_jpy ?? null;
                        const newTotal = mySupplement.new_total_jpy ?? null;
                        const supplementJpy = Math.round(mySupplement.supplement_jpy || 0);
                        return (
                          <div className="space-y-2">
                            {/* Summary box: show both new total and supplement clearly */}
                            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-3 space-y-2">
                              <p className="text-xs text-orange-600 font-semibold">⚠️ 管理员已更新运费，需补交差额</p>
                              {prevTotal !== null && newTotal !== null && (
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                  <span>原金额 <span className="font-medium text-gray-700">¥{prevTotal.toLocaleString()}</span></span>
                                  <span>→</span>
                                  <span>新金额 <span className="font-semibold text-orange-700">¥{newTotal.toLocaleString()}</span></span>
                                  <span className="text-orange-400">(JPY)</span>
                                </div>
                              )}
                              <div className="flex items-center justify-between border-t border-orange-200 pt-2 mt-1">
                                <span className="text-sm font-semibold text-orange-700">本次需补交</span>
                                <span className="text-2xl font-bold text-orange-600">¥{supplementJpy.toLocaleString()} <span className="text-sm font-normal">JPY</span></span>
                              </div>
                            </div>
                            {/* Full breakdown expandable */}
                            {(pool.fee_breakdown_per_user || []).length > 0 && (
                              <details className="text-xs">
                              <summary className="text-gray-400 cursor-pointer hover:text-gray-600 py-1 select-none">查看完整费用明细（更新后）</summary>
                              <div className="mt-1">
                                <ShippingFeeBreakdown
                                  breakdowns={pool.fee_breakdown_per_user}
                                  isConsolidation={pool.consolidation_type === "transit" || pool.consolidation_type === "other"}
                                  currentUserEmail={currentUser?.email}
                                  userProfileMap={tenantUserMap} />
                                </div>
                              </details>
                            )}
                          </div>
                        );
                      }

                      const feeBreakdowns = pool.fee_breakdown_per_user || [];
                      const myBreakdown = currentUser?.email
                        ? feeBreakdowns.find(b => b.user_email === currentUser.email)
                        : null;
                      if (feeBreakdowns.length > 0 && myBreakdown) {
                        return (
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-2">费用明细</p>
                            <ShippingFeeBreakdown
                              breakdowns={feeBreakdowns}
                              isConsolidation={pool.consolidation_type === "transit" || pool.consolidation_type === "other"}
                              currentUserEmail={currentUser?.email}
                              userProfileMap={tenantUserMap} />
                          </div>
                        );
                      }

                      // Fallback: fee_breakdown_per_user has entries but current user not matched
                      // (e.g. order.user_email is null → stored as "__unknown__")
                      // Show all breakdowns without filtering so the fee details are still visible
                      if (feeBreakdowns.length > 0) {
                        return (
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-2">费用明细</p>
                            <ShippingFeeBreakdown
                              breakdowns={feeBreakdowns}
                              isConsolidation={pool.consolidation_type === "transit" || pool.consolidation_type === "other"}
                              currentUserEmail={null}
                              userProfileMap={tenantUserMap} />
                          </div>
                        );
                      }

                      const boxFee = Math.round(parseFloat(pool.box_price_jpy) || 0);
                      const shippingFee = Math.round(parseFloat(pool.shipping_fee_jpy) || 0);
                      const packingFee = Math.round(parseFloat(pool.packing_fee_jpy) || 0);
                      const grandTotal = boxFee + shippingFee + packingFee;
                      const hasFeeItems = boxFee > 0 || shippingFee > 0 || packingFee > 0;
                      return (
                        <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2.5 space-y-1">
                          {hasFeeItems ? (
                            <>
                              {boxFee > 0 && (
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-yellow-700">外箱费用</span>
                                  <span className="font-medium text-yellow-800">¥{boxFee.toLocaleString()}</span>
                                </div>
                              )}
                              {shippingFee > 0 && (
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-yellow-700">国际运费</span>
                                  <span className="font-medium text-yellow-800">¥{shippingFee.toLocaleString()}</span>
                                </div>
                              )}
                              {packingFee > 0 && (
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-yellow-700">捆包作业服务费</span>
                                  <span className="font-medium text-yellow-800">¥{packingFee.toLocaleString()}</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center text-sm pt-1 border-t border-yellow-200 mt-1">
                                <span className="font-semibold text-yellow-800">应付合计</span>
                                <span className="font-bold text-orange-600">¥{grandTotal.toLocaleString()} <span className="text-xs font-normal">JPY</span></span>
                              </div>
                            </>
                          ) : (
                            <p className="text-sm font-medium text-yellow-800">
                              运费：<span className="text-lg font-bold text-orange-600">¥{shippingFee.toLocaleString()}</span>
                              <span className="text-xs text-yellow-600 ml-1">(JPY)</span>
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    <div>
                      <Label className="text-xs text-gray-500 font-medium mb-2 block">选择支付方式</Label>
                      <PaymentMethodSelector
                        value={paymentMethod}
                        onChange={m => { setPaymentMethod(m.value); paymentMethodRef.current = m.value; setSelectedMethodMeta(m); setAlipayUrl(null); }}
                        activeColor="border-orange-500 bg-orange-50 text-orange-700"
                      />
                      {/* Credit (deferred billing) option — shown if user has credit enabled with sufficient remaining limit */}
                      {(() => {
                        if (!userCredit?.credit_enabled) return null;
                        const amountJpy = (() => {
                          const supplements = pool.supplement_amount_per_user || [];
                          const mySupplement = supplements.find(s => s.user_email === currentUser?.email);
                          if (mySupplement) return Math.round(mySupplement.supplement_jpy || 0);
                          const myBreakdown = (pool.fee_breakdown_per_user || []).find(b => b.user_email === currentUser?.email);
                          if (myBreakdown) return Math.ceil((myBreakdown.total_jpy || 0) / 10) * 10;
                          return Math.round(pool.shipping_fee_jpy || 0);
                        })();
                        const remaining = (userCredit.credit_limit_jpy || 0) - (userCredit.credit_balance_jpy || 0);
                        const canUseCredit = remaining >= amountJpy;
                        return (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => { setPaymentMethod("credit"); setSelectedMethodMeta({ value: "credit", label: "记账后付款", payment_currency: "JPY" }); setAlipayUrl(null); }}
                              className={`w-full p-3 rounded-lg border-2 text-sm font-medium transition-all flex items-center gap-2 ${paymentMethod === "credit" ? "border-purple-500 bg-purple-50 text-purple-700" : canUseCredit ? "border-gray-200 text-gray-500 hover:border-gray-300" : "border-gray-100 text-gray-300 cursor-not-allowed opacity-60"}`}
                              disabled={!canUseCredit}
                            >
                              <span className="text-base">📋</span>
                              <span>记账后付款</span>
                              {!canUseCredit && <span className="text-xs ml-auto text-red-400">额度不足</span>}
                              {canUseCredit && <span className="text-xs ml-auto text-purple-500">剩余额度 ¥{Math.round(remaining).toLocaleString()}</span>}
                            </button>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Currency conversion display */}
                    {selectedMethodMeta?.payment_currency && selectedMethodMeta.payment_currency !== "JPY" && (() => {
                      const amountJpy = (() => {
                        const supplements = pool.supplement_amount_per_user || [];
                        const mySupplement = supplements.find(s => s.user_email === currentUser?.email);
                        if (mySupplement) return Math.round(mySupplement.supplement_jpy || 0);
                        const feeBreakdowns = pool.fee_breakdown_per_user || [];
                        const myBreakdown = currentUser?.email
                          ? feeBreakdowns.find(b => b.user_email === currentUser?.email)
                          : null;
                        if (myBreakdown) return Math.round(myBreakdown.total_jpy || 0);
                        // Fallback: no matched breakdown, use first entry's total or pool fee fields
                        if (feeBreakdowns.length > 0) return Math.round(feeBreakdowns[0].total_jpy || 0);
                        const boxFee = Math.round(parseFloat(pool.box_price_jpy) || 0);
                        const shippingFee = Math.round(parseFloat(pool.shipping_fee_jpy) || 0);
                        const packingFee = Math.round(parseFloat(pool.packing_fee_jpy) || 0);
                        return boxFee + shippingFee + packingFee;
                      })();
                      const currency = selectedMethodMeta.payment_currency;
                      const CURRENCY_SYMBOLS = { CNY: "¥", USD: "$", TWD: "NT$", HKD: "HK$", EUR: "€", SGD: "S$" };
                      const rateKey = `jpy_${currency.toLowerCase()}`;
                      const rate = exchangeRates?.[rateKey];
                      const sym = CURRENCY_SYMBOLS[currency] || currency;
                      return (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 space-y-1">
                          {rate ? (
                            <>
                              <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>汇率换算参考</span>
                                <span>1 JPY ≈ {rate.toFixed(4)} {currency}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-orange-700">实际应付（{currency}）</span>
                                <span className="text-base font-bold text-orange-600">
                                  {sym}{(amountJpy * rate).toFixed(["TWD","HKD","CNY"].includes(currency) ? 1 : 2)} {currency}
                                </span>
                              </div>
                              <p className="text-xs text-orange-400">汇率实时参考，以实际到账为准</p>
                            </>
                          ) : (
                            <p className="text-xs text-orange-500">正在获取实时汇率...</p>
                          )}
                        </div>
                      );
                    })()}

                    {/* Credit payment confirm button */}
                    {paymentMethod === "credit" &&
                      <Button className="w-full bg-purple-600 hover:bg-purple-700" onClick={handleCreditPayment}>
                        确认使用记账付款
                      </Button>
                    }

                    {paymentMethod === "alipay" &&
                <div className="space-y-2">
                        {alipayUrl &&
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 flex-shrink-0" />付款链接已生成，请在新标签完成付款后刷新页面。
                          </div>
                  }
                        <div className="flex gap-2">
                          <Button className="flex-1 bg-blue-600 hover:bg-blue-700"
                    onClick={handleGenerateAlipay} disabled={generatingAlipay}>
                            {generatingAlipay ?
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</> :
                      <><ExternalLink className="w-4 h-4 mr-2" />{alipayUrl ? "重新生成链接" : "生成支付宝付款链接"}</>}
                          </Button>
                          {alipayUrl &&
                    <a href={alipayUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-4 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors whitespace-nowrap">
                              <ExternalLink className="w-4 h-4" />打开付款页
                            </a>
                    }
                        </div>
                      </div>
                }

                    {paymentMethod && paymentMethod !== "alipay" && paymentMethod !== "credit" &&
                    <PaymentProofUploader
                    selectedMethodMeta={selectedMethodMeta}
                    uploadingProof={uploadingProof}
                    onUpload={handleUploadProof}
                    />
                    }
                  </>
                  );
                })()}
              </div>
            </div>
          }

          {/* Message thread */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">留言沟通</h3>
            <MessageThread
              contextObject={pool}
              contextType="pool"
              currentUser={currentUser}
              isAdmin={isAdmin}
              userProfileMap={tenantUserMap}
              permissionKey="shipping"
            />
          </div>
        </div>

        {showBulkRewarehouse && (
          <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4" onMouseDown={()=>setShowBulkRewarehouse(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4" onMouseDown={e=>e.stopPropagation()}>
              <div><h3 className="font-semibold text-gray-900">申请再入库</h3><p className="text-sm text-gray-500 mt-1">已选 {rewarehouseSelectedIds.length} 件包裹申请取消发货并重新入库。</p></div>
              <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-xs text-orange-700 space-y-1"><p>⚠️ 管理员审批后，订单将恢复为「已入库」状态。</p><p>管理员可能会收取再处理费用，将在下次提交发货时自动计入。</p></div>
              <div><label className="text-xs text-gray-500 block mb-1">申请原因（可选）</label><Textarea rows={2} placeholder="说明申请原因..." className="text-sm" value={rewarehouseNote} onChange={e=>setRewarehouseNote(e.target.value)} /></div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={()=>setShowBulkRewarehouse(false)}>取消</Button>
                <Button size="sm" className="bg-orange-600 hover:bg-orange-700" disabled={submittingBulkRewarehouse} onClick={async()=>{
                  setSubmittingBulkRewarehouse(true);
                  await Promise.all(rewarehouseSelectedIds.map(orderId=>base44.functions.invoke('userMutateShippingPool',{action:'rewarehouse_from_fee_pending',pool_id:pool.id,order_id:orderId,user_note:rewarehouseNote})));
                  setSubmittingBulkRewarehouse(false);setShowBulkRewarehouse(false);setRewarehouseSelectedIds([]);setRewarehouseNote("");onUpdated?.();
                }}>{submittingBulkRewarehouse?"提交中...":"确认申请"}</Button>
              </div>
            </div>
          </div>
        )}
        {editingOrder &&
        <ShippingEditModal
          order={editingOrder}
          currentPool={pool}
          currentUser={currentUser}
          onClose={() => setEditingOrder(null)}
          onSuccess={() => {setEditingOrder(null);onUpdated?.();}} />

        }

        {editingPool && editingPoolData &&
        <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4" onMouseDown={() => setEditingPool(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <h3 className="font-semibold text-gray-900">编辑发货申请</h3>
                <button onClick={() => setEditingPool(false)}><X className="w-4 h-4 text-gray-500" /></button>
              </div>
              <div className="px-5 py-5 space-y-4">
                <div>
                  <Label className="text-xs text-gray-500">发货申请标题</Label>
                  <Input className="mt-1 h-8 text-sm" placeholder="给此发货申请取个名字"
                value={editingPoolData.title || ""} onChange={(e) => setEditingPoolData((d) => ({ ...d, title: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">计划发货日期</Label>
                  <Input className="mt-1 h-8 text-sm" type="date"
                value={editingPoolData.scheduled_ship_date || ""} onChange={(e) => setEditingPoolData((d) => ({ ...d, scheduled_ship_date: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">{isAdmin ? "用户备注" : "备注"}</Label>
                  <Textarea rows={3} className="mt-1 text-sm"
                value={editingPoolData.user_note || ""} onChange={(e) => setEditingPoolData((d) => ({ ...d, user_note: e.target.value }))} />
                </div>
                {isAdmin &&
              <div>
                    <Label className="text-xs text-gray-500">管理员备注</Label>
                    <Textarea rows={2} className="mt-1 text-sm"
                value={editingPoolData.admin_note || ""} onChange={(e) => setEditingPoolData((d) => ({ ...d, admin_note: e.target.value }))} />
                  </div>
              }
              </div>
              <div className="px-5 py-3 border-t flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setEditingPool(false)}>取消</Button>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700"
              onClick={handlePoolEditSave} disabled={savingPool}>
                  {savingPool ? "保存中..." : "保存"}
                </Button>
              </div>
            </div>
          </div>
        }

        {confirmDelete &&
        <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4" onMouseDown={() => setConfirmDelete(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4" onMouseDown={e => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">删除发货申请？</h3>
                  <p className="text-sm text-gray-500 mt-1">此操作不可撤销。所有订单将重新入库。</p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>取消</Button>
                <Button size="sm" className="bg-red-600 hover:bg-red-700"
              onClick={handleDeletePool} disabled={deleting}>
                  {deleting ? "删除中..." : "确认删除"}
                </Button>
              </div>
            </div>
          </div>
        }

        <ConfirmDialog
          open={showAlipayConfirm}
          onOpenChange={setShowAlipayConfirm}
          title="确认支付"
          description="点击下方按钮将跳转到支付宝完成付款"
          confirmText="前往支付宝付款"
          onConfirm={submitToAlipay}
          onCancel={() => setAlipayFormData(null)}
        />

        <ConfirmDialog
          open={showConfirmDeliveryDialog}
          onOpenChange={setShowConfirmDeliveryDialog}
          title="确认收货"
          description="是否确认收货？确认后包裹状态将变为已签收。"
          confirmText="是"
          onConfirm={handleConfirmDelivery}
        />

        {/* 底部关闭按钮 */}
        <div className="sticky bottom-0 bg-white border-t px-6 py-3 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </div>);

}

function InfoBlock({ label, value, highlight }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-green-50 border border-green-100" : "bg-gray-50"}`}>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-sm font-medium mt-0.5 ${highlight ? "text-green-700" : "text-gray-800"}`}>{value}</p>
    </div>);

}

function ParticipantChip({ user, avatarUrl, contactInfo }) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const hideTimer = useRef(null);
  const initial = (user.name || "?")[0].toUpperCase();

  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setTooltipVisible(false), 150);
  };

  const handleCopyContact = () => {
    if (contactInfo) {
      navigator.clipboard.writeText(contactInfo);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="relative flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full pl-1 pr-2.5 py-0.5 cursor-default"
      onMouseEnter={() => {if (contactInfo) {cancelHide();setTooltipVisible(true);}}}
      onMouseLeave={scheduleHide}>
      
      {avatarUrl ?
      <img src={avatarUrl} alt={user.name} className="w-5 h-5 rounded-full object-cover flex-shrink-0" /> :

      <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs font-medium flex-shrink-0">
          {initial}
        </div>
      }
      <span className="text-xs text-gray-700">{user.name}</span>
      {contactInfo && <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0 cursor-pointer" title="点击查看联系方式" onClick={() => setTooltipVisible(!tooltipVisible)} />}
      {tooltipVisible && contactInfo &&
      <div
        className="absolute bottom-full left-0 mb-2 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-2 whitespace-nowrap"
        style={{ width: `max(auto, ${Math.max(80, Math.min(contactInfo.length * 7 + 60, 300))}px)` }}
        onMouseEnter={cancelHide}
        onMouseLeave={scheduleHide}>
        
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-gray-500">联系方式</p>
            <button
            onClick={handleCopyContact}
            className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors flex-shrink-0"
            title="复制联系方式">
            
              {copied ? "已复制" : "复制"}
            </button>
          </div>
          <p className="text-sm font-medium text-gray-800 break-all select-all cursor-text">{contactInfo}</p>
        </div>
      }
    </div>);

}