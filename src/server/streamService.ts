import crypto from 'crypto';
import { validateChatUpload } from './chatAttachments.ts';
import { canManageChannelMembers, canRemoveChannelMember, isChannelMember, normalizeChannelId, StreamAccessError } from './chatPrivacy.ts';

export interface StreamUserTokenOptions { userId: string; name?: string; role?: string; expirationSeconds?: number; }
export interface StreamChannelMember { userId: string; name: string; avatar?: string; language?: string; role: 'admin' | 'member' | 'guest'; online?: boolean; nvId?: string; }
export interface StreamReaction { type: string; userId: string; userName: string; timestamp: number; }
export interface StreamChatMessage {
  id: string; channelId: string; userId: string; userName: string; userAvatar?: string; text: string;
  translatedText?: string; targetLang?: string; sourceLang?: string; createdAt: number; reactions: StreamReaction[];
  attachments?: Array<{ type: 'image' | 'audio' | 'file'; url: string; name?: string; size?: string }>;
  isVoiceNote?: boolean; voiceNoteDuration?: number; nanivio?: ReturnType<typeof import('./chatAttachments.ts').privateMessageMedia>;
}
export interface StreamChannelData { id: string; type: string; name: string; members: StreamChannelMember[]; custom?: Record<string, any>; lastMessage?: string; lastMessageAt?: number; updatedAt: number; unreadCount?: number; }
export interface StreamEventLog { id: string; type: string; channelId?: string; userId?: string; payload: any; timestamp: number; }

function cfg() {
  const apiKey = process.env.STREAM_API_KEY, secret = process.env.STREAM_API_SECRET;
  if (!apiKey || !secret) throw new StreamAccessError('GetStream is not configured.', 503);
  return { apiKey, secret, base: (process.env.STREAM_API_BASE_URL || 'https://chat.stream-io-api.com').replace(/\/$/, '') };
}

function signedToken(payload: Record<string, unknown>) {
  const { secret } = cfg();
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${signature}`;
}

// This privileged token never leaves the server. Every account-facing operation
// below checks provider-authoritative membership before accessing private data.
async function streamRequest(path: string, method = 'POST', body?: unknown, actingUserId?: string): Promise<any> {
  const { apiKey, base } = cfg();
  const response = await fetch(`${base}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(apiKey)}`, {
    method,
    headers: {
      'Content-Type': 'application/json', 'Stream-Auth-Type': 'jwt',
      Authorization: signedToken(actingUserId
        ? { user_id: actingUserId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }
        : { server: true }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    // Never return provider payloads containing private state or request details.
    throw new StreamAccessError(response.status === 404 ? 'Channel not found.' : 'GetStream request failed.', response.status === 404 ? 404 : 502);
  }
  return response.json();
}

function mapMember(member: any): StreamChannelMember {
  const channelRole = member.channel_role || member.role;
  return {
    userId: member.user_id || member.user?.id || '',
    name: member.user?.name || member.user_id || '',
    avatar: member.user?.image,
    nvId: member.user?.nvId,
    language: member.user?.language,
    role: member.is_moderator || ['admin', 'channel_moderator', 'channel_admin'].includes(channelRole) ? 'admin' : 'member',
  };
}

function mapChannel(snapshot: any): StreamChannelData {
  const channel = snapshot.channel || {};
  const creator = channel.created_by?.id || channel.created_by_id;
  const message = snapshot.messages?.[0] || channel.last_message;
  return {
    id: channel.id, type: channel.type || 'messaging', name: channel.name || channel.id,
    members: Object.values(snapshot.members || {}).map(member => {
      const mapped = mapMember(member);
      return mapped.userId === creator ? { ...mapped, role: 'admin' as const } : mapped;
    }),
    custom: { description: channel.description, isGroup: channel.isGroup, avatar: channel.avatar, createdBy: creator },
    updatedAt: channel.updated_at ? new Date(channel.updated_at).getTime() : Date.now(),
    lastMessage: message?.text,
    lastMessageAt: message?.created_at ? new Date(message.created_at).getTime() : undefined,
  };
}

function mapMessage(message: any, channelId: string): StreamChatMessage {
  const metadata = message.nanivio ? { ...message.nanivio } : undefined;
  const assets = message.attachments || [];
  const assetUrl = (asset: any) => asset?.asset_url || asset?.image_url || asset?.url;
  if (metadata?.mediaUrl && assetUrl(assets[0])) metadata.mediaUrl = assetUrl(assets[0]);
  if (metadata?.voiceNote && assetUrl(assets[0])) {
    metadata.voiceNote = { ...metadata.voiceNote, audioBlobUrl: assetUrl(assets[0]),
      ...(assets[1] ? { translatedAudioUrl: assetUrl(assets[1]) } : {}) };
  }
  return {
    id: message.id, channelId, userId: message.user?.id || message.user_id || '',
    userName: message.user?.name || message.user_id || '', userAvatar: message.user?.image,
    text: message.text || '', translatedText: message.translatedText || message.translated_text,
    targetLang: message.targetLang || message.target_lang, sourceLang: message.sourceLang || message.source_lang,
    createdAt: message.created_at ? new Date(message.created_at).getTime() : Date.now(),
    reactions: (message.latest_reactions || []).map((r: any) => ({ type: r.type, userId: r.user_id, userName: r.user_id, timestamp: Date.now() })),
    attachments: (message.attachments || []).map((a: any) => ({
      type: a.type === 'image' ? 'image' : a.type === 'audio' ? 'audio' : 'file',
      url: a.asset_url || a.image_url || a.url || '', name: a.title || a.name, size: a.file_size ? String(a.file_size) : undefined,
    })),
    nanivio: metadata,
    isVoiceNote: Boolean(message.isVoiceNote || message.is_voice_note),
    voiceNoteDuration: Number(message.voiceNoteDuration || message.voice_note_duration || 0) || undefined,
  };
}

async function queryChannel(channelId: string, messageLimit = 0, actingUserId?: string) {
  const id = normalizeChannelId(channelId);
  const data = await streamRequest('/channels', 'POST', {
    filter_conditions: { cid: `messaging:${id}`, ...(actingUserId ? { members: { $in: [actingUserId] } } : {}) }, limit: 1, messages_limit: messageLimit,
    member_limit: 100, state: true, watch: false, presence: false,
  });
  return data.channels?.[0] || null;
}

export async function requireStreamChannelMember(channelId: string, userId: string): Promise<StreamChannelMember> {
  if (!userId) throw new StreamAccessError('Authentication required.', 401);
  const id = normalizeChannelId(channelId);
  const payload = { type: 'messaging', id, filter_conditions: { id: userId }, limit: 1 };
  const data = await streamRequest(`/members?payload=${encodeURIComponent(JSON.stringify(payload))}`, 'GET');
  const members = (data.members || []).map(mapMember);
  if (!isChannelMember(userId, members)) throw new StreamAccessError();
  return members.find((member: StreamChannelMember) => member.userId === userId)!;
}

export async function uploadStreamAttachment(channelId: string, userId: string, bytes: Buffer, fileName: string, mimeType: string) {
  const { name, type } = validateChatUpload(bytes, fileName, mimeType);
  await requireStreamChannelMember(channelId, userId);
  const id = normalizeChannelId(channelId);
  const { apiKey, base } = cfg();
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type }), name);
  form.append('user', JSON.stringify({ id: userId }));
  const response = await fetch(`${base}/channels/messaging/${encodeURIComponent(id)}/file?api_key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Stream-Auth-Type': 'jwt', Authorization: signedToken({ server: true }) },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.file !== 'string' || !data.file.startsWith('https://')) {
    throw new StreamAccessError('Attachment upload failed. Please retry.', 502);
  }
  return data.file as string;
}

/** Fresh complete membership for private fan-out; no stale permission cache. */
export async function getStreamChannelMembers(channelId: string): Promise<StreamChannelMember[]> {
  const id = normalizeChannelId(channelId);
  const members: StreamChannelMember[] = [];
  for (let offset = 0; offset < 10000; offset += 100) {
    const payload = { type: 'messaging', id, filter_conditions: {}, sort: [{ user_id: 1 }], limit: 100, offset };
    const data = await streamRequest(`/members?payload=${encodeURIComponent(JSON.stringify(payload))}`, 'GET');
    const page = (data.members || []).map(mapMember);
    members.push(...page);
    if (page.length < 100) return members;
  }
  throw new StreamAccessError('Complete channel membership could not be verified.', 503);
}

export function generateStreamUserToken(options: StreamUserTokenOptions) {
  const { apiKey } = cfg();
  const requested = Number(options.expirationSeconds || 3600);
  const seconds = Number.isFinite(requested) ? Math.max(1, Math.min(requested, 86400)) : 3600;
  const iat = Math.floor(Date.now() / 1000);
  return { token: signedToken({ user_id: options.userId, iat, exp: iat + seconds }), apiKey, userId: options.userId, expiresAt: Date.now() + seconds * 1000, isMock: false };
}

export async function upsertStreamChannel(channel: StreamChannelData, actingUserId: string) {
  if (channel.type !== 'messaging') throw new StreamAccessError('Only private messaging channels are supported.', 400);
  if (!isChannelMember(actingUserId, channel.members)) throw new StreamAccessError();
  const requestedId = normalizeChannelId(channel.id);
  const existing = await queryChannel(requestedId);
  let id: string;
  if (existing) {
    const member = await requireStreamChannelMember(requestedId, actingUserId);
    const members = await getStreamChannelMembers(requestedId);
    const addingMembers = channel.members.some(candidate => !isChannelMember(candidate.userId, members));
    const creator = existing.channel?.created_by?.id || existing.channel?.created_by_id;
    if (!canManageChannelMembers(member, creator)) {
      if (addingMembers) throw new StreamAccessError('Only a channel administrator can add participants.');
      return getStreamChannel(requestedId, actingUserId);
    }
    id = requestedId;
  } else {
    // The caller cannot select a colliding existing ID and use creation to
    // insert themselves into someone else's channel.
    id = `nv_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  const users = Object.fromEntries(channel.members.map(member => [member.userId, {
    id: member.userId, name: member.name, image: member.avatar || '', nvId: member.nvId, language: member.language,
  }]));
  await streamRequest('/users', 'POST', { users });
  const custom = channel.custom || {};
  const data = {
    name: channel.name, created_by_id: existing ? undefined : actingUserId,
    members: existing ? undefined : channel.members.map(member => member.userId),
    description: typeof custom.description === 'string' ? custom.description : undefined,
    isGroup: typeof custom.isGroup === 'boolean' ? custom.isGroup : undefined,
    avatar: typeof custom.avatar === 'string' ? custom.avatar : undefined,
  };
  if (existing) {
    await streamRequest(`/channels/messaging/${id}`, 'POST', { data, add_members: channel.members.map(member => member.userId) });
  } else {
    await streamRequest(`/channels/messaging/${id}/query`, 'POST', { data, watch: false, state: true, presence: false });
  }
  return getStreamChannel(id, actingUserId);
}

export async function getStreamChannel(channelId: string, userId: string) {
  await requireStreamChannelMember(channelId, userId);
  const snapshot = await queryChannel(channelId, 1, userId);
  return snapshot ? mapChannel(snapshot) : null;
}

export async function getStreamMessages(channelId: string, userId: string): Promise<StreamChatMessage[]> {
  await requireStreamChannelMember(channelId, userId);
  const snapshot = await queryChannel(channelId, 50, userId);
  if (!snapshot) throw new StreamAccessError();
  return (snapshot?.messages || []).map((message: any) => mapMessage(message, normalizeChannelId(channelId)));
}

export async function addStreamMessage(channelId: string, message: StreamChatMessage) {
  await requireStreamChannelMember(channelId, message.userId);
  const id = normalizeChannelId(channelId);
  const data = await streamRequest(`/channels/messaging/${id}/message`, 'POST', {
    message: {
      text: message.text, attachments: (message.attachments || []).map(attachment => ({
        ...attachment, title: attachment.name,
        ...(attachment.type === 'image' ? { image_url: attachment.url } : { asset_url: attachment.url }),
      })), user_id: message.userId,
      sourceLang: message.sourceLang, targetLang: message.targetLang, translatedText: message.translatedText,
      isVoiceNote: message.isVoiceNote, voiceNoteDuration: message.voiceNoteDuration, nanivio: message.nanivio,
    },
  }, message.userId);
  return mapMessage(data.message, id);
}

export async function toggleStreamReaction(channelId: string, messageId: string, reactionType: string, userId: string, userName: string) {
  const id = normalizeChannelId(channelId);
  const messages = await getStreamMessages(id, userId);
  const message = messages.find(candidate => candidate.id === messageId);
  if (!message) return null;
  const hasReaction = message.reactions.some(reaction => reaction.userId === userId && reaction.type === reactionType);
  if (hasReaction) await streamRequest(`/messages/${encodeURIComponent(messageId)}/reaction/${encodeURIComponent(reactionType)}?user_id=${encodeURIComponent(userId)}`, 'DELETE', undefined, userId);
  else await streamRequest(`/messages/${encodeURIComponent(messageId)}/reaction`, 'POST', { reaction: { type: reactionType, user_id: userId } }, userId);
  return (await getStreamMessages(id, userId)).find(candidate => candidate.id === messageId) || null;
}

export async function getActiveStreamChannels(userId?: string): Promise<StreamChannelData[]> {
  if (!userId) return [];
  const data = await streamRequest('/channels', 'POST', {
    filter_conditions: { type: 'messaging', members: { $in: [userId] } },
    sort: [{ last_message_at: -1 }], limit: 100, state: true, watch: false, presence: false,
  });
  return (data.channels || []).map(mapChannel);
}

export async function removeStreamChannelMember(channelId: string, actingUserId: string, targetUserId: string) {
  const id = normalizeChannelId(channelId);
  const actor = await requireStreamChannelMember(id, actingUserId);
  const snapshot = await queryChannel(id, 0, actingUserId);
  const creator = snapshot?.channel?.created_by?.id || snapshot?.channel?.created_by_id;
  if (!snapshot || !canRemoveChannelMember(actor, targetUserId, creator)) throw new StreamAccessError();
  await streamRequest(`/channels/messaging/${id}`, 'POST', { remove_members: [targetUserId] });
}

export async function moderateStreamChannelMember(channelId: string, actingUserId: string, targetUserId: string, action: 'promote' | 'demote') {
  const id = normalizeChannelId(channelId);
  await requireStreamChannelMember(id, actingUserId);
  const snapshot = await queryChannel(id, 0, actingUserId);
  const creator = snapshot?.channel?.created_by?.id || snapshot?.channel?.created_by_id;
  if (!snapshot || creator !== actingUserId || !targetUserId || !['promote', 'demote'].includes(action)) throw new StreamAccessError();
  await requireStreamChannelMember(id, targetUserId);
  await streamRequest(`/channels/messaging/${id}`, 'POST', {
    [action === 'promote' ? 'add_moderators' : 'demote_moderators']: [targetUserId],
  });
  return getStreamChannel(id, actingUserId);
}

export function getStreamEventLogs() { return []; }
export function recordStreamEvent() { return; }
