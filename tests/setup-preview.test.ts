import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import WebSocket from 'ws';
import { createSetupPreview, rejectSetupRealtime } from '../src/server/setupPreview.ts';

test('setup preview serves an honest setup page and fails closed for APIs and realtime', async () => {
  const server = http.createServer(createSetupPreview());
  rejectSetupRealtime(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.match(await page.text(), /Configuration required/);
    for (const route of ['/api/health', '/api/auth/login', '/api/agora/token', '/api/translate', '/api/billing/langpretation/record-usage']) {
      for (const method of ['GET', 'POST']) {
        const response = await fetch(`${base}${route}`, { method });
        assert.equal(response.status, 503, `${method} ${route}`);
        assert.equal((await response.json()).status, 'setup_required');
      }
    }
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(`${base.replace('http:', 'ws:')}/ws`);
      const timeout = setTimeout(() => { socket.terminate(); reject(new Error('WebSocket rejection timed out')); }, 3000);
      socket.on('error', (error) => {
        clearTimeout(timeout);
        try { assert.match(error.message, /503/); resolve(); } catch (failure) { reject(failure); }
      });
      socket.on('open', () => { clearTimeout(timeout); socket.close(); reject(new Error('Setup preview allowed realtime')); });
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
