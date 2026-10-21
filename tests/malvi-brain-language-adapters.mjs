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
        return { id, owner:user, language:'ar' };
      },
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
const isolatedModule = { exports: {} };
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  createRequire(import.meta.url), isolatedModule, isolatedModule.exports,
);
const { malviLiveBrainController: controller } = isolatedModule.exports;
const keys = ['MALVI_BRAIN_PROVIDER', 'GEMINI_API_KEY', 'OPENAI_API_KEY'];
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const socket = () => ({ readyState: 1, OPEN: 1, events: [], send(value) { this.events.push(JSON.parse(value)); } });
const gemini = socket(), openai = socket();
const id1 = '11111111-1111-4111-8111-111111111111';
const id2 = '22222222-2222-4222-8222-222222222222';
try {
  process.env.GEMINI_API_KEY = 'isolated-fixture';
  process.env.OPENAI_API_KEY = 'isolated-fixture';
  process.env.MALVI_BRAIN_PROVIDER = 'gemini';
  await controller.start(gemini, 'owner', id1, 'fr');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.geminiConnects, 1);
  assert.equal(state.openaiConnects, 0);
  assert.match(state.geminiOptions.config.systemInstruction, /French \(fr;/);
  assert.match(state.geminiContent[0].turns[0].parts[0].text, /greet.*French/);
  assert.equal(gemini.events.find(event => event.type === 'malvi:brain_ready').payload.language, 'fr');
  const spokenChunk = { inlineData: { data: Buffer.alloc(480).toString('base64'), mimeType: 'audio/pcm;rate=24000' } };
  state.geminiOptions.callbacks.onmessage({ serverContent: { modelTurn: { parts: [spokenChunk] } } });
  await controller.language(gemini, 'owner', id1, 'tw-ak');
  assert.match(state.geminiContent.at(-1).turns[0].parts[0].text, /Akuapem Twi \(tw-ak;/);
  assert.equal(state.geminiContent.at(-1).turnComplete, false);
  assert.equal(gemini.events.at(-1).type, 'malvi:brain_language');
  assert.equal(gemini.events.at(-1).payload.language, 'tw-ak');
  assert.equal(gemini.events.at(-1).payload.coverage.providerListed, false);
  state.geminiOptions.callbacks.onmessage({ serverContent: { modelTurn: { parts: [spokenChunk] }, turnComplete: true } });
  assert.equal(gemini.events.filter(event => event.type === 'malvi:brain_audio').length, 0, 'Discard the previous language’s buffered and late audio');
  state.geminiOptions.callbacks.onmessage({ serverContent: { modelTurn: { parts: [spokenChunk] }, turnComplete: true } });
  assert.equal(gemini.events.find(event => event.type === 'malvi:brain_audio').payload.language, 'tw-ak');
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
  assert.match(start.session.instructions, /AI assistant, not a human/);
  await controller.language(openai, 'owner', id2, 'gaa');
  const update = state.openaiEvents.at(-1);
  assert.equal(update.type, 'session.instructions.append');
  assert.equal(update.delegation_id, null);
  assert.match(update.content, /Ga \(gaa;/);
  assert.equal(openai.events.at(-1).payload.language, 'gaa');
  assert.equal(state.openaiConnects, 1);
  assert.equal(state.geminiConnects, 1, 'No hidden cross-provider fallback');
  assert.equal(state.activity, 0);
  console.log(JSON.stringify({ geminiAndOpenAI: true, exactLanguageAndDialect: true, localizedFirstGreeting: true, livePreferenceUpdates: true, ownerOnly: true, noProviderFanoutOrReconnect: true, idleDeadlineUnchanged: true }));
} finally {
  controller.closeSocket(gemini); controller.closeSocket(openai);
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  delete globalThis.__malviAdapter;
}
