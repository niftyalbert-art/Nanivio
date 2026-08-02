/**
 * Crypto Deposit Routes — automatic USDT TRC20 deposit detection.
 *
 * Unlike crypto_payments (outgoing), these are inbound deposits that
 * are automatically matched by the TronGrid monitor service.
 *
 * User routes (requireAuth):
 *   POST /crypto/deposits          — create a deposit request
 *   GET  /crypto/deposits          — list own deposit history
 *   GET  /crypto/deposits/:id      — get one deposit + current status
 *
 * Admin routes (adminOnly — read-only, no approve/reject):
 *   GET  /admin/crypto/deposits    — all deposits with filters
 */

import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, cryptoDepositsTable, walletsTable, usersTable } from "@workspace/db";
import { requireAuth, adminOnly } from "../middleware/auth";

const router: IRouter = Router();

const DEPOSIT_EXPIRY_MINUTES = 60; // 1 hour window for auto-detection

function fmt(d: any) {
  return {
    ...d,
    amount:         d.amount         != null ? parseFloat(d.amount)         : 0,
    receivedAmount: d.receivedAmount != null ? parseFloat(d.receivedAmount) : null,
    createdAt:   d.createdAt   instanceof Date ? d.createdAt.toISOString()   : String(d.createdAt),
    confirmedAt: d.confirmedAt instanceof Date ? d.confirmedAt.toISOString() : (d.confirmedAt ?? null),
    expiresAt:   d.expiresAt   instanceof Date ? d.expiresAt.toISOString()   : (d.expiresAt ?? null),
    updatedAt:   (d.updatedAt  instanceof Date ? d.updatedAt.toISOString()   : null) ?? null,
  };
}

// ── POST /crypto/deposits ─────────────────────────────────────────────────────
router.post("/crypto/deposits", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { amount, walletId, note } = req.body ?? {};

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }
  if (!walletId || isNaN(parseInt(walletId, 10))) {
    res.status(400).json({ error: "walletId is required" }); return;
  }

  // Verify wallet belongs to user
  const [wallet] = await db.select().from(walletsTable)
    .where(and(eq(walletsTable.id, parseInt(walletId, 10)), eq(walletsTable.userId, userId)));
  if (!wallet) { res.status(400).json({ error: "Wallet not found" }); return; }

  // Enforce USD-only: USDT is credited 1:1 as USD — non-USD wallets are rejected
  if (wallet.currencyCode !== "USD") {
    res.status(400).json({
      error: "Crypto deposits can only be credited to a USD wallet. Please select your USD wallet.",
    }); return;
  }

  // Get the business wallet address
  const depositAddress =
    process.env["NANIVIO_CRYPTO_WALLET_ADDRESS"] ??
    (() => {
      // Fallback: look for active crypto payment method
      return null;
    })();

  if (!depositAddress) {
    res.status(503).json({
      error: "Crypto deposits are not configured yet. Please contact support.",
    }); return;
  }

  const expiresAt = new Date(Date.now() + DEPOSIT_EXPIRY_MINUTES * 60 * 1000);

  const [deposit] = await db.insert(cryptoDepositsTable).values({
    userId,
    amount: String(parseFloat(amount)),
    currency: "USDT",
    network: "TRC20",
    depositAddress,
    walletId: parseInt(walletId, 10),
    note: note?.trim() || null,
    status: "waiting",
    expiresAt,
  } as any).returning();

  res.status(201).json(fmt(deposit));
});

// ── GET /crypto/deposits ──────────────────────────────────────────────────────
router.get("/crypto/deposits", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const deposits = await db
    .select()
    .from(cryptoDepositsTable)
    .where(eq(cryptoDepositsTable.userId, userId))
    .orderBy(desc(cryptoDepositsTable.createdAt));

  res.json(deposits.map(fmt));
});

// ── GET /crypto/deposits/:id ──────────────────────────────────────────────────
router.get("/crypto/deposits/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deposit] = await db
    .select()
    .from(cryptoDepositsTable)
    .where(and(eq(cryptoDepositsTable.id, id), eq(cryptoDepositsTable.userId, userId)));

  if (!deposit) { res.status(404).json({ error: "Deposit not found" }); return; }

  // Auto-expire on read if needed
  if (deposit.status === "waiting" && deposit.expiresAt && new Date(deposit.expiresAt as Date) < new Date()) {
    await db.update(cryptoDepositsTable)
      .set({ status: "expired" } as any)
      .where(eq(cryptoDepositsTable.id, id));
    res.json(fmt({ ...deposit, status: "expired" })); return;
  }

  res.json(fmt(deposit));
});

// ── ADMIN: GET /admin/crypto/deposits (read-only) ─────────────────────────────
router.get("/admin/crypto/deposits", adminOnly, async (req, res): Promise<void> => {
  const { status } = req.query as Record<string, string>;

  const deposits = await db
    .select({
      deposit:     cryptoDepositsTable,
      senderName:  usersTable.name,
      senderEmail: usersTable.email,
    })
    .from(cryptoDepositsTable)
    .leftJoin(usersTable, eq(cryptoDepositsTable.userId, usersTable.id))
    .where(status ? eq(cryptoDepositsTable.status, status) : undefined)
    .orderBy(desc(cryptoDepositsTable.createdAt));

  res.json(deposits.map(r => ({
    ...fmt(r.deposit),
    senderName:  r.senderName  ?? "Unknown",
    senderEmail: r.senderEmail ?? "",
  })));
});

export default router;
