/** Production TTS bridge. The browser receives real provider audio from Nanivio's server.
 * Synthetic oscillators and browser speechSynthesis are intentionally not used.
 */
export interface SynthesizedAudioPayload { audioBase64?:string; audioBuffer?:AudioBuffer; sampleRate:number; channels:number; durationMs:number; provider:string; latencyMs:number; }

function base64ToBytes(value:string){ const raw=atob(value); const out=new Uint8Array(raw.length); for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i); return out; }

export class NanivioTtsAudioGenerator {
  private static audioCtx: AudioContext|null=null;
  public static getAudioContext(){
    if(typeof window==='undefined')return null;
    if(!this.audioCtx){ const C=window.AudioContext||(window as any).webkitAudioContext; if(C)this.audioCtx=new C(); }
    if(this.audioCtx?.state==='suspended')this.audioCtx.resume().catch(()=>{});
    return this.audioCtx;
  }

  public static async generateSpokenAudioBuffer(text:string,language:string,audioCtx?:AudioContext):Promise<AudioBuffer|null>{
    const start=performance.now();
    const r=await fetch('/api/langpretation/synthesize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,language})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data.audioBase64) throw new Error(data.error||'Production TTS returned no audio');
    const bytes=base64ToBytes(data.audioBase64); const ctx=audioCtx||this.getAudioContext(); if(!ctx) return null;
    const buffer=await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    console.debug('[Langpretation] TTS',data.provider,Math.round(performance.now()-start),'ms');
    return buffer;
  }

  public static createMediaStreamFromBuffer(audioBuffer:AudioBuffer,audioCtx?:AudioContext){
    const ctx=audioCtx||this.getAudioContext(); if(!ctx)return null;
    const destination=ctx.createMediaStreamDestination(); const source=ctx.createBufferSource(); source.buffer=audioBuffer; const gain=ctx.createGain(); gain.gain.value=.95; source.connect(gain); gain.connect(destination);
    return {stream:destination.stream,sourceNode:source};
  }

  public static async generatePlayableWavBlob(text:string,language:string){
    const ctx=this.getAudioContext(); if(!ctx)throw new Error('AudioContext unavailable');
    const buffer=await this.generateSpokenAudioBuffer(text,language,ctx); if(!buffer)throw new Error('No synthesized audio');
    const offline=new OfflineAudioContext(1,Math.ceil(buffer.duration*buffer.sampleRate),buffer.sampleRate); const source=offline.createBufferSource(); source.buffer=buffer; source.connect(offline.destination); source.start(); const rendered=await offline.startRendering();
    const data=rendered.getChannelData(0); const pcm=new ArrayBuffer(44+data.length*2); const view=new DataView(pcm); const write=(o:string,p:number)=>{for(let i=0;i<o.length;i++)view.setUint8(p+i,o.charCodeAt(i))}; write('RIFF',0); view.setUint32(4,36+data.length*2,true); write('WAVE',8); write('fmt ',12); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,rendered.sampleRate,true); view.setUint32(28,rendered.sampleRate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true); write('data',36); view.setUint32(40,data.length*2,true); for(let i=0;i<data.length;i++)view.setInt16(44+i*2,Math.max(-1,Math.min(1,data[i]))*32767,true);
    const blob=new Blob([pcm],{type:'audio/wav'}); return {blob,url:URL.createObjectURL(blob),durationSec:rendered.duration};
  }
}
