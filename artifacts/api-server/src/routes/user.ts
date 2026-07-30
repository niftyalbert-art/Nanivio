import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, walletsTable, transactionsTable, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  GetUserProfileResponse,
  GetDashboardSummaryResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.get("/user/profile", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const initials = user.name.split(" ").map((p: string) => p[0] ?? "").join("").toUpperCase().slice(0, 2) || "U";
  const profile = {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarInitials: initials,
    memberSince: user.createdAt instanceof Date ? user.createdAt.toISOString().split("T")[0] : String(user.createdAt).split("T")[0],
  };
  res.json(GetUserProfileResponse.parse(profile));
});

router.get("/user/dashboard", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  // Get wallets belonging to this user
  const wallets = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));

  const rates: Record<string, number> = {
    USD: 1, AED: 0.272, GHS: 0.065, USDT: 1, EUR: 1.08, GBP: 1.27,
    PHP: 0.0176, INR: 0.012, NGN: 0.00065, KES: 0.0077, XOF: 0.00165,
    MXN: 0.058, BRL: 0.19, PKR: 0.0035, BDT: 0.0091, LKR: 0.0031,
    TZS: 0.00038, UGX: 0.00026, ZAR: 0.054, MAD: 0.099, EGP: 0.032,
    THB: 0.028, MYR: 0.21, SGD: 0.74, CAD: 0.74, AUD: 0.65,
    NZD: 0.61, JPY: 0.0066, CNY: 0.14, HKD: 0.128,
  };

  const totalBalanceUsd = wallets.reduce((sum, w) => {
    const rate = rates[w.currencyCode] ?? 1;
    return sum + parseFloat(w.balance) * rate;
  }, 0);

  const recentRows = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(sql`${transactionsTable.createdAt} desc`)
    .limit(5);

  const completedRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactionsTable)
    .where(sql`${transactionsTable.status} = 'completed' AND ${transactionsTable.userId} = ${userId}`);

  const totalVolumeRows = await db
    .select({ total: sql<number>`coalesce(sum(${transactionsTable.fromAmount}), 0)` })
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId));

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

// GET /user/calling-settings — own call preferences
router.get('/user/calling-settings', requireAuth, async (req, res): Promise<void> => {
  try {
    const [user] = await db.select({ callsEnabled: usersTable.callsEnabled, videoCallsEnabled: usersTable.videoCallsEnabled })
      .from(usersTable).where(eq(usersTable.id, req.userId!));
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(user);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH /user/calling-settings — update own call preferences
router.patch('/user/calling-settings', requireAuth, async (req, res): Promise<void> => {
  try {
    const { callsEnabled, videoCallsEnabled } = req.body as { callsEnabled?: boolean; videoCallsEnabled?: boolean };
    const patch: Partial<typeof usersTable.$inferInsert> = {};
    if (typeof callsEnabled === 'boolean') patch.callsEnabled = callsEnabled;
    if (typeof videoCallsEnabled === 'boolean') patch.videoCallsEnabled = videoCallsEnabled;
    if (Object.keys(patch).length === 0) { res.status(400).json({ error: 'No valid fields' }); return; }
    await db.update(usersTable).set(patch).where(eq(usersTable.id, req.userId!));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /user/calling-settings/:streamUserId — check another user's call preferences (auth required)
// Stream user IDs are the numeric DB id cast to string, so we parseInt them back.
router.get('/user/calling-settings/:streamUserId', requireAuth, async (req, res): Promise<void> => {
  try {
    const targetId = parseInt(req.params.streamUserId, 10);
    if (isNaN(targetId)) { res.status(400).json({ error: 'Invalid user id' }); return; }
    const [user] = await db.select({ callsEnabled: usersTable.callsEnabled, videoCallsEnabled: usersTable.videoCallsEnabled })
      .from(usersTable).where(eq(usersTable.id, targetId));
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(user);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
