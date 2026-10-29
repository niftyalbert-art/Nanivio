import { realtimeClient } from '../lib/realtimeClient';

type Transport = {send:(type:string,payload:any)=>boolean|void;on:(event:string,callback:(p:any)=>void)=>()=>void};
type Callbacks = {
  transcript:(p:{text:string;translated:boolean;speakerId:string;final:boolean})=>void;
  error:(message:string)=>void;
  stopped:()=>void;
  remoteActive:(active:boolean,voiceConsent?:boolean)=>void;
};

/** Incremental 24k PCM playback, with one clock and bounded playout. No per-chunk
 * TTS, decoded-file delays or publish/unpublish cycles on the Agora microphone.
 */
export class TranslationPcmPlayer {
  private context:AudioContext|null=null;
  private gain:GainNode|null=null;
  private next=0;
  private sequence=0;
  private streamId='';
  private sources=new Set<AudioBufferSourceNode>();
  private muted=false;
  async unlock(){
    if(!this.context){
      const C=window.AudioContext||(window as any).webkitAudioContext;
      if(!C)throw new Error('This device cannot play translated audio.');
      this.context=new C();this.gain=this.context!.createGain();this.gain.connect(this.context!.destination);
      this.gain.gain.value=this.muted?0:1;
    }
    await this.context!.resume();
    if(this.context!.state!=='running')throw new Error('Tap Speaker to enable translated audio.');
  }
  begin(streamId:string){this.clear();this.streamId=streamId;this.sequence=0;}
  push(p:{streamId:string;sequence:number;data:string}){
    if(p.streamId!==this.streamId)return;
    if(p.sequence!==this.sequence++||typeof p.data!=='string'||p.data.length>512000)
      throw new Error('Translated audio arrived out of order.');
    const ctx=this.context;
    if(!ctx||ctx.state!=='running')throw new Error('Tap Speaker to enable translated audio, then restart translation.');
    if(this.muted)return;
    const raw=atob(p.data);
    if(!raw.length||raw.length%2)throw new Error('Invalid translated audio.');
    if(this.next-ctx.currentTime>6)throw new Error('Translated audio fell behind. Restart translation.');
    const buffer=ctx.createBuffer(1,raw.length/2,24000),samples=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++){
      const value=raw.charCodeAt(i*2)|(raw.charCodeAt(i*2+1)<<8);
      samples[i]=(value>32767?value-65536:value)/32768;
    }
    const node=ctx.createBufferSource();node.buffer=buffer;node.connect(this.gain!);
    this.sources.add(node);node.onended=()=>{this.sources.delete(node);node.disconnect();};
    const start=Math.max(ctx.currentTime+0.06,this.next);
    this.next=start+buffer.duration;node.start(start);
  }
  setMuted(muted:boolean){this.muted=muted;if(this.gain)this.gain.gain.value=muted?0:1;if(muted)this.clear();}
  clear(){
    for(const source of this.sources){source.onended=null;try{source.stop();}catch{}source.disconnect();}
    this.sources.clear();this.next=0;
  }
  end(){this.clear();this.streamId='';}
  dispose(){this.end();void this.context?.close().catch(()=>{});this.context=null;this.gain=null;}
}

export class LiveCallTranslation {
  private off:(()=>void)[]=[];
  private player=new TranslationPcmPlayer();
  private capture:MediaStream|null=null;
  private context:AudioContext|null=null;
  private processor:ScriptProcessorNode|null=null;
  private source:MediaStreamAudioSourceNode|null=null;
  private silence:GainNode|null=null;
  private streamId='';
  private remoteStreamId='';
  private remoteSpeakerId='';
  private ready=false;
  private generation=0;
  private sequence=0;
  private readyWait:{resolve:()=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}|null=null;
  constructor(private callId:string,private userId:string,private callbacks:Callbacks,private transport:Transport=realtimeClient){
    this.off.push(transport.on('langpretation:ready',p=>{
      if(p.callId!==callId||p.streamId!==this.streamId)return;
      this.ready=true;this.sequence=0;this.readyWait?.resolve();
      if(this.readyWait)clearTimeout(this.readyWait.timer);this.readyWait=null;
    }));
    this.off.push(transport.on('langpretation:stopped',p=>{
      if(p.callId!==callId||p.streamId!==this.streamId)return;
      this.stop();callbacks.stopped();if(p.message)callbacks.error(p.message);
    }));
    this.off.push(transport.on('langpretation:remote_start',p=>{
      if(p.callId!==callId||p.speakerId===userId)return;
      this.remoteStreamId=p.streamId;this.remoteSpeakerId=p.speakerId;this.player.begin(p.streamId);
      void this.player.unlock().then(()=>{
        if(this.remoteStreamId!==p.streamId)return;
        if(!this.transport.send('langpretation:receiver_ready',{callId,streamId:p.streamId,speakerId:p.speakerId}))
          throw new Error('Call connection is not ready.');
        callbacks.remoteActive(true,p.voiceConsent===true);
      }).catch(error=>{
        if(this.remoteStreamId!==p.streamId)return;
        this.transport.send('langpretation:playback_error',{callId,speakerId:p.speakerId});
        this.remoteStreamId='';callbacks.remoteActive(false);callbacks.error(error.message);
      });
    }));
    this.off.push(transport.on('langpretation:audio_out',p=>{
      if(p.callId!==callId||p.streamId!==this.remoteStreamId||p.speakerId!==this.remoteSpeakerId)return;
      try{this.player.push(p);}catch(error){
        this.transport.send('langpretation:playback_error',{callId,speakerId:p.speakerId});
        this.player.end();this.remoteStreamId='';callbacks.remoteActive(false);
        callbacks.error(error instanceof Error?error.message:'Translated audio could not play.');
      }
    }));
    this.off.push(transport.on('langpretation:remote_stop',p=>{
      if(p.callId!==callId||p.streamId!==this.remoteStreamId)return;
      this.player.end();this.remoteStreamId='';callbacks.remoteActive(false);
    }));
    this.off.push(transport.on('langpretation:transcript',p=>{
      if(p.callId!==callId||![this.streamId,this.remoteStreamId].includes(p.streamId))return;
      callbacks.transcript(p);
    }));
    this.off.push(transport.on('connection:lost',()=>{
      this.stop();this.player.end();this.remoteStreamId='';callbacks.remoteActive(false);callbacks.stopped();
      callbacks.error('Call connection lost. Reconnect before restarting translation.');
    }));
  }
  unlock(){return this.player.unlock();}
  setMuted(muted:boolean){this.player.setMuted(muted);}

  async start(sourceLang:string,targetLang:string,voiceConsent:boolean){
    this.stop();
    const generation=this.generation;
    try{
      // Obtain capture permission before opening any paid upstream session.
      const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
      if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return false;}
      this.capture=stream;
      await this.unlock();
      if(generation!==this.generation)return false;
      const C=window.AudioContext||(window as any).webkitAudioContext;
      const ctx=new C();this.context=ctx;await ctx.resume();
      if(generation!==this.generation)return false;
      if(ctx.state!=='running')throw new Error('Microphone audio could not start.');
      this.streamId=crypto.randomUUID();
      const source=ctx.createMediaStreamSource(stream),processor=ctx.createScriptProcessor(4096,1,1),silence=ctx.createGain();
      this.source=source;this.processor=processor;this.silence=silence;silence.gain.value=0;
      source.connect(processor);processor.connect(silence);silence.connect(ctx.destination);
      let position=0,filled=0;const pcm=new Int16Array(5120),ratio=ctx.sampleRate/16000;
      processor.onaudioprocess=(event:AudioProcessingEvent)=>{
        if(!this.ready||generation!==this.generation)return;
        const input=event.inputBuffer.getChannelData(0);
        for(;position<input.length;position+=ratio){
          const sample=Math.max(-1,Math.min(1,input[Math.floor(position)]));
          pcm[filled++]=Math.round(sample*(sample<0?32768:32767));
          if(filled===5120){
            const bytes=new Uint8Array(10240),view=new DataView(bytes.buffer);
            for(let i=0;i<pcm.length;i++)view.setInt16(i*2,pcm[i],true);
            let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
            const sent=this.transport.send('langpretation:audio',{streamId:this.streamId,sequence:this.sequence++,data:btoa(binary)});
            filled=0;
            if(!sent){
              this.stop();this.callbacks.stopped();this.callbacks.error('Microphone audio could not be delivered. Restart translation.');return;
            }
          }
        }
        position-=input.length;
      };
      const wait=new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Live translation did not become ready.')),14000);
        this.readyWait={resolve,reject,timer};
      });
      if(!this.transport.send('langpretation:start',{callId:this.callId,streamId:this.streamId,sourceLang,targetLang,voiceConsent}))
        this.readyWait?.reject(new Error('The call connection is not ready.'));
      await wait;
      return generation===this.generation&&this.ready;
    }catch(error){
      this.stop();if(generation+1===this.generation)this.callbacks.error(error instanceof Error?error.message:'Microphone capture failed.');
      return false;
    }
  }
  stop(){
    const streamId=this.streamId;this.generation++;this.streamId='';this.ready=false;
    if(this.readyWait){clearTimeout(this.readyWait.timer);this.readyWait.reject(new Error('Translation stopped.'));this.readyWait=null;}
    if(streamId)this.transport.send('langpretation:stop',{callId:this.callId,streamId});
    if(this.processor)this.processor.onaudioprocess=null;
    this.source?.disconnect();this.processor?.disconnect();this.silence?.disconnect();
    this.capture?.getTracks().forEach(t=>t.stop());this.capture=null;
    void this.context?.close().catch(()=>{});this.context=null;
    this.processor=null;this.source=null;this.silence=null;
  }
  dispose(){this.stop();for(const off of this.off)off();this.off=[];this.player.dispose();}
}
