import { getMalviLanguage } from '../../lib/malviLanguages.ts';
import { malviSpeechSetup } from './malviSpeech.ts';
import { MALVI_GEMINI_VOICE } from './geminiVoiceStyle.ts';

export type MalviVoiceProvider = 'elevenlabs' | 'gemini';
export const DEFAULT_MALVI_VOICE_PROVIDER: MalviVoiceProvider = 'gemini';
type Env = Record<string, string | undefined>;
// Published Gemini Live languages that are also selectable in Nanivio.
// Catalogue coverage is not a pronunciation or live-readiness guarantee.
const GEMINI_LANGUAGES = 'ak yo ha sw am zu so wo en fr ar es zh de pt hi ja it ru tr ko nl id vi th bn pl ta te uk'.split(' ');

export function malviVoiceSetup(env: Env = process.env, requested = env.MALVI_VOICE_PROVIDER || DEFAULT_MALVI_VOICE_PROVIDER) {
  if (requested === 'elevenlabs') return { ...malviSpeechSetup(env), captionTiming: 'provider' as const };
  const missing: string[] = [];
  if (requested !== 'gemini') missing.push('MALVI_VOICE_PROVIDER must be elevenlabs or gemini');
  if (!env.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
  if ((env.MALVI_BRAIN_PROVIDER || 'gemini').trim().toLowerCase() !== 'gemini') {
    missing.push('Gemini voice requires MALVI_BRAIN_PROVIDER=gemini; no second brain is started');
  }
  return {
    provider: 'gemini' as const, configured: missing.length === 0, missing,
    transport: 'native', voiceId: MALVI_GEMINI_VOICE, model: env.MALVI_GEMINI_LIVE_MODEL || 'gemini-3.8-live',
    supportedLanguages: GEMINI_LANGUAGES, liveVerified: false, captionTiming: 'estimated' as const,
  };
}

export function parseMalviVoiceProvider(value: unknown): MalviVoiceProvider {
  if (value !== 'elevenlabs' && value !== 'gemini') throw new Error('Choose ElevenLabs or Gemini for Malvi’s voice.');
  return value;
}

export function assertMalviVoiceLanguage(code: string, provider?: MalviVoiceProvider) {
  const language = getMalviLanguage(code);
  const speech = malviVoiceSetup(process.env, provider);
  if (!speech.supportedLanguages.includes(code)) {
    throw new Error(`${language.name} is not supported by Malvi’s selected ${speech.provider === 'gemini' ? 'Gemini' : 'ElevenLabs'} voice catalogue. No English or alternate voice was substituted.`);
  }
  return language;
}
