import { IMtProvider } from './interface';
import { MtResult } from '../types';
export class AzureMtProvider implements IMtProvider {
  public id='azure'; public name='Azure Translator';
  public canHandle(_sourceLang:string,_targetLang:string){ return true; }
  public async translate(text:string,sourceLang:string,targetLang:string):Promise<MtResult>{
    const start=Date.now(); const r=await fetch('/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,sourceLang,targetLang,preferredProvider:'azure'})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data.translatedText||data.untranslated) throw new Error(data.error||'Azure translation unavailable');
    return {translatedText:data.translatedText,sourceLang,targetLang,provider:'azure',latencyMs:Date.now()-start,confidence:.95,pivotUsed:!!data.pivotUsed};
  }
}
