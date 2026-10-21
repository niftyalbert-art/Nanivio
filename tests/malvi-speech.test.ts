import assert from 'node:assert/strict';
import test from 'node:test';
import { malviSpeechFailure } from '../src/server/assistant/malviSpeechErrors.ts';
import {
  assertMalviSpeechLanguage, createMalviSpeechQueue, createMalviSpeechSynthesizer,
  MALVI_SPEECH_MODEL, MALVI_VOICE_ID, malviSpeechSetup, MAX_SPEECH_BYTES, MAX_SPEECH_TEXT,
} from '../src/server/assistant/malviSpeech.ts';

const fixtureEnv = () => ({ ELEVENLABS_API_KEY: 'fixture-not-a-real-key', MALVI_TTS_TRANSPORT: 'direct' });
const pcm = () => new Response(Buffer.alloc(480, 12), { headers: { 'Content-Type': 'audio/pcm' } });
const signal = () => new AbortController().signal;

test('voice setup selects one transport and never exposes the key', () => {
  assert.equal(malviSpeechSetup({}).configured, false);
  const config = malviSpeechSetup(fixtureEnv());
  assert.equal(config.configured, true);
  assert.equal(config.voiceId, MALVI_VOICE_ID);
  assert.equal(config.liveVerified, false);
  assert.equal(JSON.stringify(config).includes('fixture-not-a-real-key'), false);
  assert.equal(malviSpeechSetup({ MALVI_TTS_TRANSPORT: 'connector' }).configured, false);
  assert.equal(malviSpeechSetup({ ...fixtureEnv(), MALVI_TTS_TRANSPORT: 'invalid' }).configured, false);
  assert.equal(malviSpeechSetup({ ...fixtureEnv(), ELEVENLABS_VOICE_ID: '../../other' }).configured, false);
});

test('direct speech uses the approved identity, tested model and raw PCM24k, not voice listing', async () => {
  let calls = 0;
  const speak = createMalviSpeechSynthesizer(fixtureEnv, async (url, init) => {
    calls++;
    assert.equal(url, `https://api.elevenlabs.io/v1/text-to-speech/${MALVI_VOICE_ID}?output_format=pcm_24000`);
    assert.equal(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>)['xi-api-key'], 'fixture-not-a-real-key');
    assert.ok(init?.signal);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model_id, MALVI_SPEECH_MODEL);
    assert.equal(body.text, 'Bonjour, je suis Malvi.');
    assert.equal(body.language_code, undefined, 'v2 does not support language_code');
    return pcm();
  }, async () => { throw Error('No hidden connector fallback'); });
  assert.deepEqual(await speak('Bonjour, je suis Malvi.', 'fr', signal()), Buffer.alloc(480, 12));
  assert.equal(calls, 1);
});

test('connector speech makes one cancellable request without a direct-key fallback', async () => {
  let calls = 0;
  const speak = createMalviSpeechSynthesizer(
    () => ({ REPL_ID: 'fixture-runtime', MALVI_TTS_TRANSPORT: 'connector' }),
    async () => { throw Error('No direct fallback'); },
    async (path, init) => {
      calls++;
      assert.match(path, /^\/v1\/text-to-speech\//);
      assert.ok(init.signal);
      assert.equal((init.headers as Record<string, string>)['xi-api-key'], undefined);
      return pcm();
    },
  );
  await speak('Hello.', 'en', signal());
  assert.equal(calls, 1);
});

test('unsupported languages and dialects fail before spending credits or substituting a voice', async () => {
  let calls = 0;
  const speak = createMalviSpeechSynthesizer(fixtureEnv, async () => { calls++; return pcm(); });
  for (const language of ['ak', 'tw-ak', 'fat', 'lg', 'gaa', 'ee', 'yo', 'sw']) {
    await assert.rejects(speak('Do not synthesize this.', language, signal()), /not supported.*no English or alternate voice/i);
  }
  assert.equal(assertMalviSpeechLanguage('fr').code, 'fr');
  assert.equal(calls, 0);
});

test('empty, oversized and cancelled input never reach the speech provider', async () => {
  let calls = 0;
  const speak = createMalviSpeechSynthesizer(fixtureEnv, async () => { calls++; return pcm(); });
  for (const text of ['', ' ', 'x'.repeat(MAX_SPEECH_TEXT + 1)]) {
    await assert.rejects(speak(text, 'en', signal()), /text safety limit/);
  }
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(speak('Hello.', 'en', cancelled.signal));
  assert.equal(calls, 0);
});

test('permission, quota and provider failures are explicit, sanitized and never retried', async () => {
  for (const status of [400, 401, 402, 403, 404, 406, 415, 422, 429, 500, 502]) {
    let calls = 0;
    const speak = createMalviSpeechSynthesizer(fixtureEnv, async () => {
      calls++;
      return new Response('private upstream payload', { status });
    });
    await assert.rejects(speak('Hello.', 'en', signal()), error => {
      assert.match((error as Error).message, /ElevenLabs voice is unavailable/);
      assert.ok((error as Error).message.includes(`HTTP ${status}`));
      assert.doesNotMatch((error as Error).message, /private upstream payload/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('speech errors distinguish credit failures from permissions without leaking provider messages', async () => {
  for (const field of ['code', 'status']) {
    const response = new Response(JSON.stringify({ detail: {
      [field]: 'quota_exceeded', message: 'private user speech and key fixture-secret',
    } }), { status: 401 });
    const message = await malviSpeechFailure(response);
    assert.match(message, /HTTP 401; quota_exceeded/);
    assert.match(message, /credit allowance/);
    assert.doesNotMatch(message, /private user|fixture-secret|Check the key/);
  }
  const message = await malviSpeechFailure(new Response(JSON.stringify({
    detail: { code: 'invalid_parameters', message: 'private data' },
  }), { status: 422 }));
  assert.match(message, /HTTP 422; invalid_parameters/);
});

test('unknown codes, nested validation data and gateway HTML never escape speech diagnostics', async () => {
  for (const body of [
    JSON.stringify({ detail: { code: 'fixture-secret', status: 'someone@example.test', message: 'private speech' } }),
    JSON.stringify({ detail: [{ input: 'fixture-secret', msg: 'private speech' }] }),
    '<html>fixture-secret private speech</html>',
    'fixture-secret'.repeat(1000),
  ]) {
    const message = await malviSpeechFailure(new Response(body, { status: 422 }));
    assert.match(message, /HTTP 422/);
    assert.doesNotMatch(message, /fixture-secret|someone@|private speech|<html>/);
  }
});

test('oversized and stalled provider error bodies are cancelled with a bounded diagnostic', async () => {
  let cancelled = false;
  const large = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(9000)); },
    cancel() { cancelled = true; },
  }), { status: 502 });
  assert.match(await malviSpeechFailure(large), /HTTP 502/);
  assert.equal(cancelled, true);
  cancelled = false;
  const stalled = new Response(new ReadableStream({
    start() {},
    cancel() { cancelled = true; },
  }), { status: 503 });
  assert.match(await malviSpeechFailure(stalled), /HTTP 503/);
  assert.equal(cancelled, true);
});

test('compressed audio, containers, empty PCM and odd sample sizes cannot reach LiveAvatar', async () => {
  for (const [body, type] of [
    [Buffer.from('{}'), 'application/json'], [Buffer.from('ID3xxxxx'), 'audio/mpeg'],
    [Buffer.from('RIFFxxxx'), 'audio/pcm'], [Buffer.from('OggSxxxx'), 'audio/pcm'],
    [Buffer.from('ID3xxxxx'), 'audio/pcm'], [Buffer.alloc(0), 'audio/pcm'], [Buffer.alloc(3), 'audio/pcm'],
  ] as const) {
    const speak = createMalviSpeechSynthesizer(fixtureEnv, async () =>
      new Response(body, { headers: { 'Content-Type': type } }));
    await assert.rejects(speak('Hello.', 'en', signal()), /raw PCM|invalid PCM/);
  }
});

test('stream consumption is bounded before an oversized response can be delivered', async () => {
  const speak = createMalviSpeechSynthesizer(fixtureEnv, async () =>
    new Response(Buffer.alloc(MAX_SPEECH_BYTES + 2), { headers: { 'Content-Type': 'audio/pcm' } }));
  await assert.rejects(speak('Hello.', 'en', signal()), /playback safety limit/);
});

test('speech queue serializes requests, preserves language and enforces lifetime budget', async () => {
  const received: string[] = [];
  let active = 0;
  const queue = createMalviSpeechQueue(async (text, language) => {
    active++; assert.equal(active, 1);
    assert.equal(language, 'en');
    received.push(text);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return Buffer.alloc(480);
  }, { characters: 10, turns: 2 });
  const audio = await Promise.all([queue.speak('One.', 'en'), queue.speak('Two.', 'en')]);
  assert.equal(audio.length, 2);
  assert.deepEqual(received, ['One.', 'Two.']);
  await assert.rejects(queue.speak('Third.', 'en'), /usage limit/);
  assert.equal(received.length, 2);
  queue.close();
  assert.equal(await queue.speak('Ignored.', 'en'), null);
});

test('interruption, language switches and close discard pending and late audio without retries', async () => {
  let complete: (audio: Buffer) => void = () => {};
  let requestSignal: AbortSignal | undefined;
  let calls = 0;
  const queue = createMalviSpeechQueue((_text, _language, cancellation) => {
    calls++;
    requestSignal = cancellation;
    return new Promise(resolve => { complete = resolve; });
  });
  const pending = queue.speak('Hello.', 'en');
  const queued = queue.speak('Never sent.', 'fr');
  await new Promise(resolve => setImmediate(resolve));
  queue.cancel();
  assert.equal(requestSignal?.aborted, true);
  complete(Buffer.alloc(480));
  assert.equal(await pending, null);
  assert.equal(await queued, null);
  assert.equal(calls, 1);
  queue.close();
  assert.equal(await queue.speak('Ignored.', 'en'), null);
});

test('cancelled attempts still consume the session safety budget', async () => {
  const queue = createMalviSpeechQueue(async (_text, _language, cancellation) => {
    await new Promise<void>(resolve => cancellation.addEventListener('abort', () => resolve(), { once: true }));
    throw Error('aborted');
  }, { characters: 6, turns: 1 });
  const pending = queue.speak('Hello.', 'en');
  await new Promise(resolve => setImmediate(resolve));
  queue.cancel();
  assert.equal(await pending, null);
  await assert.rejects(queue.speak('Hello.', 'en'), /usage limit/);
  queue.close();
});

test('a failed request stops queued speech before another provider request can start', async () => {
  let calls = 0;
  const queue = createMalviSpeechQueue(async () => { calls++; throw Error('fixture speech failure'); });
  const rejected = assert.rejects(queue.speak('First.', 'en'), /fixture speech failure/);
  const queued = queue.speak('Must not be sent.', 'en');
  await rejected;
  assert.equal(await queued, null);
  assert.equal(calls, 1);
  assert.equal(await queue.speak('Closed.', 'en'), null);
});
