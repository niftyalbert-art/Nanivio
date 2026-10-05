import React, { useState, useEffect } from 'react';
import {
  Car,
  MapPin,
  Navigation,
  Globe,
  ShieldCheck,
  Zap,
  ArrowRight,
  Clock,
  CreditCard,
  Sparkles,
  Phone,
  MessageSquare,
  ChevronRight,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { LangpretationIcon } from '../common/LangpretationIcon';
import { NanivioGoogleMapViewer } from '../services/NanivioGoogleMapViewer';
import { NanivioRideHailingPanel } from '../services/NanivioRideHailingPanel';
import { POPULAR_LOCATIONS, NEARBY_PLACES } from '../../data/driveMockData';
import { locationService } from '../../services/locationService';
import type { NanivioDriver, RideServiceTier, NearbyLivePlace } from '../../types/drive';

export const NanivioRidePreview: React.FC = () => {
  const { setActiveTab, billingSummary, start1on1Call, adminFeatures, updateAdminFeature, isAdmin } = useNanivio();
  const isRideEnabled = adminFeatures?.nanivioRideEnabled !== false && adminFeatures?.nanivioDriveEnabled !== false;
  const [activeSubTab, setActiveSubTab] = useState<'dispatch' | 'architecture'>('dispatch');

  // Location & Map State
  const currentLocation = locationService.getLocation();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({
    lat: currentLocation.lat || 5.6052,
    lng: currentLocation.lng || -0.1668,
  });

  const [pickupLocation, setPickupLocation] = useState<{ label: string; lat: number; lng: number }>({
    label: `${currentLocation.city} Metropolitan Hub`,
    lat: currentLocation.lat || 5.6052,
    lng: currentLocation.lng || -0.1668,
  });

  const [destinationLocation, setDestinationLocation] = useState<{ label: string; lat: number; lng: number } | null>({
    label: 'Kotoka International Airport (Terminal 3)',
    lat: 5.6052,
    lng: -0.1668,
  });

  const [selectedTier, setSelectedTier] = useState<RideServiceTier>('standard');
  const [drivers, setDrivers] = useState<NanivioDriver[]>([]);
  const [activeTrip, setActiveTrip] = useState<any>(null);

  const availableValue = (
    billingSummary?.communicationAccount?.balance ??
    (billingSummary?.wallets?.find((w) => w.currency === 'GHS')?.available ?? 0.0)
  ).toFixed(2);

  // Dynamic route calculation
  const distanceKm = destinationLocation && pickupLocation
    ? Math.max(
        2.0,
        Math.round(
          Math.sqrt(
            Math.pow(((destinationLocation.lat ?? 5.6174) - (pickupLocation.lat ?? 5.6052)) * 111, 2) +
              Math.pow(((destinationLocation.lng ?? -0.1772) - (pickupLocation.lng ?? -0.1668)) * 111, 2)
          ) * 10
        ) / 10
      )
    : 5.2;

  const durationMins = Math.round(distanceKm * 2.5) + 5;

  const activeRoute = destinationLocation && pickupLocation
    ? {
        distanceKm,
        durationMins,
        polyline: [
          [pickupLocation.lat, pickupLocation.lng],
          [
            (pickupLocation.lat * 2 + destinationLocation.lat) / 3,
            (pickupLocation.lng * 2 + destinationLocation.lng) / 3 + 0.003,
          ],
          [
            (pickupLocation.lat + destinationLocation.lat * 2) / 3,
            (pickupLocation.lng + destinationLocation.lng * 2) / 3 - 0.002,
          ],
          [destinationLocation.lat, destinationLocation.lng],
        ] as [number, number][],
      }
    : null;

  const handleStartRideRequest = (driver: NanivioDriver) => {
    setActiveTrip({
      id: `trip_nv_${Date.now()}`,
      driver,
      pickup: pickupLocation,
      destination: destinationLocation,
      tier: selectedTier,
      distanceKm,
      durationMins,
      startTime: Date.now(),
    });
  };

  const handleCancelTrip = () => {
    setActiveTrip(null);
  };

  const handleCallDriver = (driver: NanivioDriver) => {
    const participant = {
      id: driver.id,
      name: driver.name,
      avatar: driver.avatar,
      initials: driver.name.slice(0, 2).toUpperCase(),
      myLanguage: driver.spokenLanguages[0] || 'en',
      isExpert: false,
      phoneNumber: driver.phone,
      nvId: driver.nvId,
    };
    start1on1Call(participant, 'audio', false);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Admin Ride OFF Notice if toggled off */}
      {!isRideEnabled && (
        <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-500/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>Nanivio Ride is Currently OFF</span>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono font-bold">
                  ADMIN SUSPENDED
                </span>
              </div>
              <p className="text-xs text-rose-200/80 mt-0.5">
                Ride bookings and fleet hailing have been switched OFF by the administrator.
              </p>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => updateAdminFeature('nanivioRideEnabled', true)}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md shrink-0 cursor-pointer"
            >
              Turn Nanivio Ride ON
            </button>
          )}
        </div>
      )}

      {/* Top Banner Header */}
      <div className="bg-gradient-to-br from-[#0c1424] via-[#080d19] to-[#040812] border border-indigo-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/40">
              <Car className="w-3.5 h-3.5" />
              <span>Nanivio Mobility Dispatch &amp; Radar</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <span>Nanivio Ride</span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold">
                PROVIDER NOT CONNECTED
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Global ride-hailing with real-time driver-rider <strong className="text-emerald-400 font-semibold">Langpretation</strong>, private NV Number communication, and direct settlement from your Nanivio credit.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-mono">Nanivio credit</div>
                <div className="text-xs font-bold font-mono text-emerald-300">GH₵ {availableValue}</div>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('home')}
              className="px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-600 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Back to Home</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Dispatch vs Architecture Sub-Tabs */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
          <button
            onClick={() => setActiveSubTab('dispatch')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'dispatch'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Interactive Ride Dispatch</span>
          </button>

          <button
            onClick={() => setActiveSubTab('architecture')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'architecture'
                ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Mobility &amp; Langpretation Architecture</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeSubTab === 'dispatch' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left / Top: Interactive Booking & Dispatch Panel */}
          <div className="lg:col-span-5 order-2 lg:order-1 space-y-4">
            <NanivioRideHailingPanel
              drivers={drivers}
              selectedTier={selectedTier}
              onSelectTier={setSelectedTier}
              pickupLocation={pickupLocation}
              destinationLocation={destinationLocation}
              onSetPickup={setPickupLocation}
              onSetDestination={setDestinationLocation}
              distanceKm={distanceKm}
              durationMins={durationMins}
              onStartRideRequest={handleStartRideRequest}
              activeTrip={activeTrip}
              onCancelTrip={handleCancelTrip}
              onCallDriver={handleCallDriver}
            />
          </div>

          {/* Right / Top: Live Map Radar View */}
          <div className="lg:col-span-7 order-1 lg:order-2 space-y-4">
            <div className="rounded-3xl border border-slate-800 bg-[#070d18] overflow-hidden shadow-2xl relative">
              <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-xs font-bold text-white font-mono uppercase">
                    Live GPS Telemetry &amp; Driver Radar
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {drivers.length} Drivers Online • {distanceKm.toFixed(1)} km Route
                </div>
              </div>

              <div className="h-[460px] sm:h-[560px] w-full relative">
                <NanivioGoogleMapViewer
                  userLocation={userLocation}
                  drivers={drivers}
                  places={NEARBY_PLACES}
                  selectedPlace={null}
                  onSelectPlace={() => {}}
                  pickupLocation={pickupLocation}
                  destinationLocation={destinationLocation}
                  activeRoute={activeRoute}
                  activeFilter="all"
                  onFilterChange={() => {}}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Architecture & Trust Specifications View */
        <div className="space-y-6 animate-in fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <LangpretationIcon size={24} />
              </div>
              <h3 className="text-base font-bold text-white">Live In-Ride Langpretation</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                When a passenger speaks in Twi, Swahili, or French, their driver receives real-time vocalized audio and text subtitles in their primary language. No linguistic friction during pickups or en-route directions.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">NV Number Identity Shield</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Personal phone numbers are never shared or logged by carriers. Driver and rider communicate exclusively over encrypted WebRTC voice and chat channels bound to sovereign NV Number identifiers.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
                <CreditCard className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">Universal Nanivio credit</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                No foreign exchange penalties or payment fragmentation. Rides are debited from the same unified Nanivio credit that powers your international Langpretation calls and messaging.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
