import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Zap,
  TrendingUp,
  Receipt,
  AlertCircle,
  CheckCircle2,
  Clock,
  Shield,
  Layers,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Gift,
  Search,
  ChevronRight,
  Building2,
  Users,
  FileText,
  DollarSign,
  Globe,
  Sliders,
  Check,
  X,
  HelpCircle,
  Printer,
  Download,
  Flame,
  Activity,
  ArrowRightLeft,
  Send,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNanivio } from '../../context/NanivioContext';
import {
  BillingServiceType,
  BillingSubscriptionPlan,
  BillingInvoice,
  BillingDispute,
  BillingPreviewResponse,
  BusinessBillingAccount,
} from '../../types/billing';
import { billingClient } from '../../lib/billingClient';
import { PaystackTopUpModal } from './PaystackTopUpModal';
import { TransferValueModal } from './TransferValueModal';
import { UniversalFlowTracer } from './UniversalFlowTracer';
import { LiveLangpretationMeter } from './LiveLangpretationMeter';
import { CommunicationMinutesModal } from './CommunicationMinutesModal';

export const UniversalBillingHub: React.FC = () => {
  const {
    billingSummary,
    billingPlans,
    userInvoices,
    userDisputes,
    activeUsageSession,
    refreshBilling,
    previewBillingCharge,
    redeemBillingVoucher,
    createBillingDispute,
    upgradeSubscriptionPlan,
    myLanguage,
    pendingBillingAction,
    setPendingBillingAction,
    malviPlans,
    malviSubscription,
    subscribeMalviPlan,
  } = useNanivio();

  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'flow' | 'plans' | 'malvi' | 'transfer' | 'calculator' | 'invoices' | 'disputes' | 'b2b'>('overview');
  const [isPaystackModalOpen, setIsPaystackModalOpen] = useState<boolean>(false);
  const [paystackConfig, setPaystackConfig] = useState<{
    purpose?: 'COMMUNICATION_TOPUP' | 'SUBSCRIPTION' | 'COMMUNICATION_MINUTES' | 'MALVI_SUBSCRIPTION';
    planTier?: string;
    billingCycle?: 'MONTHLY' | 'ANNUAL';
    amount?: number;
    currency?: string;
    packageId?: string;
    minutes?: number;
  }>({});
  const [isMinutesModalOpen, setIsMinutesModalOpen] = useState<boolean>(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState<boolean>(false);
  const [transferModalMode, setTransferModalMode] = useState<'P2P' | 'INTERNAL'>('P2P');
  const [selectedInvoice, setSelectedInvoice] = useState<BillingInvoice | null>(null);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoStatus, setPromoStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [upgradingTier, setUpgradingTier] = useState<string | null>(null);

  // Automatically handle incoming plan selection routed from elsewhere
  useEffect(() => {
    if (pendingBillingAction) {
      if (pendingBillingAction.subTab) {
        setActiveSubTab(pendingBillingAction.subTab as any);
      }
      if (pendingBillingAction.cycle) {
        setBillingCycle(pendingBillingAction.cycle);
      }
      if (pendingBillingAction.planTier) {
        const tier = pendingBillingAction.planTier;
        const purpose = pendingBillingAction.purpose || 'SUBSCRIPTION';
        const cycle = pendingBillingAction.cycle || 'MONTHLY';

        if (purpose === 'SUBSCRIPTION') {
          const targetPlan = billingPlans.find((p) => p.tier === tier);
          const price = cycle === 'ANNUAL' ? targetPlan?.priceAnnualGHS || 2200 : targetPlan?.priceMonthlyGHS || 220;
          const commBalance = billingSummary?.accounts?.communication?.available || 0;
          if (commBalance < price) {
            setPaystackConfig({
              purpose: 'SUBSCRIPTION',
              planTier: tier,
              billingCycle: cycle,
              amount: price,
              currency: 'GHS',
            });
            setIsPaystackModalOpen(true);
          }
        } else if (purpose === 'MALVI_SUBSCRIPTION') {
          const targetPlan = malviPlans.find((p) => p.tier === tier);
          const price = cycle === 'ANNUAL' ? targetPlan?.priceAnnualGHS || 2200 : targetPlan?.priceMonthlyGHS || 220;
          setPaystackConfig({
            purpose: 'MALVI_SUBSCRIPTION',
            planTier: tier,
            billingCycle: cycle,
            amount: price,
            currency: 'GHS',
          });
          setIsPaystackModalOpen(true);
        }
      }
      setPendingBillingAction(null);
    }
  }, [pendingBillingAction, billingPlans, malviPlans, billingSummary, setPendingBillingAction]);

  // Pre-Action Calculator State
  const [calcService, setCalcService] = useState<BillingServiceType>('LANGPRETATION');
  const [calcMinutes, setCalcMinutes] = useState<number>(15);
  const [calcCurrency, setCalcCurrency] = useState<'GHS' | 'USD'>('GHS');
  const [calcLangpretation, setCalcLangpretation] = useState<boolean>(true);
  const [calcPreview, setCalcPreview] = useState<BillingPreviewResponse | null>(null);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);

  // Dispute Modal State
  const [isDisputeModalOpen, setIsDisputeModalOpen] = useState<boolean>(false);
  const [disputeTxId, setDisputeTxId] = useState<string>('');
  const [disputeReason, setDisputeReason] = useState<string>('LANGPRETATION_ERROR');
  const [disputeNotes, setDisputeNotes] = useState<string>('');
  const [disputeSubmitting, setDisputeSubmitting] = useState<boolean>(false);

  // B2B State
  const [businessAccount, setBusinessAccount] = useState<BusinessBillingAccount | null>(null);

  useEffect(() => {
    billingClient.getBusinessAccount().then(setBusinessAccount).catch(() => {});
  }, []);

  // Update calculation whenever calculator controls change
  useEffect(() => {
    let isMounted = true;
    setIsCalculating(true);
    previewBillingCharge({
      serviceType: calcService,
      usageType: calcService === 'LANGPRETATION' ? 'LANGPRETATION_MINUTES' : 'CALL_MINUTES',
      estimatedQuantity: calcMinutes,
      currency: calcCurrency,
      withLangpretation: calcLangpretation,
    })
      .then((res) => {
        if (isMounted) {
          setCalcPreview(res);
          setIsCalculating(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsCalculating(false);
      });

    return () => {
      isMounted = false;
    };
  }, [calcService, calcMinutes, calcCurrency, calcLangpretation, previewBillingCharge]);

  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoCodeInput.trim()) return;
    setIsRedeeming(true);
    setPromoStatus(null);
    try {
      const res = await redeemBillingVoucher(promoCodeInput.trim());
      setPromoStatus({ message: res.message, type: 'success' });
      setPromoCodeInput('');
    } catch (err: any) {
      setPromoStatus({ message: err.message || 'Invalid or expired promotional voucher', type: 'error' });
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleUpgradePlan = async (tier: string, forcePaystack = false) => {
    setUpgradingTier(tier);
    const targetPlan = billingPlans.find((p) => p.tier === tier);
    const priceGHS = billingCycle === 'ANNUAL' ? targetPlan?.priceAnnualGHS || 0 : targetPlan?.priceMonthlyGHS || 0;
    const commBalance = billingSummary?.accounts?.communication?.available || 0;

    // Requirement 1: If zero Nanivio Service Value requirement or insufficient balance, automatically launch Paystack checkout
    if (forcePaystack || commBalance < priceGHS || commBalance <= 0 || priceGHS === 0) {
      setUpgradingTier(null);
      setPaystackConfig({
        purpose: 'SUBSCRIPTION',
        planTier: tier,
        billingCycle,
        amount: priceGHS,
        currency: 'GHS',
      });
      setIsPaystackModalOpen(true);
      return;
    }

    try {
      await upgradeSubscriptionPlan(tier, billingCycle);
      setActiveSubTab('overview');
    } catch (err: any) {
      // Fallback to Paystack checkout modal on insufficient balance
      setPaystackConfig({
        purpose: 'SUBSCRIPTION',
        planTier: tier,
        billingCycle,
        amount: priceGHS,
        currency: 'GHS',
      });
      setIsPaystackModalOpen(true);
    } finally {
      setUpgradingTier(null);
    }
  };

  const handleSubscribeMalvi = async (tier: any, forcePaystack = false) => {
    setUpgradingTier(tier);
    const targetPlan = malviPlans.find((p) => p.tier === tier);
    const priceGHS = billingCycle === 'ANNUAL' ? targetPlan?.priceAnnualGHS || 0 : targetPlan?.priceMonthlyGHS || 0;
    const commBalance = billingSummary?.accounts?.communication?.available || 0;

    if (tier === 'free') {
      try {
        await subscribeMalviPlan('free', 'MONTHLY', 'SERVICE_VALUE', 'GHS');
        setActiveSubTab('overview');
      } catch (err: any) {
        alert(err.message || 'Failed to switch to free plan');
      } finally {
        setUpgradingTier(null);
      }
      return;
    }

    if (forcePaystack || commBalance < priceGHS || commBalance <= 0) {
      setUpgradingTier(null);
      setPaystackConfig({
        purpose: 'MALVI_SUBSCRIPTION',
        planTier: tier,
        billingCycle,
        amount: priceGHS,
        currency: 'GHS',
      });
      setIsPaystackModalOpen(true);
      return;
    }

    try {
      await subscribeMalviPlan(tier, billingCycle, 'SERVICE_VALUE', 'GHS');
      setActiveSubTab('overview');
    } catch (err: any) {
      setPaystackConfig({
        purpose: 'MALVI_SUBSCRIPTION',
        planTier: tier,
        billingCycle,
        amount: priceGHS,
        currency: 'GHS',
      });
      setIsPaystackModalOpen(true);
    } finally {
      setUpgradingTier(null);
    }
  };

  const handleCreateDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeTxId || !disputeNotes.trim()) {
      alert('Please provide transaction ID and a detailed description.');
      return;
    }
    setDisputeSubmitting(true);
    try {
      await createBillingDispute({
        transactionId: disputeTxId,
        reason: disputeReason,
        userExplanation: disputeNotes.trim(),
      });
      setIsDisputeModalOpen(false);
      setDisputeNotes('');
      setActiveSubTab('disputes');
    } catch (err: any) {
      alert(`Dispute submission failed: ${err.message}`);
    } finally {
      setDisputeSubmitting(false);
    }
  };

  const currentSub = billingSummary?.subscription;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16 w-full max-w-full overflow-x-hidden">
      {/* Top Header Banner */}
      <div className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30 px-4 sm:px-8 py-4 w-full max-w-full">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-100 tracking-tight">Universal Billing &amp; Monetization</h1>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Universal Ledger v1.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Transparent multi-currency balances, automated minute quotas, and instant audit trails
              </p>
            </div>
          </div>

          {/* Quick Sub-Navigation */}
          <div className="flex items-center overflow-x-auto scrollbar-none touch-pan-x gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800 w-full sm:w-auto">
            {[
              { id: 'overview', label: 'Wallet & Quotas', icon: Layers },
              { id: 'flow', label: 'Flow Verification', icon: Activity },
              { id: 'transfer', label: 'Transfer Value', icon: ArrowRightLeft },
              { id: 'plans', label: 'Communication Plans', icon: Zap },
              { id: 'malvi', label: 'Malvi AI Plans', icon: Sparkles },
              { id: 'calculator', label: 'Tariff Estimator', icon: Sliders },
              { id: 'invoices', label: 'Invoices', icon: Receipt },
              { id: 'disputes', label: 'Disputes & Claims', icon: Shield },
              { id: 'b2b', label: 'Enterprise Desk', icon: Building2 },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`btn_billing_subtab_${tab.id}`}
                  onClick={() => setActiveSubTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 py-6 space-y-6 flex-1">
        {/* Active Usage Session Live Banner (if any) */}
        {activeUsageSession && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center animate-pulse">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Live Active Session Meter</span>
                  <span className="px-2 py-0.2 text-[10px] font-mono bg-amber-500/20 text-amber-300 rounded border border-amber-500/40">
                    {activeUsageSession.sessionId}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-200">
                  {activeUsageSession.serviceType} • {activeUsageSession.currentQuantity} {activeUsageSession.unit}s elapsed • Cost:{' '}
                  <span className="text-emerald-400 font-mono">
                    {activeUsageSession.currency} {activeUsageSession.currentCost.toFixed(2)}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              <span>Elapsed: {Math.floor(activeUsageSession.elapsedSeconds / 60)}m {activeUsageSession.elapsedSeconds % 60}s</span>
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* SUBTAB 1: OVERVIEW & WALLET */}
        {/* ========================================================================= */}
        {activeSubTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Financial Operations Bar */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Financial Operations:</span>
                <span className="text-[11px] text-slate-400">Direct wallet funding and instant value transfers</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  id="btn_topup_paystack_overview"
                  onClick={() => setIsPaystackModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 shadow-sm"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Top Up via Paystack</span>
                </button>
                <button
                  type="button"
                  id="btn_buy_minutes_overview"
                  onClick={() => setIsMinutesModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-sm"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Buy Communication Minutes</span>
                </button>
                <button
                  type="button"
                  id="btn_transfer_p2p_overview"
                  onClick={() => {
                    setTransferModalMode('P2P');
                    setIsTransferModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Transfer Value (P2P)</span>
                </button>
                <button
                  type="button"
                  id="btn_transfer_internal_overview"
                  onClick={() => {
                    setTransferModalMode('INTERNAL');
                    setIsTransferModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition flex items-center gap-1.5 border border-slate-700"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Internal Rebalance</span>
                </button>
                <button
                  type="button"
                  id="btn_view_flow_overview"
                  onClick={() => setActiveSubTab('flow')}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold text-xs transition flex items-center gap-1.5 border border-slate-700"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Flow Verification</span>
                </button>
              </div>
            </div>

            {/* Separated Account Value Cards (Communication vs Fintech) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Primary Communication Balance */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-emerald-500/30 relative overflow-hidden">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-semibold uppercase tracking-wider text-emerald-400">Communication Value</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Calls &amp; Langpretation
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-100 font-mono tracking-tight">
                  GH₵ {billingSummary?.accounts?.communication?.available?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '3,450.00'}
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2.5">
                  <span>Reserved: GH₵ {billingSummary?.accounts?.communication?.reserved?.toFixed(2) || '0.00'}</span>
                  <button
                    onClick={() => setIsPaystackModalOpen(true)}
                    className="text-emerald-400 font-bold hover:underline"
                  >
                    + Top Up
                  </button>
                </div>
              </div>

              {/* Primary Fintech Balance */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-blue-500/30 relative overflow-hidden">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-semibold uppercase tracking-wider text-blue-400">Fintech Value</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    Banking &amp; MoMo
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-100 font-mono tracking-tight">
                  GH₵ {billingSummary?.accounts?.fintech?.available?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '1,255.50'}
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2.5">
                  <span>Withdrawable: GH₵ {billingSummary?.accounts?.fintech?.available?.toFixed(2) || '1,255.50'}</span>
                  <button
                    onClick={() => {
                      setTransferModalMode('P2P');
                      setIsTransferModalOpen(true);
                    }}
                    className="text-blue-400 font-bold hover:underline"
                  >
                    Send &rarr;
                  </button>
                </div>
              </div>

              {/* USD Multi-Currency Balance */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800/80 relative overflow-hidden">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-semibold uppercase tracking-wider">USD Balance</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">$ USD</span>
                </div>
                <div className="text-2xl font-black text-slate-100 font-mono tracking-tight">
                  $ {(billingSummary?.wallets?.find((w) => w.currency === 'USD')?.available || 380.0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/60 pt-2.5">
                  <span>International Billing</span>
                  <span className="text-slate-500">Auto-convert</span>
                </div>
              </div>

              {/* Promotional Credits */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800/80 relative overflow-hidden">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-semibold uppercase tracking-wider">Voucher / Promos</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">Bonus</span>
                </div>
                <div className="text-2xl font-black text-purple-300 font-mono tracking-tight">
                  GH₵ {(billingSummary?.promotionalCredits?.reduce((acc, c) => acc + (c.isActive ? c.remainingAmount : 0), 0) || 50.0).toFixed(2)}
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/60 pt-2.5">
                  <span>Auto-applied first</span>
                  <span className="text-emerald-400 font-medium">Active</span>
                </div>
              </div>
            </div>

            {/* Architecture Flow Diagnostic Card in Overview */}
            <UniversalFlowTracer
              onOpenPaystackModal={() => setIsPaystackModalOpen(true)}
              onOpenTransferModal={() => {
                setTransferModalMode('P2P');
                setIsTransferModalOpen(true);
              }}
            />

            {/* Live Langpretation Real-Time Production Meter */}
            <LiveLangpretationMeter
              onTopUpMinutes={() => setIsMinutesModalOpen(true)}
              onChangePlan={() => setActiveSubTab('plans')}
            />

            {/* Quota Progress & Current Plan Card */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Active Plan Overview */}
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-5 lg:col-span-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Current Subscription</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {currentSub?.status || 'ACTIVE'}
                  </span>
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-100">{currentSub?.planName || 'Individual Premium'}</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Renews on {currentSub ? new Date(currentSub.nextBillingAt).toLocaleDateString() : 'Mar 15, 2026'} ({currentSub?.currency || 'GHS'} {currentSub?.pricePaid || 145.00}/mo)
                  </p>
                </div>

                {/* Quotas Meter Bars */}
                <div className="space-y-4 pt-2">
                  <div>
                    <div className="flex justify-between text-xs mb-1.5 font-medium">
                      <span className="text-slate-300">Langpretation Minutes</span>
                      <span className="font-mono text-emerald-400">
                        {currentSub?.langpretationMinutesRemaining} / {currentSub?.langpretationMinutesQuota} min
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            ((currentSub?.langpretationMinutesRemaining || 0) / (currentSub?.langpretationMinutesQuota || 1)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1.5 font-medium">
                      <span className="text-slate-300">Voice Calling Quota</span>
                      <span className="font-mono text-indigo-400">
                        {Math.max(0, (currentSub?.voiceMinutesQuota || 500) - (currentSub?.voiceMinutesUsed || 84))} / {currentSub?.voiceMinutesQuota || 500} min
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{
                          width: `${Math.max(
                            10,
                            100 - ((currentSub?.voiceMinutesUsed || 84) / (currentSub?.voiceMinutesQuota || 500)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1.5 font-medium">
                      <span className="text-slate-300">Malvi AI Requests</span>
                      <span className="font-mono text-amber-400">
                        {Math.max(0, (currentSub?.malviUnitsQuota || 500) - (currentSub?.malviUnitsUsed || 62))} / {currentSub?.malviUnitsQuota || 500} reqs
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{
                          width: `${Math.max(
                            10,
                            100 - ((currentSub?.malviUnitsUsed || 62) / (currentSub?.malviUnitsQuota || 500)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    id="btn_change_plan_overview"
                    onClick={() => setActiveSubTab('plans')}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs transition flex items-center justify-center gap-2"
                  >
                    <Zap className="w-4 h-4 text-emerald-400" />
                    <span>Change or Upgrade Plan</span>
                  </button>
                </div>
              </div>

              {/* Promotional Voucher & Recent Transactions */}
              <div className="lg:col-span-2 space-y-6">
                {/* Referral Bonus Credit Box */}
                <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30">
                  <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                    <Gift className="w-4 h-4" />
                    <span>Referral Bonus Credit</span>
                  </div>
                  <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                    Refer friends to use Nanivio and earn referral bonus credit when they make their first subscriptions! Enter their referral code or claim your first-subscription bonus credit and free Langpretation minutes below.
                  </p>
                  <form onSubmit={handleRedeemCode} className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="input_promo_code"
                      type="text"
                      value={promoCodeInput}
                      onChange={(e) => setPromoCodeInput(e.target.value)}
                      placeholder="e.g. REF-NANIVIO, FIRSTSUB, or FRIEND2026"
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 uppercase tracking-widest font-mono font-bold"
                    />
                    <button
                      id="btn_redeem_promo"
                      type="submit"
                      disabled={isRedeeming || !promoCodeInput.trim()}
                      className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                    >
                      {isRedeeming ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>Claim Referral Bonus</span>
                    </button>
                  </form>
                  {promoStatus && (
                    <div
                      className={`mt-3 p-3 rounded-lg text-xs flex items-center gap-2 ${
                        promoStatus.type === 'success'
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {promoStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                      <span>{promoStatus.message}</span>
                    </div>
                  )}
                </div>

                {/* Recent Billing Transactions Table */}
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span>Recent Activity & Charges</span>
                    </h3>
                    <button
                      onClick={() => setActiveSubTab('invoices')}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
                    >
                      <span>View Invoices</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {billingSummary?.recentTransactions && billingSummary.recentTransactions.length > 0 ? (
                      billingSummary.recentTransactions.map((tx) => (
                        <div
                          key={tx.transactionId}
                          className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/70 flex items-center justify-between hover:border-slate-700 transition"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                                tx.serviceType === 'LANGPRETATION'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : tx.serviceType === 'EXPERT_SERVICE'
                                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                  : tx.serviceType === 'SUBSCRIPTION'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {tx.serviceType === 'LANGPRETATION' ? 'LN' : tx.serviceType === 'EXPERT_SERVICE' ? 'EXP' : 'TX'}
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-slate-200">
                                {tx.notes || `${tx.serviceType} (${tx.quantity} ${tx.unit}s)`}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Ref: {tx.referenceId} • {new Date(tx.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-bold font-mono text-slate-100">
                              {tx.currency} {tx.total.toFixed(2)}
                            </div>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.2 rounded-full ${
                                tx.status === 'COMPLETED'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : tx.status === 'REFUNDED'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {tx.status}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-xs text-slate-500">No recent billing activity</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBTAB: FLOW VERIFICATION */}
        {/* ========================================================================= */}
        {activeSubTab === 'flow' && (
          <div className="space-y-6">
            <UniversalFlowTracer
              onOpenPaystackModal={() => setIsPaystackModalOpen(true)}
              onOpenTransferModal={() => {
                setTransferModalMode('P2P');
                setIsTransferModalOpen(true);
              }}
            />
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBTAB: TRANSFER VALUE (P2P & REBALANCE) */}
        {/* ========================================================================= */}
        {activeSubTab === 'transfer' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
              <h2 className="text-base font-bold text-slate-100 mb-1">Nanivio Instant Value Transfer Hub</h2>
              <p className="text-xs text-slate-400 mb-6">
                Send communication credits or fintech funds directly to any Nanivio user or rebalance between your personal wallets.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2 text-blue-400">
                      <Send className="w-5 h-5" />
                      <h3 className="font-bold text-sm text-slate-100">Peer-to-Peer Transfer (P2P)</h3>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                      Instant transfer of account value to any Nanivio ID, phone number, or email with 0% platform fee.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTransferModalMode('P2P');
                      setIsTransferModalOpen(true);
                    }}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition"
                  >
                    Launch P2P Transfer &rarr;
                  </button>
                </div>

                <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2 text-emerald-400">
                      <ArrowRightLeft className="w-5 h-5" />
                      <h3 className="font-bold text-sm text-slate-100">Wallet-to-Wallet Rebalance</h3>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                      Shift funds from your Fintech Account into your Communication Account for immediate Langpretation and Telecom minutes.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTransferModalMode('INTERNAL');
                      setIsTransferModalOpen(true);
                    }}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
                  >
                    Rebalance Internal Wallets &rarr;
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBTAB 2: PLANS & UPGRADES */}
        {/* ========================================================================= */}
        {activeSubTab === 'plans' && (
          <div className="space-y-6">
            {/* Annual / Monthly Toggle */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-slate-100">Nanivio Tiered Subscription Matrix</h2>
                <p className="text-xs text-slate-400">All plans include end-to-end Nanivio HD audio/video and real-time messaging</p>
              </div>
              <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  id="btn_cycle_monthly"
                  onClick={() => setBillingCycle('MONTHLY')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                    billingCycle === 'MONTHLY' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Monthly Billing
                </button>
                <button
                  id="btn_cycle_annual"
                  onClick={() => setBillingCycle('ANNUAL')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    billingCycle === 'ANNUAL' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>Annual (Save 18%)</span>
                  <span className="px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 text-[10px] font-black">SAVE</span>
                </button>
              </div>
            </div>

            {/* Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {billingPlans.map((plan) => {
                const isCurrent = currentSub?.planId === plan.id || currentSub?.tier === plan.tier;
                const priceGHS = billingCycle === 'ANNUAL' ? plan.priceAnnualGHS : plan.priceMonthlyGHS;
                const priceUSD = billingCycle === 'ANNUAL' ? plan.priceAnnualUSD : plan.priceMonthlyUSD;

                return (
                  <div
                    key={plan.id}
                    className={`p-6 rounded-2xl flex flex-col justify-between transition-all relative ${
                      isCurrent
                        ? 'bg-slate-900 border-2 border-emerald-500 shadow-lg shadow-emerald-500/10'
                        : plan.tier === 'langpretation_pro'
                        ? 'bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950/30 border border-indigo-500/40'
                        : 'bg-slate-900 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {isCurrent && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[11px] font-black uppercase tracking-wider">
                        Current Plan
                      </div>
                    )}
                    {plan.tier === 'langpretation_pro' && !isCurrent && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-indigo-500 text-white text-[11px] font-black uppercase tracking-wider">
                        Power User
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-100">{plan.name}</h3>
                        <p className="text-xs text-slate-400 mt-1 min-h-[36px]">{plan.description}</p>
                      </div>

                      <div className="pt-2 border-t border-slate-800">
                        <div className="text-2xl font-black font-mono text-slate-100">
                          GH₵ {priceGHS.toFixed(2)}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          ≈ ${priceUSD.toFixed(2)} / {billingCycle === 'ANNUAL' ? 'year' : 'month'}
                        </div>
                      </div>

                      {/* Quotas Breakdown */}
                      <div className="space-y-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Langpretation</span>
                          <span className="font-bold text-emerald-400 font-mono">{plan.includedLangpretationMinutes} min</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Max Room Callers</span>
                          <span className="font-bold text-slate-200 font-mono">{plan.groupCallLimit} users</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Sponsored Ads</span>
                          <span className="font-bold text-slate-200">{plan.canCollapseAds ? 'Collapsible' : 'Visible'}</span>
                        </div>
                      </div>

                      {/* Feature Bullet List */}
                      <div className="space-y-2 pt-2">
                        {plan.features.map((feat, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                            <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                            <span>{feat}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-6 space-y-2">
                      {isCurrent ? (
                        <div className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-400 font-bold text-xs text-center border border-slate-700">
                          Active Plan
                        </div>
                      ) : (
                        <>
                          <button
                            id={`btn_plan_paystack_${plan.tier}`}
                            disabled={upgradingTier === plan.tier}
                            onClick={() => handleUpgradePlan(plan.tier, true)}
                            className="w-full py-2.5 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Pay with Paystack</span>
                          </button>
                          <button
                            id={`btn_plan_balance_${plan.tier}`}
                            disabled={upgradingTier === plan.tier}
                            onClick={() => handleUpgradePlan(plan.tier, false)}
                            className="w-full py-1.5 rounded-xl font-medium text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <span>Pay with Service Value</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBTAB: SEPARATE MALVI SUBSCRIPTION HUB */}
        {/* ========================================================================= */}
        {activeSubTab === 'malvi' && (
          <div className="space-y-6">
            {/* Header & Independence Notice */}
            <div className="p-6 rounded-2xl bg-[#0b1424] border border-cyan-500/40 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-mono font-bold border border-cyan-500/30">
                      Independent AI Ecosystem
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      Separate AI Companion &amp; Team Collaboration
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                    <span>Malvi Subscriptions Hub</span>
                    <Sparkles className="w-5 h-5 text-amber-400" />
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
                    Malvi operates independently from Langpretation and Communication subscriptions. Choose your plan to unlock on-screen interactive companion avatar, real-time voice intelligence, in-call active assistance, and Malvi Business team collaboration.
                  </p>
                </div>

                {/* Billing Cycle Switcher */}
                <div className="flex items-center bg-slate-950 p-1.5 rounded-xl border border-slate-800 shrink-0">
                  <button
                    onClick={() => setBillingCycle('MONTHLY')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                      billingCycle === 'MONTHLY' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBillingCycle('ANNUAL')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                      billingCycle === 'ANNUAL' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>Annual (Save 18%)</span>
                    <span className="px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 text-[10px] font-black">SAVE</span>
                  </button>
                </div>
              </div>

              {/* Current Active Malvi Plan Status */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-mono">Current Malvi Status:</span>
                  <span className="font-bold text-white">{malviSubscription?.planName || 'Malvi Free Experience'}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] uppercase font-bold">
                    {malviSubscription?.status || 'TRIAL'}
                  </span>
                </div>
                <div className="text-slate-400 font-mono">
                  Allowance: <strong className="text-cyan-400">{(malviSubscription?.videoMinutesRemaining ?? 3).toFixed(1)} mins</strong> video companion
                </div>
              </div>
            </div>

            {/* Malvi Plans Grid (Basic, Premium, Business) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {malviPlans.map((plan) => {
                const isCurrent = (malviSubscription?.tier || 'free') === plan.tier;
                const priceGHS = billingCycle === 'ANNUAL' ? plan.priceAnnualGHS : plan.priceMonthlyGHS;
                const priceUSD = billingCycle === 'ANNUAL' ? plan.priceAnnualUSD : plan.priceMonthlyUSD;

                return (
                  <div
                    key={plan.id}
                    className={`p-6 rounded-3xl flex flex-col justify-between transition-all relative ${
                      isCurrent
                        ? 'bg-slate-900 border-2 border-cyan-400 shadow-xl shadow-cyan-500/10'
                        : plan.tier === 'malvi_premium'
                        ? 'bg-gradient-to-b from-[#0b1424] via-slate-900 to-[#0b1424] border border-cyan-500/50 shadow-lg'
                        : plan.tier === 'malvi_business'
                        ? 'bg-gradient-to-b from-purple-950/20 via-slate-900 to-slate-900 border border-purple-500/40'
                        : 'bg-slate-900 border border-slate-800'
                    }`}
                  >
                    {isCurrent && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-cyan-400 text-slate-950 text-[11px] font-black uppercase tracking-wider">
                        Active Malvi Plan
                      </div>
                    )}
                    {plan.tier === 'malvi_premium' && !isCurrent && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 text-[11px] font-black uppercase tracking-wider shadow">
                        Most Popular
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <span className="text-xs font-bold uppercase font-mono text-cyan-400">{plan.tagline}</span>
                        <h3 className="text-xl font-black text-white mt-0.5">{plan.name}</h3>
                        <p className="text-xs text-slate-400 mt-1 min-h-[36px]">{plan.description}</p>
                      </div>

                      <div className="pt-2 border-t border-slate-800">
                        <div className="text-2xl font-black font-mono text-white">
                          GH₵ {priceGHS.toFixed(2)}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          ≈ ${priceUSD.toFixed(2)} / {billingCycle === 'ANNUAL' ? 'year' : 'month'}
                        </div>
                      </div>

                      {/* Capabilities Matrix Strip */}
                      <div className="space-y-2 bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium">Video Companion Quota</span>
                          <span className="font-bold text-cyan-300 font-mono">{plan.videoInteractionMinutesLimit} mins/mo</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium">Visual Avatar</span>
                          <span className="font-bold text-emerald-400">
                            {plan.avatarInteractive ? 'Interactive 3D Stage' : 'Text-Only'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium">Voice Capabilities</span>
                          <span className="font-semibold text-slate-200 text-right truncate max-w-[160px]" title={plan.voiceCapabilities}>
                            {plan.voiceCapabilities}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium">Langpretation</span>
                          <span className="font-semibold text-slate-200 text-right truncate max-w-[160px]" title={plan.langpretationCapabilities}>
                            {plan.langpretationCapabilities}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium">Team Collaboration</span>
                          <span className="font-bold text-purple-300">
                            {plan.businessCollaboration ? 'Active AI Participant' : 'Single User'}
                          </span>
                        </div>
                      </div>

                      {/* Included Features */}
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider font-mono">Included Features:</div>
                        {plan.features.map((feat, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-slate-200">
                            <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                            <span>{feat}</span>
                          </div>
                        ))}
                      </div>

                      {/* Unavailable Features Clearly Marked (Anti-False Representation) */}
                      {plan.unavailableFeatures && plan.unavailableFeatures.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">Not Included in this Plan:</div>
                          {plan.unavailableFeatures.map((unfeat, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-slate-500">
                              <X className="w-3.5 h-3.5 text-rose-500/70 mt-0.5 shrink-0" />
                              <span className="line-through">{unfeat}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-6 space-y-2">
                      {isCurrent ? (
                        <div className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-400 font-bold text-xs text-center border border-slate-700">
                          Active Plan
                        </div>
                      ) : (
                        <>
                          <button
                            id={`btn_malvi_paystack_${plan.tier}`}
                            disabled={upgradingTier === plan.tier}
                            onClick={() => handleSubscribeMalvi(plan.tier, true)}
                            className="w-full py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-slate-950 shadow-md shadow-cyan-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Pay with Paystack (Instant)</span>
                          </button>
                          <button
                            id={`btn_malvi_balance_${plan.tier}`}
                            disabled={upgradingTier === plan.tier}
                            onClick={() => handleSubscribeMalvi(plan.tier, false)}
                            className="w-full py-1.5 rounded-xl font-medium text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <span>Pay with Service Value</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBTAB 3: TARIFF CALCULATOR & ESTIMATOR */}
        {/* ========================================================================= */}
        {activeSubTab === 'calculator' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Estimator Controls */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-5 lg:col-span-2">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-emerald-400" />
                  <span>Pre-Action Usage & Tariff Estimator</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Transparent calculation of real-time Langpretation, HD calling, and consultation charges before you initiate
                </p>
              </div>

              {/* Service Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Service Archetype</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'COMMUNICATION', label: '1:1 Video/Voice' },
                    { id: 'LANGPRETATION', label: 'Langpretation' },
                    { id: 'EXPERT_SERVICE', label: 'Doctor/Legal Expert' },
                    { id: 'FINTECH_TRANSFER', label: 'MoMo Remittance' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setCalcService(s.id as any)}
                      className={`p-3 rounded-xl text-xs font-semibold border transition text-left ${
                        calcService === s.id
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration Slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold text-slate-300">
                  <span>Estimated Duration / Quantity:</span>
                  <span className="font-mono text-emerald-400">{calcMinutes} {calcService === 'FINTECH_TRANSFER' ? 'Amount (GHS)' : 'Minutes'}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max={calcService === 'FINTECH_TRANSFER' ? 5000 : 120}
                  step={calcService === 'FINTECH_TRANSFER' ? 50 : 1}
                  value={calcMinutes}
                  onChange={(e) => setCalcMinutes(Number(e.target.value))}
                  className="w-full accent-emerald-500 bg-slate-950 h-2 rounded-lg cursor-pointer"
                />
              </div>

              {/* Currency and Langpretation Checkbox */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">Billing Currency</label>
                  <div className="flex gap-2">
                    {['GHS', 'USD'].map((c) => (
                      <button
                        key={c}
                        onClick={() => setCalcCurrency(c as any)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                          calcCurrency === c
                            ? 'bg-slate-800 border-emerald-500 text-emerald-400'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {calcService !== 'LANGPRETATION' && (
                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={calcLangpretation}
                        onChange={(e) => setCalcLangpretation(e.target.checked)}
                        className="w-4 h-4 accent-emerald-500 rounded"
                      />
                      <span>Include Real-Time Langpretation</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Estimator Summary Output Box */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Estimated Cost Breakdown</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    Version {calcPreview?.pricingVersion || '1.0.0'}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs border-y border-slate-800 py-3">
                  <div className="flex justify-between text-slate-400">
                    <span>Base Service ({calcMinutes} {calcPreview?.unit || 'units'}):</span>
                    <span className="font-mono text-slate-200">
                      {calcCurrency} {calcPreview?.baseCharge.toFixed(2) || '0.00'}
                    </span>
                  </div>

                  {calcPreview?.langpretationCharge !== undefined && (
                    <div className="flex justify-between text-slate-400">
                      <span>Langpretation Transformation:</span>
                      <span className="font-mono text-emerald-400">
                        {calcCurrency} {calcPreview.langpretationCharge.toFixed(2)}
                      </span>
                    </div>
                  )}

                  {calcPreview?.platformFee !== undefined && calcPreview.platformFee > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>Platform Brokerage Fee:</span>
                      <span className="font-mono text-slate-300">
                        {calcCurrency} {calcPreview.platformFee.toFixed(2)}
                      </span>
                    </div>
                  )}

                  {calcPreview?.promotionalCreditApplied !== undefined && calcPreview.promotionalCreditApplied > 0 && (
                    <div className="flex justify-between text-emerald-400 font-semibold">
                      <span>Promotional Credit Applied:</span>
                      <span className="font-mono">-{calcCurrency} {calcPreview.promotionalCreditApplied.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs text-slate-400">Net Estimated Total</div>
                  <div className="text-3xl font-black font-mono text-slate-100 mt-1">
                    {calcCurrency} {calcPreview?.totalEstimatedCharge.toFixed(2) || '0.00'}
                  </div>
                </div>

                {/* Pre-Authorization Notice */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Reservation & Authorization</span>
                  </div>
                  <p>
                    Required fund pre-authorization for this session is{' '}
                    <span className="text-emerald-400 font-mono font-bold">
                      {calcCurrency} {calcPreview?.requiredReservation.toFixed(2)}
                    </span>
                    . Unused funds are released instantly upon call completion.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => alert('Start call from the Calls tab to initiate this exact session.')}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Authorized & Ready</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBTAB 4: INVOICES & STATEMENTS */}
        {/* ========================================================================= */}
        {activeSubTab === 'invoices' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-400" />
                  <span>Official Invoices & VAT Receipts</span>
                </h2>
                <p className="text-xs text-slate-400">Download, print, or review audit-proof financial records</p>
              </div>
              <button
                onClick={() => {
                  if (userInvoices.length > 0) setSelectedInvoice(userInvoices[0]);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Print Latest Invoice</span>
              </button>
            </div>

            {/* Invoices List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {userInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-100 font-mono">{inv.invoiceNumber}</span>
                      <div className="text-[11px] text-slate-400">Issued: {new Date(inv.issuedAt).toLocaleDateString()}</div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {inv.status}
                    </span>
                  </div>

                  {/* Items List */}
                  <div className="space-y-2 bg-slate-950 p-3 rounded-xl border border-slate-800/60 text-xs">
                    {inv.items.map((item) => (
                      <div key={item.id} className="flex justify-between items-center text-slate-300">
                        <span className="truncate max-w-[240px]">{item.description}</span>
                        <span className="font-mono font-semibold text-slate-100">
                          {inv.currency} {item.total.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-800 pt-3">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Paid</div>
                      <div className="text-base font-black font-mono text-emerald-400">
                        {inv.currency} {inv.total.toFixed(2)}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedInvoice(inv)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
                      >
                        View Full
                      </button>
                      <button
                        onClick={() => {
                          setDisputeTxId(inv.transactionReference);
                          setIsDisputeModalOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-rose-500/10 text-rose-400 border border-slate-800 hover:border-rose-500/30 text-xs font-medium transition"
                      >
                        Dispute
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Full Printable Invoice Modal View */}
            <AnimatePresence>
              {selectedInvoice && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
                  >
                    <button
                      onClick={() => setSelectedInvoice(null)}
                      className="absolute top-4 right-4 p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-100"
                    >
                      <X className="w-4 h-4" />
                    </button>

                    {/* Invoice Header */}
                    <div className="flex justify-between items-start border-b border-slate-800 pb-4">
                      <div>
                        <div className="text-xl font-black text-slate-100">NANIVIO PLATFORM LTD</div>
                        <div className="text-xs text-slate-400">Global Communication & Langpretation Ledger</div>
                        <div className="text-xs text-slate-400">Tax ID: GH-VAT-2026-88190</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black font-mono text-emerald-400">{selectedInvoice.invoiceNumber}</div>
                        <div className="text-xs text-slate-400">Issued: {new Date(selectedInvoice.issuedAt).toLocaleDateString()}</div>
                      </div>
                    </div>

                    {/* Customer Info */}
                    <div className="grid grid-cols-2 text-xs text-slate-300">
                      <div>
                        <span className="text-slate-500 uppercase font-semibold">Billed To:</span>
                        <div className="font-bold text-slate-100">{selectedInvoice.customerName || 'Kwame Mensah'}</div>
                        <div>{selectedInvoice.customerEmail || 'kwame@nanivio.tech'}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 uppercase font-semibold">Payment Method:</span>
                        <div className="font-bold text-slate-100">{selectedInvoice.paymentMethod}</div>
                        <div className="font-mono text-slate-400">{selectedInvoice.transactionReference}</div>
                      </div>
                    </div>

                    {/* Line Items */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Itemized Breakdown</div>
                      <div className="border border-slate-800 rounded-xl overflow-hidden text-xs">
                        <div className="bg-slate-950 p-3 flex justify-between font-bold text-slate-400 border-b border-slate-800">
                          <span>Description</span>
                          <span>Amount</span>
                        </div>
                        {selectedInvoice.items.map((item) => (
                          <div key={item.id} className="p-3 flex justify-between text-slate-200 border-b border-slate-800/50">
                            <div>
                              <div>{item.description}</div>
                              <div className="text-[10px] text-slate-500">
                                {item.quantity} {item.unit}s @ {selectedInvoice.currency} {item.unitPrice.toFixed(2)}
                              </div>
                            </div>
                            <div className="font-mono font-bold">
                              {selectedInvoice.currency} {item.total.toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Totals */}
                    <div className="flex justify-end text-xs">
                      <div className="w-64 space-y-1.5">
                        <div className="flex justify-between text-slate-400">
                          <span>Subtotal:</span>
                          <span className="font-mono">{selectedInvoice.currency} {selectedInvoice.subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>VAT / Tax (0%):</span>
                          <span className="font-mono">{selectedInvoice.currency} 0.00</span>
                        </div>
                        <div className="flex justify-between font-bold text-slate-100 text-sm border-t border-slate-800 pt-2">
                          <span>Total Paid:</span>
                          <span className="font-mono text-emerald-400">
                            {selectedInvoice.currency} {selectedInvoice.total.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                      <button
                        onClick={() => window.print()}
                        className="px-4 py-2 bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2"
                      >
                        <Printer className="w-4 h-4" />
                        <span>Print Document</span>
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBTAB 5: DISPUTES & CLAIMS */}
        {/* ========================================================================= */}
        {activeSubTab === 'disputes' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-400" />
                  <span>Dispute Resolution & Audit Portal</span>
                </h2>
                <p className="text-xs text-slate-400">Submit quality claims, translation error disputes, and billing adjustments</p>
              </div>
              <button
                id="btn_open_dispute_modal"
                onClick={() => setIsDisputeModalOpen(true)}
                className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold rounded-xl transition flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4" />
                <span>File New Claim</span>
              </button>
            </div>

            {/* Disputes List */}
            <div className="space-y-3">
              {userDisputes.length > 0 ? (
                userDisputes.map((d) => (
                  <div key={d.id} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-200 text-xs">{d.caseNumber}</span>
                        <span className="text-[11px] text-slate-500">• {new Date(d.createdAt).toLocaleDateString()}</span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                          d.status === 'APPROVED'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : d.status === 'REJECTED'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {d.status}
                      </span>
                    </div>

                    <div className="text-xs text-slate-300">
                      <span className="text-slate-500">Reason:</span> <span className="font-semibold">{d.reason}</span>
                    </div>

                    <p className="text-xs text-slate-400 bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                      {d.userExplanation}
                    </p>

                    {d.adminResolution && (
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1">
                        <div className="font-bold text-emerald-400">Admin Resolution (Resolved by {d.resolvedByAdmin})</div>
                        <p className="text-slate-300">{d.adminResolution}</p>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-12 text-center text-xs text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800/60">
                  No active or past disputes on record. All transactions are in good standing.
                </div>
              )}
            </div>

            {/* File Dispute Modal */}
            <AnimatePresence>
              {isDisputeModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl relative"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-400" />
                        <span>Submit Dispute Claim</span>
                      </h3>
                      <button onClick={() => setIsDisputeModalOpen(false)} className="text-slate-400 hover:text-slate-100">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleCreateDispute} className="space-y-4 text-xs">
                      <div>
                        <label className="block text-slate-400 mb-1 font-semibold">Transaction Reference ID</label>
                        <input
                          type="text"
                          required
                          value={disputeTxId}
                          onChange={(e) => setDisputeTxId(e.target.value)}
                          placeholder="e.g. tx_lang_bundle_03 or REF-NV-EXP-4402"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono focus:border-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1 font-semibold">Claim Reason</label>
                        <select
                          value={disputeReason}
                          onChange={(e) => setDisputeReason(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="LANGPRETATION_ERROR">Langpretation Translation / Transcription Error</option>
                          <option value="EXPERT_NO_SHOW">Expert Provider Missed Scheduled Time</option>
                          <option value="CALL_DROP_NETWORK">Premature Call Drop / Server Connection Fault</option>
                          <option value="UNAUTHORIZED_CHARGE">Billing Tariff Discrepancy</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1 font-semibold">Detailed Description</label>
                        <textarea
                          rows={4}
                          required
                          value={disputeNotes}
                          onChange={(e) => setDisputeNotes(e.target.value)}
                          placeholder="Please provide details of what occurred during the session..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setIsDisputeModalOpen(false)}
                          className="flex-1 py-2 bg-slate-800 text-slate-300 font-semibold rounded-xl"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={disputeSubmitting}
                          className="flex-1 py-2 bg-rose-500 hover:bg-rose-400 text-white font-bold rounded-xl flex items-center justify-center gap-2"
                        >
                          {disputeSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>Submit Case</span>}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBTAB 6: B2B ENTERPRISE DESK */}
        {/* ========================================================================= */}
        {activeSubTab === 'b2b' && (
          <div className="space-y-6">
            {businessAccount ? (
              <div className="space-y-6">
                {/* Enterprise Header Card */}
                <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-100">{businessAccount.companyName}</h2>
                        <p className="text-xs text-slate-400">
                          Tax ID: {businessAccount.taxId} • Billing Email: {businessAccount.billingEmail}
                        </p>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 w-fit">
                      Enterprise B2B Suite
                    </span>
                  </div>

                  {/* Pooled Minutes Gauge */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-800">
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[11px] text-slate-400 font-semibold uppercase">Company Pooled Minutes</span>
                      <div className="text-2xl font-black font-mono text-emerald-400 mt-1">
                        {businessAccount.pooledLangpretationMinutesQuota - businessAccount.pooledLangpretationMinutesUsed} /{' '}
                        {businessAccount.pooledLangpretationMinutesQuota} min
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[11px] text-slate-400 font-semibold uppercase">Team Seats Allocated</span>
                      <div className="text-2xl font-black font-mono text-indigo-400 mt-1">
                        {businessAccount.seatsAllocated} / {businessAccount.seatsTotal} Seats
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[11px] text-slate-400 font-semibold uppercase">Monthly Spend Limit</span>
                      <div className="text-2xl font-black font-mono text-amber-400 mt-1">
                        ${businessAccount.currentMonthSpendUSD} / ${businessAccount.monthlySpendLimitUSD}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Team Members Allocation List */}
                <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-400" />
                      <span>Corporate Seat Allocations & Usage</span>
                    </h3>
                    <button
                      onClick={() => alert('Add seats dialog: $15/seat added to monthly consolidated invoice.')}
                      className="px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs font-bold hover:bg-indigo-500/30 transition"
                    >
                      + Add Team Seat
                    </button>
                  </div>

                  <div className="space-y-2">
                    {businessAccount.activeMembers.map((member) => (
                      <div
                        key={member.userId}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-800 font-bold flex items-center justify-center text-slate-200">
                            {member.userName.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-200">{member.userName}</div>
                            <div className="text-[11px] text-slate-400">{member.email}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-500 block">Langpretation Used</span>
                            <span className="font-mono font-bold text-emerald-400">{member.minutesUsed} mins</span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                            {member.role}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400 bg-slate-900 rounded-2xl border border-slate-800">
                Loading enterprise desk data...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Paystack Top-Up Modal */}
      <PaystackTopUpModal
        isOpen={isPaystackModalOpen}
        onClose={() => {
          setIsPaystackModalOpen(false);
          setPaystackConfig({});
        }}
        onSuccess={() => {
          setIsPaystackModalOpen(false);
          setPaystackConfig({});
          refreshBilling();
        }}
        purpose={paystackConfig.purpose || 'COMMUNICATION_TOPUP'}
        planTier={paystackConfig.planTier}
        billingCycle={paystackConfig.billingCycle}
        initialAmount={paystackConfig.amount}
        defaultCurrency={paystackConfig.currency || 'GHS'}
        packageId={paystackConfig.packageId}
        minutes={paystackConfig.minutes}
      />

      {/* Communication Minutes Purchase Modal */}
      <CommunicationMinutesModal
        isOpen={isMinutesModalOpen}
        onClose={() => setIsMinutesModalOpen(false)}
        onSuccess={() => {
          refreshBilling();
        }}
      />

      {/* Peer-to-Peer & Internal Transfer Modal */}
      <TransferValueModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        onSuccess={() => {
          refreshBilling();
        }}
        defaultMode={transferModalMode}
        communicationBalance={billingSummary?.accounts?.communication?.available || 3450}
        fintechBalance={billingSummary?.accounts?.fintech?.available || 1255.5}
        currency="GHS"
      />
    </div>
  );
};
