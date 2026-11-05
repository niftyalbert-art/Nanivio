# Plan enforcement: database update 026

Apply the **complete** `migrations/026_plan_enforcement.sql` file after migrations
020, 024 and 025. Successful installation returns `plan_enforcement_installed = true`.
The migration is transactional and repeatable. Do not publish the corresponding
application changes before installing it. No prices, wallet balances, purchased
allowances, subscription periods or customer files are changed by installation.

## Connected protections

- Paid public-web research reserves up to four available provider queries before
  dispatch. Both the direct research endpoint and live conversation tool use this
  boundary. Confirmed unused queries return to the same allocation. Unknown usage
  after a dispatched timeout conservatively retains the bounded reservation.
- Actual reported query fan-out is recorded separately from customer consumption.
  A provider may generate more queries than reserved; Nanivio absorbs that excess,
  never charges the customer above the reservation, and retains the measured count
  for cost reconciliation. This is not a provider-side hard spending cap or proof
  of profit margins. Model token/context costs still need separate cost accounting.
- New chat uploads reserve the actual binary byte length after fresh channel
  membership verification, before sending bytes to the provider. Unknown upload
  outcomes remain pending rather than creating free untracked uploads.
- The user can inspect recent metered uploads and explicitly delete a stored file.
  Provider deletion must succeed before recorded occupancy is removed. Message
  deletion alone does not pretend that the uploaded file was physically deleted.
- Workspace documents are inventoried and metered by a database trigger in the
  same transaction as insert/update/delete. Occupancy persists across renewals.
- Invited Business members use the verified workspace owner's capability and
  shared request budget. They do not need a personal Business subscription just
  to join. Creating another workspace still requires their own Business plan.
- Conference participants reuse the owner's existing meeting lease. Joining does
  not reserve a second avatar allowance. A viewer leaving or failing to obtain a
  token cannot settle/refund the host's reservation. Owner departure closes the
  meeting; cleanup remains possible after plan expiry.
- Independent private Malvi sessions are not silently sponsored by a workspace.
- Billing shows confirmed recorded storage and paid-search access, with unknown
  data shown as unavailable. State is bound to the authenticated account.

## Explicit remaining boundaries

Historical chat uploads do not have a trustworthy complete uploader/byte inventory
in this database. They are **not** assigned guessed owners or sizes, retrospectively
deleted, or represented as fully counted. The UI labels storage as recorded usage
and discloses the incomplete historical inventory. A provider-authoritative inventory
and safe reconciliation are still required before claiming total historical storage
enforcement. Pending provider outcomes also need reconciliation before release.

Legacy paid storage rows do not preserve every administrator-customized original
storage capacity. Their previous behavior is preserved until the purchased term
expires, rather than applying an invented retroactive byte cap. New versioned
purchase snapshots provide enforceable capacities.

Measured cost weighting across Khaya/Palabra/other Langpretation routes is still a
separate gap. Do not equate these protections, configured credentials or automated
tests with a verified full language matrix or actual production provider margins.

## Verification and rollout

Run the plan-enforcement, shared-budget, Business workflows/avatar, attachment,
research, billing-render, balanced-rollout/ledger and payment regression suites.
The rollout integration test installs 026 after the real existing migrations.
Tests use PostgreSQL-compatible local test databases and provider doubles, not
real paid purchases or live customer file deletion.

After the owner installs the database update, prepare a scoped application release
on `malvi-production-upgrade`. Do not push unrelated local calling/voice changes.
Production needs separate signed-in smoke checks; no application release or live
database change is authorized merely by the existence of this migration file.
