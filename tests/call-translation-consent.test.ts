import test from 'node:test';
import assert from 'node:assert/strict';
import { CallTranslationConsent } from '../src/server/callTranslationConsent';

function fixture() {
  const messages:{user:string;type:string;payload:Record<string,unknown>}[]=[];
  const activations:string[]=[];
  const call={status:'connected',participants:['a','b']};
  const coordinator=new CallTranslationConsent({
    call:id=>id==='call'?call:undefined,
    send:(user,type,payload)=>{messages.push({user,type,payload});return true;},
    enable:async(id,sponsor,current)=>{assert.ok(current());activations.push(sponsor);},
  });
  return {coordinator,messages,activations,call,
    requestId:()=>String(messages.find(m=>m.type==='call:langpretation_consent_request')!.payload.requestId)};
}

test('waiting for partner approval does not start translation or reserve usage',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=fixture();
  f.coordinator.request('call','a');
  t.mock.timers.tick(15000); // Longer than the former provider readiness window.
  assert.deepEqual(f.activations,[]);
  assert.equal(f.coordinator.hasConsent('call','a'),false);
  await f.coordinator.respond('call',f.requestId(),'b',true);
  assert.deepEqual(f.activations,['a']);
  assert.equal(f.coordinator.hasConsent('call','a'),true);
  f.coordinator.cancel('call');
});
test('declining leaves the original call connected and starts no translation',async()=>{
  const f=fixture();f.coordinator.request('call','a');
  await f.coordinator.respond('call',f.requestId(),'b',false);
  assert.deepEqual(f.activations,[]);
  assert.equal(f.call.status,'connected');
  assert.equal(f.coordinator.hasConsent('call','a'),false);
});
test('a stranger and the sponsor cannot accept on the listener’s behalf',async()=>{
  const f=fixture();f.coordinator.request('call','a');
  await assert.rejects(f.coordinator.respond('call',f.requestId(),'stranger',true));
  await assert.rejects(f.coordinator.respond('call',f.requestId(),'a',true));
  assert.deepEqual(f.activations,[]);f.coordinator.cancel('call');
});
test('permission expiry and late replies never start a provider',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=fixture();f.coordinator.request('call','a');const id=f.requestId();
  t.mock.timers.tick(60001);
  await assert.rejects(f.coordinator.respond('call',id,'b',true));
  assert.deepEqual(f.activations,[]);
  assert.ok(f.messages.some(m=>m.type==='call:langpretation_consent_cancelled'));
});
test('ending a call invalidates outstanding permission',async()=>{
  const f=fixture();f.coordinator.request('call','a');const id=f.requestId();
  f.call.status='ended';f.coordinator.cancel('call');
  await assert.rejects(f.coordinator.respond('call',id,'b',true));
  assert.deepEqual(f.activations,[]);
});
test('duplicate taps cancel a pending request instead of opening paid streams',()=>{
  const f=fixture();f.coordinator.request('call','a');f.coordinator.request('call','a');
  assert.equal(f.coordinator.hasConsent('call','a'),false);
  assert.deepEqual(f.activations,[]);
  assert.ok(f.messages.some(m=>m.type==='call:langpretation_consent_cancelled'));
});
test('cancellation while billing is awaiting makes its commit guard false',async()=>{
  let release!:()=>void;let permitted=true;
  const messages:Record<string,unknown>[]=[];
  const c=new CallTranslationConsent({
    call:()=>({status:'connected',participants:['a','b']}),
    send:(_u,_t,p)=>{messages.push(p);return true;},
    enable:async(_id,_s,current)=>{await new Promise<void>(r=>{release=r;});permitted=current();},
  });
  c.request('call','a');
  const reply=c.respond('call',String(messages[0].requestId),'b',true);
  c.cancel('call');release();await reply;
  assert.equal(permitted,false);
  assert.equal(c.hasConsent('call','a'),false);
});
