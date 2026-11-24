import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

// Actual player code, no microphone, provider, network or real account.
const bundle = await build({
  entryPoints: ['src/services/liveCallTranslation.ts'],
  bundle: true, platform: 'node', format: 'cjs', write: false,
  plugins: [{
    name: 'isolated-translation-player',
    setup(builder) {
      builder.onResolve({ filter: /realtimeClient$/ }, () => ({ path: 'transport', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: 'export const realtimeClient={send(){throw Error("No transport expected")},on(){return ()=>{}}};',
      }));
    },
  }],
});
const module = { exports: {} as any };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
  createRequire(import.meta.url), module, module.exports);

function fixture() {
  const scheduled: number[] = [];
  let allocations = 0;
  const context = {
    currentTime: 10, state: 'running', destination: {},
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
    createBuffer: (_channels: number, length: number, rate: number) => {
      allocations++;
      return { duration: length / rate, getChannelData: () => new Float32Array(length) };
    },
    createBufferSource: () => ({
      buffer: null, onended: null, connect() {}, disconnect() {}, stop() {},
      start(at: number) { scheduled.push(at); },
    }),
  };
  const player = new module.exports.TranslationPcmPlayer(context);
  player.begin('fixture-stream');
  const push = (seconds: number, sequence: number) => player.push({
    streamId: 'fixture-stream', sequence,
    data: Buffer.alloc(Math.round(seconds * 24_000) * 2).toString('base64'),
  });
  return { context, player, push, scheduled, allocations: () => allocations };
}

test('a single oversized PCM packet cannot bypass the six-second playback bound', () => {
  const f = fixture();
  assert.throws(() => f.push(7, 0), /fell behind/);
  assert.equal(f.allocations(), 0, 'reject before allocating a playback buffer');
  assert.equal(f.scheduled.length, 0);
  assert.equal(f.player.isPlaying(), false);
  f.player.dispose();
});

test('the incoming packet cannot extend an already buffered stream beyond the bound', () => {
  const f = fixture();
  f.push(2.5, 0);
  f.push(2.5, 1);
  assert.throws(() => f.push(2.5, 2), /fell behind/);
  assert.equal(f.scheduled.length, 2);
  assert.equal(f.allocations(), 2);
  f.player.dispose();
});

test('normally paced packets retain uninterrupted scheduling and admit audio after draining', () => {
  const f = fixture();
  f.push(2.5, 0);
  f.push(2.5, 1);
  assert.ok(Math.abs(f.scheduled[0] - 10.06) < 0.001);
  assert.ok(Math.abs(f.scheduled[1] - 12.56) < 0.001);
  f.context.currentTime = 13;
  f.push(2.5, 2);
  assert.ok(Math.abs(f.scheduled[2] - 15.06) < 0.001);
  assert.equal(f.allocations(), 3);
  f.player.dispose();
});
