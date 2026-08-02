---
name: Crypto Payment Module
description: Architecture decisions and patterns for the crypto payment system added to Nanivio.
---

## Architecture

- Fully independent module — never touches bank/mobile_money/card flows.
- Table: `crypto_payments` (see `lib/db/src/schema/crypto_payments.ts`)
- Backend routes: `artifacts/api-server/src/routes/crypto.ts`
- Frontend pages: `artifacts/nifty-pay/src/pages/crypto.tsx` + `crypto-payment.tsx`
- Admin panel: `CryptoPanel` component in `admin.tsx`, tab value `"crypto"`

## Status Lifecycle

`waiting_for_payment` → `confirming` → `completed` | `failed` | `expired`

- Payments expire 30 minutes after creation (via `expires_at` column).
- Expiry is enforced lazily on read (no cron needed).
- "I Have Paid" button moves to `confirming`; admin manually moves to `completed` or `failed`.

## Network Config

Networks are defined in a `CRYPTO_NETWORKS` constant in `crypto.ts` (backend) and `SUPPORTED_NETWORKS` in `crypto.tsx` (frontend). Adding a new network requires updating both constants — no DB changes needed.

Only TRC20 (USDT) is live; others are shown as "Coming Soon" in the UI.

## Wallet Address Source

Nanivio's receiving wallet address is fetched at payment-creation time from `payment_methods` table (type=`crypto`, isActive=true). The match logic looks for `network` or `currency` in the method's `name` or `instructions` fields. Admin must create a crypto payment method with the wallet address in `accountNumber` for payments to work.

## QR Code

Uses the free public API `https://api.qrserver.com/v1/create-qr-code/` — no npm package needed.

## WalletConnect

"Connect Wallet" option records the user's wallet address and wallet type (Trust, MetaMask, etc.) as metadata. There is NO real WalletConnect SDK integration — it is a UX affordance only. Full deep-link connection would require a WalletConnect Project ID secret added as a Replit secret.

## Send Page Integration

Crypto is added as a third card on the `step === 'type'` screen in `send.tsx`. It navigates to `/crypto` rather than continuing the bank/mobile flow — the two systems are completely separate.

**Why:** Crypto payments don't share any of the bank/mobile UX (no exchange rate lookup, no recipient account name, etc.), so keeping them separate avoids entangling unrelated logic.
