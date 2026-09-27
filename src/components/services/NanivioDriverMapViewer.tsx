import React, { useState, useEffect } from 'react';
import {
  Navigation,
  Compass,
  Layers,
  Volume2,
  VolumeX,
  Crosshair,
  Flame,
  AlertTriangle,
  MapPin,
  Car,
  Clock,
  Sparkles,
  Phone,
  Shield,
  Zap,
} from 'lucide-react';

export interface DriverMapCoordinate {
  lat: number;
  lng: number;
}

export interface SurgeZone {
  id: string;
  name: string;
  multiplier: number;
  lat: number;
  lng: number;
  radiusMeters: number;
  demandLevel: 'high' | 'very_high' | 'extreme';
}

export interface UserServiceRequestPin {
  id: string;
  riderName: string;
  riderAvatar: string;
  riderRating: number;
  serviceType: 'ride' | 'delivery' | 'airport_vip' | 'roadside';
  pickupLabel: string;
  dropoffLabel: string;
  lat: number;
  lng: number;
  fareGHS: number;
  distanceAway: string;
  riderLanguage: string;
}

interface NanivioDriverMapViewerProps {
  driverLocation: DriverMapCoordinate;
  driverHeading?: number;
  isOnline: boolean;
  activeRoute: {
    polyline: [number, number][];
    distanceKm: number;
    durationMins: number;
    destinationLabel: string;
    stepInstruction?: string;
  } | null;
  pickupLocation?: { lat: number; lng: number; label: string } | null;
  dropoffLocation?: { lat: number; lng: number; label: string } | null;
  speedKmH?: number;
  speedLimitKmH?: number;
  userRequestPins?: UserServiceRequestPin[];
  onSelectUserRequest?: (req: UserServiceRequestPin) => void;
  tripStatus?: 'IDLE' | 'OFFER' | 'HEADING_TO_PICKUP' | 'ARRIVED_AT_PICKUP' | 'IN_TRIP' | 'COMPLETED';
}

export const SURGE_ZONES: SurgeZone[] = [
  {
    id: 'surge_airport',
    name: 'Kotoka Int Airport (T3)',
    multiplier: 1.8,
    lat: 5.6052,
    lng: -0.1668,
    radiusMeters: 65,
    demandLevel: 'extreme',
  },
  {
    id: 'surge_osu',
    name: 'Osu Oxford Street',
    multiplier: 1.5,
    lat: 5.5562,
    lng: -0.1834,
    radiusMeters: 55,
    demandLevel: 'very_high',
  },
  {
    id: 'surge_east_legon',
    name: 'East Legon / Lagos Ave',
    multiplier: 1.4,
    lat: 5.6358,
    lng: -0.1582,
    radiusMeters: 60,
    demandLevel: 'high',
  },
  {
    id: 'surge_ridge',
    name: 'Ridge Hospital & Financial Dist',
    multiplier: 1.6,
    lat: 5.5684,
    lng: -0.1983,
    radiusMeters: 50,
    demandLevel: 'very_high',
  },
  {
    id: 'surge_cbd',
    name: 'Makola & Central Business Dist',
    multiplier: 1.5,
    lat: 5.5438,
    lng: -0.2064,
    radiusMeters: 55,
    demandLevel: 'high',
  },
];

export const NanivioDriverMapViewer: React.FC<NanivioDriverMapViewerProps> = ({
  driverLocation,
  driverHeading = 45,
  isOnline,
  activeRoute,
  pickupLocation,
  dropoffLocation,
  speedKmH = 46,
  speedLimitKmH = 50,
  userRequestPins = [],
  onSelectUserRequest,
  tripStatus = 'IDLE',
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(14);
  const [mapCenter, setMapCenter] = useState<DriverMapCoordinate>(driverLocation);
  const [showSurgeZones, setShowSurgeZones] = useState<boolean>(true);
  const [showTraffic, setShowTraffic] = useState<boolean>(true);
  const [voiceGuidanceEnabled, setVoiceGuidanceEnabled] = useState<boolean>(true);
  const [mapMode, setMapMode] = useState<'driver_hud' | 'satellite' | 'high_contrast'>('driver_hud');
  const [lastSpokenStep, setLastSpokenStep] = useState<string>('');

  // Auto-center on driver or active destination
  useEffect(() => {
    if (activeRoute && dropoffLocation?.lat && tripStatus === 'IN_TRIP') {
      setMapCenter({
        lat: ((driverLocation?.lat ?? 5.6120) + dropoffLocation.lat) / 2,
        lng: ((driverLocation?.lng ?? -0.1690) + dropoffLocation.lng) / 2,
      });
    } else if (pickupLocation?.lat && tripStatus === 'HEADING_TO_PICKUP') {
      setMapCenter({
        lat: ((driverLocation?.lat ?? 5.6120) + pickupLocation.lat) / 2,
        lng: ((driverLocation?.lng ?? -0.1690) + pickupLocation.lng) / 2,
      });
    } else if (driverLocation?.lat) {
      setMapCenter(driverLocation);
    }
  }, [driverLocation, activeRoute, pickupLocation, dropoffLocation, tripStatus]);

  // Simulated Voice Guidance Audio Prompts
  useEffect(() => {
    if (!voiceGuidanceEnabled || !activeRoute?.stepInstruction) return;
    if (activeRoute.stepInstruction === lastSpokenStep) return;

    setLastSpokenStep(activeRoute.stepInstruction);

    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(activeRoute.stepInstruction);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      // Audio speech synthesis fallback silent
    }
  }, [activeRoute?.stepInstruction, voiceGuidanceEnabled, lastSpokenStep]);

  // SVG Projections for Accra Metropolitan Canvas
  const mapWidth = 840;
  const mapHeight = 520;
  const scale = 3600 * Math.pow(1.22, zoomLevel - 13);

  const geoToSvg = (lat?: number, lng?: number) => {
    const safeLat = typeof lat === 'number' && !isNaN(lat) ? lat : (mapCenter?.lat ?? 5.6120);
    const safeLng = typeof lng === 'number' && !isNaN(lng) ? lng : (mapCenter?.lng ?? -0.1690);
    const x = mapWidth / 2 + (safeLng - (mapCenter?.lng ?? -0.1690)) * scale;
    const y = mapHeight / 2 - (safeLat - (mapCenter?.lat ?? 5.6120)) * scale * 1.06;
    return { x, y };
  };

  const driverSvgPt = geoToSvg(driverLocation?.lat, driverLocation?.lng);

  return (
    <div className="relative w-full rounded-3xl overflow-hidden border border-emerald-500/30 bg-[#060d19] shadow-2xl flex flex-col">
      {/* DRIVER COCKPIT TOP NAVIGATION BAR */}
      <div className="p-3 bg-[#081325]/95 backdrop-blur-md border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 z-20">
        <div className="flex items-center gap-2">
          {/* Driver Status Indicator */}
          <div
            className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-2 border ${
              isOnline
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-500/20'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              }`}
            />
            <span>{isOnline ? 'GPS RADAR ONLINE' : 'GPS OFFLINE'}</span>
          </div>

          {/* Current Street / Corridor Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200">
            <Compass className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-semibold text-white">Airport Bypass Rd / Liberation Corridor</span>
          </div>
        </div>

        {/* Cockpit Map Controls */}
        <div className="flex items-center gap-1.5">
          {/* Surge Pricing Heatmap Toggle */}
          <button
            onClick={() => setShowSurgeZones(!showSurgeZones)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
              showSurgeZones
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                : 'bg-slate-900/90 text-slate-400 border-slate-800'
            }`}
            title="Toggle Surge Pricing High-Demand Heatmaps"
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">Surge Heatmap</span>
            <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
              1.8x
            </span>
          </button>

          {/* Traffic Flow Toggle */}
          <button
            onClick={() => setShowTraffic(!showTraffic)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
              showTraffic
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                : 'bg-slate-900/90 text-slate-400 border-slate-800'
            }`}
            title="Toggle Real-Time Traffic Layer"
          >
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Traffic</span>
          </button>

          {/* Voice Guidance Audio Switcher */}
          <button
            onClick={() => setVoiceGuidanceEnabled(!voiceGuidanceEnabled)}
            className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              voiceGuidanceEnabled
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                : 'bg-slate-900/90 text-slate-400 border-slate-800'
            }`}
            title={voiceGuidanceEnabled ? 'GPS Voice Guidance Active' : 'GPS Voice Muted'}
          >
            {voiceGuidanceEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>

          {/* Recenter on Driver Button */}
          <button
            onClick={() => {
              setMapCenter(driverLocation);
              setZoomLevel(14);
            }}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-all cursor-pointer"
            title="Recenter Map on Driver Vehicle"
          >
            <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
          </button>
        </div>
      </div>

      {/* ACTIVE TURN-BY-TURN GPS BANNER OVERLAY */}
      {activeRoute?.stepInstruction && (
        <div className="absolute top-16 left-3 right-3 sm:left-6 sm:right-auto sm:max-w-md z-30 p-3.5 rounded-2xl bg-slate-950/95 backdrop-blur-md border border-emerald-500/50 shadow-2xl flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-slate-950 flex items-center justify-center font-black shadow-md shadow-emerald-500/20 shrink-0">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-extrabold text-emerald-400 tracking-wider">
                GPS Turn Direction
              </div>
              <div className="text-xs sm:text-sm font-bold text-white line-clamp-1">
                {activeRoute.stepInstruction}
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-xs font-mono font-bold text-emerald-400">
              {activeRoute.distanceKm.toFixed(1)} km
            </div>
            <div className="text-[10px] text-slate-400">{activeRoute.durationMins} mins ETA</div>
          </div>
        </div>
      )}

      {/* DRIVER SPEEDOMETER & TELEMETRY HUD OVERLAY (BOTTOM LEFT) */}
      <div className="absolute bottom-4 left-4 z-30 flex items-center gap-2">
        {/* Speedometer Gauge */}
        <div className="p-3 rounded-2xl bg-slate-950/90 backdrop-blur-md border border-slate-800 shadow-xl flex items-center gap-3">
          <div className="text-center">
            <div
              className={`text-2xl font-black font-mono leading-none ${
                speedKmH > speedLimitKmH ? 'text-rose-400 animate-pulse' : 'text-emerald-400'
              }`}
            >
              {speedKmH}
            </div>
            <div className="text-[9px] uppercase font-bold text-slate-400 mt-0.5">km/h</div>
          </div>

          <div className="h-8 w-px bg-slate-800" />

          {/* Speed Limit Sign */}
          <div className="w-9 h-9 rounded-full border-2 border-rose-500 bg-white flex flex-col items-center justify-center text-slate-950 font-black shadow-md">
            <span className="text-[8px] leading-none uppercase text-slate-700 font-bold">LIMIT</span>
            <span className="text-xs leading-none font-extrabold">{speedLimitKmH}</span>
          </div>
        </div>

        {/* Heading Compass */}
        <div className="hidden sm:flex p-2.5 rounded-2xl bg-slate-950/90 backdrop-blur-md border border-slate-800 shadow-xl items-center gap-2 text-xs font-mono text-slate-300">
          <Compass className="w-4 h-4 text-emerald-400" />
          <span>NE 45°</span>
        </div>
      </div>

      {/* SVG INTERACTIVE VECTOR DRIVER MAP CANVAS */}
      <div className="relative w-full h-[400px] sm:h-[460px] bg-[#050c17] overflow-hidden select-none">
        <svg
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          style={{
            background:
              mapMode === 'satellite'
                ? 'radial-gradient(ellipse at center, #0f1c2e 0%, #060b14 100%)'
                : 'radial-gradient(ellipse at center, #081220 0%, #040810 100%)',
          }}
        >
          {/* Greater Accra Base Map Infrastructure */}
          <g opacity="0.65">
            {/* Coastline / Atlantic Ocean */}
            <path
              d="M -100,500 Q 200,470 450,490 T 900,480 L 900,550 L -100,550 Z"
              fill="#06182c"
              stroke="#0a2a4c"
              strokeWidth="2"
            />
            <text x="50" y="515" fill="#1b4570" fontSize="11" fontWeight="bold" letterSpacing="2">
              GULF OF GUINEA · ATLANTIC OCEAN
            </text>

            {/* Tema Motorway (N1 East) */}
            <line x1="390" y1="180" x2="860" y2="120" stroke="#1f3654" strokeWidth="6" strokeLinecap="round" />
            <line x1="390" y1="180" x2="860" y2="120" stroke="#2a4a75" strokeWidth="3" strokeLinecap="round" />
            <text x="580" y="145" fill="#4d6f99" fontSize="9" fontWeight="bold">
              ACCRA - TEMA MOTORWAY (N1)
            </text>

            {/* George Walker Bush Highway (N1 West) */}
            <line x1="-50" y1="210" x2="390" y2="180" stroke="#1f3654" strokeWidth="6" strokeLinecap="round" />
            <line x1="-50" y1="210" x2="390" y2="180" stroke="#2a4a75" strokeWidth="3" strokeLinecap="round" />
            <text x="140" y="190" fill="#4d6f99" fontSize="9" fontWeight="bold">
              GEORGE BUSH HIGHWAY (N1)
            </text>

            {/* Liberation Road (Airport Corridor) */}
            <line x1="390" y1="420" x2="400" y2="90" stroke="#1f3654" strokeWidth="6" strokeLinecap="round" />
            <line x1="390" y1="420" x2="400" y2="90" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
            <text x="405" y="270" fill="#38bdf8" fontSize="9" fontWeight="bold" transform="rotate(85, 405, 270)">
              LIBERATION ROAD (AIRPORT CORRIDOR)
            </text>

            {/* Ring Road Central */}
            <path d="M 180,390 Q 330,330 470,360 T 610,420" fill="none" stroke="#1a3250" strokeWidth="4" strokeLinecap="round" />
            <text x="310" y="340" fill="#3b5b82" fontSize="9" fontWeight="semibold">
              RING ROAD CENTRAL
            </text>

            {/* Oxford Street Osu */}
            <line x1="440" y1="360" x2="460" y2="450" stroke="#1a2f48" strokeWidth="3" />
            <text x="465" y="415" fill="#3b5b82" fontSize="8" fontWeight="semibold">
              OXFORD ST (OSU)
            </text>

            {/* Neighborhood District Labels */}
            <text x="370" y="225" fill="#2d4869" fontSize="10" fontWeight="bold">
              AIRPORT RESIDENTIAL
            </text>
            <text x="480" y="165" fill="#2d4869" fontSize="10" fontWeight="bold">
              EAST LEGON
            </text>
            <text x="430" y="335" fill="#2d4869" fontSize="10" fontWeight="bold">
              CANTONMENTS
            </text>
            <text x="250" y="375" fill="#2d4869" fontSize="10" fontWeight="bold">
              RIDGE / MINISTRIES
            </text>
            <text x="450" y="430" fill="#2d4869" fontSize="10" fontWeight="bold">
              OSU
            </text>
          </g>

          {/* SURGE PRICING HEATMAP ZONES (UBER DRIVER HIGH-DEMAND RADIALS) */}
          {showSurgeZones && (
            <g>
              {SURGE_ZONES.map((zone) => {
                const pt = geoToSvg(zone.lat, zone.lng);
                return (
                  <g key={zone.id} transform={`translate(${pt.x}, ${pt.y})`} className="cursor-pointer">
                    {/* Glowing outer pulse */}
                    <circle
                      cx="0"
                      cy="0"
                      r={zone.radiusMeters}
                      fill="#f59e0b"
                      fillOpacity="0.12"
                      className="animate-pulse"
                    />
                    <circle
                      cx="0"
                      cy="0"
                      r={zone.radiusMeters * 0.65}
                      fill="#ef4444"
                      fillOpacity="0.18"
                    />
                    {/* Center surge multiplier badge */}
                    <rect
                      x="-28"
                      y="-11"
                      width="56"
                      height="22"
                      rx="11"
                      fill="#b91c1c"
                      stroke="#f87171"
                      strokeWidth="1.5"
                      filter="drop-shadow(0 2px 5px rgba(0,0,0,0.6))"
                    />
                    <text
                      x="0"
                      y="4"
                      fill="#ffffff"
                      fontSize="10"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      +{zone.multiplier}x
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* REAL-TIME TRAFFIC OVERLAY */}
          {showTraffic && (
            <g opacity="0.8">
              <line x1="410" y1="178" x2="760" y2="125" stroke="#10b981" strokeWidth="2.5" strokeDasharray="6,4" />
              <line x1="394" y1="230" x2="396" y2="310" stroke="#f59e0b" strokeWidth="3" />
              <circle cx="390" cy="180" r="14" fill="#ef4444" fillOpacity="0.25" />
              <circle cx="390" cy="180" r="7" fill="#ef4444" fillOpacity="0.5" />
            </g>
          )}

          {/* ACTIVE DRIVER GPS ROUTE POLYLINE */}
          {activeRoute && activeRoute.polyline.length >= 2 && (
            <g>
              {/* Outer Neon Glow */}
              <polyline
                points={activeRoute.polyline
                  .map(([lat, lng]) => {
                    const pt = geoToSvg(lat, lng);
                    return `${pt.x},${pt.y}`;
                  })
                  .join(' ')}
                fill="none"
                stroke="#10b981"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.3"
              />
              {/* Core Active Routing Line */}
              <polyline
                points={activeRoute.polyline
                  .map(([lat, lng]) => {
                    const pt = geoToSvg(lat, lng);
                    return `${pt.x},${pt.y}`;
                  })
                  .join(' ')}
                fill="none"
                stroke="#34d399"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="10,5"
                className="animate-dash"
              />
            </g>
          )}

          {/* PICKUP PIN MARKER (GREEN) */}
          {pickupLocation && typeof pickupLocation.lat === 'number' && typeof pickupLocation.lng === 'number' && (
            <g transform={`translate(${geoToSvg(pickupLocation.lat, pickupLocation.lng).x}, ${geoToSvg(pickupLocation.lat, pickupLocation.lng).y})`}>
              <circle cx="0" cy="0" r="16" fill="#10b981" fillOpacity="0.3" className="animate-ping" />
              <circle cx="0" cy="0" r="11" fill="#059669" stroke="#ffffff" strokeWidth="2" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))" />
              <text x="0" y="3.5" fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle">
                P
              </text>
            </g>
          )}

          {/* DROPOFF DESTINATION PIN (ROSE) */}
          {dropoffLocation && typeof dropoffLocation.lat === 'number' && typeof dropoffLocation.lng === 'number' && (
            <g transform={`translate(${geoToSvg(dropoffLocation.lat, dropoffLocation.lng).x}, ${geoToSvg(dropoffLocation.lat, dropoffLocation.lng).y})`}>
              <circle cx="0" cy="0" r="16" fill="#f43f5e" fillOpacity="0.3" className="animate-ping" />
              <circle cx="0" cy="0" r="11" fill="#e11d48" stroke="#ffffff" strokeWidth="2" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))" />
              <text x="0" y="3.5" fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle">
                D
              </text>
            </g>
          )}

          {/* USER SERVICE REQUEST PINS (RIDER REQUESTS WAITING ACROSS ACCRA) */}
          {userRequestPins?.map((req) => {
            if (typeof req?.lat !== 'number' || typeof req?.lng !== 'number') return null;
            const pt = geoToSvg(req.lat, req.lng);
            return (
              <g
                key={req.id}
                transform={`translate(${pt.x}, ${pt.y})`}
                onClick={() => onSelectUserRequest && onSelectUserRequest(req)}
                className="cursor-pointer transition-transform hover:scale-125"
              >
                <circle cx="0" cy="0" r="18" fill="#38bdf8" fillOpacity="0.25" className="animate-ping" />
                <circle cx="0" cy="0" r="12" fill="#0284c7" stroke="#ffffff" strokeWidth="2" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))" />
                <text x="0" y="3.5" fill="#ffffff" fontSize="8" fontWeight="black" textAnchor="middle">
                  NV
                </text>

                {/* Mini Request Floating Tag */}
                <rect x="-24" y="-28" width="48" height="14" rx="7" fill="#0f172a" stroke="#38bdf8" strokeWidth="1" />
                <text x="0" y="-18" fill="#38bdf8" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                  GH₵{req.fareGHS}
                </text>
              </g>
            );
          })}

          {/* DRIVER VEHICLE COCKPIT MARKER (SILVER COROLLA GN 4821-24) */}
          <g transform={`translate(${driverSvgPt.x}, ${driverSvgPt.y})`}>
            {/* Outer Radar Sweeper if Online */}
            {isOnline && (
              <>
                <circle cx="0" cy="0" r="32" fill="#10b981" fillOpacity="0.12" className="animate-ping" />
                <circle cx="0" cy="0" r="22" fill="#10b981" fillOpacity="0.2" />
              </>
            )}

            {/* Vehicle Icon rotated by driver heading */}
            <g transform={`rotate(${driverHeading})`}>
              {/* Car Body Silhouette */}
              <rect
                x="-10"
                y="-18"
                width="20"
                height="36"
                rx="6"
                fill="#ffffff"
                stroke="#10b981"
                strokeWidth="2.5"
                filter="drop-shadow(0 4px 8px rgba(0,0,0,0.7))"
              />
              {/* Windshield */}
              <rect x="-7" y="-10" width="14" height="8" rx="2" fill="#1e293b" />
              {/* Headlights */}
              <circle cx="-6" cy="-17" r="1.8" fill="#fef08a" />
              <circle cx="6" cy="-17" r="1.8" fill="#fef08a" />
            </g>

            {/* Driver Plate Badge */}
            <rect
              x="-32"
              y="22"
              width="64"
              height="16"
              rx="8"
              fill="#091120"
              stroke="#10b981"
              strokeWidth="1"
            />
            <text
              x="0"
              y="33"
              fill="#a7f3d0"
              fontSize="8"
              fontWeight="bold"
              textAnchor="middle"
              fontFamily="monospace"
            >
              GN 4821-24
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
};
