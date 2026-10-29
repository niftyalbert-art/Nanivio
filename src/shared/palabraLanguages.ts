/** Palabra speech-to-speech coverage selected for Nanivio, not linguistic verification.
 * Specialist African routes remain unchanged, even where Palabra also lists Swahili.
 */
export const PALABRA_LANGUAGES = ['en','fr','es','ar','de','it','pt','zh','ja','ko'] as const;
export function supportsPalabraPair(source: string, target: string): boolean {
  return source !== target && PALABRA_LANGUAGES.some(code => code === source)
    && PALABRA_LANGUAGES.some(code => code === target);
}
