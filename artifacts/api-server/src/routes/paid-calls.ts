/**
 * Paid per-minute expert calls.
 *
 * GET   /paid-calls/settings          — own paid-call settings
 * PATCH /paid-calls/settings          — update own settings (enable, rate, currency)
 * GET   /paid-calls/rate/:userId      — another user's paid-call rate + how many
 *                                       minutes the requester can afford
 * POST  /paid-calls/sessions          — caller starts a billing session when a
 *                                       paid call connects (server is the billing
 *                                       source of truth)
 * POST  /paid-calls/sessions/:id/heartbeat — keep-alive; returns accrued cost and
 *                                       remaining affordable minutes
 * POST  /paid-calls/sessions/:id/end  — settle the session: one atomic transfer
 *                                       caller → expert minus platform fee, recorded
 *                                       as a p2p_transfers row so it shows in both
 *                                       users' transaction history AND counts toward
 *                                       the caller's rolling 24h velocity cap.
 *
 * A sweep settles sessions whose heartbeat went stale (client crashed / tab
 * closed) using the last heartbeat as the effective end time.
 *
 * Free calls between normal users never touch any of this.
 */
import { Router, type IRouter } from "express";
import { eq, and, sql, lte } from "drizzle-orm";
import { z } from "zod";
import { StreamChat } from "stream-chat";
import {
  db, usersTable, walletsTable, exchangeRatesTable, settingsTable,
  callSessionsTable, p2pTransfersTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/auth";
import { encryptNullable } from "../lib/encryption";
import { loadFraudSettings, getDailyVolumeUsd, logFraudEvent } from "../lib/fraud";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const round2 = (n: number) => Math.round(n * 100) / 100;

const ALLOWED_RATE_CURRENCIES = new Set(["USD", "AED", "EUR", "GBP", "INR", "PHP", "NGN", "KES", "GHS", "PKR", "BDT"]);

function getStreamClient() {
  const key = process.env.STREAM_API_KEY;
  const secret = process.env.STREAM_API_SECRET;
  if (!key || !secret) throw new Error("Stream credentials not configured");
  return StreamChat.getInstance(key, secret);
}

/** Both users must be members of the messaging channel (same gate as calls/escrow). */
async function isSharedChannel(chatId: string, meId: number, otherId: number): Promise<boolean> {
  try {
    const client = getStreamClient();
    const channels = await client.queryChannels(
      { type: "messaging", id: chatId, members: { $in: [String(meId)] } } as any,
      {},
      { limit: 1 },
    );
    const ch = channels[0];
    if (!ch) return false;
    return Object.keys(ch.state?.members ?? {}).includes(String(otherId));
  } catch {
    return false;
  }
}

async function getRateToUsd(currencyCode: string): Promise<number | null> {
  const [row] = await db.select().from(exchangeRatesTable)
    .where(eq(exchangeRatesTable.currencyCode, currencyCode));
  const r = row ? parseFloat(row.rateToUsd) : NaN;
  return r > 0 ? r : null;
}

async function getPaidCallFeePercent(): Promise<number> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "paid_call_fee_percent"));
  const v = row ? parseFloat(row.value) : NaN;
  return !isNaN(v) && v >= 0 && v < 100 ? v : 10;
}

/**
 * Pick the wallet settlement will debit: wallet in the rate currency with a
 * positive balance, else the largest wallet. Affordability MUST be computed
 * from this same wallet, or we'd advertise minutes we cannot actually charge.
 */
function pickSourceWallet<T extends { currencyCode: string; balance: string }>(wallets: T[], rateCurrency: string): T | null {
  return (
    wallets.find(w => w.currencyCode === rateCurrency && parseFloat(w.balance) > 0) ??
    wallets.slice().sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance))[0] ??
    null
  );
}

/**
 * How many whole minutes the user can afford, bounded by BOTH:
 *  - the single wallet settlement will actually debit, and
 *  - the caller's velocity headroom (rolling 24h daily cap, per-tx cap, and the
 *    $2k KYC gate for unverified users) — paid calls are outbound money movement
 *    and must not become a bypass of the fraud stack.
 */
async function affordableMinutes(userId: number, ratePerMinute: number, rateCurrency: string): Promise<number> {
  if (!(ratePerMinute > 0)) return 0;
  const rateCcyToUsd = await getRateToUsd(rateCurrency);
  if (!rateCcyToUsd) return 0;

  const wallets = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
  const source = pickSourceWallet(wallets, rateCurrency);
  if (!source) return 0;
  let balanceInRateCcy: number;
  if (source.currencyCode === rateCurrency) {
    balanceInRateCcy = parseFloat(source.balance);
  } else {
    const srcToUsd = await getRateToUsd(source.currencyCode);
    if (!srcToUsd) return 0;
    balanceInRateCcy = (parseFloat(source.balance) / srcToUsd) * rateCcyToUsd;
  }

  const [{ txCapUsd, dailyCapUsd }, dailySoFar, [user]] = await Promise.all([
    loadFraudSettings(),
    getDailyVolumeUsd(userId),
    db.select({ kycStatus: usersTable.kycStatus }).from(usersTable).where(eq(usersTable.id, userId)),
  ]);
  let capUsd = Math.min(txCapUsd, Math.max(0, dailyCapUsd - dailySoFar));
  if (user && (user.kycStatus === "unverified" || user.kycStatus === "rejected")) {
    capUsd = Math.min(capUsd, 2000);
  }
  const capInRateCcy = capUsd * rateCcyToUsd;

  return Math.floor(Math.min(balanceInRateCcy, capInRateCcy) / ratePerMinute);
}

/* ───────────── own settings ───────────── */
router.get("/paid-calls/settings", requireAuth, async (req: any, res): Promise<void> => {
  const [u] = await db.select({
    enabled: usersTable.paidCallsEnabled,
    rate: usersTable.paidCallRate,
    currency: usersTable.paidCallCurrency,
  }).from(usersTable).where(eq(usersTable.id, req.userId));
  if (!u) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ enabled: u.enabled, ratePerMinute: u.rate ? parseFloat(u.rate) : null, currency: u.currency ?? "USD" });
});

const SettingsBody = z.object({
  enabled: z.boolean(),
  ratePerMinute: z.number().positive().max(1000).optional(),
  currency: z.string().optional(),
});

router.patch("/paid-calls/settings", requireAuth, async (req: any, res): Promise<void> => {
  const body = SettingsBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid settings" }); return; }
  const { enabled, ratePerMinute, currency } = body.data;
  if (enabled) {
    if (!(ratePerMinute && ratePerMinute > 0)) {
      res.status(400).json({ error: "Set a per-minute rate to enable paid calls" });
      return;
    }
    const ccy = (currency ?? "USD").toUpperCase();
    if (!ALLOWED_RATE_CURRENCIES.has(ccy)) { res.status(400).json({ error: "Unsupported rate currency" }); return; }
    if (!(await getRateToUsd(ccy))) { res.status(400).json({ error: "Unsupported rate currency" }); return; }
    await db.update(usersTable).set({
      paidCallsEnabled: true,
      paidCallRate: String(round2(ratePerMinute)),
      paidCallCurrency: ccy,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, req.userId));
  } else {
    await db.update(usersTable).set({ paidCallsEnabled: false, updatedAt: new Date() })
      .where(eq(usersTable.id, req.userId));
  }
  res.json({ ok: true });
});

/* ───────────── rate check before calling ───────────── */
router.get("/paid-calls/rate/:userId", requireAuth, async (req: any, res): Promise<void> => {
  const targetId = parseInt(req.params.userId, 10);
  if (isNaN(targetId)) { res.status(400).json({ error: "Invalid user id" }); return; }
  const [u] = await db.select({
    enabled: usersTable.paidCallsEnabled,
    rate: usersTable.paidCallRate,
    currency: usersTable.paidCallCurrency,
    name: usersTable.name,
  }).from(usersTable).where(eq(usersTable.id, targetId));
  if (!u) { res.status(404).json({ error: "User not found" }); return; }
  const rate = u.enabled && u.rate ? parseFloat(u.rate) : null;
  if (!u.enabled || !rate || targetId === req.userId) {
    res.json({ enabled: false });
    return;
  }
  const currency = u.currency ?? "USD";
  const minutes = await affordableMinutes(req.userId, rate, currency);
  res.json({ enabled: true, ratePerMinute: rate, currency, affordableMinutes: minutes, expertName: u.name });
});

/* ───────────── session lifecycle ───────────── */
const CreateSessionBody = z.object({
  expertUserId: z.number().int().positive(),
  chatId: z.string().min(1).max(64),
  channel: z.string().min(1).max(64),
  kind: z.enum(["audio", "video"]).default("video"),
  // The exact rate the caller confirmed in the pre-call dialog. Billing must
  // never start at a different price than the one consented to.
  confirmedRate: z.number().positive(),
  confirmedCurrency: z.string().min(3).max(3),
});

router.post("/paid-calls/sessions", requireAuth, async (req: any, res): Promise<void> => {
  const body = CreateSessionBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const { expertUserId, chatId, channel, kind, confirmedRate, confirmedCurrency } = body.data;
  if (expertUserId === req.userId) { res.status(400).json({ error: "You cannot bill yourself" }); return; }

  const [expert] = await db.select({
    enabled: usersTable.paidCallsEnabled,
    rate: usersTable.paidCallRate,
    currency: usersTable.paidCallCurrency,
  }).from(usersTable).where(eq(usersTable.id, expertUserId));
  const rate = expert?.enabled && expert.rate ? parseFloat(expert.rate) : null;
  if (!rate) { res.status(400).json({ error: "This user does not have paid calls enabled" }); return; }
  const currency = expert!.currency ?? "USD";

  // Quote binding: the session bills at the price the caller explicitly
  // confirmed. If the expert changed their rate/currency between the caller's
  // confirmation and the callee answering, reject — the client must re-confirm.
  if (Math.abs(rate - confirmedRate) > 1e-9 || currency !== confirmedCurrency) {
    res.status(409).json({
      error: "rate_changed",
      message: "The expert's rate changed since you confirmed. Please start the call again.",
      ratePerMinute: rate,
      currency,
    });
    return;
  }

  // Same call-channel binding as the Agora token/signal routes: the channel
  // must be derived from the shared chat, so a session can only describe a
  // call that the token route would authorize.
  if (!(channel === `nanivio-${chatId}` || channel.startsWith(`nanivio-${chatId}-`))) {
    res.status(400).json({ error: "Invalid channel" });
    return;
  }
  if (!(await isSharedChannel(chatId, req.userId, expertUserId))) {
    res.status(403).json({ error: "You can only call people you chat with" });
    return;
  }

  // Paid calls are outbound money movement — respect the send lockout.
  const [caller] = await db.select({ sendLockedUntil: usersTable.sendLockedUntil })
    .from(usersTable).where(eq(usersTable.id, req.userId));
  if (caller?.sendLockedUntil && new Date(caller.sendLockedUntil) > new Date()) {
    res.status(429).json({ error: "Your account is temporarily locked. Please try again later." });
    return;
  }

  // affordableMinutes is bounded by balance AND velocity caps (daily/tx/KYC),
  // and the heartbeat re-applies the same bound so the call auto-ends before
  // the caller's remaining cap headroom is exceeded.
  const minutes = await affordableMinutes(req.userId, rate, currency);
  if (minutes < 1) { res.status(400).json({ error: "Insufficient balance for a paid call" }); return; }

  // One active session per caller — enforced by a partial unique index so
  // concurrent creates cannot stack bills.
  let session;
  try {
    [session] = await db.insert(callSessionsTable).values({
      callerUserId: req.userId,
      expertUserId,
      chatId,
      channel,
      kind,
      ratePerMinute: String(rate),
      currencyCode: currency,
    }).returning();
  } catch (e: any) {
    // drizzle wraps the pg error — walk the cause chain for the unique violation
    const isUniqueViolation = (err: any): boolean => {
      for (let cur = err; cur; cur = cur.cause) {
        if (cur.code === "23505" || String(cur.constraint ?? "").includes("uniq_call_sessions_active_caller")
          || String(cur.message ?? "").includes("uniq_call_sessions_active_caller")) return true;
      }
      return false;
    };
    if (isUniqueViolation(e)) {
      res.status(409).json({ error: "You already have an active paid call" });
      return;
    }
    throw e;
  }

  res.status(201).json({
    sessionId: session.id,
    ratePerMinute: rate,
    currency,
    affordableMinutes: minutes,
    startedAt: session.startedAt.toISOString(),
  });
});

/** Accrued whole started minutes for a session given an effective end time. */
function startedMinutes(startedAt: Date, effectiveEnd: Date): number {
  const secs = Math.max(0, (effectiveEnd.getTime() - startedAt.getTime()) / 1000);
  return Math.max(1, Math.ceil(secs / 60));
}

router.post("/paid-calls/sessions/:id/heartbeat", requireAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid session" }); return; }
  const [session] = await db.select().from(callSessionsTable)
    .where(and(eq(callSessionsTable.id, id), eq(callSessionsTable.callerUserId, req.userId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (session.status !== "active") { res.json({ status: session.status }); return; }

  await db.update(callSessionsTable).set({ lastHeartbeatAt: new Date(), updatedAt: new Date() })
    .where(eq(callSessionsTable.id, id));

  const rate = parseFloat(session.ratePerMinute);
  const minutes = startedMinutes(session.startedAt, new Date());
  const accrued = round2(minutes * rate);
  const affordable = await affordableMinutes(req.userId, rate, session.currencyCode);
  res.json({
    status: "active",
    minutes,
    accruedCost: accrued,
    currency: session.currencyCode,
    remainingMinutes: Math.max(0, affordable - minutes),
  });
});

/**
 * Settle a session exactly once. `effectiveEnd` caps the billing window (for the
 * stale sweep it is the last heartbeat + grace, not "now").
 */
async function settleSession(sessionId: number, endReason: string, effectiveEnd: Date): Promise<
  { ok: true; billedMinutes: number; totalCharged: number; currency: string; expertReceived: number }
  | { ok: false; error: string; status?: number }
> {
  const feePercent = await getPaidCallFeePercent();
  try {
    return await db.transaction(async (tx) => {
      // Claim the session (exactly-once settlement guard)
      const claimed = await tx.update(callSessionsTable)
        .set({ status: "settled", endedAt: effectiveEnd, endReason, updatedAt: new Date() })
        .where(and(eq(callSessionsTable.id, sessionId), eq(callSessionsTable.status, "active")))
        .returning();
      const session = claimed[0];
      if (!session) throw new Error("ALREADY_SETTLED");

      const rate = parseFloat(session.ratePerMinute);
      const minutes = startedMinutes(session.startedAt, effectiveEnd);
      const total = round2(minutes * rate);
      const currency = session.currencyCode;

      // Note: velocity caps are enforced at session CREATION and continuously via
      // the heartbeat (remainingMinutes shrinks with cap headroom, auto-ending the
      // call). Settlement itself is never blocked by the cap — the service was
      // already rendered — but it writes a p2p_transfers row, so the charged
      // volume counts toward the caller's rolling 24h cap for everything after.

      // Serialize the caller's outbound money movement (same lock as p2p/escrow)
      await tx.execute(sql`SELECT id FROM users WHERE id = ${session.callerUserId} FOR UPDATE`);

      const rateCcyToUsd = await getRateToUsd(currency);
      if (!rateCcyToUsd) throw new Error("RATE_UNAVAILABLE");

      // Debit the caller: prefer wallet in rate currency, else largest wallet, converting.
      const wallets = await tx.select().from(walletsTable).where(eq(walletsTable.userId, session.callerUserId));
      const source =
        wallets.find(w => w.currencyCode === currency && parseFloat(w.balance) > 0) ??
        wallets.slice().sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance))[0];
      if (!source) throw new Error("NO_WALLET");

      let costInSource: number;
      if (source.currencyCode === currency) {
        costInSource = total;
      } else {
        const srcToUsd = await getRateToUsd(source.currencyCode);
        if (!srcToUsd) throw new Error("RATE_UNAVAILABLE");
        costInSource = round2(total * (srcToUsd / rateCcyToUsd));
      }
      // Clamp to available balance — the caller's connection may have outlived
      // their money; we charge what exists rather than going negative.
      const available = round2(parseFloat(source.balance));
      const chargedInSource = Math.min(costInSource, Math.max(0, available));
      const chargedFraction = costInSource > 0 ? chargedInSource / costInSource : 0;
      const chargedTotal = round2(total * chargedFraction); // in rate currency

      if (chargedInSource > 0) {
        const debited = await tx.update(walletsTable)
          .set({ balance: sql`${walletsTable.balance} - ${chargedInSource}`, updatedAt: new Date() })
          .where(and(
            eq(walletsTable.id, source.id),
            sql`${walletsTable.balance} >= ${chargedInSource}`,
          ))
          .returning({ id: walletsTable.id });
        if (debited.length === 0) throw new Error("BALANCE_RACE");
      }

      const fee = round2(chargedTotal * (feePercent / 100));
      const net = round2(chargedTotal - fee);

      // Credit the expert (wallet in rate currency, else first wallet converted, else new USD wallet)
      let toWalletId: number;
      let toAmount = 0;
      let toCurrency = currency;
      if (net > 0) {
        const expertWallets = await tx.select().from(walletsTable).where(eq(walletsTable.userId, session.expertUserId));
        const target = expertWallets.find(w => w.currencyCode === currency) ?? expertWallets[0] ?? null;
        if (target) {
          toCurrency = target.currencyCode;
          if (toCurrency === currency) {
            toAmount = net;
          } else {
            const tgtToUsd = await getRateToUsd(toCurrency);
            if (!tgtToUsd) throw new Error("RATE_UNAVAILABLE");
            toAmount = round2(net * (tgtToUsd / rateCcyToUsd));
          }
          await tx.update(walletsTable)
            .set({ balance: sql`${walletsTable.balance} + ${toAmount}`, updatedAt: new Date() })
            .where(eq(walletsTable.id, target.id));
          toWalletId = target.id;
        } else {
          toCurrency = "USD";
          toAmount = round2(net / rateCcyToUsd);
          const [created] = await tx.insert(walletsTable).values({
            userId: session.expertUserId,
            currencyCode: "USD",
            currencyName: "US Dollar",
            flag: "🇺🇸",
            balance: String(toAmount),
          }).returning();
          toWalletId = created.id;
        }
      } else {
        toWalletId = source.id; // placeholder; no transfer row is written when nothing was charged
      }

      let transferId: number | null = null;
      if (chargedInSource > 0) {
        const chargedUsd = round2(chargedTotal / rateCcyToUsd);
        const [transfer] = await tx.insert(p2pTransfersTable).values({
          fromUserId: session.callerUserId,
          toUserId: session.expertUserId,
          fromWalletId: source.id,
          toWalletId,
          fromCurrency: source.currencyCode,
          toCurrency,
          fromAmount: String(chargedInSource),
          toAmount: String(toAmount),
          exchangeRate: String(chargedInSource > 0 ? Math.round((toAmount / chargedInSource) * 10000) / 10000 : 1),
          fee: String(fee),
          fromAmountUsd: String(Math.round(chargedUsd * 10000) / 10000),
          status: "completed",
          note: encryptNullable(`Paid ${session.kind} call · ${minutes} min @ ${parseFloat(session.ratePerMinute)} ${currency}/min`),
          chatId: session.chatId,
        }).returning({ id: p2pTransfersTable.id });
        transferId = transfer.id;
      }

      await tx.update(callSessionsTable).set({
        billedMinutes: minutes,
        totalAmount: String(chargedTotal),
        feeAmount: String(fee),
        settlementTransferId: transferId,
        updatedAt: new Date(),
      }).where(eq(callSessionsTable.id, sessionId));

      return { ok: true as const, billedMinutes: minutes, totalCharged: chargedTotal, currency, expertReceived: toAmount };
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (msg === "ALREADY_SETTLED") return { ok: false, error: "This call was already settled", status: 409 };
    if (msg === "BALANCE_RACE") {
      // Balance changed between read and debit — retryable; keep session active? It
      // was already claimed inside the aborted tx, so the whole tx rolled back and
      // the session stays active for a retry.
      return { ok: false, error: "Balance changed during settlement — please retry", status: 409 };
    }
    logger.error({ err: msg, sessionId }, "paid-call settlement failed");
    // Mark failed so the sweep doesn't retry forever; money was not moved (tx rolled back).
    await db.update(callSessionsTable)
      .set({ status: "failed", endedAt: effectiveEnd, endReason: `settlement_error:${msg}`.slice(0, 200), updatedAt: new Date() })
      .where(and(eq(callSessionsTable.id, sessionId), eq(callSessionsTable.status, "active")))
      .catch(() => {});
    return { ok: false, error: "Settlement failed", status: 500 };
  }
}

router.post("/paid-calls/sessions/:id/end", requireAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid session" }); return; }
  const [session] = await db.select().from(callSessionsTable).where(eq(callSessionsTable.id, id));
  if (!session || (session.callerUserId !== req.userId && session.expertUserId !== req.userId)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (session.status !== "active") {
    res.json({
      status: session.status,
      billedMinutes: session.billedMinutes,
      totalCharged: session.totalAmount ? parseFloat(session.totalAmount) : null,
      currency: session.currencyCode,
    });
    return;
  }
  const reason = req.body?.reason === "balance_exhausted" ? "balance_exhausted" : "ended";
  const result = await settleSession(id, reason, new Date());
  if (!result.ok) { res.status(result.status ?? 500).json({ error: result.error }); return; }
  res.json({ status: "settled", ...result });
});

/* ───────────── stale-session sweep ───────────── */
const STALE_AFTER_MS = 2 * 60 * 1000; // no heartbeat for 2 min → settle at last heartbeat

export async function sweepStaleCallSessions(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS);
    const stale = await db.select({ id: callSessionsTable.id, lastHeartbeatAt: callSessionsTable.lastHeartbeatAt })
      .from(callSessionsTable)
      .where(and(eq(callSessionsTable.status, "active"), lte(callSessionsTable.lastHeartbeatAt, cutoff)));
    for (const s of stale) {
      const result = await settleSession(s.id, "stale_sweep", s.lastHeartbeatAt);
      logger.info({ sessionId: s.id, result }, "paid-call stale sweep settled session");
    }
  } catch (e: any) {
    logger.warn({ err: e?.message }, "paid-call stale sweep failed");
  }
}

setTimeout(() => {
  void sweepStaleCallSessions();
  setInterval(() => void sweepStaleCallSessions(), 60_000);
}, 20_000);

export default router;
