import { Router, type IRouter } from "express";
import { eq, sql, isNotNull, desc, and, or } from "drizzle-orm";
import fs from "fs";
import { timingSafeEqual } from "crypto";
import { db, depositsTable, withdrawalsTable, walletsTable, paymentMethodsTable, exchangeRatesTable, usersTable, transactionsTable, settingsTable, fraudEventsTable } from "@workspace/db";
import { adminOnly, signAdminToken, signToken } from "../middleware/auth";
import { decryptNullable } from "../lib/encryption";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

// ── Per-section access keys ──────────────────────────────────────────────────
// The Users and Engagements (chat) sections carry the most sensitive data, so
// on top of the admin JWT they each require a dedicated access key, supplied
// via a request header. Keys live in env vars — never hardcoded.
const USERS_KEY_ENV = "ADMIN_USERS_ACCESS_KEY";
const ENGAGEMENTS_KEY_ENV = "ADMIN_ENGAGEMENTS_ACCESS_KEY";

// Constant-time key comparison — prevents timing attacks on key guessing.
function keysMatch(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string" || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sectionKeyGuard(envName: string, headerName: string) {
  return (req: any, res: any, next: any): void => {
    const expected = process.env[envName];
    if (!expected) {
      res.status(503).json({ error: "Section access key is not configured" });
      return;
    }
    if (keysMatch(req.headers[headerName], expected)) {
      next();
      return;
    }
    res.status(403).json({ error: "SECTION_KEY_REQUIRED" });
  };
}

const usersSectionKey = sectionKeyGuard(USERS_KEY_ENV, "x-admin-users-key");
const engagementsSectionKey = sectionKeyGuard(ENGAGEMENTS_KEY_ENV, "x-admin-engagements-key");

// POST /admin/section-access/verify — validate a section key up front (for the unlock prompt)
router.post("/admin/section-access/verify", adminOnly, (req, res): void => {
  const { section, key } = req.body ?? {};
  const envName = section === "users" ? USERS_KEY_ENV : section === "engagements" ? ENGAGEMENTS_KEY_ENV : null;
  if (!envName || typeof key !== "string") {
    res.status(400).json({ error: "section ('users' | 'engagements') and key are required" });
    return;
  }
  const expected = process.env[envName];
  if (!expected) {
    res.status(503).json({ error: "Section access key is not configured" });
    return;
  }
  if (keysMatch(key, expected)) {
    res.json({ ok: true });
    return;
  }
  res.status(403).json({ error: "Invalid access key" });
});

// ── Helper: verify the submitted password against DB hash or env-var fallback
async function verifyAdminPassword(submitted: string): Promise<boolean> {
  // 1. Try the bcrypt hash stored in settings (set after first password change)
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "admin_password_hash"));
  if (row?.value) {
    return bcrypt.compare(submitted, row.value);
  }
  // 2. Fall back to the plain ADMIN_PASSWORD env var (original setup)
  const envPass = process.env.ADMIN_PASSWORD;
  return !!envPass && submitted === envPass;
}

// ── Admin login — issues a short-lived JWT (no static key in client code) ─
router.post("/admin/login", async (req, res): Promise<void> => {
  const { password } = req.body ?? {};
  if (!password) {
    res.status(400).json({ error: "Password required" });
    return;
  }
  const ok = await verifyAdminPassword(password);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const token = signAdminToken();
  res.json({ token });
});

// ── Admin change-password (also used as "forgot password" reset) ───────────
// Caller must prove they know the CURRENT password (env var or stored hash).
// On success, the new password is stored as a bcrypt hash in the settings table,
// and all future logins use that hash instead of the env var.
router.post("/admin/change-password", async (req, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }
  const ok = await verifyAdminPassword(currentPassword);
  if (!ok) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  const hash = await bcrypt.hash(newPassword, 12);
  await db.insert(settingsTable)
    .values({ key: "admin_password_hash", value: hash, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: hash, updatedAt: new Date() } });
  res.json({ ok: true });
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
  const { type, name, iban, accountNumber, accountName, instructions, logoEmoji, isActive } = req.body ?? {};
  if (!type || !name || !accountName || !instructions) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }
  const [method] = await db.insert(paymentMethodsTable).values({
    type, name,
    iban: iban || null,
    accountNumber: accountNumber || "",
    accountName, instructions,
    logoEmoji: logoEmoji || "💳",
    isActive: isActive !== undefined ? Boolean(isActive) : true,
  }).returning();
  res.status(201).json(method);
});

// Update
router.put("/admin/payment-methods/:id", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { type, name, iban, accountNumber, accountName, instructions, logoEmoji, isActive } = req.body ?? {};
  const updates: Record<string, any> = {};
  if (type !== undefined) updates.type = type;
  if (name !== undefined) updates.name = name;
  if (iban !== undefined) updates.iban = iban || null;
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
router.get("/admin/users", adminOnly, usersSectionKey, async (_req, res): Promise<void> => {
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      plainPin: usersTable.plainPin,
      kycStatus: usersTable.kycStatus,
      emailVerified: usersTable.emailVerified,
      sendLockedUntil: usersTable.sendLockedUntil,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.id);

  res.json(users.map(u => ({
    ...u,
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
    sendLockedUntil: u.sendLockedUntil instanceof Date ? u.sendLockedUntil.toISOString() : (u.sendLockedUntil ?? null),
  })));
});

// GET /admin/users/:id — full account snapshot (profile + wallets + all transactions)
router.get("/admin/users/:id", adminOnly, usersSectionKey, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.id as string, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const wallets = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));

  const deposits = await db
    .select({
      id: depositsTable.id,
      amount: depositsTable.amount,
      currencyCode: depositsTable.currencyCode,
      status: depositsTable.status,
      externalTransactionId: depositsTable.externalTransactionId,
      createdAt: depositsTable.createdAt,
      paymentMethodName: paymentMethodsTable.name,
      paymentMethodType: paymentMethodsTable.type,
    })
    .from(depositsTable)
    .leftJoin(paymentMethodsTable, eq(depositsTable.paymentMethodId, paymentMethodsTable.id))
    .where(eq(depositsTable.userId, userId))
    .orderBy(desc(depositsTable.createdAt));

  const withdrawals = await db.select().from(withdrawalsTable)
    .where(eq(withdrawalsTable.userId, userId))
    .orderBy(desc(withdrawalsTable.createdAt));

  const sends = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(desc(transactionsTable.createdAt));

  res.json({
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      kycStatus: user.kycStatus,
      emailVerified: user.emailVerified,
      plainPin: user.plainPin ?? null,
      sendLockedUntil: user.sendLockedUntil instanceof Date ? user.sendLockedUntil.toISOString() : (user.sendLockedUntil ?? null),
      createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : String(user.createdAt),
    },
    wallets: wallets.map(w => ({
      id: w.id,
      currencyCode: w.currencyCode,
      currencyName: w.currencyName,
      flag: w.flag,
      balance: parseFloat(w.balance),
    })),
    deposits: deposits.map(d => ({
      ...d,
      amount: parseFloat(d.amount),
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    })),
    withdrawals: withdrawals.map(w => ({
      ...w,
      iban: decryptNullable(w.iban),
      accountNumber: decryptNullable(w.accountNumber),
      mobileNumber: decryptNullable(w.mobileNumber),
      amount: typeof w.amount === "string" ? parseFloat(w.amount) : w.amount,
      createdAt: w.createdAt instanceof Date ? w.createdAt.toISOString() : String(w.createdAt),
    })),
    sends: sends.map(s => ({
      ...s,
      fromAmount: typeof s.fromAmount === "string" ? parseFloat(s.fromAmount) : s.fromAmount,
      toAmount: typeof s.toAmount === "string" ? parseFloat(s.toAmount) : s.toAmount,
      fee: typeof s.fee === "string" ? parseFloat(s.fee) : s.fee,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
    })),
  });
});

// POST /admin/users/:id/impersonate — issue a user JWT so admin can log in as this user
router.post("/admin/users/:id/impersonate", adminOnly, usersSectionKey, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.id as string, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const token = signToken({ userId: user.id, email: user.email, name: user.name });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// PUT /admin/users/:id/reset-pin — admin sets a new 4-digit PIN for a user
router.put("/admin/users/:id/reset-pin", adminOnly, usersSectionKey, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.id as string, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { pin } = req.body ?? {};
  if (!pin || !/^\d{4}$/.test(String(pin))) {
    res.status(400).json({ error: "PIN must be exactly 4 digits" }); return;
  }

  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const passwordHash = await bcrypt.hash(String(pin), 10);
  await db.update(usersTable)
    .set({ passwordHash, plainPin: String(pin), updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  res.json({ ok: true, message: "PIN reset successfully" });
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

// ── KYC admin routes ─────────────────────────────────────────────────────────

// List all KYC submissions (pending first, then by submission date)
router.get("/admin/kyc", adminOnly, async (_req, res): Promise<void> => {
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      kycStatus: usersTable.kycStatus,
      kycDocumentPath: usersTable.kycDocumentPath,
      kycRejectionReason: usersTable.kycRejectionReason,
      kycSubmittedAt: usersTable.kycSubmittedAt,
      kycReviewedAt: usersTable.kycReviewedAt,
    })
    .from(usersTable)
    .where(or(
      eq(usersTable.kycStatus, "pending"),
      eq(usersTable.kycStatus, "verified"),
      eq(usersTable.kycStatus, "rejected"),
    ))
    .orderBy(desc(usersTable.kycSubmittedAt));

  res.json(users.map(u => ({
    ...u,
    hasDocument: !!u.kycDocumentPath,
    kycDocumentPath: undefined, // never expose filesystem path to client
    kycSubmittedAt: u.kycSubmittedAt ? u.kycSubmittedAt.toISOString() : null,
    kycReviewedAt: u.kycReviewedAt ? u.kycReviewedAt.toISOString() : null,
  })));
});

// Serve the ID document image for a user (admin only)
router.get("/admin/kyc/:userId/document", adminOnly, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId as string, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const [user] = await db.select({ kycDocumentPath: usersTable.kycDocumentPath }).from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.kycDocumentPath) { res.status(404).json({ error: "No document on file" }); return; }

  if (!fs.existsSync(user.kycDocumentPath)) {
    res.status(404).json({ error: "Document file not found" }); return;
  }

  const ext = user.kycDocumentPath.split(".").pop()?.toLowerCase() ?? "jpg";
  const mimeMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };
  const contentType = mimeMap[ext] ?? "application/octet-stream";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(user.kycDocumentPath).pipe(res);
});

// Approve or reject a KYC submission
router.post("/admin/kyc/:userId/review", adminOnly, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId as string, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const { action, rejectionReason } = req.body ?? {};
  if (!["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "action must be 'approve' or 'reject'" }); return;
  }
  if (action === "reject" && !rejectionReason) {
    res.status(400).json({ error: "rejectionReason is required when rejecting" }); return;
  }

  const [user] = await db.select({ kycStatus: usersTable.kycStatus }).from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.kycStatus !== "pending") { res.status(400).json({ error: "User does not have a pending submission" }); return; }

  const newStatus = action === "approve" ? "verified" : "rejected";
  const [updated] = await db
    .update(usersTable)
    .set({
      kycStatus: newStatus,
      kycRejectionReason: action === "reject" ? rejectionReason : null,
      kycReviewedAt: new Date(),
    })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, kycStatus: usersTable.kycStatus });

  res.json({ userId: updated.id, kycStatus: updated.kycStatus });
});

// ── Fraud / Security admin routes ─────────────────────────────────────────────

// GET /admin/fraud-events — recent fraud events log
router.get("/admin/fraud-events", adminOnly, async (req, res): Promise<void> => {
  const { fraudEventsTable } = await import("@workspace/db");
  const limit = Math.min(parseInt((req.query.limit as string) ?? "100", 10) || 100, 500);
  const rows = await db
    .select({
      id: fraudEventsTable.id,
      userId: fraudEventsTable.userId,
      eventType: fraudEventsTable.eventType,
      metadata: fraudEventsTable.metadata,
      createdAt: fraudEventsTable.createdAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
    })
    .from(fraudEventsTable)
    .leftJoin(usersTable, eq(fraudEventsTable.userId, usersTable.id))
    .orderBy(desc(fraudEventsTable.createdAt))
    .limit(limit);

  res.json(rows.map(r => ({
    ...r,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  })));
});

// GET /admin/locked-users — users currently locked from sending
router.get("/admin/locked-users", adminOnly, async (_req, res): Promise<void> => {
  const now = new Date();
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      sendLockedUntil: usersTable.sendLockedUntil,
      failedTransferAttempts: usersTable.failedTransferAttempts,
    })
    .from(usersTable)
    .where(sql`${usersTable.sendLockedUntil} IS NOT NULL AND ${usersTable.sendLockedUntil} > ${now}`);

  res.json(users.map(u => ({
    ...u,
    sendLockedUntil: u.sendLockedUntil instanceof Date ? u.sendLockedUntil.toISOString() : String(u.sendLockedUntil),
  })));
});

// POST /admin/users/:userId/clear-lock — clear a user's send lock
router.post("/admin/users/:userId/clear-lock", adminOnly, usersSectionKey, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId as string, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const { clearSendLock } = await import("../lib/fraud");
  await clearSendLock(userId);

  res.json({ ok: true, userId, message: "Send lock cleared" });
});

// ── Chat admin — list channels and read messages via Stream Chat server SDK ──

// GET /admin/chat/channels — all channels ordered by most recent message
router.get("/admin/chat/channels", adminOnly, engagementsSectionKey, async (_req, res): Promise<void> => {
  const key = process.env.STREAM_API_KEY;
  const secret = process.env.STREAM_API_SECRET;
  if (!key || !secret) { res.json([]); return; }
  try {
    const { StreamChat } = await import("stream-chat");
    const client = StreamChat.getInstance(key, secret);
    const channels = await client.queryChannels(
      {},
      { last_message_at: -1 },
      { limit: 100, watch: false }
    );
    res.json(channels.map((ch: any) => {
      const members = Object.values(ch.state?.members ?? {}) as any[];
      const msgs: any[] = ch.state?.messages ?? [];
      const last = msgs[msgs.length - 1];
      return {
        id: ch.id,
        cid: ch.cid,
        memberCount: members.length,
        members: members.map((m) => ({
          userId: m.user_id,
          name: m.user?.name ?? m.user_id,
        })),
        lastMessageAt: ch.data?.last_message_at ?? null,
        lastMessage: last
          ? { text: last.text ?? '', userName: last.user?.name ?? last.user?.id, createdAt: last.created_at }
          : null,
        messageCount: msgs.length,
      };
    }));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Stream Chat error" });
  }
});

// GET /admin/chat/channels/:channelId/messages — all messages in a channel
router.get("/admin/chat/channels/:channelId/messages", adminOnly, engagementsSectionKey, async (req, res): Promise<void> => {
  const key = process.env.STREAM_API_KEY;
  const secret = process.env.STREAM_API_SECRET;
  if (!key || !secret) { res.json([]); return; }
  try {
    const { StreamChat } = await import("stream-chat");
    const client = StreamChat.getInstance(key, secret);
    const channel = client.channel("messaging", req.params.channelId as string);
    await channel.watch();
    const msgs: any[] = channel.state?.messages ?? [];
    res.json(msgs.map((m) => ({
      id: m.id,
      text: m.text ?? "",
      userId: m.user?.id,
      userName: m.user?.name ?? m.user?.id ?? "Unknown",
      createdAt: m.created_at,
      attachments: (m.attachments ?? []).map((a: any) => ({
        type: a.type,
        title: a.title,
        imageUrl: a.image_url ?? a.thumb_url,
        assetUrl: a.asset_url,
      })),
    })));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Stream Chat error" });
  }
});

export default router;
