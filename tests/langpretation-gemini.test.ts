import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { LANGUAGE_CODES, planTranslation, speechProvider, mtProvider } from '../src/lib/translator-engine/languagePlan.ts';

// Bundle the actual server modules into an isolated runtime with fixture-only
// configuration and a stubbed gateway. Never read real keys or send requests.
const [speechBundle, translationBundle] = await Promise.all([
  'src/server/speechProviders.ts', 'src/server/translationRouter.ts',
].map(entry => build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent' })));

function fixture(bundle: typeof speechBundle, reply: (request: any) => Response | Promise<Response>, configured = true,
  env:Record<string,string> = {}, signals:Pick<typeof AbortSignal,'any'|'timeout'> = AbortSignal) {
  const requests: any[] = [];
  const warnings: any[] = [];
  const context = vm.createContext({
    module: { exports: {} }, Buffer, AbortSignal:signals, Response, URL, FormData, Blob, setTimeout, clearTimeout,
    process: { env: configured ? { GEMINI_API_KEY: 'fixture-only', ...env } : {} },
    console: { warn(...args: unknown[]) { warnings.push(args); } },
    fetch: async (url: string, options: any) => {
      const request = { url, ...options, json: JSON.parse(options.body) };
      requests.push(request);
      assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-/);
      assert.equal(options.headers['x-goog-api-key'], 'fixture-only');
      return reply(request);
    },
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  return { api: (context.module as any).exports, requests, warnings };
}
const textResult = (text: string) => new Response(JSON.stringify({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ text }) }] } }],
}));
function wav() {
  const bytes = Buffer.alloc(44 + 3200);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(3200, 40);
  return bytes;
}
function audioResult(audio = wav(), mimeType = 'audio/wav') {
  return new Response(JSON.stringify({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { data: audio.toString('base64'), mimeType } }] } }],
  }));
}

test('all 324 plans remove Azure dependencies without changing specialist speech routes or inventing Akuapem coverage', () => {
  const global = ['en', 'fr', 'es', 'ar', 'de', 'it', 'pt', 'zh', 'ja', 'ko'];
  for (const language of global) {
    assert.equal(speechProvider(language), 'gemini');
    assert.equal(mtProvider(language), 'gemini');
  }
  for (const language of ['ak', 'tw-ak', 'fat', 'ee', 'gaa', 'ha']) assert.equal(speechProvider(language), 'khaya');
  for (const language of ['sw', 'lg']) assert.equal(speechProvider(language), 'sunbird');
  for (const source of LANGUAGE_CODES) for (const target of LANGUAGE_CODES) {
    assert.ok(planTranslation(source, target).hops.every(h => h.provider !== ('azure' as any)));
  }
  // The released language plan already supports this route.
  assert.equal(planTranslation('tw-ak', 'en').supported, true);
});

test('global recognition uses real audio via Gemini without Azure configuration or fabricated confidence', async () => {
  const f = fixture(speechBundle, () => textResult('Bonjour.'));
  for (const language of ['en', 'fr', 'es', 'ar', 'de', 'it', 'pt', 'zh', 'ja', 'ko']) {
    assert.equal(f.api.speechConfigured(language, 'asr'), true);
    const result = await f.api.transcribeProviderAudio(wav(), language);
    assert.equal(result.text, 'Bonjour.');
    assert.equal(result.provider, 'gemini-asr');
    assert.equal(result.confidence, null);
    assert.equal(result.durationSeconds, 0.1);
  }
  assert.equal(f.requests.length, 10);
  const part = f.requests[0].json.contents[0].parts[0].inlineData;
  assert.equal(part.mimeType, 'audio/wav');
  assert.deepEqual(Buffer.from(part.data, 'base64'), wav());
});

test('translation router sends source/target instructions and returns actual Gemini output', async () => {
  const f = fixture(translationBundle, () => textResult('Bonjour.'));
  assert.equal(f.api.translationProviderConfigured('gemini'), true);
  assert.equal(f.api.translationProviderConfigured('khaya'), false);
  const result = await f.api.translateWithProductionProviders('Hello.', 'en', 'fr');
  assert.equal(result.text, 'Bonjour.');
  assert.equal(result.provider, 'gemini-translator');
  assert.match(f.requests[0].json.systemInstruction.parts[0].text, /English into French/);
  assert.deepEqual(JSON.parse(f.requests[0].json.contents[0].parts[0].text), { text: 'Hello.' });
});

test('speech returns measurable WAV output, not a JSON success masquerading as audio', async () => {
  const f = fixture(speechBundle, () => audioResult());
  const result = await f.api.synthesizeProviderAudio('Bonjour.', 'fr');
  assert.equal(result.provider, 'gemini-tts');
  assert.equal(result.contentType, 'audio/wav');
  assert.equal(result.durationSeconds, 0.1);
  assert.deepEqual(Buffer.from(result.audioBase64, 'base64'), wav());
  assert.match(f.requests[0].json.contents[0].parts[0].speech_metadata.style, /French/);
});

test('explicit raw PCM is packaged as WAV; unknown formats are rejected', async () => {
  const pcm = fixture(speechBundle, () => audioResult(Buffer.alloc(4800), 'audio/L16;codec=pcm;rate=24000'));
  assert.equal((await pcm.api.synthesizeProviderAudio('Hello.', 'en')).durationSeconds, 0.1);
  const invalid = fixture(speechBundle, () => audioResult(Buffer.from('not audio'), 'text/html'));
  await assert.rejects(() => invalid.api.synthesizeProviderAudio('Hello.', 'en'), /unsupported audio format/);
});

test('quota, blocked output and malformed results fail once without Azure or other fallback', async () => {
  for (const reply of [
    () => new Response('{}', { status: 429 }),
    () => new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] })),
    () => textResult(''),
    () => new Response('not JSON'),
  ]) {
    const f = fixture(speechBundle, reply);
    await assert.rejects(() => f.api.transcribeProviderAudio(wav(), 'en'));
    assert.equal(f.requests.length, 1);
  }
});

test('missing key or invalid audio is rejected before any provider request', async () => {
  const missing = fixture(speechBundle, () => { throw new Error('Must not call'); }, false);
  assert.equal(missing.api.speechConfigured('en', 'asr'), false);
  await assert.rejects(() => missing.api.transcribeProviderAudio(wav(), 'en'), /not configured/);
  assert.equal(missing.requests.length, 0);
  const invalid = fixture(speechBundle, () => { throw new Error('Must not call'); });
  await assert.rejects(() => invalid.api.transcribeProviderAudio(Buffer.from('bad'), 'en'), /valid PCM WAV/);
  assert.equal(invalid.requests.length, 0);
});

test('HTTP rejection diagnostics survive speech error wrapping without leaking upstream text or keys', async () => {
  const f = fixture(speechBundle, () => new Response(JSON.stringify({
    error: { status: 'PERMISSION_DENIED', message: 'Do not log fixture-only or conversation contents',
      details: [{ reason: 'API_KEY_SERVICE_BLOCKED', metadata: { key: 'fixture-only', transcript: 'private text' } }] },
  }), { status: 403 }));
  await assert.rejects(() => f.api.transcribeProviderAudio(wav(), 'en'), (error: any) => {
    assert.equal(error.status, 502);
    assert.equal(error.diagnostic.upstreamHttpStatus, 403);
    assert.equal(error.diagnostic.providerStatus, 'PERMISSION_DENIED');
    assert.equal(error.diagnostic.reason, 'API_KEY_SERVICE_BLOCKED');
    assert.equal(error.diagnostic.apiVersion, 'v1beta');
    assert.equal(error.diagnostic.model, 'gemini-3.8-flash');
    assert.doesNotMatch(JSON.stringify(error), /fixture-only|private text|Do not log/);
    return true;
  });
  assert.equal(f.requests.length, 1);
  assert.doesNotMatch(JSON.stringify(f.warnings), /fixture-only|private text|Do not log/);
});

test('unknown, malformed and oversized diagnostic payloads never escape or hide the HTTP status', async () => {
  for (const body of [
    JSON.stringify({ error: { status: 'UNTRUSTED_STATUS', details: [{ reason: 'PRIVATE_DATA' }], message: 'private contents' } }),
    '<html>private contents</html>',
    'x'.repeat(20_000),
  ]) {
    const f = fixture(speechBundle, () => new Response(body, { status: 404 }));
    await assert.rejects(() => f.api.synthesizeProviderAudio('Hello.', 'en'), (error: any) => {
      assert.equal(error.diagnostic.upstreamHttpStatus, 404);
      assert.equal(error.diagnostic.providerStatus, undefined);
      assert.equal(error.diagnostic.reason, undefined);
      assert.doesNotMatch(JSON.stringify(error), /PRIVATE|private contents|UNTRUSTED/);
      return true;
    });
    assert.equal(f.requests.length, 1);
  }
});

test('a stalled error body cannot indefinitely delay safe diagnostics', async () => {
  let cancelled = false;
  const f = fixture(speechBundle, () => new Response(
    new ReadableStream({ cancel() { cancelled = true; } }), { status: 503 }));
  // AbortSignal.timeout uses an unreferenced timer in Node. Keep this isolated
  // stalled-stream fixture alive until the tested deadline settles.
  const keepAlive = setTimeout(() => {}, 2000);
  try {
    await assert.rejects(() => f.api.transcribeProviderAudio(wav(), 'en'), (error: any) => {
      assert.equal(error.diagnostic.upstreamHttpStatus, 503);
      return true;
    });
    assert.equal(cancelled, true);
    assert.equal(f.requests.length, 2);
  } finally { clearTimeout(keepAlive); }
});

test('translation and recognition use supported low thinking without changing speech generation', async () => {
  for (const bundle of [translationBundle,speechBundle]) {
    const f=fixture(bundle,()=>textResult('Bonjour.'));
    if(bundle===translationBundle)await f.api.translateWithProductionProviders('Hello.','en','fr');
    else await f.api.transcribeProviderAudio(wav(),'en');
    const config=f.requests[0].json.generationConfig;
    assert.equal(config.thinkingConfig.thinkingLevel,'low');
    assert.equal(config.thinkingConfig.thinkingBudget,undefined);
    assert.equal(config.temperature,undefined);
    assert.equal(config.responseMimeType,'application/json');
    assert.equal(config.maxOutputTokens,4096);
  }
  const tts=fixture(speechBundle,()=>audioResult());
  await tts.api.synthesizeProviderAudio('Bonjour.','fr');
  assert.equal(tts.requests[0].json.generationConfig.thinkingConfig,undefined);
  assert.deepEqual(tts.requests[0].json.generationConfig.responseModalities,['AUDIO']);
});

test('configured 2.5 Flash keeps its distinct budget contract; unrelated overrides are not guessed', async () => {
  for(const model of ['gemini-2.5-flash','gemini-2.5-flash-lite','gemini-2.5-pro','gemini-flash-latest']){
    const f=fixture(translationBundle,()=>textResult('Bonjour.'),true,{LANGPRETATION_GEMINI_MODEL:model});
    await f.api.translateWithProductionProviders('Hello.','en','fr');
    const config=f.requests[0].json.generationConfig;
    if(model.includes('2.5-flash')){
      assert.equal(config.thinkingConfig.thinkingBudget,0);
      assert.equal(config.thinkingConfig.thinkingLevel,undefined);
    }else assert.equal(config.thinkingConfig,undefined);
  }
});

test('caller cancellation reaches Gemini recognition and synthesis without retrying', {timeout:1500}, async () => {
  for(const operation of ['recognition','synthesis']){
    const controller=new AbortController();
    const f=fixture(speechBundle,request=>new Promise<Response>((_resolve,reject)=>{
      request.signal.addEventListener('abort',()=>reject(request.signal.reason),{once:true});
    }));
    const pending=operation==='recognition'
      ? f.api.transcribeProviderAudio(wav(),'en','audio/wav',{signal:controller.signal})
      : f.api.synthesizeProviderAudio('Hello.','en',{signal:controller.signal});
    controller.abort();
    await assert.rejects(()=>pending,(error:any)=>{
      assert.equal(error.status,499);
      assert.equal(error.diagnostic.failure,'cancelled');
      assert.doesNotMatch(JSON.stringify(error),/fixture-only/);
      return true;
    });
    assert.equal(f.requests.length,1);
    assert.equal(f.requests[0].signal.aborted,true);
  }
});

test('translation router forwards in-flight cancellation and does not retry another provider', {timeout:1500}, async () => {
  const controller=new AbortController();
  const f=fixture(translationBundle,request=>new Promise<Response>((_resolve,reject)=>{
    request.signal.addEventListener('abort',()=>reject(request.signal.reason),{once:true});
  }));
  const pending=f.api.translateWithProductionProviders('Hello.','en','fr',controller.signal);
  controller.abort();
  assert.equal(await pending,null);
  assert.equal(f.requests.length,1);
  assert.equal(f.requests[0].signal.aborted,true);
});

test('a stalled successful response is closed at the same deadline and reports a timeout', {timeout:1500}, async () => {
  let cancelled=false;
  const signals={any:AbortSignal.any,timeout:(ms:number)=>AbortSignal.timeout(ms===20_000?20:ms)};
  const f=fixture(speechBundle,()=>new Response(new ReadableStream({
    start(controller){controller.enqueue(new TextEncoder().encode('{"candidates":'));},
    cancel(){cancelled=true;},
  })),true,{},signals);
  const keepAlive=setTimeout(()=>{},1000);
  try{
    await assert.rejects(()=>f.api.transcribeProviderAudio(wav(),'en'),(error:any)=>{
      assert.equal(error.status,504);
      assert.equal(error.diagnostic.failure,'timeout');
      assert.doesNotMatch(JSON.stringify(error),/fixture-only/);
      return true;
    });
    assert.equal(cancelled,true);
    assert.equal(f.requests.length,1);
  }finally{clearTimeout(keepAlive);}
});
