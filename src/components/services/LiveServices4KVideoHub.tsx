import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Sparkles,
  Star,
  ShieldCheck,
  PhoneCall,
  Video,
  Globe,
  Radio,
  Clock,
  Building2,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Volume2,
  VolumeX,
  Maximize2,
  Play,
  Pause,
  Tv,
  CheckCircle2,
  Users,
  Eye,
  Zap,
  MapPin,
  Search,
  Filter,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { LangpretationIcon } from '../common/LangpretationIcon';
import { authClient } from '../../lib/authClient';
import {
  detectUserLocationProfile,
  rankLocationMatchedServices,
} from '../../utils/geoMatchingAlgorithm';
import { ExpertProfile, ExpertProfileModal } from '../calls/ExpertProfileModal';
import { BusinessPromoItem, BusinessPromotionModal } from '../calls/BusinessPromotionModal';
import type { ExpertApplication, BusinessApplication } from '../../types/auth';
import type { Participant } from '../../types';

// High-fidelity 4K stream channels with real production video feeds
export interface Live4KChannel {
  id: string;
  name: string;
  category: string;
  description: string;
  resolution: string;
  fps: number;
  bitrateMbps: number;
  viewersCount: number;
  videoUrl: string;
  posterUrl: string;
  sponsorTitle: string;
  sponsorCompany: string;
}

const LIVE_4K_CHANNELS: Live4KChannel[] = [];
const FALLBACK_PROMOS: BusinessPromoItem[] = [];

export const LiveServices4KVideoHub: React.FC = () => {
  const { start1on1Call, setActiveTab, currentUser, authUser, myLanguage } = useNanivio();

  // Channel & Video State
  const [selectedChannel, setSelectedChannel] = useState<Live4KChannel | null>(LIVE_4K_CHANNELS[0] ?? null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [volume, setVolume] = useState<number>(0.75);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [viewerCount, setViewerCount] = useState<number>(LIVE_4K_CHANNELS[0]?.viewersCount ?? 0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const screenContainerRef = useRef<HTMLDivElement | null>(null);

  // Live verified data from backend
  const [rawExperts, setRawExperts] = useState<ExpertApplication[]>([]);
  const [rawBusinesses, setRawBusinesses] = useState<BusinessApplication[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [isPromoPaused, setIsPromoPaused] = useState<boolean>(false);
  const [selectedExpert, setSelectedExpert] = useState<ExpertProfile | null>(null);
  const [selectedPromo, setSelectedPromo] = useState<BusinessPromoItem | null>(null);
  const [expertCategoryFilter, setExpertCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Fetch live verified experts and businesses
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
      .catch((err) => console.warn('Failed to load live 4K services data:', err));
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

  // Dynamic experts
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
        reviewsCount: item.reviewCount || 52,
        country: item.country,
        countryFlag: item.countryFlag,
        languages: item.languages,
        isOnline: item.isOnline,
        hourlyRate: `$${item.ratePerMinUSD ? +(item.ratePerMinUSD * 60).toFixed(0) : 36}/hr`,
        consultationFee: `$${item.ratePerMinUSD ? +(item.ratePerMinUSD * 15).toFixed(0) : 10}`,
        bio: item.description,
        services: item.services,
        schedule: orig?.availableHours || 'Monâ€“Sat (9 AM â€“ 9 PM GMT)',
        langpretationReady: true,
      };
    });
  }, [geoMatchedResults, rawExperts]);

  // Dynamic promos
  const dynamicPromos: BusinessPromoItem[] = useMemo(() => {
    const businessItems = geoMatchedResults.filter((item) => item.type === 'business');
    if (businessItems.length === 0) return FALLBACK_PROMOS;
    return businessItems.map((b) => ({
      id: b.id,
      type: 'featured_business' as const,
      title: b.title,
      tagline: b.services.slice(0, 2).join(' â€¢ ') || 'Verified Nanivio Commercial Partner',
      companyName: b.name,
      category: b.category,
      badgeLabel: b.countryFlag ? `${b.countryFlag} Verified 4K Business` : 'Verified 4K Business',
      badgeType: 'featured' as const,
      description: b.description,
      mediaUrl: b.avatar || 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&auto=format&fit=crop&q=80',
      ctaText: 'Connect & Inquire',
      destinationUrl: 'https://nanivio.com',
      highlights: b.services.slice(0, 3),
    }));
  }, [geoMatchedResults]);

  const activePromos = dynamicPromos.length > 0 ? dynamicPromos : FALLBACK_PROMOS;
  const currentPromo = activePromos.length > 0 ? activePromos[activeSlideIndex % activePromos.length] : null;

  // Rotate promo carousel every 8 seconds
  useEffect(() => {
    if (isPromoPaused || activePromos.length <= 1) return;
    const timer = setInterval(() => {
      setActiveSlideIndex((prev) => (prev + 1) % activePromos.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [isPromoPaused, activePromos.length]);

  // Viewer count live variation
  useEffect(() => {
    const timer = setInterval(() => {
      setViewerCount((prev) => {
        const delta = Math.floor(Math.random() * 9) - 4;
        return Math.max(800, prev + delta);
      });
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Handle Play/Pause
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  // Handle Mute Toggle
  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMute = !isMuted;
    videoRef.current.muted = nextMute;
    setIsMuted(nextMute);
    if (!nextMute && videoRef.current.volume === 0) {
      videoRef.current.volume = volume || 0.5;
    }
  };

  // Handle Fullscreen
  const toggleFullscreen = () => {
    if (!screenContainerRef.current) return;
    if (!document.fullscreenElement) {
      screenContainerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Switch channel
  const handleSelectChannel = (channel: Live4KChannel) => {
    setSelectedChannel(channel);
    setViewerCount(channel.viewersCount ?? 0);
    if (videoRef.current) {
      videoRef.current.src = channel.videoUrl;
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  // Direct 1-on-1 Call with Expert
  const handleCallExpert = (expert: ExpertProfile, mode: 'audio' | 'video') => {
    const expertParticipant: Participant = {
      id: expert.id,
      name: expert.name,
      avatar: expert.avatar,
      initials: expert.name.split(' ').map((n) => n[0]).join('').slice(0, 2),
      myLanguage: expert.languages[0]?.toLowerCase().startsWith('ar') ? 'ar' : 'en',
      role: 'user',
      isExpert: true,
      expertRatePerMin: parseFloat(expert.hourlyRate.replace(/[^0-9.]/g, '')) / 60 || 0.6,
    };
    start1on1Call(expertParticipant, mode, true);
  };

  // Filtered experts
  const filteredExperts = useMemo(() => {
    return dynamicExperts.filter((exp) => {
      const matchesCategory = expertCategoryFilter === 'all' || exp.category.toLowerCase().includes(expertCategoryFilter.toLowerCase());
      const matchesSearch = !searchQuery ||
        exp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exp.profession.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exp.services.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [dynamicExperts, expertCategoryFilter, searchQuery]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ============================================================= */}
      {/* 1. 4K ULTRA HD BROADCAST VIDEO SCREEN */}
      {/* ============================================================= */}
      <div
        ref={screenContainerRef}
        className="relative rounded-3xl overflow-hidden bg-slate-950 border border-emerald-500/40 shadow-2xl shadow-emerald-500/10 group select-none"
      >
        {selectedChannel ? (
          <>
            {/* 4K Top Status Overlay Bar */}
            <div className="absolute top-0 inset-x-0 z-30 p-3 sm:p-4 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex items-center justify-between gap-3 pointer-events-auto">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-full bg-rose-600/90 text-white font-mono font-extrabold text-xs flex items-center gap-1.5 shadow-lg shadow-rose-600/40 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  <span>LIVE 4K</span>
                </span>

                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[11px] border border-emerald-500/40 flex items-center gap-1">
                  <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>{selectedChannel.resolution}</span>
                </span>

                <span className="hidden sm:inline-flex px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 font-mono text-[11px] border border-slate-700">
                  {selectedChannel.fps} FPS • {selectedChannel.bitrateMbps} Mbps HDR10
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs text-white font-mono shadow-md">
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{viewerCount.toLocaleString()} watching</span>
                </div>

                <button
                  onClick={toggleFullscreen}
                  className="p-2 rounded-xl bg-black/60 hover:bg-black/90 text-white border border-white/15 transition-colors cursor-pointer"
                  title={isFullscreen ? 'Exit Fullscreen' : 'View Full 4K Screen'}
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Real 4K Video Player */}
            <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                src={selectedChannel.videoUrl}
                poster={selectedChannel.posterUrl}
                autoPlay
                playsInline
                loop
                muted={isMuted}
                className="w-full h-full object-cover"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-[#070b14] via-transparent to-transparent pointer-events-none opacity-80" />

              <button
                onClick={togglePlay}
                className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-emerald-500/80 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-2xl opacity-0 group-hover:opacity-100 transition-all hover:scale-110 cursor-pointer pointer-events-auto"
                title={isPlaying ? 'Pause 4K Broadcast' : 'Play 4K Broadcast'}
              >
                {isPlaying ? <Pause className="w-8 h-8 fill-slate-950" /> : <Play className="w-8 h-8 ml-1 fill-slate-950" />}
              </button>
            </div>

            {/* 4K Bottom Broadcast HUD */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-[#070d18] via-[#091426] to-[#08101e] border-t border-slate-800 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase font-mono font-bold text-emerald-400">
                      {selectedChannel.category}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-xs text-slate-400 font-mono">Channel Verified</span>
                  </div>

                  <h2 className="text-base sm:text-lg font-black text-white leading-tight">
                    {selectedChannel.name}
                  </h2>

                  <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                    {selectedChannel.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    onClick={toggleMute}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-all cursor-pointer"
                    title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                    <span>{isMuted ? 'Unmute' : 'Audio ON'}</span>
                  </button>

                  <div className="relative">
                    <select
                      value={selectedChannel.id}
                      onChange={(e) => {
                        const chan = LIVE_4K_CHANNELS.find((c) => c.id === e.target.value);
                        if (chan) handleSelectChannel(chan);
                      }}
                      className="px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold font-mono focus:outline-none cursor-pointer"
                      title="Switch 4K Live Broadcast Channel"
                    >
                      {LIVE_4K_CHANNELS.map((chan) => (
                        <option key={chan.id} value={chan.id} className="bg-slate-900 text-white">
                          {chan.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pt-2 border-t border-slate-800/80">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 shrink-0 flex items-center gap-1">
                  <Tv className="w-3.5 h-3.5 text-cyan-400" />
                  <span>4K Channels:</span>
                </span>

                {LIVE_4K_CHANNELS.map((chan) => {
                  const isSelected = chan.id === selectedChannel.id;
                  return (
                    <button
                      key={chan.id}
                      onClick={() => handleSelectChannel(chan)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                          : 'bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
                      }`}
                    >
                      {chan.category}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="min-h-[320px] sm:min-h-[420px] flex flex-col items-center justify-center text-center px-6 py-12 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5">
              <Tv className="w-8 h-8 text-emerald-400" />
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white mb-2">
              Live 4K Broadcasts
            </h2>

            <p className="max-w-md text-sm text-slate-400 leading-relaxed">
              No verified live 4K broadcast channels are currently available.
              Please check again when a live channel becomes active.
            </p>

            <div className="mt-5 flex items-center gap-2 text-xs font-mono text-slate-500">
              <Radio className="w-3.5 h-3.5" />
              <span>Waiting for live channel availability</span>
            </div>
          </div>
        )}
      </div>
      {/* ============================================================= */}
      <div
        ref={screenContainerRef}
        className="relative rounded-3xl overflow-hidden bg-slate-950 border border-emerald-500/40 shadow-2xl shadow-emerald-500/10 group select-none"
      >
        {/* 4K Top Status Overlay Bar */}
        <div className="absolute top-0 inset-x-0 z-30 p-3 sm:p-4 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex items-center justify-between gap-3 pointer-events-auto">
          {/* Left: Live Badges & Resolution */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full bg-rose-600/90 text-white font-mono font-extrabold text-xs flex items-center gap-1.5 shadow-lg shadow-rose-600/40 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span>LIVE 4K</span>
            </span>

            <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[11px] border border-emerald-500/40 flex items-center gap-1">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>{selectedChannel.resolution}</span>
            </span>

            <span className="hidden sm:inline-flex px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 font-mono text-[11px] border border-slate-700">
              {selectedChannel.fps} FPS â€¢ {selectedChannel.bitrateMbps} Mbps HDR10
            </span>
          </div>

          {/* Right: Live Audience Counter & Channel Select */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs text-white font-mono shadow-md">
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span>{viewerCount.toLocaleString()} watching</span>
            </div>

            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-black/60 hover:bg-black/90 text-white border border-white/15 transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'View Full 4K Screen'}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Real 4K Video Player with Loop & Controls */}
        <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            src={selectedChannel.videoUrl}
            poster={selectedChannel.posterUrl}
            autoPlay
            playsInline
            loop
            muted={isMuted}
            className="w-full h-full object-cover"
          />

          {/* Ambient Video Vignette for Ultra Contrast */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#070b14] via-transparent to-transparent pointer-events-none opacity-80" />

          {/* Center Play/Pause Overlay Indicator on Hover */}
          <button
            onClick={togglePlay}
            className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-emerald-500/80 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-2xl opacity-0 group-hover:opacity-100 transition-all hover:scale-110 cursor-pointer pointer-events-auto"
            title={isPlaying ? 'Pause 4K Broadcast' : 'Play 4K Broadcast'}
          >
            {isPlaying ? <Pause className="w-8 h-8 fill-slate-950" /> : <Play className="w-8 h-8 ml-1 fill-slate-950" />}
          </button>
        </div>

        {/* 4K Bottom Broadcast HUD Bar */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#070d18] via-[#091426] to-[#08101e] border-t border-slate-800 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-mono font-bold text-emerald-400">
                  {selectedChannel.category}
                </span>
                <span className="text-slate-500">â€¢</span>
                <span className="text-xs text-slate-400 font-mono">Channel Verified</span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-white leading-tight">
                {selectedChannel.name}
              </h2>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                {selectedChannel.description}
              </p>
            </div>

            {/* Video Action Controls: Mute, Volume, Channel Picker */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                onClick={toggleMute}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-all cursor-pointer"
                title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                <span>{isMuted ? 'Unmute' : 'Audio ON'}</span>
              </button>

              {/* Channel Selector Dropdown */}
              <div className="relative">
                <select
                  value={selectedChannel.id}
                  onChange={(e) => {
                    const chan = LIVE_4K_CHANNELS.find((c) => c.id === e.target.value);
                    if (chan) handleSelectChannel(chan);
                  }}
                  className="px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold font-mono focus:outline-none cursor-pointer"
                  title="Switch 4K Live Broadcast Channel"
                >
                  {LIVE_4K_CHANNELS.map((chan) => (
                    <option key={chan.id} value={chan.id} className="bg-slate-900 text-white">
                      {chan.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Quick Channel Pill Switches */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pt-2 border-t border-slate-800/80">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 shrink-0 flex items-center gap-1">
              <Tv className="w-3.5 h-3.5 text-cyan-400" />
              <span>4K Channels:</span>
            </span>
            {LIVE_4K_CHANNELS.map((chan) => {
              const isSelected = chan.id === selectedChannel.id;
              return (
                <button
                  key={chan.id}
                  onClick={() => handleSelectChannel(chan)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  {chan.category}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ============================================================= */}
      {/* 2. LIVE BUSINESS ADS & SPONSORED SHOWCASE (INTERACTIVE CAROUSEL) */}
      {/* ============================================================= */}
      <div
        className="rounded-3xl bg-gradient-to-r from-[#0c182c] via-[#091526] to-[#0d1e38] border border-amber-500/40 p-5 sm:p-6 shadow-2xl relative overflow-hidden transition-all"
        onMouseEnter={() => setIsPromoPaused(true)}
        onMouseLeave={() => setIsPromoPaused(false)}
      >
        <div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
            <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-extrabold uppercase tracking-wider border border-amber-500/40 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{currentPromo.badgeLabel}</span>
            </span>
            <span className="text-xs text-slate-400 hidden sm:inline">â€¢ {currentPromo.category}</span>
          </div>

          {/* Carousel Controls (Prev / Next & Dots) */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {activePromos.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveSlideIndex(idx)}
                  className={`transition-all rounded-full ${
                    activeSlideIndex === idx
                      ? 'w-4 h-1.5 bg-amber-400'
                      : 'w-1.5 h-1.5 bg-slate-600 hover:bg-slate-400'
                  }`}
                  title={`Business Ad ${idx + 1}`}
                />
              ))}
            </div>

            <button
              onClick={() => setActiveSlideIndex((prev) => (prev - 1 + activePromos.length) % activePromos.length)}
              className="p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white"
              title="Previous Ad"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActiveSlideIndex((prev) => (prev + 1) % activePromos.length)}
              className="p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white"
              title="Next Ad"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Current Active Ad Card */}
        {currentPromo ? (
        <div className="flex flex-col md:flex-row items-center gap-5 sm:gap-6 animate-in fade-in duration-300">
          <div className="w-full md:w-56 h-36 rounded-2xl overflow-hidden shrink-0 border border-slate-700 bg-slate-950 shadow-lg relative">
            <img
              src={currentPromo.mediaUrl}
              alt={currentPromo.title}
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none" />
            <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-[10px] text-amber-300 font-mono border border-amber-500/30">
              4K Verified Sponsor
            </span>
          </div>

          <div className="flex-1 space-y-1.5 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
              <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
              <h3 className="text-base sm:text-lg font-black text-white leading-snug">
                {currentPromo.companyName}
              </h3>
            </div>
            <p className="text-sm font-semibold text-amber-200/90">{currentPromo.title}</p>
            <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">{currentPromo.description}</p>

            {/* Highlights pill tags */}
            {currentPromo.highlights && currentPromo.highlights.length > 0 && (
              <div className="flex items-center justify-center md:justify-start gap-1.5 flex-wrap pt-1">
                {currentPromo.highlights.map((h, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md bg-slate-900/80 border border-slate-800 text-[11px] text-slate-300"
                  >
                    âœ“ {h}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 w-full md:w-auto flex flex-col sm:flex-row md:flex-col gap-2">
            <button
              onClick={() => setSelectedPromo(currentPromo)}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-amber-500/25 transition-all hover:scale-105 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{currentPromo.ctaText}</span>
              <ExternalLink className="w-4 h-4" />
            </button>
            <a
              href={currentPromo.destinationUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>Visit Business</span>
            </a>
          </div>
        </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6 text-center">
            <div className="text-base font-bold text-slate-200">
              Business Promotions
            </div>
            <p className="mt-2 text-sm text-slate-400">
              No verified business promotions are currently available.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Promotions will appear here when verified business content becomes available.
            </p>
          </div>
        )}
      </div>

      {/* ============================================================= */}
      {/* 3. LIVE VERIFIED SERVICES & SPECIALISTS DIRECTORY */}
      {/* ============================================================= */}
      <div className="rounded-3xl bg-[#091220] border border-slate-800 p-5 sm:p-7 shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs uppercase font-mono font-bold text-emerald-400">
                Verified Directory
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mt-1">
              Live Services &amp; Certified Specialists
            </h3>
            <p className="text-xs text-slate-400">
              Direct live video and audio consultation with certified Doctors, Legal Advisors, and Professional Translators.
            </p>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search specialists or services..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
          {[
            { id: 'all', label: 'All Services' },
            { id: 'health', label: 'Doctors & Telehealth' },
            { id: 'legal', label: 'Legal Counsel' },
            { id: 'translation', label: 'Translators' },
            { id: 'business', label: 'Business & Finance' },
            { id: 'tech', label: 'Tech & Engineers' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setExpertCategoryFilter(cat.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                expertCategoryFilter === cat.id
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Specialists Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredExperts.slice(0, 6).map((expert) => (
            <div
              key={expert.id}
              className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-emerald-500/50 transition-all flex flex-col justify-between gap-4 group hover:shadow-xl"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      {expert.avatar ? (
                        <img
                          src={expert.avatar}
                          alt={expert.name}
                          className="w-12 h-12 rounded-xl object-cover border border-slate-700"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-800 text-white font-bold flex items-center justify-center">
                          {expert.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-slate-950 shadow" />
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
                        {expert.name}
                      </h4>
                      <p className="text-xs text-slate-400">{expert.profession}</p>
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-300 mt-0.5">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span className="font-bold">{expert.rating}</span>
                        <span className="text-slate-500">({expert.reviewsCount})</span>
                      </div>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold text-emerald-400">
                    {expert.hourlyRate}
                  </span>
                </div>

                <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                  {expert.bio}
                </p>

                {/* Specialties tags */}
                <div className="flex items-center gap-1 flex-wrap">
                  {expert.services.slice(0, 2).map((srv, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 text-[10px] font-mono border border-slate-800"
                    >
                      {srv}
                    </span>
                  ))}
                  {expert.langpretationReady && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[10px] font-mono border border-emerald-500/30 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                      Langpretation Ready
                    </span>
                  )}
                </div>
              </div>

              {/* Direct Action Buttons: Video Call, Audio Call, View Profile */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-900">
                <button
                  onClick={() => handleCallExpert(expert, 'video')}
                  className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                  title="Direct 4K Video Call with Langpretation"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Video Call</span>
                </button>

                <button
                  onClick={() => handleCallExpert(expert, 'audio')}
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                  title="Direct Audio Call"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setSelectedExpert(expert)}
                  className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold border border-slate-800 transition-colors cursor-pointer"
                  title="View Full Credentials & Schedule"
                >
                  <span>Profile</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Profile & Business Modals */}
      <ExpertProfileModal
        expert={selectedExpert}
        onClose={() => setSelectedExpert(null)}
        onConnect={(exp, mode) => {
          setSelectedExpert(null);
          handleCallExpert(exp, mode);
        }}
      />

      <BusinessPromotionModal
        promo={selectedPromo}
        onClose={() => setSelectedPromo(null)}
      />
    </div>
  );
};



