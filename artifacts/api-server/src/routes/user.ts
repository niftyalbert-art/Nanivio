import { Router, type IRouter } from "express";
import { db, walletsTable, transactionsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  GetUserProfileResponse,
  GetDashboardSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Fixed demo user profile
router.get("/user/profile", async (req, res): Promise<void> => {
  const profile = {
    id: 1,
    name: "Nifty",
    email: "nifty@niftypay.com",
    avatarInitials: "NP",
    memberSince: "2022-03-15",
  };
  res.json(GetUserProfileResponse.parse(profile));
});

router.get("/user/dashboard", async (req, res): Promise<void> => {
  // Get all wallets and compute total USD balance
  const wallets = await db.select().from(walletsTable);

  // Exchange rates to USD for balance computation
  const rates: Record<string, number> = {
    USD: 1,
    AED: 0.272,
    GHS: 0.065,
    USDT: 1,
    EUR: 1.08,
    GBP: 1.27,
    PHP: 0.0176,
    INR: 0.012,
    NGN: 0.00065,
    KES: 0.0077,
    XOF: 0.00165,
    MXN: 0.058,
    BRL: 0.19,
    PKR: 0.0035,
    BDT: 0.0091,
    LKR: 0.0031,
    TZS: 0.00038,
    UGX: 0.00026,
    ZAR: 0.054,
    MAD: 0.099,
    EGP: 0.032,
    THB: 0.028,
    MYR: 0.21,
    SGD: 0.74,
    CAD: 0.74,
    AUD: 0.65,
    NZD: 0.61,
    JPY: 0.0066,
    CNY: 0.14,
    HKD: 0.128,
  };

  const totalBalanceUsd = wallets.reduce((sum, w) => {
    const rate = rates[w.currencyCode] ?? 1;
    return sum + parseFloat(w.balance) * rate;
  }, 0);

  // Get recent transactions
  const recentRows = await db
    .select()
    .from(transactionsTable)
    .orderBy(sql`${transactionsTable.createdAt} desc`)
    .limit(5);

  // Count completed
  const completedRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactionsTable)
    .where(sql`${transactionsTable.status} = 'completed'`);

  const totalVolumeRows = await db
    .select({ total: sql<number>`coalesce(sum(${transactionsTable.fromAmount}), 0)` })
    .from(transactionsTable);

  const recentTransactions = recentRows.map((t) => ({
    ...t,
    fromAmount: parseFloat(t.fromAmount),
    toAmount: parseFloat(t.toAmount),
    exchangeRate: parseFloat(t.exchangeRate),
    fee: parseFloat(t.fee),
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
  }));

  const summary = {
    totalBalanceUsd: Math.round(totalBalanceUsd * 100) / 100,
    totalWallets: wallets.length,
    completedTransfers: Number(completedRows[0]?.count ?? 0),
    totalVolume: Math.round(Number(totalVolumeRows[0]?.total ?? 0) * 100) / 100,
    recentTransactions,
  };

  res.json(GetDashboardSummaryResponse.parse(summary));
});

export default router;
