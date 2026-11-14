/**
 * A stable call-owned output: microphone between phrases, translated speech
 * during playback. Recognition must borrow the original microphone, not this
 * destination (otherwise received/generated speech can be transcribed again).
 */
export class CallTranslationMixer {
  private microphone: MediaStreamAudioSourceNode;
  private gain: GainNode;
  private destination: MediaStreamAudioDestinationNode;
  private pending: { source: AudioBufferSourceNode; finish: (played: boolean) => void } | null = null;
  private disposed = false;

  constructor(private context: AudioContext, microphone: MediaStreamTrack) {
    this.microphone = context.createMediaStreamSource(new MediaStream([microphone]));
    this.gain = context.createGain();
    this.destination = context.createMediaStreamDestination();
    this.microphone.connect(this.gain);
    this.gain.connect(this.destination);
  }

  get track() { return this.destination.stream.getAudioTracks()[0]; }

  play(buffer: AudioBuffer): Promise<boolean> {
    if (this.disposed || this.pending) return Promise.resolve(false);
    return new Promise(resolve => {
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.destination);
      let settled = false;
      const finish = (played: boolean) => {
        if (settled) return;
        settled = true;
        source.onended = null;
        source.disconnect();
        if (this.pending?.source === source) this.pending = null;
        if (!this.disposed) this.gain.gain.value = 1;
        resolve(played);
      };
      this.pending = { source, finish };
      // Never send original speech over the translated sentence.
      this.gain.gain.value = 0;
      source.onended = () => finish(true);
      try { source.start(0); } catch { finish(false); }
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const pending = this.pending;
    pending?.finish(false);
    try { pending?.source.stop(); } catch {}
    this.microphone.disconnect();
    this.gain.disconnect();
    // This owns only its output. Never stop the borrowed microphone or close
    // the shared AudioContext; call teardown owns those.
    this.destination.stream.getTracks().forEach(track => track.stop());
  }
}
