import { TtsResult } from '../types';

export interface ITtsProvider {
  id: string;
  name: string;
  canSynthesize(language: string): boolean;
  synthesize(text: string, language: string): Promise<TtsResult>;
  speakInBrowser(text: string, language: string): Promise<void>;
}
