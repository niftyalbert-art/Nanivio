import type { MalviChatMessage } from '../types';

type HistoryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const PREFIX = 'nanivio_malvi_chat_history_v2:';

export function malviHistoryKey(owner: string | null): string | null {
  return typeof owner === 'string' && owner.trim() ? `${PREFIX}${encodeURIComponent(owner)}` : null;
}

function isMessage(value: unknown): value is MalviChatMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as Partial<MalviChatMessage>;
  return typeof message.id === 'string' && !!message.id
    && ['user', 'malvi', 'system'].includes(message.sender as string)
    && typeof message.text === 'string'
    && typeof message.timestamp === 'number' && Number.isFinite(message.timestamp);
}

export function loadMalviHistory(storage: HistoryStorage, owner: string | null): MalviChatMessage[] {
  const key = malviHistoryKey(owner);
  if (!key) return [];
  const raw = storage.getItem(key);
  if (!raw) return [];
  try {
    const record = JSON.parse(raw);
    if (record?.version !== 2 || record.owner !== owner || !Array.isArray(record.messages)
      || !record.messages.every(isMessage)) return [];
    return record.messages;
  } catch { return []; }
}

export function saveMalviHistory(storage: HistoryStorage, owner: string | null, messages: MalviChatMessage[]): void {
  const key = malviHistoryKey(owner);
  if (!key) return;
  const raw = JSON.stringify({ version: 2, owner, messages });
  // Avoid storage-event write loops between tabs.
  if (storage.getItem(key) !== raw) storage.setItem(key, raw);
}

export function clearMalviHistory(storage: HistoryStorage, owner: string | null): void {
  const key = malviHistoryKey(owner);
  if (key) storage.removeItem(key);
}
