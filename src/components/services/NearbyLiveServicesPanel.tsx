import React, { useState } from 'react';
import {
  Wrench,
  Shield,
  Utensils,
  Building2,
  MapPin,
  Phone,
  Navigation,
  Star,
  Search,
  CheckCircle2,
  ExternalLink,
  Car,
  Clock,
  ShoppingBag,
  Store,
  ShoppingCart,
  Hotel,
  Coins,
  Sparkles,
  Key,
} from 'lucide-react';
import { NearbyLivePlace, NearbyServiceType } from '../../types/drive';

interface NearbyLiveServicesPanelProps {
  places: NearbyLivePlace[];
  selectedPlace: NearbyLivePlace | null;
  onSelectPlace: (place: NearbyLivePlace) => void;
  onRequestRideToPlace: (place: NearbyLivePlace) => void;
  onCallPlace: (place: NearbyLivePlace) => void;
  activeFilter: 'all' | NearbyServiceType;
  onFilterChange: (filter: 'all' | NearbyServiceType) => void;
}

export const NearbyLiveServicesPanel: React.FC<NearbyLiveServicesPanelProps> = ({
  places,
  selectedPlace,
  onSelectPlace,
  onRequestRideToPlace,
  onCallPlace,
  activeFilter,
  onFilterChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPlaces = places.filter((place) => {
    if (activeFilter !== 'all' && place.type !== activeFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = place.name.toLowerCase().includes(q);
      const matchAddress = place.address.toLowerCase().includes(q);
      const matchCategory = place.categoryLabel.toLowerCase().includes(q);
      const matchCity = place.city.toLowerCase().includes(q);
      const matchTags = place.tags.some((t) => t.toLowerCase().includes(q));
      return matchName || matchAddress || matchCategory || matchCity || matchTags;
    }
    return true;
  });

  const getCategoryIcon = (type: string) => {
    switch (type) {
      case 'mechanic':
        return <Wrench className="w-3.5 h-3.5 text-amber-400" />;
      case 'hospital':
        return <Shield className="w-3.5 h-3.5 text-red-400" />;
      case 'restaurant':
        return <Utensils className="w-3.5 h-3.5 text-emerald-400" />;
      case 'business':
        return <Building2 className="w-3.5 h-3.5 text-cyan-400" />;
      case 'mall':
        return <ShoppingBag className="w-3.5 h-3.5 text-purple-400" />;
      case 'shop':
        return <Store className="w-3.5 h-3.5 text-sky-400" />;
      case 'supermarket':
        return <ShoppingCart className="w-3.5 h-3.5 text-lime-400" />;
      case 'hotel':
        return <Hotel className="w-3.5 h-3.5 text-orange-400" />;
      case 'bank_momo':
        return <Coins className="w-3.5 h-3.5 text-teal-400" />;
      case 'beauty':
        return <Sparkles className="w-3.5 h-3.5 text-pink-400" />;
      case 'autorent':
        return <Key className="w-3.5 h-3.5 text-violet-400" />;
      default:
        return <MapPin className="w-3.5 h-3.5 text-blue-400" />;
    }
  };

  const getCategoryBadge = (type: string) => {
    switch (type) {
      case 'mechanic':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'hospital':
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      case 'restaurant':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'business':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      case 'mall':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'shop':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      case 'supermarket':
        return 'bg-lime-500/20 text-lime-300 border-lime-500/40';
      case 'hotel':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
      case 'bank_momo':
        return 'bg-teal-500/20 text-teal-300 border-teal-500/40';
      case 'beauty':
        return 'bg-pink-500/20 text-pink-300 border-pink-500/40';
      case 'autorent':
        return 'bg-violet-500/20 text-violet-300 border-violet-500/40';
      default:
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    }
  };

  const filterTabs: { id: 'all' | NearbyServiceType; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'All Places', icon: null },
    { id: 'restaurant', label: 'Restaurants', icon: <Utensils className="w-3.5 h-3.5" /> },
    { id: 'mechanic', label: 'Auto-Fitting / Mechanics', icon: <Wrench className="w-3.5 h-3.5" /> },
    { id: 'hospital', label: 'Emergency / Healthcare', icon: <Shield className="w-3.5 h-3.5" /> },
    { id: 'mall', label: 'Malls', icon: <ShoppingBag className="w-3.5 h-3.5" /> },
    { id: 'shop', label: 'Shops & Retail', icon: <Store className="w-3.5 h-3.5" /> },
    { id: 'supermarket', label: 'Supermarkets', icon: <ShoppingCart className="w-3.5 h-3.5" /> },
    { id: 'autorent', label: 'Auto Rent & Sales', icon: <Key className="w-3.5 h-3.5" /> },
    { id: 'business', label: 'Business Hubs', icon: <Building2 className="w-3.5 h-3.5" /> },
    { id: 'hotel', label: 'Hotels & Lodges', icon: <Hotel className="w-3.5 h-3.5" /> },
    { id: 'bank_momo', label: 'Banking & MoMo', icon: <Coins className="w-3.5 h-3.5" /> },
    { id: 'beauty', label: 'Beauty & Wellness', icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="p-4 sm:p-5 rounded-3xl bg-slate-950/90 border border-slate-800 shadow-xl space-y-4">
      {/* Search and Category Filters Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <span>Nearby Live Services &amp; Places Directory</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Verified Ghanaian contacts with direct calling, GPS locations, and Nanivio Ride routing
            </p>
          </div>

          <div className="text-xs text-slate-400 font-mono">
            Showing <span className="text-emerald-400 font-bold">{filteredPlaces.length}</span> places
          </div>
        </div>

        {/* Quick Category Buttons Scrollable */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none touch-pan-x">
          {filterTabs.map((tab) => {
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onFilterChange(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                    : 'bg-slate-900/90 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search restaurants, mechanics, hospitals, malls, shops, supermarkets, or locations..."
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Directory Places Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[520px] overflow-y-auto pr-1">
        {filteredPlaces.length === 0 ? (
          <div className="col-span-2 p-8 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-400 text-xs">
            No matching locations found for "{searchQuery}". Try a different filter or search term.
          </div>
        ) : (
          filteredPlaces.map((place) => {
            const isSelected = selectedPlace?.id === place.id;

            return (
              <div
                key={place.id}
                className={`p-4 rounded-2xl transition-all flex flex-col justify-between cursor-pointer border ${
                  isSelected
                    ? 'bg-slate-900 border-emerald-500 shadow-lg shadow-emerald-500/10'
                    : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                }`}
                onClick={() => onSelectPlace(place)}
              >
                <div>
                  {/* Category & NV Line Badge */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase border flex items-center gap-1 ${getCategoryBadge(
                        place.type
                      )}`}
                    >
                      {getCategoryIcon(place.type)}
                      <span>{place.categoryLabel}</span>
                    </span>

                    <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                      NV {place.nvId}
                    </span>
                  </div>

                  {/* Name and Rating */}
                  <h4 className="text-sm font-bold text-white mb-1 flex items-center justify-between">
                    <span>{place.name}</span>
                    <span className="text-[11px] font-mono text-slate-400 font-medium">
                      {place.distanceKm} km
                    </span>
                  </h4>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-2">
                    <div className="flex items-center gap-1 text-amber-400 font-semibold">
                      <Star className="w-3 h-3 fill-amber-400" />
                      <span>{place.rating}</span>
                      <span className="text-slate-500">({place.reviewCount})</span>
                    </div>
                    <span>•</span>
                    <span className="text-emerald-400 font-medium">{place.openHours}</span>
                  </div>

                  <p className="text-xs text-slate-300 line-clamp-2 mb-2">{place.description}</p>

                  {/* Address with City, Constituency, District */}
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 space-y-0.5 mb-2.5">
                    <div className="flex items-start gap-1 text-slate-300">
                      <MapPin className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                      <span className="line-clamp-1">{place.address}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 pl-4">
                      {place.constituency} · {place.districtOrMunicipality} · {place.state}
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {place.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md bg-slate-950 text-[10px] text-slate-400 border border-slate-800"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestRideToPlace(place);
                    }}
                    className="flex-1 py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                  >
                    <Car className="w-3.5 h-3.5" />
                    <span>Ride Here</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCallPlace(place);
                    }}
                    className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                    title="Call with Nanivio Langpretation"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Call NV</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
