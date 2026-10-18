import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhoneVerificationDiagnosticStore } from '../src/server/phoneVerificationDiagnostics';
import { createPhoneVerificationAdminRouter } from '../src/server/phoneVerificationAdminRouter';
import { PhoneVerificationDiagnosticsView } from '../src/components/admin/AdminPhoneVerificationDiagnostics';

test('operational history is bounded, expires, returns copies and excludes unapproved payload fields', () => {
  let now = 1_000_000;
  const store = new PhoneVerificationDiagnosticStore(() => now);
  const privateValue = 'private-phone-key-code-body';
  store.record({
    provider: 'prelude', status: 401, code: 'invalid_api_key', operation: 'send',
    requestId: privateValue, message: privateValue, phone: privateValue, key: privateValue,
  } as any);
  assert.equal(JSON.stringify(store.snapshot()).includes(privateValue), false);
  assert.match(store.snapshot().events[0].message, /configuration needs administrator/);
  store.snapshot().events[0].code = 'mutation';
  assert.equal(store.snapshot().events[0].code, 'invalid_api_key');
  for (let i = 0; i < 110; i++) {
    now++;
    store.record({ provider: 'prelude', status: 400, code: 'insufficient_balance', operation: 'check' });
  }
  const snapshot = store.snapshot();
  assert.equal(snapshot.events.length, 100);
  assert.equal(snapshot.storage, 'process-local');
  assert.equal(snapshot.events[0].createdAt, new Date(now).toISOString());
  now += 24 * 3_600_000;
  assert.equal(store.snapshot().events.length, 0);
});

test('admin endpoint rejects anonymous/ordinary users, disables caching and returns private diagnostics to admins', async t => {
  const store = new PhoneVerificationDiagnosticStore();
  store.record({ provider: 'prelude', status: 401, code: 'invalid_api_key', operation: 'send' });
  const app = express();
  // Test-only substitute for application session validation; no bypass ships in the app.
  app.use('/api/admin/phone-verification', createPhoneVerificationAdminRouter((req, res, next) => {
    if (req.headers['x-test-role'] !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Administrative authorization required.' });
      return;
    }
    next();
  }, store));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/phone-verification/diagnostics`;
  for (const role of ['', 'PERSONAL']) {
    const response = await fetch(url, { headers: { 'x-test-role': role } });
    assert.equal(response.status, 403);
    assert.match(response.headers.get('cache-control') || '', /private, no-store/);
    assert.doesNotMatch(await response.text(), /invalid_api_key|events|requestId/);
  }
  const response = await fetch(url, { headers: { 'x-test-role': 'ADMIN' } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') || '', /private, no-store/);
  const body = await response.json();
  assert.equal(body.diagnostics.events[0].code, 'invalid_api_key');
  assert.equal(body.diagnostics.events[0].status, 401);
  assert.equal(body.diagnostics.events[0].operation, 'send');
  const serverSource = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  assert.match(serverSource, /app\.use\("\/api\/admin\/phone-verification", createPhoneVerificationAdminRouter\(requireAdmin\)\)/);
});

test('admin view renders diagnostic, empty, loading and failure states without claiming successful delivery', () => {
  const store = new PhoneVerificationDiagnosticStore();
  const render = (diagnostics: any, loading = false, error = '') => renderToStaticMarkup(
    React.createElement(PhoneVerificationDiagnosticsView, { diagnostics, loading, error, onRefresh: () => {} }),
  );
  assert.match(render(null, true), /Loading verification diagnostics/);
  assert.match(render(null, false, 'Unable to load'), /role="alert"/);
  assert.match(render(store.snapshot()), /does not confirm successful SMS delivery/);
  const id = '3d19215e-2991-4a05-a41a-527314e6ff6a';
  store.record({ provider: 'prelude', status: 401, code: 'invalid_api_key', requestId: id, operation: 'send' });
  const html = render(store.snapshot());
  for (const text of ['Refresh diagnostics', 'invalid_api_key', 'HTTP 401', 'Send code', id, 'clears when the server restarts']) {
    assert.ok(html.includes(text));
  }
  const audit = readFileSync(new URL('../src/components/admin/AdminAuditTrail.tsx', import.meta.url), 'utf8');
  assert.match(audit, /<AdminPhoneVerificationDiagnostics \/>/);
});
