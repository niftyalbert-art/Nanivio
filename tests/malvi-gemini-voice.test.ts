import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { malviVoiceSetup, parseMalviVoiceProvider } from '../src/server/assistant/malviVoiceConfig.ts';
import { GeminiNativeVoice } from '../src/server/assistant/geminiNativeVoice.ts';
import { estimatedMalviCaptionTrack, malviCaptionAt, MalviCaptionPlayer } from '../src/lib/malviSpeechTiming.ts';
import { registerAssistantRoutes } from '../src/server/assistant/routes.ts';
import { liveAvatarService } from '../src/server/assistant/liveAvatarService.ts';

test('voice choice is explicit, defaults to ElevenLabs, and native mode never requires its credentials', () => {
  assert.equal(malviVoiceSetup({}).provider, 'elevenlabs');
  const env = { GEMINI_API_KEY: 'fixture', MALVI_VOICE_PROVIDER: 'gemini' };
  const native = malviVoiceSetup(env);
  assert.equal(native.provider, 'gemini');
  assert.equal(native.configured, true);
  assert.equal(native.captionTiming, 'estimated');
  assert.equal(JSON.stringify(native).includes('fixture'), false);
  assert.equal(malviVoiceSetup({ ...env, MALVI_TTS_TRANSPORT: 'invalid' }).configured, true);
  assert.equal(malviVoiceSetup({ ...env, GEMINI_API_KEY: undefined }).configured, false);
  assert.equal(malviVoiceSetup({ ...env, MALVI_BRAIN_PROVIDER: 'openai' }).configured, false);
  assert.equal(malviVoiceSetup({ ...env, MALVI_VOICE_PROVIDER: 'other' }).configured, false);
  assert.throws(() => parseMalviVoiceProvider({}), /Choose/);
  assert.throws(() => parseMalviVoiceProvider('auto'), /Choose/);
  assert.equal(parseMalviVoiceProvider('gemini'), 'gemini');
  assert.ok(native.supportedLanguages.includes('ak'));
  assert.ok(!native.supportedLanguages.includes('tw-ak'), 'Do not silently map a dialect to Akan');
});

test('native turn retains exact PCM, bounded transcript and honest estimated caption metadata', () => {
  const output = new GeminiNativeVoice();
  const a = Buffer.alloc(24000, 1), b = Buffer.alloc(24000, 2);
  output.append(a.toString('base64'), 'audio/pcm;rate=24000');
  output.append(b.toString('base64'), 'audio/pcm;rate=24000');
  const result = output.finish('Hello from Malvi')!;
  assert.equal(result.pcm24k, Buffer.concat([a, b]).toString('base64'));
  assert.equal(result.durationMs, 1000);
  assert.equal(result.captionTiming, 'estimated');
  assert.equal(output.finish(''), null, 'Duplicate completion emits no audio');
  output.append(a.toString('base64'), 'audio/pcm;rate=24000');
  output.cancel();
  assert.equal(output.finish(''), null, 'Interrupted PCM cannot be played later');
});

test('native output rejects incomplete, malformed or oversized responses and enforces usage limits', () => {
  for (const mime of ['audio/pcm;rate=16000', 'audio/mp3', 'audio/pcm']) {
    assert.throws(() => new GeminiNativeVoice().append('AAAA', mime), /format/);
  }
  for (const value of ['', '???', 'AA==']) {
    assert.throws(() => new GeminiNativeVoice().append(value, 'audio/pcm;rate=24000'));
  }
  assert.throws(() => new GeminiNativeVoice().finish('No audio'), /both/);
  const pcm = Buffer.alloc(480, 1).toString('base64');
  const missingText = new GeminiNativeVoice();
  missingText.append(pcm, 'audio/pcm;rate=24000');
  assert.throws(() => missingText.finish(''), /both/);
  const turns = new GeminiNativeVoice();
  for (let i = 0; i < 30; i++) { turns.append(pcm, 'audio/pcm;rate=24000'); turns.finish('Hello'); }
  turns.append(pcm, 'audio/pcm;rate=24000');
  assert.throws(() => turns.finish('Hello'), /usage limit/);
  const large = new GeminiNativeVoice();
  large.append(Buffer.alloc(3_000_000).toString('base64'), 'audio/pcm;rate=24000');
  assert.throws(() => large.append(pcm, 'audio/pcm;rate=24000'), /safety limit/);
});

test('estimated native captions stay hidden until actual playback and stop on cancellation', () => {
  const track = estimatedMalviCaptionTrack('Hello world', 1000);
  assert.equal(malviCaptionAt(track, null), '');
  assert.equal(malviCaptionAt(track, 1000), '');
  const updates: string[] = [];
  const player = new MalviCaptionPlayer(text => updates.push(text));
  player.enqueue(track);
  assert.deepEqual(updates, []);
  player.start(() => 500, track);
  assert.equal(updates.at(-1), 'Hello');
  player.cancel();
  assert.equal(updates.at(-1), '');
  assert.throws(() => estimatedMalviCaptionTrack('', 1000));
  assert.throws(() => estimatedMalviCaptionTrack('Hello', Infinity));
});

test('authenticated session routes persist voice choice; native start bypasses ElevenLabs and legacy welcome', async () => {
  const keys = ['GEMINI_API_KEY', 'HEYGEN_API_KEY', 'AVATAR_ID', 'REDIS_URL', 'MALVI_BRAIN_PROVIDER', 'MALVI_VOICE_PROVIDER', 'ELEVENLABS_API_KEY', 'MALVI_TTS_TRANSPORT', 'REPL_ID'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const create = liveAvatarService.create, owned = liveAvatarService.owned;
  const calls: unknown[][] = [];
  const app = express(); app.use(express.json());
  registerAssistantRoutes(app, (req, _res, next) => { (req as any).authUser = { id: 'owner', role: 'ADMIN' }; next(); }, () => true, false);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  const request = (path: string, body?: object) => fetch(`http://127.0.0.1:${port}/api/assistant${path}`, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : {});
  try {
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, { GEMINI_API_KEY: 'fixture', HEYGEN_API_KEY: 'fixture', AVATAR_ID: 'fixture', REDIS_URL: 'fixture', MALVI_BRAIN_PROVIDER: 'gemini' });
    liveAvatarService.create = (async (...args: any[]) => { calls.push(args); return { id: '11111111-1111-4111-8111-111111111111' }; }) as any;
    liveAvatarService.owned = (async () => ({ speechProvider: 'gemini', language: 'en' })) as any;
    const status = await (await request('/status')).json();
    assert.equal(status.configured, false, 'Unconfigured default voice is not silently replaced');
    assert.equal(status.infrastructureConfigured, true);
    assert.equal(status.voiceOptions.find((v: any) => v.provider === 'gemini').configured, true);
    for (const path of ['/session', '/voice-session']) {
      assert.equal((await request(path, { activation: 'manual', language: 'en', speechProvider: 'gemini' })).status, 201);
      assert.equal(calls.at(-1)![4], 'gemini', 'Store chosen voice in owned Redis session');
    }
    assert.equal((await request('/session', { activation: 'manual', language: 'en', speechProvider: 'auto' })).status, 400);
    assert.equal((await request('/session', { activation: 'manual', language: 'tw-ak', speechProvider: 'gemini' })).status, 400);
    assert.equal((await request('/session', { activation: 'manual', language: 'en', speechProvider: 'elevenlabs' })).status, 503);
    assert.equal((await request('/session/11111111-1111-4111-8111-111111111111/welcome', {})).status, 409);
    process.env.MALVI_BRAIN_PROVIDER = 'openai';
    assert.equal((await request('/session', { activation: 'manual', language: 'en', speechProvider: 'gemini' })).status, 503);
    assert.equal(calls.length, 2, 'Invalid combinations create no provider sessions');
  } finally {
    liveAvatarService.create = create; liveAvatarService.owned = owned;
    for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
