# Communication entitlement database verification

These checks invoke the PostgreSQL functions from migration 007. They do not
substitute the in-memory billing engine for database persistence.

## Isolated local PostgreSQL

Run `bash tests/run-postgres-regressions.sh`. It creates a temporary cluster with
no TCP listener, applies the migrations, runs the SQL and independent-session
concurrency checks, then stops and removes the cluster.

Run `node --test tests/staging-entitlements-guard.test.mjs` for the runner's
connection-safety checks. These tests never connect to a database.

## Separate staging Supabase project

Keep the application's production settings unchanged. Store a PostgreSQL
connection string for a **separate staging Supabase project** in the
`STAGING_DATABASE_URL` secret. Use the direct or session-pooler connection on
port 5432, with the actual database password and SSL required. The staging
database must already contain the normalized billing tables from migration 002.

The current app's HTTPS API URL must remain in `SUPABASE_URL`. The runner refuses
to connect if the staging project reference matches the app project reference;
using a different connection mode for the same project is not staging.

With the staging project explicitly approved for test writes, run:

```sh
node tests/run-staging-entitlements.mjs --confirm-staging --apply-migration
```

This applies **only migration 007**, atomically. Omit `--apply-migration` to check
an already-migrated staging database. No application, auth, wallet-funding or
provider APIs are called.

## Coverage and cleanup

- Initial zero-price grant, same-plan retries, quota exhaustion and tier/cycle
  switches preserving consumption and the original term.
- Expired allowance excluded from spending; one fresh annual grant after expiry;
  retries of an old usage event cannot charge the renewed term.
- Purchased minute packs remain unchanged by selection and renewal and remain
  consumable after plan allowance is exhausted.
- Simultaneous first selections create one durable grant. Selection racing with
  usage preserves consumption. At least two database sessions are observed
  waiting for the actual entitlement advisory lock before each race is released;
  every worker in the race must be waiting before release.
- Stable minute-boundary event IDs survive concurrent retries and separate client
  connections; racing to spend the last minute accepts only one request.
- An existing funded wallet is unchanged. Selection and allowance usage create
  no wallet/credit-ledger debit, payment confirmation, invoice or billing transaction.
- Concurrency RPC calls run as `service_role`, matching the application's RPC
  execution role. The staging runner verifies both functions deny `anon` and
  `authenticated` and permit `service_role`.

Sequential fixtures are rolled back. Concurrent tests need committed rows to
verify cross-connection persistence; they use random UUID-scoped users and delete
only those exact users' fixtures after all workers finish. Interrupted processes
can leave test fixtures; do not delete rows belonging to real users.

These checks cover database RPC behavior, not authenticated HTTP routes, browser
rendering, real call-provider operation or Paystack purchases. The older
`tests/audit-verification.ts` remains an in-memory audit and is not evidence of
Supabase verification. A local pass is not a staging pass: record a successful
staging run before declaring the staging task complete.

## Current verification evidence

- Isolated PostgreSQL suite: passed, including the sequential entitlement SQL
  and four independent-session concurrency scenarios.
- Staging connection-safety unit tests: seven passed; no network connections.
- Staging Supabase execution: **passed on 2026-10-16, completed at 19:04 UTC**,
  against the separate test project supplied by the user. The original
  application-project connection was rejected before opening a connection.
- The new staging project had none of the billing tables. Migration 002 was
  applied atomically as the prerequisite, after confirming the approved project
  identity and that it contained no application tables. Migration 007 was then
  applied atomically. No production migration or production test fixtures were
  written.
- All sequential grant/retry/expiry/paid-pack checks passed in staging, as did
  all four independent-session concurrency scenarios. Both functions' execute
  permissions were verified to be service-role-only.
- A final read-only staging check found zero rows in subscriptions, usage
  events, wallets, wallet ledger, credit ledger, invoices, payments, billing
  transactions and billing audit logs: no committed test fixtures remain.
- The signed-out application preview loaded successfully. Authenticated UI
  flows were not verified as part of these database checks.

Migration 007 SHA-256:
`67f6524204b1cfd9109bf8311943397d4b0f1e183dfc4f119f866ecf4f1bcd1d`

The staging run also validated two client-compatibility requirements: inherited
libpq service settings must be removed rather than set to empty strings, and
the session pooler need not preserve the startup application name. The concurrency
barrier therefore identifies its workers by a query comment, observes every
worker waiting on the real advisory lock, then releases them.
