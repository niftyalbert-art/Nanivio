import { Router, type IRouter } from "express";
import { eq, and, sql, desc, gte } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, walletsTable, transactionsTable, exchangeRatesTable, settingsTable, usersTable, p2pTransfersTable } from "@workspace/db";
import { or } from "drizzle-orm";
import {
  GetTransactionsQueryParams,
  GetTransactionsResponse,
  CreateTransactionBody,
  CreateTransactionResponse,
  GetTransactionParams,
  GetTransactionResponse,
  GetTransactionStatsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/auth";
import { encryptNullable, decryptNullable } from "../lib/encryption";
import { logFraudEvent, loadFraudSettings, getDailyVolumeUsd, recordFailedAttempt } from "../lib/fraud";

const router: IRouter = Router();

// P2P transfers are merged into the transactions list with offset ids so
// /transactions/:id links keep working without colliding with remittance ids.
// Offset chosen far above any realistic serial id (int4 max ≈ 2.1e9) to avoid collisions.
const P2P_ID_OFFSET = 1_000_000_000;

/** Map a p2p_transfers row (+user names) into the Transaction response shape. */
function p2pToTransactionShape(row: typeof p2pTransfersTable.$inferSelect, userId: number, names: Map<number, string>) {
  const sent = row.fromUserId === userId;
  const counterpartyName = names.get(sent ? row.toUserId : row.fromUserId) ?? "Nanivio user";
  return {
    id: P2P_ID_OFFSET + row.id,
    fromCurrency: row.fromCurrency,
    toCurrency: row.toCurrency,
    fromAmount: parseFloat(row.fromAmount),
    toAmount: parseFloat(row.toAmount),
    exchangeRate: parseFloat(row.exchangeRate),
    fee: sent ? parseFloat(row.fee) : 0,
    status: row.status === "failed" ? "failed" : "completed",
    recipientName: counterpartyName,
    recipientCountry: sent ? "Sent in chat · Nanivio" : "Received in chat · Nanivio",
    recipientFlag: "💬",
    note: row.note ? decryptNullable(row.note) : null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    direction: sent ? "sent" : "received",
    counterpartyName,
  };
}

async function getUserNames(ids: number[]): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  if (ids.length === 0) return names;
  const rows = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
    .where(or(...ids.map(i => eq(usersTable.id, i))));
  for (const r of rows) names.set(r.id, r.name);
  return names;
}

const FLAGS: Record<string, string> = {
  AED: "🇦🇪", GHS: "🇬🇭", PHP: "🇵🇭", INR: "🇮🇳", NGN: "🇳🇬",
  KES: "🇰🇪", EUR: "🇪🇺", GBP: "🇬🇧", PKR: "🇵🇰", BDT: "🇧🇩",
  LKR: "🇱🇰", TZS: "🇹🇿", UGX: "🇺🇬", ZAR: "🇿🇦", MAD: "🇲🇦",
  EGP: "🇪🇬", XOF: "🇸🇳", MXN: "🇲🇽", BRL: "🇧🇷", THB: "🇹🇭",
  MYR: "🇲🇾", SGD: "🇸🇬", CAD: "🇨🇦", AUD: "🇦🇺", NZD: "🇳🇿",
  JPY: "🇯🇵", CNY: "🇨🇳", HKD: "🇭🇰", USDT: "₿", USD: "🇺🇸",
};

async function getRateRow(currencyCode: string) {
  const [row] = await db.select().from(exchangeRatesTable)
    .where(eq(exchangeRatesTable.currencyCode, currencyCode));
  return row ?? null;
}

// Stats: admin-style endpoint — all transactions (no userId filter)
router.get("/transactions/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const rows = await db
    .select({
      toCurrency: transactionsTable.toCurrency,
      totalVolume: sql<number>`sum(${transactionsTable.fromAmount})`,
      count: sql<number>`count(*)`,
    })
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .groupBy(transactionsTable.toCurrency)
    .orderBy(sql`sum(${transactionsTable.fromAmount}) desc`);

  const successRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.status, "completed"), eq(transactionsTable.userId, userId)));

  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId));

  const successRate =
    Number(totalRows[0]?.count) > 0
      ? (Number(successRows[0]?.count) / Number(totalRows[0]?.count)) * 100
      : 100;

  const stats = {
    byCurrency: rows.map((r) => ({
      currencyCode: r.toCurrency,
      flag: FLAGS[r.toCurrency] ?? "🌐",
      totalVolume: Number(r.totalVolume),
      count: Number(r.count),
    })),
    successRate: Math.round(successRate * 10) / 10,
    avgTransferTime: "2 minutes",
  };

  res.json(GetTransactionStatsResponse.parse(stats));
});

router.get("/transactions", requireAuth, async (req, res): Promise<void> => {
  const qParams = GetTransactionsQueryParams.safeParse(req.query);
  if (!qParams.success) {
    res.status(400).json({ error: qParams.error.message });
    return;
  }

  const { status, limit } = qParams.data;
  const userId = req.userId!;

  let query = db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(desc(transactionsTable.createdAt))
    .$dynamic();

  if (status) {
    query = query.where(and(eq(transactionsTable.userId, userId), eq(transactionsTable.status, status)));
  }

  const rows = await query.limit(limit ?? 50);

  // Merge in P2P transfers (sent + received)
  let p2pRows = await db.select().from(p2pTransfersTable)
    .where(or(eq(p2pTransfersTable.fromUserId, userId), eq(p2pTransfersTable.toUserId, userId)))
    .orderBy(desc(p2pTransfersTable.createdAt))
    .limit(limit ?? 50);
  if (status) {
    p2pRows = p2pRows.filter(r => (status === "failed" ? r.status === "failed" : status === "completed" ? r.status !== "failed" : false));
  }
  const nameIds = [...new Set(p2pRows.flatMap(r => [r.fromUserId, r.toUserId]))];
  const names = await getUserNames(nameIds);
  const p2pParsed = p2pRows.map(r => p2pToTransactionShape(r, userId, names));

  const parsed = rows.map((t) => ({
    ...t,
    fromAmount: parseFloat(t.fromAmount),
    toAmount: parseFloat(t.toAmount),
    exchangeRate: parseFloat(t.exchangeRate),
    fee: parseFloat(t.fee),
    // Decrypt note for display
    note: t.note ? decryptNullable(t.note) : null,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
  }));

  const merged = [...parsed, ...p2pParsed]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit ?? 50);

  res.json(GetTransactionsResponse.parse(merged));
});

router.post("/transactions", requireAuth, async (req, res): Promise<void> => {
  const body = CreateTransactionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { fromWalletId, toCurrencyCode, fromAmount, recipientName, recipientCountry, note, pin } = body.data;
  const userId = req.userId!;

  // Fetch user (needed for PIN check, KYC, and lockout)
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  // ── 1. Lockout check — before anything else ──────────────────────────────
  if (user.sendLockedUntil && new Date(user.sendLockedUntil) > new Date()) {
    const retryAfter = new Date(user.sendLockedUntil).toISOString();
    res.status(429).json({
      error: "SEND_LOCKED",
      message: "Your account has been temporarily locked due to multiple failed attempts. Please try again later.",
      retryAfter,
    });
    return;
  }

  // ── 2. PIN verification ───────────────────────────────────────────────────
  const pinValid = await bcrypt.compare(pin, user.passwordHash);
  if (!pinValid) {
    const { txCapUsd, dailyCapUsd, lockoutThreshold } = await loadFraudSettings();
    await logFraudEvent(userId, "pin_failure");
    const { locked, lockedUntil } = await recordFailedAttempt(userId, lockoutThreshold, { reason: "wrong_pin" });
    if (locked) {
      res.status(429).json({
        error: "SEND_LOCKED",
        message: "Account locked for 1 hour after repeated failed attempts.",
        retryAfter: lockedUntil?.toISOString(),
      });
    } else {
      res.status(403).json({ error: "Incorrect PIN. Please try again." });
    }
    return;
  }

  // ── 3. Source wallet ──────────────────────────────────────────────────────
  const [wallet] = await db.select().from(walletsTable)
    .where(and(eq(walletsTable.id, fromWalletId), eq(walletsTable.userId, userId)));
  if (!wallet) {
    res.status(400).json({ error: "Source wallet not found" });
    return;
  }

  // ── 4. Exchange rates ─────────────────────────────────────────────────────
  const fromRateRow = await getRateRow(wallet.currencyCode);
  const toRateRow = await getRateRow(toCurrencyCode);

  if (!fromRateRow) {
    res.status(400).json({ error: `Unsupported source currency: ${wallet.currencyCode}` });
    return;
  }
  if (!toRateRow) {
    res.status(400).json({ error: `Unsupported destination currency: ${toCurrencyCode}` });
    return;
  }

  const fromRateToUsd = parseFloat(fromRateRow.rateToUsd);
  const toRateToUsd = parseFloat(toRateRow.rateToUsd);
  const fromAmountUsd = fromRateToUsd > 0 ? fromAmount / fromRateToUsd : 0;

  // ── 5. KYC gating: unverified/rejected capped at $2000 USD ───────────────
  if ((user.kycStatus === "unverified" || user.kycStatus === "rejected") && fromAmountUsd > 2000) {
    res.status(403).json({
      error: "KYC_REQUIRED",
      message: "Transfers above $2,000 require identity verification. Please complete KYC in your account settings.",
    });
    return;
  }

  // ── 6. Fraud / velocity checks ────────────────────────────────────────────
  const { txCapUsd, dailyCapUsd, lockoutThreshold } = await loadFraudSettings();

  // Per-transaction hard cap
  if (fromAmountUsd > txCapUsd) {
    await logFraudEvent(userId, "tx_cap_exceeded", {
      fromAmountUsd: Math.round(fromAmountUsd * 100) / 100,
      txCapUsd,
      currency: wallet.currencyCode,
    });
    await recordFailedAttempt(userId, lockoutThreshold, { reason: "tx_cap_exceeded" });
    res.status(400).json({
      error: "TX_CAP_EXCEEDED",
      message: `Single transfers cannot exceed $${txCapUsd.toLocaleString()} USD equivalent. This transfer is $${Math.round(fromAmountUsd).toLocaleString()} USD.`,
    });
    return;
  }

  // Rolling 24-hour daily cap
  const dailySoFar = await getDailyVolumeUsd(userId);
  if (dailySoFar + fromAmountUsd > dailyCapUsd) {
    const resetAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await logFraudEvent(userId, "daily_cap_exceeded", {
      dailySoFarUsd: Math.round(dailySoFar * 100) / 100,
      newTxUsd: Math.round(fromAmountUsd * 100) / 100,
      dailyCapUsd,
    });
    await recordFailedAttempt(userId, lockoutThreshold, { reason: "daily_cap_exceeded" });
    res.status(429).json({
      error: "DAILY_CAP_EXCEEDED",
      message: `You have reached your daily transfer limit of $${dailyCapUsd.toLocaleString()} USD. Your limit resets in 24 hours.`,
      retryAfter: resetAt,
    });
    return;
  }

  // ── 7. Load fee settings ──────────────────────────────────────────────────
  const allFeeRows = await db.select().from(settingsTable);
  const feeMap: Record<string, string> = {};
  for (const r of allFeeRows) feeMap[r.key] = r.value;

  const feeMode = feeMap["fee_mode"] || "percent";

  let fee = 0;
  if (feeMode === "fixed") {
    const fixedVal = feeMap["send_fee_fixed"] ? parseFloat(feeMap["send_fee_fixed"]) : 0;
    fee = isNaN(fixedVal) ? 0 : Math.round(fixedVal * 100) / 100;
  } else {
    const globalFee = feeMap["send_fee_percent"] ? parseFloat(feeMap["send_fee_percent"]) : NaN;
    const feePercent = !isNaN(globalFee) && globalFee >= 0 ? globalFee : parseFloat(toRateRow.feePercent);
    fee = Math.round(((feePercent / 100) * fromAmount) * 100) / 100;
  }

  // ── 8. Balance check ──────────────────────────────────────────────────────
  const currentBalance = parseFloat(wallet.balance);
  const totalCost = fromAmount + fee;

  if (currentBalance < totalCost) {
    res.status(400).json({ error: "Insufficient balance. Please kindly add transfer fee." });
    return;
  }

  // ── 9. Execute transaction ────────────────────────────────────────────────
  // Atomic: per-user serialization (row lock) + in-transaction daily-cap re-check
  // shared with the P2P flow, then conditional debit + insert.
  const exchangeRate = toRateToUsd / fromRateToUsd;
  const toAmount = fromAmount * exchangeRate;
  const recipientFlag = FLAGS[toCurrencyCode] ?? "🌐";

  // Encrypt the note field (contains account/mobile number)
  const encryptedNote = encryptNullable(note ?? null);

  let transaction;
  try {
    transaction = await db.transaction(async (tx) => {
      // Serialize all outbound money movement (remittance + P2P) per user so
      // concurrent sends cannot race past the combined daily cap.
      await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
      const dailyNow = await getDailyVolumeUsd(userId, tx as any);
      if (dailyNow + fromAmountUsd > dailyCapUsd) throw new Error("DAILY_CAP_EXCEEDED");

      const debited = await tx
        .update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} - ${totalCost}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(walletsTable.id, fromWalletId),
          eq(walletsTable.userId, userId),
          gte(walletsTable.balance, String(totalCost)),
        ))
        .returning({ id: walletsTable.id });
      if (debited.length === 0) throw new Error("INSUFFICIENT_BALANCE");

      const [row] = await tx
        .insert(transactionsTable)
        .values({
          userId,
          fromCurrency: wallet.currencyCode,
          toCurrency: toCurrencyCode,
          fromAmount: String(fromAmount),
          toAmount: String(Math.round(toAmount * 100) / 100),
          exchangeRate: String(Math.round(exchangeRate * 10000) / 10000),
          fee: String(fee),
          status: "pending",
          recipientName,
          recipientCountry,
          recipientFlag,
          note: encryptedNote,
          fromAmountUsd: String(Math.round(fromAmountUsd * 10000) / 10000),
        })
        .returning();
      return row;
    });
  } catch (e: any) {
    if (e?.message === "INSUFFICIENT_BALANCE") {
      res.status(400).json({ error: "Insufficient balance. Please kindly add transfer fee." });
      return;
    }
    if (e?.message === "DAILY_CAP_EXCEEDED") {
      await logFraudEvent(userId, "daily_cap_exceeded", { newTxUsd: Math.round(fromAmountUsd * 100) / 100, dailyCapUsd, context: "remittance_tx_recheck" });
      res.status(429).json({
        error: "DAILY_CAP_EXCEEDED",
        message: `You have reached your daily transfer limit of $${dailyCapUsd.toLocaleString()} USD. Your limit resets in 24 hours.`,
        retryAfter: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      return;
    }
    throw e;
  }

  res.status(201).json(
    CreateTransactionResponse.parse({
      ...transaction,
      fromAmount: parseFloat(transaction.fromAmount),
      toAmount: parseFloat(transaction.toAmount),
      exchangeRate: parseFloat(transaction.exchangeRate),
      fee: parseFloat(transaction.fee),
      // Return decrypted note to the user who just submitted it
      note: note ?? null,
      createdAt: transaction.createdAt instanceof Date ? transaction.createdAt.toISOString() : String(transaction.createdAt),
    })
  );
});

router.get("/transactions/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetTransactionParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // P2P transfer detail (offset id range)
  if (params.data.id >= P2P_ID_OFFSET) {
    const p2pId = params.data.id - P2P_ID_OFFSET;
    const [row] = await db.select().from(p2pTransfersTable).where(eq(p2pTransfersTable.id, p2pId));
    if (!row || (row.fromUserId !== req.userId! && row.toUserId !== req.userId!)) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    const names = await getUserNames([row.fromUserId, row.toUserId]);
    res.json(GetTransactionResponse.parse(p2pToTransactionShape(row, req.userId!, names)));
    return;
  }

  const [t] = await db
    .select()
    .from(transactionsTable)
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.userId, req.userId!)));

  if (!t) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  res.json(
    GetTransactionResponse.parse({
      ...t,
      fromAmount: parseFloat(t.fromAmount),
      toAmount: parseFloat(t.toAmount),
      exchangeRate: parseFloat(t.exchangeRate),
      fee: parseFloat(t.fee),
      note: t.note ? decryptNullable(t.note) : null,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
    })
  );
});

export default router;
