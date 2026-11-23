import { createClient, AnamEvent } from '@anam-ai/js-sdk';
import type { MalviAvatarRenderer } from './malviAvatarRenderer';
import { authClient } from './authClient';
import { BROWSER_SESSION_MARKER } from '../shared/browserSession';

/** Render backend-produced speech on the same paired audio/video element. */
export class MalviAnamAvatarSession implements MalviAvatarRenderer {
  private readonly client;
  private input: ReturnType<ReturnType<typeof createClient>['createAgentAudioInputStream']> | null = null;
  private stream: MediaStream | null = null;
  private stopped = false;
  private video: HTMLVideoElement | null = null;
  private mutedForInterrupt = false;
  private previouslyMuted = false;
  private listeners = new Map<string, (() => void)[]>();
  private emit(event: string) { for (const callback of this.listeners.get(event) || []) callback(); }

  constructor(id: string, token: string) {
    const appToken = authClient.getToken();
    const bearer = Boolean(appToken && appToken !== BROWSER_SESSION_MARKER);
    // The SDK sends this credential only to our same-origin REST handoff.
    // Anam's engine session was already created and registered server-side.
    this.client = createClient(bearer ? appToken! : token, {
      disableInputAudio: true,
      // The server has already created, registered and bounded this session.
      // This endpoint returns its saved connection, never starts a second one.
      api: { baseUrl: `/api/assistant/session/${encodeURIComponent(id)}/${bearer ? 'anam-bearer' : 'anam'}`,
        retry: { maxAttempts: 1 }, requestTimeoutMs: 10_000 },
      metrics: { disableClientMetrics: true },
    });
    this.client.addListener(AnamEvent.CONNECTION_CLOSED, () => {
      if (!this.stopped) this.emit('closed');
    });
  }
  get sessionId() { return this.client.getActiveSessionId(); }
  on(event: string, listener: () => void) {
    this.listeners.set(event, [...(this.listeners.get(event) || []), listener]);
  }
  async start() {
    // stream() resolves only after both A/V tracks arrive. The controller still
    // independently requires decoded, playing frames before admitting speech.
    const streams = await this.client.stream();
    if (this.stopped) { await this.client.stopStreaming(); return; }
    const tracks = new Map<string, MediaStreamTrack>();
    for (const stream of streams) for (const track of stream.getTracks()) tracks.set(track.id, track);
    this.stream = new MediaStream([...tracks.values()]);
    this.input = this.client.createAgentAudioInputStream({
      encoding: 'pcm_s16le', sampleRate: 24000, channels: 1,
    });
    this.emit('ready');
  }
  attach(video: HTMLVideoElement) {
    if (!this.stream || this.stopped) throw new Error('Malvi’s avatar stream is not ready.');
    video.srcObject = this.stream;
    this.video = video;
  }
  appendAudio(audio: string, ended = true) {
    if (this.stopped || !this.input) throw new Error('Malvi’s avatar audio connection is not ready.');
    if (audio && this.mutedForInterrupt && this.video) {
      this.video.muted = this.previouslyMuted;
      this.mutedForInterrupt = false;
    }
    if (audio) this.input.sendAudioChunk(audio);
    if (ended) this.input.endSequence();
  }
  repeatAudio(audio: string) { this.appendAudio(audio, true); }
  interrupt() {
    if (this.stopped || !this.input) return;
    // Cut audible output locally without waiting for a network round trip.
    // New audio is admitted only after the controller's brain-ack barrier.
    if (this.video) {
      if (!this.mutedForInterrupt) this.previouslyMuted = this.video.muted;
      this.video.muted = true; this.mutedForInterrupt = true;
    }
    this.client.interruptPersona();
    this.input.endSequence();
  }
  async keepAlive() {
    // Anam maintains transport heartbeats itself. Never extend Nanivio's
    // input-only idle deadline on behalf of an avatar presence timer.
    if (this.stopped || !this.client.isStreaming()) throw new Error('Malvi’s avatar connection ended.');
  }
  async stop() {
    this.stopped = true; this.input = null; this.listeners.clear();
    try { await this.client.stopStreaming(); }
    finally {
      this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
      if (this.video && this.mutedForInterrupt) this.video.muted = this.previouslyMuted;
      this.video = null; this.mutedForInterrupt = false;
    }
  }
}
