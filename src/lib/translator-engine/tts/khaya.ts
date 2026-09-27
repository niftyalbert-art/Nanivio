import { ITtsProvider } from './interface';
import { TtsResult } from '../types';

export class KhayaTtsProvider implements ITtsProvider {
  public id = 'khaya-tts';
  public name = 'Khaya African Neural Voice';
  public supportedLanguages = ['ak', 'tw-ak', 'fat', 'ee', 'gaa'];

  public canSynthesize(language: string): boolean {
    return this.supportedLanguages.includes(language);
  }

  public async synthesize(text: string, language: string): Promise<TtsResult> {
    const start = Date.now();
    return {
      durationMs: 1200,
      provider: 'khaya-tts',
      latencyMs: Date.now() - start,
    };
  }

  public async speakInBrowser(text: string, language: string): Promise<void> {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      window.speechSynthesis.speak(u);
    }
  }
}
