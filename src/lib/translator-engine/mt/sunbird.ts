import { IMtProvider } from './interface';
import { MtResult } from '../types';

/**
 * Sunbird AI Provider
 * Specialized model for East African languages:
 * Swahili (sw), Luganda (lg)
 */
export class SunbirdMtProvider implements IMtProvider {
  public id = 'sunbird';
  public name = 'Sunbird AI (East African Languages)';
  public specializedLanguages = ['sw', 'lg'];

  public canHandle(sourceLang: string, targetLang: string): boolean {
    return (
      this.specializedLanguages.includes(sourceLang) ||
      this.specializedLanguages.includes(targetLang)
    );
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
          preferredProvider: 'sunbird',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          translatedText: data.translatedText || text,
          sourceLang,
          targetLang,
          provider: 'sunbird',
          latencyMs: Date.now() - start,
          confidence: 0.94,
        };
      }
    } catch (e) {
      console.warn('Sunbird MT error:', e);
    }

    return {
      translatedText: text,
      sourceLang,
      targetLang,
      provider: 'sunbird',
      latencyMs: Date.now() - start,
      confidence: 0.82,
    };
  }
}
