import React, { useState, useEffect } from 'react';
import {
  Car,
  Power,
  Navigation,
  DollarSign,
  Clock,
  Star,
  CheckCircle2,
  XCircle,
  Phone,
  Shield,
  MapPin,
  TrendingUp,
  Award,
  Zap,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ChevronRight,
  AlertTriangle,
  Wallet,
  Compass,
  Radio,
  Share2,
  Flame,
  MessageSquare,
  FileCheck,
  Key,
  Layers,
  Search,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { NanivioDriverMapViewer, UserServiceRequestPin } from './NanivioDriverMapViewer';
import { UserServiceRequestsBoard, UserMarketplaceRequest, INITIAL_USER_REQUESTS } from './UserServiceRequestsBoard';
import {
  DriverTripHistorySection,
  DriverCompletedTrip,
  INITIAL_DRIVER_TRIP_HISTORY,
} from './DriverTripHistorySection';

interface NanivioDrivePartnerAppProps {
  onCallRider?: (phone: string, nvId: string) => void;
  externalOffer?: any;
  onAcceptOffer?: (offer: any) => void;
  onDriverArrived?: () => void;
  onDriverStartTrip?: () => void;
  onDriverCompleteTrip?: (fare: number) => void;
}

export const NanivioDrivePartnerApp: React.FC<NanivioDrivePartnerAppProps> = ({
  onCallRider,
  externalOffer,
  onAcceptOffer,
  onDriverArrived,
  onDriverStartTrip,
  onDriverCompleteTrip,
}) => {
  // Driver Status & Daily Metrics
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [todayEarnings, setTodayEarnings] = useState<number>(468.5);
  const [completedTripsCount, setCompletedTripsCount] = useState<number>(7);
  const [onlineMinutes, setOnlineMinutes] = useState<number>(255); // 4h 15m
  const [acceptanceRate, setAcceptanceRate] = useState<number>(98.4);
  const [driverRating, setDriverRating] = useState<number>(4.96);

  // Driver Trip History
  const [tripHistory, setTripHistory] = useState<DriverCompletedTrip[]>(() => {
    try {
      const saved = localStorage.getItem('nanivio_driver_trip_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (t: any) =>
              t.riderName &&
              !t.riderName.toLowerCase().includes('grace') &&
              !t.riderName.toLowerCase().includes('nuuy') &&
              !['Ama Serwaa', 'Kwame Asante', 'Dr. Nathaniel Addo', 'Faustina Mensah', 'Jeffrey Blankson', 'Grace Osei', 'Emmanuel Kwarteng'].includes(t.riderName)
          );
        }
      }
    } catch {}
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('nanivio_driver_trip_history', JSON.stringify(tripHistory));
    } catch {}
  }, [tripHistory]);

  // Active View Mode inside Drive Portal: 'cockpit_map' | 'user_requests_board' | 'earnings_wallet' | 'vehicle_docs'
  const [driverViewTab, setDriverViewTab] = useState<'cockpit_map' | 'user_requests_board' | 'earnings_wallet' | 'vehicle_docs'>('cockpit_map');

  // Destination Mode ("Set Destination / Heading Home")
  const [destinationModeActive, setDestinationModeActive] = useState<boolean>(false);
  const [destinationFilterLocation, setDestinationFilterLocation] = useState<string>('Tema Harbor / Community 1');

  // Modals
  const [showCashOutModal, setShowCashOutModal] = useState<boolean>(false);
  const [cashOutSuccess, setCashOutSuccess] = useState<boolean>(false);
  const [showSafetyModal, setShowSafetyModal] = useState<boolean>(false);
  const [showQuickChatModal, setShowQuickChatModal] = useState<boolean>(false);
  const [quickChatSent, setQuickChatSent] = useState<string | null>(null);

  // Rental Settings
  const [enableRentalListing, setEnableRentalListing] = useState<boolean>(true);
  const [dailyRentalRate, setDailyRentalRate] = useState<number>(380);

  // Driver Current GPS Coordinates (Accra - Liberation Road / Airport Bypass)
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number }>({
    lat: 5.6120,
    lng: -0.1690,
  });

  // Speed Simulation
  const [speedKmH, setSpeedKmH] = useState<number>(44);

  // Incoming Trip Request Simulation (Uber Style)
  const [incomingOffer, setIncomingOffer] = useState<{
    id: string;
    fareGHS: number;
    riderName: string;
    riderRating: number;
    riderAvatar: string;
    riderNvId: string;
    riderPhone: string;
    pickupLabel: string;
    pickupLat: number;
    pickupLng: number;
    pickupDistance: string;
    dropoffLabel: string;
    dropoffLat: number;
    dropoffLng: number;
    tripDistance: string;
    riderLanguage: string;
    expiresInSeconds: number;
    surgeMultiplier?: number;
  } | null>(null);

  // Active Accepted Trip State Machine
  const [activeDriverTrip, setActiveDriverTrip] = useState<{
    status: 'HEADING_TO_PICKUP' | 'ARRIVED_AT_PICKUP' | 'IN_TRIP' | 'COMPLETED';
    fareGHS: number;
    baseFareGHS: number;
    distanceFareGHS: number;
    surgeMultiplier: number;
    riderName: string;
    riderAvatar: string;
    riderPhone: string;
    riderNvId: string;
    pickupLabel: string;
    pickupLat: number;
    pickupLng: number;
    dropoffLabel: string;
    dropoffLat: number;
    dropoffLng: number;
    otpInput: string;
    correctOtp: string;
    navStep: string;
    waitTimeSeconds: number;
    isWaitTimerActive: boolean;
    passengerRatingDone?: boolean;
  } | null>(null);

  // User Marketplace Requests for radar pins
  const [userRequests, setUserRequests] = useState<UserMarketplaceRequest[]>(INITIAL_USER_REQUESTS);

  // Countdown timer for incoming offer
  useEffect(() => {
    if (!incomingOffer) return;
    if (incomingOffer.expiresInSeconds <= 0) {
      setIncomingOffer(null);
      return;
    }
    const timer = setInterval(() => {
      setIncomingOffer((prev) => (prev ? { ...prev, expiresInSeconds: prev.expiresInSeconds - 1 } : null));
    }, 1000);
    return () => clearInterval(timer);
  }, [incomingOffer]);

  // Sync external incoming ride offer from Rider Dispatch
  useEffect(() => {
    if (externalOffer && isOnline) {
      setIncomingOffer(externalOffer);
      setDriverViewTab('cockpit_map');
    }
  }, [externalOffer, isOnline]);

  // Wait time counter when arrived at pickup
  useEffect(() => {
    if (!activeDriverTrip || activeDriverTrip.status !== 'ARRIVED_AT_PICKUP') return;
    const interval = setInterval(() => {
      setActiveDriverTrip((prev) =>
        prev && prev.status === 'ARRIVED_AT_PICKUP'
          ? { ...prev, waitTimeSeconds: prev.waitTimeSeconds + 1 }
          : prev
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [activeDriverTrip?.status]);

  // Handle incoming trip simulation
  const handleSimulateIncomingTrip = () => { alert('Live driver dispatch is not connected. No simulated passenger request is created.'); };

  // Accept trip offer
  const handleAcceptTrip = () => {
    if (!incomingOffer) return;
    const accepted = { ...incomingOffer };
    setActiveDriverTrip({
      status: 'HEADING_TO_PICKUP',
      fareGHS: incomingOffer.fareGHS,
      baseFareGHS: 15.0,
      distanceFareGHS: incomingOffer.fareGHS - 15.0,
      surgeMultiplier: incomingOffer.surgeMultiplier || 1.0,
      riderName: incomingOffer.riderName,
      riderAvatar: incomingOffer.riderAvatar,
      riderPhone: incomingOffer.riderPhone,
      riderNvId: incomingOffer.riderNvId,
      pickupLabel: incomingOffer.pickupLabel,
      pickupLat: incomingOffer.pickupLat,
      pickupLng: incomingOffer.pickupLng,
      dropoffLabel: incomingOffer.dropoffLabel,
      dropoffLat: incomingOffer.dropoffLat,
      dropoffLng: incomingOffer.dropoffLng,
      otpInput: '',
      correctOtp: '4821',
      navStep: 'Turn right onto Airport Bypass Rd in 250m toward Liberation Rd',
      waitTimeSeconds: 0,
      isWaitTimerActive: false,
    });
    onAcceptOffer?.(accepted);
    setIncomingOffer(null);
    setDriverViewTab('cockpit_map');
  };

  // Claim a request from the User Service Requests Board
  const handleClaimMarketplaceRequest = (req: UserMarketplaceRequest) => {
    setActiveDriverTrip({
      status: 'HEADING_TO_PICKUP',
      fareGHS: req.fareGHS,
      baseFareGHS: 15.0,
      distanceFareGHS: req.fareGHS - 15.0,
      surgeMultiplier: 1.0,
      riderName: req.riderName,
      riderAvatar: req.riderAvatar,
      riderPhone: req.userPhone,
      riderNvId: req.userNvId,
      pickupLabel: req.pickupLabel,
      pickupLat: req.lat,
      pickupLng: req.lng,
      dropoffLabel: req.dropoffLabel,
      dropoffLat: req.lat - 0.04,
      dropoffLng: req.lng - 0.03,
      otpInput: '',
      correctOtp: '6194',
      navStep: `Head toward ${req.pickupLabel} (ETA ${req.distanceAway})`,
      waitTimeSeconds: 0,
      isWaitTimerActive: false,
    });
    setDriverViewTab('cockpit_map');
  };

  // Driver arrives at pickup
  const handleArrivedAtPickup = () => {
    if (!activeDriverTrip) return;
    setActiveDriverTrip({
      ...activeDriverTrip,
      status: 'ARRIVED_AT_PICKUP',
      navStep: 'Arrived at pickup location · Notified rider via SMS & Langpretation',
      isWaitTimerActive: true,
      waitTimeSeconds: 0,
    });
    onDriverArrived?.();
  };

  // Start trip after OTP verification
  const handleStartTrip = () => {
    if (!activeDriverTrip) return;
    setActiveDriverTrip({
      ...activeDriverTrip,
      status: 'IN_TRIP',
      navStep: 'Proceed on Liberation Rd south toward Ring Rd Central & Ridge',
      isWaitTimerActive: false,
    });
    onDriverStartTrip?.();
  };

  // Complete trip
  const handleCompleteTrip = () => {
    if (!activeDriverTrip) return;
    const fare = activeDriverTrip.fareGHS;
    setTodayEarnings((prev) => prev + fare);
    setCompletedTripsCount((prev) => prev + 1);

    // Append to completed trip history
    const newRecord: DriverCompletedTrip = {
      id: `trip_hist_${Date.now()}`,
      tripCode: `NV-TRIP-${Math.floor(10000 + Math.random() * 90000)}`,
      date: 'Today',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      riderName: activeDriverTrip.riderName,
      riderAvatar: activeDriverTrip.riderAvatar,
      riderNvId: activeDriverTrip.riderNvId,
      serviceType: 'ride',
      pickupRoute: activeDriverTrip.pickupLabel,
      dropoffRoute: activeDriverTrip.dropoffLabel,
      distanceKm: 6.4,
      durationMins: 15,
      baseFareGHS: activeDriverTrip.baseFareGHS,
      distanceFareGHS: activeDriverTrip.distanceFareGHS,
      surgeMultiplier: activeDriverTrip.surgeMultiplier,
      finalFareGHS: fare,
      paymentMethod: 'Nanivio Wallet',
      paymentStatus: 'Settled',
      ratingByDriver: 5,
    };
    setTripHistory((prev) => [newRecord, ...prev]);

    setActiveDriverTrip({
      ...activeDriverTrip,
      status: 'COMPLETED',
      navStep: 'Trip Complete · Payment Deposited into Driver Wallet',
    });
    onDriverCompleteTrip?.(fare);
  };

  const handleResetTrip = () => {
    setActiveDriverTrip(null);
  };

  // Instant Cashout
  const handleConfirmCashOut = () => {
    setCashOutSuccess(true);
    setTimeout(() => {
      setTodayEarnings(0);
      setCashOutSuccess(false);
      setShowCashOutModal(false);
    }, 1800);
  };

  // Quick SMS Chat to Rider
  const handleSendQuickChat = (message: string) => {
    setQuickChatSent(message);
    setTimeout(() => {
      setQuickChatSent(null);
      setShowQuickChatModal(false);
    }, 1500);
  };

  // Calculate Map Route according to active state
  const activeMapRoute = activeDriverTrip
    ? activeDriverTrip.status === 'HEADING_TO_PICKUP'
      ? {
          polyline: [
            [driverLocation.lat, driverLocation.lng],
            [driverLocation.lat * 0.7 + activeDriverTrip.pickupLat * 0.3, driverLocation.lng * 0.7 + activeDriverTrip.pickupLng * 0.3 + 0.002],
            [activeDriverTrip.pickupLat, activeDriverTrip.pickupLng],
          ] as [number, number][],
          distanceKm: 1.2,
          durationMins: 4,
          destinationLabel: activeDriverTrip.pickupLabel,
          stepInstruction: activeDriverTrip.navStep,
        }
      : activeDriverTrip.status === 'IN_TRIP'
      ? {
          polyline: [
            [activeDriverTrip.pickupLat, activeDriverTrip.pickupLng],
            [(activeDriverTrip.pickupLat * 2 + activeDriverTrip.dropoffLat) / 3, (activeDriverTrip.pickupLng * 2 + activeDriverTrip.dropoffLng) / 3 + 0.003],
            [(activeDriverTrip.pickupLat + activeDriverTrip.dropoffLat * 2) / 3, (activeDriverTrip.pickupLng + activeDriverTrip.dropoffLng * 2) / 3 - 0.002],
            [activeDriverTrip.dropoffLat, activeDriverTrip.dropoffLng],
          ] as [number, number][],
          distanceKm: 6.4,
          durationMins: 15,
          destinationLabel: activeDriverTrip.dropoffLabel,
          stepInstruction: activeDriverTrip.navStep,
        }
      : null
    : incomingOffer
    ? {
        polyline: [
          [driverLocation.lat, driverLocation.lng],
          [incomingOffer.pickupLat, incomingOffer.pickupLng],
          [incomingOffer.dropoffLat, incomingOffer.dropoffLng],
        ] as [number, number][],
        distanceKm: 6.4,
        durationMins: 15,
        destinationLabel: incomingOffer.dropoffLabel,
        stepInstruction: `Incoming Offer: Pickup at ${incomingOffer.pickupLabel}`,
      }
    : null;

  return (
    <div className="p-3 sm:p-5 rounded-3xl bg-[#060c18] border border-emerald-500/30 shadow-2xl space-y-4 w-full max-w-full overflow-x-hidden">
      {/* 1. TOP DRIVER COCKPIT HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-[#0b172a] border border-slate-800">
        {/* Driver Profile */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&auto=format&fit=crop&q=80"
              alt="Driver Kofi Mensah"
              className="w-13 h-13 rounded-2xl object-cover border-2 border-emerald-500 shadow-md shadow-emerald-500/20"
            />
            <span
              className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${
                isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              }`}
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-white">Kofi Mensah</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/40">
                NV 0486821940
              </span>
              <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                Gold Tier Partner
              </span>
            </div>

            <div className="text-xs text-slate-300 flex flex-wrap items-center gap-2 mt-0.5">
              <span className="font-semibold text-white">Silver Toyota Corolla</span>
              <span className="font-mono text-emerald-400 font-bold">GN 4821-24</span>
              <span>•</span>
              <span className="flex items-center gap-1 text-amber-400 font-bold">
                <Star className="w-3.5 h-3.5 fill-amber-400" />
                <span>{driverRating}</span>
              </span>
              <span className="text-slate-400">({completedTripsCount} trips today)</span>
            </div>
          </div>
        </div>

        {/* Action Controls: SOS Emergency + Go Online Toggle */}
        <div className="flex items-center gap-2">
          {/* Emergency SOS Shield */}
          <button
            onClick={() => setShowSafetyModal(true)}
            className="p-2.5 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/40 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            title="Driver Safety & SOS Shield"
          >
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">Safety SOS</span>
          </button>

          {/* Go Online / Offline Toggle Button */}
          <button
            onClick={() => setIsOnline(!isOnline)}
            className={`py-2.5 px-5 rounded-2xl font-black text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg ${
              isOnline
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>{isOnline ? 'YOU ARE ONLINE' : 'GO ONLINE'}</span>
          </button>
        </div>
      </div>

      {/* 2. DRIVER METRICS BAR (UBER STYLE) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Today's Earnings</span>
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-lg font-black text-emerald-400 font-mono">
            GH₵ {todayEarnings.toFixed(2)}
          </div>
          <button
            onClick={() => setShowCashOutModal(true)}
            className="text-[10px] font-bold text-emerald-300 hover:underline cursor-pointer flex items-center gap-1"
          >
            <span>Cash Out to MoMo</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Trips Completed</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-lg font-black text-white font-mono">{completedTripsCount}</div>
          <div className="text-[10px] text-slate-500">Daily Quest: 10 trips (+GH₵ 50 bonus)</div>
        </div>

        <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Time Online</span>
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-lg font-black text-white font-mono">
            {Math.floor(onlineMinutes / 60)}h {onlineMinutes % 60}m
          </div>
          <div className="text-[10px] text-emerald-400 font-semibold">High surge time</div>
        </div>

        <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Acceptance Rate</span>
            <Award className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-lg font-black text-white font-mono">{acceptanceRate}%</div>
          <div className="text-[10px] text-amber-300 font-semibold">Zero cancellation penalty</div>
        </div>
      </div>

      {/* 3. COCKPIT SUB-NAVIGATION TABS */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setDriverViewTab('cockpit_map')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              driverViewTab === 'cockpit_map'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Driver GPS Map &amp; Navigation</span>
          </button>

          <button
            onClick={() => setDriverViewTab('user_requests_board')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              driverViewTab === 'user_requests_board'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>User Service Requests Radar ({userRequests.length})</span>
          </button>

          <button
            onClick={() => setDriverViewTab('vehicle_docs')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              driverViewTab === 'vehicle_docs'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <FileCheck className="w-4 h-4" />
            <span>Vehicle &amp; Trip History ({tripHistory.length})</span>
          </button>
        </div>

        {/* Destination Mode ("Set Destination / Heading Home") */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDestinationModeActive(!destinationModeActive)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
              destinationModeActive
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
            title="Only receive passenger requests heading towards your destination"
          >
            <Navigation className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Set Destination:</span>
            <span className="font-semibold text-white">
              {destinationModeActive ? destinationFilterLocation : 'Any Direction'}
            </span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: DRIVER GPS MAP & ROUTE COCKPIT (THE CORE MAP INTERFACE) */}
      {/* ===================================================================== */}
      {driverViewTab === 'cockpit_map' && (
        <div className="space-y-4">
          {/* Quick Simulation Bar if no active trip or offer */}
          {!activeDriverTrip && !incomingOffer && (
            <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 text-xs text-emerald-200">
                <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  {isOnline
                    ? 'Radar Active: Scanning local metropolitan zone for passenger ride & courier requests...'
                    : 'Switch Online to receive requests on your map.'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSimulateIncomingTrip}
                  className="py-1.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Test Dispatch (disabled)</span>
                </button>
                <button
                  onClick={() => setDriverViewTab('user_requests_board')}
                  className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700 cursor-pointer"
                >
                  <span>Browse Requests ({userRequests.length})</span>
                </button>
              </div>
            </div>
          )}

          {/* INCOMING RIDE OFFER POPUP (UBER DRIVER DISPATCH OVERLAY) */}
          {incomingOffer && (
            <div className="p-5 rounded-3xl bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border-2 border-emerald-500 shadow-2xl shadow-emerald-500/25 space-y-4 animate-bounce-subtle">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                    Incoming Ride Offer · Nanivio VIP
                  </span>
                  {incomingOffer.surgeMultiplier && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                      +{incomingOffer.surgeMultiplier}x Surge
                    </span>
                  )}
                </div>
                {/* 15s Circular Countdown */}
                <div className="w-10 h-10 rounded-full bg-slate-900 border-2 border-emerald-500 flex items-center justify-center font-mono font-black text-emerald-400 text-sm shadow-md">
                  {incomingOffer.expiresInSeconds}s
                </div>
              </div>

              {/* Fare Banner */}
              <div className="text-center py-1">
                <div className="text-3xl font-black text-white font-mono">
                  GH₵ {incomingOffer.fareGHS.toFixed(2)}
                </div>
                <div className="text-xs text-emerald-400 font-bold mt-0.5">
                  Guaranteed Net Payout to Nanivio Wallet · 0% Platform Fee
                </div>
              </div>

              {/* Route Itinerary */}
              <div className="p-3.5 rounded-2xl bg-slate-900/95 border border-slate-800 space-y-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[10px] uppercase font-extrabold text-slate-400">Pickup</div>
                    <div className="font-bold text-white text-sm">{incomingOffer.pickupLabel}</div>
                    <div className="text-[11px] text-emerald-300 font-medium">{incomingOffer.pickupDistance}</div>
                  </div>
                </div>

                <div className="ml-2 pl-3 border-l border-dashed border-slate-700 h-2" />

                <div className="flex items-start gap-2.5">
                  <Navigation className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[10px] uppercase font-extrabold text-slate-400">Drop-off Destination</div>
                    <div className="font-bold text-white text-sm">{incomingOffer.dropoffLabel}</div>
                    <div className="text-[11px] text-slate-400">{incomingOffer.tripDistance}</div>
                  </div>
                </div>
              </div>

              {/* Rider Details & Langpretation */}
              <div className="flex items-center justify-between text-xs text-slate-300 px-1">
                <div className="flex items-center gap-2">
                  <img
                    src={incomingOffer.riderAvatar}
                    alt={incomingOffer.riderName}
                    className="w-7 h-7 rounded-full object-cover border border-emerald-500"
                  />
                  <span>
                    Rider: <strong className="text-white">{incomingOffer.riderName}</strong> (★ {incomingOffer.riderRating})
                  </span>
                </div>
                <span className="text-emerald-400 font-medium">{incomingOffer.riderLanguage}</span>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <button
                  onClick={() => setIncomingOffer(null)}
                  className="py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-400 font-bold text-xs cursor-pointer border border-slate-800"
                >
                  Decline
                </button>
                <button
                  onClick={handleAcceptTrip}
                  className="col-span-2 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/30"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>ACCEPT TRIP</span>
                </button>
              </div>
            </div>
          )}

          {/* DEDICATED DRIVER GPS MAP & ROUTE VIEWER */}
          <NanivioDriverMapViewer
            driverLocation={driverLocation}
            isOnline={isOnline}
            activeRoute={activeMapRoute}
            pickupLocation={
              activeDriverTrip
                ? {
                    lat: activeDriverTrip.pickupLat,
                    lng: activeDriverTrip.pickupLng,
                    label: activeDriverTrip.pickupLabel,
                  }
                : incomingOffer
                ? {
                    lat: incomingOffer.pickupLat,
                    lng: incomingOffer.pickupLng,
                    label: incomingOffer.pickupLabel,
                  }
                : null
            }
            dropoffLocation={
              activeDriverTrip
                ? {
                    lat: activeDriverTrip.dropoffLat,
                    lng: activeDriverTrip.dropoffLng,
                    label: activeDriverTrip.dropoffLabel,
                  }
                : incomingOffer
                ? {
                    lat: incomingOffer.dropoffLat,
                    lng: incomingOffer.dropoffLng,
                    label: incomingOffer.dropoffLabel,
                  }
                : null
            }
            speedKmH={speedKmH}
            speedLimitKmH={50}
            userRequestPins={userRequests}
            onSelectUserRequest={(req) => {
              const fullReq = userRequests.find((u) => u.id === req.id);
              if (fullReq) handleClaimMarketplaceRequest(fullReq);
            }}
            tripStatus={activeDriverTrip ? activeDriverTrip.status : incomingOffer ? 'OFFER' : 'IDLE'}
          />

          {/* ACTIVE TRIP CONTROLS & LIFECYCLE (EN ROUTE / ARRIVED / IN TRIP) */}
          {activeDriverTrip && (
            <div className="p-5 rounded-3xl bg-slate-900/95 border border-emerald-500/40 space-y-4 shadow-xl animate-fadeIn">
              {/* Rider Contact & In-Trip Communication */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-3">
                  <img
                    src={activeDriverTrip.riderAvatar}
                    alt={activeDriverTrip.riderName}
                    className="w-11 h-11 rounded-2xl object-cover border-2 border-emerald-500/50"
                  />
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                      <span>{activeDriverTrip.riderName}</span>
                      <span className="text-[10px] text-emerald-400 font-mono">
                        NV {activeDriverTrip.riderNvId}
                      </span>
                    </h4>
                    <p className="text-xs text-slate-400">
                      Destination: <strong className="text-slate-200">{activeDriverTrip.dropoffLabel}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Quick Chat */}
                  <button
                    onClick={() => setShowQuickChatModal(true)}
                    className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold transition-all cursor-pointer border border-slate-700"
                    title="Send Quick Pre-Set Message"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>

                  {/* Call Rider via Langpretation */}
                  {onCallRider && (
                    <button
                      onClick={() => onCallRider(activeDriverTrip.riderPhone, activeDriverTrip.riderNvId)}
                      className="p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all cursor-pointer shadow-md shadow-emerald-500/20"
                      title="Call Rider with Live Multilateral Langpretation"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Stage 1: HEADING TO PICKUP */}
              {activeDriverTrip.status === 'HEADING_TO_PICKUP' && (
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Rider Pickup Address:</span>
                    <span className="font-semibold text-white">{activeDriverTrip.pickupLabel}</span>
                  </div>

                  <button
                    onClick={handleArrivedAtPickup}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>ARRIVED AT PICKUP</span>
                  </button>
                </div>
              )}

              {/* Stage 2: ARRIVED AT PICKUP (WAITING TIMER & OTP VERIFICATION) */}
              {activeDriverTrip.status === 'ARRIVED_AT_PICKUP' && (
                <div className="space-y-3">
                  {/* Waiting Timer */}
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/40 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400">Wait Time at Pickup</div>
                      <div className="text-xs text-slate-300">
                        {activeDriverTrip.waitTimeSeconds < 180 ? 'Complimentary 3:00 mins wait' : 'Paid Wait Time (GH₵ 0.80/min)'}
                      </div>
                    </div>
                    <div className="text-lg font-mono font-black text-emerald-400">
                      {Math.floor(activeDriverTrip.waitTimeSeconds / 60)}:
                      {(activeDriverTrip.waitTimeSeconds % 60).toString().padStart(2, '0')}
                    </div>
                  </div>

                  {/* Rider OTP PIN Verification */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300">Rider 4-Digit OTP PIN:</span>
                      <span className="text-[10px] text-emerald-400 font-mono">
                        Passenger PIN: {activeDriverTrip.correctOtp}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={4}
                        value={activeDriverTrip.otpInput}
                        onChange={(e) =>
                          setActiveDriverTrip({ ...activeDriverTrip, otpInput: e.target.value })
                        }
                        placeholder="Enter 4-digit PIN"
                        className="flex-1 px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-center font-mono font-bold text-white text-base tracking-widest focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        onClick={() =>
                          setActiveDriverTrip({
                            ...activeDriverTrip,
                            otpInput: activeDriverTrip.correctOtp,
                          })
                        }
                        className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-emerald-400 text-xs font-bold rounded-xl border border-slate-700 cursor-pointer"
                      >
                        Auto Fill
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleStartTrip}
                    disabled={activeDriverTrip.otpInput !== activeDriverTrip.correctOtp}
                    className={`w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                      activeDriverTrip.otpInput === activeDriverTrip.correctOtp
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-emerald-500/25'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <Car className="w-5 h-5" />
                    <span>START TRIP &amp; COMMENCE NAVIGATION</span>
                  </button>
                </div>
              )}

              {/* Stage 3: IN TRIP */}
              {activeDriverTrip.status === 'IN_TRIP' && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/30 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-emerald-400">Navigation in Progress</div>
                      <div className="text-xs font-bold text-white">Heading to {activeDriverTrip.dropoffLabel}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-emerald-400">
                        GH₵ {activeDriverTrip.fareGHS.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400">Fixed Fare</div>
                    </div>
                  </div>

                  <button
                    onClick={handleCompleteTrip}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/25"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>COMPLETE TRIP &amp; COLLECT FARE</span>
                  </button>
                </div>
              )}

              {/* Stage 4: TRIP COMPLETED RECEIPT & PASSENGER RATING */}
              {activeDriverTrip.status === 'COMPLETED' && (
                <div className="p-4 sm:p-5 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 space-y-4 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                  <div>
                    <h4 className="text-base font-extrabold text-white">Trip Successfully Completed!</h4>
                    <p className="text-xs text-emerald-300 font-mono mt-0.5">
                      +GH₵ {activeDriverTrip.fareGHS.toFixed(2)} credited directly to your Nanivio Driver Wallet
                    </p>
                  </div>

                  {/* Detailed Fare Receipt Breakdown */}
                  <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-left space-y-1.5 font-mono">
                    <div className="flex justify-between text-slate-400">
                      <span>Base Fare:</span>
                      <span>GH₵ {activeDriverTrip.baseFareGHS.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Distance &amp; Time:</span>
                      <span>GH₵ {activeDriverTrip.distanceFareGHS.toFixed(2)}</span>
                    </div>
                    {activeDriverTrip.surgeMultiplier > 1 && (
                      <div className="flex justify-between text-amber-400">
                        <span>Surge Pricing Bonus:</span>
                        <span>+{activeDriverTrip.surgeMultiplier}x</span>
                      </div>
                    )}
                    <div className="flex justify-between text-emerald-400">
                      <span>Nanivio Driver Commission:</span>
                      <span>0.00 (0% Promo)</span>
                    </div>
                    <div className="pt-1.5 border-t border-slate-800 flex justify-between font-bold text-white text-sm">
                      <span>Driver Net Take-Home:</span>
                      <span className="text-emerald-400">GH₵ {activeDriverTrip.fareGHS.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Rate Passenger */}
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                    <div className="text-xs text-slate-300 font-bold">
                      Rate Passenger ({activeDriverTrip.riderName}):
                    </div>
                    <div className="flex justify-center gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() =>
                            setActiveDriverTrip({ ...activeDriverTrip, passengerRatingDone: true })
                          }
                          className="p-1.5 hover:scale-125 transition-all text-amber-400 cursor-pointer"
                        >
                          <Star className="w-5 h-5 fill-amber-400" />
                        </button>
                      ))}
                    </div>
                    {activeDriverTrip.passengerRatingDone && (
                      <p className="text-[11px] text-emerald-400">Passenger rating recorded. Thank you!</p>
                    )}
                  </div>

                  <button
                    onClick={handleResetTrip}
                    className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs cursor-pointer border border-slate-700"
                  >
                    Ready for Next Trip
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: USER SERVICE REQUESTS BOARD (REQUEST SERVICES FROM USERS) */}
      {/* ===================================================================== */}
      {driverViewTab === 'user_requests_board' && (
        <UserServiceRequestsBoard
          requests={userRequests}
          onAcceptRequest={handleClaimMarketplaceRequest}
          onCallUser={(phone, nvId, name) => {
            if (onCallRider) {
              onCallRider(phone, nvId);
            }
          }}
          onSendCustomOffer={(reqId, offerGHS) => {
            // Updated offer
          }}
        />
      )}

      {/* ===================================================================== */}
      {/* TAB 3: VEHICLE & UBA RENTAL SETTINGS (FLEET PASSIVE EARNINGS) */}
      {/* ===================================================================== */}
      {driverViewTab === 'vehicle_docs' && (
        <div className="space-y-4">
          {/* Vehicle Compliance Status */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-emerald-400" />
                <h4 className="text-sm font-bold text-white">DVLA Compliance &amp; Inspection Badges</h4>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                100% Certified
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-slate-400">Roadworthiness Certificate</div>
                <div className="font-bold text-white">Valid until Nov 2026</div>
                <div className="text-[10px] text-emerald-400">DVLA Inspected</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-slate-400">Comprehensive Insurance</div>
                <div className="font-bold text-white">Enterprise Insurance Gold</div>
                <div className="text-[10px] text-emerald-400">Commercial Taxi/Ride Cover</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-slate-400">Driver License Class</div>
                <div className="font-bold text-white">Class C (Commercial Passenger)</div>
                <div className="text-[10px] text-emerald-400">Verified NV ID 0486821940</div>
              </div>
            </div>
          </div>

          {/* Uba Fleet Car Renting Settings */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Car className="w-5 h-5 text-emerald-400" />
                <h4 className="text-sm font-bold text-white">Uba Daily Car Renting Integration</h4>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Passive Fleet Earnings
              </span>
            </div>

            <p className="text-xs text-slate-400">
              When you are taking a day off or not actively accepting rides, list your Silver Toyota Corolla on the Nanivio Uba Car Rental marketplace for pre-screened clients.
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={enableRentalListing}
                  onChange={(e) => setEnableRentalListing(e.target.checked)}
                  className="rounded accent-emerald-500 w-4 h-4"
                />
                <span className="font-semibold">Enable daily rental availability for this vehicle</span>
              </label>

              {enableRentalListing && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-400">Daily Rate:</span>
                  <span className="text-emerald-400 font-mono font-bold">GH₵</span>
                  <input
                    type="number"
                    value={dailyRentalRate}
                    onChange={(e) => setDailyRentalRate(Number(e.target.value))}
                    className="w-24 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-400">/day</span>
                </div>
              )}
            </div>
          </div>

          {/* New Trip History Section */}
          <DriverTripHistorySection trips={tripHistory} />
        </div>
      )}

      {/* 4. MODALS (CASHOUT, SAFETY SOS, QUICK CHAT) */}

      {/* INSTANT CASHOUT MODAL */}
      {showCashOutModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full p-5 rounded-3xl bg-slate-950 border border-emerald-500/40 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Instant Driver Payout</h3>
              </div>
              <button
                onClick={() => setShowCashOutModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {!cashOutSuccess ? (
              <>
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-1">
                  <div className="text-xs text-slate-400">Available Driver Balance:</div>
                  <div className="text-2xl font-black text-emerald-400 font-mono">
                    GH₵ {todayEarnings.toFixed(2)}
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-300">
                  <div className="font-semibold text-white">Select Payout Rail:</div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/50 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white">MTN Mobile Money</div>
                      <div className="text-[11px] text-slate-400">0244 891 023 (Kofi Mensah)</div>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-bold">Instant 0s</span>
                  </div>
                </div>

                <button
                  onClick={handleConfirmCashOut}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Transfer GH₵ {todayEarnings.toFixed(2)} to MoMo</span>
                </button>
              </>
            ) : (
              <div className="text-center py-4 space-y-2 animate-fadeIn">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-bold text-white">MoMo Transfer Successful!</h4>
                <p className="text-xs text-slate-400">
                  Funds have been dispatched directly to your MTN Mobile Money wallet.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SAFETY SOS SHIELD MODAL (UBER SAFETY TOOLKIT) */}
      {showSafetyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full p-5 rounded-3xl bg-slate-950 border border-rose-500/40 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-rose-400" />
                <h3 className="text-sm font-black text-white">Nanivio Driver Safety Shield</h3>
              </div>
              <button
                onClick={() => setShowSafetyModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Your safety is our highest priority. All Nanivio Drive trips are GPS tracked in real-time.
            </p>

            <div className="space-y-2">
              <button
                onClick={() => alert('Emergency SOS Alert Dispatched to Ghana Police & Nanivio Rapid Response.')}
                className="w-full p-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-600/30"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Trigger Emergency SOS (Police / Ambulance)</span>
              </button>

              <button
                onClick={() => alert('Live Trip GPS Tracking Link copied to clipboard to share with family or fleet manager.')}
                className="w-full p-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold flex items-center justify-center gap-2 border border-slate-700 cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-emerald-400" />
                <span>Share Live Trip Link with Family</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK CHAT TEMPLATES MODAL */}
      {showQuickChatModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-sm w-full p-5 rounded-3xl bg-slate-950 border border-emerald-500/40 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold text-white">Quick Message to Rider</h3>
              <button
                onClick={() => setShowQuickChatModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            {quickChatSent ? (
              <div className="text-center py-4 text-xs text-emerald-400 font-semibold animate-fadeIn">
                Message Sent: "{quickChatSent}"
              </div>
            ) : (
              <div className="space-y-2">
                {[
                  "I've arrived outside in the Silver Toyota Corolla (GN 4821-24).",
                  'Heavy traffic at the roundabout, arriving in about 3 minutes.',
                  'I am waiting at the main entrance gate with hazard lights on.',
                  'Please verify your 4-digit OTP PIN upon entering the car.',
                ].map((msg, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendQuickChat(msg)}
                    className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-left text-xs text-slate-200 hover:text-white border border-slate-800 cursor-pointer transition-all"
                  >
                    "{msg}"
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
