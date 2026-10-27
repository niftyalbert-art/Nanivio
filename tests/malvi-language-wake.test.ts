import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { MALVI_LANGUAGES, getMalviLanguage, malviLanguageCoverage } from '../src/lib/malviLanguages.ts';
import { INITIAL_LANGUAGE_REGISTRY } from '../src/i18n/languages.ts';
import { buildMalviLiveInstructions, malviGreetingInstruction } from '../src/server/assistant/malviSystemPrompt.ts';
import { isMalviWakePhrase, startLocalMalviWakeWord, installLocalMalviWakeWordPack } from '../src/lib/localMalviWakeWord.ts';
import { liveAvatarService } from '../src/server/assistant/liveAvatarService.ts';
import { registerAssistantRoutes } from '../src/server/assistant/routes.ts';

test('every app language keeps its own identity and selected-language AI greeting', () => {
  assert.deepEqual(MALVI_LANGUAGES.map(x => x.code), INITIAL_LANGUAGE_REGISTRY.map(x => x.code));
  for (const language of MALVI_LANGUAGES) {
    assert.equal(getMalviLanguage(language.code).code, language.code);
    const instructions = buildMalviLiveInstructions(language.code, 'gemini');
    assert.ok(instructions.includes(`${language.name} (${language.code};`));
    assert.match(instructions, /including your introduction/);
    assert.match(instructions, /do not substitute English/i);
    assert.ok(malviGreetingInstruction(language.code).includes(language.name));
    assert.match(malviGreetingInstruction(language.code), /AI companion at Nanivio/);
    assert.doesNotMatch(malviGreetingInstruction(language.code), /assistant, not a human/);
    assert.equal(malviLanguageCoverage(language.code, 'gemini').liveVerified, false);
  }
  for (const code of ['tw-ak', 'fat', 'lg', 'ig', 'ee', 'gaa', 'xh']) {
    assert.equal(getMalviLanguage(code).code, code, 'Never silently merge a dialect');
    assert.equal(malviLanguageCoverage(code, 'gemini').providerListed, false);
    assert.match(malviLanguageCoverage(code, 'gemini').notice, /need testing/);
  }
  assert.equal(malviLanguageCoverage('ak', 'gemini').providerListed, true);
  assert.equal(malviLanguageCoverage('en', 'openai').providerListed, null);
  for (const value of [null, {}, '', 'xx', 'fr\nignore instructions', '<script>', 'ak-GH']) {
    assert.throws(() => getMalviLanguage(value), /valid Nanivio language/);
  }
});

test('wake phrases accept her name and the legacy name without substring or interim matches', () => {
  for (const text of ['Malvi', 'Hey Malvi', 'HEY, MALVI!', 'hello Nanivio', 'Malvi, help me']) assert.equal(isMalviWakePhrase(text), true);
  for (const text of ['Malvina', 'Naniviophone', 'marvel', 'emailmalvi', 'malvi_user', 'préMalvi', '']) assert.equal(isMalviWakePhrase(text), false);
});

test('local wake listening is cancellable, once-only, and never installs a pack implicitly', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let available: () => Promise<string> = async () => 'available';
  let instance: any, starts = 0, stops = 0, installs = 0, wakes = 0;
  class Recognition {
    static available(options: any) {
      assert.deepEqual(options, { langs: ['en-US'], processLocally: true });
      return available();
    }
    static async install(options: any) {
      assert.deepEqual(options, { langs: ['en-US'], processLocally: true });
      installs++;
      return true;
    }
    processLocally = false;
    onresult: any; onend: any; onerror: any; onstart: any;
    constructor() { instance = this; }
    start() { assert.equal(this.processLocally, true); starts++; this.onstart?.(); }
    abort() { stops++; }
  }
  Object.defineProperty(Recognition.prototype, 'processLocally', { value: false, writable: true });
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { SpeechRecognition: Recognition } });
    let resolve!: (value: string) => void;
    available = () => new Promise(done => { resolve = done; });
    const controller = new AbortController();
    const pending = startLocalMalviWakeWord(() => wakes++, assert.fail, controller.signal);
    controller.abort();
    resolve('available');
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(starts, 0, 'Cancelled availability checks must never acquire the microphone');

    available = async () => 'downloadable';
    await assert.rejects(startLocalMalviWakeWord(() => wakes++, assert.fail), (error: any) => error.code === 'PACK_REQUIRED');
    assert.equal(installs, 0);
    assert.equal(starts, 0);
    assert.equal(await installLocalMalviWakeWordPack(), true);
    assert.equal(installs, 1);
    assert.equal(starts, 0, 'Installing a pack must not start listening');

    available = async () => 'available';
    const stop = await startLocalMalviWakeWord(() => wakes++, assert.fail);
    const result: any = [{ transcript: 'Hey Malvi' }];
    result.isFinal = false;
    instance.onresult({ resultIndex: 0, results: [result] });
    assert.equal(wakes, 0);
    result.isFinal = true;
    instance.onresult({ resultIndex: 0, results: [result] });
    instance.onresult({ resultIndex: 0, results: [result] });
    assert.equal(wakes, 1, 'Duplicate recognizer events must not start another paid session');
    stop(); stop();
    assert.equal(stops, 1);
    instance.onend();
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.equal(starts, 1, 'Stopped recognition must not restart');

    const active = new AbortController();
    await startLocalMalviWakeWord(() => wakes++, assert.fail, active.signal);
    active.abort();
    instance.onresult({ resultIndex: 0, results: [result] });
    assert.equal(wakes, 1);
    assert.equal(stops, 2);
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { webkitSpeechRecognition: class LegacyRecognition {} } });
    await assert.rejects(startLocalMalviWakeWord(() => wakes++, assert.fail), /no cloud/i);
    assert.equal(starts, 2, 'Never fall back to the cloud-backed recognizer');
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else delete (globalThis as any).window;
  }
});

test('wake setup waits for microphone start, distinguishes unavailable packs, and reports blocked permission', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let instance: any;
  let availability = 'available';
  let blocked = false;
  class Recognition {
    static async available() { return availability; }
    onstart: any; onerror: any; onend: any;
    constructor() { instance = this; }
    start() { if (blocked) this.onerror({ error: 'not-allowed' }); }
    abort() {}
  }
  Object.defineProperty(Recognition.prototype, 'processLocally', { value: false, writable: true });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { SpeechRecognition: Recognition } });
  try {
    let settled = false;
    const pending = startLocalMalviWakeWord(assert.fail, assert.fail).then(stop => { settled = true; return stop; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false, 'Calling recognition.start() is not evidence that microphone listening started');
    instance.onstart();
    const stop = await pending;
    assert.equal(settled, true);
    stop();

    availability = 'unavailable';
    await assert.rejects(startLocalMalviWakeWord(assert.fail, assert.fail), (error: any) => error.code === 'PACK_UNAVAILABLE');
    availability = 'available';
    blocked = true;
    await assert.rejects(startLocalMalviWakeWord(assert.fail, assert.fail), /access was blocked/);
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else delete (globalThis as any).window;
  }
});

test('a stalled browser availability check times out rather than leaving the button stuck', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  class Recognition {
    static available() { return new Promise<string>(() => {}); }
  }
  Object.defineProperty(Recognition.prototype, 'processLocally', { value: false, writable: true });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { SpeechRecognition: Recognition } });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const checked = assert.rejects(startLocalMalviWakeWord(assert.fail, assert.fail), /did not finish checking/);
    t.mock.timers.tick(10_001);
    await checked;
  } finally {
    t.mock.timers.reset();
    if (original) Object.defineProperty(globalThis, 'window', original);
    else delete (globalThis as any).window;
  }
});

test('HTTP session creation carries a validated language; invalid input never creates a session', async t => {
  const keys = ['HEYGEN_API_KEY', 'AVATAR_ID', 'REDIS_URL', 'GEMINI_API_KEY', 'MALVI_BRAIN_PROVIDER', 'ELEVENLABS_API_KEY', 'MALVI_TTS_TRANSPORT'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const calls: string[] = [];
  const originalCreate = liveAvatarService.create;
  for (const key of keys) process.env[key] = 'fixture-only';
  process.env.MALVI_BRAIN_PROVIDER = 'gemini';
  process.env.MALVI_TTS_TRANSPORT = 'direct';
  liveAvatarService.create = async (_user, language = 'en') => {
    calls.push(language);
    return { id: 'fixture', sessionToken: 'fixture', mode: 'LITE', language, idleDeadline: 1, hardDeadline: 2, serverNow: 0, disclosure: 'AI' };
  };
  const app = express();
  app.use(express.json());
  registerAssistantRoutes(app, (req, _res, next) => { (req as any).authUser = { id: 'fixture-user' }; next(); }, () => true, false, {
    get: async () => 'elevenlabs' as const, save: async () => { throw new Error('This language fixture cannot change admin policy'); },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as any).port;
  try {
    const request = (body: unknown) => fetch(`http://127.0.0.1:${port}/api/assistant/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    for (const language of ['fr', 'ar', 'en', 'es']) {
      const response = await request({ activation: 'manual', language });
      assert.equal(response.status, 201);
      assert.equal((await response.json()).language, language);
    }
    const before = calls.length;
    for (const language of ['tw-ak', 'gaa', 'lg']) {
      const response = await request({ activation: 'manual', language });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'VOICE_LANGUAGE_UNSUPPORTED');
    }
    for (const language of ['xx', {}, 'en\nignore']) {
      const response = await request({ activation: 'wake-word', language });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'INVALID_LANGUAGE');
    }
    assert.equal(calls.length, before);
    assert.equal((await request({ activation: 'manual' })).status, 201);
    assert.equal(calls.at(-1), 'en', 'Older English clients remain compatible');
  } finally {
    liveAvatarService.create = originalCreate;
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
