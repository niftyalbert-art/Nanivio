/**
 * Agora calling routes:
 *  - GET  /agora/token   → RTC token for joining a call channel
 *  - POST /agora/signal  → relay call signaling (invite/accept/reject/end)
 *    to the other user's devices via Stream Chat custom user events.
 */
import { Router, type IRouter } from "express";
import { and, eq, or } from "drizzle-orm";
import { RtcTokenBuilder, RtcRole } from "agora-token";
import { StreamChat } from "stream-chat";
import { db, contactsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

const SIGNAL_TYPES = new Set(["call_invite", "call_accept", "call_reject", "call_end", "call_cancel"]);

/** In-memory caller→target invite throttle (invite only). */
const inviteRateLimit = new Map<string, number>();

function getAgoraCreds() {
  const appId = process.env.AGORA_APP_ID;
  const cert = process.env.AGORA_APP_CERTIFICATE;
  if (!appId || !cert) throw new Error("Agora is not configured yet (missing AGORA_APP_ID / AGORA_APP_CERTIFICATE)");
  return { appId, cert };
}

function getStreamClient() {
  const key = process.env.STREAM_API_KEY;
  const secret = process.env.STREAM_API_SECRET;
  if (!key || !secret) throw new Error("Stream credentials not configured");
  return StreamChat.getInstance(key, secret);
}

async function usersAreConnected(a: number, b: number): Promise<boolean> {
  const [link] = await db.select({ id: contactsTable.userId }).from(contactsTable).where(or(
    and(eq(contactsTable.userId, a), eq(contactsTable.contactUserId, b)),
    and(eq(contactsTable.userId, b), eq(contactsTable.contactUserId, a)),
  )).limit(1);
  if (link) return true;
  // Not contacts — allow if they share an existing 1-1 chat channel
  try {
    const client = getStreamClient();
    const channels = await client.queryChannels(
      { type: "messaging", members: { $in: [String(a)] } } as any,
      {},
      { limit: 30 },
    );
    return channels.some((ch: any) => Object.keys(ch.state?.members ?? {}).includes(String(b)));
  } catch {
    return false;
  }
}

/* ── RTC token for a call channel ── */
router.get("/agora/token", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const { appId, cert } = getAgoraCreds();
    const channel = String(req.query.channel ?? "");
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(channel)) {
      res.status(400).json({ error: "Invalid channel" });
      return;
    }
    const uid = req.userId as number;
    const expireSecs = 3600;
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId, cert, channel, uid, RtcRole.PUBLISHER, expireSecs, expireSecs,
    );
    res.json({ appId, token, uid, channel, expiresIn: expireSecs });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Token generation failed" });
  }
});

/* ── relay call signaling to the other user ── */
router.post("/agora/signal", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const toUserId = Number(req.body?.toUserId);
    const event = req.body?.event ?? {};
    if (!Number.isInteger(toUserId) || toUserId <= 0 || toUserId === req.userId) {
      res.status(400).json({ error: "Invalid toUserId" });
      return;
    }
    if (typeof event.type !== "string" || !SIGNAL_TYPES.has(event.type)) {
      res.status(400).json({ error: "Invalid signal type" });
      return;
    }
    if (typeof event.channel !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(event.channel)) {
      res.status(400).json({ error: "Invalid channel" });
      return;
    }
    if (!(await usersAreConnected(req.userId, toUserId))) {
      res.status(403).json({ error: "You can only call people you chat with" });
      return;
    }
    if (event.type === "call_invite") {
      const rlKey = `${req.userId}->${toUserId}`;
      const now = Date.now();
      if (now - (inviteRateLimit.get(rlKey) ?? 0) < 5_000) {
        res.status(429).json({ error: "Please wait before calling again" });
        return;
      }
      inviteRateLimit.set(rlKey, now);
      if (inviteRateLimit.size > 5000) {
        for (const [k, t] of inviteRateLimit) if (now - t > 60_000) inviteRateLimit.delete(k);
      }
    }
    const [caller] = await db.select({ name: usersTable.name })
      .from(usersTable).where(eq(usersTable.id, req.userId));
    const client = getStreamClient();
    await client.sendUserCustomEvent(String(toUserId), {
      type: event.type,
      channel: event.channel,
      kind: event.kind === "audio" ? "audio" : "video",
      fromUserId: String(req.userId),
      fromName: caller?.name ?? "Someone",
    } as any);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Signal failed" });
  }
});

export default router;
