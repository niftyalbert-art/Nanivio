import { Router, type IRouter } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db, walletsTable, transactionsTable, exchangeRatesTable, settingsTable } from "@workspace/db";
import {
  GetTransactionsQueryParams,
  GetTransactionsResponse,
  CreateTransactionBody,
  CreateTransactionResponse,
  GetTransactionParams,
  GetTransactionResponse,
  GetTransactionStatsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

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

// Stats: admin-style endpoint — all transactions (no userId filter)
router.get("/transactions/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const rows = await db
    .select({
      toCurrency: transactionsTable.toCurrency,
      totalVolume: sql<number>`sum(${transactionsTable.fromAmount})`,
      count: sql<number>`count(*)`,
    })
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .groupBy(transactionsTable.toCurrency)
    .orderBy(sql`sum(${transactionsTable.fromAmount}) desc`);

  const successRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.status, "completed"), eq(transactionsTable.userId, userId)));

  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId));

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

router.get("/transactions", requireAuth, async (req, res): Promise<void> => {
  const qParams = GetTransactionsQueryParams.safeParse(req.query);
  if (!qParams.success) {
    res.status(400).json({ error: qParams.error.message });
    return;
  }

  const { status, limit } = qParams.data;
  const userId = req.userId!;

  let query = db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(desc(transactionsTable.createdAt))
    .$dynamic();

  if (status) {
    query = query.where(and(eq(transactionsTable.userId, userId), eq(transactionsTable.status, status)));
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

router.post("/transactions", requireAuth, async (req, res): Promise<void> => {
  const body = CreateTransactionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { fromWalletId, toCurrencyCode, fromAmount, recipientName, recipientCountry, note } = body.data;
  const userId = req.userId!;

  // Get source wallet — must belong to this user
  const [wallet] = await db.select().from(walletsTable)
    .where(and(eq(walletsTable.id, fromWalletId), eq(walletsTable.userId, userId)));
  if (!wallet) {
    res.status(400).json({ error: "Source wallet not found" });
    return;
  }

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

  // Load fee settings
  const allFeeRows = await db.select().from(settingsTable);
  const feeMap: Record<string, string> = {};
  for (const r of allFeeRows) feeMap[r.key] = r.value;

  const feeMode = feeMap["fee_mode"] || "percent";

  let fee = 0;
  if (feeMode === "fixed") {
    const fixedVal = feeMap["send_fee_fixed"] ? parseFloat(feeMap["send_fee_fixed"]) : 0;
    fee = isNaN(fixedVal) ? 0 : Math.round(fixedVal * 100) / 100;
  } else {
    // percent mode
    const globalFee = feeMap["send_fee_percent"] ? parseFloat(feeMap["send_fee_percent"]) : NaN;
    const feePercent = !isNaN(globalFee) && globalFee >= 0 ? globalFee : parseFloat(toRateRow.feePercent);
    fee = Math.round(((feePercent / 100) * fromAmount) * 100) / 100;
  }

  const currentBalance = parseFloat(wallet.balance);
  const totalCost = fromAmount + fee;

  if (currentBalance < totalCost) {
    res.status(400).json({ error: "Insufficient balance. Please kindly add transfer fee." });
    return;
  }

  const exchangeRate = toRateToUsd / fromRateToUsd;
  const toAmount = fromAmount * exchangeRate;
  const recipientFlag = FLAGS[toCurrencyCode] ?? "🌐";

  await db
    .update(walletsTable)
    .set({
      balance: sql`${walletsTable.balance} - ${totalCost}`,
      updatedAt: new Date(),
    })
    .where(eq(walletsTable.id, fromWalletId));

  const [transaction] = await db
    .insert(transactionsTable)
    .values({
      userId,
      fromCurrency: wallet.currencyCode,
      toCurrency: toCurrencyCode,
      fromAmount: String(fromAmount),
      toAmount: String(Math.round(toAmount * 100) / 100),
      exchangeRate: String(Math.round(exchangeRate * 10000) / 10000),
      fee: String(fee),
      status: "pending",
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

router.get("/transactions/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetTransactionParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [t] = await db
    .select()
    .from(transactionsTable)
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.userId, req.userId!)));

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
