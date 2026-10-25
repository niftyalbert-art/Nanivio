import { Router } from 'express';
import { billingDb } from './billingDb';
import { getServerSupabase } from './supabaseServer';
import { billingAdminActor } from './billingAccess';
import { publicFx } from './malviCostCalculator';
import {
  initialMalviCatalog, validateMalviPlans, MalviCatalogError,
  type MalviCatalogSnapshot, type MalviCatalogPlan,
} from '../lib/malviPlanCatalog';
import type { MalviFxQuote } from '../lib/malviBillingCalculator';
import type { MalviSubscriptionPlan } from '../types/billing';

interface CatalogDocument { schemaVersion: 1; snapshot: MalviCatalogSnapshot; history: MalviCatalogSnapshot[] }
export interface CatalogRepository {
  read(): Promise<{ version: number; document: CatalogDocument } | null>;
  compareAndSet(version: number, document: CatalogDocument): Promise<boolean>;
}
const setupMessage = 'Apply migrations/012_malvi_plan_catalog.sql in the existing Supabase project before saving plans or accepting new Malvi purchases.';
function databaseError(error: { code?: string } | null): never {
  throw new MalviCatalogError(503, 'PLAN_STORAGE_UNAVAILABLE',
    ['42P01', 'PGRST205'].includes(error?.code ?? '') ? setupMessage : 'The persistent plan catalogue is unavailable. No changes or purchases were accepted.');
}
export function supabaseCatalogRepository(): CatalogRepository {
  const db = () => {
    const client = getServerSupabase();
    if (!client) throw new MalviCatalogError(503, 'PLAN_STORAGE_UNAVAILABLE', setupMessage);
    return client;
  };
  return {
    async read() {
      const { data, error } = await db().from('nanivio_malvi_plan_catalog')
        .select('version,document').eq('catalog_id', 'primary').maybeSingle();
      if (error) databaseError(error);
      return data ? { version: Number(data.version), document: data.document as CatalogDocument } : null;
    },
    async compareAndSet(version, document) {
      const row = { catalog_id: 'primary', version: version + 1, document, updated_at: document.snapshot.savedAt };
      if (version === 0) {
        const { error } = await db().from('nanivio_malvi_plan_catalog').insert(row);
        if (error?.code === '23505') return false;
        if (error) databaseError(error);
        return true;
      }
      const { data, error } = await db().from('nanivio_malvi_plan_catalog')
        .update(row).eq('catalog_id', 'primary').eq('version', version).select('version');
      if (error) databaseError(error);
      return Boolean(data?.length);
    },
  };
}

export function createMalviCatalogService(
  repository: CatalogRepository = supabaseCatalogRepository(),
  legacy: () => MalviSubscriptionPlan[] = () => billingDb.malviPlans,
  loadFx: () => Promise<MalviFxQuote> = publicFx,
) {
  async function read(): Promise<CatalogDocument> {
    const row = await repository.read();
    if (!row) return { schemaVersion: 1, snapshot: initialMalviCatalog(legacy()), history: [] };
    try {
      const doc = row.document;
      if (doc.schemaVersion !== 1 || !Number.isSafeInteger(row.version) || row.version < 1 ||
          doc.snapshot.version !== row.version || !Array.isArray(doc.history) || doc.history.length > 20) throw Error();
      for (const snapshot of [doc.snapshot, ...doc.history]) {
        if (!Number.isSafeInteger(snapshot.version) || snapshot.version < 1 ||
            !snapshot.savedBy || !snapshot.savedAt || !Number.isFinite(Date.parse(snapshot.savedAt)) ||
            typeof snapshot.reason !== 'string' || snapshot.reason.trim().length < 8) throw Error();
        validateMalviPlans(snapshot.plans);
      }
      return doc;
    } catch { throw new MalviCatalogError(503, 'PLAN_CATALOG_INVALID', 'Saved plans could not be validated. They were not replaced with defaults. Contact a billing administrator.'); }
  }
  async function adminRead() {
    try { return { ...await read(), storageAvailable: true, storageWarning: null }; }
    catch (error) {
      if (error instanceof MalviCatalogError && error.code === 'PLAN_STORAGE_UNAVAILABLE') {
        return { schemaVersion: 1 as const, snapshot: initialMalviCatalog(legacy()), history: [],
          storageAvailable: false,
          storageWarning: `${error.message} Only unsaved initial templates are shown; the current published catalogue could not be read.` };
      }
      throw error;
    }
  }
  async function save(body: unknown, actorId: string) {
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some(k => !['expectedVersion','plans','reason'].includes(k))) {
      throw new MalviCatalogError(400, 'PLAN_INPUT_INVALID', 'Supply plans, expected version and change reason only.');
    }
    const { expectedVersion, plans: rawPlans, reason } = body as Record<string, any>;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= 1000000000 ||
        typeof reason !== 'string' || reason.trim().length < 8 || reason.trim().length > 500) {
      throw new MalviCatalogError(400, 'PLAN_INPUT_INVALID', 'A valid saved version and an 8–500 character change reason are required.');
    }
    if (!actorId) throw new MalviCatalogError(403, 'PLAN_ACTOR_REQUIRED', 'A verified billing administrator is required.');
    const plans = validateMalviPlans(rawPlans);
    const previous = await read();
    if (previous.snapshot.version !== expectedVersion) throw conflict();
    const snapshot: MalviCatalogSnapshot = {
      version: expectedVersion + 1, plans, savedAt: new Date().toISOString(), savedBy: actorId, reason: reason.trim(),
    };
    const history = (previous.snapshot.version ? [previous.snapshot, ...previous.history] : previous.history).slice(0, 20);
    const document: CatalogDocument = { schemaVersion: 1, snapshot, history };
    if (!await repository.compareAndSet(expectedVersion, document)) throw conflict();
    return { ...document, storageAvailable: true, storageWarning: null };
  }
  async function published() {
    const doc = await read();
    let fx: MalviFxQuote | null = null;
    try {
      const quote = await loadFx();
      if (quote.rate > 0 && Number.isFinite(quote.rate) && Date.parse(quote.expiresAt) > Date.now()) fx = quote;
    } catch { /* USD plans remain readable, but no GHS amount is invented. */ }
    const plans = doc.snapshot.plans.filter(p => p.status === 'PUBLISHED').map(p => {
      const { status, ...plan } = p;
      return {
        ...plan, isActive: true, catalogVersion: doc.snapshot.version,
        currencyConversion: fx,
        priceMonthlyGHS: p.priceMonthlyUSD === 0 ? 0 : fx ? Math.round(p.priceMonthlyUSD * fx.rate * 100) / 100 : null,
        priceAnnualGHS: p.priceAnnualUSD === 0 ? 0 : fx ? Math.round(p.priceAnnualUSD * fx.rate * 100) / 100 : null,
      };
    });
    return { plans, catalogVersion: doc.snapshot.version, fx,
      fxWarning: fx ? null : 'GHS conversion is unavailable. USD prices remain available.' };
  }
  return { read, adminRead, save, published };
}
function conflict() {
  return new MalviCatalogError(409, 'PLAN_VERSION_CONFLICT', 'Another administrator changed these plans. Reload before saving; your local edits have not been applied.');
}
export const malviCatalogService = createMalviCatalogService();

export function createMalviPlanRouter(service = malviCatalogService) {
  const router = Router();
  function errorResponse(res: import('express').Response, error: unknown) {
    return error instanceof MalviCatalogError
      ? res.status(error.status).json({ success: false, code: error.code, error: error.message })
      : res.status(503).json({ success: false, code: 'PLAN_STORAGE_UNAVAILABLE', error: 'The plan request could not be confirmed. Reload before retrying.' });
  }
  router.get('/', async (req, res) => {
    try {
      const actor = billingAdminActor(req);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, ...await service.adminRead(),
        canEdit: ['SUPER_ADMIN','FINANCE_ADMIN'].includes(actor.adminRole) });
    } catch (error) { errorResponse(res, error); }
  });
  router.post('/save', async (req, res) => {
    try {
      const actor = billingAdminActor(req);
      if (!['SUPER_ADMIN','FINANCE_ADMIN'].includes(actor.adminRole)) {
        throw new MalviCatalogError(403, 'BILLING_FORBIDDEN', 'Only finance or super administrators can change plans.');
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, ...await service.save(req.body, actor.adminUser), canEdit: true });
    } catch (error) { errorResponse(res, error); }
  });
  return router;
}
