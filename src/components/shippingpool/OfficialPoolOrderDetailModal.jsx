/**
 * OfficialPoolOrderDetailModal
 * Todoist-style sub-task detail for a single order within an official pool.
 * Notes are stored as an array of message objects: { text, image_urls, created_at }
 * Legacy single `note` + `image_urls` fields are migrated on first open.
 */
import { useState, useCallback, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { shippingPoolApi } from "@/lib/tenantApi";
import { getStatusLabel, getStatusColor } from "@/lib/orderStatus";
import { EMPTY_ADDRESS_FORM } from "@/components/common/AddressForm";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, Package, MapPin, Loader2, Link as LinkIcon, Upload, Send, MessageSquare, User } from "lucide-react";

// Migrate legacy note/image_urls to notes array
function initNotes(entry) {
  if (Array.isArray(entry.notes) && entry.notes.length > 0) return entry.notes;
  if (entry.note || (entry.image_urls && entry.image_urls.length > 0)) {
    return [{ text: entry.note || "", image_urls: entry.image_urls || [], created_at: entry.updated_date || new Date().toISOString() }];
  }
  return [];
}

export default function OfficialPoolOrderDetailModal({ pool, group, orderEntry, order, shippingAddons = [], savedAddresses = [], onClose, onSuccess }) {
  // AddonOption 的后端字段是 service_name / fee_min / fee_max，这里统一成组件内使用的 name / min_fee / max_fee
  const addons = useMemo(() => (shippingAddons || []).map((a) => ({
    ...a,
    name: a.service_name || a.name || "",
    min_fee: a.fee_min ?? a.min_fee,
    max_fee: a.fee_max ?? a.max_fee,
  })), [shippingAddons]);

  // 最终收货地址直接展示用户预出货的快照，不再允许在池里改
  const finalAddress = order?.pre_shipment?.address || null;

  const [notes, setNotes] = useState(() => initNotes(orderEntry));
  const [draftText, setDraftText] = useState("");
  const [draftImages, setDraftImages] = useState([]);
  const [selectedAddonIds, setSelectedAddonIds] = useState(() => (
    orderEntry.selected_addon_ids ||
    order?.pre_shipment?.selected_addon_ids ||
    order?.selected_addon_ids ||
    []
  ).map(String));
  const [addonCustomFees, setAddonCustomFees] = useState(() => {
    // Initialize custom fees from saved data, fallback to the fees recorded on the pre-shipment snapshot
    const fees = {};
    const addonFees = orderEntry.addon_custom_fees;
    if (Array.isArray(addonFees)) {
      addonFees.forEach(cf => {
        fees[cf.addon_id] = cf.custom_fee;
      });
    }
    const snapshotAddons = order?.pre_shipment?.selected_addons;
    if (Array.isArray(snapshotAddons)) {
      snapshotAddons.forEach(sa => {
        if (sa?.id != null && sa?.fee != null) fees[sa.id] = sa.fee;
      });
    }
    return fees;
  });
  const [addonFeeErrors, setAddonFeeErrors] = useState({});
  // 订单详情只读展示，底部保存/取消暂时隐藏（代码保留，需要时改回 true）
  const SHOW_ORDER_ACTIONS = false;
  const [useGroupAddress, setUseGroupAddress] = useState(orderEntry.use_group_address !== false);
  const [overrideAddress, setOverrideAddress] = useState(orderEntry.override_final_address || { ...EMPTY_ADDRESS_FORM });
  const [selectedSavedId, setSelectedSavedId] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingNote, setSendingNote] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const fileInputRef = useRef(null);

  const uploadFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setUploadingImage(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setDraftImages(prev => [...prev, file_url]);
    setUploadingImage(false);
  }, []);

  const handleFileInput = async (e) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
    e.target.value = "";
  };

  const handleSendNote = async () => {
    if (!draftText.trim() && draftImages.length === 0) return;
    const newNote = { text: draftText.trim(), image_urls: draftImages, created_at: new Date().toISOString() };
    
    // Save to database immediately with the new note included
    const updatedNotes = [...notes, newNote];
    const updatedEntry = {
      ...orderEntry,
      notes: updatedNotes,
      note: updatedNotes[0]?.text || "",
      image_urls: updatedNotes[0]?.image_urls || [],
    };

    const newGroups = (pool.per_user_groups || []).map(g => {
      if (g.user_email !== group.user_email) return g;
      return {
        ...g,
        order_entries: (g.order_entries || []).map(e =>
          e.order_id === orderEntry.order_id ? updatedEntry : e
        ),
      };
    });

    // Optimistically update local state
    setNotes(updatedNotes);
    setDraftText("");
    setDraftImages([]);
    setSendingNote(true);

    try {
      await shippingPoolApi.update(pool.id, { per_user_groups: newGroups });
    } catch (error) {
      console.error('Failed to save note:', error);
      // Rollback on error
      setNotes(notes);
      setDraftText(draftText);
      setDraftImages(draftImages);
      alert('保存留言失败，请重试');
    } finally {
      setSendingNote(false);
    }
  };

  const handleDeleteNote = async (idx) => {
    const updatedNotes = notes.filter((_, i) => i !== idx);
    
    // Optimistically update local state
    setNotes(updatedNotes);
    
    // Save to database immediately
    const updatedEntry = {
      ...orderEntry,
      notes: updatedNotes,
      note: updatedNotes[0]?.text || "",
      image_urls: updatedNotes[0]?.image_urls || [],
    };

    const newGroups = (pool.per_user_groups || []).map(g => {
      if (g.user_email !== group.user_email) return g;
      return {
        ...g,
        order_entries: (g.order_entries || []).map(e =>
          e.order_id === orderEntry.order_id ? updatedEntry : e
        ),
      };
    });

    try {
      await shippingPoolApi.update(pool.id, { per_user_groups: newGroups });
    } catch (error) {
      console.error('Failed to delete note:', error);
      // Rollback on error
      setNotes(notes);
      alert('删除留言失败，请重试');
    }
  };

  const handleSave = async () => {
    // Validate custom fees are within range before saving
    const validationErrors = [];
    addons.filter(a => selectedAddonIds.includes(String(a.id))).forEach(a => {
      if (a.is_user_customizable) {
        const customFee = addonCustomFees[a.id];
        if (customFee !== undefined && customFee !== '') {
          if (a.min_fee !== undefined && a.max_fee !== undefined) {
            if (customFee < a.min_fee || customFee > a.max_fee) {
              validationErrors.push(`${a.name}: 费用必须在 ${a.min_fee}-${a.max_fee} ${a.fee_currency || "JPY"} 之间`);
            }
          }
        }
      }
    });
    
    if (validationErrors.length > 0) {
      alert(validationErrors.join('\n'));
      return;
    }
    
    setSaving(true);
    // Build selected addons with custom fees if applicable
    const selectedAddons = addons.filter(a => selectedAddonIds.includes(String(a.id)))
      .map(a => {
        const customFee = addonCustomFees[a.id];
        const finalFee = (a.is_user_customizable && customFee !== undefined) ? customFee : a.fee;
        return { 
          id: a.id, 
          name: a.name, 
          fee: finalFee, 
          fee_currency: a.fee_currency,
          is_user_customizable: a.is_user_customizable,
          custom_fee: customFee
        };
      });

    // Build addon_custom_fees array for persistence
    const addonCustomFeesArray = Object.entries(addonCustomFees).map(([addon_id, custom_fee]) => ({
      addon_id,
      custom_fee
    }));

    // Derive legacy note/image_urls from first note for backward compat
    const firstNote = notes[0];
    const updatedEntry = {
      ...orderEntry,
      notes,
      note: firstNote?.text || "",
      image_urls: firstNote?.image_urls || [],
      selected_addon_ids: selectedAddonIds,
      selected_addons: selectedAddons,
      addon_custom_fees: addonCustomFeesArray,
      use_group_address: useGroupAddress,
      override_final_address: useGroupAddress ? null : overrideAddress,
    };

    const newGroups = (pool.per_user_groups || []).map(g => {
      if (g.user_email !== group.user_email) return g;
      return {
        ...g,
        order_entries: (g.order_entries || []).map(e =>
          e.order_id === orderEntry.order_id ? updatedEntry : e
        ),
      };
    });

    await shippingPoolApi.update(pool.id, { per_user_groups: newGroups });
    setSaving(false);
    onSuccess?.();
  };

  const handleSavedAddressSelect = (id) => {
    if (id === "__new__") {
      setSelectedSavedId("");
      setOverrideAddress({ ...EMPTY_ADDRESS_FORM });
    } else {
      const addr = savedAddresses.find(a => a.id === id);
      if (addr) {
        setOverrideAddress({ ...EMPTY_ADDRESS_FORM, ...addr });
        setSelectedSavedId(id);
      }
    }
  };

  const groupAddress = group.group_final_address;

  return (
    <>
    {lightboxUrl && (
      <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setLightboxUrl(null)}>
        <img src={lightboxUrl} alt="" className="max-w-full max-h-full rounded-lg shadow-2xl object-contain" />
        <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70"><X className="w-5 h-5" /></button>
      </div>
    )}
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onMouseDown={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900 text-sm truncate">{order?.product_name || "订单详情"}</h2>
              <p className="text-xs text-gray-400">{order?.order_number || orderEntry.order_id.slice(-8)}</p>
              {/* User name display */}
              <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                <User className="w-3 h-3 text-gray-400" />
                <span className="font-medium">{group?.user_name || order?.user_name || group?.user_email?.split('@')[0] || order?.user_email?.split('@')[0] || '未知用户'}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 flex-shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Order info */}
          {order && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-xs">
              {order.product_image_url && (
                <img src={order.product_image_url} alt={order.product_name} onClick={() => setLightboxUrl(order.product_image_url)} className="w-full h-32 object-contain rounded-lg border border-gray-200 bg-white mb-2 cursor-zoom-in" />
              )}
              <div className="flex items-center justify-between">
                <span className="text-gray-500">状态</span>
                <Badge className={`${getStatusColor(order.order_status, "admin")} text-xs`}>{getStatusLabel(order.order_status, "admin")}</Badge>
              </div>
              {order.weight_g > 0 && (
                <div className="flex items-center justify-between"><span className="text-gray-500">重量</span><span className="font-medium">{order.weight_g}g</span></div>
              )}
              {order.estimated_jpy > 0 && (
                <div className="flex items-center justify-between"><span className="text-gray-500">估价</span><span className="font-medium">¥{order.estimated_jpy?.toLocaleString()}</span></div>
              )}
              {order.arrival_photo_url && (
                <div>
                  <p className="text-gray-500 mb-1">入库图片</p>
                  <img src={order.arrival_photo_url} alt="入库图片" onClick={() => setLightboxUrl(order.arrival_photo_url)} className="w-full h-28 object-contain rounded-lg border border-gray-200 bg-white cursor-zoom-in" />
                </div>
              )}
              {order.product_url && (
                <a href={order.product_url.split("\n")[0]} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:underline">
                  <LinkIcon className="w-3 h-3" />商品链接
                </a>
              )}
            </div>
          )}

          {/* Addons */}
          {addons.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">此订单的增值服务</p>
              <div className="space-y-2">
                {addons.filter(a => selectedAddonIds.includes(String(a.id))).map(a => {
                  const isSelected = selectedAddonIds.includes(String(a.id));
                  const isCustomizable = a.is_user_customizable && a.min_fee !== undefined && a.max_fee !== undefined && a.max_fee > 0;
                  // For customizable addons, show the saved custom fee or default to the addon's default fee
                  // For non-customizable, show the default fee
                  const customFee = isCustomizable && isSelected ? (addonCustomFees[a.id] ?? a.fee) : a.fee;
                  
                  return (
                    <div key={a.id} className="rounded-lg border border-yellow-200 bg-yellow-50/60 p-2.5 transition-colors">
                      <label className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1">
                          {/* 订单详情只读展示，勾选框暂时隐藏（保留代码备用） */}
                          <span className="hidden">
                          <Checkbox checked={isSelected} onCheckedChange={v => {
                            if (v) {
                              setSelectedAddonIds(prev => [...prev, String(a.id)]);
                            } else {
                              setSelectedAddonIds(prev => prev.filter(id => id !== String(a.id)));
                            }
                          }} />
                          </span>
                          <div>
                            <span className="text-sm font-medium text-gray-800">{a.name}</span>
                            {isCustomizable && isSelected && (
                              <p className="text-xs text-gray-500 mt-0.5">费用范围：{a.fee_currency || "JPY"} {a.min_fee} - {a.max_fee}</p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          {isCustomizable && isSelected ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[10px] text-green-600 font-medium">用户可自定义</span>
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1.5">
                                  <Input 
                                    type="number" 
                                    className={`h-6 w-24 text-xs text-right ${addonFeeErrors[a.id] ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                                    value={customFee}
                                    placeholder={`${a.min_fee}-${a.max_fee}`}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const value = val === '' ? '' : parseFloat(val) || 0;
                                      setAddonCustomFees(prev => ({ ...prev, [a.id]: value }));
                                      // Validate in real-time
                                      if (value === '' || value === undefined) {
                                        setAddonFeeErrors(prev => {
                                          const newErrors = { ...prev };
                                          delete newErrors[a.id];
                                          return newErrors;
                                        });
                                      } else if (value < a.min_fee || value > a.max_fee) {
                                        setAddonFeeErrors(prev => ({ ...prev, [a.id]: `必须在${a.min_fee}-${a.max_fee} ${a.fee_currency || 'JPY'}之间` }));
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
                            </div>
                          ) : (
                            <span className="text-xs text-yellow-700">+{a.fee_currency || "JPY"} {Number(a.fee || 0).toLocaleString()}</span>
                          )}
                        </div>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Final address */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />最终收货地址
            </p>

            <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/60 text-sm text-blue-900 space-y-0.5">
              {finalAddress ? (
                <>
                  <p className="font-medium">{finalAddress.recipient_name || "未填写收件人"}</p>
                  {finalAddress.phone && <p className="text-xs">{finalAddress.phone}</p>}
                  <p className="text-xs whitespace-pre-wrap">
                    {[finalAddress.state, finalAddress.city, finalAddress.addr1, finalAddress.addr2, finalAddress.addr3]
                      .filter(Boolean).join(" ")}
                  </p>
                  {finalAddress.postal_code && <p className="text-xs">{finalAddress.postal_code} {finalAddress.country || ""}</p>}
                </>
              ) : (
                <p className="text-xs text-blue-600">该订单还没有预出货地址</p>
              )}
              <p className="text-[11px] text-blue-500 pt-1">地址来自用户预出货填写，如需修改请让用户重新提交预出货</p>
            </div>
          </div>

          {/* Notes / Messages */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />备注留言
            </p>

            {/* Existing notes list */}
            {notes.length > 0 && (
              <div className="space-y-2 mb-3">
                {notes.map((n, idx) => (
                  <div key={idx} className="group bg-gray-50 rounded-xl px-3 py-2.5 relative">
                    <button
                      onClick={() => handleDeleteNote(idx)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    {n.text && <p className="text-sm text-gray-800 whitespace-pre-wrap pr-5">{n.text}</p>}
                    {n.image_urls?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {n.image_urls.map((url, i) => (
                          <img key={i} src={url} alt="" onClick={() => setLightboxUrl(url)} className="w-14 h-14 rounded-lg object-cover border border-gray-200 cursor-zoom-in" />
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-gray-300 mt-1.5">
                      {new Date(n.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Compose area */}
            <div className="border border-gray-200 rounded-xl overflow-hidden focus-within:border-blue-300 transition-colors">
              {/* Draft images */}
              {draftImages.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
                  {draftImages.map((url, i) => (
                    <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200 group">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setDraftImages(prev => prev.filter((_, j) => j !== i))}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Textarea with drag/paste */}
              <div
                className="relative"
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
                onDrop={async e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) await uploadFile(f); }}
              >
                <textarea
                  rows={3}
                  className={`w-full px-3 pt-2.5 pb-1 text-sm border-0 resize-none outline-none bg-transparent transition-colors placeholder:text-gray-300 ${dragOver ? "bg-blue-50" : ""}`}
                  placeholder="添加备注…（可粘贴或拖拽图片）"
                  value={draftText}
                  onChange={e => setDraftText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSendNote(); }}
                  onPaste={async e => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    for (const item of items) {
                      if (item.type.startsWith("image/")) {
                        e.preventDefault();
                        const file = item.getAsFile();
                        if (file) await uploadFile(file);
                        return;
                      }
                    }
                  }}
                />
                {dragOver && (
                  <div className="absolute inset-0 rounded flex items-center justify-center pointer-events-none">
                    <span className="bg-blue-600 text-white text-xs font-medium px-3 py-1 rounded-full shadow">松开以上传图片</span>
                  </div>
                )}
                {uploadingImage && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center pointer-events-none">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  </div>
                )}
              </div>

              {/* Toolbar */}
              <div className="flex items-center justify-between px-2.5 pb-2 pt-1">
                <label className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 cursor-pointer transition-colors px-1 py-0.5 rounded">
                  <Upload className="w-3.5 h-3.5" />图片
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} disabled={uploadingImage} />
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-300">⌘↵ 发送</span>
                  <Button
                    size="sm"
                    className="h-7 px-3 text-xs bg-blue-600 hover:bg-blue-700"
                    onClick={handleSendNote}
                    disabled={!draftText.trim() && draftImages.length === 0}
                  >
                    <Send className="w-3 h-3 mr-1" />发送
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer：订单详情当前只读，保存/取消暂时隐藏（代码保留） */}
        {SHOW_ORDER_ACTIONS && (
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" disabled={saving} onClick={handleSave}>
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />保存中...</> : "保存"}
          </Button>
        </div>
        )}
      </div>
    </div>
    </>
  );
}