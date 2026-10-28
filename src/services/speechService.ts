/** Nanivio-owned capture and server ASR. No browser speech recognizer or Azure SDK. */
import { authenticatedFetch } from '../lib/authenticatedFetch';
import { ProviderSpeechRecorder } from './providerSpeechRecorder';

export interface SpeechRecognitionResultPayload { transcript:string; isFinal:boolean; confidence:number|null; }
export type SpeechCallback = (payload: SpeechRecognitionResultPayload) => void;
export type AudioLevelCallback = (level:number) => void;

class SpeechService {
  private providerRecorder:ProviderSpeechRecorder|null=null;
  private playback:HTMLAudioElement|null=null;
  private playbackUrl:string|null=null;
  private generation = 0;
  private listening = false;
  private visualStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private frame: number | null = null;

  public isSupported(){ return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia; }
  public isTTSSupported(){ return true; }

  public async startListening(langCode:string,onResult:SpeechCallback,onError?:(err:any)=>void):Promise<boolean>{
    if (!this.isSupported()) { onError?.(new Error('Microphone access is unavailable.')); return false; }
    this.stopListening();
    const generation=this.generation;
    const recorder=new ProviderSpeechRecorder();
    this.providerRecorder=recorder;
    try {
      const started=await recorder.start(langCode,(text,confidence)=>{
        if(generation===this.generation)onResult({transcript:text,isFinal:true,confidence});
      },error=>{
        if(generation!==this.generation)return;
        this.stopListening();onError?.(error);
      });
      if(generation!==this.generation){recorder.stop();return false;}
      this.listening=started;return started;
    }catch(e){
      recorder.stop();
      if(generation===this.generation){this.stopListening();onError?.(e);}
      return false;
    }
  }

  public stopListening(){
    this.generation++;
    this.listening=false;
    this.providerRecorder?.stop();this.providerRecorder=null;
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

  public async speak(text:string,langCode:string,options?:{pitch?:number;rate?:number;volume?:number;onEnd?:()=>void;onError?:(error:unknown)=>void}){
    if(!text.trim())return;
    try{
      this.stopSpeaking();
      const r=await authenticatedFetch('/api/langpretation/synthesize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,language:langCode})});
      const data=await r.json(); if(!r.ok||!data.audioBase64) throw new Error(data.error||'No synthesized audio returned');
      const bytes=Uint8Array.from(atob(data.audioBase64),c=>c.charCodeAt(0)); const blob=new Blob([bytes],{type:data.contentType||'audio/wav'}); const url=URL.createObjectURL(blob); const audio=new Audio(url);this.playback=audio;this.playbackUrl=url; audio.volume=options?.volume??1; audio.playbackRate=options?.rate??1; audio.onended=()=>{this.stopSpeaking();options?.onEnd?.()};audio.onerror=()=>{this.stopSpeaking();options?.onError?.(new Error('Speech playback failed.'));}; await audio.play();
    }catch(e){this.stopSpeaking();console.warn('[SpeechService] production TTS failed:',e);options?.onError?.(e);}
  }
  public stopSpeaking(){if(this.playback){this.playback.onended=null;this.playback.onerror=null;this.playback.pause();this.playback.src='';this.playback=null;}if(this.playbackUrl)URL.revokeObjectURL(this.playbackUrl);this.playbackUrl=null;}
}
export const speechService=new SpeechService();
export default speechService;
