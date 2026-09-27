import { IAsrProvider } from './interface';
import { PalabraAsrProvider } from './palabra';
import { LocalSpeechAsrProvider } from './local';
import { AudioSegment, AsrResult } from '../types';

export class AsrSubsystem {
  private providers: IAsrProvider[] = [
    new PalabraAsrProvider(),
    new LocalSpeechAsrProvider(),
  ];

  public async transcribe(segment: AudioSegment, language: string): Promise<AsrResult> {
    // Try primary provider that supports the language
    const primary = this.providers.find((p) => p.isLanguageSupported(language)) || this.providers[0];

    try {
      return await primary.transcribe(segment, language);
    } catch (err) {
      console.warn(`Primary ASR [${primary.name}] failed, falling back to local speech ASR:`, err);
      const fallback = this.providers.find((p) => p.id !== primary.id) || this.providers[1];
      return await fallback.transcribe(segment, language);
    }
  }

  public getSupportedLanguages(): string[] {
    const set = new Set<string>();
    for (const p of this.providers) {
      for (const lang of p.supportedLanguages) {
        set.add(lang);
      }
    }
    return Array.from(set);
  }
}
