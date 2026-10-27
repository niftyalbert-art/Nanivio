# Malvi admin billing calculator

Open **Admin Control Center → Malvi Billing**.

This is a planning tool, not a checkout, plan publisher, provider switch or
account-allowance enforcement system. Existing subscriptions, purchased
benefits, wallet balances and live Malvi configuration are unchanged.

## Access and shared settings

- Authenticated, active billing administrators can view estimates.
- Finance and super administrators can save rates and assumptions.
- Other authorized billing roles may explore local what-ifs without saving.
- Ordinary users cannot read or write the calculator API.
- A save needs a change reason of 8–500 characters.
- Every save records the verified actor, server timestamp and revision.
  The 20 preceding complete snapshots are retained.
- Simultaneous edits use an atomic Redis version check. A conflict leaves
  the browser's draft intact instead of silently replacing another edit.

Settings use the existing server-side `REDIS_URL`, without an application TTL.
Choose a persistent, appropriately backed-up Redis service: application
restarts do not remove settings, but persistence across a Redis service
failure depends on the provider plan and configuration. No new API key or
database migration is required.

If Redis is unavailable, public-default estimates are explicitly unsaved
and saving is disabled. Invalid stored data fails closed instead of being
silently replaced with defaults. Resetting defaults creates only a local
draft; it does not save or erase history.

## Model assumptions

All monetary rates and suggested base prices are in **USD**.

Usage inputs are monthly totals **per modeled customer**, except the paying
customer count itself. Infrastructure, avatar subscription and avatar
included minutes are shared monthly fleet quantities. A modeled cohort bears
the entered shared costs; adjust allocated overhead carefully when comparing
multiple cohorts instead of counting the full same bill in each.

- Gemini native audio and ElevenLabs output are mutually exclusive.
- The OpenAI what-if replaces Gemini live reasoning cost and requires an
  ElevenLabs voice under the app's currently supported routing.
- Live text/history and vision tokens are separate Gemini costs.
- Files and research-model tokens are separate Flash costs.
- Search counts are billable provider queries, not user questions. No shared
  free search allowance is assumed for each customer.
- Avatar costs use the monthly fleet subscription **plus overage**. Do not
  add the allocated subscription credit cost a second time. The avatar
  subscription is excluded when the entire modeled cohort has zero avatar use.
- Input and output audio minutes are separate cumulative billing units, not a
  fixed combined conversation-minute price.
- Session time includes connected/idle time, not only generated speech.
- Map links, public reference endpoints and device GPS have no separate paid
  API rate in the current paths; bandwidth and support can be entered in
  infrastructure/other overhead.

Suggested price:

```
fleet base cost = variable per-customer cost × customers
                + avatar fleet subscription and overage
                + shared infrastructure
buffered cost per customer = fleet base cost × (1 + contingency %) / customers
suggested USD price = (buffered cost per customer + fixed processing fee)
                    / (1 - processing % - target gross margin %)
```

The suggested price rounds **up** to the next cent. The test price is a
separate hypothetical selling price used to display profit and margin. It
does not change any published plan. Taxes, negotiated contracts, discounts,
chargebacks and any costs not entered in the model are not automatically
known. These are estimates, not a promise of net profit or sufficient capacity.

Public defaults were reviewed on 2026-10-24. Defaults account for Flash's
published 2027 price change when first generated after that date, but saved
administrator-reviewed rates are not automatically rewritten. Review them
against provider pricing and actual project limits regularly.

## Automatic GHS estimates

The calculator fetches the fixed public ExchangeRate-API USD endpoint.
Requests coalesce and valid results cache for an hour in each process.
Validated quotes include provider time, expiry, source and attribution.
Failure or expiry removes the GHS estimate; it never invents a replacement.

This daily reference conversion is **not a payment quote** or a guarantee of
the cardholder bank's rate. It does not change the merchant's supported
currencies. A Ghana-based Paystack merchant is documented to collect GHS;
USD catalogue pricing must be converted into an explicitly disclosed,
server-verified supported-currency amount before a future checkout.

## Verification

```
npm run lint
npm run build
node --import tsx --test tests/malvi-cost-calculator.test.ts tests/billing-access.test.ts
node --import tsx tests/malvi-cost-calculator-browser.mjs
```

The calculator tests start an isolated local Redis using a temporary Unix
socket and AOF storage, exercising concurrency and a real Redis restart.
They require `redis-server` on PATH. Browser checks use the real component,
client and HTTP router with isolated test authentication and storage, not a
production sign-in bypass. They generate ignored screenshots under
`generated-artifacts/` and make no paid inference or avatar calls.
