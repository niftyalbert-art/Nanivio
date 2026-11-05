# Balanced pricing implementation status

## Release boundary

The owner instructed us to implement the new bills now. The replacement catalogue
and checkout amounts are connected in the local code. Existing purchased terms and
provider selection are unchanged. The owner reported successful installation of
both required Supabase migrations. Code delivery is scoped separately from
unreleased calling changes; confirm the running Render catalogue before describing
the replacement prices as live.

Apply the current migrations **024 and 025**, in that order, before releasing the
new code. New checkout initialization fails before contacting Paystack or creating
a USDT invoice/debiting credit if the required rollout setup is absent. Migration
025 is atomic and repeatable and does not enroll or change legacy subscriptions.

## Connected rollout

- Replacement communication/Malvi catalogues; retired offers are not sold alongside
  them. Post-cutover administrator edits are retained.
- All seven plan prices and ten add-on prices use server-side quotes and copied,
  versioned purchase terms. Malvi voice and avatar allowances are independent.
- Paystack, verified TRON USDT and Nanivio credit capture new subscription terms
  atomically with existing payment/wallet fulfilment. Original paid-order recovery
  still uses its original snapshot, not today's price.
- Annual subscriptions renew their allowance allocation monthly, without extending
  the purchased term. Old reservations settle before the new allocation resets.
- Text request and character limits are checked independently. Cancelled/failed
  text work releases both. Ordinary untranslated chat remains free.
- Call/Langpretation/text packs fund communication admission and meters. Malvi packs
  escrow only the matching mode, reconcile confirmed usage, refund unused time and
  retain separate accounting from subscription allowances.
- Add-ons expire after 30 days and do not unlock other subscription features.
  Malvi add-ons require an active paid plan with the matching mode; ordinary calling
  packs are not sold during the free calling trial.
- Credit add-ons bind a stable purchase request ID and displayed amount, rejecting
  stale prices before debit.

The administrator's read-only cost proposal remains conservative: local SQL/handler
coverage is not proof of production provider costs or completion of every quota.

## Implemented in this stage

- A single typed schedule for all seven paid plans and ten packs, with integer USD cents.
- Immutable-by-copy purchase snapshots, separately denominated voice/avatar usage,
  request-plus-character text limits, measured translation-cost units and pooled limits.
- Twelve purchase-anchored calendar allocations for annual purchases. Month-end
  clamping does not drift, and there is no thirteenth allowance.
- A separate PostgreSQL ledger with account-owned, idempotent usage reservations,
  atomic multi-resource debits, refunds to the original allocation, expiring packs,
  shared pools and persistent storage occupancy.
- An authenticated finance/super-admin read-only **Pricing proposal** tab in the
  existing Malvi billing workspace, including estimates, assumptions and blockers.
- No save, publish, grant or purchase HTTP endpoint for draft products.
- An additive, repeatable migration in `migrations/024_balanced_pricing_ledger.sql`.
  It creates private tables/functions only. Installing it does not grant anything,
  publish prices, migrate customers, refill trials or alter existing billing tables.

The private `nanivio_balanced_usage` RPC is an accounting primitive, not a payment
verifier. Its service-role-only `GRANT` must eventually execute within the verified
payment fulfilment transaction. Never expose it directly to browsers. Business
callers must resolve a permitted workspace owner from verified server-side team
membership; they must not supply arbitrary pool owners.

## Remaining commercial-meter work

The pricing-cost review still reports production integrations as unverified.
Items 2–4 below now have local implementation and automated coverage. The remaining
provider-route, search, storage and cross-member pooling work is not complete:

1. Verify the selected production Malvi voice delivery and its actual costs, without
   changing the signature voice. Verify the shared live-minute and stream limits.
2. Connect authoritative, versioned purchase snapshots to every Paystack, verified
   TRON USDT and Nanivio-credit subscription/add-on path. Grant inside the payment
   transaction, with recovery and replay preserving the original snapshot.
3. Connect the annual ledger allocations and add-on pools to actual communication
   and Malvi admission, reservation, settlement and customer meter endpoints.
   Preserve legacy subscriptions until their paid terms end. A free-plan or
   billing-cycle switch must not create a new purchased allocation.
4. Charge text requests and Unicode source characters at the completed user-operation
   boundary, not per internal retry or generated voice-note transcript.
5. Instrument actual provider billing units for each supported Langpretation route.
   Pin the versioned cost schedule to the accepted quote/reservation, disclose the
   rate and maximum usage before activation, and reconcile success/failure.
   Two-way Palabra's modeled rate and Khaya's illustrative request arithmetic
   are not substitutes for observed billable usage.
6. Reserve paid search queries before provider dispatch and reconcile the actual
   provider query count, including query fan-out. Enforce/quote large file, image,
   research and context work; a tool-action count is not a provider-query count.
7. Enforce stored-byte capacity in the real upload/store/delete lifecycle. The
   ledger's storage primitives do not themselves intercept existing provider uploads.
   Carry occupancy across monthly renewals and backfill existing stored objects
   safely before enforcement; never silently delete customer files.
8. Resolve Business sponsorship, meeting, team and storage ownership server-side
   so seats and meeting viewers do not multiply grants or host rendering charges.

Only after those integrations and release tests pass should an explicitly approved
publication update the customer catalogues and expose the new packs. Source control
push approval and publication approval remain separate from implementation approval.

## Owner-approved cutover rule

The new catalogue must replace the old offers, not coexist with them in sales
screens. At the approved release, all purchase cards, selectors and new checkouts
must use only the replacement catalogue.

The owner chose to keep existing purchased benefits until their original expiry.
Old offers should be archived, not deleted. Show an unexpired legacy entitlement
only as **Your current subscription** or in billing history; do not keep selling
or renewing that retired offer. After expiry the customer may select a new plan
and accept its price. Do not silently migrate users or charge revised prices.

Retain original paid-order snapshots, payment recovery and receipts when archiving
old identities. This policy does not authorize switching off the working catalogue
before the replacement payment and core allowance integrations are installed.

## Verification

The billing-only release was also assembled from the current remote baseline,
excluding unreleased calling changes. That isolated tree passed **118 targeted
tests**, **five dependency-portability checks**, TypeScript and the production
build. This is the release-specific verification; it is not a live payment test.

The latest targeted rollout run passed **119 tests**, including actual extracted
Paystack initialization/verification handlers with a stubbed gateway, real
PostgreSQL migrations and three-rail activation, original-price recovery,
independent text limits, annual allocations, all ten packs, partial settlement,
Malvi escrow/refunds and add-on meter totals. TypeScript and the production build
also passed. These are isolated checks, not real customer payments on Render.

The new tests exercise the pricing model, administrator HTTP authorization and
read-only response, actual component rendering, and PostgreSQL migration/accounting
in PGlite (not a JavaScript imitation of the SQL).

The regression run also found two stale tests in
`tests/billing-checkout-ui.test.ts`: their injected old savings formatter no
longer reproduces a crash, and their synthetic `82.00` savings is not displayed.
Those stale UI assertions were not part of the 119-test targeted run. The server
meter now also includes funded add-ons, without restoring synthetic savings.
Do not report the full repository test suite as green.

The app production build and TypeScript checks passed. Preview served the existing
sign-in page after restart. The signed-in administrator screen was not verified in
a browser; HTTP and component-render tests cover it instead. No provider credits,
real payments, production database writes, commits or pushes were used for this stage.
