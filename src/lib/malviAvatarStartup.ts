import { waitForMalviVideoFrame } from './malviAvatarVideoGate';

/** SDK startup and subscribed tracks do not establish browser video playout. */
export class MalviAvatarStartup {
  private sessionStarted = false;
  private frameRendered = false;
  private finished = false;
  private video: HTMLVideoElement | null = null;
  private observer = new AbortController();
  private readonly deadline: number;
  private readonly timer: ReturnType<typeof setTimeout>;

  constructor(
    private ready: () => void,
    private failed: (message: string) => void,
    timeoutMs = 20_000,
  ) {
    this.deadline = performance.now() + timeoutMs;
    this.timer = setTimeout(() => this.fail(), timeoutMs);
  }

  started() {
    if (this.finished) return;
    this.sessionStarted = true;
    this.complete();
  }

  observe(video: HTMLVideoElement) {
    if (this.finished || this.video === video) return;
    this.observer.abort();
    const observer = new AbortController();
    this.observer = observer;
    this.video = video;
    this.frameRendered = false;
    void waitForMalviVideoFrame(video, observer.signal, Math.max(1, this.deadline - performance.now()))
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
    this.cancel();
    this.failed('Malvi’s live video did not become playable. Reconnect to start a new conversation.');
  }
}
