import React from 'react';
import {
  X,
  Star,
  ShieldCheck,
  MapPin,
  Globe,
  Coins,
  Phone,
  Video,
  MessageSquare,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { ExpertProvider, SUPPORTED_LANGUAGES } from '../../types';

interface ExpertProfileModalProps {
  expert: ExpertProvider | null;
  onClose: () => void;
}

export const ExpertProfileModal: React.FC<ExpertProfileModalProps> = ({ expert, onClose }) => {
  const {
    start1on1Call,
    setActiveConversationId,
    setActiveTab,
    myLanguage,
  } = useNanivio();

  if (!expert) return null;

  const expertLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === expert.primaryLanguage) || SUPPORTED_LANGUAGES[0];
  const myLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === myLanguage) || SUPPORTED_LANGUAGES[0];

  const handleStartConsultation = (type: 'audio' | 'video') => {
    onClose();
    // Convert expert into participant and start paid call session
    const participantObj = {
      id: expert.id,
      name: expert.name,
      avatar: expert.avatar,
      initials: expert.initials,
      myLanguage: expert.primaryLanguage,
      isExpert: true,
      expertRatePerMin: expert.ratePerMinGHS,
    };
    start1on1Call(participantObj, type, true, expert);
  };

  const handleOpenChat = () => {
    onClose();
    setActiveTab('chat');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0c1424] border border-slate-700/80 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header with Cover & Avatar */}
        <div className="relative h-28 bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/50 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pb-6 pt-0 relative -mt-12 space-y-4 overflow-y-auto">
          {/* Avatar and Verification */}
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3">
            <div className="relative">
              <div className="w-24 h-24 rounded-2xl overflow-hidden border-4 border-[#0c1424] shadow-2xl bg-slate-800">
                <img
                  src={expert.avatar}
                  alt={expert.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              {expert.isOnline && (
                <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#0c1424]" />
              )}
            </div>

            {/* Rates & Commission notice */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl px-4 py-2.5 text-right font-mono">
              <div className="text-[10px] text-slate-400">Consultation Rate</div>
              <div className="text-base font-bold text-amber-400">
                GH₵{expert.ratePerMinGHS.toFixed(2)}{' '}
                <span className="text-xs text-slate-400 font-normal">(${(expert.ratePerMinUSD).toFixed(2)}) / min</span>
              </div>
            </div>
          </div>

          {/* Name & Title */}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-white">{expert.name}</h2>
              {expert.isVerified && (
                <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verified
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-emerald-400 mt-0.5">{expert.title}</p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-2">
              <div className="flex items-center gap-1 text-amber-400">
                <Star className="w-3.5 h-3.5 fill-amber-400" />
                <span className="font-bold">{expert.rating}</span>
                <span className="text-slate-500">({expert.reviewCount} reviews)</span>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span>{expert.location}</span>
              </div>
            </div>
          </div>

          {/* Bio */}
          <div className="bg-slate-900/60 rounded-2xl p-4 border border-slate-800 space-y-1">
            <h3 className="text-xs font-bold text-slate-300 uppercase font-mono">Professional Background</h3>
            <p className="text-xs text-slate-300 leading-relaxed">{expert.bio}</p>
          </div>

          {/* Langpretation Bridge Info */}
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-3.5 flex items-center justify-between text-xs text-emerald-200">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="font-bold">Langpretation Bridge Available</div>
                <div className="text-[11px] text-emerald-300/80">
                  Consult in {myLangObj.name} · Expert responds in {expertLangObj.name}
                </div>
              </div>
            </div>
            <span className="text-lg">{expertLangObj.flag} ↔ {myLangObj.flag}</span>
          </div>

          {/* Specialties Pills */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase font-mono mb-2">Practice Specialties</h3>
            <div className="flex flex-wrap gap-1.5">
              {expert.specialties.map((spec, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-xs text-slate-200 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>{spec}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Direct Action Consultation Buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center gap-3">
            <button
              onClick={handleOpenChat}
              className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2"
              title="Message in chat"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Message</span>
            </button>

            <button
              id="btn-expert-audio-call"
              onClick={() => handleStartConsultation('audio')}
              className="flex-1 py-3 rounded-2xl bg-slate-800 hover:bg-emerald-950 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500 text-xs font-bold transition-all flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" />
              <span>Audio Call (GH₵{expert.ratePerMinGHS.toFixed(2)}/m)</span>
            </button>

            <button
              id="btn-expert-video-call"
              onClick={() => handleStartConsultation('video')}
              className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/30 transition-all hover:scale-105 flex items-center justify-center gap-2"
            >
              <Video className="w-4 h-4" />
              <span>Video Call (HD)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
