import React from 'react';
import { X, Sparkles, Check, Zap, CreditCard, ShieldCheck } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { USER_PLANS } from '../../data/mockData';
import { PlanTier } from '../../types';
import { PaymentPurpose } from '../payment/UniversalPaymentGatewayModal';

interface SubscriptionPlansModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPayment: (purpose: PaymentPurpose) => void;
}

export const SubscriptionPlansModal: React.FC<SubscriptionPlansModalProps> = ({
  isOpen,
  onClose,
  onSelectPayment,
}) => {
  const { currentPlan, setActiveTab, wallets, openBillingWithPlan } = useNanivio();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-[#0b1424] border border-slate-700 rounded-3xl p-5 sm:p-7 max-w-5xl w-full shadow-2xl space-y-6 my-auto max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-mono font-bold border border-emerald-500/30">
                Membership &amp; Langpretation Plans
              </span>
              <span className="text-xs text-slate-400 font-mono">Real-Time Speech Telecommunications</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white">Choose Your Plan &amp; Quota</h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Unlock unlimited HD WebRTC voice &amp; video calling, high-speed multilateral translation, and zero-fee P2P wallet rails.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subscription Tiers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {USER_PLANS.map((plan) => {
            const isCurrent = currentPlan.tier === plan.tier;
            return (
              <div
                key={plan.tier}
                className={`p-5 rounded-2xl border flex flex-col justify-between space-y-4 transition-all ${
                  isCurrent
                    ? 'bg-emerald-950/30 border-emerald-500/60 shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-500/50'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase font-mono text-slate-400">{plan.name}</span>
                    {isCurrent && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-black text-white font-mono">
                    ${plan.monthlyPriceUSD}{' '}
                    <span className="text-xs text-slate-400 font-normal">/mo (GH₵ {plan.monthlyPriceGHS})</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{plan.description}</p>

                  <div className="pt-2 space-y-1.5 text-xs text-slate-300">
                    <div className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                      <span>{plan.langpretationMinutesPerMonth} Langpretation mins</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                      <span>HD WebRTC audio &amp; video</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                      <span>P2P zero-fee remittance</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                      <span>Multilateral translation core</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onClose();
                    // Requirement 1: When a user selects a subscription with a zero Nanivio Service Value requirement, the system should automatically direct the user to the Billing Section to complete payment.
                    const commWallet = wallets.find((w) => w.currency === 'GHS');
                    const balance = commWallet?.balance || 0;
                    if (balance < plan.monthlyPriceGHS || balance <= 0 || plan.monthlyPriceGHS === 0) {
                      openBillingWithPlan(plan.tier, 'SUBSCRIPTION', 'MONTHLY');
                    } else {
                      onSelectPayment({
                        type: 'subscription',
                        tier: plan.tier,
                        cycle: 'MONTHLY',
                        title: `Subscribe to ${plan.name} Plan`,
                        amountUSD: plan.monthlyPriceUSD,
                        amountGHS: plan.monthlyPriceGHS,
                      });
                    }
                  }}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-md shadow-emerald-500/20'
                  }`}
                >
                  {isCurrent ? 'Renew Current Plan' : 'Select Plan & Pay'}
                </button>
              </div>
            );
          })}
        </div>

        {/* On-Demand Minute Bundles */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              On-Demand Minute Top-Up Bundles
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">Instant balance recharge</span>
          </div>
          <p className="text-xs text-slate-400">
            Need extra speech translation quota? Instant top-up directly to your active meter reading.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            {[
              { minutes: 50, costGHS: 35 },
              { minutes: 100, costGHS: 65 },
              { minutes: 250, costGHS: 150 },
              { minutes: 1000, costGHS: 450 },
            ].map((bundle) => (
              <button
                key={bundle.minutes}
                onClick={() => {
                  onClose();
                  onSelectPayment({
                    type: 'minutes',
                    minutes: bundle.minutes,
                    costGHS: bundle.costGHS,
                    title: `Top-Up +${bundle.minutes} Langpretation Minutes`,
                  });
                }}
                className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-850 text-left transition-all space-y-1.5 group cursor-pointer"
              >
                <div className="text-base font-black text-amber-400 font-mono group-hover:scale-105 transition-transform">
                  +{bundle.minutes} Mins
                </div>
                <div className="text-xs font-bold text-white font-mono">GH₵ {bundle.costGHS}.00</div>
                <div className="text-[10px] text-slate-400">Instant meter credit</div>
              </button>
            ))}
          </div>
        </div>

        {/* Security & Gateways Guarantee */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Supported: MTN MoMo, Telecel Cash, Visa, Mastercard, Apple Pay, Google Pay &amp; Wire</span>
          </div>
          <span className="text-emerald-400 font-mono text-[11px]">256-Bit Encrypted Settlement Rails</span>
        </div>
      </div>
    </div>
  );
};
