import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Loader2, Minus, Plus, Search, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { authClient } from '../../lib/authClient';

type Resource = 'call' | 'live' | 'text';

type CommunicationAccess = {
  policy: { callTrialDays: number; liveTrialMinutes: number; paidTextCharacters: number; warningSeconds: number };
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  callSecondsRemaining: number | null;
  liveTrialSecondsRemaining: number;
  textCharactersRemaining: number;
  translatedSecondsRemaining: number;
  paid: boolean;
  paidUntil: string | null;
  sharedCallMinutes: number;
};

type RetryRequest = { signature: string; requestId: string };

const resourceDetails: Record<Resource, { label: string; units: string; description: string }> = {
  call: { label: 'Shared call minutes', units: 'minutes', description: 'Adds to or debits the current paid term’s shared caller voice-minute pool.' },
  live: { label: 'Live Langpretation', units: 'minutes', description: 'Adds to or debits current paid-term live Langpretation seconds, entered in minutes.' },
  text: { label: 'Translated text', units: 'characters', description: 'Adds to or debits the current paid term’s translated-text character allowance.' },
};

const formatSeconds = (seconds: number | null) => {
  if (seconds === null) return 'Unlimited intro window';
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, '0')}s`;
};

const formatDate = (date: string | null) => {
  if (!date) return 'Not available';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? 'Not available' : parsed.toLocaleString();
};

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  return data as T;
}

function authenticatedHeaders(json = false): HeadersInit {
  const token = authClient.getToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}`, 'x-nanivio-token': token } : {}),
  };
}

export const AdminCommunicationAdjustments: React.FC = () => {
  const [userId, setUserId] = useState('');
  const [loadedUserId, setLoadedUserId] = useState('');
  const [access, setAccess] = useState<CommunicationAccess | null>(null);
  const [resource, setResource] = useState<Resource>('call');
  const [deltaInput, setDeltaInput] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [refreshWarning, setRefreshWarning] = useState('');
  const retryRequest = useRef<RetryRequest | null>(null);

  const normalizedUserId = userId.trim();
  const resourceInfo = resourceDetails[resource];
  const numericDelta = deltaInput.trim() === '' ? Number.NaN : Number(deltaInput);
  const validReason = reason.trim().length >= 3 && reason.trim().length <= 500;
  const canAdjust = !!access?.paid && loadedUserId === normalizedUserId;

  const clearFeedback = () => {
    setError('');
    setSuccess('');
    setRefreshWarning('');
  };

  const clearReview = () => {
    setConfirmationOpen(false);
    clearFeedback();
  };

  const loadAccess = async (targetUserId = normalizedUserId) => {
    if (!targetUserId) {
      setError('Enter an account ID before loading communication access.');
      setAccess(null);
      setLoadedUserId('');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    setRefreshWarning('');
    setConfirmationOpen(false);
    try {
      const response = await fetch(
        `/api/admin/communication-policy/users/${encodeURIComponent(targetUserId)}`,
        { headers: authenticatedHeaders(), credentials: 'same-origin', cache: 'no-store' },
      );
      const data = await parseResponse<{ success: true } & CommunicationAccess>(response);
      setAccess(data);
      setLoadedUserId(targetUserId);
    } catch (cause) {
      setAccess(null);
      setLoadedUserId('');
      setError(cause instanceof Error ? cause.message : 'Communication usage could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const updateUserId = (value: string) => {
    setUserId(value);
    if (value.trim() !== loadedUserId) {
      setAccess(null);
      setLoadedUserId('');
    }
    clearReview();
  };

  const submitAdjustment = async () => {
    if (!canAdjust || !access) {
      setError('Load an active paid communication account before applying an adjustment.');
      return;
    }
    if (!Number.isFinite(numericDelta) || numericDelta === 0) {
      setError('Enter a finite, non-zero signed adjustment.');
      return;
    }
    if (!validReason) {
      setError('Enter a reason between 3 and 500 characters.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');
    setRefreshWarning('');
    const cleanReason = reason.trim();
    const signature = JSON.stringify({
      userId: normalizedUserId,
      resource,
      delta: numericDelta,
      reason: cleanReason,
    });
    const requestId = retryRequest.current?.signature === signature
      ? retryRequest.current.requestId
      : crypto.randomUUID();
    retryRequest.current = { signature, requestId };

    try {
      const response = await fetch('/api/admin/communication-policy/adjust', {
        method: 'POST',
        headers: authenticatedHeaders(true),
        credentials: 'same-origin',
        body: JSON.stringify({
          userId: normalizedUserId,
          resource,
          delta: numericDelta,
          reason: cleanReason,
          requestId,
        }),
      });
      const result = await parseResponse<{ success: true; paidUntil: string | null }>(response);
      const signedDelta = `${numericDelta > 0 ? '+' : ''}${numericDelta.toLocaleString()} ${resourceInfo.units}`;
      setSuccess(`${resourceInfo.label} adjustment ${signedDelta} applied to ${normalizedUserId}. Paid term ends ${formatDate(result.paidUntil)}.`);
      retryRequest.current = null;
      setDeltaInput('');
      setReason('');
      setConfirmationOpen(false);

      try {
        const updatedResponse = await fetch(
          `/api/admin/communication-policy/users/${encodeURIComponent(normalizedUserId)}`,
          { headers: authenticatedHeaders(), credentials: 'same-origin', cache: 'no-store' },
        );
        const updated = await parseResponse<{ success: true } & CommunicationAccess>(updatedResponse);
        setAccess(updated);
        setLoadedUserId(normalizedUserId);
      } catch (cause) {
        setRefreshWarning(cause instanceof Error
          ? `Adjustment was applied, but refreshed balances could not be loaded: ${cause.message}`
          : 'Adjustment was applied, but refreshed balances could not be loaded.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Adjustment outcome was not confirmed. Retry the same request to safely check its result.');
    } finally {
      setSubmitting(false);
    }
  };

  const requestReview = (event: React.FormEvent) => {
    event.preventDefault();
    clearFeedback();
    if (!canAdjust || !access) {
      setError('Load an active paid communication account before reviewing an adjustment.');
      return;
    }
    if (!Number.isFinite(numericDelta) || numericDelta === 0) {
      setError('Enter a finite, non-zero signed adjustment.');
      return;
    }
    if (!validReason) {
      setError('Enter a reason between 3 and 500 characters.');
      return;
    }
    setConfirmationOpen(true);
  };

  return (
    <section className="space-y-4 rounded-3xl border border-amber-400/25 bg-gradient-to-br from-[#211d16] via-[#171a1d] to-[#111a23] p-5 shadow-xl sm:p-6">
      <div className="flex flex-col gap-3 border-b border-slate-700/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/25 bg-amber-300/10 text-amber-200">
            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-amber-200/80">Admin-only operation</p>
            <h2 className="mt-1 text-lg font-extrabold text-white">Communication allowance adjustment</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">Adjust only an active paid communication term. This cannot refill a trial, remove consumed units, or extend the term expiry.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="min-w-0 flex-1 text-xs font-semibold text-slate-300">
              Account ID
              <input
                value={userId}
                onChange={(event) => updateUserId(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void loadAccess(); } }}
                autoComplete="off"
                placeholder="Enter the account ID"
                className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 font-mono text-sm text-white outline-none focus:border-amber-300"
              />
            </label>
            <button
              type="button"
              onClick={() => void loadAccess()}
              disabled={loading || !normalizedUserId}
              className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-4 text-xs font-bold text-slate-100 transition hover:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? 'Loading account…' : 'Load usage'}
            </button>
          </div>

          {access && loadedUserId === normalizedUserId && (
            <div className="rounded-2xl border border-slate-700 bg-slate-950/55 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Loaded account</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-200">{loadedUserId}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${
                  access.paid
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                    : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                }`}>
                  {access.paid ? 'Paid term active' : 'No active paid term'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <p className="text-[10px] font-semibold text-slate-500">Shared call pool</p>
                  <p className="mt-1 font-mono text-sm font-bold text-white">{access.sharedCallMinutes.toLocaleString()} min</p>
                  <p className="mt-1 text-[10px] text-slate-500">Timer: {formatSeconds(access.callSecondsRemaining)}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <p className="text-[10px] font-semibold text-slate-500">Paid Langpretation</p>
                  <p className="mt-1 font-mono text-sm font-bold text-white">{formatSeconds(access.translatedSecondsRemaining)}</p>
                  <p className="mt-1 text-[10px] text-slate-500">Trial balance is not adjustable.</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <p className="text-[10px] font-semibold text-slate-500">Translated text</p>
                  <p className="mt-1 font-mono text-sm font-bold text-white">{access.textCharactersRemaining.toLocaleString()} chars</p>
                  <p className="mt-1 text-[10px] text-slate-500">Current paid allowance</p>
                </div>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
                <Clock3 className="h-3.5 w-3.5 shrink-0" />
                Current term expiry: <span className="font-medium text-slate-200">{formatDate(access.paidUntil)}</span>
              </p>
              {access.trialStartedAt && (
                <p className="mt-1 text-[10px] text-slate-500">Call trial started {formatDate(access.trialStartedAt)}; trial benefits are not changed by paid-term adjustments.</p>
              )}
            </div>
          )}

          <form onSubmit={requestReview} className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950/40 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-300">
                Allowance
                <select
                  value={resource}
                  onChange={(event) => { setResource(event.target.value as Resource); clearReview(); }}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-amber-300"
                >
                  <option value="call">Shared call minutes</option>
                  <option value="live">Live Langpretation minutes</option>
                  <option value="text">Translated-text characters</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-300">
                Signed adjustment ({resourceInfo.units})
                <input
                  type="number"
                  step="any"
                  value={deltaInput}
                  onChange={(event) => { setDeltaInput(event.target.value); clearReview(); }}
                  placeholder="For example, +15 or -4"
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-white outline-none focus:border-amber-300"
                />
              </label>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">{resourceInfo.description} Positive adds units; negative debits units. Debits cannot exceed unconsumed allowance.</p>
            <label className="block text-xs font-semibold text-slate-300">
              Required reason <span className="font-normal text-slate-500">(3–500 characters)</span>
              <textarea
                value={reason}
                onChange={(event) => { setReason(event.target.value); clearReview(); }}
                minLength={3}
                maxLength={500}
                rows={3}
                placeholder="Record why this adjustment is needed."
                className="mt-1.5 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-300"
              />
              <span className="mt-1 block text-right font-mono text-[10px] text-slate-500">{reason.trim().length}/500</span>
            </label>
            <button
              type="submit"
              disabled={!canAdjust || loading || submitting}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 text-xs font-extrabold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
            >
              <ShieldAlert className="h-4 w-4" />
              Review adjustment
            </button>
            {!access && normalizedUserId && <p className="text-[11px] text-slate-500">Load the account first to confirm its current balances and term.</p>}
            {access && !access.paid && <p className="text-[11px] text-amber-200/80">Adjustment is unavailable because this account has no active paid term.</p>}
          </form>
        </div>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[.04] p-4">
            <h3 className="text-xs font-bold text-amber-100">Adjustment guardrails</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed text-slate-400">
              <li>Changes apply only to the current active paid communication term.</li>
              <li>Existing trials, consumed units, and term expiry are not reset or changed.</li>
              <li>Each submission records an idempotency key so retrying after a network issue cannot duplicate the adjustment.</li>
            </ul>
          </div>
          {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
          {success && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-100"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{success}</div>}
          {refreshWarning && <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{refreshWarning}</div>}
        </aside>
      </div>

      {confirmationOpen && access && (
        <div className="rounded-2xl border border-amber-300/40 bg-[#292318] p-4 sm:p-5" role="region" aria-labelledby="communication-adjustment-confirm-title" aria-describedby="communication-adjustment-confirm-description">
          <h3 id="communication-adjustment-confirm-title" className="text-sm font-extrabold text-white">Confirm account adjustment</h3>
          <p id="communication-adjustment-confirm-description" className="mt-1 text-xs leading-relaxed text-amber-100/80">Review this exact account, allowance, signed amount, and term before applying it. The change cannot restore consumed units or extend expiry.</p>
          <dl className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-black/20 p-3"><dt className="text-[10px] uppercase text-slate-400">Account ID</dt><dd className="mt-1 break-all font-mono font-bold text-white">{normalizedUserId}</dd></div>
            <div className="rounded-xl bg-black/20 p-3"><dt className="text-[10px] uppercase text-slate-400">Allowance</dt><dd className="mt-1 font-bold text-white">{resourceInfo.label}</dd></div>
            <div className="rounded-xl bg-black/20 p-3"><dt className="text-[10px] uppercase text-slate-400">Adjustment</dt><dd className="mt-1 font-mono font-bold text-white">{numericDelta > 0 ? '+' : ''}{numericDelta.toLocaleString()} {resourceInfo.units}</dd></div>
            <div className="rounded-xl bg-black/20 p-3"><dt className="text-[10px] uppercase text-slate-400">Current paid term</dt><dd className="mt-1 font-bold text-white">Expires {formatDate(access.paidUntil)}</dd></div>
          </dl>
          <p className="mt-3 text-[11px] text-slate-300">Reason: <span className="text-white">{reason.trim()}</span></p>
          {error && <p role="alert" className="mt-3 text-xs text-rose-200">{error}</p>}
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => { setConfirmationOpen(false); setError(''); }} disabled={submitting} className="min-h-10 rounded-xl border border-slate-600 px-4 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={() => void submitAdjustment()} disabled={submitting || !canAdjust} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 text-xs font-extrabold text-slate-950 hover:bg-amber-200 disabled:opacity-50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : numericDelta > 0 ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              {submitting ? 'Applying adjustment…' : `Apply ${numericDelta > 0 ? 'credit' : 'debit'}`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
