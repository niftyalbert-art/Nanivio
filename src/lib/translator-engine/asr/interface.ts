import { AudioSegment, AsrResult } from '../types';

export interface IAsrProvider {
  id: string;
  name: string;
  supportedLanguages: string[];
  transcribe(segment: AudioSegment, language: string): Promise<AsrResult>;
  isLanguageSupported(language: string): boolean;
}
