# Malvi plans: actual admin editing

Open **Admin Control Center → Malvi Billing → Plans**. The separate **Cost calculator**
tab estimates costs; it does not set selling prices. Plans is the default section.

## Required database setup before deployment

Run `migrations/012_malvi_plan_catalog.sql` in the SQL editor of the **existing
Supabase project used by the Render application**. This creates one RLS-protected,
server-only catalogue table. It does not migrate the database, replace billing,
or update customer subscriptions, wallets, transactions or purchased allowances.
No new API secret is needed.

**Apply the migration before deploying this release.** Without it, the administrator
can inspect/edit unsaved templates but cannot save. New Malvi plan reads and purchases
fail explicitly rather than using unverified/fake prices. Already-initialized Paystack
purchases still fulfil from their saved purchase snapshots, not today's catalogue.

After setup, the first saved catalogue keeps the existing four plan identities and
USD prices unless an administrator explicitly changes them. A separate Voice record
starts as a draft with no invented selling price or allowance.

## Admin workflow

1. Review the calculator and the real provider account limits.
2. Edit a plan's name, descriptions, monthly/annual USD prices, per-purchased-term
   voice/video allowances, included/excluded feature descriptions and plan flags.
3. Choose Draft, Published or Archived. Free remains published and zero-priced.
4. Enter a reason; review published price/allowance changes; save.
5. Customers fetch the published catalogue on billing refresh. New checkout requests
   quote those published terms. Draft/archived records cannot be purchased.

Only finance/super administrators can save. Other billing administrators have read
access. The server owns identity, audit time and revision. Changes are persisted
atomically with up to 20 prior snapshots. A conflicting revision returns 409; edits
are not silently overwritten. A database outage or corrupt document fails closed.
Stable plan IDs are never deleted or reused; archive removes a plan from future sales.

## Currency and purchase protection

USD is the canonical price and default Malvi display currency. GHS display is a fresh,
attributed reference conversion from the same public FX loader as the calculator.
If FX fails or expires, USD prices remain readable; no GHS rate or free price is invented.

This merchant's Malvi Paystack checkout collects **GHS**, even when the customer
browsed USD prices. The checkout explicitly displays the USD base price, GHS payable
amount, rate/source/time and current allowances before proceeding. Bank/card
conversion fees may differ. Existing communication/fintech checkout currencies are
not changed. The server validates catalogue version and amount before initialization,
then persists the quoted product, currency, price, voice/video allowances and FX
information in the order. Later edits/archiving do not reprice a purchased order.

Wallet purchases likewise require the currently viewed revision and expected amount;
stale cards or changed FX cannot debit an unexpected amount. Wallet-funded purchases
continue to use their separate wallet command. Existing subscriptions and consumption
are not rewritten by catalogue saves. New automatic free trials read current Free
allowances; existing trial balances are not reset by an admin edit.

## Important delivery boundary

Feature descriptions/flags are catalogue metadata, **not implementations of new AI
capabilities or proof that every live provider request is quota-enforced**. Existing
voice/avatar/upload/research budget-enforcement work remains necessary. Do not advertise
unverified guarantees, unlimited usage, or capabilities based solely on edited copy.

In particular, Voice remains an **editable, unpublished draft**: the current live
delivery path provisions an avatar, so a voice-only product cannot honestly be sold
until separate voice-only session delivery and its usage enforcement are completed.
The API enforces this publication block, not only the browser.

## Verification

```
npm run lint
npm run build
node --import tsx --test tests/malvi-plan-catalog.test.ts tests/paystack-orders.test.ts tests/paystack-flow.test.ts tests/billing-access.test.ts
node --import tsx tests/malvi-plan-catalog-browser.mjs
```

Tests use isolated PostgreSQL/PGlite storage and test-only principals/payment stubs.
They do not bypass production login, use real provider credits, or charge customer cards.
