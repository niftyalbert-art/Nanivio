import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, walletsTable, transactionsTable } from "@workspace/db";
import {
  GetTransactionsQueryParams,
  GetTransactionsResponse,
  CreateTransactionBody,
  CreateTransactionResponse,
  GetTransactionParams,
  GetTransactionResponse,
  GetTransactionStatsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Exchange rates table (from USD)
const RATES: Record<string, { rate: number; fee: number; flag: string }> = {
  AED: { rate: 3.6725, fee: 2.5, flag: "🇦🇪" },
  GHS: { rate: 15.2, fee: 3.0, flag: "🇬🇭" },
  PHP: { rate: 56.8, fee: 2.0, flag: "🇵🇭" },
  INR: { rate: 83.5, fee: 1.5, flag: "🇮🇳" },
  NGN: { rate: 1540, fee: 4.0, flag: "🇳🇬" },
  KES: { rate: 129.5, fee: 2.5, flag: "🇰🇪" },
  EUR: { rate: 0.926, fee: 1.5, flag: "🇪🇺" },
  GBP: { rate: 0.787, fee: 2.0, flag: "🇬🇧" },
  PKR: { rate: 278.5, fee: 3.0, flag: "🇵🇰" },
  BDT: { rate: 110.2, fee: 2.5, flag: "🇧🇩" },
  LKR: { rate: 322.5, fee: 3.5, flag: "🇱🇰" },
  TZS: { rate: 2650, fee: 4.0, flag: "🇹🇿" },
  UGX: { rate: 3850, fee: 4.0, flag: "🇺🇬" },
  ZAR: { rate: 18.5, fee: 2.0, flag: "🇿🇦" },
  MAD: { rate: 10.1, fee: 2.5, flag: "🇲🇦" },
  EGP: { rate: 31.5, fee: 3.0, flag: "🇪🇬" },
  XOF: { rate: 607, fee: 4.0, flag: "🇸🇳" },
  MXN: { rate: 17.2, fee: 2.0, flag: "🇲🇽" },
  BRL: { rate: 5.1, fee: 2.0, flag: "🇧🇷" },
  THB: { rate: 35.8, fee: 2.0, flag: "🇹🇭" },
  MYR: { rate: 4.7, fee: 2.0, flag: "🇲🇾" },
  SGD: { rate: 1.35, fee: 1.5, flag: "🇸🇬" },
  CAD: { rate: 1.36, fee: 1.5, flag: "🇨🇦" },
  AUD: { rate: 1.54, fee: 1.5, flag: "🇦🇺" },
  NZD: { rate: 1.64, fee: 2.0, flag: "🇳🇿" },
  JPY: { rate: 151.5, fee: 2.0, flag: "🇯🇵" },
  CNY: { rate: 7.24, fee: 2.5, flag: "🇨🇳" },
  HKD: { rate: 7.83, fee: 1.5, flag: "🇭🇰" },
  USDT: { rate: 1.0, fee: 1.0, flag: "₿" },
  USD: { rate: 1.0, fee: 0, flag: "🇺🇸" },
};

const fromUSD: Record<string, number> = {
  AED: 3.6725, USD: 1, GHS: 15.2, PHP: 56.8, INR: 83.5, NGN: 1540,
  KES: 129.5, EUR: 0.926, GBP: 0.787, PKR: 278.5, BDT: 110.2, LKR: 322.5,
  TZS: 2650, UGX: 3850, ZAR: 18.5, MAD: 10.1, EGP: 31.5, XOF: 607,
  MXN: 17.2, BRL: 5.1, THB: 35.8, MYR: 4.7, SGD: 1.35, CAD: 1.36,
  AUD: 1.54, NZD: 1.64, JPY: 151.5, CNY: 7.24, HKD: 7.83, USDT: 1.0,
};

router.get("/transactions/stats", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      toCurrency: transactionsTable.toCurrency,
      totalVolume: sql<number>`sum(${transactionsTable.fromAmount})`,
      count: sql<number>`count(*)`,
    })
    .from(transactionsTable)
    .groupBy(transactionsTable.toCurrency)
    .orderBy(sql`sum(${transactionsTable.fromAmount}) desc`);

  const successRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactionsTable)
    .where(eq(transactionsTable.status, "completed"));

  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactionsTable);

  const successRate =
    Number(totalRows[0]?.count) > 0
      ? (Number(successRows[0]?.count) / Number(totalRows[0]?.count)) * 100
      : 100;

  const stats = {
    byCurrency: rows.map((r) => ({
      currencyCode: r.toCurrency,
      flag: RATES[r.toCurrency]?.flag ?? "🌐",
      totalVolume: Number(r.totalVolume),
      count: Number(r.count),
    })),
    successRate: Math.round(successRate * 10) / 10,
    avgTransferTime: "2 minutes",
  };

  res.json(GetTransactionStatsResponse.parse(stats));
});

router.get("/transactions", async (req, res): Promise<void> => {
  const qParams = GetTransactionsQueryParams.safeParse(req.query);
  if (!qParams.success) {
    res.status(400).json({ error: qParams.error.message });
    return;
  }

  const { status, limit } = qParams.data;
  let query = db
    .select()
    .from(transactionsTable)
    .orderBy(desc(transactionsTable.createdAt))
    .$dynamic();

  if (status) {
    query = query.where(eq(transactionsTable.status, status));
  }

  const rows = await query.limit(limit ?? 50);

  const parsed = rows.map((t) => ({
    ...t,
    fromAmount: parseFloat(t.fromAmount),
    toAmount: parseFloat(t.toAmount),
    exchangeRate: parseFloat(t.exchangeRate),
    fee: parseFloat(t.fee),
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
  }));

  res.json(GetTransactionsResponse.parse(parsed));
});

router.post("/transactions", async (req, res): Promise<void> => {
  const body = CreateTransactionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { fromWalletId, toCurrencyCode, fromAmount, recipientName, recipientCountry, note } = body.data;

  // Get source wallet
  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, fromWalletId));
  if (!wallet) {
    res.status(400).json({ error: "Source wallet not found" });
    return;
  }

  const currentBalance = parseFloat(wallet.balance);
  const fee = (RATES[wallet.currencyCode]?.fee ?? 3);
  const totalCost = fromAmount + fee;

  if (currentBalance < totalCost) {
    res.status(400).json({ error: "Insufficient balance" });
    return;
  }

  // Convert fromCurrency → USD → toCurrency
  const toUSDRate = 1 / (fromUSD[wallet.currencyCode] ?? 1);
  const toDestRate = fromUSD[toCurrencyCode] ?? 1;
  const exchangeRate = toUSDRate * toDestRate;
  const toAmount = fromAmount * exchangeRate;
  const recipientFlag = RATES[toCurrencyCode]?.flag ?? "🌐";

  // Deduct from wallet
  await db
    .update(walletsTable)
    .set({
      balance: sql`${walletsTable.balance} - ${totalCost}`,
      updatedAt: new Date(),
    })
    .where(eq(walletsTable.id, fromWalletId));

  // Create transaction
  const [transaction] = await db
    .insert(transactionsTable)
    .values({
      fromCurrency: wallet.currencyCode,
      toCurrency: toCurrencyCode,
      fromAmount: String(fromAmount),
      toAmount: String(Math.round(toAmount * 100) / 100),
      exchangeRate: String(Math.round(exchangeRate * 10000) / 10000),
      fee: String(fee),
      status: "completed",
      recipientName,
      recipientCountry,
      recipientFlag,
      note: note ?? null,
    })
    .returning();

  res.status(201).json(
    CreateTransactionResponse.parse({
      ...transaction,
      fromAmount: parseFloat(transaction.fromAmount),
      toAmount: parseFloat(transaction.toAmount),
      exchangeRate: parseFloat(transaction.exchangeRate),
      fee: parseFloat(transaction.fee),
      createdAt: transaction.createdAt instanceof Date ? transaction.createdAt.toISOString() : String(transaction.createdAt),
    })
  );
});

router.get("/transactions/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetTransactionParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [t] = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.id, params.data.id));

  if (!t) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  res.json(
    GetTransactionResponse.parse({
      ...t,
      fromAmount: parseFloat(t.fromAmount),
      toAmount: parseFloat(t.toAmount),
      exchangeRate: parseFloat(t.exchangeRate),
      fee: parseFloat(t.fee),
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
    })
  );
});

export default router;
