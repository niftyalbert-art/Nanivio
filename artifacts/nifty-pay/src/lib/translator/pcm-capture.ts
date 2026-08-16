export class PcmCapture {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private ownsStream = false;

  async start(
    onAudio: (pcm: ArrayBuffer) => void,
    existingTrack?: MediaStreamTrack,
  ) {
    if (this.context) return;

    /*
     * During an Agora call, reuse Agora's existing microphone track.
     * Standalone translator mode falls back to getUserMedia().
     */
    if (existingTrack) {
      this.stream = new MediaStream([existingTrack]);
      this.ownsStream = false;
    } else {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      this.ownsStream = true;
    }

    // Enforce a strict hardware sample anchor block to clear chrome media autoplays and prevent 0Hz crashes
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    this.context = new AudioCtxClass({
      sampleRate: 48000, // Forces the native browser hardware clock to bind safely at a stable master anchor
      latencyHint: 'interactive'
    });

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    this.source = this.context.createMediaStreamSource(this.stream);

    this.processor = this.context.createScriptProcessor(
      4096,
      1,
      1,
    );

    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);

      /*
       * Agora/browser input is normally 48 kHz.
       * Palabra expects 24 kHz PCM.
       */
      const outputLength = Math.max(
        1,
        Math.floor(input.length * 24000 / event.inputBuffer.sampleRate),
      );

      const pcm = new Int16Array(outputLength);

      const ratio =
        event.inputBuffer.sampleRate / 24000;

      for (let i = 0; i < outputLength; i++) {
        const position = i * ratio;
        const index = Math.floor(position);
        const fraction = position - index;

        const sample1 =
          input[Math.min(index, input.length - 1)] ?? 0;

        const sample2 =
          input[Math.min(index + 1, input.length - 1)] ?? sample1;

        const sample =
          sample1 + (sample2 - sample1) * fraction;

        const clamped = Math.max(-1, Math.min(1, sample));

        pcm[i] =
          clamped < 0
            ? clamped * 0x8000
            : clamped * 0x7fff;
      }

      onAudio(pcm.buffer);
    };

    this.source.connect(this.processor);

    /*
     * Keep ScriptProcessor alive without playing microphone
     * audio through the speakers.
     */
    this.sink = this.context.createGain();
    this.sink.gain.value = 0;

    this.processor.connect(this.sink);
    this.sink.connect(this.context.destination);
  }

  stop() {
    try {
      this.processor?.disconnect();
    } catch {}

    try {
      this.source?.disconnect();
    } catch {}

    try {
      this.sink?.disconnect();
    } catch {}

    /*
     * Only stop tracks that belong to a standalone
     * getUserMedia() capture.
     *
     * Never stop Agora's microphone track here.
     */
    if (this.ownsStream) {
      this.stream?.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
    }

    if (this.context) {
      void this.context.close().catch(() => {});
    }

    this.processor = null;
    this.source = null;
    this.sink = null;
    this.stream = null;
    this.context = null;
    this.ownsStream = false;
  }
}
