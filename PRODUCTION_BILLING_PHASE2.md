# Nanivio Production Billing — Phase 2

Phase 2 moves critical financial mutations from process memory into a PostgreSQL/Supabase transactional ledger.

## Database objects

- `nanivio_wallets` — one wallet per user/account type/currency, with versioning.
- `nanivio_wallet_ledger` — immutable debit/credit entries.
- `nanivio_billing_transactions` — canonical service transactions.
- `nanivio_payments` — provider payments with unique `(provider, provider_reference)`.
- `nanivio_subscriptions` — persistent communication/Langpretation entitlements.
- `nanivio_malvi_subscriptions` — persistent Malvi entitlements.
- `nanivio_credit_accounts` / `nanivio_credit_ledger` — separate service-credit accounting.
- `nanivio_invoices` — persistent invoices/receipts.
- `nanivio_usage_events` — persistent usage events.
- `nanivio_billing_audit_logs` — audit trail.
- `nanivio_billing_command()` — a server-only transactional RPC for critical mutations.

## Critical paths now using the transactional ledger

1. Fintech → Communication wallet transfer.
2. Peer-to-peer value transfer.
3. Paystack communication-wallet top-up.
4. Paystack communication-minute purchase.
5. Paystack subscription activation.
6. Paystack Malvi subscription activation.
7. Communication-balance subscription purchase.
8. Langpretation usage/quota consumption.

Each critical mutation is performed inside PostgreSQL, with row locks and a single transaction, instead of trusting a JavaScript `Map` for the financial source of truth.

## Production setup

Run:

- `migrations/001_billing_persistence.sql`
- `migrations/002_billing_normalized_ledger.sql`

in Supabase SQL Editor.

Render must provide:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The service role key must exist only on the backend. Never put it in the Vite frontend or expose it to users.

## Important operating rule

The legacy `BillingDatabase` arrays/maps remain as a compatibility/read cache for older UI code. They are **not** the authoritative source for the critical money mutations listed above when normalized billing is enabled. Production code refuses critical Paystack wallet crediting/subscription activation when the normalized database is unavailable.

## Still required before calling the entire financial platform complete

- Move remaining mobile-money verification/deposit state into normalized tables and transactional commands.
- Move disputes/refunds/provider earnings into normalized tables and transactional commands.
- Replace remaining admin read endpoints that directly inspect legacy arrays/maps with database queries.
- Add scheduled subscription renewal/reconciliation jobs against the payment provider.
- Add automated concurrency/idempotency tests against a real Postgres test database.
