export type LiveBrainProviderId = 'gemini' | 'openai';

const PROVIDER_ENV: Record<LiveBrainProviderId, string> = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
};

export function getLiveBrainProviderConfig() {
  const requested = (process.env.MALVI_BRAIN_PROVIDER || 'gemini').trim().toLowerCase();
  const selectedProvider: LiveBrainProviderId | null =
    requested === 'gemini' || requested === 'openai' ? requested : null;
  const providers = {
    gemini: {
      name: 'Gemini Live',
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.MALVI_GEMINI_LIVE_MODEL || 'gemini-3.8-live',
      realtimeAudio: true,
    },
    openai: {
      name: 'OpenAI GPT-Live',
      configured: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.MALVI_OPENAI_LIVE_MODEL || 'gpt-live-1',
      realtimeAudio: true,
    },
  } satisfies Record<LiveBrainProviderId, {
    name: string;
    configured: boolean;
    model: string;
    realtimeAudio: true;
  }>;
  const selected = selectedProvider ? providers[selectedProvider] : null;
  const missing = selectedProvider
    ? selected?.configured ? [] : [PROVIDER_ENV[selectedProvider]]
    : ['MALVI_BRAIN_PROVIDER must be gemini or openai'];

  return {
    selectedProvider,
    selectedName: selected?.name || null,
    model: selected?.model || null,
    providers,
    configured: missing.length === 0,
    missing,
  };
}
