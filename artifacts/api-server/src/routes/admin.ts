import { Router, type IRouter } from "express";
import { eq, sql, isNotNull, desc, and } from "drizzle-orm";
import { db, depositsTable, withdrawalsTable, walletsTable, paymentMethodsTable, exchangeRatesTable, usersTable, transactionsTable } from "@workspace/db";
import { adminOnly, signAdminToken } from "../middleware/auth";

const router: IRouter = Router();

// ── Admin login — issues a short-lived JWT (no static key in client code) ─
router.post("/admin/login", async (req, res): Promise<void> => {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    res.status(503).json({ error: "ADMIN_PASSWORD not configured on server" });
    return;
  }
  const { password } = req.body ?? {};
  if (!password || password !== adminPassword) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const token = signAdminToken();
  res.json({ token });
});

// ── Admin list views (all records, not user-scoped) ────────────────────────

router.get("/admin/deposits", adminOnly, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: depositsTable.id,
      userId: depositsTable.userId,
      walletId: depositsTable.walletId,
      paymentMethodId: depositsTable.paymentMethodId,
      amount: depositsTable.amount,
      currencyCode: depositsTable.currencyCode,
      externalTransactionId: depositsTable.externalTransactionId,
      receiptImage: depositsTable.receiptImage,
      status: depositsTable.status,
      note: depositsTable.note,
      adminNoteInternal: depositsTable.adminNoteInternal,
      processedAt: depositsTable.processedAt,
      createdAt: depositsTable.createdAt,
      // joined fields
      userName: usersTable.name,
      userEmail: usersTable.email,
      paymentMethodName: paymentMethodsTable.name,
      paymentMethodType: paymentMethodsTable.type,
      paymentMethodEmoji: paymentMethodsTable.logoEmoji,
    })
    .from(depositsTable)
    .leftJoin(usersTable, eq(depositsTable.userId, usersTable.id))
    .leftJoin(paymentMethodsTable, eq(depositsTable.paymentMethodId, paymentMethodsTable.id))
    .orderBy(desc(depositsTable.createdAt));

  res.json(rows.map(d => ({
    ...d,
    amount: typeof d.amount === "string" ? parseFloat(d.amount) : d.amount,
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    processedAt: d.processedAt instanceof Date ? d.processedAt.toISOString() : (d.processedAt ? String(d.processedAt) : null),
  })));
});

router.get("/admin/withdrawals", adminOnly, async (_req, res): Promise<void> => {
  const rows = await db.select().from(withdrawalsTable).orderBy(desc(withdrawalsTable.createdAt));
  res.json(rows.map(w => ({
    ...w,
    amount: typeof w.amount === "string" ? parseFloat(w.amount) : w.amount,
    createdAt: w.createdAt instanceof Date ? w.createdAt.toISOString() : String(w.createdAt),
  })));
});

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

// ── Pending password resets (admin view) ─────────────────────────────────
router.get("/admin/pending-resets", adminOnly, async (_req, res): Promise<void> => {
  const now = new Date();
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      resetOtp: usersTable.resetOtp,
      resetOtpExpiresAt: usersTable.resetOtpExpiresAt,
    })
    .from(usersTable)
    .where(isNotNull(usersTable.resetOtp));

  const active = rows
    .filter(r => r.resetOtpExpiresAt && new Date(r.resetOtpExpiresAt) > now)
    .map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      otp: r.resetOtp,
      expiresAt: r.resetOtpExpiresAt instanceof Date ? r.resetOtpExpiresAt.toISOString() : String(r.resetOtpExpiresAt),
    }));

  res.json(active);
});

// ── Users list (admin view) ───────────────────────────────────────────────
router.get("/admin/users", adminOnly, async (_req, res): Promise<void> => {
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      plainPin: usersTable.plainPin,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.id);

  res.json(users.map(u => ({
    ...u,
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
  })));
});

// ── Transactions (sends) approve / reject ────────────────────────────────
router.put("/admin/transactions/:id/approve", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
  if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }
  if (tx.status !== "pending") { res.status(400).json({ error: "Already processed" }); return; }

  const [updated] = await db
    .update(transactionsTable)
    .set({ status: "completed" })
    .where(eq(transactionsTable.id, id))
    .returning();

  res.json({ ...updated, fromAmount: parseFloat(updated.fromAmount), toAmount: parseFloat(updated.toAmount), fee: parseFloat(updated.fee) });
});

router.put("/admin/transactions/:id/reject", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
  if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }
  if (tx.status !== "pending") { res.status(400).json({ error: "Already processed" }); return; }

  // Refund the sender's wallet
  await db
    .update(walletsTable)
    .set({ balance: sql`${walletsTable.balance} + ${parseFloat(tx.fromAmount) + parseFloat(tx.fee)}`, updatedAt: new Date() })
    .where(and(eq(walletsTable.userId, tx.userId!), eq(walletsTable.currencyCode, tx.fromCurrency)));

  const [updated] = await db
    .update(transactionsTable)
    .set({ status: "failed" })
    .where(eq(transactionsTable.id, id))
    .returning();

  res.json({ ...updated, fromAmount: parseFloat(updated.fromAmount), toAmount: parseFloat(updated.toAmount), fee: parseFloat(updated.fee) });
});

// ── All transactions (admin view) ────────────────────────────────────────
router.get("/admin/transactions", adminOnly, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: transactionsTable.id,
      userId: transactionsTable.userId,
      fromCurrency: transactionsTable.fromCurrency,
      toCurrency: transactionsTable.toCurrency,
      fromAmount: transactionsTable.fromAmount,
      toAmount: transactionsTable.toAmount,
      fee: transactionsTable.fee,
      status: transactionsTable.status,
      recipientName: transactionsTable.recipientName,
      recipientCountry: transactionsTable.recipientCountry,
      recipientFlag: transactionsTable.recipientFlag,
      note: transactionsTable.note,
      createdAt: transactionsTable.createdAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
    })
    .from(transactionsTable)
    .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
    .orderBy(desc(transactionsTable.createdAt));

  res.json(rows.map(r => ({
    ...r,
    fromAmount: parseFloat(r.fromAmount),
    toAmount: parseFloat(r.toAmount),
    fee: parseFloat(r.fee),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  })));
});

export default router;
