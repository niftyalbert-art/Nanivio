# Non-live account-deletion fulfillment

## Release boundary

This is a tested processing engine with production adapter wiring and an
explicit operator entry point, **not an enabled automatic erasure service**.
No worker is started by server
boot, a timer, an environment variable, a public request or an admin button.
The constructor defaults to disabled and refuses incomplete adapter wiring
before reading or changing storage. Do not enable it based on draft policy
approval, and do not test it against existing customer/test accounts.

All destructive tests use a separate PGlite database or in-memory provider
fixtures. No real emails, payment actions, paid calls, storage removals,
Supabase identity removals or customer-account deletions are part of these tests.

## What the engine does

The fixed sequence is access revocation → billing settlement → storage cleanup →
saved voice → Stream chat pruning → local personal data → auth identity →
final verification. It derives the owner from the saved verified request,
not a caller-provided account ID.

- Durable two-minute, fenced leases prevent competing workers from committing
  each other's progress. Each stage renews the lease before dispatch.
- Verified stages survive retry; a pending provider operation resumes by its
  saved operation ID. Task acceptance is not completion.
- An interrupted non-idempotent operation without a saved task ID requires
  manual reconciliation; it is never automatically resubmitted.
- Failures produce a safe `needs_attention` state. Provider bodies, secrets,
  private text, email addresses and signed URLs are not copied into receipts.
- Completion requires all eight stages plus a fresh SQL verification of the
  actual local state, not just saved success receipts.

## Implemented cleanup capabilities

- Account authority checks are wired into the existing realtime server for
  persistent browser/native identities. Inactive profiles and failed authority
  checks close their sockets. Fresh control checks and short media leases
  avoid a database request for every microphone frame.
- Palabra voice cleanup reuses the existing deletion service. Enabled,
  uncertain or unconfirmed profiles do not pass.
- Stream uses explicit `user: pruning`, `messages: pruning`,
  `conversations: keep`, `files: false`. It verifies the saved task's completion
  and that the target owner is no longer returned as an active user. This is
  **pruning**, not hard deletion of all provider records. Shared replies are
  not hard-deleted. Files require independent storage cleanup evidence.
- Transactional local cleanup removes known owner-private contacts/settings,
  notifications/applications, private Malvi messages/preferences, deletion
  challenges and verified-deleted voice records. Associated signup challenges
  are removed by the original email/phone.
- The profile is reduced to a non-login ledger tombstone, not cascade-deleted.
  Opaque IDs, financial balances and creation metadata remain as necessary
  ledger links; this is pseudonymization, not a claim of complete anonymity.
  Names/contact details/avatar and other recognized personal profile fields
  are removed. Unknown populated resources or unknown profile columns block
  cleanup rather than silently being skipped.
- Supabase Auth removal targets the original owner's stored auth ID. A fresh
  provider check must confirm `404 / user_not_found` before that mapping is
  cleared. Generic 404s, accepted deletion and missing configuration do not
  count as verified absence.
- Database fences prevent late private writes, reactivation or restoration of
  erased personal fields. Ordinary suspended-account administration remains
  available outside an active erasure.
- Retained owner-scoped financial rows each require an explicit resource key,
  lawful basis, review reference, relevant date and expiry. Reviewed holds have
  review dates; expired/unreviewed holds block completion. Ghana/UAE tax expiry
  calculations use an operator-reviewed relevant date, never the deletion date.
  The draft policy is not itself execution approval.

## Still required before production fulfillment

1. The owner approved the execution safeguards, not fabricated per-account
   evidence. Complete entity-specific legal/retention, storage, backup, provider
   and shared-content reviews; resolve credits, refunds and external/store
   renewals. The tax retention schedule still requires entity-specific review.
2. Record actual provider revocation/expiry and cessation-of-issuance evidence
   for each affected account. Account-status/socket revocation is **not proof of
   revocation of previously issued Agora/Stream/Heygen grants**. The adapter
   never invents a legacy token lifetime. It waits on established absolute
   deadlines and blocks if provider evidence is missing.
3. Inventory existing avatars, attachments, indirect/legacy JSON records,
   business rooms and provider copies. Business memberships or unrecognized
   owned data require reviewed cleanup. Do not blindly delete shared rooms or
   files referenced by other users.
4. Implement and verify disposal/review of retained records at their approved
   expiry, with cross-owner legal-hold checks and safe ledger treatment.
   Retention evidence is not an automatic financial-row purger.
5. Verify account-owned browser-cache clearing on the next connected client
   interaction. Offline recipient copies cannot be remotely erased by a worker.
6. Review the complete changes and obtain a separately approved release and a
   disposable-account live test. Do not erase the two existing test accounts.

## Database setup (not applied by the agent)

Apply `migrations/030_account_deletion_fulfillment.sql` and then
`migrations/031_account_deletion_local_cleanup.sql`, followed by
`migrations/032_account_deletion_operations.sql`, after review in the
existing Supabase project after migration 029 and the existing billing/storage
migrations. Installing them starts no jobs.
Expected flags are `account_deletion_fulfillment_installed` and
`account_deletion_local_cleanup_installed`, then
`account_deletion_operations_installed`. The latter migrations add write and
completion fences; they do not erase existing rows.

Run `node scripts/package-account-deletion-setup.mjs` to generate the complete,
untruncated `generated-artifacts/account-deletion-setup.sql`. It combines these
three migrations, with a final `account_deletion_setup_installed` flag. Run it
once in the intended Supabase SQL editor; do not rerun a partially installed
batch without checking which transaction committed.

Only service-role code can prepare/claim/progress jobs. Preparing requires
**execution-approved** references for legal, retention, shared content,
billing, storage, backups and provider inventory. A request or draft approval
alone is insufficient. Do not manually set request status to `completed`.

## Operational adapters and review evidence

`createProductionDeletionWorker` wires all eight real stages. It defaults to
disabled. The manual operator entry point is:

```
node --import tsx scripts/run-reviewed-account-deletion.ts \
  --execute-reviewed-request <verified-request-uuid> --confirm-account-erasure
```

This is a destructive command for a separately approved, prepared request,
**not a setup or smoke-test command**. It is not run by deployment or server boot.
It cannot approve policy, waive review, choose an email, reset failed
non-idempotent dispatches, or mark a request complete on its own.

The service-only `nanivio_deletion_operation_reviews` table holds actual
account-specific evidence. No test/example references may be used in production:

- Access review supplies, for each of `agora`, `stream`, `azure`, `liveavatar`,
  `palabra`, and `gemini`, an evidence `reference`, `issuanceStoppedAt`, and
  absolute `notAfter`. The reviewed issuance-stop time must be on/after the
  durable account freeze and not in the future. Unused providers still need a
  reviewed not-used/absence reference. In-flight requests, token activation
  windows and provider refresh semantics must be considered. This is a
  **reviewed evidence gate, not an automatic provider revocation API or a claim
  that existing production grants have been tested/revoked**.
- Billing disables both local renewal flags, takes an exact inventory digest,
  and requires finance review of that digest. Unresolved payments/refunds,
  disputes and nonzero available/reserved/promotional/service-credit balances
  always block; nothing resets or forfeits funds. External renewal cancellation,
  paid-term disposition and settlement evidence must be completed by finance
  before signing the inventory review. New/changed financial rows invalidate it.
  This adapter does not initiate refunds or pretend local flags cancel Paystack
  or store subscriptions. Missing required tables fail closed.
- Storage review contains the exact original storage inventory and a reference
  confirming indirect/legacy/shared content, avatar classification and provider
  copies were reviewed. Existing business JSON, ambiguous pending uploads or
  cross-owner URL reuse block automatic removal. The adapter only deletes exact
  reviewed owned Stream attachments, using authenticated server deletion and a
  subsequent allowlisted CDN absence check. A 401/403 signed-link expiry,
  accepted-only deletion, changed file or untrusted URL never releases accounting.
  Avatar fields themselves are cleared by the later local stage; an external
  avatar object requires separate provider cleanup evidence, not blind URL fetch.
- The final operational check repeats access deadlines, billing digest and
  remaining-storage checks. A database completion trigger applies this even if
  someone writes fabricated stage receipts. Local final verification still runs
  separately. Waiting jobs remain frozen and cannot restore account access.

Use the private billing/storage inventory SQL functions to obtain evidence for
the named owner derived from the request; never print private inventories into
public logs. Do not treat this table as an arbitrary bypass. The operator must
verify the underlying evidence before saving its reference.

## Provider sources

- https://getstream.io/docs/platform/gdpr/
- https://raw.githubusercontent.com/GetStream/protocol/main/openapi/chat-openapi.yaml

Checked 2026-11-10. Stream hard message deletion can remove other participants'
thread replies, even when conversation channels are kept.
