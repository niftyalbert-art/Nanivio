import { malviAvatarSoundBlocked } from './malviAvatarPlayback';
import type { MalviCaptionTrack } from './malviSpeechTiming';

const AUDIBLE_RMS = 0.008;

/** Leading silence in the same PCM that is submitted to LiveAvatar. */
export function malviLeadingSilenceMs(encoded: string) {
  const raw = atob(encoded);
  const frameSamples = 480; // 20 ms at the required 24 kHz.
  for (let start = 0; start < raw.length / 2; start += frameSamples) {
    const end = Math.min(start + frameSamples, raw.length / 2);
    let energy = 0;
    for (let i = start; i < end; i++) {
      const unsigned = raw.charCodeAt(i * 2) | raw.charCodeAt(i * 2 + 1) << 8;
      const sample = (unsigned >= 32768 ? unsigned - 65536 : unsigned) / 32768;
      energy += sample * sample;
    }
    if (Math.sqrt(energy / (end - start)) >= AUDIBLE_RMS) return start / 24;
  }
  return 0;
}

interface Pending {
  track: MalviCaptionTrack;
  leadingMs: number;
  eligible: boolean;
  providerEnded: boolean;
  startedAt: number | null;
  eligibleAt: number;
}

/**
 * Observe the media element's captured OUTPUT, not the original TTS or SDK
 * processing events. The observer's output gain is zero: audible sound remains
 * exclusively on the SDK's paired audio/video element.
 *
 * This is subtitle-onset detection, NOT a phoneme/lip-sync correction.
 */
export class MalviAvatarPlayout {
  private context: AudioContext | null = null;
  private video: HTMLVideoElement | null = null;
  private capture: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending: Pending[] = [];
  private utterancePlaying = false;
  private samples = new Float32Array(1024);
  constructor(
    private startCaption: (track: MalviCaptionTrack, clock: () => number | null) => void,
    private finishCaption: (track: MalviCaptionTrack) => void,
    private unavailable: (message: string) => void = () => {},
  ) {}

  /** Call in the activation/sound-button gesture, before network awaits. */
  async resume() {
    if (typeof AudioContext === 'undefined') throw new Error('Live subtitle playback monitoring is not supported in this browser.');
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Tap Enable sound to activate live subtitle timing.');
  }

  attach(video: HTMLVideoElement) {
    if (this.video === video && this.analyser) return;
    this.detach();
    this.video = video;
    const captureStream = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream;
    if (!this.context || typeof captureStream !== 'function') {
      throw new Error('Live subtitles need browser playback-capture support. Malvi’s voice can still play.');
    }
    this.capture = captureStream.call(video);
    if (!this.capture.getAudioTracks().length) throw new Error('Live subtitles are waiting for Malvi’s audio track.');
    this.source = this.context.createMediaStreamSource(this.capture);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.gain = this.context.createGain();
    this.gain.gain.value = 0; // Never duplicate the avatar's audible audio.
    this.source.connect(this.analyser);
    this.analyser.connect(this.gain);
    this.gain.connect(this.context.destination);
    this.timer = setInterval(() => this.tick(), 16);
  }

  enqueue(track: MalviCaptionTrack, pcm: string) {
    if (this.pending.length >= 64 || this.pending.reduce((sum, item) => sum + item.track.durationMs, 0) + track.durationMs > 65_000) {
      throw new Error('Malvi’s subtitle playback queue is full.');
    }
    this.pending.push({ track, leadingMs: malviLeadingSilenceMs(pcm), eligible: this.utterancePlaying, providerEnded: false, startedAt: null, eligibleAt: performance.now() });
  }

  providerStart() {
    // Processing events only make a packet eligible. They never start captions.
    this.utterancePlaying = true;
    for (const item of this.pending) {
      if (!item.eligible) { item.eligible = true; item.eligibleAt = performance.now(); }
    }
  }

  providerEnd() {
    this.utterancePlaying = false;
    for (const item of this.pending) {
      if (item.eligible) item.providerEnded = true;
    }
    // Do not cut off buffered playback when the provider finishes generation.
  }

  private tick() {
    const item = this.pending[0], context = this.context, video = this.video;
    if (!item?.eligible || !context || !video || !this.analyser
      || context.state !== 'running' || malviAvatarSoundBlocked(video)) return;
    if (item.startedAt === null) {
      if (performance.now() - item.eligibleAt > item.leadingMs + 8000) {
        this.cancel();
        this.unavailable('Live subtitles could not detect Malvi’s played audio. Try enabling sound.');
        return;
      }
      this.analyser.getFloatTimeDomainData(this.samples);
      const rms = Math.sqrt(this.samples.reduce((sum, sample) => sum + sample * sample, 0) / this.samples.length);
      if (rms < AUDIBLE_RMS) return;
      item.startedAt = context.currentTime - item.leadingMs / 1000;
      this.startCaption(item.track, () => {
        const currentVideo = this.video;
        if (this.pending[0] !== item || this.context !== context
          || !currentVideo || context.state !== 'running' || malviAvatarSoundBlocked(currentVideo)) return null;
        return Math.max(0, (context.currentTime - item.startedAt!) * 1000);
      });
    }
    if ((context.currentTime - item.startedAt) * 1000 >= item.track.durationMs) {
      this.pending.shift();
      if (this.pending[0]?.eligible) this.pending[0].eligibleAt = performance.now();
      this.finishCaption(item.track);
    }
  }

  cancel() { this.pending = []; this.utterancePlaying = false; }

  private detach() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.source?.disconnect(); this.analyser?.disconnect(); this.gain?.disconnect();
    const original = this.video?.srcObject;
    const ownedBySDK = original && 'getTracks' in original ? (original as MediaStream).getTracks() : [];
    this.capture?.getTracks().filter(track => !ownedBySDK.includes(track)).forEach(track => track.stop());
    this.capture = null; this.source = null; this.analyser = null; this.gain = null;
  }

  close() {
    this.cancel(); this.detach(); this.video = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') void context.close();
  }
}
