/**
 * A newly received stream is not necessarily a decoded, visible avatar frame.
 * Keep audio on the SDK's paired A/V element; never add a second sound source
 * or an arbitrary device-specific audio delay.
 */
export function waitForMalviVideoFrame(video: HTMLVideoElement, signal: AbortSignal, timeoutMs = 2500): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame: number | undefined;
    let poll: ReturnType<typeof setTimeout> | undefined;
    let ended = false;
    const finish = (error?: Error) => {
      if (ended) return;
      ended = true;
      clearTimeout(timeout); if (poll) clearTimeout(poll);
      if (frame !== undefined) video.cancelVideoFrameCallback?.(frame);
      signal.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    };
    const abort = () => finish(new Error('Avatar playback was cancelled.'));
    const timeout = setTimeout(() => finish(new Error('Malvi’s video is not rendering. Speech was stopped to avoid playing over a frozen image. Reconnect to retry.')), timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    if (typeof video.requestVideoFrameCallback === 'function') {
      frame = video.requestVideoFrameCallback(() => finish());
    } else {
      // Older browsers lack frame callbacks. Require actual playable media,
      // not a provider "stream ready" notification or a poster image.
      const check = () => {
        if (video.readyState >= 2 && !video.paused) finish();
        else poll = setTimeout(check, 40);
      };
      check();
    }
  });
}

/** Bounded, ordered delivery; interrupt/close invalidates every pending callback. */
export class MalviAvatarVideoGate {
  private controller = new AbortController();
  private generation = 0;
  private pending = 0;
  private durationMs = 0;
  private chain = Promise.resolve();
  constructor(private video: () => HTMLVideoElement | null, private failed: (message: string) => void) {}

  enqueue(durationMs: number, deliver: () => void) {
    if (!Number.isFinite(durationMs) || durationMs <= 0 || this.pending >= 64 || this.durationMs + durationMs > 65_000) {
      throw new Error('Malvi’s avatar audio queue exceeded its safety limit.');
    }
    const generation = this.generation, signal = this.controller.signal;
    this.pending++; this.durationMs += durationMs;
    this.chain = this.chain.then(async () => {
      if (signal.aborted) return;
      const video = this.video();
      if (!video) throw new Error('Malvi’s video is unavailable. Reconnect to retry.');
      await waitForMalviVideoFrame(video, signal);
      if (signal.aborted || generation !== this.generation) return;
      if (video !== this.video()) throw new Error('Malvi’s video changed before playback. Reconnect to retry.');
      deliver();
    }).catch(error => {
      if (signal.aborted || generation !== this.generation) return;
      this.cancel();
      this.failed(error instanceof Error ? error.message : 'Avatar playback could not stay connected.');
    }).finally(() => {
      if (generation === this.generation) { this.pending--; this.durationMs -= durationMs; }
    });
  }

  cancel() {
    this.generation++; this.controller.abort(); this.controller = new AbortController();
    this.pending = 0; this.durationMs = 0; this.chain = Promise.resolve();
  }
}
