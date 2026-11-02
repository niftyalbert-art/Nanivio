export type BusinessPeer = { send: (event: string, payload: any) => void };
export type BusinessTranslationAuthorization = (user: string, callId: string, source?: string, target?: string) => Promise<string | { language: string; endsAt: number }>;
const businessCall = /^business:[a-f0-9-]{36}$/i;

/** Explicit, short-lived listener authorization. Room membership alone does not
 * authorize a background connection to receive private meeting audio. */
export class BusinessTranslationAudience {
  private listeners = new Map<BusinessPeer, { user: string; callId: string; until: number; target: string }>();
  private generations = new WeakMap<BusinessPeer, number>();
  constructor(private authorize: BusinessTranslationAuthorization, private rtcUid: (user: string) => number, private clock = Date.now) {}
  async subscribe(peer: BusinessPeer, user: string, callId: unknown) {
    if (typeof callId !== 'string' || !businessCall.test(callId)) throw new Error('Invalid Business meeting.');
    const generation = (this.generations.get(peer) || 0) + 1;
    this.generations.set(peer, generation);
    if (!this.listeners.has(peer) && this.listeners.size >= 200) throw new Error('Meeting listening is busy.');
    let target: string, until: number;
    try {
      const authorization = await this.authorize(user, callId);
      target = typeof authorization === 'string' ? authorization : authorization.language;
      until = typeof authorization === 'string' ? this.clock() + 25000 : Math.min(this.clock() + 25000, authorization.endsAt);
      if (!Number.isFinite(until) || until <= this.clock()) throw new Error('Meeting allowance ended.');
    } catch (error) { this.listeners.delete(peer); throw error; }
    if (this.generations.get(peer) !== generation) throw new Error('Meeting listening was cancelled.');
    this.listeners.set(peer, { user, callId, target, until });
    return target;
  }
  remove(peer: BusinessPeer) { this.listeners.delete(peer); this.generations.set(peer, (this.generations.get(peer) || 0) + 1); }
  closeRoom(callId: string) {
    for (const [peer, entry] of this.listeners) if (entry.callId === callId) {
      try { peer.send('langpretation:business_error', { callId, message: 'The meeting was closed by its owner.' }); } finally { this.remove(peer); }
    }
  }
  allowed(peer: BusinessPeer, user: string, callId: string) {
    const entry = this.listeners.get(peer);
    if (entry && entry.until <= this.clock()) { this.listeners.delete(peer); return false; }
    return !!entry && entry.user === user && entry.callId === callId;
  }
  remote(callId: string, speaker: string, event: string, payload: any) {
    let delivered = false;
    for (const [peer, entry] of this.listeners) {
      if (entry.until <= this.clock()) { this.listeners.delete(peer); continue; }
      if (entry.callId !== callId || entry.user === speaker) continue;
      try { peer.send(event, { ...payload, speakerRtcUid: this.rtcUid(speaker) }); delivered = true; }
      catch { this.remove(peer); }
    }
    return delivered;
  }
}
