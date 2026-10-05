import { IMtProvider } from './interface';
import { MtResult } from '../types';

/**
 * NLLB / Neural Fallback Provider
 * Multi-lingual direct transformer fallback supporting 200+ languages
 */
export class NllbMtProvider implements IMtProvider {
  public id = 'nllb';
  public name = 'NLLB-200 / Neural Universal Router';

  public canHandle(_sourceLang: string, _targetLang: string): boolean {
    return false; // No local NLLB service is bundled; never claim universal coverage without a configured provider.
  }

  public async translate(text: string, sourceLang: string, targetLang: string): Promise<MtResult> {
    const start = Date.now();
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          sourceLang,
          targetLang,
          preferredProvider: 'nllb',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.untranslated || !data.translatedText) throw new Error(data.error || 'NLLB translation unavailable');
        return {
          translatedText: data.translatedText,
          sourceLang,
          targetLang,
          provider: 'nllb',
          latencyMs: Date.now() - start,
          confidence: 0.92,
        };
      }
    } catch (e) {
      console.warn('NLLB MT error:', e);
    }

    throw new Error(`NLLB provider is not configured or failed for ${sourceLang} -> ${targetLang}.`);
  }
}
