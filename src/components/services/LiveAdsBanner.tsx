import React from 'react';
import { ChevronUp, ChevronDown, ExternalLink, Sparkles, Shield, Megaphone } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';

export const LiveAdsBanner: React.FC = () => {
  const {
    ads,
    isLiveAdsCollapsed,
    toggleLiveAdsCollapse,
    currentPlan,
    adminFeatures,
  } = useNanivio();

  if (!adminFeatures.liveAdsEnabled) return null;

  const activeAd = ads.find((a) => a.active) || ads[0];
  if (!activeAd) return null;

  return (
    <div className="bg-gradient-to-r from-[#0c182c] via-[#091526] to-[#0d1e38] border border-amber-500/30 rounded-3xl p-4 sm:p-5 shadow-xl relative overflow-hidden transition-all duration-300">
      {/* Background ambient pattern */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full filter blur-3xl pointer-events-none" />

      {/* Banner Header Controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider border border-amber-500/30 flex items-center gap-1">
            <Megaphone className="w-3 h-3" />
            {activeAd.badge || 'Sponsored Promotion'}
          </span>
          <span className="text-xs text-slate-400 hidden sm:inline">• {activeAd.category}</span>
        </div>

        {/* Paid User Collapse / Draw-Down Control */}
        {currentPlan.canCollapseAds && (
          <button
            id="btn-collapse-live-ads"
            onClick={toggleLiveAdsCollapse}
            className="flex items-center gap-1 text-[11px] text-amber-300/80 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30 transition-colors"
            title="Collapse sponsored display (Premium feature)"
          >
            <span>{isLiveAdsCollapsed ? 'Expand Sponsored' : 'Draw Down (Collapse)'}</span>
            {isLiveAdsCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Main Collapsible Ad Card Content */}
      {!isLiveAdsCollapsed && (
        <div className="flex flex-col md:flex-row items-center gap-4 sm:gap-6 animate-in fade-in duration-200">
          <div className="w-full md:w-48 h-28 rounded-2xl overflow-hidden shrink-0 border border-slate-700 bg-slate-900 shadow-md">
            <img
              src={activeAd.bannerImage}
              alt={activeAd.businessName}
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
              referrerPolicy="no-referrer"
            />
          </div>

          <div className="flex-1 space-y-1 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <span className="text-lg leading-none">{activeAd.logo}</span>
              <h3 className="text-sm sm:text-base font-bold text-white leading-snug">
                {activeAd.businessName}
              </h3>
            </div>
            <p className="text-xs text-amber-200/90 font-medium">{activeAd.tagline}</p>
            <p className="text-xs text-slate-400 line-clamp-2">{activeAd.description}</p>
          </div>

          <div className="shrink-0 w-full md:w-auto">
            <a
              href={activeAd.ctaLink}
              target="_blank"
              rel="noreferrer"
              className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all hover:scale-105"
            >
              <span>{activeAd.ctaText}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
