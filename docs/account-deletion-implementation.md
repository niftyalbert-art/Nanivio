# Account deletion: implementation boundary

Production cleanup wiring and the guarded operator workflow are documented in
`account-deletion-worker.md`. The owner approved the execution safeguards.
Installation and real account-specific finance/provider/storage evidence remain
separate; no live customer deletion has been performed.

## Implemented

- Settings → Account & Data contains a separate verified deletion-request flow.
- `/delete-account` is a public request page, including for users unable to sign in.
- Fresh email verification, typed DELETE confirmation, five code attempts,
  ten-minute expiry, persistent send limits and idempotent request storage.
- Codes are stored as scoped HMACs, never as plaintext; request receipts contain
  no email, password or provider credentials.
- Saved requests are visible only to their authenticated owner.
- Authenticated administrators can inspect a bounded, paginated request queue
  under Admin → Account Deletion. It contains references/status/timestamps, not
  verification codes, emails or provider secrets. It is read-only: there is no
  button to fake completion or perform unimplemented erasure.
- Inactive profiles cannot sign in with a password or use normal authenticated
  HTTP feature/profile routes. Narrow authenticated voice-removal and
  deletion-status paths remain available. Persistent browser/native realtime
  sockets now also recheck account authority and close on revocation. This does
  not establish revocation of already-issued third-party media grants.
- SQL runs in the existing Supabase project. Missing schema/delivery configuration
  fails closed. No fake local success or replacement database.

## Non-live fulfillment engine; production erasure remains disabled

**A saved request is not a deleted account.** Intake leaves accounts and benefits
unchanged. A durable, tested fulfillment engine and cleanup adapters now exist,
but it is not scheduled, exposed as a deletion action or fully wired to all
production resource handlers. See `docs/account-deletion-worker.md` for exact
coverage, safety controls and remaining blockers. Do not describe this as
completed production permanent deletion or mark the full-deletion work complete.

The existing database has both cascading invoice/subscription foreign keys and
restricting financial/usage foreign keys. Blind profile deletion is unsafe.
The owner must approve a documented retention policy before fulfillment is enabled;
the Ghana/UAE schedule is approved as a working draft only, not an execution policy.

Before enabling erasure:

1. Approve the data inventory and lawful, limited retention periods, including
   backup expiry, shared-conversation treatment and payment-provider records.
2. Implement a durable, retryable fulfillment worker with per-provider receipts,
   explicit partial-failure states and verified completion—not a blanket cascade.
3. Revoke login and existing realtime/media authority across server instances;
   reject new actions and prevent token restoration or profile recreation.
4. Delete the saved Palabra voice through the existing voice service, including
   uncertain/in-progress creation states. Confirm remote removal before dropping
   the ownership record. Remove private Malvi history/preferences, applications,
   owner contacts/settings/notifications and profile data.
5. Inventory and clean Stream user content/files, app-storage objects and business
   resources; preserve other participants' rights. Provider task acceptance alone
   is not erasure confirmation. Clear account-owned browser caches at completion.
   Stream's current documentation warns that hard-deleting a user's messages
   also removes other members' thread replies. Do not default to a hard delete
   of shared threads. Explicitly choose an approved pruning/deletion policy,
   preserve other users' content where supported, and verify provider task
   completion rather than merely accepting a task ID.
6. Disable renewals without claiming this cancels payment-provider/store billing.
   Define refund/remaining-credit treatment before any destructive operation.
7. Erase the Supabase Auth identity only after provider-resource cleanup can be
   retried safely. Minimize any retained financial identifiers and PII separately.
8. Test the complete process with isolated fixtures, then obtain specific owner
   consent before deleting any real test account.

## Installation and release

- Owner runs `migrations/029_account_deletion_requests.sql` in the intended
  Supabase project; expected final flag: `account_deletion_requests_installed = true`.
  It creates intake tables/functions only; it does not delete accounts.
- Uses the existing `SESSION_SECRET` and Resend delivery configuration; no keys
  are embedded in code. Keep the session secret consistent across instances.
- Code is not live until the owner approves a scoped push/release to Render.
- After release, the public request path is `/delete-account`. Do not submit it
  to Google Play as proof that fulfillment/retention disclosures are complete.
