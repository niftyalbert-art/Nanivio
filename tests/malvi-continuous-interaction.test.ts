import assert from 'node:assert/strict';
import test from 'node:test';
import { MalviPlaybackGuard } from '../src/lib/malviPlaybackGuard.ts';
import { SustainedSpeechGate } from '../src/lib/nanivioMic/SustainedSpeechGate.ts';
import { NanivioMicEngine, type NanivioMicSnapshot } from '../src/lib/nanivioMic/NanivioMicEngine.ts';
import { NANIVIO_MIC_EVENTS as E, type NanivioMicStatus } from '../src/shared/nanivioMicProtocol.ts';

test('interruption invalidates deferred playback failures and waits for ordered server acknowledgement', () => {
  const guard = new MalviPlaybackGuard();
  const oldPlay = guard.checkpoint();
  assert.equal(oldPlay(), true);
  guard.cancel(true);
  assert.equal(oldPlay(), false);
  assert.equal(guard.blocked, true);
  const duringCancel = guard.checkpoint();
  assert.equal(duringCancel(), false);
  guard.cancel(); guard.acknowledge();
  assert.equal(oldPlay(), false, 'An old rejected play promise must not restore blocked audio');
  assert.equal(duringCancel(), false, 'Even a checkpoint created during interruption is invalidated by the ordered event');
  assert.equal(guard.checkpoint()(), true);
});

test('every repeated interruption creates a new playback boundary without changing language or conversation objects', () => {
  const guard = new MalviPlaybackGuard();
  const old: Array<() => boolean> = [];
  for (let turn = 0; turn < 10; turn++) {
    old.push(guard.checkpoint());
    guard.cancel(true);
    assert.ok(old.every(check => !check()));
    guard.cancel(); guard.acknowledge();
    assert.equal(guard.checkpoint()(), true);
  }
});

test('sustained-input gate rejects clicks, silence, invalid levels and ineligible capture', () => {
  const gate = new SustainedSpeechGate();
  for (let i = 0; i < 20; i++) {
    assert.equal(gate.update(0.15, true), false);
    assert.equal(gate.update(0, true), false);
  }
  assert.equal(gate.update(0.04, true), false);
  assert.equal(gate.update(0.04, true), true);
  assert.equal(gate.update(0.04, true), false, 'Only once per uninterrupted candidate');
  assert.equal(gate.update(Number.NaN, true), false);
  assert.equal(gate.update(0.04, false), false);
  assert.equal(gate.update(0.04, true), false);
  assert.equal(gate.update(0.04, true), true);
});

function engineFixture(echoCancellation: boolean | null) {
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const streamId = '22222222-2222-4222-8222-222222222222';
  let frame!: (pcm: ArrayBuffer) => void;
  let receive!: (status: NanivioMicStatus) => void;
  let output = true, interrupts = 0, starts = 0, stops = 0, now = 0;
  const sent: any[] = [], snapshots: NanivioMicSnapshot[] = [];
  const engine = new NanivioMicEngine({
    sessionId, streamId, now: () => now,
    capture: {
      async start(onFrame, _error, _signal, onProcessing) {
        starts++; frame = onFrame; onProcessing?.({ echoCancellation });
      },
      stop() { stops++; },
    },
    transport: {
      send(type, payload) { sent.push({ type, payload }); return true; },
      subscribe(listener) { receive = listener; return () => {}; },
    },
    canInterrupt: () => output,
    onBargeIn() { interrupts++; output = false; },
    onState: state => snapshots.push(state),
  });
  return {
    engine, sent, snapshots,
    start: async () => {
      await engine.start();
      receive({ sessionId, streamId, version: 1, state: 'ready' });
    },
    frame: (sample = 0) => {
      now += 200;
      const bytes = new ArrayBuffer(6400);
      const view = new DataView(bytes);
      for (let i = 0; i < bytes.byteLength; i += 2) view.setInt16(i, i % 4 ? sample : -sample, true);
      frame(bytes);
      const audio = sent.filter(e => e.type === E.audio);
      if (audio.length) receive({ sessionId, streamId, version: 1, state: 'receiving', lastSequence: audio.length });
    },
    response: () => { output = true; },
    counts: () => ({ starts, stops, interrupts }),
  };
}

test('30 seconds of assistant speech keeps one capture and all silent PCM frames flowing', async () => {
  const f = engineFixture(true);
  try {
    await f.start();
    for (let i = 0; i < 150; i++) f.frame();
    assert.deepEqual(f.counts(), { starts: 1, stops: 0, interrupts: 0 });
    assert.equal(f.sent.filter(e => e.type === E.audio).length, 150);
    assert.equal(f.snapshots.at(-1)!.captureActive, true);
    assert.equal(f.snapshots.at(-1)!.serverReceiving, true);
  } finally { f.engine.stop(); }
});

test('repeated overlapping user input interrupts output but never restarts capture or drops input', async () => {
  const f = engineFixture(true);
  try {
    await f.start();
    for (let turn = 0; turn < 5; turn++) {
      f.response();
      f.frame(1500); f.frame(1500);
      assert.equal(f.counts().interrupts, turn + 1);
      for (let i = 0; i < 5; i++) f.frame();
    }
    assert.equal(f.counts().starts, 1);
    assert.equal(f.counts().stops, 0);
    assert.equal(f.sent.filter(e => e.type === E.audio).length, 35);
  } finally { f.engine.stop(); }
});

test('unconfirmed or disabled echo cancellation never enables amplitude-triggered local interruption', async () => {
  for (const echo of [false, null]) {
    const f = engineFixture(echo);
    try {
      await f.start();
      for (let i = 0; i < 5; i++) f.frame(3000);
      assert.equal(f.counts().interrupts, 0);
      assert.equal(f.sent.filter(e => e.type === E.audio).length, 5, 'Provider still receives input for recognition/VAD');
      assert.match(f.snapshots.at(-1)!.warning, /headphones/);
    } finally { f.engine.stop(); }
  }
});
