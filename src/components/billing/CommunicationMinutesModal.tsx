import React, { useState } from 'react';
import {
  X,
  Zap,
  Check,
  CreditCard,
  AlertCircle,
  Clock,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Wallet,
  Receipt,
  ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNanivio } from '../../context/NanivioContext';
import { CommunicationMinutePackage } from '../../types/billing';
import { PaystackTopUpModal } from './PaystackTopUpModal';

interface CommunicationMinutesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CommunicationMinutesModal: React.FC<CommunicationMinutesModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const {
    communicationMinutePackages,
    purchaseCommunicationMinutes,
    wallets,
    refreshBilling,
  } = useNanivio();

  const [selectedPkgId, setSelectedPkgId] = useState<string>('comm_pkg_150');
  const [currency, setCurrency] = useState<'GHS' | 'USD'>('GHS');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any>(null);

  // Paystack Modal State if user opts or balance is insufficient
  const [isPaystackOpen, setIsPaystackOpen] = useState<boolean>(false);

  if (!isOpen) return null;

  const packages: CommunicationMinutePackage[] =
    communicationMinutePackages.length > 0
      ? communicationMinutePackages
      : [
          {
            id: 'comm_pkg_60',
            name: 'Starter 60 Minutes',
            minutes: 60,
            priceUSD: 3.99,
            priceGHS: 55.0,
            description: 'Standard calling and speech translation for casual calling',
            validityDays: 30,
            features: [
              '60 direct voice & video calling minutes',
              'Valid on domestic and global lines',
              'Instant balance credit upon settlement',
            ],
          },
          {
            id: 'comm_pkg_150',
            name: 'Value 150 Minutes',
            minutes: 150,
            priceUSD: 8.99,
            priceGHS: 130.0,
            description: 'Popular communication pack for active weekly business and family connections',
            validityDays: 30,
            features: [
              '150 crystal-clear WebRTC audio & video minutes',
              'Priority route allocation',
              'Rolls over with active plan renewal',
            ],
          },
          {
            id: 'comm_pkg_300',
            name: 'Power 300 Minutes',
            minutes: 300,
            priceUSD: 16.99,
            priceGHS: 245.0,
            description: 'Substantial minutes allowance for cross-border trade, diaspora and consulting',
            validityDays: 60,
            features: [
              '300 minutes valid for 60 full days',
              'Low per-minute rate (GH₵ 0.81/min)',
              'High definition group audio & video access',
            ],
          },
          {
            id: 'comm_pkg_600',
            name: 'Executive 600 Minutes',
            minutes: 600,
            priceUSD: 29.99,
            priceGHS: 430.0,
            description: 'High-volume international communication pack for executives and regular traders',
            validityDays: 90,
            features: [
              '600 minutes valid for 90 days',
              'VIP carrier routing with lowest latency',
              'Detailed call detail records (CDR)',
            ],
          },
          {
            id: 'comm_pkg_1500',
            name: 'Enterprise 1,500 Minutes',
            minutes: 1500,
            priceUSD: 69.99,
            priceGHS: 990.0,
            description: 'Ultimate commercial minute bundle for organizations, call centers, and teams',
            validityDays: 180,
            features: [
              '1,500 shared organization minutes',
              'Valid for 180 days',
              'Full AfCFTA trade corridor rate parity',
            ],
          },
        ];

  const selectedPkg = packages.find((p) => p.id === selectedPkgId) || packages[1];
  const pkgCost = currency === 'USD' ? selectedPkg.priceUSD : selectedPkg.priceGHS;

  // Check Communication Balance (Nanivio Service Value)
  const commWallet = wallets.find((w) => w.currency === currency);
  const availableServiceValue = commWallet?.balance || 0;
  const isBalanceSufficient = availableServiceValue >= pkgCost;

  const handlePurchaseWithBalance = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const res = await purchaseCommunicationMinutes(selectedPkg.id, 'SERVICE_VALUE', currency);
      setSuccessResult(res);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      if (err.code === 'INSUFFICIENT_SERVICE_VALUE') {
        // Automatically direct user to Paystack payment
        setErrorMessage(err.message || 'Insufficient balance. Directing to Paystack payment gateway.');
        setTimeout(() => {
          setIsPaystackOpen(true);
        }, 1000);
      } else {
        setErrorMessage(err.message || 'Failed to complete minute package purchase');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayViaPaystack = () => {
    setIsPaystackOpen(true);
  };

  const handlePaystackSuccess = async () => {
    setIsPaystackOpen(false);
    await refreshBilling();
    onClose();
    if (onSuccess) onSuccess();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="bg-[#0b1424] border border-emerald-500/40 rounded-3xl p-5 sm:p-7 max-w-4xl w-full shadow-2xl space-y-6 my-auto max-h-[92vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-800 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-mono font-bold border border-emerald-500/30">
                  Communication Minutes Pack
                </span>
                <span className="text-xs text-slate-400 font-mono">Live Telecom &amp; Langpretation Quota</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                Select Your Communication Minutes
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Directly credits your authoritative live meter. Pay with Nanivio Service Value balance or live Paystack payment.
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Success Screen */}
          {successResult ? (
            <div className="py-8 text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/30">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>
              <h3 className="text-2xl font-black text-white">Minutes Successfully Activated!</h3>
              <p className="text-sm text-slate-300 max-w-md mx-auto">
                {successResult.message || `+${selectedPkg.minutes} Communication Minutes are now live and credited to your meter.`}
              </p>
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 max-w-sm mx-auto space-y-2 text-xs font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Allowance Remaining:</span>
                  <span className="text-emerald-400 font-bold">{successResult.allowance || selectedPkg.minutes} mins</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Valid Period:</span>
                  <span className="text-slate-200">{selectedPkg.validityDays} Days</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Transaction Status:</span>
                  <span className="text-emerald-400 font-bold">COMPLETED &amp; VERIFIED</span>
                </div>
              </div>
              <div className="pt-3">
                <button
                  onClick={onClose}
                  className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/30 transition-all cursor-pointer"
                >
                  Return to Workspace
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Currency Selector Toggle */}
              <div className="flex items-center justify-between bg-slate-950/80 border border-slate-800 p-2 rounded-2xl">
                <span className="text-xs text-slate-400 px-3 font-mono">Billing Currency:</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrency('GHS')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold font-mono transition cursor-pointer ${
                      currency === 'GHS'
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Ghanaian Cedi (GH₵)
                  </button>
                  <button
                    onClick={() => setCurrency('USD')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold font-mono transition cursor-pointer ${
                      currency === 'USD'
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    US Dollar ($)
                  </button>
                </div>
              </div>

              {/* Package Selection Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {packages.map((pkg) => {
                  const isSelected = selectedPkgId === pkg.id;
                  const priceDisplay = currency === 'USD' ? `$${pkg.priceUSD.toFixed(2)}` : `GH₵ ${pkg.priceGHS.toFixed(2)}`;

                  return (
                    <div
                      key={pkg.id}
                      onClick={() => setSelectedPkgId(pkg.id)}
                      className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-emerald-950/40 border-emerald-500 shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-500'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono uppercase text-slate-400">
                            {pkg.validityDays}d validity
                          </span>
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          )}
                        </div>
                        <div className="text-xl font-black text-emerald-400 font-mono">
                          +{pkg.minutes}{' '}
                          <span className="text-xs font-normal text-slate-400">mins</span>
                        </div>
                        <div className="text-sm font-bold text-white font-mono">
                          {priceDisplay}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-tight">
                          {pkg.description}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 space-y-1 font-mono">
                        <div>Rate: {currency === 'USD' ? `$${(pkg.priceUSD / pkg.minutes).toFixed(2)}/min` : `GH₵ ${(pkg.priceGHS / pkg.minutes).toFixed(2)}/min`}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Service Value Balance Check Banner */}
              <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 font-mono">Nanivio Service Value Balance</div>
                    <div className="text-lg font-black text-white font-mono">
                      {currency === 'USD' ? `$${availableServiceValue.toFixed(2)}` : `GH₵ ${availableServiceValue.toFixed(2)}`}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  {isBalanceSufficient ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold font-mono border border-emerald-500/30">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      Sufficient for Instant Activation
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold font-mono border border-amber-500/30">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Zero / Low Service Value
                    </span>
                  )}
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {/* Option 1: Nanivio Service Value */}
                <button
                  disabled={!isBalanceSufficient || isProcessing}
                  onClick={handlePurchaseWithBalance}
                  className={`py-3.5 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    isBalanceSufficient && !isProcessing
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/20'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  }`}
                >
                  <Wallet className="w-4 h-4" />
                  <span>
                    {isBalanceSufficient
                      ? `Activate with Service Value (${currency === 'USD' ? `$${pkgCost.toFixed(2)}` : `GH₵ ${pkgCost.toFixed(2)}`})`
                      : 'Insufficient Service Value'}
                  </span>
                </button>

                {/* Option 2: Paystack Gateway (Live Verification) */}
                <button
                  onClick={handlePayViaPaystack}
                  className="py-3.5 px-4 rounded-2xl bg-slate-900 border border-emerald-500/40 hover:bg-slate-850 hover:border-emerald-400 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                  <span>
                    Pay with Paystack ({currency === 'USD' ? `$${pkgCost.toFixed(2)}` : `GH₵ ${pkgCost.toFixed(2)}`})
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-70" />
                </button>
              </div>

              {/* Security & Verification Guarantee */}
              <div className="flex items-center justify-between text-slate-400 text-[11px] pt-3 border-t border-slate-800/80">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Live Paystack API verification required before minute activation. No fake or mock credits.</span>
                </div>
                <span className="font-mono text-emerald-400">256-Bit SSL Settlement</span>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Embedded Paystack Top-Up Modal specifically tailored for this Minute Package */}
      {isPaystackOpen && (
        <PaystackTopUpModal
          isOpen={isPaystackOpen}
          onClose={() => setIsPaystackOpen(false)}
          onSuccess={handlePaystackSuccess}
          defaultCurrency={currency}
          initialAmount={pkgCost}
          purpose="COMMUNICATION_MINUTES"
          packageId={selectedPkg.id}
          minutes={selectedPkg.minutes}
        />
      )}
    </>
  );
};
