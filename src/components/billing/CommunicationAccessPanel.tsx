import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Clock3, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { authClient } from '../../lib/authClient';

type AccessResponse = {
  success: true;
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

async function responseData(response: Response): Promise<AccessResponse> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as AccessResponse;
}

const readableTime = (value: number | null) => {
  if (value === null) return 'Not started';
  const safe = Math.max(0, Math.floor(value));
  return `${Math.floor(safe / 60)}m ${String(safe % 60).padStart(2, '0')}s`;
};

const callTrialBalance = (access: AccessResponse) => {
  if (access.callSecondsRemaining === null && access.trialStartedAt) return 'Unlimited intro window';
  return readableTime(access.callSecondsRemaining);
};

const readableDate = (value: string | null) => {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not available' : parsed.toLocaleString();
};

export const CommunicationAccessPanel: React.FC = () => {
  const { setActiveTab, setPendingBillingAction } = useNanivio();
  const [access, setAccess] = useState<AccessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = authClient.getToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}`, 'x-nanivio-token': token } : {};
      const response = await fetch('/api/communication/access', {
        headers, credentials: 'same-origin', cache: 'no-store',
      });
      setAccess(await responseData(response));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Communication access is not available right now.');
      setAccess(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const viewPlans = () => {
    setPendingBillingAction({ subTab: 'plans' });
    setActiveTab('billing');
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-400/25 bg-gradient-to-br from-[#10251f] via-[#0d1d1b] to-[#101827] shadow-xl">
      <div className="flex flex-col gap-4 border-b border-emerald-400/15 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-300/10 text-emerald-200">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-emerald-200/80">Communication access</p>
            <h2 className="mt-1 text-base font-extrabold text-white">Your trials and shared minutes</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">Current balances from your account. Refresh to retrieve the latest server status.</p>
          </div>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-600 bg-slate-950/50 px-3.5 text-xs font-semibold text-slate-200 hover:border-emerald-300/50 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button type="button" onClick={viewPlans} className="min-h-10 rounded-xl bg-emerald-300 px-4 text-xs font-extrabold text-slate-950 transition hover:bg-emerald-200">
            View plans
          </button>
        </div>
      </div>

      {loading && !access ? (
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4 sm:p-6" aria-label="Loading communication access">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-800/60" />)}
        </div>
      ) : error ? (
        <div role="alert" className="m-5 flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4 text-amber-100 sm:m-6">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-sm font-bold">Access status unavailable</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-100/75">The server has not confirmed your current access or balances. No trial or quota is assumed.</p>
            <p className="mt-2 break-words font-mono text-[10px] text-amber-100/60">{error}</p>
          </div>
        </div>
      ) : access ? (
        <>
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4 sm:p-6">
            <div className="rounded-2xl border border-slate-700/80 bg-slate-950/45 p-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400"><Clock3 className="h-3.5 w-3.5 text-cyan-300" /> Connected-call trial</div>
              <p className="mt-3 font-mono text-xl font-bold text-white">{callTrialBalance(access)}</p>
              <p className="mt-1 text-[11px] text-slate-400">{access.trialStartedAt ? `Started ${readableDate(access.trialStartedAt)}` : 'Not started; begins after your first connected call.'}</p>
              {access.trialEndsAt && <p className="mt-1 text-[10px] text-slate-500">Ends {readableDate(access.trialEndsAt)}</p>}
            </div>
            <div className="rounded-2xl border border-slate-700/80 bg-slate-950/45 p-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400"><Sparkles className="h-3.5 w-3.5 text-amber-300" /> One-time live trial</div>
              <p className="mt-3 font-mono text-xl font-bold text-white">{readableTime(access.liveTrialSecondsRemaining)}</p>
              <p className="mt-1 text-[11px] text-slate-400">Live Langpretation trial balance</p>
            </div>
            <div className="rounded-2xl border border-slate-700/80 bg-slate-950/45 p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Translated text</div>
              <p className="mt-3 font-mono text-xl font-bold text-white">{access.textCharactersRemaining.toLocaleString()} <span className="text-xs font-medium text-slate-400">characters</span></p>
              <p className="mt-1 text-[11px] text-slate-400">Current paid allowance remaining</p>
            </div>
            <div className="rounded-2xl border border-slate-700/80 bg-slate-950/45 p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Paid Langpretation</div>
              <p className="mt-3 font-mono text-xl font-bold text-white">{readableTime(access.translatedSecondsRemaining)}</p>
              <p className="mt-1 text-[11px] text-slate-400">{access.paid ? `Paid access until ${readableDate(access.paidUntil)}` : 'No active paid term reported'}</p>
            </div>
          </div>
          <div className="mx-5 mb-5 rounded-2xl border border-emerald-300/15 bg-emerald-300/[.04] p-4 text-xs leading-relaxed text-slate-300 sm:mx-6 sm:mb-6">
            <p className="font-bold text-emerald-100">How shared call minutes work</p>
            <p className="mt-1">Your plan’s {access.sharedCallMinutes.toLocaleString()} voice minutes are a shared pool for caller-side base audio and video call time. The person answering is not charged. If you enable live Langpretation, one caller-funded Langpretation pool covers both directions; captions and translated voice do not double-charge.</p>
            <p className="mt-2 text-slate-400">Ordinary chat and original voice notes stay free. Paid text translation and voice-note Langpretation use eligible paid allowances. This panel does not promise automatic renewal or recurring free translation.</p>
          </div>
        </>
      ) : (
        <div className="p-6 text-xs text-slate-400">Access setup is not available yet. Refresh to check again.</div>
      )}
    </section>
  );
};
