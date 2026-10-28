/** Service-specific capabilities, not assertions of configuration or live verification. */
export const LANGUAGE_CODES = ['en','fr','es','ar','de','it','pt','zh','ja','ko','sw','lg','ha','ak','tw-ak','fat','ee','gaa'] as const;
export type TranslationProvider = 'khaya' | 'sunbird' | 'gemini';
export interface TranslationHop { source: string; target: string; provider: TranslationProvider; }
export function requireLanguage(code: string): void {
  if (!(LANGUAGE_CODES as readonly string[]).includes(code)) throw new Error(`Unsupported language code: ${code}`);
}
export function speechProvider(code: string): TranslationProvider {
  requireLanguage(code);
  return ['ak','tw-ak','fat','ee','gaa','ha'].includes(code) ? 'khaya'
    : ['sw','lg'].includes(code) ? 'sunbird' : 'gemini';
}
export function mtProvider(code: string): TranslationProvider | null {
  requireLanguage(code);
  // Separate Akuapem speech support does not establish a distinct MT contract.
  if (code === 'tw-ak') return null;
  return ['ak','fat','ee','gaa'].includes(code) ? 'khaya'
    : ['sw','lg'].includes(code) ? 'sunbird' : 'gemini';
}
export function planTranslation(source: string, target: string) {
  requireLanguage(source); requireLanguage(target);
  const a = mtProvider(source), b = mtProvider(target);
  const supported = source === target || Boolean(a && b);
  const hops: TranslationHop[] = [];
  if (source !== target && supported) {
    if (source === 'en' || target === 'en' || (a === b && a !== 'khaya')) {
      hops.push({ source, target, provider: (source === 'en' ? b : a)! });
    } else {
      hops.push({ source, target: 'en', provider: a! }, { source: 'en', target, provider: b! });
    }
  }
  return {
    source, target, supported, hops,
    requiresPivot: hops.length > 1,
    asrProvider: speechProvider(source), ttsProvider: speechProvider(target),
    reason: supported ? null : 'A distinct Akuapem Twi translation provider has not been implemented and verified.',
  };
}
export const azureLanguageCode = (code: string) => code === 'lg' ? 'lug' : code === 'zh' ? 'zh-Hans' : code;
export const khayaSpeechCode = (code: string) => ({ ak:'twi', 'tw-ak':'atw', ee:'ewe', ha:'hau', en:'eng', fr:'fra' }[code] || code);
export const sunbirdSpeechCode = (code: string) => ({ en:'eng', sw:'swa', lg:'lug' }[code] || code);
