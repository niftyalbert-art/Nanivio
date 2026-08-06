/**
 * P2P (in-chat) wallet-to-wallet transfers + money requests.
 *
 * POST /p2p/transfers            — atomically debit sender / credit recipient; posts a payment bubble in chat
 * POST /p2p/requests             — create a money request; posts a request bubble in chat
 * POST /p2p/requests/:id/decline — payer declines a pending request
 *
 * Reuses the exact same protections as outbound remittance:
 * lockout, PIN, KYC cap, per-tx cap, rolling 24h cap (combined with remittance volume), fee settings.
 */
import { Router, type IRouter } from "express";
import { eq, and, gte, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { StreamChat } from "stream-chat";
import {
  db, walletsTable, usersTable, exchangeRatesTable, settingsTable,
  p2pTransfersTable, moneyRequestsTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/auth";
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

async function computeFee(fromAmount: number, fallbackFeePercent: string): Promise<number> {
  const allFeeRows = await db.select().from(settingsTable);
  const feeMap: Record<string, string> = {};
  for (const r of allFeeRows) feeMap[r.key] = r.value;
  const feeMode = feeMap["fee_mode"] || "percent";
  if (feeMode === "fixed") {
    const fixedVal = feeMap["send_fee_fixed"] ? parseFloat(feeMap["send_fee_fixed"]) : 0;
    return isNaN(fixedVal) ? 0 : Math.round(fixedVal * 100) / 100;
  }
  const globalFee = feeMap["send_fee_percent"] ? parseFloat(feeMap["send_fee_percent"]) : NaN;
  const feePercent = !isNaN(globalFee) && globalFee >= 0 ? globalFee : parseFloat(fallbackFeePercent);
  return Math.round(((feePercent / 100) * fromAmount) * 100) / 100;
}

/** Max 2 decimal places — prevents floating-point precision games. */
const money = z.number().positive().finite()
  .refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Amount can have at most 2 decimal places");
const round2 = (v: number) => Math.round(v * 100) / 100;

const TransferBody = z.object({
  toUserId: z.number().int().positive(),
  fromWalletId: z.number().int().positive(),
  // Ignored when paying a request — the server settles against the request's own terms.
  amount: money.optional(),
  note: z.string().max(500).optional(),
  pin: z.string().regex(/^\d{4}$/),
  chatId: z.string().min(1),
  requestId: z.number().int().positive().optional(),
});

router.post("/p2p/transfers", requireAuth, async (req, res): Promise<void> => {
  const parsed = TransferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { toUserId, fromWalletId, note, pin, chatId, requestId } = parsed.data;
  const userId = req.userId!;

  if (!requestId && (parsed.data.amount === undefined || parsed.data.amount <= 0)) {
    res.status(400).json({ error: "Amount is required" });
    return;
  }

  if (toUserId === userId) { res.status(400).json({ error: "You cannot send money to yourself." }); return; }

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
    const { locked, lockedUntil } = await recordFailedAttempt(userId, lockoutThreshold, { reason: "wrong_pin", context: "p2p" });
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

  // 3. Recipient
  const [recipient] = await db.select().from(usersTable).where(eq(usersTable.id, toUserId));
  if (!recipient) { res.status(404).json({ error: "Recipient not found" }); return; }

  // 4. Chat membership authorization (both users must share the channel)
  let channel;
  try {
    channel = await getSharedChannel(chatId, userId, toUserId);
  } catch (e: any) {
    logger.warn({ err: e?.message }, "p2p: stream channel check failed");
    res.status(502).json({ error: "Could not verify chat. Please try again." });
    return;
  }
  if (!channel) { res.status(403).json({ error: "You can only send money inside a chat you share with this person." }); return; }

  // 5. If paying a request, validate it
  let request = null;
  if (requestId) {
    const [r] = await db.select().from(moneyRequestsTable).where(eq(moneyRequestsTable.id, requestId));
    if (!r || r.payerUserId !== userId || r.requesterUserId !== toUserId) {
      res.status(403).json({ error: "This request cannot be paid by you." });
      return;
    }
    if (r.chatId !== chatId) { res.status(403).json({ error: "This request belongs to a different chat." }); return; }
    if (r.status !== "pending") { res.status(409).json({ error: `This request was already ${r.status}.` }); return; }
    request = r;
  }

  // 6. Source wallet
  const [wallet] = await db.select().from(walletsTable)
    .where(and(eq(walletsTable.id, fromWalletId), eq(walletsTable.userId, userId)));
  if (!wallet) { res.status(400).json({ error: "Source wallet not found" }); return; }

  // 7. Rates + server-authoritative amount derivation
  const fromRateRow = await getRateRow(wallet.currencyCode);
  if (!fromRateRow) { res.status(400).json({ error: `Unsupported source currency: ${wallet.currencyCode}` }); return; }
  const fromRateToUsd = parseFloat(fromRateRow.rateToUsd);
  if (!(fromRateToUsd > 0)) { res.status(400).json({ error: `Invalid rate for ${wallet.currencyCode}` }); return; }

  const recipientWallets = await db.select().from(walletsTable).where(eq(walletsTable.userId, toUserId));
  let toWallet: (typeof recipientWallets)[number] | null;
  let toCurrency: string;
  let amount: number;    // debit amount in the sender's wallet currency (fee excluded)
  let toAmount: number;  // credit amount in the destination currency

  if (request) {
    // Settle against the request's own terms — the client-supplied amount is ignored.
    const reqAmount = round2(parseFloat(request.amount));
    const reqCurrency = request.currencyCode;
    const reqRateRow = await getRateRow(reqCurrency);
    if (!reqRateRow) { res.status(400).json({ error: `Unsupported currency: ${reqCurrency}` }); return; }
    const reqRateToUsd = parseFloat(reqRateRow.rateToUsd);
    if (!(reqRateToUsd > 0)) { res.status(400).json({ error: `Invalid rate for ${reqCurrency}` }); return; }

    // Debit: requested amount converted into the payer's wallet currency (rounded up so the requester is never shorted)
    amount = wallet.currencyCode === reqCurrency
      ? reqAmount
      : Math.ceil(reqAmount * (fromRateToUsd / reqRateToUsd) * 100) / 100;

    toWallet = recipientWallets.find(w => w.currencyCode === reqCurrency) ?? null;
    if (toWallet) {
      // Requester has a wallet in the requested currency: credit exactly what they asked for.
      toCurrency = reqCurrency;
      toAmount = reqAmount;
    } else {
      // Otherwise credit their default wallet with the converted equivalent.
      toWallet = recipientWallets[0] ?? null;
      toCurrency = toWallet?.currencyCode ?? "USD";
      const fallbackRateRow = await getRateRow(toCurrency);
      if (!fallbackRateRow) { res.status(400).json({ error: `Unsupported destination currency: ${toCurrency}` }); return; }
      toAmount = round2(reqAmount * (parseFloat(fallbackRateRow.rateToUsd) / reqRateToUsd));
    }
  } else {
    amount = round2(parsed.data.amount!);
    toWallet = recipientWallets.find(w => w.currencyCode === wallet.currencyCode) ?? recipientWallets[0] ?? null;
    toCurrency = toWallet?.currencyCode ?? "USD";
    const toRateRow = await getRateRow(toCurrency);
    if (!toRateRow) { res.status(400).json({ error: `Unsupported destination currency: ${toCurrency}` }); return; }
    toAmount = round2(amount * (parseFloat(toRateRow.rateToUsd) / fromRateToUsd));
  }

  const exchangeRate = amount > 0 ? toAmount / amount : 0;
  const fromAmountUsd = amount / fromRateToUsd;

  // 8. KYC gating
  if ((user.kycStatus === "unverified" || user.kycStatus === "rejected") && fromAmountUsd > 2000) {
    res.status(403).json({
      error: "KYC_REQUIRED",
      message: "Transfers above $2,000 require identity verification. Please complete KYC in your account settings.",
    });
    return;
  }

  // 9. Velocity checks (remittance + p2p combined daily volume)
  const { txCapUsd, dailyCapUsd, lockoutThreshold } = await loadFraudSettings();
  if (fromAmountUsd > txCapUsd) {
    await logFraudEvent(userId, "tx_cap_exceeded", { fromAmountUsd: Math.round(fromAmountUsd * 100) / 100, txCapUsd, currency: wallet.currencyCode, context: "p2p" });
    await recordFailedAttempt(userId, lockoutThreshold, { reason: "tx_cap_exceeded", context: "p2p" });
    res.status(400).json({
      error: "TX_CAP_EXCEEDED",
      message: `Single transfers cannot exceed $${txCapUsd.toLocaleString()} USD equivalent. This transfer is $${Math.round(fromAmountUsd).toLocaleString()} USD.`,
    });
    return;
  }
  const dailySoFar = await getDailyVolumeUsd(userId); // includes P2P volume (see lib/fraud.ts)
  if (dailySoFar + fromAmountUsd > dailyCapUsd) {
    await logFraudEvent(userId, "daily_cap_exceeded", { dailySoFarUsd: Math.round(dailySoFar * 100) / 100, newTxUsd: Math.round(fromAmountUsd * 100) / 100, dailyCapUsd, context: "p2p" });
    await recordFailedAttempt(userId, lockoutThreshold, { reason: "daily_cap_exceeded", context: "p2p" });
    res.status(429).json({
      error: "DAILY_CAP_EXCEEDED",
      message: `You have reached your daily transfer limit of $${dailyCapUsd.toLocaleString()} USD. Your limit resets in 24 hours.`,
      retryAfter: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    return;
  }

  // 10. Fee
  const fee = await computeFee(amount, fromRateRow.feePercent);
  const totalCost = round2(amount + fee);

  // 11. Atomic execution: per-user serialization (row lock) + in-transaction daily-cap re-check
  //     + conditional debit (guards against races/insufficient funds) + credit + record
  let transfer;
  try {
    transfer = await db.transaction(async (tx) => {
      // Serialize concurrent sends by this user so the daily cap cannot be raced.
      await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
      const dailyNow = await getDailyVolumeUsd(userId, tx as any);
      if (dailyNow + fromAmountUsd > dailyCapUsd) throw new Error("DAILY_CAP_EXCEEDED");

      const debited = await tx
        .update(walletsTable)
        .set({ balance: sql`${walletsTable.balance} - ${totalCost}`, updatedAt: new Date() })
        .where(and(
          eq(walletsTable.id, fromWalletId),
          eq(walletsTable.userId, userId),
          gte(walletsTable.balance, String(totalCost)),
        ))
        .returning({ id: walletsTable.id });
      if (debited.length === 0) throw new Error("INSUFFICIENT_BALANCE");

      let destWalletId: number;
      if (toWallet) {
        destWalletId = toWallet.id;
        await tx.update(walletsTable)
          .set({ balance: sql`${walletsTable.balance} + ${toAmount}`, updatedAt: new Date() })
          .where(eq(walletsTable.id, toWallet.id));
      } else {
        const [created] = await tx.insert(walletsTable).values({
          userId: toUserId,
          currencyCode: "USD",
          currencyName: "US Dollar",
          flag: "🇺🇸",
          balance: String(toAmount),
        }).returning();
        destWalletId = created.id;
      }

      const [row] = await tx.insert(p2pTransfersTable).values({
        fromUserId: userId,
        toUserId,
        fromWalletId,
        toWalletId: destWalletId,
        fromCurrency: wallet.currencyCode,
        toCurrency,
        fromAmount: String(amount),
        toAmount: String(toAmount),
        exchangeRate: String(Math.round(exchangeRate * 10000) / 10000),
        fee: String(fee),
        fromAmountUsd: String(Math.round(fromAmountUsd * 10000) / 10000),
        status: "completed",
        note: encryptNullable(note ?? null),
        chatId,
        requestId: requestId ?? null,
      }).returning();

      if (request) {
        const updated = await tx.update(moneyRequestsTable)
          .set({ status: "paid", transferId: row.id, updatedAt: new Date() })
          .where(and(eq(moneyRequestsTable.id, request.id), eq(moneyRequestsTable.status, "pending")))
          .returning({ id: moneyRequestsTable.id });
        if (updated.length === 0) throw new Error("REQUEST_ALREADY_HANDLED");
      }
      return row;
    });
  } catch (e: any) {
    if (e?.message === "INSUFFICIENT_BALANCE") {
      res.status(400).json({ error: "Insufficient balance. Please kindly add transfer fee." });
      return;
    }
    if (e?.message === "REQUEST_ALREADY_HANDLED") {
      res.status(409).json({ error: "This request was already handled." });
      return;
    }
    if (e?.message === "DAILY_CAP_EXCEEDED") {
      await logFraudEvent(userId, "daily_cap_exceeded", { newTxUsd: Math.round(fromAmountUsd * 100) / 100, dailyCapUsd, context: "p2p_tx_recheck" });
      res.status(429).json({
        error: "DAILY_CAP_EXCEEDED",
        message: `You have reached your daily transfer limit of $${dailyCapUsd.toLocaleString()} USD. Your limit resets in 24 hours.`,
        retryAfter: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      return;
    }
    logger.error({ err: e?.message }, "p2p transfer failed");
    res.status(500).json({ error: "Transfer failed. No money was moved." });
    return;
  }

  // 13. Post the payment bubble in chat (non-fatal if it fails — money already moved)
  try {
    await channel.sendMessage({
      text: `💸 Sent ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${wallet.currencyCode}`,
      user_id: String(userId),
      attachments: [{
        type: "nanivio_payment",
        transfer_id: transfer.id,
        amount,
        currency: wallet.currencyCode,
        to_amount: toAmount,
        to_currency: toCurrency,
        note: note ?? null,
        status: "completed",
        from_user_id: String(userId),
        to_user_id: String(toUserId),
        from_name: user.name,
        to_name: recipient.name,
      } as any],
    });
    // Update the request bubble status so both sides see it flip to "paid"
    if (request?.messageId) {
      const client = getStreamClient();
      const r = await client.getMessage(request.messageId).catch(() => null);
      const msg = r?.message;
      if (msg) {
        const atts = (msg.attachments ?? []).map((a: any) =>
          a.type === "nanivio_payment_request" && a.request_id === request!.id ? { ...a, status: "paid" } : a);
        await client.partialUpdateMessage(request.messageId, { set: { attachments: atts } } as any, String(userId));
      }
    }
  } catch (e: any) {
    logger.warn({ err: e?.message }, "p2p: failed to post chat message after transfer");
  }

  res.status(201).json({
    id: transfer.id,
    fromAmount: amount,
    fromCurrency: wallet.currencyCode,
    toAmount,
    toCurrency,
    fee,
    status: "completed",
    recipientName: recipient.name,
  });
});

const RequestBody = z.object({
  fromUserId: z.number().int().positive(), // who should pay
  chatId: z.string().min(1),
  amount: money,
  currencyCode: z.string().min(2).max(6),
  note: z.string().max(500).optional(),
});

router.post("/p2p/requests", requireAuth, async (req, res): Promise<void> => {
  const parsed = RequestBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { fromUserId, chatId, amount, currencyCode, note } = parsed.data;
  const userId = req.userId!;

  if (fromUserId === userId) { res.status(400).json({ error: "You cannot request money from yourself." }); return; }

  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const [payer] = await db.select().from(usersTable).where(eq(usersTable.id, fromUserId));
  if (!me || !payer) { res.status(404).json({ error: "User not found" }); return; }

  const rateRow = await getRateRow(currencyCode);
  if (!rateRow) { res.status(400).json({ error: `Unsupported currency: ${currencyCode}` }); return; }

  let channel;
  try {
    channel = await getSharedChannel(chatId, userId, fromUserId);
  } catch {
    res.status(502).json({ error: "Could not verify chat. Please try again." });
    return;
  }
  if (!channel) { res.status(403).json({ error: "You can only request money inside a chat you share with this person." }); return; }

  const [request] = await db.insert(moneyRequestsTable).values({
    requesterUserId: userId,
    payerUserId: fromUserId,
    chatId,
    amount: String(amount),
    currencyCode,
    note: encryptNullable(note ?? null),
    status: "pending",
  }).returning();

  // Post the request bubble as the requester
  try {
    const sent = await channel.sendMessage({
      text: `🙏 Requested ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${currencyCode}`,
      user_id: String(userId),
      attachments: [{
        type: "nanivio_payment_request",
        request_id: request.id,
        amount,
        currency: currencyCode,
        note: note ?? null,
        status: "pending",
        requester_user_id: String(userId),
        payer_user_id: String(fromUserId),
        requester_name: me.name,
        payer_name: payer.name,
      } as any],
    });
    await db.update(moneyRequestsTable)
      .set({ messageId: sent.message.id, updatedAt: new Date() })
      .where(eq(moneyRequestsTable.id, request.id));
  } catch (e: any) {
    // Roll back the request if the bubble could not be posted — otherwise it is invisible
    await db.delete(moneyRequestsTable).where(eq(moneyRequestsTable.id, request.id));
    logger.warn({ err: e?.message }, "p2p: failed to post request message");
    res.status(502).json({ error: "Could not send the request message. Please try again." });
    return;
  }

  res.status(201).json({ id: request.id, amount, currencyCode, status: "pending" });
});

router.post("/p2p/requests/:id/decline", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid request id" }); return; }
  const userId = req.userId!;

  const [request] = await db.select().from(moneyRequestsTable).where(eq(moneyRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }
  if (request.payerUserId !== userId) { res.status(403).json({ error: "Only the requested person can decline." }); return; }
  if (request.status !== "pending") { res.status(409).json({ error: `This request was already ${request.status}.` }); return; }

  const updated = await db.update(moneyRequestsTable)
    .set({ status: "declined", updatedAt: new Date() })
    .where(and(eq(moneyRequestsTable.id, id), eq(moneyRequestsTable.status, "pending")))
    .returning({ id: moneyRequestsTable.id });
  if (updated.length === 0) { res.status(409).json({ error: "This request was already handled." }); return; }

  // Flip the bubble to "declined" for both sides
  try {
    if (request.messageId) {
      const client = getStreamClient();
      const r = await client.getMessage(request.messageId);
      const msg = r?.message;
      if (msg) {
        const atts = (msg.attachments ?? []).map((a: any) =>
          a.type === "nanivio_payment_request" && a.request_id === id ? { ...a, status: "declined" } : a);
        await client.partialUpdateMessage(request.messageId, { set: { attachments: atts } } as any, String(userId));
      }
    }
  } catch (e: any) {
    logger.warn({ err: e?.message }, "p2p: failed to update declined request message");
  }

  res.json({ id, status: "declined" });
});

export default router;
