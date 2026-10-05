# Nanivio Production Fake-Implementation Audit

Date: 2026-10-04

## Removed / blocked

### Payments / Paystack
- Removed the `/api/paystack/demo-checkout` style success path.
- Paystack initialization now requires `PAYSTACK_SECRET_KEY` and an authenticated Nanivio user.
- Paystack verification no longer accepts a fake reference, caller-supplied amount, or sandbox fallback as proof of payment.
- Paystack webhook validation now requires `x-paystack-signature` and validates the raw request body with HMAC-SHA512.
- Webhook fulfillment checks the Nanivio user identity attached to the Paystack metadata/order.
- Direct wallet crediting through `/api/billing/topup` is disabled; a request cannot create money merely by POSTing an amount.
- Admin feature/pricing mutation endpoints now require admin authentication.

Paystack's official documentation says live payment state should be verified server-side and webhook signatures should be validated. The webhook is expected to acknowledge with HTTP 200 after receipt. The project now follows that model.

### Promotional credits
- Removed the arbitrary promo-code logic that granted hardcoded GHS credit to any matching string.
- Promo redemption now fails closed until a persistent production voucher ledger is connected.

### Wallet / financial identity
- Critical billing summary, wallet-transfer, P2P-transfer, Langpretation usage, and Malvi usage endpoints now require an authenticated user.
- They no longer accept `user_me` as an implicit financial identity for those operations.
- Client billing requests now send the actual Nanivio auth token instead of relying on `user_me`.

### Malvi AI
- Removed deterministic fallback responses from the production `/api/malvi/chat` path.
- Malvi now requires a real configured AI provider (`GEMINI_API_KEY`) and returns a provider error instead of pretending an AI response was generated.
- Malvi Business collaboration similarly fails closed when the AI provider is unavailable.
- Fake Malvi transfer execution has been removed. Malvi can propose a transfer but cannot claim that money was sent without a real settlement rail.
- Malvi admin audit/action endpoints now use server-side authentication rather than trusting `isAdmin` supplied by the browser.
- Static fake wallet figures and fake settlement figures are no longer used by the production Malvi AI route.

### OTP
- Removed the server-generated demo OTP and `demoCode` response.
- Production phone verification now requires Twilio Verify credentials.
- No OTP is logged or exposed as a fake development shortcut.

### GetStream
- Removed fake Stream API key/secret defaults.
- Stream token generation now fails if production credentials are absent.

### Agora
- Agora configuration no longer reports a fake sandbox app ID.
- Agora token generation already fails closed when the real App ID/certificate are absent.

### Telecom / PSTN
- Removed successful simulator behavior from outbound PSTN calling.
- If Twilio/Infobip is not configured, the server refuses to claim that a call was initiated.
- The canned inbound voice bridge response was disabled until a real carrier workflow is configured.

### FX
- Removed hardcoded FX rates from the `/api/fintech/rates` production endpoint. A real market-data provider must be connected before rates are reported.

### Ride / rental services
- Disabled the fake driver list, fake trip assignment/fare, and fake car-rental confirmation endpoints. They now fail closed until a real dispatch/fleet backend is connected.

### Translation fallback
- Disabled the NLLB provider implementation that returned the original source text while claiming a successful translation.
- The router must not claim NLLB universal coverage without a real NLLB service.

## Important remaining production blocker

`src/server/billingDb.ts` is still an in-memory billing store. This means it is not a production financial ledger because balances, subscriptions, invoices, usage records and audit records are lost on process restart and are not transactionally shared across Render instances.

This was intentionally NOT disguised as fixed. The correct next implementation is a PostgreSQL/Supabase-backed billing repository with:

- users/account ownership
- wallet balances
- immutable double-entry ledger
- Paystack payment records and idempotency keys
- subscriptions and subscription periods
- usage meters
- invoices
- promotional voucher redemptions
- refunds/disputes
- audit records
- database transactions / row locking for balance changes
- webhook idempotency

Until that repository is connected, Nanivio must not present the in-memory billing state as a production financial balance.

## Validation

The TypeScript parser/checker reaches the project code without new syntax errors. Full type checking/build cannot complete in this environment because `node_modules` are absent and `npm ci` timed out. The remaining reported type errors are pre-existing environment/type-definition issues such as missing installed packages and Vite `ImportMeta.env` typing.
