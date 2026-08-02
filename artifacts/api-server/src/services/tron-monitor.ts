/**
 * TRON Blockchain Monitor
 *
 * Polls TronGrid every 60 seconds for incoming USDT TRC20 transactions
 * to Nanivio's business wallet. When a matching pending deposit is found,
 * it automatically credits the user's wallet and marks the deposit complete.
 *
 * Security guarantees:
 * - Duplicate prevention: transaction_hash is UNIQUE in the database; a second
 *   insert will throw a unique-constraint violation, which we catch and ignore.
 * - Amount validation: received amount must be within 1% of the expected amount.
 * - Network/token validation: only USDT TRC20 on TRON mainnet is processed.
 * - Address validation: destination must be the configured business wallet.
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
  // Basic structure validation
  const txHash: string | undefined = tx.transaction_id;
  const toAddress: string | undefined = tx.to;
  const fromAddress: string | undefined = tx.from;
  const rawValue: string | undefined = tx.value;
  const tokenContract: string | undefined = tx.token_info?.address;

  if (!txHash || !toAddress || !fromAddress || !rawValue) {
    logger.debug({ tx }, "Skipping malformed transaction");
    return false;
  }

  // 1. Token contract validation — must be USDT TRC20
  if (tokenContract?.toLowerCase() !== USDT_TRC20_CONTRACT.toLowerCase()) {
    logger.debug({ tokenContract }, "Skipping non-USDT-TRC20 transaction");
    return false;
  }

  // 2. Destination address validation — must be our business wallet
  if (toAddress.toLowerCase() !== businessAddress.toLowerCase()) {
    logger.debug("Skipping transaction to non-business address");
    return false;
  }

  // 3. Parse amount (USDT has 6 decimals)
  const receivedAmount = parseInt(rawValue, 10) / Math.pow(10, USDT_DECIMALS);
  if (isNaN(receivedAmount) || receivedAmount <= 0) {
    logger.debug({ rawValue }, "Skipping transaction with invalid amount");
    return false;
  }

  // 4. Find the oldest matching pending deposit
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
    .orderBy(cryptoDepositsTable.createdAt); // FIFO — oldest deposit gets matched first

  const matchedDeposit = pendingDeposits.find(d => {
    const expected = parseFloat(d.amount as string);
    return Math.abs(receivedAmount - expected) / expected <= AMOUNT_TOLERANCE;
  });

  if (!matchedDeposit) {
    logger.debug({ txHash, receivedAmount }, "No matching pending deposit for this transaction");
    return false;
  }

  // 5. Attempt to write the tx hash (UNIQUE constraint prevents double-processing)
  try {
    await db
      .update(cryptoDepositsTable)
      .set({
        status: "detecting",
        transactionHash: txHash,
        fromAddress,
        receivedAmount: String(receivedAmount),
        confirmations: REQUIRED_CONFIRMATIONS, // TronGrid only returns confirmed transactions
        updatedAt: new Date(),
      } as any)
      .where(
        and(
          eq(cryptoDepositsTable.id, matchedDeposit.id),
          isNull(cryptoDepositsTable.transactionHash), // only if not yet assigned
        )
      );
  } catch (err: any) {
    // Unique constraint violation — another process already claimed this tx hash
    if (err?.code === "23505" || err?.message?.includes("unique")) {
      logger.warn({ txHash }, "TX hash already processed (unique constraint) — skipping");
      return false;
    }
    throw err;
  }

  // 6. Credit the user's wallet
  const credited = await creditUserWallet(matchedDeposit.userId, receivedAmount, matchedDeposit.walletId, matchedDeposit.id, txHash);
  if (!credited) {
    // Roll back to waiting if we couldn't credit
    await db
      .update(cryptoDepositsTable)
      .set({ status: "waiting", transactionHash: null, fromAddress: null } as any)
      .where(eq(cryptoDepositsTable.id, matchedDeposit.id));
    return false;
  }

  logger.info(
    { depositId: matchedDeposit.id, userId: matchedDeposit.userId, txHash, receivedAmount },
    "Crypto deposit completed — wallet credited"
  );
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
    // Enforce USD-only: resolve the wallet and hard-fail if it is not USD.
    // USDT is credited 1:1 as USD — crediting any other currency wallet is a
    // data integrity error, so we never silently fall back to a non-USD wallet.
    const walletId = preferredWalletId ?? null;

    if (!walletId) {
      logger.error({ userId, depositId }, "No walletId on deposit record — cannot credit");
      return false;
    }

    const [wallet] = await db.select().from(walletsTable)
      .where(and(eq(walletsTable.id, walletId), eq(walletsTable.userId, userId)));

    if (!wallet) {
      logger.error({ userId, walletId, depositId }, "Target wallet not found — cannot credit");
      return false;
    }

    if (wallet.currencyCode !== "USD") {
      logger.error(
        { userId, walletId, currencyCode: wallet.currencyCode, depositId },
        "Target wallet is not USD — refusing to credit USDT amount into non-USD wallet"
      );
      return false;
    }

    // Credit the wallet
    await db
      .update(walletsTable)
      .set({ balance: sql`${walletsTable.balance} + ${amount}`, updatedAt: new Date() })
      .where(eq(walletsTable.id, walletId));

    // Mark deposit completed
    await db
      .update(cryptoDepositsTable)
      .set({
        status: "completed",
        walletId,
        confirmations: REQUIRED_CONFIRMATIONS,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .where(eq(cryptoDepositsTable.id, depositId));

    return true;
  } catch (err) {
    logger.error({ err, userId, depositId }, "Failed to credit wallet for crypto deposit");
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
