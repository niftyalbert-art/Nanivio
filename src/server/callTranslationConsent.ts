import { randomUUID } from 'node:crypto';
import { CommunicationAccessError } from './communicationAccess';

type Call = { status: string; participants: string[] };
type Request = {
  id: string; sponsor: string; recipient: string; accepted: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

/** Neither paid inference nor allowance reservation starts while a partner is
 * reading the permission request. A late reply cannot revive a cancelled call. */
export class CallTranslationConsent {
  private pending = new Map<string, Request>();
  private approved = new Map<string, string>();
  constructor(private deps: {
    call: (id: string) => Call | undefined;
    send: (user: string, type: string, payload: Record<string, unknown>) => boolean;
    enable: (id: string, sponsor: string, stillApproved: () => boolean) => Promise<void>;
  }) {}

  hasConsent(id: string, sponsor: string) {
    const request = this.pending.get(id);
    return this.approved.get(id) === sponsor ||
      Boolean(request?.sponsor === sponsor && request.accepted);
  }

  request(id: string, sponsor: string) {
    const call = this.deps.call(id);
    if (!call || call.status !== 'connected' || call.participants.length !== 2 || !call.participants.includes(sponsor))
      throw new CommunicationAccessError(409, 'Connect both participants before enabling Langpretation.');
    const previous = this.pending.get(id);
    if (previous) {
      if (previous.sponsor !== sponsor)
        throw new CommunicationAccessError(409, 'Your partner already requested Langpretation.');
      this.cancel(id, 'The Langpretation request was cancelled.');
      return;
    }
    if (this.approved.has(id))
      throw new CommunicationAccessError(409, 'Langpretation is already enabled. Switch it off before requesting it again.');
    const request: Request = {
      id: randomUUID(), sponsor, recipient: call.participants.find(user => user !== sponsor)!, accepted: false,
    };
    this.pending.set(id, request);
    request.timer = setTimeout(() => this.cancel(id, 'The Langpretation permission request expired. Your ordinary call can continue.'), 60000);
    if (!this.deps.send(request.recipient, 'call:langpretation_consent_request', {
      callId: id, requestId: request.id, sponsorId: sponsor,
    })) {
      this.cancel(id, 'Your partner is not connected. Langpretation was not started.');
      return;
    }
    this.deps.send(sponsor, 'call:billing_notice', {
      callId: id, pending: true, message: 'Waiting for your partner’s permission. Langpretation has not started. Tap Langpretation again to cancel.',
    });
  }

  async respond(id: string, requestId: string, actor: string, accepted: boolean) {
    const request = this.pending.get(id), call = this.deps.call(id);
    if (!request || request.id !== requestId || request.recipient !== actor || request.accepted ||
      !call || call.status !== 'connected' || !call.participants.includes(actor))
      throw new CommunicationAccessError(409, 'This Langpretation permission request is no longer available.');
    if (!accepted) {
      this.cancel(id, 'Your partner declined Langpretation. Your ordinary call can continue.');
      return;
    }
    clearTimeout(request.timer);
    request.accepted = true;
    const current = () => this.pending.get(id) === request &&
      this.deps.call(id)?.status === 'connected';
    try {
      await this.deps.enable(id, request.sponsor, current);
      if (current()) {
        this.approved.set(id, request.sponsor);
        this.pending.delete(id);
      }
    } catch (error) {
      // Do not let a late failure cancel a newer permission request.
      if (this.pending.get(id) === request)
        this.cancel(id, error instanceof CommunicationAccessError ? error.message : 'Langpretation could not be enabled. Your ordinary call can continue.');
      throw error;
    }
  }

  cancel(id: string, message?: string) {
    const request = this.pending.get(id);
    if (request) {
      clearTimeout(request.timer);
      this.pending.delete(id);
      this.deps.send(request.recipient, 'call:langpretation_consent_cancelled', { callId: id, requestId: request.id });
      if (message) for (const user of [request.sponsor, request.recipient])
        this.deps.send(user, 'call:billing_notice', { callId: id, message });
    }
    this.approved.delete(id);
  }
}
