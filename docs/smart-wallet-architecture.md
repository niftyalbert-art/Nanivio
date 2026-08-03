# Smart Trust Wallet — Architecture Plan
**Status:** Design only. Nothing here is implemented. Existing systems are unchanged.
**Last updated:** 2026-08-03
**Author:** Architecture review session

---

## 1. Overview

This document describes the target architecture for Nanivio's future non-custodial smart wallet experience. The goal is to extend the platform so users can optionally connect or provision a self-custodial blockchain wallet while keeping the current internal balance ledger intact and fully functional.

Nothing in this plan modifies the existing USDT TRC20 deposit monitoring, treasury wallet, automatic crediting, or USD ledger system.

---

## 2. Current Architecture

```
User initiates deposit
        │
        ▼
  Nanivio generates
  treasury wallet QR
        │
        ▼
  User sends USDT TRC20
  to Nanivio treasury
        │
        ▼
  TronGrid monitor detects
  on-chain confirmation
        │
        ▼
  tron-monitor.ts credits
  user's internal USD wallet
  (wallets.balance += amount)
        │
        ▼
  Internal Nanivio ledger
  (PostgreSQL wallets table)
```

**Characteristics of the current system:**
- Fully custodial — Nanivio holds all user funds in one treasury wallet
- Users never hold private keys
- Internal balances are denominated in fiat (USD)
- USDT is converted 1:1 to USD on entry; no on-chain assets remain per-user
- Zero blockchain interaction for most user actions (transfers, payments, etc.)

---

## 3. Target Architecture — Layered Wallet System

The future system separates wallet concerns into four independent layers. Each layer can be adopted incrementally without breaking the layers below it.

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 4 — Smart Wallet Provider (future)                   │
│  ERC-4337 account abstraction, gas sponsorship, paymasters  │
│  Providers: Pimlico, ZeroDev, Biconomy, Alchemy AA          │
├─────────────────────────────────────────────────────────────┤
│  Layer 3 — External Wallet Connections (near-term)          │
│  WalletConnect v2, Trust Wallet deep-link, MetaMask         │
│  User holds private keys; Nanivio only reads addresses       │
├─────────────────────────────────────────────────────────────┤
│  Layer 2 — Blockchain Wallet Layer (near-term)              │
│  On-chain identity: wallet address, network, provider       │
│  Links a user account to one or more blockchain addresses   │
├─────────────────────────────────────────────────────────────┤
│  Layer 1 — Internal Nanivio Balance Ledger (current)        │
│  PostgreSQL wallets table, fiat-denominated balances        │
│  All existing transfers, deposits, withdrawals live here    │
└─────────────────────────────────────────────────────────────┘
```

Layers 1 and 2 share data through the `wallet_address` field on the existing `wallets` table (via a non-breaking migration). Layers 3 and 4 are additive — they do not alter the schema of Layers 1 or 2.

---

## 4. Future Database Design

### 4.1 Extending the `wallets` table

The current `wallets` table has no concept of wallet type or blockchain identity. The following columns should be added in a future non-destructive migration. All columns are nullable — existing rows are unaffected.

```sql
-- Future migration (DO NOT RUN YET)
ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS wallet_type       TEXT     DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS wallet_provider   TEXT,
  ADD COLUMN IF NOT EXISTS wallet_address    TEXT,
  ADD COLUMN IF NOT EXISTS provider_wallet_id TEXT,
  ADD COLUMN IF NOT EXISTS chain_id          INTEGER,
  ADD COLUMN IF NOT EXISTS is_smart_wallet   BOOLEAN  DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS smart_wallet_factory TEXT;
```

**Field definitions:**

| Column | Type | Allowed values | Description |
|--------|------|----------------|-------------|
| `wallet_type` | `text` | `internal` · `external` · `smart_wallet` | `internal` = current custodial ledger. `external` = user-owned EOA (MetaMask, Trust Wallet, etc.). `smart_wallet` = ERC-4337 contract wallet. |
| `wallet_provider` | `text` | `trust_wallet` · `walletconnect` · `metamask` · `smart_wallet_provider` · `null` | Which wallet app or SDK manages this wallet. Null for internal. |
| `wallet_address` | `text` | Any 0x… or TRON address | The user's on-chain public address. Never a private key. |
| `provider_wallet_id` | `text` | Provider-specific ID | Trust Wallet user ID, WalletConnect session topic, etc. Used for session management, not for signing. |
| `chain_id` | `integer` | EIP-155 chain ID | `1` = Ethereum mainnet, `137` = Polygon, `728126428` = TRON mainnet, etc. |
| `is_smart_wallet` | `boolean` | `true` / `false` | Marks ERC-4337 contract wallets (counterfactual or deployed). |
| `smart_wallet_factory` | `text` | Factory contract address | The factory used to deploy this smart wallet (for counterfactual address derivation). |

### 4.2 New table: `user_wallet_connections`

Rather than storing external wallet sessions in the `wallets` table (which is designed for balances), a separate connection table should track wallet session state:

```sql
-- Future table (DO NOT CREATE YET)
CREATE TABLE IF NOT EXISTS user_wallet_connections (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address    TEXT NOT NULL,
  wallet_type       TEXT NOT NULL DEFAULT 'external',   -- external | smart_wallet
  wallet_provider   TEXT NOT NULL,                      -- trust_wallet | walletconnect | metamask
  chain_id          INTEGER,
  provider_session  JSONB,      -- WalletConnect topic, pairing URI, etc. (non-sensitive)
  is_primary        BOOLEAN DEFAULT FALSE,
  verified_at       TIMESTAMPTZ,  -- when the user proved ownership via signature
  last_seen_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, wallet_address, chain_id)
);
```

**Key design decisions:**
- `provider_session` is JSONB and stores non-sensitive session metadata only (WalletConnect topic ID, pairing expiry, etc.) — never a private key or mnemonic
- `verified_at` is populated only after the user signs a challenge message (EIP-191 `personal_sign`), proving they own the address
- One user can have multiple external wallet connections (multi-chain, multi-device)
- `is_primary` flags which wallet is used for gas sponsorship and default on-chain interactions

### 4.3 New table: `smart_wallet_ops` (Layer 4)

ERC-4337 user operations need their own audit trail:

```sql
-- Future table (DO NOT CREATE YET)
CREATE TABLE IF NOT EXISTS smart_wallet_ops (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id),
  wallet_address      TEXT NOT NULL,              -- the smart wallet address (may be counterfactual)
  user_op_hash        TEXT UNIQUE,                -- ERC-4337 UserOperation hash
  bundler_tx_hash     TEXT,                       -- actual on-chain tx from the bundler
  paymaster_address   TEXT,                       -- gas sponsor contract, if used
  gas_sponsored       BOOLEAN DEFAULT FALSE,
  status              TEXT NOT NULL DEFAULT 'pending',  -- pending | submitted | confirmed | failed
  op_type             TEXT,                       -- transfer | deposit | withdrawal | swap
  chain_id            INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at        TIMESTAMPTZ
);
```

---

## 5. Wallet Type Reference

### 5.1 Internal wallet (`wallet_type = 'internal'`)
**What it is:** The current system. A row in `wallets` with a fiat balance in PostgreSQL. No blockchain address. No private key.

**How it works today:** Users top up via USDT TRC20 deposit → auto-detected → USD credited. All Nanivio-to-Nanivio transfers happen as ledger entries; no blockchain is involved.

**Stays unchanged in this plan.**

---

### 5.2 External wallet (`wallet_type = 'external'`)
**What it is:** A user-owned Externally Owned Account (EOA). The user holds the private key in their own wallet app (Trust Wallet, MetaMask, etc.). Nanivio never sees the private key.

**How Nanivio uses it:**
1. User connects their wallet via WalletConnect v2 or Trust Wallet deep-link
2. Nanivio requests a signature on a challenge string to verify ownership (EIP-191)
3. Nanivio stores only the verified `wallet_address` and session metadata
4. On-chain operations (future) are signed by the user's wallet app, not by Nanivio

**Relevant providers:**
- **Trust Wallet**: deep-link scheme `trust://` for mobile; WalletConnect v2 for cross-platform
- **WalletConnect v2**: open protocol; supports 400+ wallets; session established via QR or deep-link; relay via `relay.walletconnect.com`
- **MetaMask**: browser extension or MetaMask SDK for mobile

**Required SDK (not yet installed):**
```
@walletconnect/modal           — connection UI
@walletconnect/sign-client     — session management
@walletconnect/ethers-provider — signing adapter
```
A WalletConnect Project ID (from cloud.walletconnect.com) is required as a Replit Secret before implementation.

---

### 5.3 Smart wallet (`wallet_type = 'smart_wallet'`)
**What it is:** An ERC-4337 contract wallet. A smart contract deployed on-chain that acts as the user's wallet. The user may not even need to hold ETH/TRX for gas — a Paymaster can sponsor fees.

**Key concepts:**

| Term | Definition |
|------|-----------|
| **Account Abstraction (AA)** | ERC-4337 standard that replaces EOA signatures with smart contract logic. Enables social recovery, batched transactions, gas sponsorship. |
| **UserOperation** | An ERC-4337 pseudo-transaction object signed by the user's key (or a session key) and submitted to a Bundler rather than directly to the chain. |
| **Bundler** | A node that collects UserOperations, validates them, and submits a real on-chain transaction. |
| **Paymaster** | A smart contract that pays gas fees on behalf of the user. Enables "gasless" transactions from the user's perspective. Nanivio could run its own Paymaster or use a provider. |
| **Counterfactual address** | The smart wallet address is deterministically computable before deployment. Users can receive funds to an address that doesn't exist on-chain yet. |
| **Session keys** | Short-lived signing keys that can authorize limited operations (e.g. spending up to $50 in one session) without needing the full owner key. |

**Relevant providers (not yet chosen):**
- **Pimlico** — Bundler + Paymaster SaaS, ERC-4337 compliant, multi-chain
- **ZeroDev** — Kernel smart wallet SDK; supports passkey signing (no seed phrase for users)
- **Biconomy** — Gasless transactions SDK; Paymaster API
- **Alchemy Account Kit** — Full-stack AA: smart wallets + Bundler + Paymaster
- **Safe (Gnosis Safe)** — Battle-tested multi-sig smart wallet contracts; widely audited

---

## 6. Gas Sponsorship / Paymaster Design

When Nanivio sponsors gas for users, the flow becomes:

```
User approves action in Nanivio app
        │
        ▼
  Nanivio backend builds a UserOperation
  (transfer, deposit, etc.)
        │
        ▼
  Paymaster contract signs the gas voucher
  (Nanivio controls or rents the Paymaster)
        │
        ▼
  UserOperation submitted to Bundler
  (Pimlico / Alchemy / self-hosted)
        │
        ▼
  Bundler submits real on-chain tx
  (pays gas from Paymaster's ETH/MATIC deposit)
        │
        ▼
  Transaction confirmed on blockchain
        │
        ▼
  Nanivio webhook / monitor detects confirmation
        │
        ▼
  Internal balance updated in PostgreSQL
```

**Gas sponsorship accounting:** Nanivio must pre-fund the Paymaster contract. Sponsored gas costs should be tracked internally and optionally passed on to users via a service fee or spread.

---

## 7. Migration Path

### Phase 0 — Current state (live today)
```
USDT TRC20 deposit
      │
      ▼
Nanivio treasury wallet (single address: NANIVIO_CRYPTO_WALLET_ADDRESS)
      │
      ▼  (tron-monitor.ts detects confirmation)
      ▼
wallets.balance += receivedAmount  (USD, 1:1)
```
No blockchain interaction for any action other than USDT inbound detection.

---

### Phase 1 — External wallet connections (non-custodial identity)
**Scope:** Users can connect and verify an external wallet address. No on-chain transactions yet.

```
User connects Trust Wallet / MetaMask via WalletConnect
      │
      ▼
User signs EIP-191 challenge (proves ownership)
      │
      ▼
user_wallet_connections row created (wallet_address, provider, verified_at)
      │
      ▼
Nanivio UI shows linked wallet address alongside internal balance
```
**No change to deposit flow.** Deposits still go to Nanivio treasury. The external wallet is for identity and future use only.

**What needs to be built:**
- `user_wallet_connections` table migration
- WalletConnect v2 integration (Project ID secret required)
- Trust Wallet deep-link integration
- Ownership verification endpoint (`POST /wallet/connect/verify`)
- User settings page: "Linked Wallets"

---

### Phase 2 — Per-user deposit addresses (semi-custodial)
**Scope:** Instead of all users sharing one treasury address, each user gets their own deposit address. Nanivio still holds the keys.

```
User requests deposit
      │
      ▼
Nanivio derives a unique deposit address for this user
(HD wallet derivation: m/44'/195'/<userId>'/0/0)
      │
      ▼
User sends USDT TRC20 to their unique address
      │
      ▼
Monitor detects tx, matches by address (not by amount)
      │
      ▼
Nanivio sweeps funds to treasury wallet (optional)
      │
      ▼
wallets.balance credited
```

**Advantages over current system:**
- No amount-matching ambiguity (multiple deposits of the same amount work)
- Better audit trail per user
- Foundation for Phase 3

**What needs to be built:**
- HD wallet key management (mnemonic stored as encrypted Replit Secret or HSM)
- Address derivation service
- Per-user `depositAddress` stored in `user_wallet_connections`
- Monitor updated to match by address instead of amount

---

### Phase 3 — Smart wallet + gas sponsorship (non-custodial)
**Scope:** Users own their wallet. Nanivio sponsors gas. On-chain transactions are possible.

```
User action (e.g. USDT transfer to another user)
      │
      ▼
Nanivio builds ERC-4337 UserOperation
      │
      ▼
Paymaster signs gas voucher (Nanivio pays gas)
      │
      ▼
Bundler submits on-chain
      │
      ▼
Confirmation detected by Nanivio monitor
      │
      ▼
Both internal ledger AND on-chain state updated
```

**What needs to be built:**
- Smart wallet factory deployment (or integration with Pimlico/ZeroDev/Biconomy)
- Paymaster contract (or Paymaster API subscription)
- Bundler node (or Bundler API subscription)
- `smart_wallet_ops` table migration
- Session key management for "tap to approve, no wallet popup" UX
- Internal accounting for gas costs

---

## 8. Security Considerations for Future Phases

### Phase 1 (External wallets)
- **Signature replay:** Challenge strings must include a nonce and expiry; replay of old signatures must be rejected
- **Address spoofing:** `ecrecover` or equivalent must be used server-side to verify the signature — never trust a client-supplied address claim
- **Session storage:** WalletConnect sessions contain relay credentials — store only the topic ID, not the full keypair, in the database

### Phase 2 (Per-user addresses)
- **Key management:** HD wallet mnemonic must be stored in an HSM or secrets vault (not a Replit Secret for production scale); access logged
- **Sweep security:** Private keys used for sweeping must never touch application memory in plaintext; use a dedicated signing service
- **Address reuse:** Deposit addresses should be rotated after each use for privacy

### Phase 3 (Smart wallets)
- **Paymaster risk:** A compromised Paymaster API key lets an attacker drain the gas deposit; rotate keys, set per-operation limits
- **UserOperation validation:** The EntryPoint contract validates all UserOps; Nanivio's backend should pre-validate before submission to avoid Bundler ban
- **Session key scope:** Session keys must be tightly scoped (amount limit, time limit, allowed contracts) — unbounded session keys are equivalent to full private key exposure
- **Smart contract audits:** Any custom Paymaster or wallet factory contract must be audited before mainnet deployment

---

## 9. What Stays Unchanged

The following systems are explicitly out of scope for this plan and must not be modified when implementing any phase of this architecture:

| System | File(s) | Why unchanged |
|--------|---------|---------------|
| USDT TRC20 monitoring | `tron-monitor.ts` | Core deposit detection; stable and audited |
| Treasury wallet | `NANIVIO_CRYPTO_WALLET_ADDRESS` secret | Single-address deposit model in current use |
| Automatic crediting | `creditUserWallet()` in `tron-monitor.ts` | Deposit flow must remain reliable |
| USD internal ledger | `wallets` table, `balance` column | All existing transfers depend on this |
| Deposit limits | `MIN/MAX_DEPOSIT_USDT` constants | Security controls must remain active |
| USD-only enforcement | Route + monitor checks | Data integrity guarantee |
| Admin read-only deposit view | `CryptoDepositsView` in `admin.tsx` | Operational visibility |

---

## 10. Open Questions Before Implementation

1. **Which smart wallet provider?** Pimlico, ZeroDev, Biconomy, and Safe each have different trade-offs (cost, audit status, chain support, SDK maturity). A formal evaluation is needed before Phase 3.

2. **Which chain for smart wallets?** TRON does not support ERC-4337. A second chain (Polygon, Base, or Ethereum mainnet) would be required for smart wallet functionality. This needs a product decision: does Nanivio add a second chain, or wait for TRON's own AA support?

3. **Gas sponsorship model:** Does Nanivio absorb gas costs as a product feature, or pass them to users as a small fee? This affects Paymaster funding strategy.

4. **KYC implications:** Linking a self-custodial wallet address to a verified Nanivio user creates a durable on-chain identity link. Legal/compliance team should review before Phase 1 go-live.

5. **WalletConnect Project ID:** Must be provisioned from cloud.walletconnect.com and stored as a Replit Secret before Phase 1 development begins.

6. **Key management for Phase 2:** An HSM (AWS CloudHSM, Azure Dedicated HSM, or Fireblocks) should be evaluated; a plain Replit Secret is not sufficient for production private key storage.
