import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { build } from 'esbuild';

const serverBundle=await build({entryPoints:['src/server/palabraLiveStream.ts'],bundle:true,write:false,format:'cjs',platform:'node',plugins:[{
  name:'ws-fixture',setup(b){b.onResolve({filter:/^ws$/},()=>({path:'ws',namespace:'fake'}));
    b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:'export default globalThis.MockSocket'}));}
}]});
const clientBundle=await build({entryPoints:['src/services/liveCallTranslation.ts'],bundle:true,write:false,format:'cjs',platform:'browser',plugins:[{
  name:'realtime-fixture',setup(b){b.onResolve({filter:/lib\/realtimeClient$/},()=>({path:'client',namespace:'fake'}));
    b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:'export const realtimeClient=globalThis.transport'}));}
}]});
const flush=()=>new Promise<void>(r=>setImmediate(r));
function serverFixture(){
  let now=1000,denied=false;
  const sockets:any[]=[],events:any[]=[],intervals=new Set<()=>void>(),deadlines=new Set<()=>void>();
  class MockSocket extends EventEmitter{
    static OPEN=1;readyState=1;bufferedAmount=0;sent:any[]=[];terminated=false;
    constructor(public url:string,public options:any){super();sockets.push(this);}
    send(raw:string){this.sent.push(JSON.parse(raw));}
    terminate(){this.terminated=true;this.readyState=3;this.emit('close');}
  }
  const context=vm.createContext({
    module:{exports:{}},Buffer,MockSocket,console:{warn(){}},process:{env:{PALABRA_API_KEY:'test-only-key'}},
    Date:class extends Date{static now(){return now;}},
    require:(name:string)=>{assert.equal(name,'node:crypto');return {randomUUID:()=> 'fixture-id'};},
    setInterval:(fn:()=>void)=>{intervals.add(fn);return fn;},clearInterval:(fn:()=>void)=>intervals.delete(fn),
    setTimeout:(fn:()=>void)=>{deadlines.add(fn);return fn;},clearTimeout:(fn:()=>void)=>deadlines.delete(fn)
  });
  vm.runInContext(serverBundle.outputFiles[0].text,context);
  const {PalabraLiveGateway}=(context.module as any).exports;
  const authorized:any[]=[];
  const gateway=new PalabraLiveGateway({
    authorize:async(...args:any[])=>{authorized.push(args);if(denied)throw new Error('No allowance');},
    remote:(callId:string,userId:string,event:string,payload:any)=>{events.push({callId,userId,event,payload});return true;}
  });
  const peer=()=>({closed:false,sent:[] as any[],send(event:string,payload:any){this.sent.push({event,payload});}});
  const input=(clone=false)=>({callId:'call-one',streamId:'stream-one-123',sourceLang:'en',targetLang:'fr',voiceConsent:clone});
  const message=(ws:any,message_type:string,data:any)=>ws.emit('message',Buffer.from(JSON.stringify({message_type,data})));
  const ready=(ws:any)=>{
    ws.emit('open');message(ws,'task_status',{command:'set_task',task_status:'running'});
    const remote=events.filter(e=>e.event==='langpretation:remote_start').at(-1);
    if(remote)gateway.acknowledgeReceiver(remote.callId,remote.userId,remote.payload.streamId,'receiver-fixture');
  };
  const frame=(p:any,index:number)=>{
    now+=320;const pcm=Buffer.alloc(10240);for(let i=0;i<pcm.length;i+=2)pcm.writeInt16LE(1800,i);
    gateway.audio(p,{streamId:'stream-one-123',sequence:index,data:pcm.toString('base64')});
  };
  return {gateway,peer,input,message,ready,frame,sockets,events,intervals,deadlines,authorized,
    deny:()=>{denied=true;},advance:(ms:number)=>{now+=ms;},tick:()=>{for(const fn of [...intervals])fn();}};
}

test('live translation keeps one provider stream while speech and translated audio overlap',async()=>{
  const f=serverFixture(),peer=f.peer();
  await f.gateway.start(peer,'speaker-A',f.input(true));
  const ws=f.sockets[0];f.ready(ws);
  assert.equal(ws.sent[0].data.pipeline.translations[0].speech_generation.voice_cloning,true);
  for(let i=0;i<35;i++)f.frame(peer,i);
  assert.equal(f.sockets.length,1);assert.equal(ws.sent.filter((p:any)=>p.message_type==='set_task').length,1);
  assert.equal(ws.sent.filter((p:any)=>p.message_type==='input_audio_data').length,35);
  f.message(ws,'output_audio_data',{language:'fr',data:Buffer.alloc(4800).toString('base64'),last_chunk:false});
  assert.equal(ws.terminated,false,'output must not wait for end_task or the full recording');
  assert.equal(f.events.at(-1).event,'langpretation:audio_out');
  assert.equal(f.events.at(-1).payload.speakerId,'speaker-A');
  assert.equal(f.events.at(-1).payload.sequence,0);
  f.frame(peer,35);
  assert.equal(ws.sent.at(-1).message_type,'input_audio_data');
  f.gateway.stop(peer);assert.equal(ws.terminated,true);assert.equal(f.intervals.size,0);
});

test('voice cloning is off without explicit per-call speaker consent',async()=>{
  const f=serverFixture(),peer=f.peer();await f.gateway.start(peer,'speaker-A',f.input(false));f.ready(f.sockets[0]);
  assert.equal(f.sockets[0].sent[0].data.pipeline.translations[0].speech_generation.voice_cloning,false);
  f.gateway.stop(peer);
  await assert.rejects(f.gateway.start(peer,'speaker-A',{...f.input(),voiceConsent:undefined}),/permission/);
  assert.equal(f.sockets.length,1);
});

test('two participants own separate directional voice adaptation streams',async()=>{
  const f=serverFixture(),a=f.peer(),b=f.peer();
  await f.gateway.start(a,'speaker-A',f.input(true));
  await f.gateway.start(b,'speaker-B',{...f.input(true),streamId:'reverse-stream-123',sourceLang:'fr',targetLang:'en'});
  f.ready(f.sockets[0]);f.ready(f.sockets[1]);
  const taskA=f.sockets[0].sent[0].data,taskB=f.sockets[1].sent[0].data;
  assert.equal(taskA.pipeline.transcription.source_language,'en');assert.equal(taskB.pipeline.transcription.source_language,'fr');
  assert.notEqual(f.sockets[0],f.sockets[1]);assert.equal(f.authorized[0][0],'speaker-A');assert.equal(f.authorized[1][0],'speaker-B');
  f.gateway.endCall('call-one');assert.ok(f.sockets.every(ws=>ws.terminated));
});

test('denied calls, duplicate speakers and unacknowledged input cannot start extra paid streams',async()=>{
  const f=serverFixture(),a=f.peer();await f.gateway.start(a,'speaker-A',f.input());
  await assert.rejects(f.gateway.start(f.peer(),'speaker-A',f.input()),/current translation/);
  f.frame(a,0);assert.equal(f.sockets[0].terminated,true);
  f.deny();await assert.rejects(f.gateway.start(f.peer(),'speaker-B',f.input()),/No allowance/);
  assert.equal(f.sockets.length,1);
});

test('provider acknowledgement alone cannot start the microphone before receiver playback is ready',async()=>{
  const f=serverFixture(),p=f.peer();await f.gateway.start(p,'speaker-A',f.input(true));
  const ws=f.sockets[0];ws.emit('open');f.message(ws,'task_status',{command:'set_task',task_status:'running'});
  assert.equal(p.sent.some((e:any)=>e.event==='langpretation:ready'),false);
  f.gateway.acknowledgeReceiver('call-one','speaker-A','wrong-stream','listener-B');
  f.gateway.acknowledgeReceiver('call-one','speaker-A','stream-one-123','speaker-A');
  assert.equal(p.sent.some((e:any)=>e.event==='langpretation:ready'),false);
  f.gateway.acknowledgeReceiver('call-one','speaker-A','stream-one-123','listener-B');
  assert.equal(p.sent.some((e:any)=>e.event==='langpretation:ready'),true);
  f.gateway.stop(p);
});

test('closing or stopping during asynchronous authorization cannot open a late provider connection',async()=>{
  const f=serverFixture(),p=f.peer();
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  // Use the actual gateway with an intentionally delayed authorization response.
  const Gateway=f.gateway.constructor;
  const gateway=new Gateway({authorize:()=>gate,remote:()=>true});
  const pending=gateway.start(p,'slow-speaker',f.input());
  gateway.stop(p);release();await pending;
  assert.equal(f.sockets.length,0);
});

test('audio backlog, wrong language and closed-browser starts fail closed',async()=>{
  for(const mode of ['backlog','wrong_language','closed']){
    const f=serverFixture(),p=f.peer();if(mode==='closed')p.closed=true;
    await f.gateway.start(p,'speaker-A',f.input());
    if(mode==='closed'){assert.equal(f.sockets.length,0);continue;}
    const ws=f.sockets[0];f.ready(ws);
    if(mode==='backlog'){ws.bufferedAmount=200000;f.frame(p,0);}
    else f.message(ws,'output_audio_data',{language:'en',data:Buffer.alloc(4000).toString('base64')});
    assert.equal(ws.terminated,true);
    assert.ok(!f.events.some(e=>e.event==='langpretation:audio_out'));
  }
});

test('microphone stalls, allowance revocation and call completion close paid sessions',async()=>{
  for(const mode of ['stall','allowance','call_end']){
    const f=serverFixture(),p=f.peer();await f.gateway.start(p,'speaker-A',f.input());const ws=f.sockets[0];f.ready(ws);
    if(mode==='stall'){f.advance(5000);f.tick();}
    if(mode==='allowance'){f.advance(11000);f.frame(p,0);f.deny();f.tick();await flush();}
    if(mode==='call_end')f.gateway.endCall('call-one');
    assert.equal(ws.terminated,true);assert.equal(f.intervals.size,0);assert.equal(f.deadlines.size,0);
  }
});

function clientFixture(){
  const listeners=new Map<string,Set<(p:any)=>void>>(),sent:any[]=[],contexts:any[]=[],tracks:any[]=[];
  const transport={
    send:(event:string,payload:any)=>{sent.push({event,payload});return true;},
    on:(event:string,fn:(p:any)=>void)=>{if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event)!.add(fn);return ()=>listeners.get(event)?.delete(fn);}
  };
  class Context{
    sampleRate=48000;state='running';currentTime=0;destination={};processor:any;starts:number[]=[];
    constructor(){contexts.push(this);}
    resume(){return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}
    createGain(){return {gain:{value:1},connect(){},disconnect(){}};}
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
    createScriptProcessor(){this.processor={onaudioprocess:null,connect(){},disconnect(){}};return this.processor;}
    createBuffer(_channels:number,length:number,rate:number){return {duration:length/rate,getChannelData:()=>new Float32Array(length)};}
    createBufferSource(){return {buffer:null,onended:null,connect(){},disconnect(){},stop(){},start:(time:number)=>this.starts.push(time)};}
  }
  const context=vm.createContext({
    module:{exports:{}},transport,window:{AudioContext:Context},crypto:{randomUUID:()=> 'browser-stream-123'},
    navigator:{mediaDevices:{getUserMedia:async()=>{
      const track={stopped:false,stop(){this.stopped=true;}};tracks.push(track);return {getTracks:()=>[track]};
    }}},setTimeout,clearTimeout,Int16Array,Uint8Array,Float32Array,DataView,Math,Error,
    btoa:(s:string)=>Buffer.from(s,'binary').toString('base64'),atob:(s:string)=>Buffer.from(s,'base64').toString('binary')
  });
  vm.runInContext(clientBundle.outputFiles[0].text,context);
  const exports=(context.module as any).exports;
  const errors:string[]=[],remote:boolean[]=[],transcripts:any[]=[];
  const service=new exports.LiveCallTranslation('call-one','speaker-A',{
    error:(s:string)=>errors.push(s),stopped(){},remoteActive:(b:boolean)=>remote.push(b),transcript:(p:any)=>transcripts.push(p)
  },transport);
  const emit=(event:string,p:any)=>{for(const fn of listeners.get(event)||[])fn(p);};
  return {service,exports,contexts,sent,tracks,emit,errors,remote,transcripts};
}

test('browser streams fixed PCM chunks before silence, stops on mute and discards stale callbacks',async()=>{
  const f=clientFixture(),start=f.service.start('en','fr',true);await flush();
  const request=f.sent.find(p=>p.event==='langpretation:start');
  assert.equal(request.payload.voiceConsent,true);assert.equal(f.contexts.length,2);
  const processor=f.contexts[1].processor,process=processor.onaudioprocess;
  const event={inputBuffer:{getChannelData:()=>new Float32Array(4096).fill(0.2)}};
  process(event);assert.ok(!f.sent.some(p=>p.event==='langpretation:audio'),'no audio before running acknowledgement');
  f.emit('langpretation:ready',{callId:'call-one',streamId:request.payload.streamId});assert.equal(await start,true);
  for(let i=0;i<10;i++)process(event);
  const audio=f.sent.filter(p=>p.event==='langpretation:audio');
  assert.equal(audio.length,2);assert.equal(Buffer.from(audio[0].payload.data,'base64').length,10240);
  assert.equal(audio[0].payload.sequence,0);assert.equal(audio[1].payload.sequence,1);
  f.service.stop();process(event);assert.equal(f.sent.filter(p=>p.event==='langpretation:audio').length,2);
  assert.ok(f.tracks.every(t=>t.stopped));f.service.dispose();
});

test('receiver schedules successive PCM chunks immediately and isolates call, stream and sequence',async()=>{
  const f=clientFixture();await f.service.unlock();
  f.emit('langpretation:remote_start',{callId:'call-one',streamId:'remote-123',speakerId:'speaker-B',voiceConsent:true});
  await flush();
  const chunk={callId:'call-one',streamId:'remote-123',speakerId:'speaker-B',data:Buffer.alloc(4800).toString('base64')};
  f.emit('langpretation:audio_out',{...chunk,sequence:0});f.emit('langpretation:audio_out',{...chunk,sequence:1});
  assert.equal(f.contexts[0].starts.length,2);assert.equal(f.contexts[0].starts[0],0.06);
  assert.equal(f.contexts[0].starts[1],0.16);
  f.emit('langpretation:audio_out',{...chunk,callId:'other-call',sequence:2});
  assert.equal(f.contexts[0].starts.length,2);
  f.emit('langpretation:audio_out',{...chunk,sequence:4});
  assert.equal(f.errors.length,1);assert.ok(f.sent.some(p=>p.event==='langpretation:playback_error'));
  f.service.dispose();
});
