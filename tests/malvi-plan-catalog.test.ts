import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { billingDb } from '../src/server/billingDb';
import { createMalviCatalogService, createMalviPlanRouter, type CatalogRepository } from '../src/server/malviPlanCatalog';
import { initialMalviCatalog, validateMalviPlans, MalviCatalogError, type MalviCatalogPlan } from '../src/lib/malviPlanCatalog';
import { quotePaystackOrder } from '../src/server/paystackOrders';
import { requireBillingAdmin } from '../src/server/billingAccess';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nanivio-catalog-test-'));
let pg = new PGlite(dir);
await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE TABLE existing_purchases(id text primary key, benefits jsonb);
  INSERT INTO existing_purchases VALUES ('previous', '{"voiceMinutes":800,"videoMinutes":300,"pricePaid":14.99}');`);
const migration = await fs.readFile('migrations/012_malvi_plan_catalog.sql', 'utf8');
await pg.exec(migration);
// Migration is safe to rerun and leaves existing financial rows untouched.
await pg.exec(migration);
after(async () => { await pg.close(); await fs.rm(dir, { recursive: true, force: true }); });
const repo: CatalogRepository = {
  async read() {
    const { rows } = await pg.query<any>("SELECT version,document FROM nanivio_malvi_plan_catalog WHERE catalog_id='primary'");
    return rows[0] ? { version: Number(rows[0].version), document: rows[0].document } : null;
  },
  async compareAndSet(version, document) {
    const result = version === 0
      ? await pg.query("INSERT INTO nanivio_malvi_plan_catalog VALUES ('primary',1,$1::jsonb,now()) ON CONFLICT DO NOTHING RETURNING version", [JSON.stringify(document)])
      : await pg.query("UPDATE nanivio_malvi_plan_catalog SET version=version+1,document=$1::jsonb,updated_at=now() WHERE catalog_id='primary' AND version=$2 RETURNING version", [JSON.stringify(document),version]);
    return result.rows.length === 1;
  },
};
let fxDown = false;
const fx = async () => {
  if (fxDown) throw Error('fixture FX failure; not a provider call');
  return { rate: 12, source: 'Fixture reference FX', asOf: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(), attributionUrl: 'https://www.exchangerate-api.com' };
};
const service = createMalviCatalogService(repo, () => billingDb.malviPlans, fx);
const plans = () => initialMalviCatalog(billingDb.malviPlans).plans;
const body = (version: number, values: MalviCatalogPlan[] = plans()) => ({
  expectedVersion: version, plans: values, reason: 'Reviewed rates and benefits for future purchases',
});
const errorCode = (code: string) => (e: any) => e.code === code;

test('initial catalogue preserves existing USD prices and allowances; Voice is an unsold draft', async () => {
  const result = await service.adminRead();
  assert.equal(result.snapshot.version, 0);
  assert.equal(result.snapshot.plans.length, 5);
  assert.equal(result.snapshot.plans[1].tier, 'malvi_voice');
  assert.equal(result.snapshot.plans[1].status, 'DRAFT');
  assert.equal(result.snapshot.plans[1].priceMonthlyUSD, 0);
  for (const legacy of billingDb.malviPlans) {
    const plan = result.snapshot.plans.find(p => p.tier === legacy.tier)!;
    assert.equal(plan.priceMonthlyUSD, legacy.priceMonthlyUSD);
    assert.equal(plan.videoInteractionMinutesLimit, legacy.videoInteractionMinutesLimit);
  }
  assert.equal((await service.published()).plans.some(p => p.tier === 'malvi_voice'), false);
});

test('plan validation protects identities, prices, flags, free access and unpublished Voice delivery', () => {
  for (const change of [
    (p: any[]) => p.pop(),
    (p: any[]) => { p[2].id = 'another_id'; },
    (p: any[]) => { p[2].priceMonthlyUSD = -1; },
    (p: any[]) => { p[2].priceMonthlyUSD = 1.001; },
    (p: any[]) => { p[2].priceMonthlyUSD = NaN; },
    (p: any[]) => { p[2].voiceInteractionMinutesLimit = 2.5; },
    (p: any[]) => { p[2].voiceInteractionMinutesLimit = -1; },
    (p: any[]) => { p[2].status = 'UNKNOWN'; },
    (p: any[]) => { p[0].status = 'ARCHIVED'; },
    (p: any[]) => { p[0].priceAnnualUSD = 1; },
    (p: any[]) => { p[1].avatarInteractive = true; },
    (p: any[]) => { p[1].status = 'PUBLISHED'; p[1].priceMonthlyUSD = 6; p[1].priceAnnualUSD = 60; p[1].voiceInteractionMinutesLimit = 120; },
    (p: any[]) => { p[2].features = ['x'.repeat(301)]; },
    (p: any[]) => { p[2].priceMonthlyGHS = 1; },
  ]) {
    const draft = plans(); change(draft);
    assert.throws(() => validateMalviPlans(draft), errorCode('PLAN_INPUT_INVALID'));
  }
  const draft = plans();
  draft[2].features = [' First ', '', 'Second'];
  assert.deepEqual(validateMalviPlans(draft)[2].features, ['First', 'Second']);
});

test('SQL rejects anonymous/authenticated table access and enables RLS', async () => {
  assert.equal((await pg.query<any>("SELECT relrowsecurity FROM pg_class WHERE relname='nanivio_malvi_plan_catalog'")).rows[0].relrowsecurity, true);
  for (const role of ['anon','authenticated']) {
    await pg.exec(`SET ROLE ${role}`);
    try {
      await assert.rejects(pg.query('SELECT * FROM nanivio_malvi_plan_catalog'), (e: any) => e.code === '42501');
      await assert.rejects(pg.query('DELETE FROM nanivio_malvi_plan_catalog'), (e: any) => e.code === '42501');
    } finally { await pg.exec('RESET ROLE'); }
  }
});

test('simultaneous first publications have exactly one winner and an audited revision', async () => {
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => service.save(body(0), `admin-${i}`)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected' && r.reason.code === 'PLAN_VERSION_CONFLICT').length, 7);
  const saved = await service.read();
  assert.equal(saved.snapshot.version, 1);
  assert.ok(saved.snapshot.savedBy?.startsWith('admin-'));
  assert.equal(saved.snapshot.reason, body(0).reason);
  assert.equal(saved.history.length, 0);
});

test('public prices use canonical USD, automatic GHS and immutable checkout terms', async () => {
  const publicCatalog = await service.published();
  const basic = publicCatalog.plans.find(p => p.tier === 'malvi_basic')!;
  assert.equal(basic.priceMonthlyUSD, 4.99);
  assert.equal(basic.priceMonthlyGHS, 59.88);
  assert.equal(basic.currencyConversion?.source, 'Fixture reference FX');
  const catalog = { subscriptionPlans: [], communicationMinutePackages: [], malviPlans: publicCatalog.plans };
  const order = quotePaystackOrder({ purpose: 'MALVI_SUBSCRIPTION', planTier: 'malvi_basic', amount: 59.88,
    currency: 'GHS', metadata: { catalogVersion: 1 } }, catalog);
  assert.equal(order.product?.voiceMinutesAllowed, 30);
  assert.equal(order.product?.videoMinutesAllowed, 30);
  assert.equal(order.product?.planSnapshot.name, 'Malvi Basic');
  assert.throws(() => quotePaystackOrder({ purpose: 'MALVI_SUBSCRIPTION', planTier: 'malvi_basic', currency: 'GHS', metadata: { catalogVersion: 0 } }, catalog), /changed/);
  const updated = (await service.read()).snapshot.plans;
  const edited = updated.find(p => p.tier === 'malvi_basic')!;
  edited.name = 'Updated Basic';
  edited.priceMonthlyUSD = 12;
  edited.voiceInteractionMinutesLimit = 120;
  edited.videoInteractionMinutesLimit = 20;
  updated.find(p => p.tier === 'malvi_premium')!.status = 'ARCHIVED';
  await service.save(body(1, updated), 'finance');
  const next = await service.published();
  assert.equal(next.plans.find(p => p.tier === 'malvi_basic')!.priceMonthlyGHS, 144);
  assert.equal(next.plans.some(p => p.tier === 'malvi_premium'), false);
  assert.equal((await service.read()).history[0].version, 1);
  assert.equal((await service.read()).history[0].plans.find(p => p.tier === 'malvi_basic')!.name, 'Malvi Basic');
  // Existing orders and existing subscriptions do not follow edits to today's catalogue.
  assert.equal(order.product?.voiceMinutesAllowed, 30);
  assert.equal(order.product?.videoMinutesAllowed, 30);
  assert.equal(order.product?.planSnapshot.name, 'Malvi Basic');
  assert.equal(order.amount, 59.88);
  assert.deepEqual((await pg.query<any>("SELECT benefits FROM existing_purchases WHERE id='previous'")).rows[0].benefits,
    { voiceMinutes: 800, videoMinutes: 300, pricePaid: 14.99 });
});

test('FX failure preserves USD and rejects missing GHS rather than inventing a rate or free price', async () => {
  fxDown = true;
  try {
    const catalog = await service.published();
    assert.equal(catalog.fx, null);
    const basic = catalog.plans.find(p => p.tier === 'malvi_basic')!;
    assert.equal(basic.priceMonthlyUSD, 12);
    assert.equal(basic.priceMonthlyGHS, null);
    assert.throws(() => quotePaystackOrder({ purpose:'MALVI_SUBSCRIPTION', planTier:'malvi_basic', currency:'GHS',
      metadata:{catalogVersion:2} }, { subscriptionPlans:[],communicationMinutePackages:[],malviPlans:catalog.plans }), /positive payment amount/);
    assert.equal(catalog.plans.find(p => p.tier === 'free')!.priceMonthlyGHS, 0);
  } finally { fxDown = false; }
});

test('persistence survives a real SQL engine restart; stale revisions cannot overwrite', async () => {
  await pg.close();
  pg = new PGlite(dir);
  const recovered = await service.read();
  assert.equal(recovered.snapshot.version, 2);
  assert.equal(recovered.snapshot.plans.find(p => p.tier === 'malvi_basic')!.name, 'Updated Basic');
  await assert.rejects(service.save(body(1), 'other-admin'), errorCode('PLAN_VERSION_CONFLICT'));
  await assert.rejects(service.save({ ...body(2), savedBy: 'spoof' }, 'finance'), errorCode('PLAN_INPUT_INVALID'));
});

test('protected HTTP routes allow billing reads, restrict saves and reject untrusted audit fields', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/billing', (req: any, _res, next) => {
    if (req.header('x-fixture-role')) req.authUser = {
      id: 'verified-finance', role: req.header('x-fixture-role') === 'USER' ? 'USER' : 'ADMIN',
      accountStatus: 'ACTIVE', adminSubRole: req.header('x-fixture-role'),
    };
    next();
  }, requireBillingAdmin);
  app.use('/api/admin/billing/malvi-plans', createMalviPlanRouter(service));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/api/admin/billing/malvi-plans`;
  const request = (role: string, method = 'GET', payload?: any) => fetch(url + (method === 'POST' ? '/save' : ''), {
    method, headers: { 'content-type': 'application/json', ...(role ? { 'x-fixture-role': role } : {}) },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  try {
    assert.equal((await request('')).status, 401);
    assert.equal((await request('USER')).status, 403);
    const view = await (await request('AUDITOR')).json();
    assert.equal(view.canEdit, false);
    assert.equal((await request('AUDITOR', 'POST', body(2))).status, 403);
    assert.equal((await request('FINANCE_ADMIN','POST',{...body(2),savedBy:'spoof'})).status, 400);
    const result = await (await request('FINANCE_ADMIN','POST',body(2))).json();
    assert.equal(result.snapshot.version, 3);
    assert.equal(result.snapshot.savedBy, 'verified-finance');
    assert.equal((await request('FINANCE_ADMIN','POST',body(2))).status, 409);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('setup/storage failure is explicit, prohibits saves and never supplies purchasable fallback plans', async () => {
  const broken = createMalviCatalogService({
    read: async () => { throw new MalviCatalogError(503, 'PLAN_STORAGE_UNAVAILABLE', 'Fixture catalogue setup is missing.'); },
    compareAndSet: async () => false,
  }, () => billingDb.malviPlans, fx);
  const view = await broken.adminRead();
  assert.equal(view.storageAvailable, false);
  assert.match(view.storageWarning!, /Only unsaved initial templates/);
  await assert.rejects(broken.published());
  await assert.rejects(broken.save(body(0), 'finance'));
});

test('history is bounded and corrupted catalogue data is not silently replaced', async () => {
  for (let version = 3; version < 26; version++) await service.save(body(version), 'finance');
  assert.equal((await service.read()).history.length, 20);
  await pg.query("UPDATE nanivio_malvi_plan_catalog SET document='{\"schemaVersion\":1}'");
  await assert.rejects(service.read(), errorCode('PLAN_CATALOG_INVALID'));
  await assert.rejects(service.save(body(26), 'finance'), errorCode('PLAN_CATALOG_INVALID'));
});
