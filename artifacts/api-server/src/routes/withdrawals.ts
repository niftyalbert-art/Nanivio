import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, withdrawalsTable, walletsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.get("/withdrawals", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(withdrawalsTable)
    .where(eq(withdrawalsTable.userId, req.userId!))
    .orderBy(desc(withdrawalsTable.createdAt));

  const result = rows.map((w) => ({
    ...w,
    amount: parseFloat(w.amount),
    createdAt: w.createdAt instanceof Date ? w.createdAt.toISOString() : String(w.createdAt),
  }));

  res.json(result);
});

router.post("/withdrawals", requireAuth, async (req, res): Promise<void> => {
  const {
    walletId, amount, withdrawalType, recipientCountry,
    mobileNumber, mobileNetwork,
    bankName, accountNumber, accountName,
    note, pin,
  } = req.body ?? {};

  if (!walletId || !amount || !withdrawalType || !recipientCountry) {
    res.status(400).json({ error: "Missing required fields: walletId, amount, withdrawalType, recipientCountry" });
    return;
  }

  // Verify PIN
  if (!pin || !/^\d{4}$/.test(String(pin))) {
    res.status(400).json({ error: "A 4-digit PIN is required to withdraw funds" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }
  const pinValid = await bcrypt.compare(String(pin), user.passwordHash);
  if (!pinValid) {
    res.status(403).json({ error: "Incorrect PIN. Please try again." });
    return;
  }
  if (!["mobile_money", "bank"].includes(withdrawalType)) {
    res.status(400).json({ error: "withdrawalType must be mobile_money or bank" });
    return;
  }
  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }
  if (withdrawalType === "mobile_money" && !mobileNumber) {
    res.status(400).json({ error: "mobileNumber is required for mobile_money withdrawals" });
    return;
  }
  if (withdrawalType === "bank" && (!bankName || !accountNumber || !accountName)) {
    res.status(400).json({ error: "bankName, accountNumber, accountName are required for bank withdrawals" });
    return;
  }

  // Ensure wallet belongs to the authenticated user
  const [wallet] = await db.select().from(walletsTable)
    .where(and(eq(walletsTable.id, Number(walletId)), eq(walletsTable.userId, req.userId!)));
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

  if (parseFloat(wallet.balance) < amount) {
    res.status(400).json({ error: "Insufficient balance" });
    return;
  }

  await db
    .update(walletsTable)
    .set({ balance: sql`${walletsTable.balance} - ${amount}`, updatedAt: new Date() })
    .where(eq(walletsTable.id, Number(walletId)));

  const [withdrawal] = await db
    .insert(withdrawalsTable)
    .values({
      userId: req.userId!,
      walletId: Number(walletId),
      amount: String(amount),
      currencyCode: wallet.currencyCode,
      withdrawalType: String(withdrawalType),
      recipientCountry: String(recipientCountry),
      mobileNumber: mobileNumber ? String(mobileNumber) : null,
      mobileNetwork: mobileNetwork ? String(mobileNetwork) : null,
      bankName: bankName ? String(bankName) : null,
      accountNumber: accountNumber ? String(accountNumber) : null,
      accountName: accountName ? String(accountName) : null,
      status: "pending",
      note: note ? String(note) : null,
    })
    .returning();

  res.status(201).json({
    ...withdrawal,
    amount: parseFloat(withdrawal.amount),
    createdAt: withdrawal.createdAt instanceof Date ? withdrawal.createdAt.toISOString() : String(withdrawal.createdAt),
  });
});

router.get("/withdrawals/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [withdrawal] = await db.select().from(withdrawalsTable)
    .where(and(eq(withdrawalsTable.id, id), eq(withdrawalsTable.userId, req.userId!)));
  if (!withdrawal) { res.status(404).json({ error: "Withdrawal not found" }); return; }

  res.json({
    ...withdrawal,
    amount: parseFloat(withdrawal.amount),
    createdAt: withdrawal.createdAt instanceof Date ? withdrawal.createdAt.toISOString() : String(withdrawal.createdAt),
  });
});

export default router;
