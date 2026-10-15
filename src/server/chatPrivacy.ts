import crypto from 'node:crypto';
import type { RequestHandler } from 'express';

export class StreamAccessError extends Error {
  constructor(message = 'Channel access denied.', public status = 403) {
    super(message);
    this.name = 'StreamAccessError';
  }
}

export function normalizeChannelId(value: string): string {
  const id = typeof value === 'string' ? value.replace(/^messaging:/, '') : '';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new StreamAccessError('Invalid messaging channel ID.', 400);
  return id;
}

export function isChannelMember(userId: string, members: Array<{ userId: string }>): boolean {
  return Boolean(userId && members.some(member => member.userId === userId));
}

export function canManageChannelMembers(actor: { userId: string; role: string }, creatorId?: string): boolean {
  return Boolean(actor.userId && (actor.role === 'admin' || actor.userId === creatorId));
}

export function canRemoveChannelMember(actor: { userId: string; role: string }, targetId: string, creatorId?: string): boolean {
  if (!actor.userId || !targetId) return false;
  if (actor.userId === targetId) return true;
  return targetId !== creatorId && canManageChannelMembers(actor, creatorId);
}

/** Only exact authenticated account IDs; never fall back to Nanivio-number aliases. */
export function channelRecipients<T>(
  members: Array<{ userId: string }>, authenticatedClients: Map<string, Set<T>>,
): Set<T> {
  const recipients = new Set<T>();
  for (const member of members) {
    if (!member.userId) continue;
    for (const client of authenticatedClients.get(member.userId) || []) recipients.add(client);
  }
  return recipients;
}

export function verifyStreamWebhook(body: Buffer | undefined, signature: string, secret: string): boolean {
  if (!secret || !Buffer.isBuffer(body) || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export const requireStreamWebhookSignature: RequestHandler = (req, res, next) => {
  const secret = process.env.STREAM_API_SECRET;
  if (!secret) {
    res.status(503).json({ success: false, error: 'Stream webhook verification is not configured.' });
    return;
  }
  const body = (req as typeof req & { rawBody?: Buffer }).rawBody;
  if (!verifyStreamWebhook(body, req.get('x-signature') || '', secret)) {
    res.status(401).json({ success: false, error: 'Invalid Stream webhook signature.' });
    return;
  }
  next();
};

export const requireActiveChatAccount: RequestHandler = (req, res, next) => {
  const user = (req as typeof req & { authUser?: { id: string; accountStatus: string } }).authUser;
  if (!user?.id || user.accountStatus !== 'ACTIVE') {
    res.status(403).json({ success: false, error: 'An active authenticated account is required.' });
    return;
  }
  next();
};
