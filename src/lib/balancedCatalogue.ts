import {
  BALANCED_PLANS, BALANCED_PACKS, SUBSCRIPTION_PRICING_VERSION,
  pricingPurchaseSnapshot, TRANSLATION_UNITS_PER_MINUTE,
} from './subscriptionPricing.ts';

/**
 * A one-way catalogue cutover. Existing entitlement rows are not catalogue
 * records and must never be passed here. Administrative edits made AFTER the
 * cutover are retained; pre-cutover prices are not mixed with the new offers.
 */
export function balancedCommunicationPlans(plans: any[], policy: any = {}) {
  return plans.map(template => {
    if (template.tier === 'free') return { ...template, features: [...template.features] };
    const approved = BALANCED_PLANS.find(p => p.family === 'communication' && p.tier === template.tier);
    if (!approved) return null;
    const saved = policy.pricingVersion === SUBSCRIPTION_PRICING_VERSION
      ? policy.plans?.find((p: any) => p.id === template.id) : null;
    const limits = approved.limits;
    const plan = {
      ...template, name: approved.name,
      priceMonthlyUSD: saved?.priceMonthlyUSD ?? approved.monthlyCents / 100,
      priceAnnualUSD: saved?.priceAnnualUSD ?? approved.annualCents / 100,
      includedVoiceMinutes: saved?.includedVoiceMinutes ?? limits.callSeconds / 60,
      includedLangpretationMinutes: saved?.includedLangpretationMinutes ?? limits.translationUnits / TRANSLATION_UNITS_PER_MINUTE,
      includedStorageGB: limits.storageBytes / 1e9, groupCallLimit: 2,
      includedTextTranslations: limits.textRequests, includedTextCharacters: limits.textCharacters,
      pricingVersion: SUBSCRIPTION_PRICING_VERSION,
      description: 'Prepaid communication subscription. Annual purchases include twelve monthly allocations.',
    };
    const billingTerms = pricingPurchaseSnapshot(approved.id);
    billingTerms.priceCentsUSD = Math.round(plan.priceMonthlyUSD * 100);
    billingTerms.limits.callSeconds = plan.includedVoiceMinutes * 60;
    billingTerms.limits.translationUnits = plan.includedLangpretationMinutes * TRANSLATION_UNITS_PER_MINUTE;
    return { ...plan, billingTerms, features: [
      `${plan.includedVoiceMinutes.toLocaleString('en-US')} ordinary audio/HD video minutes per month`,
      `${plan.includedLangpretationMinutes} included Langpretation minutes per month`,
      `${plan.includedTextTranslations.toLocaleString('en-US')} text translations / ${plan.includedTextCharacters.toLocaleString('en-US')} source characters per month`,
      `${plan.includedStorageGB} GB storage${approved.pooled ? ' shared across the workspace' : ''}`,
      'Receiving ordinary calls is free', 'Annual payment includes twelve monthly allowance allocations',
    ] };
  }).filter(Boolean);
}

export function balancedMalviPlans(plans: any[], alreadyCurrent = false) {
  return plans.map(template => {
    if (template.tier === 'free') return { ...template };
    const approved = BALANCED_PLANS.find(p => p.family === 'malvi' && p.tier === template.tier);
    if (!approved) return null;
    const voice = alreadyCurrent ? template.voiceInteractionMinutesLimit : approved.limits.voiceSeconds / 60;
    const avatar = alreadyCurrent ? template.videoInteractionMinutesLimit : approved.limits.avatarSeconds / 60;
    const billingTerms = pricingPurchaseSnapshot(approved.id);
    const monthly = alreadyCurrent ? template.priceMonthlyUSD : approved.monthlyCents / 100;
    billingTerms.priceCentsUSD = Math.round(monthly * 100);
    billingTerms.limits.voiceSeconds = voice * 60;
    billingTerms.limits.avatarSeconds = avatar * 60;
    return {
      ...template, name: approved.name, priceMonthlyUSD: monthly,
      priceAnnualUSD: alreadyCurrent ? template.priceAnnualUSD : approved.annualCents / 100,
      voiceInteractionMinutesLimit: voice, videoInteractionMinutesLimit: avatar,
      // Voice is now a configured paid offer, not the former zero-price draft.
      status: template.status === 'ARCHIVED' ? 'ARCHIVED' : alreadyCurrent ? template.status : 'PUBLISHED',
      billingTerms, pricingVersion: SUBSCRIPTION_PRICING_VERSION,
      features: [
        ...template.features.filter((text: string) => !/\bminutes?\b/i.test(text)),
        `${voice} separate voice-only minutes per month`,
        ...(avatar ? [`${avatar} separate live avatar minutes per month`] : []),
        'Annual payment includes twelve monthly allowance allocations',
        ...(approved.pooled ? ['Usage is pooled across the workspace, not multiplied per seat'] : []),
      ],
    };
  }).filter(Boolean);
}

export function balancedPacks(rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('A current USD/GHS quote is required.');
  return BALANCED_PACKS.map(pack => {
    const resource = Object.entries(pack.limits).find(([, amount]) => amount > 0)![0];
    const minutes = resource === 'callSeconds' || resource === 'voiceSeconds' || resource === 'avatarSeconds'
      ? pack.limits[resource] / 60 : resource === 'translationUnits'
        ? pack.limits.translationUnits / TRANSLATION_UNITS_PER_MINUTE : pack.limits.textRequests;
    return {
      id: pack.id, name: pack.name, minutes, priceUSD: pack.priceCents / 100,
      priceGHS: Math.round(pack.priceCents * rate) / 100,
      validityDays: 30, resource, unitLabel: resource === 'textRequests' ? 'translations' : 'minutes',
      description: pack.name, features: [pack.name, 'Valid for 30 days', 'Adds only the named resource; does not replace your subscription',
        ...(pack.limits.callSeconds ? ['For calling after your free calling trial ends'] : []),
        ...(pack.limits.voiceSeconds || pack.limits.avatarSeconds ? ['Requires an active paid Malvi plan with the matching feature'] : [])],
      billingTerms: pricingPurchaseSnapshot(pack.id), pricingVersion: SUBSCRIPTION_PRICING_VERSION,
    };
  });
}
