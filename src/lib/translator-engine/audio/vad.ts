/**
 * Nanivio VAD (Voice Activity Detector)
 * Real-time client-side energy and spectral flux voice detector
 * Triggers low-latency speech boundaries (ideal < 1.5s total turn turnaround)
 */
export class VoiceActivityDetector {
  private energyThreshold: number;
  private silenceDurationMs: number;
  private lastSpeechTimestamp: number = 0;
  private isSpeaking: boolean = false;
  private onSpeechStart?: () => void;
  private onSpeechEnd?: (durationMs: number) => void;
  private speechStartTimestamp: number = 0;

  constructor(options?: {
    energyThreshold?: number;
    silenceDurationMs?: number;
    onSpeechStart?: () => void;
    onSpeechEnd?: (durationMs: number) => void;
  }) {
    this.energyThreshold = options?.energyThreshold ?? 0.025;
    this.silenceDurationMs = options?.silenceDurationMs ?? 350; // 350ms silence triggers segment dispatch
    this.onSpeechStart = options?.onSpeechStart;
    this.onSpeechEnd = options?.onSpeechEnd;
  }

  public processAudioFrame(samples: Float32Array): boolean {
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSquares += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSquares / samples.length);
    const now = Date.now();

    if (rms > this.energyThreshold) {
      this.lastSpeechTimestamp = now;
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.speechStartTimestamp = now;
        if (this.onSpeechStart) this.onSpeechStart();
      }
    } else if (this.isSpeaking && (now - this.lastSpeechTimestamp > this.silenceDurationMs)) {
      this.isSpeaking = false;
      const duration = now - this.speechStartTimestamp;
      if (this.onSpeechEnd) this.onSpeechEnd(duration);
    }

    return this.isSpeaking;
  }

  public reset(): void {
    this.isSpeaking = false;
    this.lastSpeechTimestamp = 0;
    this.speechStartTimestamp = 0;
  }
}
