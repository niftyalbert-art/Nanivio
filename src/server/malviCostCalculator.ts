import { Router } from 'express';
import {
  calculateMalviCosts, defaultMalviCostSnapshot, MalviCostValidationError,
  validateMalviCostInputs, type MalviCostSnapshot, type MalviFxQuote,
} from '../lib/malviBillingCalculator';
import { billingAdminActor } from './billingAccess';
import { getAssistantStore } from './assistant/redisStore';

interface CostStore {
  getBillingCostDocument(): Promise<string | null>;
  compareAndSetBillingCostDocument(version: number, document: string): Promise<boolean>;
}
type StoreProvider = () => Promise<CostStore>;
interface CostDocument {
  schemaVersion: 1;
  snapshot: MalviCostSnapshot;
  history: MalviCostSnapshot[];
}

export class CostSettingsError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

function validateSnapshot(s: MalviCostSnapshot) {
  if (!s || !Number.isSafeInteger(s.version) || s.version < 1 ||
      typeof s.savedBy !== 'string' || !s.savedBy ||
      typeof s.savedAt !== 'string' || !Number.isFinite(Date.parse(s.savedAt)) ||
      typeof s.reason !== 'string' || s.reason.trim().length < 8 || s.reason.length > 500) {
    throw new Error('Invalid stored calculator snapshot.');
  }
  calculateMalviCosts(s.rates, s.scenario);
}

export async function readMalviCostModel(provider: StoreProvider = getAssistantStore) {
  let raw: string | null;
  try {
    raw = await (await provider()).getBillingCostDocument();
  } catch {
    return {
      snapshot: defaultMalviCostSnapshot(), history: [] as MalviCostSnapshot[],
      storageAvailable: false,
      storageWarning: 'Shared Redis storage is unavailable. You can calculate locally, but changes cannot be saved. Configure a persistent Redis service for shared settings.',
    };
  }
  if (!raw) return {
    snapshot: defaultMalviCostSnapshot(), history: [] as MalviCostSnapshot[],
    storageAvailable: true, storageWarning: null,
  };
  try {
    const doc: CostDocument = JSON.parse(raw);
    if (doc.schemaVersion !== 1 || !Array.isArray(doc.history) || doc.history.length > 20) throw new Error();
    validateSnapshot(doc.snapshot);
    doc.history.forEach(validateSnapshot);
    return { snapshot: doc.snapshot, history: doc.history, storageAvailable: true, storageWarning: null };
  } catch {
    throw new CostSettingsError(503, 'COST_MODEL_INVALID', 'Saved calculator settings could not be validated. They have not been replaced. An administrator must review shared storage.');
  }
}

export async function writeMalviCostModel(
  body: unknown, actorId: string, provider: StoreProvider = getAssistantStore, now = new Date(),
) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['rates', 'scenario', 'expectedVersion', 'reason'].includes(key))) {
    throw new MalviCostValidationError('Supply calculator rates, assumptions, expected version and a change reason only.');
  }
  const { rates, scenario, expectedVersion, reason } = body as Record<string, any>;
  validateMalviCostInputs(rates, scenario);
  calculateMalviCosts(rates, scenario);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= 1000000000) {
    throw new MalviCostValidationError('A valid saved version is required.');
  }
  if (typeof reason !== 'string' || reason.trim().length < 8 || reason.trim().length > 500) {
    throw new MalviCostValidationError('Enter a change reason between 8 and 500 characters.');
  }
  if (!actorId) throw new CostSettingsError(403, 'COST_ACTOR_REQUIRED', 'A verified administrator is required.');
  const previous = await readMalviCostModel(provider);
  if (!previous.storageAvailable) {
    throw new CostSettingsError(503, 'COST_STORAGE_UNAVAILABLE', 'Shared calculator storage is unavailable. No changes were saved.');
  }
  if (previous.snapshot.version !== expectedVersion) {
    throw new CostSettingsError(409, 'COST_VERSION_CONFLICT', 'Another administrator changed these settings. Reload the saved model before saving again.');
  }
  const snapshot: MalviCostSnapshot = {
    version: expectedVersion + 1, rates, scenario,
    savedAt: now.toISOString(), savedBy: actorId, reason: reason.trim(),
  };
  const history = (previous.snapshot.version > 0
    ? [previous.snapshot, ...previous.history] : previous.history).slice(0, 20);
  let saved: boolean;
  try {
    saved = await (await provider()).compareAndSetBillingCostDocument(expectedVersion,
      JSON.stringify({ schemaVersion: 1, snapshot, history } satisfies CostDocument));
  } catch {
    throw new CostSettingsError(503, 'COST_STORAGE_UNAVAILABLE', 'Shared calculator storage is unavailable. A save could not be confirmed; reload before retrying.');
  }
  if (!saved) throw new CostSettingsError(409, 'COST_VERSION_CONFLICT', 'Another administrator saved first. Reload the saved model before retrying.');
  return { snapshot, history, storageAvailable: true, storageWarning: null };
}

/** Fixed public endpoint. No user-supplied URLs, credentials or paid provider calls. */
export function createPublicFxLoader(fetcher: typeof fetch = fetch, clock = Date.now) {
  let cached: { quote: MalviFxQuote; fetchedAt: number } | null = null;
  let pending: Promise<MalviFxQuote> | null = null;
  return async function loadFx(): Promise<MalviFxQuote> {
    const now = clock();
    if (cached && now - cached.fetchedAt < 3600000 && now < Date.parse(cached.quote.expiresAt)) return cached.quote;
    if (pending) return pending;
    pending = (async () => {
      const response = await fetcher('https://open.er-api.com/v6/latest/USD', {
        signal: AbortSignal.timeout(4000), redirect: 'error',
      });
      if (!response.ok) throw new Error('FX unavailable');
      const j = await response.json();
      const rate = j.rates?.GHS;
      const asOf = j.time_last_update_unix * 1000;
      const next = j.time_next_update_unix * 1000;
      if (j.result !== 'success' || j.base_code !== 'USD' ||
          typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || rate > 1000000 ||
          !Number.isSafeInteger(asOf) || !Number.isSafeInteger(next) ||
          asOf > now + 300000 || now - asOf > 172800000 ||
          next <= asOf || next - asOf > 172800000) throw new Error('Invalid FX');
      const expires = Math.min(next + 21600000, asOf + 172800000);
      if (expires <= now) throw new Error('Expired FX');
      const quote: MalviFxQuote = {
        rate, asOf: new Date(asOf).toISOString(), expiresAt: new Date(expires).toISOString(),
        source: 'ExchangeRate-API Open Access (daily reference rate)',
        attributionUrl: 'https://www.exchangerate-api.com',
      };
      cached = { quote, fetchedAt: clock() };
      return quote;
    })();
    try { return await pending; } finally { pending = null; }
  };
}

export const publicFx = createPublicFxLoader();

export function createMalviCostRouter(
  provider: StoreProvider = getAssistantStore, loadFx: () => Promise<MalviFxQuote> = publicFx,
) {
  const router = Router();
  async function fxInfo() {
    try { return { fx: await loadFx(), fxWarning: null }; }
    catch { return { fx: null, fxWarning: 'Automatic GHS conversion is unavailable or stale. USD estimates remain available; no substitute exchange rate was used.' }; }
  }
  function reportError(res: import('express').Response, error: unknown) {
    if (error instanceof MalviCostValidationError) {
      return res.status(400).json({ success: false, code: 'COST_INPUT_INVALID', error: error.message });
    }
    if (error instanceof CostSettingsError) {
      return res.status(error.status).json({ success: false, code: error.code, error: error.message });
    }
    return res.status(500).json({ success: false, code: 'COST_CALCULATOR_ERROR', error: 'The calculator request could not be completed.' });
  }
  router.get('/', async (req, res) => {
    try {
      const actor = billingAdminActor(req);
      const [model, fx] = await Promise.all([readMalviCostModel(provider), fxInfo()]);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, ...model, ...fx,
        canEdit: ['SUPER_ADMIN', 'FINANCE_ADMIN'].includes(actor.adminRole) });
    } catch (error) { reportError(res, error); }
  });
  router.post('/save', async (req, res) => {
    try {
      const actor = billingAdminActor(req);
      // Defence in depth in addition to the namespace's role guard.
      if (!['SUPER_ADMIN', 'FINANCE_ADMIN'].includes(actor.adminRole)) {
        throw new CostSettingsError(403, 'BILLING_FORBIDDEN', 'Only finance or super administrators can save cost settings.');
      }
      const model = await writeMalviCostModel(req.body, actor.adminUser, provider);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, ...model, ...await fxInfo(), canEdit: true });
    } catch (error) { reportError(res, error); }
  });
  return router;
}
