import assert from 'node:assert/strict';
import test from 'node:test';
import { MalviCaptionPlayer, malviCaptionAt, malviInputLevel, validMalviAlignment } from '../src/lib/malviSpeechTiming.ts';
import { createMalviSpeechSynthesizer } from '../src/server/assistant/malviSpeech.ts';

const track = () => ({
  durationMs: 1000,
  alignment: { characters: ['H', 'i', ' ', 'y', 'o', 'u'],
    character_start_times_seconds: [0.1, 0.2, 0.3, 0.5, 0.6, 0.7],
    character_end_times_seconds: [0.2, 0.3, 0.4, 0.6, 0.7, 0.8] },
});

test('subtitles follow provider timestamps, not token arrival; stop with audio', () => {
  assert.equal(malviCaptionAt(track(), null), '');
  assert.equal(malviCaptionAt(track(), -10), '');
  assert.equal(malviCaptionAt(track(), 0), '');
  assert.equal(malviCaptionAt(track(), 250), 'Hi');
  assert.equal(malviCaptionAt(track(), 650), 'Hi yo');
  assert.equal(malviCaptionAt(track(), 1000), '');
});

test('alignment rejects invalid, unbounded, unordered and mismatched timing arrays', () => {
  assert.ok(validMalviAlignment(track().alignment, 1000));
  for (const value of [null, {}, { ...track().alignment, characters: [] },
    { ...track().alignment, character_start_times_seconds: [0] },
    { ...track().alignment, character_start_times_seconds: [0.1, 0, 0.3, 0.5, 0.6, 0.7] },
    { ...track().alignment, character_end_times_seconds: [99, 0.3, 0.4, 0.6, 0.7, 0.8] }]) {
    assert.equal(validMalviAlignment(value, 1000), false);
  }
});

test('queued captions remain hidden until playback; pause, resume, interrupt and stale end are safe', () => {
  const updates: Array<[string, boolean]> = [];
  const player = new MalviCaptionPlayer((text, speaking) => updates.push([text, speaking]));
  const first = player.enqueue(track());
  const second = player.enqueue(track());
  assert.deepEqual(updates, []);
  player.start(() => 250, first);
  assert.deepEqual(updates.at(-1), ['Hi', true]);
  player.start(() => null, second);
  assert.deepEqual(updates.at(-1), ['', false]);
  player.finish(first); // An old voice source ending must not clear the new turn.
  player.finish(second);
  player.cancel();
  const count = updates.length;
  player.start(() => 600, first);
  assert.equal(updates.length, count, 'cancelled packets cannot restart subtitles');
});

test('subtitle window stays compact in non-Latin languages and never divides surrogate pairs', () => {
  const characters = Array.from('你好🙂'.repeat(70));
  const alignment = { characters, character_start_times_seconds: characters.map((_, i) => i / 1000),
    character_end_times_seconds: characters.map((_, i) => (i + 1) / 1000) };
  const caption = malviCaptionAt({ alignment, durationMs: 1000 }, 900);
  assert.equal(Array.from(caption).length, 110);
  assert.equal(caption.includes('\uFFFD'), false);
});

test('microphone meter distinguishes real PCM activity from silence', () => {
  assert.equal(malviInputLevel(Buffer.alloc(6400).toString('base64')), 0);
  const samples = Buffer.alloc(6400);
  for (let i = 0; i < samples.length; i += 2) samples.writeInt16LE(8000, i);
  assert.equal(malviInputLevel(samples.toString('base64')), 1);
});

test('timed synthesis uses one timestamp request with the same approved voice and raw PCM', async () => {
  let requests = 0;
  const synthesize = createMalviSpeechSynthesizer(
    () => ({ ELEVENLABS_API_KEY: 'fixture-key', MALVI_TTS_TRANSPORT: 'direct' }),
    async (url, init) => {
      requests++;
      assert.match(String(url), /\/with-timestamps\?output_format=pcm_24000$/);
      assert.equal(JSON.parse(String(init?.body)).model_id, 'eleven_multilingual_v2');
      return Response.json({ audio_base64: Buffer.alloc(48_000, 5).toString('base64'), normalized_alignment: track().alignment });
    }, undefined, true,
  );
  const audio = await synthesize('Hi you', 'en', new AbortController().signal);
  assert.equal(audio.length, 48_000);
  assert.deepEqual(audio.alignment, track().alignment);
  assert.equal(requests, 1);
});

test('missing timestamps fail explicitly without spending credits on another request', async () => {
  let requests = 0;
  const synthesize = createMalviSpeechSynthesizer(
    () => ({ ELEVENLABS_API_KEY: 'fixture-key', MALVI_TTS_TRANSPORT: 'direct' }),
    async () => { requests++; return Response.json({ audio_base64: Buffer.alloc(480, 5).toString('base64') }); },
    undefined, true,
  );
  await assert.rejects(synthesize('Hi', 'en', new AbortController().signal), /subtitle timestamps/);
  assert.equal(requests, 1);
});
