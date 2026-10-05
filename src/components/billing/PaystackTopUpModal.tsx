import React, { useState } from 'react';
import {
  X,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Lock,
  Smartphone,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { billingClient } from '../../lib/billingClient';

interface PaystackTopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultCurrency?: string;
  initialAmount?: number;
  purpose?: 'COMMUNICATION_TOPUP' | 'SUBSCRIPTION' | 'COMMUNICATION_MINUTES' | 'MALVI_SUBSCRIPTION';
  packageId?: string;
  planTier?: string;
  billingCycle?: 'MONTHLY' | 'ANNUAL';
  minutes?: number;
}

export const PaystackTopUpModal: React.FC<PaystackTopUpModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultCurrency = 'GHS',
  initialAmount,
  purpose = 'COMMUNICATION_TOPUP',
  packageId,
  planTier,
  billingCycle = 'MONTHLY',
  minutes,
}) => {
  const [amount, setAmount] = useState<number>(initialAmount || 50);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [currency, setCurrency] = useState<string>(defaultCurrency);
  const [email, setEmail] = useState<string>('kwame.mensah@nanivio.tech');
  const [paymentStep, setPaymentStep] = useState<'INPUT' | 'INITIALIZING' | 'CHECKOUT' | 'VERIFYING' | 'SUCCESS'>('INPUT');
  const [hasOpenedCheckout, setHasOpenedCheckout] = useState<boolean>(false);
  const [paystackData, setPaystackData] = useState<{
    reference: string;
    authorization_url: string;
    access_code: string;
    sandbox?: boolean;
  } | null>(null);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Background auto-polling for payment completion once user opens Paystack checkout
  React.useEffect(() => {
    let interval: any;
    if (paymentStep === 'CHECKOUT' && hasOpenedCheckout && paystackData?.reference) {
      interval = setInterval(async () => {
        try {
          const verifyRes = await billingClient.verifyPaystack(
            paystackData.reference,
            'user_me',
            amount
          );
          if (verifyRes && verifyRes.success) {
            clearInterval(interval);
            setVerificationResult(verifyRes);
            setPaymentStep('SUCCESS');
            onSuccess();
          }
        } catch {
          // Still pending user authorization on their phone/card
        }
      }, 3500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [paymentStep, hasOpenedCheckout, paystackData?.reference, amount, onSuccess]);

  const presetAmounts = [20, 50, 100, 200, 500];

  const handleSelectPreset = (val: number) => {
    setAmount(val);
    setCustomAmount('');
  };

  const handleCustomChange = (val: string) => {
    setCustomAmount(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) {
      setAmount(parsed);
    }
  };

  const handleInitialize = async () => {
    if (amount <= 0) {
      setErrorMessage('Please enter a valid amount.');
      return;
    }
    setErrorMessage(null);
    setPaymentStep('INITIALIZING');

    try {
      const initRes = await billingClient.initializePaystack({
        email,
        amount,
        currency,
        userId: 'user_me',
        purpose: purpose as 'COMMUNICATION_TOPUP' | 'SUBSCRIPTION' | 'COMMUNICATION_MINUTES' | 'MALVI_SUBSCRIPTION',
        packageId,
        planTier,
        billingCycle: billingCycle as 'MONTHLY' | 'ANNUAL',
        minutes,
      });

      setPaystackData({
        reference: initRes.reference,
        authorization_url: initRes.authorization_url,
        access_code: initRes.access_code,
        sandbox: initRes.sandbox,
      });

      setPaymentStep('CHECKOUT');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to initialize Paystack transaction');
      setPaymentStep('INPUT');
    }
  };

  const handleVerifyPayment = async () => {
    if (!paystackData) return;
    setPaymentStep('VERIFYING');

    try {
      const verifyRes = await billingClient.verifyPaystack(
        paystackData.reference,
        'user_me',
        amount
      );

      setVerificationResult(verifyRes);
      setPaymentStep('SUCCESS');
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Paystack verification failed. Ensure payment was authorized.');
      setPaymentStep('CHECKOUT');
    }
  };

  const handleOpenCheckout = () => {
    if (!paystackData?.authorization_url) return;
    setHasOpenedCheckout(true);
    window.open(paystackData.authorization_url, '_blank', 'noopener,noreferrer');
  };

  const handleReset = () => {
    setPaymentStep('INPUT');
    setHasOpenedCheckout(false);
    setPaystackData(null);
    setVerificationResult(null);
    setErrorMessage(null);
    onClose();
  };

  const modalTitle =
    purpose === 'COMMUNICATION_MINUTES'
      ? `Activate +${minutes || ''} Communication Minutes`
      : purpose === 'SUBSCRIPTION'
      ? `Activate Plan Subscription (${planTier || 'Premium'})`
      : purpose === 'MALVI_SUBSCRIPTION'
      ? `Activate Malvi Subscription (${planTier || 'Premium'})`
      : 'Top Up Communication Balance';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>{modalTitle}</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Paystack Rail
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Live cryptographic verification via Paystack API
              </p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: INPUT AMOUNT & CURRENCY */}
          {paymentStep === 'INPUT' && (
            <div className="space-y-4">
              {/* Currency Selector */}
              <div className="flex items-center justify-between bg-slate-950 p-2 rounded-xl border border-slate-800 text-xs">
                <span className="text-slate-400 px-2 font-medium">Billing Currency</span>
                <div className="flex gap-1">
                  {['GHS', 'USD'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrency(c)}
                      className={`px-3 py-1 rounded-lg font-bold text-xs transition ${
                        currency === c
                          ? 'bg-emerald-500 text-slate-950 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {c === 'GHS' ? 'GH₵ (Ghana Cedi)' : '$ (USD)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Select Amount</label>
                <div className="grid grid-cols-5 gap-2">
                  {presetAmounts.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition border ${
                        amount === preset && !customAmount
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {currency === 'GHS' ? '₵' : '$'}
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Amount Field */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Or Custom Amount</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm">
                    {currency === 'GHS' ? 'GH₵' : '$'}
                  </span>
                  <input
                    type="number"
                    min="5"
                    step="1"
                    placeholder="Enter custom amount"
                    value={customAmount}
                    onChange={(e) => handleCustomChange(e.target.value)}
                    className="w-full pl-12 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-slate-100 font-mono text-sm"
                  />
                </div>
              </div>

              {/* Customer Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Notification &amp; Receipt Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-slate-200 text-xs font-mono"
                />
              </div>

              {/* Security Banner */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>
                  Payments are encrypted end-to-end via Paystack with HMAC SHA-512 signatures. Funds directly credit your Nanivio Account Value without intermediary escrow.
                </span>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleInitialize}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                <span>Proceed to Paystack Checkout ({currency} {amount.toFixed(2)})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STEP 2: INITIALIZING */}
          {paymentStep === 'INITIALIZING' && (
            <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center animate-spin">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Generating Secure Paystack Reference</h3>
                <p className="text-xs text-slate-400 mt-1">Establishing authenticated transaction session with Paystack API...</p>
              </div>
            </div>
          )}

          {/* STEP 3: PAYSTACK CHECKOUT OVERLAY (SANDBOX & LIVE READY) */}
          {paymentStep === 'CHECKOUT' && paystackData && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Transaction Reference</span>
                  <span className="font-mono text-emerald-400 font-bold">{paystackData.reference}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Payable Amount</span>
                  <span className="font-mono text-slate-100 font-bold text-sm">
                    {currency} {amount.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Gateway Channels</span>
                  <span className="text-slate-300 text-[11px]">MTN MoMo, Telecel Cash, Card, Bank</span>
                </div>
              </div>

              {/* Supported Payment Channels */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col items-center gap-1.5 text-slate-300">
                  <Smartphone className="w-4 h-4 text-amber-400" />
                  <span className="text-[11px] font-medium">Mobile Money</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col items-center gap-1.5 text-slate-300">
                  <CreditCard className="w-4 h-4 text-blue-400" />
                  <span className="text-[11px] font-medium">Visa / Mastercard</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col items-center gap-1.5 text-slate-300">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span className="text-[11px] font-medium">Bank Transfer</span>
                </div>
              </div>

              {/* Paystack Checkout Action & Verification Trigger Buttons */}
              <div className="space-y-3 pt-2">
                {/* Step 3A: Open Paystack Checkout */}
                <button
                  type="button"
                  onClick={handleOpenCheckout}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>1. Open Paystack Checkout (MoMo &amp; Card)</span>
                </button>

                {hasOpenedCheckout ? (
                  <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-2 text-center animate-in fade-in duration-200">
                    <div className="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-300">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>Awaiting Authorization on your device...</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Approve the prompt on your phone (e.g. MTN MoMo PIN or Card 3DS OTP). The system is listening and will automatically finalize your account upon confirmation.
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-center text-slate-400">
                    Click above to open Paystack's secure payment page to enter your mobile money number or bank card.
                  </p>
                )}

                {/* Step 3B: Manual Verification Trigger */}
                <button
                  type="button"
                  onClick={handleVerifyPayment}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer border ${
                    hasOpenedCheckout
                      ? 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-emerald-500/40 shadow-sm'
                      : 'bg-slate-950 hover:bg-slate-850 text-slate-400 border-slate-800'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>2. I Have Completed Payment — Verify &amp; Credit Now</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: VERIFYING */}
          {paymentStep === 'VERIFYING' && (
            <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center animate-spin">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Verifying Cryptographic Payment</h3>
                <p className="text-xs text-slate-400 mt-1">Executing server-side Paystack verification and double-entry ledger credit...</p>
              </div>
            </div>
          )}

          {/* STEP 5: SUCCESS CONFIRMATION */}
          {paymentStep === 'SUCCESS' && verificationResult && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100">Payment Verified &amp; Account Credited</h3>
                <p className="text-xs text-emerald-400 font-medium mt-1">
                  +{verificationResult.currency} {verificationResult.amount.toFixed(2)} added to Communication Balance
                </p>
              </div>

              {/* Receipt Summary Bento */}
              <div className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-left space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Reference:</span>
                  <span className="text-slate-200">{verificationResult.reference}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">New Available Balance:</span>
                  <span className="text-emerald-400 font-bold">
                    {verificationResult.currency} {verificationResult.newBalance?.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Target Wallet:</span>
                  <span className="text-slate-200 font-sans">Nanivio Communication Account</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Ledger Status:</span>
                  <span className="text-emerald-300 font-sans font-semibold">APPENDED (COMMUNICATION_TOPUP)</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs transition"
              >
                Close &amp; Return to Wallet
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
