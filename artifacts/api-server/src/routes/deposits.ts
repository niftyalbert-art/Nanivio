import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, depositsTable, walletsTable, paymentMethodsTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.get("/deposits", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(depositsTable)
    .where(eq(depositsTable.userId, req.userId!))
    .orderBy(desc(depositsTable.createdAt));

  const result = rows.map((d) => ({
    ...d,
    amount: parseFloat(d.amount),
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
  }));

  res.json(result);
});

router.post("/deposits", requireAuth, async (req, res): Promise<void> => {
  const { walletId, paymentMethodId, amount, externalTransactionId, receiptImage, note } = req.body ?? {};

  if (!walletId || !paymentMethodId || !amount || !externalTransactionId || !receiptImage) {
    res.status(400).json({ error: "Missing required fields: walletId, paymentMethodId, amount, externalTransactionId, receiptImage" });
    return;
  }
  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }

  // Ensure wallet belongs to the authenticated user
  const [wallet] = await db.select().from(walletsTable)
    .where(and(eq(walletsTable.id, Number(walletId)), eq(walletsTable.userId, req.userId!)));
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

  const [method] = await db.select().from(paymentMethodsTable).where(eq(paymentMethodsTable.id, Number(paymentMethodId)));
  if (!method) { res.status(404).json({ error: "Payment method not found" }); return; }

  const [deposit] = await db
    .insert(depositsTable)
    .values({
      userId: req.userId!,
      walletId: Number(walletId),
      paymentMethodId: Number(paymentMethodId),
      amount: String(amount),
      currencyCode: wallet.currencyCode,
      externalTransactionId: String(externalTransactionId),
      receiptImage: String(receiptImage),
      status: "pending",
      note: note ? String(note) : null,
    })
    .returning();

  res.status(201).json({
    ...deposit,
    amount: parseFloat(deposit.amount),
    createdAt: deposit.createdAt instanceof Date ? deposit.createdAt.toISOString() : String(deposit.createdAt),
  });
});

router.get("/deposits/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deposit] = await db.select().from(depositsTable)
    .where(and(eq(depositsTable.id, id), eq(depositsTable.userId, req.userId!)));
  if (!deposit) { res.status(404).json({ error: "Deposit not found" }); return; }

  res.json({
    ...deposit,
    amount: parseFloat(deposit.amount),
    createdAt: deposit.createdAt instanceof Date ? deposit.createdAt.toISOString() : String(deposit.createdAt),
  });
});

export default router;
