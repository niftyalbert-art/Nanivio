import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { WebSocketServer, WebSocket } from 'ws';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Isolated call fixture: actual client capture/player, WebSocket transport and
// server gateway. No sign-in bypass or customer account is added to the app.
// --provider is an explicit paid manual run: exactly two upstreams, no retries.
const paid=process.argv.includes('--provider');
const partnerLanguage=process.argv.includes('--swahili')?'sw':'fr';
if(paid&&!process.env.PALABRA_API_KEY)throw new Error('Provider configuration required');
if(!paid&&!process.env.PALABRA_API_KEY)process.env.PALABRA_API_KEY='isolated-fixture-only';
let upstreams=0;
class FixtureProvider extends EventEmitter {
  static OPEN=1;readyState=1;bufferedAmount=0;target='fr';
  constructor(){super();upstreams++;queueMicrotask(()=>this.emit('open'));}
  send(raw){
    const m=JSON.parse(raw);
    if(m.message_type==='set_task'){
      this.target=m.data.pipeline.translations[0].target_language;
      queueMicrotask(()=>this.emit('message',Buffer.from(JSON.stringify({
        message_type:'task_status',data:{command:'set_task',task_status:'running'}}))));
    }
    if(m.message_type==='input_audio_data'){
      const pcm=Buffer.alloc(4800);
      for(let i=0;i<2400;i++)pcm.writeInt16LE(Math.round(Math.sin(i/10)*3000),i*2);
      queueMicrotask(()=>this.emit('message',Buffer.from(JSON.stringify({
        message_type:'output_audio_data',data:{language:this.target,data:pcm.toString('base64')}}))));
    }
  }
  terminate(){if(this.readyState===3)return;this.readyState=3;this.emit('close');}
}
const realRequire=createRequire(import.meta.url);
class BudgetSocket extends WebSocket {
  constructor(...args){if(++upstreams>2)throw new Error('Two-way test credit budget exhausted');super(...args);}
}
const gatewayBundle=await build({entryPoints:['src/server/palabraLiveStream.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external'});
const module={exports:{}};
new Function('require','module','exports',gatewayBundle.outputFiles[0].text)(
  name=>name==='ws'?(paid?BudgetSocket:FixtureProvider):realRequire(name),module,module.exports);
const {PalabraLiveGateway}=module.exports;
const sockets=new Map(),errors=[];
const gateway=new PalabraLiveGateway({
  authorize:async(user,call,source,target)=>{
    assert.equal(call,'isolated-call');
    assert.ok(user==='A'&&source==='en'&&target===partnerLanguage||user==='B'&&source===partnerLanguage&&target==='en');
  },
  remote:(_call,speaker,type,payload)=>{
    const remote=sockets.get(speaker==='A'?'B':'A');
    if(!remote||remote.readyState!==WebSocket.OPEN)return false;
    remote.send(JSON.stringify({type,payload}));return true;
  },
});
const client=await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`
  import {LiveCallTranslation} from './src/services/liveCallTranslation';
  const user=new URLSearchParams(location.search).get('user');
  const listeners=new Map();
  const socket=new WebSocket('ws://'+location.host+'/fixture-ws?user='+user);
  window.transport={send(type,payload){if(socket.readyState!==1)return false;
    if(type==='langpretation:audio'&&!window.result.firstInputFrameBytes)window.result.firstInputFrameBytes=atob(payload.data).length;
    socket.send(JSON.stringify({type,payload}));return true;},
    on(type,fn){const set=listeners.get(type)||new Set();listeners.set(type,set);set.add(fn);return()=>set.delete(fn);}};
  window.result={ready:false,started:false,audioPackets:0,scheduled:0,signal:0,errors:[]};
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='langpretation:audio_out')window.result.audioPackets++;
    if(m.type==='langpretation:ready')window.result.audioFrameSamples=m.payload.audioFrameSamples;
    for(const fn of listeners.get(m.type)||[])fn(m.payload);};
  const original=AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource=function(){
    const node=original.call(this),start=node.start.bind(node);
    node.start=(...args)=>{
      if(!node.fixtureInput)window.result.scheduled++;
      if(node.buffer&&!node.fixtureInput){const samples=node.buffer.getChannelData(0);let peak=0;for(const s of samples)peak=Math.max(peak,Math.abs(s));window.result.signal=Math.max(window.result.signal,peak);}
      return start(...args);};return node;};
  socket.onopen=()=>{
    const service=new LiveCallTranslation('isolated-call',user,{transcript(){},stopped(){},
      remoteActive(){},error:s=>window.result.errors.push(s)},window.transport);
    window.service=service;window.result.ready=true;
    window.begin=async()=>{
      // Match the call screen's explicit audio-enable gesture before awaits.
      const unlocked=service.unlock();
      const C=new AudioContext();const captureUnlocked=C.resume();
      await Promise.all([unlocked,captureUnlocked]);
      const destination=C.createMediaStreamDestination();
      const source=C.createBufferSource();
      source.fixtureInput=true;
      ${paid ? `const bytes=await(await fetch('/reference?user='+user)).arrayBuffer();source.buffer=await C.decodeAudioData(bytes);`
        : `source.buffer=C.createBuffer(1,C.sampleRate*3,C.sampleRate);
           const data=source.buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.sin(i/20)*0.1;`}
      source.connect(destination);
      const started=await service.start(user==='A'?'en':'${partnerLanguage}',user==='A'?'${partnerLanguage}':'en',false,destination.stream);
      window.result.started=started;
      if(started)source.start();
      window.finish=()=>{service.dispose();source.stop();destination.stream.getTracks().forEach(t=>t.stop());C.close();socket.close();};
    };
  };
`},bundle:true,write:false,format:'iife',plugins:[{name:'isolated-transport',setup(b){
  b.onResolve({filter:/lib\/realtimeClient$/},()=>({path:'transport',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const realtimeClient={};'}));
}}]});
const server=createServer(async(req,res)=>{
  try{
    if(req.url.startsWith('/reference')){
      const user=new URL(req.url,'http://fixture').searchParams.get('user');
      res.setHeader('Content-Type','audio/wav');
      res.end(await readFile(user==='A'?'generated-artifacts/palabra-voice-reference.wav':'generated-artifacts/palabra-english-to-french.wav'));
    }else if(req.url==='/client.js'){res.setHeader('Content-Type','text/javascript');res.end(client.outputFiles[0].text);}
    else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><h1>Isolated two-way Langpretation check</h1><script src="/client.js"></script>');}
  }catch{res.writeHead(500);res.end('Fixture input unavailable');}
});
const wss=new WebSocketServer({server,path:'/fixture-ws'});
wss.on('connection',(socket,req)=>{
  const user=new URL(req.url,'http://fixture').searchParams.get('user');
  const peer={send:(type,payload)=>{if(type==='langpretation:stopped'&&payload.message)errors.push(payload.message);
    if(socket.readyState===1)socket.send(JSON.stringify({type,payload}));}};
  sockets.set(user,socket);
  socket.on('message',async raw=>{
    const {type,payload}=JSON.parse(raw.toString());
    try{
      if(type==='langpretation:start')await gateway.start(peer,user,payload);
      if(type==='langpretation:audio')gateway.audio(peer,payload);
      if(type==='langpretation:receiver_ready')gateway.acknowledgeReceiver(payload.callId,payload.speakerId,payload.streamId,user);
      if(type==='langpretation:stop')gateway.stopStream(peer,payload.streamId);
      if(type==='langpretation:playback_error')gateway.stopSpeaker(payload.callId,payload.speakerId);
    }catch(error){
      errors.push(String(error.message).replaceAll(process.env.PALABRA_API_KEY||'unused-fixture-placeholder','[redacted]'));
    }
  });
  socket.on('close',()=>{gateway.stop(peer);if(sockets.get(user)===socket)sockets.delete(user);});
});
await new Promise(resolve=>server.listen(5197,'127.0.0.1',resolve));
const browser=await launchBrowser();
let a,b;
try{
  a=await browser.page('http://127.0.0.1:5197/?user=A');
  b=await browser.page('http://127.0.0.1:5197/?user=B');
  await Promise.all([a.wait('window.result?.ready===true'),b.wait('window.result?.ready===true')]);
  // Explicit gestures in both isolated callers, not an autoplay-policy bypass.
  await Promise.all([a,b].map(page=>page.command('Runtime.evaluate',{
    expression:'void window.begin().catch(e=>window.result.errors.push(e.message))',
    userGesture:true,
  })));
  const end=Date.now()+(paid?28000:10000);
  let results;
  while(Date.now()<end){
    results=await Promise.all([a.evaluate('window.result'),b.evaluate('window.result')]);
    if(results.every(r=>r.started&&r.audioPackets>0&&r.signal>0))break;
    if(errors.length||results.some(r=>r.errors.length))break;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  const passed=results.every(r=>r.started&&r.audioPackets>0&&r.signal>0&&r.audioFrameSamples===1600&&r.firstInputFrameBytes===3200)&&errors.length===0;
  const report={checkedAt:new Date().toISOString(),partnerLanguage,paidProvider:paid,upstreams,results,errors,passed,
    boundary:'Isolated browsers and connected-call authorizer; not signed-in Render accounts.'};
  if(paid)await writeFile('generated-artifacts/langpretation-two-browser-result.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  assert.equal(passed,true,'Both listeners must receive and schedule non-silent translated PCM');
}finally{
  await Promise.all([a?.evaluate('window.finish?.();true').catch(()=>{}),b?.evaluate('window.finish?.();true').catch(()=>{})]);
  gateway.endCall('isolated-call');
  await browser.close();
  for(const socket of wss.clients)socket.terminate();
  await new Promise(resolve=>wss.close(resolve));
  await new Promise(resolve=>server.close(resolve));
}
