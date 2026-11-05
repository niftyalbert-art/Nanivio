import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, BadgeCheck, Clock3, Layers3, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { protectedBillingRequest } from '../../lib/billingClient';
import type { balancedPricingProposal } from '../../server/subscriptionPricing';

type PricingProposal = ReturnType<typeof balancedPricingProposal>;
type Plan = PricingProposal['plans'][number];
type Pack = PricingProposal['packs'][number];

const numberFormat = new Intl.NumberFormat('en-US');
const resourceLabels: Record<keyof Plan['limits'], string> = {
  callSeconds: 'Ordinary calls',
  translationUnits: 'Langpretation',
  textRequests: 'Text translations',
  textCharacters: 'Source characters',
  voiceSeconds: 'Malvi voice',
  avatarSeconds: 'Malvi avatar',
  searchQueries: 'Search queries',
  storageBytes: 'Storage',
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(cents / 100);
}

function formatBlocker(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (character) => character.toUpperCase());
}

function formatLimit(key: keyof Plan['limits'], value: number) {
  if (value === 0) return 'Not included';
  if (key === 'translationUnits') return `${numberFormat.format(value / 80_000)} standard-equivalent min`;
  if (key === 'callSeconds' || key === 'voiceSeconds' || key === 'avatarSeconds') {
    const minutes = value / 60;
    return `${numberFormat.format(minutes)} ${minutes === 1 ? 'min' : 'min'}`;
  }
  if (key === 'storageBytes') return `${numberFormat.format(value / 1_000_000_000)} GB`;
  return numberFormat.format(value);
}

function ResourceList({ limits }: { limits: Plan['limits'] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
      {(Object.keys(resourceLabels) as Array<keyof Plan['limits']>).map((key) => (
        <div key={key} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-[#e9e2d5] py-2.5 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
          <dt className="text-xs text-[#6f716b]">{resourceLabels[key]}</dt>
          <dd className={`shrink-0 text-right text-xs font-semibold tabular-nums ${limits[key] ? 'text-[#28342f]' : 'text-[#9b9b91]'}`}>
            {formatLimit(key, limits[key])}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const PlanCard: React.FC<{ plan: Plan }> = ({ plan }) => {
  const familyLabel = plan.family === 'malvi' ? 'MALVI' : 'COMMUNICATION';
  return (
    <article className="overflow-hidden rounded-2xl border border-[#ded8cb] bg-[#fffdf8]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#ebe5d9] px-5 py-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.18em] text-[#8b6d33]">{familyLabel} PLAN</p>
          <h3 className="mt-1 font-['DM_Sans',sans-serif] text-lg font-bold tracking-tight text-[#28342f]">{plan.name}</h3>
        </div>
        <span className="rounded-full bg-[#f3efe4] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#69716a]">
          {plan.pooled ? 'Workspace pooled' : 'Individual allocation'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 px-5 py-4">
        <div className="rounded-xl bg-[#f7f4eb] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#79796f]">Monthly</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#28342f]">{formatCurrency(plan.monthlyCents)}</p>
          <p className="text-[11px] text-[#85857b]">per month</p>
        </div>
        <div className="rounded-xl bg-[#eef1e9] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#687164]">Annual</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#28342f]">{formatCurrency(plan.annualCents)}</p>
          <p className="text-[11px] text-[#85857b]">12 monthly allocations</p>
        </div>
      </div>
      <div className="px-5 pb-4">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8c887d]">Included per allocation</p>
        <ResourceList limits={plan.limits} />
        <p className="mt-3 rounded-lg border border-[#e7e0d2] bg-[#faf8f2] px-3 py-2 text-[11px] leading-relaxed text-[#70736b]">
          Cost model only: {formatCurrency(Math.round(plan.estimate.bufferedMonthlyCost * 100))} estimated buffered monthly supplier cost. This is not guaranteed profit or a ledger result.
        </p>
      </div>
    </article>
  );
}

const PackRow: React.FC<{ pack: Pack }> = ({ pack }) => {
  return (
    <article className="grid gap-3 border-b border-[#e8e1d5] px-4 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <h3 className="font-semibold text-[#28342f]">{pack.name}</h3>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#74766f]">
          {(Object.keys(resourceLabels) as Array<keyof Plan['limits']>)
            .filter((key) => pack.limits[key] > 0)
            .map((key) => <span key={key}>{resourceLabels[key]}: <strong className="font-semibold text-[#4c564f]">{formatLimit(key, pack.limits[key])}</strong></span>)}
        </div>
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#8a7651]"><Clock3 className="h-3 w-3" aria-hidden="true" /> Valid for {pack.validityDays} days from purchase</p>
      </div>
      <p className="text-lg font-bold tabular-nums text-[#28342f]">{formatCurrency(pack.priceCents)}</p>
    </article>
  );
}

function LoadingReview() {
  return (
    <div className="space-y-5" aria-label="Loading pricing proposal" aria-busy="true">
      <div className="h-36 animate-pulse rounded-2xl bg-[#e9e5da]" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-64 animate-pulse rounded-2xl bg-[#e9e5da]" />)}
      </div>
    </div>
  );
}

export const AdminBalancedPricingReview: React.FC = () => {
  const [proposal, setProposal] = useState<PricingProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProposal = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await protectedBillingRequest('/api/admin/billing/pricing-proposal');
      if (!response?.success || response.status !== 'DRAFT' || response.purchasable !== false ||
          !Array.isArray(response.plans) || !Array.isArray(response.packs) || !Array.isArray(response.blockers)) {
        throw new Error('The pricing proposal response could not be verified. No catalogue was changed.');
      }
      setProposal(response as PricingProposal);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The proposal could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadProposal(); }, [loadProposal]);

  if (loading) return <LoadingReview />;
  if (error || !proposal) {
    return (
      <section className="rounded-2xl border border-[#e3c8ad] bg-[#fff8ef] p-6" aria-live="polite">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#a45132]" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="font-bold text-[#49382d]">Pricing review unavailable</h2>
            <p className="mt-1 break-words text-sm text-[#76685c]">{error || 'No proposal was returned.'}</p>
            <button type="button" onClick={() => void loadProposal()} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#37473d] px-4 text-sm font-semibold text-[#fffdf8] transition hover:bg-[#29372e] focus:outline-none focus:ring-2 focus:ring-[#a18449] focus:ring-offset-2">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
            </button>
          </div>
        </div>
      </section>
    );
  }

  const assumptionRows = [
    ['Provider cost model', `${proposal.assumptions.voiceProvider} ${proposal.assumptions.voiceSignature}`],
    ['Annual subscription policy', proposal.assumptions.annualPolicy],
    ['Existing purchases', proposal.assumptions.existingPurchases],
    ['FX and checkout', proposal.assumptions.fxPolicy],
    ['Language-route allowance', `${proposal.assumptions.languagePolicy} A standard-equivalent minute is a normalization only; provider routes can consume different measured units and must not be treated as equal-cost or equal-usage routes.`],
    ['Malvi voice and avatar', 'Separate allowances and meters. Voice minutes do not convert into avatar minutes, or vice versa.'],
    ['Business pooling', proposal.assumptions.businessPolicy],
    ['Other policy notes', `${proposal.assumptions.ordinaryChat} ${proposal.assumptions.receivingCalls} ${proposal.assumptions.packs}`],
    ['Excluded from estimate', proposal.assumptions.excludedCosts],
  ];

  return (
    <div className="space-y-6 text-[#28342f]">
      <header className="relative overflow-hidden rounded-[1.35rem] border border-[#d8d7c8] bg-[#e9ede3] p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full border-[34px] border-[#d7dfd0] opacity-70" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#8f4d33] px-3 py-1.5 text-[11px] font-extrabold tracking-[0.12em] text-[#fff9ed]">
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" /> DRAFT
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#c9cfc3] bg-[#f8f8f1] px-3 py-1.5 text-[11px] font-bold text-[#586657]">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Not purchasable
            </span>
            <span className="text-xs font-medium text-[#6f756d]">Proposal {proposal.version}</span>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="max-w-3xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#7c6b43]">Nanivio · administrator review</p>
              <h1 className="mt-2 font-['DM_Sans',sans-serif] text-3xl font-bold leading-tight tracking-[-0.04em] sm:text-4xl">Balanced pricing proposal</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#626b60]">Review the proposed USD schedule and usage allocations. This is a read-only review; checkout and production usage adapters are not integrated.</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-[#d3d8ce] bg-[#f7f8f1] px-4 py-3 text-sm font-semibold text-[#546251]">
              <BadgeCheck className="h-4 w-4" aria-hidden="true" /> No activation controls
            </div>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-[#d8bba4] bg-[#fff7ed] p-5 sm:p-6" aria-labelledby="release-blockers-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[#a45132]" aria-hidden="true" />
            <h2 id="release-blockers-title" className="font-bold text-[#49382d]">Publish remains blocked</h2>
          </div>
          <span className="rounded-full bg-[#f1e1d2] px-3 py-1 text-xs font-bold text-[#8d482f]">{proposal.blockers.length} outstanding</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[#77675a]">The endpoint marks this proposal non-purchasable. Required production evidence is not yet present; nothing here verifies payment or live usage fulfillment.</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {proposal.blockers.map((blocker) => (
            <li key={blocker} className="flex items-start gap-2 rounded-lg border border-[#ebddce] bg-[#fffaf4] px-3 py-2.5 text-xs font-medium text-[#6d5545]">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#a45132]" aria-hidden="true" />{formatBlocker(blocker)}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="plans-heading">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#907747]">01 / Subscriptions</p>
            <h2 id="plans-heading" className="mt-1 text-xl font-bold tracking-tight">Seven proposed plans</h2>
          </div>
          <span className="text-xs text-[#7c7c72]">USD · monthly and annual</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {proposal.plans.map((plan) => <PlanCard key={plan.id} plan={plan} />)}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#ded8cb] bg-[#fffdf8]" aria-labelledby="packs-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e1d5] bg-[#f7f4eb] px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#907747]">02 / One-time allowances</p>
            <h2 id="packs-heading" className="mt-1 text-xl font-bold tracking-tight">Ten proposed packs</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ded8cb] bg-[#fffdf8] px-3 py-1.5 text-xs font-semibold text-[#6f716b]"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> All valid for 30 days</span>
        </div>
        <div className="divide-y-0">
          {proposal.packs.map((pack) => <PackRow key={pack.id} pack={pack} />)}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <article className="rounded-2xl border border-[#ded8cb] bg-[#f2f2e9] p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-[#7a6b45]" aria-hidden="true" />
            <h2 className="font-bold">How allowances work</h2>
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[#5f685f]">
            <li><strong className="text-[#344238]">Annual:</strong> annual payment buys twelve monthly allocations, not one enlarged year-long pool.</li>
            <li><strong className="text-[#344238]">Purchase protection:</strong> existing paid terms, saved allowance snapshots, and consumed trial usage stay preserved.</li>
            <li><strong className="text-[#344238]">Route units:</strong> translation allowances are standard-equivalent units; actual route consumption can differ and must be measured and disclosed.</li>
            <li><strong className="text-[#344238]">Separate meters:</strong> Malvi voice and avatar allowances remain distinct resource limits.</li>
          </ul>
        </article>
        <article className="rounded-2xl border border-[#ded8cb] bg-[#fffdf8] p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-[#7a6b45]" aria-hidden="true" />
            <h2 className="font-bold">Provider and commercial assumptions</h2>
          </div>
          <dl className="mt-3 divide-y divide-[#ece6db]">
            {assumptionRows.map(([label, value]) => (
              <div key={label} className="grid gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
                <dt className="text-xs font-bold text-[#62675e]">{label}</dt>
                <dd className="text-xs leading-relaxed text-[#77786f]">{value}</dd>
              </div>
            ))}
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
              <dt className="text-xs font-bold text-[#62675e]">Payment rails</dt>
              <dd className="text-xs leading-relaxed text-[#77786f]">{proposal.assumptions.paymentMethods.join(', ')} are proposal assumptions only; these integrations are not verified by this review.</dd>
            </div>
          </dl>
          <p className="mt-3 rounded-lg bg-[#f7f4eb] px-3 py-2.5 text-[11px] leading-relaxed text-[#74766e]">
            Plan cost figures use modeled assumptions and a buffer. They exclude listed overhead and are estimates only—not guaranteed margin, profit, or verified provider charges.
          </p>
        </article>
      </section>
    </div>
  );
};

export default AdminBalancedPricingReview;
