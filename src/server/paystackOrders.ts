type PricedPlan = {
  id: string; tier: string; name: string; isActive?: boolean;
  priceMonthlyGHS: number; priceMonthlyUSD: number;
  priceAnnualGHS: number; priceAnnualUSD: number;
  includedLangpretationMinutes?: number; includedVoiceMinutes?: number; includedMalviRequests?: number;
  videoInteractionMinutesLimit?: number;
  voiceInteractionMinutesLimit?: number;
  catalogVersion?: number;
};
type MinutePack = { id: string; minutes: number; priceGHS: number; priceUSD: number; validityDays?: number };
type Catalog = { subscriptionPlans: PricedPlan[]; malviPlans: PricedPlan[]; communicationMinutePackages: MinutePack[] };

export function quotePaystackOrder(input: Record<string, any>, catalog: Catalog) {
  const purpose = input.purpose ?? 'COMMUNICATION_TOPUP';
  const currency = String(input.currency ?? 'GHS').toUpperCase();
  const billingCycle = input.billingCycle ?? 'MONTHLY';
  if (!['MONTHLY', 'ANNUAL'].includes(billingCycle)) throw new Error('Unsupported billing cycle.');
  if (!['GHS', 'USD', 'NGN', 'ZAR', 'KES'].includes(currency)) throw new Error('Unsupported payment currency.');
  let amount: number;
  let product: Record<string, any> | undefined;
  let packageId: string | undefined;
  let planTier: string | undefined;
  if (purpose === 'COMMUNICATION_TOPUP') {
    amount = Number(input.amount);
  } else {
    if (!['GHS', 'USD'].includes(currency)) throw new Error('This product is priced in GHS or USD.');
    if (purpose === 'COMMUNICATION_MINUTES') {
      const pack = catalog.communicationMinutePackages.find(p => p.id === input.packageId);
      if (!pack || !Number.isFinite(pack.minutes) || pack.minutes <= 0) throw new Error('Minute package is not available.');
      amount = currency === 'USD' ? pack.priceUSD : pack.priceGHS;
      packageId = pack.id;
      if (input.minutes != null && Number(input.minutes) !== pack.minutes) throw new Error('Minute count does not match the selected package.');
      product = { id: pack.id, minutes: pack.minutes, validityDays: pack.validityDays ?? 30 };
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
        ...(purpose === 'MALVI_SUBSCRIPTION' ? {
          voiceMinutesAllowed: plan.voiceInteractionMinutesLimit ?? plan.videoInteractionMinutesLimit ?? 0,
          catalogVersion: plan.catalogVersion,
          planSnapshot: { ...plan },
        } : {}),
      };
    } else throw new Error('Unsupported Paystack payment purpose.');
    if (input.amount != null && Number(input.amount) !== amount) throw new Error('Price changed or checkout amount does not match the configured product.');
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000
    || !Number.isSafeInteger(Math.round(amount * 100))
    || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    throw new Error('A positive payment amount with at most two decimal places is required.');
  }
  return { purpose, currency, billingCycle, amount, packageId, planTier, minutes: product?.minutes, product };
}

export function validateVerifiedOrder(order: any, userId: string, amount: number, currency: string) {
  if (!order || order.userId !== userId) throw new Error('No authoritative Paystack order exists for this account/reference.');
  if (!Number.isFinite(amount) || amount <= 0 || Math.round(order.amount * 100) !== Math.round(amount * 100)) {
    throw new Error('Verified Paystack amount does not match the Nanivio order.');
  }
  if (order.currency !== currency.toUpperCase()) throw new Error('Verified Paystack currency does not match the Nanivio order.');
}
