import { AudioSegment } from '../types';

/**
 * Audio Segmentation Manager
 * Groups audio into bounded segments (between 1.0s and 4.0s)
 * preventing latency accumulation during continuous natural speech
 */
export class AudioSegmenter {
  private buffer: Float32Array[] = [];
  private totalSamples: number = 0;
  private readonly sampleRate: number;
  private readonly maxSegmentDurationSec: number;

  constructor(sampleRate: number = 16000, maxSegmentDurationSec: number = 3.5) {
    this.sampleRate = sampleRate;
    this.maxSegmentDurationSec = maxSegmentDurationSec;
  }

  public pushFrame(frame: Float32Array): AudioSegment | null {
    this.buffer.push(frame);
    this.totalSamples += frame.length;

    const currentDurationSec = this.totalSamples / this.sampleRate;
    if (currentDurationSec >= this.maxSegmentDurationSec) {
      return this.flush(true);
    }
    return null;
  }

  public flush(isFinal: boolean = false): AudioSegment | null {
    if (this.totalSamples === 0) return null;

    const merged = new Float32Array(this.totalSamples);
    let offset = 0;
    for (const chunk of this.buffer) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const durationMs = Math.round((this.totalSamples / this.sampleRate) * 1000);
    const segment: AudioSegment = {
      id: `seg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      pcmData: merged,
      sampleRate: this.sampleRate,
      durationMs,
      timestamp: Date.now(),
      isFinal,
    };

    this.buffer = [];
    this.totalSamples = 0;
    return segment;
  }

  public clear(): void {
    this.buffer = [];
    this.totalSamples = 0;
  }
}
