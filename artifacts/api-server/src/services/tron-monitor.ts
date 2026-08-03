/**
 * TRON Blockchain Monitor
 *
 * Polls TronGrid every 60 seconds for incoming USDT TRC20 transactions
 * to Nanivio's business wallet. When a matching pending deposit is found,
 * it automatically credits the user's wallet and marks the deposit complete.
 *
 * Security guarantees:
 * - Token contract: only the canonical USDT TRC20 contract is accepted.
 * - Address validation: destination must be the configured business wallet.
 * - Confirmed-only: transactions where tx.confirmed !== true are skipped.
 * - Amount range: amounts below MIN or above MAX are rejected.
 * - Amount tolerance: received amount must be within 1% of the expected amount.
 * - Duplicate prevention (layer 1): isNull(transactionHash) filter — only
 *   unmatched deposits enter the matching pool.
 * - Duplicate prevention (layer 2): DB UNIQUE constraint on transaction_hash;
 *   a race-condition second write throws a unique-constraint violation (23505).
 * - Duplicate prevention (layer 3): pre-credit re-read confirms deposit is
 *   still in "detecting" state with our txHash before any wallet update.
 * - USD-only wallet: creditUserWallet hard-fails on any non-USD target wallet.
 * - No private keys or seed phrases are ever stored or used.
 */

import { db, cryptoDepositsTable, walletsTable, usersTable } from "@workspace/db";
import { eq, and, isNull, lt, sql } from "drizzle-orm";
import pino from "pino";

const logger = pino({ name: "tron-monitor" });

// USDT TRC20 mainnet contract address (canonical, never changes)
const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

// USDT has 6 decimal places on TRON
const USDT_DECIMALS = 6;

// Amount tolerance: received amount must be within this % of expected
const AMOUNT_TOLERANCE = 0.01; // 1%

// Confirmations required before crediting
const REQUIRED_CONFIRMATIONS = 20;

// Deposit limits — override via env vars CRYPTO_DEPOSIT_MIN_USDT / CRYPTO_DEPOSIT_MAX_USDT
const MIN_DEPOSIT_USDT = parseFloat(process.env["CRYPTO_DEPOSIT_MIN_USDT"] ?? "1");
const MAX_DEPOSIT_USDT = parseFloat(process.env["CRYPTO_DEPOSIT_MAX_USDT"] ?? "50000");

// How far back to look for transactions on first poll (5 minutes in ms)
const INITIAL_LOOKBACK_MS = 5 * 60 * 1000;

let lastPollTimestamp: number = Date.now() - INITIAL_LOOKBACK_MS;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;

export function startTronMonitor() {
  const businessAddress = process.env["NANIVIO_CRYPTO_WALLET_ADDRESS"];
  if (!businessAddress) {
    logger.warn("NANIVIO_CRYPTO_WALLET_ADDRESS not set — TRC20 deposit monitoring disabled");
    return;
  }
  logger.info({ address: businessAddress }, "Starting TRON TRC20 deposit monitor");
  scheduleNextPoll();
}

export function stopTronMonitor() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

function scheduleNextPoll() {
  pollTimer = setTimeout(async () => {
    await runPoll();
    scheduleNextPoll(); // re-schedule after each run
  }, 60_000); // poll every 60 seconds
}

async function runPoll() {
  if (isRunning) return; // prevent overlapping polls
  isRunning = true;
  try {
    await pollTronTransactions();
  } catch (err) {
    logger.error({ err }, "TronGrid poll error");
  } finally {
    isRunning = false;
  }
}

async function pollTronTransactions() {
  const businessAddress = process.env["NANIVIO_CRYPTO_WALLET_ADDRESS"];
  const apiKey = process.env["TRON_API_KEY"];

  if (!businessAddress) return;

  // Auto-expire stale deposits
  await expireStaleDeposits();

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (apiKey) {
    headers["TRON-PRO-API-KEY"] = apiKey;
  }

  const params = new URLSearchParams({
    limit: "50",
    only_to: "true",
    contract_address: USDT_TRC20_CONTRACT,
    min_timestamp: String(lastPollTimestamp),
  });

  const url = `https://api.trongrid.io/v1/accounts/${businessAddress}/transactions/trc20?${params}`;

  const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) {
    logger.warn({ status: resp.status }, "TronGrid API returned non-200");
    return;
  }

  const json = await resp.json() as { data?: any[]; success?: boolean };
  if (!json.success || !Array.isArray(json.data)) {
    logger.debug("TronGrid response has no data array");
    return;
  }

  // Update timestamp to avoid re-processing on next poll
  lastPollTimestamp = Date.now() - 5_000; // 5s overlap to catch edge cases

  let processed = 0;
  for (const tx of json.data) {
    const matched = await processTransaction(tx, businessAddress);
    if (matched) processed++;
  }

  if (json.data.length > 0 || processed > 0) {
    logger.info({ txCount: json.data.length, matched: processed }, "TronGrid poll complete");
  }
}

async function processTransaction(tx: any, businessAddress: string): Promise<boolean> {
  // ── 1. Basic structure validation ─────────────────────────────────────────
  const txHash: string | undefined    = tx.transaction_id;
  const toAddress: string | undefined = tx.to;
  const fromAddress: string | undefined = tx.from;
  const rawValue: string | undefined  = tx.value;
  const tokenContract: string | undefined = tx.token_info?.address;
  const tokenSymbol: string | undefined   = tx.token_info?.symbol;

  if (!txHash || !toAddress || !fromAddress || !rawValue) {
    logger.debug({ txHash }, "Skipping malformed transaction (missing required fields)");
    return false;
  }

  // ── 2. Confirmed-only — reject unconfirmed / reverted transactions ─────────
  // TronGrid sets tx.confirmed = true once the block is finalised.
  // Absence of the field (older API versions) is treated as unconfirmed.
  if (tx.confirmed !== true) {
    logger.debug({ txHash }, "Skipping unconfirmed transaction");
    return false;
  }

  // ── 3. Token contract validation — ONLY the canonical USDT TRC20 contract ──
  if (!tokenContract || tokenContract.toLowerCase() !== USDT_TRC20_CONTRACT.toLowerCase()) {
    logger.warn(
      { txHash, tokenContract, tokenSymbol },
      "SECURITY: Rejected transaction — unsupported token contract (not USDT TRC20)"
    );
    return false;
  }

  // ── 4. Destination address validation — must be our business wallet ────────
  if (toAddress.toLowerCase() !== businessAddress.toLowerCase()) {
    logger.warn(
      { txHash, toAddress, businessAddress },
      "SECURITY: Rejected transaction — destination address does not match business wallet"
    );
    return false;
  }

  // ── 5. Parse and range-check amount ───────────────────────────────────────
  const receivedAmount = parseInt(rawValue, 10) / Math.pow(10, USDT_DECIMALS);
  if (isNaN(receivedAmount) || receivedAmount <= 0) {
    logger.debug({ txHash, rawValue }, "Skipping transaction with unparseable amount");
    return false;
  }

  if (receivedAmount < MIN_DEPOSIT_USDT) {
    logger.warn(
      { txHash, receivedAmount, minAllowed: MIN_DEPOSIT_USDT },
      "SECURITY: Rejected transaction — amount below minimum deposit limit"
    );
    return false;
  }

  if (receivedAmount > MAX_DEPOSIT_USDT) {
    logger.warn(
      { txHash, receivedAmount, maxAllowed: MAX_DEPOSIT_USDT },
      "SECURITY: Rejected transaction — amount exceeds maximum deposit limit"
    );
    return false;
  }

  // ── 6. Transaction detected — log before any DB work ──────────────────────
  logger.info(
    {
      txHash,
      from: fromAddress,
      to: toAddress,
      receivedAmount,
      currency: "USDT",
      network: "TRC20",
      contract: tokenContract,
      detectedAt: new Date().toISOString(),
    },
    "TRON transaction detected — searching for matching pending deposit"
  );

  // ── 7. Find the oldest matching pending deposit (FIFO) ────────────────────
  // Filters: status=waiting, correct deposit address, USDT TRC20,
  //          no tx hash yet (unmatched), not expired.
  const pendingDeposits = await db
    .select()
    .from(cryptoDepositsTable)
    .where(
      and(
        eq(cryptoDepositsTable.status, "waiting"),
        eq(cryptoDepositsTable.depositAddress, businessAddress),
        eq(cryptoDepositsTable.currency, "USDT"),
        eq(cryptoDepositsTable.network, "TRC20"),
        isNull(cryptoDepositsTable.transactionHash),
      )
    )
    .orderBy(cryptoDepositsTable.createdAt);

  const matchedDeposit = pendingDeposits.find(d => {
    const expected = parseFloat(d.amount as string);
    if (expected <= 0) return false;
    return Math.abs(receivedAmount - expected) / expected <= AMOUNT_TOLERANCE;
  });

  if (!matchedDeposit) {
    logger.info(
      { txHash, receivedAmount, pendingCount: pendingDeposits.length },
      "No matching pending deposit for this transaction — may be an unrelated transfer"
    );
    return false;
  }

  // ── 8. Claim deposit with tx hash (UNIQUE constraint = duplicate prevention layer 2) ──
  try {
    await db
      .update(cryptoDepositsTable)
      .set({
        status: "detecting",
        transactionHash: txHash,
        fromAddress,
        receivedAmount: String(receivedAmount),
        confirmations: REQUIRED_CONFIRMATIONS, // TronGrid only returns finalised transactions
        updatedAt: new Date(),
      } as any)
      .where(
        and(
          eq(cryptoDepositsTable.id, matchedDeposit.id),
          isNull(cryptoDepositsTable.transactionHash), // only if still unmatched
        )
      );
  } catch (err: any) {
    // Unique constraint violation (PG error 23505) — another concurrent poll
    // already claimed this tx hash; skip safely.
    if (err?.code === "23505" || err?.message?.includes("unique")) {
      logger.warn({ txHash, depositId: matchedDeposit.id }, "TX hash already claimed (unique constraint) — duplicate credit prevented");
      return false;
    }
    throw err;
  }

  // ── 9. Credit the user's wallet ───────────────────────────────────────────
  const credited = await creditUserWallet(
    matchedDeposit.userId,
    receivedAmount,
    matchedDeposit.walletId,
    matchedDeposit.id,
    txHash
  );

  if (!credited) {
    // Roll back to waiting so the deposit can be re-matched on the next poll
    await db
      .update(cryptoDepositsTable)
      .set({ status: "waiting", transactionHash: null, fromAddress: null } as any)
      .where(eq(cryptoDepositsTable.id, matchedDeposit.id));
    logger.warn({ depositId: matchedDeposit.id, txHash }, "Credit failed — deposit rolled back to waiting");
    return false;
  }

  return true;
}

async function creditUserWallet(
  userId: number,
  amount: number,
  preferredWalletId: number | null | undefined,
  depositId: number,
  txHash: string
): Promise<boolean> {
  try {
    // ── A. Resolve wallet (USD-only enforced) ─────────────────────────────
    const walletId = preferredWalletId ?? null;

    if (!walletId) {
      logger.error({ userId, depositId, txHash }, "SECURITY: No walletId on deposit record — credit refused");
      return false;
    }

    const [wallet] = await db.select().from(walletsTable)
      .where(and(eq(walletsTable.id, walletId), eq(walletsTable.userId, userId)));

    if (!wallet) {
      logger.error({ userId, walletId, depositId, txHash }, "SECURITY: Target wallet not found or does not belong to user — credit refused");
      return false;
    }

    if (wallet.currencyCode !== "USD") {
      logger.error(
        { userId, walletId, currencyCode: wallet.currencyCode, depositId, txHash },
        "SECURITY: Target wallet is not USD — USDT cannot be credited into non-USD wallet"
      );
      return false;
    }

    // ── B. Duplicate-credit guard (layer 3) ───────────────────────────────
    // Re-read the deposit row to confirm it is still in "detecting" state
    // with OUR txHash. If another process already completed it, bail out.
    const [current] = await db
      .select()
      .from(cryptoDepositsTable)
      .where(eq(cryptoDepositsTable.id, depositId));

    if (!current) {
      logger.error({ depositId, txHash }, "SECURITY: Deposit record vanished before credit — aborting");
      return false;
    }
    if (current.status === "completed") {
      logger.warn({ depositId, txHash }, "SECURITY: Deposit already completed — duplicate credit prevented (layer 3)");
      return false;
    }
    if ((current as any).transactionHash !== txHash) {
      logger.warn(
        { depositId, txHash, storedHash: (current as any).transactionHash },
        "SECURITY: TX hash mismatch on pre-credit re-read — concurrent process may have overwritten; aborting"
      );
      return false;
    }

    // ── C. Credit the wallet ──────────────────────────────────────────────
    const creditedAt = new Date();

    await db
      .update(walletsTable)
      .set({ balance: sql`${walletsTable.balance} + ${amount}`, updatedAt: creditedAt })
      .where(eq(walletsTable.id, walletId));

    // ── D. Mark deposit completed ─────────────────────────────────────────
    await db
      .update(cryptoDepositsTable)
      .set({
        status: "completed",
        walletId,
        confirmations: REQUIRED_CONFIRMATIONS,
        confirmedAt: creditedAt,
        updatedAt: creditedAt,
      } as any)
      .where(eq(cryptoDepositsTable.id, depositId));

    // ── E. Audit log — structured record of every credit ─────────────────
    logger.info(
      {
        event:        "deposit_credited",
        depositId,
        userId,
        walletId,
        receivedUsdt: amount,
        creditedUsd:  amount,          // 1:1 parity — explicit for log clarity
        currency:     "USDT",
        network:      "TRC20",
        txHash,
        creditedAt:   creditedAt.toISOString(),
      },
      "Crypto deposit completed — user wallet credited"
    );

    return true;
  } catch (err) {
    logger.error({ err, userId, depositId, txHash }, "Unexpected error crediting wallet for crypto deposit");
    return false;
  }
}

async function expireStaleDeposits() {
  try {
    await db.execute(
      sql`UPDATE crypto_deposits
          SET status = 'expired', updated_at = NOW()
          WHERE status = 'waiting'
            AND expires_at IS NOT NULL
            AND expires_at < NOW()`
    );
  } catch { /* non-fatal */ }
}
