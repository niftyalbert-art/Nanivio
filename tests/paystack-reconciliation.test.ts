import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaystackReconciler,startPaystackReconciliation} from '../src/server/paystackReconciliation.ts';

test('missed webhooks are reconciled using only successful matching live payments',async()=>{
  const orders=['paid','pending','test','wrong-amount','wrong-reference'].map(reference=>({
    reference,userId:'owner',purpose:'MALVI_SUBSCRIPTION',amount:58.24,currency:'GHS',
  }));
  const fulfilled:string[]=[],checked:string[]=[],errors:string[]=[];
  const run=createPaystackReconciler({
    list:async()=>orders,
    verify:async(reference)=>({reference:reference==='wrong-reference'?'different':reference,
      status:reference==='pending'?'pending':'success',domain:reference==='test'?'test':'live',
      amount:reference==='wrong-amount'?1:5824,currency:'GHS'}),
    fulfil:async(order)=>{fulfilled.push(order.reference);},
    checked:async(ref)=>{checked.push(ref);},report:ref=>{errors.push(ref);},
  });
  await run();
  assert.deepEqual(fulfilled,['paid']);
  assert.equal(checked.length,5);
  assert.equal(errors.length,3);
});

test('reconciliation does not overlap and continues after one activation error',async()=>{
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  let batches=0,delivered=0;
  const run=createPaystackReconciler({
    list:async()=>{batches++;await gate;return ['a','b'].map(reference=>({
      reference,userId:'owner',purpose:'MALVI_SUBSCRIPTION',amount:10,currency:'GHS',
    }));},
    verify:async(reference)=>({reference,status:'success',domain:'live',amount:1000,currency:'GHS'}),
    fulfil:async(order)=>{if(order.reference==='a')throw new Error('database unavailable');delivered++;},
    checked:async()=>{},report:()=>{},
  });
  const first=run();await run();release();await first;
  assert.equal(batches,1);assert.equal(delivered,1);
});

test('preview and test keys cannot start financial background writes',()=>{
  let runs=0;
  for(const [environment,key] of [['development','sk_live_fixture'],['production','sk_test_fixture'],['production',undefined]]){
    const stop=startPaystackReconciliation(async()=>{runs++;},environment,key);stop();
  }
  assert.equal(runs,0);
});
