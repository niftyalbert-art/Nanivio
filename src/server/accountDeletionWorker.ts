import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const DELETION_STEPS = [
  'access','billing','storage','voice','stream','personal_data','auth_identity','verification',
] as const;
export type DeletionStep = typeof DELETION_STEPS[number];
type Receipt = { code: string; operationId?: string };
export type DeletionCheckpoint = { state: 'started' | 'waiting' | 'verified'; receipt: Receipt; startedAt: string };
export type DeletionPolicy = {
  executionApproved: boolean; version: string; legalReview: string; retentionSchedule: string;
  sharedContentReview: string; billingSettlement: string; storageInventory: string;
  backupReview: string; providerInventory: string;
};
export type DeletionClaim = {
  claimed: boolean; ownerId?: string; policy?: DeletionPolicy;
  steps?: Partial<Record<DeletionStep, DeletionCheckpoint>>;
};
export interface DeletionWorkStore {
  command(request: string, operation: string, token?: string, step?: DeletionStep, payload?: object): Promise<any>;
}
export class SupabaseDeletionWorkStore implements DeletionWorkStore {
  constructor(private db: SupabaseClient) {}
  async command(request: string, operation: string, token?: string, step?: DeletionStep, payload: object = {}) {
    const { data, error } = await this.db.rpc('nanivio_deletion_work', {
      p_request: request, p_operation: operation, p_token: token || null,
      p_step: step || null, p_payload: payload,
    }).abortSignal(AbortSignal.timeout(8000));
    if (error || !data) throw Error('Deletion workflow storage is unavailable.');
    return data;
  }
}
export class DeletionBlocked extends Error {
  constructor(public code: 'REVIEW_REQUIRED' | 'PROVIDER_OUTCOME_UNCONFIRMED' | 'ADAPTER_UNAVAILABLE') {
    super(code);
  }
}
export type DeletionStepContext = {
  requestId: string; ownerId: string; policy: DeletionPolicy; leaseToken: string;
  checkpoint?: DeletionCheckpoint;
};
export interface DeletionAdapter {
  // Only explicitly idempotent operations may be retried after an interrupted
  // dispatch without first recording a remote operation ID.
  idempotent: boolean;
  run(context: DeletionStepContext): Promise<
    { verified: true; receipt: Receipt } | { verified: false; receipt: Receipt & { operationId: string } }
  >;
}
export function assertExecutionPolicy(policy: DeletionPolicy | undefined) {
  const keys = ['version','legalReview','retentionSchedule','sharedContentReview','billingSettlement',
    'storageInventory','backupReview','providerInventory'] as const;
  if (policy?.executionApproved !== true || keys.some(key => typeof policy[key] !== 'string'
    || !policy[key].trim() || policy[key].length > 200)) throw new DeletionBlocked('REVIEW_REQUIRED');
}
function validReceipt(receipt: Receipt, pending: boolean) {
  return receipt && Object.keys(receipt).every(key => ['code','operationId'].includes(key)) &&
    typeof receipt.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(receipt.code) &&
    (receipt.operationId === undefined ? !pending : typeof receipt.operationId === 'string' &&
      /^[a-zA-Z0-9_:-]{1,160}$/.test(receipt.operationId));
}
export class AccountDeletionWorker {
  constructor(
    private store: DeletionWorkStore,
    private adapters: Partial<Record<DeletionStep, DeletionAdapter>>,
    // No environment variable or HTTP endpoint enables this implicitly.
    private executionEnabled = false,
  ) {}
  async run(requestId: string) {
    if (!this.executionEnabled) return { state: 'disabled' as const };
    // Incomplete wiring must never freeze accounts or mark any stage verified.
    if (DELETION_STEPS.some(step => !this.adapters[step])) return { state: 'unavailable' as const };
    const token = crypto.randomUUID();
    const job: DeletionClaim = await this.store.command(requestId,'CLAIM',token);
    if (!job.claimed) return { state: 'not_claimed' as const };
    let current: DeletionStep | undefined;
    try {
      assertExecutionPolicy(job.policy);
      if (!job.ownerId || !job.steps) throw new DeletionBlocked('REVIEW_REQUIRED');
      for (const step of DELETION_STEPS) {
        current = step;
        const checkpoint = job.steps[step];
        if (checkpoint?.state === 'verified') continue;
        const adapter = this.adapters[step]!;
        if (checkpoint?.state === 'started' && !adapter.idempotent) {
          throw new DeletionBlocked('PROVIDER_OUTCOME_UNCONFIRMED');
        }
        await this.store.command(requestId,'START',token,step);
        const result = await adapter.run({ requestId, ownerId: job.ownerId, policy: job.policy!, leaseToken: token, checkpoint });
        if (!result || (result.verified !== true && result.verified !== false) ||
          !validReceipt(result.receipt,result.verified !== true)) throw Error('Unverified adapter result');
        await this.store.command(requestId,result.verified ? 'VERIFY' : 'WAIT',token,step,result.receipt);
        if (!result.verified) return { state: 'waiting' as const, step };
      }
      await this.store.command(requestId,'COMPLETE',token);
      return { state: 'completed' as const };
    } catch (error) {
      // No provider payload, PII or secret is returned or stored on failure.
      const code = error instanceof DeletionBlocked ? error.code : 'CLEANUP_FAILED';
      const first = current || DELETION_STEPS.find(step => job.steps?.[step]?.state !== 'verified');
      // If a stale lease prevents this write, let the error propagate. Never
      // report a durable needs_attention state that was not actually committed.
      if (!first) throw Error('Deletion completion was not confirmed.');
      await this.store.command(requestId,'FAIL',token,first,{ code });
      return { state: 'needs_attention' as const, step: first, code };
    }
  }
}
