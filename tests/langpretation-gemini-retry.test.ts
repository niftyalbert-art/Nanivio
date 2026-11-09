import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

// Actual adapter, fixture credentials and transport only: no live provider use.
const bundle = await build({
  entryPoints: ['src/server/langpretationGemini.ts'],
  bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent',
});
function fixture(reply: (request: any, count: number) => Promise<Response> | Response,
  signals: Pick<typeof AbortSignal, 'any' | 'timeout'> = AbortSignal) {
  const requests: any[] = [];
  const context = vm.createContext({
    module: { exports: {} }, Buffer, AbortSignal: signals, Response, setTimeout, clearTimeout,
    process: { env: { GEMINI_API_KEY: 'offline-fixture-only',
      LANGPRETATION_GEMINI_MODEL: 'gemini-3.6-flash' } },
    console: { warn() {} },
    fetch: async (url: string, options: any) => {
      const request = { url, ...options };
      requests.push(request);
      return reply(request, requests.length);
    },
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  return { api: (context.module as any).exports, requests };
}
const rejected = (status: number) => new Response(JSON.stringify({
  error: { status: status === 503 ? 'UNAVAILABLE' : 'RESOURCE_EXHAUSTED' },
}), { status });
const translated = () => new Response(JSON.stringify({
  candidates: [{ finishReason: 'STOP', content: { parts: [
    { text: JSON.stringify({ text: 'Hello' }) },
  ] } }],
}));
function speech() {
  const audio = Buffer.alloc(46);
  audio.write('RIFF');
  return new Response(JSON.stringify({
    candidates: [{ finishReason: 'STOP', content: { parts: [
      { inlineData: { data: audio.toString('base64'), mimeType: 'audio/wav' } },
    ] } }],
  }));
}

for (const operation of ['text', 'speech']) {
  const invoke = (api: any, signal?: AbortSignal) => operation === 'text'
    ? api.translateGeminiText('مرحبا', 'ar', 'en', signal)
    : api.synthesizeGeminiAudio('مرحبا', 'ar', signal);
  test(`${operation}: transient 503 retries the same request within the same deadline`, async () => {
    let cancelled = false;
    const f = fixture((_request, count) => count === 1
      ? new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 503 })
      : operation === 'text' ? translated() : speech());
    await invoke(f.api);
    assert.equal(f.requests.length, 2);
    assert.equal(cancelled, true);
    assert.equal(f.requests[0].url, f.requests[1].url);
    assert.equal(f.requests[0].body, f.requests[1].body);
    assert.equal(f.requests[0].signal, f.requests[1].signal);
    if (operation === 'speech') {
      const body = JSON.parse(f.requests[1].body);
      assert.deepEqual(body.generationConfig.speechConfig.voiceConfig, { voice: 'Kore' });
    }
  });
  test(`${operation}: persistent 503 stops after two attempts`, async () => {
    const f = fixture(() => rejected(503));
    await assert.rejects(() => invoke(f.api), (error: any) =>
      error.status === 502 && error.diagnostic.upstreamHttpStatus === 503);
    assert.equal(f.requests.length, 2);
  });
  for (const status of [400, 401, 403, 429]) {
    test(`${operation}: HTTP ${status} is not retried`, async () => {
      const f = fixture(() => rejected(status));
      await assert.rejects(() => invoke(f.api));
      assert.equal(f.requests.length, 1);
    });
  }
  test(`${operation}: cancellation during backoff stops the second attempt`, async () => {
    const controller = new AbortController();
    const f = fixture(() => {
      setTimeout(() => controller.abort(), 20);
      return rejected(503);
    });
    await assert.rejects(() => invoke(f.api, controller.signal),
      (error: any) => error.status === 499 && error.diagnostic.failure === 'cancelled');
    assert.equal(f.requests.length, 1);
  });
  test(`${operation}: original deadline also bounds backoff`, async () => {
    const f = fixture(() => rejected(503), {
      any: AbortSignal.any.bind(AbortSignal),
      timeout: () => AbortSignal.timeout(20),
    });
    await assert.rejects(() => invoke(f.api),
      (error: any) => error.status === 504 && error.diagnostic.failure === 'timeout');
    assert.equal(f.requests.length, 1);
  });
  test(`${operation}: ambiguous transport failures are not retried`, async () => {
    const f = fixture(() => { throw new Error('fixture network failure'); });
    await assert.rejects(() => invoke(f.api),
      (error: any) => error.status === 502 && error.diagnostic.failure === 'transport');
    assert.equal(f.requests.length, 1);
  });
}
