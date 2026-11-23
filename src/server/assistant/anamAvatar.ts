import { AssistantError } from './redisStore';

const API = 'https://api.anam.ai';
export interface AnamConnection {
  sessionId: string;
  engineHost: string;
  engineProtocol: string;
  signallingEndpoint: string;
  clientConfig: {
    heartbeatIntervalSeconds: number;
    maxWsReconnectionAttempts: number;
    iceServers: RTCIceServer[];
  };
}

/** No provider brain, microphone, voice selection or silent renderer fallback. */
export function createAnamAvatarProvider(fetcher = fetch, env = process.env) {
  async function request(path: string, body: unknown, token = env.ANAM_API_KEY) {
    if (!token) throw new AssistantError(503, 'ANAM_SETUP_REQUIRED', 'Malvi’s Anam access is not configured.');
    const response = await fetcher(`${API}${path}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(8000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      // Never forward raw provider responses, credentials, or user metadata.
      const stage = path === '/v1/auth/session-token' ? 'token creation'
        : path === '/v1/engine/session' ? 'stream startup' : 'session cleanup';
      if (response.status === 429) {
        const upstream = typeof data?.error === 'string' ? data.error.toLowerCase() : '';
        const reasons = [
          ['spend cap reached', 'ANAM_SPEND_CAP', 'Anam’s spending cap was reached.'],
          ['concurrent session limit reached', 'ANAM_CONCURRENCY_LIMIT', 'Anam’s concurrent-session limit was reached.'],
          ['usage limit reached', 'ANAM_USAGE_LIMIT', 'Anam’s usage allowance was reached.'],
          ['rate limit exceeded', 'ANAM_RATE_LIMIT', 'Anam temporarily rate-limited the request.'],
        ];
        const reason = reasons.find(([match]) => upstream.includes(match));
        const retry = response.headers.get('retry-after') || '';
        throw new AssistantError(429, reason?.[1] || 'ANAM_LIMIT_REACHED',
          `${reason?.[2] || 'Anam refused the request because of a provider limit.'} Stage: ${stage} (HTTP 429).`,
          /^\d{1,6}$/.test(retry) ? Math.max(1, Number(retry)) : undefined);
      }
      throw new AssistantError(502, 'ANAM_PROVIDER_FAILED',
        `Malvi’s Anam renderer could not complete ${stage} (HTTP ${response.status}).`);
    }
    return data;
  }
  return {
    async create(maxSeconds: number) {
      if (!env.ANAM_AVATAR_ID) throw new AssistantError(503, 'ANAM_SETUP_REQUIRED', 'Configure Malvi’s custom Anam avatar ID.');
      if (!Number.isFinite(maxSeconds) || maxSeconds < 1) {
        throw new AssistantError(410, 'SESSION_EXPIRED', 'Malvi’s reserved conversation time has ended.');
      }
      const token = await request('/v1/auth/session-token', {
        maxSessions: 1, expiresInSeconds: 120,
        personaConfig: {
          avatarId: env.ANAM_AVATAR_ID, avatarModel: 'cara-4.1-express',
          enableAudioPassthrough: true,
          maxSessionLengthSeconds: Math.max(1, Math.min(600, Math.floor(maxSeconds))),
        },
        sessionOptions: { dataRetention: { recording: false, transcripts: false } },
      });
      if (typeof token?.sessionToken !== 'string' || !token.sessionToken) {
        throw new AssistantError(502, 'ANAM_TOKEN_INVALID', 'Anam did not return a session token.');
      }
      // Start on the server, not from an unregistered client callback. The
      // authoritative provider ID is available for idle/expiry/deletion cleanup
      // before any connection information is returned to the browser.
      const connection: AnamConnection = await request('/v1/engine/session', {}, token.sessionToken);
      if (typeof connection?.sessionId !== 'string' || !connection.sessionId) {
        throw new AssistantError(502, 'ANAM_SESSION_INVALID', 'Anam did not return a session ID.');
      }
      return { providerId: connection.sessionId, sessionToken: token.sessionToken, connection };
    },
    async stop(id: string) {
      await request(`/v1/sessions/${encodeURIComponent(id)}/stop`, {});
    },
  };
}

export const anamAvatarProvider = createAnamAvatarProvider();
