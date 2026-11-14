import { authenticatedFetch } from '../lib/authenticatedFetch';
import { PcmUtils } from '../lib/translator-engine/audio/pcm';
import {OrderedSpeechQueue} from './orderedSpeechQueue';

export interface RecordedSpeechOptions {
  targetLanguage?: string;
  inputStream?: MediaStream;
  /** Borrow a context unlocked by the call's permission button. Never close it. */
  audioContext?: AudioContext;
  /** A combined speech route consumes actual microphone WAV, never a supplied transcript. */
  onAudio?: (audioBase64: string, signal: AbortSignal) => Promise<void>;
  /** Seconds of captured speech awaiting processing, excluding the active phrase. */
  onBacklog?: (seconds:number)=>void;
}
/** Real microphone PCM, VAD-delimited utterances, authenticated provider ASR.
 * No generated audio, browser transcript, or synthetic ASR fallback is used.
 */
export class ProviderSpeechRecorder {
  private context:AudioContext|null=null;
  private ownsContext=true;
  private source:MediaStreamAudioSourceNode|null=null;
  private stream:MediaStream|null=null;
  private processor:ScriptProcessorNode|null=null;
  private abort=new AbortController();
  private frames:Float32Array[]=[];
  private samples=0;
  private silence=0;
  async start(language:string,onText:(text:string,confidence:number|null)=>void,onError:(error:Error)=>void,options?:RecordedSpeechOptions){
    const check=await authenticatedFetch('/api/langpretation/speech-readiness?language='+encodeURIComponent(language)
      +(options?.onAudio&&options.targetLanguage?'&targetLang='+encodeURIComponent(options.targetLanguage):''),{signal:this.abort.signal});
    const readiness=await check.json();
    if(!check.ok||!readiness.asrConfigured)throw new Error(readiness.error||'Speech recognition is not configured for this language.');
    if(this.abort.signal.aborted)return false;
    const inputTracks = options?.inputStream?.getAudioTracks().filter(track => track.readyState === 'live') || [];
    this.stream = inputTracks.length
      ? new MediaStream(inputTracks.map(track => track.clone()))
      : await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    if(this.abort.signal.aborted){this.stop();return false;}
    this.ownsContext=!options?.audioContext;
    this.context=options?.audioContext||new AudioContext();
    await this.context.resume();
    if(this.abort.signal.aborted){this.stop();return false;}
    if(this.context.state!=='running')throw new Error('Microphone audio is paused. Tap the call audio control to resume.');
    const source=this.source=this.context.createMediaStreamSource(this.stream);
    this.processor=this.context.createScriptProcessor(2048,1,1);
    const context=this.context,rate=context.sampleRate;
    const queue=new OrderedSpeechQueue(this.abort.signal,onError,options?.onBacklog);
    // Keep normal transcription behaviour; call capture dispatches earlier.
    const live=Boolean(options?.onAudio);
    const silenceSeconds=live?0.3:0.45,maxSeconds=live?4:8;
    this.processor.onaudioprocess=e=>{
      if(this.abort.signal.aborted)return;
      const pcm=new Float32Array(e.inputBuffer.getChannelData(0));
      const rms=Math.sqrt(pcm.reduce((sum,value)=>sum+value*value,0)/pcm.length);
      if(rms<0.008&&!this.samples)return;
      this.frames.push(pcm);this.samples+=pcm.length;
      this.silence=rms<0.008?this.silence+pcm.length:0;
      if(this.silence<rate*silenceSeconds&&this.samples<rate*maxSeconds)return;
      const frames=this.frames,count=this.samples;
      this.frames=[];this.samples=0;this.silence=0;
      if(count<rate*0.25)return;
      queue.enqueue(count/rate,async()=>{
        if(this.abort.signal.aborted)return;
        const all=new Float32Array(count);let offset=0;
        for(const frame of frames){all.set(frame,offset);offset+=frame.length;}
        const offline=new OfflineAudioContext(1,Math.ceil(count*16000/rate),16000);
        const buffer=offline.createBuffer(1,count,rate);buffer.copyToChannel(all,0);
        const node=offline.createBufferSource();node.buffer=buffer;node.connect(offline.destination);node.start();
        const rendered=await offline.startRendering();
        const wav=PcmUtils.float32ToWavBlob(rendered.getChannelData(0),16000);
        const bytes=new Uint8Array(await wav.arrayBuffer());let binary='';
        for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
        if(this.abort.signal.aborted)return;
        if(options?.onAudio){
          await options.onAudio(btoa(binary),this.abort.signal);
          return;
        }
        const response=await authenticatedFetch('/api/langpretation/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language,audioBase64:btoa(binary)}),signal:this.abort.signal});
        const result=await response.json();
        if(!response.ok||!result.success||!result.text)throw new Error(result.error||'Speech recognition returned no transcript.');
        if(!this.abort.signal.aborted)onText(result.text,result.confidence??null);
      });
    };
    source.connect(this.processor);
    // The output is silent; connecting it keeps microphone processing running.
    this.processor.connect(context.destination);
    return true;
  }
  stop(){
    this.abort.abort();
    this.source?.disconnect();this.source=null;
    if(this.processor){this.processor.onaudioprocess=null;this.processor.disconnect();this.processor=null;}
    this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
    if(this.ownsContext)this.context?.close().catch(()=>{});
    this.context=null;this.frames=[];
  }
}
