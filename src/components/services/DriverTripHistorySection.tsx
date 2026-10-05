import React, { useState, useMemo } from 'react';
import {
  History,
  MapPin,
  Navigation,
  Calendar,
  Clock,
  Car,
  Plane,
  Package,
  Star,
  Search,
  ChevronDown,
  ChevronUp,
  Receipt,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  Award,
  Filter,
  Download,
  Share2,
  FileText,
  X,
} from 'lucide-react';

export interface DriverCompletedTrip {
  id: string;
  tripCode: string;
  date: 'Today' | 'Yesterday' | string;
  time: string;
  riderName: string;
  riderAvatar?: string;
  riderNvId: string;
  serviceType: 'ride' | 'airport_vip' | 'delivery';
  pickupRoute: string;
  dropoffRoute: string;
  distanceKm: number;
  durationMins: number;
  baseFareGHS: number;
  distanceFareGHS: number;
  surgeMultiplier: number;
  finalFareGHS: number;
  paymentMethod: 'Nanivio Wallet' | 'MTN MoMo' | 'Telecel Cash' | 'Cash';
  paymentStatus: 'Settled' | 'Paid';
  ratingByDriver?: number;
}

export const INITIAL_DRIVER_TRIP_HISTORY: DriverCompletedTrip[] = [];

interface DriverTripHistorySectionProps {
  trips: DriverCompletedTrip[];
}

export const DriverTripHistorySection: React.FC<DriverTripHistorySectionProps> = ({ trips }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<'all' | 'Today' | 'Yesterday'>('all');
  const [selectedServiceFilter, setSelectedServiceFilter] = useState<'all' | 'ride' | 'airport_vip' | 'delivery'>('all');
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [viewReceiptModalTrip, setViewReceiptModalTrip] = useState<DriverCompletedTrip | null>(null);

  // Filtered trips
  const filteredTrips = useMemo(() => {
    return trips.filter((trip) => {
      const matchesSearch =
        trip.tripCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        trip.riderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        trip.pickupRoute.toLowerCase().includes(searchQuery.toLowerCase()) ||
        trip.dropoffRoute.toLowerCase().includes(searchQuery.toLowerCase()) ||
        trip.riderNvId.includes(searchQuery);

      const matchesDate = selectedDateFilter === 'all' || trip.date === selectedDateFilter;
      const matchesService = selectedServiceFilter === 'all' || trip.serviceType === selectedServiceFilter;

      return matchesSearch && matchesDate && matchesService;
    });
  }, [trips, searchQuery, selectedDateFilter, selectedServiceFilter]);

  // Aggregate stats
  const totalEarned = useMemo(() => trips.reduce((acc, curr) => acc + curr.finalFareGHS, 0), [trips]);
  const totalKm = useMemo(() => trips.reduce((acc, curr) => acc + curr.distanceKm, 0), [trips]);
  const avgFare = trips.length > 0 ? totalEarned / trips.length : 0;

  const toggleExpand = (id: string) => {
    setExpandedTripId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
      {/* 1. Header with Stats Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400" />
            <h4 className="text-sm sm:text-base font-extrabold text-white">Trip History &amp; Completed Rides</h4>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
              {trips.length} Total Logged
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Review detailed records of completed journeys, exact routes, passenger NV IDs, and net earnings.
          </p>
        </div>

        {/* Quick Commission Pill */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-emerald-500/30 text-xs">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-slate-400">Driver Commission:</span>
          <span className="font-bold text-emerald-400">0% Retained</span>
        </div>
      </div>

      {/* 2. Key Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-0.5">
          <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
            <span>Historical Gross</span>
            <DollarSign className="w-3 h-3 text-emerald-400" />
          </div>
          <div className="text-base font-black text-emerald-400 font-mono">
            GH₵ {totalEarned.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500">100% Net Take-Home</div>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-0.5">
          <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
            <span>Completed Trips</span>
            <CheckCircle2 className="w-3 h-3 text-blue-400" />
          </div>
          <div className="text-base font-black text-white font-mono">{trips.length} Rides</div>
          <div className="text-[10px] text-emerald-400 font-semibold">100% Completion Rate</div>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-0.5">
          <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
            <span>Total Distance</span>
            <Navigation className="w-3 h-3 text-cyan-400" />
          </div>
          <div className="text-base font-black text-white font-mono">{totalKm.toFixed(1)} km</div>
          <div className="text-[10px] text-slate-400">Urban &amp; Expressway Trips</div>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-0.5">
          <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
            <span>Average Fare</span>
            <Award className="w-3 h-3 text-amber-400" />
          </div>
          <div className="text-base font-black text-amber-300 font-mono">
            GH₵ {avgFare.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500">Per Trip Average</div>
        </div>
      </div>

      {/* 3. Search Bar & Filters */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by route, rider, or trip code (e.g. Airport, Serwaa, 94821)..."
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedDateFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedDateFilter === 'all'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            All Dates
          </button>
          <button
            onClick={() => setSelectedDateFilter('Today')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedDateFilter === 'Today'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setSelectedDateFilter('Yesterday')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedDateFilter === 'Yesterday'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Yesterday
          </button>
        </div>

        {/* Service Type Filter */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedServiceFilter('all')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedServiceFilter === 'all'
                ? 'bg-teal-500 text-slate-950 shadow-sm'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            All Types
          </button>
          <button
            onClick={() => setSelectedServiceFilter('airport_vip')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
              selectedServiceFilter === 'airport_vip'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Plane className="w-3 h-3" />
            <span>VIP</span>
          </button>
          <button
            onClick={() => setSelectedServiceFilter('ride')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
              selectedServiceFilter === 'ride'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Car className="w-3 h-3" />
            <span>Rides</span>
          </button>
          <button
            onClick={() => setSelectedServiceFilter('delivery')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
              selectedServiceFilter === 'delivery'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Package className="w-3 h-3" />
            <span>Courier</span>
          </button>
        </div>
      </div>

      {/* 4. Trips List */}
      <div className="space-y-3">
        {filteredTrips.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <History className="w-8 h-8 text-slate-600 mx-auto" />
            <div className="text-sm font-bold text-white">No completed trips found</div>
            <p className="text-xs text-slate-400">
              No trips match your current filter or search criteria.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedDateFilter('all');
                setSelectedServiceFilter('all');
              }}
              className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 text-xs font-bold border border-slate-700 cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          filteredTrips.map((trip) => {
            const isExpanded = expandedTripId === trip.id;

            return (
              <div
                key={trip.id}
                className="p-3.5 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-all space-y-3 shadow-md"
              >
                {/* Top Row: Trip Code, Service Badge, Date & Time, Final Fare */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-900">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-slate-300 font-mono font-bold text-[11px] border border-slate-800">
                      {trip.tripCode}
                    </span>

                    {trip.serviceType === 'airport_vip' && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px] flex items-center gap-1 border border-amber-500/30">
                        <Plane className="w-3 h-3" />
                        <span>Airport VIP Transfer</span>
                      </span>
                    )}

                    {trip.serviceType === 'ride' && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] flex items-center gap-1 border border-emerald-500/30">
                        <Car className="w-3 h-3" />
                        <span>Standard Ride</span>
                      </span>
                    )}

                    {trip.serviceType === 'delivery' && (
                      <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold text-[10px] flex items-center gap-1 border border-cyan-500/30">
                        <Package className="w-3 h-3" />
                        <span>Express Parcel Delivery</span>
                      </span>
                    )}

                    {trip.surgeMultiplier > 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 font-bold border border-amber-500/20">
                        +{trip.surgeMultiplier}x Surge
                      </span>
                    )}
                  </div>

                  {/* Date, Time & Fare */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{trip.date} • {trip.time}</span>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-black text-emerald-400 font-mono">
                        GH₵ {trip.finalFareGHS.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Middle: Route Details (Pickup -> Dropoff) */}
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-2 text-xs">
                  {/* Pickup */}
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] uppercase font-bold text-slate-500">Pickup Origin</div>
                      <div className="font-semibold text-slate-200 truncate sm:whitespace-normal">
                        {trip.pickupRoute}
                      </div>
                    </div>
                  </div>

                  {/* Route connector */}
                  <div className="ml-1.5 pl-3 border-l border-dashed border-slate-700 py-0.5 text-[10px] text-slate-400 flex items-center gap-2">
                    <span className="font-mono font-bold text-emerald-400">{trip.distanceKm} km</span>
                    <span>•</span>
                    <span>{trip.durationMins} mins duration</span>
                  </div>

                  {/* Destination */}
                  <div className="flex items-start gap-2.5">
                    <Navigation className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] uppercase font-bold text-slate-500">Drop-off Destination</div>
                      <div className="font-semibold text-slate-200 truncate sm:whitespace-normal">
                        {trip.dropoffRoute}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom: Rider Info, Payment Settlement, Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
                  {/* Rider Profile */}
                  <div className="flex items-center gap-2">
                    {trip.riderAvatar ? (
                      <img
                        src={trip.riderAvatar}
                        alt={trip.riderName}
                        className="w-7 h-7 rounded-full object-cover border border-slate-700"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center font-bold text-white text-[10px]">
                        {trip.riderName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white">{trip.riderName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">NV {trip.riderNvId}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-amber-400">
                        <Star className="w-3 h-3 fill-amber-400" />
                        <span>Driver rated: {trip.ratingByDriver || 5}.0 ★</span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Method & Breakdown Actions */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px]">
                      <span className="text-slate-400">Paid via:</span>
                      <strong className="text-slate-200">{trip.paymentMethod}</strong>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" />
                      <span className="text-emerald-400 font-medium">{trip.paymentStatus}</span>
                    </div>

                    <button
                      onClick={() => toggleExpand(trip.id)}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white font-semibold text-[11px] border border-slate-800 cursor-pointer flex items-center gap-1 transition-all"
                    >
                      <Receipt className="w-3 h-3 text-emerald-400" />
                      <span>{isExpanded ? 'Hide Breakdown' : 'Fare Breakdown'}</span>
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    <button
                      onClick={() => setViewReceiptModalTrip(trip)}
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 border border-slate-800 cursor-pointer transition-all"
                      title="View Official Nanivio Trip Receipt"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded Itemized Receipt Breakdown */}
                {isExpanded && (
                  <div className="p-3.5 rounded-xl bg-slate-900/95 border border-emerald-500/30 space-y-2 text-xs font-mono animate-fadeIn">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1.5">
                      <span className="font-sans font-bold text-slate-300">Itemized Fare Breakdown</span>
                      <span>Official Driver Ledger</span>
                    </div>

                    <div className="flex justify-between text-slate-400">
                      <span>Base Pickup Fare:</span>
                      <span>GH₵ {trip.baseFareGHS.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-slate-400">
                      <span>Distance Fare ({trip.distanceKm} km @ GH₵ 5.00/km):</span>
                      <span>GH₵ {trip.distanceFareGHS.toFixed(2)}</span>
                    </div>

                    {trip.surgeMultiplier > 1 && (
                      <div className="flex justify-between text-amber-400">
                        <span>Surge Zone Multiplier ({trip.surgeMultiplier}x):</span>
                        <span>
                          +GH₵ {(trip.finalFareGHS - trip.baseFareGHS - trip.distanceFareGHS).toFixed(2)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between text-emerald-400">
                      <span>Nanivio Driver Commission (0% Promo):</span>
                      <span>GH₵ 0.00</span>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex justify-between font-bold text-white text-sm">
                      <span>Driver Net Take-Home (Settled):</span>
                      <span className="text-emerald-400">GH₵ {trip.finalFareGHS.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 5. Official Trip Receipt Modal */}
      {viewReceiptModalTrip && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full p-5 rounded-3xl bg-slate-950 border border-emerald-500/40 shadow-2xl space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-black text-white">Nanivio Official Trip Receipt</h3>
              </div>
              <button
                onClick={() => setViewReceiptModalTrip(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center py-2 space-y-1">
              <div className="text-xs text-slate-400">Final Fare Collected</div>
              <div className="text-3xl font-black text-emerald-400 font-mono">
                GH₵ {viewReceiptModalTrip.finalFareGHS.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500">
                Receipt Code: {viewReceiptModalTrip.tripCode}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Date &amp; Time:</span>
                <span className="text-white font-semibold">{viewReceiptModalTrip.date} at {viewReceiptModalTrip.time}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Driver:</span>
                <span className="text-white font-semibold">Kofi Mensah (NV 0486821940)</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Vehicle:</span>
                <span className="text-white font-semibold">Silver Toyota Corolla · GN 4821-24</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Passenger:</span>
                <span className="text-white font-semibold">{viewReceiptModalTrip.riderName} (NV {viewReceiptModalTrip.riderNvId})</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Payment Settlement:</span>
                <span className="text-emerald-400 font-semibold">{viewReceiptModalTrip.paymentMethod} ({viewReceiptModalTrip.paymentStatus})</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1 text-xs">
              <div className="text-[10px] uppercase font-bold text-slate-500">Route Traveled</div>
              <div className="text-slate-300">From: {viewReceiptModalTrip.pickupRoute}</div>
              <div className="text-slate-300">To: {viewReceiptModalTrip.dropoffRoute}</div>
              <div className="text-[11px] text-emerald-400 pt-1 font-mono">
                Distance: {viewReceiptModalTrip.distanceKm} km · Duration: {viewReceiptModalTrip.durationMins} mins
              </div>
            </div>

            <button
              onClick={() => setViewReceiptModalTrip(null)}
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs cursor-pointer shadow-md transition-all"
            >
              Close Receipt
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
