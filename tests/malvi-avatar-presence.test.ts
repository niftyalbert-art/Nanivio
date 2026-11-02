import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {startMalviAvatarPresence} from '../src/lib/malviAvatarPresence.ts';
import {MalviSessionClock} from '../src/lib/malviSessionClock.ts';

function fixture(keepAlive:()=>Promise<void>,authorized:()=>boolean) {
  let tick!:()=>Promise<void>,cancelled=0;
  const stop=startMalviAvatarPresence({keepAlive,isAuthorized:authorized,
    schedule:(callback,ms)=>{assert.equal(ms,20_000);tick=callback;return()=>{cancelled++;};},
  });
  return {tick:()=>tick(),stop,cancelled:()=>cancelled};
}
test('active conversation remains connected past one minute without presence extending app deadlines',async()=>{
  let now=0,providerLastSeen=0,calls=0;
  const clock=new MalviSessionClock(()=>now);
  clock.update({serverNow:now,idleDeadline:60_000,hardDeadline:600_000});
  const f=fixture(async()=>{calls++;providerLastSeen=now;},()=>clock.secondsRemaining()!>0);
  for(now=10_000;now<=180_000;now+=10_000){
    // Only authoritative conversation activity may extend the idle window.
    if(now%30_000===0)clock.update({serverNow:now,idleDeadline:now+60_000,hardDeadline:600_000});
    const before=clock.secondsRemaining();
    if(now%20_000===0)await f.tick();
    assert.equal(clock.secondsRemaining(),before);
    assert.ok(now-providerLastSeen<60_000,'renderer must not become idle while conversation is active');
  }
  assert.equal(calls,9);
  f.stop();await f.tick();assert.equal(calls,9);
});
test('presence cannot keep a silent or hard-expired session alive',async()=>{
  for(const hardDeadline of [600_000,25_000]){
    let now=0,calls=0;
    const clock=new MalviSessionClock(()=>now);
    clock.update({serverNow:0,idleDeadline:60_000,hardDeadline});
    const f=fixture(async()=>{calls++;},()=>clock.secondsRemaining()!>0);
    now=20_000;await f.tick();assert.equal(calls,1);
    now=Math.min(60_000,hardDeadline);await f.tick();assert.equal(calls,1);
    now+=100_000;await f.tick();assert.equal(calls,1);
    f.stop();
  }
});
test('checks cannot overlap; closing or replacing a session prevents subsequent checks',async()=>{
  let authorized=true,calls=0,release!:()=>void;
  const f=fixture(()=>{calls++;return new Promise(resolve=>{release=resolve;});},()=>authorized);
  const first=f.tick();await f.tick();assert.equal(calls,1);
  authorized=false;release();await first;await f.tick();assert.equal(calls,1);
  f.stop();f.stop();assert.equal(f.cancelled(),1);
  authorized=true;await f.tick();assert.equal(calls,1);
});
test('a transient presence error is handled without starting a new session or reviving an expired one',async()=>{
  let tick!:()=>Promise<void>,failures=0,calls=0,authorized=true;
  const stop=startMalviAvatarPresence({
    isAuthorized:()=>authorized,
    keepAlive:async()=>{calls++;throw Error('fixture failure');},
    onFailure:()=>{failures++;},
    schedule:callback=>{tick=callback;return()=>{};},
  });
  await tick();assert.equal(failures,1);assert.equal(calls,1);
  authorized=false;await tick();assert.equal(calls,1);
  stop();
});
test('live integration gates presence by server clock and current session, and cleans it up',()=>{
  const source=readFileSync(new URL('../src/components/malvi/MalviLiveAssistant.tsx',import.meta.url),'utf8');
  assert.match(source,/autoKeepAlive:\s*false/,'unbounded SDK auto-presence stays disabled');
  assert.match(source,/keepAlive:\(\)=>live\.keepAlive\(\)/);
  assert.match(source,/sessionId\.current===info\.id/);
  assert.match(source,/sessionClock\.current\.secondsRemaining\(\)\?\?0/);
  assert.match(source,/stopAvatarPresence\.current\?\.\(\); stopAvatarPresence\.current=null/);
});
