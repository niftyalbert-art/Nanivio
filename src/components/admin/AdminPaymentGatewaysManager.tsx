import React, { useState } from 'react';
import {
  CreditCard,
  Smartphone,
  Building,
  Lock,
  ShieldCheck,
  ExternalLink,
  Save,
  RotateCcw,
  Check,
  Plus,
  Coins,
  AlertTriangle,
  Info,
  Radio,
  Sliders,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { AdminPaymentGatewayDetails } from '../../types/billing';
import { INITIAL_ADMIN_PAYMENT_GATEWAYS } from '../../data/mockData';

export const AdminPaymentGatewaysManager: React.FC = () => {
  const {
    adminPaymentGateways,
    updatePaymentGatewayDetails,
    currentPlan,
    adminAdjustUserMinutes,
    adminAdjustUserQuota,
    adminFeatures,
    updateAdminFeature,
    isSubscribed,
    isFreeTrialActive,
    usedLangpretationMinutes,
    adminSetMeterDigits,
    adminSetSubscriptionStatus,
  } = useNanivio();

  const [activeGatewayTab, setActiveGatewayTab] = useState<
    'mobileMoney' | 'cardPayment' | 'payPal' | 'googlePay' | 'applePay' | 'bankPayment' | 'minutesMeter'
  >('mobileMoney');

  const [formData, setFormData] = useState<AdminPaymentGatewayDetails>(adminPaymentGateways);
  const [saveToast, setSaveToast] = useState(false);
  const [bonusMinutesInput, setBonusMinutesInput] = useState('50');
  const [quotaInput, setQuotaInput] = useState(currentPlan.langpretationMinutesQuota.toString());
  const [meterToast, setMeterToast] = useState<string | null>(null);

  // Live Meter Digits direct editing state
  const [customRemainingInput, setCustomRemainingInput] = useState(String(currentPlan.langpretationMinutesRemaining));
  const [customQuotaInput, setCustomQuotaInput] = useState(String(currentPlan.langpretationMinutesQuota));
  const [customUsedInput, setCustomUsedInput] = useState(String(usedLangpretationMinutes || 0));

  React.useEffect(() => {
    setCustomRemainingInput(String(currentPlan.langpretationMinutesRemaining));
    setCustomQuotaInput(String(currentPlan.langpretationMinutesQuota));
    setCustomUsedInput(String(usedLangpretationMinutes || 0));
  }, [currentPlan.langpretationMinutesRemaining, currentPlan.langpretationMinutesQuota, usedLangpretationMinutes]);

  // Sync form state when adminPaymentGateways changes
  React.useEffect(() => {
    setFormData(adminPaymentGateways);
  }, [adminPaymentGateways]);

  const handleSaveCurrentGateway = (key: keyof AdminPaymentGatewayDetails) => {
    updatePaymentGatewayDetails(key, formData[key]);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  const handleResetDefaults = () => {
    if (confirm('Reset all payment gateway details to system factory defaults?')) {
      setFormData(INITIAL_ADMIN_PAYMENT_GATEWAYS);
      Object.keys(INITIAL_ADMIN_PAYMENT_GATEWAYS).forEach((k) => {
        updatePaymentGatewayDetails(k as any, INITIAL_ADMIN_PAYMENT_GATEWAYS[k as keyof AdminPaymentGatewayDetails]);
      });
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
    }
  };

  const handleAddBonusMinutes = () => {
    const mins = parseInt(bonusMinutesInput);
    if (mins) {
      adminAdjustUserMinutes(mins, 'Admin Override Grant');
      setMeterToast(`Successfully credited +${mins} Langpretation minutes to user.`);
      setTimeout(() => setMeterToast(null), 3000);
    }
  };

  const handleUpdateMonthlyQuota = () => {
    const q = parseInt(quotaInput);
    if (q >= 0) {
      adminAdjustUserQuota(q);
      setMeterToast(`Monthly base quota adjusted to ${q} minutes.`);
      setTimeout(() => setMeterToast(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#0c1c33] via-[#091528] to-[#080e1a] border border-cyan-500/30 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-mono font-bold border border-cyan-500/30">
              Admin Financial Core
            </span>
            <span className="text-xs text-slate-400">Payment Gateways &amp; Meter Control Center</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-1">
            Global Payment Gateways &amp; Minute Quota Engine
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Configure real-time credentials, merchant accounts, fee percentages, and wire details across Mobile Money, Cards, PayPal, Apple Pay, Google Pay, and Bank Rails. Changes take effect instantly for all subscribers.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={() => updateAdminFeature('commFintechEnabled', !adminFeatures?.commFintechEnabled)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              adminFeatures?.commFintechEnabled
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
            }`}
            title="Toggle Fintech visibility inside Communication Hub"
          >
            <span className={`w-2 h-2 rounded-full ${adminFeatures?.commFintechEnabled ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span>Comm Hub Fintech: {adminFeatures?.commFintechEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-bold transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      {saveToast && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-2xl text-xs text-emerald-200 flex items-center gap-2 animate-in fade-in duration-200">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>Payment Gateway configuration saved and published live to Nanivio subscriber applications!</span>
        </div>
      )}

      {meterToast && (
        <div className="p-3 bg-cyan-950/80 border border-cyan-500/50 rounded-2xl text-xs text-cyan-200 flex items-center gap-2 animate-in fade-in duration-200">
          <Check className="w-4 h-4 text-cyan-400" />
          <span>{meterToast}</span>
        </div>
      )}

      {/* Gateway Sub-navigation Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800">
        {[
          { id: 'mobileMoney', label: 'Mobile Money', icon: Smartphone, color: 'text-amber-400' },
          { id: 'cardPayment', label: 'Credit / Debit Cards', icon: CreditCard, color: 'text-cyan-400' },
          { id: 'payPal', label: 'PayPal', icon: ExternalLink, color: 'text-blue-400' },
          { id: 'googlePay', label: 'Google Pay', icon: Lock, color: 'text-emerald-400' },
          { id: 'applePay', label: 'Apple Pay', icon: ShieldCheck, color: 'text-slate-300' },
          { id: 'bankPayment', label: 'Direct Bank Wire', icon: Building, color: 'text-purple-400' },
          { id: 'minutesMeter', label: 'Minutes Meter & Quotas', icon: Radio, color: 'text-rose-400' },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeGatewayTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveGatewayTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
                isActive
                  ? 'bg-slate-800 text-white border border-slate-700 shadow-md'
                  : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-900'
              }`}
            >
              <Icon className={`w-4 h-4 ${tab.color}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. Mobile Money Configuration */}
      {activeGatewayTab === 'mobileMoney' && (
        <div className="bg-[#0b1424] border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-amber-400" />
                Mobile Money (MoMo) Master Credentials
              </h3>
              <p className="text-xs text-slate-400">
                Supports MTN Mobile Money, Telecel Cash, AirtelTigo Money, and Safaricom M-Pesa.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-2 cursor-pointer">
                <span>Rail Active:</span>
                <input
                  type="checkbox"
                  checked={formData.mobileMoney.enabled}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      mobileMoney: { ...formData.mobileMoney, enabled: e.target.checked },
                    })
                  }
                  className="w-4 h-4 accent-amber-500 rounded"
                />
              </label>
              <button
                onClick={() => handleSaveCurrentGateway('mobileMoney')}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/25 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">MTN MoMo Number</label>
              <input
                type="text"
                value={formData.mobileMoney.mtnMoMoNumber}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    mobileMoney: { ...formData.mobileMoney, mtnMoMoNumber: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">MTN Merchant Name</label>
              <input
                type="text"
                value={formData.mobileMoney.mtnMerchantName}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    mobileMoney: { ...formData.mobileMoney, mtnMerchantName: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Telecel Cash Shortcode / Merchant</label>
              <input
                type="text"
                value={formData.mobileMoney.telecelCashMerchant}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    mobileMoney: { ...formData.mobileMoney, telecelCashMerchant: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">AirtelTigo Money Number</label>
              <input
                type="text"
                value={formData.mobileMoney.airtelTigoNumber}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    mobileMoney: { ...formData.mobileMoney, airtelTigoNumber: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">M-Pesa Till / Paybill Number</label>
              <input
                type="text"
                value={formData.mobileMoney.mpesaTillNumber}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    mobileMoney: { ...formData.mobileMoney, mpesaTillNumber: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Gateway Fee (%)</label>
              <input
                type="number"
                step="0.1"
                value={formData.mobileMoney.feePercent}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    mobileMoney: { ...formData.mobileMoney, feePercent: parseFloat(e.target.value) || 0 },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-400"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-400 mb-1">Subscriber Instructions</label>
              <textarea
                rows={2}
                value={formData.mobileMoney.instructions}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    mobileMoney: { ...formData.mobileMoney, instructions: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. Card Payment Configuration */}
      {activeGatewayTab === 'cardPayment' && (
        <div className="bg-[#0b1424] border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-cyan-400" />
                Credit &amp; Debit Card Processor
              </h3>
              <p className="text-xs text-slate-400">
                Stripe &amp; Paystack Unified Processing Engine (Visa, MasterCard, Amex)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-2 cursor-pointer">
                <span>Rail Active:</span>
                <input
                  type="checkbox"
                  checked={formData.cardPayment.enabled}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      cardPayment: { ...formData.cardPayment, enabled: e.target.checked },
                    })
                  }
                  className="w-4 h-4 accent-cyan-500 rounded"
                />
              </label>
              <button
                onClick={() => handleSaveCurrentGateway('cardPayment')}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/25 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Processor</label>
              <select
                value={formData.cardPayment.processor}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    cardPayment: { ...formData.cardPayment, processor: e.target.value as any },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
              >
                <option value="Paystack">Paystack</option>
                <option value="Stripe">Stripe</option>
                <option value="Unified Direct">Unified Direct Rails</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Processing Fee (%)</label>
              <input
                type="number"
                step="0.1"
                value={formData.cardPayment.feePercent}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    cardPayment: { ...formData.cardPayment, feePercent: parseFloat(e.target.value) || 0 },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-cyan-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Public Key / API Key</label>
              <input
                type="text"
                value={formData.cardPayment.publicKey}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    cardPayment: { ...formData.cardPayment, publicKey: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">3D Secure 2.0 Auth</label>
              <div className="pt-2">
                <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={formData.cardPayment.threeDSecureRequired}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        cardPayment: { ...formData.cardPayment, threeDSecureRequired: e.target.checked },
                      })
                    }
                    className="w-4 h-4 accent-cyan-500 rounded"
                  />
                  <span>Enforce Strict 3DS OTP Authentication</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. PayPal Configuration */}
      {activeGatewayTab === 'payPal' && (
        <div className="bg-[#0b1424] border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ExternalLink className="w-5 h-5 text-blue-400" />
                PayPal Global Express Configuration
              </h3>
              <p className="text-xs text-slate-400">Global PayPal wallet and card clearing</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-2 cursor-pointer">
                <span>Rail Active:</span>
                <input
                  type="checkbox"
                  checked={formData.payPal.enabled}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      payPal: { ...formData.payPal, enabled: e.target.checked },
                    })
                  }
                  className="w-4 h-4 accent-blue-500 rounded"
                />
              </label>
              <button
                onClick={() => handleSaveCurrentGateway('payPal')}
                className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs shadow-lg shadow-blue-500/25 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Merchant Email</label>
              <input
                type="email"
                value={formData.payPal.merchantEmail}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    payPal: { ...formData.payPal, merchantEmail: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Client ID</label>
              <input
                type="text"
                value={formData.payPal.clientId}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    payPal: { ...formData.payPal, clientId: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Environment Mode</label>
              <select
                value={formData.payPal.mode}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    payPal: { ...formData.payPal, mode: e.target.value as any },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
              >
                <option value="live">Live Production</option>
                <option value="sandbox">Sandbox Test</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Processing Fee (%)</label>
              <input
                type="number"
                step="0.1"
                value={formData.payPal.feePercent}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    payPal: { ...formData.payPal, feePercent: parseFloat(e.target.value) || 0 },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-blue-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. Google Pay Configuration */}
      {activeGatewayTab === 'googlePay' && (
        <div className="bg-[#0b1424] border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-400" />
                Google Pay API Gateway
              </h3>
              <p className="text-xs text-slate-400">Google Pay instant mobile and web checkout</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-2 cursor-pointer">
                <span>Rail Active:</span>
                <input
                  type="checkbox"
                  checked={formData.googlePay.enabled}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      googlePay: { ...formData.googlePay, enabled: e.target.checked },
                    })
                  }
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
              </label>
              <button
                onClick={() => handleSaveCurrentGateway('googlePay')}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Google Merchant ID</label>
              <input
                type="text"
                value={formData.googlePay.merchantId}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    googlePay: { ...formData.googlePay, merchantId: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Merchant Display Name</label>
              <input
                type="text"
                value={formData.googlePay.merchantName}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    googlePay: { ...formData.googlePay, merchantName: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Environment</label>
              <select
                value={formData.googlePay.environment}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    googlePay: { ...formData.googlePay, environment: e.target.value as any },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
              >
                <option value="PRODUCTION">PRODUCTION</option>
                <option value="TEST">TEST</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Processing Fee (%)</label>
              <input
                type="number"
                step="0.1"
                value={formData.googlePay.feePercent}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    googlePay: { ...formData.googlePay, feePercent: parseFloat(e.target.value) || 0 },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* 5. Apple Pay Configuration */}
      {activeGatewayTab === 'applePay' && (
        <div className="bg-[#0b1424] border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-slate-300" />
                Apple Pay Processing Gateway
              </h3>
              <p className="text-xs text-slate-400">Apple Pay tokenized biometric payments</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-2 cursor-pointer">
                <span>Rail Active:</span>
                <input
                  type="checkbox"
                  checked={formData.applePay.enabled}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      applePay: { ...formData.applePay, enabled: e.target.checked },
                    })
                  }
                  className="w-4 h-4 accent-slate-400 rounded"
                />
              </label>
              <button
                onClick={() => handleSaveCurrentGateway('applePay')}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-white text-slate-950 font-bold text-xs shadow-lg flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Merchant Identifier</label>
              <input
                type="text"
                value={formData.applePay.merchantIdentifier}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    applePay: { ...formData.applePay, merchantIdentifier: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Registered Domain Name</label>
              <input
                type="text"
                value={formData.applePay.domainName}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    applePay: { ...formData.applePay, domainName: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* 6. Bank Payment Configuration */}
      {activeGatewayTab === 'bankPayment' && (
        <div className="bg-[#0b1424] border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Building className="w-5 h-5 text-purple-400" />
                Direct Bank Wire &amp; SWIFT Clearing Details
              </h3>
              <p className="text-xs text-slate-400">
                Official receiving account information displayed to subscribers for wire transfers.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-2 cursor-pointer">
                <span>Rail Active:</span>
                <input
                  type="checkbox"
                  checked={formData.bankPayment.enabled}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bankPayment: { ...formData.bankPayment, enabled: e.target.checked },
                    })
                  }
                  className="w-4 h-4 accent-purple-500 rounded"
                />
              </label>
              <button
                onClick={() => handleSaveCurrentGateway('bankPayment')}
                className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-bold text-xs shadow-lg shadow-purple-500/25 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Bank Name</label>
              <input
                type="text"
                value={formData.bankPayment.bankName}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bankPayment: { ...formData.bankPayment, bankName: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Account Name</label>
              <input
                type="text"
                value={formData.bankPayment.accountName}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bankPayment: { ...formData.bankPayment, accountName: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Account Number</label>
              <input
                type="text"
                value={formData.bankPayment.accountNumber}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bankPayment: { ...formData.bankPayment, accountNumber: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">IBAN</label>
              <input
                type="text"
                value={formData.bankPayment.iban}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bankPayment: { ...formData.bankPayment, iban: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">SWIFT / BIC Code</label>
              <input
                type="text"
                value={formData.bankPayment.swiftBic}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bankPayment: { ...formData.bankPayment, swiftBic: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-cyan-300"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Branch Code / Sort Code</label>
              <input
                type="text"
                value={formData.bankPayment.branchCode}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bankPayment: { ...formData.bankPayment, branchCode: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-400 mb-1">Wire Transfer Instructions for User</label>
              <textarea
                rows={2}
                value={formData.bankPayment.wireInstructions}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bankPayment: { ...formData.bankPayment, wireInstructions: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* 7. Minutes Meter & Quota Engine */}
      {activeGatewayTab === 'minutesMeter' && (
        <div className="bg-[#0b1424] border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Radio className="w-5 h-5 text-rose-400" />
              Live Minutes Meter &amp; Quota Override
            </h3>
            <p className="text-xs text-slate-400">
              Administer subscriber live speech translation balances, credit promotional bundles, and modify monthly caps.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Live State Card */}
            <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-400 uppercase font-mono">Current User Live Meter</div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${
                    isSubscribed
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : isFreeTrialActive
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  }`}
                >
                  {isSubscribed ? 'Subscribed' : isFreeTrialActive ? 'Free Trial' : 'Unsubscribed'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
                <div>
                  <div className="text-xl font-extrabold text-emerald-400 font-mono">
                    {currentPlan.langpretationMinutesRemaining}
                  </div>
                  <div className="text-[10px] text-slate-400">Remaining (m)</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-cyan-400 font-mono">
                    {currentPlan.langpretationMinutesQuota}
                  </div>
                  <div className="text-[10px] text-slate-400">Quota (m)</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-amber-400 font-mono">
                    {usedLangpretationMinutes || 0}
                  </div>
                  <div className="text-[10px] text-slate-400">Used (m)</div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80">
                <div className="text-[11px] font-bold text-slate-300 mb-2">Switch Subscription State:</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => {
                      adminSetSubscriptionStatus(true, false);
                      setMeterToast('User subscription activated.');
                      setTimeout(() => setMeterToast(null), 3000);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                      isSubscribed
                        ? 'bg-emerald-500 text-slate-950 shadow'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    Subscribed
                  </button>
                  <button
                    onClick={() => {
                      adminSetSubscriptionStatus(false, true, 15);
                      setMeterToast('15-Minute Free Trial activated.');
                      setTimeout(() => setMeterToast(null), 3000);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                      isFreeTrialActive
                        ? 'bg-cyan-500 text-slate-950 shadow'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    Free Trial (15m)
                  </button>
                  <button
                    onClick={() => {
                      adminSetSubscriptionStatus(false, false);
                      setMeterToast('Unsubscribed: All meter digits set to zero.');
                      setTimeout(() => setMeterToast(null), 3000);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                      !isSubscribed && !isFreeTrialActive
                        ? 'bg-rose-500 text-white shadow'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    Zero All (0m)
                  </button>
                </div>
              </div>
            </div>

            {/* Direct Digits Live Editor */}
            <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
              <div className="text-xs font-bold text-cyan-400 uppercase font-mono">
                Direct Meter Digits Live Editor
              </div>
              <p className="text-[11px] text-slate-400">
                Modify exact numerical digits shown in the user's Langpretation meter:
              </p>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300 font-mono">Remaining Mins:</span>
                  <input
                    type="number"
                    value={customRemainingInput}
                    onChange={(e) => setCustomRemainingInput(e.target.value)}
                    className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-emerald-400 text-right"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300 font-mono">Monthly Quota:</span>
                  <input
                    type="number"
                    value={customQuotaInput}
                    onChange={(e) => setCustomQuotaInput(e.target.value)}
                    className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-cyan-300 text-right"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300 font-mono">Used Minutes:</span>
                  <input
                    type="number"
                    value={customUsedInput}
                    onChange={(e) => setCustomUsedInput(e.target.value)}
                    className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-amber-300 text-right"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  const rem = parseInt(customRemainingInput) || 0;
                  const quota = parseInt(customQuotaInput) || 0;
                  const used = parseInt(customUsedInput) || 0;
                  adminSetMeterDigits(rem, quota, used);
                  setMeterToast(`Live meter updated: ${rem} rem, ${quota} quota, ${used} used.`);
                  setTimeout(() => setMeterToast(null), 3000);
                }}
                className="w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow cursor-pointer mt-2"
              >
                Apply Live Meter Digits
              </button>
            </div>

            {/* Grant Minutes Tool */}
            <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase font-mono">Quick Credit Minutes</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={bonusMinutesInput}
                  onChange={(e) => setBonusMinutesInput(e.target.value)}
                  placeholder="e.g. 50"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-400 focus:outline-none"
                />
                <button
                  onClick={handleAddBonusMinutes}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-md cursor-pointer"
                >
                  + Add
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Instantly credits top-up or referral minutes to the user's active Langpretation balance.
              </p>
              {meterToast && (
                <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono">
                  {meterToast}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
