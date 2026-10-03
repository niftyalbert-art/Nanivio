import React, { useState, useEffect } from 'react';
import {
  Car,
  MapPin,
  Navigation,
  Clock,
  CreditCard,
  Shield,
  Star,
  Phone,
  CheckCircle2,
  XCircle,
  Sparkles,
  ArrowRight,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Wallet,
  Volume2,
  Share2,
  MessageSquare,
  Send,
  Check,
  Radio,
  Heart,
} from 'lucide-react';
import { NanivioDriver, RideTierOption, RideServiceTier } from '../../types/drive';
import { RIDE_TIER_OPTIONS, POPULAR_LOCATIONS } from '../../data/driveMockData';
import { RidePaymentReceiptModal, RideReceiptData } from './RidePaymentReceiptModal';
import { useNanivio } from '../../context/NanivioContext';

interface NanivioRideHailingPanelProps {
  drivers: NanivioDriver[];
  selectedTier: RideServiceTier;
  onSelectTier: (tier: RideServiceTier) => void;
  pickupLocation: { label: string; lat: number; lng: number };
  destinationLocation: { label: string; lat: number; lng: number } | null;
  onSetPickup: (loc: { label: string; lat: number; lng: number }) => void;
  onSetDestination: (loc: { label: string; lat: number; lng: number }) => void;
  distanceKm: number;
  durationMins: number;
  onStartRideRequest: (driver: NanivioDriver) => void;
  activeTrip: any;
  onCancelTrip: () => void;
  onCallDriver: (driver: NanivioDriver) => void;
  onSwitchToDriverCockpit?: () => void;
}

export const NanivioRideHailingPanel: React.FC<NanivioRideHailingPanelProps> = ({
  drivers,
  selectedTier,
  onSelectTier,
  pickupLocation,
  destinationLocation,
  onSetPickup,
  onSetDestination,
  distanceKm,
  durationMins,
  onStartRideRequest,
  activeTrip,
  onCancelTrip,
  onCallDriver,
  onSwitchToDriverCockpit,
}) => {
  const { adminFeatures, updateAdminFeature, isAdmin } = useNanivio();
  const isRideEnabled = adminFeatures?.nanivioRideEnabled !== false && adminFeatures?.nanivioDriveEnabled !== false;

  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'momo' | 'cash'>('wallet');
  const [isSearching, setIsSearching] = useState(false);
  const [searchCountdown, setSearchCountdown] = useState(6);
  const [customDestinationInput, setCustomDestinationInput] = useState('');

  // Trip Lifecycle: 'ASSIGNED' | 'ARRIVED' | 'IN_TRIP'
  const [tripLifecycleStep, setTripLifecycleStep] = useState<'ASSIGNED' | 'ARRIVED' | 'IN_TRIP'>('ASSIGNED');
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const [completedReceiptData, setCompletedReceiptData] = useState<RideReceiptData | null>(null);

  // In-Ride Malvi AI Voice & Copilot State
  const [malviActiveMessage, setMalviActiveMessage] = useState<string | null>(null);
  const [safetyShared, setSafetyShared] = useState<boolean>(false);
  const [showQuickChat, setShowQuickChat] = useState<boolean>(false);
  const [chatSentNotice, setChatSentNotice] = useState<string | null>(null);

  const currentTierInfo = RIDE_TIER_OPTIONS.find((t) => t.id === selectedTier) || RIDE_TIER_OPTIONS[0];

  const calculateFare = (tier: RideTierOption) => {
    const base = tier.baseFareGHS;
    const distanceCost = distanceKm * tier.ratePerKmGHS;
    const timeCost = durationMins * tier.ratePerMinuteGHS;
    return Math.round(base + distanceCost + timeCost);
  };

  const executeDriverMatch = (driverIndex = 0) => {
    setIsSearching(false);
    setTripLifecycleStep('ASSIGNED');
    const rawDriver = drivers[driverIndex] || drivers[0] || {
      id: 'drv_kofi_01',
      name: 'Kofi Mensah',
      rating: 4.94,
      tripsCompleted: 1420,
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
      phone: '+233244891023',
      nvId: '0486821940',
      vehicleMake: 'Toyota',
      vehicleModel: 'Corolla LE',
      vehicleYear: 2022,
      vehicleColor: 'Silver Metallic',
      plateNumber: 'GN 4821-24',
      spokenLanguages: ['en', 'ak', 'fr'],
      distanceKm: 1.2,
    };

    const assignedDriver = {
      ...rawDriver,
      vehicleMake: rawDriver.vehicleMake || (rawDriver as any).vehicle?.make || 'Toyota',
      vehicleModel: rawDriver.vehicleModel || (rawDriver as any).vehicle?.model || 'Corolla',
      vehicleColor: rawDriver.vehicleColor || (rawDriver as any).vehicle?.color || 'Silver Metallic',
      plateNumber: rawDriver.plateNumber || (rawDriver as any).vehicle?.plateNumber || 'GN 4821-24',
      vehicle: {
        make: rawDriver.vehicleMake || (rawDriver as any).vehicle?.make || 'Toyota',
        model: rawDriver.vehicleModel || (rawDriver as any).vehicle?.model || 'Corolla',
        color: rawDriver.vehicleColor || (rawDriver as any).vehicle?.color || 'Silver Metallic',
        plateNumber: rawDriver.plateNumber || (rawDriver as any).vehicle?.plateNumber || 'GN 4821-24',
        year: rawDriver.vehicleYear || (rawDriver as any).vehicle?.year || 2023,
        tier: rawDriver.serviceTier || (rawDriver as any).vehicle?.tier || 'standard',
        seats: rawDriver.seats || (rawDriver as any).vehicle?.seats || 4,
        hasAC: rawDriver.hasAC ?? (rawDriver as any).vehicle?.hasAC ?? true,
      },
    };

    onStartRideRequest(assignedDriver as any);
  };

  useEffect(() => {
    if (!isSearching) {
      setSearchCountdown(6);
      return;
    }
    const timer = setInterval(() => {
      setSearchCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          executeDriverMatch(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isSearching, drivers]);

  const handleRequestRide = () => {
    if (!isRideEnabled) {
      alert('Nanivio Ride service is currently switched OFF by administrator.');
      return;
    }
    if (!destinationLocation) {
      alert('Please select a destination to request a Nanivio Ride.');
      return;
    }
    setSearchCountdown(6);
    setIsSearching(true);
  };

  // Malvi Langpretation Speech & Translation
  const speakMalviPhrase = (englishText: string, localTranslation: string, languageName: string) => {
    setMalviActiveMessage(`${englishText} → "${localTranslation}" (${languageName})`);

    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(localTranslation);
        utterance.rate = 1.0;
        utterance.volume = 0.9;
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      // Audio synthesis fallback
    }

    setTimeout(() => {
      setMalviActiveMessage(null);
    }, 5500);
  };

  // Emergency GPS Sharing
  const handleShareEmergencyGPS = () => {
    setSafetyShared(true);
    setTimeout(() => setSafetyShared(false), 4000);
  };

  // Send Quick Chat to Driver
  const handleSendQuickChat = (msg: string) => {
    setChatSentNotice(msg);
    setTimeout(() => {
      setChatSentNotice(null);
      setShowQuickChat(false);
    }, 2500);
  };

  // Trigger Completion & Payment Receipt
  const handleCompleteTripAndShowReceipt = () => {
    if (!activeTrip) return;

    const receipt: RideReceiptData = {
      tripId: `${Math.floor(100000 + Math.random() * 900000)}`,
      date: new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      driver: activeTrip.driver,
      pickupLabel: pickupLocation.label,
      dropoffLabel: destinationLocation?.label || 'Accra Mall',
      tierTitle: currentTierInfo.title,
      distanceKm: distanceKm || 4.8,
      durationMins: durationMins || 15,
      fareGHS: activeTrip.fareGHS || 45,
      paymentMethod,
      otpPin: activeTrip.otpPin || '4821',
    };

    setCompletedReceiptData(receipt);
    setShowReceiptModal(true);
  };

  return (
    <div className="p-4 sm:p-5 rounded-3xl bg-slate-950/90 border border-slate-800 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 shadow-md shadow-emerald-500/20">
            <Car className="w-4 h-4 font-bold" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Nanivio Ride Hailing</h3>
            <p className="text-[11px] text-slate-400">Live Active Drivers with Google Map Routing</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => updateAdminFeature('nanivioRideEnabled', !isRideEnabled)}
              className={`px-3 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 shadow-sm ${
                isRideEnabled
                  ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/40'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-400 font-extrabold shadow-md'
              }`}
              title={isRideEnabled ? 'Admin: Switch Nanivio Ride OFF' : 'Admin: Switch Nanivio Ride ON'}
            >
              <span className={`w-2 h-2 rounded-full ${isRideEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span>Admin: Ride {isRideEnabled ? 'ON' : 'OFF'}</span>
            </button>
          )}

          <span className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold flex items-center gap-1.5 ${
            isRideEnabled
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isRideEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
            <span>{isRideEnabled ? `${drivers.length} Drivers Online` : 'Ride Service OFF'}</span>
          </span>
        </div>
      </div>

      {/* Admin Ride OFF Notice Banner */}
      {!isRideEnabled && (
        <div className="p-3.5 rounded-2xl bg-rose-950/80 border border-rose-500/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
              <Car className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-white flex items-center gap-1.5">
                <span>Nanivio Ride is Currently OFF</span>
                <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[9px] font-mono font-bold">
                  ADMIN SUSPENDED
                </span>
              </div>
              <p className="text-rose-200/80 text-[11px] mt-0.5">
                Ride bookings and fleet dispatch are temporarily disabled by the platform administrator.
              </p>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => updateAdminFeature('nanivioRideEnabled', true)}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shrink-0 cursor-pointer shadow"
            >
              Turn Ride ON
            </button>
          )}
        </div>
      )}

      {/* ACTIVE TRIP IN PROGRESS STATE (INTERACTIVE LIFECYCLE) */}
      {activeTrip && (
        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 border border-emerald-500/40 space-y-4 animate-fadeIn">
          {/* Top Status & PIN */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-bold text-emerald-300 uppercase tracking-wide">
                {tripLifecycleStep === 'ASSIGNED' && 'Driver Dispatched · En Route'}
                {tripLifecycleStep === 'ARRIVED' && 'Driver Arrived at Pickup!'}
                {tripLifecycleStep === 'IN_TRIP' && 'Trip in Progress to Destination'}
              </span>
            </div>
            <div className="px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white">
              PIN: <span className="text-emerald-400 font-bold tracking-widest">{activeTrip.otpPin || '4821'}</span>
            </div>
          </div>

          {/* Assigned Driver Card */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="flex items-center gap-3">
              {activeTrip.driver?.avatar ? (
                <img
                  src={activeTrip.driver.avatar}
                  alt={activeTrip.driver?.name || 'Driver'}
                  className="w-12 h-12 rounded-2xl object-cover border border-emerald-500/40"
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-sm">
                  {activeTrip.driver?.name?.charAt(0) || 'D'}
                </div>
              )}
              <div>
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>{activeTrip.driver?.name || 'Assigned Driver'}</span>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    NV {activeTrip.driver?.nvId || '0486821940'}
                  </span>
                </h4>
                <div className="flex items-center gap-1 text-[11px] text-amber-400">
                  <Star className="w-3 h-3 fill-amber-400" />
                  <span>{activeTrip.driver?.rating || '4.95'}</span>
                  <span className="text-slate-400">
                    · {activeTrip.driver?.vehicleMake || activeTrip.driver?.vehicle?.make || 'Toyota'}{' '}
                    {activeTrip.driver?.vehicleModel || activeTrip.driver?.vehicle?.model || 'Corolla'}
                  </span>
                </div>
                <div className="text-[11px] font-mono font-bold text-emerald-300">
                  {activeTrip.driver?.plateNumber || activeTrip.driver?.vehicle?.plateNumber || 'GN 4821-24'} ·{' '}
                  {activeTrip.driver?.vehicleColor || activeTrip.driver?.vehicle?.color || 'Silver Metallic'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowQuickChat(!showQuickChat)}
                className="p-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
                title="Quick chat with driver"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
              <button
                onClick={() => onCallDriver(activeTrip.driver)}
                className="p-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                title="Call Driver via Nanivio Langpretation"
              >
                <Phone className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Chat Drawer */}
          {showQuickChat && (
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span className="font-semibold text-white">Send quick message to driver:</span>
                {chatSentNotice && (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <Check className="w-3 h-3" /> Sent!
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "I'm at the main gate",
                  'Coming down now (1 min)',
                  'Wearing a black jacket',
                  'Waiting near the lobby',
                ].map((msg) => (
                  <button
                    key={msg}
                    type="button"
                    onClick={() => handleSendQuickChat(msg)}
                    className="px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-[11px] transition-all cursor-pointer"
                  >
                    {msg}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Trip Progress Bar & ETA */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>
                {tripLifecycleStep === 'ASSIGNED' && (
                  <>
                    Driver ETA: <strong className="text-white">~3 mins</strong>
                  </>
                )}
                {tripLifecycleStep === 'ARRIVED' && (
                  <span className="text-amber-400 font-bold">Driver is waiting outside!</span>
                )}
                {tripLifecycleStep === 'IN_TRIP' && (
                  <>
                    En route: <strong className="text-white">~{durationMins} mins remaining</strong> (44 km/h)
                  </>
                )}
              </span>
              <span className="text-emerald-400 font-bold font-mono">
                GH₵ {activeTrip.fareGHS || '45.00'}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full bg-emerald-500 rounded-full transition-all duration-700 ${
                  tripLifecycleStep === 'ASSIGNED'
                    ? 'w-1/3'
                    : tripLifecycleStep === 'ARRIVED'
                    ? 'w-2/3'
                    : 'w-full animate-pulse'
                }`}
              />
            </div>
          </div>

          {/* Malvi In-Ride AI Voice & Copilot Actions */}
          <div className="p-3 rounded-2xl bg-slate-950/80 border border-emerald-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Malvi In-Ride Voice Copilot</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Akan (Twi) &amp; French</span>
            </div>

            {malviActiveMessage && (
              <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-300 font-medium flex items-center gap-2 animate-fadeIn">
                <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse shrink-0" />
                <span>{malviActiveMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() =>
                  speakMalviPhrase('Turn on AC', 'Mepaakyɛw sɔ AC no ma me', 'Akan Twi')
                }
                className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Volume2 className="w-3 h-3 text-emerald-400" />
                <span className="truncate">🗣️ &quot;Turn on AC&quot;</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  speakMalviPhrase('Take bypass road', 'Mepaakyɛw fa bypass kwan no so', 'Akan Twi')
                }
                className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Volume2 className="w-3 h-3 text-emerald-400" />
                <span className="truncate">🛣️ &quot;Take bypass route&quot;</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  speakMalviPhrase('Alight at gate', 'Mɛsi aboboano pɛɛ', 'Akan Twi')
                }
                className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Volume2 className="w-3 h-3 text-emerald-400" />
                <span className="truncate">🚪 &quot;Alight at gate&quot;</span>
              </button>

              <button
                type="button"
                onClick={handleShareEmergencyGPS}
                className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Shield className="w-3 h-3 text-teal-400" />
                <span className="truncate">{safetyShared ? '✓ Live GPS Shared' : '🛡️ Share Live GPS'}</span>
              </button>
            </div>
          </div>

          {/* Interactive Stepper Progression Controls */}
          <div className="pt-1 flex flex-col sm:flex-row items-center gap-2">
            {tripLifecycleStep === 'ASSIGNED' && (
              <button
                onClick={() => setTripLifecycleStep('ARRIVED')}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 cursor-pointer transition-all"
              >
                <Navigation className="w-4 h-4" />
                <span>Simulate Driver Arrival at Pickup</span>
              </button>
            )}

            {tripLifecycleStep === 'ARRIVED' && (
              <button
                onClick={() => setTripLifecycleStep('IN_TRIP')}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 cursor-pointer transition-all"
              >
                <Car className="w-4 h-4" />
                <span>Board Vehicle &amp; Start Trip</span>
              </button>
            )}

            {tripLifecycleStep === 'IN_TRIP' && (
              <button
                onClick={handleCompleteTripAndShowReceipt}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 cursor-pointer transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Arrived at Destination · View Payment Receipt</span>
              </button>
            )}

            <button
              onClick={onCancelTrip}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-rose-950/50 border border-slate-800 hover:border-rose-500/40 text-rose-400 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
            >
              Cancel Ride
            </button>
          </div>
        </div>
      )}

      {/* SEARCHING ANIMATION & DRIVER ACCEPTANCE FLOW */}
      {isSearching && (
        <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-emerald-500/40 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
                  <Radio className="w-5 h-5 animate-pulse" />
                </div>
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Live Driver Radar Dispatch</h4>
                <p className="text-[11px] text-slate-400">Broadcasting request to nearby Accra drivers</p>
              </div>
            </div>
            <div className="px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-bold">
              {searchCountdown}s auto-match
            </div>
          </div>

          {/* Prospective Matching Driver Card */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img
                  src={drivers[0]?.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80'}
                  alt={drivers[0]?.name || 'Kwame Mensah'}
                  className="w-10 h-10 rounded-full object-cover border border-emerald-500/40"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">{drivers[0]?.name || 'Kwame Mensah'}</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold">
                      Closest
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {drivers[0]?.vehicleMake || 'Toyota'} {drivers[0]?.vehicleModel || 'Corolla'} · ★{drivers[0]?.rating || 4.94}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-extrabold text-emerald-400 font-mono">
                  GH₵ {calculateFare(currentTierInfo)}
                </div>
                <div className="text-[10px] text-slate-400">1.2 km · 3 mins away</div>
              </div>
            </div>

            {/* Interactive Driver Acceptance Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
              <button
                onClick={() => executeDriverMatch(0)}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Accept as Driver Now</span>
              </button>

              {onSwitchToDriverCockpit && (
                <button
                  onClick={() => {
                    setIsSearching(false);
                    onSwitchToDriverCockpit();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Car className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Open Drive Cockpit</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-slate-500 text-[11px]">Pickup: {pickupLocation.label.split(',')[0]}</span>
            <button
              onClick={() => setIsSearching(false)}
              className="text-rose-400 hover:text-rose-300 font-semibold text-xs cursor-pointer hover:underline"
            >
              Cancel Request
            </button>
          </div>
        </div>
      )}

      {/* STANDARD RIDE BOOKING INPUTS */}
      {!activeTrip && !isSearching && (
        <div className="space-y-4">
          {/* Pickup & Destination Selectors */}
          <div className="space-y-2.5 p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
            {/* Pickup */}
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <MapPin className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">Pickup Location</label>
                <select
                  value={pickupLocation?.label || ''}
                  onChange={(e) => {
                    const loc = POPULAR_LOCATIONS.find((l) => l.label === e.target.value);
                    if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
                      onSetPickup({ label: loc.label, lat: loc.lat, lng: loc.lng });
                    }
                  }}
                  className="w-full bg-transparent text-xs text-white font-medium focus:outline-none cursor-pointer"
                >
                  {POPULAR_LOCATIONS.map((loc) => (
                    <option key={loc.id} value={loc.label} className="bg-slate-900 text-white">
                      {loc.label} ({loc.city})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ml-3 pl-3 border-l-2 border-dashed border-slate-700 h-2" />

            {/* Destination */}
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <Navigation className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">Where to? (Destination)</label>
                <select
                  value={destinationLocation?.label || ''}
                  onChange={(e) => {
                    const loc = POPULAR_LOCATIONS.find((l) => l.label === e.target.value);
                    if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
                      onSetDestination({ label: loc.label, lat: loc.lat, lng: loc.lng });
                    }
                  }}
                  className="w-full bg-transparent text-xs text-white font-medium focus:outline-none cursor-pointer"
                >
                  <option value="" className="bg-slate-900 text-slate-400">
                    Select popular drop-off point or pick on map...
                  </option>
                  {POPULAR_LOCATIONS.filter((l) => l.label !== pickupLocation?.label).map((loc) => (
                    <option key={loc.id} value={loc.label} className="bg-slate-900 text-white">
                      {loc.label} ({loc.city})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Route Distance & ETA Banner */}
          {destinationLocation && (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                <span>Estimated Route: <strong>{distanceKm} km</strong></span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <Clock className="w-3.5 h-3.5" />
                <span>~{durationMins} mins travel time</span>
              </div>
            </div>
          )}

          {/* Service Tier Options */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">Choose Service Tier</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {RIDE_TIER_OPTIONS.map((tier) => {
                const isSelected = selectedTier === tier.id;
                const estimatedFare = calculateFare(tier);

                return (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => onSelectTier(tier.id)}
                    className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-500/10'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">🚗</span>
                      <div>
                        <div className="text-xs font-bold text-white">{tier.title}</div>
                        <div className="text-[10px] text-slate-400">
                          {tier.capacity} seats · {tier.subtitle}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-emerald-400">
                        GH₵ {estimatedFare}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        ${(estimatedFare / 15.5).toFixed(2)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Wallet className="w-4 h-4 text-emerald-400" />
              <span>Payment:</span>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
              >
                <option value="wallet" className="bg-slate-900">Nanivio Fintech Wallet (GH₵ 2,450.00)</option>
                <option value="momo" className="bg-slate-900">Mobile Money (MTN / Telecel / AT)</option>
                <option value="cash" className="bg-slate-900">Cash to Driver on Arrival</option>
              </select>
            </div>
            <span className="text-[10px] text-emerald-400 font-medium">Auto-settled</span>
          </div>

          {/* Request Button */}
          <button
            onClick={handleRequestRide}
            disabled={!isRideEnabled}
            className={`w-full py-3 rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.99] ${
              isRideEnabled
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/20 cursor-pointer'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
            }`}
          >
            <Car className="w-4 h-4" />
            <span>
              {isRideEnabled
                ? `Request ${currentTierInfo.title} · GH₵ ${calculateFare(currentTierInfo)}`
                : 'Nanivio Ride Offline (Admin OFF)'}
            </span>
            {isRideEnabled && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      )}

      {/* RIDE PAYMENT RECEIPT & RATING MODAL */}
      {showReceiptModal && completedReceiptData && (
        <RidePaymentReceiptModal
          receipt={completedReceiptData}
          onClose={() => {
            setShowReceiptModal(false);
            setCompletedReceiptData(null);
            onCancelTrip();
          }}
          onTipAdded={(amt) => {
            console.log(`Tip added: GH₵ ${amt}`);
          }}
          onRateDriver={(stars, compliments) => {
            console.log(`Driver rated ${stars} stars with compliments:`, compliments);
          }}
        />
      )}
    </div>
  );
};
