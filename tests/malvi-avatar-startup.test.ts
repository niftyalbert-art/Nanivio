import test from 'node:test';
import assert from 'node:assert/strict';
import { MalviAvatarStartup } from '../src/lib/malviAvatarStartup';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function videoFixture() {
  let callback:()=>void=()=>{};
  let cancelled=false;
  const video={
    requestVideoFrameCallback(fn:()=>void){callback=fn;return 1;},
    cancelVideoFrameCallback(){cancelled=true;},
  } as unknown as HTMLVideoElement;
  return {video,frame:()=>callback(),cancelled:()=>cancelled};
}
test('SDK startup and subscribed tracks are not reported as a rendered live avatar',async()=>{
  let ready=0; const errors:string[]=[];
  const startup=new MalviAvatarStartup(()=>ready++,message=>errors.push(message));
  const f=videoFixture();
  startup.observe(f.video); startup.started(); await flush();
  assert.equal(ready,0);
  f.frame(); await flush();
  assert.equal(ready,1); assert.deepEqual(errors,[]);
  startup.started(); f.frame(); await flush(); assert.equal(ready,1);
});
test('a rendered frame cannot release queued voice before SDK startup completes',async()=>{
  let ready=0;
  const startup=new MalviAvatarStartup(()=>ready++,()=>assert.fail('Unexpected startup failure'));
  const f=videoFixture(); startup.observe(f.video);
  f.frame(); await flush(); assert.equal(ready,0);
  startup.started(); assert.equal(ready,1);
});
test('a session that never receives media times out even if SDK start already resolved',async()=>{
  let ready=0; const errors:string[]=[];
  const startup=new MalviAvatarStartup(()=>ready++,message=>errors.push(message),20);
  startup.started();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(ready,0); assert.equal(errors.length,1);
  assert.match(errors[0],/live video did not become playable/);
});
test('a subscribed video that never renders fails once instead of leaving a connected blank screen',async()=>{
  const errors:string[]=[];
  const startup=new MalviAvatarStartup(()=>assert.fail('No decoded frame'),message=>errors.push(message),20);
  const f=videoFixture(); startup.observe(f.video); startup.started();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(errors.length,1); assert.equal(f.cancelled(),true);
  f.frame(); await flush(); assert.equal(errors.length,1);
});
test('closing while connecting cancels frame callbacks and never emits a late failure or ready event',async()=>{
  let ready=0; const errors:string[]=[];
  const startup=new MalviAvatarStartup(()=>ready++,message=>errors.push(message),20);
  const f=videoFixture(); startup.observe(f.video); startup.cancel(); f.frame(); startup.started();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(f.cancelled(),true); assert.equal(ready,0); assert.deepEqual(errors,[]);
});
test('replacing the video element discards the old element’s frame callback',async()=>{
  let ready=0;
  const startup=new MalviAvatarStartup(()=>ready++,()=>assert.fail('Unexpected startup failure'));
  const old=videoFixture(),current=videoFixture();
  startup.observe(old.video); startup.started(); startup.observe(current.video);
  old.frame(); await flush(); assert.equal(ready,0);
  current.frame(); await flush(); assert.equal(ready,1); assert.equal(old.cancelled(),true);
});
test('an already rendered playing frame does not wait for a future idle frame',()=>{
  let ready=0;
  const startup=new MalviAvatarStartup(()=>ready++,()=>assert.fail('Already rendered'));
  const f=videoFixture();
  Object.assign(f.video,{paused:false,readyState:4,videoWidth:720,videoHeight:1280,
    getVideoPlaybackQuality:()=>({totalVideoFrames:3})});
  startup.observe(f.video); assert.equal(ready,0);
  startup.started(); assert.equal(ready,1);
});
test('metadata and subscribed tracks alone cannot bypass the decoded-frame gate',async()=>{
  let ready=0;
  const startup=new MalviAvatarStartup(()=>ready++,()=>assert.fail('Unexpected failure'));
  const f=videoFixture();
  Object.assign(f.video,{paused:false,readyState:4,videoWidth:720,videoHeight:1280,
    getVideoPlaybackQuality:()=>({totalVideoFrames:0})});
  startup.observe(f.video);startup.started();await flush();assert.equal(ready,0);
  f.frame();await flush();assert.equal(ready,1);
});
test('startup failures distinguish missing tracks from stalled playback without secrets',async()=>{
  const errors:string[]=[];
  const missing=new MalviAvatarStartup(()=>assert.fail('No tracks'),m=>errors.push(m),10);
  missing.started();
  const paused=new MalviAvatarStartup(()=>assert.fail('No frame'),m=>errors.push(m),10);
  const f=videoFixture();Object.assign(f.video,{paused:true});
  paused.observe(f.video);paused.started();
  await new Promise(r=>setTimeout(r,30));
  assert.equal(errors.length,2);
  assert.ok(errors.some(message=>message.includes('STARTUP_TRACKS')));
  assert.ok(errors.some(message=>message.includes('STARTUP_PLAYBACK')));
});
test('dropped frames are not evidence of a visible startup frame',async()=>{
  let ready=0;
  const startup=new MalviAvatarStartup(()=>ready++,()=>assert.fail('Unexpected failure'));
  const f=videoFixture();
  Object.assign(f.video,{paused:false,readyState:4,videoWidth:720,videoHeight:1280,
    getVideoPlaybackQuality:()=>({totalVideoFrames:3,droppedVideoFrames:3})});
  startup.observe(f.video);startup.started();await flush();assert.equal(ready,0);
  f.frame();await flush();assert.equal(ready,1);
});
