import {planTranslation} from '../lib/translator-engine/languagePlan.ts';
import {SpeechProviderError,transcribeProviderAudio,synthesizeProviderAudio,wavDurationSeconds} from './speechProviders.ts';
import {translateWithProductionProviders} from './translationRouter.ts';

export type VoiceNoteStage='recognition'|'translation'|'synthesis';
export class VoiceNoteProcessingError extends SpeechProviderError{
  constructor(public stage:VoiceNoteStage,cause:unknown){
    const status=cause instanceof SpeechProviderError?cause.status:502;
    const action={recognition:'recognizing your speech',translation:'translating your message',synthesis:'creating translated audio'}[stage];
    super(status,status===499?'Voice-message translation was cancelled.':
      status===504||cause instanceof SpeechProviderError&&cause.diagnostic?.failure==='timeout'
        ?`Voice-message translation timed out while ${action}. Nothing was sent. Please try a shorter recording.`
        :`Voice-message translation could not finish ${action}. Nothing was sent. Please try again later.`);
  }
}

/** Explicit route for this voice-note pair, not a fallback or a Malvi override. */
export function twiEnglishVoiceNotePair(source:string,target:string){
  return source==='ak'&&target==='en'||source==='en'&&target==='ak';
}

export async function processStagedVoiceNote(audio:Buffer,source:string,target:string,signal?:AbortSignal){
  if(!planTranslation(source,target).supported)throw new SpeechProviderError(422,'This voice-message language pair is not supported.');
  const duration=wavDurationSeconds(audio);
  if(!duration||duration>60)throw new SpeechProviderError(400,'Record a valid WAV voice message of up to 60 seconds.');
  const deadline=AbortSignal.any([AbortSignal.timeout(55_000),...(signal?[signal]:[])]);
  const options={signal:deadline,...(twiEnglishVoiceNotePair(source,target)?{provider:'khaya' as const}:{})};
  async function stage<T>(name:VoiceNoteStage,operation:()=>Promise<T>):Promise<T>{
    try{
      if(deadline.aborted)throw new SpeechProviderError(signal?.aborted?499:504,'Voice-message processing stopped.');
      const result=await operation();
      if(deadline.aborted)throw new SpeechProviderError(signal?.aborted?499:504,'Voice-message processing stopped.');
      return result;
    }catch(cause){
      const error=new VoiceNoteProcessingError(name,cause);
      console.warn('[Nanivio voice note]',{stage:name,status:error.status});
      throw error;
    }
  }
  const recognized=await stage('recognition',()=>transcribeProviderAudio(audio,source,'audio/wav',options));
  const translated=await stage('translation',async()=>{
    const result=await translateWithProductionProviders(recognized.text,source,target,deadline);
    if(!result?.text)throw new SpeechProviderError(503,'Translation is unavailable.');
    return result;
  });
  const synthesized=await stage('synthesis',()=>synthesizeProviderAudio(translated.text,target,options));
  return {transcript:recognized.text,translatedTranscript:translated.text,asrProvider:recognized.provider,
    translationProvider:translated.provider,...synthesized,durationSeconds:synthesized.durationSeconds,
    providerChain:`${recognized.provider}+${translated.provider}+${synthesized.provider}`};
}
