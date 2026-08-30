/**
 * AddressBlock
 * Reusable address input block for UserNotifyShipmentModal.
 * Shows saved-address dropdown if available, plus "输入新地址" option.
 * When no saved addresses or user selects "输入新地址", shows structured AddressForm.
 * Optionally lets user save the new address to their address book.
 *
 * newAddress shape: { label, recipient_name, country, addr1, addr2, addr3, state, phone }
 */
import { MapPin, PlusCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import AddressForm, { EMPTY_ADDRESS_FORM } from "@/components/common/AddressForm";

export default function AddressBlock({
  slot,
  label,
  savedAddresses,
  selectedId,
  isNewMode,
  newAddress,
  saveNewAddress,
  onSelect,
  onNewAddressChange,
  onSaveToggle,
  error = false
}) {
  const hasSaved = savedAddresses.length > 0;
  const selectedAddr = hasSaved && !isNewMode ? savedAddresses.find((a) => a.id === selectedId) : null;

  // Ensure newAddress has all structured fields (label is kept separately in AddressBlock)
  const addrValue = { ...EMPTY_ADDRESS_FORM, ...newAddress };

  // When no saved addresses, auto-treat as new mode for submit validation purposes
  const effectiveNewMode = isNewMode || !hasSaved;

  // Handle AddressForm field changes — always preserve the label field
  const handleAddressFormChange = (updatedFields) => {
    onNewAddressChange((prev) => ({ ...prev, ...updatedFields }));
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide">
        <MapPin className="w-3.5 h-3.5 text-blue-500" />
        {label}
        <span className="text-red-500">*</span>
      </label>
      {!hasSaved || effectiveNewMode ? (
        // Show structured address form
        <div className="space-y-3">
          {hasSaved && (
            <Select value="__new__" onValueChange={onSelect}>
              <SelectTrigger className="h-10 bg-blue-50/50 border-blue-200">
                <SelectValue placeholder="请选择收货地址" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {savedAddresses.map((addr) => (
                  <SelectItem key={addr.id} value={addr.id} className="py-2.5">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-gray-800 text-sm">{addr.label || "地址"}</span>
                      <span className="text-xs text-gray-500 line-clamp-2">
                        {formatAddressPreview(addr)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
                <SelectItem value="__new__" className="py-2.5">
                  <div className="flex items-center gap-2 text-blue-600">
                    <PlusCircle className="w-4 h-4" />
                    <span className="font-medium">输入新地址</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="border border-gray-200 rounded-lg p-3 bg-white shadow-sm">
            <AddressForm
              value={addrValue}
              onChange={handleAddressFormChange}
              showLabel={false}
              error={error}
            />
          </div>
          {hasSaved && saveNewAddress !== undefined && (
            <label className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer">
              <Checkbox checked={saveNewAddress} onCheckedChange={onSaveToggle} className="data-[state=checked]:bg-blue-500" />
              <span className="text-sm text-gray-600 font-medium">保存到我的地址簿</span>
            </label>
          )}
        </div>
      ) : (
        // Show saved address dropdown
        <div className="space-y-3">
          <Select value={selectedId || ""} onValueChange={onSelect}>
            <SelectTrigger className="h-10 border-gray-200 bg-white hover:border-blue-300 transition-colors">
              <SelectValue placeholder="请选择收货地址" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {savedAddresses.map((addr) => (
                <SelectItem key={addr.id} value={addr.id} className="py-2.5">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-gray-800 text-sm">{addr.label || "地址"}</span>
                    <span className="text-xs text-gray-500 line-clamp-2">
                      {formatAddressPreview(addr)}
                    </span>
                  </div>
                </SelectItem>
              ))}
              <SelectItem value="__new__" className="py-2.5">
                <div className="flex items-center gap-2 text-blue-600">
                  <PlusCircle className="w-4 h-4" />
                  <span className="font-medium">输入新地址</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          {selectedAddr && (
            <div className="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50/80 to-blue-100/50 p-3.5 shadow-sm">
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800 text-sm">{selectedAddr.label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">已选择</span>
                  </div>
                  <div className="text-xs text-gray-600 leading-relaxed whitespace-pre-line break-words">
                    {formatAddressPreview(selectedAddr)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );




























































}

function formatAddressPreview(addr) {
  return [addr.recipient_name, addr.phone, addr.country, addr.state, addr.addr3, addr.addr2, addr.addr1].filter(Boolean).join("\n");
}