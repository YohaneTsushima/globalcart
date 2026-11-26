/**
 * OfficialPoolUserGroupModal
 * Edit a user's task group within an official pool:
 * - Group label, notes (array of {text, image_urls, created_at})
 * - Group-level addons
 * - Group-level final address + "sync all" button
 * Todoist-style parent task editing.
 */
import { useState, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { shippingPoolApi } from "@/lib/tenantApi";
import { EMPTY_ADDRESS_FORM } from "@/components/common/AddressForm";
import AddressForm from "@/components/common/AddressForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, MapPin, Users, Loader2, CopyCheck, PlusCircle, MessageSquare, Upload, Send } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Migrate legacy note/image_urls to notes array
function initNotes(group) {
  if (Array.isArray(group.notes) && group.notes.length > 0) return group.notes;
  if (group.note || (group.image_urls && group.image_urls.length > 0)) {
    return [{ text: group.note || "", image_urls: group.image_urls || [], created_at: group.updated_date || new Date().toISOString() }];
  }
  return [];
}

export default function OfficialPoolUserGroupModal({ pool, group, shippingAddons = [], savedAddresses = [], onClose, onSuccess }) {
  const [groupLabel, setGroupLabel] = useState(group.group_label || group.user_name || "");
  const [notes, setNotes] = useState(() => initNotes(group));
  const [draftText, setDraftText] = useState("");
  const [draftImages, setDraftImages] = useState([]);
  const [selectedAddonIds, setSelectedAddonIds] = useState(group.selected_addon_ids || []);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingNote, setSendingNote] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const fileInputRef = useRef(null);

  // Address state
  const [groupAddress, setGroupAddress] = useState(group.group_final_address || { ...EMPTY_ADDRESS_FORM });
  const [addressMode, setAddressMode] = useState(group.group_final_address ? "custom" : "saved");
  const [selectedSavedId, setSelectedSavedId] = useState("");
  const [syncConfirm, setSyncConfirm] = useState(false);

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
    const updatedGroup = {
      ...group,
      group_label: groupLabel,
      notes: updatedNotes,
      note: updatedNotes[0]?.text || "",
      image_urls: updatedNotes[0]?.image_urls || [],
      selected_addon_ids: selectedAddonIds,
      selected_addons: shippingAddons.filter(a => selectedAddonIds.includes(a.id)).map(a => ({ id: a.id, name: a.name, fee: a.fee, fee_currency: a.fee_currency })),
      group_final_address: groupAddress,
    };

    // Update the entire per_user_groups array (not just this group)
    const newGroups = (pool.per_user_groups || []).map(g =>
      g.user_email === group.user_email ? updatedGroup : g
    );

    const prevNotes = notes;
    const prevDraftText = draftText;
    const prevDraftImages = draftImages;

    // Optimistically update local state
    setNotes(updatedNotes);
    setDraftText("");
    setDraftImages([]);

    try {
      await shippingPoolApi.update(pool.id, { per_user_groups: newGroups });
    } catch (error) {
      console.error('Failed to save note:', error);
      // Rollback on error
      setNotes(prevNotes);
      setDraftText(prevDraftText);
      setDraftImages(prevDraftImages);
      alert('保存留言失败，请重试');
    }
  };

  const handleDeleteNote = async (idx) => {
    const deletedNote = notes[idx];
    const updatedNotes = notes.filter((_, i) => i !== idx);
    const prevNotes = notes;
    
    // Update the entire per_user_groups array (not just this group)
    const updatedGroup = {
      ...group,
      group_label: groupLabel,
      notes: updatedNotes,
      note: updatedNotes[0]?.text || "",
      image_urls: updatedNotes[0]?.image_urls || [],
      selected_addon_ids: selectedAddonIds,
      selected_addons: shippingAddons.filter(a => selectedAddonIds.includes(a.id)).map(a => ({ id: a.id, name: a.name, fee: a.fee, fee_currency: a.fee_currency })),
      group_final_address: groupAddress,
    };

    const newGroups = (pool.per_user_groups || []).map(g =>
      g.user_email === group.user_email ? updatedGroup : g
    );

    // Optimistically update local state
    setNotes(updatedNotes);

    try {
      await shippingPoolApi.update(pool.id, { per_user_groups: newGroups });
    } catch (error) {
      console.error('Failed to delete note:', error);
      // Rollback on error
      setNotes(prevNotes);
      alert('删除留言失败，请重试');
    }
  };

  const handleAddressSave = (v) => setGroupAddress(p => ({ ...p, ...v }));

  const handleSave = async (syncAddressToAll = false) => {
    setSaving(true);
    const selectedAddons = shippingAddons.filter(a => selectedAddonIds.includes(a.id))
      .map(a => ({ id: a.id, name: a.name, fee: a.fee, fee_currency: a.fee_currency }));

    // Derive legacy note/image_urls from first note for backward compat
    const firstNote = notes[0];
    const updatedGroup = {
      ...group,
      group_label: groupLabel,
      notes,
      note: firstNote?.text || "",
      image_urls: firstNote?.image_urls || [],
      selected_addon_ids: selectedAddonIds,
      selected_addons: selectedAddons,
      group_final_address: groupAddress,
    };

    // If sync, update all order_entries to use_group_address: true
    if (syncAddressToAll) {
      updatedGroup.order_entries = (group.order_entries || []).map(e => ({
        ...e,
        use_group_address: true,
        override_final_address: null,
      }));
    }

    const newGroups = (pool.per_user_groups || []).map(g =>
      g.user_email === group.user_email ? updatedGroup : g
    );

    await shippingPoolApi.update(pool.id, { per_user_groups: newGroups });
    setSaving(false);
    onSuccess?.();
  };

  const handleSavedAddressSelect = (id) => {
    if (id === "__custom__") {
      setAddressMode("custom");
      setSelectedSavedId("");
    } else {
      const addr = savedAddresses.find(a => a.id === id);
      if (addr) {
        setGroupAddress({ ...EMPTY_ADDRESS_FORM, ...addr });
        setSelectedSavedId(id);
        setAddressMode("saved");
      }
    }
  };

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
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-500" />
            <h2 className="font-semibold text-gray-900 text-sm">编辑用户任务组</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Group label */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">任务组名称</p>
            <Input className="h-8 text-sm" value={groupLabel} onChange={e => setGroupLabel(e.target.value)} placeholder="默认为用户名" />
          </div>

          {/* Addons */}
          {shippingAddons.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">发货增值服务（任务组默认）</p>
              <div className="space-y-1.5">
                {shippingAddons.map(a => (
                  <label key={a.id} className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${selectedAddonIds.includes(a.id) ? "border-yellow-400 bg-yellow-50" : "border-gray-200 hover:bg-gray-50"}`}>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={selectedAddonIds.includes(a.id)} onChange={v => setSelectedAddonIds(prev => v.target.checked ? [...prev, a.id] : prev.filter(id => id !== a.id))} className="accent-yellow-500 w-4 h-4" />
                      <span className="text-sm font-medium text-gray-800">{a.name}</span>
                    </div>
                    <span className="text-xs text-yellow-700">+{a.fee_currency || "JPY"} {Number(a.fee || 0).toLocaleString()}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Final address */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />任务组最终收货地址
              </p>
              {(group.order_entries || []).length > 1 && (
                <button
                  onClick={() => setSyncConfirm(true)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors">
                  <CopyCheck className="w-3.5 h-3.5" />统一任务组下的最终收货地址
                </button>
              )}
            </div>

            {syncConfirm && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 text-xs">
                <p className="text-orange-700 font-medium mb-2">确认将此地址同步到该任务组下所有订单？</p>
                <p className="text-orange-600 mb-2">所有子任务将使用此任务组地址，单独设置的地址将被覆盖。</p>
                <div className="flex gap-2">
                  <Button size="sm" className="h-6 text-xs bg-orange-600 hover:bg-orange-700" onClick={() => { setSyncConfirm(false); handleSave(true); }}>确认同步</Button>
                  <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setSyncConfirm(false)}>取消</Button>
                </div>
              </div>
            )}

            {savedAddresses.length > 0 && (
              <Select value={addressMode === "saved" ? (selectedSavedId || "") : "__custom__"} onValueChange={handleSavedAddressSelect}>
                <SelectTrigger className="h-8 text-sm bg-white"><SelectValue placeholder="从地址簿选择" /></SelectTrigger>
                <SelectContent>
                  {savedAddresses.map(a => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
                  <SelectItem value="__custom__"><span className="flex items-center gap-1.5 text-blue-600"><PlusCircle className="w-3.5 h-3.5" />手动填写</span></SelectItem>
                </SelectContent>
              </Select>
            )}

            <AddressForm value={groupAddress} onChange={handleAddressSave} />
          </div>

          {/* Notes / Messages - Moved to bottom */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />任务组备注留言
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
                    disabled={!draftText.trim() && draftImages.length === 0 || sendingNote}
                  >
                    {sendingNote ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />发送中...</> : <><Send className="w-3 h-3 mr-1" />发送</>}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" disabled={saving} onClick={() => handleSave(false)}>
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />保存中...</> : "保存"}
          </Button>
        </div>
      </div>
    </div>
    </>
  );
}