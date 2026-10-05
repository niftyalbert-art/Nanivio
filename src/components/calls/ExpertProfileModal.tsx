import React from 'react';
import {
  X,
  Phone,
  MessageSquare,
  Star,
  Globe,
  Clock,
  ShieldCheck,
  Calendar,
  Sparkles,
  CheckCircle2,
  DollarSign,
  Video,
} from 'lucide-react';
import { LangpretationIcon } from '../common/LangpretationIcon';

export interface ExpertProfile {
  id: string;
  name: string;
  profession: string;
  category: 'Medical' | 'Legal' | 'Business' | 'Psychology' | 'Consulting';
  avatar: string;
  rating: number;
  reviewsCount: number;
  country: string;
  countryFlag: string;
  languages: string[];
  isOnline: boolean;
  hourlyRate: string;
  consultationFee: string;
  bio: string;
  services: string[];
  schedule: string;
  langpretationReady: boolean;
}

interface ExpertProfileModalProps {
  expert: ExpertProfile | null;
  onClose: () => void;
  onConnect: (expert: ExpertProfile, mode: 'call' | 'chat') => void;
}

export const ExpertProfileModal: React.FC<ExpertProfileModalProps> = ({
  expert,
  onClose,
  onConnect,
}) => {
  if (!expert) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#0a1120] border border-slate-700/70 rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden text-white max-h-[90vh] flex flex-col">
        {/* Header Bar */}
        <div className="relative p-5 pb-3 flex items-start justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="relative w-14 h-14 rounded-2xl overflow-hidden border-2 border-emerald-500/50 shadow-lg">
              <img
                src={expert.avatar}
                alt={expert.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              {expert.isOnline && (
                <span className="absolute bottom-1 right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-950 shadow-sm" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-base font-bold text-white">{expert.name}</h3>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-xs text-slate-300 font-medium">{expert.profession}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Online Now
                </span>
                <span className="text-[11px] text-amber-400 font-bold flex items-center gap-0.5">
                  <Star className="w-3 h-3 fill-amber-400" />
                  {expert.rating} ({expert.reviewsCount})
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          {/* Langpretation Badge Banner */}
          {expert.langpretationReady && (
            <div className="p-3 rounded-2xl bg-gradient-to-r from-cyan-950/60 via-purple-950/40 to-slate-900 border border-cyan-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <LangpretationIcon size={28} glow={false} />
                <div>
                  <div className="font-bold text-white text-xs flex items-center gap-1.5">
                    Langpretation Ready
                    <span className="text-[9px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 rounded border border-cyan-500/30 font-mono">
                      Zero Barrier
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-300">
                    Speaks {expert.languages.join(', ')} with instant AI interpretation
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Pricing & Schedule Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-mono">Consultation Fee</span>
              <div className="text-sm font-extrabold text-white mt-0.5">{expert.consultationFee}</div>
              <span className="text-[9px] text-emerald-400 font-medium">15-min live session</span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-mono">Location &amp; Region</span>
              <div className="text-sm font-bold text-white mt-0.5 flex items-center gap-1">
                <span>{expert.countryFlag}</span>
                <span className="truncate">{expert.country}</span>
              </div>
              <span className="text-[9px] text-slate-400">{expert.schedule}</span>
            </div>
          </div>

          {/* Bio */}
          <div className="space-y-1">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">About Expert</h4>
            <p className="text-slate-300 leading-relaxed text-[11px] bg-slate-900/50 p-3 rounded-2xl border border-slate-800/80">
              {expert.bio}
            </p>
          </div>

          {/* Services Offered */}
          <div className="space-y-1.5">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Services Offered</h4>
            <div className="flex flex-wrap gap-1.5">
              {expert.services.map((srv, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-xl bg-slate-800/80 text-slate-200 text-[10px] font-medium border border-slate-700/60 flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  {srv}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center gap-3">
          <button
            onClick={() => onConnect(expert, 'chat')}
            className="flex-1 py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition-all"
          >
            <MessageSquare className="w-4 h-4 text-cyan-400" />
            <span>Chat Now</span>
          </button>

          <button
            onClick={() => onConnect(expert, 'call')}
            className="flex-[1.4] py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02]"
          >
            <Video className="w-4 h-4 fill-slate-950" />
            <span>Tap to Connect</span>
          </button>
        </div>
      </div>
    </div>
  );
};
