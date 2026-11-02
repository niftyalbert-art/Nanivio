import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Clock3, X } from 'lucide-react';
import { authenticatedFetch } from '../../lib/authenticatedFetch';
import type { NanivioUser } from '../../types/auth';

type Plan = { id: string; name: string; published?: boolean; status?: string };
type Props = { user: NanivioUser; onClose: () => void; onSuccess: () => Promise<void> | void };

export const AdminMalviAdjustment: React.FC<Props> = ({ user, onClose, onSuccess }) => {
  const [direction, setDirection] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [mode, setMode] = useState<'voice' | 'avatar'>('voice');
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [minutes, setMinutes] = useState('15');
  const [reason, setReason] = useState('');
  const [planId, setPlanId] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansError, setPlansError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDebit, setConfirmDebit] = useState(false);
  const submitted = useRef(false);
  const requestRef = useRef<{ signature: string; id: string } | null>(null);
  const amount = Number(minutes);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await authenticatedFetch('/api/billing/malvi-plans');
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.success === false) throw new Error(body?.message || 'Published plans are unavailable.');
        const list = Array.isArray(body?.data?.plans) ? body.data.plans : Array.isArray(body?.plans) ? body.plans : [];
        const published = list.filter((plan: any) => plan && typeof plan.id === 'string' &&
          plan.status !== 'DRAFT' && plan.status !== 'ARCHIVED' && plan.published !== false && plan.isPublished !== false);
        if (alive) setPlans(published.map((plan: any) => ({ id: plan.id, name: String(plan.name || plan.title || plan.id), published: true })));
      } catch (err) {
        if (alive) setPlansError(err instanceof Error ? err.message : 'Published plans are unavailable.');
      }
    })();
    return () => { alive = false; };
  }, []);

  const signature = JSON.stringify({ userId: user.id, direction, mode, minutes: amount, billingCycle, reason: reason.trim(), planId: direction === 'CREDIT' ? planId : '' });
  const valid = Number.isInteger(amount) && amount > 0 && reason.trim().length >= 10 && reason.trim().length <= 500;

  const submit = async () => {
    if (!valid || saving || submitted.current || (direction === 'DEBIT' && !confirmDebit)) return;
    setSaving(true);
    setError('');
    setSuccess('');
    if (!requestRef.current || requestRef.current.signature !== signature) {
      requestRef.current = { signature, id: crypto.randomUUID() };
    }
    submitted.current = true;
    try {
      const response = await authenticatedFetch('/api/admin/malvi/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id, direction, mode, minutes: amount, billingCycle,
          reason: reason.trim(), requestId: requestRef.current.id,
          ...(direction === 'CREDIT' && planId ? { planId } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true || !body?.result || typeof body.result !== 'object') {
        const fallback = response.status === 500 || response.status === 503
          ? 'Malvi adjustment service setup failed. Ask a database owner to apply the required Malvi admin SQL migration, then retry. No minutes were changed.'
          : 'Adjustment failed. No minutes were changed.';
        throw new Error(body?.message || fallback);
      }
      setSuccess(body.message || 'Malvi minutes adjusted.');
      setConfirmDebit(false);
      try {
        await onSuccess();
      } catch {
        setError('Adjustment succeeded, but the directory could not refresh. Use Refresh Directory before another operation.');
      }
    } catch (err) {
      submitted.current = false;
      setError(err instanceof Error ? err.message : 'Adjustment failed. Retry safely with the same request.');
    } finally {
      setSaving(false);
    }
  };

  const edit = (fn: () => void) => { submitted.current = false; setSuccess(''); setError(''); fn(); };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#080a0c]/85 p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="malvi-adjust-title">
      <section className="max-h-[94dvh] w-full max-w-xl overflow-y-auto border border-[#51462c] bg-[#191c20] p-5 text-[#f4f1e9] shadow-2xl sm:rounded-xl sm:p-7">
        <header className="flex items-start justify-between gap-4 border-b border-[#34373b] pb-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#e2bb62]">Malvi account operation</p>
            <h2 id="malvi-adjust-title" className="mt-1 text-xl font-bold">Adjust minutes</h2>
            <p className="mt-1 text-sm text-[#aaa9a2]">{user.displayName} <span className="font-mono text-[#e2bb62]">· {user.nvId}</span></p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close adjustment" className="rounded-md border border-[#414348] p-2 text-[#aaa9a2] hover:text-white disabled:opacity-40"><X className="h-4 w-4" /></button>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-[#c5c2b8]">Operation</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-[#383b40] bg-[#111316] p-1">
              {(['CREDIT', 'DEBIT'] as const).map(value => <button key={value} type="button" disabled={saving} onClick={() => edit(() => { setDirection(value); setConfirmDebit(false); })} aria-pressed={direction === value} className={`min-h-10 rounded-md text-xs font-bold ${direction === value ? value === 'CREDIT' ? 'bg-[#e2bb62] text-[#171510]' : 'bg-[#a64a3c] text-white' : 'text-[#aaa9a2]'}`}>{value === 'CREDIT' ? 'Credit' : 'Debit'}</button>)}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-[#c5c2b8]">Minutes for</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-[#383b40] bg-[#111316] p-1">
              {(['voice', 'avatar'] as const).map(value => <button key={value} type="button" disabled={saving} onClick={() => edit(() => setMode(value))} aria-pressed={mode === value} className={`min-h-10 rounded-md text-xs font-semibold capitalize ${mode === value ? 'bg-[#35332b] text-[#f2d98f]' : 'text-[#aaa9a2]'}`}>{value}</button>)}
            </div>
          </fieldset>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[#c5c2b8]">Billing cycle
            <select disabled={saving} value={billingCycle} onChange={e => edit(() => setBillingCycle(e.target.value as 'MONTHLY' | 'ANNUAL'))} className="mt-1.5 min-h-11 w-full rounded-md border border-[#383b40] bg-[#111316] px-3 text-sm text-[#f4f1e9]">
              <option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[#c5c2b8]">Minutes
            <input disabled={saving} type="number" min="1" step="1" inputMode="numeric" value={minutes} onChange={e => edit(() => setMinutes(e.target.value))} className="mt-1.5 min-h-11 w-full rounded-md border border-[#383b40] bg-[#111316] px-3 font-mono text-sm text-[#f4f1e9]" />
          </label>
        </div>

        {direction === 'CREDIT' && (
          <label className="mt-4 block text-xs font-semibold text-[#c5c2b8]">Published Malvi plan <span className="text-[#e2bb62]">Optional · required for first grant</span>
            <select disabled={saving} value={planId} onChange={e => edit(() => setPlanId(e.target.value))} className="mt-1.5 min-h-11 w-full rounded-md border border-[#383b40] bg-[#111316] px-3 text-sm text-[#f4f1e9]">
              <option value="">No plan change</option>
              {plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · published</option>)}
            </select>
            {plansError && <span role="status" className="mt-1 block text-xs text-[#e2bb62]">{plansError} A published plan is required to grant new time.</span>}
          </label>
        )}

        <label className="mt-4 block text-xs font-semibold text-[#c5c2b8]">Required audit reason <span className="font-normal text-[#89877f]">({reason.trim().length}/500; 10–500 characters)</span>
          <textarea disabled={saving} rows={3} maxLength={500} value={reason} onChange={e => edit(() => setReason(e.target.value))} placeholder="Explain the operational reason for this adjustment." className="mt-1.5 w-full rounded-md border border-[#383b40] bg-[#111316] px-3 py-2.5 text-sm text-[#f4f1e9]" />
        </label>

        {direction === 'DEBIT' && (
          <div className="mt-4 border border-[#695047] bg-[#281c19] p-3 text-sm text-[#f1d2c6]">
            <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>Only unspent minutes can be removed. Reserved call time is protected; the server will reject any debit that reaches reserved minutes.</p></div>
            {!confirmDebit ? <button type="button" onClick={() => setConfirmDebit(true)} disabled={!valid} className="mt-3 min-h-10 w-full rounded-md border border-[#a76351] px-3 text-xs font-bold text-white disabled:opacity-40">Review debit of {Number.isInteger(amount) && amount > 0 ? amount : '—'} minutes</button> :
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs font-bold">Confirm debit · {amount} {mode} minutes?</span><button type="button" disabled={saving} onClick={() => setConfirmDebit(false)} className="min-h-10 rounded-md border border-[#765c52] px-3 text-xs disabled:opacity-40">Not yet</button></div>}
          </div>
        )}

        {error && <div role="alert" className="mt-4 border border-[#8b4a40] bg-[#2a1719] p-3 text-sm text-[#ffb6a8]">{error}</div>}
        {success && <div role="status" className="mt-4 flex items-center gap-2 border border-[#536847] bg-[#1b241a] p-3 text-sm text-[#d7e8be]"><CheckCircle2 className="h-4 w-4" />{success}</div>}
        <footer className="mt-5 flex flex-col-reverse gap-2 border-t border-[#34373b] pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="min-h-11 rounded-md border border-[#414348] px-4 text-sm text-[#c5c2b8]">Close</button>
          <button type="button" onClick={submit} disabled={!valid || saving || !!success || (direction === 'DEBIT' && !confirmDebit)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#e2bb62] px-5 text-sm font-bold text-[#171510] disabled:cursor-not-allowed disabled:opacity-45">
            {direction === 'CREDIT' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            {saving ? 'Saving adjustment…' : direction === 'CREDIT' ? 'Apply credit' : 'Confirm debit'}
          </button>
        </footer>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[#89877f]"><Clock3 className="h-3.5 w-3.5" />Existing grants keep their dates and cycle. A cycle mismatch is rejected, never converted.</p>
      </section>
    </div>
  );
};
