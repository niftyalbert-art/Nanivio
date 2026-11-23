import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnamAvatarProvider } from '../src/server/assistant/anamAvatar';
import { createLiveAvatarService, liveAvatarService } from '../src/server/assistant/liveAvatarService';
import { AssistantError } from '../src/server/assistant/redisStore';
import { registerAssistantRoutes } from '../src/server/assistant/routes';
import express from 'express';

const connection = {
  sessionId: 'anam-provider-session', engineHost: 'fixture.anam.ai',
  engineProtocol: 'https', signallingEndpoint: '/signal',
  clientConfig: { heartbeatIntervalSeconds: 5, maxWsReconnectionAttempts: 0, iceServers: [] },
};

test('Anam gets only bounded audio passthrough; token is spent server-side once', async () => {
  const calls: any[] = [];
  const provider = createAnamAvatarProvider(async (url, options) => {
    calls.push({ url, ...options, body: JSON.parse(String(options?.body)) });
    return Response.json(calls.length === 1 ? { sessionToken: 'fixture-token' } : connection);
  }, { ANAM_API_KEY: 'fixture-key', ANAM_AVATAR_ID: 'custom-malvi' });
  const result = await provider.create(37.9);
  assert.equal(result.providerId, connection.sessionId);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.anam.ai/v1/auth/session-token');
  assert.equal(calls[1].url, 'https://api.anam.ai/v1/engine/session');
  assert.equal(calls[0].headers.Authorization, 'Bearer fixture-key');
  assert.equal(calls[1].headers.Authorization, 'Bearer fixture-token');
  assert.deepEqual(calls[0].body, {
    maxSessions: 1, expiresInSeconds: 120,
    personaConfig: { avatarId: 'custom-malvi', avatarModel: 'cara-4.1-express',
      enableAudioPassthrough: true, maxSessionLengthSeconds: 37 },
    sessionOptions: { dataRetention: { recording: false, transcripts: false } },
  });
  assert.deepEqual(calls[1].body, {}, 'No browser persona, brain or voice override');
});

test('Anam failures are sanitized without retries or fallback', async () => {
  let calls = 0;
  const provider = createAnamAvatarProvider(async () => {
    calls++;
    return Response.json({ error: 'sensitive upstream detail' }, { status: 401 });
  }, { ANAM_API_KEY: 'fixture-key', ANAM_AVATAR_ID: 'custom' });
  await assert.rejects(provider.create(10), error =>
    error instanceof AssistantError && error.message.includes('401') && !error.message.includes('sensitive'));
  assert.equal(calls, 1);
});

test('Anam reports a known startup limit safely without retrying an engine start', async () => {
  let calls = 0;
  const provider = createAnamAvatarProvider(async () => {
    calls++;
    return calls === 1 ? Response.json({ sessionToken: 'fixture-token' })
      : Response.json({ error: 'Spend cap reached', message: 'private upstream metadata' },
        { status: 429, headers: { 'Retry-After': '12' } });
  }, { ANAM_API_KEY: 'fixture-key', ANAM_AVATAR_ID: 'custom' });
  await assert.rejects(provider.create(30), error =>
    error instanceof AssistantError && error.status === 429 && error.code === 'ANAM_SPEND_CAP'
      && error.retryAfter === 12 && error.message.includes('stream startup')
      && !error.message.includes('private'));
  assert.equal(calls, 2, 'One token request and one failed start, no automatic retry');
});

function serviceFixture() {
  let now = 1000;
  let saved: any;
  let failedStop = false;
  const calls: string[] = [];
  const store = {
    reserve: async () => { calls.push('reserve'); },
    save: async (record: any) => { saved = { ...record }; },
    get: async () => saved,
    claimStop: async () => saved,
    release: async () => { calls.push('release'); saved = undefined; },
    due: async () => ['fixture-session'],
  };
  const anam = {
    create: async (seconds: number) => {
      calls.push(`anam-create:${seconds}`);
      return { providerId: connection.sessionId, sessionToken: 'spent-fixture-token', connection };
    },
    stop: async (id: string) => { calls.push(`anam-stop:${id}`); if (failedStop) throw Error('Unavailable'); },
  };
  const usage = {
    reserve: async () => { calls.push('escrow'); return 25; },
    finish: async () => { calls.push('settle'); }, confirm: async () => {},
  };
  const service = createLiveAvatarService({
    store: async () => store as any, now: () => now, uuid: () => 'fixture-session', usage,
    avatarProvider: () => 'anam', anam,
    provider: async () => { throw Error('Unexpected HeyGen fallback'); },
  });
  return { service, store, calls, get saved() { return saved; },
    advance() { now += 60_000; }, failStop() { failedStop = true; } };
}

test('Anam server cleanup retains billing and ownership protection', async () => {
  const f = serviceFixture();
  const info = await f.service.create('owner');
  assert.equal(info.renderer, 'anam');
  assert.equal(f.saved.providerId, connection.sessionId);
  assert.equal(f.saved.anamConnection, connection);
  assert.deepEqual(f.calls, ['reserve', 'escrow', 'anam-create:25']);
  await assert.rejects(f.service.stop('other-owner', info.id), /not found/);
  await f.service.stop('owner', info.id);
  assert.deepEqual(f.calls.slice(-3), [`anam-stop:${connection.sessionId}`, 'settle', 'release']);
});

test('Anam idle sweep stops the registered provider without browser cooperation', async () => {
  const f = serviceFixture();
  await f.service.create('owner');
  f.advance();
  await f.service.sweep();
  assert.deepEqual(f.calls.slice(-3), [`anam-stop:${connection.sessionId}`, 'settle', 'release']);
});

test('Unconfirmed Anam stop never releases or settles the reserved session', async () => {
  const f = serviceFixture();
  const info = await f.service.create('owner');
  f.failStop();
  await assert.rejects(f.service.stop('owner', info.id), /Unavailable/);
  assert.ok(f.saved);
  assert.ok(!f.calls.includes('settle'));
  assert.ok(!f.calls.includes('release'));
});

test('Failed persistence of a started Anam session stops it before refund/release', async () => {
  const f = serviceFixture();
  const save = f.store.save;
  let calls = 0;
  f.store.save = async r => { if (++calls === 2) throw Error('save failed'); await save(r); };
  await assert.rejects(f.service.create('owner'), /save failed/);
  assert.deepEqual(f.calls.slice(-3), [`anam-stop:${connection.sessionId}`, 'settle', 'release']);
});

test('SDK connection handoff requires an owned live Nanivio cookie session', async () => {
  const app = express();
  app.use(express.json());
  const previous = liveAvatarService.owned;
  let ownerChecks = 0;
  liveAvatarService.owned = async (user, id) => {
    ownerChecks++;
    assert.equal(user, 'fixture-owner');
    if (id !== '11111111-1111-4111-8111-111111111111') throw new AssistantError(404, 'NOT_FOUND', 'Not found');
    return { avatarProvider: 'anam', anamConnection: connection } as any;
  };
  registerAssistantRoutes(app, (req, res, next) => {
    assert.equal(req.headers.authorization, undefined, 'Anam bearer must not become Nanivio authentication');
    if (req.headers.cookie !== 'fixture=session') return res.status(401).json({ success: false });
    (req as any).authUser = { id: 'fixture-owner' }; next();
  }, () => true, false);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/assistant/session`;
  const path = '/11111111-1111-4111-8111-111111111111/anam/v1/engine/session';
  try {
    const denied = await fetch(base + path, { method: 'POST', headers: { Authorization: 'Bearer fixture-anam' } });
    assert.equal(denied.status, 401); assert.equal(ownerChecks, 0);
    const allowed = await fetch(base + path, { method: 'POST', headers: {
      Authorization: 'Bearer fixture-anam', Cookie: 'fixture=session',
      'Content-Type': 'application/json',
    }, body: JSON.stringify({ personaConfig: { avatarId: 'untrusted' } }) });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), connection);
    const crossOwner = await fetch(base + '/22222222-2222-4222-8222-222222222222/anam/v1/engine/session',
      { method: 'POST', headers: { Cookie: 'fixture=session' } });
    assert.equal(crossOwner.status, 404);
  } finally {
    liveAvatarService.owned = previous;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
