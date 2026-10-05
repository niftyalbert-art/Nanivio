import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  PhoneCall,
  Video,
  MessageSquare,
  Search,
  ShieldCheck,
  Building2,
  UserCheck,
  Globe,
  MapPin,
  Clock,
  ArrowRight,
  Filter,
  CheckCircle2,
  Star,
  ExternalLink,
  ChevronDown,
  Layers,
  X,
  Tv,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { LangpretationIcon } from '../common/LangpretationIcon';
import {
  MatchedServiceItem,
  UserLocationProfile,
  detectUserLocationProfile,
  rankLocationMatchedServices,
  REGIONAL_ZONES,
} from '../../utils/geoMatchingAlgorithm';
import { authClient } from '../../lib/authClient';
import { LiveServices4KVideoHub } from '../services/LiveServices4KVideoHub';
import type { ExpertApplication, BusinessApplication } from '../../types/auth';

export const VerifiedServicesLocationSection: React.FC = () => {
  const {
    currentUser,
    authUser,
    start1on1Call,
    setActiveConversationId,
    setActiveTab,
    myLanguage,
  } = useNanivio();

  const [verifiedExperts, setVerifiedExperts] = useState<ExpertApplication[]>([]);
  const [verifiedBusinesses, setVerifiedBusinesses] = useState<BusinessApplication[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filter States
  const [sectionViewMode, setSectionViewMode] = useState<'4k_live' | 'directory'>('4k_live');
  const [filterType, setFilterType] = useState<'all' | 'expert' | 'business'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [regionOverride, setRegionOverride] = useState<string>('auto'); // 'auto', 'ARABIC_MENA', 'WEST_AFRICA_ECOWAS', 'NORTH_AMERICA'
  const [selectedItemDetails, setSelectedItemDetails] = useState<MatchedServiceItem | null>(null);

  // Fetch Live Verified Data on mount
  useEffect(() => {
    let isMounted = true;
    const loadLiveData = async () => {
      try {
        setIsLoading(true);
        const [expertsList, businessesList] = await Promise.all([
          authClient.getLiveVerifiedExperts(),
          authClient.getLiveVerifiedBusinesses(),
        ]);
        if (isMounted) {
          setVerifiedExperts(expertsList);
          setVerifiedBusinesses(businessesList);
        }
      } catch (err) {
        console.warn('Failed to load live verified services:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadLiveData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Compute Active Location Profile using Nanivio Location Detection
  const activeUserProfile: UserLocationProfile = useMemo(() => {
    // If region override is selected by user
    if (regionOverride === 'ARABIC_MENA') {
      return {
        country: 'Egypt',
        state: 'Cairo',
        city: 'Cairo',
        preferredLanguage: 'ar',
        detectedZone: REGIONAL_ZONES.ARABIC_MENA,
      };
    }
    if (regionOverride === 'WEST_AFRICA_ECOWAS') {
      return {
        country: 'Ghana',
        state: 'Greater Accra',
        city: 'Accra',
        preferredLanguage: 'ak',
        detectedZone: REGIONAL_ZONES.WEST_AFRICA_ECOWAS,
      };
    }
    if (regionOverride === 'NORTH_AMERICA') {
      return {
        country: 'United States',
        state: 'New York',
        city: 'New York',
        preferredLanguage: 'en',
        detectedZone: REGIONAL_ZONES.NORTH_AMERICA,
      };
    }

    // Default: Detect from logged-in user profile or context
    const country = authUser?.country || (currentUser as any)?.country || 'Ghana';
    const state = authUser?.state || (currentUser as any)?.state || '';
    const city = authUser?.city || (currentUser as any)?.city || '';
    const preferredLang = (authUser?.preferredLanguage || myLanguage || 'en').toLowerCase();

    return detectUserLocationProfile({
      country,
      state,
      city,
      preferredLanguage: preferredLang,
    });
  }, [authUser, currentUser, myLanguage, regionOverride]);

  // Execute Nanivio Geo-Matching and Ranking Algorithm
  const matchedResults: MatchedServiceItem[] = useMemo(() => {
    return rankLocationMatchedServices(activeUserProfile, verifiedExperts, verifiedBusinesses, {
      filterType: filterType === 'all' ? undefined : filterType,
      category: selectedCategory === 'all' ? undefined : selectedCategory,
      searchQuery: searchQuery.trim() || undefined,
      onlyOnline: false,
    });
  }, [activeUserProfile, verifiedExperts, verifiedBusinesses, filterType, selectedCategory, searchQuery]);

  // Unique Categories from actual data
  const availableCategories = useMemo(() => {
    const categories = new Set<string>();
    verifiedExperts.forEach((e) => categories.add(e.category));
    verifiedBusinesses.forEach((b) => categories.add(b.category));
    return ['all', ...Array.from(categories)];
  }, [verifiedExperts, verifiedBusinesses]);

  const handleStartCall = (item: MatchedServiceItem, callType: 'audio' | 'video') => {
    const participant = {
      id: item.originalExpert?.userId || item.originalBusiness?.userId || item.id,
      name: item.name,
      avatar: item.avatarOrLogo,
      initials: item.name.split(' ').map((n) => n[0]).join('').slice(0, 2),
      nvId: item.nvId,
      myLanguage: item.languages[0] || 'en',
      role: (item.entityType === 'expert' ? 'expert' : 'business') as any,
      isExpert: item.entityType === 'expert',
      isOnline: item.isOnline,
    };

    start1on1Call(participant as any, callType, true, {
      id: item.id,
      name: item.name,
      avatar: item.avatarOrLogo,
      category: item.category as any,
      title: item.titleOrType,
      ratePerMinute: item.ratePerMinUSD || 0.60,
      verified: true,
      rating: item.rating || 4.9,
      reviewCount: item.reviewsCount || 45,
      supportedLanguages: item.languages,
      status: 'available',
    });
  };

  const handleStartChat = (item: MatchedServiceItem) => {
    setActiveConversationId(item.originalExpert?.userId || item.originalBusiness?.userId || item.id);
    setActiveTab('chat');
  };

  return (
    <section id="frontpage-services-section" className="space-y-5" aria-label="Verified Professionals and Businesses">
      {/* Header & Location Detection Indicator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <Sparkles className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Nanivio Services &amp; 4K Live Broadcast
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
            Live 4K interactive broadcasts, verified business advertisements, and directory of certified cross-border experts with real-time Langpretation.
          </p>
        </div>

        {/* Section View Switcher Pills */}
        <div className="flex items-center gap-2 bg-[#091222] p-1.5 rounded-2xl border border-slate-800 shadow-md">
          <button
            onClick={() => setSectionViewMode('4k_live')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
              sectionViewMode === '4k_live'
                ? 'bg-gradient-to-r from-rose-600 via-amber-500 to-emerald-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-amber-300 hover:text-white hover:bg-slate-900'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <Tv className="w-4 h-4 text-amber-400" />
            <span>4K Live &amp; Ads</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-950/40 text-amber-200 font-bold">
              4K UHD
            </span>
          </button>

          <button
            onClick={() => setSectionViewMode('directory')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              sectionViewMode === 'directory'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Verified Directory</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-950/40 text-slate-300 font-bold">
              {matchedResults.length}
            </span>
          </button>
        </div>
      </div>

      {sectionViewMode === '4k_live' ? (
        <LiveServices4KVideoHub />
      ) : (
        <>
          {/* Dynamic Location Detection Status Badge */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
            <div className="flex items-center gap-2.5 text-xs">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <MapPin className="w-4 h-4 animate-bounce" />
                <span>{activeUserProfile.country}</span>
              </div>
              <span className="text-slate-600">•</span>
              <span className="text-slate-300 font-medium">
                {activeUserProfile.detectedZone.name}
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/40">
              Live Geo-Ranked
            </span>
          </div>

      {/* Control Bar: Region Override, Search, Filter Pills */}
      <div className="space-y-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Region Switcher */}
          <div className="flex items-center gap-2 shrink-0">
            <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
            <label htmlFor="select-regional-zone" className="text-xs font-semibold text-slate-300">
              Region Zone:
            </label>
            <select
              id="select-regional-zone"
              value={regionOverride}
              onChange={(e) => setRegionOverride(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs text-white rounded-xl px-3 py-1.5 focus:border-emerald-500 focus:outline-none cursor-pointer"
            >
              <option value="auto">📍 Auto ({activeUserProfile.country} / {activeUserProfile.detectedZone.name})</option>
              <option value="ARABIC_MENA">🇪🇬 / 🇦🇪 Arabic MENA (Egypt, UAE, Saudi Arabia, GCC)</option>
              <option value="WEST_AFRICA_ECOWAS">🇬🇭 / 🇳🇬 West Africa (Ghana, Nigeria, ECOWAS)</option>
              <option value="NORTH_AMERICA">🇺🇸 / 🇨🇦 North America &amp; International</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search active services (e.g. Tele-Triage, Maritime Clearing, Trade Contracts)..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Type & Category Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-slate-500 text-[11px] font-medium mr-1">Type:</span>
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1 rounded-xl transition-all font-semibold ${
              filterType === 'all'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            All Services ({matchedResults.length})
          </button>
          <button
            onClick={() => setFilterType('expert')}
            className={`px-3 py-1 rounded-xl transition-all font-semibold flex items-center gap-1 ${
              filterType === 'expert'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <UserCheck className="w-3 h-3" />
            <span>Verified Experts</span>
          </button>
          <button
            onClick={() => setFilterType('business')}
            className={`px-3 py-1 rounded-xl transition-all font-semibold flex items-center gap-1 ${
              filterType === 'business'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Building2 className="w-3 h-3" />
            <span>Verified Businesses</span>
          </button>

          {/* Category Dropdown */}
          <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
            <Filter className="w-3 h-3" />
            <span>Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter services by category"
              className="bg-slate-950 border border-slate-800 text-xs text-white rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">All Categories</option>
              {availableCategories
                .filter((c) => c !== 'all')
                .map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grid of Matched Verified Experts & Businesses */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 space-y-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs">Connecting to Nanivio verified registry &amp; running regional location algorithm...</p>
        </div>
      ) : matchedResults.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/60 rounded-3xl border border-slate-800 space-y-3">
          <Globe className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-white">No exact providers matched your filter criteria</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Try resetting your search query or selecting &quot;All Categories&quot; to view all verified experts and businesses available across active regions.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
              setFilterType('all');
            }}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-400 cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {matchedResults.map((item) => (
            <div
              key={item.id}
              className="bg-gradient-to-b from-slate-900/90 to-slate-950/95 border border-slate-800 hover:border-emerald-500/50 rounded-3xl p-5 transition-all shadow-lg hover:shadow-2xl flex flex-col justify-between space-y-4 group relative overflow-hidden"
            >
              {/* Regional Proximity Indicator Ribbon */}
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider text-[9px] border ${
                      item.entityType === 'expert'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                        : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40'
                    }`}
                  >
                    {item.entityType === 'expert' ? 'Verified Expert' : 'Verified Business'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-semibold border border-slate-700/80">
                    {item.matchBadgeText || (item.matchTier === 'same_city'
                      ? '📍 Same City'
                      : item.matchTier === 'same_state'
                      ? '📍 Same State'
                      : item.matchTier === 'same_country'
                      ? `📍 Same Country (${item.country})`
                      : item.matchTier === 'regional_zone'
                      ? `🌍 Regional Match (${item.country})`
                      : item.matchTier === 'language_match'
                      ? `🗣️ Language Matched (${item.languages[0] || 'EN'})`
                      : `🌐 Cross-Border Verified`)}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-emerald-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px]">Online</span>
                </div>
              </div>

              {/* Main Profile Info */}
              <div className="flex items-start gap-3.5">
                <div className="relative shrink-0">
                  <img
                    src={item.avatarOrLogo}
                    alt={item.name}
                    className="w-14 h-14 rounded-2xl object-cover border border-slate-700 shadow-md group-hover:scale-105 transition-transform"
                  />
                  <span className="absolute -bottom-1 -right-1 text-sm bg-slate-900 p-0.5 rounded-full shadow">
                    {item.countryFlag}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-bold text-white truncate group-hover:text-emerald-300 transition-colors">
                      {item.name}
                    </h3>
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  </div>
                  <p className="text-xs text-emerald-400 font-medium truncate mt-0.5">{item.titleOrType}</p>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                    <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                    <span>{item.stateOrCity}</span>
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                      NV: {item.nvId}
                    </span>
                    <div className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span>{item.rating || 4.9}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bio / Description */}
              <p className="text-xs text-slate-300/90 line-clamp-2 leading-relaxed">
                {item.bioOrDescription}
              </p>

              {/* ACTIVE SERVICES STRIP (Live Real Services) */}
              <div className="space-y-1.5 bg-slate-950/80 p-3 rounded-2xl border border-slate-800/80">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    Active Services Available:
                  </span>
                  <span className="text-emerald-300 font-semibold flex items-center gap-1 text-[10px]">
                    <LangpretationIcon size={11} />
                    <span>Langpretation Live</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {item.services.slice(0, 3).map((service, sIdx) => (
                    <span
                      key={sIdx}
                      className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-300 text-[10px] font-medium border border-emerald-500/25 flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                      <span className="truncate max-w-[200px]">{service}</span>
                    </span>
                  ))}
                  {item.services.length > 3 && (
                    <span className="px-1.5 py-0.5 rounded-lg bg-slate-800 text-slate-400 text-[10px] font-medium">
                      +{item.services.length - 3} more
                    </span>
                  )}
                </div>
              </div>

              {/* Pricing / Working Hours Details */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
                {item.entityType === 'expert' ? (
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400">Consultation Rate</span>
                    <div className="font-semibold text-white text-xs">
                      ${item.ratePerMinUSD ? +(item.ratePerMinUSD * 60).toFixed(0) : 36}/hr{' '}
                      <span className="text-[10px] text-emerald-400 font-mono">
                        (${item.ratePerMinUSD?.toFixed(2)}/min)
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400">Operating Schedule</span>
                    <div className="font-medium text-slate-200 text-xs flex items-center gap-1 truncate max-w-[180px]">
                      <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{item.operatingHoursOrSchedule || '24/7 Intake'}</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setSelectedItemDetails(item)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold underline flex items-center gap-0.5 cursor-pointer"
                >
                  <span>Dossier</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              {/* Action Buttons: Audio Call, Video Call, Chat */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  onClick={() => handleStartCall(item, 'audio')}
                  className="py-2 px-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer shadow-md"
                  title={`Start Audio Call with ${item.name}`}
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>Audio</span>
                </button>
                <button
                  onClick={() => handleStartCall(item, 'video')}
                  className="py-2 px-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer shadow-md"
                  title={`Start Video Call with ${item.name}`}
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Video</span>
                </button>
                <button
                  onClick={() => handleStartChat(item)}
                  className="py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer"
                  title={`Message ${item.name}`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Chat</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rich Dossier Modal for Selected Expert or Business */}
      {selectedItemDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0b1424] border border-emerald-500/40 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <img
                  src={selectedItemDetails.avatarOrLogo}
                  alt={selectedItemDetails.name}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-400/40 shadow-md"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">{selectedItemDetails.name}</h3>
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  </div>
                  <p className="text-xs text-emerald-400 font-medium">{selectedItemDetails.titleOrType}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{selectedItemDetails.stateOrCity}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedItemDetails(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dossier Body */}
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Verified Identity &amp; Routing
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <span className="text-slate-500 block">Nanivio ID:</span>
                    <span className="font-mono font-bold text-emerald-300 text-sm">{selectedItemDetails.nvId}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Category:</span>
                    <span className="font-semibold text-white">{selectedItemDetails.category}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Languages:</span>
                    <span className="font-semibold text-white">{selectedItemDetails.languages.join(', ')}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  About &amp; Credentials
                </span>
                <p className="text-slate-300 leading-relaxed text-xs">
                  {selectedItemDetails.bioOrDescription}
                </p>
              </div>

              {/* Full Active Services List */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Full Portfolio of Active Services
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedItemDetails.services.map((svc, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-slate-900/90 border border-emerald-500/20 flex items-center gap-2 text-slate-200"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{svc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setSelectedItemDetails(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const item = selectedItemDetails;
                  setSelectedItemDetails(null);
                  handleStartCall(item, 'audio');
                }}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <PhoneCall className="w-4 h-4" />
                <span>Audio Call</span>
              </button>
              <button
                onClick={() => {
                  const item = selectedItemDetails;
                  setSelectedItemDetails(null);
                  handleStartCall(item, 'video');
                }}
                className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <Video className="w-4 h-4" />
                <span>Video Call</span>
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </section>
  );
};
