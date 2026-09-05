/**
 * OrderDetailPanel - Displays order details in a popover triggered by a small button
 * Shows: destination address, transit shipping method, addons, and notes
 */
import { useState, useRef, useEffect } from "react";
import { Info, Truck, Tag, FileText, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCountry } from "@/lib/countries";

import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function OrderDetailPanel({ order, pool }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef(null);
  const { user } = useCurrentUser();

  // Find the user group this order belongs to
  const userGroup = (pool.per_user_groups || []).find(g => g.user_email === order.user_email);
  
  // Extract order-level details from per_user_groups (group-level settings)
  const transitMethod = userGroup?.transit_shipping_method_name || order.pre_shipment?.transit_shipping_method_name;
  const orderAddons = userGroup?.selected_addons || order.selected_addons || [];
  const orderNote = userGroup?.note || order.pre_shipment?.user_note;
  
  // Get address from group_final_address or pre_shipment
  const addr = userGroup?.group_final_address || order.pre_shipment?.address || {};
  const destinationCountry = addr.country || order.destination_country;
  
  // Check if current user owns this order
  const isOwner = user?.email === order.user_email;
  
  // Only show detailed info if user owns this order
  const displayAddr = isOwner ? addr : {};
  const displayTransitMethod = isOwner ? transitMethod : null;
  const displayAddons = isOwner ? orderAddons : [];
  const displayNote = isOwner ? orderNote : null;
  
  const hasDetails = displayAddr.recipient_name || displayAddr.addr1 || destinationCountry || displayTransitMethod || displayAddons.length > 0 || displayNote;
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  if (!hasDetails) return null;
  
  return (
    <div ref={panelRef} className="relative">
      {/* Small info button */}
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Info className="w-3.5 h-3.5" />
      </Button>
      
      {/* Popover panel */}
      {isOpen && (
        <div className="absolute right-0 top-8 z-50 w-80 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 flex items-center justify-between bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
              <MapPin className="w-3.5 h-3.5" />
              <span>中转发货信息</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-5 w-5 p-0 hover:bg-gray-200"
              onClick={() => setIsOpen(false)}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
          
          {/* Content */}
          <div className="p-3 space-y-3 text-xs max-h-96 overflow-y-auto">
            {!isOwner && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-center text-gray-500">
                <p className="text-xs">此包裹不属于您，详细信息已隐藏</p>
              </div>
            )}
            
            {isOwner && (displayAddr.recipient_name || displayAddr.addr1 || destinationCountry) && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-blue-700 mb-1">
                  <MapPin className="w-3.5 h-3.5" />
                  发货目的地
                </div>
                {displayAddr.recipient_name && (
                  <div>
                    <span className="text-gray-500">收件人：</span>
                    <span className="font-medium">{displayAddr.recipient_name}</span>
                    {displayAddr.phone && <span className="ml-2 text-gray-600">{displayAddr.phone}</span>}
                  </div>
                )}
                {destinationCountry && (
                  <div>
                    <span className="text-gray-500">国家：</span>
                    <span className="font-medium">{getCountry(destinationCountry)?.name || destinationCountry}</span>
                  </div>
                )}
                {displayAddr.addr1 && (
                  <div className="whitespace-pre-wrap text-gray-700">
                    {displayAddr.addr1}{displayAddr.addr2 && ` ${displayAddr.addr2}`}{displayAddr.addr3 && ` ${displayAddr.addr3}`}{displayAddr.state && `, ${displayAddr.state}`}
                  </div>
                )}
              </div>
            )}
            
            {isOwner && displayTransitMethod && (
              <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5 font-medium text-purple-700 mb-1">
                  <Truck className="w-3.5 h-3.5" />
                  中转运输方式
                </div>
                <div className="text-gray-700">{displayTransitMethod}</div>
              </div>
            )}
            
            {isOwner && displayAddons.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2 space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-yellow-700">
                  <Tag className="w-3.5 h-3.5" />
                  增值服务
                </div>
                {displayAddons.map((addon, idx) => (
                  <div key={idx} className="flex items-center justify-between text-gray-700">
                    <span>{addon.service_name || addon.id}</span>
                    {parseFloat(addon.fee) > 0 && (
                      <span className="font-medium text-yellow-700">+{addon.fee_currency || "JPY"} {Math.round(parseFloat(addon.fee))}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {isOwner && displayNote && (
              <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5 font-medium text-gray-600 mb-1">
                  <FileText className="w-3.5 h-3.5" />
                  备注
                </div>
                <p className="text-gray-700 whitespace-pre-wrap">{displayNote}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}