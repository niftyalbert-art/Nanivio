import { AzureMtProvider } from '../mt/azure';
import { NANIVIO_18_LANGUAGES, AUTHORITATIVE_18_LANG_CODES, type CapabilityLevel, type RealtimeStrategy } from '../matrix/universal18Matrix';
import { planTranslation, speechProvider, mtProvider } from '../languagePlan';
import type { IMtProvider } from '../mt/interface';

export type LangpretationMode = 'CALL' | 'VIDEO_CALL' | 'VOICE_NOTE' | 'TEXT' | 'LIVE_TRANSLATION';
export interface CompleteRoutePlan {
  sourceLang:string; targetLang:string; mode:LangpretationMode; capabilityStatus:CapabilityLevel;
  asrProvider:string; mtProvider:string; ttsProvider:string; realtimeStrategy:RealtimeStrategy;
  fallbackProvider:string; requiresPivot:boolean; pivotLanguage?:string;
  canExecuteRealtimeAudio:boolean; canExecuteVoiceNote:boolean; estimatedLatencyMs:number | null;
}
export interface RouteDecision {
  providerId:'khaya'|'sunbird'|'azure'|'nllb'; provider:IMtProvider; fallbackProviders:IMtProvider[];
  requiresPivot:boolean; pivotLanguage?:string; estimatedLatencyMs:number | null;
}
export interface Language18MatrixItem {
  code:string; name:string; region:string; flag:string;
  primaryProvider:'Khaya AI'|'Sunbird AI'|'Azure Translator'|'NLLB-200'|'Unavailable';
  fallbackProvider:string; pivotRequiredForNonEnglish:boolean; asrSupported:boolean; ttsSupported:boolean;
  subSecondLatencyCapable:boolean;
}
export class LanguageRouter {
  // This adapter delegates the complete plan to the authenticated server and
  // reports its actual provider, including multi-provider chains.
  private server = new AzureMtProvider();
  public route(sourceLang:string,targetLang:string,mode:LangpretationMode):CompleteRoutePlan {
    const plan=planTranslation(sourceLang,targetLang);
    const same=sourceLang===targetLang;
    const active=NANIVIO_18_LANGUAGES[sourceLang].active && NANIVIO_18_LANGUAGES[targetLang].active;
    return {
      sourceLang,targetLang,mode,
      capabilityStatus:!active||!plan.supported?'UNAVAILABLE':same?'FULL':'NOT_VERIFIED',
      asrProvider:plan.asrProvider,mtProvider:same?'DIRECT_PASSTHROUGH':plan.hops.map(h=>h.provider).join(' -> en -> ')||'UNAVAILABLE',
      ttsProvider:plan.ttsProvider,realtimeStrategy:same?'STREAMING_FULL_DUPLEX':'PIPELINE_STT_MT_TTS',
      fallbackProvider:'NONE',requiresPivot:plan.requiresPivot,pivotLanguage:plan.requiresPivot?'en':undefined,
      // A pure browser plan cannot establish server credentials or provider health.
      canExecuteRealtimeAudio:same&&active,canExecuteVoiceNote:same&&active,estimatedLatencyMs:null,
    };
  }
  public resolveRoute(sourceLang:string,targetLang:string):RouteDecision {
    const plan=planTranslation(sourceLang,targetLang);
    return {providerId:plan.hops[0]?.provider||'azure',provider:this.server,fallbackProviders:[],
      requiresPivot:plan.requiresPivot,pivotLanguage:plan.requiresPivot?'en':undefined,estimatedLatencyMs:null};
  }
  public get18LanguageMatrix():Language18MatrixItem[] {
    return AUTHORITATIVE_18_LANG_CODES.map(code=>{
      const language=NANIVIO_18_LANGUAGES[code],provider=mtProvider(code);
      return {code,name:language.name,region:language.region,flag:language.flag,
        primaryProvider:provider==='khaya'?'Khaya AI':provider==='sunbird'?'Sunbird AI':provider==='azure'?'Azure Translator':'Unavailable',
        fallbackProvider:'NONE',pivotRequiredForNonEnglish:provider==='khaya',
        asrSupported:false,ttsSupported:false,subSecondLatencyCapable:false};
    });
  }
}
