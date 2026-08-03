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

## Auto-Deposit Module (USDT TRC20)

- Table: `crypto_deposits` (schema in `lib/db/src/schema/crypto_deposits.ts`)
- Backend routes: `artifacts/api-server/src/routes/crypto-deposits.ts` — user CRUD + `/admin/crypto/deposits` (read-only, no approve/reject)
- Blockchain monitor: `artifacts/api-server/src/services/tron-monitor.ts` — polls TronGrid every 60s; requires `NANIVIO_CRYPTO_WALLET_ADDRESS` secret to start; `TRON_API_KEY` optional for rate limits
- Frontend: `artifacts/nifty-pay/src/pages/crypto-deposit.tsx`; entry point is the highlighted orange card at top of deposit.tsx Step 1

**Monitor startup:** If `NANIVIO_CRYPTO_WALLET_ADDRESS` is not set, the monitor logs a warning and skips silently (safe). With it set, startup log shows `"Starting TRON TRC20 deposit monitor"` with the address.

**Admin panel:** `CryptoPanel` in `admin.tsx` has two internal sub-tabs — "⚡ Auto-Deposits" (CryptoDepositsView, read-only) and "📤 Outgoing Payments" (CryptoPaymentsView, with Complete/Fail actions). Deposits tab is the default.

**Amount matching:** FIFO (oldest pending first), 1% tolerance. Credits the wallet the user selected at deposit creation.

**USD-only enforcement (three-layer):** (1) Frontend filters wallet picker to `currencyCode === 'USD'` only. (2) Backend rejects `POST /crypto/deposits` if selected wallet is not USD. (3) Monitor hard-fails `creditUserWallet` if wallet currency is not USD — no silent fallback to any non-USD wallet. USDT is always credited 1:1 as USD.

**Duplicate prevention:** `transaction_hash` has a UNIQUE partial index on `crypto_deposits` — guaranteed at DB level.

## Auto-Completion from Chain (no admin needed)

The TRON monitor (`tron-monitor.ts`) matches incoming USDT TRC20 txs against BOTH tables: `crypto_deposits` first (FIFO), then `crypto_payments` (statuses waiting_for_payment/confirming, unexpired, tx hash null). On match it credits the sender's USD wallet 1:1 and marks the payment completed — admin Complete is a fallback, not the primary path.

**Money-handling concurrency rules (apply to any future credit path):**
- Claim via conditional UPDATE with `.returning()` and check affected-row count — never read-then-write.
- Status transition + wallet credit must share one DB transaction; credit only if the guarded transition affected exactly 1 row.
- Unique partial index on `transaction_hash` (both tables) is the backstop; catch 23505 and bail.
- Attribution: prefer exact senderWalletAddress==on-chain from match; amount-tolerance FIFO only among candidates with no declared sender address.

**Why:** code review found the naive read-then-credit pattern allowed double-credits between concurrent polls and admin actions.

## TronGrid API gotcha (root cause of all "matched:0" mysteries)

TronGrid's `/v1/accounts/{addr}/transactions/trc20` endpoint returns ONLY finalised transfers and includes NO `confirmed` field on tx objects. A guard like `if (tx.confirmed !== true) skip` silently rejects EVERY transaction. Only skip on explicit `tx.confirmed === false`.
**How to apply:** if the monitor logs `txCount>0, matched:0` with no "transaction detected" or rejection logs in between, suspect a silent early filter, not the matching logic. Boot lookback is 60 min (safe: matching is idempotent via tx-hash unique index).
