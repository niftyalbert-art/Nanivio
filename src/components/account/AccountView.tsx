import React, { useState } from 'react';
import {
  User,
  Globe,
  Sparkles,
  Check,
  Crown,
  CreditCard,
  Zap,
  Receipt,
  ArrowRight,
  ShieldCheck,
  Copy,
  CheckCircle2,
  LogOut,
  Fingerprint,
  PhoneCall,
  ChevronRight,
  Settings,
  Plus,
  Send,
  History,
  TrendingUp,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { USER_PLANS } from '../../data/mockData';
import { SUPPORTED_LANGUAGES, PlanTier } from '../../types';
import { EditProfileModal } from './EditProfileModal';
import { SettingsModal } from '../settings/SettingsModal';
import { getLanguageByCode, getAllLanguages } from '../../i18n/languages';
import { LangpretationIcon } from '../common/LangpretationIcon';
import { getAccountText } from '../../i18n/authTranslations';

export const AccountView: React.FC = () => {
  const {
    currentUser,
    authUser,
    signOut,
    myLanguage,
    setMyLanguage,
    appLanguage,
    setAppLanguage,
    speakingLanguage,
    translationLanguage,
    setIsLanguageModalOpen,
    currentPlan,
    changePlan,
    billingSummary,
    wallets,
    isSubscribed,
    setActiveTab,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isEditProfileModalOpen,
    setIsEditProfileModalOpen,
    isFreeTrialActive,
    freeTrialMinutesRemaining,
    usedLangpretationMinutes,
    refreshBilling,
  } = useNanivio();

  const [copiedId, setCopiedId] = useState(false);
  const [showIncreaseValueModal, setShowIncreaseValueModal] = useState(false);
  const [showTransferValueModal, setShowTransferValueModal] = useState(false);
  const [increaseAmount, setIncreaseAmount] = useState<number>(50);
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferAmount, setTransferAmount] = useState<number>(20);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const accTxt = getAccountText(appLanguage);
  const appLangInfo = getLanguageByCode(appLanguage || myLanguage) || getLanguageByCode('en')!;
  const speakLangInfo = getLanguageByCode(speakingLanguage || 'en') || getLanguageByCode('en')!;
  const transLangInfo = getLanguageByCode(translationLanguage || 'ak') || getLanguageByCode('ak')!;

  const sub = billingSummary?.subscription;
  const nvId = authUser?.nvId || currentUser.nvId || currentUser.nanivioNumber || '0486000000';
  const role = authUser?.role || (currentUser.role === 'admin' ? 'ADMIN' : currentUser.role === 'expert' ? 'EXPERT' : currentUser.role === 'business' ? 'BUSINESS' : currentUser.role === 'driver' ? 'DRIVER' : 'PERSONAL');
  const verificationStatus = authUser?.verificationStatus || 'VERIFIED';

  // Nanivio Service Value
  const availableServiceValue = (
    billingSummary?.communicationAccount?.balance ??
    (billingSummary?.wallets?.find((w) => w.currency === 'GHS')?.available ?? 
     wallets?.find((w) => w.currency === 'GHS')?.amount ?? 
     0.0)
  );

  // Meter Reading Calculation
  const totalQuotaMinutes = sub?.langpretationMinutesQuota ?? (isFreeTrialActive ? 15 : (currentPlan?.langpretationMinutesQuota ?? 0));
  const remainingMinutes = sub?.langpretationMinutesRemaining ?? (isFreeTrialActive ? freeTrialMinutesRemaining : (currentPlan?.langpretationMinutesRemaining ?? 0));
  const minutesUsed = Math.max(0, totalQuotaMinutes - remainingMinutes);
  const percentConsumed = totalQuotaMinutes > 0 ? Math.min(100, Math.round((minutesUsed / totalQuotaMinutes) * 100)) : 0;
  const estimatedSavings = `GH₵ ${(minutesUsed * 1.5).toFixed(2)}`;

  const subscriptionStatus = isFreeTrialActive
    ? 'Free Trial Active (15 Min)'
    : (isSubscribed || (currentPlan?.tier && currentPlan.tier !== 'free'))
    ? (currentPlan?.tier === 'business_b2b' || currentPlan?.tier === 'enterprise'
        ? 'B2B Enterprise Plan'
        : currentPlan?.tier === 'langpretation_pro'
        ? 'Langpretation Pro Plan'
        : 'Individual Premium Plan')
    : 'Free Basic Tier (Pay-As-You-Go)';

  const handleCopyNvId = () => {
    navigator.clipboard.writeText(nvId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleExecuteIncreaseValue = async () => {
    setIsProcessingAction(true);
    try {
      const token = localStorage.getItem('nanivio_auth_token');
      await fetch('/api/billing/topup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ amount: increaseAmount, currency: 'GHS' }),
      });
      await refreshBilling();
      setActionSuccessMessage(`Successfully added GH₵ ${increaseAmount.toFixed(2)} to your Nanivio Service Value.`);
      setShowIncreaseValueModal(false);
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleExecuteTransferValue = async () => {
    if (!transferRecipient.trim() || transferAmount <= 0) return;
    setIsProcessingAction(true);
    try {
      const token = localStorage.getItem('nanivio_auth_token');
      await fetch('/api/billing/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          recipientNvId: transferRecipient.trim(),
          amount: transferAmount,
          currency: 'GHS',
        }),
      });
      await refreshBilling();
      setActionSuccessMessage(`Transferred GH₵ ${transferAmount.toFixed(2)} Service Value to ${transferRecipient.trim()}.`);
      setShowTransferValueModal(false);
      setTransferRecipient('');
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessingAction(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-full overflow-x-hidden">
      {/* Toast Feedback */}
      {actionSuccessMessage && (
        <div className="p-4 rounded-2xl bg-emerald-950/90 border border-emerald-500 text-emerald-200 text-sm font-semibold flex items-center gap-3 shadow-xl animate-in fade-in duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SECTION 1: GLOBAL NV IDENTITY & PROFILE CARD */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-gradient-to-r from-[#0c182c] via-[#091526] to-[#070d18] border border-emerald-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-emerald-500/60 shadow-2xl bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 flex items-center justify-center">
                {currentUser.avatar ? (
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-2xl font-bold font-mono text-emerald-400">
                    {currentUser.initials || currentUser.name?.slice(0, 2).toUpperCase() || 'NV'}
                  </span>
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 text-base bg-slate-950 rounded-full px-1 border border-slate-800 shadow-md">
                {appLangInfo.flag}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">{currentUser.name}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
                  {role === 'ADMIN' ? 'Administrator' : 'Global Member'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border bg-emerald-950/80 text-emerald-300 border-emerald-500/50">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>{verificationStatus}</span>
                </span>
              </div>

              <p className="text-xs text-slate-400">
                {currentUser.email} • {currentUser.phoneNumber || '+233 24 412 3456'}
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-900 border border-emerald-500/40 text-xs shadow-inner">
                  <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-[11px] text-slate-400 font-medium">Interface:</span>
                  <select
                    id="select-account-interface-language"
                    value={appLanguage || 'en'}
                    onChange={(e) => {
                      const newCode = e.target.value;
                      setAppLanguage(newCode);
                      setMyLanguage(newCode as any);
                    }}
                    className="bg-transparent text-emerald-300 font-bold text-xs border-none outline-none cursor-pointer pr-1"
                  >
                    {getAllLanguages()
                      .filter((l) => l.ui)
                      .map((l) => (
                        <option key={l.code} value={l.code} className="bg-slate-900 text-white">
                          {l.flag} {l.name}
                        </option>
                      ))}
                  </select>
                </div>

                <button
                  onClick={() => setIsLanguageModalOpen(true)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 underline font-semibold px-1 cursor-pointer"
                >
                  Configure Languages
                </button>
              </div>
            </div>
          </div>

          {/* NV Number Card */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="bg-slate-950/90 border border-emerald-500/40 rounded-2xl p-3.5 px-4 shadow-lg flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                  <Fingerprint className="w-3 h-3 text-emerald-400" />
                  <span>Your NV Number</span>
                </div>
                <div className="text-base font-black font-mono text-emerald-300 tracking-wider">
                  {nvId}
                </div>
              </div>

              <button
                onClick={handleCopyNvId}
                className="px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold border border-emerald-500/40 transition-all flex items-center gap-1 cursor-pointer"
              >
                {copiedId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedId ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditProfileModalOpen(true)}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 cursor-pointer"
              >
                Edit Profile
              </button>
              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={() => signOut()}
                className="p-2.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-500/40 cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 2: PREMIUM LIVE LANGPRETATION METER READING */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <LangpretationIcon size={20} />
              <h2 className="text-xl font-bold text-white">Live Langpretation Meter Reading</h2>
            </div>
            <p className="text-xs text-slate-400">
              Live communication consumption &amp; included monthly Langpretation allowance meter.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold self-start sm:self-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{subscriptionStatus}</span>
          </div>
        </div>

        {/* 4 Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Remaining Allowance
            </div>
            <div className="text-2xl font-black font-mono text-emerald-400">
              {remainingMinutes} min
            </div>
            <div className="text-[11px] text-slate-500">Live available translation time</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Monthly Quota
            </div>
            <div className="text-2xl font-black font-mono text-white">
              {totalQuotaMinutes} min
            </div>
            <div className="text-[11px] text-slate-500">Included monthly allowance</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Minutes Used
            </div>
            <div className="text-2xl font-black font-mono text-cyan-400">
              {minutesUsed} min
            </div>
            <div className="text-[11px] text-slate-500">Consumed in current cycle</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Estimated Savings
            </div>
            <div className="text-2xl font-black font-mono text-amber-300">
              {estimatedSavings}
            </div>
            <div className="text-[11px] text-slate-500">Vs. traditional live interpreting</div>
          </div>
        </div>

        {/* Visual Progress Meter */}
        <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-semibold">Allowance Consumption Meter</span>
            <span className="font-mono text-emerald-400 font-bold">{percentConsumed}% Consumed ({minutesUsed} / {totalQuotaMinutes} min)</span>
          </div>

          <div className="w-full h-3.5 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/80">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                percentConsumed > 80
                  ? 'bg-gradient-to-r from-amber-500 to-red-500'
                  : 'bg-gradient-to-r from-teal-500 to-emerald-400'
              }`}
              style={{ width: `${Math.max(4, percentConsumed)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>0 min used</span>
            <span className="text-emerald-400 font-medium">Subscription allowance active</span>
            <span>{totalQuotaMinutes} min max</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 3: NANIVIO SERVICE VALUE (Available Value, Increase, Transfer) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-emerald-400" />
              <h2 className="text-xl font-bold text-white">Nanivio Service Value</h2>
            </div>
            <p className="text-xs text-slate-400">
              Your available value for consuming Nanivio communication services, Langpretation fallback, and expert consultations.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowIncreaseValueModal(true)}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Increase Value</span>
            </button>

            <button
              onClick={() => setShowTransferValueModal(true)}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-all border border-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Transfer Value</span>
            </button>
          </div>
        </div>

        {/* Value Balance Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-slate-950 border border-emerald-500/40 space-y-2">
            <div className="text-xs text-slate-400">Available Nanivio Service Value</div>
            <div className="text-3xl font-black font-mono text-emerald-400">
              GH₵ {availableServiceValue.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-400">
              ≈ ${(availableServiceValue / 15.5).toFixed(2)} USD equivalent
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="text-xs text-slate-400">Fallback Protection</div>
            <div className="text-sm font-bold text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Auto-Switch Enabled</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              When subscription minutes expire, Service Value keeps your active calls and Langpretation alive uninterrupted.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="text-xs text-slate-400">Verified Payment Partner</div>
            <div className="text-sm font-bold text-white flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-cyan-400" />
              <span>Paystack Secured</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Cards, Mobile Money, and bank channels with immediate verification and top-up.
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 4: SUBSCRIPTION MANAGEMENT */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl font-bold text-white">Communication Subscription</h2>
            </div>
            <p className="text-xs text-slate-400">
              Monthly communication plans with included Langpretation minutes and zero carrier roaming fees.
            </p>
          </div>

          <span className="text-xs font-bold text-emerald-400 bg-emerald-500/20 px-3 py-1 rounded-full border border-emerald-500/40 self-start sm:self-auto">
            Active Renewal
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {USER_PLANS.map((plan) => {
            const isCurrent = currentPlan?.tier === plan.tier;
            return (
              <div
                key={plan.tier}
                className={`p-5 rounded-2xl border transition-all space-y-4 flex flex-col justify-between ${
                  isCurrent
                    ? 'bg-slate-950 border-emerald-500 shadow-lg shadow-emerald-500/10'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white text-base">{plan.name}</h3>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                        Current
                      </span>
                    )}
                  </div>

                  <div className="text-2xl font-black text-white font-mono">
                    GH₵ {plan.monthlyPriceGHS}
                    <span className="text-xs text-slate-400 font-sans font-normal"> / month</span>
                  </div>

                  <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    <span>{plan.langpretationMinutesQuota} Langpretation Minutes Included</span>
                  </div>

                  <ul className="space-y-1.5 text-xs text-slate-400 pt-2 border-t border-slate-800">
                    {plan.features.slice(0, 4).map((f, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  disabled={isCurrent}
                  onClick={() => changePlan(plan.tier)}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-slate-800 text-slate-400 cursor-default'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-sm'
                  }`}
                >
                  {isCurrent ? 'Current Plan' : `Switch to ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 5: PAYMENT & USAGE HISTORY */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">Service Value &amp; Usage History</h2>
          </div>
          <span className="text-xs text-slate-400">Past transactions and consumption</span>
        </div>

        <div className="space-y-2">
          {billingSummary?.recentTransactions && billingSummary.recentTransactions.length > 0 ? (
            billingSummary.recentTransactions.map((tx: any) => (
              <div
                key={tx.id}
                className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-4 text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
                    tx.type === 'TOPUP' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {tx.type === 'TOPUP' ? '+' : '–'}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{tx.description}</div>
                    <div className="text-[11px] text-slate-500">
                      {new Date(tx.timestamp).toLocaleDateString()} at {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
                <div className={`font-mono font-bold ${tx.type === 'TOPUP' ? 'text-emerald-400' : 'text-slate-300'}`}>
                  {tx.type === 'TOPUP' ? '+' : '–'} GH₵ {tx.amount.toFixed(2)}
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 rounded-2xl bg-slate-950/80 border border-slate-800 text-center space-y-2">
              <History className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-300 font-semibold">No usage history yet</p>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                Live transaction history, top-ups, and Langpretation calls will record here automatically.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: INCREASE VALUE */}
      {/* ------------------------------------------------------------- */}
      {showIncreaseValueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-white">Increase Nanivio Service Value</h3>
              </div>
              <button
                onClick={() => setShowIncreaseValueModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Select or enter the amount you wish to add to your Nanivio Service Value for communication and Langpretation.
            </p>

            <div className="grid grid-cols-3 gap-2">
              {[20, 50, 100].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setIncreaseAmount(amt)}
                  className={`py-3 rounded-2xl border text-sm font-bold font-mono transition-all cursor-pointer ${
                    increaseAmount === amt
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                      : 'bg-slate-950 text-slate-200 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  GH₵ {amt}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Custom Amount (GH₵)</label>
              <input
                type="number"
                min="5"
                value={increaseAmount}
                onChange={(e) => setIncreaseAmount(Math.max(5, Number(e.target.value)))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 px-4 text-white font-mono font-bold text-lg focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Instant credit via Paystack. Funds apply immediately to your NV identity.</span>
            </div>

            <button
              disabled={isProcessingAction}
              onClick={handleExecuteIncreaseValue}
              className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isProcessingAction ? 'Crediting Value...' : `Pay GH₵ ${increaseAmount.toFixed(2)} & Increase Value`}
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: TRANSFER VALUE */}
      {/* ------------------------------------------------------------- */}
      {showTransferValueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-white">Transfer Nanivio Service Value</h3>
              </div>
              <button
                onClick={() => setShowTransferValueModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Transfer Service Value directly to any registered Nanivio user using their NV Number.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Recipient NV Number</label>
              <input
                type="text"
                placeholder="e.g. 0486829104 or NV-839210"
                value={transferRecipient}
                onChange={(e) => setTransferRecipient(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 px-4 text-white font-mono text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Amount to Transfer (GH₵)</label>
              <input
                type="number"
                min="1"
                max={availableServiceValue}
                value={transferAmount}
                onChange={(e) => setTransferAmount(Math.max(1, Number(e.target.value)))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 px-4 text-white font-mono font-bold text-lg focus:outline-none focus:border-emerald-500"
              />
              <div className="text-[11px] text-slate-500">
                Available Value: GH₵ {availableServiceValue.toFixed(2)}
              </div>
            </div>

            <button
              disabled={isProcessingAction || !transferRecipient.trim() || transferAmount > availableServiceValue}
              onClick={handleExecuteTransferValue}
              className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isProcessingAction ? 'Transferring Value...' : `Transfer GH₵ ${transferAmount.toFixed(2)} Service Value`}
            </button>
          </div>
        </div>
      )}

      {/* Profile & Settings Modals */}
      {isEditProfileModalOpen && (
        <EditProfileModal
          isOpen={isEditProfileModalOpen}
          onClose={() => setIsEditProfileModalOpen(false)}
        />
      )}
      {isSettingsModalOpen && (
        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
        />
      )}
    </div>
  );
};
