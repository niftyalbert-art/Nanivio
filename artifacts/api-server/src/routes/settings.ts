import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { adminOnly } from "../middleware/auth";

const router: IRouter = Router();

const DEFAULT_SETTINGS: Record<string, string> = {
  whatsapp_link: "https://wa.me/971501234567",
  telegram_link: "https://t.me/nanivio_support",
  send_fee_percent: "",        // used when fee_mode = "percent"; empty = per-currency fee
  send_fee_fixed: "",          // used when fee_mode = "fixed"; flat amount in source currency
  fee_mode: "percent",         // "percent" | "fixed"
  support_hours: "Available 8am–10pm UAE time · Usually replies within 30 minutes",
  // Fraud velocity limits
  fraud_tx_cap_usd: "10000",      // max single transfer (USD equivalent)
  fraud_daily_cap_usd: "50000",   // max rolling 24h send volume (USD equivalent)
  fraud_lockout_threshold: "3",   // failed attempts before 1-hour lockout
  escrow_fee_percent: "1.5",      // fee taken from the held amount when escrow is released
  paid_call_fee_percent: "10",    // platform fee on paid per-minute call earnings
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
