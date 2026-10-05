# Nanivio Production Billing Persistence — Phase 1

This patch removes the critical Render-restart dependency on the in-memory `BillingDatabase` for the current billing engine by persisting its authoritative financial state to Supabase Postgres.

## What changed

- Server startup now **fails closed** when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are missing. The app will not start and silently create a new empty financial database in memory.
- Billing state is hydrated from `nanivio_billing_state` before the HTTP server starts.
- Financial state is flushed back to Postgres continuously and on SIGTERM/SIGINT.
- Paystack order intents are stored in `nanivio_paystack_orders`, so a Render restart no longer loses the pending order reference.
- Paystack webhook deliveries are idempotently recorded in `nanivio_paystack_events`.
- Paystack fulfillment now requires an authoritative server-side order and verifies amount/currency before granting value.
- Paystack webhook signatures are checked safely, including malformed signature lengths.
- A fulfilled Paystack order is marked as fulfilled so it cannot be credited again.

## Required database setup

Run `migrations/001_billing_persistence.sql` in the Supabase SQL editor.

Then set these **server-only** Render environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYSTACK_SECRET_KEY`

Do not put `SUPABASE_SERVICE_ROLE_KEY` in any `VITE_*` variable or frontend code.

## Paystack production behavior

The backend remains the source of truth. A browser callback is not treated as proof of payment. The server verifies the Paystack transaction and the webhook is signature-checked before fulfillment. Paystack recommends webhooks for final payment updates and server-side verification before delivering digital value.

## Important limitation of this phase

The existing billing engine still exposes synchronous in-memory collection APIs to older parts of Nanivio. This patch makes that state durable and prevents ordinary Render restarts from erasing it, but it is **not yet the final normalized double-entry ledger architecture** described in the production plan.

The next financial migration should replace the compatibility snapshot with normalized Postgres tables for:

- wallets
- immutable wallet ledger
- credit accounts / credit ledger
- subscriptions
- payments
- payment events
- invoices
- usage events
- refunds / reversals
- audit logs

Until that migration is complete, do not horizontally scale multiple billing workers and do not describe the current snapshot layer as a full double-entry financial ledger.
