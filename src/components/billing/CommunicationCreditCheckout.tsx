import React, { useState } from 'react';
import { useNanivio } from '../../context/NanivioContext';
import { protectedBillingRequest } from '../../lib/billingClient';

export const CommunicationCreditCheckout: React.FC<{
  plan: { tier: string; name: string; priceMonthlyUSD: number; priceMonthlyGHS: number; priceAnnualUSD: number; priceAnnualGHS: number };
  cycle: 'MONTHLY' | 'ANNUAL'; onClose: () => void; onSuccess: () => void;
}> = ({ plan, cycle, onClose, onSuccess }) => {
  const { authUser, billingSummary, refreshBilling } = useNanivio();
  const [currency, setCurrency] = useState<'USD' | 'GHS'>('USD');
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const amount = Number(cycle === 'ANNUAL'
    ? currency === 'USD' ? plan.priceAnnualUSD : plan.priceAnnualGHS
    : currency === 'USD' ? plan.priceMonthlyUSD : plan.priceMonthlyGHS);
  const balance = billingSummary?.userId === authUser?.id
    ? Number(billingSummary?.accounts?.communicationAccount?.wallets?.find(wallet => wallet.currency === currency)?.available || 0) : 0;
  const valid = Number.isFinite(amount) && amount > 0 && Number.isFinite(balance) && balance >= amount;
  const pay = async () => {
    if (busy || !valid) return;
    setBusy(true); setError('');
    try {
      await protectedBillingRequest('/api/billing/credit/communication-subscription', {
        method: 'POST', body: JSON.stringify({ planTier: plan.tier, billingCycle: cycle, currency, amount, requestId }),
      });
      setSuccess(true);
      try { await refreshBilling(); } catch { setError('Purchase confirmed. Refresh billing to load your updated benefits.'); }
      onSuccess();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Credit payment could not be confirmed. Check billing before starting another purchase.');
    } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[70] grid overflow-y-auto bg-black/80 p-4 place-items-center">
    <section role="dialog" aria-modal="true" aria-label="Pay with Nanivio credit" className="w-full max-w-md space-y-4 rounded-2xl border border-cyan-400/30 bg-slate-950 p-6 text-slate-100">
      <h2 className="text-lg font-semibold">Pay with Nanivio credit</h2>
      <p className="text-sm">{plan.name} · {cycle === 'ANNUAL' ? 'Annual' : 'Monthly'}</p>
      <p className="text-xs text-slate-400">Credit received from other Nanivio users is eligible. This spends service credit, not your minute allowances.</p>
      {!success && <>
        <label className="block text-sm">Credit currency<select disabled={busy} value={currency} onChange={event => setCurrency(event.target.value as 'USD' | 'GHS')} className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-900 p-3"><option value="USD">USD credit</option><option value="GHS">GHS credit</option></select></label>
        <p className="text-sm">To deduct: {currency} {Number.isFinite(amount) ? amount.toFixed(2) : 'Unavailable'} · Available: {currency} {balance.toFixed(2)}</p>
        {!valid && <p className="text-xs text-amber-200">Insufficient credit or an unavailable price. Add or receive credit, or choose another currency or payment method.</p>}
        <button type="button" disabled={busy || !valid} onClick={() => void pay()} className="min-h-11 w-full rounded-xl bg-cyan-300 p-3 font-semibold text-slate-950 disabled:opacity-50">{busy ? 'Confirming…' : 'Confirm credit payment'}</button>
      </>}
      {success && <p role="status" className="text-emerald-200">Subscription activated using Nanivio credit.</p>}
      {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
      <button type="button" disabled={busy} onClick={onClose} className="min-h-11 w-full rounded-xl border border-slate-600 p-3">Close</button>
    </section>
  </div>;
};
