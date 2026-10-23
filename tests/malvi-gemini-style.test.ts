import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { MALVI_GEMINI_VOICE, malviGeminiVoiceDirection } from '../src/server/assistant/geminiVoiceStyle.ts';
import { applyMalviGeminiEffects, MALVI_GEMINI_TAIL_SAMPLES } from '../src/server/assistant/geminiVoiceEffects.ts';
import { MAX_SPEECH_BYTES } from '../src/server/assistant/malviSpeech.ts';

function tone(samples = 24000, amplitude = 20000, frequency = 440) {
  const pcm = Buffer.alloc(samples * 2);
  for (let n = 0; n < samples; n++) pcm.writeInt16LE(Math.round(amplitude * Math.sin(2 * Math.PI * frequency * n / 24000)), n * 2);
  return pcm;
}
function peak(pcm: Buffer) {
  let max = 0;
  for (let n = 0; n < pcm.length; n += 2) max = Math.max(max, Math.abs(pcm.readInt16LE(n)));
  return max;
}

test('approved Sulafat direction keeps brand pronunciation and applies English accent rules only to English', () => {
  assert.equal(MALVI_GEMINI_VOICE, 'Sulafat');
  assert.match(malviGeminiVoiceDirection('en'), /British English and light Ghanaian English/);
  assert.match(malviGeminiVoiceDirection('en'), /"Na ni vio"/);
  assert.match(malviGeminiVoiceDirection('en'), /Do not say "nani-viyo"/);
  assert.match(malviGeminiVoiceDirection('en'), /Do not imitate an echo/);
  for (const code of ['fr', 'ak', 'ja', 'ar']) {
    const direction = malviGeminiVoiceDirection(code);
    assert.match(direction, /Do not switch to English/);
    assert.doesNotMatch(direction, /British English and light Ghanaian English/);
    assert.match(direction, /"Na ni vio"/);
  }
});

test('styled PCM starts immediately, has bounded reflected audio and accurate speech/tail durations', () => {
  const impulse = Buffer.alloc(480);
  impulse.writeInt16LE(16000, 0);
  const original = Buffer.from(impulse);
  const styled = applyMalviGeminiEffects(impulse);
  assert.deepEqual(impulse, original, 'Do not mutate provider bytes');
  assert.equal(styled.speechDurationMs, 10);
  assert.equal(styled.durationMs, 221);
  assert.equal(styled.pcm.length, impulse.length + MALVI_GEMINI_TAIL_SAMPLES * 2);
  assert.ok(styled.pcm.readInt16LE(0) > 0, 'No leading delay or second playback clock');
  assert.ok(peak(styled.pcm.subarray(impulse.length)) > 0, 'Reflection tail must be real audio');
  assert.ok(peak(styled.pcm) <= Math.ceil(32768 * 0.95));
  assert.deepEqual(styled.pcm, applyMalviGeminiEffects(impulse).pcm, 'No residual effect state across turns');
});

test('effects are deterministic, handle silence and hard peaks, and enforce the post-effect byte bound', () => {
  const silence = applyMalviGeminiEffects(Buffer.alloc(480));
  assert.equal(peak(silence.pcm), 0);
  const loud = tone(24000, 32767, 700);
  const processed = applyMalviGeminiEffects(loud);
  assert.ok(peak(processed.pcm) <= Math.ceil(32768 * 0.95));
  assert.notDeepEqual(processed.pcm.subarray(0, loud.length), loud);
  for (const invalid of [Buffer.alloc(0), Buffer.alloc(1), Buffer.alloc(MAX_SPEECH_BYTES)]) {
    assert.throws(() => applyMalviGeminiEffects(invalid), /PCM safety limit/);
  }
  const maxInput = Buffer.alloc(MAX_SPEECH_BYTES - MALVI_GEMINI_TAIL_SAMPLES * 2);
  assert.equal(applyMalviGeminiEffects(maxInput).pcm.length, MAX_SPEECH_BYTES);
});

test('ambience matches the approved recording filter without a production ffmpeg dependency', t => {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); }
  catch { t.skip('Optional offline comparison requires ffmpeg'); return; }
  const input = tone(12000, 12000);
  const reference = execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', 'pipe:0',
    '-af', 'highpass=f=65,aecho=0.8:0.95:19|31|47|73|109|157|211:0.085|0.07|0.055|0.04|0.03|0.03|0.022',
    '-f', 's16le', '-acodec', 'pcm_s16le', 'pipe:1',
  ], { input, maxBuffer: 1_000_000 });
  const result = applyMalviGeminiEffects(input).pcm;
  assert.equal(result.length, reference.length);
  let squared = 0;
  for (let n = 0; n < result.length; n += 2) {
    squared += (result.readInt16LE(n) - reference.readInt16LE(n)) ** 2;
  }
  // Slight intermediate PCM quantization differences are expected.
  assert.ok(Math.sqrt(squared / (result.length / 2)) < 4, 'Preserve the approved filter character');
});
