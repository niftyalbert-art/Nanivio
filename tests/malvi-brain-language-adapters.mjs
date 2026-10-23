import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

// Isolated provider adapters: no real provider, Redis, microphone, or paid
// session is used. Exercise the actual controller and both SDK contracts.
const fixtures = {
  gemini: `
    export const Modality = { AUDIO: 'AUDIO' };
    export class GoogleGenAI {
      live = { connect: async options => {
        const state = globalThis.__malviAdapter;
        state.geminiConnects++; state.geminiOptions = options;
        return {
          sendRealtimeInput: data => state.geminiInput.push(data),
          sendClientContent: data => state.geminiContent.push(data),
          sendToolResponse: () => {}, close: () => { state.geminiCloses++; }
        };
      }};
    }`,
  openai: `export default class OpenAI {}`,
  live: `
    export class LiveWS {
      handlers = {};
      socket = { on: (type, fn) => {
        if(type === 'open') queueMicrotask(() => {
          fn(); this.handlers.event?.({type:'session.started'});
        });
      }};
      constructor() { globalThis.__malviAdapter.openaiConnects++; }
      on(type, fn) { this.handlers[type] = fn; }
      send(event) { globalThis.__malviAdapter.openaiEvents.push(event); }
      close() { globalThis.__malviAdapter.openaiCloses++; }
    }`,
  service: `
    export const liveAvatarService = {
      owned: async (user, id) => {
        if(user !== 'owner') throw new Error('Live session not found.');
        return { id, owner:user, language:'ar', speechProvider:globalThis.__malviAdapter.speechProvider, mode:globalThis.__malviAdapter.voiceMode?'VOICE_TEST':'LITE' };
      },
      stop: async () => { globalThis.__malviAdapter.voiceStops=(globalThis.__malviAdapter.voiceStops||0)+1; },
      activity: async () => {
        globalThis.__malviAdapter.activity++;
        return { idleDeadline: Date.now()+60000 };
      }
    };`,
};
const output = await build({
  stdin: {
    contents: `export { malviLiveBrainController } from './src/server/assistant/liveBrain.ts';`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  plugins: [{
    name: 'isolated-live-providers',
    setup(build) {
      build.onResolve({ filter: /^@google\/genai$/ }, () => ({ path: 'gemini', namespace: 'malvi-fixture' }));
      build.onResolve({ filter: /^openai$/ }, () => ({ path: 'openai', namespace: 'malvi-fixture' }));
      build.onResolve({ filter: /^openai\/resources\/live\/ws$/ }, () => ({ path: 'live', namespace: 'malvi-fixture' }));
      build.onResolve({ filter: /liveAvatarService\.ts$/ }, () => ({ path: 'service', namespace: 'malvi-fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'malvi-fixture' }, args => ({ contents: fixtures[args.path], loader: 'js' }));
    },
  }],
});
globalThis.__malviAdapter = {
  geminiConnects: 0, geminiCloses: 0, geminiContent: [], geminiInput: [],
  openaiConnects: 0, openaiCloses: 0, openaiEvents: [], activity: 0,
};
const state = globalThis.__malviAdapter;
state.speechRequests = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  assert.match(String(url), /^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/kW71iH6myeMHEvxKthQ6\/with-timestamps\?output_format=pcm_24000$/);
  state.speechRequests.push({ body: JSON.parse(init.body), signal: init.signal });
  if (state.holdSpeech) await new Promise(resolve => { state.releaseSpeech=resolve; });
  const characters = Array.from(JSON.parse(init.body).text);
  return Response.json({
    audio_base64: Buffer.alloc(480, 12).toString('base64'),
    normalized_alignment: { characters,
      character_start_times_seconds: characters.map(() => 0),
      character_end_times_seconds: characters.map(() => 0.009) },
  });
};
const isolatedModule = { exports: {} };
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  createRequire(import.meta.url), isolatedModule, isolatedModule.exports,
);
const { malviLiveBrainController: controller } = isolatedModule.exports;
const keys = ['MALVI_BRAIN_PROVIDER', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'MALVI_TTS_TRANSPORT', 'MALVI_VOICE_PROVIDER'];
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const socket = () => ({ readyState: 1, OPEN: 1, events: [], send(value) { this.events.push(JSON.parse(value)); } });
const gemini = socket(), openai = socket();
const id1 = '11111111-1111-4111-8111-111111111111';
const id2 = '22222222-2222-4222-8222-222222222222';
try {
  process.env.GEMINI_API_KEY = 'isolated-fixture';
  process.env.OPENAI_API_KEY = 'isolated-fixture';
  process.env.MALVI_BRAIN_PROVIDER = 'gemini';
  process.env.MALVI_VOICE_PROVIDER = 'elevenlabs';
  process.env.ELEVENLABS_API_KEY = 'isolated-fixture';
  process.env.ELEVENLABS_VOICE_ID = 'kW71iH6myeMHEvxKthQ6';
  process.env.MALVI_TTS_TRANSPORT = 'direct';
  await controller.start(gemini, 'owner', id1, 'fr');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.geminiConnects, 1);
  assert.equal(state.openaiConnects, 0);
  assert.equal(state.geminiOptions.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore', 'ElevenLabs sessions keep their existing discarded native voice');
  assert.doesNotMatch(state.geminiOptions.config.systemInstruction, /Malvi's approved Gemini speaking style/);
  assert.match(state.geminiOptions.config.systemInstruction, /French \(fr;/);
  assert.match(state.geminiContent[0].turns[0].parts[0].text, /greet.*French/);
  assert.equal(gemini.events.find(event => event.type === 'malvi:brain_ready').payload.language, 'fr');
  const spokenChunk = { inlineData: { data: Buffer.alloc(480).toString('base64'), mimeType: 'audio/pcm;rate=24000' } };
  state.geminiOptions.callbacks.onmessage({ serverContent: { modelTurn: { parts: [spokenChunk] } } });
  await controller.language(gemini, 'owner', id1, 'tw-ak');
  assert.equal(gemini.events.at(-1).type, 'malvi:brain_language_error');
  assert.match(gemini.events.at(-1).payload.message, /Akuapem Twi.*not supported/);
  await controller.language(gemini, 'owner', id1, 'en');
  assert.match(state.geminiContent.at(-1).turns[0].parts[0].text, /English \(en;/);
  assert.equal(state.geminiContent.at(-1).turnComplete, false);
  assert.equal(gemini.events.at(-1).type, 'malvi:brain_language');
  assert.equal(gemini.events.at(-1).payload.language, 'en');
  state.geminiOptions.callbacks.onmessage({ serverContent: { modelTurn: { parts: [spokenChunk] }, outputTranscription: { text: 'Old language' }, turnComplete: true } });
  assert.equal(gemini.events.filter(event => event.type === 'malvi:brain_audio').length, 0, 'Discard the previous language’s buffered and late audio');
  state.geminiOptions.callbacks.onmessage({ serverContent: { modelTurn: { parts: [spokenChunk] }, outputTranscription: { text: 'Hello, I am Malvi, your AI assistant.' }, turnComplete: true } });
  await new Promise(resolve => setImmediate(resolve));
  const audioEvent = gemini.events.find(event => event.type === 'malvi:brain_audio');
  assert.equal(audioEvent.payload.language, 'en');
  assert.equal(audioEvent.payload.speechProvider, 'elevenlabs');
  assert.ok(audioEvent.payload.alignment.characters.length > 0);
  assert.equal(audioEvent.payload.durationMs, 10);
  assert.equal(audioEvent.payload.pcm24k, Buffer.alloc(480, 12).toString('base64'), 'Only ElevenLabs audio may reach the renderer');
  assert.equal(state.speechRequests.length, 1, 'Exactly one request for the completed Gemini turn');
  assert.equal(state.speechRequests[0].body.text, 'Hello, I am Malvi, your AI assistant.');
  state.geminiOptions.callbacks.onmessage({ serverContent: { turnComplete: true } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.speechRequests.length, 1, 'Duplicate completion must not create billable speech');
  const opening='Here is a clear answer to your question.';
  const remainder=' This useful detail follows after the opening sentence.';
  state.geminiOptions.callbacks.onmessage({serverContent:{outputTranscription:{text:opening}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(state.speechRequests.length,2,'Start the approved voice before the native-audio turn completes');
  assert.equal(gemini.events.filter(e=>e.type==='malvi:brain_audio').length,2);
  assert.equal(gemini.events.filter(e=>e.type==='malvi:brain_audio').at(-1).payload.ended,false);
  state.geminiOptions.callbacks.onmessage({serverContent:{outputTranscription:{text:remainder}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(state.speechRequests.length,2,'Do not synthesize every subsequent sentence separately');
  state.geminiOptions.callbacks.onmessage({serverContent:{turnComplete:true}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(state.speechRequests.length,3);
  assert.equal(state.speechRequests.slice(1,3).map(r=>r.body.text).join(''),opening+remainder);
  const partials=gemini.events.filter(e=>e.type==='malvi:brain_audio').slice(1);
  assert.deepEqual(partials.map(e=>e.payload.ended),[false,true]);
  assert.ok(partials.every(e=>e.payload.alignment.characters.length),'Every segment retains provider subtitle timings');
  state.holdSpeech=true;
  const beforeInterrupted=gemini.events.filter(e=>e.type==='malvi:brain_audio').length;
  state.geminiOptions.callbacks.onmessage({serverContent:{outputTranscription:{text:opening}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof state.releaseSpeech,'function');
  controller.interrupt(gemini,'owner',id1);
  state.holdSpeech=false;state.releaseSpeech();
  await new Promise(resolve=>setImmediate(resolve));
  state.geminiOptions.callbacks.onmessage({serverContent:{turnComplete:true}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(gemini.events.filter(e=>e.type==='malvi:brain_audio').length,beforeInterrupted,'Cancelled opening speech cannot arrive late');
  assert.equal(state.activity, 0, 'A language preference must not reset the cost-protection deadline');
  const contentCount = state.geminiContent.length;
  await controller.language(gemini, 'intruder', id1, 'en');
  await controller.language(gemini, 'owner', id1, 'xx');
  assert.equal(state.geminiContent.length, contentCount);
  assert.equal(gemini.events.at(-1).type, 'malvi:brain_language_error');
  assert.equal(state.geminiConnects, 1, 'Language changes must reuse the same selected provider connection');
  controller.closeSocket(gemini);
  assert.equal(state.geminiCloses, 1);

  process.env.MALVI_BRAIN_PROVIDER = 'openai';
  await controller.start(openai, 'owner', id2);
  await new Promise(resolve => setImmediate(resolve));
  const start = state.openaiEvents.find(event => event.type === 'session.start');
  assert.match(start.session.instructions, /Arabic \(ar;/);
  assert.match(start.session.delegation.responses.instructions, /Arabic \(ar;/);
  assert.match(start.session.instructions, /AI companion at Nanivio/);
  assert.doesNotMatch(start.session.instructions, /AI assistant, not a human/);
  await controller.language(openai, 'owner', id2, 'gaa');
  assert.match(openai.events.at(-1).payload.message, /Ga.*not supported/);
  await controller.language(openai, 'owner', id2, 'fr');
  const update = state.openaiEvents.at(-1);
  assert.equal(update.type, 'session.instructions.append');
  assert.equal(update.delegation_id, null);
  assert.match(update.content, /French \(fr;/);
  assert.equal(openai.events.at(-1).payload.language, 'fr');
  assert.equal(state.openaiConnects, 1);
  assert.equal(state.geminiConnects, 1, 'No hidden cross-provider fallback');
  assert.equal(state.activity, 0);
  controller.closeSocket(openai);
  process.env.MALVI_BRAIN_PROVIDER = 'gemini';
  state.voiceMode = true;
  const voice = socket();
  const voiceId = '33333333-3333-4333-8333-333333333333';
  await controller.start(voice, 'owner', voiceId, 'en');
  await new Promise(resolve => setImmediate(resolve));
  controller.interrupt(voice, 'intruder', voiceId);
  assert.equal(voice.events.filter(e => e.type === 'malvi:brain_interrupted').length, 0);
  controller.interrupt(voice, 'owner', voiceId);
  assert.equal(voice.events.filter(e => e.type === 'malvi:brain_interrupted').length, 1);
  state.geminiOptions.callbacks.onmessage({ serverContent: { modelTurn: { parts: [spokenChunk] }, outputTranscription: { text: 'Cancelled speech' }, turnComplete: true } });
  assert.equal(voice.events.filter(e => e.type === 'malvi:brain_audio').length, 0, 'Interrupted response must not resume playback');
  state.geminiOptions.callbacks.onmessage({ serverContent: { modelTurn: { parts: [spokenChunk] }, outputTranscription: { text: 'New speech' }, turnComplete: true } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(voice.events.filter(e => e.type === 'malvi:brain_audio').length, 1, 'Next response must still be playable');
  const inputPcm=Buffer.alloc(6400);
  for(let i=0;i<inputPcm.length;i+=2)inputPcm.writeInt16LE(i%4?8000:-8000,i);
  const beforeInput=state.geminiInput.length;
  await controller.audio(voice,'intruder',voiceId,inputPcm.toString('base64'));
  assert.equal(state.geminiInput.length,beforeInput,'Other accounts cannot inject microphone audio');
  await controller.audio(voice,'owner',voiceId,inputPcm.toString('base64'));
  assert.deepEqual(state.geminiInput.at(-1),{audio:{data:inputPcm.toString('base64'),mimeType:'audio/pcm;rate=16000'}},'Forward the captured voice bytes to the one selected brain at the correct sample rate');
  state.geminiOptions.callbacks.onmessage({serverContent:{inputTranscription:{text:'Hello Malvi'}}});
  assert.equal(voice.events.filter(e=>e.type==='malvi:brain_caption'&&e.payload.role==='user').at(-1).payload.text,'Hello Malvi');
  controller.endAudio(voice,'owner',voiceId);
  assert.deepEqual(state.geminiInput.at(-1),{audioStreamEnd:true});
  controller.closeSocket(voice);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.voiceStops, 1, 'Socket disconnect must release the voice-only Redis reservation');
  state.speechProvider = 'gemini';
  state.voiceMode = false;
  delete process.env.ELEVENLABS_API_KEY;
  const native = socket();
  const nativeId = '44444444-4444-4444-8444-444444444444';
  const speechRequestsBefore = state.speechRequests.length;
  await controller.start(native, 'owner', nativeId, 'en');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(native.events.find(e => e.type === 'malvi:brain_ready').payload.speechProvider, 'gemini');
  assert.equal(state.geminiOptions.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Sulafat');
  assert.match(state.geminiOptions.config.systemInstruction, /British English and light Ghanaian English/);
  assert.match(state.geminiOptions.config.systemInstruction, /"Na ni vio"/);
  const emitNative = state.geminiOptions.callbacks.onmessage;
  const nativePcm = Buffer.alloc(480);
  nativePcm.writeInt16LE(16000, 0);
  const nativeChunk = { inlineData: { data: nativePcm.toString('base64'), mimeType: 'audio/pcm;rate=24000' } };
  emitNative({ serverContent: { modelTurn: { parts: [nativeChunk] }, outputTranscription: { text: 'Hello from Gemini' }, turnComplete: true } });
  let nativeAudio = native.events.filter(e => e.type === 'malvi:brain_audio');
  assert.equal(nativeAudio.length, 1);
  const styledAudio = Buffer.from(nativeAudio[0].payload.pcm24k, 'base64');
  assert.equal(styledAudio.length, 480 + 5064 * 2);
  assert.ok(styledAudio.readInt16LE(0) > 0);
  assert.ok(styledAudio.subarray(480).some(byte => byte !== 0));
  assert.equal(nativeAudio[0].payload.durationMs, 221);
  assert.equal(nativeAudio[0].payload.speechDurationMs, 10);
  assert.equal(nativeAudio[0].payload.captionTiming, 'estimated');
  assert.equal(nativeAudio[0].payload.speechProvider, 'gemini');
  assert.equal(nativeAudio[0].payload.alignment, undefined, 'Do not invent provider timestamps');
  emitNative({ serverContent: { turnComplete: true } });
  assert.equal(native.events.filter(e => e.type === 'malvi:brain_audio').length, 1);
  emitNative({ serverContent: { modelTurn: { parts: [spokenChunk] }, outputTranscription: { text: 'Interrupted' } } });
  controller.interrupt(native, 'owner', nativeId);
  emitNative({ serverContent: { modelTurn: { parts: [spokenChunk] }, outputTranscription: { text: ' remainder' }, turnComplete: true } });
  assert.equal(native.events.filter(e => e.type === 'malvi:brain_audio').length, 1);
  emitNative({ serverContent: { modelTurn: { parts: [spokenChunk] }, outputTranscription: { text: 'Fresh turn' }, turnComplete: true } });
  assert.equal(native.events.filter(e => e.type === 'malvi:brain_audio').length, 2);
  emitNative({ serverContent: { modelTurn: { parts: [spokenChunk] }, outputTranscription: { text: 'Old language starting' } } });
  await controller.language(native, 'owner', nativeId, 'fr');
  assert.match(state.geminiContent.at(-1).turns[0].parts[0].text, /Do not switch to English/);
  assert.doesNotMatch(state.geminiContent.at(-1).turns[0].parts[0].text, /British English and light Ghanaian English/);
  emitNative({ serverContent: { modelTurn: { parts: [spokenChunk] }, outputTranscription: { text: 'Old language' }, turnComplete: true } });
  assert.equal(native.events.filter(e => e.type === 'malvi:brain_audio').length, 2);
  emitNative({ serverContent: { modelTurn: { parts: [spokenChunk] }, outputTranscription: { text: 'Bonjour' }, turnComplete: true } });
  assert.equal(native.events.filter(e => e.type === 'malvi:brain_audio').at(-1).payload.language, 'fr');
  controller.closeSocket(native);
  emitNative({ serverContent: { modelTurn: { parts: [spokenChunk] }, outputTranscription: { text: 'Late' }, turnComplete: true } });
  assert.equal(native.events.filter(e => e.type === 'malvi:brain_audio').length, 3);
  assert.equal(state.speechRequests.length, speechRequestsBefore, 'Gemini voice must not make ElevenLabs requests or fallback');
  console.log(JSON.stringify({ geminiAndOpenAI: true, exactLanguageAndDialect: true, localizedFirstGreeting: true, livePreferenceUpdates: true, ownerOnly: true, noProviderFanoutOrReconnect: true, idleDeadlineUnchanged: true }));
} finally {
  controller.closeSocket(gemini); controller.closeSocket(openai);
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  delete globalThis.__malviAdapter;
  globalThis.fetch = originalFetch;
}
