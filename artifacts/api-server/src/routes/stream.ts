import { Router } from 'express';
import { StreamChat } from 'stream-chat';
import { StreamClient } from '@stream-io/node-sdk';
import { eq } from 'drizzle-orm';
import { db, usersTable } from '@workspace/db';
import { requireAuth } from '../middleware/auth';

const router = Router();

function getClient() {
  const key = process.env.STREAM_API_KEY;
  const secret = process.env.STREAM_API_SECRET;
  if (!key || !secret) throw new Error('Stream credentials not configured');
  return StreamChat.getInstance(key, secret);
}

function getVideoServerClient() {
  const key = process.env.STREAM_API_KEY;
  const secret = process.env.STREAM_API_SECRET;
  if (!key || !secret) throw new Error('Stream credentials not configured');
  return new StreamClient(key, secret);
}

// GET /stream/token — generate chat token + upsert user (including phone)
router.get('/stream/token', requireAuth, async (req, res): Promise<void> => {
  try {
    const client = getClient();
    const userId = String(req.userId!);
    const userName = (req as any).userName ?? 'User';
    // Fetch phone from DB so Stream has it for search
    const [dbUser] = await db.select({ phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, req.userId!));
    const phone = dbUser?.phone ?? undefined;
    await client.upsertUser({ id: userId, name: userName, ...(phone ? { phone } : {}) });
    const token = client.createToken(userId);
    res.json({ token, userId, userName, apiKey: process.env.STREAM_API_KEY });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /stream/video-token — generate a video-capable JWT token
// Note: generateUserToken() is a local JWT operation — no HTTP call to Stream needed.
// User upsertion into Stream Video is handled lazily by the SDK on first call.join().
router.get('/stream/video-token', requireAuth, async (req, res): Promise<void> => {
  try {
    const videoClient = getVideoServerClient();
    const userId = String(req.userId!);
    const userName = (req as any).userName ?? 'User';
    const token = videoClient.generateUserToken({ user_id: userId });
    res.json({ token, userId, userName, apiKey: process.env.STREAM_API_KEY });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /stream/dial/:nanivioNumber — validate a User NV for direct calling
// Deliberately returns NO name/profile/details.
// It only tells the caller whether the number is valid, whether the user is active,
// and the internal user ID needed to start the call.
router.get('/stream/dial/:nanivioNumber', requireAuth, async (req, res): Promise<void> => {
  try {
    const nanivioNumber = String(req.params.nanivioNumber ?? '').replace(/\s/g, '');
    const myUserId = req.userId!;

    // User NV must be exactly 10 digits and start with 0.
    if (!/^0\d{9}$/.test(nanivioNumber)) {
      res.status(400).json({
        error: 'Wrong User NV number',
      });
      return;
    }

    const [user] = await db
      .select({
        id: usersTable.id,
        callsEnabled: usersTable.callsEnabled,
        videoCallsEnabled: usersTable.videoCallsEnabled,
      })
      .from(usersTable)
      .where(eq(usersTable.nanivioNumber, nanivioNumber));

    if (!user || user.id === myUserId) {
      res.status(404).json({
        error: 'Wrong User NV number',
      });
      return;
    }

    if (!user.callsEnabled) {
      res.status(403).json({
        error: 'User is inactive',
      });
      return;
    }

    res.json({
      active: true,
      userId: user.id,
      videoCallsEnabled: user.videoCallsEnabled,
    });
  } catch (e: any) {
    res.status(500).json({
      error: 'Could not check User NV number',
    });
  }
});

// GET /stream/chat/:nanivioNumber — validate a User NV for direct chat
router.get('/stream/chat/:nanivioNumber', requireAuth, async (req, res): Promise<void> => {
  try {
    const nanivioNumber = String(req.params.nanivioNumber ?? '').replace(/\s/g, '');
    const myUserId = req.userId!;

    // User NV must be exactly 10 digits and start with 0.
    if (!/^0\d{9}$/.test(nanivioNumber)) {
      res.status(400).json({
        error: 'Wrong User NV number',
      });
      return;
    }

    const [user] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        callsEnabled: usersTable.callsEnabled,
      })
      .from(usersTable)
      .where(eq(usersTable.nanivioNumber, nanivioNumber));

    // Invalid number or trying to chat with yourself
    if (!user || user.id === myUserId) {
      res.status(404).json({
        error: 'Wrong User NV number',
      });
      return;
    }

    // Same availability concept used by direct calling
    if (!user.callsEnabled) {
      res.status(403).json({
        error: 'User is inactive',
      });
      return;
    }

    res.json({
      active: true,
      userId: user.id,
      name: user.name,
    });
  } catch (e: any) {
    console.error('Chat NV lookup error:', e);
    res.status(500).json({
      error: 'Could not check User NV number',
    });
  }
});

// GET /stream/users/search?q= — find users by name or phone number
router.get('/stream/users/search', requireAuth, async (req, res): Promise<void> => {
  try {
    const client = getClient();
    const q = String(req.query.q ?? '').trim();
    const myId = String(req.userId!);

    if (!q) {
      res.json({ users: [] });
      return;
    }

    // Detect phone query: starts with + or is all digits (≥4 chars)
    const isPhone = /^\+?[0-9]{4,}$/.test(q);

    let users: any[] = [];

    if (isPhone) {
      // Search by phone custom field stored on Stream users
      const result = await client.queryUsers(
        { id: { $ne: myId }, phone: { $autocomplete: q } } as any,
        { name: 1 },
        { limit: 20 },
      );
      users = result.users;
    } else {
      // Search by name
      const result = await client.queryUsers(
        { id: { $ne: myId }, name: { $autocomplete: q } } as any,
        { name: 1 },
        { limit: 20 },
      );
      users = result.users;
    }

    res.json({ users });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
