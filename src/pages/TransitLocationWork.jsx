/**
 * TransitLocationWork - Transit location manager work panel
 * Route: /TransitLocationWork/:transit_location_id
 * Only accessible by assigned transit location manager
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { timePage } from "@/lib/timing";
import { 
  Package, CheckCircle, Clock, Truck, Calendar, 
  MapPin, Scale, Image as ImageIcon, AlertCircle,
  Upload, Loader2, ChevronRight, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCountry } from "@/lib/countries";
import TransitPoolCard from "@/components/transit/TransitPoolCard";
import { tenantEntity, transitLocationApi } from "@/lib/tenantApi";

const TRANSIT_STATUS_TABS = [
  { key: "pending", label: "待处理", count: 0 },
  { key: "in_transit", label: "日本已发往中转地", count: 0 },
  { key: "arrived", label: "中转地已收货", count: 0 },
  { key: "forwarded", label: "中转地已发货", count: 0 },
];

export default function TransitLocationWork() {
  const { transit_location_id } = useParams();
  const navigate = useNavigate();
  const locationState = useLocation();
  const { user } = useCurrentUser();
  
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState(null);
  const [requests, setRequests] = useState([]);
  const [transitMethods, setTransitMethods] = useState([]);
  const [addonOptions, setAddonOptions] = useState([]);
  const [activeTab, setActiveTab] = useState("pending");
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [selectedRequests, setSelectedRequests] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [arrivalImages, setArrivalImages] = useState([]);
  const [arrivalNote, setArrivalNote] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const t = timePage('TransitLocationWork');
    try {
      const payload = { id: transit_location_id };
      console.log('[TransitLocationWork] Calling getTransitLocationWorkPageData with payload:', payload);
      // const r = await base44.functions.invoke('getTransitLocationWorkPageData', payload);
      const r = await transitLocationApi.workDataId(transit_location_id);
      console.log('[TransitLocationWork] Response status:', r?.status);
      console.log('[TransitLocationWork] Response data:', r?.data);
      
      // if (!r?.data || !r?.data?.location) {
      //   console.warn('[TransitLocationWork] No location in response, navigating home');
      //   navigate("/Home");
      //   return;
      // }
      
      setLocation(r?.locations[0] || []);
      setRequests(r?.requestsByLocation || []); //Shipping Pools
      setTransitMethods(r?.transitMethods || []);
      setAddonOptions(r?.addonOptions || []);
      t.done('data ready');
    } catch (error) {
      console.error('[TransitLocationWork] Error fetching data:', error);
      console.error('[TransitLocationWork] Error name:', error.name);
      console.error('[TransitLocationWork] Error message:', error.message);
      console.error('[TransitLocationWork] Error response:', error.response);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !transit_location_id) return;
    fetchData();
  }, [user, transit_location_id]);

  // Refresh data when navigating back from TransitPoolWork with refresh flag
  useEffect(() => {
    if (locationState.state?.refresh) {
      fetchData();
      // Clear the state to avoid unnecessary re-refreshes
      navigate(locationState.pathname, { replace: true, state: {} });
    }
  }, [locationState]);

  // Categorize requests by transit status - show ALL requests assigned to this transit location
  // regardless of their GroupBuyRequest status (open, completed, cancelled, expired)
  const requestsByStatus = {
    // Pending: not yet arrived at transit location (includes open, completed, and even cancelled/expired)
    pending: requests.filter(r => 
      !r.transit_arrival_confirmed_at && 
      !r.transit_shipped_date && 
      (r.status === "open" || r.status === "completed" || r.status === 'ready_to_ship')
    ),
    // In transit: completed and shipped from Japan, but transit location hasn't confirmed arrival
    in_transit: requests.filter(r => 
      (r.status === "completed" || r.status === 'shipped')&& 
      !r.transit_arrival_confirmed_at
    ),
    // Arrived: transit location confirmed receipt
    arrived: requests.filter(r => r.transit_arrival_confirmed_at && !r.transit_shipped_date),
    // Forwarded: transit location has shipped to final destination
    forwarded: requests.filter(r => r.transit_shipped_date),
  };

  // Update tab counts - show real-time counts for all status tabs
  const tabsWithCounts = TRANSIT_STATUS_TABS.map(tab => ({
    ...tab,
    count: requestsByStatus[tab.key]?.length || 0,
  }));

  // Debug logging for development
  useEffect(() => {
    console.log('[TransitLocationWork] Request distribution:', {
      total: requests.length,
      pending: requestsByStatus.pending.length,
      in_transit: requestsByStatus.in_transit.length,
      arrived: requestsByStatus.arrived.length,
      forwarded: requestsByStatus.forwarded.length,
    });
    console.log('[TransitLocationWork] All requests:', requests);
  }, [requests]);

  const handleBulkArrivalConfirm = async () => {
    if (selectedRequests.length === 0) return;
    
    setSaving(true);
    try {
      // Upload images first
      let imageUrls = [];
      if (arrivalImages.length > 0) {
        setUploading(true);
        const uploadPromises = arrivalImages.map(file => 
          base44.integrations.Core.UploadFile({ file })
            .then(r => r.file_url)
        );
        imageUrls = await Promise.all(uploadPromises);
        setUploading(false);
      }

      // Update all selected requests using request_ids parameter
      await base44.functions.invoke('updateTransitLocationPool', {
        request_ids: selectedRequests,
        transit_arrival_image_urls: imageUrls,
        transit_arrival_note: arrivalNote,
        action: "confirm_arrival"
      });
      
      // Refresh data
      fetchData();
      setShowArrivalModal(false);
      setSelectedRequests([]);
      setArrivalImages([]);
      setArrivalNote("");
    } catch (error) {
      console.error('Failed to confirm arrival:', error);
      alert('确认收货失败：' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!location) {
    return null;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/AdminTransitWork")}>
            ← 返回
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {location.name} - 中转地工作面板
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              负责人：{user.full_name || user.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-purple-100 text-purple-700">
            <MapPin className="w-3 h-3 mr-1" />
            {location.code_prefix || "无代号"}
          </Badge>
          {location.allow_storage && (
            <Badge className="bg-blue-100 text-blue-600">可暂存</Badge>
          )}
        </div>
      </div>

      {/* Status Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList className="flex w-full max-w-xl">
            {tabsWithCounts.map(tab => (
              <TabsTrigger key={tab.key} value={tab.key} className="relative flex-1 min-w-0">
                <span className="truncate">{tab.label}</span>
                {tab.count > 0 && (
                  <span className="ml-1.5 text-xs bg-white/30 px-1.5 py-0.5 rounded-full">
                    {tab.count}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {activeTab === "in_transit" && requestsByStatus.in_transit.length > 0 && (
            <Button 
              size="sm" 
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                setSelectedRequests(requestsByStatus.in_transit.map(r => r.id));
                setShowArrivalModal(true);
              }}
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
              批量确认收货
            </Button>
          )}
          
          {activeTab === "pending" && requestsByStatus.pending.length > 0 && (
            <Badge className="bg-orange-100 text-orange-700 text-xs">
              <Clock className="w-3 h-3 mr-1" />
              待处理 {requestsByStatus.pending.length} 个
            </Badge>
          )}
        </div>

        {/* Pending Tab */}
        <TabsContent value="pending" className="space-y-4">
          {requestsByStatus.pending.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-gray-400">
              <Clock className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">暂无待处理的拼单</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {requestsByStatus.pending.map(request => (
                <TransitPoolCard 
                  key={request.id} 
                  pool={request} 
                  transitStatus="pending"
                  onClick={() => navigate(`/Trworkon/${request.pool_code || request.id}`)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Arrived Tab */}
        <TabsContent value="arrived" className="space-y-4">
          {requestsByStatus.arrived.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-gray-400">
              <CheckCircle className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">暂无已收货的拼单</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {requestsByStatus.arrived.map(request => (
                <TransitPoolCard 
                  key={request.id} 
                  pool={request} 
                  transitStatus="arrived"
                  onClick={() => navigate(`/Trworkon/${request.pool_code || request.id}`)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* In Transit Tab */}
        <TabsContent value="in_transit" className="space-y-4">
          {requestsByStatus.in_transit.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-gray-400">
              <Truck className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">暂无在途拼单</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {requestsByStatus.in_transit.map(request => (
                <TransitPoolCard 
                  key={request.id} 
                  pool={request} 
                  transitStatus="in_transit"
                  isSelected={selectedRequests.includes(request.id)}
                  onToggleSelect={(id) => {
                    setSelectedRequests(prev => 
                      prev.includes(id) 
                        ? prev.filter(pid => pid !== id)
                        : [...prev, id]
                    );
                  }}
                  onClick={() => navigate(`/Trworkon/${request.pool_code || request.id}`)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Forwarded Tab */}
        <TabsContent value="forwarded" className="space-y-4">
          {requestsByStatus.forwarded.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-gray-400">
              <Package className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">暂无已转发包裹</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {requestsByStatus.forwarded.map(request => (
                <TransitPoolCard 
                  key={request.id} 
                  pool={request} 
                  transitStatus="forwarded"
                  onClick={() => {}}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Bulk Arrival Confirmation Modal */}
      {showArrivalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  确认收货 ({selectedRequests.length} 个拼单)
                </h2>
                <button 
                  onClick={() => setShowArrivalModal(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-5 space-y-4">
              {/* Image Upload */}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  到货照片（可选）
                </label>
                <div className="mt-2">
                  {uploading ? (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      上传中...
                    </div>
                  ) : (
                    <label className="cursor-pointer block">
                      <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-blue-300 transition-colors">
                        <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                        <p className="text-sm text-gray-500">点击选择图片或拖拽到此处</p>
                      </div>
                      <input 
                        type="file" 
                        accept="image/*" 
                        multiple 
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          setArrivalImages(prev => [...prev, ...files]);
                        }}
                      />
                    </label>
                  )}
                  
                  {/* Preview uploaded images */}
                  {arrivalImages.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {arrivalImages.map((file, idx) => (
                        <div key={idx} className="relative">
                          <img 
                            src={URL.createObjectURL(file)} 
                            alt={`Preview ${idx}`}
                            className="w-20 h-20 object-cover rounded border"
                          />
                          <button
                            onClick={() => setArrivalImages(prev => prev.filter((_, i) => i !== idx))}
                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  到货备注（可选）
                </label>
                <textarea
                  value={arrivalNote}
                  onChange={(e) => setArrivalNote(e.target.value)}
                  placeholder="描述货物状态、包装情况等..."
                  rows={3}
                  className="mt-1 w-full border rounded-lg p-2 text-sm"
                />
              </div>

              {/* Selected pools summary */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  将确认以下拼单已到达中转地：
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {selectedRequests.map(requestId => {
                    const request = requests.find(r => r.id === requestId);
                    return request ? (
                      <div key={requestId} className="text-xs text-gray-600 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        <span className="truncate">{request.title || request.id.slice(-6)}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            </div>

            <div className="p-5 border-t flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => setShowArrivalModal(false)}
              >
                取消
              </Button>
              <Button 
                className="bg-red-600 hover:bg-red-700"
                onClick={handleBulkArrivalConfirm}
                disabled={saving || uploading}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    确认收货
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}