import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Navigation,
  Globe,
  ChevronDown,
  Compass,
  Check,
  Sparkles,
  Search,
  X,
  Radar,
  Map,
} from 'lucide-react';
import {
  locationService,
  UserLocationState,
  DEFAULT_LOCATION,
} from '../../services/locationService';
import {
  POPULAR_GLOBAL_CITIES,
  GlobalCityLocation,
} from '../../data/globalServicesData';
import { ALL_COUNTRY_CALLING_CODES } from '../../data/countryCallingCodes';

interface LocationSelectorBarProps {
  onLocationChange?: (location: UserLocationState) => void;
  onOpenMap?: () => void;
  className?: string;
}

export const LocationSelectorBar: React.FC<LocationSelectorBarProps> = ({
  onLocationChange,
  onOpenMap,
  className = '',
}) => {
  const [location, setLocation] = useState<UserLocationState>(
    locationService.getLocation()
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountryFilter, setSelectedCountryFilter] = useState('');
  const [customCityInput, setCustomCityInput] = useState('');

  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;

  useEffect(() => {
    const unsub = locationService.subscribe((loc) => {
      setLocation((prev) =>
        prev.city === loc.city && prev.country === loc.country && prev.lat === loc.lat && prev.lng === loc.lng
          ? prev
          : loc
      );
      if (onLocationChangeRef.current) {
        onLocationChangeRef.current(loc);
      }
    });
    return () => unsub();
  }, []);

  const handleDetectLocation = async () => {
    setIsDetecting(true);
    try {
      const detected = await locationService.autoDetectLocation();
      setLocation(detected);
      if (onLocationChange) onLocationChange(detected);
    } catch (e) {
      console.warn('Location detection notice:', e);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleSelectCity = (cityItem: GlobalCityLocation) => {
    locationService.setFromCity(cityItem);
    setIsModalOpen(false);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCityInput.trim()) return;
    const countryObj = ALL_COUNTRY_CALLING_CODES.find(
      (c) => c.name.toLowerCase() === selectedCountryFilter.toLowerCase()
    ) || { name: 'Ghana', flag: '🇬🇭', code: 'GH' };

    locationService.setLocation({
      city: customCityInput.trim(),
      stateOrRegion: `${customCityInput.trim()} Region`,
      country: countryObj.name,
      countryCode: countryObj.code,
      flag: countryObj.flag,
      source: 'manual',
      isDetected: false,
    });
    setCustomCityInput('');
    setIsModalOpen(false);
  };

  // Filter popular cities
  const filteredCities = POPULAR_GLOBAL_CITIES.filter((item) => {
    if (selectedCountryFilter && item.country !== selectedCountryFilter) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.city.toLowerCase().includes(q) ||
      item.country.toLowerCase().includes(q) ||
      item.stateOrRegion.toLowerCase().includes(q)
    );
  });

  return (
    <div className={`w-full space-y-2 select-none ${className}`}>
      {/* Primary Location Strip */}
      <div className="bg-[#091322] border border-emerald-500/30 rounded-2xl p-3 sm:p-3.5 shadow-lg flex flex-wrap items-center justify-between gap-3">
        {/* Current Active Location Badge & Modal Trigger */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 text-emerald-300 shadow-inner">
            <MapPin className="w-5 h-5 text-emerald-400" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-wider font-mono font-bold">
              <span>{location.flag}</span>
              <span className="truncate">
                {location.source === 'gps'
                  ? 'GPS Located'
                  : location.source === 'ip'
                  ? 'IP Detected'
                  : 'Selected Location'}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="group flex items-center gap-1.5 text-left text-sm sm:text-base font-extrabold text-white hover:text-emerald-300 transition-colors cursor-pointer"
              title="Click to switch city or country"
            >
              <span className="truncate">
                {location.city}, {location.country}
              </span>
              <ChevronDown className="w-4 h-4 text-emerald-400 group-hover:translate-y-0.5 transition-transform shrink-0" />
            </button>
          </div>
        </div>

        {/* Action Controls: Auto-Detect & Map Trigger */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDetectLocation}
            disabled={isDetecting}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-emerald-500/40 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
            title="Auto-detect using IP address or GPS"
          >
            {isDetecting ? (
              <>
                <Radar className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                <span className="hidden sm:inline">Detecting...</span>
              </>
            ) : (
              <>
                <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Auto-Detect IP/GPS</span>
                <span className="sm:hidden">Detect</span>
              </>
            )}
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Choose city or global country"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span>Switch City</span>
          </button>

          {onOpenMap && (
            <button
              onClick={onOpenMap}
              className="px-3 py-1.5 rounded-xl bg-cyan-950/40 hover:bg-cyan-950/70 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="View on Google Map"
            >
              <Map className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">View Map</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick City Selector Pills (Accra, Kumasi, Lagos, Nairobi, London, etc.) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
        <span className="text-[11px] text-slate-400 font-semibold shrink-0 pl-1">
          Quick Hubs:
        </span>
        {[
          { city: 'Accra', country: 'Ghana', flag: '🇬🇭', id: 'gh-accra' },
          { city: 'Kumasi', country: 'Ghana', flag: '🇬🇭', id: 'gh-kumasi' },
          { city: 'Takoradi', country: 'Ghana', flag: '🇬🇭', id: 'gh-takoradi' },
          { city: 'Lagos', country: 'Nigeria', flag: '🇳🇬', id: 'ng-lagos' },
          { city: 'Nairobi', country: 'Kenya', flag: '🇰🇪', id: 'ke-nairobi' },
          { city: 'Johannesburg', country: 'South Africa', flag: '🇿🇦', id: 'za-johannesburg' },
          { city: 'London', country: 'United Kingdom', flag: '🇬🇧', id: 'gb-london' },
          { city: 'New York', country: 'United States', flag: '🇺🇸', id: 'us-newyork' },
          { city: 'Dubai', country: 'United Arab Emirates', flag: '🇦🇪', id: 'ae-dubai' },
        ].map((hub) => {
          const isSelected =
            location.city.toLowerCase() === hub.city.toLowerCase() &&
            location.country.toLowerCase() === hub.country.toLowerCase();

          return (
            <button
              key={hub.id}
              onClick={() => {
                const target = POPULAR_GLOBAL_CITIES.find((c) => c.id === hub.id);
                if (target) handleSelectCity(target);
              }}
              className={`shrink-0 px-2.5 py-1 rounded-xl font-bold transition-all flex items-center gap-1 border cursor-pointer ${
                isSelected
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
              }`}
            >
              <span>{hub.flag}</span>
              <span>{hub.city}</span>
            </button>
          );
        })}
      </div>

      {/* Full Country & City Switcher Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#0b1322] border border-slate-800 rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-950 via-[#0a1220] to-slate-950">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    Select Location &amp; Local Services
                  </h3>
                  <p className="text-xs text-slate-400">
                    Nanivio Global: Localized for all supported countries &amp; cities
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search city, region, or country (e.g. Kumasi, Lagos, London)..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/90 border border-slate-700 rounded-xl text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Country Filter Select */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Filter by Country (All Nanivio Supported Nations):
                </label>
                <select
                  value={selectedCountryFilter}
                  onChange={(e) => setSelectedCountryFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-emerald-300 font-semibold focus:outline-none focus:border-emerald-500"
                >
                  <option value="">🌍 All Global Countries</option>
                  {ALL_COUNTRY_CALLING_CODES.map((c) => (
                    <option key={c.code} value={c.name}>
                      {c.flag} {c.name} ({c.dialCode})
                    </option>
                  ))}
                </select>
              </div>

              {/* Popular City Grid */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                  Verified Metropolitan Hubs ({filteredCities.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                  {filteredCities.map((cityItem) => {
                    const isSelected =
                      location.city.toLowerCase() === cityItem.city.toLowerCase() &&
                      location.country.toLowerCase() === cityItem.country.toLowerCase();

                    return (
                      <button
                        key={cityItem.id}
                        onClick={() => handleSelectCity(cityItem)}
                        className={`p-3 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-500/20 border-emerald-500/60 text-white'
                            : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">{cityItem.flag}</span>
                          <div>
                            <div className="text-sm font-black text-white">
                              {cityItem.city}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {cityItem.stateOrRegion} · {cityItem.country}
                            </div>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Enter Custom City / Town Form */}
              <form
                onSubmit={handleCustomSubmit}
                className="pt-2 border-t border-slate-800 space-y-2"
              >
                <div className="text-xs font-bold text-slate-300">
                  Can't find your town? Enter any city name:
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customCityInput}
                    onChange={(e) => setCustomCityInput(e.target.value)}
                    placeholder="e.g. Tema, Koforidua, Cape Coast, Abuja..."
                    className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={!customCityInput.trim()}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all disabled:opacity-40 cursor-pointer"
                  >
                    Set City
                  </button>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
              <div className="text-xs text-slate-400">
                Active: <span className="text-emerald-400 font-bold">{location.city}, {location.country}</span>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
