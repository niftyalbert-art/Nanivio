import { getServerSupabase } from '../supabaseServer.ts';
import { ensureMalviEntitlement } from '../normalizedBillingRepository.ts';
import { AssistantError } from './redisStore.ts';

export interface LiveUsage {
  reserve(user: string, id: string, mode: 'voice' | 'avatar'): Promise<number>;
  confirm(id: string): Promise<void>;
  finish(id: string, cancel?: boolean): Promise<void>;
}

async function command(name: string, args: Record<string, unknown>) {
  const db = getServerSupabase();
  if (!db) throw new AssistantError(503, 'MALVI_BILLING_UNAVAILABLE', 'Malvi allowance protection is unavailable. No new conversation was started.');
  const { data, error } = await db.rpc(name, args).abortSignal(AbortSignal.timeout(5000));
  if (error) {
    const code = String(error.message || '');
    if (code.includes('MALVI_ALLOWANCE_EXHAUSTED')) throw new AssistantError(402, 'MALVI_ALLOWANCE_EXHAUSTED', 'Your Malvi allowance is used up. Open Billing to review your plan.');
    if (code.includes('MALVI_PLAN_REQUIRED')) throw new AssistantError(402, 'MALVI_PLAN_REQUIRED', 'An active Malvi plan is required. Open Billing to review your access.');
    if (code.includes('MALVI_AVATAR_NOT_INCLUDED')) throw new AssistantError(403, 'MALVI_AVATAR_NOT_INCLUDED', 'Your plan includes voice conversations, not the live avatar. Choose Start voice.');
    if (code.includes('MALVI_SESSION_ACTIVE')) throw new AssistantError(409, 'MALVI_SESSION_ACTIVE', 'Your previous conversation is still closing. Wait before starting again.');
    if (code.includes('MALVI_RUNTIME_LIMITS_REQUIRED')) throw new AssistantError(503, 'MALVI_RUNTIME_LIMITS_REQUIRED', 'The administrator needs to configure Malvi usage limits before this feature can start.');
    if (code.includes('MALVI_SHARED_LIMIT')) throw new AssistantError(429, 'MALVI_SHARED_LIMIT', 'Malvi’s shared conversation allowance has been reached. Contact the administrator.');
    if (code.includes('MALVI_REQUEST_LIMIT')) throw new AssistantError(429, 'MALVI_REQUEST_LIMIT', 'Your Malvi research or upload safety limit has been reached. Contact the administrator.');
    throw new AssistantError(503, 'MALVI_BILLING_UNAVAILABLE', 'Malvi allowance protection needs administrator attention. Recheck the live-allowance database setup.');
  }
  return data;
}

export async function claimMalviRequest(user: string, kind: 'research' | 'analysis', bytes = 0) {
  await ensureMalviEntitlement(user);
  await command('nanivio_claim_malvi_request', { p_user: user, p_kind: kind, p_bytes: bytes });
}

export const liveUsage: LiveUsage = {
  async reserve(user, id, mode) {
    // Existing purchased amounts and periods are authoritative, never current
    // catalogue prices or client-supplied counters.
    await ensureMalviEntitlement(user);
    const result = await command('nanivio_reserve_malvi_live', { p_user: user, p_lease: id, p_mode: mode, p_max_seconds: 600 });
    const seconds = Number(result?.seconds);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 600) {
      throw new AssistantError(503, 'MALVI_ALLOWANCE_INVALID', 'Malvi could not confirm your remaining allowance.');
    }
    return seconds;
  },
  async confirm(id) {
    if (await command('nanivio_confirm_malvi_live', { p_lease: id }) !== true) {
      throw new AssistantError(410, 'MALVI_ALLOWANCE_ENDED', 'The reserved conversation time has ended. Open Billing to review your allowance.');
    }
  },
  async finish(id, cancel = false) {
    await command('nanivio_finish_malvi_live', { p_lease: id, p_cancel: cancel, p_reconcile: false });
  },
};
