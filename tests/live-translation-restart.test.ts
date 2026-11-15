import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

// Isolated transport and devices: these regressions never open a provider session.
const bundle = await build({
  entryPoints: ['src/services/liveCallTranslation.ts'], bundle: true, write: false,
  format: 'cjs', platform: 'browser',
  plugins: [{
    name: 'restart-transport', setup(builder) {
      builder.onResolve({ filter: /lib\/realtimeClient$/ }, () => ({ path: 'transport', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: 'export const realtimeClient=globalThis.transport;',
      }));
    },
  }],
});
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

function fixture() {
  const listeners = new Map<string, Set<(payload: any) => void>>();
  const sent: any[] = [], contexts: any[] = [], tracks: any[] = [], errors: string[] = [];
  let streamSequence = 0;
  const transport = {
    send: (event: string, payload: any) => { sent.push({ event, payload }); return true; },
    on: (event: string, listener: (payload: any) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
      return () => listeners.get(event)?.delete(listener);
    },
  };
  class Context {
    sampleRate = 48000; state = 'running'; currentTime = 0; destination = {};
    constructor() { contexts.push(this); }
    resume() { return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() { return { onaudioprocess: null, connect() {}, disconnect() {} }; }
  }
  const context = vm.createContext({
    module: { exports: {} }, transport, window: { AudioContext: Context },
    crypto: { randomUUID: () => `browser-stream-${++streamSequence}` },
    MediaStream: class {
      constructor(public tracks: any[]) {}
      getTracks() { return this.tracks; }
    },
    navigator: { mediaDevices: { getUserMedia: async () => {
      const track = { stopped: false, stop() { this.stopped = true; } };
      tracks.push(track); return { getTracks: () => [track] };
    } } },
    setTimeout, clearTimeout, Int16Array, Uint8Array, Float32Array, DataView, Math, Error,
    btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  const { LiveCallTranslation } = context.module.exports as any;
  const service = new LiveCallTranslation('call-one', 'speaker-A', {
    error: (message: string) => errors.push(message), stopped() {}, remoteActive() {}, transcript() {},
  }, transport);
  const emit = (event: string, payload: any) => { for (const listener of listeners.get(event) || []) listener(payload); };
  return { service, contexts, sent, tracks, emit, errors };
}

test('cancelled readiness cannot stop its replacement or accept stale readiness', async t => {
  const f = fixture(); t.after(() => f.service.dispose());
  const first = f.service.start('en', 'fr', false); await flush();
  const oldRequest = f.sent.find(p => p.event === 'langpretation:start');
  assert.ok(oldRequest);
  const replacement = f.service.start('en', 'ar', false); await flush();
  const requests = f.sent.filter(p => p.event === 'langpretation:start');
  assert.equal(requests.length, 2, 'The cancelled start must not destroy newer capture');
  const current = requests[1];
  assert.notEqual(current.payload.streamId, oldRequest.payload.streamId);
  let settled = false; void replacement.then(() => { settled = true; });
  f.emit('langpretation:ready', { callId: 'call-one', streamId: oldRequest.payload.streamId });
  await flush(); assert.equal(settled, false);
  f.emit('langpretation:ready', { callId: 'call-one', streamId: current.payload.streamId });
  assert.equal(await first, false);
  assert.equal(await replacement, true);
  assert.equal(f.tracks[0].stopped, true);
  assert.equal(f.tracks[1].stopped, false);
  assert.deepEqual(f.errors, []);
});

test('late audio-unlock rejection leaves the replacement translation alive', async t => {
  const f = fixture(); t.after(() => f.service.dispose());
  await f.service.unlock();
  let rejectOld!: (error: Error) => void;
  const oldResume = new Promise<void>((_resolve, reject) => { rejectOld = reject; });
  let resumes = 0;
  f.contexts[0].resume = () => ++resumes === 1 ? oldResume : Promise.resolve();
  const first = f.service.start('en', 'fr', false); await flush();
  const replacement = f.service.start('en', 'ar', false); await flush();
  const request = f.sent.find(p => p.event === 'langpretation:start');
  assert.ok(request);
  rejectOld(new Error('Old unlock failed'));
  assert.equal(await first, false); await flush();
  f.emit('langpretation:ready', { callId: 'call-one', streamId: request.payload.streamId });
  assert.equal(await replacement, true);
  assert.equal(f.tracks[1].stopped, false);
  assert.deepEqual(f.errors, []);
});

test('the current failure remains visible and releases capture before any paid session', async t => {
  const f = fixture(); t.after(() => f.service.dispose());
  await f.service.unlock();
  f.contexts[0].resume = async () => { throw new Error('Current audio unlock failed'); };
  assert.equal(await f.service.start('en', 'fr', false), false);
  assert.equal(f.tracks[0].stopped, true);
  assert.deepEqual(f.errors, ['Current audio unlock failed']);
  assert.equal(f.sent.some(p => p.event === 'langpretation:start'), false);
});
