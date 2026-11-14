import test from 'node:test';
import assert from 'node:assert/strict';
import {OrderedSpeechQueue} from '../src/services/orderedSpeechQueue.ts';

function deferred(){
  let resolve!:()=>void,reject!:(error:Error)=>void;
  const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

test('capture can enqueue additional phrases while the provider processes one, preserving order',async()=>{
  const abort=new AbortController(),first=deferred(),events:string[]=[],backlog:number[]=[];
  const q=new OrderedSpeechQueue(abort.signal,assert.fail,n=>backlog.push(n));
  assert.equal(q.enqueue(4,async()=>{events.push('first');await first.promise;}),true);
  assert.equal(q.enqueue(4,async()=>{events.push('second');}),true);
  assert.equal(q.enqueue(4,async()=>{events.push('third');}),true);
  assert.deepEqual(events,['first']);assert.equal(backlog.at(-1),8);
  first.resolve();await flush();
  assert.deepEqual(events,['first','second','third']);assert.equal(backlog.at(-1),0);
});
test('each direction has its own worker and neither waits for the other speaker',async()=>{
  const abort=new AbortController(),first=deferred(),events:string[]=[];
  const a=new OrderedSpeechQueue(abort.signal,assert.fail),b=new OrderedSpeechQueue(abort.signal,assert.fail);
  a.enqueue(4,async()=>{events.push('A');await first.promise;});
  b.enqueue(4,async()=>{events.push('B');});
  await flush();assert.deepEqual(events,['A','B']);first.resolve();await flush();
});
test('a processing error never triggers another paid request for the same phrase or queued speech',async()=>{
  const abort=new AbortController(),first=deferred(),errors:Error[]=[],events:string[]=[];
  const q=new OrderedSpeechQueue(abort.signal,e=>errors.push(e));
  q.enqueue(4,async()=>{events.push('first');await first.promise;});
  q.enqueue(4,async()=>{events.push('second');});
  first.reject(new Error('Speech unavailable'));await flush();
  assert.deepEqual(events,['first']);assert.equal(errors.length,1);
  assert.equal(q.enqueue(1,async()=>assert.fail('No requests after failure')),false);
});
test('ending or muting a call clears waiting phrases before they can spend credits',async()=>{
  const abort=new AbortController(),first=deferred(),events:string[]=[];
  const q=new OrderedSpeechQueue(abort.signal,assert.fail);
  q.enqueue(4,async()=>{events.push('first');await first.promise;});
  q.enqueue(4,async()=>{events.push('second');});
  abort.abort();first.resolve();await flush();
  assert.deepEqual(events,['first']);
});
test('backlog is bounded and the user is explicitly told about interruption rather than silent loss',async()=>{
  const abort=new AbortController(),first=deferred(),errors:Error[]=[];
  const q=new OrderedSpeechQueue(abort.signal,e=>errors.push(e));
  q.enqueue(4,async()=>first.promise);
  q.enqueue(4,async()=>assert.fail('Cleared waiting speech must not execute'));
  q.enqueue(4,async()=>assert.fail('Cleared waiting speech must not execute'));
  assert.equal(q.enqueue(4,async()=>assert.fail('Cannot accept overflow')),false);
  assert.equal(errors.length,1);assert.match(errors[0].message,/paused.*call is still connected/);
  first.resolve();await flush();
});
