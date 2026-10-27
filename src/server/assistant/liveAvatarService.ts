import crypto from 'node:crypto';
import { AssistantError, getAssistantStore, IDLE_MS, MAX_SESSION_MS, type AssistantSessionRecord, type AssistantStore } from './redisStore.ts';
import { getLiveBrainProviderConfig } from './brainProviderConfig.ts';
import { getMalviLanguage } from '../../lib/malviLanguages.ts';
import { malviVoiceSetup, type MalviVoiceProvider } from './malviVoiceConfig.ts';
import { MALVI_INTRODUCTION } from './malviSystemPrompt.ts';
import { liveUsage, type LiveUsage } from './liveUsage.ts';

const API = 'https://api.liveavatar.com';
export const AI_DISCLOSURE = MALVI_INTRODUCTION;
export const ownerKey = (userId: string) => crypto.createHash('sha256').update(userId).digest('hex');

// A lighter video profile reduces decoder/bandwidth pressure on Android phones.
// This is a performance mitigation, not a measured lip-sync correction.
export const malviVideoQuality = (userAgent: string): 'medium' | 'high' =>
  /\bAndroid\b/i.test(userAgent) ? 'medium' : 'high';

export function liveAvatarSetup(provider?: MalviVoiceProvider) {
  const brain = getLiveBrainProviderConfig();
  const speech = malviVoiceSetup(process.env, provider);
  const infrastructureMissing = [
    ...(!process.env.HEYGEN_API_KEY ? ['HEYGEN_API_KEY'] : []),
    ...(!process.env.AVATAR_ID ? ['AVATAR_ID'] : []),
    ...(!process.env.REDIS_URL ? ['REDIS_URL'] : []),
    ...brain.missing,
  ];
  const missing = [...infrastructureMissing, ...speech.missing];
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
    infrastructureConfigured: infrastructureMissing.length === 0,
    infrastructureMissing,
    speech,
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
  usage?: LiveUsage;
}) {
  const confirmedAt = new Map<string, number>();
  const confirmationFailures = new Set<string>();
  async function stopRecord(store: AssistantStore, record: AssistantSessionRecord) {
    if (record.providerId) await deps.provider('/v1/sessions/stop', {
      session_id: record.providerId,
      reason: record.deadline <= deps.now() ? 'IDLE_TIMEOUT' : 'USER_CLOSED',
    });
    if (record.usageReserved) await deps.usage?.finish(record.id);
    confirmedAt.delete(record.id);
    confirmationFailures.delete(record.id);
    await store.release(record);
  }
  return {
    async create(userId: string, languageCode = 'en', mode: 'LITE' | 'VOICE_TEST' | 'VOICE_ONLY' = 'LITE', quality: 'medium' | 'high' = 'high', speechProvider: MalviVoiceProvider = malviVoiceSetup().provider) {
      const language = getMalviLanguage(languageCode);
      const store = await deps.store();
      const now = deps.now();
      const record: AssistantSessionRecord = {
        id: deps.uuid(), owner: ownerKey(userId), language: language.code, mode, speechProvider, deadline: now + IDLE_MS, hardDeadline: now + MAX_SESSION_MS,
      };
      await store.reserve(record.owner, record.id, now);
      try {
        if (deps.usage) {
          const seconds = await deps.usage.reserve(userId, record.id, mode === 'LITE' ? 'avatar' : 'voice');
          record.usageReserved = true;
          // Start against the time at which the allowance was requested, not
          // after a potentially slow provider call. Never outlive the escrow.
          record.hardDeadline = Math.min(record.hardDeadline, now + seconds * 1000);
          record.deadline = Math.min(record.deadline, record.hardDeadline);
        }
        await store.save(record);
        if (mode !== 'LITE') {
          return { id: record.id, mode, language: language.code, idleDeadline: record.deadline, hardDeadline: record.hardDeadline, serverNow: deps.now(), disclosure: AI_DISCLOSURE };
        }
        // LITE only: no provider LLM, voice agent, automatic opening text, or idle microphone streaming.
        const data = await deps.provider('/v1/sessions/token', {
          mode: 'LITE',
          avatar_id: process.env.AVATAR_ID,
          video_settings: { quality, encoding: 'H264' },
          max_session_duration: Math.max(1, Math.floor((record.hardDeadline - now) / 1000)),
        });
        if (typeof data?.session_id === 'string') record.providerId = data.session_id;
        if (!record.providerId || typeof data?.session_token !== 'string' || !data.session_token) {
          throw new AssistantError(502, 'INVALID_LIVEAVATAR_SESSION', 'LiveAvatar returned an incomplete session.');
        }
        await store.save(record);
        return { id: record.id, sessionToken: data.session_token, mode: 'LITE', language: language.code, idleDeadline: record.deadline, hardDeadline: record.hardDeadline, serverNow: deps.now(), disclosure: AI_DISCLOSURE };
      } catch (error) {
        // A token that could not be persisted must not leave an unmanaged session.
        if (record.providerId) {
          try { await deps.provider('/v1/sessions/stop', { session_id: record.providerId, reason: 'SERVER_ERROR' }); }
          catch {
            // Keep the account reservation and retry cleanup in the sweep.
            // Never refund/release a known provider session whose stop failed.
            record.closing = true;
            record.deadline = deps.now();
            await store.save(record).catch(() => {});
            throw new AssistantError(503, 'MALVI_CLOSE_UNCONFIRMED', 'The previous conversation could not be closed. Wait before starting another one.');
          }
        }
        if (record.usageReserved) {
          // An unconfirmed refund remains in SQL for bounded reconciliation,
          // not an in-memory fabricated balance.
          await deps.usage?.finish(record.id, !record.providerId).catch(() => {});
        }
        confirmedAt.delete(record.id);
        confirmationFailures.delete(record.id);
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
    async activity(userId: string, id: string, activeUntil?: number) {
      const now = deps.now();
      // Only server-produced audio may supply a playback horizon. HTTP clients
      // cannot submit one, and Redis still enforces ownership/expiry/hard limit.
      const until = Number.isFinite(activeUntil) ? Math.max(now, Math.min(activeUntil!, now + MAX_SESSION_MS)) : now;
      const record = await (await deps.store()).touch(id, ownerKey(userId), now, until);
      if (!record) throw new AssistantError(410, 'SESSION_EXPIRED', 'Live session is closed or expired.');
      if (confirmationFailures.has(id)) throw new AssistantError(503,'MALVI_BILLING_UNAVAILABLE','Your conversation allowance could not be confirmed. End the conversation and recheck Billing.');
      if (record.usageReserved && now - (confirmedAt.get(id) || 0) >= 5000) {
        confirmedAt.set(id, now);
        // The whole bounded session is already reserved. Crash-accounting
        // receipts must not stall real microphone frames or reply playback.
        // A failed receipt stops subsequent activity rather than bypassing it.
        void deps.usage?.confirm(id).catch(() => {
          if (confirmedAt.has(id)) confirmationFailures.add(id);
        });
      }
      return { idleDeadline: record.deadline, hardDeadline: record.hardDeadline, serverNow: deps.now() };
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
  store: getAssistantStore, provider: liveAvatarRequest, now: Date.now, uuid: crypto.randomUUID, usage: liveUsage,
});
