import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { supportsPalabraPair } from '../shared/palabraLanguages.ts';
import { PalabraError, palabraConfigured } from './palabraSpeech.ts';
import { reservePalabraCapacity } from './palabraCapacity.ts';

export type LangpretationAuthorizer = (userId:string,callId:string,source:string,target:string)=>Promise<void>;
type Peer = { send:(event:string,payload:any)=>void };
type Start = {callId:string;streamId:string;sourceLang:string;targetLang:string;voiceConsent:boolean};
type Session = Start & {
  userId:string;peer:Peer;ws:WebSocket;ready:boolean;upstreamReady:boolean;closed:boolean;release:()=>void;
  sequence:number;outputSequence:number;bytes:number;started:number;lastFrame:number;lastActivity:number;
  timer:ReturnType<typeof setInterval>;deadline:ReturnType<typeof setTimeout>;
};

/** A speaker owns one live pipeline, not a pipeline per utterance. No captured
 * audio or cloned voice identity is stored by Nanivio beyond this live session.
 */
export class PalabraLiveGateway {
  private sessions = new Map<Peer,Session>();
  private users = new Set<string>();
  private pending = new Map<Peer,{userId:string;callId:string;streamId:string;release:()=>void}>();
  private starts:number[]=[];
  constructor(private deps:{
    authorize:LangpretationAuthorizer;
    remote:(callId:string,speakerId:string,event:string,payload:any)=>boolean;
  }){}

  async start(peer:Peer,userId:string,input:Start) {
    if(this.sessions.has(peer)||this.pending.has(peer)||this.users.has(userId))throw new PalabraError(409,'Stop the current translation before starting another.');
    if(!input||typeof input.callId!=='string'||input.callId.length>160
      ||typeof input.streamId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(input.streamId)
      ||!supportsPalabraPair(input.sourceLang,input.targetLang)||typeof input.voiceConsent!=='boolean')
      throw new PalabraError(400,'Choose a supported language pair and your voice permission.');
    if(!palabraConfigured())throw new PalabraError(503,'Nanivio live translation is not configured.');
    if(this.users.size>=8)throw new PalabraError(429,'Live translation is busy. Please try again later.');
    this.starts=this.starts.filter(t=>Date.now()-t<60000);
    if(this.starts.length>=18)throw new PalabraError(429,'Too many translation starts. Please wait a minute.');
    // Reserve before async authorization so simultaneous starts cannot race.
    const release=reservePalabraCapacity(userId);
    const reservation={userId,callId:input.callId,streamId:input.streamId,release};
    this.users.add(userId);this.pending.set(peer,reservation);
    try { await this.deps.authorize(userId,input.callId,input.sourceLang,input.targetLang); }
    catch(error){if(this.pending.get(peer)===reservation){this.users.delete(userId);this.pending.delete(peer);}release();throw error;}
    if(this.pending.get(peer)!==reservation){release();return;}
    this.pending.delete(peer);
    if((peer as any).closed){this.users.delete(userId);release();return;}
    this.starts.push(Date.now());
    const ws = new WebSocket(`wss://streaming.palabra.ai/streaming-api/${randomUUID()}/v1/speech-to-speech/stream`,{
      headers:{Authorization:`Bearer ${process.env.PALABRA_API_KEY}`},handshakeTimeout:7000,maxPayload:768000,followRedirects:false
    });
    const session = {...input,userId,peer,ws,release,ready:false,upstreamReady:false,closed:false,sequence:0,outputSequence:0,bytes:0,
      started:Date.now(),lastFrame:Date.now(),lastActivity:Date.now()} as Session;
    this.sessions.set(peer,session);
    const fail = (message:string)=>this.stop(peer,message);
    session.deadline=setTimeout(()=>fail('Live translation did not become ready. Please try again.'),12000);
    let checking=false,checkedAt=Date.now();
    session.timer=setInterval(()=>{
      if(session.closed)return;
      if(Date.now()-session.started>10*60000)return fail('Translation session ended. Tap Listen to start again.');
      if(session.ready&&Date.now()-session.lastFrame>4000)return fail('Microphone audio stopped. Tap Listen to reconnect.');
      if(Date.now()-session.lastActivity>60000)return fail('Translation paused after a minute without speech.');
      if(!checking&&Date.now()-checkedAt>=10000){
        checking=true;checkedAt=Date.now();
        void this.deps.authorize(userId,input.callId,input.sourceLang,input.targetLang)
          .catch(()=>fail('Translation stopped. Check your call and remaining allowance.')).finally(()=>{checking=false;});
      }
    },3000);
    ws.on('open',()=> {
      if(session.closed)return;
      ws.send(JSON.stringify({message_type:'set_task',data:{
        input_stream:{content_type:'audio',source:{type:'ws',format:'pcm_s16le',sample_rate:16000,channels:1}},
        output_stream:{content_type:'audio',target:{type:'ws',format:'pcm_s16le'}},
        pipeline:{
          transcription:{source_language:input.sourceLang,segment_confirmation_silence_threshold:0.5,only_confirm_by_silence:false},
          translations:[{target_language:input.targetLang==='zh'?'zh-hans':input.targetLang,
            speech_generation:{voice_cloning:input.voiceConsent}}],
          allowed_message_types:['partial_transcription','validated_transcription','translated_transcription']
        }
      }}));
    });
    ws.on('message',raw=>{
      if(session.closed)return;
      let message:any;try{message=JSON.parse(raw.toString());}catch{return fail('Invalid live translation response.');}
      const {message_type:type,data}=message;
      if(type==='error')return fail('Nanivio live translation is unavailable. Please try again later.');
      if(type==='task_status'&&data?.command==='set_task'&&data.task_status==='running'&&!session.upstreamReady){
        session.upstreamReady=true;
        if(!this.remote(session,'langpretation:remote_start',{voiceConsent:input.voiceConsent}))
          fail('The other participant is not connected.');
      }
      if(type==='output_audio_data'&&session.ready){
        if(typeof data?.language!=='string'||data.language.split('-')[0]!==input.targetLang
          ||typeof data.data!=='string'||data.data.length>512000||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.data))
          return fail('Live translation returned invalid audio.');
        const bytes=Buffer.from(data.data,'base64');
        if(!bytes.length||bytes.length%2||bytes.length>240000)return fail('Live translation audio exceeded the buffer limit.');
        session.lastActivity=Date.now();
        if(!this.remote(session,'langpretation:audio_out',{data:data.data,sequence:session.outputSequence++,lastChunk:data.last_chunk===true}))
          fail('The other participant is not connected.');
      }
      if(['partial_transcription','validated_transcription','translated_transcription'].includes(type)&&session.ready){
        const t=data?.transcription,isTranslation=type==='translated_transcription';
        if(typeof t?.text!=='string'||t.text.length>6000||typeof t.language!=='string'
          ||t.language.split('-')[0] !== (isTranslation?input.targetLang:input.sourceLang))
          return fail('Live translation returned an unexpected transcript.');
        if(t.text.trim())session.lastActivity=Date.now();
        const event={callId:input.callId,streamId:input.streamId,speakerId:userId,text:t.text,
          language:isTranslation?input.targetLang:input.sourceLang,translated:isTranslation,final:type!=='partial_transcription'};
        peer.send('langpretation:transcript',event);
        this.remote(session,'langpretation:transcript',event);
      }
      if(type==='end_of_stream')fail('Live translation ended. Tap Listen to start again.');
    });
    ws.on('error',()=>fail('Live translation connection failed.'));
    ws.on('unexpected-response',(_req,res)=>{res.resume();fail('Live translation could not connect.');});
    ws.on('close',()=>fail('Live translation disconnected. Tap Listen to reconnect.'));
  }
  acknowledgeReceiver(callId:string,speakerId:string,streamId:string,listenerId:string){
    for(const session of this.sessions.values()){
      if(session.callId!==callId||session.userId!==speakerId||session.streamId!==streamId||listenerId===speakerId
        ||!session.upstreamReady||session.ready||session.closed)continue;
      session.ready=true;session.started=Date.now();session.lastFrame=Date.now();clearTimeout(session.deadline);
      session.peer.send('langpretation:ready',{callId,streamId,voiceConsent:session.voiceConsent});
    }
  }

  private remote(session:Session,event:string,payload:any){
    return this.deps.remote(session.callId,session.userId,event,{
      ...payload,callId:session.callId,streamId:session.streamId,speakerId:session.userId,targetLang:session.targetLang
    });
  }
  audio(peer:Peer,payload:any){
    const session=this.sessions.get(peer);
    if(!session||session.closed)return;
    if(!session.ready||payload?.streamId!==session.streamId||payload?.sequence!==session.sequence
      ||typeof payload.data!=='string'||payload.data.length!==13656||!/^[A-Za-z0-9+/]+={0,2}$/.test(payload.data))
      return this.stop(peer,'Microphone stream is out of order. Tap Listen to reconnect.');
    const audio=Buffer.from(payload.data,'base64');
    if(audio.length!==10240)return this.stop(peer,'Unsupported microphone audio format.');
    session.bytes+=audio.length;
    if(session.bytes > ((Date.now()-session.started)/1000+1)*32000 || session.ws.bufferedAmount>128000)
      return this.stop(peer,'Microphone audio could not be delivered in real time.');
    session.sequence++;session.lastFrame=Date.now();
    let energy=0;for(let i=0;i<audio.length;i+=2)energy+=(audio.readInt16LE(i)/32768)**2;
    if(Math.sqrt(energy/(audio.length/2))>0.008)session.lastActivity=Date.now();
    if(session.ws.readyState!==WebSocket.OPEN)return this.stop(peer,'Live translation disconnected.');
    session.ws.send(JSON.stringify({message_type:'input_audio_data',data:{data:payload.data}}));
  }
  stop(peer:Peer,message?:string){
    const pending=this.pending.get(peer);
    if(pending){this.pending.delete(peer);this.users.delete(pending.userId);pending.release();}
    const session=this.sessions.get(peer);if(!session||session.closed)return;
    session.closed=true;this.sessions.delete(peer);this.users.delete(session.userId);session.release();
    clearTimeout(session.deadline);clearInterval(session.timer);
    if(session.ws.readyState===WebSocket.OPEN)session.ws.send(JSON.stringify({message_type:'end_task',data:{force:true}}));
    session.ws.terminate();
    peer.send('langpretation:stopped',{callId:session.callId,streamId:session.streamId,message:message||''});
    this.remote(session,'langpretation:remote_stop',{});
  }
  stopSpeaker(callId:string,speakerId:string){
    for(const s of [...this.sessions.values()])if(s.callId===callId&&s.userId===speakerId)
      this.stop(s.peer,'The listener could not play translated audio. They need to enable their speaker, then you can restart.');
  }
  stopStream(peer:Peer,streamId:string){
    if(this.sessions.get(peer)?.streamId===streamId||this.pending.get(peer)?.streamId===streamId)this.stop(peer);
  }
  endCall(callId:string){
    for(const [peer,pending] of [...this.pending])if(pending.callId===callId)this.stop(peer);
    for(const s of [...this.sessions.values()])if(s.callId===callId)this.stop(s.peer);
  }
}
