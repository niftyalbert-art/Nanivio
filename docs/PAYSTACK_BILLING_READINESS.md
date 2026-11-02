# Paystack billing readiness

## Status

All four supported purchase categories have checkout, authenticated verification,
signed-webhook fulfillment, persistent benefits and production-only recovery.
This is implementation and isolated-test evidence, not certification of live
bank/card/Mobile Money settlement on Render.

| Purchase | Verified delivery |
| --- | --- |
| Communication wallet top-up | Currency-specific spendable communication balance |
| Communication minute package | Purchased minutes and validity |
| Communication subscription | Purchased quotas and monthly/annual term |
| Malvi subscription | Purchased voice/avatar allowances, spendable credit and term |

## Changes from this audit

- Extend the existing bounded pending-order recovery worker to all four purchase
  categories, rather than Malvi alone. Production and live-key restrictions stay
  in place; the development preview must not perform background financial writes.
- Honor the stored minute-package snapshot even if that package is removed from
  the administrator catalogue after checkout. Legacy orders without snapshots
  still require their configured product and exact matching price.
- Repair a pending order's fulfillment marker on a verified retry when the
  financial transaction already committed, without granting value again.
- Make the existing reference-based recovery control available outside the
  Malvi tab as well. It verifies the original purchase, not another charge.

No new database migration is introduced by these changes. The existing billing,
paid-subscription and Malvi activation migrations remain prerequisites.

## Automated evidence

- 74 unique passing Paystack tests: 49 route/ledger tests plus 25 quote, safety,
  verification, polling and reconciliation tests.
- 24 PostgreSQL scenarios cover the four purchase types, card/Mobile Money-shaped
  notifications, GHS/USD and monthly/annual terms where applicable.
- Actual application handlers run against a stub gateway and isolated PostgreSQL,
  using the real financial migration functions. No real provider credential,
  customer account or payment network is used.
- Forced downstream payment-insert failures roll back benefits, payments and
  wallet ledger entries. Background recovery then fulfills the original order
  without relying on a browser callback.
- Deposited wallet funds actually purchase a minute package through the
  wallet-funded SQL command. Communication quotas can fund recorded usage, and
  paid Malvi minutes can fund an actual allowance reservation in the test DB.
- Concurrent repeated signed notifications and authenticated verification do not
  refill consumed value. Other-account reference replay is rejected.
- Declined, abandoned, reversed, pending, test-mode and unverifiable payments do
  not activate purchases. Verification errors preserve a recoverable reference.
- Recovery control browser fixtures pass at mobile and desktop widths, including
  confirmed-but-pending activation, provider failure and successful recovery.
- TypeScript and the production build pass.

## Still requires production verification

1. Deploy the reviewed update to Render.
2. Confirm merchant configuration and the signed notification endpoint
   `/api/paystack/webhook`. Keep all secret credentials on the server.
3. Use owner-approved controlled live purchases, one category at a time, and
   confirm the correct authenticated account receives the purchased value.
4. Check both merchant-enabled card and Mobile Money methods. The simulated
   GHS/USD matrix does not prove that a particular merchant account, country or
   Mobile Money network accepts USD or supports every payment method.
5. Confirm receipts/history, a missed browser callback, and recovery of the same
   reference. Do not pay a second time just to repair activation.

Direct verification and signed notification can deliver value once the payment
and original order match. The bounded backup worker is eventual recovery, not a
promise of instant activation under an outage or a large pending-order backlog.
Orders beyond its 30-day scan window retain manual reference-based verification.

Monthly and annual checkout purchases activate paid terms; these flows do not
create Paystack recurring subscriptions or establish automatic renewal.
