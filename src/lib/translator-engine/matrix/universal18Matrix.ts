import { LANGUAGE_CODES, mtProvider, planTranslation, speechProvider } from '../languagePlan';
export type CapabilityLevel = 'FULL' | 'PARTIAL' | 'TEXT_ONLY' | 'RECOGNITION_ONLY' | 'TTS_ONLY' | 'UNAVAILABLE' | 'NOT_VERIFIED';
export type RealtimeStrategy = 'STREAMING_FULL_DUPLEX' | 'VAD_CHUNKED_TURN' | 'PIPELINE_STT_MT_TTS' | 'TEXT_ONLY';
export interface MatrixLanguageInfo {
  code:string; name:string; nativeName:string; region:string; flag:string;
  family:'Akan / Volta-Niger'|'Kwa'|'Chadic'|'Bantu'|'Semitic'|'Indo-European'|'Sino-Tibetan'|'Japonic'|'Koreanic';
  isAfrican:boolean; capability:CapabilityLevel; speechRecognition:boolean; translation:boolean;
  textToSpeech:boolean; realtimeSpeechTranslation:boolean; voiceNotes:boolean; twoWayConversation:boolean;
  realtimeStrategy:RealtimeStrategy; specializedAfricanInfrastructure:boolean; active:boolean;
  provider:string; asrProvider:string; mtProvider:string; ttsProvider:string; costPerMinuteUsd:number|null;
  notes:string; lastVerified:number|null; defaultAsrProvider:'khaya'|'sunbird'|'gemini';
  defaultMtProvider:'khaya'|'sunbird'|'gemini'|'nllb'|'unavailable'; defaultTtsProvider:'khaya'|'sunbird'|'gemini';
}
type Description = [string,string,string,string,MatrixLanguageInfo['family']];
const descriptions:Record<string,Description> = {
  en:['English','English','International','🇬🇧','Indo-European'],
  fr:['French','Français','International','🇫🇷','Indo-European'],
  es:['Spanish','Español','International','🇪🇸','Indo-European'],
  ar:['Arabic','العربية','International','🇸🇦','Semitic'],
  de:['German','Deutsch','International','🇩🇪','Indo-European'],
  it:['Italian','Italiano','International','🇮🇹','Indo-European'],
  pt:['Portuguese','Português','International','🇵🇹','Indo-European'],
  zh:['Mandarin Chinese','普通话','International','🇨🇳','Sino-Tibetan'],
  ja:['Japanese','日本語','International','🇯🇵','Japonic'],
  ko:['Korean','한국어','International','🇰🇷','Koreanic'],
  sw:['Swahili','Kiswahili','East Africa','🇰🇪','Bantu'],
  lg:['Luganda','Luganda','Uganda','🇺🇬','Bantu'],
  ha:['Hausa','Hausa','West Africa','🇳🇬','Chadic'],
  ak:['Twi / Akan','Twi','Ghana','🇬🇭','Akan / Volta-Niger'],
  'tw-ak':['Akuapem Twi','Akuapem Twi','Ghana','🇬🇭','Akan / Volta-Niger'],
  fat:['Fante','Mfantse','Ghana','🇬🇭','Akan / Volta-Niger'],
  ee:['Ewe','Eʋegbe','Ghana / Togo','🇬🇭','Kwa'],
  gaa:['Ga','Gã','Ghana','🇬🇭','Kwa'],
};
export const AUTHORITATIVE_18_LANG_CODES:string[]=[...LANGUAGE_CODES];
/** Static declarations never assert deployed credentials, availability or live verification. */
export const NANIVIO_18_LANGUAGES:Record<string,MatrixLanguageInfo>=Object.fromEntries(
  LANGUAGE_CODES.map(code=>{
    const [name,nativeName,region,flag,family]=descriptions[code], speech=speechProvider(code),mt=mtProvider(code);
    return [code,{code,name,nativeName,region,flag,family,isAfrican:speech!=='gemini',
      capability:mt?'NOT_VERIFIED':'UNAVAILABLE',speechRecognition:false,translation:Boolean(mt),
      textToSpeech:false,realtimeSpeechTranslation:false,voiceNotes:false,twoWayConversation:false,
      realtimeStrategy:'PIPELINE_STT_MT_TTS',specializedAfricanInfrastructure:speech!=='gemini',active:true,
      provider:mt||'unavailable',asrProvider:speech,mtProvider:mt||'unavailable',ttsProvider:speech,
      costPerMinuteUsd:null,lastVerified:null,
      notes:mt?'Declared provider contract; configuration and real output must be checked separately.'
        :'Distinct Akuapem translation is not implemented. Generic Twi is not substituted.',
      defaultAsrProvider:speech,defaultMtProvider:mt||'unavailable',defaultTtsProvider:speech}];
  }),
);
export function getLanguageCapability(code:string):MatrixLanguageInfo {
  const language=Object.prototype.hasOwnProperty.call(NANIVIO_18_LANGUAGES,code)?NANIVIO_18_LANGUAGES[code]:undefined;
  if(!language)throw new Error(`Unsupported language code: ${code}`);
  return language;
}
export function getAll18LanguagesCapabilityList(){return Object.values(NANIVIO_18_LANGUAGES);}
export type PairStatus='LIVE VERIFIED'|'PARTIAL'|'NOT VERIFIED'|'UNSUPPORTED';
export interface MatrixPairEntry {
  sourceLang:string; sourceName:string; targetLang:string; targetName:string;
  asrProvider:string; mtProvider:string; ttsProvider:string; route:'DIRECT'|'PIVOT';
  pivotLanguage?:string; status:PairStatus; measuredLatencyMs:number|null; fallback:string;
}
export function buildUniversal18x18Matrix():MatrixPairEntry[] {
  return LANGUAGE_CODES.flatMap(source=>LANGUAGE_CODES.map(target=>{
    const plan=planTranslation(source,target),same=source===target;
    return {sourceLang:source,sourceName:descriptions[source][0],targetLang:target,targetName:descriptions[target][0],
      asrProvider:same?'NONE':plan.asrProvider,mtProvider:same?'NONE':plan.hops.map(h=>h.provider).join(' → en → ')||'UNAVAILABLE',
      ttsProvider:same?'NONE':plan.ttsProvider,route:plan.requiresPivot?'PIVOT' as const:'DIRECT' as const,
      pivotLanguage:plan.requiresPivot?'en':undefined,status:plan.supported?'NOT VERIFIED' as const:'UNSUPPORTED' as const,
      measuredLatencyMs:null,fallback:same?'ORIGINAL AUDIO (NO TRANSLATION NEEDED)':'NONE'};
  }));
}
