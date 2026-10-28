import { speechProvider, khayaSpeechCode, sunbirdSpeechCode } from '../lib/translator-engine/languagePlan.ts';
import { LangpretationGeminiError, transcribeGeminiAudio, synthesizeGeminiAudio } from './langpretationGemini.ts';

export const SPEECH_LOCALES:Record<string,string>={en:'en-US',fr:'fr-FR',es:'es-ES',ar:'ar-SA',de:'de-DE',it:'it-IT',pt:'pt-BR',zh:'zh-CN',ja:'ja-JP',ko:'ko-KR'};
const voices:Record<string,string>={en:'en-US-JennyNeural',fr:'fr-FR-DeniseNeural',es:'es-ES-ElviraNeural',ar:'ar-SA-ZariyahNeural',de:'de-DE-KatjaNeural',it:'it-IT-ElsaNeural',pt:'pt-BR-FranciscaNeural',zh:'zh-CN-XiaoxiaoNeural',ja:'ja-JP-NanamiNeural',ko:'ko-KR-SunHiNeural'};
export class SpeechProviderError extends Error {
  constructor(public status:number,message:string){super(message);}
}
export function speechConfigured(language:string,operation:'asr'|'tts'):boolean {
  const provider=speechProvider(language);
  if(provider==='gemini')return Boolean(process.env.GEMINI_API_KEY);
  if(provider==='sunbird')return Boolean(process.env.SUNBIRD_API_KEY);
  return Boolean(process.env.KHAYA_API_KEY);
}
function endpoint(value:string) {
  const url=new URL(value);
  if(url.protocol!=='https:')throw new SpeechProviderError(503,'Speech endpoints must use HTTPS.');
  return url;
}
async function boundedBody(response:Response,max=8*1024*1024):Promise<Buffer>{
  if(!response.body)throw new SpeechProviderError(502,'Speech provider returned no body.');
  const parts:Buffer[]=[];let size=0;
  for await(const part of response.body as any){
    size+=part.length;
    if(size>max)throw new SpeechProviderError(502,'Speech provider response exceeded the audio limit.');
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts);
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
export async function transcribeProviderAudio(audio:Buffer,language:string,contentType='audio/wav'){
  if(!audio.length||audio.length>4*1024*1024)throw new SpeechProviderError(400,'Audio must be nonempty and smaller than 4 MB.');
  const provider=speechProvider(language);
  if(!speechConfigured(language,'asr'))throw new SpeechProviderError(503,`${provider} speech recognition is not configured for this language.`);
  if(provider==='gemini'){
    if(!wavDurationSeconds(audio))throw new SpeechProviderError(400,'A valid PCM WAV recording is required.');
    try { return {...await transcribeGeminiAudio(audio,language,contentType),durationSeconds:wavDurationSeconds(audio)}; }
    catch(error){if(error instanceof LangpretationGeminiError)throw new SpeechProviderError(error.status,error.message);throw error;}
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
  try{response=await fetch(url,{method:'POST',headers,body,signal:AbortSignal.timeout(20000),redirect:'error'});}
  catch{throw new SpeechProviderError(502,`${provider} speech recognition request failed or timed out.`);}
  if(!response.ok)throw new SpeechProviderError(502,`${provider} speech recognition failed (${response.status}).`);
  const raw=(await boundedBody(response,1024*1024)).toString('utf8');
  let data:any;try{data=JSON.parse(raw);}catch{throw new SpeechProviderError(502,'Speech provider returned an invalid transcription response.');}
  const text=typeof data==='string'?data:data.audio_transcription||data.text||data.transcript||data.transcription||data.DisplayText||data.NBest?.[0]?.Display;
  if(typeof text!=='string'||!text.trim())throw new SpeechProviderError(502,'Speech recognition returned no transcription.');
  const confidence=data.NBest?.[0]?.Confidence;
  return {text:text.trim(),provider:`${provider}-asr`,confidence:typeof confidence==='number'?confidence:null,durationSeconds:wavDurationSeconds(audio)};
}
export async function synthesizeProviderAudio(text:string,language:string){
  if(typeof text!=='string'||!text.trim()||text.length>5000)throw new SpeechProviderError(400,'Speech text must contain 1–5000 characters.');
  const provider=speechProvider(language);
  if(!speechConfigured(language,'tts'))throw new SpeechProviderError(503,`${provider} speech synthesis is not configured for this language.`);
  let url:URL,headers:Record<string,string>,body:string;
  if(provider==='gemini'){
    try{
      const audio=await synthesizeGeminiAudio(text,language),durationSeconds=wavDurationSeconds(audio);
      if(!durationSeconds)throw new SpeechProviderError(502,'Speech provider returned an invalid WAV recording.');
      return {audioBase64:audio.toString('base64'),contentType:'audio/wav',provider:'gemini-tts',durationSeconds};
    }catch(error){if(error instanceof LangpretationGeminiError)throw new SpeechProviderError(error.status,error.message);throw error;}
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
  try{response=await fetch(url,{method:'POST',headers,body,signal:AbortSignal.timeout(20000),redirect:'error'});}
  catch{throw new SpeechProviderError(502,`${provider} speech synthesis request failed or timed out.`);}
  if(!response.ok)throw new SpeechProviderError(502,`${provider} speech synthesis failed (${response.status}).`);
  let audio=await boundedBody(response),contentType=response.headers.get('content-type')||'audio/wav';
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
  return {audioBase64:audio.toString('base64'),contentType,provider:`${provider}-tts`,durationSeconds:wavDurationSeconds(audio)};
}
