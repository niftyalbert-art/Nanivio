// Nanivio-owned PCM normalization. No speech-recognition service or window APIs.
class NanivioMicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = [];
    this.ratio = sampleRate / 16000;
    this.remaining = this.ratio;
    this.energy = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    const channel = channels?.[0];
    if (!channel) return true;
    // Weighted area resampling retains fractional phase across render blocks,
    // including the common 44.1/48 kHz browser and native-device rates.
    for (let i = 0; i < channel.length; i++) {
      // Some devices ignore mono capture constraints. Do not discard a
      // right-channel microphone; normalize all supplied channels to mono.
      let sample = 0;
      for (const input of channels) sample += input[i] || 0;
      sample /= channels.length;
      let weight = 1;
      while (weight > 1e-9) {
        const used = Math.min(weight, this.remaining);
        this.energy += sample * used;
        this.remaining -= used; weight -= used;
        if (this.remaining < 1e-9) {
          this.samples.push(Math.round(Math.max(-1, Math.min(1, this.energy / this.ratio)) * 32767));
          this.energy = 0; this.remaining = this.ratio;
        }
      }
    }
    while (this.samples.length >= 3200) {
      const samples = this.samples.splice(0, 3200);
      const bytes = new Uint8Array(6400);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < samples.length; i++) view.setInt16(i * 2, samples[i], true);
      this.port.postMessage(bytes.buffer, [bytes.buffer]);
    }
    return true;
  }
}
registerProcessor('nanivio-mic-processor', NanivioMicProcessor);
