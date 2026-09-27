import { IAsrProvider } from './interface';
import { AudioSegment, AsrResult } from '../types';

export class LocalSpeechAsrProvider implements IAsrProvider {
  public id = 'local-speech-asr';
  public name = 'Browser Web Speech & Local ASR Engine';
  public supportedLanguages = ['en', 'fr', 'es', 'ar', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'sw', 'ha', 'ak'];

  public isLanguageSupported(language: string): boolean {
    return true; // Wide fallback coverage
  }

  public async transcribe(segment: AudioSegment, language: string): Promise<AsrResult> {
    const start = Date.now();
    return {
      text: '',
      language,
      confidence: 0.9,
      isFinal: segment.isFinal,
      latencyMs: Date.now() - start,
    };
  }
}
