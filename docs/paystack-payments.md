# Paystack payment setup and verification

These checkouts use Paystack redirect checkout: Nanivio balance top-ups, communication/Langpretation minute packs, communication subscriptions, and Malvi subscriptions.

## Required configuration

1. Set `PAYSTACK_SECRET_KEY` in the host's secure secret/environment settings. Never put it in source control or frontend code. A public key is not required for this redirect flow.
2. Use the existing Supabase billing database. Apply `migrations/008_paystack_paid_subscriptions.sql` after the existing normalized billing and communication-entitlement migrations (`002` and `007`). This is additive; it does not replace the database, clear existing allowances, or migrate customer records.
3. Configure the Paystack webhook to your public app origin followed by `/api/paystack/webhook`.
4. Use a currency enabled for your Paystack merchant account. Catalog-backed checkouts are priced in GHS or USD.

Workspace secrets do not automatically configure an independently hosted production service. Set the secret and apply the migration on the actual production host/database before launch.

Paid communication checkout checks that its new database function is installed **before** initializing a payment. Missing setup returns an explicit error rather than accepting a payment that cannot activate the plan.

## Payment behavior

- Prices, minutes, validity, and subscription allowances come from the server catalog and are saved with the order. Client-modified product prices or quantities are rejected.
- The authenticated account supplies the customer email and owns the order.
- Initializing/opening checkout does not grant value.
- The server checks successful Paystack status, the account, amount, and currency before granting value.
- The signed webhook and manual verification can safely arrive repeatedly. Ledger fulfillment is atomic/idempotent by reference. Failed webhook deliveries remain retryable.
- Paid communication subscriptions create a paid invoice and a new allowance term without debiting Nanivio balance. Free plans remain free; unpaid switches cannot replenish consumed allowances.
- These are one-time payments for the selected monthly/annual term. Renewal is manual; no recurring Paystack mandate is created.
- Wallet-funded purchases remain separate commands that actually debit wallet balance.

## Verification before using live payments

Use a Paystack test secret first. Complete a test checkout for each product, confirm exactly one matching paid invoice/payment and the correct balance or allowance, then revisit verification/send the webhook again and confirm no duplicate value. Verify that another signed-in account cannot claim the reference.

The automated suite executes the actual checkout/verification/webhook handlers with a **stubbed** provider. The PostgreSQL test checks paid allowances, usage, invoices, idempotency, ownership, permissions, and rollback against an isolated database. Neither check substitutes for a successful checkout with the configured Paystack merchant account.
