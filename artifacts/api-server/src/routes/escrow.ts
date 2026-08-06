/**
 * Escrow-held payments between a buyer and a seller, created from a chat.
 *
 * POST /escrows              — buyer funds an escrow (money leaves buyer's wallet into held state)
 * POST /escrows/:id/release  — buyer releases funds to the seller (minus escrow fee)
 * POST /escrows/:id/refund   — seller refunds the buyer in full
 * POST /escrows/:id/dispute  — either side disputes; funds freeze until admin resolves
 * GET  /admin/escrows        — admin: list escrows (filter by status) with audit trail
 * POST /admin/escrows/:id/resolve — admin resolves a disputed escrow (release | refund)
 *
 * Funding reuses the exact same protections as P2P transfers: lockout, PIN,
 * KYC cap, per-tx cap, rolling 24h combined cap, atomic conditional debit.
 * All status transitions are guarded by conditional UPDATE ... WHERE status='...'
 * inside the same DB transaction that moves money, so funds can never be
 * double-credited or lost.
 */
import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { StreamChat } from "stream-chat";
import {
  db, walletsTable, usersTable, exchangeRatesTable, settingsTable,
  escrowsTable, escrowEventsTable,
} from "@workspace/db";
import { requireAuth, adminOnly } from "../middleware/auth";
import { encryptNullable, decryptNullable } from "../lib/encryption";
import { logFraudEvent, loadFraudSettings, getDailyVolumeUsd, recordFailedAttempt } from "../lib/fraud";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function getStreamClient() {
  const key = process.env.STREAM_API_KEY;
  const secret = process.env.STREAM_API_SECRET;
  if (!key || !secret) throw new Error("Stream credentials not configured");
  return StreamChat.getInstance(key, secret);
}

/** Verify both users are members of the given messaging channel. Returns the channel or null. */
async function getSharedChannel(chatId: string, meId: number, otherId: number) {
  const client = getStreamClient();
  const channels = await client.queryChannels(
    { type: "messaging", id: chatId, members: { $in: [String(meId)] } },
    {},
    { limit: 1 },
  );
  const ch = channels[0];
  if (!ch) return null;
  const memberIds = Object.keys(ch.state?.members ?? {});
  if (!memberIds.includes(String(otherId))) return null;
  return ch;
}

async function getRateRow(currencyCode: string) {
  const [row] = await db.select().from(exchangeRatesTable)
    .where(eq(exchangeRatesTable.currencyCode, currencyCode));
  return row ?? null;
}

/** Escrow fee percent from settings (escrow_fee_percent), default 1.5%. */
async function getEscrowFeePercent(): Promise<number> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "escrow_fee_percent"));
  const v = row ? parseFloat(row.value) : NaN;
  return !isNaN(v) && v >= 0 && v <= 100 ? v : 1.5;
}

/** Max 2 decimal places — prevents floating-point precision games. */
const money = z.number().positive().finite()
  .refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Amount can have at most 2 decimal places");
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Flip the escrow bubble's attachment status for both sides (non-fatal). */
async function updateEscrowBubble(escrow: { id: number; messageId: string | null; buyerUserId: number }, patch: Record<string, unknown>) {
  if (!escrow.messageId) return;
  try {
    const client = getStreamClient();
    const r = await client.getMessage(escrow.messageId).catch(() => null);
    const msg = r?.message;
    if (!msg) return;
    const atts = (msg.attachments ?? []).map((a: any) =>
      a.type === "nanivio_escrow" && a.escrow_id === escrow.id ? { ...a, ...patch } : a);
    await client.partialUpdateMessage(escrow.messageId, { set: { attachments: atts } } as any, String(escrow.buyerUserId));
  } catch (e: any) {
    logger.warn({ err: e?.message, escrowId: escrow.id }, "escrow: failed to update bubble");
  }
}

/** Post a plain system-ish chat message from a user (non-fatal). */
async function postChatMessage(chatId: string, fromUserId: number, text: string) {
  try {
    const client = getStreamClient();
    const channel = client.channel("messaging", chatId);
    await channel.sendMessage({ text, user_id: String(fromUserId) } as any);
  } catch (e: any) {
    logger.warn({ err: e?.message, chatId }, "escrow: failed to post chat message");
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Credit the seller inside a transaction: seller wallet in the escrow currency,
 * else their first wallet (converted), else a new USD wallet.
 * Returns what was credited. Rates are read at release time.
 */
async function creditUserInTx(
  tx: Tx,
  toUserId: number,
  amount: number, // in fromCurrency, already net of any fee, 2-dp
  fromCurrency: string,
  preferredWalletId?: number | null,
): Promise<{ toWalletId: number; toAmount: number; toCurrency: string }> {
  const fromRateRow = await getRateRow(fromCurrency);
  const fromRate = fromRateRow ? parseFloat(fromRateRow.rateToUsd) : NaN;
  if (!(fromRate > 0)) throw new Error("RATE_UNAVAILABLE");

  const wallets = await tx.select().from(walletsTable).where(eq(walletsTable.userId, toUserId));
  let target =
    (preferredWalletId ? wallets.find(w => w.id === preferredWalletId) : undefined) ??
    wallets.find(w => w.currencyCode === fromCurrency) ??
    wallets[0] ?? null;

  let toCurrency = target?.currencyCode ?? "USD";
  let toAmount: number;
  if (toCurrency === fromCurrency) {
    toAmount = amount;
  } else {
    const toRateRow = await getRateRow(toCurrency);
    const toRate = toRateRow ? parseFloat(toRateRow.rateToUsd) : NaN;
    if (!(toRate > 0)) throw new Error("RATE_UNAVAILABLE");
    toAmount = round2(amount * (toRate / fromRate));
  }

  if (target) {
    await tx.update(walletsTable)
      .set({ balance: sql`${walletsTable.balance} + ${toAmount}`, updatedAt: new Date() })
      .where(eq(walletsTable.id, target.id));
    return { toWalletId: target.id, toAmount, toCurrency };
  }
  const usdAmount = round2(amount / fromRate);
  const [created] = await tx.insert(walletsTable).values({
    userId: toUserId,
    currencyCode: "USD",
    currencyName: "US Dollar",
    flag: "🇺🇸",
    balance: String(usdAmount),
  }).returning();
  return { toWalletId: created.id, toAmount: usdAmount, toCurrency: "USD" };
}

function logEvent(tx: Tx | typeof db, escrowId: number, actorType: string, actorId: number | null, action: string, detail?: string) {
  return tx.insert(escrowEventsTable).values({ escrowId, actorType, actorId, action, detail: detail ?? null });
}

/* ────────────────────────── create / fund ────────────────────────── */

const CreateBody = z.object({
  toUserId: z.number().int().positive(), // seller
  fromWalletId: z.number().int().positive(),
  amount: money,
  description: z.string().min(1).max(500),
  deadline: z.string().datetime().optional(),
  pin: z.string().regex(/^\d{4}$/),
  chatId: z.string().min(1),
});

router.post("/escrows", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { toUserId, fromWalletId, description, pin, chatId } = parsed.data;
  const userId = req.userId!;

  if (toUserId === userId) { res.status(400).json({ error: "You cannot open an escrow with yourself." }); return; }

  let deadline: Date | null = null;
  if (parsed.data.deadline) {
    deadline = new Date(parsed.data.deadline);
    if (!(deadline.getTime() > Date.now())) { res.status(400).json({ error: "Deadline must be in the future." }); return; }
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  // 1. Lockout
  if (user.sendLockedUntil && new Date(user.sendLockedUntil) > new Date()) {
    res.status(429).json({
      error: "SEND_LOCKED",
      message: "Your account has been temporarily locked due to multiple failed attempts. Please try again later.",
      retryAfter: new Date(user.sendLockedUntil).toISOString(),
    });
    return;
  }

  // 2. PIN
  const pinValid = await bcrypt.compare(pin, user.passwordHash);
  if (!pinValid) {
    const { lockoutThreshold } = await loadFraudSettings();
    await logFraudEvent(userId, "pin_failure");
    const { locked, lockedUntil } = await recordFailedAttempt(userId, lockoutThreshold, { reason: "wrong_pin", context: "escrow" });
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

  // 3. Seller exists
  const [seller] = await db.select().from(usersTable).where(eq(usersTable.id, toUserId));
  if (!seller) { res.status(404).json({ error: "Recipient not found" }); return; }

  // 4. Chat membership authorization
  let channel;
  try {
    channel = await getSharedChannel(chatId, userId, toUserId);
  } catch (e: any) {
    logger.warn({ err: e?.message }, "escrow: stream channel check failed");
    res.status(502).json({ error: "Could not verify chat. Please try again." });
    return;
  }
  if (!channel) { res.status(403).json({ error: "You can only open an escrow inside a chat you share with this person." }); return; }

  // 5. Source wallet + rates
  const [wallet] = await db.select().from(walletsTable)
    .where(and(eq(walletsTable.id, fromWalletId), eq(walletsTable.userId, userId)));
  if (!wallet) { res.status(400).json({ error: "Source wallet not found" }); return; }

  const rateRow = await getRateRow(wallet.currencyCode);
  const rateToUsd = rateRow ? parseFloat(rateRow.rateToUsd) : NaN;
  if (!(rateToUsd > 0)) { res.status(400).json({ error: `Unsupported source currency: ${wallet.currencyCode}` }); return; }

  const amount = round2(parsed.data.amount);
  const amountUsd = amount / rateToUsd;

  // 6. KYC gating
  if ((user.kycStatus === "unverified" || user.kycStatus === "rejected") && amountUsd > 2000) {
    res.status(403).json({
      error: "KYC_REQUIRED",
      message: "Transfers above $2,000 require identity verification. Please complete KYC in your account settings.",
    });
    return;
  }

  // 7. Velocity checks (combined remittance + P2P + escrow daily volume)
  const { txCapUsd, dailyCapUsd, lockoutThreshold } = await loadFraudSettings();
  if (amountUsd > txCapUsd) {
    await logFraudEvent(userId, "tx_cap_exceeded", { fromAmountUsd: round2(amountUsd), txCapUsd, currency: wallet.currencyCode, context: "escrow" });
    await recordFailedAttempt(userId, lockoutThreshold, { reason: "tx_cap_exceeded", context: "escrow" });
    res.status(400).json({
      error: "TX_CAP_EXCEEDED",
      message: `Single transfers cannot exceed $${txCapUsd.toLocaleString()} USD equivalent. This escrow is $${Math.round(amountUsd).toLocaleString()} USD.`,
    });
    return;
  }
  const dailySoFar = await getDailyVolumeUsd(userId);
  if (dailySoFar + amountUsd > dailyCapUsd) {
    await logFraudEvent(userId, "daily_cap_exceeded", { dailySoFarUsd: round2(dailySoFar), newTxUsd: round2(amountUsd), dailyCapUsd, context: "escrow" });
    await recordFailedAttempt(userId, lockoutThreshold, { reason: "daily_cap_exceeded", context: "escrow" });
    res.status(429).json({
      error: "DAILY_CAP_EXCEEDED",
      message: `You have reached your daily transfer limit of $${dailyCapUsd.toLocaleString()} USD. Your limit resets in 24 hours.`,
      retryAfter: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    return;
  }

  // 8. Atomic funding: user-row lock + in-tx cap re-check + conditional debit + escrow insert
  let escrow;
  try {
    escrow = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
      const dailyNow = await getDailyVolumeUsd(userId, tx as any);
      if (dailyNow + amountUsd > dailyCapUsd) throw new Error("DAILY_CAP_EXCEEDED");

      const debited = await tx
        .update(walletsTable)
        .set({ balance: sql`${walletsTable.balance} - ${amount}`, updatedAt: new Date() })
        .where(and(
          eq(walletsTable.id, fromWalletId),
          eq(walletsTable.userId, userId),
          gte(walletsTable.balance, String(amount)),
        ))
        .returning({ id: walletsTable.id });
      if (debited.length === 0) throw new Error("INSUFFICIENT_BALANCE");

      const [row] = await tx.insert(escrowsTable).values({
        buyerUserId: userId,
        sellerUserId: toUserId,
        buyerWalletId: fromWalletId,
        amount: String(amount),
        currencyCode: wallet.currencyCode,
        amountUsd: String(Math.round(amountUsd * 10000) / 10000),
        description: encryptNullable(description)!,
        deadline,
        status: "funded",
        chatId,
      }).returning();
      await logEvent(tx, row.id, "buyer", userId, "funded", `${amount} ${wallet.currencyCode}`);
      return row;
    });
  } catch (e: any) {
    if (e?.message === "INSUFFICIENT_BALANCE") {
      res.status(400).json({ error: "Insufficient balance." });
      return;
    }
    if (e?.message === "DAILY_CAP_EXCEEDED") {
      await logFraudEvent(userId, "daily_cap_exceeded", { newTxUsd: round2(amountUsd), dailyCapUsd, context: "escrow_tx_recheck" });
      res.status(429).json({
        error: "DAILY_CAP_EXCEEDED",
        message: `You have reached your daily transfer limit of $${dailyCapUsd.toLocaleString()} USD. Your limit resets in 24 hours.`,
        retryAfter: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      return;
    }
    logger.error({ err: e?.message }, "escrow funding failed");
    res.status(500).json({ error: "Escrow failed. No money was moved." });
    return;
  }

  // 9. Post the escrow bubble (non-fatal — money already held)
  try {
    const sent = await channel.sendMessage({
      text: `🛡️ Escrow: ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${wallet.currencyCode} held`,
      user_id: String(userId),
      attachments: [{
        type: "nanivio_escrow",
        escrow_id: escrow.id,
        amount,
        currency: wallet.currencyCode,
        description,
        deadline: deadline ? deadline.toISOString() : null,
        status: "funded",
        buyer_user_id: String(userId),
        seller_user_id: String(toUserId),
        buyer_name: user.name,
        seller_name: seller.name,
      } as any],
    });
    await db.update(escrowsTable)
      .set({ messageId: sent.message.id, updatedAt: new Date() })
      .where(eq(escrowsTable.id, escrow.id));
  } catch (e: any) {
    logger.warn({ err: e?.message }, "escrow: failed to post chat bubble after funding");
  }

  res.status(201).json({
    id: escrow.id,
    amount,
    currency: wallet.currencyCode,
    status: "funded",
    deadline: deadline ? deadline.toISOString() : null,
    sellerName: seller.name,
  });
});

/* ────────────────────────── release / refund / dispute ────────────────────────── */

async function loadEscrow(id: number) {
  const [row] = await db.select().from(escrowsTable).where(eq(escrowsTable.id, id));
  return row ?? null;
}

router.post("/escrows/:id/release", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid escrow id" }); return; }
  const userId = req.userId!;

  const escrow = await loadEscrow(id);
  if (!escrow) { res.status(404).json({ error: "Escrow not found" }); return; }
  if (escrow.buyerUserId !== userId) { res.status(403).json({ error: "Only the buyer can release escrow funds." }); return; }
  if (escrow.status !== "funded") { res.status(409).json({ error: `This escrow is already ${escrow.status}.` }); return; }

  const feePercent = await getEscrowFeePercent();
  const amount = round2(parseFloat(escrow.amount));
  const fee = round2(amount * (feePercent / 100));
  const net = round2(amount - fee);

  let credited;
  try {
    credited = await db.transaction(async (tx) => {
      const updated = await tx.update(escrowsTable)
        .set({ status: "released", resolvedBy: "buyer", feeAmount: String(fee), updatedAt: new Date() })
        .where(and(eq(escrowsTable.id, id), eq(escrowsTable.status, "funded")))
        .returning({ id: escrowsTable.id });
      if (updated.length === 0) throw new Error("ALREADY_HANDLED");
      const c = await creditUserInTx(tx, escrow.sellerUserId, net, escrow.currencyCode);
      await logEvent(tx, id, "buyer", userId, "released", `net ${net} ${escrow.currencyCode} (fee ${fee}) → ${c.toAmount} ${c.toCurrency}`);
      return c;
    });
  } catch (e: any) {
    if (e?.message === "ALREADY_HANDLED") { res.status(409).json({ error: "This escrow was already handled." }); return; }
    if (e?.message === "RATE_UNAVAILABLE") { res.status(400).json({ error: "Exchange rate unavailable. Please try again later." }); return; }
    logger.error({ err: e?.message, escrowId: id }, "escrow release failed");
    res.status(500).json({ error: "Release failed. Funds remain held." });
    return;
  }

  await updateEscrowBubble(escrow, { status: "released" });
  res.json({ id, status: "released", fee, netAmount: net, credited });
});

router.post("/escrows/:id/refund", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid escrow id" }); return; }
  const userId = req.userId!;

  const escrow = await loadEscrow(id);
  if (!escrow) { res.status(404).json({ error: "Escrow not found" }); return; }
  if (escrow.sellerUserId !== userId) { res.status(403).json({ error: "Only the seller can refund an escrow." }); return; }
  if (escrow.status !== "funded") { res.status(409).json({ error: `This escrow is already ${escrow.status}.` }); return; }

  const amount = round2(parseFloat(escrow.amount));

  let credited;
  try {
    credited = await db.transaction(async (tx) => {
      const updated = await tx.update(escrowsTable)
        .set({ status: "refunded", resolvedBy: "seller", updatedAt: new Date() })
        .where(and(eq(escrowsTable.id, id), eq(escrowsTable.status, "funded")))
        .returning({ id: escrowsTable.id });
      if (updated.length === 0) throw new Error("ALREADY_HANDLED");
      const c = await creditUserInTx(tx, escrow.buyerUserId, amount, escrow.currencyCode, escrow.buyerWalletId);
      await logEvent(tx, id, "seller", userId, "refunded", `${amount} ${escrow.currencyCode} → ${c.toAmount} ${c.toCurrency}`);
      return c;
    });
  } catch (e: any) {
    if (e?.message === "ALREADY_HANDLED") { res.status(409).json({ error: "This escrow was already handled." }); return; }
    if (e?.message === "RATE_UNAVAILABLE") { res.status(400).json({ error: "Exchange rate unavailable. Please try again later." }); return; }
    logger.error({ err: e?.message, escrowId: id }, "escrow refund failed");
    res.status(500).json({ error: "Refund failed. Funds remain held." });
    return;
  }

  await updateEscrowBubble(escrow, { status: "refunded" });
  res.json({ id, status: "refunded", credited });
});

const DisputeBody = z.object({ reason: z.string().max(500).optional() });

router.post("/escrows/:id/dispute", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid escrow id" }); return; }
  const parsed = DisputeBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const userId = req.userId!;

  const escrow = await loadEscrow(id);
  if (!escrow) { res.status(404).json({ error: "Escrow not found" }); return; }
  if (escrow.buyerUserId !== userId && escrow.sellerUserId !== userId) {
    res.status(403).json({ error: "Only the buyer or seller can dispute this escrow." });
    return;
  }
  if (escrow.status !== "funded") { res.status(409).json({ error: `This escrow is already ${escrow.status}.` }); return; }

  const role = escrow.buyerUserId === userId ? "buyer" : "seller";
  const updated = await db.update(escrowsTable)
    .set({
      status: "disputed",
      disputedBy: userId,
      disputeReason: encryptNullable(parsed.data.reason ?? null),
      updatedAt: new Date(),
    })
    .where(and(eq(escrowsTable.id, id), eq(escrowsTable.status, "funded")))
    .returning({ id: escrowsTable.id });
  if (updated.length === 0) { res.status(409).json({ error: "This escrow was already handled." }); return; }
  await logEvent(db, id, role, userId, "disputed", parsed.data.reason ? "reason provided" : undefined);

  await updateEscrowBubble(escrow, { status: "disputed" });
  res.json({ id, status: "disputed" });
});

/* ────────────────────────── admin: disputes queue + resolve ────────────────────────── */

router.get("/admin/escrows", adminOnly, async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const where = status && ["funded", "released", "refunded", "disputed"].includes(status)
    ? eq(escrowsTable.status, status)
    : undefined;

  const rows = await db.select().from(escrowsTable).where(where).orderBy(desc(escrowsTable.createdAt)).limit(200);

  const userIds = [...new Set(rows.flatMap(r => [r.buyerUserId, r.sellerUserId]))];
  const users = userIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const userMap = new Map(users.map(u => [u.id, u]));

  const escrowIds = rows.map(r => r.id);
  const events = escrowIds.length
    ? await db.select().from(escrowEventsTable).where(inArray(escrowEventsTable.escrowId, escrowIds)).orderBy(escrowEventsTable.createdAt)
    : [];
  const eventMap = new Map<number, typeof events>();
  for (const ev of events) {
    if (!eventMap.has(ev.escrowId)) eventMap.set(ev.escrowId, []);
    eventMap.get(ev.escrowId)!.push(ev);
  }

  res.json(rows.map(r => ({
    id: r.id,
    buyer: userMap.get(r.buyerUserId) ?? { id: r.buyerUserId, name: "Unknown", email: "" },
    seller: userMap.get(r.sellerUserId) ?? { id: r.sellerUserId, name: "Unknown", email: "" },
    amount: r.amount,
    currencyCode: r.currencyCode,
    feeAmount: r.feeAmount,
    description: decryptNullable(r.description),
    deadline: r.deadline,
    status: r.status,
    disputedBy: r.disputedBy,
    disputeReason: decryptNullable(r.disputeReason),
    resolvedBy: r.resolvedBy,
    chatId: r.chatId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    events: (eventMap.get(r.id) ?? []).map(ev => ({
      id: ev.id, actorType: ev.actorType, actorId: ev.actorId, action: ev.action, detail: ev.detail, createdAt: ev.createdAt,
    })),
  })));
});

const ResolveBody = z.object({
  action: z.enum(["release", "refund"]),
  note: z.string().max(500).optional(),
});

router.post("/admin/escrows/:id/resolve", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid escrow id" }); return; }
  const parsed = ResolveBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { action, note } = parsed.data;

  const escrow = await loadEscrow(id);
  if (!escrow) { res.status(404).json({ error: "Escrow not found" }); return; }
  if (escrow.status !== "disputed") { res.status(409).json({ error: `Only disputed escrows can be resolved by admin (current: ${escrow.status}).` }); return; }

  const amount = round2(parseFloat(escrow.amount));

  let credited;
  try {
    credited = await db.transaction(async (tx) => {
      if (action === "release") {
        const feePercent = await getEscrowFeePercent();
        const fee = round2(amount * (feePercent / 100));
        const net = round2(amount - fee);
        const updated = await tx.update(escrowsTable)
          .set({ status: "released", resolvedBy: "admin", feeAmount: String(fee), updatedAt: new Date() })
          .where(and(eq(escrowsTable.id, id), eq(escrowsTable.status, "disputed")))
          .returning({ id: escrowsTable.id });
        if (updated.length === 0) throw new Error("ALREADY_HANDLED");
        const c = await creditUserInTx(tx, escrow.sellerUserId, net, escrow.currencyCode);
        await logEvent(tx, id, "admin", null, "released", `admin resolution${note ? `: ${note}` : ""} — net ${net} ${escrow.currencyCode} (fee ${fee}) → ${c.toAmount} ${c.toCurrency}`);
        return c;
      }
      const updated = await tx.update(escrowsTable)
        .set({ status: "refunded", resolvedBy: "admin", updatedAt: new Date() })
        .where(and(eq(escrowsTable.id, id), eq(escrowsTable.status, "disputed")))
        .returning({ id: escrowsTable.id });
      if (updated.length === 0) throw new Error("ALREADY_HANDLED");
      const c = await creditUserInTx(tx, escrow.buyerUserId, amount, escrow.currencyCode, escrow.buyerWalletId);
      await logEvent(tx, id, "admin", null, "refunded", `admin resolution${note ? `: ${note}` : ""} — ${amount} ${escrow.currencyCode} → ${c.toAmount} ${c.toCurrency}`);
      return c;
    });
  } catch (e: any) {
    if (e?.message === "ALREADY_HANDLED") { res.status(409).json({ error: "This escrow was already handled." }); return; }
    if (e?.message === "RATE_UNAVAILABLE") { res.status(400).json({ error: "Exchange rate unavailable. Please try again later." }); return; }
    logger.error({ err: e?.message, escrowId: id }, "escrow admin resolve failed");
    res.status(500).json({ error: "Resolution failed. Funds remain held." });
    return;
  }

  const newStatus = action === "release" ? "released" : "refunded";
  await updateEscrowBubble(escrow, { status: newStatus });
  await postChatMessage(escrow.chatId, escrow.buyerUserId, `🛡️ Escrow #${id} was resolved by support: ${newStatus}.`);
  res.json({ id, status: newStatus, credited });
});

/* ────────────────────────── deadline reminder sweep ────────────────────────── */

/**
 * Notify both parties (via a chat message + bubble flag) when a funded escrow's
 * deadline has passed with no action. Money stays held — no automatic movement.
 */
export async function sweepEscrowDeadlines(): Promise<void> {
  try {
    const now = new Date();
    const due = await db.select().from(escrowsTable).where(and(
      eq(escrowsTable.status, "funded"),
      eq(escrowsTable.deadlineReminded, false),
      sql`${escrowsTable.deadline} IS NOT NULL`,
      lte(escrowsTable.deadline, now),
    )).limit(50);

    for (const escrow of due) {
      // Conditional claim: only still-funded, un-reminded escrows. The status guard
      // prevents a stale sweep from posting an overdue notice after settlement,
      // and the flag+audit event commit together so neither can be lost alone.
      let claimed = false;
      await db.transaction(async (tx) => {
        const updated = await tx.update(escrowsTable)
          .set({ deadlineReminded: true, updatedAt: new Date() })
          .where(and(
            eq(escrowsTable.id, escrow.id),
            eq(escrowsTable.deadlineReminded, false),
            eq(escrowsTable.status, "funded"),
          ))
          .returning({ id: escrowsTable.id });
        if (updated.length === 0) return;
        await logEvent(tx, escrow.id, "system", null, "deadline_reminder");
        claimed = true;
      });
      if (!claimed) continue;
      await postChatMessage(
        escrow.chatId,
        escrow.buyerUserId,
        `⏰ The delivery deadline for escrow #${escrow.id} (${round2(parseFloat(escrow.amount)).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${escrow.currencyCode}) has passed. ` +
        `Funds are still safely held — the buyer can release, the seller can refund, or either side can open a dispute.`,
      );
      await updateEscrowBubble(escrow, { deadline_passed: true });
    }
  } catch (e: any) {
    logger.warn({ err: e?.message }, "escrow deadline sweep failed");
  }
}

// Run the sweep every 10 minutes (and once shortly after boot).
setTimeout(() => { void sweepEscrowDeadlines(); }, 15_000);
setInterval(() => { void sweepEscrowDeadlines(); }, 10 * 60 * 1000);

export default router;
