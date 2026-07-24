import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, walletsTable, transactionsTable, exchangeRatesTable } from "@workspace/db";
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

// Flag lookup (static — display only)
const FLAGS: Record<string, string> = {
  AED: "🇦🇪", GHS: "🇬🇭", PHP: "🇵🇭", INR: "🇮🇳", NGN: "🇳🇬",
  KES: "🇰🇪", EUR: "🇪🇺", GBP: "🇬🇧", PKR: "🇵🇰", BDT: "🇧🇩",
  LKR: "🇱🇰", TZS: "🇹🇿", UGX: "🇺🇬", ZAR: "🇿🇦", MAD: "🇲🇦",
  EGP: "🇪🇬", XOF: "🇸🇳", MXN: "🇲🇽", BRL: "🇧🇷", THB: "🇹🇭",
  MYR: "🇲🇾", SGD: "🇸🇬", CAD: "🇨🇦", AUD: "🇦🇺", NZD: "🇳🇿",
  JPY: "🇯🇵", CNY: "🇨🇳", HKD: "🇭🇰", USDT: "₿", USD: "🇺🇸",
};

async function getRateRow(currencyCode: string) {
  const [row] = await db.select().from(exchangeRatesTable)
    .where(eq(exchangeRatesTable.currencyCode, currencyCode));
  return row ?? null;
}

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
      flag: FLAGS[r.toCurrency] ?? "🌐",
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

  // Look up exchange rates from DB
  const fromRateRow = await getRateRow(wallet.currencyCode);
  const toRateRow = await getRateRow(toCurrencyCode);

  if (!fromRateRow) {
    res.status(400).json({ error: `Unsupported source currency: ${wallet.currencyCode}` });
    return;
  }
  if (!toRateRow) {
    res.status(400).json({ error: `Unsupported destination currency: ${toCurrencyCode}` });
    return;
  }

  const fromRateToUsd = parseFloat(fromRateRow.rateToUsd);
  const toRateToUsd = parseFloat(toRateRow.rateToUsd);
  const feePercent = parseFloat(toRateRow.feePercent);

  const currentBalance = parseFloat(wallet.balance);
  // Fee in source currency
  const fee = Math.round(((feePercent / 100) * (1 / fromRateToUsd)) * 100) / 100;
  const totalCost = fromAmount + fee;

  if (currentBalance < totalCost) {
    res.status(400).json({ error: "Insufficient balance" });
    return;
  }

  // Convert fromCurrency → USD → toCurrency
  const exchangeRate = toRateToUsd / fromRateToUsd;
  const toAmount = fromAmount * exchangeRate;
  const recipientFlag = FLAGS[toCurrencyCode] ?? "🌐";

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
