import { INITIAL_LANGUAGE_REGISTRY } from '../i18n/languages';

export type MalviLanguage = Pick<(typeof INITIAL_LANGUAGE_REGISTRY)[number], 'code' | 'name' | 'nativeName' | 'locale' | 'direction'>;

// Provider documentation is evidence of advertised coverage, not a live quality
// test. Unlisted dialects retain their own codes; never map them to another one.
// https://ai.google.dev/gemini-api/docs/live-api/capabilities#supported-languages
const GEMINI_LISTED = new Set([
  'ak', 'yo', 'ha', 'sw', 'am', 'zu', 'so', 'wo', 'en', 'fr', 'ar', 'es',
  'zh', 'de', 'pt', 'hi', 'ja', 'it', 'ru', 'tr', 'ko', 'nl', 'id', 'vi',
  'th', 'bn', 'pl',
]);

export const MALVI_LANGUAGES: MalviLanguage[] = INITIAL_LANGUAGE_REGISTRY.map(
  ({ code, name, nativeName, locale, direction }) => ({ code, name, nativeName, locale, direction }),
);

export function getMalviLanguage(value: unknown): MalviLanguage {
  const language = typeof value === 'string'
    ? MALVI_LANGUAGES.find(item => item.code === value.trim().toLowerCase())
    : undefined;
  if (!language) throw new Error('Choose a valid Nanivio language for Malvi in language settings.');
  return language;
}

export function malviLanguageCoverage(code: string, provider?: string | null) {
  const language = getMalviLanguage(code);
  return {
    ...language,
    providerListed: provider === 'gemini' ? GEMINI_LISTED.has(language.code) : null,
    liveVerified: false,
    notice: provider === 'gemini' && !GEMINI_LISTED.has(language.code)
      ? `${language.name} speech and pronunciation need testing. Choose another language if speech is unavailable.`
      : `Speak with Malvi in ${language.name}. Speech quality may vary.`,
  };
}
