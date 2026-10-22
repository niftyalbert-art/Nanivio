import {
  encodeNanivioMicFrame, isMicId, nanivioMicLevel, NANIVIO_MIC_EVENTS,
  NANIVIO_MIC_RATE, NANIVIO_MIC_SAMPLES, type NanivioMicStatus,
} from '../../shared/nanivioMicProtocol';

export interface NanivioMicCapture {
  start(onFrame: (pcm: ArrayBuffer) => void, onError: (message: string) => void, signal: AbortSignal): Promise<void>;
  stop(): void;
}
export interface NanivioMicTransport {
  send(type: string, payload: unknown): boolean;
  subscribe(listener: (status: NanivioMicStatus) => void): () => void;
}
export interface NanivioMicSnapshot {
  state: 'idle' | 'starting' | 'connecting' | 'listening' | 'hearing' | 'processing' | 'error';
  captureActive: boolean; serverReceiving: boolean; level: number;
  sentFrames: number; acknowledgedFrames: number; error: string;
}
interface Options {
  sessionId: string; streamId: string; capture: NanivioMicCapture; transport: NanivioMicTransport;
  onState: (state: NanivioMicSnapshot) => void;
  onSpeechStart?: () => void; onSpeechEnd?: () => void;
  now?: () => number;
  startupTimeoutMs?: number; captureTimeoutMs?: number; deliveryTimeoutMs?: number;
}

/**
 * Nanivio-owned voice-session core. Platform capture and authenticated transport
 * are adapters, not speech-recognition implementations. This core opens no
 * provider session and has no browser, React, avatar, or provider dependency.
 */
export class NanivioMicEngine {
  private active = false;
  private ready = false;
  private captureActive = false;
  private receiving = false;
  private sequence = 0;
  private acknowledged = 0;
  private level = 0;
  private speaking = false;
  private processing = false;
  private lastSpeech = 0;
  private error = '';
  private controller = new AbortController();
  private unsubscribe: (() => void) | null = null;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(private options: Options) {
    if (!isMicId(options.sessionId) || !isMicId(options.streamId)) throw new Error('A valid Nanivio Mic session and stream are required.');
  }
  private publish() {
    this.options.onState({
      state: this.error ? 'error' : !this.active ? 'idle' : !this.captureActive ? 'starting'
        : !this.receiving ? 'connecting' : this.speaking ? 'hearing' : this.processing ? 'processing' : 'listening',
      captureActive: this.captureActive, serverReceiving: this.receiving, level: this.level,
      sentFrames: this.sequence, acknowledgedFrames: this.acknowledged, error: this.error,
    });
  }
  private clearTimer(name: string) { clearTimeout(this.timers.get(name)); this.timers.delete(name); }
  private deadline(name: string, ms: number, message: string) {
    this.clearTimer(name);
    this.timers.set(name, setTimeout(() => this.fail(message), ms));
  }
  private fail(message: string) {
    if (!this.active) return;
    this.error = message;
    this.dispose();
    this.publish();
  }
  private receive = (status: NanivioMicStatus) => {
    if (!this.active || !status || status.sessionId !== this.options.sessionId
      || status.streamId !== this.options.streamId || status.version !== 1) return;
    if (status.state === 'error') { this.fail(status.message || 'Nanivio Mic could not deliver audio. Reconnect to retry.'); return; }
    if (status.state === 'stopped') { this.fail('Nanivio Mic stopped receiving audio. Reconnect to retry.'); return; }
    if (status.state === 'ready') {
      this.ready = true;
      this.clearTimer('startup');
    } else if (status.state === 'receiving') {
      const sequence = status.lastSequence;
      if (!this.ready || !Number.isSafeInteger(sequence) || sequence! <= this.acknowledged || sequence! > this.sequence) return;
      this.acknowledged = sequence!;
      this.receiving = true;
      this.deadline('delivery', this.options.deliveryTimeoutMs ?? 6000, 'Nanivio Mic lost the audio connection. End this conversation and reconnect.');
    }
    this.publish();
  };
  private frame = (pcm: ArrayBuffer) => {
    if (!this.active) return;
    try {
      const audio = encodeNanivioMicFrame(pcm);
      this.deadline('capture', this.options.captureTimeoutMs ?? 4000, 'No microphone audio is arriving. Check microphone access and tap Start talking to retry.');
      this.level = nanivioMicLevel(pcm);
      const now = this.options.now?.() ?? Date.now();
      if (this.level > 0.075) {
        if (!this.speaking) this.options.onSpeechStart?.();
        this.speaking = true; this.processing = false; this.lastSpeech = now;
      } else if (this.speaking && now - this.lastSpeech > 700) {
        this.speaking = false; this.processing = true; this.options.onSpeechEnd?.();
      }
      // Never queue microphone audio while the authenticated gateway is unready.
      if (this.ready) {
        this.sequence++;
        if (!this.options.transport.send(NANIVIO_MIC_EVENTS.audio, {
          sessionId: this.options.sessionId, streamId: this.options.streamId, sequence: this.sequence, audio,
        })) throw new Error('The live connection stopped receiving microphone audio. End this conversation and reconnect.');
      }
      this.publish();
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Nanivio Mic could not process this audio frame.');
    }
  };
  async start() {
    if (this.active || this.controller.signal.aborted) return;
    this.active = true; this.publish();
    try {
      this.unsubscribe = this.options.transport.subscribe(this.receive);
      this.deadline('startup', this.options.startupTimeoutMs ?? 5000, 'Nanivio Mic could not connect to the live session. Reconnect to retry.');
      if (!this.options.transport.send(NANIVIO_MIC_EVENTS.start, {
        sessionId: this.options.sessionId, streamId: this.options.streamId, version: 1,
        sampleRate: NANIVIO_MIC_RATE, channels: 1, format: 'pcm_s16le', frameSamples: NANIVIO_MIC_SAMPLES,
      })) throw new Error('Nanivio Mic requires an active live connection.');
      // Invoked synchronously in the user gesture; do not wait for the gateway
      // before resuming the browser/OS capture context.
      await this.options.capture.start(this.frame, message => this.fail(message), this.controller.signal);
      if (!this.active) return;
      this.captureActive = true;
      this.deadline('capture', this.options.captureTimeoutMs ?? 4000, 'No microphone audio is arriving. Check microphone access and tap Start talking to retry.');
      this.deadline('delivery', this.options.deliveryTimeoutMs ?? 6000, 'Nanivio Mic did not acknowledge microphone audio. End this conversation and reconnect.');
      this.publish();
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Nanivio Mic could not start.');
    }
  }
  private dispose() {
    this.active = false; this.captureActive = false; this.receiving = false; this.level = 0;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.unsubscribe?.(); this.unsubscribe = null;
    this.controller.abort();
    this.options.capture.stop();
    try {
      this.options.transport.send(NANIVIO_MIC_EVENTS.stop, { sessionId: this.options.sessionId, streamId: this.options.streamId });
    } catch { /* A closed transport cannot prevent local microphone cleanup. */ }
  }
  stop() {
    if (!this.active) return;
    this.dispose();
    this.publish();
  }
}
