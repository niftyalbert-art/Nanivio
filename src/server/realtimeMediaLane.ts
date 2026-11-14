/** Keep live microphone frames out of the slower signaling/chat queue.
 * Frames remain ordered, authenticated, cancellable and bounded. Falling
 * behind stops translation explicitly; it never silently skips live speech.
 */
export class RealtimeMediaLane {
  private state = { pending: 0, failed: false };
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly maxPending = 6, private readonly maxAgeMs = 750) {}

  clear() {
    this.state = { pending: 0, failed: false };
    this.tail = Promise.resolve();
  }

  enqueue(allowed: () => Promise<boolean>, deliver: () => void, failed: () => void) {
    const state = this.state, received = Date.now();
    const current = () => this.state === state && !state.failed;
    const fail = () => {
      if (!current()) return;
      state.failed = true;
      failed();
    };
    if (!current()) return;
    if (state.pending >= this.maxPending) { fail(); return; }
    state.pending++;
    this.tail = this.tail.then(async () => {
      if (!current()) return;
      if (Date.now() - received > this.maxAgeMs) { fail(); return; }
      if (!(await allowed()) || !current()) return;
      if (Date.now() - received > this.maxAgeMs) { fail(); return; }
      deliver();
    }).catch(fail).finally(() => { state.pending--; });
  }
}
