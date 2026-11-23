/**
 * Conservative local barge-in candidate, NOT ASR or a guarantee of genuine
 * speech. Provider VAD still sees all frames. Only use with browser-processed
 * echo cancellation; isolated loud frames must not stop the assistant.
 */
export class SustainedSpeechGate {
  private candidates = 0;
  private noiseFloor = 0.002;
  update(rms: number, eligible: boolean) {
    if (!Number.isFinite(rms) || rms < 0) { this.reset(); return false; }
    const threshold = Math.max(0.009, this.noiseFloor * 3);
    if (rms < threshold) {
      this.noiseFloor = this.noiseFloor * 0.95 + Math.min(rms, 0.02) * 0.05;
      this.candidates = 0;
      return false;
    }
    if (!eligible) { this.candidates = 0; return false; }
    // Two consecutive 200 ms frames reject clicks and short capture transients.
    this.candidates++;
    if (this.candidates !== 2) return false;
    return true;
  }
  reset() { this.candidates = 0; }
}
