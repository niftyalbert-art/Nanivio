import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiNativeVoice } from '../src/server/assistant/geminiNativeVoice.ts';
import { applyMalviGeminiEffects, MalviGeminiEffectStream } from '../src/server/assistant/geminiVoiceEffects.ts';
import { estimatedMalviCaptionTrack, MalviCaptionPlayer } from '../src/lib/malviSpeechTiming.ts';
import { waitForMalviVideoFrame, MalviAvatarVideoGate } from '../src/lib/malviAvatarVideoGate.ts';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const pcm = (samples: number) => {
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(i / 20) * 6000), i * 2);
  return data;
};
test('native voice can start before completion and retains the closing audio without duplicating speech', () => {
  const voice = new GeminiNativeVoice(), input = pcm(48_000);
  voice.append(input.toString('base64'), 'audio/pcm;rate=24000');
  assert.equal(voice.ready('The answer is'), true);
  const opening = voice.finish('The answer is', false)!;
  assert.equal(opening.durationMs, 1980);
  const ending = voice.finish('forty two.', true)!;
  assert.equal(ending.durationMs, 231);
  const joined = Buffer.concat([Buffer.from(opening.pcm24k, 'base64'), Buffer.from(ending.pcm24k, 'base64')]);
  assert.deepEqual(joined, applyMalviGeminiEffects(input).pcm, 'Filter and echo history cross packet boundaries without a leading gap');
  assert.equal(voice.finish(''), null);
});
test('streaming cancellation discards queued audio while keeping lifetime safety limits', () => {
  const voice = new GeminiNativeVoice();
  const audio = pcm(25_000).toString('base64');
  voice.append(audio, 'audio/pcm;rate=24000');
  voice.finish('An opening.', false);
  voice.cancel();
  assert.equal(voice.finish(''), null);
  for (let i = 0; i < 29; i++) { voice.append(audio, 'audio/pcm;rate=24000'); voice.finish('Next turn.'); }
  voice.append(audio, 'audio/pcm;rate=24000');
  assert.throws(() => voice.finish('Over the limit.'), /usage limit/);
});
test('streaming does not reset the per-turn audio or character budgets', () => {
  const voice = new GeminiNativeVoice();
  voice.append(pcm(1_000_000).toString('base64'), 'audio/pcm;rate=24000');
  voice.finish('Opening.', false);
  assert.throws(() => voice.append(pcm(1_000_000).toString('base64'), 'audio/pcm;rate=24000'), /audio safety limit/);
  const characters = new GeminiNativeVoice();
  characters.append(pcm(25_000).toString('base64'), 'audio/pcm;rate=24000');
  characters.finish('a'.repeat(700), false);
  characters.append(pcm(25_000).toString('base64'), 'audio/pcm;rate=24000');
  assert.throws(() => characters.finish('b'.repeat(700)), /usage limit/);
});
test('trailing audio without more transcription remains playable without invented captions', () => {
  const voice = new GeminiNativeVoice();
  voice.append(pcm(25_000).toString('base64'), 'audio/pcm;rate=24000');
  voice.finish('The complete spoken text.', false);
  const tail = voice.finish('')!;
  assert.equal(tail.text, '');
  const player = new MalviCaptionPlayer(() => {});
  assert.doesNotThrow(() => player.enqueue(estimatedMalviCaptionTrack(tail.text, tail.durationMs, tail.speechDurationMs, true)));
});
test('streaming effects are continuous and do not append a reverb tail to every packet', () => {
  const input = pcm(48_000), stream = new MalviGeminiEffectStream();
  const first = stream.process(input.subarray(0, 48_000));
  const last = stream.process(input.subarray(48_000), true);
  assert.equal(first.pcm.length, 48_000);
  assert.deepEqual(Buffer.concat([first.pcm, last.pcm]), applyMalviGeminiEffects(input).pcm);
});

function videoFixture() {
  const frames = new Map<number, () => void>();
  let id = 0;
  const video = {
    requestVideoFrameCallback: (callback: () => void) => { frames.set(++id, callback); return id; },
    cancelVideoFrameCallback: (key: number) => { frames.delete(key); },
  } as unknown as HTMLVideoElement;
  return { video, frames, frame: () => { for (const [key, callback] of [...frames]) { frames.delete(key); callback(); } } };
}
test('avatar speech waits for a decoded video frame, not just a provider-ready event', async () => {
  const fixture = videoFixture(), controller = new AbortController();
  let played = false;
  const waiting = waitForMalviVideoFrame(fixture.video, controller.signal).then(() => { played = true; });
  await tick(); assert.equal(played, false);
  fixture.frame(); await waiting; assert.equal(played, true);
});
test('frozen video times out and an interrupt cancels pending frame callbacks', async () => {
  const fixture = videoFixture(), controller = new AbortController();
  await assert.rejects(waitForMalviVideoFrame(fixture.video, controller.signal, 10), /not rendering/);
  assert.equal(fixture.frames.size, 0);
  const waiting = waitForMalviVideoFrame(fixture.video, controller.signal);
  controller.abort();
  await assert.rejects(waiting, /cancelled/);
  assert.equal(fixture.frames.size, 0);
});
test('ordered avatar delivery is bounded, and cancelled packets cannot play in the next turn', async () => {
  const fixture = videoFixture(), delivered: number[] = [], errors: string[] = [];
  const gate = new MalviAvatarVideoGate(() => fixture.video, message => errors.push(message));
  gate.enqueue(1000, () => delivered.push(1));
  gate.enqueue(1000, () => delivered.push(2));
  await tick(); fixture.frame(); await tick();
  assert.deepEqual(delivered, [1]);
  gate.cancel(); fixture.frame(); await tick();
  assert.deepEqual(delivered, [1]);
  gate.enqueue(1000, () => delivered.push(3));
  await tick(); fixture.frame(); await tick();
  assert.deepEqual(delivered, [1, 3]);
  assert.throws(() => gate.enqueue(66_000, () => {}), /safety limit/);
  gate.cancel(); assert.deepEqual(errors, []);
});
test('older browsers wait for playable media and still allow cancellation', async () => {
  const video = { readyState: 0, paused: true } as HTMLVideoElement;
  const controller = new AbortController();
  const pending = waitForMalviVideoFrame(video, controller.signal);
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  await waitForMalviVideoFrame({ readyState: 2, paused: false } as HTMLVideoElement, new AbortController().signal);
});
