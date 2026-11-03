import React, { useEffect, useRef, useState } from 'react';
import { billingClient } from '../../lib/billingClient';
import { clearPaystackReturn, pendingPaystackReturn } from '../../lib/paystackReturn';
import { PaymentReceipt } from './PaymentReceipt';

export const BillingPaymentConfirmation: React.FC<{
  owner: string; refresh: () => Promise<void>; onViewBilling: (purpose: string) => void;
}> = ({ owner, refresh, onViewBilling }) => {
  const [reference, setReference] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [checking, setChecking] = useState(false);
  const dismissed = useRef(new Set<string>());
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    dismissed.current.clear();
    setReference(null); setResult(null);
    const checkReturn = () => {
      const ref = pendingPaystackReturn(owner);
      if (ref && !dismissed.current.has(ref)) { setReference(ref); setAttempt(value => value + 1); }
    };
    const activated = (event: Event) => {
      const ref = (event as CustomEvent).detail?.reference;
      if (typeof ref === 'string' && /^[A-Za-z0-9_.=-]{1,120}$/.test(ref)) {
        setReference(ref); setAttempt(value => value + 1);
      }
    };
    checkReturn();
    window.addEventListener('focus', checkReturn);
    window.addEventListener('nanivio:payment-activated', activated);
    return () => {
      window.removeEventListener('focus', checkReturn);
      window.removeEventListener('nanivio:payment-activated', activated);
    };
  }, [owner]);
  useEffect(() => {
    if (!owner || !reference) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    setResult(null); setChecking(true); setMessage('Checking your original payment. Please do not pay again.');
    const verify = async () => {
      try {
        const verified = await billingClient.verifyPaystack(reference);
        if (cancelled) return;
        if (verified.success !== true || verified.verified !== true || !verified.purchase) throw new Error('Purchase activation could not be confirmed. Keep your reference and check again.');
        setResult(verified); setChecking(false); setMessage('');
        clearPaystackReturn(owner, reference);
        try { await refreshRef.current(); }
        catch { if (!cancelled) setMessage('Payment is activated. Reload billing if your displayed allowance has not refreshed.'); }
      } catch (error: any) {
        if (cancelled) return;
        setMessage(error.message || 'We could not confirm activation. Keep your reference and do not pay again.');
        if (['PAYMENT_PENDING', 'PAYMENT_ACTIVATION_PENDING'].includes(error.code) && ++tries < 6) {
          timer = setTimeout(() => { void verify(); }, 2500);
        } else setChecking(false);
      }
    };
    void verify();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [owner, reference, attempt]);
  if (!owner || !reference) return null;
  const close = () => { dismissed.current.add(reference); setReference(null); };
  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
    <section role="dialog" aria-modal="true" aria-label="Payment confirmation"
      className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
      {result ? <PaymentReceipt result={result}/> : <>
        <h2 className="text-xl font-semibold text-white">{checking ? 'Confirming your purchase' : 'Payment needs checking'}</h2>
        <p className="mt-3 break-all text-xs text-slate-400">Reference: {reference}</p>
      </>}
      {message && <p role={checking ? 'status' : 'alert'} className="mt-4 text-sm text-slate-200">{message}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        {result ? <button type="button" className="rounded-xl bg-amber-100 px-4 py-3 font-semibold text-slate-950"
          onClick={() => { onViewBilling(result.purchase.purpose); close(); }}>View my plan or balance</button>
          : <button type="button" disabled={checking} className="rounded-xl bg-amber-100 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50"
            onClick={() => setAttempt(value => value + 1)}>{checking ? 'Checking…' : 'Check again'}</button>}
        <button type="button" onClick={close} className="rounded-xl border border-slate-600 px-4 py-3 text-white">Close</button>
      </div>
    </section>
  </div>;
};
