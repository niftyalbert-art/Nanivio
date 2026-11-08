import type { Request, Response } from 'express';
import { PalabraError, parsePalabraWav, palabraConfigured, translatePalabraAudio } from './palabraSpeech.ts';
import { supportsPalabraPair } from '../shared/palabraLanguages.ts';
import { reservePalabraCapacity } from './palabraCapacity.ts';
import { planTranslation } from '../lib/translator-engine/languagePlan.ts';
import { processStagedVoiceNote, type TranslatedSpeechCaption } from './voiceNotePipeline.ts';
import { SpeechProviderError, speechConfigured } from './speechProviders.ts';
import { translationProviderConfigured } from './translationRouter.ts';

const stagedSpeakers = new Set<string>();

export function stagedCallPairConfigured(source: string, target: string): boolean {
  const plan = planTranslation(source, target);
  const override = source === 'en' && target === 'ak' || source === 'ak' && target === 'en' ? 'khaya' as const : undefined;
  return plan.supported && speechConfigured(source, 'asr', override)
    && speechConfigured(target, 'tts', override)
    && plan.hops.every(hop => translationProviderConfigured(hop.provider));
}

/** Scoped to an authenticated, authorized live call. Existing call metering owns
 * the user's debit; this endpoint must not charge the same call a second time.
 */
export function createPalabraCallHandler(deps: {
  userId: (req: Request) => string;
  authorize: (userId: string, sessionId: string, source: string, target: string) => Promise<void>;
  translate?: typeof translatePalabraAudio;
  configured?: () => boolean;
  stagedTranslate?: typeof processStagedVoiceNote;
  stagedConfigured?: typeof stagedCallPairConfigured;
  caption?:(userId:string,sessionId:string,source:string,target:string,caption:TranslatedSpeechCaption)=>void;
}) {
  return async (req: Request, res: Response) => {
    const userId = deps.userId(req), abort = new AbortController();
    const started=performance.now();
    let release:undefined|(()=>void);
    const cancel = () => abort.abort();
    req.once('aborted',cancel); res.once('close',cancel);
    try {
      const { sourceLang, targetLang, audioBase64, sessionId } = req.body || {};
      let supported = false;
      try { supported = sourceLang !== targetLang && planTranslation(sourceLang, targetLang).supported; } catch {}
      if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 160
        || !supported || typeof audioBase64 !== 'string'
        || audioBase64.length > 1_200_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64))
        throw new PalabraError(400,'A supported language pair, active call and short WAV recording are required.');
      const audio = Buffer.from(audioBase64,'base64'); parsePalabraWav(audio);
      await deps.authorize(userId,sessionId,sourceLang,targetLang);
      if (abort.signal.aborted) return;
      let captionSent=false;
      const caption=(value:TranslatedSpeechCaption)=>{
        if(captionSent||abort.signal.aborted||!deps.caption)return;
        captionSent=true;
        try{deps.caption(userId,sessionId,sourceLang,targetLang,value);}
        catch{console.warn('[Nanivio call] Caption delivery failed.');}
      };
      let result;
      if (supportsPalabraPair(sourceLang, targetLang)) {
        if (!(deps.configured || palabraConfigured)()) throw new PalabraError(503,'Nanivio live translation is not configured.');
        release=reservePalabraCapacity(userId);
        result = await (deps.translate || translatePalabraAudio)(audio,sourceLang,targetLang,abort.signal);
      } else {
        if (!(deps.stagedConfigured || stagedCallPairConfigured)(sourceLang, targetLang))
          throw new PalabraError(503, 'Speech Langpretation is not configured for this pair.');
        if (stagedSpeakers.has(userId) || stagedSpeakers.size >= 8)
          throw new PalabraError(429, 'Speech Langpretation is busy. Wait for the current phrase to finish.');
        stagedSpeakers.add(userId);
        release = () => { stagedSpeakers.delete(userId); };
        const spoken = await (deps.stagedTranslate || processStagedVoiceNote)(audio, sourceLang, targetLang, abort.signal,
          caption);
        result = { ...spoken, text: spoken.transcript, translatedText: spoken.translatedTranscript };
      }
      if (!abort.signal.aborted) {
        // Full-file providers have no early-caption callback. Deliver their
        // authoritative text once, without starting another provider request.
        caption({transcript:result.text,translatedTranscript:result.translatedText});
        res.setHeader?.('Server-Timing',`langpretation;dur=${Math.max(0,Math.round(performance.now()-started))}`);
        res.json({success:true,sourceLang,targetLang,...result});
      }
    } catch (error) {
      const stage = error instanceof SpeechProviderError && 'stage' in error
        && typeof error.stage==='string'
        && ['recognition','translation','synthesis'].includes(error.stage)
        ? error.stage : undefined;
      const speechError=error instanceof SpeechProviderError?error:undefined;
      const upstreamStatus=speechError?.upstreamDiagnostic?.upstreamHttpStatus??speechError?.diagnostic?.upstreamHttpStatus;
      const provider=speechError?.upstreamDiagnostic?.provider||(speechError?.diagnostic?'gemini':undefined);
      const model=speechError?.diagnostic?.model;
      const failure=speechError?.code==='SPEECH_SERVICE_LIMIT'?'limit':
        speechError?.code==='SPEECH_SERVICE_CONFIGURATION'?'configuration':
        speechError?.status===504?'timeout':speechError?.status===499?'cancelled':
        speechError?.upstreamDiagnostic?.failure==='invalid_response'?'invalid_response':
        speechError?.upstreamDiagnostic?.failure==='transport'||speechError?.diagnostic?.failure==='transport'
          ?'transport':'unavailable';
      if (!abort.signal.aborted) res.status(error instanceof PalabraError || error instanceof SpeechProviderError ? error.status : 503).json({
        diagnosticsVersion:1,
        success:false,error:error instanceof PalabraError || error instanceof SpeechProviderError ? error.message : 'Live translation is unavailable.',
        ...(error instanceof SpeechProviderError&&error.code?{code:error.code}:
          stage?{code:`LIVE_SPEECH_${stage.toUpperCase()}_FAILED`}:{}),
        ...(stage?{stage}:{}),
        ...(stage?{support:{
          failure,
          ...(['gemini','khaya','sunbird'].includes(provider||'')?{provider}:{}),
          ...(typeof upstreamStatus==='number'&&Number.isInteger(upstreamStatus)&&upstreamStatus>=100&&upstreamStatus<=599
            ?{upstreamStatus}:{}),
          ...(typeof model==='string'&&/^gemini-[a-zA-Z0-9.-]{1,80}$/.test(model)?{model}:{}),
        }}:{})
      });
    } finally {
      release?.();
      req.off('aborted',cancel); res.off('close',cancel);
    }
  };
}
