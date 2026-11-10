// Operator-only entry point, never invoked by server boot or deployment.
// Preparing policy/reviews is a separate service-authorized review operation.
import { getServerSupabase } from '../src/server/supabaseServer';
import { createProductionDeletionWorker } from '../src/server/accountDeletionProduction';

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== '--execute-reviewed-request' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(args[1]) ||
    args[2] !== '--confirm-account-erasure') throw Error('Explicit reviewed-request execution is required.');
  const db = getServerSupabase();
  if (!db) throw Error('Service connection is unavailable.');
  // The worker derives the owner exclusively from the previously prepared,
  // verified request. This script cannot choose an email/account to erase,
  // approve a policy, create a review, waive a balance or forge completion.
  const result = await createProductionDeletionWorker(db, true).run(args[1]);
  console.log(JSON.stringify(result));
  if (result.state === 'needs_attention' || result.state === 'unavailable') process.exitCode = 2;
}
main().catch(() => {
  // Never print SDK/provider errors, auth material or personal data.
  console.error('Deletion was not confirmed. Review the protected job before retrying.');
  process.exitCode = 1;
});
