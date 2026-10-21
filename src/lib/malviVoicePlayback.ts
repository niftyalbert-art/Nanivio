// Voice-only diagnostics use the same server-produced PCM as the avatar.
// No browser TTS, replacement voice, or simulated provider responses.
export class MalviVoicePlayback {
  private context: AudioContext;
  private sources = new Set<AudioBufferSourceNode>();
  private nextStart = 0;
  private generation = 0;
  private closed = false;
  constructor() { this.context = new AudioContext({ sampleRate: 24000 }); }
  async resume() { await this.context.resume(); }
  async play(encoded: string) {
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
    source.onended = () => { this.sources.delete(source); source.disconnect(); };
    const start = Math.max(this.context.currentTime, this.nextStart);
    source.start(start);
    this.nextStart = start + buffer.duration;
  }
  interrupt() {
    this.generation++;
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
