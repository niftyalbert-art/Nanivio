import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { malviVoiceSetup, parseMalviVoiceProvider } from '../src/server/assistant/malviVoiceConfig.ts';
import { GeminiNativeVoice } from '../src/server/assistant/geminiNativeVoice.ts';
import { applyMalviGeminiEffects } from '../src/server/assistant/geminiVoiceEffects.ts';
import { estimatedMalviCaptionTrack, malviCaptionAt, MalviCaptionPlayer } from '../src/lib/malviSpeechTiming.ts';
import { registerAssistantRoutes } from '../src/server/assistant/routes.ts';
import { liveAvatarService } from '../src/server/assistant/liveAvatarService.ts';

test('voice defaults to the approved Gemini style, retains explicit ElevenLabs selection, and never requires its credentials in native mode', () => {
  assert.equal(malviVoiceSetup({}).provider, 'gemini');
  assert.equal(malviVoiceSetup({}).configured, false, 'Missing Gemini credentials must not silently switch voices');
  assert.equal(malviVoiceSetup({ MALVI_VOICE_PROVIDER: 'elevenlabs' }).provider, 'elevenlabs');
  const env = { GEMINI_API_KEY: 'fixture' };
  const native = malviVoiceSetup(env);
  assert.equal(native.provider, 'gemini');
  assert.equal(native.voiceId, 'Sulafat');
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

test('native turn styles joined PCM once, retains speech duration and honest estimated caption metadata', () => {
  const output = new GeminiNativeVoice();
  const a = Buffer.alloc(24000, 1), b = Buffer.alloc(24000, 2);
  output.append(a.toString('base64'), 'audio/pcm;rate=24000');
  output.append(b.toString('base64'), 'audio/pcm;rate=24000');
  const result = output.finish('Hello from Malvi')!;
  assert.equal(result.pcm24k, applyMalviGeminiEffects(Buffer.concat([a, b])).pcm.toString('base64'));
  assert.equal(result.durationMs, 1211);
  assert.equal(result.speechDurationMs, 1000);
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
  const track = estimatedMalviCaptionTrack('Hello world', 1211, 1000);
  assert.equal(malviCaptionAt(track, null), '');
  assert.equal(track.alignment.character_end_times_seconds.at(-1), 1, 'Reverb tail must not slow the spoken caption pacing');
  assert.equal(malviCaptionAt(track, 1211), '');
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
  assert.throws(() => estimatedMalviCaptionTrack('Hello', 1000, 1001));
  assert.throws(() => estimatedMalviCaptionTrack('Hello', 1000, NaN));
});

test('only admins set the global voice; every new session uses server policy without client overrides', async () => {
  const keys = ['GEMINI_API_KEY', 'HEYGEN_API_KEY', 'AVATAR_ID', 'REDIS_URL', 'MALVI_BRAIN_PROVIDER', 'MALVI_VOICE_PROVIDER', 'ELEVENLABS_API_KEY', 'MALVI_TTS_TRANSPORT', 'REPL_ID'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const create = liveAvatarService.create, owned = liveAvatarService.owned;
  const calls: unknown[][] = [];
  let role = 'ADMIN';
  let managed: 'elevenlabs' | 'gemini' = 'elevenlabs';
  const policy = { get: async () => managed, save: async (provider: 'elevenlabs' | 'gemini') => { managed = provider; } };
  const app = express(); app.use(express.json());
  registerAssistantRoutes(app, (req, _res, next) => { (req as any).authUser = { id: 'owner', role }; next(); }, () => true, false, policy);
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
    assert.equal(status.canManageVoice, true);
    assert.equal(status.voiceOptions.find((v: any) => v.provider === 'gemini').configured, true);
    assert.equal((await request('/admin/voice', { provider: 'auto' })).status, 400);
    assert.equal((await request('/admin/voice', { provider: 'elevenlabs' })).status, 503, 'Incomplete voice setup cannot be activated');
    assert.equal(managed, 'elevenlabs');
    assert.equal((await request('/admin/voice', { provider: 'gemini' })).status, 200);
    assert.equal(managed, 'gemini');
    role = 'PERSONAL';
    const userStatus = await (await request('/status')).json();
    assert.equal(userStatus.speech.provider, 'gemini');
    assert.equal(userStatus.configured, true);
    assert.equal(userStatus.canManageVoice, false);
    assert.equal(userStatus.voiceOptions, undefined, 'Ordinary users are not offered provider choices');
    for (const provider of ['elevenlabs', 'gemini', 'auto']) {
      assert.equal((await request('/admin/voice', { provider })).status, 403);
      assert.equal((await request('/session', { activation: 'manual', speechProvider: provider })).status, 403);
    }
    assert.equal(managed, 'gemini', 'Denied updates do not change policy');
    assert.equal((await request('/voice-session', { activation: 'manual' })).status, 403);
    assert.equal((await request('/session', { activation: 'manual', language: 'en' })).status, 201);
    role = 'ADMIN';
    for (const path of ['/session', '/voice-session']) {
      assert.equal((await request(path, { activation: 'manual', language: 'en' })).status, 201);
      assert.equal(calls.at(-1)![4], 'gemini', 'Store administrator-selected voice in owned Redis session');
    }
    assert.equal((await request('/session', { activation: 'manual', language: 'en', speechProvider: 'gemini' })).status, 403, 'Even admins change policy only through the admin endpoint');
    assert.equal((await request('/session', { activation: 'manual', language: 'tw-ak' })).status, 400);
    assert.equal((await request('/session/11111111-1111-4111-8111-111111111111/welcome', {})).status, 409);
    process.env.MALVI_BRAIN_PROVIDER = 'openai';
    assert.equal((await request('/session', { activation: 'manual', language: 'en' })).status, 503);
    assert.equal(calls.length, 3, 'Denied and invalid requests create no provider sessions');
  } finally {
    liveAvatarService.create = create; liveAvatarService.owned = owned;
    for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
