import type { PricingPurchaseSnapshot } from '../lib/subscriptionPricing.ts';
import { validatePurchaseSnapshot } from '../lib/subscriptionPricing.ts';
import { isDeepStrictEqual } from 'node:util';
export const PAYSTACK_PURPOSES = ['COMMUNICATION_TOPUP', 'COMMUNICATION_MINUTES', 'SUBSCRIPTION', 'MALVI_SUBSCRIPTION'] as const;

type PricedPlan = {
  id: string; tier: string; name: string; isActive?: boolean;
  priceMonthlyGHS: number | null; priceMonthlyUSD: number;
  priceAnnualGHS: number | null; priceAnnualUSD: number;
  includedLangpretationMinutes?: number; includedVoiceMinutes?: number; includedMalviRequests?: number;
  videoInteractionMinutesLimit?: number;
  voiceInteractionMinutesLimit?: number;
  catalogVersion?: number;
  billingTerms?: PricingPurchaseSnapshot;
};
type MinutePack = { id: string; isActive?: boolean; name?: string; minutes: number; priceGHS: number; priceUSD: number; validityDays?: number; billingTerms?: PricingPurchaseSnapshot };
type Catalog = { subscriptionPlans: PricedPlan[]; malviPlans: PricedPlan[]; communicationMinutePackages: MinutePack[] };

function paymentSubunits(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000
    || !Number.isSafeInteger(Math.round(amount * 100))
    || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    throw new Error('A positive payment amount with at most two decimal places is required.');
  }
  return Math.round(amount * 100);
}

export function quotePaystackOrder(input: Record<string, any>, catalog: Catalog) {
  const purpose = input.purpose ?? 'COMMUNICATION_TOPUP';
  const currency = String(input.currency ?? 'GHS').toUpperCase();
  const billingCycle = input.billingCycle ?? 'MONTHLY';
  if (!['MONTHLY', 'ANNUAL'].includes(billingCycle)) throw new Error('Unsupported billing cycle.');
  if (!['GHS', 'USD', 'NGN', 'ZAR', 'KES'].includes(currency)) throw new Error('Unsupported payment currency.');
  let amount: number | null;
  let product: Record<string, any> | undefined;
  let packageId: string | undefined;
  let planTier: string | undefined;
  if (purpose === 'COMMUNICATION_TOPUP') {
    amount = Number(input.amount);
  } else {
    if (!['GHS', 'USD'].includes(currency)) throw new Error('This product is priced in GHS or USD.');
    if (purpose === 'COMMUNICATION_MINUTES') {
      const pack = catalog.communicationMinutePackages.find(p => p.id === input.packageId && p.isActive !== false);
      if (!pack || !Number.isSafeInteger(pack.minutes) || pack.minutes <= 0
        || !Number.isSafeInteger(pack.validityDays ?? 30) || (pack.validityDays ?? 30) <= 0) throw new Error('Minute package is not available.');
      amount = currency === 'USD' ? pack.priceUSD : pack.priceGHS;
      packageId = pack.id;
      if (input.minutes != null && Number(input.minutes) !== pack.minutes) throw new Error('Minute count does not match the selected package.');
      product = { id: pack.id, name: pack.name, minutes: pack.minutes, validityDays: pack.validityDays ?? 30,
        ...(pack.billingTerms ? { billingTerms: structuredClone(pack.billingTerms) } : {}) };
    } else if (purpose === 'SUBSCRIPTION' || purpose === 'MALVI_SUBSCRIPTION') {
      const plans = purpose === 'SUBSCRIPTION' ? catalog.subscriptionPlans : catalog.malviPlans;
      const plan = plans.find(p => p.tier === input.planTier && p.isActive !== false);
      if (!plan) throw new Error('Subscription plan is not available.');
      if (purpose === 'MALVI_SUBSCRIPTION' && typeof plan.catalogVersion === 'number' &&
          (input.catalogVersion ?? input.metadata?.catalogVersion) !== plan.catalogVersion) {
        throw new Error('Malvi plan details changed or need refreshing. Reload the published plan before paying.');
      }
      amount = billingCycle === 'ANNUAL'
        ? currency === 'USD' ? plan.priceAnnualUSD : plan.priceAnnualGHS
        : currency === 'USD' ? plan.priceMonthlyUSD : plan.priceMonthlyGHS;
      planTier = plan.tier;
      product = {
        id: plan.id, tier: plan.tier, name: plan.name,
        periodDays: billingCycle === 'ANNUAL' ? 365 : 30,
        langpretationQuota: plan.includedLangpretationMinutes ?? 0,
        voiceQuota: plan.includedVoiceMinutes ?? 0,
        malviQuota: plan.includedMalviRequests ?? 0,
        videoMinutesAllowed: plan.videoInteractionMinutesLimit ?? 0,
        ...(plan.billingTerms ? {
          billingTerms: { ...structuredClone(plan.billingTerms), cycle: billingCycle,
            allocations: billingCycle === 'ANNUAL' ? 12 : 1,
            priceCentsUSD: Math.round((billingCycle === 'ANNUAL' ? plan.priceAnnualUSD : plan.priceMonthlyUSD) * 100) },
          planSnapshot: structuredClone(plan),
        } : {}),
        ...(purpose === 'MALVI_SUBSCRIPTION' ? {
          voiceMinutesAllowed: plan.voiceInteractionMinutesLimit ?? plan.videoInteractionMinutesLimit ?? 0,
          catalogVersion: plan.catalogVersion,
          planSnapshot: { ...plan },
        } : {}),
      };
      if (product.billingTerms && product.planSnapshot) {
        product.planSnapshot.billingTerms = structuredClone(product.billingTerms);
      }
    } else throw new Error('Unsupported Paystack payment purpose.');
    if (input.amount != null && Number(input.amount) !== amount) throw new Error('Price changed or checkout amount does not match the configured product.');
  }
  if (typeof amount !== 'number') throw new Error('This product has no available price in the selected currency.');
  paymentSubunits(amount);
  if (product?.billingTerms) validatePurchaseSnapshot(product.billingTerms);
  return { purpose, currency, billingCycle, amount, packageId, planTier, minutes: product?.minutes, product };
}

// Legacy saved intents may contain client prices/quantities. Only the live
// server catalog can authorize first delivery; nested metadata is rebuilt.
export function validatePaystackOrderProduct(order: any, catalog: Catalog) {
  if (!order?.purpose || !order.currency) throw new Error('Paystack order is missing its payment purpose or currency.');
  const quote = quotePaystackOrder({
    ...order, catalogVersion: order.product?.catalogVersion ?? order.catalogVersion,
  }, catalog);
  if (order.product != null && (!quote.product || Object.entries(quote.product).some(([key, value]) => {
    if (key === 'planSnapshot') return false;
    const saved = order.product[key];
    if (value === undefined || saved === undefined) return value !== saved;
    return !isDeepStrictEqual(JSON.parse(JSON.stringify(value)), JSON.parse(JSON.stringify(saved)));
  }))) throw new Error('Saved Paystack product does not match the active catalog.');
  return quote;
}

export function validateVerifiedOrder(order: any, userId: string, amount: number, currency: string) {
  if (!order || order.userId !== userId) throw new Error('No authoritative Paystack order exists for this account/reference.');
  if (paymentSubunits(order.amount) !== paymentSubunits(amount)) {
    throw new Error('Verified Paystack amount does not match the Nanivio order.');
  }
  if (order.currency !== currency.toUpperCase()) throw new Error('Verified Paystack currency does not match the Nanivio order.');
}
