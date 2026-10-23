import { createClient } from 'redis';

export const IDLE_MS = 60_000;
export const MAX_SESSION_MS = 600_000;
export const INITIALIZATIONS_PER_HOUR = 10;
const PREFIX = 'nanivio:{assistant}:';
export const sessionKey = (id: string) => `${PREFIX}session:${id}`;
export const activeKey = (owner: string) => `${PREFIX}active:${owner}`;
export const deadlinesKey = `${PREFIX}deadlines`;

// Sliding window and one-active-session reservation are one atomic operation.
export const RESERVE_SESSION = `
local now = tonumber(ARGV[1])
if redis.call('EXISTS', KEYS[2]) == 1 then return {0, 'ACTIVE', 0} end
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - 3600000)
if redis.call('ZCARD', KEYS[1]) >= 10 then
  local first = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {0, 'RATE', math.ceil((tonumber(first[2]) + 3600000 - now) / 1000)}
end
redis.call('ZADD', KEYS[1], now, ARGV[2])
redis.call('PEXPIRE', KEYS[1], 3600000)
redis.call('SET', KEYS[2], ARGV[2], 'PX', 780000)
return {1, 'OK', 0}`;

export const TOUCH_SESSION = `
local raw = redis.call('GET', KEYS[1])
if not raw then return '' end
local s = cjson.decode(raw)
local now = tonumber(ARGV[2])
if s.owner ~= ARGV[1] or s.closing or s.deadline <= now then return '' end
s.deadline = math.min(now + 60000, s.hardDeadline)
redis.call('SET', KEYS[1], cjson.encode(s), 'PX', 780000)
redis.call('ZADD', KEYS[2], s.deadline, s.id)
return cjson.encode(s)`;

export const CLAIM_STOP = `
local raw = redis.call('GET', KEYS[1])
if not raw then redis.call('ZREM', KEYS[2], ARGV[4]); return '' end
local s = cjson.decode(raw)
if ARGV[1] ~= '' and s.owner ~= ARGV[1] then return '' end
if ARGV[3] ~= 'force' and s.deadline > tonumber(ARGV[2]) then return '' end
if not redis.call('SET', KEYS[3], '1', 'NX', 'PX', 15000) then return '' end
s.closing = true
redis.call('SET', KEYS[1], cjson.encode(s), 'PX', 780000)
return cjson.encode(s)`;

export const RELEASE_SESSION = `
if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DEL', KEYS[1]) end
redis.call('DEL', KEYS[2], KEYS[4])
redis.call('ZREM', KEYS[3], ARGV[1])
return 1`;

export interface AssistantSessionRecord {
  id: string;
  owner: string;
  language?: string;
  mode?: 'LITE' | 'VOICE_TEST';
  speechProvider?: 'elevenlabs' | 'gemini';
  providerId?: string;
  deadline: number;
  hardDeadline: number;
  closing?: boolean;
}

export class AssistantError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter?: number) {
    super(message);
  }
}

export function redisSessionStore(redis: any) {
  const evalScript = (script: string, keys: string[], args: string[]) =>
    redis.eval(script, { keys, arguments: args });
  return {
    async ping() {
      return (await redis.ping()) === 'PONG';
    },
    async reserve(owner: string, id: string, now: number) {
      const result = await evalScript(RESERVE_SESSION, [`${PREFIX}rate:${owner}`, activeKey(owner)], [String(now), id]);
      if (Number(result[0]) !== 1) {
        if (result[1] === 'ACTIVE') throw new AssistantError(409, 'SESSION_ACTIVE', 'End your existing live session before starting another.');
        throw new AssistantError(429, 'SESSION_RATE_LIMIT', 'You can start at most 10 live sessions per hour.', Number(result[2]));
      }
    },
    async save(record: AssistantSessionRecord) {
      await redis.multi()
        .set(sessionKey(record.id), JSON.stringify(record), { PX: 780_000 })
        .zAdd(deadlinesKey, { score: record.deadline, value: record.id }).exec();
    },
    async get(id: string): Promise<AssistantSessionRecord | null> {
      const raw = await redis.get(sessionKey(id));
      return raw ? JSON.parse(raw) : null;
    },
    async getVoiceProvider(): Promise<string | null> {
      return redis.get(`${PREFIX}voice-provider`);
    },
    async setVoiceProvider(provider: 'elevenlabs' | 'gemini') {
      await redis.set(`${PREFIX}voice-provider`, provider);
    },
    async touch(id: string, owner: string, now: number): Promise<AssistantSessionRecord | null> {
      const raw = await evalScript(TOUCH_SESSION, [sessionKey(id), deadlinesKey], [owner, String(now)]);
      return raw ? JSON.parse(raw) : null;
    },
    async claimWelcome(id: string) {
      return (await redis.set(`${PREFIX}welcome:${id}`, '1', { NX: true, EX: 780 })) === 'OK';
    },
    async claimStop(id: string, owner: string, now: number, force: boolean): Promise<AssistantSessionRecord | null> {
      const raw = await evalScript(CLAIM_STOP, [sessionKey(id), deadlinesKey, `${PREFIX}stop:${id}`], [owner, String(now), force ? 'force' : '', id]);
      return raw ? JSON.parse(raw) : null;
    },
    async release(record: AssistantSessionRecord) {
      await evalScript(RELEASE_SESSION, [activeKey(record.owner), sessionKey(record.id), deadlinesKey, `${PREFIX}stop:${record.id}`], [record.id]);
    },
    async due(now: number): Promise<string[]> {
      return redis.zRangeByScore(deadlinesKey, 0, now, { LIMIT: { offset: 0, count: 25 } });
    },
  };
}

export type AssistantStore = ReturnType<typeof redisSessionStore>;
let client: ReturnType<typeof createClient> | undefined;
let connecting: Promise<unknown> | undefined;

export async function getAssistantStore(): Promise<AssistantStore> {
  if (!process.env.REDIS_URL) throw new AssistantError(503, 'REDIS_REQUIRED', 'Live avatar sessions require Redis cost protection.');
  if (!client) {
    client = createClient({
      url: process.env.REDIS_URL,
      disableOfflineQueue: true,
      commandsQueueMaxLength: 1000,
      socket: { connectTimeout: 2500, reconnectStrategy: false },
    });
    // Never log Redis URLs, credentials, or raw connection errors.
    client.on('error', () => {});
  }
  try {
    if (!client.isReady) {
      if (!connecting) connecting = client.connect().finally(() => { connecting = undefined; });
      await connecting;
    }
    return redisSessionStore(client);
  } catch {
    throw new AssistantError(503, 'REDIS_UNAVAILABLE', 'Live session cost protection is temporarily unavailable. No session was started.');
  }
}
