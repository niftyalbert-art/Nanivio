import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

// Drain the job queue, rather than assuming a particular number of internal
// Promise continuations in the real handoff implementation.
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function deferred(){
  let resolve!:()=>void;
  const promise=new Promise<void>(yes=>{resolve=yes;});
  return {promise,resolve};
}

async function fixture(t:any){
  const keys=['fetch','window','MediaStream','__translationRtc'] as const;
  const saved=keys.map(key=>[key,(globalThis as any)[key]] as const);
  const events:string[]=[],sources:any[]=[],raws:any[]=[],contexts:any[]=[];
  let failCustom=false,customPublish:Promise<void>|null=null,customUnpublish:Promise<void>|null=null;
  const mediaTrack=(id:string)=>({kind:'audio',id,stopped:false,readyState:'live',stop(){this.stopped=true;this.readyState='ended';}});
  const sdkTrack=(raw:any)=>({raw,enabled:true,muted:false,getMediaStreamTrack:()=>raw,
    async setEnabled(value:boolean){this.enabled=value;},
    async setMuted(value:boolean){this.muted=value;},
    stop(){},close(){raw.stop();},
  });
  (globalThis as any).MediaStream=class{
    constructor(public tracks:any[]=[]){}
    getTracks(){return this.tracks;}
    getAudioTracks(){return this.tracks.filter(track=>track.kind==='audio');}
    getVideoTracks(){return [];}
  };
  (globalThis as any).window={AudioContext:class{
    state='running';inputs:any[]=[];
    constructor(){contexts.push(this);}
    async resume(){if(this.state==='closed')throw Error('closed');}
    async close(){this.state='closed';}
    createMediaStreamSource(stream:any){this.inputs.push(stream.getAudioTracks()[0]);return {connect(){},disconnect(){}};}
    createGain(){return {gain:{value:1},connect(){},disconnect(){}};}
    createMediaStreamDestination(){return {stream:new MediaStream([mediaTrack('mixed') as any])};}
    createBufferSource(){
      const source={buffer:null,onended:null as any,connect(){},disconnect(){},
        start(){sources.push(this);},stop(){this.onended?.();},finish(){this.onended?.();}};
      return source;
    }
  }};
  let nextClient=0;
  (globalThis as any).__translationRtc={
    setLogLevel(){},
    createClient:()=>{
      const id=++nextClient;
      return {remoteUsers:[],on(){},async join(){return 1;},
        async publish(tracks:any[]){
          const track=tracks[0];events.push(`${id}:publish:${track.raw.id}`);
          if(track.raw.id==='mixed'){if(failCustom)throw Error('fixture publication failure');await customPublish;}
        },
        async unpublish(track:any){events.push(`${id}:unpublish:${track.raw.id}`);if(track.raw.id==='mixed')await customUnpublish;},
        async leave(){events.push(`${id}:leave`);},
      };
    },
    async createMicrophoneAudioTrack(){const raw=mediaTrack('mic-'+(raws.length+1));raws.push(raw);return sdkTrack(raw);},
    createCustomAudioTrack:({mediaStreamTrack}:any)=>sdkTrack(mediaStreamTrack),
  };
  globalThis.fetch=async url=>{
    if(String(url)==='/api/agora/token')return Response.json({token:'fixture',appId:'fixture',agoraUid:1});
    if(['/api/agora/join','/api/agora/leave'].includes(String(url)))return Response.json({success:true});
    throw Error('Unexpected network access in an isolated media test');
  };
  const bundle=await build({entryPoints:['src/lib/agoraClient.ts'],bundle:true,write:false,metafile:true,
    platform:'node',format:'cjs',packages:'external',plugins:[{name:'isolated-call-audio',setup(b){
      b.onResolve({filter:/^agora-rtc-sdk-ng$/},()=>({path:'sdk',namespace:'fixture'}));
      b.onResolve({filter:/authClient$/},()=>({path:'auth',namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='auth'
        ?'export const authClient={getToken:()=>"fixture"}'
        :'export default globalThis.__translationRtc'}));
    }}]});
  assert.ok(!Object.keys(bundle.metafile!.inputs).some(path=>/src\/(?:server\/|lib\/authClient)/.test(path)));
  const module={exports:{} as any};
  new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const client=module.exports.agoraClient;
  t.after(async()=>{await client.leaveChannel();for(const [key,value]of saved){
    if(value===undefined)delete(globalThis as any)[key];else(globalThis as any)[key]=value;
  }});
  await client.joinChannel('call-one','user','User','audio');
  await client.unlockTranslatedAudio();
  return {client,events,sources,raws,contexts,fail:()=>{failCustom=true;},
    hold:(promise:Promise<void>|null)=>{customPublish=promise;},
    holdUnpublish:(promise:Promise<void>|null)=>{customUnpublish=promise;}};
}

test('translated phrases share one publication and recognition keeps the original microphone',async t=>{
  const f=await fixture(t);
  assert.equal(await f.client.prepareTranslatedAudio(),true);
  assert.equal(await f.client.prepareTranslatedAudio(),true);
  const published=f.events.filter(value=>value.includes(':publish:')).length;
  const unpublished=f.events.filter(value=>value.includes(':unpublish:')).length;
  for(let i=0;i<3;i++){
    const played=f.client.injectTranslatedAudioToRemote({} as AudioBuffer);
    await flush();assert.equal(f.sources.length,i+1);
    f.sources[i].finish();assert.equal(await played,true);
  }
  assert.equal(f.events.filter(value=>value.includes(':publish:')).length,published);
  assert.equal(f.events.filter(value=>value.includes(':unpublish:')).length,unpublished);
  assert.equal(f.client.getLocalStream().getAudioTracks()[0],f.raws[0]);
  assert.equal(f.contexts[0].inputs[0],f.raws[0]);
  assert.equal(f.raws[0].stopped,false);
  await f.client.restoreOriginalAudioTrack();
  const restored=f.events.length;
  await f.client.restoreOriginalAudioTrack();
  assert.equal(f.events.length,restored,'Restoring an unchanged microphone must not renegotiate it');
});

test('stopping translation cancels playing and queued speech without replaying stale phrases',async t=>{
  const f=await fixture(t);await f.client.prepareTranslatedAudio();
  let errors=0;
  f.client.scheduleTranslatedAudioToRemote({} as AudioBuffer,()=>errors++);
  f.client.scheduleTranslatedAudioToRemote({} as AudioBuffer,()=>errors++);
  await flush();assert.equal(f.sources.length,1);
  await f.client.restoreOriginalAudioTrack();await flush();
  assert.equal(f.sources.length,1);
  assert.equal(errors,0,'An explicit stop is not a failed paid translation');
  assert.equal(f.client.queuedTranslations,0);
  assert.equal(f.raws[0].stopped,false);
});

test('a rejected mixed publication restores ordinary audio and reports failure',async t=>{
  const f=await fixture(t);f.fail();
  assert.equal(await f.client.prepareTranslatedAudio(),false);
  assert.equal(f.client.localAudio.getMediaStreamTrack(),f.raws[0]);
  assert.ok(f.events.filter(value=>value.endsWith('publish:mic-1')).length>=2);
  assert.equal(f.raws[0].stopped,false);
  assert.equal(f.client.translationMixer,null);
});

test('late translation publication after hangup cannot replace the next call microphone',async t=>{
  const f=await fixture(t),pending=deferred();f.hold(pending.promise);
  const preparing=f.client.prepareTranslatedAudio();await flush();
  assert.ok(f.events.includes('1:publish:mixed'));
  await f.client.leaveChannel();
  f.hold(null);
  await f.client.joinChannel('call-two','user','User','audio');
  pending.resolve();
  assert.equal(await preparing,false);
  assert.equal(f.client.currentChannel,'call-two');
  assert.equal(f.client.localAudio.getMediaStreamTrack(),f.raws[1]);
  assert.equal(f.raws[1].stopped,false);
  assert.ok(f.events.includes('1:unpublish:mixed'));
  assert.ok(!f.events.includes('2:unpublish:mixed'));
});

test('muting a prepared output does not stop its borrowed recognition microphone',async t=>{
  const f=await fixture(t);await f.client.prepareTranslatedAudio();
  await f.client.setAudioMuted(true);
  assert.equal(f.client.localAudio.muted,true);
  assert.equal(f.raws[0].stopped,false);
  await f.client.setAudioMuted(false);
  assert.equal(f.client.localAudio.muted,false);
  assert.equal(f.client.originalAudio.enabled,true);
  assert.equal(f.events.filter(value=>value.endsWith(':publish:mixed')).length,1);
});

test('a stalled translated publication has a deadline and cleans up late success',async t=>{
  const f=await fixture(t),pending=deferred();f.hold(pending.promise);
  t.mock.timers.enable({apis:['setTimeout']});
  const preparing=f.client.prepareTranslatedAudio();await flush();
  t.mock.timers.tick(8000);await flush();
  assert.equal(await preparing,false);
  assert.equal(f.client.localAudio.getMediaStreamTrack(),f.raws[0]);
  pending.resolve();await flush();
  assert.ok(f.events.includes('1:unpublish:mixed'));
});

test('concurrent translation preparation negotiates only one output',async t=>{
  const f=await fixture(t),pending=deferred();f.hold(pending.promise);
  const first=f.client.prepareTranslatedAudio(),second=f.client.prepareTranslatedAudio();
  assert.equal(first,second);
  await flush();pending.resolve();
  assert.equal(await first,true);
  assert.equal(f.events.filter(value=>value.endsWith(':publish:mixed')).length,1);
});

test('a new call does not wait for the previous call speech queue or inherit its counters',async t=>{
  const f=await fixture(t),pending=deferred();f.hold(pending.promise);
  const old=f.client.injectTranslatedAudioToRemote({} as AudioBuffer);await flush();
  await f.client.leaveChannel();
  f.hold(null);
  await f.client.joinChannel('replacement','user','User','audio');
  const next=f.client.injectTranslatedAudioToRemote({} as AudioBuffer);await flush();
  assert.equal(f.sources.length,1);
  assert.equal(f.client.queuedTranslations,1);
  pending.resolve();assert.equal(await old,false);
  assert.equal(f.client.queuedTranslations,1);
  f.sources[0].finish();assert.equal(await next,true);
  assert.equal(f.client.queuedTranslations,0);
});

test('muting during translation preparation cancels the handoff and restores a muted microphone',async t=>{
  const f=await fixture(t),pending=deferred();f.hold(pending.promise);
  const preparing=f.client.prepareTranslatedAudio();await flush();
  await f.client.setAudioMuted(true);
  assert.equal(f.client.translatedAudio.muted,true);
  pending.resolve();assert.equal(await preparing,false);
  await f.client.restoreOriginalAudioTrack();
  assert.equal(f.client.localAudio,f.client.originalAudio);
  assert.equal(f.client.originalAudio.enabled,false);
  await f.client.setAudioMuted(false);
  assert.equal(f.client.originalAudio.enabled,true);
});

test('ordinary audio restoration cannot permanently lock translation on a stalled SDK request',async t=>{
  const f=await fixture(t);await f.client.prepareTranslatedAudio();
  const pending=deferred();f.holdUnpublish(pending.promise);
  t.mock.timers.enable({apis:['setTimeout']});
  const restoring=f.client.restoreOriginalAudioTrack();await flush();
  t.mock.timers.tick(8000);await flush();await restoring;
  assert.equal(f.client.translationRestoration,null);
  assert.equal(f.client.localAudio,f.client.originalAudio);
  f.holdUnpublish(null);pending.resolve();
  assert.equal(await f.client.prepareTranslatedAudio(),true);
});
