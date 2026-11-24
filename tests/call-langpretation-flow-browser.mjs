import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {WebSocket,WebSocketServer} from 'ws';
import {launchBrowser} from '../scripts/live-call-checks/cdp.mjs';

// Real call signaling, sponsorship meter, language-sync hook, audio/video call
// controls, microphone encoder and PCM player. Only identity/database/native RTC
// are isolated fixtures. --provider permits exactly TWO paid upstreams.
const paid=process.argv.includes('--provider'),realRequire=createRequire(import.meta.url);
const ledgerEnabled=process.argv.includes('--policy-ledger');
let ledger;
async function ledgerCommand(action,payload){
  return (await ledger.query('SELECT nanivio_communication_access($1,$2::jsonb) AS result',[action,JSON.stringify(payload)])).rows[0].result;
}
if(ledgerEnabled){
  const {PGlite}=await import('@electric-sql/pglite');
  ledger=new PGlite();
  await ledger.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE nanivio_subscriptions(subscription_id text primary key,user_id text,tier text,status text,
      current_period_start timestamptz default now(),current_period_end timestamptz default now()+interval '30 days',
      created_at timestamptz default now(),voice_minutes_quota numeric default 10,voice_minutes_used numeric default 0,
      langpretation_minutes_quota numeric default 10,langpretation_minutes_used numeric default 0,langpretation_minutes_remaining numeric default 10);
    CREATE TABLE nanivio_billing_audit_logs(actor_user_id text,action text,entity_type text,entity_id text,metadata jsonb);`);
  await ledger.exec(await readFile('migrations/021_communication_access_policy.sql','utf8'));
}
let upstreams=0;
class Provider extends EventEmitter{
  static OPEN=1;readyState=1;bufferedAmount=0;target='fr';
  constructor(){super();upstreams++;queueMicrotask(()=>this.emit('open'));}
  send(raw){
    const m=JSON.parse(raw);
    if(m.message_type==='set_task'){this.target=m.data.pipeline.translations[0].target_language;queueMicrotask(()=>this.emit('message',Buffer.from(JSON.stringify({message_type:'task_status',data:{command:'set_task',task_status:'running'}}))));}
    if(m.message_type==='input_audio_data'){
      if(!this.transcribed){
        this.transcribed=true;
        for(const [type,language,text] of [['transcription',this.target==='en'?'fr':'en','own speech '+(this.target==='en'?'fr':'en')],['translated_transcription',this.target,'translated-to-'+this.target]])
          queueMicrotask(()=>this.emit('message',Buffer.from(JSON.stringify({message_type:type,data:{transcription:{text,language}}}))));
      }
      const pcm=Buffer.alloc(4800);for(let i=0;i<2400;i++)pcm.writeInt16LE(Math.round(Math.sin(i/10)*3000),i*2);
      queueMicrotask(()=>this.emit('message',Buffer.from(JSON.stringify({message_type:'output_audio_data',data:{language:this.target,data:pcm.toString('base64')}}))));
    }
  }
  terminate(){if(this.readyState===3)return;this.readyState=3;this.emit('close');}
}
class BudgetProvider extends WebSocket{
  constructor(...args){if(++upstreams>2)throw new Error('Two-stream provider budget reached');super(...args);}
}
const usage=[],pairs=[];
const backend=await build({entryPoints:['src/server/realtimeServer.ts'],bundle:true,write:false,metafile:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'isolated-identities',setup(b){
  b.onResolve({filter:/persistentAuth(?:\.ts)?$/},()=>({path:'auth',namespace:'fixture'}));
  b.onResolve({filter:/supabaseServer(?:\.ts)?$/},()=>({path:'database',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',contents:path==='database'
    ?`export function getServerSupabase(){return {
      rpc:(name,args)=>__fixtureRPC(name,args),
      from(table){
        let owners=[];
        const query={
          select(){return query;},
          in(_column,values){owners=values;return query;},
          eq(){return query;},
          abortSignal(){
            if(table==='nanivio_users')return Promise.resolve({
              data:owners.filter(id=>['A-id','B-id'].includes(id)).map(id=>({id})),error:null});
            if(table==='nanivio_password_epochs')return Promise.resolve({data:[],error:null});
            if(table==='nanivio_voice_profiles')return {
              maybeSingle:async()=>({data:null,error:null})
            };
            throw Error('Unexpected identity table in isolated call fixture');
          }
        };
        return query;
      }
    }}`
    :`export function adminFromToken(){return null}export async function persistentAuthConfigured(){return true}
      export async function userFromToken(token){return ['A','B'].includes(token)?{id:token+'-id',nvId:token==='A'?'0486111111':'0486222222',firstName:token,role:'PERSONAL',accountStatus:'ACTIVE',preferredLanguage:'en'}:null}`}));
}}]});
assert.ok(!Object.keys(backend.metafile.inputs).some(path=>
  /src\/server\/(?:supabaseServer|persistentAuth)\.ts$/.test(path)),
  'The isolated call fixture must not import live identity or database adapters');
const module={exports:{}};
const upstreamClass=paid?BudgetProvider:Provider;
Object.assign(upstreamClass,{WebSocket,WebSocketServer});
new Function('require','module','exports','__fixtureRPC',backend.outputFiles[0].text)(
  name=>name==='ws'?upstreamClass:realRequire(name),
  module,module.exports,async(_name,args)=>{
    usage.push(args);
    if(ledger){
      assert.equal(_name,'nanivio_communication_access');
      return {data:await ledgerCommand(args.action,args.payload),error:null};
    }
    return {data:{success:true,policy:{callTrialDays:30,warningSeconds:60},trialStartedAt:null,callSecondsRemaining:null,
      sharedCallMinutes:0,liveTrialSecondsRemaining:180,translatedSecondsRemaining:0,amount:args.payload?.amount},error:null};
  });
const api=module.exports;
async function authorize(user,callId,source,target){
  assert.equal(api.canTranslateLiveCall(user,callId),true);
  api.authorizeSponsoredCall(user,callId);
  assert.ok(user==='A-id'&&source==='en'&&target==='fr'||user==='B-id'&&source==='fr'&&target==='en','Both call languages must be current, not invitation defaults');
  pairs.push({user,source,target});
}
const frontend=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';
 import {ActiveCallModal} from './src/components/calls/ActiveCallModal';
 import {useCallLanguageSync} from './src/lib/useCallLanguageSync';
 const query=new URLSearchParams(location.search),user=query.get('user'),mode=query.get('mode');
 const callbacks=new Map(),socket=new WebSocket('ws://'+location.host+'/ws');
 window.__transport={send(type,payload){if(socket.readyState!==1)return false;socket.send(JSON.stringify({type,payload}));return true;},
 on(type,fn){const set=callbacks.get(type)||new Set();set.add(fn);callbacks.set(type,set);return()=>set.delete(fn);}};
 window.result={packets:0,scheduled:0,signal:0,errors:[],events:[],translations:[]};
 window.addEventListener('error',event=>window.result.errors.push(event.message));
 window.addEventListener('unhandledrejection',event=>window.result.errors.push(String(event.reason?.message||event.reason)));
 const start=AudioBufferSourceNode.prototype.start;
 AudioBufferSourceNode.prototype.start=function(...args){
   if(!this.fixtureInput&&this.buffer){window.result.scheduled++;const pcm=this.buffer.getChannelData(0);for(let i=0;i<pcm.length;i++)window.result.signal=Math.max(window.result.signal,Math.abs(pcm[i]));}
   return start.apply(this,args);
 };
 socket.onopen=()=>window.__transport.send('auth:presence',{token:user});
 socket.onmessage=event=>{const m=JSON.parse(event.data);window.result.events.push(m.type);if(m.type==='langpretation:audio_out')window.result.packets++;
    if(m.type==='auth:error')window.result.errors.push(m.payload.code||'FIXTURE_AUTHENTICATION_FAILED');
   if(m.type==='langpretation:transcript'&&m.payload.translated&&m.payload.final&&m.payload.speakerId!==user+'-id')
     window.result.translations.push({language:m.payload.language,text:m.payload.text});
   if(m.type==='langpretation:ready')window.result.captureReady=true;
   if(m.type==='call:error'||(m.type==='call:billing_notice'&&!m.payload.pending))window.result.errors.push(m.payload.message);
   for(const fn of callbacks.get(m.type)||[])fn(m.payload);
 };
 const people=[{id:'A-id',name:'A',initials:'A',myLanguage:'en',isMuted:false},{id:'B-id',name:'B',initials:'B',myLanguage:'en',isMuted:false}];
 const me=people.find(p=>p.id===user+'-id'),noop=()=>{};
 window.prepare=async()=>{
   const audio=new AudioContext();await audio.resume();const destination=audio.createMediaStreamDestination(),input=audio.createBufferSource();
   input.fixtureInput=true;
   ${paid?`input.buffer=await audio.decodeAudioData(await(await fetch('/reference?user='+user)).arrayBuffer());`:`input.buffer=audio.createBuffer(1,audio.sampleRate*3,audio.sampleRate);const pcm=input.buffer.getChannelData(0);for(let i=0;i<pcm.length;i++)pcm[i]=Math.sin(i/20)*.1;`}
   input.connect(destination);window.__stream=destination.stream;window.__startInput=()=>input.start();
   window.__cleanup=()=>{window.__stream.getTracks().forEach(t=>t.stop());audio.close();socket.close();};
 };
 function App(){
   const [call,setCall]=useState(null),[language,setLanguage]=useState(user==='A'?'en':'fr'),[request,setRequest]=useState(null);
   useCallLanguageSync(call,language,me.id,setCall,window.__transport);
   useEffect(()=>{
     const onConnected=payload=>setCall({id:payload.callId,channelName:payload.channelName,type:mode==='audio'?'audio_1on1':'video_1on1',status:'connected',host:people[0],participants:people,langpretationEnabled:false,langpretationState:'OFF',durationSeconds:0});
     const a=window.__transport.on('call:accepted',onConnected),b=window.__transport.on('call:connected',onConnected);
     const c=window.__transport.on('call:incoming',payload=>window.__transport.send('call:accept',{callId:payload.callId}));
     const d=window.__transport.on('call:langpretation',payload=>setCall(old=>old?{...old,langpretationEnabled:payload.enabled,langpretationState:payload.enabled?'ON':'OFF'}:old));
     const e=window.__transport.on('call:ended',()=>setCall(null));
     const f=window.__transport.on('call:langpretation_consent_request',setRequest);
     const g=window.__transport.on('call:langpretation_consent_cancelled',()=>setRequest(null));
     return()=>{a();b();c();d();e();f();g();};
   },[]);
   useEffect(()=>{if(call?.status==='connected')window.__transport.send('call:media_ready',{callId:call.id});},[call?.id,call?.status]);
   window.__call=call;
   window.__callValue={activeCall:call,currentUser:me,myLanguage:language,setMyLanguage:setLanguage,
     endCall:()=>window.__transport.send('call:end',{callId:call.id}),toggleCallLangpretation:()=>window.__transport.send('call:langpretation',{callId:call.id,enabled:!call.langpretationEnabled}),
     callTranslationRequest:request,respondToCallTranslationRequest:accepted=>{window.__transport.send('call:langpretation_consent',{...request,accepted});setRequest(null);},
     toggleCallMute:noop,toggleCallVideo:noop,messages:{},sendMessage:noop,dismissInCallNotice:noop,setActiveTab:noop,setPendingBillingAction:noop,
     callBillingNotice:null,dismissCallBillingNotice:noop,inCallNotice:null,currentPlan:{},billingSummary:null,wallets:[],
     langpretationMeter:null,adminFeatures:{langpretationEnabled:true},agoraStats:{hasRemoteMedia:true,hasLocalMedia:true}};
   window.result.ready=true;
   return <ActiveCallModal/>;
 }
 createRoot(document.getElementById('root')).render(<App/>);
`},bundle:true,write:false,format:'iife',plugins:[{name:'isolated-rtc-and-context',setup(b){
 b.onResolve({filter:/context\/NanivioContext$/},()=>({path:'context',namespace:'fixture'}));
 b.onResolve({filter:/lib\/realtimeClient$/},()=>({path:'transport',namespace:'fixture'}));
 b.onResolve({filter:/authClient(?:\.ts)?$/},()=>({path:'auth',namespace:'fixture'}));
 b.onResolve({filter:/lib\/agoraClient$/},()=>({path:'rtc',namespace:'fixture'}));
 b.onResolve({filter:/LiveCallVideoStage$/},()=>({path:'stage',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'tsx',resolveDir:process.cwd(),contents:{
   context:'export const useNanivio=()=>window.__callValue',
   transport:'export const realtimeClient={send:(...args)=>window.__transport.send(...args),on:(...args)=>window.__transport.on(...args)}',
   auth:'export const authClient={getToken:()=>new URLSearchParams(location.search).get("user")}',
   rtc:'export const agoraClient={getLocalStream:()=>window.__stream,subscribeLocalStream:fn=>{fn(window.__stream);return()=>{}},subscribeRemoteStream:()=>()=>{},setRemoteAudioMuted(){},restoreOriginalAudioTrack(){}}',
   stage:'import React from "react";export const LiveCallVideoStage=props=>{window.result.audioOnly=props.audioOnly;return <div>Isolated native media stage</div>}',
 }[path]}));
}}]});
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://fixture');
    if(url.pathname==='/client.js'){res.setHeader('Content-Type','text/javascript');res.end(frontend.outputFiles[0].text);return;}
    if(url.pathname==='/reference'){res.setHeader('Content-Type','audio/wav');res.end(await readFile(url.searchParams.get('user')==='A'?'generated-artifacts/palabra-voice-reference.wav':'generated-artifacts/palabra-english-to-french.wav'));return;}
    if(url.pathname==='/api/langpretation/call/readiness'){
      await authorize(String(req.headers.authorization).replace('Bearer ','')+'-id',url.searchParams.get('callId'),url.searchParams.get('sourceLang'),url.searchParams.get('targetLang'));
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true}));return;
    }
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><div id="root"></div><script src="/client.js"></script>');
  }catch(error){res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({success:false,error:error.message}));}
});
const wss=api.setupRealtimeServer(server,{authorizeLangpretation:authorize});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await launchBrowser();
try{
  for(const mode of paid?[process.argv.includes('--audio')?'audio':'video']:['audio','video']){
    const allowanceBefore=ledger?await ledgerCommand('ACCESS',{userId:'A-id'}):null;
    const receiverBefore=ledger?await ledgerCommand('ACCESS',{userId:'B-id'}):null;
    const previouslySettled=ledger?Number((await ledger.query("SELECT coalesce(sum(amount),0) AS total FROM nanivio_communication_reservations WHERE resource='live' AND status='COMMITTED'")).rows[0].total):0;
    const a=await browser.page(base+'/?user=A&mode='+mode),b=await browser.page(base+'/?user=B&mode='+mode);
    try{
      for(const page of [a,b]){await page.wait('window.result?.ready===true&&window.__transport');await page.command('Runtime.evaluate',{expression:'void window.prepare()',userGesture:true});await page.wait('!!window.__stream');}
      await a.evaluate(`window.__transport.send('call:initiate',{callId:'flow-${mode}',callType:'${mode}',recipientId:'B-id'});true`);
      await Promise.all([a,b].map(page=>page.wait("window.__call?.status==='connected'&&window.__call.participants.find(person=>person.id==='B-id')?.myLanguage==='fr'")));
      await a.command('Runtime.evaluate',{expression:"document.getElementById('call-action-langpretation').click();true",userGesture:true});
      await b.wait("document.getElementById('call-translation-consent')?.open===true");
      assert.equal(await a.evaluate('window.__call.langpretationEnabled'),false,'Sender must not start while the listener is deciding');
      assert.equal(upstreams,paid?0:(mode==='audio'?0:2),'Permission must precede provider startup');
      await b.command('Runtime.evaluate',{expression:"document.getElementById('call-translation-approve').click();true",userGesture:true});
      await Promise.all([a,b].map(page=>page.wait('window.__call?.langpretationEnabled===true')));
      for(const page of [a,b])await page.command('Runtime.evaluate',{expression:"[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Enable translated audio'))?.click();true",userGesture:true});
      await Promise.all([a,b].map(page=>page.wait('window.result.captureReady===true')));
      await Promise.all([a,b].map(page=>page.evaluate('window.__startInput();true')));
      const deadline=Date.now()+(paid?28000:10000);
      let results;
      do{
        results=await Promise.all([a,b].map(page=>page.evaluate('({...window.result,captionVisible:window.result.translations.some(t=>document.body.innerText.includes(t.text))})')));
        if(results.every(item=>item.packets>0&&item.signal>0&&item.captionVisible))break;
        if(results.some(item=>item.errors.length))break;
        await new Promise(resolve=>setTimeout(resolve,250));
      }while(Date.now()<deadline);
      console.log(JSON.stringify({mode,paidProvider:paid,results:results.map(({events,...result})=>result),pairs,upstreams,boundary:'Actual call controls/signaling/sponsorship and audio stream; isolated identities, database and native RTC. Not signed-in Render accounts.'}));
      assert.ok(results.every(item=>item.packets>0&&item.signal>0&&item.errors.length===0),'Both users must hear non-silent translated PCM through the call UI');
      assert.ok(results.every(item=>item.audioOnly===(mode==='audio')),'Audio and video must use their respective call controls');
      assert.ok(results.every((item,index)=>item.captionVisible&&item.translations.some(t=>t.language===(index===0?'en':'fr')&&t.text.trim())),'Both receivers must see incoming captions in their selected languages');
      if(!paid)for(const [index,page] of [a,b].entries()){
        const incoming=index===0?'en':'fr',outgoing=index===0?'fr':'en';
        await page.wait(`document.body.innerText.includes('translated-to-${incoming}')`);
        assert.equal(await page.evaluate(`document.body.innerText.includes('translated-to-${outgoing}')`),false,'Outgoing translation must not overwrite incoming captions');
      }
      // Cross two allowance renewals and the provider's periodic authorization
      // check, not just the first successful packet.
      await new Promise(resolve=>setTimeout(resolve,12000));
      for(const page of [a,b]){
        assert.equal(await page.evaluate('window.__call?.langpretationEnabled'),true,'Renewal must not turn a funded translation off');
        assert.deepEqual(await page.evaluate('window.result.errors'),[]);
      }
      await a.evaluate(`window.__transport.send('call:end',{callId:'flow-${mode}'});true`);
      await Promise.all([a,b].map(page=>page.wait('window.__call===null')));
      if(ledger){
        await new Promise(resolve=>setTimeout(resolve,300));
        const after=await ledgerCommand('ACCESS',{userId:'A-id'});
        const receiverAfter=await ledgerCommand('ACCESS',{userId:'B-id'});
        const rows=(await ledger.query("SELECT user_id,resource,status,amount,source FROM nanivio_communication_reservations WHERE resource='live'")).rows;
        const settled=rows.filter(row=>row.status==='COMMITTED').reduce((sum,row)=>sum+Number(row.amount),0)-previouslySettled;
        const consumed=allowanceBefore.liveTrialSecondsRemaining-after.liveTrialSecondsRemaining;
        assert.ok(consumed>0,'Successful live speech must consume actual test-database allowance');
        assert.ok(Math.abs(consumed-settled)<.001,'Settled reservations and the remaining allowance must agree');
        assert.ok(rows.every(row=>row.user_id==='A-id'&&row.status!=='RESERVED'),'End call must settle only the sponsor’s reservations');
        assert.equal(receiverAfter.liveTrialSecondsRemaining,receiverBefore.liveTrialSecondsRemaining);
        console.log(JSON.stringify({mode,allowance:{isolatedPostgres:true,beforeSeconds:allowanceBefore.liveTrialSecondsRemaining,
          afterSeconds:after.liveTrialSecondsRemaining,settledSeconds:settled,recipientUncharged:true},customerBalancesChanged:false}));
      }
    }catch(error){
      console.error(JSON.stringify(await Promise.all([a,b].map(page=>page.evaluate('({result:window.result,call:window.__call,text:document.body.innerText.slice(0,1200)})')))));
      throw error;
    }finally{
      for(const page of [a,b]){await page.evaluate('window.__cleanup?.();true').catch(()=>{});await browser.closePage?.(page);}
    }
  }
  assert.ok(usage.filter(row=>row.action==='RESERVE'&&row.payload.resource==='live').every(row=>row.payload.userId==='A-id'),'Only the consenting sponsor is debited');
}finally{
  await browser.close();for(const socket of wss.clients)socket.terminate();
  await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));
  await ledger?.close();
}
