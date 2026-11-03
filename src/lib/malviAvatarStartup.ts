import { waitForMalviVideoFrame } from './malviAvatarVideoGate';

export const MALVI_AVATAR_CONNECTION_TIMEOUT_MS = 45_000;
export const MALVI_AVATAR_FRAME_TIMEOUT_MS = 20_000;
export type MalviAvatarConnectionStage = 'STARTUP_PROVIDER_REQUEST' | 'STARTUP_MEDIA_CONNECTION' | 'STARTUP_CONTROL_CHANNEL';

/** SDK startup and subscribed tracks do not establish browser video playout. */
export class MalviAvatarStartup {
  private sessionStarted = false;
  private frameRendered = false;
  private finished = false;
  private video: HTMLVideoElement | null = null;
  private observer = new AbortController();
  private deadline: number;
  private timer: ReturnType<typeof setTimeout>;

  constructor(
    private ready: () => void,
    private failed: (message: string) => void,
    private readonly timeoutMs = MALVI_AVATAR_FRAME_TIMEOUT_MS,
    private readonly connection?: { timeoutMs: number; stage: () => MalviAvatarConnectionStage },
  ) {
    const connectionTimeout = connection?.timeoutMs ?? timeoutMs;
    this.deadline = performance.now() + connectionTimeout;
    this.timer = setTimeout(() => this.fail(), connectionTimeout);
  }

  started() {
    if (this.finished || this.sessionStarted) return;
    this.sessionStarted = true;
    // HTTP/WebRTC/control-channel setup is not video playback. Give the
    // decoder its own bounded window only after SDK startup completes.
    clearTimeout(this.timer);
    this.deadline = performance.now() + this.timeoutMs;
    this.timer = setTimeout(() => this.fail(), this.timeoutMs);
    if (this.video && !this.frameRendered) this.watch(this.video);
    this.complete();
  }

  observe(video: HTMLVideoElement) {
    if (this.finished || this.video === video) return;
    this.video = video;
    this.frameRendered = false;
    this.watch(video);
  }

  private watch(video: HTMLVideoElement) {
    this.observer.abort();
    const observer = new AbortController();
    this.observer = observer;
    // Playback may have begun before React attaches its observer. A frame
    // callback only reports a FUTURE frame; an idle renderer need not emit one.
    // Require browser-reported decoded frames, not just tracks or metadata.
    const quality = video.getVideoPlaybackQuality?.();
    const presentedFrames = (quality?.totalVideoFrames ?? 0) - (quality?.droppedVideoFrames ?? 0);
    if (!video.paused && video.readyState >= 2 && video.videoWidth > 0
      && video.videoHeight > 0 && presentedFrames > 0) {
      this.frameRendered = true;
      this.complete();
      return;
    }
    const remaining = this.deadline - performance.now() + (this.sessionStarted ? 0 : this.timeoutMs);
    void waitForMalviVideoFrame(video, observer.signal, Math.max(1, remaining))
      .then(() => {
        if (this.finished || observer.signal.aborted || this.video !== video) return;
        this.frameRendered = true;
        this.complete();
      }).catch(() => {
        if (!this.finished && !observer.signal.aborted && this.video === video) this.fail();
      });
  }

  cancel() {
    this.finished = true;
    clearTimeout(this.timer);
    this.observer.abort();
    this.video = null;
  }

  private complete() {
    if (this.finished || !this.sessionStarted || !this.frameRendered) return;
    this.cancel();
    this.ready();
  }

  private fail() {
    if (this.finished) return;
    const code = !this.sessionStarted ? (this.connection?.stage() ?? 'STARTUP_CONNECTION')
      : !this.video ? 'STARTUP_TRACKS'
      : this.video.error ? `STARTUP_MEDIA_${this.video.error.code}`
      : this.video.paused ? 'STARTUP_PLAYBACK'
      : 'STARTUP_FRAME';
    this.cancel();
    const message = this.sessionStarted ? 'Malvi’s live video did not become playable.'
      : 'Malvi’s live connection did not finish starting.';
    this.failed(`${message} Reconnect to start a new conversation. Support code: ${code}.`);
  }
}
