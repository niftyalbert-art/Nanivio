# Direct USDT subscription checkout (TRON mainnet)

This is **not live by default**. Paystack remains unchanged. Crypto checkout is
available only for paid Communication and Malvi subscriptions, monthly or annual;
balance top-ups and minute packs are not part of this payment rail.

## Before enabling

1. Confirm that your business can legally accept and account for crypto payments.
   Never enter a wallet seed phrase or private key in Nanivio or Replit.
2. Use a **spendable TRON mainnet address you control** that accepts TRC20 USDT.
   Check it in your own wallet; the application checks its checksum, not your
   ownership. Do not use a deposit address that may change or expire.
3. Apply `migrations/022_tron_usdt_subscriptions.sql` to the **same production
   Supabase database** used by Nanivio. It needs earlier paid-communication,
   paid-Malvi and communication-policy migrations. The new SQL is additive; it
   copies the currently installed paid-activation rules under a distinct TRON
   payment provider and never edits Paystack's original functions. Verify the
   whole SQL succeeds before accepting any payment.
4. The owner approved public access while the first real-money purchase is
   tested. Configure `TRON_USDT_RECEIVING_ADDRESS` (the **public** address),
   `TRON_USDT_ACCESS_MODE=public` and `TRON_USDT_ENABLED=true` on the actual host.
   This opens checkout to all authenticated eligible customers once wallet
   format and database preflight pass. It is not a private test environment.
   The global payment flag still defaults to disabled, and the server never
   grants benefits without verified payment. Public access does not prove a
   live payment has succeeded.
   An optional `TRON_USDT_ACCESS_MODE=test` restricts only new purchases to
   the immutable IDs in `TRON_USDT_TEST_USER_IDS`; an empty list in that mode
   denies everyone. Do not configure test mode for this public rollout.
   Unknown modes fail closed; an absent access-mode setting defaults to public.
   Existing invoices remain recoverable by their owner regardless of mode.
   For a high-volume
   installation, configure `TRONGRID_API_KEY` through the host's **secrets**
   interface. The key is optional for low-volume reads; a key never authorizes
   payment or custody. Do not add these values to source control. Replit
   development settings do not configure the separate Render deployment.
5. Check `/api/billing/crypto/config` as an authenticated customer; `eligible: true`
   (on releases with rollout metadata) confirms checkout access. `enabled: true`
   means the server sees the public receiving address and SQL preflight, **not**
   that the operator owns the wallet or that a live transfer has been tested.
   Run a carefully controlled small real-money end-to-end purchase only after
   verifying the address and obtaining authorization to spend.

## Payment behavior

- The published **USD** plan price is denominated as **USDT at merchant 1:1
  pricing** (not a guaranteed exchange rate). Each invoice receives a unique
  six-decimal amount by applying a visible matching discount under 0.01 USDT.
  No surcharge is added. All amounts for a given receiving wallet remain
  reserved permanently, even if invoices expire. If a wallet/price pair runs
  out of unique amounts, checkout stops; rotate the receiving address after
  reconciling outstanding invoices. Do not change the address while paid
  invoices remain unresolved.
- Send **only official USDT on TRON mainnet** to the invoice address, with the
  exact six-decimal amount. QR encodes only the receiving address, not an
  implied amount or payment request. The invoice expires after 20 minutes.
- A transaction hash is never proof of purchase. The server reads the
  **solidified** TRON receipt, verifies successful execution and the official
  USDT Transfer event (contract, destination and raw six-decimal amount), and
  atomically binds its transaction ID and event index to one invoice. The
  same verified payment cannot activate a second invoice. Benefits and invoice
  records commit with the external-payment activation in the database.
- The user can check again with their transaction ID after expiry. A transfer
  made after expiry goes to **REVIEW**; only an admin can approve it after
  another server-side blockchain check. Wrong-network, wrong-token,
  underpaid, overpaid or unsupported transfers are **not automatically
  fulfilled**. Handle those via an operator review/refund outside the app;
  the admin screen has no wallet-spending controls.
- An automatic recovery pass checks pending invoices for 24 hours. If hosted
  history is too busy to include an old transfer, the user or admin can supply
  the transaction ID for a direct solidified-receipt check. Provider outages
  leave benefits unchanged and permit later retry; do not pay a second time.
- This is a **prepaid term**, not a recurring mandate: users pay again for
  another month or year. Existing Paystack and wallet-funded payment rules
  remain separate. Apple/Google store payment-policy approval is not implied.

## Local checks

`npm run lint && npm run build`

`node --import tsx --test tests/tron-usdt-access.test.ts tests/tron-usdt-subscriptions.test.ts tests/paystack-flow.test.ts`

Tests use a synthetic blockchain receipt and an isolated PostgreSQL fixture.
They do not prove a real wallet deposit or a deployed Render purchase.
