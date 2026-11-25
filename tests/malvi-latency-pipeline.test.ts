import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { markMalviPacketSent, malviTurnTimingSummary, newMalviTurnTiming } from '../src/server/assistant/malviTurnTiming.ts';
import { createMalviSpeechQueue } from '../src/server/assistant/malviSpeech.ts';
import { malviOpeningBoundary } from '../src/server/assistant/malviResponsePacing.ts';

test('turn timing reports first-audio latency and playback underruns', () => {
  const timing = newMalviTurnTiming();
  timing.userAt = 1000;
  timing.firstModelAudioAt = 1400;
  markMalviPacketSent(timing, 200, 1450);
  markMalviPacketSent(timing, 200, 1600);
  markMalviPacketSent(timing, 200, 2100);
  const summary = malviTurnTimingSummary(timing);
  assert.equal(summary.userToFirstModelAudioMs, 400);
  assert.equal(summary.userToFirstAudioSentMs, 450);
  assert.equal(summary.modelToFirstAudioSentMs, 50);
  assert.equal(summary.maxPacketGapMs, 500);
  assert.equal(summary.packets, 3);
  assert.equal(summary.audioMs, 600);
  assert.equal(summary.underruns, 1, 'third packet arrived after the first two had finished playing');
  assert.equal(summary.underrunMs, 250);
});

test('speech queue exposes its depth for bounded sentence streaming', async () => {
  const releases: Array<() => void> = [];
  const queue = createMalviSpeechQueue(() => new Promise(resolve => releases.push(() => resolve(Object.assign(Buffer.alloc(4), { alignment: undefined }) as any))));
  const first = queue.speak('First sentence that is long enough.', 'en');
  const second = queue.speak('Second sentence that is long enough.', 'en');
  assert.equal(queue.queued, 2);
  await new Promise(r => setImmediate(r));
  releases.shift()!();
  await first;
  await new Promise(r => setImmediate(r));
  releases.shift()!();
  await second;
  assert.equal(queue.queued, 0);
});

test('successive phrases are each releasable, not only the opening', () => {
  let text = 'Here is the first full sentence for you. And here is a second full sentence too. Short.';
  const phrases: string[] = [];
  for (let cut = malviOpeningBoundary(text); cut; cut = malviOpeningBoundary(text)) {
    phrases.push(text.slice(0, cut).trim());
    text = text.slice(cut);
  }
  assert.deepEqual(phrases, ['Here is the first full sentence for you.', 'And here is a second full sentence too.']);
  assert.equal(text.trim(), 'Short.', 'a short remainder waits for turn end');
});

test('ElevenLabs replies stream every phrase and report turn timing', async () => {
  const source = await readFile(new URL('../src/server/assistant/liveBrain.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /flushOpening/);
  assert.match(source, /function flushSentences[\s\S]*connection\.speech\.queued < 2/);
  assert.match(source, /'malvi:brain_turn_end', \{ sessionId: connection\.sessionId, timing: summary \}/);
});
