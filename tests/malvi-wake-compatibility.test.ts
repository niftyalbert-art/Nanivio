// Capability fixtures, NOT claims of running the named browser engines.
import assert from 'node:assert/strict';
import test from 'node:test';
import { startLocalMalviWakeWord, installLocalMalviWakeWordPack } from '../src/lib/localMalviWakeWord.ts';

async function withWindow(value: object, run: () => Promise<void>) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value });
  try { await run(); }
  finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else delete (globalThis as any).window;
  }
}

function localFixture() {
  const calls = { starts: 0, stops: 0, checks: 0, installs: 0, restartStarts: true };
  let instance: any;
  class Recognition {
    onstart: any; onend: any; onerror: any; onresult: any;
    static async available(options: any) {
      assert.deepEqual(options, { langs:['en-US'],processLocally:true });
      calls.checks++; return 'available';
    }
    static async install() { calls.installs++; return true; }
    constructor() { instance=this; }
    start() {
      assert.equal((this as any).processLocally,true);
      calls.starts++;
      if(calls.starts===1 || calls.restartStarts) this.onstart?.();
    }
    abort() { calls.stops++; }
  }
  Object.defineProperty(Recognition.prototype,'processLocally',{value:false,writable:true,configurable:true});
  return {Recognition,calls,get instance(){return instance;}};
}

for(const profile of ['desktop Chrome with local APIs','desktop Edge with local APIs','Firefox preview with local APIs','vendor-prefixed constructor with verified local APIs']) {
  test(`capability fixture: ${profile} enables only explicitly local listening`, async()=>{
    const f=localFixture(), states:string[]=[];
    const name=profile.startsWith('vendor')?'webkitSpeechRecognition':'SpeechRecognition';
    await withWindow({isSecureContext:true,[name]:f.Recognition},async()=>{
      const stop=await startLocalMalviWakeWord(assert.fail,assert.fail,undefined,state=>states.push(state));
      assert.deepEqual(states,['listening']); assert.equal(f.calls.starts,1);
      stop(); assert.equal(f.calls.stops,1);
    });
  });
}

for(const profile of ['Chrome Android legacy speech only','stable Firefox without local APIs','Safari legacy speech only','old Edge without local APIs','malformed recognition API']) {
  test(`capability fixture: ${profile} reports unsupported without using cloud recognition`,async()=>{
    let legacyStarts=0;
    class Legacy {start(){legacyStarts++;}}
    const api=profile.includes('malformed')?{available:()=>Promise.resolve('available')}:undefined;
    await withWindow({isSecureContext:true,SpeechRecognition:api,webkitSpeechRecognition:Legacy},async()=>{
      await assert.rejects(startLocalMalviWakeWord(assert.fail,assert.fail),(error:any)=>
        error.code==='UNSUPPORTED_BROWSER' && /Start live avatar/.test(error.message));
      assert.equal(legacyStarts,0);
    });
  });
}

test('insecure pages and blocked permission-policy probes never start recognition',async()=>{
  const f=localFixture();
  await withWindow({isSecureContext:false,SpeechRecognition:f.Recognition},async()=>{
    await assert.rejects(startLocalMalviWakeWord(assert.fail,assert.fail),/secure HTTPS/);
    assert.equal(f.calls.checks,0);
  });
  f.Recognition.available=async()=>{throw new DOMException('Policy denied','NotAllowedError');};
  await withWindow({isSecureContext:true,SpeechRecognition:f.Recognition},async()=>{
    await assert.rejects(startLocalMalviWakeWord(assert.fail,assert.fail),/blocked the on-device speech check/);
    assert.equal(f.calls.starts,0);
  });
});

test('a recognizer that cannot enforce processLocally=true is never started',async()=>{
  const f=localFixture();
  Object.defineProperty(f.Recognition.prototype,'processLocally',{get:()=>false,set:()=>{},configurable:true});
  await withWindow({SpeechRecognition:f.Recognition},async()=>{
    await assert.rejects(startLocalMalviWakeWord(assert.fail,assert.fail),/could not enforce on-device/);
    assert.equal(f.calls.starts,0);
  });
});

test('ended recognition loses listening status until an acknowledged local restart',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=localFixture(), states:string[]=[];
  await withWindow({SpeechRecognition:f.Recognition},async()=>{
    const stop=await startLocalMalviWakeWord(assert.fail,assert.fail,undefined,state=>states.push(state));
    f.instance.onend();
    assert.deepEqual(states,['listening','restarting']);
    t.mock.timers.tick(301);
    assert.deepEqual(states,['listening','restarting','listening']);
    assert.equal(f.calls.starts,2);
    stop(); t.mock.timers.tick(10001);
    assert.equal(f.calls.starts,2,'stopped listeners cannot restart themselves');
  });
});

test('a stalled restart reports failure instead of leaving Enabled active forever',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=localFixture(), states:string[]=[], errors:string[]=[];
  f.calls.restartStarts=false;
  await withWindow({SpeechRecognition:f.Recognition},async()=>{
    await startLocalMalviWakeWord(assert.fail,message=>errors.push(message),undefined,state=>states.push(state));
    f.instance.onend(); t.mock.timers.tick(301); t.mock.timers.tick(10001);
    assert.deepEqual(states,['listening','restarting']);
    assert.equal(errors.length,1); assert.match(errors[0],/did not start or restart/);
    assert.equal(f.calls.stops,1);
  });
});

test('pack installation is bounded and never starts a recognizer',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=localFixture();
  f.Recognition.install=()=>new Promise<boolean>(()=>{});
  await withWindow({SpeechRecognition:f.Recognition},async()=>{
    const failure=assert.rejects(installLocalMalviWakeWordPack(),/after two minutes/);
    t.mock.timers.tick(120001); await failure;
    assert.equal(f.calls.starts,0);
  });
});
