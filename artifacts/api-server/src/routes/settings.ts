import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";

const router: IRouter = Router();

const ADMIN_KEY = "niviopay2024";
function adminOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

const DEFAULT_SETTINGS: Record<string, string> = {
  whatsapp_link: "https://wa.me/971501234567",
  telegram_link: "https://t.me/niviopay_support",
  send_fee_percent: "",   // empty = use per-currency fee from exchange_rates
  support_hours: "Available 8am–10pm UAE time · Usually replies within 30 minutes",
};

async function getSetting(key: string): Promise<string> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return row?.value ?? DEFAULT_SETTINGS[key] ?? "";
}

// ── Public: fetch display settings (contact links, hours) ─────────────────
router.get("/settings", async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(settingsTable);
    const map: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const r of rows) map[r.key] = r.value;
    res.json({
      whatsappLink: map.whatsapp_link || DEFAULT_SETTINGS.whatsapp_link,
      telegramLink: map.telegram_link || DEFAULT_SETTINGS.telegram_link,
      supportHours: map.support_hours || DEFAULT_SETTINGS.support_hours,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin: get all settings ───────────────────────────────────────────────
router.get("/admin/settings", adminOnly, async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(settingsTable);
    const map: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const r of rows) map[r.key] = r.value;
    res.json(map);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin: upsert a setting ────────────────────────────────────────────────
router.put("/admin/settings/:key", adminOnly, async (req, res): Promise<void> => {
  const { key } = req.params as { key: string };
  const { value } = req.body as { value?: string };
  if (value === undefined) { res.status(400).json({ error: "value required" }); return; }

  await db.insert(settingsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });

  res.json({ key, value });
});

export { getSetting };
export default router;
