/**
 * PCM and Audio Formatting Utilities
 * Standardizes 16kHz mono audio buffers for ASR providers (Khaya, Sunbird, Palabra)
 */
export class PcmUtils {
  public static floatTo16BitPcm(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }

  public static resampleTo16k(input: Float32Array, currentSampleRate: number): Float32Array {
    if (currentSampleRate === 16000) return input;
    const ratio = currentSampleRate / 16000;
    const newLength = Math.round(input.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const index = Math.floor(i * ratio);
      result[i] = input[Math.min(index, input.length - 1)];
    }
    return result;
  }

  public static computeAudioEnergy(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += Math.abs(samples[i]);
    }
    return sum / samples.length;
  }
}
