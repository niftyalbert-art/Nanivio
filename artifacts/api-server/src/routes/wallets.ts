import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, walletsTable } from "@workspace/db";
import {
  GetWalletsResponse,
  GetWalletParams,
  GetWalletResponse,
  TopUpWalletParams,
  TopUpWalletBody,
  TopUpWalletResponse,
} from "@workspace/api-zod";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/wallets", async (req, res): Promise<void> => {
  const wallets = await db.select().from(walletsTable).orderBy(walletsTable.id);
  const parsed = wallets.map((w) => ({
    ...w,
    balance: parseFloat(w.balance),
  }));
  res.json(GetWalletsResponse.parse(parsed));
});

router.get("/wallets/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetWalletParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [wallet] = await db
    .select()
    .from(walletsTable)
    .where(eq(walletsTable.id, params.data.id));

  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  res.json(GetWalletResponse.parse({ ...wallet, balance: parseFloat(wallet.balance) }));
});

router.post("/wallets/:id/topup", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = TopUpWalletParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = TopUpWalletBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [wallet] = await db
    .update(walletsTable)
    .set({
      balance: sql`${walletsTable.balance} + ${body.data.amount}`,
      updatedAt: new Date(),
    })
    .where(eq(walletsTable.id, params.data.id))
    .returning();

  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  res.json(TopUpWalletResponse.parse({ ...wallet, balance: parseFloat(wallet.balance) }));
});

export default router;
