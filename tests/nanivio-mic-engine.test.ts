import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { NanivioMicEngine, type NanivioMicCapture, type NanivioMicSnapshot } from '../src/lib/nanivioMic/NanivioMicEngine.ts';
import { encodeNanivioMicFrame, NANIVIO_MIC_EVENTS as E, type NanivioMicStatus } from '../src/shared/nanivioMicProtocol.ts';
import { browserMicStreamId } from '../src/lib/nanivioMic/BrowserMicCapture.ts';

const sessionId = '11111111-1111-4111-8111-111111111111';
const streamId = '22222222-2222-4222-8222-222222222222';
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
test('browser stream identities use secure portable UUIDv4 generation', () => {
  const first = browserMicStreamId(), second = browserMicStreamId();
  assert.match(first,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.notEqual(first,second);
});
function fixture(options: Record<string, any> = {}) {
  const snapshots: NanivioMicSnapshot[] = [], sent: any[] = [];
  let receive: ((state: NanivioMicStatus) => void) | null = null;
  let frame!: (pcm: ArrayBuffer) => void, error!: (message: string) => void;
  let stops = 0, starts = 0, speechStarts = 0, speechEnds = 0, connected = true;
  let signal: AbortSignal;
  const capture: NanivioMicCapture = {
    async start(onFrame, onError, abort) { starts++; frame = onFrame; error = onError; signal = abort; },
    stop() { stops++; },
  };
  const engine = new NanivioMicEngine({
    sessionId, streamId, capture,
    transport: {
      subscribe(fn) { receive = fn; return () => { receive = null; }; },
      send(type, payload) { sent.push({ type, payload }); return connected; },
    },
    onState: state => snapshots.push(state),
    onSpeechStart() { speechStarts++; }, onSpeechEnd() { speechEnds++; }, ...options,
  });
  return {
    engine, sent, snapshots, frame: (pcm = new ArrayBuffer(6400)) => frame(pcm), error: (message: string) => error(message),
    emit: (state: Partial<NanivioMicStatus>) => receive?.({ sessionId, streamId, version: 1, state: 'ready', ...state }),
    counts: () => ({ stops, starts, speechStarts, speechEnds, aborted: signal?.aborted }),
    disconnect: () => { connected = false; },
  };
}

test('owned engine negotiates its protocol and sends no audio before gateway readiness', async () => {
  const f = fixture();
  try {
    await f.engine.start(); await f.engine.start();
    assert.equal(f.counts().starts, 1);
    assert.equal(f.sent[0].type, E.start);
    assert.equal(f.sent[0].payload.sampleRate, 16000);
    f.frame();
    assert.equal(f.sent.filter(e => e.type === E.audio).length, 0);
    f.emit({ streamId: '33333333-3333-4333-8333-333333333333' });
    f.frame();
    assert.equal(f.sent.filter(e => e.type === E.audio).length, 0, 'Another stream cannot unlock audio');
    f.emit({});
    const pcm = new ArrayBuffer(6400);
    new DataView(pcm).setInt16(0, 10000, true);
    f.frame(pcm);
    const audio = f.sent.find(e => e.type === E.audio);
    assert.equal(audio.payload.sequence, 1);
    assert.deepEqual(Buffer.from(audio.payload.audio, 'base64'), Buffer.from(pcm));
    assert.equal(f.snapshots.at(-1)!.serverReceiving, false, 'A send is not a receipt');
    f.emit({ state: 'receiving', lastSequence: 1 });
    assert.equal(f.snapshots.at(-1)!.serverReceiving, true);
    f.engine.stop();
    f.frame(pcm);
    assert.equal(f.sent.filter(e => e.type === E.audio).length, 1, 'Never replay a stopped capture');
    assert.equal(f.counts().stops, 1);
    assert.equal(f.counts().aborted, true);
  } finally { f.engine.stop(); }
});

test('engine owns speech/silence state independently of speech-recognition APIs', async () => {
  let now = 0;
  const f = fixture({ now: () => now });
  try {
    await f.engine.start(); f.emit({});
    const pcm = new ArrayBuffer(6400), view = new DataView(pcm);
    for (let i = 0; i < 6400; i += 2) view.setInt16(i, 8000, true);
    f.frame(pcm);
    f.emit({ state: 'receiving', lastSequence: 1 });
    assert.equal(f.snapshots.at(-1)!.state, 'hearing');
    now = 800; f.frame();
    assert.equal(f.snapshots.at(-1)!.state, 'processing');
    assert.equal(f.counts().speechStarts, 1); assert.equal(f.counts().speechEnds, 1);
  } finally { f.engine.stop(); }
});

test('failed or unsupported protocol handshakes stop capture without a provider fallback', async () => {
  const f = fixture({ startupTimeoutMs: 20 });
  await f.engine.start(); f.emit({ version: 2 as 1 });
  await pause(40);
  assert.match(f.snapshots.at(-1)!.error, /could not connect/);
  assert.equal(f.counts().stops, 1);
  assert.equal(f.sent.filter(e => e.type === E.audio).length, 0);
});

test('recorder failures, capture stalls and delivery failures do not leave a false listening state', async () => {
  const crashed = fixture();
  await crashed.engine.start(); crashed.error('Recorder stopped');
  assert.equal(crashed.snapshots.at(-1)!.captureActive, false);
  assert.match(crashed.snapshots.at(-1)!.error, /Recorder stopped/);
  const stalled = fixture({ captureTimeoutMs: 20 });
  await stalled.engine.start(); stalled.emit({});
  await pause(40);
  assert.match(stalled.snapshots.at(-1)!.error, /No microphone audio/);
  const offline = fixture();
  await offline.engine.start(); offline.emit({}); offline.disconnect(); offline.frame();
  assert.equal(offline.snapshots.at(-1)!.captureActive, false);
  assert.match(offline.snapshots.at(-1)!.error, /connection stopped receiving/);
});

test('stale receipts cannot keep an undelivered microphone stream alive', async () => {
  const f = fixture({ deliveryTimeoutMs: 45 });
  await f.engine.start(); f.emit({}); f.frame();
  f.emit({ state: 'receiving', lastSequence: 1 });
  await pause(25);
  f.emit({ state: 'receiving', lastSequence: 1 });
  await pause(40);
  assert.match(f.snapshots.at(-1)!.error, /lost the audio connection/);
});

test('the shared native/web codec does not require browser globals', () => {
  const original = globalThis.btoa;
  try {
    globalThis.btoa = undefined as any;
    const pcm = new ArrayBuffer(6400);
    new Uint8Array(pcm).fill(169);
    assert.deepEqual(Buffer.from(encodeNanivioMicFrame(pcm), 'base64'), Buffer.from(pcm));
  } finally { globalThis.btoa = original; }
});

test('owned processor normalizes 16, 44.1 and 48 kHz into exact PCM16 frames', () => {
  const source = readFileSync(new URL('../public/audio/nanivio-mic-processor.js', import.meta.url), 'utf8');
  for (const sampleRate of [8000, 16000, 44100, 48000]) {
    const frames: ArrayBuffer[] = [];
    let Processor: any;
    vm.runInNewContext(source, {
      sampleRate,
      AudioWorkletProcessor: class { port = { postMessage: (buffer: ArrayBuffer) => frames.push(buffer) }; },
      registerProcessor(name: string, ctor: any) { assert.equal(name, 'nanivio-mic-processor'); Processor = ctor; },
    });
    const processor = new Processor();
    for (let i = 0; i < sampleRate; i += 128) processor.process([[new Float32Array(Math.min(128, sampleRate - i)).fill(0.25)]]);
    assert.equal(frames.length, 5, `${sampleRate} Hz must yield five 200 ms normalized frames`);
    assert.ok(frames.every(bytes => bytes.byteLength === 6400));
    assert.equal(new DataView(frames[0]).getInt16(0, true), 8192);
    assert.equal(processor.samples.length, 0, 'Do not lose fractional resampling phase between render blocks');
  }
});
