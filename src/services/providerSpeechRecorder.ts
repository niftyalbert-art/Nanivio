import { authenticatedFetch } from '../lib/authenticatedFetch';
import { PcmUtils } from '../lib/translator-engine/audio/pcm';

/** Real microphone PCM, VAD-delimited utterances, authenticated provider ASR.
 * No generated audio, browser transcript, or synthetic ASR fallback is used.
 */
export class ProviderSpeechRecorder {
  private context:AudioContext|null=null;
  private stream:MediaStream|null=null;
  private processor:ScriptProcessorNode|null=null;
  private abort=new AbortController();
  private frames:Float32Array[]=[];
  private samples=0;
  private silence=0;
  private pending=0;
  private queue:Promise<void>=Promise.resolve();
  async start(language:string,onText:(text:string,confidence:number|null)=>void,onError:(error:Error)=>void){
    const check=await authenticatedFetch('/api/langpretation/speech-readiness?language='+encodeURIComponent(language));
    const readiness=await check.json();
    if(!check.ok||!readiness.asrConfigured)throw new Error(readiness.error||'Speech recognition is not configured for this language.');
    if(this.abort.signal.aborted)return false;
    this.stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    if(this.abort.signal.aborted){this.stop();return false;}
    this.context=new AudioContext();
    await this.context.resume();
    if(this.abort.signal.aborted){this.stop();return false;}
    const source=this.context.createMediaStreamSource(this.stream);
    this.processor=this.context.createScriptProcessor(2048,1,1);
    const context=this.context,rate=context.sampleRate;
    this.processor.onaudioprocess=e=>{
      if(this.abort.signal.aborted)return;
      const pcm=new Float32Array(e.inputBuffer.getChannelData(0));
      const rms=Math.sqrt(pcm.reduce((sum,value)=>sum+value*value,0)/pcm.length);
      if(rms<0.008&&!this.samples)return;
      this.frames.push(pcm);this.samples+=pcm.length;
      this.silence=rms<0.008?this.silence+pcm.length:0;
      if(this.silence<rate*0.45&&this.samples<rate*8)return;
      const frames=this.frames,count=this.samples;
      this.frames=[];this.samples=0;this.silence=0;
      if(count<rate*0.25)return;
      if(this.pending>=2){onError(new Error('Speech provider cannot keep up. Pause before speaking again.'));return;}
      this.pending++;
      this.queue=this.queue.then(async()=>{
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
        const response=await authenticatedFetch('/api/langpretation/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language,audioBase64:btoa(binary)}),signal:this.abort.signal});
        const result=await response.json();
        if(!response.ok||!result.success||!result.text)throw new Error(result.error||'Speech recognition returned no transcript.');
        if(!this.abort.signal.aborted)onText(result.text,result.confidence??null);
      }).catch(error=>{if(!this.abort.signal.aborted)onError(error);}).finally(()=>{this.pending--;});
    };
    source.connect(this.processor);
    // The output is silent; connecting it keeps microphone processing running.
    this.processor.connect(context.destination);
    return true;
  }
  stop(){
    this.abort.abort();
    if(this.processor){this.processor.onaudioprocess=null;this.processor.disconnect();this.processor=null;}
    this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
    this.context?.close().catch(()=>{});this.context=null;this.frames=[];
  }
}
