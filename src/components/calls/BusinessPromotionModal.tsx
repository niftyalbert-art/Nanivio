import React from 'react';
import {
  X,
  Globe,
  ExternalLink,
  Building2,
  ShieldCheck,
  CheckCircle2,
  Phone,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

export interface BusinessPromoItem {
  id: string;
  type: 'sponsored_company' | 'featured_business' | 'nanivio_service';
  title: string;
  tagline: string;
  companyName: string;
  category: string;
  badgeLabel: string;
  badgeType: 'sponsored' | 'featured' | 'nanivio';
  description: string;
  mediaUrl: string;
  ctaText: string;
  destinationUrl: string;
  highlights: string[];
}

interface BusinessPromotionModalProps {
  promo: BusinessPromoItem | null;
  onClose: () => void;
}

export const BusinessPromotionModal: React.FC<BusinessPromotionModalProps> = ({
  promo,
  onClose,
}) => {
  if (!promo) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#091322] border border-slate-700/70 rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden text-white max-h-[90vh] flex flex-col">
        {/* Banner image / video preview */}
        <div className="relative h-40 w-full overflow-hidden bg-slate-950">
          <img
            src={promo.mediaUrl}
            alt={promo.title}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#091322] via-[#091322]/40 to-transparent" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 backdrop-blur-md hover:bg-black/80 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Tag Pill */}
          <div className="absolute top-3 left-3">
            <span
              className={`px-2 py-0.5 rounded-[6px] text-[9px] font-black tracking-wider uppercase ${
                promo.badgeType === 'sponsored'
                  ? 'bg-emerald-400 text-slate-950 shadow-md'
                  : 'bg-cyan-500 text-slate-950'
              }`}
            >
              {promo.badgeLabel}
            </span>
          </div>

          <div className="absolute bottom-3 left-4 right-4">
            <div className="text-[11px] text-cyan-300 font-bold uppercase tracking-wider">
              {promo.companyName} • {promo.category}
            </div>
            <h3 className="text-base font-extrabold text-white leading-tight mt-0.5">
              {promo.title}
            </h3>
          </div>
        </div>

        {/* Scrollable details */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          <p className="text-slate-300 leading-relaxed bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
            {promo.description}
          </p>

          <div className="space-y-2">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Key Capabilities
            </h4>
            <div className="space-y-1.5">
              {promo.highlights.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 rounded-xl bg-slate-900/80 border border-slate-800/80 text-slate-200 text-[11px]"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{h}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-all"
          >
            Back to Call
          </button>

          <button
            onClick={() => {
              alert(`Redirecting to ${promo.companyName} verified partner portal...`);
              onClose();
            }}
            className="flex-[1.4] py-3 px-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-500/20 transition-all hover:scale-[1.02]"
          >
            <span>{promo.ctaText}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
