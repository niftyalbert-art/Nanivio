import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import ts from 'typescript';
import {
  billingRole, canManageBilling, canRefund, requireBillingAdmin, billingAdminActor,
  ownsBillingRecord, ownsProviderEarnings, ownsBusinessBilling,
  type BillingPrincipal,
} from '../src/server/billingAccess.ts';

// These are inputs to a pure authorization policy, not authenticated test
// accounts, mocked provider responses, balances, payments or invoices.
const principal = (overrides: Partial<BillingPrincipal> = {}): BillingPrincipal => ({
  id: 'principal-owner', role: 'PERSONAL', accountStatus: 'ACTIVE', ...overrides,
});
const admin = (adminSubRole: string) => principal({ role: 'ADMIN', adminSubRole });
const protectedPaths = [
  '/overview', '/pricing', '/pricing/update-rule', '/emergency', '/emergency/update',
  '/ledger', '/disputes/resolve', '/refunds/process', '/adjustments/create',
  '/reconciliation', '/audit', '/user/principal-owner', '/gateways/toggle',
  '/momo/countries/toggle', '/momo/accounts',
];

test('billing permission policy denies missing, ordinary, inactive and unrelated admin principals', () => {
  for (const user of [
    undefined, principal(), principal({ role: 'EXPERT' }),
    principal({ role: 'ADMIN' }), admin('USER_ADMIN'), admin('CONTENT_ADMIN'),
    { ...admin('SUPER_ADMIN'), accountStatus: 'SUSPENDED' },
    { ...admin('SUPER_ADMIN'), accountStatus: 'DEACTIVATED' },
    { ...admin('SUPER_ADMIN'), id: '' },
  ]) {
    for (const path of protectedPaths) {
      for (const method of ['GET', 'HEAD', 'POST']) {
        assert.equal(canManageBilling(user, method, path), false, `${user?.role}/${user?.adminSubRole}: ${method} ${path}`);
      }
    }
  }
});

test('finance permissions are least-privilege and unknown mutations fail closed', () => {
  assert.equal(billingRole(admin('FINTECH_ADMIN')), 'FINANCE_ADMIN');
  for (const role of ['SUPER_ADMIN', 'FINTECH_ADMIN', 'FINANCE_ADMIN']) {
    assert.equal(canManageBilling(admin(role), 'POST', '/refunds/process'), true);
    assert.equal(canManageBilling(admin(role), 'POST', '/pricing/update-rule/'), true);
  }
  assert.equal(canManageBilling(admin('BILLING_ADMIN'), 'POST', '/adjustments/create'), true);
  assert.equal(canManageBilling(admin('BILLING_ADMIN'), 'POST', '/refunds/process'), false);
  assert.equal(canManageBilling(admin('BILLING_ADMIN'), 'POST', '/gateways/toggle'), false);
  assert.equal(canManageBilling(admin('SUPPORT_ADMIN'), 'POST', '/disputes/resolve'), true);
  assert.equal(canRefund(billingRole(admin('SUPPORT_ADMIN'))!), false);
  assert.equal(canRefund(billingRole(admin('BILLING_ADMIN'))!), false);
  assert.equal(canRefund(billingRole(admin('SUPER_ADMIN'))!), true);
  for (const path of protectedPaths) {
    assert.equal(canManageBilling(admin('AUDITOR'), 'GET', path), true);
    assert.equal(canManageBilling(admin('AUDITOR'), 'HEAD', path), true);
    assert.equal(canManageBilling(admin('AUDITOR'), 'POST', path), false);
  }
  assert.equal(canManageBilling(admin('SUPER_ADMIN'), 'POST', '/new-unclassified-mutation'), false);
  assert.equal(canManageBilling(admin('SUPER_ADMIN'), 'DELETE', '/refunds/process'), false);
});

test('guard derives audit actor from the verified principal, ignoring body role claims', () => {
  const req = {
    authUser: admin('BILLING_ADMIN'), method: 'POST', path: '/adjustments/create',
    body: { adminUser: 'untrusted-actor', adminRole: 'SUPER_ADMIN' },
  } as unknown as express.Request;
  let continued = false;
  requireBillingAdmin(req, {} as express.Response, () => { continued = true; });
  assert.equal(continued, true);
  assert.deepEqual(billingAdminActor(req), { adminUser: 'principal-owner', adminRole: 'BILLING_ADMIN' });
  assert.throws(() => billingAdminActor({} as express.Request), /Verified billing administrator/);
});

test('guard returns 403 for ordinary users and restricted administrators', () => {
  for (const [user, path] of [
    [principal(), '/overview'],
    [admin('USER_ADMIN'), '/overview'],
    [admin('AUDITOR'), '/refunds/process'],
    [admin('BILLING_ADMIN'), '/refunds/process'],
  ] as const) {
    let status = 0;
    let continued = false;
    const res = {
      status(code: number) { status = code; return this; },
      json(body: { code: string }) { assert.equal(body.code, 'BILLING_FORBIDDEN'); return this; },
    } as unknown as express.Response;
    requireBillingAdmin({ authUser: user, method: 'POST', path } as unknown as express.Request, res, () => { continued = true; });
    assert.equal(status, 403);
    assert.equal(continued, false);
  }
});

test('real HTTP GET, HEAD and POST requests cannot enter the billing namespace without authentication', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/billing', requireBillingAdmin);
  let handlerCalls = 0;
  app.all('/api/admin/billing/*', (_req, res) => { handlerCalls++; res.sendStatus(204); });
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    for (const path of protectedPaths) {
      for (const method of ['GET', 'HEAD', 'POST']) {
        const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/billing${path}`, {
          method,
          ...(method === 'POST' ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminRole: 'SUPER_ADMIN', adminUser: 'untrusted-actor' }),
          } : {}),
        });
        assert.equal(response.status, 401, `${method} ${path}`);
        if (method !== 'HEAD') assert.equal((await response.json()).code, 'AUTH_REQUIRED');
      }
    }
    assert.equal(handlerCalls, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('private-record ownership cannot be substituted by another user ID or an admin role', () => {
  assert.equal(ownsBillingRecord(principal(), 'principal-owner'), true);
  assert.equal(ownsBillingRecord(principal(), 'another-principal'), false);
  assert.equal(ownsBillingRecord(undefined, 'principal-owner'), false);
  assert.equal(ownsBillingRecord(principal({ accountStatus: 'SUSPENDED' }), 'principal-owner'), false);
  assert.equal(ownsBillingRecord(admin('SUPER_ADMIN'), 'another-principal'), false);
});

test('provider reads use authenticated IDs or the verified expert link only', () => {
  const expert = principal({ role: 'EXPERT', expertProfileId: 'linked-expert' });
  assert.equal(ownsProviderEarnings(expert, 'principal-owner'), true);
  assert.equal(ownsProviderEarnings(expert, 'linked-expert'), true);
  assert.equal(ownsProviderEarnings(expert, 'unrelated-expert'), false);
  assert.equal(ownsProviderEarnings(principal({ expertProfileId: 'linked-expert' }), 'linked-expert'), false);
  assert.equal(ownsProviderEarnings(undefined, 'linked-expert'), false);
});

test('business reads require ownership or an actual administrator membership', () => {
  const metadata = { businessId: 'business-owner', activeMembers: [{ userId: 'principal-owner', role: 'MEMBER' }] };
  assert.equal(ownsBusinessBilling(principal(), metadata), false);
  assert.equal(ownsBusinessBilling(principal(), { ...metadata, activeMembers: [{ userId: 'principal-owner', role: 'ADMIN' }] }), true);
  assert.equal(ownsBusinessBilling(principal({ role: 'BUSINESS', businessProfileId: 'business-owner' }), metadata), true);
  assert.equal(ownsBusinessBilling(principal({ role: 'BUSINESS', businessProfileId: 'unrelated-business' }), metadata), false);
  assert.equal(ownsBusinessBilling(principal({ role: 'BUSINESS', accountStatus: 'DEACTIVATED' }), metadata), false);
  assert.equal(ownsBusinessBilling(undefined, metadata), false);
});

function appCalls(source: string) {
  const file = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return file.statements.flatMap(statement => {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return [];
    const call = statement.expression;
    if (!ts.isPropertyAccessExpression(call.expression) || call.expression.expression.getText(file) !== 'app') return [];
    const route = call.arguments[0];
    if (!route || !ts.isStringLiteral(route)) return [];
    return [{ method: call.expression.name.text, path: route.text, position: statement.pos, args: call.arguments.map(a => a.getText(file)) }];
  });
}

test('actual server registers authentication and billing guard before every admin billing route', async () => {
  const source = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
  const calls = appCalls(source);
  const gate = calls.find(c => c.method === 'use' && c.path === '/api/admin/billing');
  assert.ok(gate);
  assert.deepEqual(gate.args.slice(1), ['requireAuthenticatedUser', 'requireBillingAdmin']);
  const routes = calls.filter(c => c.method !== 'use' && c.path.startsWith('/api/admin/billing/'));
  assert.equal(routes.length, 15);
  for (const route of routes) {
    assert.ok(route.position > gate.position, `Ungated ${route.path}`);
    if (route.method === 'post') assert.match(route.args.at(-1)!, /billingAdminActor\(req\)/, `Unverified actor on ${route.path}`);
  }
  for (const path of ['/api/billing/invoices/:invoiceId', '/api/billing/provider/earnings', '/api/billing/business']) {
    const route = calls.find(c => c.path === path);
    assert.ok(route);
    assert.equal(route.args[1], 'requireAuthenticatedUser', path);
  }
  assert.match(source, /getPersistentInvoice\(authenticatedUserId\(req\),/);
  assert.match(source, /processRefund\(\{ \.\.\.req\.body, \.\.\.billingAdminActor\(req\) \}\)/);
  assert.match(source, /createAdminAdjustment\(\{ \.\.\.req\.body, \.\.\.billingAdminActor\(req\) \}\)/);
  assert.match(source, /t\.transactionId === transactionId &&\s+ownsBillingRecord/);
});

test('both persistent invoice lookup paths scope the database query to the authenticated owner', async () => {
  const source = await readFile(new URL('../src/server/normalizedBillingRepository.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export async function getPersistentInvoice(');
  const end = source.indexOf('\nexport async function ', start + 1);
  const lookup = source.slice(start, end);
  assert.equal((lookup.match(/\.eq\('user_id', userId\)/g) || []).length, 2);
  assert.match(lookup, /\.eq\('invoice_id', invoiceId\)/);
  assert.match(lookup, /\.eq\('id', invoiceId\)/);
});

test('admin and private earnings clients use authenticated requests and propagate rejection', async () => {
  const source = await readFile(new URL('../src/lib/billingClient.ts', import.meta.url), 'utf8');
  assert.match(source, /fetch\(url, \{ \.\.\.init, headers: billingHeaders\(\) \}\)/);
  assert.match(source, /if \(!response\.ok \|\| data\.success === false\)/);
  assert.doesNotMatch(source, /fetch\(['"`]\/api\/admin\/billing/);
  assert.doesNotMatch(source, /providerId: string =|businessId: string =/);
  assert.match(source, /protectedBillingRequest\(`\/api\/billing\/provider\/earnings/);
  assert.match(source, /protectedBillingRequest\(`\/api\/billing\/business/);
});
