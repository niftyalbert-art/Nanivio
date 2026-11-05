import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { cryptoCheckoutAccess } from '../src/server/crypto/access.ts';
import { registerCryptoBillingRoutes } from '../src/server/crypto/routes.ts';

test('owner-approved public checkout is the default; invalid modes and unauthenticated users are denied', () => {
  assert.equal(cryptoCheckoutAccess('ordinary', {}).allowed, true);
  assert.equal(cryptoCheckoutAccess('test-a', { TRON_USDT_ACCESS_MODE: 'test' }).allowed, false);
  assert.equal(cryptoCheckoutAccess('test-a', { TRON_USDT_ACCESS_MODE: '' }).allowed, false);
  assert.equal(cryptoCheckoutAccess('test-a', { TRON_USDT_ACCESS_MODE: 'invalid', TRON_USDT_TEST_USER_IDS: 'test-a' }).allowed, false);
  assert.equal(cryptoCheckoutAccess('', { TRON_USDT_ACCESS_MODE: 'public' }).allowed, false);
});

test('test access matches full authenticated IDs, never substrings, emails or client roles', () => {
  const environment = { TRON_USDT_ACCESS_MODE: 'test', TRON_USDT_TEST_USER_IDS: 'test-a, test-b\n test-c' };
  for (const id of ['test-a', 'test-b', 'test-c']) assert.equal(cryptoCheckoutAccess(id, environment).allowed, true);
  for (const id of ['test', 'test-a-admin', 'test-a@example.test', 'ADMIN', '']) {
    assert.equal(cryptoCheckoutAccess(id, environment).allowed, false);
  }
  assert.equal(cryptoCheckoutAccess('ordinary', { TRON_USDT_ACCESS_MODE: 'public' }).allowed, true);
});

test('real HTTP routes enforce test access before quoting or writing and preserve existing invoice recovery', async () => {
  const keys = ['TRON_USDT_ACCESS_MODE', 'TRON_USDT_TEST_USER_IDS', 'TRON_USDT_ENABLED', 'TRON_USDT_RECEIVING_ADDRESS'] as const;
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const calls: string[] = [];
  let quotes = 0;
  const row = {
    id: '12345678-1234-1234-1234-123456789abc', user_id: 'ordinary',
    receiving_address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8', amount_units: '9987654',
    purchase: { purpose: 'SUBSCRIPTION', planTier: 'premium', billingCycle: 'MONTHLY', amount: 9.99,
      product: { name: 'Premium' } },
    status: 'ACTIVATED', created_at: new Date().toISOString(), expires_at: new Date(Date.now()+1200000).toISOString(),
  };
  const app = express();
  app.use(express.json());
  registerCryptoBillingRoutes(app, {
    user: (req, res, next) => {
      // Fixture authentication only; no production auth, credentials or database.
      if (!req.headers['x-fixture-user']) { res.status(401).json({ error: 'Authentication required' }); return; }
      (req as any).authUser = { id: req.headers['x-fixture-user'] }; next();
    },
    admin: (_req, res) => { res.sendStatus(403); },
    userId: req => req.authUser.id,
    quote: async () => { quotes++; return row.purchase; },
    command: async (command, payload) => {
      calls.push(command);
      if (command === 'PREFLIGHT') return { success: true };
      if (command === 'CREATE') return { success: true, invoice: { ...row, user_id: payload?.userId, status: 'PENDING' } };
      if (command === 'LIST') return { success: true, invoices: [row] };
      if (command === 'GET') return { success: true, invoice: row };
      throw new Error('Unexpected database operation');
    },
    startReconciler: false,
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, user?: string, body?: object) => fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { ...(user ? { 'x-fixture-user': user } : {}), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const purchase = { purpose: 'SUBSCRIPTION', planTier: 'premium', billingCycle: 'MONTHLY' };
  try {
    process.env.TRON_USDT_ACCESS_MODE = 'test';
    process.env.TRON_USDT_TEST_USER_IDS = 'test-a,test-b';
    process.env.TRON_USDT_ENABLED = 'true';
    process.env.TRON_USDT_RECEIVING_ADDRESS = row.receiving_address;
    assert.equal((await request('/api/billing/crypto/config')).status, 401);
    const deniedConfig = await (await request('/api/billing/crypto/config','ordinary')).json();
    assert.equal(deniedConfig.eligible, false);
    assert.equal(deniedConfig.enabled, false);
    assert.equal(deniedConfig.accessMode, 'test');
    assert.equal(JSON.stringify(deniedConfig).includes('test-a'), false);
    const denied = await request('/api/billing/crypto/invoices', 'ordinary', {
      ...purchase, userId: 'test-a', accessMode: 'public', role: 'ADMIN',
    });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).code, 'CRYPTO_CHECKOUT_RESTRICTED');
    assert.equal(quotes, 0);
    assert.deepEqual(calls, []);
    const allowed = await (await request('/api/billing/crypto/config','test-a')).json();
    assert.equal(allowed.eligible, true);
    assert.equal(allowed.enabled, true);
    assert.equal((await request('/api/billing/crypto/invoices','test-a',purchase)).status, 201);
    assert.equal(quotes, 1);
    assert.equal(calls.filter(command => command === 'CREATE').length, 1);

    process.env.TRON_USDT_ENABLED = 'false';
    const disabled = await (await request('/api/billing/crypto/config','test-a')).json();
    assert.equal(disabled.eligible, true);
    assert.equal(disabled.enabled, false);
    assert.equal((await request('/api/billing/crypto/invoices','test-a',purchase)).status, 503);
    assert.equal(quotes, 1);

    // Removing rollout eligibility must not hide a paid receipt or stop recovery.
    assert.equal((await request('/api/billing/crypto/invoices','ordinary')).status, 200);
    assert.equal((await request(`/api/billing/crypto/invoices/${row.id}/check`,'ordinary',{})).status, 200);
    assert.equal((await request(`/api/billing/crypto/invoices/${row.id}/check`,'test-a',{})).status, 404);
    assert.equal(calls.includes('CONFIRM'), false);

    process.env.TRON_USDT_ENABLED = 'true';
    process.env.TRON_USDT_ACCESS_MODE = 'invalid';
    assert.equal((await request('/api/billing/crypto/invoices','test-a',purchase)).status, 403);
    delete process.env.TRON_USDT_ACCESS_MODE;
    delete process.env.TRON_USDT_TEST_USER_IDS;
    assert.equal((await request('/api/billing/crypto/invoices','ordinary',purchase)).status, 201);
    process.env.TRON_USDT_ACCESS_MODE = 'public';
    assert.equal((await request('/api/billing/crypto/invoices','ordinary',purchase)).status, 201);
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
