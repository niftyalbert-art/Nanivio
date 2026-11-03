import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Save, SlidersHorizontal } from 'lucide-react';
import { authClient } from '../../lib/authClient';
import { AdminCommunicationAdjustments } from './AdminCommunicationAdjustments';

type CommunicationPolicy = {
  callTrialDays: number;
  liveTrialMinutes: number;
  paidTextCharacters: number;
  warningSeconds: number;
};

type CommunicationPlan = {
  id: string;
  name: string;
  tier: string;
  priceMonthlyUSD: number;
  priceMonthlyGHS: number;
  priceAnnualUSD: number;
  priceAnnualGHS: number;
  includedVoiceMinutes: number;
  includedLangpretationMinutes: number;
};

const policyFields: { key: keyof CommunicationPolicy; label: string; help: string; min: number }[] = [
  { key: 'callTrialDays', label: 'Connected-call trial', help: 'Days, started only after the first connected call.', min: 0 },
  { key: 'liveTrialMinutes', label: 'Live Langpretation trial', help: 'One-time trial duration in minutes.', min: 0 },
  { key: 'paidTextCharacters', label: 'Paid translated-text allowance', help: 'Included translated characters for eligible paid terms.', min: 0 },
  { key: 'warningSeconds', label: 'Low-balance warning', help: 'Seconds before a shared call pool reaches its limit.', min: 0 },
];

const planFields: { key: keyof Omit<CommunicationPlan, 'id' | 'name' | 'tier'>; label: string; min: number }[] = [
  { key: 'priceMonthlyUSD', label: 'Monthly USD', min: 0 },
  { key: 'priceMonthlyGHS', label: 'Monthly GHS', min: 0 },
  { key: 'priceAnnualUSD', label: 'Annual USD', min: 0 },
  { key: 'priceAnnualGHS', label: 'Annual GHS', min: 0 },
  { key: 'includedVoiceMinutes', label: 'Voice minutes', min: 0 },
  { key: 'includedLangpretationMinutes', label: 'Langpretation minutes', min: 0 },
];

async function responseData(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

export const AdminCommunicationPolicy: React.FC = () => {
  const [policy, setPolicy] = useState<CommunicationPolicy | null>(null);
  const [plans, setPlans] = useState<CommunicationPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const token = authClient.getToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}`, 'x-nanivio-token': token } : {};
      const response = await fetch('/api/admin/communication-policy', { headers, credentials: 'same-origin', cache: 'no-store' });
      const data = await responseData(response);
      setPolicy(data.policy);
      setPlans(Array.isArray(data.plans) ? data.plans : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Communication settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updatePlan = (planId: string, key: keyof CommunicationPlan, value: number) => {
    setPlans((current) => current.map((plan) => plan.id === planId ? { ...plan, [key]: value } : plan));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!policy) return;
    setError('');
    setNotice('');
    const invalidPolicy = policyFields.find(({ key, min }) => !Number.isFinite(policy[key]) || policy[key] < min);
    if (invalidPolicy) {
      setError(`${invalidPolicy.label} must be a non-negative number.`);
      return;
    }
    const invalidPlan = plans.find((plan) => {
      const quotasInvalid = plan.includedVoiceMinutes < 0 || plan.includedLangpretationMinutes < 0 ||
        !Number.isFinite(plan.includedVoiceMinutes) || !Number.isFinite(plan.includedLangpretationMinutes);
      const prices = [plan.priceMonthlyUSD, plan.priceMonthlyGHS, plan.priceAnnualUSD, plan.priceAnnualGHS];
      const pricesInvalid = prices.some((price) => !Number.isFinite(price) || price < 0) ||
        (plan.tier !== 'free' && prices.some((price) => price <= 0));
      return quotasInvalid || pricesInvalid;
    });
    if (invalidPlan) {
      setError(invalidPlan.tier === 'free'
        ? `${invalidPlan.name}: prices and included quotas must be non-negative.`
        : `${invalidPlan.name}: included quotas must be non-negative and every paid-plan price must be positive.`);
      return;
    }

    setSaving(true);
    try {
      const token = authClient.getToken();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}`, 'x-nanivio-token': token } : {}),
      };
      const response = await fetch('/api/admin/communication-policy', {
        method: 'PUT',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify({
          policy,
          plans: plans.map(({ id, priceMonthlyUSD, priceMonthlyGHS, priceAnnualUSD, priceAnnualGHS, includedVoiceMinutes, includedLangpretationMinutes }) => ({
            id, priceMonthlyUSD, priceMonthlyGHS, priceAnnualUSD, priceAnnualGHS, includedVoiceMinutes, includedLangpretationMinutes,
          })),
        }),
      });
      const data = await responseData(response);
      if (data.policy) setPolicy(data.policy);
      if (Array.isArray(data.plans)) setPlans(data.plans);
      setNotice('Communication policy saved to the server.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The communication policy was not saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-[#0d1b2a] via-[#0c1725] to-[#101b2b] p-5 sm:p-6 shadow-xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-700/70 pb-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 shrink-0 rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 flex items-center justify-center">
            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[.2em] text-cyan-300">Persistent configuration</p>
            <h2 className="mt-1 text-lg font-extrabold text-white">Communication access policy</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">The server snapshots policy for newly created trials and terms. Editing these settings never refills an existing trial, paid benefit, or purchased quota.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || saving} className="min-h-10 rounded-xl border border-slate-700 bg-slate-900 px-4 text-xs font-semibold text-slate-200 hover:border-cyan-400/50 disabled:opacity-50">
          {loading ? 'Loading settings…' : 'Refresh settings'}
        </button>
      </div>

      {loading && !policy ? (
        <div className="space-y-3" aria-label="Loading communication policy">
          <div className="h-16 animate-pulse rounded-xl bg-slate-800/70" />
          <div className="h-28 animate-pulse rounded-xl bg-slate-800/70" />
        </div>
      ) : policy ? (
        <form onSubmit={save} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {policyFields.map(({ key, label, help }) => (
              <label key={key} className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
                <span className="block text-xs font-bold text-slate-100">{label}</span>
                <span className="mt-1 block min-h-8 text-[11px] leading-relaxed text-slate-400">{help}</span>
                <input type="number" min="0" step="any" value={policy[key]} onChange={(event) => setPolicy({ ...policy, [key]: Number(event.target.value) })} className="mt-3 w-full rounded-lg border border-slate-700 bg-[#08111d] px-3 py-2 font-mono text-sm text-white outline-none focus:border-cyan-400" />
              </label>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-950/35 overflow-hidden">
            <div className="border-b border-slate-700 p-4">
              <h3 className="text-sm font-bold text-white">Subscription pricing and shared pools</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Voice and Langpretation minutes are separate plan allowances. Base audio/video call time uses the caller’s voice-minute pool; the recipient answers free. A caller who enables live Langpretation sponsors both directions from one shared Langpretation pool—captions and translated voice are not charged twice.</p>
            </div>
            {plans.length ? (
              <div className="divide-y divide-slate-800">
                {plans.map((plan) => (
                  <div key={plan.id} className="p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-white">{plan.name}</h4>
                      <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[10px] uppercase text-cyan-300">{plan.tier}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
                      {planFields.map(({ key, label }) => (
                        <label key={key} className="text-[10px] font-semibold text-slate-400">
                          {label}
                          <input type="number" min="0" step="any" value={plan[key]} onChange={(event) => updatePlan(plan.id, key, Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#08111d] px-2.5 py-2 font-mono text-xs text-white outline-none focus:border-cyan-400" />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="p-5 text-xs text-slate-400">No subscription plans were returned by the server.</p>}
          </div>

          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-[11px] leading-relaxed text-amber-100/90">
            Ordinary chat and original voice notes remain free. Paid text translation and voice-note Langpretation use applicable paid allowances. The call trial defaults to 30 days and begins only on the first connected call; live Langpretation has a one-time trial default of 3 minutes. There is no recurring free translation promise and no automatic-renewal promise.
          </div>

          {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
          {notice && <div role="status" className="flex gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</div>}
          <div className="flex justify-end">
            <button type="submit" disabled={saving || loading || plans.length === 0} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-300 px-5 text-xs font-extrabold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving configuration…' : 'Save communication policy'}
            </button>
          </div>
        </form>
      ) : (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">
          <p className="font-bold">Communication settings unavailable</p>
          <p className="mt-1 text-xs">{error || 'The server did not return policy settings.'}</p>
          <button type="button" onClick={() => void load()} className="mt-3 rounded-lg border border-rose-400/30 px-3 py-2 text-xs font-semibold hover:bg-rose-500/10">Try again</button>
        </div>
      )}
      <AdminCommunicationAdjustments />
    </section>
  );
};
