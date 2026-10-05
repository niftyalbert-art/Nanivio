import React, { useState, useEffect, useMemo } from 'react';
import {
  Globe,
  Star,
  ChevronUp,
  ChevronDown,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Building2,
  PhoneCall,
  UserCheck,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { ExpertProfile, ExpertProfileModal } from './ExpertProfileModal';
import { BusinessPromoItem, BusinessPromotionModal } from './BusinessPromotionModal';
import { LangpretationIcon } from '../common/LangpretationIcon';
import { useNanivio } from '../../context/NanivioContext';
import { Participant } from '../../types';
import { authClient } from '../../lib/authClient';
import {
  detectUserLocationProfile,
  rankLocationMatchedServices,
} from '../../utils/geoMatchingAlgorithm';
import type { ExpertApplication, BusinessApplication } from '../../types/auth';

// Export empty array for backward compatibility if any legacy file imports it
export const ONLINE_EXPERTS_DATA: ExpertProfile[] = [];

// Fallback baseline promo in case offline
export const ROTATING_PROMOS: BusinessPromoItem[] = [
  {
    id: 'promo_nanivio_service',
    type: 'nanivio_service',
    title: 'Need help communicating internationally?',
    tagline: 'Turn on Langpretation for live AI voice translation in 120+ languages.',
    companyName: 'Nanivio Global',
    category: 'Communication',
    badgeLabel: 'Nanivio Service',
    badgeType: 'nanivio',
    description: 'Break every language barrier with Nanivio Langpretation. Ultra-low latency bilingual translation during video calls.',
    mediaUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80',
    ctaText: 'Activate Now',
    destinationUrl: 'https://nanivio.com',
    highlights: [
      'Arabic ⇄ English real-time dialect engine',
      'Automatic receiver-language transcription',
      'Enterprise grade E2E encryption',
    ],
  },
];

interface SmartLiveServicesStripProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  activeLanguagePair?: string;
}

export const SmartLiveServicesStrip: React.FC<SmartLiveServicesStripProps> = ({
  isCollapsed,
  onToggleCollapse,
  activeLanguagePair = 'English ⇄ Arabic',
}) => {
  const { start1on1Call, setActiveTab, currentUser, authUser, myLanguage } = useNanivio();
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedExpert, setSelectedExpert] = useState<ExpertProfile | null>(null);
  const [selectedPromo, setSelectedPromo] = useState<BusinessPromoItem | null>(null);
  const [showAllExpertsModal, setShowAllExpertsModal] = useState(false);

  // Live verified data state
  const [rawExperts, setRawExperts] = useState<ExpertApplication[]>([]);
  const [rawBusinesses, setRawBusinesses] = useState<BusinessApplication[]>([]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      authClient.getLiveVerifiedExperts(),
      authClient.getLiveVerifiedBusinesses(),
    ])
      .then(([expertsList, businessesList]) => {
        if (isMounted) {
          setRawExperts(expertsList);
          setRawBusinesses(businessesList);
        }
      })
      .catch((err) => console.warn('Failed to load strip live data:', err));
    return () => {
      isMounted = false;
    };
  }, []);

  // Compute location-matched ranked services
  const userProfile = useMemo(() => {
    const country = authUser?.country || (currentUser as any)?.country || 'Ghana';
    const state = authUser?.state || (currentUser as any)?.state || '';
    const city = authUser?.city || (currentUser as any)?.city || '';
    const preferredLang = (authUser?.preferredLanguage || myLanguage || 'en').toLowerCase();
    return detectUserLocationProfile({ country, state, city, preferredLanguage: preferredLang });
  }, [authUser, currentUser, myLanguage]);

  const geoMatchedResults = useMemo(() => {
    return rankLocationMatchedServices(userProfile, rawExperts, rawBusinesses);
  }, [userProfile, rawExperts, rawBusinesses]);

  // Transform geo-matched experts into ExpertProfile objects
  const dynamicExperts: ExpertProfile[] = useMemo(() => {
    const expertItems = geoMatchedResults.filter((item) => item.type === 'expert');
    return expertItems.map((item) => {
      const orig = rawExperts.find((e) => e.id === item.id);
      return {
        id: item.id,
        name: item.name,
        profession: item.title,
        category: item.category as any,
        avatar: item.avatar,
        rating: item.rating || 4.9,
        reviewsCount: item.reviewCount || 45,
        country: item.country,
        countryFlag: item.countryFlag,
        languages: item.languages,
        isOnline: item.isOnline,
        hourlyRate: `$${item.ratePerMinUSD ? +(item.ratePerMinUSD * 60).toFixed(0) : 36}/hr`,
        consultationFee: `$${item.ratePerMinUSD ? +(item.ratePerMinUSD * 15).toFixed(0) : 10}`,
        bio: item.description,
        services: item.services,
        schedule: orig?.availableHours || 'Mon–Sat (9 AM – 9 PM GMT)',
        langpretationReady: true,
      };
    });
  }, [geoMatchedResults, rawExperts]);

  // Transform geo-matched businesses into BusinessPromoItem objects
  const dynamicPromos: BusinessPromoItem[] = useMemo(() => {
    const businessItems = geoMatchedResults.filter((item) => item.type === 'business');
    if (businessItems.length === 0) return ROTATING_PROMOS;
    return businessItems.map((b) => ({
      id: b.id,
      type: 'featured_business' as const,
      title: b.title,
      tagline: b.services.slice(0, 2).join(' • ') || 'Verified Nanivio Commercial Partner',
      companyName: b.name,
      category: b.category,
      badgeLabel: b.countryFlag ? `${b.countryFlag} Verified Business` : 'Verified Business',
      badgeType: 'featured' as const,
      description: b.description,
      mediaUrl: b.avatar,
      ctaText: 'Connect Now',
      destinationUrl: 'https://nanivio.com',
      highlights: b.services.slice(0, 3),
    }));
  }, [geoMatchedResults]);

  // Fallback defaults if loading
  const activePromos = dynamicPromos.length > 0 ? dynamicPromos : ROTATING_PROMOS;
  const currentPromo = activePromos[activeSlideIndex % activePromos.length];

  const featuredLeadExpert: ExpertProfile | null = dynamicExperts[0] || null;

  const miniExperts = dynamicExperts.slice(1, 4);

  // Automatic gentle rotation every 7 seconds
  useEffect(() => {
    if (isPaused || activePromos.length <= 1) return;
    const interval = setInterval(() => {
      setActiveSlideIndex((prev) => (prev + 1) % activePromos.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [isPaused, activePromos.length]);

  const handleConnectExpert = (expert: ExpertProfile, mode: 'call' | 'chat') => {
    setSelectedExpert(null);
    setShowAllExpertsModal(false);
    
    if (mode === 'call') {
      const expertParticipant: Participant = {
        id: expert.id,
        name: expert.name,
        avatar: expert.avatar,
        initials: expert.name.split(' ').map(n => n[0]).join('').slice(0, 2),
        myLanguage: expert.languages[0]?.toLowerCase().startsWith('ar') ? 'ar' : 'en',
        role: 'user',
        isExpert: true,
        expertRatePerMin: parseFloat(expert.hourlyRate.replace(/[^0-9.]/g, '')) / 60 || 12.5,
      };
      start1on1Call(expertParticipant, 'video', true);
    } else {
      setActiveTab('chat');
    }
  };

  return (
    <div
      className="relative z-20 px-3.5 py-1.5 bg-[#070b14] select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* ------------------------------------------------------------- */}
      {/* Expandable / Collapsible Drawer Handle */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center justify-between pb-1 px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            Live Services &amp; Verified Experts
          </span>
        </div>

        {/* Slide Indicator Dots (● ○ ○) + Collapse Toggle */}
        <div className="flex items-center gap-2">
          {!isCollapsed && (
            <div className="flex items-center gap-1">
              {ROTATING_PROMOS.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveSlideIndex(idx)}
                  className={`transition-all rounded-full ${
                    activeSlideIndex === idx
                      ? 'w-3 h-1 bg-emerald-400'
                      : 'w-1 h-1 bg-slate-600 hover:bg-slate-400'
                  }`}
                  title={`Slide ${idx + 1}`}
                />
              ))}
            </div>
          )}

          <button
            id="btn-toggle-live-services-drawer"
            onClick={onToggleCollapse}
            className="text-slate-400 hover:text-white p-0.5 rounded flex items-center gap-0.5 text-[9px]"
            title={isCollapsed ? 'Expand Smart Live Services' : 'Collapse for Clean Video View'}
          >
            {isCollapsed ? (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-800/90 border border-slate-700 text-emerald-400">
                <span>Expand Services</span>
                <ChevronDown className="w-3 h-3" />
              </div>
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Collapsed Compact State */}
      {/* ------------------------------------------------------------- */}
      {isCollapsed && (
        <div
          onClick={onToggleCollapse}
          className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-2 flex items-center justify-between text-xs cursor-pointer hover:border-emerald-500/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 text-[8px] font-bold uppercase">
              Live Strip
            </span>
            <span className="text-[10px] text-slate-300 truncate">
              {currentPromo?.companyName || 'Nanivio Live'} • {dynamicExperts.length || 1} Experts Online Now
            </span>
          </div>
          <span className="text-[9px] text-emerald-400 font-bold">Tap to view &gt;</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Expanded Main 2-Column Marketplace View */}
      {/* ------------------------------------------------------------- */}
      {!isCollapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 sm:max-h-52 overflow-y-auto pr-1">
          {/* ============================================================= */}
          {/* LEFT: Smart Rotating Promotional / Company Card */}
          {/* ============================================================= */}
          <div
            onClick={() => setSelectedPromo(currentPromo)}
            className="relative rounded-2xl bg-gradient-to-br from-[#0c2340] via-[#091b33] to-[#061224] border border-[#1e3a5f] p-3 flex flex-col justify-between overflow-hidden shadow-lg group cursor-pointer hover:border-cyan-500/60 transition-all"
          >
            {/* Ambient aesthetic glow */}
            <div className="absolute right-0 bottom-0 w-24 h-24 opacity-30 bg-radial from-cyan-400 to-transparent pointer-events-none" />

            <div className="space-y-1 z-10">
              <div className="flex items-center justify-between">
                <span
                  className={`inline-block px-1.5 py-0.5 rounded-[4px] text-slate-950 text-[8px] font-black tracking-wider uppercase ${
                    currentPromo.badgeType === 'sponsored'
                      ? 'bg-[#10b981]'
                      : 'bg-cyan-400'
                  }`}
                >
                  {currentPromo.badgeLabel}
                </span>

                {/* Context signal badge */}
                <span className="text-[7px] text-slate-400 font-mono">
                  {activeLanguagePair.includes('Arabic') ? '🇦🇪 Arab/Eng Context' : 'Global'}
                </span>
              </div>

              <h4 className="text-[11px] font-bold text-white leading-tight line-clamp-2">
                {currentPromo.title}
              </h4>
              <p className="text-[9px] text-slate-300 leading-tight line-clamp-1">
                {currentPromo.tagline}
              </p>
            </div>

            {/* Bottom Row: CTA button + Micro Company Indicator */}
            <div className="pt-2 z-10 flex items-center justify-between">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPromo(currentPromo);
                }}
                className="px-2.5 py-1 rounded-full bg-[#10b981] hover:bg-emerald-400 text-slate-950 text-[10px] font-bold shadow-md transition-transform hover:scale-105"
              >
                {currentPromo.ctaText}
              </button>

              {/* Company Logo Icon */}
              <div className="text-right">
                <div className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-400/40 ml-auto flex items-center justify-center text-cyan-300 mb-0.5">
                  <Globe className="w-3 h-3" />
                </div>
                <span className="text-[8px] text-cyan-300 font-mono font-bold block truncate max-w-[70px]">
                  {currentPromo.companyName}
                </span>
              </div>
            </div>
          </div>

          {/* ============================================================= */}
          {/* RIGHT: Online Experts Directory Card */}
          {/* ============================================================= */}
          <div className="rounded-2xl bg-[#0e1626] border border-slate-800 p-2.5 flex flex-col justify-between shadow-lg">
            {/* Header: Online Experts + See All > */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold text-white tracking-tight">Online Experts</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <button
                onClick={() => setShowAllExpertsModal(true)}
                className="text-[10px] font-semibold text-emerald-400 hover:underline flex items-center"
              >
                See All &gt;
              </button>
            </div>

            {/* Featured Lead Doctor or Empty State */}
            {featuredLeadExpert ? (
              <div
                onClick={() => setSelectedExpert(featuredLeadExpert)}
                className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500/50 cursor-pointer transition-colors"
              >
                <div className="relative w-8 h-8 rounded-full overflow-hidden border border-slate-700 shrink-0">
                  <img
                    src={featuredLeadExpert.avatar}
                    alt={featuredLeadExpert.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 border border-slate-950" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h5 className="text-[10px] font-bold text-white truncate">{featuredLeadExpert.name}</h5>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  </div>
                  <p className="text-[8px] text-slate-400 truncate">{featuredLeadExpert.profession}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-bold text-emerald-400 font-mono">Online</span>
                    <span className="text-[8px] font-bold text-cyan-300">Tap to Connect</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/60 text-center">
                <p className="text-[10px] text-slate-400 font-medium">No verified experts active</p>
                <p className="text-[8px] text-slate-500 mt-0.5">Real verified profiles will appear here when online</p>
              </div>
            )}

            {/* Mini Expert Row (Sara, Michael, Aisha) */}
            {miniExperts.length > 0 && (
              <div className="grid grid-cols-3 gap-1 pt-1.5 text-center">
                {miniExperts.map((exp) => (
                  <div
                    key={exp.id}
                    onClick={() => setSelectedExpert(exp)}
                    className="flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    <div className="relative w-6 h-6 rounded-full overflow-hidden border border-slate-700">
                      <img
                        src={exp.avatar}
                        alt={exp.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <span className="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    </div>
                    <span className="text-[8px] font-semibold text-slate-200 truncate w-full mt-0.5">
                      {exp.name}
                    </span>
                    <span className="text-[7px] text-slate-400 truncate w-full">{exp.profession}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Modals: Tap-to-Connect & Business Details */}
      {/* ------------------------------------------------------------- */}
      {selectedExpert && (
        <ExpertProfileModal
          expert={selectedExpert}
          onClose={() => setSelectedExpert(null)}
          onConnect={handleConnectExpert}
        />
      )}

      {selectedPromo && (
        <BusinessPromotionModal
          promo={selectedPromo}
          onClose={() => setSelectedPromo(null)}
        />
      )}

      {/* See All Online Experts Modal */}
      {showAllExpertsModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="relative w-full max-w-md bg-[#09111e] border border-slate-800 rounded-t-[32px] sm:rounded-[32px] p-5 text-white max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Online Experts Directory</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                  {dynamicExperts.length} Verified
                </span>
              </div>
              <button
                onClick={() => setShowAllExpertsModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="py-3 space-y-2 overflow-y-auto">
              {dynamicExperts.map((exp) => (
                <div
                  key={exp.id}
                  onClick={() => {
                    setShowAllExpertsModal(false);
                    setSelectedExpert(exp);
                  }}
                  className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/50 flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative w-10 h-10 rounded-full overflow-hidden border border-slate-700">
                      <img src={exp.avatar} alt={exp.name} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-slate-950" />
                    </div>
                    <div>
                      <div className="font-bold text-white text-xs">{exp.name}</div>
                      <div className="text-[10px] text-slate-400">{exp.profession} • {exp.country}</div>
                      <div className="text-[9px] text-emerald-400 font-mono font-bold mt-0.5">
                        {exp.consultationFee} / session
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                    Connect
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
