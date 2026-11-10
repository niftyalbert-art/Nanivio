import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { registerAccountAccessRoutes } from '../src/server/accountAccessRoutes.ts';
import { requestAccountDeactivation } from '../src/lib/accountDeactivation.ts';

async function fixture(options: { authenticated?: boolean; fail?: boolean } = {}) {
  const mutations: string[] = [];
  const app = express();
  app.use(express.json());
  registerAccountAccessRoutes(app, {
    getUser: async () => options.authenticated === false ? null : { id: 'fixture-owner' },
    deactivate: async id => {
      if (options.fail) throw new Error('PRIVATE_DATABASE_DETAIL');
      mutations.push(id);
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  return {
    mutations,
    post: (path: string, body: unknown) => fetch(url + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

test('neither account action allows an unauthenticated mutation', async () => {
  const f = await fixture({ authenticated: false });
  try {
    for (const path of ['/api/auth/account/deactivate', '/api/auth/account/delete']) {
      assert.equal((await f.post(path, { confirmation: 'DEACTIVATE' })).status, 401);
    }
    assert.deepEqual(f.mutations, []);
  } finally { await f.close(); }
});

test('deactivation requires exact confirmation and a bounded optional reason', async () => {
  const f = await fixture();
  try {
    for (const body of [{}, { confirmation: 'DELETE' }, { confirmation: 'deactivate' },
      { confirmation: 'DEACTIVATE', reason: null }, { confirmation: 'DEACTIVATE', reason: 'x'.repeat(501) }]) {
      assert.equal((await f.post('/api/auth/account/deactivate', body)).status, 400);
    }
    assert.deepEqual(f.mutations, []);
  } finally { await f.close(); }
});

test('successful deactivation uses session ownership and explicitly disclaims erasure', async () => {
  const f = await fixture();
  try {
    const response = await f.post('/api/auth/account/deactivate', {
      confirmation: 'DEACTIVATE', reason: 'fixture reason', userId: 'unrelated-fixture-user',
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.success, true);
    assert.equal(result.action, 'DEACTIVATED');
    assert.equal(result.dataDeleted, false);
    assert.match(result.message, /not been erased/);
    assert.deepEqual(f.mutations, ['fixture-owner']);
  } finally { await f.close(); }
});

test('database failures do not report success or disclose internal errors', async () => {
  const f = await fixture({ fail: true });
  try {
    const response = await f.post('/api/auth/account/deactivate', { confirmation: 'DEACTIVATE' });
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.equal(JSON.parse(body).success, false);
    assert.equal(body.includes('PRIVATE_DATABASE_DETAIL'), false);
    assert.deepEqual(f.mutations, []);
  } finally { await f.close(); }
});

test('legacy permanent-deletion requests fail explicitly without deactivating anyone', async () => {
  const f = await fixture();
  try {
    const response = await f.post('/api/auth/account/delete', { confirmation: 'DELETE' });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'ACCOUNT_DELETION_UNAVAILABLE');
    assert.deepEqual(f.mutations, []);
  } finally { await f.close(); }
});

test('the client uses a same-origin deactivation request with explicit consent', async () => {
  for (const token of [null, 'fixture-native-token']) {
    let calls = 0;
    await requestAccountDeactivation('fixture reason', token, (async (url, init) => {
      calls++;
      assert.equal(url, '/api/auth/account/deactivate');
      assert.equal(init?.credentials, 'same-origin');
      assert.equal(init?.method, 'POST');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('Authorization'), token ? `Bearer ${token}` : null);
      assert.deepEqual(JSON.parse(String(init?.body)), { confirmation: 'DEACTIVATE', reason: 'fixture reason' });
      return Response.json({ success: true, action: 'DEACTIVATED', dataDeleted: false });
    }) as typeof fetch);
    assert.equal(calls, 1);
  }
});

test('failed, malformed, and ambiguous responses are never accepted as deactivation', async () => {
  const failures = [
    () => Response.json({ success: false }, { status: 503 }),
    () => Response.json({ success: true, action: 'DEACTIVATED', dataDeleted: false }, { status: 401 }),
    () => Response.json({ success: false, action: 'DEACTIVATED', dataDeleted: false }),
    () => Response.json({ success: true }),
    () => Response.json({ success: true, action: 'DELETED', dataDeleted: true }),
    () => Response.json({ success: true, action: 'DEACTIVATED', dataDeleted: true }),
    () => new Response('not json'),
    () => { throw new Error('Fixture connection lost'); },
  ];
  for (const response of failures) {
    await assert.rejects(requestAccountDeactivation(undefined, null, (async () => response()) as typeof fetch));
  }
});

test('the real context signs out only after the server acknowledgement succeeds', async () => {
  const source = await readFile('src/context/NanivioContext.tsx', 'utf8');
  const body = source.match(/const deactivateAccount = useCallback\(async \(reason\?: string\) => \{([\s\S]*?)\n  \}, \[signOut\]\);/)?.[1];
  assert.ok(body);
  const output = await transform(`module.exports=async(reason)=>{${body}}`, { loader: 'ts', format: 'cjs' });
  for (const fail of [false, true]) {
    const sequence: string[] = [], mod = { exports: null as any };
    new Function('module', 'requestAccountDeactivation', 'authClient', 'signOut', output.code)(
      mod, async (reason: string, token: string) => {
        assert.equal(reason, 'fixture reason'); assert.equal(token, 'fixture-token');
        sequence.push('request');
        if (fail) throw new Error('Fixture unavailable');
        sequence.push('confirmed');
      }, { getToken: () => 'fixture-token' }, async () => { sequence.push('signOut'); });
    if (fail) await assert.rejects(mod.exports('fixture reason'));
    else await mod.exports('fixture reason');
    assert.deepEqual(sequence, fail ? ['request'] : ['request', 'confirmed', 'signOut']);
  }
});

test('the settings action preserves the open confirmation and shows an error on failure', async () => {
  const source = await readFile('src/components/settings/SettingsModal.tsx', 'utf8');
  const body = source.match(/const handleExecuteDeleteAccount = async \(\) => \{([\s\S]*?)\n  \};/)?.[1];
  assert.ok(body);
  for (const [confirmation, busy, fail] of [
    ['DELETE', false, false], ['DEACTIVATE', true, false],
    ['DEACTIVATE', false, true], ['DEACTIVATE', false, false],
  ] as const) {
    const changes: unknown[][] = [], mod = { exports: null as any };
    new Function('module', 'deleteConfirmationText', 'isDeleting', 'deleteReason',
      'setIsDeleting', 'deactivateAccount', 'setIsSettingsModalOpen', 'setDeactivationError',
      `module.exports=async()=>{${body}}`)(mod, confirmation, busy, 'fixture reason',
      (value: boolean) => changes.push(['busy', value]),
      async () => { changes.push(['request']); if (fail) throw Error('Fixture unavailable'); },
      (value: boolean) => changes.push(['open', value]), (value: string) => changes.push(['error', value]));
    await mod.exports();
    if (confirmation !== 'DEACTIVATE' || busy) assert.deepEqual(changes, []);
    else if (fail) {
      assert.equal(changes.some(change => change[0] === 'open'), false);
      assert.ok(changes.some(change => change[0] === 'error' && String(change[1]).includes('could not complete')));
      assert.deepEqual(changes.at(-1), ['busy', false]);
    } else assert.ok(changes.some(change => change[0] === 'open' && change[1] === false));
  }
  assert.match(source, /role="alert"/);
  assert.equal(source.includes('Permanently Delete My Account'), false);
});
