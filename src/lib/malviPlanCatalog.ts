import type { MalviSubscriptionPlan, MalviSubscriptionTier } from '../types/billing';

export type MalviPlanStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type MalviCatalogPlan = Omit<MalviSubscriptionPlan, 'priceMonthlyGHS' | 'priceAnnualGHS' | 'isActive' | 'catalogVersion' | 'currencyConversion'> & {
  status: MalviPlanStatus;
  voiceInteractionMinutesLimit: number;
};
export interface MalviCatalogSnapshot {
  version: number;
  plans: MalviCatalogPlan[];
  savedAt: string | null;
  savedBy: string | null;
  reason: string | null;
}
export interface MalviCatalogResponse {
  success: true;
  snapshot: MalviCatalogSnapshot;
  history: MalviCatalogSnapshot[];
  canEdit: boolean;
  storageAvailable: boolean;
  storageWarning: string | null;
}
export const MALVI_CATALOG_TIERS: MalviSubscriptionTier[] = [
  'free', 'malvi_voice', 'malvi_basic', 'malvi_premium', 'malvi_business',
];
// Customer voice delivery now has a separate, metered no-avatar route.
// The server still verifies runtime database setup before first publication.
export const MALVI_VOICE_PLAN_PUBLISHABLE = true;

export class MalviCatalogError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const bad = (message: string): never => { throw new MalviCatalogError(400, 'PLAN_INPUT_INVALID', message); };

/** USD prices are authoritative. GHS is derived server-side, never a second editable price. */
export function initialMalviCatalog(legacy: MalviSubscriptionPlan[]): MalviCatalogSnapshot {
  const plans: MalviCatalogPlan[] = legacy.map(({ priceMonthlyGHS, priceAnnualGHS, isActive, catalogVersion, currencyConversion, ...plan }) => ({
    ...plan, features: [...plan.features], unavailableFeatures: [...(plan.unavailableFeatures ?? [])],
    status: 'PUBLISHED', voiceInteractionMinutesLimit: plan.voiceInteractionMinutesLimit ?? plan.videoInteractionMinutesLimit,
  }));
  plans.splice(1, 0, {
    id: 'malvi_voice', tier: 'malvi_voice', name: 'Malvi Voice', tagline: 'Voice-only companion',
    description: 'A separate voice-only plan. Set its price and allowance before publishing.',
    priceMonthlyUSD: 0, priceAnnualUSD: 0, videoInteractionMinutesLimit: 0, voiceInteractionMinutesLimit: 0,
    voiceCapabilities: 'Voice conversations with Malvi', langpretationCapabilities: 'Set the included translation features',
    aiInteractionCapabilities: 'Set the included assistance features', avatarInteractive: false, businessCollaboration: false,
    features: ['Voice conversations with Malvi'], unavailableFeatures: ['Live video avatar'], status: 'DRAFT',
  });
  return { version: 0, plans, savedAt: null, savedBy: null, reason: null };
}

export function validateMalviPlans(input: unknown): MalviCatalogPlan[] {
  if (!Array.isArray(input) || input.length !== MALVI_CATALOG_TIERS.length) bad('Keep all five plan records. Archive a paid plan instead of deleting its identity.');
  const ids = new Set<string>(), tiers = new Set<string>();
  const fields = new Set([
    'id','tier','name','tagline','description','priceMonthlyUSD','priceAnnualUSD',
    'videoInteractionMinutesLimit','voiceInteractionMinutesLimit','voiceCapabilities',
    'langpretationCapabilities','aiInteractionCapabilities','avatarInteractive',
    'businessCollaboration','features','unavailableFeatures','isPopular','status',
  ]);
  const text = (value: unknown, label: string, max: number) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) bad(`${label} is required (maximum ${max} characters).`);
    return (value as string).trim();
  };
  const list = (value: unknown, label: string) => {
    if (!Array.isArray(value) || value.length > 60 || value.some(v => typeof v !== 'string')) bad(`${label} must be a list of text lines.`);
    const lines = (value as string[]).map(v => v.trim()).filter(Boolean);
    if (lines.length > 30) bad(`${label} must have at most 30 nonempty lines.`);
    return lines.map(item => text(item, label, 300));
  };
  const plans = (input as any[]).map(p => {
    if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some(k => !fields.has(k))) bad('Unexpected plan fields were supplied.');
    if (!MALVI_CATALOG_TIERS.includes(p.tier) || tiers.has(p.tier) ||
        p.id !== (p.tier === 'free' ? 'malvi_free' : p.tier) || ids.has(p.id)) bad('Plan identities must be unique and cannot be renamed.');
    tiers.add(p.tier); ids.add(p.id);
    if (!['DRAFT','PUBLISHED','ARCHIVED'].includes(p.status)) bad('Choose draft, published or archived.');
    for (const key of ['priceMonthlyUSD','priceAnnualUSD']) {
      const v = p[key];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10000 ||
          Math.abs(v * 100 - Math.round(v * 100)) > 0.000001) bad('USD prices must be from 0 to 10,000 with at most two decimal places.');
    }
    for (const key of ['videoInteractionMinutesLimit','voiceInteractionMinutesLimit']) {
      if (!Number.isInteger(p[key]) || p[key] < 0 || p[key] > 1000000) bad('Minute allowances must be whole numbers from 0 to 1,000,000.');
    }
    for (const key of ['avatarInteractive','businessCollaboration']) if (typeof p[key] !== 'boolean') bad('Capability flags must be true or false.');
    if (p.isPopular !== undefined && typeof p.isPopular !== 'boolean') bad('Popular must be true or false.');
    if (!p.avatarInteractive && p.videoInteractionMinutesLimit !== 0) bad('A plan without an avatar must have zero video minutes.');
    if (p.tier === 'free' && (p.status !== 'PUBLISHED' || p.priceMonthlyUSD !== 0 || p.priceAnnualUSD !== 0)) bad('Keep the Free plan published with zero prices.');
    if (p.tier === 'malvi_voice' && (p.avatarInteractive || p.videoInteractionMinutesLimit !== 0 || p.businessCollaboration)) bad('The Voice plan must remain voice-only, without avatar or business collaboration.');
    if (p.status === 'PUBLISHED' && p.tier !== 'free' && (p.priceMonthlyUSD <= 0 || p.priceAnnualUSD <= 0)) bad('A published paid plan needs positive monthly and annual USD prices.');
    if (p.status === 'PUBLISHED' && p.tier === 'malvi_voice' && p.voiceInteractionMinutesLimit <= 0) bad('Set a positive Voice allowance before publishing.');
    if (p.status === 'PUBLISHED' && p.tier === 'malvi_voice' && !MALVI_VOICE_PLAN_PUBLISHABLE) bad('Voice is a draft only: voice-only session delivery and usage enforcement must be completed before it can be sold.');
    return {
      ...p, name: text(p.name, 'Plan name', 80), tagline: text(p.tagline, 'Tagline', 160),
      description: text(p.description, 'Description', 1500),
      voiceCapabilities: text(p.voiceCapabilities, 'Voice description', 300),
      langpretationCapabilities: text(p.langpretationCapabilities, 'Translation description', 300),
      aiInteractionCapabilities: text(p.aiInteractionCapabilities, 'AI description', 300),
      features: list(p.features, 'Included features'), unavailableFeatures: list(p.unavailableFeatures ?? [], 'Excluded features'),
    } as MalviCatalogPlan;
  });
  return plans;
}
