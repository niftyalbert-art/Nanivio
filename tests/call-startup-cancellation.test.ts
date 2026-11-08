import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {CallMediaSetupError,callMediaErrorMessage} from '../src/lib/callMediaErrors';

function deferred<T=void>(){
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(done=>{resolve=done;});
  return {promise,resolve};
}
async function fixture(t:any){
  const previousFetch=globalThis.fetch,previousStream=(globalThis as any).MediaStream;
  const events:string[]=[],clients:any[]=[];
  const track=(kind='audio')=>({
    getMediaStreamTrack:()=>({kind}),setEnabled:async()=>{},
    stop:()=>events.push(`${kind}:stop`),close:()=>events.push(`${kind}:close`),
  });
  const sdk={
    createClient:()=>{
      const rtc={on(){},remoteUsers:[],join:async()=>{},publish:async()=>{},
        leave:async()=>{events.push('leave');}};
      clients.push(rtc);return rtc;
    },
    createMicrophoneAudioTrack:async()=>track(),
    createCameraVideoTrack:async()=>track('video'),
  };
  (globalThis as any).__startupRtc=sdk;
  (globalThis as any).MediaStream=class{
    constructor(public tracks:any[]=[]){}
    getTracks(){return this.tracks;}
    getAudioTracks(){return this.tracks.filter(track=>track.kind==='audio');}
    getVideoTracks(){return this.tracks.filter(track=>track.kind==='video');}
  };
  globalThis.fetch=async input=>{
    const path=String(input);
    if(path.endsWith('/token'))return Response.json({token:'fixture-token',appId:'fixture-app',agoraUid:1});
    if(path.endsWith('/join'))events.push('register');
    return Response.json({success:true});
  };
  t.after(()=>{globalThis.fetch=previousFetch;(globalThis as any).MediaStream=previousStream;
    delete (globalThis as any).__startupRtc;});
  const compiled=await build({entryPoints:['src/lib/agoraClient.ts'],bundle:true,write:false,
    platform:'node',format:'cjs',packages:'external',
    plugins:[{name:'startup-fixture',setup(builder){
      builder.onResolve({filter:/^agora-rtc-sdk-ng$/},()=>({path:'sdk',namespace:'fixture'}));
      builder.onResolve({filter:/authClient$/},()=>({path:'auth',namespace:'fixture'}));
      builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',
        contents:args.path==='sdk'?'export default globalThis.__startupRtc;':
          'export const authClient={getToken:()=>"fixture-session"};'}));
    }}]});
  const module={exports:{} as any};
  new Function('require','module','exports',compiled.outputFiles[0].text)(
    createRequire(import.meta.url),module,module.exports);
  const client=module.exports.agoraClient;
  return {client,sdk,clients,events,track};
}

test('hangup immediately rejects a pending SDK join and disposes its late completion',async t=>{
  const {client,sdk,events}=await fixture(t),entered=deferred(),late=deferred();
  const create=sdk.createClient;
  sdk.createClient=()=>{const rtc=create();rtc.join=()=>{entered.resolve();return late.promise;};return rtc;};
  const rejected=assert.rejects(client.joinChannel('cancelled','user','User','audio'),
    (error:any)=>error.stage==='join'&&error.original.name==='AbortError');
  await entered.promise;
  await client.leaveChannel();
  await rejected;
  assert.equal(client.getStats().connectionState,'DISCONNECTED');
  assert.ok(!events.includes('register'));
  late.resolve();await new Promise(resolve=>setImmediate(resolve));
  assert.ok(events.filter(event=>event==='leave').length>=2);
});

test('cancelled token responses cannot overwrite the next call credentials or expiry',async t=>{
  const {client}=await fixture(t),entered=deferred(),old=deferred<Response>();
  const base=globalThis.fetch;let oldSignal:AbortSignal|undefined;
  globalThis.fetch=async(input,init)=>{
    if(String(input).endsWith('/token')&&JSON.parse(String(init?.body)).channelName==='old'){
      oldSignal=init?.signal as AbortSignal;entered.resolve();return old.promise;
    }
    return base(input,init);
  };
  const rejected=assert.rejects(client.joinChannel('old','user','User','audio'),
    (error:any)=>error.original.name==='AbortError');
  await entered.promise;await client.leaveChannel();await rejected;
  assert.equal(oldSignal?.aborted,true);
  await client.joinChannel('new','user','User','audio');
  const expiry=client.communicationTokenExpiry;
  old.resolve(Response.json({token:'stale-fixture',appId:'stale-app',agoraUid:999,communicationExpiresIn:1}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(client.token,'fixture-token');
  assert.equal(client.agoraUid,1);
  assert.equal(client.communicationTokenExpiry,expiry);
  assert.equal(client.getStats().channelName,'new');
  await client.leaveChannel();
});

test('hangup aborts registration and late success cannot connect or alter the next call',async t=>{
  const {client}=await fixture(t),entered=deferred(),old=deferred<Response>();
  const base=globalThis.fetch;let signal:AbortSignal|undefined;
  globalThis.fetch=async(input,init)=>{
    if(String(input).endsWith('/join')&&JSON.parse(String(init?.body)).channelName==='old'){
      signal=init?.signal as AbortSignal;entered.resolve();return old.promise;
    }
    return base(input,init);
  };
  const rejected=assert.rejects(client.joinChannel('old','user','User','video'),
    (error:any)=>error.stage==='registration'&&error.original.name==='AbortError');
  await entered.promise;await client.leaveChannel();await rejected;
  assert.equal(signal?.aborted,true);
  await client.joinChannel('new','user','User','audio');
  old.resolve(Response.json({success:true}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(client.getStats().channelName,'new');
  assert.equal(client.getStats().connectionState,'CONNECTED');
  await client.leaveChannel();
});

test('cancelling before queued startup begins never requests a token or creates an SDK client',async t=>{
  const {client,clients}=await fixture(t);let tokenRequests=0;
  const base=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{if(String(input).endsWith('/token'))tokenRequests++;return base(input,init);};
  const rejected=assert.rejects(client.joinChannel('cancelled','user','User','audio'),
    (error:any)=>error.original.name==='AbortError');
  await client.leaveChannel();await rejected;
  assert.equal(tokenRequests,0);assert.equal(clients.length,0);
});

for(const type of ['audio','video'] as const){
  test(`${type} SDK startup expires before a delayed connection can register`,async t=>{
    const {client,sdk,events}=await fixture(t),entered=deferred(),late=deferred();
    const create=sdk.createClient;
    sdk.createClient=()=>{const rtc=create();rtc.join=()=>{entered.resolve();return late.promise;};return rtc;};
    t.mock.timers.enable({apis:['setTimeout']});
    const rejected=assert.rejects(client.joinChannel('slow','user','User',type),
      (error:any)=>error.stage==='join'&&error.original.name==='TimeoutError');
    await entered.promise;t.mock.timers.tick(15001);await rejected;
    late.resolve();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(client.getStats().connectionState,'DISCONNECTED');
    assert.ok(!events.includes('register'));
    assert.ok(events.filter(event=>event==='leave').length>=2);
  });
  test(`${type} answer reuses approved preview capture`,async t=>{
    const {client,sdk}=await fixture(t);
    let microphones=0,cameras=0;
    const microphone=sdk.createMicrophoneAudioTrack,camera=sdk.createCameraVideoTrack;
    sdk.createMicrophoneAudioTrack=()=>{microphones++;return microphone();};
    sdk.createCameraVideoTrack=()=>{cameras++;return camera();};
    await client.startLocalPreview(type);
    await client.joinChannel('preview','user','User',type);
    assert.equal(microphones,1);assert.equal(cameras,type==='video'?1:0);
    await client.leaveChannel();
  });
}

test('a stalled old SDK leave releases capture immediately and cannot clear the next call',async t=>{
  const {client,clients}=await fixture(t);
  await client.joinChannel('old','user','User','video');
  clients[0].leave=()=>new Promise(()=>{});
  t.mock.timers.enable({apis:['setTimeout']});
  const leaving=client.leaveChannel();
  assert.equal(client.getLocalStream(),null);
  assert.equal(client.getStats().connectionState,'DISCONNECTED');
  await client.joinChannel('new','user','User','audio');
  t.mock.timers.tick(3001);await leaving;
  assert.equal(client.getStats().channelName,'new');
  assert.equal(client.getStats().connectionState,'CONNECTED');
  await client.leaveChannel();
});

test('the complete video startup has a shared deadline across individually responsive stages',async t=>{
  const {client,sdk,track,events}=await fixture(t);
  const joinEntered=deferred(),micEntered=deferred(),cameraEntered=deferred();
  const join=deferred(),mic=deferred<any>(),camera=deferred<any>();
  const create=sdk.createClient;
  sdk.createClient=()=>{const rtc=create();rtc.join=()=>{joinEntered.resolve();return join.promise;};return rtc;};
  sdk.createMicrophoneAudioTrack=()=>{micEntered.resolve();return mic.promise;};
  sdk.createCameraVideoTrack=()=>{cameraEntered.resolve();return camera.promise;};
  t.mock.timers.enable({apis:['setTimeout']});
  const rejected=assert.rejects(client.joinChannel('deadline','user','User','video'),
    (error:any)=>error.stage==='camera'&&error.original.name==='TimeoutError');
  await joinEntered.promise;t.mock.timers.tick(14000);join.resolve();
  await micEntered.promise;t.mock.timers.tick(14000);mic.resolve(track());
  await cameraEntered.promise;t.mock.timers.tick(2001);await rejected;
  camera.resolve(track('video'));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(client.getStats().connectionState,'DISCONNECTED');
  assert.ok(!events.includes('register'));
  assert.ok(events.includes('video:close'));
});

test('an owned renewal request still aborts at its own request deadline',async t=>{
  const {client}=await fixture(t),entered=deferred();
  let signal:AbortSignal|undefined;
  globalThis.fetch=async(_input,init)=>{
    signal=init?.signal as AbortSignal;entered.resolve();
    return new Promise<Response>((_resolve,reject)=>signal?.addEventListener('abort',()=>reject(signal?.reason),{once:true}));
  };
  t.mock.timers.enable({apis:['setTimeout']});
  const rejected=assert.rejects(client.fetchToken('owned','user',
    {generation:client.mediaGeneration,signal:new AbortController().signal}),
    (error:any)=>error.name==='TimeoutError');
  await entered.promise;t.mock.timers.tick(15001);await rejected;
  assert.equal(signal?.aborted,true);assert.equal(client.token,null);
});

test('cleanup failures cannot replace the original setup failure or leave devices registered',async t=>{
  const {client,sdk,events,track}=await fixture(t),create=sdk.createClient;
  sdk.createMicrophoneAudioTrack=async()=>({...track(),stop(){throw Error('fixture cleanup failure');}});
  sdk.createClient=()=>{const rtc=create();rtc.publish=async()=>{throw Error('fixture publish failure');};return rtc;};
  await assert.rejects(client.joinChannel('failed','user','User','audio'),
    (error:any)=>error.stage==='publish'&&error.original.message==='fixture publish failure');
  assert.ok(events.includes('audio:close'));
  assert.equal(client.getLocalStream(),null);
  assert.equal(client.getStats().connectionState,'DISCONNECTED');
  assert.ok(!events.includes('register'));
});

test('timeout recovery text identifies the blocked stage without exposing provider details',()=>{
  for(const [stage,expected]of [['join',/media service/],['microphone',/microphone/],
    ['camera',/camera/],['registration',/registering/]] as const){
    const message=callMediaErrorMessage(new CallMediaSetupError(stage,
      {name:'TimeoutError',message:'private fixture diagnostic'}),'video');
    assert.match(message,expected);assert.doesNotMatch(message,/private fixture diagnostic/);
  }
});
