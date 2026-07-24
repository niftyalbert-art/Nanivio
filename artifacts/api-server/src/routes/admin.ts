import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, sql } from "drizzle-orm";
import { db, depositsTable, withdrawalsTable, walletsTable, paymentMethodsTable, exchangeRatesTable } from "@workspace/db";

const router: IRouter = Router();

// ── Simple admin auth ─────────────────────────────────────────────────────
const ADMIN_KEY = "niviopay2024";
function adminOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ── Deposits ──────────────────────────────────────────────────────────────

// Approve deposit → credit wallet
router.put("/admin/deposits/:id/approve", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deposit] = await db.select().from(depositsTable).where(eq(depositsTable.id, id));
  if (!deposit) { res.status(404).json({ error: "Deposit not found" }); return; }
  if (deposit.status !== "pending") { res.status(400).json({ error: "Already processed" }); return; }

  // Credit wallet
  await db.update(walletsTable)
    .set({ balance: sql`${walletsTable.balance} + ${parseFloat(deposit.amount)}`, updatedAt: new Date() })
    .where(eq(walletsTable.id, deposit.walletId));

  const [updated] = await db.update(depositsTable)
    .set({ status: "approved", adminNoteInternal: req.body?.adminNote || null, processedAt: new Date() })
    .where(eq(depositsTable.id, id))
    .returning();

  res.json({ ...updated, amount: parseFloat(updated.amount) });
});

// Reject deposit
router.put("/admin/deposits/:id/reject", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deposit] = await db.select().from(depositsTable).where(eq(depositsTable.id, id));
  if (!deposit) { res.status(404).json({ error: "Deposit not found" }); return; }
  if (deposit.status !== "pending") { res.status(400).json({ error: "Already processed" }); return; }

  const [updated] = await db.update(depositsTable)
    .set({ status: "rejected", adminNoteInternal: req.body?.adminNote || null, processedAt: new Date() })
    .where(eq(depositsTable.id, id))
    .returning();

  res.json({ ...updated, amount: parseFloat(updated.amount) });
});

// ── Withdrawals ───────────────────────────────────────────────────────────

// Mark withdrawal as sent
router.put("/admin/withdrawals/:id/sent", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [withdrawal] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id));
  if (!withdrawal) { res.status(404).json({ error: "Withdrawal not found" }); return; }
  if (withdrawal.status !== "pending") { res.status(400).json({ error: "Already processed" }); return; }

  const { adminReceiptImage, adminNote } = req.body ?? {};

  const [updated] = await db.update(withdrawalsTable)
    .set({
      status: "sent",
      adminReceiptImage: adminReceiptImage || null,
      adminNoteInternal: adminNote || null,
      processedAt: new Date(),
    })
    .where(eq(withdrawalsTable.id, id))
    .returning();

  res.json({ ...updated, amount: parseFloat(updated.amount) });
});

// Reject withdrawal → refund wallet
router.put("/admin/withdrawals/:id/reject", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [withdrawal] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id));
  if (!withdrawal) { res.status(404).json({ error: "Withdrawal not found" }); return; }
  if (withdrawal.status !== "pending") { res.status(400).json({ error: "Already processed" }); return; }

  // Refund wallet
  await db.update(walletsTable)
    .set({ balance: sql`${walletsTable.balance} + ${parseFloat(withdrawal.amount)}`, updatedAt: new Date() })
    .where(eq(walletsTable.id, withdrawal.walletId));

  const [updated] = await db.update(withdrawalsTable)
    .set({ status: "rejected", adminNoteInternal: req.body?.adminNote || null, processedAt: new Date() })
    .where(eq(withdrawalsTable.id, id))
    .returning();

  res.json({ ...updated, amount: parseFloat(updated.amount) });
});

// ── Payment Methods admin CRUD ────────────────────────────────────────────

// Get ALL (including inactive)
router.get("/payment-methods/all", adminOnly, async (req, res): Promise<void> => {
  const methods = await db.select().from(paymentMethodsTable).orderBy(paymentMethodsTable.id);
  res.json(methods);
});

// Create
router.post("/admin/payment-methods", adminOnly, async (req, res): Promise<void> => {
  const { type, name, accountNumber, accountName, instructions, logoEmoji, isActive } = req.body ?? {};
  if (!type || !name || !accountNumber || !accountName || !instructions) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }
  const [method] = await db.insert(paymentMethodsTable).values({
    type, name, accountNumber, accountName, instructions,
    logoEmoji: logoEmoji || "💳",
    isActive: isActive !== undefined ? Boolean(isActive) : true,
  }).returning();
  res.status(201).json(method);
});

// Update
router.put("/admin/payment-methods/:id", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { type, name, accountNumber, accountName, instructions, logoEmoji, isActive } = req.body ?? {};
  const updates: Record<string, any> = {};
  if (type !== undefined) updates.type = type;
  if (name !== undefined) updates.name = name;
  if (accountNumber !== undefined) updates.accountNumber = accountNumber;
  if (accountName !== undefined) updates.accountName = accountName;
  if (instructions !== undefined) updates.instructions = instructions;
  if (logoEmoji !== undefined) updates.logoEmoji = logoEmoji;
  if (isActive !== undefined) updates.isActive = Boolean(isActive);

  const [updated] = await db.update(paymentMethodsTable).set(updates).where(eq(paymentMethodsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// ── Exchange Rates admin CRUD ─────────────────────────────────────────────────

// List all rates
router.get("/admin/rates", adminOnly, async (req, res): Promise<void> => {
  const rows = await db.select().from(exchangeRatesTable).orderBy(exchangeRatesTable.currencyCode);
  res.json(rows.map(r => ({
    ...r,
    rateToUsd: parseFloat(r.rateToUsd),
    feePercent: parseFloat(r.feePercent),
  })));
});

// Update a rate
router.put("/admin/rates/:code", adminOnly, async (req, res): Promise<void> => {
  const code = (req.params.code as string).toUpperCase();
  const { rateToUsd, feePercent } = req.body ?? {};

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (rateToUsd !== undefined) {
    const v = parseFloat(rateToUsd);
    if (isNaN(v) || v <= 0) { res.status(400).json({ error: "rateToUsd must be a positive number" }); return; }
    updates.rateToUsd = String(v);
  }
  if (feePercent !== undefined) {
    const v = parseFloat(feePercent);
    if (isNaN(v) || v < 0) { res.status(400).json({ error: "feePercent must be >= 0" }); return; }
    updates.feePercent = String(v);
  }

  const [updated] = await db.update(exchangeRatesTable)
    .set(updates)
    .where(eq(exchangeRatesTable.currencyCode, code))
    .returning();

  if (!updated) { res.status(404).json({ error: "Currency not found" }); return; }
  res.json({ ...updated, rateToUsd: parseFloat(updated.rateToUsd), feePercent: parseFloat(updated.feePercent) });
});

// Add new rate
router.post("/admin/rates", adminOnly, async (req, res): Promise<void> => {
  const { currencyCode, rateToUsd, feePercent } = req.body ?? {};
  if (!currencyCode || rateToUsd === undefined) {
    res.status(400).json({ error: "currencyCode and rateToUsd are required" }); return;
  }
  const rate = parseFloat(rateToUsd);
  const fee = parseFloat(feePercent ?? "3");
  if (isNaN(rate) || rate <= 0) { res.status(400).json({ error: "rateToUsd must be positive" }); return; }

  const [row] = await db.insert(exchangeRatesTable).values({
    currencyCode: currencyCode.toUpperCase(),
    rateToUsd: String(rate),
    feePercent: String(fee),
  }).returning();
  res.status(201).json({ ...row, rateToUsd: parseFloat(row.rateToUsd), feePercent: parseFloat(row.feePercent) });
});

export default router;
