/** Recorded-note speech coverage, not linguistic verification.
 * Specialist note routes remain unchanged; live-call coverage is selected below.
 */
export const PALABRA_LANGUAGES = ['en','fr','es','ar','de','it','pt','zh','ja','ko'] as const;
export function supportsPalabraPair(source: string, target: string): boolean {
  return source !== target && PALABRA_LANGUAGES.some(code => code === source)
    && PALABRA_LANGUAGES.some(code => code === target);
}

/** Live-call coverage is separate from recorded voice-note routing. Swahili
 * supports speech translation but not Palabra voice creation/cloning.
 * Configuration is not native-speaker quality certification.
 */
export const PALABRA_LIVE_LANGUAGES = [...PALABRA_LANGUAGES,'sw'] as const;
export function supportsPalabraLivePair(source:string,target:string):boolean {
  return source!==target&&PALABRA_LIVE_LANGUAGES.some(code=>code===source)
    &&PALABRA_LIVE_LANGUAGES.some(code=>code===target);
}
export function supportsPalabraVoiceCloning(source:string,target:string):boolean {
  return supportsPalabraPair(source,target);
}
