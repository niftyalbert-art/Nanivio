import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

// Execute the actual component's polling effect with isolated timers and gateway.
const source=readFileSync(new URL('../src/components/billing/PaystackTopUpModal.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('modal.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let effect='';
function visit(node:ts.Node) {
  if(ts.isCallExpression(node)&&node.expression.getText(ast)==='React.useEffect'
    &&node.arguments[0]?.getText(ast).includes('billingClient.verifyPaystack'))
    effect=node.arguments[0].getText(ast);
  ts.forEachChild(node,visit);
}
visit(ast);
assert.ok(effect,'Actual payment polling effect must exist');
function fixture(verify:()=>Promise<any>) {
  let tick!:()=>Promise<void>,cleared=0;
  const events:any[]=[];
  const context:any={
    paymentStep:'CHECKOUT',hasOpenedCheckout:true,paystackData:{reference:'NV-PSTK-fixture'},
    billingClient:{verifyPaystack:verify},
    setInterval:(callback:()=>Promise<void>)=>{tick=callback;return 1;},
    clearInterval:()=>{cleared++;},
    setVerificationResult:(value:any)=>events.push(['verified',value]),
    setPaymentStep:(step:string)=>events.push(['step',step]),
    onSuccess:()=>events.push(['success']),
    setErrorMessage:(message:string)=>events.push(['error',message]),
    setHasOpenedCheckout:(value:boolean)=>events.push(['opened',value]),
  };
  vm.runInNewContext(ts.transpile(`globalThis.cleanup=(${effect})();`,{target:ts.ScriptTarget.ES2022}),context);
  return {tick:()=>tick(),cleanup:()=>context.cleanup(),events,cleared:()=>cleared};
}
test('checkout displays verification problems and stops automatic polling without reporting success',async()=>{
  for(const code of ['PAYMENT_VERIFICATION_UNAVAILABLE','PAYMENT_ACTIVATION_PENDING','PAYMENT_NOT_COMPLETED']){
    let calls=0;
    const f=fixture(async()=>{calls++;throw Object.assign(new Error('Keep your reference. Do not pay again.'),{code});});
    await f.tick();await f.tick();
    assert.equal(calls,1);
    assert.equal(f.cleared(),1);
    assert.deepEqual(f.events,[['error','Keep your reference. Do not pay again.'],['opened',false]]);
  }
});
test('slow verification checks cannot overlap or deliver success twice',async()=>{
  let release!:(value:any)=>void,calls=0;
  const f=fixture(()=>{calls++;return new Promise(resolve=>{release=resolve;});});
  const pending=f.tick();await f.tick();
  assert.equal(calls,1);
  release({success:true});await pending;await f.tick();
  assert.equal(calls,1);
  assert.equal(f.events.filter(e=>e[0]==='success').length,1);
});
test('an unconfirmed payment may keep polling and a later success updates the UI once',async()=>{
  let calls=0;
  const f=fixture(async()=>{
    if(++calls===1)throw Object.assign(new Error('Payment pending'),{code:'PAYMENT_PENDING'});
    return {success:true};
  });
  await f.tick();assert.equal(f.events.length,0);await f.tick();await f.tick();
  assert.equal(calls,2);
  assert.equal(f.events.filter(e=>e[0]==='success').length,1);
});
test('closing checkout ignores an in-flight result rather than updating an abandoned UI',async()=>{
  let release!:(value:any)=>void;
  const f=fixture(()=>new Promise(resolve=>{release=resolve;}));
  const pending=f.tick();f.cleanup();release({success:true});await pending;
  assert.equal(f.events.length,0);
});
