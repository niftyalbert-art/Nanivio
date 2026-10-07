import React, { useState } from 'react';
import {
  X,
  CreditCard,
  Smartphone,
  Check,
  ShieldCheck,
  Building,
  Radio,
  Lock,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Coins,
  AlertCircle,
  ExternalLink,
  Copy,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { PlanTier } from '../../types';

export type PaymentPurpose =
  | { type: 'subscription'; tier: PlanTier; cycle: 'MONTHLY' | 'ANNUAL'; title: string; amountUSD: number; amountGHS: number }
  | { type: 'minutes'; minutes: number; costGHS: number; title: string }
  | { type: 'deposit'; currency: string; amount: number; title: string };

interface UniversalPaymentGatewayModalProps {
  purpose: PaymentPurpose;
  onClose: () => void;
  onSuccess?: (referenceId: string) => void;
}

export const UniversalPaymentGatewayModal: React.FC<UniversalPaymentGatewayModalProps> = ({
  purpose,
  onClose,
  onSuccess,
}) => {
  const {
    adminPaymentGateways,
    subscribeWithGateway,
    topUpMinutesWithGateway,
    depositViaGateway,
    currentUser,
  } = useNanivio();

  const [selectedGateway, setSelectedGateway] = useState<
    'mobileMoney' | 'cardPayment' | 'payPal' | 'googlePay' | 'applePay' | 'bankPayment'
  >('mobileMoney');

  // Form states
  const [momoNetwork, setMomoNetwork] = useState<'MTN' | 'Telecel' | 'AirtelTigo' | 'M-Pesa'>('MTN');
  const [momoPhoneNumber, setMomoPhoneNumber] = useState('0244198200');
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('888');
  const [cardName, setCardName] = useState(currentUser?.name || 'Nanivio User');
  const [isProcessing, setIsProcessing] = useState(false);
  const [successData, setSuccessData] = useState<{ referenceId: string; message: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Compute payment display amount
  const displayAmount =
    purpose.type === 'subscription'
      ? `GH₵ ${(purpose.cycle === 'ANNUAL' ? purpose.amountGHS * 10 : purpose.amountGHS).toFixed(2)}`
      : purpose.type === 'minutes'
      ? `GH₵ ${purpose.costGHS.toFixed(2)}`
      : `${purpose.currency} ${purpose.amount.toFixed(2)}`;

  const gatewayConfigs = [
    {
      id: 'mobileMoney' as const,
      name: 'Mobile Money',
      subtitle: 'MTN MoMo, Telecel, AirtelTigo, M-Pesa',
      icon: Smartphone,
      color: 'amber',
      enabled: adminPaymentGateways.mobileMoney.enabled,
      fee: adminPaymentGateways.mobileMoney.feePercent,
    },
    {
      id: 'cardPayment' as const,
      name: 'Credit / Debit Card',
      subtitle: 'Visa, Mastercard, Amex (3D Secure)',
      icon: CreditCard,
      color: 'cyan',
      enabled: adminPaymentGateways.cardPayment.enabled,
      fee: adminPaymentGateways.cardPayment.feePercent,
    },
    {
      id: 'payPal' as const,
      name: 'PayPal Express',
      subtitle: 'Global instant checkout',
      icon: ExternalLink,
      color: 'blue',
      enabled: adminPaymentGateways.payPal.enabled,
      fee: adminPaymentGateways.payPal.feePercent,
    },
    {
      id: 'googlePay' as const,
      name: 'Google Pay',
      subtitle: 'Fast 1-tap checkout',
      icon: Lock,
      color: 'emerald',
      enabled: adminPaymentGateways.googlePay.enabled,
      fee: adminPaymentGateways.googlePay.feePercent,
    },
    {
      id: 'applePay' as const,
      name: 'Apple Pay',
      subtitle: 'Touch ID / Face ID payment',
      icon: ShieldCheck,
      color: 'slate',
      enabled: adminPaymentGateways.applePay.enabled,
      fee: adminPaymentGateways.applePay.feePercent,
    },
    {
      id: 'bankPayment' as const,
      name: 'Direct Bank Wire',
      subtitle: 'SWIFT, IBAN & Local Clearing',
      icon: Building,
      color: 'purple',
      enabled: adminPaymentGateways.bankPayment.enabled,
      fee: adminPaymentGateways.bankPayment.feePercent,
    },
  ];

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleProcessPayment = async () => {
    setIsProcessing(true);
    try {
      let res: { success: boolean; referenceId: string; message: string };

      if (purpose.type === 'subscription') {
        res = await subscribeWithGateway(
          purpose.tier,
          selectedGateway,
          purpose.cycle,
          { network: momoNetwork, phoneNumber: momoPhoneNumber }
        );
        onClose();
        return;
      } else if (purpose.type === 'minutes') {
        res = await topUpMinutesWithGateway(
          purpose.minutes,
          purpose.costGHS,
          'GHS',
          selectedGateway,
          { network: momoNetwork, phoneNumber: momoPhoneNumber }
        );
        onClose();
        return;
      } else {
        res = await depositViaGateway(
          selectedGateway,
          purpose.amount,
          purpose.currency,
          { network: momoNetwork, phoneNumber: momoPhoneNumber }
        );
      }

      if (res.success) {
        setSuccessData(res);
        if (onSuccess) {
          onSuccess(res.referenceId);
        }
      }
    } catch (err: any) {
      alert(`Payment failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-[#0b1424] border border-cyan-500/30 rounded-3xl w-full max-w-2xl p-5 sm:p-7 shadow-2xl space-y-6 my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-emerald-400 p-0.5 shadow-md shadow-cyan-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Lock className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white">Nanivio Secure Payment Gateway</h2>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/30">
                  256-BIT ENCRYPTED
                </span>
              </div>
              <p className="text-xs text-slate-400">{purpose.title}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-900 border border-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success View */}
        {successData ? (
          <div className="py-8 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/30">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>
            <h3 className="text-xl font-bold text-white">Payment Authorized &amp; Settled!</h3>
            <p className="text-sm text-slate-300 max-w-md mx-auto">{successData.message}</p>
            <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 inline-block font-mono text-xs text-emerald-300">
              Transaction Ref: <span className="font-bold">{successData.referenceId}</span>
            </div>
            <div className="pt-4">
              <button
                onClick={onClose}
                className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/30 transition-all"
              >
                Done / Return to Workspace
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Amount Summary Badge */}
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase font-mono text-slate-400">Total Payable Amount</div>
                <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">{displayAmount}</div>
              </div>
              <div className="text-right">
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-bold border border-cyan-500/30">
                  Instant Credit
                </span>
              </div>
            </div>

            {/* Gateway Selection Grid */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Select Payment Rail ({gatewayConfigs.filter((g) => g.enabled).length} Active)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {gatewayConfigs.map((g) => {
                  const Icon = g.icon;
                  const isSelected = selectedGateway === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      disabled={!g.enabled}
                      onClick={() => setSelectedGateway(g.id)}
                      className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'bg-cyan-500/15 border-cyan-400 shadow-md shadow-cyan-500/20 text-white'
                          : g.enabled
                          ? 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700'
                          : 'bg-slate-950/50 border-slate-900 text-slate-600 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-2">
                        <div
                          className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                            isSelected ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-cyan-400 stroke-[3]" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold">{g.name}</div>
                        <div className="text-[10px] text-slate-400 line-clamp-1">{g.subtitle}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Gateway Form Controls */}
            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
              {/* 1. Mobile Money */}
              {selectedGateway === 'mobileMoney' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-amber-400" />
                      Mobile Money Direct Settlement
                    </span>
                    <span className="text-[10px] text-amber-300 font-mono">
                      Fee: {adminPaymentGateways.mobileMoney.feePercent}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(['MTN', 'Telecel', 'AirtelTigo', 'M-Pesa'] as const).map((net) => (
                      <button
                        key={net}
                        type="button"
                        onClick={() => setMomoNetwork(net)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                          momoNetwork === net
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-sm'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        {net}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Your {momoNetwork} Mobile Money Number
                    </label>
                    <input
                      type="tel"
                      value={momoPhoneNumber}
                      onChange={(e) => setMomoPhoneNumber(e.target.value)}
                      placeholder="e.g. 0244198200"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                    <div className="text-amber-400 font-bold">Admin Receiving Account:</div>
                    <div className="flex items-center justify-between font-mono text-slate-300">
                      <span>MTN MoMo: {adminPaymentGateways.mobileMoney.mtnMoMoNumber}</span>
                      <span className="text-[10px] text-slate-500">
                        {adminPaymentGateways.mobileMoney.mtnMerchantName}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {adminPaymentGateways.mobileMoney.instructions}
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Card Payment */}
              {selectedGateway === 'cardPayment' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-cyan-400" />
                      Card Details ({adminPaymentGateways.cardPayment.processor})
                    </span>
                    <span className="text-[10px] text-cyan-300 font-mono">
                      Fee: {adminPaymentGateways.cardPayment.feePercent}%
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Cardholder Name</label>
                    <input
                      type="text"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Card Number</label>
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">Expires</label>
                      <input
                        type="text"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">CVC / CVV</label>
                      <input
                        type="password"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 3. PayPal */}
              {selectedGateway === 'payPal' && (
                <div className="space-y-3 text-xs text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">PayPal Express Checkout</span>
                    <span className="text-[10px] text-blue-400 font-mono">
                      Fee: {adminPaymentGateways.payPal.feePercent}%
                    </span>
                  </div>
                  <p className="text-slate-400">
                    You will be securely authenticated with your PayPal account ({adminPaymentGateways.payPal.merchantEmail}).
                  </p>
                  <div className="p-3 bg-blue-950/40 border border-blue-500/30 rounded-xl text-[11px] text-blue-200">
                    ● Mode: {adminPaymentGateways.payPal.mode.toUpperCase()} (Client ID: {adminPaymentGateways.payPal.clientId})
                  </div>
                </div>
              )}

              {/* 4. Google Pay */}
              {selectedGateway === 'googlePay' && (
                <div className="space-y-3 text-xs text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Google Pay Express</span>
                    <span className="text-[10px] text-emerald-400 font-mono">0% Processing Fee</span>
                  </div>
                  <p className="text-slate-400">
                    Authenticate via your Google Account with 1-tap instant tokenization.
                  </p>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-[11px] text-emerald-300">
                    Merchant ID: {adminPaymentGateways.googlePay.merchantId}
                  </div>
                </div>
              )}

              {/* 5. Apple Pay */}
              {selectedGateway === 'applePay' && (
                <div className="space-y-3 text-xs text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Apple Pay</span>
                    <span className="text-[10px] text-slate-300 font-mono">0% Processing Fee</span>
                  </div>
                  <p className="text-slate-400">
                    Authorize with Face ID / Touch ID on your Apple ecosystem device.
                  </p>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300">
                    Domain: {adminPaymentGateways.applePay.domainName}
                  </div>
                </div>
              )}

              {/* 6. Bank Wire Transfer */}
              {selectedGateway === 'bankPayment' && (
                <div className="space-y-3 text-xs text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <Building className="w-4 h-4 text-purple-400" />
                      Official Bank Wire Transfer Details
                    </span>
                    <span className="text-[10px] text-purple-300 font-mono">0% Processing Fee</span>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 font-mono text-[11px]">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                      <span className="text-slate-500">Bank:</span>
                      <span className="text-white font-bold">{adminPaymentGateways.bankPayment.bankName}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                      <span className="text-slate-500">Account Name:</span>
                      <span className="text-white font-bold">{adminPaymentGateways.bankPayment.accountName}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                      <span className="text-slate-500">Account Number:</span>
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        {adminPaymentGateways.bankPayment.accountNumber}
                        <button
                          onClick={() => handleCopy(adminPaymentGateways.bankPayment.accountNumber, 'acc')}
                          className="text-slate-400 hover:text-white"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                      <span className="text-slate-500">SWIFT / BIC:</span>
                      <span className="text-cyan-300 font-bold">{adminPaymentGateways.bankPayment.swiftBic}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 pt-1">
                      {adminPaymentGateways.bankPayment.wireInstructions}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Authorization CTA */}
            <button
              onClick={handleProcessPayment}
              disabled={isProcessing}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-extrabold text-sm shadow-xl shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Authorizing on {selectedGateway}...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Confirm &amp; Pay {displayAmount}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
