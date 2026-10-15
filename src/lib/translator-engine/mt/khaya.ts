import { IMtProvider } from './interface';
import { MtResult } from '../types';
import { authClient } from '../../authClient';

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
        headers: {
          'Content-Type': 'application/json',
          ...(authClient.getToken() ? { Authorization: `Bearer ${authClient.getToken()}` } : {}),
        },
        body: JSON.stringify({
          text,
          sourceLang,
          targetLang,
          preferredProvider: 'khaya',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success !== true || data.untranslated ||
          typeof data.translatedText !== 'string' || !data.translatedText.trim()) {
          throw new Error(data.error || 'Khaya provider did not return a translation.');
        }
        return {
          translatedText: data.translatedText || '',
          sourceLang,
          targetLang,
          provider: data.provider,
          providerChain: data.providerChain,
          latencyMs: Date.now() - start,
        };
      }
    } catch (e) {
      console.warn('Khaya MT error, falling back:', e);
    }

    throw new Error(`Khaya translation unavailable for ${sourceLang} -> ${targetLang}.`);
  }
}
