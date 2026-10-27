import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import { createClient } from 'redis';
import express from 'express';
import { createLiveAvatarService, liveAvatarRequest, AI_DISCLOSURE } from '../src/server/assistant/liveAvatarService.ts';
import { redisSessionStore, AssistantError, MAX_SESSION_MS } from '../src/server/assistant/redisStore.ts';
import { registerAssistantRoutes } from '../src/server/assistant/routes.ts';
import { wavToPcm24k } from '../src/server/assistant/pcm.ts';
import { startLocalMalviWakeWord } from '../src/lib/localMalviWakeWord.ts';
import { deliverMalviAudio } from '../src/lib/malviLiveClient.ts';

test('real Redis enforces shared LiveAvatar rate, ownership, deadlines and cleanup', async t => {
  let binary: string;
  try { binary = execFileSync('which', ['redis-server'], { encoding: 'utf8' }).trim(); }
  catch { t.skip('Install redis-server to run the real Redis integration regression.'); return; }
  const port = await new Promise<number>(resolve => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => { const port = (server.address() as net.AddressInfo).port; server.close(() => resolve(port)); });
  });
  const child = spawn(binary, ['--port', String(port), '--bind', '127.0.0.1', '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
  const redis = createClient({ url: `redis://127.0.0.1:${port}`, socket: { reconnectStrategy: false }, disableOfflineQueue: true });
  redis.on('error', () => {});
  try {
    for (let attempt = 0; ; attempt++) {
      try { await redis.connect(); break; }
      catch (error) { if (attempt >= 40) throw error; await new Promise(r => setTimeout(r, 50)); }
    }
    const store = redisSessionStore(redis);
    await t.test('admin voice policy persists across stores without session expiration', async () => {
      assert.equal(await store.getVoiceProvider(), null);
      await store.setVoiceProvider('gemini');
      assert.equal(await redisSessionStore(redis).getVoiceProvider(), 'gemini');
      assert.equal(await redis.ttl('nanivio:{assistant}:voice-provider'), -1);
      await store.setVoiceProvider('elevenlabs');
      assert.equal(await redisSessionStore(redis).getVoiceProvider(), 'elevenlabs');
    });
    let now = 1_000_000, nextId = 0, creates = 0;
    const stopped: string[] = [];
    const service = createLiveAvatarService({
      store: async () => store, now: () => now, uuid: () => `fixture-${++nextId}`,
      provider: async (path, body: any) => {
        if (path.endsWith('/token')) {
          creates++;
          assert.equal(body.mode, 'LITE'); assert.equal(body.video_settings.quality, 'high');
          assert.equal(body.max_session_duration, MAX_SESSION_MS / 1000);
          assert.equal(body.avatar_persona, undefined); assert.equal(body.voice_agent, undefined);
          return { session_id: `provider-${nextId}`, session_token: 'fixture-ephemeral-token' };
        }
        stopped.push(body.session_id);
        return null;
      },
    });
    await t.test('voice-only sessions share real Redis limits and never contact LiveAvatar', async () => {
      assert.equal(await store.ping(), true);
      const before = creates, stopsBefore = stopped.length;
      const voice = await service.create('voice-owner', 'fr', 'VOICE_TEST');
      assert.equal(voice.mode, 'VOICE_TEST');
      assert.equal('sessionToken' in voice, false);
      assert.equal((await service.owned('voice-owner', voice.id)).mode, 'VOICE_TEST');
      await assert.rejects(service.create('voice-owner'), (e: AssistantError) => e.code === 'SESSION_ACTIVE');
      await assert.rejects(service.owned('another-user', voice.id), (e: AssistantError) => e.status === 404);
      await service.stop('voice-owner', voice.id);
      assert.equal(await store.get(voice.id), null);
      for (let i = 1; i < 10; i++) {
        const next = await service.create('voice-owner', 'en', 'VOICE_TEST');
        await service.stop('voice-owner', next.id);
      }
      await assert.rejects(service.create('voice-owner', 'en', 'VOICE_TEST'), (e: AssistantError) => e.status === 429);
      const idle = await service.create('voice-idle', 'en', 'VOICE_TEST');
      now += 60_001;
      await service.sweep();
      assert.equal(await store.get(idle.id), null);
      assert.equal(creates, before);
      assert.equal(stopped.length, stopsBefore);
    });
    await t.test('parallel initializations reserve only one session for an account', async () => {
      const outcomes = await Promise.allSettled(Array.from({ length: 8 }, () => service.create('parallel-user')));
      assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
      assert.equal(outcomes.filter(x => x.status === 'rejected' && x.reason.status === 409).length, 7);
      const session = (outcomes.find(x => x.status === 'fulfilled') as PromiseFulfilledResult<any>).value;
      await service.stop('parallel-user', session.id);
    });
    await t.test('10 starts are allowed, the eleventh is refused without provider work', async () => {
      for (let i = 0; i < 10; i++) { const s = await service.create('rate-user'); await service.stop('rate-user', s.id); }
      const before = creates;
      await assert.rejects(service.create('rate-user'), (e: AssistantError) => e.status === 429 && e.retryAfter === 3600);
      assert.equal(creates, before);
      now += 3_600_001;
      const session = await service.create('rate-user'); await service.stop('rate-user', session.id);
    });
    await t.test('another account cannot read, extend or stop a session', async () => {
      const session = await service.create('owner');
      await assert.rejects(service.owned('intruder', session.id), (e: AssistantError) => e.status === 404);
      await assert.rejects(service.activity('intruder', session.id), (e: AssistantError) => e.status === 410);
      await assert.rejects(service.stop('intruder', session.id), (e: AssistantError) => e.status === 404);
      await service.stop('owner', session.id);
    });
    await t.test('server independently stops idle sessions and stops them only once', async () => {
      const session = await service.create('idle-user'), before = stopped.length;
      now += 59_999; await service.sweep(); assert.equal(stopped.length, before);
      now += 1; await Promise.all([service.sweep(), service.sweep()]);
      assert.equal(stopped.length, before + 1);
      assert.equal(await store.get(session.id), null);
      await assert.rejects(service.activity('idle-user', session.id), (e: AssistantError) => e.status === 410);
      await service.stop('idle-user', session.id); assert.equal(stopped.length, before + 1);
    });
    await t.test('genuine explicit input extends idle but never the provider hard limit', async () => {
      const session = await service.create('active-user');
      for (let i = 0; i < 12; i++) { now += 45_000; await service.activity('active-user', session.id); }
      assert.equal((await store.get(session.id))?.deadline, session.hardDeadline);
      now = session.hardDeadline;
      await assert.rejects(service.activity('active-user', session.id), (e: AssistantError) => e.status === 410);
      await service.sweep(); assert.equal(await store.get(session.id), null);
    });
    await t.test('server-produced reply playback keeps a conversation alive beyond its first minute', async () => {
      const session = await service.create('listening-user');
      const start = now;
      now += 59_000;
      const playbackEnd = now + 90_000;
      const renewed = await service.activity('listening-user', session.id, playbackEnd);
      assert.equal(renewed.idleDeadline, playbackEnd + 60_000);
      // An overlapping user-input renewal must not shorten the reply lease.
      await service.activity('listening-user', session.id);
      assert.equal((await store.get(session.id))?.deadline, renewed.idleDeadline);
      now = start + 61_000;
      await service.sweep();
      assert.ok(await service.owned('listening-user', session.id), 'Do not sweep an active reply at one minute');
      now = playbackEnd + 59_999;
      assert.ok(await service.owned('listening-user', session.id), 'Give the user a full response window after playback');
      now = playbackEnd + 60_001;
      await service.sweep();
      assert.equal(await store.get(session.id), null, 'A genuinely unattended conversation still expires');
      await assert.rejects(service.activity('listening-user', session.id, now + 90_000),
        (e: AssistantError) => e.status === 410, 'Late output cannot revive an expired session');
    });
    await t.test('concurrent input and reply activity remains owned, monotonic and hard-capped', async () => {
      const session = await service.create('reply-owner');
      now += 30_000;
      await assert.rejects(service.activity('intruder', session.id, now + MAX_SESSION_MS),
        (e: AssistantError) => e.status === 410);
      await Promise.all([
        service.activity('reply-owner', session.id, now + 100_000),
        service.activity('reply-owner', session.id),
        service.activity('reply-owner', session.id, now + 20_000),
      ]);
      assert.equal((await store.get(session.id))?.deadline, now + 160_000);
      await service.activity('reply-owner', session.id, Number.MAX_SAFE_INTEGER);
      assert.equal((await store.get(session.id))?.deadline, session.hardDeadline);
      now = session.hardDeadline;
      await assert.rejects(service.activity('reply-owner', session.id, now + 100_000),
        (e: AssistantError) => e.status === 410);
      await service.sweep();
      assert.equal(await store.get(session.id), null);
    });
    await t.test('welcome generation has a shared one-request-per-session limit', async () => {
      const session = await service.create('welcome-user');
      const outcomes = await Promise.allSettled([service.claimWelcome(session.id), service.claimWelcome(session.id)]);
      assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
      await service.stop('welcome-user', session.id);
    });
    await t.test('provider failures release active reservation but consume rate-limit attempt', async () => {
      const broken = createLiveAvatarService({
        store: async () => store, now: () => now, uuid: () => `failed-${++nextId}`,
        provider: async () => { throw new Error('fixture provider unavailable'); },
      });
      await assert.rejects(broken.create('failed-user'));
      const session = await service.create('failed-user'); await service.stop('failed-user', session.id);
    });
    await t.test('incomplete provider token is stopped and never returned to client', async () => {
      const calls: string[] = [];
      const broken = createLiveAvatarService({
        store: async () => store, now: () => now, uuid: () => `invalid-${++nextId}`,
        provider: async (path) => { calls.push(path); return path.endsWith('/token') ? { session_id: 'incomplete-provider' } : null; },
      });
      await assert.rejects(broken.create('incomplete-user'));
      assert.deepEqual(calls, ['/v1/sessions/token', '/v1/sessions/stop']);
    });
  } finally {
    if (redis.isOpen) redis.destroy();
    child.kill('SIGTERM');
    await new Promise<void>(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', () => resolve()); });
  }
});

test('Redis failure fails closed before contacting the avatar provider', async () => {
  let contacted = false;
  const service = createLiveAvatarService({
    store: async () => { throw new Error('fixture Redis unavailable'); },
    provider: async () => { contacted = true; }, now: Date.now, uuid: () => 'unused',
  });
  await assert.rejects(service.create('user')); assert.equal(contacted, false);
});

test('provider uses official API, preserves LITE payload and sanitizes upstream errors', async () => {
  let called = false;
  const request = (async (url: any, options: any) => {
    called = true;
    assert.equal(url, 'https://api.liveavatar.com/v1/sessions/token');
    assert.equal(JSON.parse(options.body).mode, 'LITE');
    assert.ok('X-API-KEY' in options.headers);
    return new Response(JSON.stringify({ code: 1000, data: { session_id: 'fixture-id' } }));
  }) as typeof fetch;
  assert.deepEqual(await liveAvatarRequest('/v1/sessions/token', { mode: 'LITE' }, request), { session_id: 'fixture-id' });
  assert.equal(called, true);
  await assert.rejects(liveAvatarRequest('/v1/sessions/token', {}, (async () =>
    new Response(JSON.stringify({ message: 'fixture-sensitive-upstream-error' }), { status: 401 })) as typeof fetch),
  (e: Error) => !e.message.includes('fixture-sensitive-upstream-error'));
});

test('all assistant HTTP endpoints require authentication', async () => {
  const app = express(); app.use(express.json());
  registerAssistantRoutes(app, (_req, res) => { res.status(401).json({ success: false }); }, () => true, false);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}/api/assistant`;
    for (const [method, path] of [['GET', '/status'], ['POST', '/admin/voice'], ['POST', '/diagnostics'], ['POST', '/voice-session'], ['POST', '/session'], ['POST', '/session/fixture/activity'], ['POST', '/session/fixture/welcome'], ['POST', '/session/fixture/end']]) {
      assert.equal((await fetch(base + path, { method })).status, 401);
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('setup tests are administrator-only and diagnostics do not start provider sessions', async () => {
  let role = 'PERSONAL';
  const app = express(); app.use(express.json());
  registerAssistantRoutes(app, (req, _res, next) => { (req as any).authUser = { id: 'fixture', role }; next(); }, () => true, false);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}/api/assistant`;
    for (const path of ['/voice-session', '/diagnostics']) {
      const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, 'ADMIN_REQUIRED');
    }
    role = 'ADMIN';
    const data = await (await fetch(base + '/diagnostics', { method: 'POST' })).json();
    assert.equal(data.success, true);
    assert.equal(data.providerSessionStarted, false);
    assert.equal(data.avatar.readinessVerified, false);
    assert.ok(['missing', 'connected', 'unavailable'].includes(data.redis));
    assert.equal(JSON.stringify(data).includes('redis://'), false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('administrator disable blocks initialization before provider or Redis work', async () => {
  const app = express(); app.use(express.json());
  registerAssistantRoutes(app, (req, _res, next) => { (req as any).authUser = { id: 'fixture-account' }; next(); }, () => false, false);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as net.AddressInfo).port}/api/assistant/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activation: 'manual' }),
    });
    assert.equal(response.status, 403); assert.equal((await response.json()).code, 'MALVI_DISABLED');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

function wav(rate = 8000, channels = 1) {
  const data = Buffer.alloc(rate * channels * 2);
  for (let at = 0; at < data.length; at += 2) data.writeInt16LE(1000, at);
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22); header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * 2, 28); header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
test('welcome speech is resampled to raw PCM16 mono 24 kHz without WAV headers', () => {
  for (const [rate, channels] of [[8000, 1], [48000, 2]]) {
    const pcm = Buffer.from(wavToPcm24k(wav(rate, channels)), 'base64');
    assert.equal(pcm.length, 48000); assert.equal(pcm.readInt16LE(0), 1000);
  }
  assert.throws(() => wavToPcm24k(Buffer.from('MP3 fixture')), /PCM WAV/);
  assert.ok(AI_DISCLOSURE.includes('AI companion at Nanivio'));
});

test('LITE audio bridge refuses provider text/TTS and unsupported audio formats', () => {
  const received: string[] = [];
  const session = { repeatAudio: (audio: string) => { received.push(audio); } };
  deliverMalviAudio(session, { pcm24k: 'fixture-pcm', sampleRate: 24000, channels: 1, format: 'pcm_s16le' });
  assert.deepEqual(received, ['fixture-pcm']);
  assert.throws(() => deliverMalviAudio(session, { pcm24k: 'fixture', sampleRate: 16000, channels: 1, format: 'wav' }));
});

test('wake word is on-device only; unsupported browsers never fall back to cloud recognition', async () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let instance: any, starts = 0, stopped = 0, wakes = 0;
  class Recognition {
    static async available() { return 'available'; }
    processLocally = false;
    onresult: any; onerror: any; onend: any; onstart: any;
    constructor() { instance = this; }
    start() { assert.equal(this.processLocally, true); starts++; this.onstart?.(); }
    abort() { stopped++; }
  }
  Object.defineProperty(Recognition.prototype, 'processLocally', { value: false, writable: true });
  try {
    // A legacy prefixed cloud recognizer lacks the required on-device API.
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { webkitSpeechRecognition: class {} } });
    await assert.rejects(startLocalMalviWakeWord(() => wakes++, () => {}), /No|no cloud/);
    assert.equal(starts, 0);
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { SpeechRecognition: Recognition } });
    const stop = await startLocalMalviWakeWord(() => wakes++, () => {});
    assert.equal(starts, 1);
    const result: any = [{ transcript: 'Hello assistant' }]; result.isFinal = true;
    instance.onresult({ resultIndex: 0, results: [result] }); assert.equal(wakes, 0);
    result[0].transcript = 'Nanivio';
    instance.onresult({ resultIndex: 0, results: [result] });
    assert.equal(wakes, 1); assert.equal(stopped, 1);
    stop();
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else delete (globalThis as any).window;
  }
});
