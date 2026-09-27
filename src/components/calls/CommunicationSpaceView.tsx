import React, { useState } from 'react';
import {
  PhoneCall,
  Video,
  Radio,
  Sparkles,
  Users,
  Clock,
  CreditCard,
  Check,
  ChevronRight,
  Search,
  Plus,
  Play,
  RotateCcw,
  Zap,
  ShieldCheck,
  Award,
  Globe,
  Sliders,
  AlertCircle,
  Volume2,
  Trash2,
  Phone,
  MessageSquare,
  ArrowRight,
  Maximize2,
  UserPlus,
  Copy,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { WorkspaceHeaderSwitcher } from '../common/WorkspaceHeaderSwitcher';
import { LangpretationIcon } from '../common/LangpretationIcon';
import { UniversalPaymentGatewayModal, PaymentPurpose } from '../payment/UniversalPaymentGatewayModal';
import { PhoneDialerModal } from './PhoneDialerModal';
import { SubscriptionPlansModal } from './SubscriptionPlansModal';
import { PlanTier, ExpertProvider, Participant } from '../../types';
import { USER_PLANS } from '../../data/mockData';
import { lookupNanivioUser } from '../../utils/userLookup';

export const CommunicationSpaceView: React.FC = () => {
  const {
    currentUser,
    currentPlan,
    callLogs,
    clearCallLogs,
    start1on1Call,
    startGroupCall,
    startDirectChatWithUser,
    contacts,
    experts,
    myLanguage,
    globalLangpretationEnabled,
    setGlobalLangpretationEnabled,
    isSubscribed,
    isFreeTrialActive,
    usedLangpretationMinutes,
    startFreeTrial,
    setActiveTab,
    adminFeatures,
  } = useNanivio();

  // Determine calling mode based on Admin switches (Default: Free calls for all users)
  const isFreeCallsActive = adminFeatures?.freeCallsForAllUsers !== false && !adminFeatures?.paidCallsEnabled;
  const isAudioEnabled = adminFeatures?.audioCallsEnabled !== false;
  const isVideoEnabled = adminFeatures?.videoCallsEnabled !== false;

  // Active sub-tab inside Communication Space
  const [commSubTab, setCommSubTab] = useState<'overview' | 'logs' | 'contacts' | 'group' | 'specialists'>('overview');

  // Currency selection for global pricing view
  const [savingsCurrency, setSavingsCurrency] = useState<'USD' | 'EUR' | 'GBP' | 'AED' | 'GHS' | 'NGN'>('USD');
  const currencySymbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    AED: 'د.إ',
    GHS: 'GH₵',
    NGN: '₦',
  };
  const currencyRates: Record<string, number> = {
    USD: 1.5,
    EUR: 1.4,
    GBP: 1.2,
    AED: 5.5,
    GHS: 22.5,
    NGN: 2400,
  };

  const planMinutesRemaining = currentPlan?.langpretationMinutesRemaining ?? 0;
  const planMinutesQuota = currentPlan?.langpretationMinutesQuota ?? 0;
  const usedMinutes = usedLangpretationMinutes ?? 0;
  const quotaPercent = planMinutesQuota > 0 ? Math.min(100, Math.max(0, Math.round((planMinutesRemaining / planMinutesQuota) * 100))) : 0;
  const estimatedSavings = (usedMinutes * (currencyRates[savingsCurrency] || 1.5)).toFixed(0);

  // Modals hidden behind individual button clicks
  const [isDialerModalOpen, setIsDialerModalOpen] = useState(false);
  const [isPlansModalOpen, setIsPlansModalOpen] = useState(false);
  const [paymentPurpose, setPaymentPurpose] = useState<PaymentPurpose | null>(null);

  // Group Conference & Family Lounge Live Room State
  const [activeRoomType, setActiveRoomType] = useState<'business' | 'family' | 'custom'>('business');
  const [customRoomName, setCustomRoomName] = useState('Global Multilateral Syndicate');
  const [roomParticipantIds, setRoomParticipantIds] = useState<string[]>([]);
  const [externalParticipants, setExternalParticipants] = useState<Participant[]>([]);
  const [stagingNvInput, setStagingNvInput] = useState('');
  const [isStagingLookup, setIsStagingLookup] = useState(false);
  const [stagingFeedback, setStagingFeedback] = useState<{ message: string; isError?: boolean } | null>(null);
  const [copiedRoomLink, setCopiedRoomLink] = useState(false);
  const [roomId, setRoomId] = useState(() => `NV-${Math.floor(100000 + Math.random() * 900000)}`);

  const handleToggleContactParticipant = (contactId: string) => {
    setRoomParticipantIds((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId]
    );
  };

  const handleAddParticipantByNv = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!stagingNvInput.trim()) return;
    setIsStagingLookup(true);
    setStagingFeedback(null);
    try {
      const user = await lookupNanivioUser(stagingNvInput.trim());
      if (user) {
        const participant: Participant = {
          id: user.id,
          name: user.name,
          avatar: user.avatar,
          initials: user.initials,
          myLanguage: user.myLanguage || 'en',
          role: 'user',
        };
        if (!externalParticipants.some((p) => p.id === participant.id) && !roomParticipantIds.includes(participant.id)) {
          setExternalParticipants((prev) => [...prev, participant]);
          setStagingFeedback({ message: `Added ${user.name} (${user.nvId}) to conference staging.` });
        } else {
          setStagingFeedback({ message: `${user.name} is already added.`, isError: true });
        }
        setStagingNvInput('');
      } else {
        setStagingFeedback({
          message: `No registered user found with NV ID "${stagingNvInput}". Please verify the number.`,
          isError: true,
        });
      }
    } catch {
      setStagingFeedback({ message: 'Error checking NV user status.', isError: true });
    } finally {
      setIsStagingLookup(false);
      setTimeout(() => setStagingFeedback(null), 4000);
    }
  };

  const handleRemoveExternalParticipant = (id: string) => {
    setExternalParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const handleCopyRoomLink = () => {
    const link = `https://nanivio.com/room/${roomId}`;
    navigator.clipboard.writeText(link);
    setCopiedRoomLink(true);
    setTimeout(() => setCopiedRoomLink(false), 2500);
  };

  const handleLaunchConference = (mode: 'audio' | 'video') => {
    const contactParticipants: Participant[] = contacts
      .filter((c) => roomParticipantIds.includes(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        avatar: c.avatar,
        initials: c.initials || c.name.slice(0, 2).toUpperCase(),
        myLanguage: (c.preferredLanguage as any) || c.language || 'en',
        role: 'user',
      }));

    const allParticipants = [...contactParticipants, ...externalParticipants];

    if (allParticipants.length === 0) {
      setStagingFeedback({
        message: 'Please select at least 1 contact or enter an NV Number to launch the conference.',
        isError: true,
      });
      setTimeout(() => setStagingFeedback(null), 4000);
      return;
    }

    startGroupCall(allParticipants, mode, true);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 w-full max-w-full overflow-x-hidden">
      {/* 1. Master Workspace Switcher */}
      <WorkspaceHeaderSwitcher currentSpace="communication" />

      {/* 2. Top Carrier Line Status Banner */}
      <div className="bg-gradient-to-r from-[#0b1424] via-[#0e1c33] to-[#091222] border border-cyan-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 via-teal-500 to-emerald-400 p-0.5 shadow-lg shadow-cyan-500/20 shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Radio className="w-6 h-6 text-cyan-400 animate-pulse" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-300">
                  Nanivio Telecom Network
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  VOICE &amp; VIDEO SIGNAL ACTIVE
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-xs text-slate-400 font-mono">Your Nanivio Line:</span>
                <span className="text-lg sm:text-xl font-mono font-black text-white tracking-wider">
                  NV {currentUser?.nvId || currentUser?.nanivioNumber || '0486000000'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap w-full lg:w-auto justify-start lg:justify-end">
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl px-3.5 py-2 flex items-center gap-3 text-xs font-mono hidden sm:flex">
              <div>
                <div className="text-[10px] text-slate-400 uppercase">Carrier Frequency</div>
                <div className="text-cyan-300 font-bold">5G VoLTE • E2EE Edge</div>
              </div>
            </div>

            {/* Individual Button Click: Open Phone Dialer */}
            <button
              id="btn-open-phone-dialer-top"
              onClick={() => setIsDialerModalOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-emerald-500/25 transition-all flex items-center gap-2 cursor-pointer"
              title="Open Phone & NV Dialer"
            >
              <Phone className="w-4 h-4" />
              <span>Open Phone Dialer</span>
            </button>

            {/* Individual Button Click: Membership & Langpretation Plans */}
            <button
              id="btn-open-plans-top"
              onClick={() => setIsPlansModalOpen(true)}
              className="px-3.5 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-700 hover:border-cyan-400 text-cyan-300 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
              title="View Membership & Langpretation Plans"
            >
              <CreditCard className="w-4 h-4 text-cyan-400" />
              <span>Membership &amp; Plans</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Calling Policy Display: Free Audio & Video Calls (Default) or Metered Monthly Quota */}
      {isFreeCallsActive ? (
        <div className="bg-gradient-to-br from-[#0a1828] via-[#0d2136] to-[#071320] border border-emerald-500/40 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-500/20">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-bold text-white">Free Audio &amp; Video Calls Active</h2>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    FREE FOR ALL USERS
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Platform policy: Free unlimited audio and video calling is active for all users with no minute quota deductions.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                onClick={() => setIsDialerModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 text-xs font-extrabold transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/25 cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Place a Free Call</span>
              </button>
              <button
                onClick={() => setIsPlansModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-400 text-cyan-300 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
                <span>Subscription Plans (Optional)</span>
              </button>
            </div>
          </div>

          {/* 3 Status Cards for Free Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className={`p-4 rounded-2xl border ${isAudioEnabled ? 'bg-slate-950/80 border-emerald-500/30' : 'bg-rose-950/20 border-rose-500/30'}`}>
              <div className="flex items-center justify-between text-xs font-mono mb-1">
                <span className="text-slate-400 uppercase">Audio Calling</span>
                <span className={isAudioEnabled ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {isAudioEnabled ? 'ENABLED • 100% FREE' : 'DISABLED BY ADMIN'}
                </span>
              </div>
              <div className="text-lg font-bold text-white flex items-center gap-2">
                <PhoneCall className={`w-5 h-5 ${isAudioEnabled ? 'text-emerald-400' : 'text-rose-400'}`} />
                <span>{isAudioEnabled ? 'Free HD Voice Calls' : 'Audio Calls Turned Off'}</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {isAudioEnabled ? 'End-to-end encrypted voice calling between all NV users' : 'Temporarily suspended by administrator'}
              </div>
            </div>

            <div className={`p-4 rounded-2xl border ${isVideoEnabled ? 'bg-slate-950/80 border-cyan-500/30' : 'bg-rose-950/20 border-rose-500/30'}`}>
              <div className="flex items-center justify-between text-xs font-mono mb-1">
                <span className="text-slate-400 uppercase">Video Calling</span>
                <span className={isVideoEnabled ? 'text-cyan-300 font-bold' : 'text-rose-400 font-bold'}>
                  {isVideoEnabled ? 'ENABLED • 100% FREE' : 'DISABLED BY ADMIN'}
                </span>
              </div>
              <div className="text-lg font-bold text-white flex items-center gap-2">
                <Video className={`w-5 h-5 ${isVideoEnabled ? 'text-cyan-400' : 'text-rose-400'}`} />
                <span>{isVideoEnabled ? 'Free HD Video Calls' : 'Video Calls Turned Off'}</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {isVideoEnabled ? 'Full screen camera & bilateral group video conferencing' : 'Temporarily suspended by administrator'}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
              <div className="flex items-center justify-between text-xs font-mono mb-1">
                <span className="text-slate-400 uppercase">Calling Quota</span>
                <span className="text-amber-400 font-bold">UNLIMITED</span>
              </div>
              <div className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
                <span>Zero Minute Metering</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Admin policy grants unlimited call duration without deduction
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Metered Monthly Quota & Subscription Card (When Admin Puts Free Calls OFF) */
        <div className="bg-gradient-to-br from-[#0c1626] via-[#0f1b30] to-[#0a1220] border border-emerald-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3">
              <LangpretationIcon size={24} glow={globalLangpretationEnabled} />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-white">Live Langpretation Meter Reading</h2>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${
                      isSubscribed
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : isFreeTrialActive
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30 animate-pulse'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {isSubscribed ? currentPlan.name : isFreeTrialActive ? 'Free Trial Active' : 'Not Subscribed · 0m Quota'}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Continuous speech-to-speech translation metering across 15+ African and international languages worldwide
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {!isSubscribed && !isFreeTrialActive && (
                <button
                  onClick={startFreeTrial}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 text-xs font-black transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20 cursor-pointer"
                  title="Activate your 15-minute global free trial"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Start 15-Min Free Trial</span>
                </button>
              )}

              <button
                onClick={() => setIsPlansModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer"
                title="Instant Subscription or Top Up Minutes via Payment Gateways"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isSubscribed ? '+ Top-Up Minutes' : 'Subscribe to Plan'}</span>
              </button>
            </div>
          </div>

          {/* Meter Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-1">
              <div className="text-[11px] uppercase font-mono text-slate-400">Remaining Balance</div>
              <div
                className={`text-2xl sm:text-3xl font-black font-mono ${
                  planMinutesRemaining > 0 ? 'text-emerald-400' : 'text-slate-500'
                }`}
              >
                {planMinutesRemaining}{' '}
                <span className="text-xs font-normal text-slate-400">mins</span>
              </div>
              <div className="text-[10px] text-emerald-500/80 font-mono">
                {planMinutesRemaining > 0 ? 'Active for live calls' : 'All zeroes when unsubscribed'}
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-1">
              <div className="text-[11px] uppercase font-mono text-slate-400">Monthly Quota</div>
              <div
                className={`text-2xl sm:text-3xl font-black font-mono ${
                  planMinutesQuota > 0 ? 'text-cyan-300' : 'text-slate-500'
                }`}
              >
                {planMinutesQuota}{' '}
                <span className="text-xs font-normal text-slate-400">mins</span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                {isFreeTrialActive ? 'Free trial allotment' : isSubscribed ? 'Renews every 30 days' : '0 without subscription'}
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-1">
              <div className="text-[11px] uppercase font-mono text-slate-400">Minutes Used</div>
              <div className="text-2xl sm:text-3xl font-black text-white font-mono">
                {usedMinutes} <span className="text-xs font-normal text-slate-400">mins</span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono">Live call consumption</div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-1 relative">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase font-mono text-slate-400">Estimated Savings</div>
                <select
                  value={savingsCurrency}
                  onChange={(e) => setSavingsCurrency(e.target.value as any)}
                  className="text-[10px] font-mono bg-slate-900 text-amber-400 border border-slate-700 rounded px-1 py-0.5 focus:outline-none cursor-pointer"
                  title="Select global currency"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="AED">AED (د.إ)</option>
                  <option value="GHS">GHS (GH₵)</option>
                  <option value="NGN">NGN (₦)</option>
                </select>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                {currencySymbols[savingsCurrency]}
                {estimatedSavings}{' '}
                <span className="text-xs font-normal text-slate-400">{savingsCurrency}</span>
              </div>
              <div className="text-[10px] text-amber-500/80 font-mono">vs standard human interpreters</div>
            </div>
          </div>

          {/* Quota Progress Bar */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Quota Availability Rate:</span>
              <span className="text-emerald-400 font-bold">{quotaPercent}% remaining</span>
            </div>
            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${quotaPercent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. Usable Functions Toolbar & Sub-tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto scrollbar-none touch-pan-x w-full max-w-full">
        {[
          { id: 'overview', label: 'Communication Hub', icon: PhoneCall, color: 'text-emerald-400' },
          { id: 'logs', label: 'Call & Meter Logs', icon: Clock, color: 'text-cyan-400', count: callLogs.length },
          { id: 'contacts', label: 'Direct Contacts', icon: Users, color: 'text-amber-400', count: contacts.length },
          { id: 'group', label: 'Group Conference', icon: Globe, color: 'text-blue-400' },
          { id: 'specialists', label: 'Live Specialists', icon: Award, color: 'text-purple-400', count: experts.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = commSubTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`tab-comm-${tab.id}`}
              onClick={() => setCommSubTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-slate-800 text-white border border-slate-700 shadow-md'
                  : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-900'
              }`}
            >
              <Icon className={`w-4 h-4 ${tab.color}`} />
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    isActive ? 'bg-slate-950 text-emerald-300' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 5. Sub-Tab Content Rendering */}

      {/* Sub-tab: Overview (Clean Launcher Dashboard with 1-Click Triggers) */}
      {commSubTab === 'overview' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Action Trigger Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Trigger 1: Open Phone Dialer */}
            <div
              onClick={() => setIsDialerModalOpen(true)}
              className="p-6 rounded-3xl bg-gradient-to-br from-[#0b1828] to-[#08101d] border border-emerald-500/40 hover:border-emerald-400 transition-all cursor-pointer shadow-xl group hover:scale-[1.01]"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                  <Phone className="w-6 h-6" />
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold flex items-center gap-1">
                  1-Click Trigger
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
              <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors">
                Launch Phone &amp; NV Dialer
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Open the interactive numeric dialer to place 10-digit Nanivio calls with live speech translation.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-emerald-400 font-mono font-bold">
                <span>NV Lines Format</span>
                <span className="underline group-hover:no-underline">Open Dialer &rarr;</span>
              </div>
            </div>

            {/* Trigger 2: Membership & Langpretation Plans */}
            <div
              onClick={() => setIsPlansModalOpen(true)}
              className="p-6 rounded-3xl bg-gradient-to-br from-[#0c1a2e] to-[#081220] border border-cyan-500/40 hover:border-cyan-400 transition-all cursor-pointer shadow-xl group hover:scale-[1.01]"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                  <CreditCard className="w-6 h-6" />
                </div>
                <span className="px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-mono font-bold flex items-center gap-1">
                  Plans &amp; Top-Ups
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
              <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                Membership &amp; Langpretation Plans
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Review subscription tiers, minute quotas, and instant top-up bundles with universal gateway rails.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-cyan-300 font-mono font-bold">
                <span>Current: {currentPlan.name}</span>
                <span className="underline group-hover:no-underline">View Plans &rarr;</span>
              </div>
            </div>
          </div>

          {/* Grid with Quick Speed Dial and Langpretation Engine Info */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Quick Speed Dial Contacts */}
            <div className="lg:col-span-6 bg-[#0b1424] border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  Quick Speed Dial (NV Lines)
                </h4>
                <button
                  onClick={() => setIsDialerModalOpen(true)}
                  className="text-xs text-emerald-400 hover:underline font-mono cursor-pointer"
                >
                  Open Dialer &rarr;
                </button>
              </div>

              {contacts.length === 0 ? (
                <div className="py-8 px-4 text-center space-y-3 bg-slate-950/60 rounded-2xl border border-dashed border-slate-800">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
                    <Users className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-slate-300">Quick Speed Dial is Empty</div>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                      You haven't added any contacts yet. Add family, colleagues, or specialists to your directory for fast 1-tap dialing.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('contacts')}
                    className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Add Contact to Speed Dial</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800/80 flex items-center justify-between hover:border-slate-700 transition-all"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-slate-950 font-black text-xs flex items-center justify-center border border-emerald-400/30 shrink-0">
                          {contact.initials || contact.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <div className="text-xs font-bold text-white truncate">{contact.name}</div>
                          <div className="text-[10px] text-emerald-400 font-mono font-bold">
                            {contact.nvId ? `NV ${contact.nvId}` : contact.phone || 'Speed Dial'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            const participant: Participant = {
                              id: contact.id,
                              name: contact.name,
                              avatar: '',
                              initials: contact.initials || contact.name.slice(0, 2).toUpperCase(),
                              myLanguage: (contact.preferredLanguage as any) || 'en',
                              role: 'user',
                            };
                            start1on1Call(participant, 'audio', true);
                          }}
                          className="p-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs transition-all cursor-pointer"
                          title={`Audio call ${contact.name}`}
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            const participant: Participant = {
                              id: contact.id,
                              name: contact.name,
                              avatar: '',
                              initials: contact.initials || contact.name.slice(0, 2).toUpperCase(),
                              myLanguage: (contact.preferredLanguage as any) || 'en',
                              role: 'user',
                            };
                            start1on1Call(participant, 'video', true);
                          }}
                          className="p-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs transition-all cursor-pointer"
                          title={`Video call ${contact.name}`}
                        >
                          <Video className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Langpretation Engine Info Card */}
            <div className="lg:col-span-6 bg-gradient-to-br from-[#0c1a2e] to-[#08101e] border border-cyan-500/30 rounded-3xl p-6 space-y-3 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Multilateral Langpretation
                </span>
                <span className="text-xs text-slate-400 font-mono">Multilateral Langpretation Core</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Both parties speak naturally in their native languages (e.g. Twi, Ga, Yoruba, French, English). Nanivio streams translated audio in under 600ms directly to the earpiece.
              </p>
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-400">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Zero configuration required for recipient</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono text-cyan-300">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Real-time voice tone &amp; pitch preservation</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab: Call & Meter Logs */}
      {commSubTab === 'logs' && (
        <div className="bg-[#0b1424] border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white">Call History &amp; Speech Meter Audit</h3>
              <p className="text-xs text-slate-400">Detailed records of calls, durations, and translation units</p>
            </div>

            {callLogs.length > 0 && (
              <button
                onClick={clearCallLogs}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-red-400 text-xs font-bold transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear History</span>
              </button>
            )}
          </div>

          {callLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <Clock className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-sm font-bold text-slate-400">No Call Logs Yet</p>
              <p className="text-xs text-slate-500">
                Place a call using the Phone Dialer to begin tracking your live sessions.
              </p>
              <button
                onClick={() => setIsDialerModalOpen(true)}
                className="mt-3 px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs cursor-pointer shadow-md inline-flex items-center gap-1.5"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Open Phone Dialer</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {callLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                        log.direction === 'missed'
                          ? 'bg-rose-500/20 text-rose-400'
                          : log.type === 'video'
                          ? 'bg-cyan-500/20 text-cyan-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      {log.type === 'video' ? <Video className="w-5 h-5" /> : <PhoneCall className="w-5 h-5" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{log.peerName}</span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                            log.direction === 'missed'
                              ? 'bg-rose-500/20 text-rose-400'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {log.direction.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Line: {log.peerNanivioNumber ? `NV ${log.peerNanivioNumber}` : 'Direct'} •{' '}
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="text-right">
                      <div className="text-slate-300 font-bold">{log.durationSeconds}s</div>
                      <div className="text-[10px] text-emerald-400 font-bold">
                        {log.langpretationUnitsUsed || 1} min quota
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const participant: Participant = {
                          id: `usr_${log.peerNanivioNumber}`,
                          name: log.peerName,
                          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
                          initials: log.peerName.slice(0, 2).toUpperCase(),
                          myLanguage: 'en',
                          role: 'user',
                        };
                        start1on1Call(participant, log.type, true);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer"
                    >
                      Call Back
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sub-tab: Direct Contacts */}
      {commSubTab === 'contacts' && (
        <div className="bg-[#0b1424] border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white">Direct Nanivio Contacts Directory</h3>
              <p className="text-xs text-slate-400">1-Tap HD calling with verified multi-language profiles</p>
            </div>
            <button
              onClick={() => setIsDialerModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs cursor-pointer shadow-md inline-flex items-center gap-1.5"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Open Dialer</span>
            </button>
          </div>

          {contacts.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-3 bg-slate-950/60 rounded-2xl border border-dashed border-slate-800">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
                <Users className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-bold text-slate-300">Contacts Directory is Empty</div>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Add contacts using their NV ID or phone number to start instant 1-tap HD bilingual calling.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setActiveTab('contacts')}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Go to Contacts Directory</span>
                </button>
                <button
                  onClick={() => setIsDialerModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 border border-slate-700"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Open Phone Dialer</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl flex items-center justify-between hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3 truncate">
                    <img
                      src={c.avatar}
                      alt={c.name}
                      className="w-10 h-10 rounded-full object-cover border border-slate-700"
                    />
                    <div className="truncate">
                      <div className="text-xs font-bold text-white truncate">{c.name}</div>
                      <div className="text-[11px] font-mono text-emerald-400 font-bold">
                        NV {c.nvId || c.nanivioNumber || '0486XXXXXX'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        const participant: Participant = {
                          id: c.id,
                          name: c.name,
                          avatar: c.avatar,
                          initials: c.name.slice(0, 2).toUpperCase(),
                          myLanguage: c.language || 'en',
                          role: 'user',
                        };
                        start1on1Call(participant, 'audio', true);
                      }}
                      className="p-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs transition-all cursor-pointer"
                      title={`Audio call ${c.name}`}
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        const participant: Participant = {
                          id: c.id,
                          name: c.name,
                          avatar: c.avatar,
                          initials: c.name.slice(0, 2).toUpperCase(),
                          myLanguage: c.language || 'en',
                          role: 'user',
                        };
                        start1on1Call(participant, 'video', true);
                      }}
                      className="p-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs transition-all cursor-pointer"
                      title={`Video call ${c.name}`}
                    >
                      <Video className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sub-tab: Group Conference & Family Lounge */}
      {commSubTab === 'group' && (
        <div className="bg-[#0b1424] border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-cyan-400" />
                Live Multilateral Conference &amp; Diaspora Lounge
              </h3>
              <p className="text-xs text-slate-400">
                Host end-to-end encrypted rooms with live multi-party Langpretation speech translation.
              </p>
            </div>

            {/* Room Mode Switcher */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-2xl border border-slate-800 self-start sm:self-auto">
              <button
                onClick={() => {
                  setActiveRoomType('business');
                  setCustomRoomName('Global Multilateral Syndicate');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeRoomType === 'business'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Business Syndicate
              </button>
              <button
                onClick={() => {
                  setActiveRoomType('family');
                  setCustomRoomName('Family & Diaspora Lounge');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeRoomType === 'family'
                    ? 'bg-cyan-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Family &amp; Diaspora Lounge
              </button>
              <button
                onClick={() => {
                  setActiveRoomType('custom');
                  setCustomRoomName('Private Conference');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeRoomType === 'custom'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Custom Room
              </button>
            </div>
          </div>

          {/* Active Room Metadata & Invite Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left 7 cols: Room Config & Staged Real Participants */}
            <div className="lg:col-span-7 space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                      {customRoomName}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                    Live Room ID: {roomId}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                  <div className="flex-1 w-full flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-400 font-mono truncate">
                    <span className="text-slate-500 truncate">https://nanivio.com/room/{roomId}</span>
                  </div>
                  <button
                    onClick={handleCopyRoomLink}
                    className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0 border border-slate-700"
                  >
                    {copiedRoomLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedRoomLink ? 'Copied Link' : 'Copy Invite Link'}</span>
                  </button>
                </div>
              </div>

              {/* Add Participant via NV ID Form */}
              <form onSubmit={handleAddParticipantByNv} className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Add Participant by NV User ID or Phone Number</span>
                  <span className="text-[10px] text-slate-500 font-normal">Real-time verification</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={stagingNvInput}
                    onChange={(e) => setStagingNvInput(e.target.value)}
                    placeholder="e.g. 0486829104 or NV-839210"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <button
                    type="submit"
                    disabled={isStagingLookup || !stagingNvInput.trim()}
                    className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{isStagingLookup ? 'Verifying...' : 'Add to Room'}</span>
                  </button>
                </div>

                {stagingFeedback && (
                  <p className={`text-xs ${stagingFeedback.isError ? 'text-rose-400' : 'text-emerald-400'} pt-1`}>
                    {stagingFeedback.message}
                  </p>
                )}
              </form>

              {/* Staged Participants Badge List */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">
                    Staged Participants ({roomParticipantIds.length + externalParticipants.length})
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    Live Langpretation will translate across all selected languages
                  </span>
                </div>

                {roomParticipantIds.length === 0 && externalParticipants.length === 0 ? (
                  <div className="py-6 text-center text-slate-500 text-xs space-y-1">
                    <p className="font-medium text-slate-400">No participants staged yet</p>
                    <p className="text-[11px] text-slate-500">
                      Select contacts from your directory on the right, or enter an NV Number above to invite real users.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {/* Selected from contacts */}
                    {contacts
                      .filter((c) => roomParticipantIds.includes(c.id))
                      .map((c) => (
                        <div
                          key={c.id}
                          className="inline-flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span className="font-semibold">{c.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            ({(c.preferredLanguage as any) || c.language || 'en'})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleContactParticipant(c.id)}
                            className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                    {/* Added externally via NV ID */}
                    {externalParticipants.map((p) => (
                      <div
                        key={p.id}
                        className="inline-flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-xl bg-cyan-950/50 border border-cyan-800/80 text-xs text-cyan-200"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                        <span className="font-semibold">{p.name}</span>
                        <span className="text-[10px] text-cyan-400 font-mono">({p.myLanguage})</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveExternalParticipant(p.id)}
                          className="text-cyan-400 hover:text-white p-0.5 rounded cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Launch Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-900">
                  <button
                    onClick={() => handleLaunchConference('audio')}
                    className="py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <PhoneCall className="w-4 h-4" />
                    <span>Launch Audio Conference ({roomParticipantIds.length + externalParticipants.length})</span>
                  </button>

                  <button
                    onClick={() => handleLaunchConference('video')}
                    className="py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Video className="w-4 h-4" />
                    <span>Launch HD Video Lounge ({roomParticipantIds.length + externalParticipants.length})</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right 5 cols: Live Contacts Quick Staging List */}
            <div className="lg:col-span-5 p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Invite from Saved Contacts</span>
                <span className="text-[10px] text-slate-500">{contacts.length} saved</span>
              </div>

              {contacts.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <p className="text-xs text-slate-400 font-medium">No contacts saved yet</p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    Add family, diaspora friends, or colleagues to your directory to easily add them to conferences.
                  </p>
                  <button
                    onClick={() => setActiveTab('contacts')}
                    className="mt-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1 border border-slate-700"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Go to Contacts</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {contacts.map((c) => {
                    const isSelected = roomParticipantIds.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => handleToggleContactParticipant(c.id)}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-emerald-950/40 border-emerald-500/50 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] ${
                            isSelected ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                          }`}>
                            {c.initials || c.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="truncate">
                            <div className="text-xs font-bold truncate">{c.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              NV {c.nvId || c.nanivioNumber || 'Direct'}
                            </div>
                          </div>
                        </div>

                        <div className={`w-5 h-5 rounded-lg border flex items-center justify-center ${
                          isSelected ? 'bg-emerald-500 border-emerald-500 text-slate-950' : 'border-slate-700 bg-slate-950'
                        }`}>
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab: Live Specialists */}
      {commSubTab === 'specialists' && (
        <div className="bg-[#0b1424] border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl animate-in fade-in duration-200">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-base font-bold text-white">Verified Specialists &amp; Tele-Triage</h3>
            <p className="text-xs text-slate-400">
              Direct live consultation with certified Doctors, Legal Advisors, and Professional Interpreters
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {experts.map((exp) => (
              <div
                key={exp.id}
                className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3 hover:border-purple-500/40 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-500/20 text-purple-300 font-bold flex items-center justify-center text-sm">
                    {exp.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white line-clamp-1">{exp.name}</div>
                    <div className="text-[10px] text-purple-300">{exp.title}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Rate: GH₵ {exp.ratePerMinGHS}/min</span>
                  <span className="text-emerald-400">● Online</span>
                </div>

                <button
                  onClick={() => {
                    const participant: Participant = {
                      id: exp.id,
                      name: exp.name,
                      avatar: exp.avatar,
                      initials: exp.initials,
                      myLanguage: exp.primaryLanguage,
                      role: 'user',
                      isExpert: true,
                      expertRatePerMin: exp.ratePerMinGHS,
                    };
                    start1on1Call(participant, 'audio', true, exp);
                  }}
                  className="w-full py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>Call Specialist</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: Phone & NV Lines Dialer Modal (Triggered by 1 button click) */}
      <PhoneDialerModal
        isOpen={isDialerModalOpen}
        onClose={() => setIsDialerModalOpen(false)}
      />

      {/* MODAL 2: Membership & Langpretation Plans Modal (Triggered by 1 button click) */}
      <SubscriptionPlansModal
        isOpen={isPlansModalOpen}
        onClose={() => setIsPlansModalOpen(false)}
        onSelectPayment={(purpose) => setPaymentPurpose(purpose)}
      />

      {/* MODAL 3: Universal Payment Gateway Modal */}
      {paymentPurpose && (
        <UniversalPaymentGatewayModal
          purpose={paymentPurpose}
          onClose={() => setPaymentPurpose(null)}
        />
      )}
    </div>
  );
};
