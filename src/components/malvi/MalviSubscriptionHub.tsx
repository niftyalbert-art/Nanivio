import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Check,
  CreditCard,
  ShieldCheck,
  Bot,
  Video,
  AlertCircle,
  ExternalLink,
  RefreshCw,
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
  const [currency, setCurrency] = useState<'GHS' | 'USD'>('USD');
  const [selectedTier, setSelectedTier] = useState<MalviSubscriptionTier>(highlightTier || 'malvi_premium');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Paystack Modal State
  const [isPaystackOpen, setIsPaystackOpen] = useState<boolean>(false);
  const [paystackTier, setPaystackTier] = useState<MalviSubscriptionTier>('malvi_premium');
  const [paystackAmount, setPaystackAmount] = useState<number>(0);
  const [isRefreshingPlans, setIsRefreshingPlans] = useState(false);

  if (!isOpen) return null;

  const plans: MalviSubscriptionPlan[] = malviPlans;

  const currentTier = malviSubscription?.tier || 'free';
  const commWallet = wallets.find((w) => w.currency === currency);
  const availableServiceValue = typeof commWallet?.balance === 'number' && Number.isFinite(commWallet.balance) ? commWallet.balance : 0;

  const getPlanPrice = (plan: MalviSubscriptionPlan) => {
    const amount = billingCycle === 'ANNUAL'
      ? (currency === 'USD' ? plan.priceAnnualUSD : plan.priceAnnualGHS)
      : (currency === 'USD' ? plan.priceMonthlyUSD : plan.priceMonthlyGHS);
    if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
    if (plan.tier === 'free' && amount === 0) return 0;
    if (currency === 'GHS') {
      const conversion = plan.currencyConversion;
      if (!conversion || !Number.isFinite(conversion.rate) || conversion.rate <= 0 ||
          !Number.isFinite(Date.parse(conversion.expiresAt)) || Date.parse(conversion.expiresAt) <= Date.now()) return null;
    }
    return amount;
  };

  const refreshPlans = async () => {
    setIsRefreshingPlans(true);
    setErrorMessage(null);
    try {
      await refreshBilling();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Plan catalogue refresh failed. Try again.');
    } finally {
      setIsRefreshingPlans(false);
    }
  };

  const handleSelectPlan = async (plan: MalviSubscriptionPlan) => {
    setSelectedTier(plan.tier);
    setErrorMessage(null);
    const price = getPlanPrice(plan);
    if (price === null) {
      setErrorMessage(`The ${currency} price or current exchange-rate quote is unavailable. Reload the plan catalogue before selecting this plan.`);
      return;
    }

    if (plan.tier === 'free') {
      if (price !== 0) {
        setErrorMessage('The Free plan price is unavailable or invalid. Reload the plan catalogue before selecting it.');
        return;
      }
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

    if (price <= 0) {
      setErrorMessage('This paid plan has no valid positive price in the selected currency. Reload the plan catalogue before continuing.');
      return;
    }

    // Check if user has sufficient Malvi AI Ecosystem credit
    if (availableServiceValue >= price) {
      // User can pay via Nanivio credit; the Malvi AI Ecosystem credit entitlement is funded from it
      try {
        setIsProcessing(true);
        await subscribeMalviPlan(plan.tier, billingCycle, 'SERVICE_VALUE', currency);
        setSuccessMessage(`Successfully subscribed to ${plan.name} via Nanivio credit!`);
        if (onSuccess) onSuccess();
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to activate Malvi subscription via Nanivio credit');
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
                Malvi operates independently from Langpretation and Communication subscriptions. Browse the currently published plans and their catalogue descriptions.
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
                  {malviSubscription?.videoMinutesRemaining ?? 0} mins remaining
                </span>
                <span className="text-slate-500">
                  {' '}(of {malviSubscription?.videoMinutesAllowed ?? 0}m)
                </span>
              </div>
              <div>
                <span className="text-slate-400">Voice Interaction: </span>
                <span className="font-bold text-cyan-300">{malviSubscription?.voiceMinutesRemaining ?? 0} mins remaining</span>
                <span className="text-slate-500"> {' '}(of {malviSubscription?.voiceMinutesAllowed ?? 0}m)</span>
              </div>
              <div className="hidden sm:block text-slate-600">|</div>
              <div>
                <span className="text-slate-400">Malvi AI Ecosystem credit: </span>
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
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex flex-wrap items-center gap-2" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{errorMessage}</span>
              <button type="button" disabled={isRefreshingPlans} onClick={() => void refreshPlans()} className="min-h-9 rounded-lg border border-amber-400/40 px-3 font-bold text-amber-100 hover:bg-amber-400/10 disabled:opacity-50">
                {isRefreshingPlans ? 'Refreshing…' : 'Reload catalogue'}
              </button>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {currency === 'GHS' && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs leading-5 text-slate-300" role="status">
              <p className="font-semibold text-slate-100">GHS prices are derived from USD using the current server exchange-rate quote.</p>
              <p className="mt-1">Each plan card shows its quote source and as-of date. If a quote has expired, reload the catalogue before selecting or paying.</p>
            </div>
          )}

          {plans.length === 0 ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5" role="status">
              <p className="font-bold text-amber-100">Malvi plans are unavailable</p>
              <p className="mt-1 text-sm leading-5 text-amber-100/75">No published plan catalogue is available right now. Refresh to try loading the live catalogue; no sample prices or plans are shown.</p>
              <button type="button" disabled={isRefreshingPlans} onClick={() => void refreshPlans()} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-500/40 bg-slate-950/60 px-4 text-sm font-bold text-amber-100 hover:bg-slate-900 disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${isRefreshingPlans ? 'animate-spin' : ''}`} aria-hidden="true" /> {isRefreshingPlans ? 'Refreshing catalogue…' : 'Refresh plans'}
              </button>
            </div>
          ) : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan) => {
              const isCurrent = currentTier === plan.tier;
              const price = getPlanPrice(plan);
              const isFree = plan.tier === 'free';
              const canSelect = price !== null && (isFree ? price === 0 : price > 0);
              const priceDisplay = price === null || (!isFree && price <= 0)
                ? 'Price unavailable'
                : isFree
                ? 'Free'
                : currency === 'USD'
                ? `$${price.toFixed(2)} / ${billingCycle === 'ANNUAL' ? 'year' : 'month'}`
                : `GH₵ ${price.toFixed(2)} / ${billingCycle === 'ANNUAL' ? 'year' : 'month'}`;
              const conversion = plan.currencyConversion;
              const conversionFresh = Boolean(conversion && Number.isFinite(conversion.rate) && conversion.rate > 0 &&
                Number.isFinite(Date.parse(conversion.expiresAt)) && Date.parse(conversion.expiresAt) > Date.now());

              return (
                <div
                  key={plan.tier}
                  className={`min-w-0 p-5 rounded-2xl border flex flex-col justify-between space-y-4 transition-all relative ${
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
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 break-words [overflow-wrap:anywhere] text-xs font-bold uppercase font-mono text-cyan-400">
                          {plan.name}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="break-words text-2xl font-black text-white font-mono">
                        {priceDisplay}
                      </div>
                      {currency === 'GHS' && conversion && (
                        <div className="space-y-0.5 text-[10px] leading-4 text-slate-500">
                          <p>FX source: {conversion.source}</p>
                          <p>As of: {conversion.asOf}{!conversionFresh ? ' · expired; reload before checkout' : ''}</p>
                          {conversion.attributionUrl && <a href={conversion.attributionUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 text-cyan-300 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                            Exchange-rate attribution <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>}
                        </div>
                      )}
                      {currency === 'GHS' && !conversion && <p className="text-[10px] leading-4 text-amber-200">Exchange-rate source details are unavailable. Reload before using GHS.</p>}
                      <p className="break-words text-xs text-slate-400 leading-relaxed min-h-[36px]">
                        {plan.description}
                      </p>
                    </div>

                    {/* Allowance Badge */}
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-white font-bold">
                        <Video className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{plan.videoInteractionMinutesLimit} video interaction mins</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {plan.voiceInteractionMinutesLimit ?? 0} Voice Interaction Mins
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {plan.voiceCapabilities}
                      </div>
                      <div className="text-[10px] text-slate-400">{plan.langpretationCapabilities}</div>
                      <div className="text-[10px] text-slate-400">{plan.aiInteractionCapabilities}</div>
                    </div>

                    {/* Included Features */}
                    <div className="space-y-2 pt-1 text-xs">
                      <div className="text-[11px] font-bold uppercase text-slate-400 font-mono">
                        Included Capabilities
                      </div>
                      {(plan.features ?? []).map((feat, idx) => (
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
                        disabled={isProcessing || !canSelect}
                        onClick={() => handleSelectPlan(plan)}
                        className="w-full py-2.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition cursor-pointer"
                      >
                        Select Free plan
                      </button>
                    ) : (
                      <>
                        <button
                        disabled={isProcessing || !canSelect}
                          onClick={() => {
                          if (price === null || price <= 0) {
                            setErrorMessage(`The ${currency} price or current exchange-rate quote is unavailable. Reload the plan catalogue before checkout.`);
                            return;
                          }
                            setPaystackTier(plan.tier);
                          setPaystackAmount(price);
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
                            disabled={isProcessing || !canSelect}
                            onClick={() => handleSelectPlan(plan)}
                            className="flex-1 py-1.5 rounded-xl font-medium text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                            title="Pay using Nanivio credit balance for Malvi AI Ecosystem credit"
                          >
                            Malvi AI Ecosystem credit
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
          </div>}

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
          catalogVersion={plans.find(plan => plan.tier === paystackTier)?.catalogVersion}
          billingCycle={billingCycle}
        />
      )}
    </>
  );
};
