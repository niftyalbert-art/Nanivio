import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Clock3, RefreshCw, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import {
  calculateMalviCosts,
  COST_REVIEW_DATE,
  COST_SOURCES,
  defaultMalviCostSnapshot,
  MALVI_RATE_FIELDS,
  MALVI_SCENARIO_FIELDS,
  type MalviCostRates,
  type MalviCostResponse,
  type MalviCostScenario,
  type MalviCostSnapshot,
} from '../../lib/malviBillingCalculator';
import { loadMalviCostModel, saveMalviCostModel } from '../../lib/malviCostClient';

const panel = 'rounded-2xl border border-slate-800 bg-[#0c1424]';
const inputClass = 'w-full min-w-0 rounded-xl border border-slate-700 bg-[#080e18] px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20';
const labelClass = 'block text-sm font-semibold text-slate-200';
const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
const usd = (value: number) => `USD ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function sameModel(a: Pick<MalviCostSnapshot, 'rates' | 'scenario'>, b: Pick<MalviCostSnapshot, 'rates' | 'scenario'>) {
  return JSON.stringify(a.rates) === JSON.stringify(b.rates) && JSON.stringify(a.scenario) === JSON.stringify(b.scenario);
}

function grouped<T extends { group: string }>(fields: T[]) {
  return fields.reduce<Record<string, T[]>>((result, field) => {
    (result[field.group] ??= []).push(field);
    return result;
  }, {});
}

function NumberField({ field, value, onChange }: {
  key?: React.Key;
  field: { key: string; label: string; unit: string; max: number; integer?: boolean };
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label className={labelClass} htmlFor={`malvi-${field.key}`}>{field.label}</label>
      <div className="relative">
        <input
          id={`malvi-${field.key}`}
          className={`${inputClass} pr-12 font-mono tabular-nums`}
          type="number"
          min={field.key === 'customers' ? 1 : 0}
          max={field.max}
          step={field.integer ? 1 : 'any'}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value === '' ? 0 : Number(event.currentTarget.value))}
          aria-describedby={`malvi-${field.key}-unit`}
        />
      </div>
      <p id={`malvi-${field.key}-unit`} className="break-words text-[11px] leading-4 text-slate-500">{field.unit}</p>
    </div>
  );
}

export const AdminMalviCostCalculator: React.FC = () => {
  const [response, setResponse] = useState<MalviCostResponse | null>(null);
  const [draft, setDraft] = useState<Pick<MalviCostSnapshot, 'rates' | 'scenario'>>(() => {
    const defaults = defaultMalviCostSnapshot();
    return { rates: defaults.rates, scenario: defaults.scenario };
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [usingDefaults, setUsingDefaults] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setSaveMessage('');
    try {
      const result = await loadMalviCostModel();
      setResponse(result);
      setDraft({ rates: result.snapshot.rates, scenario: result.snapshot.scenario });
      setUsingDefaults(false);
      setSaveError('');
      setReason('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load saved Malvi cost settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dirty = response ? !sameModel(draft, response.snapshot) : usingDefaults;
  const needsSave = dirty || response?.snapshot.version === 0;
  const fx = response?.fx;
  const fxIsCurrent = Boolean(fx && Number.isFinite(fx.rate) && fx.rate > 0 && Date.parse(fx.expiresAt) > Date.now());
  const { estimate, calculationError } = useMemo(() => {
    try {
      return { estimate: calculateMalviCosts(draft.rates, draft.scenario, fxIsCurrent ? fx?.rate : undefined), calculationError: '' };
    } catch (error) {
      return { estimate: null, calculationError: error instanceof Error ? error.message : 'Check the calculator inputs.' };
    }
  }, [draft, fxIsCurrent, fx?.rate]);

  const setRate = (key: keyof MalviCostRates, value: number) => {
    setDraft((current) => ({ ...current, rates: { ...current.rates, [key]: value } }));
    setSaveMessage('');
    setSaveError('');
  };
  const setScenario = <K extends keyof MalviCostScenario>(key: K, value: MalviCostScenario[K]) => {
    setDraft((current) => ({ ...current, scenario: { ...current.scenario, [key]: value } }));
    setSaveMessage('');
    setSaveError('');
  };

  const resetToDefaults = () => {
    const defaults = defaultMalviCostSnapshot();
    setDraft({ rates: defaults.rates, scenario: defaults.scenario });
    setUsingDefaults(true);
    setReason('');
    setSaveMessage('');
    setSaveError('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!response || !response.canEdit || !response.storageAvailable || reason.trim().length < 8 || !needsSave || !estimate || saving) return;
    setSaving(true);
    setSaveMessage('');
    setSaveError('');
    try {
      const result = await saveMalviCostModel({
        rates: draft.rates,
        scenario: draft.scenario,
        expectedVersion: response.snapshot.version,
        reason: reason.trim(),
      });
      setResponse(result);
      setDraft({ rates: result.snapshot.rates, scenario: result.snapshot.scenario });
      setReason('');
      setUsingDefaults(false);
      setSaveMessage('Saved. The new snapshot is stored for planning; customer plans and benefits are unchanged.');
    } catch (error) {
      setSaveError(error instanceof Error
        ? `Not saved: ${error.message}. Your local edits are preserved. Reload the saved snapshot before retrying a possible version conflict.`
        : 'Not saved. Your local edits are preserved. Reload the saved snapshot before retrying.');
    } finally {
      setSaving(false);
    }
  };

  const rateGroups = grouped(MALVI_RATE_FIELDS);
  const scenarioGroups = grouped(MALVI_SCENARIO_FIELDS);
  const validProviderPair = draft.scenario.brain !== 'openai' || draft.scenario.voice === 'elevenlabs';

  return (
    <section className="w-full min-w-0 space-y-5 text-slate-100" aria-labelledby="malvi-cost-title">
      <header className={`${panel} overflow-hidden`}>
        <div className="border-b border-slate-800 bg-gradient-to-r from-[#141d2b] via-[#101a29] to-[#14241f] p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">Finance planning · Malvi</p>
                <h2 id="malvi-cost-title" className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">Billing cost calculator</h2>
                <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-400">Transparent monthly estimates from editable public-rate assumptions. Nothing here changes Malvi’s live providers, customer plans, or entitlements.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              {response && <button type="button" disabled={saving || loading} onClick={() => {
                if (!dirty || window.confirm('Reload saved settings? This discards your unsaved local edits.')) void load();
              }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 px-3 text-xs font-semibold text-slate-200 hover:border-amber-400 disabled:opacity-50">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Reload saved
              </button>}
              {response && <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 font-mono text-[11px] text-slate-300">Snapshot v{response.snapshot.version}</span>}
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-200">Planning only</span>
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-3.5">
            <p className="text-xs font-bold text-amber-200">Assumptions, not verified entitlements</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">Usage inputs are planning limits per customer per month, not enforced account allowances. Public-rate assumptions and provider account quotas have not been verified. No free per-user quota is assumed.</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
            <p className="text-xs font-bold text-slate-200">Keep provider what-ifs separate</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">Selecting a brain or voice is only a cost scenario and does not change actual Malvi. Gemini native voice does not incur ElevenLabs output cost; inactive provider fields are ignored.</p>
          </div>
        </div>
      </header>

      {loading && (
        <div className={`${panel} space-y-4 p-5`} role="status" aria-live="polite">
          <p className="text-sm font-semibold text-slate-200">Loading saved cost model…</p>
          <div className="h-3 animate-pulse rounded bg-slate-800" />
          <div className="h-24 animate-pulse rounded-xl bg-slate-800/70" />
        </div>
      )}

      {!loading && loadError && (
        <div className="rounded-2xl border border-rose-500/35 bg-rose-950/20 p-5" role="alert">
          <p className="font-bold text-rose-200">Saved settings could not be loaded</p>
          <p className="mt-1 break-words text-sm text-rose-100/75">{loadError}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose-200 px-4 text-sm font-bold text-rose-950 hover:bg-white focus:outline-none focus:ring-2 focus:ring-rose-300">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry loading
            </button>
            <button type="button" onClick={resetToDefaults} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-200 hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400">
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Use public defaults locally
            </button>
          </div>
          {usingDefaults && <p className="mt-3 text-xs leading-5 text-amber-200" role="status">Public defaults are being used for a local estimate only. No server snapshot was loaded; saving is unavailable.</p>}
        </div>
      )}

      {!loading && response && (
        <>
          {(response.storageWarning || !response.storageAvailable) && (
            <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4" role="status">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-100">{response.storageAvailable ? 'Shared storage notice' : 'Read-only preview · shared storage unavailable'}</p>
                <p className="mt-1 break-words text-xs leading-5 text-amber-100/70">{response.storageWarning || 'Saved settings cannot be changed until shared storage is available. Local estimates remain available.'}</p>
              </div>
            </div>
          )}
          {response.fxWarning && (
            <p className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-xs leading-5 text-slate-400" role="status">FX note: {response.fxWarning}</p>
          )}
        </>
      )}

      {!loading && (response || usingDefaults) && (
        <form onSubmit={save} className="space-y-5">
          <fieldset disabled={saving} className="min-w-0 space-y-5">
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
            <div className="min-w-0 space-y-5">
              <section className={`${panel} p-4 sm:p-5`} aria-labelledby="provider-heading">
                <div className="mb-4">
                  <h3 id="provider-heading" className="text-base font-bold text-white">Planning providers</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-400">A what-if only. OpenAI requires ElevenLabs voice. Provider choice does not alter Malvi.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className={labelClass} htmlFor="malvi-brain">Reasoning brain</label>
                    <select id="malvi-brain" className={inputClass} value={draft.scenario.brain} onChange={(e) => {
                      const brain = e.currentTarget.value as MalviCostScenario['brain'];
                      setDraft((current) => ({ ...current, scenario: { ...current.scenario, brain, voice: brain === 'openai' ? 'elevenlabs' : current.scenario.voice } }));
                    }}>
                      <option value="gemini">Gemini</option>
                      <option value="openai">OpenAI · requires ElevenLabs voice</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass} htmlFor="malvi-voice">Voice provider</label>
                    <select id="malvi-voice" className={inputClass} value={draft.scenario.voice} onChange={(e) => setScenario('voice', e.currentTarget.value as MalviCostScenario['voice'])}>
                      <option value="gemini" disabled={draft.scenario.brain === 'openai'}>Gemini native audio</option>
                      <option value="elevenlabs">ElevenLabs</option>
                    </select>
                    {!validProviderPair && <p className="text-xs text-rose-300">Choose ElevenLabs when using OpenAI.</p>}
                  </div>
                </div>
              </section>

              {Object.entries(scenarioGroups).map(([group, fields]) => (
                <section key={group} className={`${panel} min-w-0 p-4 sm:p-5`} aria-label={group}>
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                    <h3 className="text-base font-bold text-white">{group}</h3>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Monthly per customer, unless marked otherwise</span>
                  </div>
                  <div className="grid min-w-0 gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                    {fields.map((field) => (
                      <NumberField
                        key={field.key}
                        field={field}
                        value={draft.scenario[field.key]}
                        onChange={(value) => setScenario(field.key, value)}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {Object.entries(rateGroups).map(([group, fields]) => (
                <section key={group} className={`${panel} min-w-0 p-4 sm:p-5`} aria-label={group}>
                  <div className="mb-4">
                    <h3 className="text-base font-bold text-white">{group}</h3>
                    <p className="mt-1 text-xs text-slate-500">Provider unit rates and shared monthly infrastructure; edit to match your reviewed assumptions.</p>
                  </div>
                  {group === 'LiveAvatar LITE' && <p className="mb-4 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs leading-5 text-slate-400">Included minutes are one shared fleet pool. The calculator counts the subscription plus only fleet minutes beyond that pool, then allocates the resulting cost once across customers.</p>}
                  <div className="grid min-w-0 gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                    {fields.map((field) => (
                      <NumberField
                        key={field.key}
                        field={field}
                        value={draft.rates[field.key]}
                        onChange={(value) => setRate(field.key, value)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start" aria-label="Live estimate and save controls">
              <section className="overflow-hidden rounded-2xl border border-amber-500/35 bg-[#101a26]">
                <div className="border-b border-amber-500/20 bg-amber-500/5 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">Live estimate</p>
                  <h3 className="mt-1 text-lg font-extrabold text-white">Monthly cost picture</h3>
                  {estimate && <p className="mt-1 text-xs text-slate-400">{draft.scenario.customers.toLocaleString()} modeled customers</p>}
                </div>
                {estimate ? (
                  <div className="space-y-3 p-4">
                    <div className="rounded-xl bg-slate-950/60 p-3">
                      <p className="text-xs text-slate-400">Suggested monthly price · per customer</p>
                      <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-200">{usd(estimate.suggestedPriceUsd)}</p>
                      {fxIsCurrent && estimate.suggestedPriceGhs !== null
                        ? <p className="mt-1 font-mono text-sm text-emerald-300">GH₵ {numberFormat.format(estimate.suggestedPriceGhs)}</p>
                        : <p className="mt-1 text-[11px] text-slate-500">GHS estimate unavailable: no current FX quote.</p>}
                    </div>
                    {fxIsCurrent && fx && (
                      <div className="rounded-lg border border-slate-800 px-3 py-2 text-[10px] leading-4 text-slate-500">
                        <p>FX: 1 USD = GH₵ {numberFormat.format(fx.rate)} · source: {fx.source}</p>
                        <p>As of {fx.asOf} · expires {fx.expiresAt}</p>
                        <a href={fx.attributionUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-amber-300 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-amber-400">Exchange-rate data attribution</a>
                      </div>
                    )}
                    {fx && !fxIsCurrent && <p className="text-[11px] leading-4 text-amber-200">The FX quote is expired or invalid. No stale conversion is shown.</p>}
                    <div className="space-y-2 border-t border-slate-800 pt-3 text-xs">
                      {[
                        ['Voice and reasoning · fleet', estimate.voice * draft.scenario.customers],
                        ['Live text and vision · fleet', estimate.context * draft.scenario.customers],
                        ['Files and research · fleet', estimate.analysis * draft.scenario.customers],
                        ['Search grounding · fleet', estimate.search * draft.scenario.customers],
                        ['Avatar · fleet total', estimate.avatar],
                        ['Shared infrastructure · fleet', estimate.infrastructure],
                        ['Contingency', estimate.contingency],
                      ].map(([label, value]) => (
                          <div key={label} className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1">
                          <span className="text-slate-400">{label}</span><span className="shrink-0 font-mono tabular-nums text-slate-200">{usd(Number(value))}</span>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2 border-t border-slate-800 pt-3">
                      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm font-bold"><span className="text-white">Estimated fleet / month</span><span className="font-mono text-white">{usd(estimate.fleetCost)}</span></div>
                      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs"><span className="text-slate-400">Cost per customer / month</span><span className="font-mono text-amber-200">{usd(estimate.costPerCustomer)}</span></div>
                      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs"><span className="text-slate-400">Payment fees at test price · fleet</span><span className="font-mono text-slate-200">{usd(estimate.fees)}</span></div>
                      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs"><span className="text-slate-400">Avatar fleet usage</span><span className="font-mono text-slate-200">{numberFormat.format(estimate.fleetAvatarMinutes)} min</span></div>
                      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs"><span className="text-slate-400">Included pool / overage</span><span className="text-right font-mono text-slate-200">{numberFormat.format(draft.rates.avatarIncludedMinutes)} / {numberFormat.format(estimate.avatarOverageMinutes)} min</span></div>
                      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs"><span className="text-slate-400">Avatar subscription / overage cost</span><span className="text-right font-mono text-slate-200">{usd(estimate.fleetAvatarMinutes > 0 ? draft.rates.avatarMonthly : 0)} / {usd(estimate.avatarOverageMinutes * draft.rates.avatarOverage)}</span></div>
                      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs"><span className="text-slate-400">Test-price profit after fees · fleet</span><span className={`font-mono ${estimate.profit < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{usd(estimate.profit)}</span></div>
                      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs"><span className="text-slate-400">Gross margin at test price</span><span className="font-mono text-slate-200">{estimate.marginAtTestPrice === null ? '—' : `${numberFormat.format(estimate.marginAtTestPrice)}%`}</span></div>
                    </div>
                    <p className="text-[10px] leading-4 text-slate-500">Shared avatar and infrastructure totals are included once in fleet cost and spread over the modeled customer count. Avatar overage applies only after the shared included-minute pool.</p>
                  </div>
                ) : (
                  <p className="p-4 text-sm leading-5 text-rose-200" role="alert">{calculationError}</p>
                )}
              </section>

              <section className={`${panel} space-y-3 p-4`}>
                <div className="flex items-center gap-2 text-sm font-bold text-white"><Save className="h-4 w-4 text-amber-300" aria-hidden="true" /> Save planning snapshot</div>
                <label className={labelClass} htmlFor="malvi-change-reason">Reason for change <span className="text-rose-300">*</span></label>
                <textarea id="malvi-change-reason" className={`${inputClass} min-h-20 resize-y`} minLength={8} maxLength={500} required value={reason} onChange={(e) => setReason(e.currentTarget.value)} placeholder="What changed, and why should this assumption be updated?" />
                <p className="text-[11px] leading-4 text-slate-500">A meaningful reason is required. Save uses snapshot version {response?.snapshot.version ?? '—'} for conflict protection.</p>
                <button type="submit" disabled={!response || !response.canEdit || !response.storageAvailable || !needsSave || reason.trim().length < 8 || !estimate || saving} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-extrabold text-slate-950 transition hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-[#0c1424] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500">
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                  {saving ? 'Saving snapshot…' : response?.canEdit && response.storageAvailable ? 'Save snapshot' : 'Saving unavailable'}
                </button>
                {response && !response.canEdit && <p className="text-xs leading-5 text-slate-400">Local estimates are available. Saving requires finance or super-admin permission.</p>}
                {saveMessage && <p className="flex items-start gap-2 text-xs leading-5 text-emerald-300" role="status"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{saveMessage}</p>}
                {saveError && <p className="text-xs leading-5 text-rose-300" role="alert">{saveError}</p>}
                <button type="button" onClick={resetToDefaults} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 text-xs font-semibold text-slate-300 transition hover:border-amber-400 hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset to public defaults · unsaved
                </button>
                {usingDefaults && <p className="text-[11px] leading-4 text-amber-200" role="status">Public defaults are only a local draft. They will not replace saved settings unless explicitly saved with a reason.</p>}
                {response?.snapshot.savedAt && (
                  <p className="flex items-start gap-1.5 text-[10px] leading-4 text-slate-500"><Clock3 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />Last saved {new Date(response.snapshot.savedAt).toLocaleString()}{response.snapshot.savedBy ? ` by ${response.snapshot.savedBy}` : ''}{response.snapshot.reason ? ` · ${response.snapshot.reason}` : ''}</p>
                )}
              </section>
            </aside>
          </div>

          <section className={`${panel} p-4 sm:p-5`} aria-labelledby="malvi-sources-heading">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 id="malvi-sources-heading" className="text-sm font-bold text-white">Rate sources and review context</h3>
                <p className="mt-1 text-xs text-slate-500">Sources reviewed {COST_REVIEW_DATE}. Public pricing may change independently of this saved model.</p>
              </div>
              <p className="max-w-lg text-xs leading-5 text-amber-200/80">The Flash promotion ends 2026-12-31. Saved rates do not auto-update; review and revise them deliberately.</p>
            </div>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {COST_SOURCES.map((source) => (
                <li key={source.name}>
                  <a href={source.url} target="_blank" rel="noreferrer" className="flex min-h-10 items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-amber-400/50 hover:text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-400">
                    <span>{source.name}</span><span className="text-[10px] text-slate-500">Public source ↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {response && response.history.length > 0 && (
            <section className={`${panel} p-4 sm:p-5`} aria-labelledby="malvi-history-heading">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="malvi-history-heading" className="text-sm font-bold text-white">Recent saved snapshots</h3>
                <span className="text-[10px] font-mono text-slate-500">{response.history.length} retained</span>
              </div>
              <ul className="mt-3 divide-y divide-slate-800">
                {response.history.map((item) => (
                  <li key={`${item.version}-${item.savedAt}`} className="flex min-w-0 flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200">Version {item.version}{item.savedBy ? ` · ${item.savedBy}` : ''}</p>
                      <p className="mt-1 break-words text-xs text-slate-400">{item.reason || 'No reason recorded'}</p>
                    </div>
                    <time className="shrink-0 text-[10px] text-slate-500">{item.savedAt ? new Date(item.savedAt).toLocaleString() : 'Date unavailable'}</time>
                  </li>
                ))}
              </ul>
            </section>
          )}
          </fieldset>
        </form>
      )}
    </section>
  );
};

export default AdminMalviCostCalculator;
