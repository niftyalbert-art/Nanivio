import crypto from 'node:crypto';
import { AssistantError, getAssistantStore, IDLE_MS, MAX_SESSION_MS, type AssistantSessionRecord, type AssistantStore } from './redisStore.ts';
import { getLiveBrainProviderConfig } from './brainProviderConfig.ts';
import { getMalviLanguage } from '../../lib/malviLanguages.ts';

const API = 'https://api.liveavatar.com';
export const AI_DISCLOSURE = "Hello, I'm Malvi, Nanivio's interactive AI assistant, not a human.";
export const ownerKey = (userId: string) => crypto.createHash('sha256').update(userId).digest('hex');

export function liveAvatarSetup() {
  const brain = getLiveBrainProviderConfig();
  const missing = [
    ...(!process.env.HEYGEN_API_KEY ? ['HEYGEN_API_KEY'] : []),
    ...(!process.env.AVATAR_ID ? ['AVATAR_ID'] : []),
    ...(!process.env.REDIS_URL ? ['REDIS_URL'] : []),
    ...brain.missing,
  ];
  return {
    configured: missing.length === 0,
    missing,
    mode: 'LITE' as const,
    idleSeconds: 60,
    maximumInitializationsPerHour: 10,
    brainConfigured: brain.configured,
    // Setup is not a live-session probe. Only brain_ready confirms a connection.
    brainConnected: false,
    brainProvider: brain.selectedProvider,
  };
}

export async function liveAvatarRequest(path: string, body: unknown, fetcher = fetch) {
  const response = await fetcher(`${API}${path}`, {
    method: 'POST',
    headers: { 'X-API-KEY': process.env.HEYGEN_API_KEY || '', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
    redirect: 'error',
  });
  // Stop is idempotent when the remote session has already disappeared.
  if (path.endsWith('/stop') && response.status === 404) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok || ![100, 1000].includes(payload?.code)) {
    throw new AssistantError(502, 'LIVEAVATAR_PROVIDER_FAILED', 'The live avatar provider could not complete the request.');
  }
  return payload.data;
}

export function createLiveAvatarService(deps: {
  store: () => Promise<AssistantStore>;
  provider: typeof liveAvatarRequest;
  now: () => number;
  uuid: () => string;
}) {
  async function stopRecord(store: AssistantStore, record: AssistantSessionRecord) {
    if (record.providerId) await deps.provider('/v1/sessions/stop', {
      session_id: record.providerId,
      reason: record.deadline <= deps.now() ? 'IDLE_TIMEOUT' : 'USER_CLOSED',
    });
    await store.release(record);
  }
  return {
    async create(userId: string, languageCode = 'en', mode: 'LITE' | 'VOICE_TEST' = 'LITE') {
      const language = getMalviLanguage(languageCode);
      const store = await deps.store();
      const now = deps.now();
      const record: AssistantSessionRecord = {
        id: deps.uuid(), owner: ownerKey(userId), language: language.code, mode, deadline: now + IDLE_MS, hardDeadline: now + MAX_SESSION_MS,
      };
      await store.reserve(record.owner, record.id, now);
      try {
        await store.save(record);
        if (mode === 'VOICE_TEST') {
          return { id: record.id, mode, language: language.code, idleDeadline: record.deadline, hardDeadline: record.hardDeadline, disclosure: AI_DISCLOSURE };
        }
        // LITE only: no provider LLM, voice agent, automatic opening text, or idle microphone streaming.
        const data = await deps.provider('/v1/sessions/token', {
          mode: 'LITE',
          avatar_id: process.env.AVATAR_ID,
          video_settings: { quality: 'high', encoding: 'H264' },
          max_session_duration: MAX_SESSION_MS / 1000,
        });
        if (typeof data?.session_id === 'string') record.providerId = data.session_id;
        if (!record.providerId || typeof data?.session_token !== 'string' || !data.session_token) {
          throw new AssistantError(502, 'INVALID_LIVEAVATAR_SESSION', 'LiveAvatar returned an incomplete session.');
        }
        await store.save(record);
        return { id: record.id, sessionToken: data.session_token, mode: 'LITE', language: language.code, idleDeadline: record.deadline, hardDeadline: record.hardDeadline, disclosure: AI_DISCLOSURE };
      } catch (error) {
        // A token that could not be persisted must not leave an unmanaged session.
        if (record.providerId) {
          try { await deps.provider('/v1/sessions/stop', { session_id: record.providerId, reason: 'SERVER_ERROR' }); } catch {}
        }
        await store.release(record).catch(() => {});
        throw error;
      }
    },
    async owned(userId: string, id: string) {
      const store = await deps.store();
      const record = await store.get(id);
      if (!record || record.owner !== ownerKey(userId)) throw new AssistantError(404, 'SESSION_NOT_FOUND', 'Live session not found.');
      if (record.closing || record.deadline <= deps.now()) throw new AssistantError(410, 'SESSION_EXPIRED', 'The live session ended after inactivity.');
      return record;
    },
    async activity(userId: string, id: string) {
      const record = await (await deps.store()).touch(id, ownerKey(userId), deps.now());
      if (!record) throw new AssistantError(410, 'SESSION_EXPIRED', 'Live session is closed or expired.');
      return { idleDeadline: record.deadline };
    },
    async claimWelcome(id: string) {
      if (!await (await deps.store()).claimWelcome(id)) throw new AssistantError(409, 'WELCOME_ALREADY_REQUESTED', 'The welcome voice was already requested for this session.');
    },
    async stop(userId: string, id: string) {
      const store = await deps.store();
      const record = await store.get(id);
      if (!record) return;
      if (record.owner !== ownerKey(userId)) throw new AssistantError(404, 'SESSION_NOT_FOUND', 'Live session not found.');
      const claimed = await store.claimStop(id, record.owner, deps.now(), true);
      if (claimed) await stopRecord(store, claimed);
    },
    async sweep() {
      const store = await deps.store();
      const due = await store.due(deps.now());
      await Promise.allSettled(due.map(async id => {
        const record = await store.claimStop(id, '', deps.now(), false);
        if (record) await stopRecord(store, record);
      }));
    },
  };
}

export const liveAvatarService = createLiveAvatarService({
  store: getAssistantStore, provider: liveAvatarRequest, now: Date.now, uuid: crypto.randomUUID,
});
