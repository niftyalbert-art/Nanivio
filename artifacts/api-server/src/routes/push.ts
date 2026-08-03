import { Router, type IRouter } from "express";
import { and, eq, or } from "drizzle-orm";
import webpush from "web-push";
import { db, contactsTable, pushSubscriptionsTable, settingsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

/** In-memory caller→target ring throttle. */
const notifyRateLimit = new Map<string, number>();

/* ── VAPID keys: generated once, persisted in settings ── */
let vapidReady: Promise<string> | null = null;

async function ensureVapid(): Promise<string> {
  if (!vapidReady) {
    vapidReady = (async () => {
      const rows = await db.select().from(settingsTable);
      let pub = rows.find(r => r.key === "vapid_public_key")?.value;
      let priv = rows.find(r => r.key === "vapid_private_key")?.value;
      if (!pub || !priv) {
        const keys = webpush.generateVAPIDKeys();
        await db.insert(settingsTable).values([
          { key: "vapid_public_key", value: keys.publicKey },
          { key: "vapid_private_key", value: keys.privateKey },
        ]).onConflictDoNothing();
        // Re-read: if another instance won the race, use the persisted pair.
        const after = await db.select().from(settingsTable);
        pub = after.find(r => r.key === "vapid_public_key")?.value;
        priv = after.find(r => r.key === "vapid_private_key")?.value;
        if (!pub || !priv) throw new Error("VAPID key persistence failed");
      }
      webpush.setVapidDetails("mailto:support@nanivio.app", pub, priv);
      return pub;
    })().catch(err => { vapidReady = null; throw err; });
  }
  return vapidReady;
}

/* ── public key for the client ── */
router.get("/push/vapid-key", requireAuth, async (_req, res): Promise<void> => {
  try {
    res.json({ publicKey: await ensureVapid() });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "VAPID init failed" });
  }
});

/* ── save a device subscription ── */
router.post("/push/subscribe", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const { endpoint, keys } = req.body ?? {};
    if (typeof endpoint !== "string" || !endpoint.startsWith("https://") ||
        typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") {
      res.status(400).json({ error: "Invalid subscription" });
      return;
    }
    await db.insert(pushSubscriptionsTable)
      .values({ userId: req.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: { userId: req.userId, p256dh: keys.p256dh, auth: keys.auth },
      });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Subscribe failed" });
  }
});

/* ── ring the callee's devices ── */
router.post("/push/notify-call", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const toUserId = Number(req.body?.toUserId);
    const kind = req.body?.kind === "audio" ? "audio" : "video";
    if (!Number.isInteger(toUserId) || toUserId <= 0 || toUserId === req.userId) {
      res.status(400).json({ error: "Invalid toUserId" });
      return;
    }
    // Authorization: caller and target must be connected as contacts.
    const [link] = await db.select({ id: contactsTable.userId }).from(contactsTable).where(or(
      and(eq(contactsTable.userId, req.userId), eq(contactsTable.contactUserId, toUserId)),
      and(eq(contactsTable.userId, toUserId), eq(contactsTable.contactUserId, req.userId)),
    )).limit(1);
    if (!link) {
      res.status(403).json({ error: "You can only ring your contacts" });
      return;
    }
    // Rate limit: at most one ring per caller→target per 10 seconds.
    const rlKey = `${req.userId}->${toUserId}`;
    const now = Date.now();
    const last = notifyRateLimit.get(rlKey) ?? 0;
    if (now - last < 10_000) {
      res.status(429).json({ error: "Please wait before ringing again" });
      return;
    }
    notifyRateLimit.set(rlKey, now);
    if (notifyRateLimit.size > 5000) {
      for (const [k, t] of notifyRateLimit) if (now - t > 60_000) notifyRateLimit.delete(k);
    }
    await ensureVapid();
    const [caller] = await db.select({ name: usersTable.name })
      .from(usersTable).where(eq(usersTable.id, req.userId));
    const subs = await db.select().from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.userId, toUserId));
    const payload = JSON.stringify({
      type: "incoming-call",
      kind,
      callerName: caller?.name ?? "Someone",
    });
    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { urgency: "high", TTL: 45 },
        );
        sent++;
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await db.delete(pushSubscriptionsTable)
            .where(eq(pushSubscriptionsTable.endpoint, s.endpoint)).catch(() => {});
        }
      }
    }));
    res.json({ ok: true, sent });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Notify failed" });
  }
});

export default router;
