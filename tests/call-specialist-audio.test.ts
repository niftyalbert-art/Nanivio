import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createPalabraCallHandler, stagedCallPairConfigured } from '../src/server/palabraCallRoute';
import { SpeechProviderError } from '../src/server/speechProviders';

function wav() {
  const audio = Buffer.alloc(44 + 16000);
  audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28);
  audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40);
  return audio;
}
function fixture(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const handler = createPalabraCallHandler({
    userId: () => 'authenticated-speaker',
    authorize: async () => { calls.push('authorize'); },
    stagedConfigured: () => true,
    configured: () => { throw new Error('Specialist calls must not require Palabra'); },
    stagedTranslate: (async (audio: Buffer, source: string, target: string, signal: AbortSignal) => {
      calls.push('speech');
      assert.equal(audio.toString('hex'), wav().toString('hex'));
      assert.equal(source, 'en'); assert.equal(target, 'ak');
      assert.equal(signal.aborted, false);
      return { transcript: 'fixture speech', translatedTranscript: 'fixture translation',
        audioBase64: wav().toString('base64'), contentType:'audio/wav', durationSeconds:0.5 };
    }) as any,
    ...overrides,
  });
  const req: any = Object.assign(new EventEmitter(), { body: {
    sessionId:'connected-call', sourceLang:'en', targetLang:'ak', audioBase64:wav().toString('base64'),
  } });
  const res: any = Object.assign(new EventEmitter(), { code:200, body:null,
    status(code: number) { this.code = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  });
  return { handler, req, res, calls };
}
test('specialist calls send actual microphone audio through the pair-aware pipeline after authorization', async () => {
  const f = fixture(); await f.handler(f.req, f.res);
  assert.deepEqual(f.calls, ['authorize', 'speech']);
  assert.equal(f.res.code, 200); assert.equal(f.res.body.success, true);
  assert.equal(f.res.body.text, 'fixture speech');
  assert.equal(f.res.body.translatedText, 'fixture translation');
  assert.ok(f.res.body.audioBase64);
});
test('denied calls cannot invoke specialist recognition, translation, or synthesis', async () => {
  const f = fixture({ authorize: async () => { throw new Error('Denied'); } });
  await f.handler(f.req, f.res);
  assert.equal(f.res.code, 503); assert.deepEqual(f.calls, []);
});
test('missing specialist configuration is explicit and never silently changes provider', async () => {
  const f = fixture({ stagedConfigured: () => false });
  await f.handler(f.req, f.res);
  assert.equal(f.res.code, 503); assert.deepEqual(f.calls, ['authorize']);
  assert.match(f.res.body.error, /not configured/);
});
test('unsupported dialect translation and same-language calls cannot spend speech credits', async () => {
  for (const target of ['tw-ak', 'en']) {
    const f = fixture(); f.req.body.targetLang = target;
    await f.handler(f.req, f.res);
    assert.equal(f.res.code, 400); assert.deepEqual(f.calls, []);
  }
});
test('specialist speech failures return a safe error rather than success or a synthetic fallback', async () => {
  const f = fixture({ stagedTranslate: async () => { throw new SpeechProviderError(504, 'Speech timed out.'); } });
  await f.handler(f.req, f.res);
  assert.equal(f.res.code, 504); assert.equal(f.res.body.success, false);
  assert.equal(f.res.body.audioBase64, undefined);
});
test('one specialist phrase per account is enforced and released after processing stops', async () => {
  let finish!:()=>void;
  const first = fixture({ stagedTranslate: async () => {
    await new Promise<void>(resolve => { finish = resolve; });
    throw new SpeechProviderError(499, 'Stopped.');
  } });
  const pending = first.handler(first.req, first.res);
  await new Promise(resolve => setImmediate(resolve));
  const second = fixture();
  await second.handler(second.req, second.res);
  assert.equal(second.res.code,429);
  assert.deepEqual(second.calls,['authorize']);
  finish(); await pending;
  const next = fixture(); await next.handler(next.req,next.res);
  assert.equal(next.res.code,200);
});
test('Twi–English combined readiness does not depend on Gemini credentials', t => {
  const keys = ['GEMINI_API_KEY', 'KHAYA_API_KEY'] as const;
  const saved = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  delete process.env.GEMINI_API_KEY; process.env.KHAYA_API_KEY = 'fixture-only';
  assert.equal(stagedCallPairConfigured('en', 'ak'), true);
  assert.equal(stagedCallPairConfigured('ak', 'en'), true);
  assert.equal(stagedCallPairConfigured('en', 'tw-ak'), false);
});
