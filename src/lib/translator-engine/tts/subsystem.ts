import { ITtsProvider } from './interface';
import { KhayaTtsProvider } from './khaya';
import { SunbirdTtsProvider, PalabraTtsProvider, LocalSpeechTtsProvider } from './providers';
import { TtsResult } from '../types';

export class TtsSubsystem {
  private providers: ITtsProvider[] = [
    new KhayaTtsProvider(),
    new SunbirdTtsProvider(),
    new PalabraTtsProvider(),
    new LocalSpeechTtsProvider(),
  ];

  public resolveProvider(language: string): ITtsProvider {
    return this.providers.find((p) => p.canSynthesize(language)) || this.providers[3];
  }

  public async synthesize(text: string, language: string): Promise<TtsResult> {
    const provider = this.resolveProvider(language);
    try {
      return await provider.synthesize(text, language);
    } catch (err) {
      console.warn(`Primary TTS [${provider.name}] failed, falling back to local speech synthesis:`, err);
      return await this.providers[3].synthesize(text, language);
    }
  }

  public async speakInBrowser(text: string, language: string): Promise<void> {
    const provider = this.resolveProvider(language);
    try {
      await provider.speakInBrowser(text, language);
    } catch (err) {
      console.warn('TTS speech synthesis playback error:', err);
      // Fallback
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(u);
      }
    }
  }
}
