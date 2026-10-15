import type { ChatMessage, Conversation } from '../types';

export interface PrivateChatSnapshot {
  conversations: Conversation[];
  messages: Record<string, ChatMessage[]>;
}

type ChatStorage = Pick<Storage, 'getItem' | 'setItem'>;
const empty = (): PrivateChatSnapshot => ({ conversations: [], messages: {} });

function storageKey(accountId: string) {
  return accountId && accountId !== 'unauthenticated' ? `nanivio_private_chat:${encodeURIComponent(accountId)}` : null;
}

export function ownedChatSnapshot(accountId: string, value: unknown): PrivateChatSnapshot {
  if (!accountId || accountId === 'unauthenticated' || !value || typeof value !== 'object') return empty();
  const snapshot = value as PrivateChatSnapshot;
  const conversations = Array.isArray(snapshot.conversations) ? snapshot.conversations.filter(conversation =>
    conversation && typeof conversation.id === 'string' && Array.isArray(conversation.participants) &&
    conversation.participants.some(participant => participant?.id === accountId),
  ) : [];
  const messages = snapshot.messages && typeof snapshot.messages === 'object' ? snapshot.messages : {};
  return {
    conversations,
    messages: Object.fromEntries(conversations.map(conversation => [
      conversation.id, Array.isArray(messages[conversation.id]) ? messages[conversation.id] : [],
    ])),
  };
}

export function readPrivateChatCache(accountId: string, storage?: ChatStorage): PrivateChatSnapshot {
  const key = storageKey(accountId);
  if (!key) return empty();
  try {
    const saved = (storage || window.localStorage).getItem(key);
    return saved ? ownedChatSnapshot(accountId, JSON.parse(saved)) : empty();
  } catch {
    return empty();
  }
}

export function writePrivateChatCache(accountId: string, snapshot: PrivateChatSnapshot, storage?: ChatStorage): void {
  const key = storageKey(accountId);
  if (!key) return;
  try { (storage || window.localStorage).setItem(key, JSON.stringify(ownedChatSnapshot(accountId, snapshot))); } catch { /* Cache is optional; server remains authoritative. */ }
}
