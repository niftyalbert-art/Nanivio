import { speechProvider, khayaSpeechCode, sunbirdSpeechCode } from '../lib/translator-engine/languagePlan.ts';
import { LangpretationGeminiError, transcribeGeminiAudio, synthesizeGeminiAudio, type GeminiRequestDiagnostic } from './langpretationGemini.ts';
import {requestSpeechAudio} from './speechAudioTransport.ts';
import {usableSpeechTranscript} from '../shared/speechTranscript.ts';

export const SPEECH_LOCALES:Record<string,string>={en:'en-US',fr:'fr-FR',es:'es-ES',ar:'ar-SA',de:'de-DE',it:'it-IT',pt:'pt-BR',zh:'zh-CN',ja:'ja-JP',ko:'ko-KR'};
const voices:Record<string,string>={en:'en-US-JennyNeural',fr:'fr-FR-DeniseNeural',es:'es-ES-ElviraNeural',ar:'ar-SA-ZariyahNeural',de:'de-DE-KatjaNeural',it:'it-IT-ElsaNeural',pt:'pt-BR-FranciscaNeural',zh:'zh-CN-XiaoxiaoNeural',ja:'ja-JP-NanamiNeural',ko:'ko-KR-SunHiNeural'};
export type SpeechUpstreamDiagnostic={
  provider:'khaya'|'sunbird';
  operation:'recognition'|'translation'|'synthesis';
  upstreamHttpStatus?:number;
  failure:'limit'|'authentication'|'authorization'|'configuration'|'upstream'|'timeout'|'transport'|'invalid_response'|'cancelled';
};
export class SpeechProviderError extends Error {
  constructor(public status:number,message:string,public diagnostic?:GeminiRequestDiagnostic,
    public upstreamDiagnostic?:SpeechUpstreamDiagnostic){super(message);}
  get code(){
    const failure=this.upstreamDiagnostic?.failure;
    const status=this.diagnostic?.upstreamHttpStatus;
    return failure==='limit'||status===429||this.diagnostic?.providerStatus==='RESOURCE_EXHAUSTED'
      ?'SPEECH_SERVICE_LIMIT':
      failure==='authentication'||failure==='authorization'||failure==='configuration'||status===401||status===403||status===404
      ?'SPEECH_SERVICE_CONFIGURATION':undefined;
  }
}
type SpeechOptions={provider?:'khaya';signal?:AbortSignal};
export function speechConfigured(language:string,operation:'asr'|'tts',provider=speechProvider(language)):boolean {
  if(provider==='gemini')return Boolean(process.env.GEMINI_API_KEY);
  if(provider==='sunbird')return Boolean(process.env.SUNBIRD_API_KEY);
  return Boolean(process.env.KHAYA_API_KEY);
}
function endpoint(value:string) {
  const url=new URL(value);
  if(url.protocol!=='https:')throw new SpeechProviderError(503,'Speech endpoints must use HTTPS.');
  return url;
}
async function boundedBody(response:Response,max=8*1024*1024,signal?:AbortSignal):Promise<Buffer>{
  if(!response.body)throw new SpeechProviderError(502,'Speech provider returned no body.');
  const parts:Buffer[]=[];let size=0;
  const reader=response.body.getReader();
  let abort=()=>{};
  const aborted=new Promise<never>((_,reject)=>{
    abort=()=>{reject(new SpeechProviderError(504,'Speech response took too long.'));void reader.cancel().catch(()=>{});};
  });
  signal?.addEventListener('abort',abort,{once:true});
  try{
    if(signal?.aborted)abort();
    while(true){
      const {value,done}=await Promise.race([reader.read(),aborted]);
      // Cancelling the reader can resolve read() with done:true before its
      // rejection wins the race. Never return that partial body as complete.
      if(signal?.aborted)throw new SpeechProviderError(504,'Speech response took too long.');
      if(done)break;
      size+=value.length;
      if(size>max)throw new SpeechProviderError(502,'Speech provider response exceeded the audio limit.');
      parts.push(Buffer.from(value));
    }
    // Fetch transparently decodes compressed bodies, so only compare lengths
    // when the wire body and returned bytes use the same representation.
    const length=response.headers.get('content-length');
    const encoding=response.headers.get('content-encoding');
    if((!encoding||encoding==='identity')&&length!==null&&/^\d+$/.test(length)&&Number(length)!==size)
      throw new SpeechProviderError(502,'Speech provider returned an incomplete response.');
  }catch(error){
    if(signal?.aborted)throw new SpeechProviderError(504,'Speech response took too long.');
    if(error instanceof SpeechProviderError)throw error;
    throw new SpeechProviderError(502,'Speech provider response download was interrupted.');
  }finally{
    signal?.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});
  }
  return Buffer.concat(parts);
}
async function speechHttpError(response:Response,provider:'khaya'|'sunbird',
  operation:SpeechUpstreamDiagnostic['operation'],signal:AbortSignal){
  // Inspect a bounded error body only to classify the failure. Never expose it,
  // credentials, endpoint URLs or provider account details to clients or logs.
  const body=response.body?(await boundedBody(response,65536,signal)).toString('utf8'):'';
  const limited=response.status===429||response.status===403&&
    /\b(quota|credits?|exceeded|capacity)\b|rate[\s_-]*limit/i.test(body);
  const failure:SpeechUpstreamDiagnostic['failure']=limited?'limit':
    response.status===401?'authentication':response.status===403?'authorization':'upstream';
  const diagnostic={provider,operation,upstreamHttpStatus:response.status,failure};
  return new SpeechProviderError(failure==='upstream'?502:503,
    limited?'Nanivio speech is temporarily unavailable because the speech service has reached its limit. Please try again later.':
      failure==='authentication'||failure==='authorization'
        ?'Nanivio speech is temporarily unavailable. Please contact Nanivio support.'
        :'Nanivio speech could not complete this request. Please try again later.',
    undefined,diagnostic);
}
export function wavDurationSeconds(bytes:Buffer):number|null {
  if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')return null;
  let byteRate=0,blockAlign=0,data=0;
  for(let offset=12;offset+8<=bytes.length;){
    const size=bytes.readUInt32LE(offset+4),end=offset+8+size;
    if(end>bytes.length)return null;
    const type=bytes.toString('ascii',offset,offset+4);
    if(type==='fmt '&&size>=16){
      if(byteRate)return null;
      const format=bytes.readUInt16LE(offset+8),channels=bytes.readUInt16LE(offset+10);
      const sampleRate=bytes.readUInt32LE(offset+12),bits=bytes.readUInt16LE(offset+22);
      byteRate=bytes.readUInt32LE(offset+16);
      blockAlign=bytes.readUInt16LE(offset+20);
      if(![1,3].includes(format)||(format===1&&![8,16,24,32].includes(bits))||
        (format===3&&![32,64].includes(bits))||!channels||!sampleRate||!bits||bits%8||
        blockAlign!==channels*(bits/8)||byteRate!==sampleRate*blockAlign)return null;
    }
    if(type==='data')data+=size;
    offset=end+(size%2);
  }
  return byteRate>0&&blockAlign>0&&data>0&&data%blockAlign===0?data/byteRate:null;
}
export async function transcribeProviderAudio(audio:Buffer,language:string,contentType='audio/wav',options:SpeechOptions={}){
  if(!audio.length||audio.length>4*1024*1024)throw new SpeechProviderError(400,'Audio must be nonempty and smaller than 4 MB.');
  const provider=options.provider??speechProvider(language);
  if(options.signal?.aborted)throw new SpeechProviderError(499,'Speech request was cancelled.');
  if(!speechConfigured(language,'asr',provider))throw new SpeechProviderError(503,'Nanivio speech recognition is not configured for this language.');
  if(provider==='gemini'){
    if(!wavDurationSeconds(audio))throw new SpeechProviderError(400,'A valid PCM WAV recording is required.');
    try {
      const result=await transcribeGeminiAudio(audio,language,contentType,options.signal);
      if(!usableSpeechTranscript(result.text))throw new SpeechProviderError(502,'The speech provider returned an unusable transcript. Please record your message again.');
      return {...result,durationSeconds:wavDurationSeconds(audio)};
    }
    catch(error){if(error instanceof LangpretationGeminiError)throw new SpeechProviderError(error.status,error.message,error.diagnostic);throw error;}
  }
  let url:URL,headers:Record<string,string>,body:any;
  if(provider==='khaya'){
    url=endpoint(process.env.KHAYA_ASR_URL||'https://translation-api.ghananlp.org/asr/v3/transcribe');url.searchParams.set('language',khayaSpeechCode(language));
    headers={'Content-Type':contentType,'Ocp-Apim-Subscription-Key':process.env.KHAYA_API_KEY!};body=audio;
  }else if(provider==='sunbird'){
    url=endpoint(process.env.SUNBIRD_ASR_URL||'https://api.sunbird.ai/tasks/audio/transcriptions');
    headers={Authorization:`Bearer ${process.env.SUNBIRD_API_KEY}`};
    const form=new FormData();form.set('language',sunbirdSpeechCode(language));form.set('audio',new Blob([new Uint8Array(audio)],{type:contentType}),'recording.wav');body=form;
  }else{throw new SpeechProviderError(400,'Unsupported speech recognition provider.');}
  let response:Response;
  const signal=AbortSignal.any([AbortSignal.timeout(20000),...(options.signal?[options.signal]:[])]);
  try{response=await fetch(url,{method:'POST',headers,body,signal,redirect:'error'});}
  catch{throw new SpeechProviderError(options.signal?.aborted?499:signal.aborted?504:502,'Nanivio speech recognition request failed or timed out.');}
   if(!response.ok)throw await speechHttpError(response,provider,'recognition',signal);
  const raw=(await boundedBody(response,1024*1024,signal)).toString('utf8');
  let data:any;try{data=JSON.parse(raw);}catch{throw new SpeechProviderError(502,'Speech provider returned an invalid transcription response.');}
  const text=typeof data==='string'?data:data.audio_transcription||data.text||data.transcript||data.transcription||data.DisplayText||data.NBest?.[0]?.Display;
  if(!usableSpeechTranscript(text))throw new SpeechProviderError(502,'The speech provider returned an unusable transcript. Please record your message again.');
  const confidence=data.NBest?.[0]?.Confidence;
  return {text:text.trim(),provider:`${provider}-asr`,confidence:typeof confidence==='number'?confidence:null,durationSeconds:wavDurationSeconds(audio)};
}
export async function synthesizeProviderAudio(text:string,language:string,options:SpeechOptions={}){
  if(typeof text!=='string'||!text.trim()||text.length>5000)throw new SpeechProviderError(400,'Speech text must contain 1–5000 characters.');
  const provider=options.provider??speechProvider(language);
  if(options.signal?.aborted)throw new SpeechProviderError(499,'Speech request was cancelled.');
  if(!speechConfigured(language,'tts',provider))throw new SpeechProviderError(503,'Nanivio speech synthesis is not configured for this language.');
  let url:URL,headers:Record<string,string>,body:string;
  if(provider==='gemini'){
    try{
      const audio=await synthesizeGeminiAudio(text,language,options.signal),durationSeconds=wavDurationSeconds(audio);
      if(!durationSeconds)throw new SpeechProviderError(502,'Speech provider returned an invalid WAV recording.');
      return {audioBase64:audio.toString('base64'),contentType:'audio/wav',provider:'gemini-tts',durationSeconds};
    }catch(error){if(error instanceof LangpretationGeminiError)throw new SpeechProviderError(error.status,error.message,error.diagnostic);throw error;}
  }else if(provider==='sunbird'){
    url=endpoint(process.env.SUNBIRD_TTS_URL||'https://api.sunbird.ai/tasks/audio/speech');
    headers={'Content-Type':'application/json',Authorization:`Bearer ${process.env.SUNBIRD_API_KEY}`};
    body=JSON.stringify({text,language:sunbirdSpeechCode(language),response_mode:'stream'});
  }else{
    url=endpoint(process.env.KHAYA_TTS_URL||'https://translation-api.ghananlp.org/tts/v2/synthesize');
    headers={'Content-Type':'application/json','Ocp-Apim-Subscription-Key':process.env.KHAYA_API_KEY!};
    body=JSON.stringify({text,language:khayaSpeechCode(language)});
  }
  let response:Response;
  const signal=AbortSignal.any([AbortSignal.timeout(20000),...(options.signal?[options.signal]:[])]);
  try{response=provider==='khaya'?await requestSpeechAudio(url,headers,body,signal)
    :await fetch(url,{method:'POST',headers,body,signal,redirect:'error'});}
  catch{throw new SpeechProviderError(options.signal?.aborted?499:signal.aborted?504:502,'Nanivio speech synthesis request failed or timed out.');}
   if(!response.ok)throw await speechHttpError(response,provider,'synthesis',signal);
  let audio=await boundedBody(response,8*1024*1024,signal),contentType=response.headers.get('content-type')||'audio/wav';
  if(contentType.includes('json')){
    let data:any;try{data=JSON.parse(audio.toString('utf8'));}catch{throw new SpeechProviderError(502,'Invalid speech provider response.');}
    const base64=data.audio_base64||data.audioBase64||data.audio;
    if(typeof base64!=='string'||!base64.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw new SpeechProviderError(502,'Speech provider did not return audio bytes.');
    audio=Buffer.from(base64,'base64');contentType='audio/wav';
  }
  // Do not turn a JSON error or a text/HTML success response into purported audio.
  if(!audio.length||(!contentType.startsWith('audio/')&&contentType!=='application/octet-stream'))throw new SpeechProviderError(502,'Speech provider returned no valid audio.');
  const magic=audio.toString('ascii',0,4);
  if(!['RIFF','OggS','fLaC'].includes(magic)&&audio.toString('ascii',0,3)!=='ID3'&&audio[0]!==0xff)throw new SpeechProviderError(502,'Speech provider returned an unrecognized audio format.');
  if(magic==='RIFF'&&(audio.length<12||audio.readUInt32LE(4)+8!==audio.length||!wavDurationSeconds(audio)))
    throw new SpeechProviderError(502,'Speech provider returned incomplete or invalid WAV audio.');
  return {audioBase64:audio.toString('base64'),contentType,provider:`${provider}-tts`,durationSeconds:wavDurationSeconds(audio)};
}
