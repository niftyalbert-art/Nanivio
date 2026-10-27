/** Server-owned deadlines displayed against a monotonic local clock.
 * Wall-clock changes on a phone must never end a paid conversation early.
 * This clock never renews a session: only an authoritative server update can.
 */
export class MalviSessionClock {
  private expiresAt = 0;
  private acceptedDeadline = 0;
  private hardExpiresAt = Infinity;
  constructor(private now = () => performance.now()) {}

  reset() {
    this.expiresAt = 0;
    this.acceptedDeadline = 0;
    this.hardExpiresAt = Infinity;
  }

  update(payload: { idleDeadline: number; serverNow?: number; hardDeadline?: number }) {
    if (!Number.isFinite(payload.serverNow) || !Number.isFinite(payload.idleDeadline)) return false;
    // Ignore delayed renewals; never lengthen the hard limit after initialization.
    if (payload.idleDeadline < this.acceptedDeadline) return false;
    const now = this.now();
    if (Number.isFinite(payload.hardDeadline)) {
      this.hardExpiresAt = Math.min(this.hardExpiresAt, now + Math.max(0, payload.hardDeadline! - payload.serverNow!));
    }
    // Duplicate updates must not extend the same deadline by network delay.
    if (payload.idleDeadline === this.acceptedDeadline) {
      this.expiresAt = Math.min(this.expiresAt, now + Math.max(0, payload.idleDeadline - payload.serverNow!));
      return true;
    }
    this.acceptedDeadline = payload.idleDeadline;
    this.expiresAt = Math.min(now + Math.max(0, payload.idleDeadline - payload.serverNow!), this.hardExpiresAt);
    return true;
  }

  secondsRemaining() {
    return this.acceptedDeadline ? Math.max(0, Math.ceil((Math.min(this.expiresAt, this.hardExpiresAt) - this.now()) / 1000)) : null;
  }
}
