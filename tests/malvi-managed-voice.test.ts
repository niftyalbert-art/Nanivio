import test from 'node:test';
import assert from 'node:assert/strict';
import { getManagedMalviVoice } from '../src/server/assistant/managedVoice.ts';
import { redisSessionStore } from '../src/server/assistant/redisStore.ts';

test('admin voice policy is shared and survives store recreation without a TTL', async () => {
  const values = new Map<string, string>();
  const redis = {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string, options?: unknown) => {
      assert.equal(options, undefined, 'The global setting must not expire with a session');
      values.set(key, value);
      return 'OK';
    },
  };
  const env = { REDIS_URL: 'fixture', MALVI_VOICE_PROVIDER: 'elevenlabs' };
  const store = () => Promise.resolve(redisSessionStore(redis));
  assert.equal(await getManagedMalviVoice(store, {}), 'gemini');
  assert.equal(await getManagedMalviVoice(store, { REDIS_URL: 'fixture' }), 'gemini');
  assert.equal(await getManagedMalviVoice(store, env), 'elevenlabs');
  await (await store()).setVoiceProvider('gemini');
  assert.equal(await getManagedMalviVoice(store, env), 'gemini');
  assert.equal(await getManagedMalviVoice(() => Promise.resolve(redisSessionStore(redis)), env), 'gemini');
  await (await store()).setVoiceProvider('elevenlabs');
  assert.equal(await getManagedMalviVoice(store, env), 'elevenlabs');
  assert.equal(await getManagedMalviVoice(store, { REDIS_URL: 'fixture' }), 'elevenlabs', 'A saved administrator choice still overrides the default');
  await redis.set('nanivio:{assistant}:voice-provider', 'invalid');
  await assert.rejects(getManagedMalviVoice(store, env), /administrator must configure/);
  await assert.rejects(getManagedMalviVoice(async () => { throw Error('Store unavailable'); }, env), /Store unavailable/);
  assert.equal(await getManagedMalviVoice(store, { MALVI_VOICE_PROVIDER: 'gemini' }), 'gemini');
});
