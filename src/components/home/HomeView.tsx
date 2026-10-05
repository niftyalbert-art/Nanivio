import React, { useState } from 'react';
import {
  Globe,
  PhoneCall,
  Video,
  MessageSquare,
  Search,
  Copy,
  Check,
  Activity,
  Zap,
  Car,
  ArrowRight,
  PhoneForwarded,
  UserCheck,
  Bot,
  CreditCard,
  Sparkles,
  Gauge,
  Tv,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { lookupNanivioUser } from '../../utils/userLookup';
import { VerifiedServicesLocationSection } from './VerifiedServicesLocationSection';

export const HomeView: React.FC = () => {
  const {
    currentUser,
    authUser,
    setActiveTab,
    start1on1Call,
    setActiveConversationId,
    contacts,
    isFreeTrialActive,
    freeTrialMinutesRemaining,
    currentPlan,
    malviSubscription,
  } = useNanivio();

  const [copiedNvNumber, setCopiedNvNumber] = useState(false);
  const [nvSearchQuery, setNvSearchQuery] = useState('');
  const [searchFeedback, setSearchFeedback] = useState<{ found: boolean; message: string; contact?: any } | null>(null);

  const myNvNumber = authUser?.nvId || currentUser.nvId || currentUser.nanivioNumber || '0486000000';
  const remainingMins = isFreeTrialActive ? freeTrialMinutesRemaining : (currentPlan?.langpretationMinutesRemaining ?? 0);

  const handleCopyNvNumber = () => {
    navigator.clipboard.writeText(myNvNumber);
    setCopiedNvNumber(true);
    setTimeout(() => setCopiedNvNumber(false), 2000);
  };

  const handleSearchNvNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nvSearchQuery.trim()) return;

    const query = nvSearchQuery.trim().toLowerCase();
    const match = contacts.find(
      (c) =>
        (c.nanivioNumber && c.nanivioNumber.toLowerCase().includes(query)) ||
        (c.nvId && c.nvId.toLowerCase().includes(query)) ||
        c.name.toLowerCase().includes(query) ||
        (c.username && c.username.toLowerCase().includes(query))
    );

    if (match) {
      setSearchFeedback({
        found: true,
        message: `${match.name} found (${match.nanivioNumber || match.nvId}) • Saved Contact`,
        contact: match,
      });
      return;
    }

    try {
      const realUser = await lookupNanivioUser(query);
      if (realUser) {
        setSearchFeedback({
          found: true,
          message: `${realUser.name} found (${realUser.nvId}) • Verified Nanivio Member`,
          contact: realUser,
        });
      } else {
        setSearchFeedback({
          found: false,
          message: `No registered Nanivio subscriber found for "${query}". Check the NV Number or invite them to Nanivio.`,
        });
      }
    } catch {
      setSearchFeedback({
        found: false,
        message: `Lookup service error for "${query}". Please verify the number.`,
      });
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-full overflow-x-hidden">
      {/* ------------------------------------------------------------- */}
      {/* HERO SECTION: "Nanivio connects me with the world" */}
      {/* ------------------------------------------------------------- */}
      <div className="relative rounded-3xl bg-gradient-to-br from-[#0c182c] via-[#091526] to-[#060c17] border border-emerald-500/30 p-6 sm:p-10 shadow-2xl overflow-hidden">
        {/* Decorative subtle background radial mesh */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
          <div className="space-y-4 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold tracking-wide shadow-sm">
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span>Global Communication Platform</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight sm:leading-none">
              Nanivio connects me <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300">
                with the world.
              </span>
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Communicate globally via audio, video, and chat using your unique NV Number with seamless{' '}
              <strong className="text-emerald-400 font-semibold">Langpretation</strong> across 18 African and international languages in real time.
            </p>

            {/* Quick Metrics Bar */}
            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs">
              <div className="flex items-center gap-1.5 text-slate-300 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>18 Languages Live</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>Sub-1.5s Langpretation Latency</span>
              </div>
            </div>
          </div>

          {/* User's Global NV Identity Card */}
          <div className="bg-slate-950/90 border border-emerald-500/40 rounded-3xl p-6 shadow-2xl min-w-[280px] sm:min-w-[320px] space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 flex items-center justify-center text-white font-bold text-lg border border-emerald-400/40 shadow-inner">
                  {currentUser.initials || 'NV'}
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{currentUser.name}</div>
                  <div className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Online &amp; Available</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Your Global NV Number
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xl font-black text-emerald-300 tracking-wider">
                  {myNvNumber}
                </span>
                <button
                  onClick={handleCopyNvNumber}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold border border-emerald-500/40 transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Copy NV Number"
                >
                  {copiedNvNumber ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('billing')}
              className="w-full flex items-center justify-between text-xs pt-1 border-t border-slate-800/80 hover:text-emerald-300 transition cursor-pointer text-left group"
              title="Open Live Langpretation Meter & Billing Hub"
            >
              <span className="text-slate-400 group-hover:text-slate-200">Langpretation Allowance</span>
              <div className="flex items-center gap-1 font-mono font-bold text-emerald-400 group-hover:text-emerald-300">
                <span>{remainingMins} min</span>
                <ArrowRight className="w-3 h-3 text-emerald-500 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* FEATURE SPOTLIGHT: Live Langpretation Meter & Malvi AI Hub */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Spotlight 1: Live Langpretation Meter & Subscriptions */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-[#0a1824] via-slate-900 to-[#07131e] border border-emerald-500/40 shadow-xl space-y-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <Gauge className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider font-mono font-bold text-emerald-400">Production Meter</div>
                <h3 className="text-lg font-black text-white">Live Langpretation Meter</h3>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-mono font-bold border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>ACTIVE</span>
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Real-time quota tracking across Audio Calls, Video Calls, Group Calls, Voice Notes, and Chat. Deducts production usage as speech is translated.
          </p>

          <div className="grid grid-cols-2 gap-2 bg-slate-950/70 p-3 rounded-2xl border border-slate-800 text-xs">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Current Allowance</div>
              <div className="text-base font-black font-mono text-emerald-300">{remainingMins} mins</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Status &amp; Gate</div>
              <div className="text-xs font-bold text-slate-200 flex items-center gap-1 mt-0.5">
                <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                <span>Paystack Verified</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => setActiveTab('billing')}
              className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Open Meter &amp; Top Up Minutes</span>
            </button>
            <button
              onClick={() => setActiveTab('billing')}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 transition cursor-pointer"
            >
              <span>Plans</span>
            </button>
          </div>
        </div>

        {/* Spotlight 2: Malvi AI Companion & Business Room */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-[#0c182c] via-slate-900 to-[#0e162a] border border-cyan-500/40 shadow-xl space-y-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider font-mono font-bold text-cyan-400">Independent AI</div>
                <h3 className="text-lg font-black text-white flex items-center gap-1.5">
                  <span>Malvi AI Ecosystem</span>
                  <Sparkles className="w-4 h-4 text-amber-400" />
                </h3>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-[11px] font-mono font-bold border border-cyan-500/30">
              {malviSubscription?.planName || 'Free Experience'}
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Autonomous 3D human-like avatar companion, real-time voice intelligence, in-call co-pilot, and <strong className="text-cyan-300 font-semibold">Malvi Business</strong> collaborative meeting room.
          </p>

          <div className="grid grid-cols-2 gap-2 bg-slate-950/70 p-3 rounded-2xl border border-slate-800 text-xs">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Video Avatar Companion</div>
              <div className="text-base font-black font-mono text-cyan-300">
                {(malviSubscription?.videoMinutesRemaining ?? 3).toFixed(1)} mins
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Collaboration Tier</div>
              <div className="text-xs font-bold text-purple-300 flex items-center gap-1 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Basic / Premium / Business</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => setActiveTab('malvi')}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Launch Malvi 3D Companion</span>
            </button>
            <button
              onClick={() => setActiveTab('billing')}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 transition cursor-pointer"
            >
              <span>Subscribe</span>
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* QUICK LAUNCH BAR: Start Communication Instantly */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <button
          onClick={() => setActiveTab('calls')}
          className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/60 transition-all text-left space-y-3 group cursor-pointer shadow-lg hover:bg-slate-850"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
            <PhoneCall className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
              Start Audio Call
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">High-definition audio with live speech translation</p>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('calls')}
          className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-teal-500/60 transition-all text-left space-y-3 group cursor-pointer shadow-lg hover:bg-slate-850"
        >
          <div className="w-12 h-12 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 group-hover:scale-105 transition-transform">
            <Video className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white group-hover:text-teal-300 transition-colors">
              Start Video Call
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Immersive 90% video stage with Langpretation strip</p>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/60 transition-all text-left space-y-3 group cursor-pointer shadow-lg hover:bg-slate-850"
        >
          <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
              Chat &amp; Voice Notes
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Instant messaging &amp; auto-translating voice notes</p>
          </div>
        </button>

        <button
          onClick={() => {
            const el = document.getElementById('frontpage-services-section');
            if (el) {
              el.scrollIntoView({ behavior: 'smooth' });
            } else {
              setActiveTab('services');
            }
          }}
          className="p-5 rounded-2xl bg-slate-900/90 border border-amber-500/30 hover:border-amber-400/70 transition-all text-left space-y-3 group cursor-pointer shadow-lg hover:bg-slate-850"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform relative">
            <Tv className="w-6 h-6" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors flex items-center gap-1.5">
              <span>Services &amp; 4K Live</span>
              <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 text-[9px] font-bold border border-rose-500/40">
                4K
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Live 4K broadcast, business ads &amp; directory</p>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('nvnumber')}
          className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-indigo-500/60 transition-all text-left space-y-3 group cursor-pointer shadow-lg hover:bg-slate-850"
        >
          <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
            <PhoneForwarded className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
              NV Number Connect
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Call or chat anyone using their unique NV identity</p>
          </div>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* DIRECT NV NUMBER SEARCH & DISPATCH BAR */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Search className="w-5 h-5 text-emerald-400" />
              <span>Connect by NV Number</span>
            </h2>
            <p className="text-xs text-slate-400">
              Enter any friend, business, or verified professional's NV Number to initiate a call or chat.
            </p>
          </div>
          <button
            onClick={() => setActiveTab('contacts')}
            className="text-xs text-emerald-400 font-semibold hover:underline flex items-center gap-1 self-start sm:self-auto cursor-pointer"
          >
            <span>Browse Contacts Directory</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <form onSubmit={handleSearchNvNumber} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <input
              type="text"
              value={nvSearchQuery}
              onChange={(e) => setNvSearchQuery(e.target.value)}
              placeholder="e.g. 0486829104 or NV-839210 or contact name"
              className="w-full bg-slate-950 border border-slate-700/80 rounded-2xl py-3.5 pl-4 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all font-mono"
            />
          </div>
          <button
            type="submit"
            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Search className="w-4 h-4" />
            <span>Search &amp; Connect</span>
          </button>
        </form>

        {searchFeedback && (
          <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 font-bold">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">{searchFeedback.message}</div>
                <div className="text-xs text-emerald-400 font-mono">
                  NV ID: {searchFeedback.contact?.nanivioNumber || searchFeedback.contact?.nvId || 'NV-GLOBAL'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  if (searchFeedback.contact) {
                    start1on1Call(searchFeedback.contact, 'audio');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Audio Call</span>
              </button>
              <button
                onClick={() => {
                  if (searchFeedback.contact) {
                    start1on1Call(searchFeedback.contact, 'video');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-teal-500 text-slate-950 hover:bg-teal-400 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Video Call</span>
              </button>
              <button
                onClick={() => {
                  if (searchFeedback.contact) {
                    setActiveConversationId(searchFeedback.contact.id);
                    setActiveTab('chat');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* CONNECT WITH VERIFIED PROFESSIONALS & BUSINESSES (GEO-MATCHED) */}
      {/* ------------------------------------------------------------- */}
      <VerifiedServicesLocationSection />

      {/* ------------------------------------------------------------- */}
      {/* NANIVIO RIDE PREVIEW BANNER (FUTURE READY) */}
      {/* ------------------------------------------------------------- */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-indigo-500/30 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0 shadow-inner">
            <Car className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-500/40">
              <span>Coming Soon</span>
            </div>
            <h3 className="text-lg font-bold text-white">Nanivio Ride — Global Smart Mobility</h3>
            <p className="text-xs text-slate-400 max-w-xl">
              Future-ready transportation powered by your Nanivio credit and multilingual Langpretation with drivers worldwide.
            </p>
          </div>
        </div>

        <button
          onClick={() => setActiveTab('ride')}
          className="px-5 py-2.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 hover:text-white border border-indigo-500/40 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0"
        >
          <span>Preview Nanivio Ride</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
