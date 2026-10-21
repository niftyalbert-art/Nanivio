export interface ChatTranslationState {
  translatedText?: string;
  translationStatus?: 'translated' | 'unavailable';
  translationTargetLang?: string;
}

/** Preserve the original on failure, but never label that fallback as translated. */
export async function prepareChatTranslation(
  text: string,
  source: string,
  target: string | undefined,
  enabled: boolean,
  translate: (text: string, source: string, target: string) => Promise<{ translatedText: string }>,
): Promise<ChatTranslationState> {
  if (!enabled || !target || source === target) return {};
  try {
    const result = await translate(text, source, target);
    if (!result?.translatedText?.trim()) throw new Error('Empty translation');
    return { translatedText: result.translatedText, translationStatus: 'translated', translationTargetLang: target };
  } catch {
    return { translationStatus: 'unavailable', translationTargetLang: target };
  }
}
