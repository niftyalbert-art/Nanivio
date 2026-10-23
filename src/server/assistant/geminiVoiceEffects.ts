import { MAX_SPEECH_BYTES } from './malviSpeech.ts';

const SAMPLE_RATE = 24_000;
// Same room-reflection delays and levels as the approved edited recording.
const REFLECTIONS = [
  [19, 0.085], [31, 0.07], [47, 0.055], [73, 0.04],
  [109, 0.03], [157, 0.03], [211, 0.022],
].map(([ms, gain]) => ({ samples: Math.round(ms * SAMPLE_RATE / 1000), gain }));
export const MALVI_GEMINI_TAIL_SAMPLES = REFLECTIONS.at(-1)!.samples;

/**
 * Bounded mono PCM16 processing before either avatar or voice-only playback.
 * No independent audio source, resampling, pitch-shift or leading delay.
 */
export function applyMalviGeminiEffects(pcm: Buffer) {
  if (!pcm.length || pcm.length % 2
    || pcm.length + MALVI_GEMINI_TAIL_SAMPLES * 2 > MAX_SPEECH_BYTES) {
    throw new Error('Malvi’s styled voice exceeded the PCM safety limit.');
  }
  const inputSamples = pcm.length / 2;
  const totalSamples = inputSamples + MALVI_GEMINI_TAIL_SAMPLES;
  const output = new Float32Array(totalSamples);
  const history = new Float64Array(MALVI_GEMINI_TAIL_SAMPLES + 1);

  // 65 Hz, two-pole Butterworth high-pass, matching the sample's rumble filter.
  const w = 2 * Math.PI * 65 / SAMPLE_RATE;
  const cos = Math.cos(w), alpha = Math.sin(w) / Math.SQRT2;
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / (2 * a0), b1 = -(1 + cos) / a0, b2 = b0;
  const a1 = -2 * cos / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, peak = 0;
  for (let n = 0; n < totalSamples; n++) {
    let filtered = 0;
    if (n < inputSamples) {
      const x = pcm.readInt16LE(n * 2) / 32768;
      filtered = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = filtered;
    }
    history[n % history.length] = filtered;
    let wet = 0;
    for (const reflection of REFLECTIONS) {
      if (n >= reflection.samples) wet += history[(n - reflection.samples) % history.length] * reflection.gain;
    }
    const value = 0.95 * (0.8 * filtered + wet);
    output[n] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  // Usually unity. If necessary, reduce the whole turn rather than clipping
  // peaks or introducing a limiter's look-ahead delay into avatar timing.
  const gain = peak > 0.95 ? 0.95 / peak : 1;
  const processed = Buffer.alloc(totalSamples * 2);
  for (let n = 0; n < totalSamples; n++) {
    processed.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(output[n] * gain * 32768))), n * 2);
  }
  return { pcm: processed, speechDurationMs: inputSamples / 24, durationMs: totalSamples / 24 };
}
