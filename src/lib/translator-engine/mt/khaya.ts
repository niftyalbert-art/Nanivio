import { IMtProvider } from './interface';
import { MtResult } from '../types';

/**
 * Khaya AI / Ghana NLP Provider
 * Dedicated specialized model for West African languages:
 * Twi / Akan (ak), Akuapem Twi (tw-ak), Fante (fat), Ewe (ee), Ga (gaa)
 */
export class KhayaMtProvider implements IMtProvider {
  public id = 'khaya';
  public name = 'Khaya AI (Ghana NLP)';
  public specializedLanguages = ['ak', 'tw-ak', 'fat', 'ee', 'gaa'];

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
          preferredProvider: 'khaya',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          translatedText: data.translatedText || '',
          sourceLang,
          targetLang,
          provider: 'khaya',
          latencyMs: Date.now() - start,
          confidence: 0.95,
        };
      }
    } catch (e) {
      console.warn('Khaya MT error, falling back:', e);
    }

    throw new Error(`Khaya translation unavailable for ${sourceLang} -> ${targetLang}.`);
  }
}
