import React, { useState } from 'react';
import {
  Car,
  MapPin,
  Navigation,
  KeyRound,
  Radio,
  Sliders,
  DollarSign,
  Layers,
  Compass,
  AlertTriangle,
  CheckCircle2,
  Clock,
  UserCheck,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Check,
  RefreshCw,
  Phone,
  ExternalLink,
  Map as MapIcon,
  Globe,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { NanivioDriver, RideServiceTier } from '../../types/drive';

export const AdminRideHailingMapsManager: React.FC = () => {
  const {
    adminFeatures,
    updateAdminFeature,
    adminPricing,
    updateAdminPricing,
    setActiveTab,
  } = useNanivio();

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [selectedTier, setSelectedTier] = useState<RideServiceTier>('standard');
  const [isSimulatingDispatch, setIsSimulatingDispatch] = useState(false);
  const [simulationStatus, setSimulationStatus] = useState<string | null>(null);

  // Active Trips Ledger in Admin Memory
  const [activeTrips, setActiveTrips] = useState([
    {
      id: 'TRIP-8941',
      riderName: 'Ama Serwaa',
      riderNvId: '',
      driverName: 'Kofi Mensah',
      driverNvId: '0486821940',
      vehicle: 'Toyota Corolla LE (GN 4821-24)',
      pickup: 'Kotoka International Airport (Terminal 3)',
      destination: 'Kempinski Hotel Gold Coast City, Ridge',
      fareGHS: 62,
      tier: 'Comfort',
      status: 'IN_TRIP',
      otp: '4821',
      elapsedMins: 8,
    },
    {
      id: 'TRIP-8942',
      riderName: 'Kwesi Appiah',
      riderNvId: '0486128491',
      driverName: 'Kwame Boateng',
      driverNvId: '0486719283',
      vehicle: 'Hyundai Elantra (GR 8921-23)',
      pickup: 'Accra Mall, Tetteh Quarshie',
      destination: 'East Legon, Lagos Avenue',
      fareGHS: 38,
      tier: 'Standard',
      status: 'ARRIVED',
      otp: '1940',
      elapsedMins: 4,
    },
    {
      id: 'TRIP-8943',
      riderName: 'Abena Mansa',
      riderNvId: '0486339182',
      driverName: 'Unassigned (Broadcasting Radar)',
      driverNvId: '—',
      vehicle: 'Searching Nearest Tier 1...',
      pickup: 'University of Ghana, Legon Campus',
      destination: 'Achimota Retail Centre',
      fareGHS: 28,
      tier: 'Standard',
      status: 'SEARCHING',
      otp: '6219',
      elapsedMins: 1,
    },
  ]);

  // Live Driver Fleet Roster
  const [fleetDrivers] = useState<NanivioDriver[]>([]);

  const handlePricingUpdate = (key: any, val: number) => {
    updateAdminPricing(key, val);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 1500);
  };

  const handleSimulateDispatch = () => { setSimulationStatus('Live dispatch provider is not connected. No simulated dispatch is generated.'); };

  const handleEmergencyCancelTrip = (tripId: string) => {
    setActiveTrips((prev) =>
      prev.map((t) => (t.id === tripId ? { ...t, status: 'CANCELLED_BY_ADMIN' } : t))
    );
  };

  const handleForceCompleteTrip = (tripId: string) => {
    setActiveTrips((prev) =>
      prev.map((t) => (t.id === tripId ? { ...t, status: 'COMPLETED' } : t))
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* MASTER SPOTLIGHT BANNER: Entire Nanivio Drive Fleet Control */}
      <div className={`p-5 rounded-3xl border transition-all ${
        adminFeatures?.nanivioDriveEnabled !== false
          ? 'bg-gradient-to-r from-[#0c241d] via-[#0e2a22] to-[#091814] border-emerald-500/50 shadow-xl shadow-emerald-500/10'
          : 'bg-gradient-to-r from-[#240c14] via-[#2a0e18] to-[#18090f] border-rose-500/50 shadow-xl shadow-rose-500/10'
      }`}>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
              adminFeatures?.nanivioDriveEnabled !== false
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-lg'
                : 'bg-rose-500/20 text-rose-400 border-rose-500/40 shadow-lg'
            }`}>
              <Car className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-extrabold text-white">Entire Nanivio Drive: Master Fleet &amp; Operations Control</h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                  adminFeatures?.nanivioDriveEnabled !== false
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}>
                  {adminFeatures?.nanivioDriveEnabled !== false ? '● FLEET ONLINE (OPERATIONAL)' : '○ FLEET SUSPENDED (OFFLINE)'}
                </span>
              </div>
              <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                {adminFeatures?.nanivioDriveEnabled !== false
                  ? 'All ride-hailing requests, Uba vehicle rentals, GPS driver radar, and the Nanivio Drive Partner Cockpit are active and accepting bookings.'
                  : 'The entire Nanivio Drive ecosystem is switched OFF. Users cannot book rides or rent vehicles, and driver partner cockpits are placed on standby.'}
              </p>
              <div className="flex items-center gap-2 text-[11px] text-cyan-300/90 font-mono pt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                <span>Does NOT affect Communication Hub, Global Experts, Local Business Directory, or Fintech Wallets.</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
            <span className={`text-xs font-mono font-bold ${adminFeatures?.nanivioDriveEnabled !== false ? 'text-emerald-400' : 'text-rose-400'}`}>
              {adminFeatures?.nanivioDriveEnabled !== false ? 'ENABLED' : 'DISABLED'}
            </span>
            <button
              id="btn-admin-manager-toggle-nanivio-drive"
              onClick={() => updateAdminFeature('nanivioDriveEnabled', !(adminFeatures?.nanivioDriveEnabled !== false))}
              className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                adminFeatures?.nanivioDriveEnabled !== false ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-slate-700'
              }`}
              title="Toggle Entire Nanivio Drive Fleet ON or OFF"
            >
              <span
                className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  adminFeatures?.nanivioDriveEnabled !== false ? 'translate-x-8' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-[#0d1c2b] to-[#0a1520] border border-emerald-500/40 rounded-3xl p-6 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg">
            <Car className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-white">Nanivio Ride-Hailing &amp; Geospatial Maps Control</h2>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                adminFeatures?.nanivioDriveEnabled !== false
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
              }`}>
                {adminFeatures?.nanivioDriveEnabled !== false ? 'LIVE DISPATCH CONSOLE' : 'DISPATCH SUSPENDED'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage Google Maps Platform integration, dynamic fare algorithms, driver fleet telemetry, and dispatch state machines
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => updateAdminFeature('nanivioDriveEnabled', !(adminFeatures?.nanivioDriveEnabled !== false))}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              adminFeatures?.nanivioDriveEnabled !== false
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
            }`}
            title="Toggle Nanivio Drive Fleet Master Switch"
          >
            <span className={`w-2 h-2 rounded-full ${adminFeatures?.nanivioDriveEnabled !== false ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span>Nanivio Drive: {adminFeatures?.nanivioDriveEnabled !== false ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => setActiveTab('services')}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-emerald-500/50 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md"
          >
            <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
            <span>Launch Rider View</span>
          </button>

          <button
            onClick={handleSimulateDispatch}
            disabled={isSimulatingDispatch || adminFeatures?.nanivioDriveEnabled === false}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-lg ${
              adminFeatures?.nanivioDriveEnabled === false
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/20'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${isSimulatingDispatch ? 'animate-spin' : 'animate-pulse'}`} />
            <span>{isSimulatingDispatch ? 'Simulating...' : 'Test Dispatch Radar'}</span>
          </button>
        </div>
      </div>

      {simulationStatus && (
        <div className="p-3.5 rounded-2xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{simulationStatus}</span>
        </div>
      )}

      {/* Fleet Telemetry Metric Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[#0c1424] border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-xs text-slate-400 font-mono uppercase">Online Drivers in Accra</div>
          <div className="text-2xl font-extrabold text-white font-mono flex items-center gap-2">
            <span>18 Active</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-[10px] text-emerald-400">14 Available · 4 En Route</div>
        </div>

        <div className="bg-[#0c1424] border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-xs text-slate-400 font-mono uppercase">Average Pickup ETA</div>
          <div className="text-2xl font-extrabold text-emerald-400 font-mono">
            3.4 <span className="text-xs text-slate-400">mins</span>
          </div>
          <div className="text-[10px] text-slate-400">Accra Airport &amp; Ridge Corridor</div>
        </div>

        <div className="bg-[#0c1424] border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-xs text-slate-400 font-mono uppercase">Completed Rides (Today)</div>
          <div className="text-2xl font-extrabold text-amber-400 font-mono">
            382 <span className="text-xs text-slate-400">trips</span>
          </div>
          <div className="text-[10px] text-slate-400">99.2% Verification Acceptance</div>
        </div>

        <div className="bg-[#0c1424] border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-xs text-slate-400 font-mono uppercase">Gross Ride Settlement</div>
          <div className="text-2xl font-extrabold text-white font-mono">
            GH₵ 19,450
          </div>
          <div className="text-[10px] text-slate-400">Platform Cut (15%): GH₵ 2,917.50</div>
        </div>
      </div>

      {/* SECTION 1: MAP ENGINE & GEOSPATIAL PLATFORM CONFIGURATION */}
      <div className="bg-[#0c1424] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <MapIcon className="w-4 h-4 text-cyan-400" />
              <span>Google Maps Platform &amp; Geospatial Engine Suite</span>
            </h3>
            <p className="text-xs text-slate-400">
              Configure map providers, production Google Maps credentials, GPS polling intervals, and satellite layers
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">Default System Engine:</span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${
              adminFeatures.googleMapsSdkEnabled
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
            }`}>
              {adminFeatures.googleMapsSdkEnabled ? 'Google Maps SDK (Cloud)' : 'Accra Vector Map (Offline)'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Master Map Engine Toggle */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span>Google Maps Platform SDK</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Uses @vis.gl/react-google-maps with dynamic attribution tracking and official satellite imagery
              </p>
            </div>
            <button
              onClick={() => updateAdminFeature('googleMapsSdkEnabled', !adminFeatures.googleMapsSdkEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                adminFeatures.googleMapsSdkEnabled ? 'bg-cyan-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  adminFeatures.googleMapsSdkEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Ride Hailing Module Switch */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-emerald-400" />
                <span>Ride-Hailing Feature Switch</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Controls visibility of the Nanivio Ride tab, booking panel, and dispatch broadcast
              </p>
            </div>
            <button
              onClick={() => updateAdminFeature('rideHailingEnabled', !adminFeatures.rideHailingEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                adminFeatures.rideHailingEnabled ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  adminFeatures.rideHailingEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Nanivio Drive Partner App Switch */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-amber-400" />
                <span>Nanivio Drive Partner Cockpit</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Controls the driver offer reception HUD, accept/decline sound alerts, and turn-by-turn routing
              </p>
            </div>
            <button
              onClick={() => updateAdminFeature('driverPartnerAppEnabled', !adminFeatures.driverPartnerAppEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                adminFeatures.driverPartnerAppEnabled ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  adminFeatures.driverPartnerAppEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Geospatial Map Configuration Parameters */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
          <div className="space-y-1">
            <span className="text-slate-400 block text-[11px]">Primary Map Center</span>
            <span className="text-white font-bold">5.6037° N, -0.1870° W</span>
            <span className="text-[10px] text-slate-500 block">Accra Central &amp; Kotoka Corridor</span>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400 block text-[11px]">Active Map SDK ID</span>
            <span className="text-cyan-400 font-bold">gmp_mcp_codeassist_v1_aistudio</span>
            <span className="text-[10px] text-slate-500 block">Attribution &amp; Usage Metering</span>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400 block text-[11px]">GPS Polling Frequency</span>
            <span className="text-emerald-400 font-bold">3,000 ms (Real-Time Radar)</span>
            <span className="text-[10px] text-slate-500 block">Driver Location Smooth Interpolation</span>
          </div>
        </div>
      </div>

      {/* SECTION 2: DYNAMIC FARE ALGORITHM & PRICING ENGINE */}
      <div className="bg-[#0c1424] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-400" />
              <span>Nanivio Ride Dynamic Pricing &amp; Commission Parameters</span>
            </h3>
            <p className="text-xs text-slate-400">
              Base fares, per-kilometer multipliers, surge demand factors, and driver payout percentages
            </p>
          </div>

          {savedSuccess && (
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/40 flex items-center gap-1.5 animate-in fade-in">
              <Check className="w-3.5 h-3.5" />
              Saved
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Base Fare (GH₵)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">GH₵</span>
              <input
                type="number"
                step="1"
                value={adminPricing.rideBaseFareGHS ?? 15.0}
                onChange={(e) =>
                  handlePricingUpdate('rideBaseFareGHS', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <p className="text-[10px] text-slate-500">Standard pickup flag-drop charge</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Rate per Kilometer (GH₵/km)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">GH₵</span>
              <input
                type="number"
                step="0.5"
                value={adminPricing.ridePerKmRateGHS ?? 5.5}
                onChange={(e) =>
                  handlePricingUpdate('ridePerKmRateGHS', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <p className="text-[10px] text-slate-500">Distance rate computed via Google Maps routing</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Rate per Minute (GH₵/min)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">GH₵</span>
              <input
                type="number"
                step="0.1"
                value={adminPricing.ridePerMinuteRateGHS ?? 1.2}
                onChange={(e) =>
                  handlePricingUpdate('ridePerMinuteRateGHS', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <p className="text-[10px] text-slate-500">Duration rate during traffic &amp; waiting times</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-amber-400 block">
              Surge Demand Multiplier (Active)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min="1.0"
                max="3.5"
                value={adminPricing.rideSurgeMultiplier ?? 1.2}
                onChange={(e) =>
                  handlePricingUpdate('rideSurgeMultiplier', parseFloat(e.target.value) || 1.0)
                }
                className="w-full bg-slate-950 border border-amber-500/50 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-amber-400"
              />
              <span className="text-xs text-amber-400 font-mono">x</span>
            </div>
            <p className="text-[10px] text-slate-500">Applies when ride demand exceeds 80% driver availability</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Nanivio Platform Commission (%)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="1"
                value={adminPricing.driverCommissionPercent ?? 15}
                onChange={(e) =>
                  handlePricingUpdate('driverCommissionPercent', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
              <span className="text-xs text-slate-400 font-mono">%</span>
            </div>
            <p className="text-[10px] text-slate-500">Platform retention (Drivers keep 85% of fare)</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Cancellation Fee (GH₵)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">GH₵</span>
              <input
                type="number"
                step="1"
                value={adminPricing.rideCancellationFeeGHS ?? 10.0}
                onChange={(e) =>
                  handlePricingUpdate('rideCancellationFeeGHS', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <p className="text-[10px] text-slate-500">Charged if rider cancels &gt; 3 mins after driver match</p>
          </div>
        </div>
      </div>

      {/* SECTION 3: LIVE ACTIVE DISPATCH MONITOR & TRIPS LEDGER */}
      <div className="bg-[#0c1424] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>Live Trips &amp; Dispatch Console ({activeTrips.length} Active)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Sovereign administrative intervention: cancel trips, inspect OTPs, or override completion status
            </p>
          </div>

          <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-mono font-bold border border-emerald-500/30">
            RADAR ACTIVE
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-slate-800 rounded-2xl overflow-hidden">
            <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px]">
              <tr>
                <th className="p-3">Trip ID</th>
                <th className="p-3">Rider</th>
                <th className="p-3">Driver / Vehicle</th>
                <th className="p-3">Route (Pickup → Dropoff)</th>
                <th className="p-3">Fare (GH₵)</th>
                <th className="p-3">OTP PIN</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
              {activeTrips.map((trip) => (
                <tr key={trip.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-3 font-mono font-bold text-cyan-400">{trip.id}</td>
                  <td className="p-3">
                    <div className="font-bold text-white">{trip.riderName}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{trip.riderNvId}</div>
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-white">{trip.driverName}</div>
                    <div className="text-[10px] text-slate-400">{trip.vehicle}</div>
                  </td>
                  <td className="p-3 max-w-[260px]">
                    <div className="truncate text-slate-200" title={trip.pickup}>🟢 {trip.pickup}</div>
                    <div className="truncate text-slate-400" title={trip.destination}>🔴 {trip.destination}</div>
                  </td>
                  <td className="p-3 font-mono font-bold text-emerald-400">
                    GH₵ {trip.fareGHS}
                  </td>
                  <td className="p-3 font-mono font-extrabold text-amber-400">
                    {trip.otp}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                      trip.status === 'IN_TRIP'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : trip.status === 'ARRIVED'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : trip.status === 'SEARCHING'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {trip.status}
                    </span>
                  </td>
                  <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                    {trip.status !== 'COMPLETED' && trip.status !== 'CANCELLED_BY_ADMIN' && (
                      <>
                        <button
                          onClick={() => handleForceCompleteTrip(trip.id)}
                          className="px-2 py-1 rounded-lg bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold hover:bg-emerald-900 transition-colors cursor-pointer"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => handleEmergencyCancelTrip(trip.id)}
                          className="px-2 py-1 rounded-lg bg-rose-950 border border-rose-500/40 text-rose-300 text-[10px] font-bold hover:bg-rose-900 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 4: ACTIVE DRIVER FLEET ROSTER */}
      <div className="bg-[#0c1424] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>Active Accra Driver Fleet Telemetry</span>
            </h3>
            <p className="text-xs text-slate-400">
              Live driver coordinates, vehicle plates, service tier authorizations, and rental fleet rates
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {fleetDrivers.map((driver) => (
            <div
              key={driver.id}
              className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 hover:border-emerald-500/40 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <img
                    src={driver.avatar}
                    alt={driver.name}
                    className="w-10 h-10 rounded-full object-cover border border-emerald-500/30"
                  />
                  <div>
                    <div className="font-bold text-white text-xs">{driver.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{driver.nvId}</div>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                  ★ {driver.rating}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Vehicle:</span>
                  <span className="font-bold text-white">{driver.vehicleMake} {driver.vehicleModel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Plate:</span>
                  <span className="font-mono text-emerald-400 font-bold">{driver.plateNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tier:</span>
                  <span className="uppercase font-mono text-cyan-300 font-bold">{driver.serviceTier}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="text-emerald-300 font-mono font-bold uppercase">{driver.status}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>{driver.tripsCount} Completed Trips</span>
                <span>{driver.offersCarRental ? `Rental: GH₵ ${driver.rentalDailyRateGHS}/d` : 'No Rental'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
