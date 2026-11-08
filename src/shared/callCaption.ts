import { LANGUAGE_CODES } from '../lib/translator-engine/languagePlan';

type CaptionParticipant = { id:string; myLanguage?:string };
type CaptionCall = {
  id:string; status:string; langpretationEnabled?:boolean;
  participants?:CaptionParticipant[]; host?:CaptionParticipant;
};

/** A caption shown under my listening language must come from the other speaker. */
export function isIncomingCallCaption(
  call:CaptionCall|null,
  payload:any,
  listenerId:string,
):boolean{
  if(!call||!payload||call.status!=='connected'||!call.langpretationEnabled
    ||payload.callId!==call.id||typeof payload.speakerId!=='string'
    ||payload.speakerId===listenerId||typeof payload.translatedText!=='string'
    ||!payload.translatedText.trim()||payload.translatedText.length>12000)return false;
  const participants=[...(call.participants||[]),...(call.host?[call.host]:[])];
  const listener=participants.find(person=>person.id===listenerId);
  return Boolean(listener&&participants.some(person=>person.id===payload.speakerId)
    &&payload.targetLang===(listener.myLanguage||'en'));
}

/** The call controller must authorize this delivery before sending it. Never
 * relay a caption to the sender or accept an arbitrary client recipient. */
export function buildPeerCallCaption(
  call:{callId:string;status:string;participants:string[]},
  speakerId:string,sourceLang:string,targetLang:string,
  caption:{transcript:string;translatedTranscript:string},speakerName='Caller',
){
  if(call.status!=='connected'||call.participants.length!==2
    ||new Set(call.participants).size!==2||!call.participants.includes(speakerId)
    ||sourceLang===targetLang||!LANGUAGE_CODES.some(code=>code===sourceLang)
    ||!LANGUAGE_CODES.some(code=>code===targetLang)
    ||typeof caption?.transcript!=='string'||!caption.transcript.trim()
    ||typeof caption?.translatedTranscript!=='string'||!caption.translatedTranscript.trim()
    ||caption.transcript.length>12000||caption.translatedTranscript.length>12000)return null;
  const recipientId=call.participants.find(id=>id!==speakerId)!;
  return {recipientId,payload:{callId:call.callId,speakerId,speakerName,
    sourceLang,targetLang,originalText:caption.transcript,translatedText:caption.translatedTranscript}};
}
