import { ITtsProvider } from './interface';
import { TtsResult } from '../types';
import { authenticatedFetch } from '../../authenticatedFetch';
import { requireLanguage } from '../languagePlan';

class ProductionTtsProvider implements ITtsProvider {
  public id='production-tts'; public name='Nanivio Production TTS';
  public canSynthesize(language:string){try{requireLanguage(language);return true;}catch{return false;}}
  public async synthesize(text:string,language:string):Promise<TtsResult>{
    requireLanguage(language);
    const start=Date.now(); const r=await authenticatedFetch('/api/langpretation/synthesize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,language})});
    const data=await r.json(); if(!r.ok||!data.audioBase64) throw new Error(data.error||'TTS unavailable');
    const raw=atob(data.audioBase64); const bytes=new Uint8Array(raw.length); for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return {audioBuffer:bytes.buffer,durationMs:null,provider:data.provider,latencyMs:Date.now()-start};
  }
  public async speakInBrowser(text:string,language:string){ const {speechService}=await import('../../../services/speechService'); await speechService.speak(text,language); }
}
export class TtsSubsystem {
  private provider=new ProductionTtsProvider();
  public resolveProvider(_language:string){return this.provider;}
  public async synthesize(text:string,language:string){return this.provider.synthesize(text,language);}
  public async speakInBrowser(text:string,language:string){return this.provider.speakInBrowser(text,language);}
}
