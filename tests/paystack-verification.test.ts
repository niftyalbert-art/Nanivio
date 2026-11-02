import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPaystackTransaction,PaystackVerificationError,paystackVerificationDiagnostic} from '../src/server/paystackVerification.ts';
import {createPaystackReconciler} from '../src/server/paystackReconciliation.ts';

const key='sk_live_fixture_only', reference='NV-PSTK-fixture';
function transport(response:()=>Response|Promise<Response>) {
  let calls=0;
  const fetcher:typeof fetch=async(input,options)=>{
    calls++;
    assert.equal(input,`https://api.paystack.co/transaction/verify/${reference}`);
    assert.equal(options?.method,'GET');
    assert.equal(options?.redirect,'error');
    return response();
  };
  return {fetcher,calls:()=>calls};
}
test('live lookup uses exactly one read-only GET and returns transaction details without granting benefits',async()=>{
  const transaction={reference,status:'success',domain:'live',amount:5824,currency:'GHS'};
  const f=transport(()=>Response.json({status:true,data:transaction}));
  assert.deepEqual(await verifyPaystackTransaction(reference,key,f),transaction);
  assert.equal(f.calls(),1);
});
test('missing/test credentials and malformed references make no provider requests',async()=>{
  const f=transport(()=>{throw Error('Must not call');});
  for(const invalid of [undefined,'sk_test_fixture','pk_live_fixture'])
    await assert.rejects(()=>verifyPaystackTransaction(reference,invalid,f),{code:'CONFIGURATION_ERROR'});
  await assert.rejects(()=>verifyPaystackTransaction('../private',key,f),{code:'INVALID_REFERENCE'});
  assert.equal(f.calls(),0);
});
test('upstream failures have distinct fixed codes without leaking raw messages or credentials',async()=>{
  for(const [status,code] of [[401,'AUTHORIZATION_REJECTED'],[403,'AUTHORIZATION_REJECTED'],
    [404,'REFERENCE_NOT_FOUND'],[429,'RATE_LIMITED'],[503,'PROVIDER_UNAVAILABLE'],[400,'VERIFICATION_REJECTED']] as const){
    const f=transport(()=>Response.json({status:false,message:`private-user@example.test ${key}`},{status}));
    await assert.rejects(()=>verifyPaystackTransaction(reference,key,f),(error:unknown)=>{
      assert.ok(error instanceof PaystackVerificationError);
      assert.equal(error.code,code);
      assert.deepEqual(paystackVerificationDiagnostic(error),{verificationCode:code,upstreamHttpStatus:status});
      assert.doesNotMatch(JSON.stringify(error)+error.message,/private-user|sk_live_fixture/);
      return true;
    });
    assert.equal(f.calls(),1);
  }
});
test('Paystack reference-not-found JSON is recognized even when its HTTP status is 400',async()=>{
  const f=transport(()=>Response.json({status:false,message:'Transaction reference not found'},{status:400}));
  await assert.rejects(()=>verifyPaystackTransaction(reference,key,f),{code:'REFERENCE_NOT_FOUND',upstreamHttpStatus:400});
  assert.equal(f.calls(),1);
});
test('malformed success bodies and oversized results are not confirmations',async()=>{
  for(const body of ['invalid JSON','{"status":true}','{"status":true,"data":[]}','x'.repeat(140000)]){
    const f=transport(()=>new Response(body,{status:200}));
    await assert.rejects(()=>verifyPaystackTransaction(reference,key,f),{code:'INVALID_RESPONSE'});
    assert.equal(f.calls(),1);
  }
});
test('transport errors are sanitized and never retried',async()=>{
  const f=transport(()=>{throw new Error(`private ${key}`);});
  await assert.rejects(()=>verifyPaystackTransaction(reference,key,f),(error:any)=>{
    assert.equal(error.code,'TRANSPORT_ERROR');
    assert.doesNotMatch(error.message,/private|sk_live_fixture/);
    return true;
  });
  assert.equal(f.calls(),1);
});
test('stalled response bodies close on deadline rather than leaving a recovery check running',async()=>{
  let cancelled=false;
  const f=transport(()=>new Response(new ReadableStream({cancel(){cancelled=true;}})));
  const keepAlive=setTimeout(()=>{},1500);
  try{
    await assert.rejects(()=>verifyPaystackTransaction(reference,key,{...f,timeoutMs:10}),{code:'REQUEST_TIMEOUT'});
    assert.equal(cancelled,true);
    assert.equal(f.calls(),1);
  }finally{clearTimeout(keepAlive);}
});
test('verification failures never fulfill or delete orders; a later verified payment can still recover',async()=>{
  const order={reference,userId:'fixture-owner',purpose:'MALVI_SUBSCRIPTION',amount:58.24,currency:'GHS'};
  let unavailable=true,fulfilled=0,checked=0;
  const failures:unknown[]=[];
  const f=transport(()=>unavailable?Response.json({status:false},{status:503})
    :Response.json({status:true,data:{reference,status:'success',domain:'live',amount:5824,currency:'GHS'}}));
  const run=createPaystackReconciler({
    list:async()=>[order],verify:ref=>verifyPaystackTransaction(ref,key,f),
    fulfil:async()=>{fulfilled++;},checked:async()=>{checked++;},
    report:(_ref,error)=>failures.push(paystackVerificationDiagnostic(error)),
  });
  await run();assert.equal(fulfilled,0);assert.equal(checked,1);
  assert.deepEqual(failures,[{verificationCode:'PROVIDER_UNAVAILABLE',upstreamHttpStatus:503}]);
  unavailable=false;await run();assert.equal(fulfilled,1);assert.equal(checked,2);
});
