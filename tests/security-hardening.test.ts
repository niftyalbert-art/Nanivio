import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  createRateLimiter, timingSafeEqualString, twilioSignatureValid, websocketOriginAllowed,
} from '../src/server/httpSecurity';

const server = await readFile(new URL('../server.ts', import.meta.url), 'utf8');

function fakeRes() {
  const res: any = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
}

test('rate limiter blocks after the window maximum and resets after the window', () => {
  let now = 0;
  const limit = createRateLimiter({ windowMs: 1000, max: 2, key: () => 'a', now: () => now });
  let passed = 0;
  for (let i = 0; i < 3; i++) limit({} as any, fakeRes(), () => { passed++; });
  assert.equal(passed, 2);
  const blocked = fakeRes();
  limit({} as any, blocked, () => { passed++; });
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.code, 'RATE_LIMITED');
  now = 1001;
  limit({} as any, fakeRes(), () => { passed++; });
  assert.equal(passed, 3);
});

test('timing-safe string comparison', () => {
  assert.equal(timingSafeEqualString('secret-key', 'secret-key'), true);
  assert.equal(timingSafeEqualString('secret-kex', 'secret-key'), false);
  assert.equal(timingSafeEqualString('secret', 'secret-key'), false);
});

test('Twilio signature validation follows URL plus sorted parameters', () => {
  const url = 'https://example.com/api/telecom/webhook/status';
  const params = { CallStatus: 'completed', CallSid: 'CA1' };
  const signature = crypto.createHmac('sha1', 'tok').update(url + 'CallSidCA1CallStatuscompleted').digest('base64');
  assert.equal(twilioSignatureValid('tok', url, params, signature), true);
  assert.equal(twilioSignatureValid('tok', url, { ...params, CallStatus: 'failed' }, signature), false);
  assert.equal(twilioSignatureValid('', url, params, signature), false);
});

test('WebSocket origin must match the host or the public app URL', () => {
  assert.equal(websocketOriginAllowed('https://app.example.com', 'app.example.com'), true);
  assert.equal(websocketOriginAllowed('https://evil.example', 'app.example.com'), false);
  assert.equal(websocketOriginAllowed('https://naniviio.com', 'svc.onrender.com', 'https://naniviio.com'), true);
  assert.equal(websocketOriginAllowed('not a url', 'app.example.com'), false);
  assert.equal(websocketOriginAllowed(undefined, 'app.example.com'), true);
});

test('HTTP authentication never reads tokens from the query string', () => {
  const body = server.slice(server.indexOf('async function getAuthUser'), server.indexOf('async function requireAdmin'));
  assert.doesNotMatch(body, /req\.query\.token/);
});

test('admin middleware does not accept the master key on ordinary requests', () => {
  const body = server.slice(server.indexOf('async function requireAdmin'), server.indexOf('async function requireAuthenticatedUser'));
  assert.doesNotMatch(body, /x-admin-master-key/);
});

test('telecom control routes require admin and the status webhook is signed', () => {
  for (const route of ['app.get("/api/telecom/config", requireAdmin', 'app.get("/api/telecom/routes", requireAdmin',
    'app.post("/api/telecom/test-routing", requireAdmin', 'app.post("/api/telecom/outbound", requireAdmin']) {
    assert.ok(server.includes(route), route);
  }
  const webhook = server.slice(server.indexOf('"/api/telecom/webhook/status"'), server.indexOf('AGORA RTC VIDEO'));
  assert.match(webhook, /twilioSignatureValid/);
});

test('directory lookup requires sign-in and omits account status', () => {
  const route = server.slice(server.indexOf('app.get("/api/users/lookup"'), server.indexOf('// D. Suspend'));
  assert.match(route, /requireAuthenticatedUser/);
  assert.doesNotMatch(route, /accountStatus/);
});

test('contacts routes are defined once and all require authentication', () => {
  for (const decl of ['app.post("/api/contacts/save"', 'app.put("/api/contacts/:id"', 'app.delete("/api/contacts/:id"']) {
    assert.equal(server.split(decl).length - 1, 1, decl);
    assert.ok(server.includes(`${decl}, requireAuthenticatedUser`), decl);
  }
  assert.doesNotMatch(server, /userContactsDb/);
});

test('migration locks browser roles out of tables without RLS', async () => {
  const sql = await readFile(new URL('../migrations/035_lock_down_unprotected_tables.sql', import.meta.url), 'utf8');
  for (const table of ['nanivio_billing_state', 'nanivio_paystack_orders', 'nanivio_paystack_events', 'malvi_credit_ledger',
    'nanivio_contacts', 'nanivio_user_settings', 'nanivio_notifications', 'nanivio_usage_sessions']) {
    assert.ok(sql.includes(`'${table}'`), table);
  }
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.%I FROM anon, authenticated/);
});
