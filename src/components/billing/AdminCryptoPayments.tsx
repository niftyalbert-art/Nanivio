import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import { cryptoBillingClient, type CryptoInvoice } from '../../lib/cryptoBillingClient';

const exactAmount = (value: string) => {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value;
  const fraction = match[2] || '';
  return fraction.length <= 6 ? `${match[1]}.${fraction.padEnd(6, '0')}` : value;
};

export const AdminCryptoPayments: React.FC = () => {
  const [invoices, setInvoices] = useState<CryptoInvoice[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [hashes, setHashes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await cryptoBillingClient.adminList();
      setInvoices(result.invoices); setEnabled(result.enabled); setReason(result.reason || '');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load crypto invoices.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const recheck = async (invoice: CryptoInvoice, acceptLate = false) => {
    const transactionId = (hashes[invoice.id] || invoice.transactionId || '').trim();
    if (!transactionId) { setError('Enter the transaction hash before checking this invoice.'); return; }
    if (acceptLate && !window.confirm('Confirm that you independently verified this late payment on TRON mainnet, including the USDT TRC20 contract, destination, exact amount, and confirmation status. Approve activation?')) return;
    setBusyId(invoice.id); setError(''); setMessage('');
    try {
      const result = await cryptoBillingClient.adminCheck(invoice.id, transactionId, acceptLate);
      setInvoices(current => current.map(item => item.id === invoice.id ? result.invoice : item));
      setMessage(acceptLate ? 'Late-payment approval submitted.' : 'Invoice rechecked.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not recheck invoice.'); }
    finally { setBusyId(''); }
  };

  return <section aria-label="Crypto payments" className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold text-slate-100">Crypto payments</h2><p className="mt-1 text-xs text-slate-400">Review direct TRON mainnet USDT subscription invoices. No wallet or refund controls are available here.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-slate-200 hover:border-amber-400/50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh list</button>
    </div>
    {enabled === false && <p className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-100">Crypto checkout is disabled. {reason}</p>}
    {error && <p role="alert" className="flex gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
    {message && <p role="status" className="flex gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs text-emerald-200"><Check className="h-4 w-4 shrink-0" />{message}</p>}
    {loading ? <div className="space-y-3" aria-label="Loading invoices"><div className="h-20 animate-pulse rounded-xl bg-slate-800" /><div className="h-20 animate-pulse rounded-xl bg-slate-800" /></div> :
      !error && invoices.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-8 text-center"><Clock3 className="mx-auto h-6 w-6 text-slate-500" /><p className="mt-2 text-sm font-semibold text-slate-200">No crypto invoices yet</p><p className="mt-1 text-xs text-slate-500">Authenticated billing invoices will appear here.</p></div> :
      <div className="space-y-3">{invoices.map(invoice => {
        const late = invoice.status === 'EXPIRED' || Date.parse(invoice.expiresAt) <= Date.now();
        return <article key={invoice.id} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="text-sm font-bold text-slate-100">{invoice.planName} · {invoice.billingCycle}</p><p className="mt-1 text-[11px] text-slate-500">User {invoice.userId} · {invoice.purpose} · {new Date(invoice.createdAt).toLocaleString()}</p></div>
            <span className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${invoice.status === 'ACTIVATED' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : invoice.status === 'REVIEW' ? 'border-amber-400/30 bg-amber-400/10 text-amber-100' : 'border-slate-700 bg-slate-950 text-slate-300'}`}>{invoice.status}</span>
          </div>
          <div className="grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
            <p>Amount: <strong className="font-mono text-slate-200">{exactAmount(invoice.amount)} USDT</strong></p><p>Base: ${invoice.basePriceUSD.toFixed(2)} · discount: {exactAmount(invoice.matchingDiscount)} USDT</p>
            <p className="break-all">Destination: <code className="text-slate-300">{invoice.receivingAddress}</code></p><p>Expires: {new Date(invoice.expiresAt).toLocaleString()}</p>
            {invoice.transactionId && <p className="break-all sm:col-span-2">Recorded transaction: <code>{invoice.transactionId}</code></p>}
          </div>
          {invoice.status !== 'ACTIVATED' && <div className="space-y-2 border-t border-slate-800 pt-3">
            <label className="block text-xs font-medium text-slate-300">Transaction hash
              <input value={hashes[invoice.id] ?? invoice.transactionId ?? ''} onChange={event => setHashes(current => ({ ...current, [invoice.id]: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white focus:border-amber-400 focus:outline-none" placeholder="Transaction hash required for server-side check" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busyId === invoice.id} onClick={() => void recheck(invoice)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-slate-100 hover:bg-slate-700 disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${busyId === invoice.id ? 'animate-spin' : ''}`} />Recheck payment</button>
              {late && <button type="button" disabled={busyId === invoice.id} onClick={() => void recheck(invoice, true)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 text-xs font-bold text-amber-100 hover:bg-amber-400/20 disabled:opacity-60"><ShieldCheck className="h-3.5 w-3.5" />Review &amp; approve late payment</button>}
            </div>
            {late && <p className="text-[11px] leading-5 text-amber-100/80">Late approval requires confirmation and independent on-chain verification. A hash alone does not confirm payment; only approve after matching the exact network, token contract, destination, amount, and finalized transfer.</p>}
          </div>}
        </article>;
      })}</div>}
  </section>;
};

export default AdminCryptoPayments;
