import { AudioSegment, AsrResult } from '../types';
export class AsrSubsystem {
  public async transcribe(_segment:AudioSegment, language:string):Promise<AsrResult>{
    throw new Error(`Production ASR for ${language} is performed by the Azure Speech browser session; raw server-side ASR is not simulated.`);
  }
  public getSupportedLanguages(){ return ['en','fr','es','ar','de','it','pt','zh','ja','ko','sw','ha','lg']; }
}
