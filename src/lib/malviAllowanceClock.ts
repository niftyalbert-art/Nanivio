/** Display only: the session's server-owned deadlines still enforce access. */
export class MalviAllowanceClock {
  private expiresAt: number | null = null;
  private serverNow = -Infinity;
  constructor(private now = () => performance.now()) {}
  reset() { this.expiresAt = null; this.serverNow = -Infinity; }
  update(payload: { remainingSeconds: number; serverNow: number }) {
    if (!Number.isInteger(payload.remainingSeconds) || payload.remainingSeconds < 0 ||
      !Number.isFinite(payload.serverNow) || payload.serverNow <= this.serverNow) return false;
    this.serverNow = payload.serverNow;
    this.expiresAt = this.now() + payload.remainingSeconds * 1000;
    return true;
  }
  secondsRemaining() {
    return this.expiresAt === null ? null : Math.max(0, Math.ceil((this.expiresAt - this.now()) / 1000));
  }
}
