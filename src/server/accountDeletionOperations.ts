import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeletionAdapter, DeletionStepContext } from './accountDeletionWorker';
import { DeletionBlocked } from './accountDeletionWorker';

export type DeletionOperation = (context: DeletionStepContext, action: string, payload?: object) => Promise<any>;
export function deletionOperations(db: SupabaseClient): DeletionOperation {
  return async (context, action, payload = {}) => {
    const { data, error } = await db.rpc('nanivio_deletion_operations', {
      p_request: context.requestId, p_token: context.leaseToken, p_action: action, p_payload: payload,
    }).abortSignal(AbortSignal.timeout(15000));
    if (error || !data) throw new DeletionBlocked('REVIEW_REQUIRED');
    return data;
  };
}

export function accessDeletionAdapter(command: DeletionOperation): DeletionAdapter {
  return {
    idempotent: true,
    async run(context) {
      const state = await command(context, 'FREEZE');
      if (state.frozen !== true) throw new DeletionBlocked('PROVIDER_OUTCOME_UNCONFIRMED');
      // A reviewed provider inventory must include actual expiry/revocation
      // evidence for legacy grants. Socket closure is not that evidence.
      const check = await command(context, 'ACCESS');
      if (check.reviewRequired === true) throw new DeletionBlocked('REVIEW_REQUIRED');
      if (check.verified === true) return { verified: true, receipt: { code: 'MEDIA_ACCESS_DRAIN_VERIFIED' } };
      if (check.pending !== true) throw new DeletionBlocked('PROVIDER_OUTCOME_UNCONFIRMED');
      return { verified: false, receipt: { code: 'MEDIA_ACCESS_EXPIRY_PENDING', operationId: context.requestId } };
    },
  };
}

export function billingDeletionAdapter(command: DeletionOperation): DeletionAdapter {
  return {
    idempotent: true,
    async run(context) {
      const result = await command(context, 'BILLING');
      if (result.verified !== true) throw new DeletionBlocked('REVIEW_REQUIRED');
      return { verified: true, receipt: { code: 'RENEWALS_STOPPED_SETTLEMENT_REVIEWED' } };
    },
  };
}

export type OwnedFile = { object_id: string; channel_id: string; url: string };
export interface DeletionFileTransport {
  remove(file: OwnedFile): Promise<void>;
  absent(file: OwnedFile): Promise<boolean>;
}
export function storageDeletionAdapter(command: DeletionOperation, files: DeletionFileTransport): DeletionAdapter {
  return {
    idempotent: true,
    async run(context) {
      const inventory = await command(context, 'STORAGE');
      if (inventory.reviewed !== true || !Array.isArray(inventory.files))
        throw new DeletionBlocked('REVIEW_REQUIRED');
      // Bound work to stay within a worker lease. A subsequent claim resumes
      // from remaining SQL rows, including after a crash following deletion.
      for (const file of inventory.files.slice(0, 2)) {
        if (!file || typeof file.object_id !== 'string' || typeof file.channel_id !== 'string'
          || typeof file.url !== 'string') throw new DeletionBlocked('REVIEW_REQUIRED');
        // A missing/expired CDN link alone cannot prove provider-side erasure.
        // Require the authenticated provider delete (or its precise idempotent
        // not-found result) as well as a subsequent absence check.
        await files.remove(file);
        if (!await files.absent(file)) throw new DeletionBlocked('PROVIDER_OUTCOME_UNCONFIRMED');
        const result = await command(context, 'FILE_REMOVED', { objectId: file.object_id, url: file.url });
        if (result.removed !== true) throw new DeletionBlocked('PROVIDER_OUTCOME_UNCONFIRMED');
      }
      const remaining = await command(context, 'STORAGE');
      if (remaining.reviewed !== true || !Array.isArray(remaining.files)) throw new DeletionBlocked('REVIEW_REQUIRED');
      if (remaining.files.length) return {
        verified: false, receipt: { code: 'OWNED_FILE_CLEANUP_PENDING', operationId: context.requestId },
      };
      return { verified: true, receipt: { code: 'REVIEWED_OWNED_STORAGE_REMOVED' } };
    },
  };
}

export function operationsVerificationAdapter(command: DeletionOperation, local: DeletionAdapter): DeletionAdapter {
  return {
    idempotent: true,
    async run(context) {
      const result = await command(context, 'VERIFY');
      if (result.verified !== true) throw new DeletionBlocked('REVIEW_REQUIRED');
      return local.run(context);
    },
  };
}
