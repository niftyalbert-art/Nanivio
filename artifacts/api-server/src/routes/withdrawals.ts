import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, withdrawalsTable, walletsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/withdrawals", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(withdrawalsTable)
    .orderBy(desc(withdrawalsTable.createdAt));

  const result = rows.map((w) => ({
    ...w,
    amount: parseFloat(w.amount),
    createdAt: w.createdAt instanceof Date ? w.createdAt.toISOString() : String(w.createdAt),
  }));

  res.json(result);
});

router.post("/withdrawals", async (req, res): Promise<void> => {
  const {
    walletId, amount, withdrawalType, recipientCountry,
    mobileNumber, mobileNetwork,
    bankName, accountNumber, accountName,
    note,
  } = req.body ?? {};

  if (!walletId || !amount || !withdrawalType || !recipientCountry) {
    res.status(400).json({ error: "Missing required fields: walletId, amount, withdrawalType, recipientCountry" });
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

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, Number(walletId)));
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

  if (parseFloat(wallet.balance) < amount) {
    res.status(400).json({ error: "Insufficient balance" });
    return;
  }

  // Deduct balance
  await db
    .update(walletsTable)
    .set({ balance: sql`${walletsTable.balance} - ${amount}`, updatedAt: new Date() })
    .where(eq(walletsTable.id, Number(walletId)));

  const [withdrawal] = await db
    .insert(withdrawalsTable)
    .values({
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

router.get("/withdrawals/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [withdrawal] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id));
  if (!withdrawal) { res.status(404).json({ error: "Withdrawal not found" }); return; }

  res.json({
    ...withdrawal,
    amount: parseFloat(withdrawal.amount),
    createdAt: withdrawal.createdAt instanceof Date ? withdrawal.createdAt.toISOString() : String(withdrawal.createdAt),
  });
});

export default router;
