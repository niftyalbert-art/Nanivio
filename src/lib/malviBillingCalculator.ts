/** Planning only. Never import this estimate into purchase fulfilment or entitlements. */
export const COST_REVIEW_DATE = '2026-10-24';
export const COST_SOURCES = [
  { name: 'Gemini', url: 'https://ai.google.dev/gemini-api/docs/pricing' },
  { name: 'LiveAvatar', url: 'https://www.liveavatar.com/pricing' },
  { name: 'ElevenLabs', url: 'https://elevenlabs.io/pricing/api' },
  { name: 'OpenAI', url: 'https://openai.com/api/pricing/' },
  { name: 'Render', url: 'https://render.com/pricing' },
  { name: 'Supabase', url: 'https://supabase.com/pricing' },
  { name: 'Paystack', url: 'https://support.paystack.com/en/articles/2130306' },
];

export interface MalviCostRates {
  geminiAudioInput: number;
  geminiAudioOutput: number;
  geminiTextInput: number;
  geminiTextOutput: number;
  geminiVisionInput: number;
  flashInput: number;
  flashOutput: number;
  search: number;
  elevenlabs: number;
  openai: number;
  avatarMonthly: number;
  avatarIncludedMinutes: number;
  avatarOverage: number;
  renderMonthly: number;
  redisMonthly: number;
  supabaseMonthly: number;
  otherMonthly: number;
}

export interface MalviCostScenario {
  brain: 'gemini' | 'openai';
  voice: 'gemini' | 'elevenlabs';
  customers: number;
  sessionMinutes: number;
  audioInputMinutes: number;
  audioOutputMinutes: number;
  liveTextInputTokens: number;
  liveTextOutputTokens: number;
  visionInputTokens: number;
  analysisInputTokens: number;
  analysisOutputTokens: number;
  searchQueries: number;
  speechCharacters: number;
  avatarMinutes: number;
  processingPercent: number;
  processingFixed: number;
  bufferPercent: number;
  marginPercent: number;
  testPriceUsd: number;
}

export interface MalviCostSnapshot {
  version: number;
  rates: MalviCostRates;
  scenario: MalviCostScenario;
  savedAt: string | null;
  savedBy: string | null;
  reason: string | null;
}

export interface MalviFxQuote {
  rate: number;
  asOf: string;
  expiresAt: string;
  source: string;
  attributionUrl: string;
}

export interface MalviCostResponse {
  success: true;
  snapshot: MalviCostSnapshot;
  history: MalviCostSnapshot[];
  canEdit: boolean;
  storageAvailable: boolean;
  storageWarning: string | null;
  fx: MalviFxQuote | null;
  fxWarning: string | null;
}

type NumericField<K extends string> = {
  key: K; label: string; unit: string; group: string; max: number; integer?: boolean;
};

export const MALVI_RATE_FIELDS: NumericField<keyof MalviCostRates>[] = [
  { key: 'geminiAudioInput', label: 'Gemini audio input', unit: 'USD / audio minute', group: 'Voice and reasoning', max: 100 },
  { key: 'geminiAudioOutput', label: 'Gemini audio output', unit: 'USD / audio minute', group: 'Voice and reasoning', max: 100 },
  { key: 'geminiTextInput', label: 'Gemini live text input', unit: 'USD / million tokens', group: 'Voice and reasoning', max: 10000 },
  { key: 'geminiTextOutput', label: 'Gemini live text output', unit: 'USD / million tokens', group: 'Voice and reasoning', max: 10000 },
  { key: 'geminiVisionInput', label: 'Gemini live vision input', unit: 'USD / million tokens', group: 'Voice and reasoning', max: 10000 },
  { key: 'elevenlabs', label: 'ElevenLabs Multilingual v2', unit: 'USD / 1,000 characters', group: 'Voice and reasoning', max: 1000 },
  { key: 'openai', label: 'OpenAI GPT-Live-1', unit: 'USD / session minute', group: 'Voice and reasoning', max: 100 },
  { key: 'flashInput', label: 'Flash analysis input', unit: 'USD / million tokens', group: 'Files and research', max: 10000 },
  { key: 'flashOutput', label: 'Flash analysis output', unit: 'USD / million tokens', group: 'Files and research', max: 10000 },
  { key: 'search', label: 'Google Search grounding', unit: 'USD / 1,000 billable queries', group: 'Files and research', max: 10000 },
  { key: 'avatarMonthly', label: 'Avatar subscription', unit: 'USD / month, shared fleet', group: 'LiveAvatar LITE', max: 1000000 },
  { key: 'avatarIncludedMinutes', label: 'Included LITE minutes', unit: 'minutes / month, shared fleet', group: 'LiveAvatar LITE', max: 100000000, integer: true },
  { key: 'avatarOverage', label: 'Avatar overage', unit: 'USD / additional minute', group: 'LiveAvatar LITE', max: 100 },
  { key: 'renderMonthly', label: 'Render web service', unit: 'USD / month, shared fleet', group: 'Infrastructure', max: 1000000 },
  { key: 'redisMonthly', label: 'Redis / Key Value', unit: 'USD / month, shared fleet', group: 'Infrastructure', max: 1000000 },
  { key: 'supabaseMonthly', label: 'Supabase', unit: 'USD / month, shared fleet', group: 'Infrastructure', max: 1000000 },
  { key: 'otherMonthly', label: 'Other monthly overhead', unit: 'USD / month, shared fleet', group: 'Infrastructure', max: 1000000 },
];

export const MALVI_SCENARIO_FIELDS: NumericField<Exclude<keyof MalviCostScenario, 'brain' | 'voice'>>[] = [
  { key: 'customers', label: 'Paying customers in this model', unit: 'customers sharing the monthly costs', group: 'Monthly usage', max: 1000000, integer: true },
  { key: 'sessionMinutes', label: 'Live session time', unit: 'minutes / customer / month', group: 'Monthly usage', max: 1000000 },
  { key: 'audioInputMinutes', label: 'Input audio sent to Gemini', unit: 'audio minutes / customer / month', group: 'Monthly usage', max: 1000000 },
  { key: 'audioOutputMinutes', label: 'Gemini generated audio', unit: 'audio minutes / customer / month', group: 'Monthly usage', max: 1000000 },
  { key: 'liveTextInputTokens', label: 'Live text and history input', unit: 'tokens / customer / month', group: 'Monthly usage', max: 1000000000, integer: true },
  { key: 'liveTextOutputTokens', label: 'Live text output', unit: 'tokens / customer / month', group: 'Monthly usage', max: 1000000000, integer: true },
  { key: 'visionInputTokens', label: 'Live vision input', unit: 'tokens / customer / month', group: 'Monthly usage', max: 1000000000, integer: true },
  { key: 'analysisInputTokens', label: 'Files / research model input', unit: 'tokens / customer / month', group: 'Monthly usage', max: 1000000000, integer: true },
  { key: 'analysisOutputTokens', label: 'Files / research model output', unit: 'tokens / customer / month', group: 'Monthly usage', max: 1000000000, integer: true },
  { key: 'searchQueries', label: 'Billable search queries', unit: 'queries / customer / month', group: 'Monthly usage', max: 1000000, integer: true },
  { key: 'speechCharacters', label: 'ElevenLabs speech text', unit: 'characters / customer / month', group: 'Monthly usage', max: 1000000000, integer: true },
  { key: 'avatarMinutes', label: 'Avatar elapsed session time', unit: 'minutes / customer / month; 0 = voice only', group: 'Monthly usage', max: 1000000 },
  { key: 'processingPercent', label: 'Payment processing', unit: '% of selling price', group: 'Pricing assumptions', max: 99 },
  { key: 'processingFixed', label: 'Fixed payment fee', unit: 'USD / customer / month', group: 'Pricing assumptions', max: 1000000 },
  { key: 'bufferPercent', label: 'Cost contingency', unit: '% added to estimated provider and infrastructure costs', group: 'Pricing assumptions', max: 1000 },
  { key: 'marginPercent', label: 'Target gross margin', unit: '% of revenue after estimated costs and payment fees', group: 'Pricing assumptions', max: 99 },
  { key: 'testPriceUsd', label: 'Test selling price', unit: 'USD / customer / month; does not publish a plan', group: 'Pricing assumptions', max: 1000000 },
];

export function defaultMalviCostSnapshot(now = new Date()): MalviCostSnapshot {
  const flashPromo = now < new Date('2027-01-01T00:00:00Z');
  return {
    version: 0, savedAt: null, savedBy: null, reason: null,
    rates: {
      geminiAudioInput: 0.005, geminiAudioOutput: 0.018,
      geminiTextInput: 0.75, geminiTextOutput: 4.5, geminiVisionInput: 1,
      flashInput: flashPromo ? 0.75 : 1.5, flashOutput: flashPromo ? 3.75 : 7.5,
      search: 14, elevenlabs: 0.08, openai: 0.05,
      avatarMonthly: 99, avatarIncludedMinutes: 1100, avatarOverage: 0.095,
      renderMonthly: 25, redisMonthly: 10, supabaseMonthly: 25, otherMonthly: 0,
    },
    scenario: {
      brain: 'gemini', voice: 'gemini', customers: 100, sessionMinutes: 120,
      audioInputMinutes: 60, audioOutputMinutes: 60,
      liveTextInputTokens: 20000, liveTextOutputTokens: 3000, visionInputTokens: 0,
      analysisInputTokens: 0, analysisOutputTokens: 0, searchQueries: 0,
      speechCharacters: 45000, avatarMinutes: 0, processingPercent: 1.95,
      processingFixed: 0, bufferPercent: 15, marginPercent: 60, testPriceUsd: 5,
    },
  };
}

export class MalviCostValidationError extends Error {}

function validateFields(value: unknown, fields: NumericField<string>[], extras: string[] = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MalviCostValidationError('Rates and usage assumptions must be objects.');
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set([...fields.map(f => f.key), ...extras]);
  if (Object.keys(record).some(key => !allowed.has(key))) {
    throw new MalviCostValidationError('Unexpected calculator fields were supplied.');
  }
  for (const field of fields) {
    const v = record[field.key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > field.max ||
        (field.integer && !Number.isInteger(v))) {
      throw new MalviCostValidationError(`${field.label} must be a valid ${field.integer ? 'whole ' : ''}number from 0 to ${field.max}.`);
    }
  }
}

export function validateMalviCostInputs(rates: unknown, scenario: unknown): asserts rates is MalviCostRates {
  validateFields(rates, MALVI_RATE_FIELDS);
  validateFields(scenario, MALVI_SCENARIO_FIELDS, ['brain', 'voice']);
  const s = scenario as MalviCostScenario;
  if (!['gemini', 'openai'].includes(s.brain) || !['gemini', 'elevenlabs'].includes(s.voice)) {
    throw new MalviCostValidationError('Choose a supported reasoning and voice provider.');
  }
  if (s.brain === 'openai' && s.voice === 'gemini') {
    throw new MalviCostValidationError('Gemini native voice requires the Gemini brain; use ElevenLabs with OpenAI.');
  }
  if (s.customers < 1) throw new MalviCostValidationError('At least one paying customer is required.');
  if (s.avatarMinutes > s.sessionMinutes) throw new MalviCostValidationError('Avatar minutes cannot exceed total live session minutes.');
  if (s.processingPercent + s.marginPercent >= 100) {
    throw new MalviCostValidationError('Target margin plus payment processing must be less than 100%.');
  }
}

export function calculateMalviCosts(r: MalviCostRates, s: MalviCostScenario, ghsPerUsd?: number) {
  validateMalviCostInputs(r, s);
  const gemini = s.brain === 'gemini';
  // Native Gemini audio and ElevenLabs output are alternatives, never both.
  const voice = gemini
    ? s.audioInputMinutes * r.geminiAudioInput +
      (s.voice === 'gemini' ? s.audioOutputMinutes * r.geminiAudioOutput : s.speechCharacters / 1000 * r.elevenlabs)
    : s.sessionMinutes * r.openai + s.speechCharacters / 1000 * r.elevenlabs;
  const context = gemini ? (s.liveTextInputTokens * r.geminiTextInput +
    s.liveTextOutputTokens * r.geminiTextOutput + s.visionInputTokens * r.geminiVisionInput) / 1000000 : 0;
  const analysis = (s.analysisInputTokens * r.flashInput + s.analysisOutputTokens * r.flashOutput) / 1000000;
  // No shared free allowance is promised separately to each subscriber.
  const search = s.searchQueries / 1000 * r.search;
  const fleetAvatarMinutes = s.avatarMinutes * s.customers;
  const avatarOverageMinutes = Math.max(0, fleetAvatarMinutes - r.avatarIncludedMinutes);
  // Fleet subscription + overage, not subscription PLUS an allocated minute cost.
  const avatar = fleetAvatarMinutes > 0 ? r.avatarMonthly + avatarOverageMinutes * r.avatarOverage : 0;
  const infrastructure = r.renderMonthly + r.redisMonthly + r.supabaseMonthly + r.otherMonthly;
  const variable = voice + context + analysis + search;
  const fleetBase = variable * s.customers + avatar + infrastructure;
  const contingency = fleetBase * s.bufferPercent / 100;
  const fleetCost = fleetBase + contingency;
  const costPerCustomer = fleetCost / s.customers;
  const rawPrice = (costPerCustomer + s.processingFixed) / (1 - (s.processingPercent + s.marginPercent) / 100);
  if (!Number.isFinite(rawPrice) || rawPrice > 1000000000 || fleetCost > 1000000000000) {
    throw new MalviCostValidationError('These assumptions exceed the supported estimate range.');
  }
  // Round the required selling price UP, not below the requested margin.
  const suggestedPriceUsd = Math.ceil(rawPrice * 100) / 100;
  const revenue = s.testPriceUsd * s.customers;
  const fees = revenue * s.processingPercent / 100 + s.processingFixed * s.customers;
  const profit = revenue - fees - fleetCost;
  return {
    voice, context, analysis, search, variable, avatar, infrastructure, contingency,
    fleetAvatarMinutes, avatarOverageMinutes, fleetCost, costPerCustomer,
    suggestedPriceUsd,
    suggestedPriceGhs: Number.isFinite(ghsPerUsd) && ghsPerUsd! > 0
      ? Math.round(suggestedPriceUsd * ghsPerUsd! * 100) / 100 : null,
    revenue, fees, profit,
    marginAtTestPrice: revenue > 0 ? profit / revenue * 100 : null,
  };
}

export type MalviCostEstimate = ReturnType<typeof calculateMalviCosts>;
