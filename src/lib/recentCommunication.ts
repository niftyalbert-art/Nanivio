import type { CallLogRecord, ChatMessage, Conversation, Participant } from '../types';
import { normalizeNanivioNumber } from '../utils/userLookup';

export interface RecentCommunication {
  key: string;
  participantId?: string;
  participantNvId?: string;
  participantName: string;
  participantAvatar?: string;
  audioCount: number;
  videoCount: number;
  incomingChatCount: number;
  unreadCount: number;
  missedCount: number;
  missedAudioCount: number;
  missedVideoCount: number;
  latestTimestamp: number;
  latestAudioTimestamp?: number;
  latestVideoTimestamp?: number;
  latestChatTimestamp?: number;
  latestMissedTimestamp?: number;
}

interface RecentCommunicationInput {
  callLogs: readonly CallLogRecord[];
  conversations: readonly Conversation[];
  messages: Readonly<Record<string, readonly ChatMessage[]>>;
  selfIds?: readonly (string | undefined)[];
  selfNumbers?: readonly (string | undefined)[];
}

const normalizedId = (value?: string) => value?.trim().toLowerCase() || '';
const normalizedNumber = (value?: string) => normalizeNanivioNumber(value || '');
const timestampValue = (value: unknown): number | undefined => {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
};
const latest = (...values: Array<number | undefined>) => {
  const valid = values.filter((value): value is number => value !== undefined);
  return valid.length ? Math.max(...valid) : undefined;
};

export function aggregateRecentCommunications({
  callLogs,
  conversations,
  messages,
  selfIds = [],
  selfNumbers = [],
}: RecentCommunicationInput): RecentCommunication[] {
  const parent = new Map<string, string>();
  const find = (token: string): string => {
    const current = parent.get(token);
    if (!current) {
      parent.set(token, token);
      return token;
    }
    if (current === token) return token;
    const root = find(current);
    parent.set(token, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(b, a);
  };
  const tokensFor = (id?: string, number?: string) => {
    const tokens = [
      normalizedId(id) ? `id:${normalizedId(id)}` : '',
      normalizedNumber(number) ? `number:${normalizedNumber(number)}` : '',
    ].filter(Boolean);
    if (tokens.length > 1) tokens.slice(1).forEach((token) => union(tokens[0], token));
    return tokens;
  };
  const selfTokenSet = new Set([
    ...selfIds.map(normalizedId).filter(Boolean).map((id) => `id:${id}`),
    ...selfNumbers.map(normalizedNumber).filter(Boolean).map((number) => `number:${number}`),
  ]);
  const selfIdSet = new Set(selfIds.map(normalizedId).filter(Boolean));
  const selfNumberSet = new Set(selfNumbers.map(normalizedNumber).filter(Boolean));

  const uniqueCalls = new Map<string, CallLogRecord>();
  callLogs.forEach((call, index) => {
    const key = call.id?.trim() || `anonymous-call:${index}`;
    if (!uniqueCalls.has(key)) uniqueCalls.set(key, call);
    tokensFor(call.participantId, call.participantNvId);
  });

  const uniqueConversations: Conversation[] = [];
  const seenConversationRefs = new Set<string>();
  conversations.forEach((conversation) => {
    if (conversation.isGroup) return;
    const refs = [conversation.id, conversation.streamChannelId]
      .map((ref) => normalizedId(ref))
      .filter(Boolean);
    if (refs.some((ref) => seenConversationRefs.has(ref))) return;
    refs.forEach((ref) => seenConversationRefs.add(ref));
    const peers = conversation.participants.filter((participant) => {
      const isSelf = selfIdSet.has(normalizedId(participant.id))
        || [participant.nvId, participant.nanivioNumber].some((number) => !!normalizedNumber(number) && selfNumberSet.has(normalizedNumber(number)));
      return !isSelf;
    });
    // A non-group conversation should have one peer; ambiguous records are not attributed by title/name.
    if (peers.length !== 1) return;
    const peer = peers[0];
    tokensFor(peer.id, peer.nvId || peer.nanivioNumber);
    uniqueConversations.push(conversation);
  });

  const byRoot = new Map<string, RecentCommunication>();
  const byIdentity = (id?: string, number?: string, fallback?: string) => {
    const tokens = tokensFor(id, number);
    if (tokens.some((token) => selfTokenSet.has(token))) return undefined;
    const usable = tokens;
    if (!usable.length) return fallback ? `unlinked:${fallback}` : undefined;
    const root = find(usable[0]);
    return `person:${root}`;
  };
  const getEntry = (key: string, details: Partial<RecentCommunication> = {}) => {
    let entry = byRoot.get(key);
    if (!entry) {
      entry = {
        key,
        participantName: details.participantName || 'Nanivio member',
        audioCount: 0,
        videoCount: 0,
        incomingChatCount: 0,
        unreadCount: 0,
        missedCount: 0,
        missedAudioCount: 0,
        missedVideoCount: 0,
        latestTimestamp: 0,
      };
      byRoot.set(key, entry);
    }
    if (details.participantId && !entry.participantId) entry.participantId = details.participantId;
    if (details.participantNvId && !entry.participantNvId) entry.participantNvId = details.participantNvId;
    if (details.participantAvatar && !entry.participantAvatar) entry.participantAvatar = details.participantAvatar;
    if (details.participantName && (entry.participantName === 'Nanivio member' || entry.participantName === 'Nanivio contact')) {
      entry.participantName = details.participantName;
    }
    return entry;
  };

  uniqueCalls.forEach((call) => {
    const time = timestampValue(call.timestamp);
    const key = byIdentity(call.participantId, call.participantNvId, call.id);
    if (!key) return;
    const entry = getEntry(key, {
      participantId: call.participantId,
      participantNvId: call.participantNvId,
      participantName: call.participantName || 'Nanivio member',
      participantAvatar: call.participantAvatar,
    });
    if (call.callType === 'video') {
      entry.videoCount += 1;
      entry.latestVideoTimestamp = latest(entry.latestVideoTimestamp, time);
    } else {
      entry.audioCount += 1;
      entry.latestAudioTimestamp = latest(entry.latestAudioTimestamp, time);
    }
    if (call.direction === 'missed') {
      entry.missedCount += 1;
      entry.latestMissedTimestamp = latest(entry.latestMissedTimestamp, time);
      if (call.callType === 'video') entry.missedVideoCount += 1;
      else entry.missedAudioCount += 1;
    }
    entry.latestTimestamp = latest(entry.latestTimestamp, time) || entry.latestTimestamp;
  });

  const seenUnreadMessages = new Set<string>();
  uniqueConversations.forEach((conversation) => {
    const peer = conversation.participants.find((participant) => {
      const isSelf = selfTokenSet.has(`id:${normalizedId(participant.id)}`)
        || [participant.nvId, participant.nanivioNumber].some((number) => selfTokenSet.has(`number:${normalizedNumber(number)}`));
      return !isSelf;
    });
    if (!peer) return;
    const key = byIdentity(peer.id, peer.nvId || peer.nanivioNumber);
    if (!key) return;
    const entry = getEntry(key, participantDetails(peer));
    const conversationMessages = [
      ...(messages[conversation.id] || []),
      ...(conversation.streamChannelId && conversation.streamChannelId !== conversation.id
        ? messages[conversation.streamChannelId] || []
        : []),
    ];
    let actualUnread = 0;
    const localMessageIds = new Set<string>();
    conversationMessages.forEach((message) => {
      const senderId = normalizedId(message.senderId);
      const senderNumber = normalizedNumber(message.senderId);
      const isIncoming = !selfIdSet.has(senderId) && !selfNumberSet.has(senderNumber);
      if (!isIncoming || message.status === 'read' || !message.id || localMessageIds.has(message.id)) return;
      localMessageIds.add(message.id);
      const messageKey = `${key}:${message.id}`;
      if (seenUnreadMessages.has(messageKey)) return;
      seenUnreadMessages.add(messageKey);
      actualUnread += 1;
    });
    const unread = Math.max(0, conversation.unreadCount || 0, actualUnread);
    entry.unreadCount += unread;
    entry.incomingChatCount += unread;
    const messageTime = latest(...conversationMessages.map((message) => timestampValue(message.timestamp)));
    const chatTime = latest(timestampValue(conversation.lastMessageTime), messageTime);
    entry.latestChatTimestamp = latest(entry.latestChatTimestamp, chatTime);
    entry.latestTimestamp = latest(entry.latestTimestamp, chatTime) || entry.latestTimestamp;
  });

  return [...byRoot.values()]
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp || a.participantName.localeCompare(b.participantName))
    .map((entry) => ({ ...entry }));
}

function participantDetails(participant: Participant): Partial<RecentCommunication> {
  return {
    participantId: participant.id,
    participantNvId: participant.nvId || participant.nanivioNumber,
    participantName: participant.name || 'Nanivio member',
    participantAvatar: participant.avatar,
  };
}
