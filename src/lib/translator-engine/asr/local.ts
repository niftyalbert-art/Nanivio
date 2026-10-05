import { IAsrProvider } from './interface';
import { AudioSegment, AsrResult } from '../types';

export class LocalSpeechAsrProvider implements IAsrProvider {
  public id = 'local-speech-asr-disabled';
  public name = 'Browser Local ASR (disabled for production)';
  public supportedLanguages: string[] = [];
  public isLanguageSupported(_language: string): boolean { return false; }
  public async transcribe(_segment: AudioSegment, language: string): Promise<AsrResult> {
    throw new Error(`Browser-local ASR is not a production provider for ${language}. Use Azure Speech or a configured African ASR provider.`);
  }
}
