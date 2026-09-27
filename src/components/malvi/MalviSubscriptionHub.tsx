import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Check,
  Zap,
  CreditCard,
  ShieldCheck,
  Bot,
  Video,
  Mic,
  Globe,
  Building2,
  Users,
  AlertCircle,
  Clock,
  ArrowRight,
  ExternalLink,
  Wallet,
  Star,
  Award,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNanivio } from '../../context/NanivioContext';
import { MalviSubscriptionPlan, MalviSubscriptionTier } from '../../types/billing';
import { PaystackTopUpModal } from '../billing/PaystackTopUpModal';

interface MalviSubscriptionHubProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  highlightTier?: MalviSubscriptionTier;
}

export const MalviSubscriptionHub: React.FC<MalviSubscriptionHubProps> = ({
  isOpen,
  onClose,
  onSuccess,
  highlightTier,
}) => {
  const {
    malviPlans,
    malviSubscription,
    subscribeMalviPlan,
    wallets,
    refreshBilling,
    openBillingWithPlan,
    setActiveTab,
  } = useNanivio();

  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [currency, setCurrency] = useState<'GHS' | 'USD'>('GHS');
  const [selectedTier, setSelectedTier] = useState<MalviSubscriptionTier>(highlightTier || 'malvi_premium');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Paystack Modal State
  const [isPaystackOpen, setIsPaystackOpen] = useState<boolean>(false);
  const [paystackTier, setPaystackTier] = useState<MalviSubscriptionTier>('malvi_premium');
  const [paystackAmount, setPaystackAmount] = useState<number>(220);

  if (!isOpen) return null;

  const plans: MalviSubscriptionPlan[] =
    malviPlans.length > 0
      ? malviPlans
      : [
          {
            id: 'malvi_free',
            tier: 'free',
            name: 'Malvi Free Experience',
            tagline: 'Trial AI voice and video companion',
            description: 'Experience Malvi conversation with 3 limited trial minutes for interactive video companion',
            priceMonthlyUSD: 0,
            priceMonthlyGHS: 0,
            priceAnnualUSD: 0,
            priceAnnualGHS: 0,
            videoInteractionMinutesLimit: 3,
            voiceCapabilities: 'Basic Voice Inquiries',
            langpretationCapabilities: 'Standard phrase translations',
            aiInteractionCapabilities: 'Fundamental Q&A and Nanivio navigation',
            avatarInteractive: true,
            businessCollaboration: false,
            features: [
              '3-Minute Free Trial for Interactive Video Companion',
              'Fundamental text inquiries & navigation assistance',
              'Basic language translation assistance',
              'Platform guidance for Nanivio services',
            ],
            unavailableFeatures: [
              'Extended video avatar interaction (Locked after 3 mins)',
              'Continuous natural voice conversation',
              'Real-time Langpretation assistance during live calls',
              'Personalized context-aware memory retention',
              'Malvi Business collaborative online team sessions',
            ],
          },
          {
            id: 'malvi_basic',
            tier: 'malvi_basic',
            name: 'Malvi Basic',
            tagline: 'Essential AI communication companion',
            description: 'Fundamental AI communication functionality: Voice-based communication, basic AI conversation, Langpretation assistance, and text interaction',
            priceMonthlyUSD: 4.99,
            priceMonthlyGHS: 75.0,
            priceAnnualUSD: 49.0,
            priceAnnualGHS: 750.0,
            videoInteractionMinutesLimit: 30,
            voiceCapabilities: 'Voice-based communication with Malvi',
            langpretationCapabilities: 'Basic Langpretation assistance',
            aiInteractionCapabilities: 'Conversational task and information assistance',
            avatarInteractive: true,
            businessCollaboration: false,
            features: [
              'Voice-based communication with Malvi',
              'Basic AI conversation and reasoning',
              'Basic Langpretation assistance & translation prompts',
              'Basic text interaction and task assistance',
              'Natural communication through supported voice interfaces',
              '30 monthly interactive video companion minutes',
            ],
            unavailableFeatures: [
              'Real-time voice interaction during live phone & video calls',
              'Full human-like continuous live avatar streaming',
              'Malvi Business multi-user corporate collaboration rooms',
              'Executive summary & strategy decision support',
            ],
          },
          {
            id: 'malvi_premium',
            tier: 'malvi_premium',
            name: 'Malvi Premium',
            tagline: 'Advanced AI companion with interactive human-like avatar',
            description: 'Substantially expanded interaction capabilities: natural voice conversation, real-time Langpretation assistance, interactive onscreen AI companion/avatar, and personalized intelligence',
            priceMonthlyUSD: 14.99,
            priceMonthlyGHS: 220.0,
            priceAnnualUSD: 149.0,
            priceAnnualGHS: 2200.0,
            videoInteractionMinutesLimit: 300,
            voiceCapabilities: 'Continuous natural voice with emotional intonation',
            langpretationCapabilities: 'Real-time simultaneous Langpretation assistance',
            aiInteractionCapabilities: 'Context-aware intelligence & in-call active assistance',
            avatarInteractive: true,
            businessCollaboration: false,
            isPopular: true,
            features: [
              'Interactive human-like AI companion / avatar on screen with natural interaction',
              'Natural, continuous voice conversation with zero awkward pauses',
              'Real-time Langpretation assistance during supported voice and video calls',
              'Advanced conversational intelligence with rich, context-aware memory',
              'Personalized conversations adapting to your dialect & communication preferences',
              '300 monthly interactive video companion minutes',
              'Priority neural response routing with sub-second latency',
              'Advanced productivity & daily concierge assistance',
            ],
            unavailableFeatures: [
              'Multi-user corporate team brainstorming sessions',
              'Organization-wide pooled seats and corporate trade corridor desks',
            ],
          },
          {
            id: 'malvi_business',
            tier: 'malvi_business',
            name: 'Malvi Business',
            tagline: 'Collaborative AI environment for companies, teams & professionals',
            description: 'Dedicated business collaboration environment where real team members participate together and Malvi joins online group sessions as an active AI participant for brainstorming, strategy, and decision support',
            priceMonthlyUSD: 49.99,
            priceMonthlyGHS: 750.0,
            priceAnnualUSD: 490.0,
            priceAnnualGHS: 7500.0,
            videoInteractionMinutesLimit: 1500,
            voiceCapabilities: 'Multi-party voice conference & presentation assistance',
            langpretationCapabilities: 'Enterprise multilateral multi-dialect corporate Langpretation',
            aiInteractionCapabilities: 'Team brainstorming, SWOT, meeting summaries & action items',
            avatarInteractive: true,
            businessCollaboration: true,
            features: [
              'Genuine AI-assisted business collaboration environment with online team sessions',
              'Malvi joins real team group sessions as an active participant and co-pilot',
              'Business idea development, planning discussions, and structured brainstorming',
              'Meeting participation, live idea analysis, clarification, and critical questioning',
              'Business strategy discussions, proposal drafting, and decision-support records',
              'Automatic meeting summaries, key takeaways, and assignable action items',
              'Team Q&A sessions and persistent enterprise knowledge assistance',
              '1,500 monthly interactive video & conference assistant minutes',
              'Multi-party simultaneous Langpretation across African and global trade corridors',
            ],
          },
        ];

  const currentTier = malviSubscription?.tier || 'free';
  const commWallet = wallets.find((w) => w.currency === currency);
  const availableServiceValue = commWallet?.balance || 0;

  const handleSelectPlan = async (plan: MalviSubscriptionPlan) => {
    setSelectedTier(plan.tier);
    setErrorMessage(null);

    if (plan.tier === 'free') {
      try {
        setIsProcessing(true);
        await subscribeMalviPlan('free', 'MONTHLY', 'SERVICE_VALUE', currency);
        setSuccessMessage('Switched to Malvi Free Experience.');
        if (onSuccess) onSuccess();
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to switch to free plan');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    const price =
      billingCycle === 'ANNUAL'
        ? currency === 'USD'
          ? plan.priceAnnualUSD
          : plan.priceAnnualGHS
        : currency === 'USD'
        ? plan.priceMonthlyUSD
        : plan.priceMonthlyGHS;

    // Check if user has sufficient Nanivio Service Value
    if (availableServiceValue >= price) {
      // User can pay via Nanivio Service Value
      try {
        setIsProcessing(true);
        await subscribeMalviPlan(plan.tier, billingCycle, 'SERVICE_VALUE', currency);
        setSuccessMessage(`Successfully subscribed to ${plan.name} via Nanivio Service Value!`);
        if (onSuccess) onSuccess();
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to activate Malvi subscription via Service Value');
      } finally {
        setIsProcessing(false);
      }
    } else {
      // Direct user to Paystack checkout modal
      setPaystackTier(plan.tier);
      setPaystackAmount(price);
      setIsPaystackOpen(true);
    }
  };

  const handlePaystackSuccess = async () => {
    setIsPaystackOpen(false);
    await refreshBilling();
    setSuccessMessage('Paystack payment verified! Malvi subscription activated.');
    if (onSuccess) onSuccess();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="bg-[#0b1424] border border-cyan-500/40 rounded-3xl p-5 sm:p-7 max-w-6xl w-full shadow-2xl space-y-6 my-auto max-h-[94vh] overflow-y-auto"
        >
          {/* Top Header */}
          <div className="flex items-start justify-between border-b border-slate-800 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-mono font-bold border border-cyan-500/30">
                  Dedicated Malvi Hub
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Independent AI Companion &amp; Collaboration Platform
                </span>
              </div>
              <h2 className="text-xl sm:text-3xl font-black text-white flex items-center gap-2">
                <span>Malvi Subscription Hub</span>
                <Sparkles className="w-6 h-6 text-amber-400" />
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-3xl">
                Malvi operates independently from Langpretation and Communication subscriptions. Choose your plan to unlock on-screen interactive companion video, real-time in-call assistance, and Malvi Business team collaboration.
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Current Status Strip */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="font-mono text-slate-400">Current Malvi Plan</div>
                <div className="text-base font-bold text-white flex items-center gap-2">
                  <span>{malviSubscription?.planName || 'Malvi Free Experience'}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                    {malviSubscription?.status || 'TRIAL'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div>
                <span className="text-slate-400">Video Interaction: </span>
                <span className="font-bold text-emerald-400">
                  {malviSubscription?.videoMinutesRemaining ?? 3} mins remaining
                </span>
                <span className="text-slate-500">
                  {' '}(of {malviSubscription?.videoMinutesAllowed ?? 3}m)
                </span>
              </div>
              <div className="hidden sm:block text-slate-600">|</div>
              <div>
                <span className="text-slate-400">Service Value: </span>
                <span className="font-bold text-white">
                  {currency === 'USD' ? `$${availableServiceValue.toFixed(2)}` : `GH₵ ${availableServiceValue.toFixed(2)}`}
                </span>
              </div>
            </div>
          </div>

          {/* Billing Cycle & Currency Switchers */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800">
            {/* Monthly / Annual Toggle */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
              <button
                onClick={() => setBillingCycle('MONTHLY')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  billingCycle === 'MONTHLY'
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Monthly Billing
              </button>
              <button
                onClick={() => setBillingCycle('ANNUAL')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  billingCycle === 'ANNUAL'
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Annual Billing</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200 font-mono font-bold">
                  20% OFF
                </span>
              </button>
            </div>

            {/* Currency Toggle */}
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-slate-400">Currency:</span>
              <button
                onClick={() => setCurrency('GHS')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  currency === 'GHS'
                    ? 'bg-slate-800 text-emerald-400 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                GH₵ (GHS)
              </button>
              <button
                onClick={() => setCurrency('USD')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  currency === 'USD'
                    ? 'bg-slate-800 text-emerald-400 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                $ (USD)
              </button>
            </div>
          </div>

          {/* Messages */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* 4-Tier Plan Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan) => {
              const isCurrent = currentTier === plan.tier;
              const priceDisplay =
                plan.tier === 'free'
                  ? 'Free Trial'
                  : billingCycle === 'ANNUAL'
                  ? currency === 'USD'
                    ? `$${plan.priceAnnualUSD}/yr`
                    : `GH₵ ${plan.priceAnnualGHS}/yr`
                  : currency === 'USD'
                  ? `$${plan.priceMonthlyUSD}/mo`
                  : `GH₵ ${plan.priceMonthlyGHS}/mo`;

              return (
                <div
                  key={plan.tier}
                  className={`p-5 rounded-2xl border flex flex-col justify-between space-y-4 transition-all relative ${
                    plan.isPopular
                      ? 'bg-gradient-to-b from-cyan-950/40 to-slate-950 border-cyan-500/80 shadow-xl shadow-cyan-500/20 ring-1 ring-cyan-500/50'
                      : isCurrent
                      ? 'bg-emerald-950/30 border-emerald-500/60 shadow-lg'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {plan.isPopular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 text-[10px] font-bold font-mono uppercase tracking-wider shadow-md">
                      Most Popular
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase font-mono text-cyan-400">
                          {plan.name}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="text-2xl font-black text-white font-mono">
                        {priceDisplay}
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed min-h-[36px]">
                        {plan.description}
                      </p>
                    </div>

                    {/* Allowance Badge */}
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-white font-bold">
                        <Video className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{plan.videoInteractionMinutesLimit} Video Avatar Mins</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {plan.voiceCapabilities}
                      </div>
                    </div>

                    {/* Included Features */}
                    <div className="space-y-2 pt-1 text-xs">
                      <div className="text-[11px] font-bold uppercase text-slate-400 font-mono">
                        Included Capabilities
                      </div>
                      {plan.features.map((feat, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-slate-300">
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5 stroke-[3]" />
                          <span className="leading-tight text-[11px]">{feat}</span>
                        </div>
                      ))}
                    </div>

                    {/* Explicitly Marked Unavailable Features (No Fake Features!) */}
                    {plan.unavailableFeatures && plan.unavailableFeatures.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-800/80 text-[11px]">
                        <div className="text-[10px] font-bold uppercase text-slate-500 font-mono">
                          Not Included in this Plan
                        </div>
                        {plan.unavailableFeatures.map((ufeat, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-slate-500">
                            <X className="w-3 h-3 text-slate-600 shrink-0 mt-0.5" />
                            <span className="leading-tight text-[10px] line-through decoration-slate-700">{ufeat}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 space-y-1.5">
                    {isCurrent ? (
                      <div className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-400 font-bold text-xs text-center border border-slate-700">
                        Active Plan
                      </div>
                    ) : plan.tier === 'free' ? (
                      <button
                        disabled={isProcessing}
                        onClick={() => handleSelectPlan(plan)}
                        className="w-full py-2.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition cursor-pointer"
                      >
                        Select Free Trial
                      </button>
                    ) : (
                      <>
                        <button
                          disabled={isProcessing}
                          onClick={() => {
                            setPaystackTier(plan.tier);
                            setPaystackAmount(
                              billingCycle === 'ANNUAL'
                                ? currency === 'USD'
                                  ? plan.priceAnnualUSD
                                  : plan.priceAnnualGHS
                                : currency === 'USD'
                                ? plan.priceMonthlyUSD
                                : plan.priceMonthlyGHS
                            );
                            setIsPaystackOpen(true);
                          }}
                          className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                            plan.isPopular
                              ? 'bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 shadow-md shadow-cyan-500/20'
                              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow'
                          }`}
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Pay with Paystack (Instant)</span>
                        </button>
                        <div className="flex items-center gap-1.5">
                          <button
                            disabled={isProcessing}
                            onClick={() => handleSelectPlan(plan)}
                            className="flex-1 py-1.5 rounded-xl font-medium text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                            title="Pay using Nanivio Service Value balance"
                          >
                            Service Value
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              openBillingWithPlan(plan.tier, 'MALVI_SUBSCRIPTION', billingCycle);
                            }}
                            className="flex-1 py-1.5 rounded-xl font-medium text-[11px] bg-slate-900 hover:bg-slate-850 text-cyan-300 border border-slate-700 hover:border-cyan-500/40 transition cursor-pointer flex items-center justify-center gap-1"
                            title="Go to Universal Billing Hub to complete"
                          >
                            <span>Billing Hub</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Guarantee */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 pt-3 border-t border-slate-800/80">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Payments verified directly via Paystack API. Zero simulated or fake activation states.</span>
            </div>
            <span className="text-cyan-400 font-mono text-[11px]">End-to-End Cryptographic Security</span>
          </div>
        </motion.div>
      </div>

      {/* Paystack Checkout for Malvi Subscription */}
      {isPaystackOpen && (
        <PaystackTopUpModal
          isOpen={isPaystackOpen}
          onClose={() => setIsPaystackOpen(false)}
          onSuccess={handlePaystackSuccess}
          defaultCurrency={currency}
          initialAmount={paystackAmount}
          purpose="MALVI_SUBSCRIPTION"
          planTier={paystackTier}
          billingCycle={billingCycle}
        />
      )}
    </>
  );
};
