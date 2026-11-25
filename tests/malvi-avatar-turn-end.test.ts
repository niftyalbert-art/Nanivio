import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { MalviAvatarVideoGate } from '../src/lib/malviAvatarVideoGate.ts';
import { MalviAvatarAudioStream } from '../src/lib/malviAvatarAudioStream.ts';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture() {
  const frames = new Map<number, () => void>();
  let next = 0;
  const video = {
    requestVideoFrameCallback(callback: () => void) { frames.set(++next, callback); return next; },
    cancelVideoFrameCallback(id: number) { frames.delete(id); },
  } as unknown as HTMLVideoElement;
  const messages: { type: string; event_id: string }[] = [];
  const failures: string[] = [];
  const audio = new MalviAvatarAudioStream(json => messages.push(JSON.parse(json)), () => 'current-turn');
  const gate = new MalviAvatarVideoGate(() => video, error => failures.push(error));
  return { gate, audio, messages, failures,
    frame() {
      const entry = frames.entries().next().value;
      assert.ok(entry, 'A queued operation must wait for a fresh rendered frame');
      frames.delete(entry[0]); entry[1]();
    },
  };
}

test('completion stays behind all PCM queued during renderer startup', async () => {
  const f = fixture();
  f.gate.enqueue(400, () => f.audio.append('AAA=', false));
  f.gate.enqueue(400, () => f.audio.append('AAA=', false));
  f.gate.complete(() => f.audio.finish());
  await tick();
  assert.equal(f.messages.length, 0);
  f.frame(); await tick();
  assert.deepEqual(f.messages.map(m => m.type), ['agent.speak']);
  f.frame(); await tick();
  assert.deepEqual(f.messages.map(m => m.type), ['agent.speak', 'agent.speak', 'agent.speak_end']);
  assert.ok(f.messages.every(m => m.event_id === 'current-turn'));
  assert.deepEqual(f.failures, []);
  f.gate.cancel();
});

test('interruption cancels both queued speech and its pending completion', async () => {
  const f = fixture();
  f.gate.enqueue(400, () => f.audio.append('AAA=', false));
  f.gate.complete(() => f.audio.finish());
  await tick();
  f.gate.cancel(); f.audio.cancel();
  await tick();
  assert.deepEqual(f.messages, []);
  assert.deepEqual(f.failures, []);
});

test('the controller subscribes, queues and unsubscribes authoritative turn completion', () => {
  const controller = readFileSync(new URL('../src/components/malvi/MalviLiveAssistant.tsx', import.meta.url), 'utf8');
  assert.match(controller, /on\('malvi:brain_turn_end', payload\s*=>\s*handleAudio\(\{ \.\.\.payload, avatarTurnEnd: true, durationMs: 0 \}\)/);
  assert.match(controller, /videoGate\.current\?\.complete\(\(\) => \{/);
  assert.match(controller, /avatar\.finishAudio\?\.\(\)/);
  assert.match(controller, /offTurnEnd\(\)/);
});

test('EOF support does not relax real audio-duration validation', () => {
  const f = fixture();
  for (const duration of [0, -1, NaN, Infinity, 200_001]) {
    assert.throws(() => f.gate.enqueue(duration, () => {}), /safety limit/);
  }
  f.gate.cancel();
});
