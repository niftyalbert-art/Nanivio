/**
 * Crypto Payment Routes — independent module, does not touch existing bank/mobile/card flows.
 *
 * Lifecycle:  waiting_for_payment → confirming → completed | failed | expired
 *
 * User routes:
 *   POST /crypto/payments            — create a payment request
 *   GET  /crypto/payments            — list own payments
 *   GET  /crypto/payments/:id        — get one payment
 *   POST /crypto/payments/:id/paid   — user clicks "I Have Paid" → confirming
 *   POST /crypto/payments/:id/cancel — user cancels a waiting payment
 *
 * Admin routes (adminOnly):
 *   GET  /admin/crypto               — all payments (with filters)
 *   POST /admin/crypto/:id/complete  — mark completed
 *   POST /admin/crypto/:id/fail      — mark failed
 */

import { Router, type IRouter } from "express";
import { eq, desc, and, or } from "drizzle-orm";
import { db, cryptoPaymentsTable, paymentMethodsTable, usersTable } from "@workspace/db";
import { requireAuth, adminOnly } from "../middleware/auth";

const router: IRouter = Router();

// ── Crypto network configuration (extensible — never hard-coded in logic) ─────
export const CRYPTO_NETWORKS: Record<string, {
  symbol: string; networkName: string; requiredConfirmations: number; addressPrefix?: string;
}> = {
  TRC20:  { symbol: "USDT", networkName: "TRON (TRC20)",       requiredConfirmations: 20, addressPrefix: "T" },
  ERC20:  { symbol: "USDT", networkName: "Ethereum (ERC20)",   requiredConfirmations: 12 },
  BEP20:  { symbol: "USDT", networkName: "BNB Smart Chain",    requiredConfirmations: 15 },
  BTC:    { symbol: "BTC",  networkName: "Bitcoin",            requiredConfirmations: 3  },
  ETH:    { symbol: "ETH",  networkName: "Ethereum",           requiredConfirmations: 12 },
  SOL:    { symbol: "SOL",  networkName: "Solana",             requiredConfirmations: 32 },
  MATIC:  { symbol: "MATIC",networkName: "Polygon",            requiredConfirmations: 20 },
};

const PAYMENT_EXPIRY_MINUTES = 30;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(p: any) {
  return {
    ...p,
    amount: p.amount ? parseFloat(p.amount) : 0,
    createdAt:   p.createdAt   instanceof Date ? p.createdAt.toISOString()   : String(p.createdAt),
    updatedAt:   p.updatedAt   instanceof Date ? p.updatedAt.toISOString()   : String(p.updatedAt),
    completedAt: p.completedAt instanceof Date ? p.completedAt.toISOString() : (p.completedAt ?? null),
    expiresAt:   p.expiresAt   instanceof Date ? p.expiresAt.toISOString()   : (p.expiresAt ?? null),
  };
}

// Auto-expire payments that have passed their expiresAt and are still waiting
async function expireStalePayments(userId: number) {
  try {
    const now = new Date();
    await db.execute(
      // Raw SQL because drizzle does not expose < on timestamps cleanly
      `UPDATE crypto_payments SET status = 'expired', updated_at = NOW()
       WHERE sender_id = ${userId} AND status = 'waiting_for_payment'
         AND expires_at IS NOT NULL AND expires_at < NOW()`
    );
  } catch { /* non-fatal */ }
}

// ── POST /crypto/payments ─────────────────────────────────────────────────────
router.post("/crypto/payments", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { amount, currency, network, paymentMethod, senderWalletAddress, walletType, note } = req.body ?? {};

  // Validate required fields
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }
  if (!network || !CRYPTO_NETWORKS[String(network).toUpperCase()]) {
    res.status(400).json({ error: `Unsupported network. Supported: ${Object.keys(CRYPTO_NETWORKS).join(", ")}` }); return;
  }
  if (!paymentMethod || !["wallet_address", "connect_wallet"].includes(paymentMethod)) {
    res.status(400).json({ error: "paymentMethod must be wallet_address or connect_wallet" }); return;
  }
  const networkKey = String(network).toUpperCase();
  const networkConfig = CRYPTO_NETWORKS[networkKey];
  const resolvedCurrency = currency ?? networkConfig.symbol;

  // Resolve Nanivio's receiving wallet address for this network.
  //
  // Priority order:
  //   1. Active payment_methods row whose name/instructions mention this network
  //   2. NANIVIO_CRYPTO_WALLET_ADDRESS env var (used by the deposit monitor)
  //
  // This means the system works out-of-the-box as long as the env var is set,
  // with no manual DB configuration required.
  const allCryptoMethods = await db
    .select()
    .from(paymentMethodsTable)
    .where(and(eq(paymentMethodsTable.type, "crypto"), eq(paymentMethodsTable.isActive, true)));

  const method = allCryptoMethods.find(m =>
    m.name?.toUpperCase().includes(networkKey) ||
    m.instructions?.toUpperCase().includes(networkKey) ||
    m.name?.toUpperCase().includes(resolvedCurrency)
  ) ?? allCryptoMethods[0];

  // Fall back to the treasury wallet env var when no DB method is configured
  const receiverAddress: string | null =
    method?.accountNumber ?? process.env["NANIVIO_CRYPTO_WALLET_ADDRESS"] ?? null;

  if (!receiverAddress) {
    res.status(503).json({
      error: "Crypto payments are not configured yet. Please contact support.",
    }); return;
  }

  const expiresAt = new Date(Date.now() + PAYMENT_EXPIRY_MINUTES * 60 * 1000);

  const [payment] = await db.insert(cryptoPaymentsTable).values({
    senderId: userId,
    receiverAddress,
    senderWalletAddress: senderWalletAddress ?? null,
    walletType: walletType ?? (paymentMethod === "connect_wallet" ? "manual" : null),
    amount: String(parseFloat(amount)),
    currency: resolvedCurrency,
    network: networkKey,
    paymentMethod,
    status: "waiting_for_payment",
    requiredConfirmations: networkConfig.requiredConfirmations,
    note: note ?? null,
    paymentMethodId: method?.id ?? null,
    expiresAt,
  }).returning();

  res.status(201).json(fmt(payment));
});

// ── GET /crypto/payments ──────────────────────────────────────────────────────
router.get("/crypto/payments", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  await expireStalePayments(userId);

  const payments = await db
    .select()
    .from(cryptoPaymentsTable)
    .where(eq(cryptoPaymentsTable.senderId, userId))
    .orderBy(desc(cryptoPaymentsTable.createdAt));

  res.json(payments.map(fmt));
});

// ── GET /crypto/payments/:id ──────────────────────────────────────────────────
router.get("/crypto/payments/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [payment] = await db
    .select()
    .from(cryptoPaymentsTable)
    .where(and(eq(cryptoPaymentsTable.id, id), eq(cryptoPaymentsTable.senderId, userId)));

  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }

  // Auto-expire if needed
  if (payment.status === "waiting_for_payment" && payment.expiresAt && new Date(payment.expiresAt) < new Date()) {
    await db.update(cryptoPaymentsTable)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(cryptoPaymentsTable.id, id));
    res.json(fmt({ ...payment, status: "expired" })); return;
  }

  res.json(fmt(payment));
});

// ── POST /crypto/payments/:id/paid ────────────────────────────────────────────
router.post("/crypto/payments/:id/paid", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { transactionHash } = req.body ?? {};

  const [payment] = await db
    .select()
    .from(cryptoPaymentsTable)
    .where(and(eq(cryptoPaymentsTable.id, id), eq(cryptoPaymentsTable.senderId, userId)));

  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }
  if (payment.status !== "waiting_for_payment") {
    res.status(400).json({ error: `Cannot mark as paid — current status is "${payment.status}"` }); return;
  }
  if (payment.expiresAt && new Date(payment.expiresAt as Date) < new Date()) {
    await db.update(cryptoPaymentsTable).set({ status: "expired", updatedAt: new Date() }).where(eq(cryptoPaymentsTable.id, id));
    res.status(400).json({ error: "This payment has expired. Please create a new one." }); return;
  }

  const [updated] = await db.update(cryptoPaymentsTable)
    .set({
      status: "confirming",
      transactionHash: transactionHash ?? payment.transactionHash,
      updatedAt: new Date(),
    })
    .where(eq(cryptoPaymentsTable.id, id))
    .returning();

  res.json(fmt(updated));
});

// ── POST /crypto/payments/:id/cancel ─────────────────────────────────────────
router.post("/crypto/payments/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [payment] = await db
    .select()
    .from(cryptoPaymentsTable)
    .where(and(eq(cryptoPaymentsTable.id, id), eq(cryptoPaymentsTable.senderId, userId)));

  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }
  if (!["waiting_for_payment", "pending"].includes(payment.status)) {
    res.status(400).json({ error: `Cannot cancel — current status is "${payment.status}"` }); return;
  }

  const [updated] = await db.update(cryptoPaymentsTable)
    .set({ status: "failed", updatedAt: new Date() })
    .where(eq(cryptoPaymentsTable.id, id))
    .returning();

  res.json(fmt(updated));
});

// ── ADMIN: GET /admin/crypto ──────────────────────────────────────────────────
router.get("/admin/crypto", adminOnly, async (req, res): Promise<void> => {
  const { status, network, currency } = req.query as Record<string, string>;

  const conditions: any[] = [];
  if (status)   conditions.push(eq(cryptoPaymentsTable.status,   status));
  if (network)  conditions.push(eq(cryptoPaymentsTable.network,  network.toUpperCase()));
  if (currency) conditions.push(eq(cryptoPaymentsTable.currency, currency.toUpperCase()));

  const payments = await db
    .select({
      payment: cryptoPaymentsTable,
      senderName:  usersTable.name,
      senderEmail: usersTable.email,
    })
    .from(cryptoPaymentsTable)
    .leftJoin(usersTable, eq(cryptoPaymentsTable.senderId, usersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(cryptoPaymentsTable.createdAt));

  res.json(payments.map(r => ({
    ...fmt(r.payment),
    senderName:  r.senderName  ?? "Unknown",
    senderEmail: r.senderEmail ?? "",
  })));
});

// ── ADMIN: POST /admin/crypto/:id/complete ────────────────────────────────────
router.post("/admin/crypto/:id/complete", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { transactionHash, confirmations, adminNote } = req.body ?? {};

  const [payment] = await db.select().from(cryptoPaymentsTable).where(eq(cryptoPaymentsTable.id, id));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }
  if (payment.status === "completed") { res.status(400).json({ error: "Already completed" }); return; }

  const [updated] = await db.update(cryptoPaymentsTable)
    .set({
      status: "completed",
      transactionHash: transactionHash ?? payment.transactionHash,
      confirmations: confirmations ?? payment.requiredConfirmations,
      adminNote: adminNote ?? null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(cryptoPaymentsTable.id, id))
    .returning();

  res.json(fmt(updated));
});

// ── ADMIN: POST /admin/crypto/:id/fail ────────────────────────────────────────
router.post("/admin/crypto/:id/fail", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { adminNote } = req.body ?? {};

  const [payment] = await db.select().from(cryptoPaymentsTable).where(eq(cryptoPaymentsTable.id, id));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }
  if (["completed", "failed"].includes(payment.status)) {
    res.status(400).json({ error: `Cannot fail — status is "${payment.status}"` }); return;
  }

  const [updated] = await db.update(cryptoPaymentsTable)
    .set({ status: "failed", adminNote: adminNote ?? null, updatedAt: new Date() })
    .where(eq(cryptoPaymentsTable.id, id))
    .returning();

  res.json(fmt(updated));
});

export default router;
