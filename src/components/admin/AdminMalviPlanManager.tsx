import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Clock3, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import {
  MALVI_CATALOG_TIERS,
  MalviCatalogError,
  validateMalviPlans,
  type MalviCatalogPlan,
  type MalviCatalogResponse,
  type MalviCatalogSnapshot,
  type MalviPlanStatus,
} from '../../lib/malviPlanCatalog';
import { loadMalviPlanCatalog, saveMalviPlanCatalog } from '../../lib/malviPlanClient';

const panel = 'rounded-2xl border border-slate-800 bg-[#0c1424]';
const inputClass = 'w-full min-w-0 rounded-xl border border-slate-700 bg-[#080e18] px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 disabled:cursor-not-allowed disabled:opacity-60';
const labelClass = 'block text-xs font-semibold text-slate-200';
const tierLabels: Record<MalviCatalogPlan['tier'], string> = {
  free: 'Free',
  malvi_voice: 'Voice',
  malvi_basic: 'Basic',
  malvi_premium: 'Premium',
  malvi_business: 'Business',
};
const stableIds: Record<MalviCatalogPlan['tier'], string> = {
  free: 'malvi_free',
  malvi_voice: 'malvi_voice',
  malvi_basic: 'malvi_basic',
  malvi_premium: 'malvi_premium',
  malvi_business: 'malvi_business',
};
const statusStyles: Record<MalviPlanStatus, string> = {
  DRAFT: 'border-slate-600 bg-slate-800 text-slate-200',
  PUBLISHED: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  ARCHIVED: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
};
const samePlans = (a: MalviCatalogPlan[], b: MalviCatalogPlan[]) => {
  const order = (plans: MalviCatalogPlan[]) => [...plans].sort((left, right) => MALVI_CATALOG_TIERS.indexOf(left.tier) - MALVI_CATALOG_TIERS.indexOf(right.tier));
  return JSON.stringify(order(a)) === JSON.stringify(order(b));
};
const clonePlans = (plans: MalviCatalogPlan[]) => plans.map((plan) => ({
  ...plan,
  features: [...plan.features],
  unavailableFeatures: [...(plan.unavailableFeatures ?? [])],
}));
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString() : 'Date unavailable';

function Field({ id, label, value, onChange, disabled, multiline = false, hint, maxLength }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  multiline?: boolean;
  hint?: string;
  maxLength?: number;
}) {
  const common = {
    id,
    className: inputClass,
    value,
    disabled,
    maxLength,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.currentTarget.value),
    'aria-describedby': hint ? `${id}-hint` : undefined,
  };
  return (
    <div className="min-w-0 space-y-1.5">
      <label className={labelClass} htmlFor={id}>{label}</label>
      {multiline
        ? <textarea {...common} rows={3} className={`${inputClass} min-h-20 resize-y`} />
        : <input {...common} type="text" />}
      {hint && <p id={`${id}-hint`} className="text-[11px] leading-4 text-slate-500">{hint}</p>}
    </div>
  );
}

function NumberField({ id, label, value, onChange, disabled, integer = false, hint }: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
  integer?: boolean;
  hint?: string;
}) {
  const [rawValue, setRawValue] = useState(String(value));
  const lastPropValue = useRef(value);
  useEffect(() => {
    if (value !== lastPropValue.current) {
      lastPropValue.current = value;
      setRawValue(String(value));
    }
  }, [value]);
  return (
    <div className="min-w-0 space-y-1.5">
      <label className={labelClass} htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`${inputClass} font-mono tabular-nums`}
        type="number"
        inputMode={integer ? 'numeric' : 'decimal'}
        min={0}
        max={integer ? 1000000 : 10000}
        step={integer ? 1 : 0.01}
        value={rawValue}
        disabled={disabled}
        onChange={(event) => {
          const raw = event.currentTarget.value;
          setRawValue(raw);
          if (raw === '' || raw === '-' || raw.endsWith('.')) return;
          const next = Number(raw);
          if (Number.isFinite(next)) {
            lastPropValue.current = next;
            onChange(next);
          }
        }}
        onBlur={() => {
          if (rawValue === '' || rawValue === '-') setRawValue(String(value));
        }}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && <p id={`${id}-hint`} className="text-[11px] leading-4 text-slate-500">{hint}</p>}
    </div>
  );
}

function Toggle({ id, label, checked, disabled, onChange, description }: {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}) {
  return (
    <label htmlFor={id} className="flex min-h-12 items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 accent-amber-400 focus:ring-2 focus:ring-amber-400" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-slate-200">{label}</span>
        {description && <span className="mt-1 block text-[11px] leading-4 text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

function changedPublishedLimits(before: MalviCatalogPlan[], after: MalviCatalogPlan[]) {
  return after.flatMap((plan) => {
    const old = before.find((item) => item.tier === plan.tier);
    if (!old || plan.status !== 'PUBLISHED') return [];
    const changes: string[] = [];
    if (old.priceMonthlyUSD !== plan.priceMonthlyUSD || old.priceAnnualUSD !== plan.priceAnnualUSD) changes.push('USD prices');
    if (old.voiceInteractionMinutesLimit !== plan.voiceInteractionMinutesLimit) changes.push('voice minutes');
    if (old.videoInteractionMinutesLimit !== plan.videoInteractionMinutesLimit) changes.push('video minutes');
    return changes.length ? [{ name: tierLabels[plan.tier], changes }] : [];
  });
}

export const AdminMalviPlanManager: React.FC = () => {
  const [response, setResponse] = useState<MalviCatalogResponse | null>(null);
  const [plans, setPlans] = useState<MalviCatalogPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [inputError, setInputError] = useState('');
  const [reviewPending, setReviewPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setSaveError('');
    setSaveMessage('');
    try {
      const result = await loadMalviPlanCatalog();
      const ordered = [...result.snapshot.plans].sort((a, b) => MALVI_CATALOG_TIERS.indexOf(a.tier) - MALVI_CATALOG_TIERS.indexOf(b.tier));
      if (ordered.length !== MALVI_CATALOG_TIERS.length || MALVI_CATALOG_TIERS.some((tier, index) => ordered[index]?.tier !== tier || ordered[index]?.id !== stableIds[tier])) {
        throw new Error('The saved catalogue does not contain all five stable Malvi plan identities. No fallback plans were loaded.');
      }
      setResponse(result);
      setPlans(clonePlans(ordered));
      setReason('');
      setInputError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load the saved plan catalogue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dirty = response ? !samePlans(plans, response.snapshot.plans) : false;
  const needsSave = Boolean(response && (dirty || response.snapshot.version === 0));
  const publishedChanges = useMemo(
    () => response ? changedPublishedLimits(response.snapshot.plans, plans) : [],
    [response, plans],
  );

  const updatePlan = <K extends keyof MalviCatalogPlan>(tier: MalviCatalogPlan['tier'], key: K, value: MalviCatalogPlan[K]) => {
    setPlans((current) => current.map((plan) => plan.tier === tier ? { ...plan, [key]: value } : plan));
    setInputError('');
    setSaveError('');
    setSaveMessage('');
  };

  const submitSave = async () => {
    if (!response || !response.canEdit || !response.storageAvailable || !needsSave || reason.trim().length < 8 || saving) return;
    let validated: MalviCatalogPlan[];
    try {
      validated = validateMalviPlans(plans);
      setInputError('');
    } catch (error) {
      setInputError(error instanceof MalviCatalogError ? error.message : error instanceof Error ? error.message : 'Review the plan inputs.');
      setReviewPending(false);
      return;
    }
    setSaving(true);
    setReviewPending(false);
    setSaveMessage('');
    setSaveError('');
    try {
      const result = await saveMalviPlanCatalog({
        expectedVersion: response.snapshot.version,
        plans: validated,
        reason: reason.trim(),
      });
      const ordered = [...result.snapshot.plans].sort((a, b) => MALVI_CATALOG_TIERS.indexOf(a.tier) - MALVI_CATALOG_TIERS.indexOf(b.tier));
      setResponse(result);
      setPlans(clonePlans(ordered));
      setReason('');
      setSaveMessage(`Catalogue saved and applied as version ${result.snapshot.version}. Published-plan changes apply to future purchases only.`);
    } catch (error) {
      setSaveError(`Not saved: ${error instanceof Error ? error.message : 'The catalogue could not be saved.'} Your edits are preserved. Reload the saved snapshot before retrying a possible version conflict.`);
    } finally {
      setSaving(false);
    }
  };

  const requestSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (!response || !response.canEdit || !response.storageAvailable || !needsSave || reason.trim().length < 8 || saving) return;
    try {
      validateMalviPlans(plans);
      setInputError('');
    } catch (error) {
      setInputError(error instanceof MalviCatalogError ? error.message : error instanceof Error ? error.message : 'Review the plan inputs.');
      return;
    }
    if (publishedChanges.length) setReviewPending(true);
    else void submitSave();
  };

  const disabled = saving || !response?.canEdit;

  return (
    <section className="w-full min-w-0 space-y-5 text-slate-100" aria-labelledby="malvi-plans-title">
      <header className={`${panel} overflow-hidden`}>
        <div className="border-b border-slate-800 bg-gradient-to-r from-[#141d2b] via-[#101a29] to-[#14241f] p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">Commercial catalogue · Malvi</p>
                <h2 id="malvi-plans-title" className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">Plan manager</h2>
                <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-400">Control the catalogue customers can buy. USD is authoritative; customer reads derive GHS server-side from FX.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {response && <button type="button" disabled={saving || loading} onClick={() => {
                if (!dirty || window.confirm('Reload the saved catalogue? Unsaved plan edits will be discarded.')) void load();
              }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 px-3 text-xs font-semibold text-slate-200 hover:border-amber-400 disabled:opacity-50">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Reload saved
              </button>}
              {response && <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 font-mono text-[11px] text-slate-300">Version {response.snapshot.version}</span>}
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-3.5">
            <p className="text-xs font-bold text-amber-200">Future purchases only</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">Saved published-plan changes affect future purchases only. Existing subscriptions, consumption and agreed terms are not rewritten.</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
            <p className="text-xs font-bold text-slate-200">Catalogue copy is not enforcement</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">Feature descriptions communicate intended benefits; they do not prove that runtime capability limits are enforced.</p>
          </div>
        </div>
      </header>

      {loading && <div className={`${panel} space-y-4 p-5`} role="status" aria-live="polite">
        <p className="text-sm font-semibold text-slate-200">Loading saved plan catalogue…</p>
        <div className="h-3 animate-pulse rounded bg-slate-800" />
        <div className="h-28 animate-pulse rounded-xl bg-slate-800/70" />
        <div className="h-28 animate-pulse rounded-xl bg-slate-800/70" />
      </div>}

      {!loading && loadError && <div className="rounded-2xl border border-rose-500/35 bg-rose-950/20 p-5" role="alert">
        <p className="font-bold text-rose-200">Saved catalogue could not be loaded</p>
        <p className="mt-1 break-words text-sm text-rose-100/75">{loadError}</p>
        <button type="button" onClick={() => void load()} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose-200 px-4 text-sm font-bold text-rose-950 hover:bg-white focus:outline-none focus:ring-2 focus:ring-rose-300">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry loading
        </button>
      </div>}

      {!loading && response && <>
        {(response.storageWarning || !response.storageAvailable) && <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4" role="status">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-100">{response.storageAvailable ? 'Shared storage notice' : 'Database setup required · saving unavailable'}</p>
            <p className="mt-1 break-words text-xs leading-5 text-amber-100/70">{response.storageWarning || 'Apply migrations/012_malvi_plan_catalog.sql to the existing Supabase project before saving plans or enabling checkout. Unsaved editing remains available; no changes have been saved or published.'}</p>
            <p className="mt-1 text-xs font-semibold text-amber-100">Required before saving or checkout: migrations/012_malvi_plan_catalog.sql in the existing Supabase project.</p>
          </div>
        </div>}
        {!response.canEdit && <p className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-xs leading-5 text-slate-400" role="status">Read-only access. Editing and saving require finance or super-admin permission.</p>}
      </>}

      {!loading && response && !loadError && (
        <form onSubmit={requestSave} className="space-y-5">
          <fieldset disabled={saving} className="min-w-0 space-y-5">
            {plans.map((plan) => {
              const tier = plan.tier;
              const isFree = tier === 'free';
              const isVoice = tier === 'malvi_voice';
              const planDisabled = disabled;
              return (
                <article key={plan.id} className={`${panel} min-w-0 overflow-hidden`}>
                  <div className="flex flex-col gap-3 border-b border-slate-800 bg-slate-950/35 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 font-mono text-xs font-bold text-amber-200">{String(MALVI_CATALOG_TIERS.indexOf(tier) + 1).padStart(2, '0')}</span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{tierLabels[tier]} plan</p>
                        <h3 className="truncate text-base font-bold text-white">{plan.name}</h3>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide ${statusStyles[plan.status]}`}>{plan.status}</span>
                      <span className="rounded-full border border-slate-700 px-2.5 py-1 font-mono text-[10px] text-slate-400">{isFree ? 'Free · fixed' : isVoice ? 'Voice-only identity' : 'Stable plan identity'}</span>
                    </div>
                  </div>
                  <div className="space-y-5 p-4 sm:p-5">
                    <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <Field id={`${plan.id}-name`} label="Customer-facing name" value={plan.name} onChange={(value) => updatePlan(tier, 'name', value)} disabled={planDisabled} maxLength={80} />
                      <Field id={`${plan.id}-tagline`} label="Tagline" value={plan.tagline} onChange={(value) => updatePlan(tier, 'tagline', value)} disabled={planDisabled} maxLength={160} />
                      <NumberField id={`${plan.id}-monthly`} label="Monthly price · USD" value={plan.priceMonthlyUSD} onChange={(value) => updatePlan(tier, 'priceMonthlyUSD', value)} disabled={planDisabled || isFree} hint={isFree ? 'Free is fixed at USD 0.00.' : 'Authoritative USD amount; GHS is derived on customer reads.'} />
                      <NumberField id={`${plan.id}-annual`} label="Annual price · USD" value={plan.priceAnnualUSD} onChange={(value) => updatePlan(tier, 'priceAnnualUSD', value)} disabled={planDisabled || isFree} hint={isFree ? 'Free is fixed at USD 0.00.' : 'No separate GHS price is stored or edited here.'} />
                    </div>
                    <Field id={`${plan.id}-description`} label="Plan description" value={plan.description} onChange={(value) => updatePlan(tier, 'description', value)} disabled={planDisabled} multiline maxLength={1500} />
                    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                      <NumberField id={`${plan.id}-voice-minutes`} label="Voice interaction minutes" value={plan.voiceInteractionMinutesLimit} onChange={(value) => updatePlan(tier, 'voiceInteractionMinutesLimit', value)} disabled={planDisabled} integer hint="Whole minutes, 0–1,000,000. Zero is a literal zero allowance." />
                      <NumberField id={`${plan.id}-video-minutes`} label="Video interaction minutes" value={plan.videoInteractionMinutesLimit} onChange={(value) => updatePlan(tier, 'videoInteractionMinutesLimit', value)} disabled={planDisabled || isVoice || !plan.avatarInteractive} integer hint="Whole minutes, 0–1,000,000. No avatar means video must remain zero." />
                    </div>
                    <div className="grid min-w-0 gap-4 md:grid-cols-3">
                      <Field id={`${plan.id}-voice-copy`} label="Voice capability description" value={plan.voiceCapabilities} onChange={(value) => updatePlan(tier, 'voiceCapabilities', value)} disabled={planDisabled} multiline maxLength={300} />
                      <Field id={`${plan.id}-translation-copy`} label="Translation capability description" value={plan.langpretationCapabilities} onChange={(value) => updatePlan(tier, 'langpretationCapabilities', value)} disabled={planDisabled} multiline maxLength={300} />
                      <Field id={`${plan.id}-ai-copy`} label="AI capability description" value={plan.aiInteractionCapabilities} onChange={(value) => updatePlan(tier, 'aiInteractionCapabilities', value)} disabled={planDisabled} multiline maxLength={300} />
                    </div>
                    <div className="grid min-w-0 gap-4 md:grid-cols-2">
                      <Field id={`${plan.id}-included`} label="Included feature descriptions" value={plan.features.join('\n')} onChange={(value) => updatePlan(tier, 'features', value.split('\n'))} disabled={planDisabled} multiline hint="One description per line; up to 30 lines, 300 characters each. Blank lines are ignored when saved." />
                      <Field id={`${plan.id}-excluded`} label="Excluded feature descriptions" value={(plan.unavailableFeatures ?? []).join('\n')} onChange={(value) => updatePlan(tier, 'unavailableFeatures', value.split('\n'))} disabled={planDisabled} multiline hint="One description per line; up to 30 lines, 300 characters each. Blank lines are ignored when saved." />
                    </div>
                    <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                      <Toggle id={`${plan.id}-avatar`} label="Interactive avatar included" checked={plan.avatarInteractive} disabled={planDisabled || isVoice} onChange={(value) => {
                        setPlans((current) => current.map((item) => item.tier === tier ? { ...item, avatarInteractive: value, videoInteractionMinutesLimit: value ? item.videoInteractionMinutesLimit : 0 } : item));
                        setInputError('');
                      }} description={isVoice ? 'Voice remains avatar-free.' : undefined} />
                      <Toggle id={`${plan.id}-business`} label="Business collaboration" checked={plan.businessCollaboration} disabled={planDisabled || isVoice} onChange={(value) => updatePlan(tier, 'businessCollaboration', value)} description={isVoice ? 'Voice remains business-free.' : undefined} />
                      <Toggle id={`${plan.id}-popular`} label="Mark as popular" checked={Boolean(plan.isPopular)} disabled={planDisabled} onChange={(value) => updatePlan(tier, 'isPopular', value)} />
                    </div>
                    <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                      <div className="space-y-1.5">
                        <label className={labelClass} htmlFor={`${plan.id}-status`}>Catalogue status</label>
                        <select id={`${plan.id}-status`} className={inputClass} value={plan.status} disabled={planDisabled || isFree} onChange={(event) => updatePlan(tier, 'status', event.currentTarget.value as MalviPlanStatus)}>
                          <option value="DRAFT">Draft · not offered for new purchases</option>
                          <option value="PUBLISHED" disabled={isVoice}>Published · offered for new purchases</option>
                          { !isFree && <option value="ARCHIVED">Archived · unavailable for new purchases</option> }
                        </select>
                        {isFree && <p className="text-[11px] leading-4 text-slate-500">Free remains published and zero-priced.</p>}
                        {isVoice && <p className="text-[11px] leading-4 text-amber-200">Voice is an editable draft only. Voice-only session delivery and usage enforcement must be completed before it can be sold.</p>}
                      </div>
                      {!isFree && <p className="self-end rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs leading-5 text-slate-400">
                        Archiving preserves this stable plan and existing purchase history while removing it from new purchases. Physical deletion is not available.
                      </p>}
                    </div>
                  </div>
                </article>
              );
            })}
          </fieldset>

          <section className={`${panel} space-y-4 p-4 sm:p-5`} aria-labelledby="plan-save-heading">
            <div className="flex items-center gap-2 text-sm font-bold text-white"><Save className="h-4 w-4 text-amber-300" aria-hidden="true" /><h3 id="plan-save-heading">Save catalogue snapshot</h3></div>
            <label className={labelClass} htmlFor="malvi-plan-reason">Reason for change <span className="text-rose-300">*</span></label>
            <textarea id="malvi-plan-reason" className={`${inputClass} min-h-20 resize-y`} minLength={8} maxLength={500} required value={reason} onChange={(event) => setReason(event.currentTarget.value)} placeholder="What is changing, and why?" />
            <p className="text-[11px] leading-4 text-slate-500">Enter 8–500 characters. Save submits all five stable plans against snapshot version {response.snapshot.version}.</p>
            {inputError && <p className="text-sm leading-5 text-rose-300" role="alert">{inputError}</p>}
            {saveError && <p className="text-sm leading-5 text-rose-300" role="alert">{saveError}</p>}
            {saveMessage && <p className="flex items-start gap-2 text-sm leading-5 text-emerald-300" role="status"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{saveMessage}</p>}
            <button type="submit" disabled={!response.canEdit || !response.storageAvailable || !needsSave || reason.trim().length < 8 || saving} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-extrabold text-slate-950 transition hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-[#0c1424] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 sm:w-auto">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {saving ? 'Saving catalogue…' : !response.storageAvailable ? 'Database setup required' : !response.canEdit ? 'Read-only access' : needsSave ? 'Save all plan changes' : 'No unsaved changes'}
            </button>
            {saving && <p className="text-xs text-slate-400" role="status">Inputs are temporarily locked while the server applies this snapshot, so no in-flight edits can be overwritten.</p>}
            {response.snapshot.savedAt && <p className="flex items-start gap-1.5 text-[10px] leading-4 text-slate-500"><Clock3 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />Last saved {dateLabel(response.snapshot.savedAt)}{response.snapshot.savedBy ? ` by ${response.snapshot.savedBy}` : ''}{response.snapshot.reason ? ` · ${response.snapshot.reason}` : ''}</p>}
          </section>
        </form>
      )}

      {!loading && response?.history?.length > 0 && <section className={`${panel} p-4 sm:p-5`} aria-labelledby="malvi-plan-history-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="malvi-plan-history-heading" className="text-sm font-bold text-white">Previous catalogue snapshots</h3>
          <span className="font-mono text-[10px] text-slate-500">{response.history.length} retained</span>
        </div>
        <ul className="mt-3 divide-y divide-slate-800">
          {response.history.map((item: MalviCatalogSnapshot) => (
            <li key={`${item.version}-${item.savedAt}`} className="flex min-w-0 flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-200">Version {item.version}{item.savedBy ? ` · ${item.savedBy}` : ''}</p>
                <p className="mt-1 break-words text-xs text-slate-400">{item.reason || 'No reason recorded'}</p>
                <p className="mt-1 text-[11px] text-slate-500">{item.plans.map((plan) => `${tierLabels[plan.tier]}: ${plan.status}`).join(' · ')}</p>
              </div>
              <time className="shrink-0 text-[10px] text-slate-500">{dateLabel(item.savedAt)}</time>
            </li>
          ))}
        </ul>
      </section>}

      {reviewPending && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:items-center" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) setReviewPending(false);
      }}>
        <section role="dialog" aria-modal="true" aria-labelledby="malvi-plan-review-title" className="w-full max-w-lg rounded-2xl border border-amber-500/40 bg-[#101a29] p-5 shadow-2xl sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200"><AlertTriangle className="h-5 w-5" aria-hidden="true" /></div>
            <div className="min-w-0">
              <h2 id="malvi-plan-review-title" className="text-lg font-bold text-white">Review published plan changes</h2>
              <p className="mt-1 text-sm leading-5 text-slate-300">Confirm the effects before applying this published catalogue snapshot.</p>
            </div>
          </div>
          <ul className="mt-4 space-y-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            {publishedChanges.map((item) => <li key={item.name} className="text-sm text-slate-200"><span className="font-semibold">{item.name}:</span> {item.changes.join(', ')} changed</li>)}
          </ul>
          <p className="mt-4 text-xs leading-5 text-amber-100/80">Saved published-plan price and allowance changes affect FUTURE purchases only. Existing subscriptions, consumption and agreed terms are not rewritten. No runtime capability enforcement is implied by catalogue descriptions.</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={saving} onClick={() => setReviewPending(false)} className="min-h-11 rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-200 hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50">Keep editing</button>
            <button type="button" disabled={saving} onClick={() => void submitSave()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-extrabold text-slate-950 hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:opacity-50">
              <Check className="h-4 w-4" aria-hidden="true" /> Confirm and save
            </button>
          </div>
        </section>
      </div>}
    </section>
  );
};

export default AdminMalviPlanManager;
