/**
 * Fraud velocity check and event logging utilities.
 *
 * Checks run in order for every transfer attempt:
 *   1. Is the user's send ability locked? (failed-attempt lockout)
 *   2. Per-transaction cap (configurable, default $10,000 USD)
 *   3. Rolling 24-hour daily cap (configurable, default $50,000 USD)
 *
 * Failed-attempt lockout:
 *   - Each failed attempt (PIN wrong, cap exceeded, validation failure) increments
 *     a counter that resets after 10 minutes of no failures.
 *   - When the counter reaches the configured threshold (default 3), the user's
 *     send ability is locked for 1 hour.
 */

import { db, fraudEventsTable, transactionsTable, usersTable, settingsTable, p2pTransfersTable, escrowsTable, callSessionsTable, exchangeRatesTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { logger } from "./logger";

export const FRAUD_DEFAULTS = {
  tx_cap_usd: 10_000,
  daily_cap_usd: 50_000,
  lockout_threshold: 3,
};

/** Log a fraud event to the fraud_events table (non-fatal on error). */
export async function logFraudEvent(
  userId: number,
  eventType: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(fraudEventsTable).values({
      userId,
      eventType,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (err) {
    logger.warn({ err, eventType, userId }, "Failed to log fraud event (non-fatal)");
  }
}

/** Load fraud-related settings from the settings table. */
export async function loadFraudSettings(): Promise<{
  txCapUsd: number;
  dailyCapUsd: number;
  lockoutThreshold: number;
}> {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  const txCapUsd = parseFloat(map.fraud_tx_cap_usd ?? "") || FRAUD_DEFAULTS.tx_cap_usd;
  const dailyCapUsd = parseFloat(map.fraud_daily_cap_usd ?? "") || FRAUD_DEFAULTS.daily_cap_usd;
  const lockoutThreshold = parseInt(map.fraud_lockout_threshold ?? "", 10) || FRAUD_DEFAULTS.lockout_threshold;

  return { txCapUsd, dailyCapUsd, lockoutThreshold };
}

/**
 * Get rolling 24-hour USD send volume for a user (sum of non-failed txs).
 * Combines outbound remittance volume AND in-chat P2P send volume so
 * neither flow can be used to bypass the daily cap.
 * Accepts an optional executor so it can run inside a DB transaction.
 */
export async function getDailyVolumeUsd(userId: number, executor: { select: typeof db.select } = db): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await executor
    .select({ total: sql<string>`COALESCE(SUM(${transactionsTable.fromAmountUsd}), 0)` })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.userId, userId),
        gte(transactionsTable.createdAt, since),
        // Exclude failed transactions from volume
        sql`${transactionsTable.status} != 'failed'`,
      ),
    );
  const [p2pRow] = await executor
    .select({ total: sql<string>`COALESCE(SUM(${p2pTransfersTable.fromAmountUsd}), 0)` })
    .from(p2pTransfersTable)
    .where(
      and(
        eq(p2pTransfersTable.fromUserId, userId),
        gte(p2pTransfersTable.createdAt, since),
        sql`${p2pTransfersTable.status} != 'failed'`,
      ),
    );
  // ALL escrows funded in the window count as outbound volume, regardless of
  // later status. Refunds must NOT erase historical send volume — otherwise
  // repeated fund→refund cycles would bypass the daily cap.
  const [escrowRow] = await executor
    .select({ total: sql<string>`COALESCE(SUM(${escrowsTable.amountUsd}), 0)` })
    .from(escrowsTable)
    .where(
      and(
        eq(escrowsTable.buyerUserId, userId),
        gte(escrowsTable.createdAt, since),
      ),
    );
  // ACTIVE paid-call sessions reserve their accrued cost against the cap so a
  // caller cannot open a paid call and then drain the remaining daily headroom
  // through P2P/remittance while the call is billing. Settled sessions are
  // excluded (their settlement wrote a p2p_transfers row counted above); the
  // settle transaction flips status and inserts the row atomically, so the
  // reservation hands off to real volume without double counting.
  const activeSessions = await executor
    .select({
      startedAt: callSessionsTable.startedAt,
      ratePerMinute: callSessionsTable.ratePerMinute,
      currencyCode: callSessionsTable.currencyCode,
    })
    .from(callSessionsTable)
    .where(and(eq(callSessionsTable.callerUserId, userId), eq(callSessionsTable.status, "active")));
  let callReservedUsd = 0;
  for (const s of activeSessions) {
    const minutes = Math.max(1, Math.ceil((Date.now() - new Date(s.startedAt).getTime()) / 60_000));
    const rate = parseFloat(s.ratePerMinute);
    if (!(rate > 0)) continue;
    const [fx] = await executor
      .select({ rateToUsd: exchangeRatesTable.rateToUsd })
      .from(exchangeRatesTable)
      .where(eq(exchangeRatesTable.currencyCode, s.currencyCode));
    const toUsd = fx ? parseFloat(fx.rateToUsd) : NaN;
    if (toUsd > 0) callReservedUsd += (minutes * rate) / toUsd;
  }

  return parseFloat(row?.total ?? "0") + parseFloat(p2pRow?.total ?? "0") + parseFloat(escrowRow?.total ?? "0") + callReservedUsd;
}

const LOCKOUT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const LOCKOUT_DURATION_MS = 60 * 60 * 1000; // 1 hour

/** Record a failed transfer attempt. Locks the user if the threshold is reached. Returns true if user is now locked. */
export async function recordFailedAttempt(
  userId: number,
  threshold: number,
  metadata?: Record<string, unknown>,
): Promise<{ locked: boolean; lockedUntil?: Date }> {
  const [user] = await db
    .select({
      failedTransferAttempts: usersTable.failedTransferAttempts,
      lastFailedTransferAt: usersTable.lastFailedTransferAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) return { locked: false };

  const lastFailed = user.lastFailedTransferAt ? new Date(user.lastFailedTransferAt) : null;
  const isWithinWindow = lastFailed && Date.now() - lastFailed.getTime() < LOCKOUT_WINDOW_MS;

  // Reset counter if the last failure is outside the window
  const currentAttempts = isWithinWindow ? parseInt(user.failedTransferAttempts ?? "0", 10) : 0;
  const newAttempts = currentAttempts + 1;
  const now = new Date();

  if (newAttempts >= threshold) {
    // Lock the user
    const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    await db.update(usersTable).set({
      failedTransferAttempts: "0",
      lastFailedTransferAt: now,
      sendLockedUntil: lockedUntil,
    }).where(eq(usersTable.id, userId));

    await logFraudEvent(userId, "account_locked", {
      ...metadata,
      lockedUntilIso: lockedUntil.toISOString(),
      attempts: newAttempts,
    });

    return { locked: true, lockedUntil };
  }

  await db.update(usersTable).set({
    failedTransferAttempts: String(newAttempts),
    lastFailedTransferAt: now,
  }).where(eq(usersTable.id, userId));

  return { locked: false };
}

/** Clear a user's send lock (admin action). */
export async function clearSendLock(userId: number): Promise<void> {
  await db.update(usersTable).set({
    sendLockedUntil: null,
    failedTransferAttempts: "0",
    lastFailedTransferAt: null,
  }).where(eq(usersTable.id, userId));
  await logFraudEvent(userId, "lock_cleared");
}
