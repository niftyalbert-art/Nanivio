import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from 'redis';
import {
  calculateMalviCosts, defaultMalviCostSnapshot, MALVI_RATE_FIELDS, MALVI_SCENARIO_FIELDS,
  type MalviCostRates, type MalviCostScenario,
} from '../src/lib/malviBillingCalculator.ts';
import {
  createMalviCostRouter, createPublicFxLoader, readMalviCostModel, writeMalviCostModel,
} from '../src/server/malviCostCalculator.ts';
import { requireBillingAdmin } from '../src/server/billingAccess.ts';
import { redisSessionStore } from '../src/server/assistant/redisStore.ts';

const base = defaultMalviCostSnapshot(new Date('2026-10-24T12:00:00Z'));
const rates = (overrides: Partial<MalviCostRates> = {}) => ({
  ...Object.fromEntries(MALVI_RATE_FIELDS.map(f => [f.key, 0])), ...overrides,
}) as MalviCostRates;
const usage = (overrides: Partial<MalviCostScenario> = {}) => ({
  ...Object.fromEntries(MALVI_SCENARIO_FIELDS.map(f => [f.key, 0])),
  brain: 'gemini', voice: 'gemini', customers: 1, ...overrides,
}) as MalviCostScenario;

test('public defaults include scheduled Flash pricing without overwriting saved models', () => {
  assert.equal(base.rates.flashInput, 0.75);
  assert.equal(base.rates.flashOutput, 3.75);
  const later = defaultMalviCostSnapshot(new Date('2027-01-01T00:00:00Z'));
  assert.equal(later.rates.flashInput, 1.5);
  assert.equal(later.rates.flashOutput, 7.5);
  assert.equal(base.version, 0);
  assert.equal(base.savedAt, null);
});

test('native Gemini excludes ElevenLabs and computes audio, history, vision and analysis units', () => {
  const s = usage({
    audioInputMinutes: 60, audioOutputMinutes: 60, speechCharacters: 900000,
    liveTextInputTokens: 1000000, liveTextOutputTokens: 1000000, visionInputTokens: 1000000,
    analysisInputTokens: 1000000, analysisOutputTokens: 1000000, searchQueries: 1000,
  });
  const result = calculateMalviCosts(base.rates, s);
  assert.equal(result.voice, 1.38);
  assert.equal(result.context, 6.25);
  assert.equal(result.analysis, 4.5);
  assert.equal(result.search, 14);
  assert.equal(result.avatar, 0);
  assert.equal(result.infrastructure, 60);
  assert.equal(calculateMalviCosts(base.rates, { ...s, speechCharacters: 0 }).voice, result.voice);
});

test('ElevenLabs output replaces native audio output; OpenAI replaces Gemini brain costs', () => {
  const s = usage({ voice: 'elevenlabs', audioInputMinutes: 10, audioOutputMinutes: 9000, speechCharacters: 1000 });
  assert.equal(calculateMalviCosts(base.rates, s).voice, 0.13);
  const openai = calculateMalviCosts(base.rates, {
    ...s, brain: 'openai', sessionMinutes: 10, liveTextInputTokens: 1000000,
    liveTextOutputTokens: 1000000, visionInputTokens: 1000000,
  });
  assert.equal(openai.voice, 0.58);
  assert.equal(openai.context, 0);
});

test('avatar cost is fleet subscription plus overage, never counted twice or added to voice-only', () => {
  const r = rates({ avatarMonthly: 99, avatarIncludedMinutes: 1100, avatarOverage: 0.095 });
  const s = usage({ customers: 100, sessionMinutes: 300, avatarMinutes: 300 });
  const result = calculateMalviCosts(r, s);
  assert.equal(result.fleetAvatarMinutes, 30000);
  assert.equal(result.avatarOverageMinutes, 28900);
  assert.equal(result.avatar, 2844.5);
  assert.equal(result.costPerCustomer, 28.445);
  assert.equal(calculateMalviCosts(r, { ...s, avatarMinutes: 0 }).avatar, 0);
  assert.equal(calculateMalviCosts(r, { ...s, avatarMinutes: 1 }).avatar, 99);
});

test('fixed overhead is shared once; contingency, fees and required margin are included', () => {
  const r = rates({ renderMonthly: 30 });
  const s = usage({ customers: 2, bufferPercent: 10, processingPercent: 3, processingFixed: 0.3, marginPercent: 60 });
  const result = calculateMalviCosts(r, s, 11.67155);
  assert.equal(result.infrastructure, 30);
  assert.equal(result.contingency, 3);
  assert.equal(result.costPerCustomer, 16.5);
  assert.equal(result.suggestedPriceUsd, Math.ceil((16.8 / 0.37) * 100) / 100);
  assert.equal(result.suggestedPriceGhs, Math.round(result.suggestedPriceUsd * 11.67155 * 100) / 100);
  const atPrice = calculateMalviCosts(r, { ...s, testPriceUsd: result.suggestedPriceUsd });
  assert.ok(atPrice.marginAtTestPrice! >= 60);
  assert.equal(atPrice.profit, atPrice.revenue - atPrice.fees - atPrice.fleetCost);
  assert.equal(calculateMalviCosts(r, s).suggestedPriceGhs, null);
  assert.equal(calculateMalviCosts(r, s, NaN).suggestedPriceGhs, null);
});

test('reject malformed inputs, impossible provider choices, invalid margin and unsafe estimates', () => {
  for (const r of [null, [], {}, { ...base.rates, search: -1 }, { ...base.rates, search: NaN },
    { ...base.rates, search: Infinity }, { ...base.rates, search: '14' },
    { ...base.rates, arbitrary: 1 }]) {
    assert.throws(() => calculateMalviCosts(r as any, base.scenario));
  }
  for (const s of [
    usage({ customers: 0 }), usage({ customers: 1.5 }), usage({ marginPercent: 99, processingPercent: 1 }),
    usage({ brain: 'openai', voice: 'gemini' }), usage({ avatarMinutes: 1 }),
    usage({ searchQueries: 1.5 }), { ...usage(), brain: 'unknown' }, { ...usage(), extra: true },
  ]) assert.throws(() => calculateMalviCosts(base.rates, s as any));
  assert.throws(() => calculateMalviCosts(rates({ geminiTextInput: 10000 }),
    usage({ customers: 1000000, liveTextInputTokens: 1000000000 })));
});

test('public FX validates timestamps, coalesces parallel requests and never serves stale data', async () => {
  let now = Date.parse('2026-10-25T01:00:00Z');
  let count = 0;
  let fail = false;
  const body = () => ({
    result: 'success', base_code: 'USD', rates: { GHS: 11.67155 },
    time_last_update_unix: Date.parse('2026-10-25T00:00:00Z') / 1000,
    time_next_update_unix: Date.parse('2026-10-26T00:00:00Z') / 1000,
  });
  const loader = createPublicFxLoader((async (url: string) => {
    assert.equal(url, 'https://open.er-api.com/v6/latest/USD');
    count++;
    if (fail) return new Response('', { status: 503 });
    return new Response(JSON.stringify(body()));
  }) as typeof fetch, () => now);
  const [a, b] = await Promise.all([loader(), loader()]);
  assert.equal(a.rate, 11.67155);
  assert.deepEqual(a, b);
  assert.equal(count, 1);
  await loader();
  assert.equal(count, 1);
  now = Date.parse('2026-10-27T12:00:00Z');
  await assert.rejects(loader());
  fail = true;
  await assert.rejects(loader());
  now = Date.parse('2026-10-25T01:00:00Z');
  for (const changed of [
    { base_code: 'EUR' }, { rates: { GHS: -1 } }, { rates: { GHS: '11' } },
    { time_last_update_unix: now / 1000 + 600 },
    { time_next_update_unix: 1 }, { result: 'error' },
  ]) {
    const invalid = createPublicFxLoader((async () => new Response(JSON.stringify({ ...body(), ...changed }))) as typeof fetch, () => now);
    await assert.rejects(invalid());
  }
});

async function startRedis(dir: string) {
  const child = spawn('redis-server', [
    '--port', '0', '--unixsocket', join(dir, 'redis.sock'), '--save', '',
    '--appendonly', 'yes', '--appendfsync', 'always', '--dir', dir,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Test Redis did not become ready')), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Test Redis exited (${code})`)); });
    child.stdout.on('data', data => {
      if (/ready to accept connections/i.test(String(data))) { clearTimeout(timer); resolve(); }
    });
  });
  return child;
}

test('real Redis and protected HTTP routes: persistence, atomic edits, audit, permissions and failures', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'nanivio-cost-test-'));
  let redisProcess = await startRedis(dir);
  let client = createClient({ socket: { path: join(dir, 'redis.sock'), reconnectStrategy: false } });
  client.on('error', () => {});
  await client.connect();
  t.after(async () => {
    if (client.isOpen) await client.quit();
    const exited = once(redisProcess, 'exit');
    redisProcess.kill('SIGTERM');
    await exited;
    await rm(dir, { recursive: true, force: true });
  });
  const provider = async () => redisSessionStore(client);
  const storageKey = 'nanivio:{assistant}:billing-cost-model';
  const input = (version: number) => ({
    expectedVersion: version, rates: base.rates, scenario: base.scenario, reason: 'Review public provider rates',
  });

  await t.test('actual Lua compare-and-set allows exactly one simultaneous save', async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) =>
      writeMalviCostModel(input(0), `admin-${i}`, provider)));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const losers = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
    assert.ok(losers.every(r => r.reason.status === 409));
    assert.equal((await readMalviCostModel(provider)).snapshot.version, 1);
    assert.equal(await client.ttl(storageKey), -1);
  });

  await t.test('bounded audited revisions survive reconnect AND Redis restart with persistence enabled', async () => {
    for (let version = 1; version < 23; version++) await writeMalviCostModel(input(version), 'finance-owner', provider);
    const before = await readMalviCostModel(provider);
    assert.equal(before.history.length, 20);
    assert.equal(before.snapshot.version, 23);
    assert.equal(before.history[0].version, 22);
    assert.equal(before.history.at(-1)?.version, 3);
    assert.equal(before.snapshot.savedBy, 'finance-owner');
    await client.quit();
    const exited = once(redisProcess, 'exit');
    redisProcess.kill('SIGTERM');
    await exited;
    redisProcess = await startRedis(dir);
    client = createClient({ socket: { path: join(dir, 'redis.sock'), reconnectStrategy: false } });
    client.on('error', () => {});
    await client.connect();
    assert.deepEqual(await readMalviCostModel(provider), before);
  });

  await t.test('reject invalid reasons and forged metadata before saving', async () => {
    for (const body of [
      { ...input(23), reason: 'short' }, { ...input(23), reason: ' '.repeat(20) },
      { ...input(23), expectedVersion: '23' }, { ...input(23), savedBy: 'spoofed-owner' },
      { ...input(23), rates: { ...base.rates, renderMonthly: -1 } },
    ]) await assert.rejects(writeMalviCostModel(body, 'actual-owner', provider));
    assert.equal((await readMalviCostModel(provider)).snapshot.version, 23);
  });

  await t.test('corrupt storage fails explicitly and is never replaced with public defaults', async () => {
    const original = await client.get(storageKey);
    assert.ok(typeof original === 'string');
    await client.set(storageKey, '{broken');
    await assert.rejects(readMalviCostModel(provider), { code: 'COST_MODEL_INVALID' });
    await assert.rejects(writeMalviCostModel(input(0), 'actual-owner', provider));
    assert.equal(await client.get(storageKey), '{broken');
    await client.set(storageKey, original!);
  });

  await t.test('HTTP permission boundary, real save, read-only role and sanitized FX outage', async () => {
    const app = express();
    app.use(express.json());
    // Trusted-principal fixture exists only in this test, never in application code.
    app.use((req: any, _res, next) => {
      const role = req.header('x-test-role');
      if (role) req.authUser = {
        id: 'verified-actor', role: role === 'USER' ? 'PERSONAL' : 'ADMIN',
        accountStatus: 'ACTIVE', adminSubRole: role,
      };
      next();
    });
    app.use('/api/admin/billing', requireBillingAdmin);
    app.use('/api/admin/billing/malvi-costs', createMalviCostRouter(provider, async () => { throw new Error('private-provider-detail'); }));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as any).port;
    const url = `http://127.0.0.1:${port}/api/admin/billing/malvi-costs`;
    try {
      assert.equal((await fetch(url)).status, 401);
      assert.equal((await fetch(url, { headers: { 'x-test-role': 'USER' } })).status, 403);
      const response = await fetch(url, { headers: { 'x-test-role': 'AUDITOR' } });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control')!, /no-store/);
      const page = await response.json();
      assert.equal(page.canEdit, false);
      assert.equal(page.fx, null);
      assert.match(page.fxWarning, /unavailable or stale/);
      assert.doesNotMatch(JSON.stringify(page), /private-provider-detail/);
      const post = (role: string, data: unknown) => fetch(`${url}/save`, {
        method: 'POST', headers: { 'x-test-role': role, 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      for (const role of ['USER', 'AUDITOR', 'SUPPORT_ADMIN', 'BILLING_ADMIN']) {
        assert.equal((await post(role, input(23))).status, 403);
      }
      const saved = await post('FINANCE_ADMIN', input(23));
      assert.equal(saved.status, 200);
      const savedData = await saved.json();
      assert.equal(savedData.snapshot.version, 24);
      assert.equal(savedData.snapshot.savedBy, 'verified-actor');
      assert.equal(savedData.storageAvailable, true);
      assert.equal((await post('SUPER_ADMIN', input(23))).status, 409);
      assert.equal((await post('SUPER_ADMIN', { ...input(24), scenario: { ...base.scenario, customers: 0 } })).status, 400);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});

test('unavailable storage permits explicitly unsaved estimates but refuses saving', async () => {
  const unavailable = async (): Promise<never> => { throw new Error('sensitive connection details'); };
  const page = await readMalviCostModel(unavailable);
  assert.equal(page.storageAvailable, false);
  assert.equal(page.snapshot.version, 0);
  assert.match(page.storageWarning!, /cannot be saved/);
  assert.doesNotMatch(JSON.stringify(page), /sensitive connection details/);
  await assert.rejects(writeMalviCostModel({
    rates: base.rates, scenario: base.scenario, expectedVersion: 0, reason: 'Confirm public provider rates',
  }, 'verified-actor', unavailable), { code: 'COST_STORAGE_UNAVAILABLE' });
});
