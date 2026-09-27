import { MtResult } from '../types';

export interface IMtProvider {
  id: string;
  name: string;
  canHandle(sourceLang: string, targetLang: string): boolean;
  translate(text: string, sourceLang: string, targetLang: string): Promise<MtResult>;
}
