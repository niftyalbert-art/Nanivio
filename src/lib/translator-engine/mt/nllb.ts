import { IMtProvider } from './interface';
import { MtResult } from '../types';

/**
 * NLLB / Neural Fallback Provider
 * Multi-lingual direct transformer fallback supporting 200+ languages
 */
export class NllbMtProvider implements IMtProvider {
  public id = 'nllb';
  public name = 'NLLB-200 / Neural Universal Router';

  public canHandle(sourceLang: string, targetLang: string): boolean {
    return true; // Universal fallback
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
        return {
          translatedText: data.translatedText || text,
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

    return {
      translatedText: text,
      sourceLang,
      targetLang,
      provider: 'nllb',
      latencyMs: Date.now() - start,
      confidence: 0.8,
    };
  }
}
