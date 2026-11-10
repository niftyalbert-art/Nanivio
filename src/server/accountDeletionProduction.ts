import type { SupabaseClient } from '@supabase/supabase-js';
import { AccountDeletionWorker, SupabaseDeletionWorkStore } from './accountDeletionWorker';
import { identityDeletionAdapter, localDeletionAdapter, localVerificationAdapter,
  streamDeletionAdapter, voiceDeletionAdapter } from './accountDeletionAdapters';
import { accessDeletionAdapter, billingDeletionAdapter, deletionOperations,
  operationsVerificationAdapter, storageDeletionAdapter } from './accountDeletionOperations';
import { createDeletionFileTransport } from './accountDeletionFiles';
import { accountDeletionStreamTransport, removeStreamFileForAccountDeletion } from './streamService';
import { voiceProfiles } from './voiceProfileService';

/** Explicit operator construction only. Server boot, public deletion requests,
 * environment flags and ordinary admin reads never call/enable this worker. */
export function createProductionDeletionWorker(db: SupabaseClient, executionEnabled = false) {
  const command = deletionOperations(db);
  return new AccountDeletionWorker(new SupabaseDeletionWorkStore(db), {
    access: accessDeletionAdapter(command),
    billing: billingDeletionAdapter(command),
    storage: storageDeletionAdapter(command, createDeletionFileTransport(removeStreamFileForAccountDeletion)),
    voice: voiceDeletionAdapter(voiceProfiles),
    stream: streamDeletionAdapter(accountDeletionStreamTransport),
    personal_data: localDeletionAdapter(db),
    auth_identity: identityDeletionAdapter(db),
    verification: operationsVerificationAdapter(command, localVerificationAdapter(db)),
  }, executionEnabled);
}
