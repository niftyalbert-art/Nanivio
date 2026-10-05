/** Production Nanivio speech service.
 * Azure Speech is used for supported speech languages. Browser Web Speech is not used
 * for Langpretation because it is device/browser dependent and cannot provide production guarantees.
 */
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

export interface SpeechRecognitionResultPayload { transcript:string; isFinal:boolean; confidence:number; }
export type SpeechCallback = (payload: SpeechRecognitionResultPayload) => void;
export type AudioLevelCallback = (level:number) => void;

const LOCALES: Record<string,string> = {
  en:'en-US', fr:'fr-FR', es:'es-ES', ar:'ar-SA', de:'de-DE', it:'it-IT', pt:'pt-BR', zh:'zh-CN', ja:'ja-JP', ko:'ko-KR', sw:'sw-KE', ha:'ha-NG', lg:'lg-UG'
};

class SpeechService {
  private recognizer: SpeechSDK.SpeechRecognizer | null = null;
  private listening = false;
  private visualStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private frame: number | null = null;

  private locale(code:string){ return LOCALES[code] || code; }
  public isSupported(){ return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia; }
  public isTTSSupported(){ return true; }

  public async startListening(langCode:string,onResult:SpeechCallback,onError?:(err:any)=>void):Promise<boolean>{
    if (!this.isSupported()) { onError?.(new Error('Microphone access is unavailable.')); return false; }
    this.stopListening();
    try {
      const tokenRes=await fetch('/api/langpretation/azure-speech-token');
      const tokenData=await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData.error || 'Azure Speech is not configured.');
      const config=SpeechSDK.SpeechConfig.fromAuthorizationToken(tokenData.token,tokenData.region);
      config.speechRecognitionLanguage=this.locale(langCode);
      config.outputFormat=SpeechSDK.OutputFormat.Detailed;
      const audio=SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      this.recognizer=new SpeechSDK.SpeechRecognizer(config,audio);
      this.recognizer.recognizing=(_,e)=>{ if(e.result?.text) onResult({transcript:e.result.text,isFinal:false,confidence:0}); };
      this.recognizer.recognized=(_,e)=>{ if(e.result.reason===SpeechSDK.ResultReason.RecognizedSpeech && e.result.text) onResult({transcript:e.result.text,isFinal:true,confidence:1}); };
      this.recognizer.canceled=(_,e)=>{ onError?.(new Error(e.errorDetails || `Azure Speech canceled: ${e.reason}`)); };
      await new Promise<void>((resolve,reject)=>this.recognizer!.startContinuousRecognitionAsync(resolve,reject));
      this.listening=true; return true;
    } catch(e){ this.listening=false; this.recognizer?.close(); this.recognizer=null; onError?.(e); return false; }
  }

  public stopListening(){
    this.listening=false;
    if(this.recognizer){ this.recognizer.stopContinuousRecognitionAsync(()=>this.recognizer?.close(),()=>this.recognizer?.close()); this.recognizer=null; }
  }

  public async startAudioVisualizer(onLevel:AudioLevelCallback){
    try{
      this.stopAudioVisualizer();
      this.visualStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      const Ctx=window.AudioContext || (window as any).webkitAudioContext; if(!Ctx) return false;
      this.audioContext=new Ctx(); const source=this.audioContext.createMediaStreamSource(this.visualStream); this.analyser=this.audioContext.createAnalyser(); this.analyser.fftSize=64; source.connect(this.analyser);
      const arr=new Uint8Array(this.analyser.frequencyBinCount); const tick=()=>{ if(!this.analyser)return; this.analyser.getByteFrequencyData(arr); const avg=arr.reduce((a,b)=>a+b,0)/arr.length; onLevel(Math.min(100,Math.round(avg/128*100))); this.frame=requestAnimationFrame(tick); }; tick(); return true;
    }catch(e){ return false; }
  }
  public stopAudioVisualizer(){ if(this.frame)cancelAnimationFrame(this.frame); this.frame=null; this.visualStream?.getTracks().forEach(t=>t.stop()); this.visualStream=null; this.analyser=null; this.audioContext?.close().catch(()=>{}); this.audioContext=null; }

  public async speak(text:string,langCode:string,options?:{pitch?:number;rate?:number;volume?:number;onEnd?:()=>void}){
    if(!text.trim())return;
    try{
      const r=await fetch('/api/langpretation/synthesize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,language:langCode})});
      const data=await r.json(); if(!r.ok||!data.audioBase64) throw new Error(data.error||'No synthesized audio returned');
      const bytes=Uint8Array.from(atob(data.audioBase64),c=>c.charCodeAt(0)); const blob=new Blob([bytes],{type:data.contentType||'audio/wav'}); const url=URL.createObjectURL(blob); const audio=new Audio(url); audio.volume=options?.volume??1; audio.playbackRate=options?.rate??1; audio.onended=()=>{URL.revokeObjectURL(url);options?.onEnd?.()}; await audio.play();
    }catch(e){ console.warn('[SpeechService] production TTS failed:',e); options?.onEnd?.(); }
  }
  public stopSpeaking(){ }
}
export const speechService=new SpeechService();
export default speechService;
