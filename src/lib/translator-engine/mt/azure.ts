import { IMtProvider } from './interface';
import { MtResult } from '../types';
import { authClient } from '../../authClient';
export class AzureMtProvider implements IMtProvider {
  public id='azure'; public name='Azure Translator';
  public canHandle(_sourceLang:string,_targetLang:string){ return true; }
  public async translate(text:string,sourceLang:string,targetLang:string):Promise<MtResult>{
    const token=authClient.getToken();
    const start=Date.now(); const r=await fetch('/api/translate',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({text,sourceLang,targetLang,preferredProvider:'azure'})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok||data.success!==true||!data.translatedText||data.untranslated) throw new Error(data.error||'Azure translation unavailable');
    return {translatedText:data.translatedText,sourceLang,targetLang,provider:data.provider,providerChain:data.providerChain,latencyMs:Date.now()-start,pivotUsed:!!data.pivotUsed};
  }
}
