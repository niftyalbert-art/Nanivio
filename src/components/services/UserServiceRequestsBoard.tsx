import React, { useState } from 'react';
import {
  Car,
  Package,
  Plane,
  Wrench,
  Clock,
  MapPin,
  Navigation,
  DollarSign,
  Phone,
  Shield,
  Star,
  CheckCircle2,
  Filter,
  Send,
  Sparkles,
  Radio,
  Search,
  ChevronRight,
} from 'lucide-react';
import { UserServiceRequestPin } from './NanivioDriverMapViewer';

export interface UserMarketplaceRequest extends UserServiceRequestPin {
  userNvId: string;
  userPhone: string;
  requestedTime: string;
  notes: string;
  paymentMethod: 'Nanivio Wallet' | 'MTN MoMo' | 'Cash';
  seatsRequired?: number;
  packageWeightKg?: number;
}

export const INITIAL_USER_REQUESTS: UserMarketplaceRequest[] = [];

interface UserServiceRequestsBoardProps {
  requests?: UserMarketplaceRequest[];
  onAcceptRequest: (request: UserMarketplaceRequest) => void;
  onCallUser: (phone: string, nvId: string, name: string) => void;
  onSendCustomOffer?: (requestId: string, offerGHS: number) => void;
}

export const UserServiceRequestsBoard: React.FC<UserServiceRequestsBoardProps> = ({
  requests = INITIAL_USER_REQUESTS,
  onAcceptRequest,
  onCallUser,
  onSendCustomOffer,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [customOfferReqId, setCustomOfferReqId] = useState<string | null>(null);
  const [customOfferAmount, setCustomOfferAmount] = useState<string>('50');
  const [offerSentIds, setOfferSentIds] = useState<string[]>([]);

  // Driver Broadcast Announcement State
  const [showBroadcastModal, setShowBroadcastModal] = useState<boolean>(false);
  const [broadcastMessage, setBroadcastMessage] = useState<string>(
    'Available near Kotoka Airport T3 · Executive Silver Toyota Corolla with AC & high luggage capacity ready for instant pickup.'
  );
  const [broadcastSent, setBroadcastSent] = useState<boolean>(false);

  const filteredRequests = requests.filter((r) => {
    const matchesCategory = selectedCategory === 'all' || r.serviceType === selectedCategory;
    const matchesQuery =
      r.riderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.pickupLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.dropoffLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.notes.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  const handleSendCounterOffer = (reqId: string) => {
    if (onSendCustomOffer) {
      onSendCustomOffer(reqId, Number(customOfferAmount));
    }
    setOfferSentIds((prev) => [...prev, reqId]);
    setCustomOfferReqId(null);
  };

  const handlePublishBroadcast = () => {
    setBroadcastSent(true);
    setTimeout(() => {
      setBroadcastSent(false);
      setShowBroadcastModal(false);
    }, 2000);
  };

  return (
    <div className="p-4 sm:p-5 rounded-3xl bg-slate-950/90 border border-slate-800 space-y-4 shadow-2xl">
      {/* Header with Broadcast Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
            <h3 className="text-sm font-extrabold text-white">Live User Service Requests Board</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
              {filteredRequests.length} Active in Accra
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time ride, parcel, and VIP transfer requests posted by Nanivio passengers waiting for drivers.
          </p>
        </div>

        {/* Broadcast Driver Availability Button */}
        <button
          onClick={() => setShowBroadcastModal(true)}
          className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-500/20 transition-all shrink-0"
        >
          <Sparkles className="w-4 h-4" />
          <span>Broadcast My Car to Riders</span>
        </button>
      </div>

      {/* Category Filter Pills & Search */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedCategory === 'all'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            All Requests ({requests.length})
          </button>
          <button
            onClick={() => setSelectedCategory('airport_vip')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              selectedCategory === 'airport_vip'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Plane className="w-3.5 h-3.5" />
            <span>Airport VIP</span>
          </button>
          <button
            onClick={() => setSelectedCategory('ride')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              selectedCategory === 'ride'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Car className="w-3.5 h-3.5" />
            <span>Standard Rides</span>
          </button>
          <button
            onClick={() => setSelectedCategory('delivery')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              selectedCategory === 'delivery'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Parcel Express</span>
          </button>
          <button
            onClick={() => setSelectedCategory('roadside')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              selectedCategory === 'roadside'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Roadside Help</span>
          </button>
        </div>

        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by location, rider, notes..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      {/* Requests Feed Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {filteredRequests.map((req) => {
          const isSent = offerSentIds.includes(req.id);

          return (
            <div
              key={req.id}
              className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/40 transition-all space-y-3 flex flex-col justify-between group shadow-lg"
            >
              {/* Top User Profile & Fare */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <img
                    src={req.riderAvatar}
                    alt={req.riderName}
                    className="w-10 h-10 rounded-xl object-cover border border-slate-700"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-extrabold text-white">{req.riderName}</h4>
                      <span className="text-[10px] text-slate-400 font-mono">NV {req.userNvId}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1 text-amber-400 font-bold">
                        <Star className="w-3 h-3 fill-amber-400" />
                        <span>{req.riderRating}</span>
                      </span>
                      <span>•</span>
                      <span className="text-emerald-400 font-medium">{req.distanceAway}</span>
                    </div>
                  </div>
                </div>

                {/* Guaranteed Fare */}
                <div className="text-right">
                  <div className="text-base font-extrabold text-emerald-400 font-mono">
                    GH₵ {req.fareGHS.toFixed(2)}
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-bold border border-emerald-500/20 uppercase">
                    0% Commission
                  </span>
                </div>
              </div>

              {/* Pickup & Destination Timeline */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[9px] uppercase font-bold text-slate-500">Pickup</div>
                    <div className="font-semibold text-slate-200">{req.pickupLabel}</div>
                  </div>
                </div>

                <div className="ml-1.5 pl-2.5 border-l border-dashed border-slate-700 h-1.5" />

                <div className="flex items-start gap-2">
                  <Navigation className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[9px] uppercase font-bold text-slate-500">Destination</div>
                    <div className="font-semibold text-slate-200">{req.dropoffLabel}</div>
                  </div>
                </div>
              </div>

              {/* Notes & Special Requests */}
              <div className="text-[11px] text-slate-300 italic bg-slate-950/40 p-2 rounded-lg border border-slate-800/50">
                "{req.notes}"
              </div>

              {/* Language & Payment Pill */}
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="text-emerald-400 font-semibold">{req.riderLanguage}</span>
                <span>Payment: <strong className="text-white">{req.paymentMethod}</strong></span>
              </div>

              {/* Counter Offer Input if open */}
              {customOfferReqId === req.id && (
                <div className="p-3 rounded-xl bg-slate-950 border border-amber-500/40 space-y-2 animate-fadeIn">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Send Custom Price Proposal:</span>
                    <button
                      onClick={() => setCustomOfferReqId(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-mono font-bold text-sm">GH₵</span>
                    <input
                      type="number"
                      value={customOfferAmount}
                      onChange={(e) => setCustomOfferAmount(e.target.value)}
                      className="w-24 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono font-bold text-white"
                    />
                    <button
                      onClick={() => handleSendCounterOffer(req.id)}
                      className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-all cursor-pointer"
                    >
                      Send Offer to Rider
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {/* Direct Call with Langpretation */}
                <button
                  onClick={() => onCallUser(req.userPhone, req.userNvId, req.riderName)}
                  className="py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-emerald-400 font-bold text-xs flex items-center justify-center gap-1.5 border border-emerald-500/30 cursor-pointer"
                  title="Call user with live Langpretation"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Call</span>
                </button>

                {/* Counter Offer */}
                <button
                  onClick={() => {
                    setCustomOfferReqId(req.id);
                    setCustomOfferAmount((req.fareGHS + 10).toString());
                  }}
                  className="py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center gap-1 border border-slate-800 cursor-pointer"
                >
                  <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                  <span>Quote</span>
                </button>

                {/* Accept & Claim Request */}
                <button
                  onClick={() => onAcceptRequest(req)}
                  className={`py-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all ${
                    isSent
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isSent ? 'Offer Sent' : 'Accept'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* DRIVER BROADCAST MODAL */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full p-5 rounded-3xl bg-slate-950 border border-emerald-500/40 shadow-2xl space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-extrabold text-white">Broadcast Vehicle to Nearby Users</h3>
              </div>
              <button
                onClick={() => setShowBroadcastModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {!broadcastSent ? (
              <>
                <p className="text-xs text-slate-400">
                  Broadcast your active location and vehicle capabilities to all Nanivio users within 5 km looking for rides, airport pickups, or parcel deliveries.
                </p>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Broadcast Announcement Message:</label>
                  <textarea
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    rows={3}
                    className="w-full p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1">
                  <div className="text-slate-400">Vehicle Profile Dispatched:</div>
                  <div className="font-bold text-white">Silver Toyota Corolla · Plate GN 4821-24</div>
                  <div className="text-[11px] text-emerald-400">Driver assignment will appear here after a verified live dispatch match.</div>
                </div>

                <button
                  onClick={handlePublishBroadcast}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20"
                >
                  <Send className="w-4 h-4" />
                  <span>Dispatch Broadcast Radar Ping</span>
                </button>
              </>
            ) : (
              <div className="text-center py-5 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto animate-bounce" />
                <h4 className="text-sm font-bold text-white">Broadcast Dispatched Successfully!</h4>
                <p className="text-xs text-slate-400">
                  Your availability is now highlighted on the live maps of riders in Accra.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
