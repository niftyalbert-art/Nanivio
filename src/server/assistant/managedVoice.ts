import { AssistantError, getAssistantStore } from './redisStore.ts';
import { parseMalviVoiceProvider, type MalviVoiceProvider } from './malviVoiceConfig.ts';

/** Shared admin policy, not a browser preference. Existing sessions keep their saved provider. */
export async function getManagedMalviVoice(store = getAssistantStore, env: NodeJS.ProcessEnv = process.env): Promise<MalviVoiceProvider> {
  const saved = env.REDIS_URL
    ? await (await store()).getVoiceProvider()
    : null;
  try {
    return parseMalviVoiceProvider(saved ?? env.MALVI_VOICE_PROVIDER ?? 'elevenlabs');
  } catch {
    throw new AssistantError(503, 'VOICE_POLICY_INVALID', 'An administrator must configure a valid Malvi voice provider.');
  }
}

export async function saveManagedMalviVoice(provider: MalviVoiceProvider) {
  await (await getAssistantStore()).setVoiceProvider(provider);
}
