import { Router } from 'express';
import { StreamChat } from 'stream-chat';
import { requireAuth } from '../middleware/auth';

const router = Router();

function getClient() {
  const key = process.env.STREAM_API_KEY;
  const secret = process.env.STREAM_API_SECRET;
  if (!key || !secret) throw new Error('Stream credentials not configured');
  return StreamChat.getInstance(key, secret);
}

// GET /stream/token — generate user token + upsert user
router.get('/stream/token', requireAuth, async (req, res): Promise<void> => {
  try {
    const client = getClient();
    const userId = String(req.userId!);
    const userName = (req as any).userName ?? 'User';
    await client.upsertUser({ id: userId, name: userName });
    const token = client.createToken(userId);
    res.json({
      token,
      userId,
      userName,
      apiKey: process.env.STREAM_API_KEY,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /stream/users/search?q= — find users to chat with
router.get('/stream/users/search', requireAuth, async (req, res): Promise<void> => {
  try {
    const client = getClient();
    const q = String(req.query.q ?? '').trim();
    const myId = String(req.userId!);
    const filter: Record<string, unknown> = { id: { $ne: myId } };
    if (q) filter.name = { $autocomplete: q };
    const { users } = await client.queryUsers(filter, { name: 1 }, { limit: 20 });
    res.json({ users });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
