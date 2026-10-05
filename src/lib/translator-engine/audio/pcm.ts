/**
 * PCM and Audio Formatting Utilities
 * Standardizes 16kHz mono audio buffers for ASR providers (Khaya, Sunbird, Azure)
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

  /**
   * Encodes Float32Array mono audio data into a valid RIFF WAV Blob
   */
  public static float32ToWavBlob(samples: Float32Array, sampleRate: number = 16000): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    this.writeString(view, 8, 'WAVE');

    // fmt sub-chunk (PCM format)
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
    view.setUint16(22, 1, true); // NumChannels (1 = Mono)
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
    view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
    view.setUint16(34, 16, true); // BitsPerSample (16-bit)

    // data sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // 16-bit PCM samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  public static audioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
    const channelData = audioBuffer.getChannelData(0);
    return this.float32ToWavBlob(channelData, audioBuffer.sampleRate);
  }

  private static writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}
