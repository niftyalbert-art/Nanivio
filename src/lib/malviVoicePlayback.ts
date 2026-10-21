// Voice-only diagnostics use the same server-produced PCM as the avatar.
// No browser TTS, replacement voice, or simulated provider responses.
export class MalviVoicePlayback {
  private context: AudioContext;
  private sources = new Set<AudioBufferSourceNode>();
  private nextStart = 0;
  private generation = 0;
  private closed = false;
  private startTimers = new Set<ReturnType<typeof setTimeout>>();
  constructor() { this.context = new AudioContext({ sampleRate: 24000 }); }
  async resume() { await this.context.resume(); }
  async play(encoded: string, events?: { onStart: (clock: () => number) => void; onEnd: () => void }) {
    const generation = this.generation;
    if (encoded.length > 4_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Invalid Malvi audio.');
    await this.resume();
    if (this.closed || generation !== this.generation) return;
    if (this.context.state !== 'running') throw new Error('Enable sound to hear Malvi.');
    const raw = atob(encoded);
    if (!raw.length || raw.length % 2) throw new Error('Invalid Malvi PCM.');
    const buffer = this.context.createBuffer(1, raw.length / 2, 24000);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      const unsigned = raw.charCodeAt(i * 2) | raw.charCodeAt(i * 2 + 1) << 8;
      samples[i] = (unsigned >= 32768 ? unsigned - 65536 : unsigned) / 32768;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source); source.disconnect();
      if (generation === this.generation) events?.onEnd();
    };
    const start = Math.max(this.context.currentTime, this.nextStart);
    source.start(start);
    this.nextStart = start + buffer.duration;
    if (events) {
      const timer = setTimeout(() => {
        this.startTimers.delete(timer);
        if (generation === this.generation && !this.closed) events.onStart(() => (this.context.currentTime - start) * 1000);
      }, Math.max(0, (start - this.context.currentTime) * 1000));
      this.startTimers.add(timer);
    }
  }
  interrupt() {
    this.generation++;
    this.startTimers.forEach(timer => clearTimeout(timer)); this.startTimers.clear();
    for (const source of this.sources) { try { source.stop(); } catch {} source.disconnect(); }
    this.sources.clear();
    this.nextStart = 0;
  }
  close() {
    this.closed = true;
    this.interrupt();
    void this.context.close().catch(() => {});
  }
}
