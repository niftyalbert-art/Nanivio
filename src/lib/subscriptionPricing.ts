/**
 * Owner-approved balanced price schedule. Checkout uses versioned copies of
 * these terms and requires the billing rollout migration before taking payment.
 * Updating this schedule must never recalculate an existing purchased grant.
 *
 * Integer units avoid rounding a character, a search query or a speech billing
 * unit into free usage. USD prices are stored in cents; FX belongs to checkout.
 */
export const SUBSCRIPTION_PRICING_VERSION = 'balanced-2026-11';
export const USAGE_RESOURCES = [
  'callSeconds', 'translationUnits', 'textRequests', 'textCharacters',
  'voiceSeconds', 'avatarSeconds', 'searchQueries', 'storageBytes',
] as const;
export type UsageResource = typeof USAGE_RESOURCES[number];
export type UsageLimits = Record<UsageResource, number>;
export type PricingFamily = 'malvi' | 'communication';
export type PricingCycle = 'MONTHLY' | 'ANNUAL';
export interface BalancedPlan {
  id: string;
  tier: string;
  name: string;
  family: PricingFamily;
  monthlyCents: number;
  annualCents: number;
  limits: UsageLimits;
  pooled: boolean;
}
export interface BalancedPack {
  id: string;
  name: string;
  priceCents: number;
  validityDays: 30;
  limits: UsageLimits;
}
export function usageLimits(values: Partial<UsageLimits> = {}): UsageLimits {
  return Object.fromEntries(USAGE_RESOURCES.map(key => [key, values[key] ?? 0])) as UsageLimits;
}
const GB = 1_000_000_000;
// One standard-equivalent minute = 80,000 micro-USD of modeled upstream cost.
export const TRANSLATION_UNITS_PER_MINUTE = 80_000;
export const BALANCED_PLANS: readonly BalancedPlan[] = [
  { id: 'malvi_voice', tier: 'malvi_voice', name: 'Malvi Voice', family: 'malvi',
    monthlyCents: 799, annualCents: 8599, limits: usageLimits({ voiceSeconds: 80 * 60 }), pooled: false },
  { id: 'malvi_basic', tier: 'malvi_basic', name: 'Malvi Basic', family: 'malvi',
    monthlyCents: 999, annualCents: 10799, limits: usageLimits({ voiceSeconds: 20 * 60, avatarSeconds: 15 * 60 }), pooled: false },
  { id: 'malvi_premium', tier: 'malvi_premium', name: 'Malvi Premium', family: 'malvi',
    monthlyCents: 2499, annualCents: 26999,
    limits: usageLimits({ voiceSeconds: 50 * 60, avatarSeconds: 40 * 60, searchQueries: 20 }), pooled: false },
  { id: 'malvi_business', tier: 'malvi_business', name: 'Malvi Business', family: 'malvi',
    monthlyCents: 7999, annualCents: 85999,
    limits: usageLimits({ voiceSeconds: 160 * 60, avatarSeconds: 120 * 60, searchQueries: 100 }), pooled: true },
  { id: 'plan_individual_premium', tier: 'individual_premium', name: 'Individual Premium', family: 'communication',
    monthlyCents: 1499, annualCents: 15999,
    limits: usageLimits({ callSeconds: 200 * 60, translationUnits: 20 * TRANSLATION_UNITS_PER_MINUTE,
      textRequests: 300, textCharacters: 20_000, storageBytes: 2 * GB }), pooled: false },
  { id: 'plan_langpretation_pro', tier: 'langpretation_pro', name: 'Langpretation Pro', family: 'communication',
    monthlyCents: 3999, annualCents: 43999,
    limits: usageLimits({ callSeconds: 500 * 60, translationUnits: 60 * TRANSLATION_UNITS_PER_MINUTE,
      textRequests: 1000, textCharacters: 75_000, storageBytes: 10 * GB }), pooled: false },
  { id: 'plan_business_b2b', tier: 'business_b2b', name: 'Business / B2B', family: 'communication',
    monthlyCents: 12999, annualCents: 139999,
    limits: usageLimits({ callSeconds: 1500 * 60, translationUnits: 200 * TRANSLATION_UNITS_PER_MINUTE,
      textRequests: 3000, textCharacters: 250_000, storageBytes: 50 * GB }), pooled: true },
];
function pack(id: string, name: string, priceCents: number, limits: Partial<UsageLimits>): BalancedPack {
  return { id, name, priceCents, validityDays: 30, limits: usageLimits(limits) };
}
export const BALANCED_PACKS: readonly BalancedPack[] = [
  pack('call_100', '100 ordinary call minutes', 299, { callSeconds: 100 * 60 }),
  pack('call_500', '500 ordinary call minutes', 1299, { callSeconds: 500 * 60 }),
  pack('call_1500', '1,500 ordinary call minutes', 3499, { callSeconds: 1500 * 60 }),
  pack('lang_10', '10 standard-equivalent Langpretation minutes', 299, { translationUnits: 10 * TRANSLATION_UNITS_PER_MINUTE }),
  pack('lang_40', '40 standard-equivalent Langpretation minutes', 999, { translationUnits: 40 * TRANSLATION_UNITS_PER_MINUTE }),
  pack('lang_100', '100 standard-equivalent Langpretation minutes', 2499, { translationUnits: 100 * TRANSLATION_UNITS_PER_MINUTE }),
  pack('text_300', '300 translations / 20,000 source characters', 499, { textRequests: 300, textCharacters: 20_000 }),
  pack('text_1000', '1,000 translations / 75,000 source characters', 1499, { textRequests: 1000, textCharacters: 75_000 }),
  pack('malvi_voice_50', '50 Malvi voice-only minutes', 499, { voiceSeconds: 50 * 60 }),
  pack('malvi_avatar_10', '10 Malvi avatar minutes', 499, { avatarSeconds: 10 * 60 }),
];

export interface PricingPurchaseSnapshot {
  schemaVersion: 1;
  pricingVersion: typeof SUBSCRIPTION_PRICING_VERSION;
  productId: string;
  productName: string;
  kind: 'subscription' | 'pack';
  family: PricingFamily;
  cycle: PricingCycle | null;
  priceCentsUSD: number;
  allocations: 1 | 12;
  validityDays: 30 | null;
  limits: UsageLimits;
  pooled: boolean;
}
export function pricingPurchaseSnapshot(
  productId: string, cycle: PricingCycle = 'MONTHLY',
): PricingPurchaseSnapshot {
  if (!['MONTHLY', 'ANNUAL'].includes(cycle)) throw new Error('Unsupported billing cycle.');
  const plan = BALANCED_PLANS.find(p => p.id === productId);
  const addOn = BALANCED_PACKS.find(p => p.id === productId);
  if (!plan && !addOn) throw new Error('Unknown balanced-pricing product.');
  const limits = { ...(plan ?? addOn)!.limits };
  return {
    schemaVersion: 1, pricingVersion: SUBSCRIPTION_PRICING_VERSION,
    productId, productName: (plan ?? addOn)!.name,
    kind: plan ? 'subscription' : 'pack',
    family: plan?.family ?? (limits.voiceSeconds || limits.avatarSeconds ? 'malvi' : 'communication'),
    cycle: plan ? cycle : null,
    priceCentsUSD: plan ? cycle === 'ANNUAL' ? plan.annualCents : plan.monthlyCents : addOn!.priceCents,
    allocations: plan && cycle === 'ANNUAL' ? 12 : 1,
    validityDays: plan ? null : 30,
    limits, pooled: plan?.pooled ?? false,
  };
}

export function validatePurchaseSnapshot(value: unknown): asserts value is PricingPurchaseSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid purchased-benefit snapshot.');
  const snapshot = value as PricingPurchaseSnapshot;
  if (snapshot.schemaVersion !== 1 || snapshot.pricingVersion !== SUBSCRIPTION_PRICING_VERSION ||
      !['subscription', 'pack'].includes(snapshot.kind) || !['malvi', 'communication'].includes(snapshot.family) ||
      typeof snapshot.productId !== 'string' || !snapshot.productId || snapshot.productId.length > 100 ||
      typeof snapshot.productName !== 'string' || !snapshot.productName || snapshot.productName.length > 200 ||
      typeof snapshot.pooled !== 'boolean' || !Number.isSafeInteger(snapshot.priceCentsUSD) || snapshot.priceCentsUSD <= 0 ||
      !snapshot.limits || Object.keys(snapshot.limits).length !== USAGE_RESOURCES.length ||
      USAGE_RESOURCES.some(key => !Number.isSafeInteger(snapshot.limits[key]) || snapshot.limits[key] < 0) ||
      (snapshot.kind === 'subscription'
        ? !['MONTHLY','ANNUAL'].includes(snapshot.cycle!) ||
          snapshot.allocations !== (snapshot.cycle === 'ANNUAL' ? 12 : 1) || snapshot.validityDays !== null
        : snapshot.cycle !== null || snapshot.allocations !== 1 || snapshot.validityDays !== 30)) {
    throw new Error('Invalid purchased-benefit snapshot.');
  }
}

/** Calendar boundaries are anchored to the purchase, not the previous boundary.
 * Jan 31 -> Feb 28 -> Mar 31; never create a thirteenth annual allocation.
 */
export function allocationBoundary(start: number, index: number): number {
  if (!Number.isFinite(start) || !Number.isInteger(index) || index < 0 || index > 12) throw new Error('Invalid allocation boundary.');
  const date = new Date(start);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid purchase date.');
  const year = date.getUTCFullYear(), month = date.getUTCMonth() + index;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(date.getUTCDate(), last),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds());
}
export function purchaseAllocation(snapshot: PricingPurchaseSnapshot, start: number, now: number) {
  validatePurchaseSnapshot(snapshot);
  if (!Number.isFinite(now) || !Number.isFinite(start)) throw new Error('Invalid allocation time.');
  const expiresAt = snapshot.kind === 'pack' || snapshot.cycle === 'MONTHLY'
    ? start + 30 * 86_400_000 : allocationBoundary(start, 12);
  if (now < start || now >= expiresAt) return null;
  let index = 0;
  if (snapshot.allocations === 12) while (index < 11 && now >= allocationBoundary(start, index + 1)) index++;
  return { index, startsAt: index ? allocationBoundary(start, index) : start,
    endsAt: snapshot.allocations === 12 ? allocationBoundary(start, index + 1) : expiresAt,
    expiresAt, limits: { ...snapshot.limits } };
}

/** A note includes its transcript; do not charge it as a second text request. */
export function usageDebit(
  kind: 'text' | 'voiceNote' | 'voice' | 'avatar' | 'call' | 'search',
  amount: number,
): Partial<UsageLimits> {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Usage must be a positive integer.');
  switch (kind) {
    case 'text': return { textRequests: 1, textCharacters: amount };
    case 'voiceNote': return { translationUnits: amount };
    case 'voice': return { voiceSeconds: amount };
    case 'avatar': return { avatarSeconds: amount };
    case 'call': return { callSeconds: amount };
    case 'search': return { searchQueries: amount };
    default: throw new Error('Unknown usage kind.');
  }
}

export interface TranslationCostSchedule {
  version: string;
  /** Micro-USD per provider billing unit. A schedule must match the actual route. */
  rates: Record<string, number>;
}
export function measuredTranslationUnits(schedule: TranslationCostSchedule, measuredUnits: Record<string, number>): number {
  if (!schedule.version || !Object.keys(measuredUnits).length) throw new Error('A versioned route and measured provider usage are required.');
  let total = 0;
  for (const [key, count] of Object.entries(measuredUnits)) {
    const rate = schedule.rates[key];
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(count) || count < 0) {
      throw new Error('Unknown or invalid provider billing unit.');
    }
    total += rate * count;
  }
  if (!Number.isSafeInteger(Math.ceil(total)) || total <= 0) throw new Error('Invalid route cost.');
  return Math.ceil(total);
}

export const PRICING_RELEASE_REQUIREMENTS = [
  'verifiedVoiceCost', 'monthlyAllocations', 'allPaymentRails', 'textRequestAndCharacterCaps',
  'measuredTranslationRoutes', 'searchQueryMetering', 'storageQuotaEnforcement', 'pooledBusinessUsage',
] as const;
export type PricingReleaseRequirement = typeof PRICING_RELEASE_REQUIREMENTS[number];
export function pricingReleaseBlockers(evidence: Partial<Record<PricingReleaseRequirement, boolean>>) {
  return PRICING_RELEASE_REQUIREMENTS.filter(key => evidence[key] !== true);
}

/** This is a cost estimate, not a ledger balance or a profit guarantee. */
export function estimatePlanContribution(plan: BalancedPlan) {
  const q = plan.limits;
  const supplierCost = plan.family === 'malvi'
    ? q.voiceSeconds / 60 * .03 + q.avatarSeconds / 60 * .16 + q.searchQueries * .014
    : q.callSeconds / 60 * .00798 + q.translationUnits / 1_000_000 +
      q.textRequests * (89.95 / 20_000) + q.storageBytes / GB * .0213;
  const bufferedMonthlyCost = supplierCost * 1.15;
  return {
    bufferedMonthlyCost,
    monthlyContributionPercent: (1 - .0195 - bufferedMonthlyCost / (plan.monthlyCents / 100)) * 100,
    annualContributionPercent: (1 - .0195 - 12 * bufferedMonthlyCost / (plan.annualCents / 100)) * 100,
  };
}
