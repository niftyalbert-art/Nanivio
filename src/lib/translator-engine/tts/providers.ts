import { ITtsProvider } from './interface';
import { TtsResult } from '../types';

export class SunbirdTtsProvider implements ITtsProvider {
  public id = 'sunbird-tts';
  public name = 'Sunbird African Neural Voice';
  public supportedLanguages = ['sw', 'lg'];

  public canSynthesize(language: string): boolean {
    return this.supportedLanguages.includes(language);
  }

  public async synthesize(text: string, language: string): Promise<TtsResult> {
    const start = Date.now();
    return {
      durationMs: 1200,
      provider: 'sunbird-tts',
      latencyMs: Date.now() - start,
    };
  }

  public async speakInBrowser(text: string, language: string): Promise<void> {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(u);
    }
  }
}

export class PalabraTtsProvider implements ITtsProvider {
  public id = 'palabra-tts';
  public name = 'Palabra Realtime Fast Voice';
  public supportedLanguages = ['en', 'fr', 'es', 'ar', 'de', 'it', 'pt', 'zh', 'ja', 'ko'];

  public canSynthesize(language: string): boolean {
    return this.supportedLanguages.includes(language);
  }

  public async synthesize(text: string, language: string): Promise<TtsResult> {
    const start = Date.now();
    return {
      durationMs: 1000,
      provider: 'palabra-tts',
      latencyMs: Date.now() - start,
    };
  }

  public async speakInBrowser(text: string, language: string): Promise<void> {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(u);
    }
  }
}

export class LocalSpeechTtsProvider implements ITtsProvider {
  public id = 'local-speech-tts';
  public name = 'Web Speech API Voice Synthesis';

  public canSynthesize(language: string): boolean {
    return true;
  }

  public async synthesize(text: string, language: string): Promise<TtsResult> {
    const start = Date.now();
    return {
      durationMs: 800,
      provider: 'local-speech-tts',
      latencyMs: Date.now() - start,
    };
  }

  public async speakInBrowser(text: string, language: string): Promise<void> {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(u);
    }
  }
}
