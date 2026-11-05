import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { cryptoCheckoutAccess } from '../src/server/crypto/access.ts';
import { registerCryptoBillingRoutes } from '../src/server/crypto/routes.ts';
import { quotePaystackOrder } from '../src/server/paystackOrders.ts';

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
  let expanded = false;
  const created: any[] = [];
  const creditPurchases: any[] = [];
  const catalog = {
    subscriptionPlans: [{ id:'premium',tier:'premium',name:'Premium',priceMonthlyUSD:9.99,
      priceAnnualUSD:99.99,priceMonthlyGHS:100,priceAnnualGHS:1000,includedVoiceMinutes:60,includedLangpretationMinutes:120 }],
    malviPlans: [],
    communicationMinutePackages: [{ id:'pack-150',minutes:150,validityDays:60,priceUSD:8.99,priceGHS:130 }],
  };
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
    quote: async input => { quotes++; return quotePaystackOrder(input,catalog); },
    creditPurchase: async (userId, requestId, quote) => {
      creditPurchases.push({userId,requestId,quote});return {success:true};
    },
    command: async (command, payload) => {
      calls.push(command);
      if (command === 'PREFLIGHT') return { success: true, ...(expanded ? {paymentPurposes:['SUBSCRIPTION','MALVI_SUBSCRIPTION','COMMUNICATION_TOPUP','COMMUNICATION_MINUTES']} : {}) };
      if (command === 'CREATE') {
        created.push(payload);
        return { success: true, invoice: { ...row, amount_units:String(Math.round((payload.purchase as {amount:number}).amount*1e6)-1),
          purchase:payload?.purchase,user_id: payload?.userId, status: 'PENDING' } };
      }
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
    const before = created.length;
    assert.equal((await request('/api/billing/crypto/invoices','ordinary',{purpose:'COMMUNICATION_TOPUP',amount:10})).status,503);
    assert.equal(created.length,before);
    expanded=true;
    const topupResponse = await request('/api/billing/crypto/invoices','ordinary',{
      purpose:'COMMUNICATION_TOPUP',amount:10,currency:'GHS',userId:'someone-else',
      product:{creditAmountUSD:99999},metadata:{trusted:true},
    });
    assert.equal(topupResponse.status,201,await topupResponse.text());
    assert.equal(created.at(-1).userId,'ordinary');
    assert.equal(created.at(-1).purchase.currency,'USD');
    assert.equal(created.at(-1).purchase.product.creditAmountUSD,10);
    assert.equal((await request('/api/billing/crypto/invoices','ordinary',{
      purpose:'COMMUNICATION_MINUTES',packageId:'pack-150',minutes:99999,amount:0.01,
    })).status,201);
    assert.equal(created.at(-1).purchase.amount,8.99);
    assert.equal(created.at(-1).purchase.product.minutes,150);
    assert.equal(created.at(-1).purchase.product.validityDays,60);
    const afterValid=created.length;
    for (const body of [
      {purpose:'COMMUNICATION_TOPUP',amount:-1},{purpose:'COMMUNICATION_TOPUP',amount:0.001},
      {purpose:'COMMUNICATION_MINUTES',packageId:'missing'},
    ]) assert.notEqual((await request('/api/billing/crypto/invoices','ordinary',body)).status,201);
    assert.equal(created.length,afterValid);
    const creditRequest={requestId:'11111111-2222-4333-8444-555555555555',planTier:'premium',billingCycle:'MONTHLY',currency:'USD',amount:9.99,userId:'somebody-else'};
    assert.equal((await request('/api/billing/credit/communication-subscription',undefined,creditRequest)).status,401);
    assert.equal((await request('/api/billing/credit/communication-subscription','ordinary',{...creditRequest,requestId:'bad'})).status,400);
    assert.equal(creditPurchases.length,0);
    assert.equal((await request('/api/billing/credit/communication-subscription','ordinary',creditRequest)).status,200);
    assert.equal(creditPurchases[0].userId,'ordinary');
    assert.equal(creditPurchases[0].quote.amount,9.99);
    assert.equal(creditPurchases[0].quote.product.periodDays,30);
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
