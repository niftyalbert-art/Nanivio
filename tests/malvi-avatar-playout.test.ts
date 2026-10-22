import assert from 'node:assert/strict';
import test from 'node:test';
import { MalviAvatarPlayout, malviLeadingSilenceMs } from '../src/lib/malviAvatarPlayout.ts';
import { malviVideoQuality, createLiveAvatarService } from '../src/server/assistant/liveAvatarService.ts';

test('Android uses a documented lighter video profile, without changing voice speed or codec', async () => {
  assert.equal(malviVideoQuality('Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile'), 'medium');
  assert.equal(malviVideoQuality('Mozilla/5.0 (Windows NT 10.0) Chrome/130.0'), 'high');
  assert.equal(malviVideoQuality(''), 'high');
  let sent: any;
  const service = createLiveAvatarService({
    store: async () => ({ reserve: async () => {}, save: async () => {} }) as any,
    provider: async (_path, body) => { sent = body; return { session_id: 'fixture', session_token: 'fixture' }; },
    now: () => 1, uuid: () => 'fixture',
  });
  await service.create('test-owner', 'en', 'LITE', 'medium');
  assert.deepEqual(sent.video_settings, {quality:'medium',encoding:'H264'});
  assert.equal(sent.mode, 'LITE');
  assert.equal(sent.avatar_persona, undefined);
});

test('leading silence is measured in the supplied PCM rather than a fixed subtitle delay', () => {
  const pcm = Buffer.alloc(24000 * 2);
  for (let i = 24000 / 5; i < pcm.length / 2; i++) pcm.writeInt16LE(5000, i * 2);
  assert.equal(malviLeadingSilenceMs(pcm.toString('base64')), 200);
  assert.equal(malviLeadingSilenceMs(Buffer.alloc(100).toString('base64')), 0);
});

test('captions wait for output audio, ignore early provider end, pause when muted and clean up owned capture only', async () => {
  const oldContext = globalThis.AudioContext;
  let level = 0, started = 0, ended = 0, clock: (()=>number|null) | null = null;
  let context: any, captureStopped = 0, sdkStopped = 0;
  const sdkTrack = {stop:()=>sdkStopped++};
  const capturedTrack = {stop:()=>captureStopped++};
  class Context {
    state = 'running'; currentTime = 0; destination = {};
    constructor() { context=this; }
    createMediaStreamSource() { return {connect(){},disconnect(){}}; }
    createAnalyser() { return {fftSize:1024,connect(){},disconnect(){},getFloatTimeDomainData(a:Float32Array){a.fill(level);}}; }
    createGain() {return {gain:{value:1},connect(){},disconnect(){}};}
    async close() {this.state='closed';}
  }
  globalThis.AudioContext = Context as any;
  const video = {
    muted:false,paused:false,volume:1,srcObject:{getTracks:()=>[sdkTrack]},
    captureStream:()=>({getAudioTracks:()=>[capturedTrack],getTracks:()=>[capturedTrack]}),
  } as any;
  const observer = new MalviAvatarPlayout((_track, getTime) => { started++; clock=getTime; }, () => ended++);
  const wait = () => new Promise(resolve=>setTimeout(resolve,40));
  try {
    await observer.resume();
    observer.attach(video);
    const track = {durationMs:1000,alignment:{characters:['H'],character_start_times_seconds:[0],character_end_times_seconds:[1]}};
    observer.enqueue(track, Buffer.alloc(4800).toString('base64'));
    observer.providerStart(); observer.providerStart(); observer.providerEnd();
    await wait(); assert.equal(started,0,'processing notifications are not audible playback');
    level=0.1; context.currentTime=1; await wait();
    assert.equal(started,1);
    assert.equal(clock!(),0);
    assert.equal(ended,0,'provider end must not erase audio still in the playback buffer');
    context.currentTime=1.5; assert.equal(clock!(),500);
    video.muted=true; assert.equal(clock!(),null);
    video.muted=false;
    const replacement={...video,muted:true};
    observer.attach(replacement);
    assert.equal(clock!(),null,'caption visibility follows a remounted player, not an orphaned element');
    replacement.muted=false; context.currentTime=2.1; await wait();
    assert.equal(ended,1);
    observer.enqueue(track,Buffer.alloc(4800).toString('base64'));
    observer.providerStart(); observer.cancel(); await wait();
    assert.equal(started,1,'cancelled turns cannot restart captions');
    observer.close();
    assert.equal(captureStopped,2); assert.equal(sdkStopped,0);
    assert.equal(context.state,'closed');
  } finally { observer.close(); globalThis.AudioContext=oldContext; }
});
