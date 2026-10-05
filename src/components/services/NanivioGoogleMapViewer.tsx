import React, { useState, useEffect, useRef } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  Polyline,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  Navigation,
  Car,
  Crosshair,
  Compass,
  Layers,
  Phone,
  ArrowRight,
  Sparkles,
  Shield,
  Star,
  ExternalLink,
  Wrench,
  Building2,
  Utensils,
  Plus,
  Minus,
  Maximize2,
  Info,
  CheckCircle2,
  Globe,
  Key,
  Settings,
  AlertCircle,
  ShoppingBag,
  Store,
  ShoppingCart,
  Hotel,
  Coins,
} from 'lucide-react';
import { NanivioDriver, NearbyLivePlace, NearbyServiceType } from '../../types/drive';

interface MapCoordinate {
  lat: number;
  lng: number;
}

interface NanivioGoogleMapViewerProps {
  userLocation: MapCoordinate;
  drivers: NanivioDriver[];
  places: NearbyLivePlace[];
  selectedPlace: NearbyLivePlace | null;
  onSelectPlace: (place: NearbyLivePlace | null) => void;
  pickupLocation: { label: string; lat: number; lng: number } | null;
  destinationLocation: { label: string; lat: number; lng: number } | null;
  activeRoute: { distanceKm: number; durationMins: number; polyline: [number, number][] } | null;
  activeFilter: 'all' | 'driver' | NearbyServiceType;
  onFilterChange: (filter: 'all' | 'driver' | NearbyServiceType) => void;
  onRequestRideToPlace?: (place: NearbyLivePlace) => void;
  onCallPlace?: (place: NearbyLivePlace) => void;
}

export const NanivioGoogleMapViewer: React.FC<NanivioGoogleMapViewerProps> = ({
  userLocation,
  drivers,
  places,
  selectedPlace,
  onSelectPlace,
  pickupLocation,
  destinationLocation,
  activeRoute,
  activeFilter,
  onFilterChange,
  onRequestRideToPlace,
  onCallPlace,
}) => {
  const envApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('nanivio_gmaps_key') || '';
    } catch {
      return '';
    }
  });
  const effectiveApiKey = customApiKey || envApiKey;
  const [mapEngine, setMapEngine] = useState<'google_maps' | 'vector'>(() => {
    return effectiveApiKey ? 'google_maps' : 'vector';
  });
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [keyInputVal, setKeyInputVal] = useState<string>(effectiveApiKey);

  const [zoomLevel, setZoomLevel] = useState(13);
  const [mapCenter, setMapCenter] = useState<MapCoordinate>(userLocation);
  const [mapType, setMapType] = useState<'standard' | 'satellite' | 'terrain'>('standard');
  const [selectedDriver, setSelectedDriver] = useState<NanivioDriver | null>(null);
  const [showTraffic, setShowTraffic] = useState(true);

  const handleSaveApiKey = (keyToSave: string) => {
    const trimmed = keyToSave.trim();
    setCustomApiKey(trimmed);
    try {
      if (trimmed) {
        localStorage.setItem('nanivio_gmaps_key', trimmed);
      } else {
        localStorage.removeItem('nanivio_gmaps_key');
      }
    } catch (e) {
      console.warn(e);
    }
    setShowKeyModal(false);
    if (trimmed) {
      setMapEngine('google_maps');
    }
  };

  // Synchronize center when userLocation changes
  useEffect(() => {
    if (userLocation?.lat && userLocation?.lng) {
      setMapCenter((prev) =>
        prev?.lat === userLocation.lat && prev?.lng === userLocation.lng ? prev : userLocation
      );
    }
  }, [userLocation?.lat, userLocation?.lng]);

  // Center on selected place when chosen
  useEffect(() => {
    if (selectedPlace?.lat && selectedPlace?.lng) {
      setMapCenter((prev) =>
        prev?.lat === selectedPlace.lat && prev?.lng === selectedPlace.lng
          ? prev
          : { lat: selectedPlace.lat, lng: selectedPlace.lng }
      );
    }
  }, [selectedPlace?.lat, selectedPlace?.lng]);

  // Center on destination if specified
  useEffect(() => {
    if (destinationLocation?.lat && destinationLocation?.lng) {
      setMapCenter((prev) =>
        prev?.lat === destinationLocation.lat && prev?.lng === destinationLocation.lng
          ? prev
          : { lat: destinationLocation.lat, lng: destinationLocation.lng }
      );
    }
  }, [destinationLocation?.lat, destinationLocation?.lng]);

  // SVG Coordinate Conversion Helpers for interactive viewport
  // Map center bounds for Accra approx lat 5.50 to 5.70, lng -0.28 to -0.05
  const mapWidth = 800;
  const mapHeight = 520;
  const centerLat = mapCenter?.lat ?? 5.6052;
  const centerLng = mapCenter?.lng ?? -0.1668;
  const scale = 3200 * Math.pow(1.2, zoomLevel - 13);

  const geoToSvg = (lat?: number, lng?: number) => {
    const safeLat = typeof lat === 'number' && !isNaN(lat) ? lat : centerLat;
    const safeLng = typeof lng === 'number' && !isNaN(lng) ? lng : centerLng;
    const x = mapWidth / 2 + (safeLng - centerLng) * scale;
    const y = mapHeight / 2 - (safeLat - centerLat) * scale * 1.05;
    return { x, y };
  };

  const filteredPlaces = places.filter((p) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'driver') return false;
    return p.type === activeFilter;
  });

  const showDriversOnMap = activeFilter === 'all' || activeFilter === 'driver';

  const resetToUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setMapCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setZoomLevel(14);
        },
        () => {
          setMapCenter(userLocation);
          setZoomLevel(14);
        }
      );
    } else {
      setMapCenter(userLocation);
      setZoomLevel(14);
    }
  };

  const getPlaceIcon = (type: string) => {
    switch (type) {
      case 'mechanic':
        return <Wrench className="w-3.5 h-3.5 text-amber-300" />;
      case 'hospital':
        return <Shield className="w-3.5 h-3.5 text-red-300" />;
      case 'restaurant':
        return <Utensils className="w-3.5 h-3.5 text-emerald-300" />;
      case 'business':
        return <Building2 className="w-3.5 h-3.5 text-cyan-300" />;
      case 'mall':
        return <ShoppingBag className="w-3.5 h-3.5 text-purple-300" />;
      case 'shop':
        return <Store className="w-3.5 h-3.5 text-sky-300" />;
      case 'supermarket':
        return <ShoppingCart className="w-3.5 h-3.5 text-lime-300" />;
      case 'hotel':
        return <Hotel className="w-3.5 h-3.5 text-orange-300" />;
      case 'bank_momo':
        return <Coins className="w-3.5 h-3.5 text-teal-300" />;
      case 'beauty':
        return <Sparkles className="w-3.5 h-3.5 text-pink-300" />;
      case 'autorent':
        return <Key className="w-3.5 h-3.5 text-violet-300" />;
      default:
        return <MapPin className="w-3.5 h-3.5 text-blue-300" />;
    }
  };

  const getPlaceBadgeBg = (type: string) => {
    switch (type) {
      case 'mechanic':
        return 'bg-amber-500/20 border-amber-500/50 text-amber-300';
      case 'hospital':
        return 'bg-red-500/20 border-red-500/50 text-red-300';
      case 'restaurant':
        return 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300';
      case 'business':
        return 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300';
      case 'mall':
        return 'bg-purple-500/20 border-purple-500/50 text-purple-300';
      case 'shop':
        return 'bg-sky-500/20 border-sky-500/50 text-sky-300';
      case 'supermarket':
        return 'bg-lime-500/20 border-lime-500/50 text-lime-300';
      case 'hotel':
        return 'bg-orange-500/20 border-orange-500/50 text-orange-300';
      case 'bank_momo':
        return 'bg-teal-500/20 border-teal-500/50 text-teal-300';
      case 'beauty':
        return 'bg-pink-500/20 border-pink-500/50 text-pink-300';
      case 'autorent':
        return 'bg-violet-500/20 border-violet-500/50 text-violet-300';
      default:
        return 'bg-blue-500/20 border-blue-500/50 text-blue-300';
    }
  };

  return (
    <div className="relative w-full rounded-3xl overflow-hidden border border-slate-800 bg-[#070e1b] shadow-2xl flex flex-col">
      {/* Top Map Control Bar */}
      <div className="p-3 bg-[#0a1222]/90 backdrop-blur-md border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 z-20">
        {/* Layer Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none touch-pan-x">
          <button
            onClick={() => onFilterChange('all')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            All Pins
          </button>
          <button
            onClick={() => onFilterChange('driver')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              activeFilter === 'driver'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <Car className="w-3.5 h-3.5" />
            <span>Active Drivers ({drivers.length})</span>
          </button>
          <button
            onClick={() => onFilterChange('restaurant')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              activeFilter === 'restaurant'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>Restaurants</span>
          </button>
          <button
            onClick={() => onFilterChange('mechanic')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              activeFilter === 'mechanic'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Mechanics</span>
          </button>
          <button
            onClick={() => onFilterChange('hospital')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              activeFilter === 'hospital'
                ? 'bg-red-500 text-white font-bold shadow-md shadow-red-500/20'
                : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Hospitals</span>
          </button>
          <button
            onClick={() => onFilterChange('mall')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              activeFilter === 'mall'
                ? 'bg-purple-500 text-white font-bold shadow-md shadow-purple-500/20'
                : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Malls</span>
          </button>
          <button
            onClick={() => onFilterChange('shop')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              activeFilter === 'shop'
                ? 'bg-sky-500 text-slate-950 font-bold shadow-md shadow-sky-500/20'
                : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Shops</span>
          </button>
          <button
            onClick={() => onFilterChange('supermarket')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              activeFilter === 'supermarket'
                ? 'bg-lime-500 text-slate-950 font-bold shadow-md shadow-lime-500/20'
                : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Supermarkets</span>
          </button>
          <button
            onClick={() => onFilterChange('autorent')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              activeFilter === 'autorent'
                ? 'bg-violet-500 text-white font-bold shadow-md shadow-violet-500/20'
                : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Auto Rent</span>
          </button>
          <button
            onClick={() => onFilterChange('business')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              activeFilter === 'business'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Businesses</span>
          </button>
        </div>

        {/* Engine Switcher + Map Type & Live Status */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Map Engine Toggle */}
          <div className="flex items-center gap-1 bg-slate-950/90 p-0.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setMapEngine('google_maps')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                mapEngine === 'google_maps'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Google Maps SDK</span>
            </button>
            <button
              onClick={() => setMapEngine('vector')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                mapEngine === 'vector'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Accra Vector</span>
            </button>
          </div>

          {/* Key status & config button */}
          <button
            onClick={() => {
              setKeyInputVal(effectiveApiKey);
              setShowKeyModal(true);
            }}
            className={`px-2 py-1 text-[11px] font-semibold rounded-xl border transition-all cursor-pointer flex items-center gap-1 ${
              effectiveApiKey
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
            }`}
            title="Configure Google Maps API Key"
          >
            <Key className="w-3 h-3" />
            <span>{effectiveApiKey ? 'Key Active' : 'Enter Key'}</span>
          </button>

          <div className="flex items-center gap-1 bg-slate-950/80 p-0.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setMapType('standard')}
              className={`px-2 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                mapType === 'standard' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Default
            </button>
            <button
              onClick={() => setMapType('satellite')}
              className={`px-2 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                mapType === 'satellite' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Satellite
            </button>
          </div>

          <button
            onClick={() => setShowTraffic(!showTraffic)}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-xl border transition-all cursor-pointer flex items-center gap-1 ${
              showTraffic
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-900/80 text-slate-400 border-slate-800'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${showTraffic ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            <span>Traffic</span>
          </button>
        </div>
      </div>

      {/* Main Map Viewport */}
      <div className="relative w-full h-[420px] sm:h-[480px] bg-[#070e1b] overflow-hidden select-none">
        {mapEngine === 'google_maps' && effectiveApiKey ? (
          <div className="w-full h-full relative">
            <APIProvider apiKey={effectiveApiKey} libraries={['places', 'marker', 'routes']}>
              <Map
                mapId={undefined}
                defaultCenter={{ lat: userLocation.lat, lng: userLocation.lng }}
                center={{ lat: mapCenter.lat, lng: mapCenter.lng }}
                zoom={zoomLevel}
                onCameraChanged={(ev) => {
                  setMapCenter(ev.detail.center);
                  setZoomLevel(ev.detail.zoom);
                }}
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                mapTypeId={mapType === 'satellite' ? 'hybrid' : 'roadmap'}
                style={{ width: '100%', height: '100%' }}
                gestureHandling="greedy"
                disableDefaultUI={false}
              >
                {/* Pickup Marker */}
                {pickupLocation && (
                  <AdvancedMarker
                    position={{ lat: pickupLocation.lat, lng: pickupLocation.lng }}
                    title={`Pickup: ${pickupLocation.label}`}
                  >
                    <div className="flex flex-col items-center">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-extrabold text-[10px] shadow-lg whitespace-nowrap mb-1">
                        Pickup
                      </span>
                      <div className="w-7 h-7 rounded-full bg-emerald-500 border-2 border-white shadow-xl flex items-center justify-center text-slate-950">
                        <MapPin className="w-4 h-4 text-slate-950" />
                      </div>
                    </div>
                  </AdvancedMarker>
                )}

                {/* Destination Marker */}
                {destinationLocation && (
                  <AdvancedMarker
                    position={{ lat: destinationLocation.lat, lng: destinationLocation.lng }}
                    title={`Destination: ${destinationLocation.label}`}
                  >
                    <div className="flex flex-col items-center">
                      <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white font-extrabold text-[10px] shadow-lg whitespace-nowrap mb-1">
                        Destination
                      </span>
                      <div className="w-7 h-7 rounded-full bg-rose-500 border-2 border-white shadow-xl flex items-center justify-center text-white">
                        <Navigation className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  </AdvancedMarker>
                )}

                {/* Live Drivers */}
                {showDriversOnMap &&
                  drivers.map((driver) => (
                    <AdvancedMarker
                      key={driver.id}
                      position={{ lat: driver.lat, lng: driver.lng }}
                      title={`${driver.name} · ${driver.vehicleMake} ${driver.vehicleModel}`}
                      onClick={() => setSelectedDriver(driver)}
                    >
                      <div className="flex flex-col items-center group cursor-pointer transition-transform hover:scale-110">
                        <span className="px-1.5 py-0.5 rounded bg-slate-950/90 border border-emerald-500/50 text-[10px] text-emerald-300 font-mono font-bold whitespace-nowrap mb-0.5 shadow-md">
                          {driver.name.split(' ')[0]} ★{driver.rating}
                        </span>
                        <div className="w-7 h-7 rounded-full bg-emerald-500 border-2 border-white shadow-lg flex items-center justify-center text-slate-950">
                          <Car className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </AdvancedMarker>
                  ))}

                {/* Driver InfoWindow */}
                {selectedDriver && (
                  <InfoWindow
                    position={{ lat: selectedDriver.lat, lng: selectedDriver.lng }}
                    onCloseClick={() => setSelectedDriver(null)}
                  >
                    <div className="p-2 text-slate-900 max-w-[220px]">
                      <div className="flex items-center gap-2 mb-1.5">
                        {selectedDriver.avatar ? (
                          <img
                            src={selectedDriver.avatar}
                            alt={selectedDriver.name}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-700">
                            {selectedDriver.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-xs">{selectedDriver.name}</div>
                          <div className="text-[10px] text-emerald-700 font-mono">NV {selectedDriver.nvId}</div>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-700 font-medium mb-1">
                        {selectedDriver.vehicleMake} {selectedDriver.vehicleModel} · {selectedDriver.plateNumber}
                      </div>
                      <div className="text-[10px] text-slate-500 mb-2">
                        Languages: {selectedDriver.spokenLanguages.join(', ')}
                      </div>
                      <div className="text-[11px] font-bold text-emerald-600">
                        ★ {selectedDriver.rating} ({selectedDriver.tripsCompleted} trips)
                      </div>
                    </div>
                  </InfoWindow>
                )}

                {/* Places */}
                {filteredPlaces.map((place) => (
                  <AdvancedMarker
                    key={place.id}
                    position={{ lat: place.lat, lng: place.lng }}
                    title={place.name}
                    onClick={() => onSelectPlace(place)}
                  >
                    <div className="p-1.5 rounded-full bg-slate-900 border border-slate-700 shadow-md flex items-center justify-center cursor-pointer hover:scale-110 transition-transform">
                      {getPlaceIcon(place.type)}
                    </div>
                  </AdvancedMarker>
                ))}

                {/* Place InfoWindow */}
                {selectedPlace && (
                  <InfoWindow
                    position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }}
                    onCloseClick={() => onSelectPlace(null)}
                  >
                    <div className="p-2 text-slate-900 max-w-[240px]">
                      <div className="font-bold text-xs mb-0.5">{selectedPlace.name}</div>
                      <div className="text-[10px] text-slate-600 mb-1">{selectedPlace.address}</div>
                      <div className="flex items-center gap-1 text-[11px] text-amber-600 font-bold mb-2">
                        ★ {selectedPlace.rating} ({selectedPlace.reviewCount} reviews)
                      </div>
                      <div className="flex items-center gap-1">
                        {onRequestRideToPlace && (
                          <button
                            onClick={() => onRequestRideToPlace(selectedPlace)}
                            className="flex-1 py-1 rounded bg-emerald-600 text-white text-[10px] font-bold"
                          >
                            Drive Here
                          </button>
                        )}
                        {onCallPlace && (
                          <button
                            onClick={() => onCallPlace(selectedPlace)}
                            className="px-2 py-1 rounded bg-slate-800 text-white text-[10px] font-bold"
                          >
                            Call
                          </button>
                        )}
                      </div>
                    </div>
                  </InfoWindow>
                )}

                {/* Polyline Route */}
                {activeRoute && activeRoute.polyline && activeRoute.polyline.length > 0 && (
                  <Polyline
                    path={activeRoute.polyline.map(([lat, lng]) => ({ lat, lng }))}
                    strokeColor="#10b981"
                    strokeWeight={5}
                    strokeOpacity={0.85}
                  />
                )}
              </Map>
            </APIProvider>
          </div>
        ) : mapEngine === 'google_maps' && !effectiveApiKey ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-slate-950/95 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-xl">
              <Globe className="w-6 h-6" />
            </div>
            <div className="max-w-md space-y-1">
              <h3 className="text-sm font-extrabold text-white">Google Maps Platform SDK Ready</h3>
              <p className="text-xs text-slate-300">
                To render live Google Maps vector tiles, satellite imagery, and live routing, enter your Google Maps API Key with a production Google Maps API key.
              </p>
            </div>
            <div className="w-full max-w-xs flex items-center gap-2">
              <input
                type="password"
                value={keyInputVal}
                onChange={(e) => setKeyInputVal(e.target.value)}
                placeholder="Paste Google Maps API Key..."
                className="flex-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={() => handleSaveApiKey(keyInputVal)}
                className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer shadow-md transition-all whitespace-nowrap"
              >
                Activate
              </button>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button
                onClick={() => setMapEngine('vector')}
                className="text-emerald-400 hover:underline font-semibold cursor-pointer"
              >
                ← Use Built-in Accra Vector Engine
              </button>
              <span className="text-slate-600">·</span>
            </div>
          </div>
        ) : (
          /* SVG Interactive Vector Map Canvas */
          <svg
            viewBox={`0 0 ${mapWidth} ${mapHeight}`}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            style={{
              background:
                mapType === 'satellite'
                  ? 'radial-gradient(ellipse at center, #0f1c2e 0%, #060b14 100%)'
                  : 'radial-gradient(ellipse at center, #0a1322 0%, #050a12 100%)',
            }}
          >
          {/* Background Grid Roads & Neighborhoods of Greater Accra */}
          <g opacity={mapType === 'satellite' ? 0.3 : 0.6}>
            {/* Coastline / Gulf of Guinea (South of Accra) */}
            <path
              d="M -100,500 Q 200,470 450,490 T 900,480 L 900,550 L -100,550 Z"
              fill="#06182c"
              stroke="#0a2a4c"
              strokeWidth="2"
            />

            {/* Ocean Waves Accent */}
            <text x="50" y="515" fill="#1b4570" fontSize="11" fontWeight="bold" letterSpacing="2">
              GULF OF GUINEA · ATLANTIC OCEAN
            </text>

            {/* Primary Expressways & Corridors */}
            {/* Tema Motorway (East-West) */}
            <line x1="380" y1="180" x2="850" y2="120" stroke="#1f3654" strokeWidth="6" strokeLinecap="round" />
            <line x1="380" y1="180" x2="850" y2="120" stroke="#2a4a75" strokeWidth="3" strokeLinecap="round" />
            <text x="560" y="145" fill="#4d6f99" fontSize="9" fontWeight="bold" transform="rotate(-5, 560, 145)">
              ACCRA - TEMA MOTORWAY (N1)
            </text>

            {/* George Walker Bush Highway (N1 West) */}
            <line x1="-50" y1="210" x2="380" y2="180" stroke="#1f3654" strokeWidth="6" strokeLinecap="round" />
            <line x1="-50" y1="210" x2="380" y2="180" stroke="#2a4a75" strokeWidth="3" strokeLinecap="round" />
            <text x="140" y="190" fill="#4d6f99" fontSize="9" fontWeight="bold">
              GEORGE BUSH HIGHWAY (N1)
            </text>

            {/* Liberation Road (Airport Corridor to Legon) */}
            <line x1="380" y1="420" x2="390" y2="90" stroke="#1f3654" strokeWidth="5" strokeLinecap="round" />
            <line x1="380" y1="420" x2="390" y2="90" stroke="#315585" strokeWidth="2.5" strokeLinecap="round" />
            <text x="395" y="270" fill="#4d6f99" fontSize="9" fontWeight="bold" transform="rotate(85, 395, 270)">
              LIBERATION ROAD
            </text>

            {/* Ring Road (Central Beltway) */}
            <path
              d="M 180,390 Q 320,330 460,360 T 600,420"
              fill="none"
              stroke="#1a3250"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <text x="300" y="340" fill="#3b5b82" fontSize="9" fontWeight="semibold">
              RING ROAD CENTRAL
            </text>

            {/* Oxford Street Osu Grid */}
            <line x1="430" y1="360" x2="450" y2="450" stroke="#1a2f48" strokeWidth="3" />
            <text x="455" y="415" fill="#3b5b82" fontSize="8" fontWeight="semibold">
              OXFORD ST (OSU)
            </text>

            {/* Secondary Arterials */}
            <line x1="320" y1="260" x2="520" y2="280" stroke="#152438" strokeWidth="2" />
            <line x1="280" y1="180" x2="300" y2="380" stroke="#152438" strokeWidth="2" />
            <line x1="450" y1="150" x2="520" y2="240" stroke="#152438" strokeWidth="2" />
            <line x1="160" y1="280" x2="360" y2="460" stroke="#152438" strokeWidth="2" />
            <line x1="500" y1="220" x2="720" y2="340" stroke="#152438" strokeWidth="2" />

            {/* Neighborhood Labels */}
            <text x="360" y="225" fill="#2d4869" fontSize="10" fontWeight="bold">
              AIRPORT RESIDENTIAL
            </text>
            <text x="470" y="165" fill="#2d4869" fontSize="10" fontWeight="bold">
              EAST LEGON
            </text>
            <text x="420" y="335" fill="#2d4869" fontSize="10" fontWeight="bold">
              CANTONMENTS
            </text>
            <text x="240" y="375" fill="#2d4869" fontSize="10" fontWeight="bold">
              RIDGE / MINISTRIES
            </text>
            <text x="440" y="430" fill="#2d4869" fontSize="10" fontWeight="bold">
              OSU
            </text>
            <text x="730" y="150" fill="#2d4869" fontSize="10" fontWeight="bold">
              TEMA HARBOR ZONE
            </text>
          </g>

          {/* Traffic Overlay if enabled */}
          {showTraffic && (
            <g opacity="0.75">
              {/* Green Smooth Flow */}
              <line x1="400" y1="178" x2="750" y2="125" stroke="#10b981" strokeWidth="2.5" strokeDasharray="6,4" />
              {/* Yellow Moderate Traffic on Liberation Rd */}
              <line x1="384" y1="230" x2="386" y2="310" stroke="#f59e0b" strokeWidth="3" />
              {/* Red Heavy Congestion near Tetteh Quarshie Interchange */}
              <circle cx="380" cy="180" r="14" fill="#ef4444" fillOpacity="0.2" />
              <circle cx="380" cy="180" r="8" fill="#ef4444" fillOpacity="0.4" />
              <line x1="375" y1="175" x2="385" y2="185" stroke="#ef4444" strokeWidth="3.5" />
            </g>
          )}

          {/* Active Route Polyline if calculated */}
          {activeRoute && activeRoute.polyline.length >= 2 && (
            <g>
              {/* Glowing Outline */}
              <polyline
                points={activeRoute.polyline
                  .map(([lat, lng]) => {
                    const pt = geoToSvg(lat, lng);
                    return `${pt.x},${pt.y}`;
                  })
                  .join(' ')}
                fill="none"
                stroke="#10b981"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.3"
              />
              {/* Main Routing Line */}
              <polyline
                points={activeRoute.polyline
                  .map(([lat, lng]) => {
                    const pt = geoToSvg(lat, lng);
                    return `${pt.x},${pt.y}`;
                  })
                  .join(' ')}
                fill="none"
                stroke="#34d399"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="8,4"
              />
            </g>
          )}

          {/* Places Pins (Hospitals, Mechanics, Restaurants, Businesses) */}
          {filteredPlaces.map((place) => {
            const pt = geoToSvg(place.lat, place.lng);
            const isSelected = selectedPlace?.id === place.id;

            return (
              <g
                key={place.id}
                transform={`translate(${pt.x}, ${pt.y})`}
                onClick={() => onSelectPlace(place)}
                className="cursor-pointer transition-transform hover:scale-125"
              >
                {isSelected && (
                  <circle cx="0" cy="0" r="22" fill="#10b981" fillOpacity="0.25" className="animate-ping" />
                )}
                <circle
                  cx="0"
                  cy="0"
                  r={isSelected ? '14' : '11'}
                  fill={
                    place.type === 'mechanic'
                      ? '#d97706'
                      : place.type === 'hospital'
                      ? '#dc2626'
                      : place.type === 'restaurant'
                      ? '#059669'
                      : place.type === 'business'
                      ? '#0891b2'
                      : place.type === 'mall'
                      ? '#9333ea'
                      : place.type === 'shop'
                      ? '#0284c7'
                      : place.type === 'supermarket'
                      ? '#65a30d'
                      : place.type === 'hotel'
                      ? '#ea580c'
                      : place.type === 'bank_momo'
                      ? '#0d9488'
                      : place.type === 'beauty'
                      ? '#db2777'
                      : place.type === 'autorent'
                      ? '#7c3aed'
                      : '#2563eb'
                  }
                  stroke="#ffffff"
                  strokeWidth="2"
                  filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"
                />
                {/* Center Symbol */}
                <text x="0" y="3.5" fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle">
                  {place.type === 'mechanic'
                    ? 'W'
                    : place.type === 'hospital'
                    ? 'H'
                    : place.type === 'restaurant'
                    ? 'R'
                    : place.type === 'business'
                    ? 'B'
                    : place.type === 'mall'
                    ? 'M'
                    : place.type === 'shop'
                    ? 'S'
                    : place.type === 'supermarket'
                    ? 'G'
                    : place.type === 'hotel'
                    ? 'H'
                    : place.type === 'bank_momo'
                    ? '$'
                    : place.type === 'beauty'
                    ? '✦'
                    : place.type === 'autorent'
                    ? 'C'
                    : 'P'}
                </text>
              </g>
            );
          })}

          {/* Active Nanivio Drivers on Map */}
          {showDriversOnMap &&
            drivers?.map((drv: any) => {
              const lat = drv?.lat ?? drv?.location?.lat;
              const lng = drv?.lng ?? drv?.location?.lng;
              if (typeof lat !== 'number' || typeof lng !== 'number') return null;
              const pt = geoToSvg(lat, lng);
              const isSelected = selectedDriver?.id === drv.id;

              return (
                <g
                  key={drv.id}
                  transform={`translate(${pt.x}, ${pt.y})`}
                  onClick={() => setSelectedDriver(drv)}
                  className="cursor-pointer transition-transform hover:scale-125"
                >
                  {/* Subtle Pulse */}
                  <circle cx="0" cy="0" r="16" fill="#10b981" fillOpacity="0.15" />
                  {/* Car Base Marker */}
                  <rect
                    x="-10"
                    y="-7"
                    width="20"
                    height="14"
                    rx="4"
                    fill={isSelected ? '#10b981' : '#0f172a'}
                    stroke={isSelected ? '#34d399' : '#38bdf8'}
                    strokeWidth="1.8"
                    filter="drop-shadow(0 2px 5px rgba(0,0,0,0.6))"
                  />
                  {/* Windshield & Headlights */}
                  <rect x="-7" y="-5" width="4" height="10" rx="1.5" fill="#38bdf8" />
                  <circle cx="8" cy="-4" r="1.2" fill="#facc15" />
                  <circle cx="8" cy="4" r="1.2" fill="#facc15" />
                </g>
              );
            })}

          {/* User / Pickup Pin */}
          {pickupLocation && typeof pickupLocation.lat === 'number' && typeof pickupLocation.lng === 'number' && (
            (() => {
              const pt = geoToSvg(pickupLocation.lat, pickupLocation.lng);
              return (
                <g transform={`translate(${pt.x}, ${pt.y})`} className="cursor-pointer">
                  <circle cx="0" cy="0" r="18" fill="#10b981" fillOpacity="0.25" className="animate-pulse" />
                  <circle cx="0" cy="0" r="9" fill="#10b981" stroke="#ffffff" strokeWidth="2.5" />
                  <circle cx="0" cy="0" r="3.5" fill="#ffffff" />
                </g>
              );
            })()
          )}

          {/* Destination Pin */}
          {destinationLocation && typeof destinationLocation.lat === 'number' && typeof destinationLocation.lng === 'number' && (
            (() => {
              const pt = geoToSvg(destinationLocation.lat, destinationLocation.lng);
              return (
                <g transform={`translate(${pt.x}, ${pt.y})`}>
                  <circle cx="0" cy="0" r="20" fill="#f43f5e" fillOpacity="0.25" className="animate-pulse" />
                  <path
                    d="M 0,-16 C -6,-16 -10,-10 -10,-4 C -10,4 0,14 0,14 C 0,14 10,4 10,-4 C 10,-10 6,-16 0,-16 Z"
                    fill="#f43f5e"
                    stroke="#ffffff"
                    strokeWidth="2"
                    filter="drop-shadow(0 3px 6px rgba(0,0,0,0.6))"
                  />
                  <circle cx="0" cy="-6" r="3.5" fill="#ffffff" />
                </g>
              );
            })()
          )}
        </svg>
        )}

        {/* Live Map Watermark & Info */}
        <div className="absolute top-3 left-3 pointer-events-none z-10 flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-800 text-[11px] font-bold text-white flex items-center gap-1.5 shadow-lg">
            <Compass className="w-3.5 h-3.5 text-emerald-400 animate-spin" style={{ animationDuration: '18s' }} />
            <span>Google Maps Live Services · Accra Territory</span>
          </div>
          {activeRoute && (
            <div className="px-2.5 py-1 rounded-xl bg-emerald-950/80 backdrop-blur-md border border-emerald-500/40 text-[11px] font-bold text-emerald-300 shadow-lg">
              {activeRoute.distanceKm} km · ~{activeRoute.durationMins} mins
            </div>
          )}
        </div>

        {/* Map View Controls (Zoom In, Zoom Out, Recenter GPS) */}
        <div className="absolute right-3 bottom-4 flex flex-col gap-2 z-10">
          <button
            onClick={() => setZoomLevel((z) => Math.min(18, z + 1))}
            title="Zoom In"
            className="w-9 h-9 rounded-xl bg-slate-950/90 hover:bg-slate-900 border border-slate-800 text-white flex items-center justify-center shadow-lg transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoomLevel((z) => Math.max(9, z - 1))}
            title="Zoom Out"
            className="w-9 h-9 rounded-xl bg-slate-950/90 hover:bg-slate-900 border border-slate-800 text-white flex items-center justify-center shadow-lg transition-all cursor-pointer"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={resetToUserLocation}
            title="My GPS Location"
            className="w-9 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-lg shadow-emerald-500/20 font-bold transition-all cursor-pointer"
          >
            <Crosshair className="w-4 h-4" />
          </button>
        </div>

        {/* Selected Place Overlay Card */}
        {selectedPlace && (
          <div className="absolute bottom-3 left-3 right-16 sm:right-auto sm:max-w-sm p-3.5 rounded-2xl bg-slate-950/95 backdrop-blur-md border border-slate-700 shadow-2xl z-20 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${getPlaceBadgeBg(selectedPlace.type)}`}>
                    {selectedPlace.type}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">NV {selectedPlace.nvId}</span>
                </div>
                <h4 className="text-sm font-bold text-white mt-1">{selectedPlace.name}</h4>
                <p className="text-[11px] text-slate-300 line-clamp-1">{selectedPlace.address}</p>
              </div>
              <button
                onClick={() => onSelectPlace(null)}
                className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded-md hover:bg-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
              <div className="flex items-center gap-1 text-amber-400 font-bold text-[11px]">
                <Star className="w-3.5 h-3.5 fill-amber-400" />
                <span>{selectedPlace.rating}</span>
                <span className="text-slate-500 font-normal">({selectedPlace.reviewCount})</span>
              </div>
              <span className="text-[11px] text-emerald-400 font-medium font-mono">
                {selectedPlace.distanceKm} km away
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              {onRequestRideToPlace && (
                <button
                  onClick={() => onRequestRideToPlace(selectedPlace)}
                  className="flex-1 py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer shadow-md shadow-emerald-500/20"
                >
                  <Car className="w-3.5 h-3.5" />
                  <span>Ride Here</span>
                </button>
              )}
              {onCallPlace && (
                <button
                  onClick={() => onCallPlace(selectedPlace)}
                  className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                  title="Call via Nanivio Langpretation"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Call</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Selected Driver Overlay Card */}
        {selectedDriver && (
          <div className="absolute top-14 right-3 max-w-xs p-3.5 rounded-2xl bg-slate-950/95 backdrop-blur-md border border-emerald-500/40 shadow-2xl z-20 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <img
                  src={selectedDriver.avatar}
                  alt={selectedDriver.name}
                  className="w-10 h-10 rounded-xl object-cover border border-slate-700"
                />
                <div>
                  <h4 className="text-xs font-bold text-white">{selectedDriver.name}</h4>
                  <div className="flex items-center gap-1 text-[11px] text-amber-400">
                    <Star className="w-3 h-3 fill-amber-400" />
                    <span>{selectedDriver.rating}</span>
                    <span className="text-slate-400">({selectedDriver.tripsCompleted} trips)</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedDriver(null)}
                className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded-md hover:bg-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] space-y-1">
              <div className="flex items-center justify-between text-slate-300">
                <span>Vehicle:</span>
                <span className="font-semibold text-white">
                  {selectedDriver.vehicleMake || (selectedDriver as any).vehicle?.make || 'Toyota'}{' '}
                  {selectedDriver.vehicleModel || (selectedDriver as any).vehicle?.model || 'Corolla'} (
                  {selectedDriver.vehicleColor || (selectedDriver as any).vehicle?.color || 'Silver Metallic'})
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Plate:</span>
                <span className="font-mono font-bold text-emerald-400">
                  {selectedDriver.plateNumber || (selectedDriver as any).vehicle?.plateNumber || 'GN 4821-24'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Languages:</span>
                <span className="text-emerald-300 font-semibold">
                  {(selectedDriver.spokenLanguages || ['en']).join(', ')}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                Active on Nanivio Drive
              </span>
              <span className="font-mono text-slate-400">
                {(selectedDriver as any).distanceKm ? `${(selectedDriver as any).distanceKm} km away` : 'Nearby'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Map Info Strip */}
      <div className="px-4 py-2 bg-slate-950 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-white">{drivers.length} Drivers Live</span>
          </span>
          <span>•</span>
          <span>{places.length} Verified Nearby Services</span>
          <span>•</span>
          <span>24/7 Langpretation Enabled</span>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-500 font-mono">
            GPS: {(mapCenter?.lat ?? 5.6052).toFixed(4)}, {(mapCenter?.lng ?? -0.1668).toFixed(4)}
          </span>
        </div>
      </div>

      {/* Key Configuration Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full p-5 rounded-2xl bg-[#0b1326] border border-slate-700 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <Key className="w-4 h-4" />
                <span>Google Maps API Key Configuration</span>
              </div>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-slate-400 hover:text-white text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-300">
              Configure your Google Maps Platform key for Maps JavaScript API, Advanced Markers, and Routes.
            </p>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400">Google Maps Platform Key</label>
              <input
                type="password"
                value={keyInputVal}
                onChange={(e) => setKeyInputVal(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                onClick={() => handleSaveApiKey('')}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs font-semibold cursor-pointer border border-slate-800"
              >
                Clear Key
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowKeyModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveApiKey(keyInputVal)}
                  className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer shadow-md"
                >
                  Save &amp; Activate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
