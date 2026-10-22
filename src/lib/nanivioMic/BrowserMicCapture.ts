import { NANIVIO_MIC_BYTES } from '../../shared/nanivioMicProtocol';
import type { NanivioMicCapture } from './NanivioMicEngine';

export function browserMicStreamId(): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error('This browser cannot securely start Nanivio Mic.');
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

/** Browser/OS access only. No SpeechRecognition, provider credentials, or ASR. */
export class BrowserMicCapture implements NanivioMicCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: AudioWorkletNode | null = null;
  private silent: GainNode | null = null;
  private stopped = false;
  private removeAbort: (() => void) | null = null;
  async start(onFrame: (pcm: ArrayBuffer) => void, onError: (message: string) => void, signal: AbortSignal) {
    if (signal.aborted || this.stopped) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined' || !('audioWorklet' in AudioContext.prototype)) {
      throw new Error('This browser does not support Nanivio Mic audio capture. Use a current browser with microphone access.');
    }
    const abort = () => this.stop();
    signal.addEventListener('abort', abort, { once: true });
    this.removeAbort = () => signal.removeEventListener('abort', abort);
    try {
      try { this.context = new AudioContext({ sampleRate: 16000 }); }
      catch (error) {
        if (!(error instanceof Error) || error.name !== 'NotSupportedError') throw error;
        this.context = new AudioContext(); // The owned processor normalizes the hardware rate.
      }
      const context = this.context;
      await context.resume();
      if (this.stopped) return;
      if (context.state !== 'running') throw new Error('Your browser paused microphone audio. Tap Start talking to resume.');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (this.stopped) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      await context.audioWorklet.addModule('/audio/nanivio-mic-processor.js?v=1');
      if (this.stopped) return;
      const source = this.source = context.createMediaStreamSource(stream);
      const processor = this.processor = new AudioWorkletNode(context, 'nanivio-mic-processor');
      const silent = this.silent = context.createGain();
      silent.gain.value = 0;
      processor.port.onmessage = event => {
        if (this.stopped || this.processor !== processor) return;
        if (!(event.data instanceof ArrayBuffer) || event.data.byteLength !== NANIVIO_MIC_BYTES) {
          onError('The microphone recorder returned an invalid audio frame.'); return;
        }
        onFrame(event.data);
      };
      processor.onprocessorerror = () => { if (!this.stopped) onError('The microphone recorder stopped. Tap Start talking to retry.'); };
      context.onstatechange = () => {
        if (!this.stopped && context.state !== 'running') onError('Microphone audio was paused by your browser. Tap Start talking to resume.');
      };
      stream.getAudioTracks().forEach(track => {
        const interrupted = () => { if (!this.stopped) onError('Microphone capture was interrupted. Tap Start talking to resume.'); };
        track.onended = interrupted; track.onmute = interrupted;
      });
      source.connect(processor); processor.connect(silent); silent.connect(context.destination);
    } catch (error) {
      this.stop();
      throw error;
    }
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.removeAbort?.(); this.removeAbort = null;
    if (this.processor) {
      this.processor.port.onmessage = null;
      this.processor.onprocessorerror = null;
      this.processor.disconnect(); this.processor = null;
    }
    this.source?.disconnect(); this.source = null;
    this.silent?.disconnect(); this.silent = null;
    this.stream?.getTracks().forEach(track => { track.onended = null; track.onmute = null; track.stop(); });
    this.stream = null;
    const context = this.context; this.context = null;
    if (context) {
      context.onstatechange = null;
      if (context.state !== 'closed') void context.close().catch(() => {});
    }
  }
}
