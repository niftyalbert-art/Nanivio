class MalviPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = [];
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i += 1) {
      const scaled = Math.round(Math.max(-1, Math.min(1, channel[i])) * 32767);
      this.samples.push(scaled);
    }
    // 200 ms of mono PCM16 at 16 kHz per authenticated app WebSocket frame.
    while (this.samples.length >= 3200) {
      const samples = this.samples.splice(0, 3200);
      const bytes = new Uint8Array(samples.length * 2);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < samples.length; i += 1) view.setInt16(i * 2, samples[i], true);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      this.port.postMessage(btoa(binary));
    }
    return true;
  }
}

registerProcessor('malvi-pcm-processor', MalviPcmProcessor);
