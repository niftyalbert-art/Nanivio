import React, { useState } from 'react';
import { billingClient } from '../../lib/billingClient';

/** Reuses server-owned orders and live verification; never starts a new charge. */
export function PaystackPaymentRecovery({ onRecovered }: { onRecovered: () => void | Promise<void> }) {
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  async function recover(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      await billingClient.verifyPaystack(reference.trim());
      setMessage('Payment verified and purchase activated. No additional charge was made.');
      try {
        await onRecovered();
      } catch {
        setMessage('Payment verified and purchase activated. Reload billing to see your updated allowance.');
      }
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : 'Unable to check payment. Keep your reference and do not pay again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-xl border border-slate-700 p-4 text-sm">
      <summary className="cursor-pointer font-semibold">Already paid? Recover your purchase</summary>
      <p className="mt-3 text-slate-400">If payment completed but your plan, minutes or wallet credit are missing, enter the Paystack reference. This checks the original payment without charging again.</p>
      <form onSubmit={recover} className="mt-3 flex flex-wrap gap-2">
        <label className="min-w-0 flex-1 basis-56">
          <span className="block text-xs text-slate-400">Paystack transaction reference</span>
          <input required maxLength={120} value={reference} onChange={event => setReference(event.target.value)}
            placeholder="NV-PSTK-…" autoComplete="off" disabled={busy}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-white" />
        </label>
        <button type="submit" disabled={busy || !reference.trim()}
          className="min-h-11 self-end rounded-lg border border-emerald-500/40 px-4 font-semibold text-emerald-200 disabled:opacity-50">
          {busy ? 'Checking payment…' : 'Verify & recover'}
        </button>
      </form>
      {message && <p className={`mt-3 break-words ${failed ? 'text-amber-200' : 'text-emerald-200'}`} role={failed ? 'alert' : 'status'}>{message}</p>}
    </details>
  );
}
