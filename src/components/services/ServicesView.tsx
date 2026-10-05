import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Star,
  ShieldCheck,
  ShieldAlert,
  Phone,
  Video,
  Search,
  Filter,
  Globe,
  Coins,
  Radio,
  Clock,
  Car,
  MapPin,
  Key,
  Navigation,
  Building2,
  Wrench,
  Shield,
  Utensils,
  Compass,
  LayoutGrid,
  ArrowLeft,
  ShoppingBag,
  Store,
  ShoppingCart,
  Hotel,
  Tv,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { LiveAdsBanner } from './LiveAdsBanner';
import { LiveServices4KVideoHub } from './LiveServices4KVideoHub';
import { ExpertProfileModal } from './ExpertProfileModal';
import { ExpertProvider, SUPPORTED_LANGUAGES } from '../../types';
import { NanivioDriver, NearbyLivePlace, NearbyServiceType, RideServiceTier } from '../../types/drive';
import { NEARBY_PLACES, POPULAR_LOCATIONS } from '../../data/driveMockData';
import { NanivioGoogleMapViewer } from './NanivioGoogleMapViewer';
import { NanivioRideHailingPanel } from './NanivioRideHailingPanel';
import { UbaCarRentingPanel } from './UbaCarRentingPanel';
import { NearbyLiveServicesPanel } from './NearbyLiveServicesPanel';
import { NanivioDrivePartnerApp } from './NanivioDrivePartnerApp';
import { ServiceCategoriesHub, ServiceCategoryDefinition, SERVICE_CATEGORIES } from './ServiceCategoriesHub';
import { LocationSelectorBar } from './LocationSelectorBar';
import { locationService, UserLocationState } from '../../services/locationService';
import { getPlacesForLocation } from '../../data/globalServicesData';

export const ServicesView: React.FC = () => {
  const {
    experts,
    selectedExpert,
    setSelectedExpert,
    start1on1Call,
    adminFeatures,
    updateAdminFeature,
    isAdmin,
    myLanguage,
    currentUser,
    authUser,
  } = useNanivio();

  const isDriveEnabled = adminFeatures?.nanivioDriveEnabled !== false;

  const isDriver = currentUser?.role === 'driver' || authUser?.role === 'DRIVER';

  // Top Section Mode - Defaults to 'driver_portal' for driver accounts, or 'live_services_4k' for normal users
  const [activeMainMode, setActiveMainMode] = useState<'live_services_4k' | 'categories' | 'map_services' | 'driver_portal' | 'experts'>(() =>
    isDriver ? 'driver_portal' : 'live_services_4k'
  );

  // Automatically switch to driver_portal when a driver logs in
  useEffect(() => {
    if (isDriver) {
      setActiveMainMode('driver_portal');
    }
  }, [isDriver]);

  // Sub-tab inside Map Services
  const [mapSubTab, setMapSubTab] = useState<'rides' | 'rentals' | 'directory'>('rides');

  // Dynamic Location State
  const [currentLocation, setCurrentLocation] = useState<UserLocationState>(() =>
    locationService.getLocation()
  );

  // Map and Location States
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({
    lat: currentLocation.lat || 5.6052,
    lng: currentLocation.lng || -0.1668,
  });
  const [drivers, setDrivers] = useState<NanivioDriver[]>([]);
  const [places, setPlaces] = useState<NearbyLivePlace[]>(() =>
    getPlacesForLocation(currentLocation.city, currentLocation.country)
  );

  const handleLocationChange = useCallback((loc: UserLocationState) => {
    setCurrentLocation((prev) =>
      prev.city === loc.city && prev.country === loc.country && prev.lat === loc.lat && prev.lng === loc.lng
        ? prev
        : loc
    );
    setPlaces(getPlacesForLocation(loc.city, loc.country));
    setUserLocation((prev) =>
      prev.lat === loc.lat && prev.lng === loc.lng ? prev : { lat: loc.lat, lng: loc.lng }
    );
  }, []);

  // Subscribe to real-time location changes
  useEffect(() => {
    const unsub = locationService.subscribe((loc) => {
      handleLocationChange(loc);
      setPickupLocation((prev) =>
        prev.lat === loc.lat && prev.lng === loc.lng
          ? prev
          : {
              label: `${loc.city} Central Metropolitan Area`,
              lat: loc.lat,
              lng: loc.lng,
            }
      );
    });
    return () => unsub();
  }, [handleLocationChange]);

  const [selectedPlace, setSelectedPlace] = useState<NearbyLivePlace | null>(null);
  const [pickupLocation, setPickupLocation] = useState<{ label: string; lat: number; lng: number }>({
    label: `${currentLocation.city} Central Metropolitan Area`,
    lat: currentLocation.lat || 5.6052,
    lng: currentLocation.lng || -0.1668,
  });
  const [destinationLocation, setDestinationLocation] = useState<{ label: string; lat: number; lng: number } | null>(null);
  const [selectedTier, setSelectedTier] = useState<RideServiceTier>('standard');
  const [activeFilter, setActiveFilter] = useState<'all' | 'driver' | NearbyServiceType>('all');

  // Active Trip simulation
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [pendingDriverOffer, setPendingDriverOffer] = useState<any>(null);

  const createPendingDriverOffer = (_fare?: number) => {
    setPendingDriverOffer(null);
    return null;
  };

  // Expert Filters
  const [selectedExpertCategory, setSelectedExpertCategory] = useState<string>('all');
  const [expertSearchQuery, setExpertSearchQuery] = useState('');

  // Calculate route distance and duration
  const distanceKm = destinationLocation && pickupLocation
    ? Math.max(
        1.5,
        Math.round(
          Math.sqrt(
            Math.pow(((destinationLocation.lat ?? 5.6174) - (pickupLocation.lat ?? 5.6052)) * 111, 2) +
              Math.pow(((destinationLocation.lng ?? -0.1772) - (pickupLocation.lng ?? -0.1668)) * 111, 2)
          ) * 10
        ) / 10
      )
    : 4.8;

  const durationMins = Math.round(distanceKm * 2.8) + 4;

  const activeRoute = destinationLocation && pickupLocation
    ? {
        distanceKm,
        durationMins,
        polyline: [
          [pickupLocation.lat ?? 5.6052, pickupLocation.lng ?? -0.1668],
          [
            ((pickupLocation.lat ?? 5.6052) * 2 + (destinationLocation.lat ?? 5.6174)) / 3,
            ((pickupLocation.lng ?? -0.1668) * 2 + (destinationLocation.lng ?? -0.1772)) / 3 + 0.004,
          ],
          [
            ((pickupLocation.lat ?? 5.6052) + (destinationLocation.lat ?? 5.6174) * 2) / 3,
            ((pickupLocation.lng ?? -0.1668) + (destinationLocation.lng ?? -0.1772) * 2) / 3 - 0.003,
          ],
          [destinationLocation.lat ?? 5.6174, destinationLocation.lng ?? -0.1772],
        ] as [number, number][],
      }
    : null;

  // Handlers
  const handleRequestRideToPlace = (place: NearbyLivePlace) => {
    setDestinationLocation({
      label: place.name,
      lat: place.lat,
      lng: place.lng,
    });
    setSelectedPlace(place);
    setMapSubTab('rides');
  };

  const handleCallEntity = (place: NearbyLivePlace) => {
    const participantObj = {
      id: place.id,
      name: place.name,
      avatar: place.image,
      initials: place.name.slice(0, 2).toUpperCase(),
      myLanguage: 'en',
      isExpert: false,
      phoneNumber: place.phone,
      nvId: place.nvId,
    };
    start1on1Call(participantObj, 'audio', false);
  };

  const handleCallDriver = (driver: NanivioDriver) => {
    const participantObj = {
      id: driver.id,
      name: driver.name,
      avatar: driver.avatar,
      initials: driver.name.slice(0, 2).toUpperCase(),
      myLanguage: driver.spokenLanguages[0] || 'en',
      isExpert: false,
      phoneNumber: driver.phone,
      nvId: driver.nvId,
    };
    start1on1Call(participantObj, 'audio', false);
  };

  const handleCallHost = (phone: string, nvId: string) => {
    const participantObj = {
      id: `host_${nvId}`,
      name: `Uba Fleet Host (NV ${nvId})`,
      avatar: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=150&auto=format&fit=crop&q=80',
      initials: 'FL',
      myLanguage: 'en',
      isExpert: false,
      phoneNumber: phone,
      nvId,
    };
    start1on1Call(participantObj, 'audio', false);
  };

  const expertCategories = [
    { id: 'all', label: 'All Disciplines' },
    { id: 'Healthcare & Telemedicine', label: 'Healthcare / MDs' },
    { id: 'Legal & Cross-Border Trade', label: 'Legal & Trade' },
    { id: 'Certified Simultaneous Interpretation', label: 'Interpreters' },
    { id: 'AI & Enterprise Architecture', label: 'AI & Tech' },
    { id: 'Business & Finance Advisory', label: 'Finance & Export' },
  ];

  const filteredExperts = experts.filter((exp) => {
    const matchesCategory = selectedExpertCategory === 'all' || exp.category === selectedExpertCategory;
    const matchesQuery =
      exp.name.toLowerCase().includes(expertSearchQuery.toLowerCase()) ||
      exp.title.toLowerCase().includes(expertSearchQuery.toLowerCase()) ||
      exp.specialties.some((s) => s.toLowerCase().includes(expertSearchQuery.toLowerCase()));
    return matchesCategory && matchesQuery;
  });

  const handleNavigateCategory = (category: ServiceCategoryDefinition) => {
    if (category.targetMode === 'experts') {
      setActiveMainMode('experts');
    } else {
      setActiveMainMode('map_services');
      if (category.targetSubTab) {
        setMapSubTab(category.targetSubTab);
      }
      if (category.targetFilter) {
        setActiveFilter(category.targetFilter);
      } else if (category.type === 'trip') {
        setActiveFilter('driver');
      } else {
        setActiveFilter('all');
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 space-y-5 w-full max-w-full overflow-x-hidden">
      {/* Live Ads Promotional Banner */}
      <LiveAdsBanner />

      {/* Dynamic Global Location Detector & Switcher Bar */}
      <LocationSelectorBar
        onLocationChange={handleLocationChange}
        onOpenMap={() => setActiveMainMode('map_services')}
      />

      {/* TOP-LEVEL MODE SWITCHER: Service Categories (Default) vs Live Map/Rides vs Drive Partner vs Experts */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 rounded-2xl bg-[#091120] border border-slate-800 shadow-lg">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none touch-pan-x">
          <button
            onClick={() => setActiveMainMode('live_services_4k')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeMainMode === 'live_services_4k'
                ? 'bg-gradient-to-r from-rose-600 via-amber-500 to-emerald-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-amber-300 hover:text-white hover:bg-slate-900 border border-amber-500/30'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <Tv className="w-4 h-4 text-amber-400" />
            <span>4K Live Service &amp; Ads</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-950/40 text-amber-200 font-bold border border-amber-500/30">
              4K UHD
            </span>
          </button>

          <button
            onClick={() => setActiveMainMode('categories')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeMainMode === 'categories'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-900'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Service Categories</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-950/30 text-slate-200 font-bold">
              13 Categories
            </span>
          </button>

          <button
            onClick={() => setActiveMainMode('map_services')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeMainMode === 'map_services'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Live Rides &amp; Map</span>
          </button>

          <button
            onClick={() => setActiveMainMode('driver_portal')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeMainMode === 'driver_portal'
                ? isDriveEnabled
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-md shadow-rose-500/20'
                : isDriveEnabled
                ? 'text-emerald-400 hover:text-emerald-300 hover:bg-slate-900 border border-emerald-500/20'
                : 'text-rose-400 hover:text-rose-300 hover:bg-slate-900 border border-rose-500/20'
            }`}
          >
            <Car className="w-4 h-4" />
            <span>Nanivio Drive Cockpit</span>
            <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold border ${
              isDriveEnabled
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
            }`}>
              {isDriveEnabled ? 'Driver Mode' : 'OFFLINE'}
            </span>
          </button>

          <button
            onClick={() => setActiveMainMode('experts')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeMainMode === 'experts'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Global Experts ({experts.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2 px-2 text-[11px] text-slate-400">
          <span className={`w-2 h-2 rounded-full ${isDriveEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
          <span className={`font-semibold ${isDriveEnabled ? 'text-emerald-300' : 'text-rose-400'}`}>
            {isDriveEnabled ? `${currentLocation.city} Fleet Online` : 'Nanivio Drive Suspended (Admin OFF)'}
          </span>
          {isAdmin && !isDriveEnabled && (
            <button
              onClick={() => updateAdminFeature('nanivioDriveEnabled', true)}
              className="ml-2 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[10px] font-bold border border-emerald-500/40 cursor-pointer"
              title="Quick turn on Nanivio Drive"
            >
              Turn ON
            </button>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* MODE 4K: 4K ULTRA HD LIVE SERVICES & BUSINESS ADS SCREEN */}
      {/* ================================================================= */}
      {activeMainMode === 'live_services_4k' && (
        <LiveServices4KVideoHub />
      )}

      {/* ================================================================= */}
      {/* MODE 0: LANDING PAGE - SERVICE CATEGORIES HUB (THE REQUESTED VIEW) */}
      {/* ================================================================= */}
      {activeMainMode === 'categories' && (
        <ServiceCategoriesHub
          places={places}
          experts={experts}
          currentLocation={currentLocation}
          onNavigateCategory={handleNavigateCategory}
          onCallPlace={handleCallEntity}
          onRequestRideToPlace={handleRequestRideToPlace}
          onCallExpert={(exp) => {
            const participantObj = {
              id: exp.id,
              name: exp.name,
              avatar: exp.avatar,
              initials: exp.name.slice(0, 2).toUpperCase(),
              myLanguage: exp.languages[0] || 'en',
              isExpert: true,
              phoneNumber: '+233302889900',
              nvId: `0486${exp.id.slice(-6)}`,
            };
            start1on1Call(participantObj, 'video', true);
          }}
          isDriveEnabled={isDriveEnabled}
        />
      )}

      {/* ================================================================= */}
      {/* MODE 1: GOOGLE MAPS LIVE SERVICES (CARS, ROUTES, RENTALS, NEARBY) */}
      {/* ================================================================= */}
      {activeMainMode === 'map_services' && (
        <div className="space-y-4">
          {/* Back to Categories Navigation Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl bg-slate-950/70 border border-slate-800">
            <button
              onClick={() => setActiveMainMode('categories')}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 text-xs font-bold flex items-center gap-1.5 border border-slate-800 cursor-pointer transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>← Back to Service Categories</span>
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="hidden sm:inline">Active View:</span>
              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-bold">
                {mapSubTab === 'rides'
                  ? '01. Trip Service (Ride Hailing)'
                  : mapSubTab === 'rentals'
                  ? '10. Auto Rent & Purchase'
                  : `Directory: ${activeFilter.toUpperCase()}`}
              </span>
            </div>
          </div>
          {/* Sub-Tabs: Ride Hailing vs Uba Car Renting vs Nearby Directory */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setMapSubTab('rides')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  mapSubTab === 'rides'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Car className="w-3.5 h-3.5" />
                <span>Request a Ride</span>
              </button>

              <button
                onClick={() => setMapSubTab('rentals')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  mapSubTab === 'rentals'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>Uba Car Renting</span>
              </button>

              <button
                onClick={() => setMapSubTab('directory')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  mapSubTab === 'directory'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Hospitals, Mechanics, Restaurants &amp; Companies</span>
              </button>
            </div>
          </div>

          {/* Interactive Google Map Canvas */}
          <NanivioGoogleMapViewer
            userLocation={userLocation}
            drivers={drivers}
            places={places}
            selectedPlace={selectedPlace}
            onSelectPlace={(p) => setSelectedPlace(p)}
            pickupLocation={pickupLocation}
            destinationLocation={destinationLocation}
            activeRoute={activeRoute}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            onRequestRideToPlace={handleRequestRideToPlace}
            onCallPlace={handleCallEntity}
          />

          {/* Sub-Tab 1: Ride Hailing */}
          {mapSubTab === 'rides' && (
            !isDriveEnabled ? (
              <div className="p-8 rounded-3xl bg-[#0b1424] border border-rose-500/40 shadow-2xl text-center space-y-4 max-w-xl mx-auto my-4 animate-in fade-in">
                <div className="w-16 h-16 rounded-3xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto shadow-lg">
                  <Car className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-extrabold text-white">Nanivio Ride-Hailing is Currently Switched OFF</h3>
                  <span className="inline-block text-xs px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono font-bold">
                    ADMIN SUSPENDED
                  </span>
                  <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                    Passenger ride booking has been switched off by platform administration. Nearby hospitals, mechanics, restaurants, and Global Experts remain fully operational.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                  <button
                    onClick={() => setMapSubTab('directory')}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold border border-slate-700 cursor-pointer transition-all"
                  >
                    Browse Directory Places
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => updateAdminFeature('nanivioDriveEnabled', true)}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black cursor-pointer shadow-lg shadow-emerald-500/20 transition-all"
                    >
                      Turn ON Nanivio Drive (Admin)
                    </button>
                  )}
                </div>
              </div>
            ) : (
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
                onStartRideRequest={async (driver) => {
                  try {
                    const res = await fetch('/api/services/ride/request', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ driverId:driver.id, pickup:pickupLocation, destination:destinationLocation, tier:selectedTier }) });
                    const data = await res.json().catch(()=>({}));
                    if (!res.ok || !data.success) throw new Error(data.error || 'Live ride provider is not connected.');
                    setActiveTrip(data.trip);
                  } catch (e:any) {
                    alert(e.message || 'Ride request could not be created.');
                  }
                }}
                activeTrip={activeTrip}
                onCancelTrip={() => setActiveTrip(null)}
                onCallDriver={handleCallDriver}
                onSwitchToDriverCockpit={() => {
                  createPendingDriverOffer();
                  setActiveMainMode('driver_portal');
                }}
              />
            )
          )}

          {/* Sub-Tab 2: Uba Car Renting */}
          {mapSubTab === 'rentals' && (
            !isDriveEnabled ? (
              <div className="p-8 rounded-3xl bg-[#0b1424] border border-rose-500/40 shadow-2xl text-center space-y-4 max-w-xl mx-auto my-4 animate-in fade-in">
                <div className="w-16 h-16 rounded-3xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto shadow-lg">
                  <Key className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-extrabold text-white">Uba Car Rentals are Temporarily Switched OFF</h3>
                  <span className="inline-block text-xs px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono font-bold">
                    ADMIN SUSPENDED
                  </span>
                  <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                    Vehicle rental operations have been paused under the Nanivio Drive master admin kill-switch.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                  <button
                    onClick={() => setMapSubTab('directory')}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold border border-slate-700 cursor-pointer transition-all"
                  >
                    Browse Directory Places
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => updateAdminFeature('nanivioDriveEnabled', true)}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black cursor-pointer shadow-lg shadow-emerald-500/20 transition-all"
                    >
                      Turn ON Nanivio Drive (Admin)
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <UbaCarRentingPanel onCallHost={handleCallHost} />
            )
          )}

          {/* Sub-Tab 3: Directory of Nearby Mechanics, Hospitals, Restaurants, Businesses */}
          {mapSubTab === 'directory' && (
            <NearbyLiveServicesPanel
              places={places}
              selectedPlace={selectedPlace}
              onSelectPlace={(place) => {
                setSelectedPlace(place);
                setUserLocation({ lat: place.lat, lng: place.lng });
              }}
              onRequestRideToPlace={handleRequestRideToPlace}
              onCallPlace={handleCallEntity}
              activeFilter={activeFilter === 'driver' ? 'all' : (activeFilter as any)}
              onFilterChange={(f) => setActiveFilter(f)}
            />
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* MODE 2: NANIVIO DRIVE PARTNER COCKPIT (DRIVER VIEW WITH MAP & ROUTE) */}
      {/* ================================================================= */}
      {activeMainMode === 'driver_portal' && (
        <div className="space-y-4">
          {!isDriveEnabled && (
            <div className="p-4 rounded-2xl bg-rose-950/70 border border-rose-500/60 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 font-bold shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white">Nanivio Drive Operations Suspended</span>
                    <span className="text-[10px] px-2 py-0.2 rounded-full bg-rose-500/20 text-rose-300 font-mono font-bold border border-rose-500/40">
                      ADMIN OFF
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-200/80 mt-0.5">
                    Platform administration has paused Nanivio Drive fleet dispatch. New ride requests are temporarily withheld.
                  </p>
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => updateAdminFeature('nanivioDriveEnabled', true)}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition-all shrink-0 cursor-pointer shadow-md shadow-emerald-500/20"
                >
                  Turn ON Nanivio Drive
                </button>
              )}
            </div>
          )}

          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 font-black">
                <Car className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-white">Nanivio Drive Partner Cockpit</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/30">
                    DRIVER INTERFACE
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Custom cockpit for drivers: Live GPS map &amp; route navigation, incoming user requests radar, turn-by-turn HUD, and full car operations.
                </p>
              </div>
            </div>

            <button
              onClick={() => setActiveMainMode('categories')}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-slate-700 cursor-pointer flex items-center gap-1.5 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
              <span>All Service Categories</span>
            </button>

            <button
              onClick={() => setActiveMainMode('map_services')}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-slate-700 cursor-pointer flex items-center gap-1.5 transition-all"
            >
              <span>Switch to Passenger View</span>
              <Compass className="w-3.5 h-3.5 text-emerald-400" />
            </button>
          </div>

          <NanivioDrivePartnerApp
            externalOffer={pendingDriverOffer}
            onAcceptOffer={(_acceptedOffer) => {
              setActiveTrip(null);
              setPendingDriverOffer(null);
              alert('Live ride dispatch is not connected. No trip has been created.');
            }}
            onDriverArrived={() => {
              setActiveTrip((prev: any) => (prev ? { ...prev, status: 'ARRIVED' } : prev));
            }}
            onDriverStartTrip={() => {
              setActiveTrip((prev: any) => (prev ? { ...prev, status: 'IN_TRIP' } : prev));
            }}
            onDriverCompleteTrip={(fare) => {
              setActiveTrip((prev: any) => (prev ? { ...prev, status: 'COMPLETED', fareGHS: fare } : prev));
            }}
            onCallRider={(phone, nvId) => {
              const participantObj = {
                id: `rider_${nvId}`,
                name: `Rider (NV ${nvId})`,
                avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
                initials: 'RD',
                myLanguage: 'en',
                isExpert: false,
                phoneNumber: phone,
                nvId,
              };
              start1on1Call(participantObj, 'audio', false);
            }}
          />
        </div>
      )}

      {/* ================================================================= */}
      {/* MODE 3: GLOBAL EXPERTS ON DEMAND (TELEMEDICINE, LEGAL, INTERPRETATION) */}
      {/* ================================================================= */}
      {activeMainMode === 'experts' && (
        <div className="space-y-4">
          {/* Back to Categories Navigation Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl bg-slate-950/70 border border-slate-800">
            <button
              onClick={() => setActiveMainMode('categories')}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 text-xs font-bold flex items-center gap-1.5 border border-slate-800 cursor-pointer transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>← Back to Service Categories</span>
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="hidden sm:inline">Active View:</span>
              <span className="px-2.5 py-0.5 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/30 font-bold">
                02. Experts Service (Doctors, Legal, Interpreters)
              </span>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Verified Global Experts on Demand</h2>
              <p className="text-xs text-slate-300">
                Connect directly with verified doctors, legal advisors, and simultaneous interpreters. Pay per minute with seamless Langpretation.
              </p>
            </div>

            {/* Search */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search doctors, lawyers, interpreters..."
                value={expertSearchQuery}
                onChange={(e) => setExpertSearchQuery(e.target.value)}
                className="w-full bg-[#0c1424] border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Category Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none touch-pan-x w-full max-w-full">
            {expertCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedExpertCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedExpertCategory === cat.id
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                    : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Experts Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredExperts.map((expert) => {
              const expertLang =
                SUPPORTED_LANGUAGES.find((l) => l.code === expert.primaryLanguage) || SUPPORTED_LANGUAGES[0];

              return (
                <div
                  key={expert.id}
                  className="bg-[#0c1424] border border-slate-800 hover:border-slate-700 rounded-3xl p-5 shadow-lg flex flex-col justify-between space-y-4 transition-all hover:shadow-2xl group"
                >
                  {/* Header Profile & Badge */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-slate-700 bg-slate-800 shadow-md">
                            <img
                              src={expert.avatar}
                              alt={expert.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          {expert.isOnline && (
                            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#0c1424]" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-sm font-bold text-white leading-tight">{expert.name}</h3>
                            {expert.isVerified && (
                              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-emerald-400/90 font-medium">{expert.title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-400">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span className="font-bold text-slate-200">{expert.rating}</span>
                            <span>({expert.reviewCount})</span>
                          </div>
                        </div>
                      </div>

                      {/* Primary Language */}
                      <span className="text-xl" title={`Primary Language: ${expertLang.name}`}>
                        {expertLang.flag}
                      </span>
                    </div>

                    {/* Bio snippet */}
                    <p className="text-xs text-slate-300 mt-3 line-clamp-2 leading-relaxed">{expert.bio}</p>

                    {/* Specialties tags */}
                    <div className="flex flex-wrap gap-1 mt-3">
                      {expert.specialties.slice(0, 3).map((s, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] text-slate-300 font-mono"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Footer Rate & Actions */}
                  <div className="pt-3 border-t border-slate-800/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-mono">
                        <span className="text-xs text-slate-400">Consultation: </span>
                        <span className="text-sm font-bold text-amber-400">
                          GH₵{expert.ratePerMinGHS.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-400"> / min</span>
                      </div>

                      <button
                        onClick={() => setSelectedExpert(expert)}
                        className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                      >
                        View Details →
                      </button>
                    </div>

                    {/* Direct Call Triggers */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          const participantObj = {
                            id: expert.id,
                            name: expert.name,
                            avatar: expert.avatar,
                            initials: expert.initials,
                            myLanguage: expert.primaryLanguage,
                            isExpert: true,
                            expertRatePerMin: expert.ratePerMinGHS,
                          };
                          start1on1Call(participantObj, 'audio', true, expert);
                        }}
                        className="py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Phone className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Audio</span>
                      </button>

                      <button
                        onClick={() => {
                          const participantObj = {
                            id: expert.id,
                            name: expert.name,
                            avatar: expert.avatar,
                            initials: expert.initials,
                            myLanguage: expert.primaryLanguage,
                            isExpert: true,
                            expertRatePerMin: expert.ratePerMinGHS,
                          };
                          start1on1Call(participantObj, 'video', true, expert);
                        }}
                        className="py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Video className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Video (HD)</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Expert Deep Profile Inspection Modal */}
          {selectedExpert && (
            <ExpertProfileModal expert={selectedExpert} onClose={() => setSelectedExpert(null)} />
          )}
        </div>
      )}
    </div>
  );
};
