import crypto from 'crypto';

export interface StreamUserTokenOptions {
  userId: string;
  name?: string;
  role?: string;
  expirationSeconds?: number;
}

export interface StreamChannelMember {
  userId: string;
  name: string;
  avatar?: string;
  language?: string;
  role: 'admin' | 'member' | 'guest';
  online?: boolean;
}

export interface StreamReaction {
  type: string; // e.g. 'like', 'love', 'fire', 'lightbulb', 'globe'
  userId: string;
  userName: string;
  timestamp: number;
}

export interface StreamChatMessage {
  id: string;
  channelId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  text: string;
  translatedText?: string;
  targetLang?: string;
  sourceLang?: string;
  createdAt: number;
  reactions: StreamReaction[];
  attachments?: Array<{
    type: 'image' | 'audio' | 'file';
    url: string;
    name?: string;
    size?: string;
  }>;
  isVoiceNote?: boolean;
  voiceNoteDuration?: number;
}

export interface StreamChannelData {
  id: string;
  type: string; // e.g., 'messaging', 'livestream', 'team'
  name: string;
  members: StreamChannelMember[];
  custom?: Record<string, any>;
  lastMessage?: string;
  lastMessageAt?: number;
  updatedAt: number;
  unreadCount?: number;
}

export interface StreamEventLog {
  id: string;
  type: string;
  channelId?: string;
  userId?: string;
  payload: any;
  timestamp: number;
}

// In-memory active GetStream channels & state
const activeStreamChannels: Map<string, StreamChannelData> = new Map();

// Messages stored per channel
const streamChannelMessages: Map<string, StreamChatMessage[]> = new Map();

// Event logs buffer for debugging and webhook inspection
const streamEventLogs: StreamEventLog[] = [];
function recordStreamEvent(type: string, payload: any, channelId?: string, userId?: string) {
  const log: StreamEventLog = {
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type,
    channelId,
    userId,
    payload,
    timestamp: Date.now(),
  };
  streamEventLogs.unshift(log);
  if (streamEventLogs.length > 50) streamEventLogs.pop();
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Generates a standard GetStream (Stream Chat) user token (JWT HS256).
 * Compatible with Stream Chat Client SDK (`StreamChat.getInstance(apiKey).connectUser({ id: userId }, token)`).
 */
export function generateStreamUserToken(options: StreamUserTokenOptions): {
  token: string;
  apiKey: string;
  userId: string;
  expiresAt?: number;
  isMock: boolean;
} {
  const apiKey = process.env.STREAM_API_KEY || 'nanivio_stream_key_sandbox';
  const apiSecret = process.env.STREAM_API_SECRET || 'nanivio_stream_secret_default';
  const { userId, expirationSeconds } = options;

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload: Record<string, any> = {
    user_id: userId,
  };

  if (expirationSeconds) {
    payload.exp = Math.floor(Date.now() / 1000) + expirationSeconds;
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(signatureInput)
    .digest();

  const encodedSignature = base64UrlEncode(signature);
  const token = `${encodedHeader}.${encodedPayload}.${encodedSignature}`;

  recordStreamEvent('user.token.generated', { userId, isMock: !process.env.STREAM_API_SECRET }, undefined, userId);

  return {
    token,
    apiKey,
    userId,
    expiresAt: payload.exp ? payload.exp * 1000 : undefined,
    isMock: !process.env.STREAM_API_SECRET,
  };
}

export function getActiveStreamChannels(): StreamChannelData[] {
  return Array.from(activeStreamChannels.values());
}

export function getStreamChannel(channelId: string): StreamChannelData | undefined {
  const fullKey = channelId.includes(':') ? channelId : `messaging:${channelId}`;
  return activeStreamChannels.get(fullKey) || activeStreamChannels.get(channelId);
}

export function upsertStreamChannel(channel: StreamChannelData): StreamChannelData {
  const fullKey = channel.type ? `${channel.type}:${channel.id}` : `messaging:${channel.id}`;
  activeStreamChannels.set(fullKey, channel);
  recordStreamEvent('channel.updated', { channelId: channel.id, name: channel.name }, channel.id);
  return channel;
}

export function getStreamMessages(channelId: string): StreamChatMessage[] {
  const cleanId = channelId.replace('messaging:', '');
  return streamChannelMessages.get(cleanId) || [];
}

export function addStreamMessage(channelId: string, message: StreamChatMessage): StreamChatMessage {
  const cleanId = channelId.replace('messaging:', '');
  let list = streamChannelMessages.get(cleanId);
  if (!list) {
    list = [];
    streamChannelMessages.set(cleanId, list);
  }
  list.push(message);

  // Update channel last message
  const channel = getStreamChannel(channelId);
  if (channel) {
    channel.lastMessage = message.text;
    channel.lastMessageAt = message.createdAt;
    channel.updatedAt = message.createdAt;
  }

  recordStreamEvent('message.new', { messageId: message.id, text: message.text, translated: !!message.translatedText }, cleanId, message.userId);
  return message;
}

export function toggleStreamReaction(
  channelId: string,
  messageId: string,
  reactionType: string,
  userId: string,
  userName: string
): StreamChatMessage | null {
  const cleanId = channelId.replace('messaging:', '');
  const list = streamChannelMessages.get(cleanId);
  if (!list) return null;

  const msg = list.find((m) => m.id === messageId);
  if (!msg) return null;

  const existingIdx = msg.reactions.findIndex((r) => r.userId === userId && r.type === reactionType);
  if (existingIdx >= 0) {
    msg.reactions.splice(existingIdx, 1);
    recordStreamEvent('reaction.deleted', { messageId, reactionType }, cleanId, userId);
  } else {
    msg.reactions.push({
      type: reactionType,
      userId,
      userName,
      timestamp: Date.now(),
    });
    recordStreamEvent('reaction.new', { messageId, reactionType }, cleanId, userId);
  }

  return msg;
}

export function getStreamEventLogs(): StreamEventLog[] {
  return streamEventLogs;
}

