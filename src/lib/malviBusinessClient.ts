import { authClient } from './authClient';
import type { BusinessRoom, BusinessCommand } from '../types/malviBusiness';

async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const token = authClient.getToken();
  const response = await fetch(`/api/malvi/business/rooms${path}`, {
    method: body === undefined ? 'GET' : 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok || result.success === false) throw new Error(result.error || 'The shared workspace is unavailable. Your changes were not confirmed.');
  return result;
}
export const malviBusinessClient = {
  list: (signal?: AbortSignal) => request<{ rooms: BusinessRoom[] }>('', undefined, signal),
  create: (topic: string, objective: string) => request<{ room: BusinessRoom }>('', { topic, objective }),
  read: (id: string, signal?: AbortSignal) => request<{ room: BusinessRoom }>(`/${encodeURIComponent(id)}`, undefined, signal),
  join: (code: string) => request<{ room: BusinessRoom }>('/join', { code }),
  invite: (id: string) => request<{ code: string; expiresAt: string }>(`/${encodeURIComponent(id)}/invite`, {}),
  command: (id: string, command: BusinessCommand) => request<{ room: BusinessRoom }>(`/${encodeURIComponent(id)}/command`, command),
  assist: (id: string, operation: 'analysis' | 'summary') => request<{ room: BusinessRoom }>(`/${encodeURIComponent(id)}/assist`, { operation }),
  token: (id: string, leaseId?: string) => request<{ appId: string; token: string; channelName: string; uid: number; leaseId: string; endsAt: number }>(`/${encodeURIComponent(id)}/token`, { leaseId }),
  confirmMedia: (id: string, leaseId: string) => request(`/${encodeURIComponent(id)}/media/confirm`, { leaseId }),
  endMedia: (id: string, leaseId: string, cancel = false) => request(`/${encodeURIComponent(id)}/media/end`, { leaseId, cancel }),
  transcribe: (id: string, body: { leaseId: string; audio: { data: string; mimeType: string } }, signal?: AbortSignal) =>
    request<{ room: BusinessRoom; text: string }>(`/${encodeURIComponent(id)}/transcribe`, body, signal),
  translate: (id: string, body: { messageId: string; targetLanguage: string }) =>
    request<{ text: string }>(`/${encodeURIComponent(id)}/translate`, body),
  speak: (id: string, body: { messageId: string; language: string; leaseId: string; offset?: number }) =>
    request<{ audioBase64: string; mimeType: string; excerpt: boolean; nextOffset?: number | null }>(`/${encodeURIComponent(id)}/speak`, body),
  avatar: (id: string, leaseId: string) => request<{
    session: { id: string; sessionToken: string; hardDeadline: number };
    media: { appId: string; token: string; channelName: string; uid: number }; endsAt: number;
  }>(`/${encodeURIComponent(id)}/avatar`, { leaseId }),
  avatarActivity: (id: string, sessionId: string) => request(`/${encodeURIComponent(id)}/avatar/activity`, { sessionId }),
  endAvatar: (id: string, sessionId: string) => request(`/${encodeURIComponent(id)}/avatar/end`, { sessionId }),
};
