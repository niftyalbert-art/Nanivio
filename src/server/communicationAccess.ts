import { randomUUID } from 'node:crypto';
import { getServerSupabase } from './supabaseServer.ts';

export class CommunicationAccessError extends Error {
  constructor(public status: number, message: string, public code = 'COMMUNICATION_ACCESS_UNAVAILABLE') { super(message); }
}
export interface CommunicationPolicy {
  callTrialDays: number; liveTrialMinutes: number; paidTextCharacters: number; warningSeconds: number;
  plans: any[];
}
export interface CommunicationAccess {
  policy: Omit<CommunicationPolicy, 'plans'>; trialStartedAt: string | null; trialEndsAt: string | null;
  callSecondsRemaining: number | null; liveTrialSecondsRemaining: number; textCharactersRemaining: number;
  translatedSecondsRemaining: number; paid: boolean; paidUntil: string | null; sharedCallMinutes: number;
}
export type UsageReservation = { eventId: string; amount: number; source: string; userId: string };

export async function communicationCommand(action: string, payload: Record<string, unknown> = {}) {
  const client = getServerSupabase();
  if (!client) throw new CommunicationAccessError(503, 'Communication usage setup is unavailable. Ask an administrator to check setup.');
  const { data, error } = await client.rpc('nanivio_communication_access', { action, payload });
  if (error) {
    const known=['Cannot remove already consumed calling minutes','Cannot remove already consumed Langpretation minutes','Cannot remove already consumed text characters','Adjustment retry does not match'];
    const safe=known.find(message=>String(error.message).includes(message));
    throw new CommunicationAccessError(safe?400:503,safe||'Communication usage setup is unavailable. Ask an administrator to check setup.');
  }
  if (!data?.success) throw new CommunicationAccessError(402, data?.error || 'A subscription with available allowance is required.', data?.code || 'SUBSCRIPTION_REQUIRED');
  return data;
}
export const communicationAccess = {
  async policy(): Promise<CommunicationPolicy> { return (await communicationCommand('POLICY')).config; },
  async access(userId: string): Promise<CommunicationAccess> { return communicationCommand('ACCESS', { userId }); },
  async connected(userId: string): Promise<CommunicationAccess> { return communicationCommand('CONNECT', { userId }); },
  async mayCall(userId: string) {
    const access = await this.access(userId);
    if ((!access.trialStartedAt && access.policy.callTrialDays > 0) || (access.trialEndsAt && Date.parse(access.trialEndsAt) > Date.now()) || access.sharedCallMinutes > 0) return access;
    throw new CommunicationAccessError(402, 'Subscribe to make calls. Receiving calls and ordinary chat remain free.', 'SUBSCRIPTION_REQUIRED');
  },
  async reserve(userId: string, resource: 'call' | 'live' | 'note' | 'text', amount: number): Promise<UsageReservation> {
    const eventId = `comm_${randomUUID()}`;
    const result = await communicationCommand('RESERVE', { userId, resource, amount, eventId });
    return { ...result, userId, eventId };
  },
  async commit(reservation: UsageReservation, used = reservation.amount) {
    await communicationCommand('COMMIT', { userId: reservation.userId, eventId: reservation.eventId, used });
  },
  async release(reservation: UsageReservation) {
    await communicationCommand('RELEASE', { userId: reservation.userId, eventId: reservation.eventId });
  },
};

export async function withCommunicationUsage<T>(userId: string, resource: 'text' | 'note', amount: number, work: () => Promise<T>): Promise<T> {
  const reservation = await communicationAccess.reserve(userId, resource, amount);
  try {
    const result = await work();
    await communicationAccess.commit(reservation);
    return result;
  } catch (error) {
    await communicationAccess.release(reservation).catch(() => {});
    throw error;
  }
}

/** Caller admission and sponsored translation are server-owned, never supplied
 * by the recipient/browser billing preview. Each pool has only one active slice.
 */
export class CommunicationCallMeter {
  private calls = new Map<string, {
    caller: string; connected: boolean; ready: Set<string>; participants: string[];
    sponsor?: string; stopped: boolean; live: boolean; sponsoringAt?: number; changingSponsor?: boolean; sponsorVersion?: number; endedAt?: number; translationRenewingAt?: number;
    base?: UsageReservation; translation?: UsageReservation;
    baseAt: number; translationAt: number; timer?: ReturnType<typeof setTimeout>;
    running?: Promise<void>; warning: Set<string>;
  }>();
  constructor(private deps: {
    end: (callId: string, reason: string) => void;
    state: (callId: string, payload: any) => void;
    stopTranslation: (callId: string) => void;
  }, private service = communicationAccess) {}
  async admit(caller: string) { return this.service.mayCall(caller); }
  add(id: string, caller: string, participants: string[]) {
    if (this.calls.has(id)) return;
    this.calls.set(id, { caller, participants, connected: false, ready: new Set(), stopped: false, live: false, baseAt: 0, translationAt: 0, warning: new Set() });
  }
  private async settle(reservation: UsageReservation | undefined, at: number, until=Date.now()) {
    if (reservation) {
      if (!at) await this.service.release(reservation);
      else await this.service.commit(reservation, Math.min(reservation.amount, Math.max(0, (until - at) / 1000)));
    }
  }
  async mediaReady(id: string, actor: string) {
    const call = this.calls.get(id);
    if (!call || call.stopped || !call.participants.includes(actor)) return;
    call.ready.add(actor);
    if (call.ready.size < 2 || call.connected) return;
    call.connected = true; call.baseAt = Date.now();
    try { await Promise.all(call.participants.map(user=>this.service.connected(user))); await this.tick(id); }
    catch { this.deps.end(id, 'Your calling allowance could not be confirmed. Please check billing.'); }
  }
  async sponsor(id: string, actor: string, enabled: boolean) {
    const call = this.calls.get(id);
    if (!call || call.stopped || !call.connected || !call.participants.includes(actor)) throw new CommunicationAccessError(409, 'Connect both participants before enabling Langpretation.');
    if(call.changingSponsor)throw new CommunicationAccessError(409,'A Langpretation change is already being processed.');
    if (enabled && call.sponsor && call.sponsor !== actor) throw new CommunicationAccessError(403, 'Only the person covering Langpretation can change its sponsorship.');
    call.sponsorVersion=(call.sponsorVersion||0)+1;
    if (enabled) {
      if (call.live && call.sponsor === actor) return;
      // Reserve before announcing to either client. No raw voice may reach a
      // provider until the authenticated sponsor has accepted this allowance.
      call.changingSponsor=true;
      const version=call.sponsorVersion;
      try{
        const reservation=await this.service.reserve(actor,'live',5);
        if(call.stopped||call.sponsorVersion!==version){await this.service.release(reservation);throw new CommunicationAccessError(409,'This Langpretation request has stopped.');}
        call.translation=reservation;
      }finally{call.changingSponsor=false;}
      call.sponsor = actor; call.translationAt = 0; call.sponsoringAt = Date.now(); call.live = true;
    } else {
      call.changingSponsor=true;
      call.live = false;
      this.deps.stopTranslation(id);
      try {await this.settle(call.translation, call.translationAt); call.translation = undefined; call.sponsor = undefined;}
      finally {call.changingSponsor=false;}
    }
    this.deps.state(id, { enabled, sponsorId: call.sponsor, message: enabled ? 'Langpretation uses the enabling user’s allowance for both directions, including captions and speech.' : 'Langpretation is off. Your ordinary call can continue.' });
  }
  authorize(id: string, actor: string) {
    const call = this.calls.get(id);
    const renewing=call?.translationRenewingAt!==undefined&&Date.now()-call.translationRenewingAt<10000;
    if (!call?.connected || call.stopped || !call.live || !call.sponsor || !call.participants.includes(actor))
      throw new CommunicationAccessError(402, 'Enable sponsored Langpretation in this connected call first.');
    if(call?.translationRenewingAt!==undefined&&!renewing)
      throw new CommunicationAccessError(503,'Langpretation allowance confirmation took too long. Your ordinary call can continue.');
    if (!call.translation&&!renewing) throw new CommunicationAccessError(402, 'Enable sponsored Langpretation in this connected call first.');
  }
  async translationFailed(id:string,actor:string,message:string) {
    const call=this.calls.get(id);
    if(!call?.live||!call.participants.includes(actor))return;
    call.live=false;call.sponsorVersion=(call.sponsorVersion||0)+1;
    this.deps.stopTranslation(id);
    this.deps.state(id,{enabled:false,message:`Langpretation paused: ${message} Your ordinary call can continue.`});
    const reservation=call.translation,at=call.translationAt;
    call.translation=undefined;call.sponsor=undefined;
    await this.settle(reservation,at).catch(error=>{
      console.error('Unable to settle paused Langpretation usage.',{callId:id,code:error instanceof CommunicationAccessError?error.code:'BILLING_UNAVAILABLE'});
    });
  }
  translationReady(id: string) {
    const call = this.calls.get(id);
    if (call?.live && call.translation && !call.translationAt) call.translationAt = Date.now();
  }
  async tokenSeconds(id: string, actor: string) {
    const call = this.calls.get(id);
    if(!call || call.stopped || !call.participants.includes(actor))throw new CommunicationAccessError(403,'This call is no longer available.');
    const access=await this.service.access(call.caller);
    if(!access.trialStartedAt && access.policy.callTrialDays>0)return 60;
    if(access.trialEndsAt && Date.parse(access.trialEndsAt)>Date.now())
      return Math.max(1,Math.min(60,Math.floor((Date.parse(access.trialEndsAt)-Date.now())/1000)));
    const reserved=call.base?Math.max(0,call.base.amount-(Date.now()-call.baseAt)/1000):0;
    const left=access.sharedCallMinutes*60+reserved;
    if(left<=0)throw new CommunicationAccessError(402,'Your calling minutes are used up.');
    return Math.max(1,Math.min(60,Math.floor(left)));
  }
  private async tick(id: string) {
    const call = this.calls.get(id);
    if (!call || call.stopped) return;
    if (call.running) return call.running;
    call.running = (async () => {
      try {
        const previousBase=call.base;
        await this.settle(previousBase, call.baseAt); call.base = undefined;
        if (call.stopped) return;
        const baseOverdue=call.baseAt?Math.max(0,(Date.now()-call.baseAt)/1000-(previousBase?.amount||0)):0;
        const baseRequestedAt=Date.now();
        call.base = await this.service.reserve(call.caller, 'call', 5+baseOverdue); call.baseAt = baseRequestedAt-baseOverdue*1000;
        if (call.stopped) { await this.settle(call.base, call.baseAt,call.endedAt); call.base = undefined; return; }
        if (call.live && !call.translationAt && Date.now() - (call.sponsoringAt || 0) > 30000) {
          await this.settle(call.translation, 0); call.translation = undefined;
          call.live = false; call.sponsor = undefined; this.deps.stopTranslation(id);
          this.deps.state(id, { enabled: false, message: 'Langpretation did not connect. No translation minutes were used.' });
        }
        if (call.live && call.sponsor && call.translationAt) {
          call.translationRenewingAt=Date.now();
          try {
            const previousTranslation=call.translation;
            const payer=call.sponsor,version=call.sponsorVersion;
            await this.settle(previousTranslation, call.translationAt);
            if(call.translation===previousTranslation)call.translation = undefined;
            if(call.live&&call.sponsorVersion===version&&!call.stopped){
              const overdue=Math.max(0,(Date.now()-call.translationAt)/1000-(previousTranslation?.amount||0));
              const requestedAt=Date.now();
              const next = await this.service.reserve(payer, 'live', 5+overdue);
              if (call.stopped || !call.live || call.sponsorVersion!==version) await this.service.release(next);
              else {call.translation = next; call.translationAt = requestedAt-overdue*1000;}
            }
          } catch(error) {
            call.live = false; call.sponsor = undefined; this.deps.stopTranslation(id);
            const exhausted=error instanceof CommunicationAccessError&&error.status===402;
            this.deps.state(id, { enabled: false, subscriptionRequired: exhausted, message: exhausted
              ?'Langpretation allowance ended. Subscribe to translate; the ordinary call can continue.'
              :'Langpretation allowance could not be confirmed. Try again; the ordinary call can continue.' });
          }finally{call.translationRenewingAt=undefined;}
        }
        const access = await this.service.access(call.caller);
        const remaining = access.callSecondsRemaining;
        if (remaining !== null && remaining <= access.policy.warningSeconds && !call.warning.has('base')) {
          const available=remaining+Math.max(0,(call.base?.amount||0)-(Date.now()-call.baseAt)/1000);
          call.warning.add('base'); this.deps.state(id, { warning: true, message: `Calling allowance is nearly finished (${Math.ceil(available)} seconds remaining).`, recipientId: call.caller });
        }
        if(remaining===null||remaining>access.policy.warningSeconds+5)call.warning.delete('base');
        if (call.sponsor) {
          const translation = await this.service.access(call.sponsor);
          const left = translation.liveTrialSecondsRemaining + translation.translatedSecondsRemaining;
          if (left <= translation.policy.warningSeconds && !call.warning.has('translation')) {
            const available=left+Math.max(0,(call.translation?.amount||0)-(Date.now()-call.translationAt)/1000);
            call.warning.add('translation'); this.deps.state(id, { warning: true, message: `Langpretation allowance is nearly finished (${Math.ceil(available)} seconds remaining).`, recipientId: call.sponsor });
          }
          if(left>translation.policy.warningSeconds+5)call.warning.delete('translation');
        }
        if (!call.stopped) {
          const baseLeft=call.base?call.base.amount-(Date.now()-call.baseAt)/1000:5;
          const translationLeft=call.translation&&call.translationAt?call.translation.amount-(Date.now()-call.translationAt)/1000:5;
          const seconds = Math.min(baseLeft,translationLeft,5);
          call.timer = setTimeout(() => void this.tick(id), Math.max(1, seconds * 1000));
          call.timer.unref?.();
        }
      } catch {
        this.deps.end(id, 'Your calling allowance has ended or could not be confirmed. Subscribe to continue making calls.');
      }
    })().finally(() => { call.running = undefined; });
    return call.running;
  }
  async close(id: string) {
    const call = this.calls.get(id);
    if (!call) return;
    call.stopped = true; call.endedAt=Date.now(); clearTimeout(call.timer); this.calls.delete(id);
    await call.running?.catch(() => {});
    await Promise.all([this.settle(call.base, call.baseAt,call.endedAt), this.settle(call.translation, call.translationAt,call.endedAt)]);
  }
}
